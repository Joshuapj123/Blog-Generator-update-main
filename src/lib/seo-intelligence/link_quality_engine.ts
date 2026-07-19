import { URL } from 'url';

export interface RawLinkInput {
  title: string; // The raw entity name/anchor
  url: string;   // The raw URL
  folder?: string;
}

export interface FilteredLinkOutput {
  entity: string;         // Canonicalized entity name
  canonicalURL: string;   // Normalized canonical URL
  category: string;       // Classified domain category
  authorityScore: number; // Score (0-100)
  relevanceScore: number; // Score (0-100)
  selectionReason: string;
}

// ==========================================
// STAGE 1: URL Canonicalization
// ==========================================
export class URLNormalizer {
  static canonicalize(urlStr: string): string {
    if (!urlStr) return '';
    let targetUrl = urlStr.trim();

    // Resolve Google Redirects
    if (targetUrl.includes('google.com/url?') || targetUrl.includes('google.com/aclk?')) {
      try {
        const parsedRedirect = new URL(targetUrl);
        const realUrl = parsedRedirect.searchParams.get('q') || parsedRedirect.searchParams.get('adurl');
        if (realUrl) {
          targetUrl = realUrl;
        }
      } catch {}
    }

    try {
      const parsed = new URL(targetUrl);
      
      const protocol = parsed.protocol.toLowerCase();
      let host = parsed.hostname.toLowerCase();
      if (host.startsWith('www.')) {
        host = host.slice(4);
      }

      // Remove UTM and other tracking parameters
      const trackingParams = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
        'gclid', 'fbclid', 'msclkid', 'gbraid', 'wbraid', 'ref', 'affiliate', 
        'clickid', 'aff', 'tracking', 'camp'
      ];
      
      for (const p of trackingParams) {
        parsed.searchParams.delete(p);
      }
      
      // Strip any other utm_* params
      const allKeys = Array.from(parsed.searchParams.keys());
      for (const k of allKeys) {
        if (k.startsWith('utm_')) {
          parsed.searchParams.delete(k);
        }
      }

      // Remove fragment/hash
      parsed.hash = '';

      // Standardize path
      let pathname = parsed.pathname.toLowerCase();
      if (pathname.endsWith('/') && pathname.length > 1) {
        pathname = pathname.slice(0, -1);
      }

      let search = parsed.search;
      if (search === '?') search = '';

      return `${protocol}//${host}${pathname}${search}`;
    } catch {
      return targetUrl;
    }
  }

  static hasTrackingParams(urlStr: string): boolean {
    try {
      const parsed = new URL(urlStr);
      const trackingParams = [
        'gclid', 'fbclid', 'msclkid', 'gbraid', 'wbraid', 'ref', 'aff_id', 'affiliate'
      ];
      for (const key of Array.from(parsed.searchParams.keys())) {
        const lowerKey = key.toLowerCase();
        if (lowerKey.startsWith('utm_') || trackingParams.some(p => lowerKey.includes(p))) {
          return true;
        }
      }
    } catch {}
    return false;
  }
}

// ==========================================
// STAGE 4: Hard Blacklist Filter
// ==========================================
export class BlacklistFilter {
  private static BLACKLISTED_DOMAINS = [
    'doubleclick.net', 'adservice.google.com', 'appsumo.com', 'apps.apple.com', 
    'itunes.apple.com', 'podcasts.apple.com', 'play.google.com/store/apps',
    'myaccount.google.com', 'accounts.google.com', 'spotify.com'
  ];

  private static BLACKLISTED_KEYWORDS = [
    'google.com/aclk', 'adurl', 'clickserve', 'adsystem', 'tracking', '/login', 
    '/signin', '/auth', '/checkout', '/billing', '/pay', 'affiliate', 'podcast', 
    '/search?q=', '/results?', '/register', '/signup'
  ];

  static isBlacklisted(urlStr: string): boolean {
    const lower = urlStr.toLowerCase();
    
    try {
      const parsed = new URL(urlStr);
      const host = parsed.hostname.toLowerCase();
      if (this.BLACKLISTED_DOMAINS.some(d => host === d || host.endsWith('.' + d))) {
        return true;
      }
    } catch {}

    if (this.BLACKLISTED_KEYWORDS.some(kw => lower.includes(kw))) {
      return true;
    }

    return false;
  }
}

