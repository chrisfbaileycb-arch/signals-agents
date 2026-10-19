import React, { useState } from 'react';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from './components/ui/dialog';
import { Button } from './components/ui/button';
import { executeAuditedProviderCall } from 'lib/byokConnector';

export function PromptCritic(props: {
	active?: boolean;
	superprompt: string;
	setSuperprompt: (p: string) => void;
}) {
	const { superprompt, setSuperprompt } = props;
	const [isOpen, setIsOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [analysis, setAnalysis] = useState<string | null>(null);
	const [improvedPrompt, setImprovedPrompt] = useState<string>('');
	const [error, setError] = useState<string | null>(null);

	const handleOpen = () => {
		setIsOpen(true);
		setError(null);
		setAnalysis(null);
		setImprovedPrompt(superprompt);
		if (superprompt.trim().length >= 5) {
			runAnalysis(superprompt);
		}
	};

	const runAnalysis = async (promptToAnalyze: string) => {
		if (!promptToAnalyze || promptToAnalyze.trim().length < 5) {
			setError(
				'Please enter a longer workflow objective to analyze (at least 5 characters).',
			);
			return;
		}

		setLoading(true);
		setError(null);
		try {
			const response = await executeAuditedProviderCall({
				prompt: `Analyze and optimize the following directional multi-agent workflow objective:
--- Original Objective ---
${promptToAnalyze}
--- End Original Objective ---

Output in two parts:
Part 1: 3 concise bullet points describing structural improvements for sequential 4-agent directional execution and PII/financial guardrail boundaries.
Part 2: Suggested Improved Prompt: followed by a single refined version of the objective.`,
				systemPrompt:
					'You are the Signals Agents Workflow Objective Optimizer. Never output unmasked PII or financial identifiers.',
			});

			const text = response.text || '';
			setAnalysis(text);
			const suggestionMatch = text.match(
				/(?:Suggested Improved Prompt:|Improved version:?)\s*["']?([\s\S]+?)["']?$/i,
			);
			if (suggestionMatch && suggestionMatch[1]) {
				setImprovedPrompt(suggestionMatch[1].trim());
			} else {
				setImprovedPrompt(response.sanitizedPrompt);
			}
		} catch (err: any) {
			setError(
				err?.message ||
					'Refused: Connect a personal API key or local model endpoint in the BYOK Connector first.',
			);
		} finally {
			setLoading(false);
		}
	};

	const applyImprovedPrompt = () => {
		if (improvedPrompt) {
			setSuperprompt(improvedPrompt);
			setIsOpen(false);
		}
	};

	return (
		<>
			<button
				type="button"
				className="h-12 px-3.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center"
				onClick={handleOpen}
			>
				Optimize Objective
			</button>

			<Dialog open={isOpen} onOpenChange={setIsOpen}>
				<DialogContent className="max-w-2xl bg-slate-900 border border-slate-800 text-slate-100">
					<DialogHeader>
						<DialogTitle className="text-base font-semibold text-white">
							Workflow Objective Optimizer (BYOK Audited Gateway)
						</DialogTitle>
					</DialogHeader>

					<div className="space-y-4 py-2 text-xs">
						<div>
							<label className="block text-xs font-medium text-slate-400 mb-1">
								Current Objective Prompt
							</label>
							<div className="p-3 bg-slate-950 rounded-md border border-slate-800 font-mono text-slate-200 max-h-28 overflow-y-auto">
								{superprompt || '(No prompt entered)'}
							</div>
						</div>

						{error && (
							<div className="p-2.5 bg-red-950/60 border border-red-800 text-red-200 rounded-md font-mono text-[11px]">
								{error}
							</div>
						)}

						{loading ? (
							<div className="flex flex-col items-center justify-center p-8 space-y-2 text-slate-400">
								<div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
								<span>Decomposing objective via BYOK audited gateway...</span>
							</div>
						) : analysis ? (
							<div className="space-y-3">
								<div>
									<label className="block text-xs font-medium text-slate-400 mb-1">
										Structural Critique & Recommendations
									</label>
									<div className="p-3 bg-slate-950 border border-slate-800 rounded-md text-slate-200 whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
										{analysis}
									</div>
								</div>

								<div>
									<label className="block text-xs font-medium text-slate-400 mb-1">
										Refined Directional Workflow Objective
									</label>
									<textarea
										rows={4}
										value={improvedPrompt}
										onChange={(e) => setImprovedPrompt(e.target.value)}
										className="w-full p-2.5 font-mono bg-slate-950 border border-slate-800 text-slate-100 rounded-md focus:border-indigo-500 focus:outline-none"
										placeholder="Edit the improved prompt here..."
									/>
								</div>
							</div>
						) : null}

						<div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
							<Button
								variant="outline"
								onClick={() => setIsOpen(false)}
								className="border-slate-700 text-slate-300 hover:bg-slate-800"
							>
								Cancel
							</Button>
							{!analysis && !loading && (
								<Button
									onClick={() => runAnalysis(superprompt)}
									className="bg-indigo-600 text-white hover:bg-indigo-500"
								>
									Analyze Prompt
								</Button>
							)}
							{analysis && (
								<Button
									onClick={applyImprovedPrompt}
									className="bg-indigo-600 text-white hover:bg-indigo-500"
								>
									Apply Optimized Objective
								</Button>
							)}
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
