'use client';

import { useState } from 'react';
import { 
  Link2, 
  Plus, 
  Loader2, 
  Trash2, 
  Database, 
  BarChart2, 
  CheckCircle2, 
  AlertCircle, 
  Play,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useEngine } from '../../context/EngineContext';
import { useGenerationPipeline } from '../../hooks/useGenerationPipeline';
import { Button } from '@/components/ui/button';
import { deleteExternalLink, saveExternalLink, ExternalLink as ExternalLinkType } from '@/lib/firebase/firestore';

export function StepFinalConfig() {
  const engine = useEngine();
  const { startPipeline, cancelPipeline } = useGenerationPipeline();

  const [linkTab, setLinkTab] = useState<'internal' | 'external'>('internal');
  const [showDebug, setShowDebug] = useState(false);
  const [inlineLinkTitle, setInlineLinkTitle] = useState('');
  const [inlineLinkUrl, setInlineLinkUrl] = useState('');
  const [inlineLinkFolder, setInlineLinkFolder] = useState('');
  const [isCreatingInlineLink, setIsCreatingInlineLink] = useState(false);

  const handleInlineCreateLink = async () => {
    if (!inlineLinkUrl.trim() || !inlineLinkTitle.trim()) return;
    setIsCreatingInlineLink(true);
    try {
      const linkData: ExternalLinkType = {
        title: inlineLinkTitle.trim(),
        url: inlineLinkUrl.trim(),
        folder: inlineLinkFolder
      };
      const id = await saveExternalLink(linkData);
      engine.setExternalLinks([...engine.externalLinks, { ...linkData, id }]);
      setInlineLinkTitle('');
      setInlineLinkUrl('');
      setInlineLinkFolder('');
    } catch (e) {
      console.error(e);
      alert('Failed to add resource');
    } finally {
      setIsCreatingInlineLink(false);
    }
  };

  const canGenerate = !!engine.title;

  return (
    <div className="space-y-10 pb-10 border-b last:border-b-0 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="space-y-6 p-8 rounded-lg border bg-white shadow-sm">
        <div>
          <h2 className="text-3xl font-serif font-bold mb-2 tracking-tight">Final Configuration</h2>
          <p className="text-sm text-muted-foreground">
            Configure external resources and proprietary insights.
          </p>
        </div>

        {/* ── Links & Resources ─────────────────────────────────────────── */}
        <div className="pt-2 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Link2 className="w-4 h-4 text-primary" />
              Links & Resources
            </label>
            <div className="flex bg-sand rounded-full p-1 border border-stone-200 shadow-inner">
              <button
                type="button"
                onClick={() => setLinkTab('internal')}
                className={`text-[11px] px-3 py-1 rounded-full transition-all duration-300 font-medium ${linkTab === 'internal' ? 'bg-white shadow-sm text-primary scale-105' : 'text-stone-400 hover:text-primary'}`}
              >
                Internal
              </button>
              <button
                type="button"
                onClick={() => setLinkTab('external')}
                className={`text-[11px] px-3 py-1 rounded-full transition-all duration-300 font-medium ${linkTab === 'external' ? 'bg-white shadow-sm text-primary scale-105' : 'text-stone-400 hover:text-primary'}`}
              >
                External
              </button>
            </div>
          </div>

          {linkTab === 'internal' ? (
            <>
              <p className="font-light text-[13px] leading-relaxed">Select published articles to interlink automatically.</p>
              {engine.publishedArticles.length === 0 ? (
                <div className="text-[10px] text-muted-foreground p-3 border border-dashed rounded-lg bg-[var(--color-indigo-50)]">No published articles yet.</div>
              ) : (
                <div className="flex flex-col gap-1 max-h-40 overflow-y-auto p-2 border rounded-lg bg-white transition-all">
                  {engine.publishedArticles.map(article => (
                    <label key={article.id} className="flex items-center gap-3 text-xs cursor-pointer hover:bg-[var(--color-indigo-50)] p-2 rounded-lg transition-colors border border-transparent hover:border-border">
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 text-primary rounded border-gray-300"
                      />
                      <span className="truncate flex-1 font-medium">{article.title}</span>
                    </label>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-col gap-2 p-3 bg-[var(--color-indigo-50)] rounded-lg border border-primary/10">
                <div className="text-[10px] font-black uppercase text-primary/70 mb-1">Add Resource Inline</div>
                <div className="flex gap-2">
                  <input
                    placeholder="Anchor Text"
                    className="flex-1 bg-white text-black border border-border rounded px-2 py-1 text-[10px] outline-none focus:ring-1 focus:ring-primary/30"
                    value={inlineLinkTitle}
                    onChange={e => setInlineLinkTitle(e.target.value)}
                  />
                  <input
                    placeholder="URL"
                    className="flex-[2] bg-white text-black border border-border rounded px-2 py-1 text-[10px] outline-none focus:ring-1 focus:ring-primary/30"
                    value={inlineLinkUrl}
                    onChange={e => setInlineLinkUrl(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={handleInlineCreateLink}
                    disabled={isCreatingInlineLink || !inlineLinkUrl.trim() || !inlineLinkTitle.trim()}
                    className="bg-primary text-white p-1 rounded hover:opacity-90 disabled:opacity-50"
                  >
                    {isCreatingInlineLink ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              {engine.externalLinks.length === 0 ? (
                <div className="text-[10px] text-muted-foreground p-3 border border-dashed rounded-lg bg-[var(--color-indigo-50)]">No external links found.</div>
              ) : (
                <div className="flex flex-col gap-1 max-h-40 overflow-y-auto p-2 border rounded-lg bg-white transition-all">
                  {engine.externalLinks.map(link => (
                    <div key={link.id} className="flex items-center gap-2 hover:bg-[var(--color-indigo-50)] p-2 rounded-lg transition-colors border border-transparent hover:border-border group">
                      <label className="flex items-center gap-3 text-xs cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          className="w-3.5 h-3.5 text-primary rounded border-gray-300"
                        />
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="truncate font-medium">{link.title}</span>
                          <span className="truncate text-[9px] text-muted-foreground opacity-70">{link.url}</span>
                        </div>
                      </label>
                      <button
                        type="button"
                        onClick={async () => {
                          if (link.id) {
                            await deleteExternalLink(link.id);
                            engine.setExternalLinks(engine.externalLinks.filter(l => l.id !== link.id));
                          }
                        }}
                        className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-md opacity-0 group-hover:opacity-100 transition-all shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Custom Data & Insights ─────────────────────────────── */}
        <div className="pt-2 space-y-3">
          <label className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            Custom Data & Insights
          </label>
          <p className="font-light text-[13px] leading-relaxed">Add any proprietary data, specific company insights, or unique viewpoints the AI should weave into the article.</p>
          <textarea
            placeholder="E.g., In our recent Q3 survey, we found that 65% of teams using our tool saved 5 hours per week..."
            className="w-full h-24 p-3 text-sm rounded-lg border focus:border-primary focus:ring-4 focus:ring-primary/20 bg-background resize-y outline-none"
          />
        </div>

        {/* ── SEO Intelligence Debug Panel ─────────────────────────────── */}
        <div className="pt-2 space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <label className="text-sm font-semibold text-foreground flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-emerald-600" />
              SEO Intelligence Debug Panel
            </label>
            {engine.serpAnalysis ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">✓ SERP Crawl Loaded</span>
            ) : (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">No SERP Crawl Data</span>
            )}
          </div>

          {engine.serpAnalysis ? (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setShowDebug(!showDebug)}
                className="w-full flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors text-xs font-semibold text-slate-700"
              >
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-indigo-500" />
                  <span>{showDebug ? 'Hide' : 'Show'} SERP Intelligence Reports ({engine.serpAnalysis.analyzedCompetitors || 10} Competitors Analysed)</span>
                </div>
                {showDebug ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showDebug && (
                <div className="p-5 rounded-2xl border border-slate-100 bg-white shadow-lg space-y-6 animate-in fade-in duration-200">
                  
                  {/* Competitor Content Depth Analysis */}
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400">1. Competitor Content Depth Analysis</h4>
                    <div className="grid grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <div className="text-center">
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Median Word Count</div>
                        <div className="text-lg font-extrabold text-slate-800 mt-0.5">{engine.serpAnalysis?.medianWordCount || 2000} words</div>
                      </div>
                      <div className="text-center border-x border-slate-200/60">
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Median Title Length</div>
                        <div className="text-lg font-extrabold text-slate-800 mt-0.5">{engine.serpAnalysis?.medianTitleLength || 60} chars</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Median H2 Count</div>
                        <div className="text-lg font-extrabold text-slate-800 mt-0.5">{engine.serpAnalysis?.medianH2Count || 5} sections</div>
                      </div>
                    </div>
                  </div>

                  {/* Heading Frequency Report */}
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400">2. Heading Frequency Report</h4>
                    <div className="max-h-56 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-100">
                      {engine.serpAnalysis?.headingFrequency && engine.serpAnalysis.headingFrequency.length > 0 ? (
                        engine.serpAnalysis.headingFrequency.map((h, i) => (
                          <div key={i} className="flex justify-between items-center p-3 text-xs">
                            <span className="font-semibold text-slate-700">{h.heading}</span>
                            <span className="shrink-0 ml-4 px-2 py-1 rounded bg-indigo-50 text-indigo-700 font-bold text-[10px]">
                              {h.count}/{engine.serpAnalysis?.analyzedCompetitors || 10} competitors ({h.competitorPercentage}%)
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="p-3 text-xs text-slate-400 text-center">No heading data available.</div>
                      )}
                    </div>
                  </div>

                  {/* Table Detection Report */}
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400">3. Table Detection Report</h4>
                    <div className="p-4 rounded-xl border border-slate-100 bg-slate-50 space-y-3 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600 font-medium">Competitor Table Usage Rate:</span>
                        <span className="font-extrabold text-slate-800">{engine.serpAnalysis?.tableDetection?.competitorPercentage || 0}% ({engine.serpAnalysis?.tableDetection?.competitorTableCount || 0} competitors)</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600 font-medium">Automatic Table Generation:</span>
                        <span className={`px-2 py-0.5 rounded font-black text-[10px] ${engine.serpAnalysis?.tableDetection?.tablesFound ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {engine.serpAnalysis?.tableDetection?.tablesFound ? 'ENABLED (>=50% Competitors Use Tables)' : 'DISABLED (<50% Competitors Use Tables)'}
                        </span>
                      </div>
                      {engine.serpAnalysis?.tableDetection?.recommendedTables && engine.serpAnalysis.tableDetection.recommendedTables.length > 0 && (
                        <div className="mt-2 space-y-2 pt-2 border-t border-slate-200/50">
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Recommended Table Blueprint:</div>
                          {engine.serpAnalysis.tableDetection.recommendedTables.map((t, i) => (
                            <div key={i} className="p-2.5 rounded-lg bg-white border border-slate-200/50 space-y-1">
                              <div className="font-bold text-slate-700">{t.name} ({t.type})</div>
                              <div className="text-[10px] text-slate-500 font-mono">Columns: {t.columns.join(' | ')}</div>
                              <div className="text-[11px] text-slate-600 leading-normal italic">Purpose: {t.purpose}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* PAA Questions Report */}
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400">4. People Also Ask (PAA) Questions</h4>
                    <div className="max-h-56 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-100 text-xs">
                      {engine.serpAnalysis?.paaQuestions && engine.serpAnalysis.paaQuestions.length > 0 ? (
                        engine.serpAnalysis.paaQuestions.map((q, i) => (
                          <div key={i} className="p-3 space-y-1">
                            <div className="font-semibold text-slate-700 flex items-start gap-2">
                              <span className="text-slate-400 shrink-0 font-bold">Q:</span>
                              <span>{q.question}</span>
                            </div>
                            {q.snippet && (
                              <p className="text-[10px] text-slate-500 pl-4 border-l-2 border-slate-100 italic">
                                &ldquo;{q.snippet}&rdquo;
                              </p>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="p-3 text-xs text-slate-400 text-center">No PAA questions captured.</div>
                      )}
                    </div>
                    {engine.serpAnalysis?.contentGapReport?.faqQuestions && engine.serpAnalysis.contentGapReport.faqQuestions.length > 0 && (
                      <div className="p-3.5 rounded-xl border border-indigo-100 bg-indigo-50/20 text-xs space-y-2 mt-2">
                        <div className="font-extrabold text-indigo-700 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Suggested FAQ Section Recommended
                        </div>
                        <ul className="list-disc list-inside space-y-1 text-indigo-900/90 pl-1">
                          {engine.serpAnalysis.contentGapReport.faqQuestions.map((q, idx) => (
                            <li key={idx} className="leading-snug">{q}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Topic Cluster Report */}
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400">5. Topic Cluster Report</h4>
                    <div className="max-h-56 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-100 text-xs">
                      {engine.serpAnalysis?.topicClusters && engine.serpAnalysis.topicClusters.length > 0 ? (
                        engine.serpAnalysis.topicClusters.map((cluster, i) => (
                          <div key={i} className="p-3 space-y-1.5">
                            <div className="font-bold text-indigo-700 uppercase tracking-wider text-[10px]">{cluster.clusterName}</div>
                            <div className="flex flex-wrap gap-1">
                              {cluster.keywords.map((kw, idx) => (
                                <span key={idx} className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] font-medium border border-slate-200/30">
                                  {kw}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-3 text-xs text-slate-400 text-center">No topic clusters created.</div>
                      )}
                    </div>
                  </div>

                  {/* Competitor Authority Weights */}
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400">6. Competitor Authority Weights</h4>
                    <div className="overflow-x-auto border border-slate-100 rounded-xl">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold">
                            <th className="p-3 text-center">Rank</th>
                            <th className="p-3">Competitor Page Title & URL</th>
                            <th className="p-3 text-center">Authority Weight</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {engine.serpAnalysis?.competitorWeights && engine.serpAnalysis.competitorWeights.length > 0 ? (
                            engine.serpAnalysis.competitorWeights.map((cw: any, i: number) => (
                              <tr key={i} className="hover:bg-slate-50/50">
                                <td className="p-3 text-center font-bold text-slate-400">#{cw.rank}</td>
                                <td className="p-3 max-w-xs">
                                  <div className="font-semibold text-slate-700 truncate">{cw.title}</div>
                                  <div className="text-[10px] text-slate-400 truncate mt-0.5">{cw.url}</div>
                                </td>
                                <td className="p-3 text-center font-extrabold text-emerald-600 bg-emerald-50/20">{cw.weight.toFixed(1)}</td>
                              </tr>
                            ))
                          ) : (
                            [...Array(engine.serpAnalysis?.analyzedCompetitors || 10)].map((_, i) => {
                              const rank = i + 1;
                              const weight = Math.max(0.1, 1.1 - rank * 0.1);
                              return (
                                <tr key={i} className="hover:bg-slate-50/50">
                                  <td className="p-3 text-center font-bold text-slate-400">#{rank}</td>
                                  <td className="p-3 max-w-xs text-slate-500 italic">
                                    {engine.serpAnalysis?.competitorTitles?.[i] || `Competitor ${rank}`}
                                  </td>
                                  <td className="p-3 text-center font-extrabold text-emerald-600 bg-emerald-50/20">{weight.toFixed(1)}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Intent Confidence Breakdown */}
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400">7. Intent Confidence Breakdown</h4>
                    <div className="p-4 rounded-xl border border-slate-100 bg-slate-50 space-y-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-slate-700 uppercase">Dominant Intent:</span>
                        <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-extrabold text-[10px] uppercase">
                          {engine.serpAnalysis?.intentBlueprint?.intent || 'informational'} ({engine.serpAnalysis?.intentBlueprint?.confidenceScore || 80}%)
                        </span>
                      </div>
                      
                      <div className="space-y-2 pt-2">
                        {(() => {
                          const confidence = engine.serpAnalysis?.intentBlueprint?.intentConfidence || {
                            informational: engine.serpAnalysis?.intentBlueprint?.intent === 'informational' ? (engine.serpAnalysis?.intentBlueprint?.confidenceScore || 80) : 10,
                            commercial: engine.serpAnalysis?.intentBlueprint?.intent === 'commercial' ? (engine.serpAnalysis?.intentBlueprint?.confidenceScore || 80) : 10,
                            transactional: engine.serpAnalysis?.intentBlueprint?.intent === 'transactional' ? (engine.serpAnalysis?.intentBlueprint?.confidenceScore || 80) : 5,
                            comparison: engine.serpAnalysis?.intentBlueprint?.intent === 'comparison' ? (engine.serpAnalysis?.intentBlueprint?.confidenceScore || 80) : 5,
                          };
                          
                          return Object.entries(confidence).map(([key, pct]: [string, any]) => (
                            <div key={key} className="space-y-1">
                              <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                                <span className="capitalize">{key}</span>
                                <span>{pct}%</span>
                              </div>
                              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                                <div 
                                  className="bg-indigo-600 h-full rounded-full transition-all duration-500" 
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Entity Relationship Graph */}
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400">8. Entity Relationship Graph</h4>
                    <div className="max-h-56 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-100 text-xs bg-white">
                      {engine.serpAnalysis?.entityRelationships && engine.serpAnalysis.entityRelationships.length > 0 ? (
                        engine.serpAnalysis.entityRelationships.map((rel: any, i: number) => (
                          <div key={i} className="flex items-center justify-between p-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded truncate max-w-[120px]">{rel.source}</span>
                              <span className="text-slate-400 font-mono text-[10px]">&rarr;</span>
                              <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded truncate max-w-[120px]">{rel.target}</span>
                            </div>
                            <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-600 italic">
                              {rel.type}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="p-4 text-xs text-slate-400 text-center">No entity relationship mappings extracted.</div>
                      )}
                    </div>
                    
                    {engine.serpAnalysis?.recommendedEntityConnections && engine.serpAnalysis.recommendedEntityConnections.length > 0 && (
                      <div className="p-3.5 rounded-xl border border-indigo-100 bg-indigo-50/10 text-xs space-y-2">
                        <div className="font-extrabold text-indigo-800 uppercase tracking-wider text-[10px]">Recommended Entity Connections to Discuss:</div>
                        <div className="flex flex-wrap gap-1.5">
                          {engine.serpAnalysis.recommendedEntityConnections.map((c: string, idx: number) => (
                            <span key={idx} className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-0.5 rounded-md font-medium text-[10px]">
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Featured Snippet Analysis */}
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400">9. Featured Snippet Analysis</h4>
                    {engine.serpAnalysis?.featuredSnippetBlueprint?.hasFeaturedSnippet ? (
                      <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/20 text-xs space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-600 font-medium">Featured Snippet Status:</span>
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px] uppercase">
                            Opportunity Detected
                          </span>
                        </div>
                        <div className="flex justify-between items-center border-t border-slate-100 pt-2">
                          <span className="text-slate-600 font-medium">Snippet Type:</span>
                          <span className="font-bold text-slate-800 capitalize">
                            {engine.serpAnalysis.featuredSnippetBlueprint.snippetType}
                          </span>
                        </div>
                        <div className="space-y-1 pt-1">
                          <span className="text-slate-500 font-bold uppercase text-[9px] tracking-wider">Target Trigger Question / Query</span>
                          <div className="p-2.5 rounded bg-white border border-slate-200/50 font-semibold text-slate-800 leading-normal">
                            &ldquo;{engine.serpAnalysis.featuredSnippetBlueprint.targetQuery}&rdquo;
                          </div>
                        </div>
                        
                        {engine.serpAnalysis.featuredSnippetBlueprint.extractedSnippetText && (
                          <div className="space-y-1">
                            <span className="text-slate-500 font-bold uppercase text-[9px] tracking-wider">Extracted Competitor Snippet</span>
                            <div className="p-2.5 rounded bg-white border border-slate-200/50 text-slate-600 leading-relaxed italic">
                              &ldquo;{engine.serpAnalysis.featuredSnippetBlueprint.extractedSnippetText}&rdquo;
                            </div>
                          </div>
                        )}
                        
                        {engine.serpAnalysis.featuredSnippetBlueprint.optimizedSnippetRecommendation && (
                          <div className="space-y-1">
                            <span className="text-emerald-700 font-bold uppercase text-[9px] tracking-wider flex items-center gap-1">
                              ★ Optimized Snippet Recommendation (Target)
                            </span>
                            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-900 font-medium leading-relaxed shadow-sm">
                              {engine.serpAnalysis.featuredSnippetBlueprint.optimizedSnippetRecommendation}
                            </div>
                          </div>
                        )}

                        {engine.serpAnalysis.featuredSnippetBlueprint.generationDirectives && (
                          <div className="space-y-1 pt-1">
                            <span className="text-slate-500 font-bold uppercase text-[9px] tracking-wider">Writer Directives</span>
                            <p className="text-slate-600 text-[11px] leading-relaxed pl-1">
                              {engine.serpAnalysis.featuredSnippetBlueprint.generationDirectives}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl border border-slate-100 bg-slate-50 text-xs text-slate-500 text-center">
                        No featured snippet opportunities detected for this keyword.
                      </div>
                    )}
                  </div>

                </div>
              )}
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
              <div className="font-semibold mb-1 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                SEO Intelligence Missing
              </div>
              <p className="font-light leading-relaxed">
                Competitive context was not gathered in the extraction phase. The AI will generate content without specific SEO guardrails.
              </p>
            </div>
          )}
        </div>

        {/* ── Generate CTA ─────────────────────────────────────────── */}
        <div className="pt-2 space-y-3">
          <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-[var(--color-indigo-50)] transition-colors">
            <input
              type="checkbox"
              checked={engine.enableWeakCopyDetector}
              onChange={(e) => engine.setEnableWeakCopyDetector(e.target.checked)}
              className="w-4 h-4 text-primary rounded border-gray-300"
            />
            <div>
              <div className="text-sm font-semibold">Enable Weak Copy Detector</div>
              <div className="font-light text-[13px]">Post-generation analysis to flag generic AI filler.</div>
            </div>
          </label>

          {engine.isRunning ? (
            <Button
              type="button"
              variant="destructive"
              className="w-full h-12 text-base font-semibold"
              onClick={cancelPipeline}
            >
              Cancel Generation
            </Button>
          ) : (
            <Button
              type="button"
              className="w-full h-12 text-lg font-medium bg-premium-blue text-white border-0 shadow-xl shadow-blue-500/30 hover:opacity-90 transition-opacity gap-2 rounded-full"
              disabled={!canGenerate}
              onClick={() => startPipeline()}
            >
              <Play className="w-5 h-5" />
              Generate Article
            </Button>
          )}
          {engine.genError && (
            <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg border border-destructive/20 font-medium">
              <AlertCircle className="inline w-4 h-4 mr-1.5 -mt-0.5" />
              {engine.genError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
