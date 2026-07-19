import { useState, useMemo, useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { Eye, Edit2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

export interface HighlightData {
  positives: string[];
  weakCopyItems: { phrase: string; improvement: string }[];
  semanticMatches: string[];
}

export interface DetectorEditorRef {
  scrollToPhrase: (phrase: string) => void;
  applyFix: (phrase: string, replacement: string) => void;
  insertTerm: (term: string) => void;
}

export const DetectorHighlightEditor = forwardRef<DetectorEditorRef, {
  text: string;
  highlights: HighlightData;
  onSave?: (val: string) => void;
}>(function DetectorHighlightEditor({ text, highlights, onSave }, ref) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(text);

  // Always-fresh ref for the latest text prop — fixes stale closure in applyFix/insertTerm
  const latestText = useRef(text);
  useEffect(() => {
    latestText.current = text;
    // Keep edit textarea in sync only when not actively editing
    if (!isEditing) setEditValue(text);
  }, [text, isEditing]);

  // Scroll container ref (the scrollable div wrapping both modes)
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Preserve scroll position when toggling modes so user stays at the same place
  const savedScrollTop = useRef(0);

  const enterEditMode = useCallback(() => {
    savedScrollTop.current = scrollContainerRef.current?.scrollTop ?? 0;
    setIsEditing(true);
  }, []);

  const exitEditMode = useCallback((save: boolean) => {
    savedScrollTop.current = scrollContainerRef.current?.scrollTop ?? 0;
    if (save && editValue !== latestText.current && onSave) onSave(editValue);
    setIsEditing(false);
  }, [editValue, onSave]);

  // After switching to preview, restore the scroll position
  useEffect(() => {
    if (!isEditing && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = savedScrollTop.current;
    }
  }, [isEditing]);

  // ── Imperative API ────────────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    scrollToPhrase(phrase: string) {
      // Stay in or switch to preview mode; never go to edit mode
      setIsEditing(false);
      // Give React a tick to render marks, then search
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const container = scrollContainerRef.current;
          if (!container) return;
          const marks = Array.from(container.querySelectorAll('mark[data-phrase]')) as HTMLElement[];
          const target = marks.find(m =>
            (m.dataset.phrase || '').toLowerCase() === phrase.toLowerCase() ||
            (m.textContent || '').toLowerCase().includes(phrase.toLowerCase())
          );
          if (target) {
            // Manually scroll within the container (scrollIntoView scrolls the page)
            const containerRect = container.getBoundingClientRect();
            const targetRect = target.getBoundingClientRect();
            const offset = targetRect.top - containerRect.top + container.scrollTop;
            container.scrollTo({ top: offset - container.clientHeight / 2 + target.offsetHeight / 2, behavior: 'smooth' });
            // Flash highlight ring
            target.style.outline = '3px solid #7c3aed';
            target.style.outlineOffset = '2px';
            setTimeout(() => { target.style.outline = ''; target.style.outlineOffset = ''; }, 2000);
          }
        });
      });
    },

    applyFix(phrase: string, replacement: string) {
      // Never enter edit mode — modify text in place and stay in preview
      const updated = latestText.current.replace(phrase, replacement);
      latestText.current = updated;
      setEditValue(updated);
      if (onSave) onSave(updated);
      // Do NOT call setIsEditing
    },

    insertTerm(term: string) {
      // Insert after the first paragraph and stay in preview
      const src = latestText.current;
      const paraEnd = src.indexOf('\n\n');
      const insertAt = paraEnd > 0 ? paraEnd : src.length;
      const updated = src.slice(0, insertAt) + ' ' + term + src.slice(insertAt);
      latestText.current = updated;
      setEditValue(updated);
      if (onSave) onSave(updated);
      // Do NOT call setIsEditing
    }
  }));

  // ── Augmented Markdown (inject highlights as <mark> before parsing) ──────────
  const augmentedMarkdown = useMemo(() => {
    if (!highlights ||
      (!highlights.weakCopyItems?.length &&
       !highlights.positives?.length &&
       !highlights.semanticMatches?.length)) {
      return text;
    }

    let result = text;
    const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const injectMark = (phrase: string, className: string, title?: string) => {
      if (!phrase?.trim()) return;
      try {
        const escaped = escapeRegExp(phrase);
        // Simple word-boundary aware replace; avoids replacing inside HTML tags already injected
        const regex = new RegExp(`(${escaped})`, 'gi');
        const dataPhrase = phrase.replace(/"/g, '&quot;');
        const t = title ? ` title="${title.replace(/"/g, '&quot;')}"` : '';
        result = result.replace(regex, (match) =>
          `<mark class="${className}"${t} data-phrase="${dataPhrase}">${match}</mark>`
        );
      } catch { /* skip malformed phrases */ }
    };

    // 1. Weak copy — violet
    highlights.weakCopyItems?.forEach(item => {
      injectMark(item.phrase,
        'bg-violet-200 text-violet-900 rounded cursor-help border-b-2 border-violet-400 font-medium',
        `Suggestion: ${item.improvement}`
      );
    });

    // 2. Positives — emerald
    highlights.positives?.forEach(phrase => {
      injectMark(phrase, 'bg-emerald-200 text-emerald-900 rounded font-medium');
    });

    // 3. Semantic matches — underline
    highlights.semanticMatches?.forEach(phrase => {
      injectMark(phrase, 'underline decoration-emerald-500 decoration-2 underline-offset-4');
    });

    return result;
  }, [text, highlights]);

  // ── Markdown component overrides ─────────────────────────────────────────────
  const markdownComponents: any = {
    a: ({ href, children, ...props }: any) => {
      if (href?.includes('youtube.com/watch?v=')) {
        try {
          const videoId = new URL(href).searchParams.get('v');
          if (videoId) return (
            <div className="my-6 border rounded-xl overflow-hidden shadow-sm bg-slate-50">
              <div className="bg-indigo-600/10 px-4 py-2 border-b flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-700">🎬 YouTube Resource</span>
                <a href={href} target="_blank" rel="noreferrer" className="text-[10px] text-indigo-600 hover:underline">Open →</a>
              </div>
              <div className="relative w-full aspect-video">
                <iframe className="absolute inset-0 w-full h-full border-0"
                  src={`https://www.youtube.com/embed/${videoId}`}
                  title="YouTube video player"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen />
              </div>
            </div>
          );
        } catch {}
      }
      return <a href={href} className="text-blue-600 hover:text-blue-800 underline decoration-blue-200 underline-offset-2 font-medium transition-colors" target="_blank" rel="noreferrer" {...props}>{children}</a>;
    },
    h1: ({ node, ...p }: any) => <h1 className="text-3xl font-extrabold text-slate-900 mt-8 mb-4 tracking-tight" {...p} />,
    h2: ({ node, ...p }: any) => <h2 className="text-2xl font-bold text-slate-800 mt-8 mb-4 border-b pb-2" {...p} />,
    h3: ({ node, ...p }: any) => <h3 className="text-xl font-bold text-slate-800 mt-6 mb-3" {...p} />,
    p:  ({ node, ...p }: any) => <p className="text-slate-700 leading-relaxed mb-5 text-[15px]" {...p} />,
    li: ({ node, ...p }: any) => <li className="text-slate-700 mb-1" {...p} />,
    blockquote: ({ node, ...p }: any) => <blockquote className="border-l-4 border-blue-500 bg-blue-50/50 my-6 py-3 px-5 rounded-r-xl italic text-slate-700 shadow-sm" {...p} />,
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-slate-50/80 sticky top-0 z-10 backdrop-blur-md shrink-0">
        <div className="text-sm font-semibold text-slate-700">
          {isEditing ? 'Editing — Markdown' : 'Preview & Review'}
        </div>
        <div className="flex bg-white rounded-lg p-0.5 shadow-sm border border-slate-200">
          <button
            onClick={() => exitEditMode(true)}
            className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-1.5 transition-all ${!isEditing ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Eye className="w-3.5 h-3.5" /> Preview
          </button>
          <button
            onClick={enterEditMode}
            className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-1.5 transition-all ${isEditing ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Edit2 className="w-3.5 h-3.5" /> Edit
          </button>
        </div>
      </div>

      {/* Shared scroll container — same DOM node regardless of mode to preserve scroll */}
      <div className="flex-1 overflow-y-auto w-full" ref={scrollContainerRef}>
        {isEditing ? (
          <div className="p-6">
            <textarea
              autoFocus
              className="w-full min-h-[600px] p-4 text-base leading-relaxed rounded-xl border border-indigo-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 bg-slate-50/50 resize-none shadow-inner font-mono text-sm"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={() => {
                if (editValue !== latestText.current && onSave) onSave(editValue);
              }}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  setEditValue(latestText.current);
                  exitEditMode(false);
                }
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  exitEditMode(true);
                }
              }}
            />
            <div className="text-xs text-slate-400 mt-3 flex items-center justify-between">
              <span>Editing raw Markdown.</span>
              <span>
                <kbd className="bg-slate-200 px-1 py-0.5 rounded">Cmd/Ctrl</kbd>
                {' '}+{' '}
                <kbd className="bg-slate-200 px-1 py-0.5 rounded">Enter</kbd>
                {' '}to save & preview
              </span>
            </div>
          </div>
        ) : (
          <div
            className="p-8 md:p-12 pb-16 prose prose-slate max-w-4xl mx-auto select-text"
            onDoubleClick={e => {
              // Save scroll position BEFORE switching
              savedScrollTop.current = scrollContainerRef.current?.scrollTop ?? 0;
              setIsEditing(true);
              // Prevent bubble so we don't also fire on parent
              e.stopPropagation();
            }}
          >
            {augmentedMarkdown ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={markdownComponents}
              >
                {augmentedMarkdown}
              </ReactMarkdown>
            ) : (
              <p className="text-slate-400 italic text-center py-20">No content provided.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
