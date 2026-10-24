import { KeywordAuditService } from './KeywordAuditService';

export interface QualityValidationReport {
  valid: boolean;
  errors: string[];
  warnings?: string[];
  metrics: {
    averageSentenceLength: number;
    passiveVoicePercent: number;
    hasConsecutiveStarts: boolean;
    hasConsecutiveStructures: boolean;
    fleschReadingEase: number;
    averageParagraphLength: number;
    maxKeywordDensity: { keyword: string; density: number };
    maxEntityCount: { entity: string; count: number };
    hasSentencePatternRepeats: boolean;
    paragraphSimilarities: Array<{ p1Index: number; p2Index: number; similarity: number }>;
  };
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function countSyllablesInWord(word: string): number {
  let w = word.toLowerCase().trim().replace(/[^\w]/g, '');
  if (w.length <= 3) return 1;
  // Standard syllable heuristics
  w = w.replace(/(?:es|ed|[^laeiouy]e)$/, '');
  w = w.replace(/^y/, '');
  const vowels = w.match(/[aeiouy]{1,2}/g);
  return vowels ? vowels.length : 1;
}

export function isPassiveSentence(sentence: string): boolean {
  const clean = sentence.toLowerCase().trim();
  // Standard passive construction: be/is/am/are/was/were/been/being + past participle (usually ending in -ed, -en, -t, or irregulars)
  const passivePattern = /\b(is|am|are|was|were|be|been|being)\b\s+(?:[a-z]+\s+){0,2}[a-z]+(ed|en|t)\b/i;
  const irregularParticiples = /\b(is|am|are|was|were|be|been|being)\b\s+(?:[a-z]+\s+){0,2}(done|made|built|kept|set|run|read|met|paid|shown|known|given|held|seen|drawn|told|chosen|sent|spent|kept|felt)\b/i;

  return passivePattern.test(clean) || irregularParticiples.test(clean);
}

export function getWordTokens(text: string): Set<string> {
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2);
  return new Set(words);
}

export function calculateJaccardSimilarity(text1: string, text2: string): number {
  const tokens1 = getWordTokens(text1);
  const tokens2 = getWordTokens(text2);
  if (tokens1.size === 0 || tokens2.size === 0) return 0;

  let intersectionSize = 0;
  for (const t of tokens1) {
    if (tokens2.has(t)) {
      intersectionSize++;
    }
  }
  const unionSize = tokens1.size + tokens2.size - intersectionSize;
  return intersectionSize / unionSize;
}

export function checkParagraphSimilarity(paragraphs: string[]): Array<{ p1Index: number; p2Index: number; similarity: number }> {
  const similarities: Array<{ p1Index: number; p2Index: number; similarity: number }> = [];
  for (let i = 0; i < paragraphs.length; i++) {
    for (let j = i + 1; j < paragraphs.length; j++) {
      const sim = calculateJaccardSimilarity(paragraphs[i], paragraphs[j]);
      if (sim > 0.75) {
        similarities.push({ p1Index: i, p2Index: j, similarity: sim });
      }
    }
  }
  return similarities;
}

export function consecutiveParagraphStarts(paragraphs: string[]): boolean {
  const groups: string[][] = [];
  let currentGroup: string[] = [];

  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (trimmed === '__SECTION_BOUNDARY__' || /^#{1,2}\s+/.test(trimmed)) {
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
        currentGroup = [];
      }
    } else if (trimmed.length > 0) {
      currentGroup.push(trimmed);
    }
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  for (const group of groups) {
    if (group.length < 4) continue;
    for (let i = 0; i <= group.length - 4; i++) {
      const starts = group.slice(i, i + 4).map(p => {
        const words = p.trim().toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
        return words.slice(0, 2).join(' '); // first two words
      });
      if (starts[0] && starts.every(s => s === starts[0])) {
        return true;
      }
    }
  }
  return false;
}

