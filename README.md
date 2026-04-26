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
- **Zen UI System**: A distraction-free visual language available in Dark, Light, and High-Contrast modes.
- **Glide-Scroll Engine**: Optimized viewport management for smooth, lag-free conversations.
- **Professional Typography**: Deep integration with the Inter and Outfit typefaces for maximum legibility.

### Security & Auditability
- **Permission Gating**: Every Rune (tool) is classified by risk (read, write, execute, network) and requires explicit policy approval.
- **Redacted Traces**: Full execution logs are persisted in an auditable, replayable format.
- **Local-First**: All memory, secret storage (Vault), and tool execution occur on your local machine.

### Extensibility
- **Rune Registry**: Easily add new capabilities by defining typed tool contracts.
- **Plugin System**: Load external logic through signed manifest-based plugins.
- **MCP Compatibility**: Native support for Model Context Protocol (MCP) tool-calling.

## Getting Started

### Installation
```bash
pnpm install
pnpm build
```

## CLI Command Reference

The `rimuru` CLI is the primary entry point for managing the local runtime:

- `init`: Initialize a new Rimuru workspace and configuration.
- `chat <prompt>`: Start a quick chat turn with the active Sovereign kernel.
- `agent <objective>`: Run a goal-oriented agent loop with model-guided planning.
- `memory [list|summary|search]`: Manage conversation chronicles and semantic memory.
- `gate [start|stop|status]`: Control the background Gate HTTP/SSE server.
- `rune <name> <input>`: Execute a specific tool (rune) directly from the terminal.
- `trace [list|inspect]`: Audit previous execution flows and model interactions.
- `plugin [list|inspect]`: Manage external runtime extensions.
- `doctor`: Perform a system check on configuration, providers, and environment.
- `ui`: Launch the local terminal user interface (TUI).

## Development
Start the local Gate server:
```bash
pnpm --filter @rimuru/cli dev gate start --port 19710
```


Launch the Sovereign Portal:
```bash
pnpm --filter @rimuru/web dev
```

### Production Deployment
The Gate server can be installed as a systemd user service for persistent background operation:
```bash
rimuru gate install-service
```

## Documentation
For detailed architecture guides and API references, visit the [Documentation](./docs) directory.

## License
MIT License - See [LICENSE](./LICENSE) for details.
