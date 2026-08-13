const fs = require('fs');
let code = fs.readFileSync('components/TeamCard.tsx', 'utf8');

code = code.replace(
  'bottomTwoIds?: Set<string>;',
  'bottomTwoIds?: Set<string>;\n  icColors?: Record<string, { color: string, title: string }>;'
);

code = code.replace(
  '  bottomTwoIds\n}) => {',
  '  bottomTwoIds,\n  icColors\n}) => {'
);

code = code.replace(
  '                  isBottomTwo={bottomTwoIds?.has(team.setter.id)}',
  '                  isBottomTwo={bottomTwoIds?.has(team.setter.id)}\n                  icColorInfo={icColors?.[team.setter.id]}'
);

code = code.replace(
  '                    isBottomTwo={bottomTwoIds?.has(p.id)}',
  '                    isBottomTwo={bottomTwoIds?.has(p.id)}\n                    icColorInfo={icColors?.[p.id]}'
);

fs.writeFileSync('components/TeamCard.tsx', code);
