const fs = require('fs');

const diagPath = 'scratch/diagnostic_raw_responses.json';
if (!fs.existsSync(diagPath)) {
  console.error('File not found');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(diagPath, 'utf8'));

// Find the last outline generation response
let lastOutline = null;
for (let i = data.length - 1; i >= 0; i--) {
  if (data[i].operation === 'Outline Generation' && data[i].rawResponse) {
    lastOutline = data[i].rawResponse;
    break;
  }
}

if (!lastOutline) {
  console.error('No outline found in raw responses');
  process.exit(1);
}

console.log('=== SECTIONS IN RAW GEMINI OUTLINE ===');
lastOutline.section_outlines.forEach((s, idx) => {
  console.log(`${idx + 1}: ${s.heading} (${s.level}) - target: ${s.target_word_budget}, min: ${s.min_word_budget}`);
});
