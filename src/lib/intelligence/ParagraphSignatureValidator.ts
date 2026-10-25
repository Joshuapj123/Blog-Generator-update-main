// src/lib/intelligence/ParagraphSignatureValidator.ts

export type LengthBand = 'S' | 'M' | 'L';

export interface EligibleProseParagraph {
  proseIndex: number;
  globalBlockIndex: number;
  sectionHeading: string;
  rawText: string;
  cleanedText: string;
  sentences: string[];
  sentenceCount: number;
  sentenceLengthBands: LengthBand[];
  canonicalSignature: string;
}

export interface ParagraphSignatureViolation {
  violationType: 'CONSECUTIVE_IDENTICAL_PARAGRAPH_SIGNATURES';
  consecutiveCount: number;
  canonicalSignature: string;
  startIndex: number;
  endIndex: number;
  sections: string[];
  paragraphs: Array<{
    proseIndex: number;
    sectionHeading: string;
    snippet: string;
    sentenceCount: number;
    bands: LengthBand[];
    signature: string;
  }>;
  message: string;
}

export interface ParagraphSignatureValidationResult {
  valid: boolean;
  eligibleProseCount: number;
  signatures: string[];
  violations: ParagraphSignatureViolation[];
  criticalErrors: string[];
  diagnostics: {
    totalBlocksParsed: number;
    proseBlockCount: number;
    headingBlockCount: number;
    tableBlockCount: number;
    listBlockCount: number;
    skippedBlockCount: number;
  };
}

export class ParagraphSignatureValidator {
  /**
   * Word count threshold bands:
   * S: fewer than 15 words (< 15)
   * M: 15–28 words (15..28)
   * L: more than 28 words (> 28)
   */
  public static classifySentenceLength(wordCount: number): LengthBand {
    if (wordCount < 15) return 'S';
    if (wordCount <= 28) return 'M';
    return 'L';
  }

