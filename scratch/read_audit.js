const fs = require('fs');
const content = fs.readFileSync('c:/Users/Joshua/Desktop/Blog-Generator-main/scratch/gemini_audit_log.json', 'utf8');
const logs = JSON.parse(content);
console.log('Total logs:', logs.length);
logs.slice(-5).forEach(log => {
  console.log(`- Time: ${log.timestamp}, Op: ${log.operation}, Duration: ${log.durationMs}ms`);
});
