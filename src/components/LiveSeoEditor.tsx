'use client';
import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { SerpTerm, SerpEntity } from '@/types/serp';
import { Sparkles, AlertCircle, Loader2, ShieldAlert, CheckCircle2, Zap, ArrowRight, BookOpen, Heading2, MousePointerClick, Target } from 'lucide-react';
import { computeStructuredScore, ContentScoreResult, computeTermImpactScore } from '@/lib/content-scoring';
import { Progress } from '@/components/ui/progress';
import { splitIntoSentences, checkSemanticMatchForTerm } from '@/lib/seo-intelligence/seo_scoring_engine';

interface LiveSeoEditorProps {
  content: string;
  title: string;
  headings: string[];
  terms: SerpTerm[];
  entities: SerpEntity[];
  topTermsForIntent: string[];   // top-30 competitor stems for I-score
  medianWordCount: number;
  medianTitleLength: number;
  medianH2Count: number;
  integratingTerm?: string | null;
  targetKeywords?: string[];
  onSuggestPlacement?: (term: string) => void;
  onInsertText?: (text: string) => void;   // Layer 2: insert suggested sentence
  contentGapReport?: any;
  headingFrequency?: any[];
  topicClusters?: any[];
  paaQuestions?: any[];
  medianLexicalDiversity?: number;
  featuredSnippetBlueprint?: any;
}

// Colour for a 0–100 score value
function scoreHsl(value: number) {
  return `hsl(${Math.min(130, value * 1.3)}, 72%, 52%)`;
}

// Colour class for individual sub-score text
function scoreClass(ratio: number) {
  if (ratio > 0.8) return 'text-emerald-400 font-semibold';
  if (ratio > 0.5) return 'text-amber-400 font-semibold';
  return 'text-red-400 font-semibold';
}

