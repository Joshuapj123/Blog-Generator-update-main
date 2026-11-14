// scratch/run_full_regression_matrix_6d2.ts
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
  { num: 1, name: 'Phase 6D.2 Planning Contract Suite', cmd: 'npx tsx scratch/test_phase_6d_2_planning_contract_suite.ts' },
  { num: 2, name: 'Phase 6D.1 Practitioner Knowledge Foundation', cmd: 'npx tsx scratch/test_phase_6d_1_practitioner_knowledge_suite.ts' },
  { num: 3, name: 'Phase 6C.5 Quality Calibration Suite', cmd: 'npx tsx scratch/test_phase_6c_5_quality_calibration_suite.ts' },
  { num: 4, name: 'Phase 6C.4 Substantive Deliverable Contracts', cmd: 'npx tsx scratch/test_phase_6c_4_substantive_deliverable_contracts.ts' },
  { num: 5, name: 'Phase 6C.3 Business Scale Grounding', cmd: 'npx tsx scratch/test_phase_6c_3_business_scale_grounding.ts' },
  { num: 6, name: 'Phase 6C.2 YouTube Elimination', cmd: 'npx tsx scratch/test_phase_6c_2_youtube_injection_elimination.ts' },
  { num: 7, name: 'Phase 7.1 Full Export & PDF Suite', cmd: 'npx tsx scratch/test_phase7_1_export_suite.ts' },
  { num: 8, name: 'Phase 6C Context-Aware Drafting Suite', cmd: 'npx tsx scratch/test_phase6c_context_aware_drafting_suite.ts' },
  { num: 9, name: 'Phase 6D Editorial Integrity Suite', cmd: 'npx tsx scratch/test_phase6d_editorial_integrity_suite.ts' },
  { num: 10, name: 'Phase 6E Text-First Quality Suite', cmd: 'npx tsx scratch/test_phase6e_text_first_integrity_suite.ts' },
  { num: 11, name: 'Phase 6F Editorial Acceptance Suite', cmd: 'npx tsx scratch/test_phase6f_end_to_end_editorial_acceptance_suite.ts' },
  { num: 12, name: 'R7.7.4 Firestore Circular Sanitization', cmd: 'npx tsx scratch/test_phase_r7_7_4_firestore_circular_sanitization.ts' },
  { num: 13, name: 'R7.6 Staged Generation', cmd: 'npx tsx scratch/test_phase_r7_6_durable_staged_generation.ts' },
  { num: 14, name: 'R7.4.2 CRLF & Streaming', cmd: 'npx tsx scratch/test_phase_r7_4_2_crlf_and_streaming.ts' },
  { num: 15, name: 'R7.4 Generation Reliability', cmd: 'npx tsx scratch/test_phase_r7_4_generation_reliability.ts' },
  { num: 16, name: 'Prompt 7 Auth & Security Model', cmd: 'npx tsx scratch/test_prompt7_auth_isolation.ts' },
  { num: 17, name: 'Article Persistence & Dashboard Suite', cmd: 'npx tsx scratch/test_article_persistence_and_dashboard_suite.ts' },
  { num: 18, name: 'R5 Typed Artifact Boundary', cmd: 'npx tsx scratch/test_phase_r5_artifact_boundary_and_lifecycle.ts' },
  { num: 19, name: 'R6.2A Approval Provenance', cmd: 'npx tsx scratch/test_phase_r6_2a_approval_provenance.ts' },
  { num: 20, name: 'R6.2B Release Enforcement', cmd: 'npx tsx scratch/test_phase_r6_2b_release_enforcement.ts' },
  { num: 21, name: 'R7.7.6B Firebase Credentials Gate', cmd: 'npx tsx scratch/test_phase_r7_7_6b_firebase_credentials.ts' },
];

const results: SuiteResult[] = [];

console.log('========================================================================');
console.log(' STARTING FULL PHASE 6D.2 REGRESSION EXECUTION MATRIX (21 SUITES)');
console.log('========================================================================\n');

