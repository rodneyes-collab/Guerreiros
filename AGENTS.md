# Regras de Geração de Partidas (Guerreiros Volei)

Estas são as regras detalhadas de como o sistema seleciona os jogadores e equilibra os times. Elas devem ser seguidas e mantidas para garantir a justiça e o equilíbrio das partidas.

## 1. Fila de Prioridade (Quem Joga)
- O sistema seleciona **12 jogadores** para cada partida.
- A prioridade de entrada em quadra é definida pelos seguintes critérios (nesta ordem):
  1. **Maior número de vezes consecutivas no banco:** Quem ficou de fora nas últimas partidas tem prioridade máxima.
  2. **Menor número de partidas jogadas no dia:** Quem jogou menos vezes no dia tem preferência.
  3. **Não jogou a última partida:** Quem descansou na última rodada entra antes de quem acabou de jogar.
  4. **Ordem de chegada:** Em caso de empate nos critérios acima, quem chegou primeiro ao ginásio tem preferência.

## 2. Regra dos Levantadores Oficiais
- O sistema garante o limite de **2 levantadores oficiais por partida** (1 para o Time A e 1 para o Time B).
- Se houver **mais de 2 levantadores oficiais** disponíveis na lista de presença, os excedentes serão enviados para o banco de reservas. O sistema prioriza colocar jogadores não-levantadores em quadra para evitar que um time fique com 2 levantadores oficiais.
- **Exceção:** Se não houver jogadores não-levantadores suficientes para completar os 12 lugares na partida, os levantadores excedentes entrarão em quadra e jogarão improvisados em outras posições (como atacantes/defensores).

## 3. Distribuição Inicial (Draft Guloso)
- Os jogadores selecionados (excluindo os 2 levantadores) são separados por gênero (Homens e Mulheres) e ordenados do maior ELO (nível técnico) para o menor.
- O sistema distribui os jogadores um a um para os times A e B.
- Cada jogador é alocado no time que tiver a **menor soma de ELO** naquele momento, respeitando o limite máximo de 6 jogadores por time (incluindo o levantador).

## 4. Refinamento de Equilíbrio (Algoritmo de Trocas)
- Após a distribuição inicial, o sistema tenta realizar trocas (swaps) entre jogadores do Time A e Time B para otimizar o equilíbrio.
- **Restrição de Gênero:** Uma troca só é permitida entre jogadores do **mesmo gênero** (homem por homem, mulher por mulher).
- A troca só é efetivada se a diferença total de ELO entre os dois times diminuir. O objetivo é deixar a diferença de ELO o mais próxima possível de zero.
- O processo de trocas se repete em loop até que nenhuma troca adicional consiga melhorar o equilíbrio entre os times.

## 5. Posicionamento em Quadra
- O Levantador oficial (ou o jogador de maior ELO improvisado como levantador, caso não haja oficiais) é fixado na **Posição 3** (meio de rede).
- Os demais jogadores são distribuídos nas posições 4, 2, 5, 6 e 1, ordenados do maior ELO para o menor, para garantir a melhor distribuição de força na rede e na defesa.
