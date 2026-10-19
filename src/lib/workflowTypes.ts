export type GeminiModelId =
	| 'gemini-3.8-flash'
	| 'gemini-3.1-flash-lite'
	| 'gemini-flash-latest';

export type WorkflowTopology =
	| 'parallel' // All 4 instances run simultaneously
	| 'directional' // Sequential chain: Instance 1 -> 2 -> 3 -> 4
	| 'diamond'; // Fan-out/Fan-in: Instance 1 -> [2 & 3 in parallel] -> 4

export type ScheduleMode = 'immediate' | 'delayed' | 'recurring';

export type StepStatus = 'idle' | 'queued' | 'running' | 'completed' | 'error' | 'blocked';

export type LeaseStatus = 'unprovisioned' | 'active' | 'purged';

export type GuardrailActionPolicy = 'mask' | 'block' | 'audit';

export type EnvironmentTheme = 'light' | 'dark' | 'pastel' | 'earthy';

export type KeyRoutingScope = 'shared_four' | 'per_instance';

export interface StepSubTask {
	id: string;
	label: string;
	status: 'pending' | 'active' | 'done';
}

export const ENVIRONMENT_THEMES: {
	id: EnvironmentTheme;
	label: string;
	shortLabel: string;
	swatch: string;
	description: string;
}[] = [
	{
		id: 'earthy',
		label: 'Earthy Tones',
		shortLabel: 'Earthy',
		swatch: '#c25e00',
		description: 'Warm terracotta, roasted umber, olive sage, and sandstone parchment',
	},
	{
		id: 'dark',
		label: 'Obsidian Dark',
		shortLabel: 'Dark',
		swatch: '#4f46e5',
		description: 'Deep carbon slate with high-contrast signal indigo & emerald telemetry',
	},
	{
		id: 'pastel',
		label: 'Pastel Atelier',
		shortLabel: 'Pastel',
		swatch: '#8b5cf6',
		description: 'Soft lavender mist, porcelain lilac, mint sage, and velvet plum ink',
	},
	{
		id: 'light',
		label: 'Alabaster Light',
		shortLabel: 'Light',
		swatch: '#2563eb',
		description: 'Crisp daylight alabaster with pure white cards and deep slate ink',
	},
];

export interface SafetyGuardrailConfig {
	piiPolicy: GuardrailActionPolicy; // SSN, Email, Phone, Personal IDs
	financialPolicy: GuardrailActionPolicy; // Credit Card PAN, Routing/Account, IBAN, Tax ID
	sanitizeHandoffs: boolean; // Scrub sensitive tokens before passing to downstream agents
	enforceReadOnlyFinancials: boolean; // Prevent transactional/execution advice on raw accounts
}

export interface GuardrailScanResult {
	sanitizedText: string;
	piiCount: number;
	financialCount: number;
	detectedTypes: string[];
	blocked: boolean;
	blockReason?: string;
}

export interface AgentExecutionStep {
	id: string;
	stepNumber: number;
	title: string;
	instruction: string;
	status: StepStatus;
	progressPercent?: number;
	currentPhaseLabel?: string;
	elapsedMs?: number;
	subTasks?: StepSubTask[];
	durationMs?: number;
	reasoningSummary?: string;
	executionOutput?: string;
	verificationCheck?: string;
	completedAt?: string;
	error?: string;
	guardrailSummary?: string;
}

export interface InstanceScheduleConfig {
	mode: ScheduleMode;
	delaySeconds: number;
	intervalSeconds: number;
	maxRuns: number;
	runsCompleted: number;
	isScheduledActive: boolean;
	countdownSeconds: number;
}

export interface ChatTurn {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	timestamp: string;
	durationMs?: number;
	modelUsed?: string;
	guardrailNote?: string;
}

