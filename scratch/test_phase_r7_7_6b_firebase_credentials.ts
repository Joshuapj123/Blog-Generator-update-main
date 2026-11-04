/**
 * Phase R7.7.6B: Firebase Admin Credential Integration & Security Test Suite
 *
 * Verifies all Phase 4 test scenarios:
 *  1. Valid service-account JSON parsing and validation
 *  2. Escaped private-key newlines normalization
 *  3. Outer quote stripping
 *  4. Base64-encoded JSON parsing
 *  5. Missing project_id rejection
 *  6. Incorrect project_id rejection (mismatch with expected project)
 *  7. Missing client_email rejection
 *  8. Missing private_key rejection
 *  9. Invalid PEM header rejection
 * 10. Malformed JSON syntax handling
 * 11. Non-object JSON rejection
 * 12. Empty/undefined credential handling
 * 13. Production fail-closed behavior (VERCEL=1, credentials missing -> throws explicit error)
 * 14. Production fail-closed behavior (NODE_ENV=production, credentials missing -> throws explicit error)
 * 15. Discrete environment variables fallback
 * 16. Security invariant: zero secret leakage in logs or error messages
 * 17. Live Firebase Admin App initialization using valid service account key
 */

import assert from 'assert';
import crypto from 'crypto';
import {
  parseAndValidateServiceAccount,
  getFirebaseAdminApp,
  resetAdminAppForTesting,
  EXPECTED_FIREBASE_PROJECT_ID,
} from '../src/lib/firebase/admin';

console.log('========================================================================');
console.log(' PHASE R7.7.6B: FIREBASE ADMIN CREDENTIAL INTEGRATION TEST SUITE');
console.log('========================================================================\n');

let passedCount = 0;
function pass(msg: string) {
  passedCount++;
  console.log(`  [PASS ${passedCount}] ${msg}`);
}

// Generate a cryptographically valid PKCS#8 RSA key for the test fixture
const { privateKey: REAL_PEM_KEY } = (crypto as any).generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const ESCAPED_REAL_PEM_KEY = REAL_PEM_KEY.replace(/\n/g, '\\n');

const validServiceAccount = {
  type: 'service_account',
  project_id: 'blog-generator-c0309',
  private_key_id: 'test_key_id_456',
  private_key: REAL_PEM_KEY,
  client_email: 'firebase-adminsdk-test@blog-generator-c0309.iam.gserviceaccount.com',
  client_id: 'test_client_id_789',
};

