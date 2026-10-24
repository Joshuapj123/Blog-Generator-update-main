import assert from 'assert';
import { TopicRelevanceValidator } from '../src/lib/intelligence/TopicRelevanceValidator';
import { ContentGapService } from '../src/lib/intelligence/ContentGapService';
import { EvidenceSet, ContentGapMatrix } from '../src/core/contracts/evidence';
import { SaaSProfile } from '../src/core/contracts/schemas';

async function runPhase6BOutlineQualitySuite() {
  console.log('================================================================');
  console.log('ACUTE — Phase 6B: Outline Quality & Topic-Drift Regression Suite');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function recordPass(testName: string) {
    console.log(`[PASS] ${testName}`);
    passed++;
  }

  function recordFail(testName: string, err: any) {
    console.error(`[FAIL] ${testName}: ${err.message || err}`);
    failed++;
  }

  const mobileKw = 'how to improve mobile conversion rates through better ux';
  const mobileSupporting = [
    'mobile checkout friction',
    'form usability on small screens',
    'Core Web Vitals and mobile load speed'
  ];

  // --------------------------------------------------------------------------
  // TEST 1: Rejection of benchmark failure patterns on mobile-conversion topic
  // --------------------------------------------------------------------------
  try {
    const failureHeadings = [
      'Developer Retention Matrix',
      'Dedicated Engineering Teams vs Traditional Agency Retainers',
      'Enhancing Brand Visibility and AI Search Crawler Recognition',
      'Technical Schema Structures for Search Engines',
      'Staffing Models and Employee Retention',
      'Perplexity and Generative Engine Optimization Visibility'
    ];

    for (const heading of failureHeadings) {
      const rejection = TopicRelevanceValidator.evaluateHeading(heading, mobileKw, mobileSupporting);
      assert.ok(rejection !== null, `Expected "${heading}" to be rejected on topic "${mobileKw}"`);
      assert.ok(
        rejection.driftVector === 'STAFFING_HR' || rejection.driftVector === 'META_SEO' || rejection.driftVector === 'UNRELATED',
        `Expected valid drift vector, got: ${rejection?.driftVector}`
      );
    }

    recordPass('Gate 1: Rejection of benchmark drift patterns on mobile-conversion topic');
  } catch (err: any) {
    recordFail('Gate 1: Rejection of benchmark drift patterns on mobile-conversion topic', err);
  }

  // --------------------------------------------------------------------------
  // TEST 2: Rejection of candidate gaps with superficial token overlap
  // --------------------------------------------------------------------------
  try {
    const superficialHeadings = [
      'Mobile Freight Logistics and Trucking Rates',
      'Mobile Hardware Component Soldering and Screen Replacement',
      'Web Server Infrastructure and Cloud Hosting Costs',
      'Digital Logistics Freight Rate Index'
    ];

    for (const heading of superficialHeadings) {
      const rejection = TopicRelevanceValidator.evaluateHeading(heading, mobileKw, mobileSupporting);
      assert.ok(
        rejection !== null,
        `Expected superficial heading "${heading}" to be rejected on topic "${mobileKw}"`
      );
      assert.strictEqual(rejection?.driftVector, 'UNRELATED');
    }

    recordPass('Gate 2: Rejection of superficial token overlap (platform/metric only)');
  } catch (err: any) {
    recordFail('Gate 2: Rejection of superficial token overlap (platform/metric only)', err);
  }

  // --------------------------------------------------------------------------
  // TEST 3: Preservation of legitimate domain sections across specialized topics
  // --------------------------------------------------------------------------
  try {
    // 3a: Developer retention on developer staffing topic
    const staffingKw = 'developer retention strategies for tech leads';
    const staffingHeading = 'Developer Retention Matrix and Compensation Framework';
    const staffingRejection = TopicRelevanceValidator.evaluateHeading(staffingHeading, staffingKw);
    assert.strictEqual(
      staffingRejection,
      null,
      `Expected "${staffingHeading}" to be accepted on staffing topic "${staffingKw}"`
    );

    // 3b: AI search visibility on SEO/GEO topic
    const seoKw = 'generative engine optimization and ai search visibility';
    const seoHeading = 'Enhancing Brand Visibility and AI Search Crawler Recognition';
    const seoRejection = TopicRelevanceValidator.evaluateHeading(seoHeading, seoKw);
    assert.strictEqual(
      seoRejection,
      null,
      `Expected "${seoHeading}" to be accepted on SEO topic "${seoKw}"`
    );

    // 3c: Legitimate CRO / UX sections on mobile conversion topic
    const legitimateCroHeadings = [
      'Understanding Mobile Conversion Funnels and Drop-Off Points',
      'Frictionless Mobile Checkout Flow Design',
      'Form Usability on Touchscreens: Keyboard Triggers and Autocomplete',
      'Auditing Mobile Page Speed and Core Web Vitals',
      'Mobile UX Optimization Checklist'
    ];

    for (const heading of legitimateCroHeadings) {
      const rejection = TopicRelevanceValidator.evaluateHeading(heading, mobileKw, mobileSupporting);
      assert.strictEqual(
        rejection,
        null,
        `Expected legitimate CRO heading "${heading}" to be accepted`
      );
    }

    // 3d: Pure architectural structural headings on any topic
    const structuralHeadings = [
      'Introduction and Overview',
      'Methodology & Evaluation Criteria',
      'Key Takeaways and Executive Summary',
      'Conclusion & Next Steps',
      'Frequently Asked Questions'
    ];

    for (const heading of structuralHeadings) {
      const rejection = TopicRelevanceValidator.evaluateHeading(heading, mobileKw);
      assert.strictEqual(
        rejection,
        null,
        `Expected structural section "${heading}" to be accepted`
      );
    }

    recordPass('Gate 3: Preservation of legitimate domain sections and architectural nodes');
  } catch (err: any) {
    recordFail('Gate 3: Preservation of legitimate domain sections and architectural nodes', err);
  }

  // --------------------------------------------------------------------------
  // TEST 4: Evidence provenance retention for rejected candidate gaps
  // --------------------------------------------------------------------------
  try {
    const mockEvidenceSet: EvidenceSet = {
      items: [
        {
          id: 'ev_feat_1',
          sourceUrl: 'https://example.com/biz',
          sourceType: 'TARGET_SITE',
          claim: 'Our dedicated engineering teams improve developer retention and code output.',
          evidenceType: 'FEATURE',
          confidence: 'HIGH',
          citationRequired: false,
          entities: ['Developer Retention', 'Dedicated Teams']
        },
        {
          id: 'ev_cro_1',
          sourceUrl: 'https://example.com/ux',
          sourceType: 'SERP',
          claim: 'Streamlined 1-step checkout increases mobile conversion rates by 28%.',
          evidenceType: 'STATISTIC',
          confidence: 'HIGH',
          citationRequired: true,
          entities: ['Checkout', 'Mobile Conversion']
        }
      ],
      extractedAt: new Date().toISOString(),
      summary: {
        totalCount: 2,
        highConfidenceCount: 2,
        businessFactCount: 1,
        competitorObservationCount: 0,
        serpObservationCount: 1,
        inferenceCount: 0,
      }
    };

    const mockProfile: SaaSProfile = {
      name: 'TechAgency',
      description: 'Engineering and CRO consulting',
      targetAudience: 'Product Leaders',
      primaryCompetitors: [],
      tone: 'professional',
      customInsights: '',
      keyFeatures: [
        'Developer Retention Matrix',
        'Streamlined 1-Step Mobile Checkout'
      ]
    };

    const matrix = ContentGapService.buildGapMatrix({
      evidenceSet: mockEvidenceSet,
      saasProfile: mockProfile,
      competitors: [{ url: 'https://competitor.com', headings: ['Overview'] }],
      targetKeyword: mobileKw,
      supportingTerms: mobileSupporting
    });

    // Verify rejected gaps contain provenance
    assert.ok(matrix.rejectedGaps && matrix.rejectedGaps.length > 0, 'Expected rejectedGaps in matrix');
    const rejectedDeveloperRetention = matrix.rejectedGaps.find(g => g.topic.includes('Developer Retention'));
    assert.ok(rejectedDeveloperRetention, 'Expected Developer Retention in rejectedGaps');
    assert.strictEqual(rejectedDeveloperRetention.isApprovedForOutline, false);
    assert.strictEqual(rejectedDeveloperRetention.recommendedTreatment, 'OMIT');
    assert.strictEqual(rejectedDeveloperRetention.driftVector, 'STAFFING_HR');
    assert.ok((rejectedDeveloperRetention.rejectionReason || '').length > 0, 'Expected non-empty rejectionReason');
    assert.ok(rejectedDeveloperRetention.evidenceIds.includes('ev_feat_1'), 'Expected original evidenceId preserved');

    // Verify approved gaps only contain relevant topics
    assert.ok(matrix.gaps.length > 0, 'Expected at least one approved gap');
    for (const g of matrix.gaps) {
      assert.strictEqual(g.isApprovedForOutline, true);
      assert.ok(!g.topic.toLowerCase().includes('developer retention'), 'Developer retention must not be approved');
    }

    recordPass('Gate 4: Evidence provenance retention on rejected candidate gaps');
  } catch (err: any) {
    recordFail('Gate 4: Evidence provenance retention on rejected candidate gaps', err);
  }

  // --------------------------------------------------------------------------
  // TEST 5: Determinism on identical inputs
  // --------------------------------------------------------------------------
  try {
    const mockEvidenceSet: EvidenceSet = {
      items: [
        {
          id: 'ev_1',
          sourceUrl: 'https://example.com/a',
          sourceType: 'TARGET_SITE',
          claim: 'Feature A test claim',
          evidenceType: 'FEATURE',
          confidence: 'HIGH',
          citationRequired: false,
          entities: ['Feature A']
        }
      ],
      extractedAt: '2026-10-24T00:00:00.000Z',
      summary: {
        totalCount: 1,
        highConfidenceCount: 1,
        businessFactCount: 1,
        competitorObservationCount: 0,
        serpObservationCount: 0,
        inferenceCount: 0,
      }
    };

    const mockProfile: SaaSProfile = {
      name: 'TestBiz',
      description: 'Test SaaS',
      targetAudience: 'Testing',
      primaryCompetitors: [],
      tone: 'professional',
      customInsights: '',
      keyFeatures: [
        'Developer Retention',
        'Mobile Form Usability'
      ]
    };

    const input = {
      evidenceSet: mockEvidenceSet,
      saasProfile: mockProfile,
      competitors: [{ url: 'https://competitor.com', headings: ['Intro'] }],
      targetKeyword: mobileKw,
      supportingTerms: mobileSupporting
    };

    const run1 = ContentGapService.buildGapMatrix(input);
    const run2 = ContentGapService.buildGapMatrix(input);

    assert.strictEqual(run1.gaps.length, run2.gaps.length);
    assert.strictEqual(run1.rejectedGaps?.length, run2.rejectedGaps?.length);
    for (let i = 0; i < run1.gaps.length; i++) {
      assert.strictEqual(run1.gaps[i].topic, run2.gaps[i].topic);
      assert.strictEqual(run1.gaps[i].importance, run2.gaps[i].importance);
      assert.strictEqual(run1.gaps[i].recommendedTreatment, run2.gaps[i].recommendedTreatment);
    }

    recordPass('Gate 5: Determinism on identical inputs across multiple runs');
  } catch (err: any) {
    recordFail('Gate 5: Determinism on identical inputs across multiple runs', err);
  }

  // --------------------------------------------------------------------------
  // TEST 6: Graceful fallback and starvation prevention when all features drift
  // --------------------------------------------------------------------------
  try {
    const mockEvidenceSet: EvidenceSet = {
      items: [],
      extractedAt: new Date().toISOString(),
      summary: {
        totalCount: 0,
        highConfidenceCount: 0,
        businessFactCount: 0,
        competitorObservationCount: 0,
        serpObservationCount: 0,
        inferenceCount: 0,
      }
    };

    // Profile where EVERY key feature is completely off-topic
    const offTopicProfile: SaaSProfile = {
      name: 'StaffingFirm',
      description: 'Technical staffing and recruitment',
      targetAudience: 'HR Managers',
      primaryCompetitors: [],
      tone: 'professional',
      customInsights: '',
      keyFeatures: [
        'Developer Retention Optimization',
        'Agency Retainer Models',
        'Engineering Recruitment Services'
      ]
    };

    const matrix = ContentGapService.buildGapMatrix({
      evidenceSet: mockEvidenceSet,
      saasProfile: offTopicProfile,
      competitors: [{ url: 'https://comp.com', headings: ['Home'], hasTables: true }],
      targetKeyword: mobileKw,
      supportingTerms: mobileSupporting
    });

    // All features should be rejected
    assert.strictEqual(matrix.rejectedGaps?.length, 3, 'All 3 off-topic features must be rejected');
    for (const rej of matrix.rejectedGaps!) {
      assert.strictEqual(rej.isApprovedForOutline, false);
      assert.strictEqual(rej.driftVector, 'STAFFING_HR');
    }

    // But matrix.gaps must NOT be empty — it must fall back to the legitimate practitioner workflow gap
    assert.ok(matrix.gaps.length > 0, 'Matrix must have at least one fallback gap to prevent outline starvation');
    const fallbackGap = matrix.gaps[0];
    assert.strictEqual(fallbackGap.isApprovedForOutline, true);
    assert.ok(fallbackGap.topic.toLowerCase().includes('implementation lifecycle'), 'Expected practitioner lifecycle fallback gap');

    recordPass('Gate 6: Graceful fallback and outline starvation prevention');
  } catch (err: any) {
    recordFail('Gate 6: Graceful fallback and outline starvation prevention', err);
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`Phase 6B Suite Complete: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase6BOutlineQualitySuite().catch(err => {
  console.error('Fatal test suite error:', err);
  process.exit(1);
});
