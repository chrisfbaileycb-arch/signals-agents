// const { ipcRenderer } = require('electron');
// const log = require('electron-log');

class Provider {
	static webviewId = '';

	static getWebview() {
		const el = typeof document !== 'undefined' ? document.getElementById(this.webviewId) : null;
		if (el) {
			if (!el.getZoomLevel) el.getZoomLevel = () => Number(el.getAttribute('data-zoom') || 0);
			if (!el.setZoomLevel) el.setZoomLevel = (z) => el.setAttribute('data-zoom', String(z));
			if (!el.executeJavaScript) el.executeJavaScript = () => Promise.resolve();
			if (!el.insertCSS) el.insertCSS = () => {};
			if (!el.reload) el.reload = () => {};
			if (!el.goBack) el.goBack = () => {};
			if (!el.goForward) el.goForward = () => {};
			return el;
		}
		// Return safe mock element if not mounted yet
		return {
			getZoomLevel: () => 0,
			setZoomLevel: () => {},
			executeJavaScript: () => Promise.resolve(),
			insertCSS: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
			reload: () => {},
			goBack: () => {},
			goForward: () => {},
			src: this.url,
		};
	}

	static url = '';

	static paneId() {
		return `${this.name.toLowerCase()}Pane`;
	}

	static setupCustomPasteBehavior() {
		const webview = this.getWebview();
		if (webview && typeof webview.addEventListener === 'function') {
			webview.addEventListener('dom-ready', () => {
				if (typeof webview.executeJavaScript === 'function') {
					webview.executeJavaScript(`{}`);
				}
			});
		}
	}

	static handleInput(input) {
		// Base no-op or custom implementation
	}

	static handleSubmit() {
		// Base no-op or custom implementation
	}

	static handleCss() {
		// Base no-op or custom implementation
	}

	// Some providers will have their own dark mode implementation
	static handleDarkMode(isDarkMode) {
		const webview = this.getWebview();
		if (webview && typeof webview.executeJavaScript === 'function') {
			if (isDarkMode) {
				webview.executeJavaScript(`{
					document.documentElement.classList.add('dark');
					document.documentElement.classList.remove('light');
				}`);
			} else {
				webview.executeJavaScript(`{
					document.documentElement.classList.add('light');
					document.documentElement.classList.remove('dark');
				}`);
			}
		}
	}

	static getUserAgent() {
		return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36';
	}

	static isEnabled() {
		return window?.electron?.electronStore?.get(`${this.webviewId}Enabled`, true) ?? true;
	}

	static setEnabled(state) {
		window?.electron?.electronStore?.set(`${this.webviewId}Enabled`, state);
	}
}

if (typeof module !== 'undefined' && module.exports) {
	module.exports = Provider;
}
export default Provider;

