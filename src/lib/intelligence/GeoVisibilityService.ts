import { AIVisibilityProvider } from './AIVisibilityProvider';
import { GEOVisibilityResultSchema, GEOOpportunitySchema } from '@/core/contracts/schemas';
import { z } from 'zod';

export class PromptDiscoveryService {
  static discoverPrompts(opportunities: any[], budget: number = 5): any[] {
    const prompts: any[] = [];
    const sortedOpps = [...opportunities].sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0));

    for (const opp of sortedOpps) {
      if (prompts.length >= budget) break;

      const keyword = opp.keyword;
      const priority = opp.opportunityScore > 80 ? 'High' : (opp.opportunityScore > 50 ? 'Medium' : 'Low');

      const angles = [
        `What are the best ${keyword}?`,
        `Which ${keyword} is highly recommended for users?`,
        `What is the best alternative to ${keyword}?`,
        `Which ${keyword} is best for beginners and professionals?`
      ];

      for (const prompt of angles) {
        if (prompts.length >= budget) break;
        if (!prompts.some(p => p.prompt.toLowerCase() === prompt.toLowerCase())) {
          prompts.push({
            id: 'prompt_' + Math.random().toString(36).substring(2, 9),
            prompt,
            sourceKeyword: keyword,
            intent: opp.intent || 'Commercial',
            category: opp.contentType || 'Guide',
            priority
          });
        }
      }
    }
    return prompts;
  }
}

export class BrandMentionAnalyzer {
  static analyze(answer: string, brandName: string, competitorDomains: string[]): {
    brandMentioned: boolean;
    brandPosition?: number;
    competitorsMentioned: string[];
  } {
    const text = answer.toLowerCase();
    const brandClean = brandName.toLowerCase().replace('.com', '');
    const brandRegex = new RegExp(`\\b${brandClean}\\b`, 'i');
    const brandMentioned = brandRegex.test(text) || text.includes(brandClean);

    let brandPosition: number | undefined;
    if (brandMentioned) {
      const lines = answer.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(brandClean)) {
          const match = lines[i].match(/^\s*(\d+)[\.\)]/);
          if (match) {
            brandPosition = parseInt(match[1]);
            break;
          }
        }
      }
    }

    const competitorsMentioned: string[] = [];
    for (const domain of competitorDomains) {
      const compClean = domain.toLowerCase().split('.')[0];
      const compSubClean = compClean.replace(/hq|app|software|tool|ai|labs/g, '');
      const compRegex1 = new RegExp(`\\b${compClean}\\b`, 'i');
      const compRegex2 = new RegExp(`\\b${compSubClean}\\b`, 'i');
      if (
        compRegex1.test(text) || 
        text.includes(compClean) ||
        (compSubClean.length > 2 && (compRegex2.test(text) || text.includes(compSubClean)))
      ) {
        competitorsMentioned.push(domain);
      }
    }

    return {
      brandMentioned,
      brandPosition,
      competitorsMentioned
    };
  }
}

export class CitationAnalyzer {
  static extractAndClassify(
    answer: string,
    brandDomain: string,
    competitorDomains: string[],
    promptId: string
  ): any[] {
    const citations: any[] = [];
    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g;
    const urlRegex = /(https?:\/\/[^\s\)]+)/g;
    const seenUrls = new Set<string>();

