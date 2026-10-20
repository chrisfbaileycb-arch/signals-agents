import {
	clearAllByokCredentials,
	clearByokCredential,
	executeAuditedProviderCall,
	FinancialGuardrailError,
	getByokAuditTrail,
	getByokStatus,
	hasActiveByokCredential,
	PiiGuardrailBlockedError,
	redactPiiFromText,
	resetByokSessionMemory,
	setByokApiKey,
	setByokLocalEndpoint,
} from '../lib/byokConnector';
import { getProviderById, PROVIDER_REGISTRY } from '../providers';

describe('Signals Agents — BYOK Ephemeral Connector & Safety Guardrails', () => {
	beforeEach(() => {
		resetByokSessionMemory();
		if (typeof window !== 'undefined') {
			window.localStorage.clear();
			window.sessionStorage.clear();
			document.cookie = '';
		}
	});

	describe('Ephemeral Session Memory & Zero Persistence', () => {
		it('stores personal API keys strictly in page session memory and never persists to localStorage, sessionStorage, or cookies', () => {
			const rawKey = 'sk-proj-testSecretPersonalKey1234567890';
			const status = setByokApiKey('openai', rawKey);

			expect(status.configured).toBe(true);
			expect(status.mode).toBe('api_key');
			expect(status.providerId).toBe('openai');
			// Never exposes the raw key in status metadata
			expect(status.maskedKeyPreview).not.toBe(rawKey);
			expect(status.maskedKeyPreview).toContain('••••');

			// Verify zero persistence in web storage or cookies
			expect(window.localStorage.length).toBe(0);
			expect(window.sessionStorage.length).toBe(0);
			expect(JSON.stringify(window.localStorage)).not.toContain(rawKey);
			expect(JSON.stringify(window.sessionStorage)).not.toContain(rawKey);
			expect(document.cookie).not.toContain(rawKey);
		});

		it('clears all credentials on page reload / beforeunload or explicit session reset', () => {
			setByokApiKey('gemini', 'AIzaSyTestEphemeralKeyValue123456789012345');
			expect(hasActiveByokCredential('gemini')).toBe(true);

			// Simulate page unload / reload event
			window.dispatchEvent(new Event('beforeunload'));
			expect(hasActiveByokCredential('gemini')).toBe(false);
			expect(getByokStatus('gemini').configured).toBe(false);

			// Also verify explicit clearByokCredential and clearAllByokCredentials
			setByokApiKey('anthropic', 'sk-ant-testKey98765432109876543210');
			expect(hasActiveByokCredential('anthropic')).toBe(true);
			clearByokCredential('anthropic');
			expect(hasActiveByokCredential('anthropic')).toBe(false);

			setByokApiKey('openai', 'sk-proj-anotherKey123456789012345');
			clearAllByokCredentials();
			expect(hasActiveByokCredential()).toBe(false);
		});

		it('supports local model endpoints (LM Studio / Ollama base URL) with no API key required and same ephemeral handling', async () => {
			const status = setByokLocalEndpoint(
				'http://localhost:1234/v1',
				'llama-3.2-8b-instruct',
			);

			expect(status.configured).toBe(true);
			expect(status.mode).toBe('local_endpoint');
			expect(status.baseUrl).toBe('http://localhost:1234/v1');
			expect(status.defaultModel).toBe('llama-3.2-8b-instruct');
			expect(window.localStorage.length).toBe(0);

			const mockFetch = jest.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => ({
					choices: [
						{
							message: {
								content: 'Local model step output verified.',
							},
						},
					],
				}),
			} as unknown as Response);

			const response = await executeAuditedProviderCall({
				providerId: 'local',
				prompt: 'Execute step 1 architecture plan.',
				fetchImpl: mockFetch,
			});

			expect(mockFetch).toHaveBeenCalledTimes(1);
			expect(mockFetch.mock.calls[0][0]).toBe(
				'http://localhost:1234/v1/chat/completions',
			);
			expect(response.providerId).toBe('local');
			expect(response.text).toBe('Local model step output verified.');

			// Simulate reload and confirm local endpoint is cleared
			window.dispatchEvent(new Event('beforeunload'));
			expect(hasActiveByokCredential('local')).toBe(false);
		});
	});

	describe('Financial Guardrail (Zero Operator Key Path)', () => {
		it('refuses execution with FinancialGuardrailError when no personal key or local endpoint is configured', async () => {
			expect(hasActiveByokCredential()).toBe(false);

			await expect(
				executeAuditedProviderCall({
					prompt: 'Run workflow step without credentials',
				}),
			).rejects.toThrow(FinancialGuardrailError);

			const auditTrail = getByokAuditTrail();
			expect(auditTrail.length).toBe(1);
			expect(auditTrail[0].status).toBe('REFUSED_NO_CREDENTIALS');
			expect(auditTrail[0].message).toMatch(/Financial Guardrail/i);
		});

		it('routes every provider in PROVIDER_REGISTRY through the audited BYOK gateway and refuses when unconfigured', async () => {
			expect(PROVIDER_REGISTRY.length).toBeGreaterThanOrEqual(7);

			for (const provider of PROVIDER_REGISTRY) {
				expect(provider.isConfigured()).toBe(false);
				await expect(
					provider.execute({
						prompt: `Test ${provider.fullName} without credentials`,
					}),
				).rejects.toThrow(FinancialGuardrailError);
			}
		});
	});

	describe('PII & Secret Redactor Guardrail', () => {
		it('redacts email addresses, phone numbers, SSNs, financial card PANs, and non-provider API keys before leaving the page', () => {
			const rawPrompt = [
				'Customer Jane Doe (email: jane.doe@example.org, phone: (415) 555-0199, SSN: 123-45-6789)',
				'submitted card 4532-0151-1283-9901 and leaked keys sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz123456',
				'and ghp_1234567890abcdefghijklmnopqrstuvwx and AIzaSyD1234567890abcdefghijklmnopqrstuvw.',
			].join(' ');

			const result = redactPiiFromText(rawPrompt, { policy: 'mask' });

			expect(result.blocked).toBe(false);
			expect(result.sanitizedText).not.toContain('jane.doe@example.org');
			expect(result.sanitizedText).not.toContain('(415) 555-0199');
			expect(result.sanitizedText).not.toContain('123-45-6789');
			expect(result.sanitizedText).not.toContain('4532-0151-1283-9901');
			expect(result.sanitizedText).not.toContain(
				'sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz123456',
			);
			expect(result.sanitizedText).not.toContain(
				'ghp_1234567890abcdefghijklmnopqrstuvwx',
			);
			expect(result.sanitizedText).not.toContain(
				'AIzaSyD1234567890abcdefghijklmnopqrstuvw',
			);

			expect(result.sanitizedText).toContain('[REDACTED_EMAIL]');
			expect(result.sanitizedText).toContain('[REDACTED_PHONE]');
			expect(result.sanitizedText).toContain('[REDACTED_SSN]');
			expect(result.sanitizedText).toContain('[REDACTED_FINANCIAL_CARD]');
			expect(result.sanitizedText).toContain('[REDACTED_API_KEY]');
			expect(result.piiCount).toBeGreaterThanOrEqual(3);
			expect(result.financialCount).toBeGreaterThanOrEqual(1);
			expect(result.apiKeyCount).toBeGreaterThanOrEqual(3);
		});

		it('scrubs PII from outbound prompts before invoking the provider fetch call', async () => {
			setByokApiKey('openai', 'sk-proj-validSessionUserKey999999999999');

			const mockFetch = jest.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => ({
					choices: [
						{
							message: {
								content: 'Processed sanitized request.',
							},
						},
					],
				}),
			} as unknown as Response);

			const openaiProvider = getProviderById('openai');
			const res = await openaiProvider.execute({
				prompt:
					'Contact admin@company.io or 800-555-0144 regarding SSN 987-65-4321 and token AKIAIOSFODNN7EXAMPLE',
				fetchImpl: mockFetch,
			});

			expect(mockFetch).toHaveBeenCalledTimes(1);
			const outboundBody = JSON.parse(
				mockFetch.mock.calls[0][1].body as string,
			);
			const sentContent: string = outboundBody.messages[0].content;

			// Verify raw PII never left the page in the network payload
			expect(sentContent).not.toContain('admin@company.io');
			expect(sentContent).not.toContain('800-555-0144');
			expect(sentContent).not.toContain('987-65-4321');
			expect(sentContent).not.toContain('AKIAIOSFODNN7EXAMPLE');
			expect(sentContent).toContain('[REDACTED_EMAIL]');
			expect(sentContent).toContain('[REDACTED_PHONE]');
			expect(sentContent).toContain('[REDACTED_SSN]');
			expect(sentContent).toContain('[REDACTED_API_KEY]');
			expect(res.redactionsApplied).toBe(4);
		});

		it('blocks outbound calls immediately when guardrailPolicy is set to block and PII is present', async () => {
			setByokApiKey('openai', 'sk-proj-validSessionUserKey999999999999');
			const mockFetch = jest.fn();

			await expect(
				executeAuditedProviderCall({
					providerId: 'openai',
					prompt: 'Raw SSN 123-45-6789 in strict block mode',
					guardrailPolicy: 'block',
					fetchImpl: mockFetch,
				}),
			).rejects.toThrow(PiiGuardrailBlockedError);

			// Network call must never fire when blocked by guardrail
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('creates ephemeral collaborative step notes in session memory with automatic PII & secret redaction', () => {
			const { createStepEphemeralNote } = require('../lib/workflowTypes');
			const note = createStepEphemeralNote({
				author: 'Lead Architect (lead@company.io)',
				text: 'Ensure step 02 validates account ACCT-998877 and never logs SSN 123-45-6789.',
				includeInStepPrompt: true,
			});

			expect(note.id).toMatch(/^note-/);
			expect(note.author).toContain('[REDACTED_EMAIL]');
			expect(note.author).not.toContain('lead@company.io');
			expect(note.text).toContain('[REDACTED_FINANCIAL_ACCOUNT]');
			expect(note.text).toContain('[REDACTED_SSN]');
			expect(note.text).not.toContain('123-45-6789');
			expect(note.redactionsApplied).toBeGreaterThanOrEqual(3);
			expect(note.includeInStepPrompt).toBe(true);
			expect(window.localStorage.length).toBe(0);
		});

		it('validates harness2.v1 configurations, alwaysOnChars census, and gcloud_deploy_monitor sizing across all 4 agent workflows', () => {
			const {
				CANONICAL_OC_HARNESS_CONFIG,
				computeHarnessValidationCensus,
				evaluateGcloudDeployMonitor,
				buildHarnessExecutionContext,
			} = require('../lib/harnessConfig');
			const { INITIAL_FOUR_INSTANCES } = require('../lib/workflowTypes');

			expect(CANONICAL_OC_HARNESS_CONFIG.schemaVersion).toBe('harness2.v1');
			expect(CANONICAL_OC_HARNESS_CONFIG.substrate).toBe('oc');
			const census = computeHarnessValidationCensus(
				CANONICAL_OC_HARNESS_CONFIG.editorTree,
			);
			expect(census.valid).toBe(true);
			expect(census.alwaysOnChars).toBe(1410);
			expect(census.nFiles).toBe(9);
			expect(census.skills).toBe(2);
			expect(census.subAgents).toBe(1);
			expect(census.scripts).toBe(1);
			expect(census.mcpServers).toEqual(['dart', 'genkit']);

			const sizing = evaluateGcloudDeployMonitor(4.0, 8, 220.0);
			expect(sizing.ok).toBe(true);
			expect(sizing.peak_mib).toBe(2272);
			expect(sizing.limit_mib).toBe(4096);

			expect(INITIAL_FOUR_INSTANCES).toHaveLength(4);
			for (const inst of INITIAL_FOUR_INSTANCES) {
				expect(inst.harness.schemaVersion).toBe('harness2.v1');
				const ctx = buildHarnessExecutionContext(inst.harness);
				expect(ctx).toContain('google_agents_cli_deploy');
				expect(ctx).toContain('developing_bazel');
			}
		});
	});
});


