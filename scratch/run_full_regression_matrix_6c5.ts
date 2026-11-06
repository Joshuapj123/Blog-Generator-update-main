// scratch/run_full_regression_matrix_6c5.ts
import { execSync } from 'child_process';

interface SuiteResult {
  suiteNumber: number;
  name: string;
  command: string;
  exitCode: number;
  totalChecks: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  errorSnippet?: string;
}

const suites = [
  { num: 1, name: 'Phase 6C.5 Quality Calibration Suite', cmd: 'npx tsx scratch/test_phase_6c_5_quality_calibration_suite.ts' },
  { num: 2, name: 'Phase 6C.4 Substantive Deliverable Contracts', cmd: 'npx tsx scratch/test_phase_6c_4_substantive_deliverable_contracts.ts' },
  { num: 3, name: 'Phase 6C.3 Business Scale Grounding', cmd: 'npx tsx scratch/test_phase_6c_3_business_scale_grounding.ts' },
  { num: 4, name: 'Phase 6C.2 YouTube Elimination', cmd: 'npx tsx scratch/test_phase_6c_2_youtube_injection_elimination.ts' },
  { num: 5, name: 'Phase 7.1 Full Export & PDF Suite', cmd: 'npx tsx scratch/test_phase7_1_export_suite.ts' },
  { num: 6, name: 'Phase 6C Context-Aware Drafting Suite', cmd: 'npx tsx scratch/test_phase6c_context_aware_drafting_suite.ts' },
  { num: 7, name: 'Phase 6D Editorial Integrity Suite', cmd: 'npx tsx scratch/test_phase6d_editorial_integrity_suite.ts' },
  { num: 8, name: 'Phase 6E Text-First Quality Suite', cmd: 'npx tsx scratch/test_phase6e_text_first_integrity_suite.ts' },
  { num: 9, name: 'Phase 6F Editorial Acceptance Suite', cmd: 'npx tsx scratch/test_phase6f_end_to_end_editorial_acceptance_suite.ts' },
  { num: 10, name: 'R7.7.4 Firestore Circular Sanitization', cmd: 'npx tsx scratch/test_phase_r7_7_4_firestore_circular_sanitization.ts' },
  { num: 11, name: 'R7.6 Staged Generation', cmd: 'npx tsx scratch/test_phase_r7_6_durable_staged_generation.ts' },
  { num: 12, name: 'R7.4.2 CRLF & Streaming', cmd: 'npx tsx scratch/test_phase_r7_4_2_crlf_and_streaming.ts' },
  { num: 13, name: 'R7.4 Generation Reliability', cmd: 'npx tsx scratch/test_phase_r7_4_generation_reliability.ts' },
  { num: 14, name: 'Prompt 7 Auth & Security Model', cmd: 'npx tsx scratch/test_prompt7_auth_isolation.ts' },
  { num: 15, name: 'Article Persistence & Dashboard Suite', cmd: 'npx tsx scratch/test_article_persistence_and_dashboard_suite.ts' },
  { num: 16, name: 'R5 Typed Artifact Boundary', cmd: 'npx tsx scratch/test_phase_r5_artifact_boundary_and_lifecycle.ts' },
  { num: 17, name: 'R6.2A Approval Provenance', cmd: 'npx tsx scratch/test_phase_r6_2a_approval_provenance.ts' },
  { num: 18, name: 'R6.2B Release Enforcement', cmd: 'npx tsx scratch/test_phase_r6_2b_release_enforcement.ts' },
  { num: 19, name: 'R7.7.6B Firebase Credentials Gate', cmd: 'npx tsx scratch/test_phase_r7_7_6b_firebase_credentials.ts' },
];

const results: SuiteResult[] = [];

console.log('========================================================================');
console.log(' STARTING FULL PHASE 6C.5R REGRESSION EXECUTION MATRIX (19 SUITES)');
console.log('========================================================================\n');

