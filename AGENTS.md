# Padrão de Design, Regras de Negócio e Protocolos de Modificação

Este documento detalha o padrão visual, a arquitetura de dados, os fluxos de autenticação e os protocolos operacionais utilizados pelos Agentes de IA para a manutenção e evolução do Guerreiros Volleyball Club.

---

## 🛑 PROIBIÇÃO ABSOLUTA DE DADOS SIMULADOS (REGRA DE OURO)
- **Nunca** utilize dados simulados, sintéticos, gerados por script ou inventados para partidas, histórico ou estatísticas.
- **Sempre** utilize dados reais extraídos diretamente das interações e registros do clube.
- **Verificação de Presença Obrigatória:** Qualquer partida ou histórico deve ser validado contra a **lista de presença oficial** (`attendance` collection) do respectivo dia. Nenhum atleta que não conste na lista de presença do dia pode figurar como participante em partidas daquela data.
Antes de executar QUALQUER alteração, a IA DEVE seguir estritamente este fluxo:

1. **ANÁLISE DE IMPACTO:** Identifique os arquivos e funções que serão alterados. Se a alteração envolver `App.tsx`, a IA deve planejar a extração do código para um arquivo isolado antes de editá-lo.
2. **PLANO DE EXECUÇÃO:** Apresente um plano de no máximo 3 etapas. Não comece a codificar antes do usuário confirmar.
3. **ISOLAMENTO:** Jamais altere uma funcionalidade se ela estiver dentro de um componente genérico (como `App.tsx`) sem antes refatorá-la para um componente ou hook dedicado.
4. **ZONAS DE NÃO INTERFERÊNCIA:** 
    - **Filtro de Sócios Ativos:** Na lista de presença e na seleção para convocar (chamada, intenções e presenças pública/interna), SOMENTE sócios com status de cadastro estritamente ATIVO (`status === 'active'`) podem ser exibidos ou selecionados. Sócios com status Inativo (`status === 'inactive'`), DM (`status === 'dm'`), Departamento Médico ou Lista de Espera (`status === 'waiting'`) são estritamente proibidos de figurar em qualquer lista de presença ou convocação. Atualmente o clube conta com 30 sócios ativos.
    - **Verificação e Comunicação Direta:** Após QUALQUER alteração, o agente deve validar o código (linter e build). A resposta enviada ao usuário NÃO deve detalhar arquivos modificados nem relatórios de testes, informando apenas que a solicitação foi verificada e testada com sucesso.
    - **Proibido "God Components":** É proibido adicionar lógica de negócio diretamente no `App.tsx`.
    - **Regra do Arquivo Único:** Todo componente novo deve ter seu próprio arquivo em `/src/components/`. Todo hook novo deve ir para `/src/hooks/`.
    - **`utils/teamLogic.ts`:** Nenhuma alteração sem revisão de impacto sobre as regras de "Bottom 2" e "Levantadores".

---

### 🔒 Protocolo de Integridade, Imutabilidade e Ordenação de Partidas (Obrigatório)

Para garantir a confiabilidade absoluta do histórico e dos rankings do Guerreiros Volleyball Club, qualquer manutenção, consulta ou alteração relacionada a partidas deve seguir estritamente estas diretrizes de segurança e ordenação:

1. **Imutabilidade Controlada e Correção de Erros de Operador (`matches`):**
   - Partidas finalizadas são protegidas contra sobrescritas automáticas, scripts de reset diário ou heurísticas em massa.
   - **Exceção Autorizada (Correção de Operador):** Caso ocorra um erro de marcação pelo operador (placar incorreto ou vitória invertida entre Time A e B), a edição pontual da partida específica é permitida, **desde que** acionada de forma intencional e controlada (via interface administrativa ou script de ajuste pontual), garantindo a atualização consistente do ELO e das estatísticas dos atletas envolvidos.
   - O histórico de datas anteriores deve ser preservado e corrigido apenas cirurgicamente quando solicitado.

