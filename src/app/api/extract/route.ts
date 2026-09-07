import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { extractEntitiesWithGemini } from '@/lib/entity-extraction';
import { runExtractionChain } from '@/lib/seo-intelligence/serp_collector';

function sseMsg(type: string, payload: Record<string, unknown>) {
  return `data: ${JSON.stringify({ type, ...payload })}\n\n`;
}

function cleanDom(doc: Document) {
  const selectorsToPrune = [
    'nav', 'header', 'footer', 'aside', 'noscript', 'svg', 'template', 'iframe',
    '.cookie', '.cookie-consent', '#cookie-consent', '.onetrust-consent-sdk',
    '.banner', '.popup', '.modal', '.widget', '.sidebar', '.ad', '.ads',
    '#sidebar', '#footer', '#header', '#nav', '.menu', '#menu',
    '[class*="cookie"]', '[class*="privacy"]', '[class*="consent"]',
    '[id*="cookie"]', '[id*="privacy"]', '[id*="consent"]',
    '[class*="share"]', '[class*="social"]', '[class*="widget"]',
    '[id*="widget"]', '.ad-box', '.advertisement', '.social-share',
    '#comments', '.comments'
  ];
  selectorsToPrune.forEach(selector => {
    try {
      doc.querySelectorAll(selector).forEach(el => el.remove());
    } catch (e) {
      // ignore invalid selectors
    }
  });
}

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const { url } = await request.json().catch(() => ({ url: null }));

  if (!url) {
    return new Response(JSON.stringify({ error: 'URL is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const encoder = new TextEncoder();

  // Define the source object separately to avoid Turbopack parsing issues with large inline objects
  const source: UnderlyingSource = {
    async start(controller) {
      const emit = (type: string, payload: Record<string, unknown> = {}) => {
        try {
          controller.enqueue(encoder.encode(sseMsg(type, payload)));
        } catch (e) {
          console.warn('[extract] Failed to enqueue SSE message:', e);
        }
      };

      let browser;
      let extractionMethod = 'playwright'; // Default method

      try {
        console.log('[INTELLIGENCE] START');
        console.log('[REFERENCE] START');
        console.log('[REFERENCE] CONNECT START');
        const pw = await import('playwright');
        browser = await pw.chromium.launch({ 
          headless: true,
          args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-features=IsolateOrigins,site-per-process'
          ],
          ignoreDefaultArgs: ['--enable-automation']
        });
        console.log('[REFERENCE] CONNECT END');

        emit('stage', { stage: 2, label: 'Navigating to URL…', percent: 20 });
        const page = await browser.newPage({ 
          viewport: { width: 1280, height: 800 },
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        });

        // Enforce safe default timeouts for all Playwright actions on this page
        page.setDefaultTimeout(20000);
        page.setDefaultNavigationTimeout(20000);

        await page.setExtraHTTPHeaders({
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
        });

        await page.addInitScript(() => {
          Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
          Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
          Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
          (window as any).chrome = { runtime: {} };
        });

        let navigationTimeout = false;
        console.log('[LAYOUT] START');
        console.log('[LAYOUT] PLAYWRIGHT GOTO START');
        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
          console.log('[LAYOUT] PLAYWRIGHT GOTO END (networkidle)');
        } catch (e) {
          navigationTimeout = true;
          console.log('[LAYOUT] PLAYWRIGHT GOTO TIMEOUT (networkidle)');
          emit('stage', { stage: 2, label: 'Retrying with faster load strategy…', percent: 28 });
          console.log('[LAYOUT] PLAYWRIGHT RETRY GOTO START');
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
          console.log('[LAYOUT] PLAYWRIGHT RETRY GOTO END');
          await page.waitForTimeout(1500);
        }

        console.log('[LAYOUT] GET TITLE START');
        let currentTitle = await page.title().catch(() => '');
        console.log('[LAYOUT] GET TITLE END:', currentTitle);
        if (currentTitle.includes('Just a moment') || currentTitle.includes('Cloudflare') || currentTitle.includes('Attention Required')) {
          emit('stage', { stage: 2, label: 'Bypassing security checks…', percent: 35 });
          try {
            await page.waitForFunction(() => {
              const t = document.title;
              const hasContent = !!document.querySelector('article, main, h1');
              const isNotCloudflare = !t.includes('Just a moment') && !t.includes('Cloudflare') && !t.includes('Attention Required') && !document.body.textContent?.includes('Verification successful');
              return isNotCloudflare && hasContent;
            }, { timeout: 20000 });
            
            await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
            await page.waitForTimeout(3000);
          } catch (e) {
            console.log('[extract] Playwright failed to bypass security check or timeout reached');
          }

          const finalTitle = await page.title().catch(() => '');
          const isStillBlocked = finalTitle.includes('Just a moment') || finalTitle.includes('Cloudflare') || finalTitle.includes('Attention Required') || (await page.content()).includes('Verification successful');
          
          if (isStillBlocked) {
            extractionMethod = 'scrape_badger';
            console.log('[extract] Detected persistent block. Switching to Scrape Badger...');
            emit('stage', { stage: 2.5, label: 'Bypassing protection with Scrape Badger...', percent: 40 });
            try {
              const scrapeBadgerKey = process.env.NEXT_PUBLIC_SCRAPE_BADGE;
              if (!scrapeBadgerKey) throw new Error('Scrape Badger API key missing');
              
              const response = await fetch("https://scrapebadger.com/v1/web/scrape", {
                method: "POST",
                headers: {
                  "X-API-Key": scrapeBadgerKey,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  "url": url,
                  "format": "html",
                  "render_js": false,
                  "anti_bot": false,
                  "escalate": false
                })
              });
              
              if (!response.ok) {
                 const errText = await response.text();
                 throw new Error(`Scrape Badger error ${response.status}: ${errText}`);
              }
              
              const dataValue = await response.json();
              const fetchedHtml = dataValue.data || dataValue.html || dataValue.content || (typeof dataValue === 'string' ? dataValue : null);
              
              if (!fetchedHtml) {
                throw new Error('Could not parse Scrape Badger response');
              }
              
              await page.setContent(fetchedHtml, { waitUntil: 'load' });
              await page.waitForTimeout(1000);
              console.log('[extract] Successfully bypassed block using Scrape Badger.');
            } catch (e: any) {
              emit('stage', { stage: 2.7, label: 'Cloudflare block persistent. Retrying with Scrape Badger...', percent: 42 });
              emit('error', { message: `Cloudflare bot protection blocked the extraction, and fallback failed: ${e.message}` });
              controller.close();
              await browser.close();
              return;
            }
          }
        } else if (navigationTimeout) {
           await page.waitForTimeout(2000);
        }

        if (extractionMethod === 'playwright') {
          console.log('[extract] Content successfully accessed via Playwright.');
        }

        emit('stage', { stage: 3, label: 'Parsing article with Readability…', percent: 45 });
        console.log('[LAYOUT] DOM EXTRACTION START');
        console.log('[LAYOUT] PLAYWRIGHT CONTENT START');
        const html = await page.content();
        console.log('[LAYOUT] PLAYWRIGHT CONTENT END');
        
        let doc;
        try {
          const noStyleTagsHtml = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
          doc = new JSDOM(noStyleTagsHtml, { url }).window.document;
        } catch (err) {
          const cleanHtml = html
            .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/\bstyle\s*=\s*(?:"[^"]*"|'[^']*')/gi, '');
          doc = new JSDOM(cleanHtml, { url }).window.document;
        }

        console.log('[LAYOUT] DOM EXTRACTION END');
        console.log('[SEO EXTRACTION] START');
        console.log('[SEO EXTRACTION] READABILITY START');
        // Parse readability on the raw document before pruning to avoid losing the main article wrapper
        const readabilityDoc = new JSDOM(html, { url }).window.document;
        const reader = new Readability(readabilityDoc);
        let article = reader.parse();
        console.log('[SEO EXTRACTION] READABILITY END');

        let text = '';
        let readabilitySuccess = false;

        if (article && article.textContent && article.textContent.trim().length > 200) {
          text = article.textContent
            .replace(/^\s*[{\["](.*)[}\]"]\s*$/gm, '')
            .replace(/\S{31,}/g, '')
            .replace(/\s{3,}/g, '\n')
            .trim();
          if (text.split(/\s+/).filter(w => w.length > 2).length >= 500) {
            readabilitySuccess = true;
          }
        }

        // Run cleanDom on the styling/SEO document
        cleanDom(doc);

        if (!readabilitySuccess) {
          const extResult = await runExtractionChain(html, url, doc);
          
          if (!extResult.text || extResult.text.length < 100) {
            emit('error', { message: 'Readability could not extract article content and fallback failed. The page may require authentication or is not article-like.' });
            controller.close();
            await browser.close();
            return;
          }
          
          text = extResult.text;
          
          article = {
            title: currentTitle || extResult.headings[0]?.text || 'Extracted Page',
            byline: '',
            excerpt: '',
            length: text.length,
            siteName: '',
            textContent: text,
            content: text
          } as any;
        }
        if (!article) {
          emit('error', { message: 'Readability could not extract article content and fallback failed. The page may require authentication or is not article-like.' });
          controller.close();
          await browser.close();
          return;
        }

        console.log('[SEO EXTRACTION] END');
        emit('stage', { stage: 4, label: 'Extracting styles, colors & SEO data…', percent: 65 });

        console.log('[VISUAL HIERARCHY] START');
        console.log('[VISUAL HIERARCHY] DESKTOP EVALUATE START');
        const desktopData = (await page.evaluate(`(() => {
          const getStylesInternal = (element) => {
            if (!element) return null;
            const s = window.getComputedStyle(element);
            return {
              fontFamily: s.fontFamily, fontSize: s.fontSize, fontWeight: s.fontWeight,
              lineHeight: s.lineHeight, color: s.color, backgroundColor: s.backgroundColor,
              margin: s.margin, padding: s.padding, borderRadius: s.borderRadius,
              textTransform: s.textTransform, letterSpacing: s.letterSpacing
            };
          };

          const rootStyles = window.getComputedStyle(document.documentElement);
          const cssVariables = {};
          try {
            for (const sheet of Array.from(document.styleSheets)) {
              try {
                for (const rule of Array.from(sheet.cssRules || [])) {
                  if (rule instanceof CSSStyleRule && rule.selectorText === ':root') {
                    for (let i = 0; i < rule.style.length; i++) {
                      const p = rule.style[i];
                      if (p.startsWith('--')) cssVariables[p] = rootStyles.getPropertyValue(p).trim();
                    }
                  }
                }
              } catch (e) { /* ignore */ }
            }
          } catch (e) { /* ignore */ }

          const h1 = document.querySelector('h1');
          const h2 = document.querySelector('h2');
          const p = document.querySelector('p');
          const a = document.querySelector('a');
          const blockquote = document.querySelector('blockquote');
          const cta = document.querySelector('button, a[class*="btn"], a[class*="button"]') || a;
          const main = document.querySelector('main, article, .content, #content') || document.body;

          const seoDescription = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
          const publishedTime = document.querySelector('meta[property="article:published_time"]')?.getAttribute('content')
            || document.querySelector('time')?.getAttribute('datetime') || '';

          const headerHierarchy = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
            .map(h => ({ tag: h.tagName.toLowerCase(), text: (h.textContent || '').trim() }))
            .filter(h => h.text.length > 0);

          const baseUrlOrigin = new URL(window.location.href).origin;
          const internalLinks = [];
          const externalLinks = [];
          document.querySelectorAll('a[href]').forEach(tag => {
            const href = tag.href;
            try {
              if (href.startsWith(baseUrlOrigin) || href.startsWith('/')) {
                if (href && !href.startsWith('#')) internalLinks.push(href);
              } else if (href.startsWith('http')) {
                externalLinks.push(href);
              }
            } catch (e) { /* skip */ }
          });
          const internalCount = internalLinks.length;
          const externalCount = externalLinks.length;

          const titleTag = document.title || '';
          const canonicalUrl = document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
          const schemaPresence = !!document.querySelector('script[type="application/ld+json"]');
          const paragraphCount = document.querySelectorAll('p').length;
          const missingAltCount = document.querySelectorAll('img:not([alt]), img[alt=""]').length;

          const openGraphTags = {};
          document.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]').forEach(tag => {
            const prop = tag.getAttribute('property') || tag.getAttribute('name');
            const content = tag.getAttribute('content');
            if (prop && content) openGraphTags[prop] = content;
          });

          const mainTextContent = main.textContent || '';
          const words = mainTextContent.split(/\\s+/).filter(w => w.length > 2);
          const wordCount = words.length;

          // Simple top terms extraction (filtering common short words)
          const stopWords = new Set(['the', 'and', 'for', 'that', 'with', 'this', 'from', 'are', 'not', 'have', 'but', 'was', 'they', 'you', 'all']);
          const termFreq = {};
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
              linkDensity: { internal: internalCount, external: externalCount },
              internalLinks: [...new Set(internalLinks)].slice(0, 50),
              externalLinks: [...new Set(externalLinks)].slice(0, 50),
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
              containerMaxWidth: window.getComputedStyle(main).maxWidth,
              paragraphMargin: p ? window.getComputedStyle(p).marginBottom : '0px',
              headingMargin: h2 ? window.getComputedStyle(h2).marginBottom : '0px'
            },
            components: {
              headings: { h1: getStylesInternal(h1), h2: getStylesInternal(h2) },
              paragraph: getStylesInternal(p),
              link: getStylesInternal(a),
              buttonOrCta: getStylesInternal(cta),
              blockquote: getStylesInternal(blockquote)
            },
            patterns: {
              hasDropCap: !!document.querySelector('.dropcap, p:first-of-type::first-letter'),
              hasPullQuotes: !!document.querySelector('aside.pullquote, .pullquote, blockquote.pull'),
              imageCount: document.querySelectorAll('img').length
            }
          };
        })()`) as any);
        console.log('[VISUAL HIERARCHY] DESKTOP EVALUATE END');

        emit('stage', { stage: 5, label: 'Analysing mobile layout…', percent: 85 });
        console.log('[VISUAL HIERARCHY] MOBILE VIEWPORT START');
        await page.setViewportSize({ width: 375, height: 812 });
        await page.waitForTimeout(500);
        console.log('[VISUAL HIERARCHY] MOBILE VIEWPORT END');

        console.log('[VISUAL HIERARCHY] MOBILE EVALUATE START');
        const mobileData = await page.evaluate(`(() => {
          const rootVal = window.getComputedStyle(document.documentElement);
          const p = document.querySelector('p');
          const h2 = document.querySelector('h2');
          const main = document.querySelector('main, article, .content, #content') || document.body;
          return {
            bodyBackground: rootVal.backgroundColor,
            textColor: rootVal.color,
            layout: {
              containerMaxWidth: window.getComputedStyle(main).maxWidth,
              paragraphMargin: p ? window.getComputedStyle(p).marginBottom : '0px',
              headingMargin: h2 ? window.getComputedStyle(h2).marginBottom : '0px'
            }
          };
        })()`);
        console.log('[VISUAL HIERARCHY] MOBILE EVALUATE END');
        console.log('[VISUAL HIERARCHY] END');

        console.log('[TEXT/NLP ANALYSIS] START');
        console.log('[TEXT/NLP ANALYSIS] MEDIA EVALUATE START');
        const mediaContext = await page.evaluate(`(() => {
          const images = Array.from(document.querySelectorAll('img')).map(img => {
            const alt = img.alt || 'no alt';
            const figcaption = img.closest('figure')?.querySelector('figcaption')?.textContent || '';
            return 'Image: [alt=' + alt + '] [caption=' + figcaption + ']';
          }).filter(s => s !== 'Image: [alt=no alt] [caption=]' && s !== 'Image: [alt=] [caption=]');

          const videos = Array.from(document.querySelectorAll('iframe, video')).map(v => {
            const title = v.getAttribute('title') || 'unknown video';
            const srcVar = v.getAttribute('src') || '';
            const isVideoUrl = srcVar.includes('youtube') || srcVar.includes('vimeo') || srcVar.includes('.mp4');
            return isVideoUrl ? 'Video: [title=' + title + '] [src=' + srcVar + ']' : null;
          }).filter(Boolean);

          return { images, videos };
        })()`);
        console.log('[TEXT/NLP ANALYSIS] MEDIA EVALUATE END');
        console.log('[TEXT/NLP ANALYSIS] END');

        emit('stage', { stage: 5.5, label: 'AI Entity Extraction…', percent: 92 });
        console.log('[REFERENCE] FINALIZATION START');
        console.log('[REFERENCE] ENTITY EXTRACTION START');
        const extractedEntities = article.textContent 
            ? await extractEntitiesWithGemini(article.textContent, 15000)
            : [];
        console.log('[REFERENCE] ENTITY EXTRACTION END');
            
        emit('stage', { stage: 6, label: 'Assembling results…', percent: 97 });
        console.log('[REFERENCE] ASSEMBLING RESULTS START');

        const result = {
          metadata: {
            title: article.title || '',
            description: desktopData.seo.description,
            byline: article.byline || '',
            excerpt: article.excerpt || '',
            length: article.length || 0,
            siteName: article.siteName || '',
            url: url,
            publishedTime: desktopData.seo.publishedTime
          },
          seo: {
            headerHierarchy: desktopData.seo.headerHierarchy,
            linkDensity: desktopData.seo.linkDensity,
            internalLinks: desktopData.seo.internalLinks || [],
            externalLinks: desktopData.seo.externalLinks || [],
            titleTag: desktopData.seo.titleTag,
            canonicalUrl: desktopData.seo.canonicalUrl,
            schemaPresence: desktopData.seo.schemaPresence,
            openGraphTags: desktopData.seo.openGraphTags
          },
          advancedMetrics: desktopData.advancedMetrics,
          dominantStyles: {
            cssVariables: desktopData.cssVariables,
            bodyBackground: desktopData.bodyBackground || 'var(--background)',
            textColor: desktopData.textColor || 'var(--foreground)',
            fontFamily: desktopData.fontFamily || 'monospace'
          },
          mobileStyles: mobileData,
          layoutValues: {
            containerMaxWidth: desktopData.layout.containerMaxWidth,
            spacing: {
              paragraph: desktopData.layout.paragraphMargin,
              heading: desktopData.layout.headingMargin
            }
          },
          componentSamples: desktopData.components,
          editorialPatterns: desktopData.patterns,
          rawText: article.textContent,
          rawHtml: article.content,
          mediaContext: mediaContext,
          extractedEntities // LLM entities
        };

        console.log('[REFERENCE] ASSEMBLING RESULTS END');
        console.log('[REFERENCE] END');

        emit('done', { data: result, percent: 100 });
        console.log('[INTELLIGENCE] COMPLETED');
        console.log(`[extract] Successfully completed extraction using ${extractionMethod}.`);
      } catch (error: any) {
        console.error('[extract] error during processing:', error);
        const msg = error?.message || 'Unknown error occurred';
        emit('error', {
          message: msg.includes('timeout')
            ? 'The page took too long to load. It may be blocking automated access.'
            : msg.includes('net::ERR')
            ? 'Could not reach the URL. Check that it is publicly accessible.'
            : `Extraction failed: ${msg}`
        });
      } finally {
        console.log('[REFERENCE] BROWSER CLOSE START');
        if (browser) await browser.close().catch(() => {});
        console.log('[REFERENCE] BROWSER CLOSE END');
        controller.close();
      }
    }
  };

  const stream = new ReadableStream(source);

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}
