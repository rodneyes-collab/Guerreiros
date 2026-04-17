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

## Diretrizes de Implementação
- Sempre priorizar o uso de classes utilitárias do Tailwind CSS.
- Manter o efeito "vazado" em indicadores de status (fundo colorido com texto na cor do fundo principal, que é preto).
- Evitar o uso de cores genéricas (como `bg-emerald-500` ou `bg-red-500`) em favor do padrão Amarelo/Branco estabelecido para performance.
