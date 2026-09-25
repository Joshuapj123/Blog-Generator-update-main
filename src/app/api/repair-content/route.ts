import { NextResponse } from 'next/server';
import { GeminiProvider } from '@/lib/content/GeminiProvider';
import { ContentRepairService } from '@/lib/content/ContentRepairService';
import { validateArticleQuality } from '@/lib/seo-intelligence/quality_validator';
import { computeStructuredScore } from '@/lib/content-scoring';
import { normalizeAiOutput } from '@/app/(main)/engine/utils/normalizeAiOutput';

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

    const llm = new GeminiProvider();
    const repairService = new ContentRepairService(llm);

    // 1. Perform Bounded Targeted Repair
    const repairResult = await repairService.repairTargetedDimension({
      title,
      bodyMarkdown: text,
      targetDimension: targetDimension as any,
      currentScore,
      targetThreshold,
      findings,
      primaryKeyword,
      searchIntent,
      businessContext,
      headings,
      entities,
      runId: 'repair_' + Date.now()
    });

    const repairedMarkdown = repairResult.repairedBodyMarkdown;
    const repairedTitle = repairResult.repairedTitle;

    // 2. Mandatory Revalidation
    const validationReport = validateArticleQuality(
      repairedMarkdown,
      primaryKeyword ? [primaryKeyword] : [],
      entities,
      targetBrand
    );

    // 3. Recompute Structured Quality Score
    const formattedHeadings = headings.length > 0 
      ? headings 
      : (repairedMarkdown.match(/^##\s+(.+)$/gm) || []).map((h: string) => h.replace(/^##\s+/, '').trim());

    const newScore = computeStructuredScore({
      textContext: repairedMarkdown,
      title: repairedTitle,
      headings: formattedHeadings,
      liveTerms: liveTerms.length > 0 ? liveTerms : [],
      entities: entities.map((name: string) => ({ name, type: 'concept', occurrences: 1 })),
      topTermsForIntent: scoringContext.topTermsForIntent || [],
      medianWordCount: scoringContext.medianWordCount || 1500,
      medianTitleLength: scoringContext.medianTitleLength || 60,
      medianH2Count: scoringContext.medianH2Count || formattedHeadings.length || 6,
      contentGapReport: scoringContext.contentGapReport,
      headingFrequency: scoringContext.headingFrequency,
      topicClusters: scoringContext.topicClusters,
      paaQuestions: scoringContext.paaQuestions,
      medianLexicalDiversity: scoringContext.medianLexicalDiversity || 0.35,
      featuredSnippetBlueprint: scoringContext.featuredSnippetBlueprint
    });

    // 4. Map dimension key for before/after comparison
    const dimKeyMap: Record<string, 'S' | 'E' | 'I' | 'O' | 'G' | 'R'> = {
      semantic: 'S',
      entity: 'E',
      intent: 'I',
      structure: 'O',
      gap: 'G',
      readability: 'R'
    };
    const dimKey = dimKeyMap[targetDimension.toLowerCase()] || 'R';
    const afterScore = newScore.breakdown[dimKey];
    const scoreImproved = repairResult.isNoOp ? true : (currentScore === undefined || afterScore > currentScore);

    // 5. Convert repaired Markdown to clean HTML for Tiptap editor
    const repairedHtml = normalizeAiOutput(repairedMarkdown);

    return NextResponse.json({
      success: true,
      repairedTitle,
      repairedMarkdown,
      repairedHtml,
      targetedDimension: targetDimension,
      isNoOp: repairResult.isNoOp || false,
      improved: scoreImproved,
      previousScore: currentScore,
      afterScore,
      newScore,
      validationReport,
      appliedFixes: repairResult.appliedFixes,
      summary: repairResult.isNoOp
        ? 'Content already meets quality standards for this dimension.'
        : `${targetDimension.charAt(0).toUpperCase() + targetDimension.slice(1)} score improved from ${currentScore ?? 0} to ${afterScore}.`
    });

  } catch (err: any) {
    console.error('[API Route: repair-content] Failed:', err.message);
    return NextResponse.json({ 
      error: err.message || 'Targeted repair failed',
      originalIntact: true
    }, { status: 500 });
  }
}
