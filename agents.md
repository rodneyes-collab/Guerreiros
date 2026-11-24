# Padrão de Design, Regras de Negócio e Protocolos de Modificação

Este documento detalha o padrão visual, a arquitetura de dados, os fluxos de autenticação e os protocolos operacionais utilizados pelos Agentes de IA para a manutenção e evolução do Guerreiros Volleyball Club.

---

## 🛑 PROIBIÇÃO ABSOLUTA DE DADOS SIMULADOS (REGRA DE OURO)
- **Nunca** utilize dados simulados, sintéticos, gerados por script ou inventados para partidas, histórico ou estatísticas.
- **Sempre** utilize dados reais extraídos diretamente das interações e registros do clube.
- **Verificação de Presença Obrigatória:** Qualquer partida ou histórico deve ser validado contra a **lista de presença oficial** (`attendance` collection) do respectivo dia. Nenhum atleta que não conste na lista de presença do dia pode figurar como participante em partidas daquela data.

---

## 🛑 DIRETRIZ ESTATUTÁRIA DE BANCO DE DADOS ÚNICO (UNIFIED DATABASE RULE)
- **Proibição Absoluta de Múltiplos Bancos de Dados:** A aplicação NÃO PODE operar com instâncias divergentes entre o Frontend (`firebase.ts`) e o Backend (`server.ts`). É estritamente proibido inicializar o `firebase-admin/firestore` no backend sem verificar o mesmo `firestoreDatabaseId` utilizado pelo frontend em `firebase-applet-config.json`.
- **Sincronia Estrita Frontend/Backend:** Tanto o aplicativo instalado no celular (PWA / Produção), quanto o servidor Node.js (`server.ts` / Webhook WhatsApp) e o ambiente de desenvolvimento (AI Studio / Web) DEVEM ler a mesma chave `firebaseConfig.firestoreDatabaseId` (ou a base principal `(default)` do projeto `volleyclub-manager` quando configurado como `"(default)"`), garantindo que todas as leituras e escritas ocorram exatamente no mesmo banco.
- **Diretriz para MCP, Skills e Agentes (Firebase / Firestore):**
  - Qualquer ferramenta de provisionamento (`set_up_firebase`), skill (`firebase-integration-rpc`) ou protocolo MCP DEVE preservar a unificação da base de dados.
  - É expressamente proibido a qualquer agente reescrever `getFirestore()` no `server.ts` ignorando `firebaseConfig.firestoreDatabaseId`.
  - Todas as partidas, presenças oficiais (68+ rodadas históricas), rankings, intenções e perfis de sócios pertencem única e exclusivamente à mesma base unificada.

Antes de executar QUALQUER alteração, a IA DEVE seguir estritamente este fluxo:

1. **ANÁLISE DE IMPACTO:** Identifique os arquivos e funções que serão alterados. Se a alteração envolver `App.tsx`, a IA deve planejar a extração do código para um arquivo isolado antes de editá-lo.
2. **PLANO DE EXECUÇÃO:** Apresente um plano de no máximo 3 etapas. Não comece a codificar antes do usuário confirmar.
3. **ISOLAMENTO:** Jamais altere uma funcionalidade se ela estiver dentro de um componente genérico (como `App.tsx`) sem antes refatorá-la para um componente ou hook dedicado.
4. **ZONAS DE NÃO INTERFERÊNCIA:** 
    - **Filtro de Sócios Ativos e DM (Departamento Médico):** Na lista de presença, na seleção para convocar (chamada, intenções e presenças pública/interna) e no motor de geração de times, SOMENTE sócios com status de cadastro estritamente ATIVO (`status === 'active'`) e que NÃO estejam marcados como DM (`isDM: true` ou `status === 'dm'`) podem ser exibidos ou selecionados. Sócios com status Inativo (`status === 'inactive'`), DM, Departamento Médico ou Lista de Espera (`status === 'waiting'`) são estritamente proibidos de figurar em qualquer lista de presença ou convocação.
    - **Gestão de Status de Saúde (Paulo Henrique e outros):** Sócios em DM (ex: Paulo Henrique) devem ser automaticamente ocultados de todas as interfaces de operação (Lista de Intenção, Presença e Escalação) até que seu status seja revertido para Ativo e o marcador `isDM` seja removido.
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