2. **Ordenação Cronológica e Integridade de Data (`date`):**
   - Toda partida deve ser gravada com a data calculada via `getFirestoreDateKey()`, baseada estritamente no fuso horário de Brasília (`America/Sao_Paulo`).
   - **Protocolo de Sincronização Diária:** O contador de partidas (`dailyMatchCount`) e a sequência (`dailyNumber`) devem ser filtrados estritamente pela data atual (`date === getFirestoreDateKey()`), ignorando partidas de sessões passadas presentes no cache do estado local.
   - O sistema de reset automático (`server.ts`) deve rotacionar o `lastResetDate` e o `dailyMatchCount` assim que a data atual ultrapassar a data da última sessão.

3. **Ordenação Cronológica Estrita (`timestamp`):**
   - Toda listagem, cálculo de ranking ou renderização no componente de histórico (`HistoryView`) deve ordenar as partidas obrigatoriamente por `timestamp` crescente (`(a, b) => (a.timestamp || 0) - (b.timestamp || 0)`), garantindo a sequência real em que os jogos ocorreram na quadra.

3. **Validação de Data Redundante (Resiliência de Fuso):**
   - O filtro de partidas por data deve cruzar o campo `m.date` com a conversão explícita do `timestamp` para o fuso horário oficial de Brasília (`America/Sao_Paulo`), prevenindo falsos vazios causados por divergências de UTC ou fusos locais.

4. **Auditoria Obrigatória em Caso de Discrepância:**
   - Antes de efetuar qualquer alteração no pipeline de salvamento de partidas, o agente deve utilizar ferramentas de auditoria e cruzamento (`Sync Debugger`) para garantir que o número de partidas no Firestore coincida com o volume registrado no Store e nas estatísticas dos atletas.

5. **Proteção contra Estado Obsoleto e Duplicidade (Concurrency Protection):**
   - Ao finalizar (`handleFinishMatch`) ou excluir (`deleteMatch`) uma partida, o sistema deve obrigatoriamente buscar o estado mais atual do jogador no banco de dados (ou store centralizado) antes de aplicar os incrementos/decrementos de estatísticas. É proibido confiar cegamente nos objetos de jogador vindos do resultado da geração de times para realizar cálculos de saldo de ELO ou contagem de partidas.
   - **Trava de Sincronização:** Toda ação de escrita no banco de dados deve ser protegida pelo estado `isSyncing`. O botão de finalização de partida deve ser desabilitado e exibir um estado de carregamento ("SINCRONIZANDO...") imediatamente após o primeiro clique, prevenindo que cliques múltiplos ou instabilidades de rede gerem registros duplicados ou estatísticas infladas.

6. **Auto-Heal e Recuperação de Integridade:**
   - Em caso de discrepância entre o contador de partidas exibido no perfil do jogador e o número real de partidas registradas na coleção `matches` para o dia, o agente deve priorizar o reprocessamento baseado nos documentos de partida (Fonte da Verdade).

---

## 📋 Integridade da Lista de Intenção e Ordenação por Chegada

O gerenciamento da lista de intenção (quem "VAI" ou "NÃO VAI" jogar) deve seguir regras rígidas de transparência e ordem cronológica:

1. **Horário de Confirmação (Timestamp de Intenção):**
   - O horário exibido ao lado do nome do sócio é estritamente o **horário de confirmação na lista de intenção** para a sessão/data atual.
   - **Proibição de Fallback de Cadastro:** É terminantemente proibido utilizar o timestamp de criação do sócio ou de registros de partidas passadas como substituto na ausência do horário de intenção atual. Se não houver horário na sessão, o campo deve permanecer vazio ou mostrar o status de processamento.

2. **Mecanismo de Auto-Heal de Timestamps:**
   - Caso um sócio confirme presença através do fluxo de Pré-Confirmação (`preConfirmations`), seu horário original deve ser propagado para o documento de intenções (`metadata/intentions`). Se o horário estiver ausente na interface de intenções, o sistema deve tentar recuperá-lo automaticamente da base de pré-confirmações da semana vigente.

3. **Protocolo de Imutabilidade (Proteção de Fila):**
   - Uma vez confirmada a presença, o horário original deve ser preservado. Ações administrativas ou cliques repetidos de re-confirmação **NÃO** podem sobrescrever o horário inicial, protegendo o direito de prioridade por ordem de chegada.
   - **Resolução de IDs (Aliases):** O sistema deve cruzar o `uid`, `email` e `canonicalId`. Em caso de múltiplos timestamps para o mesmo sócio na mesma sessão, prevalece sempre o **mais antigo**.

