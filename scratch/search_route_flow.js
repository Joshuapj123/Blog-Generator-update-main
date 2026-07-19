const fs = require('fs');
const content = fs.readFileSync('src/app/api/generate-blocks/route.ts', 'utf8');
const lines = content.split('\n');

console.log('Searching for main stages and loops in route.ts:');
lines.forEach((line, idx) => {
  if (line.includes('Stage 1') || line.includes('Stage 2') || line.includes('Stage 3') || line.includes('Stage 4') || line.includes('validateGeneratedSections') || line.includes('generateObjectWithTelemetry') || line.includes('generateTextWithTelemetry')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
