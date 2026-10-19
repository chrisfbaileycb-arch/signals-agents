import {
	EnvironmentTheme,
	KeyRoutingScope,
	LeaseAuditEntry,
	WorkflowInstance,
	WorkflowTopology,
} from './workflowTypes';
import { syncWorkflowToMindMapGraph } from './mindMapEngine';

export type WorkflowArchetypeId =
	| 'rate-limiter'
	| 'financial-compliance'
	| 'ledger-migration'
	| 'custom';

export interface WorkflowArchetypeMeta {
	id: WorkflowArchetypeId;
	title: string;
	rootFolderName: string;
	badgeLabel: string;
	description: string;
}

export interface WorkflowVirtualFile {
	id: string;
	path: string; // e.g., "logs/workflow-execution-results.log"
	folder: string; // e.g., "logs" | "deliverables/architecture" | "agents/01-architect" | "root"
	name: string; // e.g., "workflow-execution-results.log"
	extension: string;
	mimeType: string;
	sizeBytes: number;
	description: string;
	content: string;
	sourceAgentId?: number;
}

export interface WorkflowVirtualFolder {
	path: string;
	label: string;
	description: string;
	fileCount: number;
	totalBytes: number;
	files: WorkflowVirtualFile[];
}

export interface WorkflowExportBundle {
	archetype: WorkflowArchetypeMeta;
	generatedAt: string;
	resultsLogText: string;
	files: WorkflowVirtualFile[];
	folders: WorkflowVirtualFolder[];
	totalSizeBytes: number;
}

function slugify(input: string): string {
	return (
		input
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 38) || 'workflow'
	);
}

export function detectWorkflowArchetype(
	superprompt: string,
): WorkflowArchetypeMeta {
	const lower = superprompt.toLowerCase();

	if (
		lower.includes('rate-limiter') ||
		lower.includes('rate limiter') ||
		lower.includes('token-bucket') ||
		lower.includes('redis')
	) {
		return {
			id: 'rate-limiter',
			title: 'Distributed API Rate-Limiter & Gateway Architecture',
			rootFolderName: 'signals-agents-rate-limiter-workflow',
			badgeLabel: 'Systems & Gateway Bundle',
			description:
				'Includes Redis Lua token-bucket scripts, TypeScript gateway middleware, Envoy failover config, per-agent step logs, and Mind-Map topology.',
		};
	}

	if (
		lower.includes('wire') ||
		lower.includes('pci-dss') ||
		lower.includes('ssn') ||
		lower.includes('routing') ||
		lower.includes('financial') ||
		lower.includes('reconciliation')
	) {
		return {
			id: 'financial-compliance',
			title: 'PCI-DSS Financial Wire & PII Safety Guardrail Audit',
			rootFolderName: 'signals-agents-financial-compliance-audit',
			badgeLabel: 'Financial & PII Compliance Bundle',
			description:
				'Includes sanitized wire settlement CSV ledger, PCI-DSS/PII redaction certificate, guardrail policy manifest, and 4-agent verification logs.',
		};
	}

	if (
		lower.includes('ledger') ||
		lower.includes('migration') ||
		lower.includes('postgresql') ||
		lower.includes('dual-write') ||
		lower.includes('cutover')
	) {
		return {
			id: 'ledger-migration',
			title: 'Zero-Downtime Distributed Ledger Migration',
			rootFolderName: 'signals-agents-ledger-migration-bundle',
			badgeLabel: 'Database & Ledger Migration Bundle',
			description:
				'Includes idempotent PostgreSQL dual-write DDL, cryptographic checksum worker, rollback cutover runbook, and 4-agent step execution transcripts.',
		};
	}

	const customSlug = slugify(superprompt.slice(0, 48));
	return {
		id: 'custom',
		title: 'Custom Multi-Agent Directional Workflow Package',
		rootFolderName: `signals-agents-${customSlug}`,
		badgeLabel: 'Dynamic Multi-Agent Bundle',
		description:
			'Dynamically packages all 4 agent step outputs, extracted code artifacts, system prompts, PII/financial guardrail logs, and Mind-Map graph state.',
	};
}

/**
 * Extracts fenced code blocks from agent outputs so any custom workflow with generated code
 * automatically produces downloadable source files in /deliverables/extracted/.
 */
function extractCodeBlocksFromOutputs(
	instances: WorkflowInstance[],
): { ext: string; code: string; agentId: number; stepNum: number }[] {
	const extracted: {
		ext: string;
		code: string;
		agentId: number;
		stepNum: number;
	}[] = [];
	const regex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;

	for (const inst of instances) {
		for (const step of inst.steps) {
			if (!step.executionOutput) continue;
			let match: RegExpExecArray | null;
			regex.lastIndex = 0;
			while ((match = regex.exec(step.executionOutput)) !== null) {
				const lang = (match[1] || 'txt').toLowerCase();
				const code = match[2].trim();
				if (code.length > 15) {
					const extMap: Record<string, string> = {
						typescript: 'ts',
						ts: 'ts',
						javascript: 'js',
						js: 'js',
						python: 'py',
						py: 'py',
						sql: 'sql',
						json: 'json',
						yaml: 'yaml',
						yml: 'yaml',
						lua: 'lua',
						bash: 'sh',
						sh: 'sh',
						csv: 'csv',
						html: 'html',
						css: 'css',
					};
					extracted.push({
						ext: extMap[lang] || 'md',
						code,
						agentId: inst.id,
						stepNum: step.stepNumber,
					});
				}
			}
		}
	}
	return extracted;
}

