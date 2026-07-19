const fs = require('fs');
const path = require('path');

// Look for the last JSON response in transcript.jsonl containing finalArticle
const logDir = 'C:\\Users\\Joshua\\.gemini\\antigravity\\brain\\98397f4a-ae0a-4f86-b7eb-275760624959\\.system_generated\\logs';
const transcriptPath = path.join(logDir, 'transcript.jsonl');

if (!fs.existsSync(transcriptPath)) {
  console.error('Transcript not found at:', transcriptPath);
  process.exit(1);
}

const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n');
let finalArticle = null;
let serpAnalysis = null;

// Iterate backwards to find the last complete article or block generation payload
for (let i = lines.length - 1; i >= 0; i--) {
  try {
    const step = JSON.parse(lines[i]);
    if (step.tool_calls) {
      for (const call of step.tool_calls) {
        if (call.tool_name === 'default_api:run_command' && call.output) {
          // Check if output contains diagnostics
          if (call.output.includes('"coveredClusters"') || call.output.includes('Diagnostics from Generator')) {
            // Found the log output from the run
            console.log('Found log output at step:', step.step_index);
          }
        }
      }
    }
  } catch (e) {}
}

// Let's also read the cached topic clusters from b00149188473cd00f5d3e0ca39844f90.json
const cacheFile = 'scratch/local_cache/b00149188473cd00f5d3e0ca39844f90.json';
if (fs.existsSync(cacheFile)) {
  const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  serpAnalysis = cacheData.data.object;
  console.log('Loaded topic clusters from cache.');
}

// Let's search the transcript for the API response JSON
for (let i = lines.length - 1; i >= 0; i--) {
  const line = lines[i];
  if (line.includes('"sections":') && line.includes('"intro":') && line.includes('"cta":')) {
    // Try to extract JSON
    const match = line.match(/\{"title":.*?"sections":.*?\}/);
    if (match) {
      try {
        finalArticle = JSON.parse(match[0]);
        console.log('Extracted finalArticle from transcript.');
        break;
      } catch (e) {}
    }
  }
}

if (!finalArticle || !serpAnalysis) {
  console.error('Failed to load finalArticle or serpAnalysis');
  process.exit(1);
}

const topicClusters = serpAnalysis.clusters || [];
const sections = finalArticle.sections || [];
console.log(`Loaded ${sections.length} sections and ${topicClusters.length} topic clusters.`);

const checkPhraseStemOverlap = (phraseA, phraseB, threshold = 0.5) => {
  // Mock checkPhraseStemOverlap
  const tokenize = (text) => text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const stemsA = tokenize(phraseA);
  const stemsB = tokenize(phraseB);
  if (stemsA.length === 0 || stemsB.length === 0) return false;
  const setA = new Set(stemsA);
  const setB = new Set(stemsB);
  let overlap = 0;
  setA.forEach(t => { if (setB.has(t)) overlap++; });
  return overlap / Math.min(setA.size, setB.size) >= threshold;
};

topicClusters.forEach((tc) => {
  const name = tc.clusterName.toLowerCase();
  const kws = (tc.keywords || []).map((k) => k.toLowerCase());
  
  console.log(`\nEvaluating cluster: "${tc.clusterName}"`);
  const coveringIndices = [];
  
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const heading = (s.heading || '').toLowerCase();
    const bodyText = [s.what_it_is, s.why_it_works, s.experience_or_data_point].filter(Boolean).join(' ').toLowerCase();
    
    const hMatch = heading.includes(name) || kws.some((kw) => heading.includes(kw)) || checkPhraseStemOverlap(heading, tc.clusterName, 0.4);
    const bMatch = bodyText.includes(name) || kws.some((kw) => bodyText.includes(kw)) || checkPhraseStemOverlap(bodyText, tc.clusterName, 0.4);
    
    if (hMatch || bMatch) {
      coveringIndices.push({
        index: i,
        heading: s.heading,
        hMatch,
        bMatch
      });
    }
  }
  
  console.log(`Covering sections count: ${coveringIndices.length}`);
  coveringIndices.forEach(cov => {
    const s = sections[cov.index];
    const proseText = [s.what_it_is, s.why_it_works, s.experience_or_data_point].filter(Boolean).join(' ');
    const words = proseText.trim().split(/\s+/).filter(Boolean).length;
    console.log(`  - Section [${cov.index}]: "${cov.heading}" (${words} words). hMatch: ${cov.hMatch}, bMatch: ${cov.bMatch}`);
  });
});
