#!/usr/bin/env node
/**
 * Google Ads OAuth2 Refresh Token Generator
 * Run: node get-refresh-token.js
 * 
 * Prerequisites:
 *   npm install -g open   (optional, for auto-opening browser)
 * 
 * Paste your client_id and client_secret from Google Cloud Console below.
 */

const https = require('https');
const http = require('http');
const { execSync } = require('child_process');
const readline = require('readline');

// ─── FILL THESE IN ────────────────────────────────────────────────────────────
const CLIENT_ID = process.env.CLIENT_ID || 'PASTE_YOUR_CLIENT_ID_HERE';
const CLIENT_SECRET = process.env.CLIENT_SECRET || 'PASTE_YOUR_CLIENT_SECRET_HERE';
// ──────────────────────────────────────────────────────────────────────────────

const REDIRECT_URI = 'http://localhost:9999/callback';
const SCOPE = 'https://www.googleapis.com/auth/adwords';

const authUrl =
  `https://accounts.google.com/o/oauth2/v2/auth` +
  `?client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPE)}` +
  `&access_type=offline` +
  `&prompt=consent`;

console.log('\n╔══════════════════════════════════════════════════════╗');
console.log('║  Google Ads API — Refresh Token Generator            ║');
console.log('╚══════════════════════════════════════════════════════╝\n');

if (CLIENT_ID === 'PASTE_YOUR_CLIENT_ID_HERE') {
  console.error('❌  Please set CLIENT_ID and CLIENT_SECRET at the top of this file.\n');
  process.exit(1);
}

// Start local callback server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:9999`);
  if (url.pathname !== '/callback') return;
  
  const code = url.searchParams.get('code');
  if (!code) {
    res.end('No code received. Close this tab and try again.');
    return;
  }
  
  res.end('<h2 style="font-family:sans-serif;color:green">✅ Authorization successful! Return to your terminal.</h2>');
  server.close();

  // Exchange code for refresh token
  console.log('\n✅  Authorization code received. Exchanging for refresh token...\n');

  const postData = new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
  }).toString();

  const options = {
    hostname: 'oauth2.googleapis.com',
    port: 443,
    path: '/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData),
    },
  };

  const tokenReq = https.request(options, (tokenRes) => {
    let body = '';
    tokenRes.on('data', (chunk) => (body += chunk));
    tokenRes.on('end', () => {
      const data = JSON.parse(body);
      if (data.error) {
        console.error('❌  Error:', data.error_description || data.error);
        process.exit(1);
      }
      console.log('═══════════════════════════════════════════════════════');
      console.log('  ✅  SUCCESS — Add these to your .env file:');
      console.log('═══════════════════════════════════════════════════════\n');
      console.log(`  GOOGLE_ADS_CLIENT_ID=${CLIENT_ID}`);
      console.log(`  GOOGLE_ADS_CLIENT_SECRET=${CLIENT_SECRET}`);
      console.log(`  GOOGLE_ADS_REFRESH_TOKEN=${data.refresh_token}\n`);
      console.log('═══════════════════════════════════════════════════════');
      console.log('  Also add:');
      console.log('  GOOGLE_ADS_DEVELOPER_TOKEN=<your developer token>');
      console.log('  GOOGLE_ADS_CUSTOMER_ID=<your-ads-account-id>');
      console.log('═══════════════════════════════════════════════════════\n');
    });
  });

  tokenReq.on('error', (e) => console.error('Request error:', e));
  tokenReq.write(postData);
  tokenReq.end();
});

server.listen(9999, () => {
  console.log('📋  Opening browser for Google authorization...\n');
  console.log('   If the browser doesn\'t open, paste this URL manually:');
  console.log(`   ${authUrl}\n`);
  
  // Try to open browser cross-platform
  try {
    execSync(`open "${authUrl}"`);
  } catch {
    try {
      execSync(`xdg-open "${authUrl}"`);
    } catch {
      // User needs to open manually
    }
  }

  console.log('⏳  Waiting for authorization (browser should have opened)...');
  console.log('   Sign in and click "Allow" when prompted.\n');
});
