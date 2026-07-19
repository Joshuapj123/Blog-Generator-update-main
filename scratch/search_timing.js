const fs = require('fs');
const content = fs.readFileSync('src/app/api/generate-blocks/route.ts', 'utf8');
const lines = content.split('\n');

const timeVars = [
  'outlineGenerationDuration',
  'outlineValidationDuration',
  'sectionGenStart',
  'sectionGenEnd',
  'sectionGenerationDurationPerSection',
  'repairPassStart',
  'repairPassEnd',
  'assemblyStart',
  'assemblyEnd',
  'finalValidationStart',
  'startTime'
];

lines.forEach((line, index) => {
  timeVars.forEach(v => {
    if (line.includes(v)) {
      console.log(`${index + 1}: ${line.trim()}`);
    }
  });
});
