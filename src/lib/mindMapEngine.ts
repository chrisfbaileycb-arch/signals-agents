import {
	WorkflowInstance,
	WorkflowTopology,
} from './workflowTypes';

export type NodeColorType = 'emerald' | 'violet' | 'amber' | 'rose';

export type NodeSemanticRole =
	| 'owner'
	| 'agent'
	| 'step'
	| 'guardrail'
	| 'urgent'
	| 'milestone'
	| 'finance'
	| 'brainstorm'
	| 'done'
	| 'pending';

export interface NodePayload {
	role: NodeSemanticRole;
	notes: string;
	source: 'workflow' | 'intake' | 'blueprint' | 'manual';
	priority: 'normal' | 'high' | 'critical';
	createdAt: string;
	// Workflow binding metadata for coordinating execution directly from the Mind Map
	instanceId?: number;
	stepId?: string;
	stepNumber?: number;
	model?: string;
	agentRole?: string;
	statusLabel?: string;
	durationMs?: number;
	redactionsCount?: number;
	reasoningSummary?: string;
	executionOutput?: string;
	verificationCheck?: string;
	guardrailSummary?: string;
}

export interface MindNode {
	id: string;
	type: NodeColorType;
	label: string;
	x: number;
	y: number;
	selected?: boolean;
	isExecuting?: boolean;
	payload: NodePayload;
}

export interface MindLink {
	id: string;
	from: string;
	to: string;
	label?: string;
	isActiveFlow?: boolean;
	isCompletedFlow?: boolean;
}

export interface GraphState {
	nodes: MindNode[];
	links: MindLink[];
	pointerId: string | null;
}

export type CompanionType = 'robot' | 'stuffed-animal' | 'grandma';

export interface MindAuditLogItem {
	id: string;
	time: string;
	message: string;
}

export const MIND_STORAGE_KEY = 'signals-agents-mind-work-done-v1';
export const MIND_APPROVAL_KEY = 'signals-agents-mind-approved';
export const MIND_COMPANION_KEY = 'signals-agents-mind-companion';

export const NODE_RADII: Record<NodeColorType, number> = {
	emerald: 17,
	violet: 20,
	amber: 16,
	rose: 18,
};

export const NODE_COLORS: Record<
	NodeColorType,
	{
		stroke: string;
		fill: string;
		text: string;
		label: string;
		glowClass: string;
	}
> = {
	emerald: {
		stroke: '#34d399',
		fill: '#0d0d0f',
		text: '#6ee7b7',
		label: 'Emerald · Done / Core',
		glowClass: 'glow-emerald',
	},
	violet: {
		stroke: '#8b5cf6',
		fill: '#0d0d0f',
		text: '#c4b5fd',
		label: 'Violet · Executing / Brainstorm',
		glowClass: 'glow-violet',
	},
	amber: {
		stroke: '#fbbf24',
		fill: '#0d0d0f',
		text: '#fcd34d',
		label: 'Amber · Queued / Guardrail',
		glowClass: 'glow-amber',
	},
	rose: {
		stroke: '#f43f5e',
		fill: '#0d0d0f',
		text: '#fda4af',
		label: 'Rose · Blocked / Alert',
		glowClass: 'glow-rose',
	},
};

export const COMPANION_META: Record<
	CompanionType,
	{
		name: string;
		approvedLine: string;
		deniedLine: string;
	}
> = {
	robot: {
		name: 'Axiom-7 Sentinel Robot',
		approvedLine:
			'Owner authorization verified. Destructive graph mutations and step overrides unlocked.',
		deniedLine:
			'Safety interlock engaged. Unlock Edit Authorization to delete workflow nodes.',
	},
	'stuffed-animal': {
		name: 'Barnaby Studio Bear',
		approvedLine:
			'Paws up! You have full permission to prune nodes or rewire agent steps.',
		deniedLine:
			'Hold on! Barnaby is guarding your active workflow nodes from accidental deletion.',
	},
	grandma: {
		name: 'Grandma Evelyn',
		approvedLine:
			'Go right ahead, dear—your mind map and financial guardrails are in good hands.',
		deniedLine:
			'Measure twice, cut once! Unlock approval first before removing any workflow step.',
	},
};

