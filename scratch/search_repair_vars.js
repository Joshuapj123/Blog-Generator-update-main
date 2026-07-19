const fs = require('fs');
const content = fs.readFileSync('src/app/api/generate-blocks/route.ts', 'utf8');
const lines = content.split('\n');

const vars = [
  'outlineRegenerationAttempts',
  'sectionRepairAttempts',
  'compressionAttempts',
  'entityInjectionPasses',
  'structureRepairPasses',
  'totalGeminiCalls',
  'totalRepairCalls',
  'totalValidationFailures'
];

lines.forEach((line, index) => {
  vars.forEach(v => {
    if (line.includes(v)) {
      console.log(`${index + 1}: ${line.trim()}`);
    }
  });
});
