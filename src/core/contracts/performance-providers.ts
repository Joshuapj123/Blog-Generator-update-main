import { PerformanceSnapshot } from './schemas';

export interface PerformanceProvider {
  providerName: string;
  fetchPerformance(assetId: string, channel: string, externalId?: string): Promise<PerformanceSnapshot>;
  validate(snapshot: PerformanceSnapshot): Promise<{ valid: boolean; errors?: string[] }>;
}
