'use client';

import { Button } from "@/components/ui/button";
import { Trash2, AlertTriangle, Loader2, X } from "lucide-react";
import { useState, useEffect } from "react";

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  title?: string;
  description?: string;
  itemName?: string;
}

export function DeleteConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Delete Article",
  description = "Are you sure you want to delete this article? This action cannot be undone and will remove all content and analysis data.",
  itemName,
}: DeleteConfirmationModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  // Prevent scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      console.error("Delete failed:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-[440px] rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-200 flex flex-col scale-100 animate-in zoom-in-95 duration-300">
        <div className="relative p-8 pb-0">
          <button 
            onClick={onClose} 
            disabled={isDeleting}
            className="absolute right-6 top-6 w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors group disabled:opacity-30"
          >
            <X className="w-5 h-5 text-slate-400 group-hover:text-slate-600" />
          </button>

          <div className="flex items-center justify-center w-16 h-16 rounded-3xl bg-red-50 mb-6 mx-auto">
            <Trash2 className="w-8 h-8 text-red-500" />
          </div>
          
          <div className="text-center space-y-3 mb-8">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              {title}
            </h2>
            <p className="text-slate-500 text-base leading-relaxed px-4">
              {description}
              {itemName && (
                <span className="block mt-3 font-semibold text-slate-900 italic bg-slate-50 py-2 px-3 rounded-xl border border-slate-100">
                  "{itemName}"
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mb-8">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isDeleting}
              className="flex-1 h-12 rounded-2xl border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 hover:text-slate-900 transition-all border-2"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={isDeleting}
              className="flex-1 h-12 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-bold shadow-lg shadow-red-100 transition-all gap-2"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  Delete
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="bg-slate-50 px-8 py-5 flex items-center justify-center gap-2 border-t border-slate-100">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            This action is irreversible
          </span>
        </div>
      </div>
    </div>
  );
}
