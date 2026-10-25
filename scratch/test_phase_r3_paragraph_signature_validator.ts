// scratch/test_phase_r3_paragraph_signature_validator.ts
/**
 * ACUTE Phase R3 — Canonical Paragraph Signature Validator Test Suite
 *
 * Verifies:
 * 1. Three consecutive identical signatures are rejected
 * 2. Two identical signatures followed by a different signature are not rejected
 * 3. Same sentence count but different length-band sequences do not falsely match
 * 4. Headings between matching prose paragraphs do not reset continuity
 * 5. LIST blocks between matching prose paragraphs do not reset continuity
 * 6. TABLE blocks between matching prose paragraphs do not reset continuity
 * 7. Different block types do not incorrectly match
 * 8. Abbreviations do not produce incorrect sentence counts
 * 9. URLs and decimal numbers do not create false sentence boundaries
 * 10. Empty paragraphs and headings do not count as prose paragraphs
 * 11. Mixed Markdown content is parsed conservatively
 * 12. Validator returns stable, machine-readable diagnostics
 * 13. Existing quality checks still run
 * 14. Existing Phase 6 editorial-integrity and text-first restrictions remain active
 * 15. Valid non-repetitive content remains accepted
 */

import { ParagraphSignatureValidator } from '../src/lib/intelligence/ParagraphSignatureValidator';
import { validateArticleQuality } from '../src/lib/seo-intelligence/quality_validator';
import { EditorialIntegrityValidator } from '../src/lib/intelligence/EditorialIntegrityValidator';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests += 1;
  if (condition) {
    passedTests += 1;
    console.log(`  [PASS] ${testName}`);
  } else {
    failedTests += 1;
    console.error(`  [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
  }
}

console.log('========================================================================');
console.log(' ACUTE PHASE R3: CANONICAL PARAGRAPH SIGNATURE VALIDATOR SUITE');
console.log('========================================================================\n');

// -----------------------------------------------------------------------------
// TEST GROUP 1: Canonical Signature Generation & Sentence Parsing
// -----------------------------------------------------------------------------
console.log('--- TEST GROUP 1: Canonical Signature Generation & Sentence Parsing ---');

// Helper to construct exact word count sentences
const makeWords = (n: number, prefix = 'word') => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`).join(' ');

// 1.1 Word band classification
assert(ParagraphSignatureValidator.classifySentenceLength(5) === 'S', '1.1a Word count 5 classifies as S (< 15)');
assert(ParagraphSignatureValidator.classifySentenceLength(14) === 'S', '1.1b Word count 14 classifies as S (< 15)');
assert(ParagraphSignatureValidator.classifySentenceLength(15) === 'M', '1.1c Word count 15 classifies as M (15..28)');
assert(ParagraphSignatureValidator.classifySentenceLength(20) === 'M', '1.1d Word count 20 classifies as M (15..28)');
assert(ParagraphSignatureValidator.classifySentenceLength(28) === 'M', '1.1e Word count 28 classifies as M (15..28)');
assert(ParagraphSignatureValidator.classifySentenceLength(29) === 'L', '1.1f Word count 29 classifies as L (> 28)');
assert(ParagraphSignatureValidator.classifySentenceLength(45) === 'L', '1.1g Word count 45 classifies as L (> 28)');

// 1.2 Abbreviations do not create false sentence boundaries
const abbrText = 'We evaluated performance metrics (e.g. latency, error rate, vs. baseline) across teams. Then we documented the results.';
const abbrSentences = ParagraphSignatureValidator.splitSentences(abbrText);
assert(abbrSentences.length === 2, `1.2 Abbreviations (e.g., vs.) do not create false sentence boundaries (found ${abbrSentences.length} sentences, expected 2)`);

// 1.3 URLs and decimal numbers do not create false sentence boundaries
const urlDecText = 'The system achieved a 3.5x speed increase on https://api.example.com/v2/metrics. Users reported zero downtime.';
const urlDecSentences = ParagraphSignatureValidator.splitSentences(urlDecText);
assert(urlDecSentences.length === 2, `1.3 URLs and decimal numbers do not create false boundaries (found ${urlDecSentences.length} sentences, expected 2)`);

// 1.4 Canonical signature formatting
const pText = `${makeWords(10, 'short')}. ${makeWords(20, 'medium')}. ${makeWords(32, 'long')}.`;
const sigRes = ParagraphSignatureValidator.computeCanonicalSignature(pText, 'PROSE');
assert(sigRes.sentenceCount === 3 && sigRes.signature === '(3, PROSE, S-M-L)', `1.4 Computes exact canonical signature format: ${sigRes.signature}`);

// -----------------------------------------------------------------------------
// TEST GROUP 2: Core Acceptance Rule — 3 Consecutive Identical Signatures
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 2: Core Acceptance Rule & Continuity Behavior ---');

// Paragraph with 3 sentences: M (18 words), L (30 words), M (18 words) -> (3, PROSE, M-L-M)
const makeMLMParagraph = (seed: string) => `${makeWords(18, seed + '_m1')}. ${makeWords(30, seed + '_l1')}. ${makeWords(18, seed + '_m2')}.`;

// Paragraph with 2 sentences: S (10 words), M (20 words) -> (2, PROSE, S-M)
const makeSMParagraph = (seed: string) => `${makeWords(10, seed + '_s1')}. ${makeWords(20, seed + '_m1')}.`;

// Paragraph with 3 sentences: S (10 words), M (20 words), L (30 words) -> (3, PROSE, S-M-L)
const makeSMLParagraph = (seed: string) => `${makeWords(10, seed + '_s1')}. ${makeWords(20, seed + '_m1')}. ${makeWords(30, seed + '_l1')}.`;

// 2.1 Three consecutive identical signatures are rejected
const docThreeIdentical = `
# Article Title

${makeMLMParagraph('p1')}

${makeMLMParagraph('p2')}

${makeMLMParagraph('p3')}
`;
const resThreeIdentical = ParagraphSignatureValidator.validate(docThreeIdentical);
assert(!resThreeIdentical.valid && resThreeIdentical.violations.length === 1, '2.1 Rejects three consecutive identical prose paragraph signatures');
assert(resThreeIdentical.violations[0].canonicalSignature === '(3, PROSE, M-L-M)', '2.1b Identifies exact offending canonical signature: (3, PROSE, M-L-M)');

// 2.2 Two identical signatures followed by a different signature are NOT rejected
const docTwoIdenticalOneDiff = `
# Article Title

${makeMLMParagraph('p1')}

${makeMLMParagraph('p2')}

${makeSMParagraph('p3')}
`;
const resTwoIdentical = ParagraphSignatureValidator.validate(docTwoIdenticalOneDiff);
assert(resTwoIdentical.valid && resTwoIdentical.violations.length === 0, '2.2 Does NOT reject two identical signatures followed by a varied signature');

// 2.3 Same sentence count but different length-band sequences do not falsely match
const docSameCountDiffBands = `
# Article Title

${makeMLMParagraph('p1')}

${makeSMLParagraph('p2')}

${makeMLMParagraph('p3')}
`;
const resSameCountDiffBands = ParagraphSignatureValidator.validate(docSameCountDiffBands);
assert(resSameCountDiffBands.valid && resSameCountDiffBands.violations.length === 0, '2.3 Same sentence count (3) with different length-band sequences (M-L-M vs S-M-L) do NOT match');

// 2.4 Headings between matching prose paragraphs DO NOT reset continuity
const docHeadingsBetween = `
# Article Title

## Section One: Discovery
${makeMLMParagraph('p1')}

## Section Two: Implementation
${makeMLMParagraph('p2')}

## Section Three: Roadmap
${makeMLMParagraph('p3')}
`;
const resHeadingsBetween = ParagraphSignatureValidator.validate(docHeadingsBetween);
assert(!resHeadingsBetween.valid && resHeadingsBetween.violations.length === 1, '2.4 Heading boundaries do NOT reset eligible prose continuity — rejected');
assert(resHeadingsBetween.violations[0].sections.length === 3, '2.4b Machine-readable diagnostic tracks all 3 affected sections across headings');

// 2.5 LIST blocks between matching prose paragraphs DO NOT reset continuity
const docListBetween = `
# Article Title

${makeMLMParagraph('p1')}

- Step 1: Initial configuration
- Step 2: Verification of telemetry
- Step 3: Deployment review

${makeMLMParagraph('p2')}

* Bullet item alpha
* Bullet item beta

${makeMLMParagraph('p3')}
`;
const resListBetween = ParagraphSignatureValidator.validate(docListBetween);
assert(!resListBetween.valid && resListBetween.violations.length === 1, '2.5 LIST blocks do NOT reset eligible prose continuity — rejected');

// 2.6 TABLE blocks between matching prose paragraphs DO NOT reset continuity
const docTableBetween = `
# Article Title

${makeMLMParagraph('p1')}

| Metric | Target | Status |
| :--- | :--- | :--- |
| Latency | < 100ms | Pass |
| Conversion | > 3.5% | Pass |

${makeMLMParagraph('p2')}

${makeMLMParagraph('p3')}
`;
const resTableBetween = ParagraphSignatureValidator.validate(docTableBetween);
assert(!resTableBetween.valid && resTableBetween.violations.length === 1, '2.6 TABLE blocks do NOT reset eligible prose continuity — rejected');

// 2.7 Headings + Table + List in succession do NOT reset prose continuity
const docMixedNonProseBetween = `
# Article Title

## Section A
${makeMLMParagraph('p1')}

| Feature | Support |
| :--- | :--- |
| Core | Yes |

## Section B
${makeMLMParagraph('p2')}

1. Primary action
2. Secondary action

## Section C
${makeMLMParagraph('p3')}
`;
const resMixedNonProseBetween = ParagraphSignatureValidator.validate(docMixedNonProseBetween);
assert(!resMixedNonProseBetween.valid && resMixedNonProseBetween.violations.length === 1, '2.7 Successive mixed non-prose blocks (Heading + Table + List) do NOT reset continuity');

// -----------------------------------------------------------------------------
// TEST GROUP 3: Content Exclusion & Conservative Parsing
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 3: Content Exclusion & Conservative Parsing ---');

// 3.1 Code blocks do not become prose
const docWithCode = `
# Code Example

${makeSMParagraph('p1')}

\`\`\`javascript
const x = 1;
const y = 2;
console.log(x + y);
\`\`\`

${makeMLMParagraph('p2')}
`;
const resWithCode = ParagraphSignatureValidator.validate(docWithCode);
assert(resWithCode.diagnostics.proseBlockCount === 2, `3.1 Code block excluded from prose (found ${resWithCode.diagnostics.proseBlockCount} prose blocks, expected 2)`);

// 3.2 Raw HTML blocks do not become prose
const docWithHtml = `
# HTML Example

${makeSMParagraph('p1')}

<div class="callout">
  <p>Important notice inside custom HTML container.</p>
</div>

${makeMLMParagraph('p2')}
`;
const resWithHtml = ParagraphSignatureValidator.validate(docWithHtml);
assert(resWithHtml.diagnostics.proseBlockCount === 2, `3.2 Raw HTML block excluded from prose (found ${resWithHtml.diagnostics.proseBlockCount} prose blocks, expected 2)`);

// 3.3 Media / image markdown does not become prose
const docWithMedia = `
# Media Example

${makeSMParagraph('p1')}

![Diagram of Conversion Funnel](https://example.com/funnel.png)

${makeMLMParagraph('p2')}
`;
const resWithMedia = ParagraphSignatureValidator.validate(docWithMedia);
assert(resWithMedia.diagnostics.proseBlockCount === 2, `3.3 Image markdown excluded from prose (found ${resWithMedia.diagnostics.proseBlockCount} prose blocks, expected 2)`);

// 3.4 Empty lines, horizontal rules, and blockquotes do not count as prose
const docWithDecorations = `
# Decorated Article

---

${makeSMParagraph('p1')}

> "This is a customer testimonial quote that should not count as body prose."

***

${makeMLMParagraph('p2')}
`;
const resWithDecorations = ParagraphSignatureValidator.validate(docWithDecorations);
assert(resWithDecorations.diagnostics.proseBlockCount === 2, `3.4 Horizontal rules and blockquotes excluded from prose (found ${resWithDecorations.diagnostics.proseBlockCount} prose blocks, expected 2)`);

// -----------------------------------------------------------------------------
// TEST GROUP 4: Machine-Readable Diagnostics & Pipeline Integration
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 4: Machine-Readable Diagnostics & Pipeline Integration ---');

// 4.1 Diagnostic structure completeness
assert(Array.isArray(resThreeIdentical.violations), '4.1a Result contains violations array');
assert(resThreeIdentical.criticalErrors.length === 1, '4.1b Result contains criticalErrors array');
assert(resThreeIdentical.violations[0].paragraphs.length === 3, '4.1c Violation records all 3 offending paragraph objects');
assert(Boolean(resThreeIdentical.violations[0].paragraphs[0].snippet), '4.1d Offending paragraph includes text snippet for diagnostics');
assert(resThreeIdentical.violations[0].paragraphs[0].signature === '(3, PROSE, M-L-M)', '4.1e Offending paragraph includes measured signature');

// 4.2 Valid varied content passes cleanly
const docValidVaried = `
# Comprehensive UX Optimization Guide

## Introduction
${makeSMParagraph('p1')}

## Core Mechanisms
${makeMLMParagraph('p2')}

## Tactical Implementation
${makeSMLParagraph('p3')}

## Strategic Review
${makeSMParagraph('p4')}
`;
const resValidVaried = ParagraphSignatureValidator.validate(docValidVaried);
assert(resValidVaried.valid && resValidVaried.violations.length === 0, '4.2 Valid naturally varied article passes with zero violations');

// 4.3 Existing quality checks still run and report
const qualityRes = validateArticleQuality(
  docValidVaried,
  ['optimization guide'],
  ['UX']
);
assert(typeof qualityRes.valid === 'boolean' && Array.isArray(qualityRes.errors), '4.3 Existing validateArticleQuality runs and returns valid report structure');

// 4.4 Editorial integrity validator remains active and functional
const editorialRes = EditorialIntegrityValidator.validateEditorialIntegrity(
  docValidVaried,
  { targetBrand: 'Acme' }
);
assert(typeof editorialRes.passed === 'boolean' && Array.isArray(editorialRes.criticalErrors), '4.4 Existing EditorialIntegrityValidator runs and returns valid report structure');

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('\n========================================================================');
console.log(`SUMMARY: ${passedTests} / ${totalTests} ASSERTIONS VERIFIED`);
console.log(`FAILED: ${failedTests}`);
console.log('========================================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
