import { JSDOM } from 'jsdom';
import { verifyUrlSafety, normalizeUrl } from './url-verifier';

export interface DiscoveredUrl {
  url: string;
  source: 'sitemap' | 'robots' | 'homepage';
}

export interface InternalLinkCandidate {
  url: string;
  title: string;
  h1: string;
  description: string;
  score: number;
  reason: string;
  suggestedAnchor: string;
}

export interface InternalLinkDiscoveryResult {
  domain: string;
  totalDiscovered: number;
  candidates: InternalLinkCandidate[];
  sitemapFound: boolean;
  error?: string;
}

const TECH_SYNONYMS: Record<string, string[]> = {
  saas: ['saas', 'software as a service', 'cloud software'],
  custom: ['custom', 'personalizat', 'personalizate', 'bespoke', 'tailored'],
  platform: ['platform', 'platforma', 'platforme', 'portal', 'dashboard'],
  development: ['development', 'dezvoltare', 'develop', 'coding', 'build', 'programming'],
  web: ['web', 'website', 'online', 'cloud'],
  software: ['software', 'aplicatie', 'aplicatii', 'app', 'apps'],
  ai: ['ai', 'artificial intelligence', 'inteligenta artificiala', 'llm', 'machine learning'],
  automation: ['automation', 'automatizare', 'automatizari', 'workflow', 'n8n', 'zapier'],
  design: ['design', 'ui', 'ux', 'grafica']
};

export class SitemapDiscoveryService {
  private static cache = new Map<string, { timestamp: number; data: InternalLinkDiscoveryResult }>();
  private static CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Helper to perform a fetch with a strict timeout and maximum byte size limit.
   */
  private static async fetchWithTimeout(urlStr: string, timeoutMs: number = 10000, maxBytes: number = 500000): Promise<{ status: number; text: string; contentType: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(urlStr, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        signal: controller.signal,
        redirect: 'follow'
      });

      const contentType = res.headers.get('content-type') || '';
      
