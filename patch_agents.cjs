const fs = require('fs');
let content = fs.readFileSync('AGENTS.md', 'utf8');

const newSkill = `
---

## 🤖 SKILL 6: Machine Learning Synergy (Análise de Sinergia por ML)

### Objetivo
Identificar padrões de vitórias e derrotas históricos entre pares de jogadores, penalizando formações que não funcionam e premiando combinações vitoriosas para garantir o máximo de competitividade no sorteio (Simulação de ML).

### Diretrizes de Execução
1. **Histórico e Decaimento:**
   - O algoritmo varre o histórico completo de partidas.
   - Aplica um decaimento temporal de 15 dias de meia-vida. Jogos recentes possuem muito mais peso na avaliação da sinergia do que partidas antigas.
2. **Avaliação Contínua e Escala:**
   - Taxa de Derrota > 50%: Gera "Sinergia Negativa" (Penalidade no Sorteio).
   - Taxa de Derrota < 50%: Gera "Sinergia Positiva" (Bônus no Sorteio).
   - O multiplicador é escalado de forma quadrática para amplificar resultados extremos e possui um teto de confiança baseado no número de partidas jogadas em dupla.
3. **Restrição de Amostragem:**
   - O algoritmo só aplica o fator de sinergia caso o peso consolidado de jogos juntos entre a dupla seja superior ao limite mínimo de confiança estatística (amostragem mínima).
`;

content = content.replace('## 🛠️ Diretrizes Gerais de Implementação', newSkill + '\n## 🛠️ Diretrizes Gerais de Implementação');

fs.writeFileSync('AGENTS.md', content);
