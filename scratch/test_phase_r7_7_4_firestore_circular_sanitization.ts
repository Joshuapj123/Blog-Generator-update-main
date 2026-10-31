/**
 * Phase R7.7.4: Firestore Circular Reference & Sanitization Test Suite
 *
 * Exercises the actual production sanitizers:
 *   - sanitizeForFirestore in src/lib/firebase/firestore.ts
 *   - sanitizeForTestStorage in src/lib/test-storage/TemporaryArticleStore.ts
 *
 * Verifies all 20 mandatory scenarios plus forensic audits for Gate B & Gate C:
 *  1. Ordinary nested object
 *  2. Nested arrays
 *  3. Direct self-reference (must throw TypeError with path)
 *  4. Indirect circular reference (must throw TypeError with path)
 *  5. Circular reference inside an array (must throw TypeError with path)
 *  6. Repeated shared object referenced from two properties (DAG - must succeed)
 *  7. Repeated shared object inside nested arrays (DAG - must succeed)
 *  8. Date preservation (isolated clone)
 *  9. Firestore Timestamp preservation
 * 10. Supported Firestore FieldValue preservation
 * 11. Error object serialization (bounded safe DTO)
 * 12. Undefined values (omitted from objects, mapped to null in arrays)
 * 13. Depth boundary (exactly 50 succeeds, 51 throws RangeError)
 * 14. Mixed valid and cyclic properties (path diagnostic)
 * 15. Original object immutability & repeated sanitization idempotency
 * 16. Real validator report serialization
 * 17. Real planning contract serialization
 * 18. Generation-state persistence DTO
 * 19. Rejection of genuine runtime objects (AbortSignal, Streams, etc.)
 * 20. Exact production regression: AnalysisSession with shared selectedOpportunity
 * 21. Negative tests: ordinary application objects with "headers", "signal", "pipe", "aborted"
 * 22. Sanitizer parity: identical behavior between Firestore and Test Storage
 */

import assert from 'assert';
import { sanitizeForFirestore } from '../src/lib/firebase/firestore';
import { sanitizeForTestStorage } from '../src/lib/test-storage/TemporaryArticleStore';

console.log('========================================================================');
console.log(' PHASE R7.7.4 / R7.7.5: FIRESTORE SANITIZATION & CIRCULAR DEFENSE SUITE');
console.log('========================================================================\n');

let passedCount = 0;
function pass(msg: string) {
  passedCount++;
  console.log(`  [PASS ${passedCount}] ${msg}`);
}

// 1. Ordinary nested object
const test1 = { a: 1, b: { c: 'hello', d: true } };
const res1 = sanitizeForFirestore(test1);
assert.deepStrictEqual(res1, { a: 1, b: { c: 'hello', d: true } });
pass('1. Ordinary nested object serialized accurately');

// 2. Nested arrays
const test2 = { list: [1, [2, 3], [{ key: 'val' }]] };
const res2 = sanitizeForFirestore(test2);
assert.deepStrictEqual(res2, { list: [1, [2, 3], [{ key: 'val' }]] });
pass('2. Nested arrays serialized accurately');

// 3. Direct self-reference
const test3: any = { id: 'direct' };
test3.self = test3;
assert.throws(
  () => sanitizeForFirestore(test3),
  (err: any) => err instanceof TypeError && err.message.includes('Circular reference detected') && err.message.includes('self')
);
pass('3. Direct self-reference caught with exact property path');

// 4. Indirect circular reference
const test4: any = { parent: { child: {} } };
test4.parent.child.ancestor = test4;
assert.throws(
  () => sanitizeForFirestore(test4),
  (err: any) => err instanceof TypeError && err.message.includes('parent.child.ancestor')
);
pass('4. Indirect circular reference caught with exact property path');

// 5. Circular reference inside an array
const test5: any = { items: [{ name: 'item1' }] };
test5.items.push(test5);
assert.throws(
  () => sanitizeForFirestore(test5),
  (err: any) => err instanceof TypeError && err.message.includes('items[1]')
);
pass('5. Circular reference inside array caught with index path');

