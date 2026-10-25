// src/lib/intelligence/EditorialIntegrityValidator.ts
import {
  EvidenceSet,
  EvidenceItem,
  SectionEvidenceMap,
  ClaimSupportStatus,
  GroundingFailureCategory
} from '@/core/contracts/evidence';
import { TopicRelevanceValidator } from './TopicRelevanceValidator';

export interface EditorialIntegrityIssue {
  type:
    | 'PROMPT_LEAK'
    | 'PLACEHOLDER'
    | 'INTERNAL_SCAFFOLDING'
    | 'FABRICATED_EVIDENCE_ID'
    | 'FABRICATED_ATTRIBUTION'
    | 'UNVERIFIED_ATTRIBUTION'
    | 'UNSUPPORTED_NUMERICAL'
    | 'REPEATED_BOILERPLATE'
    | 'TOPIC_DRIFT'
    | 'HOLLOW_SECTION'
    | 'UNFULFILLED_HEADING_PROMISE'
    | 'GENERIC_FILLER'
    | 'DUPLICATE_HEADING'
    | 'ADJACENT_SECTION_REPETITION'
    | 'IMAGE_PLACEHOLDER';
  severity: 'CRITICAL' | 'WARNING';
  message: string;
  matchedSnippet: string;
  context?: string;
}

export interface EditorialIntegrityReport {
  passed: boolean;
  canExport: boolean;
  criticalErrors: string[];
  warnings: string[];
  issues: EditorialIntegrityIssue[];
  diagnostics: {
    promptLeakCount: number;
    placeholderCount: number;
    scaffoldingCount: number;
    fabricatedEvidenceIdCount: number;
    fabricatedAttributionCount: number;
    unverifiedAttributionCount?: number;
    unsupportedNumericalCount: number;
    requiresReviewCount: number;
    topicDriftCount?: number;
    hollowSectionCount?: number;
    unfulfilledPromiseCount?: number;
    fillerCount?: number;
    duplicateHeadingCount?: number;
    adjacentRepetitionCount?: number;
    imagePlaceholderCount?: number;
  };
}

export class EditorialIntegrityValidator {
  /**
   * Internal model instruction and meta-commentary patterns that must never appear in article prose.
   */
  private static PROMPT_LEAK_PATTERNS: Array<{ regex: RegExp; description: string }> = [
    // Model self-identification
    {
      regex: /\b(?:as\s+an?\s+ai(?:\s+language\s+model)?|i\s+am\s+an?\s+ai(?:\s+model)?|as\s+a\s+large\s+language\s+model)\b/i,
      description: 'AI model self-identification'
    },
    // Meta-commentary on draft creation
    {
      regex: /\b(?:in\s+this\s+(?:section|article|blog\s+post),?\s+(?:i\s+will|we\s+will\s+delve|i\s+have\s+written|i\s+am\s+writing|this\s+draft\s+will))\b/i,
      description: 'Model meta-commentary on article drafting'
    },
    {
      regex: /\b(?:here\s+is\s+(?:the\s+)?(?:repaired|generated|drafted|requested)\s+(?:article|section|content|body))\s*:/i,
      description: 'Generation response prefix header'
    },
    // System instructions and prompts leaking
    {
      regex: /(?:\[|\b)(?:prompt\s+instruction|system\s+instruction|system\s+prompt|instruction\s+to\s+writer|note\s+to\s+writer|drafting\s+notes?)\s*:/i,
      description: 'Direct system prompt directive'
    },
    {
      regex: /\b(?:ensure\s+the\s+word\s+count\s+is\s+\d+|write\s+in\s+a\s+(?:professional|conversational)\s+tone|do\s+not\s+include\s+introductory\s+fluff|output\s+format\s*:|output\s+only\s+valid\s+markdown)\b/i,
      description: 'Leaked authoring prompt guideline'
    },
    {
      regex: /\b(?:rewrite\s+the\s+following\s+section\s+to\s+fix|repaired\s+body\s*:)\b/i,
      description: 'Repair prompt scaffolding directive'
    }
  ];

  /**
   * Obvious placeholders and template variables that indicate unfinished generation.
   */
  private static PLACEHOLDER_PATTERNS: Array<{ regex: RegExp; description: string }> = [
    {
      regex: /\[(?:insert|add|tbd|placeholder|todo)[^\]]*\]/i,
      description: 'Bracketed placeholder directive'
    },
    {
      regex: /\binsert\s+(?:keyword|link|anchor\s+text|image|statistic|source|citation)\s+here\b/i,
      description: 'Inline placeholder text'
    },
    {
      regex: /\b(?:TODO|TBD|PLACEHOLDER)\b/,
      description: 'Unfinished work marker'
    },
    {
      regex: /\{\{[a-zA-Z0-9_.-]+\}\}/,
      description: 'Handlebars/Mustache template variable'
    },
    {
      regex: /\$\{[a-zA-Z0-9_.-]+\}/,
      description: 'ES template literal placeholder'
    },
    {
      regex: /<PLACEHOLDER>|__PLACEHOLDER__|__KEYWORD__/i,
      description: 'Tokenized template placeholder'
    },
    {
      regex: /\b(?:\[object\s+Object\])\b/,
      description: 'JavaScript serialization defect'
    }
  ];

