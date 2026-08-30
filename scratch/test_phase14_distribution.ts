// scratch/test_phase14_distribution.ts
import { 
  DistributionChannelSchema, 
  DistributionRequestSchema, 
  DistributionResultSchema, 
  DistributionJobSchema,
  ContentAsset,
  SaaSProfile
} from '../src/core/contracts/schemas';
import { DistributionService, DistributionRepository } from '../src/lib/distribution/DistributionService';
import { DistributionPlanner } from '../src/lib/distribution/DistributionPlanner';
import { DistributionTransformer } from '../src/lib/distribution/DistributionTransformer';
import { WebhookDistributionProvider } from '../src/lib/distribution/WebhookDistributionProvider';
import { DistributionProvider } from '../src/core/contracts/distribution-providers';

async function runTests() {
  console.log('=== STARTING PHASE 14 DISTRIBUTION TESTS ===\n');

  // 1. Zod schema validation
  console.log('1. Testing Zod Schemas...');
  
  // Valid channel validation
  DistributionChannelSchema.parse('webhook');
  DistributionChannelSchema.parse('linkedin');

  // Valid request
  const validRequest = {
    contentAssetId: 'asset_123',
    channels: ['webhook', 'linkedin'],
    publishMode: 'now',
    idempotencyKey: 'idem_key_123'
  };
  DistributionRequestSchema.parse(validRequest);

  // Valid result
  const validResult = {
    channel: 'webhook',
    status: 'PUBLISHED',
    externalId: 'ext_999',
    publishedUrl: 'https://webhook.site/post',
    telemetry: { durationMs: 120, attempts: 1 }
  };
  DistributionResultSchema.parse(validResult);

  // Valid job
  const validJob = {
    jobId: 'job_123',
    assetId: 'asset_123',
    channel: 'webhook',
    status: 'PUBLISHED',
    attempts: 1,
    idempotencyKey: 'idem_key_123',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  DistributionJobSchema.parse(validJob);

  console.log('✅ Zod schemas validated successfully.');

  // 2. Planning and Transformation
  console.log('\n2. Testing Planning and Transformation...');
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
    title: 'Top 5 Resume Tips',
    bodyMarkdown: 'These are the tips for building a great tech resume.',
    wordCount: 10,
    seoScore: 90,
    references: []
  };

  const plan = DistributionPlanner.planDistribution(saasProfile, asset, ['webhook', 'linkedin']);
  if (plan.eligibleChannels.length !== 2) {
    console.error('❌ Planner failed to include both channels', plan);
    process.exit(1);
  }

  const payloadWh = DistributionTransformer.transform(asset, 'webhook');
  if (payloadWh.title !== 'Top 5 Resume Tips' || !payloadWh.body) {
    console.error('❌ Webhook transformer failed', payloadWh);
    process.exit(1);
  }

  const payloadLi = DistributionTransformer.transform(asset, 'linkedin');
  if (!payloadLi.text.includes('🚀 Just Published:')) {
    console.error('❌ LinkedIn transformer failed', payloadLi);
    process.exit(1);
  }
  console.log('✅ Planning and transformation mapping: PASSED');

  // Mock Persistence Repository
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

  // 3. Webhook Provider validation & publish dry-run
  console.log('\n3. Testing Webhook Distribution Provider (Dry-run mode)...');
  const whProvider = new WebhookDistributionProvider();
  
  // Validation checks
  const badVal = await whProvider.validate({});
  if (badVal.valid) {
    console.error('❌ Webhook validation failed to reject empty payload');
    process.exit(1);
  }

  const goodVal = await whProvider.validate({ title: 'Hello', body: 'World' });
  if (!goodVal.valid) {
    console.error('❌ Webhook validation rejected valid payload', goodVal);
    process.exit(1);
  }

  // Dry-run publishing simulation
  const dryRes = await whProvider.publish({ title: 'Hello', body: 'World', slug: 'hello' }, { dryRun: true });
  if (dryRes.status !== 'PUBLISHED' || !dryRes.externalId?.startsWith('sim_') || !dryRes.publishedUrl) {
    console.error('❌ Webhook dry-run simulation failed', dryRes);
    process.exit(1);
  }
  console.log('✅ Webhook provider validation and dry-run simulations: PASSED');

  // 4. Coordinator Flow: Success & State Transition validation
  console.log('\n4. Testing coordinator workflow success states and transitions...');
  const service = new DistributionService([whProvider], mockRepo);
  const request: any = {
    contentAssetId: 'asset_123',
    channels: ['webhook'],
    publishMode: 'now',
    idempotencyKey: 'key_success'
  };

  const results = await service.distributeAsset(saasProfile, asset, request, { dryRun: true });
  if (results.length !== 1 || results[0].status !== 'PUBLISHED') {
    console.error('❌ Coordinator flow execution failed', results);
    process.exit(1);
  }

  // Verify status transitions occurred in local mock database
  const finalJob = jobsDb.get('key_success_webhook');
  if (!finalJob || finalJob.status !== 'PUBLISHED' || finalJob.idempotencyKey !== 'key_success') {
    console.error('❌ Coordinator job state update failed', finalJob);
    process.exit(1);
  }
  console.log('✅ Coordinator state transitions & success outputs: PASSED');

  // 5. Idempotency Check
  console.log('\n5. Testing idempotency check...');
  const secondResults = await service.distributeAsset(saasProfile, asset, request, { dryRun: true });
  if (secondResults.length !== 1 || secondResults[0].status !== 'PUBLISHED' || secondResults[0].externalId !== finalJob.externalId) {
    console.error('❌ Idempotency loop failed to return cached response', secondResults);
    process.exit(1);
  }
  console.log('✅ Idempotency prevention check: PASSED');

  // 6. Bounded Retries & Backoff
  console.log('\n6. Testing Bounded Retries with backoff...');
  let publishCallsCount = 0;
  const failingProvider: DistributionProvider = {
    channelName: 'webhook',
    validate: async () => ({ valid: true }),
    publish: async () => {
      publishCallsCount++;
      return { channel: 'webhook', status: 'FAILED', error: 'Connection lost' };
    }
  };

  const retryService = new DistributionService([failingProvider], mockRepo);
  const failRequest: any = {
    contentAssetId: 'asset_123',
    channels: ['webhook'] as any[],
    publishMode: 'now' as any,
    idempotencyKey: 'key_fail'
  };

  const failResults = await retryService.distributeAsset(saasProfile, asset, failRequest, { dryRun: true });
  if (failResults[0].status !== 'FAILED' || publishCallsCount !== 3) {
    console.error('❌ Bounded retry policy did not attempt exactly 3 times before failing', failResults, publishCallsCount);
    process.exit(1);
  }
  console.log('✅ Bounded retries limit execution loops: PASSED');

  // 7. Multi-channel Isolation
  console.log('\n7. Testing Multi-channel Isolation...');
  const successfulProvider: DistributionProvider = {
    channelName: 'linkedin',
    validate: async () => ({ valid: true }),
    publish: async () => ({ channel: 'linkedin', status: 'PUBLISHED', externalId: 'li_success' })
  };

  const multiService = new DistributionService([failingProvider, successfulProvider], mockRepo);
  const multiRequest: any = {
    contentAssetId: 'asset_123',
    channels: ['webhook', 'linkedin'] as any[],
    publishMode: 'now' as any,
    idempotencyKey: 'key_multi'
  };

  const multiResults = await multiService.distributeAsset(saasProfile, asset, multiRequest);
  const whRes = multiResults.find(r => r.channel === 'webhook');
  const liRes = multiResults.find(r => r.channel === 'linkedin');
  if (whRes?.status !== 'FAILED' || liRes?.status !== 'PUBLISHED') {
    console.error('❌ Channel failure leaked and broke other channels', whRes, liRes);
    process.exit(1);
  }
  console.log('✅ Multi-channel failure isolation: PASSED');

  // 8. Scheduling & Cancellation
  console.log('\n8. Testing Scheduling & Cancellation...');
  const scheduleRequest: any = {
    contentAssetId: 'asset_123',
    channels: ['webhook'] as any[],
    publishMode: 'schedule' as any,
    scheduledAt: new Date(Date.now() + 3600000).toISOString(),
    idempotencyKey: 'key_schedule'
  };

  const schedResults = await service.distributeAsset(saasProfile, asset, scheduleRequest, { dryRun: true });
  if (schedResults[0].status !== 'SCHEDULED') {
    console.error('❌ Scheduling flow failed', schedResults);
    process.exit(1);
  }

  const schedJob = jobsDb.get('key_schedule_webhook');
  if (!schedJob || schedJob.status !== 'SCHEDULED') {
    console.error('❌ Saved job is not in SCHEDULED state', schedJob);
    process.exit(1);
  }

  // Cancel job
  const cancelSuccess = await service.cancelScheduledJob('key_schedule_webhook');
  const cancelledJob = jobsDb.get('key_schedule_webhook');
  if (!cancelSuccess || cancelledJob.status !== 'CANCELLED') {
    console.error('❌ Cancellation flow failed to cancel job', cancelSuccess, cancelledJob);
    process.exit(1);
  }
  console.log('✅ Job scheduling and cancellation logic: PASSED');

  console.log('\n🎉 ALL PHASE 14 DISTRIBUTION TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ TEST RUN EXCEPTION:', err);
  process.exit(1);
});
