const fs = require('fs');
const path = require('path');

const diagPath = 'scratch/diagnostic_raw_responses.json';
if (!fs.existsSync(diagPath)) {
  console.error('File not found');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(diagPath, 'utf8'));
console.log('Length of data:', data.length);
if (data.length > 0) {
  for (let i = data.length - 1; i >= 0; i--) {
    const item = data[i];
    const resp = JSON.stringify(item.rawResponse || {});
    if (resp.includes('"what_it_is"') || resp.includes('"why_it_works"')) {
      console.log(`Element ${i} contains section content! stage: ${item.operation}`);
      fs.writeFileSync(`scratch/section_resp_${i}.json`, JSON.stringify(item, null, 2));
      console.log(`Saved scratch/section_resp_${i}.json`);
      break; // Just find the last one
    }
  }
}
