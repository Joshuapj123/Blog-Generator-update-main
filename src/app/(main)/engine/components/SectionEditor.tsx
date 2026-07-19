'use client';

import { useState, useEffect, useRef } from 'react';
import {
  ChevronRight,
  Sparkles,
  Type,
  Search,
  Image as ImageIcon,
  Loader2,
  TrendingUp, AlertTriangle, CheckCircle2, Scale, Info, AlertCircle,
  ArrowRight, Heading2, MousePointerClick, BookOpen, RotateCcw, RefreshCw, Trash2
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CompareTabContent } from '@/components/CompareTabContent';
import { useEngine } from '../context/EngineContext';
import { Button } from '@/components/ui/button';
import { DownloadMenu } from './DownloadMenu';
import { useEditor, EditorContent } from '@tiptap/react';
import { getTiptapExtensions } from './editor/tiptapConfig';
import { UnifiedToolbar } from './editor/UnifiedToolbar';
import { useGenerationPipeline } from '../hooks/useGenerationPipeline';
import { normalizeAiOutput } from '../utils/normalizeAiOutput';
import { applyKeywordHighlights } from '../utils/KeywordHighlighter';
import { useEngineHandlers } from '../hooks/useEngineHandlers';
import { scrollToWeakTerm, applyWeakCopyFix, highlightAllWeakCopy, clearWeakHighlights } from './editor/EditorHighlightCommands';
import { YouTubeModal, LinkModal, ContextLinkPanel, type PendingLink } from '@/components/SectionEditor';
import { WeakCopyCard } from '@/components/ui/WeakCopyCard';
import { AnalysisResultsPanel } from '@/components/AnalysisResultsPanel';
import { computeStructuredScore } from '@/lib/content-scoring';
import { SerpTermPanel } from './editor/SerpTermPanel';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';

