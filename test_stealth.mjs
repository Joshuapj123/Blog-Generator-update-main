import { chromium } from 'playwright';

async function testExtraction() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ 
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });
  
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  });

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    window.chrome = { runtime: {} } as any;
  });

  await page.goto('https://martinterhaak.medium.com/an-approach-to-software-architecture-0599c264a7fd', { waitUntil: 'networkidle' }).catch(() => {});
  
  let title = await page.title();
  if (title.includes('Just a moment') || title.includes('Attention Required')) {
     try {
       await page.waitForFunction(() => {
         const t = document.title;
         return !t.includes('Just a moment') && !t.includes('Attention Required');
       }, { timeout: 15000 });
       title = await page.title();
     } catch(e) {}
  }
  
  console.log('Final Title:', title);
  await browser.close();
}

testExtraction().catch(console.error);