describe('Railway deployment credential boundaries', () => {
  beforeEach(() => resetByokSessionMemory());

  it('refuses an explicitly selected disconnected provider instead of charging another key', async () => {
    setByokApiKey('openai', 'sk-proj-another-provider-key-123456789');
    const fetchImpl = jest.fn();
    await expect(executeAuditedProviderCall({ providerId: 'gemini', prompt: 'Test', fetchImpl }))
      .rejects.toThrow(FinancialGuardrailError);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(getByokAuditTrail()[0].providerId).toBe('gemini');
  });

  it('sends Gemini keys in a header, never a URL or application-server request', async () => {
    const key = 'AIzaSyTestHeaderOnlyKey123456789012345678';
    setByokApiKey('gemini', key);
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Provider result' }] } }] }) });
    const result = await executeAuditedProviderCall({ providerId: 'gemini', model: 'gpt-4o', prompt: 'Test', fetchImpl });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toMatch(/^https:\/\/generativelanguage.googleapis.com\//);
    expect(url).not.toContain(key); expect(url).not.toContain('?key=');
    expect(options.headers['x-goog-api-key']).toBe(key);
    expect(options.redirect).toBe('error');
    expect(result.modelUsed).toBe('gemini-2.5-flash');
  });

  it('does not report an empty provider response as a completed step', async () => {
    setByokApiKey('openai', 'sk-proj-test-key-12345678901234567');
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [] }) });
    await expect(executeAuditedProviderCall({ prompt: 'Test', fetchImpl })).rejects.toThrow('no text');
    expect(getByokAuditTrail()[0].status).toBe('PROVIDER_ERROR');
  });

  it('redacts a provider-echoed credential from errors and audit receipts', async () => {
    const key = 'sk-proj-test-sensitive-key-12345678901234567';
    setByokApiKey('openai', key);
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 401, text: async () => `Invalid credential ${key}` });
    let message = '';
    try { await executeAuditedProviderCall({ prompt: 'Test', fetchImpl }); }
    catch (error) { message = (error as Error).message; }
    expect(message).not.toContain(key); expect(message).toContain('[REDACTED_API_KEY]');
    expect(JSON.stringify(getByokAuditTrail())).not.toContain(key);
  });
});
