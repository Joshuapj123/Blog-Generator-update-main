'use client';

import { useState, useMemo, type ReactNode } from 'react';
import {
  TrendingUp, AlertTriangle, CheckCircle2, Scale,
  Search, Target, AlertCircle, Info, Tag, BookOpen, BrainCircuit, Sparkles,
  RefreshCw, Loader2, Target as TargetIcon, Search as SearchIcon,
  Quote, Lightbulb, PenTool, Terminal, ChevronDown, ChevronUp, Database
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ContentScoreResult } from '@/lib/content-scoring';
import { validateArticleQuality } from '@/lib/seo-intelligence/quality_validator';
import { CompareTabContent } from '@/components/CompareTabContent';
import { WeakCopyCard } from '@/components/ui/WeakCopyCard';
import type { HighlightData } from '@/components/SectionEditor';
import type { KeywordBank } from '@/types/article';
import { SerpAnalysisResult, SerpEntity } from '@/types/serp';

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="relative inline-flex items-center group ml-1.5 align-middle">
      <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help hover:text-indigo-400 transition-colors" />
      <span
        role="tooltip"
        className="
          pointer-events-none absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2
          w-64 px-3 py-2.5 rounded-xl bg-slate-900 text-white text-[11px] leading-relaxed shadow-xl
          opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100
          transition-all duration-200 origin-bottom
        "
      >
        {text}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
      </span>
    </span>
  );
}

function countOccurrences(text: string, term: string): number {
  if (!text || !term) return 0;
  try {
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return (text.match(new RegExp(`\\b${esc}\\b`, 'gi')) || []).length;
  } catch { return 0; }
}

function ScoreGauge({ score, size = 80 }: { score: number; size?: number }) {
  const stroke = 6;
  const radius = 34; // fits nicely within 80x80 container with stroke=6
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  // Curated premium HSL colors matching the score levels
  const strokeColor = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg height={size} width={size} viewBox="0 0 80 80" className="transform -rotate-90">
          <circle
            cx="40"
            cy="40"
            r={radius}
            fill="none"
            stroke="#f1f5f9"
            strokeWidth={stroke}
          />
          <circle
            cx="40"
            cy="40"
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.8s ease-in-out' }}
          />
        </svg>
        <div className="absolute flex flex-col items-center justify-center">
          <span className="text-2xl font-black text-slate-800 leading-none">{score}</span>
        </div>
      </div>
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1.5">SEO Score</span>
    </div>
  );
}

