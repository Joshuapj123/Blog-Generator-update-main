import { marked } from 'marked';

/**
 * Normalizes raw AI markdown output into a consistent HTML structure for Tiptap.
 * - Demotes H1s to H2s
 * - Collapses extra blank lines
 * - Converts to HTML
 */
export function normalizeAiOutput(markdownContent: string): string {
  if (!markdownContent) return '';
  
  // Clean up extra blank lines
  let cleaned = markdownContent.replace(/\n{3,}/g, '\n\n');
  
  // Enforce heading levels: Demote H1s to H2s in sections
  cleaned = cleaned.replace(/^#\s+/gm, '## ');

  // Parse markdown to HTML
  const html = marked.parse(cleaned, { async: false }) as string;
  
  return html;
}
