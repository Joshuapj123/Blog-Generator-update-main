const fs = require('fs');

const content = fs.readFileSync('src/app/api/generate-blocks/route.ts', 'utf8');
const lines = content.split('\n');

let depth = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  let open = (line.match(/\{/g) || []).length;
  let close = (line.match(/\}/g) || []).length;
  
  depth += open - close;
  
  if (i >= 2260) {
    console.log(`Line ${i + 1}: depth=${depth} (open=${open}, close=${close}) | ${line.trim().slice(0, 60)}`);
  }
}