/**
 * Computes default deterministic coordinates for the Central Workflow Hub,
 * the 4 Agent Renderance nodes, their 3 execution steps each, and the Ephemeral Key/Guardrail node
 * for the directional workflow sequence.
 */
export function computeTopologyCoordinates(
	_topology: WorkflowTopology,
): Record<string, { x: number; y: number }> {
	const coords: Record<string, { x: number; y: number }> = {};

	// Left-to-right sequential handoff chain: Core -> Agent 01 -> Agent 02 -> Agent 03 -> Agent 04 -> Lease Purge
	coords['wf-core'] = { x: -460, y: 0 };
	const agentXs = [-250, -40, 170, 380];
	const agentYs = [-20, 20, -20, 20];

	for (let i = 0; i < 4; i++) {
		const agentId = i + 1;
		const ax = agentXs[i];
		const ay = agentYs[i];
		coords[`agent-${agentId}`] = { x: ax, y: ay };

		// 3 execution steps arranged in a clean vertical/fan arc above or below the agent
		const direction = i % 2 === 0 ? -1 : 1;
		for (let s = 0; s < 3; s++) {
			const stepNum = s + 1;
			const offsetX = (s - 1) * 76;
			const offsetY = direction * (115 + (s === 1 ? 26 : 0));
			coords[`step-${agentId}-${stepNum}`] = {
				x: Math.round(ax + offsetX),
				y: Math.round(ay + offsetY),
			};
		}
	}
	coords['lease-guardrail'] = { x: 545, y: 0 };

	return coords;
}

/**
 * Synchronizes the live 4-agent workflow execution state into the interactive Mind-Map GraphState.
 * Preserves user-dragged coordinates (unless forceLayout is true) and preserves any custom/blueprint nodes.
 */
