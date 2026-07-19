import { chromium } from 'playwright';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { google } from '@ai-sdk/google';
import { cleanHtmlContent, cleanDom } from './content_cleaner';
import { PaaQuestionItem, ExtractionAuditLog } from '@/types/serp';
import { getLocalCache, setLocalCache } from '../local-cache';
import { generateTextWithTelemetry } from '../gemini-telemetry';

export interface ScrapedCompetitor {
  url: string;
  title: string;
  wordCount: number;
  h2Count: number;
  headings: { tag: string; text: string }[];
  text: string;
  hasTables: boolean;
  tableCount: number;

  readabilitySuccess: boolean;
  fallbackUsed: boolean;
  fallbackType: 'none' | 'dom_synthetic' | 'gemini_summary';
  quality: 'high' | 'medium' | 'low';
  qualityScore: number;
  extractionConfidence: number;
  weight: number;
  paragraphCount: number;
}

export interface SerpCollectorResult {
  competitors: ScrapedCompetitor[];
  competitorTitles: string[];
  medianWordCount: number;
  medianTitleLength: number;
  medianH2Count: number;
  paaQuestions: PaaQuestionItem[];
}

/** Extract domain name from a URL string */
function getDomainName(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    return url.hostname.replace('www.', '');
  } catch (e) {
    return '';
  }
}