4. **Validação de Data Redundante (Resiliência de Fuso):**
   - O filtro de partidas por data deve cruzar o campo `m.date` com a conversão explícita do `timestamp` para o fuso horário oficial de Brasília (`America/Sao_Paulo`), prevenindo falsos vazios causados por divergências de UTC ou fusos locais.
   - O cálculo de `getNextThursday()` deve utilizar meio-dia UTC (`Date.UTC(y, m - 1, d, 12, 0, 0)`) com referência em `America/Sao_Paulo` tanto no frontend quanto no backend para evitar deslocamentos de 1 dia perto da meia-noite.

5. **Auditoria Obrigatória em Caso de Discrepância:**
   - Antes de efetuar qualquer alteração no pipeline de salvamento de partidas, o agente deve utilizar ferramentas de auditoria e cruzamento (`Sync Debugger`) para garantir que o número de partidas no Firestore coincida com o volume registrado no Store e nas estatísticas dos atletas.

6. **Proteção contra Estado Obsoleto e Duplicidade (Concurrency Protection):**
   - Ao finalizar (`handleFinishMatch`) ou excluir (`deleteMatch`) uma partida, o sistema deve obrigatoriamente buscar o estado mais atual do jogador no banco de dados (ou store centralizado) antes de aplicar os incrementos/decrementos de estatísticas. É proibido confiar cegamente nos objetos de jogador vindos do resultado da geração de times para realizar cálculos de saldo de ELO ou contagem de partidas.
   - **Trava de Sincronização:** Toda ação de escrita no banco de dados deve ser protegida pelo estado `isSyncing`. O botão de finalização de partida deve ser desabilitado e exibir um estado de carregamento ("SINCRONIZANDO...") imediatamente após o primeiro clique, prevenindo que cliques múltiplos ou instabilidades de rede gerem registros duplicados ou estatísticas infladas.

7. **Auto-Heal e Recuperação de Integridade:**
   - Em caso de discrepância entre o contador de partidas exibido no perfil do jogador e o número real de partidas registradas na coleção `matches` para o dia, o agente deve priorizar o reprocessamento baseado nos documentos de partida (Fonte da Verdade).
   - **Reset Manual Soberano (`recalculateDailyStats`):** Ao disparar o recálculo manual ou finalizar o dia, o sistema DEVE obrigatoriamente realizar a escrita de todos os campos diários (`dailyMatches`, `dailyWins`, `dailyLosses`, `dailyEloGain`, `dailyResults`, `playedLastMatch`, `consecutivePlayed`, `consecutiveBenched`) para TODOS os jogadores, removendo qualquer trava condicional que impeça o zeramento de valores residuais de sessões anteriores.

---

## 📋 Integridade da Lista de Intenção, Sincronização com Bot e Ordenação por Chegada

O gerenciamento da lista de intenção (quem "VAI" ou "NÃO VAI" jogar) deve seguir regras rígidas de transparência, sincronia bidirecional (App <-> Bot WhatsApp) e ordem cronológica:

1. **Fonte Única da Verdade e Espelhamento Obrigatório (`metadata/intentions` + `preConfirmations`):**
   - Toda confirmação ou recusa de presença (seja via botão no App ou via comando `gv vou` / `gv naovou` no Bot do WhatsApp) DEVE atualizar o documento `metadata/intentions` com objetos aninhados limpos (`responses`, `confirmationTimestamps`, `remindersSent`) usando `.set(updatedDoc)` sem criar chaves literais com ponto (`responses.email@...`).
   - Simultaneamente, o backend (`server.ts`) DEVE espelhar a confirmação na subcoleção `preConfirmations/{targetDate}/players/{playerId}` (criando/atualizando quando `GOING` e removendo quando `NOT_GOING` ou `RESET`), garantindo que os listeners em tempo real do `useFirestoreSync` e `useIntentions` reflitam a mudança instantaneamente no celular.

