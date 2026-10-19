export type HarnessSubstrate = 'oc' | 'adk' | 'agent_runtime' | 'cloud_run' | 'gke';

export interface HarnessValidationCensus {
	valid: boolean;
	errors: string[];
	repairedSkills: string[];
	alwaysOnChars: number;
	alwaysOnMax: number;
	nFiles: number;
	skills: number;
	subAgents: number;
	scripts: number;
	plugins: number;
	hooks: number;
	mcpServers: string[];
	offSurfacePaths: string[];
}

export type HarnessEditorTree = Record<string, string>;

export interface AgentHarnessConfig {
	schemaVersion: 'harness2.v1';
	exportedAt: string;
	substrate: HarnessSubstrate;
	name?: string;
	description?: string;
	enabledInWorkflow?: boolean;
	memoryGi?: number;
	concurrency?: number;
	perReqMib?: number;
	validationCensus: HarnessValidationCensus;
	editorTree: HarnessEditorTree;
}

export interface DeployMonitorCheckResult {
	ok: boolean;
	peak_mib: number;
	limit_mib: number;
	utilizationPct: number;
	headroomMib: number;
}

export const ATTACHED_HARNESS_ASSET_PATH =
	'/assets/aistudio/harness-configuration-oc_46a97fbf.json';

/**
 * Exact canonical harness configuration from /public/assets/aistudio/harness-configuration-oc_46a97fbf.json
 */
export const CANONICAL_OC_HARNESS_CONFIG: AgentHarnessConfig = {
	schemaVersion: 'harness2.v1',
	exportedAt: '2026-10-19T18:16:33.656Z',
	substrate: 'oc',
	name: 'Google Cloud ADK, Bazel & Observability Harness (oc)',
	description:
		'Production harness2.v1 configuration for Google Cloud Agent Deployment, Evaluation, Bazel Bzlmod & OpenTelemetry Cloud Trace observability.',
	enabledInWorkflow: true,
	memoryGi: 4.0,
	concurrency: 8,
	perReqMib: 220.0,
	validationCensus: {
		valid: true,
		errors: [],
		repairedSkills: [],
		alwaysOnChars: 1410,
		alwaysOnMax: 24000,
		nFiles: 9,
		skills: 2,
		subAgents: 1,
		scripts: 1,
		plugins: 0,
		hooks: 0,
		mcpServers: ['dart', 'genkit'],
		offSurfacePaths: [],
	},
	editorTree: {
		'systemprompt.md':
			'You are a Google Cloud Agent Deployment, Evaluation & Observability Engineer.\nWhen scaffolding, evaluating, deploying, publishing to Gemini, or monitoring ADK agents on Google Cloud, load the `google_agents_cli_deploy` skill.\nWhen authoring MODULE.bazel, BUILD.bazel, or deploying Dart/Flutter SDK targets, load the `developing_bazel` skill.\n',
		'guardrails.md':
			'- Always pass `--no-confirm-project` when invoking `agents-cli deploy` in non-interactive sessions.\n- Explicitly pass `--service-account` when deploying against Terraform-provisioned infrastructure.\n- Keep prompt/response PII out of Cloud Trace spans by setting `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=NO_CONTENT` in ADK Python (`false` in ADK Go).\n- Balance `--concurrency` with `--memory` (`peak ≈ base + concurrency × per_request_memory`) and run `python scripts/gcloud_deploy_monitor.py` before deploying.\n',
		'LongTermMEMORY.md':
			'Repository `chrisfbaileycb-arch/agents-cli` provides 7 official skills (`google-agents-cli-workflow`, `adk-code`, `scaffold`, `eval`, `deploy`, `publish`, `observability`). Native ADK registration on Agent Runtime invokes `:streamQuery` (`streaming_agent_run_with_events`), while Cloud Run and GKE register via A2A (`/.well-known/agent-card.json`).\n',
		'tool_descriptions/tool_guidance.md':
			'Use `python scripts/gcloud_deploy_monitor.py` to validate memory-concurrency sizing and OpenTelemetry environment variables before running `agents-cli deploy` or `agents-cli publish gemini`.\n',
		'skills/google_agents_cli_deploy/SKILL.md':
			'---\nname: google_agents_cli_deploy\ndescription: Build, evaluate, deploy, publish, and monitor Google Cloud ADK agents across Agent Runtime, Cloud Run, and GKE using google-agents-cli\n---\n\n1. Scaffold with `agents-cli create <name> -d <agent_runtime|cloud_run|gke> --agent-gateway --bq-analytics`.\n2. Run `agents-cli eval run` and `python scripts/gcloud_deploy_monitor.py` before deploying.\n3. Deploy non-interactively with `agents-cli deploy --no-confirm-project --service-account <SA> --memory 4Gi --concurrency 8 --min-instances 1`.\n4. Register with Gemini via `agents-cli publish gemini` (ADK `:streamQuery` on Agent Runtime, A2A `.well-known/agent-card.json` on Cloud Run / GKE).\n',
		'skills/developing_bazel/SKILL.md':
			'---\nname: developing_bazel\ndescription: Author hermetic Bzlmod (MODULE.bazel) builds, custom Starlark rules, and Dart/Flutter SDK deployments\n---\n\n1. Use Bzlmod (`MODULE.bazel`) and update lockfiles with `bazel mod deps --lockfile_mode=update`.\n',
		'scripts/gcloud_deploy_monitor.py':
			'import json\nimport sys\n\ndef check(memory_gi=4.0, concurrency=8, per_req_mib=220.0):\n    peak = 512.0 + concurrency * per_req_mib\n    limit = memory_gi * 1024.0\n    return {"ok": peak < limit * 0.85, "peak_mib": peak, "limit_mib": limit}\n\nif __name__ == "__main__":\n    print(json.dumps(check(), indent=2))\n',
		'sub_agents/cloud_trace_auditor/AGENT.md':
			'---\nmode: subagent\ndescription: Inspect OpenTelemetry span trees (invoke_workflow -> invoke_agent -> call_llm -> execute_tool) and BigQuery Agent Analytics\n---\n\nInspect Cloud Trace latencies, `reasoning_engine_stderr` logs, and BigQuery Agent Analytics tables for deployed ADK agents.\n',
		'mcp.json':
			'{\n  "mcpServers": {\n    "dart": {\n      "command": "dart",\n      "args": [\n        "mcp-server"\n      ]\n    },\n    "genkit": {\n      "command": "genkit",\n      "args": [\n        "mcp"\n      ]\n    }\n  }\n}',
	},
};

