import { JSDOM } from 'jsdom';
import { cleanHtmlContent } from '../seo-intelligence/content_cleaner';
import { GeminiProvider } from '../content/GeminiProvider';
import { DryRunLLMProvider } from '../core/GenerationPipelineAdapter';
import { verifyUrlSafety } from '../research/url-verifier';
import { SaaSProfileSchema, SaaSProfile } from '@/core/contracts/schemas';
import { LLMProvider } from '@/core/contracts/providers';
import { z } from 'zod';

export class WebsiteIntelligenceService {
  private llm: LLMProvider;

  constructor() {
    const dryRun = process.env.ENABLE_DRY_RUN === 'true';
    this.llm = (dryRun ? new DryRunLLMProvider() : new GeminiProvider()) as LLMProvider;
  }

  private cleanHomepageDom(doc: Document): void {
    const selectorsToPrune = [
      'script', 'style', 'noscript', 'svg', 'template', 'iframe',
      '.cookie', '.cookie-consent', '#cookie-consent', '.onetrust-consent-sdk',
      '[class*="consent"]', '[id*="consent"]',
      '[class*="privacy"]', '[id*="privacy"]',
      '.ad', '.ads', '.ad-box', '.advertisement',
      '.social-share', '.share', '[class*="social"]',
      '.popover', '.tooltip'
    ];
    selectorsToPrune.forEach(selector => {
      try {
        doc.querySelectorAll(selector).forEach(el => el.remove());
      } catch (e) {
        // ignore invalid selectors
      }
    });
  }

