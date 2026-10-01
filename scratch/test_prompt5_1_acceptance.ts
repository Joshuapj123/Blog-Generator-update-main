// scratch/test_prompt5_1_acceptance.ts
import { ContentEvidenceValidator } from '../src/lib/intelligence/ContentEvidenceValidator';
import { ClaimClassificationService } from '../src/lib/intelligence/ClaimClassificationService';
import { ContentGapService } from '../src/lib/intelligence/ContentGapService';
import { LinkQualityEngine } from '../src/lib/seo-intelligence/link_quality_engine';
import { CONTENT_INTELLIGENCE_POLICY, EvidenceItem, EvidenceSet } from '../src/core/contracts/evidence';
import { ContentBrief, ContentBriefSchema } from '../src/core/contracts/schemas';

let passed = 0;
let failed = 0;

function check(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
    failed++;
  }
}

async function runPrompt51AcceptanceSuite() {
  console.log('\n================================================================');
  console.log(' PROMPT 5.1: FORENSIC ACCEPTANCE AUDIT TEST SUITE');
  console.log('================================================================\n');

  // ==========================================================================
  // SECTION 1: DETERMINISTIC EVIDENCE-USE HEURISTIC
  // ==========================================================================
  console.log('--- 1. Deterministic Evidence-Use Heuristic Verification ---');

  const baseEvidence: EvidenceItem = {
    id: 'ev-test-1',
    claim: 'Smetytech provides direct technical leadership access without account manager layers',
    sourceUrl: 'https://smetytech.com',
    sourceType: 'TARGET_SITE',
    evidenceType: 'DIFFERENTIATOR',
    confidence: 'HIGH',
    citationRequired: false,
    entities: ['Smetytech', 'direct technical leadership', 'Brasov'],
  };

  // Test 1.1: Exact evidence reuse -> PASS
  const exactReuseText = `
## Direct Engineering Access
In traditional agencies, account managers dilute communication. Smetytech provides direct technical leadership access without account manager layers on all projects.
`;
  check(
    ContentEvidenceValidator.isEvidenceMeaningfullyUsed(baseEvidence, exactReuseText),
    '1.1 Exact evidence phrase reuse -> PASS'
  );

  // Test 1.2: Legitimate paraphrase -> Expected behavior documented and tested
  // A. Lexical paraphrase retaining domain tokens -> PASS
  const lexicalParaphraseText = `
## Architectural Collaboration
Direct technical leadership access without account manager layers is guaranteed by Smetytech for all client engagements.
`;
  check(
    ContentEvidenceValidator.isEvidenceMeaningfullyUsed(baseEvidence, lexicalParaphraseText),
    '1.2A Legitimate paraphrase with retained domain tokens -> PASS'
  );

  // B. Synonym paraphrase replacing all vocabulary -> Expected deterministic heuristic behavior is FAIL
  // In the absence of an LLM semantic judge, deterministic heuristic fails safely without false positives.
  const distantSynonymText = `
## Staffing Structure
The Brasov enterprise provides executive architect availability instead of client liaisons.
`;
  check(
    !ContentEvidenceValidator.isEvidenceMeaningfullyUsed(baseEvidence, distantSynonymText),
    '1.2B Deep synonym substitution without token overlap -> FAILS deterministic heuristic safely (as expected without LLM)'
  );

  // Test 1.3: Isolated token overlap -> FAIL
  const isolatedTokenText = `
## Software Development
Brasov is an attractive destination in Eastern Europe. Smetytech is located near the mountains.
`;
  check(
    !ContentEvidenceValidator.isEvidenceMeaningfullyUsed(baseEvidence, isolatedTokenText),
    '1.3 Isolated token overlap (< 3 tokens / < 60%) -> FAIL'
  );

  // Test 1.4: Dispersed tokens across separate paragraphs -> FAIL
  const dispersedTokenText = `
## Overview
Smetytech operates in Brasov.

## Management
Technical leadership ensures architectural quality across long-term roadmaps.

## Client Communication
Direct access is offered for urgent operational support without bureaucratic hurdles.
`;
  check(
    !ContentEvidenceValidator.isEvidenceMeaningfullyUsed(baseEvidence, dispersedTokenText),
    '1.4 Dispersed tokens across disparate paragraphs -> FAIL'
  );

  // Test 1.5: Contradictory / reversed evidence meaning (negation) -> FAIL
  const contradictoryText = `
## Agency Comparisons
Unlike dedicated boutiques, Smetytech does not provide direct technical leadership access without account manager layers.
`;
  check(
    !ContentEvidenceValidator.isEvidenceMeaningfullyUsed(baseEvidence, contradictoryText),
    '1.5 Contradictory / reversed evidence meaning (explicit negation) -> FAIL'
  );

  const contradictoryText2 = `
## Agency Comparisons
Client reviews state that Smetytech fails to provide direct technical leadership access without account manager layers.
`;
  check(
    !ContentEvidenceValidator.isEvidenceMeaningfullyUsed(baseEvidence, contradictoryText2),
    '1.5B Contradictory / reversed evidence meaning ("fails to provide") -> FAIL'
  );

  // ==========================================================================
  // SECTION 2: GENERALIZED QUANTITATIVE CLAIM VALIDATION (UNSEEN VALUES)
  // ==========================================================================
  console.log('\n--- 2. Generalized Quantitative Claim Validation ---');

  const quantBrief = ContentBriefSchema.parse({
    title: 'Benchmarking Engineering Performance',
    targetKeywords: ['software engineering metrics'],
    audience: 'CTOs',
    outline: [{ heading: 'Engineering Benchmarks', level: 'H2', assignedKeywords: [], assignedEntities: [], generate_table: false }],
    intent: { primaryKeyword: 'software engineering metrics', intentType: 'Informational', contentType: 'Guide' },
    wordCountBudget: { target: 1200, min: 1000, max: 1500 },
  });

  const unseenEvidenceSet: EvidenceSet = {
    extractedAt: new Date().toISOString(),
    summary: {
      totalCount: 8,
      highConfidenceCount: 8,
      businessFactCount: 3,
      competitorObservationCount: 0,
      serpObservationCount: 1,
      inferenceCount: 0,
    },
    items: [
      { id: 'ev-q1', claim: 'Average client revenue growth reached 12.7% annually', sourceUrl: 'https://benchmarks.internal', sourceType: 'SERP', evidenceType: 'STATISTIC', confidence: 'HIGH', citationRequired: true },
      { id: 'ev-q2', claim: 'Total series A funding closed at $1.2M', sourceUrl: 'https://benchmarks.internal', sourceType: 'TARGET_SITE', evidenceType: 'BUSINESS_FACT', confidence: 'HIGH', citationRequired: false },
      { id: 'ev-q3', claim: 'Enterprise license tier is priced at EUR 450,000', sourceUrl: 'https://benchmarks.internal', sourceType: 'TARGET_SITE', evidenceType: 'BUSINESS_FACT', confidence: 'HIGH', citationRequired: false },
      { id: 'ev-q4', claim: 'Platform maintains 99.95% availability SLA', sourceUrl: 'https://benchmarks.internal', sourceType: 'TARGET_SITE', evidenceType: 'TECHNICAL_SPEC', confidence: 'HIGH', citationRequired: false },
      { id: 'ev-q5', claim: 'P99 API response latency is under 45ms', sourceUrl: 'https://benchmarks.internal', sourceType: 'TARGET_SITE', evidenceType: 'TECHNICAL_SPEC', confidence: 'HIGH', citationRequired: false },
      { id: 'ev-q6', claim: 'Core pipeline processes 15,000 req/s in peak load tests', sourceUrl: 'https://benchmarks.internal', sourceType: 'TARGET_SITE', evidenceType: 'TECHNICAL_SPEC', confidence: 'HIGH', citationRequired: false },
      { id: 'ev-q7', claim: 'Standard enterprise onboarding duration is 6 months', sourceUrl: 'https://benchmarks.internal', sourceType: 'TARGET_SITE', evidenceType: 'BUSINESS_FACT', confidence: 'HIGH', citationRequired: false },
      { id: 'ev-q8', claim: 'Automated CI/CD build cycles run 10x faster than legacy Jenkins', sourceUrl: 'https://benchmarks.internal', sourceType: 'TARGET_SITE', evidenceType: 'DIFFERENTIATOR', confidence: 'HIGH', citationRequired: false },
    ],
  };

  // Test 2.1: Supported Unseen Values -> Accepted
  const supportedQuantBody = `
## Performance Benchmarks
According to annual audit figures, average client revenue growth reached 12.7% annually.
The company secured $1.2M in backing and standard tier licensing begins at EUR 450,000.
Infrastructure architecture maintains 99.95% availability with P99 response times of 45ms.
Under peak loads, the gateway handles 15,000 req/s with a rollout period of 6 months.
Engineering pipelines execute 10x faster than traditional build systems.
`;

  const valSupported = ContentEvidenceValidator.validate(supportedQuantBody, quantBrief, unseenEvidenceSet);
  check(
    valSupported.unsupportedClaims.length === 0,
    '2.1 All 8 unseen quantitative claims supported in EvidenceSet -> ACCEPTED (0 unsupported claims)',
    `Unsupported: ${valSupported.unsupportedClaims.join(', ')}`
  );

  // Test 2.2: Unsupported Unseen Values -> Rejected
  const unsupportedQuantBody = `
## Performance Benchmarks
We achieved 13.9% annual expansion.
The startup secured $4.5M in backing and standard tier licensing begins at EUR 850,000.
Infrastructure architecture maintains 99.999% availability with P99 response times of 12ms.
Under peak loads, the gateway handles 50,000 req/s with a rollout period of 18 months.
Engineering pipelines execute 25x faster than traditional build systems.
`;

  const valUnsupported = ContentEvidenceValidator.validate(unsupportedQuantBody, quantBrief, unseenEvidenceSet);
  check(
    valUnsupported.unsupportedClaims.length >= 7,
    `2.2 Unseen quantitative claims without EvidenceSet support -> REJECTED (${valUnsupported.unsupportedClaims.length} rejected)`,
    `Rejected claims: ${valUnsupported.unsupportedClaims.join(', ')}`
  );

  // Test 2.3: Equivalent Formatting Validation
  // Test A: 99.9% in evidence vs 99.9 percent in body
  const formattingEvidence: EvidenceSet = {
    extractedAt: new Date().toISOString(),
    summary: {
      totalCount: 2,
      highConfidenceCount: 2,
      businessFactCount: 1,
      competitorObservationCount: 0,
      serpObservationCount: 0,
      inferenceCount: 0,
    },
    items: [
      { id: 'ev-f1', claim: 'Guaranteed 99.9% uptime SLA across all regions', sourceUrl: 'https://test.internal', sourceType: 'TARGET_SITE', evidenceType: 'TECHNICAL_SPEC', confidence: 'HIGH', citationRequired: false },
      { id: 'ev-f2', claim: 'Total seed valuation was $1.2M post-launch', sourceUrl: 'https://test.internal', sourceType: 'TARGET_SITE', evidenceType: 'BUSINESS_FACT', confidence: 'HIGH', citationRequired: false },
    ],
  };

  const equivalentBody = `
## Reliability and Investment
The platform delivers 99.9 percent uptime across regions.
Investment reached USD 1.2 million following the initial release.
`;

  const valEquivalent = ContentEvidenceValidator.validate(equivalentBody, quantBrief, formattingEvidence);
  check(
    valEquivalent.unsupportedClaims.length === 0,
    '2.3 Equivalent formatting (99.9% vs 99.9 percent, $1.2M vs USD 1.2 million) -> ACCEPTED via deterministic normalization',
    `Unsupported: ${valEquivalent.unsupportedClaims.join(', ')}`
  );

  // ==========================================================================
  // SECTION 3: DETERMINISTIC OPERATIONAL POLICY THRESHOLDS (BOUNDARY TESTS)
  // ==========================================================================
  console.log('\n--- 3. Deterministic Operational Policy Thresholds Boundary Tests ---');

  // Test 3.1: Competitor Coverage Threshold (<35%)
  // Boundary: 34.9% vs 35.0% vs 35.1%
  const isMissing349 = 34.9 < CONTENT_INTELLIGENCE_POLICY.COMPETITOR_GAP_COVERAGE_THRESHOLD;
  const isMissing350 = 35.0 < CONTENT_INTELLIGENCE_POLICY.COMPETITOR_GAP_COVERAGE_THRESHOLD;
  const isMissing351 = 35.1 < CONTENT_INTELLIGENCE_POLICY.COMPETITOR_GAP_COVERAGE_THRESHOLD;
  check(
    isMissing349 === true && isMissing350 === false && isMissing351 === false,
    '3.1 Competitor Coverage Threshold (<35%): 34.9% (GAP) vs 35.0% (NOT GAP) vs 35.1% (NOT GAP)',
    `34.9%: ${isMissing349}, 35.0%: ${isMissing350}, 35.1%: ${isMissing351}`
  );

  // Test 3.2: Keyword Density (>3.0%)
  // Boundary: 2.99% vs 3.00% vs 3.01%
  const isDensityExcessive299 = 2.99 > CONTENT_INTELLIGENCE_POLICY.KEYWORD_DENSITY_MAX_PERCENT;
  const isDensityExcessive300 = 3.00 > CONTENT_INTELLIGENCE_POLICY.KEYWORD_DENSITY_MAX_PERCENT;
  const isDensityExcessive301 = 3.01 > CONTENT_INTELLIGENCE_POLICY.KEYWORD_DENSITY_MAX_PERCENT;
  check(
    isDensityExcessive299 === false && isDensityExcessive300 === false && isDensityExcessive301 === true,
    '3.2 Keyword Density (>3.0%): 2.99% (SAFE) vs 3.00% (SAFE) vs 3.01% (CRITICAL FAILURE)',
    `2.99%: ${isDensityExcessive299}, 3.00%: ${isDensityExcessive300}, 3.01%: ${isDensityExcessive301}`
  );

  // Test 3.3: Paragraph Keyword Loop Ratio (>65%)
  // Boundary: 64.9% vs 65.0% vs 65.1%
  const isLoopExcessive649 = 0.649 > CONTENT_INTELLIGENCE_POLICY.PARAGRAPH_KEYWORD_LOOP_MAX_RATIO;
  const isLoopExcessive650 = 0.650 > CONTENT_INTELLIGENCE_POLICY.PARAGRAPH_KEYWORD_LOOP_MAX_RATIO;
  const isLoopExcessive651 = 0.651 > CONTENT_INTELLIGENCE_POLICY.PARAGRAPH_KEYWORD_LOOP_MAX_RATIO;
  check(
    isLoopExcessive649 === false && isLoopExcessive650 === false && isLoopExcessive651 === true,
    '3.3 Paragraph Keyword Loop (>65%): 64.9% (PASS) vs 65.0% (PASS) vs 65.1% (WARNING)',
    `64.9%: ${isLoopExcessive649}, 65.0%: ${isLoopExcessive650}, 65.1%: ${isLoopExcessive651}`
  );

  // Test 3.4: Cross-Section Structural Similarity (>75%)
  // Boundary: 74.9% vs 75.0% vs 75.1%
  const isSimExcessive749 = 74.9 > CONTENT_INTELLIGENCE_POLICY.CROSS_SECTION_SIMILARITY_MAX_PERCENT;
  const isSimExcessive750 = 75.0 > CONTENT_INTELLIGENCE_POLICY.CROSS_SECTION_SIMILARITY_MAX_PERCENT;
  const isSimExcessive751 = 75.1 > CONTENT_INTELLIGENCE_POLICY.CROSS_SECTION_SIMILARITY_MAX_PERCENT;
  check(
    isSimExcessive749 === false && isSimExcessive750 === false && isSimExcessive751 === true,
    '3.4 Cross-Section Similarity (>75%): 74.9% (PASS) vs 75.0% (PASS) vs 75.1% (WARNING)',
    `74.9%: ${isSimExcessive749}, 75.0%: ${isSimExcessive750}, 75.1%: ${isSimExcessive751}`
  );

  // Test 3.5: Minimum Research Evidence Usage (>=40%)
  // Boundary: 39.9% vs 40.0% vs 40.1%
  const isUsageDeficient399 = 39.9 < CONTENT_INTELLIGENCE_POLICY.EVIDENCE_USAGE_MIN_PERCENT;
  const isUsageDeficient400 = 40.0 < CONTENT_INTELLIGENCE_POLICY.EVIDENCE_USAGE_MIN_PERCENT;
  const isUsageDeficient401 = 40.1 < CONTENT_INTELLIGENCE_POLICY.EVIDENCE_USAGE_MIN_PERCENT;
  check(
    isUsageDeficient399 === true && isUsageDeficient400 === false && isUsageDeficient401 === false,
    '3.5 Evidence Usage (>=40%): 39.9% (DEFICIENT) vs 40.0% (PASS) vs 40.1% (PASS)',
    `39.9%: ${isUsageDeficient399}, 40.0%: ${isUsageDeficient400}, 40.1%: ${isUsageDeficient401}`
  );

  // ==========================================================================
  // SECTION 4: LINK QUALITY ENGINE (LQE) REGRESSION & TERMINOLOGY AUDIT
  // ==========================================================================
  console.log('\n--- 4. Link Quality Engine Inline Asset & Authority Audit ---');

  // Terminology check: inline embedded image asset
  const svgInlineAsset = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIvPjwvc3ZnPg==';
  
  const articleWithDiagrams = {
    title: 'Architecture Guide',
    intro: {
      hook: 'Overview with link to [GitHub Docs](https://docs.github.com/en/actions).',
      thesis: 'Visual architecture explanation.',
      overview: 'Details below.',
    },
    sections: [
      {
        heading: 'System Architecture',
        what_it_is: `Here is the architectural diagram:\n\n![Diagram: Cloud Native Architecture](${svgInlineAsset})\n*Figure: Cloud Native Architecture*`,
        why_it_works: 'Robust deployment flow.',
        experience_or_data_point: 'Field experience.',
        takeaway: 'Scalable systems.',
      },
    ],
  };

  const extracted = LinkQualityEngine.extractLinks(articleWithDiagrams);
  check(
    !extracted.some(l => l.url.startsWith('data:image/')),
    '4.1 extractLinks ignores inline embedded image asset (data:image/svg+xml) without treating as hyperlink'
  );

  const lowResult = LinkQualityEngine.processWithRecovery(
    [{ title: 'Tech Blog', url: 'https://techblog1.io/post' }],
    'custom software engineering',
    'custom software development Brasov',
    { threshold: 80, allowDegradedQuality: true }
  );
  check(
    lowResult.threshold === 80,
    '4.2 Authority threshold strictly preserved at 80 (scoring policy unchanged)'
  );

  const highResult = LinkQualityEngine.processWithRecovery(
    [{ title: 'GitHub Actions Documentation', url: 'https://docs.github.com/en/actions' }],
    'custom software engineering',
    'custom software development Brasov',
    { threshold: 80, allowDegradedQuality: true }
  );
  const rewritten = LinkQualityEngine.rewriteArticle(articleWithDiagrams, highResult.selectedLinks);
  check(
    rewritten.sections[0].what_it_is.includes(svgInlineAsset),
    '4.3 rewriteArticle preserves inline embedded image asset (data:image/svg+xml) intact'
  );

  console.log('\n================================================================');
  console.log(` PROMPT 5.1 ACCEPTANCE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPrompt51AcceptanceSuite().catch(err => {
  console.error('Fatal error in Prompt 5.1 acceptance test suite:', err);
  process.exit(1);
});
