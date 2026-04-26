# Rimuru: The Sovereign AI Runtime — The Definitive Technical Manifesto

> **"Privacy is a human right. Sovereignty is a technical choice."**

Rimuru is a high-performance, local-first AI assistant runtime designed for maximum **Sovereignty, Auditability, and Security**. It operates as a modular orchestration kernel that lives entirely within your local workspace, ensuring your data, secrets, and communications never leave your physical control.

---

## 🏛️ I. The Sovereign Manifesto: Why We Built This

### The Rise of Digital Feudalism
In the modern era, AI has become the most powerful tool for human productivity. However, this power has come at a steep cost. Most modern AI assistants are built on a "Cloud-First" model, which we call **Digital Feudalism**. In this model:
1. **You are a Tenant**: You do not own the tools you use; you lease them.
2. **Your Data is the Rent**: To get utility, you must stream your most sensitive code, thoughts, and private messages to remote servers.
3. **The Black Box**: You have no visibility into how your data is processed, stored, or used for training.

### The Sovereign Alternative
Rimuru is a rejection of this model. It is built on the belief that **Individual Sovereignty** is the only safe way to interact with artificial intelligence. By bringing the AI to the data—rather than the data to the AI—Rimuru restores the traditional relationship between a craftsman and their tools.

#### The Three Pillars of Sovereignty:
- **Local-First Execution**: The "Brain" of the system is on your desk, not in a data center. All memory, secret storage (Vault), and tool execution occur locally.
- **Hardened Boundaries**: The AI is a guest in your workspace. It can only see what you allow and only touch what you approve via the **Vow** system.
- **Absolute Auditability**: Trust but verify. Rimuru records every thought, action, and tool output in an immutable event stream (**Flow**), providing a perfect audit trail.

---

## 🏗️ II. System Architecture: The Tiered Isolation Model

Rimuru is engineered as a layered ecosystem, where each layer acts as a firewall for the next. This ensures that even if an AI model "hallucinates" a destructive command, the system boundaries prevent it from executing without permission.

### Architecture Map (System Blueprint)
```ascii
┌─────────────────────────────────────────────────────────────┐
│                 COMMUNICATION LAYER (CIRCLES)               │
│   ┌───────────┐    ┌───────────┐    ┌───────────┐           │
│   │ WhatsApp  │    │  CLI TUI  │    │  Web UI   │           │
│   └─────┬─────┘    └─────┬─────┘    └─────┬─────┘           │
└─────────┼────────────────┼────────────────┼─────────────────┘
          │                │                │
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
│                    LOCAL WORKSPACE & VAULT                  │
│    Codebase  •  Encrypted Secrets  •  Semantic Memory       │
└─────────────────────────────────────────────────────────────┘
```

### The Tiers of Isolation
1. **The Perimeter (Circles)**: External adapters that normalize messages from apps like WhatsApp or Slack into the Rimuru Flow format.
2. **The Fortress (The Gate)**: A high-performance HTTP/SSE server that handles the pairing of remote devices. It is the only component exposed to the network.
3. **The Kernel (The Core)**: The orchestration engine. It manages the **ReAct (Reason+Act)** cycle, planning objectives and maintaining session state.
4. **The Execution Layer (Runes & Shards)**: Isolated plugins. Runes are the "Hands" (tools) and Shards are the "Voice" (LLM connections).

---

## 📖 III. The Grand Dictionary (Domain Language)

To master Rimuru, you must speak the language of the Sovereign:

| Term | Technical Definition |
| :--- | :--- |
| **Sovereign** | The central orchestration engine. It manages the agentic loop and state. |
| **Shard** | A standardized bridge for LLM providers (OpenAI, Anthropic, Gemini, Ollama). |
| **Rune** | A typed, permission-gated tool contract (e.g., `workspace.readFile`). |
| **Vessel** | A "Vessel" is a specific agent instance (a Soul bound to a Shard and Vows). |
| **Soul** | The personality and core mission of the agent, defined in `SOUL.md`. |
| **Vow** | A permission (read, write, execute, network) granted to an agent. |
| **Chronicle** | A high-fidelity conversation log and session memory. |
| **Flow** | An immutable event stream providing 100% observability of internal states. |
| **Circle** | A bridge to an external communication platform (e.g., WhatsApp). |
| **Vault** | An AES-256 encrypted local store for API keys and workspace secrets. |
| **Ritual** | A background automation task scheduled to run periodically. |
| **Canvas** | A persistent document (Markdown/HTML) managed and edited by the AI. |
| **Barrier** | The security mode of the runtime (none, readonly, or docker-sandboxed). |