4. **Trava de Re-confirmação:**
   - O sistema deve impedir tecnicamente que um sócio já confirmado execute uma nova ação de confirmação, exibindo uma mensagem informativa e desabilitando os controles visuais.

5. **Automação de Lembretes (Push Notifications):**
   - **Agendamento Fixo:** Disparos automáticos às **10:00** e **16:00** nos dias de partida.
   - **Filtro de Destinatários:** Apenas sócios com status `active` que ainda constam como "Indecisos" (sem resposta GOING ou NOT_GOING na sessão).

6. **Unicidade de Registro de Sócio (Proibição de Chaves Duplicadas / Falsos Convidados):**
   - Todo sócio ativo que confirma presença deve constar estritamente uma única vez na lista de confirmados, sob o seu nome e ID canônico (`p.id`).
   - É expressamente proibido propagar ou exibir o UID de autenticação ou o e-mail do atleta como registros adicionais de 'Convidado'.
   - O pipeline de intenções deve consolidar confirmações originadas por UID ou e-mail diretamente no ID mestre do sócio e expurgar chaves de alias redundantes da visualização de confirmados e da lista de exportação do WhatsApp.

---

## 🔄 Pipeline Sequencial de Geração e Balanceamento de Partidas

O processo de escalação e balanceamento de partidas do Guerreiros Volleyball Club opera através de um pipeline sequencial determinístico e inteligente, englobando seleção de fila, sorteio posicional, agentes de auto-correção, otimização de linha e busca local por Machine Learning:

1. **Fila Inteligente (Os 12 da Partida):**
   - **Rodagem Imediata (Regra de Ouro):** Jogadores presentes que NÃO participaram da última partida possuem prioridade absoluta de entrada (`playedLastMatch === false`).
   - **Trava de Partidas Consecutivas em Quadra (Anti-Monopólio / Rodagem Equitativa):** Quando dois ou mais atletas jogaram a última partida, prioriza quem disputou MENOS partidas consecutivas seguidas (`consecutivePlayed`). Atletas com 2 ou mais partidas consecutivas em quadra têm prioridade obrigatória de ir para o banco quando há reservas, impedindo que sócios de linha acumulem jogos ininterruptos enquanto outros aguardam.
   - **Prioridade de Saída Antecipada:** Atletas com horário de saída agendado (`departureTime`) recebem prioridade de quadra para completarem seus jogos antes de saírem.
   - **Volume Diário de Jogos:** Em caso de empate, prioriza quem jogou MENOS partidas no dia corrente (`dailyMatches`).
   - **Tempo de Banco:** Persistindo o empate, entra o jogador há mais tempo consecutivamente fora de quadra (`consecutiveBenched`).
   - **Ordem de Chegada:** Critério final para preenchimento das vagas de quadra (`arrivalOrder`).

2. **Garantia Posicional e Levantadores (Condições Mínimas de Geração):**
   - O pool de 12 sócios selecionados é validado quanto à presença de levantadores oficiais (0, 1, 2 ou mais).
   - **Histórico e Transição de Função:** O status de levantador é rastreado através do campo `isOfficialSetter` e validado cronologicamente pelo `setterStartDate`. Para partidas passadas, a detecção da função deve ignorar o status atual e basear-se no registro histórico da partida ou na data de início da função.
   - Quando houver 2 ou mais levantadores oficiais entre os 12 selecionados (ex.: 3 levantadoras), os 2 de maior prioridade/nível são fixados como levantadores das Equipes A e B (1 por time).
   - Levantadores oficiais excedentes (3º, 4º, etc.) participam da partida atuando normalmente como jogadores de linha, garantindo que NENHUM time fique sem levantador principal.
   - Ajusta dinamicamente a escalação quando houver 0 ou 1 levantador oficial para rodagem livre ou fixação de levantador temporário (os de maior habilidade são fixados para equilibrar).
   - Se a composição for inválida ou não atender às condições mínimas, a geração é impedida.

