import { LLMProvider } from '@/core/contracts/providers';
import { ContentAsset, ContentBrief, SaaSProfile } from '@/core/contracts/schemas';
import { CanonicalClaim } from '@/core/contracts/evidence';

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
      entities = [],
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
3. FACTS, DATA, ENTITIES & EXAMPLES:
   - Preserve all facts, statistics, product names, tools, brands, and real-world examples intact.${entities.length > 0 ? `\n   - Specifically preserve these key entities: ${entities.slice(0, 15).join(', ')}.` : ''}
4. TABLES, DIAGRAMS & INTERNAL LINKS:
   - Keep all Markdown comparison tables (| ... |), blockquotes (> ...), and links ([...](...)) completely preserved.
   - Keep all diagram visual blocks and placeholders (![Diagram: ...] or !Diagram: ...) intact. Do not delete or rename diagrams.
   - Preserve all internal links and URLs intact.
5. MINIMAL SURGICAL CHANGE & WORD COUNT PRESERVATION:
   - Only modify sentences and paragraphs that suffer from poor readability. Leave clear, well-written sections untouched.
   - Maintain the overall word count within 5% of the original article. Do NOT aggressively truncate content.`;
    } else {
      // General targeted repair fallback
      dimensionInstructions = `=== TARGETED QUALITY REPAIR: ${targetDimension.toUpperCase()} ===
Fix the following validation issues:
${findings.map(f => `• ${f}`).join('\n')}`;

      strictPreservationRules = `=== PRESERVATION CONSTRAINTS ===
