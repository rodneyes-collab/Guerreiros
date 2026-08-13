# Padrão de Design, Regras de Negócio e Skills do App

Este documento detalha o padrão visual, a arquitetura de dados, os fluxos de autenticação e as **Skills Especializadas** utilizadas pelos Agentes de IA e pelo sistema para a manutenção e evolução do Guerreiros Volleyball Club.

---

## 🔄 Pipeline Sequencial de Geração e Balanceamento de Partidas

O processo de escalação e balanceamento de partidas do Guerreiros Volleyball Club opera através de um pipeline sequencial determinístico e inteligente, englobando seleção de fila, sorteio posicional, agentes de auto-correção, otimização de linha e busca local por Machine Learning:

```
[ 1. Fila Inteligente (Os 12 da Partida) ]
                   │
                   ▼
[ 2. Validação Posicional (Levantadores & Linha) ]
                   │
                   ▼
[ 3. Cálculo do Índice Composto (IC) e Rating Híbrido ]
                   │
                   ▼
[ 4. Sorteio Base ABAB (Alternância por Gênero & IC) ]
                   │
                   ▼
[ 5. Agente de Auto-Correção (Isolamento Bottom 2 & Gênero) ]
                   │
                   ▼
[ 6. Otimização Agressiva de Linha (Igualdade de IC de Atacantes) ]
                   │
                   ▼
[ 7. Motor de Sinergia ML (Decaimento Temporal & Histórico de Duplas) ]
                   │
                   ▼
[ 8. Busca Local Avançada (100 Iterações de Trocas Aleatórias para Mínimo Desvio de IC) ]
                   │
                   ▼
[ 🏆 Times Finais Perfeitamente Balanceados & Prontos para o Jogo ]
```

### Detalhamento Sequencial por Etapa:
1. **Fila Inteligente de Presença e Prioridade (Os 12 da Partida):**
   - **Rodagem Imediata (Regra de Ouro):** Jogadores marcados como *Presentes* que NÃO participaram da última partida possuem prioridade absoluta de entrada.
   - **Volume Diário de Jogos:** Em caso de empate, prioriza quem jogou MENOS partidas no dia corrente.
   - **Tempo de Banco:** Persistindo o empate, entra o jogador há mais tempo consecutivamente fora de quadra.
   - **Ordem de Chegada:** Critério final para preenchimento das vagas de quadra.
2. **Garantia Posicional e Levantadores (Condições Mínimas de Geração):**
   - O pool de 12 sócios selecionados é validado quanto à presença de levantadores oficiais (0, 1 ou 2), ajustando dinamicamente a escalação (rodagem livre ou fixação de levantador temporário). Caso a composição seja inválida, a geração é impedida.
3. **Rating Híbrido Ponderado e Índice Composto (IC):**
   - O **IC (Índice Composto)** é a métrica soberana de balanceamento: **60% Habilidades Práticas** (Ataque, Defesa, Levantamento, Saque) + **40% Win Rate real** (Aproveitamento).
   - O **ELO de Carreira** acumula vitórias/derrotas (+20/-20) e bônus diário de presença (+50 pts) para o ranking oficial.
4. **Sorteio Base ABAB com Filtro de Gênero:**
   - Distribuição paritária inicial de gênero e intercalação por ordem decrescente de IC entre os Times A e B.
5. **Agente de Auto-Correção (Validação Pós-Sorteio):**
   - Identifica os 2 jogadores com menor soma de habilidades práticas (**Bottom 2**) e obriga sua separação em times opostos. Fiscaliza também o equilíbrio rígido de gênero (diferença máxima de $\pm 1$).
6. **Otimização Agressiva de Jogadores de Linha:**
   - Executa até 40 ciclos de varredura gananciosa trocando jogadores de linha de mesmo gênero para aproximar ao máximo os somatórios de IC, sem tocar nos levantadores.
7. **Motor de Sinergia Machine Learning:**
   - Varre o histórico completo de partidas aplicando um **decaimento temporal de 15 dias de meia-vida**. Identifica duplas com histórico de vitórias (Sinergia Positiva) ou derrotas (Sinergia Negativa / Atrito).
8. **Busca Local Avançada (100 Iterações):**
   - Realiza 100 iterações de trocas aleatórias de jogadores de linha, avaliando em tempo real o **desvio padrão de IC** e a **média de sinergia histórica**, preservando e consolidando a configuração final de maior equilíbrio técnico.

