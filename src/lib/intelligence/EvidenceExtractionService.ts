// src/lib/intelligence/EvidenceExtractionService.ts
import { 
  EvidenceItem, 
  EvidenceSet, 
  EvidenceType, 
  SourceType, 
  EvidenceConfidence 
} from '@/core/contracts/evidence';
import { SaaSProfile } from '@/core/contracts/schemas';
import { SearchResult, ScrapeResult } from '@/core/contracts/providers';
import { LinkSafetyValidator } from '@/lib/seo-intelligence/link_quality_engine';

export interface EvidenceExtractionInput {
  saasProfile?: SaaSProfile;
  searchResults?: SearchResult[];
  scrapeResults?: ScrapeResult[];
  saasIntelligenceProfile?: any;
  opportunities?: any[];
  geoIntelligence?: any;
  targetKeyword?: string;
}

export class EvidenceExtractionService {
  /**
   * Deterministically extracts a canonical EvidenceSet from all available research inputs.
   */
  public static extractEvidence(input: EvidenceExtractionInput): EvidenceSet {
    const items: EvidenceItem[] = [];
    const seenClaims = new Set<string>();

    const addEvidence = (item: Omit<EvidenceItem, 'id'> & { idPrefix?: string }) => {
      // 1. Sanitize text
      const cleanClaim = this.sanitizeText(item.claim);
      if (!cleanClaim || cleanClaim.length < 10) return;

      const normClaim = cleanClaim.toLowerCase().replace(/[^\w\s]/g, '').trim();
      if (seenClaims.has(normClaim)) return;
      seenClaims.add(normClaim);

      // 2. Validate URL safety if URL is present
      let safeUrl = (item.sourceUrl || '').trim();
      if (safeUrl) {
        const safety = LinkSafetyValidator.isSafeUrl(safeUrl);
        if (!safety.safe) {
          // Fall back to target site or omit dangerous URL
          safeUrl = input.saasProfile?.website || 'https://verified-research.internal';
        }
      } else {
        safeUrl = input.saasProfile?.website || 'https://verified-research.internal';
      }

      const id = `${item.idPrefix || 'ev'}_${items.length + 1}`;
      items.push({
        id,
        sourceUrl: safeUrl,
        sourceTitle: this.sanitizeText(item.sourceTitle || 'Verified Research Source'),
        sourceType: item.sourceType,
        claim: cleanClaim,
        evidenceType: item.evidenceType,
        confidence: item.confidence,
        extractedFrom: this.sanitizeText(item.extractedFrom || cleanClaim),
        entities: item.entities || [],
        topics: item.topics || [],
        supports: item.supports,
        contradicts: item.contradicts,
        freshness: item.freshness || new Date().toISOString().split('T')[0],
        citationRequired: item.citationRequired,
      });
    };

    // 1. Extract BUSINESS_FACT from Target SaaS Profile
    if (input.saasProfile) {
      const p = input.saasProfile;
      const targetUrl = p.website || 'https://target-business.internal';
      const brandName = p.name || 'Target Business';

      if (p.description) {
        addEvidence({
          idPrefix: 'biz',
          sourceUrl: targetUrl,
          sourceTitle: `${brandName} Official Profile`,
          sourceType: 'TARGET_SITE',
          claim: `${brandName} Core Mission: ${p.description}`,
          evidenceType: 'BUSINESS_FACT',
          confidence: 'HIGH',
          extractedFrom: p.description,
          entities: [brandName],
          topics: ['business_overview', 'core_capabilities'],
          citationRequired: false,
        });
      }

      if (Array.isArray(p.keyFeatures) && p.keyFeatures.length > 0) {
        for (const feature of p.keyFeatures) {
          const cleanF = feature.trim();
          if (!cleanF) continue;
          addEvidence({
            idPrefix: 'biz_feat',
            sourceUrl: targetUrl,
            sourceTitle: `${brandName} Features`,
            sourceType: 'TARGET_SITE',
            claim: `${brandName} provides verified capability: ${cleanF}`,
            evidenceType: 'FEATURE',
            confidence: 'HIGH',
            extractedFrom: feature,
            entities: [brandName, cleanF],
            topics: ['key_features', 'technical_capabilities'],
            citationRequired: false,
          });
        }
      }

      if (p.customInsights) {
        addEvidence({
          idPrefix: 'biz_ins',
          sourceUrl: targetUrl,
          sourceTitle: `${brandName} Insights`,
          sourceType: 'TARGET_SITE',
          claim: `${brandName} Operational Fact: ${p.customInsights}`,
          evidenceType: 'DIFFERENTIATOR',
          confidence: 'HIGH',
          extractedFrom: p.customInsights,
          entities: [brandName],
          topics: ['operational_expertise', 'regional_presence'],
          citationRequired: false,
        });
      }

      if (p.targetAudience) {
        addEvidence({
          idPrefix: 'biz_aud',
          sourceUrl: targetUrl,
          sourceTitle: `${brandName} Audience`,
          sourceType: 'TARGET_SITE',
          claim: `${brandName} is specifically designed for: ${p.targetAudience}`,
          evidenceType: 'BUSINESS_FACT',
          confidence: 'HIGH',
          extractedFrom: p.targetAudience,
          entities: [brandName, p.targetAudience],
          topics: ['target_audience', 'buyer_persona'],
          citationRequired: false,
        });
      }
    }

    // 2. Extract SERP_OBSERVATION from Search Results
    if (Array.isArray(input.searchResults)) {
      for (const res of input.searchResults.slice(0, 5)) {
        if (!res.snippet && !res.title) continue;
        const claim = res.snippet 
          ? `Top ranking search observation for "${input.targetKeyword || 'topic'}": ${res.snippet}`
          : `SERP ranking coverage: "${res.title}"`;
        
        addEvidence({
          idPrefix: 'serp',
          sourceUrl: res.link || 'https://google.com/search',
          sourceTitle: res.title || 'SERP Ranking Result',
          sourceType: 'SERP',
          claim,
          evidenceType: 'SERP_OBSERVATION',
          confidence: 'MEDIUM',
          extractedFrom: res.snippet || res.title,
          entities: [res.title || 'Search Result'],
          topics: ['serp_intent', 'organic_rankings'],
          citationRequired: false,
        });
      }
    }

    // 3. Extract COMPETITOR_OBSERVATION from Scraped Competitor Content
    if (Array.isArray(input.scrapeResults)) {
      for (const scrape of input.scrapeResults.slice(0, 3)) {
        if (!scrape.textContent && !scrape.title) continue;
        
        // Extract key factual paragraphs or headings from competitor text
        const paras = (scrape.textContent || '')
          .split('\n')
          .map(p => p.trim())
          .filter(p => p.length > 50 && p.length < 350 && !p.toLowerCase().includes('cookie') && !p.toLowerCase().includes('privacy policy'));

        // Take up to 2 distinct observation paragraphs per competitor
        for (const para of paras.slice(0, 2)) {
          // Check if paragraph contains statistical claims
          const hasStatistic = /\b\d+(?:\.\d+)?%|\$\d+(?:,\d+)?|\b\d+\s+(?:days|hours|years|clients|projects|engineers)\b/i.test(para);
          
          addEvidence({
            idPrefix: 'comp',
            sourceUrl: scrape.url,
            sourceTitle: scrape.title || 'Competitor Analysis',
            sourceType: 'COMPETITOR',
            claim: `Competitor observation (${scrape.title || scrape.url}): ${para}`,
            evidenceType: hasStatistic ? 'STATISTIC' : 'COMPETITOR_OBSERVATION',
            confidence: 'MEDIUM',
            extractedFrom: para,
            entities: [scrape.title || 'Competitor'],
            topics: ['competitor_landscape', 'market_standards'],
            citationRequired: true,
          });
        }
      }
    }

    // 4. Extract SaaS Intelligence Profile & Market Differentiators
    if (input.saasIntelligenceProfile) {
      const sp = input.saasIntelligenceProfile;
      const diffs = sp.product?.differentiators || [];
      for (const diff of diffs) {
        addEvidence({
          idPrefix: 'diff',
          sourceUrl: input.saasProfile?.website || 'https://target-business.internal',
          sourceTitle: 'SaaS Market Differentiator',
          sourceType: 'TARGET_SITE',
          claim: `Verified Value Proposition: ${diff}`,
          evidenceType: 'BUSINESS_FACT',
          confidence: 'HIGH',
          extractedFrom: diff,
          entities: [input.saasProfile?.name || 'SaaS Platform'],
          topics: ['market_differentiation'],
          citationRequired: false,
        });
      }

      const painPoints = sp.audience?.painPoints || [];
      for (const pp of painPoints) {
        addEvidence({
          idPrefix: 'pain',
          sourceUrl: input.saasProfile?.website || 'https://target-business.internal',
          sourceTitle: 'Customer Problem Space',
          sourceType: 'INDUSTRY',
          claim: `Researched Buyer Problem: ${pp}`,
          evidenceType: 'FACT',
          confidence: 'MEDIUM',
          extractedFrom: pp,
          entities: [],
          topics: ['customer_pain_points', 'problem_validation'],
          citationRequired: false,
        });
      }
    }

    // 5. Explicit INFERENCE items: Derived carefully and tagged strictly as INFERENCE
    if (input.saasProfile && input.opportunities && input.opportunities.length > 0) {
      const opp = input.opportunities[0];
      if (opp.supportingTerms && opp.supportingTerms.length > 0) {
        addEvidence({
          idPrefix: 'inf',
          sourceUrl: input.saasProfile.website || 'https://target-business.internal',
          sourceTitle: 'Search Opportunity Synthesis',
          sourceType: 'OTHER',
          claim: `Editorial Inference: Buyers exploring "${opp.keyword || input.targetKeyword}" likely evaluate complementary capabilities like ${opp.supportingTerms.slice(0, 3).join(', ')}.`,
          evidenceType: 'INFERENCE',
          confidence: 'LOW',
          extractedFrom: JSON.stringify(opp.supportingTerms),
          entities: opp.supportingTerms.slice(0, 3),
          topics: ['search_demand_inference'],
          citationRequired: false,
        });
      }
    }

    // Calculate Summary Stats
    const totalCount = items.length;
    const highConfidenceCount = items.filter(i => i.confidence === 'HIGH').length;
    const businessFactCount = items.filter(i => 
      i.evidenceType === 'BUSINESS_FACT' || 
      i.evidenceType === 'FEATURE' || 
      i.evidenceType === 'DIFFERENTIATOR' || 
      i.evidenceType === 'TECHNICAL_SPEC'
    ).length;
    const competitorObservationCount = items.filter(i => i.evidenceType === 'COMPETITOR_OBSERVATION' || i.evidenceType === 'STATISTIC').length;
    const serpObservationCount = items.filter(i => i.evidenceType === 'SERP_OBSERVATION').length;
    const inferenceCount = items.filter(i => i.evidenceType === 'INFERENCE').length;

    return {
      items,
      extractedAt: new Date().toISOString(),
      summary: {
        totalCount,
        highConfidenceCount,
        businessFactCount,
        competitorObservationCount,
        serpObservationCount,
        inferenceCount,
      }
    };
  }

  private static sanitizeText(str: string): string {
    if (!str) return '';
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
}
