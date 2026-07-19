import { ArrowRight, Lightbulb, Zap, Search } from 'lucide-react';
import { Card, CardContent } from './card';

export function WeakCopyCard({
  phrase,
  improvement,
  reasoning,
  isActive,
  isDismissed,
  onHighlight,
  onApplyFix,
  highlightLabel = 'Jump to',
  highlightIcon = <ArrowRight className="w-3 h-3" />,
}: {
  phrase: string;
  improvement: string;
  reasoning?: string;
  isActive?: boolean;
  isDismissed?: boolean;
  onHighlight: () => void;
  onApplyFix: () => void;
  highlightLabel?: string;
  highlightIcon?: React.ReactNode;
}) {
  return (
    <div
      className={`transition-all duration-350 ease-in-out overflow-hidden ${
        isDismissed
          ? 'opacity-0 -translate-x-6 max-h-0 scale-95 mb-0 pointer-events-none'
          : 'opacity-100 translate-x-0 max-h-[400px] scale-100 mb-3'
      }`}
    >
      <Card
        className={`shadow-none rounded-2xl ${
          isActive
            ? 'border-violet-300 bg-violet-100 ring-2 ring-violet-200'
            : 'border-violet-100 bg-violet-50/80'
        }`}
      >
        <CardContent className="p-4 text-sm">
          <div className="text-[10px] uppercase font-bold text-violet-500 mb-1">
            Found Phrase
          </div>
          <div className="font-medium bg-white px-2 py-1.5 rounded-lg text-violet-900 mb-3 border shadow-sm">
            "{phrase}"
          </div>
          <div className="text-[10px] uppercase font-bold text-emerald-600 mb-1 flex items-center gap-1">
            <Lightbulb className="w-3 h-3" /> Improvement
          </div>
          <div className="text-emerald-700 bg-white px-2 py-1.5 rounded-lg border shadow-sm mb-3 font-medium">
            {improvement}
          </div>
          {reasoning && (
            <div className="text-[11px] text-slate-500 mb-3 italic">
              {reasoning}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={onHighlight}
              className={`flex-1 flex items-center justify-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors ${
                isActive
                  ? 'bg-slate-300 text-slate-800 hover:bg-slate-400'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {highlightIcon} {highlightLabel}
            </button>
            <button
              onClick={onApplyFix}
              className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors shadow-sm"
            >
              <Zap className="w-3 h-3" /> Apply Fix
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
