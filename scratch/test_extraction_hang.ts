// scratch/test_extraction_hang.ts
import { chromium } from 'playwright';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

async function testUrl(url: string) {
  console.log(`\n--- TESTING URL: ${url} ---`);
  let browser;
  try {
    console.log('[DEBUG] Launching chromium...');
    browser = await chromium.launch({ headless: true });
    
    console.log('[DEBUG] Opening browser page...');
    const page = await browser.newPage();

    console.log('[DEBUG] Navigating to URL with waitUntil: "networkidle" and 25s timeout...');
    const startNav = Date.now();
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
      console.log(`[DEBUG] Navigation networkidle successful in ${Date.now() - startNav}ms`);
    } catch (e: any) {
      console.warn(`[DEBUG] Navigation networkidle failed in ${Date.now() - startNav}ms: ${e.message}`);
      console.log('[DEBUG] Retrying navigation with domcontentloaded...');
      const startRetry = Date.now();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(err => {
        console.error('[DEBUG] Retry navigation failed:', err.message);
      });
      console.log(`[DEBUG] Retry navigation completed in ${Date.now() - startRetry}ms`);
    }

    console.log('[DEBUG] Getting page content...');
    const html = await page.content();
    console.log(`[DEBUG] Got html content (length: ${html.length})`);

    console.log('[DEBUG] Parsing with Readability...');
    const doc = new JSDOM(html, { url }).window.document;
    const reader = new Readability(doc);
    const article = reader.parse();
    console.log(`[DEBUG] Readability complete. Excerpt: ${(article?.excerpt || '').slice(0, 100)}`);

    console.log('[DEBUG] Evaluating desktopData page.evaluate...');
    const startEval = Date.now();
    const desktopData = await page.evaluate(() => {
      const rootStyles = window.getComputedStyle(document.documentElement);
      
      console.log('[EVAL] Extracting CSS variables...');
      const cssVariables: Record<string, string> = {};
      try {
        for (const sheet of Array.from(document.styleSheets)) {
          try {
            for (const rule of Array.from(sheet.cssRules || [])) {
              if (rule instanceof CSSStyleRule && rule.selectorText === ':root') {
                for (let i = 0; i < rule.style.length; i++) {
                  const p = rule.style[i];
                  if (p.startsWith('--')) cssVariables[p] = rootStyles.getPropertyValue(p).trim();
                }
              }
            }
          } catch (e) { /* ignore */ }
        }
      } catch (e) { /* ignore */ }

      console.log('[EVAL] Done cssVariables');
      return { cssVariables };
    });
    console.log(`[DEBUG] Evaluate complete in ${Date.now() - startEval}ms`);

    console.log('[DEBUG] Setting mobile viewport...');
    await page.setViewportSize({ width: 375, height: 812 });
    console.log('[DEBUG] Waiting mobile layout timeout...');
    await page.waitForTimeout(500);

    console.log('[DEBUG] Success! Finished processing URL');
  } catch (error: any) {
    console.error('[ERROR] Crash in testUrl:', error.message);
  } finally {
    if (browser) {
      console.log('[DEBUG] Closing browser...');
      await browser.close();
      console.log('[DEBUG] Browser closed.');
    }
  }
}

async function run() {
  await testUrl('https://example.com/');
  await testUrl('https://ai.google/');
}

run().catch(console.error);
