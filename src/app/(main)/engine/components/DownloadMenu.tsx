'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FileText, FileCode, AlignLeft, FileJson, ChevronDown, Download, AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ArticleBlueprint, SectionBlock } from '@/types/article';
import { slugify, toPlainText, triggerDownload, htmlToMarkdown } from '@/lib/article-utils';
import { ArticleExportService, ExportArticleInput } from '@/lib/export/ArticleExportService';

const DOWNLOAD_FORMATS = [
  { key: 'html', label: 'HTML Document', ext: '.html', icon: FileCode, mime: 'text/html', hint: 'Styled, complete article' },
  { key: 'pdf', label: 'PDF Document', ext: '.pdf', icon: FileText, mime: 'application/pdf', hint: 'Paginated document with tables' },
  { key: 'md', label: 'Markdown', ext: '.md', icon: FileText, mime: 'text/markdown', hint: 'For Notion, GitHub, Hugo, Gatsby' },
  { key: 'txt', label: 'Plain Text', ext: '.txt', icon: AlignLeft, mime: 'text/plain', hint: 'Clean copy for Word / Docs' },
  { key: 'json', label: 'JSON Data', ext: '.json', icon: FileJson, mime: 'application/json', hint: 'Raw structured data' },
];

export interface DownloadMenuProps {
  blueprint: Partial<ArticleBlueprint> | null;
  sections: SectionBlock[];
  editorHtml?: string;
  targetBrand?: string;
  saasProfile?: any;
}

export function DownloadMenu({ blueprint, sections, editorHtml, targetBrand, saasProfile }: DownloadMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const [exportErrors, setExportErrors] = useState<string[] | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    }
    setOpen((v) => !v);
  };

  const buildExportInput = (): ExportArticleInput => {
    return {
      title: blueprint?.title || 'Untitled Article',
      slug: blueprint?.slug || slugify(blueprint?.title || 'article'),
      content: editorHtml || (blueprint as any)?.content,
      bodyMarkdown: (blueprint as any)?.bodyMarkdown,
      blueprint: blueprint || undefined,
      sections: sections,
      targetBrand: targetBrand || (blueprint as any)?.referenceUrl,
      saasProfile: saasProfile || (blueprint as any)?.saasProfile,
      metadata: {
        intent: blueprint?.intent,
        targetKeywords: (blueprint as any)?.targetKeywords
      }
    };
  };

  const handle = (key: string) => {
    setOpen(false);
    const exportInput = buildExportInput();
    const slug = exportInput.slug || slugify(exportInput.title || 'article');

    // 1. Completeness & Integrity Validation for HTML, PDF, and MD
    if (key === 'html' || key === 'pdf' || key === 'md') {
      const validation = ArticleExportService.validateBeforeExport(exportInput);
      if (!validation.canExport) {
        setExportErrors(validation.errors);
        return;
      }
    }

    // 2. Format Execution
    if (key === 'html') {
      const res = ArticleExportService.downloadHtmlClient(exportInput);
      if (!res.success && res.error) {
        setExportErrors([res.error]);
      }
      return;
    }

    if (key === 'pdf') {
      const res = ArticleExportService.downloadPdfClient(exportInput);
      if (!res.success && res.error) {
        setExportErrors([res.error]);
      }
      return;
    }

    if (key === 'md') {
      const html = ArticleExportService.resolveCanonicalHtml(exportInput);
      const md = htmlToMarkdown(html);
      return triggerDownload(`${slug}.md`, md, 'text/markdown');
    }

    if (key === 'txt') {
      return triggerDownload(`${slug}.txt`, toPlainText(blueprint ?? {}, sections), 'text/plain');
    }

    if (key === 'json') {
      return triggerDownload(`${slug}.json`, JSON.stringify({ ...blueprint, sections, content: editorHtml }, null, 2), 'application/json');
    }
  };

  const dropdown = (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 99999 }}
      className="w-56 rounded-lg border bg-white shadow-2xl shadow-black/20 overflow-hidden"
    >
      {DOWNLOAD_FORMATS.map((fmt) => {
        const Icon = fmt.icon;
        return (
          <button
            key={fmt.key}
            type="button"
            onClick={() => handle(fmt.key)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 active:bg-primary/10 transition-colors text-left border-b last:border-b-0"
          >
            <span className="p-1.5 rounded-lg bg-slate-100 flex-shrink-0 text-primary">
              <Icon className="w-4 h-4" />
            </span>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                {fmt.label}
                <span className="font-mono font-normal text-xs text-slate-400">{fmt.ext}</span>
              </span>
              <span className="text-[11px] text-slate-400 leading-tight">{fmt.hint}</span>
            </div>
          </button>
        );
      })}
    </div>
  );

  const errorModal = exportErrors && (
    <div
      className="fixed inset-0 z-[999999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
      onClick={() => setExportErrors(null)}
    >
      <div
        className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-red-200 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-900">Export Blocked: Incomplete Content</h3>
              <p className="text-xs text-slate-500">ACUTE Factual Integrity & Completeness Gate</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setExportErrors(null)}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-red-50/70 border border-red-100 rounded-xl p-4 text-sm text-red-800 space-y-2">
          <p className="font-medium text-xs uppercase tracking-wider text-red-600">The following publication violations must be repaired before exporting:</p>
          <ul className="list-disc pl-5 space-y-1.5 text-xs text-red-700">
            {exportErrors.map((err, idx) => (
              <li key={idx} className="leading-relaxed">{err}</li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          ACUTE prevents exporting incomplete articles, placeholder drafts, or misaligned archetype premises. Please repair the article in the editor to meet numerical and factual promises.
        </p>

        <div className="pt-2 flex justify-end">
          <Button
            variant="default"
            size="sm"
            onClick={() => setExportErrors(null)}
            className="bg-slate-900 hover:bg-slate-800 text-white font-medium px-4"
          >
            Return to Editor
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <Button
        ref={btnRef}
        type="button"
        size="sm"
        variant="outline"
        onClick={toggle}
        className="gap-1.5 border-preserved-blue/40 text-preserved-blue hover:bg-preserved-blue/10 font-medium"
      >
        <Download className="w-3.5 h-3.5" />
        Export
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </Button>
      {mounted && open && createPortal(dropdown, document.body)}
      {mounted && errorModal && createPortal(errorModal, document.body)}
    </>
  );
}