/**
 * Evaluates the memory-concurrency sizing formula from scripts/gcloud_deploy_monitor.py
 */
export function evaluateGcloudDeployMonitor(
	memoryGi = 4.0,
	concurrency = 8,
	perReqMib = 220.0,
): DeployMonitorCheckResult {
	const safeMem = Math.max(0.5, Number(memoryGi) || 4.0);
	const safeConc = Math.max(1, Number(concurrency) || 8);
	const safeReq = Math.max(16, Number(perReqMib) || 220.0);

	const peak = 512.0 + safeConc * safeReq;
	const limit = safeMem * 1024.0;
	const ok = peak < limit * 0.85;
	const utilizationPct = Math.round((peak / limit) * 1000) / 10;
	const headroomMib = Math.round(limit * 0.85 - peak);

	return {
		ok,
		peak_mib: Math.round(peak * 10) / 10,
		limit_mib: Math.round(limit * 10) / 10,
		utilizationPct,
		headroomMib,
	};
}

/**
 * Dynamically recalculates validationCensus from any editorTree map
 */
export function computeHarnessValidationCensus(
	editorTree: HarnessEditorTree,
	alwaysOnMax = 24000,
): HarnessValidationCensus {
	const paths = Object.keys(editorTree);
	const errors: string[] = [];
	const repairedSkills: string[] = [];
	const offSurfacePaths: string[] = [];

	const alwaysOnKeys = [
		'systemprompt.md',
		'guardrails.md',
		'LongTermMEMORY.md',
		'tool_descriptions/tool_guidance.md',
	];

	const activeAlwaysOnSegments = alwaysOnKeys
		.map((k) => editorTree[k])
		.filter((v): v is string => Boolean(v && v.length > 0));
	const alwaysOnChars = activeAlwaysOnSegments.join('\n\n').length;

	if (!editorTree['systemprompt.md']?.trim()) {
		errors.push('Missing or empty systemprompt.md in editorTree.');
	}
	if (!editorTree['guardrails.md']?.trim()) {
		errors.push('Missing or empty guardrails.md in editorTree.');
	}
	if (alwaysOnChars > alwaysOnMax) {
		errors.push(
			`Always-on context (${alwaysOnChars} chars) exceeds maximum budget (${alwaysOnMax} chars).`,
		);
	}

	let skills = 0;
	let subAgents = 0;
	let scripts = 0;
	let plugins = 0;
	let hooks = 0;
	const mcpServers: string[] = [];

	for (const p of paths) {
		if (p.startsWith('skills/') && p.endsWith('/SKILL.md')) {
			skills += 1;
			const content = editorTree[p] || '';
			if (!content.startsWith('---')) {
				repairedSkills.push(p);
			}
		} else if (p.startsWith('sub_agents/') && p.endsWith('/AGENT.md')) {
			subAgents += 1;
		} else if (p.startsWith('scripts/')) {
			scripts += 1;
		} else if (p.startsWith('plugins/')) {
			plugins += 1;
		} else if (p.startsWith('hooks/')) {
			hooks += 1;
		} else if (
			!alwaysOnKeys.includes(p) &&
			p !== 'mcp.json'
		) {
			offSurfacePaths.push(p);
		}
	}

	if (editorTree['mcp.json']) {
		try {
			const parsed = JSON.parse(editorTree['mcp.json']);
			if (parsed && typeof parsed.mcpServers === 'object') {
				mcpServers.push(...Object.keys(parsed.mcpServers));
			}
		} catch {
			errors.push('mcp.json contains invalid JSON syntax.');
		}
	}

	return {
		valid: errors.length === 0,
		errors,
		repairedSkills,
		alwaysOnChars,
		alwaysOnMax,
		nFiles: paths.length,
		skills,
		subAgents,
		scripts,
		plugins,
		hooks,
		mcpServers,
		offSurfacePaths,
	};
}

