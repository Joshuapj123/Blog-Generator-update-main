import assert from 'assert';
import { ContentEvidenceValidator } from '../src/lib/intelligence/ContentEvidenceValidator';
import { validateArticleQuality } from '../src/lib/seo-intelligence/quality_validator';
import { KeywordAuditService } from '../src/lib/seo-intelligence/KeywordAuditService';
import { ContentRepairService } from '../src/lib/content/ContentRepairService';
import { EvidenceSet, EvidenceItem } from '../src/core/contracts/evidence';
import { ContentBrief, SaaSProfile } from '../src/core/contracts/schemas';
import { AgentOrchestrator } from '../src/core/orchestrator/AgentOrchestrator';

function makeBrief(primaryKeyword: string, headings?: string[]): any {
  const hList = headings || ['Introduction and Overview', 'Core Operational Strategies', 'Industry Implementation Standards', 'Conclusion and Next Steps'];
  return {
    title: `Comprehensive Guide to ${primaryKeyword}`,
    targetKeywords: [primaryKeyword],
    targetEntities: ['AcmeCorp'],
    wordCountBudget: { min: 400, max: 2500, target: 800 },
    intent: {
      primaryKeyword,
      intentType: 'Informational',
      contentType: 'Guide',
    },
    competitorInsights: [
      { url: 'https://competitor.com/blog', title: 'Competitor Platform', wordCount: 1200 }
    ],
    outline: hList.map(h => ({
      heading: h,
      level: 'H2' as const,
      generate_table: false,
      assignedKeywords: [primaryKeyword],
      assignedEntities: ['AcmeCorp'],
    })),
  };
}

