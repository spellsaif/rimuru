# 🌌 Rimuru: The Sovereign, Local-First AI Orchestration Kernel

> **"Privacy is a human right. Sovereignty is a technical choice."**

```ascii
     ____  ____ __  ________  ____  __ 
    / __ \/  _/  |/  / __ / / / / / / 
   / /_/ // // /|_/ / /_/ / / / / / /  
  / _, _// // /  / / _, _/ /_/ /_/ /   
 /_/ |_/___/_/  /_/_/ |_|\____/\____/ 
                                       
```

Welcome to **Rimuru**, a secure, local-first AI assistant runtime and orchestration kernel engineered for maximum **Sovereignty, Auditability, and Security**. 

Unlike modern AI solutions that force you into *digital feudalism*—streaming your source code, private thoughts, and sensitive credentials to remote cloud servers—Rimuru brings the intelligence to your data. It runs entirely on your local machine, isolates third-party code in secure sandboxes, and verifies every tool execution against a decentralized, consensus-based permission system.

---

## 🏛️ I. Architectural Pillars

### 1. Zero-Trust Autonomous Containment
The AI model is a guest in your workspace. Rimuru enforces a strict isolation boundary between the model's desires and your physical operating system. Every filesystem read/write, terminal command, or network query must be explicitly permitted by user-defined constraints and executed in isolated sandboxes:
* **QuickJS JavaScript VM**: Lightweight sandboxing for transpiled TypeScript and JavaScript scripts.
* **WASI Process Containment**: Highly isolated WebAssembly System Interface execution for compiled binaries (e.g., Rust).
* **Docker Container Isolation**: Full operating system and dependency virtualization for untrusted system-level operations.

### 2. Speculative Timeline Branching (CoW)
Instead of executing mutating actions blindly, Rimuru spawns lightweight **copy-on-write (CoW) workspace branches** in milliseconds. Speculative runners test modifications, verify compilation and test suites, and merge changes back to the master branch *only* upon successful validation.

### 3. Dynamic Tool Synthesis Engine (Runes)
Faced with complex operations, Rimuru dynamically designs, compiles, and loads its own local tools (Runes). It transpiles TypeScript programmatically or compiles Rust source code to `.wasm` binaries targeting `wasm32-wasip1`, loading and executing them safely in a sandboxed environment.

### 4. OS Keychain & Cryptographic Vault
Credentials remain strictly invisible to the LLM. Rimuru stores keys encrypted with AES-256-GCM, automatically query-binding decryption keys from your OS secure keychain via Linux `secret-tool` / dbus-keyrings, removing fallback exposure risks.

---

## 🏗️ II. System Architecture Blueprint

```ascii
┌─────────────────────────────────────────────────────────────┐
│                 COMMUNICATION LAYER (CIRCLES)               │
│   ┌───────────┐    ┌───────────┐    ┌───────────┐           │
│   │ WhatsApp  │    │  Slack    │    │ Telegram  │           │
│   └─────┬─────┘    └─────┬─────┘    └─────┬─────┘           │
└─────────┼────────────────┼────────────────┼─────────────────┘
          │                │                │ (Webhooks & FFI)
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────┐
│                 THE GATE (SOVEREIGN GATEWAY)                │
│    Pairing & Encryption  •  SSE Streaming  •  API Server    │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 SOVEREIGN KERNEL (THE CORE)                 │
│   Reasoning Loop  •  Planning  •  Memory Indexing  •  Flow  │
└─────┬────────────────────────┬────────────────────────┬─────┘
      │                        │                        │
┌─────▼────────┐        ┌──────▼───────┐        ┌───────▼─────┐
│    SHARDS    │        │  CHRONICLE   │        │    RUNES    │
│ LLM Adapters │        │ Session Hist │        │ Gated Tools │
└─────┬────────┘        └──────┬───────┘        └───────┬─────┘
      │                        │                        │
      ▼                        ▼                        ▼
┌─────────────────────────────────────────────────────────────┐
│            LOCAL SANDBOXES, WORKSPACE & VAULT               │
│   QuickJS WASM VM  •  WASI Sandbox  •  AES-256 Secrets      │
└─────────────────────────────────────────────────────────────┘
```

---

## 📖 III. The Grand Dictionary

| Term | Technical Definition |
| :--- | :--- |
| **Sovereign** | The central reasoning kernel running the thought-plan-act loop. |
| **Shard** | An adapter connecting Rimuru to LLM backends (Ollama, Gemini, Anthropic, OpenAI, OpenRouter). |
| **Rune** | A permission-gated local tool contract (e.g. `workspace.readFile`, `workspace.shell`, or custom scripts). |
| **Vow** | The specific risk categories (`read`, `write`, `execute`, `network`) granted to a Vessel. |
| **Vessel** | A concrete runtime agent instance configured with a Shard and specific Vows. |
| **Soul** | The system prompts and personality definitions located in configurations. |
| **Chronicle** | The locally indexed session conversation logs and memory store. |
| **Vault** | The AES-256 encrypted hardware secret manager storing workspace API keys. |
| **Circle** | An event-driven bridge adapter translating external payloads (WhatsApp, Slack, Discord, custom webhooks) to Flow messages. |
| **Barrier** | The security containment level of the runtime (`none`, `readonly`, or `docker`). |

