'use client';

import React, { createContext, useContext, useState } from 'react';
import { ArticleBlueprint, SectionBlock, KeywordBank } from '@/types/article';
import { Article, Folder, ExternalLink as ExternalLinkType, saveArticle, deleteArticle } from '@/lib/firebase/firestore';
import { ExtractedDesign } from '@/lib/extract-reference-design';
import { 
  AiKeywordResult, 
  GadsKeywordResult, 
  SerperKeywordResult, 
  IntentClassification, 
  IntentAlignment,
  EngineQaTab
} from '../types';
import { SerpTerm, SerpAnalysisResult } from '@/types/serp';
import { Editor } from '@tiptap/react';
import { highlightWeak, clearWeakHighlights, highlightAllWeakCopy, scrollToWeakTerm } from '../components/editor/EditorHighlightCommands';
import { ContentScoreResult } from '@/lib/content-scoring';

export interface SerpPreviewResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
  detectedFormat?: string;
}

interface EngineContextType {
  // Config State
  currentStep: number;
  setCurrentStep: (step: number) => void;
  title: string;
  setTitle: (title: string) => void;
  ctaIntent: string;
  setCtaIntent: (cta: string) => void;
  targetKeywords: string;
  setTargetKeywords: (kw: string) => void;
  strategyTargetKeywords: string[];
  setStrategyTargetKeywords: (kws: string[]) => void;
  isSuggestingKeywords: boolean;
  setIsSuggestingKeywords: (val: boolean) => void;

  // Keyword Mode
  keywordMode: 'ai' | 'google' | 'serper';
  setKeywordMode: (mode: 'ai' | 'google' | 'serper') => void;
  aiKeywordResults: AiKeywordResult[];
  setAiKeywordResults: (results: AiKeywordResult[]) => void;
  gadsKeywordResults: GadsKeywordResult[];
  setGadsKeywordResults: (results: GadsKeywordResult[]) => void;
  serperKeywordResults: SerperKeywordResult[];
  setSerperKeywordResults: (results: SerperKeywordResult[]) => void;
  showKeywordResults: boolean;
  setShowKeywordResults: (val: boolean) => void;
  gadsIsSimulated: boolean;
  setGadsIsSimulated: (val: boolean) => void;
  isEnhancingWithAi: boolean;
  setIsEnhancingWithAi: (val: boolean) => void;

  // Reference Extraction
  referenceUrl: string;
  setReferenceUrl: (url: string) => void;
  referenceData: ExtractedDesign | null;
  setReferenceData: (data: ExtractedDesign | null) => void;
  // Unified Extraction Pipeline State
  pipelineStage: number; // 0 = idle, 1–8 = active stage, 9 = complete
  setPipelineStage: (val: number) => void;
  pipelineError: { stage: number; message: string; canRetry: boolean } | null;
  setPipelineError: (val: { stage: number; message: string; canRetry: boolean } | null) => void;
  extractionComplete: boolean;
  setExtractionComplete: (val: boolean) => void;
  aiStrategyProfile: any | null;
  setAiStrategyProfile: (val: any | null) => void;

  // Content Structure
  contentStructureMode: 'inspire' | 'mirror';
  setContentStructureMode: (mode: 'inspire' | 'mirror') => void;

  // Generation State
  isRunning: boolean;
  setIsRunning: (val: boolean) => void;
  isGenerated: boolean;
  setIsGenerated: (val: boolean) => void;
  genStatus: string;
  setGenStatus: (status: string) => void;
  genProgress: number;
  setGenProgress: (progress: number) => void;
  blueprint: Partial<ArticleBlueprint> | null;
  setBlueprint: (blueprint: Partial<ArticleBlueprint> | null | ((prev: Partial<ArticleBlueprint> | null) => Partial<ArticleBlueprint> | null)) => void;
  sections: SectionBlock[];
  setSections: (sections: SectionBlock[] | ((prev: SectionBlock[]) => SectionBlock[])) => void;
  genError: string | null;
  setGenError: (err: string | null) => void;

