import { Resvg } from "@resvg/resvg-js";

export interface CardPlayer {
  id: string;
  uid?: string;
  name: string;
  elo?: number;
  wins?: number;
  losses?: number;
  matchesPlayed?: number;
  status?: string;
  isDM?: boolean;
  isOfficialSetter?: boolean;
  photoUrl?: string;
  whatsappPhotoUrl?: string;
}

export interface CardMatch {
  id?: string;
  date?: string;
  timestamp?: number;
  createdAt?: number;
  updatedAt?: number;
  startTime?: number;
  endTime?: number;
  duration?: number;
  durationSeconds?: number;
  matchDuration?: number;
  elapsedTime?: number;
  teamA?: any[];
  teamB?: any[];
  scoreA?: number;
  scoreB?: number;
  teamAScore?: number;
  teamBScore?: number;
  winner?: "A" | "B" | string;
}

export interface TimelineMatchItem {
  index: number;
  label: string; // J01..
  status: "WIN" | "LOSS" | "OUT";
  scoreText: string; // "15x11"
  myScore: number;
  oppScore: number;
  diff: number;
  durationLabel: string;
  durationSeconds: number;
  teammates: string[]; // full first names
}

export interface PairMetricItem {
  label: string;
  names: string[]; // full first names
  photos: Array<string | null>;
  wins: number;
  losses: number;
  games: number;
  winRate: number;
  accent: "emerald" | "cyan" | "gold" | "coral" | "violet";
  subtitle?: string;
}

export interface H2HMetricItem {
  winnerName: string;
  winnerPhoto: string | null;
  loserName: string;
  loserPhoto: string | null;
  wins: number;
  losses: number;
  games: number;
  winRate: number;
}

export interface LowRateItem {
  id: string;
  name: string; // full first name
  photo: string | null;
  wins: number;
  losses: number;
  games: number;
  winRate: number;
}

export interface IndividualNightCardData {
  playerId: string;
  firstName: string;
  fullName: string;
  photo: string | null;
  dateKey: string;
  dateLabel: string;
  gamesPlayed: number;
  totalMatchesNight: number;
  wins: number;
  losses: number;
  winRate: number;
  pointsDiff: number;
  eloDelta: number;
  currentElo: number;
  nightRank: number;
  nightTotalPlayers: number;
  courtTimeLabel: string;
  timeline: TimelineMatchItem[];
  bestSynergy: PairMetricItem | null;
  worstSynergy: PairMetricItem | null;
  victim: PairMetricItem | null; // freguês
  nemesis: PairMetricItem | null; // carrasco
}

export interface DailyRankingRow {
  id: string;
  rank: number;
  firstName: string;
  fullName: string;
  photo: string | null;
  wins: number;
  losses: number;
  games: number;
  winRate: number;
  pointsDiff: number;
  eloDelta: number;
  sequence: Array<"W" | "L">;
}

export interface SpotlightAthlete {
  id: string;
  title: string;
  firstName: string;
  photo: string | null;
  primaryStat: string;
  secondaryStat: string;
  accent: "gold" | "cyan" | "emerald";
}

export interface DailyRankingCardData {
  dateKey: string;
  dateLabel: string;
  totalMatches: number;
  totalAthletes: number;
  mvp: SpotlightAthlete | null;
  bestSetter: SpotlightAthlete | null;
  mostEfficient: SpotlightAthlete | null;
  topRows: DailyRankingRow[];
  bestDuosTrios: PairMetricItem[];
  synergyHigh: PairMetricItem | null;
  synergyLow: PairMetricItem | null;
  rivals: H2HMetricItem[];
  lowestSuccess: LowRateItem[];
}

export interface AccumulatedRankingRow {
  id: string;
  rank: number;
  prevRank: number;
  rankDelta: number; // positive = climbed (▲), negative = dropped (▼), 0 = unchanged
  firstName: string;
  fullName: string;
  photo: string | null;
  elo: number;
  wins: number;
  losses: number;
  games: number;
  winRate: number;
  recentForm: Array<"W" | "L">;
}

export interface AccumulatedRankingCardData {
  referenceDateLabel: string;
  totalActivePlayers: number;
  totalMatchesHistory: number;
  topRows: AccumulatedRankingRow[];
  bestDuosTrios: PairMetricItem[];
  synergyHigh: PairMetricItem | null;
  synergyLow: PairMetricItem | null;
  rivals: H2HMetricItem[];
  lowestSuccess: LowRateItem[];
}

export interface EloCurvePoint {
  dateKey: string;
  dateLabel: string;
  elo: number;
  delta: number;
  wins: number;
  losses: number;
}

// ============================================================================
// HELPERS DE DADOS (ZERO ABREVIAÇÃO NO PRIMEIRO NOME • ZERO DADO FICTÍCIO)
// ============================================================================

export function getFullFirstName(name?: string | null): string {
  const cleaned = String(name || "").trim().replace(/\s+/g, " ");
  if (!cleaned) return "Atleta";
  const first = cleaned.split(" ")[0];
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function getDateKeyBR(ts?: number): string {
  const date = ts ? new Date(ts) : new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return fmt.format(date);
}

export function formatDateBR(dateKey: string): string {
  const parts = String(dateKey || "").split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateKey || "--/--/----";
}

function formatShortDateBR(dateKey: string): string {
  const parts = String(dateKey || "").split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
  return dateKey;
}

function getMatchDateKey(m: CardMatch): string {
  if (m.date && /^\d{4}-\d{2}-\d{2}$/.test(m.date)) return m.date;
  const ts = Number(m.timestamp || m.createdAt || m.endTime || 0);
  return ts > 0 ? getDateKeyBR(ts) : "";
}

function extractTeamIds(team: any): string[] {
  if (!Array.isArray(team)) return [];
  return team
    .map((item) => (typeof item === "string" ? item : item?.id || item?.uid || ""))
    .filter(Boolean);
}

function getMatchScores(m: CardMatch): { scoreA: number; scoreB: number; winner: "A" | "B" } {
  const scoreA = Number(m.scoreA ?? m.teamAScore ?? 0);
  const scoreB = Number(m.scoreB ?? m.teamBScore ?? 0);
  const winner: "A" | "B" =
    m.winner === "A" || m.winner === "B" ? m.winner : scoreA >= scoreB ? "A" : "B";
  return { scoreA, scoreB, winner };
}

export function resolveCardMatchDuration(
  match: CardMatch,
  prevMatchTimestamp?: number
): { label: string; seconds: number; isEstimated: boolean } {
  const rawDur = Number(
    match.duration || match.durationSeconds || match.matchDuration || match.elapsedTime || 0
  );
  const rawSec = rawDur > 36000 ? Math.round(rawDur / 1000) : Math.round(rawDur);

  if (rawSec >= 120 && rawSec <= 5400) {
    const mins = Math.floor(rawSec / 60);
    const secs = rawSec % 60;
    return {
      label: secs > 0 ? `${mins}m${String(secs).padStart(2, "0")}s` : `${mins}m`,
      seconds: rawSec,
      isEstimated: false
    };
  }

  if (match.startTime && match.endTime) {
    const spanSec = Math.round((Number(match.endTime) - Number(match.startTime)) / 1000);
    if (spanSec >= 120 && spanSec <= 5400) {
      const mins = Math.floor(spanSec / 60);
      const secs = spanSec % 60;
      return {
        label: secs > 0 ? `${mins}m${String(secs).padStart(2, "0")}s` : `${mins}m`,
        seconds: spanSec,
        isEstimated: false
      };
    }
  }

  const curTs = Number(match.endTime || match.timestamp || match.createdAt || 0);
  if (prevMatchTimestamp && curTs > prevMatchTimestamp) {
    const deltaSec = Math.round((curTs - prevMatchTimestamp) / 1000);
    if (deltaSec >= 180 && deltaSec <= 3000) {
      const estSec = Math.max(240, deltaSec - 90);
      const estMin = Math.round(estSec / 60);
      return { label: `~${estMin}m`, seconds: estSec, isEstimated: true };
    }
  }

  return { label: "N/D", seconds: 0, isEstimated: true };
}

function resolveSafePhotoDataUri(player?: CardPlayer | null): string | null {
  if (!player) return null;
  const raw = String(player.photoUrl || player.whatsappPhotoUrl || "").trim();
  if (!raw) return null;
  if (/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(raw)) {
    return raw.replace(/\s+/g, "");
  }
  return null;
}

function buildPlayerLookup(allPlayers: CardPlayer[]): Map<string, CardPlayer> {
  const map = new Map<string, CardPlayer>();
  for (const p of allPlayers || []) {
    if (!p) continue;
    if (p.id) map.set(p.id, p);
    if (p.uid) map.set(p.uid, p);
  }
  return map;
}

function canonicalId(id: string, playerMap: Map<string, CardPlayer>): string {
  const p = playerMap.get(id);
  return p?.id || id;
}

function isEligibleMember(p?: CardPlayer | null): boolean {
  if (!p) return false;
  if (p.isDM) return false;
  if (String(p.name || "").trim().toLowerCase() === "financeiro") return false;
  return p.status === "active" || p.status === "guest" || !p.status || p.status === "";
}

// ============================================================================
// CÁLCULO DE DUPLAS, TRIOS, SINERGIAS E CARRASCOS/FREGUESES
// ============================================================================

function computeGroupModules(
  matches: CardMatch[],
  playerMap: Map<string, CardPlayer>,
  opts: { minDuoGames: number; minTrioGames: number; minH2HGames: number; minLowRateGames: number }
): {
  bestDuosTrios: PairMetricItem[];
  synergyHigh: PairMetricItem | null;
  synergyLow: PairMetricItem | null;
  rivals: H2HMetricItem[];
  lowestSuccess: LowRateItem[];
} {
  const duoStats = new Map<string, { ids: [string, string]; wins: number; games: number }>();
  const trioStats = new Map<string, { ids: [string, string, string]; wins: number; games: number }>();
  const h2hStats = new Map<string, { a: string; b: string; aWins: number; bWins: number; games: number }>();
  const indivStats = new Map<string, { wins: number; losses: number; games: number }>();

  for (const m of matches) {
    const rawA = extractTeamIds(m.teamA).map((id) => canonicalId(id, playerMap));
    const rawB = extractTeamIds(m.teamB).map((id) => canonicalId(id, playerMap));
    const teamA = Array.from(new Set(rawA));
    const teamB = Array.from(new Set(rawB));
    const { winner } = getMatchScores(m);
    const aWon = winner === "A";

    const recordTeam = (team: string[], won: boolean) => {
      for (const pid of team) {
        const st = indivStats.get(pid) || { wins: 0, losses: 0, games: 0 };
        st.games += 1;
        if (won) st.wins += 1;
        else st.losses += 1;
        indivStats.set(pid, st);
      }

      const sorted = [...team].sort();
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const key = `${sorted[i]}|${sorted[j]}`;
          const st = duoStats.get(key) || { ids: [sorted[i], sorted[j]], wins: 0, games: 0 };
          st.games += 1;
          if (won) st.wins += 1;
          duoStats.set(key, st);
        }
      }

      if (sorted.length >= 3) {
        for (let i = 0; i < sorted.length; i++) {
          for (let j = i + 1; j < sorted.length; j++) {
            for (let k = j + 1; k < sorted.length; k++) {
              const key = `${sorted[i]}|${sorted[j]}|${sorted[k]}`;
              const st = trioStats.get(key) || {
                ids: [sorted[i], sorted[j], sorted[k]],
                wins: 0,
                games: 0
              };
              st.games += 1;
              if (won) st.wins += 1;
              trioStats.set(key, st);
            }
          }
        }
      }
    };

    recordTeam(teamA, aWon);
    recordTeam(teamB, !aWon);

    for (const pidA of teamA) {
      for (const pidB of teamB) {
        if (pidA === pidB) continue;
        const [first, second] = pidA < pidB ? [pidA, pidB] : [pidB, pidA];
        const key = `${first}|${second}`;
        const st = h2hStats.get(key) || { a: first, b: second, aWins: 0, bWins: 0, games: 0 };
        st.games += 1;
        const firstWon = (first === pidA && aWon) || (first === pidB && !aWon);
        if (firstWon) st.aWins += 1;
        else st.bWins += 1;
        h2hStats.set(key, st);
      }
    }
  }

  const formatPair = (
    ids: string[],
    wins: number,
    games: number,
    accent: PairMetricItem["accent"],
    subtitle?: string
  ): PairMetricItem => {
    const names = ids.map((id) => getFullFirstName(playerMap.get(id)?.name));
    const photos = ids.map((id) => resolveSafePhotoDataUri(playerMap.get(id)));
    const losses = games - wins;
    return {
      label: names.join(" + "),
      names,
      photos,
      wins,
      losses,
      games,
      winRate: games > 0 ? Math.round((wins / games) * 100) : 0,
      accent,
      subtitle
    };
  };

  // Duplas elegíveis
  let validDuos = Array.from(duoStats.values()).filter((d) => d.games >= opts.minDuoGames);
  if (validDuos.length === 0 && opts.minDuoGames > 1) {
    validDuos = Array.from(duoStats.values()).filter((d) => d.games >= Math.max(1, opts.minDuoGames - 1));
  }

  const duosByBest = [...validDuos].sort((a, b) => {
    const wrDiff = b.wins / b.games - a.wins / a.games;
    if (Math.abs(wrDiff) > 0.001) return wrDiff;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.games - a.games;
  });

  const duosByWorst = [...validDuos].sort((a, b) => {
    const wrDiff = a.wins / a.games - b.wins / b.games;
    if (Math.abs(wrDiff) > 0.001) return wrDiff;
    const lossDiff = (b.games - b.wins) - (a.games - a.wins);
    if (lossDiff !== 0) return lossDiff;
    return b.games - a.games;
  });

  // Trios elegíveis (somente se houve amostra real)
  const validTrios = Array.from(trioStats.values())
    .filter((t) => t.games >= opts.minTrioGames && t.wins > 0)
    .sort((a, b) => {
      const wrDiff = b.wins / b.games - a.wins / a.games;
      if (Math.abs(wrDiff) > 0.001) return wrDiff;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.games - a.games;
    });

  const bestDuosTrios: PairMetricItem[] = [];
  if (duosByBest[0]) {
    bestDuosTrios.push(formatPair(duosByBest[0].ids, duosByBest[0].wins, duosByBest[0].games, "cyan", "DUPLA #1"));
  }
  if (validTrios[0]) {
    bestDuosTrios.push(formatPair(validTrios[0].ids, validTrios[0].wins, validTrios[0].games, "gold", "TRIO #1"));
  } else if (duosByBest[1]) {
    bestDuosTrios.push(formatPair(duosByBest[1].ids, duosByBest[1].wins, duosByBest[1].games, "emerald", "DUPLA #2"));
  }

  const synergyHigh = duosByBest[0]
    ? formatPair(duosByBest[0].ids, duosByBest[0].wins, duosByBest[0].games, "emerald", "MAIOR SINERGIA")
    : null;

  const synergyLowCandidate = duosByWorst.find(
    (d) =>
      !duosByBest[0] ||
      d.ids.join("|") !== duosByBest[0].ids.join("|")
  );
  const synergyLow = synergyLowCandidate
    ? formatPair(synergyLowCandidate.ids, synergyLowCandidate.wins, synergyLowCandidate.games, "coral", "MENOR SINERGIA")
    : null;

  // Carrascos x Fregueses
  let validH2H = Array.from(h2hStats.values()).filter(
    (h) => h.games >= opts.minH2HGames && h.aWins !== h.bWins
  );
  if (validH2H.length === 0 && opts.minH2HGames > 2) {
    validH2H = Array.from(h2hStats.values()).filter((h) => h.games >= 2 && h.aWins !== h.bWins);
  }
  const rivals: H2HMetricItem[] = validH2H
    .map((h) => {
      const aDominates = h.aWins > h.bWins;
      const wId = aDominates ? h.a : h.b;
      const lId = aDominates ? h.b : h.a;
      const wins = aDominates ? h.aWins : h.bWins;
      const losses = aDominates ? h.bWins : h.aWins;
      return {
        winnerName: getFullFirstName(playerMap.get(wId)?.name),
        winnerPhoto: resolveSafePhotoDataUri(playerMap.get(wId)),
        loserName: getFullFirstName(playerMap.get(lId)?.name),
        loserPhoto: resolveSafePhotoDataUri(playerMap.get(lId)),
        wins,
        losses,
        games: h.games,
        winRate: Math.round((wins / h.games) * 100)
      };
    })
    .sort((a, b) => {
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      if (b.wins - b.losses !== a.wins - a.losses) return (b.wins - b.losses) - (a.wins - a.losses);
      return b.games - a.games;
    })
    .slice(0, 2);

  // Menor Taxa de Sucesso (sempre com nome completo do primeiro nome + foto)
  let validLow = Array.from(indivStats.entries())
    .filter(([id, st]) => st.games >= opts.minLowRateGames && isEligibleMember(playerMap.get(id)))
    .map(([id, st]) => ({
      id,
      name: getFullFirstName(playerMap.get(id)?.name),
      photo: resolveSafePhotoDataUri(playerMap.get(id)),
      wins: st.wins,
      losses: st.losses,
      games: st.games,
      winRate: Math.round((st.wins / st.games) * 100)
    }));

  if (validLow.length === 0) {
    validLow = Array.from(indivStats.entries())
      .filter(([id, st]) => st.games >= 1 && isEligibleMember(playerMap.get(id)))
      .map(([id, st]) => ({
        id,
        name: getFullFirstName(playerMap.get(id)?.name),
        photo: resolveSafePhotoDataUri(playerMap.get(id)),
        wins: st.wins,
        losses: st.losses,
        games: st.games,
        winRate: Math.round((st.wins / st.games) * 100)
      }));
  }

  const lowestSuccess = validLow
    .sort((a, b) => {
      if (a.winRate !== b.winRate) return a.winRate - b.winRate;
      if (b.losses !== a.losses) return b.losses - a.losses;
      return b.games - a.games;
    })
    .slice(0, 2);

  return { bestDuosTrios, synergyHigh, synergyLow, rivals, lowestSuccess };
}