  /**
   * Counts words in a string, ignoring markdown formatting characters.
   */
  public static countWords(text: string): number {
    const clean = text
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      .replace(/[*_`#]/g, '')
      .trim();
    if (!clean) return 0;
    return clean.split(/\s+/).filter(Boolean).length;
  }

  /**
   * Robust sentence splitter that preserves abbreviations, decimal numbers, and URLs
   * without creating false sentence boundaries.
   */
  public static splitSentences(text: string): string[] {
    if (!text || !text.trim()) return [];

    // Mask periods in URLs, decimals, and common abbreviations
    const masked = text
      .replace(/https?:\/\/[^\s\)\],]+/gi, match => {
        // Exclude trailing sentence terminal punctuation from URL masking
        const cleanUrl = match.replace(/[.!?]+$/, '');
        const trailing = match.slice(cleanUrl.length);
        return cleanUrl.replace(/\./g, '__DOT__') + trailing;
      })
      .replace(/(\d+)\.(\d+)/g, (_, p1, p2) => `${p1}__DOT__${p2}`)
      .replace(
        /\b(?:e\.g\.|i\.e\.|vs\.|approx\.|etc\.|al\.|inc\.|corp\.|ltd\.|co\.|dr\.|mr\.|ms\.|mrs\.|prof\.|sr\.|jr\.|no\.|vol\.)/gi,
        match => match.replace(/\./g, '__DOT__')
      );

    // Split on sentence terminal punctuation followed by space or end of string
    const rawSentences = masked.split(/(?<=[.!?]['"”’\)])\s+|(?<=[.!?])\s+/);

    return rawSentences
      .map(s => s.replace(/__DOT__/g, '.').trim())
      .filter(s => s.length > 0 && /[a-zA-Z0-9]/.test(s));
  }

  /**
   * Computes the canonical signature for a single paragraph of text.
   * Format: `(sentence_count, block_type, length_band_sequence)`
   * Example: `(3, PROSE, M-L-M)`
   */
  public static computeCanonicalSignature(
    text: string,
    blockType: 'PROSE' | 'LIST' | 'TABLE' = 'PROSE'
  ): {
    sentenceCount: number;
    bands: LengthBand[];
    signature: string;
    sentences: string[];
  } {
    const sentences = this.splitSentences(text);
    const sentenceCount = sentences.length;

    const bands = sentences.map(s => {
      const wc = this.countWords(s);
      return this.classifySentenceLength(wc);
    });

    const bandSequence = bands.length > 0 ? bands.join('-') : 'EMPTY';
    const signature = `(${sentenceCount}, ${blockType}, ${bandSequence})`;

    return {
      sentenceCount,
      bands,
      signature,
      sentences
    };
  }

  /**
   * Parses Markdown content into blocks and determines if a block is eligible prose.
   * Excludes headings, tables, lists, code fences, HTML blocks, blockquotes, horizontal rules.
   */
  public static isNonProseBlock(trimmedBlock: string): {
    isNonProse: boolean;
    blockType?: 'HEADING' | 'TABLE' | 'LIST' | 'CODE' | 'HTML' | 'MEDIA' | 'OTHER';
  } {
    if (!trimmedBlock) {
      return { isNonProse: true, blockType: 'OTHER' };
    }

    // 1. Headings (# H1 to ###### H6)
    if (/^#{1,6}\s+/.test(trimmedBlock)) {
      return { isNonProse: true, blockType: 'HEADING' };
    }

    // 2. Tables (pipe tables or table separator rows)
    const lines = trimmedBlock.split('\n').map(l => l.trim()).filter(Boolean);
    const isTable = lines.length > 0 && lines.every(l => l.startsWith('|') || /^[-:| ]+$/.test(l));
    if (isTable || trimmedBlock.startsWith('|')) {
      return { isNonProse: true, blockType: 'TABLE' };
    }

    // 3. Lists (bulleted or numbered)
    const isList = lines.length > 0 && lines.every(l => /^([-*+]|\d+\.)\s+/.test(l));
    if (isList || /^([-*+]|\d+\.)\s+/.test(trimmedBlock)) {
      return { isNonProse: true, blockType: 'LIST' };
    }

    // 4. Code Blocks
    if (trimmedBlock.startsWith('```') || trimmedBlock.startsWith('~~~')) {
      return { isNonProse: true, blockType: 'CODE' };
    }

    // 5. Raw HTML / SVG
    if (/^<[a-zA-Z\/][\s\S]*>$/i.test(trimmedBlock) || trimmedBlock.startsWith('<div') || trimmedBlock.startsWith('<svg')) {
      return { isNonProse: true, blockType: 'HTML' };
    }

    // 6. Media / Image Markdown
    if (trimmedBlock.startsWith('![')) {
      return { isNonProse: true, blockType: 'MEDIA' };
    }

    // 7. Horizontal Rules & Blockquotes
    if (/^[-*_]{3,}$/.test(trimmedBlock)) {
      return { isNonProse: true, blockType: 'OTHER' };
    }
    if (trimmedBlock.startsWith('>')) {
      return { isNonProse: true, blockType: 'OTHER' };
    }

    // Must have substantive alphabetic prose content
    if (!/[a-zA-Z]/.test(trimmedBlock)) {
      return { isNonProse: true, blockType: 'OTHER' };
    }

    return { isNonProse: false };
  }

  /**
   * Cleans inline Markdown formatting from a paragraph while preserving prose words and punctuation.
   */
  public static cleanParagraphText(text: string): string {
    return text
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`[^`\n]+`/g, ' ')
      .replace(/data:[a-zA-Z0-9/+-]+;base64,[a-zA-Z0-9+/=]+/gi, ' ')
      .replace(/!\[[^\]]*\]\([^\)]+\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/https?:\/\/[^\s\)\],]+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Evaluates Markdown content and validates that no three consecutive eligible prose paragraphs
   * share the identical complete canonical signature `(sentence_count, block_type, band_sequence)`.
   *
   * Continuity Rule:
   * Heading boundaries, list blocks, table blocks, code blocks, and media blocks DO NOT reset
   * prose continuity. Eligible prose paragraphs are checked in strict chronological document order.
   */
  public static validate(markdownText: string): ParagraphSignatureValidationResult {
    const diagnostics = {
      totalBlocksParsed: 0,
      proseBlockCount: 0,
      headingBlockCount: 0,
      tableBlockCount: 0,
      listBlockCount: 0,
      skippedBlockCount: 0
    };

    if (!markdownText || !markdownText.trim()) {
      return {
        valid: true,
        eligibleProseCount: 0,
        signatures: [],
        violations: [],
        criticalErrors: [],
        diagnostics
      };
    }

    try {
      // Ensure headings have surrounding blank lines so they split cleanly into blocks
      const normalizedMarkdown = markdownText.replace(/^(#{1,6}\s+[^\n]+)/gm, '\n\n$1\n\n');
      const rawBlocks = normalizedMarkdown.split(/\n\s*\n/);

      let currentSectionHeading = 'Document Root';
      const eligibleProse: EligibleProseParagraph[] = [];

      for (let bIdx = 0; bIdx < rawBlocks.length; bIdx++) {
        const raw = rawBlocks[bIdx];
        const trimmed = raw.trim();
        if (!trimmed) continue;

        diagnostics.totalBlocksParsed++;

        const check = this.isNonProseBlock(trimmed);

        if (check.isNonProse) {
          if (check.blockType === 'HEADING') {
            diagnostics.headingBlockCount++;
            // Update current section heading context without resetting prose continuity
            const headingMatch = trimmed.match(/^#{1,6}\s+(.+)$/m);
            if (headingMatch) {
              currentSectionHeading = headingMatch[1].trim();
            }
          } else if (check.blockType === 'TABLE') {
            diagnostics.tableBlockCount++;
          } else if (check.blockType === 'LIST') {
            diagnostics.listBlockCount++;
          } else {
            diagnostics.skippedBlockCount++;
          }
          continue;
        }

        // Block is eligible prose
        diagnostics.proseBlockCount++;
        const cleanedText = this.cleanParagraphText(trimmed);
        const computed = this.computeCanonicalSignature(cleanedText, 'PROSE');

        // Only paragraphs with at least 1 valid sentence are eligible prose
        if (computed.sentenceCount > 0) {
          eligibleProse.push({
            proseIndex: eligibleProse.length,
            globalBlockIndex: bIdx,
            sectionHeading: currentSectionHeading,
            rawText: trimmed,
            cleanedText,
            sentences: computed.sentences,
            sentenceCount: computed.sentenceCount,
            sentenceLengthBands: computed.bands,
            canonicalSignature: computed.signature
          });
        } else {
          diagnostics.skippedBlockCount++;
        }
      }

      const signatures = eligibleProse.map(p => p.canonicalSignature);
      const violations: ParagraphSignatureViolation[] = [];
      const criticalErrors: string[] = [];

      // Evaluate continuity: check for 3 consecutive identical canonical signatures
      for (let i = 0; i <= eligibleProse.length - 3; i++) {
        const p1 = eligibleProse[i];
        const p2 = eligibleProse[i + 1];
        const p3 = eligibleProse[i + 2];

        if (
          p1.canonicalSignature === p2.canonicalSignature &&
          p2.canonicalSignature === p3.canonicalSignature
        ) {
          const affectedSections = Array.from(new Set([p1.sectionHeading, p2.sectionHeading, p3.sectionHeading]));
          const sectionsStr = affectedSections.map(s => `"${s}"`).join(', ');

          const errorMsg = `Critical Structural Repetition Alert: 3 consecutive eligible prose paragraphs share the identical canonical signature "${p1.canonicalSignature}" across section(s) ${sectionsStr}. Paragraph rhythm must be varied.`;

          violations.push({
            violationType: 'CONSECUTIVE_IDENTICAL_PARAGRAPH_SIGNATURES',
            consecutiveCount: 3,
            canonicalSignature: p1.canonicalSignature,
            startIndex: i,
            endIndex: i + 2,
            sections: affectedSections,
            paragraphs: [
              {
                proseIndex: p1.proseIndex,
                sectionHeading: p1.sectionHeading,
                snippet: p1.cleanedText.slice(0, 80),
                sentenceCount: p1.sentenceCount,
                bands: p1.sentenceLengthBands,
                signature: p1.canonicalSignature
              },
              {
                proseIndex: p2.proseIndex,
                sectionHeading: p2.sectionHeading,
                snippet: p2.cleanedText.slice(0, 80),
                sentenceCount: p2.sentenceCount,
                bands: p2.sentenceLengthBands,
                signature: p2.canonicalSignature
              },
              {
                proseIndex: p3.proseIndex,
                sectionHeading: p3.sectionHeading,
                snippet: p3.cleanedText.slice(0, 80),
                sentenceCount: p3.sentenceCount,
                bands: p3.sentenceLengthBands,
                signature: p3.canonicalSignature
              }
            ],
            message: errorMsg
          });

          criticalErrors.push(errorMsg);
        }
      }

      return {
        valid: violations.length === 0,
        eligibleProseCount: eligibleProse.length,
        signatures,
        violations,
        criticalErrors,
        diagnostics
      };
    } catch (err: any) {
      // Fail closed on unexpected exception
      const errorMsg = `Paragraph Signature Validation Failed (Exception): ${err?.message || err}`;
      return {
        valid: false,
        eligibleProseCount: 0,
        signatures: [],
        violations: [],
        criticalErrors: [errorMsg],
        diagnostics
      };
    }
  }
}
