import assert from 'assert';
import { ContentEvidenceValidator } from '../src/lib/intelligence/ContentEvidenceValidator';
import { ClaimExtractionService } from '../src/lib/intelligence/ClaimExtractionService';
import { ClaimGroundingEngine } from '../src/lib/intelligence/ClaimGroundingEngine';
import { EvidenceSet, EvidenceItem } from '../src/core/contracts/evidence';

const targetBrand = 'Acme';
const knownCompetitors = ['CompetitorX'];

const baseBrief: any = {
  title: 'Cloud Architecture & Enterprise Delivery',
  targetKeywords: ['cloud architecture'],
  outline: [
    { heading: 'Overview', level: 'H2', generate_table: false, assignedKeywords: [], assignedEntities: [] }
  ],
  wordCountBudget: { min: 100, max: 800, target: 400 },
  intent: {
    primaryKeyword: 'cloud architecture',
    intentType: 'Informational',
    contentType: 'Guide'
  },
  competitorInsights: [
    { title: 'CompetitorX', url: 'https://competitorx.com' }
  ]
};

const emptyEvidenceSet: EvidenceSet = {
  items: [],
  extractedAt: new Date().toISOString(),
  summary: { totalCount: 0, highConfidenceCount: 0, businessFactCount: 0, competitorObservationCount: 0, serpObservationCount: 0, inferenceCount: 0 }
};

console.log('=== RUNNING P0.3.1 COMPOUND-CLAIM DURABLE REGRESSION SUITE ===\n');

// -------------------------------------------------------------
// Test 1: Supported metric + unsupported commercial promise -> MUST BE BLOCKED
// Asserts extraction (text, subject, materiality), grounding (status, evidence refs), and validation
// -------------------------------------------------------------
{
  console.log('--- Test 1: Supported metric + unsupported commercial promise ---');
  const sentence = "Our platform provides 99.999% uptime SLA and guarantees instant risk-free deployment.";
  const evSet: EvidenceSet = {
    items: [
      {
        id: 'ev-target-sla',
        sourceUrl: 'https://acme.com/sla',
        sourceTitle: 'Acme SLA',
        claim: 'Acme provides a 99.999% uptime SLA.',
        evidenceType: 'TECHNICAL_SPEC',
        sourceType: 'TARGET_SITE',
        confidence: 'HIGH',
        citationRequired: true
      }
    ],
    extractedAt: new Date().toISOString(),
    summary: { totalCount: 1, highConfidenceCount: 1, businessFactCount: 1, competitorObservationCount: 0, serpObservationCount: 0, inferenceCount: 0 }
  };

  // 1. Extraction verification
  const extracted = ClaimExtractionService.extractClaimsFromSentence(
    sentence,
    0,
    'Overview',
    0,
    targetBrand,
    knownCompetitors
  );
  assert.strictEqual(extracted.length, 2, 'Test 1: Must extract exactly 2 atomic claims');
  const metricClaim = extracted.find(c => c.claimType === 'QUANTITATIVE')!;
  const deployClaim = extracted.find(c => c.claimType === 'ENTITY_CAPABILITY')!;
  assert(metricClaim, 'Test 1: Must extract quantitative SLA claim');
  assert(deployClaim, 'Test 1: Must extract entity capability deployment claim');
  assert.strictEqual(metricClaim.materiality, 'CRITICAL', 'Test 1: Metric claim must be CRITICAL');
  assert.strictEqual(deployClaim.subjectEntity, targetBrand, 'Test 1: Subject must inherit targetBrand');
  assert(deployClaim.claimText.includes('guarantees instant risk-free deployment'), 'Test 1: Extracted proposition text match');

  // 2. Grounding verification
  const grounded = ClaimGroundingEngine.groundAllClaims(
    extracted,
    evSet,
    undefined,
    targetBrand,
    knownCompetitors
  );
  const grMetric = grounded.claims.find(c => c.claimType === 'QUANTITATIVE')!;
  const grDeploy = grounded.claims.find(c => c.claimType === 'ENTITY_CAPABILITY')!;
  assert.strictEqual(grMetric.supportStatus, 'SUPPORTED', 'Test 1: SLA must be SUPPORTED');
  assert(grMetric.groundedEvidenceIds.includes('ev-target-sla'), 'Test 1: SLA must link ev-target-sla');
  assert.strictEqual(grDeploy.supportStatus, 'UNSUPPORTED', 'Test 1: Deployment must be UNSUPPORTED');
  assert.strictEqual(grDeploy.groundedEvidenceIds.length, 0, 'Test 1: Deployment must have zero evidence IDs');

  // 3. Final validation verification
  const val = ContentEvidenceValidator.validate(
    `## Overview\n\n${sentence}\n`,
    baseBrief,
    evSet,
    undefined,
    targetBrand
  );
  assert.strictEqual(val.passed, false, 'Test 1: Final validation MUST FAIL');
  assert(val.criticalErrors.length >= 1, 'Test 1: Must emit critical error');
  assert(val.criticalErrors.some(e => e.includes('instant risk-free deployment') || e.includes('guarantees instant')));
  console.log('  [PASS] Test 1');
}

