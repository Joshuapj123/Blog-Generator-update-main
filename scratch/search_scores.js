const fs = require('fs');
const path = require('path');

function searchDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next') {
        searchDir(fullPath);
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.json')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('titleAlignmentScore') || content.includes('h1QualityScore') || content.includes('TITLE') || content.includes('H1 Quality')) {
        console.log(`Found in: ${fullPath}`);
      }
    }
  }
}

searchDir('.');
