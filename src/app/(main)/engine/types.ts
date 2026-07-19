import { LucideIcon } from 'lucide-react';
import { ArticleBlueprint, SectionBlock } from '@/types/article';
import { SerpTerm, SerpEntity, FormatType } from '@/types/serp';

export interface AiKeywordResult {
  keyword: string;
  intent: 'primary' | 'secondary' | 'long-tail';
  category: 'core' | 'expansion' | 'long-tail' | 'competitor';
  searchIntent: 'informational' | 'navigational' | 'commercial' | 'transactional';
  rationale: string;
}

export interface GadsKeywordResult {
  keyword: string;
  avgMonthlySearches: string;
  competition: 'LOW' | 'MEDIUM' | 'HIGH';
  competitionScore: number;
  cpcLow: number;
  cpcHigh: number;
  intent: 'primary' | 'secondary' | 'long-tail';
  searchIntent: 'informational' | 'navigational' | 'commercial' | 'transactional';
  isEnhanced?: boolean;
}

export interface SerperKeywordResult {
  keyword: string;
  source: 'organic_title' | 'paa_question' | 'related_search';
  position?: number;
  snippet?: string;
  intent: 'primary' | 'secondary' | 'long-tail';
  searchIntent: 'informational' | 'navigational' | 'commercial' | 'transactional';
  competition: 'LOW' | 'MEDIUM' | 'HIGH';
  competitionScore: number;
  avgMonthlySearches: null;
  cpcLow: null;
  cpcHigh: null;
}

export interface DownloadFormat {
  key: string;
  label: string;
  ext: string;
  icon: LucideIcon;
  mime: string;
  hint: string;
}

export interface ExtractStage {
  id: number;
  label: string;
}

export interface WizardStep {
  id: number;
  label: string;
  icon: LucideIcon;
}

export type EngineQaTab = 'score' | 'weak-copy' | 'positives' | 'comparison' | 'serp' | 'intent';

export interface IntentClassification {
  intent: 'informational' | 'navigational' | 'commercial' | 'transactional';
  confidence: number;
  contentFormat: string;
  reasoning: string;
  serpSignals: string[];
  formatMismatchWarning: string | null;
}

export interface IntentAlignment {
  score: number;
  verdict: 'excellent' | 'acceptable' | 'needs_improvement';
  misalignments: string[];
  strengths: string[];
  topFix: string | null;
}