export interface WorkflowInstance {
	id: number;
	name: string;
	agentRole: string;
	customSystemPrompt: string;
	model: GeminiModelId;
	enabled: boolean;
	viewMode: 'steps' | 'prompt' | 'guardrails' | 'chat';
	status: 'idle' | 'scheduled' | 'running' | 'completed' | 'error' | 'blocked';
	activeStepIndex: number | null; // 1-based step currently executing
	handoffState: 'idle' | 'receiving' | 'executing' | 'handing_off' | 'completed';
	receivedHandoffFrom: string | null;
	leaseId: string | null;
	leaseStatus: LeaseStatus;
	leasePurgedAt: string | null;
	totalRuntimeMs: number;
	upstreamSourceIds: number[];
	steps: AgentExecutionStep[];
	schedule: InstanceScheduleConfig;
	guardrails: SafetyGuardrailConfig;
	totalRedactionsCount: number;
	chatHistory: ChatTurn[];
	lastDeliverable: string;
}

export interface LeaseAuditEntry {
	id: string;
	leaseId: string;
	scopeLabel: string;
	topology: WorkflowTopology;
	modelsUsed: string[];
	provisionedAt: string;
	purgedAt: string;
	totalDurationMs: number;
	stepsCompleted: number;
	redactionsApplied: number;
	status: 'PURGED_ON_COMPLETION' | 'BLOCKED_BY_GUARDRAIL';
}

export const AVAILABLE_MODELS: {
	id: GeminiModelId;
	label: string;
	tier: string;
	description: string;
}[] = [
	{
		id: 'gemini-3.8-flash',
		label: 'Gemini 3.8 Flash',
		tier: 'Balanced Reasoning',
		description: 'High-efficiency multi-step reasoning and structured agent execution',
	},
	{
		id: 'gemini-3.1-flash-lite',
		label: 'Gemini 3.1 Flash Lite',
		tier: 'Low-Latency Speed',
		description: 'Rapid task decomposition, triage, and high-throughput step execution',
	},
	{
		id: 'gemini-flash-latest',
		label: 'Gemini Flash Latest',
		tier: 'Dynamic Synthesis',
		description: 'Adaptive synthesis, verification, and cross-instance aggregation',
	},
];

export const AGENT_ROLE_PRESETS: {
	role: string;
	defaultSystemPrompt: string;
}[] = [
	{
		role: 'Systems Architect & Planner',
		defaultSystemPrompt:
			'You are Agent 01: Systems Architect & Planner. Decompose the user objective into a rigorous, step-by-step technical plan, define clear interfaces, and prepare a structured specification for downstream agents. Never expose raw personal or financial identifiers.',
	},
	{
		role: 'Core Implementation Engineer',
		defaultSystemPrompt:
			'You are Agent 02: Core Implementation Engineer. Take the objective and upstream architectural specification to build concrete, production-ready logic, algorithms, and data models. Respect all data privacy and financial compliance boundaries.',
	},
	{
		role: 'Security, PII & Financial Compliance Auditor',
		defaultSystemPrompt:
			'You are Agent 03: Security, PII & Financial Compliance Auditor. Audit all upstream plans and implementations for security vulnerabilities, PII leakage, PCI-DSS/financial data exposure, and edge-case failure modes. Enforce strict redaction and least-privilege access.',
	},
	{
		role: 'Executive Synthesis & Release Verifier',
		defaultSystemPrompt:
			'You are Agent 04: Executive Synthesis & Release Verifier. Aggregate and reconcile outputs from all preceding agents into a cohesive, verified final deliverable with clear operational metrics and compliance sign-off.',
	},
	{
		role: 'Quantitative Risk & Financial Analyst',
		defaultSystemPrompt:
			'You are a Quantitative Risk & Financial Analyst. Perform read-only analytical modeling on anonymized financial metrics. Never output or store unmasked account numbers, card PANs, or personal tax identifiers.',
	},
	{
		role: 'Performance & Latency Optimizer',
		defaultSystemPrompt:
			'You are a Performance & Latency Optimizer. Analyze execution paths, memory footprints, and concurrency bottlenecks to maximize throughput while preserving data integrity.',
	},
];