export function splitSentencesRobust(text: string): string[] {
  if (!text || !text.trim()) return [];
  const normalized = text
    .replace(/https?:\/\/[^\s\)\],]+/gi, match => match.replace(/\./g, '__DOT__'))
    .replace(/(\d+)\.(\d+)/g, (_, p1, p2) => `${p1}__DOT__${p2}`)
    .replace(/\b(?:e\.g\.|i\.e\.|vs\.|approx\.|etc\.|al\.|inc\.|corp\.|ltd\.|dr\.|mr\.|ms\.)/gi, match => match.replace(/\./g, '__DOT__'));

  const rawSentences = normalized.split(/(?<=[.!?]['"”’\)])\s+|(?<=[.!?])\s+/);
  return rawSentences
    .map(s => s.replace(/__DOT__/g, '.').trim())
    .filter(s => s.length > 0);
}

export function computeParagraphSignature(paragraph: string): {
  sentenceCount: number;
  sentenceLengthSignature: string;
} {
  const sentences = splitSentencesRobust(paragraph);
  const sentenceCount = sentences.length;
  const sentenceLengthSignature = sentences.map(s => {
    const cleanSentence = s.replace(/[*_`#]/g, '').trim();
    const wc = countWords(cleanSentence);
    return wc < 15 ? 'S' : wc <= 28 ? 'M' : 'L';
  }).join('-');
  return { sentenceCount, sentenceLengthSignature };
}

export function extractEligibleProseParagraphs(text: string, options?: { respectSectionBoundaries?: boolean }): string[] {
  if (!text) return [];
  const normalized = text.replace(/^(#{1,6}\s+[^\n]+)/gm, '\n\n$1\n\n');
  const rawBlocks = normalized.split(/\n\s*\n/);
  const eligible: string[] = [];
  const shouldRespectBoundaries = options?.respectSectionBoundaries !== false;

  for (const raw of rawBlocks) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    // Major Section Headings (# or ##): establish distinct semantic section boundaries
    if (/^#{1,2}\s+/.test(trimmed)) {
      if (shouldRespectBoundaries) {
        eligible.push('__SECTION_BOUNDARY__');
      }
      continue;
    }

    // Minor Subheadings (### through ######): intra-section subheads do not reset section boundary
    if (/^#{3,6}\s+/.test(trimmed)) continue;

    // Structured data: tables and lists are excluded from prose paragraphs and do not break rhythm
    if (trimmed.startsWith('|')) continue;
    if (/^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) continue;

    // Decorative & Media blocks: images, raw HTML, horizontal rules, code fences, blockquotes
    if (trimmed.startsWith('![')) continue;
    if (trimmed.startsWith('<')) continue;
    if (/^[-*]{3,}$/.test(trimmed)) continue;
    if (trimmed.startsWith('```')) continue;
    if (trimmed.startsWith('>')) continue;

    eligible.push(trimmed);
  }

  return eligible;
}

export function consecutiveParagraphStructures(
  paragraphs: string[],
  options?: { respectSectionBoundaries?: boolean }
): boolean {
  if (paragraphs.length < 3) return false;

  // Group into contiguous blocks of prose paragraphs, respecting major headings and section boundaries
  const groups: string[][] = [];
  let currentGroup: string[] = [];

  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (trimmed === '__SECTION_BOUNDARY__' || /^#{1,2}\s+/.test(trimmed)) {
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
        currentGroup = [];
      }
    } else if (trimmed.length > 0) {
      currentGroup.push(trimmed);
    }
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  for (const group of groups) {
    if (group.length < 3) continue;

    const signatures = group.map(p => computeParagraphSignature(p));

    for (let i = 0; i <= signatures.length - 3; i++) {
      const sameSentenceCount =
        signatures[i].sentenceCount === signatures[i + 1].sentenceCount &&
        signatures[i + 1].sentenceCount === signatures[i + 2].sentenceCount;

      const sameLengthSignature =
        signatures[i].sentenceLengthSignature === signatures[i + 1].sentenceLengthSignature &&
        signatures[i + 1].sentenceLengthSignature === signatures[i + 2].sentenceLengthSignature;

      // Exact structural rhythm match: sentence count and sentence length sequence match across 3 consecutive paragraphs.
      // Formatting differences alone do not suppress a genuine repetition match.
      if (sameSentenceCount && sameLengthSignature) {
        return true;
      }
    }
  }
  return false;
}

export function checkSentencePatternRepeats(sentences: string[]): boolean {
  const startPhrases: { [key: string]: number } = {};
  for (const s of sentences) {
    const words = s.trim().toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      const opening = words.slice(0, 2).join(' ');
      // Ignore common helper or structural word patterns
      const ignored = [
        'there is', 'there are', 'it is', 'we can', 'this is', 'in the', 'for example',
        'to do', 'if you', 'with the', 'on the', 'at the', 'and the', 'of the', 'as a',
        'in a', 'by using', 'this allows', 'to ensure', 'you can', 'we have', 'this will'
      ];
      if (ignored.includes(opening)) continue;
      startPhrases[opening] = (startPhrases[opening] || 0) + 1;
      if (startPhrases[opening] > 3) {
        return true;
      }
    }
  }
  return false;
}

export function normalizeTextForReadability(text: string): string {
  if (!text) return '';
  let cleaned = text;

  // 1. Strip fenced code blocks
  cleaned = cleaned.replace(/```[\s\S]*?```/g, ' ');

  // 2. Strip inline code
  cleaned = cleaned.replace(/`[^`\n]+`/g, ' ');

  // 3. Strip data URIs
  cleaned = cleaned.replace(/data:[a-zA-Z0-9/+-]+;base64,[a-zA-Z0-9+/=]+/gi, ' ');

  // 4. Strip markdown image tags
  cleaned = cleaned.replace(/!\[[^\]]*\]\([^\)]+\)/g, ' ');

  // 5. Convert markdown links [text](url) to anchor text only
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');

  // 6. Strip HTML tags and SVGs
  cleaned = cleaned.replace(/<[^>]+>/g, ' ');

  // 7. Strip raw URLs
  cleaned = cleaned.replace(/https?:\/\/[^\s\)\],]+/gi, ' ');

  // 8. Handle markdown tables:
  // Remove markdown table separator lines like | :--- | ---: |
  cleaned = cleaned.replace(/^\|?\s*[-:]+[-| :]*\|?\s*$/gm, ' ');
  // Replace table pipe delimiters with period and space so table cells become discrete phrases
  cleaned = cleaned.replace(/\|/g, '. ');

  // 9. Strip markdown heading indicators
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');

  // 10. Strip blockquote indicators and list bullets
  cleaned = cleaned.replace(/^[\s>*-]+/gm, '');

  // Normalize multiple periods/whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

export function calculateFleschReadingEase(text: string): number {
  const normalized = normalizeTextForReadability(text);
  const words = normalized.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  if (wordCount === 0) return 100;

  // Split into sentences using a regex that handles abbreviations reasonably
  const sentenceCount = normalized.split(/[.!?]+/).filter(s => s.trim().length > 0).length || 1;

  let syllableCount = 0;
  for (const w of words) {
    syllableCount += countSyllablesInWord(w);
  }

  const fre = 206.835 - 1.015 * (wordCount / sentenceCount) - 84.6 * (syllableCount / wordCount);
  return Math.round(fre * 100) / 100;
}

export function validateArticleQuality(
  text: string,
  keywords: string[],
  entities: string[],
  targetBrand?: string
): QualityValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const cleanParagraph = (p: string) => {
    return p
      .replace(/data:[a-zA-Z0-9/+-]+;base64,[a-zA-Z0-9+/=]+/gi, ' ')
      .replace(/!\[[^\]]*\]\([^\)]+\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/https?:\/\/[^\s\)\],]+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Parse eligible prose paragraphs and sentences
  // Exclude empty paragraphs, headings, tables, raw HTML blocks, list items, and image lines from paragraph prose evaluation
  const paragraphs = extractEligibleProseParagraphs(text);
  const proseParagraphsOnly = paragraphs.filter(p => p !== '__SECTION_BOUNDARY__');

  const normalizedText = normalizeTextForReadability(text);
  const sentences = splitSentencesRobust(normalizedText);

  const words = normalizedText.trim().split(/\s+/).filter(Boolean);
  const totalWordCount = words.length;

  // 1. Average Sentence Length
  const sentenceWordCounts = sentences.map(s => countWords(s));
  const avgSentenceLength = sentenceWordCounts.length > 0
    ? sentenceWordCounts.reduce((a, b) => a + b, 0) / sentenceWordCounts.length
    : 0;

  if (avgSentenceLength > 30) {
    errors.push(`Average sentence length is ${avgSentenceLength.toFixed(1)} words (exceeds limit of 30).`);
  }

  // 2. Passive Voice
  const passiveCount = sentences.filter(s => isPassiveSentence(s)).length;
  const passivePercent = sentences.length > 0 ? (passiveCount / sentences.length) * 100 : 0;
  if (passivePercent > 25) {
    errors.push(`Passive voice density is ${passivePercent.toFixed(1)}% (exceeds limit of 25%).`);
  }

  // 3. Consecutive Paragraph Starts
  const hasConsecutiveStarts = consecutiveParagraphStarts(paragraphs);
  if (hasConsecutiveStarts) {
    errors.push(`More than 3 consecutive paragraphs begin with the same opening words.`);
  }

  // 4. Consecutive Paragraph Structures
  const hasConsecutiveStructures = consecutiveParagraphStructures(paragraphs);
  if (hasConsecutiveStructures) {
    warnings.push(`More than 2 consecutive paragraphs have identical sentence count and format structure.`);
  }

  // 5. Flesch Reading Ease
  const fre = calculateFleschReadingEase(text);
  if (fre < 55) {
    errors.push(`Flesch Reading Ease score is ${fre} (below minimum required 55).`);
  }

  // 6. Average Paragraph Length
  const paragraphWordCounts = proseParagraphsOnly.map(p => countWords(cleanParagraph(p))).filter(c => c > 0);
  const avgParagraphLength = paragraphWordCounts.length > 0
    ? paragraphWordCounts.reduce((a, b) => a + b, 0) / paragraphWordCounts.length
    : 0;

  if (avgParagraphLength > 180) {
    errors.push(`Average paragraph length is ${avgParagraphLength.toFixed(1)} words (exceeds limit of 180).`);
  }

  // 6.1. Individual Paragraph Length (limit of 150 error, >80 warning)
  proseParagraphsOnly.forEach((rawP, idx) => {
    const p = cleanParagraph(rawP);
    if (!p) return;
    const wCount = countWords(p);
    if (wCount > 150) {
      errors.push(`Paragraph ${idx + 1} is too long (${wCount} words, exceeds limit of 150 words). Please break it into shorter paragraphs.`);
    } else if (wCount > 80) {
      warnings.push(`Paragraph ${idx + 1} is too long (${wCount} words, exceeds recommended limit of 80 words). Please split it into 1-3 sentence paragraphs.`);
    }

    // 6.2. Individual Sentence Length (limit of 35)
    const pSentences = p.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
    pSentences.forEach(s => {
      const sWords = countWords(s);
      if (sWords > 35) {
        errors.push(`Sentence is too long (${sWords} words, exceeds limit of 35): "${s.slice(0, 40)}..."`);
      }
    });
  });

  // 7. Paragraph Similarities (>75% Jaccard similarity)
  const paragraphSimilarities = checkParagraphSimilarity(proseParagraphsOnly);
  if (paragraphSimilarities.length > 0) {
    paragraphSimilarities.forEach(sim => {
      errors.push(`Paragraph ${sim.p1Index + 1} and Paragraph ${sim.p2Index + 1} are ${Math.round(sim.similarity * 100)}% structurally similar (exceeds limit of 75%).`);
    });
  }

  // 8. Keyword stuffing density check (>3% keyword density via KeywordAuditService)
  let maxKeyword = '';
  let maxDensity = 0;
  const validKeywords = (keywords || []).filter(kw => kw && kw.trim().length > 0);
  if (validKeywords.length > 0 && totalWordCount > 0) {
    const primaryKw = validKeywords[0];
    const secondaryKws = validKeywords.slice(1);
    const audit = KeywordAuditService.auditKeywords(text, primaryKw, secondaryKws, {
      warningThresholdPercent: 2.0,
      criticalThresholdPercent: 3.0,
      minOccurrencesForStuffing: 3,
    });

    maxKeyword = audit.primaryKeyword;
    maxDensity = audit.primaryDensity;

    for (const sm of audit.secondaryKeywordMetrics) {
      if (sm.density > maxDensity) {
        maxDensity = sm.density;
        maxKeyword = sm.keyword;
      }
    }

    for (const err of audit.criticalErrors) {
      errors.push(err);
    }
    for (const warn of audit.warnings) {
      warnings.push(warn);
    }
  }

  // 9. Entity stuffing check (repeated >12 times for non-brand entities)
  let maxEntity = '';
  let maxEntCount = 0;
  const brandNormalized = (targetBrand || '').toLowerCase().trim();

  for (const ent of entities) {
    if (!ent || ent.trim().length === 0) continue;
    const entLower = ent.toLowerCase().trim();

    // Check if this entity is the primary target brand / product name
    const isBrand = brandNormalized && (
      entLower === brandNormalized ||
      entLower.includes(brandNormalized) ||
      brandNormalized.includes(entLower)
    );

    const escapedEnt = entLower.split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
    const regex = new RegExp(`\\b${escapedEnt}\\b`, 'gi');
    const occurrences = (normalizedText.match(regex) || []).length;

    if (isBrand) {
      // For target brand, allow natural occurrence but check if density exceeds 3.5%
      const entWords = entLower.split(/\s+/).length;
      const brandDensity = totalWordCount > 0 ? (occurrences * entWords / totalWordCount) * 100 : 0;
      if (brandDensity > 3.5) {
        errors.push(`Brand Stuffing Alert: Target brand "${ent}" has excessive density of ${brandDensity.toFixed(2)}% (exceeds limit of 3.5%).`);
      }
      continue;
    }

    if (occurrences > maxEntCount) {
      maxEntCount = occurrences;
      maxEntity = ent;
    }
  }

  if (maxEntCount > 12) {
    errors.push(`Entity Stuffing Alert: Non-brand entity "${maxEntity}" is repeated ${maxEntCount} times (exceeds limit of 12).`);
  }

  // 10. Sentence pattern repeats
  const hasSentencePatternRepeats = checkSentencePatternRepeats(sentences);
  if (hasSentencePatternRepeats) {
    errors.push(`Same sentence opening pattern is repeated more than 3 times.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metrics: {
      averageSentenceLength: avgSentenceLength,
      passiveVoicePercent: passivePercent,
      hasConsecutiveStarts,
      hasConsecutiveStructures,
      fleschReadingEase: fre,
      averageParagraphLength: avgParagraphLength,
      maxKeywordDensity: { keyword: maxKeyword, density: maxDensity },
      maxEntityCount: { entity: maxEntity, count: maxEntCount },
      hasSentencePatternRepeats,
      paragraphSimilarities
    }
  };
}

export function hasIncompleteSentence(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.endsWith('...') || trimmed.endsWith('…')) {
    return true;
  }
  if (trimmed.endsWith(',')) {
    return true;
  }
  return false;
}
