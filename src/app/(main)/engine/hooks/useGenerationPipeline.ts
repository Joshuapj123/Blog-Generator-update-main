'use client';

import { useRef, useEffect } from 'react';
import { useEngine } from '../context/EngineContext';

import { toMarkdown } from '@/lib/article-utils';
import { computeStructuredScore } from '@/lib/content-scoring';
import { getArticleByGenerationInputs } from '@/lib/firebase/firestore';
import { calculateFleschReadingEase } from '@/lib/seo-intelligence/quality_validator';
import { captureEvent, sanitizeErrorMessage } from '@/lib/analytics/posthog';

export function useGenerationPipeline() {
  const engine = useEngine();

  const runPostGenerationAnalysis = async (finalSections: any[], blueprint: any) => {
    engine.setIsDetectingWeakCopy(true);
    engine.setGenStatus('Running full SEO QA analysis...');
    engine.setWeakCopyFlags([]);
    engine.setAnalysisResults(null);
    
    try {
      const isDefaultMetaText = (text: string, heading?: string): boolean => {
        if (!text) return true;
        const t = text.trim().toLowerCase();
        const cleanT = t.endsWith('.') ? t.slice(0, -1) : t;

        if (cleanT.includes("this section details key execution processes and guidelines")) return true;
        if (cleanT.includes("key execution processes and guidelines")) return true;
        if (cleanT.includes("factual research on")) return true;
        if (cleanT.startsWith("factual research")) return true;
        if (cleanT.includes("takeaway for")) return true;
        if (cleanT.startsWith("takeaway for")) return true;

        if (heading) {
          const hNorm = heading.trim().toLowerCase();
          const cleanHNorm = hNorm.endsWith('.') ? hNorm.slice(0, -1) : hNorm;
          if (cleanT === `factual research on ${cleanHNorm}`) return true;
          if (cleanT === `takeaway for ${cleanHNorm}`) return true;
        }
        return false;
      };

      const rawMarkdown = (blueprint?.section_outlines || []).map((blueprintSec: any, i: number) => {
        const sec = finalSections[i];
        if (!sec) return `## ${blueprintSec.heading}\n\n*Content missing.*`;
        const lines: string[] = [];
        const level = sec.level === 'H3' ? '###' : '##';
        lines.push(`${level} ${sec.heading}`);
        lines.push('');
        if (sec.what_it_is) lines.push(sec.what_it_is.replace(/\*\*(.*?)\*\*/g, '**$1**').trim() + '\n');
        if (sec.why_it_works && !isDefaultMetaText(sec.why_it_works)) {
          lines.push(sec.why_it_works.replace(/\*\*(.*?)\*\*/g, '**$1**').trim() + '\n');
        }
        if (sec.experience_or_data_point && !isDefaultMetaText(sec.experience_or_data_point, blueprintSec.heading)) {
          lines.push(`> **Expert Insight:** ${sec.experience_or_data_point}\n`);
        }
        if (sec.example_brands?.length) lines.push(`**Examples:** ${sec.example_brands.join(', ')}\n`);
        if (sec.outbound_authority_link?.resolved_url) {
          lines.push(`📎 [${sec.outbound_authority_link.resolved_title || 'Source'}](${sec.outbound_authority_link.resolved_url})\n`);
        }
        if (sec.rich_media_query?.youtube_video_id) {
          const vid = sec.rich_media_query;
          lines.push(`🎬 **YouTube Reference:** [${vid.suggested_search_query || 'Watch Video'}](https://www.youtube.com/watch?v=${vid.youtube_video_id})\n`);
        } else if (sec.rich_media_query?.suggested_search_query) {
          const query = sec.rich_media_query.suggested_search_query;
          lines.push(`🎬 **YouTube Search:** [${query}](https://www.youtube.com/results?search_query=${encodeURIComponent(query)})\n`);
        }
        return lines.join('\n');
      }).join('\n\n');
      
      const textContext = `# ${blueprint?.title || ''}\n\n` + rawMarkdown;
      
      const res = await fetch('/api/standalone-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: textContext,
          referenceContext: engine.referenceData?.rawText || '',
          refRawText: engine.referenceData?.rawText || '',
          refRawHtml: (engine.referenceData as any)?.rawHtml || '',
          serpContext: {},
          masterKeywords: engine.keywordBank?.terms.map(t => t.term) || engine.serpTerms.map(t => t.term),
          nlpExtraction: engine.referenceData?.nlpExtraction || null
        }),
      });
      
      const data = await res.json();
      if (res.ok) {
        engine.setAnalysisResults(data);
        if (data.weakCopyItems) {
           engine.setWeakCopyFlags(data.weakCopyItems.map((w: any) => ({
              originalPhrase: w.phrase,
              suggestedRewrite: w.improvement,
              category: 'weak copy',
              reasoning: ''
           })));
        }

        // Compute Score
        try {
          const headings = finalSections.map((s: any) => s.heading);
          const liveTerms = (engine.serpTerms || []).map(t => ({ ...t, currentCount: 0, overuseRisk: false }));
          const entities: any[] = [];
          
          const score = computeStructuredScore({
            textContext,
            title: blueprint?.title || '',
            headings,
            liveTerms,
            entities,
            topTermsForIntent: [], // Simplified for engine for now
            medianWordCount: engine.referenceData?.advancedMetrics?.wordCount || 1500,
            medianTitleLength: 60,
            medianH2Count: engine.referenceData?.seo?.headerHierarchy?.filter((h: any) => h.tag === 'h2').length || 8,
            contentGapReport: (engine.referenceData as any)?.contentGapReport,
            headingFrequency: engine.serpAnalysis?.headingFrequency || (engine.referenceData as any)?.headingFrequency,
            topicClusters: engine.serpAnalysis?.topicClusters || (engine.referenceData as any)?.topicClusters,
            paaQuestions: engine.serpAnalysis?.paaQuestions || (engine.referenceData as any)?.paaQuestions,
            medianLexicalDiversity: engine.serpAnalysis?.medianLexicalDiversity || (engine.referenceData as any)?.medianLexicalDiversity || (engine.referenceData as any)?.advancedMetrics?.medianLexicalDiversity || 0.35,
            featuredSnippetBlueprint: engine.serpAnalysis?.featuredSnippetBlueprint || (engine.referenceData as any)?.featuredSnippetBlueprint || blueprint?.featuredSnippetBlueprint,
          });
          engine.setContentScore(score);
        } catch (scoreErr) {
          console.error('[compute-score]', scoreErr);
        }
      }
    } catch (e) {
      console.error('[standalone-analysis]', e);
    } finally {
      engine.setIsDetectingWeakCopy(false);
      if (engine.genStatus !== 'Cancelled') {
        engine.setGenStatus('Generation complete');
      }
    }
  };

  const startPipeline = async (force = false) => {
    if (!engine.title) return;

    engine.setIsRunning(true);
    engine.setIsGenerated(false);
    engine.setGenStatus('Initializing pipeline…');
    engine.setGenProgress(5);
    engine.setBlueprint(null);
    engine.setSections([]);
    engine.setTiptapContent('');
    engine.setGenError(null);

    const runId = 'run_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    const runStartTime = Date.now();
    let hasFiredGenStarted = false;
    let hasFiredGenCompleted = false;
    let hasFiredGenFailed = false;

    const recordFailure = (errorObj: any, stage?: string) => {
      if (hasFiredGenFailed) return;
      hasFiredGenFailed = true;
      const rawMsg = errorObj?.reason || errorObj?.message || String(errorObj);
      captureEvent('generation_failed', {
        run_id: runId,
        failing_stage: stage || 'pipeline',
        error_code: errorObj?.name || errorObj?.code || 'GENERATION_ERROR',
        error_message: sanitizeErrorMessage(rawMsg),
      });
    };

    // Auto-Restore logic
    if (!force && engine.targetKeywords && engine.referenceUrl) {
      try {
        const existing = await getArticleByGenerationInputs(engine.targetKeywords, engine.referenceUrl);
        if (existing) {
          engine.setCurrentArticleId(existing.id || null);
          engine.setTiptapContent(existing.content);
          if (existing.blueprint) {
            engine.setBlueprint(existing.blueprint);
            if (existing.blueprint.sections) {
              engine.setSections(existing.blueprint.sections);
            }
          }
          if (existing.serpAnalysis?.terms) {
            engine.setSerpTerms(existing.serpAnalysis.terms);
          }
          if (existing.contentScore) {
            engine.setContentScore(existing.contentScore);
          }
          if (existing.analysisResults) {
            engine.setAnalysisResults(existing.analysisResults);
          }
          engine.setIsGenerated(true);
          engine.setIsRunning(false);
          engine.setGenStatus('Restored from draft');
          return;
        }
      } catch (err) {
        console.warn('Auto-restore check failed:', err);
      }
    }

    const controller = new AbortController();
    engine.setAbortController(controller);

    try {
      const res = await fetch('/api/generate-blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: engine.title,
          targetKeywords: engine.targetKeywords,
          referenceData: engine.referenceData,
          campaignMode: engine.campaignMode,
          guestPostBacklinkUrl: engine.campaignMode === 'guest_post' ? engine.guestPostBacklinkUrl : undefined,
          guestPostTargetPublication: engine.campaignMode === 'guest_post' ? engine.guestPostTargetPublication : undefined,
          keywordBank: engine.keywordBank,
          ctaIntent: engine.ctaIntent,
          serpTerms: engine.serpTerms,
          serpEntities: engine.serpAnalysis?.entities || [],
          serpMedianWordCount: engine.serpAnalysis?.medianWordCount || engine.referenceData?.advancedMetrics?.wordCount || 2000,
          serpMedianTitleLength: engine.serpAnalysis?.medianTitleLength || 60,
          serpMedianH2Count: engine.serpAnalysis?.medianH2Count || 5,
          planRole: engine.planRole,
          detectedFormat: engine.serpAnalysis?.intentBlueprint?.formatRecommendation,
          serpAnalysis: engine.serpAnalysis,
        }),
        signal: controller.signal,
      });

      if (!res.body) throw new Error('No readable stream.');
      if (!res.ok) throw new Error(`Server error ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let buffer = '';

      const handleManualChunkParsed = (parsed: any) => {
        if (parsed.type === 'status') {
          engine.setGenStatus(parsed.message);
          if (parsed.progress) engine.setGenProgress(parsed.progress);
        } else if (parsed.type === 'outline') {
          engine.setBlueprint(parsed.data);
          if (!hasFiredGenStarted) {
            hasFiredGenStarted = true;
            captureEvent('content_generation_started', {
              run_id: runId,
              content_type: parsed.data?.contentType || 'Guide',
            });
          }
        } else if (parsed.type === 'section') {
          engine.setSections((prev: any) => {
            const next = [...prev];
            next[parsed.index] = parsed.data;
            return next;
          });
        } else if (parsed.type === 'complete') {
          engine.setBlueprint((prev: any) => ({ ...prev, ...parsed.data }));
          if (parsed.data.sections) {
            engine.setSections(parsed.data.sections);
          }
          engine.setGenProgress(100);
          engine.setGenStatus('Generation complete');
          engine.setIsGenerated(true);
          // Switch QA panel to Score tab
          engine.setActiveQaTab('score');

          if (!hasFiredGenCompleted) {
            hasFiredGenCompleted = true;
            const sections = parsed.data?.sections || [];
            const textContent = sections.map((s: any) => 
              `${s.heading || ''}\n${s.what_it_is || ''}\n${s.why_it_works || ''}\n${s.experience_or_data_point || ''}`
            ).join('\n\n');
            const wordCount = textContent.trim().split(/\s+/).filter(Boolean).length;
            let flesch = 0;
            try {
              flesch = calculateFleschReadingEase(textContent);
            } catch {}

            captureEvent('content_generation_completed', {
              run_id: runId,
              word_count: wordCount,
              section_count: sections.length,
              flesch_reading_ease: flesch,
              total_duration_ms: Date.now() - runStartTime,
            });
          }

          if (parsed.data.sections) {
            runPostGenerationAnalysis(parsed.data.sections, parsed.data);
          }
        } else if (parsed.type === 'error') {
          recordFailure(parsed);
          throw new Error(parsed.reason || parsed.message || 'Generation failed.');
        }
      };

      while (!done) {
        const { value, done: rd } = await reader.read();
        done = rd;
        if (value) {
          buffer += decoder.decode(value, { stream: !done });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';
          
          for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed) continue;
            if (trimmed.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(trimmed.substring(6));
                handleManualChunkParsed(parsed);
              } catch (e: any) {
                if (e.message && (e.message.includes('Generation failed') || e.message === 'Generation failed.')) {
                  throw e;
                }
                console.warn('[useGenerationPipeline] Parse error for chunk:', e);
              }
            }
          }
        }
      }

      // Parse any remaining leftovers in the buffer
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(trimmed.substring(6));
            handleManualChunkParsed(parsed);
          } catch (e: any) {
            if (e.message && (e.message.includes('Generation failed') || e.message === 'Generation failed.')) {
              throw e;
            }
            console.warn('[useGenerationPipeline] Parse error for leftover buffer:', e);
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        recordFailure(err);
        engine.setGenError(err.message || 'Generation failed.');
        engine.setGenStatus('Failed');
      }
    } finally {
      engine.setIsRunning(false);
    }
  };

  const startAutopilotPipeline = async (url: string) => {
    engine.setIsRunning(true);
    engine.setGenStatus('Analyzing website URL and verifying safety...');
    engine.setGenProgress(5);
    engine.setBlueprint(null);
    engine.setSections([]);
    engine.setTiptapContent('');
    engine.setGenError(null);

    const runId = 'run_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    const runStartTime = Date.now();
    const analysisStartTime = Date.now();
    let currentStage = 'website_analysis';
    let hasFiredAnalysisCompleted = false;
    let hasFiredGenStarted = false;
    let hasFiredGenCompleted = false;
    let hasFiredGenFailed = false;

    // 1. Fire website_analysis_started
    captureEvent('website_analysis_started', { run_id: runId });

    const recordFailure = (errorObj: any, stage?: string) => {
      if (hasFiredGenFailed) return;
      hasFiredGenFailed = true;
      const rawMsg = errorObj?.reason || errorObj?.message || String(errorObj);
      captureEvent('generation_failed', {
        run_id: runId,
        failing_stage: stage || currentStage || 'pipeline',
        error_code: errorObj?.name || errorObj?.code || 'GENERATION_ERROR',
        error_message: sanitizeErrorMessage(rawMsg),
      });
    };

    const controller = new AbortController();
    engine.setAbortController(controller);

    try {
      const res = await fetch('/api/generate-from-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });

      if (!res.body) throw new Error('No readable stream.');
      if (!res.ok) throw new Error(`Server error ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let buffer = '';

      const handleChunkParsed = (parsed: any) => {
        if (parsed.type === 'status') {
          engine.setGenStatus(parsed.message);
          if (parsed.progress) engine.setGenProgress(parsed.progress);

          // 2. Detect opportunity selection to fire website_analysis_completed
          if (!hasFiredAnalysisCompleted && parsed.message?.includes('Selected best content opportunity keyword:')) {
            hasFiredAnalysisCompleted = true;
            currentStage = 'content_generation';
            const kwMatch = parsed.message.match(/Selected best content opportunity keyword:\s*"([^"]+)"/i);
            const scoreMatch = parsed.message.match(/\(Score:\s*([\d.]+)\)/i);
            const selectedKeyword = kwMatch ? kwMatch[1] : '';
            const oppScore = scoreMatch ? parseFloat(scoreMatch[1]) : 0;
            const analysisDuration = Date.now() - analysisStartTime;
            const tier = oppScore >= 70 ? 'High' : oppScore >= 40 ? 'Medium' : 'Low';

            captureEvent('website_analysis_completed', {
              run_id: runId,
              selected_keyword: selectedKeyword,
              opportunity_score: oppScore,
              relevance_tier: tier,
              candidates_count: 5,
              analysis_duration_ms: analysisDuration,
            });
          }

          // 3. Detect content generation start if status indicates adapter run
          if (!hasFiredGenStarted && parsed.message?.includes('Initializing pipeline')) {
            hasFiredGenStarted = true;
            currentStage = 'content_generation';
            captureEvent('content_generation_started', {
              run_id: runId,
              content_type: 'Guide',
            });
          }
        } else if (parsed.type === 'outline') {
          currentStage = 'outline';
          engine.setBlueprint(parsed.data);

          if (!hasFiredGenStarted) {
            hasFiredGenStarted = true;
            captureEvent('content_generation_started', {
              run_id: runId,
              content_type: parsed.data?.contentType || 'Guide',
            });
          }
        } else if (parsed.type === 'section') {
          currentStage = 'sections';
          engine.setSections((prev: any) => {
            const next = [...prev];
            next[parsed.index] = parsed.data;
            return next;
          });
        } else if (parsed.type === 'complete') {
          currentStage = 'complete';
          engine.setBlueprint((prev: any) => ({ ...prev, ...parsed.data }));
          if (parsed.data.sections) {
            engine.setSections(parsed.data.sections);
          }
          engine.setGenProgress(100);
          engine.setGenStatus('Generation complete');
          engine.setIsGenerated(true);
          engine.setActiveQaTab('score');

          // 4. Fire content_generation_completed
          if (!hasFiredGenCompleted) {
            hasFiredGenCompleted = true;
            const sections = parsed.data?.sections || [];
            const textContent = sections.map((s: any) => 
              `${s.heading || ''}\n${s.what_it_is || ''}\n${s.why_it_works || ''}\n${s.experience_or_data_point || ''}`
            ).join('\n\n');
            const wordCount = textContent.trim().split(/\s+/).filter(Boolean).length;
            let flesch = 0;
            try {
              flesch = calculateFleschReadingEase(textContent);
            } catch {}

            captureEvent('content_generation_completed', {
              run_id: runId,
              word_count: wordCount,
              section_count: sections.length,
              flesch_reading_ease: flesch,
              total_duration_ms: Date.now() - runStartTime,
            });
          }

          if (parsed.data.sections) {
            runPostGenerationAnalysis(parsed.data.sections, parsed.data);
          }
        } else if (parsed.type === 'error') {
          recordFailure(parsed, currentStage);
          throw new Error(parsed.reason || parsed.message || 'Generation failed.');
        }
      };

      while (!done) {
        const { value, done: rd } = await reader.read();
        done = rd;
        if (value) {
          buffer += decoder.decode(value, { stream: !done });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';
          
          for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed) continue;
            if (trimmed.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(trimmed.substring(6));
                handleChunkParsed(parsed);
              } catch (e: any) {
                if (e.message && (e.message.includes('Generation failed') || e.message === 'Generation failed.')) {
                  throw e;
                }
                console.warn('[useGenerationPipeline] Parse error for chunk:', e);
              }
            }
          }
        }
      }

      // Check any leftover buffer
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(trimmed.substring(6));
            handleChunkParsed(parsed);
          } catch (e: any) {
            if (e.message && (e.message.includes('Generation failed') || e.message === 'Generation failed.')) {
              throw e;
            }
            console.warn('[useGenerationPipeline] Parse error for leftover chunk:', e);
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        engine.setGenStatus('Cancelled');
      } else {
        recordFailure(err, currentStage);
        engine.setGenError(err.message || 'Generation failed.');
        engine.setGenStatus('Failed');
      }
    } finally {
      engine.setIsRunning(false);
    }
  };

  const cancelPipeline = () => {
    engine.abortGeneration();
    engine.setIsRunning(false);
    engine.setGenStatus('Cancelled');
  };

  // Removed abort on unmount so the global pipeline can continue running 
  // even when the StepFinalConfig component is unmounted.

  return {
    startPipeline,
    startAutopilotPipeline,
    cancelPipeline,
  };
}