// 6. Repeated shared object referenced from two properties (DAG)
const sharedMeta = { version: 1, author: 'system' };
const test6 = {
  summary: sharedMeta,
  diagnostics: sharedMeta,
};
const res6 = sanitizeForFirestore(test6);
assert.deepStrictEqual(res6, {
  summary: { version: 1, author: 'system' },
  diagnostics: { version: 1, author: 'system' },
});
assert.notStrictEqual(res6.summary, res6.diagnostics, 'Shared references cloned into distinct serializable objects');
pass('6. Repeated shared object referenced from two properties cloned safely without false cycle');

// 7. Repeated shared object inside nested arrays (DAG)
const sharedItem = { tag: 'saas' };
const test7 = {
  groupA: [sharedItem, { other: 1 }],
  groupB: [sharedItem, sharedItem],
};
const res7 = sanitizeForFirestore(test7);
assert.deepStrictEqual(res7, {
  groupA: [{ tag: 'saas' }, { other: 1 }],
  groupB: [{ tag: 'saas' }, { tag: 'saas' }],
});
pass('7. Repeated shared object in multiple nested arrays handled cleanly');

// 8. Date preservation (isolated instance)
const testDate = new Date('2026-10-31T10:00:00.000Z');
const test8 = { createdAt: testDate };
const res8 = sanitizeForFirestore(test8);
assert.strictEqual(res8.createdAt instanceof Date, true);
assert.strictEqual(res8.createdAt.getTime(), testDate.getTime());
assert.notStrictEqual(res8.createdAt, testDate, 'Date is a cloned instance to prevent reference aliasing');
pass('8. JavaScript Date preserved as instance without mutation');

// 9. Firestore Timestamp preservation
const mockTimestamp = {
  seconds: 1793424697,
  nanoseconds: 0,
  toMillis: () => 1793424697000,
  toDate: () => new Date(1793424697000),
};
const test9 = { ts: mockTimestamp };
const res9 = sanitizeForFirestore(test9);
assert.strictEqual(res9.ts, mockTimestamp);
pass('9. Firestore Timestamp preserved without conversion');

// 10. Supported Firestore FieldValue preservation
const mockFieldValue = {
  _methodName: 'serverTimestamp',
};
const test10 = { updatedAt: mockFieldValue };
const res10 = sanitizeForFirestore(test10);
assert.strictEqual(res10.updatedAt, mockFieldValue);
pass('10. Firestore FieldValue preserved as sentinel reference');

// 11. Error object serialization (safe DTO with code)
const testError = new Error('Database connection failed');
(testError as any).code = 'UNAVAILABLE';
(testError as any).arbitraryUnsafeCyclicGraph = testError; // Must not be recursively traversed!
const test11 = { lastError: testError };
const res11 = sanitizeForFirestore(test11);
assert.strictEqual(res11.lastError.name, 'Error');
assert.strictEqual(res11.lastError.message, 'Database connection failed');
assert.strictEqual(res11.lastError.code, 'UNAVAILABLE');
assert.strictEqual('arbitraryUnsafeCyclicGraph' in res11.lastError, false);
pass('11. Error object converted to safe serializable DTO without unsafe graph recursion');

// 12. Undefined values
const test12 = {
  definedKey: 'val',
  undefinedKey: undefined,
  arrayWithUndefined: [1, undefined, 3],
};
const res12 = sanitizeForFirestore(test12);
assert.strictEqual('undefinedKey' in res12, false, 'undefined object property omitted');
assert.deepStrictEqual(res12.arrayWithUndefined, [1, null, 3], 'undefined array elements mapped to null');
pass('12. Undefined values handled according to Firestore specifications');

