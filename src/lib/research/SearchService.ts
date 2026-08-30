// src/lib/research/SearchService.ts
import { SearchProvider, SearchResult } from '@/core/contracts/providers';

export class SearchService {
  constructor(private searchProvider: SearchProvider) {}

  async executeSearch(query: string, limit = 25): Promise<SearchResult[]> {
    return this.searchProvider.search(query, { numResults: limit });
  }
}
