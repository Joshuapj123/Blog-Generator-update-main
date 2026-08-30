import { 
  DistributionRequest, 
  DistributionResult, 
  ContentAsset,
  SaaSProfile,
  DistributionChannel
} from '@/core/contracts/schemas';
import { DistributionProvider } from '@/core/contracts/distribution-providers';
import { DistributionPlanner } from './DistributionPlanner';
import { DistributionTransformer } from './DistributionTransformer';
// Firestore functions are resolved dynamically to decouple tests.

export interface DistributionRepository {
  saveJob: (job: any) => Promise<string>;
  getJobByIdempotencyKey: (key: string) => Promise<any | null>;
  getJobById: (id: string) => Promise<any | null>;
}

export class DistributionService {
  private providers: Map<DistributionChannel, DistributionProvider>;

  constructor(
    providersList: DistributionProvider[],
    private repo?: DistributionRepository
  ) {
    this.providers = new Map();
    providersList.forEach(p => {
      this.providers.set(p.channelName as DistributionChannel, p);
    });
  }

  private validateStateTransition(current: string, next: string): boolean {
    const validMap: Record<string, string[]> = {
      'PENDING': ['VALIDATING', 'CANCELLED'],
      'VALIDATING': ['QUEUED', 'FAILED', 'CANCELLED'],
      'QUEUED': ['PUBLISHING', 'SCHEDULED', 'CANCELLED'],
      'SCHEDULED': ['PUBLISHING', 'CANCELLED'],
      'PUBLISHING': ['PUBLISHED', 'FAILED'],
      'FAILED': ['PENDING', 'VALIDATING', 'CANCELLED'],
      'CANCELLED': []
    };
    return validMap[current]?.includes(next) ?? false;
  }

  async distributeAsset(
    saasProfile: SaaSProfile,
    asset: ContentAsset,
    request: DistributionRequest,
    options?: { dryRun?: boolean }
  ): Promise<DistributionResult[]> {
    const results: DistributionResult[] = [];

    const getJobKeyFn = this.repo
      ? this.repo.getJobByIdempotencyKey.bind(this.repo)
      : (await import('../firebase/firestore')).getDistributionJobByIdempotencyKey;

    const saveJobFn = this.repo
      ? this.repo.saveJob.bind(this.repo)
      : (await import('../firebase/firestore')).saveDistributionJob;

    const existingJob = await getJobKeyFn(request.idempotencyKey);
    if (existingJob) {
      console.log(`[DistributionService] Idempotency Hit for key: "${request.idempotencyKey}". Returning cached status.`);
      return [{
        channel: existingJob.channel,
        status: existingJob.status,
        externalId: existingJob.externalId,
        publishedUrl: existingJob.publishedUrl,
        error: existingJob.error
      }];
    }

    const plan = DistributionPlanner.planDistribution(saasProfile, asset, request.channels);

    for (const channel of plan.eligibleChannels) {
      const jobId = `${request.idempotencyKey}_${channel}`;
      
      let currentStatus = 'PENDING';
      
      const setJobState = async (nextStatus: string, err?: string, extId?: string, pubUrl?: string) => {
        if (!this.validateStateTransition(currentStatus, nextStatus)) {
          console.warn(`[DistributionService] Invalid state transition: ${currentStatus} -> ${nextStatus}`);
        }
        currentStatus = nextStatus;
        const jobData = {
          jobId,
          assetId: request.contentAssetId,
          channel,
          status: currentStatus,
          idempotencyKey: request.idempotencyKey,
          error: err,
          externalId: extId,
          publishedUrl: pubUrl,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          scheduledAt: request.scheduledAt
        };
        await saveJobFn(jobData);
      };

      try {
        await setJobState('VALIDATING');

        const provider = this.providers.get(channel);
        if (!provider) {
          throw new Error(`No provider registered for channel "${channel}"`);
        }

        const payload = DistributionTransformer.transform(asset, channel);
        const valRes = await provider.validate(payload);
        if (!valRes.valid) {
          throw new Error(`Payload validation failed: ${valRes.errors?.join(', ')}`);
        }

        await setJobState('QUEUED');

        if (request.publishMode === 'schedule' && request.scheduledAt) {
          await setJobState('SCHEDULED');
          results.push({
            channel,
            status: 'SCHEDULED',
            publishedUrl: `https://scheduled-publication.com/${jobId}`,
            telemetry: { durationMs: 0, attempts: 1 }
          });
          continue;
        }

        await setJobState('PUBLISHING');

        let attempt = 0;
        const maxAttempts = 3;
        let publishRes: DistributionResult | null = null;
        let lastError = '';

        while (attempt < maxAttempts) {
          attempt++;
          try {
            publishRes = await provider.publish(payload, { 
              dryRun: options?.dryRun,
              jobId 
            });

            if (publishRes.status === 'PUBLISHED') {
              break;
            } else {
              lastError = publishRes.error || 'Unknown provider error';
            }
          } catch (e: any) {
            lastError = e.message;
          }

          if (attempt < maxAttempts) {
            const backoffMs = Math.pow(2, attempt) * 100;
            console.log(`[DistributionService] Attempt ${attempt} failed. Retrying in ${backoffMs}ms...`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
          }
        }

        if (publishRes && publishRes.status === 'PUBLISHED') {
          await setJobState('PUBLISHED', undefined, publishRes.externalId, publishRes.publishedUrl);
          results.push(publishRes);
        } else {
          throw new Error(`Failed to publish after ${maxAttempts} attempts. Last error: ${lastError}`);
        }

      } catch (err: any) {
        await setJobState('FAILED', err.message);
        results.push({
          channel,
          status: 'FAILED',
          error: err.message,
          telemetry: { durationMs: 0, attempts: 1 }
        });
      }
    }

    return results;
  }

  async cancelScheduledJob(jobId: string): Promise<boolean> {
    const getJobFn = this.repo
      ? this.repo.getJobById.bind(this.repo)
      : (await import('../firebase/firestore')).getDistributionJobById;

    const saveJobFn = this.repo
      ? this.repo.saveJob.bind(this.repo)
      : (await import('../firebase/firestore')).saveDistributionJob;

    const job = await getJobFn(jobId);
    if (!job) {
      throw new Error(`No scheduled job found for ID: "${jobId}"`);
    }

    if (job.status !== 'SCHEDULED') {
      throw new Error(`Cannot cancel job with status: ${job.status}`);
    }

    const cancelData = {
      jobId,
      status: 'CANCELLED',
      updatedAt: new Date().toISOString()
    };

    await saveJobFn(cancelData);

    return true;
  }
}