// ============================================================================
// 1) DATA BUILDER: CARD INDIVIDUAL DA NOITE (gv dia)
// ============================================================================

export function computeIndividualNightData(
  player: CardPlayer,
  allMatches: CardMatch[],
  allPlayers: CardPlayer[],
  requestedDateStr?: string
): IndividualNightCardData | null {
  if (!player || !Array.isArray(allMatches) || allMatches.length === 0) return null;
  const playerMap = buildPlayerLookup(allPlayers);
  const myIds = new Set([player.id, player.uid].filter(Boolean) as string[]);

  // Determina a data-alvo: pedida -> última data em que o atleta jogou -> última data do clube
  let targetDate = requestedDateStr || "";
  if (!targetDate) {
    const playedMatches = allMatches
      .filter((m) => {
        const ids = [...extractTeamIds(m.teamA), ...extractTeamIds(m.teamB)];
        return ids.some((id) => myIds.has(id));
      })
      .sort((a, b) => Number(b.timestamp || b.createdAt || 0) - Number(a.timestamp || a.createdAt || 0));

    if (playedMatches[0]) {
      targetDate = getMatchDateKey(playedMatches[0]);
    } else {
      const sorted = [...allMatches].sort(
        (a, b) => Number(b.timestamp || b.createdAt || 0) - Number(a.timestamp || a.createdAt || 0)
      );
      targetDate = sorted[0] ? getMatchDateKey(sorted[0]) : getDateKeyBR();
    }
  }

  const nightMatches = allMatches
    .filter((m) => getMatchDateKey(m) === targetDate)
    .sort((a, b) => Number(a.timestamp || a.createdAt || 0) - Number(b.timestamp || b.createdAt || 0));

  if (nightMatches.length === 0) return null;

  let wins = 0;
  let losses = 0;
  let pointsDiff = 0;
  let totalPlayedSec = 0;
  let hadEstimated = false;

  const mateMap = new Map<string, { wins: number; games: number }>();
  const oppMap = new Map<string, { wins: number; games: number }>();
  const nightStandings = new Map<string, { wins: number; losses: number; games: number; diff: number; eloDelta: number }>();

  const timeline: TimelineMatchItem[] = [];
  let prevTs: number | undefined;

  nightMatches.forEach((m, idx) => {
    const teamA = extractTeamIds(m.teamA).map((id) => canonicalId(id, playerMap));
    const teamB = extractTeamIds(m.teamB).map((id) => canonicalId(id, playerMap));
    const { scoreA, scoreB, winner } = getMatchScores(m);
    const dur = resolveCardMatchDuration(m, prevTs);
    const curTs = Number(m.endTime || m.timestamp || m.createdAt || 0);
    if (curTs > 0) prevTs = curTs;

    // Atualiza ranking da noite de todos os atletas
    const applyNightStat = (ids: string[], won: boolean, diff: number) => {
      for (const pid of ids) {
        const st = nightStandings.get(pid) || { wins: 0, losses: 0, games: 0, diff: 0, eloDelta: 0 };
        st.games += 1;
        if (won) {
          st.wins += 1;
          st.eloDelta += 20;
        } else {
          st.losses += 1;
          st.eloDelta -= 20;
        }
        st.diff += diff;
        nightStandings.set(pid, st);
      }
    };
    applyNightStat(teamA, winner === "A", scoreA - scoreB);
    applyNightStat(teamB, winner === "B", scoreB - scoreA);

    const inA = teamA.some((id) => myIds.has(id) || id === player.id);
    const inB = teamB.some((id) => myIds.has(id) || id === player.id);

    if (inA || inB) {
      const won = (inA && winner === "A") || (inB && winner === "B");
      const myScore = inA ? scoreA : scoreB;
      const oppScore = inA ? scoreB : scoreA;
      const diff = myScore - oppScore;
      const myTeam = inA ? teamA : teamB;
      const oppTeam = inA ? teamB : teamA;

      if (won) wins += 1;
      else losses += 1;
      pointsDiff += diff;
      if (dur.seconds > 0) {
        totalPlayedSec += dur.seconds;
        if (dur.isEstimated) hadEstimated = true;
      }

      const teammateIds = myTeam.filter((id) => !myIds.has(id) && id !== player.id);
      const teammates = teammateIds.map((id) => getFullFirstName(playerMap.get(id)?.name));

      for (const tid of teammateIds) {
        const st = mateMap.get(tid) || { wins: 0, games: 0 };
        st.games += 1;
        if (won) st.wins += 1;
        mateMap.set(tid, st);
      }
      for (const oid of oppTeam) {
        if (myIds.has(oid) || oid === player.id) continue;
        const st = oppMap.get(oid) || { wins: 0, games: 0 };
        st.games += 1;
        if (won) st.wins += 1;
        oppMap.set(oid, st);
      }

      timeline.push({
        index: idx + 1,
        label: `J${String(idx + 1).padStart(2, "0")}`,
        status: won ? "WIN" : "LOSS",
        scoreText: `${myScore}×${oppScore}`,
        myScore,
        oppScore,
        diff,
        durationLabel: dur.label,
        durationSeconds: dur.seconds,
        teammates
      });
    } else {
      timeline.push({
        index: idx + 1,
        label: `J${String(idx + 1).padStart(2, "0")}`,
        status: "OUT",
        scoreText: `${scoreA}×${scoreB}`,
        myScore: scoreA,
        oppScore: scoreB,
        diff: 0,
        durationLabel: dur.label,
        durationSeconds: dur.seconds,
        teammates: []
      });
    }
  });

  // Bônus de presença (+20 ELO se jogou >= 2 jogos)
  nightStandings.forEach((st) => {
    if (st.games >= 2) st.eloDelta += 20;
  });

  const sortedNight = Array.from(nightStandings.entries()).sort((a, b) => {
    if (b[1].eloDelta !== a[1].eloDelta) return b[1].eloDelta - a[1].eloDelta;
    if (b[1].wins !== a[1].wins) return b[1].wins - a[1].wins;
    return b[1].diff - a[1].diff;
  });

  const rankIdx = sortedNight.findIndex(([id]) => id === player.id || myIds.has(id));
  const nightRank = rankIdx >= 0 ? rankIdx + 1 : sortedNight.length;
  const myNightStats = nightStandings.get(player.id);
  const gamesPlayed = wins + losses;
  const winRate = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0;
  const eloDelta = myNightStats ? myNightStats.eloDelta : wins * 20 - losses * 20 + (gamesPlayed >= 2 ? 20 : 0);

  let courtTimeLabel = "N/D";
  if (totalPlayedSec > 0) {
    const mins = Math.round(totalPlayedSec / 60);
    courtTimeLabel = `${hadEstimated ? "~" : ""}${mins} min`;
  }

  // Sinergia individual e confrontos da noite
  const mateEntries = Array.from(mateMap.entries());
  const bestMate = [...mateEntries]
    .filter(([, st]) => st.wins > 0)
    .sort((a, b) => {
      const wr = b[1].wins / b[1].games - a[1].wins / a[1].games;
      if (Math.abs(wr) > 0.001) return wr;
      if (b[1].wins !== a[1].wins) return b[1].wins - a[1].wins;
      return b[1].games - a[1].games;
    })[0];

  const worstMate = [...mateEntries]
    .filter(([id, st]) => st.games - st.wins > 0 && (!bestMate || id !== bestMate[0]))
    .sort((a, b) => {
      const wr = a[1].wins / a[1].games - b[1].wins / b[1].games;
      if (Math.abs(wr) > 0.001) return wr;
      return (b[1].games - b[1].wins) - (a[1].games - a[1].wins);
    })[0];

  const oppEntries = Array.from(oppMap.entries());
  const bestVictim = [...oppEntries]
    .filter(([, st]) => st.wins > st.games - st.wins)
    .sort((a, b) => {
      const wr = b[1].wins / b[1].games - a[1].wins / a[1].games;
      if (Math.abs(wr) > 0.001) return wr;
      return b[1].wins - a[1].wins;
    })[0];

  const worstNemesis = [...oppEntries]
    .filter(([, st]) => st.games - st.wins > st.wins)
    .sort((a, b) => {
      const lr = (b[1].games - b[1].wins) / b[1].games - (a[1].games - a[1].wins) / a[1].games;
      if (Math.abs(lr) > 0.001) return lr;
      return (b[1].games - b[1].wins) - (a[1].games - a[1].wins);
    })[0];

  const toSinglePair = (
    entry: [string, { wins: number; games: number }] | undefined,
    accent: PairMetricItem["accent"],
    subtitle: string,
    invertRate = false
  ): PairMetricItem | null => {
    if (!entry) return null;
    const [pid, st] = entry;
    const p = playerMap.get(pid);
    const fname = getFullFirstName(p?.name);
    const lossesCnt = st.games - st.wins;
    const wr = invertRate
      ? Math.round((lossesCnt / st.games) * 100)
      : Math.round((st.wins / st.games) * 100);
    return {
      label: fname,
      names: [fname],
      photos: [resolveSafePhotoDataUri(p)],
      wins: st.wins,
      losses: lossesCnt,
      games: st.games,
      winRate: wr,
      accent,
      subtitle
    };
  };

  return {
    playerId: player.id,
    firstName: getFullFirstName(player.name),
    fullName: player.name,
    photo: resolveSafePhotoDataUri(player),
    dateKey: targetDate,
    dateLabel: formatDateBR(targetDate),
    gamesPlayed,
    totalMatchesNight: nightMatches.length,
    wins,
    losses,
    winRate,
    pointsDiff,
    eloDelta,
    currentElo: Math.round(player.elo || 1200),
    nightRank,
    nightTotalPlayers: sortedNight.length,
    courtTimeLabel,
    timeline,
    bestSynergy: toSinglePair(bestMate, "emerald", "MAIOR SINERGIA"),
    worstSynergy: toSinglePair(worstMate, "coral", "MENOR SINERGIA"),
    victim: toSinglePair(bestVictim, "cyan", "FREGUÊS DA NOITE"),
    nemesis: toSinglePair(worstNemesis, "violet", "CARRASCO DA NOITE", true)
  };
}