  async crawlUrl(url: string): Promise<string> {
    let html = '';

    // Primary: Fast standard HTTP fetch (Serverless-safe, zero external binary dependency)
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(12000)
      });

      if (res.ok) {
        html = await res.text();
      } else {
        console.warn(`[website-intelligence] Primary fetch returned status ${res.status} for ${url}`);
      }
    } catch (fetchErr: any) {
      console.warn(`[website-intelligence] Primary fetch failed for ${url}:`, fetchErr.message);
    }

    // Secondary / Fallback: Dynamic lazy-loaded Playwright (only attempted if fetch produced no content and running in an environment supporting it)
    if (!html || html.trim().length < 100) {
      try {
        const pw = await import('playwright');
        if (pw && pw.chromium) {
          const browser = await pw.chromium.launch({
            headless: true,
            args: ['--disable-blink-features=AutomationControlled']
          });
          try {
            const page = await browser.newPage();
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
            html = await page.content();
          } finally {
            await browser.close();
          }
        }
      } catch (pwErr: any) {
        console.warn('[website-intelligence] Playwright fallback unavailable or failed:', pwErr.message);
      }
    }

    if (!html) {
      return '';
    }

    const cleanHtml = cleanHtmlContent(html);
    
    // Strategy 1: Safe homepage DOM cleaning (retaining nav, header, footer, and class*="widget" layout elements)
    const dom1 = new JSDOM(cleanHtml, { url });
    const doc1 = dom1.window.document;
    this.cleanHomepageDom(doc1);
    let textContent = doc1.body?.textContent || '';
    let cleanedText = textContent.replace(/\s+/g, ' ').trim();

    // Safeguard 1: If extracted text is suspiciously small (< 40 chars), fall back to raw JSDOM text without pruning
    if (cleanedText.length < 40) {
      console.log(`[website-intelligence] Safe homepage DOM extracted text is too short (${cleanedText.length} chars). Running Strategy 2 (raw DOM text without pruning)...`);
      
      const dom2 = new JSDOM(cleanHtml, { url });
      const doc2 = dom2.window.document;
      // Prune only script/style/svg/iframe tags
      doc2.querySelectorAll('script, style, noscript, svg, iframe').forEach(el => el.remove());
      const rawText = doc2.body?.textContent || '';
      const cleanedRawText = rawText.replace(/\s+/g, ' ').trim();
      
      if (cleanedRawText.length > cleanedText.length) {
        cleanedText = cleanedRawText;
      }
    }

    // Safeguard 2: If still too short (< 20 chars), fall back to basic regex stripping from raw cleaned HTML
    if (cleanedText.length < 20) {
      console.log(`[website-intelligence] Strategy 2 text is too short (${cleanedText.length} chars). Running Strategy 3 (regex html tag strip)...`);
      const regexStripped = cleanHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      if (regexStripped.length > cleanedText.length) {
        cleanedText = regexStripped;
      }
    }
    
    return cleanedText;
  }

  async extractBusinessProfile(url: string, runId?: string): Promise<{ profile: SaaSProfile; candidateKeywords: string[] }> {
    // 1. Verify URL safety
    const safety = await verifyUrlSafety(url);
    if (!safety.safe || !safety.url) {
      throw new Error(safety.error || 'URL safety verification failed.');
    }

    // 2. Fetch/Scrape homepage text content using dedicated safe crawler
    const textContent = await this.crawlUrl(url);
    if (!textContent) {
      throw new Error(`Failed to extract content from website URL: ${url}`);
    }

    // Truncate to limit token costs while preserving primary branding/copy
    const cleanedText = textContent.trim().slice(0, 12000);

    // 3. Structured SaaSProfile extraction
    const profilePrompt = `You are an elite business analyst. Analyze the following website homepage content to extract details for this business/SaaS:
URL: ${url}
Website Text:
${cleanedText}

Generate a structured business profile matching the requested schema. Ensure the keyFeatures and primaryCompetitors are filled out, description is comprehensive, and name is the actual business name.`;

    const profile = await this.llm.structuredGenerate<SaaSProfile>(profilePrompt, SaaSProfileSchema, {
      operation: 'URL Profile Extraction',
      runId,
      systemInstruction: 'Output a valid JSON matching the SaaSProfileSchema.'
    });

    // 4. Generate candidate seed keywords spanning distinct business pillars
    const keywordSchema = z.object({
      keywords: z.array(z.string().min(1)).min(4).max(6).describe('List of 4-6 high-intent target SEO search terms covering distinct business pillars.')
    });

    const keywordPrompt = `You are an elite SEO strategist. Based on this business profile, generate 4 to 6 target SEO search queries that represent the company's primary business across distinct strategic pillars.

SaaS Name: ${profile.name}
Description: ${profile.description}
Key Features: ${profile.keyFeatures?.join(', ')}
Target Audience: ${profile.targetAudience}

CRITICAL DIVERSIFICATION RULES:
1. Cover at least 3 distinct conceptual pillars:
   - Pillar 1: Core Product / Primary Value Proposition (e.g., "best [core product category] app", "[core solution] software")
   - Pillar 2: Core Problem / JTBD (e.g., "how to [solve primary customer problem]", "manage [core job]")
   - Pillar 3: Category Alternative / Comparison (e.g., "[brand/category] alternatives", "[brand] vs [competitor]")
   - Pillar 4: Feature Differentiator (a key unique feature or capability)
2. SECONDARY FEATURE RULE: Secondary features, integrations, or auxiliary capabilities MUST NOT dominate the candidate set. Novelty or low competition alone must NOT cause a secondary feature to dominate.
3. DOMINANT CLUSTER RULE: No more than 50% of candidates may belong to the same semantic cluster (e.g., sharing the same feature root like 'podcast' or 'audio' when the core product is an RSS reader).
4. Ground every keyword in the primary business offering. Return lowercase, search-friendly query strings.`;

    let candidateKeywords: string[] = [];
    try {
      const keywordResult = await this.llm.structuredGenerate<z.infer<typeof keywordSchema>>(keywordPrompt, keywordSchema, {
        operation: 'Autopilot Seed Keyword Generation',
        runId,
        systemInstruction: 'Output a valid JSON containing 4-6 lowercase keyword strings spanning distinct strategic pillars.'
      });
      candidateKeywords = keywordResult.keywords || [];
    } catch (err: any) {
      console.warn('[website-intelligence] Seed keyword generation failed, using profile fallback:', err.message);
      const name = profile.name.toLowerCase().trim();
      candidateKeywords = [
        `best ${name} alternatives`,
        `how to choose ${name} platform`,
        `${name} review`,
        `how to use ${name}`
      ];
    }

    // 5. Programmatic cluster concentration detection and enforcement
    const clusterAnalysis = detectSemanticCluster(candidateKeywords, profile);
    if (clusterAnalysis.isConcentrated && clusterAnalysis.dominantStem) {
      console.warn(`[website-intelligence] Secondary cluster dominance detected: "${clusterAnalysis.dominantStem}" (${clusterAnalysis.dominantCount}/${clusterAnalysis.totalCount} keywords). Attempting rebalancing...`);
      
      try {
        const rebalancePrompt = `The previous SEO candidate keywords were overly concentrated on the secondary feature "${clusterAnalysis.dominantStem}" (${clusterAnalysis.dominantCount} of ${clusterAnalysis.totalCount} keywords).
Regenerate 4 to 6 target SEO keywords for "${profile.name}".
Primary Business Description: ${profile.description}
Key Features: ${profile.keyFeatures?.join(', ')}

MANDATORY REBALANCING RULES:
1. At most 1 keyword may mention or relate to "${clusterAnalysis.dominantStem}".
2. All other keywords MUST target the primary business value proposition, core problem/JTBD, and category alternatives.
3. Represent at least 3 distinct conceptual pillars. Return lowercase strings.`;

        const rebalancedResult = await this.llm.structuredGenerate<z.infer<typeof keywordSchema>>(rebalancePrompt, keywordSchema, {
          operation: 'Autopilot Seed Keyword Generation',
          runId,
          systemInstruction: 'Output a valid JSON containing 4-6 balanced lowercase keyword strings.'
        });
        
        if (rebalancedResult.keywords && rebalancedResult.keywords.length >= 4) {
          candidateKeywords = rebalancedResult.keywords;
        }
      } catch (rebalanceErr: any) {
        console.warn('[website-intelligence] Rebalancing LLM call failed, applying deterministic adjustment:', rebalanceErr.message);
      }
    }

    // Deterministic guarantee: enforce maximum cluster concentration rule
    const { keywords: finalKeywords, wasAdjusted, clusterAnalysis: finalAnalysis } = enforceKeywordDiversification(candidateKeywords, profile);
    if (wasAdjusted && finalAnalysis.dominantStem) {
      console.log(`[website-intelligence] Enforced keyword diversification: pruned excess secondary cluster "${finalAnalysis.dominantStem}". Final count: ${finalKeywords.length}`);
    }

    return {
      profile: {
        ...profile,
        website: url
      },
      candidateKeywords: finalKeywords
    };
  }
}

