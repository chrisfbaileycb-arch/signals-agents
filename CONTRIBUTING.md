# Contributing to Signals Agents

Thank you for your interest in contributing to **Signals Agents** — the multi-agent directional workflow studio by **Christopher F. Bailey / Signal F Holdings LLC**.

> **Product & MIT License Notice**:  
> **Signals Agents** (`Copyright (c) 2026 Christopher F. Bailey / Signal F Holdings LLC`) is an original, standalone identifiable product completely refactored from foundational MIT-licensed open-source scaffolding (`Copyright (c) 2023 smol-ai / GodMode contributors` and `Copyright (c) 2015-present Electron React Boilerplate`). All contributions to this repository are governed by the [MIT License](./LICENSE) under the **Signals Agents** product identity.

---

## Development Setup

1. Clone the **Signals Agents** repository and install dependencies:

   ```bash
   git clone https://github.com/signal-f-holdings/signals-agents.git
   cd signals-agents
   npm install
   ```

2. Run the full-stack Express + Vite development server on port `3000`:

   ```bash
   npm run dev
   ```

3. Verify TypeScript & production bundle compilation:

   ```bash
   npm run build
   ```

---

## Areas for Contribution

- **Multi-Agent Topologies & Step Templates**: Extending directional, parallel, and diamond handoff orchestration in `src/lib/workflowTypes.ts` and `src/renderer/layout.tsx`.
- **PII & Financial Guardrails**: Enhancing pre-flight and server-side compliance patterns in `src/lib/workflowTypes.ts` and `server.ts`.
- **Mind-Work-Done Visual Stage**: Expanding spatial graph interactions and export formats in `src/lib/mindMapEngine.ts` and `src/components/WorkflowMindMap.tsx`.
- **Workflow Export Archetypes**: Adding domain-specific deliverable bundles in `src/lib/workflowExporter.ts`.
