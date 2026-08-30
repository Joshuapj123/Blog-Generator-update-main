import { google } from '@ai-sdk/google';
import { generateObjectWithTelemetry, generateTextWithTelemetry, logPipelineCheckpoint } from '@/lib/gemini-telemetry';
import { GeminiProvider } from '@/lib/content/GeminiProvider';
import { SerperProvider } from '@/lib/research/SerperProvider';
import { SaaSProfileService } from '@/lib/saas-intelligence/SaaSProfileService';
import { CompetitorDiscoveryService } from '@/lib/saas-intelligence/CompetitorDiscoveryService';
import { MarketIntelligenceService } from '@/lib/saas-intelligence/MarketIntelligenceService';
import { SearchOpportunityService } from '@/lib/saas-intelligence/SearchOpportunityService';
import { z } from 'zod';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // Strategy generation can take a bit longer

export async function POST(req: Request) {
  try {
    const { productDescription } = await req.json();

    if (!productDescription) {
      return NextResponse.json({ error: 'Product description is required' }, { status: 400 });
    }

    const apiKey = process.env.SERP_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'SERP_KEY environment variable is not set' }, { status: 500 });
    }

    const model = google('gemini-2.5-pro');
    const fastModel = google('gemini-2.5-flash');

    const runId = 'run_plan_' + Date.now();

    // 1. Extract a core keyword for Serper query
    const { text: coreKeywordText } = await generateTextWithTelemetry('Core Keyword Extraction', {
      model: fastModel,
      prompt: `Extract a single, concise 2-4 word Google search query that represents the core product or service described here: "${productDescription}". Return nothing but the search query.`,
      cacheKey: 'core_keyword_' + productDescription,
      runId
    });
    
    const coreQuery = coreKeywordText.trim().replace(/["']/g, '');
    logPipelineCheckpoint('keyword_extraction', productDescription, coreQuery, true);

    // 2. Fetch live SERP data
    let serpContext = '';
    try {
      const serperRes = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q: coreQuery, num: 10 }),
      });

      if (serperRes.ok) {
        const data = await serperRes.json();
        const organicTitles = (data.organic || []).slice(0, 5).map((o: any) => o.title).join(' | ');
        const paaQuestions = (data.peopleAlsoAsk || []).slice(0, 4).map((p: any) => p.question).join(' | ');
        const related = (data.relatedSearches || []).slice(0, 4).map((r: any) => r.query).join(' | ');
        
        serpContext = `
LIVE SERP DATA for "${coreQuery}":
Top Competitor Titles: ${organicTitles}
People Also Ask: ${paaQuestions}
Related Searches: ${related}
        `;
      }
    } catch (e) {
      console.warn('Serper request failed during plan generation', e);
    }

    // 3. Generate the exhaustive structured plan
    const result = await generateObjectWithTelemetry('Strategy Generation', {
      model,
      cacheKey: 'strategy_plan_' + productDescription,
      runId,
      schema: z.object({
        coreTakeaway: z.string().describe('A 1-2 sentence high-level SEO playbook summary.'),
        actionPlan: z.array(z.object({
          title: z.string().describe('Short goal title'),
          description: z.string().optional().describe('One-line description'),
          tasks: z.array(z.object({
            task: z.string().describe('Specific checkbox task'),
            completed: z.boolean().optional().describe('Initial status, set to false.')
          })).min(1).max(6)
        })).min(1).max(8),
        checklist: z.array(z.object({
          task: z.string().describe('The task to implement'),
          reason: z.string().describe('Why it matters')
        })).min(3).max(6),
        mistakes: z.array(z.string()).min(2).max(4).describe('Crucial SEO mistakes to avoid.'),
        actionItems: z.array(z.string()).min(3).max(6).describe('Top 5 immediate actionable steps.'),
        recommendedPages: z.array(
          z.object({
            title: z.string().describe('SEO optimized page title'),
            keyword: z.string().describe('Primary target keyword'),
            intent: z.enum(['informational', 'navigational', 'commercial', 'transactional']).describe('Search intent'),
            role: z.enum(['primary', 'support']).describe('Is this the core money page (primary) or a cluster article (support)?'),
            format: z.string().describe('Recommended format (e.g., Ultimate Guide, Listicles, Case Study, Landing Page)'),
          })
        ).min(4).max(7).describe('Must include exactly 1 primary money page and up to 6 support pages.'),
      }),
      prompt: `You are an expert SEO content strategist following a strict hub-and-spoke (pillar/cluster) methodology. 
Based on the following product/service description and live SERP data, generate a concrete 30-day content architecture plan.

PRODUCT/SERVICE: "${productDescription}"
${serpContext}

RULES:
1. Provide a short "coreTakeaway" summary.
2. Design a 6-goal "actionPlan" checklist. Goal 1: Create the plan. Goal 2: Decide top 5-10 keywords. Goal 3: Create one quality page for the main keyword. Goal 4: Create supporting cluster content. Goal 5: Strengthen the money page (internal linking). Goal 6: Improve authority (backlinks/outreach). Under each goal, provide 3-5 specific tasks.
3. Provide a practical checklist table with 5 rows of what to implement and why.
4. List 2-4 critical mistakes to avoid.
5. Provide the top 5 immediate action steps.
6. Design the "recommendedPages" cluster. You MUST include EXACTLY ONE 'primary' money page targeting a high-value commercial/transactional keyword. You MUST include 3 to 6 'support' pages targeting informational long-tail and 'People Also Ask' questions that will link back to the primary page. Specify the best format for each based on the SERP intent.`,
    });

    // Ensure stable defaults for the frontend
    const output = result.object;
    logPipelineCheckpoint('strategy_generation', productDescription, coreQuery, true);

    // Run SaaS Intelligence Services
    let saasIntelligenceProfile: any = null;
    try {
      const llm = new GeminiProvider();
      const search = new SerperProvider();

      const profileService = new SaaSProfileService(llm);
      const normalized = await profileService.normalizeProfile({
        name: coreQuery,
        description: productDescription
      }, { runId });

      const compService = new CompetitorDiscoveryService(search, llm);
      const competitors = await compService.discoverCompetitors({
        name: coreQuery,
        category: normalized.product?.category || 'SaaS',
        description: productDescription
      }, { runId });

      const marketService = new MarketIntelligenceService(llm);
      const marketData = await marketService.extractMarketIntelligence({
        name: coreQuery,
        description: productDescription,
        features: normalized.product?.features || []
      }, { runId });

      const oppService = new SearchOpportunityService(search, llm);
      const seedKeywords = [
        coreQuery,
        `${normalized.product?.category || 'SaaS'} software`,
        `best ${normalized.product?.category || 'SaaS'} tools`,
        `${coreQuery} alternatives`
      ];
      const opportunities = await oppService.analyzeOpportunities(
        coreQuery,
        normalized.product?.category || 'SaaS',
        seedKeywords,
        competitors.map(c => c.domain),
        { runId }
      );

      saasIntelligenceProfile = {
        product: {
          ...normalized.product,
          name: coreQuery,
          description: productDescription
        },
        audience: marketData.audience,
        market: {
          competitors,
          competitorProducts: competitors.map(c => c.name),
          alternatives: competitors.map(c => c.name),
          adjacentCategories: [normalized.product?.category || 'SaaS'],
          positioning: marketData.positioning
        },
        opportunities
      };
    } catch (err: any) {
      console.warn('[generate-plan] Failed to generate SaaS Intelligence profile:', err.message);
    }

    const plan = {
      ...output,
      actionPlan: (output.actionPlan || []).map((goal: any) => ({
        ...goal,
        tasks: (goal.tasks || []).map((task: any) => ({
           ...task,
           completed: !!task.completed
        }))
      })),
      recommendedPages: (output.recommendedPages || []).map((rp: any) => ({ ...rp, selected: true })),
      saasIntelligenceProfile
    };

    return NextResponse.json(plan);
  } catch (error: any) {
    console.error('Generate Plan Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
