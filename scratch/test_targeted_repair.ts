import { ContentRepairService, TargetedRepairRequest } from '../src/lib/content/ContentRepairService';
import { LLMProvider } from '../src/core/contracts/providers';
import { validateArticleQuality, calculateFleschReadingEase } from '../src/lib/seo-intelligence/quality_validator';
import { computeStructuredScore } from '../src/lib/content-scoring';

async function runTargetedRepairTests() {
  console.log('========================================================');
  console.log('🧪 ACUTE TARGETED REPAIR TEST SUITE');
  console.log('========================================================\n');

  let passedTests = 0;
  const totalTests = 5;

  // -------------------------------------------------------------------------
  // TEST 1: Readability Repair
  // -------------------------------------------------------------------------
  console.log('--- TEST 1: Readability Repair (Validation Findings -> Repair -> Metric Improvement) ---');
  
  // Unrepaired passage: dense sentences, passive voice, long paragraphs, low Flesch Reading Ease
  const poorlyReadableDraft = `## Understanding RSS Technology in the Modern Enterprise

It has been established by numerous industry analysts and enterprise information architects that the consolidation of disparate digital communication feeds is frequently impeded by an overwhelming proliferation of disparate technological silos. In consequence thereof, the systematic aggregation of continuous data streams must be accomplished by the deployment of robust content syndication architectures, which have been designed to facilitate expeditious information triage across organizational boundaries. Furthermore, it should be noted that the overarching complexity inherent in multi-channel notification ingestion is exacerbated when legacy software solutions are utilized by internal knowledge workers without sufficient structural governance.

## The Advantage of Modern Feed Readers

When an enterprise feed reader is evaluated by technology procurement committees, rigorous benchmarking must be conducted regarding the latency of synchronous API polling and the algorithmic categorization of inbound document payloads. In addition to the aforementioned considerations, comprehensive audit logging and centralized credential management are required to be implemented in accordance with stringent enterprise compliance directives.`;

  const beforeValidation = validateArticleQuality(poorlyReadableDraft, ['RSS feed reader'], ['RSS', 'API']);
  console.log(`Before Repair Flesch Reading Ease: ${beforeValidation.metrics.fleschReadingEase}`);
  console.log(`Before Repair Avg Sentence Length: ${beforeValidation.metrics.averageSentenceLength.toFixed(1)} words`);
  console.log(`Before Repair Passive Voice: ${beforeValidation.metrics.passiveVoicePercent.toFixed(1)}%`);
  console.log(`Before Repair Validation Valid: ${beforeValidation.valid}`);
  console.log(`Before Repair Errors: ${JSON.stringify(beforeValidation.errors)}`);

  // Mock LLM provider that follows the targeted readability instructions:
  // splits long sentences, converts passive to active, simplifies vocabulary, keeps headings intact.
  const mockReadabilityLLM: LLMProvider = {
    generate: async (prompt: string) => {
      return `## Understanding RSS Technology in the Modern Enterprise

Teams need simple ways to track the news. Too many tools slow people down and clutter their day. RSS tools solve this problem. They gather all your feeds into one simple inbox. Now your team can read key updates fast and make smart choices.

## The Advantage of Modern Feed Readers

A good feed reader is fast, clear, and easy to use. It checks your feeds every minute and sends alerts right away. It also keeps your data safe with simple team controls.`;
    },
    structuredGenerate: async () => ({} as any)
  };

  const repairService = new ContentRepairService(mockReadabilityLLM);
  const repairResult = await repairService.repairTargetedDimension({
    title: 'Modern RSS Guide',
    bodyMarkdown: poorlyReadableDraft,
    targetDimension: 'readability',
    currentScore: 64,
    targetThreshold: 75,
    findings: beforeValidation.errors,
    primaryKeyword: 'RSS feed reader',
    headings: [
      'Understanding RSS Technology in the Modern Enterprise',
      'The Advantage of Modern Feed Readers'
    ]
  });

  const afterValidation = validateArticleQuality(repairResult.repairedBodyMarkdown, ['RSS feed reader'], ['RSS', 'API']);
  console.log(`\nAfter Repair Flesch Reading Ease: ${afterValidation.metrics.fleschReadingEase}`);
  console.log(`After Repair Avg Sentence Length: ${afterValidation.metrics.averageSentenceLength.toFixed(1)} words`);
  console.log(`After Repair Passive Voice: ${afterValidation.metrics.passiveVoicePercent.toFixed(1)}%`);
  console.log(`After Repair Validation Valid: ${afterValidation.valid}`);

  const fleschImproved = afterValidation.metrics.fleschReadingEase > beforeValidation.metrics.fleschReadingEase;
  const sentenceLengthReduced = afterValidation.metrics.averageSentenceLength < beforeValidation.metrics.averageSentenceLength;
  const passiveVoiceReduced = afterValidation.metrics.passiveVoicePercent < beforeValidation.metrics.passiveVoicePercent;

  if (fleschImproved && sentenceLengthReduced && passiveVoiceReduced && afterValidation.metrics.fleschReadingEase >= 60) {
    console.log('✅ TEST 1 PASSED: Readability significantly improved across Flesch score, sentence length, and passive voice.');
    passedTests++;
  } else {
    console.error('❌ TEST 1 FAILED:', { fleschImproved, sentenceLengthReduced, passiveVoiceReduced });
  }

  // -------------------------------------------------------------------------
  // TEST 2: Strict Preservation
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 2: Strict Preservation (Headings, Keywords, Tables, Links, Facts) ---');
  
  const complexDraft = `## Key Capabilities of an RSS Feed Reader

An **RSS feed reader** helps users curate high-signal content from blogs, newsletters, and podcasts.

### Feature Comparison

| Feature | Inoreader Pro | Basic Reader |
| :--- | :--- | :--- |
| Polling Frequency | 60 seconds | 60 minutes |
| Max Feeds | Unlimited | 150 feeds |
| Price | $8.99/mo | Free |

> Pro tip: Automated rules save up to 4 hours each week by sorting newsletters directly into dedicated folders.

For more information, check out the official documentation at [Inoreader Guide](https://inoreader.com/guide).`;

  const mockPreservingLLM: LLMProvider = {
    generate: async (prompt: string) => {
      // Return repaired text where body text is simplified but tables, headings, links, quotes, and facts are 100% preserved
      return `## Key Capabilities of an RSS Feed Reader

An **RSS feed reader** helps you curate high-signal content from blogs, newsletters, and podcasts.

### Feature Comparison

| Feature | Inoreader Pro | Basic Reader |
| :--- | :--- | :--- |
| Polling Frequency | 60 seconds | 60 minutes |
| Max Feeds | Unlimited | 150 feeds |
| Price | $8.99/mo | Free |

> Pro tip: Automated rules save up to 4 hours each week by sorting newsletters directly into dedicated folders.

For more information, check out the official documentation at [Inoreader Guide](https://inoreader.com/guide).`;
    },
    structuredGenerate: async () => ({} as any)
  };

  const preservingService = new ContentRepairService(mockPreservingLLM);
  const preservedResult = await preservingService.repairTargetedDimension({
    title: 'RSS Feed Reader Capabilities',
    bodyMarkdown: complexDraft,
    targetDimension: 'readability',
    currentScore: 68,
    targetThreshold: 75,
    findings: ['Average sentence length can be shortened.'],
    primaryKeyword: 'RSS feed reader',
    headings: ['Key Capabilities of an RSS Feed Reader', 'Feature Comparison']
  });

  const repairedText = preservedResult.repairedBodyMarkdown;
  const headingsPreserved = repairedText.includes('## Key Capabilities of an RSS Feed Reader') && 
                            repairedText.includes('### Feature Comparison');
  const keywordPreserved = repairedText.toLowerCase().includes('rss feed reader');
  const tablePreserved = repairedText.includes('| Feature | Inoreader Pro | Basic Reader |') && repairedText.includes('$8.99/mo');
  const quotePreserved = repairedText.includes('> Pro tip: Automated rules save up to 4 hours');
  const linkPreserved = repairedText.includes('[Inoreader Guide](https://inoreader.com/guide)');

  console.log(`Headings preserved: ${headingsPreserved}`);
  console.log(`Keyword preserved: ${keywordPreserved}`);
  console.log(`Table preserved: ${tablePreserved}`);
  console.log(`Quote preserved: ${quotePreserved}`);
  console.log(`Link preserved: ${linkPreserved}`);

  if (headingsPreserved && keywordPreserved && tablePreserved && quotePreserved && linkPreserved) {
    console.log('✅ TEST 2 PASSED: All headings, keywords, tables, quotes, links, and data points strictly preserved.');
    passedTests++;
  } else {
    console.error('❌ TEST 2 FAILED');
  }

  // -------------------------------------------------------------------------
  // TEST 3: No-Op / Already Good Content
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 3: No-Op for Already High-Quality Content ---');
  
  let llmCallCount = 0;
  const noOpLLM: LLMProvider = {
    generate: async () => {
      llmCallCount++;
      return 'Should not be called';
    },
    structuredGenerate: async () => ({} as any)
  };

  const noOpService = new ContentRepairService(noOpLLM);
  const alreadyGoodContent = `## Getting Started

RSS helps you track news fast. You can subscribe to any blog or podcast.`;

  const noOpResult = await noOpService.repairTargetedDimension({
    title: 'Getting Started',
    bodyMarkdown: alreadyGoodContent,
    targetDimension: 'readability',
    currentScore: 88,
    targetThreshold: 75,
    findings: [], // No findings!
  });

  console.log(`isNoOp returned: ${noOpResult.isNoOp}`);
  console.log(`LLM call count: ${llmCallCount}`);
  console.log(`Content identical: ${noOpResult.repairedBodyMarkdown === alreadyGoodContent}`);

  if (noOpResult.isNoOp === true && llmCallCount === 0 && noOpResult.repairedBodyMarkdown === alreadyGoodContent) {
    console.log('✅ TEST 3 PASSED: High quality content returned untouched with zero unnecessary LLM invocations.');
    passedTests++;
  } else {
    console.error('❌ TEST 3 FAILED');
  }

  // -------------------------------------------------------------------------
  // TEST 4: Repair Failure Handling (Graceful Degradation)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 4: Repair Failure Handling (Graceful Degradation & Original Preservation) ---');

  const failingLLM: LLMProvider = {
    generate: async () => {
      throw new Error('LLM rate limit / timeout error during targeted repair');
    },
    structuredGenerate: async () => ({} as any)
  };

  const failingService = new ContentRepairService(failingLLM);
  let failedSafely = false;

  try {
    await failingService.repairTargetedDimension({
      title: 'Resilient Article',
      bodyMarkdown: complexDraft,
      targetDimension: 'readability',
      currentScore: 60,
      targetThreshold: 75,
      findings: ['Paragraphs are too long.'],
    });
  } catch (err: any) {
    console.log(`Caught expected error: "${err.message}"`);
    failedSafely = err.message.includes('LLM rate limit / timeout error');
  }

  if (failedSafely) {
    console.log('✅ TEST 4 PASSED: LLM failure surfaces clean error; original content remains untouched in consumer state.');
    passedTests++;
  } else {
    console.error('❌ TEST 4 FAILED');
  }

  // -------------------------------------------------------------------------
  // TEST 5: Validation Reporting Accuracy (No Artificial Inflation)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 5: Accurate Validation Reporting Post-Repair ---');

  // If a repaired draft still has an excessively long sentence, the validator must catch it and not inflate scores
  const partiallyRepairedDraft = `## Improved Heading

This is a good, short sentence.

However, this particular sentence has been constructed specifically to exceed the maximum allowable threshold of thirty-five words so that the quality validation system will accurately flag it as an overly long sentence requiring further decomposition into smaller components.`;

  const partialValidation = validateArticleQuality(partiallyRepairedDraft, [], []);
  console.log(`Partial Validation Valid: ${partialValidation.valid}`);
  console.log(`Reported Errors: ${JSON.stringify(partialValidation.errors)}`);

  const caughtLongSentence = partialValidation.errors.some(e => e.includes('exceeds limit of 35'));

  if (!partialValidation.valid && caughtLongSentence) {
    console.log('✅ TEST 5 PASSED: Post-repair validation accurately detects remaining weak spots without artificial score inflation.');
    passedTests++;
  } else {
    console.error('❌ TEST 5 FAILED');
  }

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n========================================================');
  console.log(`FINAL RESULT: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('========================================================');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTargetedRepairTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
