import { GoogleGenAI } from "@google/genai";

export interface AgentToolsCallbacks {
  confirmAttendance: () => Promise<string>;
  declineAttendance: () => Promise<string>;
  getAttendanceList: () => Promise<string>;
  getRanking: (limit?: number) => Promise<string>;
  getPixInfo: () => Promise<string>;
}

interface ChatTurn {
  role: "user" | "model";
  text: string;
  referencedPlayerIds?: string[];
  timestamp: number;
}

const sessionMemory = new Map<string, ChatTurn[]>();
const MEMORY_TTL_MS = 2 * 60 * 60 * 1000;

function getSessionHistory(playerId: string): ChatTurn[] {
  const now = Date.now();
  const history = sessionMemory.get(playerId) || [];
  const valid = history.filter((h) => now - h.timestamp < MEMORY_TTL_MS);
  sessionMemory.set(playerId, valid);
  return valid;
}

function appendSessionHistory(
  playerId: string,
  role: "user" | "model",
  text: string,
  referencedPlayerIds: string[] = []
) {
  const history = getSessionHistory(playerId);
  history.push({ role, text, referencedPlayerIds, timestamp: Date.now() });
  sessionMemory.set(playerId, history.slice(-6));
}

function normStr(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// ============================================================================
// 🧬 DISTÂNCIA DE LEVENSHTEIN (Tolerância a erros de digitação no WhatsApp)
// ============================================================================
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// Mapa de apelidos comuns do clube (pode adicionar apelidos da resenha aqui)
const CLUB_NICKNAMES: Record<string, string[]> = {
  elizabeth: ["beth"],
  beth: ["elizabeth"],
  flavinha: ["flavia"],
  dea: ["dea patricia", "patricia"],
  mari: ["mariana", "maria"],
  rodney: ["rod", "rodney eduardo"]
};

function resolveBestPlayerRecord(targetPlayer: any, allPlayers: any[]): any {
  if (!targetPlayer) return null;
  if (!allPlayers || allPlayers.length === 0) return targetPlayer;

  const candidates = allPlayers.filter(
    (p) =>
      p.id === targetPlayer.id ||
      (p.email && targetPlayer.email && normStr(p.email) === normStr(targetPlayer.email)) ||
      (p.name && targetPlayer.name && normStr(p.name) === normStr(targetPlayer.name))
  );
  if (candidates.length > 0) {
    candidates.sort((a, b) => (Number(b.matchesPlayed) || 0) - (Number(a.matchesPlayed) || 0));
    return candidates[0];
  }
  return targetPlayer;
}

// ============================================================================
// 🎯 BUSCADOR FUZZY & FONÉTICO DE JOGADOR POR NOME OU APELIDO
// ============================================================================
export function findBestPlayerByNameQuery(queryName: string, allPlayers: any[]): any | null {
  const qNorm = normStr(queryName);
  if (!qNorm || qNorm.length < 2) return null;

  const activePlayers = allPlayers.filter((p) => p.name && p.status === "active");
  let bestPlayer: any = null;
  let bestScore = 0;

  for (const p of activePlayers) {
    const pNorm = normStr(p.name);
    const pParts = pNorm.split(/\s+/);
    const firstName = pParts[0];
    let score = 0;

    // 1. Nome completo idêntico (Pontuação Máxima: 1000)
    if (pNorm === qNorm) {
      score = 1000;
    }
    // 2. Primeiro nome idêntico (Ex: "beth" === "beth", nunca perde para "betinha")
    else if (firstName === qNorm) {
      score = 950;
    }
    // 3. Sobrenome ou parte composta idêntica
    else if (pParts.includes(qNorm)) {
      score = 880;
    }
    // 4. Nome completo contém a busca de múltiplas palavras (Ex: "paulo fonseca")
    else if (qNorm.includes(" ") && pNorm.includes(qNorm)) {
      score = 850;
    }
    // 5. Apelido mapeado no dicionário do clube
    else if (
      CLUB_NICKNAMES[qNorm]?.some((alias) => pNorm.includes(alias)) ||
      CLUB_NICKNAMES[firstName]?.includes(qNorm)
    ) {
      score = 800;
    }
    // 6. Começo do primeiro nome (Ex: "mari" -> "mariana"), desde que não haja nome exato
    else if (qNorm.length >= 3 && firstName.startsWith(qNorm)) {
      // Penaliza proporcionalmente à diferença de tamanho para preferir nomes mais próximos
      score = 650 - (firstName.length - qNorm.length) * 15;
    }
    // 7. Tolerância a erro de digitação (Levenshtein <= 1 para nomes curtos, <= 2 para longos)
    else if (qNorm.length >= 4) {
      const distFirst = levenshteinDistance(qNorm, firstName);
      const distFull = levenshteinDistance(qNorm, pNorm);
      const minDist = Math.min(distFirst, distFull);
      const maxAllowed = qNorm.length >= 6 ? 2 : 1;
      if (minDist <= maxAllowed) {
        score = 550 - minDist * 100;
      }
    }

    if (score > 0) {
      // Desempate leve por número de partidas ativas no clube
      const totalScore = score + Math.min(40, (Number(p.matchesPlayed) || 0) * 0.1);
      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestPlayer = p;
      }
    }
  }

  return bestPlayer;
}

