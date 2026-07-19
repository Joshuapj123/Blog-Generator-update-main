import { KeywordBankTerm, KeywordBank } from '@/types/article';

export function normalizeTermKey(term: string): string {
  return term
    .toLowerCase()
    .trim()
    .replace(/s$/, '')        // naive plural strip: "keywords" → "keyword"
    .replace(/\s+/g, ' ');   // collapse whitespace
}

export function mergeIntoKeywordBank(
  existing: KeywordBankTerm[],
  incoming: { term: string, source: 'serp_competitor' | 'curated_reference' | 'ai_suggested' | 'manual', freq?: number }[]
): KeywordBankTerm[] {
  const bank = new Map(existing.map(t => [normalizeTermKey(t.term), t]));

  for (const item of incoming) {
    const key = normalizeTermKey(item.term);
    if (bank.has(key)) {
      // Update frequency if this is a SERP source
      const existingTerm = bank.get(key)!;
      if (item.freq !== undefined && item.source === 'serp_competitor') {
        existingTerm.competitorFrequency = Math.max(
          existingTerm.competitorFrequency ?? 0, item.freq
        );
      }
    } else {
      bank.set(key, {
        term: item.term, // preserve original casing
        source: item.source,
        competitorFrequency: item.freq,
        addedAt: new Date().toISOString(),
        usageContext: { inOutline: false, inSections: [], inInlineEdit: false },
        status: 'active'
      });
    }
  }

  return Array.from(bank.values());
}

export function getPromptKeywords(bank: KeywordBank | null, context: 'outline' | 'section' | 'inline'): string[] {
  if (!bank || !bank.terms) return [];
  
  const activeTerms = bank.terms.filter(t => t.status === 'active');
  const pinnedTerms = activeTerms.filter(t => t.isPinned);
  const unpinnedTerms = activeTerms.filter(t => !t.isPinned)
    .sort((a, b) => (b.competitorFrequency ?? 0) - (a.competitorFrequency ?? 0));
    
  const limit = context === 'inline' ? 10 : 20;
  
  // Pinned terms always included, then fill the rest of the limit with top unpinned terms
  const result = [...pinnedTerms];
  for (const t of unpinnedTerms) {
    if (result.length >= limit) break;
    result.push(t);
  }
  
  return result.map(t => t.term);
}

export function updateKeywordUsage(bank: KeywordBank | null, outlineNodes: any[], sections: any[]): KeywordBank | null {
  if (!bank || !bank.terms) return bank;

  const outlineText = JSON.stringify(outlineNodes || []).toLowerCase();
  
  const updatedTerms = bank.terms.map(t => {
    const key = t.term.toLowerCase();
    
    // Check Outline
    const inOutline = outlineText.includes(key);
    
    // Check Sections
    const inSections: string[] = [];
    (sections || []).forEach(sec => {
      const secText = (sec.heading + ' ' + (sec.body || '')).toLowerCase();
      if (secText.includes(key)) {
        inSections.push(sec.heading);
      }
    });

    return {
      ...t,
      usageContext: {
        ...t.usageContext,
        inOutline: inOutline || t.usageContext.inOutline,
        inSections: Array.from(new Set([...(t.usageContext.inSections || []), ...inSections]))
      }
    };
  });

  return { ...bank, terms: updatedTerms, lastUpdated: new Date().toISOString() };
}
