// src/lib/nlp-sidecar.ts

const NLP_SERVICE_URL = (process.env.NLP_SERVICE_URL || '').trim();
const NLP_SERVICE_KEY = (process.env.NLP_SERVICE_KEY || '').trim();

export async function extractKeywordViaSidecar(
  plainText: string,
  htmlText: string = '',
  serpContext?: { titles?: string[], paaQuestions?: string[], relatedSearches?: string[] },
  topN = 30,
): Promise<any | null> {
  if (!NLP_SERVICE_URL) {
    console.warn('[NLP Sidecar] NLP_SERVICE_URL is not defined. Skipping extraction.');
    return null;
  }

  try {
    const supplementary_texts = [
      ...(serpContext?.titles || []),
      ...(serpContext?.paaQuestions || []),
      ...(serpContext?.relatedSearches || [])
    ];

    const baseUrl = NLP_SERVICE_URL.startsWith('http') ? NLP_SERVICE_URL : `https://${NLP_SERVICE_URL}`;
    const res = await fetch(`${baseUrl}/extract-seo-keywords`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(NLP_SERVICE_KEY ? { 'x-api-key': NLP_SERVICE_KEY } : {}),
      },
      body: JSON.stringify({ 
        plain_text: plainText, 
        html_text: htmlText, 
        supplementary_texts,
        depth: 'deep',
        top_n: topN 
      }),
      signal: AbortSignal.timeout(55_000),   // 55 s timeout to allow heavy NLP processing on Railway
    });

    if (!res.ok) {
      if (res.status === 401) {
        console.error('\n================================================================');
        console.error('⚠️ [NLP Sidecar] ERROR: 401 Unauthorized.');
        console.error(`The NLP_SERVICE_KEY provided in your .env file does NOT match the key on Railway (${NLP_SERVICE_URL}).`);
        console.error('Please verify your environment variables and update your .env file.');
        console.error('================================================================\n');
      } else {
        console.error(`[NLP Sidecar] Failed to extract keywords. HTTP Status: ${res.status}`);
      }
      return null;
    }

    const data = await res.json();
    return data;
  } catch (err) {
    console.error('[NLP Sidecar] Service unavailable or timed out:', err);
    // TODO: Implement JS Fallback for keyword extraction here
    return null;
  }
}
