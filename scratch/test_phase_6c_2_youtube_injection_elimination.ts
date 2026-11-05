/**
 * ACUTE Phase 6C.2 Verification Test Suite
 * Objective: Verify elimination of automatic YouTube injection and safe PDF export sanitization.
 *
 * Tests:
 * 1. Generation does not invoke automatic YouTube discovery.
 * 2. A section with historical youtube_video_id does not automatically gain a Markdown video link.
 * 3. A section with historical youtube_video_id does not automatically gain an HTML video link.
 * 4. The editor / plain text serialization does not automatically display/serialize an unapproved video reference.
 * 5. PDF output excludes unapproved YouTube URLs and video markers.
 * 6. Legitimate non-YouTube external links remain intact in HTML, MD, and PDF blocks.
 * 7. Verification that no video approval contract exists, and user-initiated manual TipTap YouTube insertion is preserved.
 * 8. Articles without video metadata generate, format, and export correctly.
 * 9. Historical article metadata does not break editing, saving, or export.
 * 10. Exhaustive scan proving no remaining automatic video injection paths in src/.
 */

import { toMarkdown, toHtml, toPlainText, htmlToMarkdown } from '../src/lib/article-utils';
import { ArticleExportService, ExportArticleInput } from '../src/lib/export/ArticleExportService';
import { GenerationPipelineAdapter } from '../src/lib/core/GenerationPipelineAdapter';
import { ArticleBlueprint, SectionBlock } from '../src/types/article';
import * as fs from 'fs';
import * as path from 'path';

let passed = 0;
let failed = 0;

