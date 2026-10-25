// src/lib/content/ContentBlockPlanner.ts
import {
  OutlineNode,
  ContentBlockPlan,
  ContentBlockPlanSchema,
  ContentBlockRole,
  ContentBlockMode
} from '@/core/contracts/schemas';

/**
 * Standard structural signature templates for prose blocks.
 * Alternating through this sequence guarantees that no three consecutive
 * eligible prose blocks share identical planned signatures.
 * Consistent semantics: the sentence count in the signature matches the sentenceCountRange exactly.
 */
export const PROSE_SIGNATURE_TEMPLATES = [
  { signature: '(2, PROSE, S-M)', sentenceCountRange: { min: 2, max: 2 } },
  { signature: '(3, PROSE, M-L-M)', sentenceCountRange: { min: 3, max: 3 } },
  { signature: '(4, PROSE, M-M-L-S)', sentenceCountRange: { min: 4, max: 4 } },
  { signature: '(2, PROSE, M-S)', sentenceCountRange: { min: 2, max: 2 } },
  { signature: '(3, PROSE, L-M-M)', sentenceCountRange: { min: 3, max: 3 } },
] as const;

export interface BlockPlanningOptions {
  globalProseCounter?: { count: number };
}

/**
 * Checks if a heading or core concept strongly indicates a list/workflow format.
 */
function isListOrientedSection(heading: string, coreConcept?: string): boolean {
  const combined = `${heading} ${coreConcept || ''}`.toLowerCase();
  return /\b(step|steps|workflow|workflows|checklist|checklists|process|processes|procedure|procedures|criteria|criterion|best practice|best practices|tips|pitfalls|mistakes to avoid)\b/i.test(combined);
}

/**
 * Deterministically generates structured ContentBlockPlans for a single OutlineNode.
 */
