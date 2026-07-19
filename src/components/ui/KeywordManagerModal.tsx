import React, { useState } from 'react';
import { X, Sparkles, Loader2, Info, Plus, Target, CheckCircle2, Search, ArrowRight, BarChart, AlertCircle, RefreshCw, Layers } from 'lucide-react';
import { ContentPlan, KeywordTarget } from '@/lib/firebase/firestore';

interface KeywordManagerModalProps {
  plan: ContentPlan;
  onUpdatePlan: (updatedPlan: ContentPlan) => Promise<void>;
  onClose: () => void;
}

export function KeywordManagerModal({ plan, onUpdatePlan, onClose }: KeywordManagerModalProps) {
  const [localTargets, setLocalTargets] = useState<KeywordTarget[]>(plan.keywordTargets || []);
  const [newKeywordInput, setNewKeywordInput] = useState('');

  // ── Flow States ──
  const [isExtractingSeeds, setIsExtractingSeeds] = useState(false);
  const [isConfirmingSeeds, setIsConfirmingSeeds] = useState(false);
  const [seedKeywords, setSeedKeywords] = useState<string[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isFetchingMetrics, setIsFetchingMetrics] = useState(false);
  const [isGroupedBySeed, setIsGroupedBySeed] = useState(false);

  const selectedCount = localTargets.filter(t => t.selected).length;
  const isRefining = localTargets.some(t => t.refinementStatus === 'pending');

  // Step 1: Extract Seeds
  const handleStartDiscovery = async () => {
    if (!plan.productDescription) return;
    setIsExtractingSeeds(true);
    try {
      const res = await fetch('/api/extract-seed-keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productDescription: plan.productDescription })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSeedKeywords(data.seeds || []);
      setIsConfirmingSeeds(true);
    } catch (err: any) {
      console.error(err);
      // Fallback
      setSeedKeywords([plan.productDescription.trim().split(/\s+/).slice(0, 4).join(' ')]);
      setIsConfirmingSeeds(true);
    } finally {
      setIsExtractingSeeds(false);
    }
  };

  const handleSeedChange = (index: number, val: string) => {
    const newSeeds = [...seedKeywords];
    newSeeds[index] = val;
    setSeedKeywords(newSeeds);
  };

  const handleRemoveSeed = (index: number) => {
    setSeedKeywords(prev => prev.filter((_, i) => i !== index));
  };

  // Step 2 & 3: Fetch SERP & Refine Async
  const handleConfirmSeeds = async () => {
    const activeSeeds = seedKeywords.filter(s => s.trim() !== '');
    if (activeSeeds.length === 0) return;

    setIsConfirmingSeeds(false);
    setIsDiscovering(true);

    try {
      const res = await fetch('/api/suggest-keywords-serper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: activeSeeds })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const newTargets: KeywordTarget[] = (data.keywords || []).map((k: any) => ({
        id: k.id,
        keyword: k.keyword,
        normalizedKeyword: k.keyword.toLowerCase(),
        normalizedTokens: k.normalizedTokens,
        intent: k.intent || 'mixed',
        searchIntent: k.searchIntent,
        originalSource: k.source,
        sourceSeed: k.sourceSeed,
        estimatedDifficulty: k.estimatedDifficulty,
        metricsStatus: 'not_fetched',
        refinementStatus: 'pending',
        source: 'serper',
        selected: false
      }));

      // Exact match deduplication against existing manually added or previously fetched
      const existingNormalized = new Set(localTargets.map(t => t.normalizedKeyword));
      const filtered = newTargets.filter(t => !existingNormalized.has(t.normalizedKeyword));

      setLocalTargets(prev => [...prev, ...filtered]);
      
      // 2. Fire Async Refinement
      executeRefinement(filtered);

    } catch (err: any) {
      console.error(err);
      alert('Failed to discover keywords.');
    } finally {
      setIsDiscovering(false);
    }
  };

  const executeRefinement = async (targetsToRefine: KeywordTarget[]) => {
    if (targetsToRefine.length === 0) return;
    
    // Set pending state
    setLocalTargets(prev => prev.map(t => targetsToRefine.some(rt => rt.id === t.id) ? { ...t, refinementStatus: 'pending' } : t));

    const CHUNK_SIZE = 8;
    const chunks: KeywordTarget[][] = [];
    for (let i = 0; i < targetsToRefine.length; i += CHUNK_SIZE) {
      chunks.push(targetsToRefine.slice(i, i + CHUNK_SIZE));
    }

    const promises = chunks.map(async (chunk) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(new Error('Timeout after 60s')), 60000);

      try {
        const res = await fetch('/api/refine-keywords', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keywords: chunk }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (!res.ok) throw new Error('Refinement failed');
        const data = await res.json();

        const { refined_keywords = [], intent_map = [] } = data;

        setLocalTargets(prev => {
          let updated = [...prev];

          // Apply refinements
          refined_keywords.forEach((rk: any) => {
            const idx = updated.findIndex(t => t.id === rk.id);
            if (idx !== -1) {
              updated[idx] = { 
                  ...updated[idx], 
                  keyword: rk.keyword, 
                  normalizedKeyword: rk.keyword.toLowerCase(),
                  refinementStatus: 'success'
              };
            }
          });

          // Apply intents
          intent_map.forEach((im: any) => {
            const idx = updated.findIndex(t => t.id === im.id);
            if (idx !== -1) {
              updated[idx] = { ...updated[idx], searchIntent: im.intent };
            }
          });

          // Set success for those that didn't change explicitly
          updated = updated.map(t => chunk.some(rt => rt.id === t.id) && t.refinementStatus === 'pending' ? { ...t, refinementStatus: 'success' } : t);

          return updated;
        });
      } catch (err) {
        console.error('Async refinement failed for chunk:', err);
        // Set failed state
        setLocalTargets(prev => prev.map(t => chunk.some(rt => rt.id === t.id) ? { ...t, refinementStatus: 'failed' } : t));
      }
    });

    await Promise.all(promises);
  };

  const handleRetryRefinement = () => {
    const failedTargets = localTargets.filter(t => t.refinementStatus === 'failed');
    executeRefinement(failedTargets);
  };

  // Step 4: Get Real Metrics
  const handleGetMetrics = async () => {
    const selected = localTargets.filter(t => t.selected && t.metricsStatus !== 'fetched');
    if (selected.length === 0) {
      alert("Please select at least one un-fetched keyword to get metrics.");
      return;
    }

    setIsFetchingMetrics(true);
    setLocalTargets(prev => prev.map(t => selected.some(st => st.id === t.id) ? { ...t, metricsStatus: 'fetching' } : t));

    try {
      const kws = selected.map(t => t.keyword);
      const res = await fetch('/api/metrics-dataforseo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: kws })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const metricsMap = data.metrics || {};
      
      setLocalTargets(prev => {
        let updated = prev.map(t => {
            if (t.metricsStatus === 'fetching') {
                const metric = metricsMap[t.keyword];
                if (metric) {
                    return {
                        ...t,
                        metricsStatus: 'fetched' as const,
                        volume: metric.volume,
                        cpc: metric.cpc,
                        difficulty: metric.kd / 100 // Convert back to 0-1 range
                    };
                }
                return { ...t, metricsStatus: 'not_fetched' as const }; // Fallback if missing
            }
            return t;
        });

        // Calculate similarTo for visual flagging post-metrics
        const fetchedKeywords = updated.filter(t => t.metricsStatus === 'fetched');
        const tokenMap = new Map<string, KeywordTarget>();
        
        fetchedKeywords.forEach(t => {
            if (!t.normalizedTokens) return;
            const existing = tokenMap.get(t.normalizedTokens);
            if (!existing || (t.volume || 0) > (existing.volume || 0)) {
                tokenMap.set(t.normalizedTokens, t);
            }
        });
        
        updated = updated.map(t => {
            if (t.metricsStatus === 'fetched' && t.normalizedTokens) {
                const winner = tokenMap.get(t.normalizedTokens);
                if (winner && winner.id !== t.id) {
                    return { ...t, similarTo: winner.id };
                } else {
                    return { ...t, similarTo: undefined };
                }
            }
            return t;
        });

        return updated;
      });

    } catch (err) {
      console.error(err);
      alert('Failed to fetch real metrics.');
      setLocalTargets(prev => prev.map(t => t.metricsStatus === 'fetching' ? { ...t, metricsStatus: 'not_fetched' } : t));
    } finally {
      setIsFetchingMetrics(false);
    }
  };

  const handleToggle = (idx: number, id?: string) => {
    let targetIndex = idx;
    if (id) {
        targetIndex = localTargets.findIndex(t => t.id === id);
    }
    if (targetIndex === -1) return;

    const updated = [...localTargets];
    if (!updated[targetIndex].selected && selectedCount >= 10) {
      alert('You can only select up to 10 preferred master keywords.');
      return;
    }
    updated[targetIndex].selected = !updated[targetIndex].selected;
    setLocalTargets(updated);
  };

  const handleAddManual = () => {
    if (!newKeywordInput.trim()) return;
    const normalized = newKeywordInput.trim().toLowerCase();
    if (localTargets.some(t => t.normalizedKeyword === normalized)) return;

    if (selectedCount >= 10) {
      alert('You can only select up to 10 preferred master keywords.');
      return;
    }

    const newKw: KeywordTarget = {
      id: crypto.randomUUID(),
      keyword: newKeywordInput.trim(),
      normalizedKeyword: normalized,
      intent: 'mixed',
      source: 'serper',
      metricsStatus: 'not_fetched',
      refinementStatus: 'success',
      selected: true
    };

    setLocalTargets(prev => [newKw, ...prev]);
    setNewKeywordInput('');
  };

  const handleSave = async () => {
    const selection = localTargets.filter(t => t.selected).map(t => t.keyword);
    const updatedPlan = {
      ...plan,
      keywordTargets: localTargets,
      targetKeywords: selection
    };
    await onUpdatePlan(updatedPlan);
    onClose();
  };

  const renderTableRows = (targets: KeywordTarget[]) => {
      if (targets.length === 0) {
          return (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  No keywords found.
                </td>
              </tr>
          );
      }

      return targets.map((kt, displayIdx) => (
        <tr key={kt.id || displayIdx} className={`hover:bg-muted/30 transition-colors ${kt.selected ? 'bg-[var(--color-indigo-50)]' : ''}`}>
          <td className="p-3 text-center">
            <button
              onClick={() => handleToggle(displayIdx, kt.id)}
              className={`w-5 h-5 rounded flex items-center justify-center border transition-all ${kt.selected ? 'bg-fuchsia-600 border-fuchsia-600 text-white' : 'bg-background border-muted-foreground/30 hover:border-fuchsia-400'}`}
            >
              {kt.selected && <CheckCircle2 className="w-3.5 h-3.5" />}
            </button>
          </td>
          <td className={`p-3 font-medium text-foreground transition-all duration-300 ${kt.refinementStatus === 'pending' ? 'opacity-50' : ''}`}>
            {kt.keyword}
            {kt.similarTo && (
                <div className="text-[10px] text-amber-600 bg-indigo-50 px-2 py-0.5 mt-1.5 rounded inline-block border border-indigo-200">
                    Similar to <span className="font-bold">{localTargets.find(t => t.id === kt.similarTo)?.keyword}</span>
                </div>
            )}
          </td>
          <td className="p-3 transition-opacity duration-300" style={{ opacity: kt.refinementStatus === 'pending' ? 0.5 : 1 }}>
            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${kt.searchIntent === 'transactional' || kt.searchIntent === 'commercial' ? 'bg-orange-100 text-orange-700' : 'bg-sky-100 text-sky-700'}`}>
              {kt.searchIntent || 'Informational'}
            </span>
          </td>
          <td className="p-3">
            {kt.metricsStatus === 'fetched' && kt.difficulty !== undefined ? (
              <div className="flex items-center gap-2">
                <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full ${kt.difficulty > 0.7 ? 'bg-red-500' : kt.difficulty > 0.4 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.round(kt.difficulty * 100)}%` }} />
                </div>
                <span className="text-xs font-mono opacity-70">{Math.round(kt.difficulty * 100)}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 opacity-40 group relative cursor-help">
                <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden"></div>
                <span className="text-xs font-mono">?</span>
                <div className="absolute top-4 left-0 w-48 p-2 bg-popover border text-popover-foreground text-xs rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 hidden group-hover:block">
                  Estimated KD from rank: {Math.round((kt.estimatedDifficulty || 0) * 100)}
                </div>
              </div>
            )}
          </td>
          <td className="p-3">
            <span className="text-[11px] font-mono text-muted-foreground tag bg-secondary px-2 py-1 rounded-md">
              {/* @ts-ignore */}
              {kt.originalSource === 'organic_title' ? 'Organic' : kt.originalSource === 'paa_question' ? 'People Also Ask' : kt.originalSource === 'related_search' ? 'Related' : 'Manual'}
            </span>
            {isGroupedBySeed && kt.sourceSeed && (
                <div className="text-[10px] mt-1 text-muted-foreground/60 break-all max-w-[120px]">
                    from "{kt.sourceSeed}"
                </div>
            )}
          </td>
          <td className="p-3 font-mono text-xs">
            {kt.metricsStatus === 'fetching' ? <Loader2 className="w-3 h-3 animate-spin opacity-50" /> : 
             kt.metricsStatus === 'fetched' && kt.volume !== undefined ? kt.volume.toLocaleString() : 
             <span className="opacity-30">TBD</span>}
          </td>
          <td className="p-3 font-mono text-xs">
             {kt.metricsStatus === 'fetching' ? <Loader2 className="w-3 h-3 animate-spin opacity-50" /> : 
              kt.metricsStatus === 'fetched' && kt.cpc !== undefined ? `$${kt.cpc.toFixed(2)}` : 
              <span className="opacity-30">-</span>}
          </td>
        </tr>
      ));
  };

  const groupedTargets = isGroupedBySeed ? 
    localTargets.reduce((acc, target) => {
        const seed = target.sourceSeed || 'Manual Additions';
        if (!acc[seed]) acc[seed] = [];
        acc[seed].push(target);
        return acc;
    }, {} as Record<string, KeywordTarget[]>) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-5xl max-h-[90vh] bg-white rounded-2xl border shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b bg-muted/30">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Target className="w-5 h-5 text-fuchsia-500" />
              Master Keyword Manager
            </h2>
            <p className="text-sm text-muted-foreground mt-1">Research, discover, and select your core SEO keywords (Max 10).</p>
          </div>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:bg-secondary rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-background space-y-6">

          <div className="flex flex-col sm:flex-row gap-4 items-end justify-between">
            <div className="flex-1 max-w-sm">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2 block">Add Manually</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. B2B SaaS SEO..."
                  value={newKeywordInput}
                  onChange={e => setNewKeywordInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddManual()}
                  className="flex-1 h-9 px-3 rounded-md border text-sm focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 outline-none"
                />
                <button onClick={handleAddManual} className="h-9 px-3 bg-secondary hover:bg-secondary/80 rounded-md text-sm font-medium transition-colors">
                  Add
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
                {localTargets.some(t => t.refinementStatus === 'failed') && (
                    <button 
                        onClick={handleRetryRefinement}
                        className="h-9 px-3 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-md flex items-center gap-1.5 text-xs font-bold transition-colors"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Retry Refinement
                    </button>
                )}
                <button
                  onClick={handleGetMetrics}
                  disabled={isFetchingMetrics || selectedCount === 0 || isRefining}
                  className="h-9 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-md flex items-center gap-2 text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {isFetchingMetrics ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart className="w-4 h-4" />}
                  Get Real Metrics
                </button>
                <button
                  onClick={handleStartDiscovery}
                  disabled={isExtractingSeeds || isDiscovering || isConfirmingSeeds}
                  className="h-9 px-4 bg-fuchsia-600 hover:bg-fuchsia-700 text-white rounded-md flex items-center gap-2 text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {isExtractingSeeds || isDiscovering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {isExtractingSeeds ? 'Extracting Seeds...' : 'Discover via SERP'}
                </button>
            </div>
          </div>

          {/* Inline Seed Confirmation */}
          {isConfirmingSeeds && (
            <div className="p-4 bg-[var(--color-indigo-50)] border border-indigo-100 rounded-xl animate-in fade-in slide-in-from-top-2">
                <h4 className="text-sm font-bold text-fuchsia-900 flex items-center gap-2 mb-3">
                    <Search className="w-4 h-4 text-fuchsia-500" /> Confirm Seed Keywords
                </h4>
                <div className="flex flex-wrap items-center gap-2">
                    {seedKeywords.map((seed, idx) => (
                        <div key={idx} className="flex items-center bg-white border border-fuchsia-200 rounded-md overflow-hidden shadow-sm">
                            <input 
                                value={seed}
                                onChange={(e) => handleSeedChange(idx, e.target.value)}
                                className="h-8 px-3 text-sm outline-none w-40 min-w-[120px]"
                            />
                            <button onClick={() => handleRemoveSeed(idx)} className="h-8 px-2 text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                    <button 
                        onClick={() => setSeedKeywords([...seedKeywords, ''])} 
                        className="h-8 w-8 flex items-center justify-center bg-white border border-dashed border-fuchsia-300 text-fuchsia-500 hover:bg-fuchsia-50 rounded-md transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                    <div className="flex-1" />
                    <button onClick={() => setIsConfirmingSeeds(false)} className="h-8 px-3 text-sm text-muted-foreground hover:bg-white rounded-md">Cancel</button>
                    <button onClick={handleConfirmSeeds} className="h-8 px-4 bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-sm font-bold rounded-md flex items-center gap-2 shadow-sm">
                        Search with these <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
          )}

          <div className="border rounded-lg overflow-hidden relative">
            
            <div className="bg-muted/50 border-b flex items-center justify-between px-4 py-2">
                <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-muted-foreground">Keyword Candidates</h3>
                    {isRefining && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold animate-pulse flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Refining...</span>}
                    {localTargets.some(t => t.refinementStatus === 'failed') && <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Partial Failure</span>}
                </div>
                <button 
                    onClick={() => setIsGroupedBySeed(!isGroupedBySeed)}
                    className={`text-xs font-semibold px-2 py-1 rounded flex items-center gap-1.5 transition-colors ${isGroupedBySeed ? 'bg-indigo-100 text-indigo-700' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}
                >
                    <Layers className="w-3.5 h-3.5" />
                    Group by Seed
                </button>
            </div>

            {isRefining && (
                <div className="absolute top-[41px] left-0 right-0 h-[2px] z-10 bg-fuchsia-100 overflow-hidden">
                    <div className="h-full bg-fuchsia-500 w-1/3 animate-pulse rounded-full" style={{ animation: 'slide 1.5s infinite linear' }} />
                </div>
            )}

            <table className="w-full text-left text-sm relative">
              <thead className="bg-muted/20 border-b">
                <tr>
                  <th className="p-3 font-semibold text-muted-foreground w-12"></th>
                  <th className="p-3 font-semibold text-muted-foreground">Target Keyword</th>
                  <th className="p-3 font-semibold text-muted-foreground">Search Intent</th>
                  <th className="p-3 font-semibold text-muted-foreground">Difficulty (KD)</th>
                  <th className="p-3 font-semibold text-muted-foreground">Source</th>
                  <th className="p-3 font-semibold text-muted-foreground">Volume</th>
                  <th className="p-3 font-semibold text-muted-foreground">CPC</th>
                </tr>
              </thead>
              <tbody className="divide-y relative">
                {!isGroupedBySeed ? (
                    renderTableRows(localTargets)
                ) : (
                    groupedTargets && Object.entries(groupedTargets).map(([seed, targets]) => (
                        <React.Fragment key={seed}>
                            <tr className="bg-muted/10">
                                <td colSpan={7} className="px-4 py-2 font-bold text-xs uppercase tracking-wider text-indigo-700 border-y bg-indigo-50/50">
                                    <div className="flex items-center gap-2">
                                        <Search className="w-3 h-3" />
                                        {seed}
                                        <span className="bg-white px-1.5 py-0.5 rounded-md border text-[10px] text-muted-foreground font-mono">{targets.length} results</span>
                                    </div>
                                </td>
                            </tr>
                            {renderTableRows(targets)}
                        </React.Fragment>
                    ))
                )}
              </tbody>
            </table>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm">
            <span className="font-semibold text-foreground">Selected:</span>
            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-bold ${selectedCount > 10 ? 'bg-red-100 text-red-700' : selectedCount > 0 ? 'bg-fuchsia-100 text-fuchsia-700' : 'bg-secondary text-muted-foreground'}`}>
              {selectedCount} / 10
            </span>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button onClick={onClose} className="px-4 h-10 border rounded-lg text-sm font-medium hover:bg-secondary flex-1 sm:flex-none">
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-6 h-10 bg-foreground text-background hover:bg-foreground/90 rounded-lg text-sm font-medium flex-1 sm:flex-none shadow-sm"
            >
              Save Master List
            </button>
          </div>
        </div>

      </div>
      <style>{`
        @keyframes slide {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
}
