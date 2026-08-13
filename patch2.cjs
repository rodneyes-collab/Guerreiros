const fs = require('fs');
let code = fs.readFileSync('components/MatchView.tsx', 'utf8');

const oldIndicatorA = `{p?.id !== generationResult.teamA.setter?.id && rankedA.strongestTwo.includes(p?.id || '') && (
                          <div className="inline-block relative ml-2 align-middle -translate-y-[2px]" title="B4: Top 2 da Equipe (Extremo Superior)">
                            <div className="select-none w-2 h-2 sm:w-2.5 sm:h-2.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.9)]" />
                          </div>
                        )}
                        {p?.id !== generationResult.teamA.setter?.id && rankedA.weakestTwo.includes(p?.id || '') && (
                          <div className="inline-block relative ml-2 align-middle -translate-y-[2px]" title="B4: Bottom 2 da Equipe (Extremo Inferior)">
                            <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.9)]" />
                          </div>
                        )}
                        {p?.id !== generationResult.teamA.setter?.id && !rankedA.strongestTwo.includes(p?.id || '') && !rankedA.weakestTwo.includes(p?.id || '') && (
                          <div className="inline-block relative ml-2 align-middle -translate-y-[2px]" title="Core/Intermediário (Equilíbrio Técnico)">
                            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white/20 rounded-full" />
                          </div>
                        )}`;

const newIndicator = `{(() => {
                          const icInfo = getPlayerIcColor(p?.id || '');
                          return (
                            <div className="inline-block relative ml-2 align-middle -translate-y-[2px]" title={icInfo.title}>
                              <div className={\`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full \${icInfo.color}\`} />
                            </div>
                          );
                        })()}`;

const oldIndicatorB = `{p?.id !== generationResult.teamB.setter?.id && rankedB.strongestTwo.includes(p?.id || '') && (
                          <div className="inline-block relative ml-2 align-middle -translate-y-[2px]" title="B4: Top 2 da Equipe (Extremo Superior)">
                            <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.9)]" />
                          </div>
                        )}
                        {p?.id !== generationResult.teamB.setter?.id && rankedB.weakestTwo.includes(p?.id || '') && (
                          <div className="inline-block relative ml-2 align-middle -translate-y-[2px]" title="B4: Bottom 2 da Equipe (Extremo Inferior)">
                            <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.9)]" />
                          </div>
                        )}
                        {p?.id !== generationResult.teamB.setter?.id && !rankedB.strongestTwo.includes(p?.id || '') && !rankedB.weakestTwo.includes(p?.id || '') && (
                          <div className="inline-block relative ml-2 align-middle -translate-y-[2px]" title="Core/Intermediário (Equilíbrio Técnico)">
                            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white/20 rounded-full" />
                          </div>
                        )}`;

code = code.replace(oldIndicatorA, newIndicator);
code = code.replace(oldIndicatorB, newIndicator);

fs.writeFileSync('components/MatchView.tsx', code);
