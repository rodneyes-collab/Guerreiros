# Padrão de Design e Cores do App

Este documento detalha as diretrizes visuais do aplicativo para garantir consistência em futuras edições e novas telas. O tema atual é **Escuro (Dark Mode)**.

## Paleta de Cores

- **Fundo Principal:** Preto Puro (`bg-black`). Todas as telas, modais e formulários devem usar fundo preto.
- **Cor Primária (Destaque):** Amarelo/Dourado (`brand-primary`). Utilizada para botões principais, ícones de destaque e elementos de vitória.
- **Cor Secundária:** Preto/Cinza Escuro (`brand-secondary`). Utilizada para containers secundários ou fundos com transparência.
- **Bordas:** Geralmente `border-brand-primary/40` ou `border-brand-primary/40`.
- **Texto:** Branco (`text-white`) para legibilidade geral, Amarelo (`text-brand-primary`) para nomes de destaque ou títulos importantes.

## Componentes Específicos

### Indicadores de Performance
- **Vitória (V):** Fundo Amarelo (`bg-brand-primary`), Texto Preto (`text-black`).
- **Derrota (D):** Fundo Branco (`bg-white`), Texto Preto (`text-black`).

### Containers e Cards
- **Cards de Time:** Fundo preto, bordas sutis em amarelo, cantos arredondados generosos (`rounded-[2rem]` ou `rounded-[3rem]`).
- **Containers de Batalha (B1, B2, etc.):** Fundo preto.
- **Inputs e Formulários:** Fundo preto ou cinza muito escuro, bordas brancas/amarelas com baixa opacidade.

## Tipografia
- **Estilo:** Fonte Customizada **Formula 1** (fallback para Montserrat), Negrito/Black (`font-black`), Caixa Alta (`uppercase`), Espaçamento entre letras (`tracking-tight` ou `tracking-widest` para labels).
- **Hierarquia:** Títulos grandes e impactantes estilo automobilismo.
- **Implementação:** Os arquivos da fonte devem ser carregados em `/public/fonts/` (arquivos: `Formula1-Regular.ttf`, `Formula1-Wide.ttf`, `Formula1-Black.ttf`).

## Lógica de Geração e Balanceamento de Times

Este aplicativo utiliza um algoritmo avançado e multi-camadas para garantir partidas justas e diversificadas.

### 1. Seleção de Jogadores (Os 12 da Partida)
- **Prioridade de Rodagem:** O sistema utiliza uma fila de prioridade inteligente para definir os 12 escalados:
    1. **Rodagem Imediata (Principal):** Quem NÃO participou da última partida tem prioridade absoluta. Isso garante que ninguém jogue partidas seguidas se houver banco disponível.
    2. **Volume de Jogo:** Entre quem não jogou a última (ou ambos jogaram), quem participou de MENOS partidas hoje tem prioridade.
    3. **Consistência de Banco:** Se os critérios acima empatarem, quem está sentado há mais tempo consecutivamente tem prioridade.
    4. **Chegada:** Como último critério de desempate, a ordem de chegada define a vaga.
- **Lista de Presença:** A seleção é feita exclusivamente entre os jogadores marcados como "Presentes".
- **Garantia de Levantadores:** O sistema busca incluir sempre 2 levantadores oficiais. Se houver excedente, entram na fila de prioridade normal. Se houver apenas 1, ele é fixado e o outro time recebe um jogador de alta eficiência como contraparte.

### 2. Eficiência Técnica e Sistema de Ranking
O sistema agora separa a **Eficiência Técnica** (usada para equilibrar times) do **Ranking ELO** (pontos de carreira):
- **Eficiência Técnica (Métrica Soberana):** É a métrica padrão do Ranking e a base absoluta para o balanceamento de times. Ela não se baseia apenas em ganhar ou perder, mas na consistência e habilidade demonstrada.
- **Ranking ELO (Pontos):** Sistema de pontuação fixa (+20/-20 por partida). Usado como métrica de carreira e progressão.
- **Cálculo da Eficiência:** Métrica composta usada pelo algoritmo de sorteio para garantir times equilibrados. Considera:
    1. **Consistência Técnica (mu - 3*sigma):** Valor matemático conservador que recompensa a regularidade e pune a incerteza (poucas partidas).
    2. **Habilidades Práticas:** Soma ponderada de Ataque, Defesa, Levantamento e Saque.
    3. **Impact Bonus:** Bônus fixo por categoria de impacto.
