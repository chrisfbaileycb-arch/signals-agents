import React, { useMemo, useState } from 'react';
import {
	EnvironmentTheme,
	KeyRoutingScope,
	LeaseAuditEntry,
	WorkflowInstance,
	WorkflowTopology,
} from 'lib/workflowTypes';
import {
	buildWorkflowFileBundle,
	createZipBlob,
	downloadSingleVirtualFile,
	triggerBrowserDownload,
	WorkflowVirtualFile,
	WorkflowVirtualFolder,
} from 'lib/workflowExporter';
import {
	CheckCircledIcon,
	CopyIcon,
	DownloadIcon,
	FileTextIcon,
	LockClosedIcon,
	MagnifyingGlassIcon,
} from '@radix-ui/react-icons';

interface WorkflowExportCenterProps {
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
}

export default function WorkflowExportCenter({
	instances,
	topology,
	superprompt,
	keyRoutingScope,
	environmentTheme,
	activeGlobalLeaseId,
	lastPurgeReceipt,
	auditLog,
}: WorkflowExportCenterProps) {
	const bundle = useMemo(
		() =>
			buildWorkflowFileBundle({
				instances,
				topology,
				superprompt,
				keyRoutingScope,
				environmentTheme,
				activeGlobalLeaseId,
				lastPurgeReceipt,
				auditLog,
			}),
		[
			instances,
			topology,
			superprompt,
			keyRoutingScope,
			environmentTheme,
			activeGlobalLeaseId,
			lastPurgeReceipt,
			auditLog,
		],
	);

	const [activeView, setActiveView] = useState<'folders' | 'results-log'>(
		'folders',
	);
	const [selectedFolderFilter, setSelectedFolderFilter] =
		useState<string>('all');
	const [selectedFilePath, setSelectedFilePath] = useState<string>(
		'deliverables/master-workflow-synthesis.md',
	);
	const [logSearchQuery, setLogSearchQuery] = useState<string>('');
	const [copiedState, setCopiedState] = useState<string | null>(null);
	const [downloadNotice, setDownloadNotice] = useState<string | null>(null);

	const selectedFile: WorkflowVirtualFile = useMemo(() => {
		return (
			bundle.files.find((f) => f.path === selectedFilePath) ||
			bundle.files[0]
		);
	}, [bundle.files, selectedFilePath]);

	const visibleFolders: WorkflowVirtualFolder[] = useMemo(() => {
		if (selectedFolderFilter === 'all') return bundle.folders;
		return bundle.folders.filter((f) => f.path === selectedFolderFilter);
	}, [bundle.folders, selectedFolderFilter]);

	const filteredLogLines = useMemo(() => {
		const rawLines = bundle.resultsLogText.split('\n');
		const q = logSearchQuery.trim().toLowerCase();
		if (!q) return rawLines;
		return rawLines.filter((line) => line.toLowerCase().includes(q));
	}, [bundle.resultsLogText, logSearchQuery]);

	const triggerToast = (msg: string) => {
		setDownloadNotice(msg);
		setTimeout(() => {
			setDownloadNotice((prev) => (prev === msg ? null : prev));
		}, 3200);
	};

	const handleCopyText = (text: string, label: string) => {
		navigator.clipboard.writeText(text);
		setCopiedState(label);
		setTimeout(() => {
			setCopiedState((prev) => (prev === label ? null : prev));
		}, 1800);
	};

	const handleDownloadCompleteBundleZip = () => {
		const zipBlob = createZipBlob(bundle.archetype.rootFolderName, bundle.files);
		const dateStamp = new Date().toISOString().slice(0, 10);
		const filename = `${bundle.archetype.rootFolderName}-${dateStamp}.zip`;
		triggerBrowserDownload(zipBlob, filename);
		triggerToast(
			`Downloaded complete workflow folder archive: ${filename} (${bundle.files.length} files)`,
		);
	};

	const handleDownloadFolderZip = (folder: WorkflowVirtualFolder) => {
		const folderSlug =
			folder.path === 'root'
				? `${bundle.archetype.rootFolderName}-root`
				: `${bundle.archetype.rootFolderName}-${folder.path}`;
		const zipBlob = createZipBlob(folderSlug, folder.files);
		const filename = `${folderSlug}.zip`;
		triggerBrowserDownload(zipBlob, filename);
		triggerToast(
			`Downloaded folder archive: ${filename} (${folder.files.length} files)`,
		);
	};

	const handleDownloadResultsLog = () => {
		const logFile = bundle.files.find(
			(f) => f.path === 'logs/workflow-execution-results.log',
		);
		if (logFile) {
			downloadSingleVirtualFile(logFile);
			triggerToast(`Exported results log: ${logFile.name}`);
		}
	};

	const handleDownloadMasterDeliverable = () => {
		const masterFile = bundle.files.find(
			(f) => f.path === 'deliverables/master-workflow-synthesis.md',
		);
		if (masterFile) {
			downloadSingleVirtualFile(masterFile);
			triggerToast(`Downloaded master deliverable: ${masterFile.name}`);
		}
	};

	const formatBytes = (bytes: number) => {
		if (bytes < 1024) return `${bytes} B`;
		return `${(bytes / 1024).toFixed(1)} KB`;
	};

	return (
		<div className="space-y-4 text-xs">
			{/* Top Workflow-Aware Export & Download Header Card */}
			<div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
				<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
					<div className="space-y-1">
						<div className="flex items-center gap-2 flex-wrap">
							<span className="px-2 py-0.5 rounded bg-indigo-600 text-white font-mono text-[10px] font-semibold">
								{bundle.archetype.badgeLabel.toUpperCase()}
							</span>
							<h2 className="text-sm font-bold text-white">
								Export Results Log & Downloadable Workflow Files / Folders
							</h2>
							<span className="text-slate-500">·</span>
							<span className="font-mono text-emerald-400">
								{bundle.archetype.rootFolderName}/
							</span>
						</div>
						<p className="text-slate-400 leading-relaxed">
							Active Workflow Package:{' '}
							<strong className="text-slate-200">
								{bundle.archetype.title}
							</strong>{' '}
							— {bundle.archetype.description}
						</p>
					</div>

					{/* Primary 1-Click Export & Download Buttons */}
					<div className="flex items-center gap-2 flex-wrap shrink-0">
						<button
							type="button"
							onClick={handleDownloadResultsLog}
							className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-100 font-semibold transition-colors cursor-pointer"
							title="Download the timestamped workflow-execution-results.log file"
						>
							<FileTextIcon className="w-3.5 h-3.5 text-indigo-400" />
							<span>Export Results Log (.log)</span>
						</button>

						<button
							type="button"
							onClick={handleDownloadMasterDeliverable}
							className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-100 font-semibold transition-colors cursor-pointer"
							title="Download consolidated 4-agent Markdown report"
						>
							<DownloadIcon className="w-3.5 h-3.5 text-emerald-400" />
							<span>Master Synthesis (.md)</span>
						</button>

						<button
							type="button"
							onClick={handleDownloadCompleteBundleZip}
							className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors cursor-pointer"
							title="Download all workflow folders (/logs, /deliverables, /agents, /mind-map) as a single .zip archive"
						>
							<DownloadIcon className="w-3.5 h-3.5" />
							<span>
								Download All Folders (.zip · {bundle.files.length} files)
							</span>
						</button>
					</div>
				</div>

				{/* Sub-bar: Mode Switcher + Folder Quick Download Pills + Telemetry Summary */}
				<div className="pt-2.5 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
					<div className="flex items-center gap-1.5 flex-wrap">
						<div className="flex items-center gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-lg">
							<button
								type="button"
								onClick={() => setActiveView('folders')}
								className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
									activeView === 'folders'
										? 'bg-indigo-600 text-white'
										: 'text-slate-400 hover:text-slate-200'
								}`}
							>
								Workflow Folders & Files ({bundle.folders.length} folders ·{' '}
								{bundle.files.length} files)
							</button>
							<button
								type="button"
								onClick={() => setActiveView('results-log')}
								className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
									activeView === 'results-log'
										? 'bg-indigo-600 text-white'
										: 'text-slate-400 hover:text-slate-200'
								}`}
							>
								Live Export Results Log (workflow-execution-results.log)
							</button>
						</div>

						{downloadNotice && (
							<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-mono text-[11px]">
								<CheckCircledIcon className="w-3.5 h-3.5 shrink-0" />
								<span>{downloadNotice}</span>
							</span>
						)}
					</div>

					<div className="flex items-center gap-3 font-mono text-[11px] text-slate-400 tabular-nums">
						<span>Total Bundle: {formatBytes(bundle.totalSizeBytes)}</span>
						<span>·</span>
						<span>Topology: {topology.toUpperCase()}</span>
						<span>·</span>
						<span className="text-emerald-400 flex items-center gap-1">
							<LockClosedIcon className="w-3 h-3" />
							<span>PII/Financial Sanitized</span>
						</span>
					</div>
				</div>
			</div>

			{/* VIEW 1: DOWNLOADABLE WORKFLOW FOLDERS & FILES EXPLORER */}
			{activeView === 'folders' && (
				<div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
					{/* Left 5 Cols: Folder Hierarchy & Individual Folder/File Downloads */}
					<div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-3">
						<div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
							<div>
								<h3 className="text-xs font-bold text-white">
									Workflow Directory Tree
								</h3>
								<p className="text-[11px] text-slate-400">
									Download an entire folder (.zip) or click any file to inspect
									and download
								</p>
							</div>
							<select
								value={selectedFolderFilter}
								onChange={(e) => setSelectedFolderFilter(e.target.value)}
								className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-200 font-mono"
							>
								<option value="all">All Folders ({bundle.folders.length})</option>
								{bundle.folders.map((folder) => (
									<option key={folder.path} value={folder.path}>
										{folder.label} ({folder.fileCount})
									</option>
								))}
							</select>
						</div>

						<div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
							{visibleFolders.map((folder) => (
								<div
									key={folder.path}
									className="rounded-lg border border-slate-800 bg-slate-950/70 overflow-hidden"
								>
									{/* Folder Header with 1-Click Folder .zip Download */}
									<div className="px-3 py-2 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-2">
										<div className="min-w-0">
											<div className="flex items-center gap-1.5">
												<span className="font-mono font-bold text-indigo-400">
													{folder.label}
												</span>
												<span className="text-[10px] font-mono text-slate-500">
													({folder.fileCount} files ·{' '}
													{formatBytes(folder.totalBytes)})
												</span>
											</div>
											<p className="text-[10px] text-slate-400 truncate mt-0.5">
												{folder.description}
											</p>
										</div>

										<button
											type="button"
											onClick={() => handleDownloadFolderZip(folder)}
											className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-[10px] font-mono font-semibold shrink-0 cursor-pointer"
											title={`Download ${folder.label} folder as a .zip archive`}
										>
											<DownloadIcon className="w-3 h-3 text-indigo-400" />
											<span>Folder .zip</span>
										</button>
									</div>

									{/* Files inside Folder */}
									<div className="divide-y divide-slate-800/60">
										{folder.files.map((file) => {
											const isSelected = selectedFile.path === file.path;
											return (
												<div
													key={file.id}
													onClick={() => setSelectedFilePath(file.path)}
													className={`px-3 py-2 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
														isSelected
															? 'bg-indigo-950/60 text-white'
															: 'hover:bg-slate-900/70 text-slate-300'
													}`}
												>
													<div className="min-w-0 flex-1">
														<div className="flex items-center gap-1.5">
															<span
																className={`font-mono text-[11px] truncate ${
																	isSelected
																		? 'font-bold text-indigo-300'
																		: 'font-medium text-slate-200'
																}`}
															>
																{file.path}
															</span>
															{file.sourceAgentId && (
																<span className="px-1.5 py-0.2 rounded bg-slate-800 text-[9px] font-mono text-slate-300 shrink-0">
																	Agent 0{file.sourceAgentId}
																</span>
															)}
														</div>
														<p className="text-[10px] text-slate-400 truncate mt-0.5">
															{file.description}
														</p>
													</div>

													<div className="flex items-center gap-2 shrink-0">
														<span className="font-mono text-[10px] text-slate-500 tabular-nums">
															{formatBytes(file.sizeBytes)}
														</span>
														<button
															type="button"
															onClick={(e) => {
																e.stopPropagation();
																downloadSingleVirtualFile(file);
																triggerToast(`Downloaded file: ${file.name}`);
															}}
															className="p-1 rounded bg-slate-900 hover:bg-indigo-600 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer"
															title={`Download ${file.name}`}
														>
															<DownloadIcon className="w-3 h-3" />
														</button>
													</div>
												</div>
											);
										})}
									</div>
								</div>
							))}
						</div>
					</div>

					{/* Right 7 Cols: Live Selected File Inspector & Code/Artifact Preview */}
					<div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-3">
						<div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
							<div className="min-w-0">
								<div className="flex items-center gap-2 flex-wrap">
									<span className="font-mono text-xs font-bold text-white">
										{bundle.archetype.rootFolderName}/{selectedFile.path}
									</span>
									<span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
										.{selectedFile.extension.toUpperCase()} ·{' '}
										{formatBytes(selectedFile.sizeBytes)}
									</span>
								</div>
								<p className="text-[11px] text-slate-400 mt-0.5">
									{selectedFile.description}
								</p>
							</div>

							<div className="flex items-center gap-2 shrink-0">
								<button
									type="button"
									onClick={() =>
										handleCopyText(selectedFile.content, selectedFile.path)
									}
									className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 text-[11px] font-medium cursor-pointer"
								>
									<CopyIcon className="w-3 h-3" />
									<span>
										{copiedState === selectedFile.path
											? 'Copied!'
											: 'Copy Content'}
									</span>
								</button>

								<button
									type="button"
									onClick={() => {
										downloadSingleVirtualFile(selectedFile);
										triggerToast(`Downloaded file: ${selectedFile.name}`);
									}}
									className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold cursor-pointer"
								>
									<DownloadIcon className="w-3 h-3" />
									<span>Download {selectedFile.name}</span>
								</button>
							</div>
						</div>

						<pre className="flex-1 min-h-[460px] max-h-[540px] overflow-auto p-3.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] leading-relaxed text-slate-200 whitespace-pre-wrap select-text">
							{selectedFile.content}
						</pre>
					</div>
				</div>
			)}

			{/* VIEW 2: LIVE EXPORT RESULTS LOG VIEWER */}
			{activeView === 'results-log' && (
				<div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
					<div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
						<div className="flex items-center gap-2 flex-wrap">
							<span className="font-mono font-bold text-white">
								logs/workflow-execution-results.log
							</span>
							<span className="text-slate-500">·</span>
							<span className="text-slate-400">
								Complete step-by-step runtime telemetry, reasoning summaries,
								and BYOK lease purge receipts
							</span>
						</div>

						<div className="flex items-center gap-2 flex-wrap">
							<div className="relative">
								<MagnifyingGlassIcon className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
								<input
									type="text"
									value={logSearchQuery}
									onChange={(e) => setLogSearchQuery(e.target.value)}
									placeholder="Search results log (e.g. Agent 02, Step, REDACTED)..."
									className="w-64 pl-8 pr-3 py-1 rounded bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
								/>
							</div>

							<button
								type="button"
								onClick={() =>
									handleCopyText(bundle.resultsLogText, 'results-log')
								}
								className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 font-medium cursor-pointer"
							>
								<CopyIcon className="w-3 h-3" />
								<span>
									{copiedState === 'results-log'
										? 'Copied Log!'
										: 'Copy Full Log'}
								</span>
							</button>

							<button
								type="button"
								onClick={handleDownloadResultsLog}
								className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold cursor-pointer"
							>
								<DownloadIcon className="w-3 h-3" />
								<span>Download .log File</span>
							</button>
						</div>
					</div>

					{/* Quick Filter Chips for Results Log */}
					<div className="flex items-center gap-1.5 flex-wrap">
						<span className="text-[11px] text-slate-400 mr-1">
							Quick Filter:
						</span>
						{[
							{ label: 'All Log Lines', query: '' },
							{ label: 'Agent 01', query: 'AGENT 01' },
							{ label: 'Agent 02', query: 'AGENT 02' },
							{ label: 'Agent 03', query: 'AGENT 03' },
							{ label: 'Agent 04', query: 'AGENT 04' },
							{ label: 'Guardrail Checks', query: 'Guardrail' },
							{ label: 'Lease Receipts', query: 'Lease' },
						].map((chip) => (
							<button
								key={chip.label}
								type="button"
								onClick={() => setLogSearchQuery(chip.query)}
								className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer ${
									logSearchQuery === chip.query
										? 'bg-indigo-600 text-white'
										: 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
								}`}
							>
								{chip.label}
							</button>
						))}
					</div>

					<pre className="max-h-[520px] overflow-auto p-4 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] leading-relaxed text-slate-200 whitespace-pre-wrap select-text">
						{filteredLogLines.join('\n')}
					</pre>
				</div>
			)}
		</div>
	);
}
