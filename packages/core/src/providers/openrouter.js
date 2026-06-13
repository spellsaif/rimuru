export class OpenRouterShard {
    name = "openrouter";
    #baseUrl;
    #apiKey;
    #model;
    #fetch;
    constructor(options) {
        this.#baseUrl = (options.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
        this.#apiKey = options.apiKey;
        this.#model = options.model;
        this.#fetch = options.fetchImpl ?? fetch;
    }
    async #fetchWithRetry(url, init, maxRetries = 3) {
        for (let i = 0; i <= maxRetries; i++) {
            const response = await this.#fetch(url, init);
            if (response.status !== 429 || i === maxRetries)
                return response;
            const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
            process.stdout.write(`\n\x1b[90m[provider] Rate limited by OpenRouter (429). Retrying in ${Math.round(delay / 1000)}s...\x1b[0m\n`);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
        throw new Error("Unreachable");
    }
    async complete(messages, options) {
        const payloadTools = options?.tools && options.tools.length > 0
            ? options.tools.map((t) => ({
                type: "function",
                function: {
                    name: t.name,
                    description: t.description,
                    parameters: t.inputSchema ?? { type: "object", properties: {} },
                },
            }))
            : undefined;
        const response = await this.#fetchWithRetry(`${this.#baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${this.#apiKey}`,
                "HTTP-Referer": "https://github.com/google/rimuru",
                "X-Title": "Rimuru AI Assistant",
            },
            body: JSON.stringify({
                model: this.#model,
                messages: messages.map((m) => toChatMessage(m, this.#model)),
                stream: false,
                ...(payloadTools ? { tools: payloadTools } : {}),
            }),
        });
        if (!response.ok) {
            throw new Error(`OpenRouter request failed: ${response.status} ${await response.text()}`);
        }
        const payload = (await response.json());
        const choice = payload.choices?.[0]?.message;
        const toolCalls = [];
        if (choice?.tool_calls) {
            for (const tc of choice.tool_calls) {
                if (tc.type === "function" && tc.function) {
                    let args = {};
                    try {
                        args = JSON.parse(tc.function.arguments ?? "{}");
                    }
                    catch {
                        // ignore
                    }
                    toolCalls.push({
                        id: tc.id,
                        name: tc.function.name,
                        arguments: args,
                    });
                }
            }
        }
        return {
            content: choice?.content ?? "",
            ...(toolCalls.length > 0 ? { toolCalls } : {}),
            ...(payload.usage ? { usage: toUsage(payload.usage) } : {}),
        };
    }
    async *stream(messages, options) {
        const payloadTools = options?.tools && options.tools.length > 0
            ? options.tools.map((t) => ({
                type: "function",
                function: {
                    name: t.name,
                    description: t.description,
                    parameters: t.inputSchema ?? { type: "object", properties: {} },
                },
            }))
            : undefined;
        const response = await this.#fetchWithRetry(`${this.#baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${this.#apiKey}`,
                "HTTP-Referer": "https://github.com/google/rimuru",
                "X-Title": "Rimuru AI Assistant",
            },
            body: JSON.stringify({
                model: this.#model,
                messages: messages.map((m) => toChatMessage(m, this.#model)),
                stream: true,
                stream_options: { include_usage: true },
                ...(payloadTools ? { tools: payloadTools } : {}),
            }),
        });
        if (!response.ok) {
            throw new Error(`OpenRouter stream failed: ${response.status} ${await response.text()}`);
        }
        if (!response.body)
            throw new Error("OpenRouter stream failed: missing response body");
        const accumulatedToolCalls = new Map();
        for await (const event of parseSse(response.body)) {
            if (event === "[DONE]")
                break;
            let payload;
            try {
                payload = JSON.parse(event);
            }
            catch {
                continue;
            }
            const text = payload.choices?.[0]?.delta.content;
            if (text)
                yield { type: "text", text };
            const toolCallsDelta = payload.choices?.[0]?.delta?.tool_calls;
            if (toolCallsDelta) {
                for (const tc of toolCallsDelta) {
                    const idx = tc.index;
                    if (!accumulatedToolCalls.has(idx)) {
                        accumulatedToolCalls.set(idx, { arguments: "" });
                    }
                    const entry = accumulatedToolCalls.get(idx);
                    if (tc.id)
                        entry.id = tc.id;
                    if (tc.function?.name)
                        entry.name = tc.function.name;
                    if (tc.function?.arguments)
                        entry.arguments += tc.function.arguments;
                }
            }
            if (payload.usage)
                yield { type: "usage", usage: toUsage(payload.usage) };
        }
        const finalToolCalls = [];
        for (const [_, entry] of accumulatedToolCalls.entries()) {
            if (entry.name) {
                let args = {};
                try {
                    args = JSON.parse(entry.arguments || "{}");
                }
                catch {
                    // ignore
                }
                finalToolCalls.push({
                    id: entry.id ?? `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    name: entry.name,
                    arguments: args,
                });
            }
        }
        if (finalToolCalls.length > 0) {
            yield { type: "tool_calls", toolCalls: finalToolCalls };
        }
        yield { type: "done" };
    }
}
async function* parseSse(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
            const raw = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const data = raw
                .split("\n")
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).trim())
                .join("\n");
            if (data)
                yield data;
            boundary = buffer.indexOf("\n\n");
        }
    }
}
function toChatMessage(message, model) {
    if (message.role === "tool") {
        return {
            role: "tool",
            tool_call_id: message.toolCallId,
            content: message.content,
        };
    }
    let role = message.role;
    if (role === "system" && (model.includes("gemma") || model.includes("o1-") || model.includes("o3-"))) {
        role = "user";
    }
    const result = {
        role,
        content: message.content,
    };
    if (message.toolCalls && message.toolCalls.length > 0) {
        result.tool_calls = message.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: {
                name: tc.name,
                arguments: JSON.stringify(tc.arguments),
            },
        }));
    }
    return result;
}
function toUsage(usage) {
    return {
        input: usage.prompt_tokens ?? 0,
        output: usage.completion_tokens ?? 0,
    };
}
//# sourceMappingURL=openrouter.js.map