export function syncWorkflowToMindMapGraph(
	prevGraph: GraphState | null,
	instances: WorkflowInstance[],
	topology: WorkflowTopology,
	superprompt: string,
	isGlobalRunning: boolean,
	activeGlobalLeaseId: string | null,
	lastPurgeReceipt: {
		leaseId: string;
		purgedAt: string;
		totalDurationMs: number;
		redactionsApplied: number;
	} | null,
	forceLayout = false,
): GraphState {
	const now = new Date().toISOString();
	const defaultCoords = computeTopologyCoordinates(topology);
	const existingNodeMap = new Map<string, MindNode>();

	if (prevGraph && !forceLayout) {
		for (const n of prevGraph.nodes) {
			existingNodeMap.set(n.id, n);
		}
	}

	const getPos = (id: string, fallbackX: number, fallbackY: number) => {
		const prev = existingNodeMap.get(id);
		if (prev && !forceLayout) {
			return { x: prev.x, y: prev.y };
		}
		return defaultCoords[id] || { x: fallbackX, y: fallbackY };
	};

	const workflowNodes: MindNode[] = [];
	const workflowLinks: MindLink[] = [];

	// 1. Central Workflow Objective Hub Node
	const allCompleted =
		instances.length > 0 && instances.every((i) => i.status === 'completed');
	const anyBlocked = instances.some(
		(i) => i.status === 'blocked' || i.status === 'error',
	);
	const anyRunning =
		isGlobalRunning || instances.some((i) => i.status === 'running');

	const coreColor: NodeColorType = anyBlocked
		? 'rose'
		: anyRunning
		? 'violet'
		: allCompleted
		? 'emerald'
		: 'emerald';

	const corePos = getPos('wf-core', 0, 0);
	workflowNodes.push({
		id: 'wf-core',
		type: coreColor,
		label: anyRunning
			? 'Executing Workflow Hub'
			: allCompleted
			? 'Workflow Hub · Completed'
			: 'Workflow Objective Hub',
		x: corePos.x,
		y: corePos.y,
		isExecuting: anyRunning,
		payload: {
			role: 'owner',
			notes: superprompt || 'Master multi-agent workflow objective.',
			source: 'workflow',
			priority: 'critical',
			createdAt: existingNodeMap.get('wf-core')?.payload.createdAt || now,
			statusLabel: anyRunning
				? `RUNNING (${topology.toUpperCase()})`
				: allCompleted
				? 'COMPLETED'
				: 'READY',
		},
	});

	// 2. Agent Renderance Hub Nodes (01 - 04) + Their Individual Execution Step Nodes
	instances.forEach((inst, idx) => {
		const agentNodeId = `agent-${inst.id}`;
		const agentPos = getPos(agentNodeId, (idx - 1.5) * 180, 0);

		const agentColor: NodeColorType =
			inst.status === 'blocked' || inst.status === 'error'
				? 'rose'
				: inst.status === 'running'
				? 'violet'
				: inst.status === 'completed'
				? 'emerald'
				: 'amber';

		const doneSteps = inst.steps.filter((s) => s.status === 'completed').length;
		const activeStep = inst.steps.find((s) => s.status === 'running');

		workflowNodes.push({
			id: agentNodeId,
			type: agentColor,
			label: `0${inst.id} · ${inst.agentRole.split('&')[0].trim()}`,
			x: agentPos.x,
			y: agentPos.y,
			isExecuting: inst.status === 'running',
			payload: {
				role: 'agent',
				instanceId: inst.id,
				model: inst.model,
				agentRole: inst.agentRole,
				statusLabel:
					inst.status === 'running' && activeStep
						? `Executing Step ${activeStep.stepNumber}/${inst.steps.length}`
						: `${inst.status.toUpperCase()} (${doneSteps}/${inst.steps.length} steps)`,
				durationMs: inst.totalRuntimeMs,
				redactionsCount: inst.totalRedactionsCount,
				notes: `System Prompt: ${inst.customSystemPrompt}`,
				executionOutput: inst.lastDeliverable,
				source: 'workflow',
				priority: 'high',
				createdAt: existingNodeMap.get(agentNodeId)?.payload.createdAt || now,
			},
		});

		// Build each agent's step nodes and sequential step-to-step links
		inst.steps.forEach((step, sIdx) => {
			const stepNodeId = `step-${inst.id}-${step.stepNumber}`;
			const fallbackPos = defaultCoords[stepNodeId] || {
				x: agentPos.x + (sIdx - 1) * 75,
				y: agentPos.y + (idx % 2 === 0 ? -120 : 120),
			};
			const stepPos = getPos(stepNodeId, fallbackPos.x, fallbackPos.y);

			const stepColor: NodeColorType =
				step.status === 'blocked' || step.status === 'error'
					? 'rose'
					: step.status === 'running'
					? 'violet'
					: step.status === 'completed'
					? 'emerald'
					: 'amber';

			workflowNodes.push({
				id: stepNodeId,
				type: stepColor,
				label: step.title,
				x: stepPos.x,
				y: stepPos.y,
				isExecuting: step.status === 'running',
				payload: {
					role: 'step',
					instanceId: inst.id,
					stepId: step.id,
					stepNumber: step.stepNumber,
					model: inst.model,
					agentRole: inst.agentRole,
					statusLabel:
						step.durationMs !== undefined
							? `${step.status.toUpperCase()} · ${step.durationMs}ms`
							: step.status.toUpperCase(),
					durationMs: step.durationMs,
					notes: step.instruction,
					reasoningSummary: step.reasoningSummary,
					executionOutput: step.executionOutput,
					verificationCheck: step.verificationCheck,
					guardrailSummary: step.guardrailSummary,
					source: 'workflow',
					priority: step.status === 'running' ? 'critical' : 'normal',
					createdAt: existingNodeMap.get(stepNodeId)?.payload.createdAt || now,
				},
			});

			// Link Agent -> Step 1, and Step 1 -> Step 2 -> Step 3
			if (sIdx === 0) {
				workflowLinks.push({
					id: `link-${agentNodeId}-${stepNodeId}`,
					from: agentNodeId,
					to: stepNodeId,
					label: 'step 1',
					isActiveFlow: step.status === 'running',
					isCompletedFlow: step.status === 'completed',
				});
			} else {
				const prevStepNodeId = `step-${inst.id}-${inst.steps[sIdx - 1].stepNumber}`;
				workflowLinks.push({
					id: `link-${prevStepNodeId}-${stepNodeId}`,
					from: prevStepNodeId,
					to: stepNodeId,
					label: `step ${step.stepNumber}`,
					isActiveFlow: step.status === 'running',
					isCompletedFlow: step.status === 'completed',
				});
			}
		});
	});

	// 3. Ephemeral Lease & Financial/PII Guardrail Verification Node
	const totalRedactions = instances.reduce(
		(acc, i) => acc + i.totalRedactionsCount,
		0,
	);
	const leasePos = getPos('lease-guardrail', 480, 0);
	const leaseColor: NodeColorType = anyBlocked
		? 'rose'
		: activeGlobalLeaseId
		? 'violet'
		: lastPurgeReceipt
		? 'emerald'
		: 'amber';

	workflowNodes.push({
		id: 'lease-guardrail',
		type: leaseColor,
		label: activeGlobalLeaseId
			? `Lease Active (${activeGlobalLeaseId.slice(0, 10)})`
			: lastPurgeReceipt
			? 'Key Lease Auto-Deleted (0ms)'
			: 'Ephemeral Lease & Guardrail Gate',
		x: leasePos.x,
		y: leasePos.y,
		isExecuting: Boolean(activeGlobalLeaseId),
		payload: {
			role: 'guardrail',
			statusLabel: activeGlobalLeaseId
				? 'LEASE IN USE'
				: lastPurgeReceipt
				? 'PURGED ON COMPLETION'
				: 'STANDBY',
			redactionsCount: totalRedactions,
			durationMs: lastPurgeReceipt?.totalDurationMs,
			notes: lastPurgeReceipt
				? `Ephemeral API key lease (${lastPurgeReceipt.leaseId}) automatically purged at ${new Date(
						lastPurgeReceipt.purgedAt,
				  ).toLocaleTimeString()} after ${lastPurgeReceipt.totalDurationMs}ms. Total PII/Financial redactions: ${totalRedactions}.`
				: `Enforces per-agent PII & Financial guardrails across all handoffs and deletes the ephemeral API key lease immediately upon workflow completion.`,
			source: 'workflow',
			priority: 'critical',
			createdAt: existingNodeMap.get('lease-guardrail')?.payload.createdAt || now,
		},
	});

	// 4. Inter-Agent Topology Links (Coordinating Directional, Diamond, or Parallel Handoffs)
	if (topology === 'directional') {
		workflowLinks.push({
			id: 'link-core-agent-1',
			from: 'wf-core',
			to: 'agent-1',
			label: 'intake',
			isActiveFlow: instances[0]?.status === 'running',
			isCompletedFlow: instances[0]?.status === 'completed',
		});
		for (let i = 0; i < 3; i++) {
			const fromInst = instances[i];
			const toInst = instances[i + 1];
			workflowLinks.push({
				id: `link-handoff-${i + 1}-${i + 2}`,
				from: `agent-${i + 1}`,
				to: `agent-${i + 2}`,
				label: `handoff 0${i + 1}→0${i + 2}`,
				isActiveFlow:
					fromInst?.status === 'completed' && toInst?.status === 'running',
				isCompletedFlow:
					fromInst?.status === 'completed' && toInst?.status === 'completed',
			});
		}
		workflowLinks.push({
			id: 'link-agent-4-lease',
			from: 'agent-4',
			to: 'lease-guardrail',
			label: 'purge key',
			isActiveFlow: instances[3]?.status === 'running',
			isCompletedFlow: instances[3]?.status === 'completed',
		});
	}

	// Preserve any custom manual / intake / blueprint nodes & links created by the user on the canvas
	const workflowNodeIds = new Set(workflowNodes.map((n) => n.id));
	const customNodes = prevGraph
		? prevGraph.nodes.filter((n) => !workflowNodeIds.has(n.id))
		: [];
	const workflowLinkIds = new Set(workflowLinks.map((l) => l.id));
	const customLinks = prevGraph
		? prevGraph.links.filter(
				(l) =>
					!workflowLinkIds.has(l.id) &&
					!l.id.startsWith('link-core-') &&
					!l.id.startsWith('link-handoff-') &&
					!l.id.startsWith('link-fan') &&
					!l.id.startsWith('link-agent-'),
		  )
		: [];

	const allNodes = [...workflowNodes, ...customNodes];
	const activePointer =
		prevGraph?.pointerId && allNodes.some((n) => n.id === prevGraph.pointerId)
			? prevGraph.pointerId
			: 'wf-core';

	return {
		nodes: allNodes.map((n) => ({
			...n,
			selected: n.id === activePointer,
		})),
		links: [...workflowLinks, ...customLinks],
		pointerId: activePointer,
	};
}

