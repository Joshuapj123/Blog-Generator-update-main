const fs = require('fs');
const content = fs.readFileSync('src/app/api/generate-blocks/route.ts', 'utf8');
const lines = content.split('\n');

const search = 'validateGeneratedOutline';
lines.forEach((line, index) => {
  if (line.includes(search) || line.toLowerCase().includes('validation') || line.toLowerCase().includes('outline')) {
    if (line.includes('function') || line.includes('const ') || line.includes('class ') || line.includes('validate')) {
      console.log(`${index + 1}: ${line.trim()}`);
    }
  }
});
