const fs = require('fs');
const path = require('path');

function walk(dir) {
  try {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const p = path.join(dir, f);
      let stat;
      try {
        stat = fs.statSync(p);
      } catch (e) {
        continue;
      }
      if (stat.isDirectory()) {
        if (f !== 'node_modules' && f !== '.next' && f !== '.git' && f !== '.venv') {
          walk(p);
        }
      } else {
        if (p.endsWith('.ts') || p.endsWith('.tsx') || p.endsWith('.js') || p.endsWith('.py') || p.endsWith('.json') || p.endsWith('.md')) {
          try {
            const content = fs.readFileSync(p, 'utf8');
            if (content.toLowerCase().includes('budget adjuster') || content.toLowerCase().includes('scaling proportionally')) {
              console.log(`Match in: ${p}`);
              const lines = content.split('\n');
              lines.forEach((line, idx) => {
                if (line.toLowerCase().includes('budget adjuster') || line.toLowerCase().includes('scaling proportionally')) {
                  console.log(`  L${idx+1}: ${line.trim()}`);
                }
              });
            }
          } catch (e) {
            // ignore read errors
          }
        }
      }
    }
  } catch (e) {
    // ignore read errors
  }
}

walk('.');
console.log('Search finished.');
