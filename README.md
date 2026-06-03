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
The AI model is a guest in your workspace. Rimuru enforces a strict isolation boundary between the model's desires and your physical operating system. Every filesystem read/write, terminal command, or network query must be explicitly permitted by user-defined constraints and executed in isolated sandboxes (QuickJS WebAssembly VM, WASI process containment).

### 2. Speculative Timeline Branching (CoW)
Instead of executing mutating actions blindly, Rimuru spawns lightweight **copy-on-write (CoW) workspace branches** in milliseconds. Speculative runners test modifications, verify compilation and test suites, and merge changes back to the master branch *only* upon successful validation.

### 3. Dynamic Tool Synthesis Engine
Faced with complex operations, Rimuru dynamically designs, compiles, and loads its own local tools (Runes). It transpiles TypeScript programmatically or compiles Rust source code to `.wasm` binaries targetting `wasm32-wasip1`, loading and executing them safely in a sandboxed WASI environment.

### 4. OS Keychain & Cryptographic Vault
Credentials remain strictly invisible to the LLM. Rimuru stores keys encrypted with AES-256-GCM, automatically query-binding decryption keys from your OS secure keychain via Linux `secret-tool` / dbus-keyrings, removing fallback risks.

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

## 🛡️ IV. Hardened Security & Optimization

* **WASI Output Redirection**: Captures and routes standard output/standard error for custom compiled WASI `.wasm` tools via temporary file descriptor redirection.
* **Fail-Closed Gatekeeper**: All circle webhook endpoints enforce mandatory HMAC-SHA256 (Slack) and Ed25519 (Discord) signature verification, failing secure with `401 Unauthorized` if validation keys are missing.
* **Context Cache Optimization**: The agent reasoning engine maintains continuous, stateful execution sessions, avoiding token scaling and maximizing LLM prompt-caching.
* **Longest Common Subsequence (LCS) Diff**: Computes and previews workspace edits with Myers-style LCS DP diffing to prevent line-shift cascades.

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
The wizard configures your **LLM Shard**, choose your sandbox **Barrier**, select your permission **Vows**, and automatically writes the config to `rimuru.config.json`.

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
Start the split-pane terminal client:
```bash
# Launches the TUI chat interface
pnpm rimuru chat
```

### 🌍 2. The Web Visual Canvas
Access the graphical canvas panel with iframe live previews at `http://localhost:19711`:
```bash
# Start Turborepo dev servers
pnpm dev
```

### 🔌 3. Dynamic Webhook Integrations
```bash
# Start the HTTP/SSE Gateway server
pnpm --filter @rimuru/cli dev gate start
```

---

## 🧪 VII. Testing

Run all unit and integration tests (including sandboxes and compilations):

```bash
# Run the Vitest suite
pnpm test
```

---

## 📜 VIII. License

Distributed under the MIT License. Built for the liberation of the digital individual.
