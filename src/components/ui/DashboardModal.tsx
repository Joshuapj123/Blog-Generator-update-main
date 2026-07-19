import { ContentDashboard } from '../ContentDashboard';
import { Button } from './button';
import { X, LayoutDashboard } from 'lucide-react';

export function DashboardModal({
  onClose
}: {
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-card w-full max-w-5xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden border border-primary/20 flex flex-col scale-100 animate-in zoom-in-95 duration-300">
        <div className="px-8 py-5 border-b flex justify-between items-center bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <LayoutDashboard className="w-5 h-5 text-primary" />
            </div>
            <div>
                <h2 className="font-bold text-xl tracking-tight">Content Dashboard</h2>
                <p className="text-xs text-muted-foreground">Manage and edit your saved articles</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-10 h-10 rounded-full hover:bg-muted flex items-center justify-center transition-colors group"
          >
            <X className="w-5 h-5 text-muted-foreground group-hover:text-foreground" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <ContentDashboard />
        </div>

        <div className="px-8 py-4 bg-muted/30 border-t flex justify-end">
            <Button variant="outline" onClick={onClose} className="rounded-xl px-6">Close</Button>
        </div>
      </div>
    </div>
  );
}
