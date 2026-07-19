'use client';

import {
  useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle,
} from 'react';
import {
  Bold, Italic, List, ListOrdered, PlayCircle, Globe, Heading2, Heading3,
  Sparkles, ChevronDown, Link2,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export interface RichTextEditorRef {
  /** Insert raw HTML at the current cursor position */
  insertHtml: (html: string) => void;
  /** Wrap the currently saved selection as a hyperlink */
  wrapSelectionAsLink: (url: string, fallbackLabel?: string) => void;
  /** Replace phrases (for weak-copy fixes) */
  replaceText: (from: string, to: string) => void;
  /** Replace a specific element's outerHTML by its ID */
  replaceElementWithHtml: (id: string, newHtml: string) => void;
  /** Remove a specific element wrapper by its ID, keeping its inner contents */
  unwrapElement: (id: string) => void;
  /** Safely injects a link into the HTML using TreeWalker to avoid breaking existing links */
  injectLinkIntoHTML: (keyword: string, url: string) => void;
  /** Focus the editor */
  focus: () => void;
}

interface RichTextEditorProps {
  /** Initial HTML value */
  value: string;
  /** Called on every content change with updated HTML */
  onChange: (html: string) => void;
  /** Placeholder text when empty */
  placeholder?: string;
  /** Called when user clicks "Internal Link" toolbar button — selection is pre-saved */
  onInsertInternalLink?: () => void;
  /** Called when user clicks "External Link" toolbar button — selection is pre-saved */
  onInsertExternalLink?: () => void;
  /** Called when user clicks "YouTube" toolbar button — selection is pre-saved */
  onInsertYouTube?: () => void;
  /** Called when user requests an AI rewrite with the given mode */
  onRewrite?: (mode: string, selectedHtml?: string, selectionId?: string) => void;
  /** Called when user clicks "Auto-Link" toolbar button */
  onAutoLink?: (selectedHtml?: string) => void;
  /** True while an AI rewrite is in progress */
  isRewiting?: boolean;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════
// Toolbar Button
// ═══════════════════════════════════════════════════════════════════

function ToolBtn({
  icon, label, onClick, active = false, className = '',
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      onMouseDown={(e) => {
        e.preventDefault(); // keep editor focus & preserve selection
        onClick();
      }}
      className={`
        flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold
        transition-all duration-150 shrink-0
        ${active
          ? 'bg-indigo-600 text-white shadow-sm'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-indigo-50'
        }
        ${className}
      `}
    >
      {icon}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-slate-200 shrink-0 mx-0.5" />;
}

// ═══════════════════════════════════════════════════════════════════
// Link button — saves selection THEN calls callback
// ═══════════════════════════════════════════════════════════════════

function LinkBtn({
  icon, label, onSaveAndCall, savedRange,
}: {
  icon: React.ReactNode;
  label: string;
  onSaveAndCall: () => void;
  savedRange: React.MutableRefObject<Range | null>;
}) {
  return (
    <button
      type="button"
      title={label}
      onMouseDown={(e) => {
        e.preventDefault(); // must prevent default FIRST so selection is still intact
        // Save the current selection before the modal opens & editor loses focus
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          savedRange.current = sel.getRangeAt(0).cloneRange();
        } else {
          savedRange.current = null;
        }
        onSaveAndCall();
      }}
      className="
        flex items-center gap-1 px-2.5 h-8 rounded-lg text-xs font-semibold
        transition-all duration-150 shrink-0
        text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200
        hover:border-indigo-300 active:bg-indigo-200
      "
    >
      {icon}
      <span className="text-[11px]">{label}</span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════

export const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(
  function RichTextEditor({
    value,
    onChange,
    placeholder = 'Write content here…',
    onInsertInternalLink,
    onInsertExternalLink,
    onInsertYouTube,
    onRewrite,
    onAutoLink,
    isRewiting = false,
    className = '',
  }, ref) {
    const editorRef = useRef<HTMLDivElement>(null);
    const isComposing = useRef(false);
    const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());
    const [rewriteOpen, setRewriteOpen] = useState(false);

    // Saved selection range — captured before link modals open
    const savedRange = useRef<Range | null>(null);

    // Sync value → DOM only when value changes externally (not during editing)
    const lastEmittedHtml = useRef<string>(value);
    useEffect(() => {
      if (!editorRef.current) return;
      if (value !== lastEmittedHtml.current) {
        editorRef.current.innerHTML = value;
        lastEmittedHtml.current = value;
      }
    }, [value]);

    // Set initial content
    useEffect(() => {
      if (editorRef.current && editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Notify parent of changes
    const emitChange = useCallback(() => {
      if (!editorRef.current) return;
      const html = editorRef.current.innerHTML;
      if (html !== lastEmittedHtml.current) {
        lastEmittedHtml.current = html;
        onChange(html);
      }
    }, [onChange]);

    // Update active format state on selection change
    const syncFormats = useCallback(() => {
      const active = new Set<string>();
      if (document.queryCommandState('bold')) active.add('bold');
      if (document.queryCommandState('italic')) active.add('italic');
      if (document.queryCommandState('insertUnorderedList')) active.add('ul');
      if (document.queryCommandState('insertOrderedList')) active.add('ol');
      setActiveFormats(active);
    }, []);

    // ── Formatting commands ──

    const exec = useCallback((cmd: string, val?: string) => {
      editorRef.current?.focus();
      document.execCommand(cmd, false, val);
      emitChange();
      syncFormats();
    }, [emitChange, syncFormats]);

    const insertHeading = useCallback((tag: 'h2' | 'h3') => {
      editorRef.current?.focus();
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const block = document.createElement(tag);
      block.appendChild(range.extractContents());
      range.insertNode(block);
      range.setStartAfter(block);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      emitChange();
    }, [emitChange]);

    // ── Imperative handle ──

    useImperativeHandle(ref, () => ({
      insertHtml(html: string) {
        editorRef.current?.focus();
        document.execCommand('insertHTML', false, html);
        emitChange();
      },

      /**
       * Wrap the previously saved selection as a hyperlink.
       * If no selection was saved, insert fallbackLabel (or URL) as a new link.
       */
      wrapSelectionAsLink(url: string, fallbackLabel?: string) {
        editorRef.current?.focus();

        if (savedRange.current && !savedRange.current.collapsed) {
          // Restore the saved selection and wrap it
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(savedRange.current);
          document.execCommand('createLink', false, url);
          // Patch attributes on newly created links (createLink doesn't set target/class)
          editorRef.current?.querySelectorAll(`a[href="${url}"]`).forEach((a) => {
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener noreferrer');
            a.classList.add('rte-link');
          });
        } else {
          // No selection — insert a new anchor with label text
          const label = fallbackLabel || url;
          document.execCommand('insertHTML', false,
            `<a href="${url}" target="_blank" rel="noopener noreferrer" class="rte-link">${label}</a>`);
        }

        savedRange.current = null;
        emitChange();
      },

      replaceText(from: string, to: string) {
        if (!editorRef.current) return;
        editorRef.current.innerHTML = editorRef.current.innerHTML.replace(
          new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
          to,
        );
        emitChange();
      },

      replaceElementWithHtml(id: string, newHtml: string) {
        const el = editorRef.current?.querySelector(`#${id}`);
        if (el) {
          el.outerHTML = newHtml;
          emitChange();
        }
      },

      unwrapElement(id: string) {
        const el = editorRef.current?.querySelector(`#${id}`);
        if (el) {
          el.outerHTML = el.innerHTML;
          emitChange();
        }
      },

      injectLinkIntoHTML(keyword: string, url: string) {
        if (!editorRef.current) return;
        const html = editorRef.current.innerHTML;
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
        let node: Text | null;
        
        const escKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`\\b${escKeyword}\\b`, 'i');
        const safePattern = new RegExp(escKeyword, 'i');

        let safeUrl = url;
        try {
          const parsed = new URL(url);
          if (parsed.protocol === 'javascript:' || parsed.protocol === 'vbscript:') safeUrl = '#';
        } catch(e) {
          safeUrl = encodeURI(url);
        }

        while ((node = walker.nextNode() as Text)) {
          if (node.parentElement?.closest('a')) continue;
          
          let matchPattern = pattern;
          if (!matchPattern.test(node.textContent || '')) {
             if (safePattern.test(node.textContent || '')) matchPattern = safePattern;
             else continue;
          }
          
          const newHTML = node.textContent!.replace(
            matchPattern,
            `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="rte-link">$&</a>`
          );
          const span = doc.createElement('span');
          span.innerHTML = newHTML;
          node.replaceWith(...Array.from(span.childNodes));
          break; // replaceFirst
        }
        
        editorRef.current.innerHTML = doc.body.innerHTML;
        emitChange();
      },

      focus() { editorRef.current?.focus(); },
    }));

    // ── Keyboard shortcuts ──

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'b') { e.preventDefault(); exec('bold'); }
      if (mod && e.key === 'i') { e.preventDefault(); exec('italic'); }
      // Close rewrite dropdown on Escape
      if (e.key === 'Escape') setRewriteOpen(false);
    }, [exec]);

    // Rewrite options (same as the hover toolbar)
    const rewriteOptions = [
      { mode: 'similar', label: '↔ Rewrite (Same Size)', default: true },
      { mode: 'elaborate', label: '↕ Elaborate' },
      { mode: 'shorten', label: '↤ Shorten' },
    ];

    return (
      <div className={`rounded-xl border border-indigo-200 bg-white shadow-inner overflow-hidden relative ${className}`}>
        {/* ── AI Rewriting Overlay ── */}
        {isRewiting && (
          <div className="absolute inset-0 z-30 bg-white/80 backdrop-blur-sm flex items-center justify-center rounded-xl">
            <div className="flex flex-col items-center gap-2 text-violet-700">
              <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span className="text-sm font-semibold">Rewriting with AI…</span>
            </div>
          </div>
        )}

        {/* ── Toolbar ── */}
        <div className="flex items-center gap-0.5 px-3 py-2 border-b border-slate-100 bg-slate-50/60 flex-wrap gap-y-1.5">

          {/* ── AI Rewrite (leftmost, prominent) ── */}
          {onRewrite && (
            <>
              <div className="relative">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setRewriteOpen((o) => !o);
                  }}
                  className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 shadow-sm transition-colors shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Edit with AI</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${rewriteOpen ? 'rotate-180' : ''}`} />
                </button>

                {rewriteOpen && (
                  <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden w-48 animate-in fade-in slide-in-from-top-1 duration-150">
                    {rewriteOptions.map((opt) => (
                      <button
                        key={opt.mode}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setRewriteOpen(false);

                          const sel = window.getSelection();
                          let selectedHtml = '';
                          let selectionId = '';

                          if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
                            const range = sel.getRangeAt(0);
                            const container = document.createElement('div');
                            container.appendChild(range.cloneContents());
                            selectedHtml = container.innerHTML;

                            selectionId = 'ai-rewrite-' + Date.now();
                            const span = document.createElement('span');
                            span.id = selectionId;
                            // Adding a pulsing style specifically to the selected text
                            span.className = 'bg-violet-100/60 text-violet-800 animate-pulse rounded px-1';
                            span.appendChild(range.extractContents());
                            range.insertNode(span);
                            emitChange();
                          }

                          onRewrite(opt.mode, selectedHtml, selectionId);
                        }}
                        className="w-full text-left px-4 py-2.5 text-xs hover:bg-violet-50 hover:text-violet-800 transition-colors flex items-center justify-between border-b border-slate-50 last:border-0"
                      >
                        <span>{opt.label}</span>
                        {opt.default && (
                          <span className="text-[9px] text-slate-400 font-bold bg-slate-100 px-1.5 py-0.5 rounded">DEFAULT</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Divider />
            </>
          )}

          {/* ── Auto-Link (Magic Wand) ── */}
          {onAutoLink && (
            <>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  let selectedHtml = '';
                  const sel = document.getSelection();
                  if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
                    const range = sel.getRangeAt(0);
                    const container = document.createElement('div');
                    container.appendChild(range.cloneContents());
                    selectedHtml = container.innerHTML;
                  }
                  onAutoLink(selectedHtml);
                }}
                className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 shadow-sm transition-colors shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Auto-Link</span>
              </button>
              <Divider />
            </>
          )}

          {/* Text formatting */}
          <ToolBtn
            icon={<Bold className="w-3.5 h-3.5" />}
            label="Bold (⌘B)"
            onClick={() => exec('bold')}
            active={activeFormats.has('bold')}
          />
          <ToolBtn
            icon={<Italic className="w-3.5 h-3.5" />}
            label="Italic (⌘I)"
            onClick={() => exec('italic')}
            active={activeFormats.has('italic')}
          />

          <Divider />

          {/* Headings */}
          <ToolBtn
            icon={<Heading2 className="w-3.5 h-3.5" />}
            label="Heading 2"
            onClick={() => insertHeading('h2')}
          />
          <ToolBtn
            icon={<Heading3 className="w-3.5 h-3.5" />}
            label="Heading 3"
            onClick={() => insertHeading('h3')}
          />

          <Divider />

          {/* Lists */}
          <ToolBtn
            icon={<List className="w-3.5 h-3.5" />}
            label="Bullet List"
            onClick={() => exec('insertUnorderedList')}
            active={activeFormats.has('ul')}
          />
          <ToolBtn
            icon={<ListOrdered className="w-3.5 h-3.5" />}
            label="Numbered List"
            onClick={() => exec('insertOrderedList')}
            active={activeFormats.has('ol')}
          />

          {/* Link buttons — use selection-aware LinkBtn */}
          {(onInsertYouTube || onInsertInternalLink || onInsertExternalLink) && (
            <>
              <Divider />
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mx-1 hidden sm:inline">
                Link selected text →
              </span>
            </>
          )}

          {onInsertYouTube && (
            <LinkBtn
              icon={<PlayCircle className="w-3.5 h-3.5 text-red-500" />}
              label="YouTube"
              onSaveAndCall={onInsertYouTube}
              savedRange={savedRange}
            />
          )}
          {onInsertInternalLink && (
            <LinkBtn
              icon={<Link2 className="w-3.5 h-3.5" />}
              label="Internal"
              onSaveAndCall={onInsertInternalLink}
              savedRange={savedRange}
            />
          )}
          {onInsertExternalLink && (
            <LinkBtn
              icon={<Globe className="w-3.5 h-3.5" />}
              label="External"
              onSaveAndCall={onInsertExternalLink}
              savedRange={savedRange}
            />
          )}
        </div>

        {/* ── Editable Area ── */}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={() => { if (!isComposing.current) emitChange(); }}
          onCompositionStart={() => { isComposing.current = true; }}
          onCompositionEnd={() => { isComposing.current = false; emitChange(); }}
          onKeyDown={handleKeyDown}
          onKeyUp={syncFormats}
          onMouseUp={syncFormats}
          onFocus={syncFormats}
          data-placeholder={placeholder}
          className="
            rte-body min-h-[200px] max-h-[520px] overflow-y-auto
            p-4 text-sm text-slate-800 leading-relaxed outline-none resize-none
            focus:ring-0
          "
        />

        {/* Inline styles for the editable content — scoped via .rte-body prefix */}
        <style>{`
          .rte-body:empty:before {
            content: attr(data-placeholder);
            color: #94a3b8;
            pointer-events: none;
          }
          .rte-body h2 {
            font-size: 1.25rem;
            font-weight: 700;
            color: #1e293b;
            margin: 0.75rem 0 0.4rem;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 0.25rem;
          }
          .rte-body h3 {
            font-size: 1.05rem;
            font-weight: 600;
            color: #334155;
            margin: 0.6rem 0 0.3rem;
          }
          .rte-body p {
            margin: 0 0 0.6rem;
          }
          .rte-body b, .rte-body strong {
            font-weight: 700;
            color: #0f172a;
          }
          .rte-body em, .rte-body i {
            font-style: italic;
            color: #475569;
          }
          .rte-body ul {
            list-style-type: disc;
            padding-left: 1.4rem;
            margin: 0.4rem 0 0.6rem;
          }
          .rte-body ol {
            list-style-type: decimal;
            padding-left: 1.4rem;
            margin: 0.4rem 0 0.6rem;
          }
          .rte-body li {
            margin-bottom: 0.25rem;
            color: #334155;
          }
          .rte-body a, .rte-body .rte-link {
            color: #4f46e5;
            text-decoration: underline;
            text-underline-offset: 2px;
            font-weight: 500;
            cursor: pointer;
          }
          .rte-body a:hover {
            color: #3730a3;
          }
          .rte-body blockquote {
            border-left: 3px solid #6366f1;
            background: #eef2ff;
            padding: 0.5rem 1rem;
            margin: 0.5rem 0;
            border-radius: 0 0.5rem 0.5rem 0;
            font-style: italic;
            color: #4338ca;
          }
        `}</style>
      </div>
    );
  }
);
