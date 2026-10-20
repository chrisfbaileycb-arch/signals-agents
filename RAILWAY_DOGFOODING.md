# Signals Agents private Railway workspace

This deployment preserves the four-agent directional studio, harness configuration, mind map, workflow exports, and direct browser-to-provider BYOK architecture.

## Access and credentials

- Railway service: `signals-agents` in Menu-Flow.
- `/welcome` is the public entry. `/api/health` and `/health` are public readiness endpoints.
- The owner lock uses `OWNER_PASSWORD`, referenced from the existing Echo service. This is a workspace-access secret, not an AI provider key. Production fails closed when it is absent.
- Enter personal provider keys in the existing BYOK panel. They stay in private module memory and are never put in web storage, provider cookies, a database, or Railway variables. Calls go directly from the browser to the provider; there is no application-server relay or operator key.
- Reloading clears keys. Manual purge clears them immediately. Run completion releases a run lease; it does not erase the page's configured key. The UI now describes this distinction accurately.
- Connecting a key does not validate it or spend credits. Live provider/model access still needs testing with the owner's own key.
- A disconnected selected provider refuses execution instead of silently using a different provider's key.
- Gemini keys use `x-goog-api-key`, not URL query strings. Provider redirects are refused, requests time out after 90 seconds, echoed credentials are redacted from errors, and empty responses fail the step.

## Execution and exports

- Provider errors stop the directional chain and produce a failure receipt. Successful responses continue through every configured step of all four agents.
- Progress animation is labeled as estimated request progress. A received response is ready for review; it is not proof that generated code was compiled or deployed.
- No persistent data volume is needed: workflow state and keys live in the browser. Export workflow bundles before reloading or closing the page.
- Scheduled runs require the browser tab to remain open and a usable key to remain configured. This is not an unattended server worker.
- Cloud providers must permit browser requests. Local model endpoints must be reachable from the user's browser and allow that origin; browser security can block an incompatible HTTP/CORS configuration. No fallback silently moves credentials to the server.

## Validation

`npm ci`, `npm run typecheck`, `npm run lint`, `npm test -- --runInBand`, `npm run test:server`, and `npm run build`.

Tests cover ephemeral key handling, selected-provider isolation, request/response redaction, missing/empty/failed responses, successful four-agent handoff, stopping after provider failure, and owner cookie/write-origin protection. ZIP exports are checked with a standard ZIP reader for Unicode and nested folders. Provider requests are mocked during validation; no real key or paid provider request is used.