export interface ClusterAnalysis {
  isConcentrated: boolean;
  dominantStem?: string;
  dominantCount: number;
  totalCount: number;
  concentrationRatio: number;
  isPrimaryBusiness: boolean;
}

const COMMON_SEO_STOPWORDS = new Set([
  'best', 'top', 'vs', 'versus', 'how', 'to', 'what', 'is', 'for', 'in', 'of',
  'and', 'or', 'the', 'a', 'an', 'app', 'apps', 'tool', 'tools', 'software',
  'platform', 'online', 'free', 'guide', 'solutions', 'solution', 'alternatives',
  'alternative', 'service', 'services', 'system', 'systems', 'review', 'reviews',
  'with', 'by', 'on', 'at', 'from', 'into', 'use', 'using', 'build', 'create'
]);

export function normalizeWordStem(word: string): string {
  let stem = word.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  if (stem.length <= 2) return '';
  if (stem.endsWith('ing') && stem.length > 5) stem = stem.slice(0, -3);
  else if (stem.endsWith('ies') && stem.length > 4) stem = stem.slice(0, -3) + 'y';
  else if (stem.endsWith('es') && stem.length > 4) stem = stem.slice(0, -2);
  else if (stem.endsWith('s') && !stem.endsWith('ss') && stem.length > 3) stem = stem.slice(0, -1);
  return stem;
}