3. **Cálculo do Índice Composto (IC) e Rating Híbrido:**
   - **IC (Métrica Soberana de Balanceamento):** 80% Habilidades Práticas (Ataque, Defesa, Levantamento, Saque) + 20% Win Rate real (Aproveitamento).
   - **Ponderação Técnica Dinâmica:** Utiliza pesos oficiais (Ataque/Levantamento 30%, Defesa/Saque 20%) que se ajustam dinamicamente baseados no **Volume de Partidas** (`volumeFactor`) e no **Índice de Versatilidade** do atleta.
   - **Multiplicador de Competência:** O IC final é ponderado pelo `impactLevel` do sócio (Multiplicador de 1.0 a 1.45), garantindo que atletas de Elite tenham seu peso técnico validado e atletas de Base tenham um teto de impacto para evitar inflação artificial do ELO.
   - **Bônus de Versatilidade:** Atletas experientes (alto volume) com habilidades equilibradas recebem um boost de até 4 pontos de IC, refletindo sua utilidade tática superior.
   - **ELO de Carreira:** Acumula vitórias (+20), derrotas (-20) e bônus diário de presença (+50 pts) para o ranking oficial.
   - **Equilíbrio Exclusivo por IC / ID (SEM ELO):** O equilíbrio das equipes na pré-visualização e geração dos times é calculado estritamente pelo Índice Composto (IC) baseado nas habilidades práticas declaradas (Ataque, Defesa, Levantamento, Saque) e aproveitamento real (Win Rate). O ELO NÃO é utilizado na pré-visualização nem na geração de times, sendo reservado exclusivamente para o ranking de carreira e premiação.

4. **Sorteio Base ABAB com Filtro de Gênero:**
   - Distribuição intercalada por ordem decrescente de IC/Rating entre os Times A e B.
   - Monitoramento em tempo real da proporção de gênero para garantir distribuição paritária.

5. **Agente de Auto-Correção Soberano (Auto-Fix com Prioridade em Blocos):**
   - **Hierarquia Estrita de Distribuição (Regra do Bloco em Cascata):** A prioridade absoluta do motor de escalação é garantir a distribuição equilibrada dos extremos antes de otimizar o IC dos jogadores intermediários. O sistema opera em níveis em cascata:
     - **Nível 1 (Prioridade Máxima e Paridade Estrita):** Distribuição uniforme obrigatória do **Top 4** (exatamente 2 atletas de elite em cada time) e do **Bottom 4** (exatamente 2 atletas da base em cada time) estritamente sobre os 10 jogadores de linha.
     - **Nível 2:** Equilíbrio do **Top 2** (1 em cada time) e do **Bottom 4**.
     - **Nível 3:** Equilíbrio do **Top 2** (1 em cada time) e do **Bottom 2** (1 em cada time).
   - **Regra de Ouro (Foco na Linha):** Quando houver 2 levantadores oficiais fixados em quadra, o cálculo dos conjuntos de balanceamento (`topTwoIds`, `bottomTwoIds`, `top4Ids`, `bottom4Ids`) incide obrigatoriamente sobre os **10 jogadores de LINHA**. Isso impede que uma levantadora oficial ocupe vagas de Top ou Bottom da linha, permitindo equilíbrio real no passe e ataque.
   - **Paridade Uniforme de Classificação de Impacto (Tops e Bottoms):** Assim como a paridade de gênero, a distribuição dos atletas com classificação cadastral de Elite (`impactLevel === 3`) e Base (`impactLevel === 1`) opera sob o princípio de distribuição paritária com diferença máxima de ±1 entre as equipes. Caso haja número ímpar, o algoritmo aplica o contrapeso inteligente (o time com +1 Elite recebe +1 atleta de Base), estabilizando a balança técnica de IC.
   - **Fiscalização Paritária de Gênero Blindada:** Garante equilíbrio rígido (diferença máxima de ±1 entre as equipes), operando trocas de mesmo gênero que preservem intacto o isolamento e a distribuição dos blocos de Top e Bottom.
   - **Garantia Soberana Final:** Caso ocorra qualquer conflito durante a convergência, trocas corretivas obrigatórias de mesmo gênero são disparadas para restaurar a separação hierárquica dos blocos mantendo a paridade de gênero.

