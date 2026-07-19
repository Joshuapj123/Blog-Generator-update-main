'use client';

import { BrainCircuit, Search, CheckCircle2, TrendingUp } from 'lucide-react';
import { useEngine } from '../../context/EngineContext';

export function AiKeywordResults() {
  const engine = useEngine();
  const appendKeyword = (kw: string) => {
    engine.setActiveKeyword(kw);
    engine.setTargetKeywords(kw);
  };

  if (!engine.aiKeywordResults.length) return null;

  return (
    <div className="mt-4 rounded-lg border border-border overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-[var(--color-indigo-50)] border-b border-border/50 flex items-center gap-2">
        <BrainCircuit className="w-3 h-3" /> AI Suggested Clusters
      </div>
      {engine.aiKeywordResults.map((k, i) => {
        const isSelected = engine.activeKeyword === k.keyword;
        return (
          <button
            key={i}
            type="button"
            onClick={() => appendKeyword(k.keyword)}
            className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-[var(--color-indigo-50)] transition-colors text-left border-b last:border-b-0 border-border/50 group ${
              isSelected ? 'bg-[var(--color-indigo-50)]' : ''
            }`}
          >
            <Search className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            <span className="text-xs text-foreground flex-1">{k.keyword}</span>
            <span className={`flex-shrink-0 px-1.5 py-0.5 text-[9px] font-bold rounded ${k.intent === 'primary' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-500'}`}>{k.intent}</span>
            {isSelected
              ? <CheckCircle2 className="w-3 h-3 text-indigo-600 flex-shrink-0" />
              : <CheckCircle2 className="w-3 h-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}
