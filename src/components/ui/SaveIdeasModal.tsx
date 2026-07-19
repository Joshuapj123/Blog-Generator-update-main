import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getFolders, createFolder, saveArticle, Article, Folder } from '@/lib/firebase/firestore';
import { Loader2, Save, X, Lightbulb } from 'lucide-react';

export function SaveIdeasModal({
  topics,
  onClose,
  onSaved
}: {
  topics: { title: string, description: string, keywords: string, intent: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
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
    if (topics.length === 0) return;
    setIsSaving(true);
    try {
      const promises = topics.map(topic => {
        const articleData: Article = {
          title: topic.title,
          content: JSON.stringify({ topicIdea: topic }),
          folder: selectedFolder,
          stage: 'Todo'
        };
        return saveArticle(articleData);
      });
      await Promise.all(promises);
      onSaved();
    } catch (e) {
      console.error(e);
      alert('Failed to save ideas');
    } finally {
      setIsSaving(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-card w-full max-w-md rounded-xl shadow-xl overflow-hidden border">
        <div className="px-6 py-4 border-b flex justify-between items-center bg-muted/30">
          <h2 className="font-semibold flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-primary" /> Save {topics.length} Idea{topics.length !== 1 ? 's' : ''}
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
          
          <div className="text-sm text-muted-foreground pt-2">
            This will save <b>{topics.length}</b> ideas as <b>Todo</b> items in your dashboard, under the selected folder.
          </div>
        </div>
        <div className="p-4 bg-muted/30 border-t flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving || topics.length === 0}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save Ideas
          </Button>
        </div>
      </div>
    </div>
  );
}