/**
 * Classifies a raw text line into Mind-Work-Done node color, semantic role, and priority.
 */
export function classifyTextLine(line: string): {
	type: NodeColorType;
	role: NodeSemanticRole;
	priority: 'normal' | 'high' | 'critical';
} {
	const lower = line.toLowerCase();
	if (
		lower.includes('urgent') ||
		lower.includes('alert') ||
		lower.includes('critical') ||
		lower.includes('blocker')
	) {
		return { type: 'amber', role: 'urgent', priority: 'critical' };
	}
	if (
		lower.includes('finance') ||
		lower.includes('financial') ||
		lower.includes('invoice') ||
		lower.includes('budget') ||
		lower.includes('pii') ||
		lower.includes('$')
	) {
		return { type: 'amber', role: 'finance', priority: 'high' };
	}
	if (
		lower.includes('done') ||
		lower.includes('shipped') ||
		lower.includes('complete') ||
		lower.includes('milestone') ||
		lower.includes('verified')
	) {
		return { type: 'emerald', role: 'milestone', priority: 'high' };
	}
	if (
		lower.includes('brainstorm') ||
		lower.includes('idea') ||
		lower.includes('explore') ||
		lower.includes('agent') ||
		lower.includes('design')
	) {
		return { type: 'violet', role: 'brainstorm', priority: 'normal' };
	}
	return { type: 'violet', role: 'pending', priority: 'normal' };
}