  /**
   * Image prohibition patterns (Phase 6E text-first integrity).
   */
  private static IMAGE_PATTERNS: Array<{ regex: RegExp; description: string }> = [
    {
      regex: /!\[[^\]]*\]\([^\)]+\)/,
      description: 'Markdown image markup'
    },
    {
      regex: /\[(?:insert|add|placeholder)\s+(?:image|figure|photo)[^\]]*\]/i,
      description: 'Image placeholder directive'
    },
    {
      regex: /\binsert\s+(?:image|figure|diagram|photo)\s+here\b/i,
      description: 'Inline image placeholder'
    }
  ];

  /**
   * Generic corporate filler patterns that add zero substantive value.
   */
  private static GENERIC_FILLER_PATTERNS: Array<{ regex: RegExp; description: string }> = [
    {
      regex: /\b(?:in today'?s (?:fast-paced|rapidly evolving|digital) (?:world|landscape|environment)|stay(?:ing)? ahead of the curve|it is crucial to (?:understand|remember) that (?:success|growth) requires|leverage modern best practices to drive meaningful (?:outcomes|results))\b/i,
      description: 'Hollow corporate introductory fluff'
    },
    {
      regex: /\b(?:in the modern era of technology|navigating the complexities of the digital age|embarking on a journey of continuous improvement)\b/i,
      description: 'Generic fluff opening'
    }
  ];

  /**
   * Internal pipeline metadata and GEO distribution scaffolding presented as reader prose.
   * False-positive protection: Legitimate educational discussion of SEO, AI search, or keyword research
   * is strictly allowed and preserved.
   */
  private static INTERNAL_SCAFFOLDING_PATTERNS: Array<{ regex: RegExp; description: string }> = [
    {
      regex: /\b(?:internal\s+geo\s+distribution\s+guidance|geo\s+distribution\s+guidance)\b/i,
      description: 'Internal GEO distribution guidance leaked as reader advice'
    },
    {
      regex: /\b(?:content[- ]gap\s+matrix|content[- ]gap\s+analysis\s+table)\b/i,
      description: 'Internal content gap matrix reference'
    },
    {
      regex: /\bgap\s+importance\s*:\s*(?:high|medium|low)\b/i,
      description: 'Raw content gap importance metadata'
    },
    {
      regex: /\b(?:targetSiteCoverage|competitorCoverage|recommendedTreatment)\b/,
      description: 'Internal pipeline data model property leakage'
    },
    {
      regex: /\bour\s+geo\s+intelligence\s+(?:engine|service|matrix)\b/i,
      description: 'Internal system architecture self-reference'
    },
    {
      regex: /(?:^|\n)\s*(?:buyer\s+question|buyer\s+intent\s+question|target\s+buyer\s+query|candidate\s+gap)\s*:\s*/i,
      description: 'Raw buyer-question or gap scaffolding prefix'
    }
  ];

  /**
   * Standard non-attribution sources to avoid treating ordinary phrases as citations.
   */
  private static NON_ATTRIBUTION_SOURCES = new Set([
    'hour', 'day', 'month', 'year', 'user', 'seat', 'client', 'server', 'second', 'minute', 'week', 'quarter',
    'annual audit', 'internal audit', 'internal data', 'internal records', 'company records', 'company data'
  ]);

  /**
   * Pure advice / recommendation patterns that express best practices rather than empirical research claims.
   */
  private static RECOMMENDATION_PATTERNS = [
    /\b(?:we recommend|it is recommended|you should|teams should|organizations should|make sure to|be sure to|consider using|we suggest|it is advisable|best practice is to|it is essential to|prioritize|opt for)\b/i,
  ];

  /**
   * Evaluates comprehensive editorial integrity across prompt leakage, placeholders,
   * internal scaffolding, evidence citation consistency, topic drift, hollow sections,
   * heading promises, and text-first invariants.
   */
  public static validateEditorialIntegrity(
    markdown: string,
    options?: {
      evidenceSet?: EvidenceSet;
      sectionEvidenceMaps?: SectionEvidenceMap[];
      targetBrand?: string;
      targetKeyword?: string;
      primaryKeyword?: string;
    }
  ): EditorialIntegrityReport {
    const criticalErrors: string[] = [];
    const warnings: string[] = [];
    const issues: EditorialIntegrityIssue[] = [];

    let promptLeakCount = 0;
    let placeholderCount = 0;
    let scaffoldingCount = 0;
    let fabricatedEvidenceIdCount = 0;
    let fabricatedAttributionCount = 0;
    let unverifiedAttributionCount = 0;
    let unsupportedNumericalCount = 0;
    let requiresReviewCount = 0;
    let topicDriftCount = 0;
    let hollowSectionCount = 0;
    let unfulfilledPromiseCount = 0;
    let fillerCount = 0;
    let duplicateHeadingCount = 0;
    let adjacentRepetitionCount = 0;
    let imagePlaceholderCount = 0;

    if (!markdown || !markdown.trim()) {
      return {
        passed: false,
        canExport: false,
        criticalErrors: ['Editorial Integrity Alert: Content is empty.'],
        warnings: [],
        issues: [],
        diagnostics: {
          promptLeakCount: 0,
          placeholderCount: 0,
          scaffoldingCount: 0,
          fabricatedEvidenceIdCount: 0,
          fabricatedAttributionCount: 0,
          unverifiedAttributionCount: 0,
          unsupportedNumericalCount: 0,
          requiresReviewCount: 0,
          topicDriftCount: 0,
          hollowSectionCount: 0,
          unfulfilledPromiseCount: 0,
          fillerCount: 0,
          duplicateHeadingCount: 0,
          adjacentRepetitionCount: 0,
          imagePlaceholderCount: 0
        }
      };
    }

    const textWithoutCode = markdown.replace(/```[\s\S]*?```/g, '');

    // 1. Detect Prompt Leakage
    for (const pat of this.PROMPT_LEAK_PATTERNS) {
      const match = textWithoutCode.match(pat.regex);
      if (match) {
        promptLeakCount++;
        const msg = `Prompt Leakage Alert: Detected ${pat.description} ("${match[0]}"). Internal model instructions must not be rendered to readers.`;
        criticalErrors.push(msg);
        issues.push({
          type: 'PROMPT_LEAK',
          severity: 'CRITICAL',
          message: msg,
          matchedSnippet: match[0],
          context: pat.description
        });
      }
    }

    // 2. Detect Placeholders and Template Variables
    for (const pat of this.PLACEHOLDER_PATTERNS) {
      const match = textWithoutCode.match(pat.regex);
      if (match) {
        placeholderCount++;
        const msg = `Placeholder Alert: Detected ${pat.description} ("${match[0]}"). Incomplete template text must be resolved before publication.`;
        criticalErrors.push(msg);
        issues.push({
          type: 'PLACEHOLDER',
          severity: 'CRITICAL',
          message: msg,
          matchedSnippet: match[0],
          context: pat.description
        });
      }
    }

    // 3. Detect Internal Scaffolding (GEO & Content Gap Pipeline Leaks)
    for (const pat of this.INTERNAL_SCAFFOLDING_PATTERNS) {
      const match = textWithoutCode.match(pat.regex);
      if (match) {
        scaffoldingCount++;
        const msg = `Internal Scaffolding Alert: Detected internal pipeline metadata ("${match[0]}"). Internal system guidance must not appear in reader-facing prose.`;
        criticalErrors.push(msg);
        issues.push({
          type: 'INTERNAL_SCAFFOLDING',
          severity: 'CRITICAL',
          message: msg,
          matchedSnippet: match[0],
          context: pat.description
        });
      }
    }

    // 4. Detect Image Markup or Image Placeholders (Phase 6E text-first integrity)
    for (const imgPat of this.IMAGE_PATTERNS) {
      const match = textWithoutCode.match(imgPat.regex);
      if (match) {
        imagePlaceholderCount++;
        const msg = `Image Prohibition Alert: Detected ${imgPat.description} ("${match[0]}"). Text-first generation strictly prohibits images or image placeholders.`;
        criticalErrors.push(msg);
        issues.push({
          type: 'IMAGE_PLACEHOLDER',
          severity: 'CRITICAL',
          message: msg,
          matchedSnippet: match[0],
          context: imgPat.description
        });
      }
    }

    // 5. Detect Fabricated Evidence IDs
    const allEvidence = options?.evidenceSet?.items || [];
    const validEvidenceIds = new Set(allEvidence.map(e => e.id));

    // Check evidence IDs in assigned section maps
    if (options?.sectionEvidenceMaps && options.sectionEvidenceMaps.length > 0) {
      for (const map of options.sectionEvidenceMaps) {
        for (const evId of map.evidenceIds) {
          if (!validEvidenceIds.has(evId)) {
            fabricatedEvidenceIdCount++;
            const msg = `Fabricated Evidence ID Alert: Section "${map.heading}" references non-existent evidence ID "${evId}".`;
            criticalErrors.push(msg);
            issues.push({
              type: 'FABRICATED_EVIDENCE_ID',
              severity: 'CRITICAL',
              message: msg,
              matchedSnippet: evId
            });
          }
        }
      }
    }

    // Check explicit evidence ID references in markdown body
    const evIdMatches = textWithoutCode.match(/\bev[-_][a-zA-Z0-9_-]{3,}\b/g) || [];
    for (const rawId of Array.from(new Set(evIdMatches))) {
      if (/^ev[-_][a-zA-Z0-9_-]+$/i.test(rawId)) {
        if (!validEvidenceIds.has(rawId)) {
          fabricatedEvidenceIdCount++;
          const msg = `Fabricated Evidence ID Alert: Body text references non-existent evidence ID "${rawId}".`;
          criticalErrors.push(msg);
          issues.push({
            type: 'FABRICATED_EVIDENCE_ID',
            severity: 'CRITICAL',
            message: msg,
            matchedSnippet: rawId
          });
        }
      }
    }

    // 6. Detect Unverified External Source Attribution
    const attributionRegexes = [
      /\b(?:according to|as reported by|published by|cited by|study by|survey by|research from)\s+\[?([A-Z][A-Za-z0-9&.-]+(?:\s+[A-Z][A-Za-z0-9&.-]+)?)\]?/gi,
      /\[([A-Z][A-Za-z0-9&.-]+(?:\s+[A-Z][A-Za-z0-9&.-]+)?)\s+(?:study|survey|research|benchmark|report)\]\((https?:\/\/[^\)]+)\)/gi,
      /\[([A-Z][A-Za-z0-9&.-]+(?:\s+[A-Z][A-Za-z0-9&.-]+)?)\]\((https?:\/\/[^\)]+)\)\s+(?:found|reported|showed|discovered|measured)\b/gi,
    ];

    for (const regex of attributionRegexes) {
      let match: RegExpExecArray | null;
      while ((match = regex.exec(textWithoutCode)) !== null) {
        const sourceName = match[1]?.trim();
        const sourceUrl = match[2]?.trim();

        if (!sourceName || this.NON_ATTRIBUTION_SOURCES.has(sourceName.toLowerCase())) continue;

        if (allEvidence.length > 0) {
          const sourceMatch = allEvidence.find(ev => {
            const title = (ev.sourceTitle || '').toLowerCase();
            const url = (ev.sourceUrl || '').toLowerCase();
            const claimText = ev.claim.toLowerCase();
            const entities = (ev.entities || []).map(e => e.toLowerCase());
            const srcLower = sourceName.toLowerCase();
            const urlLower = sourceUrl ? sourceUrl.toLowerCase() : '';

            const nameMatches = title.includes(srcLower) || claimText.includes(srcLower) || entities.includes(srcLower);
            const urlMatches = Boolean(urlLower && url.includes(urlLower));
            return nameMatches || urlMatches;
          });

          if (!sourceMatch) {
            unverifiedAttributionCount++;
            fabricatedAttributionCount++;
            const msg = `Unverified Attribution Alert: External source "${sourceName}" cited in "${match[0]}" is unverified and does not exist in research evidence.`;
            criticalErrors.push(msg);
            issues.push({
              type: 'UNVERIFIED_ATTRIBUTION',
              severity: 'CRITICAL',
              message: msg,
              matchedSnippet: match[0],
              context: sourceName
            });
          }
        }
      }
    }

    // 7. Duplicate Headings Check
    const headingMatches = Array.from(textWithoutCode.matchAll(/^#{2,3}\s+([^\n]+)/gm)).map(m => m[1].trim());
    const seenHeadingMap = new Set<string>();
    for (const h of headingMatches) {
      const normHeading = h.toLowerCase().replace(/^[0-9.\s]+/, '').trim();
      if (seenHeadingMap.has(normHeading)) {
        duplicateHeadingCount++;
        const msg = `Duplicate Heading Alert: Section heading "${h}" is repeated in the article. Each section heading must be distinct.`;
        criticalErrors.push(msg);
        issues.push({
          type: 'DUPLICATE_HEADING',
          severity: 'CRITICAL',
          message: msg,
          matchedSnippet: h
        });
      } else {
        seenHeadingMap.add(normHeading);
      }
    }

    // 8. Section Breakdown & Text-First Deep Quality Checks
    const rawSections = textWithoutCode.split(/\n(?=#{2,3}\s+)/);
    const sectionsData: Array<{ heading: string; body: string; sentences: string[] }> = [];

    const effectiveKw = (options?.targetKeyword || options?.primaryKeyword || '').trim();

    for (const rawSec of rawSections) {
      const headingMatch = rawSec.match(/^#{2,3}\s+([^\n]+)/);
      if (!headingMatch) continue;
      const heading = headingMatch[1].trim();
      const body = rawSec.replace(/^#{2,3}\s+[^\n]+/m, '').trim();
      const cleanBody = body.replace(/```[\s\S]*?```/g, '').replace(/[*_#`]/g, '').trim();
      const words = cleanBody.split(/\s+/).filter(Boolean);
      const sentences = cleanBody.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 5);

      sectionsData.push({ heading, body, sentences });

      // 8.1 Hollow Section Check (fewer than 10 words)
      if (words.length < 10) {
        hollowSectionCount++;
        const msg = `Hollow Section Alert: Section "${heading}" contains only ${words.length} word(s). Each section must deliver substantive analysis.`;
        criticalErrors.push(msg);
        issues.push({
          type: 'HOLLOW_SECTION',
          severity: 'CRITICAL',
          message: msg,
          matchedSnippet: heading
        });
      }

      // 8.2 Unfulfilled Heading Promises
      // Tactical steps / checklist promises
      if (/\b(?:checklist|step-by-step|actionable steps?|implementation guide|execution workflow|how to (?:implement|optimize|configure|build))\b/i.test(heading)) {
        const hasList = /^\s*[-*]\s+/m.test(body) || /^\s*\d+\.\s+/m.test(body);
        const hasStepKeyword = /\b(?:step\s+\d+|phase\s+\d+|first,|second,|third,)\b/i.test(body);
        if (!hasList && !hasStepKeyword) {
          unfulfilledPromiseCount++;
          const msg = `Unfulfilled Promise Alert: Heading "${heading}" promises tactical steps or an implementation checklist, but the section contains no actionable steps or structured list.`;
          criticalErrors.push(msg);
          issues.push({
            type: 'UNFULFILLED_HEADING_PROMISE',
            severity: 'CRITICAL',
            message: msg,
            matchedSnippet: heading
          });
        }
      }

      // Benchmark metrics / quantitative data promises
      if (/\b(?:benchmark metrics?|latency thresholds?|performance specifications?|key metrics?|quantitative benchmarks?)\b/i.test(heading)) {
        const hasDigits = /\d+/.test(body);
        if (!hasDigits) {
          unfulfilledPromiseCount++;
          const msg = `Unfulfilled Promise Alert: Heading "${heading}" promises quantitative benchmarks or metrics, but the section contains no measurements or numerical data.`;
          criticalErrors.push(msg);
          issues.push({
            type: 'UNFULFILLED_HEADING_PROMISE',
            severity: 'CRITICAL',
            message: msg,
            matchedSnippet: heading
          });
        }
      }

      // Comparison matrix / structured table promises
      if (/\b(?:comparison matrix|feature matrix|evaluation matrix|criteria matrix)\b/i.test(heading)) {
        const hasTable = /\|.*\|/.test(body);
        if (!hasTable) {
          unfulfilledPromiseCount++;
          const msg = `Unfulfilled Promise Alert: Heading "${heading}" promises a comparison matrix, but the section contains no comparison table.`;
          criticalErrors.push(msg);
          issues.push({
            type: 'UNFULFILLED_HEADING_PROMISE',
            severity: 'CRITICAL',
            message: msg,
            matchedSnippet: heading
          });
        }
      }

      // 8.3 Topic Drift in Section Prose
      if (effectiveKw) {
        // Staffing drift on non-staffing topic
        if (!TopicRelevanceValidator.isStaffingDomainTopic(effectiveKw)) {
          if (/\b(developer retention|talent retention|employee retention|engineer retention|agency retainers?|staffing models?|developer burnout|hourly contractors?|recruiting developers?|hiring developers?)\b/i.test(body)) {
            topicDriftCount++;
            const msg = `Topic Drift Alert: Section "${heading}" discusses staffing models or developer retention, which is off-topic for "${effectiveKw}".`;
            criticalErrors.push(msg);
            issues.push({
              type: 'TOPIC_DRIFT',
              severity: 'CRITICAL',
              message: msg,
              matchedSnippet: heading,
              context: 'STAFFING_HR'
            });
          }
        }

        // Meta-SEO / crawler schema drift on non-SEO topic
        if (!TopicRelevanceValidator.isSeoDomainTopic(effectiveKw)) {
          if (/\b(technical schema markup|schema structures? for search|search engine crawler recognition|rich snippet indexing|perplexity (?:indexing|visibility)|search crawler recognition)\b/i.test(body)) {
            topicDriftCount++;
            const msg = `Topic Drift Alert: Section "${heading}" discusses search engine crawler indexing or schema markup, which is off-topic for non-SEO topic "${effectiveKw}".`;
            criticalErrors.push(msg);
            issues.push({
              type: 'TOPIC_DRIFT',
              severity: 'CRITICAL',
              message: msg,
              matchedSnippet: heading,
              context: 'META_SEO'
            });
          }
        }

        // Hardware repair drift on non-hardware topic
        if (!/\b(hardware|repair|soldering|device repair)\b/i.test(effectiveKw)) {
          if (/\b(hardware repair|screen (?:repair|replacement)|battery (?:repair|replacement)|device repair|soldering|phone repairs?)\b/i.test(body)) {
            topicDriftCount++;
            const msg = `Topic Drift Alert: Section "${heading}" discusses physical hardware repair, which is off-topic for "${effectiveKw}".`;
            criticalErrors.push(msg);
            issues.push({
              type: 'TOPIC_DRIFT',
              severity: 'CRITICAL',
              message: msg,
              matchedSnippet: heading,
              context: 'UNRELATED'
            });
          }
        }
      }

      // 8.4 Generic Filler Paragraphs
      const paragraphs = body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
      for (const p of paragraphs) {
        for (const fillerPat of this.GENERIC_FILLER_PATTERNS) {
          const m = p.match(fillerPat.regex);
          if (m) {
            fillerCount++;
            const msg = `Generic Filler Alert: Paragraph in section "${heading}" contains hollow corporate filler ("${m[0]}"). Replace with concrete domain insights.`;
            criticalErrors.push(msg);
            issues.push({
              type: 'GENERIC_FILLER',
              severity: 'CRITICAL',
              message: msg,
              matchedSnippet: m[0],
              context: heading
            });
            break;
          }
        }
      }
    }

    // 9. Adjacent Section Repetition
    for (let i = 0; i < sectionsData.length - 1; i++) {
      const secA = sectionsData[i];
      const secB = sectionsData[i + 1];
      if (secA.sentences.length > 0 && secB.sentences.length > 0) {
        const firstB = secB.sentences[0].toLowerCase().trim();
        if (firstB.length > 30) {
          for (const sA of secA.sentences) {
            const lowA = sA.toLowerCase().trim();
            if (lowA.length > 30) {
              const sim = this.calculateJaccardSimilarity(firstB, lowA);
              if (sim > 0.65 || (lowA.length > 40 && (firstB.includes(lowA) || lowA.includes(firstB)))) {
                adjacentRepetitionCount++;
                const msg = `Adjacent Section Repetition Alert: Section "${secB.heading}" repeats introductory explanation from preceding section "${secA.heading}".`;
                criticalErrors.push(msg);
                issues.push({
                  type: 'ADJACENT_SECTION_REPETITION',
                  severity: 'CRITICAL',
                  message: msg,
                  matchedSnippet: firstB.substring(0, 60),
                  context: `${secA.heading} -> ${secB.heading}`
                });
                break;
              }
            }
          }
        }
      }
    }

    // 10. Cross-Section Repeated Sentences (Boilerplate)
    if (sectionsData.length > 1) {
      const seenSentences = new Map<string, string>();
      for (const sec of sectionsData) {
        for (const s of sec.sentences) {
          const wordsCount = s.split(/\s+/).filter(Boolean).length;
          if (wordsCount < 8) continue; // Skip short transitions
          const sLower = s.toLowerCase();
          if (seenSentences.has(sLower)) {
            const priorHeading = seenSentences.get(sLower)!;
            if (priorHeading !== sec.heading) {
              const msg = `Boilerplate Alert: Verbatim sentence repeated across "${priorHeading}" and "${sec.heading}": "${s.substring(0, 60)}..."`;
              criticalErrors.push(msg);
              issues.push({
                type: 'REPEATED_BOILERPLATE',
                severity: 'CRITICAL',
                message: msg,
                matchedSnippet: s.substring(0, 60),
                context: `${priorHeading} -> ${sec.heading}`
              });
            }
          } else {
            seenSentences.set(sLower, sec.heading);
          }
        }
      }
    }

    const passed = criticalErrors.length === 0;
    const canExport = passed;

    return {
      passed,
      canExport,
      criticalErrors,
      warnings,
      issues,
      diagnostics: {
        promptLeakCount,
        placeholderCount,
        scaffoldingCount,
        fabricatedEvidenceIdCount,
        fabricatedAttributionCount,
        unverifiedAttributionCount,
        unsupportedNumericalCount,
        requiresReviewCount,
        topicDriftCount,
        hollowSectionCount,
        unfulfilledPromiseCount,
        fillerCount,
        duplicateHeadingCount,
        adjacentRepetitionCount,
        imagePlaceholderCount
      }
    };
  }

  /**
   * Computes Jaccard word similarity between two texts.
   */
  public static calculateJaccardSimilarity(text1: string, text2: string): number {
    const getTokens = (t: string) => new Set(t.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2));
    const s1 = getTokens(text1);
    const s2 = getTokens(text2);
    if (s1.size === 0 || s2.size === 0) return 0;
    let intersect = 0;
    for (const token of s1) {
      if (s2.has(token)) intersect++;
    }
    return intersect / (s1.size + s2.size - intersect);
  }

  /**
   * Distinguishes whether a sentence represents a prescriptive recommendation,
   * an explanatory framework, or a factual empirical claim.
   */
  public static isRecommendationOrAdvice(sentence: string): boolean {
    const trimmed = (sentence || '').trim();
    if (!trimmed) return false;
    return this.RECOMMENDATION_PATTERNS.some(pat => pat.test(trimmed));
  }
}
