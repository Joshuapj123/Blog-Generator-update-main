'use client';

import { cn } from '@/lib/utils';
import { CheckCircle2, ChevronRight, Hash, Globe, User, Target, Search } from 'lucide-react';

const STEPS = [
  { id: 0, label: 'Topic & Keyword', icon: Hash },
  { id: 1, label: 'SERP Results', icon: Search },
  { id: 2, label: 'Extraction & Reference', icon: Globe },
  { id: 3, label: 'Author Persona', icon: User },
  { id: 4, label: 'Final Config', icon: Target },
];

interface WizardStepIndicatorProps {
  currentStep: number;
  isRunning: boolean;
  setCurrentStep: (step: number) => void;
}

export function WizardStepIndicator({ currentStep, isRunning, setCurrentStep }: WizardStepIndicatorProps) {
  return (
    <div className="flex items-center gap-6 mb-10 overflow-x-auto pb-4 no-scrollbar">
      {STEPS.map((step, idx) => {
        const Icon = step.icon;
        const done = currentStep > step.id;
        const active = currentStep === step.id;
        return (
          <div key={step.id} className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => !isRunning && setCurrentStep(step.id)}
              suppressHydrationWarning
              className={cn(
                "flex items-center gap-3 px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 cursor-pointer whitespace-nowrap",
                active
                  ? "bg-premium-blue text-white shadow-lg shadow-blue-500/30 scale-105"
                  : done
                    ? "text-preserved-blue bg-preserved-blue/5"
                    : "text-muted-foreground hover:text-foreground hover:bg-[var(--color-indigo-50)]"
              )}
            >
              {done ? (
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              ) : (
                <Icon className="w-5 h-5 flex-shrink-0" />
              )}
              <span className="truncate hidden md:block">{step.label}</span>
            </button>
            {idx < STEPS.length - 1 && (
              <ChevronRight className="w-4 h-4 text-muted-foreground/30 flex-shrink-0 mx-2" />
            )}
          </div>
        );
      })}
    </div>
  );
}
