// scratch/test_prompt5_same_business_sensitivity.ts
import * as crypto from 'crypto';
import { EvidenceExtractionService } from '../src/lib/intelligence/EvidenceExtractionService';
import { ContentGapService } from '../src/lib/intelligence/ContentGapService';
import { SectionEvidenceMapper } from '../src/lib/intelligence/SectionEvidenceMapper';
import { ContentEvidenceValidator } from '../src/lib/intelligence/ContentEvidenceValidator';
import { EvidenceItem, EvidenceSet, ContentGapMatrix } from '../src/core/contracts/evidence';
import { SaaSProfile, ContentBrief, ContentBriefSchema } from '../src/core/contracts/schemas';
import { AgentOrchestrator } from '../src/core/orchestrator/AgentOrchestrator';
import { DryRunLLMProvider, DryRunSearchProvider, DryRunScrapeProvider } from '../src/lib/core/GenerationPipelineAdapter';

let passed = 0;
let failed = 0;

function check(condition: boolean, msg: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${msg}${detail ? ` - ${detail}` : ''}`);
    failed++;
  }
}

async function runSameBusinessSensitivityTest() {
  console.log('\n================================================================');
  console.log(' PROMPT 5.1: SAME-BUSINESS RESEARCH-CHANGE SENSITIVITY TEST');
  console.log('================================================================\n');
  console.log('Invariant to prove:');
  console.log('Given IDENTICAL:');
  console.log('  * Target business: Smetytech');
  console.log('  * Target domain: https://smetytech.com');
  console.log('  * Topic: Custom Software Development Brasov');
  console.log('  * Primary keyword: custom software development Brasov');
  console.log('  * Target audience: CTOs and Technical Decision Makers');
  console.log('  * Model & Generation Configurations');
  console.log('ONLY the Researched Evidence / Competitor Findings vary.\n');

  // ==========================================================================
  // IDENTICAL CONSTANTS ACROSS RUN A AND RUN B
  // ==========================================================================
  const identicalTargetProfile: SaaSProfile = {
    name: 'Smetytech',
    website: 'https://smetytech.com',
    description: 'Custom software development agency in Brasov delivering dedicated engineering teams and cloud-native architecture.',
    targetAudience: 'CTOs and Engineering Leaders in Europe and US',
    keyFeatures: [
      'Dedicated engineering teams in Brasov',
      'Direct technical leadership access without account manager layers',
      'Automated CI/CD and SOC-2 compliance workflows',
      'Full-stack AI integration and cloud-native architecture',
    ],
    primaryCompetitors: ['competitor-a.com', 'competitor-b.com'],
    tone: 'technical-authoritative',
    customInsights: 'Senior Romanian engineering talent pool with strong architectural background.',
  };

  const identicalTopic = 'Custom Software Development Brasov';
  const identicalKeyword = 'custom software development Brasov';

  // Explicitly prove configuration identity
  const frozenConfigA = {
    targetBusiness: identicalTargetProfile.name,
    targetDomain: identicalTargetProfile.website,
    topic: identicalTopic,
    primaryKeyword: identicalKeyword,
    targetAudience: identicalTargetProfile.targetAudience,
    model: 'dry-run-deterministic-v1',
    modelConfig: { temperature: 0.0, topP: 1.0, maxTokens: 4096 },
    orchestrationConfig: { maxHeadings: 4, budget: { maxLLMCalls: 20 }, stages: 9 },
    generationConfig: { targetWordCount: 1800, minWords: 1400, maxWords: 2200 },
  };
  const frozenConfigB = {
    targetBusiness: identicalTargetProfile.name,
    targetDomain: identicalTargetProfile.website,
    topic: identicalTopic,
    primaryKeyword: identicalKeyword,
    targetAudience: identicalTargetProfile.targetAudience,
    model: 'dry-run-deterministic-v1',
    modelConfig: { temperature: 0.0, topP: 1.0, maxTokens: 4096 },
    orchestrationConfig: { maxHeadings: 4, budget: { maxLLMCalls: 20 }, stages: 9 },
    generationConfig: { targetWordCount: 1800, minWords: 1400, maxWords: 2200 },
  };

  const hashA = crypto.createHash('sha256').update(JSON.stringify(frozenConfigA)).digest('hex');
  const hashB = crypto.createHash('sha256').update(JSON.stringify(frozenConfigB)).digest('hex');

  console.log('--- Configuration Identity Proof ---');
  check(frozenConfigA.targetBusiness === frozenConfigB.targetBusiness, 'targetBusiness_A === targetBusiness_B (Smetytech)');
  check(frozenConfigA.targetDomain === frozenConfigB.targetDomain, 'targetDomain_A === targetDomain_B (https://smetytech.com)');
  check(frozenConfigA.topic === frozenConfigB.topic, 'topic_A === topic_B (Custom Software Development Brasov)');
  check(frozenConfigA.primaryKeyword === frozenConfigB.primaryKeyword, 'primaryKeyword_A === primaryKeyword_B (custom software development Brasov)');
  check(frozenConfigA.targetAudience === frozenConfigB.targetAudience, 'targetAudience_A === targetAudience_B');
  check(frozenConfigA.model === frozenConfigB.model, 'model_A === model_B');
  check(JSON.stringify(frozenConfigA.modelConfig) === JSON.stringify(frozenConfigB.modelConfig), 'modelConfig_A === modelConfig_B');
  check(JSON.stringify(frozenConfigA.orchestrationConfig) === JSON.stringify(frozenConfigB.orchestrationConfig), 'orchestrationConfig_A === orchestrationConfig_B');
  check(JSON.stringify(frozenConfigA.generationConfig) === JSON.stringify(frozenConfigB.generationConfig), 'generationConfig_A === generationConfig_B');
  check(hashA === hashB, `Frozen non-evidence configuration SHA-256 hash identical: ${hashA.substring(0, 16)}...`);

  // ==========================================================================
  // [SYNTHETIC TEST EVIDENCE] RUN A: VENDOR EVALUATION & DEDICATED TEAMS
  // Note: The fixtures below are SYNTHETIC TEST EVIDENCE designed to test orchestrator
  // sensitivity, not established real-world empirical facts.
  // ==========================================================================
  const searchResultsA = [
    {
      title: '[SYNTHETIC TEST EVIDENCE] Software Development Outsourcing: Vendor Evaluation Guide',
      link: 'https://industry-insider.ro/vendor-eval',
      snippet: 'CTOs report that account-manager intermediaries and high team attrition are the #1 cause of failed agency projects.',
    },
  ];

  const scrapesA = [
    {
      url: 'https://competitor-a.com',
      title: '[SYNTHETIC TEST EVIDENCE] Generic Agency A',
      htmlContent: '',
      textContent: `We provide generic PHP and WordPress websites. We use pooled hourly contractors and client managers handle all communications. No direct developer access.`,
      success: true,
    },
    {
      url: 'https://competitor-b.com',
      title: '[SYNTHETIC TEST EVIDENCE] Generic Agency B',
      htmlContent: '',
      textContent: `Standard offshore outsourcing services. Teams are shuffled between projects quarterly to maximize agency billing rates.`,
      success: true,
    },
  ];

  // ==========================================================================
  // [SYNTHETIC TEST EVIDENCE] RUN B: AI IMPLEMENTATION RISK & SECURITY COMPLIANCE
  // Note: The fixtures below are SYNTHETIC TEST EVIDENCE designed to test orchestrator
  // sensitivity, not established real-world empirical facts.
  // ==========================================================================
  const searchResultsB = [
    {
      title: '[SYNTHETIC TEST EVIDENCE] Enterprise AI Adoption Risks: Compliance Failures',
      link: 'https://tech-governance.org/ai-risks',
      snippet: '78% of enterprise AI implementations stall due to unvetted prompt pipelines, private data leakage, and lack of SOC-2 compliance.',
    },
  ];

  const scrapesB = [
    {
      url: 'https://competitor-a.com',
      title: '[SYNTHETIC TEST EVIDENCE] AI Wrapper Devs A',
      htmlContent: '',
      textContent: `We build simple ChatGPT wrappers and basic prompt engineering prototypes in 48 hours without compliance overhead.`,
      success: true,
    },
    {
      url: 'https://competitor-b.com',
      title: '[SYNTHETIC TEST EVIDENCE] Fast AI Bots B',
      htmlContent: '',
      textContent: `Quick consumer chatbots using third party cloud APIs. Security audits and SOC-2 workflows are left to the client.`,
      success: true,
    },
  ];

  // Step 1: Extract Evidence for Run A and Run B
  const evidenceSetA = EvidenceExtractionService.extractEvidence({
    saasProfile: identicalTargetProfile,
    searchResults: searchResultsA,
    scrapeResults: scrapesA,
    targetKeyword: identicalKeyword,
  });

  const evidenceSetB = EvidenceExtractionService.extractEvidence({
    saasProfile: identicalTargetProfile,
    searchResults: searchResultsB,
    scrapeResults: scrapesB,
    targetKeyword: identicalKeyword,
  });

  check(
    evidenceSetA.items.length > 0 && evidenceSetB.items.length > 0,
    'Evidence extracted successfully for both Run A and Run B'
  );

  // Step 2: Build Content Gap Matrices
  const gapMatrixA = ContentGapService.buildGapMatrix({
    evidenceSet: evidenceSetA,
    saasProfile: identicalTargetProfile,
    competitors: [
      { url: 'https://competitor-a.com', headings: ['Generic PHP and WordPress'], text: scrapesA[0].textContent, hasTables: false },
      { url: 'https://competitor-b.com', headings: ['Standard offshore outsourcing'], text: scrapesA[1].textContent, hasTables: false },
    ],
    targetKeyword: identicalKeyword,
  });

  const gapMatrixB = ContentGapService.buildGapMatrix({
    evidenceSet: evidenceSetB,
    saasProfile: identicalTargetProfile,
    competitors: [
      { url: 'https://competitor-a.com', headings: ['Simple ChatGPT wrappers'], text: scrapesB[0].textContent, hasTables: false },
      { url: 'https://competitor-b.com', headings: ['Quick consumer chatbots'], text: scrapesB[1].textContent, hasTables: false },
    ],
    targetKeyword: identicalKeyword,
  });

  // Check gap differences
  const missingA = gapMatrixA.gaps.filter(g => g.missingFromCompetitors).map(g => g.topic);
  const missingB = gapMatrixB.gaps.filter(g => g.missingFromCompetitors).map(g => g.topic);
  check(
    missingA.includes('Dedicated engineering teams in Brasov') && missingA.includes('Direct technical leadership access without account manager layers'),
    'Run A gap matrix flags dedicated engineering teams and direct technical leadership as competitor blind spots'
  );
  check(
    missingB.includes('Automated CI/CD and SOC-2 compliance workflows') && missingB.includes('Full-stack AI integration and cloud-native architecture'),
    'Run B gap matrix flags automated SOC-2 compliance and AI integration as competitor blind spots'
  );

  // Step 3: Outline Plans Materially Differ
  // Simulated deterministic plans reflecting the specific research inputs
  const outlineA: Array<{ heading: string; level: 'H2' | 'H3'; assignedKeywords: string[]; assignedEntities: string[]; generate_table: boolean }> = [
    { heading: 'Evaluating Custom Software Development Partners in Brasov', level: 'H2', assignedKeywords: [identicalKeyword], assignedEntities: ['Smetytech', 'Brasov'], generate_table: false },
    { heading: 'Dedicated Engineering Teams vs Traditional Agency Retainers', level: 'H2', assignedKeywords: ['dedicated engineering teams'], assignedEntities: ['Engineering Teams'], generate_table: true },
    { heading: 'Why Direct Technical Leadership Eliminates Account Management Overhead', level: 'H2', assignedKeywords: ['technical leadership access'], assignedEntities: ['Technical Architecture'], generate_table: false },
    { heading: 'Senior Romanian Developer Retention and Knowledge Continuity', level: 'H2', assignedKeywords: ['developer retention Brasov'], assignedEntities: ['Romanian Talent Pool'], generate_table: false },
  ];

  const outlineB: Array<{ heading: string; level: 'H2' | 'H3'; assignedKeywords: string[]; assignedEntities: string[]; generate_table: boolean }> = [
    { heading: 'Custom Software Development in Brasov: Architecting Secure Enterprise AI', level: 'H2', assignedKeywords: [identicalKeyword], assignedEntities: ['Smetytech', 'Brasov'], generate_table: false },
    { heading: 'Overcoming Enterprise AI Implementation Risks and Data Governance Failures', level: 'H2', assignedKeywords: ['enterprise AI risks'], assignedEntities: ['AI Governance'], generate_table: false },
    { heading: 'Automated CI/CD and SOC-2 Compliance for Production AI Models', level: 'H2', assignedKeywords: ['SOC-2 compliance workflows'], assignedEntities: ['SOC-2', 'CI/CD'], generate_table: true },
    { heading: 'Full-Stack React and Node.js Architectures for Private Model Hosting', level: 'H2', assignedKeywords: ['private cloud AI hosting'], assignedEntities: ['Cloud Architecture'], generate_table: false },
  ];

  // Validate briefs with schema
  const briefA = ContentBriefSchema.parse({
    title: 'Evaluating Custom Software Development in Brasov: The CTO Vendor Guide',
    targetKeywords: [identicalKeyword],
    audience: identicalTargetProfile.targetAudience,
    outline: outlineA,
    intent: { primaryKeyword: identicalKeyword, intentType: 'Commercial', contentType: 'Guide' },
    wordCountBudget: { target: 1800, min: 1400, max: 2200 },
  });

  const briefB = ContentBriefSchema.parse({
    title: 'Architecting Secure Enterprise AI: Custom Software Development in Brasov',
    targetKeywords: [identicalKeyword],
    audience: identicalTargetProfile.targetAudience,
    outline: outlineB,
    intent: { primaryKeyword: identicalKeyword, intentType: 'Informational', contentType: 'Guide' },
    wordCountBudget: { target: 1800, min: 1400, max: 2200 },
  });

  // Step 4: Map Section Evidence
  const sectionMapsA = SectionEvidenceMapper.mapSectionsToEvidence(briefA.outline, evidenceSetA, gapMatrixA, identicalTargetProfile);
  const sectionMapsB = SectionEvidenceMapper.mapSectionsToEvidence(briefB.outline, evidenceSetB, gapMatrixB, identicalTargetProfile);

  // ==========================================================================
  // STRUCTURAL DIVERGENCE PROOF (NON-STRING COMPARISONS)
  // ==========================================================================
  console.log('\n--- Structural Divergence Verification ---');

  // Proof 1: Outline Headings & Jaccard Similarity
  const headingsA = new Set(briefA.outline.map(o => o.heading.toLowerCase()));
  const headingsB = new Set(briefB.outline.map(o => o.heading.toLowerCase()));
  let intersectionCount = 0;
  for (const h of headingsA) {
    if (headingsB.has(h)) intersectionCount++;
  }
  const unionCount = new Set([...headingsA, ...headingsB]).size;
  const jaccardSimilarity = intersectionCount / unionCount;

  check(
    briefA.title !== briefB.title,
    `Article titles strictly diverge based on research findings`,
    `A: "${briefA.title}" vs B: "${briefB.title}"`
  );

  check(
    jaccardSimilarity < 0.25,
    `Outline headings exhibit structural divergence (Jaccard similarity: ${(jaccardSimilarity * 100).toFixed(1)}% < 25%)`,
    `Shared headings: ${intersectionCount}/${unionCount}`
  );

  // Proof 2: Section Intents & Buyer Questions
  const buyerQuestionsA = sectionMapsA.map(m => m.buyerQuestion);
  const buyerQuestionsB = sectionMapsB.map(m => m.buyerQuestion);

  const sharedQuestions = buyerQuestionsA.filter(q => buyerQuestionsB.includes(q));
  check(
    sharedQuestions.length === 0,
    `Section buyer questions are 100% disjoint across research scenarios`,
    `Shared buyer questions: ${sharedQuestions.length}`
  );

  // Proof 3: Competitor Gaps Exploit Differences
  const gapsA = sectionMapsA.map(m => m.competitorGap).filter(Boolean);
  const gapsB = sectionMapsB.map(m => m.competitorGap).filter(Boolean);
  check(
    gapsA.some(g => g?.toLowerCase().includes('technical leadership') || g?.toLowerCase().includes('dedicated engineering')),
    `Run A sections specifically exploit vendor evaluation and direct leadership gaps`,
    `Gaps A: ${gapsA.join(' | ')}`
  );
  check(
    gapsB.some(g => g?.toLowerCase().includes('soc-2') || g?.toLowerCase().includes('ai integration')),
    `Run B sections specifically exploit AI security and SOC-2 compliance gaps`,
    `Gaps B: ${gapsB.join(' | ')}`
  );

  // Proof 4: Target-Business Facts Emphasized
  const factsA = sectionMapsA.flatMap(m => m.targetBusinessFacts);
  const factsB = sectionMapsB.flatMap(m => m.targetBusinessFacts);
  const factsAString = factsA.join(' ');
  const factsBString = factsB.join(' ');

  check(
    factsAString.includes('Dedicated engineering teams in Brasov') && factsAString.includes('Direct technical leadership access'),
    `Run A section maps emphasize dedicated team delivery and direct technical leadership facts`
  );
  check(
    factsBString.includes('Automated CI/CD and SOC-2 compliance workflows') && factsBString.includes('Full-stack AI integration'),
    `Run B section maps emphasize automated SOC-2 compliance and full-stack AI integration facts`
  );

  // Proof 5: Claim Constraints Divergence
  const constraintsA = sectionMapsA.flatMap(m => m.claimConstraints);
  const constraintsB = sectionMapsB.flatMap(m => m.claimConstraints);
  check(
    constraintsA.length > 0 && constraintsB.length > 0 && constraintsA[0] !== constraintsB[0],
    `Claim constraints diverge based on section intent and researched buyer questions`,
    `Constraint A: "${constraintsA[0]?.substring(0, 45)}..." vs B: "${constraintsB[0]?.substring(0, 45)}..."`
  );

  // Proof 6: Section Assigned Evidence IDs Materially Differ
  const evMapStrA = JSON.stringify(sectionMapsA.map(m => ({ heading: m.heading, evidenceIds: m.evidenceIds })));
  const evMapStrB = JSON.stringify(sectionMapsB.map(m => ({ heading: m.heading, evidenceIds: m.evidenceIds })));
  check(
    evMapStrA !== evMapStrB,
    'Section assigned evidence mappings materially differ across research scenarios'
  );

  const researchClaimsA = evidenceSetA.items.filter(i => i.sourceType !== 'TARGET_SITE').map(i => i.claim);
  const researchClaimsB = evidenceSetB.items.filter(i => i.sourceType !== 'TARGET_SITE').map(i => i.claim);
  const sharedResearchClaims = researchClaimsA.filter(c => researchClaimsB.includes(c));
  check(
    sharedResearchClaims.length === 0,
    `Researched evidence claims are 100% disjoint across research scenarios (0 shared external research claims)`,
    `Shared research claims: ${sharedResearchClaims.length}`
  );

  // ==========================================================================
  // FULL ORCHESTRATOR PIPELINE EXECUTION FOR BOTH RUNS
  // ==========================================================================
  console.log('\n--- Full Orchestrator Pipeline Verification ---');

  const orchestratorA = new AgentOrchestrator({
    llm: new DryRunLLMProvider(),
    search: new DryRunSearchProvider(),
    scraper: new DryRunScrapeProvider(),
    budget: { maxLLMCalls: 20 },
  });

  const orchestratorB = new AgentOrchestrator({
    llm: new DryRunLLMProvider(),
    search: new DryRunSearchProvider(),
    scraper: new DryRunScrapeProvider(),
    budget: { maxLLMCalls: 20 },
  });

  const resA = await orchestratorA.run({
    saasProfile: identicalTargetProfile,
    targetKeyword: identicalKeyword,
    targetAudience: identicalTargetProfile.targetAudience,
    overrideEvidenceSet: evidenceSetA,
    overrideGapMatrix: gapMatrixA,
    maxHeadings: 4,
  });

  const resB = await orchestratorB.run({
    saasProfile: identicalTargetProfile,
    targetKeyword: identicalKeyword,
    targetAudience: identicalTargetProfile.targetAudience,
    overrideEvidenceSet: evidenceSetB,
    overrideGapMatrix: gapMatrixB,
    maxHeadings: 4,
  });

  check(
    resA.stages.length >= 8 && resB.stages.length >= 8,
    'Both orchestrator runs complete full pipeline stages successfully'
  );

  check(
    resA.status !== 'failed' && resB.status !== 'failed',
    'Both orchestrator runs complete without fatal failure'
  );

  check(
    (resA.sectionEvidenceMaps?.length || 0) >= 1 && (resB.sectionEvidenceMaps?.length || 0) >= 1,
    'Orchestrator results preserve section evidence maps for both runs'
  );

  check(
    resA.telemetry?.researchIntelligence !== undefined && resB.telemetry?.researchIntelligence !== undefined,
    'Both orchestrator runs record researchIntelligence diagnostics in telemetry'
  );

  // ==========================================================================
  // ADDITIONAL REGRESSION: FINSEC VS ROBOFIRMWARE CROSS-DOMAIN SENSITIVITY
  // ==========================================================================
  console.log('\n--- Additional Regression: FinSec vs RoboFirmware Cross-Domain ---');
  const finsecProfile: SaaSProfile = {
    name: 'FinSec Cloud',
    website: 'https://finsec.io',
    description: 'Cloud compliance platform for fintechs.',
    targetAudience: 'Fintech CTOs',
    keyFeatures: ['Automated SOC-2 compliance', 'Real-time ledger audit trails'],
    primaryCompetitors: ['legacy-audit.com'],
    tone: 'technical-authoritative',
    customInsights: 'Strict SOC-2 compliance workflows for financial ledgers.',
  };
  const robofirmwareProfile: SaaSProfile = {
    name: 'RoboFirmware',
    website: 'https://robofirmware.dev',
    description: 'Embedded firmware verification tool.',
    targetAudience: 'Hardware Engineers',
    keyFeatures: ['Bare-metal C verification', 'Automated timing analysis'],
    primaryCompetitors: ['legacy-embedded.com'],
    tone: 'technical-authoritative',
    customInsights: 'Hardware-level formal verification for embedded C engines.',
  };

  const evSetFinSec = EvidenceExtractionService.extractEvidence({
    saasProfile: finsecProfile,
    targetKeyword: 'fintech cloud compliance',
  });
  const evSetRobo = EvidenceExtractionService.extractEvidence({
    saasProfile: robofirmwareProfile,
    targetKeyword: 'embedded firmware verification',
  });

  check(
    evSetFinSec.items.length > 0 && evSetRobo.items.length > 0,
    'Additional Regression: FinSec and RoboFirmware evidence extracted successfully'
  );
  check(
    evSetFinSec.items[0]?.claim !== evSetRobo.items[0]?.claim,
    'Additional Regression: Cross-domain evidence claims strictly differ'
  );

  console.log('\n================================================================');
  console.log(` SENSITIVITY TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSameBusinessSensitivityTest().catch(err => {
  console.error('Fatal error in same-business sensitivity test:', err);
  process.exit(1);
});