2. **Horário de Confirmação (Timestamp de Intenção):**
   - O horário exibido ao lado do nome do sócio é estritamente o **horário de confirmação na lista de intenção** para a sessão/data atual.
   - **Proibição de Fallback de Cadastro:** É terminantemente proibido utilizar o timestamp de criação do sócio ou de registros de partidas passadas como substituto na ausência do horário de intenção atual. Se não houver horário na sessão, o campo deve permanecer vazio ou mostrar o status de processamento.

3. **Mecanismo de Auto-Heal de Timestamps:**
   - Caso um sócio confirme presença através do fluxo de Pré-Confirmação (`preConfirmations`) ou Bot do WhatsApp, seu horário original deve ser propagado para o documento de intenções (`metadata/intentions`). Se o horário estiver ausente na interface de intenções, o sistema deve tentar recuperá-lo automaticamente da base de pré-confirmações da semana vigente.

4. **Protocolo de Imutabilidade (Proteção de Fila):**
   - Uma vez confirmada a presença no ciclo da semana (após o cutoff de sexta-feira), o horário original deve ser preservado. Ações administrativas ou comandos repetidos (`gv vou`) **NÃO** podem sobrescrever o horário inicial, protegendo o direito de prioridade por ordem de chegada.
   - **Resolução de IDs (Aliases):** O sistema deve gravar e cruzar `id`, `uid`, `email` e `canonicalId`. Em caso de múltiplos timestamps para o mesmo sócio na mesma sessão, prevalece sempre o **mais antigo**.

5. **Trava de Re-confirmação:**
   - O sistema deve impedir tecnicamente que um sócio já confirmado perca sua posição na fila ao re-confirmar, exibindo sua posição atualizada (`#X de Y confirmados`).

6. **Automação de Lembretes (Push Notifications e WhatsApp):**
   - **Agendamento Fixo:** Disparos automáticos às **10:00** e **16:00** nos dias de partida (App) e lembretes individuais às quartas e quintas às **10:00** via Bot do WhatsApp.
   - **Filtro de Destinatários:** Apenas sócios com status `active` e fora do DM que ainda constam como "Indecisos" (sem resposta GOING ou NOT_GOING na sessão).

7. **Unicidade de Registro de Sócio (Proibição de Chaves Duplicadas / Falsos Convidados):**
   - Todo sócio ativo que confirma presença deve constar estritamente uma única vez na lista de confirmados, sob o seu nome e ID canônico (`p.id`).
   - É expressamente proibido propagar ou exibir o UID de autenticação ou o e-mail do atleta como registros adicionais de 'Convidado'.
   - O pipeline de intenções deve consolidar confirmações originadas por UID ou e-mail diretamente no ID mestre do sócio e expurgar chaves de alias redundantes da visualização de confirmados e da lista de exportação do WhatsApp.

---

## 🤖 Protocolo Operacional do Bot de WhatsApp, VM Google (Baileys) e Inteligência Natural (NLP)

O Bot Oficial do Guerreiros VC (`/api/whatsapp/webhook` e `/api/whatsapp/cron-tasks` em `server.ts`) opera integrado a uma **Máquina Virtual Google Cloud (VM `bot-guerreiros-vm`) rodando `@whiskeysockets/baileys` via PM2 (`bot.mjs`)** e deve obedecer às seguintes regras:

