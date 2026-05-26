import { spawnSync } from "node:child_process";
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
  readonly input?: any;
  readonly output?: any;
}

export async function runInteractiveTui(options: InteractiveTuiOptions): Promise<void> {
  // 1. Cross-Runtime Check & Respawn under Bun
  if (!process.versions.bun) {
    try {
      const hasBun = spawnSync("bun", ["-v"], { stdio: "ignore" }).status === 0;
      if (hasBun) {
        const result = spawnSync("bun", [process.argv[1], ...process.argv.slice(2)], { stdio: "inherit" });
        process.exit(result.status ?? 0);
      }
    } catch {}
    
    console.error("\x1b[31m\n❌ Error: The OpenTUI chat interface requires Bun.js for high-performance terminal rendering.\nPlease install Bun (https://bun.sh) and try again.\n\x1b[0m");
    process.exit(1);
  }

  // 2. Lazy Import of OpenTUI core to prevent load-time FFI crashes on Node.js
  const { createCliRenderer, Box, Text, Markdown, Input, SyntaxStyle } = await import("@opentui/core");

  // 3. Initialize State
  let state: TuiState = {
    sessionId: options.sessionId,
    workspace: options.workspace,
    provider: options.provider,
    model: options.model,
    transcript: [],
    events: [],
    mode: "idle"
  };

  // 4. Initialize OpenTUI CliRenderer
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    targetFps: 30
  });

  // 5. Create UI Components
  const titleText = Text({
    content: `Session: ${state.sessionId} (${state.model})`
  });
  
  const titleBar = Box({
    height: 3,
    width: "100%",
    border: true,
    borderStyle: "single",
    borderColor: "cyan",
    title: " RIMURU SESSIONS ",
    paddingX: 1,
    alignItems: "center",
    justifyContent: "center"
  }, titleText);

  const chatMarkdown = Markdown({
    content: "# Chat History\nWaiting for conversation...",
    syntaxStyle: SyntaxStyle.create(),
    width: "100%",
    height: "100%"
  });

  const chatBox = Box({
    flexGrow: 2,
    height: "100%",
    border: true,
    borderStyle: "single",
    borderColor: "gray",
    title: " CONVERSATION ",
    padding: 1
  }, chatMarkdown);

  const hudText = Text({
    content: "No events recorded yet."
  });

  const hudBox = Box({
    width: 32,
    height: "100%",
    border: true,
    borderStyle: "single",
    borderColor: "yellow",
    title: " EVENTS HUD ",
    padding: 1,
    marginLeft: 1
  }, hudText);

  const middleContainer = Box({
    flexDirection: "row",
    flexGrow: 1,
    width: "100%",
    marginY: 1
  }, chatBox, hudBox);

  const inputField = Input({
    placeholder: "Ask Rimuru something...",
    width: "100%",
    height: 1,
    focusable: true
  });

  const footerBox = Box({
    height: 3,
    width: "100%",
    border: true,
    borderStyle: "single",
    borderColor: "cyan",
    title: " ❯ INPUT ",
    paddingX: 1
  }, inputField);

  const rootContainer = Box({
    flexDirection: "column",
    width: "100%",
    height: "100%",
    padding: 1
  }, titleBar, middleContainer, footerBox);

  renderer.root.add(rootContainer);
  inputField.focus();

  // 6. Update functions
  const updateChatMarkdown = () => {
    let markdown = "";
    for (const msg of state.transcript) {
      const header = msg.role === "user" ? "### 👤 YOU" : msg.role === "system" ? "### ⚠️ SYSTEM" : "### 🌌 RIMURU";
      markdown += `${header}\n${msg.content}\n\n`;
    }
    chatMarkdown.content = markdown || "# Chat Session\nAsk Rimuru a question to start the conversation.";
  };

  const updateEventsHUD = () => {
    if (state.events.length === 0) {
      hudText.content = "No events recorded yet.";
      return;
    }
    let hudContent = "";
    for (const e of state.events.slice(-10)) {
      const type = e.type.split(".")[1] || e.type;
      let icon = "•";
      if (e.type.startsWith("rune.")) icon = "⚡";
      else if (e.type.startsWith("run.")) icon = "🌀";
      else if (e.type === "thought.emitted") icon = "🧠";
      
      hudContent += `${icon} ${type.toUpperCase()}\n`;
    }
    hudText.content = hudContent;
  };

  // 7. Hook up FlowBus events
  const unlisten = options.flowBus.listen((event) => {
    state = { ...state, events: [...state.events, event].slice(-20) };
    if (event.type === "rune.requested") state = { ...state, activeRune: event.rune };
    if (event.type === "rune.completed" || event.type === "rune.denied") state = { ...state, activeRune: undefined };
    updateEventsHUD();
  });

  // 8. Handle user input submission
  let isThinking = false;
  inputField.on("enter", async () => {
    if (isThinking) return;
    const prompt = inputField.value.trim();
    if (!prompt) return;

    isThinking = true;
    inputField.value = "";
    inputField.placeholder = "Rimuru is thinking...";
    footerBox.title = " ◔ THINKING ";
    footerBox.borderColor = "yellow";
    
    state = {
      ...state,
      transcript: [...state.transcript, { role: "user", content: prompt }, { role: "assistant", content: "" }]
    };
    updateChatMarkdown();

    try {
      const assistantIdx = state.transcript.length - 1;
      await options.sovereign.run({
        prompt,
        workspace: state.workspace,
        sessionId: state.sessionId,
        onText: (text) => {
          const transcript = [...state.transcript];
          const current = transcript[assistantIdx];
          transcript[assistantIdx] = { role: "assistant", content: (current?.content ?? "") + text };
          state = { ...state, transcript };
          updateChatMarkdown();
        }
      });
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      state = {
        ...state,
        transcript: [...state.transcript, { role: "system", content: `❌ Error: ${errorMsg}` }]
      };
      updateChatMarkdown();
    } finally {
      isThinking = false;
      inputField.placeholder = "Ask Rimuru something...";
      footerBox.title = " ❯ INPUT ";
      footerBox.borderColor = "cyan";
      inputField.focus();
    }
  });

  // Handle manual Ctrl+C clean exit
  renderer.keyInput.on("keypress", (keyEvent) => {
    if (keyEvent.ctrl && keyEvent.name === "c") {
      cleanup();
      process.exit(0);
    }
  });

  const cleanup = () => {
    unlisten();
    renderer.destroy();
  };

  // Start renderer
  renderer.start();
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
