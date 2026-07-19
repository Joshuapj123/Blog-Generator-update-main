const fs = require('fs');
const content = fs.readFileSync('src/app/api/generate-blocks/route.ts', 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
  if (line.includes('minBudget') || line.includes('maxBudget') || line.includes('targetLength')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