/**
 * Creates a customized harness2.v1 configuration for each of the 4 directional Agent Renderances
 */
export function createDefaultAgentHarness(roleIndex: number): AgentHarnessConfig {
	const roleConfigs: {
		name: string;
		substrate: HarnessSubstrate;
		systemPrompt: string;
		guardrails: string;
		memory: string;
		toolGuidance: string;
	}[] = [
		{
			name: 'Renderance 01 · Systems Architect & ADK Scaffold Harness',
			substrate: 'oc',
			systemPrompt:
				'You are Agent 01: Google Cloud Agent Deployment, Architecture & ADK Scaffold Engineer.\nWhen scaffolding, evaluating, deploying, publishing to Gemini, or monitoring ADK agents on Google Cloud, load the `google_agents_cli_deploy` skill.\nWhen authoring MODULE.bazel, BUILD.bazel, or deploying Dart/Flutter SDK targets, load the `developing_bazel` skill.\n',
			guardrails:
				CANONICAL_OC_HARNESS_CONFIG.editorTree['guardrails.md'],
			memory:
				CANONICAL_OC_HARNESS_CONFIG.editorTree['LongTermMEMORY.md'],
			toolGuidance:
				'Scaffold with `agents-cli create <name> -d <agent_runtime|cloud_run|gke> --agent-gateway --bq-analytics` and validate sizing with `python scripts/gcloud_deploy_monitor.py`.\n',
		},
		{
			name: 'Renderance 02 · Core Implementation & Bzlmod Runtime Harness',
			substrate: 'oc',
			systemPrompt:
				'You are Agent 02: Core Implementation & Hermetic Bazel Runtime Engineer.\nWhen authoring MODULE.bazel, BUILD.bazel, or deploying Dart/Flutter SDK targets, load the `developing_bazel` skill.\nWhen implementing ADK agent runtimes or A2A endpoints, load the `google_agents_cli_deploy` skill.\n',
			guardrails:
				CANONICAL_OC_HARNESS_CONFIG.editorTree['guardrails.md'],
			memory:
				CANONICAL_OC_HARNESS_CONFIG.editorTree['LongTermMEMORY.md'],
			toolGuidance:
				'Use Bzlmod (`MODULE.bazel`), update lockfiles with `bazel mod deps --lockfile_mode=update`, and verify memory-concurrency sizing via `python scripts/gcloud_deploy_monitor.py`.\n',
		},
		{
			name: 'Renderance 03 · Cloud Trace, PII & Financial Guardrail Auditor Harness',
			substrate: 'oc',
			systemPrompt:
				'You are Agent 03: Cloud Trace Observability, PII & Financial Compliance Auditor.\nDelegate span tree inspection (`invoke_workflow -> invoke_agent -> call_llm -> execute_tool`) to `sub_agents/cloud_trace_auditor/AGENT.md`.\nEnforce strict PII/Financial redaction across all ADK and A2A telemetry spans.\n',
			guardrails:
				CANONICAL_OC_HARNESS_CONFIG.editorTree['guardrails.md'],
			memory:
				CANONICAL_OC_HARNESS_CONFIG.editorTree['LongTermMEMORY.md'],
			toolGuidance:
				'Ensure `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=NO_CONTENT` is active and run `python scripts/gcloud_deploy_monitor.py` to prevent OOM under peak concurrency.\n',
		},
		{
			name: 'Renderance 04 · Executive Synthesis, Eval & Gemini Publish Harness',
			substrate: 'oc',
			systemPrompt:
				'You are Agent 04: Executive Synthesis, ADK Evaluation & Gemini Publisher.\nRun `agents-cli eval run`, verify `python scripts/gcloud_deploy_monitor.py`, and publish verified agents via `agents-cli publish gemini` (`:streamQuery` on Agent Runtime or `/.well-known/agent-card.json` on Cloud Run / GKE).\n',
			guardrails:
				CANONICAL_OC_HARNESS_CONFIG.editorTree['guardrails.md'],
			memory:
				CANONICAL_OC_HARNESS_CONFIG.editorTree['LongTermMEMORY.md'],
			toolGuidance:
				CANONICAL_OC_HARNESS_CONFIG.editorTree['tool_descriptions/tool_guidance.md'],
		},
	];

	const chosen = roleConfigs[roleIndex % roleConfigs.length];
	const editorTree: HarnessEditorTree = {
		...CANONICAL_OC_HARNESS_CONFIG.editorTree,
		'systemprompt.md': chosen.systemPrompt,
		'guardrails.md': chosen.guardrails,
		'LongTermMEMORY.md': chosen.memory,
		'tool_descriptions/tool_guidance.md': chosen.toolGuidance,
	};

	return {
		schemaVersion: 'harness2.v1',
		exportedAt: CANONICAL_OC_HARNESS_CONFIG.exportedAt,
		substrate: chosen.substrate,
		name: chosen.name,
		description: CANONICAL_OC_HARNESS_CONFIG.description,
		enabledInWorkflow: true,
		memoryGi: 4.0,
		concurrency: 8,
		perReqMib: 220.0,
		validationCensus: computeHarnessValidationCensus(editorTree),
		editorTree,
	};
}

