// src/lib/research/ScrapingService.ts
import { ScrapeProvider, ScrapeResult } from '@/core/contracts/providers';

export class ScrapingService {
  constructor(private scrapeProvider: ScrapeProvider) {}

  async executeScraping(urls: string[], limit = 3): Promise<ScrapeResult[]> {
    const targetUrls = urls.filter(Boolean).slice(0, limit);
    if (targetUrls.length === 0) return [];
    return this.scrapeProvider.scrape(targetUrls);
  }
}
