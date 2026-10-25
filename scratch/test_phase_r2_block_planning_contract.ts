// scratch/test_phase_r2_block_planning_contract.ts
/**
 * ACUTE Phase R2 — Explicit Content Planning & Block Variety Contract Test Suite
 *
 * Verifies:
 * 1. Schema enforcement: ContentBlockRole, ContentBlockMode, SentenceCountRange, ContentBlockPlan
 * 2. Invalid role, mode, sentence count range rejection
 * 3. Invariant: PROSE requires sentenceCountRange; LIST and TABLE do not enforce sentence counts
 * 4. Invariant: Text-first (no IMAGE mode or image generation contracts)
 * 5. Deterministic block planning across multiple runs
 * 6. Structural variation: no 3 consecutive eligible prose blocks share identical planned signatures
 * 7. Stable, unique block IDs across entire article
 * 8. Duplicate block ID detection and rejection
 * 9. Position-aware role assignment (HOOK in intro, SUMMARY in conclusion, EVIDENCE/TACTICAL in body)
 * 10. Table and List mode block assignment without prose sentence bounds
 * 11. 100% backward compatibility with legacy outlines and briefs
 * 12. Compatibility with TopicRelevanceValidator sanitization
 * 13. Compatibility with SectionEvidenceMapper evidence mapping
 * 14. Compatibility with enforceOutlineSectionBudget section pruning
 */

import {
  ContentBlockRoleSchema,
  ContentBlockModeSchema,
  SentenceCountRangeSchema,
  ContentBlockPlanSchema,
  OutlineNodeSchema,
  ContentBriefSchema,
  planBlockVarietyForOutlineNode,
  planBlockVarietyForArticle,
  validateOutlineBlockPlanUniqueness,
  verifyProseStructuralVariation,
  validateContentBriefStrict,
  createDeterministicFallbackBrief,
  enforceOutlineSectionBudget,
} from '../src/lib/content/schemas';
import { TopicRelevanceValidator } from '../src/lib/intelligence/TopicRelevanceValidator';
import { SectionEvidenceMapper } from '../src/lib/intelligence/SectionEvidenceMapper';
import { EvidenceSet } from '../src/core/contracts/evidence';

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
console.log(' ACUTE PHASE R2: CONTENT BLOCK PLANNING & VARIETY CONTRACT SUITE');
console.log('========================================================================\n');

// -----------------------------------------------------------------------------
// TEST GROUP 1: Schema Enforcement & Constraints
// -----------------------------------------------------------------------------
console.log('--- TEST GROUP 1: Schema Enforcement & Validation Constraints ---');

// 1.1 Valid PROSE block with consistent sentence count semantics
try {
  const validProse = ContentBlockPlanSchema.parse({
    blockId: 'blk_1_1',
    role: 'HOOK',
    mode: 'PROSE',
    sentenceCountRange: { min: 2, max: 2 },
    targetSignature: '(2, PROSE, S-M)',
    parentHeading: 'Introduction',
    protectedRequirements: ['Include primary keyword in first sentence']
  });
  assert(validProse.blockId === 'blk_1_1' && validProse.role === 'HOOK' && validProse.mode === 'PROSE' && validProse.sentenceCountRange?.min === 2 && validProse.sentenceCountRange?.max === 2, '1.1 Accepts valid PROSE ContentBlockPlan with consistent sentenceCountRange semantics');
} catch (e: any) {
  assert(false, '1.1 Accepts valid PROSE ContentBlockPlan with consistent sentenceCountRange semantics', e.message);
}

// 1.2 Valid TABLE and LIST blocks (no sentence count range)
try {
  const validTable = ContentBlockPlanSchema.parse({
    blockId: 'blk_2_2',
    role: 'EVIDENCE',
    mode: 'TABLE',
    targetSignature: '(TABLE, COMPARISON_MATRIX)',
    parentHeading: 'Feature Matrix',
    protectedRequirements: ['Clean markdown comparison table']
  });
  const validList = ContentBlockPlanSchema.parse({
    blockId: 'blk_3_2',
    role: 'TACTICAL',
    mode: 'LIST',
    targetSignature: '(LIST, ORDERED_STEPS)',
    parentHeading: 'Implementation Steps'
  });
  assert(validTable.mode === 'TABLE' && validList.mode === 'LIST' && validTable.sentenceCountRange === undefined, '1.2 Accepts valid TABLE and LIST ContentBlockPlan without sentenceCountRange');
} catch (e: any) {
  assert(false, '1.2 Accepts valid TABLE and LIST ContentBlockPlan', e.message);
}

