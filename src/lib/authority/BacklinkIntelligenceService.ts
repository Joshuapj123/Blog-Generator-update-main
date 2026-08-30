import { AuthorityDataProvider, CompetitorBacklink } from '@/core/contracts/authority-providers';

export class BacklinkIntelligenceService {
  constructor(private provider: AuthorityDataProvider) {}

  /**
   * Normalizes URLs and domain strings to root domain forms
   */
  static normalizeDomain(urlOrDomain: string): string {
    let clean = urlOrDomain.trim().toLowerCase();
    
    // Remove protocol and sub-paths
    if (clean.includes('://')) {
      try {
        const urlObj = new URL(clean);
        clean = urlObj.hostname;
      } catch (e) {
        // Fallback split
        clean = clean.split('://')[1];
      }
    }
    
    // Remove path query parameters
    clean = clean.split('/')[0].split('?')[0];

    // Strip common subdomains: www.
    if (clean.startsWith('www.')) {
      clean = clean.substring(4);
    }
    
    return clean;
  }

  async getBacklinksInfo(competitorDomains: string[]): Promise<CompetitorBacklink[]> {
    const rawLinks = await this.provider.getCompetitorBacklinks(competitorDomains);
    // Normalize competitor backlink domains
    return rawLinks.map(link => ({
      ...link,
      domain: BacklinkIntelligenceService.normalizeDomain(link.domain)
    }));
  }

  async getSaasReferringDomains(saasDomain: string): Promise<string[]> {
    const rawRefs = await this.provider.getReferringDomains(saasDomain);
    return rawRefs.map(r => BacklinkIntelligenceService.normalizeDomain(r));
  }
}
