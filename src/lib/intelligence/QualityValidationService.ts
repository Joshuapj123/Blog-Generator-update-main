// src/lib/intelligence/QualityValidationService.ts
import { validateArticleQuality, QualityValidationReport } from '@/lib/seo-intelligence/quality_validator';

export class QualityValidationService {
  validate(text: string, keywords: string[], entities: string[]): QualityValidationReport {
    return validateArticleQuality(text, keywords, entities);
  }
}
