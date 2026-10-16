const fs = require('fs');
let file = fs.readFileSync('components/RankingView.tsx', 'utf-8');

const target = `  // Get unique dates from matches for filtering
  const availableDates = useMemo(() => {
    const dates = new Set(matches.map(m => m.date).filter(Boolean));
    dates.add(today);
    const sortedDates = Array.from(dates).sort((a, b) => b.localeCompare(a));
    return sortedDates;
  }, [matches, today]);`;

const replacement = `  // Get unique dates from matches and elo history for filtering
  const availableDates = useMemo(() => {
    const dates = new Set(matches.map(m => m.date).filter(Boolean));
    players.forEach(p => {
      if (p.eloHistory) {
        p.eloHistory.forEach(h => {
          if (h.date) {
            const dateStr = h.date.includes('T') ? h.date.split('T')[0] : h.date;
            dates.add(dateStr);
          }
        });
      }
    });
    dates.add(today);
    const sortedDates = Array.from(dates).sort((a, b) => b.localeCompare(a));
    return sortedDates;
  }, [matches, players, today]);`;

if (file.includes(target)) {
  file = file.replace(target, replacement);
  fs.writeFileSync('components/RankingView.tsx', file);
  console.log('Patched');
} else {
  console.log('Not found exactly');
  const lines = file.split('\n');
  let startIdx = -1;
  let endIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('// Get unique dates from matches for filtering')) {
      startIdx = i;
    }
    if (startIdx !== -1 && lines[i].includes('}, [matches, today]);')) {
      endIdx = i;
      break;
    }
  }
  if (startIdx !== -1 && endIdx !== -1) {
    lines.splice(startIdx, endIdx - startIdx + 1, replacement);
    fs.writeFileSync('components/RankingView.tsx', lines.join('\n'));
    console.log('Patched via fuzzy search.');
  } else {
    console.log('Could not find via fuzzy search.');
  }
}
