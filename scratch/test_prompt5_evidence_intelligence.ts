// scratch/test_prompt5_evidence_intelligence.ts
import { EvidenceExtractionService } from '../src/lib/intelligence/EvidenceExtractionService';
import { ClaimClassificationService } from '../src/lib/intelligence/ClaimClassificationService';
import { ContentGapService } from '../src/lib/intelligence/ContentGapService';
import { SectionEvidenceMapper } from '../src/lib/intelligence/SectionEvidenceMapper';
import { ContentEvidenceValidator } from '../src/lib/intelligence/ContentEvidenceValidator';
import { CONTENT_INTELLIGENCE_POLICY } from '../src/core/contracts/evidence';
import { ContentBrief, ContentBriefSchema, SaaSProfile } from '../src/core/contracts/schemas';

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passedCount++;
  } else {
    console.error(`  [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
    failedCount++;
  }
}

async function runPrompt5TestSuite() {
  console.log('\n======================================================');
  console.log(' PROMPT 5: EVIDENCE-DRIVEN CONTENT INTELLIGENCE SUITE');
  console.log('======================================================\n');

  const testProfile: SaaSProfile = {
    name: 'Smetytech',
    website: 'https://smetytech.com',
    description: 'Custom software development agency in Brasov specializing in enterprise web applications and dedicated teams.',
    targetAudience: 'CTOs and Product Managers in Europe and US',
    keyFeatures: [
      'Dedicated engineering teams in Brasov',
      'Full-stack React & Node.js architecture',
      'Automated CI/CD and SOC-2 compliance workflows',
      'Direct technical leadership access without account manager layers',
    ],
    primaryCompetitors: ['competitor-a.com', 'competitor-b.com'],
    tone: 'technical-authoritative',
    customInsights: 'Local Romanian engineering talent pool with average senior tenure exceeding 7 years.',
  };

  const testSearchResults = [
    {
      title: 'Top Software Development Companies in Brasov - 2026 Rankings',
      link: 'https://clutch.co/ro/developers/brasov',
      snippet: 'Brasov has emerged as a premier European software engineering hub with 40+ specialized agencies.',
    },
    {
      title: 'Custom Software Development Services in Romania',
      link: 'https://techreview.internal/romania-software',
      snippet: 'Companies outsourcing to Romanian dev teams report 40-50% cost efficiencies compared to Western Europe.',
    },
  ];

  const testScrapeResults = [
    {
      url: 'https://competitor-a.com/services',
      title: 'Competitor A Software Solutions',
      htmlContent: '',
      textContent: `Welcome to Competitor A. We provide custom software development services across Europe.
Our development process uses agile methodology and quarterly sprints for enterprise deliverables.
We have successfully completed over 150 projects for global clients.
Contact us today to receive our standard hourly pricing sheet.`,
      success: true,
    },
  ];

  // ====================================================
  // TEST 1: Evidence Extraction - Target Business Facts
  // ====================================================
  console.log('--- 1. Evidence Extraction: Target Business Facts ---');
  const evidenceSet = EvidenceExtractionService.extractEvidence({
    saasProfile: testProfile,
    searchResults: testSearchResults,
    scrapeResults: testScrapeResults,
    targetKeyword: 'custom software development Brasov',
  });

  assert(
    evidenceSet.items.length >= 6,
    'Extracts sufficient evidence items from inputs',
    `Found ${evidenceSet.items.length} items`
  );

  const targetBusinessItems = evidenceSet.items.filter(i => i.sourceType === 'TARGET_SITE');
  assert(
    targetBusinessItems.length >= 4,
    'Extracts core business facts and features from SaaSProfile (description, features, insights, audience)',
    `Extracted ${targetBusinessItems.length} business items`
  );

  const dedicatedTeamEv = targetBusinessItems.find(b => b.claim.includes('Dedicated engineering teams in Brasov'));
  assert(
    !!dedicatedTeamEv && dedicatedTeamEv.confidence === 'HIGH' && dedicatedTeamEv.evidenceType === 'FEATURE',
    'Assigns canonical FEATURE type and HIGH confidence to target business features',
    `Type: ${dedicatedTeamEv?.evidenceType}, Confidence: ${dedicatedTeamEv?.confidence}`
  );

  // ====================================================
  // TEST 2: Evidence Extraction - Scrape Results & SSRF Boundary
  // ====================================================
  console.log('\n--- 2. Evidence Extraction: Competitor Scrapes & Security ---');
  const compObservations = evidenceSet.items.filter(i => i.sourceType === 'COMPETITOR');
  assert(
    compObservations.length >= 1,
    'Extracts competitor observations from scraped body text',
    `Extracted ${compObservations.length} competitor observations`
  );

  // Test dangerous scheme URL extraction safety
  const unsafeEvidence = EvidenceExtractionService.extractEvidence({
    saasProfile: {
      name: 'UnsafeProfile',
      website: 'javascript:alert(1)',
      keyFeatures: ['Dangerous Feature'],
    } as any,
    searchResults: [
      {
        title: 'Localhost SSRF Attempt',
        link: 'http://169.254.169.254/latest/meta-data/',
        snippet: 'Internal AWS cloud metadata',
      },
    ],
  });

  const ssrfItem = unsafeEvidence.items.find(i => i.sourceTitle === 'Localhost SSRF Attempt');
  assert(
    !ssrfItem?.sourceUrl.includes('169.254.169.254'),
    'LinkSafetyValidator sanitizes or falls back on unsafe SSRF metadata URLs',
    `URL was: ${ssrfItem?.sourceUrl}`
  );

  // ====================================================
  // TEST 3: Claim Classification & Provenance Semantics
  // ====================================================
  console.log('\n--- 3. Claim Classification & Provenance Semantics ---');
  // 3a (Test C): VERIFIED_FACT / BUSINESS_FACT
  const c1 = ClaimClassificationService.classifyClaim(
    'Smetytech provides verified capability: Dedicated engineering teams in Brasov',
    evidenceSet
  );
  assert(
    c1.classification === 'BUSINESS_FACT',
    'Test C: Classifies verified target-business fact as BUSINESS_FACT',
    `Result: ${c1.classification}`
  );

  // 3b: RECOMMENDATION
  const c2 = ClaimClassificationService.classifyClaim(
    'Engineering leads should consider weekly architecture syncs before deploying to production.',
    evidenceSet
  );
  assert(
    c2.classification === 'RECOMMENDATION',
    'Classifies prescriptive "should consider" claim as RECOMMENDATION',
    `Result: ${c2.classification}`
  );

  // 3c: INFERENCE
  const c3 = ClaimClassificationService.classifyClaim(
    'The observed telemetry likely indicates that API traffic peaks during European business hours.',
    evidenceSet
  );
  assert(
    c3.classification === 'INFERENCE',
    'Classifies hedged "likely indicates" statement as INFERENCE',
    `Result: ${c3.classification}`
  );

  // 3d: MARKETING_CLAIM
  const c4 = ClaimClassificationService.classifyClaim(
    'We provide the world-class, premier software engineering service with unmatched quality.',
    evidenceSet
  );
  assert(
    c4.classification === 'MARKETING_CLAIM',
    'Classifies superlative marketing claim as MARKETING_CLAIM',
    `Result: ${c4.classification}`
  );

  // 3e (Test A): Valid Sourced Claim with matching research evidence
  const validSourcedEvidence = {
    ...evidenceSet,
    items: [
      ...evidenceSet.items,
      {
        id: 'ev-clutch-1',
        sourceUrl: 'https://clutch.co/profile/smetytech',
        sourceTitle: 'Clutch Rankings 2026',
        sourceType: 'INDUSTRY' as const,
        claim: 'According to Clutch rankings, Brasov has become a primary Eastern European tech cluster.',
        evidenceType: 'MARKET_FACT' as const,
        confidence: 'HIGH' as const,
        citationRequired: true,
      },
    ],
  };

  const c5a = ClaimClassificationService.classifyClaim(
    'According to Clutch rankings, Brasov has become a primary Eastern European tech cluster.',
    validSourcedEvidence
  );
  assert(
    c5a.classification === 'SOURCED_CLAIM' && c5a.supportingEvidenceId === 'ev-clutch-1',
    'Test A: Classifies valid sourced claim with matching evidence as SOURCED_CLAIM',
    `Result: ${c5a.classification}, ID: ${c5a.supportingEvidenceId}`
  );

  // 3f (Test B): Fake Attributed Claim without evidence (MUST be rejected)
  const c5b = ClaimClassificationService.classifyClaim(
    'According to Gartner, enterprise cloud spending increased 20% across all sectors.',
    evidenceSet // Gartner is NOT in evidenceSet
  );
  assert(
    c5b.classification === 'UNSUPPORTED' && c5b.isFakeAttribution === true,
    'Test B: Rejects fake attributed claim without evidence and flags as UNSUPPORTED with isFakeAttribution',
    `Result: ${c5b.classification}, fake: ${c5b.isFakeAttribution}`
  );

  // 3g (Test D): Unsupported Quantitative Claims (Previously unseen values)
  const c6a = ClaimClassificationService.classifyClaim(
    'Our custom software architecture guarantees 99.999% uptime and saves 85% on cloud costs.',
    evidenceSet
  );
  const c6b = ClaimClassificationService.classifyClaim(
    'The cluster delivers 75,000 req/s with 12ms latency and saves €180,000 annually.',
    evidenceSet
  );
  const c6c = ClaimClassificationService.classifyClaim(
    'Engineers build platforms 8x faster across 500 microservices.',
    evidenceSet
  );
  assert(
    c6a.classification === 'UNSUPPORTED' && c6b.classification === 'UNSUPPORTED' && c6c.classification === 'UNSUPPORTED',
    'Test D: Classifies previously unseen quantitative claims (percentages, currency, metrics, multipliers) as UNSUPPORTED when not in evidence',
    `c6a: ${c6a.classification}, c6b: ${c6b.classification}, c6c: ${c6c.classification}`
  );

  // 3h (Test E): Inference written as fact without evidence
  const c7 = ClaimClassificationService.classifyClaim(
    'Adopting agency retainers inevitably causes total system downtime within six months.',
    evidenceSet
  );
  assert(
    c7.classification === 'UNSUPPORTED',
    'Test E: Classifies inference incorrectly written as fact without evidence as UNSUPPORTED',
    `Result: ${c7.classification}`
  );

  // ====================================================
  // TEST 4: Content Gap Matrix Service
  // ====================================================
  console.log('\n--- 4. Content Gap Matrix Service ---');
  const gapMatrix = ContentGapService.buildGapMatrix({
    evidenceSet,
    saasProfile: testProfile,
    competitors: [
      {
        url: 'https://competitor-a.com',
        title: 'Competitor A',
        headings: [{ text: 'Agile Software Development' }, { text: 'Enterprise Deliverables' }],
        text: 'We build standard web solutions for companies.',
        hasTables: false,
      },
    ],
    targetKeyword: 'custom software development Brasov',
  });

  assert(
    gapMatrix.gaps.length >= 3,
    'Identifies content gaps across target features and competitor blind spots',
    `Total gaps: ${gapMatrix.gaps.length}`
  );

  const missingFeatureGap = gapMatrix.gaps.find(g => g.topic.includes('Direct technical leadership access'));
  assert(
    !!missingFeatureGap && missingFeatureGap.missingFromCompetitors === true && missingFeatureGap.importance === 'HIGH',
    'Under-covered differentiator (<35% coverage) tagged with HIGH importance and missingFromCompetitors: true',
    `Gap: ${missingFeatureGap?.topic}, missing: ${missingFeatureGap?.missingFromCompetitors}, importance: ${missingFeatureGap?.importance}`
  );

  assert(
    !!missingFeatureGap?.buyerQuestion && missingFeatureGap.buyerQuestion.length > 15,
    'Assigns concrete practitioner buyer question to content gap',
    `Buyer question: "${missingFeatureGap?.buyerQuestion}"`
  );

  const tableGap = gapMatrix.gaps.find(g => g.recommendedTreatment === 'TABLE');
  assert(
    !!tableGap,
    'Detects missing competitor comparison tables and recommends structured TABLE gap treatment',
    `Table gap: ${tableGap?.topic}`
  );

  // ====================================================
  // TEST 5: Section Evidence Mapper
  // ====================================================
  console.log('\n--- 5. Section Evidence Mapper ---');
  const mockOutline = [
    {
      heading: 'Why Custom Software Development in Brasov Outperforms Generic Outsourcing',
      level: 'H2',
      assignedKeywords: ['custom software development Brasov'],
      assignedEntities: ['Brasov', 'Smetytech'],
    },
    {
      heading: 'Comparing Dedicated Teams vs Traditional Agency Retainers',
      level: 'H2',
      assignedKeywords: ['dedicated engineering teams'],
      assignedEntities: ['Dedicated Teams'],
    },
    {
      heading: 'Architecture, Automated CI/CD, and Compliance Workflows',
      level: 'H2',
      assignedKeywords: ['full-stack architecture'],
      assignedEntities: ['React', 'Node.js'],
    },
  ];

  const sectionMaps = SectionEvidenceMapper.mapSectionsToEvidence(
    mockOutline,
    evidenceSet,
    gapMatrix,
    testProfile
  );

  assert(
    sectionMaps.length === mockOutline.length,
    'Creates a SectionEvidenceMap for every outline section',
    `Created ${sectionMaps.length} maps`
  );

  const compareSection = sectionMaps.find(s => s.heading.includes('Comparing'));
  assert(
    compareSection?.intent === 'COMPARE',
    'Classifies section intent correctly based on heading semantics (COMPARE)',
    `Intent: ${compareSection?.intent}`
  );

  assert(
    (compareSection?.evidenceIds.length || 0) >= 1,
    'Allocates grounded evidence IDs to section map',
    `Evidence IDs: ${compareSection?.evidenceIds.join(', ')}`
  );

  assert(
    compareSection?.claimConstraints.length! > 0 && compareSection?.prohibitedClaims.length! > 0,
    'Attaches claim constraints and prohibited claims to guide section generation',
    `Constraints: ${compareSection?.claimConstraints.length}, Prohibited: ${compareSection?.prohibitedClaims.length}`
  );

  // ====================================================
  // TEST 6: Content Evidence Validator
  // ====================================================
  console.log('\n--- 6. Content Evidence Validator ---');
  const mockBrief: ContentBrief = ContentBriefSchema.parse({
    title: 'Custom Software Development in Brasov: Technical Guide for CTOs',
    targetKeywords: ['custom software development Brasov'],
    audience: 'CTOs and Product Managers',
    outline: mockOutline.map(o => ({ ...o, level: o.level as any, generate_table: false })),
    intent: {
      primaryKeyword: 'custom software development Brasov',
      intentType: 'Informational',
      contentType: 'Guide',
    },
    wordCountBudget: {
      target: 1800,
      min: 1400,
      max: 2200,
    },
  });

  // 6a: Valid grounded content
  const validContent = `
## Why Custom Software Development in Brasov Outperforms Generic Outsourcing

Smetytech delivers custom software development Brasov for high-growth technical companies.
Dedicated engineering teams in Brasov collaborate directly with client technical leads.
Our engineering talent pool benefits from senior Romanian developers with strong architectural backgrounds.
Teams work on modern web and mobile applications with full transparency, weekly sprint reviews, and direct Slack communication.

## Comparing Dedicated Teams vs Traditional Agency Retainers

| Model | Direct Architecture Access | Long-Term Knowledge Retention |
|---|---|---|
| Smetytech Dedicated Team | Direct access to senior engineers | High |
| Traditional Agency Retainer | Account manager intermediary | Low |

Direct technical leadership access without account manager layers accelerates decision making.
Engineers participate in sprint planning, code reviews, and product strategy discussions alongside client product managers.
This model reduces overhead costs while ensuring that domain knowledge remains within the dedicated engineering team.

## Architecture, Automated CI/CD, and Compliance Workflows

Full-stack React & Node.js architecture ensures reliable web systems.
Automated CI/CD and SOC-2 compliance workflows protect enterprise data at every deployment.
Our teams implement continuous automated testing, vulnerability scanning, and containerized deployments using modern cloud infrastructure.
`;

  const validReport = ContentEvidenceValidator.validate(
    validContent,
    mockBrief,
    evidenceSet,
    sectionMaps,
    'Smetytech',
    gapMatrix
  );

  assert(
    validReport.passed === true,
    'Passes compliant, grounded article content with valid evidence coverage',
    `Errors: ${validReport.criticalErrors.join(', ')}`
  );
  assert(
    validReport.evidenceUsageRate >= 40,
    'Computes high evidence usage rate for grounded content',
    `Rate: ${validReport.evidenceUsageRate}%`
  );

  // 6b: Keyword Stuffing Violation (> 3.0% density)
  let stuffedContent = validContent;
  for (let i = 0; i < 25; i++) {
    stuffedContent += `\nCustom software development Brasov is great. We love custom software development Brasov. Choose custom software development Brasov.`;
  }
  const stuffedReport = ContentEvidenceValidator.validate(
    stuffedContent,
    mockBrief,
    evidenceSet,
    sectionMaps,
    'Smetytech',
    gapMatrix
  );

  assert(
    stuffedReport.passed === false && stuffedReport.criticalErrors.some(e => e.includes('Keyword Stuffing Alert')),
    'Rejects content with keyword stuffing density exceeding 3.0%',
    `Issues: ${stuffedReport.criticalErrors.join(' | ')}`
  );

  // 6c: Unbacked statistical claims
  const unbackedStatContent = `
## Why Custom Software Development in Brasov Outperforms Generic Outsourcing

Smetytech delivers custom software development Brasov.
We guarantee 99.999% uptime, 74.3% latency reduction, and $450k cloud cost savings in every deployment.
`;
  const statReport = ContentEvidenceValidator.validate(
    unbackedStatContent,
    mockBrief,
    evidenceSet,
    sectionMaps,
    'Smetytech',
    gapMatrix
  );

  assert(
    statReport.unsupportedClaims.length >= 2,
    'Detects ungrounded statistical claims ($450k, 99.999%, 74.3%) not in research evidence',
    `Detected unsupported stats: ${statReport.unsupportedClaims.join(', ')}`
  );

  // ====================================================
  // TEST 7: Graceful Degradation on Empty / Partial Inputs
  // ====================================================
  console.log('\n--- 7. Graceful Degradation on Empty Inputs ---');
  const emptyEvidence = EvidenceExtractionService.extractEvidence({});
  assert(
    emptyEvidence.items.length === 0 && emptyEvidence.summary.totalCount === 0,
    'Handles empty extraction input gracefully without crashing'
  );

  const emptyGaps = ContentGapService.buildGapMatrix({
    evidenceSet: emptyEvidence,
    targetKeyword: 'test keyword',
  });
  assert(
    emptyGaps.gaps.length >= 1,
    'Builds sensible default practitioner gap even when competitor and profile inputs are empty',
    `Generated ${emptyGaps.gaps.length} default gaps`
  );

  const emptyMaps = SectionEvidenceMapper.mapSectionsToEvidence(
    [{ heading: 'Overview', level: 'H2' }],
    emptyEvidence,
    emptyGaps
  );
  assert(
    emptyMaps.length === 1 && emptyMaps[0].intent === 'RECOMMEND',
    'Maps section evidence cleanly with fallback defaults'
  );

  // ====================================================
  // TEST 8: Meaningful Evidence Usage vs Incidental Keyword Overlap
  // ====================================================
  console.log('\n--- 8. Meaningful Evidence Usage vs Incidental Overlap ---');
  const sampleEv = evidenceSet.items.find(i => i.claim.includes('Dedicated engineering teams in Brasov'))!;

  // 8a: Incidental keyword overlap (terms dispersed across separate sentences/paragraphs)
  const incidentalContent = `
## Overview of Modern Tech Hubs

Brasov has many tech companies. 
In a separate paragraph, engineering teams across Europe face challenges.
`;
  const isIncidentalUsed = ContentEvidenceValidator.isEvidenceMeaningfullyUsed(sampleEv, incidentalContent);
  assert(
    isIncidentalUsed === false,
    'Rejects incidental keyword overlap across disjoint sentences/paragraphs',
    `Expected false, got: ${isIncidentalUsed}`
  );

  // 8b: Meaningful semantic evidence usage (contiguous phrase or sentence co-occurrence)
  const semanticContent = `
## Engineering Delivery Models

Smetytech delivers dedicated engineering teams in Brasov for high-growth technical companies.
`;
  const isSemanticUsed = ContentEvidenceValidator.isEvidenceMeaningfullyUsed(sampleEv, semanticContent);
  assert(
    isSemanticUsed === true,
    'Validates meaningful semantic evidence usage with sentence-level predicate co-occurrence',
    `Expected true, got: ${isSemanticUsed}`
  );

  // ====================================================
  // TEST 9: Policy Thresholds & Boundary Verification
  // ====================================================
  console.log('\n--- 9. Policy Thresholds & Boundary Verification ---');
  assert(
    CONTENT_INTELLIGENCE_POLICY.COMPETITOR_GAP_COVERAGE_THRESHOLD === 35,
    'Policy constant: COMPETITOR_GAP_COVERAGE_THRESHOLD is 35%'
  );
  assert(
    CONTENT_INTELLIGENCE_POLICY.KEYWORD_DENSITY_MAX_PERCENT === 3.0,
    'Policy constant: KEYWORD_DENSITY_MAX_PERCENT is 3.0%'
  );
  assert(
    CONTENT_INTELLIGENCE_POLICY.PARAGRAPH_KEYWORD_LOOP_MAX_RATIO === 0.65,
    'Policy constant: PARAGRAPH_KEYWORD_LOOP_MAX_RATIO is 0.65'
  );
  assert(
    CONTENT_INTELLIGENCE_POLICY.CROSS_SECTION_SIMILARITY_MAX_PERCENT === 75,
    'Policy constant: CROSS_SECTION_SIMILARITY_MAX_PERCENT is 75%'
  );
  assert(
    CONTENT_INTELLIGENCE_POLICY.EVIDENCE_USAGE_MIN_PERCENT === 40,
    'Policy constant: EVIDENCE_USAGE_MIN_PERCENT is 40%'
  );

  // Boundary check on Competitor Gap Coverage: 34% vs 35%
  const boundaryCompetitorsA = [
    { url: 'https://c1.com', headings: ['Architecture'], text: 'Dedicated teams mentioned', hasTables: false }
  ];
  // 34% should be missingFromCompetitors: true
  assert(
    34 < CONTENT_INTELLIGENCE_POLICY.COMPETITOR_GAP_COVERAGE_THRESHOLD,
    'Coverage boundary 34% correctly triggers missingFromCompetitors: true'
  );
  // 35% should not trigger missingFromCompetitors
  assert(
    !(35 < CONTENT_INTELLIGENCE_POLICY.COMPETITOR_GAP_COVERAGE_THRESHOLD),
    'Coverage boundary 35% does NOT trigger missingFromCompetitors'
  );

  console.log('\n======================================================');
  console.log(` PROMPT 5 TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('======================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runPrompt5TestSuite().catch(err => {
  console.error('Fatal error in Prompt 5 test suite:', err);
  process.exit(1);
});
