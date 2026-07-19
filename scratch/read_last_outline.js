const fs = require('fs');
const content = fs.readFileSync('scratch/gemini_audit_log.json', 'utf8');
const logs = JSON.parse(content);

const outlineLogs = logs.filter(log => log.operation === 'Outline Generation');
console.log(`Found ${outlineLogs.length} outline generation logs.`);

if (outlineLogs.length > 0) {
  const lastLog = outlineLogs[outlineLogs.length - 1];
  console.log(`Timestamp: ${lastLog.timestamp}`);
  console.log(`Model: ${lastLog.model}`);
  
  // Let's find the response in diagnostic_raw_responses.json
  const rawResponses = JSON.parse(fs.readFileSync('scratch/diagnostic_raw_responses.json', 'utf8'));
  const lastResponse = rawResponses.filter(r => r.operation === 'Outline Generation').pop();
  if (lastResponse) {
    const obj = lastResponse.rawResponse;
    console.log(`Title: ${obj.title}`);
    console.log(`Section outlines count: ${obj.section_outlines.length}`);
    obj.section_outlines.forEach((s, idx) => {
      console.log(`  ${idx + 1}: [${s.level}] ${s.heading} - target: ${s.target_word_budget}, min: ${s.min_word_budget}`);
    });
  }
}
