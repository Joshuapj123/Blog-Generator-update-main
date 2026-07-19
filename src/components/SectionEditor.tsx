'use client';

import {
  useState, useEffect, useRef, useCallback, useMemo,
  forwardRef, useImperativeHandle,
} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import {
  Pencil, Sparkles, Trash2, Plus, Check, X, ChevronDown,
  PlayCircle, Link2, Globe, Loader2, Search,
  ArrowRight, WandSparkles,
} from 'lucide-react';
import { ExternalLink, getExternalLinks, saveExternalLink } from '@/lib/firebase/firestore';
import { RichTextEditor, type RichTextEditorRef } from '@/components/RichTextEditor';

// ═══════════════════════════════════════════════════════════════════
// Shared Interfaces (re-exported so detector/page.tsx can import)
// ═══════════════════════════════════════════════════════════════════

export interface HighlightData {
  positives: string[];
  weakCopyItems: { phrase: string; improvement: string }[];
  semanticMatches: string[];
  /** Deterministically extracted from the reference article raw text */
  referenceKeywords?: string[];
  nlpCategories?: {
    must_have: string[];
    supplementary: string[];
    contextual: string[];
  };
  intent?: string;
  pipelineVersion?: string;
  degradedFallback?: boolean;
}

export interface DetectorEditorRef {
  scrollToPhrase: (phrase: string) => void;
  applyFix: (phrase: string, replacement: string) => void;
  insertTerm: (term: string) => void;
}

interface ContentSection {
  id: string;
  level: 'h1' | 'h2' | 'h3';
  heading: string;
  body: string;
}

interface SectionEditorProps {
  markdown: string;
  highlights: HighlightData;
  onSave?: (markdown: string) => void;
  articleTitle?: string;
  savedArticles?: Array<{ id?: string; title: string; content?: string }>;
  sectionScores?: Record<string, number>;
  documentId?: string;
  keywordBank?: any;
}

// ═══════════════════════════════════════════════════════════════════
// Markdown ↔ HTML Conversion (runs client-side, storage stays markdown)
// ═══════════════════════════════════════════════════════════════════

/**
 * Convert a simple markdown string to HTML for the rich text editor.
 * Handles: headings, bold, italic, links, bullet/ordered lists.
 */
