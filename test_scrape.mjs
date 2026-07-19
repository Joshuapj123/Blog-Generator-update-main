import { chromium } from 'playwright';

async function testExtraction() {
  const browser = await chromium.launch({ headless: true });
  //const page = await browser.newPage();
  const page = await browser.newPage({ 
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  await page.goto('https://martinterhaak.medium.com/an-approach-to-software-architecture-0599c264a7fd', { waitUntil: 'networkidle' });
  
  let title = await page.title();
  let retries = 0;
  while (title.includes('Just a moment') && retries < 10) {
    console.log('Got Cloudflare challenge, waiting...', title);
    await page.waitForTimeout(1000);
    title = await page.title();
    retries++;
  }
  
  console.log('Title:', title);
  await browser.close();
}

testExtraction().catch(console.error);
