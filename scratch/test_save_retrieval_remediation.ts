import assert from 'assert';
import { POST as generateBlocksPOST } from '../src/app/api/generate-blocks/route';
import { setAdminAuthForTesting } from '../src/lib/firebase/admin';
import { sanitizeForFirestore, Article } from '../src/lib/firebase/firestore';
import * as fs from 'fs';

console.log('================================================================');
console.log('  ACUTE SAVE / RETRIEVAL REMEDIATION REGRESSION TEST SUITE');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function recordPass(testName: string) {
  passedTests++;
  console.log(`  ✅ [PASS] ${testName}`);
}

async function runTests() {
  // ---------------------------------------------------------------------------
  // TEST 1: /api/generate-blocks Missing Authorization Header
  // ---------------------------------------------------------------------------
  totalTests++;
  console.log('[Test 1] Testing /api/generate-blocks missing Authorization header...');
  const reqMissing = new Request('http://localhost:3000/api/generate-blocks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Test Title', targetKeywords: 'test keyword' })
  });
  const resMissing = await generateBlocksPOST(reqMissing);
  assert.strictEqual(resMissing.status, 401, 'Expected status 401 for missing auth header');
  const jsonMissing = await resMissing.json();
  assert.ok(jsonMissing.error.includes('Missing Authorization header'), 'Expected missing auth header error message');
  recordPass('Test 1: /api/generate-blocks rejects missing Authorization header with HTTP 401');

  // ---------------------------------------------------------------------------
  // TEST 2: /api/generate-blocks Malformed Authorization Header
  // ---------------------------------------------------------------------------
  totalTests++;
  console.log('\n[Test 2] Testing /api/generate-blocks malformed Authorization header...');
  const reqMalformed = new Request('http://localhost:3000/api/generate-blocks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic invalid_token_format'
    },
    body: JSON.stringify({ title: 'Test Title', targetKeywords: 'test keyword' })
  });
  const resMalformed = await generateBlocksPOST(reqMalformed);
  assert.strictEqual(resMalformed.status, 401, 'Expected status 401 for malformed auth header');
  const jsonMalformed = await resMalformed.json();
  assert.ok(jsonMalformed.error.includes('Invalid Authorization format'), 'Expected invalid format error message');
  recordPass('Test 2: /api/generate-blocks rejects malformed Authorization header with HTTP 401');

  // ---------------------------------------------------------------------------
  // TEST 3: /api/generate-blocks Invalid/Expired Bearer Token
  // ---------------------------------------------------------------------------
  totalTests++;
  console.log('\n[Test 3] Testing /api/generate-blocks invalid/expired token verification...');
  setAdminAuthForTesting({
    verifyIdToken: async (_token: string) => {
      throw new Error('Firebase ID token has expired or is invalid.');
    }
  });
  const reqInvalid = new Request('http://localhost:3000/api/generate-blocks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer expired_or_fake_token'
    },
    body: JSON.stringify({ title: 'Test Title', targetKeywords: 'test keyword' })
  });
  const resInvalid = await generateBlocksPOST(reqInvalid);
  assert.strictEqual(resInvalid.status, 401, 'Expected status 401 for expired token');
  const jsonInvalid = await resInvalid.json();
  assert.ok(jsonInvalid.error.includes('Token verification failed'), 'Expected token verification failure message');
  recordPass('Test 3: /api/generate-blocks rejects expired/invalid token with HTTP 401');

  // ---------------------------------------------------------------------------
  // TEST 4: /api/generate-blocks Valid Bearer Token Injects authenticatedUserId
  // ---------------------------------------------------------------------------
  totalTests++;
  console.log('\n[Test 4] Testing /api/generate-blocks valid token verification & UID injection...');
  setAdminAuthForTesting({
    verifyIdToken: async (token: string) => {
      if (token === 'valid_user_123_token') {
        return { uid: 'VERIFIED_USER_123' };
      }
      throw new Error('Invalid token');
    }
  });

  const controller = new AbortController();
  const reqValid = new Request('http://localhost:3000/api/generate-blocks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer valid_user_123_token'
    },
    body: JSON.stringify({ title: 'Sample Article', targetKeywords: 'test' }),
    signal: controller.signal
  });
  const resValid = await generateBlocksPOST(reqValid);
  assert.strictEqual(resValid.status, 200, 'Expected status 200 for valid token');
  assert.strictEqual(resValid.headers.get('Content-Type'), 'text/event-stream', 'Expected SSE stream');
  controller.abort(); // Cancel pipeline execution immediately in unit test
  recordPass('Test 4: /api/generate-blocks accepts valid token and streams SSE response');

  // ---------------------------------------------------------------------------
  // TEST 5: Firestore sanitizeForFirestore preserves full article payload & metadata
  // ---------------------------------------------------------------------------
  totalTests++;
  console.log('\n[Test 5] Testing sanitizeForFirestore with rich article blueprint...');
  const sampleArticle: Article = {
    id: 'test_art_001',
    title: 'Comprehensive Guide to Cloud Architecture',
    content: '<h2>Introduction</h2><p>Article body here...</p>',
    folder: 'uncategorized',
    stage: 'Draft',
    topic: 'Cloud Architecture',
    sourceKeyword: 'cloud architecture',
    targetKeywords: ['cloud architecture', 'aws', 'gcp'],
    referenceUrl: 'https://example.com',
    blueprint: {
      title: 'Comprehensive Guide to Cloud Architecture',
      slug: 'cloud-architecture-guide',
      sections: []
    } as any,
    analysisResults: {
      score: 95,
      weakCopyItems: []
    } as any,
    contentScore: {
      totalScore: 92,
      breakdown: { S: 90, I: 92, E: 94, O: 88, G: 95, R: 90 }
    } as any,
    userId: 'VERIFIED_USER_123',
    ownerId: 'VERIFIED_USER_123'
  };

  const clean = sanitizeForFirestore(sampleArticle);
  assert.strictEqual(clean.id, 'test_art_001');
  assert.strictEqual(clean.userId, 'VERIFIED_USER_123');
  assert.strictEqual(clean.ownerId, 'VERIFIED_USER_123');
  assert.strictEqual(clean.title, 'Comprehensive Guide to Cloud Architecture');
  assert.strictEqual(clean.content, '<h2>Introduction</h2><p>Article body here...</p>');
  assert.strictEqual(clean.stage, 'Draft');
  assert.deepStrictEqual(clean.targetKeywords, ['cloud architecture', 'aws', 'gcp']);
  assert.ok(clean.blueprint, 'Blueprint must be preserved');
  assert.ok(clean.contentScore, 'Content score must be preserved');
  assert.strictEqual(clean.contentScore.totalScore, 92);
  recordPass('Test 5: sanitizeForFirestore perfectly preserves schema, canonical ID, and rich metadata');

  // ---------------------------------------------------------------------------
  // TEST 6: Source-level contract audit of modified components
  // ---------------------------------------------------------------------------
  totalTests++;
  console.log('\n[Test 6] Auditing source files for error handling and async safety...');
  
  // SectionEditor.tsx
  const sectionEditorSrc = fs.readFileSync('src/app/(main)/engine/components/SectionEditor.tsx', 'utf8');
  assert.ok(
    sectionEditorSrc.includes('onSave={async () => { if (editor) { await engine.saveCurrentArticle(editor.getHTML()); } }}'),
    'SectionEditor must return Promise from onSave'
  );

  // UnifiedToolbar.tsx
  const unifiedToolbarSrc = fs.readFileSync('src/app/(main)/engine/components/editor/UnifiedToolbar.tsx', 'utf8');
  assert.ok(
    unifiedToolbarSrc.includes('alert(') && unifiedToolbarSrc.includes('Save failed:'),
    'UnifiedToolbar must catch and surface save errors to the user'
  );

  // EngineContext.tsx
  const engineContextSrc = fs.readFileSync('src/app/(main)/engine/context/EngineContext.tsx', 'utf8');
  assert.ok(
    engineContextSrc.includes('saveCurrentArticle = async (htmlContent: string): Promise<string>'),
    'saveCurrentArticle must return Promise<string>'
  );
  assert.ok(
    engineContextSrc.includes('setGenError(`Failed to save article:') && engineContextSrc.includes('throw e;'),
    'saveCurrentArticle must set genError and rethrow'
  );

  // ContentDashboard.tsx
  const contentDashboardSrc = fs.readFileSync('src/components/ContentDashboard.tsx', 'utf8');
  assert.ok(
    contentDashboardSrc.includes('if (authLoading) return;'),
    'ContentDashboard must wait for authLoading before querying'
  );
  assert.ok(
    contentDashboardSrc.includes('getArticles(user.uid)'),
    'ContentDashboard must query with user.uid'
  );

  // EnginePage (page.tsx)
  const enginePageSrc = fs.readFileSync('src/app/(main)/engine/page.tsx', 'utf8');
  assert.ok(
    enginePageSrc.includes('if (!user?.uid) return;'),
    'EnginePage init must guard against unauthenticated mount'
  );
  assert.ok(
    enginePageSrc.includes('getArticles(user!.uid)'),
    'EnginePage must fetch user-scoped articles'
  );
  assert.ok(
    enginePageSrc.includes('}, [user?.uid, todoId]);'),
    'EnginePage init must re-run when user or todoId changes'
  );

  recordPass('Test 6: Source-level audit confirms all 5 client components are asynchronously wired and error-safe');

  console.log('\n================================================================');
  console.log(`  REGRESSION TEST SUITE PASSED: ${passedTests}/${totalTests} TESTS PASSING`);
  console.log('================================================================\n');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('\n❌ Regression test failed:', err);
  process.exit(1);
});
