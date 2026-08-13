const fs = require('fs');
let code = fs.readFileSync('components/PlayerRow.tsx', 'utf8');

code = code.replace(
  'isBottomTwo?: boolean;',
  'isBottomTwo?: boolean;\n  icColorInfo?: { color: string, title: string };'
);

code = code.replace(
  '  isBottomTwo,',
  '  isBottomTwo,\n  icColorInfo,'
);

// We want to add the LED right after the displayName, before the isBottomTwo alert.
const targetHtml = `{displayName}
            {isBottomTwo && (`;

const replaceHtml = `{displayName}
            {icColorInfo && (
              <div className="inline-block relative ml-2 align-middle -translate-y-[2px]" title={icColorInfo.title}>
                <div className={\`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full \${icColorInfo.color}\`} />
              </div>
            )}
            {isBottomTwo && (`;

code = code.replace(targetHtml, replaceHtml);

fs.writeFileSync('components/PlayerRow.tsx', code);
