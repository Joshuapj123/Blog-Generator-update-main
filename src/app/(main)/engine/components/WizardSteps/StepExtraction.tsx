'use client';

import { useEffect } from 'react';
import { 
  ScanText, 
  Loader2, 
  CheckCircle2, 
  Sparkles, 
  BrainCircuit, 
  Target, 
  ArrowLeft, 
  ArrowRight,
  AlertCircle,
  RefreshCcw
} from 'lucide-react';
import { useEngine } from '../../context/EngineContext';
import { useEngineHandlers } from '../../hooks/useEngineHandlers';
import { ExtractionProgress } from '../ExtractionProgress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function StepExtraction() {
  const engine = useEngine();
  const { handleUnifiedIntelligence } = useEngineHandlers();

  useEffect(() => {
    if (engine.referenceUrl && !engine.extractionComplete && engine.pipelineStage === 0) {
      handleUnifiedIntelligence();
    }
  }, [engine.referenceUrl, engine.extractionComplete, engine.pipelineStage]);

  const isRunning = engine.pipelineStage > 0 && engine.pipelineStage < 9 && !engine.pipelineError;
  const isLoading = isRunning || engine.isRunning;
  console.log("isLoading", isLoading);

  return (
    <div className="space-y-8 p-8 rounded-lg border bg-white shadow-sm animate-in fade-in slide-in-from-right-4 duration-300">
      <div>
        <h2 className="text-3xl font-serif font-bold mb-2 tracking-tight">Intelligence Gathering</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Automated semantic context gathering and AI strategy generation.
        </p>

        <div className="flex gap-2">
          <Input
            id="reference-url"
            type="url"
            placeholder="https://example.com/blog/article"
            value={engine.referenceUrl}
            onChange={(e) => {
              engine.setReferenceUrl(e.target.value);
              engine.setExtractionComplete(false);
              engine.setPipelineStage(0);
              engine.setPipelineError(null);
            }}
            disabled={isRunning || engine.isRunning}
            className="bg-white h-12 text-sm"
          />
          {engine.extractionComplete && (
            <Button
              type="button"
              variant="outline"
              onClick={() => handleUnifiedIntelligence(true)}
              disabled={isRunning || engine.isRunning}
              className="h-12 px-6 bg-white shrink-0 gap-2"
              title="Force re-run the complete extraction pipeline"
            >
              <RefreshCcw className="w-4 h-4" />
              Re-run Extraction
            </Button>
          )}
        </div>
      </div>

      {/* Unified Extraction Progress */}
      {(isRunning || engine.extractionComplete || engine.pipelineError) && (
        <div className="p-5 rounded-lg border bg-white animate-in fade-in duration-300">
          <div className="flex items-center justify-between mb-1">
            <div className="text-sm font-semibold">Unified Intelligence Pipeline</div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold uppercase tracking-tight">Automated</span>
          </div>
          <div className="font-light text-[13px] mb-3">Orchestrating headless scraping, NLP analysis, and AI strategy generation.</div>
          <ExtractionProgress
            currentStage={engine.pipelineError ? engine.pipelineError.stage : engine.pipelineStage}
            isComplete={engine.extractionComplete}
            error={engine.pipelineError?.message || null}
          />
          {engine.pipelineError && engine.pipelineError.canRetry && (
            <div className="mt-4 flex justify-end">
              <Button onClick={() => handleUnifiedIntelligence()} size="sm" variant="outline" className="gap-2">
                <RefreshCcw className="w-4 h-4" /> Retry Pipeline
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Final Results & Options */}
      {engine.extractionComplete && engine.referenceData && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          <div className="flex flex-col gap-1 text-xs text-emerald-700 font-medium bg-emerald-50 p-3 rounded-lg border border-emerald-200/50">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              {engine.keywordBank ? `${engine.keywordBank.terms.length} SEO terms aggregated in Keyword Bank.` : `${engine.serpTerms.length} SEO terms identified.`}
            </div>
          </div>

          <div className="p-5 rounded-lg border border-accent/20 bg-accent/5">
            <div className="flex items-center gap-2 text-accent-foreground font-semibold text-sm mb-4">
              <Sparkles className="w-4 h-4 text-accent" />
              AI Strategy Profile
            </div>
            <div className="space-y-5">
              <div>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">SEO Keywords</span>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {engine.aiStrategyProfile?.seoKeywords?.map((kw: string, i: number) => (
                    <span key={i} className="px-2.5 py-1 rounded-md bg-white border shadow-sm text-xs text-foreground font-medium">{kw}</span>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Structure & Strategy</span>
                <p className="text-[13px] mt-1.5 leading-relaxed text-foreground/90">{engine.aiStrategyProfile?.contentStructure}</p>
              </div>
              <div>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Success Factors</span>
                <ul className="list-disc pl-5 text-[13px] mt-1.5 space-y-1 text-foreground/90">
                  {engine.aiStrategyProfile?.successFactors?.map((sf: string, i: number) => <li key={i}>{sf}</li>)}
                </ul>
              </div>
            </div>
          </div>

          {/* ── Content structure mode toggle ── */}
          <div className="p-4 rounded-lg border bg-white space-y-3">
            <div>
              <div className="text-sm font-semibold mb-0.5">Content Structure Mode</div>
              <div className="font-light text-[13px]">How should AI use this reference article?</div>
            </div>

            <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${engine.contentStructureMode === 'inspire' ? 'border-primary bg-[var(--color-indigo-50)]' : 'hover:bg-[var(--color-indigo-50)]'}`}>
              <input
                type="radio"
                name="contentStructureMode"
                value="inspire"
                checked={engine.contentStructureMode === 'inspire'}
                onChange={() => engine.setContentStructureMode('inspire')}
                className="mt-0.5 text-primary"
              />
              <div>
                <div className="text-sm font-medium">Use as inspiration only</div>
                <div className="font-light text-[13px]">AI freely creates its own outline — the reference is a quality &amp; depth benchmark.</div>
              </div>
            </label>

            <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${engine.contentStructureMode === 'mirror' ? 'border-accent bg-accent/5' : 'hover:bg-[var(--color-indigo-50)]'}`}>
              <input
                type="radio"
                name="contentStructureMode"
                value="mirror"
                checked={engine.contentStructureMode === 'mirror'}
                onChange={() => engine.setContentStructureMode('mirror')}
                className="mt-0.5 text-accent"
              />
              <div>
                <div className="text-sm font-medium flex items-center gap-1.5">
                  Mirror reference structure
                  <span className="text-xs px-1.5 py-0.5 rounded bg-accent/15 text-accent font-semibold">Recommended</span>
                </div>
                <div className="font-light text-[13px]">AI adopts the exact heading hierarchy and section order from the reference article.</div>
              </div>
            </label>
          </div>
        </div>
      )}

      <div className="flex justify-between pt-4">
        <Button type="button" variant="ghost" onClick={() => engine.setCurrentStep(1)} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <Button 
          type="button" 
          onClick={() => engine.setCurrentStep(3)} 
          disabled={!engine.extractionComplete} 
          className="gap-2 bg-premium-blue hover:opacity-90 shadow-blue-500/20"
        >
          Next: Author Persona <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
