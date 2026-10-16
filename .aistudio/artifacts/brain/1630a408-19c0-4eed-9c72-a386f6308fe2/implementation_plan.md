# Refactor do Componente 'Status da Rodada' (Nomes Completos nos Badges)

Refatoração do componente `RoundStatusCard` para garantir que os nomes dos atletas sejam sempre exibidos integralmente nos badges de auditoria, combinando ajuste dinâmico e auto-scaling de tipografia com containers de rolagem horizontal suave.

## User Review & Critical Decisions

> [!IMPORTANT]
> A refatoração preserva 100% da integridade dos dados e das regras estatutárias do clube, atuando estritamente na camada de apresentação visual dos badges de auditoria no card do Status da Rodada.

- **Nomes Completos Obrigatórios**: Os nomes dos atletas são recuperados a partir do cadastro mestre (`players`) e mantidos sem abreviações, truncamentos ou reticências em todos os níveis de auditoria (Top 4, Top 2, Bottom 4, Bottom 2 e Levantadores).
- **Auto-Scaling Tipográfico Gradual**: Implementação de função de dimensionamento adaptativo que ajusta dinamicamente tamanho de fonte, kerning (`tracking`) e espaçamento interno (`px`/`py`) com base no comprimento do nome completo (para nomes curtos, médios e extensos com mais de 18 ou 24 caracteres).
- **Container com Rolagem Horizontal Suave (`touch-pan-x`)**: Todos os grupos de badges contam com container horizontal otimizado para toque em dispositivos móveis, sem quebra de linha de palavras (`whitespace-nowrap flex-shrink-0`), garantindo leitura imediata sem comprometer o layout geral do card.

---

## 1. Overview & Core Concept

- **O que faz**: Atualiza o componente `RoundStatusCard` (`src/components/RoundStatusCard.tsx`) para renderizar os nomes completos de todos os atletas em seus respectivos badges de regras estatutárias (Times A e B), eliminando qualquer abreviação de prenomes ou sobrenomes.
- **Público-alvo**: Operadores de quadra, mesários e atletas visualizando a pré-visualização de times (`PreviewTeams`) e a partida em andamento (`MatchView`).
- **Valor Principal**: Reconhecimento e identificação clara e inequívoca de cada sócio convocado nos blocos táticos de auditoria (Top 2/4, Bottom 2/4 e Levantadores Oficiais), tanto no celular quanto no tablet ou desktop.

---

## 2. User Experience & Visual Design

- **Hierarquia Visual dos Badges**:
  - `PlayerNameBadge` recebe suporte a auto-scaling com 5 níveis de granularidade:
    - Nomes $\le 10$ caracteres: `text-xs px-2.5 py-1`
    - Nomes de 11 a 14 caracteres: `text-[11px] px-2.5 py-1`
    - Nomes de 15 a 18 caracteres: `text-[10px] tracking-tight px-2.5 py-0.5`
    - Nomes de 19 a 24 caracteres: `text-[9px] tracking-tight px-2 py-0.5`
    - Nomes $> 24$ caracteres: `text-[8.5px] tracking-tighter px-2 py-0.5`
  - Cores e contraste alto mantidos rigorosamente dentro da paleta oficial do Guerreiros VC:
    - Fundo escuro com borda sutil para badges padrão (`bg-zinc-900 text-white border-white/15`).
    - Esmeralda translúcido para destaques Top/Bottom 2 (`bg-emerald-500/15 text-emerald-300 border-emerald-500/30`).
    - Dourado oficial para levantadores (`bg-brand-primary/15 text-brand-primary border-brand-primary/30`).
- **Rolagem Horizontal Fluida**:
  - `overflow-x-auto no-scrollbar scroll-smooth touch-pan-x` em todas as linhas de exibição.
  - Preservação de altura uniforme (`min-h-[28px]`).

---

## 3. Key Product Decisions & Trade-Offs

- **Decisão 1: Auto-Scaling Dinâmico vs. Truncamento com Tooltip**
  - *Abordagem Escolhida*: Auto-scaling dinâmico de fonte associado a rolagem horizontal sem truncar o texto visual. O atributo nativo `title` permanece ativo como redundância de acessibilidade.
  - *Por que*: O usuário solicitou expressamente a proibição de abreviações e truncamentos nos badges visuais.
  - *Alternativas Descartadas*: `truncate` com reticências ou exibir apenas o primeiro nome (rejeitado pela especificação).
- **Decisão 2: Preservação de Dados Mestres**
  - *Abordagem Escolhida*: Cruzamento pelo `id` do atleta na lista mestra (`players`) com fallback para `p.name` original, garantindo o nome completo cadastrado.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────┐
│               Status da Rodada (RoundStatusCard)            │
├─────────────────────────────────────────────────────────────┤
│  Top 4 / Top 2 Separation      Bottom 4 / Bottom 2 Balance  │
│  ┌───────────────────────────┐ ┌──────────────────────────┐ │
│  │ Time A (Horizontal Scroll)│ │ Time A (Horizontal Scroll│ │
│  │ [ ATLETA COMPLETO 1 ]     │ │ [ ATLETA COMPLETO 3 ]    │ │
│  │ [ ATLETA COMPLETO 2 ]     │ │ [ ATLETA COMPLETO 4 ]    │ │
│  └───────────────────────────┘ └──────────────────────────┘ │
│                                                             │
│  Levantadores Oficiais         Gênero & Equilíbrio de IC    │
│  ┌───────────────────────────┐ ┌──────────────────────────┐ │
│  │ Time A & B (Badges Ouro)  │ │ Contagem M/F & Δ IC      │ │
│  └───────────────────────────┘ └──────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                               ▲
                               │
             ┌─────────────────┴─────────────────┐
             │       PlayerNameBadge Hook        │
             │ - Auto-scaling getBadgeFontSize   │
             │ - Full Name from Master Registry  │
             │ - whitespace-nowrap & touch-pan-x │
             └───────────────────────────────────┘
```

### Component & State Mapping

- **Arquivo Alvo**: `src/components/RoundStatusCard.tsx`
- **Sub-componentes/Funções Alteradas**:
  - `getBadgeFontSize(name: string)`: Ajuste granular de escala tipográfica e espaçamento.
  - `PlayerNameBadge`: Aplicação de classes de dimensionamento dinâmico e suporte a rolagem.
  - Containers de listas de badges (Top 4, Top 2, Bottom 4, Bottom 2, Levantadores): Reforço do container `overflow-x-auto no-scrollbar scroll-smooth touch-pan-x flex items-center gap-1.5`.
- **Validação de Conformidade**:
  - Execução de `lint_applet` e `compile_applet` após a implementação.