// -------------------------------------------------------------
// Test 2: Inverse case — Unsupported metric + supported commercial promise -> MUST BE BLOCKED
// -------------------------------------------------------------
{
  console.log('\n--- Test 2: Unsupported metric + supported commercial promise ---');
  const sentence = "Our platform provides 99.999% uptime SLA and guarantees instant risk-free deployment.";
  const evSet: EvidenceSet = {
    items: [
      {
        id: 'ev-target-deploy',
        sourceUrl: 'https://acme.com/features',
        sourceTitle: 'Acme Features',
        claim: 'Acme guarantees instant risk-free deployment.',
        evidenceType: 'FEATURE',
        sourceType: 'TARGET_SITE',
        confidence: 'HIGH',
        citationRequired: true
      }
    ],
    extractedAt: new Date().toISOString(),
    summary: { totalCount: 1, highConfidenceCount: 1, businessFactCount: 1, competitorObservationCount: 0, serpObservationCount: 0, inferenceCount: 0 }
  };

  const extracted = ClaimExtractionService.extractClaimsFromSentence(
    sentence,
    0,
    'Overview',
    0,
    targetBrand,
    knownCompetitors
  );
  const grounded = ClaimGroundingEngine.groundAllClaims(
    extracted,
    evSet,
    undefined,
    targetBrand,
    knownCompetitors
  );
  const grMetric = grounded.claims.find(c => c.claimType === 'QUANTITATIVE')!;
  const grDeploy = grounded.claims.find(c => c.claimType === 'ENTITY_CAPABILITY')!;
  assert.strictEqual(grMetric.supportStatus, 'UNSUPPORTED', 'Test 2: SLA metric must be UNSUPPORTED');
  assert.strictEqual(grDeploy.supportStatus, 'SUPPORTED', 'Test 2: Deployment promise must be SUPPORTED');
  assert(grDeploy.groundedEvidenceIds.includes('ev-target-deploy'), 'Test 2: Deployment links ev-target-deploy');

  const val = ContentEvidenceValidator.validate(
    `## Overview\n\n${sentence}\n`,
    baseBrief,
    evSet,
    undefined,
    targetBrand
  );
  assert.strictEqual(val.passed, false, 'Test 2: Final validation MUST FAIL');
  assert(val.criticalErrors.some(e => e.includes('99.999%')));
  console.log('  [PASS] Test 2');
}

