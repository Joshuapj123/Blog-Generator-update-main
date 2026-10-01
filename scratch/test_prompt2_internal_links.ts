// scratch/test_prompt2_internal_links.ts
import { SitemapDiscoveryService } from '../src/lib/research/SitemapDiscoveryService';

async function runPrompt2Suite() {
  console.log('====================================================');
  console.log(' PROMPT 2: BOUNDED INTERNAL LINK INTELLIGENCE SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let total = 8;

  // Test 1: Discovery on smetytech.com
  console.log('[Test 1] Sitemap discovery on https://smetytech.com/...');
  const t1Start = Date.now();
  const res1 = await SitemapDiscoveryService.discoverUrls('https://smetytech.com/');
  const t1Duration = Date.now() - t1Start;
  if (res1.sitemapFound && res1.urls.length > 0 && t1Duration < 15000) {
    console.log(`  -> PASS: Discovered ${res1.urls.length} URLs in ${t1Duration}ms`);
    passed++;
  } else {
    console.error(`  -> FAIL Test 1`);
  }

  // Test 2: Target page recommendation scoring >= 85
  console.log('[Test 2] High-relevance recommendation scoring >= 85...');
  const res2 = await SitemapDiscoveryService.getInternalLinkRecommendations({
    domain: 'https://smetytech.com/',
    topic: 'Custom SaaS Platform Development',
    targetKeyword: 'custom SaaS platform development'
  });
  const match2 = res2.candidates.find(c => c.url.includes('/servicii/dezvoltare-web') || c.url.includes('/dezvoltare-aplicatie-web'));
  if (match2 && match2.score >= 85) {
    console.log(`  -> PASS: Found target page ${match2.url} with score ${match2.score} >= 85`);
    passed++;
  } else {
    console.error(`  -> FAIL Test 2`);
  }

  // Test 3: Irrelevant page scoring check (< 35)
  console.log('[Test 3] Irrelevant page scoring (< 35)...');
  const res3 = SitemapDiscoveryService.scorePage({
    urlPath: '/reparatii-website',
    title: 'Reparații Website: Mentenanță și Depanare Site-uri',
    h1: 'Reparații Website',
    description: 'Servicii de reparații și mentenanță pentru site-uri web',
    topic: 'Custom SaaS Platform Development',
    targetKeyword: 'custom SaaS platform development'
  });
  if (res3.score < 35) {
    console.log(`  -> PASS: Irrelevant page scored ${res3.score} (< 35)`);
    passed++;
  } else {
    console.error(`  -> FAIL Test 3: ${res3.score}`);
  }

  // Test 4: Domain Safety (cross-origin candidate rejected)
  console.log('[Test 4] Domain safety / cross-origin isolation...');
  const res4 = await SitemapDiscoveryService.discoverUrls('https://smetytech.com/');
  const crossOrigin = res4.urls.filter(u => !u.url.includes('smetytech.com'));
  if (crossOrigin.length === 0) {
    console.log(`  -> PASS: All discovered URLs belong strictly to smetytech.com`);
    passed++;
  } else {
    console.error(`  -> FAIL Test 4`);
  }

  // Test 5: Missing sitemap graceful fallback without hanging
  console.log('[Test 5] Missing sitemap graceful fallback...');
  const t5Start = Date.now();
  const res5 = await SitemapDiscoveryService.discoverUrls('https://example.com');
  const t5Duration = Date.now() - t5Start;
  if (t5Duration < 15000) {
    console.log(`  -> PASS: Handled gracefully in ${t5Duration}ms`);
    passed++;
  } else {
    console.error(`  -> FAIL Test 5`);
  }

  // Test 6: Malformed URL & private IP SSRF prevention
  console.log('[Test 6] Malformed URL & private IP SSRF prevention...');
  const res6 = await SitemapDiscoveryService.getInternalLinkRecommendations({
    domain: 'http://192.168.1.1/admin',
    topic: 'test',
    targetKeyword: 'test'
  });
  if (res6.error && res6.candidates.length === 0) {
    console.log(`  -> PASS: Blocked private IP SSRF cleanly: "${res6.error}"`);
    passed++;
  } else {
    console.error(`  -> FAIL Test 6`);
  }

  // Test 7: Discovered candidate limit (capped at 100 max)
  console.log('[Test 7] Candidate limit enforcement (max 100 URLs)...');
  const res7 = await SitemapDiscoveryService.discoverUrls('https://smetytech.com/');
  if (res7.urls.length <= 100) {
    console.log(`  -> PASS: Candidate count ${res7.urls.length} <= 100`);
    passed++;
  } else {
    console.error(`  -> FAIL Test 7`);
  }

  // Test 8: Metadata inspection cap (max 10 pages requested)
  console.log('[Test 8] Metadata inspection cap (max 10 pages)...');
  const mockUrls = Array.from({ length: 25 }, (_, i) => `https://smetytech.com/page-${i}`);
  const res8 = await SitemapDiscoveryService.extractPageMetadata(mockUrls);
  if (res8.length <= 10) {
    console.log(`  -> PASS: extractPageMetadata bounded to max 10 pages (${res8.length})`);
    passed++;
  } else {
    console.error(`  -> FAIL Test 8`);
  }

  console.log('\n====================================================');
  console.log(`PROMPT 2 RESULT: ${passed}/${total} TESTS PASSED`);
  console.log('====================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runPrompt2Suite().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