/**
 * Parses unstructured intake lines into radial MindNodes + MindLinks anchored to the selected node.
 */
export function parseRawIntakeToNodes(
	rawText: string,
	anchor: MindNode,
): { newNodes: MindNode[]; newLinks: MindLink[] } {
	const lines = rawText
		.split(/\r?\n/)
		.map((l) => l.replace(/^[-*•\d.)+\s]+/, '').trim())
		.filter(Boolean);

	const now = new Date().toISOString();
	const newNodes: MindNode[] = [];
	const newLinks: MindLink[] = [];

	lines.forEach((line, idx) => {
		const { type, role, priority } = classifyTextLine(line);
		const angle = -Math.PI / 2 + (idx * (Math.PI * 2)) / Math.max(lines.length, 4);
		const radius = 165 + (idx % 2) * 45;
		const id = `intake-${Date.now()}-${idx}`;
		const cleanLabel = line.replace(
			/^(urgent|milestone|financial|finance|brainstorm|done):\s*/i,
			'',
		);

		newNodes.push({
			id,
			type,
			label: cleanLabel.slice(0, 48),
			x: Math.round(anchor.x + Math.cos(angle) * radius),
			y: Math.round(anchor.y + Math.sin(angle) * radius),
			selected: false,
			payload: {
				role,
				notes: line,
				source: 'intake',
				priority,
				createdAt: now,
			},
		});

		newLinks.push({
			id: `link-${anchor.id}-${id}`,
			from: anchor.id,
			to: id,
			label: role,
		});
	});

	return { newNodes, newLinks };
}

