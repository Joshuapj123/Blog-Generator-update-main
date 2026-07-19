const fs = require('fs');
const content = fs.readFileSync('src/app/api/generate-blocks/route.ts', 'utf8');
const lines = content.split('\n');

function findPattern(pattern) {
  console.log(`=== Matches for: ${pattern} ===`);
  lines.forEach((line, idx) => {
    if (line.includes(pattern)) {
      console.log(`${idx + 1}: ${line.trim()}`);
    }
  });
}

findPattern('minBudget');
findPattern('maxBudget');
findPattern('targetLength');
findPattern('competitorMedianWordCount');
