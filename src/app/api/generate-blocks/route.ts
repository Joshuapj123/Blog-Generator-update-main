import { NextResponse } from 'next/server';
import { GenerationPipelineAdapter } from '@/lib/core/GenerationPipelineAdapter';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const payload = await req.json();

    console.log('[API Route] Routing request through GenerationPipelineAdapter...');
    const encoder = new TextEncoder();
    const chunks: any[] = [];
    const sendChunk = (chunk: any) => chunks.push(chunk);

    try {
      await GenerationPipelineAdapter.runPipeline(payload, sendChunk, req.signal);
    } catch (err: any) {
      console.error('[API Route] GenerationPipelineAdapter failed:', err.message);
      return NextResponse.json({
        error: 'Generation failed. No valid article could be produced.',
        reason: err.message || 'Unknown generation error'
      }, { status: 500 });
    }

    // Return the buffered chunks as a ReadableStream response
    const stream = new ReadableStream({
      start(controller) {
        chunks.forEach(c => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(c)}\n\n`));
        });
        controller.close();
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
