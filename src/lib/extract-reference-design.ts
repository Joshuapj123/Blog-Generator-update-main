import { chromium } from 'playwright';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { extractLsiKeywords } from '@/lib/serp-nlp-processing';

export interface ExtractedDesign {
  metadata: {
    title: string;
    description: string;
    byline: string;
    excerpt: string;
    length: number;
    siteName: string;
    url: string;
    publishedTime?: string;
  };
  seo: {
    titleTag?: string;
    canonicalUrl?: string;
    schemaPresence?: boolean;
    openGraphTags?: Record<string, string>;
    headerHierarchy: { tag: string, text: string }[];
    linkDensity: { internal: number, external: number };
    internalLinks?: string[];
    externalLinks?: string[];
  };
  advancedMetrics?: {
    wordCount: number;
    paragraphCount: number;
    missingAltCount: number;
    topTerms: string[];
  };
  dominantStyles: {
    cssVariables: Record<string, string>;
    bodyBackground: string;
    textColor: string;
    fontFamily: string;
  };
  mobileStyles?: {
    bodyBackground: string;
    textColor: string;
    layout: {
      containerMaxWidth: string;
      paragraphMargin: string;
      headingMargin: string;
    };
  };
  layoutValues: {
    containerMaxWidth: string;
    spacing: {
      paragraph: string;
      heading: string;
    };
  };
  componentSamples: {
    headings: Record<string, any>;
    paragraph: any;
    link: any;
    buttonOrCta: any;
    blockquote: any;
  };
  editorialPatterns: {
    hasDropCap: boolean;
    hasPullQuotes: boolean;
    imageCount: number;
  };
  aiAnalysis?: {
    seoKeywords: string[];
    contentStructure: string;
    imageTypes: string[];
    successFactors: string[];
    contentGaps?: string[];
  };
  rawText?: string;
  rawHtml?: string;
  nlpExtraction?: any;
  mediaContext?: {
    images: string[];
    videos: string[];
  };
  lsiKeywords?: { term: string; score: number }[];
}