6. **Otimização Agressiva de Jogadores de Linha:**
   - Executa ciclos de varredura gananciosa trocando jogadores de linha de mesmo gênero para aproximar ao máximo os somatórios de IC, sem tocar nos levantadores.

7. **Motor de Sinergia Machine Learning (Atuação Estrita em Intermediários):**
   - Varre o histórico completo de partidas aplicando um decaimento temporal de 15 dias de meia-vida.
   - Identifica padrões de vitórias (Sinergia Positiva) ou derrotas (Sinergia Negativa / Atrito) entre duplas.
   - **Trava de Não Interferência Hierárquica:** A sinergia atua exclusivamente entre atletas intermediários de mesmo nível e gênero, sendo estritamente proibida de envolver atletas do Top 2 ou Bottom 2.

8. **Busca Local Avançada (100 Iterações), Trava Categórica e DNA Tático:**
   - Realiza 100 iterações de trocas aleatórias de jogadores de linha, avaliando em tempo real o desvio padrão de IC, o equilíbrio de perfil tático (Sugestão A) e a média de sinergia histórica para consolidar a configuração final de maior equilíbrio técnico.
   - **Otimização de DNA Tático:** Prioriza formações onde a força ofensiva (Ataque + Saque) e defensiva (Defesa + Levantamento) estejam equilibradas entre os times, evitando a formação de "times tortos" (ex: um time só de atacantes contra um time só de passadores).
   - **Trava Blindada de Troca Segura (`isCategorySwapSafe`):** Nenhuma iteração de busca local, otimização gananciosa ou sinergia tem permissão para trocar atletas entre categorias desiguais (`bottomTwoIds`, `topTwoIds`, `top4Ids`, `bottom4Ids`) ou funções (`isOfficialSetter`). Isso impede matematicamente que o isolamento do Bottom 2 seja desfeito após a autocorreção.

---

## 🔍 Auditoria e Diagnóstico Técnico (Guerreiros Intelligence)

Para garantir total transparência no motor de balanceamento e facilitar a correção de distorções de nível:

1. **Painel de Auditoria Visual (`PreviewTeams`):**
   - O aplicativo dispõe de um modo de **"Auditoria de Escalação (IC/Skills)"** acessível durante a geração de partidas na visualização de times.
   - Ao ser ativado, exibe para cada atleta: Habilidades Brutas (1-5), Tech Score %, Win Rate Real, Multiplicador de Nível e Bônus de Versatilidade aplicados.
   - **Finalidade:** Identificar visualmente por que um jogador foi classificado como "Forte" ou "Fraco" antes de confirmar a partida.

2. **Verificação Estatutária em Tempo Real (`verifyClubGenerationRules`):**
   - Tanto no `PreviewTeams` quanto no `CourtTabletView`, os 3 pilares estatutários são auditados antes da bola subir:
     - **Levantadores:** Exatamente 1 oficial por equipe (quando houver 2 ou mais em quadra).
     - **Paridade de Gênero:** Diferença máxima de ±1 entre times.
     - **Top / Bottom:** Separação obrigatória de destaques e atletas da base.
   - Em caso de descumprimento, badges de alerta vermelhos piscam na tela indicando a violação.

3. **Logs de Auditoria de Console (`[IC AUDIT] / [ELO AUDIT]`):**
   - O sistema dispara logs automáticos no console durante a geração para atletas com IC > 75 ou nomes específicos solicitados para auditoria (ex: "Ana Maria").
   - Registra o detalhamento matemático da normalização técnica, pesos aplicados e do cálculo do IC final.

4. **Trava de Sincronização e Auditoria de ELO:**
   - Toda alteração de ELO é auditada cronologicamente. Discrepâncias entre o saldo de vitórias/derrotas e o ELO atual disparam alertas no pipeline de dados.

---

## 🏆 Sistema Oficial de MVP e Eficiência (Fórmula B-1: Desempenho Técnico + Volume)

O cálculo do sócio Mais Valioso (**MVP - Most Valuable Player**) tanto no âmbito diário (**MVP da Rodada / Sessão**) quanto acumulado (**MVP Geral / Carreira**) utiliza a metodologia calibrada **Opção B-1**:

