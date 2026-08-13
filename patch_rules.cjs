const fs = require('fs');
let code = fs.readFileSync('components/RulesView.tsx', 'utf8');

const oldArray = `              { title: "7. Registro de Placar e Bônus", desc: "As partidas são disputadas até 15 pontos. Vitórias dominantes (ex: 15x05) rendem bônus extras de ELO, enquanto derrotas por 14 pontos minimizam a perda de pontos, reconhecendo o alto nível de competitividade." }`;

const newArray = `              { title: "7. Registro de Placar e Bônus", desc: "As partidas são disputadas até 15 pontos. Vitórias dominantes (ex: 15x05) rendem bônus extras de ELO, enquanto derrotas por 14 pontos minimizam a perda de pontos, reconhecendo o alto nível de competitividade." },
              { title: "8. Análise de Sinergia por ML", desc: "A IA do aplicativo avalia todo o histórico de partidas (com foco nos últimos 15 dias). Se dois jogadores perdem com frequência quando jogam juntos, a IA penaliza essa combinação para testar formações mais vitoriosas. Se ganham juntos, a sinergia positiva é premiada, tornando os jogos mais competitivos." }`;

code = code.replace(oldArray, newArray);
fs.writeFileSync('components/RulesView.tsx', code);
