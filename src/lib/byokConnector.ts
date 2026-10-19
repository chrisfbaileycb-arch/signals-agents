/**
 * Signals Agents — Front-End BYOK Ephemeral Credential Connector & Audited Safety Gateway
 *
 * Non-negotiable architectural guarantees:
 * 1. Ephemeral Page-Session Memory ONLY:
 *    - User-supplied API keys and local model endpoints live exclusively inside private module closure memory.
 *    - NEVER written to localStorage, sessionStorage, cookies, IndexedDB, or window globals.
 *    - NEVER transmitted to the Signals Agents application server.
 *    - Automatically cleared on page reload or explicit purge.
 * 2. PII & Secret Guardrail:
 *    - Every outbound prompt, system instruction, and upstream handoff is scrubbed for:
 *      email addresses, phone numbers, SSNs, embedded API keys/tokens, and financial PAN/account numbers
 *      before any network request leaves the page.
 * 3. Financial Guardrail (Zero Operator Key Path):
 *    - There is NO operator key and NO operator-funded fallback path.
 *    - If no personal API key or local model endpoint is configured in session memory, execution
 *      immediately refuses with a FinancialGuardrailError — never substituting credentials or faking responses.
 * 4. Single Audited Network Gateway:
 *    - Every provider call in `src/providers/` must route through `executeAuditedProviderCall`.
 */

export type ByokProviderId =
	| 'gemini'
	| 'openai'
	| 'anthropic'
	| 'openrouter'
	| 'together'
	| 'perplexity'
	| 'local';

export type GuardrailPolicyMode = 'mask' | 'block';

export interface PiiRedactionResult {
	sanitizedText: string;
	redactedCount: number;
	piiCount: number;
	financialCount: number;
	apiKeyCount: number;
	detectedCategories: string[];
	blocked: boolean;
	blockReason?: string;
}

export interface EphemeralCredentialStatus {
	providerId: ByokProviderId;
	configured: boolean;
	mode: 'api_key' | 'local_endpoint' | 'unconfigured';
	maskedKeyPreview: string | null;
	baseUrl: string | null;
	defaultModel: string;
	sessionLeaseId: string | null;
	provisionedAt: string | null;
}

export interface AuditedCallRequest {
	providerId?: ByokProviderId;
	model?: string;
	prompt: string;
	systemPrompt?: string;
	upstreamContext?: string;
	guardrailPolicy?: GuardrailPolicyMode;
	temperature?: number;
	responseFormat?: 'text' | 'json';
	fetchImpl?: typeof fetch;
}

export interface AuditedCallResponse {
	providerId: ByokProviderId;
	modelUsed: string;
	text: string;
	sanitizedPrompt: string;
	redactionsApplied: number;
	detectedCategories: string[];
	durationMs: number;
	sessionLeaseId: string;
	completedAt: string;
}

export interface AuditedGatewayReceipt {
	id: string;
	timestamp: string;
	providerId: ByokProviderId;
	model: string;
	sessionLeaseId: string | null;
	redactionsApplied: number;
	detectedCategories: string[];
	durationMs: number;
	status: 'COMPLETED' | 'REFUSED_NO_CREDENTIALS' | 'BLOCKED_BY_PII_GUARDRAIL' | 'PROVIDER_ERROR';
	message: string;
}

export class FinancialGuardrailError extends Error {
	public readonly code = 'FINANCIAL_GUARDRAIL_NO_CREDENTIALS';

	constructor(message?: string) {
		super(
			message ||
				'Financial Guardrail Refusal: No personal API key or local model endpoint is configured in session memory. Signals Agents has no operator-funded key path and never substitutes credentials or simulates responses. Please enter your provider API key or local model endpoint (LM Studio / Ollama) in the BYOK Ephemeral Connector.',
		);
		this.name = 'FinancialGuardrailError';
	}
}

export class PiiGuardrailBlockedError extends Error {
	public readonly code = 'PII_GUARDRAIL_BLOCKED';
	public readonly detectedCategories: string[];

