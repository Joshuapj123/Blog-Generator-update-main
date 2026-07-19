'use client';

import { useEffect } from 'react';
import {
  Search,
  Loader2,
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  CheckCircle2,
  Sparkles,
  Globe,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEngine } from '../../context/EngineContext';
import { useEngineHandlers } from '../../hooks/useEngineHandlers';
import { SerpPreviewResult } from '../../context/EngineContext';

const FORMAT_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  'Listicle':    { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200' },
  'How-To':      { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200'   },
  'Guide':       { bg: 'bg-sky-50',     text: 'text-sky-700',     border: 'border-sky-200'    },
  'Comparison':  { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200'  },
  'Review':      { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200'},
  'Landing Page':{ bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200'   },
};

function getFormatStyle(fmt?: string) {
  return FORMAT_STYLES[fmt ?? ''] ?? { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' };
}

function getDomain(url: string) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

export function StepSerpResults() {
  const engine = useEngine();
  const { handleFetchSerpPreview } = useEngineHandlers();

  // Auto-fetch when the step mounts (or when keyword changes and no results yet)
  useEffect(() => {
    if (engine.activeKeyword && engine.serpPreviewResults.length === 0 && !engine.isFetchingSerpPreview) {
      handleFetchSerpPreview();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.activeKeyword]);

  const handleSelectResult = (result: SerpPreviewResult) => {
    engine.setSelectedSerpResult(result);
    engine.setReferenceUrl(result.link);
  };

  const handleNext = () => {
    // The unified pipeline in StepExtraction will handle SERP extraction automatically.
    engine.setCurrentStep(2);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Header */}
      <div className="p-6 rounded-xl border bg-white shadow-sm">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
            <Search className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-2xl font-serif font-bold tracking-tight">SERP Results</h2>
            <p className="text-sm text-muted-foreground">
              Top organic results for{' '}
              <span className="font-semibold text-indigo-600">"{engine.activeKeyword}"</span>
              . Select one as your structural reference.
            </p>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {engine.isFetchingSerpPreview && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 rounded-xl border bg-white">
          <div className="relative">
            <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center">
              <Search className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-white flex items-center justify-center">
              <Loader2 className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
            </div>
          </div>
          <div className="text-sm font-medium text-slate-600">Fetching SERP data…</div>
          <div className="text-xs text-muted-foreground">Pulling top 10 results + detecting formats</div>
        </div>
      )}

      {/* Results Panel */}
      {!engine.isFetchingSerpPreview && engine.serpPreviewResults.length > 0 && (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          {/* Panel header */}
          <div className="px-5 py-3 bg-slate-50 border-b flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              Organic Results — {engine.serpPreviewResults.length} found
            </span>
            <button
              type="button"
              onClick={() => handleFetchSerpPreview()}
              className="text-[11px] text-indigo-500 hover:text-indigo-700 font-semibold flex items-center gap-1 transition-colors"
            >
              <Search className="w-3 h-3" /> Refresh
            </button>
          </div>

          <div className="divide-y">
            {engine.serpPreviewResults.map((result, i) => {
              const fmt = (result as any).detectedFormat;
              const isAiRec = (result as any).isAiRecommended;
              const fmtStyle = getFormatStyle(fmt);
              const isSelected = engine.selectedSerpResult?.link === result.link;

              return (
                <label
                  key={i}
                  className={`flex items-start gap-4 p-4 cursor-pointer transition-all group ${
                    isSelected
                      ? 'bg-indigo-50 border-l-4 border-l-indigo-500'
                      : 'hover:bg-slate-50/80 border-l-4 border-l-transparent'
                  }`}
                  onClick={() => handleSelectResult(result)}
                >
                  {/* Radio */}
                  <div className="mt-1 shrink-0">
                    <div
                      className={`w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center transition-all ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-500'
                          : 'border-slate-300 group-hover:border-indigo-300'
                      }`}
                    >
                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </div>

                  {/* Position badge */}
                  <div className="shrink-0 w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center mt-0.5">
                    <span className="text-[10px] font-black text-slate-500">#{result.position || i + 1}</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-0.5">
                      <div className="font-semibold text-sm text-slate-800 leading-snug line-clamp-2 flex-1">
                        {result.title}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isAiRec && (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-indigo-600 text-white text-[9px] font-bold uppercase tracking-wide">
                            <Sparkles className="w-2.5 h-2.5" /> AI Pick
                          </span>
                        )}
                        {fmt && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${fmtStyle.bg} ${fmtStyle.text} ${fmtStyle.border}`}
                          >
                            {fmt}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] text-emerald-700 font-medium mb-1">
                      <Globe className="w-3 h-3 shrink-0" />
                      <span className="truncate">{getDomain(result.link)}</span>
                      <a
                        href={result.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-slate-400 hover:text-indigo-500 transition-colors ml-0.5"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                      {result.snippet}
                    </p>
                  </div>

                  {isSelected && (
                    <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0 mt-1" />
                  )}
                </label>
              );
            })}
          </div>

          {/* Selection summary */}
          {engine.selectedSerpResult && (
            <div className="px-5 py-3 bg-indigo-50 border-t border-indigo-100 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
              <span className="text-xs text-indigo-700 font-medium flex-1 truncate">
                Reference set:{' '}
                <span className="font-bold">{getDomain(engine.selectedSerpResult.link)}</span>
                {' — '}
                <span className="opacity-70">{engine.selectedSerpResult.title}</span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Empty / no-keyword state */}
      {!engine.isFetchingSerpPreview && engine.serpPreviewResults.length === 0 && !engine.activeKeyword && (
        <div className="flex flex-col items-center gap-2 py-12 rounded-xl border bg-white text-center">
          <AlertCircle className="w-8 h-8 text-amber-400" />
          <div className="text-sm font-semibold text-slate-600">No keyword set</div>
          <p className="text-xs text-muted-foreground max-w-xs">
            Go back and enter a primary keyword to fetch SERP results.
          </p>
        </div>
      )}

      {/* No results after fetch */}
      {!engine.isFetchingSerpPreview && engine.serpPreviewResults.length === 0 && !!engine.activeKeyword && (
        <div className="flex flex-col items-center gap-3 py-12 rounded-xl border bg-white text-center">
          <Search className="w-8 h-8 text-slate-300" />
          <div className="text-sm font-semibold text-slate-500">No results returned</div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => handleFetchSerpPreview()}
            className="gap-1.5"
          >
            <Search className="w-3.5 h-3.5" /> Try Again
          </Button>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={() => engine.setCurrentStep(0)}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <Button
          type="button"
          onClick={handleNext}
          disabled={engine.isFetchingSerpPreview}
          className="gap-2 bg-premium-blue hover:opacity-90 shadow-blue-500/20"
        >
          {engine.selectedSerpResult
            ? 'Extract Reference & Continue'
            : 'Skip — Continue without Reference'}
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
