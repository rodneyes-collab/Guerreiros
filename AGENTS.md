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
- **Estilo:** Negrito/Black (`font-black`), Caixa Alta (`uppercase`), Espaçamento entre letras (`tracking-tight` ou `tracking-widest` para labels).
- **Hierarquia:** Títulos grandes e impactantes.

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
- **Distribuição Alternada (ABAB):** Após definir os levantadores, os jogadores restantes são ordenados por **Eficiência Técnica** e distribuídos entre Time A e Time B seguindo o padrão ABAB ABAB.
- **Penalidade de Recorrência:** O sistema aplica uma "multa" no score de equilíbrio se muitas duplas ou núcleos de jogadores se repetirem em relação à última partida. Isso força a alternância de parceiros mesmo em grupos fixos de 12 jogadores.
- **Separação Técnica Obrigatória (Bottom 2):** As duas jogadoras com a menor **Soma de Habilidades Práticas** (Saque, Ataque, Defesa, Levantamento) são obrigatoriamente separadas entre os times. Elas são protegidas da aleatoriedade inicial para garantir que o ABAB as coloque em lados opostos.
- **Refinamento por Trocas (Optimizer):** O sistema realiza milhares de simulações de trocas (respeitando o gênero) para minimizar as diferenças de Eficiência Total, Destaques (Top 4) e Simetria.
- **Agente de Auto-Correção:** Uma camada final de validação (Agente de IA de Balanceamento) verifica se as regras críticas (como a separação das 2 jogadoras mais fracas) foram cumpridas e realiza trocas automáticas de emergência caso identifique alguma violação antes de exibir a escalação.

### 4. Gênero
- O sistema mantém o equilíbrio de gênero entre as equipes durante todas as fases de troca e balanceamento.

## Diretrizes de Implementação
- **Proteção de Sincronização:** Durante o envio de dados ou geração de times, o botão de "Nova Escalação" e "Confirmar Vitória" deve ser desabilitado acompanhado de um indicador visual de "Guerreiros Intelligence" para evitar corrupção de estado ou cliques duplos.
- Sempre priorizar o uso de classes utilitárias do Tailwind CSS.
- Manter o efeito "vazado" em indicadores de status (fundo colorido com texto na cor do fundo principal, que é preto).
- Evitar o uso de cores genéricas (como `bg-emerald-500` ou `bg-red-500`) em favor do padrão Amarelo/Branco estabelecido para performance.
