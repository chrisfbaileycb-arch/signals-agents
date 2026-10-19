import Provider, { ProviderModelOption } from './provider';
import { ByokProviderId, DEFAULT_PROVIDER_ENDPOINTS } from 'lib/byokConnector';

export class GeminiProvider extends Provider {
	readonly providerId: ByokProviderId = 'gemini';
	readonly fullName = 'Google Gemini API';
	readonly shortName = 'Gemini';
	readonly apiEndpoint = DEFAULT_PROVIDER_ENDPOINTS.gemini;
	readonly requiresApiKey = true;
	readonly defaultModel = 'gemini-2.5-flash';
	readonly supportedModels: ProviderModelOption[] = [
		{
			id: 'gemini-2.5-flash',
			label: 'Gemini 2.5 Flash',
			description: 'Fast, balanced reasoning for directional workflow steps',
		},
		{
			id: 'gemini-2.5-pro',
			label: 'Gemini 2.5 Pro',
			description: 'Deep architectural & compliance analysis',
		},
		{
			id: 'gemini-2.0-flash',
			label: 'Gemini 2.0 Flash',
			description: 'Low-latency step execution and verification',
		},
	];
}

export default new GeminiProvider();