// 1.3 Reject invalid role
try {
  ContentBlockPlanSchema.parse({
    blockId: 'blk_1_1',
    role: 'INVALID_ROLE' as any,
    mode: 'PROSE',
    sentenceCountRange: { min: 2, max: 3 }
  });
  assert(false, '1.3 Rejects invalid role');
} catch {
  assert(true, '1.3 Rejects invalid role');
}

// 1.4 Reject invalid mode (including IMAGE / DIAGRAM / VIDEO)
try {
  ContentBlockPlanSchema.parse({
    blockId: 'blk_1_1',
    role: 'HOOK',
    mode: 'IMAGE' as any,
    sentenceCountRange: { min: 2, max: 3 }
  });
  assert(false, '1.4 Rejects invalid mode (IMAGE)');
} catch {
  assert(true, '1.4 Rejects invalid mode (IMAGE) - text-first invariant upheld');
}

// 1.5 Reject invalid sentence count range: min > max
try {
  SentenceCountRangeSchema.parse({ min: 5, max: 2 });
  assert(false, '1.5 Rejects sentenceCountRange where min > max');
} catch {
  assert(true, '1.5 Rejects sentenceCountRange where min > max');
}

// 1.6 Reject invalid sentence count range: min <= 0
try {
  SentenceCountRangeSchema.parse({ min: 0, max: 3 });
  assert(false, '1.6 Rejects sentenceCountRange with min <= 0');
} catch {
  assert(true, '1.6 Rejects sentenceCountRange with min <= 0');
}

// 1.7 Reject PROSE block without sentenceCountRange
try {
  ContentBlockPlanSchema.parse({
    blockId: 'blk_1_1',
    role: 'HOOK',
    mode: 'PROSE'
  });
  assert(false, '1.7 Rejects PROSE block missing sentenceCountRange');
} catch {
  assert(true, '1.7 Rejects PROSE block missing sentenceCountRange');
}

// 1.8 Reject empty blockId
try {
  ContentBlockPlanSchema.parse({
    blockId: '',
    role: 'HOOK',
    mode: 'PROSE',
    sentenceCountRange: { min: 2, max: 3 }
  });
  assert(false, '1.8 Rejects empty blockId');
} catch {
  assert(true, '1.8 Rejects empty blockId');
}

// -----------------------------------------------------------------------------
// TEST GROUP 2: Deterministic Planning & Block ID Stability
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 2: Deterministic Planning & Stable Block IDs ---');

const sampleOutline = [
  {
    heading: 'Understanding Mobile Conversion Optimization',
    level: 'H2' as const,
    generate_table: false,
    assignedKeywords: ['mobile conversion rate'],
    assignedEntities: ['checkout flow'],
    core_concept: 'Foundations of mobile UX conversion'
  },
  {
    heading: 'Core Friction Points in Modern Mobile Onboarding',
    level: 'H2' as const,
    generate_table: false,
    assignedKeywords: ['onboarding friction'],
    assignedEntities: ['drop-off rate'],
    core_concept: 'Key friction analysis and drop-off causes'
  },
  {
    heading: 'Step-by-Step Mobile Audit and Remediation Workflow',
    level: 'H2' as const,
    generate_table: false,
    assignedKeywords: ['audit workflow'],
    assignedEntities: ['usability testing'],
    core_concept: 'Actionable step-by-step audit process and practitioner checklist'
  },
  {
    heading: 'Evaluation Framework and Solution Comparison',
    level: 'H2' as const,
    generate_table: true,
    assignedKeywords: ['evaluation criteria'],
    assignedEntities: ['feature matrix'],
    core_concept: 'Comparison table and capability breakdown'
  },
  {
    heading: 'Strategic Recommendations and Next Steps',
    level: 'H2' as const,
    generate_table: false,
    assignedKeywords: ['conversion best practices'],
    assignedEntities: ['continuous optimization'],
    core_concept: 'Summary of strategic takeaways and actionable roadmap'
  }
];

// 2.1 Deterministic block generation across runs
const run1 = planBlockVarietyForArticle(sampleOutline);
const run2 = planBlockVarietyForArticle(sampleOutline);
const isIdentical = JSON.stringify(run1) === JSON.stringify(run2);
assert(isIdentical, '2.1 Produces 100% identical block plans across multiple runs for identical inputs');

// 2.2 Stable block IDs format
const allBlockIds = run1.flatMap(n => (n.blockPlans || []).map(bp => bp.blockId));
const allMatchPattern = allBlockIds.every(id => /^blk_\d+_\d+$/.test(id));
assert(allMatchPattern && allBlockIds.length > 0, `2.2 Generates stable formatted block IDs (found ${allBlockIds.length} blocks, e.g. ${allBlockIds[0]})`);