export function LiveSeoEditor({
  content,
  title,
  headings,
  terms,
  entities,
  topTermsForIntent,
  medianWordCount,
  medianTitleLength,
  medianH2Count,
  integratingTerm,
  targetKeywords,
  onSuggestPlacement,
  onInsertText,
  contentGapReport,
  headingFrequency,
  topicClusters,
  paaQuestions,
  medianLexicalDiversity = 0.35,
  featuredSnippetBlueprint,
}: LiveSeoEditorProps) {
  // ── Layer 1: Debounced content for scoring (recalculate on 1.5s pause) ─────
  const [debouncedContent, setDebouncedContent] = useState(content);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedContent(content), 1500);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [content]);

  // ── Layer 1: Score delta animation ─────────────────────────────────────────
  const prevScore = useRef<number | null>(null);
  const [scoreDelta, setScoreDelta] = useState<number | null>(null);
  const deltaTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fast tokenisation for current-count tracking (always tracks live content)
  const textTokens = useMemo(() =>
    content.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2),
    [content]
  );

  // Live term stats — marks currentCount and overuse per term
  const liveTerms = useMemo(() => {
    const sentences = splitIntoSentences(content);
    const draftClean = content.toLowerCase();
    return terms.map(term => {
      let count = 0;
      const termLower = term.term.toLowerCase();
      if (!termLower.includes(' ')) {
        const rootLower = (term.rootForm || termLower);
        count = textTokens.filter(t => t === termLower || t === rootLower).length;
      } else {
        const regex = new RegExp(`\\b${termLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        const m = content.match(regex);
        count = m ? m.length : 0;
      }

      // Fallback to 1 if exact count is 0 but semantic match is found
      if (count === 0) {
        const isMatched = checkSemanticMatchForTerm(sentences, draftClean, term.term);
        if (isMatched) count = 1;
      }

      const density = textTokens.length > 0 ? count / textTokens.length : 0;
      return { ...term, currentCount: count, overuseRisk: density > 0.03 };
    });
  }, [terms, textTokens, content]);

  // Live target keywords tracking
  const liveTargetKeywords = useMemo(() => {
    if (!targetKeywords) return [];
    const sentences = splitIntoSentences(content);
    const draftClean = content.toLowerCase();
    return targetKeywords.map(term => {
      let count = 0;
      const termLower = term.toLowerCase();
      if (!termLower.includes(' ')) {
        count = textTokens.filter(t => t === termLower).length;
      } else {
        const regex = new RegExp(`\\b${termLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        const m = content.match(regex);
        count = m ? m.length : 0;
      }

      // Fallback to 1 if exact count is 0 but semantic match is found
      if (count === 0) {
        const isMatched = checkSemanticMatchForTerm(sentences, draftClean, term);
        if (isMatched) count = 1;
      }

      return { term, currentCount: count };
    });
  }, [targetKeywords, textTokens, content]);

  // 6-component blended score — uses *debounced* content for performance
  const scoreData: ContentScoreResult = useMemo(() =>
    computeStructuredScore({
      textContext: debouncedContent,
      title,
      headings,
      liveTerms,
      entities,
      topTermsForIntent,
      medianWordCount,
      medianTitleLength,
      medianH2Count,
      contentGapReport,
      headingFrequency,
      topicClusters,
      paaQuestions,
      medianLexicalDiversity,
      featuredSnippetBlueprint,
    }),
    [
      debouncedContent, title, headings, liveTerms, entities, topTermsForIntent,
      medianWordCount, medianTitleLength, medianH2Count, contentGapReport,
      headingFrequency, topicClusters, paaQuestions, medianLexicalDiversity,
      featuredSnippetBlueprint
    ]
  );

  // ── Layer 1: Emit score delta when score changes ───────────────────────────
  useEffect(() => {
    if (prevScore.current !== null && scoreData.totalScore !== prevScore.current) {
      const delta = scoreData.totalScore - prevScore.current;
      setScoreDelta(delta);
      if (deltaTimeout.current) clearTimeout(deltaTimeout.current);
      deltaTimeout.current = setTimeout(() => setScoreDelta(null), 2500);
    }
    prevScore.current = scoreData.totalScore;
  }, [scoreData.totalScore]);

  // ── Layer 5: Sort terms by Impact Score ───────────────────────────────────
  const intentSet = useMemo(() => new Set(topTermsForIntent.map(t => t.toLowerCase())), [topTermsForIntent]);

  const sortedLiveTerms = useMemo(() =>
    [...liveTerms].sort((a, b) => computeTermImpactScore(b, intentSet) - computeTermImpactScore(a, intentSet)),
    [liveTerms, intentSet]
  );

  const basicTerms         = sortedLiveTerms.filter(t => t.category === 'basic');
  const supplementaryTerms = sortedLiveTerms.filter(t => t.category === 'supplementary');
  const contextualTerms    = sortedLiveTerms.filter(t => t.category === 'contextual');

  // ── Layer 6: Session streak counter ───────────────────────────────────────
  const [sessionAdded, setSessionAdded] = useState(0);
  const prevMet = useRef<Set<string>>(new Set());
  useEffect(() => {
    const nowMet = new Set(liveTerms.filter(t => t.currentCount >= t.recommendedMin).map(t => t.term));
    let newlyMet = 0;
    nowMet.forEach(t => { if (!prevMet.current.has(t)) newlyMet++; });
    if (newlyMet > 0) setSessionAdded(prev => prev + newlyMet);
    prevMet.current = nowMet;
  }, [liveTerms]);

  // ── Layer 2 & 3: Contextual action card state ─────────────────────────────
  const [actionTerm, setActionTerm] = useState<(SerpTerm & { currentCount: number; overuseRisk: boolean }) | null>(null);
  const [actionPos, setActionPos] = useState<{ top: number; left: number } | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestedText, setSuggestedText] = useState<string | null>(null);
  const [rewritingIdx, setRewritingIdx] = useState<number | null>(null);
  const [rewrittenTexts, setRewrittenTexts] = useState<Record<string, string>>({});
  const actionCardRef = useRef<HTMLDivElement>(null);

  // Close action card on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (actionCardRef.current && !actionCardRef.current.contains(e.target as Node)) {
        setActionTerm(null);
        setSuggestedText(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleTermClick = useCallback(
    (term: SerpTerm & { currentCount: number; overuseRisk: boolean }, e: React.MouseEvent) => {
      if (term.currentCount >= term.recommendedMin) {
        onSuggestPlacement?.(term.term);
        return;
      }
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const parentRect = (e.currentTarget as HTMLElement).closest('.live-seo-editor-root')?.getBoundingClientRect();
      setActionTerm(term);
      setActionPos({
        top: rect.bottom - (parentRect?.top ?? 0) + 8,
        left: Math.max(0, rect.left - (parentRect?.left ?? 0)),
      });
      setSuggestedText(null);
    },
    [onSuggestPlacement]
  );

  // Layer 2: Suggest a sentence
  const handleSuggestSentence = async () => {
    if (!actionTerm) return;
    setIsSuggesting(true);
    setSuggestedText(null);
    try {
      const nearby = content.slice(-800); // last 800 chars for context
      const res = await fetch('/api/suggest-sentence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term: actionTerm.term, context: nearby }),
      });
      const data = await res.json();
      setSuggestedText(data.text ?? 'Could not generate suggestion.');
    } catch {
      setSuggestedText('Error generating sentence.');
    } finally {
      setIsSuggesting(false);
    }
  };

  // Layer 3: Rewrite a competitor sentence
  const handleRewrite = async (exampleText: string, idx: number) => {
    if (!actionTerm) return;
    setRewritingIdx(idx);
    try {
      const nearby = content.slice(-600);
      const res = await fetch('/api/rewrite-sentence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentence: exampleText, term: actionTerm.term, context: nearby }),
      });
      const data = await res.json();
      const key = `${actionTerm.term}_${idx}`;
      setRewrittenTexts(prev => ({ ...prev, [key]: data.text ?? '' }));
    } catch {
      // ignore
    } finally {
      setRewritingIdx(null);
    }
  };

  // Layer 2: Insert H2
  const handleInsertH2 = () => {
    if (!actionTerm) return;
    onInsertText?.(`\n\n## ${actionTerm.term.charAt(0).toUpperCase() + actionTerm.term.slice(1)}\n\n`);
    setActionTerm(null);
  };

  // ── Term Chip ──────────────────────────────────────────────────────────────
  const TermChip = ({ term }: { term: SerpTerm & { currentCount: number; overuseRisk: boolean } }) => {
    const isMet        = term.currentCount >= term.recommendedMin;
    const isOverused   = term.overuseRisk;
    const isIntegrating = term.term === integratingTerm;
    const impactScore  = computeTermImpactScore(term, intentSet);

    let colorClass = 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10';
    if (isOverused)   colorClass = 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20';
    else if (isMet)   colorClass = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/25';

    return (
      <button
        onClick={(e) => handleTermClick(term, e)}
        disabled={isIntegrating}
        className={`group relative flex items-center justify-between px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${colorClass} hover:ring-2 hover:ring-primary/20 cursor-pointer shadow-sm ${isIntegrating ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <span className="truncate max-w-[120px] flex items-center gap-1.5">
          {isIntegrating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {term.term}
        </span>
        <div className="ml-2.5 flex items-center gap-1 opacity-90 text-xs font-mono">
          <span className={isMet ? 'text-emerald-300 font-bold' : isOverused ? 'text-red-300 font-bold' : 'text-white'}>
            {term.currentCount}
          </span>
          <span className="text-[10px] opacity-40">/</span>
          <span className="opacity-80">{term.recommendedMin}–{term.recommendedMax}</span>
        </div>

        {/* Hover tooltip with competitor examples */}
        <div className="absolute hidden group-hover:block z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 w-72 p-3 bg-slate-900 text-slate-100 text-xs rounded-xl shadow-2xl border border-slate-700">
          <p className="font-semibold text-sm mb-1">{term.term}</p>
          <p className="text-slate-400 mb-1">Coverage: <span className="text-white">{Math.round(term.docFrequency * 100)}% of competitors</span></p>
          <p className="text-slate-400 mb-1">Target: <span className="text-slate-300">{term.placements.join(', ')}</span></p>
          <p className="text-slate-400 mb-2">Impact Score: <span className="text-amber-300 font-bold">{impactScore}/100</span></p>

          {/* Layer 3: Competitor sentence examples */}
          {term.competitorExamples && term.competitorExamples.length > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-700 space-y-1">
              <p className="text-slate-500 font-medium uppercase tracking-wide text-[9px] mb-1">Used by top results:</p>
              {term.competitorExamples.slice(0, 1).map((ex, i) => (
                <p key={i} className="text-slate-300 italic leading-relaxed text-[11px]">
                  "…{ex.text.length > 120 ? ex.text.slice(0, 120) + '…' : ex.text}"
                  <span className="text-blue-400 font-semibold not-italic ml-1">#{ex.rank}</span>
                </p>
              ))}
            </div>
          )}

          {isOverused && <p className="text-red-400 font-medium flex items-center gap-1.5 mt-1"><AlertCircle className="w-3.5 h-3.5" />Overused! (density &gt; 3%)</p>}
          {!isMet && <p className="text-blue-400 font-medium mt-1 flex items-center gap-1.5"><MousePointerClick className="w-3.5 h-3.5" />Click for action options</p>}
        </div>
      </button>
    );
  };

  // ── Score Dimension Row ────────────────────────────────────────────────────
  const ScoreDimension = ({
    label, value, max, description,
  }: { label: string; value: number; max: number; description: string }) => (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center text-sm font-medium">
        <span className="text-slate-300">{label}</span>
        <span className={scoreClass(value / max)}>{value} <span className="text-slate-500 font-normal">/ {max}</span></span>
      </div>
      <div className="relative h-1.5 rounded-full bg-black/25 overflow-hidden">
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
          style={{ width: `${(value / max) * 100}%`, backgroundColor: scoreHsl(value) }}
        />
      </div>
      <p className="text-[10px] text-slate-500">{description}</p>
    </div>
  );

  // ── Target Term Chip ───────────────────────────────────────────────────────
  const TargetTermChip = ({ termData }: { termData: { term: string; currentCount: number; } }) => {
    const isMet = termData.currentCount > 0;

    let colorClass = 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10';
    if (isMet) colorClass = 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/20 shadow-sm';

    return (
      <div className={`relative flex items-center justify-between px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${colorClass}`}>
        <span className="truncate max-w-[150px] flex items-center gap-1.5">
          {isMet && <CheckCircle2 className="w-3.5 h-3.5 text-fuchsia-400 shrink-0" />}
          {termData.term}
        </span>
        <div className="ml-2.5 flex items-center gap-1 opacity-90 text-xs font-mono">
          <span className={isMet ? 'text-fuchsia-300 font-bold' : 'text-slate-400 font-bold'}>
            {termData.currentCount}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 live-seo-editor-root relative">

      {/* ── SCORE VISUALIZER ── */}
      <div className="bg-white/5 border border-white/10 p-5 rounded-2xl space-y-5 shadow-sm backdrop-blur-sm relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl" />

        {/* Total score + delta */}
        <div className="flex justify-between items-end relative z-10">
          <div>
            <h3 className="text-xl font-extrabold text-white flex items-center gap-2">Content Score
              {/* Layer 6: Streak counter */}
              {sessionAdded > 0 && (
                <span className="text-sm font-bold text-amber-400 flex items-center gap-1 animate-pulse">
                  <Zap className="w-4 h-4" />{sessionAdded} added this session 🔥
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400 mt-1 font-medium">
              {scoreData.stats.wordCount} words · {scoreData.stats.mustHaveCovered} must-have · {scoreData.stats.entityCovered} entities
            </p>
          </div>
          <div className="flex items-end gap-2">
            {/* Layer 1: Score delta animation */}
            {scoreDelta !== null && (
              <span
                className={`text-sm font-bold tabular-nums animate-bounce ${scoreDelta > 0 ? 'text-emerald-400' : 'text-red-400'}`}
              >
                {scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta} pts
              </span>
            )}
            <div className="text-4xl font-black tabular-nums tracking-tighter" style={{ color: scoreHsl(scoreData.totalScore) }}>
              {scoreData.totalScore} <span className="text-base font-medium text-slate-500">/ 100</span>
            </div>
          </div>
        </div>
        <div className="relative z-10">
          <Progress value={scoreData.totalScore} className="h-2 rounded-full bg-black/20 overflow-hidden [&>*]:bg-gradient-to-r [&>*]:from-blue-500 [&>*]:to-cyan-400" />
        </div>

        {/* 6-component breakdown */}
        <div className="grid grid-cols-1 gap-3.5 pt-1 relative z-10">
          <ScoreDimension label="S — Semantic Coverage (30%)"  value={scoreData.breakdown.S} max={100} description="Must-have + supplementary term recall weighted 70/30" />
          <ScoreDimension label="I — Intent similarity (20%)"   value={scoreData.breakdown.I} max={100} description="Jaccard similarity of your term set vs. competitor corpus" />
          <ScoreDimension label="E — Entity Coverage (20%)"    value={scoreData.breakdown.E} max={100} description="Fraction of key entities found in draft" />
          <ScoreDimension label="O — On-page Structure (15%)"  value={scoreData.breakdown.O} max={100} description="H1/H2 presence, heading count & word count alignment" />
          <ScoreDimension label="G — Content Gap coverage (10%)" value={scoreData.breakdown.G} max={100} description="Competitor missing topics and recommended headings coverage" />
          <ScoreDimension label="R — Readability (5%)"         value={scoreData.breakdown.R} max={100} description="Lexical diversity + target paragraph depth" />
        </div>

        {/* Penalties */}
        {scoreData.penalties > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-white/10 relative z-10">
            {scoreData.penaltyReasons.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-xs font-medium text-red-400 bg-red-500/10 px-3 py-2 rounded-lg border border-red-500/20">
                <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {r}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── QUICK STATS ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Word Count',  value: scoreData.stats.wordCount, compare: medianWordCount },
          { label: 'Title Len',   value: title.length,              compare: medianTitleLength },
          { label: 'H2 Headers',  value: headings.length,           compare: medianH2Count },
        ].map(({ label, value, compare }) => (
          <div key={label} className="p-3.5 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm shadow-sm text-center hover:bg-white/10 transition-colors">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">{label}</div>
            <div className="text-2xl font-sans font-bold text-white">{value}</div>
            <div className="text-xs text-slate-500 mt-1 font-medium">Competitor avg: {compare}</div>
          </div>
        ))}
      </div>

      {/* ── TARGET KEYWORDS (Strategy Priority) ── */}
      {liveTargetKeywords && liveTargetKeywords.length > 0 && (
        <div className="space-y-4 pt-5 border-t border-white/10">
          <h4 className="text-sm font-semibold flex flex-col text-slate-200">
            <span className="flex items-center gap-1.5 text-fuchsia-400">
              <Target className="w-4 h-4" /> Strategy Priority Targets
            </span>
            <span className="text-[11px] text-slate-400 font-medium mt-0.5">Custom keywords injected from your Strategy Planner. Mention all of these natively.</span>
          </h4>
          <div className="flex flex-wrap gap-2.5">
            {liveTargetKeywords.map((t, idx) => <TargetTermChip key={idx} termData={t} />)}
          </div>
        </div>
      )}

      {/* ── TERMS (sorted by Impact Score) ── */}
      <div className="space-y-5 pt-5 border-t border-white/10">
        {basicTerms.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-3 flex flex-col text-slate-200">
              Basic Terms
              <span className="text-[11px] text-slate-400 font-medium mt-0.5">Sorted by Impact Score — cover all of these.</span>
            </h4>
            <div className="flex flex-wrap gap-2.5">
              {basicTerms.map(t => <TermChip key={t.term} term={t} />)}
            </div>
          </div>
        )}

        {supplementaryTerms.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-3 flex flex-col text-slate-200">
              Supplementary Terms
              <span className="text-[11px] text-slate-400 font-medium mt-0.5">Related concepts for topical depth.</span>
            </h4>
            <div className="flex flex-wrap gap-2.5">
              {supplementaryTerms.map(t => <TermChip key={t.term} term={t} />)}
            </div>
          </div>
        )}

        {contextualTerms.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-3 flex flex-col text-slate-200">
              Contextual Details
              <span className="text-[11px] text-slate-400 font-medium mt-0.5">Long-tail enrichment terms.</span>
            </h4>
            <div className="flex flex-wrap gap-2.5">
              {contextualTerms.map(t => <TermChip key={t.term} term={t} />)}
            </div>
          </div>
        )}
      </div>

      {/* ── ENTITIES ── */}
      {entities.length > 0 && (
        <div className="pt-5 border-t border-white/10">
          <h4 className="text-sm font-semibold mb-3 flex flex-col text-slate-200">
            Identified Entities
            <span className="text-[11px] text-slate-400 font-medium mt-0.5">
              People, brands, tools and concepts competitors reference.
            </span>
          </h4>
          <div className="space-y-2.5">
            {entities.map(e => {
              const inDraft = content.toLowerCase().includes(e.entityName.toLowerCase());
              return (
                <div key={e.entityName} className={`p-4 rounded-xl border text-sm shadow-sm backdrop-blur-sm transition-all group ${inDraft ? 'bg-emerald-500/8 border-emerald-500/20' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                  <div className="font-semibold text-slate-200 flex items-center gap-2 group-hover:text-white transition-colors">
                    {inDraft
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      : <AlertCircle  className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    }
                    {e.entityName}
                    <span className="ml-1 text-[9px] uppercase font-extrabold tracking-widest px-2 py-0.5 rounded-md border border-white/10 bg-black/30 text-blue-300">
                      {e.entityType}
                    </span>
                    <span className="ml-auto text-[10px] text-slate-500">{Math.round((e.competitorCoverage ?? 0) * 100)}% competitors</span>
                  </div>
                  {e.missingContext && (
                    <p className="text-[13px] text-slate-400 mt-2 leading-relaxed font-medium">{e.missingContext}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── LAYER 2 & 3: Contextual Action Card ── */}
      {actionTerm && actionPos && (
        <div
          ref={actionCardRef}
          className="absolute z-[100] w-80 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden"
          style={{ top: actionPos.top, left: Math.min(actionPos.left, 220) }}
        >
          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-slate-800 to-slate-900 border-b border-slate-700">
            <p className="text-xs text-slate-400 uppercase tracking-wide font-bold">Insert Term</p>
            <p className="text-white font-bold text-sm mt-0.5">"{actionTerm.term}"</p>
            <p className="text-xs text-amber-300 mt-0.5">Impact Score: {computeTermImpactScore(actionTerm, intentSet)}/100</p>
          </div>

          {/* Three actions */}
          <div className="p-3 space-y-2">
            {/* Action 1: Jump to best point */}
            <button
              onClick={() => { onSuggestPlacement?.(actionTerm.term); setActionTerm(null); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-blue-500/20 border border-white/10 hover:border-blue-500/40 transition-all text-left group"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                <ArrowRight className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-200 group-hover:text-white">Jump to best spot</p>
                <p className="text-[10px] text-slate-500">AI finds the optimal placement in your draft</p>
              </div>
            </button>

            {/* Action 2: Suggest sentence */}
            <button
              onClick={handleSuggestSentence}
              disabled={isSuggesting}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-purple-500/20 border border-white/10 hover:border-purple-500/40 transition-all text-left group"
            >
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
                {isSuggesting ? <Loader2 className="w-4 h-4 text-purple-400 animate-spin" /> : <Sparkles className="w-4 h-4 text-purple-400" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-200 group-hover:text-white">Suggest a sentence</p>
                <p className="text-[10px] text-slate-500">AI drafts one context-aware sentence using this term</p>
              </div>
            </button>

            {/* Action 3: Insert as H2 */}
            {actionTerm.placements.includes('h2') && (
              <button
                onClick={handleInsertH2}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-500/40 transition-all text-left group"
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <Heading2 className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-200 group-hover:text-white">Insert as H2</p>
                  <p className="text-[10px] text-slate-500">Adds a new section heading using this term</p>
                </div>
              </button>
            )}
          </div>

          {/* Suggested sentence result */}
          {suggestedText && (
            <div className="px-4 pb-4 space-y-2">
              <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                <p className="text-xs text-purple-300 font-semibold mb-1 flex items-center gap-1.5"><Sparkles className="w-3 h-3" />AI Suggestion</p>
                <p className="text-sm text-slate-200 leading-relaxed">"{suggestedText}"</p>
              </div>
              <button
                onClick={() => {
                  onInsertText?.(suggestedText);
                  setActionTerm(null);
                  setSuggestedText(null);
                }}
                className="w-full py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-colors"
              >
                ✓ Insert this sentence
              </button>
            </div>
          )}

          {/* Layer 3: Competitor sentence examples */}
          {actionTerm.competitorExamples && actionTerm.competitorExamples.length > 0 && !suggestedText && (
            <div className="px-4 pb-4 border-t border-slate-700 pt-3 space-y-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-500 font-bold flex items-center gap-1.5">
                <BookOpen className="w-3 h-3" />How competitors use this term
              </p>
              {actionTerm.competitorExamples.map((ex, i) => {
                const key = `${actionTerm.term}_${i}`;
                const rewritten = rewrittenTexts[key];
                return (
                  <div key={i} className="p-2.5 bg-white/5 border border-white/10 rounded-xl space-y-2">
                    <p className="text-[11px] text-slate-300 leading-relaxed italic">
                      "{ex.text.length > 130 ? ex.text.slice(0, 130) + '…' : ex.text}"
                      <span className="text-blue-400 font-bold not-italic ml-1">Result #{ex.rank}</span>
                    </p>
                    {rewritten ? (
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-emerald-300 leading-relaxed italic">✓ "{rewritten}"</p>
                        <button
                          onClick={() => { onInsertText?.(rewritten); setActionTerm(null); }}
                          className="text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-2 py-1 rounded-md transition-colors"
                        >
                          Insert
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleRewrite(ex.text, i)}
                        disabled={rewritingIdx === i}
                        className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-white transition-colors"
                      >
                        {rewritingIdx === i ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        Rewrite in my voice
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