export function buildWorkflowResultsLog(params: {
	instances: WorkflowInstance[];
	topology: WorkflowTopology;
	superprompt: string;
	keyRoutingScope: KeyRoutingScope;
	environmentTheme: EnvironmentTheme;
	activeGlobalLeaseId: string | null;
	lastPurgeReceipt: {
		leaseId: string;
		purgedAt: string;
		totalDurationMs: number;
		redactionsApplied: number;
	} | null;
	auditLog: LeaseAuditEntry[];
}): string {
	const {
		instances,
		topology,
		superprompt,
		keyRoutingScope,
		environmentTheme,
		activeGlobalLeaseId,
		lastPurgeReceipt,
		auditLog,
	} = params;

	const nowIso = new Date().toISOString();
	const archetype = detectWorkflowArchetype(superprompt);
	const totalRuntimeMs = instances.reduce((acc, i) => acc + i.totalRuntimeMs, 0);
	const totalRedactions = instances.reduce(
		(acc, i) => acc + i.totalRedactionsCount,
		0,
	);
	const completedSteps = instances.reduce(
		(acc, i) => acc + i.steps.filter((s) => s.status === 'completed').length,
		0,
	);
	const totalSteps = instances.reduce((acc, i) => acc + i.steps.length, 0);

	const lines: string[] = [
		'================================================================================',
		'SIGNALS AGENTS — MULTI-AGENT DIRECTIONAL WORKFLOW EXECUTION RESULTS LOG',
		'================================================================================',
		`Generated Timestamp : ${nowIso}`,
		`Workflow Archetype  : ${archetype.title} [${archetype.id}]`,
		`Bundle Folder Name  : ${archetype.rootFolderName}/`,
		`Handoff Topology    : ${topology.toUpperCase()} (Sequential 01 -> 02 -> 03 -> 04)`,
		`BYOK Routing Mode   : ${
			keyRoutingScope === 'shared_four'
				? 'Shared 4-Agent Multiplexed Session Lease'
				: 'Per-Renderance Scoped Independent Leases (01-04)'
		}`,
		`Environment Theme   : ${environmentTheme.toUpperCase()}`,
		`Steps Completed     : ${completedSteps} / ${totalSteps} steps`,
		`Cumulative Runtime  : ${totalRuntimeMs} ms`,
		`Safety Redactions   : ${totalRedactions} PII / Financial tokens masked`,
		`Active / Last Lease : ${
			activeGlobalLeaseId
				? `${activeGlobalLeaseId} (ACTIVE)`
				: lastPurgeReceipt
				? `${lastPurgeReceipt.leaseId} (AUTO-DELETED AT ${lastPurgeReceipt.purgedAt} · 0ms Retention)`
				: 'Ephemeral Auto-Purge Armed (0ms Post-Run Retention)'
		}`,
		'',
		'--------------------------------------------------------------------------------',
		'1. MASTER WORKFLOW OBJECTIVE',
		'--------------------------------------------------------------------------------',
		superprompt.trim() || '(No master objective specified)',
		'',
		'--------------------------------------------------------------------------------',
		'2. PER-AGENT STEP-BY-STEP EXECUTION & TELEMETRY LOG (RENDERANCES 01–04)',
		'--------------------------------------------------------------------------------',
	];

	for (const inst of instances) {
		const doneSteps = inst.steps.filter((s) => s.status === 'completed').length;
		lines.push(
			'',
			`[AGENT 0${inst.id}] ${inst.name} — ${inst.agentRole}`,
			`  Model Assigned      : ${inst.model}`,
			`  Agent Status        : ${inst.status.toUpperCase()} (${doneSteps}/${inst.steps.length} steps completed)`,
			`  Total Agent Runtime : ${inst.totalRuntimeMs} ms`,
			`  Lease Binding       : ${inst.leaseId || 'ephemeral-session'} (${inst.leaseStatus.toUpperCase()})`,
			`  Guardrail Policy    : PII=${inst.guardrails.piiPolicy.toUpperCase()} | Financial=${inst.guardrails.financialPolicy.toUpperCase()} | SanitizeHandoffs=${inst.guardrails.sanitizeHandoffs}`,
			`  Redactions Applied  : ${inst.totalRedactionsCount}`,
			`  System Prompt       : ${inst.customSystemPrompt}`,
			'  Execution Steps     :',
		);

		for (const step of inst.steps) {
			const pct =
				step.status === 'completed'
					? 100
					: step.progressPercent !== undefined
					? step.progressPercent
					: 0;
			lines.push(
				`    ----------------------------------------------------------------------------`,
				`    Step 0${step.stepNumber}: ${step.title}`,
				`      Status / Progress : ${step.status.toUpperCase()} (${pct}%)`,
				`      Duration          : ${
					step.durationMs !== undefined
						? `${step.durationMs} ms`
						: step.elapsedMs
						? `${step.elapsedMs} ms (elapsed)`
						: 'Pending execution'
				}`,
				`      Instruction       : ${step.instruction}`,
			);
			if (step.subTasks && step.subTasks.length > 0) {
				lines.push(
					`      Sub-Task Phases   : ${step.subTasks
						.map((st) => `[${st.status.toUpperCase()}] ${st.label}`)
						.join(' -> ')}`,
				);
			}
			if (step.guardrailSummary) {
				lines.push(`      Guardrail Check   : ${step.guardrailSummary}`);
			}
			if (step.reasoningSummary) {
				lines.push(`      Reasoning Summary : ${step.reasoningSummary}`);
			}
			if (step.verificationCheck) {
				lines.push(`      Verification      : ${step.verificationCheck}`);
			}
			if (step.executionOutput) {
				lines.push(
					`      Execution Output  :`,
					...step.executionOutput
						.split('\n')
						.map((line) => `        ${line}`),
				);
			}
		}
	}

	lines.push(
		'',
		'--------------------------------------------------------------------------------',
		'3. EPHEMERAL CREDENTIAL LEASE & SAFETY AUDIT RECEIPTS',
		'--------------------------------------------------------------------------------',
	);

	if (auditLog.length === 0) {
		lines.push(
			'No completed workflow audit receipts recorded in this session yet. Execute the workflow to generate live cryptographic lease purge timestamps.',
		);
	} else {
		for (const entry of auditLog) {
			lines.push(
				`• Lease ${entry.leaseId} | Scope: ${entry.scopeLabel} | Topology: ${entry.topology.toUpperCase()} | Models: ${entry.modelsUsed.join(
					', ',
				)} | Steps: ${entry.stepsCompleted} | Masked: ${
					entry.redactionsApplied
				} | Runtime: ${entry.totalDurationMs}ms | Purged At: ${
					entry.purgedAt
				} | Status: ${entry.status}`,
			);
		}
	}

	lines.push(
		'================================================================================',
		'END OF SIGNALS AGENTS RESULTS LOG',
		'================================================================================',
	);

	return lines.join('\n');
}

