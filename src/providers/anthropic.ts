import Provider, { ProviderModelOption } from './provider';
import { ByokProviderId, DEFAULT_PROVIDER_ENDPOINTS } from 'lib/byokConnector';

export class AnthropicProvider extends Provider {
	readonly providerId: ByokProviderId = 'anthropic';
	readonly fullName = 'Anthropic Claude API';
	readonly shortName = 'Claude';
	readonly apiEndpoint = DEFAULT_PROVIDER_ENDPOINTS.anthropic;
	readonly requiresApiKey = true;
	readonly defaultModel = 'claude-3-5-haiku-latest';
	readonly supportedModels: ProviderModelOption[] = [
		{
			id: 'claude-3-5-haiku-latest',
			label: 'Claude 3.5 Haiku',
			description: 'Fast analytical and compliance step execution',
		},
		{
			id: 'claude-3-7-sonnet-latest',
			label: 'Claude 3.7 Sonnet',
			description: 'Deep systems architecture and code verification',
		},
	];
}

export default new AnthropicProvider();
