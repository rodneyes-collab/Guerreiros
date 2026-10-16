const fs = require('fs');
let file = fs.readFileSync('components/RankingView.tsx', 'utf-8');

const target = `      })()
    };
  }, [players, effectiveMatches, selectedDailyDate, rankingPeriod, today, systemMetadata.mvpEfficiencyBonusPercent]);`;

const replacement = `      })()
    };
  }, [players, effectiveMatches, selectedDailyDate, rankingPeriod, today, systemMetadata]);`;

file = file.replace(target, replacement);
fs.writeFileSync('components/RankingView.tsx', file);
console.log('Patched');
