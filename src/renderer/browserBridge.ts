// Browser Bridge for GodMode Web
// Shims Electron IPC, ElectronStore, and Settings APIs using LocalStorage and Web APIs

export function initBrowserBridge() {
	if (typeof window === 'undefined') return;

	// In-memory event bus
	const listeners = new Map<string, Set<Function>>();

	const mockIpc = {
		sendMessage(channel: string, ...args: any[]) {
			const cbs = listeners.get(channel);
			if (cbs) {
				cbs.forEach((fn) => fn(...args));
			}
		},
		on(channel: string, func: (...args: any[]) => void) {
			if (!listeners.has(channel)) listeners.set(channel, new Set());
			listeners.get(channel)!.add(func);
			return () => {
				listeners.get(channel)?.delete(func);
			};
		},
		once(channel: string, func: (...args: any[]) => void) {
			const wrapper = (...args: any[]) => {
				func(...args);
				listeners.get(channel)?.delete(wrapper);
			};
			if (!listeners.has(channel)) listeners.set(channel, new Set());
			listeners.get(channel)!.add(wrapper);
		},
	};

	const electronStore = {
		get(key: string, defaultValue?: any) {
			try {
				const item = localStorage.getItem(`godmode_${key}`);
				if (item === null || item === undefined) return defaultValue;
				return JSON.parse(item);
			} catch {
				return defaultValue;
			}
		},
		set(key: string, val: any) {
			try {
				localStorage.setItem(`godmode_${key}`, JSON.stringify(val));
			} catch (err) {
				console.warn('localStorage error', err);
			}
		},
	};

	const browserWindow = {
		reload() {
			window.dispatchEvent(new CustomEvent('godmode-reload'));
		},
		getAlwaysOnTop() {
			return localStorage.getItem('godmode_alwaysOnTop') === 'true';
		},
		setAlwaysOnTop(val: any) {
			localStorage.setItem('godmode_alwaysOnTop', String(Boolean(val)));
		},
		promptHiddenChat(prompt: string) {
			fetch('/api/prompt-critic', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ prompt }),
			})
				.then((r) => r.json())
				.then((data) => {
					const target = document.getElementById('streamingPromptResponseContainer');
					if (target && data.analysis) {
						target.innerHTML = `<div class="p-4 bg-gray-100 rounded text-sm font-sans whitespace-pre-wrap">${data.analysis}</div>`;
					}
					mockIpc.sendMessage('perplexity-llama2', data.analysis);
				})
				.catch((err) => console.error('promptHiddenChat error:', err));
		},
		enableOpenAtLogin() {},
		disableOpenAtLogin() {},
	};

	if (!window.electron) {
		(window as any).electron = {
			ipcRenderer: mockIpc,
			electronStore,
			browserWindow,
		};
	}

	if (!window.settings) {
		(window as any).settings = {
			getGlobalShortcut: async () => localStorage.getItem('godmode_shortcut') || 'CmdOrCtrl+Shift+G',
			setGlobalShortcut: async (sc: string) => {
				localStorage.setItem('godmode_shortcut', sc);
				return true;
			},
			getFocusSuperprompt: async () => localStorage.getItem('godmode_focus') === 'true',
			setFocusSuperprompt: async (val: boolean) => {
				localStorage.setItem('godmode_focus', String(val));
				return true;
			},
			getPlatform: async () => (navigator.platform?.toLowerCase().includes('mac') ? 'darwin' : 'win32'),
			getOpenAtLogin: async () => false,
		};
	}
}

// Call on module load
initBrowserBridge();
