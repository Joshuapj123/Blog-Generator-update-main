/**
 * Computes SEO and content metrics from generated article sections and final markdown/HTML output.
 */

export interface ContentMetrics {
  h1Count: number;
  h2Count: number;
  h3Count: number;
  wordCount: number;
  paragraphCount: number;
  internalLinkCount: number;
  externalLinkCount: number;
  imageCount: number;
  missingAltCount: number;
  topTerms: string[];
}

export function computeGeneratedMetrics(
  markdown: string,
  sections: any[]
): ContentMetrics {
  // Count headings
  const h1Count = (markdown.match(/^# /gm) || []).length;
  const h2Count = (markdown.match(/^## /gm) || []).length;
  const h3Count = (markdown.match(/^### /gm) || []).length;

  // Basic word count (stripping obvious markdown tokens)
  const cleanText = markdown
    .replace(/[#*_\[\]\\()]/g, ' ')
    .replace(/\n+/g, ' ');
    
  const words = cleanText.split(/\s+/).filter(w => w.length > 2);
  const wordCount = words.length;

  // Paragraph count (blocks of text separated by double newlines that aren't headers)
  const blocks = markdown.split(/\n\n+/);
  const paragraphs = blocks.filter(b => b.trim().length > 0 && !b.trim().startsWith('#') && !b.trim().startsWith('!'));
  const paragraphCount = paragraphs.length;

  // Links
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let internalLinkCount = 0;
  let externalLinkCount = 0;
  
  let match;
  while ((match = linkRegex.exec(markdown)) !== null) {
    const url = match[2];
    if (!url.startsWith('http')) {
       internalLinkCount++;
    } else {
       // If it starts with http, it's external (unless it's our own domain, but we can't easily know the prod domain here)
       // Assuming absolute URLs are external and relative are internal for the generated content
       externalLinkCount++;
    }
  }

  // Images
  const imageRegex = /!\[(.*?)\]\([^)]+\)/g;
  let imageCount = 0;
  let missingAltCount = 0;
  while ((match = imageRegex.exec(markdown)) !== null) {
    imageCount++;
    if (!match[1] || match[1].trim() === '') {
      missingAltCount++;
    }
  }
  
  // YouTube videos (if any)
  const ytMatch = markdown.match(/https:\/\/www\.youtube\.com\/watch\?v=/g);
  if (ytMatch) {
    imageCount += ytMatch.length; // Count video embeds as rich media images/assets for comparison sake
  }

  // Top Terms
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
    h1Count: h1Count || 1, // Usually 1 from the title block which might not be in the body string
    h2Count,
    h3Count,
    wordCount,
    paragraphCount,
    internalLinkCount,
    externalLinkCount,
    imageCount,
    missingAltCount,
    topTerms
  };
}
