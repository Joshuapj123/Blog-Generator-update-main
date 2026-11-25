import { AgentOrchestrator } from '../src/core/orchestrator/AgentOrchestrator';
import { ArtifactLifecycleBoundary } from '../src/lib/content/ArtifactLifecycleBoundary';
import { ArticleExportService } from '../src/lib/export/ArticleExportService';
import { DistributionService, DistributionRepository } from '../src/lib/distribution/DistributionService';
import { ParagraphSignatureValidator } from '../src/lib/intelligence/ParagraphSignatureValidator';
import { DeliverableContractValidator } from '../src/lib/intelligence/DeliverableContractValidator';
import { PractitionerKnowledgeService } from '../src/lib/intelligence/PractitionerKnowledgeService';
import { SaaSProfile } from '../src/core/contracts/schemas';

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    passedCount++;
    console.log(`  ✅ PASS: ${label}`);
  } else {
    failedCount++;
    console.error(`  ❌ FAIL: ${label}${detail ? ` -> ${detail}` : ''}`);
  }
}

// Three consecutive (2, PROSE, M-M) paragraphs: 2 plain-English sentences of ~17 words each
const P_MM_1 =
  'Mobile checkout flows must remove extra form fields so buyers can finish their orders on any screen. Teams that test mobile checkout flows often find clear friction points across each payment step.';
const P_MM_2 =
  'Session replay tools show exact places where shoppers stop on long shipping pages during a quick visit. Teams that fix confusing error notes help more buyers move past the cart with less stress.';
const P_MM_3 =
  'Product teams looking at audit providers should check how clearly a review lists real user issues. Reading sample reports shows if a specialist gives clear steps that an engineering team can build fast.';

// Varied (3, PROSE, S-M-L) plain-English paragraph to break the (2, PROSE, M-M) sequence
const P_VAR_SML =
  'Data guides every fix. Session replay tools show exact places where shoppers stop on long shipping pages during a visit. Product teams that use Mitran Design mobile checkout audits to prioritize form fixes remove hidden friction across mobile screens.';

const COMPLIANT_SECTION_2 = `${P_MM_3}

| Dimension | In-House Team Review | External Specialist Audit |
|---|---|---|
| Direct Cost | Lower cash cost upfront | Higher upfront fee |
| Review Depth | Basic surface checks | Deep heuristic and flow review |
| Fresh Eyes | Subject to team habits | Independent outside view |
| Speed | Slower due to sprint work | Fast two week delivery |

When you compare an in-house review with an external specialist audit, you must weigh upfront cost against speed and depth.
An internal review saves cash at the start, yet team members can miss habits they see every day.
An external specialist like Mitran Design charges an upfront fee, yet brings fresh eyes and focused heuristic evaluation.
In conclusion, choose an in-house review when your budget is tight; choose an external specialist audit when you need fast, independent mobile checkout fixes.`;

const MOCK_SAAS_PROFILE: SaaSProfile = {
  name: 'Mitran Design',
  website: 'https://mitran.design',
  description: 'Mitran Design provides UX audit services, mobile checkout audits, and heuristic evaluation for product teams.',
  targetAudience: 'Product and engineering leaders',
  keyFeatures: ['UX Audit Services', 'Mobile Checkout Audits', 'Heuristic Evaluation'],
  primaryCompetitors: ['https://smetytech.com'],
  tone: 'Authoritative, clear, practical',
  customInsights: 'Focus on mobile checkout usability and heuristic evaluation.',
  verifiedOfferings: ['UX Audit Services', 'Mobile Checkout Audits', 'Heuristic Evaluation'],
  businessScale: 'SOLO_PRACTITIONER',
  businessScaleEvidence: 'Verified solo practitioner UX consultancy on mitran.design',
  practitionerProfile: {
    tenantId: 'tenant_mitran_001',
    userId: 'user_mitran_001',
    identity: {
      verificationStatus: 'VERIFIED',
      yearsOfExperience: 9,
      specialties: ['Mobile Checkout UX', 'Conversion Telemetry']
    },
    voiceRules: { firstPersonVoiceAllowed: false, allowClientNamingByDefault: false },
    approvedCaseStudies: [],
    verifiedProjects: [],
    expertise: [],
    principles: []
  } as any
};

function createMockSearchAndScraper() {
  return {
    search: {
      search: async () => [
        {
          title: 'UX Audit Services Guide',
          link: 'https://mitran.design/ux-audit-services',
          snippet: 'Mitran Design provides UX audit services, mobile checkout audits, and heuristic evaluation.'
        }
      ]
    },
    scraper: {
      scrape: async () => [
        {
          url: 'https://mitran.design/ux-audit-services',
          title: 'Mitran Design UX Audit Services',
          textContent: Array(30).fill('Mitran Design provides UX audit services, mobile checkout audits, and heuristic evaluation for SaaS and eCommerce product teams.').join(' ')
        }
      ]
    }
  };
}

