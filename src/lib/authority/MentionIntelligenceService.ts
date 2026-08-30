import { AuthorityDataProvider, BrandMentionInfo } from '@/core/contracts/authority-providers';

export class MentionIntelligenceService {
  constructor(private provider: AuthorityDataProvider) {}

  async findBrandMentions(brandName: string): Promise<BrandMentionInfo[]> {
    const rawMentions = await this.provider.discoverMentions(brandName);
    return rawMentions.map(mention => {
      // Perform simple validation / mapping if necessary
      return {
        url: mention.url,
        domain: mention.domain.toLowerCase(),
        snippet: mention.snippet,
        isLinked: mention.isLinked,
        title: mention.title
      };
    });
  }

  /**
   * Safe sentiment classification: if text has highly positive terms, it is positive;
   * otherwise, we return 'unknown' rather than fabricating fake positive/neutral values.
   */
  static classifySentiment(snippet: string): 'positive' | 'unknown' {
    const lower = snippet.toLowerCase();
    const positiveWords = ['love', 'excellent', 'great', 'best', 'outstanding', 'awesome', 'recommend'];
    const matches = positiveWords.filter(word => lower.includes(word));
    if (matches.length >= 2) {
      return 'positive';
    }
    return 'unknown';
  }
}
