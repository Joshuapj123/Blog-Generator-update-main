import { DistributionResult } from './schemas';

export interface DistributionProvider {
  channelName: string;
  publish(payload: any, options?: { dryRun?: boolean; jobId?: string }): Promise<DistributionResult>;
  validate(payload: any): Promise<{ valid: boolean; errors?: string[] }>;
  schedule?(payload: any, scheduledAt: string, options?: { dryRun?: boolean; jobId?: string }): Promise<DistributionResult>;
  update?(externalId: string, payload: any, options?: { dryRun?: boolean; jobId?: string }): Promise<DistributionResult>;
  delete?(externalId: string, options?: { dryRun?: boolean; jobId?: string }): Promise<{ success: boolean; error?: string }>;
}
