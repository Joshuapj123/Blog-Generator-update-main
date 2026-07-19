const fs = require('fs');
const path = require('path');

const cacheDir = 'scratch/local_cache';
if (fs.existsSync(cacheDir)) {
  fs.readdirSync(cacheDir).forEach(f => {
    if (f.endsWith('.json')) {
      const content = fs.readFileSync(path.join(cacheDir, f), 'utf8');
      if (content.includes('"sections"') && content.includes('"intro"')) {
        console.log('Found article cache file:', f);
      }
    }
  });
}
