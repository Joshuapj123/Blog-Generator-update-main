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

interface AuditCase {
  id: number;
  description: string;
  sentence: string;
  evidenceSet: EvidenceSet;
  expectedPass: boolean;
}

const auditCases: AuditCase[] = [
  // Case 1: “Between $100 and $150” remains a numeric range.
  {
    id: 1,
    description: '“Between $100 and $150” remains a numeric range',
    sentence: 'Monthly hosting costs between $100 and $150 for small teams.',
    evidenceSet: {
      items: [
        {
          id: 'ev-range-1',
          sourceUrl: 'https://acme.com/pricing',
          sourceTitle: 'Acme Pricing',
          claim: 'Monthly hosting costs between $100 and $150 for small teams.',
          evidenceType: 'BUSINESS_FACT',
          sourceType: 'TARGET_SITE',
          confidence: 'HIGH',
          citationRequired: true
        }
      ],
      extractedAt: new Date().toISOString(),
      summary: { totalCount: 1, highConfidenceCount: 1, businessFactCount: 1, competitorObservationCount: 0, serpObservationCount: 0, inferenceCount: 0 }
    },
    expectedPass: true
  },
  // Case 2: “Research and development costs decreased” does not produce misleading claims.
  {
    id: 2,
    description: '“Research and development costs decreased” does not produce misleading claims',
    sentence: 'Research and development costs decreased across the industry.',
    evidenceSet: emptyEvidenceSet,
    expectedPass: true // General industry trend, supplemental fact
  },
  // Case 3: “The platform supports analytics and reporting” preserves both material capabilities.
  {
    id: 3,
    description: '“The platform supports analytics and reporting” preserves both material capabilities',
    sentence: 'The platform supports analytics and reporting.',
    evidenceSet: {
      items: [
        {
          id: 'ev-analytics',
          sourceUrl: 'https://acme.com/features',
          sourceTitle: 'Acme Features',
          claim: 'The platform supports analytics and reporting.',
          evidenceType: 'FEATURE',
          sourceType: 'TARGET_SITE',
          confidence: 'HIGH',
          citationRequired: true
        }
      ],
      extractedAt: new Date().toISOString(),
      summary: { totalCount: 1, highConfidenceCount: 1, businessFactCount: 1, competitorObservationCount: 0, serpObservationCount: 0, inferenceCount: 0 }
    },
    expectedPass: true
  },
  // Case 4: “The platform reduces costs by 40% while maintaining 99.9% uptime” requires independently aligned evidence for both claims.
  {
    id: 4,
    description: '“The platform reduces costs by 40% while maintaining 99.9% uptime” requires independently aligned evidence for both claims',
    sentence: 'The platform reduces costs by 40% while maintaining 99.9% uptime.',
    evidenceSet: {
      items: [
        {
          id: 'ev-cost',
          sourceUrl: 'https://acme.com/roi',
          sourceTitle: 'Acme ROI',
          claim: 'The platform reduces costs by 40%.',
          evidenceType: 'BUSINESS_FACT',
          sourceType: 'TARGET_SITE',
          confidence: 'HIGH',
          citationRequired: true
        }
        // Missing 99.9% uptime evidence!
      ],
      extractedAt: new Date().toISOString(),
      summary: { totalCount: 1, highConfidenceCount: 1, businessFactCount: 1, competitorObservationCount: 0, serpObservationCount: 0, inferenceCount: 0 }
    },
    expectedPass: false
  },
  // Case 5: “Although the vendor advertises instant deployment, independent tests found delays” does not become an unsupported affirmative target-brand promise.
  {
    id: 5,
    description: '“Although the vendor advertises instant deployment, independent tests found delays” does not become an affirmative promise',
    sentence: 'Although the vendor advertises instant deployment, independent tests found delays.',
    evidenceSet: emptyEvidenceSet,
    expectedPass: true // Subordinate vendor advertisement + external testing observation -> not affirmative target brand capability
  },
  // Case 6: A supported metric plus an unsupported commercial promise fails.
  {
    id: 6,
    description: 'A supported metric plus an unsupported commercial promise fails',
    sentence: 'Our platform provides 99.999% uptime SLA and guarantees instant risk-free deployment.',
    evidenceSet: {
      items: [
        {
          id: 'ev-sla',
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
    },
    expectedPass: false
  },
  // Case 7: An unsupported metric plus a supported capability fails.
  {
    id: 7,
    description: 'An unsupported metric plus a supported capability fails',
    sentence: 'Our platform provides 99.999% uptime SLA and guarantees instant risk-free deployment.',
    evidenceSet: {
      items: [
        {
          id: 'ev-deploy',
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
    },
    expectedPass: false
  },
  // Case 8: Multiple quantitative claims with evidence for only one fail.
  {
    id: 8,
    description: 'Multiple quantitative claims with evidence for only one fail',
    sentence: 'The platform reduces latency by 65% and provides a 99.999% uptime SLA.',
    evidenceSet: {
      items: [
        {
          id: 'ev-latency',
          sourceUrl: 'https://acme.com/perf',
          sourceTitle: 'Acme Performance',
          claim: 'Acme reduces latency by 65%.',
          evidenceType: 'TECHNICAL_SPEC',
          sourceType: 'TARGET_SITE',
          confidence: 'HIGH',
          citationRequired: true
        }
      ],
      extractedAt: new Date().toISOString(),
      summary: { totalCount: 1, highConfidenceCount: 1, businessFactCount: 1, competitorObservationCount: 0, serpObservationCount: 0, inferenceCount: 0 }
    },
    expectedPass: false
  },
  // Case 9: Mixed target/competitor evidence never crosses entity boundaries.
  {
    id: 9,
    description: 'Mixed target/competitor evidence never crosses entity boundaries',
    sentence: 'Our platform provides 99.999% uptime SLA and guarantees instant risk-free deployment.',
    evidenceSet: {
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
    },
    expectedPass: false // Competitor evidence cannot ground target deployment promise
  },
  // Case 10: Negated or hypothetical clauses do not downgrade separate affirmative claims.
  {
    id: 10,
    description: 'Negated or hypothetical clauses do not downgrade separate affirmative claims',
    sentence: 'Our platform provides 99.999% uptime SLA, although the platform does not guarantee zero downtime.',
    evidenceSet: {
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
    },
    expectedPass: true // SLA is supported, negation is not treated as ungrounded capability
  },
  // Case 11: Semicolon-separated claims are extracted and grounded independently.
  {
    id: 11,
    description: 'Semicolon-separated claims are extracted and grounded independently',
    sentence: 'Our platform provides 99.999% uptime SLA; the product guarantees effortless deployment.',
    evidenceSet: {
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
    },
    expectedPass: false // Effortless deployment is unsupported
  },
  // Case 12: A conjunction inside a normal phrase does not incorrectly split the subject or proposition.
  {
    id: 12,
    description: 'A conjunction inside a normal phrase does not incorrectly split the subject or proposition',
    sentence: 'Our platform provides fast and secure infrastructure for enterprise workloads.',
    evidenceSet: {
      items: [
        {
          id: 'ev-infra',
          sourceUrl: 'https://acme.com/features',
          sourceTitle: 'Acme Infrastructure',
          claim: 'Our platform provides fast and secure infrastructure for enterprise workloads.',
          evidenceType: 'FEATURE',
          sourceType: 'TARGET_SITE',
          confidence: 'HIGH',
          citationRequired: true
        }
      ],
      extractedAt: new Date().toISOString(),
      summary: { totalCount: 1, highConfidenceCount: 1, businessFactCount: 1, competitorObservationCount: 0, serpObservationCount: 0, inferenceCount: 0 }
    },
    expectedPass: true
  }
];

console.log('=== AUDITING 12 SEMANTIC PRESERVATION CASES ===\n');

for (const c of auditCases) {
  console.log(`----------------------------------------------------------------`);
  console.log(`Case ${c.id}: ${c.description}`);
  console.log(`Input Sentence: "${c.sentence}"`);

  const extracted = ClaimExtractionService.extractClaimsFromSentence(
    c.sentence,
    0,
    'Overview',
    0,
    targetBrand,
    knownCompetitors
  );

  console.log(`Extracted Claims (${extracted.length}):`);
  for (const cl of extracted) {
    console.log(`  - [${cl.claimType}] id=${cl.id}, text="${cl.claimText}", subj=${cl.subjectEntity || '<undef>'}, mat=${cl.materiality}`);
  }

  const grounded = ClaimGroundingEngine.groundAllClaims(
    extracted,
    c.evidenceSet,
    undefined,
    targetBrand,
    knownCompetitors
  );

  console.log(`Grounding Results:`);
  for (const g of grounded.claims) {
    console.log(`  - id=${g.id}: status=${g.supportStatus}, reason=${g.rejectionReason || '<none>'}, groundedEv=${JSON.stringify(g.groundedEvidenceIds)}`);
  }

  const val = ContentEvidenceValidator.validate(
    `## Overview\n\nAcme overview. ${c.sentence}\n`,
    baseBrief,
    c.evidenceSet,
    undefined,
    targetBrand
  );

  console.log(`Validator Gate Decision:`);
  console.log(`  - passed: ${val.passed} (expected: ${c.expectedPass})`);
  console.log(`  - criticalErrors (${val.criticalErrors.length}): ${JSON.stringify(val.criticalErrors)}`);
  console.log(`  - warnings (${val.warnings.length}): ${JSON.stringify(val.warnings)}`);

  assert.strictEqual(
    val.passed,
    c.expectedPass,
    `Case ${c.id} failed assertion: expected passed=${c.expectedPass}, got passed=${val.passed}`
  );
  console.log(`  Status: [PASS]`);
}

console.log('\n================================================================');
console.log('ALL 12 SEMANTIC PRESERVATION CASES PASSED WITH 100% FIDELITY!');
console.log('================================================================');
