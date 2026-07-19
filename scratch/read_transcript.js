const fs = require('fs');
const readline = require('readline');

const logPath = 'C:\\Users\\Joshua\\.gemini\\antigravity\\brain\\98397f4a-ae0a-4f86-b7eb-275760624959\\.system_generated\\logs\\transcript.jsonl';

async function run() {
  const fileStream = fs.createReadStream(logPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    const step = JSON.parse(line);
    if (step.step_index === 2410) {
      console.log(step.content);
      break;
    }
  }
}

run();