      // Read stream up to maxBytes to prevent memory blowup
      const reader = res.body?.getReader();
      let text = '';
      if (reader) {
        const decoder = new TextDecoder();
        let bytesReceived = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytesReceived += value.byteLength;
          text += decoder.decode(value, { stream: true });
          if (bytesReceived >= maxBytes) {
            await reader.cancel();
            break;
          }
        }
      } else {
        text = await res.text();
      }

      return { status: res.status, text, contentType };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Normalize input domain into clean origin (e.g. https://smetytech.com)
   */
  public static normalizeOrigin(rawUrl: string): { origin: string; hostname: string } | null {
    try {
      const normalized = normalizeUrl(rawUrl);
      const parsed = new URL(normalized);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return null;
      }
      return {
        origin: `${parsed.protocol}//${parsed.hostname}`,
        hostname: parsed.hostname.toLowerCase()
      };
    } catch {
      return null;
    }
  }

  /**
   * Filter and sanitize candidate URLs
   */
  private static isValidCandidateUrl(urlStr: string, allowedHostname: string): boolean {
    try {
      const p = new URL(urlStr);
      if (p.protocol !== 'http:' && p.protocol !== 'https:') return false;
      if (p.hostname.toLowerCase() !== allowedHostname && !p.hostname.toLowerCase().endsWith(`.${allowedHostname}`)) {
        return false;
      }

      const lowerPath = p.pathname.toLowerCase();

      // Exclude static assets
      if (lowerPath.match(/\.(jpg|jpeg|png|gif|svg|css|js|webp|pdf|xml|json|ico|zip|gz|tar|mp3|mp4|avi|mov|woff|woff2|ttf|eot)$/i)) {
        return false;
      }

      // Exclude administrative, feed, and utility paths
      if (
        lowerPath.includes('/wp-content/') ||
        lowerPath.includes('/wp-includes/') ||
        lowerPath.includes('/wp-json/') ||
        lowerPath.includes('/admin') ||
        lowerPath.includes('/login') ||
        lowerPath.includes('/signin') ||
        lowerPath.includes('/cart') ||
        lowerPath.includes('/checkout') ||
        lowerPath.includes('/feed') ||
        lowerPath.includes('/xmlrpc') ||
        lowerPath.includes('/tag/') ||
        lowerPath.includes('/author/')
      ) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Discover website URLs via robots.txt, sitemaps, or homepage fallback (max 100).
   */
  public static async discoverUrls(rawDomain: string): Promise<{ origin: string; urls: DiscoveredUrl[]; sitemapFound: boolean }> {
    const originInfo = this.normalizeOrigin(rawDomain);
    if (!originInfo) {
      throw new Error(`Invalid domain or URL: ${rawDomain}`);
    }

    const { origin, hostname } = originInfo;

    // Security check: SSRF & Private IP validation
    const safety = await verifyUrlSafety(origin);
    if (!safety.safe) {
      throw new Error(`Target domain failed security verification: ${safety.error || 'Blocked host or IP range'}`);
    }

    const discoveredUrls: DiscoveredUrl[] = [];
    const seenUrls = new Set<string>();

    const addUrl = (urlStr: string, source: 'sitemap' | 'robots' | 'homepage') => {
      try {
        const p = new URL(urlStr);
        p.hash = '';
        p.search = '';
        let cleanPath = p.pathname;
        if (cleanPath.length > 1 && cleanPath.endsWith('/')) {
          cleanPath = cleanPath.slice(0, -1);
        }
        const clean = `${p.protocol}//${p.hostname}${cleanPath}`;
        if (!seenUrls.has(clean) && this.isValidCandidateUrl(clean, hostname)) {
          seenUrls.add(clean);
          discoveredUrls.push({ url: clean, source });
        }
      } catch {
        // ignore malformed
      }
    };

    let sitemapDirectives: string[] = [];

    // 1. Fetch robots.txt
    try {
      const robotsRes = await this.fetchWithTimeout(`${origin}/robots.txt`, 8000, 100000);
      if (robotsRes.status === 200 && robotsRes.text) {
        const matches = robotsRes.text.matchAll(/sitemap:\s*(https?:\/\/[^\s]+)/gi);
        for (const m of matches) {
          if (m[1]) sitemapDirectives.push(m[1].trim());
        }
      }
    } catch (e: any) {
      // Non-fatal fallback
    }

    // 2. Candidate Sitemaps
    const sitemapCandidates = Array.from(new Set([
      ...sitemapDirectives,
      `${origin}/sitemap.xml`,
      `${origin}/sitemap_index.xml`
    ])).slice(0, 5);

    let sitemapFound = false;

    for (const smUrl of sitemapCandidates) {
      if (discoveredUrls.length >= 100) break;
      try {
        // Ensure candidate belongs to same host
        const smParsed = new URL(smUrl);
        if (smParsed.hostname.toLowerCase() !== hostname && !smParsed.hostname.toLowerCase().endsWith(`.${hostname}`)) {
          continue;
        }

        const res = await this.fetchWithTimeout(smUrl, 8000, 500000);
        if (res.status === 200 && res.text && (res.text.includes('<urlset') || res.text.includes('<sitemapindex') || res.text.includes('<loc>'))) {
          sitemapFound = true;

          // Check if it's a sitemap index referencing child sitemaps
          if (res.text.includes('<sitemapindex')) {
            const childMatches = Array.from(res.text.matchAll(/<loc>(https?:\/\/[^<]+)<\/loc>/gi)).map(m => m[1].trim());
            // Fetch at most 2 child sitemaps to prevent crawling explosions
            for (const childUrl of childMatches.slice(0, 2)) {
              if (discoveredUrls.length >= 100) break;
              try {
                const childRes = await this.fetchWithTimeout(childUrl, 8000, 500000);
                if (childRes.status === 200) {
                  const locs = Array.from(childRes.text.matchAll(/<loc>(https?:\/\/[^<]+)<\/loc>/gi)).map(m => m[1].trim());
                  for (const loc of locs) {
                    addUrl(loc, 'sitemap');
                    if (discoveredUrls.length >= 100) break;
                  }
                }
              } catch {}
            }
          } else {
            // Standard urlset
            const locs = Array.from(res.text.matchAll(/<loc>(https?:\/\/[^<]+)<\/loc>/gi)).map(m => m[1].trim());
            for (const loc of locs) {
              addUrl(loc, 'sitemap');
              if (discoveredUrls.length >= 100) break;
            }
          }

          break; // Found primary valid sitemap
        }
      } catch {}
    }

    // 3. Fallback: Homepage link extraction if no sitemap was found or sitemap returned 0 URLs
    if (discoveredUrls.length === 0) {
      try {
        const homeRes = await this.fetchWithTimeout(`${origin}/`, 8000, 500000);
        if (homeRes.status === 200 && homeRes.text) {
          const dom = new JSDOM(homeRes.text, { url: origin });
          const anchors = Array.from(dom.window.document.querySelectorAll('a[href]'));
          for (const a of anchors) {
            const href = a.getAttribute('href');
            if (!href) continue;
            try {
              const absUrl = new URL(href, origin).toString();
              addUrl(absUrl, 'homepage');
              if (discoveredUrls.length >= 100) break;
            } catch {}
          }
        }
      } catch {}
    }

    return {
      origin,
      urls: discoveredUrls.slice(0, 100),
      sitemapFound
    };
  }

  /**
   * Tokenize text with synonym expansion for robust matching
   */
  private static normalizeTokens(text: string): Set<string> {
    const clean = text.toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .replace(/[-_]/g, ' ');
    const rawWords = clean.split(/\s+/).filter(w => w.length > 2);
    
    const tokens = new Set<string>();
    for (const w of rawWords) {
      tokens.add(w);
      for (const [canonical, syns] of Object.entries(TECH_SYNONYMS)) {
        if (syns.includes(w)) {
          tokens.add(canonical);
        }
      }
    }
    return tokens;
  }

  /**
   * Field score: percentage of target tokens covered by field
   */
  private static calculateFieldScore(fieldTokens: Set<string>, targetTokens: Set<string>): number {
    if (targetTokens.size === 0 || fieldTokens.size === 0) return 0;
    let matches = 0;
    for (const t of targetTokens) {
      if (fieldTokens.has(t)) {
        matches++;
      }
    }
    return Math.min(100, Math.round((matches / targetTokens.size) * 100));
  }

  /**
   * Deterministic page relevance scoring (0-100)
   */
  public static scorePage(params: {
    topic: string;
    targetKeyword: string;
    title: string;
    h1: string;
    description: string;
    urlPath: string;
  }): { score: number; reason: string; suggestedAnchor: string } {
    const targetTokens = this.normalizeTokens(`${params.topic} ${params.targetKeyword}`);
    
    const titleTokens = this.normalizeTokens(params.title);
    const h1Tokens = this.normalizeTokens(params.h1);
    const descTokens = this.normalizeTokens(params.description);
    const pathTokens = this.normalizeTokens(params.urlPath);

    const titleScore = this.calculateFieldScore(titleTokens, targetTokens);
    const h1Score = this.calculateFieldScore(h1Tokens, targetTokens);
    const descScore = this.calculateFieldScore(descTokens, targetTokens);
    const pathScore = this.calculateFieldScore(pathTokens, targetTokens);

    // Concept bonuses: SaaS + Development + Custom / Platform
    const hasSaas = titleTokens.has('saas') || descTokens.has('saas') || pathTokens.has('saas');
    const hasDev = titleTokens.has('development') || h1Tokens.has('development') || pathTokens.has('development');
    const hasCustomOrPlatform = titleTokens.has('custom') || titleTokens.has('platform') || descTokens.has('custom') || descTokens.has('platform');

    let conceptBonus = 0;
    if (hasSaas && hasDev) conceptBonus += 15;
    if (hasCustomOrPlatform) conceptBonus += 10;

    // Weights: Title 30%, H1 25%, Description 20%, URL path 15%, Topic overlap 10%
    const baseScore = (
      titleScore * 0.30 +
      h1Score * 0.25 +
      descScore * 0.20 +
      pathScore * 0.15 +
      Math.min(100, conceptBonus * 4) * 0.10
    );

    const finalScore = Math.min(100, Math.round(baseScore + conceptBonus));

    // Suggested Anchor & Reason
    let suggestedAnchor = params.targetKeyword || params.topic;
    let reason = 'Relevant service page.';

    if (hasSaas && hasDev) {
      reason = 'Direct match for SaaS, custom platforms, and web development.';
      suggestedAnchor = 'custom SaaS platform development';
    } else if (hasDev && hasCustomOrPlatform) {
      reason = 'Direct match for custom application and platform development.';
      suggestedAnchor = 'custom platform development';
    } else if (hasDev) {
      reason = 'Relevant to software and application development.';
      suggestedAnchor = 'custom web development';
    } else if (titleTokens.has('ai')) {
      reason = 'Relevant to AI systems and automated pipeline integration.';
      suggestedAnchor = 'AI integration services';
    }

    return {
      score: finalScore,
      reason,
      suggestedAnchor
    };
  }

  /**
   * Fetch page metadata for candidate URLs with bounded concurrency (max 10 pages).
   */
  public static async extractPageMetadata(urls: string[]): Promise<Array<{ url: string; title: string; h1: string; description: string }>> {
    const limitedUrls = urls.slice(0, 10);
    const results: Array<{ url: string; title: string; h1: string; description: string }> = [];

    // Process in batches of 5
    const batchSize = 5;
    for (let i = 0; i < limitedUrls.length; i += batchSize) {
      const batch = limitedUrls.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (u) => {
          try {
            const res = await this.fetchWithTimeout(u, 8000, 300000);
            if (res.status === 200 && res.text) {
              const dom = new JSDOM(res.text, { url: u });
              const doc = dom.window.document;
              const title = doc.querySelector('title')?.textContent?.trim() || '';
              const h1 = doc.querySelector('h1')?.textContent?.trim() || '';
              const description = doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '';
              return { url: u, title, h1, description };
            }
          } catch {
            // Ignore fetch failure for single candidate
          }
          return { url: u, title: '', h1: '', description: '' };
        })
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * High-level pipeline:
   * Discover URLs -> Rank Candidates -> Extract Metadata -> Score Relevance -> Return Candidates
   */
  public static async getInternalLinkRecommendations(params: {
    domain: string;
    topic: string;
    targetKeyword: string;
  }): Promise<InternalLinkDiscoveryResult> {
    const { domain, topic, targetKeyword } = params;
    const cacheKey = `${domain.toLowerCase().trim()}_${topic.toLowerCase().trim()}_${targetKeyword.toLowerCase().trim()}`;

    // Cache check
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      // 1. Discover URLs
      const discovery = await this.discoverUrls(domain);

      // 2. Pre-filter / rank discovered URLs by path tokens to pick the top 10 candidates for deep inspection
      const targetTokens = this.normalizeTokens(`${topic} ${targetKeyword}`);
      
      const rankedUrls = discovery.urls.map(item => {
        let pathScore = 0;
        try {
          const path = new URL(item.url).pathname.toLowerCase();
          const pathTokens = this.normalizeTokens(path);
          pathScore = this.calculateFieldScore(pathTokens, targetTokens);
        } catch {}
        return { ...item, pathScore };
      }).sort((a, b) => b.pathScore - a.pathScore);

      // Take top 10 URLs for metadata extraction
      const candidateUrls = rankedUrls.slice(0, 10).map(i => i.url);

      // 3. Extract Metadata
      const metadataList = await this.extractPageMetadata(candidateUrls);

      // 4. Score Relevance
      const scoredCandidates: InternalLinkCandidate[] = [];

      for (const meta of metadataList) {
        try {
          const path = new URL(meta.url).pathname;
          const { score, reason, suggestedAnchor } = this.scorePage({
            topic,
            targetKeyword,
            title: meta.title,
            h1: meta.h1,
            description: meta.description,
            urlPath: path
          });

          if (score >= 35) { // Sensible relevance threshold
            scoredCandidates.push({
              url: meta.url,
              title: meta.title || meta.url,
              h1: meta.h1,
              description: meta.description,
              score,
              reason,
              suggestedAnchor
            });
          }
        } catch {}
      }

      // Sort descending by score
      scoredCandidates.sort((a, b) => b.score - a.score);

      const result: InternalLinkDiscoveryResult = {
        domain: discovery.origin,
        totalDiscovered: discovery.urls.length,
        candidates: scoredCandidates,
        sitemapFound: discovery.sitemapFound
      };

      // Store in memory cache
      this.cache.set(cacheKey, { timestamp: Date.now(), data: result });

      return result;
    } catch (err: any) {
      return {
        domain,
        totalDiscovered: 0,
        candidates: [],
        sitemapFound: false,
        error: err.message || 'Failed to discover website internal links'
      };
    }
  }
}
