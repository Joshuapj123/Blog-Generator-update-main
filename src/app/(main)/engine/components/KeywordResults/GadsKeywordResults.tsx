'use client';

import { BarChart2, Plus, Sparkles, Loader2, Database, Search } from 'lucide-react';
import { useEngine } from '../../context/EngineContext';
import { useEngineHandlers } from '../../hooks/useEngineHandlers';
import { Button } from '@/components/ui/button';

export function GadsKeywordResults() {
  const engine = useEngine();
  const { appendKeyword, handleEnhanceWithAi } = useEngineHandlers();

  if (!engine.gadsKeywordResults.length) return null;

  return (
    <div className="mt-4 rounded-lg border border-border overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-[var(--color-indigo-50)] border-b border-border/50 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <Database className="w-3 h-3" /> {engine.gadsIsSimulated ? 'Simulated' : 'Live'} Google Ads Planner Data
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleEnhanceWithAi}
          disabled={engine.isEnhancingWithAi}
          className="h-5 text-[9px] font-bold uppercase tracking-widest text-primary hover:bg-primary/5 gap-1"
        >
          {engine.isEnhancingWithAi ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Sparkles className="w-2.5 h-2.5" />}
          Enhance with Long-Tail
        </Button>
      </div>
      {engine.gadsKeywordResults.map((k, i) => (
        <button
          key={i}
          type="button"
          onClick={() => appendKeyword(k.keyword)}
          className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-[var(--color-indigo-50)] transition-colors text-left border-b last:border-b-0 border-border/50 group ${k.isEnhanced ? 'bg-indigo-50/30' : ''}`}
        >
          <BarChart2 className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="text-xs text-foreground block">{k.keyword}</span>
            <span className="text-[10px] text-muted-foreground">{k.avgMonthlySearches} vol · Comp: {k.competition}</span>
          </span>
          <span className={`flex-shrink-0 px-1.5 py-0.5 text-[9px] font-bold rounded ${k.intent === 'long-tail' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-500'}`}>{k.intent || 'target'}</span>
          <Plus className="w-3 h-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
        </button>
      ))}
    </div>
  );
}