// -------------------------------------------------------------
// Test 3: Multiple propositions (2 quantitative + 1 qualitative) where evidence supports only 1
// -------------------------------------------------------------
{
  console.log('\n--- Test 3: Multiple propositions where evidence supports only 1 ---');
  const sentence = "The platform reduces operational costs by 40%, delivers 99.9% uptime, and eliminates onboarding friction.";
  const evSet: EvidenceSet = {
    items: [
      {
        id: 'ev-target-cost',
        sourceUrl: 'https://acme.com/roi',
        sourceTitle: 'Acme ROI',
        claim: 'Acme reduces operational costs by 40%.',
        evidenceType: 'BUSINESS_FACT',
        sourceType: 'TARGET_SITE',
        confidence: 'HIGH',
        citationRequired: true
      }
    ],
    extractedAt: new Date().toISOString(),
    summary: { totalCount: 1, highConfidenceCount: 1, businessFactCount: 1, competitorObservationCount: 0, serpObservationCount: 0, inferenceCount: 0 }
  };

  const extracted = ClaimExtractionService.extractClaimsFromSentence(
    sentence,
    0,
    'Overview',
    0,
    targetBrand,
    knownCompetitors
  );
  assert(extracted.length >= 3, 'Test 3: Must extract at least 3 claims');

  const val = ContentEvidenceValidator.validate(
    `## Overview\n\n${sentence}\n`,
    baseBrief,
    evSet,
    undefined,
    targetBrand
  );
  assert.strictEqual(val.passed, false, 'Test 3: MUST FAIL when only 1 of 3 is supported');
  assert(val.criticalErrors.length >= 2, 'Test 3: Must flag at least 2 unsupported critical claims');
  console.log('  [PASS] Test 3');
}

// -------------------------------------------------------------
// Test 4: Both propositions supported by independently aligned evidence -> MUST PASS
// -------------------------------------------------------------
{
  console.log('\n--- Test 4: Both propositions supported by verified evidence ---');
  const sentence = "Our platform provides 99.999% uptime SLA and guarantees instant risk-free deployment.";
  const evSet: EvidenceSet = {
    items: [
      {
        id: 'ev-target-sla',
        sourceUrl: 'https://acme.com/sla',
        sourceTitle: 'Acme SLA',
        claim: 'Acme provides a 99.999% uptime SLA.',
        evidenceType: 'TECHNICAL_SPEC',
        sourceType: 'TARGET_SITE',
        confidence: 'HIGH',
        citationRequired: true
      },
      {
        id: 'ev-target-deploy',
        sourceUrl: 'https://acme.com/features',
        sourceTitle: 'Acme Features',
        claim: 'Acme guarantees instant risk-free deployment.',
        evidenceType: 'FEATURE',
        sourceType: 'TARGET_SITE',
        confidence: 'HIGH',
        citationRequired: true
      }
    ],
    extractedAt: new Date().toISOString(),
    summary: { totalCount: 2, highConfidenceCount: 2, businessFactCount: 2, competitorObservationCount: 0, serpObservationCount: 0, inferenceCount: 0 }
  };

  const val = ContentEvidenceValidator.validate(
    `## Overview\n\n${sentence}\n`,
    baseBrief,
    evSet,
    undefined,
    targetBrand
  );
  assert.strictEqual(val.passed, true, 'Test 4: MUST PASS when both propositions are backed');
  assert.strictEqual(val.criticalErrors.length, 0);
  console.log('  [PASS] Test 4');
}