for (const s of suites) {
  process.stdout.write(`[SUITE ${s.num}/19] Running: ${s.name}... `);
  const start = Date.now();
  let output = '';
  let exitCode = 0;
  try {
    output = execSync(s.cmd, { stdio: 'pipe', encoding: 'utf8', env: process.env, timeout: 120000 });
  } catch (err: any) {
    exitCode = err.status || 1;
    output = (err.stdout || '') + '\n' + (err.stderr || '');
  }
  const durationMs = Date.now() - start;

  // Extract pass/fail/total counts from output
  let totalChecks = 0;
  let passed = 0;
  let failed = 0;

  // Pattern matching across different test reporters
  if (output.includes('SUMMARY:') && output.includes('assertions passed')) {
    const m = output.match(/SUMMARY:\s*(\d+)\/(\d+)\s+assertions\s+passed/i);
    if (m) {
      passed = parseInt(m[1], 10);
      totalChecks = parseInt(m[2], 10);
      failed = totalChecks - passed;
    }
  } else if (output.includes('ASSERTIONS PASSED')) {
    const m = output.match(/(\d+)\s*\/\s*(\d+)\s*ASSERTIONS\s*PASSED/i);
    if (m) {
      passed = parseInt(m[1], 10);
      totalChecks = parseInt(m[2], 10);
      failed = totalChecks - passed;
    }
  } else if (output.includes('Total:') && output.includes('Passed:') && output.includes('Failed:')) {
    const m = output.match(/Total:\s*(\d+)\s*\|\s*Passed:\s*(\d+)\s*\|\s*Failed:\s*(\d+)/i);
    if (m) {
      totalChecks = parseInt(m[1], 10);
      passed = parseInt(m[2], 10);
      failed = parseInt(m[3], 10);
    }
  } else if (/(\d+)\s+passed,\s*(\d+)\s+failed/i.test(output)) {
    const m = output.match(/(\d+)\s+passed,\s*(\d+)\s+failed/i);
    if (m) {
      passed = parseInt(m[1], 10);
      failed = parseInt(m[2], 10);
      totalChecks = passed + failed;
    }
  } else if (output.includes('PASSED') && output.includes('FAILED')) {
    const m = output.match(/(\d+)\s+PASSED,\s*(\d+)\s+FAILED/i);
    if (m) {
      passed = parseInt(m[1], 10);
      failed = parseInt(m[2], 10);
      totalChecks = passed + failed;
    }
  } else if (output.includes('ALL') && output.includes('TESTS PASSED')) {
    const m = output.match(/ALL\s+(\d+)\s+.*TESTS\s+PASSED/i);
    if (m) {
      totalChecks = parseInt(m[1], 10);
      passed = totalChecks;
      failed = 0;
    }
  } else {
    // Count [PASS] or ✓ markers
    const passMatches = (output.match(/✓\s+PASS|\[PASS\]|\[PASS\s+\d+\]|PASSED/g) || []).length;
    const failMatches = (output.match(/✗\s+FAIL|\[FAIL\]|FAILED/g) || []).length;
    if (passMatches > 0) {
      passed = passMatches;
      failed = failMatches;
      totalChecks = passed + failed;
    } else {
      totalChecks = exitCode === 0 ? 1 : 0;
      passed = exitCode === 0 ? 1 : 0;
      failed = exitCode === 0 ? 0 : 1;
    }
  }

  // Count skip lines if any
  const skipMatches = output.match(/SKIP/gi);
  const skipped = skipMatches ? skipMatches.length : 0;

  const status = exitCode === 0 ? '✓ PASS' : '✗ FAIL';
  console.log(`${status} (${durationMs}ms) - Checks: ${passed}/${totalChecks}`);

  results.push({
    suiteNumber: s.num,
    name: s.name,
    command: s.cmd,
    exitCode,
    totalChecks,
    passed,
    failed,
    skipped: 0,
    durationMs,
    errorSnippet: exitCode !== 0 ? output.slice(-500) : undefined
  });
}

console.log('\n========================================================================');
console.log(' REGRESSION EXECUTION SUMMARY');
console.log('========================================================================');

let totalChecksAll = 0;
let totalPassedAll = 0;
let totalFailedAll = 0;

console.log('| # | Suite Name | Checks | Pass | Fail | Exit Code | Duration |');
console.log('|---|---|---|---|---|---|---|');
for (const r of results) {
  totalChecksAll += r.totalChecks;
  totalPassedAll += r.passed;
  totalFailedAll += r.failed;
  console.log(`| ${r.suiteNumber} | ${r.name} | ${r.totalChecks} | ${r.passed} | ${r.failed} | ${r.exitCode} | ${(r.durationMs / 1000).toFixed(1)}s |`);
}

console.log(`\nGrand Total: ${totalPassedAll} / ${totalChecksAll} Checks Passed across ${results.length} Suites.`);
if (totalFailedAll === 0 && results.every(r => r.exitCode === 0)) {
  console.log('VERDICT: ALL 19 REGRESSION SUITES PASSED (100% GREEN)');
  process.exit(0);
} else {
  console.error(`VERDICT: REGRESSION FAILURE DETECTED (${totalFailedAll} checks failed)`);
  process.exit(1);
}