export interface WorkflowHarnessPreset {
	id: string;
	title: string;
	badge: string;
	substrate: HarnessSubstrate;
	description: string;
	sampleObjective: string;
	config: AgentHarnessConfig;
}

export const WORKFLOW_HARNESS_PRESETS: WorkflowHarnessPreset[] = [
	{
		id: 'oc-adk-bazel',
		title: 'Google Cloud ADK, Bazel & Cloud Trace Harness (oc)',
		badge: 'Attached harness2.v1',
		substrate: 'oc',
		description:
			'Exact harness-configuration-oc_46a97fbf.json with google_agents_cli_deploy, developing_bazel, cloud_trace_auditor sub-agent, gcloud_deploy_monitor.py, and dart/genkit MCP servers.',
		sampleObjective:
			'Scaffold, evaluate, and deploy a multi-agent Google Cloud ADK pipeline to Cloud Run and Agent Runtime with Bazel Bzlmod targets, OpenTelemetry NO_CONTENT PII protection, and 4Gi/8-concurrency sizing verification.',
		config: CANONICAL_OC_HARNESS_CONFIG,
	},
	{
		id: 'rate-limiter-harness',
		title: 'Distributed Gateway Rate-Limiter & Envoy Failover Harness',
		badge: 'Systems Workflow',
		substrate: 'cloud_run',
		description:
			'Harness tuned for high-throughput 100k RPS Redis Lua token-bucket rate limiting, circuit-breaker L1 caching, and Cloud Run concurrency sizing.',
		sampleObjective:
			'Design a fault-tolerant distributed rate-limiting service handling 100k RPS with sub-5ms p99 latency, including data structures, failure fallback, and verification tests.',
		config: {
			...CANONICAL_OC_HARNESS_CONFIG,
			name: 'Distributed Rate-Limiter Workflow Harness',
			substrate: 'cloud_run',
			memoryGi: 8.0,
			concurrency: 16,
			perReqMib: 180.0,
			editorTree: {
				...CANONICAL_OC_HARNESS_CONFIG.editorTree,
				'systemprompt.md':
					'You are a Distributed Systems & Cloud Run Gateway Architect.\nEnforce sub-5ms P99 token-bucket evaluation, atomic Redis Lua scripts, and bounded local L1 circuit-breaker failover.\n',
				'guardrails.md':
					'- Never expose tenant API keys or raw bearer tokens in gateway logs or OpenTelemetry trace attributes.\n- Validate memory-concurrency sizing (`python scripts/gcloud_deploy_monitor.py`) for high-throughput Cloud Run instances.\n- Require deterministic fallback quotas when Redis cluster quorum degrades.\n',
			},
			validationCensus: computeHarnessValidationCensus({
				...CANONICAL_OC_HARNESS_CONFIG.editorTree,
				'systemprompt.md':
					'You are a Distributed Systems & Cloud Run Gateway Architect.\nEnforce sub-5ms P99 token-bucket evaluation, atomic Redis Lua scripts, and bounded local L1 circuit-breaker failover.\n',
				'guardrails.md':
					'- Never expose tenant API keys or raw bearer tokens in gateway logs or OpenTelemetry trace attributes.\n- Validate memory-concurrency sizing (`python scripts/gcloud_deploy_monitor.py`) for high-throughput Cloud Run instances.\n- Require deterministic fallback quotas when Redis cluster quorum degrades.\n',
			}),
		},
	},
	{
		id: 'financial-compliance-harness',
		title: 'PCI-DSS Financial Ledger & PII Zero-Leakage Harness',
		badge: 'Compliance Workflow',
		substrate: 'agent_runtime',
		description:
			'Strict financial and PII redaction harness enforcing OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=NO_CONTENT and read-only ledger auditing.',
		sampleObjective:
			'Audit and resolve customer billing dispute for Alex Rivera (email: alex.rivera@example.com, SSN: 123-45-6789, Card: 4532-0151-1283-9901, Account: ACCT-8849201) regarding duplicate ledger settlement and propose a PCI-compliant reconciliation workflow.',
		config: {
			...CANONICAL_OC_HARNESS_CONFIG,
			name: 'PCI-DSS & PII Compliance Auditor Harness',
			substrate: 'agent_runtime',
			memoryGi: 4.0,
			concurrency: 6,
			perReqMib: 210.0,
			editorTree: {
				...CANONICAL_OC_HARNESS_CONFIG.editorTree,
				'systemprompt.md':
					'You are a PCI-DSS Financial Compliance & Privacy Security Engineer.\nInspect every workflow handoff and Cloud Trace span for SSNs, payment card PANs, bank routing numbers, and personal emails.\n',
				'guardrails.md':
					'- Set `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=NO_CONTENT` across all ADK agents.\n- Mask all PANs, SSNs, and account numbers before any prompt leaves the browser or crosses an agent handoff.\n- Enforce read-only financial ledger inspection; refuse raw settlement mutations without dual-control sign-off.\n',
			},
			validationCensus: computeHarnessValidationCensus({
				...CANONICAL_OC_HARNESS_CONFIG.editorTree,
				'systemprompt.md':
					'You are a PCI-DSS Financial Compliance & Privacy Security Engineer.\nInspect every workflow handoff and Cloud Trace span for SSNs, payment card PANs, bank routing numbers, and personal emails.\n',
				'guardrails.md':
					'- Set `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=NO_CONTENT` across all ADK agents.\n- Mask all PANs, SSNs, and account numbers before any prompt leaves the browser or crosses an agent handoff.\n- Enforce read-only financial ledger inspection; refuse raw settlement mutations without dual-control sign-off.\n',
			}),
		},
	},
	{
		id: 'ledger-migration-harness',
		title: 'Zero-Downtime PostgreSQL Ledger Migration Harness',
		badge: 'Database Workflow',
		substrate: 'gke',
		description:
			'GKE & A2A agent harness for dual-write schema migrations, cryptographic row checksums, and zero-downtime cutover verification.',
		sampleObjective:
			'Create a zero-downtime PostgreSQL schema migration strategy for a multi-tenant financial ledger table with 250M rows, including read-only compliance verification and rollback safety gates.',
		config: {
			...CANONICAL_OC_HARNESS_CONFIG,
			name: 'Zero-Downtime Ledger Migration Harness',
			substrate: 'gke',
			memoryGi: 8.0,
			concurrency: 12,
			perReqMib: 240.0,
			editorTree: {
				...CANONICAL_OC_HARNESS_CONFIG.editorTree,
				'systemprompt.md':
					'You are a Principal Database Reliability & GKE Migration Architect.\nDesign idempotent expand-and-contract DDL migrations, shadow dual-write triggers, and sub-second rollback safety gates.\n',
			},
			validationCensus: computeHarnessValidationCensus({
				...CANONICAL_OC_HARNESS_CONFIG.editorTree,
				'systemprompt.md':
					'You are a Principal Database Reliability & GKE Migration Architect.\nDesign idempotent expand-and-contract DDL migrations, shadow dual-write triggers, and sub-second rollback safety gates.\n',
			}),
		},
	},
];

