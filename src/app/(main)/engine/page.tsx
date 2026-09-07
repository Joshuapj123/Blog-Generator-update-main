'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Globe, Sparkles, Wand2, ArrowRight } from 'lucide-react';
import { useEngine, EngineProvider } from './context/EngineContext';
import { WizardStepIndicator } from './components/WizardStepIndicator';
import { StepTopicKeywords } from './components/WizardSteps/StepTopicKeywords';
import { StepSerpResults } from './components/WizardSteps/StepSerpResults';
import { StepExtraction } from './components/WizardSteps/StepExtraction';
import { StepAuthor } from './components/WizardSteps/StepAuthor';
import { StepFinalConfig } from './components/WizardSteps/StepFinalConfig';
import { SectionEditor } from './components/SectionEditor';
import { GoogleAdsModal } from './components/GoogleAdsModal';
import { getArticles, getFolders, getExternalLinks } from '@/lib/firebase/firestore';
import { Button } from '@/components/ui/button';
import { useGenerationPipeline } from './hooks/useGenerationPipeline';

function EnginePageContent() {
  const engine = useEngine();
  const searchParams = useSearchParams();
  const todoId = searchParams.get('todo_id');
  const [mounted, setMounted] = useState(false);
  const [useAutopilot, setUseAutopilot] = useState(true);
  const [autopilotUrl, setAutopilotUrl] = useState('');
  const { startAutopilotPipeline } = useGenerationPipeline();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Load Firestore data on mount
  useEffect(() => {
    async function init() {
      const [articles, fold, ext] = await Promise.all([
        getArticles(),
        getFolders(),
        getExternalLinks()
      ]);
      const todoArticles = articles.filter(a => a.stage === 'Todo' || a.stage === 'Draft');
      const publishedArticles = articles.filter(a => a.stage === 'Published');
      engine.setTodoArticles(todoArticles);
      engine.setPublishedArticles(publishedArticles);
      engine.setFolders(fold);
      engine.setExternalLinks(ext);

      // Auto-populate from planning page redirect
      const allArticles = [...todoArticles, ...publishedArticles];
      if (todoId && allArticles.some(a => a.id === todoId)) {
        engine.setSelectedTodoIdea(todoId);
        try { localStorage.setItem('last_active_article_id', todoId); } catch(e) {}
      } else {
        try {
          const lastActive = localStorage.getItem('last_active_article_id');
          if (lastActive && lastActive !== 'undefined' && lastActive !== 'null' && allArticles.some(a => a.id === lastActive)) {
            engine.setSelectedTodoIdea(lastActive);
          } else {
            engine.setSelectedTodoIdea('');
            try { localStorage.removeItem('last_active_article_id'); } catch(e) {}
          }
        } catch(e) {}
      }
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load selected article data into editor state
  useEffect(() => {
    if (!engine.selectedTodoIdea || engine.selectedTodoIdea === engine.currentArticleId) return;
    const allArticles = [...engine.todoArticles, ...engine.publishedArticles];
    const matched = allArticles.find(a => a.id === engine.selectedTodoIdea);
    if (!matched) return;

    // Reset editor state before loading new article
    engine.setTiptapContent('');
    engine.setIsGenerated(false);
    engine.setTitle(matched.title || '');

    engine.setCurrentArticleStage(matched.stage);
    let parsedKeyword = matched.sourceKeyword || '';

    // Check if content exists and if the stage is ready for the editor
    const hasGeneratedContent = matched.content && matched.content.trim().length > 0;
    const isGenerated = (matched.stage === 'Draft' || matched.stage === 'Published') && hasGeneratedContent;

    if (isGenerated) {
        engine.setTitle(matched.title || '');
        if (parsedKeyword) {
            const primaryKw = parsedKeyword.split(',')[0].trim();
            engine.setActiveKeyword(primaryKw);
            engine.setTargetKeywords(primaryKw);
        }
        engine.setTiptapContent(matched.content);
        engine.setIsGenerated(true);
        if (matched.blueprint) engine.setBlueprint(matched.blueprint);
        if (matched.referenceUrl) engine.setReferenceUrl(matched.referenceUrl);
        engine.setCurrentArticleId(matched.id!);
        engine.setCurrentArticleStage(matched.stage);

        // Load persisted QA results
        if (matched.analysisResults) {
          engine.setAnalysisResults(matched.analysisResults);
          if (matched.analysisResults.weakCopyItems) {
            const flags = matched.analysisResults.weakCopyItems.map((w: any) => ({
              originalPhrase: w.phrase,
              suggestedRewrite: w.improvement,
              category: 'weak copy',
              reasoning: ''
            }));
            engine.setWeakCopyFlags(flags);
          }
        }
        if (matched.contentScore) {
          engine.setContentScore(matched.contentScore);
        }
        if (matched.serpAnalysis) {
          engine.setSerpAnalysis(matched.serpAnalysis);
          if (matched.serpAnalysis.terms) {
            engine.setSerpTerms(matched.serpAnalysis.terms);
          }
        }
    } else {
        engine.setCurrentArticleId(matched.id!);
        // Legacy JSON format check
        try {
            if (matched.content) {
                const parsed = JSON.parse(matched.content);
                // Transition legacy complete drafts into the preview editor
                if (parsed.blueprint && parsed.sections && parsed.sections.length > 0) {
                    engine.setTitle(parsed.blueprint.title || matched.title || '');
                    if (parsedKeyword) {
                        const primaryKw = parsedKeyword.split(',')[0].trim();
                        engine.setActiveKeyword(primaryKw);
                        engine.setTargetKeywords(primaryKw);
                    }
                    engine.setBlueprint(parsed.blueprint);
                    engine.setSections(parsed.sections);
                    engine.setTiptapContent(''); // Empty content triggers the SectionEditor to render the HTML from sections
                    engine.setCurrentArticleId(matched.id!);
                    engine.setIsGenerated(true);
                }
                else if (parsed.topicIdea) {
                    engine.setTitle(parsed.topicIdea.title || matched.title || '');
                    const kw = parsed.topicIdea.keywords || parsedKeyword;
                    const primaryKw = kw.split(',')[0].trim();
                    engine.setActiveKeyword(primaryKw);
                    engine.setTargetKeywords(primaryKw);
                    engine.setCtaIntent(
                        parsed.topicIdea.intent === 'transactional'
                        ? 'Sign up for our product'
                        : 'Read more content'
                    );
                } else {
                    engine.setTitle(matched.title || '');
                    if (parsedKeyword) {
                        const primaryKw = parsedKeyword.split(',')[0].trim();
                        engine.setActiveKeyword(primaryKw);
                        engine.setTargetKeywords(primaryKw);
                    }
                }
            } else {
                engine.setTitle(matched.title || '');
                if (parsedKeyword) {
                    const primaryKw = parsedKeyword.split(',')[0].trim();
                    engine.setActiveKeyword(primaryKw);
                    engine.setTargetKeywords(primaryKw);
                }
            }
        } catch {
            engine.setTitle(matched.title || '');
            if (parsedKeyword) {
                const primaryKw = parsedKeyword.split(',')[0].trim();
                engine.setActiveKeyword(primaryKw);
                engine.setTargetKeywords(primaryKw);
            }
        }
    }

    // Restore plan context
    if (matched.planRole) engine.setPlanRole(matched.planRole);
    engine.setStrategyTargetKeywords(matched.targetKeywords || []);
    if (matched.keywordBank) engine.setKeywordBank(matched.keywordBank);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.selectedTodoIdea, engine.todoArticles, engine.publishedArticles]);

  if (!mounted) {
    return (
      <main className="flex-1 flex flex-col h-screen overflow-hidden items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <span className="text-xs text-slate-400 font-semibold tracking-wide uppercase">Loading Workspace…</span>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col h-screen overflow-hidden relative selection:bg-indigo-100 selection:text-indigo-900">
      <div className="flex-1 overflow-y-auto scroll-smooth">
        <div className={(!engine.isGenerated && !engine.isRunning) ? 'max-w-4xl mx-auto' : 'max-w-[1400px] mx-auto h-full'}>
          {/* Mode Switcher Header */}
          {(!engine.isGenerated && !engine.isRunning) && (
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-6 border-b border-slate-200 mt-8 mb-6">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Create New Article</h1>
                <p className="text-slate-500 text-sm">Choose between fully autonomous mode or granular setup steps.</p>
              </div>
              <div className="flex p-1 bg-slate-100 rounded-full shadow-inner border border-slate-200">
                <button
                  type="button"
                  onClick={() => setUseAutopilot(true)}
                  className={`px-4 py-2 rounded-full text-xs font-semibold transition-all duration-300 flex items-center gap-1.5 ${
                    useAutopilot ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Autonomous Autopilot
                </button>
                <button
                  type="button"
                  onClick={() => setUseAutopilot(false)}
                  className={`px-4 py-2 rounded-full text-xs font-semibold transition-all duration-300 flex items-center gap-1.5 ${
                    !useAutopilot ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  Manual Setup Wizard
                </button>
              </div>
            </div>
          )}

          {/* Navigation Header for Wizard */}
          {(!engine.isGenerated && !engine.isRunning && !useAutopilot) && (
            <WizardStepIndicator
              currentStep={engine.currentStep}
              isRunning={engine.isRunning}
              setCurrentStep={engine.setCurrentStep}
            />
          )}

          {/* Content Area */}
          {(!engine.isGenerated && !engine.isRunning) ? (
            useAutopilot ? (
              <div className="mt-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="bg-white rounded-[2rem] p-10 shadow-xl shadow-slate-100 border border-slate-200 space-y-8">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center shrink-0 border border-indigo-100 shadow-sm">
                      <Globe className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div className="space-y-1">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-100">
                        <Sparkles className="w-3 h-3" /> Recommended Mode
                      </div>
                      <h2 className="text-xl font-bold text-slate-900 mt-2">Generate Your Blog Autonomously</h2>
                      <p className="text-slate-500 text-sm font-light leading-relaxed">
                        Enter your website's URL. The AI agent will crawl your site, extract your product positioning, discover search keywords, query SERP and GEO intelligence, and draft a high-scoring article in one click.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Website Home URL</label>
                    <div className="flex gap-4">
                      <input
                        type="text"
                        placeholder="e.g. open.slokas.app or https://yourwebsite.com"
                        value={autopilotUrl}
                        onChange={(e) => setAutopilotUrl(e.target.value)}
                        className="flex-1 px-4 py-3.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50 text-sm font-medium shadow-inner"
                      />
                      <Button
                        onClick={() => {
                          const trimmed = autopilotUrl.trim();
                          if (trimmed) {
                            const normalized = !/^https?:\/\//i.test(trimmed) ? `https://${trimmed}` : trimmed;
                            startAutopilotPipeline(normalized);
                          }
                        }}
                        disabled={!autopilotUrl.trim()}
                        className="px-6 rounded-xl font-semibold bg-gradient-to-br from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white gap-2 shadow-lg shadow-indigo-200 border-none shrink-0"
                      >
                        Generate Blog
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {engine.genError && (
                    <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium flex items-center gap-3">
                      <span className="shrink-0 font-bold bg-rose-200 text-rose-800 w-5 h-5 rounded-full flex items-center justify-center text-xs">!</span>
                      <span>{engine.genError}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-12 pb-24 mt-12">
                {engine.currentStep === 0 && <StepTopicKeywords />}
                {engine.currentStep === 1 && <StepSerpResults />}
                {engine.currentStep === 2 && <StepExtraction />}
                {engine.currentStep === 3 && <StepAuthor />}
                {engine.currentStep === 4 && <StepFinalConfig />}
              </div>
            )
          ) : (
            <div className="flex h-full">
              <SectionEditor />
            </div>
          )}
        </div>
      </div>

      <GoogleAdsModal
        isOpen={engine.showGadsModal}
        onClose={() => engine.setShowGadsModal(false)}
        onConnected={(val: boolean) => engine.setGadsConnected(val)}
        setGadsCreds={engine.setGadsCreds}
      />
    </main>
  );
}

export default function EnginePage() {
  return (
    <EngineProvider>
      <Suspense fallback={null}>
        <EnginePageContent />
      </Suspense>
    </EngineProvider>
  );
}