// -------------------------------------------------------------
// Test 5: Competitor evidence isolation in compound sentence -> MUST BE BLOCKED
// -------------------------------------------------------------
{
  console.log('\n--- Test 5: Competitor evidence isolation in compound sentence ---');
  const sentence = "Our platform provides 99.999% uptime SLA and guarantees instant risk-free deployment.";
  const evSet: EvidenceSet = {
    items: [
      {
        id: 'ev-target-sla',
        sourceUrl: 'https://acme.com/sla',
        sourceTitle: 'Acme SLA',
        claim: 'Acme provides a 99.999% uptime SLA.',
        evidenceType: 'TECHNICAL_SPEC',
        sourceType: 'TARGET_SITE',
        confidence: 'HIGH',
        citationRequired: true
      },
      {
        id: 'ev-comp-deploy',
        sourceUrl: 'https://competitorx.com/features',
        sourceTitle: 'CompetitorX Features',
        claim: 'CompetitorX guarantees instant risk-free deployment.',
        evidenceType: 'COMPETITOR_OBSERVATION',
        sourceType: 'COMPETITOR',
        confidence: 'HIGH',
        citationRequired: true
      }
    ],
    extractedAt: new Date().toISOString(),
    summary: { totalCount: 2, highConfidenceCount: 2, businessFactCount: 1, competitorObservationCount: 1, serpObservationCount: 0, inferenceCount: 0 }
  };

  const val = ContentEvidenceValidator.validate(
    `## Overview\n\n${sentence}\n`,
    baseBrief,
    evSet,
    undefined,
    targetBrand
  );
  assert.strictEqual(val.passed, false, 'Test 5: MUST FAIL when deployment promise backed only by CompetitorX');
  assert(val.criticalErrors.some(e => e.includes('Entity Isolation') || e.includes('not grounded in research evidence')));
  console.log('  [PASS] Test 5');
}

// -------------------------------------------------------------
// Test 6: Multiple quantitative claims + qualitative promise (all supported) -> MUST PASS
// -------------------------------------------------------------
{
  console.log('\n--- Test 6: Multiple quantitative claims + qualitative promise (all supported) ---');
  const sentence = "The platform reduces operational costs by 40%, delivers 99.9% uptime, and eliminates onboarding friction.";
  const evSet: EvidenceSet = {
    items: [
      {
        id: 'ev-target-cost',
        sourceUrl: 'https://acme.com/roi',
        sourceTitle: 'Acme ROI',
        claim: 'Acme reduces operational costs by 40%.',
        evidenceType: 'BUSINESS_FACT',
        sourceType: 'TARGET_SITE',
        confidence: 'HIGH',
        citationRequired: true
      },
      {
        id: 'ev-target-uptime',
        sourceUrl: 'https://acme.com/sla',
        sourceTitle: 'Acme SLA',
        claim: 'Acme delivers 99.9% uptime.',
        evidenceType: 'TECHNICAL_SPEC',
        sourceType: 'TARGET_SITE',
        confidence: 'HIGH',
        citationRequired: true
      },
      {
        id: 'ev-target-friction',
        sourceUrl: 'https://acme.com/features',
        sourceTitle: 'Acme Features',
        claim: 'Acme eliminates onboarding friction with automated tools.',
        evidenceType: 'FEATURE',
        sourceType: 'TARGET_SITE',
        confidence: 'HIGH',
        citationRequired: true
      }
    ],
    extractedAt: new Date().toISOString(),
    summary: { totalCount: 3, highConfidenceCount: 3, businessFactCount: 3, competitorObservationCount: 0, serpObservationCount: 0, inferenceCount: 0 }
  };

  const val = ContentEvidenceValidator.validate(
    `## Overview\n\nAcme overview. ${sentence}\n`,
    baseBrief,
    evSet,
    undefined,
    targetBrand
  );
  assert.strictEqual(val.passed, true, 'Test 6: MUST PASS when all 3 claims are supported');
  assert.strictEqual(val.criticalErrors.length, 0);
  console.log('  [PASS] Test 6');
}

