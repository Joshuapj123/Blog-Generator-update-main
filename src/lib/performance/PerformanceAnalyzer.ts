import { PerformanceSnapshot } from '@/core/contracts/schemas';

export type PerformanceTrend = 'IMPROVING' | 'STABLE' | 'DECLINING' | 'INSUFFICIENT_DATA';

export interface AnalysisSummary {
  assetId: string;
  channel: string;
  trend: PerformanceTrend;
  latestMetrics: any;
  previousMetrics: any;
  changes: {
    clicksChangePercent: number;
    ctrChangePercent: number;
    viewsChangePercent: number;
  };
}

export class PerformanceAnalyzer {
  static analyzeTrends(snapshots: PerformanceSnapshot[]): AnalysisSummary {
    if (snapshots.length === 0) {
      return {
        assetId: '',
        channel: '',
        trend: 'INSUFFICIENT_DATA',
        latestMetrics: {},
        previousMetrics: {},
        changes: { clicksChangePercent: 0, ctrChangePercent: 0, viewsChangePercent: 0 }
      };
    }

    // Sort snapshots by capturedAt ascending (oldest first, latest last)
    const sorted = [...snapshots].sort((a, b) => 
      new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
    );

    const latest = sorted[sorted.length - 1];
    
    if (sorted.length < 2) {
      return {
        assetId: latest.assetId,
        channel: latest.channel,
        trend: 'INSUFFICIENT_DATA',
        latestMetrics: latest.metrics,
        previousMetrics: {},
        changes: { clicksChangePercent: 0, ctrChangePercent: 0, viewsChangePercent: 0 }
      };
    }

    const previous = sorted[sorted.length - 2];

    const getVal = (metrics: any, key: string) => metrics[key] || 0;

    const latestClicks = getVal(latest.metrics, 'clicks');
    const prevClicks = getVal(previous.metrics, 'clicks');
    
    const latestCtr = getVal(latest.metrics, 'ctr');
    const prevCtr = getVal(previous.metrics, 'ctr');

    const latestViews = getVal(latest.metrics, 'pageViews') || getVal(latest.metrics, 'impressions');
    const prevViews = getVal(previous.metrics, 'pageViews') || getVal(previous.metrics, 'impressions');

    const calcChange = (cur: number, prev: number) => {
      if (prev === 0) return cur > 0 ? 100 : 0;
      return ((cur - prev) / prev) * 100;
    };

    const clicksChangePercent = calcChange(latestClicks, prevClicks);
    const ctrChangePercent = calcChange(latestCtr, prevCtr);
    const viewsChangePercent = calcChange(latestViews, prevViews);

    // Trend determination logic: CTR and Clicks weight
    let trend: PerformanceTrend = 'STABLE';
    if (clicksChangePercent > 5 || ctrChangePercent > 5) {
      trend = 'IMPROVING';
    } else if (clicksChangePercent < -5 || ctrChangePercent < -5) {
      trend = 'DECLINING';
    }

    return {
      assetId: latest.assetId,
      channel: latest.channel,
      trend,
      latestMetrics: latest.metrics,
      previousMetrics: previous.metrics,
      changes: {
        clicksChangePercent,
        ctrChangePercent,
        viewsChangePercent
      }
    };
  }
}