// ============================================================================
// 2) DATA BUILDER: RANKING DO DIA (MVP + LEVANTADOR + MAIS EFICIENTE + TOP 8)
// ============================================================================

export function computeDailyRankingData(
  allMatches: CardMatch[],
  allPlayers: CardPlayer[],
  requestedDateStr?: string
): DailyRankingCardData | null {
  if (!Array.isArray(allMatches) || allMatches.length === 0) return null;
  const playerMap = buildPlayerLookup(allPlayers);

  let targetDate = requestedDateStr || "";
  if (!targetDate) {
    const sorted = [...allMatches].sort(
      (a, b) => Number(b.timestamp || b.createdAt || 0) - Number(a.timestamp || a.createdAt || 0)
    );
    targetDate = sorted[0] ? getMatchDateKey(sorted[0]) : getDateKeyBR();
  }

  const nightMatches = allMatches
    .filter((m) => getMatchDateKey(m) === targetDate)
    .sort((a, b) => Number(a.timestamp || a.createdAt || 0) - Number(b.timestamp || b.createdAt || 0));

  if (nightMatches.length === 0) return null;

  const stats = new Map<
    string,
    { wins: number; losses: number; games: number; pointsDiff: number; eloDelta: number; sequence: Array<"W" | "L"> }
  >();

  for (const m of nightMatches) {
    const teamA = Array.from(new Set(extractTeamIds(m.teamA).map((id) => canonicalId(id, playerMap))));
    const teamB = Array.from(new Set(extractTeamIds(m.teamB).map((id) => canonicalId(id, playerMap))));
    const { scoreA, scoreB, winner } = getMatchScores(m);

    const record = (ids: string[], won: boolean, diff: number) => {
      for (const pid of ids) {
        const st = stats.get(pid) || {
          wins: 0,
          losses: 0,
          games: 0,
          pointsDiff: 0,
          eloDelta: 0,
          sequence: []
        };
        st.games += 1;
        if (won) {
          st.wins += 1;
          st.eloDelta += 20;
          st.sequence.push("W");
        } else {
          st.losses += 1;
          st.eloDelta -= 20;
          st.sequence.push("L");
        }
        st.pointsDiff += diff;
        stats.set(pid, st);
      }
    };

    record(teamA, winner === "A", scoreA - scoreB);
    record(teamB, winner === "B", scoreB - scoreA);
  }

  stats.forEach((st) => {
    if (st.games >= 2) st.eloDelta += 20;
  });

  const allRows: DailyRankingRow[] = Array.from(stats.entries())
    .map(([id, st]) => {
      const p = playerMap.get(id);
      return {
        id,
        rank: 0,
        firstName: getFullFirstName(p?.name),
        fullName: p?.name || "Atleta",
        photo: resolveSafePhotoDataUri(p),
        wins: st.wins,
        losses: st.losses,
        games: st.games,
        winRate: st.games > 0 ? Math.round((st.wins / st.games) * 100) : 0,
        pointsDiff: st.pointsDiff,
        eloDelta: st.eloDelta,
        sequence: st.sequence.slice(-6)
      };
    })
    .sort((a, b) => {
      if (b.eloDelta !== a.eloDelta) return b.eloDelta - a.eloDelta;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.pointsDiff - a.pointsDiff;
    })
    .map((r, i) => ({ ...r, rank: i + 1 }));

  // Spotlight 1: MVP da Noite
  const mvpRow = allRows[0];
  const mvp: SpotlightAthlete | null = mvpRow
    ? {
        id: mvpRow.id,
        title: "MVP DA NOITE",
        firstName: mvpRow.firstName,
        photo: mvpRow.photo,
        primaryStat: `${mvpRow.eloDelta >= 0 ? "+" : ""}${mvpRow.eloDelta} ELO`,
        secondaryStat: `${mvpRow.wins}V/${mvpRow.losses}D • ${mvpRow.winRate}%`,
        accent: "gold"
      }
    : null;

  // Spotlight 2: Melhor Levantador da Noite (oficiais que jogaram; fallback se nenhum oficial)
  const officialSetters = allRows.filter((r) => Boolean(playerMap.get(r.id)?.isOfficialSetter));
  const setterCandidate = [...officialSetters].sort((a, b) => {
    const scoreA = a.winRate * 0.65 + (a.pointsDiff / Math.max(1, a.games)) * 4 + a.wins * 5;
    const scoreB = b.winRate * 0.65 + (b.pointsDiff / Math.max(1, b.games)) * 4 + b.wins * 5;
    return scoreB - scoreA;
  })[0];

  const fallbackSetter = allRows[1] || allRows[0];
  const chosenSetter = setterCandidate || fallbackSetter;
  const bestSetter: SpotlightAthlete | null = chosenSetter
    ? {
        id: chosenSetter.id,
        title: setterCandidate ? "MELHOR LEVANTADOR" : "DESTAQUE TÁTICO",
        firstName: chosenSetter.firstName,
        photo: chosenSetter.photo,
        primaryStat: `${chosenSetter.winRate}% APROV.`,
        secondaryStat: `${chosenSetter.wins}V/${chosenSetter.losses}D • ${chosenSetter.pointsDiff >= 0 ? "+" : ""}${chosenSetter.pointsDiff} pts`,
        accent: "cyan"
      }
    : null;

  // Spotlight 3: Mais Eficiente (maior % de vitórias + saldo/jogo, mín. 2 jogos)
  const effPool = allRows.filter((r) => r.games >= 2);
  const effSorted = [...(effPool.length > 0 ? effPool : allRows)].sort((a, b) => {
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    const diffAvgB = b.pointsDiff / Math.max(1, b.games);
    const diffAvgA = a.pointsDiff / Math.max(1, a.games);
    if (Math.abs(diffAvgB - diffAvgA) > 0.01) return diffAvgB - diffAvgA;
    return b.games - a.games;
  });
  const chosenEff = effSorted[0];
  const mostEfficient: SpotlightAthlete | null = chosenEff
    ? {
        id: chosenEff.id,
        title: "MAIS EFICIENTE",
        firstName: chosenEff.firstName,
        photo: chosenEff.photo,
        primaryStat: `${chosenEff.winRate}%`,
        secondaryStat: `${chosenEff.pointsDiff >= 0 ? "+" : ""}${chosenEff.pointsDiff} saldo • ${chosenEff.games}J`,
        accent: "emerald"
      }
    : null;

  const modules = computeGroupModules(nightMatches, playerMap, {
    minDuoGames: 2,
    minTrioGames: 2,
    minH2HGames: 2,
    minLowRateGames: 2
  });

  return {
    dateKey: targetDate,
    dateLabel: formatDateBR(targetDate),
    totalMatches: nightMatches.length,
    totalAthletes: allRows.length,
    mvp,
    bestSetter,
    mostEfficient,
    topRows: allRows.slice(0, 8),
    ...modules
  };
}

