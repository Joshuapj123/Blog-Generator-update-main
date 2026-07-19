import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

// ─── Volume bucket definition (mirrors Google Ads Keyword Planner ranges) ──
const VOLUME_BUCKETS = [
  '< 10',
  '10–100',
  '100–1K',
  '1K–10K',
  '10K–100K',
  '100K–1M',
] as const;

// ─── Schema mirrors Google Ads GenerateKeywordIdeas response shape ──────────
// When real Google Ads API is connected, the route.ts response shape stays
// identical — only the data source changes. Zero UI changes required.
const GadsKeywordSchema = z.object({
  keyword: z.string().describe('The keyword phrase'),
  avgMonthlySearches: z.enum(VOLUME_BUCKETS).describe('Average monthly search volume range, as returned by Google Keyword Planner'),
  competition: z.enum(['LOW', 'MEDIUM', 'HIGH']).describe('Competition level among advertisers'),
  competitionScore: z.number().min(0).max(1).describe('Competition score between 0 and 1 (0 = low, 1 = high)'),
  cpcLow: z.number().describe('Low end of CPC bid estimate in USD'),
  cpcHigh: z.number().describe('High end of CPC bid estimate in USD'),
  intent: z.enum(['primary', 'secondary', 'long-tail']).describe('SEO role of this keyword'),
  searchIntent: z.enum(['informational', 'navigational', 'commercial', 'transactional']),
});

// ─── Real Google Ads API integration (Phase 2) ───────────────────────────────
// To activate: set GOOGLE_ADS_DEVELOPER_TOKEN in .env and implement the
// fetchRealGadsKeywords function below using the google-ads-api npm package.
// The response must conform to the same GadsKeywordSchema shape.

async function fetchRealGadsKeywords(
  _title: string,
  _creds?: { developerToken: string; clientId: string; clientSecret: string; refreshToken: string; customerId: string }
): Promise<null> {
  // Phase 2: Replace this with google-ads-api GenerateKeywordIdeas call.
  // See: https://developers.google.com/google-ads/api/docs/keyword-planning/generate-keyword-ideas
  // Required creds: developerToken, clientId, clientSecret, refreshToken, customerId
  // These can come from environment variables OR from the `_creds` parameter
  // (passed when the user has authenticated via the Connect Google Ads modal).
  return null;
}

// ─── AI Simulation (Phase 1) — realistic Keyword Planner shaped data ─────────
async function fetchSimulatedGadsKeywords(title: string) {
  const model = google('gemini-2.5-pro');

  const result = await generateObject({
    model,
    schema: z.object({
      keywords: z.array(GadsKeywordSchema).min(8).max(12),
    }),
    prompt: `You are simulating the Google Ads Keyword Planner API for keyword research.

Given the blog post title: "${title}", generate a realistic set of keyword ideas that a Google Ads Keyword Planner report would return.

Rules for realistic simulation:
- Primary topic keywords should have higher volume (1K-10K, 10K-100K) and MEDIUM-HIGH competition
- Long-tail / specific phrasing keywords should have lower volume (10-1K) and LOW-MEDIUM competition  
- CPC should correlate with competition: LOW = $0.10-$1.50, MEDIUM = $1.50-$5.00, HIGH = $4.00-$15.00
- Include a mix of informational, commercial, and transactional intent
- Include 8-12 diverse keyword ideas ranging from broad to specific
- Make keyword ideas realistic and actually searchable by real users
- Include question-based keywords (how to, what is, best way to)

Return data that looks exactly like what Google Keyword Planner would return.`,
  });

  return result.object.keywords;
}

// ─── Route Handler ─────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, gadsCreds } = body;

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    // Check if real Google Ads credentials are configured:
    // First try server-side env vars, then fall back to client-provided credentials.
    const envCreds = {
      developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
      clientId: process.env.GOOGLE_ADS_CLIENT_ID,
      clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET,
      refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN,
      customerId: process.env.GOOGLE_ADS_CUSTOMER_ID,
    };

    const clientCreds = gadsCreds && typeof gadsCreds === 'object'
      && gadsCreds.developerToken && gadsCreds.clientId
      && gadsCreds.clientSecret && gadsCreds.refreshToken
      && gadsCreds.customerId
      ? gadsCreds as { developerToken: string; clientId: string; clientSecret: string; refreshToken: string; customerId: string }
      : null;

    const hasEnvCreds = !!(
      envCreds.developerToken &&
      envCreds.clientId &&
      envCreds.clientSecret &&
      envCreds.refreshToken &&
      envCreds.customerId
    );

    let keywords: any[];
    let isSimulated: boolean;

    if (hasEnvCreds || clientCreds) {
      const activeCreds = hasEnvCreds
        ? {
          developerToken: envCreds.developerToken!,
          clientId: envCreds.clientId!,
          clientSecret: envCreds.clientSecret!,
          refreshToken: envCreds.refreshToken!,
          customerId: envCreds.customerId!,
        }
        : clientCreds!;

      const realData = await fetchRealGadsKeywords(title, activeCreds);
      if (realData) {
        keywords = realData as any[];
        isSimulated = false;
      } else {
        // Fallback to simulation if real API fails
        keywords = await fetchSimulatedGadsKeywords(title);
        isSimulated = true;
      }
    } else {
      keywords = await fetchSimulatedGadsKeywords(title);
      isSimulated = true;
    }

    return NextResponse.json({
      mode: 'google',
      isSimulated,
      keywords,
    });

  } catch (error: any) {
    console.error('Google Ads Keyword Suggestion API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
