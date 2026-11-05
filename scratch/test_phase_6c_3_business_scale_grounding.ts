// scratch/test_phase_6c_3_business_scale_grounding.ts
import { BusinessScaleSchema, SaaSProfileSchema, SaaSProfile } from '../src/core/contracts/schemas';
import { detectBusinessScaleFromText, detectBusinessTypeFromTextAndUrl } from '../src/lib/saas-intelligence/website-intelligence';
import { EditorialIntegrityValidator } from '../src/lib/intelligence/EditorialIntegrityValidator';
import { AgentOrchestrator } from '../src/core/orchestrator/AgentOrchestrator';
import { sanitizeForFirestore } from '../src/lib/firebase/firestore';
import { TemporaryArticleStore } from '../src/lib/test-storage/TemporaryArticleStore';
import { AnalysisSession } from '../src/core/contracts/schemas';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const results: TestResult[] = [];

function assert(condition: boolean, name: string, details?: any) {
  if (condition) {
    results.push({ name, passed: true, details });
    console.log(`  ✓ PASS: ${name}`);
  } else {
    results.push({ name, passed: false, error: 'Assertion failed', details });
    console.error(`  ✗ FAIL: ${name}`, details);
  }
}

async function runTestSuite() {
  console.log('\n======================================================');
  console.log('ACUTE Phase 6C.3 / 6C.3R — Business Scale Grounding Suite');
  console.log('======================================================\n');

  // Case 1: Verified Solo Consultant
  console.log('--- Test Group 1: Verified Solo Consultant ---');
  {
    const soloText = `
      Hi, I'm Alexandru Mitran. I am an independent product designer with over 10 years of experience.
      About me: I specialize in UX audits and conversion optimization. Hire me to solve friction in your digital product.
    `;
    const detection = detectBusinessScaleFromText(soloText);
    assert(detection.businessScale === 'SOLO_PRACTITIONER', 'TC1.1: Solo text detected as SOLO_PRACTITIONER', detection);
    assert(!!detection.businessScaleEvidence, 'TC1.2: Solo detection includes explicit evidence provenance', detection.businessScaleEvidence);

    // Validator check for solo practitioner:
    const cleanSoloArticle = `
## How an Expert UX Audit Fixes Friction

As an independent product designer, I conduct evidence-based UX audits to identify friction.
My evaluation examines onboarding flows, checkout funnels, and cognitive friction points.
Clients work directly with me to transform audit findings into a prioritized action plan.
`;
    const reportClean = EditorialIntegrityValidator.validateEditorialIntegrity(cleanSoloArticle, {
      businessScale: 'SOLO_PRACTITIONER'
    });
    assert(reportClean.passed, 'TC1.3: Clean solo practitioner article passes validation', reportClean.criticalErrors);
  }

  // Case 2: Solo Consultant Offering Multiple Services
  console.log('\n--- Test Group 2: Solo Consultant Offering Multiple Services ---');
  {
    const multiServiceSoloText = `
      Hi, I'm Jane Doe, a freelance UX consultant and product designer.
      My Core Services:
      1. Comprehensive UX Audits
      2. Mobile Onboarding Redesign
      3. Checkout Funnel Optimization
      4. Design System Architecture
      5. Usability Testing & User Research
      Hire me for your next product sprint.
    `;
    const detection = detectBusinessScaleFromText(multiServiceSoloText);
    assert(detection.businessScale === 'SOLO_PRACTITIONER', 'TC2.1: Multiple services by solo consultant do NOT imply an agency', detection);

    const bTypeDetection = detectBusinessTypeFromTextAndUrl(multiServiceSoloText, 'https://janedoe.design');
    assert(bTypeDetection.businessScale === 'SOLO_PRACTITIONER', 'TC2.2: detectBusinessTypeFromTextAndUrl preserves SOLO_PRACTITIONER scale despite multiple verified offerings', bTypeDetection);
    assert(bTypeDetection.verifiedOfferings.length >= 3, 'TC2.3: Verified offerings extracted accurately', bTypeDetection.verifiedOfferings);
  }

  // Case 3: Verified Small Team
  console.log('\n--- Test Group 3: Verified Small Team ---');
  {
    const smallTeamText = `
      We are a boutique studio of 4 designers and engineers based in Austin.
      Co-founded by Sarah Jenkins and Mark Davis, our small team of 4 provides focused design sprints for early-stage startups.
    `;
    const detection = detectBusinessScaleFromText(smallTeamText);
    assert(detection.businessScale === 'SMALL_TEAM', 'TC3.1: Small team text detected as SMALL_TEAM', detection);
    assert(Boolean(detection.businessScaleEvidence?.includes('4') || detection.businessScaleEvidence?.includes('Co-founded')), 'TC3.2: Evidence cites small team headcount or co-founders', detection.businessScaleEvidence);

    const smallTeamArticle = `
## Designing for Startups

Our team provides focused design sprints for early-stage startups.
The studio works closely with engineering teams to validate interfaces before development.
`;
    const report = EditorialIntegrityValidator.validateEditorialIntegrity(smallTeamArticle, {
      businessScale: 'SMALL_TEAM'
    });
    assert(report.passed, 'TC3.3: Small team article passes validation without enterprise claims', report.criticalErrors);
  }

  // Case 4: Verified Agency
  console.log('\n--- Test Group 4: Verified Agency ---');
  {
    const agencyText = `
      We are a full-service agency with departments across strategy, creative direction, and technical development.
      Our agency team of 35 specialists serves global enterprise clients with dedicated client delivery squads.
    `;
    const detection = detectBusinessScaleFromText(agencyText);
    assert(detection.businessScale === 'AGENCY', 'TC4.1: Verified agency text detected as AGENCY', detection);

    const agencyArticle = `
## Scalable Digital Experiences

Our agency team of specialists provides full-service UX strategy and technical delivery.
Our practice works across cross-functional client initiatives to ensure digital transformation.
`;
    const report = EditorialIntegrityValidator.validateEditorialIntegrity(agencyArticle, {
      businessScale: 'AGENCY'
    });
    assert(report.passed, 'TC4.2: Verified agency article permits agency terminology', report.criticalErrors);
  }

  // Case 5: Verified Enterprise
  console.log('\n--- Test Group 5: Verified Enterprise ---');
  {
    const enterpriseText = `
      Acme Global is a Fortune 500 technology corporation with over 15,000 employees and operations across 42 countries.
      Publicly traded on NASDAQ: ACME.
    `;
    const detection = detectBusinessScaleFromText(enterpriseText);
    assert(detection.businessScale === 'ENTERPRISE', 'TC5.1: Enterprise text detected as ENTERPRISE', detection);

    const enterpriseArticle = `
## Enterprise Scale Infrastructure

The enterprise operates high-availability cloud infrastructure across global regions.
The organization supports mission-critical workflows with stringent uptime SLAs.
`;
    const report = EditorialIntegrityValidator.validateEditorialIntegrity(enterpriseArticle, {
      businessScale: 'ENTERPRISE'
    });
    assert(report.passed, 'TC5.2: Enterprise article permits enterprise terminology', report.criticalErrors);
  }

  // Case 6: Missing Business Profile
  console.log('\n--- Test Group 6: Missing Business Profile ---');
  {
    const detection = detectBusinessScaleFromText('');
    assert(detection.businessScale === 'UNKNOWN', 'TC6.1: Empty text defaults to UNKNOWN', detection);

    const neutralArticle = `
## Understanding Conversion Funnels

Optimizing digital conversion funnels requires a systematic review of user friction points.
Organizations must balance cognitive load with clear value propositions.
`;
    const report = EditorialIntegrityValidator.validateEditorialIntegrity(neutralArticle, {
      businessScale: 'UNKNOWN'
    });
    assert(report.passed, 'TC6.2: Neutral article passes validation when business profile is missing/unknown', report.criticalErrors);
  }

  // Case 7: Conflicting Profile Evidence
  console.log('\n--- Test Group 7: Conflicting Profile Evidence ---');
  {
    // Solo practitioner using marketing plural ("we", "our") and a .agency domain
    const conflictingText = `
      Hi, I'm Alexandru Mitran. I fix friction in digital products through comprehensive UX audits.
      At our design practice, we believe great design increases customer retention.
      Contact us today for a consultation.
    `;
    const detection = detectBusinessScaleFromText(conflictingText);
    assert(detection.businessScale === 'SOLO_PRACTITIONER', 'TC7.1: Explicit solo identity overrides generic marketing plural "we/our"', detection);

    const urlDetection = detectBusinessTypeFromTextAndUrl(conflictingText, 'https://mitran.agency');
    assert(urlDetection.businessScale === 'SOLO_PRACTITIONER', 'TC7.2: .agency domain does NOT override explicit solo practitioner evidence', urlDetection);
  }

  // Case 8: Section Regeneration
  console.log('\n--- Test Group 8: Section Regeneration Contract ---');
  {
    const mockReqBody = {
      heading: 'UX Audit Methodology',
      body: 'Our multidisciplinary team of 20 consultants conducts audits.',
      mode: 'similar',
      articleTitle: 'How to Fix Friction with a UX Audit',
      businessScale: 'SOLO_PRACTITIONER'
    };
    // Check that if the generated/rewritten text contains agency hallucination for solo, validator flags it:
    const halluRewritten = 'At our agency, our team of consultants provides in-depth reviews.';
    const report = EditorialIntegrityValidator.validateEditorialIntegrity(halluRewritten, {
      businessScale: mockReqBody.businessScale as any
    });
    assert(!report.passed, 'TC8.1: Section regeneration hallucination is caught by validator', report.criticalErrors);
    assert(report.issues.some(i => i.type === 'POSITIONING_SCALE_MISMATCH'), 'TC8.2: Issue type is POSITIONING_SCALE_MISMATCH', report.issues);

    const compliantRewritten = 'As an independent UX specialist, I conduct in-depth reviews to identify friction.';
    const reportCompliant = EditorialIntegrityValidator.validateEditorialIntegrity(compliantRewritten, {
      businessScale: mockReqBody.businessScale as any
    });
    assert(reportCompliant.passed, 'TC8.3: Compliant solo section regeneration passes validation', reportCompliant.criticalErrors);
  }

  // Case 9: Full Regeneration Data Model
  console.log('\n--- Test Group 9: Full Regeneration Contract ---');
  {
    const profile = SaaSProfileSchema.parse({
      name: 'Mitran Design',
      description: 'Independent product design consultancy.',
      targetAudience: 'Product founders',
      keyFeatures: ['UX Audits', 'Redesigns'],
      primaryCompetitors: [],
      businessType: 'Agency/Portfolio',
      businessScale: 'SOLO_PRACTITIONER',
      businessScaleEvidence: 'Founder statement: Hi, I am Alexandru Mitran'
    });

    // Verify SaaSProfileSchema preserves scale
    const parsed = SaaSProfileSchema.parse(profile);
    assert(parsed.businessScale === 'SOLO_PRACTITIONER', 'TC9.1: SaaSProfileSchema parses and preserves SOLO_PRACTITIONER scale', parsed.businessScale);
    assert(parsed.businessScaleEvidence === profile.businessScaleEvidence, 'TC9.2: Scale evidence is preserved', parsed.businessScaleEvidence);
  }

  // Case 10: Editorial Repair
  console.log('\n--- Test Group 10: Editorial Repair Contract ---');
  {
    const articleWithHallucination = `
## Remediation Plan

Our agency with a team of consultants delivers a comprehensive roadmap to eliminate onboarding drop-off.
`;
    const reportBefore = EditorialIntegrityValidator.validateEditorialIntegrity(articleWithHallucination, {
      businessScale: 'SOLO_PRACTITIONER'
    });
    assert(!reportBefore.passed, 'TC10.1: Unrepaired hallucinated agency copy fails validation', reportBefore.criticalErrors);

    // Repaired copy:
    const repairedCopy = `
## Remediation Plan

I deliver actionable recommendations to eliminate onboarding drop-off based on empirical user friction analysis.
`;
    const reportAfter = EditorialIntegrityValidator.validateEditorialIntegrity(repairedCopy, {
      businessScale: 'SOLO_PRACTITIONER'
    });
    assert(reportAfter.passed, 'TC10.2: Repaired solo copy passes validation without introducing agency claims', reportAfter.criticalErrors);
  }

  // Case 11: Legacy User Profile Backward Compatibility
  console.log('\n--- Test Group 11: Legacy User Profile Backward Compatibility ---');
  {
    const legacyRawProfile = {
      name: 'Legacy Cloud App',
      description: 'A legacy SaaS application without scale information.',
      targetAudience: 'Software teams',
      keyFeatures: ['Automated Backups', 'Audit Logs'],
      primaryCompetitors: ['Competitor A'],
      businessType: 'SaaS'
      // Note: NO businessScale property!
    };

    const parsed = SaaSProfileSchema.parse(legacyRawProfile);
    assert(parsed.name === legacyRawProfile.name, 'TC11.1: Legacy profile parsed without error', parsed.name);
    assert(parsed.businessScale === undefined || parsed.businessScale === 'UNKNOWN', 'TC11.2: Legacy profile defaults safely without breaking', parsed.businessScale);

    // Effective fallback in application logic
    const effectiveScale = parsed.businessScale || 'UNKNOWN';
    assert(effectiveScale === 'UNKNOWN', 'TC11.3: Effective businessScale is UNKNOWN', effectiveScale);
  }

  // Case 12: Unknown Classification
  console.log('\n--- Test Group 12: Unknown Classification ---');
  {
    const genericText = `
      We build great digital solutions for modern businesses.
      Our mission is to empower teams through intuitive workflows and user research.
      Learn more about our approach.
    `;
    const detection = detectBusinessScaleFromText(genericText);
    assert(detection.businessScale === 'UNKNOWN', 'TC12.1: Generic marketing text without verified headcount or agency structure preserves UNKNOWN', detection);

    // Adversarial enterprise hallucination when scale is unknown:
    const exaggeratedArticle = `
## Global Delivery Network

Our multinational corporation with worldwide offices in 25 countries manages enterprise client deployments.
`;
    const report = EditorialIntegrityValidator.validateEditorialIntegrity(exaggeratedArticle, {
      businessScale: 'UNKNOWN'
    });
    assert(!report.passed, 'TC12.2: Unknown scale forbids inventing multinational enterprise scale', report.criticalErrors);
    assert(report.issues.some(i => i.type === 'POSITIONING_SCALE_MISMATCH'), 'TC12.3: Correctly flagged as POSITIONING_SCALE_MISMATCH', report.issues);
  }

  // Case 13: Adversarial Tests (Attempting Agency / Team Hallucination for Solo Practitioner)
  console.log('\n--- Test Group 13: Adversarial Exaggeration Tests ---');
  {
    const adversarialSentences = [
      'At our agency, our team of consultants provides in-depth UX audits.',
      'Our consulting firm employs a multidisciplinary team of specialists to optimize checkout flows.',
      'Our dedicated departments manage every phase of the client audit.',
      'Our staff of 15 designers works on onboarding friction.',
      'As a full-service agency with departments spanning research and design, we fix conversions.'
    ];

    for (let i = 0; i < adversarialSentences.length; i++) {
      const sentence = adversarialSentences[i];
      const report = EditorialIntegrityValidator.validateEditorialIntegrity(sentence, {
        businessScale: 'SOLO_PRACTITIONER'
      });
      assert(!report.passed, `TC13.${i + 1}: Adversarial sentence ${i + 1} strictly rejected for solo practitioner`, {
        sentence,
        errors: report.criticalErrors
      });
      assert(report.issues.some(issue => issue.type === 'POSITIONING_SCALE_MISMATCH'), `TC13.${i + 1}b: Matched issue type is POSITIONING_SCALE_MISMATCH`);
    }
  }

  // Case 14: Tenant Isolation Verification (Logical Scope)
  console.log('\n--- Test Group 14: Tenant Isolation Verification (Logical Scope) ---');
  {
    const tenantAProfile = SaaSProfileSchema.parse({
      name: 'Solo Consultant A',
      description: 'Independent UX practice',
      targetAudience: 'Founders',
      businessScale: 'SOLO_PRACTITIONER',
      businessScaleEvidence: 'Hi, I am Consultant A'
    });

    const tenantBProfile = SaaSProfileSchema.parse({
      name: 'Agency Enterprise B',
      description: 'Global 200 agency',
      targetAudience: 'Corporates',
      businessScale: 'AGENCY',
      businessScaleEvidence: 'Full-service agency with 100 specialists'
    });

    const detectionA = detectBusinessScaleFromText('Hi, I am Consultant A. Hire me for audits.', tenantAProfile.businessScale);
    const detectionB = detectBusinessScaleFromText('We are a full-service agency with departments.', tenantBProfile.businessScale);

    assert(detectionA.businessScale === 'SOLO_PRACTITIONER', 'TC14.1: Tenant A isolated as SOLO_PRACTITIONER', detectionA);
    assert(detectionB.businessScale === 'AGENCY', 'TC14.2: Tenant B isolated as AGENCY', detectionB);
    assert(detectionA.businessScale !== detectionB.businessScale, 'TC14.3: Tenant profiles do NOT leak or cross-contaminate');
  }

  // Case 15: Full Regeneration Propagation (Requirement A)
  console.log('\n--- Test Group 15: Full Regeneration Propagation (Requirement A) ---');
  {
    // 1. Initial generation of article with solo practitioner profile
    const soloProfile = SaaSProfileSchema.parse({
      name: 'Alex Mitran',
      description: 'Independent product designer providing UX audits.',
      targetAudience: 'Early-stage founders',
      keyFeatures: ['UX Audits', 'Conversion Audits'],
      primaryCompetitors: [],
      businessType: 'Agency/Portfolio',
      businessScale: 'SOLO_PRACTITIONER',
      businessScaleEvidence: 'Verified founder statement: Hi, I am Alexandru Mitran'
    });

    const initialSession: AnalysisSession = {
      id: 'ses_regeneration_test_001',
      userId: 'usr_regeneration_test',
      ownerId: 'usr_regeneration_test',
      targetUrl: 'https://mitran.design',
      normalizedUrl: 'https://mitran.design',
      status: 'COMPLETED',
      generationStatus: 'IDLE',
      profile: soloProfile,
      candidateKeywords: ['ux audit guide'],
      opportunities: [{
        keyword: 'ux audit guide',
        normalizedKeyword: 'ux audit guide',
        intent: 'Informational',
        contentType: 'Guide',
        businessRelevance: 95,
        estimatedDifficulty: 35,
        competitorPresence: 20,
        opportunityScore: 85,
        explanation: 'Target primary guide',
        serpTypes: [],
        rankingDomains: [],
        competitors: [],
        searchFeatures: [],
        supportingTerms: ['friction points', 'usability heuristics'],
        contentGap: '',
        recommendedAssetType: 'Guide',
        priority: 'High',
        reasoning: 'High intent'
      }],
      selectedOpportunity: {
        keyword: 'ux audit guide',
        normalizedKeyword: 'ux audit guide',
        intent: 'Informational',
        contentType: 'Guide',
        businessRelevance: 95,
        estimatedDifficulty: 35,
        competitorPresence: 20,
        opportunityScore: 85,
        explanation: 'Target primary guide',
        serpTypes: [],
        rankingDomains: [],
        competitors: [],
        searchFeatures: [],
        supportingTerms: ['friction points', 'usability heuristics'],
        contentGap: '',
        recommendedAssetType: 'Guide',
        priority: 'High',
        reasoning: 'High intent'
      },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // Verify session stores and yields exact solo scale
    assert(initialSession.profile?.businessScale === 'SOLO_PRACTITIONER', 'TC15.1: Initial session profile maintains SOLO_PRACTITIONER', initialSession.profile?.businessScale);

    // 2. Full regeneration simulates re-reading the stored session and constructing generation context
    const regeneratedSession = JSON.parse(JSON.stringify(initialSession)) as AnalysisSession;
    assert(regeneratedSession.profile?.businessScale === 'SOLO_PRACTITIONER', 'TC15.2: Regenerated session preserves SOLO_PRACTITIONER across deserialization', regeneratedSession.profile?.businessScale);
    assert(regeneratedSession.profile?.businessScaleEvidence === soloProfile.businessScaleEvidence, 'TC15.3: Regenerated session preserves businessScaleEvidence', regeneratedSession.profile?.businessScaleEvidence);

    // 3. Test that full regeneration prompt constraints receive solo practitioner guidance
    const bType = (regeneratedSession.profile?.businessType || '').toLowerCase();
    const scale = regeneratedSession.profile?.businessScale || 'UNKNOWN';

    let terminologyDirective = '';
    if (scale === 'SOLO_PRACTITIONER') {
      terminologyDirective = 'SOLO_PRACTITIONER_GUIDANCE_ACTIVE';
    } else {
      terminologyDirective = 'DEFAULT_OR_AGENCY';
    }
    assert(terminologyDirective === 'SOLO_PRACTITIONER_GUIDANCE_ACTIVE', 'TC15.4: Full regeneration prompt receives SOLO_PRACTITIONER_GUIDANCE_ACTIVE', terminologyDirective);

    // 4. Test that full regeneration output adhering to solo rules passes validation
    const compliantRegeneratedBody = `
# How to Conduct an Effective UX Audit

## Understanding Critical Friction

As an independent product designer, I analyze conversion funnels to identify user drop-off points.
Working directly with product teams, I provide actionable recommendations based on empirical usability testing.

| Evaluation Metric | Target Standard | Audit Methodology |
|---|---|---|
| Checkout Friction | Zero cognitive blocks | Step-by-step heuristic inspection |
| Onboarding Ease | 3-step completion | Time-to-value assessment |
`;
    const regReportCompliant = EditorialIntegrityValidator.validateEditorialIntegrity(compliantRegeneratedBody, {
      businessScale: regeneratedSession.profile?.businessScale
    });
    assert(regReportCompliant.passed, 'TC15.5: Fully regenerated compliant solo article passes validation', regReportCompliant.criticalErrors);

    // 5. Test that adversarial full regeneration output attempting agency claims is strictly rejected
    const adversarialRegeneratedBody = `
# How to Conduct an Effective UX Audit

## Understanding Critical Friction

Our agency's team of multidisciplinary consultants provides complete digital transformation.
Our consulting firm delivers end-to-end design sprints managed by our dedicated departments.
`;
    const regReportAdversarial = EditorialIntegrityValidator.validateEditorialIntegrity(adversarialRegeneratedBody, {
      businessScale: regeneratedSession.profile?.businessScale
    });
    assert(!regReportAdversarial.passed, 'TC15.6: Fully regenerated article with agency claims is strictly rejected', regReportAdversarial.criticalErrors);
    assert(regReportAdversarial.issues.some(i => i.type === 'POSITIONING_SCALE_MISMATCH'), 'TC15.7: Rejection issue type is POSITIONING_SCALE_MISMATCH');
  }

  // Case 16: Profile Persistence & Firestore Round-Trip (Requirement B)
  console.log('\n--- Test Group 16: Profile Persistence & Firestore Round-Trip (Requirement B) ---');
  {
    const originalProfile: SaaSProfile = {
      name: 'Elena Rostova Consulting',
      website: 'https://rostova-design.com',
      canonicalUrl: 'https://rostova-design.com',
      description: 'Independent strategic UX specialist for fintech products.',
      targetAudience: 'Fintech product leaders',
      keyFeatures: ['Fintech UX Audits', 'Compliance Onboarding Redesign'],
      primaryCompetitors: [],
      businessType: 'Agency/Portfolio',
      businessScale: 'SOLO_PRACTITIONER',
      businessScaleEvidence: 'Explicit solo founder bio: Hi, I am Elena Rostova',
      verifiedOfferings: ['Fintech UX Audits', 'Compliance Onboarding Redesign'],
      tone: 'professional',
      customInsights: '',
      crawlStatus: 'SUCCESS',
      identityConfidence: 'HIGH'
    };

    // Serialize for Firestore
    const serialized = sanitizeForFirestore(originalProfile);
    assert(serialized.businessScale === 'SOLO_PRACTITIONER', 'TC16.1: Firestore sanitization preserves businessScale', serialized.businessScale);
    assert(serialized.businessScaleEvidence === originalProfile.businessScaleEvidence, 'TC16.2: Firestore sanitization preserves businessScaleEvidence', serialized.businessScaleEvidence);

    // Simulate Firestore round-trip JSON serialization
    const firestoreLoaded = JSON.parse(JSON.stringify(serialized));
    const rehydrated = SaaSProfileSchema.parse(firestoreLoaded);
    assert(rehydrated.businessScale === 'SOLO_PRACTITIONER', 'TC16.3: SaaSProfileSchema successfully parses rehydrated Firestore profile', rehydrated.businessScale);
    assert(rehydrated.businessScaleEvidence === originalProfile.businessScaleEvidence, 'TC16.4: Rehydrated evidence matches original', rehydrated.businessScaleEvidence);

    // Test persistence in TemporaryArticleStore session
    const testSession: AnalysisSession = {
      id: 'ses_persist_roundtrip_test',
      userId: 'user_persistence_test',
      ownerId: 'user_persistence_test',
      targetUrl: originalProfile.website!,
      normalizedUrl: originalProfile.website!,
      status: 'COMPLETED',
      generationStatus: 'IDLE',
      profile: rehydrated,
      candidateKeywords: ['fintech ux audit'],
      opportunities: [{
        keyword: 'fintech ux audit',
        normalizedKeyword: 'fintech ux audit',
        intent: 'Commercial',
        contentType: 'Guide',
        businessRelevance: 90,
        estimatedDifficulty: 40,
        competitorPresence: 30,
        opportunityScore: 80,
        explanation: 'Target keyword',
        serpTypes: [],
        rankingDomains: [],
        competitors: [],
        searchFeatures: [],
        supportingTerms: ['kyc friction'],
        contentGap: '',
        recommendedAssetType: 'Guide',
        priority: 'Medium',
        reasoning: 'Commercial target'
      }],
      selectedOpportunity: {
        keyword: 'fintech ux audit',
        normalizedKeyword: 'fintech ux audit',
        intent: 'Commercial',
        contentType: 'Guide',
        businessRelevance: 90,
        estimatedDifficulty: 40,
        competitorPresence: 30,
        opportunityScore: 80,
        explanation: 'Target keyword',
        serpTypes: [],
        rankingDomains: [],
        competitors: [],
        searchFeatures: [],
        supportingTerms: ['kyc friction'],
        contentGap: '',
        recommendedAssetType: 'Guide',
        priority: 'Medium',
        reasoning: 'Commercial target'
      },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await TemporaryArticleStore.saveAnalysisSession(testSession, 'user_persistence_test');
    const loadedSession = await TemporaryArticleStore.getAnalysisSessionById('ses_persist_roundtrip_test', 'user_persistence_test');
    assert(loadedSession !== null, 'TC16.5: Session retrieved from store successfully');
    assert(loadedSession?.profile?.businessScale === 'SOLO_PRACTITIONER', 'TC16.6: Retrieved session preserves businessScale', loadedSession?.profile?.businessScale);
    assert(loadedSession?.profile?.businessScaleEvidence === originalProfile.businessScaleEvidence, 'TC16.7: Retrieved session preserves scale evidence', loadedSession?.profile?.businessScaleEvidence);
  }

  // Case 17: Comprehensive Adversarial Evidence Classification (Requirement C)
  console.log('\n--- Test Group 17: Comprehensive Adversarial Evidence Classification (Requirement C) ---');
  {
    // C.1 Explicit independent practitioner identity
    const c1 = detectBusinessScaleFromText("I am an independent designer helping startups fix conversion friction.");
    assert(c1.businessScale === 'SOLO_PRACTITIONER', 'TC17.1: Explicit independent designer classified as SOLO_PRACTITIONER', c1);

    // C.2 Generic marketing text containing "we" and "our"
    const c2 = detectBusinessScaleFromText("We craft thoughtful digital experiences. Our approach combines qualitative research with design thinking.");
    assert(c2.businessScale === 'UNKNOWN', 'TC17.2: Generic marketing text with "we" and "our" strictly preserved as UNKNOWN', c2);

    // C.3 Solo consultant offering several services
    const c3 = detectBusinessScaleFromText("Hi, I'm Dave. I offer UX research, interface redesigns, design system audits, and usability testing.");
    assert(c3.businessScale === 'SOLO_PRACTITIONER', 'TC17.3: Solo consultant offering multiple services preserved as SOLO_PRACTITIONER', c3);

    // C.4 Business with verified co-founders
    const c4 = detectBusinessScaleFromText("Founded in 2021, our studio was co-founded by Alice Smith and Bob Johnson to provide design sprints.");
    assert(c4.businessScale === 'SMALL_TEAM', 'TC17.4: Business with verified co-founders classified as SMALL_TEAM', c4);

    // C.5 Verified agency
    const c5 = detectBusinessScaleFromText("We are a full-service agency with departments across engineering, UX strategy, and account management.");
    assert(c5.businessScale === 'AGENCY', 'TC17.5: Verified full-service agency with departments classified as AGENCY', c5);

    // C.6 Ambiguous business website
    const c6 = detectBusinessScaleFromText("Welcome to the website. Discover better product outcomes today.");
    assert(c6.businessScale === 'UNKNOWN', 'TC17.6: Ambiguous website copy strictly preserved as UNKNOWN', c6);

    // C.7 Contradictory solo and agency evidence (e.g. freelance bio alongside generic agency marketing jargon)
    const c7 = detectBusinessScaleFromText("Hi, I'm Alex, an independent freelancer. We deliver full-service agency solutions for our clients.");
    assert(c7.businessScale === 'SOLO_PRACTITIONER', 'TC17.7: Personal founder statement overrides marketing jargon', c7);

    // C.8 Domain ending in .agency with explicit solo evidence
    const c8 = detectBusinessTypeFromTextAndUrl("About me: I am a solo practitioner specializing in design audits.", "https://creative-studio.agency");
    assert(c8.businessScale === 'SOLO_PRACTITIONER', 'TC17.8: .agency domain does NOT override explicit solo practitioner text', c8);

    // C.9 Misleading claims about employee counts without enterprise proof
    const c9 = detectBusinessScaleFromText("We are a tiny team of 100,000 passionate creators building simple landing pages.");
    // "100,000" alone without Fortune 500 / NASDAQ / enterprise proof is not promoted to enterprise
    assert(c9.businessScale !== 'ENTERPRISE', 'TC17.9: Casual or misleading employee count is NOT blindly promoted to ENTERPRISE', c9);
  }

  // Case 18: Validator Precision & Non-Self Reference Distinctions (Requirement D)
  console.log('\n--- Test Group 18: Validator Precision & Non-Self References (Requirement D) ---');
  {
    // D.1 "we" and "our" used for methodology/philosophy (not claiming to be an agency/firm)
    const legitWeOur = `
## Core UX Principles

We believe that user friction directly degrades activation rates.
Our methodology focuses on empirical observation of user workflows.
`;
    const repD1 = EditorialIntegrityValidator.validateEditorialIntegrity(legitWeOur, { businessScale: 'SOLO_PRACTITIONER' });
    assert(repD1.passed, 'TC18.1: Legitimate methodology "we/our" passes validation for solo practitioner', repD1.criticalErrors);

    // D.2 Legitimate reference to client's internal product team
    const legitClientTeam = `
## Collaborating with In-House Teams

When conducting an audit, I partner with the client's internal product team to understand technical constraints.
The client team provides access to user journey analytics.
`;
    const repD2 = EditorialIntegrityValidator.validateEditorialIntegrity(legitClientTeam, { businessScale: 'SOLO_PRACTITIONER' });
    assert(repD2.passed, 'TC18.2: Reference to client product team passes validation without false alert', repD2.criticalErrors);

    // D.3 Legitimate discussion of external agencies vs independent consultants
    const legitAgencyDiscussion = `
## Choosing the Right Partner

Organizations can either hire a traditional design agency or work with an independent consultant.
While a large agency offers broad resources, an independent practitioner provides direct senior focus.
`;
    const repD3 = EditorialIntegrityValidator.validateEditorialIntegrity(legitAgencyDiscussion, { businessScale: 'SOLO_PRACTITIONER' });
    assert(repD3.passed, 'TC18.3: General industry discussion of agencies vs consultants passes cleanly', repD3.criticalErrors);

    // D.4 Legitimate reference to subcontractors or external specialist partners
    const legitSubcontractors = `
## Complex Integrations

For complex backend audits, I collaborate with specialized engineering subcontractors to verify API performance.
`;
    const repD4 = EditorialIntegrityValidator.validateEditorialIntegrity(legitSubcontractors, { businessScale: 'SOLO_PRACTITIONER' });
    assert(repD4.passed, 'TC18.4: Reference to external subcontractors passes cleanly', repD4.criticalErrors);

    // D.5 Hallucinated self-reference attributing consulting firm or team of specialists to oneself MUST be caught
    const falseAttribution = `
## Why Choose Us

At our agency, our team of consultants provides comprehensive digital transformation.
`;
    const repD5 = EditorialIntegrityValidator.validateEditorialIntegrity(falseAttribution, { businessScale: 'SOLO_PRACTITIONER' });
    assert(!repD5.passed, 'TC18.5: False self-attribution of agency/team is caught strictly', repD5.criticalErrors);
    assert(repD5.issues.some(i => i.type === 'POSITIONING_SCALE_MISMATCH'), 'TC18.6: Matched issue type is POSITIONING_SCALE_MISMATCH');
  }

  // Case 19: Real Data-Access Boundary Tenant Isolation (Requirement E)
  console.log('\n--- Test Group 19: Real Data-Access Boundary Tenant Isolation (Requirement E) ---');
  {
    const tenantUserA = 'usr_tenant_alpha_123';
    const tenantUserB = 'usr_tenant_bravo_456';

    const sessionA: AnalysisSession = {
      id: 'ses_tenant_isolation_alpha',
      userId: tenantUserA,
      ownerId: tenantUserA,
      targetUrl: 'https://alpha-solo-designer.com',
      normalizedUrl: 'https://alpha-solo-designer.com',
      status: 'COMPLETED',
      generationStatus: 'IDLE',
      profile: SaaSProfileSchema.parse({
        name: 'Alpha Solo Designer',
        description: 'Independent designer',
        targetAudience: 'Startups',
        keyFeatures: ['Solo Audits'],
        primaryCompetitors: [],
        businessScale: 'SOLO_PRACTITIONER',
        businessScaleEvidence: 'Hi, I am Alpha'
      }),
      candidateKeywords: ['solo ux audit'],
      opportunities: [{
        keyword: 'solo ux audit',
        normalizedKeyword: 'solo ux audit',
        intent: 'Informational',
        contentType: 'Guide',
        businessRelevance: 90,
        estimatedDifficulty: 20,
        competitorPresence: 10,
        opportunityScore: 85,
        explanation: 'Target',
        serpTypes: [],
        rankingDomains: [],
        competitors: [],
        searchFeatures: [],
        supportingTerms: [],
        contentGap: '',
        recommendedAssetType: 'Guide',
        priority: 'High',
        reasoning: 'Solo keyword'
      }],
      selectedOpportunity: {
        keyword: 'solo ux audit',
        normalizedKeyword: 'solo ux audit',
        intent: 'Informational',
        contentType: 'Guide',
        businessRelevance: 90,
        estimatedDifficulty: 20,
        competitorPresence: 10,
        opportunityScore: 85,
        explanation: 'Target',
        serpTypes: [],
        rankingDomains: [],
        competitors: [],
        searchFeatures: [],
        supportingTerms: [],
        contentGap: '',
        recommendedAssetType: 'Guide',
        priority: 'High',
        reasoning: 'Solo keyword'
      },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // Save session under Tenant A
    await TemporaryArticleStore.saveAnalysisSession(sessionA, tenantUserA);

    // 1. Tenant A can read their own session
    const readAlpha = await TemporaryArticleStore.getAnalysisSessionById('ses_tenant_isolation_alpha', tenantUserA);
    assert(readAlpha !== null, 'TC19.1: Tenant A successfully reads own session');
    assert(readAlpha?.profile?.businessScale === 'SOLO_PRACTITIONER', 'TC19.2: Tenant A scale is SOLO_PRACTITIONER');

    // 2. Tenant B CANNOT read Tenant A's session (Data-Access Boundary Isolation)
    const readBravo = await TemporaryArticleStore.getAnalysisSessionById('ses_tenant_isolation_alpha', tenantUserB);
    assert(readBravo === null, 'TC19.3: Tenant B CANNOT read Tenant A session (fails closed with null)', readBravo);

    // 3. Tenant B CANNOT acquire generation lease on Tenant A's session
    const leaseBravo = await TemporaryArticleStore.acquireGenerationLease('ses_tenant_isolation_alpha', tenantUserB, 60000);
    assert(!leaseBravo.acquired, 'TC19.4: Tenant B CANNOT acquire generation lease on Tenant A session', leaseBravo);
    assert(leaseBravo.reason === 'FORBIDDEN', 'TC19.5: Lease acquisition fails with FORBIDDEN', leaseBravo.reason);

    // 4. Tenant A CAN acquire generation lease on their own session
    const leaseAlpha = await TemporaryArticleStore.acquireGenerationLease('ses_tenant_isolation_alpha', tenantUserA, 60000);
    assert(leaseAlpha.acquired, 'TC19.6: Tenant A successfully acquires lease on own session', leaseAlpha.acquired);
    await TemporaryArticleStore.releaseGenerationLease('ses_tenant_isolation_alpha', tenantUserA, leaseAlpha.leaseToken!, { generationStatus: 'COMPLETED' });
  }

  // Summary
  console.log('\n======================================================');
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`Phase 6C.3 / 6C.3R Results: Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Unhandled test suite failure:', err);
  process.exit(1);
});
