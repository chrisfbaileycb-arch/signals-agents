import Provider from 'providers/provider';
import { ByokProviderId } from './byokConnector';

export type ProviderInterface = Provider;

export interface ProviderSummary {
	providerId: ByokProviderId;
	fullName: string;
	shortName: string;
	requiresApiKey: boolean;
	defaultModel: string;
	configured: boolean;
}