1. **Arquitetura Oficial — VM Google com Baileys (Proibição de Evolution API) e Blindagem JSON:**
   - O clube **NÃO** utiliza Evolution API. Toda entrega de mensagens, mídias (PNG) e captura de fotos de perfil ocorre exclusivamente através do script `bot.mjs` (`v4.1+`) rodando na VM Google (`pm2`), que consome `/api/whatsapp/webhook` (mensagens recebidas) e `/api/whatsapp/cron-tasks` (fila de envios, agendamentos e tarefas de sincronização).
   - É proibido adicionar dependências ou bloqueios que exijam conexão HTTP com instâncias Evolution API.
   - **Blindagem contra JSON Malformado / `upstream r...`:** Toda comunicação HTTP/Firestore entre a VM e o backend utiliza validação prévia de formato JSON dentro de blocos `try/catch` (`validateIncomingJsonPayload`, `safeReadResponseJson` e `sanitizeFirestorePayload`), impedindo que respostas HTML/texto de timeout ou erro de proxy (`upstream request timeout`) derrubem a thread principal do bot ou corrompam o Firestore.

2. **Proteção de Privacidade, Anti-Intromissão e Entrega Automática no Privado:**
   - O bot **JAMAIS** deve responder a mensagens curtas soltas (`"1"`, `"2"`, `"sim"`, `"não"`, `"vou"`) enviadas em conversas normais com outros contatos.
   - A ativação exige obrigatoriamente os prefixos explícitos (`gv`, `bot`, `botgv`, `!`, `/`, `@guerreiros`) ou resposta rápida (`1` ou `2`) exclusivamente dentro do chat privado direto com o próprio bot.
   - **Limitação Nativa do WhatsApp (Chat "Você / Para si mesmo"):** Como a VM Baileys opera conectada ao número pareado do bot, mensagens enviadas por outro sócio para o *próprio número dele* são criptografadas apenas entre os aparelhos desse sócio e nunca chegam ao bot. Para receber no privado, o sócio deve enviar o comando diretamente ao contato do bot **ou** digitar o comando no grupo oficial.
   - **Comandos Individuais Solicitados no Grupo → Entrega Automática no Privado:** Quando qualquer sócio digitar comandos individuais (`gv dia`, `gv minhanoite`, `gv meusjogos`, `gv estatisticas`, `gv raiox`, `gv cheguei`, atualização de foto ou consultas pessoais via IA) dentro do **grupo oficial**, o servidor enfileira automaticamente a resposta completa (Card HD PNG ou texto) na fila `whatsapp_outbox` para entrega direta no **privado do sócio** (com resolução de `@s.whatsapp.net` e `@lid` + `fallbackTargets`), devolvendo no grupo apenas uma confirmação discreta de 1 linha (`📩 *<Nome>*, enviei seu *<Tipo>* no seu privado! 🔒🏐`, protegida por trava antiloop em `isBotGeneratedOutput`). Comandos coletivos (`gv ranking`, `gv resumo`, `gv lista`, `gv aniversarios`, `gv pix`, `gv vou`) permanecem no grupo.

3. **Roteamento de Intenção por Linguagem Natural e IA 100% Server-Side (`services/aiRouter.ts`):**
   - Todas as chamadas Gemini (geração de texto, transcrição de áudio, TTS, streaming SSE `/api/gemini/stream` e Live API WebSocket `/api/gemini/live`) executam **exclusivamente no servidor**, roteadas por tier determinístico (`gemini-3.1-flash-lite`, `gemini-4-hydrogen`, `gemini-3.5-transcribe`, `gemini-3.8-flash-lite-tts` e `gemini-3.8-live`) com `process.env.GEMINI_API_KEY`.
   - Toda mensagem acionada com prefixo ou no chat privado é classificada nas intenções: `CONFIRM_ATTENDANCE`, `DECLINE_ATTENDANCE`, `VIEW_LIST`, `VIEW_RANKING`, `CHECK_PIX`, `RAW_STATS_LIST` ou `DEEP_ANALYTICS_CHAT` (`serverDeepAnalysis.ts`), incluindo gatilhos em linguagem natural para o Card Individual da Noite (ex.: *"me manda meu card"*, *"como fui na quinta"*, *"resumo individual"*).
   - **Base de Conhecimento Oficial do Clube + Memória Curta no Privado:** o `runDeepAnalyticsChat` recebe dinamicamente as configurações oficiais (`systemConfig`: mensalidade, chave PIX, quadra, capacidade) junto ao regulamento oficial do Guerreiros VC (quinta à noite, cerca GPS 300m, sorteio por IC 80% skills + 20% win rate sem ELO, fila com rodagem justa, premiação Ordem B com 4 vencedores distintos sem peso de skills no MVP e entrega automática no privado). A memória conversacional por sócio retém até 8 turnos por **20 minutos** e é encerrada imediatamente em despedidas naturais (*"obrigado"*, *"valeu"*, *"tchau"*, *"encerrar"*, *"sair"*).