export function planBlockVarietyForOutlineNode(
  node: OutlineNode,
  sectionIndex: number,
  totalSections: number,
  options?: BlockPlanningOptions
): ContentBlockPlan[] {
  const isIntro = sectionIndex === 0;
  const isConclusion = sectionIndex === totalSections - 1 && totalSections > 1;
  const isTable = Boolean(node.generate_table || /\b(comparison|matrix|breakdown|pricing|features? comparison|vs|versus)\b/i.test(node.heading));
  const isList = !isTable && isListOrientedSection(node.heading, node.core_concept);

  const proseCounter = options?.globalProseCounter || { count: 0 };
  const plans: ContentBlockPlan[] = [];

  const getNextProseSpec = () => {
    const spec = PROSE_SIGNATURE_TEMPLATES[proseCounter.count % PROSE_SIGNATURE_TEMPLATES.length];
    proseCounter.count += 1;
    return spec;
  };

  const baseIdPrefix = `blk_${sectionIndex + 1}`;

  if (isIntro) {
    // Block 1: Hook (First paragraph canonical keyword contract)
    const spec1 = getNextProseSpec();
    plans.push(ContentBlockPlanSchema.parse({
      blockId: `${baseIdPrefix}_1`,
      role: 'HOOK' as ContentBlockRole,
      mode: 'PROSE' as ContentBlockMode,
      sentenceCountRange: spec1.sentenceCountRange,
      targetSignature: spec1.signature,
      parentHeading: node.heading,
      protectedRequirements: [
        'Contain canonical primary keyword naturally in the first paragraph',
        'State practical business stakes immediately without generic fluff'
      ]
    }));

    // Block 2: Explain (Core definition and reader alignment)
    const spec2 = getNextProseSpec();
    plans.push(ContentBlockPlanSchema.parse({
      blockId: `${baseIdPrefix}_2`,
      role: 'EXPLAIN' as ContentBlockRole,
      mode: 'PROSE' as ContentBlockMode,
      sentenceCountRange: spec2.sentenceCountRange,
      targetSignature: spec2.signature,
      parentHeading: node.heading,
      protectedRequirements: [
        'Define core foundational principles and target practitioner scope'
      ]
    }));

    // Block 3: Tactical (Framework overview)
    const spec3 = getNextProseSpec();
    plans.push(ContentBlockPlanSchema.parse({
      blockId: `${baseIdPrefix}_3`,
      role: 'TACTICAL' as ContentBlockRole,
      mode: 'PROSE' as ContentBlockMode,
      sentenceCountRange: spec3.sentenceCountRange,
      targetSignature: spec3.signature,
      parentHeading: node.heading,
      protectedRequirements: [
        'Establish practitioner roadmap and transition to subsequent sections'
      ]
    }));
  } else if (isConclusion) {
    // Block 1: Explain (Synthesis of key themes)
    const spec1 = getNextProseSpec();
    plans.push(ContentBlockPlanSchema.parse({
      blockId: `${baseIdPrefix}_1`,
      role: 'EXPLAIN' as ContentBlockRole,
      mode: 'PROSE' as ContentBlockMode,
      sentenceCountRange: spec1.sentenceCountRange,
      targetSignature: spec1.signature,
      parentHeading: node.heading,
      protectedRequirements: [
        'Synthesize core decision drivers without verbatim rehash'
      ]
    }));

    // Block 2: Summary (Actionable roadmap / practitioner takeaways)
    const spec2 = getNextProseSpec();
    plans.push(ContentBlockPlanSchema.parse({
      blockId: `${baseIdPrefix}_2`,
      role: 'SUMMARY' as ContentBlockRole,
      mode: 'PROSE' as ContentBlockMode,
      sentenceCountRange: spec2.sentenceCountRange,
      targetSignature: spec2.signature,
      parentHeading: node.heading,
      protectedRequirements: [
        'Provide concrete next steps and practitioner checklist'
      ]
    }));
  } else if (isTable) {
    // Block 1: Explain (Context and evaluation criteria)
    const spec1 = getNextProseSpec();
    plans.push(ContentBlockPlanSchema.parse({
      blockId: `${baseIdPrefix}_1`,
      role: 'EXPLAIN' as ContentBlockRole,
      mode: 'PROSE' as ContentBlockMode,
      sentenceCountRange: spec1.sentenceCountRange,
      targetSignature: spec1.signature,
      parentHeading: node.heading,
      protectedRequirements: [
        'Establish objective evaluation criteria and matrix context'
      ]
    }));

    // Block 2: Evidence (Structured comparison table - no prose sentence count constraints)
    plans.push(ContentBlockPlanSchema.parse({
      blockId: `${baseIdPrefix}_2`,
      role: 'EVIDENCE' as ContentBlockRole,
      mode: 'TABLE' as ContentBlockMode,
      targetSignature: '(TABLE, COMPARISON_MATRIX)',
      parentHeading: node.heading,
      protectedRequirements: [
        'Clean markdown comparison table with factual capability contrast'
      ]
    }));

    // Block 3: Tactical (Analysis and practical guidance)
    const spec3 = getNextProseSpec();
    plans.push(ContentBlockPlanSchema.parse({
      blockId: `${baseIdPrefix}_3`,
      role: 'TACTICAL' as ContentBlockRole,
      mode: 'PROSE' as ContentBlockMode,
      sentenceCountRange: spec3.sentenceCountRange,
      targetSignature: spec3.signature,
      parentHeading: node.heading,
      protectedRequirements: [
        'Actionable guidance based on table comparison'
      ]
    }));
  } else if (isList) {
    // Block 1: Explain (Context and preparatory prerequisites)
    const spec1 = getNextProseSpec();
    plans.push(ContentBlockPlanSchema.parse({
      blockId: `${baseIdPrefix}_1`,
      role: 'EXPLAIN' as ContentBlockRole,
      mode: 'PROSE' as ContentBlockMode,
      sentenceCountRange: spec1.sentenceCountRange,
      targetSignature: spec1.signature,
      parentHeading: node.heading,
      protectedRequirements: [
        'Outline workflow prerequisites and operational context'
      ]
    }));

    // Block 2: Tactical (Ordered execution steps or checklist - no prose sentence count constraints)
    plans.push(ContentBlockPlanSchema.parse({
      blockId: `${baseIdPrefix}_2`,
      role: 'TACTICAL' as ContentBlockRole,
      mode: 'LIST' as ContentBlockMode,
      targetSignature: '(LIST, ACTIONABLE_STEPS)',
      parentHeading: node.heading,
      protectedRequirements: [
        'Structured ordered steps or bulleted practitioner checklist'
      ]
    }));

    // Block 3: Evidence (Implementation validation & common pitfalls)
    const spec3 = getNextProseSpec();
    plans.push(ContentBlockPlanSchema.parse({
      blockId: `${baseIdPrefix}_3`,
      role: 'EVIDENCE' as ContentBlockRole,
      mode: 'PROSE' as ContentBlockMode,
      sentenceCountRange: spec3.sentenceCountRange,
      targetSignature: spec3.signature,
      parentHeading: node.heading,
      protectedRequirements: [
        'Verification checks and practical pitfalls to avoid during execution'
      ]
    }));
  } else {
    // Standard Body Section: Explain -> Evidence -> Tactical
    const spec1 = getNextProseSpec();
    plans.push(ContentBlockPlanSchema.parse({
      blockId: `${baseIdPrefix}_1`,
      role: 'EXPLAIN' as ContentBlockRole,
      mode: 'PROSE' as ContentBlockMode,
      sentenceCountRange: spec1.sentenceCountRange,
      targetSignature: spec1.signature,
      parentHeading: node.heading,
      protectedRequirements: [
        'Detailed explanation of section concepts and core mechanism'
      ]
    }));

    const spec2 = getNextProseSpec();
    plans.push(ContentBlockPlanSchema.parse({
      blockId: `${baseIdPrefix}_2`,
      role: 'EVIDENCE' as ContentBlockRole,
      mode: 'PROSE' as ContentBlockMode,
      sentenceCountRange: spec2.sentenceCountRange,
      targetSignature: spec2.signature,
      parentHeading: node.heading,
      protectedRequirements: [
        'Grounded evidence, empirical details, or concrete operational example'
      ]
    }));

    const spec3 = getNextProseSpec();
    plans.push(ContentBlockPlanSchema.parse({
      blockId: `${baseIdPrefix}_3`,
      role: 'TACTICAL' as ContentBlockRole,
      mode: 'PROSE' as ContentBlockMode,
      sentenceCountRange: spec3.sentenceCountRange,
      targetSignature: spec3.signature,
      parentHeading: node.heading,
      protectedRequirements: [
        'Direct practitioner application and implementation guidance'
      ]
    }));
  }

  return plans;
}