// ==========================================
// STAGE 5: Entity Canonicalization
// ==========================================
export class EntityCanonicalizer {
  static canonicalize(entityName: string, urlStr: string): { canonicalEntity: string; isValid: boolean } {
    const cleanEntity = entityName.trim();
    const upperEntity = cleanEntity.toUpperCase();
    const urlLower = urlStr.toLowerCase();

    // CMS -> Content Management System (NOT cms.gov)
    if (upperEntity === 'CMS' || cleanEntity.toLowerCase().includes('content management system')) {
      if (urlLower.includes('cms.gov')) {
        return { canonicalEntity: 'Content Management System', isValid: false };
      }
      return { canonicalEntity: 'Content Management System', isValid: true };
    }

    // CRM -> Concept unless Salesforce/HubSpot intended
    if (upperEntity === 'CRM' || cleanEntity.toLowerCase().includes('customer relationship management')) {
      if (urlLower.includes('hubspot.com') || urlLower.includes('salesforce.com')) {
        return { canonicalEntity: cleanEntity, isValid: true };
      }
      return { canonicalEntity: 'Customer Relationship Management', isValid: false }; // Treat as concept, reject generic links
    }

    // API -> API concept, not api.org
    if (upperEntity === 'API' || upperEntity === 'APIS' || cleanEntity.toLowerCase().includes('application programming interface')) {
      if (urlLower.includes('api.org') || urlLower.includes('api.com')) {
        return { canonicalEntity: 'Application Programming Interface', isValid: false };
      }
      return { canonicalEntity: 'Application Programming Interface', isValid: false }; // Mapped to api.org, reject
    }

    return { canonicalEntity: cleanEntity, isValid: true };
  }
}

// ==========================================
// STAGE 2: Domain Classification
// ==========================================
export class DomainClassifier {
  static classify(urlStr: string, isOfficialVendor: boolean): string {
    try {
      const parsed = new URL(urlStr);
      const host = parsed.hostname.toLowerCase();
      const path = parsed.pathname.toLowerCase();

      if (host.endsWith('.gov')) {
        return 'Government';
      }

      if (host.endsWith('.edu') || host.includes('arxiv.org') || path.includes('/arxiv') || path.includes('/pdf')) {
        return 'Research';
      }

      if (host.includes('reddit.com') || host.includes('stackoverflow.com') || host.includes('quora.com') || host.includes('github.com')) {
        return 'Community';
      }

      if (host.includes('techcrunch.com') || host.includes('forbes.com') || host.includes('bloomberg.com') || host.includes('wired.com') || host.includes('nytimes.com')) {
        return 'News';
      }

      if (host.includes('g2.com') || host.includes('capterra.com') || host.includes('pcmag.com') || host.includes('trustpilot.com')) {
        return 'Independent Review';
      }

      if (isOfficialVendor) {
        if (path.includes('/docs') || path.includes('/documentation') || path.includes('/api') || path.includes('/reference') || path.includes('/dev')) {
          return 'Official Documentation';
        }
        if (path.includes('/blog') || path.includes('/news') || path.includes('/resources')) {
          return 'Vendor Blog';
        }
        return 'Official Website';
      }

      if (path.includes('/docs') || path.includes('/documentation') || path.includes('/api') || path.includes('/reference')) {
        return 'Technical Documentation';
      }

      if (path.includes('/blog') || path.includes('/resources') || host.includes('blog')) {
        return 'Vendor Blog';
      }

      return 'Unknown';
    } catch {
      return 'Unknown';
    }
  }
}