// ============================================================================
// 🔍 DETECTOR MULTI-JOGADORES COM MEMÓRIA DE PRONOMES ("ele", "ela", "dele", "dela")
// ============================================================================
export function detectReferencedPlayers(
  userMessage: string,
  senderPlayer: any,
  allPlayers: any[],
  recentHistory: ChatTurn[] = []
): any[] {
  if (!userMessage || !allPlayers || allPlayers.length === 0) {
    return senderPlayer ? [senderPlayer] : [];
  }

  const msgNorm = normStr(
    userMessage.replace(/^(@?gv|@?bot|@?botgv|@?guerreirinho|@guerreiros|guerreiros|!|\/)[,:\s]*/i, "")
  );

  const stopWords = new Set([
    "como", "qual", "quais", "quem", "onde", "quando", "para", "pelo", "pela",
    "jogos", "jogo", "vitorias", "vitoria", "derrotas", "derrota", "pontos",
    "ranking", "lista", "historico", "estatisticas", "sinergia", "dupla",
    "melhor", "maior", "clube", "guerreiros", "guerreirinho", "hoje", "ontem",
    "ate", "informe", "mostre", "diga", "fale", "sobre", "socio", "socios",
    "confirmar", "presenca", "quinta", "feira", "time", "times", "mais", "menos",
    "compare", "comparar", "comparacao", "meu", "meus", "minha", "minhas",
    "comigo", "entre", "numeros", "aproveitamento", "contra", "versus", "diferenca",
    "ultimos", "ultimas", "geral", "desde", "inicio", "comeco", "temporada", "ano",
    "mes", "semana", "quadra", "rede", "levantador", "levantadores", "pix", "valor"
  ]);

  const activePlayers = allPlayers.filter((p) => p.name && p.status === "active");
  const foundMap = new Map<string, { player: any; score: number }>();

  // 1. Verifica nomes compostos primeiro na mensagem inteira
  for (const p of activePlayers) {
    const pNorm = normStr(p.name);
    if (pNorm.includes(" ") && pNorm.length >= 6 && msgNorm.includes(pNorm)) {
      foundMap.set(p.id, { player: p, score: 1000 + (Number(p.matchesPlayed) || 0) * 0.1 });
    }
  }

  // 2. Verifica cada palavra significativa da frase usando o motor Fuzzy/Exato
  const tokens = msgNorm.split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !stopWords.has(w));
  for (const token of tokens) {
    const matched = findBestPlayerByNameQuery(token, activePlayers);
    if (matched) {
      const mNorm = normStr(matched.name);
      const firstName = mNorm.split(/\s+/)[0];
      const isExact = firstName === token || mNorm === token;
      const score = (isExact ? 950 : 650) + (Number(matched.matchesPlayed) || 0) * 0.1;

      const existing = foundMap.get(matched.id);
      if (!existing || score > existing.score) {
        foundMap.set(matched.id, { player: matched, score });
      }
    }
  }

  let detectedList = Array.from(foundMap.values())
    .sort((a, b) => b.score - a.score)
    .map((x) => x.player);

  // 3. Resolução de Pronomes ("ele", "ela", "dele", "dela", "com ela", "contra ele") usando a Memória da Conversa
  const usesThirdPersonPronoun = /\b(ele|ela|dele|dela|nele|nela)\b/.test(msgNorm);
  if (detectedList.length === 0 && usesThirdPersonPronoun && recentHistory.length > 0) {
    for (let i = recentHistory.length - 1; i >= 0; i--) {
      const turnIds = recentHistory[i].referencedPlayerIds || [];
      const otherId = turnIds.find((id) => id !== senderPlayer?.id);
      if (otherId) {
        const fromMem = allPlayers.find((p) => p.id === otherId);
        if (fromMem) {
          detectedList.push(fromMem);
          break;
        }
      }
    }
  }

  const mentionsSelf = /\b(eu|meu|meus|minha|minhas|comigo|mim)\b/.test(msgNorm);
  const isComparison = /\b(compare|comparar|comparacao|contra|versus|vs|diferenca|entre|juntos)\b/.test(msgNorm);

  if (detectedList.length === 0) {
    return senderPlayer ? [senderPlayer] : [];
  }

  // Se for uma comparação ou menção a si mesmo + outro sócio ("compare meu aproveitamento com a Beth")
  if ((mentionsSelf || isComparison) && senderPlayer) {
    const others = detectedList.filter((p) => p.id !== senderPlayer.id);
    if (others.length === 1) {
      return [senderPlayer, others[0]];
    } else if (others.length >= 2 && !mentionsSelf) {
      return [others[0], others[1]];
    }
  }

  return detectedList;
}

