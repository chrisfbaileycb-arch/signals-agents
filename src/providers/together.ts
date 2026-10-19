import Provider, { ProviderModelOption } from './provider';
import { ByokProviderId, DEFAULT_PROVIDER_ENDPOINTS } from 'lib/byokConnector';

export class TogetherProvider extends Provider {
	readonly providerId: ByokProviderId = 'together';
	readonly fullName = 'Together AI API';
	readonly shortName = 'Together';
	readonly apiEndpoint = DEFAULT_PROVIDER_ENDPOINTS.together;
	readonly requiresApiKey = true;
	readonly defaultModel = 'meta-llama/Llama-3.3-70B-Instruct-Turbo';
	readonly supportedModels: ProviderModelOption[] = [
		{
			id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
			label: 'Llama 3.3 70B Instruct Turbo',
			description: 'Open-weights high-throughput directional reasoning',
		},
	];
}

export default new TogetherProvider();
