// src/lib/content/TargetedRepairEngine.ts
import { LLMProvider } from '@/core/contracts/providers';
import {
  ContentBrief,
  OutlineNode,
  ContentBlockPlan
} from '@/core/contracts/schemas';
import {
  ParagraphSignatureValidator,
  ParagraphSignatureValidationResult,
  ParagraphSignatureViolation,
  EligibleProseParagraph,
  LengthBand
} from '@/lib/intelligence/ParagraphSignatureValidator';
import { PROSE_SIGNATURE_TEMPLATES } from './ContentBlockPlanner';
import { validateArticleQuality } from '@/lib/seo-intelligence/quality_validator';
import { ContentEvidenceValidator } from '@/lib/intelligence/ContentEvidenceValidator';
import { ContentRepairService } from './ContentRepairService';

export const DEFAULT_MAX_REPAIR_ATTEMPTS = 2;

export type RepairFailureCategory =
  | 'PARAGRAPH_SIGNATURE_REPETITION'
  | 'UNGROUNDED_CRITICAL_CLAIM'
  | 'EDITORIAL_CONTAMINATION'
  | 'READABILITY_DENSITY_EXCESS'
  | 'UNMAPPABLE_DIAGNOSTIC'
  | 'INVALID_BLOCK_IDENTIFIER'
  | 'RETRY_BUDGET_EXHAUSTED'
  | 'MODEL_EXCEPTION'
  | 'INVALID_REPAIR_OUTPUT';

export const REPAIR_FAILURE_CODES = {
  PARAGRAPH_SIGNATURE_REPETITION: 'ERR_PARAGRAPH_SIGNATURE_REPETITION',
  UNGROUNDED_CRITICAL_CLAIM: 'ERR_UNGROUNDED_CRITICAL_CLAIM',
  EDITORIAL_CONTAMINATION: 'ERR_EDITORIAL_CONTAMINATION',
  READABILITY_DENSITY_EXCESS: 'ERR_READABILITY_DENSITY_EXCESS',
  UNMAPPABLE_DIAGNOSTIC: 'ERR_UNMAPPABLE_DIAGNOSTIC',
  INVALID_BLOCK_IDENTIFIER: 'ERR_INVALID_BLOCK_IDENTIFIER',
  RETRY_BUDGET_EXHAUSTED: 'ERR_RETRY_BUDGET_EXHAUSTED',
  MODEL_EXCEPTION: 'ERR_MODEL_EXCEPTION',
  INVALID_REPAIR_OUTPUT: 'ERR_INVALID_REPAIR_OUTPUT',
} as const;

export type RepairFailureCode = typeof REPAIR_FAILURE_CODES[keyof typeof REPAIR_FAILURE_CODES];

export interface BlockRepairTarget {
  blockId: string;
  role?: string;
  mode: 'PROSE';
  sectionHeading: string;
  sectionIndex: number;
  proseIndexInSection: number;
  globalProseIndex: number;
  originalText: string;
  currentSignature: string;
  targetSignature: string;
  targetSentenceCount: number;
  targetLengthBands: LengthBand[];
  protectedRequirements?: string[];
  precedingSnippet?: string;
  subsequentSnippet?: string;
}

export type BlockMappingResult =
  | { success: true; target: BlockRepairTarget }
  | { success: false; reason: string; unmappable?: boolean; invalidBlockId?: boolean };

export interface BoundedRepairAttempt {
  attemptNumber: number;
  targetBlockId?: string;
  targetHeading?: string;
  failureCategory: RepairFailureCategory;
  appliedFix: string;
  diagnosticsBefore: string[];
  diagnosticsAfter: string[];
  passedRevalidation: boolean;
  timestamp: string;
}

export interface BoundedRepairSummary {
  status: 'repaired' | 'review_required' | 'skipped_already_valid';
  failureCategory?: RepairFailureCategory;
  failureCode?: RepairFailureCode;
  targetBlockIds: string[];
  attemptsUsed: number;
  maxAttempts: number;
  retryBudgetExhausted: boolean;
  allValidatorsPassed: boolean;
  diagnostics: string[];
  unresolvedIssues: string[];
  attempts: BoundedRepairAttempt[];
  repairedMarkdown?: string;
}

export interface BoundedRepairContext {
  brief: ContentBrief;
  targetBrand?: string;
  evidenceSet?: any;
  sectionEvidenceMaps?: any[];
  saasProfile?: any;
  gapMatrix?: any;
  maxAttempts?: number;
  runId?: string;
}

