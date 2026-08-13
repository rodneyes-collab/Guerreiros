const fs = require('fs');
let code = fs.readFileSync('utils/teamLogic.ts', 'utf8');

// We will extract the current calculateNegativeSynergyPenalty and replace it.
