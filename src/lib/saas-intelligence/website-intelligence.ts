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
    // Strategy 1: Safe homepage DOM cleaning
    const dom1 = new JSDOM(cleanHtml, { url });
    const doc1 = dom1.window.document;

    // Preserve critical metadata from <head> before cleaning DOM
    const metaParts: string[] = [];
    const titleEl = doc1.querySelector('title');
    if (titleEl?.textContent?.trim()) {
      metaParts.push(`Title: ${titleEl.textContent.trim()}`);
    }
    const canonicalLink = doc1.querySelector('link[rel="canonical" i]')?.getAttribute('href')?.trim();
    if (canonicalLink) {
      metaParts.push(`Canonical URL: ${canonicalLink}`);
    }
    const metaDesc = doc1.querySelector('meta[name="description" i]')?.getAttribute('content')?.trim();
    if (metaDesc) {
      metaParts.push(`Description: ${metaDesc}`);
    }
    const ogTitle = doc1.querySelector('meta[property="og:title" i]')?.getAttribute('content')?.trim();
    if (ogTitle && (!titleEl || ogTitle !== titleEl.textContent?.trim())) {
      metaParts.push(`OG Title: ${ogTitle}`);
    }
    const ogDesc = doc1.querySelector('meta[property="og:description" i]')?.getAttribute('content')?.trim();
    if (ogDesc && ogDesc !== metaDesc) {
      metaParts.push(`OG Description: ${ogDesc}`);
    }
    const ogSiteName = doc1.querySelector('meta[property="og:site_name" i]')?.getAttribute('content')?.trim();
    if (ogSiteName) {
      metaParts.push(`Site Name: ${ogSiteName}`);
    }
    const metaKeywords = doc1.querySelector('meta[name="keywords" i]')?.getAttribute('content')?.trim();
    if (metaKeywords) {
      metaParts.push(`Keywords: ${metaKeywords}`);
    }
    const metaHeader = metaParts.join('\n');

    this.cleanHomepageDom(doc1);

    // Priority 1: Extract substantive content container (<main>, <article>, #content, etc.)
    const mainEl = doc1.querySelector('main, article, #content, .main-content, [role="main"]');
    let textContent = '';
    const mainCleaned = mainEl ? (mainEl.textContent || '').replace(/\s+/g, ' ').trim() : '';

    if (mainCleaned.length >= 80) {
      textContent = mainCleaned;
    } else {
      // If substantive text exists outside nav/header/footer, prune nav/header/footer to prevent navigation noise
      const docClone = new JSDOM(cleanHtml, { url }).window.document;
      this.cleanHomepageDom(docClone);
      docClone.querySelectorAll('nav, header, footer').forEach(el => el.remove());
      const bodyWithoutNav = (docClone.body?.textContent || '').replace(/\s+/g, ' ').trim();
      if (bodyWithoutNav.length >= 80) {
        textContent = bodyWithoutNav;
      } else {
        textContent = doc1.body?.textContent || '';
      }
    }

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

    if (metaHeader) {
      cleanedText = `${metaHeader}\n\n${cleanedText}`.trim();
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
    let textContent = '';
    let crawlFailureReason: string | undefined;
    try {
      textContent = await this.crawlUrl(url);
    } catch (crawlErr: any) {
      crawlFailureReason = crawlErr.message || 'Crawl request failed';
      console.warn(`[website-intelligence] Crawl failed for ${url}:`, crawlFailureReason);
    }

    const resolvedHost = safety.url?.hostname || new URL(url).hostname;
    const cleanHost = resolvedHost.replace(/^www\./i, '');
    const brandRaw = cleanHost.split('.')[0] || 'Brand';
    const brandName = brandRaw.charAt(0).toUpperCase() + brandRaw.slice(1);

    // If crawl produced zero text or failed completely
    if (!textContent || textContent.trim().length === 0) {
      console.warn(`[website-intelligence] Website returned zero content for ${url}. Returning explicit FAILED crawl status.`);
      const failedProfile: SaaSProfile = {
        name: brandName,
        website: safety.normalizedUrl || url,
        canonicalUrl: safety.normalizedUrl || url,
        description: `${brandName} website (unreadable content).`,
        businessType: 'UNKNOWN',
        verifiedOfferings: [],
        keyFeatures: [],
        identityConfidence: 'LOW',
        primaryCompetitors: [],
        targetAudience: 'General audience',
        tone: 'Professional and authoritative',
        customInsights: '',
        crawlStatus: 'FAILED',
        extractedTextLength: 0,
        crawlFailureReason: crawlFailureReason || 'Website returned empty or unreadable content',
        targetExcerpts: []
      };

      return {
        profile: failedProfile,
        candidateKeywords: [
          `${brandRaw} overview`,
          `${brandRaw} guide`,
          `evaluating ${brandRaw}`,
          `${brandRaw} industry analysis`
        ]
      };
    }

    // Truncate to limit token costs while preserving primary branding/copy
    const cleanedText = textContent.trim().slice(0, 12000);
    const canonicalMatch = cleanedText.match(/^Canonical URL:\s*(\S+)/m);
    const canonicalUrl = canonicalMatch ? canonicalMatch[1] : (safety.normalizedUrl || url);
    const targetExcerpts = extractTargetExcerpts(cleanedText, 8);

    // Guard against sparse/empty pages forcing hallucinations (<80 chars)
    if (cleanedText.length < 80) {
      console.warn(`[website-intelligence] Website text is sparse (${cleanedText.length} chars) for ${url}. Using conservative fallback profile without inventing features.`);
      const detected = detectBusinessTypeFromTextAndUrl(cleanedText, url);

      const isKnownAgency = detected.businessType === 'Agency/Portfolio' || detected.businessType === 'Services';
      const isKnownSaaS = detected.businessType === 'SaaS';

      let fallbackDesc = `${brandName} digital presence.`;
      if (isKnownAgency) {
        fallbackDesc = `${brandName} professional practice and services.`;
      } else if (isKnownSaaS) {
        fallbackDesc = `${brandName} software service.`;
      }

      const fallbackProfile: SaaSProfile = {
        name: brandName,
        website: safety.normalizedUrl || url,
        canonicalUrl: canonicalUrl,
        description: fallbackDesc,
        businessType: detected.businessType,
        verifiedOfferings: detected.verifiedOfferings, // only offerings in text; empty if none
        identityConfidence: 'LOW',
        keyFeatures: detected.verifiedOfferings,
        primaryCompetitors: [],
        targetAudience: isKnownAgency ? 'Clients and partners' : (isKnownSaaS ? 'Software users and teams' : 'General audience'),
        tone: 'Professional and authoritative',
        customInsights: '',
        crawlStatus: 'SPARSE',
        extractedTextLength: cleanedText.length,
        targetExcerpts: targetExcerpts
      };

      const fallbackKeywords = isKnownAgency
        ? [
            `${brandRaw} services`,
            `${brandRaw} methodology`,
            `best practices for ${brandRaw}`,
            `${brandRaw} process`
          ]
        : (isKnownSaaS
          ? [
              `${brandRaw} software`,
              `${brandRaw} overview`,
              `best ${brandRaw} alternatives`,
              `${brandRaw} review`
            ]
          : [
              `${brandRaw} overview`,
              `${brandRaw} guide`,
              `evaluating ${brandRaw}`,
              `how to choose ${brandRaw}`
            ]
        );

      return {
        profile: fallbackProfile,
        candidateKeywords: fallbackKeywords
      };
    }

    // 3. Structured SaaSProfile extraction
    const detected = detectBusinessTypeFromTextAndUrl(cleanedText, url);
    const profilePrompt = `You are an elite business analyst. Analyze the following website homepage content to extract details for this business:
URL: ${url}
Website Text:
${cleanedText}

Generate a structured business profile matching the requested schema.
CRITICAL ARCHETYPE & OFFERING ACCURACY:
1. Accurately identify the businessType: 'SaaS' (software product/tool/app), 'Agency/Portfolio' (design studio, consultancy, freelancer, agency, portfolio), 'Ecommerce' (online store selling physical goods), 'Publisher/Blog' (media/content site), 'Services' (professional service provider), or 'Other'.
2. DO NOT classify consultancies, design studios, agencies, or individual portfolios as 'SaaS' or software platforms!
3. Populate verifiedOfferings with concrete, explicit services or capabilities mentioned in the text (e.g. ['UX Audits', 'Onboarding Redesign']).
4. Set identityConfidence to 'HIGH' if the archetype is clearly stated, 'MEDIUM' if inferred, or 'LOW' if ambiguous.
5. Ensure keyFeatures reflects their actual services or capabilities, and name is the actual business name.`;

    const profile = await this.llm.structuredGenerate<SaaSProfile>(profilePrompt, SaaSProfileSchema, {
      operation: 'URL Profile Extraction',
      runId,
      systemInstruction: 'Output a valid JSON matching the SaaSProfileSchema.'
    });

    // Populate provenance and target excerpts
    profile.canonicalUrl = canonicalUrl;
    profile.crawlStatus = 'SUCCESS';
    profile.extractedTextLength = cleanedText.length;
    profile.targetExcerpts = targetExcerpts;

    // Deterministic archetype alignment if domain/signals strongly establish Agency/Portfolio
    if (detected.businessType !== 'SaaS' && (!profile.businessType || profile.businessType === 'SaaS')) {
      profile.businessType = detected.businessType;
      if (!profile.verifiedOfferings || profile.verifiedOfferings.length === 0) {
        profile.verifiedOfferings = detected.verifiedOfferings;
      }
      profile.identityConfidence = detected.identityConfidence;
    }

    // 4. Generate candidate seed keywords spanning distinct business pillars
    const keywordSchema = z.object({
      keywords: z.array(z.string().min(1)).min(4).max(6).describe('List of 4-6 high-intent target SEO search terms covering distinct business pillars.')
    });

    const isNonSaaS = profile.businessType && profile.businessType !== 'SaaS';
    const nonSaaSRules = isNonSaaS
      ? `NON-SAAS BUSINESS RULES:
This business is an ${profile.businessType} (Offerings: ${profile.verifiedOfferings?.join(', ') || 'Consulting / Design'}). It is NOT a SaaS tool or software product.
DO NOT generate "[brand] alternatives", "[brand] vs [competitor]", or "[brand] software".
Instead, generate high-intent search queries targeting the problems their clients face (e.g., "how to fix onboarding drop off", "ux audit checklist", "how to improve checkout conversion") or industry best practices.`
      : '';

    const keywordPrompt = `You are an elite SEO strategist. Based on this business profile, generate 4 to 6 target SEO search queries that represent the company's primary business across distinct strategic pillars.

Business Name: ${profile.name}
Business Type: ${profile.businessType || 'SaaS'}
Description: ${profile.description}
Key Offerings / Features: ${(profile.verifiedOfferings && profile.verifiedOfferings.length > 0 ? profile.verifiedOfferings : profile.keyFeatures)?.join(', ')}
Target Audience: ${profile.targetAudience}

${nonSaaSRules}

CRITICAL DIVERSIFICATION RULES:
1. Cover at least 3 distinct conceptual pillars:
   - Pillar 1: Core Offering / Primary Value Proposition
   - Pillar 2: Core Problem / JTBD (e.g., "how to [solve primary customer problem]", "manage [core job]")
   - Pillar 3: ${isNonSaaS ? 'Audit / Evaluation Checklist' : 'Category Alternative / Comparison'}
   - Pillar 4: Feature / Service Differentiator
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
      const isAgency = profile.businessType && profile.businessType !== 'SaaS';
      candidateKeywords = isAgency
        ? [
            `${name} design services`,
            `how to fix product friction`,
            `ux audit checklist`,
            `how to reduce onboarding drop off`
          ]
        : [
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
        website: safety.normalizedUrl || url
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
  const isNonSaaS = profile.businessType && profile.businessType !== 'SaaS';
  const fallbackCandidates = isNonSaaS
    ? [
        `${name} design services`,
        `how to fix product friction`,
        `ux audit checklist`,
        `how to reduce onboarding drop off`
      ]
    : [
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

export function detectBusinessTypeFromTextAndUrl(text: string, url: string): {
  businessType: 'SaaS' | 'Agency/Portfolio' | 'Ecommerce' | 'Publisher/Blog' | 'Services' | 'Other' | 'UNKNOWN';
  verifiedOfferings: string[];
  identityConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
} {
  const lowerText = text.toLowerCase();
  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(url);
  } catch {}

  const hostname = (parsedUrl?.hostname || '').toLowerCase();

  // Agency/Portfolio domain signals
  const isAgencyDomain = hostname.endsWith('.design') ||
    hostname.endsWith('.agency') ||
    hostname.endsWith('.studio') ||
    hostname.includes('design') ||
    hostname.includes('studio') ||
    hostname.includes('portfolio') ||
    hostname.includes('agency');

  // Text signals
  const agencyKeywords = [
    'ux audit', 'redesign', 'portfolio', 'design studio', 'freelance designer',
    'product designer', 'ux consultant', 'case study', 'case studies', 'selected work',
    'hire me', 'book a call', 'book an audit', 'i fix friction', 'design consultancy',
    'audit and redesign', 'friction in digital products'
  ];
  const matchedAgencyKeywords = agencyKeywords.filter(k => lowerText.includes(k));

  const saasKeywords = [
    'pricing plan', 'sign up free', 'start free trial', 'saas platform',
    'cloud software', 'api documentation', 'integrations with', 'web app',
    'monthly subscription', 'per user per month', 'software as a service'
  ];
  const matchedSaasKeywords = saasKeywords.filter(k => lowerText.includes(k));

  const verifiedOfferings: string[] = [];
  if (lowerText.includes('ux audit') || lowerText.includes('ux audits')) verifiedOfferings.push('UX Audits');
  if (lowerText.includes('redesign') || lowerText.includes('redesigns')) verifiedOfferings.push('Product Redesigns');
  if (lowerText.includes('onboarding')) verifiedOfferings.push('Onboarding Optimization');
  if (lowerText.includes('checkout')) verifiedOfferings.push('Checkout Flow Optimization');
  if (lowerText.includes('friction')) verifiedOfferings.push('UX Friction Remediation');

  // 1. Definite Agency signals from text
  if (matchedAgencyKeywords.length >= 2 || (matchedAgencyKeywords.length >= 1 && matchedSaasKeywords.length === 0)) {
    return {
      businessType: 'Agency/Portfolio',
      verifiedOfferings,
      identityConfidence: matchedAgencyKeywords.length >= 2 ? 'HIGH' : 'MEDIUM'
    };
  }

  // 2. Domain-only agency signal (Do NOT invent UX Audits / Design Consulting when text lacks evidence)
  if (isAgencyDomain) {
    return {
      businessType: 'Agency/Portfolio',
      verifiedOfferings, // only populated if verified in text; otherwise empty
      identityConfidence: verifiedOfferings.length > 0 ? 'MEDIUM' : 'LOW'
    };
  }

  // 3. Ecommerce signals
  if (lowerText.includes('add to cart') || lowerText.includes('shopping cart') || (lowerText.includes('checkout') && lowerText.includes('store'))) {
    return {
      businessType: 'Ecommerce',
      verifiedOfferings: ['Online Retail'],
      identityConfidence: 'HIGH'
    };
  }

  // 4. Substantive SaaS signals
  if (matchedSaasKeywords.length >= 1) {
    return {
      businessType: 'SaaS',
      verifiedOfferings: [],
      identityConfidence: matchedSaasKeywords.length >= 2 ? 'HIGH' : 'MEDIUM'
    };
  }

  // 5. Sparse or unverified business archetype: do NOT default to SaaS
  return {
    businessType: 'UNKNOWN',
    verifiedOfferings: [],
    identityConfidence: 'LOW'
  };
}

/**
 * Extracts bounded, deduplicated factual excerpts from raw target website content,
 * filtering out boilerplate navigation, cookie, and legal text.
 */
export function extractTargetExcerpts(
  rawText: string,
  maxExcerpts = 8,
  minLen = 40,
  maxLen = 300
): string[] {
  if (!rawText || !rawText.trim()) return [];

  const rawBlocks = rawText.split(/\n\s*\n|\n+/);
  const candidates: string[] = [];

  const noisePatterns = [
    /\b(?:cookie|privacy policy|terms of service|all rights reserved|copyright|cookie policy|gdpr|manage cookies|subscribe to our newsletter)\b/i,
    /\b(?:sign in|log in|forgot password|register|cart\s*\(\d+\)|checkout now)\b/i,
    /^(?:home|about|contact|pricing|blog|careers|legal|support|menu)$/i,
    /^(?:title:|description:|og title:|og description:|site name:|keywords:|canonical url:)/i
  ];

  for (const block of rawBlocks) {
    const cleaned = block.replace(/\s+/g, ' ').trim();
    if (cleaned.length < minLen) continue;
    if (noisePatterns.some(pat => pat.test(cleaned))) continue;

    if (cleaned.length > maxLen) {
      const sentences = cleaned.split(/(?<=[.!?])\s+/);
      let currentChunk = '';
      for (const sent of sentences) {
        const trimmedSent = sent.trim();
        if (noisePatterns.some(pat => pat.test(trimmedSent))) continue;
        if ((currentChunk + ' ' + trimmedSent).trim().length <= maxLen) {
          currentChunk = (currentChunk + ' ' + trimmedSent).trim();
        } else {
          if (currentChunk.length >= minLen) {
            candidates.push(currentChunk);
          }
          currentChunk = trimmedSent;
        }
      }
      if (currentChunk.length >= minLen) {
        if (currentChunk.length <= maxLen) {
          candidates.push(currentChunk);
        } else {
          const clauseMatch = currentChunk.slice(0, maxLen).match(/^(.*[,;:\-])\s+[^\s,;:\-]+$/);
          const sliced = clauseMatch && clauseMatch[1].length >= minLen ? clauseMatch[1].trim() : currentChunk.slice(0, maxLen).trim();
          candidates.push(sliced);
        }
      }
    } else {
      candidates.push(cleaned);
    }
  }

  const seen = new Set<string>();
  const uniqueExcerpts: string[] = [];
  for (const c of candidates) {
    const norm = c.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    uniqueExcerpts.push(c);
    if (uniqueExcerpts.length >= maxExcerpts) break;
  }

  return uniqueExcerpts;
}
