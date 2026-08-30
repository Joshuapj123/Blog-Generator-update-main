import { CompetitorBacklink } from '@/core/contracts/authority-providers';

export interface LinkGapTarget {
  domain: string;
  url: string; // representative URL
  authority: number;
  competitorsLinked: string[];
}

export class CompetitorLinkGapService {
  /**
   * Identifies domains linking to competitors but not yet linking to our SaaS product
   */
  static findLinkGaps(
    competitorBacklinks: CompetitorBacklink[],
    ourReferringDomains: string[]
  ): LinkGapTarget[] {
    const ourRefDomainsSet = new Set(ourReferringDomains.map(d => d.toLowerCase()));
    
    // Group backlink items by referring domain to find link overlap
    const domainMap = new Map<string, { url: string; authority: number; competitors: Set<string> }>();

    for (const link of competitorBacklinks) {
      const refDomain = link.domain.toLowerCase();
      
      // Filter out domains that already link to our own SaaS product
      if (ourRefDomainsSet.has(refDomain)) {
        continue;
      }

      if (!domainMap.has(refDomain)) {
        domainMap.set(refDomain, {
          url: link.url,
          authority: link.authority,
          competitors: new Set<string>()
        });
      }

      domainMap.get(refDomain)!.competitors.add(link.targetDomain.toLowerCase());
    }

    const gapTargets: LinkGapTarget[] = [];
    for (const [domain, info] of domainMap.entries()) {
      gapTargets.push({
        domain,
        url: info.url,
        authority: info.authority,
        competitorsLinked: Array.from(info.competitors)
      });
    }

    // Sort by authority descending
    return gapTargets.sort((a, b) => b.authority - a.authority);
  }
}
