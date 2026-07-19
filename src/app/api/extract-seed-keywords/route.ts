import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  let productDescription = '';
  try {
    const body = await req.json();
    productDescription = body.productDescription;

    if (!productDescription || typeof productDescription !== 'string') {
      return NextResponse.json({ error: 'productDescription is required' }, { status: 400 });
    }

    const model = google('gemini-2.5-flash');

    const result = await generateObject({
      model,
      schema: z.object({
        seeds: z.array(z.string()).max(3).describe("2-3 concise Google search queries (max 4 words each)"),
      }),
      prompt: `Extract 2-3 concise Google search queries (max 4 words each) that best represent the core topic of this product description.
      
Product Description:
"""
${productDescription}
"""`,
    });

    const seeds = result.object.seeds.filter(s => s.trim().length > 0);
    
    if (seeds.length === 0) {
      throw new Error("No seeds generated");
    }

    return NextResponse.json({ seeds });
  } catch (error: any) {
    console.error('Extract Seed Keywords Error:', error);
    
    // Graceful Fallback
    if (productDescription) {
       const fallbackSeed = productDescription.trim().split(/\s+/).slice(0, 4).join(' ');
       if (fallbackSeed) {
         return NextResponse.json({ seeds: [fallbackSeed], fallback: true });
       }
    }
    
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
