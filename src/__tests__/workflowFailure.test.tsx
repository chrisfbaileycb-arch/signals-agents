import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { TextEncoder, TextDecoder } from 'node:util';
import { resetByokSessionMemory, setByokApiKey, hasActiveByokCredential } from '../lib/byokConnector';
import { INITIAL_FOUR_INSTANCES } from '../lib/workflowTypes';
import Layout from '../renderer/layout';

jest.mock('../renderer/App.css', () => ({}));
jest.mock('components/WorkflowMindMap', () => () => null);
jest.mock('components/WorkflowExportCenter', () => () => null);
jest.mock('components/HarnessConfigStudio', () => () => null);
jest.mock('components/pane', () => () => null);
jest.mock('../renderer/promptCritic', () => ({ PromptCritic: () => null }));

describe('four-agent failure propagation', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    resetByokSessionMemory();
    Object.assign(globalThis, { TextEncoder, TextDecoder, IS_REACT_ACT_ENVIRONMENT: true });
    setByokApiKey('gemini', 'AIzaSyTestOnlyNeverARealKey12345678901234');
    container = document.createElement('div'); document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); resetByokSessionMemory(); jest.restoreAllMocks(); });

  it('stops the directional chain after the first provider failure', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'Invalid test key' });
    Object.assign(globalThis, { fetch: mockFetch });
    await act(async () => root.render(<Layout />));
    const objective = container.querySelector('textarea[placeholder*="workflow objective"]') as HTMLTextAreaElement;
    expect(objective).not.toBeNull();
    await act(async () => { Simulate.change(objective, { target: { value: 'Draft a restaurant marketing plan' } } as any); });
    const runButton = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Execute Workflow');
    expect(runButton).toBeDefined();
    await act(async () => { runButton!.click(); await new Promise(resolve => setTimeout(resolve, 30)); });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const auditButton = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Exports & Audit'));
    await act(async () => auditButton!.click());
    expect(container.textContent).toContain('Provider failed');
  });
  it('preserves sequential execution across every step of all four agents', async () => {
    let count = 0;
    const mockFetch = jest.fn().mockImplementation(async () => {
      count += 1;
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: `Provider step output ${count}` }] } }] }) };
    });
    Object.assign(globalThis, { fetch: mockFetch });
    await act(async () => root.render(<Layout />));
    const objective = container.querySelector('textarea[placeholder*="workflow objective"]') as HTMLTextAreaElement;
    await act(async () => Simulate.change(objective, { target: { value: 'Draft a restaurant marketing plan' } } as any));
    const run = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Execute Workflow');
    await act(async () => { run!.click(); await new Promise(resolve => setTimeout(resolve, 50)); });
    const totalSteps = INITIAL_FOUR_INSTANCES.reduce((total, instance) => total + instance.steps.length, 0);
    expect(mockFetch).toHaveBeenCalledTimes(totalSteps);
    const firstAgentSteps = INITIAL_FOUR_INSTANCES[0].steps.length;
    const secondAgentBody = JSON.parse(mockFetch.mock.calls[firstAgentSteps][1].body);
    expect(secondAgentBody.contents[0].parts[0].text).toContain('Upstream Step Context');
    expect(secondAgentBody.contents[0].parts[0].text).toContain('Provider step output');
    expect(hasActiveByokCredential('gemini')).toBe(true);
  });

});
