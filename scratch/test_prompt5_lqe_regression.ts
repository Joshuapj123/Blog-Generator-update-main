// scratch/test_prompt5_lqe_regression.ts
import { 
  LinkQualityEngine, 
  RawLinkInput, 
  FilteredLinkOutput, 
  URLNormalizer,
  LinkSafetyValidator
} from '../src/lib/seo-intelligence/link_quality_engine';

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

async function runLqeRegressionSuite() {
  console.log('\n======================================================');
  console.log(' PROMPT 5.1: LINK QUALITY ENGINE (LQE) REGRESSION TEST');
  console.log('======================================================\n');
  console.log('Verifying that:');
  console.log('1. Ordinary links are processed and rewritten according to authority');
  console.log('2. Unsafe links (SSRF, dangerous schemes) are strictly rejected');
  console.log('3. Markdown image syntax and base64 SVG data URIs are preserved intact');
  console.log('4. Authority threshold remains strictly 80 (scoring policy unchanged)');
  console.log('5. Same-origin security behavior remains strictly enforced\n');

  // 1. PROOF: Authority threshold remains strictly 80
  console.log('--- 1. Authority Threshold Policy Invariant (80) ---');
  const lowAuthInputs: RawLinkInput[] = [
    { title: 'Tech Blog 1', url: 'https://techblog1.io/post-about-web' },
    { title: 'Tech Blog 2', url: 'https://techblog2.io/dev-guide' },
  ];
  const lowResult = LinkQualityEngine.processWithRecovery(
    lowAuthInputs,
    'custom software engineering',
    'custom software development Brasov',
    { threshold: 80, allowDegradedQuality: true }
  );
  assert(
    lowResult.status === 'DEGRADED',
    'Low authority candidate (<80) triggers DEGRADED status under threshold 80',
    `Status: ${lowResult.status}, avgAuth: ${lowResult.averageAuthority}`
  );
  assert(
    lowResult.threshold === 80,
    'Policy constant: threshold is exactly 80',
    `Actual: ${lowResult.threshold}`
  );

  const highAuthInputs: RawLinkInput[] = [
    { title: 'GitHub Docs', url: 'https://docs.github.com/en/actions' },
    { title: 'Mozilla Developer Network', url: 'https://developer.mozilla.org/en-US/docs/Web' },
    { title: 'W3C Architecture', url: 'https://www.w3.org/standards' },
  ];
  const highResult = LinkQualityEngine.processWithRecovery(
    highAuthInputs,
    'custom software engineering',
    'custom software development Brasov',
    { threshold: 80 }
  );
  assert(
    highResult.status === 'HEALTHY' && highResult.averageAuthority >= 80,
    'High authority candidates (>=80) achieve HEALTHY status under threshold 80',
    `Status: ${highResult.status}, avgAuth: ${highResult.averageAuthority}`
  );

  // 2. PROOF: Ordinary links are processed & rewritten
  console.log('\n--- 2. Ordinary Links Processing & Extraction ---');
  const mockArticle = {
    title: 'Custom Software Development in Brasov',
    intro: {
      hook: 'Modern teams rely on [GitHub Docs](https://docs.github.com/en/actions) for automated workflows.',
      thesis: 'We also checked [Unapproved Blog](https://randomblog.xyz/post).',
      overview: 'Comprehensive guide.',
    },
    sections: [
      {
        heading: 'Architecture Patterns',
        what_it_is: 'Modern architecture details.',
        why_it_works: 'Proven patterns.',
        experience_or_data_point: 'Field experience.',
        takeaway: 'Choose right stack.',
      },
    ],
  };

  const extracted = LinkQualityEngine.extractLinks(mockArticle);
  assert(
    extracted.length === 2 && extracted.some(l => l.url.includes('docs.github.com')),
    'Extracts standard markdown hyperlinks from article fields',
    `Extracted: ${extracted.length}`
  );

  const rewritten = LinkQualityEngine.rewriteArticle(mockArticle, highResult.selectedLinks);
  assert(
    rewritten.intro.hook.includes('[GitHub Docs](https://docs.github.com/en/actions)'),
    'Approved high-authority links are retained with canonical anchor and URL'
  );
  assert(
    !rewritten.intro.thesis.includes('(https://randomblog.xyz/post)'),
    'Unapproved link URL is stripped, leaving only the anchor text prose'
  );
  assert(
    rewritten.intro.thesis.includes('Unapproved Blog'),
    'Stripped unapproved link retains anchor text prose'
  );

  // 3. PROOF: Unsafe schemes and SSRF targets are strictly rejected
  console.log('\n--- 3. Unsafe Schemes & SSRF Rejection ---');
  const unsafeCandidates = [
    'javascript:alert(1)',
    'http://169.254.169.254/latest/meta-data/',
    'http://127.0.0.1:8080/admin',
    'file:///etc/passwd',
    'data:text/html;base64,PHNjcmlwdD4=',
    'http://localhost:3000/internal',
  ];

  let rejectedCount = 0;
  for (const url of unsafeCandidates) {
    const safety = LinkSafetyValidator.isSafeUrl(url);
    if (!safety.safe) {
      rejectedCount++;
    }
  }
  assert(
    rejectedCount === unsafeCandidates.length,
    'All dangerous schemes (javascript, file, data:text/html) and SSRF targets (169.254, 127.0.0.1, localhost) rejected',
    `Rejected ${rejectedCount}/${unsafeCandidates.length}`
  );

  // 4. PROOF: SVG Data URIs and Markdown Images are preserved intact
  console.log('\n--- 4. Visual Asset & SVG Data URI Preservation ---');
  const rawSvgDataUri = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0MCIvPjwvc3ZnPg==';
  
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
        what_it_is: `Here is the architectural diagram:\n\n![Diagram: Cloud Native Architecture](${rawSvgDataUri})\n*Figure: Cloud Native Architecture*`,
        why_it_works: 'Robust deployment flow.',
        experience_or_data_point: 'Field experience.',
        takeaway: 'Scalable systems.',
      },
    ],
  };

  // extractLinks must IGNORE markdown images and data URIs
  const extractedFromDiagramArticle = LinkQualityEngine.extractLinks(articleWithDiagrams);
  assert(
    !extractedFromDiagramArticle.some(l => l.url.startsWith('data:image/') || l.title.includes('Diagram:')),
    'extractLinks ignores markdown images and SVG data URIs (does not mistake them for hyperlinks)',
    `Extracted count: ${extractedFromDiagramArticle.length}`
  );

  // rewriteArticle must PRESERVE markdown images and data URIs intact
  const rewrittenDiagramArticle = LinkQualityEngine.rewriteArticle(articleWithDiagrams, highResult.selectedLinks);
  assert(
    rewrittenDiagramArticle.sections[0].what_it_is.includes(`![Diagram: Cloud Native Architecture](${rawSvgDataUri})`),
    'rewriteArticle preserves ![Diagram: ...](data:image/svg+xml;base64,...) syntax and data URI 100% intact',
    'SVG data URI was not stripped'
  );
  assert(
    !rewrittenDiagramArticle.sections[0].what_it_is.includes('!Diagram: Cloud Native Architecture'),
    'Does not convert markdown image asset into broken text placeholder'
  );
  assert(
    rewrittenDiagramArticle.sections[0].what_it_is.includes('*Figure: Cloud Native Architecture*'),
    'Preserves figure caption line intact'
  );

  // 5. PROOF: Same-origin security behavior remains strictly enforced
  console.log('\n--- 5. Same-Origin Policy Enforcement ---');
  const crossOriginUrl = 'https://external-competitor.com/malicious-target';
  const sameOriginSafe = LinkSafetyValidator.isSafeUrl(crossOriginUrl, { requireSameOriginWith: 'https://smetytech.com' });
  assert(
    sameOriginSafe.safe === false,
    'Cross-origin URL rejected when same-origin is required',
    `Reason: ${sameOriginSafe.reason}`
  );

  const internalSafe = LinkSafetyValidator.isSafeUrl('https://smetytech.com/services/custom-software', { requireSameOriginWith: 'https://smetytech.com' });
  assert(
    internalSafe.safe === true,
    'Verified same-origin internal URL accepted',
    `Safe: ${internalSafe.safe}`
  );

  console.log('\n======================================================');
  console.log(` LQE REGRESSION TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runLqeRegressionSuite().catch(err => {
  console.error('Fatal error in LQE regression test:', err);
  process.exit(1);
});
