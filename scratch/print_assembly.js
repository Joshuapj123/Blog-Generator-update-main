const fs = require('fs');
const path = require('path');

const checkpointsPath = 'scratch/pipeline_checkpoints.jsonl';
if (!fs.existsSync(checkpointsPath)) {
  console.error('Checkpoints file not found');
  process.exit(1);
}

const lines = fs.readFileSync(checkpointsPath, 'utf8').trim().split('\n');
for (let i = lines.length - 1; i >= 0; i--) {
  try {
    const data = JSON.parse(lines[i]);
    if (data.stage === 'assembly') {
      console.log('Found assembly checkpoint at line:', i);
      // Print the keys of the data object
      console.log(Object.keys(data));
      // Let's write the entire line to a debug file
      fs.writeFileSync('scratch/assembly_checkpoint.json', JSON.stringify(data, null, 2));
      console.log('Saved scratch/assembly_checkpoint.json');
      break;
    }
  } catch (e) {
    console.error('Error parsing line:', i, e.message);
  }
}
