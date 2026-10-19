import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
	AVAILABLE_MODELS,
	EnvironmentTheme,
	GeminiModelId,
	WorkflowInstance,
	WorkflowTopology,
} from 'lib/workflowTypes';
import {
	COMPANION_META,
	CompanionType,
	computeTopologyCoordinates,
	GraphState,
	MIND_BLUEPRINT_PRESETS,
	MindAuditLogItem,
	MindNode,
	NODE_COLORS,
	NODE_RADII,
	NodeColorType,
	NodeSemanticRole,
	parseBlueprintToNodes,
	parseRawIntakeToNodes,
	syncWorkflowToMindMapGraph,
} from 'lib/mindMapEngine';
import {
	CheckCircledIcon,
	Cross2Icon,
	DownloadIcon,
	FileTextIcon,
	LockClosedIcon,
	MagnifyingGlassIcon,
	PlayIcon,
	PlusIcon,
	ReloadIcon,
	ResetIcon,
	TrashIcon,
	ZoomInIcon,
	ZoomOutIcon,
} from '@radix-ui/react-icons';

interface MindMapThemeConfig {
	isLightTheme: boolean;
	rootClass: string;
	headerClass: string;
	railClass: string;
	cardClass: string;
	inputClass: string;
	floatingToolbarClass: string;
	bottomStripClass: string;
	modalCardClass: string;
	titleTextClass: string;
	bodyTextClass: string;
	mutedTextClass: string;
	nodeFill: string;
	nodeSelectedFill: string;
	primaryLabelFill: string;
	selectedLabelFill: string;
	labelHaloStroke: string;
	labelHaloWidth: number;
	primaryFontWeight: number;
	selectedFontWeight: number;
	subtitleFontWeight: number;
	edgeFontWeight: number;
	primaryFontSizeBoost: number;
	defaultEdgeStroke: string;
	crosshairStroke: string;
	subtitleDefaultFill: string;
	subtitleEmeraldFill: string;
	subtitleVioletFill: string;
	edgePillFill: string;
	edgePillStroke: string;
	nodePalette: Record<
		NodeColorType,
		{ stroke: string; text: string; badgeText: string }
	>;
}

const MIND_MAP_THEMES: Record<EnvironmentTheme, MindMapThemeConfig> = {
	light: {
		isLightTheme: true,
		rootClass:
			'bg-[#f8fafc] text-slate-950 border-slate-300 font-semibold mindmap-stage-root',
		headerClass: 'bg-white/95 border-slate-300 text-slate-950',
		railClass: 'bg-[#f1f5f9] border-slate-300 text-slate-900',
		cardClass: 'bg-white border-slate-300 shadow-xs',
		inputClass:
			'bg-white border-slate-300 text-slate-950 font-semibold placeholder:text-slate-400',
		floatingToolbarClass:
			'bg-white/95 border-slate-300 text-slate-900 shadow-sm',
		bottomStripClass:
			'bg-white/95 border-slate-300 text-slate-800 font-semibold shadow-sm',
		modalCardClass: 'bg-white border-slate-300 text-slate-900',
		titleTextClass: 'text-slate-950 font-bold',
		bodyTextClass: 'text-slate-800 font-semibold',
		mutedTextClass: 'text-slate-600 font-semibold',
		nodeFill: '#ffffff',
		nodeSelectedFill: '#eff6ff',
		primaryLabelFill: '#020617',
		selectedLabelFill: '#0f172a',
		labelHaloStroke: 'rgba(255, 255, 255, 0.98)',
		labelHaloWidth: 4.5,
		primaryFontWeight: 700,
		selectedFontWeight: 800,
		subtitleFontWeight: 700,
		edgeFontWeight: 700,
		primaryFontSizeBoost: 0.8,
		defaultEdgeStroke: 'rgba(15, 23, 42, 0.34)',
		crosshairStroke: 'rgba(15, 23, 42, 0.14)',
		subtitleDefaultFill: '#1e293b',
		subtitleEmeraldFill: '#065f46',
		subtitleVioletFill: '#5b21b6',
		edgePillFill: 'rgba(255, 255, 255, 0.94)',
		edgePillStroke: 'rgba(148, 163, 184, 0.7)',
		nodePalette: {
			emerald: { stroke: '#059669', text: '#065f46', badgeText: '#065f46' },
			violet: { stroke: '#7c3aed', text: '#5b21b6', badgeText: '#5b21b6' },
			amber: { stroke: '#d97706', text: '#92400e', badgeText: '#92400e' },
			rose: { stroke: '#e11d48', text: '#9f1239', badgeText: '#9f1239' },
		},
	},
	pastel: {
		isLightTheme: true,
		rootClass:
			'bg-[#faf7ff] text-[#1e103d] border-[#cbb8ed] font-semibold mindmap-stage-root',
		headerClass: 'bg-[#f3effb]/95 border-[#cbb8ed] text-[#1e103d]',
		railClass: 'bg-[#efe9fa] border-[#cbb8ed] text-[#1e103d]',
		cardClass: 'bg-[#fcfaff] border-[#cbb8ed] shadow-xs',
		inputClass:
			'bg-white border-[#cbb8ed] text-[#1e103d] font-semibold placeholder:text-[#7c66a8]',
		floatingToolbarClass:
			'bg-[#fcfaff]/95 border-[#cbb8ed] text-[#1e103d] shadow-sm',
		bottomStripClass:
			'bg-[#fcfaff]/95 border-[#cbb8ed] text-[#2b1854] font-semibold shadow-sm',
		modalCardClass: 'bg-[#fcfaff] border-[#cbb8ed] text-[#1e103d]',
		titleTextClass: 'text-[#180b33] font-bold',
		bodyTextClass: 'text-[#2b1854] font-semibold',
		mutedTextClass: 'text-[#523982] font-semibold',
		nodeFill: '#ffffff',
		nodeSelectedFill: '#f3effb',
		primaryLabelFill: '#180b33',
		selectedLabelFill: '#0e0424',
		labelHaloStroke: 'rgba(250, 247, 255, 0.98)',
		labelHaloWidth: 4.5,
		primaryFontWeight: 700,
		selectedFontWeight: 800,
		subtitleFontWeight: 700,
		edgeFontWeight: 700,
		primaryFontSizeBoost: 0.8,
		defaultEdgeStroke: 'rgba(43, 24, 84, 0.34)',
		crosshairStroke: 'rgba(43, 24, 84, 0.14)',
		subtitleDefaultFill: '#3b2369',
		subtitleEmeraldFill: '#0f766e',
		subtitleVioletFill: '#5b21b6',
		edgePillFill: 'rgba(252, 250, 255, 0.94)',
		edgePillStroke: 'rgba(196, 181, 253, 0.8)',
		nodePalette: {
			emerald: { stroke: '#0d9488', text: '#115e59', badgeText: '#0f766e' },
			violet: { stroke: '#7c3aed', text: '#5b21b6', badgeText: '#5b21b6' },
			amber: { stroke: '#ea580c', text: '#9a3412', badgeText: '#9a3412' },
			rose: { stroke: '#e11d48', text: '#9f1239', badgeText: '#9f1239' },
		},
	},
	earthy: {
		isLightTheme: false,
		rootClass: 'bg-[#161310] text-[#f5ebe0] border-[#463a30]',
		headerClass: 'bg-[#1d1814]/95 border-[#463a30] text-[#f5ebe0]',
		railClass: 'bg-[#191511] border-[#463a30] text-[#f5ebe0]',
		cardClass: 'bg-[#251f1a] border-[#463a30]',
		inputClass:
			'bg-[#130f0c] border-[#463a30] text-[#f5ebe0] placeholder:text-[#8c7865]',
		floatingToolbarClass: 'bg-[#1d1814]/95 border-[#463a30] text-[#f5ebe0]',
		bottomStripClass: 'bg-[#1d1814]/90 border-[#463a30] text-[#decbb7]',
		modalCardClass: 'bg-[#1d1814] border-[#463a30] text-[#f5ebe0]',
		titleTextClass: 'text-[#f5ebe0] font-semibold',
		bodyTextClass: 'text-[#decbb7] font-medium',
		mutedTextClass: 'text-[#b5a18e]',
		nodeFill: '#221c17',
		nodeSelectedFill: '#2f261f',
		primaryLabelFill: '#f5ebe0',
		selectedLabelFill: '#ffffff',
		labelHaloStroke: 'rgba(22, 19, 16, 0.94)',
		labelHaloWidth: 3.2,
		primaryFontWeight: 500,
		selectedFontWeight: 600,
		subtitleFontWeight: 500,
		edgeFontWeight: 500,
		primaryFontSizeBoost: 0,
		defaultEdgeStroke: 'rgba(245, 235, 224, 0.24)',
		crosshairStroke: 'rgba(245, 235, 224, 0.08)',
		subtitleDefaultFill: '#cbb8a3',
		subtitleEmeraldFill: '#6ee7b7',
		subtitleVioletFill: '#fcd34d',
		edgePillFill: 'rgba(29, 24, 20, 0.88)',
		edgePillStroke: 'rgba(70, 58, 48, 0.8)',
		nodePalette: {
			emerald: { stroke: '#34d399', text: '#6ee7b7', badgeText: '#6ee7b7' },
			violet: { stroke: '#f59e0b', text: '#fde68a', badgeText: '#fcd34d' },
			amber: { stroke: '#fb923c', text: '#fed7aa', badgeText: '#fdba74' },
			rose: { stroke: '#f43f5e', text: '#fda4af', badgeText: '#fda4af' },
		},
	},
	dark: {
		isLightTheme: false,
		rootClass: 'bg-[#0a0a0c] text-slate-100 border-slate-800',
		headerClass: 'bg-[#0d0d10]/95 border-white/10 text-slate-100',
		railClass: 'bg-[#0d0d0f] border-white/10 text-slate-100',
		cardClass: 'bg-black/40 border-white/10',
		inputClass:
			'bg-black/50 border-white/10 text-slate-100 placeholder:text-slate-500',
		floatingToolbarClass: 'bg-[#0a0a0a]/90 border-white/10 text-slate-200',
		bottomStripClass: 'bg-[#0a0a0a]/85 border-white/10 text-slate-300',
		modalCardClass: 'bg-[#0d0d0f] border-white/10 text-slate-100',
		titleTextClass: 'text-white font-semibold',
		bodyTextClass: 'text-slate-200 font-medium',
		mutedTextClass: 'text-slate-400',
		nodeFill: '#0d0d0f',
		nodeSelectedFill: '#171721',
		primaryLabelFill: '#e5e7eb',
		selectedLabelFill: '#ffffff',
		labelHaloStroke: 'rgba(10, 10, 12, 0.94)',
		labelHaloWidth: 3.2,
		primaryFontWeight: 500,
		selectedFontWeight: 600,
		subtitleFontWeight: 500,
		edgeFontWeight: 500,
		primaryFontSizeBoost: 0,
		defaultEdgeStroke: 'rgba(255, 255, 255, 0.2)',
		crosshairStroke: 'rgba(255, 255, 255, 0.07)',
		subtitleDefaultFill: '#94a3b8',
		subtitleEmeraldFill: '#6ee7b7',
		subtitleVioletFill: '#c4b5fd',
		edgePillFill: 'rgba(13, 13, 16, 0.88)',
		edgePillStroke: 'rgba(255, 255, 255, 0.14)',
		nodePalette: {
			emerald: { stroke: '#34d399', text: '#6ee7b7', badgeText: '#6ee7b7' },
			violet: { stroke: '#8b5cf6', text: '#c4b5fd', badgeText: '#c4b5fd' },
			amber: { stroke: '#fbbf24', text: '#fcd34d', badgeText: '#fcd34d' },
			rose: { stroke: '#f43f5e', text: '#fda4af', badgeText: '#fda4af' },
		},
	},
};

