export interface ScoringComponents {
  authorityScore: number;
  topicalRelevance: number;
  competitorEvidenceCount: number; // number of competitors linked
  businessRelevance: number;
  feasibilityScore: number; // 0-100, e.g. 100 - difficulty
}

export class AuthorityScoringService {
  /**
   * Computes a transparent weighted opportunity score between 0 and 100.
   * 
   * Formula:
   * Score = 0.30 * AuthorityScore
   *       + 0.25 * TopicalRelevance
   *       + 0.20 * CompetitorEvidence
   *       + 0.15 * BusinessRelevance
   *       + 0.10 * Feasibility
   */
  static calculateScore(components: ScoringComponents): {
    totalScore: number;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
  } {
    // 1. Calculate Competitor Evidence component (Max 100)
    // 1 competitor = 50 points, 2+ competitors = 100 points
    const competitorEvidenceScore = components.competitorEvidenceCount >= 2 
      ? 100 
      : (components.competitorEvidenceCount === 1 ? 50 : 0);

    const weightedScore = 
      0.30 * components.authorityScore +
      0.25 * components.topicalRelevance +
      0.20 * competitorEvidenceScore +
      0.15 * components.businessRelevance +
      0.10 * components.feasibilityScore;

    const totalScore = Math.min(100, Math.max(0, Math.round(weightedScore)));

    // Determinstic Priority Mapping:
    // 80–100 -> HIGH
    // 60–79 -> MEDIUM
    // 0–59 -> LOW
    let priority: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    if (totalScore >= 80) {
      priority = 'HIGH';
    } else if (totalScore >= 60) {
      priority = 'MEDIUM';
    }

    return {
      totalScore,
      priority
    };
  }
}