4. **Exibição Completa de Rankings (Diário vs. Acumulado — Todos os Sócios Ativos):**
   - Na intenção `VIEW_RANKING` e na geração do **Card Visual HD de Ranking (PNG)**, é estritamente proibido limitar a listagem aos 10 primeiros. O sistema deve renderizar **todos os sócios ativos** do clube (28+ atletas) em layout vertical **mobile-first** (`1080px` em coluna única com tipografia ampliada e alto contraste), separando claramente o **Ranking Geral Acumulado** (carreira/ELO) e o **Ranking Diário** (rodada/dia).

5. **Envio Nativo de Cards Visual HD (PNG) via VM Google (Sem Links no WhatsApp):**
   - **Proibição de Fallback por Link:** Se não for possível enviar o arquivo de imagem PNG diretamente no WhatsApp para o sócio visualizar nativamente, o recurso de Card HD deve permanecer desabilitado (`cardDeliveryMode: "disabled"`). É proibido enviar links para o sócio abrir o aplicativo apenas para ver o card.
   - **Modos Permitidos (`metadata/system.whatsappCardDeliveryMode`):**
     - `vm_image_only`: entrega exclusivamente o arquivo PNG nativo (`mediaBase64` / `mediaFetchUrl`, `imageOnly: true`) quando a VM anuncia `supportsMedia: true`.
     - `disabled`: desativa completamente o envio de Cards HD pelo WhatsApp (comandos retornam ranking em texto limpo).
   - **Otimização Mobile-First dos PNGs (`services/liquidGlassCards.ts`):**
     - Todos os 3 cards HD (`renderIndividualNightCardSvg`, `renderDailyRankingCardSvg` e `renderAccumulatedRankingCardSvg`) usam largura portrait `1080px`, margens compactas (`28px`), tipografia ampliada (+25% a +35%) e contraste reforçado para leitura imediata em telas de celular no WhatsApp sem necessidade de zoom.
   - **Estrutura do Card Individual da Noite (`gv dia` / `renderIndividualNightCardSvg`):**
     - **Separação sem Duplicidade:** **Linha do Tempo da Noite • Horizontal** exibe exclusivamente cronologia, resultado (`Vitória`/`Derrota`/`Rodízio`), placar, saldo e duração em quadra; **Resumo dos Times • Parceiros em Quadra** exibe exclusivamente `J01..Jn` + nomes dos parceiros + contador de parceiros distintos e parceiro mais frequente.
     - **Gráfico Liquid Glass — Variação dos Pontos do Dia (Saldo das Partidas × Média do Grupo):** renderiza curva acumulada de saldo do atleta + mini-colunas do saldo individual por partida comparados à linha tracejada da média do grupo e à margem média das partidas da noite (`±X.X/J`), em escala limpa ancorada no zero.
     - **Resenha do Guerreirinho • Análise IA (Rodapé do Card):** bloco Liquid Glass no rodapé do PNG com uma análise curta, leve e bem-humorada gerada server-side via Gemini (`ULTRA_LIGHT` / `gemini-3.1-flash-lite` com cache de 24h por atleta+sessão) baseada exclusivamente nos resultados reais da noite.
   - **Comando Direto e Automação Pós-Jogo de Quinta-feira:**
     - Comando `gv ranking img` (e variações) envia exclusivamente o PNG do ranking completo quando em modo `vm_image_only` + `supportsMedia: true`.
     - Às quintas-feiras pós-jogo (janela automática controlada por `cron-tasks`), o motor enfileira: (a) **PNG de resumo individual do dia** no privado de cada sócio que jogou na rodada; e (b) **PNG do ranking do dia + PNG do ranking acumulado** no grupo oficial do clube.