// ============================================================================
// 3) DATA BUILDER: RANKING GERAL ACUMULADO (COM SUBIU/DESCEU REAL!)
// ============================================================================

export function computeAccumulatedRankingData(
  allMatches: CardMatch[],
  allPlayers: CardPlayer[]
): AccumulatedRankingCardData {
  const playerMap = buildPlayerLookup(allPlayers);
  const sortedMatches = [...(allMatches || [])].sort(
    (a, b) => Number(a.timestamp || a.createdAt || 0) - Number(b.timestamp || b.createdAt || 0)
  );

  const lastMatch = sortedMatches[sortedMatches.length - 1];
  const lastDateKey = lastMatch ? getMatchDateKey(lastMatch) : getDateKeyBR();

  // Recentes V/D por atleta (últimos 5 jogos reais) e delta ELO na última sessão
  const recentFormMap = new Map<string, Array<"W" | "L">>();
  const lastSessionStats = new Map<string, { wins: number; losses: number; games: number }>();

  for (const m of sortedMatches) {
    const teamA = Array.from(new Set(extractTeamIds(m.teamA).map((id) => canonicalId(id, playerMap))));
    const teamB = Array.from(new Set(extractTeamIds(m.teamB).map((id) => canonicalId(id, playerMap))));
    const { winner } = getMatchScores(m);
    const mDate = getMatchDateKey(m);

    const record = (ids: string[], won: boolean) => {
      for (const pid of ids) {
        const arr = recentFormMap.get(pid) || [];
        arr.push(won ? "W" : "L");
        if (arr.length > 5) arr.shift();
        recentFormMap.set(pid, arr);

        if (mDate === lastDateKey) {
          const ls = lastSessionStats.get(pid) || { wins: 0, losses: 0, games: 0 };
          ls.games += 1;
          if (won) ls.wins += 1;
          else ls.losses += 1;
          lastSessionStats.set(pid, ls);
        }
      }
    };
    record(teamA, winner === "A");
    record(teamB, winner === "B");
  }

  const eligiblePlayers = (allPlayers || []).filter(
    (p) => p.status === "active" && !p.isDM && (p.matchesPlayed || 0) > 0 && String(p.name || "").toLowerCase() !== "financeiro"
  );

  // Ranking ATUAL
  const currentSorted = [...eligiblePlayers].sort((a, b) => {
    const eloDiff = (b.elo || 1200) - (a.elo || 1200);
    if (Math.abs(eloDiff) > 0.01) return eloDiff;
    const wrA = (a.matchesPlayed || 0) > 0 ? (a.wins || 0) / (a.matchesPlayed || 1) : 0;
    const wrB = (b.matchesPlayed || 0) > 0 ? (b.wins || 0) / (b.matchesPlayed || 1) : 0;
    if (Math.abs(wrB - wrA) > 0.001) return wrB - wrA;
    return (b.wins || 0) - (a.wins || 0);
  });

  // Ranking ANTERIOR (subtraindo o delta real da última quinta-feira)
  const prevEloById = new Map<string, number>();
  for (const p of eligiblePlayers) {
    const ls = lastSessionStats.get(p.id);
    const lastDelta = ls ? ls.wins * 20 - ls.losses * 20 + (ls.games >= 2 ? 20 : 0) : 0;
    prevEloById.set(p.id, (p.elo || 1200) - lastDelta);
  }

  const prevSorted = [...eligiblePlayers].sort((a, b) => {
    const pEloDiff = (prevEloById.get(b.id) ?? 1200) - (prevEloById.get(a.id) ?? 1200);
    if (Math.abs(pEloDiff) > 0.01) return pEloDiff;
    const prevWinsA = (a.wins || 0) - (lastSessionStats.get(a.id)?.wins || 0);
    const prevWinsB = (b.wins || 0) - (lastSessionStats.get(b.id)?.wins || 0);
    return prevWinsB - prevWinsA;
  });

  const prevRankById = new Map<string, number>();
  prevSorted.forEach((p, idx) => prevRankById.set(p.id, idx + 1));

  const topRows: AccumulatedRankingRow[] = currentSorted.slice(0, 10).map((p, idx) => {
    const rank = idx + 1;
    const prevRank = prevRankById.get(p.id) ?? rank;
    const games = Number(p.matchesPlayed || 0);
    const wins = Number(p.wins || 0);
    const losses = Number(p.losses || Math.max(0, games - wins));
    return {
      id: p.id,
      rank,
      prevRank,
      rankDelta: prevRank - rank, // positivo = subiu posições!
      firstName: getFullFirstName(p.name),
      fullName: p.name,
      photo: resolveSafePhotoDataUri(p),
      elo: Math.round(p.elo || 1200),
      wins,
      losses,
      games,
      winRate: games > 0 ? Math.round((wins / games) * 100) : 0,
      recentForm: recentFormMap.get(p.id) || []
    };
  });

  const modules = computeGroupModules(sortedMatches, playerMap, {
    minDuoGames: 5,
    minTrioGames: 4,
    minH2HGames: 5,
    minLowRateGames: 5
  });

  return {
    referenceDateLabel: formatDateBR(lastDateKey),
    totalActivePlayers: eligiblePlayers.length,
    totalMatchesHistory: sortedMatches.length,
    topRows,
    ...modules
  };
}

// ============================================================================
// 4) CURVA DE EVOLUÇÃO ELO REAL (PARA GRÁFICO 2 - CURVA DE ÁREA LIQUID GLASS)
// ============================================================================

export function computePlayerEloCurve(
  player: CardPlayer,
  allMatches: CardMatch[],
  maxSessions = 8
): EloCurvePoint[] {
  if (!player) return [];
  const myIds = new Set([player.id, player.uid].filter(Boolean) as string[]);

  const byDate = new Map<string, { wins: number; losses: number; games: number }>();
  for (const m of allMatches || []) {
    const teamA = extractTeamIds(m.teamA);
    const teamB = extractTeamIds(m.teamB);
    const inA = teamA.some((id) => myIds.has(id));
    const inB = teamB.some((id) => myIds.has(id));
    if (!inA && !inB) continue;

    const dateKey = getMatchDateKey(m);
    if (!dateKey) continue;
    const { winner } = getMatchScores(m);
    const won = (inA && winner === "A") || (inB && winner === "B");

    const st = byDate.get(dateKey) || { wins: 0, losses: 0, games: 0 };
    st.games += 1;
    if (won) st.wins += 1;
    else st.losses += 1;
    byDate.set(dateKey, st);
  }

  const dates = Array.from(byDate.keys()).sort();
  const recentDates = dates.slice(-maxSessions);
  if (recentDates.length === 0) {
    return [
      {
        dateKey: getDateKeyBR(),
        dateLabel: formatShortDateBR(getDateKeyBR()),
        elo: Math.round(player.elo || 1200),
        delta: 0,
        wins: 0,
        losses: 0
      }
    ];
  }

  // Reconstrói de trás para frente ancorando exatamente no ELO atual real do atleta
  const deltas = recentDates.map((d) => {
    const st = byDate.get(d)!;
    return st.wins * 20 - st.losses * 20 + (st.games >= 2 ? 20 : 0);
  });

  const points: EloCurvePoint[] = new Array(recentDates.length);
  let runningElo = Math.round(player.elo || 1200);

  for (let i = recentDates.length - 1; i >= 0; i--) {
    const d = recentDates[i];
    const st = byDate.get(d)!;
    points[i] = {
      dateKey: d,
      dateLabel: formatShortDateBR(d),
      elo: Math.round(runningElo),
      delta: deltas[i],
      wins: st.wins,
      losses: st.losses
    };
    runningElo -= deltas[i];
  }

  return points;
}

// ============================================================================
// MOTOR SVG -> PNG (VERSÃO 3 LIQUID GLASS + ESTILO 3 UNIFICADO • 1080×1440px)
// ============================================================================

const CARD_W = 1080;
const CARD_H = 1440;
const FONT_SANS = "'Noto Sans', 'Liberation Sans', 'DejaVu Sans', sans-serif";
const FONT_MONO = "'JetBrains Mono', 'DejaVu Sans Mono', monospace";

function esc(val: string | number | null | undefined): string {
  return String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncateText(text: string, maxChars: number): string {
  const s = String(text || "").trim();
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars - 1).trimEnd() + "…";
}

