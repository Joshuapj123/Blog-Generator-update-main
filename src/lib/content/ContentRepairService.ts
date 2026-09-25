// src/lib/content/ContentRepairService.ts
import { LLMProvider } from '@/core/contracts/providers';
import { ContentAsset, ContentBrief } from '@/core/contracts/schemas';

export interface TargetedRepairRequest {
  title: string;
  bodyMarkdown: string;
  targetDimension: 'readability' | 'semantic' | 'entity' | 'structure' | 'gap' | 'all';
  currentScore?: number;
  targetThreshold?: number;
  findings: string[];
  primaryKeyword?: string;
  searchIntent?: string;
  businessContext?: string;
  headings?: string[];
  entities?: string[];
  runId?: string;
}

export interface TargetedRepairResult {
  repairedTitle: string;
  repairedBodyMarkdown: string;
  wordCount: number;
  targetedDimension: string;
  appliedFixes: string[];
  isNoOp?: boolean;
}

export class ContentRepairService {
  constructor(private llmProvider: LLMProvider) {}

  /**
   * Existing legacy repair method for full brief repairs during pipeline generation.
   */
  async repairContent(
    content: ContentAsset,
    brief: ContentBrief,
    issues: string[],
    runId?: string
  ): Promise<ContentAsset> {
    const prompt = `Repair the following article body to resolve these quality validation issues:
${issues.map(i => `- ${i}`).join('\n')}

Original Article Title: ${brief.title}
Original Article Body:
${content.bodyMarkdown}`;

    const repairedBody = await this.llmProvider.generate(prompt, {
      systemInstruction: 'You are an elite copyeditor. Rewrite the article body to fix all listed quality and readability issues while keeping all facts, keywords, and outline headings exactly the same.',
      operation: 'Content Quality Repair',
      runId,
    });

    const wordCount = repairedBody.split(/\s+/).filter(Boolean).length;

    return {
      ...content,
      bodyMarkdown: repairedBody,
      wordCount,
    };
  }

