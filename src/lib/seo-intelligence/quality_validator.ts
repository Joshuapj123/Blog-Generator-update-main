export interface QualityValidationReport {
  valid: boolean;
  errors: string[];
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
  if (paragraphs.length < 4) return false;
  for (let i = 0; i <= paragraphs.length - 4; i++) {
    const starts = paragraphs.slice(i, i + 4).map(p => {
      const words = p.trim().toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
      return words.slice(0, 2).join(' '); // first two words
    });
    if (starts[0] && starts.every(s => s === starts[0])) {
      return true;
    }
  }
  return false;
}

export function consecutiveParagraphStructures(paragraphs: string[]): boolean {
  if (paragraphs.length < 3) return false;
  const fingerprints = paragraphs.map(p => {
    const sentences = p.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const numSentences = sentences.length;
    const hasList = p.includes('- ') || p.includes('* ') || /^\d+\.\s/.test(p);
    const hasBold = p.includes('**');
    return `${numSentences}_${hasList}_${hasBold}`;
  });
  
  for (let i = 0; i <= fingerprints.length - 3; i++) {
    if (fingerprints[i] === fingerprints[i + 1] && fingerprints[i] === fingerprints[i + 2]) {
      return true;
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

export function calculateFleschReadingEase(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  if (wordCount === 0) return 100;

  // Split into sentences using a regex that handles abbreviations reasonably
  const sentenceCount = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length || 1;

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
  entities: string[]
): QualityValidationReport {
  const errors: string[] = [];

  // Parse paragraphs and sentences
  // Exclude empty paragraphs and headings (since headings are short and skew counts)
  const paragraphs = text.split('\n')
    .map(p => p.trim())
    .filter(p => p.length > 0 && !p.startsWith('#'));

  const sentences = text.split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  const words = text.trim().split(/\s+/).filter(Boolean);
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
    errors.push(`More than 2 consecutive paragraphs have identical sentence count and format structure.`);
  }

  // 5. Flesch Reading Ease
  const fre = calculateFleschReadingEase(text);
  if (fre < 55) {
    errors.push(`Flesch Reading Ease score is ${fre} (below minimum required 55).`);
  }

  // 6. Average Paragraph Length
  const paragraphWordCounts = paragraphs.map(p => countWords(p));
  const avgParagraphLength = paragraphWordCounts.length > 0
    ? paragraphWordCounts.reduce((a, b) => a + b, 0) / paragraphWordCounts.length
    : 0;

  if (avgParagraphLength > 180) {
    errors.push(`Average paragraph length is ${avgParagraphLength.toFixed(1)} words (exceeds limit of 180).`);
  }

  // 7. Paragraph Similarities (>75% Jaccard similarity)
  const paragraphSimilarities = checkParagraphSimilarity(paragraphs);
  if (paragraphSimilarities.length > 0) {
    paragraphSimilarities.forEach(sim => {
      errors.push(`Paragraph ${sim.p1Index + 1} and Paragraph ${sim.p2Index + 1} are ${Math.round(sim.similarity * 100)}% structurally similar (exceeds limit of 75%).`);
    });
  }

  // 8. Keyword stuffing density check (>3% keyword density)
  let maxKeyword = '';
  let maxDensity = 0;
  if (totalWordCount > 0) {
    for (const kw of keywords) {
      if (!kw || kw.trim().length === 0) continue;
      const kwLower = kw.toLowerCase().trim();
      const kwWords = kwLower.split(/\s+/).length;
      
      // Use regex to count occurrences of the keyword phrase safely
      const escapedKw = kwLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedKw}\\b`, 'gi');
      const occurrences = (text.match(regex) || []).length;
      
      // Keyword density formula: (occurrences * keywordLength) / totalWords * 100
      const density = (occurrences * kwWords / totalWordCount) * 100;
      if (density > maxDensity) {
        maxDensity = density;
        maxKeyword = kw;
      }
    }
  }

  if (maxDensity > 3.0) {
    errors.push(`Keyword Stuffing Alert: Keyword "${maxKeyword}" has density of ${maxDensity.toFixed(2)}% (exceeds limit of 3%).`);
  }

  // 9. Entity stuffing check (repeated >12 times)
  let maxEntity = '';
  let maxEntCount = 0;
  for (const ent of entities) {
    if (!ent || ent.trim().length === 0) continue;
    const entLower = ent.toLowerCase().trim();
    const escapedEnt = entLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedEnt}\\b`, 'gi');
    const occurrences = (text.match(regex) || []).length;
    if (occurrences > maxEntCount) {
      maxEntCount = occurrences;
      maxEntity = ent;
    }
  }

  if (maxEntCount > 12) {
    errors.push(`Entity Stuffing Alert: Entity "${maxEntity}" is repeated ${maxEntCount} times (exceeds limit of 12).`);
  }

  // 10. Sentence pattern repeats
  const hasSentencePatternRepeats = checkSentencePatternRepeats(sentences);
  if (hasSentencePatternRepeats) {
    errors.push(`Same sentence opening pattern is repeated more than 3 times.`);
  }

  return {
    valid: errors.length === 0,
    errors,
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