function renderAvatarSvg(opts: {
  cx: number;
  cy: number;
  r: number;
  photo: string | null;
  name: string;
  clipId: string;
  ringColor?: string;
}): { defs: string; body: string } {
  const { cx, cy, r, photo, name, clipId, ringColor = "#22D3EE" } = opts;
  const initials = getFullFirstName(name).slice(0, 2).toUpperCase();
  const defs = `<clipPath id="${clipId}"><circle cx="${cx}" cy="${cy}" r="${r}" /></clipPath>`;

  const inner = photo
    ? `<image href="${photo}" x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" />`
    : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#avatarGrad)" />
       <text x="${cx}" y="${cy + Math.round(r * 0.36)}" text-anchor="middle" font-family="${FONT_SANS}" font-size="${Math.round(r * 0.85)}" font-weight="800" fill="#F8FAFC">${esc(initials)}</text>`;

  const body = `
    <g>
      <circle cx="${cx}" cy="${cy}" r="${r + 2.5}" fill="rgba(15,23,42,0.85)" stroke="${ringColor}" stroke-width="2.2" stroke-opacity="0.88" />
      ${inner}
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1" />
    </g>
  `;
  return { defs, body };
}

function glassPanel(x: number, y: number, w: number, h: number, radius = 24, tint = "rgba(15, 25, 44, 0.72)", stroke = "rgba(255,255,255,0.14)"): string {
  return `
    <g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${tint}" stroke="${stroke}" stroke-width="1.4" />
      <line x1="${x + radius}" y1="${y + 1.2}" x2="${x + w - radius}" y2="${y + 1.2}" stroke="rgba(255,255,255,0.34)" stroke-width="1.2" stroke-linecap="round" />
    </g>
  `;
}

function baseDefsAndCanvas(extraDefs: string): string {
  return `
  <defs>
    <linearGradient id="bgCanvas" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#050912" />
      <stop offset="50%" stop-color="#091121" />
      <stop offset="100%" stop-color="#040810" />
    </linearGradient>
    <radialGradient id="orbCyan" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#06B6D4" stop-opacity="0.34" />
      <stop offset="100%" stop-color="#06B6D4" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="orbEmerald" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#10B981" stop-opacity="0.28" />
      <stop offset="100%" stop-color="#10B981" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="orbGold" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#F59E0B" stop-opacity="0.22" />
      <stop offset="100%" stop-color="#F59E0B" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="orbCoral" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#F43F5E" stop-opacity="0.18" />
      <stop offset="100%" stop-color="#F43F5E" stop-opacity="0" />
    </radialGradient>

    <linearGradient id="barGold" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#F59E0B" />
      <stop offset="55%" stop-color="#FBBF24" />
      <stop offset="100%" stop-color="#FEF08A" />
    </linearGradient>
    <linearGradient id="barEmerald" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#059669" />
      <stop offset="55%" stop-color="#10B981" />
      <stop offset="100%" stop-color="#22D3EE" />
    </linearGradient>
    <linearGradient id="barCyan" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0284C7" />
      <stop offset="55%" stop-color="#06B6D4" />
      <stop offset="100%" stop-color="#38BDF8" />
    </linearGradient>
    <linearGradient id="barIndigo" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#4F46E5" />
      <stop offset="60%" stop-color="#6366F1" />
      <stop offset="100%" stop-color="#38BDF8" />
    </linearGradient>
    <linearGradient id="barViolet" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#7C3AED" />
      <stop offset="60%" stop-color="#A855F7" />
      <stop offset="100%" stop-color="#F472B6" />
    </linearGradient>
    <linearGradient id="barCoral" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#E11D48" />
      <stop offset="55%" stop-color="#F43F5E" />
      <stop offset="100%" stop-color="#FB7185" />
    </linearGradient>
    <linearGradient id="barSlate" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1E293B" />
      <stop offset="100%" stop-color="#334155" />
    </linearGradient>
    <linearGradient id="avatarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0E7490" />
      <stop offset="100%" stop-color="#1E293B" />
    </linearGradient>
    <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#10B981" />
      <stop offset="55%" stop-color="#22D3EE" />
      <stop offset="100%" stop-color="#FBBF24" />
    </linearGradient>
    ${extraDefs}
  </defs>

  <rect width="${CARD_W}" height="${CARD_H}" fill="url(#bgCanvas)" />
  <circle cx="150" cy="140" r="320" fill="url(#orbCyan)" />
  <circle cx="940" cy="360" r="340" fill="url(#orbEmerald)" />
  <circle cx="880" cy="1260" r="340" fill="url(#orbGold)" />
  <circle cx="160" cy="1180" r="280" fill="url(#orbCoral)" />
  `;
}

function footerSvg(subtitle: string): string {
  return `
    <g>
      <line x1="48" y1="${CARD_H - 64}" x2="${CARD_W - 48}" y2="${CARD_H - 64}" stroke="rgba(255,255,255,0.10)" stroke-width="1" />
      <text x="48" y="${CARD_H - 32}" font-family="${FONT_SANS}" font-size="16" font-weight="700" fill="#94A3B8" letter-spacing="1.4">GUERREIROS VOLLEYBALL CLUB</text>
      <text x="${CARD_W - 48}" y="${CARD_H - 32}" text-anchor="end" font-family="${FONT_SANS}" font-size="15" font-weight="600" fill="#64748B">${esc(subtitle)}</text>
    </g>
  `;
}

function accentToBarUrl(accent: PairMetricItem["accent"]): string {
  switch (accent) {
    case "emerald":
      return "url(#barEmerald)";
    case "cyan":
      return "url(#barCyan)";
    case "gold":
      return "url(#barGold)";
    case "coral":
      return "url(#barCoral)";
    case "violet":
      return "url(#barViolet)";
  }
}

function accentToHex(accent: PairMetricItem["accent"]): string {
  switch (accent) {
    case "emerald":
      return "#34D399";
    case "cyan":
      return "#38BDF8";
    case "gold":
      return "#FBBF24";
    case "coral":
      return "#FB7185";
    case "violet":
      return "#C084FC";
  }
}

function renderSvgToPng(svg: string): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: CARD_W },
    font: {
      loadSystemFonts: true,
      defaultFontFamily: "Noto Sans"
    }
  });
  return resvg.render().asPng();
}

// ============================================================================
// RENDER 1: CARD INDIVIDUAL DA NOITE (LINHA DO TEMPO HORIZONTAL + ANEL GLASS)
// ============================================================================

export function renderIndividualNightCardSvg(data: IndividualNightCardData): string {
  const defsList: string[] = [];
  const bodyParts: string[] = [];

  // Header panel
  bodyParts.push(glassPanel(40, 36, 1000, 198, 28, "rgba(15, 27, 48, 0.78)", "rgba(56, 189, 248, 0.28)"));

  const heroAv = renderAvatarSvg({
    cx: 122,
    cy: 135,
    r: 54,
    photo: data.photo,
    name: data.firstName,
    clipId: "hero_av",
    ringColor: "#22D3EE"
  });
  defsList.push(heroAv.defs);
  bodyParts.push(heroAv.body);

  const eloColor = data.eloDelta >= 0 ? "#34D399" : "#FB7185";
  const eloLabel = `${data.eloDelta >= 0 ? "+" : ""}${data.eloDelta} ELO`;

  bodyParts.push(`
    <text x="198" y="80" font-family="${FONT_SANS}" font-size="15" font-weight="800" fill="#38BDF8" letter-spacing="2.2">RESUMO INDIVIDUAL DA NOITE • ${esc(data.dateLabel)}</text>
    <text x="198" y="132" font-family="${FONT_SANS}" font-size="46" font-weight="900" fill="#F8FAFC">${esc(data.firstName)}</text>
    <rect x="198" y="150" width="136" height="34" rx="17" fill="rgba(16, 185, 129, 0.16)" stroke="${eloColor}" stroke-width="1.3" />
    <text x="266" y="173" text-anchor="middle" font-family="${FONT_MONO}" font-size="18" font-weight="800" fill="${eloColor}">${esc(eloLabel)}</text>

    <rect x="346" y="150" width="184" height="34" rx="17" fill="rgba(56, 189, 248, 0.14)" stroke="rgba(56, 189, 248, 0.45)" stroke-width="1.2" />
    <text x="438" y="173" text-anchor="middle" font-family="${FONT_SANS}" font-size="16" font-weight="700" fill="#E0F2FE">#${data.nightRank} de ${data.nightTotalPlayers} na Noite</text>

    <rect x="542" y="150" width="142" height="34" rx="17" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.16)" stroke-width="1.1" />
    <text x="613" y="173" text-anchor="middle" font-family="${FONT_MONO}" font-size="16" font-weight="700" fill="#CBD5E1">ELO ${data.currentElo}</text>
  `);

  // Gráfico 1: Anel Liquid Glass no topo direito do Header
  const ringCx = 940;
  const ringCy = 135;
  const ringR = 58;
  const circ = 2 * Math.PI * ringR;
  const pct = Math.max(0, Math.min(100, data.winRate));
  const dashLen = (pct / 100) * circ;

  bodyParts.push(`
    <g>
      <circle cx="${ringCx}" cy="${ringCy}" r="${ringR + 12}" fill="rgba(6, 182, 212, 0.08)" stroke="rgba(255,255,255,0.10)" stroke-width="1.2" />
      <circle cx="${ringCx}" cy="${ringCy}" r="${ringR}" fill="none" stroke="rgba(148, 163, 184, 0.18)" stroke-width="13" />
      <circle cx="${ringCx}" cy="${ringCy}" r="${ringR}" fill="none" stroke="url(#ringGrad)" stroke-width="13" stroke-linecap="round"
        stroke-dasharray="${dashLen.toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 ${ringCx} ${ringCy})" />
      <text x="${ringCx}" y="${ringCy + 7}" text-anchor="middle" font-family="${FONT_MONO}" font-size="30" font-weight="900" fill="#F8FAFC">${pct}%</text>
      <text x="${ringCx}" y="${ringCy + 28}" text-anchor="middle" font-family="${FONT_SANS}" font-size="11" font-weight="800" fill="#94A3B8" letter-spacing="1.4">APROV.</text>
    </g>
  `);

  // 4 Liquid Glass KPI Tiles
  const kpis = [
    {
      label: "PARTIDAS",
      value: `${data.gamesPlayed} de ${data.totalMatchesNight}`,
      sub: "jogadas na noite",
      accent: "#38BDF8"
    },
    {
      label: "RESULTADO",
      value: `${data.wins}V / ${data.losses}D`,
      sub: `${data.winRate}% vitórias`,
      accent: "#34D399"
    },
    {
      label: "SALDO PONTOS",
      value: `${data.pointsDiff >= 0 ? "+" : ""}${data.pointsDiff}`,
      sub: "pontos líquidos",
      accent: data.pointsDiff >= 0 ? "#FBBF24" : "#FB7185"
    },
    {
      label: "EM QUADRA",
      value: data.courtTimeLabel,
      sub: "tempo estimado real",
      accent: "#A78BFA"
    }
  ];

  kpis.forEach((k, i) => {
    const kx = 40 + i * 255;
    const ky = 254;
    bodyParts.push(glassPanel(kx, ky, 235, 112, 22, "rgba(15, 25, 44, 0.72)", "rgba(255,255,255,0.13)"));
    bodyParts.push(`
      <rect x="${kx + 18}" y="${ky + 18}" width="32" height="4" rx="2" fill="${k.accent}" />
      <text x="${kx + 18}" y="${ky + 44}" font-family="${FONT_SANS}" font-size="13" font-weight="800" fill="#94A3B8" letter-spacing="1.4">${esc(k.label)}</text>
      <text x="${kx + 18}" y="${ky + 81}" font-family="${FONT_MONO}" font-size="30" font-weight="900" fill="#F8FAFC">${esc(k.value)}</text>
      <text x="${kx + 18}" y="${ky + 101}" font-family="${FONT_SANS}" font-size="13" font-weight="600" fill="${k.accent}">${esc(k.sub)}</text>
    `);
  });

  // LINHA DO TEMPO DA NOITE — HORIZONTAL (ESTILO 3 LIQUID GLASS)
  const visibleTimeline = data.timeline.slice(0, 9);
  const timelineH = Math.max(250, 86 + visibleTimeline.length * 46);
  const tlY = 386;
  bodyParts.push(glassPanel(40, tlY, 1000, timelineH, 26, "rgba(13, 22, 40, 0.76)", "rgba(255,255,255,0.14)"));
  bodyParts.push(`
    <text x="68" y="${tlY + 42}" font-family="${FONT_SANS}" font-size="18" font-weight="900" fill="#F8FAFC" letter-spacing="1.2">LINHA DO TEMPO DA NOITE • HORIZONTAL</text>
    <text x="1012" y="${tlY + 42}" text-anchor="end" font-family="${FONT_SANS}" font-size="14" font-weight="700" fill="#64748B">VITÓRIA  •  DERROTA  •  RODÍZIO</text>
  `);

  const maxScore = Math.max(15, ...visibleTimeline.map((t) => Math.max(t.myScore, t.oppScore)));
  const trackX = 148;
  const trackW = 640;

  visibleTimeline.forEach((item, idx) => {
    const ry = tlY + 64 + idx * 45;
    const isWin = item.status === "WIN";
    const isLoss = item.status === "LOSS";
    const ratio = isWin || isLoss
      ? Math.max(0.32, Math.min(1, (Math.max(item.myScore, item.oppScore) / maxScore) * (isWin ? 0.96 : 0.76)))
      : 0.42;
    const fillW = Math.round(trackW * ratio);
    const barFill = isWin ? "url(#barEmerald)" : isLoss ? "url(#barCoral)" : "url(#barSlate)";
    const badgeColor = isWin ? "#34D399" : isLoss ? "#FB7185" : "#94A3B8";
    const statusTxt = isWin ? "VITÓRIA" : isLoss ? "DERROTA" : "RODÍZIO";
    const diffTxt = isWin ? `+${item.diff}` : isLoss ? `${item.diff}` : "FORA";

    bodyParts.push(`
      <g>
        <text x="68" y="${ry + 23}" font-family="${FONT_MONO}" font-size="18" font-weight="800" fill="#E2E8F0">${esc(item.label)}</text>
        <rect x="${trackX}" y="${ry}" width="${trackW}" height="34" rx="17" fill="rgba(15, 23, 42, 0.78)" stroke="rgba(255,255,255,0.08)" stroke-width="1" />
        <rect x="${trackX}" y="${ry}" width="${fillW}" height="34" rx="17" fill="${barFill}" />
        <line x1="${trackX + 16}" y1="${ry + 2}" x2="${trackX + fillW - 16}" y2="${ry + 2}" stroke="rgba(255,255,255,0.42)" stroke-width="1.4" stroke-linecap="round" />
        <text x="${trackX + 18}" y="${ry + 23}" font-family="${FONT_SANS}" font-size="14" font-weight="900" fill="${isWin || isLoss ? "#041016" : "#CBD5E1"}" letter-spacing="0.8">${statusTxt}</text>
        <text x="${trackX + fillW - 16}" y="${ry + 23}" text-anchor="end" font-family="${FONT_MONO}" font-size="16" font-weight="900" fill="${isWin || isLoss ? "#041016" : "#E2E8F0"}">${esc(item.scoreText)}</text>

        <text x="812" y="${ry + 23}" font-family="${FONT_MONO}" font-size="16" font-weight="800" fill="${badgeColor}">${esc(diffTxt)}</text>
        <rect x="892" y="${ry + 2}" width="120" height="30" rx="15" fill="rgba(56, 189, 248, 0.12)" stroke="rgba(56, 189, 248, 0.30)" stroke-width="1" />
        <text x="952" y="${ry + 22}" text-anchor="middle" font-family="${FONT_MONO}" font-size="14" font-weight="700" fill="#7DD3FC">${esc(item.durationLabel)}</text>
      </g>
    `);
  });

  // SEUS TIMES NA NOITE (PARCEIROS DE QUADRA)
  const playedItems = data.timeline.filter((t) => t.status !== "OUT").slice(0, 5);
  const teamsY = tlY + timelineH + 20;
  const bottomAvail = CARD_H - 84 - teamsY;
  const teamsH = Math.min(240, Math.max(152, Math.floor(bottomAvail * 0.48)));

  bodyParts.push(glassPanel(40, teamsY, 1000, teamsH, 24, "rgba(15, 25, 44, 0.72)", "rgba(255,255,255,0.13)"));
  bodyParts.push(`
    <text x="68" y="${teamsY + 36}" font-family="${FONT_SANS}" font-size="17" font-weight="900" fill="#F8FAFC" letter-spacing="1.2">SEUS TIMES NA NOITE</text>
    <text x="1012" y="${teamsY + 36}" text-anchor="end" font-family="${FONT_SANS}" font-size="13" font-weight="700" fill="#64748B">PARCEIROS EM QUADRA</text>
  `);

  const rowStep = playedItems.length > 0 ? Math.min(36, Math.floor((teamsH - 52) / playedItems.length)) : 36;
  playedItems.forEach((m, idx) => {
    const ty = teamsY + 56 + idx * rowStep;
    const dotCol = m.status === "WIN" ? "#34D399" : "#FB7185";
    const matesTxt = truncateText(m.teammates.join(", ") || "Sem parceiros registrados", 68);
    bodyParts.push(`
      <g>
        <circle cx="76" cy="${ty + 10}" r="6" fill="${dotCol}" />
        <text x="94" y="${ty + 15}" font-family="${FONT_MONO}" font-size="15" font-weight="800" fill="#E2E8F0">${esc(m.label)}</text>
        <text x="142" y="${ty + 15}" font-family="${FONT_MONO}" font-size="15" font-weight="800" fill="${dotCol}">${esc(m.scoreText)}</text>
        <text x="218" y="${ty + 15}" font-family="${FONT_SANS}" font-size="15" font-weight="600" fill="#CBD5E1">${esc(matesTxt)}</text>
      </g>
    `);
  });

  // SINERGIA & CONFRONTOS DA NOITE (ESTILO 3 LIQUID GLASS)
  const synY = teamsY + teamsH + 20;
  const synH = Math.max(170, CARD_H - 82 - synY);
  bodyParts.push(glassPanel(40, synY, 1000, synH, 24, "rgba(15, 25, 44, 0.72)", "rgba(255,255,255,0.13)"));
  bodyParts.push(`
    <text x="68" y="${synY + 36}" font-family="${FONT_SANS}" font-size="17" font-weight="900" fill="#F8FAFC" letter-spacing="1.2">SINERGIA &amp; CONFRONTOS DA NOITE</text>
  `);

  const cards4: Array<PairMetricItem | null> = [
    data.bestSynergy,
    data.worstSynergy,
    data.victim,
    data.nemesis
  ];

  cards4.forEach((item, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const bx = 66 + col * 484;
    const by = synY + 54 + row * 68;
    const bw = 460;

    if (!item) {
      bodyParts.push(`
        <rect x="${bx}" y="${by}" width="${bw}" height="56" rx="16" fill="rgba(15,23,42,0.5)" stroke="rgba(255,255,255,0.06)" />
        <text x="${bx + 20}" y="${by + 33}" font-family="${FONT_SANS}" font-size="14" font-weight="600" fill="#64748B">Sem amostra suficiente na noite</text>
      `);
      return;
    }

    const av = renderAvatarSvg({
      cx: bx + 28,
      cy: by + 28,
      r: 20,
      photo: item.photos[0] || null,
      name: item.names[0] || item.label,
      clipId: `ind_syn_${i}`,
      ringColor: accentToHex(item.accent)
    });
    defsList.push(av.defs);
    bodyParts.push(`
      <rect x="${bx}" y="${by}" width="${bw}" height="56" rx="16" fill="rgba(15,23,42,0.68)" stroke="rgba(255,255,255,0.10)" />
      ${av.body}
      <text x="${bx + 60}" y="${by + 20}" font-family="${FONT_SANS}" font-size="11" font-weight="800" fill="${accentToHex(item.accent)}" letter-spacing="1.1">${esc(item.subtitle || "")}</text>
      <text x="${bx + 60}" y="${by + 42}" font-family="${FONT_SANS}" font-size="18" font-weight="800" fill="#F8FAFC">${esc(item.label)}</text>
      <rect x="${bx + 230}" y="${by + 16}" width="150" height="24" rx="12" fill="rgba(30,41,59,0.85)" />
      <rect x="${bx + 230}" y="${by + 16}" width="${Math.max(24, Math.round((item.winRate / 100) * 150))}" height="24" rx="12" fill="${accentToBarUrl(item.accent)}" />
      <text x="${bx + 392}" y="${by + 34}" font-family="${FONT_MONO}" font-size="16" font-weight="900" fill="${accentToHex(item.accent)}">${item.winRate}%</text>
    `);
  });

  bodyParts.push(footerSvg(`SÓCIO: ${data.firstName.toUpperCase()} • ${data.dateLabel}`));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
    ${baseDefsAndCanvas(defsList.join("\n"))}
    ${bodyParts.join("\n")}
  </svg>`;
}

