const fs = require('fs');
const path = require('path');

const diagPath = 'scratch/diagnostic_raw_responses.json';
if (!fs.existsSync(diagPath)) {
  console.error('File not found');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(diagPath, 'utf8'));

// Find the last runId
let lastRunId = null;
for (let i = data.length - 1; i >= 0; i--) {
  if (data[i].runId) {
    lastRunId = data[i].runId;
    break;
  }
}

console.log('Last Run ID:', lastRunId);

if (!lastRunId) {
  process.exit(1);
}

// Find all entries for this runId
const runEntries = data.filter(item => item.runId === lastRunId);
console.log(`Found ${runEntries.length} entries for runId.`);

// Reconstruct outline and sections
let outline = null;
const sectionsMap = new Map(); // heading -> section content object

runEntries.forEach(entry => {
  const op = entry.operation;
  const obj = entry.rawResponse;
  
  if (op === 'Outline Generation') {
    outline = obj;
  } else if (op === 'Section Content Generation') {
    if (obj && obj.heading) {
      sectionsMap.set(obj.heading.toLowerCase().trim(), obj);
    }
  } else if (op === 'Section Compression Repair') {
    if (obj && obj.heading) {
      sectionsMap.set(obj.heading.toLowerCase().trim(), obj);
    }
  }
});

if (!outline) {
  console.error('Outline not found in logs for this run.');
  process.exit(1);
}

console.log('Outline title:', outline.title);
console.log('Outline sections count:', outline.section_outlines.length);
console.log('Written sections count:', sectionsMap.size);

// Reconstruct sections array in outline order
const sectionsList = [];
outline.section_outlines.forEach((node, idx) => {
  const key = node.heading.toLowerCase().trim();
  let sec = sectionsMap.get(key);
  if (!sec) {
    // Try matching by checking if heading includes or is included
    for (const [h, s] of sectionsMap.entries()) {
      if (h.includes(key) || key.includes(h)) {
        sec = s;
        break;
      }
    }
  }
  if (sec) {
    sectionsList.push({
      ...sec,
      heading: node.heading, // use outline heading
      level: node.level
    });
  } else {
    // Mock section so length matches
    sectionsList.push({
      heading: node.heading,
      level: node.level,
      what_it_is: 'Mock content',
      why_it_works: 'Mock content',
      experience_or_data_point: 'Mock content'
    });
  }
});

// Load topic clusters from cache
const cacheFile = 'scratch/local_cache/b00149188473cd00f5d3e0ca39844f90.json';
let topicClusters = [];
if (fs.existsSync(cacheFile)) {
  const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  topicClusters = cacheData.data.object.clusters || [];
  console.log('Loaded topic clusters from cache.');
}

const checkPhraseStemOverlap = (phraseA, phraseB, threshold = 0.5) => {
  // Simple tokenize and stem
  const tokenize = (text) => text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
  const stemsA = tokenize(phraseA);
  const stemsB = tokenize(phraseB);
  if (stemsA.length === 0 || stemsB.length === 0) return false;
  const setA = new Set(stemsA);
  const setB = new Set(stemsB);
  let overlap = 0;
  setA.forEach(t => { if (setB.has(t)) overlap++; });
  return overlap / Math.min(setA.size, setB.size) >= threshold;
};

// Run the exact topic cluster check from validateGeneratedSections
const coveredClusters = [];
const missingClusters = [];
if (topicClusters.length > 0) {
  topicClusters.forEach((tc) => {
    const name = tc.clusterName.toLowerCase();
    const kws = (tc.keywords || []).map((k) => k.toLowerCase());
    
    console.log(`\nEvaluating cluster: "${tc.clusterName}"`);
    console.log('Keywords:', kws);
    
    const coveringIndices = [];
    for (let i = 0; i < sectionsList.length; i++) {
      const s = sectionsList[i];
      const heading = (s.heading || '').toLowerCase();
      const bodyText = [s.what_it_is, s.why_it_works, s.experience_or_data_point].filter(Boolean).join(' ').toLowerCase();
      
      const isMatch = heading.includes(name) || kws.some((kw) => heading.includes(kw)) ||
                      bodyText.includes(name) || kws.some((kw) => bodyText.includes(kw)) ||
                      checkPhraseStemOverlap(heading, tc.clusterName, 0.4) ||
                      checkPhraseStemOverlap(bodyText, tc.clusterName, 0.4);
      if (isMatch) {
        coveringIndices.push(i);
      }
    }
    
    console.log('Covering indices:', coveringIndices);

    if (coveringIndices.length > 0) {
      const hasBudget = coveringIndices.some((idx) => {
        const s = sectionsList[idx];
        const proseText = [s.what_it_is, s.why_it_works, s.experience_or_data_point].filter(Boolean).join(' ');
        const actualWordCount = proseText.trim().split(/\s+/).filter(Boolean).length;
        console.log(`  - Section [${idx}]: "${s.heading}" has ${actualWordCount} words.`);
        return actualWordCount >= 100;
      });
      if (hasBudget) {
        coveredClusters.push(tc.clusterName);
      } else {
        missingClusters.push(tc.clusterName);
        console.log('  -> Rejected: none of the covering sections had >= 100 words.');
      }
    } else {
      missingClusters.push(tc.clusterName);
      console.log('  -> Rejected: no sections matched.');
    }
  });
}

const topicClusterCoverage = topicClusters.length > 0
  ? Math.round((coveredClusters.length / topicClusters.length) * 100)
  : 100;

console.log(`\nFinal Topic Cluster Coverage: ${topicClusterCoverage}%`);
console.log('Covered:', coveredClusters);
console.log('Missing:', missingClusters);