1. **Objetivo e Princípios:**
   - Premiar quem alia técnica apurada, alta taxa de vitórias e saldo expressivo de pontos (domínio de quadra), com bonificação por assiduidade e volume de jogos disputados.
   - Evita distorções de atletas com pouquíssimas partidas e 100% de aproveitamento superarem atletas consistentes e ativos que jogaram a rodada inteira.

2. **Composição da Fórmula (Score B-1):**
   $$\text{Score B-1} = \text{Pilar Desempenho} + \text{Pilar Volume}$$
   - **Índice Composto (IC):** Combina 80% das habilidades práticas declaradas (Ataque, Defesa, Levantamento, Saque na escala de 4 a 20 convertida para base 0-100) + 20% da taxa de vitórias real do atleta no período:
     $$\text{IC} = (\text{Skills} / 20 \times 100 \times 0.8) + (\text{Win Rate \%} \times 0.2)$$
   - **Saldo Médio de Pontos:** Saldo de pontos pró menos pontos contra, dividido pelas partidas disputadas:
     $$\text{Saldo Médio} = \frac{\text{Pontos Pró} - \text{Pontos Contra}}{\text{Partidas}}$$
   - **Pilar Desempenho:**
     $$\text{Pilar Desempenho} = \text{IC} + (\text{Saldo Médio} \times 1.5)$$
   - **Pilar Volume (Participação e Compromisso):**
     - **Na Sessão Diária:** $+2.0\text{ pontos}$ por cada partida disputada no dia.
     - **Na Carreira / Geral:** Escala progressiva de até 15 pontos adicionais com teto de 45 partidas: $\min\left(15, \frac{\text{Partidas}}{45} \times 15\right)$.

3. **Integração no Sistema e Visualização:**
   - **Destaques no Ranking (`RankingView`):** O cartão de MVP exibe o `Score B-1` com 1 casa decimal e a taxa de vitórias do atleta líder.
   - **Filtro de Ordenação:** O seletor de métricas do ranking inclui a opção dedicada **MVP (B-1)** ao lado de ELO, Vitórias e % Vitórias.
   - **Tabela do Ranking:** Ao ordenar por `MVP (B-1)`, a coluna de eficiência exibe o valor numérico do Score B-1 formatado para cada atleta.
   - **Módulo de Cálculo:** Centralizado em `utils/statsLogic.ts` através das funções `calculateMvpEfficiencyScore` e `calculatePlayerCompositeIndex`.

---

## 🔄 Sincronização Automática de Dados e Perfis

Para evitar inconsistências entre o cadastro do sócio e as listas de operação diária:

1. **Propagação de Mudança de Função:**
   - Ao salvar alterações no perfil de um sócio (`savePlayer`), se houver mudança no status de `isOfficialSetter`, o sistema deve propagar automaticamente essa alteração para o documento do sócio na lista de presença (`attendance`) do dia atual (se o sócio estiver presente).
   - Isso garante que a sinalização visual de Levantador ("L") e a lógica de sorteio estejam sempre em sincronia com o cadastro mestre sem necessidade de check-in manual redundante.

2. **Rastreamento de Eficiência (Melhor Levantador):**
   - O ranking de levantadores utiliza o utilitário `calculateSetterStats`, que audita as partidas reais onde o atleta atuou na função (identificado nos campos `setterA` / `setterB` da partida), garantindo que as estatísticas reflitam o desempenho técnico real na posição.
   - **Filtro Estrito de Sócia Ativa (`status === 'active'`):** Apenas atletas com status de cadastro estritamente ativo concorrem ao título de Melhor Levantador (Geral e Diário). Sócias inativas ou em licença são desconsideradas da disputa.
   - **Ponderação por Volume e Consistência (Setter Score):** Para evitar que participações esporádicas ou isoladas de jogadoras de linha inflem o ranking, o cálculo de eficiência adota o **Setter Score** (aliando taxa de vitórias na função e pilar de volume progressivo):
     $$\text{Setter Score (Geral)} = (\text{WinRate}_{\text{setter}} \times 0.60) + \min\left(40, \frac{\text{Partidas}_{\text{setter}}}{50} \times 40\right)$$
     $$\text{Setter Score (Diário)} = (\text{WinRate}_{\text{setter}} \times 0.70) + \min\left(15, \text{Partidas}_{\text{setter}} \times 2.5\right)$$
   - **Piso de Elegibilidade Representativa no Geral:** Prioriza atletas com volume representativo de atuação na função ($\ge 20$ partidas como levantadora) ou levantadoras oficiais ativas (`isOfficialSetter === true`), garantindo o devido reconhecimento para as atletas regulares do clube.
   - **Transparência no Card:** O destaque exibe com precisão o volume e o aproveitamento real da posição: `XV (YJ) • Z% Vitórias`.

