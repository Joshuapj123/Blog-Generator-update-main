import { marked } from 'marked';
import { DiagramAssetService } from '@/lib/content/DiagramAssetService';

/**
 * Normalizes raw AI markdown output into a consistent HTML structure for Tiptap.
 * - Replaces any diagram placeholders (!Diagram: ...) with rendered deterministic SVG assets
 * - Demotes H1s to H2s
 * - Collapses extra blank lines
 * - Converts to HTML
 */
export function normalizeAiOutput(markdownContent: string): string {
  if (!markdownContent) return '';
  
  // Transform all diagram placeholders into rendered SVG assets
  const processedWithDiagrams = DiagramAssetService.replaceDiagramPlaceholders(markdownContent);

  // Clean up extra blank lines
  let cleaned = processedWithDiagrams.replace(/\n{3,}/g, '\n\n');
  
  // Enforce heading levels: Demote H1s to H2s in sections
  cleaned = cleaned.replace(/^#\s+/gm, '## ');

  // Parse markdown to HTML
  const html = marked.parse(cleaned, { async: false }) as string;
  
  return html;
}

