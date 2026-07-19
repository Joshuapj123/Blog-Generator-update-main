'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Loader2, Sparkles, CheckCircle2, AlertCircle, Target, Map, BookOpen, AlertTriangle, ArrowRight, Zap, Scale, LayoutDashboard, ChevronDown, ChevronUp, ClipboardList, CheckSquare, BookmarkPlus, Trash2, Plus, Link2, Pencil, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ContentPlan, RecommendedPage, KeywordTarget, saveContentPlan, deleteContentPlan, saveArticle, Article, getContentPlans, getArticles, getExternalLinks, saveExternalLink, deleteExternalLink, ExternalLink as ExternalLinkType } from '@/lib/firebase/firestore';
import { useRouter } from 'next/navigation';

import { KeywordManagerModal } from '@/components/ui/KeywordManagerModal';

export default function PlanningPage() {
  const router = useRouter();
  
  const [productDescription, setProductDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<ContentPlan | null>(null);
  
  const [newRole, setNewRole] = useState<'primary'|'support'>('support');
  const [newTitle, setNewTitle] = useState('');
  const [newKeyword, setNewKeyword] = useState('');
  const [newIntent, setNewIntent] = useState('informational');
  const [newFormat, setNewFormat] = useState('How-to Guide');

  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [generatingIndex, setGeneratingIndex] = useState<number | null>(null);
  const [showKeywordModal, setShowKeywordModal] = useState(false);
  
  const [savedPlans, setSavedPlans] = useState<ContentPlan[]>([]);
  const [planArticles, setPlanArticles] = useState<Article[]>([]);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [planTitle, setPlanTitle] = useState('Your Strategy Dashboard');
  const [expandedGoals, setExpandedGoals] = useState<Record<number, boolean>>({ 0: true }); // Expand first goal by default
  const [activeTab, setActiveTab] = useState<'strategy' | 'planner'>('strategy');

  const [globalReferences, setGlobalReferences] = useState<ExternalLinkType[]>([]);
  const [newRefUrl, setNewRefUrl] = useState('');
  const [newRefTitle, setNewRefTitle] = useState('');
  const [isAddingRef, setIsAddingRef] = useState(false);

  // Weekly Digest States
  const [siteProfile, setSiteProfile] = useState('');
  const [isSuggestingTopics, setIsSuggestingTopics] = useState(false);
  const [topicSuggestions, setTopicSuggestions] = useState<any[]>([]);
  const [additionMode, setAdditionMode] = useState<'ai' | 'manual'>('ai');

  useEffect(() => {
    async function loadData() {
      try {
        const [plans, allArticles, links] = await Promise.all([getContentPlans(), getArticles(), getExternalLinks()]);
        const sortedPlans = plans.reverse();
        setSavedPlans(sortedPlans);
        if (sortedPlans.length > 0) {
          setPlan(sortedPlans[0]);
          setPlanTitle(sortedPlans[0].title || 'Your Strategy Dashboard');
        }
        // Only keep articles linked to a plan
        setPlanArticles(allArticles.filter(a => a.planId));
        // Set curated global references
        setGlobalReferences(links.filter(l => l.folder === 'Reference Source'));
      } catch (err) {
        console.error('Failed to load saved plans:', err);
      }
    }
    loadData();
  }, []);

  const handleGeneratePlan = async () => {
    if (!productDescription.trim()) return;
    setIsGenerating(true);
    setError('');
    
    try {
      const res = await fetch('/api/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productDescription })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate plan');
      
      const newPlan = { 
        ...data, 
        productDescription, 
        title: data.title || `Strategy: ${productDescription.substring(0, 30)}...` 
      } as ContentPlan;
      
      // Auto-save immediately to prevent data loss on page refresh/HMR
      const planId = await saveContentPlan(newPlan);
      const persistedPlan = { ...newPlan, id: planId };
      
      setPlan(persistedPlan);
      setPlanTitle(persistedPlan.title!);
      setSavedPlans(prev => [persistedPlan, ...prev]);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred generating the plan.');
    } finally {
      setIsGenerating(false);
    }
  };


  const handleSuggestTopics = async () => {
    if (!siteProfile) return;
    setIsSuggestingTopics(true);
    try {
      const res = await fetch('/api/suggest-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteProfile }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTopicSuggestions(data.suggestions || []);
    } catch (err: any) {
      alert('Failed to suggest topics: ' + err.message);
    } finally {
      setIsSuggestingTopics(false);
    }
  };

  const handleAddSuggestedTopic = async (topic: any) => {
    if (!plan) return;
    const newPage: RecommendedPage = {
      role: 'support',
      title: topic.title,
      keyword: topic.keywords,
      format: 'Article',
      intent: topic.intent || 'informational',
      selected: true
    };
    
    const updatedPlan = {
      ...plan,
      recommendedPages: [...(plan.recommendedPages || []), newPage]
    };
    
    setPlan(updatedPlan);
    
    // Remove from suggestions
    setTopicSuggestions(prev => prev.filter(t => t.title !== topic.title));

    // Auto-save for persistence
    if (plan.id) {
      try {
        await saveContentPlan(updatedPlan);
      } catch (e) {
        console.error("Auto-save failed:", e);
      }
    }
  };

  const handleSavePlanOnly = async () => {
    if (!plan) return;
    setIsSavingPlan(true);
    try {
      const planId = await saveContentPlan({
        ...plan,
        productDescription,
        title: planTitle
      });
      setPlan({ ...plan, id: planId, title: planTitle });
      alert('Strategy Dashboard saved successfully!');
      // Navigate or keep showing dashboard
    } catch (err) {
      console.error(err);
      alert('Failed to save the plan.');
    } finally {
      setIsSavingPlan(false);
    }
  };

  const handleDeletePlan = async () => {
    if (!plan || !plan.id) return;
    if (!confirm('Are you sure you want to delete this strategy plan?')) return;
    try {
      await deleteContentPlan(plan.id);
      setPlan(null);
      setSavedPlans(prev => prev.filter(p => p.id !== plan?.id));
      alert('Strategy Dashboard deleted.');
    } catch(err) {
      alert('Failed to delete the plan.');
    }
  };

  const handleGenerateSingle = async (page: RecommendedPage, index: number, existingDraft?: Article) => {
    if (!plan || !plan.id) {
       alert("Please save the plan first.");
       return;
    }
    setGeneratingIndex(index);
    try {
      let draftId = existingDraft?.id;
      if (!existingDraft) {
        const newArticle: Article = {
          title: page.title,
          content: JSON.stringify({
             topicIdea: {
               title: page.title,
               keywords: page.keyword,
               intent: page.intent
             }
          }),
          folder: 'Strategy Drafts',
          stage: 'Todo',
          planId: plan.id,
          planRole: page.role,
          clusterOrder: 0,
          sourceKeyword: page.keyword,
          targetKeywords: plan.targetKeywords,
          selectedForGeneration: true,
          engineStage: 'idea'
        };
        draftId = await saveArticle(newArticle);
      }
      router.push(`/engine?todo_id=${draftId}`);
    } catch (err) {
      console.error(err);
      alert('Failed to generate draft.');
      setGeneratingIndex(null);
    }
  };

  const handleAddCustomPage = async () => {
    if (!plan || !newTitle || !newKeyword) return;
    const newPage: RecommendedPage = {
      role: newRole,
      title: newTitle,
      keyword: newKeyword,
      intent: newIntent,
      format: newFormat,
      selected: true
    };
    
    const updatedPlan = {
      ...plan,
      recommendedPages: [...plan.recommendedPages, newPage]
    };
    
    setPlan(updatedPlan);
    setNewTitle('');
    setNewKeyword('');

    // Auto-save for persistence
    if (plan.id) {
      try {
        await saveContentPlan(updatedPlan);
      } catch (e) {
        console.error("Auto-save failed:", e);
      }
    }
  };



  const handleToggleTask = (goalIdx: number, taskIdx: number) => {
    if (!plan?.actionPlan) return;
    const newActionPlan = [...plan.actionPlan];
    const newTasks = [...newActionPlan[goalIdx].tasks];
    newTasks[taskIdx] = { ...newTasks[taskIdx], completed: !newTasks[taskIdx].completed };
    newActionPlan[goalIdx] = { ...newActionPlan[goalIdx], tasks: newTasks };
    setPlan({ ...plan, actionPlan: newActionPlan });
  };

  const toggleGoal = (idx: number) => {
    setExpandedGoals(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex-1 overflow-hidden">
      {/* ── Main Content Area ──────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-y-auto w-full relative">
        <div className="container mx-auto p-8 max-w-6xl min-h-screen">

      {!plan && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="mb-10 text-center max-w-3xl mx-auto">
            <h1 className="text-4xl font-serif font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
              Content Intelligence &amp; Strategy
            </h1>
            <p className="text-muted-foreground">
              Enter your product or service description below. We will analyze live Google SERP data to build a topical authority roadmap—with a focused money page and supporting cluster—specifically designed to drive revenue.
            </p>
          </div>

          <div className="max-w-2xl mx-auto bg-white rounded-xl border shadow-sm p-6 mb-8">
          <label className="block text-sm font-semibold mb-2">Product / Space Description</label>
          <textarea
            className="w-full min-h-[120px] p-4 rounded-lg border bg-background text-sm resize-none mb-4 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            placeholder="e.g. A B2B SaaS platform that automates keyword research and content clustering for SEO agencies..."
            value={productDescription}
            onChange={(e) => setProductDescription(e.target.value)}
            disabled={isGenerating}
          />
          <Button 
            className="w-full h-12 text-md gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700" 
            onClick={handleGeneratePlan}
            disabled={isGenerating || !productDescription.trim()}
          >
            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
            {isGenerating ? 'Analyzing SERP & Generating Roadmap...' : 'Generate Strategy Roadmap'}
          </Button>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm flex items-start gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              {error}
            </div>
          )}
          </div>
        </div>
      )}


      {plan && (
        <div className="space-y-8 animate-in fade-in duration-500">
          
          {/* Header Action Bar */}
          <div className="bg-white rounded-2xl shadow-sm border p-6">
            <div className="flex items-center justify-between">
              {/* Left: Title */}
              <div className="flex items-center gap-4 w-1/3">
                <div className="w-12 h-12 rounded-xl bg-[#0f172a] flex items-center justify-center shadow-lg shadow-indigo-100 shrink-0">
                   <Target className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  {isEditingTitle ? (
                    <input
                      autoFocus
                      className="font-serif font-bold text-2xl leading-tight bg-transparent border-b border-indigo-500 outline-none w-full"
                      value={planTitle}
                      onChange={e => setPlanTitle(e.target.value)}
                      onBlur={() => {
                        setIsEditingTitle(false);
                        if (plan) {
                          const updated = { ...plan, title: planTitle };
                          setPlan(updated);
                          if (plan.id) saveContentPlan(updated);
                        }
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          setIsEditingTitle(false);
                          if (plan) {
                            const updated = { ...plan, title: planTitle };
                            setPlan(updated);
                            if (plan.id) saveContentPlan(updated);
                          }
                        }
                      }}
                    />
                  ) : (
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <h2
                          className="font-serif font-bold text-2xl leading-tight cursor-pointer hover:text-indigo-600 transition-colors truncate"
                          onClick={() => { setPlanTitle(plan.title || 'Your Strategy Dashboard'); setIsEditingTitle(true); }}
                        >
                          {plan.title || 'Your Strategy Dashboard'}
                        </h2>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 truncate">{productDescription}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Center: Tabs */}
              <div className="flex justify-center w-1/3">
                <div className="bg-slate-100 p-1.5 rounded-xl inline-flex gap-2 border shadow-inner">
                  <button 
                    onClick={() => setActiveTab('strategy')}
                    className={`px-8 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'strategy' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'}`}
                  >
                    <Map className="w-4 h-4" /> Preferences
                  </button>
                  <button 
                    onClick={() => setActiveTab('planner')}
                    className={`px-8 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'planner' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'}`}
                  >
                    <ClipboardList className="w-4 h-4" /> Strategy
                  </button>
                </div>
              </div>

              {/* Right: Actions */}
              <div className="flex items-center justify-end gap-2 w-1/3">
                <button 
                  onClick={() => { setPlanTitle(plan.title || 'Your Strategy Dashboard'); setIsEditingTitle(true); }} 
                  className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" 
                  title="Edit Strategy Name"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                {plan.id && (
                  <button 
                    onClick={handleDeletePlan} 
                    className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" 
                    title="Delete Strategy"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button 
                  onClick={() => setPlan(null)} 
                  className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors" 
                  title="Create New Strategy"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            {activeTab === 'strategy' ? (
              <div className="space-y-8">
                {/* Target Keywords Master List */}
                <div className="p-6 rounded-xl border bg-white shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-5 pb-4 border-b">
                    <div>
                      <h3 className="font-bold text-lg flex items-center gap-2">
                        <Target className="w-5 h-5 text-fuchsia-500" /> Preferred Master Keywords
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Your core list of max 10 target keywords that will globally populate your SEO engine search.
                      </p>
                    </div>
                    <Button onClick={() => setShowKeywordModal(true)} className="mt-4 sm:mt-0 bg-secondary text-foreground hover:bg-secondary/80 outline outline-1 outline-border">
                      <Pencil className="w-4 h-4 mr-2" />
                      Edit Master List
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(!plan?.targetKeywords || plan.targetKeywords.length === 0) ? (
                      <span className="text-sm text-muted-foreground italic">No master keywords set. Click Edit Master List to begin research.</span>
                    ) : (
                      plan.targetKeywords.map((kw, i) => (
                        <span key={i} className="px-3 py-1.5 bg-[var(--color-indigo-50)] text-black border border-indigo-100 rounded-lg text-sm font-medium shadow-sm flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500" /> {kw}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                   <div className="lg:col-span-2">
                      {/* Topical Authority Mapping */}
                      <div className="p-6 rounded-xl border bg-white h-full">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-5 pb-4 border-b">
                          <div>
                            <h3 className="font-bold text-lg flex items-center gap-2">
                              <BookOpen className="w-5 h-5 text-blue-500" /> Topical Authority Mapping
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1">Review the AI-recommended page structure. Select exactly which drafts you want to send to the Engine.</p>
                          </div>
                          {plan.id ? (
                            <div className="mt-4 sm:mt-0 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold flex items-center border border-emerald-200">
                              <CheckCircle2 className="w-4 h-4 mr-1.5"/> Strategy Saved (Id: {plan.id.substring(0, 6)}...)
                            </div>
                          ) : (
                            <div className="mt-4 sm:mt-0 text-xs text-indigo-600 bg-[var(--color-indigo-50)] px-3 py-1.5 rounded-lg border border-indigo-200">
                              Step 1: Save Strategy roadmap required before creating drafts.
                            </div>
                          )}
                        </div>

                        <div className="space-y-3">
                          {plan.recommendedPages?.map((page, i) => {
                            const existingDraft = plan.id ? planArticles.find(a => a.planId === plan.id && a.sourceKeyword === page.keyword && a.title === page.title) : null;
                            const isDrafted = !!existingDraft;
                            const isPublished = existingDraft?.stage === 'Published';
                            
                            return (
                            <label 
                              key={i} 
                              className={`grid grid-cols-[auto_1fr_auto] gap-4 items-center p-4 rounded-xl border transition-all ${isDrafted ? 'bg-[var(--color-indigo-50)] border-border opacity-80 cursor-default' : 'bg-background hover:bg-[var(--color-indigo-50)] border-border cursor-pointer'}`}
                            >
                              <div className="flex justify-center items-center px-1">
                                  <button
                                    onClick={(e) => { e.preventDefault(); handleGenerateSingle(page, i, existingDraft || undefined); }}
                                    disabled={generatingIndex === i}
                                    className="w-10 h-10 rounded-xl bg-violet-600 hover:bg-violet-700 flex items-center justify-center shadow-md shadow-violet-200 transition-all active:scale-95 disabled:opacity-50"
                                    title={isDrafted ? "Go to Engine" : "Generate Content"}
                                  >
                                    {generatingIndex === i ? (
                                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                                    ) : (
                                      <Zap className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                                    )}
                                  </button>
                              </div>
                              
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border ${page.role === 'primary' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-secondary text-muted-foreground border-border'}`}>
                                    {page.role === 'primary' ? '★ Primary Money Page' : '↳ Support Cluster'}
                                  </span>
                                  <span className="text-[10px] font-medium text-muted-foreground">{page.format}</span>
                                </div>
                                <div className={`font-bold text-sm md:text-base truncate max-w-full ${isDrafted ? 'text-muted-foreground' : 'text-foreground'}`}>
                                  {page.title}
                                </div>
                                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                                    <span className="flex items-center gap-1"><Target className="w-3.5 h-3.5"/> {page.keyword}</span>
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${page.intent === 'transactional' || page.intent === 'commercial' ? 'text-orange-600 bg-orange-50' : 'text-sky-600 bg-sky-50'}`}>
                                      {page.intent}
                                    </span>
                                </div>
                              </div>
                              
                              {isDrafted && (
                                <div className="px-3 py-1 rounded text-xs font-bold uppercase tracking-wider bg-background border shadow-sm flex items-center gap-1.5">
                                  <div className={`w-2 h-2 rounded-full ${isPublished ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                                  {existingDraft.stage}
                                </div>
                              )}
                            </label>
                          )})}
                        </div>

                        {/* Toggle for AI Suggest vs Manual */}
                        <div className="mt-10 pt-8 border-t">
                          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
                            <div>
                              <h4 className="text-sm font-bold flex items-center gap-2">
                                <Plus className="w-4 h-4 text-indigo-600" /> Expand Strategic Roadmap
                              </h4>
                              <p className="text-[11px] text-muted-foreground mt-0.5">Discover new topics with AI or manually add custom pages to your map.</p>
                            </div>
                            
                            <div className="flex bg-[var(--color-indigo-50)] p-1 rounded-xl border border-indigo-100 shadow-sm">
                              <button
                                onClick={() => setAdditionMode('ai')}
                                className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all flex items-center gap-1.5 ${additionMode === 'ai' ? 'bg-white shadow-md text-indigo-600' : 'text-indigo-400 hover:text-indigo-600'}`}
                              >
                                <Sparkles className="w-3.5 h-3.5" /> AI Suggest
                              </button>
                              <button
                                onClick={() => setAdditionMode('manual')}
                                className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all flex items-center gap-1.5 ${additionMode === 'manual' ? 'bg-white shadow-md text-indigo-600' : 'text-indigo-400 hover:text-indigo-600'}`}
                              >
                                <Settings2 className="w-3.5 h-3.5" /> Manual
                              </button>
                            </div>
                          </div>

                          {additionMode === 'ai' ? (
                            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                              <div className="flex gap-2 mb-4">
                                <input
                                  placeholder="e.g. A SaaS blog about AI automation for marketers"
                                  value={siteProfile}
                                  onChange={(e) => setSiteProfile(e.target.value)}
                                  className="flex-1 h-9 rounded-md border bg-background text-sm px-3 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                                />
                                <Button
                                  onClick={handleSuggestTopics}
                                  disabled={!siteProfile || isSuggestingTopics}
                                  size="sm"
                                  className="h-9 gap-1.5 bg-indigo-600 hover:bg-indigo-700"
                                >
                                  {isSuggestingTopics ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                  Suggest
                                </Button>
                              </div>

                              {topicSuggestions.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                                  {topicSuggestions.map((topic, i) => (
                                    <div
                                      key={i}
                                      className="p-3 text-sm rounded-xl bg-[var(--color-indigo-50)] border border-indigo-100 hover:border-indigo-300 transition-all group cursor-pointer"
                                      onClick={() => handleAddSuggestedTopic(topic)}
                                    >
                                      <div className="flex justify-between items-start mb-1">
                                        <div className="font-bold text-indigo-900 group-hover:text-indigo-600 transition-colors leading-tight">{topic.title}</div>
                                        <Plus className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                                      </div>
                                      <div className="text-[11px] text-indigo-700/70 line-clamp-2">{topic.description}</div>
                                      <div className="mt-2 flex items-center gap-2">
                                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-white rounded border border-indigo-100 text-indigo-600">{topic.intent}</span>
                                        <span className="text-[9px] text-indigo-400 font-mono truncate">{topic.keywords}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="p-8 text-center bg-slate-50 border border-dashed rounded-xl">
                                   <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                                      <Sparkles className="w-5 h-5 text-indigo-300" />
                                   </div>
                                   <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">No suggestions yet</div>
                                   <p className="text-[11px] text-slate-400 mt-1">Enter your niche above to get AI-powered content ideas.</p>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 rounded-2xl border bg-slate-50">
                                <div className="md:col-span-1">
                                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Role</label>
                                  <select 
                                    className="w-full h-10 rounded-xl border bg-white text-sm px-3 appearance-none focus:ring-2 focus:ring-indigo-100 outline-none transition-all shadow-sm" 
                                    value={newRole} 
                                    onChange={e => setNewRole(e.target.value as any)}
                                  >
                                    <option value="primary">Primary Money Page</option>
                                    <option value="support">Support Cluster</option>
                                  </select>
                                </div>
                                <div className="md:col-span-2">
                                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Target Title</label>
                                  <input 
                                    className="w-full h-10 rounded-xl border bg-white text-sm px-4 focus:ring-2 focus:ring-indigo-100 outline-none transition-all shadow-sm" 
                                    value={newTitle} 
                                    onChange={e => setNewTitle(e.target.value)} 
                                    placeholder="e.g. The Ultimate Guide to..." 
                                  />
                                </div>
                                <div className="md:col-span-2">
                                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Target Keyword</label>
                                  <input 
                                    className="w-full h-10 rounded-xl border bg-white text-sm px-4 focus:ring-2 focus:ring-indigo-100 outline-none transition-all shadow-sm" 
                                    value={newKeyword} 
                                    onChange={e => setNewKeyword(e.target.value)} 
                                    placeholder="e.g. seo tool" 
                                  />
                                </div>
                                <div className="md:col-span-1 flex items-end">
                                  <Button 
                                    onClick={handleAddCustomPage} 
                                    disabled={!newTitle || !newKeyword}
                                    className="w-full bg-[#0f172a] text-white hover:bg-[#1e293b] h-10 rounded-xl font-bold text-sm shadow-md transition-all active:scale-[0.98]"
                                  >
                                    Add to Map
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                   </div>

                   <div className="lg:col-span-1">
                      {/* Global References Curated Block */}
                      <div className="p-6 rounded-xl border bg-white/60 backdrop-blur-sm h-full">
                        <h3 className="font-bold flex items-center gap-2 mb-4">
                          <BookmarkPlus className="w-5 h-5 text-emerald-500" /> Curated References
                        </h3>
                        <p className="text-xs text-muted-foreground mb-4">Links saved from the SERP Engine or added manually. They are available globally in the blog generation environment.</p>
                        <div className="space-y-2 mb-4">
                          {globalReferences.length === 0 ? (
                            <div className="text-xs text-muted-foreground text-center py-4 bg-background border border-dashed rounded-lg">No global references saved yet.</div>
                          ) : (
                            globalReferences.map(ref => (
                              <div key={ref.id} className="flex items-center justify-between p-3 bg-background border rounded-lg group transition-colors hover:border-emerald-200">
                                <div className="flex flex-col min-w-0 pr-3">
                                  <span className="text-xs font-semibold text-foreground truncate">{ref.title || 'Untitled Reference'}</span>
                                  <a href={ref.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-emerald-600 hover:underline truncate">{ref.url}</a>
                                </div>
                                <button
                                  onClick={async () => {
                                    if (!ref.id) return;
                                    try {
                                      await deleteExternalLink(ref.id);
                                      setGlobalReferences(prev => prev.filter(r => r.id !== ref.id));
                                    } catch (e) {
                                      console.error(e);
                                    }
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-2 text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-all rounded-md shrink-0"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                        
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="URL..."
                            className="flex-[2] text-xs px-3 py-2 rounded-md border bg-background"
                            value={newRefUrl}
                            onChange={(e) => setNewRefUrl(e.target.value)}
                          />
                          <button
                            disabled={isAddingRef || !newRefUrl.trim()}
                            onClick={async () => {
                              setIsAddingRef(true);
                              try {
                                let finalTitle = newRefTitle.trim();
                                if (!finalTitle) {
                                  try {
                                    const parsedUrl = new URL(newRefUrl);
                                    finalTitle = parsedUrl.hostname.replace('www.', '');
                                  } catch {
                                    finalTitle = newRefUrl;
                                  }
                                }
                                const rLink: ExternalLinkType = { url: newRefUrl, title: finalTitle, folder: 'Reference Source' };
                                const id = await saveExternalLink(rLink);
                                setGlobalReferences(prev => [...prev, { ...rLink, id }]);
                                setNewRefUrl('');
                                setNewRefTitle('');
                              } catch (err) {
                                console.error(err);
                              } finally {
                                setIsAddingRef(false);
                              }
                            }}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-md flex items-center justify-center w-10 disabled:opacity-50"
                          >
                            {isAddingRef ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                   </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Playbook & Roadmap */}
                <div className="lg:col-span-2 space-y-6">

              
              {/* Core Takeaway */}
              <div className="p-6 rounded-xl border border-indigo-100 bg-[var(--color-indigo-50)]">
                <h3 className="font-bold text-indigo-900 flex items-center gap-2 mb-2">
                  <Sparkles className="w-5 h-5"/> Core Takeaway
                </h3>
            <textarea
              className="w-full text-sm font-medium text-foreground bg-transparent border border-transparent hover:border-indigo-200 focus:border-indigo-300 outline-none resize-none overflow-hidden rounded transition-colors"
              rows={Math.max(3, (plan.coreTakeaway || '').split('\n').length)}
              value={plan.coreTakeaway}
              onChange={(e) => setPlan({...plan, coreTakeaway: e.target.value})}
              onBlur={() => plan.id && saveContentPlan(plan)}
            />
              </div>

              {/* Action Plan (Checklist-driven) */}
              {plan.actionPlan && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b">
                     <h3 className="font-bold flex items-center gap-2">
                      <ClipboardList className="w-5 h-5 text-indigo-500" /> Action Plan
                    </h3>
                    <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
                      Checklist Roadmap
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {plan.actionPlan.map((goal, gIdx) => {
                      const completedCount = goal.tasks.filter(t => t.completed).length;
                      const isExpanded = expandedGoals[gIdx];

                      return (
                        <div key={gIdx} className="rounded-xl border bg-white overflow-hidden transition-all shadow-sm">
                          {/* Header */}
                          <div 
                            className="p-4 flex items-center justify-between cursor-pointer hover:bg-[var(--color-indigo-50)] transition-colors"
                            onClick={() => toggleGoal(gIdx)}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${completedCount === goal.tasks.length ? 'bg-emerald-500 text-white' : 'bg-indigo-100 text-indigo-700'}`}>
                                {gIdx + 1}
                              </div>
                              <div>
                                <h4 className="text-sm font-bold flex items-center gap-2">
                                  {goal.title}
                                  {completedCount === goal.tasks.length && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                                </h4>
                                <p className="text-[11px] text-muted-foreground">{goal.description}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-[10px] font-bold bg-secondary px-2 py-0.5 rounded-full text-muted-foreground">
                                {completedCount}/{goal.tasks.length} DONE
                              </div>
                              {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                            </div>
                          </div>

                          {/* Content */}
                          {isExpanded && (
                            <div className="p-4 pt-0 border-t bg-[var(--color-indigo-50)] space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                              <div className="space-y-1 mt-3">
                                {goal.tasks.map((task, tIdx) => (
                                  <div 
                                    key={tIdx} 
                                    className="flex items-start gap-3 p-2 rounded-lg hover:bg-white/50 dark:hover:bg-black/20 transition-all cursor-pointer group"
                                    onClick={() => handleToggleTask(gIdx, tIdx)}
                                  >
                                    <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${task.completed ? 'bg-emerald-500 border-emerald-600' : 'bg-white dark:bg-slate-800 border-indigo-200 group-hover:border-indigo-400'}`}>
                                      {task.completed && <CheckSquare className="w-3 h-3 text-white" />}
                                    </div>
                                    <span className={`text-sm ${task.completed ? 'text-muted-foreground line-through' : 'text-foreground font-medium'}`}>
                                      {task.task}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Practical Checklist Table */}
              {plan.checklist && plan.checklist.length > 0 && (
                <div className="p-6 rounded-xl border bg-white overflow-hidden shadow-sm">
                  <h3 className="font-bold border-b pb-3 mb-0 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Implementation Checklist
                  </h3>
                  <table className="w-full text-left text-sm mt-4">
                    <thead className="bg-[var(--color-indigo-50)]0 text-xs uppercase text-muted-foreground">
                      <tr>
                         <th className="px-4 py-3 font-semibold rounded-tl-lg">Implement Now</th>
                         <th className="px-4 py-3 font-semibold rounded-tr-lg">Why It Matters</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {plan.checklist.map((item: any, i: number) => (
                        <tr key={i} className="hover:bg-[var(--color-indigo-50)] transition-colors group">
                          <td className="px-4 py-2 align-top">
                            <input 
                              className="w-full bg-transparent border border-transparent group-hover:border-indigo-200 focus:border-indigo-300 outline-none text-sm font-medium rounded px-2 py-1 transition-colors" 
                              value={item.task} 
                              onChange={(e) => {
                                const newChecklist = [...plan.checklist];
                                newChecklist[i].task = e.target.value;
                                setPlan({...plan, checklist: newChecklist});
                              }}
                              onBlur={() => plan.id && saveContentPlan(plan)}
                            />
                          </td>
                          <td className="px-4 py-2 align-top">
                            <input 
                              className="w-full bg-transparent border border-transparent group-hover:border-indigo-200 focus:border-indigo-300 outline-none text-sm text-muted-foreground rounded px-2 py-1 transition-colors" 
                              value={item.reason} 
                              onChange={(e) => {
                                const newChecklist = [...plan.checklist];
                                newChecklist[i].reason = e.target.value;
                                setPlan({...plan, checklist: newChecklist});
                              }}
                              onBlur={() => plan.id && saveContentPlan(plan)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Right Column: Mistakes & Actions */}
            <div className="space-y-6">
              {/* Mistakes to Avoid */}
              {plan.mistakes && plan.mistakes.length > 0 && (
                <div className="p-6 rounded-xl border border-indigo-100 bg-[var(--color-indigo-50)]">
                  <h3 className="font-bold text-red-700 flex items-center gap-2 mb-4">
                    <AlertTriangle className="w-5 h-5" /> Mistakes to Avoid
                  </h3>
                  <ul className="space-y-3">
                    {plan.mistakes.map((m, i) => (
                      <li key={i} className="text-sm flex items-start gap-2 text-foreground font-medium group">
                        <span className="text-red-600 font-bold mt-1.5">✕</span> 
                        <input 
                          className="w-full bg-transparent border border-transparent hover:border-red-200 focus:border-red-300 outline-none rounded px-2 py-1 transition-colors" 
                          value={m} 
                          onChange={(e) => {
                            const newMistakes = [...(plan.mistakes || [])];
                            newMistakes[i] = e.target.value;
                            setPlan({...plan, mistakes: newMistakes});
                          }} 
                          onBlur={() => plan.id && saveContentPlan(plan)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Action Items */}
              {plan.actionItems && plan.actionItems.length > 0 && (
                <div className="p-6 rounded-xl border bg-white shadow-sm">
                  <h3 className="font-bold flex items-center gap-2 mb-4">
                    <Target className="w-5 h-5 text-indigo-500" /> Immediate Actions
                  </h3>
                  <ol className="space-y-3">
                    {plan.actionItems.map((action, i) => (
                      <li key={i} className="text-sm flex items-start gap-2 group">
                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold shrink-0 mt-1">{i+1}</span>
                        <input 
                          className="w-full bg-transparent border border-transparent hover:border-indigo-200 focus:border-indigo-300 outline-none text-foreground/90 rounded px-2 py-1 transition-colors" 
                          value={action} 
                          onChange={(e) => {
                            const newActions = [...(plan.actionItems || [])];
                            newActions[i] = e.target.value;
                            setPlan({...plan, actionItems: newActions});
                          }} 
                          onBlur={() => plan.id && saveContentPlan(plan)}
                        />
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )}
      {showKeywordModal && plan && (
        <KeywordManagerModal 
          plan={plan} 
          onClose={() => setShowKeywordModal(false)} 
          onUpdatePlan={async (updatedPlan) => {
            setPlan(updatedPlan);
            await saveContentPlan(updatedPlan);
          }} 
        />
      )}
        </div>
      </main>
    </div>
  );
}