---

## 🤖 Atuação dos Agentes de IA e Machine Learning

- **Agente de Fila e Prioridade:** Gerencia a prioridade de entrada na quadra com base em ausência na última partida, volume diário e tempo de banco.
- **Agente de Auto-Correção (Rules Enforcement):** Atua como barreira soberana pós-sorteio, aplicando o *AUTO-FIX* para isolamento do Bottom 2 e paridade de gênero.
- **Motor de Sinergia (Machine Learning Simulator):** Analisa padrões históricos de desempenho entre duplas com decaimento temporal para penalizar atritos recorrentes e premiar duplas vitoriosas.
- **Agente de Otimização Global (Busca Local):** Ciclo iterativo estocástico que refina incessantemente o balanceamento de IC entre os times.

---

## 🛠️ Funções e Componentes Principais Envolvidos

- **Backend / Engine (`utils/teamLogic.ts`):**
  - `getPriorityQueue`: Seleciona os 12 atletas da partida com base nas regras de prioridade.
  - `generateTeams`: Orquestra o pipeline completo de formação e balanceamento de times.
  - `runAutoCorrectionAgent`: Executa a fiscalização e o *AUTO-FIX* do Bottom 2 e gênero.
  - `optimizeTeamSynergyIteratively`: Aplica a simulação iterativa de sinergia e busca local (100 iterações).
  - `calculateCompositePerformanceRating`: Calcula o Índice Composto (IC) de cada atleta.
- **Camada de Aplicação (`src/hooks/useAppLogic.ts`):**
  - Gerencia o estado global de sócios, presença, partidas, histórico e persistência no Firestore.
- **Componentes de Interface (`src/components/`):**
  - `TeamBalancingSimulatorCard`: Simulador visual de balanceamento de times na aba de manutenção.
  - `TeamCard`: Exibição detalhada dos lineups dos Times A e B.
  - `AdminView`: Painel administrativo com ferramentas de auditoria e configurações.

---

## 🎨 Paleta de Cores e Design System

- **Fundo Principal:** Preto Puro (`bg-black`). Todas las telas, modais e formulários devem usar fundo preto.
- **Cor Primária (Destaque):** Amarelo/Dourado (`brand-primary`). Utilizada para botões principais, ícones de destaque e elementos de vitória.
- **Cor Secundária:** Preto/Cinza Escuro (`brand-secondary`). Utilizada para containers secundários ou fundos com transparência.
- **Bordas:** Geralmente `border-brand-primary/40` ou `border-brand-primary/20`.
- **Texto:** Branco (`text-white`) para legibilidade geral, Amarelo (`text-brand-primary`) para nomes de destaque ou títulos importantes.
- **Tipografia:** Fonte Customizada **Formula 1** (fallback para Montserrat), Negrito/Black (`font-black`), Caixa Alta (`uppercase`), Espaçamento entre letras (`tracking-tight` ou `tracking-widest` para labels).
- **Indicadores de Desempenho:**
  - **Vitória (V):** Fundo Amarelo (`bg-brand-primary`), Texto Preto (`text-black`).
  - **Derrota (D):** Fundo Branco (`bg-white`), Texto Preto (`text-black`).
  - **Movimentação no Ranking:**
    - Subiu: Ícone 🟢 ⬆️ verde com o valor da variação.
    - Caiu: Ícone 🔴 ⬇️ vermelho com o valor da variação.
    - Mantém: Ícone ⚪ ➖0 neutro.

---

## 🧠 SKILL 1: Formação e Balanceamento de Times (Team Formation & Balancing)

### Objetivo
Garantir escalações e formações de partidas extremamente equilibradas, competitivas e imparciais.

### Diretrizes de Execução
1. **Fila Inteligente de Presença e Prioridade (Os 12 da Partida):**
   - **Rodagem Imediata (Regra de Ouro):** Jogadores marcados como *Presentes* que NÃO participaram da última partida possuem prioridade absoluta de entrada.
   - **Volume Diário de Jogos:** Em caso de empate, prioriza quem jogou MENOS partidas no dia corrente.
   - **Tempo de Banco:** Persistindo o empate, entra o jogador há mais tempo consecutivamente fora de quadra.
   - **Ordem de Chegada:** Critério final para preenchimento das vagas de quadra.