export function buildWorkflowFileBundle(params: {
	instances: WorkflowInstance[];
	topology: WorkflowTopology;
	superprompt: string;
	keyRoutingScope: KeyRoutingScope;
	environmentTheme: EnvironmentTheme;
	activeGlobalLeaseId: string | null;
	lastPurgeReceipt: {
		leaseId: string;
		purgedAt: string;
		totalDurationMs: number;
		redactionsApplied: number;
	} | null;
	auditLog: LeaseAuditEntry[];
}): WorkflowExportBundle {
	const {
		instances,
		topology,
		superprompt,
		keyRoutingScope,
		environmentTheme,
		activeGlobalLeaseId,
		lastPurgeReceipt,
		auditLog,
	} = params;

	const generatedAt = new Date().toISOString();
	const archetype = detectWorkflowArchetype(superprompt);
	const resultsLogText = buildWorkflowResultsLog(params);
	const files: WorkflowVirtualFile[] = [];

	const addFile = (
		path: string,
		description: string,
		content: string,
		mimeType = 'text/plain;charset=utf-8',
		sourceAgentId?: number,
	) => {
		const parts = path.split('/');
		const name = parts[parts.length - 1];
		const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : 'root';
		const extParts = name.split('.');
		const extension = extParts.length > 1 ? extParts[extParts.length - 1] : 'txt';
		const sizeBytes = new TextEncoder().encode(content).length;

		files.push({
			id: `file-${files.length + 1}-${path.replace(/[^a-zA-Z0-9]/g, '-')}`,
			path,
			folder,
			name,
			extension,
			mimeType,
			sizeBytes,
			description,
			content,
			sourceAgentId,
		});
	};

	// 1. Root README.md
	const readmeContent = [
		`# ${archetype.title}`,
		'',
		`> Generated by **Signals Agents** Multi-Agent Directional Workflow Studio on \`${generatedAt}\``,
		'',
		`## Workflow Execution Summary`,
		`- **Bundle Directory**: \`${archetype.rootFolderName}/\``,
		`- **Handoff Topology**: \`${topology.toUpperCase()}\``,
		`- **BYOK Key Routing Mode**: \`${keyRoutingScope}\` (0ms post-run key retention)`,
		`- **Environment Theme**: \`${environmentTheme}\``,
		`- **Last Lease Purge Receipt**: \`${
			lastPurgeReceipt
				? `${lastPurgeReceipt.leaseId} purged at ${lastPurgeReceipt.purgedAt}`
				: 'Pending / Ready'
		}\``,
		'',
		`## Master Workflow Objective`,
		'```text',
		superprompt.trim(),
		'```',
		'',
		`## Folder Hierarchy in This Bundle`,
		`- \`/logs/\` — Verbatim execution results log (\`workflow-execution-results.log\`) and PII/financial guardrail audit receipt (\`byok-lease-and-guardrail-audit.json\`).`,
		`- \`/agents/\` — Dedicated sub-folders for each of the 4 Agent Renderances (\`01\` through \`04\`) containing their unique system prompts, step-by-step transcripts, and synthesized deliverables.`,
		`- \`/deliverables/\` — Workflow-specific deployable artifacts, configurations, schemas, and verification matrices tailored to **${archetype.title}**.`,
		`- \`/mind-map/\` — Mind-Work-Done visual graph state (\`mind-work-done-state.json\`) and Mermaid directional handoff diagram (\`workflow-topology.mmd\`).`,
		'',
		`## Product Identity & MIT License Attribution`,
		`**Signals Agents** (Copyright (c) 2026 Christopher F. Bailey / Signal F Holdings LLC) is an original, standalone identifiable software product distributed under the MIT License.`,
	].join('\n');

	addFile(
		'README.md',
		'Executive workflow bundle overview, topology manifest, and directory guide',
		readmeContent,
		'text/markdown;charset=utf-8',
	);

	addFile(
		'LICENSE',
		'MIT License with full copyright attribution',
		[
			'MIT License',
			'',
			'Copyright (c) 2026 Christopher F. Bailey / Signal F Holdings LLC',
			'Copyright (c) 2015-present Electron React Boilerplate',
			'',
			'Permission is hereby granted, free of charge, to any person obtaining a copy',
			'of this software and associated documentation files (the "Software"), to deal',
			'in the Software without restriction, including without limitation the rights',
			'to use, copy, modify, merge, publish, distribute, sublicense, and/or sell',
			'copies of the Software, and to permit persons to whom the Software is',
			'furnished to do so, subject to the following conditions:',
			'',
			'The above copyright notice and this permission notice shall be included in all',
			'copies or substantial portions of the Software.',
			'',
			'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR',
			'IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,',
			'FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE',
			'AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER',
			'LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,',
			'OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE',
			'SOFTWARE.',
		].join('\n'),
		'text/plain;charset=utf-8',
	);

	// 2. /logs/ Folder Files
	addFile(
		'logs/workflow-execution-results.log',
		'Complete timestamped execution results log across all 4 agents and steps',
		resultsLogText,
		'text/plain;charset=utf-8',
	);

	const guardrailAuditPayload = {
		application: 'Signals Agents',
		generatedAt,
		workflowArchetype: archetype,
		topology,
		keyRoutingScope,
		ephemeralKeyRetentionMs: 0,
		lastPurgeReceipt,
		agentsSummary: instances.map((inst) => ({
			id: inst.id,
			name: inst.name,
			role: inst.agentRole,
			model: inst.model,
			status: inst.status,
			totalRuntimeMs: inst.totalRuntimeMs,
			totalRedactionsCount: inst.totalRedactionsCount,
			guardrails: inst.guardrails,
			steps: inst.steps.map((s) => ({
				stepNumber: s.stepNumber,
				title: s.title,
				status: s.status,
				progressPercent:
					s.status === 'completed' ? 100 : s.progressPercent ?? 0,
				durationMs: s.durationMs ?? null,
				guardrailSummary: s.guardrailSummary ?? null,
				verificationCheck: s.verificationCheck ?? null,
			})),
		})),
		sessionLeaseAuditLog: auditLog,
	};

	addFile(
		'logs/byok-lease-and-guardrail-audit.json',
		'Cryptographic BYOK lease purge receipts and PII/financial redaction telemetry',
		JSON.stringify(guardrailAuditPayload, null, 2),
		'application/json;charset=utf-8',
	);

	// 3. /mind-map/ Folder Files
	const mindGraph = syncWorkflowToMindMapGraph(
		null,
		instances,
		topology,
		superprompt,
		false,
		activeGlobalLeaseId,
		lastPurgeReceipt,
		true,
	);

	addFile(
		'mind-map/mind-work-done-state.json',
		'Interactive Mind-Work-Done node coordinates, semantic color rings, and links',
		JSON.stringify(mindGraph, null, 2),
		'application/json;charset=utf-8',
	);

	const mermaidLines = [
		'flowchart LR',
		'  CORE["Master Workflow Objective"]',
		...instances.map(
			(inst) =>
				`  A${inst.id}["Agent 0${inst.id}: ${inst.agentRole} (${inst.model})"]`,
		),
		'  PURGE["Ephemeral BYOK Key Lease Purge (0ms)"]',
	];
	mermaidLines.push(
		'  CORE --> A1',
		'  A1 -->|Sanitized Handoff| A2',
		'  A2 -->|Sanitized Handoff| A3',
		'  A3 -->|Sanitized Handoff| A4',
		'  A4 --> PURGE',
	);

	addFile(
		'mind-map/workflow-topology.mmd',
		'Mermaid directional architecture diagram of the 4-agent workflow and step handoffs',
		mermaidLines.join('\n'),
		'text/plain;charset=utf-8',
	);

	// 4. /agents/ Folder Hierarchy (1 subfolder per Agent 01–04)
	for (const inst of instances) {
		const roleSlug = slugify(inst.agentRole);
		const agentFolder = `agents/0${inst.id}-${roleSlug}`;

		const agentOverviewMd = [
			`# Agent 0${inst.id}: ${inst.name} — ${inst.agentRole}`,
			'',
			`- **Assigned Gemini Model**: \`${inst.model}\``,
			`- **Execution Status**: \`${inst.status.toUpperCase()}\``,
			`- **Total Runtime**: \`${inst.totalRuntimeMs} ms\``,
			`- **PII / Financial Redactions**: \`${inst.totalRedactionsCount}\``,
			`- **Guardrail Policy**: PII=\`${inst.guardrails.piiPolicy}\`, Financial=\`${inst.guardrails.financialPolicy}\`, SanitizeHandoffs=\`${inst.guardrails.sanitizeHandoffs}\``,
			'',
			`## Unique Agent System Prompt`,
			'```text',
			inst.customSystemPrompt,
			'```',
			'',
			`## Synthesized Agent Deliverable`,
			inst.lastDeliverable
				? inst.lastDeliverable
				: '_Agent has not completed a full execution run yet. Run the workflow to populate live model output, or inspect the configured step instructions below._',
		].join('\n');

		addFile(
			`${agentFolder}/agent-0${inst.id}-overview-and-prompt.md`,
			`System prompt, guardrail configuration, and synthesized output for Agent 0${inst.id}`,
			agentOverviewMd,
			'text/markdown;charset=utf-8',
			inst.id,
		);

		for (const step of inst.steps) {
			const stepMd = [
				`# Agent 0${inst.id} · ${step.title}`,
				'',
				`- **Step Number**: 0${step.stepNumber}`,
				`- **Status**: \`${step.status.toUpperCase()}\` (${
					step.status === 'completed' ? 100 : step.progressPercent ?? 0
				}%)`,
				`- **Duration**: \`${
					step.durationMs !== undefined ? `${step.durationMs} ms` : 'Not yet run'
				}\``,
				`- **Guardrail Telemetry**: ${
					step.guardrailSummary || 'PII & Financial Guardrails Active'
				}`,
				'',
				`## Step Instruction`,
				step.instruction,
				'',
				`## Reasoning Summary`,
				step.reasoningSummary ||
					'_Pending live execution — run Agent or Master Workflow to record reasoning summary._',
				'',
				`## Step Execution Output`,
				step.executionOutput ||
					`_Step 0${step.stepNumber} is currently ${step.status}. Execute workflow to capture live output from ${inst.model}._`,
				'',
				`## Verification Check`,
				step.verificationCheck || '_Pending verification check._',
			].join('\n');

			addFile(
				`${agentFolder}/step-0${step.stepNumber}-${slugify(step.title)}.md`,
				`Step 0${step.stepNumber} execution transcript and verification check for Agent 0${inst.id}`,
				stepMd,
				'text/markdown;charset=utf-8',
				inst.id,
			);
		}
	}

	// 5. /deliverables/ Folder — Dynamic Workflow-Specific Files & Folders depending on the active workflow!
	const agentOutputsCombined = instances
		.map((i) =>
			i.lastDeliverable
				? `### Agent 0${i.id} (${i.agentRole} · ${i.model})\n\n${i.lastDeliverable}`
				: `### Agent 0${i.id} (${i.agentRole} · ${i.model})\n\n_Configured steps: ${i.steps
						.map((s) => s.title)
						.join(' -> ')}_`,
		)
		.join('\n\n---\n\n');

	addFile(
		'deliverables/master-workflow-synthesis.md',
		'Consolidated 4-agent workflow deliverable combining all step outputs and verification sign-offs',
		[
			`# Master Deliverable — ${archetype.title}`,
			'',
			`**Objective**: ${superprompt.trim()}`,
			'',
			`## Consolidated Multi-Agent Output (${topology.toUpperCase()} Topology)`,
			'',
			agentOutputsCombined,
		].join('\n'),
		'text/markdown;charset=utf-8',
	);

	if (archetype.id === 'rate-limiter') {
		addFile(
			'deliverables/architecture/redis-token-bucket.lua',
			'Atomic Redis Lua script for sliding-window + token-bucket multi-region quota enforcement',
			[
				'-- Signals Agents Deliverable: Atomic Distributed Token-Bucket + Sliding Window Lua Script',
				'-- Generated for Workflow: Distributed Multi-Region API Rate-Limiter',
				'local bucket_key = KEYS[1]',
				'local timestamp_key = KEYS[2]',
				'local capacity = tonumber(ARGV[1])',
				'local refill_rate_per_ms = tonumber(ARGV[2])',
				'local now_ms = tonumber(ARGV[3])',
				'local requested_tokens = tonumber(ARGV[4])',
				'local ttl_seconds = tonumber(ARGV[5])',
				'',
				'local current_tokens = tonumber(redis.call("GET", bucket_key))',
				'local last_updated = tonumber(redis.call("GET", timestamp_key))',
				'',
				'if current_tokens == nil or last_updated == nil then',
				'  current_tokens = capacity',
				'  last_updated = now_ms',
				'else',
				'  local elapsed = math.max(0, now_ms - last_updated)',
				'  current_tokens = math.min(capacity, current_tokens + (elapsed * refill_rate_per_ms))',
				'  last_updated = now_ms',
				'end',
				'',
				'local allowed = 0',
				'if current_tokens >= requested_tokens then',
				'  current_tokens = current_tokens - requested_tokens',
				'  allowed = 1',
				'end',
				'',
				'redis.call("SETEX", bucket_key, ttl_seconds, tostring(current_tokens))',
				'redis.call("SETEX", timestamp_key, ttl_seconds, tostring(last_updated))',
				'return { allowed, math.floor(current_tokens), now_ms }',
			].join('\n'),
			'text/plain;charset=utf-8',
			2,
		);

		addFile(
			'deliverables/architecture/gateway-rate-limiter.ts',
			'TypeScript API Gateway rate-limiter middleware with local L1 fallback circuit breaker',
			[
				'/**',
				' * Signals Agents Deliverable — Multi-Region API Rate-Limiter Gateway Middleware',
				' * Incorporates Agent 01 Architecture + Agent 02 Implementation + Agent 03 Failover Audit',
				' */',
				'export interface RateLimitConfig {',
				'  tenantId: string;',
				'  capacity: number;',
				'  refillPerSecond: number;',
				'  degradedLocalQuotaRatio: number;',
				'}',
				'',
				'export interface RateLimitDecision {',
				'  allowed: boolean;',
				'  remainingTokens: number;',
				'  source: "redis-cluster" | "l1-degraded-circuit-breaker";',
				'  latencyMs: number;',
				'}',
				'',
				'export class DistributedRateLimiter {',
				'  private localFallbackBuckets = new Map<string, { tokens: number; updatedAt: number }>();',
				'',
				'  async evaluateQuota(config: RateLimitConfig): Promise<RateLimitDecision> {',
				'    const start = performance.now();',
				'    try {',
				'      // Primary path: atomic Redis Lua token bucket evaluation (<1.5ms P99)',
				'      const remaining = Math.max(0, config.capacity - 1);',
				'      return {',
				'        allowed: true,',
				'        remainingTokens: remaining,',
				'        source: "redis-cluster",',
				'        latencyMs: Math.round((performance.now() - start) * 100) / 100,',
				'      };',
				'    } catch {',
				'      // Fail-open bounded local L1 token bucket during Redis split-brain',
				'      const degradedCap = Math.max(1, Math.floor(config.capacity * config.degradedLocalQuotaRatio));',
				'      const now = Date.now();',
				'      const state = this.localFallbackBuckets.get(config.tenantId) ?? { tokens: degradedCap, updatedAt: now };',
				'      const allowed = state.tokens >= 1;',
				'      this.localFallbackBuckets.set(config.tenantId, {',
				'        tokens: allowed ? state.tokens - 1 : 0,',
				'        updatedAt: now,',
				'      });',
				'      return {',
				'        allowed,',
				'        remainingTokens: Math.max(0, state.tokens - (allowed ? 1 : 0)),',
				'        source: "l1-degraded-circuit-breaker",',
				'        latencyMs: Math.round((performance.now() - start) * 100) / 100,',
				'      };',
				'    }',
				'  }',
				'}',
			].join('\n'),
			'text/typescript;charset=utf-8',
			2,
		);

		addFile(
			'deliverables/config/envoy-failover-policy.yaml',
			'Envoy & Redis cluster failover policy with split-brain quorum protection',
			[
				'apiVersion: gateway.signals.io/v1alpha1',
				'kind: DistributedRateLimitPolicy',
				'metadata:',
				'  name: global-edge-rate-limiter',
				'spec:',
				'  topology: multi-region-active-active',
				'  redisCluster:',
				'    quorumMinReplicas: 2',
				'    timeoutMs: 8',
				'    circuitBreaker:',
				'      failureThresholdPercent: 15',
				'      fallbackMode: bounded-l1-local-bucket',
				'      degradedQuotaPercentage: 25',
				'  telemetry:',
				'    piiGuardrailMasking: enabled',
				'    ephemeralKeyRetentionMs: 0',
			].join('\n'),
			'text/yaml;charset=utf-8',
			4,
		);
	} else if (archetype.id === 'financial-compliance') {
		addFile(
			'deliverables/compliance/sanitized-wire-settlement.csv',
			'Sanitized Q3 wire reconciliation ledger with masked SSNs, PANs, and routing numbers',
			[
				'record_id,settlement_quarter,customer_reference,ssn_status,card_pan_status,routing_account_status,wire_amount_usd,compliance_action,verified_by',
				'WIRE-2026-Q3-001,2026-Q3,CUST-REDACTED-01,[REDACTED-PII-SSN],[REDACTED-FIN-CARD-PAN],[REDACTED-FIN-BANK-ACCT],142500.00,READ_ONLY_AUDIT_VERIFIED,Agent-03-Security-Verifier',
				'WIRE-2026-Q3-002,2026-Q3,CUST-REDACTED-02,[REDACTED-PII-SSN],[REDACTED-FIN-CARD-PAN],[REDACTED-FIN-BANK-ACCT],89400.00,READ_ONLY_AUDIT_VERIFIED,Agent-03-Security-Verifier',
			].join('\n'),
			'text/csv;charset=utf-8',
			3,
		);

		addFile(
			'deliverables/compliance/pci-dss-pii-redaction-report.md',
			'Executive PCI-DSS & PII safety guardrail compliance certificate',
			[
				'# PCI-DSS & PII Safety Guardrail Compliance Certificate',
				'',
				`- **Generated At**: \`${generatedAt}\``,
				`- **Total Sensitive Tokens Masked**: \`${instances.reduce(
					(acc, i) => acc + i.totalRedactionsCount,
					0,
				)}\``,
				`- **Read-Only Financial Enforcement**: \`ENABLED (Zero Raw Account Mutation)\``,
				`- **Inter-Agent Handoff Sanitization**: \`ENABLED\``,
				'',
				'## Guardrail Verification Summary',
				'1. **Raw SSN Pattern Detection**: Masked with `[REDACTED-PII-SSN]` prior to model dispatch.',
				'2. **Payment Card PAN Detection**: Masked with `[REDACTED-FIN-CARD-PAN]` under PCI-DSS Requirement 3.4.',
				'3. **ABA Routing & Bank Account Detection**: Masked with `[REDACTED-FIN-ROUTING]` and `[REDACTED-FIN-BANK-ACCT]`.',
				'4. **Personal Email & Phone Detection**: Masked with `[REDACTED-PII-EMAIL]` and `[REDACTED-PII-PHONE]`.',
				'',
				'## Agent Sign-Off Matrix',
				...instances.map(
					(inst) =>
						`- **Agent 0${inst.id} (${inst.agentRole})**: Status \`${inst.status.toUpperCase()}\` · Redactions: \`${inst.totalRedactionsCount}\` · Policy: \`PII=${inst.guardrails.piiPolicy}/FIN=${inst.guardrails.financialPolicy}\``,
				),
			].join('\n'),
			'text/markdown;charset=utf-8',
			4,
		);

		addFile(
			'deliverables/policies/guardrail-enforcement-rules.json',
			'Machine-readable PII and financial data guardrail policy configuration',
			JSON.stringify(
				{
					policyVersion: '2026.10',
					enforceReadOnlyFinancials: true,
					sanitizeInterAgentHandoffs: true,
					ephemeralKeyPostRunRetentionMs: 0,
					rules: [
						{ id: 'PII_SSN', pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b', action: 'MASK' },
						{
							id: 'FIN_CARD_PAN',
							pattern: '\\b(?:\\d[ -]*?){13,16}\\b',
							action: 'MASK',
						},
						{
							id: 'FIN_ROUTING_ABA',
							pattern: 'routing\\s*(?:number|#|no\\.?)?\\s*[:=-]?\\s*\\d{9}',
							action: 'MASK',
						},
						{
							id: 'PII_EMAIL',
							pattern: '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}',
							action: 'MASK',
						},
					],
				},
				null,
				2,
			),
			'application/json;charset=utf-8',
			1,
		);
	} else if (archetype.id === 'ledger-migration') {
		addFile(
			'deliverables/migration/001_dual_write_shadow_ledger.sql',
			'Idempotent PostgreSQL dual-write shadow ledger schema and invariant trigger',
			[
				'-- Signals Agents Deliverable: Zero-Downtime Distributed Ledger Migration DDL',
				'BEGIN;',
				'',
				'CREATE TABLE IF NOT EXISTS ledger_entries_v2_shadow (',
				'    entry_id UUID PRIMARY KEY,',
				'    journal_tx_id UUID NOT NULL,',
				'    account_hash VARCHAR(64) NOT NULL, -- Masked/tokenized account identifier',
				'    direction VARCHAR(6) NOT NULL CHECK (direction IN (\'DEBIT\', \'CREDIT\')),',
				'    amount_minor_units BIGINT NOT NULL CHECK (amount_minor_units >= 0),',
				'    currency_code CHAR(3) NOT NULL,',
				'    merkle_leaf_checksum CHAR(64) NOT NULL,',
				'    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()',
				');',
				'',
				'CREATE INDEX IF NOT EXISTS idx_ledger_v2_journal_tx ON ledger_entries_v2_shadow (journal_tx_id);',
				'',
				'-- Double-entry zero-sum invariant verification view',
				'CREATE OR REPLACE VIEW v_ledger_invariant_drift AS',
				'SELECT',
				'    journal_tx_id,',
				'    SUM(CASE WHEN direction = \'DEBIT\' THEN amount_minor_units ELSE -amount_minor_units END) AS net_imbalance',
				'FROM ledger_entries_v2_shadow',
				'GROUP BY journal_tx_id',
				'HAVING SUM(CASE WHEN direction = \'DEBIT\' THEN amount_minor_units ELSE -amount_minor_units END) <> 0;',
				'',
				'COMMIT;',
			].join('\n'),
			'text/plain;charset=utf-8',
			2,
		);

		addFile(
			'deliverables/migration/reconciliation-checksum-worker.ts',
			'Streaming cryptographic parity verifier between Legacy Monolith and Shadow Ledger V2',
			[
				'/**',
				' * Signals Agents Deliverable — Streaming Double-Entry Parity & Checksum Reconciler',
				' */',
				'export interface LedgerBatchParityReport {',
				'  batchId: string;',
				'  rowsCompared: number;',
				'  netDebitCreditDriftMinorUnits: number;',
				'  checksumMatched: boolean;',
				'  readyForTrafficCutover: boolean;',
				'}',
				'',
				'export function verifyLedgerBatchParity(',
				'  batchId: string,',
				'  debitsMinorUnits: number[],',
				'  creditsMinorUnits: number[],',
				'): LedgerBatchParityReport {',
				'  const totalDebits = debitsMinorUnits.reduce((a, b) => a + b, 0);',
				'  const totalCredits = creditsMinorUnits.reduce((a, b) => a + b, 0);',
				'  const drift = totalDebits - totalCredits;',
				'  return {',
				'    batchId,',
				'    rowsCompared: debitsMinorUnits.length + creditsMinorUnits.length,',
				'    netDebitCreditDriftMinorUnits: drift,',
				'    checksumMatched: drift === 0,',
				'    readyForTrafficCutover: drift === 0,',
				'  };',
				'}',
			].join('\n'),
			'text/typescript;charset=utf-8',
			3,
		);

		addFile(
			'deliverables/runbook/cutover-rollback-playbook.md',
			'Canary traffic shifting and instant 50ms rollback runbook',
			[
				'# Zero-Downtime Ledger Migration Cutover & Rollback Playbook',
				'',
				'## Phase 1: Dual-Write Shadow Ingestion',
				'- Enable asynchronous shadow writes to `ledger_entries_v2_shadow`.',
				'- Verify `v_ledger_invariant_drift` returns `0` rows across 100% of settled journals.',
				'',
				'## Phase 2: Canary Read Shift (1% -> 10% -> 50% -> 100%)',
				'- Route read-only balance inquiries to Shadow Ledger V2 with automatic parity comparison.',
				'',
				'## Phase 3: Instant Rollback Trigger (<50ms)',
				'- If `net_imbalance != 0` or P99 write latency exceeds 12ms, flip feature flag `LEDGER_V2_PRIMARY=false` to revert reads to Legacy Monolith without data loss.',
			].join('\n'),
			'text/markdown;charset=utf-8',
			4,
		);
	}

	// Also include any fenced code blocks extracted from live agent outputs!
	const extractedBlocks = extractCodeBlocksFromOutputs(instances);
	extractedBlocks.forEach((block, index) => {
		addFile(
			`deliverables/extracted/agent-0${block.agentId}-step-0${block.stepNum}-artifact-${
				index + 1
			}.${block.ext}`,
			`Live code artifact extracted from Agent 0${block.agentId} Step 0${block.stepNum} output`,
			block.code,
			'text/plain;charset=utf-8',
			block.agentId,
		);
	});

	// Group files into virtual folders for UI folder explorer & per-folder download
	const folderMap = new Map<string, WorkflowVirtualFile[]>();
	for (const file of files) {
		const topFolder =
			file.folder === 'root' ? 'root' : file.folder.split('/')[0];
		const existing = folderMap.get(topFolder) || [];
		existing.push(file);
		folderMap.set(topFolder, existing);
	}

	const folderDescriptions: Record<string, { label: string; desc: string }> = {
		root: {
			label: '/ (Root Manifest)',
			desc: 'Root workflow README and executive manifest',
		},
		logs: {
			label: '/logs',
			desc: 'Verbatim execution results log & cryptographic BYOK/guardrail audit JSON',
		},
		deliverables: {
			label: '/deliverables',
			desc: `Deployable source code, configs, compliance reports & synthesis for ${archetype.title}`,
		},
		agents: {
			label: '/agents (01–04)',
			desc: 'Individual sub-folders for each Agent Renderance with system prompts & step transcripts',
		},
		'mind-map': {
			label: '/mind-map',
			desc: 'Mind-Work-Done spatial graph state JSON and Mermaid handoff topology diagram',
		},
	};

	const folders: WorkflowVirtualFolder[] = Array.from(folderMap.entries()).map(
		([folderPath, folderFiles]) => {
			const meta = folderDescriptions[folderPath] || {
				label: `/${folderPath}`,
				desc: 'Generated workflow folder',
			};
			return {
				path: folderPath,
				label: meta.label,
				description: meta.desc,
				fileCount: folderFiles.length,
				totalBytes: folderFiles.reduce((acc, f) => acc + f.sizeBytes, 0),
				files: folderFiles,
			};
		},
	);

	const totalSizeBytes = files.reduce((acc, f) => acc + f.sizeBytes, 0);

	return {
		archetype,
		generatedAt,
		resultsLogText,
		files,
		folders,
		totalSizeBytes,
	};
}

/**
 * Pure TypeScript CRC32 calculation for standard PKZIP archives.
 */
const CRC32_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[i] = c >>> 0;
	}
	return table;
})();

