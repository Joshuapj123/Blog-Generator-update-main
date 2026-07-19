const fs = require('fs');
const content = fs.readFileSync('src/components/AnalysisResultsPanel.tsx', 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
  if (line.includes('title') || line.toLowerCase().includes('score') || line.includes('H1') || line.includes('h1')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
