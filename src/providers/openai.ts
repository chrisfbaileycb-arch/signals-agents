import Provider, { ProviderModelOption } from './provider';
import { ByokProviderId, DEFAULT_PROVIDER_ENDPOINTS } from 'lib/byokConnector';

export class OpenAIProvider extends Provider {
	readonly providerId: ByokProviderId = 'openai';
	readonly fullName = 'OpenAI API';
	readonly shortName = 'OpenAI';
	readonly apiEndpoint = DEFAULT_PROVIDER_ENDPOINTS.openai;
	readonly requiresApiKey = true;
	readonly defaultModel = 'gpt-4o-mini';
	readonly supportedModels: ProviderModelOption[] = [
		{
			id: 'gpt-4o-mini',
			label: 'GPT-4o Mini',
			description: 'High-speed directional workflow step execution',
		},
		{
			id: 'gpt-4o',
			label: 'GPT-4o',
			description: 'Flagship multi-step reasoning and synthesis',
		},
	];
}

export default new OpenAIProvider();
