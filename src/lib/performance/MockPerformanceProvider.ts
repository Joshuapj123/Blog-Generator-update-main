import { PerformanceProvider } from '@/core/contracts/performance-providers';
import { PerformanceSnapshot } from '@/core/contracts/schemas';

export class MockPerformanceProvider implements PerformanceProvider {
  public providerName = 'mock-analytics';

  async validate(snapshot: PerformanceSnapshot): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];
    if (!snapshot.snapshotId) errors.push('Snapshot is missing ID');
    if (!snapshot.assetId) errors.push('Snapshot is missing asset ID');
    if (snapshot.metrics.clicks !== undefined && snapshot.metrics.impressions !== undefined) {
      if (snapshot.metrics.clicks > snapshot.metrics.impressions) {
        errors.push('Clicks count cannot exceed impressions count');
      }
    }
    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  async fetchPerformance(assetId: string, channel: string, externalId?: string): Promise<PerformanceSnapshot> {
    // Generate realistic, pseudo-random but repeatable metrics
    const baseVal = assetId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const impressions = 500 + (baseVal % 500);
    const clicks = Math.floor(impressions * (0.02 + (baseVal % 5) / 100)); // CTR between 2% and 7%
    const ctr = clicks / impressions;
    const pageViews = Math.floor(clicks * 1.2);
    const conversions = Math.floor(pageViews * (0.01 + (baseVal % 3) / 100)); // Conv rate between 1% and 4%
    const engagement = 0.5 + (baseVal % 10) / 20; // engagement between 0.5 and 1.0

    const now = new Date();
    const periodStart = new Date(now.getTime() - 7 * 24 * 3600000).toISOString();
    const periodEnd = now.toISOString();

    const snapshot: PerformanceSnapshot = {
      snapshotId: `snap_${assetId}_${Date.now()}`,
      assetId,
      channel,
      externalId: externalId || `ext_${assetId}`,
      capturedAt: now.toISOString(),
      metrics: {
        impressions,
        clicks,
        ctr,
        pageViews,
        conversions,
        engagement,
        reactions: channel === 'linkedin' ? Math.floor(clicks * 0.1) : undefined,
        shares: channel === 'linkedin' ? Math.floor(clicks * 0.02) : undefined
      },
      periodStart,
      periodEnd,
      dataSource: this.providerName
    };

    return snapshot;
  }
}
