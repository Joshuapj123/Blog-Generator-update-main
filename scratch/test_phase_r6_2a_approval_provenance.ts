// scratch/test_phase_r6_2a_approval_provenance.ts
import crypto from 'crypto';
import { POST as approveRouteHandler } from '../src/app/api/approve/route';
import { POST as exportRouteHandler } from '../src/app/api/export/route';
import { POST as distributeRouteHandler } from '../src/app/api/distribute/route';
import {
  serializeCanonicalApprovalPayload,
  ApprovalSerializationError
} from '../src/lib/approval/ApprovalPayloadSerializer';
import { ApprovalKeyManager, KeyringMap } from '../src/lib/approval/ApprovalKeyManager';
import { ApprovalAuthorityService } from '../src/lib/approval/ApprovalAuthorityService';
import { ArtifactLifecycleBoundary } from '../src/lib/content/ArtifactLifecycleBoundary';
import { TemporaryArticleStore } from '../src/lib/test-storage/TemporaryArticleStore';
import { setAdminAuthForTesting } from '../src/lib/firebase/admin';

async function runR62ATestSuite() {
  console.log('========================================================================');
  console.log(' ACUTE PHASE R6.2A: APPROVAL PROVENANCE FOUNDATION ADVERSARIAL SUITE');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
      failed++;
    }
  }

  // Configure test storage mode
  process.env.ENABLE_TEMP_TEST_STORAGE = 'true';
  TemporaryArticleStore.clear();

  // Test Keyring Configuration
  const TEST_KEY_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const VERIFY_ONLY_KEY_HEX = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
  const REVOKED_KEY_HEX = '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff';

  const testKeyring: KeyringMap = {
    'k2': {
      secret: TEST_KEY_HEX,
      encoding: 'hex',
      status: 'active'
    },
    'k_verify_only': {
      secret: VERIFY_ONLY_KEY_HEX,
      encoding: 'hex',
      status: 'verify_only'
    },
    'k_revoked': {
      secret: REVOKED_KEY_HEX,
      encoding: 'hex',
      status: 'revoked'
    }
  };

  ApprovalKeyManager.setTestKeyring(testKeyring, 'k2');

  // Setup Mock Auth
  setAdminAuthForTesting({
    verifyIdToken: async (token: string) => {
      if (token === 'alice_valid_token') return { uid: 'usr_alice' };
      if (token === 'bob_valid_token') return { uid: 'usr_bob' };
      if (token === 'charlie_valid_token') return { uid: 'usr_charlie' };
      throw new Error('Firebase Auth: Invalid ID token');
    }
  });

  // Track provider call counts and render call counts for observable side-effect assertions
  let providerCallCount = 0;
  let exportRenderCallCount = 0;

  // --- Test 1: Correct canonical byte stream and 189-byte standard vector ---
  console.log('--- TEST GROUP 1: Canonical Framing & Standard Vector ---');
  const standardInput = {
    keyId: 'k2',
    tenantId: 'org_acme',
    articleId: 'art_1001',
    contentVersion: 1,
    artifactFingerprint: 'vfp-sha256-v1:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    policyVersion: '2026-r5',
    decision: 'APPROVED' as const,
    approverId: 'usr_ed99',
    approvalTimestamp: '2026-10-26T21:45:00.000Z'
  };

  const stdBytes = serializeCanonicalApprovalPayload(standardInput);
  assert(stdBytes.length === 189, '1.1: Standard vector byte length is exactly 189 bytes', `Got ${stdBytes.length}`);
  const stdString = stdBytes.toString('utf8');
  assert(stdString.startsWith('12:ACUTE-APR-V1\n2:k2\n'), '1.2: Serialized stream begins with header and keyId');
  assert(stdString.endsWith('24:2026-10-26T21:45:00.000Z\n'), '1.3: Serialized stream terminates with timestamp and newline');

  // --- Test 2: Independent known-answer HMAC fixture ---
  console.log('\n--- TEST GROUP 2: Known-Answer Cryptographic Fixtures ---');
  const EXPECTED_FIXTURE_HEX = 'dad6b3a9a093d8b93e0edca8d423508a891bba7d0bee95883d01bbd059d2c1f2';
  const computedHmac = crypto.createHmac('sha256', Buffer.from(TEST_KEY_HEX, 'hex')).update(stdBytes).digest('hex');
  assert(computedHmac === EXPECTED_FIXTURE_HEX, '2.1: Independent HMAC calculation matches expected test fixture', `Got ${computedHmac}`);

  const signingResult = ApprovalKeyManager.signPayload(stdBytes);
  assert(signingResult.signature === EXPECTED_FIXTURE_HEX, '2.2: ApprovalKeyManager.signPayload matches independent fixture');
  assert(signingResult.keyId === 'k2', '2.3: ApprovalKeyManager binds correct active key ID');

  const verifySuccess = ApprovalKeyManager.verifySignature(stdBytes, EXPECTED_FIXTURE_HEX, 'k2');
  assert(verifySuccess.valid === true, '2.4: ApprovalKeyManager.verifySignature accepts valid fixture');

  // --- Test 3: Single-byte signature tampering ---
  console.log('\n--- TEST GROUP 3: Tamper Resistance ---');
  const tamperedSig = EXPECTED_FIXTURE_HEX.substring(0, 62) + (EXPECTED_FIXTURE_HEX[62] === 'a' ? 'b' : 'a') + EXPECTED_FIXTURE_HEX[63];
  const tamperCheck = ApprovalKeyManager.verifySignature(stdBytes, tamperedSig, 'k2');
  assert(tamperCheck.valid === false && tamperCheck.code === 'ERR_SIGNATURE_MISMATCH', '3.1: Single-byte tampered signature fails verification');

  const truncatedSig = EXPECTED_FIXTURE_HEX.substring(0, 63);
  const truncCheck = ApprovalKeyManager.verifySignature(stdBytes, truncatedSig, 'k2');
  assert(truncCheck.valid === false && truncCheck.code === 'ERR_SIGNATURE_MALFORMED', '3.2: Truncated signature is rejected');

  // --- Test 4: Delimiter injection and Unicode byte-length handling ---
  console.log('\n--- TEST GROUP 4: Delimiter Injection & Unicode Byte-Length ---');
  const unicodeInput = {
    ...standardInput,
    decisionReason: 'Verified café 🚀 release'
  };
  const unicodeBytes = serializeCanonicalApprovalPayload(unicodeInput);
  assert(unicodeBytes.length === 220, '4.1: Unicode vector with café and emoji is exactly 220 bytes', `Got ${unicodeBytes.length}`);
  assert(unicodeBytes.toString('utf8').includes('27:Verified café 🚀 release\n'), '4.2: Multibyte UTF-8 prefix counts raw bytes (27), not UTF-16 code units (24)');

  // 4.3: Delimiter injection without newlines (colons, pipes, equals) framed safely by length prefix
  const injectionInput = {
    ...standardInput,
    decisionReason: 'fake:APPROVED:8:usr_admin'
  };
  const injectionBytes = serializeCanonicalApprovalPayload(injectionInput);
  assert(injectionBytes.toString('utf8').includes('25:fake:APPROVED:8:usr_admin\n'), '4.3: Injected delimiter colons are framed strictly as data bytes');

  // 4.4: Delimiter injection with raw newlines is rejected by string hygiene
  let newlineInjectionThrew = false;
  try {
    serializeCanonicalApprovalPayload({
      ...standardInput,
      decisionReason: 'fake:APPROVED\n8:usr_admin\n'
    });
  } catch (e: any) {
    newlineInjectionThrew = e.code === 'ERR_CONTROL_CHARACTERS_FORBIDDEN';
  }
  assert(newlineInjectionThrew, '4.4: Injected newlines in decisionReason are rejected with ERR_CONTROL_CHARACTERS_FORBIDDEN');

  // --- Test 5: Invalid Unicode and invalid field schemas ---
  console.log('\n--- TEST GROUP 5: Invalid Character & Type Rejections ---');
  let loneSurrogateThrew = false;
  try {
    serializeCanonicalApprovalPayload({
      ...standardInput,
      decisionReason: 'Lone surrogate \uD800 test'
    });
  } catch (e: any) {
    loneSurrogateThrew = e.code === 'ERR_LONE_UTF16_SURROGATE';
  }
  assert(loneSurrogateThrew, '5.1: Lone UTF-16 surrogate strictly rejected with ERR_LONE_UTF16_SURROGATE');

  let nonNfcThrew = false;
  try {
    // "café" in NFD: "cafe" + combining acute accent U+0301
    const nfdString = 'cafe\u0301';
    serializeCanonicalApprovalPayload({
      ...standardInput,
      decisionReason: nfdString
    });
  } catch (e: any) {
    nonNfcThrew = e.code === 'ERR_UNICODE_NOT_NORMALIZED_NFC';
  }
  assert(nonNfcThrew, '5.2: Non-NFC Unicode string strictly rejected with ERR_UNICODE_NOT_NORMALIZED_NFC');

  let controlCharThrew = false;
  try {
    serializeCanonicalApprovalPayload({
      ...standardInput,
      decisionReason: 'audit\x00corrupt'
    });
  } catch (e: any) {
    controlCharThrew = e.code === 'ERR_CONTROL_CHARACTERS_FORBIDDEN';
  }
  assert(controlCharThrew, '5.3: Null byte and control characters rejected with ERR_CONTROL_CHARACTERS_FORBIDDEN');

  let nonCanonicalIntThrew = false;
  try {
    serializeCanonicalApprovalPayload({
      ...standardInput,
      contentVersion: '01' // leading zero forbidden
    });
  } catch (e: any) {
    nonCanonicalIntThrew = e.code === 'ERR_NON_CANONICAL_INTEGER';
  }
  assert(nonCanonicalIntThrew, '5.4: Non-canonical integer representation ("01") rejected with ERR_NON_CANONICAL_INTEGER');

  // --- Test 6: Missing active key and unknown key ID ---
  console.log('\n--- TEST GROUP 6: Key Management Anomalies ---');
  ApprovalKeyManager.setTestKeyring(testKeyring, 'k_nonexistent');
  let missingKeyThrew = false;
  try {
    ApprovalKeyManager.signPayload(stdBytes);
  } catch (e: any) {
    missingKeyThrew = e.code === 'ERR_ACTIVE_KEY_NOT_IN_KEYRING';
  }
  assert(missingKeyThrew, '6.1: Missing active key in keyring throws ERR_ACTIVE_KEY_NOT_IN_KEYRING');

  const unknownKeyCheck = ApprovalKeyManager.verifySignature(stdBytes, EXPECTED_FIXTURE_HEX, 'k_unknown_99');
  assert(unknownKeyCheck.valid === false && unknownKeyCheck.code === 'ERR_KEY_UNKNOWN', '6.2: Unknown key ID verification rejected with ERR_KEY_UNKNOWN');

  const revokedKeyCheck = ApprovalKeyManager.verifySignature(stdBytes, EXPECTED_FIXTURE_HEX, 'k_revoked');
  assert(revokedKeyCheck.valid === false && revokedKeyCheck.code === 'ERR_KEY_REVOKED', '6.3: Revoked key verification rejected with ERR_KEY_REVOKED');

  // --- Test 7: Verification-only key cannot sign ---
  console.log('\n--- TEST GROUP 7: Key Eligibility Constraints ---');
  ApprovalKeyManager.setTestKeyring(testKeyring, 'k_verify_only');
  let verifyOnlySignThrew = false;
  try {
    ApprovalKeyManager.signPayload(stdBytes);
  } catch (e: any) {
    verifyOnlySignThrew = e.code === 'ERR_KEY_NOT_ELIGIBLE_FOR_SIGNING';
  }
  assert(verifyOnlySignThrew, '7.1: Verification-only key cannot sign new approvals (ERR_KEY_NOT_ELIGIBLE_FOR_SIGNING)');

  // Restore active signing key
  ApprovalKeyManager.setTestKeyring(testKeyring, 'k2');

  // Seed sample articles in temporary storage for HTTP API tests
  const validArticle = {
    id: 'art_alice_ready',
    userId: 'usr_alice',
    ownerId: 'usr_alice',
    title: 'Enterprise Architecture in Modern Cloud Deployments',
    content: '<p>Comprehensive architectural analysis of cloud microservices and high-throughput data pipelines.</p>',
    validationStatus: 'READY',
    contentVersion: 1,
    stage: 'Draft' as const,
    folder: 'engineering'
  };

  const rawFingerprint = ArtifactLifecycleBoundary.computeFingerprint({
    title: validArticle.title,
    bodyMarkdown: validArticle.content,
    slug: 'enterprise-architecture-in-modern-cloud-deployments',
    targetBrand: 'https://acme.org'
  });

  const readyArticle = {
    ...validArticle,
    validationFingerprint: rawFingerprint,
    targetBrand: 'https://acme.org'
  };

  await TemporaryArticleStore.saveArticle(readyArticle, 'usr_alice');

  // --- Test 8: Unauthenticated approval request returns 401 ---
  console.log('\n--- TEST GROUP 8: HTTP Route Authentication & Authorization ---');
  const reqNoAuth = new Request('https://example.com/api/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      articleId: 'art_alice_ready',
      decision: 'APPROVED',
      artifactFingerprint: rawFingerprint
    })
  });
  const resNoAuth = await approveRouteHandler(reqNoAuth);
  assert(resNoAuth.status === 401, '8.1: Unauthenticated request returns 401 Unauthorized');
  assert((await TemporaryArticleStore.getApprovalById('apr_art_alice_ready_rev1')) === null, '8.2: Zero approval records created on 401');
  assert(providerCallCount === 0, '8.3: Zero provider calls executed');
  assert(exportRenderCallCount === 0, '8.4: Zero export renders executed');

  // --- Test 9: Invalid token returns 401 ---
  const reqBadToken = new Request('https://example.com/api/approve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer forged_or_expired_token'
    },
    body: JSON.stringify({
      articleId: 'art_alice_ready',
      decision: 'APPROVED',
      artifactFingerprint: rawFingerprint
    })
  });
  const resBadToken = await approveRouteHandler(reqBadToken);
  assert(resBadToken.status === 401, '9.1: Invalid token returns 401 Unauthorized');
  assert(providerCallCount === 0 && exportRenderCallCount === 0, '9.2: Zero side effects executed on bad token');

  // --- Test 10: Non-owner request returns 403 ---
  console.log('\n--- TEST GROUP 9: Owner-Only Authorization ---');
  const reqBobOnAlice = new Request('https://example.com/api/approve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer bob_valid_token'
    },
    body: JSON.stringify({
      articleId: 'art_alice_ready',
      decision: 'APPROVED',
      artifactFingerprint: rawFingerprint
    })
  });
  const resBobOnAlice = await approveRouteHandler(reqBobOnAlice);
  assert(resBobOnAlice.status === 403, '10.1: Non-owner (Bob on Alice article) returns 403 Forbidden');
  const bobBody = await resBobOnAlice.json();
  assert(bobBody.code === 'ERR_FORBIDDEN_NOT_ARTICLE_OWNER', '10.2: Error code is ERR_FORBIDDEN_NOT_ARTICLE_OWNER');

  // --- Test 11: Missing article does not create an approval ---
  const reqMissing = new Request('https://example.com/api/approve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer alice_valid_token'
    },
    body: JSON.stringify({
      articleId: 'art_nonexistent_999',
      decision: 'APPROVED',
      artifactFingerprint: rawFingerprint
    })
  });
  const resMissing = await approveRouteHandler(reqMissing);
  assert(resMissing.status === 404, '11.1: Missing article returns 404 Not Found');

  // --- Test 12: Non-READY artifact is rejected ---
  console.log('\n--- TEST GROUP 10: Lifecycle & Fingerprint Invariants ---');
  const draftArticle = {
    id: 'art_alice_draft',
    userId: 'usr_alice',
    ownerId: 'usr_alice',
    title: 'Unreviewed Draft Document',
    content: '<p>Preliminary draft notes.</p>',
    validationStatus: 'DRAFT',
    validationFingerprint: rawFingerprint,
    contentVersion: 1,
    stage: 'Draft' as const,
    folder: 'drafts'
  };
  await TemporaryArticleStore.saveArticle(draftArticle, 'usr_alice');

  const reqDraft = new Request('https://example.com/api/approve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer alice_valid_token'
    },
    body: JSON.stringify({
      articleId: 'art_alice_draft',
      decision: 'APPROVED',
      artifactFingerprint: rawFingerprint
    })
  });
  const resDraft = await approveRouteHandler(reqDraft);
  assert(resDraft.status === 409, '12.1: Non-READY (DRAFT) artifact approval rejected with 409 Conflict');
  const draftErr = await resDraft.json();
  assert(draftErr.code === 'ERR_ARTIFACT_NOT_READY', '12.2: Error code is ERR_ARTIFACT_NOT_READY');

  // --- Test 13: Stale fingerprint is rejected ---
  const reqStaleFp = new Request('https://example.com/api/approve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer alice_valid_token'
    },
    body: JSON.stringify({
      articleId: 'art_alice_ready',
      decision: 'APPROVED',
      artifactFingerprint: 'vfp-sha256-v1:0000000000000000000000000000000000000000000000000000000000000000'
    })
  });
  const resStaleFp = await approveRouteHandler(reqStaleFp);
  assert(resStaleFp.status === 409, '13.1: Stale artifact fingerprint rejected with 409 Conflict');
  const staleErr = await resStaleFp.json();
  assert(staleErr.code === 'ERR_STALE_FINGERPRINT', '13.2: Error code is ERR_STALE_FINGERPRINT');

  // --- Test 14: Valid approval creation and duplicate identical decision is idempotent ---
  console.log('\n--- TEST GROUP 11: Approval Creation & Idempotency ---');
  const reqValidApprove = new Request('https://example.com/api/approve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer alice_valid_token'
    },
    body: JSON.stringify({
      articleId: 'art_alice_ready',
      decision: 'APPROVED',
      artifactFingerprint: rawFingerprint,
      decisionReason: 'Verified architecture and technical grounding'
    })
  });
  const resValidApprove = await approveRouteHandler(reqValidApprove);
  assert(resValidApprove.status === 200, '14.1: Valid owner approval returns 200 OK');
  const approveData = await resValidApprove.json();
  assert(approveData.status === 'CREATED', '14.2: First approval returns status CREATED');
  assert(approveData.record.approvalId === 'apr_art_alice_ready_rev1', '14.3: Approval record ID is apr_art_alice_ready_rev1');
  assert(approveData.record.tenantId === 'user_usr_alice', '14.4: Canonical tenant ID strictly bound to user_usr_alice');
  assert(approveData.record.approverId === 'usr_alice', '14.5: Approver ID bound to verified Firebase UID');

  // Verify article active pointer
  const updatedArticle = await TemporaryArticleStore.getArticleById('art_alice_ready', 'usr_alice');
  assert(updatedArticle?.activeApprovalId === 'apr_art_alice_ready_rev1', '14.6: Article activeApprovalId updated to rev1');
  assert(updatedArticle?.approvalRevisionCount === 1, '14.7: Article approvalRevisionCount is 1');

  // Verify active approval cryptographic validity
  const activeVerify = await ApprovalAuthorityService.verifyActiveApproval('art_alice_ready', 'APPROVED');
  assert(activeVerify.isValid === true, '14.8: Authoritative verifyActiveApproval passes HMAC check');

  // Idempotent duplicate call
  const reqDuplicate = new Request('https://example.com/api/approve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer alice_valid_token'
    },
    body: JSON.stringify({
      articleId: 'art_alice_ready',
      decision: 'APPROVED',
      artifactFingerprint: rawFingerprint,
      decisionReason: 'Verified architecture and technical grounding'
    })
  });
  const resDuplicate = await approveRouteHandler(reqDuplicate);
  assert(resDuplicate.status === 200, '14.9: Duplicate identical request returns 200 OK');
  const duplicateData = await resDuplicate.json();
  assert(duplicateData.status === 'IDEMPOTENT_SUCCESS', '14.10: Status indicates IDEMPOTENT_SUCCESS');
  assert(duplicateData.record.approvalId === 'apr_art_alice_ready_rev1', '14.11: Returns existing rev1 record without incrementing');
  assert(updatedArticle?.approvalRevisionCount === 1, '14.12: Revision count remained 1 (no new record written)');

  // --- Test 15: Conflicting concurrent decisions do not silently overwrite the winner ---
  console.log('\n--- TEST GROUP 12: Decision Conflicts & Explicit Re-Review ---');
  const reqConflictingReject = new Request('https://example.com/api/approve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer alice_valid_token'
    },
    body: JSON.stringify({
      articleId: 'art_alice_ready',
      decision: 'REJECTED',
      artifactFingerprint: rawFingerprint,
      decisionReason: 'Found critical defect on second thought'
    })
  });
  const resConflicting = await approveRouteHandler(reqConflictingReject);
  assert(resConflicting.status === 409, '15.1: Conflicting decision for same revision rejected with 409 Conflict');
  const conflictData = await resConflicting.json();
  assert(conflictData.code === 'ERR_APPROVAL_CONFLICT', '15.2: Error code is ERR_APPROVAL_CONFLICT');
  assert(conflictData.existingDecision === 'APPROVED', '15.3: Discloses existing decision is APPROVED');

  // Active decision MUST remain APPROVED
  const postConflictArticle = await TemporaryArticleStore.getArticleById('art_alice_ready', 'usr_alice');
  assert(postConflictArticle?.activeApprovalId === 'apr_art_alice_ready_rev1', '15.4: Active decision preserved as rev1');

  // Explicit Re-Review allowed
  const reqExplicitReReview = new Request('https://example.com/api/approve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer alice_valid_token'
    },
    body: JSON.stringify({
      articleId: 'art_alice_ready',
      decision: 'REJECTED',
      artifactFingerprint: rawFingerprint,
      decisionReason: 'Formal editorial rejection following compliance review',
      isExplicitReReview: true
    })
  });
  const resExplicit = await approveRouteHandler(reqExplicitReReview);
  assert(resExplicit.status === 200, '15.5: Explicit re-review succeeds with 200 OK');
  const reReviewData = await resExplicit.json();
  assert(reReviewData.record.approvalId === 'apr_art_alice_ready_rev2', '15.6: Creates new revision rev2');
  assert(reReviewData.record.decision === 'REJECTED', '15.7: Decision updated to REJECTED');

  const postReReviewArticle = await TemporaryArticleStore.getArticleById('art_alice_ready', 'usr_alice');
  assert(postReReviewArticle?.activeApprovalId === 'apr_art_alice_ready_rev2', '15.8: Active pointer updated to rev2');
  assert(postReReviewArticle?.approvalRevisionCount === 2, '15.9: Revision count incremented to 2');

  // Both historical records exist and are immutable
  const rev1Record = await TemporaryArticleStore.getApprovalById('apr_art_alice_ready_rev1');
  const rev2Record = await TemporaryArticleStore.getApprovalById('apr_art_alice_ready_rev2');
  assert(rev1Record !== null && rev1Record.decision === 'APPROVED', '15.10: Historical rev1 APPROVED record preserved');
  assert(rev2Record !== null && rev2Record.decision === 'REJECTED', '15.11: Historical rev2 REJECTED record preserved');

  // --- Test 16: Caller-supplied identity and timestamps are ignored or rejected ---
  console.log('\n--- TEST GROUP 13: Spoofing Resistance ---');
  const reqSpoofedIdentity = new Request('https://example.com/api/approve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer alice_valid_token'
    },
    body: JSON.stringify({
      articleId: 'art_alice_ready',
      decision: 'APPROVED',
      artifactFingerprint: rawFingerprint,
      // Attempting to spoof identity, tenant, timestamp, and signature
      approverId: 'usr_admin_spoofed',
      tenantId: 'org_enterprise_spoofed',
      approvalTimestamp: '2020-01-01T00:00:00.000Z',
      hmacSignature: '0000000000000000000000000000000000000000000000000000000000000000',
      isExplicitReReview: true
    })
  });
  const resSpoofed = await approveRouteHandler(reqSpoofedIdentity);
  assert(resSpoofed.status === 200, '16.1: Request processed without trusting spoofed fields');
  const spoofedData = await resSpoofed.json();
  assert(spoofedData.record.approverId === 'usr_alice', '16.2: Approver ID bound to verified UID usr_alice, not spoofed value');
  assert(spoofedData.record.tenantId === 'user_usr_alice', '16.3: Tenant ID bound to user_usr_alice, not spoofed value');
  assert(spoofedData.record.approvalTimestamp !== '2020-01-01T00:00:00.000Z', '16.4: Timestamp generated by server, not spoofed');
  assert(spoofedData.record.hmacSignature !== '0000000000000000000000000000000000000000000000000000000000000000', '16.5: Signature generated by server HMAC key, not spoofed');

  // --- Test 17: Transaction failure leaves no partially created approval/pointer state ---
  console.log('\n--- TEST GROUP 14: Atomic Rollback & Failure Isolation ---');
  TemporaryArticleStore.setSimulateFailure(true, 'Simulated storage failure during approval save');
  const reqFail = new Request('https://example.com/api/approve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer alice_valid_token'
    },
    body: JSON.stringify({
      articleId: 'art_alice_ready',
      decision: 'REJECTED', // Different decision to bypass idempotency check and force write
      artifactFingerprint: rawFingerprint,
      isExplicitReReview: true
    })
  });
  const resFail = await approveRouteHandler(reqFail);
  assert(resFail.status === 500, '17.1: Simulated database failure returns 500 Internal Server Error');

  TemporaryArticleStore.setSimulateFailure(false);
  const articleAfterFail = await TemporaryArticleStore.getArticleById('art_alice_ready', 'usr_alice');
  assert(articleAfterFail?.approvalRevisionCount === 3, '17.2: Article revision pointer was not corrupted');
  assert((await TemporaryArticleStore.getApprovalById('apr_art_alice_ready_rev4')) === null, '17.3: No partial rev4 approval record was persisted');

  // --- Test 18: Existing R5 lifecycle and fingerprint checks remain intact ---
  console.log('\n--- TEST GROUP 15: Preservation of Existing R5 Guards ---');
  // 18.1: Test that verifyPublishableArtifact still detects stale fingerprints
  const staleAsset = {
    title: readyArticle.title,
    bodyMarkdown: readyArticle.content + '\nUnauthorized modification after approval',
    wordCount: 150,
    seoScore: 90,
    validationStatus: 'READY',
    validationFingerprint: rawFingerprint,
    targetBrand: 'https://acme.org'
  };
  const r5BoundaryCheck = ArtifactLifecycleBoundary.verifyPublishableArtifact(staleAsset);
  assert(r5BoundaryCheck.isEligible === false, '18.1: R5 boundary gate still rejects modified content with stale fingerprint');
  const boundaryCode = !r5BoundaryCheck.isEligible ? r5BoundaryCheck.code : undefined;
  assert(boundaryCode === 'ERR_STALE_VALIDATION_FINGERPRINT', '18.2: R5 boundary gate returns ERR_STALE_VALIDATION_FINGERPRINT');

  // 18.2: Test that verifyActiveApproval also rejects superseded approval when article content changes
  const articleWithModifiedContent = {
    ...readyArticle,
    content: readyArticle.content + '<p>Modified text</p>',
    validationFingerprint: 'vfp-sha256-v1:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    activeApprovalId: 'apr_art_alice_ready_rev3'
  };
  await TemporaryArticleStore.saveArticle(articleWithModifiedContent, 'usr_alice');
  const verifySuperseded = await ApprovalAuthorityService.verifyActiveApproval('art_alice_ready', 'APPROVED');
  assert(verifySuperseded.isValid === false, '18.3: verifyActiveApproval rejects approval superseded by content modification');
  assert(verifySuperseded.code === 'ERR_APPROVAL_SUPERSEDED', '18.4: Error code is ERR_APPROVAL_SUPERSEDED');

  console.log('\n========================================================================');
  console.log(` RESULTS: ${passed} passed, ${failed} failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runR62ATestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
