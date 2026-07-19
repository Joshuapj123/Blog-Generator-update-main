const fs = require('fs');
const content = fs.readFileSync('src/app/api/generate-blocks/route.ts', 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
  if (line.includes('toolTargetCount') || line.includes('faqTargetCount')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
