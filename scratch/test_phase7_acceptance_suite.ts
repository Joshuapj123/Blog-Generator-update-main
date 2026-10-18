import { ContentEvidenceValidator } from '../src/lib/intelligence/ContentEvidenceValidator';
import { detectBusinessTypeFromTextAndUrl } from '../src/lib/saas-intelligence/website-intelligence';
import { enforceOutlineSectionBudget } from '../src/lib/content/schemas';
import { ContentBrief } from '../src/core/contracts/schemas';

async function runPhase7AcceptanceSuite() {
  console.log('================================================================');
  console.log('ACUTE Phase 7 Acceptance Test Suite');
  console.log('Entity Integrity, Article Completeness & Publication Readiness');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 10;

  // Test 1: Title extraction of promised listicle counts
  console.log('Test 1: Title extraction of promised listicle counts...');
  const t1_cases = [
    { title: 'Top 7 Best Mitran Alternatives for Enhanced Team Collaboration', expected: 7 },
    { title: '7 Best Project Management Software for Remote Teams', expected: 7 },
    { title: 'Top 10 Collaboration Tools Every Founder Needs', expected: 10 },
    { title: '5 Alternatives to Jira for Agile Developers', expected: 5 },
    { title: 'Best 3 Ways to Reduce Onboarding Friction', expected: 3 },
    { title: 'How to Choose the Right Design Agency for Your Startup', expected: null },
    { title: 'Comprehensive Guide to SaaS Product Strategy', expected: null },
  ];

  let t1_passed = true;
  for (const c of t1_cases) {
    const extracted = ContentEvidenceValidator.extractPromisedListicleCount(c.title);
    if (extracted !== c.expected) {
      console.error(`  [FAIL] Title "${c.title}" expected ${c.expected}, got ${extracted}`);
      t1_passed = false;
    }
  }
  if (t1_passed) {
    console.log('  [PASS] All listicle title formats correctly parsed.\n');
    passedTests++;
  } else {
    console.log('  [FAIL] Listicle title parsing failed.\n');
  }

  // Test 2: Incomplete listicle rejection (Promises 7, provides 2)
  console.log('Test 2: Incomplete listicle rejection (Title promises 7, delivers 2)...');
  const brief2: ContentBrief = {
    title: 'Top 7 Best Mitran Alternatives for Enhanced Team Collaboration',
    targetKeywords: ['mitran alternatives'],
    outline: [
      { heading: 'Introduction', level: 'H2', generate_table: false, assignedKeywords: [], assignedEntities: [], core_concept: 'Intro' },
      { heading: 'Asana', level: 'H2', generate_table: false, assignedKeywords: [], assignedEntities: [], core_concept: 'Tool 1' },
      { heading: 'Monday.com', level: 'H2', generate_table: false, assignedKeywords: [], assignedEntities: [], core_concept: 'Tool 2' },
      { heading: 'Conclusion', level: 'H2', generate_table: false, assignedKeywords: [], assignedEntities: [], core_concept: 'Outro' },
    ],
    wordCountBudget: { target: 1500, min: 1000, max: 2000 },
    intent: { primaryKeyword: 'mitran alternatives', intentType: 'Comparison', contentType: 'Listicle', confidenceScore: 90 },
    competitorInsights: [],
    assetType: 'ARTICLE',
    audience: 'Product Leaders',
    businessObjective: 'Mitran services',
    primaryEntities: [],
    supportingEntities: [],
    competitorGaps: [],
    serpFeatures: [],
    geoRequirements: [],
    supportingTerms: [],
    internalLinks: [],
    ctaStrategy: 'Book a UX audit consultation.'
  };

  const md2 = `# Top 7 Best Mitran Alternatives for Enhanced Team Collaboration

## Introduction
When looking for digital collaboration workflows, teams often explore diverse market solutions. In this article, we evaluate the best alternatives available for engineering and operations teams.

## Asana
Asana offers powerful task tracking and project boards designed to help cross-functional squads stay aligned on milestones. It features robust Gantt charts and customizable team workflows.

## Monday.com
Monday.com is an operational work operating system that provides real-time dashboards and integrations. It allows distributed organizations to streamline approvals, monitor deadlines, and coordinate project dependencies across modern teams.

## Conclusion
Selecting the ideal collaboration platform depends on your organizational structure and team velocity requirements.`;

  const res2 = ContentEvidenceValidator.validate(md2, brief2, undefined, undefined, 'Mitran', undefined, { businessType: 'SaaS' });
  const hasCompletenessAlert = res2.criticalErrors.some(e => e.includes('Title promises 7 items, but content only provides 2'));
  if (!res2.passed && hasCompletenessAlert) {
    console.log('  [PASS] Correctly rejected incomplete listicle with Article Completeness Alert.\n');
    passedTests++;
  } else {
    console.error(`  [FAIL] Expected Article Completeness Alert for missing items. Errors: ${res2.criticalErrors.join(' | ')}\n`);
  }

  // Test 3: Placeholder detection rejection
  console.log('Test 3: Placeholder detection rejection...');
  const md3 = `# 5 Best Project Management Tools

## Introduction
Modern teams need robust project management systems. Here are the top tools.

## 1. Asana
Asana offers structured task tracking and team boards. [Insert Asana pricing details here]

## 2. Monday.com
TODO: add description of Monday.com capabilities and enterprise pricing.

## 3. ClickUp
ClickUp brings docs, goals, and tasks together in one platform for high-velocity teams.

## 4. Trello
Trello offers lightweight Kanban boards that make personal and team project organization simple.

## 5. Notion
Notion is a flexible workspace where teams can write docs, plan roadmaps, and maintain knowledge wikis.

## Conclusion
Pick the platform that fits your workflow.`;

  const brief3 = { ...brief2, title: '5 Best Project Management Tools' };
  const res3 = ContentEvidenceValidator.validate(md3, brief3);
  const hasPlaceholderAlert = res3.criticalErrors.some(e => e.includes('Incomplete placeholder text detected'));
  if (!res3.passed && hasPlaceholderAlert) {
    console.log('  [PASS] Correctly rejected content containing unfinished placeholders.\n');
    passedTests++;
  } else {
    console.error(`  [FAIL] Expected placeholder rejection. Errors: ${res3.criticalErrors.join(' | ')}\n`);
  }

  // Test 4: Stub section rejection (< 25 words)
  console.log('Test 4: Stub section rejection (< 25 words)...');
  const md4 = `# 3 Best Design Tools

## Introduction
Designers need flexible applications for creating prototypes and UI components.

## 1. Figma
Figma is a collaborative interface design tool. It works in the browser.

## 2. Sketch
Sketch is a native macOS design application with an extensive plugin ecosystem and vector editing features for professional designers.

## 3. Adobe XD
Adobe XD allows designers to create vector graphics, interactive wireframes, and screen flows with native Creative Cloud integration.

## Conclusion
Choose the tool that integrates best with your design squad.`;

  const brief4 = { ...brief2, title: '3 Best Design Tools' };
  const res4 = ContentEvidenceValidator.validate(md4, brief4);
  const hasStubAlert = res4.criticalErrors.some(e => e.includes('incomplete stub with only'));
  if (!res4.passed && hasStubAlert) {
    console.log('  [PASS] Correctly rejected stub section with Article Completeness Alert.\n');
    passedTests++;
  } else {
    console.error(`  [FAIL] Expected stub section alert. Errors: ${res4.criticalErrors.join(' | ')}\n`);
  }

  // Test 5: Duplicate section heading rejection
  console.log('Test 5: Duplicate section heading rejection...');
  const md5 = `# 3 Top Marketing Platforms

## Introduction
Marketing platforms help teams automate customer campaigns and track engagement metrics.

## 1. HubSpot
HubSpot provides an inbound marketing suite with CRM, email automation, and analytics to support revenue teams.

## 2. HubSpot
HubSpot provides an inbound marketing suite with CRM, email automation, and analytics to support revenue teams.

## 3. ActiveCampaign
ActiveCampaign combines email marketing, marketing automation, and CRM tools for small and medium businesses.

## Conclusion
Evaluate both platforms against your team goals.`;

  const brief5 = { ...brief2, title: '3 Top Marketing Platforms' };
  const res5 = ContentEvidenceValidator.validate(md5, brief5);
  const hasDupAlert = res5.criticalErrors.some(e => e.includes('Duplicate section heading detected'));
  if (!res5.passed && hasDupAlert) {
    console.log('  [PASS] Correctly rejected duplicate section headings.\n');
    passedTests++;
  } else {
    console.error(`  [FAIL] Expected duplicate heading alert. Errors: ${res5.criticalErrors.join(' | ')}\n`);
  }

  // Test 6: Successful listicle acceptance (Delivers all 5 promised substantive sections)
  console.log('Test 6: Successful listicle acceptance (Promises 5, delivers 5 substantive items)...');
  const md6 = `# 5 Best Project Management Tools for Fast-Growing Teams

## Introduction
Selecting the right project management platform is essential for team productivity, clear ownership, and reliable deadline execution across fast-growing organizations.

## 1. Asana
Asana delivers structured project hierarchies, workflow automations, and custom portfolio views that allow cross-functional teams to track strategic initiatives, monitor velocity metrics, and manage operational sprint tasks efficiently.

## 2. Monday.com
Monday.com provides a flexible work operating system with customizable columns, automated alerts, and visual timeline charts that keep distributed engineering and product teams aligned on deliverables.

## 3. ClickUp
ClickUp combines task boards, collaborative documents, goal tracking, and time estimation into a unified environment designed to reduce tool sprawl for high-velocity software engineering organizations.

## 4. Trello
Trello offers an intuitive Kanban-style board architecture that enables lightweight task visualization, quick column transitions, and team board sharing with minimal configuration or onboarding overhead.

## 5. Notion
Notion unifies documentation, project boards, and company wikis into an adaptable workspace that allows technical teams to maintain contextual documentation directly alongside project task trackers.

## Conclusion
The best project management tool depends on your team size, workflow complexity, and whether your organization prioritizes structured governance or rapid, flexible task tracking.`;

  const brief6 = { ...brief2, title: '5 Best Project Management Tools for Fast-Growing Teams' };
  const res6 = ContentEvidenceValidator.validate(md6, brief6, undefined, undefined, 'WorkflowPro', undefined, { businessType: 'SaaS' });
  if (res6.passed && res6.criticalErrors.length === 0) {
    console.log('  [PASS] Successfully accepted complete, substantive listicle meeting all numerical promises.\n');
    passedTests++;
  } else {
    console.error(`  [FAIL] Unexpected failure for complete listicle: ${res6.criticalErrors.join(' | ')}\n`);
  }

  // Test 7: Archetype detection on mitran.design
  console.log('Test 7: Entity archetype detection on mitran.design...');
  const mitranText = `Title: I Fix Friction in Digital Products | mitran.design
Description: UX audits and redesigns for onboarding, checkout and critical product flows where users get stuck or drop off.
Site Name: Mitran Design

I fix friction in digital products. UX audits and product redesigns for SaaS onboarding, checkout, and high-stakes conversion flows.
Book a UX audit to identify where your users get stuck and drop off.`;

  const detected7 = detectBusinessTypeFromTextAndUrl(mitranText, 'https://mitran.design/');
  if (
    detected7.businessType === 'Agency/Portfolio' &&
    detected7.verifiedOfferings.includes('UX Audits') &&
    detected7.verifiedOfferings.includes('Product Redesigns') &&
    detected7.identityConfidence === 'HIGH'
  ) {
    console.log(`  [PASS] Correctly detected businessType: ${detected7.businessType}, offerings: ${detected7.verifiedOfferings.join(', ')}\n`);
    passedTests++;
  } else {
    console.error(`  [FAIL] Archetype detection failed:`, detected7);
  }

  // Test 8: Non-SaaS Outline Budget preservation
  console.log('Test 8: Outline section budget preservation for listicle promises...');
  const brief8: ContentBrief = {
    ...brief2,
    title: 'Top 7 Best Tools for UX Friction Audits',
    outline: [
      { heading: 'Introduction', level: 'H2', generate_table: false, assignedKeywords: [], assignedEntities: [], core_concept: 'Intro' },
      { heading: 'Hotjar', level: 'H2', generate_table: false, assignedKeywords: [], assignedEntities: [], core_concept: 'Tool 1' },
      { heading: 'FullStory', level: 'H2', generate_table: false, assignedKeywords: [], assignedEntities: [], core_concept: 'Tool 2' },
      { heading: 'UserTesting', level: 'H2', generate_table: false, assignedKeywords: [], assignedEntities: [], core_concept: 'Tool 3' },
      { heading: 'Maze', level: 'H2', generate_table: false, assignedKeywords: [], assignedEntities: [], core_concept: 'Tool 4' },
      { heading: 'Sprig', level: 'H2', generate_table: false, assignedKeywords: [], assignedEntities: [], core_concept: 'Tool 5' },
      { heading: 'LogRocket', level: 'H2', generate_table: false, assignedKeywords: [], assignedEntities: [], core_concept: 'Tool 6' },
      { heading: 'Smartlook', level: 'H2', generate_table: false, assignedKeywords: [], assignedEntities: [], core_concept: 'Tool 7' },
    ]
  };

  // Pass maxHeadings = 5, which would previously truncate the 7 items down to 5
  const budgetRes8 = enforceOutlineSectionBudget(brief8, 5);
  if (budgetRes8.brief.outline.length === 8 && !budgetRes8.budgetEnforced) {
    console.log(`  [PASS] Successfully protected 7 promised listicle items from truncation (kept ${budgetRes8.brief.outline.length} sections).\n`);
    passedTests++;
  } else {
    console.error(`  [FAIL] Outline budget truncated promised listicle items: length = ${budgetRes8.brief.outline.length}`);
  }

  // Test 9: Entity premise gate (Rejects classifying Agency as SaaS Collaboration Tool)
  console.log('Test 9: Entity premise gate (Rejecting Agency treated as software platform)...');
  const md9 = `# Why Teams Choose Mitran for Work Management

## Introduction
Mitran is a task management platform designed to help cross-functional squads organize workflows and track operational tickets.

## Key Software Features
The software platform provides automated sprint boards, team messaging, and time-tracking integrations.

## Conclusion
Mitran web platform offers robust collaboration capabilities.`;

  const brief9 = { ...brief2, title: 'Why Teams Choose Mitran for Work Management' };
  const res9 = ContentEvidenceValidator.validate(md9, brief9, undefined, undefined, 'Mitran', undefined, {
    name: 'Mitran',
    businessType: 'Agency/Portfolio',
    verifiedOfferings: ['UX Audits', 'Product Redesign']
  });

  const hasEntityPremiseAlert = res9.criticalErrors.some(e => e.includes('Entity Premise Alert'));
  if (!res9.passed && hasEntityPremiseAlert) {
    console.log('  [PASS] Correctly blocked publication with Entity Premise Alert.\n');
    passedTests++;
  } else {
    console.error(`  [FAIL] Expected Entity Premise Alert. Errors: ${res9.criticalErrors.join(' | ')}\n`);
  }

  // Test 10: CTA relevance gate (Rejects software trial CTA for an Agency/Portfolio)
  console.log('Test 10: CTA relevance gate (Rejecting software trial for Agency/Portfolio)...');
  const md10 = `# How UX Audits Reduce Friction in Digital Products

## Introduction
Digital products often suffer from unaddressed friction points that cause checkout drop-off and user abandonment.

## Identifying Core UX Drop-Off Points
Conducting regular funnel reviews and friction audits allows product designers to uncover confusing user interfaces, unneeded form fields, and misleading navigation structures before they damage conversion.

## Practical Redesign Strategies
Streamlining user flows involves removing duplicate verification steps, clarifying checkout validation messages, and ensuring primary calls to action remain accessible across mobile devices.

## Get Started Today
Ready to improve your application conversion? Start your 14-day free trial now to access all software features and optimize your metrics.`;

  const brief10 = {
    ...brief2,
    title: 'How UX Audits Reduce Friction in Digital Products',
    ctaStrategy: 'Start your free trial today.'
  };

  const res10 = ContentEvidenceValidator.validate(md10, brief10, undefined, undefined, 'Mitran', undefined, {
    name: 'Mitran',
    businessType: 'Agency/Portfolio',
    verifiedOfferings: ['UX Audits', 'Product Redesign']
  });

  const hasCtaAlert = res10.criticalErrors.some(e => e.includes('CTA Relevance Alert'));
  if (!res10.passed && hasCtaAlert) {
    console.log('  [PASS] Correctly blocked publication with CTA Relevance Alert.\n');
    passedTests++;
  } else {
    console.error(`  [FAIL] Expected CTA Relevance Alert. Errors: ${res10.criticalErrors.join(' | ')}\n`);
  }

  // Test 11: Rendered HTML completeness validation (Promises 7, HTML only has 2)
  console.log('Test 11: Rendered HTML completeness validation (Promises 7, HTML only has 2)...');
  totalTests++;
  const html11 = `
    <h1>Top 7 Best Mitran Alternatives for Enhanced Team Collaboration</h1>
    <p>When looking for digital collaboration workflows, teams often explore diverse market solutions across the industry.</p>
    <h2>Asana</h2>
    <p>Asana offers powerful task tracking and project boards designed to help cross-functional squads stay aligned on milestones. It features robust Gantt charts and customizable team workflows for enterprises.</p>
    <h2>Monday.com</h2>
    <p>Monday.com is an operational work operating system that provides real-time dashboards and integrations. It allows distributed organizations to streamline approvals, monitor deadlines, and coordinate project dependencies.</p>
    <h2>Conclusion</h2>
    <p>Selecting the ideal collaboration platform depends on your organizational structure and team velocity requirements.</p>
  `;

  const htmlRes11 = ContentEvidenceValidator.validateHtmlCompleteness(
    html11,
    'Top 7 Best Mitran Alternatives for Enhanced Team Collaboration',
    'Mitran',
    { businessType: 'SaaS' }
  );

  const hasHtmlCompletenessAlert = htmlRes11.criticalErrors.some(e => e.includes('Title promises 7 items, but HTML content only provides 2'));
  if (!htmlRes11.passed && hasHtmlCompletenessAlert) {
    console.log('  [PASS] Correctly rejected incomplete HTML content with Article Completeness Alert.\n');
    passedTests++;
  } else {
    console.error(`  [FAIL] Expected HTML completeness alert. Errors: ${htmlRes11.criticalErrors.join(' | ')}\n`);
  }

  // Test 12: Rendered HTML entity premise & placeholder validation
  console.log('Test 12: Rendered HTML entity premise & placeholder validation...');
  totalTests++;
  const html12 = `
    <h1>Why Teams Choose Mitran for Work Management</h1>
    <p>Mitran is a task management platform designed to help cross-functional squads organize workflows.</p>
    <h2>Core Features</h2>
    <p>[Insert core feature table here]</p>
  `;

  const htmlRes12 = ContentEvidenceValidator.validateHtmlCompleteness(
    html12,
    'Why Teams Choose Mitran for Work Management',
    'Mitran',
    { name: 'Mitran', businessType: 'Agency/Portfolio', verifiedOfferings: ['UX Audits'] }
  );

  const hasHtmlEntityAlert = htmlRes12.criticalErrors.some(e => e.includes('Entity Premise Alert'));
  const hasHtmlPlaceholderAlert = htmlRes12.criticalErrors.some(e => e.includes('Incomplete placeholder text detected'));
  if (!htmlRes12.passed && hasHtmlEntityAlert && hasHtmlPlaceholderAlert) {
    console.log('  [PASS] Correctly rejected HTML with both Entity Premise Alert and Placeholder Alert.\n');
    passedTests++;
  } else {
    console.error(`  [FAIL] Expected HTML entity and placeholder alerts. Errors: ${htmlRes12.criticalErrors.join(' | ')}\n`);
  }

  console.log('================================================================');
  console.log(`Summary: ${passedTests}/${totalTests} tests passed.`);
  console.log('================================================================');

  if (passedTests === totalTests) {
    console.log('ACUTE Phase 7 Acceptance Suite PASSED completely!');
    process.exit(0);
  } else {
    console.error('ACUTE Phase 7 Acceptance Suite FAILED.');
    process.exit(1);
  }
}

runPhase7AcceptanceSuite().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