// 2.3 Unique block IDs across article
const uniqueness = validateOutlineBlockPlanUniqueness(run1);
assert(uniqueness.isValid && uniqueness.duplicateIds.length === 0, `2.3 All block IDs are globally unique across article (${uniqueness.totalBlocks} total blocks, 0 duplicates)`);

// 2.4 Duplicate block ID detection
const duplicateOutline = JSON.parse(JSON.stringify(run1));
duplicateOutline[1].blockPlans[0].blockId = duplicateOutline[0].blockPlans[0].blockId;
const duplicateCheck = validateOutlineBlockPlanUniqueness(duplicateOutline);
assert(!duplicateCheck.isValid && duplicateCheck.duplicateIds.length > 0, '2.4 Correctly detects and flags duplicate block IDs');

// -----------------------------------------------------------------------------
// TEST GROUP 3: Structural Variety & Role Contract
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 3: Structural Variety & Non-Repetition Contract ---');

// 3.1 Structural variation across consecutive eligible prose blocks
const varietyCheck = verifyProseStructuralVariation(run1);
assert(varietyCheck.isValid, '3.1 Invariant upheld: Never assigns identical planned signatures across three consecutive eligible prose blocks');

// 3.2 Position-aware editorial roles
const introBlocks = run1[0].blockPlans || [];
const conclusionBlocks = run1[run1.length - 1].blockPlans || [];
const hasIntroHook = introBlocks.some(bp => bp.role === 'HOOK');
const hasConclusionSummary = conclusionBlocks.some(bp => bp.role === 'SUMMARY');
assert(hasIntroHook, '3.2 Section 0 includes HOOK role for primary keyword introduction');
assert(hasConclusionSummary, '3.3 Conclusion section includes SUMMARY role for actionable takeaway roadmap');

// 3.4 Table mode block assignment
const tableSectionBlocks = run1[3].blockPlans || [];
const tableBlock = tableSectionBlocks.find(bp => bp.mode === 'TABLE');
assert(Boolean(tableBlock && tableBlock.role === 'EVIDENCE' && tableBlock.sentenceCountRange === undefined), '3.4 Section with generate_table: true includes TABLE mode block without prose sentence count constraints');

// 3.5 List mode block assignment
const listSectionBlocks = run1[2].blockPlans || [];
const listBlock = listSectionBlocks.find(bp => bp.mode === 'LIST');
assert(Boolean(listBlock && listBlock.role === 'TACTICAL' && listBlock.sentenceCountRange === undefined), '3.5 Section with workflow/step concept includes LIST mode block without prose sentence count constraints');

