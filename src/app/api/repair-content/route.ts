import { NextResponse } from 'next/server';
import { GeminiProvider } from '@/lib/content/GeminiProvider';
import { ContentRepairService } from '@/lib/content/ContentRepairService';
import { validateArticleQuality } from '@/lib/seo-intelligence/quality_validator';
import { computeStructuredScore } from '@/lib/content-scoring';
import { normalizeAiOutput } from '@/app/(main)/engine/utils/normalizeAiOutput';
import { DiagramAssetService } from '@/lib/content/DiagramAssetService';
import { htmlToMarkdown } from '@/lib/article-utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      text,
      title = 'Untitled',
      targetDimension = 'readability',
      findings = [],
      currentScore,
      baselineTotalScore,
      targetThreshold = 70,
      primaryKeyword = '',
      searchIntent = '',
      businessContext = '',
      headings = [],
      entities = [],
      targetBrand = '',
      liveTerms = [],
      scoringContext = {}
    } = body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'Text content is required for repair' }, { status: 400 });
    }

    // Convert input HTML to structured markdown if needed
    const inputMarkdown = htmlToMarkdown(text);

    // Extract outline headings if not provided
    const extractedHeadings = (inputMarkdown.match(/^##\s+(.+)$/gm) || []).map((h: string) => h.replace(/^##\s+/, '').trim());
    const activeHeadings = headings && headings.length > 0 ? headings : extractedHeadings;

    // 0. Compute Baseline Structured Quality Score Deterministically
    const baselineScore = computeStructuredScore({
      textContext: inputMarkdown,
      title,
      headings: activeHeadings,
      liveTerms: liveTerms.length > 0 ? liveTerms : [],
      entities: entities.map((name: string) => ({ name, type: 'concept' as const, occurrences: 1 })),
      topTermsForIntent: scoringContext.topTermsForIntent || [],
      medianWordCount: scoringContext.medianWordCount || 1500,
      medianTitleLength: scoringContext.medianTitleLength || 60,
      medianH2Count: scoringContext.medianH2Count || activeHeadings.length || 6,
      contentGapReport: scoringContext.contentGapReport,
      headingFrequency: scoringContext.headingFrequency,
      topicClusters: scoringContext.topicClusters,
      paaQuestions: scoringContext.paaQuestions,
      medianLexicalDiversity: scoringContext.medianLexicalDiversity || 0.35,
      featuredSnippetBlueprint: scoringContext.featuredSnippetBlueprint
    });

    const baselineReadiness = baselineTotalScore !== undefined ? baselineTotalScore : baselineScore.totalScore;

    // Map dimension key
    const dimKeyMap: Record<string, 'S' | 'E' | 'I' | 'O' | 'G' | 'R'> = {
      semantic: 'S',
      entity: 'E',
      intent: 'I',
      structure: 'O',
      gap: 'G',
      readability: 'R'
    };
    const dimKey = dimKeyMap[targetDimension.toLowerCase()] || 'R';
    const effectiveCurrentScore = currentScore ?? baselineScore.breakdown[dimKey];

    // Helper to count visual diagram occurrences
    const countDiagrams = (content: string) => {
      return DiagramAssetService.extractDiagramRequirements(content).length +
        (content.match(/data:image\/svg\+xml/gi) || []).length;
    };

    // Helper to count internal links
    const countInternalLinks = (content: string) => {
      const mdMatches = (content.match(/\[[^\]]+\]\(\/(?:[^\s\)]+)\)/g) || []).length;
      const htmlMatches = (content.match(/href=["']\/(?:[^"']+)["']/g) || []).length;
      return mdMatches + htmlMatches;
    };

    const beforeDiagramCount = countDiagrams(inputMarkdown);
    const beforeInternalLinkCount = countInternalLinks(inputMarkdown);

    // 1. Perform Bounded Targeted Repair
    const llm = new GeminiProvider();
    const repairService = new ContentRepairService(llm);

    const repairResult = await repairService.repairTargetedDimension({
      title,
      bodyMarkdown: inputMarkdown,
      targetDimension: targetDimension as any,
      currentScore: effectiveCurrentScore,
      targetThreshold,
      findings,
      primaryKeyword,
      searchIntent,
      businessContext,
      headings: activeHeadings,
      entities,
      runId: 'repair_' + Date.now()
    });

    if (repairResult.isNoOp) {
      return NextResponse.json({
        success: true,
        accepted: true,
        improved: true,
        repairedTitle: title,
        repairedMarkdown: inputMarkdown,
        repairedHtml: normalizeAiOutput(inputMarkdown),
        targetedDimension: targetDimension,
        isNoOp: true,
        baselineReadiness,
        improvedReadiness: baselineReadiness,
        previousScore: effectiveCurrentScore,
        afterScore: effectiveCurrentScore,
        baselineScore,
        newScore: baselineScore,
        appliedFixes: repairResult.appliedFixes,
        summary: 'Content already meets quality standards for this dimension.'
      });
    }

    let repairedMarkdown = repairResult.repairedBodyMarkdown;
    const repairedTitle = repairResult.repairedTitle;

    // Strip any diagram placeholders from repaired markdown
    repairedMarkdown = DiagramAssetService.stripDiagramPlaceholders(repairedMarkdown);

    // 2. Mandatory Revalidation
    const validationReport = validateArticleQuality(
      repairedMarkdown,
      primaryKeyword ? [primaryKeyword] : [],
      entities,
      targetBrand
    );

    // 3. Recompute Structured Quality Score
    const repairedHeadings = (repairedMarkdown.match(/^##\s+(.+)$/gm) || []).map((h: string) => h.replace(/^##\s+/, '').trim());
    const finalHeadings = repairedHeadings.length > 0 ? repairedHeadings : activeHeadings;

    const newScore = computeStructuredScore({
      textContext: repairedMarkdown,
      title: repairedTitle,
      headings: finalHeadings,
      liveTerms: liveTerms.length > 0 ? liveTerms : [],
      entities: entities.map((name: string) => ({ name, type: 'concept' as const, occurrences: 1 })),
      topTermsForIntent: scoringContext.topTermsForIntent || [],
      medianWordCount: scoringContext.medianWordCount || 1500,
      medianTitleLength: scoringContext.medianTitleLength || 60,
      medianH2Count: scoringContext.medianH2Count || finalHeadings.length || 6,
      contentGapReport: scoringContext.contentGapReport,
      headingFrequency: scoringContext.headingFrequency,
      topicClusters: scoringContext.topicClusters,
      paaQuestions: scoringContext.paaQuestions,
      medianLexicalDiversity: scoringContext.medianLexicalDiversity || 0.35,
      featuredSnippetBlueprint: scoringContext.featuredSnippetBlueprint
    });

    const afterScore = newScore.breakdown[dimKey];
    const improvedReadiness = newScore.totalScore;

    // 4. Quality Preservation Gate Evaluation
    const afterDiagramCount = countDiagrams(repairedMarkdown);
    const afterInternalLinkCount = countInternalLinks(repairedMarkdown);

    const isReadinessPreserved = improvedReadiness >= baselineReadiness;
    const isDiagramPreserved = beforeDiagramCount === 0 || afterDiagramCount >= beforeDiagramCount;
    const isLinksPreserved = beforeInternalLinkCount === 0 || afterInternalLinkCount >= beforeInternalLinkCount;
    const isContentIntact = Boolean(repairedMarkdown && repairedMarkdown.trim().length >= 100);

    const accepted = isReadinessPreserved && isDiagramPreserved && isLinksPreserved && isContentIntact;

    if (!accepted) {
      let rejectedReason = `Improvement rejected: Proposed changes reduced article readiness from ${baselineReadiness} to ${improvedReadiness}. Baseline preserved.`;
      if (!isDiagramPreserved) {
        rejectedReason = `Improvement rejected: Proposed changes damaged visual diagram assets. Baseline preserved.`;
      } else if (!isLinksPreserved) {
        rejectedReason = `Improvement rejected: Proposed changes removed internal links. Baseline preserved.`;
      } else if (!isContentIntact) {
        rejectedReason = `Improvement rejected: Proposed changes returned empty or malformed content. Baseline preserved.`;
      }

      console.warn(`[Quality Gate] ${rejectedReason}`);

      return NextResponse.json({
        success: true,
        accepted: false,
        improved: false,
        rejectedReason,
        summary: rejectedReason,
        baselineReadiness,
        improvedReadiness,
        previousScore: effectiveCurrentScore,
        afterScore: effectiveCurrentScore,
        baselineScore,
        newScore: baselineScore, // Keep baseline score intact
        repairedTitle: title,
        repairedMarkdown: inputMarkdown,
        repairedHtml: normalizeAiOutput(inputMarkdown),
        targetedDimension: targetDimension,
        isNoOp: false,
        validationReport
      });
    }

    // 5. Accepted: Convert repaired Markdown to clean HTML for Tiptap editor
    const repairedHtml = normalizeAiOutput(repairedMarkdown);

    return NextResponse.json({
      success: true,
      accepted: true,
      improved: true,
      repairedTitle,
      repairedMarkdown,
      repairedHtml,
      targetedDimension: targetDimension,
      isNoOp: false,
      baselineReadiness,
      improvedReadiness,
      previousScore: effectiveCurrentScore,
      afterScore,
      baselineScore,
      newScore,
      validationReport,
      appliedFixes: repairResult.appliedFixes,
      summary: `${targetDimension.charAt(0).toUpperCase() + targetDimension.slice(1)} improved: ${effectiveCurrentScore} → ${afterScore} (Readiness: ${baselineReadiness} → ${improvedReadiness}).`
    });

  } catch (err: any) {
    console.error('[API Route: repair-content] Failed:', err.message);
    return NextResponse.json({ 
      error: err.message || 'Targeted repair failed',
      originalIntact: true
    }, { status: 500 });
  }
}