  /**
   * Bounded, targeted repair for specific validation dimensions (e.g. Readability).
   * Makes the smallest useful change necessary while strictly preserving what already passed.
   */
  async repairTargetedDimension(request: TargetedRepairRequest): Promise<TargetedRepairResult> {
    const {
      title,
      bodyMarkdown,
      targetDimension,
      currentScore,
      targetThreshold = 70,
      findings = [],
      primaryKeyword = '',
      searchIntent = '',
      businessContext = '',
      headings = [],
      runId
    } = request;

    // 1. No-op check: If there are no issues and the score already meets or exceeds the target threshold
    if (findings.length === 0 && (currentScore !== undefined && currentScore >= targetThreshold)) {
      return {
        repairedTitle: title,
        repairedBodyMarkdown: bodyMarkdown,
        wordCount: bodyMarkdown.split(/\s+/).filter(Boolean).length,
        targetedDimension: targetDimension,
        appliedFixes: ['Content already satisfies quality standards for this dimension.'],
        isNoOp: true
      };
    }

    // 2. Build targeted, surgical prompt based on dimension
    let dimensionInstructions = '';
    let strictPreservationRules = '';

    if (targetDimension === 'readability') {
      dimensionInstructions = `=== TARGETED READABILITY REPAIR OBJECTIVE ===
Your sole objective is to improve the READABILITY & NATURAL SCANNABILITY of this article to an 8th-grade reading level (Flesch Reading Ease score >= 60, target 65-75).
Concrete validation issues reported for this article:
${findings.length > 0 ? findings.map(f => `• ${f}`).join('\n') : '• Average paragraph or sentence density is higher than ideal.'}

SPECIFIC READABILITY ACTIONS REQUIRED:
1. PARAGRAPH CONTRACT:
   - Split any paragraph longer than 80 words into 2-3 shorter, focused paragraphs (30-60 words / 1-3 sentences each).
   - Ensure healthy whitespace and scannable visual rhythm.
2. SENTENCE CONTRACT:
   - Split complex, compound sentences longer than 30 words into two shorter, punchy sentences.
   - Target an average sentence length of 14-18 words.
   - Eliminate unnecessary passive voice; use direct, active verbs.
3. PLAIN ENGLISH & TONE:
   - Replace dense corporate jargon and buzzwords (e.g. "orchestration", "synergistic", "transformative", "paradigm", "holistic", "seamlessly") with simple, everyday language.
   - Improve flow and transitions between thoughts.`;

      strictPreservationRules = `=== STRICT PRESERVATION CONSTRAINTS (DO NOT ALTER) ===
1. HEADINGS:
   - Keep ALL existing ## (H2) and ### (H3) section headings EXACTLY as they are. Do not add, remove, or rename headings.
2. CANONICAL PRIMARY KEYWORD:
   - Ensure the primary keyword "${primaryKeyword || 'target keyword'}" remains naturally in the first paragraph and relevant sections. Do not alter or omit it.
3. FACTS, DATA & EXAMPLES:
   - Preserve all facts, statistics, product names, tools, brands, and real-world examples intact.
4. TABLES & LINKS:
   - Keep all Markdown comparison tables (| ... |), blockquotes (> ...), and links ([...](...)) completely preserved.
5. MINIMAL SURGICAL CHANGE:
   - Only modify sentences and paragraphs that suffer from poor readability. Leave clear, well-written sections untouched.`;
    } else {
      // General targeted repair fallback
      dimensionInstructions = `=== TARGETED QUALITY REPAIR: ${targetDimension.toUpperCase()} ===
Fix the following validation issues:
${findings.map(f => `• ${f}`).join('\n')}`;

      strictPreservationRules = `=== PRESERVATION CONSTRAINTS ===
- Preserve all outline headings, facts, keywords, and tables.
- Make the smallest useful change necessary.`;
    }

    const hasTitleIssue = findings.some(f => f.toLowerCase().includes('title'));

    const prompt = `You are an elite editorial proofreader and SEO copyeditor performing a surgical, targeted content repair.

${dimensionInstructions}

${strictPreservationRules}

${primaryKeyword ? `Target Keyword: "${primaryKeyword}"` : ''}
${searchIntent ? `Search Intent: "${searchIntent}"` : ''}
${businessContext ? `Business Context: ${businessContext}` : ''}
${headings.length > 0 ? `Expected Outline Headings:\n${headings.map(h => `- ${h}`).join('\n')}` : ''}

Original Article Title: ${title}
Original Article Body:
${bodyMarkdown}

Output format:
${hasTitleIssue ? 'OPTIMIZED TITLE: [Your optimized title here]\n\n' : ''}REPAIRED BODY:
[Your repaired markdown body here]`;

    const responseText = await this.llmProvider.generate(prompt, {
      systemInstruction: 'You are an elite copyeditor. Perform surgical, targeted readability and quality repairs on the provided markdown text while strictly preserving headings, facts, primary keywords, and markdown tables.',
      operation: `Targeted Quality Repair (${targetDimension})`,
      runId,
    });

    if (!responseText || !responseText.trim()) {
      throw new Error(`Targeted repair model returned an empty response for dimension: ${targetDimension}`);
    }

    let repairedTitle = title;
    let repairedBody = responseText;

    if (hasTitleIssue && responseText.includes('REPAIRED BODY:')) {
      const parts = responseText.split('REPAIRED BODY:');
      const titlePart = parts[0].replace('OPTIMIZED TITLE:', '').trim();
      repairedTitle = titlePart.split('\n')[0].trim() || title;
      repairedBody = parts[1].trim();
    } else if (responseText.includes('REPAIRED BODY:')) {
      repairedBody = responseText.split('REPAIRED BODY:')[1].trim();
    }

    const wordCount = repairedBody.split(/\s+/).filter(Boolean).length;

    return {
      repairedTitle,
      repairedBodyMarkdown: repairedBody,
      wordCount,
      targetedDimension: targetDimension,
      appliedFixes: findings.length > 0 ? findings : ['Applied targeted readability optimizations.'],
      isNoOp: false
    };
  }
}
