const fs = require('fs');
const step = JSON.parse(fs.readFileSync('scratch/full_step.json', 'utf8'));
const args = step.tool_calls[0].args;

console.log('StartLine:', args.StartLine);
console.log('EndLine:', args.EndLine);
console.log('TargetContent length:', args.TargetContent.length);
console.log('TargetContent start:', JSON.stringify(args.TargetContent.slice(0, 200)));
console.log('TargetContent end:', JSON.stringify(args.TargetContent.slice(-200)));
console.log('ReplacementContent start:', JSON.stringify(args.ReplacementContent.slice(0, 200)));
console.log('ReplacementContent end:', JSON.stringify(args.ReplacementContent.slice(-200)));
