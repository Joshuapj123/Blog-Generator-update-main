/**
 * KeywordAuditService
 *
 * Deterministic, post-draft keyword and phrase repetition audit.
 * Measures exact-match occurrences, multiword density, section-by-section distribution,
 * repeated n-gram patterns, and enforces calibrated warning (1.5-2.0%) vs critical (>3.0%) thresholds.
 */

export interface KeywordSectionDistribution {
  sectionHeading: string;
  sectionLevel: string;
  sectionIndex: number;
  wordCount: number;
  primaryKeywordCount: number;
  primaryKeywordDensity: number;
  secondaryKeywordCounts: Record<string, number>;
}

export interface SecondaryKeywordMetric {
  keyword: string;
  occurrences: number;
  density: number;
}

export interface RepeatedPhrase {
  phrase: string;
  count: number;
}

export interface KeywordAuditMetrics {
  primaryKeyword: string;
  primaryOccurrences: number;
  primaryDensity: number;
  secondaryKeywordMetrics: SecondaryKeywordMetric[];
  totalWordCount: number;
  cleanText: string;
  sectionDistribution: KeywordSectionDistribution[];
  repeatedPhrases: RepeatedPhrase[];
  warnings: string[];
  criticalErrors: string[];
  isExcessive: boolean; // Triggers critical failure (> 3.0% and >= 3 occurrences)
  isWarning: boolean;   // Triggers warning (elevated 2.0-3.0% or clustering)
}

export interface KeywordAuditOptions {
  warningThresholdPercent?: number;  // Default 2.0%
  criticalThresholdPercent?: number; // Default 3.0%
  minOccurrencesForStuffing?: number;// Default 3 (prevents false positives on short articles)
  maxSectionClustering?: number;     // Default 4 mentions in a single section
}

export class KeywordAuditService {
  private static readonly DEFAULT_WARNING_THRESHOLD = 2.0;
  private static readonly DEFAULT_CRITICAL_THRESHOLD = 3.0;
  private static readonly DEFAULT_MIN_OCCURRENCES_FOR_STUFFING = 3;
  private static readonly DEFAULT_MAX_SECTION_CLUSTERING = 4;

  // Common grammatical stopword phrases to exclude from n-gram repetition detection
  private static readonly STOPWORD_NGRAMS = new Set([
    'in order to',
    'as well as',
    'at the same',
    'the same time',
    'one of the',
    'part of the',
    'it is important',
    'it is essential',
    'on the other',
    'the other hand',
    'for example the',
    'such as the',
    'as a result',
    'to ensure that',
    'in addition to',
    'as part of',
    'due to the',
    'based on the',
    'in terms of',
    'with respect to',
    'can be used',
    'is one of',
    'are one of',
  ]);

