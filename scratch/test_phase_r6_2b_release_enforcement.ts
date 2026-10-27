// scratch/test_phase_r6_2b_release_enforcement.ts
import crypto from 'crypto';
import { POST as approveRouteHandler } from '../src/app/api/approve/route';
import { POST as exportRouteHandler } from '../src/app/api/export/route';
import { POST as distributeRouteHandler } from '../src/app/api/distribute/route';
import { serializeCanonicalApprovalPayload } from '../src/lib/approval/ApprovalPayloadSerializer';
import { ApprovalKeyManager, KeyringMap } from '../src/lib/approval/ApprovalKeyManager';
import { ApprovalAuthorityService } from '../src/lib/approval/ApprovalAuthorityService';
import { ArtifactLifecycleBoundary } from '../src/lib/content/ArtifactLifecycleBoundary';
import { TemporaryArticleStore } from '../src/lib/test-storage/TemporaryArticleStore';
import { setAdminAuthForTesting } from '../src/lib/firebase/admin';
import type { Article } from '../src/lib/firebase/firestore';

async function runR62BTestSuite() {
  console.log('========================================================================');
  console.log(' ACUTE PHASE R6.2B: APPROVAL-ENFORCED RELEASE ADVERSARIAL SUITE');
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
  process.env.ENABLE_DISTRIBUTION_DRY_RUN = 'true';
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
      throw new Error('Firebase Auth: Invalid ID token');
    }
  });

  const baseSaasProfile = {
    name: 'TechFlow',
    description: 'Cloud observability platform',
    website: 'https://techflow.io',
    targetAudience: 'DevOps engineers',
    keyFeatures: ['APM', 'Distributed Tracing'],
    primaryCompetitors: ['datadog.com'],
    tone: 'technical',
    customInsights: 'none'
  };

  function createTestArticle(id: string, ownerUid: string, overrides?: Partial<Article>): Article {
    const title = overrides?.title || 'Production Microservices Observability Guide';
    const bodyMarkdown = overrides?.content || '## Overview\nProduction monitoring requires comprehensive distributed tracing and deep telemetry metrics across every cloud microservice to maintain high availability and prevent cascading system outages in high-traffic enterprise architectures.\n\n## Implementation Architecture\nEngineers deploy lightweight collectors and automated alerting pipelines to capture distributed spans, correlate database queries, and reduce mean time to resolution during critical production incident triage.';
    const targetBrand = overrides?.targetBrand || overrides?.referenceUrl || 'techflow';
    const slug = (title.toLowerCase().replace(/[^a-z0-9]+/g, '-')).trim();
    const policyVersion = '2026-r5';

    const fingerprint = ArtifactLifecycleBoundary.computeFingerprint({
      title,
      bodyMarkdown,
      targetBrand,
      slug,
      metaDescription: 'Complete guide to microservices observability.',
      targetKeyword: 'microservices observability',
      policyVersion
    });

    return {
      id,
      userId: ownerUid,
      ownerId: ownerUid,
      title,
      content: bodyMarkdown,
      folder: 'guides',
      stage: 'Draft',
      validationStatus: overrides?.validationStatus || 'READY',
      validationFingerprint: overrides?.validationFingerprint || fingerprint,
      contentVersion: overrides?.contentVersion || 1,
      targetBrand,
      referenceUrl: targetBrand,
      sourceKeyword: 'microservices observability',
      blueprint: {
        title,
        slug,
        targetBrand,
        metaDescription: 'Complete guide to microservices observability.',
        policyVersion
      },
      ...overrides
    };
  }

  // --- Scenario 1: Unauthenticated distribution returns 401 ---
  console.log('--- TEST GROUP 1: Distribution Authentication & Authorization ---');
  const unauthReq = new Request('http://localhost:3000/api/distribute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request: { contentAssetId: 'art_1', channels: ['webhook'], idempotencyKey: 'idem_1' } })
  });
  const unauthRes = await distributeRouteHandler(unauthReq);
  const unauthJson = await unauthRes.json();
  assert(unauthRes.status === 401, '1.1: Unauthenticated distribution returns 401 Unauthorized');
  assert(unauthJson.code === 'ERR_UNAUTHORIZED', '1.2: Error code is ERR_UNAUTHORIZED');

  // --- Scenario 2: Invalid authentication fails closed (401) ---
  const badTokenReq = new Request('http://localhost:3000/api/distribute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer forged_or_expired_token'
    },
    body: JSON.stringify({ request: { contentAssetId: 'art_1', channels: ['webhook'], idempotencyKey: 'idem_1' } })
  });
  const badTokenRes = await distributeRouteHandler(badTokenReq);
  assert(badTokenRes.status === 401, '2.1: Invalid bearer token returns 401 Unauthorized');

  // --- Scenario 3: Cross-owner distribution is rejected (403) ---
  const aliceArt = createTestArticle('art_alice_1', 'usr_alice');
  await TemporaryArticleStore.saveArticle(aliceArt, 'usr_alice');

  const crossOwnerReq = new Request('http://localhost:3000/api/distribute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer bob_valid_token'
    },
    body: JSON.stringify({
      request: {
        contentAssetId: 'art_alice_1',
        channels: ['webhook'],
        idempotencyKey: 'idem_bob_steal'
      }
    })
  });
  const crossOwnerRes = await distributeRouteHandler(crossOwnerReq);
  const crossOwnerJson = await crossOwnerRes.json();
  assert(crossOwnerRes.status === 403, '3.1: Bob trying to distribute Alice article returns 403 Forbidden');
  assert(crossOwnerJson.code === 'ERR_FORBIDDEN_NOT_ARTICLE_OWNER', '3.2: Error code is ERR_FORBIDDEN_NOT_ARTICLE_OWNER');

  // --- Scenario 4: Missing approval is rejected (422) ---
  console.log('\n--- TEST GROUP 2: Release Gate Approval Checks ---');
  const noApprovalReq = new Request('http://localhost:3000/api/distribute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer alice_valid_token'
    },
    body: JSON.stringify({
      request: {
        contentAssetId: 'art_alice_1',
        channels: ['webhook'],
        idempotencyKey: 'idem_alice_1'
      }
    })
  });
  const noApprovalRes = await distributeRouteHandler(noApprovalReq);
  const noApprovalJson = await noApprovalRes.json();
  assert(noApprovalRes.status === 422, '4.1: Distribution without approval record returns 422');
  assert(noApprovalJson.code === 'ERR_NO_ACTIVE_APPROVAL', '4.2: Error code is ERR_NO_ACTIVE_APPROVAL');

  // --- Scenario 5: Rejected approval is rejected (422) ---
  // Approve then reject
  const appRes = await ApprovalAuthorityService.processDecision({
    articleId: 'art_alice_1',
    decision: 'REJECTED',
    artifactFingerprint: aliceArt.validationFingerprint!,
    isExplicitReReview: true
  }, 'usr_alice');
  assert(appRes.success === true, 'Setup: Created REJECTED approval record');

  const rejectedDistReq = new Request('http://localhost:3000/api/distribute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer alice_valid_token'
    },
    body: JSON.stringify({
      request: {
        contentAssetId: 'art_alice_1',
        channels: ['webhook'],
        idempotencyKey: 'idem_alice_rejected'
      }
    })
  });
  const rejectedDistRes = await distributeRouteHandler(rejectedDistReq);
  const rejectedDistJson = await rejectedDistRes.json();
  assert(rejectedDistRes.status === 422, '5.1: Distribution of REJECTED article returns 422');
  assert(rejectedDistJson.code === 'ERR_APPROVAL_REJECTED', '5.2: Error code is ERR_APPROVAL_REJECTED');

  // --- Scenario 6: Invalid or tampered HMAC signature is rejected (422) ---
  console.log('\n--- TEST GROUP 3: Cryptographic Integrity & Key Management ---');
  // First approve legitimately
  const approveRes = await ApprovalAuthorityService.processDecision({
    articleId: 'art_alice_1',
    decision: 'APPROVED',
    artifactFingerprint: aliceArt.validationFingerprint!,
    isExplicitReReview: true
  }, 'usr_alice');
  assert(approveRes.success === true, 'Setup: Created APPROVED record rev2');

  // Tamper with record in store
  const storedApp: any = await TemporaryArticleStore.getApprovalById((approveRes as any).record.approvalId);
  const originalSig = storedApp.hmacSignature;
  storedApp.hmacSignature = originalSig.slice(0, -1) + (originalSig.endsWith('0') ? '1' : '0');
  await TemporaryArticleStore.tamperApprovalForTesting(storedApp); // overwriting directly in raw test store

  const tamperedSigReq = new Request('http://localhost:3000/api/distribute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer alice_valid_token'
    },
    body: JSON.stringify({
      request: {
        contentAssetId: 'art_alice_1',
        channels: ['webhook'],
        idempotencyKey: 'idem_tampered_sig'
      }
    })
  });
  const tamperedSigRes = await distributeRouteHandler(tamperedSigReq);
  const tamperedSigJson = await tamperedSigRes.json();
  assert(tamperedSigRes.status === 422, '6.1: Distribution with tampered HMAC signature returns 422');
  assert(tamperedSigJson.code === 'ERR_SIGNATURE_MISMATCH' || tamperedSigJson.code === 'ERR_SIGNATURE_INVALID', '6.2: Error code is ERR_SIGNATURE_MISMATCH');

  // Restore original signature
  storedApp.hmacSignature = originalSig;
  await TemporaryArticleStore.tamperApprovalForTesting(storedApp);

  // --- Scenario 7: Missing, retired, or revoked verification key is rejected (422) ---
  storedApp.keyId = 'k_revoked';
  await TemporaryArticleStore.tamperApprovalForTesting(storedApp);

  const revokedKeyReq = new Request('http://localhost:3000/api/distribute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer alice_valid_token'
    },
    body: JSON.stringify({
      request: {
        contentAssetId: 'art_alice_1',
        channels: ['webhook'],
        idempotencyKey: 'idem_revoked_key'
      }
    })
  });
  const revokedKeyRes = await distributeRouteHandler(revokedKeyReq);
  const revokedKeyJson = await revokedKeyRes.json();
  assert(revokedKeyRes.status === 422, '7.1: Distribution with revoked key returns 422');
  assert(revokedKeyJson.code === 'ERR_KEY_REVOKED', '7.2: Error code is ERR_KEY_REVOKED');

  // Restore active key
  storedApp.keyId = 'k2';
  await TemporaryArticleStore.tamperApprovalForTesting(storedApp);

  // --- Scenario 8: Direct persisted-content mutation is detected by recomputing R5 fingerprint (422) ---
  console.log('\n--- TEST GROUP 4: SEC-03 Recomputation & Fingerprint Invariants ---');
  // Mutate content in store directly without updating validationFingerprint
  const rawAliceDoc: any = await TemporaryArticleStore.getArticleRaw('art_alice_1');
  rawAliceDoc.content = '## Tampered Content\nHacker modified text in database directly.';
  await TemporaryArticleStore.updateArticlePartial('art_alice_1', { content: rawAliceDoc.content });

  const tamperedContentReq = new Request('http://localhost:3000/api/distribute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer alice_valid_token'
    },
    body: JSON.stringify({
      request: {
        contentAssetId: 'art_alice_1',
        channels: ['webhook'],
        idempotencyKey: 'idem_tampered_content'
      }
    })
  });
  const tamperedContentRes = await distributeRouteHandler(tamperedContentReq);
  const tamperedContentJson = await tamperedContentRes.json();
  assert(tamperedContentRes.status === 422, '8.1: Direct database content mutation returns 422');
  assert(tamperedContentJson.code === 'ERR_DIRTY_CONTENT_FINGERPRINT_MISMATCH', '8.2: Error code is ERR_DIRTY_CONTENT_FINGERPRINT_MISMATCH');

  // Restore content
  await TemporaryArticleStore.updateArticlePartial('art_alice_1', { content: aliceArt.content });

  // --- Scenario 9: Old approval cannot authorize a newer content version (422) ---
  await TemporaryArticleStore.updateArticlePartial('art_alice_1', { contentVersion: 2 });
  const versionMismatchReq = new Request('http://localhost:3000/api/distribute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer alice_valid_token'
    },
    body: JSON.stringify({
      request: {
        contentAssetId: 'art_alice_1',
        channels: ['webhook'],
        idempotencyKey: 'idem_v2_mismatch'
      }
    })
  });
  const versionMismatchRes = await distributeRouteHandler(versionMismatchReq);
  const versionMismatchJson = await versionMismatchRes.json();
  assert(versionMismatchRes.status === 422, '9.1: Content version bump without re-approval returns 422');
  assert(versionMismatchJson.code === 'ERR_APPROVAL_VERSION_MISMATCH', '9.2: Error code is ERR_APPROVAL_VERSION_MISMATCH');

  // Restore version 1
  await TemporaryArticleStore.updateArticlePartial('art_alice_1', { contentVersion: 1 });

  // --- Scenario 10: Approval record for Article A cannot authorize Article B (422) ---
  const bobArt = createTestArticle('art_bob_1', 'usr_bob');
  await TemporaryArticleStore.saveArticle(bobArt, 'usr_bob');
  // Transplant Alice's approval ID into Bob's article
  await TemporaryArticleStore.updateArticleApprovalPointer('art_bob_1', storedApp.approvalId, 1);

  const replayReq = new Request('http://localhost:3000/api/distribute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer bob_valid_token'
    },
    body: JSON.stringify({
      request: {
        contentAssetId: 'art_bob_1',
        channels: ['webhook'],
        idempotencyKey: 'idem_replay'
      }
    })
  });
  const replayRes = await distributeRouteHandler(replayReq);
  const replayJson = await replayRes.json();
  assert(replayRes.status === 422, '10.1: Replayed approval record on different article returns 422');
  assert(replayJson.code === 'ERR_APPROVAL_ARTICLE_MISMATCH', '10.2: Error code is ERR_APPROVAL_ARTICLE_MISMATCH');

  // --- Scenario 11: Stale active-approval pointer is rejected (422) ---
  await TemporaryArticleStore.updateArticleApprovalPointer('art_alice_1', 'apr_nonexistent_rev99', 99);
  const stalePtrReq = new Request('http://localhost:3000/api/distribute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer alice_valid_token'
    },
    body: JSON.stringify({
      request: {
        contentAssetId: 'art_alice_1',
        channels: ['webhook'],
        idempotencyKey: 'idem_stale_ptr'
      }
    })
  });
  const stalePtrRes = await distributeRouteHandler(stalePtrReq);
  const stalePtrJson = await stalePtrRes.json();
  assert(stalePtrRes.status === 422, '11.1: Nonexistent approval pointer returns 422');
  assert(stalePtrJson.code === 'ERR_APPROVAL_RECORD_MISSING', '11.2: Error code is ERR_APPROVAL_RECORD_MISSING');

  // Restore valid pointer
  await TemporaryArticleStore.updateArticleApprovalPointer('art_alice_1', storedApp.approvalId, storedApp.revision);

  // --- Scenario 12: Invalid lifecycle status is rejected (422) ---
  await TemporaryArticleStore.updateArticlePartial('art_alice_1', { validationStatus: 'REVIEW_REQUIRED' });
  const reviewStatusReq = new Request('http://localhost:3000/api/distribute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer alice_valid_token'
    },
    body: JSON.stringify({
      request: {
        contentAssetId: 'art_alice_1',
        channels: ['webhook'],
        idempotencyKey: 'idem_review_status'
      }
    })
  });
  const reviewStatusRes = await distributeRouteHandler(reviewStatusReq);
  const reviewStatusJson = await reviewStatusRes.json();
  assert(reviewStatusRes.status === 422, '12.1: Distribution of REVIEW_REQUIRED article returns 422');
  assert(reviewStatusJson.code === 'ERR_ARTIFACT_NOT_READY', '12.2: Error code is ERR_ARTIFACT_NOT_READY');

  // Restore READY
  await TemporaryArticleStore.updateArticlePartial('art_alice_1', { validationStatus: 'READY' });

  // --- Scenario 13: Duplicate approval revision cannot overwrite history (409) ---
  console.log('\n--- TEST GROUP 5: Approval Immutability & Collision Semantics ---');
  let duplicateCollisionCaught = false;
  try {
    await TemporaryArticleStore.createApproval({
      approvalId: storedApp.approvalId,
      content: 'malicious duplicate'
    });
  } catch (err: any) {
    if (err.code === 6 || String(err.message).includes('already exists')) {
      duplicateCollisionCaught = true;
    }
  }
  assert(duplicateCollisionCaught, '13.1: createApproval strictly throws ALREADY_EXISTS (code 6) on duplicate approvalId');

  // --- Scenario 14: Exact idempotent approval retry behaves correctly (200) ---
  const idempotentAppRes = await ApprovalAuthorityService.processDecision({
    articleId: 'art_alice_1',
    decision: 'APPROVED',
    artifactFingerprint: aliceArt.validationFingerprint!,
    isExplicitReReview: false
  }, 'usr_alice');
  assert(idempotentAppRes.success === true, '14.1: Idempotent approval re-submission succeeds with 200');
  assert((idempotentAppRes as any).status === 'IDEMPOTENT_SUCCESS', '14.2: Status is IDEMPOTENT_SUCCESS');

  // --- Scenario 15: Dispatch generation increments monotonically ---
  console.log('\n--- TEST GROUP 6: Dispatch State Machine, Fencing & Concurrency ---');
  const claim1 = await ApprovalAuthorityService.claimDispatchOperation({
    articleId: 'art_alice_1',
    callerUid: 'usr_alice',
    clientOperationKey: 'op_alpha',
    channels: ['webhook'],
    requiredDecision: 'APPROVED'
  });
  assert(claim1.success === true && claim1.status === 'CLAIMED', '15.1: First dispatch claim succeeds');
  const gen1 = (claim1 as any).generation;
  assert(gen1 >= 1, '15.2: Dispatch generation is positive integer');

  // Clear lease to simulate next operation
  await TemporaryArticleStore.updateArticlePartial('art_alice_1', { dispatchLeaseExpiresAt: 0, dispatchState: 'IDLE' });

  const claim2 = await ApprovalAuthorityService.claimDispatchOperation({
    articleId: 'art_alice_1',
    callerUid: 'usr_alice',
    clientOperationKey: 'op_beta',
    channels: ['webhook'],
    requiredDecision: 'APPROVED'
  });
  assert(claim2.success === true && claim2.status === 'CLAIMED', '15.3: Second dispatch claim succeeds');
  const gen2 = (claim2 as any).generation;
  assert(gen2 === gen1 + 1, '15.4: Generation incremented monotonically', `Expected ${gen1 + 1}, got ${gen2}`);

  // --- Scenario 16: A stale worker cannot record result after newer generation claims operation ---
  const staleWorkerWrite = await ApprovalAuthorityService.recordDispatchState({
    articleId: 'art_alice_1',
    generation: gen1, // Stale generation!
    attemptId: (claim1 as any).attemptId,
    state: 'DISPATCHING'
  });
  assert(staleWorkerWrite.success === false, '16.1: Stale generation worker state update is rejected');
  assert(staleWorkerWrite.code === 'ERR_STALE_GENERATION', '16.2: Error code is ERR_STALE_GENERATION');

  // --- Scenario 17: Concurrent same-operation claims deduplicate ---
  // Mark current operation as DISPATCHED
  await ApprovalAuthorityService.recordDispatchResult({
    articleId: 'art_alice_1',
    generation: gen2,
    attemptId: (claim2 as any).attemptId,
    results: [{ channel: 'webhook', status: 'PUBLISHED', externalId: 'wh_test_1' }],
    status: 'DISPATCHED'
  });

  const dedupClaim = await ApprovalAuthorityService.claimDispatchOperation({
    articleId: 'art_alice_1',
    callerUid: 'usr_alice',
    clientOperationKey: 'op_beta', // same operation key!
    channels: ['webhook'],
    requiredDecision: 'APPROVED'
  });
  assert(dedupClaim.success === true && dedupClaim.status === 'DEDUPLICATED', '17.1: Duplicate operation request returns DEDUPLICATED');
  assert((dedupClaim as any).results?.[0]?.externalId === 'wh_test_1', '17.2: Returns cached results from previous dispatch');

  // 17.3: Changed client key on already-dispatched version also deduplicates (server-controlled identity)
  const changedKeyDedupClaim = await ApprovalAuthorityService.claimDispatchOperation({
    articleId: 'art_alice_1',
    callerUid: 'usr_alice',
    clientOperationKey: 'op_beta_changed_caller_key',
    channels: ['webhook'],
    requiredDecision: 'APPROVED'
  });
  assert(changedKeyDedupClaim.success === true && changedKeyDedupClaim.status === 'DEDUPLICATED', '17.3: Changed client key on already-dispatched article returns DEDUPLICATED without new publication');

  // --- Scenario 18: Distinct conflicting operation during active lease returns 409 ---
  // Reset dispatch state to test active lease concurrency on a new operation
  await TemporaryArticleStore.updateArticlePartial('art_alice_1', {
    dispatchState: undefined,
    dispatchOperationId: undefined,
    dispatchClientOperationKey: undefined,
    dispatchResults: undefined,
    dispatchProviderIdempotencyKeys: undefined
  });

  // Acquire an active lease on a new operation
  const activeClaim = await ApprovalAuthorityService.claimDispatchOperation({
    articleId: 'art_alice_1',
    callerUid: 'usr_alice',
    clientOperationKey: 'op_gamma',
    channels: ['webhook'],
    requiredDecision: 'APPROVED'
  });
  assert(activeClaim.success === true && activeClaim.status === 'CLAIMED', '18.1: Acquired lease for op_gamma');

  // Concurrent retry with SAME client key while lease is active returns 409 ERR_DISPATCH_IN_PROGRESS
  const sameKeyConcurrentClaim = await ApprovalAuthorityService.claimDispatchOperation({
    articleId: 'art_alice_1',
    callerUid: 'usr_alice',
    clientOperationKey: 'op_gamma',
    channels: ['webhook'],
    requiredDecision: 'APPROVED'
  });
  assert(sameKeyConcurrentClaim.success === false, '18.2: Concurrent same-key retry during active lease is rejected');
  assert((sameKeyConcurrentClaim as any).code === 'ERR_DISPATCH_IN_PROGRESS', '18.3: Error code is ERR_DISPATCH_IN_PROGRESS');

  // Concurrent retry with CHANGED client key while lease is active returns 409 ERR_CONCURRENT_DISPATCH_CONFLICT
  const conflictClaim = await ApprovalAuthorityService.claimDispatchOperation({
    articleId: 'art_alice_1',
    callerUid: 'usr_alice',
    clientOperationKey: 'op_delta_competing',
    channels: ['webhook'],
    requiredDecision: 'APPROVED'
  });
  assert(conflictClaim.success === false, '18.4: Competing distinct operation is rejected');
  assert((conflictClaim as any).code === 'ERR_CONCURRENT_DISPATCH_CONFLICT', '18.5: Error code is ERR_CONCURRENT_DISPATCH_CONFLICT');
  assert((conflictClaim as any).httpStatus === 409, '18.6: HTTP status is 409 Conflict');

  // --- Scenario 19: Retries reuse the same durable per-channel provider idempotency key ---
  const currentArtDoc: any = await TemporaryArticleStore.getArticleRaw('art_alice_1');
  const originalKey = currentArtDoc.dispatchProviderIdempotencyKeys?.webhook;
  assert(Boolean(originalKey), '19.1: Original provider idempotency key exists in article document');

  // Expire the lease to allow a retry of op_gamma
  await TemporaryArticleStore.updateArticlePartial('art_alice_1', { dispatchLeaseExpiresAt: Date.now() - 1000 });

  const retryGammaClaim = await ApprovalAuthorityService.claimDispatchOperation({
    articleId: 'art_alice_1',
    callerUid: 'usr_alice',
    clientOperationKey: 'op_gamma', // exact same logical operation
    channels: ['webhook'],
    requiredDecision: 'APPROVED'
  });
  assert(retryGammaClaim.success === true && retryGammaClaim.status === 'CLAIMED', '19.2: Retry of op_gamma succeeds after lease expiration');
  const reusedKey = (retryGammaClaim as any).providerIdempotencyKeys?.webhook;
  assert(reusedKey === originalKey, '19.3: Retry reused the exact same provider idempotency key', `Got ${reusedKey} vs ${originalKey}`);

  // 19.4: Retry with CHANGED client key after lease expiration also reuses the exact same provider idempotency key
  await TemporaryArticleStore.updateArticlePartial('art_alice_1', { dispatchLeaseExpiresAt: Date.now() - 1000 });
  const retryChangedKeyClaim = await ApprovalAuthorityService.claimDispatchOperation({
    articleId: 'art_alice_1',
    callerUid: 'usr_alice',
    clientOperationKey: 'op_gamma_completely_different_key',
    channels: ['webhook'],
    requiredDecision: 'APPROVED'
  });
  assert(retryChangedKeyClaim.success === true && retryChangedKeyClaim.status === 'CLAIMED', '19.4: Retry with changed client key succeeds under new generation');
  const reusedKeyChanged = (retryChangedKeyClaim as any).providerIdempotencyKeys?.webhook;
  assert(reusedKeyChanged === originalKey, '19.5: Retry with changed client key strictly reuses authoritative provider idempotency key');

  // 19.6: Non-idempotent provider with unknown outcome (lease expired in DISPATCHING) fails closed
  // Simulate worker entering DISPATCHING and lease expiring before settlement
  await TemporaryArticleStore.updateArticlePartial('art_alice_1', {
    dispatchState: 'DISPATCHING',
    dispatchLeaseExpiresAt: Date.now() - 1000
  });

  const nonIdemClaim = await ApprovalAuthorityService.claimDispatchOperation({
    articleId: 'art_alice_1',
    callerUid: 'usr_alice',
    clientOperationKey: 'op_gamma_retry_unknown_outcome',
    channels: ['webhook'],
    providerCapabilities: {
      webhook: { supportsIdempotency: false }
    },
    requiredDecision: 'APPROVED'
  });
  assert(nonIdemClaim.success === false, '19.6: Unknown outcome retry on non-idempotent provider is blocked');
  assert((nonIdemClaim as any).code === 'ERR_DISPATCH_RECONCILIATION_REQUIRED', '19.7: Error code is ERR_DISPATCH_RECONCILIATION_REQUIRED');
  const postBlockedDoc: any = await TemporaryArticleStore.getArticleRaw('art_alice_1');
  assert(postBlockedDoc.dispatchState === 'RECONCILIATION_REQUIRED', '19.8: State transitioned to RECONCILIATION_REQUIRED');

  // 19.9: Explicit reconciliation override unblocks retry on non-idempotent provider
  const reconciledClaim = await ApprovalAuthorityService.claimDispatchOperation({
    articleId: 'art_alice_1',
    callerUid: 'usr_alice',
    clientOperationKey: 'op_gamma_reconciled',
    channels: ['webhook'],
    providerCapabilities: {
      webhook: { supportsIdempotency: false }
    },
    reconciliationOverride: true,
    requiredDecision: 'APPROVED'
  });
  assert(reconciledClaim.success === true && reconciledClaim.status === 'CLAIMED', '19.9: Explicit reconciliation override unblocks retry');

  // --- Scenario 20: Provider timeout/error records failure state durably ---
  const failedRecord = await ApprovalAuthorityService.recordDispatchResult({
    articleId: 'art_alice_1',
    generation: (reconciledClaim as any).generation,
    attemptId: (reconciledClaim as any).attemptId,
    error: 'Provider HTTP request timed out after 15000ms',
    status: 'FAILED'
  });
  assert(failedRecord.success === true, '20.1: Failed dispatch result recorded');
  const updatedDoc: any = await TemporaryArticleStore.getArticleRaw('art_alice_1');
  assert(updatedDoc.dispatchState === 'FAILED', '20.2: Article dispatchState updated to FAILED');

  // --- Scenario 21: In-flight revocation produces explicit escalation state ---
  // Claim new dispatch
  const inFlightClaim = await ApprovalAuthorityService.claimDispatchOperation({
    articleId: 'art_alice_1',
    callerUid: 'usr_alice',
    clientOperationKey: 'op_revocation_test',
    channels: ['webhook'],
    requiredDecision: 'APPROVED'
  });
  assert(inFlightClaim.success === true && inFlightClaim.status === 'CLAIMED', '21.1: Claimed dispatch for revocation test');

  // Owner rejects article while worker is in-flight
  await ApprovalAuthorityService.processDecision({
    articleId: 'art_alice_1',
    decision: 'REJECTED',
    artifactFingerprint: aliceArt.validationFingerprint!,
    isExplicitReReview: true
  }, 'usr_alice');

  // Worker finishes and attempts to record result
  const postDispatchResult = await ApprovalAuthorityService.recordDispatchResult({
    articleId: 'art_alice_1',
    generation: (inFlightClaim as any).generation,
    attemptId: (inFlightClaim as any).attemptId,
    results: [{ channel: 'webhook', status: 'PUBLISHED' }],
    expectedApprovalId: (inFlightClaim as any).approvalRecord.approvalId
  });
  assert(postDispatchResult.finalStatus === 'REVOKED_POST_DISPATCH', '21.2: In-flight revocation transitioned to REVOKED_POST_DISPATCH');

  // --- Scenario 22: Official clean export of unapproved persisted artifact is rejected (422) ---
  console.log('\n--- TEST GROUP 7: Official Clean Export vs Watermarked Drafts ---');
  const unapprovedArt = createTestArticle('art_unapproved_1', 'usr_alice');
  await TemporaryArticleStore.saveArticle(unapprovedArt, 'usr_alice');

  const cleanExportUnapprovedReq = new Request('http://localhost:3000/api/export', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer alice_valid_token'
    },
    body: JSON.stringify({
      articleId: 'art_unapproved_1',
      format: 'html'
      // allowDraftPreview is false/omitted -> official clean export requested
    })
  });
  const cleanExportUnapprovedRes = await exportRouteHandler(cleanExportUnapprovedReq);
  const cleanExportUnapprovedJson = await cleanExportUnapprovedRes.json();
  assert(cleanExportUnapprovedRes.status === 422, '22.1: Official clean export of unapproved article returns 422');
  assert(cleanExportUnapprovedJson.code === 'ERR_NO_ACTIVE_APPROVAL', '22.2: Error code is ERR_NO_ACTIVE_APPROVAL');

  // --- Scenario 23: Explicit draft export is visibly classified and cannot be confused with official release ---
  const draftExportReq = new Request('http://localhost:3000/api/export', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer alice_valid_token'
    },
    body: JSON.stringify({
      articleId: 'art_unapproved_1',
      format: 'html',
      allowDraftPreview: true
    })
  });
  const draftExportRes = await exportRouteHandler(draftExportReq);
  if (draftExportRes.status !== 200) {
    console.log('DEBUG: draftExportRes error:', await draftExportRes.clone().text());
  }
  const draftHtml = await draftExportRes.text();
  assert(draftExportRes.status === 200, '23.1: Draft preview export returns 200 OK');
  assert(draftExportRes.headers.get('X-ACUTE-Artifact-Classification') === 'UNAPPROVED_DRAFT', '23.2: Header is UNAPPROVED_DRAFT');
  assert(draftHtml.includes('UNAPPROVED DRAFT — NOT FOR PUBLICATION'), '23.3: Injected visible draft warning banner');
  assert(draftHtml.includes('<meta name="acute-classification" content="UNAPPROVED_DRAFT" />'), '23.4: Injected draft classification meta tag');

  // --- Scenario 24: Valid approved artifact can pass official clean export gate (200) ---
  // Approve aliceArt again
  await ApprovalAuthorityService.processDecision({
    articleId: 'art_alice_1',
    decision: 'APPROVED',
    artifactFingerprint: aliceArt.validationFingerprint!,
    isExplicitReReview: true
  }, 'usr_alice');

  const cleanOfficialExportReq = new Request('http://localhost:3000/api/export', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer alice_valid_token'
    },
    body: JSON.stringify({
      articleId: 'art_alice_1',
      format: 'html'
      // clean official export
    })
  });
  const cleanOfficialExportRes = await exportRouteHandler(cleanOfficialExportReq);
  const cleanHtml = await cleanOfficialExportRes.text();
  assert(cleanOfficialExportRes.status === 200, '24.1: Clean official export of approved article returns 200 OK');
  assert(cleanOfficialExportRes.headers.get('X-ACUTE-Artifact-Classification') === 'OFFICIAL_RELEASE', '24.2: Header is OFFICIAL_RELEASE');
  assert(!cleanHtml.includes('acute-draft-watermark'), '24.3: Clean export contains zero draft watermarks');

  // --- Scenario 25: Full legitimate release workflow succeeds (200) ---
  console.log('\n--- TEST GROUP 8: End-to-End Legitimate Release Workflow ---');
  // Clear any existing lease
  await TemporaryArticleStore.updateArticlePartial('art_alice_1', { dispatchLeaseExpiresAt: 0, dispatchState: 'IDLE' });

  const legitimateDistReq = new Request('http://localhost:3000/api/distribute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer alice_valid_token'
    },
    body: JSON.stringify({
      request: {
        contentAssetId: 'art_alice_1',
        channels: ['webhook'],
        idempotencyKey: 'idem_legitimate_release'
      },
      saasProfile: baseSaasProfile,
      dryRun: true
    })
  });
  const legitimateDistRes = await distributeRouteHandler(legitimateDistReq);
  const legitimateDistJson = await legitimateDistRes.json();
  assert(legitimateDistRes.status === 200, '25.1: Legitimate distribution request returns 200 OK');
  assert(legitimateDistJson.results?.[0]?.status === 'PUBLISHED', '25.2: Provider published successfully');
  assert(legitimateDistJson.dispatchStatus === 'DISPATCHED', '25.3: Dispatch finalized as DISPATCHED');

  console.log('\n========================================================================');
  console.log(` RESULTS: ${passed} passed, ${failed} failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runR62BTestSuite().catch((err) => {
  console.error('Unhandled suite error:', err);
  process.exit(1);
});