// ============================================================================
// 🧠 ESTÁGIO 1 (NLU): EXTRATOR SEMÂNTICO COM IA PARA FRASES COMPLEXAS
// ============================================================================
interface SemanticExtractionResult {
  intent:
    | "CONFIRM_ATTENDANCE"
    | "DECLINE_ATTENDANCE"
    | "VIEW_LIST"
    | "VIEW_RANKING"
    | "CHECK_PIX"
    | "PLAYER_STATS"
    | "COMPARE_PLAYERS"
    | "GENERAL_CHAT";
  targetPlayerNames: string[];
  includeSenderInComparison: boolean;
  period: "geral" | "recente";
}

async function extractSemanticIntentWithAI(
  ai: GoogleGenAI,
  userMessage: string,
  senderPlayer: any,
  allPlayers: any[],
  recentHistory: ChatTurn[]
): Promise<SemanticExtractionResult | null> {
  try {
    const activeNames = allPlayers
      .filter((p) => p.status === "active" && p.name)
      .map((p) => p.name)
      .join(", ");

    const lastTurnsText = recentHistory
      .slice(-3)
      .map((t) => `${t.role === "user" ? "Sócio" : "Robô"}: ${t.text.slice(0, 140)}`)
      .join("\n");

    const prompt = `Analise a mensagem enviada pelo sócio "${senderPlayer?.name}" no WhatsApp do clube de vôlei Guerreiros VC e extraia a intenção exata em JSON.

LISTA OFICIAL DE SÓCIOS DO CLUBE:
[${activeNames}]

CONTEXTO DAS ÚLTIMAS MENSAGENS:
${lastTurnsText || "Sem mensagens anteriores."}

MENSAGEM ATUAL DO SÓCIO "${senderPlayer?.name}":
"${userMessage}"

REGRAS DE EXTRAÇÃO:
1. Se o sócio citar o nome ou apelido de alguém da LISTA OFICIAL DE SÓCIOS (ou se referir a "ele/ela" do contexto anterior), coloque o nome exato da lista oficial dentro de "targetPlayerNames".
2. Atenção para não confundir nomes parecidos: "Beth" é diferente de "Betinha"; "Mari" é diferente de "Marcleide". Escolha o nome da lista oficial que mais se aproxima exata e foneticamente do termo usado.
3. Se ele pedir para comparar o próprio desempenho ("meu", "comigo", "minhas vitórias") com outra pessoa, marque "intent": "COMPARE_PLAYERS" e "includeSenderInComparison": true.
4. Responda APENAS com um objeto JSON válido no formato:
{"intent":"PLAYER_STATS","targetPlayerNames":["Nome Oficial"],"includeSenderInComparison":false,"period":"geral"}`;

    const resp = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const rawJson = (resp.text || "").trim();
    if (!rawJson) return null;
    return JSON.parse(rawJson) as SemanticExtractionResult;
  } catch {
    return null;
  }
}