export function detectSemanticCluster(keywords: string[], profile: SaaSProfile): ClusterAnalysis {
  if (!keywords || keywords.length === 0) {
    return {
      isConcentrated: false,
      dominantCount: 0,
      totalCount: 0,
      concentrationRatio: 0,
      isPrimaryBusiness: false
    };
  }

  const stemFrequency = new Map<string, number>();

  for (const kw of keywords) {
    const words = kw.toLowerCase().split(/\s+/);
    const seenStemsInKw = new Set<string>();

    for (const rawWord of words) {
      const stem = normalizeWordStem(rawWord);
      if (stem && !COMMON_SEO_STOPWORDS.has(stem) && !seenStemsInKw.has(stem)) {
        seenStemsInKw.add(stem);
      }
    }

    for (const stem of seenStemsInKw) {
      stemFrequency.set(stem, (stemFrequency.get(stem) || 0) + 1);
    }
  }

  let dominantStem: string | undefined;
  let maxCount = 0;

  for (const [stem, count] of stemFrequency.entries()) {
    if (count > maxCount) {
      maxCount = count;
      dominantStem = stem;
    }
  }

  const totalCount = keywords.length;
  const concentrationRatio = totalCount > 0 ? maxCount / totalCount : 0;

  // Check if dominant stem genuinely belongs to the primary business offering
  let isPrimaryBusiness = false;
  if (dominantStem) {
    const nameLower = (profile.name || '').toLowerCase();
    const descLower = (profile.description || '').toLowerCase();
    const firstSentence = descLower.split(/[.!?]/)[0] || descLower;
    const normDom = normalizeWordStem(dominantStem);

    const nameMatches = nameLower.split(/\s+/).some(w => normalizeWordStem(w) === normDom);
    const primaryDescMatches = firstSentence.split(/\s+/).some(w => normalizeWordStem(w) === normDom);

    if (nameMatches || primaryDescMatches) {
      isPrimaryBusiness = true;
    }
  }

  // A cluster is considered overly concentrated if > 50% of candidates share the stem
  // AND it is NOT the primary business
  const isConcentrated = concentrationRatio > 0.50 && !isPrimaryBusiness;

  return {
    isConcentrated,
    dominantStem,
    dominantCount: maxCount,
    totalCount,
    concentrationRatio,
    isPrimaryBusiness
  };
}

export function enforceKeywordDiversification(
  keywords: string[],
  profile: SaaSProfile
): { keywords: string[]; clusterAnalysis: ClusterAnalysis; wasAdjusted: boolean } {
  const analysis = detectSemanticCluster(keywords, profile);

  if (!analysis.isConcentrated || !analysis.dominantStem) {
    return { keywords, clusterAnalysis: analysis, wasAdjusted: false };
  }

  // Concentration on secondary feature detected!
  // Enforce max 50% rule: at most Math.floor(keywords.length / 2) candidates may contain the dominant stem.
  const maxAllowed = Math.floor(keywords.length / 2);
  const dominantStem = analysis.dominantStem;
  const preserved: string[] = [];
  let dominantKept = 0;

  for (const kw of keywords) {
    const words = kw.toLowerCase().split(/\s+/).map(normalizeWordStem);
    const hasStem = words.includes(dominantStem);
    if (hasStem) {
      if (dominantKept < maxAllowed) {
        preserved.push(kw);
        dominantKept++;
      }
    } else {
      preserved.push(kw);
    }
  }

  // Backfill with primary business keywords covering Core Product & Problem/JTBD
  const name = profile.name.toLowerCase().trim();
  const fallbackCandidates = [
    `best ${name} alternatives`,
    `how to choose ${name} platform`,
    `${name} review for small business`,
    `how to use ${name}`
  ];

  for (const fallback of fallbackCandidates) {
    if (preserved.length >= keywords.length) break;
    if (!preserved.includes(fallback)) {
      preserved.push(fallback);
    }
  }

  const finalAnalysis = detectSemanticCluster(preserved, profile);

  return {
    keywords: preserved,
    clusterAnalysis: finalAnalysis,
    wasAdjusted: true
  };
}
