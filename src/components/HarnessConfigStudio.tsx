import React, { useState } from 'react';
import {
	AgentHarnessConfig,
	ATTACHED_HARNESS_ASSET_PATH,
	CANONICAL_OC_HARNESS_CONFIG,
	computeHarnessValidationCensus,
	createDefaultAgentHarness,
	evaluateGcloudDeployMonitor,
	HarnessSubstrate,
	parseHarnessConfigJson,
	WORKFLOW_HARNESS_PRESETS,
} from 'lib/harnessConfig';
import { WorkflowInstance } from 'lib/workflowTypes';
import {
	CheckCircledIcon,
	CheckIcon,
	CopyIcon,
	DownloadIcon,
	FileTextIcon,
	PlusIcon,
	ReloadIcon,
	ResetIcon,
	TrashIcon,
} from '@radix-ui/react-icons';

interface HarnessConfigStudioProps {
	instances: WorkflowInstance[];
	onUpdateInstance: (
		id: number,
		updater: (prev: WorkflowInstance) => WorkflowInstance,
	) => void;
	onApplyHarnessToAll: (
		config: AgentHarnessConfig,
		optionalSampleObjective?: string,
	) => void;
	onReturnToWorkspace: () => void;
}

export default function HarnessConfigStudio({
	instances,
	onUpdateInstance,
	onApplyHarnessToAll,
	onReturnToWorkspace,
}: HarnessConfigStudioProps) {
	const [selectedTarget, setSelectedTarget] = useState<'all' | number>(1);
	const [selectedFilePath, setSelectedFilePath] =
		useState<string>('systemprompt.md');
	const [newFilePathInput, setNewFilePathInput] = useState<string>('');
	const [showAddFileModal, setShowAddFileModal] = useState<boolean>(false);
	const [showImportJsonModal, setShowImportJsonModal] =
		useState<boolean>(false);
	const [importJsonText, setImportJsonText] = useState<string>('');
	const [importError, setImportError] = useState<string | null>(null);
	const [statusToast, setStatusToast] = useState<string | null>(null);
	const [copiedJson, setCopiedJson] = useState<boolean>(false);
	const [isFetchingAsset, setIsFetchingAsset] = useState<boolean>(false);

	const activeInstance =
		typeof selectedTarget === 'number'
			? instances.find((i) => i.id === selectedTarget) || instances[0]
			: instances[0];

	const activeHarness = activeInstance.harness;
	const editorTree = activeHarness.editorTree;
	const fileKeys = Object.keys(editorTree);
	const effectiveFilePath =
		editorTree[selectedFilePath] !== undefined
			? selectedFilePath
			: fileKeys[0] || 'systemprompt.md';

	const census = computeHarnessValidationCensus(
		editorTree,
		activeHarness.validationCensus.alwaysOnMax,
	);

	const deployCheck = evaluateGcloudDeployMonitor(
		activeHarness.memoryGi ?? 4.0,
		activeHarness.concurrency ?? 8,
		activeHarness.perReqMib ?? 220.0,
	);

	const triggerToast = (msg: string) => {
		setStatusToast(msg);
		setTimeout(() => setStatusToast(null), 2600);
	};

	const updateTargetHarness = (
		updater: (prev: AgentHarnessConfig) => AgentHarnessConfig,
	) => {
		if (selectedTarget === 'all') {
			instances.forEach((inst) => {
				onUpdateInstance(inst.id, (prev) => {
					const nextHarness = updater(prev.harness);
					return {
						...prev,
						harness: {
							...nextHarness,
							validationCensus: computeHarnessValidationCensus(
								nextHarness.editorTree,
								nextHarness.validationCensus.alwaysOnMax,
							),
						},
					};
				});
			});
		} else {
			onUpdateInstance(activeInstance.id, (prev) => {
				const nextHarness = updater(prev.harness);
				return {
					...prev,
					harness: {
						...nextHarness,
						validationCensus: computeHarnessValidationCensus(
							nextHarness.editorTree,
							nextHarness.validationCensus.alwaysOnMax,
						),
					},
				};
			});
		}
	};

	const handleFileContentChange = (newContent: string) => {
		updateTargetHarness((prev) => ({
			...prev,
			exportedAt: new Date().toISOString(),
			editorTree: {
				...prev.editorTree,
				[effectiveFilePath]: newContent,
			},
		}));
	};

	const handleAddFileToTree = () => {
		const trimmed = newFilePathInput.trim().replace(/^\/+/, '');
		if (!trimmed) return;
		let defaultBody = '# New Harness File\n';
		if (trimmed.startsWith('skills/') && trimmed.endsWith('SKILL.md')) {
			const skillName = trimmed.split('/')[1] || 'custom_skill';
			defaultBody = `---\nname: ${skillName}\ndescription: Custom workflow skill for ${skillName}\n---\n\n1. Execute domain-specific steps with strict PII and financial guardrails.\n`;
		} else if (
			trimmed.startsWith('sub_agents/') &&
			trimmed.endsWith('AGENT.md')
		) {
			defaultBody = `---\nmode: subagent\ndescription: Specialized sub-agent for workflow verification\n---\n\nInspect intermediate deliverables and verify schema invariants.\n`;
		} else if (trimmed.startsWith('scripts/')) {
			defaultBody = `# Custom verification script\nprint("Verification OK")\n`;
		}

		updateTargetHarness((prev) => ({
			...prev,
			exportedAt: new Date().toISOString(),
			editorTree: {
				...prev.editorTree,
				[trimmed]: defaultBody,
			},
		}));
		setSelectedFilePath(trimmed);
		setNewFilePathInput('');
		setShowAddFileModal(false);
		triggerToast(`Added ${trimmed} to harness editorTree`);
	};

	const handleDeleteFileFromTree = (pathToDelete: string) => {
		const protectedFiles = ['systemprompt.md', 'guardrails.md'];
		if (protectedFiles.includes(pathToDelete)) return;

		updateTargetHarness((prev) => {
			const nextTree = { ...prev.editorTree };
			delete nextTree[pathToDelete];
			return {
				...prev,
				exportedAt: new Date().toISOString(),
				editorTree: nextTree,
			};
		});
		if (effectiveFilePath === pathToDelete) {
			setSelectedFilePath('systemprompt.md');
		}
		triggerToast(`Removed ${pathToDelete} from editorTree`);
	};

	const handleLoadAttachedAssetJson = async () => {
		setIsFetchingAsset(true);
		try {
			const res = await fetch(ATTACHED_HARNESS_ASSET_PATH);
			if (res.ok) {
				const rawText = await res.text();
				const parsed = parseHarnessConfigJson(rawText);
				onApplyHarnessToAll(parsed);
				triggerToast(
					'Loaded attached harness-configuration-oc_46a97fbf.json across all 4 Agent Workflows',
				);
			} else {
				onApplyHarnessToAll(CANONICAL_OC_HARNESS_CONFIG);
				triggerToast(
					'Applied canonical OC harness2.v1 configuration across all 4 Agent Workflows',
				);
			}
		} catch {
			onApplyHarnessToAll(CANONICAL_OC_HARNESS_CONFIG);
			triggerToast(
				'Applied canonical OC harness2.v1 configuration across all 4 Agent Workflows',
			);
		} finally {
			setIsFetchingAsset(false);
		}
	};

	const handleSyncSystemPromptFromHarness = () => {
		const sysPrompt = editorTree['systemprompt.md']?.trim();
		if (!sysPrompt) return;
		if (selectedTarget === 'all') {
			instances.forEach((inst) => {
				onUpdateInstance(inst.id, (prev) => ({
					...prev,
					customSystemPrompt:
						prev.harness.editorTree['systemprompt.md']?.trim() || sysPrompt,
				}));
			});
			triggerToast(
				'Synchronized systemprompt.md to all 4 Agent System Prompts',
			);
		} else {
			onUpdateInstance(activeInstance.id, (prev) => ({
				...prev,
				customSystemPrompt: sysPrompt,
			}));
			triggerToast(
				`Synchronized systemprompt.md to ${activeInstance.name} System Prompt`,
			);
		}
	};

	const handleExportHarnessJson = () => {
		const exportPayload = {
			schemaVersion: activeHarness.schemaVersion,
			exportedAt: new Date().toISOString(),
			substrate: activeHarness.substrate,
			validationCensus: census,
			editorTree: activeHarness.editorTree,
		};
		const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
			type: 'application/json;charset=utf-8',
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `harness-configuration-${activeHarness.substrate}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	};

	const handleCopyHarnessJson = () => {
		const exportPayload = {
			schemaVersion: activeHarness.schemaVersion,
			exportedAt: activeHarness.exportedAt,
			substrate: activeHarness.substrate,
			validationCensus: census,
			editorTree: activeHarness.editorTree,
		};
		navigator.clipboard.writeText(JSON.stringify(exportPayload, null, 2));
		setCopiedJson(true);
		setTimeout(() => setCopiedJson(false), 1800);
	};

	const handleImportCustomJson = () => {
		setImportError(null);
		try {
			const parsed = parseHarnessConfigJson(importJsonText);
			updateTargetHarness(() => parsed);
			setShowImportJsonModal(false);
			setImportJsonText('');
			triggerToast(
				`Imported ${parsed.schemaVersion} (${parsed.substrate}) configuration`,
			);
		} catch (e: any) {
			setImportError(e?.message || 'Invalid harness2.v1 JSON payload.');
		}
	};

	const budgetPct = Math.min(
		100,
		Math.round((census.alwaysOnChars / census.alwaysOnMax) * 100),
	);

	return (
		<div className="max-w-[1480px] w-full mx-auto px-6 py-8 space-y-8">
			{/* Page Header */}
			<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-6">
				<div className="space-y-1.5">
					<div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
						<span>SCHEMA: {activeHarness.schemaVersion}</span>
						<span aria-hidden="true">·</span>
						<span>SUBSTRATE: {activeHarness.substrate.toUpperCase()}</span>
						<span aria-hidden="true">·</span>
						<span
							className={
								census.valid ? 'text-emerald-400' : 'text-red-400 font-semibold'
							}
						>
							{census.valid ? 'CENSUS VALIDATED' : 'VALIDATION ERRORS'}
						</span>
					</div>
					<h1 className="text-xl font-semibold text-white tracking-tight">
						Agent Workflow Harness Configuration Studio
					</h1>
					<p className="text-sm text-slate-400 max-w-3xl leading-relaxed">
						Configure always-on system prompts, operational guardrails, long-term
						memory, ADK/Bazel skills, sub-agents, MCP servers, and{' '}
						<code className="text-indigo-300 font-mono text-xs">
							gcloud_deploy_monitor.py
						</code>{' '}
						sizing across all 4 directional agent workflows.
					</p>
				</div>

				<div className="flex items-center gap-3 flex-wrap shrink-0">
					<button
						type="button"
						onClick={handleLoadAttachedAssetJson}
						disabled={isFetchingAsset}
						className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-emerald-300 border border-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
						title="Load /assets/aistudio/harness-configuration-oc_46a97fbf.json into all 4 agent workflows"
					>
						{isFetchingAsset ? (
							<ReloadIcon className="w-3.5 h-3.5 animate-spin" />
						) : (
							<FileTextIcon className="w-3.5 h-3.5" />
						)}
						<span>Load Attached OC Harness JSON</span>
					</button>

					<button
						type="button"
						onClick={() => setShowImportJsonModal(true)}
						className="px-3.5 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
					>
						Import JSON
					</button>

					<button
						type="button"
						onClick={handleExportHarnessJson}
						className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
					>
						<DownloadIcon className="w-3.5 h-3.5" />
						<span>Export harness2.v1 JSON</span>
					</button>

					<button
						type="button"
						onClick={onReturnToWorkspace}
						className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors whitespace-nowrap shrink-0"
					>
						Return to Workflow Studio
					</button>
				</div>
			</div>

			{statusToast && (
				<div className="px-4 py-3 rounded-md bg-emerald-950/60 border border-emerald-700/60 text-emerald-200 text-xs flex items-center justify-between">
					<span>{statusToast}</span>
					<button
						type="button"
						onClick={() => setStatusToast(null)}
						className="text-emerald-300 hover:text-white underline text-[11px]"
					>
						Dismiss
					</button>
				</div>
			)}

			{/* Section 1: Workflow Harness Presets */}
			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<h2 className="text-sm font-semibold text-slate-200">
						01. Workflow Harness Presets (Apply to All 4 Agent Renderances)
					</h2>
					<button
						type="button"
						onClick={() => {
							instances.forEach((inst, idx) => {
								onUpdateInstance(inst.id, (prev) => ({
									...prev,
									harness: createDefaultAgentHarness(idx),
								}));
							});
							triggerToast(
								'Reset all 4 agents to role-specialized harness2.v1 configurations',
							);
						}}
						className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
					>
						<ResetIcon className="w-3.5 h-3.5" />
						<span>Reset Per-Role Defaults</span>
					</button>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
					{WORKFLOW_HARNESS_PRESETS.map((preset) => (
						<div
							key={preset.id}
							className="p-5 bg-slate-900/90 border border-slate-800 rounded-lg flex flex-col justify-between gap-4 hover:border-slate-700 transition-colors"
						>
							<div className="space-y-2">
								<div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
									<span>{preset.badge}</span>
									<span className="text-indigo-400">
										substrate: {preset.substrate}
									</span>
								</div>
								<h3 className="text-sm font-semibold text-white leading-snug">
									{preset.title}
								</h3>
								<p className="text-xs text-slate-400 leading-relaxed">
									{preset.description}
								</p>
							</div>

							<div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
								<span className="text-[11px] font-mono tabular-nums text-slate-400">
									{preset.config.validationCensus.nFiles} files ·{' '}
									{preset.config.validationCensus.skills} skills
								</span>
								<div className="flex items-center gap-2">
									<button
										type="button"
										onClick={() => {
											onApplyHarnessToAll(preset.config);
											triggerToast(
												`Applied "${preset.title}" to all 4 agent workflows`,
											);
										}}
										className="px-2.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors whitespace-nowrap"
									>
										Apply Harness
									</button>
									<button
										type="button"
										onClick={() => {
											onApplyHarnessToAll(
												preset.config,
												preset.sampleObjective,
											);
											triggerToast(
												`Applied "${preset.title}" + matching workflow objective`,
											);
										}}
										className="px-2.5 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors whitespace-nowrap"
									>
										Load + Objective
									</button>
								</div>
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Section 2: Target Agent Selector & Harness Validation Census Bar */}
			<div className="p-5 bg-slate-900/90 border border-slate-800 rounded-lg space-y-5">
				<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
					<div className="flex items-center gap-2 flex-wrap">
						<span className="text-xs font-medium text-slate-400 mr-1">
							Editing Scope:
						</span>
						<div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg flex-wrap">
							<button
								type="button"
								onClick={() => setSelectedTarget('all')}
								className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
									selectedTarget === 'all'
										? 'bg-indigo-600 text-white'
										: 'text-slate-400 hover:text-slate-200'
								}`}
							>
								All 4 Agent Workflows (Synchronized)
							</button>
							{instances.map((inst) => (
								<button
									key={inst.id}
									type="button"
									onClick={() => setSelectedTarget(inst.id)}
									className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
										selectedTarget === inst.id
											? 'bg-indigo-600 text-white'
											: 'text-slate-400 hover:text-slate-200'
									}`}
								>
									0{inst.id}. {inst.name} ({inst.harness.substrate})
								</button>
							))}
						</div>
					</div>

					<div className="flex items-center gap-4 flex-wrap text-xs">
						<label className="inline-flex items-center gap-2 cursor-pointer text-slate-200">
							<input
								type="checkbox"
								checked={activeHarness.enabledInWorkflow !== false}
								onChange={(e) =>
									updateTargetHarness((prev) => ({
										...prev,
										enabledInWorkflow: e.target.checked,
									}))
								}
								className="rounded border-slate-700 bg-slate-950 text-indigo-600"
							/>
							<span>Inject Harness Context During Step Execution</span>
						</label>

						<div className="flex items-center gap-2">
							<span className="text-slate-400">Substrate:</span>
							<select
								value={activeHarness.substrate}
								onChange={(e) =>
									updateTargetHarness((prev) => ({
										...prev,
										substrate: e.target.value as HarnessSubstrate,
									}))
								}
								className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono text-xs"
							>
								<option value="oc">oc (OpenCode / ADK)</option>
								<option value="adk">adk (Google Cloud ADK)</option>
								<option value="agent_runtime">
									agent_runtime (:streamQuery)
								</option>
								<option value="cloud_run">cloud_run (A2A Service)</option>
								<option value="gke">gke (Kubernetes A2A)</option>
							</select>
						</div>

						<button
							type="button"
							onClick={handleSyncSystemPromptFromHarness}
							className="px-3 py-1.5 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 text-indigo-300 text-xs font-medium transition-colors whitespace-nowrap"
						>
							Sync systemprompt.md → Agent Prompt
						</button>
					</div>
				</div>

				{/* Validation Census Metrics Grid */}
				<div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 pt-1">
					<div className="p-3 bg-slate-950 border border-slate-800 rounded-md">
						<div className="text-[11px] text-slate-400">Census Status</div>
						<div className="mt-1 flex items-center gap-1.5 font-mono text-xs font-semibold">
							{census.valid ? (
								<>
									<CheckCircledIcon className="w-4 h-4 text-emerald-400 shrink-0" />
									<span className="text-emerald-400">VALID</span>
								</>
							) : (
								<span className="text-red-400">
									{census.errors.length} ERROR(S)
								</span>
							)}
						</div>
					</div>

					<div className="p-3 bg-slate-950 border border-slate-800 rounded-md col-span-2">
						<div className="flex items-center justify-between text-[11px] text-slate-400">
							<span>Always-On Context Budget</span>
							<span className="font-mono tabular-nums text-slate-200">
								{census.alwaysOnChars.toLocaleString()} /{' '}
								{census.alwaysOnMax.toLocaleString()} chars ({budgetPct}%)
							</span>
						</div>
						<div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden mt-2">
							<div
								className={`h-full rounded-full transition-all ${
									budgetPct > 90
										? 'bg-red-500'
										: budgetPct > 70
										? 'bg-amber-500'
										: 'bg-emerald-500'
								}`}
								style={{ width: `${Math.max(4, budgetPct)}%` }}
							/>
						</div>
					</div>

					<div className="p-3 bg-slate-950 border border-slate-800 rounded-md">
						<div className="text-[11px] text-slate-400">Editor Tree Files</div>
						<div className="mt-1 font-mono tabular-nums text-sm font-semibold text-white">
							{census.nFiles} files
						</div>
					</div>

					<div className="p-3 bg-slate-950 border border-slate-800 rounded-md">
						<div className="text-[11px] text-slate-400">Loaded Skills</div>
						<div className="mt-1 font-mono tabular-nums text-sm font-semibold text-indigo-300">
							{census.skills} skills
						</div>
					</div>

					<div className="p-3 bg-slate-950 border border-slate-800 rounded-md">
						<div className="text-[11px] text-slate-400">
							Sub-Agents &amp; Scripts
						</div>
						<div className="mt-1 font-mono tabular-nums text-sm font-semibold text-slate-200">
							{census.subAgents} sub · {census.scripts} script
						</div>
					</div>

					<div className="p-3 bg-slate-950 border border-slate-800 rounded-md">
						<div className="text-[11px] text-slate-400">MCP Servers</div>
						<div className="mt-1 font-mono text-xs font-semibold text-emerald-300 truncate">
							{census.mcpServers.length > 0
								? census.mcpServers.join(', ')
								: 'None'}
						</div>
					</div>
				</div>
			</div>

			{/* Section 3: Two-Column Split — Left: editorTree File Explorer + Deploy Sizing | Right: File Editor */}
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
				{/* Left Column (4 cols): editorTree File Tree & gcloud_deploy_monitor.py Sizing */}
				<div className="lg:col-span-4 space-y-6">
					{/* Virtual File Tree */}
					<div className="bg-slate-900/90 border border-slate-800 rounded-lg overflow-hidden">
						<div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
							<span className="text-xs font-semibold text-slate-200">
								Harness Virtual File Tree ({fileKeys.length})
							</span>
							<button
								type="button"
								onClick={() => setShowAddFileModal((v) => !v)}
								className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-medium"
							>
								<PlusIcon className="w-3.5 h-3.5" />
								<span>Add File</span>
							</button>
						</div>

						{showAddFileModal && (
							<div className="p-3 bg-slate-950 border-b border-slate-800 space-y-2">
								<input
									type="text"
									value={newFilePathInput}
									onChange={(e) => setNewFilePathInput(e.target.value)}
									placeholder="e.g. skills/custom_audit/SKILL.md"
									className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-900 border border-slate-800 rounded text-slate-100 focus:outline-none focus:border-indigo-500"
								/>
								<div className="flex justify-end gap-2">
									<button
										type="button"
										onClick={() => setShowAddFileModal(false)}
										className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200"
									>
										Cancel
									</button>
									<button
										type="button"
										onClick={handleAddFileToTree}
										className="px-3 py-1 text-xs font-medium bg-indigo-600 text-white rounded hover:bg-indigo-500"
									>
										Create
									</button>
								</div>
							</div>
						)}

						<div className="divide-y divide-slate-800/70">
							{fileKeys.map((path) => {
								const isSelected = path === effectiveFilePath;
								const charLen = (editorTree[path] || '').length;
								const isAlwaysOn = [
									'systemprompt.md',
									'guardrails.md',
									'LongTermMEMORY.md',
									'tool_descriptions/tool_guidance.md',
								].includes(path);

								return (
									<div
										key={path}
										className={`px-4 py-2.5 flex items-center justify-between gap-2 text-xs transition-colors ${
											isSelected
												? 'bg-indigo-950/50 text-white'
												: 'hover:bg-slate-800/50 text-slate-300'
										}`}
									>
										<button
											type="button"
											onClick={() => setSelectedFilePath(path)}
											className="flex-1 text-left min-w-0"
										>
											<div className="font-mono text-xs truncate">{path}</div>
											<div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
												<span className="font-mono tabular-nums">
													{charLen} chars
												</span>
												{isAlwaysOn && (
													<>
														<span aria-hidden="true">·</span>
														<span className="text-emerald-400/90">
															Always-On
														</span>
													</>
												)}
											</div>
										</button>

										{path !== 'systemprompt.md' && path !== 'guardrails.md' && (
											<button
												type="button"
												onClick={() => handleDeleteFileFromTree(path)}
												className="text-slate-500 hover:text-red-400 p-1"
												title={`Remove ${path}`}
											>
												<TrashIcon className="w-3.5 h-3.5" />
											</button>
										)}
									</div>
								);
							})}
						</div>
					</div>

					{/* Interactive gcloud_deploy_monitor.py Memory-Concurrency Validator */}
					<div className="p-5 bg-slate-900/90 border border-slate-800 rounded-lg space-y-4">
						<div>
							<h3 className="text-xs font-semibold text-white">
								Deploy Sizing Monitor (scripts/gcloud_deploy_monitor.py)
							</h3>
							<p className="text-[11px] text-slate-400 mt-1">
								Validates <code className="font-mono">--memory</code> and{' '}
								<code className="font-mono">--concurrency</code> headroom (
								<code className="font-mono">
									peak = 512 + concurrency × per_req_mib &lt; 85% limit
								</code>
								).
							</p>
						</div>

						<div className="grid grid-cols-3 gap-3 text-xs">
							<div>
								<label className="block text-[11px] text-slate-400 mb-1">
									Memory (GiB)
								</label>
								<input
									type="number"
									step="0.5"
									min="1"
									max="64"
									value={activeHarness.memoryGi ?? 4}
									onChange={(e) =>
										updateTargetHarness((prev) => ({
											...prev,
											memoryGi: Number(e.target.value),
										}))
									}
									className="w-full px-2.5 py-1.5 font-mono tabular-nums bg-slate-950 border border-slate-800 rounded text-slate-100"
								/>
							</div>

							<div>
								<label className="block text-[11px] text-slate-400 mb-1">
									Concurrency
								</label>
								<input
									type="number"
									min="1"
									max="100"
									value={activeHarness.concurrency ?? 8}
									onChange={(e) =>
										updateTargetHarness((prev) => ({
											...prev,
											concurrency: Number(e.target.value),
										}))
									}
									className="w-full px-2.5 py-1.5 font-mono tabular-nums bg-slate-950 border border-slate-800 rounded text-slate-100"
								/>
							</div>

							<div>
								<label className="block text-[11px] text-slate-400 mb-1">
									Per-Req (MiB)
								</label>
								<input
									type="number"
									step="10"
									min="32"
									max="2048"
									value={activeHarness.perReqMib ?? 220}
									onChange={(e) =>
										updateTargetHarness((prev) => ({
											...prev,
											perReqMib: Number(e.target.value),
										}))
									}
									className="w-full px-2.5 py-1.5 font-mono tabular-nums bg-slate-950 border border-slate-800 rounded text-slate-100"
								/>
							</div>
						</div>

						<div className="p-3 bg-slate-950 border border-slate-800 rounded font-mono text-xs space-y-1.5">
							<div className="flex items-center justify-between">
								<span className="text-slate-400">Monitor Check Result:</span>
								<span
									className={
										deployCheck.ok
											? 'text-emerald-400 font-semibold'
											: 'text-red-400 font-semibold'
									}
								>
									{deployCheck.ok
										? 'OK (Safe < 85% ceiling)'
										: 'OVER BUDGET (> 85% ceiling)'}
								</span>
							</div>
							<div className="flex items-center justify-between text-[11px] text-slate-300 tabular-nums">
								<span>Peak Projected: {deployCheck.peak_mib} MiB</span>
								<span>Container Limit: {deployCheck.limit_mib} MiB</span>
							</div>
							<pre className="text-[11px] text-indigo-300 pt-2 border-t border-slate-900 overflow-x-auto">
								{JSON.stringify(
									{
										ok: deployCheck.ok,
										peak_mib: deployCheck.peak_mib,
										limit_mib: deployCheck.limit_mib,
									},
									null,
									2,
								)}
							</pre>
						</div>
					</div>
				</div>

				{/* Right Column (8 cols): Active File Editor & Full JSON Inspector */}
				<div className="lg:col-span-8 space-y-6">
					<div className="bg-slate-900/90 border border-slate-800 rounded-lg overflow-hidden">
						<div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3">
							<div className="flex items-center gap-2 min-w-0">
								<FileTextIcon className="w-4 h-4 text-indigo-400 shrink-0" />
								<span className="font-mono text-xs font-semibold text-white truncate">
									editorTree[&quot;{effectiveFilePath}&quot;]
								</span>
							</div>
							<div className="flex items-center gap-3 text-xs text-slate-400 font-mono tabular-nums shrink-0">
								<span>{(editorTree[effectiveFilePath] || '').length} chars</span>
								<button
									type="button"
									onClick={handleCopyHarnessJson}
									className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-sans text-xs"
								>
									{copiedJson ? (
										<>
											<CheckIcon className="w-3.5 h-3.5 text-emerald-400" />
											<span className="text-emerald-400">Copied JSON</span>
										</>
									) : (
										<>
											<CopyIcon className="w-3.5 h-3.5" />
											<span>Copy Full harness2.v1 JSON</span>
										</>
									)}
								</button>
							</div>
						</div>

						<div className="p-5 space-y-4">
							<textarea
								rows={16}
								value={editorTree[effectiveFilePath] || ''}
								onChange={(e) => handleFileContentChange(e.target.value)}
								className="w-full p-4 text-xs font-mono leading-relaxed bg-slate-950 border border-slate-800 rounded-md text-slate-100 focus:outline-none focus:border-indigo-500 resize-y"
								placeholder="Edit harness file content..."
							/>

							{census.errors.length > 0 && (
								<div className="p-3 bg-red-950/50 border border-red-800/70 rounded text-xs text-red-200 space-y-1">
									<div className="font-semibold">
										Validation Census Warnings:
									</div>
									{census.errors.map((err, i) => (
										<div key={i}>• {err}</div>
									))}
								</div>
							)}
						</div>
					</div>

					{/* 4-Agent Harness Summary Table */}
					<div className="bg-slate-900/90 border border-slate-800 rounded-lg overflow-hidden">
						<div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
							<h3 className="text-xs font-semibold text-white">
								Per-Agent Workflow Harness Binding Matrix (Renderances 01–04)
							</h3>
							<span className="text-xs text-slate-400">
								Click any row to customize that agent&apos;s harness
							</span>
						</div>

						<table className="w-full text-left border-collapse text-xs">
							<thead>
								<tr className="border-b border-slate-800 text-slate-400 bg-slate-950/50">
									<th className="py-3 px-4 font-medium">Agent Workflow</th>
									<th className="py-3 px-4 font-medium">Substrate</th>
									<th className="py-3 px-4 font-medium text-right">
										Always-On Chars
									</th>
									<th className="py-3 px-4 font-medium text-right">
										Files / Skills
									</th>
									<th className="py-3 px-4 font-medium">MCP Servers</th>
									<th className="py-3 px-4 font-medium text-right">
										Sizing (Mem / Conc)
									</th>
									<th className="py-3 px-4 font-medium text-right">State</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-800">
								{instances.map((inst) => {
									const c = inst.harness.validationCensus;
									const isRowActive = selectedTarget === inst.id;
									return (
										<tr
											key={inst.id}
											onClick={() => setSelectedTarget(inst.id)}
											className={`cursor-pointer transition-colors ${
												isRowActive
													? 'bg-indigo-950/30'
													: 'hover:bg-slate-800/40'
											}`}
										>
											<td className="py-3 px-4 font-medium text-white">
												0{inst.id}. {inst.name} ·{' '}
												<span className="text-slate-400 font-normal">
													{inst.agentRole}
												</span>
											</td>
											<td className="py-3 px-4 font-mono text-indigo-300">
												{inst.harness.substrate}
											</td>
											<td className="py-3 px-4 font-mono tabular-nums text-right text-slate-200">
												{c.alwaysOnChars.toLocaleString()} /{' '}
												{c.alwaysOnMax.toLocaleString()}
											</td>
											<td className="py-3 px-4 font-mono tabular-nums text-right text-slate-300">
												{c.nFiles} files · {c.skills} skills
											</td>
											<td className="py-3 px-4 font-mono text-emerald-300">
												{c.mcpServers.join(', ') || 'none'}
											</td>
											<td className="py-3 px-4 font-mono tabular-nums text-right text-slate-300">
												{inst.harness.memoryGi ?? 4}Gi /{' '}
												{inst.harness.concurrency ?? 8}x
											</td>
											<td className="py-3 px-4 text-right">
												<span
													className={
														inst.harness.enabledInWorkflow !== false
															? 'text-emerald-400 font-medium'
															: 'text-slate-500'
													}
												>
													{inst.harness.enabledInWorkflow !== false
														? 'Active'
														: 'Bypassed'}
												</span>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</div>
			</div>

			{/* Import Custom harness2.v1 JSON Modal */}
			{showImportJsonModal && (
				<div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
					<div className="max-w-2xl w-full bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-4">
						<div className="flex items-center justify-between">
							<h3 className="text-sm font-semibold text-white">
								Import harness2.v1 Configuration JSON
							</h3>
							<button
								type="button"
								onClick={() => setShowImportJsonModal(false)}
								className="text-xs text-slate-400 hover:text-white"
							>
								Close
							</button>
						</div>
						<p className="text-xs text-slate-400">
							Paste a <code className="font-mono">harness2.v1</code> JSON
							configuration to apply to{' '}
							{selectedTarget === 'all'
								? 'all 4 Agent Workflows'
								: activeInstance.name}
							.
						</p>
						<textarea
							rows={10}
							value={importJsonText}
							onChange={(e) => setImportJsonText(e.target.value)}
							placeholder='{"schemaVersion": "harness2.v1", "substrate": "oc", "editorTree": { ... }}'
							className="w-full p-3 text-xs font-mono bg-slate-950 border border-slate-800 rounded text-slate-100 focus:outline-none focus:border-indigo-500"
						/>
						{importError && (
							<div className="text-xs text-red-400 font-mono">{importError}</div>
						)}
						<div className="flex justify-end gap-3">
							<button
								type="button"
								onClick={() => setShowImportJsonModal(false)}
								className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleImportCustomJson}
								disabled={!importJsonText.trim()}
								className="px-4 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded"
							>
								Import &amp; Validate Harness
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
