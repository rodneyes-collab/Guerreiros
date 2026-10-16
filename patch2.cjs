const fs = require('fs');
let file = fs.readFileSync('components/RankingView.tsx', 'utf-8');
const lines = file.split('\n');

const replacement = `      players.forEach(p => {
        const playerMatches = dateMatches.filter(m => 
          m.teamA.includes(p.id) || m.teamB.includes(p.id)
        );
        const playerWins = playerMatches.filter(m => 
          (m.winner === 'A' && m.teamA.includes(p.id)) || 
          (m.winner === 'B' && m.teamB.includes(p.id))
        ).length;
        const duration = playerMatches.reduce((acc, m) => acc + (m.duration || 0), 0);
        const pFor = playerMatches.reduce((acc, m) => {
          const isA = m.teamA.includes(p.id);
          return acc + (isA ? (m.scoreA || 0) : (m.scoreB || 0));
        }, 0);
        const pAgainst = playerMatches.reduce((acc, m) => {
          const isA = m.teamA.includes(p.id);
          return acc + (isA ? (m.scoreB || 0) : (m.scoreA || 0));
        }, 0);

        let totalMatches = playerMatches.length;
        let wins = playerWins;
        let eloGain = 0;
        let matchEloGain = 0;
        let fidelityGain = 0;

        if (dateMatches.length === 0 && p.eloHistory && p.eloHistory.length > 0) {
          const historyEntry = p.eloHistory.find(h => {
             const hDateStr = h.date.includes('T') ? h.date.split('T')[0] : h.date;
             return hDateStr === dateKey;
          });
          if (historyEntry && historyEntry.change) {
            eloGain = historyEntry.change;
            if (eloGain >= 50 || historyEntry.fidelityBonus) {
              fidelityGain = 50;
              matchEloGain = eloGain - 50;
            } else {
              matchEloGain = eloGain;
            }
            if (matchEloGain > 0) {
              totalMatches = Math.round(matchEloGain / 20) || 1;
              wins = totalMatches;
            } else if (matchEloGain < 0) {
              totalMatches = Math.round(Math.abs(matchEloGain) / 20) || 1;
              wins = 0;
            } else if (fidelityGain > 0) {
              totalMatches = 1;
              wins = 0;
            }
          }
        } else {
          const losses = totalMatches - wins;
          matchEloGain = totalMatches > 0 ? (wins * 20 + losses * -20) : 0;
          const hasFidelityBonus = (p.eloHistory || []).some(h => h.date === dateKey && h.fidelityBonus) || (totalMatches > 0);
          fidelityGain = hasFidelityBonus ? 50 : 0;
          eloGain = matchEloGain + fidelityGain;
        }

        dailyStats[p.id] = {
          matches: totalMatches,
          wins: wins,
          eloGain: eloGain,
          matchEloGain: matchEloGain,
          fidelityGain: fidelityGain,
          duration: duration,
          pointsFor: pFor,
          pointsAgainst: pAgainst
        };
      });`;

// Between lines 1139 and 1175
lines.splice(1140, 1178 - 1140 + 1, replacement);
fs.writeFileSync('components/RankingView.tsx', lines.join('\n'));
console.log('Patched');
