import { PerformanceInsight, PerformanceRecommendation } from '@/core/contracts/schemas';

export class RecommendationEngine {
  static generateRecommendations(insights: PerformanceInsight[]): PerformanceRecommendation[] {
    const recommendations: PerformanceRecommendation[] = [];

    for (const insight of insights) {
      const baseRec = {
        recommendationId: `rec_${insight.insightId.replace('ins_', '')}_${Date.now()}`,
        insightId: insight.insightId,
        assetId: insight.assetId,
        applied: false,
        createdAt: new Date().toISOString()
      };

      if (insight.type === 'HIGH_IMPRESSIONS_LOW_CTR') {
        recommendations.push({
          ...baseRec,
          changeType: 'UPDATE_META_DESCRIPTION',
          rationale: `The page has high impressions but low click-through. Updating the metadata will better capture searcher intent.`,
          confidence: insight.confidence * 0.9,
          expectedObjective: 'Increase traditional organic CTR by 15-20%.'
        });
        recommendations.push({
          ...baseRec,
          recommendationId: `${baseRec.recommendationId}_title`,
          changeType: 'UPDATE_TITLE',
          rationale: `High impressions indicate strong ranking but low CTR shows lack of appeal. Optimize Title Tag format.`,
          confidence: insight.confidence * 0.85,
          expectedObjective: 'Improve click attractiveness.'
        });
      } else if (insight.type === 'HIGH_CLICKS_LOW_CONVERSION') {
        recommendations.push({
          ...baseRec,
          changeType: 'IMPROVE_CTA',
          rationale: `User conversion rates are below target benchmark. CTAs should be repositioned or rephrased to align value.`,
          confidence: insight.confidence,
          expectedObjective: 'Raise signup/click-through conversion rate by 25%.'
        });
      } else if (insight.type === 'HIGH_ENGAGEMENT_LOW_TRAFFIC') {
        recommendations.push({
          ...baseRec,
          changeType: 'REVIEW_GEO_VISIBILITY',
          rationale: `Strong reader engagement indicates quality content, but search traffic is low. Target GEO parameters to get cited in AI answers.`,
          confidence: insight.confidence,
          expectedObjective: 'Boost citation mentions index in Perplexity and Gemini engines.'
        });
      } else {
        recommendations.push({
          ...baseRec,
          changeType: 'EXPAND_TOPIC',
          rationale: `Generic recommendations to refresh topic depth based on insight: ${insight.evidence}`,
          confidence: 0.5,
          expectedObjective: 'Expand long-tail keyword reach.'
        });
      }
    }

    return recommendations;
  }
}
