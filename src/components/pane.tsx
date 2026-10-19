import React, { useState } from 'react';
import {
	AgentExecutionStep,
	AGENT_ROLE_PRESETS,
	AVAILABLE_MODELS,
	createDefaultStepSubTasks,
	GeminiModelId,
	GuardrailActionPolicy,
	KeyRoutingScope,
	ScheduleMode,
	WorkflowInstance,
	WorkflowTopology,
} from 'lib/workflowTypes';
import {
	CheckIcon,
	CopyIcon,
	PlusIcon,
	PlayIcon,
	ReloadIcon,
	ResetIcon,
	TrashIcon,
	ClockIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	LockClosedIcon,
	CheckCircledIcon,
} from '@radix-ui/react-icons';

interface InstancePaneProps {
	instance: WorkflowInstance;
	topology: WorkflowTopology;
	onUpdateInstance: (
		id: number,
		updater: (prev: WorkflowInstance) => WorkflowInstance,
	) => void;
	onRunSingleInstance: (id: number) => void;
	onToggleInstanceSchedule: (id: number) => void;
	onResetInstance: (id: number) => void;
	onSendDirectChat: (id: number, message: string) => void;
	isGlobalRunning: boolean;
	keyRoutingScope?: KeyRoutingScope;
	isByokConnected?: boolean;
	onOpenByokConnector?: () => void;
}

