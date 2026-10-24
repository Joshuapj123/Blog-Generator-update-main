import { 
  ContentGap, 
  ContentGapMatrix, 
  EvidenceSet, 
  GapImportance, 
  GapTreatment,
  CONTENT_INTELLIGENCE_POLICY
} from '@/core/contracts/evidence';
import { SaaSProfile } from '@/core/contracts/schemas';
import { TopicRelevanceValidator } from './TopicRelevanceValidator';

export interface BuildGapMatrixInput {
  evidenceSet: EvidenceSet;
  saasProfile?: SaaSProfile;
  competitors?: Array<{
    url: string;
    title?: string;
    headings?: Array<{ text: string; level?: string } | string>;
    text?: string;
    hasTables?: boolean;
  }>;
  targetKeyword: string;
  supportingTerms?: string[];
  geoIntelligence?: any;
}

export class ContentGapService {
  /**
   * Builds a deterministic ContentGapMatrix grounded in research evidence,
   * evaluating candidate gaps for topical relevance before approval.
   */
  public static buildGapMatrix(input: BuildGapMatrixInput): ContentGapMatrix {
    const gaps: ContentGap[] = [];
    const rejectedGaps: ContentGap[] = [];
    const competitors = input.competitors || [];
    const saasProfile = input.saasProfile;
    const evidenceSet = input.evidenceSet;

    // Aggregate normalized competitor headings and texts
    const allCompetitorHeadings = competitors
      .flatMap(c => c.headings || [])
      .map(h => (typeof h === 'string' ? h : h.text || ''))
      .map(h => h.toLowerCase().trim())
      .filter(Boolean);

    const allCompetitorText = competitors
      .map(c => (c.text || '').toLowerCase())
      .join(' ');

    // 1. Analyze Core Business Features against Competitor Coverage
    if (saasProfile?.keyFeatures && saasProfile.keyFeatures.length > 0) {
      saasProfile.keyFeatures.forEach((feature, idx) => {
        const cleanFeature = feature.split(/[(\[]/)[0].trim();
        const normFeature = cleanFeature.toLowerCase();

        // Calculate competitor coverage ratio (0 to 100)
        let mentionCount = 0;
        for (const heading of allCompetitorHeadings) {
          if (heading.includes(normFeature) || normFeature.includes(heading)) {
            mentionCount += 2;
          }
        }
        if (allCompetitorText.includes(normFeature)) {
          mentionCount += 1;
        }

        const maxExpectedMentions = Math.max(competitors.length * 2, 2);
        const competitorCoverage = Math.min(100, Math.round((mentionCount / maxExpectedMentions) * 100));
        const targetSiteCoverage = 100; // Directly verified on target business profile
        const missingFromCompetitors = competitorCoverage < CONTENT_INTELLIGENCE_POLICY.COMPETITOR_GAP_COVERAGE_THRESHOLD;

        // Find relevant evidence items (bidirectional and entity-token matching to preserve provenance)
        const featureTokens = normFeature.split(/\s+/).filter(t => t.length > 3);
        const matchingEvIds = evidenceSet.items
          .filter(i => {
            const claimLower = i.claim.toLowerCase();
            if (claimLower.includes(normFeature) || normFeature.includes(claimLower)) return true;
            if (i.entities?.some(e => {
              const entLower = e.toLowerCase();
              return normFeature.includes(entLower) || entLower.includes(normFeature);
            })) return true;
            return featureTokens.length > 0 && featureTokens.some(t => claimLower.includes(t) || i.entities?.some(e => e.toLowerCase().includes(t)));
          })
          .map(i => i.id);

        let importance: GapImportance = 'MEDIUM';
        let treatment: GapTreatment = 'SECTION';

        if (missingFromCompetitors) {
          importance = 'HIGH';
          treatment = 'SECTION';
        } else if (competitorCoverage > 75) {
          importance = 'LOW';
          treatment = 'SUBSECTION';
        }

        let buyerQuestion = `How does ${cleanFeature} address operational bottlenecks and workflows?`;
        if (missingFromCompetitors) {
          buyerQuestion = `Why is ${cleanFeature} a critical capability or evaluation criterion for ${input.targetKeyword}?`;
        }

        // Evaluate candidate gap relevance before approval
        const drift = TopicRelevanceValidator.evaluateCandidateGap(cleanFeature, input.targetKeyword, input.supportingTerms);
        if (drift) {
          rejectedGaps.push({
            id: `gap_feat_${idx + 1}`,
            topic: cleanFeature,
            importance: 'LOW',
            competitorCoverage,
            targetSiteCoverage,
            buyerQuestion,
            missingFromCompetitors: false,
            businessOpportunity: `Excluded from outline: ${drift.reason}`,
            evidenceIds: matchingEvIds,
            recommendedTreatment: 'OMIT',
            isApprovedForOutline: false,
            rejectionReason: drift.reason,
            driftVector: drift.driftVector,
          });
          return;
        }

        gaps.push({
          id: `gap_feat_${idx + 1}`,
          topic: cleanFeature,
          importance,
          competitorCoverage,
          targetSiteCoverage,
          buyerQuestion,
          missingFromCompetitors,
          businessOpportunity: missingFromCompetitors
            ? `Opportunity to establish authority where competing guides omit ${cleanFeature}.`
            : `Differentiate implementation quality for ${cleanFeature}.`,
          evidenceIds: matchingEvIds,
          recommendedTreatment: treatment,
          isApprovedForOutline: true,
        });
      });
    }

    // 2. Structured Comparison Table Gap
    // Only claim competitors lack tables when competitors were actually crawled and analyzed
    if (competitors.length > 0) {
      const anyCompetitorHasTables = competitors.some(c => c.hasTables);
      if (!anyCompetitorHasTables) {
        const bizEvIds = evidenceSet.items
          .filter(i => i.evidenceType === 'BUSINESS_FACT' || i.evidenceType === 'FEATURE' || i.sourceType === 'TARGET_SITE')
          .map(i => i.id);

        const cleanKeyword = input.targetKeyword.trim();
        const capitalizedKeyword = cleanKeyword.charAt(0).toUpperCase() + cleanKeyword.slice(1);
        const tableTopic = `${capitalizedKeyword} Evaluation & Comparison Matrix`;
        const drift = TopicRelevanceValidator.evaluateCandidateGap(tableTopic, input.targetKeyword, input.supportingTerms);

        if (drift) {
          rejectedGaps.push({
            id: 'gap_table_1',
            topic: tableTopic,
            importance: 'LOW',
            competitorCoverage: 10,
            targetSiteCoverage: 90,
            buyerQuestion: `How do core approaches and capabilities for ${cleanKeyword} compare across practical implementation criteria?`,
            missingFromCompetitors: true,
            businessOpportunity: `Excluded: ${drift.reason}`,
            evidenceIds: bizEvIds.slice(0, 3),
            recommendedTreatment: 'OMIT',
            isApprovedForOutline: false,
            rejectionReason: drift.reason,
            driftVector: drift.driftVector,
          });
        } else {
          gaps.push({
            id: 'gap_table_1',
            topic: tableTopic,
            importance: 'HIGH',
            competitorCoverage: 10,
            targetSiteCoverage: 90,
            buyerQuestion: `How do core approaches and capabilities for ${cleanKeyword} compare across practical implementation criteria?`,
            missingFromCompetitors: true,
            businessOpportunity: 'Competitors present only narrative claims; a structured comparison matrix provides technical clarity.',
            evidenceIds: bizEvIds.slice(0, 3),
            recommendedTreatment: 'TABLE',
            isApprovedForOutline: true,
          });
        }
      }
    }

    // 3. Buyer Questions / GEO AI Opportunities Gaps
    // Internal publishing recommendations must NOT become reader-facing content gaps
    // unless the article topic is genuinely about SEO, AI search, or search engine visibility.
    const isSeoOrAiTopic = TopicRelevanceValidator.isSeoDomainTopic(input.targetKeyword);
    if (isSeoOrAiTopic && input.geoIntelligence && Array.isArray(input.geoIntelligence.geoOpportunities)) {
      input.geoIntelligence.geoOpportunities.slice(0, 3).forEach((opp: any, idx: number) => {
        const topic = opp.issue ? `AI Visibility & Evaluation: ${opp.issue}` : `Buyer Decision Factor ${idx + 1}`;
        const drift = TopicRelevanceValidator.evaluateCandidateGap(topic, input.targetKeyword, input.supportingTerms);

        if (drift) {
          rejectedGaps.push({
            id: `gap_geo_${idx + 1}`,
            topic,
            importance: 'LOW',
            competitorCoverage: 20,
            targetSiteCoverage: 80,
            buyerQuestion: opp.recommendedAction || `What critical criteria must buyers review when evaluating ${input.targetKeyword}?`,
            missingFromCompetitors: competitors.length > 0,
            businessOpportunity: `Excluded: ${drift.reason}`,
            evidenceIds: (evidenceSet?.items || []).slice(0, 2).map(i => i.id),
            recommendedTreatment: 'OMIT',
            isApprovedForOutline: false,
            rejectionReason: drift.reason,
            driftVector: drift.driftVector,
          });
        } else {
          gaps.push({
            id: `gap_geo_${idx + 1}`,
            topic,
            importance: 'MEDIUM',
            competitorCoverage: 20,
            targetSiteCoverage: 80,
            buyerQuestion: opp.recommendedAction || `What critical criteria must buyers review when evaluating ${input.targetKeyword}?`,
            missingFromCompetitors: competitors.length > 0,
            businessOpportunity: opp.recommendedAction || 'Directly answer high-intent buyer decision queries.',
            evidenceIds: (evidenceSet?.items || []).slice(0, 2).map(i => i.id),
            recommendedTreatment: 'SECTION',
            isApprovedForOutline: true,
          });
        }
      });
    }

    // 4. Default Practical Practitioner Workflow Gap if empty (prevents outline starvation)
    if (gaps.length === 0) {
      const cleanKeyword = input.targetKeyword.trim();
      const capitalizedKeyword = cleanKeyword.charAt(0).toUpperCase() + cleanKeyword.slice(1);
      gaps.push({
        id: 'gap_default_1',
        topic: `End-to-End ${capitalizedKeyword} Implementation Lifecycle`,
        importance: 'HIGH',
        competitorCoverage: competitors.length > 0 ? 30 : 0,
        targetSiteCoverage: 85,
        buyerQuestion: `What are the practical steps, timelines, and architectural decisions required for ${cleanKeyword}?`,
        missingFromCompetitors: competitors.length > 0,
        businessOpportunity: 'Provide concrete practitioner execution guidance rather than generic theory.',
        evidenceIds: (evidenceSet?.items || []).slice(0, 3).map(i => i.id),
        recommendedTreatment: 'SECTION',
        isApprovedForOutline: true,
      });
    }

    const totalGaps = gaps.length;
    const highPriorityGaps = gaps.filter(g => g.importance === 'HIGH').length;
    const missingFromCompetitorsCount = gaps.filter(g => g.missingFromCompetitors).length;

    return {
      gaps,
      rejectedGaps,
      analyzedAt: new Date().toISOString(),
      summary: {
        totalGaps,
        highPriorityGaps,
        missingFromCompetitorsCount,
        rejectedGapsCount: rejectedGaps.length,
      }
    };
  }
}
