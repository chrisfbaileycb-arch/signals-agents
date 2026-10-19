import { ProviderInterface } from './types';
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function getConfiguredProviders(allProviders: ProviderInterface[]) {
	return allProviders.filter((provider) => provider.isConfigured());
}

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function getCurrentPlatform(): string {
	const platform = (
		typeof process !== 'undefined' && process.platform
			? process.platform
			: typeof navigator !== 'undefined' && navigator.platform
			? navigator.platform
			: 'linux'
	).toLowerCase();
	if (['darwin', 'macintel', 'mac'].some((p) => platform.includes(p))) {
		return 'mac';
	} else if (platform.includes('win')) {
		return 'win';
	} else {
		return 'linux';
	}
}

export const CmdOrCtrlKey = getCurrentPlatform() === 'mac' ? 'Cmd' : 'Ctrl';