// -------------------------------------------------------------
// Test 7: Semicolon-separated propositions -> MUST BE BLOCKED
// -------------------------------------------------------------
{
  console.log('\n--- Test 7: Semicolon-separated propositions ---');
  const sentence = "Our platform provides 99.999% uptime SLA; the product guarantees effortless deployment.";
  const evSet: EvidenceSet = {
    items: [
      {
        id: 'ev-target-sla',
        sourceUrl: 'https://acme.com/sla',
        sourceTitle: 'Acme SLA',
        claim: 'Acme provides a 99.999% uptime SLA.',
        evidenceType: 'TECHNICAL_SPEC',
        sourceType: 'TARGET_SITE',
        confidence: 'HIGH',
        citationRequired: true
      }
    ],
    extractedAt: new Date().toISOString(),
    summary: { totalCount: 1, highConfidenceCount: 1, businessFactCount: 1, competitorObservationCount: 0, serpObservationCount: 0, inferenceCount: 0 }
  };

  const val = ContentEvidenceValidator.validate(
    `## Overview\n\n${sentence}\n`,
    baseBrief,
    evSet,
    undefined,
    targetBrand
  );
  assert.strictEqual(val.passed, false, 'Test 7: MUST FAIL when second clause is unsupported');
  assert(val.criticalErrors.length >= 1);
  console.log('  [PASS] Test 7');
}

// -------------------------------------------------------------
// Test 8: Negated statement in compound sentence -> MUST PASS
// -------------------------------------------------------------
{
  console.log('\n--- Test 8: Negated statement in compound sentence ---');
  const sentence = "Our platform provides 99.999% uptime SLA, although the platform does not guarantee zero downtime.";
  const evSet: EvidenceSet = {
    items: [
      {
        id: 'ev-target-sla',
        sourceUrl: 'https://acme.com/sla',
        sourceTitle: 'Acme SLA',
        claim: 'Acme provides a 99.999% uptime SLA.',
        evidenceType: 'TECHNICAL_SPEC',
        sourceType: 'TARGET_SITE',
        confidence: 'HIGH',
        citationRequired: true
      }
    ],
    extractedAt: new Date().toISOString(),
    summary: { totalCount: 1, highConfidenceCount: 1, businessFactCount: 1, competitorObservationCount: 0, serpObservationCount: 0, inferenceCount: 0 }
  };

  const val = ContentEvidenceValidator.validate(
    `## Overview\n\nAcme platform overview. ${sentence}\n`,
    baseBrief,
    evSet,
    undefined,
    targetBrand
  );
  assert.strictEqual(val.passed, true, 'Test 8: MUST PASS (negated statement does not create affirmative commercial obligation)');
  assert.strictEqual(val.criticalErrors.length, 0);
  console.log('  [PASS] Test 8');
}

// -------------------------------------------------------------
// Test 9: Hypothetical statement in compound sentence -> MUST PASS
// -------------------------------------------------------------
{
  console.log('\n--- Test 9: Hypothetical statement in compound sentence ---');
  const sentence = "Our platform provides 99.999% uptime SLA, and if teams optimize their queries, latency might decrease.";
  const evSet: EvidenceSet = {
    items: [
      {
        id: 'ev-target-sla',
        sourceUrl: 'https://acme.com/sla',
        sourceTitle: 'Acme SLA',
        claim: 'Acme provides a 99.999% uptime SLA.',
        evidenceType: 'TECHNICAL_SPEC',
        sourceType: 'TARGET_SITE',
        confidence: 'HIGH',
        citationRequired: true
      }
    ],
    extractedAt: new Date().toISOString(),
    summary: { totalCount: 1, highConfidenceCount: 1, businessFactCount: 1, competitorObservationCount: 0, serpObservationCount: 0, inferenceCount: 0 }
  };

  const val = ContentEvidenceValidator.validate(
    `## Overview\n\nAcme platform overview. ${sentence}\n`,
    baseBrief,
    evSet,
    undefined,
    targetBrand
  );
  assert.strictEqual(val.passed, true, 'Test 9: MUST PASS (hypothetical condition is supplemental)');
  assert.strictEqual(val.criticalErrors.length, 0);
  console.log('  [PASS] Test 9');
}