	constructor(message: string, detectedCategories: string[]) {
		super(message);
		this.name = 'PiiGuardrailBlockedError';
		this.detectedCategories = detectedCategories;
	}
}

interface InternalCredentialEntry {
	providerId: ByokProviderId;
	mode: 'api_key' | 'local_endpoint';
	apiKey?: string;
	baseUrl?: string;
	defaultModel: string;
	sessionLeaseId: string;
	provisionedAt: string;
}

export const DEFAULT_PROVIDER_MODELS: Record<ByokProviderId, string> = {
	gemini: 'gemini-2.5-flash',
	openai: 'gpt-4o-mini',
	anthropic: 'claude-3-5-haiku-latest',
	openrouter: 'openai/gpt-4o-mini',
	together: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
	perplexity: 'sonar',
	local: 'local-model',
};

export const DEFAULT_PROVIDER_ENDPOINTS: Record<ByokProviderId, string> = {
	gemini: 'https://generativelanguage.googleapis.com/v1beta',
	openai: 'https://api.openai.com/v1/chat/completions',
	anthropic: 'https://api.anthropic.com/v1/messages',
	openrouter: 'https://openrouter.ai/api/v1/chat/completions',
	together: 'https://api.together.xyz/v1/chat/completions',
	perplexity: 'https://api.perplexity.ai/chat/completions',
	local: 'http://localhost:1234/v1',
};

// ============================================================================
// PRIVATE PAGE-SESSION MEMORY STORE (Never persisted to disk, storage, or cookies)
// ============================================================================
const ephemeralCredentialStore = new Map<ByokProviderId, InternalCredentialEntry>();
let activeProviderIdState: ByokProviderId = 'gemini';
const gatewayAuditTrail: AuditedGatewayReceipt[] = [];
const stateListeners = new Set<() => void>();

function notifyListeners(): void {
	stateListeners.forEach((listener) => {
		try {
			listener();
		} catch {
			// Ignore listener errors
		}
	});
}

function generateEphemeralLeaseId(prefix = 'lease'): string {
	const rand = Math.random().toString(16).slice(2, 10);
	const time = Date.now().toString(16).slice(-4);
	return `${prefix}_${time}${rand}`;
}

