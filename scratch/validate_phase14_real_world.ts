// scratch/validate_phase14_real_world.ts
import 'dotenv/config';
import { DistributionService, DistributionRepository } from '../src/lib/distribution/DistributionService';
import { WebhookDistributionProvider } from '../src/lib/distribution/WebhookDistributionProvider';
import { ContentAsset, SaaSProfile } from '../src/core/contracts/schemas';

async function validateRealWorld() {
  console.log('=== STARTING PHASE 14 REAL-WORLD WEBHOOK INTEGRATION VALIDATION ===');
  
  // Set real endpoint
  process.env.DISTRIBUTION_WEBHOOK_URL = 'https://httpbin.org/post';
  process.env.ENABLE_DISTRIBUTION_DRY_RUN = 'false';

  console.log(`Setting DISTRIBUTION_WEBHOOK_URL = "${process.env.DISTRIBUTION_WEBHOOK_URL}"`);

  const saasProfile: SaaSProfile = {
    name: 'ResumeCraft',
    description: 'AI resume builder specializing in student and developer resumes.',
    targetAudience: 'Student developers',
    keyFeatures: ['Bullet points optimizer', 'LinkedIn sync'],
    primaryCompetitors: ['tealhq.com'],
    tone: 'professional',
    customInsights: 'none'
  };

  const asset: ContentAsset = {
    title: 'Top 5 Developer Resume Tips',
    bodyMarkdown: '1. Use active verbs.\n2. Quantify achievements.\n3. Keep under one page.',
    wordCount: 15,
    seoScore: 95,
    slug: 'top-5-developer-resume-tips',
    references: []
  };

  const jobsDb = new Map<string, any>();
  const mockRepo: DistributionRepository = {
    saveJob: async (job: any) => {
      jobsDb.set(job.jobId, { ...jobsDb.get(job.jobId), ...job });
      return job.jobId;
    },
    getJobByIdempotencyKey: async (key: string) => {
      for (const j of jobsDb.values()) {
        if (j.idempotencyKey === key) return j;
      }
      return null;
    },
    getJobById: async (id: string) => {
      return jobsDb.get(id) || null;
    }
  };

  const provider = new WebhookDistributionProvider();
  const service = new DistributionService([provider], mockRepo);

  const request: any = {
    contentAssetId: 'asset_real_999',
    channels: ['webhook'] as any[],
    publishMode: 'now' as any,
    idempotencyKey: 'idem_real_' + Date.now()
  };

  const startTime = Date.now();

  try {
    console.log('\nDispatching real Webhook POST request...');
    const results = await service.distributeAsset(saasProfile, asset, request, { dryRun: false });
    const duration = Date.now() - startTime;

    console.log(`\nValidation completed in ${(duration / 1000).toFixed(2)}s.`);
    
    if (results.length === 1 && results[0].status === 'PUBLISHED') {
      console.log('\n--- TELEMETRY ---');
      console.log(`Channel: ${results[0].channel}`);
      console.log(`Status: ${results[0].status}`);
      console.log(`External ID: ${results[0].externalId}`);
      console.log(`Published URL: ${results[0].publishedUrl}`);
      console.log(`Duration: ${results[0].telemetry?.durationMs}ms`);
      console.log(`Attempts: ${results[0].telemetry?.attempts}`);
      console.log('\n✅ REAL-WORLD WEBHOOK VALIDATION PASSED SUCCESSFULLY!');
    } else {
      console.error('❌ Error: Webhook dispatch failed!', results);
      process.exit(1);
    }
  } catch (err: any) {
    console.error('❌ REAL-WORLD VALIDATION FAILED:', err.message);
    process.exit(1);
  }
}

validateRealWorld();
