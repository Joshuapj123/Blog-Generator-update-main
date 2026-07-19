import { stem as customStem } from '../src/lib/serp-nlp-processing';
import { stemmer } from 'stemmer';
import fs from 'fs';

const cacheFile = 'scratch/local_cache/b00149188473cd00f5d3e0ca39844f90.json';
if (!fs.existsSync(cacheFile)) {
  console.error('Cache file not found');
  process.exit(1);
}

const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
const keywords: string[] = (cacheData.data.object.keywords || []).map((k: any) => k.term);
const clusters: any[] = cacheData.data.object.clusters || [];

console.log('=== STEMMING SAMPLES COMPARISON ===');
const samples = [
  'analysis', 'analyze', 'analyzed', 'analyzing',
  'advance', 'advanced',
  'automating', 'automate', 'automation', 'automated',
  'burnout', 'accuracy', 'implications', 'implicate',
  'workflow', 'workflows',
  'review', 'reviews', 'reviewed', 'reviewing',
  'documenting', 'document', 'documents',
  'implementing', 'implement', 'implementation',
  'choosing', 'choose',
  'reducing', 'reduce',
  'increasing', 'increase',
  'challenges', 'challenge'
];

for (const sample of samples) {
  const c = customStem(sample);
  const n = stemmer(sample);
  console.log(`"${sample}": custom="${c}" | npm="${n}" ${c !== n ? '  <-- DIFFERENT' : ''}`);
}


console.log('\n=== KEYWORD STEMMING ===');
for (const kw of keywords) {
  const words = kw.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
  const stems = words.map(stemmer);
  console.log(`"${kw}" => tokens: [${words.join(', ')}] => stems: [${stems.join(', ')}]`);
}


