// scratch/verify_three_mlm_paragraphs.ts
import assert from 'assert';
import { ParagraphSignatureValidator } from '../src/lib/intelligence/ParagraphSignatureValidator';

// Sentence definitions:
// Sentence M2: 15 words (Band M: 15..28)
const s_m2 = 'Mobile conversion rate optimization requires product teams to evaluate user friction across complex checkout screens.';
// Sentence L1: 33 words (Band L: > 28)
const s_l1 = 'When enterprise product managers evaluate cross-platform mobile engagement strategies, they must weigh immediate conversion lifts against long-term customer lifetime retention, ensuring that aggressive promotional tactics do not degrade organic brand loyalty over time.';
// Sentence M1: 18 words (Band M: 15..28)
const s_m1 = 'Modern growth teams systematically analyze conversion telemetry to discover critical drop-off points across high-volume checkout funnels.';
// Sentence M3: 16 words (Band M: 15..28)
const s_m3 = 'Engineers implement targeted instrumentation to capture every user click before finalizing major application architecture decisions.';
// Sentence M4: 15 words (Band M: 15..28)
const s_m4 = 'Cross-functional squads regularly prioritize customer journey experiments to validate core hypotheses before investing engineering bandwidth.';

const p1 = `${s_m2} ${s_l1} ${s_m1}`;
const p2 = `${s_m3} ${s_l1} ${s_m1}`;
const p3 = `${s_m4} ${s_l1} ${s_m1}`;

console.log('=== STEP 1: INDIVIDUAL PARAGRAPH SIGNATURE VERIFICATION ===');
const sig1 = ParagraphSignatureValidator.computeCanonicalSignature(p1);
console.log('Paragraph 1:', sig1.signature, 'Bands:', sig1.bands);
assert.strictEqual(sig1.signature, '(3, PROSE, M-L-M)', 'Paragraph 1 must produce (3, PROSE, M-L-M)');

const sig2 = ParagraphSignatureValidator.computeCanonicalSignature(p2);
console.log('Paragraph 2:', sig2.signature, 'Bands:', sig2.bands);
assert.strictEqual(sig2.signature, '(3, PROSE, M-L-M)', 'Paragraph 2 must produce (3, PROSE, M-L-M)');

const sig3 = ParagraphSignatureValidator.computeCanonicalSignature(p3);
console.log('Paragraph 3:', sig3.signature, 'Bands:', sig3.bands);
assert.strictEqual(sig3.signature, '(3, PROSE, M-L-M)', 'Paragraph 3 must produce (3, PROSE, M-L-M)');

console.log('\n=== STEP 2: FULL DOCUMENT VALIDATION & REJECTION ===');
const markdown = `# Document Title\n\n## Section One\n\n${p1}\n\n${p2}\n\n${p3}`;
const report = ParagraphSignatureValidator.validate(markdown);

console.log('Document Valid:', report.valid);
console.log('Eligible Prose Count:', report.eligibleProseCount);
console.log('Violations Count:', report.violations.length);

assert.strictEqual(report.valid, false, 'Document with 3 consecutive identical signatures must be rejected (valid: false)');
assert.strictEqual(report.violations.length, 1, 'Must report exactly 1 violation');

const v = report.violations[0];
console.log('Violation Type:', v.violationType);
console.log('Consecutive Count:', v.consecutiveCount);
console.log('Offending Signature:', v.canonicalSignature);
console.log('Violation Message:', v.message);

assert.strictEqual(v.violationType, 'CONSECUTIVE_IDENTICAL_PARAGRAPH_SIGNATURES');
assert.strictEqual(v.canonicalSignature, '(3, PROSE, M-L-M)');
assert.strictEqual(v.paragraphs.length, 3);
assert.strictEqual(v.paragraphs[0].signature, '(3, PROSE, M-L-M)');
assert.strictEqual(v.paragraphs[1].signature, '(3, PROSE, M-L-M)');
assert.strictEqual(v.paragraphs[2].signature, '(3, PROSE, M-L-M)');

console.log('\n=== FIXTURE VERIFIED SUCCESSFULLY ===');
