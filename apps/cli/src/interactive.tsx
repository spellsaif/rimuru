import React, { useState, useEffect } from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import type { Flow, FlowBus, Sovereign, JsonChronicle, JsonTraceStore } from "@rimuru/core";

export interface TuiState {
  readonly sessionId: string;
  readonly workspace: string;
  readonly provider: string;
  readonly model: string;
  readonly transcript: readonly { readonly role: "user" | "assistant" | "system"; readonly content: string }[];
  readonly events: readonly Flow[];
  readonly mode: "idle" | "thinking" | "approving";
  readonly activeRune?: string;
}

export interface InteractiveTuiOptions {
  readonly sovereign: Sovereign;
  readonly flowBus: FlowBus;
  readonly chronicle: JsonChronicle;
  readonly traceStore: JsonTraceStore;
  readonly workspace: string;
  readonly sessionId: string;
  readonly provider: string;
  readonly model: string;
}

const TextInput = ({ value, onChange, onSubmit, placeholder, isDisabled }: any) => {
  useInput((input, key) => {
    if (isDisabled) return;
    if (key.return) {
      onSubmit();
      return;
    }
    if (key.backspace || key.delete) {
      onChange(value.slice(0, -1));
      return;
    }
    // If it's a normal character
    if (input && !key.ctrl && !key.meta && !key.escape) {
      onChange(value + input);
    }
  });

  return (
    <Text color={value ? "white" : "gray"}>
      {value || placeholder}
    </Text>
  );
};

const TuiApp = ({ options }: { options: InteractiveTuiOptions }) => {
  const [transcript, setTranscript] = useState<any[]>([]);
  const [events, setEvents] = useState<Flow[]>([]);
  const [inputText, setInputText] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [activeRune, setActiveRune] = useState<string | undefined>();
  const { exit } = useApp();

  useEffect(() => {
    const unlisten = options.flowBus.listen((event: Flow) => {
      setEvents((prev) => [...prev, event].slice(-10));
      if (event.type === "rune.requested") {
        setActiveRune(event.rune);
      }
      if (event.type === "rune.completed" || event.type === "rune.denied") {
        setActiveRune(undefined);
      }
    });
    return () => unlisten();
  }, [options.flowBus]);

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit();
    }
  });

  const handleSubmit = async () => {
    const prompt = inputText.trim();
    if (!prompt || isThinking) return;

    setInputText("");
    setIsThinking(true);

    const userMsg = { role: "user" as const, content: prompt };
    const assistantMsg = { role: "assistant" as const, content: "" };
    
    setTranscript((prev) => [...prev, userMsg, assistantMsg]);

    try {
      let currentContent = "";
      await options.sovereign.run({
        prompt,
        workspace: options.workspace,
        sessionId: options.sessionId,
        onText: (text) => {
          currentContent += text;
          setTranscript((prev) => {
            const next = [...prev];
            if (next.length > 0) {
              next[next.length - 1] = { role: "assistant" as const, content: currentContent };
            }
            return next;
          });
        }
      });
    } catch (e: any) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      setTranscript((prev) => [
        ...prev,
        { role: "system" as const, content: `❌ Error: ${errorMsg}` }
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <Box flexDirection="column" width={80} borderStyle="single" borderColor="cyan" padding={1}>
      {/* Title Bar */}
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color="cyan">🌌 RIMURU SOVEREIGN SESSIONS 🌌</Text>
      </Box>
      <Box justifyContent="space-between" marginBottom={1}>
        <Text gray>Session: {options.sessionId}</Text>
        <Text gray>Model: {options.model} ({options.provider})</Text>
      </Box>

      {/* Main Area (Split Chat & Events) */}
      <Box flexDirection="row" height={16} marginBottom={1}>
        {/* Chat History Panel */}
        <Box flexDirection="column" width={50} borderStyle="round" borderColor="gray" padding={1} marginRight={2}>
          <Box marginBottom={1}>
            <Text bold color="white">💬 CONVERSATION</Text>
          </Box>
          <Box flexDirection="column" flexGrow={1}>
            {transcript.length === 0 ? (
              <Text gray italic>Ask Rimuru a question to start the conversation...</Text>
            ) : (
              // Show only the last 3-4 messages to avoid terminal overflow
              transcript.slice(-4).map((msg, idx) => {
                const isUser = msg.role === "user";
                const isSystem = msg.role === "system";
                const roleLabel = isUser ? "👤 YOU" : isSystem ? "⚠️ SYSTEM" : "🌌 RIMURU";
                const roleColor = isUser ? "green" : isSystem ? "red" : "cyan";
                return (
                  <Box key={idx} flexDirection="column" marginBottom={1}>
                    <Text bold color={roleColor}>{roleLabel}:</Text>
                    <Text>{msg.content || (isThinking && idx === transcript.length - 1 ? "thinking..." : "")}</Text>
                  </Box>
                );
              })
            )}
          </Box>
        </Box>

        {/* Telemetry Events Panel */}
        <Box flexDirection="column" width={26} borderStyle="round" borderColor="yellow" padding={1}>
          <Box marginBottom={1}>
            <Text bold color="yellow">⚡ EVENTS HUD</Text>
          </Box>
          <Box flexDirection="column">
            {events.length === 0 ? (
              <Text gray italic>No events recorded yet.</Text>
            ) : (
              events.map((e, idx) => {
                const type = e.type.split(".")[1] || e.type;
                let icon = "•";
                if (e.type.startsWith("rune.")) icon = "⚡";
                else if (e.type.startsWith("run.")) icon = "🌀";
                else if (e.type === "thought.emitted") icon = "🧠";
                return (
                  <Text key={idx} wrap="truncate-end">
                    <Text color="yellow">{icon}</Text> {type.toUpperCase()}
                  </Text>
                );
              })
            )}
            {activeRune && (
              <Box marginTop={1}>
                <Text bold color="magenta">Active: {activeRune}</Text>
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      {/* Input Box */}
      <Box flexDirection="column" borderStyle="single" borderColor={isThinking ? "yellow" : "cyan"} paddingX={1}>
        <Box>
          <Text bold color={isThinking ? "yellow" : "cyan"}>
            {isThinking ? "◔ THINKING" : "❯ INPUT"}:{" "}
          </Text>
          <TextInput
            value={inputText}
            onChange={setInputText}
            onSubmit={handleSubmit}
            placeholder="Ask Rimuru something..."
            isDisabled={isThinking}
          />
        </Box>
      </Box>
      
      <Box marginTop={1}>
        <Text gray italic>Press Ctrl+C to exit.</Text>
      </Box>
    </Box>
  );
};

export async function runInteractiveTui(options: InteractiveTuiOptions): Promise<void> {
  const { waitUntilExit } = render(<TuiApp options={options} />);
  await waitUntilExit();
}

export async function promptApproval(question: string): Promise<boolean> {
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}