// 3.6 Semantic consistency: signature sentence count strictly matches sentenceCountRange bounds
const allProseBlocks = run1.flatMap(n => (n.blockPlans || []).filter(bp => bp.mode === 'PROSE'));
const allConsistent = allProseBlocks.every(bp => {
  const match = bp.targetSignature?.match(/^\((\d+),/);
  if (!match || !bp.sentenceCountRange) return false;
  const count = parseInt(match[1], 10);
  return bp.sentenceCountRange.min === count && bp.sentenceCountRange.max === count;
});
assert(allConsistent && allProseBlocks.length > 0, `3.6 Semantic consistency: targetSignature sentence count matches sentenceCountRange exactly (${allProseBlocks.length} prose blocks verified)`);

// -----------------------------------------------------------------------------
// TEST GROUP 4: Integration & Backward Compatibility
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 4: Integration & Backward Compatibility ---');

// 4.1 Legacy OutlineNodeSchema parse without blockPlans
const legacyNode = {
  heading: 'Legacy Section Heading',
  level: 'H2' as const,
  generate_table: false,
  assignedKeywords: ['test keyword'],
  assignedEntities: ['test entity'],
  core_concept: 'Test legacy concept'
};
try {
  const parsedLegacy = OutlineNodeSchema.parse(legacyNode);
  assert(parsedLegacy.heading === 'Legacy Section Heading' && parsedLegacy.blockPlans === undefined, '4.1 OutlineNodeSchema cleanly parses legacy nodes without blockPlans');
} catch (e: any) {
  assert(false, '4.1 OutlineNodeSchema cleanly parses legacy nodes without blockPlans', e.message);
}

// 4.2 Legacy ContentBriefSchema parse without blockPlans
const legacyBrief = {
  title: 'Complete Mobile Conversion Guide',
  targetKeywords: ['mobile conversion rate'],
  outline: [legacyNode],
  wordCountBudget: { min: 1000, max: 2000, target: 1500 },
  intent: {
    primaryKeyword: 'mobile conversion rate',
    intentType: 'Informational' as const,
    contentType: 'Guide' as const
  }
};
try {
  const parsedBrief = ContentBriefSchema.parse(legacyBrief);
  assert(parsedBrief.title === legacyBrief.title, '4.2 ContentBriefSchema cleanly parses legacy briefs without blockPlans');
} catch (e: any) {
  assert(false, '4.2 ContentBriefSchema cleanly parses legacy briefs without blockPlans', e.message);
}

// 4.3 validateContentBriefStrict accepts brief with valid blockPlans
const briefWithPlans = {
  ...legacyBrief,
  outline: run1
};
try {
  const strictResult = validateContentBriefStrict(briefWithPlans);
  assert(strictResult.outline.length === run1.length, '4.3 validateContentBriefStrict accepts brief with valid blockPlans');
} catch (e: any) {
  assert(false, '4.3 validateContentBriefStrict accepts brief with valid blockPlans', e.message);
}

// 4.4 validateContentBriefStrict rejects duplicate block IDs
const invalidBriefDuplicate = {
  ...legacyBrief,
  outline: duplicateOutline
};
try {
  validateContentBriefStrict(invalidBriefDuplicate);
  assert(false, '4.4 validateContentBriefStrict rejects brief with duplicate block IDs');
} catch (e: any) {
  assert(e.message.includes('Duplicate content block IDs'), '4.4 validateContentBriefStrict rejects brief with duplicate block IDs');
}

// 4.5 Fallback brief has valid block plans automatically
const fallbackBrief = createDeterministicFallbackBrief({
  targetKeyword: 'B2B SaaS Onboarding',
  targetAudience: 'Product Managers',
  medianWordCount: 1800,
  supportingTerms: ['time to value', 'user friction']
});
const fallbackUniqueness = validateOutlineBlockPlanUniqueness(fallbackBrief.outline);
assert(fallbackUniqueness.isValid && fallbackUniqueness.totalBlocks > 0, `4.5 createDeterministicFallbackBrief automatically generates unique, valid block plans (${fallbackUniqueness.totalBlocks} blocks)`);

// 4.6 Compatibility with TopicRelevanceValidator sanitization
const driftedBrief = {
  ...briefWithPlans,
  outline: [
    ...run1,
    {
      heading: 'Recruiting and Hiring Developers for Offshore Teams',
      level: 'H2' as const,
      generate_table: false,
      assignedKeywords: ['hiring developers'],
      assignedEntities: [],
      core_concept: 'Offshore recruitment'
    }
  ]
};
const sanitized = TopicRelevanceValidator.sanitizeOutlineWithReport(driftedBrief as any, 'mobile conversion rate', ['checkout flow']);
assert(sanitized.sanitizationApplied && sanitized.sanitizedHeadingsCount >= 1, `4.6 TopicRelevanceValidator sanitizes drifted outline while preserving outline structure (${sanitized.sanitizedHeadingsCount} headings sanitized)`);

// 4.7 Compatibility with SectionEvidenceMapper
const mockEvidenceSet: EvidenceSet = {
  items: [
    {
      id: 'ev-1',
      claim: 'Mobile checkout simplification reduces cart abandonment by 18%.',
      evidenceType: 'BUSINESS_FACT',
      sourceType: 'TARGET_SITE',
      confidence: 'HIGH',
      topics: ['checkout flow', 'mobile conversion rate'],
      sourceUrl: 'https://example.com/checkout-study',
      citationRequired: false
    }
  ],
  extractedAt: new Date().toISOString(),
  summary: {
    totalCount: 1,
    highConfidenceCount: 1,
    businessFactCount: 1,
    competitorObservationCount: 0,
    serpObservationCount: 0,
    inferenceCount: 0
  }
};
const mappedSections = SectionEvidenceMapper.mapSectionsToEvidence(run1, mockEvidenceSet, undefined, undefined, 'mobile conversion rate');
assert(mappedSections.length === run1.length, `4.7 SectionEvidenceMapper maps all sections with block plans (${mappedSections.length} mapped sections)`);

// 4.8 Section budget enforcement compatibility
const budgetEnforced = enforceOutlineSectionBudget(briefWithPlans as any, 3);
assert(budgetEnforced.budgetEnforced && budgetEnforced.enforcedCount === 3, `4.8 enforceOutlineSectionBudget prunes outline to budget (${budgetEnforced.originalCount} -> ${budgetEnforced.enforcedCount})`);
const postBudgetUniqueness = validateOutlineBlockPlanUniqueness(budgetEnforced.brief.outline);
assert(postBudgetUniqueness.isValid && postBudgetUniqueness.duplicateIds.length === 0, '4.9 Pruned outline preserves unique, valid block plans');

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