// Client & Server helper to inspect and redact/block PII and Financial data
export function evaluateSafetyGuardrails(
	input: string,
	config: SafetyGuardrailConfig,
): GuardrailScanResult {
	if (!input) {
		return {
			sanitizedText: '',
			piiCount: 0,
			financialCount: 0,
			detectedTypes: [],
			blocked: false,
		};
	}

	let working = input;
	let piiCount = 0;
	let financialCount = 0;
	const detectedSet = new Set<string>();

	// 1. Financial patterns: Credit Card PAN (13-19 digits in groups), IBAN, Routing/Account numbers
	const creditCardRegex = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g;
	const acctNumberRegex = /\b(?:acct|account|routing|iban)[:#\s-]*([A-Z0-9-]{6,22})\b/gi;

	const cardMatches = working.match(creditCardRegex);
	if (cardMatches && cardMatches.length > 0) {
		financialCount += cardMatches.length;
		detectedSet.add('Payment Card PAN');
		if (config.financialPolicy === 'mask') {
			working = working.replace(creditCardRegex, '[REDACTED_FINANCIAL_CARD]');
		}
	}

	const acctMatches = working.match(acctNumberRegex);
	if (acctMatches && acctMatches.length > 0) {
		financialCount += acctMatches.length;
		detectedSet.add('Bank/Account Identifier');
		if (config.financialPolicy === 'mask') {
			working = working.replace(
				acctNumberRegex,
				'[REDACTED_FINANCIAL_ACCOUNT]',
			);
		}
	}

	// 2. PII patterns: SSN (XXX-XX-XXXX), Email, Phone Number
	const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g;
	const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
	const phoneRegex = /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g;

	const ssnMatches = working.match(ssnRegex);
	if (ssnMatches && ssnMatches.length > 0) {
		piiCount += ssnMatches.length;
		detectedSet.add('Social Security Number (SSN)');
		if (config.piiPolicy === 'mask') {
			working = working.replace(ssnRegex, '[REDACTED_PII_SSN]');
		}
	}

	const emailMatches = working.match(emailRegex);
	if (emailMatches && emailMatches.length > 0) {
		piiCount += emailMatches.length;
		detectedSet.add('Personal Email');
		if (config.piiPolicy === 'mask') {
			working = working.replace(emailRegex, '[REDACTED_PII_EMAIL]');
		}
	}

	const phoneMatches = working.match(phoneRegex);
	if (phoneMatches && phoneMatches.length > 0) {
		piiCount += phoneMatches.length;
		detectedSet.add('Phone Number');
		if (config.piiPolicy === 'mask') {
			working = working.replace(phoneRegex, '[REDACTED_PII_PHONE]');
		}
	}

	const detectedTypes = Array.from(detectedSet);

	// Check if policy requires strict blocking
	if (config.financialPolicy === 'block' && financialCount > 0) {
		return {
			sanitizedText: working,
			piiCount,
			financialCount,
			detectedTypes,
			blocked: true,
			blockReason: `Strict Financial Guardrail blocked execution: detected ${financialCount} financial identifier(s) (${detectedTypes.join(', ')}).`,
		};
	}

	if (config.piiPolicy === 'block' && piiCount > 0) {
		return {
			sanitizedText: working,
			piiCount,
			financialCount,
			detectedTypes,
			blocked: true,
			blockReason: `Strict PII Guardrail blocked execution: detected ${piiCount} personal identifier(s) (${detectedTypes.join(', ')}).`,
		};
	}

	return {
		sanitizedText: working,
		piiCount,
		financialCount,
		detectedTypes,
		blocked: false,
	};
}

export function createDefaultStepSubTasks(stepId: string): StepSubTask[] {
	return [
		{
			id: `${stepId}-sub-1`,
			label: 'PII & Financial Guardrail Intake',
			status: 'pending',
		},
		{
			id: `${stepId}-sub-2`,
			label: 'System Prompt & Handoff Context',
			status: 'pending',
		},
		{
			id: `${stepId}-sub-3`,
			label: 'Model Reasoning & Synthesis',
			status: 'pending',
		},
		{
			id: `${stepId}-sub-4`,
			label: 'Deliverable Schema Verification',
			status: 'pending',
		},
	];
}

export function createDefaultSteps(roleIndex: number): AgentExecutionStep[] {
	const templates = [
		[
			{
				title: '01. Scope & Guardrail Intake',
				instruction:
					'Ingest objective, verify data privacy & financial compliance boundaries, and decompose requirements.',
			},
			{
				title: '02. Architectural Blueprint',
				instruction:
					'Formulate the structural design, component contracts, and execution workflow.',
			},
			{
				title: '03. Downstream Handoff Spec',
				instruction:
					'Package a sanitized, structured specification ready for handoff to the next agent.',
			},
		],
		[
			{
				title: '01. Upstream Context Ingestion',
				instruction:
					'Parse upstream agent handoff and map out concrete implementation modules.',
			},
			{
				title: '02. Core Logic Execution',
				instruction:
					'Build the primary solution, algorithms, or analytical model in full technical detail.',
			},
			{
				title: '03. Integrity & Handoff Prep',
				instruction:
					'Verify implementation correctness and format output for compliance auditing.',
			},
		],
		[
			{
				title: '01. PII & Financial Exposure Scan',
				instruction:
					'Audit objective and upstream outputs for sensitive financial records, PII, or compliance risks.',
			},
			{
				title: '02. Guardrail Hardening',
				instruction:
					'Apply least-privilege access controls, encryption/redaction rules, and edge-case mitigations.',
			},
			{
				title: '03. Security Sign-Off Handoff',
				instruction:
					'Certify compliance constraints and pass hardened artifacts to final synthesis.',
			},
		],
		[
			{
				title: '01. Multi-Agent Reconciliation',
				instruction:
					'Combine architectural, engineering, and compliance handoffs across all agents.',
			},
			{
				title: '02. Final Deliverable Synthesis',
				instruction:
					'Produce the unified, executive-grade solution with clear operational steps.',
			},
			{
				title: '03. Final Verification & Key Purge',
				instruction:
					'Confirm all safety guardrails held and finalize output for immediate session key deletion.',
			},
		],
	];

	const chosen = templates[roleIndex % templates.length];
	return chosen.map((item, idx) => {
		const stepId = `step-${roleIndex + 1}-${idx + 1}`;
		return {
			id: stepId,
			stepNumber: idx + 1,
			title: item.title,
			instruction: item.instruction,
			status: 'idle',
			progressPercent: 0,
			elapsedMs: 0,
			currentPhaseLabel: 'Ready for execution',
			subTasks: createDefaultStepSubTasks(stepId),
		};
	});
}

export const INITIAL_FOUR_INSTANCES: WorkflowInstance[] = [
	{
		id: 1,
		name: 'Renderance 01',
		agentRole: AGENT_ROLE_PRESETS[0].role,
		customSystemPrompt: AGENT_ROLE_PRESETS[0].defaultSystemPrompt,
		model: 'gemini-3.1-flash-lite',
		enabled: true,
		viewMode: 'steps',
		status: 'idle',
		activeStepIndex: null,
		handoffState: 'idle',
		receivedHandoffFrom: null,
		leaseId: null,
		leaseStatus: 'unprovisioned',
		leasePurgedAt: null,
		totalRuntimeMs: 0,
		upstreamSourceIds: [],
		steps: createDefaultSteps(0),
		schedule: {
			mode: 'immediate',
			delaySeconds: 10,
			intervalSeconds: 60,
			maxRuns: 3,
			runsCompleted: 0,
			isScheduledActive: false,
			countdownSeconds: 0,
		},
		guardrails: {
			piiPolicy: 'mask',
			financialPolicy: 'mask',
			sanitizeHandoffs: true,
			enforceReadOnlyFinancials: true,
		},
		totalRedactionsCount: 0,
		chatHistory: [],
		lastDeliverable: '',
	},
	{
		id: 2,
		name: 'Renderance 02',
		agentRole: AGENT_ROLE_PRESETS[1].role,
		customSystemPrompt: AGENT_ROLE_PRESETS[1].defaultSystemPrompt,
		model: 'gemini-3.8-flash',
		enabled: true,
		viewMode: 'steps',
		status: 'idle',
		activeStepIndex: null,
		handoffState: 'idle',
		receivedHandoffFrom: null,
		leaseId: null,
		leaseStatus: 'unprovisioned',
		leasePurgedAt: null,
		totalRuntimeMs: 0,
		upstreamSourceIds: [1],
		steps: createDefaultSteps(1),
		schedule: {
			mode: 'immediate',
			delaySeconds: 15,
			intervalSeconds: 60,
			maxRuns: 3,
			runsCompleted: 0,
			isScheduledActive: false,
			countdownSeconds: 0,
		},
		guardrails: {
			piiPolicy: 'mask',
			financialPolicy: 'mask',
			sanitizeHandoffs: true,
			enforceReadOnlyFinancials: true,
		},
		totalRedactionsCount: 0,
		chatHistory: [],
		lastDeliverable: '',
	},
	{
		id: 3,
		name: 'Renderance 03',
		agentRole: AGENT_ROLE_PRESETS[2].role,
		customSystemPrompt: AGENT_ROLE_PRESETS[2].defaultSystemPrompt,
		model: 'gemini-flash-latest',
		enabled: true,
		viewMode: 'steps',
		status: 'idle',
		activeStepIndex: null,
		handoffState: 'idle',
		receivedHandoffFrom: null,
		leaseId: null,
		leaseStatus: 'unprovisioned',
		leasePurgedAt: null,
		totalRuntimeMs: 0,
		upstreamSourceIds: [2],
		steps: createDefaultSteps(2),
		schedule: {
			mode: 'immediate',
			delaySeconds: 20,
			intervalSeconds: 60,
			maxRuns: 3,
			runsCompleted: 0,
			isScheduledActive: false,
			countdownSeconds: 0,
		},
		guardrails: {
			piiPolicy: 'mask',
			financialPolicy: 'mask',
			sanitizeHandoffs: true,
			enforceReadOnlyFinancials: true,
		},
		totalRedactionsCount: 0,
		chatHistory: [],
		lastDeliverable: '',
	},
	{
		id: 4,
		name: 'Renderance 04',
		agentRole: AGENT_ROLE_PRESETS[3].role,
		customSystemPrompt: AGENT_ROLE_PRESETS[3].defaultSystemPrompt,
		model: 'gemini-3.8-flash',
		enabled: true,
		viewMode: 'steps',
		status: 'idle',
		activeStepIndex: null,
		handoffState: 'idle',
		receivedHandoffFrom: null,
		leaseId: null,
		leaseStatus: 'unprovisioned',
		leasePurgedAt: null,
		totalRuntimeMs: 0,
		upstreamSourceIds: [3],
		steps: createDefaultSteps(3),
		schedule: {
			mode: 'immediate',
			delaySeconds: 30,
			intervalSeconds: 60,
			maxRuns: 3,
			runsCompleted: 0,
			isScheduledActive: false,
			countdownSeconds: 0,
		},
		guardrails: {
			piiPolicy: 'mask',
			financialPolicy: 'mask',
			sanitizeHandoffs: true,
			enforceReadOnlyFinancials: true,
		},
		totalRedactionsCount: 0,
		chatHistory: [],
		lastDeliverable: '',
	},
];
