import { PerformanceProvider } from '@/core/contracts/performance-providers';
import { PerformanceSnapshot, DistributionJob } from '@/core/contracts/schemas';

export interface PerformanceSnapshotRepository {
  saveSnapshot: (snapshot: PerformanceSnapshot) => Promise<string>;
}

export class PerformanceCollector {
  private providers: Map<string, PerformanceProvider>;

  constructor(
    providersList: PerformanceProvider[],
    private repo?: PerformanceSnapshotRepository
  ) {
    this.providers = new Map();
    providersList.forEach(p => {
      this.providers.set(p.providerName, p);
    });
  }

  async collectMetricsForJob(
    job: DistributionJob,
    providerName: string
  ): Promise<PerformanceSnapshot | null> {
    const startTime = Date.now();
    try {
      const provider = this.providers.get(providerName);
      if (!provider) {
        throw new Error(`Performance provider "${providerName}" is not registered`);
      }

      console.log(`[PerformanceCollector] Querying ${providerName} for asset: ${job.assetId} on channel: ${job.channel}...`);
      const snapshot = await provider.fetchPerformance(
        job.assetId,
        job.channel,
        job.externalId
      );

      const validation = await provider.validate(snapshot);
      if (!validation.valid) {
        throw new Error(`Snapshot validation failed: ${validation.errors?.join(', ')}`);
      }

      // Persist snapshot
      const saveSnapFn = this.repo
        ? this.repo.saveSnapshot.bind(this.repo)
        : (await import('../firebase/firestore')).savePerformanceSnapshot;

      await saveSnapFn(snapshot);

      console.log(`[PerformanceCollector] Successfully saved snapshot for asset: ${job.assetId} in ${Date.now() - startTime}ms`);
      return snapshot;
    } catch (err: any) {
      console.error(`[PerformanceCollector] Error collecting metrics for asset ${job.assetId} on ${job.channel}:`, err.message);
      return null;
    }
  }
}
