import { NextResponse } from 'next/server';
import { GenerationPipelineAdapter } from '@/lib/core/GenerationPipelineAdapter';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const payload = await req.json();

    console.log('[API Route] Routing request through GenerationPipelineAdapter...');
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
          await GenerationPipelineAdapter.runPipeline(payload, sendChunk, req.signal);
        } catch (err: any) {
          console.error('[API Route] GenerationPipelineAdapter failed:', err.message);
          // Send terminal error chunk to notify client
          sendChunk({ 
            type: 'error', 
            message: 'Generation failed. No valid article could be produced.',
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