---

## 🧠 IV. The ReAct Reasoning Engine: Deep-Dive

Rimuru does not operate on simple "Request-Response" cycles. It employs a **Reasoning + Action (ReAct)** loop that ensures every action is preceded by deliberate thought.

### The Thought-Plan-Act Cycle
When Rimuru receives an objective, it executes the following loop:
1. **Synthesis**: It builds a prompt containing the current `SOUL.md`, the `Rune Registry`, and the `Chronicle` history.
2. **Reasoning**: The model outputs a **Thought** block: *"I see the user wants to refactor the auth system. I first need to locate the auth handler."*
3. **Tool Selection**: It outputs an **Action**: `workspace.findFiles`.
4. **Vow Check**: The Kernel verifies: *"Does this vessel have 'read' permissions for the workspace?"*
5. **Execution**: The Rune is invoked, and the result is returned as an **Observation**.
6. **Reflection**: The AI reflects on the result: *"I found the file at src/auth.ts. Now I will read its content."*

### Error Correction & Hallucination Prevention
If the AI suggests a tool that doesn't exist, or provides invalid JSON for the input, the Kernel intercepts it. It feeds an error back to the AI: *"The action 'deleteSystem' does not exist. Please re-plan using the provided tools."* This prevents "Model Hallucinations" from causing system damage.

---

## 🛡️ V. Security & The "Sovereign Blindspot"

Rimuru implements a unique security model called the **Sovereign Blindspot**. This ensures that the AI assistant remains "blind" to your most sensitive secrets, even while it has the power to manage your code.

### 1. Path-Level Isolation
The file-system Runes (`readFile`, `listDir`, `editFile`) are hard-coded to reject any path inside the `.rimuru/` directory. 
- **WhatsApp Protection**: The session keys for your WhatsApp connection live in `.rimuru/circles/whatsapp`. The AI can never read these.
- **Vault Protection**: The AI can never see the `vault.json` file.

### 2. The Permission Vows
Runes are classified by risk levels:
- **`read`**: Safe. Reading files or listing directories.
- **`write`**: Moderate risk. Editing files or committing to Git.
- **`execute`**: High risk. Running terminal commands or scripts.
- **`network`**: High risk. Making external API calls beyond the LLM shard.

### 3. Redacted Audit Traces
Rimuru generates `traces` (JSON files) for every interaction. These are vital for debugging but could contain secrets. Rimuru's tracing engine automatically redacts:
- Any string matching an entry in your **Vault**.
- Any absolute file paths that reveal your system's username.

---

## ⌨️ VI. CLI Reference: Operational Excellence

The `rimuru` CLI is the "Command Center" of your Sovereign workspace.

### Core Interaction
*   **`rimuru chat [prompt]`**: 
    - **Interactive TUI**: If run without a prompt, launches a high-performance terminal interface.
    - **Syntax Highlighting**: Code blocks in the TUI are rendered with full syntax colors.
    - **Session Recovery**: Automatically resumes the last active chronicle.
*   **`rimuru agent <objective>`**:
    - Starts the autonomous reasoning loop.
    - **Example**: `rimuru agent "Find all unused imports in the project and remove them."`
*   **`rimuru ui` / `dashboard`**:
    - A real-time monitoring dashboard.
    - Displays: Active Shard, Last Thought, Flow Events, and Memory usage.

### Lifecycle & Config
*   **`rimuru init --wizard`**: The "Awakening" process. Walks you through setting up your first Vessel and Soul.
*   **`rimuru doctor`**: Runs a 12-point diagnostic check on your Node.js environment, Vault connectivity, and Shard latency.
*   **`rimuru config set <key> <value>`**: Directly manipulate the `rimuru.config.json` from the terminal.

