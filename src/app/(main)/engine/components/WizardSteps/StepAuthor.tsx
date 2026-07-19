'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useEngine } from '../../context/EngineContext';
import { Button } from '@/components/ui/button';
import { AUTHOR_PROFILES } from '@/lib/author-profiles';
import { useState } from 'react';

export function StepAuthor() {
  const engine = useEngine();
  const [authorMode, setAuthorMode] = useState<'none' | 'reference' | 'profile'>('none');
  const [selectedProfileId, setSelectedProfileId] = useState(AUTHOR_PROFILES[0].id);

  return (
    <div className="space-y-10 pb-10 border-b last:border-b-0 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="p-8 rounded-lg border bg-white shadow-sm">
        <h2 className="text-3xl font-serif font-bold mb-2 tracking-tight">E-E-A-T: Author Persona</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Choose the authority voice for the generated content.
        </p>

        <div className="space-y-3">
          {/* Standard */}
          <label className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${authorMode === 'none' ? 'border-primary bg-[var(--color-indigo-50)]' : 'hover:bg-[var(--color-indigo-50)]'}`}>
            <input
              type="radio"
              name="authorMode"
              value="none"
              checked={authorMode === 'none'}
              onChange={() => setAuthorMode('none')}
              className="mt-0.5"
            />
            <div>
              <div className="font-medium text-sm">Standard — Generic Expert</div>
              <div className="font-light text-[13px]">World-class content strategist with verifiable expertise.</div>
            </div>
          </label>

          {/* Reference author */}
          <label
            className={`flex items-start gap-3 p-4 rounded-lg border transition-colors ${!engine.referenceData?.metadata?.byline
              ? 'opacity-50 cursor-not-allowed'
              : `cursor-pointer ${authorMode === 'reference' ? 'border-primary bg-[var(--color-indigo-50)]' : 'hover:bg-[var(--color-indigo-50)]'}`
              }`}
          >
            <input
              type="radio"
              name="authorMode"
              value="reference"
              checked={authorMode === 'reference'}
              onChange={() => setAuthorMode('reference')}
              disabled={!engine.referenceData?.metadata?.byline}
              className="mt-0.5"
            />
            <div>
              <div className="font-medium text-sm">Use Reference Author</div>
              <div className="font-light text-[13px]">
                {engine.referenceData?.metadata?.byline
                  ? `Write in the style of "${engine.referenceData?.metadata.byline}" from ${engine.referenceData?.metadata.siteName || 'extracted page'}`
                  : 'Extract a reference URL first to enable this option'}
              </div>
            </div>
          </label>

          {/* Profile */}
          <label className={`flex flex-col gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${authorMode === 'profile' ? 'border-primary bg-[var(--color-indigo-50)]' : 'hover:bg-[var(--color-indigo-50)]'}`}>
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="authorMode"
                value="profile"
                checked={authorMode === 'profile'}
                onChange={() => setAuthorMode('profile')}
                className="mt-0.5 text-primary"
              />
              <div>
                <div className="font-medium text-sm">Select Author Profile</div>
                <div className="font-light text-[13px]">Choose from pre-built expert personas.</div>
              </div>
            </div>
            {authorMode === 'profile' && (
              <select
                className="text-sm p-2.5 rounded-lg border bg-background w-full outline-none focus:ring-2 focus:ring-primary/20"
                value={selectedProfileId}
                onChange={(e) => setSelectedProfileId(e.target.value)}
              >
                {AUTHOR_PROFILES.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — {p.role}</option>
                ))}
              </select>
            )}
          </label>
        </div>
      </div>

      <div className="flex justify-between">
        <Button type="button" variant="ghost" onClick={() => engine.setCurrentStep(2)} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <Button 
          type="button" 
          onClick={() => {
            // We could sync these to context if they were needed elsewhere, 
            // but for now let's assume they are just for the pipeline.
            engine.setCurrentStep(4);
          }} 
          className="gap-2 bg-premium-blue hover:opacity-90 shadow-lg shadow-blue-500/20"
        >
          Next: Final Config <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
