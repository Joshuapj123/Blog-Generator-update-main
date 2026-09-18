'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ExtractedDesign } from '@/lib/extract-reference-design';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowRight, CheckCircle2, Circle, Loader2, AlertCircle } from 'lucide-react';
import { captureEvent } from '@/lib/analytics/posthog';

// ─── Progress stages definition ───────────────────────────────────────────────

const STAGES = [
  { id: 1, label: 'Launch browser' },
  { id: 2, label: 'Navigate to URL' },
  { id: 3, label: 'Parse article' },
  { id: 4, label: 'Extract styles & SEO' },
  { id: 5, label: 'Analyse mobile layout' },
  { id: 6, label: 'Assemble results' },
];

// ─── Progress Bar Component ───────────────────────────────────────────────────

function ExtractionProgress({
  currentStage,
  currentLabel,
  percent,
  error,
}: {
  currentStage: number;
  currentLabel: string;
  percent: number;
  error: string;
}) {
  return (
    <div className="w-full max-w-xl mx-auto">
      {/* Percent bar */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-semibold text-foreground">
            {error ? 'Extraction failed' : percent >= 100 ? 'Complete!' : 'Processing…'}
          </span>
          <span className="text-sm font-mono text-muted-foreground">{Math.min(percent, 100)}%</span>
        </div>
        <div className="relative h-2.5 rounded-full bg-secondary overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${Math.min(percent, 100)}%`,
              background: error
                ? 'var(--destructive)'
                : 'linear-gradient(90deg, var(--primary), var(--accent))',
              boxShadow: error ? 'none' : '0 0 10px 2px rgba(2,132,199,0.4)',
            }}
          />
          {/* shimmer effect */}
          {!error && percent < 100 && (
            <div
              className="absolute inset-y-0 w-16 bg-white/20 animate-shimmer"
              style={{ left: `calc(${percent}% - 4rem)` }}
            />
          )}
        </div>
      </div>

      {/* Stage steps */}
      <ol className="space-y-3">
        {STAGES.map((s) => {
          const done = currentStage > s.id;
          const active = currentStage === s.id && !error;
          const failed = !!error && currentStage === s.id;

          return (
            <li key={s.id} className="flex items-center gap-3">
              <span
                className="flex-shrink-0 transition-all duration-300"
                style={{ color: done ? 'var(--primary)' : active ? 'var(--accent)' : failed ? 'var(--destructive)' : 'var(--muted-foreground)' }}
              >
                {done ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : active ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : failed ? (
                  <AlertCircle className="w-5 h-5" />
                ) : (
                  <Circle className="w-5 h-5" />
                )}
              </span>
              <span
                className={`text-sm transition-all duration-300 ${
                  done
                    ? 'text-foreground font-medium'
                    : active
                    ? 'text-foreground font-semibold'
                    : 'text-muted-foreground'
                }`}
              >
                {active ? currentLabel : s.label}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Error message */}
      {error && (
        <div className="mt-5 p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm font-medium leading-relaxed">
          <AlertCircle className="inline w-4 h-4 mr-2 -mt-0.5" />
          {error}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ExtractedDesign | null>(null);
  const [error, setError] = useState('');

  // Progress state
  const [stage, setStage] = useState(0);
  const [stageLabel, setStageLabel] = useState('');
  const [percent, setPercent] = useState(0);

  const hasFiredPageView = useRef(false);

  useEffect(() => {
    if (hasFiredPageView.current) return;
    hasFiredPageView.current = true;

    captureEvent('landing_page_view', {
      path: typeof window !== 'undefined' ? window.location.pathname : '/',
      referrer: typeof document !== 'undefined' ? document.referrer || '' : '',
      viewport_width: typeof window !== 'undefined' ? window.innerWidth : 0,
    });
  }, []);

  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError('');
    setData(null);
    setStage(1);
    setStageLabel('Launching headless browser…');
    setPercent(0);

    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (!res.body) throw new Error('No response stream');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE lines start with "data: "
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === 'stage') {
              setStage(event.stage);
              setStageLabel(event.label);
              setPercent(event.percent);
            } else if (event.type === 'done') {
              setPercent(100);
              setData(event.data);
            } else if (event.type === 'error') {
              setError(event.message);
            }
          } catch { /* malformed line */ }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Connection failed');
    } finally {
      setLoading(false);
    }
  };

  console.log("isLoading", loading);

  const showProgress = loading || (!!error && stage > 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b-0 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary font-bold text-xl">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white">
              B
            </div>
            Blog Design Extractor
          </div>
          <Link
            href="/engine"
            onClick={() => {
              captureEvent('cta_clicked', {
                cta_text: 'Launch Blog Generator',
                target_href: '/engine',
              });
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all"
          >
            Launch Blog Generator
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 flex flex-col items-center">
        {/* Hero */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4 text-gray-900">
            Extract Any Blog&apos;s{' '}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
              Design DNA
            </span>
          </h1>
          <p className="text-lg text-gray-500 mb-4">
            Input a URL and we&apos;ll extract metadata, typography, colors, layouts and editorial patterns using
            Playwright and Readability.
          </p>
          <div>
            <Link
              href="/engine"
              onClick={() => {
                captureEvent('cta_clicked', {
                  cta_text: 'Start Autonomous Blog Generation',
                  target_href: '/engine',
                });
              }}
              className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              Or start autonomous generation with ACUTE &rarr;
            </Link>
          </div>
        </div>

        {/* Input card */}
        <Card className="w-full max-w-xl mx-auto mb-10 border-primary/20 shadow-lg shadow-primary/5">
          <form onSubmit={handleExtract}>
            <CardHeader>
              <CardTitle>Extract Reference Design</CardTitle>
              <CardDescription>Enter the full URL of the blog post to analyse.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-3">
                <Input
                  id="blog-url-input"
                  type="url"
                  placeholder="https://example.com/blog/article"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="flex-1 bg-background"
                  required
                  disabled={loading}
                />
                <Button type="submit" disabled={loading} className="group min-w-[120px]">
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analysing
                    </>
                  ) : (
                    <>
                      Extract{' '}
                      <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </form>
        </Card>

        {/* ── Live Progress ── */}
        {showProgress && (
          <div className="w-full max-w-xl mx-auto mb-12 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Card className="border-primary/20 shadow-lg shadow-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Extraction Pipeline</CardTitle>
                <CardDescription className="text-xs">
                  Running headless Playwright + Readability analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ExtractionProgress
                  currentStage={stage}
                  currentLabel={stageLabel}
                  percent={percent}
                  error={error}
                />
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Results ── */}
        {data && (
          <div className="w-full max-w-5xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-3 text-gray-800">
              Analysis Results
              <span className="text-sm font-normal text-muted-foreground px-2 py-1 rounded bg-secondary">
                {new URL(data.metadata.url).hostname}
              </span>
            </h2>

            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="mb-6 bg-card border">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="styles">Styles &amp; Colors</TabsTrigger>
                <TabsTrigger value="typography">Typography</TabsTrigger>
                <TabsTrigger value="json">Raw Data</TabsTrigger>
              </TabsList>

              {/* ── Overview ── */}
              <TabsContent value="overview" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg text-primary">Metadata</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <div className="text-sm text-muted-foreground font-medium mb-1">Title</div>
                        <div className="font-semibold">{data.metadata.title || 'N/A'}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm text-muted-foreground font-medium mb-1">Author</div>
                          <div>{data.metadata.byline || 'N/A'}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground font-medium mb-1">Word Count</div>
                          <div>{data.metadata.length.toLocaleString()} chars</div>
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground font-medium mb-1">Excerpt</div>
                        <div className="text-sm line-clamp-3">{data.metadata.excerpt || 'N/A'}</div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg text-primary">Editorial Patterns</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-3">
                        {[
                          { label: 'Drop Caps', value: data.editorialPatterns.hasDropCap ? 'Yes' : 'No' },
                          { label: 'Pull Quotes', value: data.editorialPatterns.hasPullQuotes ? 'Yes' : 'No' },
                          { label: 'Images Count', value: String(data.editorialPatterns.imageCount) },
                          { label: 'Container Max-Width', value: data.layoutValues.containerMaxWidth },
                        ].map((item, i, arr) => (
                          <li
                            key={item.label}
                            className={`flex justify-between items-center py-2 ${i < arr.length - 1 ? 'border-b' : ''}`}
                          >
                            <span className="text-muted-foreground">{item.label}</span>
                            <span className="font-medium bg-secondary px-2 py-1 rounded text-sm">{item.value}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* ── Styles & Colors ── */}
              <TabsContent value="styles" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg text-primary">Theme Overview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                      <div
                        className="p-4 rounded-xl border flex flex-col items-center justify-center text-center gap-2"
                        style={{ backgroundColor: data.dominantStyles.bodyBackground }}
                      >
                        <div className="h-10 w-10 rounded-full border shadow-sm mb-2 mix-blend-difference bg-white" />
                        <div className="text-xs font-mono bg-white/80 dark:bg-black/80 px-2 py-1 rounded">
                          {data.dominantStyles.bodyBackground}
                        </div>
                        <div className="text-sm font-medium">Background</div>
                      </div>
                      <div
                        className="p-4 rounded-xl border flex flex-col items-center justify-center text-center gap-2"
                        style={{ backgroundColor: data.dominantStyles.textColor }}
                      >
                        <div className="h-10 w-10 rounded-full border shadow-sm mb-2 bg-white/20" />
                        <div className="text-xs font-mono bg-white/80 dark:bg-black/80 text-black px-2 py-1 rounded">
                          {data.dominantStyles.textColor}
                        </div>
                        <div className="text-sm font-medium">Text Color</div>
                      </div>
                    </div>

                    <h3 className="font-medium mb-3">Extracted CSS Variables (top 20)</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {Object.entries(data.dominantStyles.cssVariables)
                        .slice(0, 20)
                        .map(([key, val]) => (
                          <div
                            key={key}
                            className="flex flex-col p-2 border rounded bg-secondary/50 text-sm font-mono overflow-hidden"
                          >
                            <span className="text-muted-foreground truncate" title={key}>{key}</span>
                            <span className="truncate" title={val as string}>{val as string}</span>
                          </div>
                        ))}
                      {Object.keys(data.dominantStyles.cssVariables).length === 0 && (
                        <div className="text-sm text-muted-foreground italic">No CSS variables found on :root</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── Typography ── */}
              <TabsContent value="typography" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg text-primary">Font &amp; Specimens</CardTitle>
                    <CardDescription>
                      Font Family:{' '}
                      <span className="font-mono bg-secondary px-1 rounded text-foreground">
                        {data.dominantStyles.fontFamily}
                      </span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-8">
                    {data.componentSamples.headings?.h1 && (
                      <div>
                        <div className="text-xs text-muted-foreground uppercase font-semibold mb-2 tracking-wider">Heading 1</div>
                        <div className="p-6 border rounded-xl bg-white dark:bg-black overflow-hidden" style={data.componentSamples.headings.h1}>
                          {data.componentSamples.headings.h1.fontFamily}
                        </div>
                        <div className="mt-2 text-xs font-mono text-muted-foreground">
                          {data.componentSamples.headings.h1.fontSize} / {data.componentSamples.headings.h1.fontWeight} / {data.componentSamples.headings.h1.lineHeight}
                        </div>
                      </div>
                    )}
                    {data.componentSamples.headings?.h2 && (
                      <div>
                        <div className="text-xs text-muted-foreground uppercase font-semibold mb-2 tracking-wider">Heading 2</div>
                        <div className="p-6 border rounded-xl bg-white dark:bg-black overflow-hidden" style={data.componentSamples.headings.h2}>
                          The Quick Brown Fox Jumps Over The Lazy Dog
                        </div>
                        <div className="mt-2 text-xs font-mono text-muted-foreground">
                          {data.componentSamples.headings.h2.fontSize} / {data.componentSamples.headings.h2.fontWeight} / {data.componentSamples.headings.h2.lineHeight}
                        </div>
                      </div>
                    )}
                    {data.componentSamples.paragraph && (
                      <div>
                        <div className="text-xs text-muted-foreground uppercase font-semibold mb-2 tracking-wider">Paragraph Context</div>
                        <div className="p-6 border rounded-xl bg-white dark:bg-black overflow-hidden max-w-3xl" style={data.componentSamples.paragraph}>
                          This is a sample paragraph reflecting the extracted properties. It demonstrates line-height, letter-spacing, and text color adjustments exactly as they appear on the referenced site.
                        </div>
                        <div className="mt-2 text-xs font-mono text-muted-foreground">
                          {data.componentSamples.paragraph.fontSize} / {data.componentSamples.paragraph.lineHeight} / margin: {data.layoutValues.spacing.paragraph}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── Raw JSON ── */}
              <TabsContent value="json">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg text-primary">Extracted JSON Payload</CardTitle>
                    <CardDescription>Ready to be stored in your database.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <pre className="p-4 bg-black text-gray-300 rounded-xl overflow-x-auto text-sm font-mono max-h-[600px] overflow-y-auto">
                      {JSON.stringify(data, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>
    </div>
  );
}
