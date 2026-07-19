const fs = require('fs');
const content = fs.readFileSync('src/app/api/generate-blocks/route.ts', 'utf8');
const lines = content.split('\n');

const search = 'Outline Generation';
lines.forEach((line, index) => {
  if (line.includes(search) || line.includes('generateObjectWithTelemetry') || line.includes('section_outlines:')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
