const fs = require('fs');
const filePath = 'src/app/api/generate-blocks/route.ts';

let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings
content = content.replace(/\r\n/g, '\n');

// Find and replace the cacheKey in the Section Content Generation call
const targetCacheKey = "cacheKey: 'section_' + title + '_' + secOutline.originalIndex,";
const replacementCacheKey = "cacheKey: 'section_bp_v1_' + title + '_' + secOutline.originalIndex,";

if (content.includes(targetCacheKey)) {
  content = content.replace(targetCacheKey, replacementCacheKey);
  fs.writeFileSync(filePath, content.replace(/\n/g, '\r\n'), 'utf8');
  console.log('Successfully updated section cache key to include bp_v1 prefix!');
} else {
  console.error('Could not find target cacheKey for replacement in route.ts!');
}