/**
 * Deterministically populates and returns OutlineNodes with explicit ContentBlockPlans across the article.
 * Flowing the global prose counter across sections guarantees structural variety throughout the article.
 */
export function planBlockVarietyForArticle(outline: OutlineNode[], options?: { forceReplan?: boolean }): OutlineNode[] {
  if (!Array.isArray(outline)) {
    return [];
  }

  const globalProseCounter = { count: 0 };
  const totalSections = outline.length;

  return outline.map((node, index) => {
    // If node already has valid block plans and not forcing replan, preserve them
    if (!options?.forceReplan && Array.isArray(node.blockPlans) && node.blockPlans.length > 0) {
      return {
        ...node,
        blockPlans: node.blockPlans
      };
    }

    const plans = planBlockVarietyForOutlineNode(node, index, totalSections, { globalProseCounter });
    return {
      ...node,
      blockPlans: plans
    };
  });
}

/**
 * Validates that all blockIds across an outline are globally unique.
 */
export function validateOutlineBlockPlanUniqueness(outline: OutlineNode[]): {
  isValid: boolean;
  duplicateIds: string[];
  totalBlocks: number;
} {
  const seenIds = new Set<string>();
  const duplicateIds: string[] = [];
  let totalBlocks = 0;

  for (const node of outline) {
    if (Array.isArray(node.blockPlans)) {
      for (const bp of node.blockPlans) {
        totalBlocks += 1;
        if (seenIds.has(bp.blockId)) {
          if (!duplicateIds.includes(bp.blockId)) {
            duplicateIds.push(bp.blockId);
          }
        } else {
          seenIds.add(bp.blockId);
        }
      }
    }
  }

  return {
    isValid: duplicateIds.length === 0,
    duplicateIds,
    totalBlocks
  };
}

/**
 * Verifies that no three consecutive eligible prose blocks across the article share identical planned signatures.
 */
export function verifyProseStructuralVariation(outline: OutlineNode[]): {
  isValid: boolean;
  violationIndex?: number;
  signatures: string[];
} {
  const proseSignatures: string[] = [];

  for (const node of outline) {
    if (Array.isArray(node.blockPlans)) {
      for (const bp of node.blockPlans) {
        if (bp.mode === 'PROSE' && bp.targetSignature) {
          proseSignatures.push(bp.targetSignature);
        }
      }
    }
  }

  for (let i = 0; i < proseSignatures.length - 2; i++) {
    const s1 = proseSignatures[i];
    const s2 = proseSignatures[i + 1];
    const s3 = proseSignatures[i + 2];
    if (s1 === s2 && s2 === s3) {
      return {
        isValid: false,
        violationIndex: i,
        signatures: proseSignatures
      };
    }
  }

  return {
    isValid: true,
    signatures: proseSignatures
  };
}