// ==========================================
// STAGE 3 & 7: Scoring
// ==========================================
export class LinkScorer {
  static getRelevance(urlStr: string, entity: string, articleTopic: string, keywords: string[]): number {
    const urlLower = urlStr.toLowerCase();
    const entityLower = entity.toLowerCase();
    const topicLower = articleTopic.toLowerCase();

    let score = 50; // Base relevance

    // Check if the entity is an exact match for the topic or primary keywords
    if (topicLower.includes(entityLower) || entityLower.includes(topicLower)) {
      score += 30;
    }

    // Check keyword matches in URL path or hostname
    for (const kw of keywords) {
      const cleanKw = kw.toLowerCase().trim();
      if (cleanKw.length >= 3 && (urlLower.includes(cleanKw) || entityLower.includes(cleanKw))) {
        score += 15;
        break;
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  static getAuthority(urlStr: string, category: string, isOfficial: boolean, relevanceScore: number): number {
    if (BlacklistFilter.isBlacklisted(urlStr)) {
      return 0;
    }

    const urlLower = urlStr.toLowerCase();

    // Ads/Redirects/Tracking (0)
    if (
      urlLower.includes('aclk') ||
      urlLower.includes('gclid') ||
      urlLower.includes('fbclid') ||
      urlLower.includes('adurl') ||
      urlLower.includes('utm_') ||
      urlLower.includes('clickid') ||
      urlLower.includes('affiliate') ||
      urlLower.includes('redirect') ||
      urlLower.includes('tracking')
    ) {
      return 0;
    }

    // Official docs (100)
    if (category === 'Official Documentation' || (isOfficial && urlLower.includes('/docs')) || urlLower.includes('/documentation') || urlLower.includes('/developer')) {
      return 100;
    }

    // Government (95)
    if (category === 'Government' || urlLower.includes('.gov')) {
      return 95;
    }

    // Research paper (92)
    if (category === 'Research' || urlLower.includes('.edu') || urlLower.includes('arxiv.org') || urlLower.includes('researchgate.net')) {
      return 92;
    }

    // GitHub (90)
    if (urlLower.includes('github.com')) {
      return 90;
    }

    // Vendor docs (88) (Official vendor website but maybe not docs-specific path)
    if (isOfficial) {
      return 88;
    }

    // Wikipedia (80)
    if (urlLower.includes('wikipedia.org')) {
      return 80;
    }

    // YouTube (70)
    if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
      return 70;
    }

    // Reddit (60)
    if (urlLower.includes('reddit.com')) {
      return 60;
    }

    return 75; // Default score for other valid domains
  }
}

// ==========================================
// LINK QUALITY ENGINE (LQE) SERVICE
// ==========================================
export class LinkQualityEngine {
  static process(
    inputs: RawLinkInput[], 
    articleTopic: string, 
    keywordsStr: string
  ): FilteredLinkOutput[] {
    const keywords = keywordsStr.split(',').map(k => k.trim()).filter(Boolean);
    const vendors = this.identifyVendors(inputs, articleTopic);

    const candidates: Array<{
      original: RawLinkInput;
      entity: string;
      canonicalURL: string;
      category: string;
      authorityScore: number;
      relevanceScore: number;
      finalScore: number;
      isOfficial: boolean;
      selectionReason: string;
    }> = [];

    for (const input of inputs) {
      if (!input.url) continue;

      // Stage 1: URL Canonicalization
      const canonicalURL = URLNormalizer.canonicalize(input.url);
      if (!canonicalURL) continue;

      // Stage 4: Hard Blacklist
      if (BlacklistFilter.isBlacklisted(canonicalURL)) {
        continue;
      }

      // Stage 5: Entity Canonicalization
      const { canonicalEntity, isValid } = EntityCanonicalizer.canonicalize(input.title, canonicalURL);
      if (!isValid) {
        continue; // Skip invalid entity mappings (CMS -> cms.gov, CRM/API generic links)
      }

      // Determine if official vendor
      let isOfficial = false;
      try {
        const parsed = new URL(canonicalURL);
        const host = parsed.hostname.toLowerCase();
        isOfficial = vendors.some(v => host.includes(v.toLowerCase()) || v.toLowerCase().includes(host.split('.')[0]));
      } catch {}

      // Stage 2: Domain Classification
      const category = DomainClassifier.classify(canonicalURL, isOfficial);

      // Stage 7: Topical Relevance Scoring
      const relevanceScore = LinkScorer.getRelevance(canonicalURL, canonicalEntity, articleTopic, keywords);

      // Stage 3: Authority Scoring
      const authorityScore = LinkScorer.getAuthority(canonicalURL, category, isOfficial, relevanceScore);

      // Stage 10: Final Ranking Combined Score
      const entityImportance = isOfficial ? 1.3 : 1.0;
      const finalScore = authorityScore * (relevanceScore / 100) * entityImportance;

      // Selection Reason
      let selectionReason = `Highly authoritative outbound link for entity: ${canonicalEntity}`;
      if (isOfficial) {
        selectionReason = `Official vendor resource for discussed brand: ${canonicalEntity}`;
      } else if (category === 'Research' || category === 'Government') {
        selectionReason = `Trusted public sector or research resource verifying facts for: ${canonicalEntity}`;
      } else if (category === 'Technical Documentation') {
        selectionReason = `Technical specification and implementation details for: ${canonicalEntity}`;
      }

      candidates.push({
        original: input,
        entity: canonicalEntity,
        canonicalURL,
        category,
        authorityScore,
        relevanceScore,
        finalScore,
        isOfficial,
        selectionReason
      });
    }

    // Sort descending by finalScore to prioritize highest quality
    candidates.sort((a, b) => b.finalScore - a.finalScore);

    // Stage 6 & 7 & 8: Duplicate Removal & Per-Domain Limits & Community limits
    const finalSet: FilteredLinkOutput[] = [];
    const seenEntities = new Set<string>();
    const seenUrls = new Set<string>();
    const seenBaseDomains = new Set<string>();
    const seenProducts = new Set<string>();

    const productKeywords = ['wix', 'squarespace', 'shopify', 'hubspot', 'salesforce', 'zoho', 'wordpress', 'weebly', 'webflow', 'docusign', 'openai', 'microsoft', 'google', 'adobe'];
    
    // Per-domain type counters
    const domainTypeCounts: Record<string, {
      official: number;
      blog: number;
      community: number;
      review: number;
      docs: number;
    }> = {};

    let redditCount = 0;

    for (const c of candidates) {
      if (finalSet.length >= 15) break; // Output Quality: max 15 links

      // Rule 6: Only one canonical URL per entity
      if (seenEntities.has(c.entity.toLowerCase())) {
        continue;
      }

      // Rule 6: Only one canonical URL in total
      if (seenUrls.has(c.canonicalURL)) {
        continue;
      }

      // Identify if candidate belongs to a product
      let associatedProduct = '';
      const cleanEntity = c.entity.toLowerCase();
      const cleanURL = c.canonicalURL.toLowerCase();
      for (const prod of productKeywords) {
        if (cleanEntity.includes(prod) || cleanURL.includes(prod)) {
          associatedProduct = prod;
          break;
        }
      }

      if (associatedProduct && seenProducts.has(associatedProduct)) {
        continue; // Strict Deduplication: Limit references to exactly one URL per domain/product
      }

      // Extract base domain/product
      let baseDomain = '';
      try {
        const parsed = new URL(c.canonicalURL);
        const host = parsed.hostname.toLowerCase();
        const parts = host.split('.');
        if (parts.length >= 2) {
          baseDomain = parts.slice(-2).join('.');
        } else {
          baseDomain = host;
        }
      } catch {
        continue;
      }

      // Strict Deduplication: Limit references to exactly one URL per domain/product
      if (seenBaseDomains.has(baseDomain)) {
        continue;
      }

      // Rule 8: Maximum one Reddit URL
      if (c.canonicalURL.includes('reddit.com')) {
        if (redditCount >= 1) {
          continue;
        }
        redditCount++;
      }

      // Rule 7: Per-domain limits (already partly handled by seenBaseDomains, but keeping category checks for safety)
      const domain = baseDomain;
      if (!domainTypeCounts[domain]) {
        domainTypeCounts[domain] = { official: 0, blog: 0, community: 0, review: 0, docs: 0 };
      }

      const counts = domainTypeCounts[domain];
      const cat = c.category;

      if (cat === 'Official Website') {
        if (counts.official >= 1) continue;
        counts.official++;
      } else if (cat === 'Vendor Blog') {
        if (counts.blog >= 1) continue;
        counts.blog++;
      } else if (cat === 'Community') {
        if (counts.community >= 1) continue;
        counts.community++;
      } else if (cat === 'Independent Review') {
        if (counts.review >= 2) continue;
        counts.review++;
      } else if (cat === 'Official Documentation' || cat === 'Technical Documentation') {
        if (counts.docs >= 2) continue;
        counts.docs++;
      }

      // Accept
      seenEntities.add(c.entity.toLowerCase());
      seenUrls.add(c.canonicalURL);
      seenBaseDomains.add(baseDomain);
      if (associatedProduct) {
        seenProducts.add(associatedProduct);
      }
      
      finalSet.push({
        entity: c.entity,
        canonicalURL: c.canonicalURL,
        category: c.category,
        authorityScore: c.authorityScore,
        relevanceScore: c.relevanceScore,
        selectionReason: c.selectionReason
      });
    }

    // Stage 10: Validation & Enforcement
    this.validate(finalSet);

    return finalSet;
  }

  private static identifyVendors(inputs: RawLinkInput[], articleTopic: string): string[] {
    const list = new Set<string>();
    
    // Check if topic mentions a brand (e.g. Wix, Framer)
    const topicWords = articleTopic.split(' ');
    topicWords.forEach(w => {
      const clean = w.replace(/[^a-zA-Z0-9]/g, '');
      if (clean.length > 3 && clean[0] === clean[0].toUpperCase()) {
        list.add(clean);
      }
    });

    for (const input of inputs) {
      if (input.title && input.title.length > 2 && input.title[0] === input.title[0].toUpperCase()) {
        list.add(input.title.trim());
      }
    }

    return Array.from(list);
  }

  // Stage 10: Validation
  private static validate(links: FilteredLinkOutput[]): void {
    if (links.length === 0) return; // Skip if no links processed

    const urls = links.map(l => l.canonicalURL);
    const entities = links.map(l => l.entity.toLowerCase());

    // 1. Duplicate canonical URLs exist
    const uniqueUrls = new Set(urls);
    if (uniqueUrls.size !== urls.length) {
      throw new Error(`Duplicate canonical URLs detected in output set.`);
    }

    // 2. Blacklisted domains remain
    for (const u of urls) {
      if (BlacklistFilter.isBlacklisted(u)) {
        throw new Error(`Blacklisted domain or keyword remains in output: ${u}`);
      }
    }

    // 3. Tracking parameters remain
    for (const u of urls) {
      if (URLNormalizer.hasTrackingParams(u)) {
        throw new Error(`Tracking parameter remains in output URL: ${u}`);
      }
    }

    // 4. More than one URL exists for the same entity
    const uniqueEntities = new Set(entities);
    if (uniqueEntities.size !== entities.length) {
      throw new Error(`More than one URL exists for the same entity.`);
    }

    // 5. More than one Reddit URL exists
    const redditCount = urls.filter(u => u.includes('reddit.com')).length;
    if (redditCount > 1) {
      throw new Error(`More than one Reddit URL detected.`);
    }

    // 6. Average authority score < 80
    const totalAuth = links.reduce((sum, l) => sum + l.authorityScore, 0);
    const avgAuth = totalAuth / links.length;
    if (avgAuth < 80) {
      throw new Error(`Average authority score of the filtered link set is below 80 (${avgAuth.toFixed(1)}).`);
    }
  }

  // ==========================================
  // POST-PROCESSING HELPER FOR GENERATED ARTICLES
  // ==========================================
  static extractLinks(article: any): RawLinkInput[] {
    const rawLinks: RawLinkInput[] = [];

    const fromString = (text: string | undefined) => {
      if (!text) return;
      const matches = text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g);
      for (const m of matches) {
        rawLinks.push({
          title: m[1],
          url: m[2]
        });
      }
    };

    const fromOutbound = (link: any) => {
      if (link && link.resolved_url) {
        rawLinks.push({
          title: link.anchor_text || link.resolved_title || 'Reference',
          url: link.resolved_url
        });
      }
    };

    if (article.intro) {
      fromString(article.intro.hook);
      fromString(article.intro.thesis);
      fromString(article.intro.overview);
      fromOutbound(article.intro.outbound_authority_link);
    }

    if (Array.isArray(article.sections)) {
      for (const sec of article.sections) {
        fromString(sec.what_it_is);
        fromString(sec.why_it_works);
        fromString(sec.experience_or_data_point);
        fromString(sec.takeaway);
        if (sec.markdown_table) {
          fromString(sec.markdown_table);
        }
        fromOutbound(sec.outbound_authority_link);
      }
    }

    if (article.conclusion) {
      fromString(article.conclusion.summary);
      fromString(article.conclusion.final_thought);
      fromOutbound(article.conclusion.outbound_authority_link);
    }

    if (Array.isArray(article.faq)) {
      for (const item of article.faq) {
        fromString(item.question);
        fromString(item.answer);
      }
    }

    return rawLinks;
  }

  static rewriteArticle(article: any, allowedLinks: FilteredLinkOutput[]): any {
    const allowedMap = new Map<string, string>();
    for (const l of allowedLinks) {
      const norm = URLNormalizer.canonicalize(l.canonicalURL);
      allowedMap.set(norm, l.canonicalURL);
    }

    const rewriteString = (text: string | undefined): string => {
      if (!text) return '';
      return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, anchor, url) => {
        const normUrl = URLNormalizer.canonicalize(url);
        const allowedCanonical = allowedMap.get(normUrl);
        if (allowedCanonical) {
          return `[${anchor}](${allowedCanonical})`;
        } else {
          return anchor; // Strip to plain text
        }
      });
    };