---

## 🛡️ IV. Hardened Security & Optimization

* **WASI Output Redirection**: Captures and routes standard output/standard error for custom compiled WASI `.wasm` tools via temporary file descriptor redirection.
* **Fail-Closed Gatekeeper**: Webhook endpoints enforce mandatory HMAC-SHA256 (Slack) and Ed25519 (Discord) signature verification, failing secure with `401 Unauthorized` if validation keys are missing.
* **Context Cache Optimization**: The agent reasoning engine maintains continuous, stateful execution sessions, avoiding token scaling and maximizing LLM prompt-caching.
* **Longest Common Subsequence (LCS) Diff**: Computes and previews workspace edits with Myers-style LCS DP diffing to prevent line-shift cascades.

---

## 🚀 V. Getting Started & Setup

### 📦 1. Installation & Build

Ensure you have [pnpm](https://pnpm.io/) installed.

```bash
# Clone the repository
git clone https://github.com/your-username/rimuru.git
cd rimuru

# Install dependencies and build the workspace
pnpm install
pnpm build
```

To link the CLI globally during development:
```bash
cd apps/cli
pnpm link --global
```

### 🔮 2. Awakening the Sovereign (Setup)

Initialize your local workspace using the interactive setup wizard:

```bash
# Runs the interactive onboarding wizard
rimuru setup
```
*(Alternative aliases: `rimuru init`, `rimuru awaken`)*

The wizard guides you through configuring your **LLM Shard**, choosing your sandbox **Barrier** (`none`, `readonly`, `docker`), and selecting allowed **Vows**. It writes the resulting options to `rimuru.config.json`.

### 🔑 3. Fortifying the Vault

Configure your API keys in the local encrypted storage vault. The vault encrypts keys with AES-256-GCM and integrates directly with your system keychain to keep keys out of plain text config files:

```bash
# Store keys securely
rimuru vault set OPENROUTER_API_KEY <your-api-key>
rimuru vault set GEMINI_API_KEY <your-api-key>
rimuru vault set ANTHROPIC_API_KEY <your-api-key>

# Retrieve a secret
rimuru vault get GEMINI_API_KEY

# List active vault entries (keys only, values remain secret)
rimuru vault list

# Delete a secret
rimuru vault delete GEMINI_API_KEY
```

---

## 💬 VI. Usage & Interactive Interfaces

Rimuru provides multiple ways to interact with the Sovereign kernel, ranging from terminal clients to full visual canvases and external webhooks.

### 🖥️ 1. Interactive TUI (OpenTUI Split-Pane)
Launch the beautiful split-pane terminal client driven by Ink, allowing real-time inspection of thoughts, planning steps, and command output alongside your chat:
```bash
rimuru chat
# or directly launch the TUI shell:
rimuru tui
```

### 🌍 2. The Web Visual Canvas
Access the graphical canvas panel with iframe live previews:
```bash
# Start Turborepo dev servers (runs the web dashboard)
pnpm dev
```
Open your browser to `http://localhost:19711` to interact with the visual editor and review generated files.

### 🔌 3. Webhook Gate Server
Manage incoming message bridges from Slack, Discord, WhatsApp, or custom webhooks:
```bash
# Start the HTTP/SSE Gateway server
rimuru gate start
```

### 🗓️ 4. Scheduling Rituals
Automate background operations, periodic health checks, or scheduled reports:
```bash
# Create a ritual running every 60 minutes
rimuru ritual create check-health "Verify if services in the workspace are healthy" --every 60

# List registered rituals
rimuru ritual list

# Toggle/Disable a ritual
rimuru ritual disable check-health
```

---

## 🛠️ VII. CLI Command Reference

Execute `rimuru --help` to view all parameters. Below is the complete manifest of commands:

| Command | Description | Common Arguments / Flags |
| :--- | :--- | :--- |
| `chat [prompt...]` | Starts interactive TUI or runs a one-off prompt. | `rimuru chat "Refactor index.ts"` |
| `setup` | Runs the setup wizard to initialize configuration. | Aliases: `init`, `awaken` |
| `doctor` | Runs health checks and environment diagnostics. | `--json` (format output), `--fix` (auto-fix warnings) |
| `vault` | Manages encrypted secrets. | `list`, `set <name> <value>`, `get <name>`, `delete <name>` |
| `rune [args...]` | Invokes a policy-guarded tool directly from the CLI. | `rimuru rune custom.my_tool '{"arg": 1}'` |
| `ritual [args...]` | Schedules background tasks. | `list`, `create <id> <prompt> --every <mins>`, `enable <id>`, `delete <id>` |
| `agent [objective...]`| Runs a goal-oriented autonomous loop. | `rimuru agent "Fix all failing tests in the test suite"` |
| `canvas` | Manages workspace artifacts. | `rimuru canvas list` |
| `gate` | Starts the webhook SSE server. | `start` |
| `session` | Manages active session identities. | Aliases: `soul` |
| `vessel` | Lists or describes active reasoning agents. | `rimuru vessel list` |
| `memory` | Manages long-term chronicle/semantic memory. | Aliases: `chronicle` |
| `trace` | Replays or inspects execution traces. | Aliases: `sage` |
| `plugin` | Manages plugin packages. | Aliases: `skill` |
| `mcp` | Serves tools over Model Context Protocol. | `rimuru mcp start` |
| `provider` | Configures connections to LLM adapters. | `list`, `current` |
| `channel` | Configures external chat circle adapters. | `add <slack\|discord\|telegram\|whatsapp>`, `list` |
| `pairing` | Approves or rejects remote clients. | `rimuru pairing list` |
| `config` | Modifies configuration variables. | Aliases: `settings` |
| `dashboard` | Opens the graphical Sovereign Dashboard. | Aliases: `ui`, `dash` |
| `flow` | Streams real-time kernel telemetry logs. | Aliases: `loop` |
| `index` | Indexes codebase logic and keywords. | `rimuru index --rebuild` |
| `rollback` | Rolls back file modifications to a clean state. | Aliases: `rewind` |
| `approval` | Manages pending user confirmations. | Aliases: `pact` |
| `policy` | Edits security rules and capability policies. | Aliases: `vow` |

---

## 🧪 VIII. Creating Cool Runes

Runes are custom tools compiled on the fly. Rimuru supports compiling **TypeScript** scripts and **Rust** source code dynamically.

> [!IMPORTANT]
> ### 💡 The Sandbox Compilation Rules
> 1. **TypeScript (`typescript`)**:
>    * **Runtime**: Executed in a secure **QuickJS JavaScript Virtual Machine** inside the node process.
>    * **Wasm Warning**: TS is transpiled to ESNext JavaScript, **NOT** compiled to WebAssembly (WASM).
>    * **Ergonomics**: Do **NOT** write AssemblyScript, manual memory management (`malloc`), pointer indexing, or FFI wrappers. Simply write standard JavaScript/TypeScript.
>    * **Function Name**: Export a function whose name matches the Rune's name. It takes an `input` object and returns the result.
> 2. **Rust (`rust`)**:
>    * **Runtime**: Compiled to `wasm32-wasip1` using `rustc` and executed inside an isolated WASI sandbox.
>    * **Requirements**: Must include a `fn main()` entry point. Reads input from `stdin` as a JSON string, and writes output to `stdout`.

### 1. Creating a TypeScript Rune

Write a TypeScript script to print ASCII anime faces (e.g., in a file `print_face.ts`):

```typescript
// Define the input shape matching the inputSchema
export function print_face(input: { character: string }): string {
  const faces: Record<string, string> = {
    rem: `
   ／￣￣＼
  /  ●   ●  \\
 |     ▽     |
  \\  \\___/  /
   \\_______/`,
    goku: `
  /\\_/\\
 ( o.o )
  > ^ <`,
  };

  const name = input.character.toLowerCase();
  return faces[name] || "(•‿•) (Anime face not found!)";
}
```

To compile and register this Rune, invoke `workspace.compileRune` via the CLI or ask the chat agent to create it:
```bash
rimuru rune workspace.compileRune '{
  "language": "typescript",
  "name": "print_face",
  "description": "Prints a custom ASCII anime face",
  "risk": "read",
  "sourceCode": "export function print_face(input) { const faces = { rem: \"\\n   ／￣￣＼\\n  /  ●   ●  \\\\\\n |     ▽     |\\n  \\\\  \\\\___/  /\\n   \\\\_______/\", goku: \"\\n  /\\\\_/\\\\\\n ( o.o )\\n  > ^ <\" }; return faces[input.character.toLowerCase()] || \"(•‿•)\"; }",
  "inputSchema": {
    "type": "object",
    "properties": {
      "character": { "type": "string" }
    },
    "required": ["character"]
  }
}'
```

Once compiled, it resides under `.rimuru/runes/print_face.js`. You can call it anytime:
```bash
rimuru rune custom.print_face '{"character": "rem"}'
```

### 2. Creating a Rust Rune

Write a Rust program that handles JSON input via `stdin` and writes output via `stdout`:

```rust
use serde::{Deserialize, Serialize};
use std::io::{self, Read};

#[derive(Deserialize)]
struct Input {
    name: String,
}

#[derive(Serialize)]
struct Output {
    message: String,
}

fn main() {
    let mut buffer = String::new();
    io::stdin().read_to_string(&mut buffer).unwrap();
    
    let input: Input = serde_json::from_str(&buffer).unwrap_or(Input {
        name: "World".to_string(),
    });

    let output = Output {
        message: format!("Hello, {}! This is safe sandboxed WASI Rust.", input.name),
    };

    println!("{}", serde_json::to_string(&output).unwrap());
}
```

Compile the Rust code (the kernel compiles it to a WebAssembly module targeting WASI under `.rimuru/runes/hello_rust.wasm`) and invoke it:
```bash
rimuru rune custom.hello_rust '{"name": "Sovereign"}'
```

---

## 🌌 IX. Real-World Use Cases

1. **Autonomous Speculative Code Fixing**:
   Run `rimuru agent "Fix failing tests in tests/workspace.test.ts"`. The kernel forks your repository timeline into a copy-on-write branch, runs tests, inspects failures, modifies files, compiles code, runs lint, and only prompts you to merge (rollback or approval commands) once tests pass.
2. **Sovereign Circle Assistant**:
   Connect your workspace to Slack or WhatsApp circles. Set up rules restricting the agent's Vows to `read` or `write` under `docker` barriers. You can message your agent from your phone to start builds, fetch documentation, or run diagnostic tasks without exposing your host machine.
3. **Dynamic API & Query Building**:
   Ask the assistant to parse a complex database schema and write a custom tool (Rune) to execute queries. The assistant compiles a TypeScript database runner on the fly, registers it, and uses it to answer your questions safely.

---

## ⚖️ X. Respectful Comparison: Rimuru vs. Hermes vs. OpenClaw

To understand how Rimuru contrasts with other modern AI agent runtimes like **Hermes Agent** and **OpenClaw**, we evaluate their architectural paradigms, sandboxing, and security boundaries.

| Metric / Pillar | **Rimuru** | **Hermes Agent** | **OpenClaw** |
| :--- | :--- | :--- | :--- |
| **Primary Philosophy** | **Local-First Sovereign Toolkit**: Focuses on developer ergonomics, local workflows, and dynamic on-the-fly tool compilation. | **Zero-Trust Hardened Isolation**: Focuses on multi-tenant systems, enterprise boundaries, and strict VM isolation. | **Local Performance Host**: Focuses on fast, minimal-setup local automation loops with native integrations. |
| **Tool Calling Paradigm** | Text-based ReAct loop parsing with regex extraction, transitioning to schema mapping. | Native Structured Function Calling (JSON schemas enforced at the LLM provider level). | Native Function Calling (gateway-level validation). |
| **Execution Sandboxing** | Multi-level: QuickJS VM for JS/TS, WASI sandbox for Rust, Docker containers for host systems. | **Guest Isolation Boundary**: Hard-locked WASM or Micro-VM boundaries for all tool commands. | Micro-VM guest sandbox for untrusted commands; capability limits. |
| **Workspace Security** | Path resolution checks and blocklists for sensitive config files (CoW branches for safety). | Virtualized guest filesystem mounts with absolute physical boundary containment. | Isolated guest directories with local OS capability limits. |
| **Dynamic Tool Synthesis** | **Native Compiler**: Dynamically compiles TS scripts to QuickJS VM or Rust files to WASI `.wasm`. | Pre-compiled static tool sets; dynamic scripts must be executed inside isolated VMs. | Static tool registry; does not compile source code on the fly. |
| **Memory & Context Caching** | Locally stored Chronicles. Session state is optimized for local disk footprint. | Stateful session streams optimized for LLM prompt and context caching. | Stateless REST-based context passing. |

### Summary of Differences:
* **Rimuru** is designed from the ground up for developers who need **extensibility and sovereignty**. The ability to dynamically compile custom TypeScript and Rust tools (Runes) directly into the agent's toolbox is unique to Rimuru. It prioritizes speculative branching (Copy-on-Write) so that developers can witness, inspect, and approve changes locally.
* **Hermes Agent** is optimized for **enterprise defense-in-depth security**. It assumes the workspace and all scripts are potentially hostile, enforcing virtualized guest mounts and micro-VM boundaries at all times. It relies heavily on stateful caching to maintain high-speed, cost-effective LLM reasoning.
* **OpenClaw** strikes a balance by providing a lightweight local execution engine, relying on API-level gateways to validate function inputs, but lacks Rimuru's advanced on-the-fly Rust compilation and speculative workspace branching.

---

## 📜 XI. License

Distributed under the MIT License. Built for the liberation of the digital individual.