2. **Garantia Posicional e Levantadores (Condições Mínimas de Geração):**
   - Para que as partidas sejam geradas, o grupo de 12 sócios selecionados para a quadra deve atender obrigatoriamente a uma das seguintes condições de equilíbrio posicional:
     - **Caso 1 (2 Levantadores Oficiais + 10 Jogadores de Linha):** Sorteio padrão distribuindo os levantadores oficiais (1 em cada time).
     - **Caso 2 (12 Jogadores de Linha + 0 Levantadores):** O app perguntará se jogará "todo mundo levantando" (rodagem livre de levantamento) ou se escolherá um "levantador temporário" (os de maior habilidade serão fixados para equilibrar).
     - **Caso 3 (11 Jogadores de Linha + 1 Levantador Oficial):** O app perguntará se jogará "todo mundo levantando" ou se escolherá um "levantador temporário" para o outro time.
     - **Sem Condição Mínima:** Caso o pool de 12 jogadores não atenda a nenhuma destas três composições, a geração de partidas é impedida.
3. **Rating Híbrido Ponderado para Balanceamento:**
   - O equilíbrio técnico dos times utiliza uma **média ponderada**: **50% ELO Puro de Carreira** (descontado do bônus acumulado de fidelidade/presença) + **50% Índice Composto de Desempenho** (60% Habilidades Práticas + 40% Win Rate de aproveitamento).
   - O desconto do Bônus de Fidelidade no sorteio garante que a assiduidade do jogador valorize seu Ranking de Carreira sem inflar artificialmente seu nível no sorteio das partidas.
4. **Sorteio Base Alternado (ABAB com Filtro de Gênero):**
   - O sorteio monitora em tempo real a proporção de gênero nos Times A e B.
   - Força a distribuição paritária do mesmo gênero antes de aplicar a intercalação técnica por Eficiência Híbrida.
5. **Proteção Anti-Recorrência de Duplas:**
   - Aplica penalidade numérica no score de equilíbrio para formações com duplas ou trios repetidos da partida imediatamente anterior.

---

## 🛡️ SKILL 2: Agente de Auto-Correção e Fiscalização de Regras (Auto-Correction Agent)

### Objetivo
Camada soberana de validação pós-sorteio para garantir zero violação de restrições críticas.

### Diretrizes de Execução
1. **Separação Obrigatória dos Menos Experientes (Bottom 2):**
   - Mapeia os 2 jogadores com as menores Somas de Habilidades Práticas (Ataque + Defesa + Levantamento + Saque).
   - Valida se foram alocados em times opostos. Caso estejam no mesmo time, executa uma troca forçada ("AUTO-FIX").
2. **Fiscalização Rigorosa de Gênero:**
   - Impede desequilíbrios como 3 homens/mulheres em uma equipe e apenas 1 na outra.
   - A diferença máxima permitida entre o número de participantes de determinado gênero nos Times A e B é de +1/-1 em caso de contingente ímpar.
3. **Preservação de Levantadores e Restrições:**
   - O AUTO-FIX nunca pode trocar um levantador por um atacante de forma que deixe um time sem levantador, nem quebrar a contagem de gêneros.

---

## 📊 SKILL 3: Gestão de Atletas, Estatísticas e Ranking (Player Analytics & ELO Engine)

### Objetivo
Garantir o cálculo exato de métricas de desempenho e progressão de carreira dos atletas.

### Diretrizes de Execução
1. **Eficiência Técnica e Rating (Métrica Soberana de Balanceamento):**
   - **Ranking e Carreira (ELO):** Acumula ELO de vitórias/derrotas (+20/-20) + Bônus Diário de Presença (+50 pts). O ELO é utilizado para o Ranking de Carreira.
   - **Balanceamento de Quadra e Sorteio (IC - Índice Composto):** O critério soberano para o sorteio e balanceamento das partidas é o **IC (Índice Composto)**.
   - **Cálculo do IC:** 60% Habilidades Práticas (Ataque, Defesa, Levantamento, Saque) + 40% Win Rate real (Aproveitamento).
   - **Distribuição ABAB por Gênero:** A distribuição inicial de homens e mulheres segue rigorosamente a ordem decrescente de IC, alternando entre as equipes (maior IC no Time A, segundo maior no Time B, terceiro no Time A, e assim sucessivamente).
