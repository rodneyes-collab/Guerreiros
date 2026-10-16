const fs = require('fs');
let file = fs.readFileSync('components/RankingView.tsx', 'utf-8');

const target = `  // Get unique dates from matches and elo history for filtering`;

if (file.includes(target)) {
  console.log('Already patched!');
} else {
  console.log('Not patched');
}
