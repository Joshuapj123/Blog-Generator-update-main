import { NextResponse } from 'next/server';
import { WebsiteIntelligenceService } from '@/lib/saas-intelligence/website-intelligence';
import { SearchOpportunityService } from '@/lib/saas-intelligence/SearchOpportunityService';
import { GeminiProvider } from '@/lib/content/GeminiProvider';
import { SerperProvider } from '@/lib/research/SerperProvider';
import { GenerationPipelineAdapter, DryRunLLMProvider, DryRunSearchProvider } from '@/lib/core/GenerationPipelineAdapter';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendChunk = (chunk: any) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          } catch (e) {
            console.warn('[API Route] Failed to enqueue chunk:', e);
          }
        };

        try {
          // Crawling/Ingesting website content
          sendChunk({ type: 'status', message: 'Analyzing website URL and verifying safety...', progress: 5 });
          
          const intelService = new WebsiteIntelligenceService();
          const { profile, candidateKeywords } = await intelService.extractBusinessProfile(url);

          // Understanding business profile
          sendChunk({ 
            type: 'status', 
            message: `Extracted business profile for: ${profile.name}. Building market positioning...`, 
            progress: 15 
          });

          // Finding search opportunities & choosing the best one
          sendChunk({ type: 'status', message: 'Analyzing keyword search opportunities...', progress: 25 });
          
          const dryRun = process.env.ENABLE_DRY_RUN === 'true';
          const llm = dryRun ? new DryRunLLMProvider() : new GeminiProvider();
          const search = dryRun ? new DryRunSearchProvider() : new SerperProvider();
          const oppService = new SearchOpportunityService(search, llm);
          
          const competitorDomains = profile.primaryCompetitors || [];
          const opportunities = await oppService.analyzeOpportunities(
            profile.name,
            (profile as any).category || 'SaaS',
            candidateKeywords,
            competitorDomains,
            { saasProfile: profile }
          );

          const bestOpportunity = opportunities.sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0))[0];
          if (!bestOpportunity) {
            throw new Error('No target keyword opportunities could be analyzed from candidate keywords.');
          }

          // Content strategy formulation
          sendChunk({ 
            type: 'status', 
            message: `Selected best content opportunity keyword: "${bestOpportunity.keyword}" (Score: ${bestOpportunity.opportunityScore}). Triggering generation...`, 
            progress: 35 
          });

          // Hand off to existing GenerationPipelineAdapter.runPipeline
          const payload = {
            title: bestOpportunity.keyword,
            targetKeywords: bestOpportunity.keyword,
            contentType: bestOpportunity.contentType || 'Guide',
            targetAudience: profile.targetAudience,
            saasProfile: profile,
            customInsights: `SaaS Profile: ${profile.name} - ${profile.description}. key features: ${profile.keyFeatures?.join(', ')}.`,
            campaignMode: 'standard',
            externalLinks: []
          };

          await GenerationPipelineAdapter.runPipeline(payload, sendChunk, req.signal);
        } catch (err: any) {
          console.error('[API Route] URL Autopilot failed:', err.message);
          sendChunk({ 
            type: 'error', 
            message: err.message || 'Autopilot generation failed.',
            reason: err.message || 'Unknown generation error'
          });
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  } catch (err: any) {
    console.error('[API Route] Request Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