- **Patentes (Tiers):** Definidas pelo ELO do Ranking.
- **Destaque:** O Ranking é ordenado por padrão pela Eficiência Técnica, garantindo que os melhores jogadores (mais consistentes) estejam no topo, independentemente do volume total de partidas.

### 3. Distribuição e Balanceamento
- **Distribuição Alternada (ABAB com Foco em Gênero):** O sistema agora distribui inicialmente homens e mulheres de forma explicitamente balanceada. Ele verifica a contagem de cada gênero nos times A e B em tempo real e força a entrada de novos jogadores no time com menor representação daquele gênero antes de aplicar o padrão ABAB normal por eficiência.
- **Penalidade de Recorrência:** O sistema aplica uma "multa" no score de equilíbrio se muitas duplas ou núcleos de jogadores se repetirem em relação à última partida. Isso força a alternância de parceiros mesmo em grupos fixos de 12 jogadores.
- **Separação Técnica Obrigatória (Bottom 2):** Os dois jogadores (independente de gênero, mas geralmente mapeados pelas piores métricas) com a menor **Soma de Habilidades Práticas** (Saque, Ataque, Defesa, Levantamento) são obrigatoriamente separados entre os times. Eles são protegidos para que NUNCA caiam no mesmo time.
- **Refinamento por Trocas (Optimizer):** O sistema realiza milhares de simulações de trocas (respeitando estritamente o gênero e o fato de ser levantador ou não) para minimizar as diferenças de Eficiência Total, Destaques (Top 4) e Simetria.
- **Agente de Auto-Correção e Fiscalização de Regras (AI Agent):** Uma camada implacável e final de validação do sistema garante as seguintes discrepâncias zeradas:
    1. **Separação de Bottom 2:** Verifica se os 2 jogadores mais fracos estão no mesmo time e realiza trocas forçadas.
    2. **Desequilíbrio de Gênero:** O agente fiscaliza a distribuição do gênero após o sorteio/otimização. Ele possui diretrizes para corrigir discrepâncias bizarras (como 3 homens em um time e 1 em outro, ou times com quantidades assimétricas de mulheres) movendo cirurgicamente peças do mesmo gênero.
    3. Nos casos do "AUTO-FIX" por emergência do Bottom 2, o agente foi programado para não estragar a contagem de gêneros na hora de separar jogadores mais fracos (só quebra gênero se não achar mais nenhuma saída lógica).

### 4. Gênero (Aplicação Severa)
- O sistema mantém o **equilíbrio de gênero obrigatório** entre as equipes durante todas as fases de sorteio, otimização e troca final. Um time nunca pode ficar com 3 homens e outro com 1, salvo em condições de total inviabilidade matemática dos presentes na quadra. Toda lógica tem contadores explícitos que guarnecem as trocas de modo que A e B batam número idêntico (ou diferença máxima de +1/-1 ímpar) do mesmo gênero.

## Diretrizes de Implementação
- **Proteção de Sincronização:** Durante o envio de dados ou geração de times, o botão de "Nova Escalação" e "Confirmar Vitória" deve ser desabilitado acompanhado de um indicador visual de "Guerreiros Intelligence" para evitar corrupção de estado ou cliques duplos.
- Sempre priorizar o uso de classes utilitárias do Tailwind CSS.
- Manter o efeito "vazado" em indicadores de status (fundo colorido com texto na cor do fundo principal, que é preto).
- Evitar o uso de cores genéricas (como `bg-emerald-500` ou `bg-red-500`) em favor do padrão Amarelo/Branco estabelecido para performance.
