'use client';

import { useEngine } from '../context/EngineContext';
import { SerpPreviewResult } from '../context/EngineContext';
import { AiKeywordResult, GadsKeywordResult } from '../types';
import { mergeIntoKeywordBank } from '@/lib/keyword-bank';
import { ExtractedDesign } from '@/lib/extract-reference-design';
import { SerpAnalysisResult } from '@/types/serp';

/** Client-side heuristic to label an individual SERP result's format */
function detectFormatHeuristic(title: string, snippet: string): string {
  const text = (title + ' ' + snippet).toLowerCase();
  if (/\bvs\.?\b|\bversus\b|\bcompar/.test(text)) return 'Comparison';
  if (/^(\d+|top \d+|\d+ best|best \d+)\b|\b\d+ (ways|tips|tools|steps|reasons|examples)\b/.test(text)) return 'Listicle';
  if (/\bhow[- ]?to\b|\bstep[- ]by[- ]step\b|\btutorial\b/.test(text)) return 'How-To';
  if (/\breview\b|\brated\b|\bpros and cons\b/.test(text)) return 'Review';
  if (/\bwhat is\b|\bguide\b|\bexplained\b|\bbeginner/.test(text)) return 'Guide';
  if (/\bprice\b|\bplan\b|\bpricin/.test(text)) return 'Landing Page';
  return 'Guide';
}


