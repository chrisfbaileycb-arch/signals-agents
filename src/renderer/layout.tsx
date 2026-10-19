import React, { useEffect, useRef, useState } from 'react';
import Pane from 'components/pane';
import WorkflowMindMap from 'components/WorkflowMindMap';
import WorkflowExportCenter from 'components/WorkflowExportCenter';
import {
	createDefaultSteps,
	createDefaultStepSubTasks,
	ENVIRONMENT_THEMES,
	EnvironmentTheme,
	evaluateSafetyGuardrails,
	GeminiModelId,
	GuardrailActionPolicy,
	INITIAL_FOUR_INSTANCES,
	KeyRoutingScope,
	LeaseAuditEntry,
	ScheduleMode,
	WorkflowInstance,
	WorkflowTopology,
} from 'lib/workflowTypes';
import {
	buildWorkflowFileBundle,
	createZipBlob,
	downloadSingleVirtualFile,
	triggerBrowserDownload,
} from 'lib/workflowExporter';
import { CmdOrCtrlKey } from 'lib/utils';
import { PromptCritic } from './promptCritic';
import './App.css';
import {
	ArrowRightIcon,
	CheckCircledIcon,
	ClockIcon,
	DownloadIcon,
	FileTextIcon,
	LockClosedIcon,
	PlayIcon,
	ReloadIcon,
	ResetIcon,
} from '@radix-ui/react-icons';

export type paneInfo = { webviewId: string; shortName: string };

const SAMPLE_WORKFLOW_PROMPTS = [
	'Design a fault-tolerant distributed rate-limiting service handling 100k RPS with sub-5ms p99 latency, including data structures, failure fallback, and verification tests.',
	'Audit and resolve customer billing dispute for Alex Rivera (email: alex.rivera@example.com, SSN: 123-45-6789, Card: 4532-0151-1283-9901, Account: ACCT-8849201) regarding duplicate ledger settlement and propose a PCI-compliant reconciliation workflow.',
	'Create a zero-downtime PostgreSQL schema migration strategy for a multi-tenant financial ledger table with 250M rows, including read-only compliance verification and rollback safety gates.',
];

