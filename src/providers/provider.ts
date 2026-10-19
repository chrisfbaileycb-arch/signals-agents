import {
	AuditedCallRequest,
	AuditedCallResponse,
	ByokProviderId,
	executeAuditedProviderCall,
	getByokStatus,
	hasActiveByokCredential,
} from 'lib/byokConnector';

export interface ProviderModelOption {
	id: string;
	label: string;
	description: string;
}

/**
 * Base Provider class for Signals Agents.
 * All provider execution routes strictly through the single audited BYOK gateway
 * (`executeAuditedProviderCall`) — never web-scraping, never DOM automation,
 * and never simulated responses.
 */
export abstract class Provider {
	abstract readonly providerId: ByokProviderId;
	abstract readonly fullName: string;
	abstract readonly shortName: string;
	abstract readonly apiEndpoint: string;
	abstract readonly requiresApiKey: boolean;
	abstract readonly defaultModel: string;
	abstract readonly supportedModels: ProviderModelOption[];

	isConfigured(): boolean {
		return hasActiveByokCredential(this.providerId);
	}

	getStatus() {
		return getByokStatus(this.providerId);
	}

	async execute(
		request: Omit<AuditedCallRequest, 'providerId'>,
	): Promise<AuditedCallResponse> {
		return executeAuditedProviderCall({
			...request,
			providerId: this.providerId,
			model: request.model || this.defaultModel,
		});
	}
}

export default Provider;