/**
 * Formats an AgentHarnessConfig into a structured context block for agent execution prompts
 */
export function buildHarnessExecutionContext(
	harness: AgentHarnessConfig | undefined,
): string {
	if (!harness || harness.enabledInWorkflow === false) {
		return '';
	}

	const tree = harness.editorTree || {};
	const monitor = evaluateGcloudDeployMonitor(
		harness.memoryGi ?? 4.0,
		harness.concurrency ?? 8,
		harness.perReqMib ?? 220.0,
	);

	const sections: string[] = [
		`[ACTIVE AGENT HARNESS CONFIGURATION — ${harness.schemaVersion} · Substrate: ${harness.substrate.toUpperCase()}]`,
	];

	if (tree['systemprompt.md']) {
		sections.push(`Harness System Directive:\n${tree['systemprompt.md'].trim()}`);
	}
	if (tree['guardrails.md']) {
		sections.push(`Harness Operational Guardrails:\n${tree['guardrails.md'].trim()}`);
	}
	if (tree['LongTermMEMORY.md']) {
		sections.push(`Harness Long-Term Memory:\n${tree['LongTermMEMORY.md'].trim()}`);
	}
	if (tree['tool_descriptions/tool_guidance.md']) {
		sections.push(
			`Harness Tool Guidance:\n${tree['tool_descriptions/tool_guidance.md'].trim()}`,
		);
	}

	const skillFiles = Object.keys(tree).filter((k) => k.startsWith('skills/'));
	if (skillFiles.length > 0) {
		sections.push(
			`Loaded Harness Skills (${skillFiles.length}):\n` +
				skillFiles.map((k) => `--- ${k} ---\n${tree[k].trim()}`).join('\n\n'),
		);
	}

	const subAgentFiles = Object.keys(tree).filter((k) =>
		k.startsWith('sub_agents/'),
	);
	if (subAgentFiles.length > 0) {
		sections.push(
			`Registered Sub-Agents (${subAgentFiles.length}):\n` +
				subAgentFiles.map((k) => `--- ${k} ---\n${tree[k].trim()}`).join('\n\n'),
		);
	}

	sections.push(
		`Harness Sizing Monitor (gcloud_deploy_monitor.py): memory=${harness.memoryGi ?? 4}Gi, concurrency=${harness.concurrency ?? 8}, peak=${monitor.peak_mib}MiB / limit=${monitor.limit_mib}MiB (ok=${monitor.ok}) | MCP Servers: ${harness.validationCensus.mcpServers.join(', ') || 'none'}`,
	);

	return sections.join('\n\n');
}