    let match;
    while ((match = linkRegex.exec(answer)) !== null) {
      const title = match[1];
      const url = match[2];
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        citations.push(this.createCitation(url, title, brandDomain, competitorDomains, promptId));
      }
    }

    while ((match = urlRegex.exec(answer)) !== null) {
      const url = match[1];
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        citations.push(this.createCitation(url, 'Source', brandDomain, competitorDomains, promptId));
      }
    }

    return citations;
  }

  private static createCitation(
    url: string,
    title: string,
    brandDomain: string,
    competitorDomains: string[],
    promptId: string
  ) {
    let domain = '';
    try {
      domain = new URL(url).hostname.toLowerCase().replace('www.', '');
    } catch {
      domain = url.toLowerCase();
    }

    let type: 'brand' | 'competitor' | 'independent' = 'independent';
    if (domain.includes(brandDomain.toLowerCase()) || brandDomain.toLowerCase().includes(domain)) {
      type = 'brand';
    } else if (competitorDomains.some(cd => domain.includes(cd.toLowerCase()) || cd.toLowerCase().includes(domain))) {
      type = 'competitor';
    }

    return {
      url,
      domain,
      title,
      citedBy: promptId,
      relevance: type === 'brand' ? 100 : (type === 'competitor' ? 80 : 50)
    };
  }
}

export class GEOScoringService {
  static calculate(results: any[], brandDomain: string): {
    geoScore: number;
    metrics: {
      mentionRate: number;
      citationRate: number;
      competitiveVisibility: number;
      mentionPositionScore: number;
      entityCoverageScore: number;
    }
  } {
    const successfulResults = results.filter(r => r.answerMetadata?.success);
    if (successfulResults.length === 0) {
      return {
        geoScore: 0,
        metrics: {
          mentionRate: 0,
          citationRate: 0,
          competitiveVisibility: 0,
          mentionPositionScore: 0,
          entityCoverageScore: 0
        }
      };
    }

    const mentions = successfulResults.filter(r => r.brandMentioned).length;
    const mentionRate = Math.round((mentions / successfulResults.length) * 100);

    const brandCitations = successfulResults.filter(r => 
      r.citations.some((c: any) => c.domain.includes(brandDomain.toLowerCase()) || brandDomain.toLowerCase().includes(c.domain))
    ).length;
    const citationRate = Math.round((brandCitations / successfulResults.length) * 100);

    let competitorMentions = 0;
    successfulResults.forEach(r => {
      competitorMentions += r.competitorsMentioned?.length || 0;
    });
    const avgCompetitorMentions = competitorMentions / successfulResults.length;
    const competitiveVisibility = Math.round(
      Math.max(0, Math.min(100, (mentions / Math.max(1, mentions + avgCompetitorMentions)) * 100))
    );

    let totalPosScore = 0;
    let mentionCounts = 0;
    successfulResults.forEach(r => {
      if (r.brandMentioned) {
        mentionCounts++;
        const pos = r.answerMetadata?.answer ? this.detectPosition(r.answerMetadata.answer, r.prompt) : 10;
        totalPosScore += Math.max(10, 100 - (pos - 1) * 10);
      }
    });
    const mentionPositionScore = mentionCounts > 0 ? Math.round(totalPosScore / mentionCounts) : 0;

    const entityCoverageScore = Math.min(100, 40 + mentionRate * 0.6);

    const geoScore = Math.round(
      (mentionRate * 0.30) +
      (citationRate * 0.25) +
      (competitiveVisibility * 0.20) +
      (mentionPositionScore * 0.15) +
      (entityCoverageScore * 0.10)
    );

    return {
      geoScore,
      metrics: {
        mentionRate,
        citationRate,
        competitiveVisibility,
        mentionPositionScore,
        entityCoverageScore: Math.round(entityCoverageScore)
      }
    };
  }

  private static detectPosition(answer: string, prompt: string): number {
    return 1;
  }
}