---

## 🎨 Paleta de Cores, Design System e Regras de Layout (Identidade Visual)

- **CONFORMIDADE DE LAYOUT (REGRA SOBERANA):** Toda e qualquer inclusão, modificação ou alteração de layout de todo o aplicativo DEVE obedecer rigorosamente às regras, padrões visuais e layouts já implantados no projeto. Não é permitido introduzir cores fora da paleta ou alterar estruturas de navegação consolidadas.
- **Alto Contraste e Tipografia:**
  - **Letras e Rótulos:** Toda a tipografia de rótulos, botões, opções de menu e textos do aplicativo deve utilizar **letras brancas de alto contraste** (`text-white` ou `text-zinc-100`) sobre fundos escuros (`bg-black` ou `bg-zinc-900/90`), garantindo máxima legibilidade.
  - **Itens Selecionados / Destaques:** O elemento ativo/selecionado deve utilizar o fundo Amarelo/Dourado oficial do clube (`brand-primary` / `#F5C429`) com texto em preto e negrito (`text-black font-black`).
- **Fundo Principal:** Preto Puro (`bg-black`).
- **Cor Primária (Destaque):** Amarelo/Dourado (`brand-primary`).
- **Cor Secundária:** Cinza Escuro (`brand-secondary`).
- **Navegação e Layout Responsivo:**
  - **Menu Lateral Desktop:** O menu lateral fica fixado no PC (`w-64`) sem sobrepor ou cobrir o conteúdo do app. O container do conteúdo principal utiliza recuo de margem (`md:pl-64`) para manter total visibilidade do cabeçalho e dos cartões.
  - **Navegação Mobile:** Barra inferior fixa (`md:hidden fixed bottom-0`) com ícones e rótulos legíveis em caixa alta.
- **Bordas e Vidro (Glassmorphism Escuro):**
  - Containers utilizam fundo escuro translúcido com desfoque de fundo (`bg-zinc-900/90 backdrop-blur-xl`), bordas finas (`border-white/10`) e cantos arredondados (`rounded-2xl`).
- **Tipografia:** Fonte Customizada **Formula 1** (fallback Montserrat), Negrito/Black, Caixa Alta (Uppercase).
- **Indicadores de Desempenho:**
  - Vitória (V): Fundo Amarelo, Texto Preto.
  - Derrota (D): Fundo Branco, Texto Preto.
  - Movimentação no Ranking: Ícones 🟢 ⬆️, 🔴 ⬇️, ou ⚪ ➖.

---

## 🛡️ Proteção de Regras e CI/CD (Anti-Regressão)

Para garantir que as regras de negócio de balanceamento nunca sofram regressões durante manutenções, o projeto utiliza um pipeline automatizado de verificação pré-commit:

1. **Husky & Lint-Staged:**
   - **Pre-commit Hook:** Antes de cada commit, o Husky dispara automaticamente a verificação de tipagem (`tsc --noEmit`) e a suíte de testes de integração das regras de time.
   - **Interrupção de Commit:** Se qualquer teste falhar ou houver erro de TypeScript, o commit é bloqueado até que a integridade seja restaurada.

2. **Suíte de Testes de Integração (`scripts/verify-team-rules.ts`):**
   - **Simulação de Cenários Reais:** O script simula pools de atletas com características que desafiam o algoritmo (ex: excesso de levantadoras, disparidade técnica extrema na linha, desequilíbrio de gênero).
   - **Validação de Pilares:** O teste valida programaticamente se o `generateTeams` respeita a Soberania do Bottom 2, a paridade de gênero e a distribuição de levantadores.
   - **Fiscalização da Auditoria:** Garante que a função `verifyClubGenerationRules` identifique corretamente violações simuladas.

