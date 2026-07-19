import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getFolders, createFolder, saveArticle, Article, Folder } from '@/lib/firebase/firestore';
import { Loader2, Save, X } from 'lucide-react';

export function SaveDraftModal({
  blueprint,
  sections,
  keywordBank,
  onClose,
  onSaved
}: {
  blueprint: any;
  sections: any[];
  keywordBank?: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [stage, setStage] = useState<'Draft' | 'Published'>('Draft');
  const [isSaving, setIsSaving] = useState(false);
  const [loadingFolders, setLoadingFolders] = useState(true);

  useEffect(() => {
    const fetchFolders = async () => {
      try {
        const data = await getFolders();
        setFolders(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingFolders(false);
      }
    };
    fetchFolders();
  }, []);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setIsCreatingFolder(true);
    try {
      const folder = await createFolder(newFolderName.trim());
      setFolders(prev => [...prev, folder]);
      setSelectedFolder(folder.name);
      setNewFolderName('');
    } catch (e) {
      console.error(e);
      alert('Failed to create folder');
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const articleData: Article = {
        title: blueprint.title || 'Untitled',
        content: JSON.stringify({ blueprint, sections }),
        folder: selectedFolder,
        stage: stage,
        keywordBank: keywordBank || null
      };
      await saveArticle(articleData);
      onSaved();
    } catch (e) {
      console.error(e);
      alert('Failed to save draft');
    } finally {
      setIsSaving(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-card w-full max-w-md rounded-xl shadow-xl overflow-hidden border">
        <div className="px-6 py-4 border-b flex justify-between items-center bg-muted/30">
          <h2 className="font-semibold flex items-center gap-2">
            <Save className="w-4 h-4 text-primary" /> Save Article
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase mb-1.5 block">Select Folder</label>
            {loadingFolders ? (
              <div className="h-10 flex items-center px-3 border rounded text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin mr-2"/> Loading folders...</div>
            ) : (
              <select 
                className="w-full text-sm p-2 rounded border focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                value={selectedFolder}
                onChange={(e) => setSelectedFolder(e.target.value)}
              >
                <option value="">No Folder (Uncategorized)</option>
                {folders.map(f => (
                  <option key={f.id} value={f.name}>{f.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex gap-2">
            <Input 
              placeholder="New Folder Name" 
              value={newFolderName} 
              onChange={e => setNewFolderName(e.target.value)} 
            />
            <Button variant="outline" onClick={handleCreateFolder} disabled={isCreatingFolder || !newFolderName.trim()}>
              {isCreatingFolder ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
            </Button>
          </div>
          
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase mb-1.5 block mt-4">Publication Stage</label>
            <select 
              className="w-full text-sm p-2 rounded border focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              value={stage}
              onChange={(e) => setStage(e.target.value as any)}
            >
              <option value="Draft">Draft</option>
              <option value="Published">Published</option>
            </select>
            <p className="text-xs text-muted-foreground mt-1.5">
              Only "Published" articles will be used for automated internal backlinking.
            </p>
          </div>
        </div>
        <div className="p-4 bg-muted/30 border-t flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save to Database
          </Button>
        </div>
      </div>
    </div>
  );
}
