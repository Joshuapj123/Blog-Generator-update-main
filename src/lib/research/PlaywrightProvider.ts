// src/lib/research/PlaywrightProvider.ts
import { ScrapeProvider, ScrapeResult } from '@/core/contracts/providers';
import { scrapeCompetitors } from '@/lib/seo-intelligence/serp_collector';

export class PlaywrightProvider implements ScrapeProvider {
  async scrape(urls: string[], options?: { concurrencyLimit?: number }): Promise<ScrapeResult[]> {
    const competitors = await scrapeCompetitors(urls);
    return competitors.map(c => ({
      url: c.url,
      title: c.title,
      htmlContent: '', // TextContent is sufficient for down-stream processing
      textContent: c.text,
      success: c.readabilitySuccess,
    }));
  }
}