3. **Fluxo de Trabalho Obrigatório:**
   - Ao modificar `utils/teamLogic.ts`, o agente deve obrigatoriamente rodar `npm run test:rules` e `npm run test:load` localmente antes de finalizar a tarefa.
   - O teste de carga (`test:load`) simula 100 partidas consecutivas para verificar se o sistema mantém a integridade do ELO (soma zero) e a equidade no rodízio de levantadores e jogadores.
   - É proibido desabilitar os hooks de Git (`--no-verify`) para contornar falhas de lógica.

---

## 📊 Auditoria de Partidas Acumuladas, Sinergias e Integridade Diária

Para garantir a transparência histórica e a exatidão estatística de todos os sócios:

1. **Ranking Acumulado Dinâmico (Coleção `matches` como Fonte da Verdade):**
   - O ranking acumulado consolida dinamicamente todas as partidas disputadas desde a fundação do clube diretamente da coleção `matches`.
   - O cômputo de partidas disputadas (`matchesPlayed`), vitórias (`wins`), derrotas e saldo de pontos para ordenação e exibição na tabela baseia-se nas estatísticas calculadas dinamicamente das partidas efetivas (`topStats.dailyStats`), prevenindo que documentos de atletas com contadores desatualizados distorçam o ranking.
   - Discrepâncias acumuladas são auditadas e sincronizadas diretamente contra os documentos da coleção `matches`.

2. **Exibição de Menores Taxas de Sucesso (Atrito / Menor Aproveitamento em Dupla):**
   - O `RankingView` apresenta a métrica de **Menores Taxas de Sucesso** ao lado das Melhores Parcerias e Maiores Rivalidades:
     - **Painel Visual:** Card dedicado com indicador de tendência descendente (`TrendingDown`), exibindo as 5 duplas com menor aproveitamento percentual, saldo de vitórias/derrotas e volume de partidas disputadas juntas.
     - **Relatório WhatsApp (`handleCopyTextSummary`):** Seção dedicada exportando as duplas com menor taxa de vitórias no período (sessão ou acumulado).
   - **Critério de Elegibilidade:** Mínimo de 1 partida em sessões diárias e 2 partidas no ranking acumulado, ordenando por menor taxa de vitória e pontuação bayesiana (Laplace smoothing).

3. **Validação Resiliente de Fuso Horário nos Resultados Diários:**
   - As rotinas de recuperação e auditoria de estatísticas diárias (`recalculateDailyStats` em `useAppLogic.ts`) utilizam conversão explícita baseada no fuso de Brasília (`America/Sao_Paulo`) para cruzar `m.date` e `m.timestamp`, garantindo que nenhuma partida do dia seja desconsiderada por variações de formato (data simples vs ISO) ou deslocamento de fuso.

---

## 🛠️ Componentes e Backend Principais

- **`utils/teamLogic.ts`:** O cérebro do app. Contém toda a lógica de `generateTeams`, `runAutoCorrectionAgent` e simuladores de sinergia.
- **`src/hooks/useAppLogic.ts`:** Gerencia o estado global, persistência no Firestore e integra os dados dos sócios com as partidas.
- **`src/components/TeamBalancingSimulatorCard.tsx`:** Ferramenta administrativa para auditar a eficácia do algoritmo de balanceamento.

---

## 🛡️ Diretrizes Gerais de Implementação
- **Fidelidade ao Layout Existente:** Toda inclusão, modificação ou alteração de layout de todo o aplicativo DEVE obedecer rigorosamente às regras, padrões visuais e layouts já implantados.
- **Proteção de Sincronização:** Exibir sempre o indicador visual "Guerreiros Intelligence" e desabilitar controles durante salvamentos ou sorteios.
- **Respeito ao Tema:** Manter o efeito "vazado" em status e utilizar exclusivamente a paleta oficial.
- **Tailwind CSS First:** Prioridade absoluta para classes utilitárias sem arquivos CSS extras.
