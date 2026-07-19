'use client';

import {
  Zap,
  BrainCircuit,
  Database,
  Search,
  KeyRound,
  CheckCircle2,
  Loader2,
  Sparkles,
  BarChart2,
  ChevronRight,
  ArrowRight,
  MoreHorizontal,
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useEngine } from '../../context/EngineContext';
import { useEngineHandlers } from '../../hooks/useEngineHandlers';
import { AiKeywordResults } from '../KeywordResults/AiKeywordResults';
import { GadsKeywordResults } from '../KeywordResults/GadsKeywordResults';
import { SerperKeywordResults } from '../KeywordResults/SerperKeywordResults';

export function StepTopicKeywords() {
  const engine = useEngine();
  const { handleSuggestKeywords, handleEnhanceWithAi } = useEngineHandlers();
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const modeMenuRef = useRef<HTMLDivElement>(null);

  // Default to 'serper' on first mount if still on the library default 'ai'
  useEffect(() => {
    if (engine.keywordMode === 'ai') engine.setKeywordMode('serper');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modeMenuRef.current && !modeMenuRef.current.contains(e.target as Node)) {
        setModeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const KEYWORD_MODES = [
    {
      id: 'serper' as const,
      label: 'Live SERP',
      icon: Search,
      description: 'Extracts keyword opportunities from the current Google SERP for your topic — real data, zero fabrication.',
    },
    {
      id: 'ai' as const,
      label: 'AI-Powered',
      icon: BrainCircuit,
      description: 'Uses competitor blog patterns, semantic expansion, and search intent analysis.',
    },
    {
      id: 'google' as const,
      label: 'Google Ads',
      icon: Database,
      description: 'Returns volume ranges, competition level, and CPC estimates from Keyword Planner data.',
    },
  ];

  const activeMode = KEYWORD_MODES.find((m) => m.id === engine.keywordMode) ?? KEYWORD_MODES[0];

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Campaign Mode Toggle */}
      <div className="pb-8 border-b">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-[14px] font-serif font-bold text-slate-800">Campaign Type</h2>
              <p className="text-[12px] text-muted-foreground font-light max-w-sm">Are you writing for your own blog or a guest pitch?</p>
            </div>
          </div>

          <div className="flex p-1 bg-sand rounded-full shadow-inner border border-stone-200 shrink-0">
            {(['own_blog', 'guest_post'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => engine.setCampaignMode(mode)}
                className={`
              px-4 py-1.5 rounded-full text-[12px] font-semibold transition-all duration-300
              ${engine.campaignMode === mode
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-muted-foreground hover:text-primary'
                  }
            `}
              >
                {mode === 'own_blog' ? 'Own Blog' : 'Guest Post Pitch'}
              </button>
            ))}
          </div>
        </div>

        {engine.campaignMode === 'guest_post' && (
          <div className="grid grid-cols-2 gap-6 pt-2 animate-in fade-in zoom-in-95 duration-200">
            <div>
              <h2 className="text-[15px] font-serif font-light mb-1">Target Backlink URL</h2>
              <p className="text-[13px] text-muted-foreground font-light mb-2">The link you want to organically insert.</p>
              <input
                placeholder="https://your-site.com/feature"
                value={engine.guestPostBacklinkUrl}
                onChange={(e) => engine.setGuestPostBacklinkUrl(e.target.value)}
                className="bg-background h-10 text-[13.5px] font-light rounded-lg border w-full px-3 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <h2 className="text-[15px] font-serif font-light mb-1">Target Publication</h2>
              <p className="text-[13px] text-muted-foreground font-light mb-2">Where are you pitching this?</p>
              <input
                placeholder="e.g. HubSpot Blog"
                value={engine.guestPostTargetPublication}
                onChange={(e) => engine.setGuestPostTargetPublication(e.target.value)}
                className="bg-background h-10 text-[13.5px] font-light rounded-lg border w-full px-3 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-6 p-8 rounded-lg border bg-white shadow-sm">
        <div>
          <h2 className="text-3xl font-serif font-bold mb-2 tracking-tight">Topic &amp; Title</h2>
          <p className="text-sm text-muted-foreground mb-6">Start with what you want to write about.</p>

          {engine.todoArticles.length > 0 && (
            <div className="mb-5 border-b pb-5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Load a Saved Idea</label>
              <select
                className="w-full text-sm p-3 px-4 rounded-lg border bg-background text-foreground h-12 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all cursor-pointer"
                value={engine.selectedTodoIdea}
                onChange={(e) => {
                  const val = e.target.value;
                  engine.setSelectedTodoIdea(val);
                  if (val) {
                    const mapped = engine.todoArticles.find(a => a.id === val);
                    if (mapped && mapped.content) {
                      const parsed = JSON.parse(mapped.content);
                      if (parsed.topicIdea) {
                        engine.setTitle(parsed.topicIdea.title);
                        engine.setTargetKeywords(parsed.topicIdea.keywords);
                        engine.setActiveKeyword(parsed.topicIdea.keywords.split(',')[0].trim());
                      }
                      if (mapped.planRole) {
                        engine.setPlanRole(mapped.planRole);
                      } else {
                        engine.setPlanRole(null);
                      }
                      engine.setStrategyTargetKeywords(mapped.targetKeywords || []);
                      if (mapped.keywordBank) {
                        engine.setKeywordBank(mapped.keywordBank);
                      }
                    }
                  } else {
                    engine.setTitle('');
                    engine.setActiveKeyword('');
                    engine.setTargetKeywords('');
                    engine.setCurrentArticleId(null);
                    engine.setPlanRole(null);
                    engine.setStrategyTargetKeywords([]);
                    engine.setReferenceUrl('');
                    engine.setReferenceData(null);
                    engine.setShowKeywordResults(false);
                    engine.setAiKeywordResults([]);
                    engine.setGadsKeywordResults([]);
                    engine.setSerperKeywordResults([]);
                    engine.setTiptapContent('');
                    engine.setIsGenerated(false);
                    engine.setBlueprint(null);
                    engine.setSections([]);
                    engine.setKeywordBank(null);
                  }
                }}
              >
                <option value="">-- Start from scratch --</option>
                <optgroup label="Strategy Plans">
                  {engine.todoArticles.filter(a => a.planId).map(a => (
                    <option key={a.id} value={a.id}>
                      {a.planRole === 'primary' ? '★ Money Page: ' : '↳ Support: '} {a.title}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Saved Ideas">
                  {engine.todoArticles.filter(a => !a.planId).map(a => (
                    <option key={a.id} value={a.id}>{a.title} {a.folder ? `(${a.folder})` : ''}</option>
                  ))}
                </optgroup>
              </select>
              {engine.planRole && (
                <div className={`mt-2 p-2 rounded-md border text-xs flex items-start gap-1.5 ${engine.planRole === 'primary' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
                  <span className="font-bold">{engine.planRole === 'primary' ? 'Core Money Page Focus' : 'Supporting Cluster Focus'}:</span>
                  <span>{engine.planRole === 'primary' ? 'The AI will optimize this piece as a high-intent conversion pillar page.' : 'The AI will optimize this piece for informational topical authority and natural internal linking.'}</span>
                </div>
              )}
            </div>
          )}
          
          {!engine.selectedTodoIdea && (
            <div className="mt-4">
              <label className="text-[11px] font-bold uppercase tracking-wider text-primary mb-2 block">Article Title</label>
              <input
                placeholder="e.g. 10 Content Marketing Trends for 2026"
                value={engine.title}
                onChange={(e) => engine.setTitle(e.target.value)}
                disabled={engine.isRunning}
                className="bg-background border text-base h-10 rounded-lg text-[13.5px] font-light w-full px-3 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          )}
        </div>
      </div>

      <div className="space-y-6 p-5 rounded-lg border bg-white">
        <div>
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-medium text-sm mb-0.5">Primary Keyword</div>
              <div className="font-light text-[13px] text-muted-foreground">
                {!!engine.selectedTodoIdea
                  ? 'The single keyword driving this article — used for SERP analysis and outline.'
                  : 'One primary keyword per article. Drives SERP fetch and outline generation.'}
              </div>
            </div>

            {/* ⋯ mode selector */}
            <div className="relative shrink-0" ref={modeMenuRef}>
              <button
                type="button"
                onClick={() => setModeMenuOpen((o) => !o)}
                title={`Keyword source: ${activeMode.label}`}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 text-[11px] font-semibold transition-colors"
              >
                <activeMode.icon className="w-3.5 h-3.5" />
                {activeMode.label}
                <MoreHorizontal className="w-3.5 h-3.5 opacity-50" />
              </button>

              {modeMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 z-50 bg-white border border-slate-200 rounded-xl shadow-xl shadow-black/10 p-1 w-52 animate-in fade-in zoom-in-95 duration-150">
                  {KEYWORD_MODES.map((mode) => {
                    const Icon = mode.icon;
                    const isActive = engine.keywordMode === mode.id;
                    return (
                      <div key={mode.id} className="relative group">
                        <button
                          type="button"
                          onClick={() => {
                            engine.setKeywordMode(mode.id);
                            engine.setShowKeywordResults(false);
                            setModeMenuOpen(false);
                          }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                            isActive
                              ? 'bg-indigo-50 text-indigo-700 font-semibold'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <Icon className="w-4 h-4 shrink-0" />
                          {mode.label}
                          {isActive && <CheckCircle2 className="w-3.5 h-3.5 ml-auto text-indigo-500" />}
                        </button>
                        {/* Tooltip */}
                        <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 w-52 px-3 py-2 bg-slate-900 text-white text-[11px] leading-relaxed rounded-xl shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                          {mode.description}
                          <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Single keyword input — always shown */}
        <div className="flex items-center gap-2">
          <input
            placeholder="e.g. best seo tools 2025"
            value={engine.activeKeyword || ''}
            onChange={(e) => {
              engine.setActiveKeyword(e.target.value);
              engine.setTargetKeywords(e.target.value);
            }}
            disabled={engine.isRunning}
            className="bg-background border text-sm h-10 rounded-lg px-3 outline-none focus:ring-2 focus:ring-primary/20 w-full"
          />
        </div>

        {/* Explore more keywords helper invocation */}
        {(() => {
          const renderExploreKeywords = () => (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  placeholder="content marketing, SEO strategy, digital trends…"
                  value={engine.targetKeywords}
                  onChange={(e) => engine.setTargetKeywords(e.target.value)}
                  disabled={engine.isRunning}
                  className="bg-background border text-sm h-10 rounded-lg px-3 outline-none focus:ring-2 focus:ring-primary/20 w-full"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleSuggestKeywords}
                  disabled={!engine.title || engine.isSuggestingKeywords || engine.isRunning}
                  className="h-10 px-3 shrink-0 gap-1.5 text-xs border-primary/40 text-primary hover:bg-primary/10"
                >
                  {engine.isSuggestingKeywords ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : engine.keywordMode === 'ai' ? (
                    <Sparkles className="w-3.5 h-3.5" />
                  ) : (
                    <BarChart2 className="w-3.5 h-3.5" />
                  )}
                  {engine.isSuggestingKeywords ? 'Analyzing…' : 'Suggest'}
                </Button>
              </div>

              {/* Google Ads connect banner — only when that mode is active */}
              {engine.keywordMode === 'google' && (
                <div className="flex items-center gap-2 px-1">
                  <button
                    type="button"
                    onClick={() => engine.setShowGadsModal(true)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-all duration-200 ${
                      engine.gadsConnected
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'border-dashed border-primary/50 bg-[var(--color-indigo-50)] text-primary hover:bg-primary/10'
                    }`}
                  >
                    <KeyRound className="w-3.5 h-3.5 shrink-0" />
                    {engine.gadsConnected ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" /> Google Ads Connected — Edit
                      </>
                    ) : (
                      <>Integrate Google Ads Account</>
                    )}
                  </button>
                  {!engine.gadsConnected && (
                    <span className="text-[10px] text-muted-foreground italic">(currently using AI simulation)</span>
                  )}
                </div>
              )}
            </div>
          );

          return engine.selectedTodoIdea ? (
            <details className="mt-4 border-t pt-4 group">
              <summary className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 cursor-pointer hover:text-primary list-none flex items-center gap-1 select-none">
                <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
                Explore more keywords
              </summary>
              <div className="mt-3">
                {renderExploreKeywords()}
              </div>
            </details>
          ) : (
            <div className="mt-4 space-y-3 border-t pt-4">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 block">
                Explore more keywords
              </label>
              {renderExploreKeywords()}
            </div>
          );
        })()}

        {engine.showKeywordResults && (
          <>
            <AiKeywordResults />
            <GadsKeywordResults />
            <SerperKeywordResults />
          </>
        )}

        {engine.strategyTargetKeywords.length > 0 && (
          <div className="pt-3 border-t mt-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center justify-between">
              <span>Master Strategy Keywords </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {engine.strategyTargetKeywords.map((kw, i) => {
                const isSelected = engine.activeKeyword?.toLowerCase() === kw.toLowerCase();
                return (
                  <button
                    key={i}
                    type="button"
                    title={isSelected ? 'Currently selected' : 'Click to set as primary keyword'}
                    disabled={isSelected}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors border ${
                      isSelected
                        ? 'bg-fuchsia-50/50 text-fuchsia-700/50 border-fuchsia-200/50 cursor-not-allowed'
                        : 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 hover:bg-fuchsia-100'
                    }`}
                    onClick={() => {
                      if (!isSelected) {
                        engine.setActiveKeyword(kw);
                        engine.setTargetKeywords(kw);
                      }
                    }}
                  >
                    <CheckCircle2 className="w-3 h-3" /> {kw}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* AI/Google Ads/Serper Results Panels would go here or in sub-components */}
      {/* For brevity and better split, I'll keep them here for now but they can be further split */}

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() => {
            engine.setCurrentStep(1);
          }}
          disabled={!engine.title || !engine.activeKeyword}
          className="gap-2 bg-premium-blue hover:opacity-90 shadow-blue-500/20"
        >
          Next: SERP Results <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
