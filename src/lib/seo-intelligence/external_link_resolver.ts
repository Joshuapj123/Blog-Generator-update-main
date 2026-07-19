import { URL } from 'url';

export interface ExtractedLink {
  originalUrl: string;
  normalizedUrl: string;
  anchorText: string;
  sourceField: string; // e.g. "intro.hook", "sections[idx].what_it_is", "sections[idx].outbound_authority_link"
  sectionIndex?: number;
  domain: string;
  classification: string;
  isOfficialVendor: boolean;
  authorityScore: number;
  relevanceScore: number;
  entityImportance: number;
  recencyScore: number;
  finalScore: number;
}

export interface LinkBudget {
  maxOfficial: number;
  maxDocs: number;
  maxCommunity: number;
  maxResearch: number;
  maxTotal: number;
}

// ==========================================
// STAGE 1 & 5: URL Canonicalization & Ad Filtering
// ==========================================
export class URLNormalizer {
  private static TRACKING_PARAMS = [
    'gclid', 'fbclid', 'msclkid', 'gbraid', 'wbraid', 'ref', 'affiliate', 
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'clickid'
  ];

  private static AD_KEYWORDS = [
    'google.com/aclk', 'adurl', 'doubleclick', 'adservice', 'redirect', 'clickserve', 'adsystem', 'adtarget'
  ];

