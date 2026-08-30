import { PerformanceSnapshot, PerformanceInsight } from '@/core/contracts/schemas';

export class PerformanceInsightEngine {
  static generateInsights(snapshots: PerformanceSnapshot[]): PerformanceInsight[] {
    const insights: PerformanceInsight[] = [];
    if (snapshots.length === 0) return insights;

    // Sort to get the latest snapshot
    const sorted = [...snapshots].sort((a, b) => 
      new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
    );
    const latest = sorted[sorted.length - 1];
    const { assetId, metrics } = latest;

    const impressions = metrics.impressions || 0;
    const clicks = metrics.clicks || 0;
    const ctr = metrics.ctr || 0;
    const pageViews = metrics.pageViews || clicks;
    const conversions = metrics.conversions || 0;
    const engagement = metrics.engagement || 0;

    // 1. Pattern: High impressions, Low CTR
    if (impressions > 800 && ctr < 0.02) {
      insights.push({
        insightId: `ins_ctr_${assetId}_${Date.now()}`,
        assetId,
        type: 'HIGH_IMPRESSIONS_LOW_CTR',
        severity: 'High',
        evidence: `Asset has high impressions (${impressions}) but sub-optimal Click-Through Rate (${(ctr * 100).toFixed(2)}%).`,
        confidence: 0.85,
        suggestedAction: 'Refine title tag and meta description to align with searcher expectations.',
        createdAt: new Date().toISOString()
      });
    }

    // 2. Pattern: High clicks, Low conversion rate
    const conversionRate = pageViews > 0 ? conversions / pageViews : 0;
    if (pageViews > 50 && conversionRate < 0.015) {
      insights.push({
        insightId: `ins_conv_${assetId}_${Date.now()}`,
        assetId,
        type: 'HIGH_CLICKS_LOW_CONVERSION',
        severity: 'High',
        evidence: `Asset attracts traffic (${pageViews} page views) but converts poorly (${(conversionRate * 100).toFixed(2)}% conversion rate).`,
        confidence: 0.9,
        suggestedAction: 'Enhance Call-to-Action (CTA) copywriting, optimize user value alignment, or audit positioning.',
        createdAt: new Date().toISOString()
      });
    }

    // 3. Pattern: High engagement, Low impressions
    if (engagement > 0.75 && impressions < 400 && impressions > 0) {
      insights.push({
        insightId: `ins_traffic_${assetId}_${Date.now()}`,
        assetId,
        type: 'HIGH_ENGAGEMENT_LOW_TRAFFIC',
        severity: 'Medium',
        evidence: `Asset shows strong reader engagement score (${(engagement * 100).toFixed(0)}%) but is held back by low search engine visibility (${impressions} impressions).`,
        confidence: 0.75,
        suggestedAction: 'Conduct keyword optimization, check GEO visibility indices, or expand distribution channels.',
        createdAt: new Date().toISOString()
      });
    }

    return insights;
  }
}
