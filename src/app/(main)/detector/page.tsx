'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, UploadCloud, FileText, LayoutDashboard,
  CheckCircle2, AlertCircle, Link2, AlertTriangle, Lightbulb, Scale,
  Search, BrainCircuit, XCircle, Check, Sparkles, ArrowRight, Zap,
  PlusCircle, BookOpen, Tag, TrendingUp, Info, Target
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SectionEditor, HighlightData, DetectorEditorRef } from '@/components/SectionEditor';
import { getArticles, Article, getExternalLinks, ExternalLink, saveArticle } from '@/lib/firebase/firestore';
import { computeGeneratedMetrics } from '@/lib/content-metrics';
import { toMarkdown } from '@/lib/article-utils';
import { computeStructuredScore, ContentScoreResult } from '@/lib/content-scoring';
import { AnalysisResultsPanel } from '@/components/AnalysisResultsPanel';
import { CompareTabContent } from '@/components/CompareTabContent';
import { LiveSeoEditor } from '@/components/LiveSeoEditor';
import { splitIntoSentences, checkSemanticMatchForTerm } from '@/lib/seo-intelligence/seo_scoring_engine';

import { createPortal } from 'react-dom';
import { WeakCopyCard } from '@/components/ui/WeakCopyCard';

// ── InfoTooltip ───────────────────────────────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true if the article has generated content (not just a title/idea).
 */
function articleHasContent(art: Article): boolean {
  if (!art.content) return false;
  const c = art.content.trim();
  if (c.length < 30) return false;
  if (c.startsWith('{') || c.startsWith('[')) {
    try {
      const parsed = JSON.parse(c);
      const secs: any[] = parsed.sections ?? parsed.blueprint?.sections ?? [];
      return secs.some((s: any) => s.what_it_is || s.why_it_works || s.copy_formula?.length);
    } catch { return false; }
  }
  return c.length > 50;
}

/**
 * Convert a saved article (JSON or plain text) into proper markdown.
 * The SectionEditor expects markdown with # / ## / ### headings.
 */
function articleToMarkdown(art: Article): string {
  if (!art.content) return art.title;
  const c = art.content.trim();
  if (c.startsWith('{') || c.startsWith('[')) {
    try {
      const parsed = JSON.parse(c);
      const bp = parsed.blueprint ?? parsed;
      const secs = parsed.sections ?? bp.sections ?? [];
      return toMarkdown(bp, secs);
    } catch { return c; }
  }
  return c; // already plain markdown
}


function countOccurrences(text: string, term: string): number {
  if (!text || !term) return 0;
  try {
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return (text.match(new RegExp(esc, 'gi')) || []).length;
  } catch { return 0; }
}

function countYouTubeLinks(text: string): number {
  return (text.match(/youtube\.com\/watch/g) || []).length;
}

// ── ArticleComboBox ─────────────────────────────────────────────────────────
// Custom dropdown that greys out articles with no generated content and shows
// a tooltip explaining why they're disabled.