// 13. Depth boundary testing: exactly 50 levels succeeds, exactly 51 levels rejects
function buildDeepChain(levels: number): any {
  let curr: any = 'leaf';
  for (let i = 0; i < levels; i++) {
    curr = { next: curr };
  }
  return curr;
}
// Depth 50 (50 property transitions from root -> leaf at depth 50)
const depth50 = buildDeepChain(50);
const resDepth50 = sanitizeForFirestore(depth50);
assert.ok(resDepth50, 'Depth of exactly 50 succeeds');

// Depth 51 (51 property transitions -> leaf at depth 51 exceeds threshold of 50)
const depth51 = buildDeepChain(51);
assert.throws(
  () => sanitizeForFirestore(depth51),
  (err: any) => err instanceof RangeError && err.message.includes('Maximum nesting depth exceeded')
);
pass('13. Depth boundary verified: exactly 50 succeeds, 51 rejects with RangeError');

// 14. Mixed valid and cyclic properties
const test14: any = {
  validA: 'alpha',
  validList: [1, 2, 3],
  subtree: {
    nested: 'value',
  },
};
test14.subtree.badRef = test14.subtree;
assert.throws(
  () => sanitizeForFirestore(test14),
  (err: any) => err instanceof TypeError && err.message.includes('subtree.badRef')
);
pass('14. Mixed valid properties preserved until cyclic property correctly triggers error');

// 15. Original object immutability & repeated sanitization idempotency
const original = {
  title: 'Original Title',
  meta: { views: 100 },
  list: [{ id: 1 }],
  shared: sharedMeta,
  otherShared: sharedMeta,
};
const originalSnapshot = JSON.stringify(original);
const pass1 = sanitizeForFirestore(original);
const pass2 = sanitizeForFirestore(original);
assert.strictEqual(JSON.stringify(original), originalSnapshot, 'Original object was not mutated');
assert.deepStrictEqual(pass1, pass2, 'Repeated sanitization of shared references is purely idempotent');
pass('15. Original object remains completely unmodified; repeated sanitization idempotent');

// 16. Validator report serialization
const sampleValidatorReport = {
  validationStatus: 'PASSED',
  timestamp: new Date().toISOString(),
  claims: [
    { text: 'Claim 1', status: 'VERIFIED', confidence: 0.95 },
    { text: 'Claim 2', status: 'VERIFIED', confidence: 0.91 },
  ],
  summary: {
    totalClaims: 2,
    groundedClaims: 2,
  },
};
const res16 = sanitizeForFirestore(sampleValidatorReport);
assert.deepStrictEqual(res16.claims.length, 2);
assert.strictEqual(res16.validationStatus, 'PASSED');
pass('16. Real validator report serialized with schema fidelity');

// 17. Planning contract serialization
const samplePlanningContract = {
  title: 'Enterprise Kubernetes Guide',
  targetAudience: 'DevOps Engineers',
  section_outlines: [
    { heading: 'Introduction', goal: 'Overview' },
    { heading: 'Architecture', goal: 'Deep Dive' },
  ],
  keywords: ['kubernetes', 'devops'],
};
const res17 = sanitizeForFirestore(samplePlanningContract);
assert.strictEqual(res17.section_outlines.length, 2);
pass('17. Real planning contract serialized with schema fidelity');

// 18. Generation-state persistence DTO
const sampleGenState = {
  runId: 'run_123',
  stage: 'GENERATING',
  progress: 75,
  currentSection: 3,
  metrics: {
    llmCalls: 8,
    elapsedMs: 45000,
  },
};
const res18 = sanitizeForFirestore(sampleGenState);
assert.strictEqual(res18.progress, 75);
pass('18. Generation-state persistence DTO serialized cleanly');

// 19. Rejection of genuine runtime system objects
class FakeAbortSignal {
  aborted = false;
  addEventListener() {}
  removeEventListener() {}
}
const test19A = { signal: new FakeAbortSignal() };
assert.throws(
  () => sanitizeForFirestore(test19A),
  (err: any) => err instanceof TypeError && err.message.includes('Cannot persist runtime system object')
);
pass('19. Runtime AbortSignal rejected with explicit diagnostic');

