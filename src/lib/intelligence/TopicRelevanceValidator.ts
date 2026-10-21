// src/lib/intelligence/TopicRelevanceValidator.ts
import { ContentBrief, OutlineNode } from '@/core/contracts/schemas';
import { stemmer } from 'stemmer';

export interface DriftRejection {
  heading: string;
  reason: string;
  driftVector: 'STAFFING_HR' | 'META_SEO' | 'PROMPT_LEAKAGE' | 'UNRELATED';
}

export interface TopicRelevanceValidationResult {
  isValid: boolean;
  driftedHeadings: DriftRejection[];
  approvedHeadings: string[];
}

export interface SanitizationResult {
  brief: ContentBrief;
  sanitizationApplied: boolean;
  sanitizedHeadingsCount: number;
  replacedHeadings: Array<{ original: string; replacement: string; reason: string }>;
}

// Common English stopwords to exclude from topical token comparison
const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'could', 'did', 'do', 'does', 'doing', 'down', 'during',
  'each', 'few', 'for', 'from', 'further',
  'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
  'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself',
  'just', 'me', 'more', 'most', 'my', 'myself',
  'no', 'nor', 'not', 'now',
  'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', 'she', 'should', 'so', 'some', 'such',
  'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too',
  'under', 'until', 'up', 'very',
  'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would',
  'you', 'your', 'yours', 'yourself', 'yourselves'
]);

// Universal article architecture concepts that are always legitimate in any topic
const UNIVERSAL_FACET_STEMS = new Set([
  'overview', 'introduct', 'understand', 'defin', 'foundat', 'principl',
  'evalu', 'diagnos', 'metric', 'measur', 'assess', 'signal',
  'framework', 'workflow', 'implement', 'strateg', 'step', 'process', 'approach', 'guid',
  'best', 'practic', 'pitfal', 'mistak', 'barrier', 'bottleneck', 'challeng',
  'conclus', 'takeaway', 'futur', 'roadmap', 'next', 'action',
  'matrix', 'breakdown', 'criteria', 'checklist', 'compar', 'vs', 'versus'
].map(s => stemmer(s)));

// Generic metric stems that do not by themselves establish domain topicality
const GENERIC_METRIC_STEMS = new Set([
  'rate', 'cost', 'measur', 'score', 'level', 'count', 'number', 'index'
].map(s => stemmer(s)));

