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
	});
});
