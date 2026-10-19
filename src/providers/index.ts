import Provider from './provider';
import geminiProvider from './gemini';
import openaiProvider from './openai';
import anthropicProvider from './anthropic';
import openrouterProvider from './openrouter';
import togetherProvider from './together';
import perplexityProvider from './perplexity';
import localProvider from './local';
import { ByokProviderId } from 'lib/byokConnector';

export const PROVIDER_REGISTRY: Provider[] = [
	geminiProvider,
	openaiProvider,
	anthropicProvider,
	openrouterProvider,
	togetherProvider,
	perplexityProvider,
	localProvider,
];

export function getProviderById(providerId: ByokProviderId): Provider {
	return (
		PROVIDER_REGISTRY.find((p) => p.providerId === providerId) || geminiProvider
	);
}

export {
	Provider,
	geminiProvider,
	openaiProvider,
	anthropicProvider,
	openrouterProvider,
	togetherProvider,
	perplexityProvider,
	localProvider,
};
