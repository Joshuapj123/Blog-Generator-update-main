import { 
  AuthorityOpportunity, 
  SaaSProfile, 
  ContentAsset,
  SearchOpportunity
} from '@/core/contracts/schemas';
import { AuthorityDataProvider } from '@/core/contracts/authority-providers';
import { BacklinkIntelligenceService } from './BacklinkIntelligenceService';
import { MentionIntelligenceService } from './MentionIntelligenceService';
import { CompetitorLinkGapService } from './CompetitorLinkGapService';
import { AuthorityScoringService } from './AuthorityScoringService';

export interface AuthorityOpportunityRepository {
  saveOpportunity(opp: AuthorityOpportunity): Promise<string>;
}

export class AuthorityOpportunityService {
  private backlinkIntel: BacklinkIntelligenceService;
  private mentionIntel: MentionIntelligenceService;

  constructor(
    provider: AuthorityDataProvider,
    private repo?: AuthorityOpportunityRepository
  ) {
    this.backlinkIntel = new BacklinkIntelligenceService(provider);
    this.mentionIntel = new MentionIntelligenceService(provider);
  }

  async analyzeOpportunities(
    saasProfile: SaaSProfile,
    asset: ContentAsset,
    searchOpp?: SearchOpportunity,
    options?: { topicalRelevanceOverride?: number }
  ): Promise<AuthorityOpportunity[]> {
    const opportunities: AuthorityOpportunity[] = [];
    const targetContentAssetId = (asset as any).id || 'asset_fallback';

    // 1. Resolve competitor backlink gap opportunities
    const competitors = saasProfile.primaryCompetitors || [];
    const competitorBacklinks = await this.backlinkIntel.getBacklinksInfo(competitors);
    const ourRefs = await this.backlinkIntel.getSaasReferringDomains(saasProfile.website || 'resumecraft.io');

    const gapTargets = CompetitorLinkGapService.findLinkGaps(competitorBacklinks, ourRefs);

    for (const target of gapTargets) {
      // Calculate relevance
      // Simple logic: if target domain matches search keywords, increase topical relevance
      let topicalRelevance = 50;
      if (options?.topicalRelevanceOverride !== undefined) {
        topicalRelevance = options.topicalRelevanceOverride;
      } else if (searchOpp?.keyword) {
        const kLower = searchOpp.keyword.toLowerCase();
        if (target.domain.includes(kLower) || target.url.toLowerCase().includes(kLower)) {
          topicalRelevance = 90;
        }
      }

      // Calculate score and priority
      const estimatedDifficulty = Math.min(100, Math.max(0, Math.round(target.authority * 0.9)));
      const feasibilityScore = 100 - estimatedDifficulty;

      const scoreInfo = AuthorityScoringService.calculateScore({
        authorityScore: target.authority,
        topicalRelevance,
        competitorEvidenceCount: target.competitorsLinked.length,
        businessRelevance: 70, // generic fallback
        feasibilityScore
      });

      // Map action
      let recommendedAction: 'OUTREACH' | 'REQUEST_LINK' | 'CREATE_RESOURCE' | 'GUEST_CONTRIBUTION' | 'PARTNERSHIP' | 'DIRECTORY_SUBMISSION' | 'MONITOR' | 'NO_ACTION' = 'OUTREACH';
      if (target.authority > 85) {
        recommendedAction = 'GUEST_CONTRIBUTION';
      } else if (target.competitorsLinked.length >= 2) {
        recommendedAction = 'REQUEST_LINK';
      }

      opportunities.push({
        id: `opp_gap_${target.domain}_${Date.now()}`,
        targetContentAssetId,
        targetDomain: target.domain,
        targetUrl: target.url,
        opportunityType: 'competitor_backlink_gap',
        relationshipType: 'Competitor Referrer',
        relevanceScore: scoreInfo.totalScore,
        authorityScore: target.authority,
        topicalRelevance,
        estimatedDifficulty,
        competitorEvidence: target.competitorsLinked,
        mentionStatus: 'none',
        backlinkStatus: 'none',
        recommendedAction,
        priority: scoreInfo.priority,
        reasoning: `Competitors [${target.competitorsLinked.join(', ')}] link from this domain. Adding high-value gap referral.`
      });
    }

    // 2. Resolve unlinked brand mentions
    const brandMentions = await this.mentionIntel.findBrandMentions(saasProfile.name);
    for (const mention of brandMentions) {
      if (mention.isLinked) {
        continue; // skip already linked mentions
      }

      const sentiment = MentionIntelligenceService.classifySentiment(mention.snippet);

      // Score mention
      const authorityScore = 60; // fallback for directory/mention blogs
      const topicalRelevance = sentiment === 'positive' ? 95 : 70;
      const feasibilityScore = 80; // unlinked mentions are highly feasible to reclaim
      
      const scoreInfo = AuthorityScoringService.calculateScore({
        authorityScore,
        topicalRelevance,
        competitorEvidenceCount: 0,
        businessRelevance: 90,
        feasibilityScore
      });

      opportunities.push({
        id: `opp_mention_${mention.domain}_${Date.now()}`,
        targetContentAssetId,
        targetDomain: mention.domain,
        targetUrl: mention.url,
        opportunityType: 'unlinked_brand_mention',
        relationshipType: 'Brand Mention',
        relevanceScore: scoreInfo.totalScore,
        authorityScore,
        topicalRelevance,
        estimatedDifficulty: 20, // low difficulty
        competitorEvidence: [],
        mentionStatus: 'unlinked',
        backlinkStatus: 'none',
        recommendedAction: 'REQUEST_LINK',
        priority: scoreInfo.priority,
        reasoning: `Unlinked brand mention found on ${mention.domain}. Rationale: Reclaim brand value via direct link request.`
      });
    }

    // 3. Persist opportunities using helper persistence
    const saveOppFn = this.repo
      ? this.repo.saveOpportunity.bind(this.repo)
      : (await import('../firebase/firestore')).saveAuthorityOpportunity;

    for (const opp of opportunities) {
      await saveOppFn(opp);
    }

    return opportunities;
  }
}
