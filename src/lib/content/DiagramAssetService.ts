// src/lib/content/DiagramAssetService.ts
import { escapeRegExp } from '@/lib/utils';

export interface DiagramNode {
  step: number;
  title: string;
  description: string;
}

export interface DiagramRequirement {
  rawMatch: string;
  title: string;
  diagramType?: 'workflow' | 'architecture' | 'process' | 'comparison' | 'strategy' | 'general';
  context?: string;
  nodes?: DiagramNode[];
}

export interface DiagramAssetResult {
  success: boolean;
  title: string;
  svgContent: string;
  dataUri: string;
  nodes: DiagramNode[];
  error?: string;
}

export class DiagramAssetService {
  /**
   * Regular expressions matching diagram placeholders in markdown or text.
   * Handles:
   *  - `!Diagram: Concept Title`
   *  - `![Diagram: Concept Title](...)` or `![Diagram: Concept Title]`
   *  - `![Workflow Diagram: Concept Title](...)`
   *  - `![Architecture Diagram: Concept Title](...)`
   *  - `!Workflow Diagram: Concept Title`
   */
  private static readonly DIAGRAM_PATTERNS = [
    /<p>\s*!(?:Workflow\s+|Architecture\s+|Process\s+)?Diagram:\s*([\s\S]*?)<\/p>/gi,
    /!\[(?:Workflow\s+|Architecture\s+|Process\s+)?Diagram:\s*([^\]\n]+)\](?:\(([^\)\n]*)\))?/gi,
    /!(?:Workflow\s+|Architecture\s+|Process\s+)?Diagram:\s*([^\n\r]+)/gi,
    /!\[([^\]\n]*(?:workflow|diagram|architecture|process flow)[^\]\n]*)\]\((?:[^)\n]*\.(?:png|svg|jpg|jpeg)|placeholder|diagram)?\)/gi,
  ];

  /**
   * Sanitizes title input to ensure no HTML tags, script syntax, or event handlers survive.
   */
  public static sanitizeTitle(rawTitle: string): string {
    return (rawTitle || '')
      .replace(/<[^>]*>/g, '') // strip all HTML tags
      .replace(/\b(?:javascript|data|vbscript):/gi, '') // strip dangerous URI schemes
      .replace(/\bon\w+\s*=/gi, '') // strip inline event handlers
      .replace(/^!\[?(?:workflow\s+|architecture\s+|process\s+)?diagram:\s*/i, '')
      .replace(/\.(png|svg|jpg|jpeg)$/i, '')
      .replace(/[\[\]\)\(\*\_`"]/g, '')
      .trim();
  }

  /**
   * Escape XML entities to prevent SVG injection or invalid XML parsing.
   */
  public static escapeXml(unsafe: string): string {
    return (unsafe || '').replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
        default: return c;
      }
    });
  }

  /**
   * Wrap text into multiple lines for SVG rendering.
   */
  public static wrapText(text: string, maxCharsPerLine: number = 20): string[] {
    const words = (text || '').split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
        currentLine = (currentLine + ' ' + word).trim();
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines.length > 0 ? lines : [text];
  }

  /**
   * Capitalize words in a string.
   */
  public static capitalize(str: string): string {
    if (!str) return '';
    return str
      .split(/\s+/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Extracts all diagram requirements from markdown or plain text content.
   */
  public static extractDiagramRequirements(text: string): DiagramRequirement[] {
    if (!text) return [];
    const requirements: DiagramRequirement[] = [];
    const seenMatches = new Set<string>();

    for (const pattern of this.DIAGRAM_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const rawMatch = match[0];
        if (seenMatches.has(rawMatch)) continue;
        seenMatches.add(rawMatch);

        let title = this.sanitizeTitle(match[1]);
        if (!title) continue;

        let diagramType: DiagramRequirement['diagramType'] = 'general';
        const lower = title.toLowerCase();
        if (lower.includes('workflow') || lower.includes('pipeline') || lower.includes('lifecycle')) {
          diagramType = 'workflow';
        } else if (lower.includes('architecture') || lower.includes('infrastructure') || lower.includes('system')) {
          diagramType = 'architecture';
        } else if (lower.includes('vs') || lower.includes('comparison')) {
          diagramType = 'comparison';
        } else if (lower.includes('strategy') || lower.includes('roadmap')) {
          diagramType = 'strategy';
        }

        requirements.push({
          rawMatch,
          title,
          diagramType
        });
      }
    }

    return requirements;
  }

  /**
   * Synthesize 3 to 5 structured diagram nodes from the title and surrounding context.
   * Implements semantic intent extraction:
   * e.g. "Custom App Solves Business Pain Points" ->
   * 1. Business Pain Points
   * 2. Custom Application
   * 3. Workflow Automation
   * 4. Improved Efficiency
   * 5. Scalable Growth
   */
  public static synthesizeDiagramNodes(title: string, context?: string): DiagramNode[] {
    const cleanTitle = this.sanitizeTitle(title);

    if (!cleanTitle) {
      throw new Error('Diagram title is required to synthesize diagram nodes.');
    }

    const lower = cleanTitle.toLowerCase();

    // 1. Check for explicit step sequence in title or context (e.g. "A -> B -> C" or "A > B > C")
    if (cleanTitle.includes('->') || cleanTitle.includes(' > ')) {
      const rawSteps = cleanTitle.split(/->|>|\band\s+then\b/i).map(s => s.trim()).filter(Boolean);
      if (rawSteps.length >= 2) {
        return rawSteps.slice(0, 5).map((step, idx) => ({
          step: idx + 1,
          title: this.capitalize(step),
          description: `Execution and validation of ${step.toLowerCase()}`
        }));
      }
    }

    // 2. Pattern: Solves / Resolves / Fixes / Overcomes (Problem -> Solution -> Value)
    const solvesMatch = cleanTitle.match(/(.+?)\s+(?:solves|resolves|fixes|overcomes|eliminates|addresses)\s+(.+)/i);
    if (solvesMatch) {
      const solution = solvesMatch[1].trim();
      const problem = solvesMatch[2].trim();
      return [
        { step: 1, title: this.capitalize(problem), description: 'Operational bottlenecks & manual friction' },
        { step: 2, title: this.capitalize(solution), description: 'Tailored architecture matching core workflows' },
        { step: 3, title: 'Workflow Automation', description: 'Eliminating repetitive manual tasks' },
        { step: 4, title: 'Improved Efficiency', description: 'Higher throughput & optimal resource use' },
        { step: 5, title: 'Scalable Growth', description: 'Predictable expansion & measurable ROI' }
      ];
    }

    // 3. Pattern: Lifecycle / Pipeline / Journey / Funnel
    if (/lifecycle|pipeline|funnel|journey|workflow|process flow/i.test(lower)) {
      const subject = cleanTitle
        .replace(/lifecycle|pipeline|funnel|journey|workflow|process flow/gi, '')
        .trim();
      const cleanSubject = this.capitalize(subject || 'Process');

      return [
        { step: 1, title: `${cleanSubject} Intake`, description: 'Initial capture, ingestion & validation' },
        { step: 2, title: 'Evaluation & Scoring', description: 'Automated qualification & priority triage' },
        { step: 3, title: 'Execution & Routing', description: 'Automated handoffs & task assignments' },
        { step: 4, title: 'Progress & Validation', description: 'Review, quality assurance & milestone tracking' },
        { step: 5, title: 'Delivery & Retention', description: 'Successful completion & long-term value' }
      ];
    }

    // 4. Pattern: Architecture / Infrastructure / Platform / Central View
    if (/architecture|infrastructure|platform|central view|system|dashboard/i.test(lower)) {
      const subject = this.capitalize(cleanTitle.replace(/architecture|infrastructure|platform|system|overview/gi, '').trim() || 'System');
      return [
        { step: 1, title: 'Data Ingestion', description: 'Multi-channel inputs & API connectors' },
        { step: 2, title: `${subject} Hub`, description: 'Unified data model & central orchestration' },
        { step: 3, title: 'Business Logic', description: 'Rule-based automation & intelligence engines' },
        { step: 4, title: 'Security & Control', description: 'Role-based access & audit verification' },
        { step: 5, title: 'Unified Output', description: 'Real-time reporting & actionable analytics' }
      ];
    }

    // 5. Pattern: Strategy / Implementation / Best Practices / Roadmap
    if (/strategy|implementation|roadmap|framework|best practices|guide/i.test(lower)) {
      const subject = this.capitalize(cleanTitle.replace(/strategy|implementation|roadmap|framework|guide/gi, '').trim() || 'Initiative');
      return [
        { step: 1, title: 'Discovery & Audit', description: 'Baseline evaluation & constraint identification' },
        { step: 2, title: 'Strategic Roadmap', description: 'Defining milestones & target architecture' },
        { step: 3, title: `${subject} Execution`, description: 'Phased rollout with stakeholder alignment' },
        { step: 4, title: 'Optimization Loop', description: 'Continuous feedback & performance tuning' },
        { step: 5, title: 'Scale & Compounding', description: 'Predictable growth & team enablement' }
      ];
    }

    // 6. Generic semantic decomposition
    const words = cleanTitle.split(/\s+/).filter(Boolean);
    if (words.length >= 4) {
      const half = Math.ceil(words.length / 2);
      const p1 = words.slice(0, half).join(' ');
      const p2 = words.slice(half).join(' ');
      return [
        { step: 1, title: this.capitalize(p1), description: 'Initial setup, discovery & requirements' },
        { step: 2, title: 'System Orchestration', description: 'Automated integration & workflow execution' },
        { step: 3, title: this.capitalize(p2), description: 'Core functional capabilities & delivery' },
        { step: 4, title: 'Value Realization', description: 'Measurable impact & accelerated growth' }
      ];
    }

    return [
      { step: 1, title: 'Assessment & Setup', description: 'Establishing baseline requirements' },
      { step: 2, title: this.capitalize(cleanTitle), description: 'Primary solution execution & integration' },
      { step: 3, title: 'Process Automation', description: 'Streamlined workflows & error reduction' },
      { step: 4, title: 'Business Impact', description: 'Sustainable efficiency & growth' }
    ];
  }

  /**
   * Generates a fully compliant, self-contained SVG diagram string.
   */
  public static generateSvg(title: string, nodes: DiagramNode[]): string {
    const safeTitle = this.escapeXml(title.toUpperCase());
    const numNodes = Math.max(1, Math.min(nodes.length, 5));
    const activeNodes = nodes.slice(0, 5);

    const svgWidth = 920;
    const svgHeight = 250;
    const startX = 30;
    const endX = svgWidth - 30;
    const availableWidth = endX - startX;

    const cardWidth = Math.floor((availableWidth - (numNodes - 1) * 28) / numNodes);
    const cardHeight = 135;
    const cardY = 80;

    let nodesSvg = '';
    for (let i = 0; i < activeNodes.length; i++) {
      const node = activeNodes[i];
      const x = startX + i * (cardWidth + 28);
      const titleLines = this.wrapText(node.title, 16).slice(0, 2);
      const descLines = this.wrapText(node.description, 20).slice(0, 3);

      // Connector Arrow
      let arrowSvg = '';
      if (i < activeNodes.length - 1) {
        const arrowStartX = x + cardWidth + 4;
        const arrowEndX = arrowStartX + 20;
        const arrowY = cardY + Math.floor(cardHeight / 2);
        arrowSvg = `
          <line x1="${arrowStartX}" y1="${arrowY}" x2="${arrowEndX}" y2="${arrowY}" stroke="#6366f1" stroke-width="2.5" marker-end="url(#arrowhead)" />
        `;
      }

      // Step Badge
      const stepLabel = String(node.step || i + 1).padStart(2, '0');

      // Title lines SVG
      const titleTspans = titleLines.map((line, lIdx) => 
        `<tspan x="${x + 14}" dy="${lIdx === 0 ? 0 : 16}">${this.escapeXml(line)}</tspan>`
      ).join('');

      // Description lines SVG
      const descStartY = cardY + 54 + (titleLines.length * 16);
      const descTspans = descLines.map((line, lIdx) => 
        `<tspan x="${x + 14}" dy="${lIdx === 0 ? 0 : 14}">${this.escapeXml(line)}</tspan>`
      ).join('');

      nodesSvg += `
        <!-- Node ${i + 1} -->
        <g class="diagram-node">
          <rect x="${x}" y="${cardY}" width="${cardWidth}" height="${cardHeight}" rx="10" ry="10" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5" filter="url(#card-shadow)" />
          
          <!-- Step Indicator Pill -->
          <rect x="${x + 12}" y="${cardY + 12}" width="26" height="18" rx="4" fill="#4f46e5" />
          <text x="${x + 25}" y="${cardY + 25}" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="700" fill="#ffffff" text-anchor="middle">${stepLabel}</text>
          
          <!-- Node Title -->
          <text x="${x + 14}" y="${cardY + 46}" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="700" fill="#0f172a">
            ${titleTspans}
          </text>

          <!-- Node Description -->
          <text x="${x + 14}" y="${descStartY}" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="#64748b">
            ${descTspans}
          </text>
        </g>
        ${arrowSvg}
      `;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%" height="auto" style="max-width: 100%;">
  <defs>
    <filter id="card-shadow" x="-5%" y="-5%" width="110%" height="115%" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.06" flood-color="#0f172a"/>
    </filter>
    <marker id="arrowhead" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#6366f1" />
    </marker>
    <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f8fafc" />
      <stop offset="100%" stop-color="#f1f5f9" />
    </linearGradient>
  </defs>

  <!-- Container Box -->
  <rect x="2" y="2" width="${svgWidth - 4}" height="${svgHeight - 4}" rx="14" ry="14" fill="url(#bg-grad)" stroke="#e2e8f0" stroke-width="1.5" />

  <!-- Header Badge -->
  <g transform="translate(30, 22)">
    <rect x="0" y="0" width="${Math.min(760, safeTitle.length * 8 + 48)}" height="28" rx="6" fill="#eef2ff" stroke="#c7d2fe" stroke-width="1" />
    <circle cx="14" cy="14" r="4" fill="#4f46e5" />
    <text x="26" y="18" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="700" fill="#3730a3" letter-spacing="0.5">
      ${safeTitle}
    </text>
  </g>

  <!-- Nodes Flow -->
  ${nodesSvg}
</svg>`;
  }

  /**
   * Generates a complete diagram asset with base64 data URI and nodes.
   */
  public static generateDiagramAsset(title: string, context?: string): DiagramAssetResult {
    try {
      const cleanTitle = this.sanitizeTitle(title);
      if (!cleanTitle || cleanTitle.length === 0) {
        throw new Error('Cannot generate diagram without a valid title or concept.');
      }

      const nodes = this.synthesizeDiagramNodes(cleanTitle, context);
      const svgContent = this.generateSvg(cleanTitle, nodes);
      
      const base64Svg = typeof Buffer !== 'undefined'
        ? Buffer.from(svgContent, 'utf8').toString('base64')
        : btoa(unescape(encodeURIComponent(svgContent)));

      const dataUri = `data:image/svg+xml;base64,${base64Svg}`;

      return {
        success: true,
        title: cleanTitle,
        svgContent,
        dataUri,
        nodes
      };
    } catch (err: any) {
      return {
        success: false,
        title: title || 'Unknown Diagram',
        svgContent: '',
        dataUri: '',
        nodes: [],
        error: err.message || 'Diagram generation failed.'
      };
    }
  }

  /**
   * Renders a clean failure state card when diagram generation fails.
   */
  public static renderFailedDiagramPlaceholder(concept: string, error?: string): string {
    const safeConcept = this.escapeXml(concept || 'Diagram');
    const safeError = this.escapeXml(error || 'Generation error');
    return `\n<div class="acute-diagram-failure p-4 my-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm flex items-center justify-between" data-diagram-failed="true" data-diagram-concept="${safeConcept}">
  <div class="flex items-center space-x-2">
    <span>⚠️</span>
    <span><strong>Diagram Generation Failed:</strong> Could not generate visual diagram for "${safeConcept}". (${safeError})</span>
  </div>
</div>\n`;
  }

  /**
   * Replaces all diagram placeholders in markdown or HTML content with real rendered visual assets.
   */
  public static replaceDiagramPlaceholders(content: string, context?: string): string {
    if (!content) return '';

    const requirements = this.extractDiagramRequirements(content);
    if (requirements.length === 0) return content;

    const isHtml = /<(?:p|div|h[1-6]|span|article)[\s>]/i.test(content);
    let result = content;

    for (const req of requirements) {
      const asset = this.generateDiagramAsset(req.title, context);
      const safeTitle = this.escapeXml(req.title);

      if (asset.success && asset.dataUri) {
        if (isHtml) {
          const htmlReplacement = `<div class="acute-diagram-container my-6 text-center"><img src="${asset.dataUri}" alt="Diagram: ${safeTitle}" class="rounded-xl border border-slate-200 shadow-sm max-w-full h-auto mx-auto block" /><p class="text-center text-xs text-slate-500 mt-2 font-medium"><em>Figure: ${safeTitle}</em></p></div>`;
          let replaced = false;
          if (req.rawMatch.startsWith('<p') && req.rawMatch.endsWith('</p>')) {
            result = result.split(req.rawMatch).join(htmlReplacement);
            replaced = true;
          } else {
            const escapedMatch = escapeRegExp(req.rawMatch);
            const wrappedRegex = new RegExp(`<p>\\s*${escapedMatch}\\s*<\\/p>`, 'gi');
            if (wrappedRegex.test(result)) {
              result = result.replace(wrappedRegex, () => htmlReplacement);
              replaced = true;
            }
          }
          if (!replaced) {
            result = result.split(req.rawMatch).join(htmlReplacement);
          }
        } else {
          const mdReplacement = `\n\n![Diagram: ${req.title}](${asset.dataUri})\n*Figure: ${req.title}*\n\n`;
          result = result.split(req.rawMatch).join(mdReplacement);
        }
      } else {
        const failureCard = this.renderFailedDiagramPlaceholder(req.title, asset.error);
        if (isHtml) {
          const escapedMatch = escapeRegExp(req.rawMatch);
          const wrappedRegex = new RegExp(`<p>\\s*${escapedMatch}\\s*<\\/p>`, 'gi');
          if (wrappedRegex.test(result)) {
            result = result.replace(wrappedRegex, () => failureCard);
          } else {
            result = result.split(req.rawMatch).join(failureCard);
          }
        }
      }
    }

    return result;
  }
}


