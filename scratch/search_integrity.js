const fs = require('fs');
const content = fs.readFileSync('src/lib/seo-intelligence/integrity_validator.ts', 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
  if (line.toLowerCase().includes('title') || line.toLowerCase().includes('h1')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
