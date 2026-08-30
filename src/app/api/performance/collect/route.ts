import { NextResponse } from 'next/server';
import { MockPerformanceProvider } from '@/lib/performance/MockPerformanceProvider';
import { PerformanceCollector } from '@/lib/performance/PerformanceCollector';
import { PerformanceAnalyzer } from '@/lib/performance/PerformanceAnalyzer';
import { PerformanceInsightEngine } from '@/lib/performance/PerformanceInsightEngine';
import { RecommendationEngine } from '@/lib/performance/RecommendationEngine';
import { getPerformanceSnapshots, savePerformanceInsight, savePerformanceRecommendation } from '@/lib/firebase/firestore';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const { assetId, channel, externalId, providerName = 'mock-analytics' } = payload;

    if (!assetId || !channel) {
      return NextResponse.json({ error: 'Missing assetId or channel parameters.' }, { status: 400 });
    }

    // 1. Initialize Mock provider and Collector
    const provider = new MockPerformanceProvider();
    const collector = new PerformanceCollector([provider]);

    const job = {
      jobId: `job_${assetId}_${channel}`,
      assetId,
      channel,
      status: 'PUBLISHED' as const,
      attempts: 1,
      idempotencyKey: `idem_${assetId}_${channel}`,
      externalId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // 2. Collect latest snapshot
    const snapshot = await collector.collectMetricsForJob(job, providerName);
    if (!snapshot) {
      return NextResponse.json({ error: 'Failed to collect performance metrics' }, { status: 500 });
    }

    // 3. Fetch past snapshots for trend analysis
    let historicalSnaps: any[] = [];
    try {
      historicalSnaps = await getPerformanceSnapshots();
    } catch (e) {
      console.warn('[Performance API] Firestore error reading snapshots:', e);
    }

    // Filter historical snapshots for this specific asset
    const assetSnaps = historicalSnaps.filter(s => s.assetId === assetId && s.channel === channel);
    // Append the latest one we just collected
    assetSnaps.push(snapshot);

    // 4. Trend Analysis
    const trendAnalysis = PerformanceAnalyzer.analyzeTrends(assetSnaps);

    // 5. Generate Insights & Recommendations
    const insights = PerformanceInsightEngine.generateInsights(assetSnaps);
    const recommendations = RecommendationEngine.generateRecommendations(insights);

    // 6. Persist insights and recommendations
    for (const insight of insights) {
      try {
        await savePerformanceInsight(insight);
      } catch (e) {
        console.warn('[Performance API] Firestore failed to save insight:', e);
      }
    }

    for (const rec of recommendations) {
      try {
        await savePerformanceRecommendation(rec);
      } catch (e) {
        console.warn('[Performance API] Firestore failed to save recommendation:', e);
      }
    }

    return NextResponse.json({
      snapshot,
      trendAnalysis,
      insights,
      recommendations
    });
  } catch (err: any) {
    console.error('[Performance API] Collection Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
