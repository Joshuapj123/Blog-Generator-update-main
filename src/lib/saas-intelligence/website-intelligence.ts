import { chromium } from 'playwright';
import { JSDOM } from 'jsdom';
import { cleanHtmlContent, cleanDom } from '../seo-intelligence/content_cleaner';
import { GeminiProvider } from '../content/GeminiProvider';
import { verifyUrlSafety } from '../research/url-verifier';
import { SaaSProfileSchema, SaaSProfile } from '@/core/contracts/schemas';
import { z } from 'zod';

export class WebsiteIntelligenceService {
  private llm: GeminiProvider;

  constructor() {
    this.llm = new GeminiProvider();
  }

  async crawlUrl(url: string): Promise<string> {
    const browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled']
    });
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      const html = await page.content();
      
      const cleanHtml = cleanHtmlContent(html);
      const dom = new JSDOM(cleanHtml, { url });
      const doc = dom.window.document;
      cleanDom(doc);
      
      const textContent = doc.body?.textContent || '';
      return textContent.replace(/\s+/g, ' ').trim();
    } finally {
      await browser.close();
    }
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
