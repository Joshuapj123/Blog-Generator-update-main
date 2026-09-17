import * as fs from 'fs';
import * as path from 'path';

// Load environment variables if present
const envPath = path.resolve('c:/Users/Joshua/Desktop/Blog-Generator-main/.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

import {
  detectSemanticCluster,
  enforceKeywordDiversification,
  normalizeWordStem
} from '../src/lib/saas-intelligence/website-intelligence';
import {
  calculateContentGapScore,
  computeOpportunityScore,
  isEligibleForAutopilot,
  rankAutopilotOpportunities,
  DEFAULT_AUTOPILOT_RELEVANCE_THRESHOLD
} from '../src/lib/saas-intelligence/SearchOpportunityService';
import { SaaSProfile } from '../src/core/contracts/schemas';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ [FAIL] ${testName} - ${detail || 'Assertion failed'}`);
    process.exitCode = 1;
  }
}

console.log('=====================================================');
console.log('RUNNING REGRESSION TEST SUITE: STAGE 3 DIVERSIFICATION & STAGE 8 SAFEGUARDS');
console.log('=====================================================\n');

// ----------------------------------------------------
// TEST D: Core vs Fringe Scoring Mathematical Validation
// ----------------------------------------------------
console.log('--- TEST D: Core vs Fringe Scoring Mathematical Rebalance ---');
{
  // Simulated core keyword: High relevance, Informational, moderate difficulty
  const coreKw = {
    keyword: 'best rss reader app',
    businessRelevance: 85,
    intent: 'Informational' as const,
    estimatedDifficulty: 65,
    contentGap: 'Current articles lack in-depth comparisons of offline reading and filter rules',
    supportingTermsCount: 4
  };

  // Simulated fringe keyword: Secondary feature, Commercial, very low difficulty (easy win trap)
  const fringeKw = {
    keyword: 'converting news articles to podcasts',
    businessRelevance: 45, // Secondary tier (< 65 threshold)
    intent: 'Commercial' as const,
    estimatedDifficulty: 20, // Low competition
    contentGap: 'Missing step-by-step audio workflows and player integrations',
    supportingTermsCount: 4
  };

  const coreIntentValue = 60; // Informational
  const fringeIntentValue = 100; // Commercial

  const coreGapScore = calculateContentGapScore(coreKw.contentGap, coreKw.supportingTermsCount);
  const fringeGapScore = calculateContentGapScore(fringeKw.contentGap, fringeKw.supportingTermsCount);

  // Old formula (35/25/20/20 with no relevance threshold dampening)
  const oldCoreScore = Math.round((coreKw.businessRelevance * 0.35) + (coreIntentValue * 0.25) + (95 * 0.20) + ((100 - coreKw.estimatedDifficulty) * 0.20));
  const oldFringeScore = Math.round((fringeKw.businessRelevance * 0.35) + (fringeIntentValue * 0.25) + (95 * 0.20) + ((100 - fringeKw.estimatedDifficulty) * 0.20));

  // New formula (40/25/25/10 with relevance threshold dampening)
  const newCoreScore = computeOpportunityScore(coreKw.businessRelevance, coreIntentValue, coreGapScore, coreKw.estimatedDifficulty);
  const newFringeScore = computeOpportunityScore(fringeKw.businessRelevance, fringeIntentValue, fringeGapScore, fringeKw.estimatedDifficulty);

  console.log(`Old Formula Results: Core = ${oldCoreScore}, Fringe = ${oldFringeScore} (Fringe was winning: ${oldFringeScore > oldCoreScore})`);
  console.log(`New Formula Results: Core = ${newCoreScore}, Fringe = ${newFringeScore} (Core winning: ${newCoreScore > newFringeScore})`);

  assert(oldFringeScore >= oldCoreScore, 'Test D.1: Confirm old formula allowed fringe keyword to beat or tie core keyword');
  assert(newCoreScore > newFringeScore, 'Test D.2: New formula decisively ranks core keyword above fringe keyword', `Core: ${newCoreScore}, Fringe: ${newFringeScore}`);
  assert(isEligibleForAutopilot(coreKw.businessRelevance), 'Test D.3: Core keyword meets Autopilot eligibility threshold (>=65)');
  assert(!isEligibleForAutopilot(fringeKw.businessRelevance), 'Test D.4: Fringe keyword fails Autopilot eligibility threshold (<65)');

  // Autopilot opportunity ranking partition test
  const ranked = rankAutopilotOpportunities([
    { keyword: fringeKw.keyword, businessRelevance: fringeKw.businessRelevance, opportunityScore: newFringeScore },
    { keyword: coreKw.keyword, businessRelevance: coreKw.businessRelevance, opportunityScore: newCoreScore }
  ]);
  assert(ranked[0].keyword === coreKw.keyword, 'Test D.5: rankAutopilotOpportunities places eligible core keyword at rank 1');
}

// ----------------------------------------------------
// TEST E: Dominant-Cluster Protection (>50% cluster pruned)
// ----------------------------------------------------
console.log('\n--- TEST E: Dominant-Cluster Protection (>50% cluster pruned) ---');
{
  const inoreaderProfile: SaaSProfile = {
    name: 'Inoreader',
    description: 'Inoreader is a powerful content reader and news aggregator designed for power users, professionals, and teams to track feeds, newsletters, and social channels in one unified dashboard.',
    targetAudience: 'Content curators, researchers, information workers, power users',
    keyFeatures: ['RSS feed tracking', 'Web scraping', 'Rule-based automation', 'Audio podcast playback & generation', 'Team boards'],
    primaryCompetitors: [],
    tone: 'professional',
    customInsights: ''
  };

  // Artificially skewed candidate set where secondary feature "podcast" makes up 80% (4/5)
  const biasedKeywords = [
    'converting news articles to podcasts',
    'rss feed to podcast generator',
    'daily news podcasts app',
    'news to podcast conversion tool',
    'best rss reader app'
  ];

  const analysis = detectSemanticCluster(biasedKeywords, inoreaderProfile);
  console.log('Biased cluster analysis:', {
    dominantStem: analysis.dominantStem,
    count: `${analysis.dominantCount}/${analysis.totalCount}`,
    ratio: analysis.concentrationRatio,
    isConcentrated: analysis.isConcentrated,
    isPrimaryBusiness: analysis.isPrimaryBusiness
  });

  assert(analysis.isConcentrated === true, 'Test E.1: Over-concentrated secondary cluster correctly flagged');
  assert(analysis.dominantStem === 'podcast', 'Test E.2: Dominant stem correctly identified as "podcast"');
  assert(analysis.isPrimaryBusiness === false, 'Test E.3: Correctly determined that "podcast" is NOT Inoreader primary business');

  const { keywords: diversified, wasAdjusted, clusterAnalysis: postAnalysis } = enforceKeywordDiversification(biasedKeywords, inoreaderProfile);
  console.log('Diversified keywords:', diversified);
  console.log('Post-diversification cluster analysis:', {
    dominantCount: `${postAnalysis.dominantCount}/${postAnalysis.totalCount}`,
    ratio: postAnalysis.concentrationRatio,
    isConcentrated: postAnalysis.isConcentrated
  });

  assert(wasAdjusted === true, 'Test E.4: enforceKeywordDiversification performed adjustment');
  const podcastCount = diversified.filter(k => k.includes('podcast')).length;
  const maxAllowed = Math.floor(biasedKeywords.length / 2); // 5/2 = 2
  assert(podcastCount <= maxAllowed, `Test E.5: Podcast keywords reduced to at most ${maxAllowed} (actual: ${podcastCount})`);
  assert(diversified.length === biasedKeywords.length, `Test E.6: Candidate count preserved with backfilled core topics (count: ${diversified.length})`);
  assert(postAnalysis.isConcentrated === false, 'Test E.7: Post-adjustment cluster concentration is within acceptable threshold (<= 50%)');
}

// ----------------------------------------------------
// TEST F: Legitimate Feature Businesses (Genuine Primary Offering NOT Penalized)
// ----------------------------------------------------
console.log('\n--- TEST F: Legitimate Feature Businesses (Primary Offering Preserved) ---');
{
  const jellypodProfile: SaaSProfile = {
    name: 'Jellypod',
    description: 'Jellypod is an AI podcast generator that transforms your daily news, subscriptions, and articles into personal, studio-grade audio podcasts.',
    targetAudience: 'Podcast listeners, commuters, busy professionals',
    keyFeatures: ['AI podcast synthesis', 'Email newsletter to audio', 'Custom voice hosts', 'Spotify/Apple podcasts sync'],
    primaryCompetitors: [],
    tone: 'professional',
    customInsights: ''
  };

  // Keywords that legitimately focus on podcasts because that IS the primary offering
  const legitimatePodcastKeywords = [
    'best ai podcast generator',
    'convert newsletter to podcast',
    'daily news podcast app',
    'create podcast with ai',
    'ai podcast tools'
  ];

  const analysis = detectSemanticCluster(legitimatePodcastKeywords, jellypodProfile);
  console.log('Jellypod cluster analysis:', {
    dominantStem: analysis.dominantStem,
    count: `${analysis.dominantCount}/${analysis.totalCount}`,
    ratio: analysis.concentrationRatio,
    isConcentrated: analysis.isConcentrated,
    isPrimaryBusiness: analysis.isPrimaryBusiness
  });

  assert(analysis.isPrimaryBusiness === true, 'Test F.1: Dominant stem "podcast" recognized as Jellypod primary business offering');
  assert(analysis.isConcentrated === false, 'Test F.2: Legitimate primary business cluster is NOT flagged as over-concentrated');

  const { keywords: preservedKeywords, wasAdjusted } = enforceKeywordDiversification(legitimatePodcastKeywords, jellypodProfile);
  assert(wasAdjusted === false, 'Test F.3: enforceKeywordDiversification leaves legitimate primary business keywords untouched');
  assert(preservedKeywords.length === legitimatePodcastKeywords.length, 'Test F.4: All original keywords preserved');
}

// ----------------------------------------------------
// TEST C: Content Gap Scoring Specificity Validation
// ----------------------------------------------------
console.log('\n--- TEST C: Content Gap Scoring Specificity Validation ---');
{
  // Empty / minimal content gap
  const emptyScore = calculateContentGapScore('');
  const shortScore = calculateContentGapScore('Some content gap');
  // Specific gap with diagnostic terms and supporting entities
  const richGap = 'Current top 10 articles lack actionable workflow steps, missing comparison benchmarks between enterprise tools, and fail to address custom pricing plans.';
  const richScore = calculateContentGapScore(richGap, 4);

  console.log(`Content gap scores: empty=${emptyScore}, short=${shortScore}, rich=${richScore}`);
  assert(emptyScore === 50, 'Test C.1: Empty content gap defaults to neutral baseline 50');
  assert(shortScore < richScore, 'Test C.2: Short generic gap scores lower than evidence-backed rich gap');
  assert(richScore >= 80, `Test C.3: Evidence-backed content gap with entities scores high (>=80, actual=${richScore})`);
}

// ----------------------------------------------------
// SUMMARY
// ----------------------------------------------------
console.log('\n=====================================================');
console.log(`TEST RESULTS: ${passedTests} / ${totalTests} PASSED`);
if (passedTests === totalTests) {
  console.log('ALL REGRESSION TESTS COMPLETED SUCCESSFULLY!');
} else {
  console.error(`SOME TESTS FAILED: ${totalTests - passedTests} failure(s)`);
}
console.log('=====================================================');