// -------------------------------------------------------------
// Test 10: Generic educational technical statements -> MUST PASS
// -------------------------------------------------------------
{
  console.log('\n--- Test 10: Generic educational technical statements in compound sentence ---');
  const sentence = "Our platform provides 99.999% uptime SLA, but distributed systems coordinate state through consensus protocols.";
  const evSet: EvidenceSet = {
    items: [
      {
        id: 'ev-target-sla',
        sourceUrl: 'https://acme.com/sla',
        sourceTitle: 'Acme SLA',
        claim: 'Acme provides a 99.999% uptime SLA.',
        evidenceType: 'TECHNICAL_SPEC',
        sourceType: 'TARGET_SITE',
        confidence: 'HIGH',
        citationRequired: true
      }
    ],
    extractedAt: new Date().toISOString(),
    summary: { totalCount: 1, highConfidenceCount: 1, businessFactCount: 1, competitorObservationCount: 0, serpObservationCount: 0, inferenceCount: 0 }
  };

  const val = ContentEvidenceValidator.validate(
    `## Overview\n\nAcme platform overview. ${sentence}\n`,
    baseBrief,
    evSet,
    undefined,
    targetBrand
  );
  assert.strictEqual(val.passed, true, 'Test 10: MUST PASS (educational technical fact is supplemental)');
  assert.strictEqual(val.criticalErrors.length, 0);
  console.log('  [PASS] Test 10');
}

// -------------------------------------------------------------
// Test 11: Key P0.3 commercial claim bypasses under zero evidence -> MUST ALL BE BLOCKED
// -------------------------------------------------------------
{
  console.log('\n--- Test 11: P0.3 Qualitative Commercial Claim Bypasses (Zero Evidence) ---');
  const bypassSentences = [
    { label: 'First-person subject', text: 'Our platform eliminates onboarding friction.' },
    { label: 'Implicit platform subject', text: 'The platform eliminates onboarding friction.' },
    { label: 'Brand omitted promise', text: 'The product guarantees effortless enterprise deployment.' },
    { label: 'Marketing outcome promise', text: 'Teams achieve seamless integration with every major system.' },
    { label: 'Nonnumeric SLA promise', text: 'Deployment is instant and completely risk-free.' },
    { label: 'Definite software capability', text: 'The software automates repetitive engineering workflows.' }
  ];

  for (const bp of bypassSentences) {
    const extracted = ClaimExtractionService.extractClaimsFromSentence(
      bp.text,
      0,
      'Overview',
      0,
      targetBrand,
      knownCompetitors
    );
    assert(extracted.length >= 1, `Test 11 (${bp.label}): Must extract claim`);
    assert.strictEqual(extracted[0].materiality, 'CRITICAL', `Test 11 (${bp.label}): Materiality must be CRITICAL`);

    const val = ContentEvidenceValidator.validate(
      `## Overview\n\n${bp.text}\n`,
      baseBrief,
      emptyEvidenceSet,
      undefined,
      targetBrand
    );
    assert.strictEqual(val.passed, false, `Test 11 (${bp.label}): MUST FAIL validation under zero evidence`);
    assert(val.criticalErrors.length >= 1, `Test 11 (${bp.label}): Must emit critical error`);
    console.log(`  [PASS] Test 11 - ${bp.label}`);
  }
}

// -------------------------------------------------------------
// Test 12: Concessive / skeptical phrasing preserves nuance -> MUST PASS
// -------------------------------------------------------------
{
  console.log('\n--- Test 12: Concessive / skeptical phrasing ---');
  const sentence = "Although the vendor advertises instant deployment, independent tests found delays.";
  const val = ContentEvidenceValidator.validate(
    `## Overview\n\n${sentence}\n`,
    baseBrief,
    emptyEvidenceSet,
    undefined,
    targetBrand
  );
  assert.strictEqual(val.passed, true, 'Test 12: MUST PASS (concessive vendor statement is not affirmative brand capability)');
  assert.strictEqual(val.criticalErrors.length, 0);
  console.log('  [PASS] Test 12');
}

console.log('\n=============================================================');
console.log('ALL P0.3.1 COMPOUND-CLAIM DURABLE REGRESSION TESTS PASSED!');
console.log('=============================================================');
