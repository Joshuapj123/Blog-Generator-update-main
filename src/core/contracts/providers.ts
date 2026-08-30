// src/core/contracts/providers.ts

export interface LLMProvider {
  /**
   * Generates a plain text response for a given prompt.
   */
  generate(
    prompt: string, 
    options?: { systemInstruction?: string; temperature?: number; operation?: string; runId?: string; cacheKey?: string; model?: string }
  ): Promise<string>;

  /**
   * Generates a structured JSON object response validated against a Zod schema or JSON schema.
   */
  structuredGenerate<T>(
    prompt: string,
    schema: any, // Zod schema or equivalent
    options?: { systemInstruction?: string; temperature?: number; operation?: string; runId?: string; cacheKey?: string; model?: string }
  ): Promise<T>;
}

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  position?: number;
}

export interface SearchProvider {
  /**
   * Query the search provider (e.g. Google, Serper) and return normalized search results.
   */
  search(query: string, options?: { numResults?: number }): Promise<SearchResult[]>;
}

export interface ScrapeResult {
  url: string;
  title: string;
  htmlContent: string;
  textContent: string;
  success: boolean;
  errorMessage?: string;
}

export interface ScrapeProvider {
  /**
   * Scrapes raw/rendered content from a list of URLs.
   */
  scrape(urls: string[], options?: { concurrencyLimit?: number }): Promise<ScrapeResult[]>;
}