6. **Importação e Sincronização de Fotos de Perfil do WhatsApp (Sem Evolution API):**
   - **Diretório `Foto ↔ WhatsApp` (`metadata/whatsapp_photo_directory`):** indexa fotos em Base64 permanente diretamente pelo número normalizado do WhatsApp (`55` + DDD + número).
   - **Sincronização em Massa via VM Baileys:** o botão **"Sync WhatsApp"** (`POST /api/whatsapp/sync-photos`) restaura imediatamente fotos do diretório local/Firestore e enfileira uma tarefa `photoSyncTask` (`metadata/whatsapp_photo_sync_job`, com targets persistidos no Firestore priorizando IDs reais sobre `seed_*`). A VM Google registra heartbeat persistido (`metadata/whatsapp_vm_status`) quando anuncia `supportsPhotoSync: true` em `/api/whatsapp/cron-tasks`, busca as fotos públicas via `sock.profilePictureUrl(jid, 'image')` (com resolução de `@lid` e participantes do grupo), envia cada foto para `POST /api/whatsapp/push-member-photo` (aceitando `photoBase64`, `base64`, `dataUri`, `imageBase64` e `photoUrl`) e sinaliza conclusão em `POST /api/whatsapp/sync-photos/complete`, com atualização automática na tela de Sócios.
   - **Alternativas para Privacidade de Foto:** sócios com foto restrita no WhatsApp podem enviar uma imagem direto no chat do Guerreirinho (ou no grupo com legenda `foto` / `perfil`) ou usar o link mobile de auto-upload (`/foto`), acionável em 1 clique na tela de Sócios.

7. **Engajamento e Giro Diário de Voleibol Nacional (12:00 BRT):**
   - O agendador (`cron-tasks`) dispara 1 pílula diária no grupo oficial abordando preparação física, dicas técnicas, nutrição, aquecimento da rodada de quinta, recuperação pós-jogo e história do vôlei.
   - Consultas abertas sobre Superliga, Seleções, técnicas, rivais e estatísticas históricas são processadas via `runDeepAnalyticsChat`.

8. **Automação Financeira e Recebimento de Comprovantes PIX:**
   - A chave PIX oficial e o valor da mensalidade são lidos de `metadata/system` (favorecida oficial: Elizabeth de Souza Santos - Nubank).
   - Quando integrado ao fluxo de comprovantes (imagem/PDF), o sistema valida destinatário, valor e data via Gemini para dar baixa automática na coleção `payments` (`status: 'PAID'`).

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

3. **Auditoria de Camadas de Versão (`AppUpdateAuditPanel`):**
   - Exibe em tempo real as versões reportadas pelo Bundle, Contexto JS, LocalStorage e SessionStorage.
   - Permite identificar "Bypass de Cache" com falha quando o JS Context difere da Bundle Constant.

4. **Monitoramento de Tráfego do Service Worker (`ServiceWorkerFetchLogPanel`):**
   - Audita em tempo real se as requisições de rede estão sendo servidas pelo Cache do SW ou diretamente pela Rede, essencial para diagnosticar PWAs travados em assets antigos.

5. **Logs de Auditoria de Console (`[IC AUDIT] / [ELO AUDIT]`):**
   - O sistema dispara logs automáticos no console durante a geração para atletas com IC > 75 ou nomes específicos solicitados para auditoria (ex: "Ana Maria").
   - Registra o detalhamento matemático da normalização técnica, pesos aplicados e do cálculo do IC final.

6. **Trava de Sincronização e Auditoria de ELO:**
   - Toda alteração de ELO é auditada cronologicamente. Discrepâncias entre o saldo de vitórias/derrotas e o ELO atual disparam alertas no pipeline de dados.

---

## 🚀 Ciclo de Vida, Versionamento Crítico e Recuperação (PWA)

