import React, { useState, useEffect } from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import { Flow, FlowBus, Sovereign, JsonChronicle, JsonTraceStore, AgentLoop, RuneRegistry } from "@rimuru/core";

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
  readonly runes: RuneRegistry;
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

const useTerminalSize = () => {
  const [size, setSize] = useState({
    columns: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  });

  useEffect(() => {
    const handleResize = () => {
      setSize({
        columns: process.stdout.columns || 80,
        rows: process.stdout.rows || 24,
      });
    };

    process.stdout.on("resize", handleResize);
    return () => {
      process.stdout.off("resize", handleResize);
    };
  }, []);

  return size;
};

const TuiApp = ({ options }: { options: InteractiveTuiOptions }) => {
  const { columns, rows } = useTerminalSize();
  const [transcript, setTranscript] = useState<any[]>([]);
  const [events, setEvents] = useState<Flow[]>([]);
  const [inputText, setInputText] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [activeRune, setActiveRune] = useState<string | undefined>();
  const [scrollOffset, setScrollOffset] = useState(0);
  const { exit } = useApp();

  useEffect(() => {
    const unlisten = options.flowBus.listen((event: Flow) => {
      setEvents((prev) => [...prev, event].slice(-100));
      if (event.type === "rune.requested") {
        setActiveRune(event.rune);
      }
      if (event.type === "rune.completed" || event.type === "rune.denied") {
        setActiveRune(undefined);
      }
    });
    return () => unlisten();
  }, [options.flowBus]);

  // Outer dimensions
  const outerWidth = Math.max(40, columns - 2);
  const outerHeight = Math.max(10, rows - 2);

  // Overhead calculation:
  // Title bar: 2 rows
  // Status line: 2 rows
  // Input pane: 3 rows
  // Footer help: 2 rows
  // Borders & padding: 4 rows
  // Total = 13 rows
  const mainHeight = Math.max(4, outerHeight - 13);

  // Proportional widths
  const telemetryWidth = Math.max(20, Math.floor(outerWidth * 0.3));
  const chatWidth = Math.max(20, outerWidth - telemetryWidth - 3);

  // Transcript slice logic
  // Estimate ~3.5 lines per message (header + content + spacing)
  const maxMessages = Math.max(3, Math.floor(mainHeight / 3.5));

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit();
    }
    if (key.upArrow) {
      setScrollOffset((prev) => Math.max(0, prev - 1));
    }
    if (key.downArrow) {
      setScrollOffset((prev) =>
        Math.min(Math.max(0, transcript.length - maxMessages), prev + 1)
      );
    }
  });

  const handleSubmit = async () => {
    const prompt = inputText.trim();
    if (!prompt || isThinking) return;

    setInputText("");
    setIsThinking(true);

    const userMsg = { role: "user" as const, content: prompt };
    const assistantMsg = { role: "assistant" as const, content: "" };
    
    setTranscript((prev) => {
      const next = [...prev, userMsg, assistantMsg];
      setScrollOffset(Math.max(0, next.length - maxMessages));
      return next;
    });

    try {
      let currentContent = "";
      const loop = new AgentLoop({
        sovereign: options.sovereign,
        runes: options.runes,
        workspace: options.workspace,
        sessionId: options.sessionId,
        flowBus: options.flowBus,
        audit: true,
        chronicle: options.chronicle
      });
      await loop.run(prompt, (text) => {
        currentContent += text;
        setTranscript((prev) => {
          const next = [...prev];
          if (next.length > 0) {
            next[next.length - 1] = { role: "assistant" as const, content: currentContent };
          }
          setScrollOffset(Math.max(0, next.length - maxMessages));
          return next;
        });
      });
    } catch (e: any) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      setTranscript((prev) => {
        const next = [
          ...prev,
          { role: "system" as const, content: `❌ Error: ${errorMsg}` }
        ];
        setScrollOffset(Math.max(0, next.length - maxMessages));
        return next;
      });
    } finally {
      setIsThinking(false);
    }
  };

  const visibleTranscript = transcript.slice(scrollOffset, scrollOffset + maxMessages);

  // Fit events inside the events panel height (accounting for header & padding)
  const maxEvents = Math.max(2, mainHeight - 4);
  const visibleEvents = events.slice(-maxEvents);

  const showScrollUp = scrollOffset > 0;
  const showScrollDown = scrollOffset < transcript.length - maxMessages;

  const formatMessageContent = (content: string, isThinkingMessage: boolean) => {
    if (!content) {
      return isThinkingMessage ? (
        <Text color="yellow" italic>Thinking...</Text>
      ) : (
        <Text color="gray" italic>(no response)</Text>
      );
    }
    const lines = content.split("\n");
    return (
      <Box flexDirection="column">
        {lines.map((line, idx) => {
          const cleanLine = line.replace(/\u001b\[[0-9;]*m/g, "").trim();
          if (cleanLine.startsWith("Thought:")) {
            return (
              <Text key={idx} color="gray" italic>
                🧠 {cleanLine.slice(8).trim()}
              </Text>
            );
          }
          if (cleanLine.startsWith("Invoke:")) {
            return (
              <Text key={idx} color="cyan" bold>
                ⚡ {cleanLine.slice(7).trim()}
              </Text>
            );
          }
          return <Text key={idx} color="white">{line}</Text>;
        })}
      </Box>
    );
  };

  return (
    <Box flexDirection="column" width={outerWidth} height={outerHeight} borderStyle="single" borderColor="magenta" padding={1}>
      {/* Title Bar */}
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color="magenta">🌌 RIMURU SOVEREIGN TERMINAL 🌌</Text>
      </Box>
      <Box justifyContent="space-between" marginBottom={1}>
        <Text gray>Session: <Text color="white" bold>{options.sessionId}</Text></Text>
        <Text gray>Model: <Text color="yellow" bold>{options.model}</Text> (<Text color="cyan">{options.provider}</Text>)</Text>
      </Box>

      {/* Main Area (Split Chat & Events) */}
      <Box flexDirection="row" height={mainHeight} marginBottom={1}>
        {/* Chat History Panel */}
        <Box flexDirection="column" width={chatWidth} borderStyle="round" borderColor="emerald" padding={1} marginRight={2}>
          <Box marginBottom={1}>
            <Text bold color="emerald">💬 CONVERSATION HUB</Text>
          </Box>
          <Box flexDirection="column" flexGrow={1}>
            {showScrollUp && (
              <Box alignSelf="center" marginBottom={1}>
                <Text color="cyan" bold>▲ {scrollOffset} older messages (Press Up Arrow) ▲</Text>
              </Box>
            )}
            
            {transcript.length === 0 ? (
              <Text gray italic>Ask Rimuru a question to start the conversation...</Text>
            ) : (
              visibleTranscript.map((msg, idx) => {
                const isUser = msg.role === "user";
                const isSystem = msg.role === "system";
                const roleLabel = isUser ? "👤 YOU" : isSystem ? "🚨 SYSTEM" : "✨ RIMURU";
                const roleColor = isUser ? "green" : isSystem ? "red" : "magenta";
                const isThinkingMessage = isThinking && (scrollOffset + idx) === transcript.length - 1;
                return (
                  <Box key={idx} flexDirection="column" marginBottom={1}>
                    <Text bold color={roleColor}>{roleLabel}:</Text>
                    {isUser ? (
                      <Text color="white">{msg.content}</Text>
                    ) : (
                      formatMessageContent(msg.content, isThinkingMessage)
                    )}
                  </Box>
                );
              })
            )}

            {showScrollDown && (
              <Box alignSelf="center" marginTop={1}>
                <Text color="cyan" bold>▼ {transcript.length - maxMessages - scrollOffset} newer messages (Press Down Arrow) ▼</Text>
              </Box>
            )}
          </Box>
        </Box>

        {/* Telemetry Events Panel */}
        <Box flexDirection="column" width={telemetryWidth} borderStyle="round" borderColor="yellow" padding={1}>
          <Box marginBottom={1}>
            <Text bold color="yellow">📡 TELEMETRY HUB</Text>
          </Box>
          
          {/* Diagnostic Stats */}
          <Box flexDirection="column" marginBottom={1}>
            <Text gray>Status: {isThinking ? <Text color="yellow" bold>● THINKING</Text> : <Text color="green" bold>○ IDLE</Text>}</Text>
            <Text gray>Runes: <Text color="cyan">{options.runes.list().length} loaded</Text></Text>
            {activeRune && <Text gray>Running: <Text color="magenta" bold>{activeRune}</Text></Text>}
          </Box>
          
          <Box borderStyle="single" borderColor="gray" borderDim={true} marginBottom={1} />

          <Box flexDirection="column" flexGrow={1}>
            {events.length === 0 ? (
              <Text gray italic>No events recorded yet.</Text>
            ) : (
              visibleEvents.map((e, idx) => {
                const type = e.type.split(".")[1] || e.type;
                let icon = "•";
                let labelColor = "gray";
                if (e.type.startsWith("rune.")) {
                  icon = "⚡";
                  labelColor = "magenta";
                } else if (e.type.startsWith("run.")) {
                  icon = "🌀";
                  labelColor = "green";
                } else if (e.type === "thought.emitted") {
                  icon = "🧠";
                  labelColor = "yellow";
                } else if (e.type.startsWith("provider.")) {
                  icon = "📡";
                  labelColor = "cyan";
                }
                return (
                  <Text key={idx} wrap="truncate-end">
                    <Text color={labelColor}>{icon} {type.toUpperCase()}</Text>
                  </Text>
                );
              })
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
      
      <Box marginTop={1} justifyContent="center">
        <Text gray italic>Ctrl+C Exit | Up/Down Arrow Scroll | Enter Submit</Text>
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