2. **Sistema ELO (Pontuação de Carreira):**
   - Vitória: **+20 pontos**.
   - Derrota: **-20 pontos**.
   - Bônus Diário de Presença/Fidelidade: **+50 pontos** para todos os participantes do dia.
3. **Critério Soberano de Desempate:**
   - Em caso de empate em pontos ELO, assume a posição superior no Ranking o atleta com **Menor Tempo em Quadra** (menor total de minutos jogados para atingir a pontuação).
4. **Histórico e Relatórios Diários:**
   - Mapeia variações de posição em tempo real (Comparativo de Ranking Acumulado e Diário).

---

## 🔐 SKILL 4: Autenticação, Cadastro e Controle de Acesso (Auth & Access Control)

### Objetivo
Gerenciar a identificação de sócios, perfis de acesso e autorização para ações administrativas sensíveis.

### Diretrizes de Execução
1. **Níveis e Perfis de Usuário:**
   - **ADMIN / DIRETORIA:** Acesso completo a cadastro de sócios, edição de habilidades, ajuste de placares, encerramento de partidas e auditorias.
   - **SÓCIO / JOGADOR:** Visualização de estatísticas, confirmação de presença diária e ranking.
2. **Controle de Acesso por PIN / Senha:**
   - Ações administrativas críticas (criação de torneio, reset de diária, exclusão de atleta) exigem validação de PIN/Chave de Segurança do Administrador.
3. **Cadastro e Perfil do Atleta:**
   - Mapeamento de Nome, Telefone, Posição Principal (Levantador Oficial, Atacante de Força), Nível de Impacto (1 a 3), Gênero e Habilidades Práticas (1 a 5).
4. **Persistência de Sessão:**
   - Manutenção do estado de login via LocalStorage/Firestore Auth, garantindo que o usuário não perca a sessão ao atualizar a página.

---

## 🗄️ SKILL 5: Armazenamento, Comunicação e Banco de Dados (Database & Sync Engine)

### Objetivo
Assegurar a integridade, sincronização em tempo real e persistência durável no Firestore.

### Diretrizes de Execução
1. **Estrutura de Coleções no Firestore:**
   - `players`: Dados cadastrais, ELO acumulado, TrueSkill, estatísticas gerais e habilidades.
   - `matches`: Histórico completo de partidas finalizadas (escalação, placar, horário, duração e deltas de ELO).
   - `daily_rankings`: Snapshots e relatórios de desempenho por data (`YYYY-MM-DD`).
   - `system_config`: Configurações de sistema, PINs de admin e status da quadra.
2. **Trava de Sincronização e Prevenção de Concorrência:**
   - Durante salvamentos de partidas ou novos sorteios, exibe o indicador visual **"Guerreiros Intelligence"** e desabilita botões para evitar envios duplicados (*race conditions*).
3. **Recuperação e Auditoria Retroativa:**
   - Permite a re-execução do motor de cálculo em caso de correções no histórico diário sem corromper o banco de dados.
4. **Tratamento de Erros de Conectividade:**
   - Mecanismo de re-tentativa transparente com alertas visuais amigáveis em caso de oscilações na rede.

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

---

## 🏆 SKILL 7: Gestão de Torneios e Eventos Especiais

### Objetivo
Automatizar a criação de chaves (brackets), tabelas e regras específicas para torneios internos que fogem ao racha diário.

### Diretrizes de Execução
1. **Sorteio de Grupos por Potes:** Realiza o sorteio de grupos baseado em potes de nível técnico, utilizando as métricas de performance das Skills 3 e 6 para garantir grupos equilibrados.
2. **Critérios de Desempate:** Controle automático de saldo de sets, pontos e confronto direto para definições de classificação.
3. **Geração de Horários:** Criação automática de cronograma de partidas respeitando intervalos de descanso e disponibilidade de quadra.

## 🛠️ Diretrizes Gerais de Implementação
- **Proteção de Sincronização:** Durante o envio de dados ou geração de times, desabilitar botões críticos com o indicador visual "Guerreiros Intelligence" para evitar duplo clique ou corrupção de estado.
- **Tailwind CSS First:** Sempre priorizar o uso de classes utilitárias do Tailwind CSS sem introduzir arquivos CSS adicionais.
- **Respeito ao Tema:** Manter o efeito "vazado" em indicadores de status (fundo colorido com texto na cor do fundo principal, preto) e utilizar exclusivamente a paleta oficial Amarelo/Preto/Branco.
