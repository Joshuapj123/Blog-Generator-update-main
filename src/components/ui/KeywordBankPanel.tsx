import { useState, useMemo } from 'react';
import { KeywordBank, KeywordBankTerm } from '@/types/article';
import { ChevronDown, ChevronUp, Pin, Trash2, Plus, Edit2, Check, X } from 'lucide-react';
import { Button } from './button';
import { Input } from './input';

export function KeywordBankPanel({
  bank,
  onUpdateBank,
}: {
  bank: KeywordBank | null;
  onUpdateBank: (bank: KeywordBank) => void;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [sortBy, setSortBy] = useState<'frequency' | 'source' | 'usage' | 'alphabetical'>('frequency');
  const [filterBy, setFilterBy] = useState<'all' | 'serp' | 'curated' | 'manual' | 'used' | 'unused'>('all');
  const [isAdding, setIsAdding] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState('');

  const displayedTerms = useMemo(() => {
    if (!bank) return [];
    
    let filtered = bank.terms.filter(t => t.status === 'active');
    
    switch (filterBy) {
      case 'serp': filtered = filtered.filter(t => t.source === 'serp_competitor'); break;
      case 'curated': filtered = filtered.filter(t => t.source === 'curated_reference'); break;
      case 'manual': filtered = filtered.filter(t => t.source === 'manual'); break;
      case 'used': filtered = filtered.filter(t => t.usageContext.inOutline || t.usageContext.inSections.length > 0 || t.usageContext.inInlineEdit); break;
      case 'unused': filtered = filtered.filter(t => !t.usageContext.inOutline && t.usageContext.inSections.length === 0 && !t.usageContext.inInlineEdit); break;
    }

    filtered.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      
      switch (sortBy) {
        case 'frequency':
          const freqA = a.competitorFrequency ?? 0;
          const freqB = b.competitorFrequency ?? 0;
          return freqB - freqA;
        case 'source':
          return a.source.localeCompare(b.source);
        case 'usage':
          const usedA = (a.usageContext.inOutline || a.usageContext.inSections.length > 0 || a.usageContext.inInlineEdit) ? 1 : 0;
          const usedB = (b.usageContext.inOutline || b.usageContext.inSections.length > 0 || b.usageContext.inInlineEdit) ? 1 : 0;
          return usedB - usedA;
        case 'alphabetical':
          return a.term.localeCompare(b.term);
        default:
          return 0;
      }
    });

    return filtered;
  }, [bank, sortBy, filterBy]);

  if (!bank || bank.terms.length === 0) return null;

  const handleAddKeyword = () => {
    if (!newKeyword.trim()) return;
    const term: KeywordBankTerm = {
      term: newKeyword.trim(),
      source: 'manual',
      addedAt: new Date().toISOString(),
      usageContext: { inOutline: false, inSections: [], inInlineEdit: false },
      status: 'active'
    };
    onUpdateBank({
      ...bank,
      terms: [...bank.terms, term],
      lastUpdated: new Date().toISOString()
    });
    setNewKeyword('');
    setIsAdding(false);
  };

  const handleTogglePin = (termText: string) => {
    onUpdateBank({
      ...bank,
      terms: bank.terms.map(t => t.term === termText ? { ...t, isPinned: !t.isPinned } : t),
      lastUpdated: new Date().toISOString()
    });
  };

  const handleDismiss = (termText: string) => {
    onUpdateBank({
      ...bank,
      terms: bank.terms.map(t => t.term === termText ? { ...t, status: 'dismissed' } : t),
      lastUpdated: new Date().toISOString()
    });
  };

  const handleEditSave = (oldTermText: string) => {
    if (!editText.trim()) return;
    onUpdateBank({
      ...bank,
      terms: bank.terms.map(t => t.term === oldTermText ? { ...t, term: editText.trim() } : t),
      lastUpdated: new Date().toISOString()
    });
    setEditingIndex(null);
  };

  const totalUsed = bank.terms.filter(t => t.usageContext.inOutline || t.usageContext.inSections.length > 0 || t.usageContext.inInlineEdit).length;

  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 overflow-hidden mb-4 shadow-sm">
      <div 
        className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 cursor-pointer border-b border-slate-200 dark:border-slate-800"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">📚</span>
          <h3 className="font-semibold text-sm">Keyword Bank</h3>
        </div>
        <button className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors">
          {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {!isCollapsed && (
        <div className="p-3">
          <div className="flex justify-between items-center mb-3 text-xs gap-2">
            <select 
              className="bg-transparent border border-slate-200 dark:border-slate-700 rounded px-2 py-1 outline-none text-muted-foreground"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
            >
              <option value="frequency">Sort by: Frequency</option>
              <option value="source">Sort by: Source</option>
              <option value="usage">Sort by: Usage</option>
              <option value="alphabetical">Sort by: A-Z</option>
            </select>
            <select 
              className="bg-transparent border border-slate-200 dark:border-slate-700 rounded px-2 py-1 outline-none text-muted-foreground"
              value={filterBy}
              onChange={(e) => setFilterBy(e.target.value as any)}
            >
              <option value="all">Filter: All</option>
              <option value="serp">Filter: SERP</option>
              <option value="curated">Filter: Curated</option>
              <option value="manual">Filter: Manual</option>
              <option value="used">Filter: Used</option>
              <option value="unused">Filter: Unused</option>
            </select>
          </div>

          <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
            {displayedTerms.map((t, idx) => (
              <div key={idx} className="flex items-center justify-between group p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-md border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-colors">
                {editingIndex === idx ? (
                  <div className="flex items-center gap-1 w-full">
                    <Input autoFocus value={editText} onChange={e => setEditText(e.target.value)} className="h-6 text-xs px-1.5 py-0" />
                    <button onClick={() => handleEditSave(t.term)} className="text-emerald-600 p-0.5"><Check className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setEditingIndex(null)} className="text-slate-400 p-0.5"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t.usageContext.inOutline || t.usageContext.inSections.length > 0 || t.usageContext.inInlineEdit ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                      <span className="text-[13px] font-medium truncate" title={t.term}>{t.term}</span>
                      {t.isPinned && <Pin className="w-3 h-3 text-blue-500 fill-blue-500 flex-shrink-0" />}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-end">
                        <div className="flex gap-0.5">
                          {t.source === 'serp_competitor' ? (
                            Array.from({ length: 4 }).map((_, i) => {
                              const ratio = (t.competitorFrequency ?? 0) / Math.max(1, bank.serpPagesAnalysed);
                              const threshold = (i + 1) * 0.25;
                              const isFilled = ratio >= threshold - 0.125;
                              return <div key={i} className={`w-1.5 h-2.5 rounded-[1px] ${isFilled ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
                            })
                          ) : (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </div>
                        <span className="text-[9px] uppercase tracking-wider text-muted-foreground mt-0.5 opacity-60">
                          {t.source === 'serp_competitor' ? 'serp' : t.source === 'curated_reference' ? 'curated' : 'manual'}
                        </span>
                      </div>
                      
                      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                        <button onClick={() => handleTogglePin(t.term)} className={`p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 ${t.isPinned ? 'text-blue-500' : 'text-slate-400'}`}>
                          <Pin className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => { setEditingIndex(idx); setEditText(t.term); }} className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDismiss(t.term)} className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            {isAdding ? (
               <div className="flex items-center gap-1.5 w-full">
                 <Input autoFocus value={newKeyword} onChange={e => setNewKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddKeyword()} placeholder="Type keyword..." className="h-7 text-xs flex-1" />
                 <Button size="sm" onClick={handleAddKeyword} className="h-7 px-2 text-xs">Add</Button>
                 <Button size="sm" variant="ghost" onClick={() => setIsAdding(false)} className="h-7 px-2 text-xs">Cancel</Button>
               </div>
            ) : (
              <>
                <button onClick={() => setIsAdding(true)} className="text-xs text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1 hover:underline">
                  <Plus className="w-3.5 h-3.5" /> Add keyword
                </button>
                <div className="text-[10px] text-muted-foreground font-medium">
                  {bank.terms.length} terms · {totalUsed} used
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
