import { jsPDF } from 'jspdf';
import { ContentEvidenceValidator } from '@/lib/intelligence/ContentEvidenceValidator';
import { EditorialIntegrityValidator } from '@/lib/intelligence/EditorialIntegrityValidator';
import { DiagramAssetService } from '@/lib/content/DiagramAssetService';
import { slugify, triggerDownload } from '@/lib/article-utils';

export interface ExportArticleInput {
  title: string;
  slug?: string;
  content?: string; // HTML, Markdown, raw text, or legacy JSON
  bodyMarkdown?: string;
  blueprint?: any;
  sections?: any[];
  targetBrand?: string;
  saasProfile?: any;
  metadata?: {
    intent?: string;
    targetKeywords?: string[];
    author?: string;
    publishedDate?: string;
    folder?: string;
  };
}

export interface ExportValidationResult {
  canExport: boolean;
  errors: string[];
  warnings: string[];
  resolvedHtml: string;
  resolvedTitle: string;
}

interface ParsedPdfBlock {
  type: 'h1' | 'h2' | 'h3' | 'p' | 'li' | 'blockquote' | 'table' | 'hr';
  text?: string;
  items?: string[];
  tableData?: { headers: string[]; rows: string[][] };
}

export class ArticleExportService {
  /**
   * Resolves the canonical, complete HTML body from various supported article formats:
   * 1. Modern HTML string (e.g. from TipTap editor or Firestore content field)
   * 2. Markdown string (converted to semantic HTML)
   * 3. Legacy JSON format ({ blueprint, sections })
   * 4. Structured sections array
   */
  public static resolveCanonicalHtml(input: ExportArticleInput): string {
    let rawContent = (input.content || input.bodyMarkdown || '').trim();

    // 1. Check for legacy JSON format: { blueprint, sections }
    if (rawContent.startsWith('{') && rawContent.endsWith('}')) {
      try {
        const parsed = JSON.parse(rawContent);
        if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.sections) && parsed.sections.length > 0) {
            return this.convertSectionsToHtml(parsed.blueprint || input.blueprint, parsed.sections);
          }
          if (parsed.content && typeof parsed.content === 'string') {
            rawContent = parsed.content.trim();
          }
        }
      } catch {
        // Not valid JSON, continue
      }
    }

    // 2. If content is already HTML (contains common HTML tags)
    if (/<(?:h[1-6]|p|div|section|table|ul|ol|blockquote)[^>]*>/i.test(rawContent)) {
      return DiagramAssetService.stripDiagramPlaceholders(rawContent).trim();
    }

    // 3. If content is Markdown (contains headings or markdown syntax)
    if (rawContent.length > 0) {
      const htmlFromMd = this.convertMarkdownToHtml(rawContent);
      return DiagramAssetService.stripDiagramPlaceholders(htmlFromMd).trim();
    }

    // 4. Fallback to sections if provided
    if (Array.isArray(input.sections) && input.sections.length > 0) {
      return this.convertSectionsToHtml(input.blueprint, input.sections);
    }

    // 5. Fallback to blueprint.sections
    if (input.blueprint && Array.isArray(input.blueprint.sections) && input.blueprint.sections.length > 0) {
      return this.convertSectionsToHtml(input.blueprint, input.blueprint.sections);
    }

    return '';
  }

  /**
   * Validates article completeness, listicle promises, stub sections, placeholders,
   * entity premise, and CTA relevance before permitting export.
   */
  public static validateBeforeExport(input: ExportArticleInput): ExportValidationResult {
    const resolvedHtml = this.resolveCanonicalHtml(input);
    const resolvedTitle = (input.title || input.blueprint?.title || 'Untitled Article').trim();
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for empty or missing body content
    if (!resolvedHtml || resolvedHtml.replace(/<[^>]*>/g, '').trim().length === 0) {
      errors.push('Article Completeness Alert: Article body is missing or empty. Please generate or write complete article content before downloading.');
      return {
        canExport: false,
        errors,
        warnings,
        resolvedHtml: '',
        resolvedTitle
      };
    }

    // Validate using ContentEvidenceValidator's HTML completeness gate
    const htmlValidation = ContentEvidenceValidator.validateHtmlCompleteness(
      resolvedHtml,
      resolvedTitle,
      input.targetBrand || input.saasProfile?.name,
      input.saasProfile
    );

    if (!htmlValidation.passed) {
      errors.push(...htmlValidation.criticalErrors);
    }
    warnings.push(...htmlValidation.warnings);

    // Validate raw markdown/content for editorial integrity & prompt leakage (Phase 6D)
    const rawContent = input.bodyMarkdown || (typeof input.content === 'string' ? input.content : '');
    if (rawContent && rawContent.trim().length > 0) {
      const integrity = EditorialIntegrityValidator.validateEditorialIntegrity(rawContent, {
        targetBrand: input.targetBrand || input.saasProfile?.name
      });
      if (!integrity.passed) {
        for (const err of integrity.criticalErrors) {
          if (!errors.includes(err)) {
            errors.push(err);
          }
        }
      }
      if (integrity.warnings.length > 0) {
        warnings.push(...integrity.warnings);
      }
    }

    return {
      canExport: errors.length === 0,
      errors,
      warnings,
      resolvedHtml,
      resolvedTitle
    };
  }

  /**
   * Generates a complete, valid, standalone HTML document.
   */
  public static generateStandaloneHtml(
    input: ExportArticleInput,
    options?: { skipValidation?: boolean }
  ): string {
    if (!options?.skipValidation) {
      const validation = this.validateBeforeExport(input);
      if (!validation.canExport) {
        throw new Error(`Export blocked: ${validation.errors.join(' ')}`);
      }
    }

    const htmlBody = this.resolveCanonicalHtml(input);
    const title = (input.title || input.blueprint?.title || 'Untitled Article').trim();
    const slug = input.slug || input.blueprint?.slug || slugify(title);
    const intent = input.metadata?.intent || input.blueprint?.intent || '';
    const date = input.metadata?.publishedDate || new Date().toISOString().split('T')[0];

    // Sanitize HTML body to prevent any script or malicious execution
    const sanitizedBody = this.sanitizeHtml(htmlBody);

    // Ensure title is present as H1 if not already at the start
    const hasH1 = /<h1[^>]*>/i.test(sanitizedBody);
    const headerBlock = hasH1
      ? ''
      : `<h1 class="article-title">${this.escapeHtml(title)}</h1>`;

    const metaBadge = intent
      ? `<span class="badge intent-badge">${this.escapeHtml(intent)}</span>`
      : '';
    const slugBadge = slug
      ? `<span class="badge slug-badge">/${this.escapeHtml(slug)}</span>`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${this.escapeHtml(title)}</title>
  <meta name="generator" content="ACUTE Content Engine" />
  <meta name="date" content="${this.escapeHtml(date)}" />
  <style>
    :root {
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      --color-text: #0f172a;
      --color-text-muted: #475569;
      --color-bg: #ffffff;
      --color-bg-alt: #f8fafc;
      --color-border: #e2e8f0;
      --color-primary: #2563eb;
      --color-primary-light: #eff6ff;
      --color-accent: #059669;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font-sans);
      color: var(--color-text);
      background-color: var(--color-bg);
      line-height: 1.75;
      font-size: 1.05rem;
      padding: 3rem 1.5rem;
    }
    .article-container {
      max-width: 820px;
      margin: 0 auto;
    }
    .article-header {
      margin-bottom: 2.5rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--color-border);
    }
    .badges {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }
    .badge {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
      border: 1px solid var(--color-border);
    }
    .intent-badge { background-color: var(--color-primary-light); color: var(--color-primary); border-color: #bfdbfe; }
    .slug-badge { background-color: var(--color-bg-alt); color: var(--color-text-muted); font-family: monospace; }
    h1, .article-title {
      font-size: 2.35rem;
      font-weight: 800;
      line-height: 1.25;
      color: var(--color-text);
      margin-bottom: 1rem;
      letter-spacing: -0.02em;
    }
    h2 {
      font-size: 1.6rem;
      font-weight: 700;
      line-height: 1.35;
      margin-top: 2.5rem;
      margin-bottom: 1rem;
      padding-bottom: 0.4rem;
      border-bottom: 2px solid var(--color-border);
      color: #1e293b;
    }
    h3 {
      font-size: 1.25rem;
      font-weight: 600;
      margin-top: 1.8rem;
      margin-bottom: 0.75rem;
      color: #334155;
    }
    p { margin-bottom: 1.35rem; }
    ul, ol {
      margin: 1rem 0 1.5rem 1.75rem;
    }
    li {
      margin-bottom: 0.5rem;
    }
    blockquote {
      border-left: 4px solid var(--color-primary);
      background-color: var(--color-primary-light);
      padding: 1rem 1.25rem;
      margin: 1.5rem 0;
      border-radius: 0 0.5rem 0.5rem 0;
      color: #1e3a8a;
      font-style: normal;
    }
    blockquote strong {
      color: #1d4ed8;
    }
    .table-container {
      overflow-x: auto;
      margin: 2rem 0;
      border-radius: 0.5rem;
      border: 1px solid var(--color-border);
      box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.95rem;
    }
    th {
      background-color: var(--color-bg-alt);
      padding: 0.85rem 1rem;
      font-weight: 600;
      color: #334155;
      border-bottom: 2px solid var(--color-border);
    }
    td {
      padding: 0.85rem 1rem;
      border-bottom: 1px solid var(--color-border);
      color: var(--color-text-muted);
    }
    tr:last-child td { border-bottom: none; }
    tr:nth-child(even) td { background-color: #fafbfc; }
    a {
      color: var(--color-primary);
      text-decoration: underline;
      text-underline-offset: 3px;
    }
    a:hover { color: #1d4ed8; }
    hr {
      border: none;
      border-top: 1px solid var(--color-border);
      margin: 2.5rem 0;
    }
    .acute-diagram-container {
      margin: 2rem 0;
      text-align: center;
    }
    .acute-diagram-container img {
      max-width: 100%;
      height: auto;
      border-radius: 0.5rem;
      border: 1px solid var(--color-border);
    }
    .article-footer {
      margin-top: 4rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--color-border);
      font-size: 0.85rem;
      color: #94a3b8;
      text-align: center;
    }
    @media print {
      body { padding: 0; font-size: 10pt; }
      .article-container { max-width: 100%; }
      h2 { page-break-after: avoid; }
      table { page-break-inside: avoid; }
      blockquote { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <article class="article-container">
    <header class="article-header">
      ${metaBadge || slugBadge ? `<div class="badges">${metaBadge}${slugBadge}</div>` : ''}
      ${headerBlock}
    </header>
    <div class="article-body">
      ${sanitizedBody}
    </div>
    <footer class="article-footer">
      Published via ACUTE Content Intelligence Platform &bull; Validated Factual Integrity
    </footer>
  </article>
</body>
</html>`;
  }

  /**
   * Generates a fully formatted, paginated, readable PDF buffer using jsPDF.
   */
  public static generatePdfBuffer(
    input: ExportArticleInput,
    options?: { skipValidation?: boolean }
  ): Uint8Array {
    if (!options?.skipValidation) {
      const validation = this.validateBeforeExport(input);
      if (!validation.canExport) {
        throw new Error(`Export blocked: ${validation.errors.join(' ')}`);
      }
    }

    const htmlBody = this.resolveCanonicalHtml(input);
    const title = (input.title || input.blueprint?.title || 'Untitled Article').trim();
    const blocks = this.parseHtmlToPdfBlocks(htmlBody);

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4'
    });

    const margin = 45;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const printableWidth = pageWidth - margin * 2;
    let y = margin + 10;

    const ensureSpace = (needed: number) => {
      if (y + needed > pageHeight - margin - 25) {
        doc.addPage();
        y = margin + 15;
      }
    };

    // Document Properties
    doc.setProperties({
      title: title,
      subject: input.metadata?.intent || 'Article Export',
      author: input.metadata?.author || 'ACUTE Content Engine',
      creator: 'ACUTE Content Engine'
    });

    // 1. Article Title Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(15, 23, 42); // slate-900
    const cleanTitle = this.sanitizeTextForPdf(title);
    const titleLines = doc.splitTextToSize(cleanTitle, printableWidth);
    ensureSpace(titleLines.length * 24 + 30);
    doc.text(titleLines, margin, y);
    y += titleLines.length * 24 + 8;

    // Subtitle metadata
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139); // slate-500
    const metaParts: string[] = [];
    if (input.metadata?.intent || input.blueprint?.intent) {
      metaParts.push(`Intent: ${input.metadata?.intent || input.blueprint?.intent}`);
    }
    metaParts.push(`Exported: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`);
    doc.text(metaParts.join('  |  '), margin, y);
    y += 14;

    // Divider Line
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(1);
    doc.line(margin, y, pageWidth - margin, y);
    y += 18;

    // 2. Render Article Blocks
    for (const block of blocks) {
      const normBlockText = this.sanitizeTextForPdf(block.text || '').toLowerCase().replace(/[^\w]/g, '');
      const normCleanTitle = cleanTitle.toLowerCase().replace(/[^\w]/g, '');
      if ((block.type === 'h1' || block.type === 'h2') && normBlockText === normCleanTitle) {
        continue; // Skip duplicate title
      }

      if (block.type === 'h1' || block.type === 'h2') {
        const text = this.sanitizeTextForPdf(block.text || '');
        ensureSpace(45);
        y += 8;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(block.type === 'h1' ? 15 : 13.5);
        doc.setTextColor(30, 41, 59); // slate-800
        const lines = doc.splitTextToSize(text, printableWidth);
        doc.text(lines, margin, y);
        y += lines.length * 18 + 6;
      } else if (block.type === 'h3') {
        const text = this.sanitizeTextForPdf(block.text || '');
        ensureSpace(32);
        y += 6;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        doc.setTextColor(51, 65, 85); // slate-700
        const lines = doc.splitTextToSize(text, printableWidth);
        doc.text(lines, margin, y);
        y += lines.length * 15 + 4;
      } else if (block.type === 'blockquote') {
        const text = this.sanitizeTextForPdf(block.text || '');
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(10);
        doc.setTextColor(51, 65, 85);
        const lines = doc.splitTextToSize(text, printableWidth - 24);
        ensureSpace(lines.length * 14 + 20);

        // Background box for blockquote
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, printableWidth, lines.length * 14 + 14, 'F');

        // Blue accent bar
        doc.setDrawColor(37, 99, 235);
        doc.setLineWidth(3.5);
        doc.line(margin, y, margin, y + lines.length * 14 + 14);

        doc.text(lines, margin + 14, y + 12);
        y += lines.length * 14 + 22;
      } else if (block.type === 'li' && block.items) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(30, 41, 59);
        for (const item of block.items) {
          const text = this.sanitizeTextForPdf(item);
          const lines = doc.splitTextToSize(text, printableWidth - 20);
          ensureSpace(lines.length * 14 + 6);
          doc.text('•', margin + 4, y + 10);
          doc.text(lines, margin + 16, y + 10);
          y += lines.length * 14 + 4;
        }
        y += 6;
      } else if (block.type === 'table' && block.tableData) {
        const { headers, rows } = block.tableData;
        if (headers.length > 0 || rows.length > 0) {
          const colCount = Math.max(headers.length, ...rows.map(r => r.length), 1);
          const colWidth = printableWidth / colCount;
          const rowHeight = 20;

          ensureSpace((rows.length + 1) * rowHeight + 25);
          y += 6;

          // Header
          if (headers.length > 0) {
            doc.setFillColor(241, 245, 249);
            doc.rect(margin, y, printableWidth, rowHeight, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(30, 41, 59);
            headers.forEach((h, colIdx) => {
              const hText = this.sanitizeTextForPdf(h);
              doc.text(hText, margin + colIdx * colWidth + 5, y + 14);
            });
            y += rowHeight;
          }

          // Data rows
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(51, 65, 85);
          rows.forEach((r, rIdx) => {
            ensureSpace(rowHeight);
            if (rIdx % 2 === 1) {
              doc.setFillColor(248, 250, 252);
              doc.rect(margin, y, printableWidth, rowHeight, 'F');
            }
            doc.setDrawColor(226, 232, 240);
            doc.line(margin, y + rowHeight, margin + printableWidth, y + rowHeight);

            r.forEach((cell, colIdx) => {
              const cellText = this.sanitizeTextForPdf(cell);
              doc.text(cellText, margin + colIdx * colWidth + 5, y + 14);
            });
            y += rowHeight;
          });
          y += 12;
        }
      } else {
        // Normal paragraph
        const text = this.sanitizeTextForPdf(block.text || '');
        if (text) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.setTextColor(30, 41, 59);
          const lines = doc.splitTextToSize(text, printableWidth);
          ensureSpace(lines.length * 15 + 8);
          doc.text(lines, margin, y + 10);
          y += lines.length * 15 + 8;
        }
      }
    }

    // 3. Header & Footer on every page
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text('ACUTE Content Engine  •  Verified Publication Export', margin, pageHeight - 20);
      doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin - 45, pageHeight - 20);
    }

    const arrayBuffer = doc.output('arraybuffer');
    return new Uint8Array(arrayBuffer);
  }

  /**
   * Client-side HTML download with completeness gate.
   */
  public static downloadHtmlClient(input: ExportArticleInput): { success: boolean; error?: string } {
    try {
      const validation = this.validateBeforeExport(input);
      if (!validation.canExport) {
        return { success: false, error: validation.errors.join('\n') };
      }
      const html = this.generateStandaloneHtml(input, { skipValidation: true });
      const slug = input.slug || slugify(input.title || 'article');
      triggerDownload(`${slug}.html`, html, 'text/html');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to generate HTML export.' };
    }
  }

  /**
   * Client-side PDF download with completeness gate.
   */
  public static downloadPdfClient(input: ExportArticleInput): { success: boolean; error?: string } {
    try {
      const validation = this.validateBeforeExport(input);
      if (!validation.canExport) {
        return { success: false, error: validation.errors.join('\n') };
      }
      const pdfBytes = this.generatePdfBuffer(input, { skipValidation: true });
      const slug = input.slug || slugify(input.title || 'article');
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to generate PDF export.' };
    }
  }

  // --- Internal Helpers ---

  private static convertMarkdownToHtml(markdown: string): string {
    const lines = markdown.split('\n');
    const htmlChunks: string[] = [];
    let inList = false;
    let listItems: string[] = [];
    let inTable = false;
    let tableRows: string[] = [];

    const flushList = () => {
      if (inList) {
        htmlChunks.push(`<ul>\n${listItems.map(i => `  <li>${i}</li>`).join('\n')}\n</ul>`);
        inList = false;
        listItems = [];
      }
    };

    const flushTable = () => {
      if (inTable) {
        if (tableRows.length > 0) {
          const headerCells = tableRows[0].split('|').map(c => c.trim()).filter(Boolean);
          const bodyRows = tableRows.slice(2); // Skip separator row
          let tableHtml = '<div class="table-container"><table><thead><tr>';
          headerCells.forEach(h => { tableHtml += `<th>${h}</th>`; });
          tableHtml += '</tr></thead><tbody>';
          bodyRows.forEach(r => {
            const cells = r.split('|').map(c => c.trim()).filter(Boolean);
            if (cells.length > 0) {
              tableHtml += '<tr>';
              cells.forEach(c => { tableHtml += `<td>${c}</td>`; });
              tableHtml += '</tr>';
            }
          });
          tableHtml += '</tbody></table></div>';
          htmlChunks.push(tableHtml);
        }
        inTable = false;
        tableRows = [];
      }
    };

    for (const line of lines) {
      const trimmed = line.trim();

      // Table row
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        flushList();
        inTable = true;
        tableRows.push(trimmed);
        continue;
      } else if (inTable) {
        flushTable();
      }

      // List item
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s+/.test(trimmed)) {
        inList = true;
        const itemText = trimmed.replace(/^(?:[-*]|\d+\.)\s+/, '').trim();
        listItems.push(this.formatInlineMarkdown(itemText));
        continue;
      } else if (inList) {
        flushList();
      }

      if (!trimmed) {
        continue;
      }

      if (trimmed.startsWith('# ')) {
        htmlChunks.push(`<h1>${this.formatInlineMarkdown(trimmed.slice(2))}</h1>`);
      } else if (trimmed.startsWith('## ')) {
        htmlChunks.push(`<h2>${this.formatInlineMarkdown(trimmed.slice(3))}</h2>`);
      } else if (trimmed.startsWith('### ')) {
        htmlChunks.push(`<h3>${this.formatInlineMarkdown(trimmed.slice(4))}</h3>`);
      } else if (trimmed.startsWith('> ')) {
        htmlChunks.push(`<blockquote>${this.formatInlineMarkdown(trimmed.slice(2))}</blockquote>`);
      } else if (trimmed === '---') {
        htmlChunks.push('<hr />');
      } else {
        htmlChunks.push(`<p>${this.formatInlineMarkdown(trimmed)}</p>`);
      }
    }

    flushList();
    flushTable();

    return htmlChunks.join('\n\n');
  }

  private static formatInlineMarkdown(text: string): string {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }

  private static convertSectionsToHtml(blueprint: any, sections: any[]): string {
    const lines: string[] = [];

    if (blueprint?.intro?.hook) {
      lines.push(`<p>${this.escapeHtml(blueprint.intro.hook)}</p>`);
    }
    if (blueprint?.intro?.thesis) {
      lines.push(`<blockquote><strong>Thesis:</strong> ${this.escapeHtml(blueprint.intro.thesis)}</blockquote>`);
    }

    for (const sec of sections) {
      const tag = sec.level === 'H3' ? 'h3' : 'h2';
      lines.push(`<${tag}>${this.escapeHtml(sec.heading)}</${tag}>`);
      if (sec.what_it_is) {
        const paras = sec.what_it_is.split('\n\n').filter(Boolean);
        paras.forEach((p: string) => {
          lines.push(`<p>${this.formatInlineMarkdown(p)}</p>`);
        });
      }
      if (sec.why_it_works && !sec.why_it_works.includes('key execution processes')) {
        lines.push(`<p>${this.formatInlineMarkdown(sec.why_it_works)}</p>`);
      }
      if (sec.markdown_table) {
        lines.push(this.convertMarkdownToHtml(sec.markdown_table));
      }
      if (sec.copy_formula && Array.isArray(sec.copy_formula) && sec.copy_formula.length > 0) {
        lines.push(`<ul>${sec.copy_formula.map((f: string) => `<li>${this.escapeHtml(f)}</li>`).join('')}</ul>`);
      }
    }

    if (blueprint?.cta?.heading && blueprint.cta.description) {
      lines.push(`<h2>${this.escapeHtml(blueprint.cta.heading)}</h2>`);
      lines.push(`<p>${this.escapeHtml(blueprint.cta.description)}</p>`);
    }

    return lines.join('\n\n');
  }

  private static parseHtmlToPdfBlocks(html: string): ParsedPdfBlock[] {
    const blocks: ParsedPdfBlock[] = [];
    let clean = html.replace(/<!--[\s\S]*?-->/g, '');

    // Extract tables
    const tableMatches = Array.from(clean.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi));
    const tablePlaceholders: { placeholder: string; block: ParsedPdfBlock }[] = [];

    tableMatches.forEach((match, idx) => {
      const tableHtml = match[1];
      const headers: string[] = [];
      const rows: string[][] = [];

      const thMatches = Array.from(tableHtml.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi));
      thMatches.forEach(m => headers.push(m[1].replace(/<[^>]*>/g, '').trim()));

      const trMatches = Array.from(tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi));
      trMatches.forEach(trMatch => {
        const rowCells: string[] = [];
        const tdMatches = Array.from(trMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi));
        tdMatches.forEach(m => rowCells.push(m[1].replace(/<[^>]*>/g, '').trim()));
        if (rowCells.length > 0) {
          rows.push(rowCells);
        }
      });

      const placeholder = `__TABLE_PLACEHOLDER_${idx}__`;
      tablePlaceholders.push({
        placeholder,
        block: { type: 'table', tableData: { headers, rows } }
      });
      clean = clean.replace(match[0], `<p>${placeholder}</p>`);
    });

    // Helper to preserve link URLs in PDF blocks: <a href="url">text</a> -> text (url)
    const preserveAnchorUrls = (content: string): string => {
      return content.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, linkText) => {
        const cleanHref = href.trim();
        const cleanText = linkText.replace(/<[^>]*>/g, '').trim();
        if (!cleanHref || cleanHref === '#' || cleanHref.startsWith('javascript:')) {
          return cleanText;
        }
        if (!cleanText || cleanText.toLowerCase() === cleanHref.toLowerCase()) {
          return cleanHref;
        }
        return `${cleanText} (${cleanHref})`;
      });
    };

    // Extract lists (supporting both <ul> and <ol>) in-place using placeholders to preserve document order
    const listPlaceholders: { placeholder: string; block: ParsedPdfBlock }[] = [];
    clean = clean.replace(/<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/gi, (_, _tag, inner) => {
      const items: string[] = [];
      const liMatches = Array.from((inner as string).matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi));
      liMatches.forEach(m => items.push(preserveAnchorUrls(m[1]).replace(/<[^>]*>/g, '').trim()));
      const placeholder = `__LIST_PLACEHOLDER_${listPlaceholders.length}__`;
      listPlaceholders.push({
        placeholder,
        block: { type: 'li', items }
      });
      return `<p>${placeholder}</p>`;
    });

    // Extract headings, blockquotes, and paragraphs
    const tagRegex = /<(h[1-3]|p|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi;
    let match;
    while ((match = tagRegex.exec(clean)) !== null) {
      const tag = match[1].toLowerCase();
      const rawContent = match[2];
      const text = preserveAnchorUrls(rawContent).replace(/<[^>]*>/g, '').trim();
      if (!text) continue;

      if (text.startsWith('__TABLE_PLACEHOLDER_')) {
        const ph = tablePlaceholders.find(p => text.includes(p.placeholder));
        if (ph) {
          blocks.push(ph.block);
          continue;
        }
      }

      if (text.startsWith('__LIST_PLACEHOLDER_')) {
        const ph = listPlaceholders.find(p => text.includes(p.placeholder));
        if (ph) {
          blocks.push(ph.block);
          continue;
        }
      }

      if (tag === 'h1') blocks.push({ type: 'h1', text });
      else if (tag === 'h2') blocks.push({ type: 'h2', text });
      else if (tag === 'h3') blocks.push({ type: 'h3', text });
      else if (tag === 'blockquote') blocks.push({ type: 'blockquote', text });
      else blocks.push({ type: 'p', text });
    }

    return blocks;
  }

  public static sanitizeHtml(html: string): string {
    if (!html) return '';
    return html
      // Strip script tags
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      // Strip style tags
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      // Strip inline event handlers
      .replace(/\s+on[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '')
      // Strip javascript: URLs
      .replace(/href\s*=\s*['"]\s*javascript:[^'"]*['"]/gi, 'href="#"')
      // Strip data: URIs except safe image types
      .replace(/href\s*=\s*['"]\s*data:[^'"]*['"]/gi, 'href="#"');
  }

  public static sanitizeTextForPdf(text: string): string {
    if (!text) return '';
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/—/g, ' -- ')
      .replace(/–/g, ' - ')
      .replace(/…/g, '...')
      .replace(/•/g, '-')
      // Map known emojis and symbol prefixes to clean textual labels
      .replace(/🎬/g, '[Video]')
      .replace(/📎/g, '[Source]')
      .replace(/💡/g, '[Tip]')
      .replace(/⚠️/g, '[Warning]')
      .replace(/✅/g, '[Yes]')
      .replace(/❌/g, '[No]')
      .replace(/🔥/g, '[Highlight]')
      .replace(/🚀/g, '[Fast]')
      .replace(/📈/g, '[Growth]')
      .replace(/📊/g, '[Data]')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remove any remaining HTML tags
      .replace(/<[^>]*>/g, '')
      // Strip any surrogate pairs / multi-byte emojis that standard WinAnsi Helvetica cannot render
      .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
      // Strip unprintable control chars except \n and \t
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Replace remaining non-ASCII characters outside standard Latin-1 printable range
      .replace(/[^\x20-\x7E\xA0-\xFF\n\t]/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  public static escapeHtml(str: string): string {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
