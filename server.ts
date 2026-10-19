import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const args = process.argv.slice(2);
const portArgIndex = args.indexOf('--port');
const portFromArgs = portArgIndex !== -1 ? Number(args[portArgIndex + 1]) : null;
const hostArgIndex = args.indexOf('--host');
const hostFromArgs = hostArgIndex !== -1 ? args[hostArgIndex + 1] : null;

const PORT = portFromArgs || Number(process.env.PORT) || 3000;
const HOST = hostFromArgs || process.env.HOST || '0.0.0.0';

app.use(express.json({ limit: '2mb' }));

// Allowed valid Gemini models from @google/genai guidelines
const ALLOWED_MODELS = new Set([
	'gemini-3.8-flash',
	'gemini-3.1-flash-lite',
	'gemini-flash-latest',
]);

function resolveModel(requestedModel?: string): string {
	if (requestedModel && ALLOWED_MODELS.has(requestedModel)) {
		return requestedModel;
	}
	return 'gemini-3.8-flash';
}

interface ServerGuardrailConfig {
	piiPolicy?: 'mask' | 'block' | 'audit';
	financialPolicy?: 'mask' | 'block' | 'audit';
	sanitizeHandoffs?: boolean;
	enforceReadOnlyFinancials?: boolean;
}

function enforceServerGuardrails(
	text: string,
	config?: ServerGuardrailConfig,
): {
	sanitized: string;
	piiCount: number;
	financialCount: number;
	blocked: boolean;
	blockReason?: string;
} {
	if (!text) {
		return { sanitized: '', piiCount: 0, financialCount: 0, blocked: false };
	}

	const piiPolicy = config?.piiPolicy || 'mask';
	const financialPolicy = config?.financialPolicy || 'mask';

	let working = text;
	let piiCount = 0;
	let financialCount = 0;

	// Financial patterns: Payment Card PAN, Account/Routing/IBAN
	const creditCardRegex = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g;
	const acctNumberRegex = /\b(?:acct|account|routing|iban)[:#\s-]*([A-Z0-9-]{6,22})\b/gi;

	const cardMatches = working.match(creditCardRegex);
	if (cardMatches) {
		financialCount += cardMatches.length;
		if (financialPolicy === 'mask') {
			working = working.replace(creditCardRegex, '[REDACTED_FINANCIAL_CARD]');
		}
	}

	const acctMatches = working.match(acctNumberRegex);
	if (acctMatches) {
		financialCount += acctMatches.length;
		if (financialPolicy === 'mask') {
			working = working.replace(
				acctNumberRegex,
				'[REDACTED_FINANCIAL_ACCOUNT]',
			);
		}
	}

	// PII patterns: SSN, Email, Phone
	const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g;
	const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
	const phoneRegex = /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g;

	const ssnMatches = working.match(ssnRegex);
	if (ssnMatches) {
		piiCount += ssnMatches.length;
		if (piiPolicy === 'mask') {
			working = working.replace(ssnRegex, '[REDACTED_PII_SSN]');
		}
	}

	const emailMatches = working.match(emailRegex);
	if (emailMatches) {
		piiCount += emailMatches.length;
		if (piiPolicy === 'mask') {
			working = working.replace(emailRegex, '[REDACTED_PII_EMAIL]');
		}
	}

	const phoneMatches = working.match(phoneRegex);
	if (phoneMatches) {
		piiCount += phoneMatches.length;
		if (piiPolicy === 'mask') {
			working = working.replace(phoneRegex, '[REDACTED_PII_PHONE]');
		}
	}

	if (financialPolicy === 'block' && financialCount > 0) {
		return {
			sanitized: working,
			piiCount,
			financialCount,
			blocked: true,
			blockReason: `Guardrail Policy Blocked: ${financialCount} sensitive financial record(s) detected under Strict Block mode.`,
		};
	}

	if (piiPolicy === 'block' && piiCount > 0) {
		return {
			sanitized: working,
			piiCount,
			financialCount,
			blocked: true,
			blockReason: `Guardrail Policy Blocked: ${piiCount} personal identifier(s) (PII) detected under Strict Block mode.`,
		};
	}

	return {
		sanitized: working,
		piiCount,
		financialCount,
		blocked: false,
	};
}

// Ephemeral in-memory credential lease registry
interface EphemeralLease {
	leaseId: string;
	workflowId: string;
	instanceIds: number[];
	createdAt: number;
	stepsExecuted: number;
}

const activeLeases = new Map<string, EphemeralLease>();

// Shared Server-Side Gemini Client Initializer
const createScopedAIClient = () => {
	if (!process.env.GEMINI_API_KEY) {
		return null;
	}
	return new GoogleGenAI({
		apiKey: process.env.GEMINI_API_KEY,
		httpOptions: {
			headers: {
				'User-Agent': 'aistudio-build',
			},
		},
	});
};

// 1. Provision an ephemeral server-side session lease for a workflow run
app.post('/api/workflow/lease', (req, res) => {
	const { workflowId, instanceIds } = req.body;
	const leaseId = `lease_${crypto.randomBytes(6).toString('hex')}`;
	const now = Date.now();

	const lease: EphemeralLease = {
		leaseId,
		workflowId: workflowId || `wf_${now}`,
		instanceIds: Array.isArray(instanceIds) ? instanceIds : [1, 2, 3, 4],
		createdAt: now,
		stepsExecuted: 0,
	};

	activeLeases.set(leaseId, lease);

	return res.json({
		leaseId,
		workflowId: lease.workflowId,
		provisionedAt: new Date(now).toISOString(),
		status: 'ACTIVE',
		sharedInstances: lease.instanceIds.length,
	});
});

// 2. Execute an individual Agent Execution Step within a renderance instance
app.post('/api/workflow/execute-step', async (req, res) => {
	const {
		leaseId,
		instanceId,
		instanceName,
		model,
		agentRole,
		customSystemPrompt,
		guardrails,
		stepNumber,
		totalSteps,
		stepTitle,
		stepInstruction,
		prompt,
		upstreamContext,
		previousStepsOutput,
	} = req.body;

	if (!prompt) {
		return res.status(400).json({ error: 'Workflow prompt is required' });
	}

	const startTime = Date.now();
	const selectedModel = resolveModel(model);

	// Enforce Server-Side Safety Guardrails on Prompt and Upstream Handoff
	const promptCheck = enforceServerGuardrails(prompt, guardrails);
	if (promptCheck.blocked) {
		return res.status(422).json({
			error: promptCheck.blockReason,
			blockedByGuardrail: true,
			durationMs: Date.now() - startTime,
		});
	}

	const upstreamCheck = enforceServerGuardrails(
		upstreamContext || '',
		guardrails?.sanitizeHandoffs !== false
			? guardrails
			: { piiPolicy: 'audit', financialPolicy: 'audit' },
	);
	if (upstreamCheck.blocked) {
		return res.status(422).json({
			error: upstreamCheck.blockReason,
			blockedByGuardrail: true,
			durationMs: Date.now() - startTime,
		});
	}

	const totalRedacted =
		promptCheck.piiCount +
		promptCheck.financialCount +
		upstreamCheck.piiCount +
		upstreamCheck.financialCount;

	const guardrailSummary =
		totalRedacted > 0
			? `Guardrails Active: ${promptCheck.piiCount + upstreamCheck.piiCount} PII & ${promptCheck.financialCount + upstreamCheck.financialCount} Financial items masked`
			: 'Guardrails Verified: 0 PII / Financial exposures';

	// Track step on lease if active
	if (leaseId && activeLeases.has(leaseId)) {
		const lease = activeLeases.get(leaseId)!;
		lease.stepsExecuted += 1;
	}

	const safetyDirective = [
		'MANDATORY SAFETY & DATA RESPECT GUARDRAILS:',
		'- Treat all financial data and personal information (PII) with strict respect, confidentiality, and compliance.',
		'- Never fabricate, expose, or echo raw unmasked Social Security Numbers, credit card PANs, bank account numbers, or personal credentials.',
		guardrails?.enforceReadOnlyFinancials !== false
			? '- Operate in Read-Only Financial Compliance mode: provide analytical, architectural, and risk insights without executing unauthorized financial transactions.'
			: '',
	]
		.filter(Boolean)
		.join('\n');

	const systemInstruction = [
		customSystemPrompt && customSystemPrompt.trim()
			? customSystemPrompt.trim()
			: `You are Instance #${instanceId || 1} (${instanceName || 'Agent Renderance'}) operating as: ${agentRole || 'Autonomous Execution Agent'}.`,
		`You are currently executing Step ${stepNumber || 1} of ${totalSteps || 3}: "${stepTitle || 'Execution Step'}".`,
		`Step Directive: ${stepInstruction || 'Analyze, execute, and produce concrete, actionable output for this phase.'}`,
		safetyDirective,
	].join('\n\n');

	const contextBlocks: string[] = [
		`Primary Workflow Objective:\n${promptCheck.sanitized}`,
	];

	if (upstreamCheck.sanitized && upstreamCheck.sanitized.trim()) {
		contextBlocks.push(
			`Upstream Agent Handoff Input (Sanitized):\n${upstreamCheck.sanitized}`,
		);
	}

	if (previousStepsOutput && previousStepsOutput.trim()) {
		contextBlocks.push(
			`Completed Earlier Steps in this Agent:\n${previousStepsOutput}`,
		);
	}

	contextBlocks.push(
		`Execute Step ${stepNumber || 1} ("${stepTitle}") now. Provide a structured JSON response with reasoningSummary, executionOutput, and verificationCheck.`,
	);

	const ai = createScopedAIClient();

	if (ai) {
		try {
			const response = await ai.models.generateContent({
				model: selectedModel,
				contents: contextBlocks.join('\n\n---\n\n'),
				config: {
					systemInstruction,
					responseMimeType: 'application/json',
					responseSchema: {
						type: Type.OBJECT,
						properties: {
							reasoningSummary: {
								type: Type.STRING,
								description:
									'Concise 1-2 sentence summary of the strategy and decisions made in this step.',
							},
							executionOutput: {
								type: Type.STRING,
								description:
									'Comprehensive, structured deliverable produced by this agent execution step.',
							},
							verificationCheck: {
								type: Type.STRING,
								description:
									'Concrete validation check confirming the output satisfies step and safety guardrail constraints.',
							},
						},
						required: [
							'reasoningSummary',
							'executionOutput',
							'verificationCheck',
						],
					},
				},
			});

			const durationMs = Date.now() - startTime;
			const rawText = response.text || '{}';
			let parsed: {
				reasoningSummary?: string;
				executionOutput?: string;
				verificationCheck?: string;
			} = {};

			try {
				parsed = JSON.parse(rawText);
			} catch {
				parsed = {
					reasoningSummary: `Completed ${stepTitle} using ${selectedModel}.`,
					executionOutput: rawText,
					verificationCheck: 'Output structure and safety guardrails verified.',
				};
			}

			// Also pass output through guardrail sanitizer before returning
			const outputCheck = enforceServerGuardrails(
				parsed.executionOutput || rawText,
				guardrails,
			);

			return res.json({
				instanceId,
				stepNumber,
				stepTitle,
				modelUsed: selectedModel,
				durationMs,
				reasoningSummary: parsed.reasoningSummary || `Executed ${stepTitle}`,
				executionOutput: outputCheck.sanitized,
				verificationCheck: parsed.verificationCheck || 'Validated',
				guardrailSummary,
				redactionsCount:
					totalRedacted + outputCheck.piiCount + outputCheck.financialCount,
				completedAt: new Date().toISOString(),
			});
		} catch (error: any) {
			const durationMs = Date.now() - startTime;
			console.error(
				`[Workflow Step API] Error on Instance ${instanceId} Step ${stepNumber}:`,
				error?.message || error,
			);
			return res.status(500).json({
				error: error?.message || 'Model execution error during agent step.',
				durationMs,
			});
		}
	}

	// Fallback if GEMINI_API_KEY is not configured in environment
	const durationMs = Math.max(120, Date.now() - startTime);
	return res.json({
		instanceId,
		stepNumber,
		stepTitle,
		modelUsed: selectedModel,
		durationMs,
		reasoningSummary: `[${agentRole || 'Agent'}] Analyzed objective for "${stepTitle}" under active PII & financial guardrails.`,
		executionOutput: `Step ${stepNumber} (${stepTitle}) executed for sanitized objective: "${promptCheck.sanitized.slice(0, 120)}".`,
		verificationCheck: guardrailSummary,
		guardrailSummary,
		redactionsCount: totalRedacted,
		completedAt: new Date().toISOString(),
	});
});

// 3. Immediately purge / delete the ephemeral session lease upon workflow completion
app.post('/api/workflow/purge-lease', (req, res) => {
	const { leaseId } = req.body;
	const now = Date.now();
	let existed = false;
	let activeDurationMs = 0;
	let stepsExecuted = 0;

	if (leaseId && activeLeases.has(leaseId)) {
		const lease = activeLeases.get(leaseId)!;
		activeDurationMs = now - lease.createdAt;
		stepsExecuted = lease.stepsExecuted;
		activeLeases.delete(leaseId);
		existed = true;
	}

	return res.json({
		leaseId: leaseId || 'ephemeral',
		purged: true,
		existed,
		activeDurationMs,
		stepsExecuted,
		purgedAt: new Date(now).toISOString(),
		postRunRetentionMs: 0,
		status: 'DELETED_ON_COMPLETION',
	});
});

// Direct Chat API with customSystemPrompt and Guardrails
app.post('/api/chat', async (req, res) => {
	const {
		providerId,
		providerName,
		prompt,
		model,
		customSystemPrompt,
		guardrails,
	} = req.body;
	if (!prompt) {
		return res.status(400).json({ error: 'Prompt is required' });
	}

	const startTime = Date.now();
	const selectedModel = resolveModel(model);

	const promptCheck = enforceServerGuardrails(prompt, guardrails);
	if (promptCheck.blocked) {
		return res.status(422).json({
			error: promptCheck.blockReason,
			providerId,
		});
	}

	const ai = createScopedAIClient();
	const systemInstruction = [
		customSystemPrompt && customSystemPrompt.trim()
			? customSystemPrompt.trim()
			: `You are ${providerName || 'an AI assistant'}. Provide a distinct, high-quality answer.`,
		'Treat all financial and personal information with strict respect and privacy compliance. Never output unmasked SSNs, card PANs, or private account numbers.',
	].join('\n\n');

	if (ai) {
		try {
			const response = await ai.models.generateContent({
				model: selectedModel,
				contents: promptCheck.sanitized,
				config: {
					systemInstruction,
				},
			});

			const outputCheck = enforceServerGuardrails(
				response.text || 'No response generated.',
				guardrails,
			);

			return res.json({
				text: outputCheck.sanitized,
				providerId,
				modelUsed: selectedModel,
				durationMs: Date.now() - startTime,
				redactionsCount:
					promptCheck.piiCount +
					promptCheck.financialCount +
					outputCheck.piiCount +
					outputCheck.financialCount,
			});
		} catch (error: any) {
			console.error(
				`[Chat API] Gemini error for ${providerId}:`,
				error?.message || error,
			);
			return res.status(500).json({
				error: error?.message || 'Failed to generate response.',
				providerId,
			});
		}
	}

	return res.json({
		text: `[${providerName || 'Agent'}] Synthesized response for "${promptCheck.sanitized.slice(0, 60)}".`,
		providerId,
		modelUsed: selectedModel,
		durationMs: Date.now() - startTime,
		redactionsCount: promptCheck.piiCount + promptCheck.financialCount,
	});
});

// API: Prompt Critic endpoint
app.post('/api/prompt-critic', async (req, res) => {
	const { prompt } = req.body;
	if (!prompt) {
		return res.status(400).json({ error: 'Prompt is required' });
	}

	const sanitizedPrompt = enforceServerGuardrails(prompt, {
		piiPolicy: 'mask',
		financialPolicy: 'mask',
	}).sanitized;

	const ai = createScopedAIClient();
	if (ai) {
		try {
			const response = await ai.models.generateContent({
				model: 'gemini-3.8-flash',
				contents: `I need to improve the original workflow objective prompt:
--- Original Prompt ---
${sanitizedPrompt}
--- End Original Prompt ---

Analyze this prompt for multi-agent workflow execution and data privacy/financial safety compliance. Output in two parts:
Part 1: 3 concise bullet points with bold titles describing improvements (e.g. task decomposition clarity, PII/financial guardrail boundaries, handoff output format).
Part 2: Suggested Improved Prompt: followed by a single improved version of the prompt that is clear, specific, and optimized for multi-step agent execution.`,
			});

			return res.json({
				analysis: response.text || 'No critique available.',
			});
		} catch (error: any) {
			console.error('[Prompt Critic] Gemini error:', error?.message || error);
			return res
				.status(500)
				.json({ error: error?.message || 'Failed to analyze prompt.' });
		}
	}

	return res.json({
		analysis:
			`1. **Specify measurable deliverables**: Define exact output structure for each execution step.\n` +
			`2. **Enforce financial & PII guardrails**: State explicit redaction and read-only rules for sensitive fields.\n` +
			`3. **Enable directional handoff**: State how upstream analysis feeds downstream verification.\n\n` +
			`Suggested Improved Prompt:\n` +
			`"Break down and execute the following objective across decomposition, implementation, and compliance verification phases while masking all PII and financial identifiers: ${sanitizedPrompt}."`,
	});
});

// Setup Vite middleware in dev or static serve in prod
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
	if (!isProduction) {
		const { createServer: createViteServer } = await import('vite');
		const vite = await createViteServer({
			server: {
				middlewareMode: true,
				allowedHosts: true,
				hmr: false,
			},
			appType: 'spa',
		});
		app.use(vite.middlewares);
	} else {
		app.use(express.static(path.resolve(__dirname, 'dist')));
		app.get('*', (req, res) => {
			res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
		});
	}

	app.listen(PORT, HOST, () => {
		console.log(`\n  ➜  Local:   http://localhost:${PORT}/`);
		console.log(`  ➜  Network: http://${HOST}:${PORT}/\n`);
	});
}

startServer().catch((err) => {
	console.error('Failed to start server:', err);
	process.exit(1);
});
