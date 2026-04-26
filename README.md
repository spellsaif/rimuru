# Rimuru

Rimuru is a professional, local-first AI assistant runtime designed with a focus on auditability, safety, and a minimalist user experience. It follows the **Sovereign Architecture**, a modular design system that isolates orchestration, memory, and tool execution.

## Core Concepts

The Rimuru runtime is built around a specific domain language to ensure architectural clarity:

- **Sovereign**: The orchestration kernel that manages user intent, model routing, and tool execution.
- **Shard**: Standardized adapter boundaries for AI providers (OpenAI, Anthropic, Gemini, Ollama).
- **Rune**: Typed, permission-gated tool contracts for interacting with the local workspace, Git, and system commands.
- **Chronicle**: A session-based memory system that persists conversation history and semantic context.
- **Flow**: An immutable event stream that provides real-time observability for TUI and Web interfaces.

## Project Structure

This repository is structured as a high-performance monorepo:

- `apps/cli`: The primary terminal interface and TUI.
- `apps/web`: The Sovereign Portal, a minimalist Next.js dashboard for remote interaction.
- `packages/core`: The central runtime logic, agent loop, and rune registry.
- `packages/gate`: A professional HTTP/SSE gateway for bridging the local runtime to web and mobile clients.
- `shared`: Common TypeScript types and utility libraries.

## Features

### Sovereign Portal (Web UI)
A high-performance, minimalist dashboard designed for "Zen" focus:
- **Real-time Streaming**: Token-by-token response rendering via Server-Sent Events (SSE).
- **Zen UI System**: A distraction-free visual language available in Dark and Light modes.
- **Glide-Scroll Engine**: Optimized viewport management for smooth, lag-free conversations.
- **Professional Typography**: Deep integration with the Inter typeface for maximum legibility.

### Security & Auditability
- **Permission Gating**: Every Rune (tool) is classified by risk (read, write, execute, network) and requires explicit policy approval.
- **Redacted Traces**: Full execution logs are persisted in an auditable, replayable format.
- **Local-First**: All memory, secret storage (Vault), and tool execution occur on your local machine.

## CLI Command Reference

The `rimuru` CLI is the primary entry point for managing the local runtime.

### Core Commands

- **`init` / `setup`**: Initialize a new Rimuru workspace.
  - `--wizard`: Start an interactive configuration walkthrough.
  - `--force`: Overwrite existing configuration.
  - `--provider <name>`: Set the initial AI provider (e.g., `openai-compatible`, `anthropic`).
  - `--model <name>`: Set the default model.
- **`chat [prompt]`**: Start a conversation.
  - If no prompt is provided, launches the **Interactive TUI**.
  - If a prompt is provided, returns a single response to stdout.
- **`agent <objective>`**: Run a goal-oriented agent loop with model-guided planning.
- **`memory`**: Manage conversation chronicles and semantic memory.
  - `list`: List all available sessions.
  - `summary <session>`: Generate a summary of a specific session.
  - `search <query>`: Perform a semantic search across indexed memories.
- **`gate`**: Control the background gateway server.
  - `start [--port <port>] [--approvals]`: Launch the Gate server for Web UI connectivity.
  - `status`: Check the current state of the Gate and active vessel.
  - `install-service`: Generate a systemd user service for background operation.
- **`config`**: Manage runtime settings.
  - `list`: Show current configuration as JSON.
  - `set <key> <value>`: Update a configuration value.
- **`rune <name> <input>`**: Execute a specific tool (rune) directly from the terminal.
- **`doctor [--json]`**: Perform a system diagnostic check on the environment and configuration.
- **`ui` / `dashboard`**: Launch the terminal-based monitoring dashboard.

## Getting Started

### Installation
```bash
pnpm install
pnpm build
```

### Development
Start the local Gate server:
```bash
pnpm --filter @rimuru/cli dev gate start --port 19710
```

Launch the Sovereign Portal:
```bash
pnpm --filter @rimuru/web dev
```

## Documentation
For detailed architecture guides and API references, visit the [Documentation](./docs) directory.

## License
MIT License - See [LICENSE](./LICENSE) for details.
