const fs = require('fs');
const path = require('path');

function walk(dir) {
  fs.readdirSync(dir).forEach(f => {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      if (f !== 'node_modules' && f !== '.next' && f !== '.git' && f !== '.venv') walk(p);
    } else {
      if (p.endsWith('.ts') || p.endsWith('.tsx') || p.endsWith('.js') || p.endsWith('.py')) {
        const content = fs.readFileSync(p, 'utf8');
        if (content.toLowerCase().includes('budget') && content.toLowerCase().includes('scale')) {
          console.log(`Match in: ${p}`);
          // Print matching lines
          const lines = content.split('\n');
          lines.forEach((line, idx) => {
            if (line.toLowerCase().includes('scale') && line.toLowerCase().includes('budget')) {
              console.log(`  L${idx+1}: ${line.trim()}`);
            }
          });
        }
      }
    }
  });
}

walk('.');