Para garantir que todos os usuários operem na mesma versão e evitar corrupção de dados por scripts obsoletos:

1. **Versionamento Semântico Estrito (`isAtLeast`):**
   - A comparação de versões (`APP_VERSION`) segue estritamente a lógica semântica. O sistema **NUNCA** deve forçar uma atualização se a versão em execução (`runningVersion`) ou confirmada (`confirmedVersion`) for maior ou igual à versão reportada pelo servidor/API.
   - O overlay de "Atualização Obrigatória" no `index.html` e o hook `useAutoVersionCheck` são os guardiões finais da integridade.

2. **Protocolo de Auditoria Remota de Falhas (`system_audit_logs`):**
   - Todo disparo de atualização crítica (`forceAppUpdate`) deve ser registrado preventivamente na coleção `system_audit_logs`.
   - O log deve conter: versão atual, versão alvo, e-mail do usuário, User Agent e estado dos marcadores de versão (`localStorage` / `sessionStorage`).

3. **Recuperação Nuclear (Deep Cache Wipe):**
   - Em casos de instabilidade severa ou loop de versão, o sistema dispõe do **Deep Cache Wipe (Nuclear)**.
   - **Ação:** Desregistra todos os Service Workers, limpa o Cache Storage, apaga as bases IndexedDB do Firebase (`volleyclub-manager/main`) e reseta os marcadores de versão. Isso garante um download 100% limpo do bundle na próxima recarga.

4. **Promoção de Versão Global:**
   - Através do painel administrativo, é possível promover a versão local `vX.Y.Z` como a versão oficial no Firestore (`metadata/system/appVersion`). Isso dispara o trigger de atualização obrigatória em todos os dispositivos conectados.

---

## 🏆 Sistema Oficial de MVP, Destaques Diários (Ordem B) e Eficiência

O cálculo dos destaques separa estritamente o **mérito exclusivo da noite** (no Ranking Diário) da **consistência técnica histórica** (no Ranking Acumulado / Carreira):

1. **Ranking Diário — Exclusividade de 4 Vencedores Distintos (Ordem B):**
   - Para ampliar o reconhecimento entre os sócios, cada um dos 4 destaques da rodada **DEVE** premiar um atleta diferente (sempre que houver $\ge 4$ atletas na sessão), selecionados na seguinte ordem de precedência:
     1. **Levantador(a) do Dia (`dailyBestSetter`):** escolhido(a) primeiro entre os sócios ativos que atuaram na posição no dia (via *Setter Score Diário*).
     2. **MVP do Dia (`dailyMvp`):** escolhido(a) em segundo lugar (excluindo o Levantador do Dia), usando **100% Mérito da Noite** (sem peso fixo das `skills` cadastrais):
        $$\text{Score Dia} = \max\left(0,\; \text{Win Rate \%} + (\text{Saldo Médio} \times 1.5)\right) + (\text{Partidas} \times 2.0)$$
        *(Mantém salvaguarda contra MVP sem vitórias na sessão.)*
     3. **Rei / Rainha do Dia (`dailyKing`):** maior ganho de **ELO de Quadra** na rodada (excluindo Levantador e MVP do Dia).
     4. **Mais Eficiente do Dia (`dailyEfficientTechnical`):** melhor **Saldo Médio de Pontos por Jogo** ($\frac{\text{Pontos Pró} - \text{Pontos Contra}}{\text{Partidas}}$), com desempate em % de Vitórias e volume (excluindo os 3 premiados anteriores), exibindo `Saldo +X.X pts/j • Y% V`.

2. **Ranking Acumulado / Carreira — Fórmula Oficial B-1 (Preservada):**
   $$\text{Score B-1} = \text{Pilar Desempenho} + \text{Pilar Volume}$$
   - **Índice Composto (IC):** Combina 80% das habilidades práticas declaradas (escala 4–20 convertida para 0–100) + 20% da taxa de vitórias real no período:
     $$\text{IC} = (\text{Skills} / 20 \times 100 \times 0.8) + (\text{Win Rate \%} \times 0.2)$$
   - **Pilar Desempenho:** $\text{IC} + (\text{Saldo Médio} \times 1.5)$
   - **Pilar Volume (Carreira):** $\min\left(15, \frac{\text{Partidas}}{45} \times 15\right)$

