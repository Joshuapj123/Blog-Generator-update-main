'use client';

import { Loader2, CheckCircle2, AlertCircle, Circle } from 'lucide-react';

const EXTRACT_STAGES = [
  // --- Playwright Stages (existing 1–6) ---
  { id: 1, label: "Connecting to reference URL",       icon: "🔗" },
  { id: 2, label: "Capturing page layout & structure", icon: "🗂️" },
  { id: 3, label: "Extracting SEO metadata",           icon: "🏷️" },
  { id: 4, label: "Analyzing textual content",         icon: "📄" },
  { id: 5, label: "Parsing visual hierarchy",          icon: "🎨" },
  { id: 6, label: "Finalizing reference extraction",   icon: "✅" },
  // --- New Stages 7–8 ---
  { id: 7, label: "Running SERP competitor NLP analysis", icon: "🔍" },
  { id: 8, label: "Generating AI Strategy JSON",           icon: "🤖" },
];

interface ExtractionProgressProps {
  currentStage: number;
  currentLabel?: string;
  isComplete: boolean;
  error: string | null;
}

export function ExtractionProgress({
  currentStage,
  currentLabel,
  isComplete,
  error,
}: ExtractionProgressProps) {
  const percent = isComplete ? 100 : Math.min(((currentStage - 1) / 8) * 100, 99);

  return (
    <div className="space-y-4 mt-4">
      {/* Bar */}
      <div>
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs font-semibold text-foreground">
            {error ? 'Extraction failed' : isComplete ? 'Complete!' : 'Processing…'}
          </span>
          <span className="text-xs font-mono text-muted-foreground">{Math.max(0, Math.floor(percent))}%</span>
        </div>
        <div className="relative h-2 rounded-full bg-secondary overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${Math.max(0, Math.floor(percent))}%`,
              background: error
                ? 'var(--destructive)'
                : 'var(--premium-blue-gradient)',
              boxShadow: error ? 'none' : '0 0 12px 2px rgba(37,99,235,0.2)',
            }}
          />
        </div>
      </div>
      {/* Steps */}
      <ol className="space-y-2">
        {EXTRACT_STAGES.map((s) => {
          const done = isComplete || currentStage > s.id;
          const active = currentStage === s.id && !error;
          const failed = !!error && currentStage === s.id;
          return (
            <li key={s.id} className="flex items-center gap-2.5">
              <span
                className="flex-shrink-0 transition-all duration-300 flex items-center justify-center w-5 h-5 text-sm"
                style={{
                  color: done
                    ? 'var(--preserved-blue)'
                    : active
                      ? 'var(--preserved-blue)'
                      : failed
                        ? 'var(--destructive)'
                        : 'var(--muted-foreground)',
                }}
              >
                {done ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : active ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : failed ? (
                  <AlertCircle className="w-4 h-4" />
                ) : (
                  s.icon
                )}
              </span>
              <span
                className={`text-xs transition-all duration-300 ${done
                  ? 'text-foreground font-medium'
                  : active
                    ? 'text-foreground font-semibold'
                    : 'text-muted-foreground'
                  }`}
              >
                {active && currentLabel && s.id < 7 ? currentLabel : s.label}
              </span>
            </li>
          );
        })}
      </ol>
      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs font-medium leading-relaxed">
          <AlertCircle className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" />
          {error}
        </div>
      )}
    </div>
  );
}
