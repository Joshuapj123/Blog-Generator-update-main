// src/lib/research/ResearchService.ts
import { SearchService } from './SearchService';
import { ScrapingService } from './ScrapingService';
import { SearchResult, ScrapeResult } from '@/core/contracts/providers';

export interface ResearchContext {
  searchResults: SearchResult[];
  scrapeResults: ScrapeResult[];
  medians: {
    medianWordCount: number;
    medianTitleLength: number;
    medianH2Count: number;
  };
}

export class ResearchService {
  constructor(
    private searchService: SearchService,
    private scrapingService: ScrapingService
  ) {}

  async conductResearch(
    query: string, 
    options?: { competitorUrls?: string[]; searchLimit?: number; scrapeLimit?: number }
  ): Promise<ResearchContext> {
    const searchLimit = options?.searchLimit ?? 25;
    const scrapeLimit = options?.scrapeLimit ?? 3;

    // 1. Search
    const searchResults = await this.searchService.executeSearch(query, searchLimit);
    
    // 2. Extract competitor URLs
    const organicUrls = searchResults.map(r => r.link).filter(Boolean);
    const customUrls = options?.competitorUrls || [];
    const urlsToScrape = [
      ...customUrls,
      ...organicUrls
    ].filter((v, i, a) => a.indexOf(v) === i);

    // 3. Scrape
    const scrapeResults = await this.scrapingService.executeScraping(urlsToScrape, scrapeLimit);

    // 4. Calculate Medians (self-contained logic)
    const competitorStats = scrapeResults.map(r => {
      const words = r.textContent.split(/\s+/).filter(Boolean).length;
      return {
        wordCount: words,
        titleLength: r.title ? r.title.length : 0,
        h2Count: 6 // standard defaults
      };
    });

    const medianWordCount = competitorStats.length > 0
      ? Math.round(competitorStats.reduce((sum, c) => sum + c.wordCount, 0) / competitorStats.length)
      : 2000;
      
    const medianTitleLength = competitorStats.length > 0
      ? Math.round(competitorStats.reduce((sum, c) => sum + c.titleLength, 0) / competitorStats.length)
      : 60;

    const medianH2Count = competitorStats.length > 0
      ? Math.round(competitorStats.reduce((sum, c) => sum + c.h2Count, 0) / competitorStats.length)
      : 6;

    return {
      searchResults,
      scrapeResults,
      medians: {
        medianWordCount,
        medianTitleLength,
        medianH2Count
      }
    };
  }
}