function createCompoundMockLLM(mode: 'POSITIVE' | 'NEGATIVE') {
  const operationsLog: string[] = [];
  let targetedRepairPromptSeen = '';
  let generalRepairPromptSeen = '';
  let generalRepairCalls = 0;

  const llm = {
    operationsLog,
    getTargetedRepairPrompt: () => targetedRepairPromptSeen,
    getGeneralRepairPrompt: () => generalRepairPromptSeen,
    getGeneralRepairCalls: () => generalRepairCalls,
    structuredGenerate: async (prompt: string, schema: any, opts?: any) => {
      const op = opts?.operation || 'structuredGenerate';
      operationsLog.push(op);

      if (prompt.includes('ContentBrief') || prompt.includes('outline') || op.toLowerCase().includes('plan') || op.toLowerCase().includes('brief')) {
        return {
          title: 'UX Audit Services Guide for Mobile Checkout Flows',
          targetKeywords: ['ux audit services'],
          wordCountBudget: { min: 150, target: 300, max: 1500 },
          intent: { primaryKeyword: 'ux audit services', intentType: 'Commercial', contentType: 'Guide' },
          outline: [
            {
              heading: 'Evaluating Key UX Conversion Flows',
              level: 'H2',
              core_concept: 'Evaluating mobile checkout conversion flows with ux audit services',
              assignedKeywords: ['ux audit services'],
              assignedEntities: ['mobile checkout'],
              generate_table: false
            },
            {
              heading: 'UX Audit Services Comparison Matrix',
              level: 'H2',
              core_concept: 'Comparing in-house vs external specialist ux audit services',
              assignedKeywords: ['ux audit services'],
              assignedEntities: ['heuristic evaluation'],
              generate_table: true
            }
          ]
        };
      }

      return {
        intentType: 'Commercial',
        contentType: 'Guide',
        primaryKeyword: 'ux audit services',
        findings: []
      };
    },
    generate: async (prompt: string, opts?: any) => {
      const op = opts?.operation || 'generate';
      operationsLog.push(op);

      // TargetedRepairEngine call
      if (prompt.includes('TARGETED STRUCTURAL BLOCK REPAIR') || prompt.includes('target paragraph') || op.includes('Targeted')) {
        targetedRepairPromptSeen = prompt;
        if (mode === 'NEGATIVE') {
          return P_MM_2;
        }
        return P_VAR_SML;
      }

      // General Repair call (runRepair)
      if (op === 'Content Quality Repair' || prompt.includes('Rewrite and repair the article body')) {
        generalRepairCalls++;
        generalRepairPromptSeen = prompt;
        if (mode === 'NEGATIVE') {
          return `## Evaluating Key UX Conversion Flows

${P_MM_1}

${P_MM_2}

## UX Audit Services Comparison Matrix

${P_MM_3}

Teams looking at ux audit services must check alignment first.`;
        }

        return `## Evaluating Key UX Conversion Flows

Good ux audit services help teams spot friction in mobile checkout flows before shoppers leave the site.

${P_MM_1}

${P_VAR_SML}

## UX Audit Services Comparison Matrix

${COMPLIANT_SECTION_2}`;
      }

      // Initial section generation — match exact Section Heading line
      if (prompt.includes('Section Heading: "UX Audit Services Comparison Matrix"')) {
        return `${P_MM_3}

Teams looking at ux audit services must check alignment before they pick a plan.`;
      }

      if (prompt.includes('Section Heading: "Evaluating Key UX Conversion Flows"')) {
        return `Good ux audit services help teams spot friction in mobile checkout flows before shoppers leave the site.

${P_MM_1}

${P_MM_2}`;
      }

      return 'Mitran Design provides UX audit services and mobile checkout audits.';
    }
  };

  return llm;
}