  static normalize(urlStr: string): string {
    if (!urlStr) return '';
    try {
      const parsed = new URL(urlStr.trim());
      // Strip tracking params
      for (const p of this.TRACKING_PARAMS) {
        parsed.searchParams.delete(p);
      }
      // Strip any param starting with utm_
      const keysToDelete = Array.from(parsed.searchParams.keys()).filter(key => key.startsWith('utm_'));
      for (const k of keysToDelete) {
        parsed.searchParams.delete(k);
      }
      
      parsed.hash = ''; // Remove fragment/hash
      
      let pathname = parsed.pathname;
      if (pathname.endsWith('/') && pathname.length > 1) {
        pathname = pathname.slice(0, -1);
      }
      
      let search = parsed.search;
      if (search === '?') search = '';
      
      return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${pathname}${search}`;
    } catch {
      return urlStr.trim();
    }
  }

  static isAdOrTracking(urlStr: string): boolean {
    const lower = urlStr.toLowerCase();
    if (this.AD_KEYWORDS.some(keyword => lower.includes(keyword))) {
      return true;
    }
    try {
      const parsed = new URL(urlStr);
      const host = parsed.hostname.toLowerCase();
      const path = parsed.pathname.toLowerCase();

      // Check for ad/affiliate indicators in domain or path
      if (host.includes('affiliate') || host.includes('tracking') || host.includes('adserver') || host.includes('adclick')) {
        return true;
      }
      if (path.includes('/affiliate') || path.includes('/tracking') || path.includes('/redirect')) {
        return true;
      }
      
      // Still double check parameters
      for (const p of this.TRACKING_PARAMS) {
        if (parsed.searchParams.has(p)) {
          return true;
        }
      }
    } catch {}
    return false;
  }
}

// ==========================================
// STAGE 9: Link Classification
// ==========================================
export class LinkClassifier {
  static classify(urlStr: string): string {
    try {
      const parsed = new URL(urlStr);
      const host = parsed.hostname.toLowerCase();
      const path = parsed.pathname.toLowerCase();

      if (host.includes('github.com')) {
        return 'GitHub';
      }
      if (host.includes('reddit.com') || host.includes('stackoverflow.com') || host.includes('quora.com') || host.includes('discord.com')) {
        return 'Community';
      }
      if (host.endsWith('.edu') || host.endsWith('.gov') || host.includes('arxiv.org') || path.includes('/arxiv') || path.includes('/pdf') || path.includes('/research') || path.includes('/paper')) {
        return 'Research';
      }
      if (path.includes('/pricing') || path.includes('/plans') || path.includes('/subscription') || path.includes('/pricing-plans')) {
        return 'Pricing';
      }
      if (path.includes('/docs') || path.includes('/documentation') || path.includes('/api') || path.includes('/reference') || path.includes('/developer') || path.includes('/dev')) {
        return 'Developer Docs';
      }
      if (path.includes('/support') || path.includes('/help') || path.includes('/faq') || path.includes('/contact')) {
        return 'Support';
      }
      if (path.includes('/blog') || path.includes('/tutorial') || path.includes('/how-to') || path.includes('/learn')) {
        return 'Tutorial';
      }
      if (path === '/' || path === '' || path === '/index.html' || path === '/index.php') {
        return 'Official Homepage';
      }

      return 'Other';
    } catch {
      return 'Other';
    }
  }
}

// ==========================================
// STAGE 3: Entity Validation
// ==========================================
export class EntityValidator {
  static validate(anchorText: string, urlStr: string, articleTopic: string): boolean {
    const anchorLower = anchorText.toLowerCase().trim();
    const urlLower = urlStr.toLowerCase();
    const topicLower = articleTopic.toLowerCase();

    // Rule 1: CMS -> cms.gov
    if (anchorLower === 'cms' || anchorLower.includes('content management system')) {
      if (urlLower.includes('cms.gov')) {
        if (!topicLower.includes('medicare') && !topicLower.includes('medicaid') && !topicLower.includes('healthcare')) {
          return false;
        }
      }
    }

    // Rule 2: API -> api.org
    if (anchorLower === 'api' || anchorLower === 'apis' || anchorLower === 'application programming interface') {
      if (urlLower.includes('api.org') || urlLower.includes('api.com')) {
        return false;
      }
    }

    // Rule 3: Database -> wikipedia.org (generic databases links should not go to generic Wiki articles unless relevant)
    if (anchorLower === 'database' || anchorLower === 'databases') {
      if (urlLower.includes('wikipedia.org') || urlLower.includes('database.org')) {
        return false;
      }
    }

    // Rule 4: Google Payments -> accounts page
    if (anchorLower.includes('google payment') || anchorLower.includes('payment method')) {
      if (urlLower.includes('myaccount.google.com') || urlLower.includes('accounts.google.com')) {
        return false;
      }
    }

    return true;
  }
}

// ==========================================
// STAGE 6: Authority Scoring
// ==========================================
export class AuthorityScorer {
  static getScore(urlStr: string, classification: string, isOfficialVendor: boolean): number {
    if (URLNormalizer.isAdOrTracking(urlStr)) {
      return 0;
    }

    try {
      const parsed = new URL(urlStr);
      const host = parsed.hostname.toLowerCase();

      if (host.includes('reddit.com')) {
        return 60;
      }
      if (host.includes('wikipedia.org')) {
        return 40;
      }
      if (classification === 'GitHub') {
        return 92;
      }
      if (classification === 'Research') {
        if (host.endsWith('.gov') || host.endsWith('.edu')) {
          return 80;
        }
        return 75;
      }

      if (isOfficialVendor) {
        if (classification === 'Official Homepage') {
          return 100;
        }
        if (classification === 'Developer Docs') {
          return 95;
        }
        if (classification === 'Pricing') {
          return 90;
        }
        if (classification === 'Tutorial' || host.includes('blog')) {
          return 80;
        }
      }

      if (host.endsWith('.gov') || host.endsWith('.edu')) {
        return 80;
      }

      if (classification === 'Official Homepage') {
        return 70;
      }

      if (classification === 'Developer Docs' || classification === 'Documentation') {
        return 85;
      }

      if (host.includes('blog') || classification === 'Tutorial') {
        return 50;
      }

      return 30;
    } catch {
      return 20;
    }
  }
}

// ==========================================
// STAGE 7: Topical Relevance Scoring
// ==========================================
export class TopicRelevanceRanker {
  static getRelevance(
    urlStr: string, 
    anchorText: string, 
    articleTopic: string, 
    targetKeywords: string[], 
    isOfficial: boolean
  ): number {
    const urlLower = urlStr.toLowerCase();
    const anchorLower = anchorText.toLowerCase();
    
    let score = 0.5;

    for (const kw of targetKeywords) {
      const cleanKw = kw.toLowerCase().trim();
      if (cleanKw.length < 3) continue;

      if (urlLower.includes(cleanKw) || anchorLower.includes(cleanKw)) {
        score += 0.25;
        break;
      }
    }

    if (isOfficial) {
      score += 0.4;
    }

    const genericAnchors = ['link', 'source', 'click here', 'website', 'here', 'url', 'page', 'site'];
    if (genericAnchors.includes(anchorLower)) {
      score -= 0.2;
    }

    return Math.max(0.0, Math.min(1.0, score));
  }
}

// ==========================================
// STAGE 2: Duplicate Filter
// ==========================================
export class DuplicateFilter {
  static filter(urls: Array<{ normalizedUrl: string, domain: string, classification: string }>): boolean[] {
    const domainCounters: Record<string, { homepage: number, pricing: number, docs: number }> = {};
    const seenUrls = new Set<string>();
    const keep: boolean[] = [];

    for (const urlObj of urls) {
      if (seenUrls.has(urlObj.normalizedUrl)) {
        keep.push(false);
        continue;
      }

      const domain = urlObj.domain;
      if (!domainCounters[domain]) {
        domainCounters[domain] = { homepage: 0, pricing: 0, docs: 0 };
      }

      const type = urlObj.classification;
      if (type === 'Official Homepage') {
        if (domainCounters[domain].homepage >= 1) {
          keep.push(false);
          continue;
        }
        domainCounters[domain].homepage++;
      } else if (type === 'Pricing') {
        if (domainCounters[domain].pricing >= 1) {
          keep.push(false);
          continue;
        }
        domainCounters[domain].pricing++;
      } else if (type === 'Developer Docs' || type === 'Documentation' || type === 'GitHub') {
        if (domainCounters[domain].docs >= 1) {
          keep.push(false);
          continue;
        }
        domainCounters[domain].docs++;
      }

      seenUrls.add(urlObj.normalizedUrl);
      keep.push(true);
    }

    return keep;
  }
}

// ==========================================
// STAGE 8: Link Budget Optimizer
// ==========================================
export class LinkBudgetOptimizer {
  static calculateBudget(wordCount: number): LinkBudget {
    const ratio = wordCount / 3500;
    
    const maxTotal = Math.max(5, Math.min(18, Math.round(ratio * 16)));
    const maxOfficial = Math.max(2, Math.min(8, Math.round(ratio * 7)));
    const maxDocs = Math.max(1, Math.min(5, Math.round(ratio * 4)));
    const maxCommunity = Math.max(0, Math.min(2, Math.round(ratio * 1.5)));
    const maxResearch = Math.max(0, Math.min(3, Math.round(ratio * 2.5)));

    return {
      maxOfficial,
      maxDocs,
      maxCommunity,
      maxResearch,
      maxTotal
    };
  }
}

// ==========================================
// MAIN RESOLVER SERVICE
// ==========================================
export class ExternalLinkResolver {
  static resolve(
    articleObj: any, 
    targetTopic: string, 
    keywords: string[] = [], 
    wordCount: number = 3000
  ): any {
    // 1. Gather all entity/vendor names mentioned in the article
    const vendors = this.gatherVendors(articleObj);

    // 2. Extract all raw external links
    const extracted = this.extractAllLinks(articleObj);

    // 3. Process each link through stages
    const processed: ExtractedLink[] = [];

    for (const link of extracted) {
      // Stage 1: URL Canonicalization
      const normalizedUrl = URLNormalizer.normalize(link.originalUrl);
      if (!normalizedUrl) continue;

      // Stage 5: Advertisement Filter (on normalized URL)
      if (URLNormalizer.isAdOrTracking(normalizedUrl)) {
        continue;
      }
      
      let domain = '';
      try {
        domain = new URL(normalizedUrl).hostname.toLowerCase();
      } catch {
        continue; // Unparseable
      }

      // Stage 3: Entity Validation
      if (!EntityValidator.validate(link.anchorText, normalizedUrl, targetTopic)) {
        continue;
      }

      // Stage 4: Official Source Resolution
      const isOfficialVendor = this.isVendorMatch(domain, vendors);
      
      // Stage 9: Classification
      const classification = LinkClassifier.classify(normalizedUrl);

      // Stage 6: Authority Scoring
      const authorityScore = AuthorityScorer.getScore(normalizedUrl, classification, isOfficialVendor);
      if (authorityScore === 0) continue;

      // Stage 7: Topical Relevance Scoring
      const relevanceScore = TopicRelevanceRanker.getRelevance(normalizedUrl, link.anchorText, targetTopic, keywords, isOfficialVendor);
      if (relevanceScore < 0.4) continue; // Reject low relevance

      // Entity Importance
      let entityImportance = 1.0;
      const cleanAnchor = link.anchorText.toLowerCase();
      if (vendors.some(v => cleanAnchor.includes(v.toLowerCase()) || v.toLowerCase().includes(cleanAnchor))) {
        entityImportance = 1.3;
      }

      // Recency Score (boost if URL path indicates recent year like 2025/2026)
      let recencyScore = 1.0;
      if (normalizedUrl.includes('2025') || normalizedUrl.includes('2026')) {
        recencyScore = 1.05;
      }

      // Stage 10: Final Ranking Combined Score
      const finalScore = authorityScore * relevanceScore * entityImportance * recencyScore;

      processed.push({
        ...link,
        normalizedUrl,
        domain,
        classification,
        isOfficialVendor,
        authorityScore,
        relevanceScore,
        entityImportance,
        recencyScore,
        finalScore
      });
    }

    // Sort descending by finalScore
    processed.sort((a, b) => b.finalScore - a.finalScore);

    // Stage 2: Duplicate Filter (applying duplicate elimination on ranked order)
    const duplicateKeepFlags = DuplicateFilter.filter(processed);
    const uniqueProcessed = processed.filter((_, idx) => duplicateKeepFlags[idx]);

    // Stage 8: Link Budget Optimizer
    const budget = LinkBudgetOptimizer.calculateBudget(wordCount);
    
    let officialCount = 0;
    let docsCount = 0;
    let communityCount = 0;
    let researchCount = 0;
    let totalCount = 0;

    const retainedLinks = new Set<string>();

    for (const link of uniqueProcessed) {
      if (totalCount >= budget.maxTotal) break;

      const type = link.classification;
      if (type === 'Official Homepage') {
        if (officialCount >= budget.maxOfficial) continue;
        officialCount++;
      } else if (type === 'Developer Docs' || type === 'Documentation' || type === 'GitHub') {
        if (docsCount >= budget.maxDocs) continue;
        docsCount++;
      } else if (type === 'Community') {
        if (communityCount >= budget.maxCommunity) continue;
        communityCount++;
      } else if (type === 'Research') {
        if (researchCount >= budget.maxResearch) continue;
        researchCount++;
      }

      retainedLinks.add(link.normalizedUrl);
      totalCount++;
    }

    // 4. Update the article object by applying retained/canonical links and stripping the rest
    const updatedArticle = this.applyLinkModifications(articleObj, retainedLinks, processed);

    return updatedArticle;
  }

  // Helper to extract all links (from both text fields and sections authority links)
  private static extractAllLinks(articleObj: any): Array<{ originalUrl: string; anchorText: string; sourceField: string; sectionIndex?: number }> {
    const list: Array<{ originalUrl: string; anchorText: string; sourceField: string; sectionIndex?: number }> = [];

    // Helper for markdown extraction
    const extractFromText = (text: string, sourceField: string, sectionIndex?: number) => {
      if (!text) return;
      const regex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        list.push({
          anchorText: match[1],
          originalUrl: match[2],
          sourceField,
          sectionIndex
        });
      }
    };

    // Extract from intro
    if (articleObj.intro) {
      extractFromText(articleObj.intro.hook, 'intro.hook');
      extractFromText(articleObj.intro.thesis, 'intro.thesis');
      extractFromText(articleObj.intro.business_context, 'intro.business_context');
    }

    // Extract from sections
    if (Array.isArray(articleObj.sections)) {
      articleObj.sections.forEach((sec: any, idx: number) => {
        extractFromText(sec.what_it_is, `sections[${idx}].what_it_is`, idx);
        extractFromText(sec.why_it_works, `sections[${idx}].why_it_works`, idx);
        extractFromText(sec.experience_or_data_point, `sections[${idx}].experience_or_data_point`, idx);
        extractFromText(sec.takeaway, `sections[${idx}].takeaway`, idx);
        extractFromText(sec.markdown_table, `sections[${idx}].markdown_table`, idx);

        if (sec.outbound_authority_link?.resolved_url) {
          list.push({
            anchorText: sec.outbound_authority_link.anchor_text || sec.outbound_authority_link.resolved_title || 'Source',
            originalUrl: sec.outbound_authority_link.resolved_url,
            sourceField: `sections[${idx}].outbound_authority_link`,
            sectionIndex: idx
          });
        }
      });
    }

    // Extract from cta
    if (articleObj.cta) {
      extractFromText(articleObj.cta.description, 'cta.description');
    }

    return list;
  }

  // Gather vendor/brand names mentioned in the article
  private static gatherVendors(articleObj: any): string[] {
    const vendors = new Set<string>();
    
    // Add from section target entities or example brands
    if (Array.isArray(articleObj.sections)) {
      articleObj.sections.forEach((sec: any) => {
        if (Array.isArray(sec.example_brands)) {
          sec.example_brands.forEach((brandStr: string) => {
            const parts = brandStr.split(':');
            if (parts[0]) vendors.add(parts[0].trim());
          });
        }
        if (sec.heading) {
          // If heading reviews a tool, e.g. "Salesforce CRM: Features", add Salesforce
          const reviewMatch = sec.heading.split(':');
          if (reviewMatch[0]) {
            vendors.add(reviewMatch[0].replace(/(Review|Comparison|Guide|Best|Features|Platform|Software)/gi, '').trim());
          }
        }
      });
    }

    return Array.from(vendors).filter(v => v.length > 2);
  }

  private static isVendorMatch(domain: string, vendors: string[]): boolean {
    const cleanDomain = domain.replace(/^www\./, '');
    const primaryPart = cleanDomain.split('.')[0];

    for (const vendor of vendors) {
      const cleanVendor = vendor.toLowerCase().replace(/[^a-z0-9]+/g, '');
      if (cleanVendor.length < 2) continue;

      if (primaryPart === cleanVendor || cleanDomain.includes(cleanVendor)) {
        return true;
      }
    }
    return false;
  }

  // Apply link modifications: replace rejected links with anchor text, normalize accepted links
  private static applyLinkModifications(articleObj: any, retainedSet: Set<string>, processedLinks: ExtractedLink[]): any {
    const updated = JSON.parse(JSON.stringify(articleObj));

    // Map from original URL to its replacement string/markdown
    const urlMap = new Map<string, { replacement: string, normalized: string }>();

    for (const link of processedLinks) {
      const isRetained = retainedSet.has(link.normalizedUrl);
      if (isRetained) {
        urlMap.set(link.originalUrl, {
          replacement: `[${link.anchorText}](${link.normalizedUrl})`,
          normalized: link.normalizedUrl
        });
      } else {
        urlMap.set(link.originalUrl, {
          replacement: link.anchorText,
          normalized: ''
        });
      }
    }

    const rewriteText = (text: string): string => {
      if (!text) return text;
      let newText = text;
      // Extract matches and replace them
      const regex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g;
      let match;
      const matches: Array<{ full: string, anchor: string, url: string }> = [];
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          full: match[0],
          anchor: match[1],
          url: match[2]
        });
      }

      for (const m of matches) {
        const mapping = urlMap.get(m.url);
        if (mapping) {
          newText = newText.replace(m.full, mapping.replacement);
        } else {
          // If URL was skipped due to earlier stage filtering (like direct ad/tracking check)
          newText = newText.replace(m.full, m.anchor);
        }
      }
      return newText;
    };

    // Update intro
    if (updated.intro) {
      updated.intro.hook = rewriteText(updated.intro.hook);
      updated.intro.thesis = rewriteText(updated.intro.thesis);
      updated.intro.business_context = rewriteText(updated.intro.business_context);
    }

    // Update sections
    if (Array.isArray(updated.sections)) {
      updated.sections.forEach((sec: any, idx: number) => {
        sec.what_it_is = rewriteText(sec.what_it_is);
        sec.why_it_works = rewriteText(sec.why_it_works);
        sec.experience_or_data_point = rewriteText(sec.experience_or_data_point);
        sec.takeaway = rewriteText(sec.takeaway);
        sec.markdown_table = rewriteText(sec.markdown_table);

        if (sec.outbound_authority_link?.resolved_url) {
          const origUrl = sec.outbound_authority_link.resolved_url;
          const mapping = urlMap.get(origUrl);
          if (mapping && mapping.normalized) {
            sec.outbound_authority_link.resolved_url = mapping.normalized;
          } else {
            // Deleted / stripped
            sec.outbound_authority_link = undefined;
          }
        }
      });
    }

    // Update cta
    if (updated.cta) {
      updated.cta.description = rewriteText(updated.cta.description);
    }

    return updated;
  }
}