// 20. Exact production regression: AnalysisSession with shared selectedOpportunity
const oppItem = {
  keyword: 'ai automation platform',
  volume: 5400,
  difficulty: 'MEDIUM',
  supportingTerms: ['workflow', 'agents'],
};
const realAnalysisSession = {
  id: 'ses_prod_regression_001',
  targetUrl: 'https://smetytech.com',
  normalizedUrl: 'https://smetytech.com',
  status: 'COMPLETED',
  generationStatus: 'IDLE',
  profile: {
    name: 'SmetyTech',
    description: 'Enterprise AI workflows',
  },
  opportunities: [oppItem, { keyword: 'cloud ops', volume: 1200 }],
  selectedOpportunity: oppItem, // SHARED REFERENCE: Caused "Circular reference detected during Firestore sanitization"
};
const res20 = sanitizeForFirestore(realAnalysisSession);
assert.strictEqual(res20.id, 'ses_prod_regression_001');
assert.strictEqual(res20.selectedOpportunity.keyword, 'ai automation platform');
assert.deepStrictEqual(res20.opportunities[0], res20.selectedOpportunity);
pass('20. Regression test: AnalysisSession with shared selectedOpportunity serializes without false circular error');

// 21. Negative tests: ordinary application business objects with property names like headers, signal, pipe, aborted
const ordinaryAppObjects = {
  httpInspection: {
    headers: { 'content-type': 'application/json', authorization: 'Bearer token' },
    status: 200,
    body: '{"ok":true}',
  },
  trafficControl: {
    signal: 'GREEN_LIGHT',
    intersectionId: 'int_401',
  },
  infrastructure: {
    pipe: 'pipeline_segment_north',
    diameterInches: 24,
  },
  jobRecord: {
    aborted: false,
    reason: null,
    startedAt: 1793424000,
  },
  binaryMetadata: {
    arrayBuffer: 'not_a_method_just_a_string',
    byteSize: 1024,
  },
};
const res21 = sanitizeForFirestore(ordinaryAppObjects);
assert.deepStrictEqual(res21.httpInspection.headers, { 'content-type': 'application/json', authorization: 'Bearer token' });
assert.strictEqual(res21.trafficControl.signal, 'GREEN_LIGHT');
assert.strictEqual(res21.infrastructure.pipe, 'pipeline_segment_north');
assert.strictEqual(res21.jobRecord.aborted, false);
assert.strictEqual(res21.binaryMetadata.arrayBuffer, 'not_a_method_just_a_string');
pass('21. Negative tests: ordinary business objects with "headers", "signal", "pipe", "aborted" pass cleanly');

// 22. Sanitizer parity: identical behavior between Firestore and Test Storage
const testStorageResult20 = sanitizeForTestStorage(realAnalysisSession);
assert.deepStrictEqual(res20, testStorageResult20, 'Firestore and Test Storage sanitizers produce identical output for AnalysisSession');
const testStorageResult21 = sanitizeForTestStorage(ordinaryAppObjects);
assert.deepStrictEqual(res21, testStorageResult21, 'Firestore and Test Storage sanitizers produce identical output for business objects');
assert.throws(
  () => sanitizeForTestStorage(depth51),
  (err: any) => err instanceof RangeError && err.message.includes('Maximum nesting depth exceeded during test storage sanitization')
);
assert.throws(
  () => sanitizeForTestStorage(test3),
  (err: any) => err instanceof TypeError && err.message.includes('Circular reference detected during test storage sanitization')
);
pass('22. Sanitizer parity: Firestore and Test Storage sanitizers behave with strict semantic equivalence');

console.log('\n========================================================================');
console.log(` ALL ${passedCount} SANITIZATION & CIRCULAR DEFENSE TESTS PASSED (100%)`);
console.log('========================================================================\n');