export function markdownToHtml(md: string): string {
  if (!md) return '';
  const lines = md.split('\n');
  const out: string[] = [];
  let inUl = false;
  let inOl = false;

  const closeList = () => {
    if (inUl) { out.push('</ul>'); inUl = false; }
    if (inOl) { out.push('</ol>'); inOl = false; }
  };

  const inlineFormat = (text: string) =>
    text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer" class="rte-link">$1</a>');

  for (const raw of lines) {
    const line = raw;

    const h3 = line.match(/^#{3,}\s+(.+)/);
    const h2 = !h3 && line.match(/^##\s+(.+)/);
    const h1 = !h3 && !h2 && line.match(/^#\s+(.+)/);
    const ul = line.match(/^[-*]\s+(.+)/);
    const ol = line.match(/^\d+\.\s+(.+)/);

    if (h1 || h2 || h3) {
      closeList();
      const tag = h1 ? 'h1' : h2 ? 'h2' : 'h3';
      const text = inlineFormat((h1 || h2 || h3)![1]);
      out.push(`<${tag}>${text}</${tag}>`);
    } else if (ul) {
      if (inOl) { out.push('</ol>'); inOl = false; }
      if (!inUl) { out.push('<ul>'); inUl = true; }
      out.push(`<li>${inlineFormat(ul[1])}</li>`);
    } else if (ol) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (!inOl) { out.push('<ol>'); inOl = true; }
      out.push(`<li>${inlineFormat(ol[1])}</li>`);
    } else if (line.trim() === '') {
      closeList();
      // skip blank lines — browser handles spacing
    } else {
      closeList();
      out.push(`<p>${inlineFormat(line)}</p>`);
    }
  }
  closeList();
  return out.join('\n');
}

/**
 * Convert contentEditable HTML back to markdown for Firebase storage.
 * Handles: headings, bold, italic, links, ul/ol, p, br.
 */
export function htmlToMarkdown(html: string): string {
  if (!html) return '';

  // Use browser DOM parsing (client-side only)
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  function nodeToMd(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || '';
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const inner = Array.from(el.childNodes).map(nodeToMd).join('');

    switch (tag) {
      case 'h1': return `# ${inner}\n\n`;
      case 'h2': return `## ${inner}\n\n`;
      case 'h3': return `### ${inner}\n\n`;
      case 'strong':
      case 'b': return `**${inner}**`;
      case 'em':
      case 'i': return `*${inner}*`;
      case 'code': return `\`${inner}\``;
      case 'a': {
        const href = el.getAttribute('href') || '';
        return `[${inner}](${href})`;
      }
      case 'ul': {
        return Array.from(el.querySelectorAll(':scope > li'))
          .map(li => `- ${liToMd(li as HTMLElement)}`)
          .join('\n') + '\n\n';
      }
      case 'ol': {
        return Array.from(el.querySelectorAll(':scope > li'))
          .map((li, i) => `${i + 1}. ${liToMd(li as HTMLElement)}`)
          .join('\n') + '\n\n';
      }
      case 'li': return inner; // handled by ul/ol above
      case 'br': return '\n';
      case 'p': return `${inner}\n\n`;
      case 'div': return `${inner}\n`;
      case 'blockquote': return `> ${inner}\n\n`;
      default: return inner;
    }
  }

  function liToMd(li: HTMLElement): string {
    return Array.from(li.childNodes).map(nodeToMd).join('').trim();
  }

  const result = Array.from(doc.body.childNodes).map(nodeToMd).join('');
  // Collapse 3+ newlines → 2
  return result.replace(/\n{3,}/g, '\n\n').trim();
}

// ═══════════════════════════════════════════════════════════════════
// Parsing Utilities
// ═══════════════════════════════════════════════════════════════════

let _idCounter = 0;
const uid = () => `s${Date.now()}-${_idCounter++}`;

/**
 * Detect if text looks like raw JSON (starts with { or [)
 * In that case we skip the markdown heading parser and do paragraph split.
 */
function looksLikeJson(text: string): boolean {
  const t = text.trimStart();
  return (t.startsWith('{') || t.startsWith('[')) && t.length > 50;
}

/**
 * Auto-split a blob of text into sections of ~3 paragraphs each.
 * Used as fallback when content has no heading markers.
 */
function splitByParagraphs(md: string): ContentSection[] {
  const paragraphs = md.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  if (paragraphs.length <= 1) {
    return [{ id: uid(), level: 'h2', heading: 'Content', body: md.trim() }];
  }
  const GROUP = 3;
  const sections: ContentSection[] = [];
  for (let i = 0; i < paragraphs.length; i += GROUP) {
    const body = paragraphs.slice(i, i + GROUP).join('\n\n');
    const num = Math.floor(i / GROUP) + 1;
    sections.push({ id: uid(), level: 'h2', heading: `Part ${num}`, body });
  }
  return sections;
}

function parseMarkdown(md: string): ContentSection[] {
  if (!md?.trim()) return [];

  // Normalise Windows / old Mac line endings
  const text = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // If the content is raw JSON, split by paragraph — headings will never match
  if (looksLikeJson(text)) {
    return splitByParagraphs(text);
  }

  const lines = text.split('\n');
  const sections: ContentSection[] = [];
  let current: ContentSection | null = null;
  let bodyLines: string[] = [];

  const flush = () => {
    if (current) {
      current.body = bodyLines.join('\n').trimEnd();
      sections.push(current);
      current = null;
      bodyLines = [];
    }
  };

  for (const line of lines) {
    // Check most specific first to avoid partial-match bugs.
    // h3 = ### or deeper (####, #####…)  treated as H3
    // h2 = ## only (not ###)
    // h1 = # only  (not ##)
    // Also accept HTML heading tags as a courtesy: <h1>, <h2>, <h3>

    const h3 = line.match(/^#{3,}\s+(.+)/) || line.match(/^<h[3-6][^>]*>(.*?)<\/h[3-6]>/i);
    const h2 = !h3 && (line.match(/^##\s+(.+)/) || line.match(/^<h2[^>]*>(.*?)<\/h2>/i));
    const h1 = !h3 && !h2 && (line.match(/^#\s+(.+)/) || line.match(/^<h1[^>]*>(.*?)<\/h1>/i));

    if (h1 || h2 || h3) {
      flush();
      const heading = ((h1 || h2 || h3)![1] ?? '').trim()
        .replace(/<[^>]+>/g, ''); // strip any inner HTML from HTML-tag headings
      const level: ContentSection['level'] = h1 ? 'h1' : h2 ? 'h2' : 'h3';
      current = { id: uid(), level, heading, body: '' };
    } else if (!current && line.trim()) {
      // Content appearing before the first heading → an unnamed intro section
      current = { id: uid(), level: 'h2', heading: 'Introduction', body: '' };
      bodyLines.push(line);
    } else {
      bodyLines.push(line);
    }
  }
  flush();

  // Fallback: if we still ended up with 0 or 1 sections (no headings found),
  // auto-split the text by paragraphs so the editor is still useful.
  if (sections.length <= 1) {
    const fallback = splitByParagraphs(text);
    // Only use fallback if it produces more sections
    if (fallback.length > 1) return fallback;
  }

  return sections;
}

function sectionsToMarkdown(sections: ContentSection[]): string {
  return sections
    .map(s => {
      const prefix = s.level === 'h1' ? '# ' : s.level === 'h2' ? '## ' : '### ';
      const heading = s.heading ? `${prefix}${s.heading}\n\n` : '';
      return `${heading}${s.body}`;
    })
    .join('\n\n');
}

// ═══════════════════════════════════════════════════════════════════
// Highlight Injection
// ═══════════════════════════════════════════════════════════════════

function applyHighlights(text: string, highlights: HighlightData): string {
  let result = text;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const inject = (phrase: string, cls: string, title?: string) => {
    if (!phrase?.trim()) return;
    try {
      const regex = new RegExp(`(${esc(phrase)})`, 'gi');
      const dp = phrase.replace(/"/g, '&quot;');
      const t = title ? ` title="${title.replace(/"/g, '&quot;')}"` : '';
      result = result.replace(regex, m => `<mark class="${cls}"${t} data-phrase="${dp}">${m}</mark>`);
    } catch {}
  };

  highlights.weakCopyItems?.forEach(item => {
    inject(item.phrase,
      'bg-violet-200 text-violet-900 rounded cursor-help border-b-2 border-violet-400 font-medium',
      `Suggestion: ${item.improvement}`);
  });
  highlights.positives?.forEach(phrase => {
    inject(phrase, 'bg-emerald-200 text-emerald-900 rounded font-medium');
  });
  highlights.semanticMatches?.forEach(phrase => {
    inject(phrase, 'underline decoration-emerald-500 decoration-2 underline-offset-4');
  });
  return result;
}

// ═══════════════════════════════════════════════════════════════════
// YouTube Embed (with inline URL editor)
// ═══════════════════════════════════════════════════════════════════

export interface YouTubeEmbedProps {
  /** Full YouTube watch URL, e.g. https://www.youtube.com/watch?v=XXXX */
  href: string;
  /** Called with the new normalised URL when user saves an edit */
  onUpdateUrl?: (oldUrl: string, newUrl: string) => void;
}

/** Extract videoId from any YouTube URL variant. Returns null if not valid. */
function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0];
    if (u.hostname.includes('youtube.com')) {
      return u.searchParams.get('v');
    }
  } catch {}
  return null;
}

export function YouTubeEmbed({ href, onUpdateUrl }: YouTubeEmbedProps) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(href);
  const [currentUrl, setCurrentUrl] = useState(href);
  const [error, setError] = useState('');

  const videoId = extractYouTubeId(currentUrl);

  const handleSave = () => {
    const id = extractYouTubeId(inputVal);
    if (!id) {
      setError('Please enter a valid YouTube URL (youtube.com/watch?v=... or youtu.be/...)');
      return;
    }
    setError('');
    const normalized = `https://www.youtube.com/watch?v=${id}`;
    onUpdateUrl?.(currentUrl, normalized);
    setCurrentUrl(normalized);
    setInputVal(normalized);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') { setEditing(false); setInputVal(currentUrl); setError(''); }
  };

  if (!videoId) {
    return (
      <a href={currentUrl} className="text-blue-600 hover:text-blue-800 underline font-medium" target="_blank" rel="noreferrer">
        {currentUrl}
      </a>
    );
  }

  return (
    <div className="my-6 max-w-2xl mx-auto border rounded-xl overflow-hidden shadow-sm bg-slate-50 not-prose">
      {/* Header bar */}
      <div className="bg-indigo-600/10 px-4 py-2 border-b flex items-center gap-2">
        <span className="text-xs font-bold text-indigo-700">🎬 YouTube</span>
        <a
          href={currentUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[10px] text-indigo-600 hover:underline"
        >
          Open →
        </a>
        <div className="ml-auto flex items-center gap-1.5">
          {onUpdateUrl && (
            <button
              type="button"
              onClick={() => {
                setInputVal(currentUrl);
                setError('');
                setEditing((e) => !e);
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                editing
                  ? 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                  : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
              }`}
            >
              {editing ? (
                <><span>✕</span><span>Cancel</span></>
              ) : (
                <><span>✏️</span><span>Edit URL</span></>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Inline URL editor */}
      {editing && (
        <div className="px-4 py-3 bg-white border-b space-y-2">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            YouTube URL
          </label>
          <div className="flex gap-2 items-start">
            <div className="flex-1 space-y-1">
              <input
                autoFocus
                type="url"
                value={inputVal}
                onChange={(e) => { setInputVal(e.target.value); setError(''); }}
                onKeyDown={handleKeyDown}
                placeholder="https://www.youtube.com/watch?v=..."
                className={`w-full h-9 px-3 text-sm rounded-lg border ${
                  error ? 'border-red-400 focus:ring-red-400' : 'border-slate-200 focus:ring-indigo-400'
                } focus:outline-none focus:ring-2 bg-slate-50`}
              />
              {error && (
                <p className="text-[11px] text-red-500 flex items-center gap-1">
                  <span>⚠️</span> {error}
                </p>
              )}
              <p className="text-[10px] text-slate-400">
                Supports: youtube.com/watch?v=... or youtu.be/...
              </p>
            </div>
            <button
              type="button"
              onClick={handleSave}
              className="shrink-0 h-9 px-3 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Update
            </button>
          </div>
        </div>
      )}

      {/* Video iframe */}
      <div className="relative w-full aspect-video bg-black flex items-center justify-center">
        <iframe
          key={videoId} /* re-mount when video changes */
          className="w-[85%] h-[85%] border-0"
          src={`https://www.youtube.com/embed/${videoId}`}
          title="YouTube video player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ReactMarkdown component factory
// Accepts optional YouTube URL update handler so preview can patch the markdown inline
// ═══════════════════════════════════════════════════════════════════

function createMdComponents(onYtUpdate?: (oldUrl: string, newUrl: string) => void): any {
  return {
    a: ({ href, children, ...props }: any) => {
      if (href?.includes('youtube.com/watch?v=') || href?.includes('youtu.be/')) {
        return (
          <YouTubeEmbed
            href={href}
            onUpdateUrl={onYtUpdate}
          />
        );
      }
      return <a href={href} className="text-blue-600 hover:text-blue-800 underline font-medium" target="_blank" rel="noreferrer" {...props}>{children}</a>;
    },
    h1: ({ node, ...p }: any) => <h1 className="text-3xl font-extrabold text-slate-900 mt-6 mb-3 tracking-tight" {...p} />,
    h2: ({ node, ...p }: any) => <h2 className="text-2xl font-bold text-slate-800 mt-5 mb-3 border-b pb-2" {...p} />,
    h3: ({ node, ...p }: any) => <h3 className="text-xl font-bold text-slate-800 mt-4 mb-2" {...p} />,
    p:  ({ node, ...p }: any) => {
      // Helper to check if a paragraph contains a YouTube link
      const hasYouTubeLink = (n: any): boolean => {
        if (!n) return false;
        if (n.type === 'element' && n.tagName === 'a') {
          const h = n.properties?.href;
          if (typeof h === 'string' && (h.includes('youtube.com/watch?v=') || h.includes('youtu.be/'))) {
            return true;
          }
        }
        if (n.children && Array.isArray(n.children)) {
          return n.children.some(hasYouTubeLink);
        }
        return false;
      };

      if (hasYouTubeLink(node)) {
         return <div className="text-slate-700 leading-relaxed mb-4 text-[15px]" {...p} />;
      }
      return <p className="text-slate-700 leading-relaxed mb-4 text-[15px]" {...p} />;
    },
    li: ({ node, ...p }: any) => <li className="text-slate-700 mb-1" {...p} />,
    blockquote: ({ node, ...p }: any) => <blockquote className="border-l-4 border-blue-500 bg-blue-50/50 my-4 py-3 px-5 rounded-r-xl italic text-slate-700" {...p} />,
  };
}

// ═══════════════════════════════════════════════════════════════════
// YouTube Search Modal
// ═══════════════════════════════════════════════════════════════════

export function YouTubeModal({ onInsert, onClose }: { onInsert: (md: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState('');

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true); setError(''); setResults([]);
    try {
      const res = await fetch('/api/youtube-search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults(data.results || []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b bg-slate-50">
          <h3 className="font-bold text-slate-800 flex items-center gap-2"><PlayCircle className="w-4 h-4 text-red-500" /> YouTube Search</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400 hover:text-slate-700" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-2">
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search()}
              placeholder="Search for a YouTube video..."
              className="flex-1 h-10 px-4 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            <button onClick={search} disabled={loading}
              className="px-4 h-10 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Search
            </button>
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {results.map(r => (
              <button key={r.videoId} onClick={() => onInsert(`[${r.title}](https://www.youtube.com/watch?v=${r.videoId})`)}
                className="w-full flex gap-3 p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all text-left group">
                <img src={r.thumbnail} alt={r.title} className="w-20 h-[56px] rounded-lg object-cover shrink-0 bg-slate-100" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-800 line-clamp-2 group-hover:text-indigo-700">{r.title}</div>
                  <div className="text-[10px] text-slate-400 mt-1">{r.channelTitle}</div>
                </div>
                <ArrowRight className="w-4 h-4 text-indigo-400 shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
            {results.length === 0 && !loading && (
              <p className="text-center py-8 text-slate-400 text-sm">Search for a video to embed it.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Link Insert Modal (Internal + External)
// ═══════════════════════════════════════════════════════════════════

export function LinkModal({
  type, savedArticles, onInsert, onClose
}: {
  type: 'internal' | 'external';
  savedArticles: Array<{ id?: string; title: string }>;
  onInsert: (md: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'internal' | 'external'>(type);
  const [externalLinks, setExternalLinks] = useState<ExternalLink[]>([]);
  const [search, setSearch] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { getExternalLinks().then(setExternalLinks).catch(console.error); }, []);

  // Only show Published articles in internal link picker
  const filteredArticles = savedArticles.filter(a =>
    (a as any).stage === 'Published' &&
    a.title.toLowerCase().includes(search.toLowerCase())
  );
  const filteredExternal = externalLinks.filter(l =>
    (l.title || '').toLowerCase().includes(search.toLowerCase()) ||
    (l.url || '').toLowerCase().includes(search.toLowerCase())
  );

  const addExternal = async () => {
    if (!newTitle.trim() || !newUrl.trim()) return;
    setSaving(true);
    try {
      const link: ExternalLink = { id: Date.now().toString(), title: newTitle, url: newUrl, folder: 'General' };
      await saveExternalLink(link);
      setExternalLinks(prev => [...prev, link]);
      setNewTitle(''); setNewUrl('');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b bg-slate-50 shrink-0">
          <div className="flex gap-2">
            <button onClick={() => setTab('internal')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${tab === 'internal' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>
              <Link2 className="w-3 h-3 inline mr-1" />Internal
            </button>
            <button onClick={() => setTab('external')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${tab === 'external' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>
              <Globe className="w-3 h-3 inline mr-1" />External
            </button>
          </div>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400 hover:text-slate-700" /></button>
        </div>
        <div className="p-5 space-y-3 flex-1 overflow-y-auto">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${tab} links...`}
            className="w-full h-9 px-3 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400" />

          {tab === 'internal' ? (
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {filteredArticles.map(a => (
                <button key={a.id ?? a.title} onClick={() => onInsert(`[${a.title}](/blog/${a.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')})`)}
                  className="w-full text-left px-3 py-2.5 rounded-xl text-sm hover:bg-indigo-50 hover:text-indigo-800 border border-transparent hover:border-indigo-200 transition-all flex items-center gap-2">
                  <Link2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />{a.title}
                </button>
              ))}
              {filteredArticles.length === 0 && <p className="text-center py-6 text-slate-400 text-sm">No articles found.</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {filteredExternal.map(l => (
                  <button key={l.id} onClick={() => onInsert(`[${l.title}](${l.url})`)}
                    className="w-full text-left px-3 py-2.5 rounded-xl text-sm hover:bg-indigo-50 hover:text-indigo-800 border border-transparent hover:border-indigo-200 transition-all flex items-start gap-2">
                    <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <div><div className="font-medium">{l.title}</div><div className="text-[10px] text-slate-400 truncate">{l.url}</div></div>
                  </button>
                ))}
                {filteredExternal.length === 0 && <p className="text-center py-4 text-slate-400 text-sm">No external links saved.</p>}
              </div>
              <div className="border-t pt-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Add New</p>
                <div className="flex flex-col gap-2">
                  <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Link Title" className="h-8 px-3 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                  <input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://..." className="h-8 px-3 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                  <button onClick={addExternal} disabled={saving || !newTitle || !newUrl}
                    className="h-8 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                    {saving ? 'Saving…' : 'Save & Insert'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Add Section Belt
// ═══════════════════════════════════════════════════════════════════

function AddSectionBelt({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="group relative h-10 flex items-center cursor-pointer" onClick={onAdd}>
      <div className="flex-1 h-px bg-transparent group-hover:bg-indigo-200 transition-colors" />
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-200 text-xs font-bold text-indigo-600 shadow-sm whitespace-nowrap">
        <Plus className="w-3 h-3" /> Add Section
      </div>
      <div className="flex-1 h-px bg-transparent group-hover:bg-indigo-200 transition-colors" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ContextLinkPanel
// ═══════════════════════════════════════════════════════════════════

export interface PendingLink {
  keyword: string;
  anchorText: string | null;
  url: string | null;
  title?: string;
  rank?: number;
  source: 'Internal' | 'Cache' | 'SERP';
  entityType?: 'tool' | 'concept' | 'technique' | 'org';
  confidence: 'high' | 'medium';
  selected: boolean;
  resolved: boolean;
}

export function ContextLinkPanel({
  pendingLinks,
  onApply,
  onCancel,
  onUpdateLink,
  linkProgress
}: {
  pendingLinks: PendingLink[];
  onApply: () => void;
  onCancel: () => void;
  onUpdateLink: (keyword: string, updates: Partial<PendingLink>) => void;
  linkProgress: { resolved: number, total: number };
}) {
  return (
    <div className="absolute z-50 left-1/2 -translate-x-1/2 top-10 w-[500px] bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden text-sm animate-in fade-in slide-in-from-top-4">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <Link2 className="w-4 h-4 text-emerald-600" /> External Link Suggestions
        </h3>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-700">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-2 border-b bg-slate-50 flex items-center gap-3 text-xs font-medium text-slate-500">
        <span>Resolving {linkProgress.resolved} of {linkProgress.total}...</span>
        <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div 
            className="h-full bg-emerald-500 transition-all duration-300" 
            style={{ width: `${linkProgress.total ? (linkProgress.resolved / linkProgress.total) * 100 : 0}%` }}
          />
        </div>
      </div>

      <div className="max-h-[340px] overflow-y-auto p-2 space-y-1">
        {pendingLinks.length === 0 && linkProgress.total === 0 && linkProgress.resolved === 0 && (
           <div className="p-4 text-center text-slate-500 text-xs italic">Extracting keywords...</div>
        )}
        {pendingLinks.map(link => {
          const isPending = !link.resolved;
          const noAnchor = !link.anchorText;
          const noUrl = link.resolved && !link.url;

          return (
            <div key={link.keyword} className={`flex items-center gap-3 p-2 rounded-lg transition-colors hover:bg-slate-50 ${noAnchor ? 'opacity-60' : ''}`}>
              <input 
                type="checkbox" 
                checked={link.selected}
                disabled={noAnchor || isPending}
                onChange={e => onUpdateLink(link.keyword, { selected: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50"
              />
              <div className="w-36 shrink-0 truncate font-medium text-slate-800" title={link.keyword}>
                "{link.keyword}"
              </div>

              {noAnchor ? (
                <div className="flex-1 flex items-center gap-2 text-amber-600 text-xs font-semibold">
                  <span>⚠️ Not in selection</span>
                </div>
              ) : isPending ? (
                <div className="flex-1 flex items-center gap-2 text-slate-400 text-xs italic">
                  <Loader2 className="w-3 h-3 animate-spin" /> loading...
                </div>
              ) : noUrl ? (
                <div className="flex-1 flex items-center gap-2">
                  <input 
                    type="url"
                    value={link.url || ''}
                    onChange={e => onUpdateLink(link.keyword, { url: e.target.value })}
                    placeholder="Enter URL manually"
                    className="flex-1 h-7 px-2 text-xs border border-amber-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-500 bg-amber-50"
                  />
                </div>
              ) : (
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  <input 
                    type="url"
                    value={link.url || ''}
                    onChange={e => onUpdateLink(link.keyword, { url: e.target.value })}
                    title={link.url || ''}
                    className="flex-1 h-7 px-2 text-xs border border-transparent hover:border-slate-300 focus:border-emerald-400 rounded bg-transparent focus:bg-white transition-all truncate text-emerald-700"
                  />
                  {link.rank && <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">#{link.rank}</span>}
                  {link.source === 'Cache' && <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Cache</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-2 p-3 border-t bg-slate-50">
        <button onClick={onCancel} className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900">
          Cancel
        </button>
        <button 
          onClick={onApply}
          disabled={!pendingLinks.some(l => l.selected)}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm"
        >
          Apply Selected ({pendingLinks.filter(l => l.selected).length})
        </button>
      </div>
    </div>
  );
}

// Session-level SerpAPI cache
const serpSessionCache = new Map<string, any>();

// ═══════════════════════════════════════════════════════════════════
// Section Card
// ═══════════════════════════════════════════════════════════════════

function SectionCard({
  section,
  isEditing,
  isRewiting,
  highlights,
  articleTitle,
  allHeadings,
  savedArticles,
  sectionScore,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  onRewrite,
  cardRef,
  documentId,
  keywordBank,
}: {
  section: ContentSection;
  isEditing: boolean;
  isRewiting: boolean;
  highlights: HighlightData;
  articleTitle: string;
  allHeadings: string[];
  savedArticles: Array<{ id?: string; title: string }>;
  sectionScore?: number;
  onEdit: () => void;
  onSave: (level: ContentSection['level'], heading: string, body: string) => void;
  onCancel: () => void;
  onDelete: () => void;
  onRewrite: (mode: string) => void;
  cardRef: (el: HTMLDivElement | null) => void;
  documentId?: string;
  keywordBank?: any;
}) {
  const [localHeading, setLocalHeading] = useState(section.heading);
  const [localLevel, setLocalLevel] = useState(section.level);
  // localBody is stored as HTML in the editor; converted to/from markdown at boundaries
  const [localBody, setLocalBody] = useState(() => markdownToHtml(section.body));
  const [hovered, setHovered] = useState(false);
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [showYT, setShowYT] = useState(false);
  const [showLink, setShowLink] = useState<'internal' | 'external' | null>(null);
  
  // New States for SSE ContextLinkPanel
  const [pendingLinks, setPendingLinks] = useState<PendingLink[]>([]);
  const [showContextLinkPanel, setShowContextLinkPanel] = useState(false);
  const [linkProgress, setLinkProgress] = useState({ resolved: 0, total: 0 });
  const serpAbortRef = useRef<AbortController | null>(null);

  const [autoLinkStatus, setAutoLinkStatus] = useState<{ active: boolean; message: string }>({ active: false, message: '' });
  const rteRef = useRef<RichTextEditorRef>(null);

  useEffect(() => {
    setLocalHeading(section.heading);
    setLocalLevel(section.level);
    setLocalBody(markdownToHtml(section.body));
  }, [section]);

  /**
   * Called when a link modal resolves with a markdown snippet like [title](url).
   * Extracts the URL and wraps the saved selection as a hyperlink.
   * Falls back to inserting HTML if no URL can be extracted.
   */
  const insertAtCursor = (mdSnippet: string) => {
    // Try extracting URL from markdown [text](url) pattern
    const urlMatch = mdSnippet.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (urlMatch) {
      const url = urlMatch[2];
      const label = urlMatch[1]; // used as fallback if nothing was selected
      rteRef.current?.wrapSelectionAsLink(url, label);
    } else {
      // Not a markdown link — insert as HTML (e.g. raw pasted content)
      const html = markdownToHtml(mdSnippet);
      rteRef.current?.insertHtml(html);
    }
  };

  const augmented = useMemo(() => applyHighlights(section.body, highlights), [section.body, highlights]);

  // Markdown component map with YouTube URL edit handler
  // Patching the section body markdown in-place avoids entering full edit mode just for a URL swap
  const mdComponents = useMemo(() => createMdComponents(
    (oldUrl, newUrl) => {
      const updatedBody = section.body.split(oldUrl).join(newUrl);
      onSave(section.level, section.heading, updatedBody);
    }
  ), [section.body, section.level, section.heading, onSave]);

  const doEditorRewrite = async (mode: string, selectedHtml?: string, selectionId?: string) => {
    if (!selectedHtml) {
      onRewrite(mode);
    } else {
      try {
        const selectedMarkdown = htmlToMarkdown(selectedHtml);
        const res = await fetch('/api/rewrite-section', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            heading: section.heading,
            body: section.body,
            mode,
            articleTitle,
            allHeadings,
            selectedText: selectedMarkdown,
          }),
        });
        const data = await res.json();
        if (data.rewritten) {
          const newHtml = markdownToHtml(data.rewritten);
          rteRef.current?.replaceElementWithHtml(selectionId!, newHtml);
        } else {
          rteRef.current?.unwrapElement(selectionId!);
        }
      } catch (e) {
        console.error('Partial rewrite failed', e);
        rteRef.current?.unwrapElement(selectionId!);
      }
    }
  };

  const handleAutoLink = async (selectedHtml?: string) => {
    // Reset and open panel
    setPendingLinks([]);
    setLinkProgress({ resolved: 0, total: 0 });
    setShowContextLinkPanel(true);

    if (serpAbortRef.current) {
        serpAbortRef.current.abort();
    }
    serpAbortRef.current = new AbortController();
    const signal = serpAbortRef.current.signal;

    try {
      const targetHtml = selectedHtml || localBody;
      const targetText = htmlToMarkdown(targetHtml).replace(/<[^>]+>/g, '').substring(0, 2000);

      const res = await fetch('/api/extract-link-keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedText: targetText, documentId: documentId || '', keywordBank }),
        signal
      });

      if (!res.body) throw new Error('No body returned');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      let currentLinks: PendingLink[] = [];

      const updateRow = (keyword: string, updates: Partial<PendingLink>) => {
          setPendingLinks(prev => {
              const clone = [...prev];
              const idx = clone.findIndex(l => l.keyword === keyword);
              if (idx !== -1) clone[idx] = { ...clone[idx], ...updates };
              return clone;
          });
      };

      const fetchWithConcurrencyLimit = async (keywords: PendingLink[], limit = 2) => {
          const queue = [...keywords];
          const runNext = async (): Promise<void> => {
              if (signal.aborted) return;
              if (!queue.length) return;
              const item = queue.shift()!;
              try {
                  let result;
                  if (serpSessionCache.has(item.keyword)) {
                      result = serpSessionCache.get(item.keyword);
                  } else {
                      const serpRes = await fetch('/api/serp-preview', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ keyword: item.keyword }),
                          signal
                      });
                      const serpData = await serpRes.json();
                      if (serpData.results && serpData.results.length > 0) {
                          result = serpData.results.find((r: any) => !r.link.includes(window.location.hostname));
                      }
                      if (result) serpSessionCache.set(item.keyword, result);
                  }

                  if (result && !signal.aborted) {
                      updateRow(item.keyword, {
                          url: result.link,
                          title: result.title,
                          rank: result.position,
                          resolved: true
                      });
                  } else if (!signal.aborted) {
                      updateRow(item.keyword, { resolved: true, url: null, selected: false });
                  }
              } catch {
                  if (!signal.aborted) updateRow(item.keyword, { resolved: true, url: null, selected: false });
              } finally {
                  if (!signal.aborted) {
                      setLinkProgress(p => ({ ...p, resolved: p.resolved + 1 }));
                      return runNext();
                  }
              }
          };
          await Promise.all(Array.from({ length: limit }, runNext));
      };

      const pendingSerpFetches: PendingLink[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        
        const lines = buffer.split('\\n\\n');
        buffer = lines.pop() || ''; // Keep the last incomplete chunk
        
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = JSON.parse(line.substring(6));
                
                if (data.type === 'cache') {
                    const newLink: PendingLink = {
                        keyword: data.keyword,
                        anchorText: data.anchorText,
                        url: data.url,
                        title: data.title,
                        source: 'Cache',
                        confidence: 'high',
                        selected: !!data.anchorText,
                        resolved: true
                    };
                    currentLinks.push(newLink);
                    setPendingLinks([...currentLinks]);
                    setLinkProgress(p => ({ total: p.total + 1, resolved: p.resolved + 1 }));
                } else if (data.type === 'keyword') {
                    const newLink: PendingLink = {
                        keyword: data.keyword,
                        anchorText: data.anchorText,
                        url: null,
                        source: 'SERP',
                        entityType: data.entityType,
                        confidence: data.confidence,
                        selected: !!data.anchorText && data.confidence === 'high',
                        resolved: false
                    };
                    currentLinks.push(newLink);
                    setPendingLinks([...currentLinks]);
                    setLinkProgress(p => ({ ...p, total: p.total + 1 }));
                    pendingSerpFetches.push(newLink);
                } else if (data.type === 'done') {
                    // Start fetching all pending
                    fetchWithConcurrencyLimit(pendingSerpFetches);
                }
            }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
          console.error('Auto-link failed', e);
          setLinkProgress(p => ({ ...p, resolved: p.total }));
      }
    }
  };

  const handleApplyContextLinks = async () => {
    const selected = pendingLinks.filter(r => r.selected && r.url && r.anchorText);
    const { saveExternalLink } = await import('@/lib/firebase/firestore');

    for (const row of selected) {
      rteRef.current?.injectLinkIntoHTML(row.anchorText!, row.url!);
      if (row.source === 'SERP') {
        await saveExternalLink({ title: row.keyword, url: row.url!, folder: 'Auto-Linked' });
      }
    }

    setShowContextLinkPanel(false);
    setPendingLinks([]);
  };

  const handleCancelContextLinks = () => {
    if (serpAbortRef.current) serpAbortRef.current.abort();
    setShowContextLinkPanel(false);
    setPendingLinks([]);
  };

  const headingTag = section.level === 'h1' ? 'text-3xl font-extrabold' :
                     section.level === 'h2' ? 'text-2xl font-bold' :
                     'text-xl font-semibold';

  return (
    <div
      ref={cardRef}
      className={`relative rounded-2xl border transition-all duration-200 ${
        isRewiting ? 'animate-pulse ring-2 ring-violet-400 bg-violet-50/50 shadow-md border-transparent' :
        isEditing ? 'border-indigo-300 bg-indigo-50/30 shadow-md' :
        hovered ? 'border-slate-200 bg-white shadow-sm' : 'border-transparent bg-transparent'
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setRewriteOpen(false); }}
      onDoubleClick={() => { if (!isEditing) onEdit(); }}
    >
      {/* Hover Toolbar */}
      {hovered && !isEditing && (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 animate-in fade-in duration-150">
          <button onClick={onEdit}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 shadow-sm transition-colors">
            <Pencil className="w-3 h-3" /> Edit
          </button>
          <div className="relative">
            <button onClick={() => setRewriteOpen(!rewriteOpen)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 shadow-sm transition-colors">
              <Sparkles className="w-3 h-3" /> <ChevronDown className="w-3 h-3" />
            </button>
            {rewriteOpen && (
              <div className="absolute top-full right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 overflow-hidden w-44">
                {[
                  { mode: 'similar', label: '↔ Rewrite (Same Size)', default: true },
                  { mode: 'elaborate', label: '↕ Elaborate' },
                  { mode: 'shorten', label: '↤ Shorten' },
                ].map(opt => (
                  <button key={opt.mode} onClick={() => { setRewriteOpen(false); onRewrite(opt.mode); }}
                    className="w-full text-left px-4 py-2.5 text-xs hover:bg-violet-50 hover:text-violet-800 transition-colors flex items-center justify-between">
                    {opt.label}
                    {opt.default && <span className="text-[9px] text-slate-400 font-bold bg-slate-100 px-1.5 py-0.5 rounded">DEFAULT</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={onDelete}
            className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors shadow-sm">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Rewriting Overlay */}
      {isRewiting && (
        <div className="absolute inset-0 z-20 rounded-2xl bg-white/60 backdrop-blur-[2px] flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-violet-700 bg-white/90 px-6 py-4 rounded-xl shadow-lg border border-violet-100">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm font-semibold">Rewriting with AI…</span>
          </div>
        </div>
      )}

      {/* Auto-Link Overlay */}
      {autoLinkStatus.active && (
        <div className="absolute inset-0 z-20 rounded-2xl bg-white/60 backdrop-blur-[2px] flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-emerald-700 bg-white/90 px-6 py-4 rounded-xl shadow-lg border border-emerald-100">
            {autoLinkStatus.message.includes('Extracting') || autoLinkStatus.message.includes('Linking') ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <Sparkles className="w-6 h-6" />
            )}
            <span className="text-sm font-semibold">{autoLinkStatus.message}</span>
          </div>
        </div>
      )}

      {/* ── Preview Mode ── */}
      {!isEditing ? (
        <div className="px-6 py-5">
          {/* Heading row with optional section score badge */}
          <div className="flex items-center gap-2 mb-3">
            <span className={`${headingTag} text-slate-900 flex-1`}>{section.heading}</span>
            {sectionScore !== undefined && (
              <span
                title="Section SEO Coverage Score"
                className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  sectionScore >= 80
                    ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                    : sectionScore >= 50
                    ? 'bg-amber-100 text-amber-700 border-amber-300'
                    : 'bg-red-100 text-red-700 border-red-300'
                }`}
              >
                {sectionScore >= 80 ? '✅' : sectionScore >= 50 ? '⚠️' : '❌'} {sectionScore}%
              </span>
            )}
          </div>
          {section.body ? (
            <div className="prose prose-slate max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={mdComponents}>
                {augmented}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="italic text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl p-4 text-center">
              Empty section — double-click or hover to edit or generate content.
            </div>
          )}
        </div>
      ) : (
        /* ── Edit Mode ── */
        <div className="p-5 space-y-4">
          {/* Heading row */}
          <div className="flex items-center gap-3">
            {/* Level picker */}
            <div className="flex bg-white rounded-lg p-0.5 border border-slate-200 shadow-sm shrink-0">
              {(['h1', 'h2', 'h3'] as const).map(lv => (
                <button key={lv} onClick={() => setLocalLevel(lv)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${localLevel === lv ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                  {lv.toUpperCase()}
                </button>
              ))}
            </div>
            <input
              value={localHeading}
              onChange={e => setLocalHeading(e.target.value)}
              placeholder="Heading..."
              className="flex-1 h-10 px-4 text-base font-bold rounded-xl border border-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
            />
          </div>

          {/* Rich Text Editor */}
          <div className="relative">
            {showContextLinkPanel && (
                <ContextLinkPanel 
                    pendingLinks={pendingLinks}
                    onApply={handleApplyContextLinks}
                    onCancel={handleCancelContextLinks}
                    onUpdateLink={(kw, updates) => {
                        setPendingLinks(prev => {
                            const clone = [...prev];
                            const idx = clone.findIndex(l => l.keyword === kw);
                            if (idx !== -1) clone[idx] = { ...clone[idx], ...updates };
                            return clone;
                        });
                    }}
                    linkProgress={linkProgress}
                />
            )}
            <RichTextEditor
              ref={rteRef}
              value={localBody}
              onChange={setLocalBody}
              placeholder="Write content here… or use AI to generate."
              onInsertYouTube={() => setShowYT(true)}
              onInsertInternalLink={() => setShowLink('internal')}
              onInsertExternalLink={() => setShowLink('external')}
              onRewrite={doEditorRewrite}
              onAutoLink={handleAutoLink}
              isRewiting={isRewiting}
            />
            {/* AI Generate button when empty */}
            {!localBody.replace(/<[^>]*>/g, '').trim() && (
              <button onClick={() => onRewrite('generate')}
                className="absolute bottom-4 right-4 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 transition-colors shadow-lg z-10">
                <WandSparkles className="w-3.5 h-3.5" /> Generate with AI
              </button>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 border-t pt-3">
            <button
              onClick={() => {
                // Convert HTML → markdown before saving so storage format is unchanged
                const markdown = htmlToMarkdown(localBody);
                onSave(localLevel, localHeading, markdown);
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors shadow-sm">
              <Check className="w-4 h-4" /> Save
            </button>
            <button onClick={onCancel}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors">
              <X className="w-4 h-4" /> Cancel
            </button>
            <span className="text-[10px] text-slate-400 ml-auto">⌘B bold · ⌘I italic</span>
          </div>
        </div>
      )}

      {/* Modals */}
      {showYT && (
        <YouTubeModal
          onInsert={md => { insertAtCursor(md); setShowYT(false); }}
          onClose={() => setShowYT(false)}
        />
      )}
      {showLink && (
        <LinkModal
          type={showLink}
          savedArticles={savedArticles}
          onInsert={md => { insertAtCursor(md); setShowLink(null); }}
          onClose={() => setShowLink(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Main SectionEditor (forwardRef)
// ═══════════════════════════════════════════════════════════════════

export const SectionEditor = forwardRef<DetectorEditorRef, SectionEditorProps>(
  function SectionEditor({ markdown, highlights, onSave, articleTitle = '', savedArticles = [], sectionScores, documentId, keywordBank }, ref) {

    const [sections, setSections] = useState<ContentSection[]>([]);
    const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
    const [rewritingSectionId, setRewritingSectionId] = useState<string | null>(null);
    const [autoSplit, setAutoSplit] = useState(false);

    const sectionsRef = useRef<ContentSection[]>([]);
    const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const containerRef = useRef<HTMLDivElement>(null);
    // Guard against re-parsing markdown that we ourselves just emitted via onSave
    const lastEmittedMarkdown = useRef<string>('');

    // Parse markdown → sections on mount / change
    // Skip re-parse if the markdown prop change was caused by our own commit (prevents section wipe)
    useEffect(() => {
      if (markdown === lastEmittedMarkdown.current) return;
      const parsed = parseMarkdown(markdown);
      setSections(parsed);
      sectionsRef.current = parsed;
      // Detect if we fell back to paragraph-split (headings like "Part 1", "Part 2"…)
      const hasHeadings = parsed.some(s =>
        !s.heading.startsWith('Part ') && s.heading !== 'Introduction' && s.heading !== 'Content'
      );
      setAutoSplit(!hasHeadings && parsed.length > 1);
    }, [markdown]);

    // Keep ref in sync
    useEffect(() => { sectionsRef.current = sections; }, [sections]);

    const commit = useCallback((updated: ContentSection[]) => {
      setSections(updated);
      sectionsRef.current = updated;
      if (onSave) {
        const md = sectionsToMarkdown(updated);
        lastEmittedMarkdown.current = md;
        onSave(md);
      }
    }, [onSave]);

    const updateSection = useCallback((id: string, level: ContentSection['level'], heading: string, body: string) => {
      commit(sectionsRef.current.map(s => s.id === id ? { ...s, level, heading, body } : s));
      setActiveSectionId(null);
    }, [commit]);

    const deleteSection = useCallback((id: string) => {
      commit(sectionsRef.current.filter(s => s.id !== id));
      setActiveSectionId(null);
    }, [commit]);

    const insertSectionAfter = useCallback((afterId: string) => {
      // Use a placeholder heading so the section survives markdown round-trips
      const newSec: ContentSection = { id: uid(), level: 'h2', heading: 'New Section', body: '' };
      const list = sectionsRef.current;
      const idx = list.findIndex(s => s.id === afterId);
      const updated = [...list.slice(0, idx + 1), newSec, ...list.slice(idx + 1)];
      commit(updated);
      // Open the new section for editing after state settles
      setTimeout(() => {
        setActiveSectionId(newSec.id);
        // Scroll the new card into view
        setTimeout(() => {
          const card = cardRefs.current[newSec.id];
          card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 80);
      }, 50);
    }, [commit]);

    const handleRewrite = useCallback(async (sectionId: string, mode: string) => {
      const section = sectionsRef.current.find(s => s.id === sectionId);
      if (!section) return;
      const allHeadings = sectionsRef.current.map(s => s.heading).filter(Boolean);
      setRewritingSectionId(sectionId);
      try {
        const res = await fetch('/api/rewrite-section', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            heading: section.heading,
            body: section.body,
            mode,
            articleTitle,
            allHeadings,
          }),
        });
        const data = await res.json();
        if (data.rewritten) {
          const updated = sectionsRef.current.map(s =>
            s.id === sectionId ? { ...s, body: data.rewritten } : s
          );
          commit(updated);
        }
      } catch (e) {
        console.error('Rewrite failed', e);
      } finally {
        setRewritingSectionId(null);
      }
    }, [articleTitle, commit]);

    // Imperative API
    useImperativeHandle(ref, () => ({
      scrollToPhrase(phrase: string) {
        const section = sectionsRef.current.find(s =>
          s.body.toLowerCase().includes(phrase.toLowerCase())
        );
        if (!section) return;
        const card = cardRefs.current[section.id];
        if (card && containerRef.current) {
          const cRect = containerRef.current.getBoundingClientRect();
          const tRect = card.getBoundingClientRect();
          containerRef.current.scrollTo({
            top: tRect.top - cRect.top + containerRef.current.scrollTop - 80,
            behavior: 'smooth',
          });
          card.style.outline = '3px solid #7c3aed';
          card.style.outlineOffset = '2px';
          setTimeout(() => { card.style.outline = ''; card.style.outlineOffset = ''; }, 2000);
        }
      },
      applyFix(phrase: string, replacement: string) {
        // Replace in the raw markdown body (source of truth)
        const updated = sectionsRef.current.map(s => ({
          ...s, body: s.body.replace(phrase, replacement),
        }));
        commit(updated);
      },
      insertTerm(term: string) {
        const updated = [...sectionsRef.current];
        if (updated.length > 0) {
          const src = updated[0].body;
          const paraEnd = src.indexOf('\n\n');
          const at = paraEnd > 0 ? paraEnd : src.length;
          updated[0] = { ...updated[0], body: src.slice(0, at) + ' ' + term + src.slice(at) };
        }
        commit(updated);
      },
    }));

    const allHeadings = sections.map(s => s.heading).filter(Boolean);

    return (
      <div className="flex flex-col h-full bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-3 border-b bg-slate-50/80 sticky top-0 z-10 backdrop-blur-md shrink-0">
          <div className="text-sm font-semibold text-slate-700">
            Section Editor
            <span className="ml-2 text-[11px] text-slate-400 font-normal">
              {sections.length} section{sections.length !== 1 ? 's' : ''} · Double-click to edit
            </span>
            {autoSplit && (
              <span className="ml-2 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                ⚡ Auto-split – no headings found
              </span>
            )}
          </div>
          {activeSectionId && (
            <button onClick={() => setActiveSectionId(null)}
              className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1">
              <X className="w-3.5 h-3.5" /> Exit Edit
            </button>
          )}
        </div>

        {/* Sections */}
        <div className="flex-1 overflow-y-auto px-6 py-4 pb-10 space-y-1" ref={containerRef}>
          {sections.map((section, idx) => (
            <div key={section.id}>
              <SectionCard
                section={section}
                isEditing={activeSectionId === section.id}
                isRewiting={rewritingSectionId === section.id}
                highlights={highlights}
                articleTitle={articleTitle}
                allHeadings={allHeadings}
                savedArticles={savedArticles}
                sectionScore={sectionScores?.[section.id]}
                onEdit={() => setActiveSectionId(section.id)}
                onSave={(level, heading, body) => updateSection(section.id, level, heading, body)}
                onCancel={() => setActiveSectionId(null)}
                onDelete={() => deleteSection(section.id)}
                onRewrite={(mode: string) => handleRewrite(section.id, mode)}
                cardRef={(el) => { cardRefs.current[section.id] = el; }}
                documentId={documentId}
                keywordBank={keywordBank}
              />
              {idx < sections.length - 1 && (
                <AddSectionBelt onAdd={() => insertSectionAfter(section.id)} />
              )}
            </div>
          ))}
          {sections.length > 0 && (
            <AddSectionBelt onAdd={() => insertSectionAfter(sections[sections.length - 1].id)} />
          )}
        </div>
      </div>
    );
  }
);
