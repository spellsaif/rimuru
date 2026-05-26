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

## 🏛️ I. The Philosophy of Rimuru

### 1. Zero-Trust Autonomous Sovereignty
The AI model is a guest in your workspace. Rimuru enforces a strict isolation boundary between the model's desires and your physical operating system. Every filesystem read/write, terminal command, or network query must be explicitly permitted by user-defined constraints.

### 2. Radical Observability (The Flow)
Rimuru records every thought, planning step, execution command, and tool observation into an immutable event stream called the **Flow**. Trust, but verify: the Flow provides a perfect, tamper-proof audit trail of everything the AI does in your workspace.

### 3. Local-First Memory & Vault
Your conversation histories (**Chronicles**) and semantic databases are indexed and queried locally. All API tokens and environment secrets are encrypted on-disk using AES-256-GCM via the **Vault**, remaining completely blind to the LLM shard.

### 4. Event-Driven Autonomy (Circles)
Rimuru acts as a background sovereign node. Through standardized bridges called **Circles**, Rimuru connects to chat channels (Slack, Discord, Telegram, WhatsApp) and webhooks to process events asynchronously, planning and executing tasks on the fly while retaining local boundaries.

---

## 🏗️ II. Architecture Blueprint

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
| **Shard** | An adapter connecting Rimuru to LLM backends (Ollama, Gemini, Anthropic, OpenAI). |
| **Rune** | A permission-gated local tool contract (e.g. `workspace.readFile`, `workspace.shell`). |
| **Vow** | The specific risk categories (`read`, `write`, `execute`, `network`) granted to a Vessel. |
| **Vessel** | A concrete runtime agent instance configured with a Shard and specific Vows. |
| **Soul** | The system prompts and personality definitions located in `SOUL.md`. |
| **Chronicle** | The locally indexed session conversation logs and memory store. |
| **Vault** | The AES-256 encrypted hardware secret manager storing workspace API keys. |
| **Circle** | An event-driven bridge adapter translating external payloads to Flow messages. |
| **Barrier** | The security containment level of the runtime (`none`, `readonly`, or `docker`). |

---

## ⚡ IV. Key Features & Hardened Security

### 🛡️ Tiered Zero-Trust Sandboxing
Rimuru implements multi-layer isolation boundaries to execute untrusted code safely:
1. **QuickJS WebAssembly VM**: Dynamic JS Runes generated at runtime are executed within a secure, in-process WebAssembly Virtual Machine. It isolates memory heap allocations, limits recursion, and prevents variables from leaking.
2. **WASI Sandbox**: High-risk system binaries are run as precompiled `.wasm` modules using Node's `node:wasi` library, strictly virtualizing directory mappings.
3. **Path-Level Restraints**: Path validation rejects any operations pointing outside the active workspace directory, keeping files in `.rimuru/` and system roots completely protected.

### 🗳️ Consensus Permission Validation
High-risk tools (Runes) must be validated against a threshold-based **Consensus Gating Policy**. Rimuru routes permission queries to multiple voters (such as static lists, rule auditors, and LLM safety filters) and only grants execution if a consensus threshold is met.

### 🌀 Asynchronous Event-Driven Circles
Webhooks from Slack, Telegram, and Discord are processed asynchronously using an **Ingest-and-Defer** pattern:
- The Gate server immediately acknowledges inbound events with a `202 Accepted` response.
- The reasoning loop executes in the background.
- Upon completion, the result is pushed back to the platform using the adapter's outgoing `send()` API.
- All webhooks are cryptographically authenticated via Slack HMAC-SHA256 signature verification and Discord Ed25519 public key verification.
- Senders are partitioned into isolated user/channel-specific dynamic sessions to avoid context leaks.

---

## 🚀 V. Getting Started

### 📦 1. Installation & Build

```bash
# Clone the repository
git clone https://github.com/your-username/rimuru.git
cd rimuru

# Install dependencies and build the workspace
pnpm install
pnpm build
```

### 🔮 2. Awakening the Sovereign

Initialize your local workspace using the interactive setup wizard:

```bash
# Runs the interactive onboarding wizard
pnpm --filter @rimuru/cli dev setup --wizard
```
The wizard will help you configure your preferred **LLM Shard**, choose your sandbox **Barrier**, select your permission **Vows**, and automatically write the config to `rimuru.config.json`.

### 🔑 3. Fortifying the Vault

Configure your API keys in the local encrypted storage vault:

```bash
# Store keys securely
pnpm rimuru vault set OPENROUTER_API_KEY <your-api-key>
pnpm rimuru vault set GEMINI_API_KEY <your-api-key>

# List active vault entries
pnpm rimuru vault list
```

---

## 💬 VI. Usage & Interactive Interfaces

### 🖥️ 1. The OpenTUI Terminal Chat Interface
Rimuru features a state-of-the-art terminal user interface built with the high-performance **OpenTUI** layout engine. It renders a clean split-pane window, syntax-highlighted markdown chat history, real-time reasoning loops, and an **Events HUD** visualizing internal telemetry.

To start the TUI:
```bash
# Launches the TUI chat interface
pnpm rimuru chat
```

> [!TIP]
> The TUI leverages OpenTUI's native Zig rendering core. Under Node.js, the CLI will automatically search for `bun` on your path and seamlessly respawn itself to execute natively at 30+ FPS!

### 🌍 2. The Web Visual Canvas
If you prefer a graphic layout, start the web interface to display a split-pane coding dashboard. The panel on the right features an **Interactive Canvas iframe** that automatically renders HTML/CSS/JS files built by the agent, allowing you to preview code in real time:

```bash
# Start Turborepo dev servers
pnpm dev
# Open http://localhost:19711 to access the web panel
```

### 🔌 3. Dynamic Webhook Integrations
To listen to external platforms, start the Gate gateway server and configure your webhook endpoints:

```bash
# Start the HTTP/SSE Gateway server
pnpm --filter @rimuru/cli dev gate start
```

Webhooks will route requests through the following paths:
*   **Slack Webhook**: `POST /circles/<circle-name>/slack`
*   **Telegram Webhook**: `POST /circles/<circle-name>/telegram`
*   **Discord Webhook**: `POST /circles/<circle-name>/discord`
*   **Generic Webhook**: `POST /circles/<circle-name>/message`

---

## 🧪 VII. Testing

Rimuru runs a test suite under Vitest validating sandbox containment, consensus gating, dynamic runes, and webhook signature verification:

```bash
# Run all unit tests
pnpm test
```

---

## 📜 VIII. License

Distributed under the MIT License. Built for the liberation of the digital individual.

**"The Sovereign man owns his tools. The Sovereign man owns his data. The Sovereign man owns his future."**
