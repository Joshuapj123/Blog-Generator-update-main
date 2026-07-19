'use client';
import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { SerpTerm, TermCategory } from '@/types/serp';
import { Sparkles, AlertCircle, Loader2, CheckCircle2, ArrowRight, BookOpen, Heading2, MousePointerClick } from 'lucide-react';
import { computeTermImpactScore } from '@/lib/content-scoring';
import { useEngine } from '../../context/EngineContext';
import { Editor } from '@tiptap/react';

export function SerpTermPanel({ editor }: { editor: Editor | null }) {
  const engine = useEngine();

  // ── Layer 1: Debounced text content for tracking ─────
  const [debouncedContent, setDebouncedContent] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editor) return;
    const updateContent = () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        setDebouncedContent(editor.getText() || '');
      }, 1000);
    };
    editor.on('update', updateContent);
    setDebouncedContent(editor.getText() || ''); // initial
    return () => { editor.off('update', updateContent); };
  }, [editor]);

  const textTokens = useMemo(() =>
    debouncedContent.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2),
    [debouncedContent]
  );

  const terms = engine.keywordBank?.terms || [];
  const topTermsForIntent = engine.analysisResults?.competitorCorpusStems || [];
  const intentSet = useMemo(() => new Set<string>(topTermsForIntent.map((t: string) => t.toLowerCase())), [topTermsForIntent]);

  // Live term stats — marks currentCount and overuse per term
  const liveTerms = useMemo(() => {
    return terms.map(term => {
      let count = 0;
      const termLower = term.term.toLowerCase();
      if (!termLower.includes(' ')) {
        const rootLower = ((term as any).rootForm || termLower);
        count = textTokens.filter(t => t === termLower || t === rootLower).length;
      } else {
        const regex = new RegExp(`\\b${termLower.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'gi');
        const m = debouncedContent.match(regex);
        count = m ? m.length : 0;
      }
      const density = textTokens.length > 0 ? count / textTokens.length : 0;
      return { 
        ...term, 
        currentCount: count, 
        overuseRisk: density > 0.03,
        category: ((term as any).category || 'basic') as TermCategory,
        recommendedMin: (term as any).recommendedMin || 1,
        recommendedMax: (term as any).recommendedMax || 5,
        docFrequency: (term as any).docFrequency || 0,
        competitorExamples: (term as any).competitorExamples || [],
        placements: (term as any).placements || ['body']
      } as unknown as SerpTerm & { currentCount: number; overuseRisk: boolean };
    });
  }, [terms, textTokens, debouncedContent]);

  const sortedLiveTerms = useMemo(() =>
    [...liveTerms].sort((a, b) => computeTermImpactScore(b, intentSet) - computeTermImpactScore(a, intentSet)),
    [liveTerms, intentSet]
  );

  const basicTerms = sortedLiveTerms.filter(t => t.category === 'basic');
  const supplementaryTerms = sortedLiveTerms.filter(t => t.category === 'supplementary');
  const contextualTerms = sortedLiveTerms.filter(t => t.category === 'contextual');

  // ── Layer 2 & 3: Contextual action card state ─────────────────────────────
  const [actionTerm, setActionTerm] = useState<(SerpTerm & { currentCount: number; overuseRisk: boolean }) | null>(null);
  const [actionPos, setActionPos] = useState<{ top: number; left: number } | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestedText, setSuggestedText] = useState<string | null>(null);
  const [rewritingIdx, setRewritingIdx] = useState<number | null>(null);
  const [rewrittenTexts, setRewrittenTexts] = useState<Record<string, string>>({});
  const actionCardRef = useRef<HTMLDivElement>(null);

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
        // If already met, just insert at cursor
        editor?.commands.insertContent(term.term);
        return;
      }
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const parentRect = (e.currentTarget as HTMLElement).closest('.serp-panel-root')?.getBoundingClientRect();
      setActionTerm(term);
      setActionPos({
        top: rect.bottom - (parentRect?.top ?? 0) + 8,
        left: Math.max(0, rect.left - (parentRect?.left ?? 0) - 100),
      });
      setSuggestedText(null);
    },
    [editor]
  );

  const handleJumpToBestSpot = () => {
    if (!editor || !actionTerm) return;
    
    // Find best paragraph logic (simple semantic keyword matching)
    // We will search editor nodes and find one that overlaps with actionTerm's words,
    // or just the longest paragraph.
    let bestPos = 0;
    let maxScore = -1;
    const termWords = actionTerm.term.toLowerCase().split(' ');

    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph') {
        const text = node.textContent.toLowerCase();
        let score = 0;
        for (const w of termWords) {
          if (text.includes(w)) score++;
        }
        if (score > maxScore || (score === maxScore && text.length > 100)) {
          maxScore = score;
          // Jump to end of paragraph
          bestPos = pos + node.nodeSize - 1;
        }
      }
      return true;
    });

    if (bestPos > 0) {
      editor.commands.setTextSelection(bestPos);
      editor.commands.scrollIntoView();
      editor.commands.insertContent(` ${actionTerm.term} `);
    } else {
      editor.commands.insertContent(actionTerm.term);
    }
    setActionTerm(null);
  };

  const handleSuggestSentence = async () => {
    if (!actionTerm || !editor) return;
    setIsSuggesting(true);
    setSuggestedText(null);
    try {
      const { from } = editor.state.selection;
      const nearby = editor.state.doc.textBetween(Math.max(0, from - 400), Math.min(editor.state.doc.content.size, from + 400), ' ');
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

  const handleRewrite = async (exampleText: string, idx: number) => {
    if (!actionTerm || !editor) return;
    setRewritingIdx(idx);
    try {
      const { from } = editor.state.selection;
      const nearby = editor.state.doc.textBetween(Math.max(0, from - 400), Math.min(editor.state.doc.content.size, from + 400), ' ');
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

  const handleInsertH2 = () => {
    if (!actionTerm || !editor) return;
    editor.chain().focus().insertContent(`<h2>${actionTerm.term.charAt(0).toUpperCase() + actionTerm.term.slice(1)}</h2><p></p>`).run();
    setActionTerm(null);
  };

  const TermChip = ({ term }: { term: SerpTerm & { currentCount: number; overuseRisk: boolean } }) => {
    const isMet = term.currentCount >= term.recommendedMin;
    const isOverused = term.overuseRisk;
    const impactScore = computeTermImpactScore(term, intentSet);

    let colorClass = 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50';
    if (isOverused) colorClass = 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100';
    else if (isMet) colorClass = 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100';

    return (
      <button
        onClick={(e) => handleTermClick(term, e)}
        className={`group relative flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all shadow-sm ${colorClass}`}
      >
        <span className="truncate max-w-[120px] flex items-center gap-1.5 font-bold">
          {term.term}
        </span>
        <div className="ml-2.5 flex items-center gap-1 opacity-90 font-mono">
          <span className={isMet ? 'text-emerald-600 font-bold' : isOverused ? 'text-red-600 font-bold' : 'text-slate-500'}>
            {term.currentCount}
          </span>
          <span className="text-[10px] opacity-40">/</span>
          <span className="opacity-80">{term.recommendedMin}–{term.recommendedMax}</span>
        </div>

        {/* Hover tooltip */}
        <div className="absolute hidden group-hover:block z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 w-64 p-3 bg-slate-900 text-slate-100 text-xs rounded-xl shadow-2xl border border-slate-700">
          <p className="font-semibold text-sm mb-1">{term.term}</p>
          <p className="text-slate-400 mb-1">Coverage: <span className="text-white">{Math.round(term.docFrequency * 100)}% of competitors</span></p>
          <p className="text-slate-400 mb-2">Impact Score: <span className="text-amber-300 font-bold">{impactScore}/100</span></p>

          {term.competitorExamples && term.competitorExamples.length > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-700 space-y-1 text-left">
              <p className="text-slate-500 font-medium uppercase tracking-wide text-[9px] mb-1">Used by competitors:</p>
              {term.competitorExamples.slice(0, 1).map((ex, i) => (
                <p key={i} className="text-slate-300 italic leading-relaxed text-[10px]">
                  "…{ex.text.length > 100 ? ex.text.slice(0, 100) + '…' : ex.text}"
                </p>
              ))}
            </div>
          )}

          {isOverused && <p className="text-red-400 font-medium flex items-center gap-1.5 mt-1.5"><AlertCircle className="w-3.5 h-3.5" />Overused!</p>}
          {!isMet && <p className="text-blue-400 font-medium mt-1.5 flex items-center gap-1.5"><MousePointerClick className="w-3.5 h-3.5" />Click for options</p>}
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-6 serp-panel-root relative pb-20">
      <div className="pb-2 border-b border-indigo-100 mb-4">
        <h3 className="font-bold text-indigo-900 flex items-center">
          Interactive Target Keywords
          <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-bold ml-2">
            {terms.length || 0}
          </span>
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Missing terms appear white. Click any missing term for injection and AI writing tools.
        </p>
      </div>

      <div className="space-y-5">
        {basicTerms.length > 0 && (
          <div>
            <h4 className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-2">Basic Terms</h4>
            <div className="flex flex-wrap gap-2">
              {basicTerms.map(t => <TermChip key={t.term} term={t} />)}
            </div>
          </div>
        )}

        {supplementaryTerms.length > 0 && (
          <div>
            <h4 className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-2">Supplementary Terms</h4>
            <div className="flex flex-wrap gap-2">
              {supplementaryTerms.map(t => <TermChip key={t.term} term={t} />)}
            </div>
          </div>
        )}

        {contextualTerms.length > 0 && (
          <div>
            <h4 className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-2">Contextual Details</h4>
            <div className="flex flex-wrap gap-2">
              {contextualTerms.map(t => <TermChip key={t.term} term={t} />)}
            </div>
          </div>
        )}
      </div>

      {actionTerm && actionPos && (
        <div
          ref={actionCardRef}
          className="fixed z-[100] w-[280px] bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden"
          style={{ top: actionPos.top, left: actionPos.left }}
        >
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">Action Menu</p>
            <p className="text-slate-800 font-black text-sm mt-0.5">"{actionTerm.term}"</p>
          </div>

          <div className="p-2 space-y-1">
            <button
              onClick={handleJumpToBestSpot}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors text-left group"
            >
              <div className="w-7 h-7 rounded-md bg-blue-50 flex items-center justify-center shrink-0 group-hover:bg-blue-100">
                <ArrowRight className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-700">Jump to best spot</p>
                <p className="text-[9px] text-slate-500">Inject in contextually relevant block</p>
              </div>
            </button>

            <button
              onClick={handleSuggestSentence}
              disabled={isSuggesting}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors text-left group disabled:opacity-50"
            >
              <div className="w-7 h-7 rounded-md bg-purple-50 flex items-center justify-center shrink-0 group-hover:bg-purple-100">
                {isSuggesting ? <Loader2 className="w-3.5 h-3.5 text-purple-600 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-purple-600" />}
              </div>
              <div>
                <p className="text-xs font-bold text-slate-700">Suggest a sentence</p>
                <p className="text-[9px] text-slate-500">Draft AI sentence for cursor location</p>
              </div>
            </button>

            {actionTerm.placements.includes('h2') && (
              <button
                onClick={handleInsertH2}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors text-left group"
              >
                <div className="w-7 h-7 rounded-md bg-emerald-50 flex items-center justify-center shrink-0 group-hover:bg-emerald-100">
                  <Heading2 className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-700">Insert as H2</p>
                  <p className="text-[9px] text-slate-500">Add heading at cursor</p>
                </div>
              </button>
            )}
          </div>

          {suggestedText && (
            <div className="px-3 pb-3 space-y-2">
              <div className="p-2.5 bg-purple-50 border border-purple-100 rounded-lg">
                <p className="text-[10px] text-purple-600 font-bold mb-1 flex items-center gap-1.5"><Sparkles className="w-3 h-3" />AI Suggestion</p>
                <p className="text-xs text-slate-700 leading-relaxed">"{suggestedText}"</p>
              </div>
              <button
                onClick={() => {
                  editor?.commands.insertContent(suggestedText);
                  setActionTerm(null);
                  setSuggestedText(null);
                }}
                className="w-full py-1.5 rounded-md bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-bold transition-colors"
              >
                ✓ Insert this sentence
              </button>
            </div>
          )}

          {actionTerm.competitorExamples && actionTerm.competitorExamples.length > 0 && !suggestedText && (
            <div className="px-3 pb-3 border-t border-slate-100 pt-2 space-y-2 max-h-[200px] overflow-y-auto">
              <p className="text-[9px] uppercase tracking-wide text-slate-400 font-bold flex items-center gap-1.5">
                <BookOpen className="w-3 h-3" />Competitor Examples
              </p>
              {actionTerm.competitorExamples.map((ex, i) => {
                const key = `${actionTerm.term}_${i}`;
                const rewritten = rewrittenTexts[key];
                return (
                  <div key={i} className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg space-y-2">
                    <p className="text-[10px] text-slate-600 leading-relaxed italic">
                      "{ex.text.length > 100 ? ex.text.slice(0, 100) + '…' : ex.text}"
                    </p>
                    {rewritten ? (
                      <div className="space-y-1.5">
                        <p className="text-[10px] text-emerald-700 bg-emerald-50 p-1.5 rounded leading-relaxed italic border border-emerald-100">✓ "{rewritten}"</p>
                        <button
                          onClick={() => { editor?.commands.insertContent(rewritten); setActionTerm(null); }}
                          className="text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-2 py-1 rounded w-full transition-colors"
                        >
                          Insert
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleRewrite(ex.text, i)}
                        disabled={rewritingIdx === i}
                        className="flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-indigo-600 transition-colors"
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