// ============================================================================
// ⚔️ MOTOR DE COMPARAÇÃO DIRETA ENTRE 2 SÓCIOS
// ============================================================================
export function buildHeadToHeadComparisonReport(
  playerA: any,
  playerB: any,
  allPlayers: any[],
  allMatches: any[]
): string {
  const pA = resolveBestPlayerRecord(playerA, allPlayers);
  const pB = resolveBestPlayerRecord(playerB, allPlayers);
  if (!pA || !pB) return "Jogadores não encontrados para comparação.";

  const sortedActive = [...allPlayers]
    .filter((p) => p.status === "active" && !p.isDM && (p.matchesPlayed || 0) > 0)
    .sort((a, b) => (b.elo || 1200) - (a.elo || 1200));

  const getBasicStats = (p: any) => {
    const wins = Number(p.wins || 0);
    const losses = Number(p.losses || 0);
    const total = wins + losses > 0 ? wins + losses : Number(p.matchesPlayed || 0);
    const wr = total > 0 ? Math.round((wins / total) * 100) : 0;
    const elo = Math.round(p.elo || 1200);
    const rank = sortedActive.findIndex((x) => x.id === p.id) + 1;
    return { wins, losses, total, wr, elo, rank };
  };

  const stA = getBasicStats(pA);
  const stB = getBasicStats(pB);

  const idA = String(pA.id || "");
  const nameANorm = normStr(pA.name || "");
  const idB = String(pB.id || "");
  const nameBNorm = normStr(pB.name || "");

  const isPlayerInTeam = (team: any[], pid: string, pNorm: string) =>
    (Array.isArray(team) ? team : []).some((item) => {
      const raw = typeof item === "object" && item !== null ? item.id || item.name : item;
      const s = String(raw || "");
      return s === pid || (pNorm && normStr(s) === pNorm);
    });

  let togetherGames = 0;
  let togetherWins = 0;
  let vsGames = 0;
  let aWinsVsB = 0;
  let bWinsVsA = 0;

  (allMatches || []).forEach((m) => {
    const teamA = Array.isArray(m.teamA) ? m.teamA : [];
    const teamB = Array.isArray(m.teamB) ? m.teamB : [];

    const aInT1 = isPlayerInTeam(teamA, idA, nameANorm);
    const aInT2 = isPlayerInTeam(teamB, idA, nameANorm);
    const bInT1 = isPlayerInTeam(teamA, idB, nameBNorm);
    const bInT2 = isPlayerInTeam(teamB, idB, nameBNorm);

    if (!aInT1 && !aInT2) return;
    if (!bInT1 && !bInT2) return;

    const scoreA = Number(m.scoreA ?? m.pointsA ?? 0);
    const scoreB = Number(m.scoreB ?? m.pointsB ?? 0);
    const team1Won =
      m.winner === "A" ||
      m.winner === "teamA" ||
      (scoreA > scoreB && m.winner !== "B" && m.winner !== "teamB");

    if ((aInT1 && bInT1) || (aInT2 && bInT2)) {
      togetherGames += 1;
      const won = aInT1 ? team1Won : !team1Won;
      if (won) togetherWins += 1;
    } else if ((aInT1 && bInT2) || (aInT2 && bInT1)) {
      vsGames += 1;
      const aWon = aInT1 ? team1Won : !team1Won;
      if (aWon) aWinsVsB += 1;
      else bWinsVsA += 1;
    }
  });

  const togetherLosses = togetherGames - togetherWins;
  const togetherWr = togetherGames > 0 ? Math.round((togetherWins / togetherGames) * 100) : 0;
  const eloDiff = Math.abs(stA.elo - stB.elo);
  const eloLeader = stA.elo > stB.elo ? pA.name : stB.elo > stA.elo ? pB.name : "Empatados";

  return (
    `⚔️ *COMPARATIVO OFICIAL: ${pA.name} 🆚 ${pB.name}*\n\n` +
    `👤 *${pA.name}:*\n` +
    `• Ranking: #${stA.rank > 0 ? stA.rank : "-"} (*${stA.elo} pts ELO*)\n` +
    `• Cartel: *${stA.total} jogos* (*${stA.wins}V* / *${stA.losses}D* • Aproveitamento: *${stA.wr}%*)\n\n` +
    `👤 *${pB.name}:*\n` +
    `• Ranking: #${stB.rank > 0 ? stB.rank : "-"} (*${stB.elo} pts ELO*)\n` +
    `• Cartel: *${stB.total} jogos* (*${stB.wins}V* / *${stB.losses}D* • Aproveitamento: *${stB.wr}%*)\n\n` +
    `📈 *Diferença de ELO:* ${eloDiff} pts (Vantagem: *${eloLeader}*)\n` +
    `🤝 *Jogando Juntos (Mesmo Time):* ${togetherGames} jogos (*${togetherWins} Vitórias* e ${togetherLosses} Derrotas • *${togetherWr}%* de aproveitamento)\n` +
    `🔥 *Confronto Direto (Lados Opostos):* ${vsGames} jogos (*${pA.name}* venceu *${aWinsVsB}x* | *${pB.name}* venceu *${bWinsVsA}x*)`
  );
}

