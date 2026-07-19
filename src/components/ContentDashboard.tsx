import { useState, useEffect } from 'react';
import { 
  getArticles, updateArticleStage, updateArticleFolder, Article, 
  getFolders, createFolder, Folder,
  getExternalLinks, saveExternalLink, deleteExternalLink as removeExternalLink, updateExternalLinkFolder, 
  ExternalLink as ExternalLinkType, deleteArticle
} from '@/lib/firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, ArrowLeft, Eye, Edit3, ExternalLink, Link2, Trash2, Plus, Globe } from 'lucide-react';
import Link from 'next/link';
import { DeleteConfirmationModal } from './ui/DeleteConfirmationModal';
import { useEngineOptional } from '@/app/(main)/engine/context/EngineContext';

export function ContentDashboard({ onEdit }: { onEdit?: (id: string) => void }) {
  const engine = useEngineOptional();
  const [activeTab, setActiveTab] = useState<'articles' | 'links'>('articles');
  const [articles, setArticles] = useState<Article[]>([]);
  const [externalLinks, setExternalLinks] = useState<ExternalLinkType[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Folder creation state
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  // Link creation state
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkFolder, setNewLinkFolder] = useState('');
  const [isCreatingLink, setIsCreatingLink] = useState(false);

  // Delete article state
  const [articleToDelete, setArticleToDelete] = useState<Article | null>(null);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [articlesData, foldersData, linksData] = await Promise.all([
          getArticles(), 
          getFolders(),
          getExternalLinks()
        ]);
        setArticles(articlesData);
        setFolders(foldersData);
        setExternalLinks(linksData);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const updateStage = async (id: string, newStage: 'Todo' | 'Draft' | 'Published') => {
    try {
      await updateArticleStage(id, newStage);
      setArticles(prev => prev.map(a => a.id === id ? { ...a, stage: newStage } : a));
    } catch (e) {
      console.error(e);
      alert('Failed to update stage');
    }
  };

  const updateFolder = async (id: string, newFolder: string) => {
    try {
      await updateArticleFolder(id, newFolder);
      setArticles(prev => prev.map(a => a.id === id ? { ...a, folder: newFolder } : a));
    } catch (e) {
      console.error(e);
      alert('Failed to update folder');
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setIsCreatingFolder(true);
    try {
      const folder = await createFolder(newFolderName.trim());
      setFolders(prev => [...prev, folder]);
      setNewFolderName('');
    } catch (e) {
      console.error(e);
      alert('Failed to create folder');
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleCreateLink = async () => {
    if (!newLinkUrl.trim() || !newLinkTitle.trim()) return;
    setIsCreatingLink(true);
    try {
      const linkData: ExternalLinkType = {
        title: newLinkTitle.trim(),
        url: newLinkUrl.trim(),
        folder: newLinkFolder
      };
      const id = await saveExternalLink(linkData);
      setExternalLinks(prev => [...prev, { ...linkData, id, updatedAt: { seconds: Date.now() / 1000 } }]);
      setNewLinkTitle('');
      setNewLinkUrl('');
      setNewLinkFolder('');
    } catch (e) {
      console.error(e);
      alert('Failed to create link');
    } finally {
      setIsCreatingLink(false);
    }
  };

  const handleUpdateLinkFolder = async (id: string, folder: string) => {
    try {
      await updateExternalLinkFolder(id, folder);
      setExternalLinks(prev => prev.map(l => l.id === id ? { ...l, folder } : l));
    } catch (e) {
      console.error(e);
      alert('Failed to update link folder');
    }
  };

  const handleDeleteLink = async (id: string) => {
    if (!confirm('Are you sure you want to delete this link?')) return;
    try {
      await removeExternalLink(id);
      setExternalLinks(prev => prev.filter(l => l.id !== id));
    } catch (e) {
      console.error(e);
      alert('Failed to delete link');
    }
  };

  const handleDeleteArticle = async () => {
    if (!articleToDelete?.id) return;
    try {
      // If this is the currently active article in the engine, use the engine's delete method
      if (engine && articleToDelete.id === engine.currentArticleId) {
        await engine.deleteCurrentArticle();
      } else {
        await deleteArticle(articleToDelete.id);
      }
      
      setArticles(prev => prev.filter(a => a.id !== articleToDelete.id));
      
      // Clear related LocalStorage if we can find keywords
      try {
        const title = articleToDelete.title;
        const kw = articleToDelete.targetKeywords?.[0] || '';
        const refUrl = articleToDelete.referenceUrl || '';
        
        localStorage.removeItem(`ext_cache_${title}_${refUrl}`);
        if (kw) {
          localStorage.removeItem(`serp_cache_${title}_${kw}`);
        }
      } catch (e) {}
      
      setArticleToDelete(null);
    } catch (e) {
      console.error(e);
      alert('Failed to delete article');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('articles')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all ${
            activeTab === 'articles' ? 'bg-white shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Edit3 className="w-4 h-4" />
          Articles
        </button>
        <button
          onClick={() => setActiveTab('links')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all ${
            activeTab === 'links' ? 'bg-white shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Link2 className="w-4 h-4" />
          External Links
        </button>
      </div>

      <Card className="border-none shadow-none bg-transparent">
        <CardHeader className="px-0 pt-0 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
              <CardTitle>{activeTab === 'articles' ? 'Your Articles' : 'External Links'}</CardTitle>
              <CardDescription>
                {activeTab === 'articles' 
                  ? 'Manage your generated content and stages.' 
                  : 'Maintain a repository of external resources to cite in your blogs.'}
              </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'articles' ? (
              <>
                <Input 
                    placeholder="New Folder Name" 
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    className="h-8 text-sm w-[150px]"
                />
                <Button 
                    onClick={handleCreateFolder} 
                    disabled={isCreatingFolder || !newFolderName.trim()}
                    className="h-8 text-xs font-bold bg-blue-100 hover:bg-blue-200 text-black border-0 shadow-none px-3"
                >
                    {isCreatingFolder ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />} Add Folder
                </Button>
              </>
            ) : (
              <div className="flex flex-col gap-2 p-4 bg-muted/30 rounded-2xl border border-dashed sm:w-[400px]">
                <div className="text-xs font-black uppercase tracking-tight mb-2">Add New Resource</div>
                <div className="grid grid-cols-2 gap-2">
                  <Input 
                    placeholder="Anchor Text / Title" 
                    value={newLinkTitle}
                    onChange={e => setNewLinkTitle(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <select 
                    value={newLinkFolder}
                    onChange={(e) => setNewLinkFolder(e.target.value)}
                    className="h-8 text-xs px-2 rounded-md bg-background border outline-none"
                  >
                    <option value="">No Folder</option>
                    {folders.map(f => (
                      <option key={f.id} value={f.name}>{f.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <Input 
                    placeholder="https://example.com" 
                    value={newLinkUrl}
                    onChange={e => setNewLinkUrl(e.target.value)}
                    className="h-8 text-xs flex-1"
                  />
                  <Button 
                    onClick={handleCreateLink}
                    disabled={isCreatingLink || !newLinkUrl.trim() || !newLinkTitle.trim()}
                    className="h-8 text-xs font-bold bg-primary text-white border-0 px-3"
                  >
                    {isCreatingLink ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-primary/50" /></div>
          ) : activeTab === 'articles' ? (
            articles.length === 0 ? (
              <div className="text-center p-12 border-2 border-dashed rounded-2xl text-muted-foreground">
                  <div className="mb-2">No articles found.</div>
                  <div className="text-sm">Generate and save a draft to see it here.</div>
              </div>
            ) : (
              <div className="border rounded-xl bg-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead className="bg-muted/50 text-xs uppercase font-bold text-muted-foreground border-b">
                      <tr>
                        <th className="px-4 py-4">Title</th>
                        <th className="px-4 py-4">Folder</th>
                        <th className="px-4 py-4">Status</th>
                        <th className="px-4 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {articles.sort((a, b) => {
                        const order = { 'Todo': 0, 'Draft': 1, 'Published': 2 };
                        return order[a.stage] - order[b.stage];
                      }).map(article => (
                        <tr key={article.id} className={`hover:bg-muted/30 transition-colors group ${article.stage === 'Todo' ? 'bg-indigo-50/30' : ''}`}>
                          <td className="px-4 py-4">
                              <div className="font-semibold text-foreground line-clamp-1 flex items-center gap-2">
                                {article.stage === 'Todo' && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />}
                                {article.title}
                              </div>
                              <div className="text-[10px] text-muted-foreground font-mono mt-0.5 uppercase tracking-wider">{new Date(article.updatedAt?.seconds * 1000).toLocaleDateString()}</div>
                          </td>
                          <td className="px-4 py-4">
                              <select 
                                  value={article.folder || ''}
                                  onChange={(e) => updateFolder(article.id!, e.target.value)}
                                  className="px-2 py-1 items-center justify-center rounded-md bg-secondary text-[11px] font-medium text-secondary-foreground border-none outline-none appearance-none cursor-pointer pr-5 hover:bg-secondary/80 focus:ring-1 focus:ring-primary/30"
                                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundPosition: `right 4px center`, backgroundRepeat: `no-repeat`, backgroundSize: `10px 10px` }}
                              >
                                  <option value="">Uncategorized</option>
                                  {folders.map(f => (
                                      <option key={f.id} value={f.name}>{f.name}</option>
                                  ))}
                              </select>
                          </td>
                          <td className="px-4 py-4">
                            <div className="relative w-fit">
                              <select 
                                value={article.stage}
                                onChange={(e) => updateStage(article.id!, e.target.value as 'Todo' | 'Draft' | 'Published')}
                                className={`px-3 py-1.5 pr-8 appearance-none cursor-pointer outline-none rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border shadow-sm focus:ring-2 focus:ring-primary/20 ${
                                  article.stage === 'Published' 
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                    : article.stage === 'Draft' 
                                      ? 'bg-amber-50 text-amber-700 border-amber-200' 
                                      : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                }`}
                              >
                                <option value="Todo">Todo</option>
                                <option value="Draft">Draft</option>
                                <option value="Published">Published</option>
                              </select>
                              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              {article.stage === 'Published' && (
                                <Link 
                                  href={`/blog/${article.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} 
                                  target="_blank"
                                  title="View Published Page"
                                >
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                    <ExternalLink className="w-4 h-4 text-emerald-600" />
                                  </Button>
                                </Link>
                              )}
                              <Link 
                                  href={`/engine?todo_id=${article.id}`} 
                                  target="_blank"
                                  title="Edit Content"
                              >
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                >
                                  <Edit3 className="w-4 h-4 text-primary" />
                                </Button>
                              </Link>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => setArticleToDelete(article)}
                                className="h-8 w-8 p-0 hover:text-red-600"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          ) : (
            externalLinks.length === 0 ? (
              <div className="text-center p-12 border-2 border-dashed rounded-2xl text-muted-foreground">
                  <div className="mb-2">No external links found.</div>
                  <div className="text-sm">Add your first resource to use it in your blogs.</div>
              </div>
            ) : (
              <div className="border rounded-xl bg-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead className="bg-muted/50 text-xs uppercase font-bold text-muted-foreground border-b">
                      <tr>
                        <th className="px-4 py-4">Title / Anchor</th>
                        <th className="px-4 py-4">URL</th>
                        <th className="px-4 py-4">Folder</th>
                        <th className="px-4 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {externalLinks.map(link => (
                        <tr key={link.id} className="hover:bg-muted/30 transition-colors group">
                          <td className="px-4 py-4">
                              <div className="font-semibold text-foreground line-clamp-1">{link.title}</div>
                          </td>
                          <td className="px-4 py-4">
                              <div className="text-xs text-muted-foreground font-mono flex items-center gap-1.5 opacity-70 group-hover:opacity-100 transition-opacity">
                                <Globe className="w-3 h-3" />
                                <span className="line-clamp-1 max-w-[200px]">{link.url}</span>
                              </div>
                          </td>
                          <td className="px-4 py-4">
                              <select 
                                  value={link.folder || ''}
                                  onChange={(e) => handleUpdateLinkFolder(link.id!, e.target.value)}
                                  className="px-2 py-1 items-center justify-center rounded-md bg-secondary text-[11px] font-medium text-secondary-foreground border-none outline-none appearance-none cursor-pointer pr-5 hover:bg-secondary/80 focus:ring-1 focus:ring-primary/30"
                                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundPosition: `right 4px center`, backgroundRepeat: `no-repeat`, backgroundSize: `10px 10px` }}
                              >
                                  <option value="">Uncategorized</option>
                                  {folders.map(f => (
                                      <option key={f.id} value={f.name}>{f.name}</option>
                                  ))}
                              </select>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <a href={link.url} target="_blank" rel="noopener noreferrer">
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <ExternalLink className="w-4 h-4 text-primary" />
                                </Button>
                              </a>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handleDeleteLink(link.id!)}
                                className="h-8 w-8 p-0 hover:text-red-600"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}
        </CardContent>
      </Card>

      <DeleteConfirmationModal 
        isOpen={!!articleToDelete}
        onClose={() => setArticleToDelete(null)}
        onConfirm={handleDeleteArticle}
        title="Delete Article"
        itemName={articleToDelete?.title}
      />
    </div>
  );
}