function maskKeyForDisplay(rawKey: string): string {
	const trimmed = rawKey.trim();
	if (trimmed.length <= 8) {
		return '••••••••';
	}
	return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

export function subscribeByokConnector(listener: () => void): () => void {
	stateListeners.add(listener);
	return () => {
		stateListeners.delete(listener);
	};
}

export function getActiveProviderId(): ByokProviderId {
	return activeProviderIdState;
}

export function setActiveProviderId(providerId: ByokProviderId): void {
	activeProviderIdState = providerId;
	notifyListeners();
}

/**
 * Stores a personal provider API key strictly in page-session RAM.
 */
export function setByokApiKey(
	providerId: Exclude<ByokProviderId, 'local'>,
	apiKey: string,
	defaultModel?: string,
): EphemeralCredentialStatus {
	const cleaned = apiKey.trim();
	if (!cleaned) {
		throw new Error('API key cannot be empty. Provide a valid personal provider API key.');
	}

	const entry: InternalCredentialEntry = {
		providerId,
		mode: 'api_key',
		apiKey: cleaned,
		defaultModel: defaultModel?.trim() || DEFAULT_PROVIDER_MODELS[providerId],
		sessionLeaseId: generateEphemeralLeaseId(`byok_${providerId}`),
		provisionedAt: new Date().toISOString(),
	};

	ephemeralCredentialStore.set(providerId, entry);
	activeProviderIdState = providerId;
	notifyListeners();
	return getByokStatus(providerId);
}

/**
 * Configures a local model endpoint (LM Studio / Ollama style HTTP base URL, no API key required)
 * strictly in page-session RAM.
 */
export function setByokLocalEndpoint(
	baseUrl: string,
	modelName?: string,
): EphemeralCredentialStatus {
	const cleanedUrl = baseUrl.trim().replace(/\/+$/, '');
	if (!cleanedUrl || !/^https?:\/\//i.test(cleanedUrl)) {
		throw new Error(
			'Local model endpoint must be a valid http:// or https:// base URL (e.g. http://localhost:1234/v1 or http://localhost:11434/v1).',
		);
	}

	const entry: InternalCredentialEntry = {
		providerId: 'local',
		mode: 'local_endpoint',
		baseUrl: cleanedUrl,
		defaultModel: modelName?.trim() || DEFAULT_PROVIDER_MODELS.local,
		sessionLeaseId: generateEphemeralLeaseId('byok_local'),
		provisionedAt: new Date().toISOString(),
	};

	ephemeralCredentialStore.set('local', entry);
	activeProviderIdState = 'local';
	notifyListeners();
	return getByokStatus('local');
}

/**
 * Returns non-secret status metadata for a provider or the currently active provider.
 * Never exposes the raw API key string.
 */
export function getByokStatus(providerId?: ByokProviderId): EphemeralCredentialStatus {
	const target = providerId || activeProviderIdState;
	const entry = ephemeralCredentialStore.get(target);

	if (!entry) {
		return {
			providerId: target,
			configured: false,
			mode: 'unconfigured',
			maskedKeyPreview: null,
			baseUrl: null,
			defaultModel: DEFAULT_PROVIDER_MODELS[target],
			sessionLeaseId: null,
			provisionedAt: null,
		};
	}

	return {
		providerId: entry.providerId,
		configured: true,
		mode: entry.mode,
		maskedKeyPreview: entry.apiKey ? maskKeyForDisplay(entry.apiKey) : null,
		baseUrl: entry.baseUrl || null,
		defaultModel: entry.defaultModel,
		sessionLeaseId: entry.sessionLeaseId,
		provisionedAt: entry.provisionedAt,
	};
}

export function getAllByokStatuses(): EphemeralCredentialStatus[] {
	const ids: ByokProviderId[] = [
		'gemini',
		'openai',
		'anthropic',
		'openrouter',
		'together',
		'perplexity',
		'local',
	];
	return ids.map((id) => getByokStatus(id));
}

export function hasActiveByokCredential(providerId?: ByokProviderId): boolean {
	if (providerId) {
		return ephemeralCredentialStore.has(providerId);
	}
	return (
		ephemeralCredentialStore.has(activeProviderIdState) ||
		ephemeralCredentialStore.size > 0
	);
}

/**
 * Immediately purges a single provider's credential from page-session memory.
 */
export function clearByokCredential(providerId?: ByokProviderId): void {
	const target = providerId || activeProviderIdState;
	ephemeralCredentialStore.delete(target);
	notifyListeners();
}

/**
 * Immediately purges ALL credentials from page-session memory (0ms retention).
 * Also invoked to simulate or handle page unload/reload cleanup.
 */
export function clearAllByokCredentials(): void {
	ephemeralCredentialStore.clear();
	notifyListeners();
}

/**
 * Resets all in-memory connector state (credentials + audit trail).
 * Used on page unload and in unit tests verifying reload ephemeral behavior.
 */
export function resetByokSessionMemory(): void {
	ephemeralCredentialStore.clear();
	gatewayAuditTrail.length = 0;
	activeProviderIdState = 'gemini';
	notifyListeners();
}

export function getByokAuditTrail(): AuditedGatewayReceipt[] {
	return [...gatewayAuditTrail];
}

// Automatically clear in-memory credentials when the browser tab/window unloads
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
	window.addEventListener('beforeunload', () => {
		ephemeralCredentialStore.clear();
	});
}

// ============================================================================
// PII, API KEY & FINANCIAL SAFETY GUARDRAIL REDACTOR
// ============================================================================