export function renderIndividualNightCardPng(data: IndividualNightCardData): Buffer {
  return renderSvgToPng(renderIndividualNightCardSvg(data));
}

// ============================================================================
// RENDER 2: CARD RANKING DO DIA (MVP + LEVANTADOR + EFICIENTE + ESTILO 3)
// ============================================================================

function renderBottomModulesGrid(
  startY: number,
  modules: {
    bestDuosTrios: PairMetricItem[];
    synergyHigh: PairMetricItem | null;
    synergyLow: PairMetricItem | null;
    rivals: H2HMetricItem[];
    lowestSuccess: LowRateItem[];
  },
  idPrefix: string,
  defsList: string[]
): string {
  const parts: string[] = [];
  const boxW = 490;
  const boxH = 178;
  const leftX = 40;
  const rightX = 550;
  const row1Y = startY;
  const row2Y = startY + boxH + 18;

  // Box 1: Melhores Duplas & Trios
  parts.push(glassPanel(leftX, row1Y, boxW, boxH, 22, "rgba(15, 25, 44, 0.74)", "rgba(56, 189, 248, 0.22)"));
  parts.push(`<text x="${leftX + 22}" y="${row1Y + 34}" font-family="${FONT_SANS}" font-size="15" font-weight="900" fill="#38BDF8" letter-spacing="1.2">MELHORES DUPLAS &amp; TRIOS</text>`);

  if (modules.bestDuosTrios.length === 0) {
    parts.push(`<text x="${leftX + 22}" y="${row1Y + 95}" font-family="${FONT_SANS}" font-size="15" fill="#64748B">Sem duplas com jogos suficientes</text>`);
  } else {
    modules.bestDuosTrios.slice(0, 2).forEach((item, idx) => {
      const y = row1Y + 52 + idx * 58;
      item.names.slice(0, 3).forEach((nm, aIdx) => {
        const av = renderAvatarSvg({
          cx: leftX + 34 + aIdx * 22,
          cy: y + 22,
          r: 16,
          photo: item.photos[aIdx] || null,
          name: nm,
          clipId: `${idPrefix}_dt_${idx}_${aIdx}`,
          ringColor: accentToHex(item.accent)
        });
        defsList.push(av.defs);
        parts.push(av.body);
      });
      const textX = leftX + 42 + Math.min(3, item.names.length) * 22;
      const barW = 122;
      const fillW = Math.max(22, Math.round((item.winRate / 100) * barW));
      parts.push(`
        <text x="${textX}" y="${y + 16}" font-family="${FONT_SANS}" font-size="11" font-weight="800" fill="${accentToHex(item.accent)}">${esc(item.subtitle || "DUPLA")}</text>
        <text x="${textX}" y="${y + 36}" font-family="${FONT_SANS}" font-size="14" font-weight="800" fill="#F8FAFC">${esc(truncateText(item.label, 20))}</text>
        <rect x="${leftX + 292}" y="${y + 11}" width="${barW}" height="22" rx="11" fill="rgba(15,23,42,0.8)" />
        <rect x="${leftX + 292}" y="${y + 11}" width="${fillW}" height="22" rx="11" fill="${accentToBarUrl(item.accent)}" />
        <text x="${leftX + 422}" y="${y + 28}" font-family="${FONT_MONO}" font-size="15" font-weight="900" fill="${accentToHex(item.accent)}">${item.winRate}%</text>
      `);
    });
  }

  // Box 2: Maior × Menor Sinergia
  parts.push(glassPanel(rightX, row1Y, boxW, boxH, 22, "rgba(15, 25, 44, 0.74)", "rgba(16, 185, 129, 0.22)"));
  parts.push(`<text x="${rightX + 22}" y="${row1Y + 34}" font-family="${FONT_SANS}" font-size="15" font-weight="900" fill="#34D399" letter-spacing="1.2">MAIOR × MENOR SINERGIA</text>`);

  const synPair = [modules.synergyHigh, modules.synergyLow].filter(Boolean) as PairMetricItem[];
  if (synPair.length === 0) {
    parts.push(`<text x="${rightX + 22}" y="${row1Y + 95}" font-family="${FONT_SANS}" font-size="15" fill="#64748B">Sem pares elegíveis</text>`);
  } else {
    synPair.forEach((item, idx) => {
      const y = row1Y + 52 + idx * 58;
      item.names.slice(0, 2).forEach((nm, aIdx) => {
        const av = renderAvatarSvg({
          cx: rightX + 34 + aIdx * 24,
          cy: y + 22,
          r: 16,
          photo: item.photos[aIdx] || null,
          name: nm,
          clipId: `${idPrefix}_syn_${idx}_${aIdx}`,
          ringColor: accentToHex(item.accent)
        });
        defsList.push(av.defs);
        parts.push(av.body);
      });
      const textX = rightX + 84;
      const barW = 122;
      const fillW = Math.max(18, Math.round((item.winRate / 100) * barW));
      parts.push(`
        <text x="${textX}" y="${y + 16}" font-family="${FONT_SANS}" font-size="11" font-weight="800" fill="${accentToHex(item.accent)}">${esc(item.subtitle || "")}</text>
        <text x="${textX}" y="${y + 36}" font-family="${FONT_SANS}" font-size="14" font-weight="800" fill="#F8FAFC">${esc(truncateText(item.label, 21))}</text>
        <rect x="${rightX + 292}" y="${y + 11}" width="${barW}" height="22" rx="11" fill="rgba(15,23,42,0.8)" />
        <rect x="${rightX + 292}" y="${y + 11}" width="${fillW}" height="22" rx="11" fill="${accentToBarUrl(item.accent)}" />
        <text x="${rightX + 422}" y="${y + 28}" font-family="${FONT_MONO}" font-size="15" font-weight="900" fill="${accentToHex(item.accent)}">${item.winRate}%</text>
      `);
    });
  }

  // Box 3: Carrascos × Fregueses
  parts.push(glassPanel(leftX, row2Y, boxW, boxH, 22, "rgba(15, 25, 44, 0.74)", "rgba(168, 85, 247, 0.24)"));
  parts.push(`<text x="${leftX + 22}" y="${row2Y + 34}" font-family="${FONT_SANS}" font-size="15" font-weight="900" fill="#C084FC" letter-spacing="1.2">CARRASCOS × FREGUESES</text>`);

  if (modules.rivals.length === 0) {
    parts.push(`<text x="${leftX + 22}" y="${row2Y + 95}" font-family="${FONT_SANS}" font-size="15" fill="#64748B">Sem confrontos diretos recorrentes</text>`);
  } else {
    modules.rivals.slice(0, 2).forEach((rv, idx) => {
      const y = row2Y + 52 + idx * 58;
      const av1 = renderAvatarSvg({
        cx: leftX + 34,
        cy: y + 22,
        r: 16,
        photo: rv.winnerPhoto,
        name: rv.winnerName,
        clipId: `${idPrefix}_rvw_${idx}`,
        ringColor: "#C084FC"
      });
      const av2 = renderAvatarSvg({
        cx: leftX + 58,
        cy: y + 22,
        r: 16,
        photo: rv.loserPhoto,
        name: rv.loserName,
        clipId: `${idPrefix}_rvl_${idx}`,
        ringColor: "#FB7185"
      });
      defsList.push(av1.defs, av2.defs);
      parts.push(av1.body, av2.body);

      const barW = 120;
      const fillW = Math.max(20, Math.round((rv.winRate / 100) * barW));
      const matchup = `${rv.winnerName} › ${rv.loserName}`;
      parts.push(`
        <text x="${leftX + 84}" y="${y + 16}" font-family="${FONT_SANS}" font-size="11" font-weight="800" fill="#C084FC">${rv.wins}V × ${rv.losses}D (${rv.games}J)</text>
        <text x="${leftX + 84}" y="${y + 36}" font-family="${FONT_SANS}" font-size="14" font-weight="800" fill="#F8FAFC">${esc(truncateText(matchup, 21))}</text>
        <rect x="${leftX + 294}" y="${y + 11}" width="${barW}" height="22" rx="11" fill="rgba(15,23,42,0.8)" />
        <rect x="${leftX + 294}" y="${y + 11}" width="${fillW}" height="22" rx="11" fill="url(#barViolet)" />
        <text x="${leftX + 422}" y="${y + 28}" font-family="${FONT_MONO}" font-size="15" font-weight="900" fill="#E9D5FF">${rv.winRate}%</text>
      `);
    });
  }

  // Box 4: Menor Taxa de Sucesso (SEMPRE foto + primeiro nome completo + %!)
  parts.push(glassPanel(rightX, row2Y, boxW, boxH, 22, "rgba(15, 25, 44, 0.74)", "rgba(244, 63, 94, 0.26)"));
  parts.push(`<text x="${rightX + 22}" y="${row2Y + 34}" font-family="${FONT_SANS}" font-size="15" font-weight="900" fill="#FB7185" letter-spacing="1.2">MENOR TAXA DE SUCESSO</text>`);

  if (modules.lowestSuccess.length === 0) {
    parts.push(`<text x="${rightX + 22}" y="${row2Y + 95}" font-family="${FONT_SANS}" font-size="15" fill="#64748B">Sem registros suficientes</text>`);
  } else {
    modules.lowestSuccess.slice(0, 2).forEach((item, idx) => {
      const y = row2Y + 52 + idx * 58;
      const av = renderAvatarSvg({
        cx: rightX + 38,
        cy: y + 22,
        r: 18,
        photo: item.photo,
        name: item.name,
        clipId: `${idPrefix}_low_${idx}`,
        ringColor: "#FB7185"
      });
      defsList.push(av.defs);
      parts.push(av.body);

      const barW = 152;
      const fillW = Math.max(18, Math.round((Math.max(8, item.winRate) / 100) * barW));
      parts.push(`
        <text x="${rightX + 68}" y="${y + 20}" font-family="${FONT_SANS}" font-size="17" font-weight="800" fill="#F8FAFC">${esc(item.name)}</text>
        <text x="${rightX + 68}" y="${y + 39}" font-family="${FONT_MONO}" font-size="12" font-weight="700" fill="#94A3B8">${item.wins}V / ${item.losses}D (${item.games}J)</text>
        <rect x="${rightX + 260}" y="${y + 11}" width="${barW}" height="22" rx="11" fill="rgba(15,23,42,0.8)" />
        <rect x="${rightX + 260}" y="${y + 11}" width="${fillW}" height="22" rx="11" fill="url(#barCoral)" />
        <text x="${rightX + 422}" y="${y + 28}" font-family="${FONT_MONO}" font-size="15" font-weight="900" fill="#FB7185">${item.winRate}%</text>
      `);
    });
  }

  return parts.join("\n");
}