for (const s of suites) {
  process.stdout.write(`[SUITE ${s.num}/21] Running: ${s.name}... `);
  const start = Date.now();
  let output = '';
  let exitCode = 0;
  try {
    output = execSync(s.cmd, { stdio: 'pipe', encoding: 'utf8', env: process.env, timeout: 180000 });
  } catch (err: any) {
    exitCode = err.status || 1;
    output = (err.stdout || '') + '\n' + (err.stderr || '');
  }
  const durationMs = Date.now() - start;

  // Extract pass/fail/total counts from output
  let totalChecks = 0;
  let passed = 0;
  let failed = 0;

  // Match [PASS] or [PASS 1] etc.
  const passMatches = output.match(/\[PASS(?:\s+\d+)?\]/g);
  if (passMatches) passed = passMatches.length;

  const failMatches = output.match(/\[FAIL(?:\s+\d+)?\]/g);
  if (failMatches) failed = failMatches.length;

  // Custom summary matches:
  // 1. "X/Y checks passed", "X / Y PASSED", etc.
  const summarySlashMatch = output.match(/(\d+)\s*\/\s*(\d+)\s+(?:checks|assertions|tests|scenarios|passed)/i);
  // 2. "Summary: X passed, Y failed"
  const summaryColonMatch = output.match(/Summary:\s*(\d+)\s+passed,\s*(\d+)\s+failed/i);
  // 3. "ALL X ... TESTS PASSED"
  const summaryAllMatch = output.match(/ALL\s+(\d+)\s+.*?TESTS PASSED/i);

  if (summarySlashMatch) {
    passed = parseInt(summarySlashMatch[1], 10);
    totalChecks = parseInt(summarySlashMatch[2], 10);
  } else if (summaryColonMatch) {
    passed = parseInt(summaryColonMatch[1], 10);
    failed = parseInt(summaryColonMatch[2], 10);
    totalChecks = passed + failed;
  } else if (summaryAllMatch) {
    passed = parseInt(summaryAllMatch[1], 10);
    totalChecks = passed;
  } else if (passed > 0 || failed > 0) {
    totalChecks = passed + failed;
  } else {
    // Check tables / other formats
    const passedMatch = output.match(/Total Passed:\s*(\d+)/i) || output.match(/Passed:\s*(\d+)/i);
    const totalMatch = output.match(/Total Checks:\s*(\d+)/i) || output.match(/Total:\s*(\d+)/i);
    if (passedMatch) passed = parseInt(passedMatch[1], 10);
    if (totalMatch) totalChecks = parseInt(totalMatch[1], 10);
    if (totalChecks === 0 && passed > 0) totalChecks = passed;
  }

  // Safety rule: Never interpret 0 executed checks as success
  const status = exitCode === 0 && failed === 0 && totalChecks > 0 ? 'PASS' : 'FAIL';
  console.log(`${status} (${passed}/${totalChecks} passed, ${durationMs}ms)`);

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
    errorSnippet: status === 'FAIL' ? output.slice(-500) : undefined,
  });
}

console.log('\n========================================================================');
console.log(' FULL PHASE 6D.2 REGRESSION MATRIX RESULTS');
console.log('========================================================================');
console.log('| Suite # | Suite Name | Exit Code | Checks Passed | Total | Status | Duration |');
console.log('|---|---|---|---|---|---|---|');

let grandTotalChecks = 0;
let grandPassedChecks = 0;
let grandFailedSuites = 0;

for (const r of results) {
  grandTotalChecks += r.totalChecks;
  grandPassedChecks += r.passed;
  if (r.exitCode !== 0 || r.failed > 0) grandFailedSuites++;

  const statusStr = r.exitCode === 0 && r.failed === 0 ? 'PASS' : 'FAIL';
  console.log(`| ${r.suiteNumber} | ${r.name} | ${r.exitCode} | ${r.passed} | ${r.totalChecks} | ${statusStr} | ${r.durationMs}ms |`);
}

console.log('========================================================================');
console.log(`GRAND TOTAL: ${grandPassedChecks}/${grandTotalChecks} checks passed across ${suites.length} suites.`);
console.log(`FAILED SUITES: ${grandFailedSuites}/${suites.length}`);
console.log('========================================================================\n');

if (grandFailedSuites > 0) {
  console.error('REGRESSION DETECTED! Some suites failed.');
  process.exit(1);
} else {
  console.log('ALL SUITES PASSED! Zero regressions detected.');
  process.exit(0);
}
