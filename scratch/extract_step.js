const fs = require('fs');
const path = require('path');

const logPath = 'C:\\Users\\Joshua\\.gemini\\antigravity\\brain\\98397f4a-ae0a-4f86-b7eb-275760624959\\.system_generated\\logs\\transcript.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

for (const line of lines) {
  if (!line.trim()) continue;
  try {
    const obj = JSON.parse(line);
    if (obj.step_index === 7011) {
      fs.writeFileSync('scratch/full_step.json', JSON.stringify(obj, null, 2), 'utf8');
      console.log('Successfully wrote to scratch/full_step.json');
      break;
    }
  } catch (err) {
    // ignore
  }
}
