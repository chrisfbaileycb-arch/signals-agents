import Provider, { ProviderModelOption } from './provider';
import { ByokProviderId, DEFAULT_PROVIDER_ENDPOINTS } from 'lib/byokConnector';

export class PerplexityProvider extends Provider {
	readonly providerId: ByokProviderId = 'perplexity';
	readonly fullName = 'Perplexity Sonar API';
	readonly shortName = 'Perplexity';
	readonly apiEndpoint = DEFAULT_PROVIDER_ENDPOINTS.perplexity;
	readonly requiresApiKey = true;
	readonly defaultModel = 'sonar';
	readonly supportedModels: ProviderModelOption[] = [
		{
			id: 'sonar',
			label: 'Perplexity Sonar',
			description: 'Search-grounded verification and synthesis',
		},
		{
			id: 'sonar-pro',
			label: 'Perplexity Sonar Pro',
			description: 'Deep multi-step research and citation verification',
		},
	];
}

export default new PerplexityProvider();
