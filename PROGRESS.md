# Signals Agents — Foundation Progress Report

## What Changed in This Phase

### 1. Product Rebrand & Legal Attribution (Job 1)
- **`package.json`**: Renamed package to `signals-agents`, `productName` to `"Signals Agents"`, `author` to `"Chris Bailey"`, `description` to `"Directional multi-agent workflow studio. Bring your own API key or a local model."`, and `repository.url` to `https://github.com/chrisfbaileycb-arch/signals-agents`.
- **`LICENSE` & `README.md`**: Preserved the MIT License with template origin attribution (`smol-ai/GodMode`) while replacing `README.md` with a concise Signals Agents product overview aligned with `metadata.json`.
- **Sequenced Directional Focus**: Removed parallel/diamond fan-out topology modes so the studio strictly runs sequenced, directional workflows (`01 → 02 → 03 → 04`), one step at a time, with visible real-time progress.

### 2. Front-End BYOK Ephemeral Credential Connector & Provider Registry (Job 2)
- **Removed Web-Driving / DOM Automation**: Deleted all legacy Electron/webview/DOM-scraping provider files (`bard.js`, `bing.js`, `claude.js`, `claude2.js`, `falcon180bspace.js`, `huggingchat.js`, `inflection.js`, `lepton-llama.js`, `oobabooga.js`, `openai.js`, `openrouter.js`, `perplexity-labs.js`, `perplexity.js`, `phind.js`, `poe.js`, `provider.js`, `smol.js`, `stablechat.js`, `together.js`, `vercel.js`, `you.js`, `browserBridge.ts`, `browserPane.tsx`, `TitleBar.tsx`, and legacy `src/settings/`).
- **`src/lib/byokConnector.ts`**: Implemented the front-end ephemeral credential connector and single audited gateway:
  - Stores personal API keys (`gemini`, `openai`, `anthropic`, `openrouter`, `together`, `perplexity`) and local model endpoints (`local` for LM Studio / Ollama HTTP base URLs without an API key) exclusively in private module closure memory.
  - Never writes credentials to `localStorage`, `sessionStorage`, `cookies`, or `IndexedDB`, never sends keys to the application server, and automatically clears credentials on `beforeunload` / page reload.
- **`src/providers/`**: Rebuilt the multi-provider registry in TypeScript (`provider.ts`, `gemini.ts`, `openai.ts`, `anthropic.ts`, `openrouter.ts`, `together.ts`, `perplexity.ts`, `local.ts`, `index.ts`) where every provider call dispatches through `executeAuditedProviderCall`.

### 3. Non-Negotiable PII & Financial Safety Guardrails (Job 3)
- **PII & Secret Redactor (`redactPiiFromText`)**: Scrubs email addresses, phone numbers, Social Security Numbers (SSNs), payment card PANs, financial account identifiers, and embedded API keys/tokens (`sk-...`, `AIza...`, `ghp_...`, `github_pat_...`, `xoxb-...`, `AKIA...`, `pplx-...`, `hf_...`, `gsk_...`) before any prompt, system instruction, or inter-agent handoff leaves the page.
- **Financial Guardrail (`FinancialGuardrailError`)**: Eliminated all server-side operator API key paths and simulated fallback responses. If no personal API key or local model endpoint is configured in session memory, the connector immediately refuses execution with a clear message.
- **Unit Test Suite (`src/__tests__/byokConnector.test.ts`)**: Added unit tests verifying ephemeral-only memory storage, reload cleanup, unconfigured refusal, local model endpoint execution, and PII/API key redaction.

---

## What the Next Phase Needs (Workflow Engine Expansion)

1. **Sequenced Step Engine Enhancements**:
   - Fine-grained step retry, step pause/resume, and editable step-level handoff schema contracts between Renderances `01 → 02 → 03 → 04`.
   - Streaming token-level progress updates for providers that support SSE streaming (`stream: true`) alongside the 4-phase step progress bars.
2. **Mind-Work-Done View Deepening**:
   - Bi-directional step editing directly from Mind-Work-Done graph nodes so adding/reordering step nodes on the canvas dynamically updates the agent's sequenced step pipeline.
   - Live diff inspection on directional handoff edges showing exact pre-redaction vs. post-redaction handoff payloads between steps.