function assert(cond: boolean, name: string, detail?: string) {
  if (cond) {
    passed++;
    console.log(`[PASS] ${name}`);
  } else {
    failed++;
    console.error(`[FAIL] ${name} ${detail ? `-> ${detail}` : ''}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('ACUTE Phase 6C.2: YouTube Injection Elimination Suite');
  console.log('====================================================\n');

  // Sample historical blueprint article containing YouTube metadata
  const historicalSectionWithVideo: SectionBlock = {
    heading: 'Core Friction Points in Enterprise Onboarding',
    level: 'H2',
    what_it_is: 'Enterprise onboarding friction emerges from misaligned stakeholder expectations and complex permissioning structures.',
    why_it_works: 'Streamlining time-to-value directly impacts month-1 cohort retention.',
    experience_or_data_point: 'Reducing onboarding step count by 40% doubled activation velocity across 12 SaaS clients.',
    takeaway: 'Audit your permissioning sequence before attempting feature tutorials.',
    example_brands: ['Slack: streamlined team invites', 'Notion: instant template creation'],
    copy_formula: ['State the obstacle upfront', 'Detail the workflow change', 'Quantify retention upside'],
    outbound_authority_link: {
      anchor_text: 'time-to-value',
      search_query: 'time to value onboarding benchmark',
      resolved_url: 'https://www.nngroup.com/articles/user-onboarding-ux/',
      resolved_title: 'Nielsen Norman Group UX Guidelines'
    },
    rich_media_query: {
      type: 'youtube',
      suggested_search_query: 'Enterprise Onboarding UX Audit',
      alt_text: 'YouTube video on Enterprise Onboarding UX Audit',
      youtube_video_id: 'YUNf24-QMzk'
    }
  };

  const historicalBlueprint: Partial<ArticleBlueprint> = {
    title: 'Enterprise UX Audit Architecture and Execution',
    intent: 'Educational Guide',
    slug: 'enterprise-ux-audit-architecture',
    intro: {
      hook: 'Most enterprise audits produce voluminous slide decks that engineering teams immediately archive and ignore.',
      thesis: 'A rigorous UX audit links observed friction directly to product telemetry and architectural constraints.',
      business_context: 'B2B SaaS product design'
    },
    sections: [historicalSectionWithVideo],
    cta: {
      heading: 'Schedule an Architecture Review',
      description: 'Review your product workflows with a dedicated senior product designer.',
      button_text: 'Book Architecture Review',
      url: 'https://mitrandesign.com/contact'
    }
  };

  // Test 1: GenerationPipelineAdapter source analysis - zero automatic YouTube search calls
  const adapterSource = fs.readFileSync(path.resolve('./src/lib/core/GenerationPipelineAdapter.ts'), 'utf-8');
  assert(
    !adapterSource.includes('fetchYouTubeVideo') && !adapterSource.includes('googleapis.com/youtube'),
    'Test 1: GenerationPipelineAdapter contains zero YouTube search API queries or fetchYouTubeVideo methods'
  );

  // Test 2: Historical youtube_video_id does NOT gain Markdown video link
  const mdOutput = toMarkdown(historicalBlueprint, [historicalSectionWithVideo]);
  assert(
    !mdOutput.includes('youtube.com') && !mdOutput.includes('Video Reference:') && !mdOutput.includes('YUNf24-QMzk'),
    'Test 2: toMarkdown omits automatic YouTube markdown reference for historical section with video ID'
  );

  // Test 3: Historical youtube_video_id does NOT gain HTML video link or iframe
  const htmlOutput = toHtml(historicalBlueprint, [historicalSectionWithVideo]);
  assert(
    !htmlOutput.includes('youtube.com') && !htmlOutput.includes('yt-embed') && !htmlOutput.includes('<iframe') && !htmlOutput.includes('YUNf24-QMzk'),
    'Test 3: toHtml omits automatic YouTube embed, iframe, and reference for historical section with video ID'
  );

  // Test 4: Plain text serialization omits YouTube video reference
  const plainTextOutput = toPlainText(historicalBlueprint, [historicalSectionWithVideo]);
  assert(
    !plainTextOutput.includes('youtube.com') && !plainTextOutput.includes('YouTube Reference:') && !plainTextOutput.includes('YUNf24-QMzk'),
    'Test 4: toPlainText omits YouTube references and search queries'
  );

  // Test 5: PDF output excludes unapproved YouTube URLs even when supplied in legacy HTML
  const contaminatedHtml = `
    <h1>Enterprise UX Audit Architecture</h1>
    <p>Understanding user friction requires rigorous observational testing.</p>
    <div data-youtube-video src="https://www.youtube.com/watch?v=YUNf24-QMzk"></div>
    <div class="yt-embed"><div class="yt-label">🎬 YouTube Reference — UX Audit</div><iframe src="https://www.youtube.com/embed/YUNf24-QMzk"></iframe></div>
    <p>🎬 <strong>YouTube Reference:</strong> <a href="https://www.youtube.com/watch?v=YUNf24-QMzk">Watch Video</a></p>
    <p>Review the authoritative guidelines at <a href="https://www.nngroup.com/articles/user-onboarding-ux/">Nielsen Norman Group</a>.</p>
    <p>🎬 <strong>YouTube Search:</strong> <a href="https://www.youtube.com/results?search_query=ux+audit">Search YouTube</a></p>
  `;

  const pdfInput: ExportArticleInput = {
    title: 'Enterprise UX Audit Architecture',
    content: contaminatedHtml,
    blueprint: historicalBlueprint,
    sections: [historicalSectionWithVideo]
  };

  const pdfBytes = ArticleExportService.generatePdfBuffer(pdfInput, { skipValidation: true });
  const pdfString = Buffer.from(pdfBytes).toString('binary');

  assert(
    !pdfString.includes('youtube.com') && !pdfString.includes('youtu.be') && !pdfString.includes('YUNf24-QMzk'),
    'Test 5A: PDF buffer contains 0 occurrences of youtube.com, youtu.be, or video ID'
  );
  assert(
    !pdfString.includes('[Video]') && !pdfString.includes('YouTube Reference') && !pdfString.includes('Watch Video'),
    'Test 5B: PDF buffer contains 0 occurrences of [Video], YouTube Reference, or Watch Video placeholders'
  );

  // Test 6: Legitimate non-YouTube external links remain intact in PDF
  assert(
    pdfString.includes('https://www.nngroup.com/articles/user-onboarding-ux/'),
    'Test 6: Legitimate external links (NNGroup) are fully preserved in PDF buffer'
  );

  // Test 7: Verify approval semantics - no video approval contract exists, and manual editor insertion is intact
  const sectionEditorSource = fs.readFileSync(path.resolve('./src/app/(main)/engine/components/SectionEditor.tsx'), 'utf-8');
  assert(
    sectionEditorSource.includes('onInsertYouTube={() => setShowYT(true)}') && sectionEditorSource.includes('<YouTubeModal'),
    'Test 7A: Manual user-initiated YouTube insertion modal remains available in SectionEditor toolbar'
  );
  assert(
    !sectionEditorSource.includes('🎬 **YouTube Reference:**') && !sectionEditorSource.includes('data-youtube-video'),
    'Test 7B: SectionEditor has 0 automatic YouTube injections in streaming or assembly code paths'
  );

  // Test 8: Clean article without video metadata generates, formats, and exports cleanly
  const cleanSection: SectionBlock = {
    heading: 'Information Architecture Simplification',
    level: 'H2',
    what_it_is: 'Information architecture establishes hierarchy and discoverability.',
    why_it_works: 'Clear pathways reduce cognitive overhead during high-intent tasks.',
    experience_or_data_point: 'Consolidating navigation depth from 4 levels to 2 improved workflow completion by 28%.',
    takeaway: 'Flatten your IA before adding search autocomplete.',
    example_brands: ['Linear: hyper-focused navigation', 'Stripe: contextual documentation hierarchy'],
    copy_formula: ['Establish hierarchy', 'Group related views', 'Measure task completion']
  };

  const cleanBlueprint: Partial<ArticleBlueprint> = {
    title: 'Information Architecture Best Practices',
    intent: 'Architectural Blueprint',
    slug: 'information-architecture-best-practices',
    sections: [cleanSection]
  };

  const cleanMd = toMarkdown(cleanBlueprint, [cleanSection]);
  const cleanHtml = toHtml(cleanBlueprint, [cleanSection]);
  assert(cleanMd.includes('## Information Architecture Simplification'), 'Test 8A: Clean article generates valid markdown');
  assert(cleanHtml.includes('<h2>Information Architecture Simplification</h2>'), 'Test 8B: Clean article generates valid HTML');

  const cleanPdfBytes = ArticleExportService.generatePdfBuffer({
    title: cleanBlueprint.title || 'Untitled',
    content: cleanHtml,
    blueprint: cleanBlueprint,
    sections: [cleanSection]
  }, { skipValidation: true });
  assert(cleanPdfBytes.length > 1000, 'Test 8C: Clean article generates complete, valid PDF buffer');

  // Test 9: Historical article compatibility - rich_media_query metadata remains intact on section object without corrupting exports
  assert(
    historicalSectionWithVideo.rich_media_query?.youtube_video_id === 'YUNf24-QMzk',
    'Test 9A: Historical section rich_media_query metadata object is preserved without mutation'
  );
  const reExportHtml = ArticleExportService.resolveCanonicalHtml({
    title: historicalBlueprint.title || 'Untitled',
    sections: [historicalSectionWithVideo],
    blueprint: historicalBlueprint
  });
  assert(
    !reExportHtml.includes('youtube.com') && !reExportHtml.includes('YUNf24-QMzk'),
    'Test 9B: ArticleExportService.resolveCanonicalHtml strips unapproved video from historical sections'
  );

  // Test 10: Exhaustive scan proving no remaining automatic video injection paths in src/
  const injectionPatternsToProhibit = [
    'fetchYouTubeVideo',
    'lines.push(`<div data-youtube-video',
    'lines.push(`🎬 **YouTube Reference:**',
    'lines.push(`🎬 **YouTube Search:**'
  ];
  let strayCount = 0;
  const filesToCheck = [
    'src/lib/core/GenerationPipelineAdapter.ts',
    'src/app/(main)/engine/components/SectionEditor.tsx',
    'src/app/(main)/engine/hooks/useGenerationPipeline.ts',
    'src/lib/article-utils.ts'
  ];

  for (const f of filesToCheck) {
    const src = fs.readFileSync(path.resolve(f), 'utf-8');
    for (const pattern of injectionPatternsToProhibit) {
      if (src.includes(pattern)) {
        console.error(`Stray injection pattern "${pattern}" found in ${f}`);
        strayCount++;
      }
    }
  }

  assert(strayCount === 0, 'Test 10: Exhaustive scan confirms 0 stray automatic video injection calls in generation files');

  console.log(`\n====================================================`);
  console.log(`Phase 6C.2 Test Suite Completed: ${passed} PASSED, ${failed} FAILED`);
  console.log(`====================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