/**
 * Redacts PII patterns (emails, phone numbers, SSNs, embedded API keys/secrets,
 * and payment card / financial account identifiers) before any prompt leaves the page.
 */
export function redactPiiFromText(
	input: string,
	options?: {
		policy?: GuardrailPolicyMode;
		activeProviderKeyToExcludeFromLeak?: string;
	},
): PiiRedactionResult {
	if (!input) {
		return {
			sanitizedText: '',
			redactedCount: 0,
			piiCount: 0,
			financialCount: 0,
			apiKeyCount: 0,
			detectedCategories: [],
			blocked: false,
		};
	}

	const policy: GuardrailPolicyMode = options?.policy || 'mask';
	let working = input;
	let piiCount = 0;
	let financialCount = 0;
	let apiKeyCount = 0;
	const categories = new Set<string>();

	// 0. If the active provider key itself was accidentally pasted into the prompt text, redact it
	const activeKey = options?.activeProviderKeyToExcludeFromLeak?.trim();
	if (activeKey && activeKey.length >= 8 && working.includes(activeKey)) {
		const parts = working.split(activeKey);
		const occurrences = parts.length - 1;
		apiKeyCount += occurrences;
		categories.add('Embedded Provider API Key');
		if (policy === 'mask') {
			working = parts.join('[REDACTED_API_KEY]');
		}
	}

	// 1. Embedded API keys & secret tokens in prompt text:
	// Covers OpenAI/Anthropic (sk-...), Google (AIza...), GitHub (ghp_/gho_/github_pat_),
	// Slack (xoxb-/xoxp-), AWS (AKIA...), Perplexity (pplx-...), HuggingFace (hf_...), Groq (gsk_...),
	// and explicit key assignments (api_key=..., apikey: ...)
	const apiKeyPatterns: RegExp[] = [
		/\bsk-(?:ant-|proj-|live-|test-)?[A-Za-z0-9_-]{16,}\b/g,
		/\bAIza[0-9A-Za-z_-]{30,}\b/g,
		/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
		/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
		/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
		/\bAKIA[0-9A-Z]{16}\b/g,
		/\bpplx-[A-Za-z0-9]{20,}\b/g,
		/\b(?:hf|gsk)_[A-Za-z0-9]{20,}\b/g,
		/\b(?:api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*["']?([A-Za-z0-9_\-.~+/]{12,})["']?/gi,
	];

	for (const pattern of apiKeyPatterns) {
		const matches = working.match(pattern);
		if (matches && matches.length > 0) {
			apiKeyCount += matches.length;
			categories.add('API Key / Secret Token');
			if (policy === 'mask') {
				working = working.replace(pattern, '[REDACTED_API_KEY]');
			}
		}
	}

	// 2. Financial identifiers: Payment Card PANs (16 digits) & Bank Account/Routing/IBAN
	const creditCardRegex = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g;
	const acctNumberRegex = /\b(?:acct|account|routing|iban)[:#\s-]*([A-Z0-9-]{6,22})\b/gi;

	const cardMatches = working.match(creditCardRegex);
	if (cardMatches && cardMatches.length > 0) {
		financialCount += cardMatches.length;
		categories.add('Payment Card PAN');
		if (policy === 'mask') {
			working = working.replace(creditCardRegex, '[REDACTED_FINANCIAL_CARD]');
		}
	}

	const acctMatches = working.match(acctNumberRegex);
	if (acctMatches && acctMatches.length > 0) {
		financialCount += acctMatches.length;
		categories.add('Financial Account Identifier');
		if (policy === 'mask') {
			working = working.replace(acctNumberRegex, '[REDACTED_FINANCIAL_ACCOUNT]');
		}
	}

	// 3. Social Security Numbers (SSN: XXX-XX-XXXX)
	const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g;
	const ssnMatches = working.match(ssnRegex);
	if (ssnMatches && ssnMatches.length > 0) {
		piiCount += ssnMatches.length;
		categories.add('Social Security Number (SSN)');
		if (policy === 'mask') {
			working = working.replace(ssnRegex, '[REDACTED_SSN]');
		}
	}

	// 4. Email Addresses
	const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
	const emailMatches = working.match(emailRegex);
	if (emailMatches && emailMatches.length > 0) {
		piiCount += emailMatches.length;
		categories.add('Email Address');
		if (policy === 'mask') {
			working = working.replace(emailRegex, '[REDACTED_EMAIL]');
		}
	}

	// 5. Phone Numbers (US & international formats including parenthesized area codes)
	const phoneRegex = /(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\b\d{3})[-.\s]?\d{3}[-.\s]\d{4}\b/g;
	const phoneMatches = working.match(phoneRegex);
	if (phoneMatches && phoneMatches.length > 0) {
		piiCount += phoneMatches.length;
		categories.add('Phone Number');
		if (policy === 'mask') {
			working = working.replace(phoneRegex, '[REDACTED_PHONE]');
		}
	}

	const detectedCategories = Array.from(categories);
	const redactedCount = piiCount + financialCount + apiKeyCount;

	if (policy === 'block' && redactedCount > 0) {
		return {
			sanitizedText: working,
			redactedCount,
			piiCount,
			financialCount,
			apiKeyCount,
			detectedCategories,
			blocked: true,
			blockReason: `PII/Financial Guardrail Blocked Execution: detected ${redactedCount} sensitive item(s) (${detectedCategories.join(', ')}).`,
		};
	}

	return {
		sanitizedText: working,
		redactedCount,
		piiCount,
		financialCount,
		apiKeyCount,
		detectedCategories,
		blocked: false,
	};
}

// ============================================================================
// SINGLE AUDITED NETWORK GATEWAY FOR ALL PROVIDER CALLS
// ============================================================================

function resolveTargetCredential(
	requestedProviderId?: ByokProviderId,
): InternalCredentialEntry {
	if (requestedProviderId && ephemeralCredentialStore.has(requestedProviderId)) {
		return ephemeralCredentialStore.get(requestedProviderId)!;
	}
	if (ephemeralCredentialStore.has(activeProviderIdState)) {
		return ephemeralCredentialStore.get(activeProviderIdState)!;
	}
	const firstConfigured = ephemeralCredentialStore.values().next().value;
	if (firstConfigured) {
		return firstConfigured;
	}

	const targetProvider = requestedProviderId || activeProviderIdState;
	gatewayAuditTrail.unshift({
		id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
		timestamp: new Date().toISOString(),
		providerId: targetProvider,
		model: DEFAULT_PROVIDER_MODELS[targetProvider],
		sessionLeaseId: null,
		redactionsApplied: 0,
		detectedCategories: [],
		durationMs: 0,
		status: 'REFUSED_NO_CREDENTIALS',
		message:
			'Refused by Financial Guardrail: No personal API key or local model endpoint configured in session memory.',
	});
	notifyListeners();
	throw new FinancialGuardrailError();
}

/**
 * Single audited entry point for every LLM / provider network call.
 * - Enforces the Financial Guardrail (refuses immediately if no personal API key or local endpoint is in RAM).
 * - Enforces the PII Guardrail (redacts emails, phones, SSNs, embedded API keys, and financial numbers before sending).
 * - Dispatches directly to the provider's official API or local model endpoint.
 */
export async function executeAuditedProviderCall(
	request: AuditedCallRequest,
): Promise<AuditedCallResponse> {
	const startTime = Date.now();
	const credential = resolveTargetCredential(request.providerId);
	const providerId = credential.providerId;
	const policy: GuardrailPolicyMode = request.guardrailPolicy || 'mask';
	const fetchFn = request.fetchImpl || globalThis.fetch;

	if (typeof fetchFn !== 'function') {
		throw new Error('Browser fetch API is unavailable in this environment.');
	}

	// 1. Run PII & Secret Guardrail on prompt, system prompt, and upstream context BEFORE network call
	const promptScan = redactPiiFromText(request.prompt, {
		policy,
		activeProviderKeyToExcludeFromLeak: credential.apiKey,
	});
	const systemScan = redactPiiFromText(request.systemPrompt || '', {
		policy,
		activeProviderKeyToExcludeFromLeak: credential.apiKey,
	});
	const upstreamScan = redactPiiFromText(request.upstreamContext || '', {
		policy,
		activeProviderKeyToExcludeFromLeak: credential.apiKey,
	});

	const allCategories = Array.from(
		new Set([
			...promptScan.detectedCategories,
			...systemScan.detectedCategories,
			...upstreamScan.detectedCategories,
		]),
	);
	const totalInputRedactions =
		promptScan.redactedCount +
		systemScan.redactedCount +
		upstreamScan.redactedCount;

	if (promptScan.blocked || systemScan.blocked || upstreamScan.blocked) {
		const reason =
			promptScan.blockReason ||
			systemScan.blockReason ||
			upstreamScan.blockReason ||
			'Blocked by strict PII/Financial guardrail.';

		gatewayAuditTrail.unshift({
			id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
			timestamp: new Date().toISOString(),
			providerId,
			model: request.model || credential.defaultModel,
			sessionLeaseId: credential.sessionLeaseId,
			redactionsApplied: totalInputRedactions,
			detectedCategories: allCategories,
			durationMs: Date.now() - startTime,
			status: 'BLOCKED_BY_PII_GUARDRAIL',
			message: reason,
		});
		notifyListeners();
		throw new PiiGuardrailBlockedError(reason, allCategories);
	}

	const composedUserContent = [
		promptScan.sanitizedText,
		upstreamScan.sanitizedText
			? `\n\n--- Upstream Step Context (Sanitized) ---\n${upstreamScan.sanitizedText}`
			: '',
	]
		.filter(Boolean)
		.join('');

	const effectiveModel =
		request.model &&
		(providerId === 'gemini' || !request.model.startsWith('gemini-'))
			? request.model
			: credential.defaultModel;

	let rawOutputText = '';

	try {
		if (providerId === 'gemini') {
			const geminiModel = effectiveModel.startsWith('gemini-')
				? effectiveModel
				: credential.defaultModel;
			const url = `${DEFAULT_PROVIDER_ENDPOINTS.gemini}/models/${encodeURIComponent(
				geminiModel,
			)}:generateContent?key=${encodeURIComponent(credential.apiKey!)}`;

			const body: Record<string, unknown> = {
				contents: [
					{
						role: 'user',
						parts: [{ text: composedUserContent }],
					},
				],
			};

			if (systemScan.sanitizedText) {
				body.systemInstruction = {
					parts: [{ text: systemScan.sanitizedText }],
				};
			}

			if (request.responseFormat === 'json') {
				body.generationConfig = {
					responseMimeType: 'application/json',
					temperature: request.temperature ?? 0.2,
				};
			}

			const res = await fetchFn(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});

			if (!res.ok) {
				const errText = await res.text();
				throw new Error(
					`Gemini API error (${res.status}): ${errText.slice(0, 240)}`,
				);
			}

			const data: any = await res.json();
			rawOutputText =
				data?.candidates?.[0]?.content?.parts
					?.map((p: any) => p?.text || '')
					.join('') || '';
		} else if (providerId === 'anthropic') {
			const res = await fetchFn(DEFAULT_PROVIDER_ENDPOINTS.anthropic, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': credential.apiKey!,
					'anthropic-version': '2023-06-01',
					'anthropic-dangerous-direct-browser-access': 'true',
				},
				body: JSON.stringify({
					model: effectiveModel,
					max_tokens: 2048,
					system: systemScan.sanitizedText || undefined,
					messages: [{ role: 'user', content: composedUserContent }],
				}),
			});

			if (!res.ok) {
				const errText = await res.text();
				throw new Error(
					`Anthropic API error (${res.status}): ${errText.slice(0, 240)}`,
				);
			}

			const data: any = await res.json();
			rawOutputText =
				data?.content
					?.map((block: any) => block?.text || '')
					.join('') || '';
		} else if (providerId === 'local') {
			// Local LM Studio / Ollama OpenAI-compatible endpoint (no API key required)
			const base = credential.baseUrl!.replace(/\/+$/, '');
			const chatUrl = base.endsWith('/chat/completions')
				? base
				: base.endsWith('/v1')
				? `${base}/chat/completions`
				: `${base}/v1/chat/completions`;

			const messages: Array<{ role: string; content: string }> = [];
			if (systemScan.sanitizedText) {
				messages.push({ role: 'system', content: systemScan.sanitizedText });
			}
			messages.push({ role: 'user', content: composedUserContent });

			const res = await fetchFn(chatUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: effectiveModel,
					messages,
					temperature: request.temperature ?? 0.2,
				}),
			});

			if (!res.ok) {
				const errText = await res.text();
				throw new Error(
					`Local model endpoint error (${res.status}): ${errText.slice(0, 240)}`,
				);
			}

			const data: any = await res.json();
			rawOutputText =
				data?.choices?.[0]?.message?.content ||
				data?.response ||
				'';
		} else {
			// OpenAI-compatible cloud providers: openai, openrouter, together, perplexity
			const endpoint = DEFAULT_PROVIDER_ENDPOINTS[providerId];
			const messages: Array<{ role: string; content: string }> = [];
			if (systemScan.sanitizedText) {
				messages.push({ role: 'system', content: systemScan.sanitizedText });
			}
			messages.push({ role: 'user', content: composedUserContent });

			const res = await fetchFn(endpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${credential.apiKey!}`,
				},
				body: JSON.stringify({
					model: effectiveModel,
					messages,
					temperature: request.temperature ?? 0.2,
				}),
			});

			if (!res.ok) {
				const errText = await res.text();
				throw new Error(
					`${providerId.toUpperCase()} API error (${res.status}): ${errText.slice(
						0,
						240,
					)}`,
				);
			}

			const data: any = await res.json();
			rawOutputText = data?.choices?.[0]?.message?.content || '';
		}
	} catch (err: any) {
		const durationMs = Date.now() - startTime;
		gatewayAuditTrail.unshift({
			id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
			timestamp: new Date().toISOString(),
			providerId,
			model: effectiveModel,
			sessionLeaseId: credential.sessionLeaseId,
			redactionsApplied: totalInputRedactions,
			detectedCategories: allCategories,
			durationMs,
			status: 'PROVIDER_ERROR',
			message: err?.message || 'Provider API request failed',
		});
		notifyListeners();
		throw err;
	}

	// Scrub output through PII redactor as well
	const outputScan = redactPiiFromText(rawOutputText, {
		policy: 'mask',
		activeProviderKeyToExcludeFromLeak: credential.apiKey,
	});

	const finalCategories = Array.from(
		new Set([...allCategories, ...outputScan.detectedCategories]),
	);
	const totalRedactions = totalInputRedactions + outputScan.redactedCount;
	const durationMs = Math.max(1, Date.now() - startTime);
	const completedAt = new Date().toISOString();

	gatewayAuditTrail.unshift({
		id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
		timestamp: completedAt,
		providerId,
		model: effectiveModel,
		sessionLeaseId: credential.sessionLeaseId,
		redactionsApplied: totalRedactions,
		detectedCategories: finalCategories,
		durationMs,
		status: 'COMPLETED',
		message: `Audited ${providerId} call completed (${totalRedactions} redactions applied).`,
	});
	notifyListeners();

	return {
		providerId,
		modelUsed: effectiveModel,
		text: outputScan.sanitizedText,
		sanitizedPrompt: promptScan.sanitizedText,
		redactionsApplied: totalRedactions,
		detectedCategories: finalCategories,
		durationMs,
		sessionLeaseId: credential.sessionLeaseId,
		completedAt,
	};
}
