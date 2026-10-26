// scratch/test_phase_r5_artifact_boundary_and_lifecycle.ts
import assert from 'assert';
import {
  ArtifactLifecycleBoundary,
  ArtifactLifecycleState,
  ValidatedPublishableAsset,
  FINGERPRINT_VERSION
} from '../src/lib/content/ArtifactLifecycleBoundary';
import {
  ContentAsset,
  SaaSProfile,
  DistributionRequest,
  ContentBriefSchema
} from '../src/core/contracts/schemas';
import { DistributionPlanner } from '../src/lib/distribution/DistributionPlanner';
import { DistributionService, DistributionRepository } from '../src/lib/distribution/DistributionService';
import { ArticleExportService, ExportArticleInput } from '../src/lib/export/ArticleExportService';
import { ContentEvidenceValidator } from '../src/lib/intelligence/ContentEvidenceValidator';
import { ParagraphSignatureValidator } from '../src/lib/intelligence/ParagraphSignatureValidator';
import { WritingService } from '../src/lib/content/WritingService';

// Test runner helper
let passedCount = 0;
let failedCount = 0;

async function it(description: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  [PASS] ${description}`);
    passedCount++;
  } catch (err: any) {
    console.error(`  [FAIL] ${description}`);
    console.error(`         ${err.message || err}`);
    if (err.stack) {
      const lines = err.stack.split('\n').slice(1, 4).join('\n');
      console.error(`         ${lines}`);
    }
    failedCount++;
  }
}

// Verified valid test fixture
const validProse1 = 'Mobile conversion optimization requires dedicated product teams to inspect every step of customer onboarding.';
const validProse2 = 'Fast checkout systems noticeably increase user satisfaction across enterprise platforms. When engineers prioritize performance, retention metrics climb steadily.';
const validProse3 = 'Modern growth leaders review conversion analytics weekly to maintain operational focus and stakeholder alignment.';

const VALID_MARKDOWN = `# Conversion Guide

## Section One

${validProse1}

${validProse2}

## Section Two

${validProse3}`;

const TARGET_BRAND = 'AcmeSaaS';

const baseSaasProfile: SaaSProfile = {
  name: 'AcmeSaaS',
  description: 'B2B conversion optimization tooling',
  website: 'https://acmesaas.com',
  targetAudience: 'Product Managers',
  keyFeatures: ['Friction audit', 'Funnel telemetry'],
  primaryCompetitors: [],
  tone: 'professional',
  customInsights: 'none'
};

function createValidReadyAsset(): ContentAsset {
  const partialAsset = {
    title: 'Conversion Guide',
    bodyMarkdown: VALID_MARKDOWN,
    wordCount: VALID_MARKDOWN.split(/\s+/).filter(Boolean).length,
    seoScore: 92,
    qualityScore: 95,
    references: [],
    slug: 'conversion-guide',
    assetType: 'ARTICLE',
    targetKeyword: 'conversion optimization',
    metaTitle: 'Conversion Guide | AcmeSaaS',
    metaDescription: 'Complete guide to conversion optimization.',
    validationStatus: 'READY' as const,
    targetBrand: TARGET_BRAND
  };
  const fp = ArtifactLifecycleBoundary.computeFingerprint(partialAsset);
  return {
    ...partialAsset,
    validationFingerprint: fp,
    validatedAt: new Date().toISOString()
  };
}

async function runTests() {
  console.log('========================================================================');
  console.log(' ACUTE PHASE R5: TYPED ARTIFACT BOUNDARY & LIFECYCLE ADVERSARIAL SUITE');
  console.log('========================================================================\n');

  // 1. Valid fully reviewed artifact
  await it('Test 1: Valid fully reviewed artifact crosses boundary as READY with typed envelope', () => {
    const asset = createValidReadyAsset();
    const result = ArtifactLifecycleBoundary.verifyPublishableArtifact(asset, { saasProfile: baseSaasProfile });
    assert.strictEqual(result.isEligible, true);
    assert.strictEqual(result.status, 'READY');
    assert.strictEqual(result.envelope.isPublishable, true);
    assert.strictEqual(result.envelope.status, 'READY');
    assert.strictEqual(result.asset.validationStatus, 'READY');
    assert.strictEqual(result.asset.validationFingerprint, asset.validationFingerprint);
  });

  // 2. DRAFT artifact rejected
  await it('Test 2: DRAFT artifact is rejected with ERR_NOT_READY', () => {
    const asset = { ...createValidReadyAsset(), validationStatus: 'DRAFT' as const };
    const result = ArtifactLifecycleBoundary.verifyPublishableArtifact(asset, { saasProfile: baseSaasProfile });
    assert.strictEqual(result.isEligible, false);
    assert.strictEqual(result.status, 'DRAFT');
    assert.strictEqual(result.code, 'ERR_NOT_READY');
    assert.strictEqual(result.envelope.isPublishable, false);
  });

  // 3. Missing, null, undefined, and malformed status rejected
  await it('Test 3: Missing, undefined, or malformed validationStatus is rejected', () => {
    const assetNoStatus = { ...createValidReadyAsset(), validationStatus: undefined };
    const resNoStatus = ArtifactLifecycleBoundary.verifyPublishableArtifact(assetNoStatus, { saasProfile: baseSaasProfile });
    assert.strictEqual(resNoStatus.isEligible, false);
    assert.strictEqual(resNoStatus.code, 'ERR_NOT_READY');

    const assetMalformedStatus = { ...createValidReadyAsset(), validationStatus: 'APPROVED_BY_CALLER' as any };
    const resMalformed = ArtifactLifecycleBoundary.verifyPublishableArtifact(assetMalformedStatus, { saasProfile: baseSaasProfile });
    assert.strictEqual(resMalformed.isEligible, false);
    assert.strictEqual(resMalformed.code, 'ERR_NOT_READY');
  });

  // 4. REVIEW_REQUIRED artifact rejected
  await it('Test 4: REVIEW_REQUIRED artifact is rejected with ERR_REVIEW_REQUIRED', () => {
    const asset = { ...createValidReadyAsset(), validationStatus: 'REVIEW_REQUIRED' as const };
    const result = ArtifactLifecycleBoundary.verifyPublishableArtifact(asset, { saasProfile: baseSaasProfile });
    assert.strictEqual(result.isEligible, false);
    assert.strictEqual(result.status, 'REVIEW_REQUIRED');
    assert.strictEqual(result.code, 'ERR_REVIEW_REQUIRED');
    assert.strictEqual(result.envelope.isPublishable, false);
  });

  // 5. REJECTED artifact rejected
  await it('Test 5: REJECTED artifact is rejected with ERR_REJECTED', () => {
    const asset = { ...createValidReadyAsset(), validationStatus: 'REJECTED' as const };
    const result = ArtifactLifecycleBoundary.verifyPublishableArtifact(asset, { saasProfile: baseSaasProfile });
    assert.strictEqual(result.isEligible, false);
    assert.strictEqual(result.status, 'REJECTED');
    assert.strictEqual(result.code, 'ERR_REJECTED');
    assert.strictEqual(result.envelope.isPublishable, false);
  });

  // 6. Empty and whitespace-only body rejected
  await it('Test 6: Empty and whitespace-only body is rejected with ERR_EMPTY_BODY', () => {
    const assetEmpty = { ...createValidReadyAsset(), bodyMarkdown: '' };
    const resEmpty = ArtifactLifecycleBoundary.verifyPublishableArtifact(assetEmpty);
    assert.strictEqual(resEmpty.isEligible, false);
    assert.strictEqual(resEmpty.code, 'ERR_EMPTY_BODY');

    const assetWs = { ...createValidReadyAsset(), bodyMarkdown: '   \n\n\t  ' };
    const resWs = ArtifactLifecycleBoundary.verifyPublishableArtifact(assetWs);
    assert.strictEqual(resWs.isEligible, false);
    assert.strictEqual(resWs.code, 'ERR_EMPTY_BODY');
  });

  // 7. Missing fingerprint rejected
  await it('Test 7: Missing fingerprint is rejected with ERR_MISSING_FINGERPRINT', () => {
    const asset = { ...createValidReadyAsset(), validationFingerprint: undefined };
    const result = ArtifactLifecycleBoundary.verifyPublishableArtifact(asset, { saasProfile: baseSaasProfile });
    assert.strictEqual(result.isEligible, false);
    assert.strictEqual(result.code, 'ERR_MISSING_FINGERPRINT');
    assert.strictEqual(result.envelope.isPublishable, false);
  });

  // 8. Body modification rejected
  await it('Test 8: Body modification triggers fingerprint mismatch and is rejected', () => {
    const asset = createValidReadyAsset();
    const tampered = {
      ...asset,
      bodyMarkdown: asset.bodyMarkdown + '\n\nUnapproved extra promotional sentence added here.'
    };
    const result = ArtifactLifecycleBoundary.verifyPublishableArtifact(tampered, { saasProfile: baseSaasProfile });
    assert.strictEqual(result.isEligible, false);
    assert.strictEqual(result.status, 'STALE_FINGERPRINT');
    assert.strictEqual(result.code, 'ERR_STALE_VALIDATION_FINGERPRINT');
    assert.strictEqual(result.envelope.isPublishable, false);
  });

  // 9. Title modification rejected
  await it('Test 9: Title modification triggers fingerprint mismatch and is rejected', () => {
    const asset = createValidReadyAsset();
    const tampered = {
      ...asset,
      title: 'Completely Altered Title Without Validation'
    };
    const result = ArtifactLifecycleBoundary.verifyPublishableArtifact(tampered, { saasProfile: baseSaasProfile });
    assert.strictEqual(result.isEligible, false);
    assert.strictEqual(result.status, 'STALE_FINGERPRINT');
    assert.strictEqual(result.code, 'ERR_STALE_VALIDATION_FINGERPRINT');
  });

  // 10. Target-brand modification rejected
  await it('Test 10: Target-brand modification triggers fingerprint mismatch and is rejected', () => {
    const asset = createValidReadyAsset();
    const tampered = {
      ...asset,
      targetBrand: 'InjectedCompetitorBrand'
    };
    const result = ArtifactLifecycleBoundary.verifyPublishableArtifact(tampered, { saasProfile: baseSaasProfile });
    assert.strictEqual(result.isEligible, false);
    assert.strictEqual(result.status, 'STALE_FINGERPRINT');
    assert.strictEqual(result.code, 'ERR_STALE_VALIDATION_FINGERPRINT');
  });

  // 11. Slug or publication metadata modification rejected
  await it('Test 11: Slug or publication metadata modification triggers fingerprint mismatch', () => {
    const asset = createValidReadyAsset();
    const tamperedSlug = { ...asset, slug: 'altered-malicious-slug' };
    const resSlug = ArtifactLifecycleBoundary.verifyPublishableArtifact(tamperedSlug, { saasProfile: baseSaasProfile });
    assert.strictEqual(resSlug.isEligible, false);
    assert.strictEqual(resSlug.code, 'ERR_STALE_VALIDATION_FINGERPRINT');

    const tamperedMetaDesc = { ...asset, metaDescription: 'Altered meta description payload.' };
    const resMeta = ArtifactLifecycleBoundary.verifyPublishableArtifact(tamperedMetaDesc, { saasProfile: baseSaasProfile });
    assert.strictEqual(resMeta.isEligible, false);
    assert.strictEqual(resMeta.code, 'ERR_STALE_VALIDATION_FINGERPRINT');

    const tamperedKeyword = { ...asset, targetKeyword: 'completely-different-keyword' };
    const resKw = ArtifactLifecycleBoundary.verifyPublishableArtifact(tamperedKeyword, { saasProfile: baseSaasProfile });
    assert.strictEqual(resKw.isEligible, false);
    assert.strictEqual(resKw.code, 'ERR_STALE_VALIDATION_FINGERPRINT');
  });

  // 12. Malformed runtime schema rejected
  await it('Test 12: Malformed runtime schema (null, string, invalid wordCount) fails closed', () => {
    const resNull = ArtifactLifecycleBoundary.verifyPublishableArtifact(null);
    assert.strictEqual(resNull.isEligible, false);
    assert.strictEqual(resNull.code, 'ERR_MALFORMED_ASSET');

    const resStr = ArtifactLifecycleBoundary.verifyPublishableArtifact('not an object');
    assert.strictEqual(resStr.isEligible, false);
    assert.strictEqual(resStr.code, 'ERR_MALFORMED_ASSET');

    const assetBadWordCount = { ...createValidReadyAsset(), wordCount: -5 };
    const resBadCount = ArtifactLifecycleBoundary.verifyPublishableArtifact(assetBadWordCount);
    assert.strictEqual(resBadCount.isEligible, false);
    assert.strictEqual(resBadCount.code, 'ERR_SCHEMA_VALIDATION_FAILED');
  });

  // 13. Paragraph-signature violation rejected
  await it('Test 13: Structural paragraph signature repetition in body strictly fails closed', () => {
    const s_m2 = 'Mobile conversion rate optimization requires product teams to evaluate user friction across complex checkout screens.';
    const s_l1 = 'When enterprise product managers evaluate cross-platform mobile engagement strategies, they must weigh immediate conversion lifts against long-term customer lifetime retention, ensuring that aggressive promotional tactics do not degrade organic brand loyalty over time.';
    const s_m1 = 'Modern growth teams systematically analyze conversion telemetry to discover critical drop-off points across high-volume checkout funnels.';
    const s_m3 = 'Engineers implement targeted instrumentation to capture every user click before finalizing major application architecture decisions.';
    const s_m4 = 'Cross-functional squads regularly prioritize customer journey experiments to validate core hypotheses before investing engineering bandwidth.';

    const p1 = `${s_m2} ${s_l1} ${s_m1}`;
    const p2 = `${s_m3} ${s_l1} ${s_m1}`;
    const p3 = `${s_m4} ${s_l1} ${s_m1}`;
    const defectiveMd = `# Title\n\n## Sec\n\n${p1}\n\n${p2}\n\n${p3}`;

    const defectiveAsset: ContentAsset = {
      ...createValidReadyAsset(),
      bodyMarkdown: defectiveMd,
      validationStatus: 'READY'
    };
    const fp = ArtifactLifecycleBoundary.computeFingerprint(defectiveAsset);
    defectiveAsset.validationFingerprint = fp;

    const result = ArtifactLifecycleBoundary.verifyPublishableArtifact(defectiveAsset, { saasProfile: baseSaasProfile });
    assert.strictEqual(result.isEligible, false);
    assert.strictEqual(result.status, 'SIGNATURE_VIOLATION');
    assert.strictEqual(result.code, 'ERR_PARAGRAPH_SIGNATURE_VIOLATION');
    assert.strictEqual(result.envelope.isPublishable, false);
  });

  // 14. Critical quality failure rejected (brand mismatch)
  await it('Test 14: Entity / brand mismatch between asset and distribution profile strictly fails closed', () => {
    const asset = createValidReadyAsset();
    const wrongProfile: SaaSProfile = {
      ...baseSaasProfile,
      name: 'CompletelyDifferentBrand'
    };
    const result = ArtifactLifecycleBoundary.verifyPublishableArtifact(asset, { saasProfile: wrongProfile });
    assert.strictEqual(result.isEligible, false);
    assert.strictEqual(result.status, 'BRAND_MISMATCH');
    assert.strictEqual(result.code, 'ERR_BRAND_MISMATCH');
  });

  // 15. Successful R4 repair followed by full revalidation
  await it('Test 15: Successful repair yields fresh fingerprint and valid READY transition', () => {
    // Start with a candidate that had an old fingerprint
    const candidate = createValidReadyAsset();
    // Simulate repair creating new canonical prose
    const repairedMarkdown = `# Fixed Guide\n\n## Section\n\n${validProse1}\n\n${validProse2}\n\n${validProse3}`;
    const repairedAsset: ContentAsset = {
      ...candidate,
      title: 'Fixed Guide',
      bodyMarkdown: repairedMarkdown,
      validationStatus: 'READY'
    };
    // Fresh fingerprint computed post-repair
    repairedAsset.validationFingerprint = ArtifactLifecycleBoundary.computeFingerprint(repairedAsset);
    repairedAsset.validatedAt = new Date().toISOString();

    const result = ArtifactLifecycleBoundary.verifyPublishableArtifact(repairedAsset, { saasProfile: baseSaasProfile });
    assert.strictEqual(result.isEligible, true);
    assert.strictEqual(result.status, 'READY');
  });

  // 16. Exhausted R4 repair remains ineligible
  await it('Test 16: Exhausted repair remains in REVIEW_REQUIRED and is blocked from boundary', () => {
    const unrepairableAsset: ContentAsset = {
      ...createValidReadyAsset(),
      validationStatus: 'REVIEW_REQUIRED',
      validationFingerprint: undefined,
      validatedAt: undefined
    };
    const result = ArtifactLifecycleBoundary.verifyPublishableArtifact(unrepairableAsset, { saasProfile: baseSaasProfile });
    assert.strictEqual(result.isEligible, false);
    assert.strictEqual(result.code, 'ERR_REVIEW_REQUIRED');
  });

  // 17. Human-edited content requires fresh validation
  await it('Test 17: Human-edited content invalidates fingerprint and requires fresh validation', () => {
    const approvedAsset = createValidReadyAsset();
    // Human editor modifies body markdown
    const humanEditedAsset = {
      ...approvedAsset,
      bodyMarkdown: approvedAsset.bodyMarkdown.replace('checkout systems', 'payment portals')
    };
    // Without revalidation, boundary rejects it
    const staleResult = ArtifactLifecycleBoundary.verifyPublishableArtifact(humanEditedAsset, { saasProfile: baseSaasProfile });
    assert.strictEqual(staleResult.isEligible, false);
    assert.strictEqual(staleResult.code, 'ERR_STALE_VALIDATION_FINGERPRINT');

    // After fresh validation and re-fingerprinting, boundary admits it
    humanEditedAsset.validationFingerprint = ArtifactLifecycleBoundary.computeFingerprint(humanEditedAsset);
    humanEditedAsset.validatedAt = new Date().toISOString();
    const freshResult = ArtifactLifecycleBoundary.verifyPublishableArtifact(humanEditedAsset, { saasProfile: baseSaasProfile });
    assert.strictEqual(freshResult.isEligible, true);
  });

  // 18. No webhook/CMS side effect occurs for an invalid artifact
  await it('Test 18: No distribution side effect occurs for an invalid/unapproved artifact', async () => {
    let providerCallCount = 0;
    const mockProvider = {
      channelName: 'website' as const,
      publish: async () => {
        providerCallCount++;
        return { success: true, externalId: 'test-ext-1' };
      }
    };
    const inMemoryRepo: DistributionRepository = {
      saveJob: async () => 'mock-id',
      getJobByIdempotencyKey: async () => null,
      getJobById: async () => null
    };

    const distService = new DistributionService([mockProvider as any], inMemoryRepo);
    const distReq: DistributionRequest = {
      contentAssetId: 'test-asset-1',
      channels: ['website'],
      idempotencyKey: 'idem-test-18'
    };

    // Try distributing a REJECTED asset
    const rejectedAsset = { ...createValidReadyAsset(), validationStatus: 'REJECTED' as const };
    const res1 = await distService.distributeAsset(baseSaasProfile, rejectedAsset, distReq);
    assert.strictEqual(res1[0].status, 'FAILED');
    assert.strictEqual(providerCallCount, 0);

    // Try distributing a DRAFT asset
    const draftAsset = { ...createValidReadyAsset(), validationStatus: 'DRAFT' as const };
    const res2 = await distService.distributeAsset(baseSaasProfile, draftAsset, distReq);
    assert.strictEqual(res2[0].status, 'FAILED');
    assert.strictEqual(providerCallCount, 0);

    // Try distributing a REVIEW_REQUIRED asset
    const reviewAsset = { ...createValidReadyAsset(), validationStatus: 'REVIEW_REQUIRED' as const };
    const res3 = await distService.distributeAsset(baseSaasProfile, reviewAsset, distReq);
    assert.strictEqual(res3[0].status, 'FAILED');
    assert.strictEqual(providerCallCount, 0);

    // Try distributing a tampered asset
    const tamperedAsset = { ...createValidReadyAsset(), bodyMarkdown: 'tampered text' };
    const res4 = await distService.distributeAsset(baseSaasProfile, tamperedAsset, distReq);
    assert.strictEqual(res4[0].status, 'FAILED');
    assert.strictEqual(providerCallCount, 0);
  });

  // 19. No HTML/PDF export succeeds for an invalid artifact
  await it('Test 19: No HTML/PDF export succeeds for an invalid or unapproved artifact', () => {
    const rejectedExportInput: ExportArticleInput = {
      title: 'Rejected Article',
      bodyMarkdown: VALID_MARKDOWN,
      validationStatus: 'REJECTED'
    };
    const v1 = ArticleExportService.validateBeforeExport(rejectedExportInput);
    assert.strictEqual(v1.canExport, false);
    assert.ok(v1.errors.some(e => e.includes('REJECTED')));
    assert.throws(() => ArticleExportService.generatePdfBuffer(rejectedExportInput), /Export blocked/);
    assert.throws(() => ArticleExportService.generateStandaloneHtml(rejectedExportInput), /Export blocked/);

    const reviewExportInput: ExportArticleInput = {
      title: 'Review Article',
      bodyMarkdown: VALID_MARKDOWN,
      validationStatus: 'REVIEW_REQUIRED'
    };
    const v2 = ArticleExportService.validateBeforeExport(reviewExportInput);
    assert.strictEqual(v2.canExport, false);
    assert.ok(v2.errors.some(e => e.includes('REVIEW_REQUIRED')));
    assert.throws(() => ArticleExportService.generatePdfBuffer(reviewExportInput), /Export blocked/);

    const staleExportInput: ExportArticleInput = {
      title: 'Stale Article',
      bodyMarkdown: VALID_MARKDOWN + '\n\nTampered.',
      validationStatus: 'READY',
      validationFingerprint: createValidReadyAsset().validationFingerprint
    };
    const v3 = ArticleExportService.validateBeforeExport(staleExportInput);
    assert.strictEqual(v3.canExport, false);
    assert.ok(v3.errors.some(e => e.includes('fingerprint mismatch')));
    assert.throws(() => ArticleExportService.generatePdfBuffer(staleExportInput), /Export blocked/);
  });

  // 20. Valid existing distribution/export behavior still works
  await it('Test 20: Valid existing distribution/export behavior still works for valid READY asset', async () => {
    const validAsset = createValidReadyAsset();
    const exportInput: ExportArticleInput & { metaDescription?: string; targetKeyword?: string } = {
      title: validAsset.title,
      bodyMarkdown: validAsset.bodyMarkdown,
      validationStatus: validAsset.validationStatus,
      validationFingerprint: validAsset.validationFingerprint,
      targetBrand: validAsset.targetBrand,
      slug: validAsset.slug,
      metaDescription: validAsset.metaDescription,
      targetKeyword: validAsset.targetKeyword
    };

    const val = ArticleExportService.validateBeforeExport(exportInput);
    assert.strictEqual(val.canExport, true);

    const html = ArticleExportService.generateStandaloneHtml(exportInput);
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('Conversion Guide'));

    const pdf = ArticleExportService.generatePdfBuffer(exportInput);
    assert.ok(pdf.byteLength > 1000);

    const plan = DistributionPlanner.planDistribution(baseSaasProfile, validAsset, ['website']);
    assert.strictEqual(plan.eligibleChannels.length, 1);
    assert.strictEqual(plan.eligibleChannels[0], 'website');

    const inMemoryRepo: DistributionRepository = {
      saveJob: async () => 'mock-id',
      getJobByIdempotencyKey: async () => null,
      getJobById: async () => null
    };
    const mockProvider = {
      channelName: 'website' as const,
      validate: async () => ({ valid: true }),
      publish: async () => ({
        channel: 'website' as const,
        status: 'PUBLISHED' as const,
        externalId: 'ext-published',
        publishedUrl: 'https://example.com/published'
      })
    };
    const distService = new DistributionService([mockProvider as any], inMemoryRepo);
    const distReq: DistributionRequest = {
      contentAssetId: 'valid-asset-1',
      channels: ['website'],
      idempotencyKey: 'idem-test-20'
    };
    const distResults = await distService.distributeAsset(baseSaasProfile, validAsset, distReq, { dryRun: true });
    assert.strictEqual(distResults[0].status, 'PUBLISHED');
  });

  // 21. No READY assignment occurs before successful validation
  await it('Test 21: WritingService draft generation initializes asset in DRAFT, not READY', async () => {
    const mockLlm = {
      generate: async () => 'Section body content from mock LLM.',
      chat: async () => 'Section body content from mock LLM.',
      generateJson: async () => ({})
    };
    const writingService = new WritingService(mockLlm as any);
    const brief = ContentBriefSchema.parse({
      title: 'Initial Test Draft',
      intent: {
        primaryKeyword: 'saas growth',
        intentType: 'Informational',
        contentType: 'Guide'
      },
      targetKeywords: ['saas growth'],
      wordCountBudget: { min: 300, max: 600, target: 450 },
      outline: [{ heading: 'Overview', level: 'H2', generate_table: false, assignedKeywords: [], assignedEntities: [] }]
    });
    const rawDraft = await writingService.generateAsset(brief);
    assert.strictEqual(rawDraft.validationStatus, 'DRAFT');
    assert.notStrictEqual(rawDraft.validationStatus, 'READY');
  });

  // 22. Legacy fingerprint is not silently trusted
  await it('Test 22: Legacy FNV-1a fingerprint is not silently trusted and is rejected', () => {
    const legacyAsset = {
      ...createValidReadyAsset(),
      validationFingerprint: 'vfp-811c9dc59e3779b9' // Old 64-bit FNV-1a format
    };
    const result = ArtifactLifecycleBoundary.verifyPublishableArtifact(legacyAsset, { saasProfile: baseSaasProfile });
    assert.strictEqual(result.isEligible, false);
    assert.strictEqual(result.status, 'STALE_FINGERPRINT');
    assert.strictEqual(result.code, 'ERR_LEGACY_FINGERPRINT');
    assert.ok(result.reason.includes('Legacy or unrecognized validation fingerprint format'));
  });

  console.log('\n========================================================================');
  console.log(` RESULTS: ${passedCount} passed, ${failedCount} failed`);
  console.log('========================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
