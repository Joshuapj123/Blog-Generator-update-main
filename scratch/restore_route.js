const fs = require('fs');
const path = require('path');

const appDataDir = 'C:\\Users\\Joshua\\.gemini\\antigravity';
const conversationId = '98397f4a-ae0a-4f86-b7eb-275760624959';
const logsPath = path.join(appDataDir, 'brain', conversationId, '.system_generated', 'logs', 'transcript.jsonl');

if (!fs.existsSync(logsPath)) {
  console.log(`Logs path does not exist: ${logsPath}`);
  process.exit(1);
}

console.log(`Reading transcript from: ${logsPath}`);
const content = fs.readFileSync(logsPath, 'utf8');
const lines = content.split('\n');

console.log(`Total lines in transcript: ${lines.length}`);

// Let's find any view_file or replace_file_content tool calls for route.ts
let lastRouteTsContent = null;

for (const line of lines) {
  if (!line.trim()) continue;
  try {
    const step = JSON.parse(line);
    // Search in tool calls or responses
    if (step.tool_calls) {
      for (const call of step.tool_calls) {
        if (call.name === 'view_file' && call.args?.AbsolutePath?.includes('route.ts')) {
          console.log(`Found view_file call for route.ts in step ${step.step_index}`);
        }
      }
    }
  } catch (e) {
    // ignore
  }
}
