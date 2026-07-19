const fs = require('fs');
const content = fs.readFileSync('src/app/api/generate-blocks/route.ts', 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
  if (line.includes('model') && (line.includes('google') || line.includes('gemini') || line.includes('create'))) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