// ============================================================================
// 📊 MOTOR DE INTELIGÊNCIA ESTATÍSTICA INDIVIDUAL
// ============================================================================
export function buildPlayerDeepStatsReport(
  targetPlayer: any,
  allPlayers: any[],
  allMatches: any[],
  periodo: "geral" | "recente" = "geral"
): string {
  if (!targetPlayer) return "Dados do jogador não encontrados.";

  const resolvedPlayer = resolveBestPlayerRecord(targetPlayer, allPlayers);

  const playerMap = new Map<string, string>();
  allPlayers.forEach((p) => {
    if (p.id) playerMap.set(p.id, p.name || p.id);
    if (p.name) playerMap.set(normStr(p.name), p.name);
  });

  const pid = String(resolvedPlayer.id || "");
  const pNameNorm = normStr(resolvedPlayer.name || "");
  const pFirstNameNorm = pNameNorm.split(" ")[0];

  const isTargetInList = (list: any[]) => {
    return list.some((item) => {
      const rawId = typeof item === "object" && item !== null ? item.id || item.name : item;
      const itemStr = String(rawId || "");
      const itemNorm = normStr(itemStr);
      return (
        itemStr === pid ||
        (pNameNorm && itemNorm === pNameNorm) ||
        (pFirstNameNorm.length >= 4 && itemNorm === pFirstNameNorm)
      );
    });
  };

  const extractMemberId = (item: any): string => {
    if (typeof item === "object" && item !== null) {
      return String(item.id || item.name || "");
    }
    return String(item || "");
  };

  const playerMatches = (allMatches || []).filter((m) => {
    const teamA = Array.isArray(m.teamA) ? m.teamA : [];
    const teamB = Array.isArray(m.teamB) ? m.teamB : [];
    return isTargetInList(teamA) || isTargetInList(teamB);
  });

  const sortedMatches = [...playerMatches].sort((a, b) =>
    String(b.date || "").localeCompare(String(a.date || ""))
  );

  const matchesToAnalyze = periodo === "recente" ? sortedMatches.slice(0, 15) : sortedMatches;

  const wins = Number(resolvedPlayer.wins || 0);
  const losses = Number(resolvedPlayer.losses || 0);
  const totalPlayed =
    wins + losses > 0 ? wins + losses : Number(resolvedPlayer.matchesPlayed || sortedMatches.length);
  const winRate = totalPlayed > 0 ? Math.round((wins / totalPlayed) * 100) : 0;
  const elo = Math.round(resolvedPlayer.elo || 1200);

  const sortedActive = [...allPlayers]
    .filter((p) => p.status === "active" && !p.isDM && (p.matchesPlayed || 0) > 0)
    .sort((a, b) => (b.elo || 1200) - (a.elo || 1200));
  const rankPos = sortedActive.findIndex((p) => p.id === resolvedPlayer.id) + 1;

  const partnerStats = new Map<string, { wins: number; games: number }>();
  const recentPartnerStats = new Map<string, { wins: number; games: number }>();
  const rivalStats = new Map<string, { lossesTo: number; winsAgainst: number; games: number }>();
  const last5Details: string[] = [];

  matchesToAnalyze.forEach((m, idx) => {
    const teamA = Array.isArray(m.teamA) ? m.teamA : [];
    const teamB = Array.isArray(m.teamB) ? m.teamB : [];
    const isTeamA = isTargetInList(teamA);
    const myTeam = isTeamA ? teamA : teamB;
    const oppTeam = isTeamA ? teamB : teamA;

    const scoreA = Number(m.scoreA ?? m.pointsA ?? 0);
    const scoreB = Number(m.scoreB ?? m.pointsB ?? 0);
    const won =
      m.winner === (isTeamA ? "A" : "B") ||
      m.winner === (isTeamA ? "teamA" : "teamB") ||
      (isTeamA ? scoreA > scoreB : scoreB > scoreA);

    if (idx < 5) {
      const dateFormatted = m.date
        ? String(m.date).split("T")[0].split("-").reverse().slice(0, 2).join("/")
        : "Recente";
      const placar = scoreA || scoreB ? `${scoreA}x${scoreB}` : won ? "Vitória" : "Derrota";
      last5Details.push(`${won ? "✅ Vitória" : "❌ Derrota"} (${dateFormatted} - ${placar})`);
    }

    myTeam.forEach((rawAlly) => {
      const allyId = extractMemberId(rawAlly);
      const allyNorm = normStr(allyId);
      if (!allyId || allyId === pid || allyNorm === pNameNorm || allyNorm === pFirstNameNorm) return;

      const cur = partnerStats.get(allyId) || { wins: 0, games: 0 };
      cur.games += 1;
      if (won) cur.wins += 1;
      partnerStats.set(allyId, cur);

      if (idx < 15) {
        const rec = recentPartnerStats.get(allyId) || { wins: 0, games: 0 };
        rec.games += 1;
        if (won) rec.wins += 1;
        recentPartnerStats.set(allyId, rec);
      }
    });

    oppTeam.forEach((rawOpp) => {
      const oppId = extractMemberId(rawOpp);
      const oppNorm = normStr(oppId);
      if (!oppId || oppId === pid || oppNorm === pNameNorm || oppNorm === pFirstNameNorm) return;

      const cur = rivalStats.get(oppId) || { lossesTo: 0, winsAgainst: 0, games: 0 };
      cur.games += 1;
      if (won) cur.winsAgainst += 1;
      else cur.lossesTo += 1;
      rivalStats.set(oppId, cur);
    });
  });

  const resolveDisplayName = (key: string) =>
    playerMap.get(key) || playerMap.get(normStr(key)) || key;

  const minGamesHistorical =
    periodo === "recente" ? 3 : Math.max(5, Math.min(10, Math.floor(sortedMatches.length * 0.08)));
  let bestHistoricalPartner = "Sem parceiro com mínimo de jogos no período";
  let bestHistoricalScore = -1;

  partnerStats.forEach((st, allyId) => {
    if (st.games >= minGamesHistorical) {
      const wr = Math.round((st.wins / st.games) * 100);
      const weightedScore = (st.wins / (st.games + 4)) * 100 + st.wins * 0.5;
      if (weightedScore > bestHistoricalScore) {
        bestHistoricalScore = weightedScore;
        bestHistoricalPartner = `${resolveDisplayName(allyId)} (${st.wins}V em ${st.games} jogos - *${wr}%*)`;
      }
    }
  });

  if (bestHistoricalScore === -1) {
    partnerStats.forEach((st, allyId) => {
      if (st.games >= 2) {
        const wr = Math.round((st.wins / st.games) * 100);
        const score = st.wins * 10 + wr;
        if (score > bestHistoricalScore) {
          bestHistoricalScore = score;
          bestHistoricalPartner = `${resolveDisplayName(allyId)} (${st.wins}V em ${st.games} jogos - *${wr}%*)`;
        }
      }
    });
  }

  let mostWinsPartner = "N/A";
  let maxPartnerWins = 0;
  partnerStats.forEach((st, allyId) => {
    if (st.wins > maxPartnerWins) {
      maxPartnerWins = st.wins;
      const wr = Math.round((st.wins / st.games) * 100);
      mostWinsPartner = `${resolveDisplayName(allyId)} (*${st.wins} vitórias* juntos em ${st.games} jogos - ${wr}%)`;
    }
  });

  let hotPartner = "N/A";
  let bestHotScore = -1;
  recentPartnerStats.forEach((st, allyId) => {
    if (st.games >= 2) {
      const wr = Math.round((st.wins / st.games) * 100);
      const hotScore = st.wins * 12 + wr;
      if (hotScore > bestHotScore) {
        bestHotScore = hotScore;
        hotPartner = `${resolveDisplayName(allyId)} (${st.wins}V em ${st.games} jogos recentes - *${wr}%*)`;
      }
    }
  });

  let toughestRivalText = "Nenhum algoz definido ainda";
  let maxLosses = 0;
  rivalStats.forEach((st, oppId) => {
    if (st.lossesTo >= 2 && st.lossesTo > maxLosses) {
      maxLosses = st.lossesTo;
      toughestRivalText = `${resolveDisplayName(oppId)} (${st.lossesTo} derrotas contra em ${st.games} jogos)`;
    }
  });

  return (
    `📊 *RAIO-X E HISTÓRICO DO SÓCIO: ${resolvedPlayer.name}* (${
      periodo === "recente" ? "Recorte: Últimos 15 Jogos" : "Desde o Início do Clube"
    })\n` +
    `• Posição no Ranking: ${rankPos > 0 ? `#${rankPos} de ${sortedActive.length}` : "Sem ranking ativo"}\n` +
    `• Pontuação ELO: *${elo} pts*\n` +
    `• Posição em Quadra: ${
      resolvedPlayer.isOfficialSetter ? "Levantador Oficial *(L)*" : "Polivalente (Rodízio Completo)"
    }\n` +
    `• Cartel Oficial: *${totalPlayed} jogos* (*${wins} Vitórias* / *${losses} Derrotas* • Aproveitamento de *${winRate}%*)\n` +
    `• 🤝 *Maior Sinergia Consolidada:* ${bestHistoricalPartner}\n` +
    `• 🏆 *Mais Vitórias Juntos (Desde o início):* ${mostWinsPartner}\n` +
    `• 🔥 *Dupla em Alta (Últimos 15 jogos):* ${hotPartner}\n` +
    `• ⚔️ *Maior Rival na Rede:* ${toughestRivalText}\n` +
    `• Últimas 5 Partidas Registradas:\n  ${
      last5Details.length > 0 ? last5Details.join("\n  ") : "Sem súmulas detalhadas recentes."
    }`
  );
}