  // Editor State
  tiptapContent: string;
  setTiptapContent: (val: string) => void;
  currentArticleId: string | null;
  setCurrentArticleId: (id: string | null) => void;
  saveCurrentArticle: (htmlContent: string) => Promise<void>;
  editorRef: React.MutableRefObject<Editor | null>;
  highlightWeakTerm: (term: string, category: string) => void;
  highlightAllWeakCopy: (flags: any[]) => void;
  scrollToWeakTerm: (term: string) => void;
  clearWeakHighlights: () => void;
  activeWeakChip: number | null;
  setActiveWeakChip: (val: number | null) => void;

  // Weak Copy Detector / Full QA
  enableWeakCopyDetector: boolean;
  setEnableWeakCopyDetector: (val: boolean) => void;
  isDetectingWeakCopy: boolean;
  setIsDetectingWeakCopy: (val: boolean) => void;
  weakCopyFlags: any[];
  setWeakCopyFlags: (flags: any[]) => void;
  analysisResults: any | null;
  setAnalysisResults: (val: any | null) => void;
  contentScore: ContentScoreResult | null;
  setContentScore: (val: ContentScoreResult | null) => void;

  // Campaign Mode
  campaignMode: 'own_blog' | 'guest_post';
  setCampaignMode: (mode: 'own_blog' | 'guest_post') => void;
  guestPostBacklinkUrl: string;
  setGuestPostBacklinkUrl: (url: string) => void;
  guestPostTargetPublication: string;
  setGuestPostTargetPublication: (pub: string) => void;

  // Data
  todoArticles: Article[];
  setTodoArticles: (articles: Article[] | ((prev: Article[]) => Article[])) => void;
  publishedArticles: Article[];
  setPublishedArticles: (articles: Article[] | ((prev: Article[]) => Article[])) => void;
  externalLinks: ExternalLinkType[];
  setExternalLinks: (links: ExternalLinkType[]) => void;
  folders: Folder[];
  setFolders: (folders: Folder[]) => void;

  // Selection
  selectedTodoIdea: string;
  currentArticleStage: 'Todo' | 'Draft' | 'Published';
  setCurrentArticleStage: (stage: 'Todo' | 'Draft' | 'Published') => void;
  setSelectedTodoIdea: (id: string) => void;
  planRole: 'primary' | 'support' | null;
  setPlanRole: (role: 'primary' | 'support' | null) => void;
  activeKeyword: string | null;
  setActiveKeyword: (kw: string | null) => void;

  // Intent & SERP
  intentClassification: IntentClassification | null;
  setIntentClassification: (val: IntentClassification | null) => void;
  intentAlignment: IntentAlignment | null;
  setIntentAlignment: (val: IntentAlignment | null) => void;
  serpTerms: SerpTerm[];
  setSerpTerms: (terms: SerpTerm[]) => void;
  serpAnalysis: SerpAnalysisResult | null;
  setSerpAnalysis: (val: SerpAnalysisResult | null) => void;
  keywordBank: KeywordBank | null;
  setKeywordBank: (bank: KeywordBank | null | ((prev: KeywordBank | null) => KeywordBank | null)) => void;

  // SERP Preview Panel
  serpPreviewResults: SerpPreviewResult[];
  setSerpPreviewResults: (results: SerpPreviewResult[]) => void;
  selectedSerpResult: SerpPreviewResult | null;
  setSelectedSerpResult: (result: SerpPreviewResult | null) => void;
  isFetchingSerpPreview: boolean;
  setIsFetchingSerpPreview: (val: boolean) => void;

  // Editor/UI State
  activeQaTab: EngineQaTab;
  setActiveQaTab: (tab: EngineQaTab) => void;
  showDashboardModal: boolean;
  setShowDashboardModal: (val: boolean) => void;
  showGadsModal: boolean;
  setShowGadsModal: (val: boolean) => void;
  gadsConnected: boolean;
  setGadsConnected: (val: boolean) => void;
  gadsCreds: {
    developerToken: string;
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    customerId: string;
  };
  setGadsCreds: (creds: any) => void;

  abortGeneration: () => void;
  setAbortController: (ac: AbortController) => void;
  deleteCurrentArticle: () => Promise<void>;
}

const EngineContext = createContext<EngineContextType | undefined>(undefined);

