'use client';

import { Search, Plus, TrendingUp } from 'lucide-react';
import { useEngine } from '../../context/EngineContext';
import { useEngineHandlers } from '../../hooks/useEngineHandlers';

export function SerperKeywordResults() {
  const engine = useEngine();
  const { appendKeyword } = useEngineHandlers();

  if (!engine.serperKeywordResults.length) return null;

  return (
    <div className="mt-4 rounded-lg border border-border overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300 bg-white">
      {/* Related Questions */}
      {engine.serperKeywordResults.filter(k => k.source === 'paa_question').length > 0 && (
        <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-[var(--color-indigo-50)] border-b border-border/50">
          🙋 People Also Ask
        </div>
      )}
      {engine.serperKeywordResults.filter(k => k.source === 'paa_question').map((k, i) => (
        <button
          key={`serper-paa-${i}`}
          type="button"
          onClick={() => appendKeyword(k.keyword)}
          className="w-full flex items-start gap-3 px-3 py-2 hover:bg-[var(--color-indigo-50)] transition-colors text-left border-b last:border-b-0 border-border/50 group"
        >
          <span className="flex-shrink-0 mt-0.5 px-1.5 py-0.5 text-[9px] font-bold rounded bg-secondary text-muted-foreground">Q</span>
          <span className="flex-1 min-w-0">
            <span className="text-xs text-foreground block">{k.keyword}</span>
            {k.snippet && (
              <span className="text-[10px] text-muted-foreground line-clamp-1">{k.snippet}</span>
            )}
          </span>
          <span className="flex-shrink-0 self-center px-1.5 py-0.5 text-[9px] font-bold rounded bg-secondary text-muted-foreground border border-border/50">long-tail</span>
          <Plus className="w-3 h-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 self-center" />
        </button>
      ))}

      {/* Related Searches */}
      {engine.serperKeywordResults.filter(k => k.source === 'related_search').length > 0 && (
        <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-[var(--color-indigo-50)] border-b border-border/50">
          🔗 Related Searches
        </div>
      )}
      {engine.serperKeywordResults.filter(k => k.source === 'related_search').map((k, i) => (
        <button
          key={`serper-related-${i}`}
          type="button"
          onClick={() => appendKeyword(k.keyword)}
          className="w-full flex items-center gap-3 px-3 py-2 hover:bg-[var(--color-indigo-50)] transition-colors text-left border-b last:border-b-0 border-border/50 group"
        >
          <TrendingUp className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          <span className="text-xs text-foreground flex-1">{k.keyword}</span>
          <span className={`flex-shrink-0 px-1.5 py-0.5 text-[9px] font-bold rounded ${k.searchIntent === 'informational' ? 'bg-sky-50 text-sky-600' :
            k.searchIntent === 'commercial' ? 'bg-orange-50 text-orange-600' :
              k.searchIntent === 'transactional' ? 'bg-rose-50 text-rose-600' :
                'bg-gray-50 text-gray-500'
            }`}>{k.searchIntent}</span>
          <Plus className="w-3 h-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
        </button>
      ))}

      <div className="px-3 py-2 text-[10px] text-muted-foreground border-t border-border/50 flex items-center gap-1 bg-[var(--color-indigo-50)]">
        <Search className="w-2.5 h-2.5 text-primary" />
        Real data from Google SERP via Serper API · Click any row to add to Target Keywords
      </div>
    </div>
  );
}