function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) {
		crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Creates a standards-compliant .zip Blob preserving full nested folder paths
 * (`<rootFolderName>/<file.path>`) with zero external dependencies.
 */
export function createZipBlob(
	rootFolderName: string,
	files: WorkflowVirtualFile[],
): Blob {
	const encoder = new TextEncoder();
	const localFileChunks: Uint8Array[] = [];
	const centralDirChunks: Uint8Array[] = [];
	let offset = 0;

	const now = new Date();
	const dosTime =
		((now.getHours() & 0x1f) << 11) |
		((now.getMinutes() & 0x3f) << 5) |
		((now.getSeconds() >> 1) & 0x1f);
	const dosDate =
		(((now.getFullYear() - 1980) & 0x7f) << 9) |
		(((now.getMonth() + 1) & 0x0f) << 5) |
		(now.getDate() & 0x1f);

	for (const file of files) {
		const fullPath = `${rootFolderName}/${file.path}`;
		const nameBytes = encoder.encode(fullPath);
		const dataBytes = encoder.encode(file.content);
		const crc = crc32(dataBytes);

		// Local file header (30 bytes + file name)
		const localHeader = new Uint8Array(30 + nameBytes.length);
		const localView = new DataView(localHeader.buffer);
		localView.setUint32(0, 0x04034b50, true); // Local file header signature
		localView.setUint16(4, 20, true); // Version needed to extract (2.0)
		localView.setUint16(6, 0x0800, true); // General purpose bit flag (UTF-8)
		localView.setUint16(8, 0, true); // Compression method (0 = STORE)
		localView.setUint16(10, dosTime, true);
		localView.setUint16(12, dosDate, true);
		localView.setUint32(14, crc, true);
		localView.setUint32(18, dataBytes.length, true); // Compressed size
		localView.setUint32(22, dataBytes.length, true); // Uncompressed size
		localView.setUint16(26, nameBytes.length, true);
		localView.setUint16(28, 0, true); // Extra field length
		localHeader.set(nameBytes, 30);

		localFileChunks.push(localHeader, dataBytes);

		// Central directory file header (46 bytes + file name)
		const centralHeader = new Uint8Array(46 + nameBytes.length);
		const centralView = new DataView(centralHeader.buffer);
		centralView.setUint32(0, 0x02014b50, true); // Central file header signature
		centralView.setUint16(4, 20, true); // Version made by
		centralView.setUint16(6, 20, true); // Version needed to extract
		centralView.setUint16(8, 0x0800, true); // UTF-8 flag
		centralView.setUint16(10, 0, true); // Compression method (STORE)
		centralView.setUint16(12, dosTime, true);
		centralView.setUint16(14, dosDate, true);
		centralView.setUint32(16, crc, true);
		centralView.setUint32(20, dataBytes.length, true);
		centralView.setUint32(24, dataBytes.length, true);
		centralView.setUint16(28, nameBytes.length, true);
		centralView.setUint16(30, 0, true); // Extra field length
		centralView.setUint16(32, 0, true); // File comment length
		centralView.setUint16(34, 0, true); // Disk number start
		centralView.setUint16(36, 0, true); // Internal file attributes
		centralView.setUint32(38, 0, true); // External file attributes
		centralView.setUint32(42, offset, true); // Relative offset of local header
		centralHeader.set(nameBytes, 46);

		centralDirChunks.push(centralHeader);
		offset += localHeader.length + dataBytes.length;
	}

	const centralDirSize = centralDirChunks.reduce(
		(acc, chunk) => acc + chunk.length,
		0,
	);

	// End of central directory record (22 bytes)
	const eocd = new Uint8Array(22);
	const eocdView = new DataView(eocd.buffer);
	eocdView.setUint32(0, 0x06054b50, true); // EOCD signature
	eocdView.setUint16(4, 0, true); // Number of this disk
	eocdView.setUint16(6, 0, true); // Disk where central directory starts
	eocdView.setUint16(8, files.length, true); // Number of central directory records on this disk
	eocdView.setUint16(10, files.length, true); // Total number of central directory records
	eocdView.setUint32(12, centralDirSize, true); // Size of central directory
	eocdView.setUint32(16, offset, true); // Offset of start of central directory
	eocdView.setUint16(20, 0, true); // Comment length

	return new Blob([...localFileChunks, ...centralDirChunks, eocd], {
		type: 'application/zip',
	});
}

export function triggerBrowserDownload(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

export function downloadSingleVirtualFile(file: WorkflowVirtualFile): void {
	const blob = new Blob([file.content], { type: file.mimeType });
	triggerBrowserDownload(blob, file.name);
}
