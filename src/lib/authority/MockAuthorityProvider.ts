import { AuthorityDataProvider, CompetitorBacklink, BrandMentionInfo } from '@/core/contracts/authority-providers';

export class MockAuthorityProvider implements AuthorityDataProvider {
  public providerName = 'mock-authority';

  async getCompetitorBacklinks(competitorDomains: string[]): Promise<CompetitorBacklink[]> {
    const backlinks: CompetitorBacklink[] = [];
    
    // Seed some mock referring sites for competitors
    const mockRefSites = [
      { domain: 'techcrunch.com', authority: 90, subPath: '/article/resume-tools' },
      { domain: 'producthunt.com', authority: 88, subPath: '/products/teal' },
      { domain: 'forbes.com', authority: 93, subPath: '/sites/careers-future' },
      { domain: 'indiehackers.com', authority: 75, subPath: '/post/best-ai-builders' },
      { domain: 'dev.to', authority: 80, subPath: '/tag/resumecraft-tips' },
      { domain: 'medium.com', authority: 85, subPath: '/career-growth/teal-reviews' },
      { domain: 'reddit.com', authority: 87, subPath: '/r/jobs/comments/best-ai-builders' }
    ];

    for (const compDomain of competitorDomains) {
      // Each competitor gets a subset of referring links
      mockRefSites.forEach((site, idx) => {
        if ((idx + compDomain.length) % 2 === 0) {
          backlinks.push({
            url: `https://www.${site.domain}${site.subPath}`,
            domain: site.domain,
            authority: site.authority,
            targetDomain: compDomain
          });
        }
      });
    }

    return backlinks;
  }

  async getReferringDomains(domain: string): Promise<string[]> {
    // Return referring domains that already link to our SaaS domain
    if (domain.includes('resumecraft')) {
      return ['dev.to', 'medium.com']; // already has links from dev.to and medium.to
    }
    return [];
  }

  async discoverMentions(query: string): Promise<BrandMentionInfo[]> {
    // Returns mentions of the query (e.g. "ResumeCraft" or "Teal")
    const mentions: BrandMentionInfo[] = [];

    if (query.toLowerCase().includes('resumecraft')) {
      mentions.push({
        url: 'https://www.indiehackers.com/post/best-ai-builders',
        domain: 'indiehackers.com',
        snippet: 'We loved using ResumeCraft for organizing student engineer profiles. It was easy to sync with LinkedIn.',
        isLinked: false,
        title: 'Top AI Resume Builders in 2026'
      });
      mentions.push({
        url: 'https://www.dev.to/tag/resumecraft-tips',
        domain: 'dev.to',
        snippet: 'Here is a linked mention of ResumeCraft showing how to optimize bullet points.',
        isLinked: true,
        title: 'Optimizing tech resume bullet points'
      });
      mentions.push({
        url: 'https://www.reddit.com/r/jobs/comments/best-ai-builders',
        domain: 'reddit.com',
        snippet: 'ResumeCraft is ok but I prefer simple markdown templates.',
        isLinked: false,
        title: 'Markdown Resume Builder Reddit Thread'
      });
    }

    return mentions;
  }
}
