# Signals Agents

Multi-agent directional workflow studio with real-time step progress bars, front-end BYOK ephemeral credential connector, interactive Mind-Work-Done visual orchestration, and PII/financial safety guardrails.

## Overview

**Signals Agents** runs sequenced, directional multi-agent workflows (`01 → 02 → 03 → 04`), one step at a time, with visible real-time progress in the browser.

- **Directional Workflow Studio**: Sequenced 4-agent execution pipeline where each agent completes its step breakdown and hands off sanitized context to the next agent in the chain.
- **Real-Time Step Progress Bars**: Live per-step percentage tracking, elapsed millisecond telemetry, and 4-phase verification indicators.
- **Front-End BYOK Ephemeral Credential Connector**: Bring your own provider API key (Gemini, OpenAI, Anthropic, OpenRouter, Together, Perplexity) or connect a local model endpoint (LM Studio / Ollama HTTP base URL, no API key required). Credentials live strictly in page-session memory — never written to `localStorage`, never stored in cookies, never sent to our server, and cleared on reload.
- **Mind-Work-Done Visual Orchestration**: Interactive node-and-edge graph stage synchronized with the directional agent pipeline and downloadable workflow bundle exports.
- **PII & Financial Safety Guardrails**: Every outbound prompt and inter-agent handoff passes through a single audited gateway (`src/lib/byokConnector.ts`) that redacts email addresses, phone numbers, SSNs, embedded API keys, and financial identifiers before leaving the page. Signals Agents has no operator-funded key path and refuses execution with a clear message if no personal key or local model endpoint is configured.

## Quick Start

```bash
npm install
npm run dev
```

Build and verify:

```bash
npm run build
npm run lint
npm test
```

## License & Attribution

MIT License — Copyright (c) 2026 Christopher F. Bailey / Signal F Holdings LLC. Originally forked from the `smol-ai/GodMode` template (MIT) and completely refactored into Signals Agents. See [LICENSE](./LICENSE) for full details.
