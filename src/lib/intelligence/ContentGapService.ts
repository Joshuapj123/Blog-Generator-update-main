import { 
  ContentGap, 
  ContentGapMatrix, 
  EvidenceSet, 
  GapImportance, 
  GapTreatment,
  CONTENT_INTELLIGENCE_POLICY
} from '@/core/contracts/evidence';
import { SaaSProfile } from '@/core/contracts/schemas';

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
  geoIntelligence?: any;
}

export class ContentGapService {
  /**
   * Builds a deterministic ContentGapMatrix grounded in research evidence.
   */
  public static buildGapMatrix(input: BuildGapMatrixInput): ContentGapMatrix {
    const gaps: ContentGap[] = [];
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

        // Find relevant evidence items
        const matchingEvIds = evidenceSet.items
          .filter(i => i.claim.toLowerCase().includes(normFeature) || i.entities?.some(e => e.toLowerCase().includes(normFeature)))
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
          if (allCompetitorText.includes('wordpress') || allCompetitorText.includes('outsourcing') || allCompetitorText.includes('hourly') || allCompetitorText.includes('contractors')) {
            buyerQuestion = `How does ${cleanFeature} solve vendor evaluation and developer retention issues caused by traditional agency outsourcing?`;
          } else if (allCompetitorText.includes('chatgpt') || allCompetitorText.includes('wrapper') || allCompetitorText.includes('prompt') || allCompetitorText.includes('compliance overhead')) {
            buyerQuestion = `How does ${cleanFeature} mitigate enterprise AI security, prompt injection, and data leakage risks?`;
          } else {
            buyerQuestion = `Why is ${cleanFeature} a critical evaluation criterion that competing vendors fail to provide?`;
          }
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
        });
      });
    }

    // 2. Structured Comparison Table Gap
    const anyCompetitorHasTables = competitors.some(c => c.hasTables);
    if (!anyCompetitorHasTables) {
      const bizEvIds = evidenceSet.items
        .filter(i => i.evidenceType === 'BUSINESS_FACT' || i.evidenceType === 'FEATURE' || i.sourceType === 'TARGET_SITE')
        .map(i => i.id);

      const isAiFocus = allCompetitorText.includes('chatgpt') || allCompetitorText.includes('wrapper') || allCompetitorText.includes('ai');
      gaps.push({
        id: 'gap_table_1',
        topic: isAiFocus ? 'Enterprise AI Security & Compliance Matrix' : 'Delivery Model & Developer Retention Matrix',
        importance: 'HIGH',
        competitorCoverage: 10,
        targetSiteCoverage: 90,
        buyerQuestion: isAiFocus 
          ? 'How do private AI models with SOC-2 compliance compare against third-party API wrappers?'
          : 'How do dedicated engineering teams compare against traditional agency retainers?',
        missingFromCompetitors: true,
        businessOpportunity: 'Competitors present only narrative claims; a structured comparison matrix provides technical clarity.',
        evidenceIds: bizEvIds.slice(0, 3),
        recommendedTreatment: 'TABLE',
      });
    }

    // 3. Buyer Questions / GEO AI Opportunities Gaps
    if (input.geoIntelligence && Array.isArray(input.geoIntelligence.geoOpportunities)) {
      input.geoIntelligence.geoOpportunities.slice(0, 3).forEach((opp: any, idx: number) => {
        const topic = opp.issue ? `AI Visibility & Evaluation: ${opp.issue}` : `Buyer Decision Factor ${idx + 1}`;
        gaps.push({
          id: `gap_geo_${idx + 1}`,
          topic,
          importance: 'HIGH',
          competitorCoverage: 20,
          targetSiteCoverage: 80,
          buyerQuestion: opp.recommendedAction || `What critical criteria must buyers review when selecting ${input.targetKeyword}?`,
          missingFromCompetitors: true,
          businessOpportunity: opp.recommendedAction || 'Directly answer high-intent buyer decision queries.',
          evidenceIds: evidenceSet.items.slice(0, 2).map(i => i.id),
          recommendedTreatment: 'SECTION',
        });
      });
    }

    // 4. Default Practical Practitioner Workflow Gap if empty
    if (gaps.length === 0) {
      gaps.push({
        id: 'gap_default_1',
        topic: `End-to-End ${input.targetKeyword} Implementation Lifecycle`,
        importance: 'HIGH',
        competitorCoverage: 30,
        targetSiteCoverage: 85,
        buyerQuestion: `What are the practical steps, timelines, and architectural decisions required for ${input.targetKeyword}?`,
        missingFromCompetitors: true,
        businessOpportunity: 'Provide concrete practitioner execution guidance rather than generic theory.',
        evidenceIds: evidenceSet.items.slice(0, 3).map(i => i.id),
        recommendedTreatment: 'SECTION',
      });
    }

    const totalGaps = gaps.length;
    const highPriorityGaps = gaps.filter(g => g.importance === 'HIGH').length;
    const missingFromCompetitorsCount = gaps.filter(g => g.missingFromCompetitors).length;

    return {
      gaps,
      analyzedAt: new Date().toISOString(),
      summary: {
        totalGaps,
        highPriorityGaps,
        missingFromCompetitorsCount,
      }
    };
  }
}