function MetricBar({ label, value, pct }: { label: string; value: string | number; pct: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-[10px] font-black tracking-tight text-slate-500 uppercase">
        <span>{label}</span>
        <span className={pct >= 70 ? 'text-emerald-600' : 'text-slate-400'}>{value}</span>
      </div>
      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-700 ${pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-400' : 'bg-rose-400'}`} 
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export interface AnalysisResultsPanelProps {
  contentScore?: ContentScoreResult | null;
  analysisResults?: HighlightData | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serpTerms?: Record<string, any>[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  referenceData?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  blueprint?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  genMetrics?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  refM?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  refSeo?: Record<string, any>;
  refText?: string;
  keywordBank?: KeywordBank | null;
  competitorTitles?: string[];
  analysisText: string;
  analysisHtml?: string;
  pastedText?: string;
  setPastedText?: (text: string | ((prev: string) => string)) => void;
  onInsertTerm: (term: string) => void;
  onHighlightWeakCopy: (phrase: string) => void;
  onApplyWeakCopyFix: (id: string | number, phrase: string, improvement: string) => void;
  onRunAnalysis?: () => void;
  isAnalysing?: boolean;
  dismissingSet: Set<number>;
  className?: string;
  children?: ReactNode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sections?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  intentClassification?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  intentAlignment?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serpEntities?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serpTopTermsForIntent?: any;
  serpMedianWordCount?: number;
  serpMedianTitleLength?: number;
  serpMedianH2Count?: number;
  targetKeyword?: string;
  selectedArticleId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  savedArticles?: any[];
  serpAnalysis?: SerpAnalysisResult | null;
  onRepairDimension?: (dimension: string, findings: string[]) => Promise<void> | void;
  isRepairing?: boolean;
  repairStatus?: string;
  repairedState?: {
    dimension: string;
    previousScore?: number;
    afterScore?: number;
    summary?: string;
    canUndo?: boolean;
  } | null;
  onUndoRepair?: () => void;
}

export function AnalysisResultsPanel({
  contentScore,
  analysisResults,
  serpTerms = [],
  referenceData,
  blueprint,
  genMetrics,
  refM,
  refSeo,
  refText,
  keywordBank,
  competitorTitles = [],
  analysisText,
  analysisHtml = '',
  pastedText = '',
  setPastedText,
  onInsertTerm,
  onHighlightWeakCopy,
  onApplyWeakCopyFix,
  onRunAnalysis,
  isAnalysing = false,
  dismissingSet,
  className = '',
  children,
  sections = [],
  intentClassification,
  intentAlignment,
  serpEntities,
  serpTopTermsForIntent,
  serpMedianWordCount,
  serpMedianTitleLength,
  serpMedianH2Count,
  targetKeyword,
  selectedArticleId,
  savedArticles,
  serpAnalysis,
  onRepairDimension,
  isRepairing = false,
  repairStatus = '',
  repairedState,
  onUndoRepair,
}: AnalysisResultsPanelProps) {
  const [coverageViewMode, setCoverageViewMode] = useState<'document' | 'section'>('document');
  const [keywordSearch, setKeywordSearch] = useState('');
  const [showSerpDebug, setShowSerpDebug] = useState(false);
  const [selectedDimension, setSelectedDimension] = useState<string>('Readability');

  const validationReport = useMemo(() => {
    if (!analysisText || analysisText.trim().length === 0) return null;
    return validateArticleQuality(
      analysisText,
      targetKeyword ? [targetKeyword] : [],
      serpEntities?.map((e: any) => typeof e === 'string' ? e : e.name) || []
    );
  }, [analysisText, targetKeyword, serpEntities]);

  const dimensionFindings = useMemo(() => {
    const findings: string[] = [];
    if (!validationReport) return findings;

    if (selectedDimension.toLowerCase() === 'readability') {
      const m = validationReport.metrics;
      if (m.fleschReadingEase < 60) {
        findings.push(`Flesch Reading Ease is ${Math.round(m.fleschReadingEase)} (Target: 60+ for clear readability)`);
      }
      if (m.passiveVoicePercent > 20) {
        findings.push(`Passive voice density is ${Math.round(m.passiveVoicePercent)}% (Target: < 20%)`);
      }
      if (m.averageSentenceLength > 24) {
        findings.push(`Average sentence length is ${m.averageSentenceLength.toFixed(1)} words (Target: 14-18 words)`);
      }
      if (m.averageParagraphLength > 90) {
        findings.push(`Average paragraph length is ${m.averageParagraphLength.toFixed(1)} words (Target: 40-70 words)`);
      }
      validationReport.errors
        .filter(e => e.toLowerCase().includes('paragraph') || e.toLowerCase().includes('sentence') || e.toLowerCase().includes('flesch') || e.toLowerCase().includes('passive'))
        .slice(0, 2)
        .forEach(e => findings.push(e));

      if (findings.length === 0 && (contentScore?.breakdown?.R ?? 100) < 75) {
        findings.push('Sentence rhythm and paragraph variation can be optimized for higher scannability.');
      }
    } else if (selectedDimension.toLowerCase() === 'semantic') {
      if ((contentScore?.breakdown?.S ?? 100) < 75) {
        findings.push('Key semantic keywords are underrepresented in body and subheadings.');
      }
    } else if (selectedDimension.toLowerCase() === 'entity') {
      if ((contentScore?.breakdown?.E ?? 100) < 75) {
        findings.push('Core entities and domain terms are underrepresented compared to top SERP results.');
      }
    } else if (selectedDimension.toLowerCase() === 'structure') {
      if ((contentScore?.breakdown?.O ?? 100) < 75) {
        findings.push('Subheading structure or paragraph distribution needs alignment with search benchmarks.');
      }
    } else if (selectedDimension.toLowerCase() === 'gap') {
      if ((contentScore?.breakdown?.G ?? 100) < 75) {
        findings.push('Missing suggested competitor topics and content gap coverage.');
      }
    } else if (selectedDimension.toLowerCase() === 'intent') {
      if ((contentScore?.breakdown?.I ?? 100) < 75) {
        findings.push('Search intent alignment and vocabulary frequency differ from top competitor benchmarks.');
      }
    }
    return findings;
  }, [validationReport, selectedDimension, contentScore]);

  const effectiveRefText = refText || referenceData?.rawText || referenceData?.plainText || '';

  const derivedSerpTerms = useMemo(() => {
    const termMap = new Map<string, any>();

    // 1. Source: AI-detected keywords from content analysis (NLP Categories)
    if (analysisResults?.nlpCategories) {
      const { must_have = [], supplementary = [], contextual = [] } = analysisResults.nlpCategories;
      must_have.forEach((t: string) => termMap.set(t.toLowerCase(), { term: t, category: 'basic', recommendedMin: 1, recommendedMax: 3 }));
      supplementary.forEach((t: string) => termMap.set(t.toLowerCase(), { term: t, category: 'supplementary', recommendedMin: 1, recommendedMax: 2 }));
      contextual.forEach((t: string) => termMap.set(t.toLowerCase(), { term: t, category: 'contextual', recommendedMin: 1, recommendedMax: 1 }));
    }

    // 2. Source: High-fidelity SERP terms from Step 2 (if available)
    if (serpTerms && serpTerms.length > 0) {
      serpTerms.forEach(t => {
        const key = t.term.toLowerCase();
        if (termMap.has(key)) {
          termMap.set(key, { ...termMap.get(key), ...t });
        } else {
          termMap.set(key, t);
        }
      });
    }

    // 3. Fallback: Reference keywords from standalone analysis
    if (analysisResults?.referenceKeywords) {
      analysisResults.referenceKeywords.forEach((t: string) => {
        if (!termMap.has(t.toLowerCase())) {
          termMap.set(t.toLowerCase(), { term: t, category: 'basic', recommendedMin: 1, recommendedMax: 2 });
        }
      });
    }

    // 5. Source: LSI Keywords from the specific reference article (Scraped baseline)
    if (referenceData?.lsiKeywords) {
      referenceData.lsiKeywords.forEach((t: any) => {
        const termStr = typeof t === 'string' ? t : t.term;
        const key = termStr.toLowerCase();
        if (!termMap.has(key)) {
          termMap.set(key, { term: termStr, category: 'basic', recommendedMin: 1, recommendedMax: 2 });
        }
      });
    }

    const raw = Array.from(termMap.values());
    
    return raw.map(t => {
      const current = countOccurrences(analysisText, t.term);
      const refCount = effectiveRefText ? countOccurrences(effectiveRefText, t.term) : 0;
      return { ...t, currentCount: current, refCount };
    });
  }, [serpTerms, analysisResults, analysisText, effectiveRefText, keywordBank]);

  const filteredSerpTerms = useMemo(() => {
    if (!keywordSearch) return derivedSerpTerms;
    return derivedSerpTerms.filter(t => t.term.toLowerCase().includes(keywordSearch.toLowerCase()));
  }, [derivedSerpTerms, keywordSearch]);

  const hasSerpData = useMemo(() => {
    return derivedSerpTerms.length > 0 || !!(analysisResults?.nlpCategories);
  }, [derivedSerpTerms, analysisResults]);

  const derivedGenMetrics = useMemo(() => {
    if (genMetrics) return genMetrics;
    if (contentScore) {
      return {
        wordCount: contentScore.stats.wordCount,
        headingCount: contentScore.stats.h2Count + contentScore.stats.h3Count,
        paragraphCount: Math.ceil(contentScore.stats.wordCount / 60),
        readingTime: Math.ceil(contentScore.stats.wordCount / 200)
      };
    }
    return null;
  }, [genMetrics, contentScore]);

  const derivedRefM = useMemo(() => {
    if (refM) return refM;
    if (referenceData?.advancedMetrics) return referenceData.advancedMetrics;
    return null;
  }, [refM, referenceData]);

  const derivedRefSeo = useMemo(() => {
    if (refSeo) return refSeo;
    if (referenceData?.seo) return referenceData.seo;
    return null;
  }, [refSeo, referenceData]);

  const normalizedIntent = useMemo(() => {
    if (intentClassification && typeof intentClassification === 'object') return intentClassification;
    if (analysisResults?.intent) {
      return {
        intent: analysisResults.intent,
        reasoning: 'Detected from content analysis.',
        contentFormat: 'Article'
      };
    }
    return null;
  }, [intentClassification, analysisResults]);

  const missingKeywords = useMemo(() => {
    return derivedSerpTerms.filter(t => t.currentCount === 0);
  }, [derivedSerpTerms]);

  const entitiesList = useMemo(() => {
    const list = serpEntities || serpAnalysis?.entities || [];
    if (!list || list.length === 0) return [];
    return list.map((e: any) => {
      const name = (e.entityName || e.name || '').trim();
      const coverage = e.competitorCoverage ?? 0;
      const importance = e.importanceScore ?? Math.round(coverage * 100);
      const isCovered = name ? analysisText.toLowerCase().includes(name.toLowerCase()) : false;
      
      let priority: 'High' | 'Medium' | 'Low' = 'Low';
      if (importance >= 60) priority = 'High';
      else if (importance >= 40) priority = 'Medium';
      
      return {
        ...e,
        name,
        entityName: name,
        importance,
        isCovered,
        priority
      };
    });
  }, [serpEntities, serpAnalysis, analysisText]);

  const highPriorityEntities = useMemo(() => {
    return entitiesList.filter(e => e.priority === 'High');
  }, [entitiesList]);

  const mediumPriorityEntities = useMemo(() => {
    return entitiesList.filter(e => e.priority === 'Medium');
  }, [entitiesList]);

  const coveredEntities = useMemo(() => {
    return entitiesList.filter(e => e.isCovered);
  }, [entitiesList]);

  const missingEntities = useMemo(() => {
    const list = entitiesList.filter(e => !e.isCovered);
    return [...list].sort((a, b) => b.importance - a.importance);
  }, [entitiesList]);

  const genH2s = useMemo(() => {
    if (!analysisHtml) return [];
    const h2Regex = /<h2[^>]*>(.*?)<\/h2>/gi;
    const h2s: string[] = [];
    let match;
    while ((match = h2Regex.exec(analysisHtml)) !== null) {
      h2s.push(match[1].replace(/<[^>]+>/g, ''));
    }
    return h2s;
  }, [analysisHtml]);

  const genH3s = useMemo(() => {
    if (!analysisHtml) return [];
    const h3Regex = /<h3[^>]*>(.*?)<\/h3>/gi;
    const h3s: string[] = [];
    let match;
    while ((match = h3Regex.exec(analysisHtml)) !== null) {
      h3s.push(match[1].replace(/<[^>]+>/g, ''));
    }
    return h3s;
  }, [analysisHtml]);

  const topicClusterCoverage = useMemo(() => {
    const clusters = serpAnalysis?.topicClusters || [];
    if (!clusters || clusters.length === 0) return [];
    
    const outlineHeadings = (blueprint?.section_outlines || []).map((sec: any) => sec.heading.toLowerCase());
    const draftH2s = genH2s.map(h => h.toLowerCase());
    const draftH3s = genH3s.map(h => h.toLowerCase());
    const allHeadings = [...outlineHeadings, ...draftH2s, ...draftH3s];
    const draftClean = analysisText.toLowerCase();
    
    return clusters.map((cluster: any) => {
      const name = cluster.clusterName;
      const kws = cluster.keywords || [];
      
      const inOutline = allHeadings.some(h => 
        h.includes(name.toLowerCase()) || 
        kws.some((kw: string) => h.includes(kw.toLowerCase()))
      ) || (blueprint?.section_outlines || []).some((sec: any) => 
        (sec.core_concept || '').toLowerCase().includes(name.toLowerCase()) ||
        kws.some((kw: string) => (sec.core_concept || '').toLowerCase().includes(kw.toLowerCase()))
      );

      const inContent = draftClean.includes(name.toLowerCase()) ||
                        kws.some((kw: string) => draftClean.includes(kw.toLowerCase()));

      return {
        clusterName: name,
        keywords: kws,
        inOutline,
        inContent
      };
    });
  }, [serpAnalysis, blueprint, genH2s, genH3s, analysisText]);

  const genLinks = useMemo(() => {
    if (!analysisHtml) return [];
    const linkRegex = /<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi;
    const links: string[] = [];
    let match;
    while ((match = linkRegex.exec(analysisHtml)) !== null) {
      const url = match[1];
      const text = match[2].replace(/<[^>]+>/g, '');
      links.push(`[${text}](${url})`);
    }
    return links;
  }, [analysisHtml]);

  return (
    <div className={`flex flex-col h-full bg-card border border-border/50 shadow-xl shadow-black/5 overflow-hidden ${className}`}>
      {children}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {!analysisResults ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[400px] px-6 text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-violet-50 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-violet-400" />
            </div>
            <div>
              <p className="font-bold text-slate-700 text-sm">No QA Analysis Yet</p>
              <p className="text-xs text-slate-400 mt-1 max-w-[220px] leading-relaxed">
                Click <strong>Re-Analyse</strong> to run the full quality check on your article.
              </p>
            </div>
            <Button 
              onClick={onRunAnalysis} 
              disabled={isAnalysing}
              className="mt-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold"
            >
              {isAnalysing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Re-Analyse Content
            </Button>
          </div>
        ) : (
          <div className="flex flex-col h-full overflow-hidden bg-white">
            {/* Header Metric Summary */}
            {contentScore && (
              <div className="px-5 py-5 border-b border-slate-100 bg-white grid grid-cols-[100px_1fr] gap-5 items-center shrink-0">
                <ScoreGauge score={contentScore.totalScore} />
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <MetricBar label="TITLE" value={`${(contentScore.titleScore * 10).toFixed(2)}%`} pct={contentScore.titleScore * 10} />
                  <MetricBar label="HEADINGS" value={`${(contentScore.headingsScore * 4).toFixed(2)}%`} pct={contentScore.headingsScore * 4} />
                  <MetricBar label="TERMS" value={`${(contentScore.termsScore * 2.2).toFixed(2)}%`} pct={contentScore.termsScore * 2.2} />
                  <MetricBar 
                    label="WORDS" 
                    value={`${contentScore.stats.wordCount} ${derivedRefM?.wordCount ? `vs ${derivedRefM.wordCount}` : ''}`} 
                    pct={derivedRefM?.wordCount ? (contentScore.stats.wordCount / derivedRefM.wordCount) * 100 : Math.min(100, (contentScore.stats.wordCount / 2000) * 100)} 
                  />
                </div>
              </div>
            )}

            <Tabs defaultValue="serp" className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="w-full justify-start rounded-none border-b border-slate-200 bg-transparent h-auto flex-nowrap overflow-x-auto no-scrollbar px-3 py-0 sticky top-0 z-10 flex gap-4 shrink-0">
                <TabsTrigger
                  value="serp"
                  className="shrink-0 data-[state=active]:text-blue-600 data-[state=active]:border-blue-600 border-b-2 border-transparent rounded-none h-11 text-[11px] font-bold px-1 py-3 transition-all flex items-center gap-1.5 bg-transparent data-[state=active]:bg-transparent shadow-none"
                >
                  <Quote className="w-3.5 h-3.5" /> Terms
                </TabsTrigger>
                <TabsTrigger
                  value="comparison"
                  className="shrink-0 data-[state=active]:text-blue-600 data-[state=active]:border-blue-600 border-b-2 border-transparent rounded-none h-11 text-[11px] font-bold px-1 py-3 transition-all flex items-center gap-1.5 bg-transparent data-[state=active]:bg-transparent shadow-none"
                >
                  <Lightbulb className="w-3.5 h-3.5" /> Outline
                </TabsTrigger>
                <TabsTrigger
                  value="structure"
                  className="shrink-0 data-[state=active]:text-blue-600 data-[state=active]:border-blue-600 border-b-2 border-transparent rounded-none h-11 text-[11px] font-bold px-1 py-3 transition-all flex items-center gap-1.5 bg-transparent data-[state=active]:bg-transparent shadow-none"
                >
                  <Scale className="w-3.5 h-3.5" /> Structure
                </TabsTrigger>
                <TabsTrigger
                  value="entities"
                  className="shrink-0 data-[state=active]:text-blue-600 data-[state=active]:border-blue-600 border-b-2 border-transparent rounded-none h-11 text-[11px] font-bold px-1 py-3 transition-all flex items-center gap-1.5 bg-transparent data-[state=active]:bg-transparent shadow-none"
                >
                  <Tag className="w-3.5 h-3.5" /> Entities
                </TabsTrigger>
                <TabsTrigger
                  value="weak-copy"
                  className="shrink-0 data-[state=active]:text-blue-600 data-[state=active]:border-blue-600 border-b-2 border-transparent rounded-none h-11 text-[11px] font-bold px-1 py-3 transition-all flex items-center gap-1.5 bg-transparent data-[state=active]:bg-transparent shadow-none"
                >
                  <PenTool className="w-3.5 h-3.5" /> AI-Writing
                </TabsTrigger>
                <TabsTrigger
                  value="positives"
                  className="shrink-0 data-[state=active]:text-blue-600 data-[state=active]:border-blue-600 border-b-2 border-transparent rounded-none h-11 text-[11px] font-bold px-1 py-3 transition-all flex items-center gap-1.5 bg-transparent data-[state=active]:bg-transparent shadow-none"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Positives
                </TabsTrigger>
                <TabsTrigger
                  value="diagnostics"
                  className="shrink-0 data-[state=active]:text-blue-600 data-[state=active]:border-blue-600 border-b-2 border-transparent rounded-none h-11 text-[11px] font-bold px-1 py-3 transition-all flex items-center gap-1.5 bg-transparent data-[state=active]:bg-transparent shadow-none"
                >
                  <Terminal className="w-3.5 h-3.5" /> Diagnostics
                </TabsTrigger>
                {normalizedIntent && (
                  <TabsTrigger
                    value="intent"
                    className="shrink-0 data-[state=active]:text-blue-600 data-[state=active]:border-blue-600 border-b-2 border-transparent rounded-none h-11 text-[11px] font-bold px-1 py-3 transition-all flex items-center gap-1.5 bg-transparent data-[state=active]:bg-transparent shadow-none"
                  >
                    <TargetIcon className="w-3.5 h-3.5" /> Intent
                  </TabsTrigger>
                )}
                <TabsTrigger
                  value="strategy"
                  className="shrink-0 data-[state=active]:text-blue-600 data-[state=active]:border-blue-600 border-b-2 border-transparent rounded-none h-11 text-[11px] font-bold px-1 py-3 transition-all flex items-center gap-1.5 bg-transparent data-[state=active]:bg-transparent shadow-none"
                >
                  <BrainCircuit className="w-3.5 h-3.5" /> Strategy
                </TabsTrigger>
                {(referenceData?.contentGapReport || (serpAnalysis?.topicClusters && serpAnalysis.topicClusters.length > 0)) && (
                  <TabsTrigger
                    value="content-gap"
                    className="shrink-0 data-[state=active]:text-blue-600 data-[state=active]:border-blue-600 border-b-2 border-transparent rounded-none h-11 text-[11px] font-bold px-1 py-3 transition-all flex items-center gap-1.5 bg-transparent data-[state=active]:bg-transparent shadow-none"
                  >
                    <AlertCircle className="w-3.5 h-3.5" /> Content Gap
                  </TabsTrigger>
                )}
              </TabsList>

              <div className="flex-1 overflow-y-auto no-scrollbar p-4">
                <TabsContent value="serp" className="m-0 space-y-6">
                  {contentScore && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Content Quality Score</div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">Detailed Metrics</span>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: 'S', name: 'Semantic', val: contentScore.breakdown?.S || 0, color: 'border-indigo-100 bg-indigo-50/40 text-indigo-700', tooltip: 'Semantic Coverage: Measures how well the article covers must-have and supplementary keywords (15% weight).' },
                          { label: 'E', name: 'Entity', val: contentScore.breakdown?.E || 0, color: 'border-emerald-100 bg-emerald-50/40 text-emerald-700', tooltip: 'Entity Coverage: Checks if key expected entities (brand, tool, product, concept, organization) are present (25% weight).' },
                          { label: 'I', name: 'Intent', val: contentScore.breakdown?.I || 0, color: 'border-amber-100 bg-amber-50/40 text-amber-700', tooltip: 'Intent Similarity: Compares top-30 most frequent words to target competitor intent layout (25% weight).' },
                          { label: 'O', name: 'Structure', val: contentScore.breakdown?.O || 0, color: 'border-blue-100 bg-blue-50/40 text-blue-700', tooltip: 'On-page Structure: Evaluates headings, title length, and word count structure alignment (10% weight).' },
                          { label: 'G', name: 'Gap', val: contentScore.breakdown?.G || 0, color: 'border-rose-100 bg-rose-50/40 text-rose-700', tooltip: 'Content Gap: Measures how well the article covers missing topics and suggested sections (15% weight).' },
                          { label: 'R', name: 'Readability', val: contentScore.breakdown?.R || 0, color: 'border-purple-100 bg-purple-50/40 text-purple-700', tooltip: 'Readability & Naturalness: Checks lexical diversity and healthy paragraph word counts (10% weight).' },
                        ].map((m, idx) => {
                          const isSelected = selectedDimension.toLowerCase() === m.name.toLowerCase();
                          return (
                            <button 
                              key={idx} 
                              type="button"
                              onClick={() => setSelectedDimension(m.name)}
                              className={`group relative flex flex-col items-center justify-between p-2 rounded-xl border text-center transition-all duration-200 hover:shadow-md hover:scale-[1.02] cursor-pointer ${m.color} ${isSelected ? 'ring-2 ring-indigo-500 shadow-sm border-indigo-400 font-bold' : ''}`}
                            >
                              <span className="text-[10px] font-black tracking-wider opacity-60 mb-0.5">{m.name}</span>
                              <div className="text-base font-extrabold tracking-tight mb-1">{Math.round(m.val)}</div>
                              <div className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                              
                              {/* Hover Tooltip */}
                              <span
                                  role="tooltip"
                                  className="
                                    pointer-events-none absolute z-50 top-full left-1/2 -translate-x-1/2 mt-2
                                    w-48 px-2.5 py-2 rounded-xl bg-slate-900 text-white text-[10px] leading-snug shadow-xl text-center font-normal
                                    opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100
                                    transition-all duration-200 origin-top
                                  "
                                >
                                  {m.tooltip}
                                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-slate-900" />
                                </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Targeted Repair Card for Selected Dimension */}
                      {(() => {
                        const dimKeyMap: Record<string, 'S' | 'E' | 'I' | 'O' | 'G' | 'R'> = {
                          semantic: 'S',
                          entity: 'E',
                          intent: 'I',
                          structure: 'O',
                          gap: 'G',
                          readability: 'R'
                        };
                        const dimKey = dimKeyMap[selectedDimension.toLowerCase()] || 'R';
                        const selectedDimScore = contentScore.breakdown?.[dimKey] ?? 0;
                        const isRepairedCurrentDim = repairedState?.dimension?.toLowerCase() === selectedDimension.toLowerCase();

                        return (
                          <div className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/70 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-slate-800">{selectedDimension} Optimization</span>
                                <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700">
                                  {Math.round(selectedDimScore)}/100
                                </span>
                              </div>
                              {isRepairedCurrentDim && onUndoRepair && repairedState?.canUndo && !isRepairing && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={onUndoRepair}
                                  className="h-6 px-2 text-[10px] text-slate-600 hover:text-slate-900 font-semibold underline"
                                >
                                  Undo Repair
                                </Button>
                              )}
                            </div>

                            {/* Loading State */}
                            {isRepairing && (
                              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-medium animate-pulse">
                                <Loader2 className="w-4 h-4 animate-spin shrink-0 text-indigo-600" />
                                <span>{repairStatus || `Repairing ${selectedDimension}... Splitting long sentences & simplifying structure`}</span>
                              </div>
                            )}

                            {/* Repaired Success Banner */}
                            {!isRepairing && isRepairedCurrentDim && (
                              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs space-y-1">
                                <div className="font-bold flex items-center gap-1.5">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  <span>
                                    {selectedDimension} improved: {repairedState.previousScore ?? 0} → {repairedState.afterScore ?? selectedDimScore}
                                    {repairedState.afterScore && repairedState.previousScore !== undefined && repairedState.afterScore > repairedState.previousScore && (
                                      <span className="text-emerald-700 font-extrabold"> (+{repairedState.afterScore - repairedState.previousScore} pts)</span>
                                    )}
                                  </span>
                                </div>
                                {repairedState.summary && (
                                  <div className="text-[11px] text-emerald-700 leading-snug">{repairedState.summary}</div>
                                )}
                              </div>
                            )}

                            {/* Concrete Findings ("Why?") */}
                            {!isRepairing && dimensionFindings.length > 0 && (
                              <div className="space-y-1">
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Diagnosis ("Why?")</span>
                                <ul className="space-y-1">
                                  {dimensionFindings.map((finding, fIdx) => (
                                    <li key={fIdx} className="text-[11px] text-slate-600 flex items-start gap-1.5 leading-snug">
                                      <span className="mt-1.5 w-1 h-1 rounded-full bg-amber-400 shrink-0" />
                                      <span>{finding}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Action Button */}
                            {!isRepairing && onRepairDimension && (
                              <div>
                                {selectedDimScore >= 75 && dimensionFindings.length === 0 ? (
                                  <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium bg-emerald-50/70 p-2 rounded-lg border border-emerald-100">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                    <span>{selectedDimension} is optimal. No targeted repair needed.</span>
                                  </div>
                                ) : (
                                  <Button
                                    size="sm"
                                    onClick={() => onRepairDimension(selectedDimension, dimensionFindings)}
                                    className="w-full h-8 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm flex items-center justify-center gap-1.5 transition-all"
                                  >
                                    <Sparkles className="w-3.5 h-3.5" />
                                    Improve {selectedDimension}
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      {contentScore.penalties > 0 && (
                        <div className="p-3 rounded-xl bg-rose-50 border border-rose-100">
                          <div className="flex items-center gap-2 mb-2 text-rose-700 font-bold text-[10px] uppercase tracking-wider">
                            <AlertCircle className="w-3.5 h-3.5" /> SEO Penalties
                          </div>
                          <ul className="space-y-1">
                            {contentScore.penaltyReasons.map((r, i) => (
                              <li key={i} className="text-[11px] text-rose-600 flex items-start gap-2 leading-tight">
                                <span className="mt-1.5 w-1 h-1 rounded-full bg-rose-300 shrink-0" />{r}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Target Keywords</div>
                    <div className="relative">
                      <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input 
                        placeholder="Search keywords..." 
                        value={keywordSearch}
                        onChange={(e) => setKeywordSearch(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs font-medium placeholder:text-slate-400 focus:outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100 transition-all shadow-sm" 
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {filteredSerpTerms.map((t, i) => {
                        const recMin = t.recommendedMin || 1;
                        const recMax = t.recommendedMax;
                        
                        const isGreen = t.currentCount >= recMin && (!recMax || t.currentCount <= recMax);
                        const isYellow = t.currentCount > 0 && t.currentCount < recMin;
                        const isRed = t.currentCount === 0 || (recMax && t.currentCount > recMax);

                        let colorClass = 'bg-[#f8f9fa] text-[#5f6368] hover:bg-[#f1f3f4] border border-[#dadce0]/60';
                        if (isGreen) {
                          colorClass = 'bg-[#e6f4ea] text-[#137333] hover:bg-[#d2ebd9] border border-[#ceead6]/60';
                        } else if (isYellow) {
                          colorClass = 'bg-[#fef7e0] text-[#b06000] hover:bg-[#fdeebb] border border-[#feebc8]/60';
                        } else if (isRed) {
                          colorClass = 'bg-[#fce8e6] text-[#c5221f] hover:bg-[#fad2cf] border border-[#fad2cf]/60';
                        }

                        return (
                          <button
                            key={i}
                            onClick={() => onInsertTerm(t.term)}
                            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] shadow-sm ${colorClass}`}
                          >
                            <span>{t.term}</span>
                            <span className="bg-white/95 px-1.5 py-0.5 rounded text-[10px] font-black text-slate-600/90 border border-slate-200/50 shadow-sm tabular-nums">
                              {t.currentCount} / {recMin}-{recMax || (recMin + 2)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="weak-copy" className="m-0 space-y-4">
                  <div className="pb-2 border-b">
                    <h3 className="font-bold text-slate-800 flex items-center text-lg">
                      Weak Copy Issues
                      <span className="bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-xs font-black ml-3">
                        {analysisResults?.weakCopyItems?.length ?? 0}
                      </span>
                    </h3>
                  </div>
                  {!analysisResults?.weakCopyItems?.length ? (
                    <div className="text-center py-10 text-slate-400">No issues identified.</div>
                  ) : (
                    <div className="grid gap-3">
                      {analysisResults.weakCopyItems.map((item, i) => (
                        <WeakCopyCard
                          key={i}
                          phrase={item.phrase}
                          improvement={item.improvement}
                          onHighlight={() => onHighlightWeakCopy(item.phrase)}
                          onApplyFix={() => onApplyWeakCopyFix(i, item.phrase, item.improvement)}
                          isDismissed={dismissingSet.has(i)}
                        />
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="positives" className="m-0 space-y-4">
                  <div className="pb-2 border-b">
                    <h3 className="font-bold text-slate-800">Content Strengths</h3>
                  </div>
                  {!analysisResults?.positives?.length ? (
                    <div className="text-center py-10 text-slate-400">No major strengths found.</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {analysisResults.positives.map((p, i) => (
                        <div key={i} className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-[11px] font-bold flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {p}
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="comparison" className="m-0">
                  {derivedGenMetrics ? (
                    <CompareTabContent
                      genMetrics={derivedGenMetrics}
                      refM={derivedRefM}
                      refSeo={derivedRefSeo}
                      blueprint={blueprint}
                      referenceData={referenceData}
                      refH2s={derivedRefSeo?.headerHierarchy?.filter((h: any) => h.tag === 'h2').map((h: any) => h.text) || []}
                      refH3s={derivedRefSeo?.headerHierarchy?.filter((h: any) => h.tag === 'h3').map((h: any) => h.text) || []}
                      refIntLinks={derivedRefSeo?.internalLinks || []}
                      refExtLinks={derivedRefSeo?.externalLinks || []}
                      genH2s={genH2s}
                      genH3s={genH3s}
                      genLinks={genLinks}
                      detailOptions={[
                        { value: 'h2', label: 'H2 Headings' },
                        { value: 'h3', label: 'H3 Headings' },
                        { value: 'internal', label: 'Internal Links' },
                        { value: 'external', label: 'External Links' }
                      ]}
                    />
                  ) : (
                    <div className="text-center py-10 text-slate-400">Run analysis to see comparison.</div>
                  )}
                </TabsContent>

                {normalizedIntent && (
                  <TabsContent value="intent" className="m-0 space-y-4">
                    <div className="pb-2 border-b">
                      <h3 className="font-bold text-slate-800">Intent & Alignment</h3>
                    </div>
                    <div className="p-4 rounded-xl border border-violet-100 bg-violet-50/30">
                      <div className="flex items-center gap-2 mb-3">
                        <BrainCircuit className="w-4 h-4 text-violet-600" />
                        <span className="text-sm font-bold text-violet-800">Search Intent Requirements</span>
                      </div>
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          <span className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-violet-100 text-violet-700">{normalizedIntent.intent}</span>
                          <span className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-slate-100 text-slate-700">{normalizedIntent.contentFormat}</span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">{normalizedIntent.reasoning}</p>
                      </div>
                    </div>

                    {intentAlignment && (
                      <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/30 space-y-4">
                        <div className="flex items-center gap-2">
                          <TargetIcon className="w-4 h-4 text-primary" />
                          <span className="text-sm font-bold text-primary">Content Alignment Score</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-black border-4 ${intentAlignment.verdict === 'excellent' ? 'border-emerald-400 text-emerald-600 bg-emerald-50' : 'border-amber-400 text-amber-600 bg-amber-50'}`}>
                            {intentAlignment.score}
                          </div>
                          <div className="text-xs text-slate-500 leading-tight">
                            <div className="font-bold text-slate-800 capitalize mb-1">{intentAlignment.verdict} Alignment</div>
                            Alignment with recommended format and topical depth.
                          </div>
                        </div>
                      </div>
                    )}
                  </TabsContent>
                )}

                 <TabsContent value="strategy" className="m-0 space-y-4">
                   <div className="pb-2 border-b">
                     <h3 className="font-bold text-slate-800">Section Strategy</h3>
                   </div>
                   <div className="space-y-4">
                     {sections.length === 0 ? (
                       <div className="text-center py-10 px-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                         <BrainCircuit className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                         <p className="text-sm font-semibold text-slate-500">No Section Strategy Available</p>
                         <p className="text-xs text-slate-400 mt-1">Regenerate content or re-run analysis to populate the AI strategy map.</p>
                       </div>
                     ) : (
                       sections.map((sec, idx) => (
                         <div key={idx} className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                           <div className="flex justify-between items-center text-[10px] font-black text-slate-400 uppercase">
                             <span>Section {idx + 1}</span>
                             <span className="bg-white px-2 py-0.5 rounded border">{sec.level}</span>
                           </div>
                           <div className="text-sm font-bold text-slate-800">{sec.heading}</div>
                           {sec.takeaway && (
                             <div className="text-xs text-slate-600 italic border-l-2 border-emerald-300 pl-3 py-1 bg-emerald-50/50">
                               &ldquo;{sec.takeaway}&rdquo;
                             </div>
                           )}
                         </div>
                       ))
                     )}
                   </div>
                 </TabsContent>

                <TabsContent value="structure" className="m-0 space-y-6">
                  <div className="pb-2 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                      <Scale className="w-4 h-4 text-indigo-500" />
                      Structure &amp; Layout Score Breakdown
                    </h3>
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 uppercase tracking-wider">
                      Score: {contentScore?.breakdown.O || 0}/100 (10% weight)
                    </span>
                  </div>

                  {contentScore?.structureDetails ? (
                    <div className="space-y-4">
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Your article's on-page structure score evaluates heading hierarchy, length alignment, and rich elements. Below are the individual sub-scores and their weighted contributions to the final Structure score:
                      </p>
                      <div className="space-y-4">
                        {[
                          { label: 'H1 Quality & Tag', val: contentScore.structureDetails.h1Quality, weight: '10%', desc: 'Validates H1 presence and checks if the length is optimized (close to competitor median title length).' },
                          { label: 'H2 Coverage & Count', val: contentScore.structureDetails.h2Coverage, weight: '10%', desc: 'Checks if the number of H2 headings matches the competitor median H2 count.' },
                          { label: 'H3 Coverage & Depth', val: contentScore.structureDetails.h3Coverage, weight: '10%', desc: 'Checks if H3 sub-headings are used to structure deep sections.' },
                          { label: 'FAQ Section Presence', val: contentScore.structureDetails.faqCoverage, weight: '10%', desc: 'Checks for a dedicated Frequently Asked Questions (FAQ) heading block.' },
                          { label: 'Table Presence & Formats', val: contentScore.structureDetails.tableCoverage, weight: '10%', desc: 'Checks for markdown-formatted data/comparison tables.' },
                          { label: 'Word Count Alignment', val: contentScore.structureDetails.wordCountAlignment, weight: '20%', desc: 'Evaluates how closely the draft word count matches the target competitor median.' },
                          { label: 'Heading Frequency Similarity', val: contentScore.structureDetails.headingFrequencyAlignment, weight: '15%', desc: 'Checks coverage of popular headings used by top competitor pages.' },
                          { label: 'Featured Snippet Coverage', val: contentScore.structureDetails.featuredSnippetCoverage, weight: '15%', desc: 'Checks if the target Featured Snippet question is addressed with the recommended formatting.' },
                        ].map((sub, idx) => (
                          <div key={idx} className="space-y-1.5 p-3 rounded-xl border border-slate-100 bg-slate-50/50">
                            <div className="flex justify-between font-bold text-slate-700 text-xs">
                              <span>{sub.label} <span className="text-[10px] text-indigo-500 font-semibold">(Weight: {sub.weight})</span></span>
                              <span className={sub.val >= 80 ? 'text-emerald-600 font-black' : sub.val >= 50 ? 'text-amber-600 font-black' : 'text-rose-500 font-black'}>
                                {sub.val} / 100
                              </span>
                            </div>
                            <p className="text-[10.5px] text-slate-500 leading-snug">{sub.desc}</p>
                            <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                              <div
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    sub.val >= 80 ? 'bg-emerald-500' : sub.val >= 50 ? 'bg-amber-400' : 'bg-rose-400'
                                  }`}
                                  style={{ width: `${sub.val}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">Structure data is not available. Try re-running the analysis.</p>
                  )}
                </TabsContent>

                <TabsContent value="entities" className="m-0 space-y-6">
                  <div className="pb-2 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                      <Tag className="w-4 h-4 text-indigo-500" />
                      Entity Coverage Analysis
                    </h3>
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 uppercase tracking-wider">
                      Score: {contentScore?.breakdown.E || 0}/100 (25% weight)
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 leading-relaxed">
                    Entity coverage checks if key expected entities (brands, tools, products, concepts, organizations) are present in the text.
                    <strong> Weighted Contribution: </strong> Entity coverage contributes <strong>25%</strong> directly to your overall score, and if your coverage is &ge;50%, it boosts your Semantic score by up to <strong>15%</strong>.
                  </p>

                  {contentScore?.stats && contentScore.stats.totalEntities !== undefined && (
                    <div className="grid grid-cols-4 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100 text-center text-xs font-semibold">
                      <div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase">Total Target</div>
                        <div className="text-slate-800 font-extrabold mt-0.5">{contentScore.stats.totalEntities}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase">Covered</div>
                        <div className="text-emerald-600 font-extrabold mt-0.5">{contentScore.stats.coveredEntities}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase">Missing</div>
                        <div className="text-rose-600 font-extrabold mt-0.5">{contentScore.stats.missingEntitiesCount}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase">Weight</div>
                        <div className="text-indigo-600 font-extrabold mt-0.5 truncate" title={contentScore.stats.entityScoreContribution}>
                          {contentScore.stats.entityScoreContribution}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Entities Breakdown Lists */}
                  <div className="space-y-4">
                    {/* High-Priority Entities */}
                    <div className="space-y-2">
                      <div className="text-[10.5px] font-black text-slate-400 uppercase tracking-wider">
                        High-Priority Entities ({highPriorityEntities.length})
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {highPriorityEntities.map((e, idx) => (
                          <span
                            key={idx}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                              e.isCovered
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                : 'bg-rose-50 text-rose-700 border-rose-100'
                            }`}
                          >
                            {e.name}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Medium-Priority Entities */}
                    <div className="space-y-2">
                      <div className="text-[10.5px] font-black text-slate-400 uppercase tracking-wider">
                        Medium-Priority Entities ({mediumPriorityEntities.length})
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {mediumPriorityEntities.map((e, idx) => (
                          <span
                            key={idx}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                              e.isCovered
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                : 'bg-rose-50 text-rose-700 border-rose-100'
                            }`}
                          >
                            {e.name}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Covered Entities */}
                    <div className="space-y-2 border-t pt-3">
                      <div className="text-[10.5px] font-black text-slate-400 uppercase tracking-wider">
                        Covered Entities ({coveredEntities.length})
                      </div>
                      {coveredEntities.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {coveredEntities.map((e, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-1 rounded bg-slate-100 text-slate-700 text-xs border border-slate-200/50"
                            >
                              {e.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic">No entities are currently covered in your draft.</p>
                      )}
                    </div>

                    {/* Missing Entities */}
                    <div className="space-y-2 border-t pt-3">
                      <div className="text-[10.5px] font-black text-slate-400 uppercase tracking-wider">
                        Missing Entities ({missingEntities.length})
                      </div>
                      {missingEntities.length > 0 ? (
                        <div className="grid gap-2">
                          {missingEntities.map((e: any, i: number) => {
                            let badgeColor = 'bg-slate-100 text-slate-700 border-slate-200';
                            if (e.priority === 'High') {
                              badgeColor = 'bg-rose-100 text-rose-700 border-rose-200';
                            } else if (e.priority === 'Medium') {
                              badgeColor = 'bg-amber-100 text-amber-700 border-amber-200';
                            }

                            return (
                              <div key={i} className="p-3 rounded-xl border border-rose-100 bg-rose-50/20 text-xs space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-slate-800">{e.name}</span>
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-[9.5px] font-black px-1.5 py-0.5 rounded border uppercase tracking-wider ${badgeColor}`}>
                                      {e.priority} Importance ({e.importance}/100)
                                    </span>
                                    <span className="text-[9.5px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 uppercase tracking-wider">
                                      {e.entityType || 'Entity'}
                                    </span>
                                  </div>
                                </div>
                                {e.missingContext && (
                                  <p className="text-[10.5px] text-slate-500 italic leading-snug">
                                    Context: {e.missingContext}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic">All expected entities have been successfully covered!</p>
                      )}
                    </div>
                  </div>
                </TabsContent>

                {(referenceData?.contentGapReport || (serpAnalysis?.topicClusters && serpAnalysis.topicClusters.length > 0)) && (
                  <TabsContent value="content-gap" className="m-0 space-y-5">
                    <div className="pb-2 border-b border-slate-100 flex items-center justify-between">
                      <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-indigo-500" />
                        Content Gap &amp; Topic Clusters
                      </h3>
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 uppercase tracking-wider">
                        Competitor Gaps
                      </span>
                    </div>

                    {/* Topic Clusters Coverage Diagnostics */}
                    {topicClusterCoverage.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Topic Cluster Coverage Diagnostics</h4>
                        <div className="space-y-2.5">
                          {topicClusterCoverage.map((tc, idx) => (
                            <div key={idx} className="p-3 rounded-xl border border-slate-200 bg-white/50 space-y-1.5 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-800 uppercase text-[10.5px]">{tc.clusterName}</span>
                                <div className="flex gap-1.5 flex-wrap justify-end">
                                  <span className="px-1.5 py-0.5 rounded text-[8.5px] font-black bg-emerald-100 text-emerald-700 border border-emerald-200">
                                    Detected in SERP: YES
                                  </span>
                                  <span className={`px-1.5 py-0.5 rounded text-[8.5px] font-black border ${
                                    tc.inOutline 
                                      ? 'bg-emerald-100 text-emerald-700 border-emerald-200' 
                                      : 'bg-rose-100 text-rose-700 border-rose-200'
                                  }`}>
                                    In Outline: {tc.inOutline ? 'YES' : 'NO'}
                                  </span>
                                  <span className={`px-1.5 py-0.5 rounded text-[8.5px] font-black border ${
                                    tc.inContent 
                                      ? 'bg-emerald-100 text-emerald-700 border-emerald-200' 
                                      : 'bg-rose-100 text-rose-700 border-rose-200'
                                  }`}>
                                    In Content: {tc.inContent ? 'YES' : 'NO'}
                                  </span>
                                </div>
                              </div>
                              <p className="text-[10px] text-slate-500 italic">
                                Keywords: {tc.keywords.join(', ')}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 1. Recommended New Sections */}
                    {referenceData?.contentGapReport?.recommendedNewSections && referenceData.contentGapReport.recommendedNewSections.length > 0 && (
                      <div className="space-y-3 border-t pt-3">
                        <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Recommended New Sections</h4>
                        <div className="space-y-3">
                          {referenceData.contentGapReport.recommendedNewSections.map((sec: any, idx: number) => (
                            <div key={idx} className="p-3.5 rounded-xl border border-indigo-100 bg-indigo-50/20 hover:bg-indigo-50/30 transition-all duration-200">
                              <div className="flex items-center justify-between gap-2 mb-1.5">
                                <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                                    {sec.level || 'H2'}
                                  </span>
                                  {sec.heading}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-600 leading-relaxed font-medium mb-2">
                                <strong className="text-slate-700">Rationale: </strong>{sec.reason}
                              </p>
                              {sec.suggestedOutline && (
                                <div className="p-2.5 rounded-lg bg-white/80 border border-slate-100 text-[10px] text-slate-500 font-mono leading-normal">
                                  {sec.suggestedOutline}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 2. Missing Topics */}
                    {referenceData?.contentGapReport?.missingTopics && referenceData.contentGapReport.missingTopics.length > 0 && (
                      <div className="space-y-2 border-t pt-3">
                        <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Topical Gaps (Keywords &amp; Concepts)</h4>
                        <div className="flex flex-wrap gap-1.5">
                          {referenceData.contentGapReport.missingTopics.map((topic: string, i: number) => {
                            const isPresent = analysisText.toLowerCase().includes(topic.toLowerCase());
                            return (
                              <span
                                key={i}
                                className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold border transition-all ${
                                  isPresent
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                    : 'bg-rose-50 text-rose-700 border-rose-100'
                                }`}
                              >
                                {topic}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 3. Unanswered Questions */}
                    {referenceData?.contentGapReport?.unansweredQuestions && referenceData.contentGapReport.unansweredQuestions.length > 0 && (
                      <div className="space-y-2.5 border-t pt-3">
                        <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-wider">User Questions to Answer</h4>
                        <div className="space-y-2">
                          {referenceData.contentGapReport.unansweredQuestions.map((q: string, i: number) => {
                            const qClean = q.replace(/[?]/g, '').toLowerCase().trim();
                            const isAnswered = analysisText.toLowerCase().includes(qClean);
                            return (
                              <div key={i} className="flex gap-2.5 items-start p-2.5 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                                <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-black ${
                                  isAnswered
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-rose-100 text-rose-700'
                                }`}>
                                  Q
                                </span>
                                <div className="space-y-0.5">
                                  <p className="text-[11px] font-semibold text-slate-700 leading-snug">{q}</p>
                                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                    {isAnswered ? 'Answered' : 'Missing'}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </TabsContent>
                )}

                <TabsContent value="diagnostics" className="m-0 space-y-6">
                  <div className="pb-2 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-indigo-500" />
                      Live SEO Diagnostics
                    </h3>
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 uppercase tracking-wider">
                      Live Stats & Gaps
                    </span>
                  </div>

                  {/* Live Stats */}
                  <div className="space-y-3">
                    <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Live Content Stats</h4>
                    <div className="grid grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Words</div>
                        <div className="text-sm font-extrabold text-slate-800 mt-0.5">
                          {contentScore?.stats.wordCount || 0}
                          {serpMedianWordCount ? <span className="text-[10px] text-slate-400 font-normal"> / {serpMedianWordCount}</span> : null}
                        </div>
                      </div>
                      <div className="border-x border-slate-200/60">
                        <div className="text-[10px] font-bold text-slate-400 uppercase">H2 Headings</div>
                        <div className="text-sm font-extrabold text-slate-800 mt-0.5">
                          {contentScore?.stats.h2Count || 0}
                          {serpMedianH2Count ? <span className="text-[10px] text-slate-400 font-normal"> / {serpMedianH2Count}</span> : null}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Diversity</div>
                        <div className="text-sm font-extrabold text-slate-800 mt-0.5">
                          {contentScore ? `${Math.round(contentScore.stats.uniqueRatio * 100)}%` : '0%'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Scraper Extraction Diagnostics & Audit Logs */}
                  {serpAnalysis?.extractionConfidenceMetrics && (
                    <div className="space-y-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <h4 className="text-[11.5px] font-black text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-indigo-500" /> Scraper Extraction Diagnostics
                      </h4>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
                        <div className="flex justify-between py-1 border-b border-slate-200/50">
                          <span className="text-slate-500 font-bold uppercase text-[9px]">Readability Success Rate:</span>
                          <span className="font-extrabold text-slate-800">{Math.round(serpAnalysis.extractionConfidenceMetrics.readabilitySuccessRate)}%</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-200/50">
                          <span className="text-slate-500 font-bold uppercase text-[9px]">Fallback Usage Rate:</span>
                          <span className="font-extrabold text-slate-800">{Math.round(serpAnalysis.extractionConfidenceMetrics.fallbackUsageRate)}%</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-200/50">
                          <span className="text-slate-500 font-bold uppercase text-[9px]">Rejected Pages Count:</span>
                          <span className="font-extrabold text-rose-600">{serpAnalysis.extractionConfidenceMetrics.rejectedCompetitorCount}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-200/50">
                          <span className="text-slate-500 font-bold uppercase text-[9px]">Avg Extracted Word Count:</span>
                          <span className="font-extrabold text-slate-800">{Math.round(serpAnalysis.extractionConfidenceMetrics.averageExtractedWordCount)} words</span>
                        </div>
                      </div>

                      <div className="pt-2.5 border-t border-slate-200/50 space-y-1">
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Quality Distribution</div>
                        <div className="flex justify-between text-[11px] font-semibold">
                          <span className="text-emerald-600">High: {serpAnalysis.extractionConfidenceMetrics.qualityDistribution.high}</span>
                          <span className="text-amber-600">Medium: {serpAnalysis.extractionConfidenceMetrics.qualityDistribution.medium}</span>
                          <span className="text-rose-500">Low: {serpAnalysis.extractionConfidenceMetrics.qualityDistribution.low}</span>
                        </div>
                      </div>

                      {/* Extraction Audit Logs Table */}
                      {serpAnalysis.extractionConfidenceMetrics.auditLogs && serpAnalysis.extractionConfidenceMetrics.auditLogs.length > 0 && (
                        <div className="pt-3 border-t border-slate-200/50 space-y-2">
                          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Extraction Audit Logs</div>
                          <div className="overflow-x-auto border border-slate-200/60 rounded-lg">
                            <table className="w-full text-[10.5px] text-left border-collapse bg-white">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-200/60 text-slate-500 font-bold">
                                  <th className="p-2">Domain & URL</th>
                                  <th className="p-2 text-center">Quality (Score)</th>
                                  <th className="p-2 text-center">Confidence</th>
                                  <th className="p-2 text-center">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {serpAnalysis.extractionConfidenceMetrics.auditLogs.map((log, idx) => (
                                  <tr key={idx} className="hover:bg-slate-50/50">
                                    <td className="p-2 max-w-[120px]">
                                      <div className="font-bold text-slate-700 truncate" title={log.domain}>{log.domain}</div>
                                      <div className="text-[9px] text-slate-400 truncate" title={log.url}>{log.url}</div>
                                    </td>
                                    <td className="p-2 text-center">
                                      {log.rejected ? (
                                        <span className="text-slate-400 font-bold">-</span>
                                      ) : (
                                        <span className={`font-bold uppercase ${log.qualityScore >= 70 ? 'text-emerald-600' : log.qualityScore >= 40 ? 'text-amber-600' : 'text-rose-500'}`}>
                                          {log.qualityScore >= 70 ? 'High' : log.qualityScore >= 40 ? 'Medium' : 'Low'} ({log.qualityScore})
                                        </span>
                                      )}
                                    </td>
                                    <td className="p-2 text-center font-bold text-slate-600">
                                      {log.rejected ? '-' : `${log.extractionConfidence}%`}
                                    </td>
                                    <td className="p-2 text-center">
                                      {log.rejected ? (
                                        <span className="px-1.5 py-0.5 rounded text-[8.5px] font-black bg-rose-100 text-rose-700 border border-rose-200" title={log.rejectionReason || ''}>
                                          REJECTED
                                        </span>
                                      ) : (
                                        <span className="px-1.5 py-0.5 rounded text-[8.5px] font-black bg-emerald-100 text-emerald-700 border border-emerald-200">
                                          ACCEPTED
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Score Aggregation Breakdown */}
                  {contentScore && (
                    <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <h4 className="text-[11.5px] font-black text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                        <Scale className="w-3.5 h-3.5 text-indigo-500" /> Score Aggregation Breakdown
                      </h4>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between items-center py-1 border-b border-slate-200/50">
                          <span className="text-slate-600 font-semibold">Base Weighted Score:</span>
                          <span className="font-extrabold text-slate-800">{contentScore.baseScore} / 100</span>
                        </div>
                        <div className="pl-3 space-y-1.5 text-[11px] text-slate-500 border-l border-slate-200">
                          <div className="flex justify-between">
                            <span>Semantic Coverage (15% weight)</span>
                            <span>{contentScore.breakdown.S} × 0.15 = <strong className="text-slate-700">{(contentScore.breakdown.S * 0.15).toFixed(1)}</strong></span>
                          </div>
                          <div className="flex justify-between">
                            <span>Entity Coverage (25% weight)</span>
                            <span>{contentScore.breakdown.E} × 0.25 = <strong className="text-slate-700">{(contentScore.breakdown.E * 0.25).toFixed(1)}</strong></span>
                          </div>
                          <div className="flex justify-between">
                            <span>Intent Similarity (25% weight)</span>
                            <span>{contentScore.breakdown.I} × 0.25 = <strong className="text-slate-700">{(contentScore.breakdown.I * 0.25).toFixed(1)}</strong></span>
                          </div>
                          <div className="flex justify-between">
                            <span>On-page Structure (10% weight)</span>
                            <span>{contentScore.breakdown.O} × 0.10 = <strong className="text-slate-700">{(contentScore.breakdown.O * 0.10).toFixed(1)}</strong></span>
                          </div>
                          <div className="flex justify-between">
                            <span>Content Gap Coverage (15% weight)</span>
                            <span>{contentScore.breakdown.G} × 0.15 = <strong className="text-slate-700">{(contentScore.breakdown.G * 0.15).toFixed(1)}</strong></span>
                          </div>
                          <div className="flex justify-between">
                            <span>Readability (10% weight)</span>
                            <span>{contentScore.breakdown.R} × 0.10 = <strong className="text-slate-700">{(contentScore.breakdown.R * 0.10).toFixed(1)}</strong></span>
                          </div>
                        </div>

                        {/* Penalties Applied */}
                        <div className="flex justify-between items-center py-1 border-b border-slate-200/50 pt-1">
                          <span className="text-slate-600 font-semibold">Total Penalties Applied:</span>
                          <span className={`font-extrabold ${contentScore.penalties > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                            -{contentScore.penalties} pts
                          </span>
                        </div>
                        {contentScore.penaltyDetails && contentScore.penaltyDetails.length > 0 && (
                          <div className="pl-3 space-y-1 text-[11px] text-rose-500 border-l border-rose-100">
                            {contentScore.penaltyDetails.map((p, idx) => (
                              <div key={idx} className="flex justify-between">
                                <span className="truncate max-w-[280px]">{p.reason}</span>
                                <span className="font-bold">-{p.points}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Final Score */}
                        <div className="flex justify-between items-center pt-2 font-black text-sm border-t border-slate-200/55">
                          <span className="text-slate-800">Final Adjusted Score:</span>
                          <span className="text-indigo-600 text-base">{contentScore.totalScore} / 100</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Structure Score Diagnostics */}
                  {contentScore?.structureDetails && (
                    <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <h4 className="text-[11.5px] font-black text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-indigo-500" /> Structure Score Diagnostics ({contentScore.breakdown.O}/100)
                      </h4>
                      <div className="space-y-2.5 text-[11px]">
                        {[
                          { label: 'H1 Quality & Tag', val: contentScore.structureDetails.h1Quality, weight: '10%' },
                          { label: 'H2 Coverage & Count', val: contentScore.structureDetails.h2Coverage, weight: '10%' },
                          { label: 'H3 Coverage & Depth', val: contentScore.structureDetails.h3Coverage, weight: '10%' },
                          { label: 'FAQ Section Presence', val: contentScore.structureDetails.faqCoverage, weight: '10%' },
                          { label: 'Table Presence & Formats', val: contentScore.structureDetails.tableCoverage, weight: '10%' },
                          { label: 'Word Count Alignment', val: contentScore.structureDetails.wordCountAlignment, weight: '20%' },
                          { label: 'Heading Frequency Similarity', val: contentScore.structureDetails.headingFrequencyAlignment, weight: '15%' },
                          { label: 'Featured Snippet Coverage', val: contentScore.structureDetails.featuredSnippetCoverage, weight: '15%' },
                        ].map((sub, idx) => (
                          <div key={idx} className="space-y-1">
                            <div className="flex justify-between font-bold text-slate-700">
                              <span>{sub.label} <span className="text-[10px] text-slate-400 font-normal">({sub.weight})</span></span>
                              <span className={sub.val >= 80 ? 'text-emerald-600 font-black' : sub.val >= 50 ? 'text-amber-600 font-black' : 'text-rose-500 font-black'}>
                                {sub.val} / 100
                              </span>
                            </div>
                            <div className="h-1 w-full bg-slate-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  sub.val >= 80 ? 'bg-emerald-500' : sub.val >= 50 ? 'bg-amber-400' : 'bg-rose-400'
                                }`}
                                style={{ width: `${sub.val}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Missing Keywords */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Missing Keywords ({missingKeywords.length})</h4>
                      {missingKeywords.length === 0 && (
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">All Covered!</span>
                      )}
                    </div>
                    {missingKeywords.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {missingKeywords.map((t, i) => (
                          <button
                            key={i}
                            onClick={() => onInsertTerm(t.term)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#fce8e6] text-[#c5221f] border border-[#fad2cf]/60 hover:bg-[#fad2cf] transition-all"
                          >
                            <span>{t.term}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">No missing keywords! Good job.</p>
                    )}
                  </div>

                  {/* Entity Coverage Summary & Gaps */}
                  <div className="space-y-3">
                    <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Entity Coverage</h4>
                    {contentScore?.stats && contentScore.stats.totalEntities !== undefined && (
                      <div className="grid grid-cols-4 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100 text-center text-xs font-semibold">
                        <div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase">Total</div>
                          <div className="text-slate-800 font-extrabold mt-0.5">{contentScore.stats.totalEntities}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase">Covered</div>
                          <div className="text-emerald-600 font-extrabold mt-0.5">{contentScore.stats.coveredEntities}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase">Missing</div>
                          <div className="text-rose-600 font-extrabold mt-0.5">{contentScore.stats.missingEntitiesCount}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase">Weight</div>
                          <div className="text-indigo-600 font-extrabold mt-0.5 truncate max-w-full" title={contentScore.stats.entityScoreContribution}>
                            {contentScore.stats.entityScoreContribution?.split(' ')[0]}
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-1">
                      <div className="text-[10px] font-bold text-slate-500 uppercase">Missing Expected Entities ({missingEntities.length})</div>
                      {missingEntities.length === 0 && (serpEntities || serpAnalysis?.entities)?.length && (
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">All Covered!</span>
                      )}
                    </div>
                    {missingEntities.length > 0 ? (
                      <div className="grid gap-2">
                        {missingEntities.map((e: any, i: number) => {
                          const competitorCoverage = e.competitorCoverage ?? 0;
                          const normalizedCoverage = competitorCoverage > 1 ? competitorCoverage / 100 : competitorCoverage;
                          const impScore = e.importanceScore ?? Math.round(normalizedCoverage * 100);
                          
                          let priority = 'Low';
                          let badgeColor = 'bg-slate-100 text-slate-700 border-slate-200';
                          if (impScore >= 70) {
                            priority = 'High';
                            badgeColor = 'bg-rose-100 text-rose-700 border-rose-200';
                          } else if (impScore >= 40) {
                            priority = 'Medium';
                            badgeColor = 'bg-amber-100 text-amber-700 border-amber-200';
                          }

                          return (
                            <div key={i} className="p-3 rounded-xl border border-rose-100 bg-rose-50/20 text-xs space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-800">{e.entityName || e.name}</span>
                                <div className="flex items-center gap-1.5">
                                  <span className={`text-[9.5px] font-black px-1.5 py-0.5 rounded border uppercase tracking-wider ${badgeColor}`}>
                                    {priority} Importance ({impScore}/100)
                                  </span>
                                  <span className="text-[9.5px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 uppercase tracking-wider">
                                    {e.entityType || 'Entity'}
                                  </span>
                                </div>
                              </div>
                              {e.missingContext && (
                                <p className="text-[10.5px] text-slate-500 italic leading-snug">
                                  Context: {e.missingContext}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (serpEntities || serpAnalysis?.entities)?.length ? (
                      <p className="text-xs text-slate-400 italic">No missing entities! Good job.</p>
                    ) : (
                      <p className="text-xs text-slate-400 italic">No entity data available from SERP analysis.</p>
                    )}
                  </div>

                  {/* Collapsible Complete SERP Intelligence Report */}
                  {serpAnalysis && (
                    <div className="pt-4 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setShowSerpDebug(!showSerpDebug)}
                        className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors text-xs font-semibold text-slate-700"
                      >
                        <div className="flex items-center gap-2">
                          <Database className="w-3.5 h-3.5 text-indigo-500" />
                          <span>{showSerpDebug ? 'Hide' : 'Show'} Full SERP Intelligence Report</span>
                        </div>
                        {showSerpDebug ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                      </button>

                      {showSerpDebug && (
                        <div className="mt-3 p-4 rounded-xl border border-slate-100 bg-white shadow-md space-y-5 text-xs animate-in fade-in duration-150">
                          {/* Heading Frequency */}
                          <div className="space-y-1.5">
                            <div className="font-bold text-slate-700">Heading Frequency Report</div>
                            <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100">
                              {serpAnalysis.headingFrequency && serpAnalysis.headingFrequency.length > 0 ? (
                                serpAnalysis.headingFrequency.map((h, i) => (
                                  <div key={i} className="flex justify-between items-center p-2 text-[11px]">
                                    <span className="font-medium text-slate-600 truncate mr-2">{h.heading}</span>
                                    <span className="shrink-0 bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[9px] font-bold">
                                      {h.count}/{serpAnalysis.analyzedCompetitors || 10} ({h.competitorPercentage}%)
                                    </span>
                                  </div>
                                ))
                              ) : (
                                <div className="p-2 text-slate-400 text-center">No headings data.</div>
                              )}
                            </div>
                          </div>

                          {/* Table Detection */}
                          <div className="space-y-1.5 bg-slate-50 p-3 rounded-lg border border-slate-100">
                            <div className="font-bold text-slate-700">Table Detection Report</div>
                            <div className="flex justify-between items-center text-[11px]">
                              <span>Table Usage Rate:</span>
                              <span className="font-bold">{serpAnalysis.tableDetection?.competitorPercentage || 0}% ({serpAnalysis.tableDetection?.competitorTableCount || 0} competitors)</span>
                            </div>
                            <div className="flex justify-between items-center text-[11px]">
                              <span>Table Generation:</span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${serpAnalysis.tableDetection?.tablesFound ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                {serpAnalysis.tableDetection?.tablesFound ? 'ENABLED' : 'DISABLED'}
                              </span>
                            </div>
                          </div>

                          {/* PAA Questions */}
                          <div className="space-y-1.5">
                            <div className="font-bold text-slate-700">Top Captured PAA Questions</div>
                            <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100">
                              {serpAnalysis.paaQuestions && serpAnalysis.paaQuestions.length > 0 ? (
                                serpAnalysis.paaQuestions.map((q, i) => (
                                  <div key={i} className="p-2 text-[11px] text-slate-600 leading-snug">
                                    <strong>Q:</strong> {q.question}
                                  </div>
                                ))
                              ) : (
                                <div className="p-2 text-slate-400 text-center">No PAA questions.</div>
                              )}
                            </div>
                          </div>

                          {/* Topic Clusters */}
                          <div className="space-y-1.5">
                            <div className="font-bold text-slate-700">Topic Cluster Report</div>
                            <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100">
                              {serpAnalysis.topicClusters && serpAnalysis.topicClusters.length > 0 ? (
                                serpAnalysis.topicClusters.map((cluster, i) => (
                                  <div key={i} className="p-2 space-y-1">
                                    <div className="font-semibold text-slate-700 text-[10px] uppercase">{cluster.clusterName}</div>
                                    <div className="text-[10px] text-slate-500">{cluster.keywords.join(', ')}</div>
                                  </div>
                                ))
                              ) : (
                                <div className="p-2 text-slate-400 text-center">No clusters.</div>
                              )}
                            </div>
                          </div>

                          {/* Competitor Authority Weights */}
                          <div className="space-y-1.5">
                            <div className="font-bold text-slate-700">Competitor Authority Weights</div>
                            <div className="overflow-x-auto border border-slate-100 rounded-lg">
                              <table className="w-full text-[11px] text-left border-collapse">
                                <thead>
                                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold">
                                    <th className="p-2 text-center">Rank</th>
                                    <th className="p-2">Title & URL</th>
                                    <th className="p-2 text-center">Weight</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {serpAnalysis.competitorWeights && serpAnalysis.competitorWeights.length > 0 ? (
                                    serpAnalysis.competitorWeights.map((cw: any, idx: number) => (
                                      <tr key={idx} className="hover:bg-slate-50/50">
                                        <td className="p-2 text-center font-bold text-slate-400">#{cw.rank}</td>
                                        <td className="p-2 max-w-[200px]">
                                          <div className="font-semibold text-slate-700 truncate">{cw.title}</div>
                                          <div className="text-[9px] text-slate-400 truncate">{cw.url}</div>
                                        </td>
                                        <td className="p-2 text-center font-bold text-emerald-600 bg-emerald-50/10">{cw.weight.toFixed(1)}</td>
                                      </tr>
                                    ))
                                  ) : (
                                    [...Array(serpAnalysis.analyzedCompetitors || 10)].map((_, idx) => {
                                      const rank = idx + 1;
                                      const weight = Math.max(0.1, 1.1 - rank * 0.1);
                                      return (
                                        <tr key={idx} className="hover:bg-slate-50/50">
                                          <td className="p-2 text-center font-bold text-slate-400">#{rank}</td>
                                          <td className="p-2 max-w-[200px] text-slate-500 italic truncate">
                                            {serpAnalysis.competitorTitles?.[idx] || `Competitor ${rank}`}
                                          </td>
                                          <td className="p-2 text-center font-bold text-emerald-600 bg-emerald-50/10">{weight.toFixed(1)}</td>
                                        </tr>
                                      );
                                    })
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {/* Intent Confidence Breakdown */}
                          <div className="space-y-1.5 bg-slate-50 p-3 rounded-lg border border-slate-100">
                            <div className="font-bold text-slate-700">Intent Confidence Breakdown</div>
                            <div className="flex justify-between items-center text-[11px] mb-2">
                              <span>Dominant Intent:</span>
                              <span className="font-bold uppercase text-indigo-700">{serpAnalysis.intentBlueprint?.intent || 'informational'} ({serpAnalysis.intentBlueprint?.confidenceScore || 80}%)</span>
                            </div>
                            <div className="space-y-1.5">
                              {(() => {
                                const confidence = serpAnalysis.intentBlueprint?.intentConfidence || {
                                  informational: serpAnalysis.intentBlueprint?.intent === 'informational' ? (serpAnalysis.intentBlueprint?.confidenceScore || 80) : 10,
                                  commercial: serpAnalysis.intentBlueprint?.intent === 'commercial' ? (serpAnalysis.intentBlueprint?.confidenceScore || 80) : 10,
                                  transactional: serpAnalysis.intentBlueprint?.intent === 'transactional' ? (serpAnalysis.intentBlueprint?.confidenceScore || 80) : 5,
                                  comparison: serpAnalysis.intentBlueprint?.intent === 'comparison' ? (serpAnalysis.intentBlueprint?.confidenceScore || 80) : 5,
                                };
                                return Object.entries(confidence).map(([key, pct]: [string, any]) => (
                                  <div key={key} className="space-y-0.5">
                                    <div className="flex justify-between text-[10px] text-slate-600">
                                      <span className="capitalize">{key}</span>
                                      <span>{pct}%</span>
                                    </div>
                                    <div className="w-full bg-slate-200 rounded-full h-1 overflow-hidden">
                                      <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${pct}%` }} />
                                    </div>
                                  </div>
                                ));
                              })()}
                            </div>
                          </div>

                          {/* Entity Relationship Graph */}
                          <div className="space-y-1.5">
                            <div className="font-bold text-slate-700">Entity Relationship Graph</div>
                            <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100 bg-white">
                              {serpAnalysis.entityRelationships && serpAnalysis.entityRelationships.length > 0 ? (
                                serpAnalysis.entityRelationships.map((rel: any, idx: number) => (
                                  <div key={idx} className="flex justify-between items-center p-2 text-[10.5px]">
                                    <div className="flex items-center gap-1.5 truncate">
                                      <span className="font-semibold text-indigo-700 truncate max-w-[80px]">{rel.source}</span>
                                      <span className="text-slate-400 font-mono text-[9px]">&rarr;</span>
                                      <span className="font-semibold text-slate-600 truncate max-w-[80px]">{rel.target}</span>
                                    </div>
                                    <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border bg-slate-50">{rel.type}</span>
                                  </div>
                                ))
                              ) : (
                                <div className="p-2 text-slate-400 text-center">No entity relationship mappings.</div>
                              )}
                            </div>
                          </div>

                          {/* Featured Snippet Analysis */}
                          <div className="space-y-1.5 p-3 rounded-lg border border-emerald-100 bg-emerald-50/10">
                            <div className="font-bold text-slate-700">Featured Snippet Analysis</div>
                            {serpAnalysis.featuredSnippetBlueprint?.hasFeaturedSnippet ? (
                              <div className="space-y-2 text-[11px]">
                                <div className="flex justify-between">
                                  <span>Snippet Type:</span>
                                  <span className="font-bold capitalize">{serpAnalysis.featuredSnippetBlueprint.snippetType}</span>
                                </div>
                                <div className="space-y-0.5">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase">Target Query</span>
                                  <div className="p-1.5 rounded bg-white border border-slate-200/50 font-semibold">{serpAnalysis.featuredSnippetBlueprint.targetQuery}</div>
                                </div>
                                {serpAnalysis.featuredSnippetBlueprint.optimizedSnippetRecommendation && (
                                  <div className="space-y-0.5">
                                    <span className="text-[9px] font-bold text-emerald-600 uppercase">Target Snippet Template</span>
                                    <div className="p-2 rounded bg-emerald-50 text-emerald-950 font-medium leading-relaxed border border-emerald-100">
                                      {serpAnalysis.featuredSnippetBlueprint.optimizedSnippetRecommendation}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-slate-400 italic text-[11px]">No featured snippet opportunities detected.</div>
                            )}
                          </div>

                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>
              </div>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}
