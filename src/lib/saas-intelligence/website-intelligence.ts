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

    // 4. Generate candidate seed keywords
    const keywordSchema = z.object({
      keywords: z.array(z.string().min(1)).min(4).max(6).describe('List of 4-6 high-intent target SEO search terms/keywords for this business.')
    });

    const keywordPrompt = `Based on this business profile, generate 4 to 6 target SEO keywords/search queries that potential customers would search on Google to find products like this.
SaaS Name: ${profile.name}
Description: ${profile.description}
Key Features: ${profile.keyFeatures?.join(', ')}
Target Audience: ${profile.targetAudience}

Ensure the keywords represent high-intent topics, listicles ("best X"), comparison keywords ("X vs Y"), or guide keywords ("how to X"). Return lowercase, search-friendly query strings.`;

    const keywordResult = await this.llm.structuredGenerate<z.infer<typeof keywordSchema>>(keywordPrompt, keywordSchema, {
      operation: 'Autopilot Seed Keyword Generation',
      runId,
      systemInstruction: 'Output a valid JSON containing 4-6 lowercase keyword strings.'
    });

    return {
      profile: {
        ...profile,
        website: url
      },
      candidateKeywords: keywordResult.keywords || []
    };
  }
}