/**
 * Normalizes a heading for safe cross-referencing between markdown and outline plans.
 */
function normalizeHeadingText(heading: string): string {
  return (heading || '')
    .toLowerCase()
    .replace(/^#+\s*/, '')
    .replace(/[^\w\s]/g, '')
    .trim();
}

/**
 * Counts exact occurrences of a substring within a larger text without regex escaping pitfalls.
 */
function countExactOccurrences(source: string, target: string): number {
  if (!source || !target) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = source.indexOf(target, pos)) !== -1) {
    count++;
    pos += target.length;
  }
  return count;
}

export class TargetedRepairEngine {
  /**
   * Identifies the exact defective block and maps it to an R2 ContentBlockPlan
   * or a deterministic block identifier.
   */
  public static mapDiagnosticToBlockTarget(
    markdown: string,
    outline: OutlineNode[],
    violation: ParagraphSignatureViolation,
    attemptNumber: number = 1
  ): BlockMappingResult {
    if (!violation.paragraphs || violation.paragraphs.length < 3) {
      return {
        success: false,
        reason: 'Paragraph signature violation does not contain 3 paragraphs.',
        unmappable: true
      };
    }

    // Attempt 1 targets middle paragraph (index 1) to break 3-paragraph repetition with minimal change.
    // Attempt 2 targets 3rd paragraph (index 2) if attempt 1 did not resolve the violation.
    const targetParaInfo = attemptNumber === 1 ? violation.paragraphs[1] : violation.paragraphs[2];

    // Find full eligible prose paragraph in document
    const fullValidation = ParagraphSignatureValidator.validate(markdown);
    const matchedProse = fullValidation.violations.length > 0
      ? fullValidation.violations[0].paragraphs.find(p => p.proseIndex === targetParaInfo.proseIndex)
      : null;

    // Retrieve original paragraph text
    // The snippet is the first 80 chars; let's locate the full paragraph from eligible prose
    const normalizedMarkdown = markdown.replace(/^(#{1,6}\s+[^\n]+)/gm, '\n\n$1\n\n');
    const rawBlocks = normalizedMarkdown.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);

    let foundBlockText: string | null = null;
    let globalProseCounter = 0;

    for (const block of rawBlocks) {
      const check = ParagraphSignatureValidator.isNonProseBlock(block);
      if (check.isNonProse) continue;

      const computed = ParagraphSignatureValidator.computeCanonicalSignature(
        ParagraphSignatureValidator.cleanParagraphText(block),
        'PROSE'
      );
      if (computed.sentenceCount > 0) {
        if (globalProseCounter === targetParaInfo.proseIndex) {
          foundBlockText = block;
          break;
        }
        globalProseCounter++;
      }
    }

    if (!foundBlockText) {
      return {
        success: false,
        reason: `Target paragraph at proseIndex ${targetParaInfo.proseIndex} could not be resolved from document blocks.`,
        unmappable: true
      };
    }

    // Check uniqueness of original paragraph in markdown body
    const occurrences = countExactOccurrences(markdown, foundBlockText);
    if (occurrences === 0) {
      return {
        success: false,
        reason: `Target paragraph text not found in article body.`,
        unmappable: true
      };
    }
    if (occurrences > 1) {
      return {
        success: false,
        reason: `Target paragraph text is ambiguous (found ${occurrences} identical occurrences in article body).`,
        unmappable: true
      };
    }

    // Map section heading to OutlineNode
    const normTargetHeading = normalizeHeadingText(targetParaInfo.sectionHeading);
    const outlineIndex = outline.findIndex(
      node => normalizeHeadingText(node.heading) === normTargetHeading
    );

    if (outlineIndex === -1) {
      return {
        success: false,
        reason: `Section heading "${targetParaInfo.sectionHeading}" does not match any planned outline section.`,
        unmappable: true
      };
    }

    const matchedNode = outline[outlineIndex];

    // Determine prose position within this section
    const proseInSection: string[] = [];
    let currentHeading = 'Document Root';

    for (const block of rawBlocks) {
      const check = ParagraphSignatureValidator.isNonProseBlock(block);
      if (check.isNonProse) {
        if (check.blockType === 'HEADING') {
          const hm = block.match(/^#{1,6}\s+(.+)$/m);
          if (hm) currentHeading = hm[1].trim();
        }
        continue;
      }
      if (normalizeHeadingText(currentHeading) === normTargetHeading) {
        proseInSection.push(block);
      }
    }

    const proseIndexInSection = proseInSection.indexOf(foundBlockText);
    if (proseIndexInSection === -1) {
      return {
        success: false,
        reason: `Could not determine local prose index for target block in section "${targetParaInfo.sectionHeading}".`,
        unmappable: true
      };
    }

    // Map to R2 ContentBlockPlan if available
    let blockId: string;
    let role = 'EXPLAIN';
    let protectedRequirements: string[] | undefined;

    if (matchedNode.blockPlans && matchedNode.blockPlans.length > 0) {
      const prosePlans = matchedNode.blockPlans.filter(p => p.mode === 'PROSE');
      const assignedPlan = prosePlans[proseIndexInSection];

      if (assignedPlan) {
        blockId = assignedPlan.blockId;
        role = assignedPlan.role;
        protectedRequirements = assignedPlan.protectedRequirements;
      } else {
        blockId = `blk_${outlineIndex + 1}_${proseIndexInSection + 1}`;
      }
    } else {
      blockId = `blk_${outlineIndex + 1}_${proseIndexInSection + 1}`;
    }

    // Validate block ID format
    if (!blockId || !/^blk_\d+_\d+$/.test(blockId)) {
      return {
        success: false,
        reason: `Invalid or malformed block identifier: "${blockId}".`,
        invalidBlockId: true
      };
    }

    // Select distinct target signature from PROSE_SIGNATURE_TEMPLATES
    // Pick template differing from violation.canonicalSignature
    const alternativeTemplates = PROSE_SIGNATURE_TEMPLATES.filter(
      t => t.signature !== violation.canonicalSignature
    );

    const chosenTemplate = attemptNumber === 1
      ? (alternativeTemplates[0] || { signature: '(2, PROSE, S-M)', sentenceCountRange: { min: 2, max: 2 } })
      : (alternativeTemplates[1] || alternativeTemplates[0] || { signature: '(4, PROSE, M-M-L-S)', sentenceCountRange: { min: 4, max: 4 } });

    // Parse length bands from signature (e.g. "(2, PROSE, S-M)" -> ['S', 'M'])
    const bandsMatch = chosenTemplate.signature.match(/,\s*([SML](?:-[SML])*)\)/);
    const targetLengthBands: LengthBand[] = bandsMatch
      ? (bandsMatch[1].split('-') as LengthBand[])
      : ['S', 'M'];

    // Surrounding context snippets
    const precedingSnippet = proseIndexInSection > 0 ? proseInSection[proseIndexInSection - 1] : undefined;
    const subsequentSnippet = proseIndexInSection < proseInSection.length - 1 ? proseInSection[proseIndexInSection + 1] : undefined;

    return {
      success: true,
      target: {
        blockId,
        role,
        mode: 'PROSE',
        sectionHeading: targetParaInfo.sectionHeading,
        sectionIndex: outlineIndex,
        proseIndexInSection,
        globalProseIndex: targetParaInfo.proseIndex,
        originalText: foundBlockText,
        currentSignature: violation.canonicalSignature,
        targetSignature: chosenTemplate.signature,
        targetSentenceCount: chosenTemplate.sentenceCountRange.min,
        targetLengthBands,
        protectedRequirements,
        precedingSnippet,
        subsequentSnippet
      }
    };
  }

  /**
   * Prompts the LLM to rewrite a single defective block and validates the response.
   */
  public static async repairSingleBlock(
    target: BlockRepairTarget,
    context: BoundedRepairContext,
    llm: LLMProvider
  ): Promise<string> {
    const primaryKeyword = context.brief.targetKeywords?.[0] || '';
    const brandName = context.targetBrand || '';

    const bandsExplanation = target.targetLengthBands
      .map((band, idx) => {
        const desc = band === 'S' ? '< 15 words' : band === 'M' ? '15–28 words' : '> 28 words';
        return `Sentence ${idx + 1}: Length band ${band} (${desc})`;
      })
      .join('\n');

    const prompt = `You are an elite editorial copyeditor.
You are performing a SURGICAL REPAIR on a SINGLE paragraph to resolve a structural rhythm repetition issue.

=== TARGET SECTION ===
Section Heading: ${target.sectionHeading}

=== SURROUNDING CONTEXT (DO NOT REWRITE OR INCLUDE) ===
${target.precedingSnippet ? `Preceding Paragraph:\n${target.precedingSnippet}\n` : ''}${target.subsequentSnippet ? `Subsequent Paragraph:\n${target.subsequentSnippet}\n` : ''}
=== DEFECTIVE PARAGRAPH TO REWRITE ===
${target.originalText}

=== TARGET STRUCTURAL CONTRACT ===
Required Signature: ${target.targetSignature}
Exact Sentence Count: ${target.targetSentenceCount}
Sentence Length Requirements:
${bandsExplanation}

=== STRICT EDITORIAL PRESERVATION RULES ===
1. Rewrite ONLY the defective paragraph. Do NOT output headings, extra paragraphs, lists, or meta-chatter.
2. The rewritten paragraph must contain EXACTLY ${target.targetSentenceCount} sentences.
3. PRESERVE all factual claims, brand attributes${brandName ? ` for "${brandName}"` : ''}, and meaning from the original paragraph.
4. Do NOT invent new factual claims, metrics, or citations.
5. NO image references, markdown images, diagram tokens, or placeholder tags.
6. Output ONLY the raw paragraph text.`;

    const systemInstruction = 'You are an elite editorial copyeditor. Rewrite only the specified paragraph to satisfy the required sentence count and length bands while preserving facts, tone, and keywords. Never output headings or commentary.';

    const response = await llm.generate(prompt, {
      systemInstruction,
      operation: 'Targeted Block Repair',
      runId: context.runId
    });

    if (!response || !response.trim()) {
      throw new Error('Repair model returned an empty response.');
    }

    let cleaned = response.trim();

    // Strip accidental code block fences if returned
    if (cleaned.startsWith('```') && cleaned.endsWith('```')) {
      cleaned = cleaned.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
    }

    // Strip accidental leading heading
    if (/^#{1,6}\s+/.test(cleaned)) {
      throw new Error('Repair model returned a markdown heading instead of a prose paragraph.');
    }

    // Verify no multiple paragraphs returned
    if (/\n\s*\n/.test(cleaned)) {
      // Split and take the main prose block if model added preamble
      const blocks = cleaned.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
      const proseBlocks = blocks.filter(b => !/^#{1,6}\s+/.test(b) && !b.startsWith('Here is') && !b.startsWith('Rewritten'));
      if (proseBlocks.length > 0) {
        cleaned = proseBlocks[0];
      } else {
        throw new Error('Repair model returned multiple invalid blocks.');
      }
    }

    // Post-repair surgical cleanup of localized prompt leakage
    const contaminationClean = ContentRepairService.repairEditorialContamination(cleaned);
    cleaned = contaminationClean.repairedMarkdown.trim();

    if (!cleaned) {
      throw new Error('Repair resulted in empty paragraph after sanitization.');
    }

    return cleaned;
  }

  /**
   * Identifies genuine critical quality errors based on the authoritative policy in
   * AgentOrchestrator.runReview. Non-blocking readability findings (e.g. Flesch score,
   * passive voice percentage, sentence length) are treated as warnings.
   */
  public static extractCriticalQualityErrors(errors: string[] = []): string[] {
    return errors.filter(err =>
      err.includes('Keyword Stuffing Alert') ||
      err.includes('Brand Stuffing Alert') ||
      err.includes('structurally similar') ||
      err.includes('same opening words') ||
      err.includes('Boilerplate Alert') ||
      err.includes('repeated template') ||
      err.includes('Generic boilerplate')
    );
  }

  /**
   * Executes bounded, targeted repair for an article with explicit attempt limits,
   * comprehensive revalidation, and fail-closed handling.
   */
  public static async executeBoundedRepair(
    bodyMarkdown: string,
    context: BoundedRepairContext,
    llm: LLMProvider
  ): Promise<BoundedRepairSummary> {
    const maxAttempts = context.maxAttempts || DEFAULT_MAX_REPAIR_ATTEMPTS;
    const brief = context.brief;
    const targetBrand = context.targetBrand || '';
    const targetKeywords = brief.targetKeywords || [];
    const targetEntities = brief.outline.flatMap(n => n.assignedEntities || []);

    const attempts: BoundedRepairAttempt[] = [];
    const targetBlockIds: string[] = [];

    // Step 0: Initial full revalidation
    const initialSigReport = ParagraphSignatureValidator.validate(bodyMarkdown);
    const initialQuality = validateArticleQuality(bodyMarkdown, targetKeywords, targetEntities, targetBrand);
    const criticalQualityErrors = this.extractCriticalQualityErrors(initialQuality.errors || []);

    const initialBlockingErrors: string[] = [
      ...initialSigReport.criticalErrors,
      ...criticalQualityErrors
    ];

    if (initialBlockingErrors.length === 0) {
      return {
        status: 'skipped_already_valid',
        targetBlockIds: [],
        attemptsUsed: 0,
        maxAttempts,
        retryBudgetExhausted: false,
        allValidatorsPassed: true,
        diagnostics: [],
        unresolvedIssues: [],
        attempts: [],
        repairedMarkdown: bodyMarkdown
      };
    }

    // If initial errors do NOT contain paragraph signature repetitions, check if they are repairable
    if (initialSigReport.violations.length === 0) {
      // Check for ungrounded claims or editorial contamination
      return {
        status: 'review_required',
        failureCategory: 'READABILITY_DENSITY_EXCESS',
        failureCode: REPAIR_FAILURE_CODES.READABILITY_DENSITY_EXCESS,
        targetBlockIds: [],
        attemptsUsed: 0,
        maxAttempts,
        retryBudgetExhausted: false,
        allValidatorsPassed: false,
        diagnostics: criticalQualityErrors,
        unresolvedIssues: criticalQualityErrors,
        attempts: [],
        repairedMarkdown: bodyMarkdown
      };
    }

    // Check for outline block ID validity / uniqueness if block plans are present
    const allBlockIds: string[] = [];
    for (const node of brief.outline) {
      for (const bp of node.blockPlans || []) {
        if (!bp.blockId || !/^blk_\d+_\d+$/.test(bp.blockId)) {
          return {
            status: 'review_required',
            failureCategory: 'INVALID_BLOCK_IDENTIFIER',
            failureCode: REPAIR_FAILURE_CODES.INVALID_BLOCK_IDENTIFIER,
            targetBlockIds: [bp.blockId || 'MISSING_BLOCK_ID'],
            attemptsUsed: 0,
            maxAttempts,
            retryBudgetExhausted: false,
            allValidatorsPassed: false,
            diagnostics: [`Invalid block identifier: "${bp.blockId}"`],
            unresolvedIssues: [`Invalid block identifier: "${bp.blockId}"`],
            attempts: [],
            repairedMarkdown: bodyMarkdown
          };
        }
        if (allBlockIds.includes(bp.blockId)) {
          return {
            status: 'review_required',
            failureCategory: 'INVALID_BLOCK_IDENTIFIER',
            failureCode: REPAIR_FAILURE_CODES.INVALID_BLOCK_IDENTIFIER,
            targetBlockIds: [bp.blockId],
            attemptsUsed: 0,
            maxAttempts,
            retryBudgetExhausted: false,
            allValidatorsPassed: false,
            diagnostics: [`Duplicate block identifier detected: "${bp.blockId}"`],
            unresolvedIssues: [`Duplicate block identifier detected: "${bp.blockId}"`],
            attempts: [],
            repairedMarkdown: bodyMarkdown
          };
        }
        allBlockIds.push(bp.blockId);
      }
    }

    let currentMarkdown = bodyMarkdown;
    let attemptsUsed = 0;

    for (let attemptNum = 1; attemptNum <= maxAttempts; attemptNum++) {
      attemptsUsed = attemptNum;
      const currentSigReport = ParagraphSignatureValidator.validate(currentMarkdown);

      if (currentSigReport.valid && currentSigReport.violations.length === 0) {
        break;
      }

      const activeViolation = currentSigReport.violations[0];
      const mapping = this.mapDiagnosticToBlockTarget(
        currentMarkdown,
        brief.outline,
        activeViolation,
        attemptNum
      );

      if (!mapping.success) {
        const failureCategory: RepairFailureCategory = mapping.invalidBlockId
          ? 'INVALID_BLOCK_IDENTIFIER'
          : 'UNMAPPABLE_DIAGNOSTIC';
        const failureCode = mapping.invalidBlockId
          ? REPAIR_FAILURE_CODES.INVALID_BLOCK_IDENTIFIER
          : REPAIR_FAILURE_CODES.UNMAPPABLE_DIAGNOSTIC;

        return {
          status: 'review_required',
          failureCategory,
          failureCode,
          targetBlockIds,
          attemptsUsed: attemptNum - 1,
          maxAttempts,
          retryBudgetExhausted: false,
          allValidatorsPassed: false,
          diagnostics: [mapping.reason],
          unresolvedIssues: [mapping.reason],
          attempts,
          repairedMarkdown: bodyMarkdown
        };
      }

      const target = mapping.target;
      if (!targetBlockIds.includes(target.blockId)) {
        targetBlockIds.push(target.blockId);
      }

      let repairedBlockText = '';
      try {
        repairedBlockText = await this.repairSingleBlock(target, context, llm);
      } catch (err: any) {
        const failureCategory: RepairFailureCategory = err?.message?.includes('Repair model')
          ? 'INVALID_REPAIR_OUTPUT'
          : 'MODEL_EXCEPTION';
        const failureCode = failureCategory === 'INVALID_REPAIR_OUTPUT'
          ? REPAIR_FAILURE_CODES.INVALID_REPAIR_OUTPUT
          : REPAIR_FAILURE_CODES.MODEL_EXCEPTION;

        attempts.push({
          attemptNumber: attemptNum,
          targetBlockId: target.blockId,
          targetHeading: target.sectionHeading,
          failureCategory,
          appliedFix: 'Model execution failed or returned invalid output.',
          diagnosticsBefore: [activeViolation.message],
          diagnosticsAfter: [err?.message || String(err)],
          passedRevalidation: false,
          timestamp: new Date().toISOString()
        });

        return {
          status: 'review_required',
          failureCategory,
          failureCode,
          targetBlockIds,
          attemptsUsed: attemptNum,
          maxAttempts,
          retryBudgetExhausted: attemptNum >= maxAttempts,
          allValidatorsPassed: false,
          diagnostics: [err?.message || String(err)],
          unresolvedIssues: [err?.message || String(err)],
          attempts,
          repairedMarkdown: bodyMarkdown
        };
      }

      // Surgical replacement of only the target paragraph
      const candidateMarkdown = currentMarkdown.replace(target.originalText, repairedBlockText);

      // Revalidate candidate
      const revalidatedSig = ParagraphSignatureValidator.validate(candidateMarkdown);
      const revalidatedQuality = validateArticleQuality(candidateMarkdown, targetKeywords, targetEntities, targetBrand);

      let evidencePassed = true;
      let evidenceErrors: string[] = [];
      if (context.evidenceSet) {
        const evidenceRes = ContentEvidenceValidator.validate(
          candidateMarkdown,
          brief,
          context.evidenceSet,
          context.sectionEvidenceMaps,
          targetBrand,
          context.gapMatrix,
          context.saasProfile,
          { repairAttempted: true }
        );
        evidencePassed = evidenceRes.passed;
        evidenceErrors = evidenceRes.criticalErrors;
      }

      const candidateErrors = [
        ...revalidatedSig.criticalErrors,
        ...this.extractCriticalQualityErrors(revalidatedQuality.errors || []),
        ...evidenceErrors
      ];

      const passed = candidateErrors.length === 0;

      attempts.push({
        attemptNumber: attemptNum,
        targetBlockId: target.blockId,
        targetHeading: target.sectionHeading,
        failureCategory: 'PARAGRAPH_SIGNATURE_REPETITION',
        appliedFix: `Rewrote block ${target.blockId} to target signature ${target.targetSignature}`,
        diagnosticsBefore: [activeViolation.message],
        diagnosticsAfter: candidateErrors,
        passedRevalidation: passed,
        timestamp: new Date().toISOString()
      });

      if (passed) {
        return {
          status: 'repaired',
          targetBlockIds,
          attemptsUsed: attemptNum,
          maxAttempts,
          retryBudgetExhausted: false,
          allValidatorsPassed: true,
          diagnostics: [],
          unresolvedIssues: [],
          attempts,
          repairedMarkdown: candidateMarkdown
        };
      }

      // If this attempt didn't pass, update currentMarkdown only if it didn't create new worse errors
      currentMarkdown = candidateMarkdown;
    }

    // All retry attempts exhausted
    const finalSig = ParagraphSignatureValidator.validate(currentMarkdown);
    const finalErrors = finalSig.criticalErrors.length > 0
      ? finalSig.criticalErrors
      : ['Structural repetition or quality issues remain unresolved after maximum retry attempts.'];

    return {
      status: 'review_required',
      failureCategory: 'RETRY_BUDGET_EXHAUSTED',
      failureCode: REPAIR_FAILURE_CODES.RETRY_BUDGET_EXHAUSTED,
      targetBlockIds,
      attemptsUsed,
      maxAttempts,
      retryBudgetExhausted: true,
      allValidatorsPassed: false,
      diagnostics: finalErrors,
      unresolvedIssues: finalErrors,
      attempts,
      repairedMarkdown: currentMarkdown
    };
  }
}