export default function Pane({
	instance,
	topology,
	onUpdateInstance,
	onRunSingleInstance,
	onToggleInstanceSchedule,
	onResetInstance,
	onSendDirectChat,
	isGlobalRunning,
	keyRoutingScope = 'shared_four',
	isByokConnected = true,
	onOpenByokConnector,
}: InstancePaneProps) {
	const [showSchedulerConfig, setShowSchedulerConfig] = useState(false);
	const [showAddStepForm, setShowAddStepForm] = useState(false);
	const [newStepTitle, setNewStepTitle] = useState('');
	const [newStepInstruction, setNewStepInstruction] = useState('');
	const [expandedStepIds, setExpandedStepIds] = useState<
		Record<string, boolean>
	>({});
	const [copiedKey, setCopiedKey] = useState<string | null>(null);
	const [directChatInput, setDirectChatInput] = useState('');

	const toggleStepExpand = (stepId: string) => {
		setExpandedStepIds((prev) => ({
			...prev,
			[stepId]: prev[stepId] === undefined ? false : !prev[stepId],
		}));
	};

	const isStepExpanded = (step: AgentExecutionStep) => {
		if (expandedStepIds[step.id] !== undefined) {
			return expandedStepIds[step.id];
		}
		return (
			step.status === 'completed' ||
			step.status === 'running' ||
			step.status === 'error' ||
			step.status === 'blocked'
		);
	};

	const handleCopy = (text: string, key: string) => {
		navigator.clipboard.writeText(text);
		setCopiedKey(key);
		setTimeout(() => setCopiedKey(null), 1800);
	};

	const handleAddStep = () => {
		if (!newStepTitle.trim()) return;
		onUpdateInstance(instance.id, (prev) => {
			const nextNum = prev.steps.length + 1;
			const formattedTitle = newStepTitle.match(/^\d/)
				? newStepTitle.trim()
				: `${String(nextNum).padStart(2, '0')}. ${newStepTitle.trim()}`;
			const stepId = `step-${prev.id}-${Date.now()}`;
			const newStep: AgentExecutionStep = {
				id: stepId,
				stepNumber: nextNum,
				title: formattedTitle,
				instruction:
					newStepInstruction.trim() ||
					'Execute this step and verify all output and safety guardrail constraints.',
				status: 'idle',
				progressPercent: 0,
				elapsedMs: 0,
				currentPhaseLabel: 'Ready for execution',
				subTasks: createDefaultStepSubTasks(stepId),
			};
			return {
				...prev,
				steps: [...prev.steps, newStep],
			};
		});
		setNewStepTitle('');
		setNewStepInstruction('');
		setShowAddStepForm(false);
	};

	const handleDeleteStep = (stepId: string) => {
		onUpdateInstance(instance.id, (prev) => {
			if (prev.steps.length <= 1) return prev;
			const filtered = prev.steps
				.filter((s) => s.id !== stepId)
				.map((s, idx) => ({
					...s,
					stepNumber: idx + 1,
				}));
			return {
				...prev,
				steps: filtered,
			};
		});
	};

	const completedStepsCount = instance.steps.filter(
		(s) => s.status === 'completed',
	).length;
	const runningStep = instance.steps.find((s) => s.status === 'running');
	const totalSteps = instance.steps.length;

	// Compute real-time progress percentage across all steps using active step's live progressPercent
	const activeStepFraction = runningStep
		? Math.min(0.98, Math.max(0.05, (runningStep.progressPercent ?? 45) / 100))
		: 0;
	const progressPercent =
		totalSteps > 0
			? Math.min(
					100,
					Math.round(
						((completedStepsCount + activeStepFraction) / totalSteps) * 100,
					),
				)
			: 0;

	// Compute upstream / downstream handoff label for directional sequence
	const getHandoffTopologyLabel = () => {
		if (instance.id === 1) return 'Entry Node → Hands off to 02';
		if (instance.id === 4) return 'Receives from 03 → Final Output';
		return `Receives 0${instance.id - 1} → Hands off to 0${instance.id + 1}`;
	};

	return (
		<div
			className={`flex flex-col min-h-[480px] bg-slate-900/90 border rounded-lg overflow-hidden transition-colors shadow-sm ${
				instance.status === 'running'
					? 'border-indigo-500/80'
					: instance.status === 'blocked' || instance.status === 'error'
					? 'border-red-500/70'
					: 'border-slate-800'
			}`}
		>
			{/* Top Instance Header */}
			<div className="px-3.5 py-2.5 bg-slate-900 border-b border-slate-800 flex flex-col gap-2 shrink-0">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2 min-w-0">
						<span className="font-mono tabular-nums text-xs font-semibold text-indigo-400 shrink-0">
							0{instance.id}
						</span>
						<h3 className="text-sm font-semibold text-slate-100 truncate">
							{instance.name}
						</h3>
						<span className="text-slate-600" aria-hidden="true">
							·
						</span>
						<span className="text-xs text-slate-400 truncate">
							{getHandoffTopologyLabel()}
						</span>
					</div>

					<div className="flex items-center gap-1.5 shrink-0">
						<button
							type="button"
							onClick={() => setShowSchedulerConfig((v) => !v)}
							className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
								instance.schedule.isScheduledActive
									? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
									: showSchedulerConfig
									? 'bg-slate-800 text-slate-200'
									: 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
							}`}
							title="Configure individual workflow scheduler"
						>
							<ClockIcon className="w-3.5 h-3.5" />
							<span className="font-mono tabular-nums">
								{instance.schedule.isScheduledActive
									? `${instance.schedule.countdownSeconds}s`
									: instance.schedule.mode === 'immediate'
									? 'Schedule'
									: instance.schedule.mode === 'delayed'
									? `+${instance.schedule.delaySeconds}s`
									: `Every ${instance.schedule.intervalSeconds}s`}
							</span>
						</button>

						<button
							type="button"
							onClick={() => onRunSingleInstance(instance.id)}
							disabled={instance.status === 'running' || isGlobalRunning}
							className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded transition-colors whitespace-nowrap shrink-0"
							title="Run this renderance workflow instance now"
						>
							<PlayIcon className="w-3 h-3" />
							<span>{instance.status === 'running' ? 'Running' : 'Run'}</span>
						</button>

						<button
							type="button"
							onClick={() => onResetInstance(instance.id)}
							disabled={instance.status === 'running'}
							className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
							title="Reset steps and runtime metrics"
						>
							<ResetIcon className="w-3.5 h-3.5" />
						</button>
					</div>
				</div>

				{/* Model & Role Selectors */}
				<div className="grid grid-cols-2 gap-2">
					<div>
						<label className="block text-[11px] text-slate-400 mb-0.5">
							Model Instance
						</label>
						<select
							value={instance.model}
							disabled={instance.status === 'running'}
							onChange={(e) =>
								onUpdateInstance(instance.id, (prev) => ({
									...prev,
									model: e.target.value as GeminiModelId,
								}))
							}
							className="w-full px-2 py-1 text-xs bg-slate-950 border border-slate-800 rounded text-slate-200 focus:outline-none focus:border-indigo-500 truncate"
						>
							{AVAILABLE_MODELS.map((m) => (
								<option key={m.id} value={m.id}>
									{m.label} ({m.tier})
								</option>
							))}
						</select>
					</div>

					<div>
						<label className="block text-[11px] text-slate-400 mb-0.5">
							Agent Specialization Role
						</label>
						<select
							value={instance.agentRole}
							disabled={instance.status === 'running'}
							onChange={(e) => {
								const nextRole = e.target.value;
								const preset = AGENT_ROLE_PRESETS.find(
									(p) => p.role === nextRole,
								);
								onUpdateInstance(instance.id, (prev) => ({
									...prev,
									agentRole: nextRole,
									customSystemPrompt: preset
										? preset.defaultSystemPrompt
										: prev.customSystemPrompt,
								}));
							}}
							className="w-full px-2 py-1 text-xs bg-slate-950 border border-slate-800 rounded text-slate-200 focus:outline-none focus:border-indigo-500 truncate"
						>
							{AGENT_ROLE_PRESETS.map((preset) => (
								<option key={preset.role} value={preset.role}>
									{preset.role}
								</option>
							))}
						</select>
					</div>
				</div>

				{/* LIVE AGENT STEP EXECUTION STATUS BAR */}
				<div className="pt-1.5 border-t border-slate-800/90 space-y-1.5">
					<div className="flex items-center justify-between gap-2 text-[11px]">
						<div className="flex items-center gap-1.5 min-w-0 truncate">
							{instance.status === 'running' && runningStep ? (
								<>
									<ReloadIcon className="w-3 h-3 text-amber-300 animate-spin shrink-0" />
									<span className="font-semibold text-amber-300 truncate">
										Step {runningStep.stepNumber}/{totalSteps}:{' '}
										{runningStep.title} ({runningStep.progressPercent ?? 35}%)
									</span>
								</>
							) : instance.status === 'blocked' ? (
								<span className="font-semibold text-red-400 truncate">
									Blocked by Financial / PII Safety Guardrail
								</span>
							) : instance.status === 'error' ? (
								<span className="font-semibold text-red-400 truncate">
									Execution Halted on Step Error
								</span>
							) : instance.status === 'completed' ? (
								<span className="font-medium text-emerald-400 truncate">
									All {totalSteps} Steps Completed (100%) · Handoff Ready
								</span>
							) : (
								<span className="text-slate-400 truncate">
									Step Pipeline Ready ({completedStepsCount}/{totalSteps}{' '}
									completed)
								</span>
							)}
						</div>

						<div className="flex items-center gap-1.5 font-mono tabular-nums shrink-0 text-slate-300">
							<span className="font-semibold text-amber-300">
								{progressPercent}%
							</span>
							<span aria-hidden="true">·</span>
							<span>
								{(
									instance.totalRuntimeMs + (runningStep?.elapsedMs || 0)
								).toLocaleString()}
								ms
							</span>
						</div>
					</div>

					{/* Segmented Step Progress Bar with Proportional Real-Time Fill */}
					<div
						className="grid gap-1.5 w-full h-2"
						style={{
							gridTemplateColumns: `repeat(${Math.max(1, totalSteps)}, minmax(0, 1fr))`,
						}}
					>
						{instance.steps.map((step) => {
							const stepPct =
								step.status === 'completed'
									? 100
									: step.status === 'running'
									? Math.max(8, Math.min(98, step.progressPercent ?? 40))
									: step.status === 'error' || step.status === 'blocked'
									? 100
									: 0;

							let fillClass = 'bg-slate-700';
							if (step.status === 'completed') {
								fillClass = 'bg-emerald-500';
							} else if (step.status === 'running') {
								fillClass = 'step-progress-active-bar';
							} else if (
								step.status === 'error' ||
								step.status === 'blocked'
							) {
								fillClass = 'bg-red-500';
							}

							return (
								<div
									key={step.id}
									title={`${step.title}: ${step.status} (${stepPct}%)`}
									className="h-full w-full bg-slate-950 border border-slate-800 rounded-full overflow-hidden"
								>
									<div
										className={`h-full rounded-full transition-all duration-150 ${fillClass}`}
										style={{ width: `${stepPct}%` }}
									/>
								</div>
							);
						})}
					</div>

					{/* Ephemeral BYOK Lease & Guardrail Respect Status Line */}
					<div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
						<div className="flex items-center gap-1.5 truncate">
							<LockClosedIcon className="w-3 h-3 text-emerald-400 shrink-0" />
							<span className="truncate">
								PII: {instance.guardrails.piiPolicy.toUpperCase()} · Fin:{' '}
								{instance.guardrails.financialPolicy.toUpperCase()}
								{instance.totalRedactionsCount > 0
									? ` (${instance.totalRedactionsCount} masked)`
									: ''}
							</span>
						</div>

						<button
							type="button"
							onClick={onOpenByokConnector}
							className="flex items-center gap-1 font-mono tabular-nums text-[10px] shrink-0 hover:underline"
							title="Open Front-End BYOK & Ephemeral Lease Connector"
						>
							<span
								className={
									instance.leaseStatus === 'active'
										? 'text-amber-300 font-semibold'
										: instance.leaseStatus === 'purged'
										? 'text-emerald-400'
										: isByokConnected
										? 'text-indigo-400'
										: 'text-slate-400'
								}
							>
								{instance.leaseStatus === 'active'
									? `BYOK Lease Active (${instance.leaseId?.slice(0, 10)})`
									: instance.leaseStatus === 'purged'
									? 'BYOK Key Auto-Deleted (0ms)'
									: keyRoutingScope === 'shared_four'
									? 'BYOK: 1 Key → 4x Shared'
									: `BYOK: Agent 0${instance.id} Lease`}
							</span>
						</button>
					</div>
				</div>
			</div>

			{/* Collapsible Per-Instance Scheduler Panel */}
			{showSchedulerConfig && (
				<div className="px-3.5 py-2.5 bg-slate-950 border-b border-slate-800 space-y-2 text-xs shrink-0">
					<div className="flex items-center justify-between">
						<span className="font-medium text-slate-200">
							Individual Workflow Scheduler
						</span>
						<span className="font-mono tabular-nums text-slate-400">
							Runs completed: {instance.schedule.runsCompleted}
						</span>
					</div>

					<div className="grid grid-cols-3 gap-2">
						<div>
							<label className="block text-[11px] text-slate-400 mb-0.5">
								Trigger Mode
							</label>
							<select
								value={instance.schedule.mode}
								onChange={(e) =>
									onUpdateInstance(instance.id, (prev) => ({
										...prev,
										schedule: {
											...prev.schedule,
											mode: e.target.value as ScheduleMode,
											isScheduledActive: false,
											countdownSeconds: 0,
										},
									}))
								}
								className="w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded text-slate-200"
							>
								<option value="immediate">Immediate</option>
								<option value="delayed">Delayed Start</option>
								<option value="recurring">Recurring Interval</option>
							</select>
						</div>

						{instance.schedule.mode === 'delayed' && (
							<div>
								<label className="block text-[11px] text-slate-400 mb-0.5">
									Start Delay (s)
								</label>
								<select
									value={instance.schedule.delaySeconds}
									onChange={(e) =>
										onUpdateInstance(instance.id, (prev) => ({
											...prev,
											schedule: {
												...prev.schedule,
												delaySeconds: Number(e.target.value),
											},
										}))
									}
									className="w-full px-2 py-1 font-mono tabular-nums bg-slate-900 border border-slate-800 rounded text-slate-200"
								>
									<option value={5}>5 seconds</option>
									<option value={10}>10 seconds</option>
									<option value={30}>30 seconds</option>
									<option value={60}>60 seconds</option>
								</select>
							</div>
						)}

						{instance.schedule.mode === 'recurring' && (
							<>
								<div>
									<label className="block text-[11px] text-slate-400 mb-0.5">
										Interval (s)
									</label>
									<select
										value={instance.schedule.intervalSeconds}
										onChange={(e) =>
											onUpdateInstance(instance.id, (prev) => ({
												...prev,
												schedule: {
													...prev.schedule,
													intervalSeconds: Number(e.target.value),
												},
											}))
										}
										className="w-full px-2 py-1 font-mono tabular-nums bg-slate-900 border border-slate-800 rounded text-slate-200"
									>
										<option value={15}>Every 15s</option>
										<option value={30}>Every 30s</option>
										<option value={60}>Every 60s</option>
										<option value={300}>Every 5m</option>
									</select>
								</div>
								<div>
									<label className="block text-[11px] text-slate-400 mb-0.5">
										Max Iterations
									</label>
									<select
										value={instance.schedule.maxRuns}
										onChange={(e) =>
											onUpdateInstance(instance.id, (prev) => ({
												...prev,
												schedule: {
													...prev.schedule,
													maxRuns: Number(e.target.value),
												},
											}))
										}
										className="w-full px-2 py-1 font-mono tabular-nums bg-slate-900 border border-slate-800 rounded text-slate-200"
									>
										<option value={2}>2 runs</option>
										<option value={3}>3 runs</option>
										<option value={5}>5 runs</option>
										<option value={10}>10 runs</option>
									</select>
								</div>
							</>
						)}
					</div>

					{instance.schedule.mode !== 'immediate' && (
						<div className="flex items-center justify-between pt-1">
							<span className="text-[11px] text-slate-400 font-mono tabular-nums">
								{instance.schedule.isScheduledActive
									? `Scheduled trigger in ${instance.schedule.countdownSeconds}s`
									: 'Timer armed ready'}
							</span>
							<button
								type="button"
								onClick={() => onToggleInstanceSchedule(instance.id)}
								className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
									instance.schedule.isScheduledActive
										? 'bg-red-600/20 text-red-300 border border-red-500/40 hover:bg-red-600/30'
										: 'bg-indigo-600 text-white hover:bg-indigo-500'
								}`}
							>
								{instance.schedule.isScheduledActive
									? 'Cancel Schedule'
									: 'Arm Instance Timer'}
							</button>
						</div>
					)}
				</div>
			)}

			{/* Segmented View Control: Steps | System Prompt | Guardrails | Chat */}
			<div className="px-3.5 py-1.5 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
				<div className="flex items-center gap-1 p-0.5 bg-slate-900 border border-slate-800 rounded-md overflow-x-auto">
					<button
						type="button"
						onClick={() =>
							onUpdateInstance(instance.id, (prev) => ({
								...prev,
								viewMode: 'steps',
							}))
						}
						className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
							instance.viewMode === 'steps'
								? 'bg-slate-800 text-white'
								: 'text-slate-400 hover:text-slate-200'
						}`}
					>
						Steps ({instance.steps.length})
					</button>
					<button
						type="button"
						onClick={() =>
							onUpdateInstance(instance.id, (prev) => ({
								...prev,
								viewMode: 'prompt',
							}))
						}
						className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
							instance.viewMode === 'prompt'
								? 'bg-slate-800 text-white'
								: 'text-slate-400 hover:text-slate-200'
						}`}
					>
						System Prompt
					</button>
					<button
						type="button"
						onClick={() =>
							onUpdateInstance(instance.id, (prev) => ({
								...prev,
								viewMode: 'guardrails',
							}))
						}
						className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
							instance.viewMode === 'guardrails'
								? 'bg-slate-800 text-white'
								: 'text-slate-400 hover:text-slate-200'
						}`}
					>
						Guardrails
					</button>
					<button
						type="button"
						onClick={() =>
							onUpdateInstance(instance.id, (prev) => ({
								...prev,
								viewMode: 'chat',
							}))
						}
						className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
							instance.viewMode === 'chat'
								? 'bg-slate-800 text-white'
								: 'text-slate-400 hover:text-slate-200'
						}`}
					>
						Chat ({instance.chatHistory.length})
					</button>
				</div>

				{instance.viewMode === 'steps' && (
					<button
						type="button"
						onClick={() => setShowAddStepForm((v) => !v)}
						disabled={instance.status === 'running'}
						className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-indigo-400 hover:text-indigo-300 disabled:opacity-40 whitespace-nowrap shrink-0"
					>
						<PlusIcon className="w-3 h-3" />
						<span>Step</span>
					</button>
				)}
			</div>

			{/* Add Custom Step Form */}
			{showAddStepForm && instance.viewMode === 'steps' && (
				<div className="p-3 bg-slate-950 border-b border-slate-800 space-y-2 shrink-0">
					<input
						type="text"
						value={newStepTitle}
						onChange={(e) => setNewStepTitle(e.target.value)}
						placeholder="Step title (e.g., 04. Edge-Case Verification)"
						className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded text-slate-100 focus:outline-none focus:border-indigo-500"
					/>
					<textarea
						rows={2}
						value={newStepInstruction}
						onChange={(e) => setNewStepInstruction(e.target.value)}
						placeholder="Specific directive for this execution step..."
						className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded text-slate-100 focus:outline-none focus:border-indigo-500 resize-none"
					/>
					<div className="flex justify-end gap-2">
						<button
							type="button"
							onClick={() => setShowAddStepForm(false)}
							className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={handleAddStep}
							className="px-3 py-1 text-xs font-medium bg-indigo-600 text-white rounded hover:bg-indigo-500"
						>
							Append Step
						</button>
					</div>
				</div>
			)}

			{/* Main Viewport: 1) Multi-Step Agent Pipeline */}
			{instance.viewMode === 'steps' && (
				<div className="flex-1 min-h-[260px] overflow-y-auto p-3 space-y-2.5 divide-y divide-slate-800/60">
					{/* Visible Handoff Context Banner */}
					{instance.receivedHandoffFrom && (
						<div className="p-2 bg-indigo-950/30 border border-indigo-800/50 rounded text-[11px] text-indigo-200 flex items-center justify-between">
							<span className="truncate">
								Handoff Received: {instance.receivedHandoffFrom}
							</span>
							<span className="font-mono text-[10px] text-emerald-400 shrink-0 ml-2">
								Sanitized
							</span>
						</div>
					)}

					{instance.steps.map((step) => {
						const expanded = isStepExpanded(step);
						const livePct =
							step.status === 'completed'
								? 100
								: step.status === 'running'
								? Math.max(8, Math.min(98, step.progressPercent ?? 45))
								: step.status === 'error' || step.status === 'blocked'
								? 100
								: 0;
						const subTasks =
							step.subTasks && step.subTasks.length > 0
								? step.subTasks
								: createDefaultStepSubTasks(step.id);

						return (
							<div
								key={step.id}
								className={`pt-2.5 first:pt-0 flex flex-col gap-1.5 rounded-md transition-colors ${
									step.status === 'running'
										? 'p-2.5 bg-slate-950/90 border border-amber-500/50'
										: ''
								}`}
							>
								<div className="flex items-start justify-between gap-2">
									<button
										type="button"
										onClick={() => toggleStepExpand(step.id)}
										className="flex items-center gap-1.5 text-left min-w-0 group"
									>
										{expanded ? (
											<ChevronUpIcon className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 shrink-0" />
										) : (
											<ChevronDownIcon className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 shrink-0" />
										)}
										<span className="text-xs font-semibold text-slate-100 group-hover:text-indigo-300 transition-colors truncate">
											{step.title}
										</span>
									</button>

									<div className="flex items-center gap-2 shrink-0 text-[11px] font-mono tabular-nums">
										<span
											className={
												step.status === 'completed'
													? 'text-emerald-400 font-semibold'
													: step.status === 'running'
													? 'text-amber-300 font-semibold'
													: step.status === 'error' ||
													  step.status === 'blocked'
													? 'text-red-400 font-semibold'
													: step.status === 'queued'
													? 'text-slate-400'
													: 'text-slate-500'
											}
										>
											{step.status === 'completed'
												? '100% · Completed'
												: step.status === 'running'
												? `${livePct}% · Executing`
												: step.status === 'blocked'
												? 'Blocked'
												: step.status === 'error'
												? 'Failed'
												: step.status === 'queued'
												? '0% · Queued'
												: '0% · Ready'}
										</span>

										{(step.durationMs !== undefined ||
											(step.status === 'running' &&
												step.elapsedMs !== undefined)) && (
											<>
												<span className="text-slate-600" aria-hidden="true">
													·
												</span>
												<span className="text-slate-300">
													{(
														step.durationMs ??
														step.elapsedMs ??
														0
													).toLocaleString()}
													ms
												</span>
											</>
										)}

										{instance.steps.length > 1 &&
											instance.status !== 'running' && (
												<button
													type="button"
													onClick={() => handleDeleteStep(step.id)}
													className="text-slate-600 hover:text-red-400 transition-colors ml-1"
													title="Remove step"
												>
													<TrashIcon className="w-3.5 h-3.5" />
												</button>
											)}
									</div>
								</div>

								{/* Step Directive */}
								<p className="text-xs text-slate-400 leading-relaxed pl-5">
									{step.instruction}
								</p>

								{/* DETAILED REAL-TIME PROGRESS BAR WITHIN EVERY STEP (Highlighted when Active) */}
								<div className="pl-5 pt-0.5 space-y-1.5">
									<div className="flex items-center justify-between text-[10px] font-mono tabular-nums">
										<span
											className={
												step.status === 'running'
													? 'text-amber-300 font-medium truncate'
													: step.status === 'completed'
													? 'text-emerald-400 truncate'
													: 'text-slate-500 truncate'
											}
										>
											{step.status === 'running'
												? step.currentPhaseLabel ||
												  'Executing real-time agent task pipeline...'
												: step.status === 'completed'
												? 'All 4 step sub-tasks verified & completed'
												: step.status === 'queued'
												? 'Queued in agent execution pipeline'
												: 'Awaiting step execution trigger'}
										</span>
										<span className="text-slate-400 shrink-0 ml-2">
											{livePct}%
										</span>
									</div>

									{/* High-precision linear progress track */}
									<div className="w-full h-2 bg-slate-950 border border-slate-800 rounded-full overflow-hidden">
										<div
											className={`h-full rounded-full transition-all duration-150 ${
												step.status === 'completed'
													? 'bg-emerald-500'
													: step.status === 'running'
													? 'step-progress-active-bar'
													: step.status === 'error' ||
													  step.status === 'blocked'
													? 'bg-red-500'
													: 'bg-slate-700'
											}`}
											style={{ width: `${livePct}%` }}
										/>
									</div>

									{/* Detailed 4-Stage Micro-Task Progress Breakdown for Active or Expanded Step */}
									{(step.status === 'running' ||
										(expanded && step.status === 'completed')) && (
										<div className="grid grid-cols-2 gap-1.5 pt-1">
											{subTasks.map((sub, subIdx) => {
												const isSubDone =
													step.status === 'completed' ||
													sub.status === 'done';
												const isSubActive =
													step.status === 'running' &&
													sub.status === 'active';
												const subPct = isSubDone
													? 100
													: isSubActive
													? Math.min(
															95,
															Math.max(
																20,
																((livePct - subIdx * 25) / 25) * 100,
															),
													  )
													: 0;

												return (
													<div
														key={sub.id}
														className={`p-1.5 rounded border text-[10px] space-y-1 ${
															isSubActive
																? 'bg-slate-900 border-amber-500/50 text-amber-200'
																: isSubDone
																? 'bg-slate-900/70 border-emerald-700/40 text-emerald-300'
																: 'bg-slate-900/40 border-slate-800 text-slate-500'
														}`}
													>
														<div className="flex items-center justify-between gap-1">
															<div className="flex items-center gap-1 min-w-0 truncate">
																{isSubDone ? (
																	<CheckCircledIcon className="w-3 h-3 text-emerald-400 shrink-0" />
																) : isSubActive ? (
																	<ReloadIcon className="w-3 h-3 text-amber-300 animate-spin shrink-0" />
																) : (
																	<span className="w-2 h-2 rounded-full bg-slate-700 shrink-0" />
																)}
																<span className="truncate font-medium">
																	{subIdx + 1}. {sub.label}
																</span>
															</div>
															<span className="font-mono tabular-nums text-[9px] shrink-0">
																{Math.round(subPct)}%
															</span>
														</div>
														<div className="w-full h-1 bg-slate-950 rounded-full overflow-hidden">
															<div
																className={`h-full rounded-full transition-all duration-150 ${
																	isSubDone
																		? 'bg-emerald-500'
																		: isSubActive
																		? 'step-progress-active-bar'
																		: 'bg-slate-800'
																}`}
																style={{ width: `${subPct}%` }}
															/>
														</div>
													</div>
												);
											})}
										</div>
									)}
								</div>

								{/* Step Execution Results */}
								{expanded &&
									(step.status === 'error' || step.status === 'blocked') &&
									step.error && (
										<div className="ml-5 mt-1 p-2.5 bg-red-950/40 border border-red-800/60 rounded text-xs text-red-300">
											{step.error}
										</div>
									)}

								{expanded &&
									step.status === 'completed' &&
									step.executionOutput && (
										<div className="ml-5 mt-1 p-3 bg-slate-950 border border-slate-800 rounded space-y-2 text-xs">
											{step.reasoningSummary && (
												<div className="text-slate-300">
													<span className="font-semibold text-slate-200">
														Strategy:{' '}
													</span>
													{step.reasoningSummary}
												</div>
											)}

											<div className="pt-1.5 border-t border-slate-800/80">
												<div className="flex items-center justify-between mb-1">
													<span className="text-[11px] font-medium text-slate-400">
														Step Output Deliverable
													</span>
													<button
														type="button"
														onClick={() =>
															handleCopy(step.executionOutput || '', step.id)
														}
														className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200"
													>
														{copiedKey === step.id ? (
															<>
																<CheckIcon className="w-3 h-3 text-emerald-400" />
																<span className="text-emerald-400">Copied</span>
															</>
														) : (
															<>
																<CopyIcon className="w-3 h-3" />
																<span>Copy</span>
															</>
														)}
													</button>
												</div>
												<div className="text-slate-200 whitespace-pre-wrap font-sans leading-relaxed max-h-56 overflow-y-auto pr-1">
													{step.executionOutput}
												</div>
											</div>

											{(step.verificationCheck || step.guardrailSummary) && (
												<div className="pt-1.5 border-t border-slate-800/80 flex flex-col gap-1 text-[11px]">
													{step.verificationCheck && (
														<div className="flex items-center justify-between text-emerald-400">
															<span className="truncate">
																Verified: {step.verificationCheck}
															</span>
															{step.completedAt && (
																<span className="font-mono tabular-nums text-slate-500 shrink-0 ml-2">
																	{new Date(
																		step.completedAt,
																	).toLocaleTimeString([], {
																		hour: '2-digit',
																		minute: '2-digit',
																		second: '2-digit',
																	})}
																</span>
															)}
														</div>
													)}
													{step.guardrailSummary && (
														<div className="text-slate-400 font-mono text-[10px]">
															{step.guardrailSummary}
														</div>
													)}
												</div>
											)}
										</div>
									)}
							</div>
						);
					})}
				</div>
			)}

			{/* Main Viewport: 2) Unique Per-Agent System Prompt Editor */}
			{instance.viewMode === 'prompt' && (
				<div className="flex-1 min-h-[260px] overflow-y-auto p-3.5 space-y-3 text-xs">
					<div className="flex items-center justify-between">
						<div>
							<h4 className="font-semibold text-slate-100">
								Unique Agent System Prompt ({instance.name})
							</h4>
							<p className="text-[11px] text-slate-400 mt-0.5">
								Customize the persona, instructions, and handoff behavior
								specifically for this agent instance.
							</p>
						</div>
						<button
							type="button"
							onClick={() => {
								const preset = AGENT_ROLE_PRESETS.find(
									(p) => p.role === instance.agentRole,
								);
								if (preset) {
									onUpdateInstance(instance.id, (prev) => ({
										...prev,
										customSystemPrompt: preset.defaultSystemPrompt,
									}));
								}
							}}
							className="px-2 py-1 text-[11px] text-indigo-400 hover:text-indigo-300 bg-slate-950 border border-slate-800 rounded shrink-0"
						>
							Reset to Role Default
						</button>
					</div>

					<textarea
						rows={8}
						value={instance.customSystemPrompt}
						disabled={instance.status === 'running'}
						onChange={(e) =>
							onUpdateInstance(instance.id, (prev) => ({
								...prev,
								customSystemPrompt: e.target.value,
							}))
						}
						placeholder="Enter the unique system prompt instructions for this agent..."
						className="w-full p-2.5 text-xs font-mono leading-relaxed bg-slate-950 border border-slate-800 rounded text-slate-100 focus:outline-none focus:border-indigo-500 resize-y"
					/>

					<div className="p-2.5 bg-slate-950 border border-slate-800 rounded space-y-1.5 text-[11px] text-slate-400">
						<div className="font-medium text-slate-300">
							Handoff & Execution Role in Active Topology ({topology}):
						</div>
						<p>{getHandoffTopologyLabel()}</p>
						<p className="text-emerald-400/90">
							Mandatory financial & personal information safety directives are
							automatically appended to this system prompt at execution time.
						</p>
					</div>
				</div>
			)}

			{/* Main Viewport: 3) Permissions & Safety Guardrails (Financial & PII Respect) */}
			{instance.viewMode === 'guardrails' && (
				<div className="flex-1 min-h-[260px] overflow-y-auto p-3.5 space-y-3.5 text-xs">
					<div>
						<h4 className="font-semibold text-slate-100">
							Permissions & Data Safety Guardrails
						</h4>
						<p className="text-[11px] text-slate-400 mt-0.5">
							Configure how {instance.name} handles personal information (PII)
							and sensitive financial records during step execution and agent
							handoffs.
						</p>
					</div>

					<div className="space-y-2.5 bg-slate-950 p-3 border border-slate-800 rounded">
						<div>
							<label className="block text-[11px] font-medium text-slate-300 mb-1">
								Financial Data Protection Policy (Card PAN, Account/Routing,
								IBAN)
							</label>
							<select
								value={instance.guardrails.financialPolicy}
								disabled={instance.status === 'running'}
								onChange={(e) =>
									onUpdateInstance(instance.id, (prev) => ({
										...prev,
										guardrails: {
											...prev.guardrails,
											financialPolicy: e.target.value as GuardrailActionPolicy,
										},
									}))
								}
								className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200"
							>
								<option value="mask">
									Auto-Redact & Mask Financial Identifiers (Recommended)
								</option>
								<option value="block">
									Strict Block Execution if Raw Financial Data Detected
								</option>
								<option value="audit">
									Audit & Log Only (Pass with Compliance Notice)
								</option>
							</select>
						</div>

						<div>
							<label className="block text-[11px] font-medium text-slate-300 mb-1">
								Personal Information (PII) Policy (SSN, Email, Phone, IDs)
							</label>
							<select
								value={instance.guardrails.piiPolicy}
								disabled={instance.status === 'running'}
								onChange={(e) =>
									onUpdateInstance(instance.id, (prev) => ({
										...prev,
										guardrails: {
											...prev.guardrails,
											piiPolicy: e.target.value as GuardrailActionPolicy,
										},
									}))
								}
								className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200"
							>
								<option value="mask">
									Auto-Redact & Mask Personal Identifiers (Recommended)
								</option>
								<option value="block">
									Strict Block Execution if Raw PII Detected
								</option>
								<option value="audit">
									Audit & Log Only (Pass with Privacy Notice)
								</option>
							</select>
						</div>

						<label className="flex items-start gap-2 pt-1 cursor-pointer">
							<input
								type="checkbox"
								checked={instance.guardrails.sanitizeHandoffs}
								disabled={instance.status === 'running'}
								onChange={(e) =>
									onUpdateInstance(instance.id, (prev) => ({
										...prev,
										guardrails: {
											...prev.guardrails,
											sanitizeHandoffs: e.target.checked,
										},
									}))
								}
								className="mt-0.5 rounded border-slate-700 bg-slate-900 text-indigo-600"
							/>
							<span className="text-[11px] text-slate-300 leading-snug">
								Sanitize inter-agent handoffs (scrub sensitive financial/PII
								tokens before receiving or passing deliverables downstream)
							</span>
						</label>

						<label className="flex items-start gap-2 cursor-pointer">
							<input
								type="checkbox"
								checked={instance.guardrails.enforceReadOnlyFinancials}
								disabled={instance.status === 'running'}
								onChange={(e) =>
									onUpdateInstance(instance.id, (prev) => ({
										...prev,
										guardrails: {
											...prev.guardrails,
											enforceReadOnlyFinancials: e.target.checked,
										},
									}))
								}
								className="mt-0.5 rounded border-slate-700 bg-slate-900 text-indigo-600"
							/>
							<span className="text-[11px] text-slate-300 leading-snug">
								Enforce Read-Only Financial Compliance Permission (prevent
								unauthorized transactional execution or raw credential storage)
							</span>
						</label>
					</div>

					<div className="p-2.5 bg-slate-950 border border-slate-800 rounded flex items-center justify-between text-[11px]">
						<span className="text-slate-400">
							Sensitive items masked by this agent:
						</span>
						<span className="font-mono tabular-nums font-semibold text-emerald-400">
							{instance.totalRedactionsCount} items protected
						</span>
					</div>
				</div>
			)}

			{/* Main Viewport: 4) Direct Interactive Chat View */}
			{instance.viewMode === 'chat' && (
				<div className="flex-1 min-h-[260px] flex flex-col overflow-hidden">
					<div className="flex-1 overflow-y-auto p-3 space-y-3">
						{instance.chatHistory.length === 0 ? (
							<div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-500 text-xs">
								<p className="font-medium text-slate-400 mb-1">
									Direct Instance Conversation ({instance.model})
								</p>
								<p>
									Send a message below to query {instance.name} with its unique
									system prompt, active PII/financial guardrails, and automatic
									post-turn key lease deletion.
								</p>
							</div>
						) : (
							instance.chatHistory.map((turn) => (
								<div
									key={turn.id}
									className={`flex flex-col ${
										turn.role === 'user' ? 'items-end' : 'items-start'
									}`}
								>
									<div className="flex items-center gap-1.5 mb-1 text-[11px] text-slate-500 font-mono tabular-nums">
										<span>
											{turn.role === 'user' ? 'You' : instance.name}
										</span>
										<span aria-hidden="true">·</span>
										<span>{turn.timestamp}</span>
										{turn.durationMs !== undefined && (
											<>
												<span aria-hidden="true">·</span>
												<span>{turn.durationMs}ms</span>
											</>
										)}
									</div>
									<div
										className={`max-w-[92%] rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
											turn.role === 'user'
												? 'bg-indigo-600 text-white'
												: 'bg-slate-950 text-slate-200 border border-slate-800'
										}`}
									>
										{turn.content}
									</div>
									{turn.guardrailNote && (
										<span className="text-[10px] text-emerald-400 font-mono mt-0.5">
											{turn.guardrailNote}
										</span>
									)}
								</div>
							))
						)}
					</div>

					<div className="p-2.5 bg-slate-950 border-t border-slate-800 flex items-center gap-2">
						<input
							type="text"
							value={directChatInput}
							onChange={(e) => setDirectChatInput(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter' && !e.shiftKey) {
									e.preventDefault();
									if (directChatInput.trim()) {
										onSendDirectChat(instance.id, directChatInput.trim());
										setDirectChatInput('');
									}
								}
							}}
							placeholder={`Ask ${instance.name} (${instance.model})...`}
							className="flex-1 px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded text-slate-100 focus:outline-none focus:border-indigo-500"
						/>
						<button
							type="button"
							onClick={() => {
								if (directChatInput.trim()) {
									onSendDirectChat(instance.id, directChatInput.trim());
									setDirectChatInput('');
								}
							}}
							disabled={!directChatInput.trim() || instance.status === 'running'}
							className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded transition-colors whitespace-nowrap shrink-0"
						>
							Send
						</button>
					</div>
				</div>
			)}

			{/* Bottom Agent Workflow Footer Bar */}
			{instance.viewMode !== 'chat' && (
				<div className="px-3.5 py-2 bg-slate-950/90 border-t border-slate-800/90 flex items-center justify-between gap-2 text-[11px] text-slate-400 shrink-0">
					<span className="truncate font-mono tabular-nums">
						{completedStepsCount}/{totalSteps} steps done ·{' '}
						{getHandoffTopologyLabel()}
					</span>
					<div className="flex items-center gap-2 shrink-0">
						{instance.viewMode === 'steps' && (
							<button
								type="button"
								onClick={() => setShowAddStepForm((v) => !v)}
								disabled={instance.status === 'running'}
								className="text-indigo-400 hover:text-indigo-300 font-medium disabled:opacity-40 whitespace-nowrap"
							>
								+ Add Step
							</button>
						)}
						<button
							type="button"
							onClick={() => onRunSingleInstance(instance.id)}
							disabled={instance.status === 'running' || isGlobalRunning}
							className="text-emerald-400 hover:text-emerald-300 font-medium disabled:opacity-40 whitespace-nowrap"
						>
							{instance.status === 'running' ? 'Running...' : 'Run Agent 0' + instance.id}
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