interface WorkflowMindMapProps {
	instances: WorkflowInstance[];
	topology: WorkflowTopology;
	superprompt: string;
	onChangeSuperprompt: (next: string) => void;
	onChangeTopology: (next: WorkflowTopology) => void;
	onUpdateInstance: (
		id: number,
		updater: (prev: WorkflowInstance) => WorkflowInstance,
	) => void;
	onRunAllWorkflow: () => void;
	onRunSingleInstance: (id: number) => void;
	isGlobalRunning: boolean;
	activeGlobalLeaseId: string | null;
	lastPurgeReceipt: {
		leaseId: string;
		purgedAt: string;
		totalDurationMs: number;
		redactionsApplied: number;
	} | null;
	compactMode?: boolean;
	onExpandFullStage?: () => void;
	environmentTheme?: EnvironmentTheme;
	onOpenExportCenter?: () => void;
	onDownloadWorkflowBundleZip?: () => void;
}

interface DragState {
	kind: 'viewport' | 'node';
	nodeId?: string;
	startX: number;
	startY: number;
	originX: number;
	originY: number;
	moved: boolean;
}

export default function WorkflowMindMap({
	instances,
	topology,
	superprompt,
	onChangeSuperprompt,
	onChangeTopology,
	onUpdateInstance,
	onRunAllWorkflow,
	onRunSingleInstance,
	isGlobalRunning,
	activeGlobalLeaseId,
	lastPurgeReceipt,
	compactMode = false,
	onExpandFullStage,
	environmentTheme = 'earthy',
	onOpenExportCenter,
	onDownloadWorkflowBundleZip,
}: WorkflowMindMapProps) {
	const themeCfg =
		MIND_MAP_THEMES[environmentTheme] || MIND_MAP_THEMES.earthy;
	const [graph, setGraph] = useState<GraphState>(() =>
		syncWorkflowToMindMapGraph(
			null,
			instances,
			topology,
			superprompt,
			isGlobalRunning,
			activeGlobalLeaseId,
			lastPurgeReceipt,
			true,
		),
	);

	// Companion Gate state from mind-work-done (session memory only)
	const [companion, setCompanion] = useState<CompanionType>('robot');
	const [ownerApproved, setOwnerApproved] = useState<boolean>(false);

	// Filter & Search state
	const [colorFilter, setColorFilter] = useState<'all' | NodeColorType>('all');
	const [searchQuery, setSearchQuery] = useState<string>('');

	// Verbatim Execution & Mind-Map Log
	const [mindLog, setMindLog] = useState<MindAuditLogItem[]>(() => [
		{
			id: 'init-1',
			time: new Date().toISOString().slice(11, 19),
			message: `mind-work-done stage synchronized (${topology} topology)`,
		},
	]);
	const [copiedLog, setCopiedLog] = useState(false);

	// Modals for Blueprint & Intake importers
	const [activeModal, setActiveModal] = useState<'intake' | 'blueprint' | null>(
		null,
	);
	const [intakeText, setIntakeText] = useState<string>(
		`Urgent: Verify PCI-DSS card PAN masking before downstream handoff\nMilestone: Complete 4-agent directional step pipeline\nBrainstorm: Add sequential latency verification step`,
	);
	const [blueprintText, setBlueprintText] = useState<string>(
		MIND_BLUEPRINT_PRESETS[0].content,
	);
	const [pendingDeleteNodeId, setPendingDeleteNodeId] = useState<string | null>(
		null,
	);

	// Viewport pan & zoom state
	const viewportRef = useRef<HTMLDivElement | null>(null);
	const [viewportSize, setViewportSize] = useState<{
		width: number;
		height: number;
	}>({
		width: 960,
		height: compactMode ? 340 : 620,
	});
	const [view, setView] = useState<{ tx: number; ty: number; scale: number }>({
		tx: 480,
		ty: compactMode ? 170 : 310,
		scale: compactMode ? 0.68 : 0.85,
	});
	const [dragState, setDragState] = useState<DragState | null>(null);

	const appendMindLog = (message: string) => {
		const time = new Date().toISOString().slice(11, 19);
		setMindLog((prev) => [
			{
				id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
				time,
				message,
			},
			...prev.slice(0, 79),
		]);
	};

	// Track previous topology so changing topology re-solves node coordinates cleanly
	const prevTopologyRef = useRef<WorkflowTopology>(topology);
	const prevStatusSignatureRef = useRef<string>('');

	useEffect(() => {
		const topologyChanged = prevTopologyRef.current !== topology;
		prevTopologyRef.current = topology;

		setGraph((prev) =>
			syncWorkflowToMindMapGraph(
				prev,
				instances,
				topology,
				superprompt,
				isGlobalRunning,
				activeGlobalLeaseId,
				lastPurgeReceipt,
				topologyChanged,
			),
		);

		// Log live execution transitions into the Mind-Map Verbatim Log
		const sig = instances
			.map(
				(i) =>
					`${i.id}:${i.status}:${i.activeStepIndex || 0}:${
						i.steps.filter((s) => s.status === 'completed').length
					}`,
			)
			.join('|');

		if (sig !== prevStatusSignatureRef.current) {
			prevStatusSignatureRef.current = sig;
			instances.forEach((inst) => {
				const runningStep = inst.steps.find((s) => s.status === 'running');
				if (inst.status === 'running' && runningStep) {
					appendMindLog(
						`Agent 0${inst.id} executing ${runningStep.title} (${inst.model})`,
					);
				}
			});
		}
	}, [
		instances,
		topology,
		superprompt,
		isGlobalRunning,
		activeGlobalLeaseId,
		lastPurgeReceipt,
	]);

	// Auto-focus active executing step or agent node when workflow runs
	useEffect(() => {
		if (!isGlobalRunning) return;
		for (const inst of instances) {
			if (inst.status === 'running') {
				const activeStep = inst.steps.find((s) => s.status === 'running');
				const targetNodeId = activeStep
					? `step-${inst.id}-${activeStep.stepNumber}`
					: `agent-${inst.id}`;
				setGraph((prev) => ({
					...prev,
					pointerId: targetNodeId,
					nodes: prev.nodes.map((n) => ({
						...n,
						selected: n.id === targetNodeId,
					})),
				}));
				break;
			}
		}
	}, [instances, isGlobalRunning]);

	// Measure viewport and center origin (0,0)
	useEffect(() => {
		const el = viewportRef.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		if (rect.width > 0 && rect.height > 0) {
			setViewportSize({ width: rect.width, height: rect.height });
			setView((prev) => ({
				...prev,
				tx: Math.round(rect.width / 2),
				ty: Math.round(rect.height / 2),
			}));
		}
		const observer = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const { width, height } = entry.contentRect;
				if (width > 0 && height > 0) {
					setViewportSize({ width, height });
				}
			}
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, [compactMode]);

	const selectedNode = useMemo(
		() => graph.nodes.find((n) => n.id === graph.pointerId) || graph.nodes[0] || null,
		[graph.nodes, graph.pointerId],
	);

	const matchingNodeIds = useMemo(() => {
		const q = searchQuery.trim().toLowerCase();
		return new Set(
			graph.nodes
				.filter((n) => {
					const matchesColor = colorFilter === 'all' || n.type === colorFilter;
					const matchesQuery =
						!q ||
						n.label.toLowerCase().includes(q) ||
						n.payload.notes.toLowerCase().includes(q) ||
						n.payload.role.toLowerCase().includes(q);
					return matchesColor && matchesQuery;
				})
				.map((n) => n.id),
		);
	}, [graph.nodes, colorFilter, searchQuery]);

	const counts = useMemo(() => {
		let emerald = 0;
		let violet = 0;
		let amber = 0;
		let rose = 0;
		for (const n of graph.nodes) {
			if (n.type === 'emerald') emerald++;
			else if (n.type === 'violet') violet++;
			else if (n.type === 'rose') rose++;
			else amber++;
		}
		return { emerald, violet, amber, rose };
	}, [graph.nodes]);

	const handleSelectNode = (nodeId: string | null) => {
		setPendingDeleteNodeId(null);
		setGraph((prev) => ({
			...prev,
			pointerId: nodeId,
			nodes: prev.nodes.map((n) => ({
				...n,
				selected: n.id === nodeId,
			})),
		}));
	};

	// Shift+Click: Toggle link between selected node and target node (and coordinate agent handoff if both are agents)
	const handleToggleLink = (targetNode: MindNode) => {
		const sourceId = graph.pointerId;
		if (!sourceId || sourceId === targetNode.id) {
			handleSelectNode(targetNode.id);
			return;
		}
		const sourceNode = graph.nodes.find((n) => n.id === sourceId);

		// If linking two Agent nodes, update downstream agent's upstreamSourceIds
		if (
			sourceNode?.payload.role === 'agent' &&
			targetNode.payload.role === 'agent' &&
			sourceNode.payload.instanceId &&
			targetNode.payload.instanceId
		) {
			const fromInstId = sourceNode.payload.instanceId;
			const toInstId = targetNode.payload.instanceId;
			onUpdateInstance(toInstId, (prev) => {
				const exists = prev.upstreamSourceIds.includes(fromInstId);
				const nextUpstream = exists
					? prev.upstreamSourceIds.filter((id) => id !== fromInstId)
					: [...prev.upstreamSourceIds, fromInstId];
				return {
					...prev,
					upstreamSourceIds: nextUpstream,
				};
			});
			appendMindLog(
				`coordinated handoff wire Agent 0${fromInstId} -> Agent 0${toInstId}`,
			);
		}

		setGraph((prev) => {
			const existing = prev.links.find(
				(l) =>
					(l.from === sourceId && l.to === targetNode.id) ||
					(l.from === targetNode.id && l.to === sourceId),
			);
			if (existing) {
				appendMindLog(`unlinked ${sourceId} <-> ${targetNode.id}`);
				return {
					...prev,
					links: prev.links.filter((l) => l.id !== existing.id),
				};
			}
			const newLink = {
				id: `link-${sourceId}-${targetNode.id}-${Date.now()}`,
				from: sourceId,
				to: targetNode.id,
				label: 'handoff',
			};
			appendMindLog(`linked ${sourceId} -> ${targetNode.id}`);
			return {
				...prev,
				links: [...prev.links, newLink],
			};
		});
	};

	const handleViewportPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		if (e.button !== 0) return;
		setDragState({
			kind: 'viewport',
			startX: e.clientX,
			startY: e.clientY,
			originX: view.tx,
			originY: view.ty,
			moved: false,
		});
	};

	const handleNodePointerDown = (
		e: React.PointerEvent<SVGGElement>,
		node: MindNode,
	) => {
		e.stopPropagation();
		if (e.button !== 0) return;
		if (e.shiftKey) {
			handleToggleLink(node);
			return;
		}
		setDragState({
			kind: 'node',
			nodeId: node.id,
			startX: e.clientX,
			startY: e.clientY,
			originX: node.x,
			originY: node.y,
			moved: false,
		});
	};

	useEffect(() => {
		if (!dragState) return;

		const handlePointerMove = (e: PointerEvent) => {
			const dx = e.clientX - dragState.startX;
			const dy = e.clientY - dragState.startY;
			const moved = dragState.moved || Math.hypot(dx, dy) > 3;

			if (dragState.kind === 'viewport') {
				setView((prev) => ({
					...prev,
					tx: dragState.originX + dx,
					ty: dragState.originY + dy,
				}));
				if (moved !== dragState.moved) {
					setDragState((prev) => (prev ? { ...prev, moved: true } : null));
				}
			} else if (dragState.kind === 'node' && dragState.nodeId) {
				const scaledDx = dx / view.scale;
				const scaledDy = dy / view.scale;
				setGraph((prev) => ({
					...prev,
					nodes: prev.nodes.map((n) =>
						n.id === dragState.nodeId
							? {
									...n,
									x: Math.round(dragState.originX + scaledDx),
									y: Math.round(dragState.originY + scaledDy),
							  }
							: n,
					),
				}));
				if (moved !== dragState.moved) {
					setDragState((prev) => (prev ? { ...prev, moved: true } : null));
				}
			}
		};

		const handlePointerUp = () => {
			if (dragState.kind === 'node' && dragState.nodeId) {
				if (!dragState.moved) {
					handleSelectNode(dragState.nodeId);
				} else {
					const movedNode = graph.nodes.find((n) => n.id === dragState.nodeId);
					if (movedNode) {
						appendMindLog(
							`moved "${movedNode.label.slice(0, 22)}" to (${movedNode.x}, ${
								movedNode.y
							})`,
						);
					}
				}
			} else if (dragState.kind === 'viewport' && !dragState.moved) {
				handleSelectNode(null);
			}
			setDragState(null);
		};

		window.addEventListener('pointermove', handlePointerMove);
		window.addEventListener('pointerup', handlePointerUp);
		return () => {
			window.removeEventListener('pointermove', handlePointerMove);
			window.removeEventListener('pointerup', handlePointerUp);
		};
	}, [dragState, view.scale, graph.nodes]);

	// Spawn a new node on double-click; if anchored to an Agent node, also add it as an execution step!
	const createNewNodeAt = (x: number, y: number, parentId?: string) => {
		const anchorNode = graph.nodes.find((n) => n.id === parentId);
		const now = new Date().toISOString();

		if (
			anchorNode &&
			(anchorNode.payload.role === 'agent' || anchorNode.payload.role === 'step') &&
			anchorNode.payload.instanceId
		) {
			const targetInstanceId = anchorNode.payload.instanceId;
			const targetInst = instances.find((i) => i.id === targetInstanceId);
			if (targetInst) {
				const nextStepNum = targetInst.steps.length + 1;
				const newStepTitle = `0${nextStepNum}. Custom Mind-Map Step`;
				const newStepInstruction =
					'Execute custom verification and synthesize output for downstream handoff.';

				onUpdateInstance(targetInstanceId, (prev) => ({
					...prev,
					steps: [
						...prev.steps,
						{
							id: `step-${targetInstanceId}-${Date.now()}`,
							stepNumber: prev.steps.length + 1,
							title: newStepTitle,
							instruction: newStepInstruction,
							status: 'idle',
						},
					],
				}));
				appendMindLog(
					`added execution step #${nextStepNum} to Agent 0${targetInstanceId} via Mind-Map`,
				);
				return;
			}
		}

		const id = `node-${Date.now().toString(36)}`;
		const newNode: MindNode = {
			id,
			type: 'violet',
			label: `Workflow Node #${graph.nodes.length + 1}`,
			x,
			y,
			selected: true,
			payload: {
				role: 'brainstorm',
				notes: 'Spawned directly on the Mind-Work-Done coordination stage.',
				source: 'manual',
				priority: 'normal',
				createdAt: now,
			},
		};
		setGraph((prev) => ({
			nodes: [...prev.nodes.map((n) => ({ ...n, selected: false })), newNode],
			links: parentId
				? [
						...prev.links,
						{
							id: `link-${parentId}-${id}`,
							from: parentId,
							to: id,
							label: 'branch',
						},
				  ]
				: prev.links,
			pointerId: id,
		}));
		appendMindLog(`spawned node "${newNode.label}" at (${x}, ${y})`);
	};

	const handleViewportDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
		const rect = viewportRef.current?.getBoundingClientRect();
		if (!rect) return;
		const clickX = e.clientX - rect.left;
		const clickY = e.clientY - rect.top;
		const worldX = Math.round((clickX - view.tx) / view.scale);
		const worldY = Math.round((clickY - view.ty) / view.scale);
		createNewNodeAt(worldX, worldY, selectedNode?.id || 'wf-core');
	};

	const handleViewportWheel = (e: React.WheelEvent<HTMLDivElement>) => {
		const rect = viewportRef.current?.getBoundingClientRect();
		if (!rect) return;
		if (e.ctrlKey || e.metaKey || !e.shiftKey) {
			e.preventDefault();
			const factor = e.deltaY < 0 ? 1.09 : 1 / 1.09;
			const nextScale = Math.min(2.4, Math.max(0.32, view.scale * factor));
			const ratio = nextScale / view.scale;
			const cursorX = e.clientX - rect.left;
			const cursorY = e.clientY - rect.top;
			setView((prev) => ({
				scale: nextScale,
				tx: cursorX - (cursorX - prev.tx) * ratio,
				ty: cursorY - (cursorY - prev.ty) * ratio,
			}));
		}
	};

	const zoomBy = (factor: number) => {
		const cx = viewportSize.width / 2;
		const cy = viewportSize.height / 2;
		const nextScale = Math.min(2.4, Math.max(0.32, view.scale * factor));
		const ratio = nextScale / view.scale;
		setView((prev) => ({
			scale: nextScale,
			tx: cx - (cx - prev.tx) * ratio,
			ty: cy - (cy - prev.ty) * ratio,
		}));
	};

	const centerStage = () => {
		setView({
			tx: Math.round(viewportSize.width / 2),
			ty: Math.round(viewportSize.height / 2),
			scale: compactMode ? 0.68 : 0.85,
		});
		appendMindLog('centered mind-map stage on (0, 0)');
	};

	// Snap nodes to active topology coordinates
	const handleSnapTopologyLayout = () => {
		const coords = computeTopologyCoordinates(topology);
		setGraph((prev) => ({
			...prev,
			nodes: prev.nodes.map((n) =>
				coords[n.id] ? { ...n, x: coords[n.id].x, y: coords[n.id].y } : n,
			),
		}));
		centerStage();
		appendMindLog(`aligned nodes to ${topology} workflow layout`);
	};

	// Radial mind-map layout from mind-work-done
	const handleRadialLayout = () => {
		setGraph((prev) => {
			if (prev.nodes.length === 0) return prev;
			const [core, ...rest] = prev.nodes;
			const updated: MindNode[] = [{ ...core, x: 0, y: 0 }];
			rest.forEach((node, idx) => {
				const isAgent = node.payload.role === 'agent';
				const ringRadius = isAgent ? 175 : 315;
				const angle = -Math.PI / 2 + (idx * (Math.PI * 2)) / Math.max(rest.length, 1);
				updated.push({
					...node,
					x: Math.round(Math.cos(angle) * ringRadius),
					y: Math.round(Math.sin(angle) * ringRadius),
				});
			});
			return { ...prev, nodes: updated };
		});
		centerStage();
		appendMindLog('arranged workflow nodes into radial mind-map rings');
	};

	// Update selected node and sync changes back to Agent / Step / Objective state
	const updateSelectedNode = (
		patch: Partial<Pick<MindNode, 'label' | 'type'>> & {
			role?: NodeSemanticRole;
			notes?: string;
		},
	) => {
		if (!selectedNode) return;

		// Sync back to workflow state if it's a core, agent, or step node
		if (selectedNode.id === 'wf-core' && patch.notes !== undefined) {
			onChangeSuperprompt(patch.notes);
		} else if (
			selectedNode.payload.role === 'agent' &&
			selectedNode.payload.instanceId
		) {
			const instId = selectedNode.payload.instanceId;
			if (patch.notes !== undefined) {
				const cleanedPrompt = patch.notes.replace(/^System Prompt:\s*/i, '');
				onUpdateInstance(instId, (prev) => ({
					...prev,
					customSystemPrompt: cleanedPrompt,
				}));
			}
		} else if (
			selectedNode.payload.role === 'step' &&
			selectedNode.payload.instanceId &&
			selectedNode.payload.stepId
		) {
			const instId = selectedNode.payload.instanceId;
			const stepId = selectedNode.payload.stepId;
			onUpdateInstance(instId, (prev) => ({
				...prev,
				steps: prev.steps.map((s) =>
					s.id === stepId
						? {
								...s,
								title: patch.label !== undefined ? patch.label : s.title,
								instruction:
									patch.notes !== undefined ? patch.notes : s.instruction,
						  }
						: s,
				),
			}));
		}

		setGraph((prev) => ({
			...prev,
			nodes: prev.nodes.map((n) => {
				if (n.id !== selectedNode.id) return n;
				return {
					...n,
					label: patch.label !== undefined ? patch.label : n.label,
					type: patch.type !== undefined ? patch.type : n.type,
					payload: {
						...n.payload,
						role: patch.role !== undefined ? patch.role : n.payload.role,
						notes: patch.notes !== undefined ? patch.notes : n.payload.notes,
					},
				};
			}),
		}));
	};

	// Companion Gate approval toggle
	const handleSelectCompanion = (next: CompanionType) => {
		setCompanion(next);
		appendMindLog(`companion set to ${next}`);
	};

	const handleToggleApproval = (next?: boolean) => {
		const target = typeof next === 'boolean' ? next : !ownerApproved;
		setOwnerApproved(target);
		if (target) setPendingDeleteNodeId(null);
		appendMindLog(
			target
				? `companion (${companion}) unlocked owner edit authorization`
				: `companion (${companion}) locked edit authorization gate`,
		);
	};

	// Delete node (guarded by Companion Gate)
	const handleRequestDeleteNode = (nodeId: string) => {
		if (nodeId === 'wf-core' || nodeId.startsWith('agent-')) {
			appendMindLog('core hub and primary agent nodes are protected');
			return;
		}
		if (!ownerApproved) {
			setPendingDeleteNodeId(nodeId);
			appendMindLog(
				`deletion of ${nodeId} paused — awaiting ${COMPANION_META[companion].name} approval`,
			);
			return;
		}
		executeDeleteNode(nodeId);
	};

	const executeDeleteNode = (nodeId: string) => {
		const target = graph.nodes.find((n) => n.id === nodeId);
		if (
			target?.payload.role === 'step' &&
			target.payload.instanceId &&
			target.payload.stepId
		) {
			const instId = target.payload.instanceId;
			const stepId = target.payload.stepId;
			onUpdateInstance(instId, (prev) => {
				if (prev.steps.length <= 1) return prev;
				const filtered = prev.steps
					.filter((s) => s.id !== stepId)
					.map((s, idx) => ({ ...s, stepNumber: idx + 1 }));
				return { ...prev, steps: filtered };
			});
		}

		setGraph((prev) => {
			const remaining = prev.nodes.filter((n) => n.id !== nodeId);
			const nextPointer = remaining[0]?.id || null;
			return {
				nodes: remaining.map((n) => ({
					...n,
					selected: n.id === nextPointer,
				})),
				links: prev.links.filter((l) => l.from !== nodeId && l.to !== nodeId),
				pointerId: nextPointer,
			};
		});
		setPendingDeleteNodeId(null);
		appendMindLog(`deleted node "${target?.label || nodeId}"`);
	};

	// Parse Intake or Blueprint into Mind-Map nodes
	const handleRunIntake = (e: React.FormEvent) => {
		e.preventDefault();
		const anchor = selectedNode || graph.nodes[0];
		if (!anchor || !intakeText.trim()) return;
		const { newNodes, newLinks } = parseRawIntakeToNodes(intakeText, anchor);
		if (newNodes.length === 0) return;

		setGraph((prev) => ({
			nodes: [...prev.nodes, ...newNodes],
			links: [...prev.links, ...newLinks],
			pointerId: newNodes[0].id,
		}));
		appendMindLog(
			`intake parser added ${newNodes.length} nodes to "${anchor.label}"`,
		);
		setActiveModal(null);
	};

	const handleRunBlueprint = (e: React.FormEvent) => {
		e.preventDefault();
		const anchor = selectedNode || graph.nodes[0];
		if (!anchor || !blueprintText.trim()) return;
		const { newNodes, newLinks } = parseBlueprintToNodes(blueprintText, anchor);
		if (newNodes.length === 0) return;

		setGraph((prev) => ({
			nodes: [...prev.nodes, ...newNodes],
			links: [...prev.links, ...newLinks],
			pointerId: newNodes[0].id,
		}));
		appendMindLog(
			`blueprint parser mapped ${newNodes.length} workflow nodes onto stage`,
		);
		setActiveModal(null);
	};

	const handleExportJSON = () => {
		const blob = new Blob([JSON.stringify(graph, null, 2)], {
			type: 'application/json',
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `mind-work-done-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		URL.revokeObjectURL(url);
		appendMindLog(`exported ${graph.nodes.length} nodes to JSON`);
	};

	const handleCopyLog = () => {
		const text = mindLog.map((item) => `[${item.time}] ${item.message}`).join('\n');
		navigator.clipboard.writeText(text);
		setCopiedLog(true);
		setTimeout(() => setCopiedLog(false), 1800);
	};

	const companionInfo = COMPANION_META[companion];

	// Determine if selected node belongs to a specific agent instance
	const selectedAgentInstance = useMemo(() => {
		if (!selectedNode?.payload.instanceId) return null;
		return (
			instances.find((i) => i.id === selectedNode.payload.instanceId) || null
		);
	}, [selectedNode, instances]);

	return (
		<div
			className={`atrium-grid-bg flex flex-col w-full h-full rounded-xl border overflow-hidden select-none ${
				themeCfg.rootClass
			} ${compactMode ? 'min-h-[340px]' : 'min-h-0 flex-1'}`}
		>
			{/* Mind-Work-Done Coordination Header Bar */}
			<div
				className={`flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b shrink-0 text-xs ${themeCfg.headerClass}`}
			>
				<div className="flex items-center gap-2.5 flex-wrap">
					<span className={`tracking-tight ${themeCfg.titleTextClass}`}>
						Mind-Work-Done · Live Execution Mind-Map
					</span>
					<span aria-hidden="true" className={themeCfg.mutedTextClass}>
						·
					</span>
					<span
						className="font-mono tabular-nums"
						style={{
							color: themeCfg.nodePalette.emerald.badgeText,
							fontWeight: themeCfg.isLightTheme ? 700 : 500,
						}}
					>
						{graph.nodes.length} nodes · {graph.links.length} links
					</span>
					<span aria-hidden="true" className={themeCfg.mutedTextClass}>
						·
					</span>
					<span
						className={`text-[11px] font-mono ${themeCfg.mutedTextClass}`}
						title="Mind-Map typography automatically scales weight and halo contrast for your selected environment theme"
					>
						{themeCfg.isLightTheme
							? `Typography: Bold High-Contrast (${environmentTheme.toUpperCase()})`
							: `Typography: Luminous Balanced (${environmentTheme.toUpperCase()})`}
					</span>
					{isGlobalRunning && (
						<>
							<span aria-hidden="true" className={themeCfg.mutedTextClass}>
								·
							</span>
							<span
								className="font-semibold flex items-center gap-1.5"
								style={{ color: themeCfg.nodePalette.violet.badgeText }}
							>
								<ReloadIcon className="w-3 h-3 animate-spin" />
								<span>Coordinating Live Agent Execution...</span>
							</span>
						</>
					)}
				</div>

				{/* Stage Coordination Actions */}
				<div className="flex items-center gap-2 flex-wrap">
					{/* Directional Sequence Mode Indicator */}
					<div
						className={`flex items-center gap-1 p-0.5 border rounded-lg ${themeCfg.cardClass}`}
					>
						<button
							type="button"
							onClick={() => onChangeTopology('directional')}
							disabled={isGlobalRunning}
							className="px-2 py-1 rounded text-[11px] transition-colors cursor-pointer bg-emerald-500/20 border border-emerald-500/40 font-bold"
							style={{ color: themeCfg.nodePalette.emerald.badgeText }}
						>
							Directional (01→02→03→04)
						</button>
					</div>

					<button
						type="button"
						onClick={() => setActiveModal('intake')}
						className={`px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${themeCfg.cardClass} ${themeCfg.bodyTextClass}`}
					>
						Intake
					</button>
					<button
						type="button"
						onClick={() => setActiveModal('blueprint')}
						className={`px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${themeCfg.cardClass} ${themeCfg.bodyTextClass}`}
					>
						Blueprints
					</button>
					<button
						type="button"
						onClick={handleExportJSON}
						className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${themeCfg.cardClass} ${themeCfg.bodyTextClass}`}
						title="Download Mind-Work-Done graph JSON"
					>
						<DownloadIcon className="w-3 h-3" />
						<span>Graph JSON</span>
					</button>

					{onDownloadWorkflowBundleZip && (
						<button
							type="button"
							onClick={onDownloadWorkflowBundleZip}
							className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${themeCfg.cardClass} ${themeCfg.bodyTextClass}`}
							title="Download complete workflow folder (.zip) with logs, agent transcripts, and deliverables"
						>
							<DownloadIcon className="w-3 h-3" />
							<span>Workflow Folder (.zip)</span>
						</button>
					)}

					{onOpenExportCenter && (
						<button
							type="button"
							onClick={onOpenExportCenter}
							className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${themeCfg.cardClass} ${themeCfg.bodyTextClass}`}
							title="Open Export Results Log & Downloadable Workflow Files Studio"
						>
							<FileTextIcon className="w-3 h-3" />
							<span>Results Log & Files</span>
						</button>
					)}

					{compactMode && onExpandFullStage && (
						<button
							type="button"
							onClick={onExpandFullStage}
							className="px-2.5 py-1 rounded-lg bg-indigo-600/20 border border-indigo-500/40 font-semibold transition-colors cursor-pointer"
							style={{ color: themeCfg.nodePalette.violet.badgeText }}
						>
							Open Full Mind-Map Studio
						</button>
					)}

					<button
						type="button"
						onClick={onRunAllWorkflow}
						disabled={isGlobalRunning || !superprompt.trim()}
						className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold transition-colors cursor-pointer"
					>
						{isGlobalRunning ? (
							<>
								<ReloadIcon className="w-3 h-3 animate-spin" />
								<span>Executing...</span>
							</>
						) : (
							<>
								<PlayIcon className="w-3 h-3" />
								<span>Execute Mind-Map Workflow</span>
							</>
						)}
					</button>
				</div>
			</div>

			{/* Main 3-Column Mind-Work-Done Workspace */}
			<div className="flex flex-1 min-h-0 overflow-hidden">
				{/* LEFT RAIL: Live Graph Filter + Companion Gate + Verbatim Log (Shown in Full Mode) */}
				{!compactMode && (
					<aside
						className={`w-64 shrink-0 border-r p-3.5 flex flex-col gap-3.5 overflow-y-auto ${themeCfg.railClass}`}
					>
						{/* Live Graph Status & Ring Filter */}
						<section
							className={`rounded-xl border p-3 ${themeCfg.cardClass}`}
						>
							<div className="flex items-center justify-between">
								<h3 className={`text-xs ${themeCfg.titleTextClass}`}>
									Stage Node Filter
								</h3>
								<span
									className={`font-mono text-[11px] tabular-nums ${themeCfg.mutedTextClass}`}
								>
									{matchingNodeIds.size}/{graph.nodes.length} visible
								</span>
							</div>

							<div className="relative mt-2.5">
								<MagnifyingGlassIcon
									className={`w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${themeCfg.mutedTextClass}`}
								/>
								<input
									type="text"
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
									placeholder="Filter agents or steps..."
									className={`w-full rounded-lg border pl-8 pr-6 py-1.5 text-xs focus:border-emerald-500/50 focus:outline-none ${themeCfg.inputClass}`}
								/>
								{searchQuery && (
									<button
										type="button"
										onClick={() => setSearchQuery('')}
										className={`absolute right-2 top-1/2 -translate-y-1/2 ${themeCfg.mutedTextClass}`}
									>
										<Cross2Icon className="w-3 h-3" />
									</button>
								)}
							</div>

							<div className="mt-2.5 grid grid-cols-2 gap-1.5">
								<button
									type="button"
									onClick={() => setColorFilter('all')}
									className={`rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors cursor-pointer border ${
										colorFilter === 'all'
											? `border-indigo-500/50 bg-indigo-500/15 ${themeCfg.titleTextClass}`
											: `border-transparent ${themeCfg.mutedTextClass}`
									}`}
								>
									All ({graph.nodes.length})
								</button>
								<button
									type="button"
									onClick={() =>
										setColorFilter(
											colorFilter === 'emerald' ? 'all' : 'emerald',
										)
									}
									className={`rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors cursor-pointer border ${
										colorFilter === 'emerald'
											? 'bg-emerald-500/20 border-emerald-500/50 font-bold'
											: 'bg-emerald-500/10 border-transparent'
									}`}
									style={{ color: themeCfg.nodePalette.emerald.badgeText }}
								>
									Emerald · {counts.emerald}
								</button>
								<button
									type="button"
									onClick={() =>
										setColorFilter(colorFilter === 'violet' ? 'all' : 'violet')
									}
									className={`rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors cursor-pointer border ${
										colorFilter === 'violet'
											? 'bg-violet-500/20 border-violet-500/50 font-bold'
											: 'bg-violet-500/10 border-transparent'
									}`}
									style={{ color: themeCfg.nodePalette.violet.badgeText }}
								>
									Violet · {counts.violet}
								</button>
								<button
									type="button"
									onClick={() =>
										setColorFilter(colorFilter === 'amber' ? 'all' : 'amber')
									}
									className={`rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors cursor-pointer border ${
										colorFilter === 'amber'
											? 'bg-amber-500/20 border-amber-500/50 font-bold'
											: 'bg-amber-500/10 border-transparent'
									}`}
									style={{ color: themeCfg.nodePalette.amber.badgeText }}
								>
									Amber · {counts.amber}
								</button>
							</div>
						</section>

						{/* Companion Safety Gate from mind-work-done */}
						<section
							className={`rounded-xl border p-3 ${themeCfg.cardClass}`}
						>
							<div className="flex items-center justify-between">
								<h3 className={`text-xs ${themeCfg.titleTextClass}`}>
									Companion Gate
								</h3>
								<span className={`text-[11px] ${themeCfg.mutedTextClass}`}>
									{companionInfo.name.split(' ')[0]}
								</span>
							</div>
							<p className={`mt-1 text-[11px] ${themeCfg.mutedTextClass}`}>
								Confirms destructive workflow graph edits.
							</p>

							<div className="mt-2.5 grid grid-cols-3 gap-1">
								{(['robot', 'stuffed-animal', 'grandma'] as CompanionType[]).map(
									(item) => {
										const active = companion === item;
										const label =
											item === 'robot'
												? 'Robot'
												: item === 'stuffed-animal'
												? 'Bear'
												: 'Grandma';
										return (
											<button
												key={item}
												type="button"
												onClick={() => handleSelectCompanion(item)}
												className={`rounded-lg border px-2 py-1 text-[11px] transition-colors cursor-pointer ${
													active
														? 'border-emerald-500/50 bg-emerald-500/15 font-bold'
														: `border-slate-500/20 ${themeCfg.bodyTextClass}`
												}`}
												style={
													active
														? { color: themeCfg.nodePalette.emerald.badgeText }
														: undefined
												}
											>
												{label}
											</button>
										);
									},
								)}
							</div>

							<div className="mt-2.5 pt-2.5 border-t border-slate-500/20">
								<div className="flex items-center justify-between text-xs">
									<span className={`text-[11px] ${themeCfg.mutedTextClass}`}>
										Edit Authorization
									</span>
									<button
										type="button"
										onClick={() => handleToggleApproval()}
										className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors cursor-pointer ${
											ownerApproved
												? 'bg-emerald-500/15 border border-emerald-500/40'
												: 'bg-amber-500/15 border border-amber-500/40'
										}`}
										style={{
											color: ownerApproved
												? themeCfg.nodePalette.emerald.badgeText
												: themeCfg.nodePalette.amber.badgeText,
										}}
									>
										{ownerApproved ? (
											<>
												<CheckCircledIcon className="w-3 h-3" />
												<span>Approved</span>
											</>
										) : (
											<>
												<LockClosedIcon className="w-3 h-3" />
												<span>Locked</span>
											</>
										)}
									</button>
								</div>
								<p
									className={`mt-1.5 text-[11px] leading-relaxed ${themeCfg.mutedTextClass}`}
								>
									{ownerApproved
										? companionInfo.approvedLine
										: companionInfo.deniedLine}
								</p>
							</div>
						</section>

						{/* Verbatim Execution & Graph Log */}
						<section
							className={`flex-1 flex flex-col rounded-xl border p-3 min-h-[160px] ${themeCfg.cardClass}`}
						>
							<div className="flex items-center justify-between">
								<h3 className={`text-xs ${themeCfg.titleTextClass}`}>
									Verbatim Execution Log
								</h3>
								<div
									className={`flex items-center gap-2 text-[11px] ${themeCfg.mutedTextClass}`}
								>
									<button
										type="button"
										onClick={handleCopyLog}
										className="hover:underline cursor-pointer"
									>
										{copiedLog ? 'Copied' : 'Copy'}
									</button>
									<span>·</span>
									<button
										type="button"
										onClick={() =>
											setMindLog([
												{
													id: String(Date.now()),
													time: new Date().toISOString().slice(11, 19),
													message: 'verbatim log cleared',
												},
											])
										}
										className="hover:underline cursor-pointer"
									>
										Clear
									</button>
								</div>
							</div>
							<ul
								className={`mt-2 flex-1 space-y-1.5 overflow-y-auto font-mono text-[10px] leading-snug tabular-nums pr-1 ${themeCfg.bodyTextClass}`}
							>
								{mindLog.map((entry) => (
									<li key={entry.id} className="break-words">
										<span className={themeCfg.mutedTextClass}>
											[{entry.time}]
										</span>{' '}
										<span>{entry.message}</span>
									</li>
								))}
							</ul>
						</section>
					</aside>
				)}

				{/* CENTER: Interactive SVG Mind-Map Stage */}
				<section className="relative flex-1 flex flex-col min-w-0 min-h-0">
					<div
						ref={viewportRef}
						onPointerDown={handleViewportPointerDown}
						onDoubleClick={handleViewportDoubleClick}
						onWheel={handleViewportWheel}
						className="relative flex-1 w-full h-full overflow-hidden"
						style={{
							cursor: dragState?.kind === 'viewport' ? 'grabbing' : 'grab',
						}}
					>
						{/* Floating Stage Controls (Top-Left) */}
						<div
							onPointerDown={(e) => e.stopPropagation()}
							onDoubleClick={(e) => e.stopPropagation()}
							className={`absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-xl border p-1.5 backdrop-blur-md text-xs ${themeCfg.floatingToolbarClass}`}
						>
							<button
								type="button"
								onClick={() =>
									createNewNodeAt(
										Math.round((Math.random() - 0.5) * 180),
										Math.round((Math.random() - 0.5) * 140),
										selectedNode?.id || 'wf-core',
									)
								}
								className="flex items-center gap-1 rounded-lg bg-emerald-500/15 border border-emerald-500/40 px-2.5 py-1 text-xs font-semibold hover:bg-emerald-500/25 transition-colors cursor-pointer"
								style={{ color: themeCfg.nodePalette.emerald.badgeText }}
								title="Add custom thought node or new agent execution step"
							>
								<PlusIcon className="w-3.5 h-3.5" />
								<span>
									{selectedNode?.payload.role === 'agent' ||
									selectedNode?.payload.role === 'step'
										? 'Add Step Node'
										: 'Add Node'}
								</span>
							</button>
							<button
								type="button"
								onClick={handleSnapTopologyLayout}
								className={`rounded-lg px-2.5 py-1 text-xs hover:bg-slate-500/15 transition-colors cursor-pointer ${themeCfg.bodyTextClass}`}
								title="Align nodes to active workflow handoff topology"
							>
								Topology Layout
							</button>
							<button
								type="button"
								onClick={handleRadialLayout}
								className={`rounded-lg px-2.5 py-1 text-xs hover:bg-slate-500/15 transition-colors cursor-pointer ${themeCfg.bodyTextClass}`}
								title="Arrange nodes in radial rings around the core workflow hub"
							>
								Radial Rings
							</button>
							<button
								type="button"
								onClick={centerStage}
								className={`rounded-lg px-2 py-1 text-xs hover:bg-slate-500/15 transition-colors cursor-pointer ${themeCfg.bodyTextClass}`}
								title="Center Mind-Map Canvas"
							>
								<ResetIcon className="w-3.5 h-3.5" />
							</button>
						</div>

						{/* Floating Zoom Controls (Top-Right) */}
						<div
							onPointerDown={(e) => e.stopPropagation()}
							onDoubleClick={(e) => e.stopPropagation()}
							className={`absolute top-3 right-3 z-10 flex items-center gap-1 rounded-xl border p-1.5 backdrop-blur-md ${themeCfg.floatingToolbarClass}`}
						>
							<button
								type="button"
								onClick={() => zoomBy(1 / 1.15)}
								className={`rounded-lg p-1 hover:bg-slate-500/15 transition-colors cursor-pointer ${themeCfg.bodyTextClass}`}
								title="Zoom out"
							>
								<ZoomOutIcon className="w-3.5 h-3.5" />
							</button>
							<span
								className={`px-1.5 font-mono text-[11px] tabular-nums ${themeCfg.titleTextClass}`}
							>
								{Math.round(view.scale * 100)}%
							</span>
							<button
								type="button"
								onClick={() => zoomBy(1.15)}
								className={`rounded-lg p-1 hover:bg-slate-500/15 transition-colors cursor-pointer ${themeCfg.bodyTextClass}`}
								title="Zoom in"
							>
								<ZoomInIcon className="w-3.5 h-3.5" />
							</button>
						</div>

						{/* Interactive SVG Canvas */}
						<svg width="100%" height="100%" className="block w-full h-full">
							<defs>
								<marker
									id="mind-arrow-default"
									viewBox="0 0 10 10"
									refX="23"
									refY="5"
									markerWidth="6"
									markerHeight="6"
									orient="auto-start-reverse"
								>
									<path
										d="M 0 1 L 8 5 L 0 9 z"
										fill={themeCfg.isLightTheme ? '#475569' : '#64748b'}
									/>
								</marker>
								<marker
									id="mind-arrow-completed"
									viewBox="0 0 10 10"
									refX="23"
									refY="5"
									markerWidth="6"
									markerHeight="6"
									orient="auto-start-reverse"
								>
									<path
										d="M 0 1 L 8 5 L 0 9 z"
										fill={themeCfg.nodePalette.emerald.stroke}
									/>
								</marker>
								<marker
									id="mind-arrow-active"
									viewBox="0 0 10 10"
									refX="23"
									refY="5"
									markerWidth="6"
									markerHeight="6"
									orient="auto-start-reverse"
								>
									<path
										d="M 0 1 L 8 5 L 0 9 z"
										fill={themeCfg.nodePalette.violet.stroke}
									/>
								</marker>
							</defs>

							<g
								transform={`translate(${view.tx}, ${view.ty}) scale(${view.scale})`}
							>
								{/* Subtle origin crosshair at (0,0) */}
								<line
									x1={-20}
									y1={0}
									x2={20}
									y2={0}
									stroke={themeCfg.crosshairStroke}
									strokeWidth={1.2}
								/>
								<line
									x1={0}
									y1={-20}
									x2={0}
									y2={20}
									stroke={themeCfg.crosshairStroke}
									strokeWidth={1.2}
								/>

								{/* Graph Links */}
								{graph.links.map((link) => {
									const a = graph.nodes.find((n) => n.id === link.from);
									const b = graph.nodes.find((n) => n.id === link.to);
									if (!a || !b) return null;

									const isConnectedToSelected =
										selectedNode &&
										(link.from === selectedNode.id ||
											link.to === selectedNode.id);
									const dimmed =
										!matchingNodeIds.has(a.id) || !matchingNodeIds.has(b.id);
									const midX = (a.x + b.x) / 2;
									const midY = (a.y + b.y) / 2;

									const strokeColor = link.isActiveFlow
										? themeCfg.nodePalette.violet.stroke
										: link.isCompletedFlow || isConnectedToSelected
										? themeCfg.nodePalette.emerald.stroke
										: themeCfg.defaultEdgeStroke;

									const markerEnd = link.isActiveFlow
										? 'url(#mind-arrow-active)'
										: link.isCompletedFlow || isConnectedToSelected
										? 'url(#mind-arrow-completed)'
										: 'url(#mind-arrow-default)';

									const edgeTextFill = link.isActiveFlow
										? themeCfg.subtitleVioletFill
										: link.isCompletedFlow
										? themeCfg.subtitleEmeraldFill
										: themeCfg.subtitleDefaultFill;

									return (
										<g key={link.id} opacity={dimmed ? 0.15 : 1}>
											<line
												x1={a.x}
												y1={a.y}
												x2={b.x}
												y2={b.y}
												stroke={strokeColor}
												strokeWidth={
													link.isActiveFlow
														? 2.8
														: link.isCompletedFlow || isConnectedToSelected
														? 2.2
														: themeCfg.isLightTheme
														? 1.75
														: 1.4
												}
												markerEnd={markerEnd}
												className={
													link.isActiveFlow ? 'edge-flow-active' : undefined
												}
											/>
											{link.label &&
												(link.isActiveFlow ||
													link.isCompletedFlow ||
													isConnectedToSelected ||
													link.id.includes('handoff') ||
													link.id.includes('fan')) && (
													<text
														x={midX}
														y={midY - 6}
														fill={edgeTextFill}
														fontSize={themeCfg.isLightTheme ? '10.5' : '10'}
														fontWeight={themeCfg.edgeFontWeight}
														textAnchor="middle"
														style={{
															paintOrder: 'stroke fill',
															stroke: themeCfg.labelHaloStroke,
															strokeWidth: `${themeCfg.labelHaloWidth}px`,
															strokeLinejoin: 'round',
														}}
														className="font-mono pointer-events-none"
													>
														{link.label}
													</text>
												)}
										</g>
									);
								})}

								{/* Graph Nodes */}
								{graph.nodes.map((node) => {
									const isAgentHub =
										node.payload.role === 'agent' ||
										node.payload.role === 'owner';
									const baseRadius = NODE_RADII[node.type] || 16;
									const radius = isAgentHub ? baseRadius + 4 : baseRadius;
									const colorMeta =
										NODE_COLORS[node.type] || NODE_COLORS.amber;
									const themeNodeColor =
										themeCfg.nodePalette[node.type] ||
										themeCfg.nodePalette.amber;
									const isSelected = node.id === graph.pointerId;
									const isDimmed = !matchingNodeIds.has(node.id);

									const labelFontSize =
										(isAgentHub ? 12.2 : 11.2) +
										themeCfg.primaryFontSizeBoost;
									const labelFontWeight =
										isSelected || isAgentHub
											? themeCfg.selectedFontWeight
											: themeCfg.primaryFontWeight;

									return (
										<g
											key={node.id}
											transform={`translate(${node.x}, ${node.y})`}
											onPointerDown={(e) => handleNodePointerDown(e, node)}
											style={{
												cursor: 'pointer',
												opacity: isDimmed ? 0.25 : 1,
											}}
											className="transition-opacity duration-150"
										>
											{/* Live Executing Pulse Halo */}
											{node.isExecuting && (
												<circle
													r={radius + 12}
													fill="none"
													stroke={themeCfg.nodePalette.violet.stroke}
													strokeWidth={2.2}
													strokeDasharray="5 4"
													className="glow-violet animate-spin"
												/>
											)}

											{/* Outer Selection Halo */}
											{isSelected && (
												<circle
													r={radius + 7}
													fill="none"
													stroke={themeNodeColor.stroke}
													strokeWidth={themeCfg.isLightTheme ? 2 : 1.5}
													strokeDasharray="4 3"
													className={colorMeta.glowClass}
												/>
											)}

											{/* Node Ring Badge */}
											<circle
												r={radius}
												fill={
													isSelected
														? themeCfg.nodeSelectedFill
														: themeCfg.nodeFill
												}
												stroke={themeNodeColor.stroke}
												strokeWidth={
													isSelected || node.isExecuting
														? 3.2
														: themeCfg.isLightTheme
														? 2.8
														: 2.4
												}
												className={
													isSelected || node.isExecuting
														? colorMeta.glowClass
														: undefined
												}
											/>

											{/* Inner Accent Dot or Agent Number */}
											{node.payload.role === 'agent' &&
											node.payload.instanceId ? (
												<text
													y={4}
													fill={themeNodeColor.text}
													fontSize={themeCfg.isLightTheme ? '11.5' : '11'}
													fontWeight={themeCfg.isLightTheme ? 800 : 700}
													textAnchor="middle"
													className="font-mono pointer-events-none"
												>
													0{node.payload.instanceId}
												</text>
											) : (
												<circle
													cx={0}
													cy={0}
													r={isSelected || node.isExecuting ? 4.8 : 3.5}
													fill={themeNodeColor.stroke}
												/>
											)}

											{/* Node Primary Label — Environment-adaptive weight & halo */}
											<text
												y={radius + 16}
												fill={
													isSelected
														? themeCfg.selectedLabelFill
														: themeCfg.primaryLabelFill
												}
												fontSize={labelFontSize}
												fontWeight={labelFontWeight}
												textAnchor="middle"
												style={{
													paintOrder: 'stroke fill',
													stroke: themeCfg.labelHaloStroke,
													strokeWidth: `${themeCfg.labelHaloWidth}px`,
													strokeLinejoin: 'round',
													letterSpacing: themeCfg.isLightTheme
														? '-0.01em'
														: '0em',
												}}
												className="pointer-events-none"
											>
												{node.label}
											</text>

											{/* Status / Runtime Subtitle — Bolder and deeper contrast on light/pastel themes */}
											<text
												y={radius + 30}
												fill={
													node.isExecuting
														? themeCfg.subtitleVioletFill
														: node.type === 'emerald'
														? themeCfg.subtitleEmeraldFill
														: themeCfg.subtitleDefaultFill
												}
												fontSize={themeCfg.isLightTheme ? '10.2' : '9.5'}
												fontWeight={themeCfg.subtitleFontWeight}
												textAnchor="middle"
												style={{
													paintOrder: 'stroke fill',
													stroke: themeCfg.labelHaloStroke,
													strokeWidth: `${themeCfg.labelHaloWidth - 0.8}px`,
													strokeLinejoin: 'round',
												}}
												className="font-mono pointer-events-none"
											>
												{node.payload.statusLabel || node.payload.role}
											</text>
										</g>
									);
								})}
							</g>
						</svg>

						{/* Bottom Interaction Strip */}
						<div
							onPointerDown={(e) => e.stopPropagation()}
							className={`absolute bottom-2.5 left-3 right-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-1.5 text-[11px] backdrop-blur-md ${themeCfg.bottomStripClass}`}
						>
							<span>
								Click any Agent or Step node to inspect/edit · Drag to move ·
								Shift+Click to wire handoff · Double-click to spawn step
							</span>
							<div className="flex items-center gap-3 font-mono tabular-nums">
								<span
									style={{
										color: themeCfg.nodePalette.emerald.badgeText,
										fontWeight: themeCfg.isLightTheme ? 700 : 500,
									}}
								>
									Emerald: {counts.emerald} done
								</span>
								<span>·</span>
								<span
									style={{
										color: themeCfg.nodePalette.violet.badgeText,
										fontWeight: themeCfg.isLightTheme ? 700 : 500,
									}}
								>
									Violet: {counts.violet} active
								</span>
								<span>·</span>
								<span
									style={{
										color: themeCfg.nodePalette.amber.badgeText,
										fontWeight: themeCfg.isLightTheme ? 700 : 500,
									}}
								>
									Amber: {counts.amber} queued
								</span>
							</div>
						</div>
					</div>
				</section>

				{/* RIGHT RAIL: Live Node Inspector & Agent Coordinator */}
				<aside
					className={`w-80 shrink-0 border-l p-3.5 flex flex-col gap-3 overflow-y-auto text-xs ${themeCfg.railClass}`}
				>
					<div className="flex items-center justify-between border-b border-slate-500/20 pb-2.5">
						<h3 className={`text-xs ${themeCfg.titleTextClass}`}>
							Mind-Map Node Inspector
						</h3>
						{selectedNode && (
							<span
								className={`font-mono text-[11px] tabular-nums ${themeCfg.mutedTextClass}`}
							>
								({selectedNode.x}, {selectedNode.y})
							</span>
						)}
					</div>

					{selectedNode ? (
						<div className="space-y-3">
							{/* Unboxed Metadata Line (Zero-Pill Discipline) */}
							<div
								className={`flex items-center gap-1.5 text-[11px] flex-wrap ${themeCfg.mutedTextClass}`}
							>
								<span
									className="font-bold"
									style={{
										color:
											themeCfg.nodePalette[selectedNode.type]?.badgeText ||
											themeCfg.nodePalette.amber.badgeText,
									}}
								>
									{selectedNode.type.toUpperCase()}
								</span>
								<span aria-hidden="true">·</span>
								<span>{selectedNode.payload.role}</span>
								{selectedNode.payload.durationMs !== undefined && (
									<>
										<span aria-hidden="true">·</span>
										<span
											className={`font-mono tabular-nums ${themeCfg.titleTextClass}`}
										>
											{selectedNode.payload.durationMs}ms
										</span>
									</>
								)}
								{selectedNode.payload.redactionsCount !== undefined &&
									selectedNode.payload.redactionsCount > 0 && (
										<>
											<span aria-hidden="true">·</span>
											<span
												style={{
													color: themeCfg.nodePalette.emerald.badgeText,
												}}
											>
												{selectedNode.payload.redactionsCount} masked
											</span>
										</>
									)}
							</div>

							{/* Editable Node Label */}
							<div>
								<label
									className={`block text-[11px] mb-1 ${themeCfg.mutedTextClass}`}
								>
									Node / Step Title
								</label>
								<input
									type="text"
									value={selectedNode.label}
									onChange={(e) =>
										updateSelectedNode({ label: e.target.value })
									}
									className={`w-full rounded-lg border px-2.5 py-1.5 text-xs focus:border-emerald-500/50 focus:outline-none ${themeCfg.inputClass}`}
								/>
							</div>

							{/* If an Agent or Step node is selected: Direct Model & Execution Coordinator */}
							{selectedAgentInstance && (
								<div
									className={`p-2.5 rounded-lg border space-y-2 ${themeCfg.cardClass}`}
								>
									<div className="flex items-center justify-between">
										<span className={themeCfg.titleTextClass}>
											{selectedAgentInstance.name}
										</span>
										<button
											type="button"
											onClick={() =>
												onRunSingleInstance(selectedAgentInstance.id)
											}
											disabled={selectedAgentInstance.status === 'running'}
											className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-[11px] font-semibold cursor-pointer"
										>
											<PlayIcon className="w-3 h-3" />
											<span>Run Agent 0{selectedAgentInstance.id}</span>
										</button>
									</div>

									<div>
										<label
											className={`block text-[10px] mb-1 ${themeCfg.mutedTextClass}`}
										>
											Assigned Gemini Model
										</label>
										<select
											value={selectedAgentInstance.model}
											onChange={(e) =>
												onUpdateInstance(
													selectedAgentInstance.id,
													(prev) => ({
														...prev,
														model: e.target.value as GeminiModelId,
													}),
												)
											}
											className={`w-full rounded border px-2 py-1 text-[11px] ${themeCfg.inputClass}`}
										>
											{AVAILABLE_MODELS.map((m) => (
												<option key={m.id} value={m.id}>
													{m.label} ({m.tier})
												</option>
											))}
										</select>
									</div>
								</div>
							)}

							{/* Editable Instruction / System Prompt / Objective */}
							<div>
								<label
									className={`block text-[11px] mb-1 ${themeCfg.mutedTextClass}`}
								>
									{selectedNode.id === 'wf-core'
										? 'Master Workflow Objective'
										: selectedNode.payload.role === 'agent'
										? 'Unique Agent System Prompt'
										: selectedNode.payload.role === 'step'
										? 'Step Execution Instruction'
										: 'Node Notes & Specification'}
								</label>
								<textarea
									rows={compactMode ? 3 : 4}
									value={selectedNode.payload.notes}
									onChange={(e) =>
										updateSelectedNode({ notes: e.target.value })
									}
									className={`w-full rounded-lg border p-2 font-mono text-[11px] leading-relaxed focus:border-emerald-500/50 focus:outline-none resize-none ${themeCfg.inputClass}`}
								/>
							</div>

							{/* Live Execution Output / Reasoning Summary if completed */}
							{(selectedNode.payload.reasoningSummary ||
								selectedNode.payload.executionOutput) && (
								<div className="p-2.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 space-y-1.5">
									<div
										className="text-[11px] font-bold"
										style={{ color: themeCfg.nodePalette.emerald.badgeText }}
									>
										Live Step Execution Output
									</div>
									{selectedNode.payload.reasoningSummary && (
										<p
											className={`text-[11px] leading-relaxed ${themeCfg.bodyTextClass}`}
										>
											{selectedNode.payload.reasoningSummary}
										</p>
									)}
									{selectedNode.payload.executionOutput && (
										<pre
											className={`max-h-36 overflow-y-auto p-2 rounded border font-mono text-[10px] whitespace-pre-wrap ${themeCfg.inputClass}`}
										>
											{selectedNode.payload.executionOutput}
										</pre>
									)}
									{selectedNode.payload.guardrailSummary && (
										<div
											className="text-[10px] pt-1 border-t border-emerald-500/20 font-semibold"
											style={{ color: themeCfg.nodePalette.emerald.badgeText }}
										>
											{selectedNode.payload.guardrailSummary}
										</div>
									)}
								</div>
							)}

							{/* Companion Gate Confirmation Prompt if deleting a step/node */}
							{pendingDeleteNodeId === selectedNode.id && !ownerApproved && (
								<div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 space-y-2">
									<p
										className="text-[11px] leading-relaxed"
										style={{ color: themeCfg.nodePalette.amber.badgeText }}
									>
										<strong>{companionInfo.name}:</strong> &ldquo;Confirm
										deleting <em>{selectedNode.label}</em> from the workflow
										graph?&rdquo;
									</p>
									<div className="flex items-center gap-2">
										<button
											type="button"
											onClick={() => {
												handleToggleApproval(true);
												executeDeleteNode(selectedNode.id);
											}}
											className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500 cursor-pointer"
										>
											Approve & Delete
										</button>
										<button
											type="button"
											onClick={() => setPendingDeleteNodeId(null)}
											className={`rounded border px-2.5 py-1 text-[11px] cursor-pointer ${themeCfg.cardClass} ${themeCfg.bodyTextClass}`}
										>
											Cancel
										</button>
									</div>
								</div>
							)}

							{/* Delete Step / Node Button (for non-core/agent nodes) */}
							{selectedNode.id !== 'wf-core' &&
								!selectedNode.id.startsWith('agent-') &&
								selectedNode.id !== 'lease-guardrail' && (
									<div className="pt-1 flex justify-end">
										<button
											type="button"
											onClick={() => handleRequestDeleteNode(selectedNode.id)}
											className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold hover:bg-rose-500/20 cursor-pointer"
											style={{ color: themeCfg.nodePalette.rose.badgeText }}
										>
											<TrashIcon className="w-3 h-3" />
											<span>Delete Node</span>
										</button>
									</div>
								)}
						</div>
					) : (
						<p className={`text-xs ${themeCfg.mutedTextClass}`}>
							Click any Agent, Step, or Hub node on the Mind-Map stage to
							inspect live execution telemetry or edit its prompt.
						</p>
					)}
				</aside>
			</div>

			{/* INTAKE MODAL */}
			{activeModal === 'intake' && (
				<div
					onClick={() => setActiveModal(null)}
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
				>
					<div
						onClick={(e) => e.stopPropagation()}
						className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden text-xs ${themeCfg.modalCardClass}`}
					>
						<form onSubmit={handleRunIntake} className="flex flex-col">
							<div className="flex items-center justify-between border-b border-slate-500/20 px-5 py-3.5">
								<span className={`text-sm ${themeCfg.titleTextClass}`}>
									Mind-Work-Done · Multi-Line Intake Parser
								</span>
								<button
									type="button"
									onClick={() => setActiveModal(null)}
									className={themeCfg.mutedTextClass}
								>
									<Cross2Icon className="w-4 h-4" />
								</button>
							</div>
							<div className="p-5 space-y-3">
								<p className={`leading-relaxed ${themeCfg.bodyTextClass}`}>
									Paste tasks, compliance checks, or brainstorm lines. Each line
									is classified into Emerald (done/milestone), Amber
									(urgent/finance), or Violet (brainstorm) nodes anchored to{' '}
									<strong
										style={{ color: themeCfg.nodePalette.emerald.badgeText }}
									>
										{selectedNode?.label || 'Workflow Hub'}
									</strong>
									.
								</p>
								<textarea
									rows={5}
									value={intakeText}
									onChange={(e) => setIntakeText(e.target.value)}
									className={`w-full rounded-xl border p-3 font-mono text-xs focus:border-emerald-500/50 focus:outline-none ${themeCfg.inputClass}`}
								/>
							</div>
							<div className="flex items-center justify-end gap-2 border-t border-slate-500/20 px-5 py-3">
								<button
									type="button"
									onClick={() => setActiveModal(null)}
									className={`rounded-lg border px-3.5 py-1.5 ${themeCfg.cardClass} ${themeCfg.bodyTextClass}`}
								>
									Cancel
								</button>
								<button
									type="submit"
									className="rounded-lg bg-emerald-600 px-4 py-1.5 font-semibold text-white hover:bg-emerald-500"
								>
									Parse & Add Nodes
								</button>
							</div>
						</form>
					</div>
				</div>
			)}

			{/* BLUEPRINT MODAL */}
			{activeModal === 'blueprint' && (
				<div
					onClick={() => setActiveModal(null)}
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
				>
					<div
						onClick={(e) => e.stopPropagation()}
						className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden text-xs ${themeCfg.modalCardClass}`}
					>
						<form onSubmit={handleRunBlueprint} className="flex flex-col">
							<div className="flex items-center justify-between border-b border-slate-500/20 px-5 py-3.5">
								<span className={`text-sm ${themeCfg.titleTextClass}`}>
									Mind-Work-Done · Blueprint & Pipeline Importer
								</span>
								<button
									type="button"
									onClick={() => setActiveModal(null)}
									className={themeCfg.mutedTextClass}
								>
									<Cross2Icon className="w-4 h-4" />
								</button>
							</div>
							<div className="p-5 space-y-3">
								<p className={`leading-relaxed ${themeCfg.bodyTextClass}`}>
									Paste arrow pipelines (<code>Stage A -&gt; Stage B</code>) or
									JSON node arrays to map directed workflow relationships onto
									the canvas.
								</p>
								<div className="flex items-center gap-2 flex-wrap">
									<span className={themeCfg.mutedTextClass}>Templates:</span>
									{MIND_BLUEPRINT_PRESETS.map((preset) => (
										<button
											key={preset.title}
											type="button"
											onClick={() => setBlueprintText(preset.content)}
											className={`rounded-lg border px-2.5 py-1 ${themeCfg.cardClass} ${themeCfg.bodyTextClass}`}
										>
											{preset.title}
										</button>
									))}
								</div>
								<textarea
									rows={6}
									value={blueprintText}
									onChange={(e) => setBlueprintText(e.target.value)}
									className={`w-full rounded-xl border p-3 font-mono text-xs focus:border-emerald-500/50 focus:outline-none ${themeCfg.inputClass}`}
								/>
							</div>
							<div className="flex items-center justify-end gap-2 border-t border-slate-500/20 px-5 py-3">
								<button
									type="button"
									onClick={() => setActiveModal(null)}
									className={`rounded-lg border px-3.5 py-1.5 ${themeCfg.cardClass} ${themeCfg.bodyTextClass}`}
								>
									Cancel
								</button>
								<button
									type="submit"
									className="rounded-lg bg-emerald-600 px-4 py-1.5 font-semibold text-white hover:bg-emerald-500"
								>
									Import Onto Canvas
								</button>
							</div>
						</form>
					</div>
				</div>
			)}
		</div>
	);
}
