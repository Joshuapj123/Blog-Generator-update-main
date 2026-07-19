const fs = require('fs');
const readline = require('readline');

async function findErrors() {
  const fileStream = fs.createReadStream('C:/Users/Joshua/.gemini/antigravity/brain/98397f4a-ae0a-4f86-b7eb-275760624959/.system_generated/logs/transcript.jsonl');

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let count = 0;
  for await (const line of rl) {
    count++;
    if (line.includes('"status":500') || line.includes('Server error 500') || line.includes('Generation failed') || line.includes('outer catch') || line.includes('API Route Outer Error')) {
      console.log(`Line ${count}: ${line.slice(0, 1000)}...`);
    }
  }
}

findErrors();