export class GEORecommendationService {
  static generate(
    results: any[],
    metrics: any,
    saasName: string,
    brandDomain: string,
    competitorDomains: string[]
  ): any[] {
    const recommendations: any[] = [];

    if (metrics.mentionRate < 50) {
      recommendations.push({
        issue: 'Low brand visibility in AI responses for high-value search prompts.',
        evidence: `${saasName} was mentioned in only ${metrics.mentionRate}% of analyzed AI answers.`,
        impact: 'High',
        priority: 'High',
        recommendedAction: 'Create comprehensive educational guides and landing pages focusing on target use-cases. Explicitly optimize page headings for direct recommendation intent questions.'
      });
    }

    if (metrics.citationRate < 30) {
      recommendations.push({
        issue: `AI models do not cite domain "${brandDomain}" as a reference source.`,
        evidence: `Brand-owned citations appeared in only ${metrics.citationRate}% of AI search responses.`,
        impact: 'High',
        priority: 'High',
        recommendedAction: 'Publish deep-dive research reports, statistics tables, and technical schema structures. Link out to high-authority domains to establish E-E-A-T relationship alignment.'
      });
    }

    let competitorCitationsCount = 0;
    results.forEach(r => {
      r.citations.forEach((c: any) => {
        if (competitorDomains.some(cd => c.domain.includes(cd.toLowerCase()))) {
          competitorCitationsCount++;
        }
      });
    });

    if (competitorCitationsCount > 0) {
      recommendations.push({
        issue: 'SaaS Competitors currently monopolize citations on AI search engines.',
        evidence: `Competitors earned ${competitorCitationsCount} citations across visibility query runs.`,
        impact: 'Medium',
        priority: 'Medium',
        recommendedAction: 'Audit competitor cited pages. Build alternative and comparison resource guides (e.g. "Competitor Alternatives") to redirect target comparisons back to our platform.'
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        issue: 'Topical authority can be strengthened.',
        evidence: 'Visibility metrics are optimal but not yet dominant (100%).',
        impact: 'Low',
        priority: 'Low',
        recommendedAction: 'Continue expanding targeting use-case entities and refreshing technical copy references.'
      });
    }

    return recommendations;
  }
}

export class GeoVisibilityService {
  private providers: AIVisibilityProvider[];

  constructor(providers: AIVisibilityProvider[]) {
    this.providers = providers;
  }

  async analyzeVisibility(
    saasName: string,
    brandDomain: string,
    opportunities: any[],
    competitorDomains: string[],
    options?: { runId?: string; promptBudget?: number }
  ): Promise<{
    visibilityResults: z.infer<typeof GEOVisibilityResultSchema>[];
    geoOpportunities: z.infer<typeof GEOOpportunitySchema>[];
    geoScore: number;
    metrics: any;
  }> {
    const prompts = PromptDiscoveryService.discoverPrompts(opportunities, options?.promptBudget || 5);
    const queryTasks = prompts.flatMap((promptObj) =>
      this.providers.map(async (provider) => {
        console.log(`[GeoVisibilityService] Querying ${provider.providerName} for prompt: "${promptObj.prompt}"`);
        const answerMeta = await provider.query(promptObj.prompt, { runId: options?.runId });

        if (answerMeta.success && answerMeta.answer) {
          const mentionResult = BrandMentionAnalyzer.analyze(answerMeta.answer, saasName, competitorDomains);
          const citations = CitationAnalyzer.extractAndClassify(answerMeta.answer, brandDomain, competitorDomains, promptObj.id);

          return {
            prompt: promptObj.prompt,
            provider: provider.providerName,
            brandMentioned: mentionResult.brandMentioned,
            competitorsMentioned: mentionResult.competitorsMentioned,
            citations,
            answerMetadata: answerMeta,
            visibilityScore: mentionResult.brandMentioned ? 100 : 0
          };
        } else {
          return {
            prompt: promptObj.prompt,
            provider: provider.providerName,
            brandMentioned: false,
            competitorsMentioned: [],
            citations: [],
            answerMetadata: answerMeta,
            visibilityScore: 0
          };
        }
      })
    );

    const visibilityResults = await Promise.all(queryTasks);

    const scoreData = GEOScoringService.calculate(visibilityResults, brandDomain);
    const geoOpportunities = GEORecommendationService.generate(
      visibilityResults,
      scoreData.metrics,
      saasName,
      brandDomain,
      competitorDomains
    );

    return {
      visibilityResults,
      geoOpportunities,
      geoScore: scoreData.geoScore,
      metrics: scoreData.metrics
    };
  }
}
