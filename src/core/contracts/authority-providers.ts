export interface CompetitorBacklink {
  url: string;
  domain: string;
  authority: number;
  targetDomain: string;
}

export interface BrandMentionInfo {
  url: string;
  domain: string;
  snippet: string;
  isLinked: boolean;
  title?: string;
}

export interface AuthorityDataProvider {
  providerName: string;
  getCompetitorBacklinks(competitorDomains: string[]): Promise<CompetitorBacklink[]>;
  getReferringDomains(domain: string): Promise<string[]>;
  discoverMentions(query: string): Promise<BrandMentionInfo[]>;
}
