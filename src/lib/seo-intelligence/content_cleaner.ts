import { JSDOM } from 'jsdom';

/**
 * Pre-cleans HTML string to strip scripts, styles, SVGs, etc. before loading into JSDOM.
 */
export function cleanHtmlContent(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * Removes boilerplate, cookie banners, navigation, footers, ads, and sidebars from a JSDOM document.
 */
export function cleanDom(doc: Document): void {
  const selectorsToPrune = [
    'nav', 'header', 'footer', 'aside', 'noscript', 'svg', 'template', 'iframe',
    '.cookie', '.cookie-consent', '#cookie-consent', '.onetrust-consent-sdk',
    '.banner', '.popup', '.modal', '.widget', '.sidebar', '.ad', '.ads',
    '#sidebar', '#footer', '#header', '#nav', '.menu', '#menu',
    '[class*="cookie"]', '[class*="privacy"]', '[class*="consent"]',
    '[id*="cookie"]', '[id*="privacy"]', '[id*="consent"]',
    '[class*="share"]', '[class*="social"]', '[class*="widget"]',
    '[id*="widget"]', '.ad-box', '.advertisement', '.social-share',
    '#comments', '.comments', '.newsletter', '.signup', '#comments-container',
    '.sidebar-widget', '.related-posts', '.related-articles', '.post-navigation',
    '.breadcrumbs', '.search-form', '.popover', '.tooltip'
  ];
  selectorsToPrune.forEach(selector => {
    try {
      doc.querySelectorAll(selector).forEach(el => el.remove());
    } catch (e) {
      // ignore invalid selectors
    }
  });
}
