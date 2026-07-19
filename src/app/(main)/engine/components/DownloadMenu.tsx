'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FileText, FileCode, AlignLeft, FileJson, ChevronDown, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ArticleBlueprint, SectionBlock } from '@/types/article';
import { slugify, toMarkdown, toHtml, toPlainText, triggerDownload } from '@/lib/article-utils';

const DOWNLOAD_FORMATS = [
  { key: 'md', label: 'Markdown', ext: '.md', icon: FileText, mime: 'text/markdown', hint: 'For Notion, GitHub, Hugo, Gatsby' },
  { key: 'html', label: 'HTML', ext: '.html', icon: FileCode, mime: 'text/html', hint: 'Styled, ready to publish' },
  { key: 'txt', label: 'Plain Text', ext: '.txt', icon: AlignLeft, mime: 'text/plain', hint: 'Clean copy for Word / Docs' },
  { key: 'json', label: 'JSON', ext: '.json', icon: FileJson, mime: 'application/json', hint: 'Raw structured data' },
];

interface DownloadMenuProps {
  blueprint: Partial<ArticleBlueprint> | null;
  sections: SectionBlock[];
}

export function DownloadMenu({ blueprint, sections }: DownloadMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
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

  const handle = (key: string) => {
    setOpen(false);
    const slug = slugify(blueprint?.title || 'article');
    if (key === 'md') return triggerDownload(`${slug}.md`, toMarkdown(blueprint ?? {} as any, sections), 'text/markdown');
    if (key === 'html') return triggerDownload(`${slug}.html`, toHtml(blueprint ?? {}, sections), 'text/html');
    if (key === 'txt') return triggerDownload(`${slug}.txt`, toPlainText(blueprint ?? {}, sections), 'text/plain');
    if (key === 'json') return triggerDownload(`${slug}.json`, JSON.stringify({ ...blueprint, sections }, null, 2), 'application/json');
  };

  const dropdown = (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 99999 }}
      className="w-52 rounded-lg border bg-white shadow-2xl shadow-black/20 overflow-hidden"
    >
      {DOWNLOAD_FORMATS.map((fmt) => {
        const Icon = fmt.icon;
        return (
          <button
            key={fmt.key}
            type="button"
            onClick={() => handle(fmt.key)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-indigo-50)] active:bg-primary/10 transition-colors text-left border-b last:border-b-0"
          >
            <span className="p-1.5 rounded-lg bg-secondary flex-shrink-0">
              <Icon className="w-4 h-4 text-primary" />
            </span>
            <span className="text-sm font-semibold">
              {fmt.label}
              <span className="ml-1.5 font-mono font-normal font-light text-[13px]">{fmt.ext}</span>
            </span>
          </button>
        );
      })}
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
    </>
  );
}