function ArticleComboBox({
  articles, value, onChange,
}: {
  articles: Article[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = articles.find(a => a.id === value);

  return (
    <div ref={ref} className="relative w-full">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full h-11 px-4 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 text-sm text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors hover:border-indigo-300"
      >
        <span className={selected ? 'text-slate-800 font-medium' : 'text-muted-foreground'}>
          {selected
            ? `${selected.title} · ${selected.stage}`
            : '— Choose Article —'}
        </span>
        <svg className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {/* Dropdown list */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-72 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150">
          {articles.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">No saved articles found.</div>
          )}
          {articles.map(a => {
            const hasContent = articleHasContent(a);
            return (
              <div key={a.id} className="relative group">
                <button
                  type="button"
                  disabled={!hasContent}
                  onClick={() => { if (hasContent) { onChange(a.id!); setOpen(false); } }}
                  className={`w-full text-left px-4 py-3 text-sm flex items-start gap-3 transition-colors ${hasContent
                    ? value === a.id
                      ? 'bg-primary/10 text-primary/80 font-semibold'
                      : 'hover:bg-slate-50 text-slate-800'
                    : 'opacity-40 cursor-not-allowed text-muted-foreground'
                    }`}
                >
                  <span className="shrink-0 mt-0.5">
                    {hasContent
                      ? <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
                      : <span className="inline-block w-2 h-2 rounded-full bg-slate-300" />
                    }
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{a.title}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{a.stage}{!hasContent ? ' · No content generated' : ''}</div>
                  </div>
                  {value === a.id && hasContent && (
                    <svg className="w-4 h-4 text-indigo-500 shrink-0 ml-auto self-center" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  )}
                </button>
                {/* Tooltip for disabled items */}
                {!hasContent && (
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-50 px-3 py-2 bg-slate-900 text-white text-xs rounded-lg shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150">
                    No content generated yet — open in the Engine first
                    <div className="absolute left-1/2 -translate-x-1/2 top-full border-4 border-transparent border-t-slate-900" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}



// ── Page Component ────────────────────────────────────────────────────────────


export default function DetectorPage() {
  const [phase, setPhase] = useState<'setup' | 'evaluating' | 'results'>('setup');

  // Setup
  const [inputType, setInputType] = useState<'paste' | 'saved'>('paste');
  const [pastedText, setPastedText] = useState('');
  const [selectedArticleId, setSelectedArticleId] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');
  const [targetKeyword, setTargetKeyword] = useState('');

  // Data
  const [savedArticles, setSavedArticles] = useState<Article[]>([]);
  const [externalLinks, setExternalLinks] = useState<ExternalLink[]>([]);

  // Evaluation
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Results
  const [analysisText, setAnalysisText] = useState('');
  const [analysisResults, setAnalysisResults] = useState<HighlightData | null>(null);

  // Extended context (from Engine handoff)
  const [referenceData, setReferenceData] = useState<any>(null);
  const [blueprint, setBlueprint] = useState<any>(null);
  const [serpTerms, setSerpTerms] = useState<any[]>([]);
  const [serpEntities, setSerpEntities] = useState<any[]>([]);
  const [serpMedianWordCount, setSerpMedianWordCount] = useState(0);
  const [serpMedianTitleLength, setSerpMedianTitleLength] = useState(0);
  const [serpMedianH2Count, setSerpMedianH2Count] = useState(0);
  const [serpTopTermsForIntent, setSerpTopTermsForIntent] = useState<string[]>([]);
  const [competitorTitles, setCompetitorTitles] = useState<string[]>([]);
  const [serpAnalysis, setSerpAnalysis] = useState<any | null>(null);
  const [editorMode, setEditorMode] = useState<'writing' | 'review'>('review');
  const [autoApplyKeyword, setAutoApplyKeyword] = useState(false);
  const [intentClassification, setIntentClassification] = useState<any | null>(null);
  const [intentAlignment, setIntentAlignment] = useState<any | null>(null);

  // Coverage UI State
  const [coverageViewMode, setCoverageViewMode] = useState<'document' | 'section'>('document');

  // Dismiss animation state for weak copy cards
  const [dismissingSet, setDismissingSet] = useState<Set<number>>(new Set());

  // Save state
  const [savedArticleId, setSavedArticleId] = useState<string | null>(null); // null = not yet saved
  const [isSaving, setIsSaving] = useState(false);
  const [saveToast, setSaveToast] = useState<'idle' | 'saved' | 'error'>('idle');

  const editorRef = useRef<DetectorEditorRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getArticles().then(setSavedArticles).catch(console.error);
    getExternalLinks().then(setExternalLinks).catch(console.error);

    const src = new URLSearchParams(window.location.search).get('source');
    if (src === 'engine') {
      try {
        const dataStr = sessionStorage.getItem('detector_context');
        if (dataStr) {
          const ctx = JSON.parse(dataStr);
          if (ctx.draftContent) { setPastedText(ctx.draftContent); setInputType('paste'); }
          if (ctx.referenceData) setReferenceData(ctx.referenceData);
          if (ctx.blueprint) setBlueprint(ctx.blueprint);
          if (ctx.serpTerms) setSerpTerms(ctx.serpTerms);
          if (ctx.serpEntities) setSerpEntities(ctx.serpEntities);
          if (ctx.serpMedianWordCount) setSerpMedianWordCount(ctx.serpMedianWordCount);
          if (ctx.serpMedianTitleLength) setSerpMedianTitleLength(ctx.serpMedianTitleLength);
          if (ctx.serpMedianH2Count) setSerpMedianH2Count(ctx.serpMedianH2Count);
          if (ctx.serpTopTermsForIntent) setSerpTopTermsForIntent(ctx.serpTopTermsForIntent);
          if (ctx.competitorTitles) setCompetitorTitles(ctx.competitorTitles);
          if (ctx.autoApplyKeyword !== undefined) setAutoApplyKeyword(ctx.autoApplyKeyword);
          if (ctx.intentClassification) setIntentClassification(ctx.intentClassification);
          if (ctx.intentAlignment) setIntentAlignment(ctx.intentAlignment);
          if (ctx.serpAnalysis) setSerpAnalysis(ctx.serpAnalysis);
        }
      } catch (e) { console.error('Failed to parse detector_context', e); }
    }
  }, []);

  useEffect(() => {
    if (selectedArticleId && inputType === 'saved') {
      const art = savedArticles.find(a => a.id === selectedArticleId);
      if (art && art.content) {
        const c = art.content.trim();
        if (c.startsWith('{') || c.startsWith('[')) {
          try {
            const parsed = JSON.parse(c);
            const bp = parsed.blueprint ?? parsed;
            setBlueprint(bp);
            if (parsed.referenceData) setReferenceData(parsed.referenceData);
            if (parsed.intentClassification) setIntentClassification(parsed.intentClassification);
            if (parsed.intentAlignment) setIntentAlignment(parsed.intentAlignment);
            
            const serp = art.serpAnalysis || parsed.serpAnalysis;
            if (serp) {
              setSerpAnalysis(serp);
              setSerpTerms(serp.terms || []);
              setSerpEntities(serp.entities || []);
              setSerpMedianWordCount(serp.medianWordCount || 0);
              setSerpMedianTitleLength(serp.medianTitleLength || 0);
              setSerpMedianH2Count(serp.medianH2Count || 0);
              setSerpTopTermsForIntent(serp.topTermsForIntent || []);
              if (serp.competitorTitles) setCompetitorTitles(serp.competitorTitles);
            }
          } catch (e) {
            console.error('Failed to parse saved article JSON in selectedArticleId effect:', e);
          }
        }
      }
    }
  }, [selectedArticleId, inputType, savedArticles]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { if (typeof ev.target?.result === 'string') setPastedText(ev.target.result); };
    reader.readAsText(file);
  };

  const handleStartAnalysis = async () => {
    let sourceText = '';
    if (inputType === 'paste') {
      sourceText = pastedText;
    } else {
      const art = savedArticles.find(a => a.id === selectedArticleId);
      if (art) sourceText = articleToMarkdown(art);
    }
    if (!sourceText.trim()) { alert('Please provide the text to analyze.'); return; }

    setPhase('evaluating');
    setErrorMsg('');

    // 1. Fetch Target Keyword Data (SERP NLP) if provided
    if (targetKeyword.trim()) {
      setStatusMsg('Extracting SERP Data...');
      try {
        const serpRes = await fetch('/api/serp-extract', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword: targetKeyword }),
        });
        const serpText = await serpRes.text();
        for (const line of serpText.split('\n').filter(l => l.startsWith('data: '))) {
          const parsed = JSON.parse(line.slice(6));
          if (parsed.type === 'stage') {
            setStatusMsg(`Extracting SERP: ${parsed.label}`);
          }
          if (parsed.type === 'done' && parsed.data) {
            setSerpAnalysis(parsed.data);
            setSerpTerms(parsed.data.terms || []);
            setSerpEntities(parsed.data.entities || []);
            setSerpMedianWordCount(parsed.data.medianWordCount || 0);
            setSerpMedianTitleLength(parsed.data.medianTitleLength || 0);
            setSerpMedianH2Count(parsed.data.medianH2Count || 0);
            setSerpTopTermsForIntent(parsed.data.topTermsForIntent || []);
            if (parsed.data.competitorTitles) setCompetitorTitles(parsed.data.competitorTitles);
            break;
          }
        }
      } catch (e) { console.error('SERP extraction failed', e); }
    }

    setStatusMsg('Extracting Reference Context...');

    let refContext = '';
    let refRawText = '';
    let refRawHtml = '';
    if (referenceData?.metadata) {
      refRawText = referenceData.rawText || '';
      refRawHtml = referenceData.rawHtml || '';
      const topTerms = referenceData.advancedMetrics?.topTerms || [];
      refContext = [
        `Title: ${referenceData.metadata.title}`,
        referenceData.metadata.excerpt ? `Excerpt: ${referenceData.metadata.excerpt}` : '',
        topTerms.length > 0 ? `Top Keywords in Reference: ${topTerms.join(', ')}` : '',
        refRawText ? `Reference Article Content (first 4000 chars):\n${refRawText.slice(0, 4000)}` : '',
      ].filter(Boolean).join('\n');
    } else if (referenceUrl.trim()) {
      try {
        const extRes = await fetch('/api/extract', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: referenceUrl }),
        });
        const textData = await extRes.text();
        for (const line of textData.split('\n').filter(l => l.startsWith('data: '))) {
          const parsed = JSON.parse(line.slice(6));
          if (parsed.type === 'done' && parsed.data) {
            const d = parsed.data;
            refRawText = d.rawText || '';
            refRawHtml = d.rawHtml || '';
            const topTerms = d.advancedMetrics?.topTerms || [];
            refContext = [
              `Title: ${d.metadata.title}`,
              d.metadata.excerpt ? `Excerpt: ${d.metadata.excerpt}` : '',
              topTerms.length > 0 ? `Top Keywords in Reference: ${topTerms.join(', ')}` : '',
              refRawText ? `Reference Article Content (first 4000 chars):\n${refRawText.slice(0, 4000)}` : '',
            ].filter(Boolean).join('\n');
            setReferenceData(d);
            break;
          }
        }
      } catch { }
    }

    setStatusMsg('Running Weak Copy Analysis...');
    try {
      const masterKeywordsList = targetKeyword 
        ? targetKeyword.split(',').map(s => s.trim()).filter(Boolean)
        : blueprint?.targetKeywords
          ? blueprint.targetKeywords.split(',').map((s: string) => s.trim()).filter(Boolean)
          : [];

      const res = await fetch('/api/standalone-analysis', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: sourceText, 
          referenceContext: refContext, 
          refRawText, 
          refRawHtml,
          masterKeywords: masterKeywordsList,
          // serpContext is intentionally omitted here as the Detector relies on the sidecar's internal KeyBERT
          // without planning-phase PAA/Titles injection, though it degrades gracefully.
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAnalysisResults(data);
      setAnalysisText(sourceText);
      // If loaded from a saved article, track the id so Save Updates it
      if (inputType === 'saved' && selectedArticleId) {
        setSavedArticleId(selectedArticleId);
      } else {
        setSavedArticleId(null);
      }
      setPhase('results');
    } catch (e: any) {
      setErrorMsg(e.message || 'Analysis failed');
      setPhase('setup');
    }
  };

  // Dismiss a weak copy card with animation then remove from results
  const handleApplyFix = useCallback((i: number, phrase: string, improvement: string) => {
    editorRef.current?.applyFix(phrase, improvement);
    setDismissingSet(prev => new Set(prev).add(i));
    setTimeout(() => {
      setAnalysisResults(prev => {
        if (!prev) return prev;
        const newItems = prev.weakCopyItems.filter((_, idx) => idx !== i);
        return { ...prev, weakCopyItems: newItems };
      });
      setDismissingSet(prev => { const n = new Set(prev); n.delete(i); return n; });
    }, 380);
  }, []);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    setSaveToast('idle');
    try {
      const title =
        blueprint?.h1_tag ||
        blueprint?.title_tag ||
        (savedArticles.find(a => a.id === savedArticleId)?.title) ||
        'Untitled Draft';
      const articlePayload: Article = {
        title,
        content: analysisText,
        folder: 'Detector',
        stage: 'Draft',
        ...(savedArticleId ? { id: savedArticleId } : {}),
      };
      const newId = await saveArticle(articlePayload);
      setSavedArticleId(newId);
      setSaveToast('saved');
      // Refresh saved articles list so the new entry shows in dropdowns
      getArticles().then(setSavedArticles).catch(console.error);
      setTimeout(() => setSaveToast('idle'), 3000);
    } catch (e) {
      console.error('Save failed', e);
      setSaveToast('error');
      setTimeout(() => setSaveToast('idle'), 3500);
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, blueprint, savedArticleId, savedArticles, analysisText]);

  // ── Comparison metrics (memoised) ──────────────────────────────────────────

  const genMetrics = (() => {
    if (!analysisText) return null;
    const m = computeGeneratedMetrics(analysisText, blueprint?.sections || []);
    const h2Count = (analysisText.match(/^## /gm) || []).length;
    const h3Count = (analysisText.match(/^### /gm) || []).length;
    const ytCount = countYouTubeLinks(analysisText);
    return { ...m, h2Count, h3Count, ytCount };
  })();

  const refM = referenceData?.advancedMetrics || {};
  const refSeo = referenceData?.seo || {};
  const refText: string = referenceData?.rawText || '';

  // ── SEO Content Score ───────────────────────────────────────────
  const contentScore: ContentScoreResult | null = useMemo(() => {
    if (!analysisText || !serpTerms?.length) return null;
    const textTokens = analysisText.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w: string) => w.length > 2);
    const sentences = splitIntoSentences(analysisText);
    const draftClean = analysisText.toLowerCase();

    const liveTerms = serpTerms.map((term: any) => {
      let count = 0;
      const termLower = term.term.toLowerCase();
      if (!termLower.includes(' ')) {
        const rootLower = term.rootForm || termLower;
        count = textTokens.filter((t: string) => t === termLower || t === rootLower).length;
      } else {
        const regex = new RegExp(`\\b${termLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        const m = analysisText.match(regex);
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
    const headings = (analysisText.match(/^## .+/gm) || []).map((l: string) => l.replace(/^## /, ''));
    const entities = referenceData?.serpEntities || referenceData?.entities || [];
    const topTerms = serpTerms.slice(0, 30).map((t: any) => (t.rootForm || t.term).toLowerCase());
    const median = referenceData?.advancedMetrics || {};
    return computeStructuredScore({
      textContext: analysisText,
      title: blueprint?.title || blueprint?.h1_tag || '',
      headings,
      liveTerms,
      entities,
      topTermsForIntent: topTerms,
      medianWordCount: median.wordCount || 0,
      medianTitleLength: median.titleLength || 0,
      medianH2Count: median.h2Count || 0,
      contentGapReport: referenceData?.contentGapReport,
      headingFrequency: serpAnalysis?.headingFrequency || referenceData?.headingFrequency,
      topicClusters: serpAnalysis?.topicClusters || referenceData?.topicClusters,
      paaQuestions: serpAnalysis?.paaQuestions || referenceData?.paaQuestions,
      medianLexicalDiversity: serpAnalysis?.medianLexicalDiversity || referenceData?.medianLexicalDiversity || referenceData?.advancedMetrics?.medianLexicalDiversity || 0.35,
      featuredSnippetBlueprint: serpAnalysis?.featuredSnippetBlueprint || referenceData?.featuredSnippetBlueprint || blueprint?.featuredSnippetBlueprint,
    });
  }, [analysisText, serpTerms, referenceData, blueprint, serpAnalysis]);

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background text-foreground flex-1 overflow-hidden">
      {/* ── Main Content Area ──────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-y-auto w-full">
        {/* Results Header (If in results phase, we still need a floaty bar for Save) */}
        {phase === 'results' && (
          <div className="sticky top-0 z-40 w-full bg-white/80 backdrop-blur-md border-b px-8 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Scale className="w-5 h-5 text-indigo-600" />
              <span className="text-lg font-serif font-bold tracking-tight">Weak Copy Detection</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-bold transition-all shadow-sm ${saveToast === 'saved'
                  ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200'
                  }`}
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
                {saveToast === 'saved' ? 'Saved' : 'Save Analysis'}
              </button>
            </div>
          </div>
        )}

        <div className="max-w-7xl mx-auto w-full px-6 py-8">

          {/* ── Setup Phase ── */}
          {phase === 'setup' && (
            <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
              <div className="text-center space-y-2 mb-10">
                <h1 className="text-[30px] font-serif font-light text-primary tracking-tight">Weak Copy Detector</h1>
                <p className="text-muted-foreground text-[13px] font-light">Refine your content with semantic precision and SEO signals.</p>
              </div>
              <Card className="rounded-[2.5rem] border-border/50 shadow-xl shadow-black/5 bg-card/50 backdrop-blur-sm">
                <CardContent className="p-6 space-y-5">
                  {/* Source type selector */}
                  <div className="flex bg-sand rounded-full p-1 border border-stone-200 shadow-inner w-full">
                    {(['paste', 'saved'] as const).map(t => (
                      <button key={t} type="button" onClick={() => setInputType(t)}
                        className={`flex-1 py-2 text-[13px] rounded-full font-medium transition-all duration-300 ${inputType === t ? 'bg-white text-primary shadow-sm scale-105' : 'text-muted-foreground hover:text-primary'}`}>
                        {t === 'paste' ? '✍️ Paste / Upload' : '📁 From Dashboard'}
                      </button>
                    ))}
                  </div>

                  {inputType === 'saved' && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Select Article from Dashboard</label>
                      <div className="relative">
                        {/* Custom styled listbox replacing native <select> */}
                        <ArticleComboBox
                          articles={savedArticles}
                          value={selectedArticleId}
                          onChange={setSelectedArticleId}
                        />
                      </div>
                    </div>
                  )}

                  {inputType === 'paste' && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-end">
                        <label className="text-sm font-medium">Article Text</label>
                        <input type="file" accept=".txt,.md" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                          <UploadCloud className="w-4 h-4 mr-2" /> Upload .txt / .md
                        </Button>
                      </div>
                      <textarea
                        value={pastedText}
                        onChange={e => setPastedText(e.target.value)}
                        placeholder="Paste markdown or raw text here..."
                        className="w-full min-h-[200px] p-4 text-sm rounded-xl border bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  )}

                  {!referenceData && (
                    <div className="space-y-4 pt-4 border-t">
                      <div className="space-y-2">
                        <label className="text-sm font-medium flex items-center gap-2">
                          Target Keyword <span className="font-light text-[13px] font-normal">(optional)</span>
                        </label>
                        <Input placeholder="e.g. best ergonomic chairs" value={targetKeyword}
                          onChange={e => setTargetKeyword(e.target.value)} className="h-11 rounded-xl text-[13.5px] font-light" />
                        <p className="font-light text-[13px]">Extracts top Google results to build a semantic keyword model.</p>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium flex items-center gap-2">
                          Reference URL <span className="font-light text-[13px] font-normal">(optional)</span>
                        </label>
                        <Input placeholder="https://competitor.com/article" value={referenceUrl}
                          onChange={e => setReferenceUrl(e.target.value)} className="h-11 rounded-xl text-[13.5px] font-light" />
                        <p className="font-light text-[13px]">Compare metrics against this specific competitor URL.</p>
                      </div>
                    </div>
                  )}
                  {referenceData && (
                    <div className="pt-4 border-t">
                      <div className="p-3 bg-success-green/10 border border-emerald-100 rounded-xl text-sm flex items-center gap-2 text-success-green">
                        <CheckCircle2 className="w-4 h-4" /> Reference Data Loaded
                      </div>
                    </div>
                  )}
                  {errorMsg && (
                    <div className="p-4 bg-red-50 text-red-600 rounded-lg text-sm border border-red-100">{errorMsg}</div>
                  )}

                  <Button onClick={handleStartAnalysis}
                    className="w-full h-12 text-base font-bold rounded-xl bg-premium-blue hover:opacity-90 text-white shadow-xl shadow-blue-500/20"
                    disabled={inputType === 'paste' ? !pastedText.trim() : !selectedArticleId}>
                    <LayoutDashboard className="w-5 h-5 mr-2" /> Run Analysis
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Evaluating Phase ── */}
          {phase === 'evaluating' && (
            <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-6">
              <div className="w-16 h-16 bg-indigo-100 text-primary flex items-center justify-center rounded-2xl animate-bounce shadow-inner">
                <Search className="w-8 h-8" />
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-xl font-bold text-slate-800">Analysing Content…</h2>
                <p className="text-slate-500 text-sm flex items-center gap-2 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />{statusMsg}
                </p>
              </div>
            </div>
          )}

          {/* ── Results Phase ── */}
          {phase === 'results' && analysisResults && (
            <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-120px)] animate-in slide-in-from-bottom-8">

              {/* ── Sidebar ── */}
              {/* ── Sidebar ── */}
              <AnalysisResultsPanel
                contentScore={contentScore}
                analysisResults={analysisResults}
                serpTerms={serpTerms}
                serpEntities={serpEntities}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                serpTopTermsForIntent={serpTopTermsForIntent as any}
                serpMedianWordCount={serpMedianWordCount}
                serpMedianTitleLength={serpMedianTitleLength}
                serpMedianH2Count={serpMedianH2Count}
                intentClassification={intentClassification}
                intentAlignment={intentAlignment}
                referenceData={referenceData}
                blueprint={blueprint}
                genMetrics={genMetrics}
                refM={refM}
                refSeo={refSeo}
                refText={refText}
                competitorTitles={competitorTitles}
                serpAnalysis={serpAnalysis}
                analysisText={analysisText}
                pastedText={pastedText}
                setPastedText={setPastedText}
                targetKeyword={targetKeyword}
                selectedArticleId={selectedArticleId}
                savedArticles={savedArticles}
                onInsertTerm={(term) => editorRef.current?.insertTerm(term)}
                onHighlightWeakCopy={(phrase) => editorRef.current?.scrollToPhrase(phrase)}
                onApplyWeakCopyFix={(id, phrase, imp) => handleApplyFix(id as number, phrase, imp)}
                dismissingSet={dismissingSet}
                className="lg:w-[460px] shrink-0 rounded-[2rem] border border-border/50"
              >
                <div className="p-5 border-t bg-slate-50/80">
                  <Button variant="outline" className="w-full rounded-xl bg-white hover:bg-slate-100 text-slate-700 border-slate-200"
                    onClick={() => {
                      setPhase('setup');
                      setBlueprint(null);
                      setReferenceData(null);
                      setSerpTerms([]);
                      setSerpAnalysis(null);
                      setPastedText('');
                      setDismissingSet(new Set());
                    }}>
                    <FileText className="w-4 h-4 mr-2" /> Start New Scan
                  </Button>
                </div>
              </AnalysisResultsPanel>

              <div className="flex-1 overflow-y-auto h-full pr-1 pb-10">
                <SectionEditor
                  ref={editorRef}
                  markdown={analysisText}
                  highlights={analysisResults}
                  onSave={(newText) => setAnalysisText(newText)}
                  articleTitle={blueprint?.title || ''}
                  savedArticles={savedArticles}
                  documentId={selectedArticleId}
                  keywordBank={savedArticles.find(a => a.id === selectedArticleId)?.keywordBank}
                />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