// ============================================================================
// 🧠 ORQUESTRADOR PRINCIPAL DO AGENTE GUERREIRINHO (2-Stage NLU + RAG)
// ============================================================================
export async function runDeepAnalyticsChat(
  apiKey: string,
  userMessage: string,
  senderPlayer: any,
  allPlayers: any[],
  allMatches: any[],
  callbacks?: AgentToolsCallbacks
): Promise<string> {
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
  const playerId = senderPlayer?.id || "anon";
  const msgNorm = normStr(userMessage);
  const pastTurns = getSessionHistory(playerId);

  // 1. Executa primeiro o detector local (Fuzzy + Pronomes + Comparação) como base ultra-rápida
  let referencedPlayers = detectReferencedPlayers(userMessage, senderPlayer, allPlayers, pastTurns);
  let periodoSolicitado: "geral" | "recente" = /\b(ultimos|recente|recentes|mes|fase atual)\b/.test(msgNorm)
    ? "recente"
    : "geral";

  // 2. Estágio 1 NLU com IA: Refina a interpretação semântica olhando a lista oficial de sócios
  const semanticNLU = await extractSemanticIntentWithAI(
    ai,
    userMessage,
    senderPlayer,
    allPlayers,
    pastTurns
  );

  if (semanticNLU) {
    if (semanticNLU.period === "recente") periodoSolicitado = "recente";

    if (Array.isArray(semanticNLU.targetPlayerNames) && semanticNLU.targetPlayerNames.length > 0) {
      const aiResolvedPlayers: any[] = [];
      for (const nameStr of semanticNLU.targetPlayerNames) {
        const matched = findBestPlayerByNameQuery(nameStr, allPlayers);
        if (matched && !aiResolvedPlayers.some((p) => p.id === matched.id)) {
          aiResolvedPlayers.push(matched);
        }
      }

      if (aiResolvedPlayers.length > 0) {
        if (
          (semanticNLU.intent === "COMPARE_PLAYERS" || semanticNLU.includeSenderInComparison) &&
          senderPlayer &&
          !aiResolvedPlayers.some((p) => p.id === senderPlayer.id)
        ) {
          referencedPlayers = [senderPlayer, ...aiResolvedPlayers];
        } else {
          referencedPlayers = aiResolvedPlayers;
        }
      }
    }
  }

  // 3. Executa ações de banco de dados se solicitadas (presença, ausência, lista, pix, ranking)
  const actionOutputs: string[] = [];
  if (callbacks) {
    const wantsConfirm =
      semanticNLU?.intent === "CONFIRM_ATTENDANCE" ||
      (/\b(confirma|confirmar|coloca meu nome|bota meu nome|eu vou|vou jogar)\b/.test(msgNorm) &&
        !/\b(nao vou|naovou)\b/.test(msgNorm));
    const wantsDecline =
      semanticNLU?.intent === "DECLINE_ATTENDANCE" ||
      /\b(nao vou|naovou|vou faltar|tira meu nome|cancelar presenca)\b/.test(msgNorm);

    if (wantsConfirm) {
      actionOutputs.push(await callbacks.confirmAttendance());
    } else if (wantsDecline) {
      actionOutputs.push(await callbacks.declineAttendance());
    }

    if (
      semanticNLU?.intent === "VIEW_LIST" ||
      /\b(mostra a lista|ver a lista|quem vai|lista atualizada|lista de confirmados)\b/.test(msgNorm)
    ) {
      actionOutputs.push(await callbacks.getAttendanceList());
    }
    if (
      semanticNLU?.intent === "CHECK_PIX" ||
      /\b(chave pix|codigo pix|valor da mensalidade|dados do pix)\b/.test(msgNorm)
    ) {
      actionOutputs.push(await callbacks.getPixInfo());
    }
    if (
      semanticNLU?.intent === "VIEW_RANKING" ||
      /\b(tabela do ranking|ranking geral|top do ranking)\b/.test(msgNorm)
    ) {
      actionOutputs.push(await callbacks.getRanking());
    }
  }

  // 4. Monta o dossiê exato de acordo com os jogadores identificados (Individual ou Comparativo)
  let contextDataBlock = "";
  let primaryFallbackReport = "";
  const referencedIds = referencedPlayers.map((p) => p.id).filter(Boolean);

  if (referencedPlayers.length >= 2) {
    const p1 = referencedPlayers[0];
    const p2 = referencedPlayers[1];
    const h2hReport = buildHeadToHeadComparisonReport(p1, p2, allPlayers, allMatches);
    const rep1 = buildPlayerDeepStatsReport(p1, allPlayers, allMatches, periodoSolicitado);
    const rep2 = buildPlayerDeepStatsReport(p2, allPlayers, allMatches, periodoSolicitado);
    contextDataBlock = `${h2hReport}\n\n${rep1}\n\n${rep2}`;
    primaryFallbackReport = h2hReport;
  } else {
    const target = referencedPlayers[0] || senderPlayer;
    const targetReport = buildPlayerDeepStatsReport(target, allPlayers, allMatches, periodoSolicitado);
    const senderReport =
      target?.id !== senderPlayer?.id
        ? buildPlayerDeepStatsReport(senderPlayer, allPlayers, allMatches, "geral")
        : "";
    contextDataBlock = `${targetReport}${
      senderReport ? `\n\nDADOS DO REMETENTE (${senderPlayer?.name}):\n${senderReport}` : ""
    }`;
    primaryFallbackReport = targetReport;
  }

  const memoryTranscript =
    pastTurns.length > 0
      ? pastTurns.map((t) => `${t.role === "user" ? "Sócio" : "Guerreirinho"}: ${t.text}`).join("\n")
      : "Início da conversa.";

  const systemInstruction = `
Você é o *Guerreirinho*, o Agente de IA oficial e mascote digital do clube de vôlei "Guerreiros VC" de Recife/PE.
Você é carismático, inteligente, resenheiro, prestativo e conhece cada estatística do clube.

REGRAS E CULTURA DO CLUBE:
1. Jogos toda quinta-feira à noite. Limite de 29 sócios ativos na lista.
2. A única posição fixa em quadra é a de Levantador Oficial *(L)*. Todos os outros jogadores são polivalentes e rodam em todas as posições.
3. O equilíbrio dos times é feito pelo sistema de pontuação ELO e distribuição justa de levantadores.

DIRETRIZES DE RESPOSTA:
1. Quem enviou a mensagem foi *${senderPlayer?.name || "Sócio"}*.
2. Use ESTRITAMENTE os números oficiais fornecidos no bloco "DADOS OFICIAIS DO BANCO DE DADOS" abaixo. Nunca invente números.
3. Se houver um bloco *COMPARATIVO OFICIAL* abaixo, apresente-o de forma completa (mostrando o cartel de cada um, quantos jogos fizeram juntos no mesmo time e o placar do confronto direto em lados opostos) e comente a parceria/rivalidade com entusiasmo!
4. Se o sócio perguntar apenas um dado específico de alguém (ex: "quantas vitórias tem a Mari?"), destaque a resposta logo na primeira frase e apresente o Raio-X dela logo abaixo.
5. Se o sócio perguntar sobre assuntos fora do vôlei (ex: comida, tempo, dores musculares), responda com bom humor e dê uma dica prática ligando ao aquecimento, preparo físico ou ao jogo de quinta-feira.
6. Finalize sempre com uma pergunta curta e amigável para manter a conversa ativa. Não coloque assinatura no final, pois o servidor já assina.

${actionOutputs.length > 0 ? `AÇÕES EXECUTADAS AGORA NO SISTEMA:\n${actionOutputs.join("\n\n")}\n` : ""}
DADOS OFICIAIS DO BANCO DE DADOS PARA ESTA PERGUNTA:
${contextDataBlock}

MEMÓRIA RECENTE DESTA CONVERSA:
${memoryTranscript}
`;

  try {
    appendSessionHistory(playerId, "user", userMessage, referencedIds);

    const response = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: `Mensagem do sócio ${senderPlayer?.name}: "${userMessage}"`,
      config: {
        systemInstruction
      }
    });

    const replyText = (response.text || "").trim();
    if (replyText) {
      appendSessionHistory(playerId, "model", replyText, referencedIds);
      return replyText;
    }

    return primaryFallbackReport;
  } catch (err: any) {
    console.error("[GuerreirinhoAgent] Erro na geração final:", err);
    if (actionOutputs.length > 0) {
      return `${actionOutputs.join("\n\n")}\n\n${primaryFallbackReport}`;
    }
    return (
      `🏐 Fala, *${senderPlayer?.name}*! Confira o levantamento oficial que puxei no sistema:\n\n` +
      `${primaryFallbackReport}\n\n` +
      `💬 _Quer que eu filtre apenas os últimos 15 jogos ou compare com outro sócio?_`
    );
  }
}