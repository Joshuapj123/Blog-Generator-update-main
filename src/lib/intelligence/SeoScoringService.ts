// src/lib/intelligence/SeoScoringService.ts
import { calculateSeoScore, ScorerParams } from '@/lib/seo-intelligence/seo_scoring_engine';
import { ContentScoreResult } from '@/lib/content-scoring';

export class SeoScoringService {
  calculateScore(params: ScorerParams): ContentScoreResult {
    return calculateSeoScore(params);
  }
}
