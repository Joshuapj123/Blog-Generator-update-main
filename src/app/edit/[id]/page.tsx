'use client';

import { useState, useEffect, use } from 'react';
import { getArticleById, saveArticle, Article } from '@/lib/firebase/firestore';
import { ArticleBlueprint, SectionBlock } from '@/types/article';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, ArrowLeft, Save, Sparkles, Download, ChevronUp, ChevronDown, CheckCircle2, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { InlineEditableText } from '@/components/InlineEditableText';
import { toMarkdown, toHtml, toPlainText, triggerDownload, slugify, renderMarkdown } from '@/lib/article-utils';
import { YouTubeEmbed } from '@/components/SectionEditor';

export default function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [article, setArticle] = useState<Article | null>(null);
  const [blueprint, setBlueprint] = useState<Partial<ArticleBlueprint> | null>(null);
  const [sections, setSections] = useState<SectionBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const fetchArticle = async () => {
      try {
        const data = await getArticleById(id);
        if (data) {
          setArticle(data);
          const content = JSON.parse(data.content);
          setBlueprint(content.blueprint);
          setSections(content.sections);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchArticle();
  }, [id]);

  const handleUpdate = async () => {
    if (!article || !blueprint) return;
    setIsUpdating(true);
    try {
        // Prepare updated sections (stripping any UI-only fields if necessary, though Sections are mostly data)
      const updatedArticle: Article = {
        ...article,
        title: blueprint.title || article.title,
        content: JSON.stringify({ blueprint, sections })
      };
      await saveArticle(updatedArticle);
      alert('Article updated successfully!');
    } catch (e) {
      console.error(e);
      alert('Failed to update article');
    } finally {
      setIsUpdating(false);
    }
  };

  const updateSectionField = (idx: number, field: keyof SectionBlock, value: any) => {
    const newSecs = [...sections];
    newSecs[idx] = { ...newSecs[idx], [field]: value };
    setSections(newSecs);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900/50">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto animate-pulse">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
        <p className="text-muted-foreground font-medium animate-pulse">Retrieving article...</p>
      </div>
    </div>
  );

  if (!article || !blueprint) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900/50 p-6">
      <Card className="max-w-md w-full border-dashed border-2 rounded-3xl">
        <CardContent className="p-12 text-center space-y-6">
          <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto text-4xl">😕</div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight">Article Not Found</h2>
            <p className="text-muted-foreground text-sm">We couldn't find the article you're looking for. It might have been deleted or the ID is incorrect.</p>
          </div>
          <Link href="/engine" className="block">
            <Button variant="default" className="w-full rounded-xl py-6">Back to Dashboard</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/20 pb-24">
      {/* Sticky Header */}
      <header className="border-b bg-card/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-4">
                <Link href="/engine">
                    <Button variant="ghost" size="icon" className="rounded-full hover:bg-muted/50"><ArrowLeft className="w-4 h-4" /></Button>
                </Link>
                <div className="h-4 w-px bg-border hidden sm:block" />
                <div className="hidden sm:block">
                    <h1 className="font-bold text-sm tracking-tight line-clamp-1">{blueprint.title}</h1>
                    <p className="text-[10px] uppercase font-bold text-primary tracking-widest leading-none mt-1">{article.folder || 'Uncategorized'}</p>
                </div>
            </div>
            
            <div className="flex items-center gap-3">
                <Button 
                    variant="outline"
                    className="gap-2 border-primary/40 text-primary hover:bg-primary/10 font-medium"
                    onClick={() => {
                        const mdContent = toMarkdown(blueprint, sections);
                        triggerDownload(`${slugify(blueprint.title || 'article')}.md`, mdContent, 'text/markdown');
                    }}
                >
                    <Download className="w-4 h-4" />
                    <span className="font-bold">Download</span>
                </Button>
                <Button 
                    variant="default" 
                    className="gap-2"
                    onClick={handleUpdate}
                    disabled={isUpdating}
                >
                    {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    <span className="font-bold">{isUpdating ? 'Saving...' : 'Update Article'}</span>
                </Button>
            </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Title & Meta Card */}
        <div className="bg-card border rounded-2xl p-8 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                <span className="flex h-2 w-2 rounded-full bg-accent" />
                <span className="flex-1">
                  <InlineEditableText
                      label="Intent"
                      value={blueprint.intent || ''}
                      onSave={(val) => setBlueprint({ ...blueprint, intent: val })}
                      renderedHtml={blueprint.intent || ''}
                  />
                </span>
            </div>

            <h1 className="text-3xl md:text-4xl font-extrabold text-foreground mb-6 leading-tight">
                <InlineEditableText
                    label="Title"
                    value={blueprint.title || ''}
                    onSave={(val) => setBlueprint({ ...blueprint, title: val })}
                    renderedHtml={blueprint.title || ''}
                />
            </h1>

            {blueprint.intro && (
                <div className="space-y-5">
                    <div className="text-lg text-muted-foreground leading-relaxed font-semibold">
                        <InlineEditableText
                            label="Intro Hook"
                            value={blueprint.intro.hook}
                            onSave={(val) => setBlueprint({ ...blueprint, intro: { ...blueprint.intro!, hook: val } })}
                            renderedHtml={renderMarkdown(blueprint.intro.hook)}
                        />
                    </div>
                    
                    <div className="p-4 bg-primary/5 border-l-4 border-primary rounded-r-lg">
                        <strong className="text-primary block mb-1 text-sm">Thesis</strong>
                        <div className="text-sm leading-relaxed">
                            <InlineEditableText
                                label="Thesis"
                                value={blueprint.intro.thesis || ''}
                                onSave={(val) => setBlueprint({ ...blueprint, intro: { ...blueprint.intro!, thesis: val } })}
                                renderedHtml={renderMarkdown(blueprint.intro.thesis || '')}
                            />
                        </div>
                    </div>
                    {blueprint.intro.business_context && (
                        <div className="text-sm text-muted-foreground leading-relaxed italic">
                           {blueprint.intro.business_context} 
                        </div>
                    )}
                </div>
            )}
        </div>

        {/* Content Sections */}
        <div className="space-y-6">
            {sections.map((sec, index) => {
                const isH3 = sec.level === 'H3';

                return (
                <Card
                    key={index}
                    className={`
                    overflow-hidden transition-all duration-300
                    ${isH3 ? 'ml-6 border-l-4 border-l-blue-400/60' : ''}
                    `}
                >
                    <CardHeader className="bg-secondary/20 pb-4 border-b">
                    <div className="flex items-start gap-3">
                        <div
                        className={`flex items-center justify-center rounded-full text-white font-bold shrink-0 ${isH3 ? 'w-6 h-6 bg-blue-500 text-xs' : 'w-8 h-8 bg-primary/80'
                            }`}
                        >
                        {isH3 ? '→' : index + 1}
                        </div>
                        <div className="flex-1 w-full max-w-[calc(100%-3rem)]">
                        <div className={`mb-1 font-semibold tracking-tight ${isH3 ? 'text-lg' : 'text-xl'}`}>
                            <InlineEditableText
                                label="Heading"
                                value={sec.heading}
                                onSave={(val) => updateSectionField(index, 'heading', val)}
                                renderedHtml={sec.heading}
                            />
                        </div>
                        </div>
                    </div>
                    </CardHeader>

                    <CardContent className="p-4">
                        <div className="space-y-5 animate-in fade-in duration-500">
                        {/* What it is */}
                        <div>
                            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                            <ChevronRight className="w-3 h-3 text-primary" /> What it is
                            </div>
                            <InlineEditableText
                            label="What it is"
                            value={sec.what_it_is}
                            renderedHtml={renderMarkdown(sec.what_it_is)}
                            onSave={(val) => updateSectionField(index, 'what_it_is', val)}
                            />
                        </div>

                        {/* Why it works */}
                        <div>
                            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                            <ChevronRight className="w-3 h-3 text-primary" /> Why it works
                            </div>
                            <InlineEditableText
                            label="Why it works"
                            value={sec.why_it_works}
                            renderedHtml={renderMarkdown(sec.why_it_works)}
                            onSave={(val) => updateSectionField(index, 'why_it_works', val)}
                            />
                        </div>

                        {/* Expert data point */}
                        {sec.experience_or_data_point && (
                            <div className="p-3 bg-blue-500/10 border-l-2 border-blue-500 rounded-r text-sm">
                            <strong className="text-blue-600 dark:text-blue-400">Expert Insight / Data: </strong>
                            <InlineEditableText
                                label="Expert Insight"
                                value={sec.experience_or_data_point}
                                renderedHtml={renderMarkdown(sec.experience_or_data_point)}
                                onSave={(val) => updateSectionField(index, 'experience_or_data_point', val)}
                            />
                            </div>
                        )}

                        {/* Copy formula + Brands */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* Writing Playbook */}
                            <div className="rounded-xl border border-violet-200 overflow-hidden">
                            <div className="px-4 py-2.5 bg-violet-100 text-xs font-bold uppercase tracking-wider text-zinc-900 flex items-center gap-1.5">
                                ✍️ Writing Playbook
                            </div>
                            <ol className="divide-y divide-violet-100">
                                {(Array.isArray(sec.copy_formula) ? sec.copy_formula : [sec.copy_formula]).map((f: string, i: number) => (
                                <li key={i} className="flex items-start gap-3 px-4 py-2.5 text-sm bg-white">
                                    <span className="shrink-0 w-5 h-5 rounded-full bg-violet-600 text-white text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                                    <span
                                    className="leading-relaxed text-foreground"
                                    dangerouslySetInnerHTML={{
                                        __html: f
                                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                        .replace(/`(.*?)`/g, '<code class="bg-violet-100 px-1 rounded text-[11px] font-mono">$1</code>')
                                    }}
                                    />
                                </li>
                                ))}
                            </ol>
                            </div>

                            {/* Brand Examples */}
                            <div className="rounded-xl border border-[#d4c5a9] overflow-hidden">
                            <div className="px-4 py-2.5 bg-[#c8b89a] text-xs font-bold uppercase tracking-wider text-zinc-900 flex items-center gap-1.5">
                                🏆 Brand Examples
                            </div>
                            <div className="divide-y divide-[#d4c5a9]">
                                {sec.example_brands?.map((b: string, i: number) => {
                                const cleaned = b.replace(/\*\*/g, '');
                                const colonIdx = cleaned.indexOf(':');
                                const brandName = colonIdx !== -1 ? cleaned.slice(0, colonIdx).trim() : cleaned.trim();
                                const description = colonIdx !== -1 ? cleaned.slice(colonIdx + 1).trim() : '';
                                return (
                                    <div key={i} className="px-4 py-2.5 bg-[#f5ede0] text-sm space-y-1">
                                    <div className="font-bold text-zinc-900">{brandName}</div>
                                    {description && (
                                        <div className="text-xs text-zinc-700 leading-relaxed">
                                        {description}
                                        </div>
                                    )}
                                    </div>
                                );
                                })}
                            </div>
                            </div>
                        </div>

                        {/* YouTube */}
                        {sec.rich_media_query && (
                            <div className="rounded-xl border border-blue-200 overflow-hidden">
                            <div className="px-4 py-2.5 bg-gradient-to-r from-primary to-accent flex items-center gap-2">
                                <span className="text-white text-xs">▶</span>
                                <span className="text-white text-xs font-bold uppercase tracking-wider">YouTube Reference</span>
                                <span className="ml-auto text-white/70 text-[10px] italic truncate max-w-[60%]">{sec.rich_media_query.suggested_search_query}</span>
                            </div>
                            {sec.rich_media_query.youtube_video_id && (
                                <YouTubeEmbed
                                    href={`https://www.youtube.com/watch?v=${sec.rich_media_query.youtube_video_id}`}
                                    onUpdateUrl={(_oldUrl, newUrl) => {
                                        try {
                                            const newId = new URL(newUrl).searchParams.get('v') || '';
                                            updateSectionField(index, 'rich_media_query', {
                                                ...sec.rich_media_query,
                                                youtube_video_id: newId,
                                            });
                                        } catch {}
                                    }}
                                />
                            )}
                            </div>
                        )}

                        {/* Takeaway */}
                        <div className="p-4 bg-accent/10 border-l-4 border-accent rounded-r-lg flex gap-3">
                            <CheckCircle2 className="w-5 h-5 shrink-0 text-accent mt-0.5" />
                            <div className="flex-1">
                                <InlineEditableText
                                label="Takeaway"
                                value={sec.takeaway}
                                renderedHtml={sec.takeaway}
                                onSave={(val) => updateSectionField(index, 'takeaway', val)}
                                />
                            </div>
                        </div>

                        {/* Authority link */}
                        {(sec as any).outbound_authority_link?.resolved_url && (
                            <div className="text-xs text-muted-foreground">
                            📎 Source:{' '}
                            <a
                                href={(sec as any).outbound_authority_link.resolved_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary underline"
                            >
                                {(sec as any).outbound_authority_link.resolved_title || (sec as any).outbound_authority_link.resolved_url}
                            </a>
                            </div>
                        )}

                        </div>
                    </CardContent>
                </Card>
                );
            })}
        </div>

        {/* Footer CTA */}
        {blueprint.cta && (
            <div className="my-10 p-6 rounded-2xl border-2 border-dashed border-primary/20 bg-primary/5 text-center space-y-4">
                <h3 className="text-xl font-bold text-foreground">
                    <InlineEditableText
                        label="CTA Heading"
                        value={blueprint.cta.heading}
                        onSave={(val) => setBlueprint({ ...blueprint, cta: { ...blueprint.cta!, heading: val } })}
                        renderedHtml={blueprint.cta.heading}
                    />
                </h3>
                <div className="text-sm text-muted-foreground max-w-lg mx-auto">
                    <InlineEditableText
                        label="CTA Description"
                        value={blueprint.cta.description}
                        onSave={(val) => setBlueprint({ ...blueprint, cta: { ...blueprint.cta!, description: val } })}
                        renderedHtml={blueprint.cta.description}
                    />
                </div>
                <div className="inline-flex flex-col items-center mt-2 group relative">
                    <Button className="font-semibold pointer-events-none">
                        {blueprint.cta.button_text}
                    </Button>
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center text-primary font-bold shadow-sm p-2 outline outline-1 outline-primary/40">
                      <div className="w-full h-full text-center">
                        <InlineEditableText
                            label="Button Text"
                            value={blueprint.cta.button_text}
                            onSave={(val) => setBlueprint({ ...blueprint, cta: { ...blueprint.cta!, button_text: val } })}
                            renderedHtml={blueprint.cta.button_text}
                        />
                      </div>
                    </div>
                </div>
            </div>
        )}
      </main>
    </div>
  );
}
