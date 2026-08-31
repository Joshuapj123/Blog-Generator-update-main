import { verifyUrlSafety, isPrivateIP } from '../src/lib/research/url-verifier';
import { WebsiteIntelligenceService } from '../src/lib/saas-intelligence/website-intelligence';
import * as http from 'http';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve('.env') });

let server: http.Server;

const port = 4567;
const syntheticResponses: Record<string, string> = {
  '/test3': `
    <!DOCTYPE html>
    <html>
      <body>
        <div class="header-widget">HubSpot Business Management</div>
        <div class="page-widget">Legitimate SaaS platform copy here.</div>
        <div class="cell-widget">Product Features and pricing details.</div>
      </body>
    </html>
  `,
  '/test4': `
    <!DOCTYPE html>
    <html>
      <head>
        <script>const a = 1; console.log(a);</script>
        <style>body { background: #fff; }</style>
      </head>
      <body>
        <div class="cookie-consent">This website uses tracking cookies. Accept?</div>
        <div class="ad-box">Advertisement Banner</div>
        <p>This is the primary legitimate content of the page.</p>
      </body>
    </html>
  `,
  '/test5': `
    <!DOCTYPE html>
    <html>
      <body>
        <nav>Main Navigation Link</nav>
        <header>HubSpot Corporate Portal</header>
        <footer class="cookie">Consent Footer text</footer>
        <main>Short page copy.</main>
      </body>
    </html>
  `
};

async function startServer(): Promise<void> {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      const path = req.url || '';
      if (syntheticResponses[path]) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(syntheticResponses[path]);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    server.listen(port, () => {
      resolve();
    });
  });
}

async function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve());
    } else {
      resolve();
    }
  });
}

async function runTests() {
  console.log('--- STARTING MULTI-TEST SUITE FOR URL AUTOPILOT FLOW ---');
  let failed = false;

  // Start local mock server for synthetic test cases
  await startServer();
  console.log(`Mock server started on http://localhost:${port}`);

  const intelService = new WebsiteIntelligenceService();

  try {
    // TEST 1: Real HubSpot URL Ingestion Test
    console.log('\n--- TEST 1: Real HubSpot URL Ingestion ---');
    console.log('Crawl testing target URL: https://www.hubspot.com/ ...');
    const textContent1 = await intelService.crawlUrl('https://www.hubspot.com/');
    console.log(`Extracted text length: ${textContent1.length}`);
    if (textContent1.length === 0) {
      console.error('❌ TEST 1 FAILED: Extracted text length is 0.');
      failed = true;
    } else {
      console.log('✅ TEST 1 PASSED! Preview (first 150 chars):');
      console.log(textContent1.slice(0, 150));
    }

    // TEST 2: Real example.com Ingestion Test
    console.log('\n--- TEST 2: Real example.com Ingestion ---');
    console.log('Crawl testing target URL: https://example.com/ ...');
    const textContent2 = await intelService.crawlUrl('https://example.com/');
    console.log(`Extracted text length: ${textContent2.length}`);
    if (textContent2.length === 0) {
      console.error('❌ TEST 2 FAILED: Extracted text length is 0.');
      failed = true;
    } else {
      console.log('✅ TEST 2 PASSED! Preview (first 150 chars):');
      console.log(textContent2.slice(0, 150));
    }

    // TEST 3: Synthetic homepage widget classes preservation
    console.log('\n--- TEST 3: Synthetic widget classes preservation ---');
    const textContent3 = await intelService.crawlUrl(`http://localhost:${port}/test3`);
    console.log(`Extracted text: "${textContent3}"`);
    if (!textContent3.includes('HubSpot Business Management') || !textContent3.includes('Legitimate SaaS platform copy') || !textContent3.includes('Product Features')) {
      console.error('❌ TEST 3 FAILED: Widget contents were incorrectly pruned.');
      failed = true;
    } else {
      console.log('✅ TEST 3 PASSED!');
    }

    // TEST 4: Synthetic page junk removal (script/style/tracking/cookie overlays)
    console.log('\n--- TEST 4: Synthetic page junk removal ---');
    const textContent4 = await intelService.crawlUrl(`http://localhost:${port}/test4`);
    console.log(`Extracted text: "${textContent4}"`);
    if (textContent4.includes('cookie') || textContent4.includes('Advertisement') || textContent4.includes('console.log') || textContent4.includes('background')) {
      console.error('❌ TEST 4 FAILED: Junk or cookie consent elements were not removed.');
      failed = true;
    } else if (!textContent4.includes('primary legitimate content')) {
      console.error('❌ TEST 4 FAILED: Legitimate content was lost.');
      failed = true;
    } else {
      console.log('✅ TEST 4 PASSED!');
    }

    // TEST 5: Synthetic page fallback extraction (Strategy 2)
    console.log('\n--- TEST 5: Synthetic fallback extraction strategy ---');
    const textContent5 = await intelService.crawlUrl(`http://localhost:${port}/test5`);
    console.log(`Extracted text: "${textContent5}"`);
    // Nav and header should be preserved by fallback Strategy 2 if Strategy 1 cleaned too much
    if (!textContent5.includes('Navigation') && !textContent5.includes('HubSpot Corporate Portal')) {
      console.error('❌ TEST 5 FAILED: Fallback did not preserve nav or header content.');
      failed = true;
    } else {
      console.log('✅ TEST 5 PASSED!');
    }

  } catch (err: any) {
    console.error('❌ An exception occurred during execution:', err.stack);
    failed = true;
  } finally {
    await stopServer();
    console.log('\nMock server stopped.');
  }

  console.log('\n----------------------------------------');
  if (failed) {
    console.error('❌ AUTOMATED TESTS FAILED');
    process.exit(1);
  } else {
    console.log('🎉 ALL 5 URL AUTOPILOT TESTS PASSED SUCCESSFULLY!');
  }
}

runTests();