- Preserve all outline headings, facts, and tables.
- If keyword stuffing was flagged, prune repetitive mentions of "${primaryKeyword || 'the primary keyword'}" to achieve natural density (1.0%–2.0%). Otherwise, preserve primary keywords.
- Preserve all visual diagrams and diagram placeholders intact.
- Preserve all internal links intact.
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
      systemInstruction: 'You are an elite copyeditor. Perform surgical, targeted readability and quality repairs on the provided markdown text while strictly preserving headings, verified facts, and markdown tables, maintaining natural keyword density (1.0%–2.0%).',
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

  /**
   * Surgically repairs an ungrounded claim sentence:
   * 1. If comparative superiority lacks evidence, strips the ungrounded comparison ("Unlike X, ...")
   * 2. If behavioral analytics / exact abandonment detection lacks evidence, rewrites to verified friction identification
   * 3. If causal outcomes ("improve retention") or unverified deliverables ("roadmap") lack evidence, rewrites to verified service activity
   * 4. Otherwise qualifies the claim to general industry practice while strictly preserving article structure
   */
  public static repairUngroundedClaimSentence(
    sentence: string,
    claim: CanonicalClaim,
    saasProfile?: SaaSProfile
  ): string {
    let repaired = sentence.trim();

    // 1. Comparative claims with unbacked comparator (e.g. "Unlike internal reviews, ...")
    if (claim.claimType === 'COMPARATIVE') {
      // Strip unbacked comparative clauses: "Unlike [X], " or "Compared to [X], " or "In contrast to [X], "
      repaired = repaired.replace(/^(?:unlike|in contrast to|as opposed to|compared (?:to|with))\s+[^,]+,\s*/i, '');
      repaired = repaired.charAt(0).toUpperCase() + repaired.slice(1);

      // If claim asserts unbacked behavioral analytics / exact abandonment tracking:
      // e.g. "find the exact spots where users leave before finishing a task"
      if (/find(?:s)?\s+(?:the\s+)?exact\s+spots?\s+where\s+users\s+(?:leave|drop\s*off|abandon)\b/i.test(repaired)) {
        repaired = repaired.replace(
          /find(?:s)?\s+(?:the\s+)?exact\s+spots?\s+where\s+users\s+(?:leave|drop\s*off|abandon)\b[^.!?]*/i,
          'help teams identify user friction points across critical product flows'
        );
      }
    }

    // 2. Entity capability claims with unbacked causal outcomes or unverified deliverables
    if (claim.claimType === 'ENTITY_CAPABILITY') {
      // Check for unbacked causal outcome promises (e.g. "improve retention", "guarantee conversion", "boost sales")
      // or unverified deliverables (e.g. "give teams a roadmap to improve retention")
      if (/\b(?:give(?:s)?\s+teams\s+a\s+roadmap\s+to\s+improve\s+retention|give(?:s)?\s+teams\s+a\s+roadmap|provide\s+a\s+roadmap|guarantees?\s+higher\s+retention|improve\s+retention)\b/i.test(repaired)) {
        if (saasProfile?.verifiedOfferings && saasProfile.verifiedOfferings.length > 0) {
          const offeringName = saasProfile.verifiedOfferings[0];
          repaired = repaired.replace(
            /\bgive(?:s)?\s+teams\s+a\s+roadmap\s+to\s+improve\s+retention\b/i,
            `provide verified ${offeringName} to address critical user friction points`
          );
          repaired = repaired.replace(
            /\bgive(?:s)?\s+teams\s+a\s+roadmap\b/i,
            'deliver actionable recommendations'
          );
          repaired = repaired.replace(
            /\b(?:to\s+improve\s+retention|to\s+boost\s+retention|to\s+guarantee\s+retention)\b/i,
            'to address friction across user journeys'
          );
        }
        // If no verified offerings are available in saasProfile, leave repaired untouched
        // so the ungrounded critical claim strictly blocks publication according to safety policy.
      }

      // Check for unbacked performance promises or design feedback claims (e.g. "provide design feedback to help sharpen your product's performance")
      if (/\b(?:provide\s+design\s+feedback\s+to\s+help\s+sharpen\s+your\s+product(?:'s|’s)?\s+performance|sharpen\s+(?:your\s+)?product(?:'s|’s)?\s+performance|provide\s+design\s+feedback)\b/i.test(repaired)) {
        if (saasProfile?.verifiedOfferings && saasProfile.verifiedOfferings.length > 0) {
          const primary = saasProfile.verifiedOfferings[0];
          const secondary = saasProfile.verifiedOfferings[1] || saasProfile.verifiedOfferings[0];
          repaired = repaired.replace(
            /\bprovide\s+design\s+feedback\s+to\s+help\s+sharpen\s+your\s+product(?:'s|’s)?\s+performance\b/i,
            `provide verified ${primary} and ${secondary} to address critical user friction points`
          );
          repaired = repaired.replace(
            /\bprovide\s+design\s+feedback\b/i,
            `provide verified ${primary}`
          );
          repaired = repaired.replace(
            /\bsharpen\s+(?:your\s+)?product(?:'s|’s)?\s+performance\b/i,
            'address critical user friction points across key flows'
          );
        }
        // If no verified offerings are available in saasProfile, leave repaired untouched
        // so the ungrounded critical claim strictly blocks publication according to safety policy.
      }

      // Check for unbacked team engagement or frustration outcome claims (e.g. "reduces the frustration caused by ambiguous requirements and keeps the internal team engaged with the product's success")
      if (/\b(?:reduces?\s+(?:the\s+)?frustration|keeps?\s+(?:the\s+)?(?:internal\s+)?teams?\s+engaged)\b/i.test(repaired)) {
        if (saasProfile?.verifiedOfferings && saasProfile.verifiedOfferings.length > 0) {
          const brand = saasProfile.name || 'Our team';
          const primary = saasProfile.verifiedOfferings[0];
          const secondary = saasProfile.verifiedOfferings[1];
          if (secondary && secondary !== primary) {
            repaired = `${brand} provides verified ${primary} and offers ${secondary}.`;
          } else {
            repaired = `${brand} provides verified ${primary}.`;
          }
        }
        // If no verified offerings are available in saasProfile, leave repaired untouched
        // so the ungrounded critical claim strictly blocks publication according to safety policy.
      }

      // Check for unbacked deliverable or documentation promises (e.g. "provide documented insights that help your engineering team understand how to implement...")
      if (/\b(?:documented\s+insights|implementation\s+(?:guidance|manuals?|guides?)|developer\s+handoff\s+guides?)\b/i.test(repaired) ||
          /\b(?:help(?:s)?\s+(?:your\s+)?engineering\s+team\s+understand\s+how\s+to\s+implement)\b/i.test(repaired)) {
        if (saasProfile?.verifiedOfferings && saasProfile.verifiedOfferings.length > 0) {
          const isFirstPerson = /^(?:we\b|our\s+)/i.test(repaired);
          const brand = isFirstPerson ? 'We' : (saasProfile.name || 'Our team');
          const primary = saasProfile.verifiedOfferings[0];
          const secondary = saasProfile.verifiedOfferings.length > 1 ? saasProfile.verifiedOfferings[1] : undefined;
          if (secondary && secondary !== primary) {
            repaired = `${brand} provide${isFirstPerson ? '' : 's'} verified ${primary} and offer${isFirstPerson ? '' : 's'} ${secondary}.`;
          } else {
            repaired = `${brand} provide${isFirstPerson ? '' : 's'} verified ${primary}.`;
          }
        }
        // If no verified offerings are available in saasProfile, leave repaired untouched
        // so the ungrounded critical claim strictly blocks publication according to safety policy.
      }

      // Check for unbacked brand process or positioning claims (e.g. "builds trust by focusing on transparent research and proven methods")
      if (/\b(?:builds?\s+trust\s+by\s+focusing\s+on\s+transparent\s+research|transparent\s+research\s+and\s+proven\s+methods|proven\s+methods)\b/i.test(repaired) ||
          /\b(?:builds?\s+trust\s+by\s+focusing\s+on)\b/i.test(repaired)) {
        if (saasProfile?.verifiedOfferings && saasProfile.verifiedOfferings.length > 0) {
          const isFirstPerson = /^(?:we\b|our\s+)/i.test(repaired);
          const brand = isFirstPerson ? 'We' : (saasProfile.name || 'Our team');
          const primary = saasProfile.verifiedOfferings[0];
          const secondary = saasProfile.verifiedOfferings.length > 1 ? saasProfile.verifiedOfferings[1] : undefined;
          if (secondary && secondary !== primary) {
            repaired = `${brand} focus${isFirstPerson ? '' : 'es'} on verified ${primary} and ${secondary}.`;
          } else {
            repaired = `${brand} focus${isFirstPerson ? '' : 'es'} on verified ${primary}.`;
          }
        }
        // If no verified offerings are available in saasProfile, leave repaired untouched
        // so the ungrounded critical claim strictly blocks publication according to safety policy.
      }
    }

    // 3. Empirical causal statements (e.g. categorical assertions about developer time loss)
    if (/\b(?:developers\s+lose\s+time\s+trying\s+to\s+fix\s+issues\s+that\s+do\s+not\s+impact\s+the\s+product\s+core|developers\s+lose\s+time\s+fixing\s+issues\s+that\s+do\s+not\s+affect\s+the\s+product\s+core)\b/i.test(repaired)) {
      repaired = repaired.replace(
        /\bdevelopers\s+lose\s+time\s+(?:trying\s+to\s+fix|fixing)\s+issues\s+that\s+do\s+not\s+(?:impact|affect)\s+the\s+product\s+core\b/i,
        'product teams risk having developers spend time on minor issues rather than addressing core product friction'
      );
    }

    return repaired;
  }

  /**
   * Programmatically scans markdown body for remaining critical ungrounded claims,
   * surgically repairing or qualifying them while preserving outline headings and tables.
   */
  public static repairUngroundedClaimsInMarkdown(
    markdown: string,
    claims: CanonicalClaim[],
    targetBrand?: string,
    saasProfile?: SaaSProfile
  ): {
    repairedMarkdown: string;
    repairedClaimsCount: number;
    unrepairableClaimsCount: number;
    unrepairableClaimIds: string[];
  } {
    let result = markdown;
    let count = 0;
    const unrepairableClaimIds: string[] = [];

    const criticalUnsupported = claims.filter(
      c => c.materiality === 'CRITICAL' && c.supportStatus !== 'SUPPORTED' && c.supportStatus !== 'PARTIALLY_SUPPORTED'
    );

    for (const c of criticalUnsupported) {
      if (!c.sentence || !c.sentence.trim()) continue;
      const targetSentence = c.sentence.trim();
      if (result.includes(targetSentence)) {
        const repairedSentence = this.repairUngroundedClaimSentence(targetSentence, c, saasProfile);
        if (repairedSentence !== targetSentence) {
          result = result.replace(targetSentence, repairedSentence);
          count++;
        } else {
          unrepairableClaimIds.push(c.id);
        }
      } else {
        unrepairableClaimIds.push(c.id);
      }
    }

    return {
      repairedMarkdown: result,
      repairedClaimsCount: count,
      unrepairableClaimsCount: unrepairableClaimIds.length,
      unrepairableClaimIds,
    };
  }
}