/**
 * Parses and normalizes an imported JSON string into a valid AgentHarnessConfig
 */
export function parseHarnessConfigJson(rawJson: string): AgentHarnessConfig {
	const parsed = JSON.parse(rawJson);
	if (!parsed || typeof parsed !== 'object') {
		throw new Error('Invalid JSON object.');
	}
	const editorTree: HarnessEditorTree =
		parsed.editorTree && typeof parsed.editorTree === 'object'
			? { ...parsed.editorTree }
			: { ...CANONICAL_OC_HARNESS_CONFIG.editorTree };

	const substrate: HarnessSubstrate =
		parsed.substrate === 'adk' ||
		parsed.substrate === 'agent_runtime' ||
		parsed.substrate === 'cloud_run' ||
		parsed.substrate === 'gke'
			? parsed.substrate
			: 'oc';

	const alwaysOnMax =
		typeof parsed.validationCensus?.alwaysOnMax === 'number'
			? parsed.validationCensus.alwaysOnMax
			: 24000;

	return {
		schemaVersion: 'harness2.v1',
		exportedAt: parsed.exportedAt || new Date().toISOString(),
		substrate,
		name: parsed.name || `Imported Harness (${substrate.toUpperCase()})`,
		description:
			parsed.description ||
			'Imported harness2.v1 configuration for multi-agent directional workflows.',
		enabledInWorkflow: parsed.enabledInWorkflow ?? true,
		memoryGi: Number(parsed.memoryGi) || 4.0,
		concurrency: Number(parsed.concurrency) || 8,
		perReqMib: Number(parsed.perReqMib) || 220.0,
		validationCensus: computeHarnessValidationCensus(editorTree, alwaysOnMax),
		editorTree,
	};
}
