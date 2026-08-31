import { SearchProvider, LLMProvider } from '@/core/contracts/providers';
import { SearchOpportunity, SearchOpportunitySchema } from '@/core/contracts/schemas';
import { z } from 'zod';

export class SearchOpportunityService {
  private searchProvider: SearchProvider;
  private llm: LLMProvider;

  constructor(searchProvider: SearchProvider, llm: LLMProvider) {
    this.searchProvider = searchProvider;
    this.llm = llm;
  }

  /**
   * Generates, scores, and prioritizes SEO keywords and search landscape opportunities.
   */
  async analyzeOpportunities(
    saasName: string,
    category: string,
    seedKeywords: string[],
    competitorDomains: string[],
    options?: { runId?: string; saasProfile?: any }
  ): Promise<z.infer<typeof SearchOpportunitySchema>[]> {
    console.log(`[SearchOpportunityService] Starting opportunities analysis for category: ${category}`);

    // 1. Keyword Discovery from seed keywords and SaaS profile description/features
    let candidateKeywords = [...seedKeywords];
    if (candidateKeywords.length === 0 || (options?.saasProfile && (options as any)?.discoverKeywords)) {
      console.log('[SearchOpportunityService] Launching AI Keyword Discovery stage...');
      const discoveryPrompt = `You are an elite SEO strategist. Given the following SaaS product profile, generate 6-10 highly targeted, high-intent keyword ideas that this SaaS should target.
SaaS Name: ${saasName}
Category: ${category}
Description: ${options?.saasProfile?.description || 'A software solution.'}
Features: ${(options?.saasProfile?.keyFeatures || []).join(', ') || 'Standard features'}
Target Audience Hint: ${options?.saasProfile?.targetAudience || 'Target users'}

Provide keyword ideas covering multiple angles: Listicles ("best X"), Comparisons ("X vs Y", "Alternatives to Z"), Use cases, Problem-solving guides, and transactional/feature keywords. Ensure they are clean, lower-case, search-friendly strings.`;

      const discoverySchema = z.object({
        suggestedKeywords: z.array(z.string())
      });

      try {
        const discResult = await this.llm.structuredGenerate<z.infer<typeof discoverySchema>>(discoveryPrompt, discoverySchema, {
          operation: 'SaaS Keyword Discovery',
          runId: options?.runId,
          systemInstruction: 'Output a valid JSON list of 6-10 search queries.'
        });
        candidateKeywords = [...new Set([...candidateKeywords, ...(discResult.suggestedKeywords || [])])];
      } catch (e: any) {
        console.warn('[SearchOpportunityService] Keyword discovery failed, using fallbacks:', e.message);
      }
    }

    if (candidateKeywords.length === 0) {
      candidateKeywords = [`best ${category} software`, `${category} alternatives`, `${category} tools`];
    }

    const opportunities: z.infer<typeof SearchOpportunitySchema>[] = [];

    // 2. Loop through candidate keywords and run SERP Collection + classification
    for (const keyword of candidateKeywords) {
      console.log(`[SearchOpportunityService] Collecting SERP data for keyword: "${keyword}"`);
      let searchResults: any[] = [];
      let rankingDomains: string[] = [];

      try {
        // Run SERP extraction
        try {
          searchResults = await this.searchProvider.search(keyword, { numResults: 10 });
          rankingDomains = searchResults.map(r => {
            try {
              return new URL(r.link).hostname.toLowerCase().replace('www.', '');
            } catch {
              return '';
            }
          }).filter(Boolean);
        } catch (err: any) {
          throw new Error(`Search provider failed: ${err.message}`);
        }

        const serpContext = searchResults
          .map((r, i) => `[Rank ${i + 1}] Title: ${r.title}\nURL: ${r.link}\nSnippet: ${r.snippet}`)
          .join('\n\n');

        const classificationPrompt = `You are a search intent and SERP analysis expert. Analyze the search results context below for the keyword "${keyword}" to classify the search opportunity for our SaaS named "${saasName}" in the "${category}" category.

SaaS Context:
Product: ${saasName}
Category: ${category}

SERP Context:
${serpContext || 'No live search results available.'}

Tasks:
1. Normalize the keyword to a clean, lowercase search query.
2. Determine the dominant Search Intent: 'Informational', 'Transactional', 'Commercial', 'Navigational', 'Comparison'.
3. Detail the composition of page types dominating the top 10 results (assign counts out of 10, e.g. Listicle: 5, Product Page: 3, Guide: 2). Page types: 'Listicle', 'How-To', 'Guide', 'Review', 'Comparison', 'Other', 'Product Page', 'Forum'.
4. Identify any search features present based on URLs/snippets (e.g. "Featured Snippet", "YouTube Video", "People Also Ask", "Local Map").
5. Identify direct ranking SaaS competitors (domains) and standard ranking domains.
6. Rate the Business Relevance (1-100, how closely this keyword maps to our product value proposition).
7. Rate the Competitor Presence (1-100, how heavily direct SaaS competitors dominate the search results).
8. Rate the Estimated Difficulty (1-100, based on authority domains like G2, HubSpot, Wikipedia, Reddit, etc.).
9. Perform a Content Gap analysis: explain what currently ranks, what the current pages are missing, and what student/developer/use-case gap we can exploit.
10. Recommend the most appropriate asset type to create: e.g. 'Use-case landing page', 'Comparison page', 'Alternative page', 'Listicle', 'Guide', 'Educational article'.
11. Classify Priority: 'High', 'Medium', or 'Low'.
12. Provide a 1-sentence explanation of the opportunity and a detailed reasoning breakdown.
13. Extract 3-6 natural supporting search terms and related entity keywords commonly searched alongside this topic (e.g., ["business management platform", "business owners", "small business tools", "crm integration"]).`;

        const classificationSchema = z.object({
          normalizedKeyword: z.string(),
          intent: z.enum(['Informational', 'Transactional', 'Commercial', 'Navigational', 'Comparison']),
          contentType: z.enum(['Listicle', 'How-To', 'Guide', 'Review', 'Comparison', 'Other']),
          serpTypes: z.array(z.object({
            type: z.string(),
            count: z.number().min(0).max(10)
          })),
          searchFeatures: z.array(z.string()),
          supportingTerms: z.array(z.string()).default([]),
          competitors: z.array(z.string()),
          businessRelevance: z.number().min(1).max(100),
          competitorPresence: z.number().min(1).max(100),
          estimatedDifficulty: z.number().min(1).max(100),
          contentGap: z.string(),
          recommendedAssetType: z.string(),
          explanation: z.string(),
          reasoning: z.string(),
          priority: z.enum(['High', 'Medium', 'Low'])
        });

        const result = await this.llm.structuredGenerate<z.infer<typeof classificationSchema>>(classificationPrompt, classificationSchema, {
          operation: 'Keyword Opportunity Classification',
          runId: options?.runId,
          systemInstruction: 'Output a valid JSON object matching the classification schemas.'
        });

        // 3. Compute Deterministic Opportunity Score
        // Score = 0.35 * Business Relevance + 0.25 * Intent Value + 0.20 * Content Gap Score + 0.20 * (100 - Difficulty)
        let intentValue = 50;
        if (result.intent === 'Commercial' || result.intent === 'Comparison') {
          intentValue = 100;
        } else if (result.intent === 'Transactional') {
          intentValue = 90;
        } else if (result.intent === 'Informational') {
          intentValue = 60;
        }

        const contentGapScore = result.contentGap.length > 40 ? 95 : 70;
        const scoreValue = Math.round(
          (result.businessRelevance * 0.35) +
          (intentValue * 0.25) +
          (contentGapScore * 0.20) +
          ((100 - result.estimatedDifficulty) * 0.20)
        );

        opportunities.push({
          keyword,
          normalizedKeyword: result.normalizedKeyword.toLowerCase().trim(),
          intent: result.intent,
          contentType: result.contentType,
          businessRelevance: result.businessRelevance,
          estimatedDifficulty: result.estimatedDifficulty,
          competitorPresence: result.competitorPresence,
          opportunityScore: Math.max(0, Math.min(100, scoreValue)),
          explanation: result.explanation,
          serpTypes: result.serpTypes,
          rankingDomains: rankingDomains.length > 0 ? rankingDomains : result.competitors,
          competitors: result.competitors.filter(c => competitorDomains.includes(c) || competitorDomains.some(cd => cd.includes(c) || c.includes(cd))),
          searchFeatures: result.searchFeatures,
          supportingTerms: result.supportingTerms || [],
          contentGap: result.contentGap,
          recommendedAssetType: result.recommendedAssetType,
          priority: result.priority,
          reasoning: result.reasoning
        });
      } catch (err: any) {
        console.error(`[SearchOpportunityService] Classification failed for "${keyword}":`, err.message);
        // Build fallback opportunities on provider failure so pipeline never crashes
        opportunities.push({
          keyword,
          normalizedKeyword: keyword.toLowerCase().trim(),
          intent: 'Informational',
          contentType: 'Guide',
          businessRelevance: 50,
          estimatedDifficulty: 50,
          competitorPresence: 50,
          opportunityScore: 40,
          explanation: `Fallback analysis due to provider failure: ${err.message}`,
          serpTypes: [],
          rankingDomains: [],
          competitors: [],
          searchFeatures: [],
          supportingTerms: [],
          contentGap: 'Unable to evaluate content gaps due to connection issues.',
          recommendedAssetType: 'Guide',
          priority: 'Medium',
          reasoning: `Telemetry classification failed: ${err.message}`
        });
      }
    }

    // Sort opportunities by score descending
    return opportunities.sort((a, b) => b.opportunityScore - a.opportunityScore);
  }
}
