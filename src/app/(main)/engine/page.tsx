'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
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

function EnginePageContent() {
  const engine = useEngine();
  const searchParams = useSearchParams();
  const todoId = searchParams.get('todo_id');
  const [mounted, setMounted] = useState(false);

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
          {/* Navigation Header */}
          {(!engine.isGenerated && !engine.isRunning) && (
            <WizardStepIndicator
              currentStep={engine.currentStep}
              isRunning={engine.isRunning}
              setCurrentStep={engine.setCurrentStep}
            />
          )}

          {/* Content Area */}
          {(!engine.isGenerated && !engine.isRunning) ? (
            <div className="space-y-12 pb-24 mt-12">
              {engine.currentStep === 0 && <StepTopicKeywords />}
              {engine.currentStep === 1 && <StepSerpResults />}
              {engine.currentStep === 2 && <StepExtraction />}
              {engine.currentStep === 3 && <StepAuthor />}
              {engine.currentStep === 4 && <StepFinalConfig />}
            </div>
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