3. **Integração no Sistema e Visualização:**
   - **Destaques no Ranking (`RankingView`):** No modo Dia, o card de MVP exibe `Score Dia` (100% quadra) e o card Mais Eficiente exibe `Saldo ±X.X pts/j • Y% V`; no modo Acumulado, mantêm-se os indicadores `Score B-1`.
   - **Módulo de Cálculo:** Centralizado em `utils/statsLogic.ts` através de `calculateMvpEfficiencyScore`, `calculateDailyAvgPointDiff` e `calculatePlayerCompositeIndex`.

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

3. **Validação Resiliente de Fuso Horário e Reset de Performance:**
   - As rotinas de recuperação e auditoria de estatísticas diárias (`recalculateDailyStats` em `useAppLogic.ts`) utilizam conversão explícita baseada no fuso de Brasília (`America/Sao_Paulo`) para cruzar `m.date` e `m.timestamp`, garantindo que nenhuma partida do dia seja desconsiderada por variações de formato (data simples vs ISO) ou deslocamento de fuso.
   - **Garantia de Zeramento:** Operações de purga ou reset manual (`deleteMatchesByDate`, `recalculateDailyStats`) garantem a limpeza absoluta do `consecutivePlayed` e `dailyMatches`, prevenindo que atletas iniciem novas sessões com contadores inflados.

---

## 🛠️ Componentes e Backend Principais

- **`utils/teamLogic.ts`:** O cérebro do app. Contém toda a lógica de `generateTeams`, `runAutoCorrectionAgent` e simuladores de sinergia.
- **`src/hooks/useAppLogic.ts`:** Gerencia o estado global, persistência no Firestore e integra os dados dos sócios com as partidas.
- **`src/components/TeamBalancingSimulatorCard.tsx`:** Ferramenta administrativa para auditar a eficácia do algoritmo de balanceamento.
- **`server.ts` & `serverDeepAnalysis.ts`:** Motor backend, agendador Cron, Webhook WhatsApp (VM Google Baileys), fila de Cards Visual HD (PNG), sincronização de fotos de perfil e analítica profunda com Gemini.
- **`services/aiRouter.ts`, `services/serverGemini.ts` & `services/serverLiveApi.ts`:** Roteador determinístico de modelos Gemini 100% server-side (geração, streaming SSE, transcrição de áudio, TTS e Live API WebSocket).
- **`services/liquidGlassCards.ts` & `src/components/LiquidGlassCardsStudio.tsx`:** Motor de renderização PNG HD dos Cards (Ranking Completo com todos os sócios ativos, Resumo Diário e Cards Individuais) e painel administrativo de controle de entrega (`vm_image_only` / `disabled`).

---

## 🛡️ Diretrizes Gerais de Implementação
- **Fidelidade ao Layout Existente:** Toda inclusão, modificação ou alteração de layout de todo o aplicativo DEVE obedecer rigorosamente às regras, padrões visuais e layouts já implantados.
- **Proteção de Sincronização:** Exibir sempre o indicador visual "Guerreiros Intelligence" e desabilitar controles durante salvamentos ou sorteios.
- **Resiliência de Escrita (Batches):** Operações críticas que utilizam `writeBatch` (ex: `useIntentions`) devem obrigatoriamente instanciar o objeto batch dentro do loop de tentativa/retry para evitar erros de reuso após commit.
- **Respeito ao Tema:** Manter o efeito "vazado" em status e utilizar exclusivamente a paleta oficial.
- **Tailwind CSS First:** Prioridade absoluta para classes utilitárias sem arquivos CSS extras.
- **PWA Integrity:** Jamais remover as verificações de versão do `index.html`, pois são o último recurso de defesa contra versões zumbis em navegadores mobile.