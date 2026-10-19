import Provider, { ProviderModelOption } from './provider';
import { ByokProviderId, DEFAULT_PROVIDER_ENDPOINTS } from 'lib/byokConnector';

export class OpenRouterProvider extends Provider {
	readonly providerId: ByokProviderId = 'openrouter';
	readonly fullName = 'OpenRouter API';
	readonly shortName = 'OpenRouter';
	readonly apiEndpoint = DEFAULT_PROVIDER_ENDPOINTS.openrouter;
	readonly requiresApiKey = true;
	readonly defaultModel = 'openai/gpt-4o-mini';
	readonly supportedModels: ProviderModelOption[] = [
		{
			id: 'openai/gpt-4o-mini',
			label: 'OpenRouter · GPT-4o Mini',
			description: 'Fast OpenRouter routed model execution',
		},
		{
			id: 'anthropic/claude-3.5-sonnet',
			label: 'OpenRouter · Claude 3.5 Sonnet',
			description: 'High-precision architectural and code synthesis',
		},
	];
}

export default new OpenRouterProvider();