    const rewriteOutbound = (link: any) => {
      if (!link) return undefined;
      if (link.resolved_url) {
        const normUrl = URLNormalizer.canonicalize(link.resolved_url);
        const allowedCanonical = allowedMap.get(normUrl);
        if (allowedCanonical) {
          link.resolved_url = allowedCanonical;
          return link;
        } else {
          return undefined; // Clear the link
        }
      }
      return link;
    };

    const newArticle = JSON.parse(JSON.stringify(article));

    if (newArticle.intro) {
      newArticle.intro.hook = rewriteString(newArticle.intro.hook);
      newArticle.intro.thesis = rewriteString(newArticle.intro.thesis);
      newArticle.intro.overview = rewriteString(newArticle.intro.overview);
      newArticle.intro.outbound_authority_link = rewriteOutbound(newArticle.intro.outbound_authority_link);
    }

    if (Array.isArray(newArticle.sections)) {
      for (const sec of newArticle.sections) {
        sec.what_it_is = rewriteString(sec.what_it_is);
        sec.why_it_works = rewriteString(sec.why_it_works);
        sec.experience_or_data_point = rewriteString(sec.experience_or_data_point);
        sec.takeaway = rewriteString(sec.takeaway);
        if (sec.markdown_table) {
          sec.markdown_table = rewriteString(sec.markdown_table);
        }
        sec.outbound_authority_link = rewriteOutbound(sec.outbound_authority_link);
      }
    }