### Secret Management (The Vault)
*   **`rimuru vault set <NAME> <VALUE>`**: Encrypts and stores a secret.
*   **`rimuru vault get <NAME>`**: Decrypts and shows a secret (requires master authentication).
*   **`rimuru vault list`**: Shows all stored secret names (but not their values).

---

## 📱 VII. Circles: The WhatsApp Sovereign Node

The WhatsApp Circle is our flagship communication bridge. It allows you to carry your Sovereign AI in your pocket without sacrificing your privacy to the cloud.

### The "Strict Privacy" Protocol
Unlike other WhatsApp bots that listen to every group and contact, Rimuru is **Hard-Locked** to you.
1. **`isMe` Check**: Rimuru uses the WhatsApp `isMe` property to ensure it ONLY replies to the account owner.
2. **Private "You" Chat**: It is designed to work in your own private thread (the chat where you can message yourself).
3. **Silent by Default**: It will never see, log, or reply to your friends, family, or work groups.
4. **Recursive Loop Prevention**: Since you and the bot share the same identity in a self-chat, Rimuru uses **Text Fingerprinting**. It fingerprints every reply it sends; if it sees that exact text again (which it will, because it's a self-chat), it ignores it to prevent an infinite loop.

---

## 🛠️ VIII. Advanced Capability: Rituals & Rollbacks

### 1. Rituals (Background Automation)
Rituals allow you to schedule "Background Ghosts" to perform tasks while you sleep.
- **Example**: `rimuru ritual create "code-audit" "Scan for security vulnerabilities in the last 10 commits" --every 1440` (once a day).
- **Automation**: Rimuru will spin up a Sovereign instance in the background, perform the task, and save the result to a **Canvas**.

### 2. Rollbacks (Safety Net)
Rimuru keeps a record of every file edit it makes. If the AI breaks your code:
- **`rimuru rollback list`**: See all recent AI edits.
- **`rimuru rollback apply <id>`**: Instantly revert the code to its exact state before the AI touched it.

---

## 🧠 IX. Memory Matrix: Chronicles & Semantic Search

Rimuru implements a dual-memory system to provide both "Recent Focus" and "Long-Term Wisdom."

### The Chronicle (Active Memory)
Every message in a session is saved to a `Chronicle`. This provides the "Context Window" for the AI. When you say "Actually, change that function name," Rimuru knows which function you are talking about by reading the Chronicle.

### Semantic Memory (Long-Term Archive)
Rimuru indexes your workspace into a local vectorized database.
- **Similarity Search**: When you ask "How do we handle auth?", Rimuru calculates the **Cosine Similarity** between your question and your entire codebase.
- **Context Injection**: It injects the most relevant code snippets directly into the AI's "Thought" phase.

---

## 🚀 X. Getting Started: The Sovereign Path

### 1. Installation
```bash
# Clone and build
pnpm install
pnpm build
```

### 2. Awakening
```bash
# Start the setup wizard
pnpm --filter @rimuru/cli dev setup --wizard
```

### 3. Fortifying (Vault)
```bash
# Set your API keys
pnpm rimuru vault set OPENROUTER_API_KEY <your-key>
```

### 4. Bridging (Gate)
```bash
# Start the Gateway server
pnpm --filter @rimuru/cli dev gate start
```

### 5. Connecting (WhatsApp)
```bash
# Add the WhatsApp bridge and scan the QR
pnpm --filter @rimuru/cli dev circle add whatsapp
```

---

## 📜 XI. License & Future Roadmap

**License**: MIT. Developed for the liberation of the digital individual.

### The Future of Sovereignty:
- **Decentralized Handshakes**: Instances of Rimuru talking to each other securely.
- **Local GPU Shards**: Full removal of external API dependencies.
- **Hardware Sovereignty**: A dedicated Rimuru hardware node for the home.

---

**"The Sovereign man owns his tools. The Sovereign man owns his data. The Sovereign man owns his future."**
