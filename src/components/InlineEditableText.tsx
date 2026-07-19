import { useState, useEffect } from 'react';
import { Pencil, Sparkles, Loader2, ArrowRight } from 'lucide-react';

export function InlineEditableText({
  value,
  onSave,
  renderedHtml,
  label
}: {
  value: string;
  onSave: (val: string) => void;
  renderedHtml: string;
  label?: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);

  // AI Rephrase state
  const [showAi, setShowAi] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [isRephrasing, setIsRephrasing] = useState(false);

  useEffect(() => { setTempValue(value); }, [value]);

  const handleRephrase = async () => {
    if (!aiInstruction.trim() || !tempValue.trim()) return;
    setIsRephrasing(true);
    try {
      const res = await fetch('/api/rephrase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: tempValue, instruction: aiInstruction })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTempValue(data.text);
      setShowAi(false);
      setAiInstruction('');
    } catch (e: any) {
      alert('Rephrase failed: ' + e.message);
    } finally {
      setIsRephrasing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="relative group animate-in fade-in zoom-in-95 duration-200 mt-1 mb-2">
        <textarea
          autoFocus
          className="w-full min-h-[120px] p-4 text-sm leading-relaxed rounded-lg border border-primary/50 focus:border-primary focus:ring-4 focus:ring-primary/20 bg-background resize-y shadow-sm font-mono"
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          onBlur={() => {
            setIsEditing(false);
            if (tempValue !== value) onSave(tempValue);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setIsEditing(false);
              setTempValue(value); // cancel edits
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />
        
        {/* AI Action Bar */}
        {showAi ? (
          <div className="absolute top-full left-0 right-0 mt-1 z-10 flex items-center gap-2 bg-background border p-2 rounded-lg shadow-lg animate-in slide-in-from-top-2">
            <Sparkles className="w-4 h-4 text-primary ml-1" />
            <input 
              type="text"
              autoFocus
              className="flex-1 text-xs bg-transparent outline-none pb-0"
              placeholder="E.g., Make it shorter, more professional, expand on the concept..."
              value={aiInstruction}
              onChange={e => setAiInstruction(e.target.value)}
              onKeyDown={e => {
                 if (e.key === 'Enter') handleRephrase();
                 if (e.key === 'Escape') setShowAi(false);
              }}
            />
            <button 
              disabled={isRephrasing || !aiInstruction}
              onClick={handleRephrase}
              className="bg-primary text-white text-xs font-bold px-3 py-1.5 rounded hover:bg-primary/90 transition flex items-center gap-1 disabled:opacity-50"
            >
              {isRephrasing ? <Loader2 className="w-3 h-3 animate-spin"/> : <ArrowRight className="w-3 h-3"/>}
              Go
            </button>
            <button
               onClick={() => setShowAi(false)}
               className="text-xs font-bold text-muted-foreground px-2 py-1.5 hover:bg-muted rounded"
            >
               Cancel
            </button>
          </div>
        ) : (
          <div className="absolute top-2 right-2 flex gap-1 items-center">
            <button 
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowAi(true); }}
              className="bg-primary/10 hover:bg-primary/20 text-primary p-1.5 rounded-md transition"
              title="Rephrase with AI"
            >
               <Sparkles className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="absolute -top-3 left-3 bg-primary text-primary-foreground text-[10px] uppercase font-bold px-2 py-0.5 rounded shadow-sm">
          Editing {label && `• ${label}`} (Cmd+Enter to save)
        </div>
      </div>
    );
  }

  return (
    <div
      className="group relative cursor-text rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors -mx-2 px-2 py-1"
      onClick={() => setIsEditing(true)}
    >
      <div
        className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
      <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-background/95 backdrop-blur px-2 py-1 rounded shadow-md text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1 border border-border/50">
        <Pencil className="w-3 h-3" /> Click to Edit
      </div>
    </div>
  );
}