export function SectionEditor() {
  const engine = useEngine();
  const { startPipeline } = useGenerationPipeline();
  const { handleUnifiedIntelligence } = useEngineHandlers();

  const finalAssemblyDoneRef = useRef<string | null>(null);

  // Modal States
  const [showYT, setShowYT] = useState(false);
  const [showLink, setShowLink] = useState<'internal' | 'external' | null>(null);
  const [dismissingSet, setDismissingSet] = useState<Set<number>>(new Set());
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // Auto-Link States
  const [pendingLinks, setPendingLinks] = useState<PendingLink[]>([]);
  const [showContextLinkPanel, setShowContextLinkPanel] = useState(false);
  const [linkProgress, setLinkProgress] = useState({ resolved: 0, total: 0 });
  const serpAbortRef = useRef<AbortController | null>(null);
  const [autoLinkStatus, setAutoLinkStatus] = useState<{ active: boolean; message: string }>({ active: false, message: '' });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const lastSavedAnalysisRef = useRef<string>('');

  const handleRegenerate = async () => {
    // If we have an existing article, we want to regenerate it but keep the same ID for replacement
    await startPipeline(true);
  };

  const handleReAnalyse = async () => {
    if (!editor) return;
    engine.setIsDetectingWeakCopy(true);
    engine.setWeakCopyFlags([]);
    engine.setAnalysisResults(null);
    
    try {
      // 1. Re-extract intelligence if requested or ensure it's fresh
      engine.setGenStatus('Refreshing competitor intelligence...');
      await handleUnifiedIntelligence(true);

      const textContext = editor.getText();
      engine.setGenStatus('Running deep SEO analysis...');
      
      const res = await fetch('/api/standalone-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: textContext,
          referenceContext: engine.referenceData?.rawText || '',
          refRawText: engine.referenceData?.rawText || '',
          refRawHtml: (engine.referenceData as any)?.rawHtml || '',
          serpContext: {},
          masterKeywords: engine.keywordBank?.terms.map(t => t.term) || engine.serpTerms.map(t => t.term)
        }),
      });
      
      const data = await res.json();
      if (res.ok) {
        engine.setAnalysisResults(data);
        if (data.weakCopyItems) {
           const flags = data.weakCopyItems.map((w: any) => ({
              originalPhrase: w.phrase,
              suggestedRewrite: w.improvement,
              category: 'weak copy',
              reasoning: ''
           }));
           engine.setWeakCopyFlags(flags);
           engine.highlightAllWeakCopy(flags);
        }

        try {
          const liveTerms = (engine.serpTerms || []).map(t => ({ ...t, currentCount: 0, overuseRisk: false }));
          const score = computeStructuredScore({
            textContext,
            title: engine.title || '',
            headings: [],
            liveTerms,
            entities: [],
            topTermsForIntent: [],
            medianWordCount: engine.referenceData?.advancedMetrics?.wordCount || 1500,
            medianTitleLength: 60,
            medianH2Count: engine.referenceData?.seo?.headerHierarchy?.filter((h: any) => h.tag === 'h2').length || 8,
            contentGapReport: (engine.referenceData as any)?.contentGapReport,
            headingFrequency: engine.serpAnalysis?.headingFrequency || (engine.referenceData as any)?.headingFrequency,
            topicClusters: engine.serpAnalysis?.topicClusters || (engine.referenceData as any)?.topicClusters,
            paaQuestions: engine.serpAnalysis?.paaQuestions || (engine.referenceData as any)?.paaQuestions,
            medianLexicalDiversity: engine.serpAnalysis?.medianLexicalDiversity || (engine.referenceData as any)?.medianLexicalDiversity || (engine.referenceData as any)?.advancedMetrics?.medianLexicalDiversity || 0.35,
            featuredSnippetBlueprint: engine.serpAnalysis?.featuredSnippetBlueprint || (engine.referenceData as any)?.featuredSnippetBlueprint || (engine.blueprint as any)?.featuredSnippetBlueprint,
          });
          engine.setContentScore(score);
        } catch (e) {
          console.error('Scoring failed', e);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      engine.setIsDetectingWeakCopy(false);
      engine.setGenStatus('');
    }
  };

  const handleApplyFix = (i: number, phrase: string, improvement: string) => {
    if (editor) applyWeakCopyFix(editor, phrase, improvement);
    setDismissingSet(prev => new Set(prev).add(i));
    setTimeout(() => {
      engine.setAnalysisResults((prev: any) => {
        if (!prev || !prev.weakCopyItems) return prev;
        const newItems = prev.weakCopyItems.filter((_: unknown, idx: number) => idx !== i);
        return { ...prev, weakCopyItems: newItems };
      });
      engine.setWeakCopyFlags(engine.weakCopyFlags.filter((_: unknown, idx: number) => idx !== i));
      setDismissingSet(prev => { const n = new Set(prev); n.delete(i); return n; });
    }, 380);
  };

  const editor = useEditor({
    extensions: getTiptapExtensions(),
    content: engine.tiptapContent,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      engine.setTiptapContent(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-lg prose-slate max-w-none focus:outline-none min-h-[600px] leading-relaxed',
      },
    },
  });

  useEffect(() => {
    engine.editorRef.current = editor;
    return () => {
      engine.editorRef.current = null;
    };
  }, [editor, engine.editorRef]);

  // Debounced Auto-Save on content change
  useEffect(() => {
    if (!engine.isGenerated || engine.isRunning || !engine.currentArticleId || !engine.tiptapContent) return;
    
    // We only auto-save if there's actual text content to avoid saving empty templates by mistake
    const textLength = editor?.getText().trim().length || 0;
    if (textLength === 0) return;

    const handler = setTimeout(() => {
      engine.saveCurrentArticle(engine.tiptapContent);
    }, 2000);

    return () => clearTimeout(handler);
  }, [engine.tiptapContent, engine.isGenerated, engine.isRunning, engine.currentArticleId, editor]);

  // Reset final assembly ref on pipeline run
  useEffect(() => {
    if (engine.isRunning) {
      finalAssemblyDoneRef.current = null;
    }
  }, [engine.isRunning]);

  useEffect(() => {
    if (!editor || engine.isRunning) return;
    
    const currentHtml = editor.getHTML();
    const isEditorEmpty = currentHtml === '<p></p>' || currentHtml === '' || currentHtml === '<br>';
    
    // If we have content in the engine state but editor is empty, OR they differ
    if ((engine.tiptapContent && isEditorEmpty) || (engine.tiptapContent && currentHtml !== engine.tiptapContent)) {
      editor.commands.setContent(engine.tiptapContent);
    } else if (!engine.tiptapContent && !isEditorEmpty) {
      editor.commands.setContent('');
    }
  }, [engine.currentArticleId, engine.tiptapContent, editor, engine.isRunning]);

  // Restore SERP data from saved article
  useEffect(() => {
    if (!engine.currentArticleId || engine.serpTerms.length > 0) return;
    const allArticles = [...engine.todoArticles, ...engine.publishedArticles];
    const matched = allArticles.find(a => a.id === engine.currentArticleId);
    if (matched?.serpAnalysis?.terms) {
      engine.setSerpTerms(matched.serpAnalysis.terms);
    }
  }, [engine.currentArticleId, engine.todoArticles, engine.publishedArticles, engine.serpTerms.length]);

  // Live Editor Updates
  useEffect(() => {
    if (engine.isRunning && engine.blueprint && (engine.blueprint as any).section_outlines) {
      const rawMarkdown = (engine.blueprint as any).section_outlines.map((blueprintSec: any, i: number) => {
          const generatedSec = engine.sections[i];
          
          const lines: string[] = [];
          const level = blueprintSec.level === 'H3' ? '###' : '##';
          lines.push(`${level} ${blueprintSec.heading}`);
          lines.push('');
          
          if (generatedSec) {
            if (generatedSec.what_it_is) lines.push(generatedSec.what_it_is.replace(/\*\*(.*?)\*\*/g, '**$1**').trim() + '\n');
            if (generatedSec.why_it_works) lines.push(generatedSec.why_it_works.replace(/\*\*(.*?)\*\*/g, '**$1**').trim() + '\n');
            if (generatedSec.experience_or_data_point) lines.push(`> **Expert Insight:** ${generatedSec.experience_or_data_point}\n`);
            if (generatedSec.example_brands?.length) lines.push(`**Examples:** ${generatedSec.example_brands.join(', ')}\n`);
            if (generatedSec.takeaway) {
              // We skip adding takeaway to editor body as requested, 
              // but it will be available in the engine.sections state for the QA panel.
            }
            if (generatedSec.outbound_authority_link?.resolved_url) {
              lines.push(`📎 [${generatedSec.outbound_authority_link.resolved_title || 'Source'}](${generatedSec.outbound_authority_link.resolved_url})\n`);
            }
            if (generatedSec.rich_media_query?.youtube_video_id) {
              const vid = generatedSec.rich_media_query;
              lines.push(`<div data-youtube-video src="https://www.youtube.com/watch?v=${vid.youtube_video_id}"></div>\n`);
              lines.push(`🎬 **YouTube Reference:** [${vid.suggested_search_query || 'Watch Video'}](https://www.youtube.com/watch?v=${vid.youtube_video_id})\n`);
            } else if (generatedSec.rich_media_query?.suggested_search_query) {
              const query = generatedSec.rich_media_query.suggested_search_query;
              lines.push(`🎬 **YouTube Search:** [${query}](https://www.youtube.com/results?search_query=${encodeURIComponent(query)})\n`);
            }
          } else {
            lines.push('*Generating content...*');
          }
          return lines.join('\n');
        }).join('\n\n');
        
        const html = normalizeAiOutput(rawMarkdown);
        if (editor) {
          editor.commands.setContent(html);
        }
      }
    }, [engine.isRunning, engine.blueprint, engine.sections, editor]);

  // When generation completes, assemble content and normalize
  useEffect(() => {
    if (
      engine.isGenerated && 
      !engine.isRunning && 
      engine.sections.length > 0 && 
      engine.blueprint && 
      (engine.blueprint as any).section_outlines && 
      finalAssemblyDoneRef.current !== (engine.currentArticleId || 'default')
    ) {
      const rawMarkdown = (engine.blueprint as any).section_outlines.map((blueprintSec: any, i: number) => {
        const sec = engine.sections[i];
        if (!sec) return `## ${blueprintSec.heading}\n\n*Content missing.*`;

        const lines: string[] = [];
        const level = sec.level === 'H3' ? '###' : '##';
        lines.push(`${level} ${sec.heading}`);
        lines.push('');
        if (sec.what_it_is) lines.push(sec.what_it_is.replace(/\*\*(.*?)\*\*/g, '**$1**').trim() + '\n');
        if (sec.why_it_works) lines.push(sec.why_it_works.replace(/\*\*(.*?)\*\*/g, '**$1**').trim() + '\n');
        if (sec.experience_or_data_point) lines.push(`> **Expert Insight:** ${sec.experience_or_data_point}\n`);
        if (sec.example_brands?.length) lines.push(`**Examples:** ${sec.example_brands.join(', ')}\n`);
        if (sec.takeaway) {
          // Skip takeaway in editor body
        }
        if (sec.outbound_authority_link?.resolved_url) {
          lines.push(`📎 [${sec.outbound_authority_link.resolved_title || 'Source'}](${sec.outbound_authority_link.resolved_url})\n`);
        }
        if (sec.rich_media_query?.youtube_video_id) {
          const vid = sec.rich_media_query;
          lines.push(`<div data-youtube-video src="https://www.youtube.com/watch?v=${vid.youtube_video_id}"></div>\n`);
          lines.push(`🎬 **YouTube Reference:** [${vid.suggested_search_query || 'Watch Video'}](https://www.youtube.com/watch?v=${vid.youtube_video_id})\n`);
        } else if (sec.rich_media_query?.suggested_search_query) {
          const query = sec.rich_media_query.suggested_search_query;
          lines.push(`🎬 **YouTube Search:** [${query}](https://www.youtube.com/results?search_query=${encodeURIComponent(query)})\n`);
        }
        return lines.join('\n');
      }).join('\n\n');
      
      const html = normalizeAiOutput(rawMarkdown);
      finalAssemblyDoneRef.current = engine.currentArticleId || 'default';
      engine.setTiptapContent(html);
      
      // Auto-save the newly generated content to replace old or create new
      engine.saveCurrentArticle(html);

      if (editor) {
        editor.commands.setContent(html);
        
        // Apply keyword highlights
        if (engine.keywordBank && engine.keywordBank.terms) {
          const termsToHighlight = engine.keywordBank.terms.map(t => ({
            keyword: t.term,
            category: t.source === 'serp_competitor' ? 'competitor' : 'core'
          }));
          applyKeywordHighlights(editor, termsToHighlight);
        }
        
        // Apply weak copy highlights if already available and enabled
        if (engine.enableWeakCopyDetector && engine.weakCopyFlags && engine.weakCopyFlags.length > 0) {
          highlightAllWeakCopy(editor, engine.weakCopyFlags);
        }
      }
    }
  }, [engine.isGenerated, engine.isRunning, engine.sections, engine.blueprint, editor, engine.currentArticleId, engine.keywordBank]);

  // Listen for weak copy flag updates from background QA and toggle
  useEffect(() => {
    if (editor) {
      if (engine.enableWeakCopyDetector && engine.weakCopyFlags.length > 0) {
        highlightAllWeakCopy(editor, engine.weakCopyFlags);
      } else {
        clearWeakHighlights(editor);
      }
    }
  }, [engine.weakCopyFlags, engine.enableWeakCopyDetector, editor]);

  // Final save when analysis results or content score arrive
  useEffect(() => {
    if (engine.isGenerated && !engine.isRunning && (engine.analysisResults || engine.contentScore)) {
      const currentAnalysisId = JSON.stringify(engine.analysisResults || {}) + (engine.contentScore?.totalScore || 0);
      if (lastSavedAnalysisRef.current !== currentAnalysisId) {
        if (engine.tiptapContent) {
          engine.saveCurrentArticle(engine.tiptapContent);
          lastSavedAnalysisRef.current = currentAnalysisId;
        }
      }
    }
  }, [engine.analysisResults, engine.contentScore, engine.isGenerated, engine.isRunning, engine.tiptapContent]);

  const insertAtCursor = (mdSnippet: string) => {
    if (!editor) return;
    const urlMatch = mdSnippet.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (urlMatch) {
      const url = urlMatch[2];
      const label = urlMatch[1];
      const { empty } = editor.state.selection;
      if (empty) {
        editor.chain().focus().insertContent(`<a href="${url}" target="_blank">${label}</a>`).run();
      } else {
        editor.chain().focus().setLink({ href: url }).run();
      }
    } else {
      editor.chain().focus().insertContent(mdSnippet).run();
    }
  };

  const doEditorRewrite = async (mode: string) => {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    if (empty) {
      alert('Please select some text to rewrite.');
      return;
    }
    const selectedText = editor.state.doc.textBetween(from, to, ' ');
    
    setAutoLinkStatus({ active: true, message: 'Rewriting with AI...' });
    try {
      const res = await fetch('/api/rewrite-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          heading: engine.blueprint?.title || 'Draft',
          body: editor.getHTML(),
          mode,
          articleTitle: engine.blueprint?.title || 'Draft',
          allHeadings: [],
          selectedText,
        }),
      });
      const data = await res.json();
      if (data.rewritten) {
        editor.chain().focus().insertContent(data.rewritten).run();
      }
    } catch (e) {
      console.error('Rewrite failed', e);
    } finally {
      setAutoLinkStatus({ active: false, message: '' });
    }
  };

  const handleAutoLink = async () => {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    let targetText = editor.getText();
    if (!empty) {
      targetText = editor.state.doc.textBetween(from, to, ' ');
    }
    
    setPendingLinks([]);
    setLinkProgress({ resolved: 0, total: 0 });
    setShowContextLinkPanel(true);

    if (serpAbortRef.current) serpAbortRef.current.abort();
    serpAbortRef.current = new AbortController();
    const signal = serpAbortRef.current.signal;

    try {
      // 1. Gather master keywords
      const masterKeywords = new Set<string>();
      if (engine.strategyTargetKeywords) {
        engine.strategyTargetKeywords.forEach(k => masterKeywords.add(k.trim()));
      }
      if (engine.keywordBank && engine.keywordBank.terms) {
        engine.keywordBank.terms.forEach(k => masterKeywords.add(k.term.trim()));
      }
      if (engine.targetKeywords) {
        engine.targetKeywords.split(',').forEach(k => masterKeywords.add(k.trim()));
      }

      // 2. Find matches in the target text
      const targetTextLower = targetText.toLowerCase();
      let currentLinks: PendingLink[] = [];
      const pendingSerpFetches: PendingLink[] = [];

      Array.from(masterKeywords).forEach(kw => {
        if (!kw || kw.length < 3) return; // Skip empty or very short keywords
        
        // Exact word boundary match if possible, fallback to includes
        const escapedKw = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = targetText.match(new RegExp(`\\b${escapedKw}\\b`, 'i'));
        
        if (match || targetTextLower.includes(kw.toLowerCase())) {
            const anchorText = match ? match[0] : kw;
            
            // Check cache in engine.externalLinks
            const cachedLink = engine.externalLinks.find(
              l => l.title?.toLowerCase() === kw.toLowerCase() && l.url
            );

            if (cachedLink) {
                const newLink: PendingLink = {
                    keyword: kw,
                    anchorText: anchorText,
                    url: cachedLink.url,
                    title: cachedLink.title,
                    source: 'Cache',
                    confidence: 'high',
                    selected: true,
                    resolved: true
                };
                currentLinks.push(newLink);
            } else {
                const newLink: PendingLink = {
                    keyword: kw,
                    anchorText: anchorText,
                    url: null,
                    source: 'SERP',
                    confidence: 'high',
                    selected: true,
                    resolved: false
                };
                currentLinks.push(newLink);
                pendingSerpFetches.push(newLink);
            }
        }
      });

      setPendingLinks([...currentLinks]);
      setLinkProgress({ resolved: 0, total: pendingSerpFetches.length });

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
                  const serpRes = await fetch('/api/serp-preview', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ keyword: item.keyword }),
                      signal
                  });
                  const serpData = await serpRes.json();
                  let result;
                  if (serpData.results && serpData.results.length > 0) {
                      result = serpData.results.find((r: any) => !r.link.includes(window.location.hostname));
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

      // 3. Start fetching all pending SERP results
      if (pendingSerpFetches.length > 0) {
          fetchWithConcurrencyLimit(pendingSerpFetches);
      } else {
          // No matches found
          setPendingLinks([]);
          setLinkProgress({ resolved: 0, total: 0 });
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') console.error('Auto-link failed', e);
    }
  };

  const handleApplyContextLinks = async () => {
    const selected = pendingLinks.filter(r => r.selected && r.url && r.anchorText);
    
    if (editor) {
      selected.forEach(row => {
        // Need to find and replace text in Tiptap
        // For simplicity we just do string replacement on HTML and set it back
        const html = editor.getHTML();
        const updatedHtml = html.replace(
          new RegExp(`\\b${row.anchorText!}\\b`, 'i'),
          `<a href="${row.url}" target="_blank" rel="noopener noreferrer">${row.anchorText}</a>`
        );
        editor.commands.setContent(updatedHtml);
      });
    }

    const { saveExternalLink } = await import('@/lib/firebase/firestore');
    const newExtLinks = [];

    for (const row of selected) {
      if (row.source === 'SERP') {
        const extLink = { title: row.keyword, url: row.url!, folder: 'Auto-Linked' };
        const id = await saveExternalLink(extLink);
        newExtLinks.push({ id, ...extLink });
      }
    }

    if (newExtLinks.length > 0) {
      engine.setExternalLinks([...engine.externalLinks, ...newExtLinks]);
    }

    setShowContextLinkPanel(false);
    setPendingLinks([]);
  };

  const handleCancelContextLinks = () => {
    if (serpAbortRef.current) serpAbortRef.current.abort();
    setShowContextLinkPanel(false);
    setPendingLinks([]);
  };

  if (!engine.isGenerated && !engine.isRunning) return null;

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-50/50 rounded-xl border shadow-sm h-full min-h-[calc(100vh-2rem)]">
      {/* Editor Main Pane */}
      <div className="flex-1 overflow-y-auto relative bg-white">
        <div className="flex flex-col h-full relative">
          <div className="sticky top-0 z-20 flex flex-col w-full shadow-sm">
            {/* Top Banner for Loading */}
            {engine.isRunning && (
              <div className="flex items-center justify-between bg-indigo-50/90 backdrop-blur-md border-b border-indigo-200 px-4 py-2.5 shrink-0">
                <div className="flex items-center gap-3 flex-1">
                  <Loader2 className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />
                  <span className="text-sm font-semibold text-indigo-900 truncate">{engine.genStatus || 'Initializing Engine...'}</span>
                  <div className="flex-1 max-w-md ml-4 h-1.5 bg-indigo-100 rounded-full overflow-hidden hidden sm:block">
                    <div className="h-full bg-indigo-500 rounded-full transition-all duration-300" style={{ width: `${engine.genProgress}%` }} />
                  </div>
                  <span className="text-xs font-mono font-bold text-indigo-500">{engine.genProgress}%</span>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="text-indigo-600 hover:bg-indigo-100 hover:text-indigo-800 h-7 text-xs ml-4 shrink-0"
                  onClick={() => {
                    engine.abortGeneration();
                    engine.setIsRunning(false);
                    engine.setGenStatus('Cancelled');
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}

            {/* Export & Status (when finished) */}
            {engine.blueprint && !engine.isRunning && (
              <div className="flex items-center justify-between bg-white px-4 py-2 border-b border-slate-200 shrink-0">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Ready to Publish
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="text-slate-500 border-slate-200 hover:bg-slate-50 gap-2 font-semibold text-xs"
                    onClick={handleRegenerate}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Regenerate
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="text-red-500 border-red-100 hover:bg-red-50 hover:border-red-200 gap-2 font-semibold text-xs"
                    onClick={() => setShowDeleteModal(true)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </Button>
                  <DownloadMenu 
                    blueprint={engine.blueprint as any} 
                    sections={engine.sections} 
                  />
                </div>
              </div>
            )}

            {/* Unified Toolbar */}
            <UnifiedToolbar 
              editor={editor}
              onRewrite={doEditorRewrite}
              onAutoLink={handleAutoLink}
              onInsertYouTube={() => setShowYT(true)}
              onInsertInternalLink={() => setShowLink('internal')}
              onInsertExternalLink={() => setShowLink('external')}
              onSave={() => { if (editor) engine.saveCurrentArticle(editor.getHTML()); }}
              onToggleWeakCopy={() => engine.setEnableWeakCopyDetector(!engine.enableWeakCopyDetector)}
              isWeakCopyEnabled={engine.enableWeakCopyDetector}
              isSidebarOpen={isSidebarOpen}
              onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            />
          </div>

          {/* Overlays */}
          {autoLinkStatus.active && (
            <div className="absolute inset-0 z-20 rounded-2xl bg-white/60 backdrop-blur-[2px] flex items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-emerald-700 bg-white/90 px-6 py-4 rounded-xl shadow-lg border border-emerald-100">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-sm font-semibold">{autoLinkStatus.message}</span>
              </div>
            </div>
          )}
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
          {showYT && (
            <YouTubeModal
              onInsert={md => { insertAtCursor(md); setShowYT(false); }}
              onClose={() => setShowYT(false)}
            />
          )}
          {showLink && (
            <LinkModal
              type={showLink}
              savedArticles={[]}
              onInsert={md => { insertAtCursor(md); setShowLink(null); }}
              onClose={() => setShowLink(null)}
            />
          )}
          
          <DeleteConfirmationModal 
            isOpen={showDeleteModal}
            onClose={() => setShowDeleteModal(false)}
            onConfirm={async () => {
              await engine.deleteCurrentArticle();
            }}
            itemName={engine.blueprint?.title || engine.title}
          />
          
          <div className="flex-1 overflow-y-auto p-8 lg:p-12">
            <div className="max-w-4xl mx-auto">
              {/* Article Header */}
              <div className="mb-12 animate-in fade-in slide-in-from-top-4 duration-700">
                <div className="max-w-3xl">
                  {engine.blueprint ? (
                    <>
                      <h1 className="text-5xl font-serif font-bold text-slate-900 leading-[1.1] mb-4 outline-none" contentEditable={!engine.isRunning} suppressContentEditableWarning>
                        {engine.blueprint.title}
                      </h1>
                      <p className="text-lg text-slate-500 font-medium leading-relaxed italic outline-none" contentEditable={!engine.isRunning} suppressContentEditableWarning>
                        {(engine.blueprint as any).description ?? engine.blueprint.intro?.thesis}
                      </p>
                    </>
                  ) : engine.title ? (
                    <h1 className="text-5xl font-serif font-bold text-slate-900 leading-[1.1] mb-4 outline-none" contentEditable={!engine.isRunning} suppressContentEditableWarning>
                      {engine.title}
                    </h1>
                  ) : null}
                </div>
              </div>

              {/* Tiptap Editor Content */}
              <div className="animate-in fade-in duration-500">
                {editor && <EditorContent editor={editor} />}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* QA Side Panel */}
      <div 
        className={`shrink-0 transition-all duration-300 ease-in-out z-10 overflow-hidden ${
          isSidebarOpen ? 'w-[460px] opacity-100' : 'w-0 opacity-0'
        }`}
      >
        <div className="w-[460px] h-full">
          <AnalysisResultsPanel
            className="w-full h-full border-l border-slate-200 bg-white shadow-xl"
            contentScore={engine.contentScore}
            analysisResults={engine.analysisResults}
            serpTerms={engine.serpTerms}
            keywordBank={engine.keywordBank}
            refText={engine.referenceData?.rawText}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            intentClassification={engine.intentClassification as unknown as any}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            intentAlignment={engine.intentAlignment as unknown as any}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            referenceData={engine.referenceData as unknown as any}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            blueprint={engine.blueprint as unknown as any}
            sections={engine.sections}
            serpEntities={engine.serpAnalysis?.entities}
            serpTopTermsForIntent={engine.serpAnalysis?.topTermsForIntent}
            serpMedianWordCount={engine.serpAnalysis?.medianWordCount}
            serpMedianTitleLength={engine.serpAnalysis?.medianTitleLength}
            serpMedianH2Count={engine.serpAnalysis?.medianH2Count}
            targetKeyword={engine.targetKeywords}
            analysisText={editor ? editor.getText() : ''}
            analysisHtml={editor ? editor.getHTML() : ''}
            pastedText={editor ? editor.getText() : ''}
            onInsertTerm={(term) => {
              if (editor) editor.chain().focus().insertContent(` ${term}`).run();
            }}
            onHighlightWeakCopy={(phrase) => {
              if (editor) scrollToWeakTerm(editor, phrase);
            }}
            onApplyWeakCopyFix={(id, phrase, imp) => handleApplyFix(id as number, phrase, imp)}
            onRunAnalysis={handleReAnalyse}
            isAnalysing={engine.isDetectingWeakCopy}
            dismissingSet={dismissingSet}
          >
            <div className="shrink-0 px-6 py-4 border-b border-slate-100 bg-white flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Quality Assurance</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs font-semibold gap-1.5"
                onClick={handleReAnalyse}
                disabled={engine.isDetectingWeakCopy}
              >
                <RefreshCw className={`w-3 h-3 ${engine.isDetectingWeakCopy ? 'animate-spin' : ''}`} />
                Re-Analyse
              </Button>
            </div>
          </AnalysisResultsPanel>
        </div>
      </div>
    </div>
  );
}
