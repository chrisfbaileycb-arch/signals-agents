import { redactPiiFromText } from './byokConnector';

export type GeminiModelId =
	| 'gemini-2.5-flash'
	| 'gemini-2.5-pro'
	| 'gemini-2.0-flash'
	| 'gpt-4o-mini'
	| 'gpt-4o'
	| 'claude-3-5-haiku-latest'
	| 'claude-3-7-sonnet-latest'
	| 'openai/gpt-4o-mini'
	| 'meta-llama/Llama-3.3-70B-Instruct-Turbo'
	| 'sonar'
	| 'local-model';

export type WorkflowTopology = 'directional'; // Sequential chain: Instance 1 -> 2 -> 3 -> 4

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
		id: 'gemini-2.5-flash',
		label: 'Gemini 2.5 Flash',
		tier: 'Google Gemini BYOK',
		description: 'Fast, balanced reasoning for directional workflow steps',
	},
	{
		id: 'gemini-2.5-pro',
		label: 'Gemini 2.5 Pro',
		tier: 'Google Gemini BYOK',
		description: 'Deep architectural & compliance analysis',
	},
	{
		id: 'gpt-4o-mini',
		label: 'OpenAI GPT-4o Mini',
		tier: 'OpenAI BYOK',
		description: 'High-speed directional workflow step execution',
	},
	{
		id: 'claude-3-5-haiku-latest',
		label: 'Anthropic Claude 3.5 Haiku',
		tier: 'Anthropic BYOK',
		description: 'Fast analytical and compliance step execution',
	},
	{
		id: 'local-model',
		label: 'Local Model (LM Studio / Ollama)',
		tier: 'Local Endpoint (No Key Required)',
		description: 'Executes against your local HTTP model server',
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

// Client helper to inspect and redact/block PII, embedded API keys, and Financial data
export function evaluateSafetyGuardrails(
	input: string,
	config: SafetyGuardrailConfig,
): GuardrailScanResult {
	const policy =
		config.piiPolicy === 'block' || config.financialPolicy === 'block'
			? 'block'
			: 'mask';

	const scan = redactPiiFromText(input, { policy });
	return {
		sanitizedText: scan.sanitizedText,
		piiCount: scan.piiCount + scan.apiKeyCount,
		financialCount: scan.financialCount,
		detectedTypes: scan.detectedCategories,
		blocked: scan.blocked,
		blockReason: scan.blockReason,
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
		model: 'gemini-2.5-flash',
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
		model: 'gemini-2.5-flash',
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
		model: 'gemini-2.5-flash',
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
		model: 'gemini-2.5-flash',
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