/** Runs the multi-layer extraction fallback chain */
export async function runExtractionChain(
  html: string,
  url: string,
  doc: Document,
  runId?: string
): Promise<{
  text: string;
  readabilitySuccess: boolean;
  fallbackUsed: boolean;
  fallbackType: 'none' | 'dom_synthetic' | 'gemini_summary';
  headings: { tag: string; text: string }[];
  h2Count: number;
  paragraphCount: number;
  wordCount: number;
}> {
  let text = '';
  let readabilitySuccess = false;
  let fallbackUsed = false;
  let fallbackType: 'none' | 'dom_synthetic' | 'gemini_summary' = 'none';

  // 1. Primary: Mozilla Readability
  try {
    const readabilityDoc = new JSDOM(html, { url }).window.document;
    const reader = new Readability(readabilityDoc);
    const article = reader.parse();
    if (article && article.textContent && article.textContent.trim().length > 200) {
      text = article.textContent
        .replace(/^\s*[{\["](.*)[}\]"]\s*$/gm, '')
        .replace(/\S{31,}/g, '')
        .replace(/\s{3,}/g, '\n')
        .trim();
      
      const words = text.split(/\s+/).filter(w => w.length > 2);
      if (words.length >= 500) {
        readabilitySuccess = true;
      }
    }
  } catch (err) {
    console.warn(`[serp_collector] Readability parsing failed for ${url}:`, err);
  }

  // 2. Extract elements from DOM (headings, paragraphs, lists, tables, image alts)
  const headings = Array.from(doc.querySelectorAll('h2, h3'))
    .map(h => ({ tag: h.tagName.toLowerCase(), text: (h.textContent || '').trim() }))
    .filter(h => h.text.length > 0);
  const h2Count = doc.querySelectorAll('h2').length;

  const h1s = Array.from(doc.querySelectorAll('h1')).map(el => el.textContent?.trim()).filter(Boolean);
  const h2s = Array.from(doc.querySelectorAll('h2')).map(el => el.textContent?.trim()).filter(Boolean);
  const h3s = Array.from(doc.querySelectorAll('h3')).map(el => el.textContent?.trim()).filter(Boolean);
  const paragraphs = Array.from(doc.querySelectorAll('p')).map(el => el.textContent?.trim()).filter(p => p && p.split(/\s+/).length > 3);
  const listItems = Array.from(doc.querySelectorAll('li')).map(el => el.textContent?.trim()).filter(Boolean);
  
  const tablesText = Array.from(doc.querySelectorAll('table')).map(table => {
    const rows = Array.from(table.querySelectorAll('tr')).map(tr => {
      return Array.from(tr.querySelectorAll('td, th')).map(td => td.textContent?.trim()).filter(Boolean).join(' | ');
    }).filter(Boolean).join('\n');
    return rows;
  }).filter(Boolean);

  const imageAlts = Array.from(doc.querySelectorAll('img')).map(img => (img as HTMLImageElement).alt?.trim()).filter(Boolean);
  const paragraphCount = paragraphs.length;

  if (readabilitySuccess && text) {
    const wordCount = text.split(/\s+/).filter(w => w.length > 2).length;
    return {
      text,
      readabilitySuccess: true,
      fallbackUsed: false,
      fallbackType: 'none',
      headings,
      h2Count,
      paragraphCount,
      wordCount
    };
  }

  // Fallback Layer 1 & 2: Build DOM Synthetic Body
  fallbackUsed = true;
  const syntheticContent = [
    h1s.length ? `=== HEADINGS ===\n${[...h1s, ...h2s, ...h3s].join('\n')}` : '',
    paragraphs.length ? `=== PARAGRAPHS ===\n${paragraphs.join('\n\n')}` : '',
    listItems.length ? `=== LISTS ===\n${listItems.join('\n')}` : '',
    tablesText.length ? `=== TABLES ===\n${tablesText.join('\n\n')}` : '',
    imageAlts.length ? `=== IMAGE ALTS ===\n${imageAlts.join('\n')}` : ''
  ].filter(Boolean).join('\n\n');

  let domText = syntheticContent;
  let domWordCount = domText.split(/\s+/).filter(w => w.length > 2).length;

  if (domWordCount < 100) {
    domText = (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
    domWordCount = domText.split(/\s+/).filter(w => w.length > 2).length;
  }

  // Cost Control: Check if we can use DOM synthetic directly or if we must use Gemini
  const domHeadingCount = h1s.length + h2s.length + h3s.length;
  let provQualityScore = 0;
  if (domWordCount >= 1500) provQualityScore += 30;
  else if (domWordCount >= 1000) provQualityScore += 25;
  else if (domWordCount >= 700) provQualityScore += 20;
  else if (domWordCount >= 500) provQualityScore += 10;
  
  if (h2Count >= 8) provQualityScore += 20;
  else if (h2Count >= 4) provQualityScore += 10;
  else if (h2Count >= 2) provQualityScore += 5;

  if (tablesText.length > 0) provQualityScore += 10;
  if (domText.length >= 5000) provQualityScore += 10;
  else if (domText.length >= 2000) provQualityScore += 5;

  const shouldCallGemini = domWordCount < 800 || domHeadingCount < 3 || provQualityScore < 40;

  if (shouldCallGemini && domText.length > 100) {
    try {
      console.log(`[serp_collector] Cost control trigger hit (words: ${domWordCount}, headings: ${domHeadingCount}, score: ${provQualityScore}). Calling Gemini Layer 3 fallback for ${url}`);
      const prompt = `You are an expert web content extraction tool. Reconstruct a clean, cohesive, structured article body from the raw extracted page content below.
- Do not include website headers, footers, newsletter CTAs, cookie consent notices, sidebar links, or social sharing text.
- Retain all core concepts, keywords, entities, statistics, and headings.
- Format the output using clean paragraphs and list items.
- Output ONLY the structured article body. No explanations or introductory remarks.

RAW EXTRACTED PAGE CONTENT:
${domText.slice(0, 15000)}`;

      const { text: geminiText } = await generateTextWithTelemetry('Competitor Processing', {
        model: google('gemini-2.5-flash'),
        prompt,
        temperature: 0.1,
        cacheKey: 'extract_fallback_' + url,
        runId
      });

      if (geminiText && geminiText.trim().length > 100) {
        const finalText: string = geminiText.trim();
        const finalWordCount = finalText.split(/\s+/).filter(w => w.length > 2).length;
        return {
          text: finalText,
          readabilitySuccess: false,
          fallbackUsed: true,
          fallbackType: 'gemini_summary',
          headings,
          h2Count,
          paragraphCount,
          wordCount: finalWordCount
        };
      }
    } catch (gErr) {
      console.error(`[serp_collector] Fallback Layer 3 (Gemini) failed for ${url}:`, gErr);
    }
  }

  // Use DOM synthetic content directly
  console.log(`[serp_collector] Cost control check passed. Using DOM synthetic content directly for ${url}`);
  return {
    text: domText,
    readabilitySuccess: false,
    fallbackUsed: true,
    fallbackType: 'dom_synthetic',
    headings,
    h2Count,
    paragraphCount,
    wordCount: domWordCount
  };
}

/** Computes extraction confidence and quality score for source pages */
export function calculateQualityAndConfidence(comp: {
  url: string;
  title: string;
  wordCount: number;
  h2Count: number;
  headings: { tag: string; text: string }[];
  text: string;
  hasTables: boolean;
  tableCount: number;
  readabilitySuccess: boolean;
  fallbackUsed: boolean;
  fallbackType: 'none' | 'dom_synthetic' | 'gemini_summary';
}): {
  quality: 'high' | 'medium' | 'low';
  qualityScore: number;
  extractionConfidence: number;
} {
  // 1. Calculate Extraction Confidence (0-100)
  let extractionConfidence = 100;
  if (comp.fallbackUsed) {
    if (comp.fallbackType === 'gemini_summary') {
      extractionConfidence = 75;
    } else if (comp.fallbackType === 'dom_synthetic') {
      extractionConfidence = comp.wordCount >= 1000 ? 65 : 50;
    } else {
      extractionConfidence = 20;
    }
  }

  // 2. Calculate Quality Score (0-100)
  let qualityScore = 0;
  if (comp.readabilitySuccess) qualityScore += 40;
  else qualityScore += 15;
  
  // Word count points
  if (comp.wordCount >= 1500) qualityScore += 30;
  else if (comp.wordCount >= 1000) qualityScore += 25;
  else if (comp.wordCount >= 700) qualityScore += 20;
  else if (comp.wordCount >= 500) qualityScore += 10;

  // Heading count points
  if (comp.h2Count >= 8) qualityScore += 20;
  else if (comp.h2Count >= 4) qualityScore += 10;
  else if (comp.h2Count >= 2) qualityScore += 5;

  // Table presence points
  if (comp.hasTables) qualityScore += 10;

  // Text length / volume points
  const charLength = comp.text.length;
  if (charLength >= 5000) qualityScore += 10;
  else if (charLength >= 2000) qualityScore += 5;

  qualityScore = Math.min(100, qualityScore);

  // 3. Assign Quality Tag
  let quality: 'high' | 'medium' | 'low' = 'medium';
  if (qualityScore >= 70) {
    quality = 'high';
  } else if (qualityScore >= 40) {
    quality = 'medium';
  } else {
    quality = 'low';
  }

  return { quality, qualityScore, extractionConfidence };
}

/** Determines if a competitor should be rejected based on rigorous quality checks */
export function shouldRejectCompetitor(comp: {
  url: string;
  title: string;
  wordCount: number;
  h2Count: number;
  paragraphCount: number;
  extractionConfidence: number;
  qualityScore: number;
  text: string;
}): { reject: boolean; reason?: string } {
  const urlLower = comp.url.toLowerCase();
  
  // Reject LinkedIn and Reddit
  if (urlLower.includes('linkedin.com')) {
    return { reject: true, reason: 'LinkedIn URL' };
  }
  if (urlLower.includes('reddit.com')) {
    return { reject: true, reason: 'Reddit URL' };
  }

  // Reject login-protected or paywalled pages
  const loginPatterns = [
    /log\s*in/i,
    /sign\s*in/i,
    /create\s*account/i,
    /subscribe\s*to\s*read/i,
    /paywall/i,
    /access\s*denied/i,
    /please\s*log\s*in/i,
    /member\s*login/i,
    /password\s*protected/i
  ];

  const titleMatch = loginPatterns.some(p => p.test(comp.title));
  const textPreviewMatch = loginPatterns.some(p => p.test(comp.text.slice(0, 1000)));
  
  if (titleMatch || textPreviewMatch) {
    return { reject: true, reason: 'Login-protected or paywalled content' };
  }

  // Reject if word count < 500
  if (comp.wordCount < 500) {
    return { reject: true, reason: `Word count too low (${comp.wordCount} < 500)` };
  }

  // Reject if heading count < 3
  if (comp.h2Count < 3) {
    return { reject: true, reason: `Heading count too low (${comp.h2Count} < 3)` };
  }

  // Reject if paragraph count < 5
  if (comp.paragraphCount < 5) {
    return { reject: true, reason: `Paragraph count too low (${comp.paragraphCount} < 5)` };
  }

  // Reject if extraction confidence < 50
  if (comp.extractionConfidence < 50) {
    return { reject: true, reason: `Extraction confidence below threshold (${comp.extractionConfidence} < 50)` };
  }

  // Reject if quality score < 40
  if (comp.qualityScore < 40) {
    return { reject: true, reason: `Quality score below threshold (${comp.qualityScore} < 40)` };
  }

  return { reject: false };
}

/** Fetch real SERP organic URLs and PAA questions from Serper or ScrapeBadger */
export async function collectSerpUrlsAndPaa(keyword: string): Promise<{ urls: string[]; paa: PaaQuestionItem[] }> {
  const serpKey = process.env.SERP_KEY;
  const scrapeBadgerKey = process.env.NEXT_PUBLIC_SCRAPE_BADGE;

  let urls: string[] = [];
  let paa: PaaQuestionItem[] = [];

  // Try Serper
  if (serpKey) {
    try {
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': serpKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: keyword, num: 25 }),
      });
      if (res.ok) {
        const data = await res.json();
        
        // Extract PAA
        if (Array.isArray(data.peopleAlsoAsk)) {
          paa = data.peopleAlsoAsk.map((item: any) => ({
            question: item.question || '',
            frequency: 1,
            snippet: item.snippet || ''
          }));
        }

        // Extract organic URLs
        urls = (data.organic ?? [])
          .map((r: any) => r.link as string)
          .filter((u: string) =>
            u &&
            !u.includes('youtube.com') &&
            !u.includes('amazon.') &&
            !u.includes('reddit.com') &&
            !u.includes('linkedin.com') &&
            !u.includes('pinterest.')
          )
          .slice(0, 25);

        if (urls.length >= 2) {
          return { urls, paa };
        }
      }
    } catch (e) {
      console.warn('[serp_collector] Serper search failed:', e);
    }
  }

  // Try ScrapeBadger if Serper failed
  if (scrapeBadgerKey) {
    try {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&num=25&hl=en&gl=us`;
      const res = await fetch('https://scrapebadger.com/v1/web/scrape', {
        method: 'POST',
        headers: { 'X-API-Key': scrapeBadgerKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: searchUrl, format: 'html', render_js: false }),
      });
      if (res.ok) {
        const data = await res.json();
        const html: string = data.data || data.html || data.content || '';
        
        const matches = [...html.matchAll(/href="(\/url\?q=|)(https?:\/\/(?!google)[^"&\s]+)/g)];
        urls = matches
          .map(m => decodeURIComponent(m[2]))
          .filter(u => !u.includes('google.') && !u.includes('youtube.com') && !u.includes('linkedin.com') && !u.includes('reddit.com'))
          .slice(0, 25);
      }
    } catch (e) {
      console.warn('[serp_collector] ScrapeBadger search failed:', e);
    }
  }

  // Fallback static URLs if all APIs fail
  if (urls.length === 0) {
    urls = [
      `https://ahrefs.com/blog/${encodeURIComponent(keyword.toLowerCase().replace(/\s+/g, '-'))}`,
      `https://backlinko.com/${encodeURIComponent(keyword.toLowerCase().replace(/\s+/g, '-'))}`,
      `https://neilpatel.com/blog/${encodeURIComponent(keyword.toLowerCase().replace(/\s+/g, '-'))}`,
    ];
  }

  return { urls, paa };
}

/** Scrapes all URLs using Playwright in concurrent batches with domain diversity filter and replacement engine */
export async function scrapeCompetitors(
  candidateUrls: string[],
  emit?: (stage: string, payload: any) => void,
  options?: { runId?: string }
): Promise<ScrapedCompetitor[]> {
  let browser: any;
  const usableCompetitors: ScrapedCompetitor[] = [];
  const auditLogs: ExtractionAuditLog[] = [];
  const domainCounts: Record<string, number> = {};

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled']
    });

    const batchSize = 3;
    let urlIndex = 0;

    while (usableCompetitors.length < 10 && urlIndex < candidateUrls.length) {
      const batchUrls: string[] = [];

      // Select candidate URLs, filtering domain limits immediately to save resources
      while (batchUrls.length < batchSize && urlIndex < candidateUrls.length) {
        const url = candidateUrls[urlIndex++];
        const domain = getDomainName(url);

        if (domain && domainCounts[domain] >= 2) {
          auditLogs.push({
            url,
            domain,
            readabilitySuccess: false,
            fallbackUsed: false,
            fallbackType: 'none',
            wordCount: 0,
            headingCount: 0,
            paragraphCount: 0,
            qualityScore: 0,
            extractionConfidence: 0,
            weight: 0,
            rejected: true,
            rejectionReason: 'Domain diversity limit reached (max 2 per domain)'
          });
          continue;
        }

        batchUrls.push(url);
      }

      if (batchUrls.length === 0) break;

      if (emit) {
        emit('stage', {
          stage: 2,
          label: `Scraping competitor documents (collected ${usableCompetitors.length}/10)…`,
          percent: 25 + Math.min(40, Math.round((usableCompetitors.length / 10) * 40))
        });
      }

      await Promise.all(batchUrls.map(async (url) => {
        if (usableCompetitors.length >= 10) return;

        const domain = getDomainName(url);
        
        // Check competitor URL cache first
        const compCacheKey = 'competitor_' + url;
        const cachedComp = getLocalCache(compCacheKey);
        if (cachedComp) {
          console.log(`[serp_collector] Cache hit for competitor URL: ${url}`);
          if (usableCompetitors.length < 10) {
            domainCounts[domain] = (domainCounts[domain] || 0) + 1;
            usableCompetitors.push(cachedComp);
            auditLogs.push({
              url,
              domain,
              readabilitySuccess: cachedComp.readabilitySuccess,
              fallbackUsed: cachedComp.fallbackUsed,
              fallbackType: cachedComp.fallbackType,
              wordCount: cachedComp.wordCount,
              headingCount: cachedComp.h2Count,
              paragraphCount: cachedComp.paragraphCount,
              qualityScore: cachedComp.qualityScore,
              extractionConfidence: cachedComp.extractionConfidence,
              weight: cachedComp.weight,
              rejected: false,
              rejectionReason: null
            });
          }
          return;
        }

        const page = await browser.newPage();
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
          const html = await page.content();
          const cleanHtml = cleanHtmlContent(html);
          
          const dom = new JSDOM(cleanHtml, { url });
          const doc = dom.window.document;
          
          // Count tables BEFORE DOM pruning
          const tables = doc.querySelectorAll('table');
          let validTableCount = 0;
          tables.forEach(table => {
            const rows = table.querySelectorAll('tr').length;
            if (rows >= 2) validTableCount++;
          });

          // Prune boilerplate
          cleanDom(doc);

          const title = doc.title || '';
          
          // Run extraction chain
          const extResult = await runExtractionChain(html, url, doc, options?.runId);

          const qualConf = calculateQualityAndConfidence({
            url,
            title,
            wordCount: extResult.wordCount,
            h2Count: extResult.h2Count,
            headings: extResult.headings,
            text: extResult.text,
            hasTables: validTableCount > 0,
            tableCount: validTableCount,
            readabilitySuccess: extResult.readabilitySuccess,
            fallbackUsed: extResult.fallbackUsed,
            fallbackType: extResult.fallbackType
          });

          // Reject low-quality URLs
          const rejectCheck = shouldRejectCompetitor({
            url,
            title,
            wordCount: extResult.wordCount,
            h2Count: extResult.h2Count,
            paragraphCount: extResult.paragraphCount,
            extractionConfidence: qualConf.extractionConfidence,
            qualityScore: qualConf.qualityScore,
            text: extResult.text
          });

          if (rejectCheck.reject) {
            console.log(`[serp_collector] Rejected competitor URL: ${url}. Reason: ${rejectCheck.reason}`);
            auditLogs.push({
              url,
              domain,
              readabilitySuccess: extResult.readabilitySuccess,
              fallbackUsed: extResult.fallbackUsed,
              fallbackType: extResult.fallbackType,
              wordCount: extResult.wordCount,
              headingCount: extResult.h2Count,
              paragraphCount: extResult.paragraphCount,
              qualityScore: qualConf.qualityScore,
              extractionConfidence: qualConf.extractionConfidence,
              weight: 0,
              rejected: true,
              rejectionReason: rejectCheck.reason || 'Failed quality/rejection checks'
            });
            return;
          }

          if (usableCompetitors.length >= 10) return;

          // Accepted! Track domain count
          domainCounts[domain] = (domainCounts[domain] || 0) + 1;

          const competitorRank = usableCompetitors.length + 1;
          const rankWeight = Math.max(0.1, 1.1 - competitorRank * 0.1);
          const qualityMultiplier = qualConf.quality === 'high' ? 1.0 : qualConf.quality === 'medium' ? 0.7 : 0.3;
          const finalWeight = parseFloat(Math.max(0.05, rankWeight * qualityMultiplier).toFixed(2));

          const newCompetitor: ScrapedCompetitor = {
            url,
            title: title.trim() || extResult.headings[0]?.text || 'Untitled Competitor',
            wordCount: extResult.wordCount,
            h2Count: extResult.h2Count,
            headings: extResult.headings,
            text: extResult.text,
            hasTables: validTableCount > 0,
            tableCount: validTableCount,
            
            readabilitySuccess: extResult.readabilitySuccess,
            fallbackUsed: extResult.fallbackUsed,
            fallbackType: extResult.fallbackType,
            quality: qualConf.quality,
            qualityScore: qualConf.qualityScore,
            extractionConfidence: qualConf.extractionConfidence,
            weight: finalWeight,
            paragraphCount: extResult.paragraphCount
          };

          // Cache scraped competitor
          setLocalCache(compCacheKey, newCompetitor);
          usableCompetitors.push(newCompetitor);

          auditLogs.push({
            url,
            domain,
            readabilitySuccess: extResult.readabilitySuccess,
            fallbackUsed: extResult.fallbackUsed,
            fallbackType: extResult.fallbackType,
            wordCount: extResult.wordCount,
            headingCount: extResult.h2Count,
            paragraphCount: extResult.paragraphCount,
            qualityScore: qualConf.qualityScore,
            extractionConfidence: qualConf.extractionConfidence,
            weight: finalWeight,
            rejected: false,
            rejectionReason: null
          });

        } catch (e: any) {
          console.warn(`[serp_collector] Exception while scraping ${url}:`, e);
          auditLogs.push({
            url,
            domain,
            readabilitySuccess: false,
            fallbackUsed: false,
            fallbackType: 'none',
            wordCount: 0,
            headingCount: 0,
            paragraphCount: 0,
            qualityScore: 0,
            extractionConfidence: 0,
            weight: 0,
            rejected: true,
            rejectionReason: `Scraping error: ${e.message || e}`
          });
        } finally {
          await page.close();
        }
      }));
    }
  } catch (error) {
    console.error('[serp_collector] Playwright batch runner error:', error);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  // Attach audit logs to the returned array
  (usableCompetitors as any).auditLogs = auditLogs;

  return usableCompetitors;
}

function getLexicalDiversity(text: string): number {
  if (!text) return 0;
  const tokens = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
  if (tokens.length === 0) return 0;
  return new Set(tokens).size / tokens.length;
}

export function calculateMedians(competitors: ScrapedCompetitor[]): {
  medianWordCount: number;
  medianTitleLength: number;
  medianH2Count: number;
  medianLexicalDiversity: number;
} {
  const getMedian = (arr: number[]) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
  };

  const wordCounts = competitors.map(c => c.wordCount);
  const titleLengths = competitors.map(c => c.title.length);
  const h2Counts = competitors.map(c => c.h2Count);
  const lexicalDiversities = competitors.map(c => getLexicalDiversity(c.text)).filter(ld => ld > 0);

  return {
    medianWordCount: getMedian(wordCounts),
    medianTitleLength: getMedian(titleLengths),
    medianH2Count: getMedian(h2Counts),
    medianLexicalDiversity: getMedian(lexicalDiversities) || 0.45
  };
}
