import Provider, { ProviderModelOption } from './provider';
import { ByokProviderId, DEFAULT_PROVIDER_ENDPOINTS } from 'lib/byokConnector';

export class LocalModelProvider extends Provider {
	readonly providerId: ByokProviderId = 'local';
	readonly fullName = 'Local Model Endpoint (LM Studio / Ollama)';
	readonly shortName = 'Local Model';
	readonly apiEndpoint = DEFAULT_PROVIDER_ENDPOINTS.local;
	readonly requiresApiKey = false;
	readonly defaultModel = 'local-model';
	readonly supportedModels: ProviderModelOption[] = [
		{
			id: 'local-model',
			label: 'Local Active Model (LM Studio / Ollama)',
			description: 'Executes against your local OpenAI-compatible HTTP endpoint with no API key required',
		},
		{
			id: 'llama3.2',
			label: 'Ollama · Llama 3.2',
			description: 'Local Ollama Llama 3.2 model',
		},
		{
			id: 'qwen2.5-coder',
			label: 'Ollama / LM Studio · Qwen 2.5 Coder',
			description: 'Local coding & architecture model',
		},
	];
}

export default new LocalModelProvider();
