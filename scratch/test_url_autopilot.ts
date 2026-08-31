import { verifyUrlSafety, isPrivateIP } from '../src/lib/research/url-verifier';
import { WebsiteIntelligenceService } from '../src/lib/saas-intelligence/website-intelligence';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve('.env') });

async function runTests() {
  console.log('--- STARTING URL AUTOPILOT UNIT & INTEGRATION TESTS ---');

  let failed = false;

  // Test 1: Private IP detector
  console.log('\nRunning Test 1: Private IP detector...');
  const testIps = [
    { ip: '127.0.0.1', expected: true },
    { ip: '10.0.0.5', expected: true },
    { ip: '192.168.1.1', expected: true },
    { ip: '172.16.5.2', expected: true },
    { ip: '8.8.8.8', expected: false },
    { ip: '142.250.190.46', expected: false }, // Google IP
    { ip: '::1', expected: true },
    { ip: 'fe80::1', expected: true }
  ];
  for (const t of testIps) {
    const res = isPrivateIP(t.ip);
    if (res !== t.expected) {
      console.error(`❌ Test 1 Failed for ${t.ip}: got ${res}, expected ${t.expected}`);
      failed = true;
    } else {
      console.log(`✅ ${t.ip} -> ${res}`);
    }
  }

  // Test 2: URL Safety Verifier (SSRF)
  console.log('\nRunning Test 2: URL Safety Verifier (SSRF)...');
  const testUrls = [
    { url: 'http://localhost/admin', expectedSafe: false },
    { url: 'http://127.0.0.1:3000', expectedSafe: false },
    { url: 'https://192.168.0.50/setup', expectedSafe: false },
    { url: 'ftp://google.com', expectedSafe: false }, // wrong protocol
    { url: 'https://google.com', expectedSafe: true }
  ];
  for (const t of testUrls) {
    const res = await verifyUrlSafety(t.url);
    if (res.safe !== t.expectedSafe) {
      console.error(`❌ Test 2 Failed for ${t.url}: got safe=${res.safe}, expected ${t.expectedSafe}. Error: ${res.error}`);
      failed = true;
    } else {
      console.log(`✅ ${t.url} -> safe=${res.safe}`);
    }
  }

  // Test 3: Website Profile Extraction (Gemini Flash integration)
  console.log('\nRunning Test 3: Website Profile Extraction (Gemini Flash)...');
  try {
    const intelService = new WebsiteIntelligenceService();
    // Use google.com or similar public safe URL to verify extraction
    const targetUrl = 'https://example.com';
    console.log(`Crawl testing target URL: ${targetUrl}...`);
    const { profile, candidateKeywords } = await intelService.extractBusinessProfile(targetUrl);
    
    console.log('✅ Extraction succeeded!');
    console.log('Extracted Profile Name:', profile.name);
    console.log('Extracted Description:', profile.description);
    console.log('Candidate Keywords:', candidateKeywords);

    if (!profile.name || !profile.description || candidateKeywords.length < 2) {
      console.error('❌ Test 3 Failed: Extracted profile fields or candidate keywords are missing or incomplete.');
      failed = true;
    }
  } catch (err: any) {
    console.error('❌ Test 3 Failed with exception:', err.message);
    failed = true;
  }

  console.log('\n----------------------------------------');
  if (failed) {
    console.error('❌ INTEGRATION TESTS FAILED');
    process.exit(1);
  } else {
    console.log('🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY!');
  }
}

runTests();