export default function Layout() {
	const [activeTab, setActiveTab] = useState<
		'workspace' | 'topology' | 'schedules' | 'audit'
	>('workspace');

	const [superprompt, setSuperprompt] = useState<string>(
		SAMPLE_WORKFLOW_PROMPTS[0],
	);

	const [instances, setInstances] = useState<WorkflowInstance[]>(
		INITIAL_FOUR_INSTANCES,
	);

	const [topology, setTopology] = useState<WorkflowTopology>('directional');
	const [gridLayout, setGridLayout] = useState<'columns' | 'grid'>('columns');
	const [showLiveMindMap, setShowLiveMindMap] = useState<boolean>(true);
	const [isGlobalRunning, setIsGlobalRunning] = useState<boolean>(false);
	const [activeGlobalLeaseId, setActiveGlobalLeaseId] = useState<string | null>(
		null,
	);
	const [lastPurgeReceipt, setLastPurgeReceipt] = useState<{
		leaseId: string;
		purgedAt: string;
		totalDurationMs: number;
		redactionsApplied: number;
	} | null>(null);

	// Environment Theme state: light, dark, pastel, or earthy tones (Default choice: earthy)
	const [environmentTheme, setEnvironmentTheme] = useState<EnvironmentTheme>(
		() => {
			const saved = localStorage.getItem('signals_agents_env_theme');
			if (
				saved === 'light' ||
				saved === 'dark' ||
				saved === 'pastel' ||
				saved === 'earthy'
			) {
				return saved;
			}
			return 'earthy';
		},
	);

	useEffect(() => {
		localStorage.setItem('signals_agents_env_theme', environmentTheme);
		document.body.setAttribute('data-theme', environmentTheme);
	}, [environmentTheme]);

	// Front-End Facing BYOK & Ephemeral Lease Connector State
	const [showByokConnector, setShowByokConnector] = useState<boolean>(true);
	const [keyRoutingScope, setKeyRoutingScope] =
		useState<KeyRoutingScope>('shared_four');
	const [isByokConnected, setIsByokConnected] = useState<boolean>(true);
	const [byokPreFlightLeaseId, setByokPreFlightLeaseId] = useState<
		string | null
	>(null);
	const [byokStatusMessage, setByokStatusMessage] = useState<string>(
		'Connected · 1 Ephemeral Key Multiplexed Across 4 Agent Renderances (Auto-Deletes on Completion)',
	);

	// Master Workflow Scheduler state
	const [masterScheduleMode, setMasterScheduleMode] =
		useState<ScheduleMode>('immediate');
	const [masterDelaySeconds] = useState<number>(10);
	const [masterIntervalSeconds] = useState<number>(60);
	const [masterMaxRuns] = useState<number>(3);
	const [masterRunsCompleted, setMasterRunsCompleted] = useState<number>(0);
	const [isMasterScheduled, setIsMasterScheduled] = useState<boolean>(false);
	const [masterCountdown, setMasterCountdown] = useState<number>(0);

	// Ephemeral Lease Deletion & Execution Audit Log
	const [auditLog, setAuditLog] = useState<LeaseAuditEntry[]>([]);

	// Refs to access latest state inside interval timers
	const instancesRef = useRef(instances);
	instancesRef.current = instances;
	const superpromptRef = useRef(superprompt);
	superpromptRef.current = superprompt;
	const isGlobalRunningRef = useRef(isGlobalRunning);
	isGlobalRunningRef.current = isGlobalRunning;

	const updateInstance = (
		id: number,
		updater: (prev: WorkflowInstance) => WorkflowInstance,
	) => {
		setInstances((prev) =>
			prev.map((inst) => (inst.id === id ? updater(inst) : inst)),
		);
	};

	// Apply 4x Same Model or 4x Different Models preset
	const applyModelPreset = (
		mode: 'same' | 'mixed',
		sameModelId?: GeminiModelId,
	) => {
		if (isGlobalRunning) return;
		if (mode === 'same' && sameModelId) {
			setInstances((prev) =>
				prev.map((inst) => ({
					...inst,
					model: sameModelId,
				})),
			);
		} else {
			const mixedModels: GeminiModelId[] = [
				'gemini-3.1-flash-lite',
				'gemini-3.8-flash',
				'gemini-flash-latest',
				'gemini-3.8-flash',
			];
			setInstances((prev) =>
				prev.map((inst, idx) => ({
					...inst,
					model: mixedModels[idx % mixedModels.length],
				})),
			);
		}
	};

	// Apply global guardrail policy across all 4 instances
	const applyGlobalGuardrailPolicy = (policy: GuardrailActionPolicy) => {
		if (isGlobalRunning) return;
		setInstances((prev) =>
			prev.map((inst) => ({
				...inst,
				guardrails: {
					...inst.guardrails,
					piiPolicy: policy,
					financialPolicy: policy,
				},
			})),
		);
	};

	// Provision ephemeral lease on backend
	const provisionLease = async (instanceIds: number[]): Promise<string> => {
		try {
			const res = await fetch('/api/workflow/lease', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					workflowId: `wf_${Date.now()}`,
					instanceIds,
				}),
			});
			const data = await res.json();
			return data.leaseId || `lease_${Date.now().toString(16)}`;
		} catch {
			return `lease_${Date.now().toString(16)}`;
		}
	};

	// Immediately purge ephemeral lease on backend upon workflow completion
	const purgeLease = async (
		leaseId: string,
		scopeLabel: string,
		usedTopology: WorkflowTopology,
		modelsUsed: string[],
		provisionedAt: string,
		totalDurationMs: number,
		stepsCompleted: number,
		redactionsApplied: number,
		status: 'PURGED_ON_COMPLETION' | 'BLOCKED_BY_GUARDRAIL' = 'PURGED_ON_COMPLETION',
	) => {
		let purgedAt = new Date().toISOString();
		try {
			const res = await fetch('/api/workflow/purge-lease', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ leaseId }),
			});
			const data = await res.json();
			if (data.purgedAt) {
				purgedAt = data.purgedAt;
			}
		} catch (e) {
			console.debug('Lease purge fallback', e);
		}

		setLastPurgeReceipt({
			leaseId,
			purgedAt,
			totalDurationMs,
			redactionsApplied,
		});

		const entry: LeaseAuditEntry = {
			id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
			leaseId,
			scopeLabel,
			topology: usedTopology,
			modelsUsed,
			provisionedAt,
			purgedAt,
			totalDurationMs,
			stepsCompleted,
			redactionsApplied,
			status,
		};

		setAuditLog((prev) => [entry, ...prev]);
		return purgedAt;
	};

	// Front-End BYOK Connector Handlers
	const handleConnectByokSession = async () => {
		try {
			const win = window as any;
			if (win.aistudio && typeof win.aistudio.openSelectKey === 'function') {
				await win.aistudio.openSelectKey();
			}
		} catch (e) {
			console.debug('AI Studio key selector fallback', e);
		}

		const leaseId = await provisionLease([1, 2, 3, 4]);
		setByokPreFlightLeaseId(leaseId);
		setIsByokConnected(true);
		setByokStatusMessage(
			keyRoutingScope === 'shared_four'
				? `BYOK Session Lease Connected (${leaseId}) · Synced across Renderances 01–04 · Auto-Purges on Completion`
				: `BYOK Scoped Leases Armed (${leaseId}) · Independent Per-Agent Renderance Leases Ready`,
		);
	};

	const handlePurgeByokNow = async () => {
		const targetLease =
			activeGlobalLeaseId ||
			byokPreFlightLeaseId ||
			`lease_manual_${Date.now().toString(16)}`;
		const nowIso = new Date().toISOString();
		await purgeLease(
			targetLease,
			'Manual Front-End BYOK Connector Purge',
			topology,
			instancesRef.current.map((i) => i.model),
			nowIso,
			0,
			0,
			0,
			'PURGED_ON_COMPLETION',
		);
		setByokPreFlightLeaseId(null);
		setActiveGlobalLeaseId(null);
		setInstances((prev) =>
			prev.map((inst) => ({
				...inst,
				leaseId: null,
				leaseStatus: 'purged',
				leasePurgedAt: nowIso,
			})),
		);
		setByokStatusMessage(
			'Ephemeral BYOK Lease Purged (0ms retention) · Will auto-provision fresh lease on next workflow run',
		);
	};

	// Core function to execute all steps of a single instance and return its final deliverable
	const executeInstancePipeline = async (
		instanceId: number,
		sharedLeaseId: string,
		promptText: string,
		upstreamContextText: string,
		handoffSourceLabel: string | null,
	): Promise<{
		deliverable: string;
		durationMs: number;
		stepsDone: number;
		redactionsCount: number;
		blocked: boolean;
	}> => {
		const target = instancesRef.current.find((i) => i.id === instanceId);
		if (!target) {
			return {
				deliverable: '',
				durationMs: 0,
				stepsDone: 0,
				redactionsCount: 0,
				blocked: false,
			};
		}

		// Pre-flight client-side guardrail evaluation
		const clientScan = evaluateSafetyGuardrails(promptText, target.guardrails);
		if (clientScan.blocked) {
			updateInstance(instanceId, (prev) => ({
				...prev,
				status: 'blocked',
				activeStepIndex: 1,
				handoffState: 'idle',
				receivedHandoffFrom: handoffSourceLabel,
				steps: prev.steps.map((s, idx) =>
					idx === 0
						? {
								...s,
								status: 'blocked',
								error: clientScan.blockReason,
							}
						: { ...s, status: 'idle' },
				),
			}));
			return {
				deliverable: '',
				durationMs: 0,
				stepsDone: 0,
				redactionsCount: clientScan.piiCount + clientScan.financialCount,
				blocked: true,
			};
		}

		// Mark instance running and steps queued with 0% initial progress
		updateInstance(instanceId, (prev) => ({
			...prev,
			status: 'running',
			activeStepIndex: 1,
			handoffState: handoffSourceLabel ? 'receiving' : 'executing',
			receivedHandoffFrom: handoffSourceLabel,
			leaseId: sharedLeaseId,
			leaseStatus: 'active',
			leasePurgedAt: null,
			totalRuntimeMs: 0,
			steps: prev.steps.map((s) => ({
				...s,
				status: 'queued',
				progressPercent: 0,
				elapsedMs: 0,
				currentPhaseLabel: 'Queued in agent pipeline',
				subTasks: createDefaultStepSubTasks(s.id),
				durationMs: undefined,
				reasoningSummary: undefined,
				executionOutput: undefined,
				verificationCheck: undefined,
				guardrailSummary: undefined,
				error: undefined,
			})),
		}));

		let accumulatedStepsOutput = '';
		let instanceTotalMs = 0;
		let stepsDone = 0;
		let instanceRedactions = 0;
		const stepsSnapshot = [...target.steps];

		for (let i = 0; i < stepsSnapshot.length; i++) {
			const step = stepsSnapshot[i];
			const stepStartMs = Date.now();

			// Set current step to running with initial 12% progress and Phase 1 active
			updateInstance(instanceId, (prev) => ({
				...prev,
				activeStepIndex: i + 1,
				handoffState: 'executing',
				steps: prev.steps.map((s) =>
					s.id === step.id
						? {
								...s,
								status: 'running',
								progressPercent: 12,
								elapsedMs: 0,
								currentPhaseLabel:
									'Phase 1/4 · Scanning PII & Financial Guardrails...',
								subTasks: createDefaultStepSubTasks(s.id).map((sub, idx) => ({
									...sub,
									status: idx === 0 ? 'active' : 'pending',
								})),
							}
						: s,
				),
			}));

			// Start real-time progress ticker for the active step
			const progressInterval = setInterval(() => {
				const elapsed = Date.now() - stepStartMs;
				// Smooth asymptotic progress curve from 14% up to 94%
				const computedPct = Math.min(
					94,
					Math.round(14 + 80 * (1 - Math.exp(-elapsed / 420))),
				);
				const activePhaseIndex =
					computedPct < 32
						? 0
						: computedPct < 58
						? 1
						: computedPct < 82
						? 2
						: 3;
				const phaseLabels = [
					'Phase 1/4 · Scanning PII & Financial Guardrails...',
					'Phase 2/4 · Binding Unique System Prompt & Handoff...',
					'Phase 3/4 · Running Model Reasoning & Synthesis...',
					'Phase 4/4 · Verifying Deliverable Schema & Safety...',
				];

				updateInstance(instanceId, (prev) => ({
					...prev,
					steps: prev.steps.map((s) =>
						s.id === step.id && s.status === 'running'
							? {
									...s,
									progressPercent: computedPct,
									elapsedMs: elapsed,
									currentPhaseLabel: phaseLabels[activePhaseIndex],
									subTasks: (
										s.subTasks || createDefaultStepSubTasks(s.id)
									).map((sub, idx) => ({
										...sub,
										status:
											idx < activePhaseIndex
												? 'done'
												: idx === activePhaseIndex
												? 'active'
												: 'pending',
									})),
								}
							: s,
					),
				}));
			}, 85);

			try {
				const latestInst =
					instancesRef.current.find((inst) => inst.id === instanceId) ||
					target;

				const [res] = await Promise.all([
					fetch('/api/workflow/execute-step', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							leaseId: sharedLeaseId,
							instanceId: latestInst.id,
							instanceName: latestInst.name,
							model: latestInst.model,
							agentRole: latestInst.agentRole,
							customSystemPrompt: latestInst.customSystemPrompt,
							guardrails: latestInst.guardrails,
							stepNumber: i + 1,
							totalSteps: stepsSnapshot.length,
							stepTitle: step.title,
							stepInstruction: step.instruction,
							prompt: promptText,
							upstreamContext: upstreamContextText,
							previousStepsOutput: accumulatedStepsOutput,
						}),
					}),
					// Ensure readable real-time progress bar animation across the 4 sub-tasks
					new Promise((resolve) => setTimeout(resolve, 520)),
				]);

				clearInterval(progressInterval);

				const data = await res.json();
				if (!res.ok || data.error) {
					const isBlocked = Boolean(data.blockedByGuardrail);
					updateInstance(instanceId, (prev) => ({
						...prev,
						status: isBlocked ? 'blocked' : 'error',
						activeStepIndex: null,
						handoffState: 'idle',
						steps: prev.steps.map((s) =>
							s.id === step.id
								? {
										...s,
										status: isBlocked ? 'blocked' : 'error',
										error: data.error || 'Step execution failed',
									}
								: s,
						),
					}));
					return {
						deliverable: accumulatedStepsOutput,
						durationMs: instanceTotalMs,
						stepsDone,
						redactionsCount: instanceRedactions,
						blocked: isBlocked,
					};
				}

				const stepDuration =
					Number(data.durationMs) || Math.max(250, Date.now() - stepStartMs);
				const stepRedactions = Number(data.redactionsCount) || 0;
				instanceTotalMs += stepDuration;
				stepsDone += 1;
				instanceRedactions += stepRedactions;

				const stepOutputText = data.executionOutput || '';
				accumulatedStepsOutput += `\n[${step.title}]:\n${stepOutputText}\n`;

				updateInstance(instanceId, (prev) => ({
					...prev,
					totalRuntimeMs: instanceTotalMs,
					totalRedactionsCount: prev.totalRedactionsCount + stepRedactions,
					lastDeliverable: stepOutputText,
					steps: prev.steps.map((s) =>
						s.id === step.id
							? {
									...s,
									status: 'completed',
									progressPercent: 100,
									elapsedMs: stepDuration,
									currentPhaseLabel:
										'All 4 sub-tasks verified · Deliverable ready',
									subTasks: createDefaultStepSubTasks(s.id).map((sub) => ({
										...sub,
										status: 'done',
									})),
									durationMs: stepDuration,
									reasoningSummary: data.reasoningSummary,
									executionOutput: stepOutputText,
									verificationCheck: data.verificationCheck,
									guardrailSummary: data.guardrailSummary,
									completedAt: data.completedAt,
								}
							: s,
					),
				}));
			} catch (err: any) {
				clearInterval(progressInterval);
				updateInstance(instanceId, (prev) => ({
					...prev,
					status: 'error',
					activeStepIndex: null,
					handoffState: 'idle',
					steps: prev.steps.map((s) =>
						s.id === step.id
							? {
									...s,
									status: 'error',
									error: err?.message || 'Execution error',
								}
							: s,
					),
				}));
				return {
					deliverable: accumulatedStepsOutput,
					durationMs: instanceTotalMs,
					stepsDone,
					redactionsCount: instanceRedactions,
					blocked: false,
				};
			}
		}

		updateInstance(instanceId, (prev) => ({
			...prev,
			status: 'completed',
			activeStepIndex: null,
			handoffState: 'completed',
			totalRuntimeMs: instanceTotalMs,
		}));

		return {
			deliverable: accumulatedStepsOutput.trim(),
			durationMs: instanceTotalMs,
			stepsDone,
			redactionsCount: instanceRedactions,
			blocked: false,
		};
	};

	// Run a single instance standalone with its own ephemeral lease that deletes on completion
	const handleRunSingleInstance = async (instanceId: number) => {
		const promptText = superpromptRef.current.trim();
		if (!promptText) return;

		const inst = instancesRef.current.find((i) => i.id === instanceId);
		if (!inst || inst.status === 'running') return;

		setShowLiveMindMap(true);
		const provisionedAt = new Date().toISOString();
		const leaseId = await provisionLease([instanceId]);

		// Gather any existing upstream deliverable if directional or diamond
		let upstreamText = '';
		let handoffFrom: string | null = null;
		if (topology === 'directional' && instanceId > 1) {
			const prevInst = instancesRef.current.find(
				(i) => i.id === instanceId - 1,
			);
			if (prevInst?.lastDeliverable) {
				upstreamText = prevInst.lastDeliverable;
				handoffFrom = `${prevInst.name} (${prevInst.agentRole})`;
			}
		} else if (topology === 'diamond') {
			if (instanceId === 2 || instanceId === 3) {
				const rootInst = instancesRef.current.find((i) => i.id === 1);
				if (rootInst?.lastDeliverable) {
					upstreamText = rootInst.lastDeliverable;
					handoffFrom = `${rootInst.name}`;
				}
			} else if (instanceId === 4) {
				const i2 = instancesRef.current.find((i) => i.id === 2);
				const i3 = instancesRef.current.find((i) => i.id === 3);
				upstreamText = [i2?.lastDeliverable, i3?.lastDeliverable]
					.filter(Boolean)
					.join('\n\n---\n\n');
				if (upstreamText) {
					handoffFrom = 'Renderances 02 & 03 (Fan-In)';
				}
			}
		}

		try {
			const result = await executeInstancePipeline(
				instanceId,
				leaseId,
				promptText,
				upstreamText,
				handoffFrom,
			);

			const purgedAt = await purgeLease(
				leaseId,
				`${inst.name} (${inst.agentRole})`,
				topology,
				[inst.model],
				provisionedAt,
				result.durationMs,
				result.stepsDone,
				result.redactionsCount,
				result.blocked ? 'BLOCKED_BY_GUARDRAIL' : 'PURGED_ON_COMPLETION',
			);

			updateInstance(instanceId, (prev) => ({
				...prev,
				leaseId: null,
				leaseStatus: 'purged',
				leasePurgedAt: purgedAt,
			}));
		} catch (e) {
			console.error('Single instance execution error', e);
		}
	};

	// Execute all 4 instances according to the selected Directional / Parallel / Diamond topology
	// Sharing a single unified ephemeral session lease that auto-deletes the moment the workflow finishes
	const executeAllFourWorkflow = async () => {
		const promptText = superpromptRef.current.trim();
		if (!promptText || isGlobalRunningRef.current) return;

		setShowLiveMindMap(true);
		setIsGlobalRunning(true);
		const workflowStartMs = Date.now();
		const provisionedAt = new Date().toISOString();
		const allIds = instancesRef.current.map((i) => i.id);
		const modelsUsed = instancesRef.current.map((i) => i.model);

		const sharedLeaseId = await provisionLease(allIds);
		setActiveGlobalLeaseId(sharedLeaseId);

		let totalStepsCompleted = 0;
		let totalRedactions = 0;
		let anyBlocked = false;

		try {
			if (topology === 'parallel') {
				// All 4 instances execute simultaneously in parallel using the shared ephemeral lease
				const results = await Promise.all(
					allIds.map((id) =>
						executeInstancePipeline(
							id,
							sharedLeaseId,
							promptText,
							'',
							'Parallel Broadcast',
						),
					),
				);
				totalStepsCompleted = results.reduce((acc, r) => acc + r.stepsDone, 0);
				totalRedactions = results.reduce(
					(acc, r) => acc + r.redactionsCount,
					0,
				);
				anyBlocked = results.some((r) => r.blocked);
			} else if (topology === 'directional') {
				// Sequential directional workflow with step-to-step agent handoffs: 01 -> 02 -> 03 -> 04
				let upstreamDeliverable = '';
				let upstreamAgentLabel: string | null = null;
				for (const id of allIds) {
					const currentInst = instancesRef.current.find((i) => i.id === id);
					const res = await executeInstancePipeline(
						id,
						sharedLeaseId,
						promptText,
						upstreamDeliverable,
						upstreamAgentLabel,
					);
					totalStepsCompleted += res.stepsDone;
					totalRedactions += res.redactionsCount;
					if (res.blocked) {
						anyBlocked = true;
						break;
					}
					if (res.deliverable) {
						upstreamDeliverable = res.deliverable;
						upstreamAgentLabel = currentInst
							? `${currentInst.name} (${currentInst.agentRole})`
							: `Renderance 0${id}`;
					}
				}
			} else if (topology === 'diamond') {
				// Diamond: Instance 01 runs -> hands off to 02 & 03 in parallel -> both hand off to 04
				const res1 = await executeInstancePipeline(
					1,
					sharedLeaseId,
					promptText,
					'',
					null,
				);
				totalStepsCompleted += res1.stepsDone;
				totalRedactions += res1.redactionsCount;

				if (res1.blocked) {
					anyBlocked = true;
				} else {
					const [res2, res3] = await Promise.all([
						executeInstancePipeline(
							2,
							sharedLeaseId,
							promptText,
							res1.deliverable,
							'Renderance 01 (Fan-Out)',
						),
						executeInstancePipeline(
							3,
							sharedLeaseId,
							promptText,
							res1.deliverable,
							'Renderance 01 (Fan-Out)',
						),
					]);
					totalStepsCompleted += res2.stepsDone + res3.stepsDone;
					totalRedactions += res2.redactionsCount + res3.redactionsCount;

					if (res2.blocked || res3.blocked) {
						anyBlocked = true;
					} else {
						const combinedUpstream = [
							`From Renderance 02:\n${res2.deliverable}`,
							`From Renderance 03:\n${res3.deliverable}`,
						].join('\n\n===\n\n');

						const res4 = await executeInstancePipeline(
							4,
							sharedLeaseId,
							promptText,
							combinedUpstream,
							'Renderances 02 & 03 (Fan-In)',
						);
						totalStepsCompleted += res4.stepsDone;
						totalRedactions += res4.redactionsCount;
						if (res4.blocked) anyBlocked = true;
					}
				}
			}
		} finally {
			const totalWorkflowDurationMs = Date.now() - workflowStartMs;
			const purgedAt = await purgeLease(
				sharedLeaseId,
				`4-Instance ${
					topology === 'directional'
						? 'Directional Chain (1→2→3→4)'
						: topology === 'diamond'
						? 'Diamond Topology (1→[2,3]→4)'
						: 'Parallel Ensemble (4x)'
				}`,
				topology,
				modelsUsed,
				provisionedAt,
				totalWorkflowDurationMs,
				totalStepsCompleted,
				totalRedactions,
				anyBlocked ? 'BLOCKED_BY_GUARDRAIL' : 'PURGED_ON_COMPLETION',
			);

			// Immediately zero out and mark lease purged across all 4 instances
			setInstances((prev) =>
				prev.map((inst) => ({
					...inst,
					activeStepIndex: null,
					leaseId: null,
					leaseStatus: 'purged',
					leasePurgedAt: purgedAt,
				})),
			);

			setActiveGlobalLeaseId(null);
			setIsGlobalRunning(false);
		}
	};

	// Direct chat handler on an individual instance with automatic ephemeral lease purge
	const handleSendDirectChat = async (instanceId: number, message: string) => {
		const inst = instancesRef.current.find((i) => i.id === instanceId);
		if (!inst) return;

		const provisionedAt = new Date().toISOString();
		const leaseId = await provisionLease([instanceId]);

		const userTurnId = `user-${Date.now()}`;
		updateInstance(instanceId, (prev) => ({
			...prev,
			status: 'running',
			leaseId,
			leaseStatus: 'active',
			chatHistory: [
				...prev.chatHistory,
				{
					id: userTurnId,
					role: 'user',
					content: message,
					timestamp: new Date().toLocaleTimeString([], {
						hour: '2-digit',
						minute: '2-digit',
						second: '2-digit',
					}),
				},
			],
		}));

		try {
			const res = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					providerId: `instance_${instanceId}`,
					providerName: `${inst.name} (${inst.agentRole})`,
					model: inst.model,
					customSystemPrompt: inst.customSystemPrompt,
					guardrails: inst.guardrails,
					prompt: message,
				}),
			});
			const data = await res.json();
			const durationMs = Number(data.durationMs) || 200;
			const redactions = Number(data.redactionsCount) || 0;

			const purgedAt = await purgeLease(
				leaseId,
				`${inst.name} Direct Chat`,
				topology,
				[inst.model],
				provisionedAt,
				durationMs,
				1,
				redactions,
				res.status === 422 ? 'BLOCKED_BY_GUARDRAIL' : 'PURGED_ON_COMPLETION',
			);

			updateInstance(instanceId, (prev) => ({
				...prev,
				status: res.status === 422 ? 'blocked' : 'completed',
				leaseId: null,
				leaseStatus: 'purged',
				leasePurgedAt: purgedAt,
				totalRuntimeMs: prev.totalRuntimeMs + durationMs,
				totalRedactionsCount: prev.totalRedactionsCount + redactions,
				chatHistory: [
					...prev.chatHistory,
					{
						id: `assistant-${Date.now()}`,
						role: 'assistant',
						content: data.text || data.error || 'No response received.',
						timestamp: new Date().toLocaleTimeString([], {
							hour: '2-digit',
							minute: '2-digit',
							second: '2-digit',
						}),
						durationMs,
						modelUsed: inst.model,
						guardrailNote:
							redactions > 0
								? `Guardrails masked ${redactions} sensitive PII/Financial item(s) · Ephemeral lease auto-deleted`
								: 'Guardrails verified · Ephemeral lease auto-deleted',
					},
				],
			}));
		} catch (err: any) {
			const purgedAt = new Date().toISOString();
			updateInstance(instanceId, (prev) => ({
				...prev,
				status: 'error',
				leaseId: null,
				leaseStatus: 'purged',
				leasePurgedAt: purgedAt,
				chatHistory: [
					...prev.chatHistory,
					{
						id: `err-${Date.now()}`,
						role: 'assistant',
						content: `Error: ${err?.message || 'Request failed'}`,
						timestamp: new Date().toLocaleTimeString(),
					},
				],
			}));
		}
	};

	const handleResetInstance = (instanceId: number) => {
		updateInstance(instanceId, (prev) => ({
			...prev,
			status: 'idle',
			activeStepIndex: null,
			handoffState: 'idle',
			receivedHandoffFrom: null,
			leaseId: null,
			leaseStatus: 'unprovisioned',
			leasePurgedAt: null,
			totalRuntimeMs: 0,
			totalRedactionsCount: 0,
			lastDeliverable: '',
			steps: createDefaultSteps(instanceId - 1),
		}));
	};

	const handleResetAllInstances = () => {
		if (isGlobalRunning) return;
		setInstances(INITIAL_FOUR_INSTANCES);
	};

	// Toggle per-instance scheduler
	const handleToggleInstanceSchedule = (instanceId: number) => {
		updateInstance(instanceId, (prev) => {
			const nextActive = !prev.schedule.isScheduledActive;
			const initialCountdown =
				prev.schedule.mode === 'delayed'
					? prev.schedule.delaySeconds
					: prev.schedule.intervalSeconds;
			return {
				...prev,
				status: nextActive ? 'scheduled' : 'idle',
				schedule: {
					...prev.schedule,
					isScheduledActive: nextActive,
					countdownSeconds: nextActive ? initialCountdown : 0,
					runsCompleted: nextActive ? 0 : prev.schedule.runsCompleted,
				},
			};
		});
	};

	// Toggle master 4-instance scheduler
	const handleToggleMasterSchedule = () => {
		if (masterScheduleMode === 'immediate') {
			executeAllFourWorkflow();
			return;
		}
		const nextActive = !isMasterScheduled;
		setIsMasterScheduled(nextActive);
		if (nextActive) {
			setMasterRunsCompleted(0);
			setMasterCountdown(
				masterScheduleMode === 'delayed'
					? masterDelaySeconds
					: masterIntervalSeconds,
			);
		} else {
			setMasterCountdown(0);
		}
	};

	// Unified 1-second tick for both Individual Instance Schedulers and Master Workflow Scheduler
	useEffect(() => {
		const timer = setInterval(() => {
			// 1. Check individual instance schedules
			instancesRef.current.forEach((inst) => {
				if (!inst.schedule.isScheduledActive) return;
				if (inst.status === 'running' || isGlobalRunningRef.current) return;

				if (inst.schedule.countdownSeconds <= 1) {
					handleRunSingleInstance(inst.id);

					updateInstance(inst.id, (prev) => {
						const newRuns = prev.schedule.runsCompleted + 1;
						if (
							prev.schedule.mode === 'delayed' ||
							newRuns >= prev.schedule.maxRuns
						) {
							return {
								...prev,
								schedule: {
									...prev.schedule,
									runsCompleted: newRuns,
									isScheduledActive: false,
									countdownSeconds: 0,
								},
							};
						}
						return {
							...prev,
							schedule: {
								...prev.schedule,
								runsCompleted: newRuns,
								countdownSeconds: prev.schedule.intervalSeconds,
							},
						};
					});
				} else {
					updateInstance(inst.id, (prev) => ({
						...prev,
						schedule: {
							...prev.schedule,
							countdownSeconds: prev.schedule.countdownSeconds - 1,
						},
					}));
				}
			});

			// 2. Check master workflow schedule
			setIsMasterScheduled((currentlyScheduled) => {
				if (!currentlyScheduled || isGlobalRunningRef.current) {
					return currentlyScheduled;
				}
				setMasterCountdown((prevCount) => {
					if (prevCount <= 1) {
						executeAllFourWorkflow();
						setMasterRunsCompleted((prevRuns) => {
							const updatedRuns = prevRuns + 1;
							if (
								masterScheduleMode === 'delayed' ||
								updatedRuns >= masterMaxRuns
							) {
								setIsMasterScheduled(false);
								return updatedRuns;
							}
							return updatedRuns;
						});
						return masterScheduleMode === 'recurring'
							? masterIntervalSeconds
							: 0;
					}
					return prevCount - 1;
				});
				return currentlyScheduled;
			});
		}, 1000);

		return () => clearInterval(timer);
	}, [
		masterScheduleMode,
		masterDelaySeconds,
		masterIntervalSeconds,
		masterMaxRuns,
		topology,
	]);

	// Check if all 4 instances share the exact same model
	const allSameModel = instances.every((i) => i.model === instances[0].model)
		? instances[0].model
		: null;

	// Check if all 4 instances share the same guardrail policy
	const allSameGuardrailPolicy = instances.every(
		(i) =>
			i.guardrails.piiPolicy === instances[0].guardrails.piiPolicy &&
			i.guardrails.financialPolicy === instances[0].guardrails.piiPolicy,
	)
		? instances[0].guardrails.piiPolicy
		: null;

	const totalWorkflowRuntimeMs = instances.reduce(
		(acc, inst) => acc + inst.totalRuntimeMs,
		0,
	);

	const totalProtectedItemsCount = instances.reduce(
		(acc, inst) => acc + inst.totalRedactionsCount,
		0,
	);

	const handleQuickDownloadWorkflowZip = () => {
		const bundle = buildWorkflowFileBundle({
			instances,
			topology,
			superprompt,
			keyRoutingScope,
			environmentTheme,
			activeGlobalLeaseId,
			lastPurgeReceipt,
			auditLog,
		});
		const zipBlob = createZipBlob(bundle.archetype.rootFolderName, bundle.files);
		const dateStamp = new Date().toISOString().slice(0, 10);
		triggerBrowserDownload(
			zipBlob,
			`${bundle.archetype.rootFolderName}-${dateStamp}.zip`,
		);
	};

	const handleQuickDownloadResultsLog = () => {
		const bundle = buildWorkflowFileBundle({
			instances,
			topology,
			superprompt,
			keyRoutingScope,
			environmentTheme,
			activeGlobalLeaseId,
			lastPurgeReceipt,
			auditLog,
		});
		const logFile = bundle.files.find(
			(f) => f.path === 'logs/workflow-execution-results.log',
		);
		if (logFile) {
			downloadSingleVirtualFile(logFile);
		}
	};

	return (
		<div
			data-theme={environmentTheme}
			className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden transition-colors duration-200"
		>
			{/* Top Bar Contract: Strictly 3 Zones separated by gap-8 */}
			<header className="flex items-center justify-between gap-8 px-5 py-2.5 bg-slate-950 border-b border-slate-800 shrink-0">
				{/* Zone 1: Single text element Brand Wordmark */}
				<a
					href="#workspace"
					onClick={(e) => {
						e.preventDefault();
						setActiveTab('workspace');
					}}
					className="text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0"
				>
					Signals Agents
				</a>

				{/* Zone 2: 4 concise single-line navigation links */}
				<nav className="flex items-center gap-6 text-xs font-medium text-slate-400">
					<button
						type="button"
						onClick={() => setActiveTab('workspace')}
						className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 ${
							activeTab === 'workspace'
								? 'text-white underline underline-offset-8 decoration-indigo-500 decoration-2'
								: ''
						}`}
					>
						Workspace
					</button>
					<button
						type="button"
						onClick={() => setActiveTab('topology')}
						className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 ${
							activeTab === 'topology'
								? 'text-white underline underline-offset-8 decoration-indigo-500 decoration-2'
								: ''
						}`}
					>
						Mind-Map & Handoffs
					</button>
					<button
						type="button"
						onClick={() => setActiveTab('schedules')}
						className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 ${
							activeTab === 'schedules'
								? 'text-white underline underline-offset-8 decoration-indigo-500 decoration-2'
								: ''
						}`}
					>
						Schedules
					</button>
					<button
						type="button"
						onClick={() => setActiveTab('audit')}
						className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 ${
							activeTab === 'audit'
								? 'text-white underline underline-offset-8 decoration-indigo-500 decoration-2'
								: ''
						}`}
					>
						Export Log, Files & Audit
					</button>
				</nav>

				{/* Zone 3: 1 Primary Action Button */}
				<div className="flex items-center shrink-0">
					<button
						type="button"
						onClick={executeAllFourWorkflow}
						disabled={isGlobalRunning || !superprompt.trim()}
						className="inline-flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-md transition-colors whitespace-nowrap shrink-0"
					>
						{isGlobalRunning ? (
							<>
								<ReloadIcon className="w-3.5 h-3.5 animate-spin" />
								<span>Executing 4-Agent Workflow...</span>
							</>
						) : (
							<>
								<PlayIcon className="w-3.5 h-3.5" />
								<span>Execute Workflow</span>
							</>
						)}
					</button>
				</div>
			</header>

			{/* Secondary Workspace Orchestration Bar: Topology, Models, Guardrails, BYOK Connector & Environment Toggle */}
			<div className="px-5 py-2 bg-slate-900/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs">
				{/* Left: Directional Workflow Mode Selector */}
				<div className="flex items-center gap-2.5 flex-wrap">
					<span className="text-slate-400 font-medium whitespace-nowrap">
						Handoff Topology:
					</span>
					<div className="flex items-center gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-md">
						<button
							type="button"
							onClick={() => setTopology('directional')}
							disabled={isGlobalRunning}
							className={`px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
								topology === 'directional'
									? 'bg-indigo-600 text-white'
									: 'text-slate-400 hover:text-slate-200'
							}`}
						>
							Directional Steps (1 → 2 → 3 → 4)
						</button>
						<button
							type="button"
							onClick={() => setTopology('parallel')}
							disabled={isGlobalRunning}
							className={`px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
								topology === 'parallel'
									? 'bg-indigo-600 text-white'
									: 'text-slate-400 hover:text-slate-200'
							}`}
						>
							Parallel (4x Simultaneous)
						</button>
						<button
							type="button"
							onClick={() => setTopology('diamond')}
							disabled={isGlobalRunning}
							className={`px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
								topology === 'diamond'
									? 'bg-indigo-600 text-white'
									: 'text-slate-400 hover:text-slate-200'
							}`}
						>
							Diamond (1 → [2,3] → 4)
						</button>
					</div>
				</div>

				{/* Center: 4x Same Model vs 4x Different Models + PII/Financial Guardrail Preset */}
				<div className="flex items-center gap-3 flex-wrap">
					<div className="flex items-center gap-1.5">
						<span className="text-slate-400 font-medium whitespace-nowrap">
							Models:
						</span>
						<div className="flex items-center gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-md">
							<button
								type="button"
								onClick={() => applyModelPreset('same', 'gemini-3.8-flash')}
								disabled={isGlobalRunning}
								className={`px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
									allSameModel === 'gemini-3.8-flash'
										? 'bg-slate-800 text-white'
										: 'text-slate-400 hover:text-slate-200'
								}`}
							>
								4x Same (3.8 Flash)
							</button>
							<button
								type="button"
								onClick={() =>
									applyModelPreset('same', 'gemini-3.1-flash-lite')
								}
								disabled={isGlobalRunning}
								className={`px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
									allSameModel === 'gemini-3.1-flash-lite'
										? 'bg-slate-800 text-white'
										: 'text-slate-400 hover:text-slate-200'
								}`}
							>
								4x Same (Flash Lite)
							</button>
							<button
								type="button"
								onClick={() => applyModelPreset('mixed')}
								disabled={isGlobalRunning}
								className={`px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
									!allSameModel
										? 'bg-slate-800 text-white'
										: 'text-slate-400 hover:text-slate-200'
								}`}
							>
								4x Different Models
							</button>
						</div>
					</div>

					{/* Financial & Personal Info Safety Guardrail Mode */}
					<div className="flex items-center gap-1.5">
						<LockClosedIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
						<span className="text-slate-400 font-medium whitespace-nowrap">
							Guardrails:
						</span>
						<div className="flex items-center gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-md">
							<button
								type="button"
								onClick={() => applyGlobalGuardrailPolicy('mask')}
								disabled={isGlobalRunning}
								className={`px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
									allSameGuardrailPolicy === 'mask'
										? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
										: 'text-slate-400 hover:text-slate-200'
								}`}
								title="Automatically mask SSNs, credit cards, bank accounts, emails, and phone numbers"
							>
								Auto-Redact
							</button>
							<button
								type="button"
								onClick={() => applyGlobalGuardrailPolicy('block')}
								disabled={isGlobalRunning}
								className={`px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
									allSameGuardrailPolicy === 'block'
										? 'bg-red-600/30 text-red-300 border border-red-500/40'
										: 'text-slate-400 hover:text-slate-200'
								}`}
								title="Immediately block execution if raw financial or personal data is detected"
							>
								Strict Block
							</button>
						</div>
					</div>
				</div>

				{/* Right: Environment Toggle (Light / Dark / Pastel / Earthy) + BYOK Connector + View Toggle */}
				<div className="flex items-center gap-2.5 flex-wrap text-slate-400">
					{/* Environment Toggle: Light, Dark, Pastel, or Earthy Tones */}
					<div className="flex items-center gap-1.5">
						<span className="text-slate-400 font-medium whitespace-nowrap text-[11px]">
							Environment:
						</span>
						<div className="flex items-center gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-md">
							{ENVIRONMENT_THEMES.map((theme) => (
								<button
									key={theme.id}
									type="button"
									onClick={() => setEnvironmentTheme(theme.id)}
									className={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
										environmentTheme === theme.id
											? 'bg-indigo-600 text-white'
											: 'text-slate-400 hover:text-slate-200'
									}`}
									title={theme.description}
								>
									<span
										className="w-2 h-2 rounded-full shrink-0 border border-white/30"
										style={{ backgroundColor: theme.swatch }}
									/>
									<span>{theme.shortLabel}</span>
								</button>
							))}
						</div>
					</div>

					{/* Front-End BYOK Connector Toggle Button */}
					<button
						type="button"
						onClick={() => {
							setActiveTab('workspace');
							setShowByokConnector((prev) => !prev);
						}}
						className={`px-2.5 py-1 rounded-md border text-[11px] font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
							showByokConnector
								? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
								: 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
						}`}
						title="Toggle Front-End Bring Your Own API Key (BYOK) Ephemeral Lease Connector"
					>
						<LockClosedIcon className="w-3 h-3 text-emerald-400" />
						<span>
							{activeGlobalLeaseId
								? `BYOK Lease Active (${activeGlobalLeaseId})`
								: 'BYOK Key Connector'}
						</span>
					</button>

					<div className="flex items-center gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-md">
						<button
							type="button"
							onClick={() => setShowLiveMindMap((prev) => !prev)}
							className={`px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap shrink-0 ${
								showLiveMindMap
									? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
									: 'text-slate-400 hover:text-slate-200'
							}`}
							title="Toggle interactive Mind-Work-Done visual stage above agent panes"
						>
							{showLiveMindMap ? 'Mind-Map: Active' : 'Show Mind-Map'}
						</button>
						<button
							type="button"
							onClick={() => setGridLayout('columns')}
							className={`px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap shrink-0 ${
								gridLayout === 'columns'
									? 'bg-slate-800 text-white'
									: 'text-slate-400 hover:text-slate-200'
							}`}
						>
							4 Columns
						</button>
						<button
							type="button"
							onClick={() => setGridLayout('grid')}
							className={`px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap shrink-0 ${
								gridLayout === 'grid'
									? 'bg-slate-800 text-white'
									: 'text-slate-400 hover:text-slate-200'
							}`}
						>
							2x2 Grid
						</button>
					</div>

					<button
						type="button"
						onClick={handleResetAllInstances}
						disabled={isGlobalRunning}
						className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors whitespace-nowrap shrink-0"
						title="Reset all 4 instances"
					>
						<ResetIcon className="w-3.5 h-3.5" />
						<span>Reset</span>
					</button>
				</div>
			</div>

			{/* Main Content Area by Active Navigation View */}
			{activeTab === 'workspace' && (
				<div className="flex-1 min-h-0 flex flex-col overflow-y-auto p-3.5 pb-8 gap-3.5 scroll-smooth">
					{/* FRONT-END FACING BRING YOUR OWN API KEY (BYOK) & EPHEMERAL LEASE CONNECTOR */}
					{showByokConnector && (
						<div className="p-3 bg-slate-900/90 border border-slate-800 rounded-lg shrink-0 space-y-2.5 text-xs">
							<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
								<div className="flex items-center gap-2 flex-wrap">
									<span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono text-[10px] font-semibold">
										BYOK CONNECTOR
									</span>
									<span className="font-semibold text-slate-100">
										Front-End Ephemeral API Key & 4-Agent Session Multiplexer
									</span>
									<span className="text-slate-500" aria-hidden="true">
										·
									</span>
									<span className="text-slate-400 text-[11px] font-mono">
										{byokStatusMessage}
									</span>
								</div>

								<div className="flex items-center gap-2 flex-wrap shrink-0">
									{/* Key Routing Scope Selector */}
									<div className="flex items-center gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-md">
										<button
											type="button"
											onClick={() => {
												setKeyRoutingScope('shared_four');
												setByokStatusMessage(
													'1 Connected Key Multiplexed Across All 4 Renderances (Same or Mixed Models) · Auto-Deletes on Completion',
												);
											}}
											className={`px-2 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
												keyRoutingScope === 'shared_four'
													? 'bg-indigo-600 text-white'
													: 'text-slate-400 hover:text-slate-200'
											}`}
										>
											1 Key → All 4 Agents (Shared Pool)
										</button>
										<button
											type="button"
											onClick={() => {
												setKeyRoutingScope('per_instance');
												setByokStatusMessage(
													'Per-Renderance Scoped Ephemeral Leases Active (01–04) · Auto-Deletes on Completion',
												);
											}}
											className={`px-2 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
												keyRoutingScope === 'per_instance'
													? 'bg-indigo-600 text-white'
													: 'text-slate-400 hover:text-slate-200'
											}`}
										>
											Per-Renderance Scoped Leases
										</button>
									</div>

									<button
										type="button"
										onClick={handleConnectByokSession}
										disabled={isGlobalRunning}
										className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-medium text-[11px] transition-colors whitespace-nowrap"
									>
										Connect / Sync Session Key Lease
									</button>

									<button
										type="button"
										onClick={handlePurgeByokNow}
										className="px-2.5 py-1 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 text-emerald-400 font-mono text-[11px] transition-colors whitespace-nowrap"
										title="Immediately purge active or pre-flight session lease (0ms post-run retention)"
									>
										Purge Key Lease Now
									</button>
								</div>
							</div>

							{/* 4-Renderance Key Binding Matrix */}
							<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 pt-1">
								{instances.map((inst) => (
									<div
										key={inst.id}
										className="px-3 py-2 rounded bg-slate-950 border border-slate-800 flex items-center justify-between gap-2 text-[11px]"
									>
										<div className="min-w-0">
											<div className="flex items-center gap-1.5">
												<span className="font-mono font-semibold text-indigo-400">
													0{inst.id}
												</span>
												<span className="font-medium text-slate-200 truncate">
													{inst.name}
												</span>
											</div>
											<div className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
												Model: {inst.model}
											</div>
										</div>

										<div className="text-right font-mono tabular-nums shrink-0">
											<div
												className={`text-[10px] font-semibold ${
													inst.leaseStatus === 'active'
														? 'text-amber-300'
														: inst.leaseStatus === 'purged'
														? 'text-emerald-400'
														: 'text-indigo-400'
												}`}
											>
												{inst.leaseStatus === 'active'
													? `ACTIVE (${inst.leaseId?.slice(0, 8)})`
													: inst.leaseStatus === 'purged'
													? 'AUTO-DELETED (0ms)'
													: keyRoutingScope === 'shared_four'
													? 'SHARED 4x LEASE'
													: `SCOPED 0${inst.id} LEASE`}
											</div>
											<div className="text-[9px] text-slate-500">
												Auto-purges on finish
											</div>
										</div>
									</div>
								))}
							</div>
						</div>
					)}

					{/* VISIBLE MULTI-AGENT WORKFLOW & LIVE STEP HANDOFF PIPELINE BAR */}
					<div className="px-3.5 py-2 bg-slate-900/90 border border-slate-800 rounded-lg shrink-0 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2 text-xs">
						<div className="flex items-center gap-2 shrink-0">
							<span className="font-semibold text-slate-200">
								Live Agent Workflow & Handoff Pipeline:
							</span>
							<span className="text-slate-400">
								{topology === 'directional'
									? 'Sequential Step Handoffs (01 → 02 → 03 → 04)'
									: topology === 'diamond'
									? 'Diamond Fan-Out / Fan-In (01 → [02 ∥ 03] → 04)'
									: 'Parallel Independent Execution (01 ∥ 02 ∥ 03 ∥ 04)'}
							</span>
						</div>

						<div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
							{instances.map((inst, idx) => {
								const activeStep = inst.steps.find(
									(s) => s.status === 'running',
								);
								const doneCount = inst.steps.filter(
									(s) => s.status === 'completed',
								).length;
								const activePct = activeStep
									? activeStep.progressPercent ?? 45
									: inst.status === 'completed'
									? 100
									: Math.round((doneCount / Math.max(1, inst.steps.length)) * 100);

								return (
									<React.Fragment key={inst.id}>
										<button
											type="button"
											onClick={() => {
												document
													.getElementById(`agent-pane-${inst.id}`)
													?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
											}}
											className={`px-2.5 py-1 rounded border flex flex-col gap-1 shrink-0 transition-colors text-left min-w-[175px] ${
												inst.status === 'running'
													? 'bg-indigo-950/60 border-indigo-500 text-white'
													: inst.status === 'completed'
													? 'bg-emerald-950/30 border-emerald-700/50 text-emerald-300'
													: inst.status === 'blocked' ||
													  inst.status === 'error'
													? 'bg-red-950/40 border-red-700/60 text-red-300'
													: 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
											}`}
											title={`Scroll to ${inst.name} workflow pane`}
										>
											<div className="flex items-center justify-between gap-2 w-full">
												<div className="flex items-center gap-1.5 min-w-0">
													<span className="font-mono font-semibold text-[11px]">
														0{inst.id}
													</span>
													<span className="font-medium text-slate-200 truncate max-w-[110px]">
														{inst.agentRole}
													</span>
												</div>
												<span className="font-mono tabular-nums text-[10px] text-amber-300 shrink-0">
													{inst.status === 'running' && activeStep
														? `S${activeStep.stepNumber} · ${activePct}%`
														: `${doneCount}/${inst.steps.length}`}
												</span>
											</div>
											<div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden">
												<div
													className={`h-full rounded-full transition-all duration-150 ${
														inst.status === 'completed'
															? 'bg-emerald-500'
															: inst.status === 'running'
															? 'step-progress-active-bar'
															: 'bg-slate-700'
													}`}
													style={{ width: `${activePct}%` }}
												/>
											</div>
										</button>

										{idx < instances.length - 1 && (
											<span className="text-slate-600 font-mono text-xs shrink-0 px-0.5">
												{topology === 'parallel' ? (
													'∥'
												) : topology === 'diamond' && idx === 1 ? (
													'∥'
												) : (
													<ArrowRightIcon className="w-3.5 h-3.5 text-slate-500" />
												)}
											</span>
										)}
									</React.Fragment>
								);
							})}
						</div>
					</div>

					{/* Interactive Mind-Work-Done Visual Stage (Automatically active when workflows run) */}
					{showLiveMindMap && (
						<div className="h-[300px] shrink-0">
							<WorkflowMindMap
								instances={instances}
								topology={topology}
								superprompt={superprompt}
								onChangeSuperprompt={setSuperprompt}
								onChangeTopology={setTopology}
								onUpdateInstance={updateInstance}
								onRunAllWorkflow={executeAllFourWorkflow}
								onRunSingleInstance={handleRunSingleInstance}
								isGlobalRunning={isGlobalRunning}
								activeGlobalLeaseId={activeGlobalLeaseId}
								lastPurgeReceipt={lastPurgeReceipt}
								compactMode={true}
								onExpandFullStage={() => setActiveTab('topology')}
								environmentTheme={environmentTheme}
								onOpenExportCenter={() => setActiveTab('audit')}
								onDownloadWorkflowBundleZip={handleQuickDownloadWorkflowZip}
							/>
						</div>
					)}

					{/* Section Header Bar for 4 Agent Workflows + Quick Export Results Log & Folders Actions */}
					<div
						id="workspace-agent-panes"
						className="flex flex-wrap items-center justify-between gap-2 pt-0.5 shrink-0 text-xs"
					>
						<div className="flex items-center gap-2">
							<span className="font-semibold text-slate-200">
								4-Agent Execution Workflows (Renderances 01–04)
							</span>
							<span className="text-slate-600" aria-hidden="true">
								·
							</span>
							<span className="text-slate-400">
								Real-time step progress bars, unique system prompts, BYOK lease connector & workflow-aware file exports
							</span>
						</div>
						<div className="flex items-center gap-2.5 flex-wrap">
							<button
								type="button"
								onClick={handleQuickDownloadResultsLog}
								className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-200 font-medium cursor-pointer"
								title="Download timestamped workflow-execution-results.log"
							>
								<FileTextIcon className="w-3 h-3 text-indigo-400" />
								<span>Export Results Log (.log)</span>
							</button>
							<button
								type="button"
								onClick={handleQuickDownloadWorkflowZip}
								className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] text-emerald-400 font-medium cursor-pointer"
								title="Download complete workflow folder (.zip) with /logs, /deliverables, /agents, and /mind-map"
							>
								<DownloadIcon className="w-3 h-3" />
								<span>Download Workflow Folder (.zip)</span>
							</button>
							<button
								type="button"
								onClick={() => setActiveTab('audit')}
								className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium cursor-pointer"
							>
								Browse Deliverable Files →
							</button>
							<span className="text-slate-700">·</span>
							<button
								type="button"
								onClick={() => setShowByokConnector((prev) => !prev)}
								className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium"
							>
								{showByokConnector
									? 'Hide BYOK Connector ↑'
									: 'Show BYOK Connector ↓'}
							</button>
							<button
								type="button"
								onClick={() => setShowLiveMindMap((prev) => !prev)}
								className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium"
							>
								{showLiveMindMap
									? 'Collapse Mind-Map Stage ↑'
									: 'Show Live Mind-Map Stage ↓'}
							</button>
						</div>
					</div>

					{/* 4 Agent Panes Grid — shrink-0 ensures full height rendering & smooth downward page scrolling */}
					<div
						className={
							gridLayout === 'columns'
								? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5 shrink-0 pb-4'
								: 'grid grid-cols-1 lg:grid-cols-2 gap-3.5 shrink-0 pb-4'
						}
					>
						{instances.map((instance) => (
							<div
								key={instance.id}
								id={`agent-pane-${instance.id}`}
								className="flex flex-col min-h-[480px]"
							>
								<Pane
									instance={instance}
									topology={topology}
									onUpdateInstance={updateInstance}
									onRunSingleInstance={handleRunSingleInstance}
									onToggleInstanceSchedule={handleToggleInstanceSchedule}
									onResetInstance={handleResetInstance}
									onSendDirectChat={handleSendDirectChat}
									isGlobalRunning={isGlobalRunning}
									keyRoutingScope={keyRoutingScope}
									isByokConnected={isByokConnected}
									onOpenByokConnector={() => setShowByokConnector(true)}
								/>
							</div>
						))}
					</div>
				</div>
			)}

			{activeTab === 'topology' && (
				<div className="flex-1 min-h-0 flex flex-col overflow-y-auto p-4 gap-5">
					<div className="h-[580px] shrink-0">
						<WorkflowMindMap
							instances={instances}
							topology={topology}
							superprompt={superprompt}
							onChangeSuperprompt={setSuperprompt}
							onChangeTopology={setTopology}
							onUpdateInstance={updateInstance}
							onRunAllWorkflow={executeAllFourWorkflow}
							onRunSingleInstance={handleRunSingleInstance}
							isGlobalRunning={isGlobalRunning}
							activeGlobalLeaseId={activeGlobalLeaseId}
							lastPurgeReceipt={lastPurgeReceipt}
							compactMode={false}
							environmentTheme={environmentTheme}
							onOpenExportCenter={() => setActiveTab('audit')}
							onDownloadWorkflowBundleZip={handleQuickDownloadWorkflowZip}
						/>
					</div>

					<div className="max-w-7xl w-full mx-auto space-y-4">
						<div className="flex items-center justify-between border-b border-slate-800 pb-3">
							<div>
								<h2 className="text-sm font-semibold text-white">
									Per-Agent System Prompts & Handoff Guardrail Matrix
								</h2>
								<p className="text-xs text-slate-400 mt-0.5">
									Customize each agent&apos;s unique system prompt and inspect
									its step pipeline alongside the interactive Mind-Work-Done
									stage above.
								</p>
							</div>
							<button
								type="button"
								onClick={() => setActiveTab('workspace')}
								className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors whitespace-nowrap shrink-0"
							>
								Return to 4-Pane Workspace
							</button>
						</div>

						{/* Visual Directional Flow Cards */}
						<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
							{instances.map((inst, idx) => (
								<div
									key={inst.id}
									className="p-4 bg-slate-900 border border-slate-800 rounded-lg flex flex-col justify-between space-y-4"
								>
									<div className="space-y-2">
										<div className="flex items-center justify-between text-xs text-slate-400 font-mono tabular-nums">
											<span>AGENT 0{inst.id}</span>
											<span>{inst.totalRuntimeMs.toLocaleString()}ms</span>
										</div>
										<h3 className="text-sm font-semibold text-white">
											{inst.name}
										</h3>
										<p className="text-xs text-indigo-400 font-medium">
											{inst.agentRole}
										</p>
										<div className="text-xs text-slate-400 pt-1">
											Model: <span className="text-slate-200">{inst.model}</span>
										</div>
									</div>

									{/* Unique System Prompt Preview / Quick Edit */}
									<div className="space-y-1.5 pt-3 border-t border-slate-800 text-xs">
										<label className="block text-slate-400 font-medium">
											Unique Agent System Prompt:
										</label>
										<textarea
											rows={4}
											value={inst.customSystemPrompt}
											onChange={(e) =>
												updateInstance(inst.id, (prev) => ({
													...prev,
													customSystemPrompt: e.target.value,
												}))
											}
											className="w-full p-2 text-[11px] font-mono bg-slate-950 border border-slate-800 rounded text-slate-200 focus:outline-none focus:border-indigo-500 resize-none"
										/>
									</div>

									<div className="space-y-1.5 pt-3 border-t border-slate-800 text-xs">
										<div className="text-slate-400 font-medium">
											Execution Steps ({inst.steps.length}):
										</div>
										{inst.steps.map((s) => (
											<div
												key={s.id}
												className="flex items-center justify-between text-[11px] text-slate-300 font-mono tabular-nums"
											>
												<span className="truncate pr-2 font-sans">
													{s.title}
												</span>
												<span>
													{s.durationMs !== undefined
														? `${s.durationMs}ms`
														: s.status}
												</span>
											</div>
										))}
									</div>

									<div className="pt-3 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
										<div>
											Guardrails: PII {inst.guardrails.piiPolicy.toUpperCase()}{' '}
											· Fin {inst.guardrails.financialPolicy.toUpperCase()}
										</div>
										<div>
											{topology === 'directional' ? (
												idx < 3 ? (
													<span className="text-indigo-300">
														Handoff Target → Renderance 0{inst.id + 1}
													</span>
												) : (
													<span className="text-emerald-400">
														Terminal Synthesis Node → Triggers Key Purge
													</span>
												)
											) : topology === 'diamond' ? (
												inst.id === 1 ? (
													<span className="text-indigo-300">
														Fan-Out → Renderances 02 & 03
													</span>
												) : inst.id === 2 || inst.id === 3 ? (
													<span className="text-indigo-300">
														Fan-In → Renderance 04
													</span>
												) : (
													<span className="text-emerald-400">
														Terminal Aggregator → Triggers Key Purge
													</span>
												)
											) : (
												<span>Parallel Broadcast → Triggers Key Purge</span>
											)}
										</div>
									</div>
								</div>
							))}
						</div>
					</div>
				</div>
			)}

			{activeTab === 'schedules' && (
				<div className="flex-1 min-h-0 overflow-y-auto p-6">
					<div className="max-w-6xl mx-auto space-y-6">
						<div className="flex items-center justify-between border-b border-slate-800 pb-4">
							<div>
								<h2 className="text-lg font-semibold text-white">
									Workflow Scheduler Matrix
								</h2>
								<p className="text-xs text-slate-400 mt-1">
									Configure automated execution timers for the synchronized
									4-instance workflow or independent renderance instances.
								</p>
							</div>

							{/* Master Workflow Schedule Controls */}
							<div className="flex items-center gap-3">
								<select
									value={masterScheduleMode}
									onChange={(e) => {
										setMasterScheduleMode(e.target.value as ScheduleMode);
										setIsMasterScheduled(false);
									}}
									className="px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded text-slate-200"
								>
									<option value="immediate">Master: Immediate</option>
									<option value="delayed">Master: Delayed (+10s)</option>
									<option value="recurring">Master: Recurring (60s)</option>
								</select>

								<button
									type="button"
									onClick={handleToggleMasterSchedule}
									className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
										isMasterScheduled
											? 'bg-red-600/20 text-red-300 border border-red-500/40'
											: 'bg-indigo-600 text-white hover:bg-indigo-500'
									}`}
								>
									{isMasterScheduled
										? `Cancel Master Schedule (${masterCountdown}s)`
										: masterScheduleMode === 'immediate'
										? 'Run Master Workflow Now'
										: 'Arm Master Schedule'}
								</button>
							</div>
						</div>

						{/* Per-Instance Schedule Table */}
						<div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
							<table className="w-full text-left border-collapse text-xs">
								<thead>
									<tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60">
										<th className="py-3 px-4 font-medium">Renderance</th>
										<th className="py-3 px-4 font-medium">Assigned Model</th>
										<th className="py-3 px-4 font-medium">Schedule Mode</th>
										<th className="py-3 px-4 font-medium">Timing / Cadence</th>
										<th className="py-3 px-4 font-medium text-right">
											Runs Completed
										</th>
										<th className="py-3 px-4 font-medium text-right">
											Countdown
										</th>
										<th className="py-3 px-4 font-medium text-right">
											Actions
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-800">
									{instances.map((inst) => (
										<tr
											key={inst.id}
											className="hover:bg-slate-800/40 transition-colors"
										>
											<td className="py-3 px-4 font-medium text-white">
												{inst.name} ·{' '}
												<span className="text-slate-400 font-normal">
													{inst.agentRole}
												</span>
											</td>
											<td className="py-3 px-4 font-mono text-slate-300">
												{inst.model}
											</td>
											<td className="py-3 px-4">
												<select
													value={inst.schedule.mode}
													onChange={(e) =>
														updateInstance(inst.id, (prev) => ({
															...prev,
															schedule: {
																...prev.schedule,
																mode: e.target.value as ScheduleMode,
																isScheduledActive: false,
																countdownSeconds: 0,
															},
														}))
													}
													className="px-2 py-1 bg-slate-950 border border-slate-800 rounded text-slate-200"
												>
													<option value="immediate">Immediate</option>
													<option value="delayed">Delayed Start</option>
													<option value="recurring">Recurring Interval</option>
												</select>
											</td>
											<td className="py-3 px-4 font-mono tabular-nums text-slate-300">
												{inst.schedule.mode === 'immediate'
													? 'On demand'
													: inst.schedule.mode === 'delayed'
													? `+${inst.schedule.delaySeconds}s delay`
													: `Every ${inst.schedule.intervalSeconds}s (max ${inst.schedule.maxRuns})`}
											</td>
											<td className="py-3 px-4 font-mono tabular-nums text-right text-slate-300">
												{inst.schedule.runsCompleted}
											</td>
											<td className="py-3 px-4 font-mono tabular-nums text-right text-amber-300">
												{inst.schedule.isScheduledActive
													? `${inst.schedule.countdownSeconds}s`
													: '—'}
											</td>
											<td className="py-3 px-4 text-right space-x-2">
												{inst.schedule.mode !== 'immediate' && (
													<button
														type="button"
														onClick={() =>
															handleToggleInstanceSchedule(inst.id)
														}
														className={`px-2.5 py-1 rounded text-xs font-medium ${
															inst.schedule.isScheduledActive
																? 'bg-red-600/20 text-red-300'
																: 'bg-slate-800 text-slate-200 hover:bg-slate-700'
														}`}
													>
														{inst.schedule.isScheduledActive
															? 'Cancel'
															: 'Arm Timer'}
													</button>
												)}
												<button
													type="button"
													onClick={() => handleRunSingleInstance(inst.id)}
													disabled={inst.status === 'running'}
													className="px-2.5 py-1 rounded text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40"
												>
													Run Now
												</button>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			)}

			{activeTab === 'audit' && (
				<div className="flex-1 min-h-0 overflow-y-auto p-5">
					<div className="max-w-7xl mx-auto space-y-6">
						{/* Interactive Export Results Log & Downloadable Workflow Files/Folders Studio */}
						<WorkflowExportCenter
							instances={instances}
							topology={topology}
							superprompt={superprompt}
							keyRoutingScope={keyRoutingScope}
							environmentTheme={environmentTheme}
							activeGlobalLeaseId={activeGlobalLeaseId}
							lastPurgeReceipt={lastPurgeReceipt}
							auditLog={auditLog}
						/>

						{/* Ephemeral Credential Lease & Safety Audit Receipts Table */}
						<div className="flex items-center justify-between border-b border-slate-800 pb-4 pt-2">
							<div>
								<h2 className="text-sm font-bold text-white">
									Ephemeral Credential Lease & Financial/PII Safety Audit Receipts ({auditLog.length})
								</h2>
								<p className="text-xs text-slate-400 mt-1">
									Verifiable log confirming every workflow lease is
									automatically deleted on completion (0ms post-run retention)
									and tracking all PII & financial redactions.
								</p>
							</div>
							{auditLog.length > 0 && (
								<button
									type="button"
									onClick={() => setAuditLog([])}
									className="px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-900 border border-slate-800 rounded"
								>
									Clear Audit Log
								</button>
							)}
						</div>

						{auditLog.length === 0 ? (
							<div className="p-8 bg-slate-900 border border-slate-800 rounded-lg text-center space-y-3">
								<p className="text-sm font-medium text-slate-300">
									No Completed Lease Purge Receipts Recorded Yet
								</p>
								<p className="text-xs text-slate-500 max-w-md mx-auto">
									You can already browse and download the pre-configured workflow
									folders and results log above, or run the 4-instance workflow
									to record live step runtimes and automatic post-run credential
									deletion receipts.
								</p>
								<button
									type="button"
									onClick={() => {
										setActiveTab('workspace');
										executeAllFourWorkflow();
									}}
									className="px-4 py-2 text-xs font-semibold bg-indigo-600 text-white rounded hover:bg-indigo-500"
								>
									Execute 4-Instance Workflow Now
								</button>
							</div>
						) : (
							<div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
								<table className="w-full text-left border-collapse text-xs">
									<thead>
										<tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60">
											<th className="py-3 px-4 font-medium">
												Ephemeral Lease ID
											</th>
											<th className="py-3 px-4 font-medium">Workflow Scope</th>
											<th className="py-3 px-4 font-medium">Models Executed</th>
											<th className="py-3 px-4 font-medium text-right">
												Steps Run
											</th>
											<th className="py-3 px-4 font-medium text-right">
												PII / Fin Redactions
											</th>
											<th className="py-3 px-4 font-medium text-right">
												Total Runtime
											</th>
											<th className="py-3 px-4 font-medium text-right">
												Purged Timestamp
											</th>
											<th className="py-3 px-4 font-medium text-right">
												Credential & Safety State
											</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-slate-800 font-mono tabular-nums">
										{auditLog.map((entry) => (
											<tr key={entry.id} className="hover:bg-slate-800/40">
												<td className="py-3 px-4 text-indigo-400">
													{entry.leaseId}
												</td>
												<td className="py-3 px-4 font-sans text-slate-200">
													{entry.scopeLabel}
												</td>
												<td className="py-3 px-4 text-slate-400">
													{Array.from(new Set(entry.modelsUsed)).join(', ')}
												</td>
												<td className="py-3 px-4 text-right text-slate-300">
													{entry.stepsCompleted}
												</td>
												<td className="py-3 px-4 text-right text-emerald-400">
													{entry.redactionsApplied} masked
												</td>
												<td className="py-3 px-4 text-right text-slate-200">
													{entry.totalDurationMs.toLocaleString()}ms
												</td>
												<td className="py-3 px-4 text-right text-slate-400">
													{new Date(entry.purgedAt).toLocaleTimeString([], {
														hour: '2-digit',
														minute: '2-digit',
														second: '2-digit',
													})}
												</td>
												<td className="py-3 px-4 text-right font-sans font-medium">
													{entry.status === 'BLOCKED_BY_GUARDRAIL' ? (
														<span className="text-red-400">
															Blocked by Guardrail · Key Deleted
														</span>
													) : (
														<span className="text-emerald-400">
															Deleted on Completion (0ms)
														</span>
													)}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</div>
				</div>
			)}

			{/* Bottom Master Workflow Prompt & Scheduler Command Bar */}
			<div className="px-5 py-3 bg-slate-900 border-t border-slate-800 shrink-0">
				<div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
					{/* Prompt Input + Sample Selector */}
					<div className="flex-1 flex flex-col gap-1.5">
						<div className="flex items-center justify-between text-[11px] text-slate-400 flex-wrap gap-2">
							<div className="flex items-center gap-2">
								<span className="font-semibold text-slate-200">
									Master Multi-Agent Workflow Objective
								</span>
								<span aria-hidden="true">·</span>
								<span>
									{CmdOrCtrlKey}+Enter to execute across all 4 agents
								</span>
							</div>
							<div className="flex items-center gap-2.5">
								<span className="text-slate-500">Presets:</span>
								<button
									type="button"
									onClick={() => setSuperprompt(SAMPLE_WORKFLOW_PROMPTS[0])}
									className="text-indigo-400 hover:text-indigo-300 underline-offset-2 hover:underline"
								>
									01. Distributed Rate-Limiter
								</button>
								<button
									type="button"
									onClick={() => setSuperprompt(SAMPLE_WORKFLOW_PROMPTS[1])}
									className="text-emerald-400 hover:text-emerald-300 underline-offset-2 hover:underline"
								>
									02. Financial & PII Guardrail Test
								</button>
								<button
									type="button"
									onClick={() => setSuperprompt(SAMPLE_WORKFLOW_PROMPTS[2])}
									className="text-indigo-400 hover:text-indigo-300 underline-offset-2 hover:underline"
								>
									03. Ledger Migration
								</button>
							</div>
						</div>

						<textarea
							rows={2}
							value={superprompt}
							onChange={(e) => setSuperprompt(e.target.value)}
							onKeyDown={(e) => {
								if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
									e.preventDefault();
									executeAllFourWorkflow();
								}
							}}
							placeholder="Enter a workflow objective to execute across all 4 agents (PII and financial records are automatically protected by per-agent guardrails)..."
							className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-md text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
						/>
					</div>

					{/* Right Action & Master Scheduler Controls */}
					<div className="flex items-center gap-2.5 shrink-0">
						{/* Master Scheduler Quick Selector */}
						<div className="flex flex-col gap-1 bg-slate-950 border border-slate-800 rounded-md p-2 text-xs">
							<div className="flex items-center gap-1.5 text-[11px] text-slate-400">
								<ClockIcon className="w-3.5 h-3.5 text-indigo-400" />
								<span>Workflow Schedule</span>
								{masterRunsCompleted > 0 && (
									<span className="font-mono tabular-nums text-slate-500">
										({masterRunsCompleted} runs)
									</span>
								)}
							</div>
							<div className="flex items-center gap-1.5">
								<select
									value={masterScheduleMode}
									onChange={(e) => {
										setMasterScheduleMode(e.target.value as ScheduleMode);
										setIsMasterScheduled(false);
									}}
									className="px-2 py-1 text-xs bg-slate-900 border border-slate-800 rounded text-slate-200"
								>
									<option value="immediate">Immediate</option>
									<option value="delayed">Delayed (+10s)</option>
									<option value="recurring">Recurring (60s)</option>
								</select>

								{masterScheduleMode !== 'immediate' && (
									<button
										type="button"
										onClick={handleToggleMasterSchedule}
										className={`px-2.5 py-1 rounded text-xs font-medium font-mono tabular-nums whitespace-nowrap shrink-0 ${
											isMasterScheduled
												? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
												: 'bg-slate-800 text-slate-200 hover:bg-slate-700'
										}`}
									>
										{isMasterScheduled ? `${masterCountdown}s` : 'Arm'}
									</button>
								)}
							</div>
						</div>

						{/* PromptCritic Optimizer Modal Trigger */}
						<div className="bg-slate-950 border border-slate-800 rounded-md">
							<PromptCritic
								active={false}
								superprompt={superprompt}
								setSuperprompt={setSuperprompt}
							/>
						</div>

						{/* Primary Execute Button */}
						<button
							type="button"
							onClick={executeAllFourWorkflow}
							disabled={isGlobalRunning || !superprompt.trim()}
							className="h-12 px-5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold rounded-md transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
						>
							{isGlobalRunning ? (
								<>
									<ReloadIcon className="w-4 h-4 animate-spin" />
									<span>Running Steps...</span>
								</>
							) : (
								<>
									<PlayIcon className="w-4 h-4" />
									<span>Run 4-Instance Workflow</span>
								</>
							)}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