async function run() {
  console.log('========================================================================');
  console.log(' ACUTE PHASE 6D.7: END-TO-END COMPOUND ORCHESTRATION VERIFICATION');
  console.log('========================================================================\n');

  // Verify initial P_MM_1/2/3 signatures explicitly
  console.log('--- PRE-CHECK: Canonical Signatures of Fixtures ---');
  console.log('  P_MM_1:', ParagraphSignatureValidator.computeCanonicalSignature(P_MM_1, 'PROSE').signature);
  console.log('  P_MM_2:', ParagraphSignatureValidator.computeCanonicalSignature(P_MM_2, 'PROSE').signature);
  console.log('  P_MM_3:', ParagraphSignatureValidator.computeCanonicalSignature(P_MM_3, 'PROSE').signature);
  console.log('  P_VAR_SML:', ParagraphSignatureValidator.computeCanonicalSignature(P_VAR_SML, 'PROSE').signature);

  // ----------------------------------------------------------------------
  // PART 1: POSITIVE COMPOUND ORCHESTRATION TEST (Actual AgentOrchestrator)
  // ----------------------------------------------------------------------
  console.log('\n--- PART 1: Positive Compound Orchestration (Actual AgentOrchestrator) ---');
  const posLLM = createCompoundMockLLM('POSITIVE');
  const { search, scraper } = createMockSearchAndScraper();

  const posOrchestrator = new AgentOrchestrator({
    llm: posLLM as any,
    search: search as any,
    scraper: scraper as any,
    maxReviewRetries: 2
  });

  const posResult = await posOrchestrator.run({
    targetKeyword: 'ux audit services',
    targetAudience: 'Product and engineering leaders',
    saasProfile: MOCK_SAAS_PROFILE
  });

  console.log('  [Log] Operations sequence:', posLLM.operationsLog.join(' -> '));
  console.log('  [Log] Final validation status:', posResult.review?.finalValidationStatus);
  console.log('  [Log] Critical errors:', JSON.stringify(posResult.review?.criticalErrors));
  console.log('  [Log] Warnings:', JSON.stringify(posResult.review?.warnings));
  console.log('  [Log] Repair details status:', posResult.review?.repairDetails?.status, 'structuralRepairSucceeded:', posResult.review?.repairDetails?.structuralRepairSucceeded);
  console.log('  [Log] General repair calls:', posLLM.getGeneralRepairCalls());

  assert(posResult.content !== undefined, 'Orchestrator produced final ContentAsset');
  assert(posLLM.getTargetedRepairPrompt().length > 0, 'TargetedRepairEngine was invoked during orchestration');
  assert(
    posLLM.operationsLog.some(op => op.includes('Targeted')) || posLLM.getTargetedRepairPrompt().includes('TARGETED STRUCTURAL BLOCK REPAIR'),
    'TargetedRepairEngine executed targeted block rewrite before general repair'
  );
  assert(posLLM.getGeneralRepairCalls() >= 1, 'General repair loop (runRepair) executed after targeted repair');
  assert(
    posLLM.getGeneralRepairPrompt().includes('UX Audit Services Comparison Matrix') ||
    posLLM.getGeneralRepairPrompt().includes('COMPARISON') ||
    posLLM.getGeneralRepairPrompt().includes('explicit alternatives'),
    'General repair received outstanding comparison deliverable violation'
  );

  const finalBody = posResult.content?.bodyMarkdown || '';
  const finalSig = ParagraphSignatureValidator.validate(finalBody);
  const section2Text = finalBody.split('## UX Audit Services Comparison Matrix')[1] || '';
  const finalDeliv = DeliverableContractValidator.validateSectionDeliverable('## UX Audit Services Comparison Matrix', section2Text);

  assert(finalSig.valid === true && finalSig.violations.length === 0, 'Final article has 0 structural repetition violations');
  assert(finalDeliv.passed === true && finalDeliv.missingElements.length === 0, 'Final Comparison section fulfills all deliverable contract requirements');
  assert(
    posResult.review?.passed === true &&
    (posResult.review?.finalValidationStatus === 'PASSED' || posResult.review?.finalValidationStatus === 'PASSED_WITH_WARNINGS'),
    'Final review passed cleanly',
    `Status: ${posResult.review?.finalValidationStatus}, Errors: ${JSON.stringify(posResult.review?.criticalErrors)}`
  );
  console.log('  [Log] Validation fingerprint:', posResult.content?.validationFingerprint);
  console.log('  [Log] Final Article Markdown:\n' + (posResult.content?.bodyMarkdown || ''));
  assert(
    typeof posResult.content?.validationFingerprint === 'string' && /^vfp-sha256-v\d+:[a-f0-9]{64}$/.test(posResult.content.validationFingerprint),
    'Cryptographic SHA-256 validationFingerprint generated after passing validation'
  );

  if (posResult.content) {
    const boundaryCheck = ArtifactLifecycleBoundary.verifyPublishableArtifact(posResult.content, {
      saasProfile: MOCK_SAAS_PROFILE
    });
    assert(boundaryCheck.isEligible === true && boundaryCheck.status === 'READY', 'Final article passes ArtifactLifecycleBoundary as READY', boundaryCheck.isEligible ? undefined : boundaryCheck.reason);

    const exportRes = ArticleExportService.validateBeforeExport({
      ...posResult.content,
      saasProfile: MOCK_SAAS_PROFILE
    });
    assert(exportRes.canExport === true, 'ArticleExportService allows export of compliant READY asset', exportRes.errors.join('; '));
  }

  // ----------------------------------------------------------------------
  // PART 2: NEGATIVE COMPOUND SCENARIO (Actual AgentOrchestrator)
  // ----------------------------------------------------------------------
  console.log('\n--- PART 2: Negative Compound Scenario (Fail-Closed Verification) ---');
  const negLLM = createCompoundMockLLM('NEGATIVE');
  const negOrchestrator = new AgentOrchestrator({
    llm: negLLM as any,
    search: search as any,
    scraper: scraper as any,
    maxReviewRetries: 2
  });

  const negResult = await negOrchestrator.run({
    targetKeyword: 'ux audit services',
    targetAudience: 'Product and engineering leaders',
    saasProfile: MOCK_SAAS_PROFILE
  });

  console.log('  [Log] Neg final validation status:', negResult.review?.finalValidationStatus);
  console.log('  [Log] Neg repair details:', negResult.review?.repairDetails?.status, 'attempts:', negResult.review?.repairDetails?.attemptsUsed);
  console.log('  [Log] Neg general repair calls:', negLLM.getGeneralRepairCalls());

  assert(
    (negResult.review?.repairDetails?.attemptsUsed || 0) <= 2 && negLLM.getGeneralRepairCalls() <= 2,
    'Retry budgets strictly bounded (structural <= 2, general <= 2)'
  );
  assert(
    negResult.review?.passed === false &&
    (negResult.review?.finalValidationStatus === 'REVIEW_REQUIRED' || negResult.review?.finalValidationStatus === 'FAILED'),
    'Negative scenario fails closed with REVIEW_REQUIRED or FAILED',
    `Got: ${negResult.review?.finalValidationStatus}`
  );
  assert(
    !negResult.content?.validationFingerprint,
    'No validationFingerprint generated for invalid article'
  );

  if (negResult.content) {
    const negBoundary = ArtifactLifecycleBoundary.verifyPublishableArtifact(negResult.content, {
      saasProfile: MOCK_SAAS_PROFILE
    });
    assert(negBoundary.isEligible === false, 'ArtifactLifecycleBoundary rejects invalid article');

    const negExport = ArticleExportService.validateBeforeExport({
      ...negResult.content,
      saasProfile: MOCK_SAAS_PROFILE
    });
    assert(negExport.canExport === false, 'ArticleExportService blocks invalid article export');

    let providerCalls = 0;
    const mockProvider: any = {
      channel: 'WEBHOOK' as const,
      channelName: 'Webhook',
      validate: () => true,
      publish: async () => { providerCalls++; return { success: true, externalId: 'ext_1' }; }
    };
    const mockRepo: DistributionRepository = {
      saveJob: async () => 'job_1',
      getJobByIdempotencyKey: async () => null,
      getJobById: async () => null
    };
    const distService = new DistributionService([mockProvider], mockRepo);
    const distRes = await distService.distributeAsset(
      MOCK_SAAS_PROFILE,
      negResult.content,
      { channels: ['WEBHOOK'], idempotencyKey: 'key_neg_1' } as any
    );
    assert(Array.isArray(distRes) && distRes[0]?.status === 'FAILED' && providerCalls === 0, 'DistributionService refuses unapproved asset with 0 provider calls');
  }

  // ----------------------------------------------------------------------
  // PART 3: TENANT ISOLATION CHECK
  // ----------------------------------------------------------------------
  console.log('\n--- PART 3: Tenant Authorization & Isolation ---');
  let tenantBlocked = false;
  try {
    PractitionerKnowledgeService.validateTenantAccess(
      MOCK_SAAS_PROFILE.practitionerProfile!,
      'tenant_attacker_999',
      'user_attacker_999'
    );
  } catch (err: any) {
    tenantBlocked = err.message.includes('Cross-tenant access denied');
  }
  assert(tenantBlocked, 'PractitionerKnowledgeService blocks cross-tenant access');

  console.log('\n========================================================================');
  console.log(` SUMMARY: ${passedCount} PASSED | ${failedCount} FAILED`);
  console.log('========================================================================');
  if (failedCount > 0) process.exit(1);
}

run().catch(err => {
  console.error('Fatal orchestration test error:', err);
  process.exit(1);
});
