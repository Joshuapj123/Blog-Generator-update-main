// src/lib/intelligence/DeliverableContractValidator.ts
import { EvidenceSet } from '@/core/contracts/evidence';
import { EditorialIntegrityIssue } from './EditorialIntegrityValidator';

export type DeliverableType = 'AUDIT' | 'COMPARISON' | 'CHECKLIST' | 'STRATEGY' | 'CASE_STUDY';

export interface DeliverableContractCheckResult {
  deliverableType: DeliverableType | null;
  passed: boolean;
  issues: EditorialIntegrityIssue[];
  missingElements: string[];
}

export class DeliverableContractValidator {
  /**
   * Identifies the promised deliverable type from a section heading.
   */
  public static detectDeliverableType(heading: string): DeliverableType | null {
    const cleanHeading = heading.replace(/^#{2,3}\s+/, '').trim();

    // 1. Checklist Deliverable (checked first to prevent "Audit Checklist" from defaulting to general audit)
    if (/\b(?:checklist|verification\s+list|audit\s+checklist|readiness\s+checklist)\b/i.test(cleanHeading)) {
      return 'CHECKLIST';
    }

    // 2. Comparison Deliverable (checked before audit so "Audit A vs Audit B" or "In-House Review vs External Specialist" is a comparison)
    if (/\b(?:vs\.?|versus|comparison|comparing|alternatives?\s+(?:to|analysis)|pros\s+and\s+cons|options|differentiation)\b/i.test(cleanHeading)) {
      return 'COMPARISON';
    }

    // 3. Case Study / Worked Example Deliverable
    if (/\b(?:case\s+study|real-world\s+example|in\s+practice|worked\s+example|scenario\s+analysis)\b/i.test(cleanHeading)) {
      return 'CASE_STUDY';
    }

    // 4. Strategy Deliverable
    if (/\b(?:strategy|strategic\s+plan|strategic\s+roadmap|action\s+plan|execution\s+plan)\b/i.test(cleanHeading)) {
      return 'STRATEGY';
    }

    // 5. Audit Deliverable
    // Sections that merely explain concepts or mechanisms (e.g. "Understanding UX Audit Fundamentals" or "How an Expert UX Audit Fixes Friction") do not promise a concrete audit deliverable.
    const isEducationalIntro = /\b(?:fundamentals|overview|introduction|what\s+is|why|definition|basics|principles)\b/i.test(cleanHeading) ||
      /^how\s+(?:an?|the\s+)?[\w\s-]+\s+(?:works?|fixes?|helps?|improves?|operates?|functions?|matters?)\b/i.test(cleanHeading);
    if (!isEducationalIntro && /\b(?:audit|auditing|heuristic\s+evaluation|usability\s+review|friction\s+(?:audit|assessment|review)|ux\s+audit)\b/i.test(cleanHeading)) {
      return 'AUDIT';
    }

    return null;
  }

  /**
   * Validates whether a section's body fulfills the deliverable contract promised by its heading.
   */
  public static validateSectionDeliverable(
    heading: string,
    body: string,
    options?: {
      evidenceSet?: EvidenceSet;
    }
  ): DeliverableContractCheckResult {
    const deliverableType = this.detectDeliverableType(heading);
    if (!deliverableType) {
      return {
        deliverableType: null,
        passed: true,
        issues: [],
        missingElements: []
      };
    }

    const cleanBody = body.replace(/```[\s\S]*?```/g, '').trim();
    const cleanHeading = heading.replace(/^#{2,3}\s+/, '').trim();
    const missingElements: string[] = [];
    const issues: EditorialIntegrityIssue[] = [];

    switch (deliverableType) {
      case 'AUDIT': {
        // An audit deliverable MUST provide:
        // 1. Evaluation criteria / heuristics
        const hasCriteria = /\b(?:evaluation\s+criteria|criteria|heuristics?|standards?|usability\s+(?:principles?|standards?|heuristics?)|nielsen|accessibility|wcag|contrast|readability|cognitive\s+load|navigation\s+structure|error\s+prevention)\b/i.test(cleanBody);
        if (!hasCriteria) missingElements.push('evaluation criteria');

        // 2. Specific observations / interface elements
        const hasObservations = /\b(?:forms?|inputs?|fields?|buttons?|checkout|modals?|ctas?|navigation|steps?|labels?|error\s+states?|dropdowns?|mobile\s+view|screens?|pages?|layout|microcopy|tooltips?|page\s+load)\b/i.test(cleanBody);
        if (!hasObservations) missingElements.push('specific interface observations');

        // 3. Identified problems / friction points
        const hasProblems = /\b(?:friction|drop-off|abandonment|confusion|bottleneck|ambiguous|hesitation|unclear|barrier|misleading|cluttered|cognitive\s+overhead|failure\s+points?|usability\s+defects?)\b/i.test(cleanBody);
        if (!hasProblems) missingElements.push('identified friction problems');

        // 4. Impact or consequence
        const hasImpact = /\b(?:consequence|impact|leads\s+to|results\s+in|causes|reduces\s+conversions?|frustrates|increases\s+abandonment|drives\s+users\s+away|impedes|prevents\s+users\s+from|drop-off\s+rate)\b/i.test(cleanBody);
        if (!hasImpact) missingElements.push('impact or consequence analysis');

        // 5. Prioritized corrective actions
        const hasCorrectiveActions = /\b(?:recommend(?:ations?|ed)?|prioritize|remedy|remediation|action\s+items?|corrective\s+actions?|fix(?:es)?|redesign|streamline|eliminate|resolve|quick\s+wins?|high\s+priority|first\s+step)\b/i.test(cleanBody);
        if (!hasCorrectiveActions) missingElements.push('prioritized corrective actions');

        const wordCount = cleanBody.split(/\s+/).filter(Boolean).length;
        if (wordCount < 35) {
          missingElements.push('sufficient analytical substance (minimum 35 words required for complete audit evaluation)');
        }

        if (missingElements.length > 0) {
          const msg = `Unfulfilled Deliverable Alert: Section "${cleanHeading}" promises an audit deliverable, but lacks ${missingElements.join(', ')}. An audit section must deliver concrete evaluation criteria, interface observations, identified problems, impact analysis, and prioritized corrective actions.`;
          issues.push({
            type: 'UNFULFILLED_HEADING_PROMISE',
            severity: 'CRITICAL',
            message: msg,
            matchedSnippet: cleanHeading,
            context: 'AUDIT_CONTRACT'
          });
        }
        break;
      }

      case 'COMPARISON': {
        // A comparison deliverable MUST provide:
        // 1. Explicit alternatives (at least 2 distinct entities or options)
        const hasTable = /\|.*\|/.test(cleanBody);
        const hasVersusOrCompared = /\b(?:versus|vs\.?|compared\s+(?:to|with)|in\s+contrast\s+to|alternative|option\s+[ab12]|on\s+one\s+hand|on\s+the\s+other\s+hand)\b/i.test(cleanBody);
        const hasExplicitOptions = hasTable || hasVersusOrCompared;
        if (!hasExplicitOptions) missingElements.push('explicit alternatives');

        // 2. Comparison dimensions
        const hasDimensions = /\b(?:cost|pricing|speed|velocity|flexibility|quality|overhead|depth|scalability|control|experience|complexity|maintenance|governance|time-to-value|customization)\b/i.test(cleanBody);
        if (!hasDimensions) missingElements.push('comparison dimensions');

        // 3. Meaningful differences & trade-offs
        const hasTradeOffs = /\b(?:trade-offs?|tradeoffs?|compromises?|in\s+contrast|weighing|weigh\s+[^,.]+\s+against|while\s+[^,.]+,?\s+[^,.]+\b(?:requires?|costs?|sacrifices?|lacks?|suffers?|is\s+subject)|in\s+exchange\s+for|on\s+the\s+other\s+hand|whereas|drawbacks?|limitations?|downsides?|advantages?|benefits?|upsides?|pros?\b|cons?\b)\b/i.test(cleanBody);
        if (!hasTradeOffs) missingElements.push('meaningful trade-offs');

        // 4. Justified conclusion / decision rule
        const hasConclusion = /\b(?:choose\s+[^,.]+\s+(?:if|when)|best\s+suited\s+for|recommendation|in\s+conclusion|verdict|ideal\s+for|if\s+your\s+priority\s+is|decision\s+(?:framework|rule)|weighing\s+these\s+factors)\b/i.test(cleanBody);
        if (!hasConclusion) missingElements.push('justified conclusion');

        if (missingElements.length > 0) {
          const msg = `Unfulfilled Deliverable Alert: Section "${cleanHeading}" promises a comparison deliverable, but lacks ${missingElements.join(', ')}. A comparison section must deliver explicit alternatives, comparison dimensions, meaningful trade-offs, and a justified conclusion.`;
          issues.push({
            type: 'UNFULFILLED_HEADING_PROMISE',
            severity: 'CRITICAL',
            message: msg,
            matchedSnippet: cleanHeading,
            context: 'COMPARISON_CONTRACT'
          });
        }
        break;
      }

      case 'CHECKLIST': {
        // A checklist deliverable MUST provide:
        // 1. Structured list
        const listItems = cleanBody
          .split('\n')
          .filter(line => /^\s*(?:[-*]|\d+\.)\s+/.test(line))
          .map(line => line.replace(/^\s*(?:[-*]|\d+\.)\s+/, '').trim());

        if (listItems.length < 3) {
          missingElements.push('at least 3 structured checklist items');
        }

        // 2. Observable verification criteria (must not be merely generic advice)
        const verificationVerbsRegex = /\b(?:verify\b|ensure\b|check\b|confirm\b|validate\b|test\b|inspect\b|require\b|audit\b|determine\s+if\b|look\s+for\b|evaluate\b)/i;
        const verifiableItems = listItems.filter(item => verificationVerbsRegex.test(item));

        // If list exists but less than 60% of items are observable verification checks, it's empty advice
        if (listItems.length >= 3 && verifiableItems.length < Math.ceil(listItems.length * 0.6)) {
          missingElements.push('observable pass/fail verification conditions (found empty or obvious advice)');
        }

        if (missingElements.length > 0) {
          const msg = `Unfulfilled Deliverable Alert: Section "${cleanHeading}" promises a checklist, but lacks ${missingElements.join(', ')}. Checklist items must deliver concrete, observable pass/fail checks with implementation guidance.`;
          issues.push({
            type: 'UNFULFILLED_HEADING_PROMISE',
            severity: 'CRITICAL',
            message: msg,
            matchedSnippet: cleanHeading,
            context: 'CHECKLIST_CONTRACT'
          });
        }
        break;
      }

      case 'STRATEGY': {
        // A strategy deliverable MUST provide:
        // 1. Defined objective
        const hasObjective = /\b(?:objective|goal|target|aim|outcome|deliverable|purpose)\b/i.test(cleanBody);
        if (!hasObjective) missingElements.push('defined objective');

        // 2. Proposed actions & Sequencing / Prioritization
        const hasSequencing = /\b(?:phase\s+[1-4]|first|next|priority|milestone|sequence|roadmap|step\s+[1-5]|timeline|short-term|long-term)\b/i.test(cleanBody);
        if (!hasSequencing) missingElements.push('sequencing or prioritization roadmap');

        // 3. Measurable success criteria
        const hasMetrics = /\b(?:kpi|measure|track|benchmark|metric|conversion\s+rate|retention|latency|baseline|completion\s+rate|success\s+metric|analytics)\b/i.test(cleanBody);
        if (!hasMetrics) missingElements.push('measurable success criteria');

        // 4. Ban on unsupported absolute guarantees
        const guaranteeMatch = cleanBody.match(/\b(?:guarantees?\s+(?:100%|immediate\s+success|double\s+revenue|10x\s+growth|instant\s+conversions?)|guaranteed\s+roi|risk-free\s+guarantee)\b/i);
        if (guaranteeMatch) {
          const msg = `Unsupported Guarantee Alert: Section "${cleanHeading}" contains an unsupported commercial guarantee ("${guaranteeMatch[0]}"). Strategic recommendations must establish realistic, measurable criteria without inventing ungrounded guarantees.`;
          issues.push({
            type: 'UNSUPPORTED_GUARANTEE',
            severity: 'CRITICAL',
            message: msg,
            matchedSnippet: guaranteeMatch[0],
            context: 'UNSUPPORTED_GUARANTEE'
          });
        }

        if (missingElements.length > 0) {
          const msg = `Unfulfilled Deliverable Alert: Section "${cleanHeading}" promises a strategy deliverable, but lacks ${missingElements.join(', ')}. A strategy section must deliver a defined objective, proposed actions, sequencing roadmap, and measurable success criteria.`;
          issues.push({
            type: 'UNFULFILLED_HEADING_PROMISE',
            severity: 'CRITICAL',
            message: msg,
            matchedSnippet: cleanHeading,
            context: 'STRATEGY_CONTRACT'
          });
        }
        break;
      }

      case 'CASE_STUDY': {
        // A case study / worked example MUST provide:
        // 1. Identifiable context
        const hasContext = /\b(?:client|company|platform|store|application|product|baseline|scenario|environment|challenge)\b/i.test(cleanBody);
        if (!hasContext) missingElements.push('identifiable context');

        // 2. Evidence or explicitly labelled illustrative assumptions
        const hasLabelledAssumptions = /\b(?:[\[(]?(?:illustrative|hypothetical|example\s+scenario|for\s+instance|sample\s+audit|case\s+scenario)[\])]?)\b/i.test(cleanBody);
        const hasVerifiedEvidence = Boolean(options?.evidenceSet && options.evidenceSet.items.length > 0);
        if (!hasLabelledAssumptions && !hasVerifiedEvidence) {
          missingElements.push('evidence grounding or explicitly labelled illustrative assumptions');
        }

        // 3. Actions taken
        const hasActions = /\b(?:actions?\s+taken|implemented|redesigned|executed|interventions?|applied|conducted)\b/i.test(cleanBody);
        if (!hasActions) missingElements.push('specific actions taken');

        // 4. Outcomes / Results
        const hasOutcomes = /\b(?:results?|outcomes?|measured|observed|achieved|saw|reduction|increase|improvement|target\s+outcome)\b/i.test(cleanBody);
        if (!hasOutcomes) missingElements.push('observed or verified outcomes');

        if (missingElements.length > 0) {
          const msg = `Unfulfilled Deliverable Alert: Section "${cleanHeading}" promises a case study deliverable, but lacks ${missingElements.join(', ')}. A case study section must deliver identifiable context, explicitly labelled assumptions/evidence, specific actions taken, and verified outcomes.`;
          issues.push({
            type: 'UNFULFILLED_HEADING_PROMISE',
            severity: 'CRITICAL',
            message: msg,
            matchedSnippet: cleanHeading,
            context: 'CASE_STUDY_CONTRACT'
          });
        }
        break;
      }
    }

    return {
      deliverableType,
      passed: issues.length === 0,
      issues,
      missingElements
    };
  }

  /**
   * Evaluates anti-repetition across non-adjacent sections:
   * - Recycled recommendations without distinct implementation guidance.
   * - Repeated introductory and concluding paragraphs.
   */
  public static validateAntiRepetition(
    sections: Array<{ heading: string; body: string; sentences: string[] }>
  ): EditorialIntegrityIssue[] {
    const issues: EditorialIntegrityIssue[] = [];
    if (sections.length < 2) return issues;

    // 1. Recycled recommendations check
    const sectionRecommendations: Array<{ heading: string; body: string; recommendations: string[] }> = sections.map(sec => {
      const recs: string[] = [];
      for (const sent of sec.sentences) {
        if (/\b(?:we recommend|it is recommended|we advise|it is advised|we suggest|it is suggested|you should|teams should|make sure to|be sure to|consider using|it is advisable|best practice is to|prioritize|opt for)\b/i.test(sent)) {
          recs.push(sent);
        }
      }
      return { heading: sec.heading, body: sec.body, recommendations: recs };
    });

    for (let i = 0; i < sectionRecommendations.length; i++) {
      for (let j = i + 1; j < sectionRecommendations.length; j++) {
        const secA = sectionRecommendations[i];
        const secB = sectionRecommendations[j];

        for (const recA of secA.recommendations) {
          for (const recB of secB.recommendations) {
            const rawSim = this.calculateJaccardSimilarity(recA, recB);
            const semanticSim = this.calculateSemanticSimilarity(recA, recB);
            const isSubstr = recA.length > 35 && (recA.toLowerCase().includes(recB.toLowerCase()) || recB.toLowerCase().includes(recA.toLowerCase()));

            // False positive guard: Check if recB or secB adds genuine technical implementation detail
            const hasTechnicalDetail = /\b(?:configure|configuration|parameters?|script|command|endpoint|sql|env|docker|table|index|query|step-by-step)\b/i.test(recB) ||
              /```[\s\S]*?```/.test(secB.body) ||
              /\b(?:1\.|2\.)\s+/.test(secB.body);

            const isRepetition = (rawSim > 0.60 || semanticSim > 0.52 || isSubstr) && !hasTechnicalDetail;

            if (isRepetition) {
              const msg = `Recycled Recommendation Alert: Section "${secB.heading}" repeats recommendation from section "${secA.heading}": "${recB.substring(0, 60)}..." without providing distinct implementation guidance.`;
              issues.push({
                type: 'REPEATED_BOILERPLATE',
                severity: 'CRITICAL',
                message: msg,
                matchedSnippet: recB.substring(0, 60),
                context: `${secA.heading} -> ${secB.heading}`
              });
            }
          }
        }
      }
    }

    // 2. Repeated introductory / concluding paragraphs across all section pairs (including non-adjacent)
    for (let i = 0; i < sections.length; i++) {
      for (let j = i + 1; j < sections.length; j++) {
        const secA = sections[i];
        const secB = sections[j];

        const paragraphsA = secA.body.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 40 && !p.startsWith('#'));
        const paragraphsB = secB.body.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 40 && !p.startsWith('#'));

        if (paragraphsA.length > 0 && paragraphsB.length > 0) {
          // Check opening paragraphs
          const openA = paragraphsA[0].toLowerCase();
          const openB = paragraphsB[0].toLowerCase();
          const openSim = this.calculateJaccardSimilarity(openA, openB);
          if (openSim > 0.65) {
            const msg = `Repeated Introduction Alert: Section "${secB.heading}" repeats opening framing from section "${secA.heading}": "${openB.substring(0, 60)}...". Each section must establish a distinct information scope.`;
            issues.push({
              type: 'REPEATED_BOILERPLATE',
              severity: 'CRITICAL',
              message: msg,
              matchedSnippet: openB.substring(0, 60),
              context: `${secA.heading} -> ${secB.heading}`
            });
          }

          // Check concluding paragraphs
          const closeA = paragraphsA[paragraphsA.length - 1].toLowerCase();
          const closeB = paragraphsB[paragraphsB.length - 1].toLowerCase();
          const closeSim = this.calculateJaccardSimilarity(closeA, closeB);
          if (closeSim > 0.65) {
            const msg = `Repeated Conclusion Alert: Section "${secB.heading}" repeats concluding summary from section "${secA.heading}": "${closeB.substring(0, 60)}...". Avoid recycling generic concluding summaries across sections.`;
            issues.push({
              type: 'REPEATED_BOILERPLATE',
              severity: 'CRITICAL',
              message: msg,
              matchedSnippet: closeB.substring(0, 60),
              context: `${secA.heading} -> ${secB.heading}`
            });
          }
        }
      }
    }

    return issues;
  }