export async function extractReferenceDesign(url: string): Promise<ExtractedDesign | null> {
  const browser = await chromium.launch({ headless: true });
  // Start with Desktop Viewport
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  try {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    } catch (e) {
      // Ignore initial timeout 
    }
    await page.waitForTimeout(2000);

    const finalTitle = await page.title().catch(() => '');
    const isStillBlocked = finalTitle.includes('Just a moment') || finalTitle.includes('Cloudflare') || finalTitle.includes('Attention Required') || (await page.content()).includes('Verification successful');

    if (isStillBlocked) {
      const scrapeBadgerKey = process.env.NEXT_PUBLIC_SCRAPE_BADGE;
      if (!scrapeBadgerKey) throw new Error('Scrape Badger API key missing');
      
      const response = await fetch("https://scrapebadger.com/v1/web/scrape", {
        method: "POST",
        headers: {
          "X-API-Key": scrapeBadgerKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          "url": url,
          "format": "html",
          "render_js": false,
          "anti_bot": true, // ensures we bypass Cloudflare/bot-detection
          "escalate": false
        }),
      });
      
      if (!response.ok) {
         const errText = await response.text();
         throw new Error(`Scrape Badger error ${response.status}: ${errText}`);
      }
      
      const data = await response.json();
      const fetchedHtml = data.data || data.html || data.content || (typeof data === 'string' ? data : null);
      if (!fetchedHtml) throw new Error('Could not parse Scrape Badger response');
      
      await page.setContent(fetchedHtml, { waitUntil: 'load' });
      await page.waitForTimeout(1000);
    }

    // 1. Extract raw HTML for Readability
    const html = await page.content();
    const doc = new JSDOM(html, { url }).window.document;
    const reader = new Readability(doc);
    const article = reader.parse();

    if (!article) {
      throw new Error('Failed to extract article content using Readability.');
    }

    // 2. Extract Desktop Styles and SEO Data
    const desktopData = await page.evaluate(() => {
      const getStyles = (element: Element | null) => {
        if (!element) return null;
        const styles = window.getComputedStyle(element);
        return {
          fontFamily: styles.fontFamily,
          fontSize: styles.fontSize,
          fontWeight: styles.fontWeight,
          lineHeight: styles.lineHeight,
          color: styles.color,
          backgroundColor: styles.backgroundColor,
          margin: styles.margin,
          padding: styles.padding,
          borderRadius: styles.borderRadius,
          textTransform: styles.textTransform,
          letterSpacing: styles.letterSpacing,
        };
      };

      const rootStyles = window.getComputedStyle(document.documentElement);
      const styleSheets = Array.from(document.styleSheets);
      const cssVariables: Record<string, string> = {};
      
      try {
        for (const sheet of styleSheets) {
          try {
            const rules = Array.from(sheet.cssRules || []);
            for (const rule of rules) {
              if (rule instanceof CSSStyleRule && rule.selectorText === ':root') {
                for (let i = 0; i < rule.style.length; i++) {
                  const propName = rule.style[i];
                  if (propName.startsWith('--')) {
                    cssVariables[propName] = rootStyles.getPropertyValue(propName).trim();
                  }
                }
              }
            }
          } catch (e) {
            // Ignore cors errors
          }
        }
      } catch (e) {
        // Fallback or ignore
      }

      const h1 = document.querySelector('h1');
      const h2 = document.querySelector('h2');
      const p = document.querySelector('p');
      const a = document.querySelector('a');
      const blockquote = document.querySelector('blockquote');
      const cta = document.querySelector('button, a[class*="btn"], a[class*="button"]') || document.querySelector('a');
      const mainContainer = document.querySelector('main, article, .content, #content') || document.body;

      // SEO & Meta data extraction
      const seoDescription = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
      const publishedTime = document.querySelector('meta[property="article:published_time"]')?.getAttribute('content') || document.querySelector('time')?.getAttribute('datetime') || '';

      const headerHierarchy = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => ({
        tag: h.tagName.toLowerCase(),
        text: (h.textContent || '').trim()
      })).filter(h => h.text.length > 0);

      const baseUrl = new URL(window.location.href).origin;
      const internalLinkUrls: string[] = [];
      const externalLinkUrls: string[] = [];
      Array.from(document.querySelectorAll('a[href]')).forEach(a_tag => {
        const href = (a_tag as HTMLAnchorElement).href;
        try {
          if (href.startsWith(baseUrl) || href.startsWith('/')) {
            if (!href.startsWith('#')) internalLinkUrls.push(href);
          } else if (href.startsWith('http')) {
            externalLinkUrls.push(href);
          }
        } catch(e) {}
      });
      const internal = internalLinkUrls.length;
      const external = externalLinkUrls.length;

      const titleTag = document.title || '';
      const canonicalUrl = document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
      const schemaPresence = !!document.querySelector('script[type="application/ld+json"]');
      const paragraphCount = document.querySelectorAll('p').length;
      const missingAltCount = document.querySelectorAll('img:not([alt]), img[alt=""]').length;

      const openGraphTags: Record<string, string> = {};
      document.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]').forEach(tag => {
        const prop = tag.getAttribute('property') || tag.getAttribute('name');
        const content = tag.getAttribute('content');
        if (prop && content) openGraphTags[prop] = content;
      });

      const mainTextContent = mainContainer.textContent || '';
      const words = mainTextContent.split(/\s+/).filter(w => w.length > 2);
      const wordCount = words.length;

      const stopWords = new Set(['the', 'and', 'for', 'that', 'with', 'this', 'from', 'are', 'not', 'have', 'but', 'was', 'they', 'you', 'all']);
      const termFreq: Record<string, number> = {};
      words.forEach(w => {
        const clean = w.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (clean.length > 3 && !stopWords.has(clean)) {
          termFreq[clean] = (termFreq[clean] || 0) + 1;
        }
      });
      const topTerms = Object.entries(termFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(e => e[0]);

      return {
        seo: {
          titleTag,
          description: seoDescription,
          canonicalUrl,
          schemaPresence,
          openGraphTags,
          publishedTime,
          headerHierarchy,
          linkDensity: { internal, external },
          internalLinks: [...new Set(internalLinkUrls)].slice(0, 50),
          externalLinks: [...new Set(externalLinkUrls)].slice(0, 50),
        },
        advancedMetrics: {
          wordCount,
          paragraphCount,
          missingAltCount,
          topTerms
        },
        cssVariables,
        bodyBackground: rootStyles.backgroundColor,
        textColor: rootStyles.color,
        fontFamily: rootStyles.fontFamily,
        layout: {
          containerMaxWidth: window.getComputedStyle(mainContainer).maxWidth,
          paragraphMargin: p ? window.getComputedStyle(p).marginBottom : '0px',
          headingMargin: h2 ? window.getComputedStyle(h2).marginBottom : '0px',
        },
        components: {
          headings: {
            h1: getStyles(h1),
            h2: getStyles(h2),
          },
          paragraph: getStyles(p),
          link: getStyles(a),
          buttonOrCta: getStyles(cta),
          blockquote: getStyles(blockquote),
        },
        patterns: {
          hasDropCap: !!document.querySelector('.dropcap, p:first-of-type::first-letter'),
          hasPullQuotes: !!document.querySelector('aside.pullquote, .pullquote, blockquote.pull'),
          imageCount: document.querySelectorAll('img').length,
        }
      };
    });

    // 3. Switch to Mobile Viewport to extract mobile overrides
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500); // Allow reflow

    const mobileData = await page.evaluate(() => {
      const rootStyles = window.getComputedStyle(document.documentElement);
      const p = document.querySelector('p');
      const h2 = document.querySelector('h2');
      const mainContainer = document.querySelector('main, article, .content, #content') || document.body;

      return {
        bodyBackground: rootStyles.backgroundColor,
        textColor: rootStyles.color,
        layout: {
          containerMaxWidth: window.getComputedStyle(mainContainer).maxWidth,
          paragraphMargin: p ? window.getComputedStyle(p).marginBottom : '0px',
          headingMargin: h2 ? window.getComputedStyle(h2).marginBottom : '0px',
        }
      };
    });

    return {
      metadata: {
        title: article.title || '',
        description: desktopData.seo.description,
        byline: article.byline || '',
        excerpt: article.excerpt || '',
        length: article.length || 0,
        siteName: article.siteName || '',
        url: url,
        publishedTime: desktopData.seo.publishedTime,
      },
      seo: {
        headerHierarchy: desktopData.seo.headerHierarchy,
        linkDensity: desktopData.seo.linkDensity,
        internalLinks: desktopData.seo.internalLinks || [],
        externalLinks: desktopData.seo.externalLinks || [],
      },
      dominantStyles: {
        cssVariables: desktopData.cssVariables,
        bodyBackground: desktopData.bodyBackground || 'var(--background)',
        textColor: desktopData.textColor || 'var(--foreground)',
        fontFamily: desktopData.fontFamily || 'monospace',
      },
      mobileStyles: mobileData,
      advancedMetrics: desktopData.advancedMetrics,
      layoutValues: {
        containerMaxWidth: desktopData.layout.containerMaxWidth,
        spacing: {
          paragraph: desktopData.layout.paragraphMargin,
          heading: desktopData.layout.headingMargin,
        }
      },
      componentSamples: desktopData.components,
      editorialPatterns: desktopData.patterns,
      lsiKeywords: extractLsiKeywords(article.textContent || '', {
        topN: 15,
        minScore: 0.15
      }),
      rawText: article.textContent ?? undefined,
    };
  } catch (error) {
    console.error('Error extracting design:', error);
    return null;
  } finally {
    await browser.close();
  }
}
