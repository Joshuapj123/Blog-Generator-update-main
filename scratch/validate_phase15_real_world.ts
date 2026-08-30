// scratch/validate_phase15_real_world.ts
import { PerformanceSnapshotSchema, PerformanceInsightSchema, PerformanceRecommendationSchema } from '../src/core/contracts/schemas';
import { MockPerformanceProvider } from '../src/lib/performance/MockPerformanceProvider';
import { PerformanceCollector, PerformanceSnapshotRepository } from '../src/lib/performance/PerformanceCollector';
import { PerformanceAnalyzer } from '../src/lib/performance/PerformanceAnalyzer';
import { PerformanceInsightEngine } from '../src/lib/performance/PerformanceInsightEngine';
import { RecommendationEngine } from '../src/lib/performance/RecommendationEngine';

async function validateRealWorld() {
  console.log('=== STARTING PHASE 15 PERFORMANCE LOOP VALIDATION ===');
  console.log('Real analytics provider not connected; architecture validated using deterministic provider.');

  const assetId = 'asset_rc_101';
  const channel = 'webhook';

  const provider = new MockPerformanceProvider();
  const snapsDb = new Map<string, any>();
  const mockRepo: PerformanceSnapshotRepository = {
    saveSnapshot: async (snap: any) => {
      snapsDb.set(snap.snapshotId, snap);
      return snap.snapshotId;
    }
  };

  const collector = new PerformanceCollector([provider], mockRepo);

  const job: any = {
    jobId: `job_${assetId}_${channel}`,
    assetId,
    channel,
    status: 'PUBLISHED' as const,
    attempts: 1,
    idempotencyKey: `idem_${assetId}_${channel}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  console.log('\n1. Collecting latest snapshot...');
  const snap = await collector.collectMetricsForJob(job, 'mock-analytics');
  if (!snap) {
    console.error('❌ Error: Snapshot collection returned null');
    process.exit(1);
  }
  snap.metrics = {
    impressions: 1500,
    clicks: 15,
    ctr: 15 / 1500,
    pageViews: 150,
    conversions: 1,
    engagement: 0.8
  };
  PerformanceSnapshotSchema.parse(snap);

  console.log('\n2. Creating mock history snapshots for trend calculation...');
  const pastSnap = {
    ...snap,
    snapshotId: 'snap_past_1',
    capturedAt: new Date(Date.now() - 5 * 24 * 3600000).toISOString(),
    metrics: {
      impressions: 1200,
      clicks: 10, // low CTR
      ctr: 10 / 1200,
      pageViews: 10,
      conversions: 0,
      engagement: 0.8
    }
  };

  const snapshotsList = [pastSnap, snap];

  console.log('\n3. Analyzing historical trends...');
  const trendAnalysis = PerformanceAnalyzer.analyzeTrends(snapshotsList);
  console.log(`Trend: ${trendAnalysis.trend}`);
  console.log(`Clicks Change: ${trendAnalysis.changes.clicksChangePercent.toFixed(1)}%`);
  console.log(`CTR Change: ${trendAnalysis.changes.ctrChangePercent.toFixed(1)}%`);

  console.log('\n4. Running Insight & Recommendation Engines...');
  const insights = PerformanceInsightEngine.generateInsights(snapshotsList);
  const recommendations = RecommendationEngine.generateRecommendations(insights);

  console.log(`\nGenerated ${insights.length} Insights:`);
  insights.forEach(ins => {
    console.log(`- [${ins.severity}] Insight Type: ${ins.type}`);
    console.log(`  Evidence: ${ins.evidence}`);
    console.log(`  Suggested Action: ${ins.suggestedAction}`);
    PerformanceInsightSchema.parse(ins);
  });

  console.log(`\nGenerated ${recommendations.length} Recommendations:`);
  recommendations.forEach(rec => {
    console.log(`- Recommendation Change: ${rec.changeType}`);
    console.log(`  Rationale: ${rec.rationale}`);
    console.log(`  Confidence: ${rec.confidence.toFixed(2)}`);
    console.log(`  Expected Objective: ${rec.expectedObjective}`);
    PerformanceRecommendationSchema.parse(rec);
  });

  console.log('\n✅ PERFORMANCE FEEDBACK LOOP VALIDATION PASSED SUCCESSFULLY!');
}

validateRealWorld();