export class TopicRelevanceValidator {
  /**
   * Tokenizes and stems text into a clean set of word stems.
   */
  public static tokenizeAndStem(text: string): Set<string> {
    const tokens = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2 && !STOPWORDS.has(t));
    return new Set(tokens.map(t => stemmer(t)));
  }

  /**
   * Checks whether the primary keyword is specifically within the SEO / Search domain.
   * Tightened to require explicit SEO terms or context-specific search compounds,
   * avoiding false positives on generic technical words (schema, visibility, ranking).
   */
  public static isSeoDomainTopic(targetKeyword: string): boolean {
    const kw = targetKeyword.toLowerCase().trim();
    // 1. Explicit, unambiguous SEO / search terminology
    const explicitSeo = /\b(seo|search engine|ai search|generative engine(?: optimization)?|geo|serp|backlinks?|sitemaps?|rich snippets?)\b/i;
    // 2. Context-specific search compound phrases for terms that are generic in isolation
    const searchCompound = /\b(search visibility|ai visibility|brand visibility in (?:ai|search)|schema markup|schema\.org|structured data for search|serp rankings?|search rankings?|google rankings?|organic rankings?|search indexing|crawler indexing|search engine recognition)\b/i;

    return explicitSeo.test(kw) || searchCompound.test(kw);
  }

  /**
   * Checks whether the primary keyword is specifically within the HR / Staffing / Recruiting domain.
   */
  public static isStaffingDomainTopic(targetKeyword: string): boolean {
    return /\b(staffing|recruiting|hiring|developer retention|employee retention|agency retainer|outsourcing|talent acquisition|workforce|contractor)\b/i.test(targetKeyword);
  }

  /**
   * Evaluates a single heading for clear topic drift against the target keyword and supporting terms.
   */
  public static evaluateHeading(
    heading: string,
    targetKeyword: string,
    supportingTerms: string[] = [],
    coreConcept?: string
  ): DriftRejection | null {
    const cleanHeading = heading.replace(/^[#\d.\s]+/, '').trim();
    const headingLower = cleanHeading.toLowerCase();
    const conceptLower = (coreConcept || '').toLowerCase();
    const combined = `${headingLower} ${conceptLower}`;

    // 1. Vector A: Staffing / Developer Retention / HR Drift
    const isStaffingDrift = /\b(developer retention|employee retention|agency retainer|traditional agency retainers?|dedicated engineering teams? vs|staffing models?|developer burnout|hourly contractors?|recruiting engineers?)\b/i.test(combined);
    if (isStaffingDrift && !this.isStaffingDomainTopic(targetKeyword)) {
      return {
        heading: cleanHeading,
        reason: `Section addresses agency staffing models and developer retention, which is off-topic for "${targetKeyword}".`,
        driftVector: 'STAFFING_HR'
      };
    }

    // 2. Vector B: Meta-SEO / AI Search Engine Indexing (for non-SEO articles)
    const isMetaSeoDrift = /\b(brand visibility in ai|ai search recognition|enhancing brand visibility and ai|getting ai models to cite|ai search visibility|technical schema markup|schema structures? for search|search engine crawler recognition|rich snippet indexing)\b/i.test(combined);
    if (isMetaSeoDrift && !this.isSeoDomainTopic(targetKeyword)) {
      return {
        heading: cleanHeading,
        reason: `Section addresses internal AI search visibility and schema markup for search engines, which is off-topic for non-SEO topic "${targetKeyword}".`,
        driftVector: 'META_SEO'
      };
    }

    // 3. Vector C: Pipeline / Prompt Meta-Leakage
    const isPromptLeakage = /\b(implementing deep-dive research and technical schema|buyer question|content gap analysis|geo requirements and recommendations|critical decisions for technical leaders regarding implementing deep-dive)\b/i.test(combined);
    if (isPromptLeakage) {
      return {
        heading: cleanHeading,
        reason: `Section heading reflects internal prompt template instructions or pipeline diagnostic labels.`,
        driftVector: 'PROMPT_LEAKAGE'
      };
    }

    // 4. Vector D: Physical Hardware & Device Repair Drift (for software, UX, and digital topics)
    const isHardwareRepairDrift = /\b(hardware repair|screen (?:repair|replacement)|battery (?:repair|replacement)|device repair|component repair|repair rates?|soldering|phone repairs?)\b/i.test(combined);
    const isHardwareDomain = /\b(hardware|repair|soldering|electronics repair|device repair)\b/i.test(targetKeyword);
    if (isHardwareRepairDrift && !isHardwareDomain) {
      return {
        heading: cleanHeading,
        reason: `Section addresses physical device hardware repair, which is off-topic for software and conversion topic "${targetKeyword}".`,
        driftVector: 'UNRELATED'
      };
    }

    // 5. Vector E: Semantic Domain Disconnect
    const headingStems = this.tokenizeAndStem(cleanHeading);
    const keywordStems = this.tokenizeAndStem(targetKeyword);
    const supportingStems = new Set<string>();
    supportingTerms.forEach(term => {
      this.tokenizeAndStem(term).forEach(s => supportingStems.add(s));
    });

    // Check overlap with keyword stems (distinguish substantive vs generic metric stems)
    let hasNonGenericKeywordOverlap = false;
    let hasGenericOnlyKeywordOverlap = false;
    for (const stem of headingStems) {
      if (keywordStems.has(stem)) {
        if (GENERIC_METRIC_STEMS.has(stem)) {
          hasGenericOnlyKeywordOverlap = true;
        } else {
          hasNonGenericKeywordOverlap = true;
          break;
        }
      }
    }

    // Check overlap with supporting terms
    let hasSupportingOverlap = false;
    for (const stem of headingStems) {
      if (supportingStems.has(stem)) {
        hasSupportingOverlap = true;
        break;
      }
    }

    // Check overlap with universal lifecycle stems
    let hasUniversalFacetOverlap = false;
    for (const stem of headingStems) {
      if (UNIVERSAL_FACET_STEMS.has(stem)) {
        hasUniversalFacetOverlap = true;
        break;
      }
    }

    // Generic metric stem alone (e.g. "rate") is insufficient without supporting or universal context
    const hasKeywordOverlap = hasNonGenericKeywordOverlap || (hasGenericOnlyKeywordOverlap && (hasSupportingOverlap || hasUniversalFacetOverlap));

    // If a heading has zero overlap with keyword, supporting terms, AND universal facets, it is unrelated
    if (!hasKeywordOverlap && !hasSupportingOverlap && !hasUniversalFacetOverlap) {
      return {
        heading: cleanHeading,
        reason: `Section heading shares zero conceptual overlap with primary keyword "${targetKeyword}" or assigned supporting concepts.`,
        driftVector: 'UNRELATED'
      };
    }

    return null;
  }

  /**
   * Validates all headings in an outline.
   */
  public static validateOutline(
    outline: OutlineNode[],
    targetKeyword: string,
    supportingTerms: string[] = []
  ): TopicRelevanceValidationResult {
    const driftedHeadings: DriftRejection[] = [];
    const approvedHeadings: string[] = [];

    for (const node of outline) {
      const rejection = this.evaluateHeading(
        node.heading,
        targetKeyword,
        supportingTerms,
        node.core_concept
      );

      if (rejection) {
        driftedHeadings.push(rejection);
      } else {
        approvedHeadings.push(node.heading);
      }
    }

    return {
      isValid: driftedHeadings.length === 0,
      driftedHeadings,
      approvedHeadings
    };
  }

  /**
   * Sanitizes an outline by replacing drifted headings with safe, unique, topic-grounded sections
   * derived from the primary keyword and topic domain, returning a detailed sanitization report.
   */
  public static sanitizeOutlineWithReport(
    brief: ContentBrief,
    targetKeyword: string,
    supportingTerms: string[] = []
  ): SanitizationResult {
    const validation = this.validateOutline(brief.outline, targetKeyword, supportingTerms);
    if (validation.isValid) {
      return {
        brief,
        sanitizationApplied: false,
        sanitizedHeadingsCount: 0,
        replacedHeadings: []
      };
    }

    console.warn(`[TopicRelevanceValidator] Topic drift detected in ${validation.driftedHeadings.length} outline sections. Sanitizing outline before generation.`);

    const cleanKw = targetKeyword.trim();
    const titleKeyword = cleanKw.charAt(0).toUpperCase() + cleanKw.slice(1);

    // Pool of distinct practitioner facets to guarantee unique, meaningful replacements
    const candidateFacets = [
      {
        heading: `${titleKeyword} Evaluation & Comparison Criteria`,
        core_concept: `Structured evaluation framework and comparative breakdown for ${targetKeyword}.`,
        generate_table: true,
      },
      {
        heading: `Practical Diagnostics and Implementation Framework for ${titleKeyword}`,
        core_concept: `Step-by-step diagnostic methods, measurement baselines, and implementation steps.`,
        generate_table: false,
      },
      {
        heading: `Strategic Best Practices and Common Pitfalls to Avoid`,
        core_concept: `Proven practitioner strategies, testing hypotheses, and risk mitigation for ${targetKeyword}.`,
        generate_table: false,
      },
      {
        heading: `Measurement Baselines, Key Metrics, and Performance Signals`,
        core_concept: `Core performance metrics, tracking benchmarks, and measurement methodologies for ${targetKeyword}.`,
        generate_table: false,
      },
      {
        heading: `Step-by-Step Architecture and Execution Workflow`,
        core_concept: `Systematic technical architecture, integration phases, and deployment roadmap for ${targetKeyword}.`,
        generate_table: false,
      },
      {
        heading: `Tooling Selection, Verification Checklist, and Audit Framework`,
        core_concept: `Practical tooling assessment criteria, operational checklist, and audit controls for ${targetKeyword}.`,
        generate_table: false,
      },
      {
        heading: `Advanced Optimization Strategies and Scaling Considerations`,
        core_concept: `Advanced execution workflows, longitudinal optimization, and scaling patterns for ${targetKeyword}.`,
        generate_table: false,
      }
    ];

    // Collect all existing approved headings (lower case) to prevent collision with accepted sections
    const usedHeadingsLower = new Set<string>();
    brief.outline.forEach(n => {
      const isDrifted = validation.driftedHeadings.some(d => d.heading === n.heading.replace(/^[#\d.\s]+/, '').trim());
      if (!isDrifted) {
        usedHeadingsLower.add(n.heading.toLowerCase().trim());
      }
    });

    const replacedHeadings: Array<{ original: string; replacement: string; reason: string }> = [];

    const sanitizedOutline = brief.outline.map((node) => {
      const drifted = validation.driftedHeadings.find(d => d.heading === node.heading.replace(/^[#\d.\s]+/, '').trim());
      if (!drifted) {
        return node;
      }

      // Find first candidate facet that does not collide with ANY approved heading or previously chosen replacement
      const replacementCandidate = candidateFacets.find(c => !usedHeadingsLower.has(c.heading.toLowerCase().trim()));

      if (!replacementCandidate) {
        throw new Error(
          `[TopicRelevanceValidator] Cannot safely sanitize outline for "${targetKeyword}": all available unique replacement facets exhausted without collision.`
        );
      }

      usedHeadingsLower.add(replacementCandidate.heading.toLowerCase().trim());
      replacedHeadings.push({
        original: node.heading,
        replacement: replacementCandidate.heading,
        reason: drifted.reason
      });

      console.warn(`[TopicRelevanceValidator] Replacing off-topic heading "${node.heading}" with unique topic-grounded heading "${replacementCandidate.heading}".`);

      return {
        ...node,
        heading: replacementCandidate.heading,
        core_concept: replacementCandidate.core_concept,
        generate_table: node.generate_table || replacementCandidate.generate_table,
        assignedKeywords: node.assignedKeywords?.filter(k => !k.toLowerCase().includes('retention') && !k.toLowerCase().includes('agency')) || [],
        assignedEntities: node.assignedEntities?.filter(e => !e.toLowerCase().includes('retention')) || []
      };
    });

    return {
      brief: {
        ...brief,
        outline: sanitizedOutline
      },
      sanitizationApplied: true,
      sanitizedHeadingsCount: replacedHeadings.length,
      replacedHeadings
    };
  }

  /**
   * Sanitizes an outline by replacing drifted headings with safe, unique, topic-grounded sections,
   * returning the sanitized ContentBrief.
   */
  public static sanitizeOutline(
    brief: ContentBrief,
    targetKeyword: string,
    supportingTerms: string[] = []
  ): ContentBrief {
    return this.sanitizeOutlineWithReport(brief, targetKeyword, supportingTerms).brief;
  }
}