    if (newArticle.conclusion) {
      newArticle.conclusion.summary = rewriteString(newArticle.conclusion.summary);
      newArticle.conclusion.final_thought = rewriteString(newArticle.conclusion.final_thought);
      newArticle.conclusion.outbound_authority_link = rewriteOutbound(newArticle.conclusion.outbound_authority_link);
    }

    if (Array.isArray(newArticle.faq)) {
      for (const item of newArticle.faq) {
        item.question = rewriteString(item.question);
        item.answer = rewriteString(item.answer);
      }
    }

    return newArticle;
  }

  static postProcess(article: any, articleTopic: string, keywordsStr: string): any {
    const rawLinks = this.extractLinks(article);
    if (rawLinks.length === 0) return article;

    console.log(`[LQE PostProcess] Extracted ${rawLinks.length} raw links from generated article.`);
    const filtered = this.process(rawLinks, articleTopic, keywordsStr);
    console.log(`[LQE PostProcess] Filtered down to ${filtered.length} allowed canonical links.`);

    // Fail validation if final set violates rules (validate runs inside process, but we call it here to be explicit)
    this.validate(filtered);

    // Rewrite the article content to use the canonical allowed URLs and strip the disallowed ones back to plain text
    const rewritten = this.rewriteArticle(article, filtered);

    // Append Reference Presentation block to the conclusion section exactly as requested:
    let conclusionSec = rewritten.sections?.find((s: any) => {
      const h = (s.heading || '').toLowerCase();
      return h.includes('conclusion') || h.includes('final thought');
    });
    if (!conclusionSec && rewritten.sections?.length > 0) {
      conclusionSec = rewritten.sections[rewritten.sections.length - 1];
    }

    if (conclusionSec) {
      const officialCats = ['Official Website', 'Official Documentation', 'Technical Documentation', 'Government', 'Research', 'Vendor Blog'];
      const officialLinks = filtered.filter(l => officialCats.includes(l.category) || l.category.includes('Official') || l.category.includes('Technical'));
      const communityLinks = filtered.filter(l => !officialLinks.includes(l));

      let refBlock = '\n\n';
      if (officialLinks.length > 0) {
        refBlock += `Official Sources\n-------------\n`;
        officialLinks.forEach(l => {
          refBlock += `[${l.entity}](${l.canonicalURL})\n`;
        });
        refBlock += '\n';
      }
      if (communityLinks.length > 0) {
        refBlock += `Community\n-------------\n`;
        communityLinks.forEach(l => {
          refBlock += `[${l.entity}](${l.canonicalURL})\n`;
        });
      }
      
      conclusionSec.experience_or_data_point = (conclusionSec.experience_or_data_point || '').trim() + refBlock;
    }

    return rewritten;
  }
}