export function EngineProvider({ children }: { children: React.ReactNode }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [title, setTitle] = useState('');
  const [ctaIntent, setCtaIntent] = useState('');
  const [targetKeywords, setTargetKeywords] = useState('');
  const [strategyTargetKeywords, setStrategyTargetKeywords] = useState<string[]>([]);
  const [isSuggestingKeywords, setIsSuggestingKeywords] = useState(false);
  const [keywordMode, setKeywordMode] = useState<'ai' | 'google' | 'serper'>('ai');
  const [aiKeywordResults, setAiKeywordResults] = useState<AiKeywordResult[]>([]);
  const [gadsKeywordResults, setGadsKeywordResults] = useState<GadsKeywordResult[]>([]);
  const [serperKeywordResults, setSerperKeywordResults] = useState<SerperKeywordResult[]>([]);
  const [showKeywordResults, setShowKeywordResults] = useState(false);
  const [gadsIsSimulated, setGadsIsSimulated] = useState(true);
  const [isEnhancingWithAi, setIsEnhancingWithAi] = useState(false);
  const [referenceUrl, setReferenceUrl] = useState('');
  const [referenceData, setReferenceData] = useState<ExtractedDesign | null>(null);
  const [pipelineStage, setPipelineStage] = useState(0);
  const [pipelineError, setPipelineError] = useState<{ stage: number; message: string; canRetry: boolean } | null>(null);
  const [extractionComplete, setExtractionComplete] = useState(false);
  const [aiStrategyProfile, setAiStrategyProfile] = useState<any | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isGenerated, setIsGenerated] = useState(false);
  const [genStatus, setGenStatus] = useState('');
  const [genProgress, setGenProgress] = useState(0);
  const [blueprint, setBlueprint] = useState<Partial<ArticleBlueprint> | null>(null);
  const [sections, setSections] = useState<SectionBlock[]>([]);
  const [genError, setGenError] = useState<string | null>(null);

  // Editor State
  const [tiptapContent, setTiptapContent] = useState('');
  const [currentArticleId, setCurrentArticleId] = useState<string | null>(null);
  const [currentArticleStage, setCurrentArticleStage] = useState<'Todo' | 'Draft' | 'Published'>('Todo');
  const editorRef = React.useRef<Editor | null>(null);
  const [activeWeakChip, setActiveWeakChip] = useState<number | null>(null);

  const saveCurrentArticle = async (htmlContent: string) => {
    try {
      // If the current stage is Todo, promote it to Draft upon saving.
      // If it is already Draft or Published, preserve that status.
      const newStage = currentArticleStage === 'Todo' ? 'Draft' : currentArticleStage;
      
      const savedId = await saveArticle({
        id: currentArticleId || undefined,
        title: title || 'Untitled Draft',
        content: htmlContent,
        folder: 'uncategorized',
        stage: newStage,
        targetKeywords: targetKeywords ? [targetKeywords] : [],
        referenceUrl: referenceUrl,
        blueprint: blueprint,
        analysisResults: analysisResults,
        contentScore: contentScore,
        serpAnalysis: serpAnalysis || {
          terms: serpTerms,
          entities: [],
          medianWordCount: referenceData?.advancedMetrics?.wordCount || 0,
          medianTitleLength: 60,
          medianH2Count: 5
        }
      });

      // Update local state arrays for immediate UI feedback in dashboard
      const updatedArticle = {
        id: savedId,
        title: title || 'Untitled Draft',
        content: htmlContent,
        stage: newStage,
        analysisResults: analysisResults,
        contentScore: contentScore,
        updatedAt: { seconds: Date.now() / 1000 }
      } as any;

      if (!currentArticleId) {
        setCurrentArticleId(savedId);
        setTodoArticles(prev => [updatedArticle, ...prev]);
        setSelectedTodoIdea(savedId);
      } else {
        setTodoArticles(prev => prev.map(a => a.id === savedId ? { ...a, ...updatedArticle } : a));
        setSelectedTodoIdea(savedId);
      }

      try {
        localStorage.setItem('last_active_article_id', savedId);
      } catch (e) {}

      if (currentArticleStage !== newStage) {
        setCurrentArticleStage(newStage);
      }
    } catch (e) {
      console.error('Failed to save article', e);
    }
  };

  const deleteCurrentArticle = async () => {
    if (!currentArticleId) return;
    try {
      await deleteArticle(currentArticleId);
      
      // Clear local state
      setTiptapContent('');
      setCurrentArticleId(null);
      setAnalysisResults(null);
      setContentScore(null);
      setSerpTerms([]);
      setBlueprint(null);
      setSections([]);
      setTitle('');
      setTargetKeywords('');
      setIsGenerated(false);
      setIsRunning(false);
      setCurrentStep(0);
      setSelectedTodoIdea('');
      
      // Thorough reset of all configuration state
      setActiveKeyword('');
      setCtaIntent('');
      setAiKeywordResults([]);
      setGadsKeywordResults([]);
      setSerperKeywordResults([]);
      setShowKeywordResults(false);
      setReferenceUrl('');
      setReferenceData(null);
      setPipelineStage(0);
      setExtractionComplete(false);
      setAiStrategyProfile(null);
      setIntentClassification(null);
      setIntentAlignment(null);
      setKeywordBank(null);
      setStrategyTargetKeywords([]);
      setGenStatus('');
      setGenProgress(0);
      setGenError(null);
      
      // Update lists
      setTodoArticles(prev => prev.filter(a => a.id !== currentArticleId));
      setPublishedArticles(prev => prev.filter(a => a.id !== currentArticleId));

      // Clear related LocalStorage
      try {
        const cacheKey = `ext_cache_${title}_${referenceUrl}`;
        localStorage.removeItem(cacheKey);
        const serpCacheKey = `serp_cache_${title}_${targetKeywords.split(',')[0].trim()}`;
        localStorage.removeItem(serpCacheKey);
        localStorage.removeItem('last_active_article_id');
      } catch (e) {}

    } catch (e) {
      console.error('Failed to delete article', e);
      throw e;
    }
  };

  const contextHighlightWeakTerm = (term: string, category: string) => {

    if (editorRef.current) {
      highlightWeak(editorRef.current, term, category);
    }
  };

  const contextHighlightAllWeakCopy = (flags: any[]) => {
    if (editorRef.current) {
      highlightAllWeakCopy(editorRef.current, flags);
    }
  };

  const contextScrollToWeakTerm = (term: string) => {
    if (editorRef.current) {
      scrollToWeakTerm(editorRef.current, term);
    }
  };

  const contextClearWeakHighlights = () => {
    if (editorRef.current) {
      clearWeakHighlights(editorRef.current);
    }
  };

  // Weak Copy Detector state / Full QA state
  const [enableWeakCopyDetector, setEnableWeakCopyDetector] = useState(false);
  const [isDetectingWeakCopy, setIsDetectingWeakCopy] = useState(false);
  const [weakCopyFlags, setWeakCopyFlags] = useState<any[]>([]);
  const [analysisResults, setAnalysisResults] = useState<any | null>(null);
  const [contentScore, setContentScore] = useState<ContentScoreResult | null>(null);

  const [campaignMode, setCampaignMode] = useState<'own_blog' | 'guest_post'>('own_blog');
  const [guestPostBacklinkUrl, setGuestPostBacklinkUrl] = useState('');
  const [guestPostTargetPublication, setGuestPostTargetPublication] = useState('');
  const [todoArticles, setTodoArticles] = useState<Article[]>([]);
  const [publishedArticles, setPublishedArticles] = useState<Article[]>([]);
  const [externalLinks, setExternalLinks] = useState<ExternalLinkType[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedTodoIdea, setSelectedTodoIdea] = useState<string>('');
  const [planRole, setPlanRole] = useState<'primary' | 'support' | null>(null);
  const [activeKeyword, setActiveKeyword] = useState<string | null>(null);
  const [intentClassification, setIntentClassification] = useState<IntentClassification | null>(null);
  const [intentAlignment, setIntentAlignment] = useState<IntentAlignment | null>(null);
  const [serpTerms, setSerpTerms] = useState<SerpTerm[]>([]);
  const [serpAnalysis, setSerpAnalysis] = useState<SerpAnalysisResult | null>(null);
  const [keywordBank, setKeywordBank] = useState<KeywordBank | null>(null);
  const [activeQaTab, setActiveQaTab] = useState<EngineQaTab>('score');
  const [showDashboardModal, setShowDashboardModal] = useState(false);
  const [showGadsModal, setShowGadsModal] = useState(false);
  const [gadsConnected, setGadsConnected] = useState(false);
  const [gadsCreds, setGadsCreds] = useState({
    developerToken: '',
    clientId: '',
    clientSecret: '',
    refreshToken: '',
    customerId: '',
  });

  const [contentStructureMode, setContentStructureMode] = useState<'inspire' | 'mirror'>('inspire');
  const [serpPreviewResults, setSerpPreviewResults] = useState<SerpPreviewResult[]>([]);
  const [selectedSerpResult, setSelectedSerpResult] = useState<SerpPreviewResult | null>(null);
  const [isFetchingSerpPreview, setIsFetchingSerpPreview] = useState(false);
  const generationAbortController = React.useRef<AbortController | null>(null);

  const value: EngineContextType = {
    currentStep, setCurrentStep,
    title, setTitle,
    ctaIntent, setCtaIntent,
    targetKeywords, setTargetKeywords,
    strategyTargetKeywords, setStrategyTargetKeywords,
    isSuggestingKeywords, setIsSuggestingKeywords,
    keywordMode, setKeywordMode,
    aiKeywordResults, setAiKeywordResults,
    gadsKeywordResults, setGadsKeywordResults,
    serperKeywordResults, setSerperKeywordResults,
    showKeywordResults, setShowKeywordResults,
    gadsIsSimulated, setGadsIsSimulated,
    isEnhancingWithAi, setIsEnhancingWithAi,
    referenceUrl, setReferenceUrl,
    referenceData, setReferenceData,
    pipelineStage, setPipelineStage,
    pipelineError, setPipelineError,
    extractionComplete, setExtractionComplete,
    aiStrategyProfile, setAiStrategyProfile,
    contentStructureMode, setContentStructureMode,
    isRunning, setIsRunning,
    isGenerated, setIsGenerated,
    genStatus, setGenStatus,
    genProgress, setGenProgress,
    blueprint, setBlueprint,
    sections, setSections,
    genError, setGenError,
    tiptapContent, setTiptapContent,
    currentArticleId, setCurrentArticleId,
    currentArticleStage, setCurrentArticleStage,
    saveCurrentArticle,
    editorRef,
    highlightWeakTerm: contextHighlightWeakTerm,
    highlightAllWeakCopy: contextHighlightAllWeakCopy,
    scrollToWeakTerm: contextScrollToWeakTerm,
    clearWeakHighlights: contextClearWeakHighlights,
    activeWeakChip, setActiveWeakChip,
    enableWeakCopyDetector, setEnableWeakCopyDetector,
    isDetectingWeakCopy, setIsDetectingWeakCopy,
    weakCopyFlags, setWeakCopyFlags,
    analysisResults, setAnalysisResults,
    contentScore, setContentScore,
    campaignMode, setCampaignMode,
    guestPostBacklinkUrl, setGuestPostBacklinkUrl,
    guestPostTargetPublication, setGuestPostTargetPublication,
    todoArticles, setTodoArticles,
    publishedArticles, setPublishedArticles,
    externalLinks, setExternalLinks,
    folders, setFolders,
    selectedTodoIdea, setSelectedTodoIdea,
    planRole, setPlanRole,
    activeKeyword, setActiveKeyword,
    intentClassification, setIntentClassification,
    intentAlignment, setIntentAlignment,
    serpTerms, setSerpTerms,
    serpAnalysis, setSerpAnalysis,
    keywordBank, setKeywordBank,
    serpPreviewResults, setSerpPreviewResults,
    selectedSerpResult, setSelectedSerpResult,
    isFetchingSerpPreview, setIsFetchingSerpPreview,
    activeQaTab, setActiveQaTab,
    showDashboardModal, setShowDashboardModal,
    showGadsModal, setShowGadsModal,
    gadsConnected, setGadsConnected,
    gadsCreds, setGadsCreds,
    abortGeneration: () => {
      if (generationAbortController.current) {
        generationAbortController.current.abort();
        generationAbortController.current = null;
      }
    },
    setAbortController: (ac: AbortController) => {
      generationAbortController.current = ac;
    },
    deleteCurrentArticle
  };

  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
}

export function useEngine() {
  const context = useContext(EngineContext);
  if (context === undefined) {
    throw new Error('useEngine must be used within an EngineProvider');
  }
  return context;
}

/**
 * Like useEngine but returns null when used outside an EngineProvider.
 * Use this in components that are shared across routes where the engine
 * context may not be present (e.g. ContentDashboard on /dashboard).
 */
export function useEngineOptional(): EngineContextType | null {
  const context = useContext(EngineContext);
  return context ?? null;
}
