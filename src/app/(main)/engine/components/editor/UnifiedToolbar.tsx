import { useState } from 'react';
import { Editor } from '@tiptap/react';
import { Bold, Italic, Link2, Sparkles, Heading2, Heading3, List, Quote, ChevronDown, PlayCircle, Globe, Save, Loader2 } from 'lucide-react';

interface UnifiedToolbarProps {
  editor: Editor | null;
  onRewrite?: (mode: string) => void;
  onAutoLink?: () => void;
  onInsertYouTube?: () => void;
  onInsertInternalLink?: () => void;
  onInsertExternalLink?: () => void;
  onSave?: () => void;
  onToggleWeakCopy?: () => void;
  isWeakCopyEnabled?: boolean;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

const rewriteOptions = [
  { mode: 'similar', label: '↔ Rewrite (Same Size)', default: true },
  { mode: 'elaborate', label: '↕ Elaborate' },
  { mode: 'shorten', label: '↤ Shorten' },
];

export function UnifiedToolbar({
  editor,
  onRewrite,
  onAutoLink,
  onInsertYouTube,
  onInsertInternalLink,
  onInsertExternalLink,
  onSave,
  onToggleWeakCopy,
  isWeakCopyEnabled,
  isSidebarOpen,
  onToggleSidebar
}: UnifiedToolbarProps) {
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  if (!editor) {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5 p-2 bg-slate-50/90 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-10 flex-wrap">
      {/* ── Save ── */}
      {onSave && (
        <>
          <button
            type="button"
            disabled={isSaving}
            onMouseDown={async (e) => {
              e.preventDefault();
              setIsSaving(true);
              try {
                await onSave();
              } finally {
                setTimeout(() => setIsSaving(false), 500); // Small delay to show feedback
              }
            }}
            className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 shadow-sm transition-colors shrink-0 disabled:opacity-70"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>{isSaving ? 'Saving...' : 'Save'}</span>
          </button>
          <div className="w-[1px] h-4 bg-slate-200 mx-1" />
        </>
      )}

      {/* ── AI Rewrite ── */}
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
                      onRewrite(opt.mode);
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
          <div className="w-[1px] h-4 bg-slate-200 mx-1" />
        </>
      )}

      {/* ── Auto-Link ── */}
      {onAutoLink && (
        <>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onAutoLink();
            }}
            className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 shadow-sm transition-colors shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Auto-Link</span>
          </button>
          <div className="w-[1px] h-4 bg-slate-200 mx-1" />
        </>
      )}

      {/* ── Toggle Weak Copy Highlights ── */}
      {onToggleWeakCopy && (
        <>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onToggleWeakCopy();
            }}
            className={`flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-bold shadow-sm transition-colors shrink-0 ${isWeakCopyEnabled ? 'bg-violet-100 text-violet-700 hover:bg-violet-200' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Highlights: {isWeakCopyEnabled ? 'ON' : 'OFF'}</span>
          </button>
          <div className="w-[1px] h-4 bg-slate-200 mx-1" />
        </>
      )}

      {/* Formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        disabled={!editor.can().chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        icon={<Bold className="w-4 h-4" />}
        title="Bold"
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        disabled={!editor.can().chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        icon={<Italic className="w-4 h-4" />}
        title="Italic"
      />
      <div className="w-[1px] h-4 bg-slate-200 mx-1" />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive('heading', { level: 2 })}
        icon={<Heading2 className="w-4 h-4" />}
        title="Heading 2"
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        isActive={editor.isActive('heading', { level: 3 })}
        icon={<Heading3 className="w-4 h-4" />}
        title="Heading 3"
      />
      <div className="w-[1px] h-4 bg-slate-200 mx-1" />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
        icon={<List className="w-4 h-4" />}
        title="Bullet List"
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive('blockquote')}
        icon={<Quote className="w-4 h-4" />}
        title="Blockquote"
      />
      <div className="w-[1px] h-4 bg-slate-200 mx-1" />

      {/* Standard Link */}
      <ToolbarButton
        onClick={() => {
          const previousUrl = editor.getAttributes('link').href;
          const url = window.prompt('URL', previousUrl);
          if (url === null) {
            return;
          }
          if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            return;
          }
          editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
        }}
        isActive={editor.isActive('link')}
        icon={<Link2 className="w-4 h-4" />}
        title="Link"
      />

      {/* Advanced Links */}
      
      {onInsertYouTube && (
        <LinkBtn
          icon={<PlayCircle className="w-3.5 h-3.5 text-red-500" />}
          label="YouTube"
          onMouseDown={(e) => { e.preventDefault(); onInsertYouTube(); }}
        />
      )}
      {onInsertInternalLink && (
        <LinkBtn
          icon={<Link2 className="w-3.5 h-3.5" />}
          label="Internal"
          onMouseDown={(e) => { e.preventDefault(); onInsertInternalLink(); }}
        />
      )}
      {onInsertExternalLink && (
        <LinkBtn
          icon={<Globe className="w-3.5 h-3.5" />}
          label="External"
          onMouseDown={(e) => { e.preventDefault(); onInsertExternalLink(); }}
        />
      )}

      {onToggleSidebar && (
        <>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onToggleSidebar}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-900 transition-colors mr-1"
            title={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            {isSidebarOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-panel-right-close"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/><path d="m8 16 4-4-4-4"/></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-panel-right-open"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/><path d="m10 15-3-3 3-3"/></svg>
            )}
          </button>
        </>
      )}
    </div>
  );
}

function ToolbarButton({
  onClick,
  disabled,
  isActive,
  icon,
  title
}: {
  onClick: () => void,
  disabled?: boolean,
  isActive: boolean,
  icon: React.ReactNode,
  title: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded-lg transition-colors ${isActive
          ? 'bg-indigo-100 text-indigo-700 shadow-sm border border-indigo-200'
          : 'text-slate-600 hover:bg-slate-200 hover:text-slate-900'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {icon}
    </button>
  );
}

function LinkBtn({
  icon, label, onMouseDown,
}: {
  icon: React.ReactNode;
  label: string;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      title={label}
      onMouseDown={onMouseDown}
      className="
        flex items-center gap-1 px-2 h-8 rounded-lg text-xs font-semibold
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