  /**
   * Enforces evidence grounding on quantitative statistics.
   * Unverified percentages, multipliers, or metrics asserted as empirical facts
   * without research evidence or illustrative qualification are flagged as UNSUPPORTED_NUMERICAL.
   */
  public static validateNumericalGrounding(
    sectionHeading: string,
    body: string,
    evidenceSet?: EvidenceSet
  ): EditorialIntegrityIssue[] {
    const issues: EditorialIntegrityIssue[] = [];
    const cleanBody = body.replace(/```[\s\S]*?```/g, '');
    const cleanHeading = sectionHeading.replace(/^#{2,3}\s+/, '').trim();

    const sentences = cleanBody
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 5);

    const allEvidence = Array.isArray(evidenceSet) ? evidenceSet : (evidenceSet?.items || []);
    const evidenceText = allEvidence
      .map(e => `${e.claim} ${e.sourceTitle || ''} ${(e.entities || []).join(' ')}`)
      .join(' ')
      .toLowerCase();

    const STATISTIC_REGEX = /(?<![\d.])(\d+(?:\.\d+)?%|\d+(?:\.\d+)?x\s+(?:faster|higher|increase|reduction|growth)|\$\d+(?:,\d+)*(?:\.\d+)?|\b\d{2,3}%\s+of\s+(?:users|customers|shoppers|teams|businesses|companies|developers|organizations))/gi;
    const ILLUSTRATIVE_QUALIFIER_REGEX = /\b(?:for\s+example|for\s+instance|hypothetically|suppose|assuming|illustrative|as\s+an\s+example|say,)\b/i;
    const ATTRIBUTED_SOURCE_REGEX = /\b(?:according\s+to|reported\s+by|published\s+by|study\s+by|research\s+(?:by|from)|data\s+from|found\s+by|documentation\s+shows|standards?\s+show|guidelines?\s+show|survey\s+by|benchmarks?\s+show)\s+[A-Z][a-zA-Z0-9\s-]{2,50}\b/i;
    const INLINE_CITATION_OR_LINK_REGEX = /\[[^\]]+\]\([^\)]+\)/;
    const EMPIRICAL_STUDY_CLAIM_REGEX = /\b(?:studies\s+(?:prove|proves|show|shows|found|indicate|indicates)|research\s+(?:proves|shows|found|indicates)|surveys?\s+(?:show|shows|found|prove)|data\s+(?:proves|shows|indicates))\b/i;
    const UNGROUNDED_MARKET_STAT_REGEX = /(?:\b\d{2,3}%\s+of\s+(?:users|customers|shoppers|teams|businesses|companies|developers|organizations)|\b\d+(?:\.\d+)?x\s+(?:faster|higher|increase|reduction|growth))/i;

    const hasEvidenceSet = allEvidence.length > 0;

    for (const sent of sentences) {
      const isTableRow = /^\|.*\|$/.test(sent.trim());
      const isAttributed = ATTRIBUTED_SOURCE_REGEX.test(sent);
      const hasInlineCitation = INLINE_CITATION_OR_LINK_REGEX.test(sent);
      const isQualified = ILLUSTRATIVE_QUALIFIER_REGEX.test(sent);

      const matches = [...sent.matchAll(STATISTIC_REGEX)];
      for (const match of matches) {
        const statSnippet = match[0];

        let isUnsupported = false;

        if (hasEvidenceSet) {
          // Check if the exact statistic exists in research evidence
          const statDigits = statSnippet.replace(/[^\d.]/g, '');
          const isSupportedByEvidence = evidenceText.includes(statSnippet.toLowerCase()) || (statDigits.length > 0 && evidenceText.includes(statDigits));
          if (!isSupportedByEvidence && !isQualified && !isAttributed && !hasInlineCitation && !isTableRow) {
            isUnsupported = true;
          }
        } else {
          // If no evidence set is provided (e.g. standalone validation without research context),
          // flag statistics that claim unverified research/study backing or make ungrounded population/multiplier claims
          const isEmpiricalAssertion = EMPIRICAL_STUDY_CLAIM_REGEX.test(sent) || UNGROUNDED_MARKET_STAT_REGEX.test(statSnippet) || UNGROUNDED_MARKET_STAT_REGEX.test(sent);
          if (isEmpiricalAssertion && !isQualified && !isAttributed && !hasInlineCitation && !isTableRow) {
            isUnsupported = true;
          }
        }

        if (isUnsupported) {
          const msg = `Unsupported Statistic Alert: Numerical statistic "${statSnippet}" in section "${cleanHeading}" is asserted as an empirical fact ("${sent}") but lacks grounding in research evidence. Clearly label as an illustrative example or ground with verified source.`;
          issues.push({
            type: 'UNSUPPORTED_NUMERICAL',
            severity: 'CRITICAL',
            message: msg,
            matchedSnippet: statSnippet,
            context: cleanHeading
          });
        }
      }
    }

    return issues;
  }

  /**
   * Helper: computes Jaccard word similarity between two texts.
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
   * Helper: normalizes synonyms and common morphological variations for semantic anti-repetition.
   */
  public static normalizeSemanticTokens(text: string): Set<string> {
    const synonymMap: Record<string, string> = {
      streamline: 'simplify',
      streamlining: 'simplify',
      simplifying: 'simplify',
      reduce: 'minimize',
      reducing: 'minimize',
      minimizing: 'minimize',
      eliminate: 'remove',
      eliminating: 'remove',
      removing: 'remove',
      shoppers: 'users',
      customers: 'users',
      buyers: 'users',
      clients: 'users',
      advise: 'recommend',
      advising: 'recommend',
      suggest: 'recommend',
      suggesting: 'recommend',
      propose: 'recommend',
      struggle: 'difficult',
      struggling: 'difficult',
      intricate: 'complex',
      unnecessary: 'redundant'
    };

    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2);

    const tokens = new Set<string>();
    for (const w of words) {
      tokens.add(synonymMap[w] || w);
    }
    return tokens;
  }

  /**
   * Computes semantic Jaccard similarity across normalized synonym tokens.
   */
  public static calculateSemanticSimilarity(text1: string, text2: string): number {
    const s1 = this.normalizeSemanticTokens(text1);
    const s2 = this.normalizeSemanticTokens(text2);
    if (s1.size === 0 || s2.size === 0) return 0;
    let intersect = 0;
    for (const token of s1) {
      if (s2.has(token)) intersect++;
    }
    return intersect / (s1.size + s2.size - intersect);
  }
}