  /**
   * Normalizes markdown into clean text for exact keyword counting and word count calculation.
   * Strips code blocks, HTML, link URLs (keeping anchor text), and table syntax.
   */
  public static normalizeMarkdownForAudit(markdown: string): { cleanText: string; totalWords: number } {
    if (!markdown || !markdown.trim()) {
      return { cleanText: '', totalWords: 0 };
    }

    let text = markdown;

    // 1. Remove fenced code blocks
    text = text.replace(/```[\s\S]*?```/g, ' ');

    // 2. Remove inline code
    text = text.replace(/`[^`]+`/g, ' ');

    // 3. Remove HTML tags
    text = text.replace(/<[^>]+>/g, ' ');

    // 4. Strip image markdown ![alt](url)
    text = text.replace(/!\[[^\]]*\]\([^\)]+\)/g, ' ');

    // 5. Convert markdown links [anchor](url) to anchor text only
    text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');

    // 6. Strip standalone URLs
    text = text.replace(/https?:\/\/[^\s\)\],]+/gi, ' ');

    // 7. Strip markdown table pipes, dashes, colons
    text = text.replace(/^[|\s\-:]+$/gm, ' ');
    text = text.replace(/\|/g, ' ');

    // 8. Strip blockquotes, list markers, and heading hashes
    text = text.replace(/^[>#*\-+\d.]+\s+/gm, ' ');

    // 9. Clean excessive whitespace while preserving paragraph breaks
    text = text.replace(/[ \t]+/g, ' ');
    const cleanText = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n\n');
    const words = cleanText.split(/\s+/).filter(Boolean);
    const totalWords = words.length;

    return { cleanText, totalWords };
  }

  /**
   * Builds a safe, whitespace-flexible regex with word boundaries for an arbitrary keyword phrase.
   */
  public static buildKeywordRegex(keyword: string): RegExp {
    const escaped = keyword
      .trim()
      .split(/\s+/)
      .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s+');
    return new RegExp(`\\b${escaped}\\b`, 'gi');
  }

  /**
   * Counts occurrences of a keyword in text using word boundaries.
   */
  public static countKeywordOccurrences(text: string, keyword: string): number {
    if (!text || !keyword || !keyword.trim()) return 0;
    const regex = this.buildKeywordRegex(keyword);
    const matches = text.match(regex);
    return matches ? matches.length : 0;
  }

  /**
   * Calculates multiword keyword density: (occurrences * keywordWords / totalWords) * 100
   */
  public static calculateDensity(occurrences: number, keyword: string, totalWords: number): number {
    if (totalWords <= 0 || occurrences <= 0 || !keyword) return 0;
    const kwWords = keyword.trim().split(/\s+/).filter(Boolean).length || 1;
    return ((occurrences * kwWords) / totalWords) * 100;
  }

  /**
   * Extracts section-level outline slices and analyzes keyword distribution by section.
   */
  public static analyzeSectionDistribution(
    markdown: string,
    primaryKeyword: string,
    secondaryKeywords: string[] = []
  ): KeywordSectionDistribution[] {
    const sections: KeywordSectionDistribution[] = [];
    const sectionRegex = /(?:^|\n)(#{2,3})\s+([^\n]+)/g;
    const matches: Array<{ heading: string; level: string; index: number }> = [];
    let match: RegExpExecArray | null;

    while ((match = sectionRegex.exec(markdown)) !== null) {
      matches.push({
        heading: match[2].trim(),
        level: match[1],
        index: match.index + match[0].indexOf('#'),
      });
    }

    if (matches.length === 0) {
      // Single undivided document
      const { cleanText, totalWords } = this.normalizeMarkdownForAudit(markdown);
      const pCount = this.countKeywordOccurrences(cleanText, primaryKeyword);
      const pDensity = this.calculateDensity(pCount, primaryKeyword, totalWords);
      const secCounts: Record<string, number> = {};
      for (const sk of secondaryKeywords) {
        secCounts[sk] = this.countKeywordOccurrences(cleanText, sk);
      }

      sections.push({
        sectionHeading: 'Full Article',
        sectionLevel: 'H2',
        sectionIndex: 0,
        wordCount: totalWords,
        primaryKeywordCount: pCount,
        primaryKeywordDensity: pDensity,
        secondaryKeywordCounts: secCounts,
      });
      return sections;
    }

    for (let i = 0; i < matches.length; i++) {
      const current = matches[i];
      const startPos = current.index;
      const endPos = i < matches.length - 1 ? matches[i + 1].index : markdown.length;
      const sectionText = markdown.slice(startPos, endPos);
      const { cleanText, totalWords } = this.normalizeMarkdownForAudit(sectionText);

      const pCount = this.countKeywordOccurrences(cleanText, primaryKeyword);
      const pDensity = this.calculateDensity(pCount, primaryKeyword, totalWords);
      const secCounts: Record<string, number> = {};
      for (const sk of secondaryKeywords) {
        secCounts[sk] = this.countKeywordOccurrences(cleanText, sk);
      }

      sections.push({
        sectionHeading: current.heading,
        sectionLevel: current.level,
        sectionIndex: i,
        wordCount: totalWords,
        primaryKeywordCount: pCount,
        primaryKeywordDensity: pDensity,
        secondaryKeywordCounts: secCounts,
      });
    }

    return sections;
  }

  /**
   * Detects repeated n-grams (3 to 5 words) appearing with suspicious frequency (>= 4 times).
   */
  public static detectRepeatedPhrases(cleanText: string, minRepetitions: number = 4): RepeatedPhrase[] {
    if (!cleanText) return [];
    const tokens = cleanText.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
    if (tokens.length < 12) return [];

    const phraseCounts: Map<string, number> = new Map();

    // Check 3-word, 4-word, and 5-word phrases
    for (let n = 3; n <= 5; n++) {
      for (let i = 0; i <= tokens.length - n; i++) {
        const slice = tokens.slice(i, i + n);
        const phrase = slice.join(' ');
        if (this.STOPWORD_NGRAMS.has(phrase)) continue;
        phraseCounts.set(phrase, (phraseCounts.get(phrase) || 0) + 1);
      }
    }

    const results: RepeatedPhrase[] = [];
    for (const [phrase, count] of phraseCounts.entries()) {
      if (count >= minRepetitions) {
        results.push({ phrase, count });
      }
    }

    // Sort descending by count and length
    results.sort((a, b) => b.count - a.count || b.phrase.length - a.phrase.length);

    // Filter sub-phrases if larger phrase has identical count
    const filtered: RepeatedPhrase[] = [];
    for (const item of results) {
      const isSub = filtered.some(existing => existing.phrase.includes(item.phrase) && existing.count === item.count);
      if (!isSub) {
        filtered.push(item);
      }
    }

    return filtered.slice(0, 5);
  }

  /**
   * Performs the comprehensive deterministic keyword audit.
   */
  public static auditKeywords(
    markdown: string,
    primaryKeyword: string,
    secondaryKeywords: string[] = [],
    options?: KeywordAuditOptions
  ): KeywordAuditMetrics {
    const warningThreshold = options?.warningThresholdPercent ?? this.DEFAULT_WARNING_THRESHOLD;
    const criticalThreshold = options?.criticalThresholdPercent ?? this.DEFAULT_CRITICAL_THRESHOLD;
    const minOccurrencesForStuffing = options?.minOccurrencesForStuffing ?? this.DEFAULT_MIN_OCCURRENCES_FOR_STUFFING;
    const maxSectionClustering = options?.maxSectionClustering ?? this.DEFAULT_MAX_SECTION_CLUSTERING;

    const { cleanText, totalWords } = this.normalizeMarkdownForAudit(markdown);

    const primaryOccurrences = this.countKeywordOccurrences(cleanText, primaryKeyword);
    const primaryDensity = this.calculateDensity(primaryOccurrences, primaryKeyword, totalWords);

    const secondaryMetrics: SecondaryKeywordMetric[] = [];
    for (const sk of secondaryKeywords) {
      if (!sk || !sk.trim()) continue;
      const count = this.countKeywordOccurrences(cleanText, sk);
      const density = this.calculateDensity(count, sk, totalWords);
      secondaryMetrics.push({ keyword: sk, occurrences: count, density });
    }

    const sectionDistribution = this.analyzeSectionDistribution(markdown, primaryKeyword, secondaryKeywords);
    const repeatedPhrases = this.detectRepeatedPhrases(cleanText);

    const warnings: string[] = [];
    const criticalErrors: string[] = [];

    // 1. Primary Keyword Stuffing Evaluation
    // Safeguard for short articles: if total occurrences <= 2, it is NOT stuffing (e.g. 1 mention in an 80-word excerpt)
    const isShortArticleNaturalUsage = totalWords < 400 && primaryOccurrences < minOccurrencesForStuffing;
    const isExcessive = primaryDensity > criticalThreshold && primaryOccurrences >= minOccurrencesForStuffing && !isShortArticleNaturalUsage;

    if (isExcessive) {
      criticalErrors.push(
        `Keyword Stuffing Alert: Primary keyword "${primaryKeyword}" has density of ${primaryDensity.toFixed(2)}% (${primaryOccurrences} occurrences in ${totalWords} words), exceeding the safe maximum threshold of ${criticalThreshold}%.`
      );
    } else if (primaryDensity > warningThreshold && primaryOccurrences >= 2 && !isShortArticleNaturalUsage) {
      warnings.push(
        `Elevated keyword density: Primary keyword "${primaryKeyword}" has density of ${primaryDensity.toFixed(2)}% (above recommended ${warningThreshold}% guidance). Consider using pronouns or semantic variations.`
      );
    }

    // 2. Secondary Keyword Stuffing Evaluation
    for (const sm of secondaryMetrics) {
      if (sm.density > criticalThreshold && sm.occurrences >= minOccurrencesForStuffing) {
        criticalErrors.push(
          `Keyword Stuffing Alert: Secondary keyword "${sm.keyword}" has density of ${sm.density.toFixed(2)}% (exceeds ${criticalThreshold}%).`
        );
      } else if (sm.density > warningThreshold && sm.occurrences >= 2) {
        warnings.push(
          `Elevated secondary keyword density: Keyword "${sm.keyword}" has density of ${sm.density.toFixed(2)}%.`
        );
      }
    }

    // 3. Section Clustering Evaluation
    for (const sec of sectionDistribution) {
      if (sec.primaryKeywordCount >= maxSectionClustering && sec.wordCount < 400) {
        warnings.push(
          `Keyword clustering detected: Section "${sec.sectionHeading}" contains ${sec.primaryKeywordCount} mentions of "${primaryKeyword}" in ${sec.wordCount} words (${sec.primaryKeywordDensity.toFixed(1)}% density). Distribute mentions more evenly across sections.`
        );
      }
    }

    // 4. Repeated Non-Stopword Phrases Evaluation
    for (const rp of repeatedPhrases) {
      if (rp.count >= 5) {
        warnings.push(
          `Repetitive phrase pattern: Phrase "${rp.phrase}" is repeated ${rp.count} times in the body.`
        );
      }
    }

    const isWarning = warnings.length > 0;

    return {
      primaryKeyword,
      primaryOccurrences,
      primaryDensity,
      secondaryKeywordMetrics: secondaryMetrics,
      totalWordCount: totalWords,
      cleanText,
      sectionDistribution,
      repeatedPhrases,
      warnings,
      criticalErrors,
      isExcessive,
      isWarning,
    };
  }
}