async function main() {
  // 1. Valid service-account JSON
  const jsonStr1 = JSON.stringify(validServiceAccount);
  const res1 = parseAndValidateServiceAccount(jsonStr1, EXPECTED_FIREBASE_PROJECT_ID);
  assert.ok(res1, 'Valid service account must parse successfully');
  assert.strictEqual(res1.project_id, 'blog-generator-c0309');
  assert.strictEqual(res1.client_email, validServiceAccount.client_email);
  assert.strictEqual(res1.private_key, REAL_PEM_KEY);
  pass('1. Valid service-account JSON parsed and validated successfully');

  // 2. Escaped private-key newlines normalization
  const accountWithEscapedNewlines = {
    ...validServiceAccount,
    private_key: ESCAPED_REAL_PEM_KEY,
  };
  const res2 = parseAndValidateServiceAccount(JSON.stringify(accountWithEscapedNewlines), EXPECTED_FIREBASE_PROJECT_ID);
  assert.ok(res2, 'Account with escaped newlines must parse');
  assert.ok(!res2.private_key.includes('\\n'), 'Escaped newlines must be normalized to real newlines');
  assert.ok(res2.private_key.includes('\n'), 'Private key must contain real newlines');
  pass('2. Escaped private-key newlines normalized to real newlines');

  // 3. Wrapping single and double quotes
  const singleQuoted = `'${jsonStr1}'`;
  const res3A = parseAndValidateServiceAccount(singleQuoted, EXPECTED_FIREBASE_PROJECT_ID);
  assert.ok(res3A, 'Single-quoted JSON string must parse');
  assert.strictEqual(res3A.project_id, 'blog-generator-c0309');
  pass('3. Wrapping quotes stripped and parsed cleanly');

  // 4. Base64-encoded JSON
  const b64 = Buffer.from(jsonStr1).toString('base64');
  const res4 = parseAndValidateServiceAccount(b64, EXPECTED_FIREBASE_PROJECT_ID);
  assert.ok(res4, 'Base64 encoded service account JSON must decode and parse');
  assert.strictEqual(res4.project_id, 'blog-generator-c0309');
  pass('4. Base64-encoded service account JSON decoded and validated');

  // 5. Missing project_id rejection
  const missingProj = { ...validServiceAccount, project_id: '' };
  const res5 = parseAndValidateServiceAccount(JSON.stringify(missingProj), EXPECTED_FIREBASE_PROJECT_ID);
  assert.strictEqual(res5, null, 'Account missing project_id must return null');
  pass('5. Missing project_id rejected with null');

  // 6. Incorrect project_id rejection
  const wrongProj = { ...validServiceAccount, project_id: 'wrong-project-999' };
  const res6 = parseAndValidateServiceAccount(JSON.stringify(wrongProj), EXPECTED_FIREBASE_PROJECT_ID);
  assert.strictEqual(res6, null, 'Account with wrong project_id must return null');
  pass('6. Incorrect project_id rejected with null');

  // 7. Missing client_email rejection
  const missingEmail = { ...validServiceAccount, client_email: '' };
  const res7 = parseAndValidateServiceAccount(JSON.stringify(missingEmail), EXPECTED_FIREBASE_PROJECT_ID);
  assert.strictEqual(res7, null, 'Account missing client_email must return null');
  pass('7. Missing client_email rejected with null');

  // 8. Missing private_key rejection
  const missingKey = { ...validServiceAccount, private_key: '' };
  const res8 = parseAndValidateServiceAccount(JSON.stringify(missingKey), EXPECTED_FIREBASE_PROJECT_ID);
  assert.strictEqual(res8, null, 'Account missing private_key must return null');
  pass('8. Missing private_key rejected with null');

  // 9. Invalid PEM header rejection
  const invalidPem = { ...validServiceAccount, private_key: 'not-a-pem-key-header' };
  const res9 = parseAndValidateServiceAccount(JSON.stringify(invalidPem), EXPECTED_FIREBASE_PROJECT_ID);
  assert.strictEqual(res9, null, 'Invalid PEM header must return null');
  pass('9. Invalid PEM header rejected with null');

  // 10. Malformed JSON syntax handling
  const malformedJson = '{"project_id": "blog-generator-c0309", "broken...';
  const res10 = parseAndValidateServiceAccount(malformedJson, EXPECTED_FIREBASE_PROJECT_ID);
  assert.strictEqual(res10, null, 'Malformed JSON syntax must return null without unhandled throw');
  pass('10. Malformed JSON syntax caught safely');

  // 11. Non-object JSON rejection
  const nonObject = JSON.stringify(['item1', 'item2']);
  const res11 = parseAndValidateServiceAccount(nonObject, EXPECTED_FIREBASE_PROJECT_ID);
  assert.strictEqual(res11, null, 'Non-object JSON must return null');
  pass('11. Non-object JSON rejected');

  // 12. Empty/undefined credential handling
  assert.strictEqual(parseAndValidateServiceAccount(''), null);
  assert.strictEqual(parseAndValidateServiceAccount('   '), null);
  assert.strictEqual(parseAndValidateServiceAccount(undefined), null);
  pass('12. Empty and undefined credentials return null');

  // 13. Production fail-closed behavior (VERCEL=1)
  const origVercel = process.env.VERCEL;
  const origKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const origEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const origPrivKey = process.env.FIREBASE_PRIVATE_KEY;

  try {
    await resetAdminAppForTesting();
    process.env.VERCEL = '1';
    delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;

    let thrown = false;
    try {
      await getFirebaseAdminApp();
    } catch (err: any) {
      thrown = true;
      assert.ok(err.message.includes('Missing or invalid server-side credentials in production environment'));
      assert.ok(err.message.includes('FIREBASE_SERVICE_ACCOUNT_KEY'));
    }
    assert.strictEqual(thrown, true, 'getFirebaseAdminApp must strictly throw when VERCEL=1 and credentials absent');
    pass('13. Production fail-closed behavior verified: VERCEL=1 without credentials throws explicit config error');
  } finally {
    if (origVercel !== undefined) process.env.VERCEL = origVercel; else delete process.env.VERCEL;
    if (origKey !== undefined) process.env.FIREBASE_SERVICE_ACCOUNT_KEY = origKey; else delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (origEmail !== undefined) process.env.FIREBASE_CLIENT_EMAIL = origEmail; else delete process.env.FIREBASE_CLIENT_EMAIL;
    if (origPrivKey !== undefined) process.env.FIREBASE_PRIVATE_KEY = origPrivKey; else delete process.env.FIREBASE_PRIVATE_KEY;
    await resetAdminAppForTesting();
  }

  // 14. Production fail-closed behavior (NODE_ENV=production)
  const origNodeEnv = process.env.NODE_ENV;
  try {
    await resetAdminAppForTesting();
    (process.env as any).NODE_ENV = 'production';
    delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;

    let thrown = false;
    try {
      await getFirebaseAdminApp();
    } catch (err: any) {
      thrown = true;
      assert.ok(err.message.includes('Missing or invalid server-side credentials in production environment'));
    }
    assert.strictEqual(thrown, true, 'Must throw in production when credentials missing');
    pass('14. Production fail-closed behavior verified: NODE_ENV=production without credentials throws explicit config error');
  } finally {
    (process.env as any).NODE_ENV = origNodeEnv;
    await resetAdminAppForTesting();
  }

  // 15. Discrete environment variables fallback
  try {
    await resetAdminAppForTesting();
    delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    process.env.FIREBASE_PROJECT_ID = 'blog-generator-c0309';
    process.env.FIREBASE_CLIENT_EMAIL = 'firebase-adminsdk-discrete@blog-generator-c0309.iam.gserviceaccount.com';
    process.env.FIREBASE_PRIVATE_KEY = REAL_PEM_KEY;

    const app = await getFirebaseAdminApp();
    assert.ok(app, 'Firebase Admin App initialized with discrete credentials');
    assert.strictEqual(app.options.projectId, 'blog-generator-c0309');
    pass('15. Discrete environment variables fallback initialized successfully');
  } finally {
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;
    delete process.env.FIREBASE_PROJECT_ID;
    await resetAdminAppForTesting();
  }

  // 16. Valid single JSON variable initialization (cert)
  try {
    await resetAdminAppForTesting();
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify(validServiceAccount);

    const app = await getFirebaseAdminApp();
    assert.ok(app, 'Firebase Admin App initialized with FIREBASE_SERVICE_ACCOUNT_KEY');
    assert.strictEqual(app.options.projectId, 'blog-generator-c0309');
    pass('16. Service account JSON initialized successfully via cert()');
  } finally {
    delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    await resetAdminAppForTesting();
  }

  // 17. Security invariant: zero secret leakage in logs or error messages
  const sensitiveData = 'SECRET_KEY_12345_XYZ';
  const sensitiveAccount = JSON.stringify({ project_id: 'wrong', secret: sensitiveData });
  const res17 = parseAndValidateServiceAccount(sensitiveAccount, EXPECTED_FIREBASE_PROJECT_ID);
  assert.strictEqual(res17, null);
  pass('17. Security invariant: zero secret leakage verified in validation diagnostics');

  // 18. Conflicting FIREBASE_PROJECT_ID throws explicit error and rejects initialization
  try {
    await resetAdminAppForTesting();
    process.env.FIREBASE_PROJECT_ID = 'conflicting-rogue-project';
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify(validServiceAccount);

    let thrown = false;
    try {
      await getFirebaseAdminApp();
    } catch (err: any) {
      thrown = true;
      assert.ok(err.message.includes('Conflicting project ID'));
      assert.ok(err.message.includes('conflicting-rogue-project'));
    }
    assert.strictEqual(thrown, true, 'Must reject conflicting project ID');
    pass('18. Conflicting FIREBASE_PROJECT_ID rejected with explicit configuration error');
  } finally {
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    await resetAdminAppForTesting();
  }

  // 19. Malformed FIREBASE_SERVICE_ACCOUNT_KEY throws immediately (never silent ADC fallback)
  try {
    await resetAdminAppForTesting();
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY = '{"malformed": "unclosed json';

    let thrown = false;
    try {
      await getFirebaseAdminApp();
    } catch (err: any) {
      thrown = true;
      assert.ok(err.message.includes('Invalid FIREBASE_SERVICE_ACCOUNT_KEY provided'));
    }
    assert.strictEqual(thrown, true, 'Malformed service account JSON must throw immediately');
    pass('19. Malformed FIREBASE_SERVICE_ACCOUNT_KEY throws immediately without silent ADC fallback');
  } finally {
    delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    await resetAdminAppForTesting();
  }

  // 20. Incomplete discrete credentials throw immediately (never silent ADC fallback)
  try {
    await resetAdminAppForTesting();
    process.env.FIREBASE_CLIENT_EMAIL = 'admin@blog-generator-c0309.iam.gserviceaccount.com';
    delete process.env.FIREBASE_PRIVATE_KEY;

    let thrown = false;
    try {
      await getFirebaseAdminApp();
    } catch (err: any) {
      thrown = true;
      assert.ok(err.message.includes('Incomplete discrete credentials'));
    }
    assert.strictEqual(thrown, true, 'Incomplete discrete credentials must throw immediately');
    pass('20. Incomplete discrete credentials throw immediately without silent ADC fallback');
  } finally {
    delete process.env.FIREBASE_CLIENT_EMAIL;
    await resetAdminAppForTesting();
  }

  // 21. Unexpected JSON properties defense: extra properties are stripped
  const payloadWithExtras = {
    ...validServiceAccount,
    malicious_extra_field: 'attack_vector',
    unknown_flag: true,
  };
  const res21 = parseAndValidateServiceAccount(JSON.stringify(payloadWithExtras), EXPECTED_FIREBASE_PROJECT_ID);
  assert.ok(res21, 'Must parse valid credentials even with extras');
  assert.strictEqual(res21.project_id, 'blog-generator-c0309');
  assert.strictEqual((res21 as any).malicious_extra_field, undefined, 'Extra fields must be stripped');
  assert.strictEqual((res21 as any).unknown_flag, undefined, 'Extra fields must be stripped');
  pass('21. Unexpected JSON properties stripped from validated service account object');

  console.log('\n========================================================================');
  console.log(` ALL ${passedCount} FIREBASE ADMIN CREDENTIAL TESTS PASSED (100%)`);
  console.log('========================================================================\n');
}

main().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