export function renderDailyRankingCardSvg(data: DailyRankingCardData): string {
  const defsList: string[] = [];
  const bodyParts: string[] = [];

  // Header
  bodyParts.push(glassPanel(40, 34, 1000, 102, 26, "rgba(15, 27, 48, 0.78)", "rgba(56, 189, 248, 0.28)"));
  bodyParts.push(`
    <text x="68" y="72" font-family="${FONT_SANS}" font-size="14" font-weight="800" fill="#38BDF8" letter-spacing="2.4">GUERREIROS VOLLEYBALL CLUB • SESSÃO ${esc(data.dateLabel)}</text>
    <text x="68" y="114" font-family="${FONT_SANS}" font-size="38" font-weight="900" fill="#F8FAFC">RANKING DO DIA</text>
    <rect x="742" y="58" width="132" height="52" rx="16" fill="rgba(16, 185, 129, 0.14)" stroke="rgba(16, 185, 129, 0.35)" />
    <text x="808" y="81" text-anchor="middle" font-family="${FONT_MONO}" font-size="20" font-weight="900" fill="#34D399">${data.totalMatches}</text>
    <text x="808" y="100" text-anchor="middle" font-family="${FONT_SANS}" font-size="11" font-weight="800" fill="#A7F3D0">PARTIDAS</text>

    <rect x="886" y="58" width="132" height="52" rx="16" fill="rgba(56, 189, 248, 0.14)" stroke="rgba(56, 189, 248, 0.35)" />
    <text x="952" y="81" text-anchor="middle" font-family="${FONT_MONO}" font-size="20" font-weight="900" fill="#38BDF8">${data.totalAthletes}</text>
    <text x="952" y="100" text-anchor="middle" font-family="${FONT_SANS}" font-size="11" font-weight="800" fill="#BAE6FD">ATLETAS</text>
  `);

  // 3 Spotlights (MVP + Melhor Levantador + Mais Eficiente)
  const spotlights = [data.mvp, data.bestSetter, data.mostEfficient];
  const spColors = {
    gold: { border: "rgba(251, 191, 36, 0.45)", text: "#FBBF24", bg: "rgba(245, 158, 11, 0.11)" },
    cyan: { border: "rgba(56, 189, 248, 0.45)", text: "#38BDF8", bg: "rgba(6, 182, 212, 0.11)" },
    emerald: { border: "rgba(52, 211, 153, 0.45)", text: "#34D399", bg: "rgba(16, 185, 129, 0.11)" }
  };

  spotlights.forEach((sp, idx) => {
    const sx = 40 + idx * 340;
    const sy = 154;
    const sw = 320;
    const sh = 136;
    if (!sp) {
      bodyParts.push(glassPanel(sx, sy, sw, sh, 22));
      return;
    }
    const pal = spColors[sp.accent];
    bodyParts.push(glassPanel(sx, sy, sw, sh, 22, "rgba(15, 25, 44, 0.78)", pal.border));
    const av = renderAvatarSvg({
      cx: sx + 52,
      cy: sy + 76,
      r: 32,
      photo: sp.photo,
      name: sp.firstName,
      clipId: `day_sp_${idx}`,
      ringColor: pal.text
    });
    defsList.push(av.defs);
    bodyParts.push(`
      <rect x="${sx + 16}" y="${sy + 14}" width="${sw - 32}" height="24" rx="12" fill="${pal.bg}" />
      <text x="${sx + sw / 2}" y="${sy + 31}" text-anchor="middle" font-family="${FONT_SANS}" font-size="12" font-weight="900" fill="${pal.text}" letter-spacing="1.2">${esc(sp.title)}</text>
      ${av.body}
      <text x="${sx + 98}" y="${sy + 68}" font-family="${FONT_SANS}" font-size="22" font-weight="900" fill="#F8FAFC">${esc(truncateText(sp.firstName, 14))}</text>
      <text x="${sx + 98}" y="${sy + 94}" font-family="${FONT_MONO}" font-size="18" font-weight="900" fill="${pal.text}">${esc(sp.primaryStat)}</text>
      <text x="${sx + 98}" y="${sy + 116}" font-family="${FONT_SANS}" font-size="13" font-weight="600" fill="#94A3B8">${esc(sp.secondaryStat)}</text>
    `);
  });

  // Classificação da Noite (Top 8 • Estilo 3 Liquid Glass)
  const boardY = 308;
  const boardH = 656;
  bodyParts.push(glassPanel(40, boardY, 1000, boardH, 26, "rgba(13, 22, 40, 0.78)", "rgba(255,255,255,0.14)"));
  bodyParts.push(`
    <text x="68" y="${boardY + 42}" font-family="${FONT_SANS}" font-size="18" font-weight="900" fill="#F8FAFC" letter-spacing="1.2">CLASSIFICAÇÃO DA NOITE (TOP ${data.topRows.length})</text>
    <text x="1012" y="${boardY + 42}" text-anchor="end" font-family="${FONT_SANS}" font-size="13" font-weight="700" fill="#64748B">% VITÓRIAS  •  SALDO  •  SEQUÊNCIA</text>
  `);

  const barGrads = [
    "url(#barGold)",
    "url(#barEmerald)",
    "url(#barCyan)",
    "url(#barIndigo)",
    "url(#barIndigo)",
    "url(#barViolet)",
    "url(#barViolet)",
    "url(#barCoral)"
  ];
  const ringCols = ["#FBBF24", "#34D399", "#38BDF8", "#818CF8", "#818CF8", "#C084FC", "#C084FC", "#FB7185"];

  data.topRows.forEach((row, idx) => {
    const ry = boardY + 64 + idx * 72;
    const av = renderAvatarSvg({
      cx: 132,
      cy: ry + 28,
      r: 22,
      photo: row.photo,
      name: row.firstName,
      clipId: `day_row_${idx}`,
      ringColor: ringCols[idx] || "#38BDF8"
    });
    defsList.push(av.defs);

    const trackX = 330;
    const trackW = 430;
    const fillW = Math.max(58, Math.round((Math.max(12, row.winRate) / 100) * trackW));
    const eloTxt = `${row.eloDelta >= 0 ? "+" : ""}${row.eloDelta}`;
    const diffTxt = `${row.pointsDiff >= 0 ? "+" : ""}${row.pointsDiff} pts`;

    const dots = row.sequence
      .map((res, dIdx) => {
        const dx = 918 + dIdx * 16;
        return `<circle cx="${dx}" cy="${ry + 28}" r="5.2" fill="${res === "W" ? "#34D399" : "#F43F5E"}" />`;
      })
      .join("");

    bodyParts.push(`
      <g>
        <rect x="64" y="${ry + 2}" width="952" height="54" rx="18" fill="rgba(15, 23, 42, 0.56)" stroke="rgba(255,255,255,0.07)" />
        <text x="90" y="${ry + 35}" text-anchor="middle" font-family="${FONT_MONO}" font-size="20" font-weight="900" fill="${ringCols[idx] || "#CBD5E1"}">${String(row.rank).padStart(2, "0")}</text>
        ${av.body}
        <text x="168" y="${ry + 27}" font-family="${FONT_SANS}" font-size="19" font-weight="800" fill="#F8FAFC">${esc(truncateText(row.firstName, 14))}</text>
        <text x="168" y="${ry + 46}" font-family="${FONT_MONO}" font-size="13" font-weight="700" fill="#94A3B8">${row.wins}V/${row.losses}D • ${esc(diffTxt)}</text>

        <rect x="${trackX}" y="${ry + 12}" width="${trackW}" height="32" rx="16" fill="rgba(15, 23, 42, 0.85)" />
        <rect x="${trackX}" y="${ry + 12}" width="${fillW}" height="32" rx="16" fill="${barGrads[idx] || "url(#barCyan)"}" />
        <line x1="${trackX + 14}" y1="${ry + 14}" x2="${trackX + fillW - 14}" y2="${ry + 14}" stroke="rgba(255,255,255,0.45)" stroke-width="1.3" stroke-linecap="round" />
        <text x="${trackX + fillW - 12}" y="${ry + 34}" text-anchor="end" font-family="${FONT_MONO}" font-size="15" font-weight="900" fill="#041016">${row.winRate}%</text>

        <text x="836" y="${ry + 34}" text-anchor="middle" font-family="${FONT_MONO}" font-size="17" font-weight="900" fill="${row.eloDelta >= 0 ? "#34D399" : "#FB7185"}">${esc(eloTxt)}</text>
        ${dots}
      </g>
    `);
  });

  // 4 Bottom Modules
  bodyParts.push(renderBottomModulesGrid(984, data, "day", defsList));
  bodyParts.push(footerSvg(`RANKING DA NOITE • ${data.dateLabel}`));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
    ${baseDefsAndCanvas(defsList.join("\n"))}
    ${bodyParts.join("\n")}
  </svg>`;
}

export function renderDailyRankingCardPng(data: DailyRankingCardData): Buffer {
  return renderSvgToPng(renderDailyRankingCardSvg(data));
}

// ============================================================================
// RENDER 3: CARD RANKING GERAL ACUMULADO (COM SUBIU/DESCEU ▲/▼ + ESTILO 3)
// ============================================================================

export function renderAccumulatedRankingCardSvg(data: AccumulatedRankingCardData): string {
  const defsList: string[] = [];
  const bodyParts: string[] = [];

  // Header
  bodyParts.push(glassPanel(40, 34, 1000, 102, 26, "rgba(15, 27, 48, 0.78)", "rgba(251, 191, 36, 0.30)"));
  bodyParts.push(`
    <text x="68" y="72" font-family="${FONT_SANS}" font-size="14" font-weight="800" fill="#FBBF24" letter-spacing="2.4">TEMPORADA GUERREIROS VC • ATUALIZADO EM ${esc(data.referenceDateLabel)}</text>
    <text x="68" y="114" font-family="${FONT_SANS}" font-size="38" font-weight="900" fill="#F8FAFC">RANKING ACUMULADO</text>

    <rect x="742" y="58" width="132" height="52" rx="16" fill="rgba(251, 191, 36, 0.14)" stroke="rgba(251, 191, 36, 0.36)" />
    <text x="808" y="81" text-anchor="middle" font-family="${FONT_MONO}" font-size="20" font-weight="900" fill="#FBBF24">${data.totalActivePlayers}</text>
    <text x="808" y="100" text-anchor="middle" font-family="${FONT_SANS}" font-size="11" font-weight="800" fill="#FDE68A">SÓCIOS</text>

    <rect x="886" y="58" width="132" height="52" rx="16" fill="rgba(56, 189, 248, 0.14)" stroke="rgba(56, 189, 248, 0.36)" />
    <text x="952" y="81" text-anchor="middle" font-family="${FONT_MONO}" font-size="20" font-weight="900" fill="#38BDF8">${data.totalMatchesHistory}</text>
    <text x="952" y="100" text-anchor="middle" font-family="${FONT_SANS}" font-size="11" font-weight="800" fill="#BAE6FD">JOGOS</text>
  `);

  // Top 10 ELO da Temporada (Estilo 3 Liquid Glass + Delta ▲/▼)
  const boardY = 154;
  const boardH = 810;
  bodyParts.push(glassPanel(40, boardY, 1000, boardH, 26, "rgba(13, 22, 40, 0.78)", "rgba(255,255,255,0.14)"));
  bodyParts.push(`
    <text x="68" y="${boardY + 42}" font-family="${FONT_SANS}" font-size="18" font-weight="900" fill="#F8FAFC" letter-spacing="1.2">TOP ${data.topRows.length} ELO DA TEMPORADA</text>
    <text x="1012" y="${boardY + 42}" text-anchor="end" font-family="${FONT_SANS}" font-size="13" font-weight="700" fill="#64748B">VARIAÇÃO  •  ELO  •  % VITÓRIAS  •  FORMA</text>
  `);

  const maxElo = Math.max(1250, ...data.topRows.map((r) => r.elo));
  const minElo = Math.min(...data.topRows.map((r) => r.elo)) - 60;
  const eloSpan = Math.max(80, maxElo - minElo);

  const barGrads = [
    "url(#barGold)",
    "url(#barEmerald)",
    "url(#barCyan)",
    "url(#barCyan)",
    "url(#barIndigo)",
    "url(#barIndigo)",
    "url(#barViolet)",
    "url(#barViolet)",
    "url(#barCoral)",
    "url(#barCoral)"
  ];
  const ringCols = [
    "#FBBF24",
    "#34D399",
    "#38BDF8",
    "#38BDF8",
    "#818CF8",
    "#818CF8",
    "#C084FC",
    "#C084FC",
    "#FB7185",
    "#FB7185"
  ];

  data.topRows.forEach((row, idx) => {
    const ry = boardY + 62 + idx * 73;

    // Delta badge (▲ +X / ▼ -X / • 0)
    const isUp = row.rankDelta > 0;
    const isDown = row.rankDelta < 0;
    const deltaText = isUp ? `▲+${row.rankDelta}` : isDown ? `▼${row.rankDelta}` : "• 0";
    const deltaColor = isUp ? "#34D399" : isDown ? "#FB7185" : "#94A3B8";
    const deltaBg = isUp
      ? "rgba(16, 185, 129, 0.16)"
      : isDown
      ? "rgba(244, 63, 94, 0.16)"
      : "rgba(148, 163, 184, 0.10)";

    const av = renderAvatarSvg({
      cx: 196,
      cy: ry + 29,
      r: 22,
      photo: row.photo,
      name: row.firstName,
      clipId: `acc_row_${idx}`,
      ringColor: ringCols[idx] || "#38BDF8"
    });
    defsList.push(av.defs);

    const trackX = 392;
    const trackW = 396;
    const norm = Math.max(0.24, Math.min(1, (row.elo - minElo) / eloSpan));
    const fillW = Math.round(norm * trackW);

    const dots = row.recentForm
      .map((res, dIdx) => {
        const dx = 924 + dIdx * 16;
        return `<circle cx="${dx}" cy="${ry + 29}" r="5" fill="${res === "W" ? "#34D399" : "#F43F5E"}" />`;
      })
      .join("");

    bodyParts.push(`
      <g>
        <rect x="64" y="${ry + 2}" width="952" height="56" rx="18" fill="rgba(15, 23, 42, 0.56)" stroke="rgba(255,255,255,0.07)" />
        <text x="89" y="${ry + 36}" text-anchor="middle" font-family="${FONT_MONO}" font-size="19" font-weight="900" fill="${ringCols[idx] || "#CBD5E1"}">${String(row.rank).padStart(2, "0")}</text>

        <rect x="112" y="${ry + 15}" width="54" height="28" rx="14" fill="${deltaBg}" />
        <text x="139" y="${ry + 34}" text-anchor="middle" font-family="${FONT_MONO}" font-size="13" font-weight="900" fill="${deltaColor}">${esc(deltaText)}</text>

        ${av.body}
        <text x="230" y="${ry + 28}" font-family="${FONT_SANS}" font-size="19" font-weight="800" fill="#F8FAFC">${esc(truncateText(row.firstName, 14))}</text>
        <text x="230" y="${ry + 47}" font-family="${FONT_MONO}" font-size="12" font-weight="700" fill="#94A3B8">${row.wins}V/${row.losses}D • ${row.games}J</text>

        <rect x="${trackX}" y="${ry + 13}" width="${trackW}" height="32" rx="16" fill="rgba(15, 23, 42, 0.85)" />
        <rect x="${trackX}" y="${ry + 13}" width="${fillW}" height="32" rx="16" fill="${barGrads[idx] || "url(#barCyan)"}" />
        <line x1="${trackX + 14}" y1="${ry + 15}" x2="${trackX + fillW - 14}" y2="${ry + 15}" stroke="rgba(255,255,255,0.45)" stroke-width="1.3" stroke-linecap="round" />
        <text x="${trackX + fillW - 12}" y="${ry + 35}" text-anchor="end" font-family="${FONT_MONO}" font-size="15" font-weight="900" fill="#041016">${row.elo}</text>

        <text x="850" y="${ry + 35}" text-anchor="middle" font-family="${FONT_MONO}" font-size="16" font-weight="900" fill="#E2E8F0">${row.winRate}%</text>
        ${dots}
      </g>
    `);
  });

  // 4 Historical Bottom Modules
  bodyParts.push(renderBottomModulesGrid(984, data, "acc", defsList));
  bodyParts.push(footerSvg(`RANKING ACUMULADO • ATUALIZADO EM ${data.referenceDateLabel}`));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
    ${baseDefsAndCanvas(defsList.join("\n"))}
    ${bodyParts.join("\n")}
  </svg>`;
}

export function renderAccumulatedRankingCardPng(data: AccumulatedRankingCardData): Buffer {
  return renderSvgToPng(renderAccumulatedRankingCardSvg(data));
}
