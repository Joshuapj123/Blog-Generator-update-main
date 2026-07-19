import React, { useState } from 'react';
import { Check, XCircle, Info } from 'lucide-react';

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="relative inline-flex items-center group ml-1.5 align-middle">
      <Info className="w-3.5 h-3.5 text-slate-400 cursor-help hover:text-indigo-400 transition-colors" />
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

export interface CompareTabContentProps {
  genMetrics: any;
  refM: any;
  refSeo: any;
  blueprint: any;
  referenceData: any;
  refH2s: string[];
  refH3s: string[];
  refIntLinks: string[];
  refExtLinks: string[];
  genH2s: string[];
  genH3s: string[];
  genLinks: string[];
  detailOptions: { value: string; label: string }[];
}

export function CompareTabContent({
  genMetrics, refM, refSeo, blueprint, referenceData,
  refH2s, refH3s, refIntLinks, refExtLinks, genH2s, genH3s, genLinks, detailOptions,
}: CompareTabContentProps) {
  const [sub, setSub] = useState<'overview' | 'details'>('overview');
  const [detailView, setDetailView] = useState('h2');

  const refText: string = referenceData?.rawText || '';
  const countYT = (t: string) => (t.match(/youtube\.com\/watch/g) || []).length;

  // Detail content generator
  const DetailPanel = () => {
    /**
     * Collapse a raw list into [{value, count}] pairs, sorted by count desc
     * so the most-repeated links surface first.
     */
    const dedup = (items: string[]): { value: string; count: number }[] => {
      const freq: Record<string, number> = {};
      items.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
      return Object.entries(freq)
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count);
    };

    const renderList = (
      genItems: string[],
      refItems: string[],
      genLabel: string,
      refLabel: string,
      linkify = false,
    ) => {
      const genDeduped = dedup(genItems);
      const refDeduped = dedup(refItems);

      const renderItem = (
        item: { value: string; count: number },
        i: number,
        colorClass: string,
        linkClass: string,
      ) => (
        <li key={i} className={`text-[11px] ${colorClass} rounded-lg px-2.5 py-1.5 leading-snug break-all flex items-start justify-between gap-2`}>
          <span className="flex-1">
            {linkify ? (
              <a href={item.value} target="_blank" rel="noreferrer" className={`hover:underline ${linkClass}`}>
                {item.value}
              </a>
            ) : item.value}
          </span>
          {item.count > 1 && (
            <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-primary border border-stone-200 shadow-sm">
              {item.count} repetitions
            </span>
          )}
        </li>
      );

      return (
        <div className="grid grid-cols-2 gap-3 mt-3">
          {/* Generated */}
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-tight text-indigo-600 mb-2">
              {genLabel} <span className="text-slate-400 font-light lowercase">({genDeduped.length} unique · {genItems.length} total)</span>
            </p>
            {genDeduped.length === 0 ? (
              <p className="text-xs text-slate-400 italic">None found</p>
            ) : (
              <ul className="space-y-1.5">
                {genDeduped.map((item, i) =>
                  renderItem(item, i, 'bg-indigo-50 border border-indigo-100 text-indigo-800', 'text-indigo-700')
                )}
              </ul>
            )}
          </div>
          {/* Reference */}
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-tight text-amber-600 mb-2">
              {refLabel} <span className="text-slate-400 font-light lowercase">({refDeduped.length} unique · {refItems.length} total)</span>
            </p>
            {refDeduped.length === 0 ? (
              <p className="text-xs text-slate-400 italic">{referenceData ? 'None extracted' : 'No reference loaded'}</p>
            ) : (
              <ul className="space-y-1.5">
                {refDeduped.map((item, i) =>
                  renderItem(item, i, 'bg-amber-50 border border-amber-100 text-amber-800', 'text-amber-700')
                )}
              </ul>
            )}
          </div>
        </div>
      );
    };

    switch (detailView) {
      case 'h2':
        return renderList(genH2s, refH2s, 'Your H2s', 'Reference H2s');
      case 'h3':
        return renderList(genH3s, refH3s, 'Your H3s', 'Reference H3s');
      case 'internal': {
        const genInt = genLinks
          .map(l => { const m = l.match(/\(([^)]+)\)/); return m ? m[1] : ''; })
          .filter(u => u && !u.startsWith('http'));
        return renderList(genInt, refIntLinks, 'Your Internal Links', 'Ref Internal Links', true);
      }
      case 'external': {
        const genExt = genLinks
          .map(l => { const m = l.match(/\(([^)]+)\)/); return m ? m[1] : ''; })
          .filter(u => u.startsWith('http'));
        return renderList(genExt, refExtLinks, 'Your External Links', 'Ref External Links', true);
      }
      case 'all-links': {
        const parsed = genLinks.map(l => {
          const m = l.match(/\[([^\]]+)\]\(([^)]+)\)/);
          return m ? { text: m[1], url: m[2] } : null;
        }).filter(Boolean) as { text: string; url: string }[];
        return (
          <div className="mt-3 space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 mb-2">All Links in Your Article ({parsed.length})</p>
            {parsed.length === 0
              ? <p className="text-xs text-slate-400 italic">No links found</p>
              : parsed.map((l, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px] bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1.5">
                  <span className="text-indigo-800 font-medium shrink-0">{l!.text}</span>
                  <a href={l!.url} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline truncate">{l!.url}</a>
                </div>
              ))
            }
          </div>
        );
      }
      default: return null;
    }
  };

  return (
    <div className="space-y-3 dark:text-slate-200">
      {/* Sub-tab pills (Full Pill Nav) */}
      <div className="flex bg-sand p-1 rounded-full w-fit gap-1 border border-stone-200 shadow-inner mb-4">
        {(['overview', 'details'] as const).map(t => (
          <button
            key={t}
            onClick={() => setSub(t)}
            className={`px-5 py-1.5 rounded-full text-[13px] font-medium transition-all duration-300 capitalize ${sub === t
              ? 'bg-white text-primary shadow-sm scale-105'
              : 'text-muted-foreground hover:text-primary'
              }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Overview */}
      {sub === 'overview' && (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] text-left border-collapse font-light">
            <thead className="bg-[#0f172a] text-[10px] uppercase font-medium text-slate-300 tracking-wider">
              <tr>
                <th className="px-4 py-4 w-2/5 font-medium">Metric</th>
                <th className="px-4 py-4 w-[30%] text-white">Generated</th>
                <th className="px-4 py-4 text-slate-400">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              <tr className="bg-sand border-y border-stone-200">
                <td colSpan={3} className="px-4 py-2 text-[9.5px] font-bold uppercase tracking-tight text-stone-500">Content Structure</td>
              </tr>
              <tr>
                <td className="px-4 py-4 text-[15px] font-serif font-medium text-slate-700">Word Count</td>
                <td className={`px-4 py-4 font-serif text-[15px] ${(genMetrics?.wordCount || 0) < (refM?.wordCount || 0) * 0.8 ? 'text-slate-400 italic' : 'text-primary'}`}>
                  {genMetrics?.wordCount?.toLocaleString() || '0'}
                </td>
                <td className="px-4 py-4 bg-stone-50/30 font-serif text-[15px] text-stone-600">{refM?.wordCount?.toLocaleString() || 'N/A'}</td>
              </tr>
              <tr>
                <td className="px-4 py-4 text-[15px] font-serif font-medium text-slate-700">Paragraphs</td>
                <td className={`px-4 py-4 font-serif text-[15px] ${(genMetrics?.paragraphCount || 0) > (refM?.paragraphCount || 0) * 1.5 ? 'font-bold text-primary' : 'text-primary'}`}>
                  {genMetrics?.paragraphCount || '0'}
                </td>
                <td className="px-4 py-4 bg-stone-50/30 font-serif text-[15px] text-stone-600">{refM?.paragraphCount || 'N/A'}</td>
              </tr>
              <tr>
                <td className="px-4 py-4 text-[15px] font-serif font-medium text-slate-700">H2 Headings</td>
                <td className="px-4 py-4 font-serif text-[15px] text-primary">{genMetrics?.h2Count || '0'}</td>
                <td className="px-4 py-4 bg-stone-50/30 font-serif text-[15px] text-stone-600">{refSeo?.headerHierarchy ? refSeo.headerHierarchy.filter((h: any) => h.tag === 'h2').length : 'N/A'}</td>
              </tr>
              <tr>
                <td className="px-4 py-4 text-[15px] font-serif font-medium text-slate-700">H3 Headings</td>
                <td className="px-4 py-4 font-serif text-[15px] text-primary">{genMetrics?.h3Count || '0'}</td>
                <td className="px-4 py-4 bg-stone-50/30 font-serif text-[15px] text-stone-600">{refSeo?.headerHierarchy ? refSeo.headerHierarchy.filter((h: any) => h.tag === 'h3').length : 'N/A'}</td>
              </tr>
              <tr>
                <td className="px-4 py-4 text-[15px] font-serif font-medium text-slate-700">Images</td>
                <td className="px-4 py-4 font-serif text-[15px] text-primary">{genMetrics?.imageCount || '0'}</td>
                <td className="px-4 py-4 bg-stone-50/30 font-serif text-[15px] text-stone-600">{referenceData?.editorialPatterns?.imageCount ?? 'N/A'}</td>
              </tr>
              <tr>
                <td className="px-4 py-4 text-[15px] font-serif font-medium text-slate-700">YouTube Videos</td>
                <td className="px-4 py-4 font-serif text-[15px] text-primary">{genMetrics?.ytCount || '0'}</td>
                <td className="px-4 py-4 bg-stone-50/30 font-serif text-[15px] text-stone-600">{referenceData ? (countYT(refText) || '—') : 'N/A'}</td>
              </tr>
              <tr className="bg-sand border-y border-stone-200">
                <td colSpan={3} className="px-4 py-2 text-[9.5px] font-bold uppercase tracking-tight text-stone-500">Linking</td>
              </tr>
              <tr>
                <td className="px-4 py-4 text-[15px] font-serif font-medium text-slate-700">Internal Links</td>
                <td className="px-4 py-4 font-serif text-[15px] text-primary">
                  {(() => {
                    const allInt = (genLinks || [])
                      .map(l => { const m = l.match(/\(([^)]+)\)/); return m ? m[1] : ''; })
                      .filter(u => u && !u.startsWith('http'));
                    const uniq = new Set(allInt).size;
                    return uniq === allInt.length
                      ? allInt.length
                      : <div className="flex flex-col">{uniq} <span className="text-[11px] text-slate-400 font-light">unique · {allInt.length} total</span></div>;
                  })()}
                </td>
                <td className="px-4 py-4 bg-stone-50/30 font-serif text-[15px] text-stone-600">{refSeo?.linkDensity?.internal ?? 'N/A'}</td>
              </tr>
              <tr>
                <td className="px-4 py-4 text-[15px] font-serif font-medium text-slate-700">External Links</td>
                <td className="px-4 py-4 font-serif text-[15px] text-primary">
                  {(() => {
                    const allExt = (genLinks || [])
                      .map(l => { const m = l.match(/\(([^)]+)\)/); return m ? m[1] : ''; })
                      .filter(u => u.startsWith('http'));
                    const uniq = new Set(allExt).size;
                    return uniq === allExt.length
                      ? allExt.length
                      : <div className="flex flex-col">{uniq} <span className="text-[11px] text-slate-400 font-light">unique · {allExt.length} total</span></div>;
                  })()}
                </td>
                <td className="px-4 py-4 bg-stone-50/30 font-serif text-[15px] text-stone-600">{refSeo?.linkDensity?.external ?? 'N/A'}</td>
              </tr>
              <tr className="bg-sand border-y border-stone-200">
                <td colSpan={3} className="px-4 py-2 text-[9.5px] font-bold uppercase tracking-tight text-stone-500">SEO / Meta</td>
              </tr>
              <tr>
                <td className="px-4 py-4 text-[15px] font-serif font-medium text-slate-700">Schema JSON-LD</td>
                <td className="px-4 py-4">{blueprint?.schema_markup ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase border border-emerald-200 shadow-sm"><Check className="w-3 h-3" /> Active</span> : <XCircle className="w-4 h-4 text-red-400" />}</td>
                <td className="px-4 py-4 bg-stone-50/30">{refSeo?.schemaPresence ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase border border-emerald-200 shadow-sm"><Check className="w-3 h-3" /> Active</span> : <XCircle className="w-4 h-4 text-red-400" />}</td>
              </tr>
              <tr>
                <td className="px-4 py-4 text-[15px] font-serif font-medium text-slate-700">Open Graph</td>
                <td className="px-4 py-4">{blueprint?.open_graph_tags?.length > 0 ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase border border-emerald-200 shadow-sm"><Check className="w-3 h-3" /> Active</span> : <XCircle className="w-4 h-4 text-red-400" />}</td>
                <td className="px-4 py-4 bg-stone-50/30">{Object.keys(refSeo?.openGraphTags || {}).length > 0 ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase border border-emerald-200 shadow-sm"><Check className="w-3 h-3" /> Active</span> : <XCircle className="w-4 h-4 text-red-400" />}</td>
              </tr>
              <tr>
                <td className="px-4 py-4 text-[15px] font-serif font-medium text-slate-700 align-top">Title Tag</td>
                <td className="px-4 py-4 text-[11px] font-light leading-snug">{blueprint?.title_tag || <span className="text-slate-400 italic">Not set</span>}</td>
                <td className="px-4 py-4 bg-stone-50/30 text-[11px] font-light leading-snug text-stone-600">{refSeo?.titleTag || <span className="text-slate-400 italic">N/A</span>}</td>
              </tr>
              <tr>
                <td className="px-4 py-4 text-[15px] font-serif font-medium text-slate-700 align-top">Canonical URL</td>
                <td className="px-4 py-4 text-[11px] font-light leading-snug">{blueprint?.slug ? <span className="text-indigo-600">/{blueprint.slug}</span> : <span className="text-slate-400 italic">N/A</span>}</td>
                <td className="px-4 py-4 bg-stone-50/30 text-[11px] font-light leading-snug">{refSeo?.canonicalUrl ? <a href={refSeo.canonicalUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline truncate block max-w-[120px]">{refSeo.canonicalUrl}</a> : <span className="text-slate-400 italic">N/A</span>}</td>
              </tr>
              {refM?.topTerms?.length > 0 && (
                <>
                  <tr className="bg-sand border-y border-stone-200">
                    <td colSpan={3} className="px-4 py-2">
                      <span className="text-[9.5px] font-bold uppercase tracking-tight text-stone-500 inline-flex items-center gap-1">
                        Top N-Gram Terms (Reference)
                        <InfoTooltip text="N-gram analysis identifies most frequent word sequences from competitor pages." />
                      </span>
                    </td>
                  </tr>
                  <tr><td colSpan={3} className="px-4 py-4"><div className="flex flex-wrap gap-1.5">{refM.topTerms.map((term: string, idx: number) => (<span key={idx} className="px-2.5 py-1 bg-white border border-stone-200 text-stone-600 rounded-full text-[11px] font-medium shadow-sm">{term}</span>))}</div></td></tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Details */}
      {sub === 'details' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-400 shrink-0">Show details for:</label>
            <select
              value={detailView}
              onChange={e => setDetailView(e.target.value)}
              className="flex-1 h-9 px-3 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-400 text-slate-700 dark:text-slate-200"
            >
              {detailOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <DetailPanel />
        </div>
      )}
    </div>
  );
}
