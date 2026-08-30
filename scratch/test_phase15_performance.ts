// scratch/test_phase15_performance.ts
import { 
  PerformanceMetricSchema, 
  PerformanceSnapshotSchema, 
  PerformanceInsightSchema, 
  PerformanceRecommendationSchema,
  PerformanceSnapshot,
  DistributionJob
} from '../src/core/contracts/schemas';
import { MockPerformanceProvider } from '../src/lib/performance/MockPerformanceProvider';
import { PerformanceCollector, PerformanceSnapshotRepository } from '../src/lib/performance/PerformanceCollector';
import { PerformanceAnalyzer } from '../src/lib/performance/PerformanceAnalyzer';
import { PerformanceInsightEngine } from '../src/lib/performance/PerformanceInsightEngine';
import { RecommendationEngine } from '../src/lib/performance/RecommendationEngine';

async function runTests() {
  console.log('=== STARTING PHASE 15 PERFORMANCE LOOP TESTS ===\n');

  // 1. Zod schemas validation
  console.log('1. Testing Zod Schemas...');
  
  const metric = { impressions: 100, clicks: 10, ctr: 0.1, pageViews: 12, conversions: 1, engagement: 0.8 };
  PerformanceMetricSchema.parse(metric);

  const snapshot: PerformanceSnapshot = {
    snapshotId: 'snap_123',
    assetId: 'asset_999',
    channel: 'webhook',
    externalId: 'ext_999',
    capturedAt: new Date().toISOString(),
    metrics: metric,
    periodStart: new Date().toISOString(),
    periodEnd: new Date().toISOString(),
    dataSource: 'mock-analytics'
  };
  PerformanceSnapshotSchema.parse(snapshot);

  const insight = {
    insightId: 'ins_123',
    assetId: 'asset_999',
    type: 'HIGH_IMPRESSIONS_LOW_CTR',
    severity: 'High',
    evidence: 'test evidence',
    confidence: 0.9,
    suggestedAction: 'improve headers',
    createdAt: new Date().toISOString()
  };
  PerformanceInsightSchema.parse(insight);

  const rec = {
    recommendationId: 'rec_123',
    insightId: 'ins_123',
    assetId: 'asset_999',
    changeType: 'UPDATE_TITLE',
    rationale: 'Title tags are poorly worded.',
    confidence: 0.8,
    expectedObjective: 'Increase CTR.',
    applied: false,
    createdAt: new Date().toISOString()
  };
  PerformanceRecommendationSchema.parse(rec);

  console.log('✅ Zod schemas validated successfully.');

  // Mock Persistence Repository
  const snapsDb = new Map<string, any>();
  const mockRepo: PerformanceSnapshotRepository = {
    saveSnapshot: async (snap: any) => {
      snapsDb.set(snap.snapshotId, snap);
      return snap.snapshotId;
    }
  };

  // 2. Metrics Collection & Normalization via Mock Provider
  console.log('\n2. Testing Metrics Collection & Normalization...');
  const provider = new MockPerformanceProvider();
  const collector = new PerformanceCollector([provider], mockRepo);

  const job: DistributionJob = {
    jobId: 'job_asset_999_webhook',
    assetId: 'asset_999',
    channel: 'webhook',
    status: 'PUBLISHED',
    attempts: 1,
    idempotencyKey: 'idem_999_webhook',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const snap1 = await collector.collectMetricsForJob(job, 'mock-analytics');
  if (!snap1 || snapsDb.size !== 1) {
    console.error('❌ Collector failed to harvest and save snapshot', snap1);
    process.exit(1);
  }
  PerformanceSnapshotSchema.parse(snap1);
  console.log('✅ Metrics collection & serialization validation: PASSED');

  // 3. Trend analysis & Insufficient data handling
  console.log('\n3. Testing Trend analysis & Insufficient-data handling...');
  
  // Test case 1: Insufficient observations (only 1 snapshot)
  const singleAnalysis = PerformanceAnalyzer.analyzeTrends([snap1]);
  if (singleAnalysis.trend !== 'INSUFFICIENT_DATA') {
    console.error('❌ Trend analysis failed to return INSUFFICIENT_DATA on single observation', singleAnalysis);
    process.exit(1);
  }

  // Test case 2: Stable/Improving trend with 2 snapshots
  const snap2: PerformanceSnapshot = {
    ...snap1,
    snapshotId: 'snap_123_new',
    capturedAt: new Date(Date.now() + 86400000).toISOString(),
    metrics: {
      ...snap1.metrics,
      clicks: (snap1.metrics.clicks || 10) * 1.5, // 50% increase
      ctr: (snap1.metrics.ctr || 0.05) * 1.5
    }
  };

  const dualAnalysis = PerformanceAnalyzer.analyzeTrends([snap1, snap2]);
  if (dualAnalysis.trend !== 'IMPROVING' || dualAnalysis.changes.clicksChangePercent !== 50) {
    console.error('❌ Trend analysis failed to calculate improving rate correctly', dualAnalysis);
    process.exit(1);
  }
  console.log('✅ Trend analysis & Insufficient-data safety: PASSED');

  // 4. Insight Engine matching validation
  console.log('\n4. Testing Insight Engine pattern recognition...');
  
  // Test high impressions, low CTR pattern
  const lowCtrSnap: PerformanceSnapshot = {
    ...snap1,
    snapshotId: 'snap_low_ctr',
    metrics: {
      impressions: 1200,
      clicks: 10,
      ctr: 10 / 1200, // < 2%
      pageViews: 10,
      conversions: 1
    }
  };
  const ctrInsights = PerformanceInsightEngine.generateInsights([lowCtrSnap]);
  if (ctrInsights.length !== 1 || ctrInsights[0].type !== 'HIGH_IMPRESSIONS_LOW_CTR') {
    console.error('❌ Insight engine failed to trigger HIGH_IMPRESSIONS_LOW_CTR', ctrInsights);
    process.exit(1);
  }

  // Test high clicks, low conversion pattern
  const lowConvSnap: PerformanceSnapshot = {
    ...snap1,
    snapshotId: 'snap_low_conv',
    metrics: {
      impressions: 500,
      clicks: 100,
      ctr: 0.2,
      pageViews: 100,
      conversions: 0 // 0% conversion rate
    }
  };
  const convInsights = PerformanceInsightEngine.generateInsights([lowConvSnap]);
  if (convInsights.length !== 1 || convInsights[0].type !== 'HIGH_CLICKS_LOW_CONVERSION') {
    console.error('❌ Insight engine failed to trigger HIGH_CLICKS_LOW_CONVERSION', convInsights);
    process.exit(1);
  }

  // Test high engagement, low traffic pattern
  const lowTrafficSnap: PerformanceSnapshot = {
    ...snap1,
    snapshotId: 'snap_low_traffic',
    metrics: {
      impressions: 250,
      clicks: 25,
      ctr: 0.1,
      pageViews: 25,
      conversions: 5,
      engagement: 0.9 // high engagement
    }
  };
  const trafficInsights = PerformanceInsightEngine.generateInsights([lowTrafficSnap]);
  if (trafficInsights.length !== 1 || trafficInsights[0].type !== 'HIGH_ENGAGEMENT_LOW_TRAFFIC') {
    console.error('❌ Insight engine failed to trigger HIGH_ENGAGEMENT_LOW_TRAFFIC', trafficInsights);
    process.exit(1);
  }
  console.log('✅ Insight engine pattern recognition: PASSED');

  // 5. Recommendation Engine output validation
  console.log('\n5. Testing Recommendation Engine actionable outputs...');
  const recs = RecommendationEngine.generateRecommendations(ctrInsights);
  const metadataRec = recs.find(r => r.changeType === 'UPDATE_META_DESCRIPTION');
  const titleRec = recs.find(r => r.changeType === 'UPDATE_TITLE');
  if (!metadataRec || !titleRec || !metadataRec.rationale.includes('meta') || metadataRec.confidence !== ctrInsights[0].confidence * 0.9) {
    console.error('❌ Recommendation engine produced invalid titles or metadata changes', recs);
    process.exit(1);
  }

  const ctaRecs = RecommendationEngine.generateRecommendations(convInsights);
  if (ctaRecs.length !== 1 || ctaRecs[0].changeType !== 'IMPROVE_CTA' || ctaRecs[0].expectedObjective.indexOf('signup') === -1) {
    console.error('❌ Recommendation engine failed to recommend CTAs modifications', ctaRecs);
    process.exit(1);
  }
  console.log('✅ Recommendation engine actionable outputs: PASSED');

  console.log('\n🎉 ALL PHASE 15 PERFORMANCE LOOP TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ TEST RUN EXCEPTION:', err);
  process.exit(1);
});