/**
 * Parses Blueprint snippets (Arrow chains `Stage A -> Stage B`, JSON arrays, or JSX tags)
 * into connected MindNodes and MindLinks on the stage.
 */
export function parseBlueprintToNodes(
	rawText: string,
	anchor: MindNode,
): { newNodes: MindNode[]; newLinks: MindLink[] } {
	const trimmed = rawText.trim();
	const now = new Date().toISOString();
	const newNodes: MindNode[] = [];
	const newLinks: MindLink[] = [];

	if (!trimmed) return { newNodes, newLinks };

	// 1. JSON array or object support
	if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
		try {
			const parsed = JSON.parse(trimmed);
			const list = Array.isArray(parsed) ? parsed : parsed.nodes || [parsed];
			const labelToId = new Map<string, string>();

			list.forEach((item: Record<string, unknown>, idx: number) => {
				const id = `bp-json-${Date.now()}-${idx}`;
				const label = String(
					item.label || item.name || item.title || `Blueprint #${idx + 1}`,
				);
				labelToId.set(label.toLowerCase(), id);

				const angle = (idx * (Math.PI * 2)) / Math.max(list.length, 3);
				const radius = 190;
				const rawType = String(item.type || '').toLowerCase();
				const colorType: NodeColorType =
					rawType === 'emerald' || rawType === 'done'
						? 'emerald'
						: rawType === 'amber' || rawType === 'urgent'
						? 'amber'
						: 'violet';

				newNodes.push({
					id,
					type: colorType,
					label,
					x: Math.round(anchor.x + Math.cos(angle) * radius),
					y: Math.round(anchor.y + Math.sin(angle) * radius),
					selected: false,
					payload: {
						role:
							colorType === 'emerald'
								? 'milestone'
								: colorType === 'amber'
								? 'pending'
								: 'brainstorm',
						notes: String(item.notes || item.description || JSON.stringify(item)),
						source: 'blueprint',
						priority: 'normal',
						createdAt: now,
					},
				});
			});

			list.forEach((item: Record<string, unknown>, idx: number) => {
				const currentNode = newNodes[idx];
				if (!currentNode) return;
				const targetKey = item.to || item.target || item.parent;
				if (targetKey && labelToId.has(String(targetKey).toLowerCase())) {
					const targetId = labelToId.get(String(targetKey).toLowerCase())!;
					newLinks.push({
						id: `link-${currentNode.id}-${targetId}`,
						from: currentNode.id,
						to: targetId,
						label: 'flow',
					});
				} else {
					newLinks.push({
						id: `link-${anchor.id}-${currentNode.id}`,
						from: anchor.id,
						to: currentNode.id,
						label: 'blueprint',
					});
				}
			});

			return { newNodes, newLinks };
		} catch {
			// Fall through to arrow chain parser
		}
	}

	// 2. Arrow pipelines: e.g. "Agent 01 Intake -> Guardrail Redaction -> Agent 02 Synthesis"
	if (trimmed.includes('->') || trimmed.includes('=>')) {
		const lines = trimmed
			.split(/\r?\n/)
			.map((l) => l.trim())
			.filter(Boolean);
		const labelMap = new Map<string, MindNode>();

		lines.forEach((line) => {
			const parts = line
				.split(/->|=>/)
				.map((p) => p.replace(/^[-*•\s]+/, '').trim())
				.filter(Boolean);

			for (let i = 0; i < parts.length; i++) {
				const partLabel = parts[i];
				const key = partLabel.toLowerCase();
				if (!labelMap.has(key)) {
					const idx = labelMap.size;
					const angle = -Math.PI / 2 + (idx * (Math.PI * 2)) / 7;
					const radius = 180 + Math.floor(idx / 6) * 80;
					const { type, role, priority } = classifyTextLine(partLabel);
					const node: MindNode = {
						id: `bp-flow-${Date.now()}-${idx}`,
						type: type === 'amber' && role === 'pending' ? 'violet' : type,
						label: partLabel,
						x: Math.round(anchor.x + Math.cos(angle) * radius),
						y: Math.round(anchor.y + Math.sin(angle) * radius),
						selected: false,
						payload: {
							role: role === 'pending' ? 'brainstorm' : role,
							notes: `Blueprint pipeline stage: ${partLabel}`,
							source: 'blueprint',
							priority,
							createdAt: now,
						},
					};
					labelMap.set(key, node);
					newNodes.push(node);
				}

				if (i === 0) {
					const firstNode = labelMap.get(key)!;
					const linkExists = newLinks.some(
						(l) => l.from === anchor.id && l.to === firstNode.id,
					);
					if (!linkExists) {
						newLinks.push({
							id: `link-${anchor.id}-${firstNode.id}`,
							from: anchor.id,
							to: firstNode.id,
							label: 'entry',
						});
					}
				}
				if (i > 0) {
					const prevNode = labelMap.get(parts[i - 1].toLowerCase())!;
					const currNode = labelMap.get(key)!;
					newLinks.push({
						id: `link-${prevNode.id}-${currNode.id}-${i}`,
						from: prevNode.id,
						to: currNode.id,
						label: 'next',
					});
				}
			}
		});

		if (newNodes.length > 0) return { newNodes, newLinks };
	}

	// 3. JSX or Markdown fallback
	const lines = trimmed
		.split(/\r?\n/)
		.map((l) => l.replace(/^[#*>-]+\s*/, '').trim())
		.filter(Boolean);

	lines.forEach((token, idx) => {
		const angle = (idx * (Math.PI * 2)) / Math.max(lines.length, 3);
		const radius = 190;
		const id = `bp-tok-${Date.now()}-${idx}`;
		newNodes.push({
			id,
			type: 'violet',
			label: token.slice(0, 44),
			x: Math.round(anchor.x + Math.cos(angle) * radius),
			y: Math.round(anchor.y + Math.sin(angle) * radius),
			selected: false,
			payload: {
				role: 'brainstorm',
				notes: `Extracted from blueprint snippet (${token})`,
				source: 'blueprint',
				priority: 'normal',
				createdAt: now,
			},
		});
		newLinks.push({
			id: `link-${anchor.id}-${id}`,
			from: anchor.id,
			to: id,
			label: 'branch',
		});
	});

	return { newNodes, newLinks };
}

export const MIND_BLUEPRINT_PRESETS = [
	{
		title: 'Agent Handoff Pipeline',
		content: `Objective Intake -> PII & Financial Redaction Gate -> Agent 01 Architecture Spec -> Agent 02 Implementation -> Agent 03 Compliance Audit -> Agent 04 Release Synthesis -> Zero-Retention Key Purge`,
	},
	{
		title: 'Financial Compliance Triage',
		content: `[
  { "name": "PCI-DSS Card PAN Scrubber", "type": "amber", "notes": "Masks 16-digit PANs before LLM context" },
  { "name": "Read-Only Ledger Gate", "type": "emerald", "to": "PCI-DSS Card PAN Scrubber", "notes": "Blocks raw account mutations" },
  { "name": "Ephemeral Lease Verifier", "type": "violet", "to": "Read-Only Ledger Gate", "notes": "Purges session key in 0ms" }
]`,
	},
];
