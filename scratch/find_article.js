const fs = require('fs');
const path = require('path');

const logDir = 'C:/Users/Joshua/.gemini/antigravity/brain/98397f4a-ae0a-4f86-b7eb-275760624959/.system_generated/logs';
const transcriptPath = path.join(logDir, 'transcript.jsonl');

if (!fs.existsSync(transcriptPath)) {
  console.error('Transcript not found');
  process.exit(1);
}

const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n');

for (let i = lines.length - 1; i >= 0; i--) {
  const line = lines[i];
  if (line.includes('"sections"') && line.includes('"intro"') && line.includes('"cta"')) {
    // Let's try parsing this line as JSON
    try {
      const step = JSON.parse(line);
      // Let's look for finalArticle in the step structure (e.g. content or tool calls)
      const contentStr = step.content || '';
      // Or search inside tool calls
      if (step.tool_calls) {
        for (const call of step.tool_calls) {
          if (call.output && call.output.includes('"sections"')) {
            console.log('Found article in tool call output of step:', step.step_index);
            // Let's find the JSON inside output
            const match = call.output.match(/\{"title":.*?"sections":.*?\}/s);
            if (match) {
              fs.writeFileSync('scratch/last_article.json', match[0]);
              console.log('Saved last_article.json successfully!');
              process.exit(0);
            }
          }
        }
      }
      
      const match = contentStr.match(/\{"title":.*?"sections":.*?\}/s);
      if (match) {
        fs.writeFileSync('scratch/last_article.json', match[0]);
        console.log('Saved last_article.json from content!');
        process.exit(0);
      }
    } catch (e) {
      console.log('Parse error at line:', i, e.message);
    }
  }
}

console.log('Could not find article JSON');