const emptyEvidenceSet: EvidenceSet = {
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

function generateDeterministicWords(targetWordCount: number, keyword: string, keywordOccurrences: number): string {
  const dictionary = [
    'infrastructure', 'scalability', 'performance', 'latency', 'monitoring', 'observability',
    'resilience', 'throughput', 'deployment', 'orchestration', 'reliability', 'architecture',
    'distributed', 'workload', 'engineering', 'efficiency', 'telemetry', 'automation',
    'optimization', 'capacity', 'redundancy', 'governance', 'security', 'compliance',
    'metrics', 'cluster', 'database', 'microservice', 'container', 'pipeline'
  ];
  const kwWords = keyword.trim().split(/\s+/).length;
  const nonKeywordWordsNeeded = Math.max(0, targetWordCount - (keywordOccurrences * kwWords));
  const words: string[] = [];

  const interval = keywordOccurrences > 0 ? Math.floor(nonKeywordWordsNeeded / (keywordOccurrences + 1)) : nonKeywordWordsNeeded;
  let kwPlaced = 0;
  let wordIdx = 0;

  for (let i = 0; i < nonKeywordWordsNeeded; i++) {
    words.push(dictionary[wordIdx % dictionary.length]);
    wordIdx++;
    if (kwPlaced < keywordOccurrences && interval > 0 && (i + 1) % interval === 0) {
      words.push(keyword);
      kwPlaced++;
    }
  }
  while (kwPlaced < keywordOccurrences) {
    words.push(keyword);
    kwPlaced++;
  }

  return words.join(' ');
}

async function runComprehensiveSuite() {
  console.log('================================================================');
  console.log('ACUTE — KEYWORD DENSITY & ENTITY-GROUNDING VERIFICATION SUITE');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
    totalTests++;
    try {
      await fn();
      console.log(`  [PASS] Scenario ${totalTests}: ${name}`);
      passedTests++;
    } catch (err) {
      console.error(`  [FAIL] Scenario ${totalTests}: ${name}`);
      console.error(err);
      process.exitCode = 1;
    }
  }

  // -------------------------------------------------------------------------
  // Scenario 1: Natural primary keyword use (~1.0–2.0% density passes)
  // -------------------------------------------------------------------------
  await test('Natural primary keyword use (~1.0–2.0% density) passes cleanly', async () => {
    const kw = 'cloud migration strategy';
    const brief = makeBrief(kw);
    // 600 words with 3 mentions of 3-word keyword = 9 keyword words / 600 words = 1.5% density
    const sec1 = `## Introduction\nAdopting a modern ${kw} is essential for enterprise agility. ` + generateDeterministicWords(120, 'enterprise agility', 0);
    const sec2 = `## Architecture\nWhen planning infrastructure upgrades, establishing core performance benchmarks ensures system availability. ` + generateDeterministicWords(120, 'network latency', 0);
    const sec3 = `## Execution\nA well-executed ${kw} reduces runtime latency and operational overhead across clusters. ` + generateDeterministicWords(120, 'managed container', 0);
    const sec4 = `## Governance\nSecurity controls and role-based access policies must be audited before decommissioning legacy servers. ` + generateDeterministicWords(120, 'identity access', 0);
    const sec5 = `## Optimization\nFinally, measuring cost efficiency validates the ${kw} and provides executive stakeholders with ROI metrics. ` + generateDeterministicWords(120, 'budget governance', 0);
    const body = [sec1, sec2, sec3, sec4, sec5].join('\n\n');

    const result = ContentEvidenceValidator.validate(body, brief, emptyEvidenceSet, [], 'AcmeCorp');
    const kwErrors = result.criticalErrors.filter(e => e.includes('Keyword Stuffing') || e.includes('Repetitive Keyword Loop'));
    assert.strictEqual(kwErrors.length, 0, `Expected 0 keyword stuffing errors for 1.5% density, got: ${kwErrors.join('; ')}`);
    assert.strictEqual(result.diagnostics.keywordStuffingFlags, 0);

    const audit = KeywordAuditService.auditKeywords(body, kw, []);
    assert.strictEqual(audit.isExcessive, false, 'Expected isExcessive to be false for natural 1.5% density');
    assert.strictEqual(audit.criticalErrors.length, 0);
  });

  // -------------------------------------------------------------------------
  // Scenario 2: Excessive exact-match repetition (>3.0% fails closed)
  // -------------------------------------------------------------------------
  await test('Excessive exact-match repetition (>3.0%) fails closed', async () => {
    const kw = 'automated testing framework';
    const brief = makeBrief(kw);
    // ~120 words with 5 mentions of 3-word keyword = 15 kw words / 120 = 12.5% density
    const body = `
## Introduction
Our automated testing framework provides rapid regression feedback for engineering teams.
Every team requires an automated testing framework to ensure continuous delivery without bugs.

## Capabilities
By choosing an automated testing framework, organizations minimize manual testing cycles.
This automated testing framework integrates with existing Git repositories seamlessly.

## Summary
In conclusion, deploying an automated testing framework accelerates developer velocity.
    `.trim();

    const result = ContentEvidenceValidator.validate(body, brief, emptyEvidenceSet, [], 'AcmeCorp');
    const stuffingError = result.criticalErrors.find(e => e.includes('Keyword Stuffing Alert'));
    assert.ok(stuffingError, 'Expected Keyword Stuffing Alert for excessive density');
    assert.strictEqual(result.passed, false, 'Article must fail validation when keyword stuffing is detected');

    const quality = validateArticleQuality(body, [kw], ['AcmeCorp'], 'AcmeCorp');
    const qualityStuffing = quality.errors.find(e => e.includes('Keyword Stuffing Alert'));
    assert.ok(qualityStuffing, 'Expected quality_validator to detect Keyword Stuffing Alert');
  });

  // -------------------------------------------------------------------------
  // Scenario 3: Synonyms and semantic variations do not inflate exact-match counter
  // -------------------------------------------------------------------------
  await test('Synonyms and semantic variations do not inflate exact-match counter', async () => {
    const kw = 'cloud migration';
    const body = `
A successful cloud migration requires disciplined architecture planning and staged workload rollouts.
Teams undergoing a cloud transition must audit their networking interfaces and security baselines.
Accelerating cloud adoption involves training developers on serverless patterns and managed databases.
When migrating to the cloud, organizations should benchmark baseline latency and throughput.
In summary, executing a disciplined cloud migration provides measurable operational advantages.
    `.trim();

    const occurrences = KeywordAuditService.countKeywordOccurrences(body, kw);
    assert.strictEqual(occurrences, 2, `Expected exactly 2 exact matches, got ${occurrences}`);
  });

  // -------------------------------------------------------------------------
  // Scenario 4: Multiword phrases and word boundaries eliminate substring false positives
  // -------------------------------------------------------------------------
  await test('Multiword phrases & word boundaries eliminate substring false positives (e.g. "port" in "support")', async () => {
    const shortKw = 'port';
    const brief = makeBrief(shortKw);
    const body = `
We support engineering leaders who recognize that important infrastructure decisions require diligence.
Transport protocols and network routing reports provide visibility into operational performance.
Every technological opportunity requires disciplined architecture and continuous monitoring.
    `.trim();

    const occurrences = KeywordAuditService.countKeywordOccurrences(body, shortKw);
    assert.strictEqual(occurrences, 0, `Expected 0 matches for 'port' inside support/important/transport, got ${occurrences}`);

    const result = ContentEvidenceValidator.validate(body, brief, emptyEvidenceSet, [], 'NetCorp');
    const stuffingError = result.criticalErrors.find(e => e.includes('Keyword Stuffing Alert'));
    assert.strictEqual(stuffingError, undefined, 'Must not flag keyword stuffing on substring matches');

    const quality = validateArticleQuality(body, [shortKw], ['NetCorp'], 'NetCorp');
    const qStuffing = quality.errors.find(e => e.includes('Keyword Stuffing Alert'));
    assert.strictEqual(qStuffing, undefined, 'quality_validator must not flag substring matches as keyword stuffing');
  });

  // -------------------------------------------------------------------------
  // Scenario 5: Markdown link URLs and syntax do not double count keywords
  // -------------------------------------------------------------------------
  await test('Markdown link URLs and syntax do not double count keywords', async () => {
    const kw = 'api security';
    const body = `
Implementing comprehensive [api security](https://example.com/products/api-security-platform) protects downstream microservices.
    `.trim();

    const { cleanText } = KeywordAuditService.normalizeMarkdownForAudit(body);
    const occurrences = KeywordAuditService.countKeywordOccurrences(cleanText, kw);
    assert.strictEqual(occurrences, 1, `Expected exactly 1 match (anchor text only, URL ignored), got ${occurrences}`);
  });

  // -------------------------------------------------------------------------
  // Scenario 6: Repetitive paragraph loops fail closed
  // -------------------------------------------------------------------------
  await test('Repetitive paragraph loops fail closed or trigger warnings', async () => {
    const kw = 'pipeline security';
    const brief = makeBrief(kw);
    // 6 paragraphs, every single paragraph contains the keyword
    const paragraphs = [
      `Our pipeline security ensures that all code merges are verified before release.`,
      `With pipeline security, teams eliminate unauthorized dependencies during CI runs.`,
      `Managing pipeline security involves configuring cryptographic artifact signing keys.`,
      `Continuous pipeline security monitors cloud configuration drift in staging environments.`,
      `Auditing pipeline security provides compliance visibility for enterprise security teams.`,
      `In summary, pipeline security reduces production incident risks substantially.`
    ];
    const body = paragraphs.join('\n\n');

    const result = ContentEvidenceValidator.validate(body, brief, emptyEvidenceSet, [], 'DevCorp');
    const loopIssue = result.keywordStuffingIssues.find(i => i.includes('Unnatural keyword repetition') || i.includes('appears in'));
    assert.ok(loopIssue, 'Expected paragraph keyword loop warning/issue when keyword is in 100% of paragraphs');
  });

  // -------------------------------------------------------------------------
  // Scenario 7: Cross-section keyword clustering flagged
  // -------------------------------------------------------------------------
  await test('Cross-section keyword clustering is detected and audited', async () => {
    const kw = 'kubernetes management';
    const markdown = `
## Introduction
Modern infrastructure requires robust container operations.

## Architecture Guidelines
When deploying kubernetes management, teams evaluate clustering tools. Good kubernetes management ensures cluster health. Effective kubernetes management isolates workloads. Scalable kubernetes management automates node provisioning. Comprehensive kubernetes management reduces downtime.

## Operational Standards
Teams maintain runbooks and alert thresholds for on-call engineers.
    `.trim();

    const sections = KeywordAuditService.analyzeSectionDistribution(markdown, kw, []);
    assert.strictEqual(sections.length, 3);
    const clusteredSection = sections.find(s => s.sectionHeading === 'Architecture Guidelines');
    assert.ok(clusteredSection);
    assert.strictEqual(clusteredSection?.primaryKeywordCount, 5);

    const audit = KeywordAuditService.auditKeywords(markdown, kw, [], { maxSectionClustering: 3 });
    const clusterWarning = audit.warnings.find(w => w.includes('clustering detected'));
    assert.ok(clusterWarning, 'Expected cluster warning for section with 5 keyword mentions in short text');
  });

  // -------------------------------------------------------------------------
  // Scenario 8: Calibrated warning (1.5–2.0%) vs critical error (>3.0%)
  // -------------------------------------------------------------------------
  await test('Calibrated warning (1.5–2.0%) vs critical error (>3.0%)', async () => {
    const kw = 'database optimization';

    // 1. Positive calibrated warning case: exactly 500 words with 4 occurrences of 2-word kw = 8 / 500 = 1.60% density
    const bodyWarning = [
      `## Overview\nImplementing ${kw} improves query response times across enterprise clusters. ` + generateDeterministicWords(120, 'query latency', 0),
      `## Strategy\nOur ${kw} techniques reduce disk I/O bottlenecks. ` + generateDeterministicWords(120, 'buffer pool', 0),
      `## Execution\nDisciplined ${kw} ensures query predictability under peak load. ` + generateDeterministicWords(120, 'index scan', 0),
      `## Conclusion\nAdopting ${kw} protects high-volume production services. ` + generateDeterministicWords(120, 'cluster health', 0)
    ].join('\n\n');

    const auditWarning = KeywordAuditService.auditKeywords(bodyWarning, kw, [], {
      warningThresholdPercent: 1.5,
      criticalThresholdPercent: 3.0,
      minOccurrencesForStuffing: 3
    });

    assert.strictEqual(auditWarning.primaryOccurrences, 4);
    assert.ok(auditWarning.primaryDensity >= 1.5 && auditWarning.primaryDensity <= 2.0, `Expected density in 1.5-2.0% range, got ${auditWarning.primaryDensity.toFixed(2)}%`);
    assert.strictEqual(auditWarning.criticalErrors.length, 0, 'Density under 3.0% must not trigger critical errors');
    assert.ok(auditWarning.warnings.some(w => w.includes('Elevated keyword density') || w.includes('recommended 1.5%')), 'Expected calibrated warning for 1.6% density');

    // 2. Intentional negative case: 100 words with 4 occurrences of 2-word kw = 8 / 100 = 8.00% density (>3.0%)
    const bodyCritical = generateDeterministicWords(100, kw, 4);
    const auditCritical = KeywordAuditService.auditKeywords(bodyCritical, kw, [], {
      warningThresholdPercent: 1.5,
      criticalThresholdPercent: 3.0,
      minOccurrencesForStuffing: 3
    });

    assert.strictEqual(auditCritical.primaryOccurrences, 4);
    assert.ok(auditCritical.primaryDensity > 3.0, `Expected density > 3.0%, got ${auditCritical.primaryDensity.toFixed(2)}%`);
    assert.ok(auditCritical.criticalErrors.some(e => e.includes('Keyword Stuffing Alert')), 'Density >3.0% with >=3 occurrences must trigger critical error');
  });

  // -------------------------------------------------------------------------
  // Scenario 9: Short article safeguard (<=2 occurrences never flagged as stuffing)
  // -------------------------------------------------------------------------
  await test('Short article safeguard: <=2 mentions in an excerpt never flagged as stuffing', async () => {
    const multiwordKw = 'enterprise application modern cloud migration strategy';
    // Excerpt: 60 words, contains the 6-word keyword exactly 1 time
    // Mathematical density = 6 / 60 = 10.0%! But it's only 1 natural mention!
    const excerpt = `
Adopting an enterprise application modern cloud migration strategy requires clear executive alignment and phased engineering milestones. Teams must establish testing baselines to ensure continuous service availability without unexpected downtime during workload transitions.
    `.trim();

    const audit = KeywordAuditService.auditKeywords(excerpt, multiwordKw, [], {
      warningThresholdPercent: 2.0,
      criticalThresholdPercent: 3.0,
      minOccurrencesForStuffing: 3
    });

    assert.strictEqual(audit.primaryOccurrences, 1);
    assert.strictEqual(audit.criticalErrors.length, 0, '1 occurrence in short excerpt must NEVER be flagged as keyword stuffing');
    assert.strictEqual(audit.isExcessive, false);

    // Verify ContentEvidenceValidator also protects short excerpts
    const brief = makeBrief(multiwordKw, ['Overview']);
    const result = ContentEvidenceValidator.validate(excerpt, brief, emptyEvidenceSet, [], 'CloudCo');
    const stuffingErrors = result.criticalErrors.filter(e => e.includes('Keyword Stuffing Alert'));
    assert.strictEqual(stuffingErrors.length, 0, 'ContentEvidenceValidator must not flag 1 mention as stuffing in short excerpt');

    // Verify quality_validator also protects short excerpts
    const quality = validateArticleQuality(excerpt, [multiwordKw], ['CloudCo'], 'CloudCo');
    const qualityStuffing = quality.errors.filter(e => e.includes('Keyword Stuffing Alert'));
    assert.strictEqual(qualityStuffing.length, 0, 'quality_validator must not flag 1 mention as stuffing in short excerpt');
  });

  // -------------------------------------------------------------------------
  // Scenario 10: Agency / Consultancy business type prompt awareness
  // -------------------------------------------------------------------------
  await test('Agency / Consultancy business type: no SaaS/software platform terminology forced in prompts', async () => {
    const agencyProfile: any = {
      name: 'Studio North UX',
      description: 'Specialized digital product consultancy conducting user experience audits and design sprints.',
      targetAudience: 'Product Leaders and VPs of Engineering',
      businessType: 'Agency/Portfolio',
      verifiedOfferings: ['UX Audits', 'Design Sprints', 'Design Systems Consultation'],
    };

    // Instantiate orchestrator offline to inspect prompt construction logic
    const mockLlm = {
      getModel: () => 'gemini-3.5-flash-lite',
      generate: async () => '',
      structuredGenerate: async () => ({}),
    } as any;
    const orchestrator = new AgentOrchestrator({
      apiKey: 'deterministic-offline-key',
      llm: mockLlm,
      search: { search: async () => [] } as any,
      scraper: { scrape: async () => [] } as any,
    } as any);

    const bType = (agencyProfile.businessType || '').toLowerCase();
    const isAgency = bType.includes('agency') || bType.includes('services') || bType.includes('portfolio');
    assert.strictEqual(isAgency, true);

    // Verify terminology guidance bans software/platform terms
    const terminologyGuidance = isAgency
      ? `- Use natural phrasing suited for a professional agency, studio, or consultancy: "the agency", "the team", "the consultants", "the practice", or the specific verified service name.
   - STRICT BAN: DO NOT refer to this organization as "the platform", "the software", "the tool", "the CRM", or "the system".`
      : '';

    assert.ok(terminologyGuidance.includes('the agency'));
    assert.ok(terminologyGuidance.includes('STRICT BAN: DO NOT refer to this organization as "the platform", "the software"'));
  });

  // -------------------------------------------------------------------------
  // Scenario 11: Legal practice business type prompt awareness
  // -------------------------------------------------------------------------
  await test('Legal practice business type: regulatory/compliance terminology, no software/platform terms', async () => {
    const legalProfile: any = {
      name: 'Vanguard Legal Partners',
      description: 'Corporate law firm advising technology startups on data privacy compliance and cross-border IP regulations.',
      targetAudience: 'General Counsels and Chief Compliance Officers',
      businessType: 'Other',
      verifiedOfferings: ['Data Privacy Audits', 'IP Portfolio Counseling'],
    };

    const desc = legalProfile.description.toLowerCase();
    const isLegal = desc.includes('law firm') || desc.includes('attorney') || desc.includes('legal');
    assert.strictEqual(isLegal, true);

    const terminologyGuidance = isLegal
      ? `- Use phrasing suited for a professional legal practice: "the firm", "the legal practice", "the attorneys", "the counsel", "the legal team".
   - STRICT BAN: DO NOT refer to this organization as "the software", "the platform", "the tool", or "the SaaS".`
      : '';

    assert.ok(terminologyGuidance.includes('the attorneys'));
    assert.ok(terminologyGuidance.includes('STRICT BAN: DO NOT refer to this organization as "the software", "the platform"'));
  });

  // -------------------------------------------------------------------------
  // Scenario 12: Industrial / Manufacturing business type prompt awareness
  // -------------------------------------------------------------------------
  await test('Industrial / Manufacturing business type: operational/standards terminology, no app/SaaS terms', async () => {
    const industrialProfile: any = {
      name: 'Precision Metalworks',
      description: 'Precision CNC machining and industrial metal manufacturing facility supplying aerospace components.',
      targetAudience: 'Aerospace Procurement Managers',
      businessType: 'Other',
      verifiedOfferings: ['CNC Milling', 'Titanium Fabrication', 'ISO 9001 Inspection'],
    };

    const desc = industrialProfile.description.toLowerCase();
    const isIndustrial = desc.includes('manufacturing') || desc.includes('industrial') || desc.includes('machining');
    assert.strictEqual(isIndustrial, true);

    const terminologyGuidance = isIndustrial
      ? `- Use phrasing suited for industrial manufacturing or production: "the manufacturer", "the facility", "the producer", "the supplier", "the engineering team".
   - STRICT BAN: DO NOT refer to this organization as "the platform", "the app", "the software", or "the CRM" unless explicitly verified industrial IoT software.`
      : '';

    assert.ok(terminologyGuidance.includes('the manufacturer'));
    assert.ok(terminologyGuidance.includes('STRICT BAN: DO NOT refer to this organization as "the platform", "the app"'));
  });

  // -------------------------------------------------------------------------
  // Scenario 13: Target brand derived exclusively from profile context; never fallback to targetKeyword
  // -------------------------------------------------------------------------
  await test('Target brand derived exclusively from profile context; never fallback to targetKeyword', async () => {
    const inputWithNamedProfile = {
      targetKeyword: 'best crm software for startups',
      saasProfile: { name: 'Acme Advisory', website: 'https://acme.com', description: 'Consulting' }
    };
    const derived1 = inputWithNamedProfile.saasProfile?.name || inputWithNamedProfile.saasProfile?.website || '';
    assert.strictEqual(derived1, 'Acme Advisory');

    const inputWithOnlyWebsite = {
      targetKeyword: 'best crm software for startups',
      saasProfile: { name: '', website: 'https://acme.com', description: 'Consulting' }
    };
    const derived2 = inputWithOnlyWebsite.saasProfile?.name || inputWithOnlyWebsite.saasProfile?.website || '';
    assert.strictEqual(derived2, 'https://acme.com');

    const inputWithoutProfile = {
      targetKeyword: 'best crm software for startups',
      saasProfile: undefined as any
    };
    const derived3 = inputWithoutProfile.saasProfile?.name || inputWithoutProfile.saasProfile?.website || '';
    assert.strictEqual(derived3, '', 'Must derive empty string when profile is missing; NEVER fallback to targetKeyword');
    assert.notStrictEqual(derived3, inputWithoutProfile.targetKeyword);
  });

  // -------------------------------------------------------------------------
  // Scenario 14: Evidence items labeled by provenance category
  // -------------------------------------------------------------------------
  await test('Evidence items labeled by provenance category in prompt construction', async () => {
    const items: EvidenceItem[] = [
      {
        id: 'ev-1',
        claim: 'Acme Advisory provides certified SOC2 audits.',
        evidenceType: 'BUSINESS_FACT',
        sourceType: 'TARGET_SITE',
        sourceUrl: 'https://acmeadvisory.com/services',
        confidence: 'HIGH',
        citationRequired: false,
      },
      {
        id: 'ev-2',
        claim: 'Competitor Corp reports 99.99% uptime in their SLA.',
        evidenceType: 'COMPETITOR_OBSERVATION',
        sourceType: 'COMPETITOR',
        sourceUrl: 'https://competitor.com/sla',
        confidence: 'HIGH',
        citationRequired: false,
      },
      {
        id: 'ev-3',
        claim: 'Enterprise multi-cloud adoption increases operational compliance requirements.',
        evidenceType: 'INFERENCE',
        sourceType: 'INDUSTRY',
        sourceUrl: 'https://industry.com/report',
        confidence: 'MEDIUM',
        citationRequired: false,
      }
    ];

    const formatted = items.map(e => {
      let provenance = '[RESEARCH EVIDENCE]';
      if (
        e.evidenceType === 'BUSINESS_FACT' ||
        e.evidenceType === 'FEATURE' ||
        e.evidenceType === 'DIFFERENTIATOR' ||
        e.evidenceType === 'TECHNICAL_SPEC' ||
        e.sourceType === 'TARGET_SITE'
      ) {
        provenance = '[TARGET BRAND EVIDENCE]';
      } else if (
        e.evidenceType === 'COMPETITOR_OBSERVATION' ||
        e.sourceType === 'COMPETITOR'
      ) {
        provenance = '[COMPETITOR EVIDENCE - DO NOT ATTRIBUTE TO TARGET]';
      } else if (e.evidenceType === 'INFERENCE') {
        provenance = '[EDITORIAL INFERENCE]';
      }
      return `- ${provenance} ${e.claim}`;
    });

    assert.ok(formatted[0].startsWith('- [TARGET BRAND EVIDENCE]'));
    assert.ok(formatted[1].startsWith('- [COMPETITOR EVIDENCE - DO NOT ATTRIBUTE TO TARGET]'));
    assert.ok(formatted[2].startsWith('- [EDITORIAL INFERENCE]'));
  });

  // -------------------------------------------------------------------------
  // Scenario 15: Full claim re-extraction and grounding validation on repaired markdown with safe diagnostics
  // -------------------------------------------------------------------------
  await test('Full claim re-extraction and grounding validation on repaired markdown with safe diagnostics', async () => {
    const targetBrand = 'Veritas Security';
    const evidenceSet: EvidenceSet = {
      items: [
        {
          id: 'ev-v1',
          claim: 'Veritas Security conducts zero-trust network vulnerability assessments.',
          evidenceType: 'BUSINESS_FACT',
          sourceType: 'TARGET_SITE',
          sourceUrl: 'https://veritas-security.com/assessments',
          confidence: 'HIGH',
          citationRequired: false,
        }
      ],
      extractedAt: new Date().toISOString(),
      summary: {
        totalCount: 1,
        highConfidenceCount: 1,
        businessFactCount: 1,
        competitorObservationCount: 0,
        serpObservationCount: 0,
        inferenceCount: 0,
      }
    };

    const brief = makeBrief('zero trust vulnerability assessment');

    // Case A: Unrepaired markdown with unsupported critical claim
    const ungroundedMarkdown = `
## Introduction
Organizations require comprehensive zero trust vulnerability assessment methodologies to protect microservice endpoints.

## Assessment Capabilities
Veritas Security guarantees a 99.8% reduction in ransomware intrusion vectors across all cloud architectures.

## Implementation Steps
Engineering teams implement continuous vulnerability scanning across container registries.
    `.trim();

    const initialResult = ContentEvidenceValidator.validate(
      ungroundedMarkdown,
      brief,
      evidenceSet,
      [],
      targetBrand
    );

    // Initial draft has ungrounded critical claim -> must fail publication gate
    assert.strictEqual(initialResult.passed, false);
    assert.ok(initialResult.criticalErrors.length > 0);

    // Case B: Repaired markdown replacing ungrounded claim with grounded evidence
    const repairedMarkdown = `
## Introduction
Organizations require comprehensive zero trust vulnerability assessment methodologies to protect microservice endpoints.

## Assessment Capabilities
Veritas Security conducts zero-trust network vulnerability assessments to identify potential entry points across cloud architectures.

## Implementation Steps
Engineering teams implement continuous vulnerability scanning across container registries.
    `.trim();

    const repairedResult = ContentEvidenceValidator.validate(
      repairedMarkdown,
      brief,
      evidenceSet,
      [],
      targetBrand,
      undefined,
      undefined,
      {
        repairAttempted: true,
        repairPassedRevalidation: true,
      }
    );

    assert.strictEqual(repairedResult.passed, true, 'Repaired markdown with grounded claims must pass validation');
    assert.strictEqual(repairedResult.criticalErrors.length, 0);
    assert.strictEqual(repairedResult.diagnostics.repetitionFlags, 0);
    assert.strictEqual(repairedResult.diagnostics.keywordStuffingFlags, 0);
    assert.strictEqual(typeof repairedResult.diagnostics.keywordWarningCount, 'number');
    assert.strictEqual(typeof repairedResult.diagnostics.primaryKeywordDensity, 'number');
  });

  console.log('================================================================');
  console.log(`RESULTS: ${passedTests} / ${totalTests} SCENARIOS PASSED`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exitCode = 1;
  }
}

runComprehensiveSuite().catch(err => {
  console.error('Test suite runner crashed:', err);
  process.exitCode = 1;
});