export function useEngineHandlers() {
  const engine = useEngine();

  const handleSuggestKeywordsAi = async () => {
    if (!engine.title) return;
    engine.setIsSuggestingKeywords(true);
    engine.setShowKeywordResults(false);
    engine.setAiKeywordResults([]);
    try {
      const res = await fetch('/api/suggest-keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: engine.title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      engine.setAiKeywordResults(data.keywords || []);
      engine.setShowKeywordResults(true);
    } catch (err: any) {
      alert('Failed to suggest keywords: ' + err.message);
    } finally {
      engine.setIsSuggestingKeywords(false);
    }
  };

  const handleSuggestKeywordsGads = async () => {
    if (!engine.title) return;
    engine.setIsSuggestingKeywords(true);
    engine.setShowKeywordResults(false);
    engine.setGadsKeywordResults([]);
    try {
      const credsPayload = engine.gadsConnected ? { gadsCreds: engine.gadsCreds } : {};
      const res = await fetch('/api/suggest-keywords-gads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: engine.title, ...credsPayload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      engine.setGadsKeywordResults(data.keywords || []);
      engine.setGadsIsSimulated(data.isSimulated ?? true);
      engine.setShowKeywordResults(true);
    } catch (err: any) {
      alert('Failed to fetch keyword data: ' + err.message);
    } finally {
      engine.setIsSuggestingKeywords(false);
    }
  };

  const handleSuggestKeywordsSerper = async () => {
    if (!engine.title) return;
    engine.setIsSuggestingKeywords(true);
    engine.setShowKeywordResults(false);
    engine.setSerperKeywordResults([]);
    try {
      const res = await fetch('/api/suggest-keywords-serper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: engine.title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      engine.setSerperKeywordResults(data.keywords || []);
      engine.setShowKeywordResults(true);
    } catch (err: any) {
      alert('Failed to fetch live SERP data: ' + err.message);
    } finally {
      engine.setIsSuggestingKeywords(false);
    }
  };

  const handleSuggestKeywords =
    engine.keywordMode === 'ai' ? handleSuggestKeywordsAi
      : engine.keywordMode === 'serper' ? handleSuggestKeywordsSerper
        : handleSuggestKeywordsGads;

  const handleEnhanceWithAi = async () => {
    if (!engine.gadsKeywordResults.length) return;
    engine.setIsEnhancingWithAi(true);
    try {
      const seedKeywords = engine.gadsKeywordResults.slice(0, 6).map(k => k.keyword).join(', ');
      const res = await fetch('/api/suggest-keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `${engine.title} (seed keywords: ${seedKeywords})` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const longTails: GadsKeywordResult[] = (data.keywords as AiKeywordResult[])
        .filter(k => k.intent === 'long-tail')
        .map(k => ({
          keyword: k.keyword,
          avgMonthlySearches: '10–100',
          competition: 'LOW' as const,
          competitionScore: 0.15,
          cpcLow: 0.2,
          cpcHigh: 1.0,
          intent: 'long-tail' as const,
          searchIntent: k.searchIntent,
          isEnhanced: true,
        }));
      engine.setGadsKeywordResults([
        ...engine.gadsKeywordResults.map(k => ({ ...k, isEnhanced: false })),
        ...longTails,
      ]);
    } catch (err: any) {
      alert('Enhance failed: ' + err.message);
    } finally {
      engine.setIsEnhancingWithAi(false);
    }
  };

  const appendKeyword = (kw: string) => {
    engine.setTargetKeywords(
      engine.targetKeywords.trim()
        ? `${engine.targetKeywords.trim()}, ${kw}`
        : kw
    );
  };

  const runPlaywrightExtraction = async (): Promise<ExtractedDesign> => {
    if (!engine.referenceUrl) throw new Error('Reference URL required');
    engine.setReferenceData(null);

    const res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: engine.referenceUrl }),
    });
    if (!res.body) throw new Error('No stream');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let extractedData: ExtractedDesign | null = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === 'stage') {
            engine.setPipelineStage(Math.floor(event.stage));
          } else if (event.type === 'done') {
            engine.setPipelineStage(6);
            engine.setReferenceData(event.data);
            extractedData = event.data;

            if (event.data.extractedEntities?.length > 0) {
              engine.setKeywordBank((prev: any) => {
                const incoming = event.data.extractedEntities.map((e: any) => ({
                  term: e.term,
                  source: 'curated_reference' as const,
                }));
                const newTerms = mergeIntoKeywordBank(prev?.terms || [], incoming);
                return {
                  planId: prev?.planId || 'unknown',
                  targetKeyword: prev?.targetKeyword || engine.title,
                  serpPagesAnalysed: prev?.serpPagesAnalysed || 0,
                  terms: newTerms,
                  lastUpdated: new Date().toISOString(),
                };
              });
            }
          } else if (event.type === 'error') {
            throw new Error(event.message);
          }
        } catch (e: any) { 
          if (e.message && line.includes('"type":"error"')) throw e;
        }
      }
    }
    
    if (!extractedData) throw new Error('Failed to extract data');
    return extractedData;
  };

  const runSerpExtraction = async (): Promise<SerpAnalysisResult | null> => {
    const keyword = engine.activeKeyword || engine.targetKeywords.split(',')[0].trim() || engine.title;
    if (!keyword) throw new Error('Keyword required for SERP extraction');

    const res = await fetch('/api/serp-extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword }),
    });
    if (!res.body) throw new Error('No stream');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === 'done') {
            engine.setSerpAnalysis(event.data);
            engine.setSerpTerms(event.data.terms || []);
            engine.setKeywordBank((prev: any) => {
              const incoming = (event.data.terms || []).map((t: any) => ({
                term: t.term,
                source: 'serp_competitor' as const,
                freq: t.relevanceScore,
              }));
              const newTerms = mergeIntoKeywordBank(prev?.terms || [], incoming);
              return {
                planId: prev?.planId || 'unknown',
                targetKeyword: prev?.targetKeyword || keyword,
                serpPagesAnalysed: event.data.analyzedCompetitors || 10,
                terms: newTerms,
                lastUpdated: new Date().toISOString(),
              };
            });
            const serpTitlesFromExtract: string[] = (event.data.terms || [])
              .slice(0, 5)
              .map((t: any) => t.term);
            classifySearchIntent(serpTitlesFromExtract);
            return event.data;
          } else if (event.type === 'error') {
            throw new Error(event.message);
          }
        } catch (e: any) {
          if (e.message && line.includes('"type":"error"')) throw e;
        }
      }
    }
    return null;
  };

  const classifySearchIntent = async (titles: string[]) => {
    const keyword = engine.activeKeyword || engine.targetKeywords.split(',')[0].trim() || engine.title;
    if (!keyword) return;
    try {
      const res = await fetch('/api/classify-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, serpTitles: titles }),
      });
      const data = await res.json();
      if (res.ok) engine.setIntentClassification(data);
    } catch (e) {
      console.error('[classify-intent]', e);
    }
  };

  const runGeminiAnalysis = async (refData: ExtractedDesign): Promise<any> => {
    if (!refData?.rawText) throw new Error('Raw text required for AI analysis');
    const res = await fetch('/api/analyze-reference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawText: refData.rawText,
        mediaContext: refData.mediaContext,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to analyze reference');
    return data.aiAnalysis;
  };

  const handleUnifiedIntelligence = async (force = false) => {
    const cacheKey = `ext_cache_${engine.title}_${engine.referenceUrl}`;
    if (!force) {
      try {
        const cachedStr = localStorage.getItem(cacheKey);
        if (cachedStr) {
          const cached = JSON.parse(cachedStr);
          if (cached.referenceData) engine.setReferenceData(cached.referenceData);
          if (cached.aiStrategyProfile) engine.setAiStrategyProfile(cached.aiStrategyProfile);
          if (cached.serpTerms) engine.setSerpTerms(cached.serpTerms);
          if (cached.serpAnalysis) engine.setSerpAnalysis(cached.serpAnalysis);
          engine.setExtractionComplete(true);
          engine.setPipelineStage(9);
          return;
        }
      } catch (e) {}
    }

    engine.setPipelineStage(1);
    engine.setPipelineError(null);
    engine.setExtractionComplete(false);
    engine.setAiStrategyProfile(null);

    let succeeded = false;
    try {
      const serpPromise = runSerpExtraction().catch(err => {
        console.error('[serp-extract] background error:', err);
        throw err;
      }); 

      // 2. Run Playwright stages 1–6 with UI updates
      const refData = await runPlaywrightExtraction();
      
      // 2.5 Run NLP Sidecar extraction to persist data early
      engine.setPipelineStage(6.5);
      try {
        const nlpRes = await fetch('/api/nlp-extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rawText: refData.rawText,
            rawHtml: refData.rawHtml,
            serpContext: {} // Empty context for now, or you could pass titles if available
          })
        });
        if (nlpRes.ok) {
          refData.nlpExtraction = await nlpRes.json();
        }
      } catch (e) {
        console.error('[handleUnifiedIntelligence] nlp-extract failed', e);
      }

      // 3. Show Stage 7 — await SERP if not done yet
      engine.setPipelineStage(7); 
      const serpAnalysisData = await serpPromise;

      // 4. Show Stage 8 — trigger AI Strategy generation
      engine.setPipelineStage(8); 
      const aiAnalysis = await runGeminiAnalysis(refData);
      
      // Update engine state with AI analysis
      const finalRefData = refData ? { ...refData, aiAnalysis } : refData;
      engine.setReferenceData(finalRefData);
      engine.setAiStrategyProfile(aiAnalysis);
      engine.setSerpTerms(serpAnalysisData?.terms || []);
      engine.setSerpAnalysis(serpAnalysisData);
      
      engine.setExtractionComplete(true);
      engine.setPipelineStage(9);
      succeeded = true;

      try {
        localStorage.setItem(cacheKey, JSON.stringify({
          referenceData: finalRefData,
          aiStrategyProfile: aiAnalysis,
          serpTerms: serpAnalysisData?.terms || [],
          serpAnalysis: serpAnalysisData,
        }));
      } catch (e) {}

      // Persist to Firestore if we have a current article
      if (engine.currentArticleId) {
        engine.saveCurrentArticle(engine.tiptapContent);
      }
    } catch (err: any) {
      console.error('Extraction pipeline error:', err);
      engine.setPipelineError({ stage: engine.pipelineStage, message: err.message || 'Extraction failed', canRetry: true });
    } finally {
      if (!succeeded && !engine.pipelineError) {
        engine.setPipelineStage(0);
      }
    }
  };

  const handleFetchSerpPreview = async () => {
    const keyword = engine.activeKeyword || engine.targetKeywords.split(',')[0].trim();
    if (!keyword) return;

    const cacheKey = `serp_cache_${engine.title}_${keyword}`;
    try {
      const cachedStr = localStorage.getItem(cacheKey);
      if (cachedStr) {
        const cachedResults = JSON.parse(cachedStr);
        engine.setSerpPreviewResults(cachedResults);
        return;
      }
    } catch (e) {}


    engine.setIsFetchingSerpPreview(true);
    engine.setSerpPreviewResults([]);
    engine.setSelectedSerpResult(null);

    try {
      // 1. Fetch top 10 organic results
      const previewRes = await fetch('/api/serp-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword }),
      });
      const previewData = await previewRes.json();
      if (!previewRes.ok) throw new Error(previewData.error || 'SERP preview failed');

      const rawResults: SerpPreviewResult[] = (previewData.results || []).map((r: any) => ({
        ...r,
        detectedFormat: detectFormatHeuristic(r.title, r.snippet),
      }));

      // 2. Batch AI format detection to find the dominant format
      try {
        const fmtRes = await fetch('/api/detect-format', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ top10: rawResults }),
        });
        if (fmtRes.ok) {
          const fmtData = await fmtRes.json();
          // Mark the first result whose heuristic matches the AI dominant format
          if (fmtData.format) {
            let marked = false;
            const enriched = rawResults.map((r) => {
              if (!marked && r.detectedFormat === fmtData.format) {
                marked = true;
                return { ...r, isAiRecommended: true, aiDominantFormat: fmtData.format };
              }
              return r;
            });
            engine.setSerpPreviewResults(enriched as SerpPreviewResult[]);
            try { localStorage.setItem(cacheKey, JSON.stringify(enriched)); } catch(e) {}
            return;
          }
        }
      } catch {
        // AI format detection is non-blocking — fall through with heuristic labels only
      }

      engine.setSerpPreviewResults(rawResults);
      try { localStorage.setItem(cacheKey, JSON.stringify(rawResults)); } catch(e) {}
    } catch (err: any) {
      console.error('[handleFetchSerpPreview]', err);
    } finally {
      engine.setIsFetchingSerpPreview(false);
    }
  };

  return {
    handleSuggestKeywords,
    handleEnhanceWithAi,
    appendKeyword,
    classifySearchIntent,
    handleFetchSerpPreview,
    handleUnifiedIntelligence,
  };
}
