import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Resvg } from "@resvg/resvg-js";
import { routedGenerateContent } from "./aiRouter.ts";

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

export interface DailyPointsPoint {
  index: number;
  label: string; // J01..
  status: "WIN" | "LOSS";
  scoreText: string;
  matchDiff: number; // saldo desta partida (+4, -3...)
  cumDiff: number; // saldo acumulado do atleta no dia
  groupAvgCumDiff: number; // média real do saldo acumulado do grupo até esta partida
  groupMatchMargin: number; // margem absoluta média das partidas do grupo até aqui
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
  pointsSeries: DailyPointsPoint[];
  groupAvgPointsDiff: number;
  groupAvgMatchMargin: number;
  distinctTeammatesCount: number;
  mostFrequentTeammate: { name: string; games: number } | null;
  aiHumorComment?: string;
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
  const pointsSeries: DailyPointsPoint[] = [];
  let sumAllMatchMargins = 0;
  let prevTs: number | undefined;

  nightMatches.forEach((m, idx) => {
    const teamA = extractTeamIds(m.teamA).map((id) => canonicalId(id, playerMap));
    const teamB = extractTeamIds(m.teamB).map((id) => canonicalId(id, playerMap));
    const { scoreA, scoreB, winner } = getMatchScores(m);
    const dur = resolveCardMatchDuration(m, prevTs);
    const curTs = Number(m.endTime || m.timestamp || m.createdAt || 0);
    if (curTs > 0) prevTs = curTs;

    sumAllMatchMargins += Math.abs(scoreA - scoreB);
    const runningAvgMargin = Number((sumAllMatchMargins / (idx + 1)).toFixed(1));

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

    // Média real do saldo acumulado do grupo após esta partida
    const allGroupEntries = Array.from(nightStandings.values());
    const runningGroupAvgCumDiff =
      allGroupEntries.length > 0
        ? Number(
            (
              allGroupEntries.reduce((acc, st) => acc + st.diff, 0) /
              allGroupEntries.length
            ).toFixed(1)
          )
        : 0;

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

      const label = `J${String(idx + 1).padStart(2, "0")}`;
      const scoreText = `${myScore}×${oppScore}`;

      timeline.push({
        index: idx + 1,
        label,
        status: won ? "WIN" : "LOSS",
        scoreText,
        myScore,
        oppScore,
        diff,
        durationLabel: dur.label,
        durationSeconds: dur.seconds,
        teammates
      });

      pointsSeries.push({
        index: idx + 1,
        label,
        status: won ? "WIN" : "LOSS",
        scoreText,
        matchDiff: diff,
        cumDiff: pointsDiff,
        groupAvgCumDiff: runningGroupAvgCumDiff,
        groupMatchMargin: runningAvgMargin
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

  const allFinalGroupStats = Array.from(nightStandings.values());
  const groupAvgPointsDiff =
    allFinalGroupStats.length > 0
      ? Number(
          (
            allFinalGroupStats.reduce((acc, st) => acc + st.diff, 0) /
            allFinalGroupStats.length
          ).toFixed(1)
        )
      : 0;
  const groupAvgMatchMargin =
    nightMatches.length > 0
      ? Number((sumAllMatchMargins / nightMatches.length).toFixed(1))
      : 0;

  const mostFreqEntry = [...mateEntries].sort((a, b) => b[1].games - a[1].games || b[1].wins - a[1].wins)[0];
  const mostFrequentTeammate = mostFreqEntry
    ? { name: getFullFirstName(playerMap.get(mostFreqEntry[0])?.name), games: mostFreqEntry[1].games }
    : null;

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
    pointsSeries,
    groupAvgPointsDiff,
    groupAvgMatchMargin,
    distinctTeammatesCount: mateEntries.length,
    mostFrequentTeammate,
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
    topRows: allRows,
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

  const topRows: AccumulatedRankingRow[] = currentSorted.map((p, idx) => {
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
const FONT_SANS = "'Liberation Sans', sans-serif";
const FONT_MONO = "'JetBrains Mono', 'Liberation Sans', monospace";

const BUNDLED_FONT_FILES: string[] = (() => {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidateDirs = [
    path.join(process.cwd(), "dist", "fonts"),
    path.join(process.cwd(), "public", "fonts"),
    path.join(process.cwd(), "fonts"),
    path.resolve(moduleDir, "..", "dist", "fonts"),
    path.resolve(moduleDir, "..", "public", "fonts"),
    path.resolve(moduleDir, "..", "fonts")
  ];
  const expected = [
    "LiberationSans-Regular.ttf",
    "LiberationSans-Bold.ttf",
    "JetBrainsMono-Regular.ttf",
    "JetBrainsMono-Bold.ttf",
    "JetBrainsMono-ExtraBold.ttf"
  ];
  const found: string[] = [];
  for (const fname of expected) {
    for (const dir of candidateDirs) {
      const full = path.join(dir, fname);
      if (fs.existsSync(full)) {
        found.push(full);
        break;
      }
    }
  }
  return found;
})();

export function getLoadedCardFontsCount(): number {
  return BUNDLED_FONT_FILES.length;
}

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

function wrapTextLines(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = w;
      if (lines.length === maxLines - 1) break;
    }
  }
  const usedWordsCount = lines.join(" ").split(" ").filter(Boolean).length;
  const remainingWords = words.slice(usedWordsCount);
  if (remainingWords.length > 0 && lines.length < maxLines) {
    lines.push(truncateText(remainingWords.join(" "), maxCharsPerLine));
  } else if (current && lines.length < maxLines) {
    lines.push(truncateText(current, maxCharsPerLine));
  }
  return lines.slice(0, maxLines);
}

function cleanAiHumorOutput(raw: string): string {
  const cleaned = String(raw || "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[*_`#"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  if (cleaned.length <= 235) return cleaned;
  const cut = cleaned.slice(0, 232);
  const lastPunct = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
  if (lastPunct >= 120) return cut.slice(0, lastPunct + 1).trim();
  return `${cut.trimEnd()}...`;
}

export async function enrichIndividualNightDataWithHumor(
  data: IndividualNightCardData
): Promise<IndividualNightCardData> {
  if (data.aiHumorComment && data.aiHumorComment.trim().length > 0) {
    return data;
  }

  const cacheKey = `ind_humor_v1_${data.playerId}_${data.dateKey}_${data.gamesPlayed}_${data.wins}_${data.losses}_${data.pointsDiff}`;
  const synergyLine = data.bestSynergy
    ? `Maior sinergia: ${data.bestSynergy.label} (${data.bestSynergy.winRate}%).`
    : "";
  const victimLine = data.victim
    ? `Freguês da noite: ${data.victim.label} (${data.victim.winRate}%).`
    : "";
  const nemesisLine = data.nemesis
    ? `Carrasco da noite: ${data.nemesis.label} (${data.nemesis.winRate}%).`
    : "";
  const freqLine =
    data.mostFrequentTeammate && data.mostFrequentTeammate.games >= 2
      ? `Parceiro mais frequente: ${data.mostFrequentTeammate.name} (${data.mostFrequentTeammate.games} jogos).`
      : "";

  const prompt =
    data.gamesPlayed === 0
      ? `Sócio: ${data.firstName}. Data: ${data.dateLabel}. Jogou 0 de ${data.totalMatchesNight} partidas na noite (ficou fora/rodízio). Faça um comentário bem-humorado curto (1 a 2 frases) sobre ter ficado só na resenha da arquibancada.`
      : [
          `Sócio: ${data.firstName}. Data: ${data.dateLabel}.`,
          `Partidas jogadas: ${data.gamesPlayed} de ${data.totalMatchesNight}. Resultado: ${data.wins}V / ${data.losses}D (${data.winRate}% de aproveitamento).`,
          `Saldo de pontos no dia: ${data.pointsDiff >= 0 ? "+" : ""}${data.pointsDiff} (média do grupo: ${data.groupAvgPointsDiff >= 0 ? "+" : ""}${data.groupAvgPointsDiff}; margem média das partidas: ±${data.groupAvgMatchMargin}).`,
          `Variação de ELO: ${data.eloDelta >= 0 ? "+" : ""}${data.eloDelta} (posição #${data.nightRank} de ${data.nightTotalPlayers} na noite).`,
          synergyLine,
          victimLine,
          nemesisLine,
          freqLine
        ]
          .filter(Boolean)
          .join(" ");

  try {
    const result = await Promise.race([
      routedGenerateContent({
        task: "daily_summary",
        cacheKey,
        cacheTtlMs: 24 * 60 * 60 * 1000,
        systemInstruction:
          "Você é o Guerreirinho, comentarista esportivo bem-humorado de um clube amador de vôlei (Guerreiros VC). Escreva UMA análise curtinha (1 a 2 frases, máximo 210 caracteres) em português do Brasil, leve, divertida, esportiva e respeitosa sobre o desempenho real do sócio na noite. Regras estritas: NÃO use emojis, NÃO use markdown/asteriscos/aspas, NÃO invente números que não foram informados, e elogie ou brinque de forma amigável com os resultados reais.",
        contents: prompt
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 4500))
    ]);

    const comment = result?.text ? cleanAiHumorOutput(result.text) : "";
    if (comment) {
      return { ...data, aiHumorComment: comment };
    }
  } catch (err: any) {
    console.warn(`[Cards AI Humor] Falha controlada ao gerar resenha de ${data.firstName}:`, err?.message || err);
  }

  return data;
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

function baseDefsAndCanvas(extraDefs: string, cardH: number = CARD_H, cardW: number = CARD_W): string {
  const midOrb =
    cardH > 1750
      ? `<circle cx="180" cy="${Math.round(cardH * 0.52)}" r="340" fill="url(#orbCyan)" />
         <circle cx="${cardW - 180}" cy="${Math.round(cardH * 0.68)}" r="320" fill="url(#orbEmerald)" />`
      : "";
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

  <rect width="${cardW}" height="${cardH}" fill="url(#bgCanvas)" />
  <circle cx="150" cy="140" r="320" fill="url(#orbCyan)" />
  <circle cx="${cardW - 140}" cy="360" r="340" fill="url(#orbEmerald)" />
  ${midOrb}
  <circle cx="${cardW - 200}" cy="${cardH - 180}" r="340" fill="url(#orbGold)" />
  <circle cx="160" cy="${cardH - 260}" r="280" fill="url(#orbCoral)" />
  `;
}

function footerSvg(subtitle: string, cardH: number = CARD_H, cardW: number = CARD_W): string {
  const padX = 32;
  return `
    <g>
      <line x1="${padX}" y1="${cardH - 66}" x2="${cardW - padX}" y2="${cardH - 66}" stroke="rgba(255,255,255,0.12)" stroke-width="1.2" />
      <text x="${padX}" y="${cardH - 30}" font-family="${FONT_SANS}" font-size="18" font-weight="800" fill="#CBD5E1" letter-spacing="1.4">GUERREIROS VOLLEYBALL CLUB</text>
      <text x="${cardW - padX}" y="${cardH - 30}" text-anchor="end" font-family="${FONT_SANS}" font-size="17" font-weight="700" fill="#94A3B8">${esc(subtitle)}</text>
    </g>
  `;
}

function getRankTierVisual(idx: number): { barGrad: string; ringCol: string } {
  if (idx === 0) return { barGrad: "url(#barGold)", ringCol: "#FBBF24" };
  if (idx === 1) return { barGrad: "url(#barEmerald)", ringCol: "#34D399" };
  if (idx <= 4) return { barGrad: "url(#barCyan)", ringCol: "#38BDF8" };
  if (idx <= 9) return { barGrad: "url(#barIndigo)", ringCol: "#818CF8" };
  if (idx <= 19) return { barGrad: "url(#barViolet)", ringCol: "#C084FC" };
  return { barGrad: "url(#barCoral)", ringCol: "#FB7185" };
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
      fontFiles: BUNDLED_FONT_FILES,
      loadSystemFonts: BUNDLED_FONT_FILES.length === 0,
      defaultFontFamily: "Liberation Sans",
      sansSerifFamily: "Liberation Sans",
      monospaceFamily: "JetBrains Mono"
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
  const marginX = 28;
  const contentW = CARD_W - marginX * 2; // 1024px (otimizado para leitura em tela de celular)

  // Header panel
  bodyParts.push(glassPanel(marginX, 28, contentW, 214, 28, "rgba(15, 27, 48, 0.80)", "rgba(56, 189, 248, 0.32)"));

  const heroAv = renderAvatarSvg({
    cx: 114,
    cy: 135,
    r: 58,
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
    <text x="192" y="76" font-family="${FONT_SANS}" font-size="18" font-weight="800" fill="#38BDF8" letter-spacing="1.8">RESUMO INDIVIDUAL DA NOITE • ${esc(data.dateLabel)}</text>
    <text x="192" y="134" font-family="${FONT_SANS}" font-size="52" font-weight="900" fill="#F8FAFC">${esc(truncateText(data.firstName, 16))}</text>

    <rect x="192" y="156" width="150" height="40" rx="20" fill="rgba(16, 185, 129, 0.16)" stroke="${eloColor}" stroke-width="1.5" />
    <text x="267" y="182" text-anchor="middle" font-family="${FONT_MONO}" font-size="20" font-weight="900" fill="${eloColor}">${esc(eloLabel)}</text>

    <rect x="354" y="156" width="218" height="40" rx="20" fill="rgba(56, 189, 248, 0.15)" stroke="rgba(56, 189, 248, 0.50)" stroke-width="1.3" />
    <text x="463" y="182" text-anchor="middle" font-family="${FONT_SANS}" font-size="19" font-weight="800" fill="#E0F2FE">#${data.nightRank} de ${data.nightTotalPlayers} na Noite</text>

    <rect x="584" y="156" width="154" height="40" rx="20" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.20)" stroke-width="1.2" />
    <text x="661" y="182" text-anchor="middle" font-family="${FONT_MONO}" font-size="19" font-weight="800" fill="#E2E8F0">ELO ${data.currentElo}</text>
  `);

  // Gráfico 1: Anel Liquid Glass no topo direito do Header
  const ringCx = 954;
  const ringCy = 135;
  const ringR = 62;
  const circ = 2 * Math.PI * ringR;
  const pct = Math.max(0, Math.min(100, data.winRate));
  const dashLen = (pct / 100) * circ;

  bodyParts.push(`
    <g>
      <circle cx="${ringCx}" cy="${ringCy}" r="${ringR + 12}" fill="rgba(6, 182, 212, 0.09)" stroke="rgba(255,255,255,0.12)" stroke-width="1.4" />
      <circle cx="${ringCx}" cy="${ringCy}" r="${ringR}" fill="none" stroke="rgba(148, 163, 184, 0.22)" stroke-width="14" />
      <circle cx="${ringCx}" cy="${ringCy}" r="${ringR}" fill="none" stroke="url(#ringGrad)" stroke-width="14" stroke-linecap="round"
        stroke-dasharray="${dashLen.toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 ${ringCx} ${ringCy})" />
      <text x="${ringCx}" y="${ringCy + 8}" text-anchor="middle" font-family="${FONT_MONO}" font-size="34" font-weight="900" fill="#F8FAFC">${pct}%</text>
      <text x="${ringCx}" y="${ringCy + 32}" text-anchor="middle" font-family="${FONT_SANS}" font-size="14" font-weight="800" fill="#CBD5E1" letter-spacing="1.2">APROV.</text>
    </g>
  `);

  // 4 Liquid Glass KPI Tiles (Mobile-First Typography)
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
      sub: "tempo real",
      accent: "#A78BFA"
    }
  ];

  const kpiGap = 16;
  const kpiW = Math.floor((contentW - kpiGap * 3) / 4); // 244px
  kpis.forEach((k, i) => {
    const kx = marginX + i * (kpiW + kpiGap);
    const ky = 260;
    bodyParts.push(glassPanel(kx, ky, kpiW, 126, 22, "rgba(15, 25, 44, 0.76)", "rgba(255,255,255,0.16)"));
    bodyParts.push(`
      <rect x="${kx + 18}" y="${ky + 18}" width="38" height="4.5" rx="2.25" fill="${k.accent}" />
      <text x="${kx + 18}" y="${ky + 47}" font-family="${FONT_SANS}" font-size="15.5" font-weight="800" fill="#CBD5E1" letter-spacing="1.1">${esc(k.label)}</text>
      <text x="${kx + 18}" y="${ky + 88}" font-family="${FONT_MONO}" font-size="34" font-weight="900" fill="#F8FAFC">${esc(k.value)}</text>
      <text x="${kx + 18}" y="${ky + 112}" font-family="${FONT_SANS}" font-size="15.5" font-weight="700" fill="${k.accent}">${esc(k.sub)}</text>
    `);
  });

  // LINHA DO TEMPO DA NOITE — HORIZONTAL (APENAS CRONOLOGIA, PLACAR, SALDO E DURAÇÃO)
  const visibleTimeline = data.timeline.slice(0, 12);
  const tlRowStep = visibleTimeline.length > 9 ? 44 : 48;
  const tlBarH = visibleTimeline.length > 9 ? 34 : 38;
  const timelineH = Math.max(220, 82 + visibleTimeline.length * tlRowStep + 16);
  const tlY = 404;
  bodyParts.push(glassPanel(marginX, tlY, contentW, timelineH, 26, "rgba(13, 22, 40, 0.80)", "rgba(255,255,255,0.16)"));
  bodyParts.push(`
    <text x="${marginX + 26}" y="${tlY + 45}" font-family="${FONT_SANS}" font-size="21" font-weight="900" fill="#F8FAFC" letter-spacing="1.0">LINHA DO TEMPO DA NOITE • HORIZONTAL</text>
    <text x="${marginX + contentW - 26}" y="${tlY + 45}" text-anchor="end" font-family="${FONT_SANS}" font-size="15" font-weight="800" fill="#94A3B8">VITÓRIA • DERROTA • RODÍZIO</text>
  `);

  const maxScore = Math.max(15, ...visibleTimeline.map((t) => Math.max(t.myScore, t.oppScore)));
  const trackX = 132;
  const trackW = 636;

  visibleTimeline.forEach((item, idx) => {
    const ry = tlY + 68 + idx * tlRowStep;
    const textBaseline = ry + Math.round(tlBarH * 0.68);
    const barRx = Math.round(tlBarH / 2);
    const isWin = item.status === "WIN";
    const isLoss = item.status === "LOSS";
    const ratio = isWin || isLoss
      ? Math.max(0.42, Math.min(1, (Math.max(item.myScore, item.oppScore) / maxScore) * (isWin ? 0.96 : 0.78)))
      : 0.48;
    const fillW = Math.round(trackW * ratio);
    const barFill = isWin ? "url(#barEmerald)" : isLoss ? "url(#barCoral)" : "url(#barSlate)";
    const badgeColor = isWin ? "#34D399" : isLoss ? "#FB7185" : "#CBD5E1";
    const statusTxt = isWin ? "VITÓRIA" : isLoss ? "DERROTA" : "RODÍZIO";
    const diffTxt = isWin ? `+${item.diff}` : isLoss ? `${item.diff}` : "FORA";

    bodyParts.push(`
      <g>
        <text x="${marginX + 26}" y="${textBaseline}" font-family="${FONT_MONO}" font-size="20" font-weight="900" fill="#F1F5F9">${esc(item.label)}</text>
        <rect x="${trackX}" y="${ry}" width="${trackW}" height="${tlBarH}" rx="${barRx}" fill="rgba(15, 23, 42, 0.82)" stroke="rgba(255,255,255,0.10)" stroke-width="1.1" />
        <rect x="${trackX}" y="${ry}" width="${fillW}" height="${tlBarH}" rx="${barRx}" fill="${barFill}" />
        <line x1="${trackX + 18}" y1="${ry + 2.5}" x2="${trackX + fillW - 18}" y2="${ry + 2.5}" stroke="rgba(255,255,255,0.45)" stroke-width="1.4" stroke-linecap="round" />
        <text x="${trackX + 20}" y="${textBaseline}" font-family="${FONT_SANS}" font-size="16" font-weight="900" fill="${isWin || isLoss ? "#041016" : "#E2E8F0"}" letter-spacing="0.7">${statusTxt}</text>
        <text x="${trackX + fillW - 18}" y="${textBaseline}" text-anchor="end" font-family="${FONT_MONO}" font-size="19" font-weight="900" fill="${isWin || isLoss ? "#041016" : "#F8FAFC"}">${esc(item.scoreText)}</text>

        <text x="826" y="${textBaseline}" text-anchor="middle" font-family="${FONT_MONO}" font-size="19" font-weight="900" fill="${badgeColor}">${esc(diffTxt)}</text>
        <rect x="884" y="${ry + 2}" width="142" height="${tlBarH - 4}" rx="${Math.round((tlBarH - 4) / 2)}" fill="rgba(56, 189, 248, 0.14)" stroke="rgba(56, 189, 248, 0.36)" stroke-width="1.2" />
        <text x="955" y="${textBaseline - 1}" text-anchor="middle" font-family="${FONT_MONO}" font-size="16.5" font-weight="800" fill="#BAE6FD">${esc(item.durationLabel)}</text>
      </g>
    `);
  });

  // GRÁFICO LIQUID GLASS: VARIAÇÃO DOS PONTOS DO DIA (SALDO DAS PARTIDAS × MÉDIA DO GRUPO)
  const chartY = tlY + timelineH + 20;
  const chartH = 342;
  defsList.push(`
    <linearGradient id="ptsAreaFillInd" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#22D3EE" stop-opacity="0.40" />
      <stop offset="55%" stop-color="#10B981" stop-opacity="0.18" />
      <stop offset="100%" stop-color="#060A12" stop-opacity="0.02" />
    </linearGradient>
    <linearGradient id="ptsLineStrokeInd" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#38BDF8" />
      <stop offset="55%" stop-color="#34D399" />
      <stop offset="100%" stop-color="#FBBF24" />
    </linearGradient>
  `);

  bodyParts.push(glassPanel(marginX, chartY, contentW, chartH, 26, "rgba(13, 22, 40, 0.80)", "rgba(56, 189, 248, 0.28)"));
  const fmtSigned = (n: number, dec = 0) => {
    const val = dec > 0 ? n.toFixed(dec) : String(Math.round(n));
    return n > 0 ? `+${val}` : val;
  };
  const avgPerGame = data.gamesPlayed > 0 ? data.pointsDiff / data.gamesPlayed : 0;
  const groupAvgStr = fmtSigned(data.groupAvgPointsDiff, 1);

  bodyParts.push(`
    <text x="${marginX + 26}" y="${chartY + 40}" font-family="${FONT_SANS}" font-size="20" font-weight="900" fill="#F8FAFC" letter-spacing="0.9">VARIAÇÃO DOS PONTOS DO DIA • SALDO DAS PARTIDAS</text>
    <text x="${marginX + 26}" y="${chartY + 65}" font-family="${FONT_SANS}" font-size="15.5" font-weight="700" fill="#7DD3FC">SEU SALDO (${esc(fmtSigned(avgPerGame, 1))} PTS/J) × MÉDIA DO GRUPO (${esc(groupAvgStr)} PTS)</text>

    <rect x="${marginX + 26}" y="${chartY + 80}" width="13" height="14" rx="3" fill="rgba(16, 185, 129, 0.38)" stroke="#34D399" stroke-width="1.2" />
    <text x="${marginX + 47}" y="${chartY + 93}" font-family="${FONT_SANS}" font-size="15" font-weight="800" fill="#A7F3D0">Saldo Jogo</text>

    <circle cx="${marginX + 184}" cy="${chartY + 87}" r="6" fill="#22D3EE" />
    <text x="${marginX + 198}" y="${chartY + 93}" font-family="${FONT_SANS}" font-size="15" font-weight="800" fill="#E0F2FE">Atleta (Acum.)</text>

    <line x1="${marginX + 356}" y1="${chartY + 87}" x2="${marginX + 388}" y2="${chartY + 87}" stroke="#FBBF24" stroke-width="3" stroke-dasharray="6 4" />
    <text x="${marginX + 398}" y="${chartY + 93}" font-family="${FONT_SANS}" font-size="15" font-weight="800" fill="#FDE68A">Média Grupo</text>

    <rect x="${marginX + contentW - 252}" y="${chartY + 73}" width="226" height="30" rx="15" fill="rgba(251, 191, 36, 0.14)" stroke="rgba(251, 191, 36, 0.42)" stroke-width="1.2" />
    <text x="${marginX + contentW - 139}" y="${chartY + 93}" text-anchor="middle" font-family="${FONT_MONO}" font-size="14.5" font-weight="800" fill="#FBBF24">MARGEM: ±${data.groupAvgMatchMargin.toFixed(1)}/J</text>
  `);

  const rawPts = data.pointsSeries || [];
  const plotX = 96;
  const plotY = chartY + 124;
  const plotW = 924;
  const plotH = 152;

  if (rawPts.length === 0) {
    bodyParts.push(`
      <text x="${plotX + plotW / 2}" y="${plotY + plotH / 2}" text-anchor="middle" font-family="${FONT_SANS}" font-size="18" font-weight="700" fill="#94A3B8">Sem partidas jogadas na sessão para gerar a curva de saldo</text>
    `);
  } else {
    const chartPts =
      rawPts.length === 1
        ? [
            {
              label: "INÍCIO",
              status: "WIN" as const,
              matchDiff: 0,
              cumDiff: 0,
              groupAvgCumDiff: 0,
              isAnchor: true
            },
            { ...rawPts[0], isAnchor: false }
          ]
        : rawPts.map((p) => ({ ...p, isAnchor: false }));

    const allVals = [
      0,
      ...chartPts.flatMap((p) => [p.cumDiff, p.groupAvgCumDiff, p.matchDiff])
    ];
    const minRaw = Math.min(...allVals);
    const maxRaw = Math.max(...allVals);
    const rawSpan = Math.max(8, maxRaw - minRaw + 6);
    const niceSteps = [2, 5, 10, 15, 20, 25, 30, 40, 50, 100];
    const tickStep = niceSteps.find((s) => rawSpan / s <= 4.2) || 100;
    const yMin = Math.min(0, Math.floor((minRaw - 1) / tickStep) * tickStep);
    const yMax = Math.max(tickStep, Math.ceil((maxRaw + Math.max(3, tickStep * 0.45)) / tickStep) * tickStep);
    const ySpan = Math.max(tickStep * 2, yMax - yMin);

    const toY = (v: number) => plotY + plotH - ((v - yMin) / ySpan) * plotH;
    const xPad = 28;
    const usablePlotW = Math.max(100, plotW - xPad * 2);
    const stepX = chartPts.length > 1 ? usablePlotW / (chartPts.length - 1) : 0;
    const toX = (i: number) =>
      chartPts.length > 1 ? plotX + xPad + i * stepX : plotX + plotW / 2;

    const gridTicks: number[] = [];
    for (let v = yMin; v <= yMax; v += tickStep) {
      gridTicks.push(v);
    }
    for (const val of gridTicks) {
      const gy = toY(val);
      const isZeroLine = val === 0;
      bodyParts.push(`
        <line x1="${plotX}" y1="${gy.toFixed(1)}" x2="${plotX + plotW}" y2="${gy.toFixed(1)}"
          stroke="${isZeroLine ? "rgba(251,191,36,0.34)" : "rgba(148,163,184,0.14)"}"
          stroke-width="${isZeroLine ? "1.4" : "1"}" stroke-dasharray="${isZeroLine ? "0" : "4 4"}" />
        <text x="${plotX - 14}" y="${(gy + 5).toFixed(1)}" text-anchor="end" font-family="${FONT_MONO}" font-size="15.5" font-weight="800" fill="${isZeroLine ? "#FDE68A" : "#CBD5E1"}">${esc(fmtSigned(val))}</text>
      `);
    }

    const zeroY = toY(0);

    const barColW = Math.min(38, Math.max(16, Math.floor((plotW / Math.max(2, chartPts.length)) * 0.28)));
    chartPts.forEach((pt, i) => {
      if (pt.isAnchor) return;
      const cx = toX(i);
      const barTopY = toY(Math.max(0, pt.matchDiff));
      const barBotY = toY(Math.min(0, pt.matchDiff));
      const bh = Math.max(4, barBotY - barTopY);
      const fillBar = pt.matchDiff >= 0 ? "rgba(16, 185, 129, 0.24)" : "rgba(244, 63, 94, 0.24)";
      const strokeBar = pt.matchDiff >= 0 ? "rgba(52, 211, 153, 0.50)" : "rgba(251, 113, 133, 0.50)";
      bodyParts.push(`
        <rect x="${(cx - barColW / 2).toFixed(1)}" y="${barTopY.toFixed(1)}" width="${barColW}" height="${bh.toFixed(1)}" rx="6"
          fill="${fillBar}" stroke="${strokeBar}" stroke-width="1.2" />
      `);
    });

    const buildSmoothCurve = (coords: Array<{ x: number; y: number }>) => {
      if (coords.length === 0) return "";
      if (coords.length === 1) return `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
      let d = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
      for (let i = 0; i < coords.length - 1; i++) {
        const p0 = coords[i];
        const p1 = coords[i + 1];
        const midX = (p0.x + p1.x) / 2;
        d += ` C ${midX.toFixed(1)} ${p0.y.toFixed(1)}, ${midX.toFixed(1)} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
      }
      return d;
    };

    const athleteCoords = chartPts.map((pt, i) => ({ x: toX(i), y: toY(pt.cumDiff) }));
    const groupCoords = chartPts.map((pt, i) => ({ x: toX(i), y: toY(pt.groupAvgCumDiff) }));

    const athletePath = buildSmoothCurve(athleteCoords);
    const groupPath = buildSmoothCurve(groupCoords);

    const firstCoord = athleteCoords[0];
    const lastCoord = athleteCoords[athleteCoords.length - 1];
    const areaPath = `${athletePath} L ${lastCoord.x.toFixed(1)} ${zeroY.toFixed(1)} L ${firstCoord.x.toFixed(1)} ${zeroY.toFixed(1)} Z`;

    bodyParts.push(`
      <path d="${areaPath}" fill="url(#ptsAreaFillInd)" />
      <path d="${groupPath}" fill="none" stroke="#FBBF24" stroke-width="3" stroke-dasharray="8 5" stroke-opacity="0.94" />
      <path d="${athletePath}" fill="none" stroke="url(#ptsLineStrokeInd)" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round" />
    `);

    chartPts.forEach((pt, i) => {
      const cx = athleteCoords[i].x;
      const cy = athleteCoords[i].y;
      const gCy = groupCoords[i].y;
      const nodeColor = pt.isAnchor ? "#94A3B8" : pt.status === "WIN" ? "#34D399" : "#FB7185";
      const valAbove = cy > plotY + 28;
      const valY = valAbove ? cy - 14 : cy + 24;

      bodyParts.push(`
        <circle cx="${cx.toFixed(1)}" cy="${gCy.toFixed(1)}" r="4.2" fill="#FBBF24" stroke="#050912" stroke-width="1.4" />
        <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="9" fill="${nodeColor}" fill-opacity="0.24" />
        <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="5.8" fill="${nodeColor}" stroke="#050912" stroke-width="2" />
        <text x="${cx.toFixed(1)}" y="${valY.toFixed(1)}" text-anchor="middle" font-family="${FONT_MONO}" font-size="16.5" font-weight="900" fill="#F8FAFC">${esc(fmtSigned(pt.cumDiff))}</text>
        <text x="${cx.toFixed(1)}" y="${plotY + plotH + 26}" text-anchor="middle" font-family="${FONT_MONO}" font-size="16" font-weight="800" fill="#F1F5F9">${esc(pt.label)}</text>
        ${
          pt.isAnchor
            ? ""
            : `<text x="${cx.toFixed(1)}" y="${plotY + plotH + 47}" text-anchor="middle" font-family="${FONT_MONO}" font-size="14.5" font-weight="800" fill="${pt.matchDiff >= 0 ? "#34D399" : "#FB7185"}">(${esc(fmtSigned(pt.matchDiff))})</text>`
        }
      `);
    });
  }

  // RESUMO DOS TIMES — PARCEIROS EM QUADRA (SEPARADO DA LINHA DO TEMPO • ZERO DUPLICAÇÃO DE PLACAR/STATUS)
  const playedItems = data.timeline.filter((t) => t.status !== "OUT");
  const teamsY = chartY + chartH + 20;
  const teamRowStep = playedItems.length > 6 ? 38 : 42;
  const teamsH = Math.max(134, 70 + Math.max(1, playedItems.length) * teamRowStep + 16);

  const freqLabel =
    data.mostFrequentTeammate && data.mostFrequentTeammate.games >= 2
      ? ` • +FREQ.: ${data.mostFrequentTeammate.name.toUpperCase()} (${data.mostFrequentTeammate.games}J)`
      : "";
  const teamsSubHeader = `${data.distinctTeammatesCount} PARCEIROS DISTINTOS${freqLabel}`;

  bodyParts.push(glassPanel(marginX, teamsY, contentW, teamsH, 24, "rgba(15, 25, 44, 0.76)", "rgba(255,255,255,0.16)"));
  bodyParts.push(`
    <text x="${marginX + 26}" y="${teamsY + 40}" font-family="${FONT_SANS}" font-size="20" font-weight="900" fill="#F8FAFC" letter-spacing="0.9">RESUMO DOS TIMES • PARCEIROS EM QUADRA</text>
    <text x="${marginX + contentW - 26}" y="${teamsY + 40}" text-anchor="end" font-family="${FONT_SANS}" font-size="15" font-weight="800" fill="#38BDF8" letter-spacing="0.6">${esc(teamsSubHeader)}</text>
  `);

  if (playedItems.length === 0) {
    bodyParts.push(`
      <text x="${marginX + 26}" y="${teamsY + 88}" font-family="${FONT_SANS}" font-size="17" font-weight="700" fill="#94A3B8">Sem partidas registradas na noite</text>
    `);
  } else {
    playedItems.forEach((m, idx) => {
      const ty = teamsY + 62 + idx * teamRowStep;
      const matesTxt = truncateText(m.teammates.join("  •  ") || "Sem parceiros registrados", 60);
      bodyParts.push(`
        <g>
          <rect x="${marginX + 26}" y="${ty - 2}" width="62" height="29" rx="14.5" fill="rgba(56, 189, 248, 0.16)" stroke="rgba(56, 189, 248, 0.42)" stroke-width="1.2" />
          <text x="${marginX + 57}" y="${ty + 18}" text-anchor="middle" font-family="${FONT_MONO}" font-size="16" font-weight="900" fill="#BAE6FD">${esc(m.label)}</text>
          <text x="${marginX + 104}" y="${ty + 19}" font-family="${FONT_SANS}" font-size="18.5" font-weight="700" fill="#F1F5F9">${esc(matesTxt)}</text>
        </g>
      `);
    });
  }

  // SINERGIA & CONFRONTOS DA NOITE (ESTILO 3 LIQUID GLASS — MOBILE READY)
  const synY = teamsY + teamsH + 20;
  const synH = 232;
  bodyParts.push(glassPanel(marginX, synY, contentW, synH, 24, "rgba(15, 25, 44, 0.76)", "rgba(255,255,255,0.16)"));
  bodyParts.push(`
    <text x="${marginX + 26}" y="${synY + 40}" font-family="${FONT_SANS}" font-size="20" font-weight="900" fill="#F8FAFC" letter-spacing="0.9">SINERGIA &amp; CONFRONTOS DA NOITE</text>
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
    const bw = 478;
    const bx = marginX + 26 + col * (bw + 16);
    const by = synY + 58 + row * 78;

    if (!item) {
      bodyParts.push(`
        <rect x="${bx}" y="${by}" width="${bw}" height="66" rx="18" fill="rgba(15,23,42,0.55)" stroke="rgba(255,255,255,0.08)" />
        <text x="${bx + 22}" y="${by + 39}" font-family="${FONT_SANS}" font-size="16.5" font-weight="700" fill="#94A3B8">Sem amostra suficiente na noite</text>
      `);
      return;
    }

    const av = renderAvatarSvg({
      cx: bx + 34,
      cy: by + 33,
      r: 23,
      photo: item.photos[0] || null,
      name: item.names[0] || item.label,
      clipId: `ind_syn_${i}`,
      ringColor: accentToHex(item.accent)
    });
    defsList.push(av.defs);
    bodyParts.push(`
      <rect x="${bx}" y="${by}" width="${bw}" height="66" rx="18" fill="rgba(15,23,42,0.72)" stroke="rgba(255,255,255,0.12)" />
      ${av.body}
      <text x="${bx + 68}" y="${by + 24}" font-family="${FONT_SANS}" font-size="13.5" font-weight="800" fill="${accentToHex(item.accent)}" letter-spacing="0.9">${esc(item.subtitle || "")}</text>
      <text x="${bx + 68}" y="${by + 50}" font-family="${FONT_SANS}" font-size="21" font-weight="900" fill="#F8FAFC">${esc(truncateText(item.label, 14))}</text>
      <rect x="${bx + 252}" y="${by + 20}" width="138" height="26" rx="13" fill="rgba(30,41,59,0.88)" />
      <rect x="${bx + 252}" y="${by + 20}" width="${Math.max(26, Math.round((item.winRate / 100) * 138))}" height="26" rx="13" fill="${accentToBarUrl(item.accent)}" />
      <text x="${bx + 402}" y="${by + 40}" font-family="${FONT_MONO}" font-size="20" font-weight="900" fill="${accentToHex(item.accent)}">${item.winRate}%</text>
    `);
  });

  let bottomContentEndY = synY + synH;

  // RESENHA DO GUERREIRINHO • ANÁLISE CURTA E BEM-HUMORADA (IA • FONTE GRANDE PARA CELULAR)
  if (data.aiHumorComment && data.aiHumorComment.trim().length > 0) {
    const humorY = synY + synH + 20;
    const humorLines = wrapTextLines(data.aiHumorComment, 64, 4);
    const lineStep = 30;
    const humorH = 74 + Math.max(1, humorLines.length) * lineStep + 18;

    bodyParts.push(
      glassPanel(marginX, humorY, contentW, humorH, 24, "rgba(18, 25, 50, 0.88)", "rgba(167, 139, 250, 0.42)")
    );
    bodyParts.push(`
      <rect x="${marginX + 26}" y="${humorY + 20}" width="26" height="26" rx="8" fill="rgba(167, 139, 250, 0.22)" stroke="rgba(192, 132, 252, 0.55)" stroke-width="1.2" />
      <path d="M ${marginX + 39} ${humorY + 25.5} L ${marginX + 41} ${humorY + 31} L ${marginX + 46.5} ${humorY + 33} L ${marginX + 41} ${humorY + 35} L ${marginX + 39} ${humorY + 40.5} L ${marginX + 37} ${humorY + 35} L ${marginX + 31.5} ${humorY + 33} L ${marginX + 37} ${humorY + 31} Z" fill="#C084FC" />
      <text x="${marginX + 64}" y="${humorY + 40}" font-family="${FONT_SANS}" font-size="19.5" font-weight="900" fill="#E9D5FF" letter-spacing="1.0">RESENHA DO GUERREIRINHO • ANÁLISE IA</text>
      <rect x="${marginX + contentW - 208}" y="${humorY + 19}" width="182" height="28" rx="14" fill="rgba(56, 189, 248, 0.15)" stroke="rgba(56, 189, 248, 0.40)" stroke-width="1.2" />
      <text x="${marginX + contentW - 117}" y="${humorY + 38}" text-anchor="middle" font-family="${FONT_SANS}" font-size="13.5" font-weight="800" fill="#BAE6FD" letter-spacing="0.8">RESENHA DA NOITE</text>
    `);

    humorLines.forEach((line, idx) => {
      const ly = humorY + 82 + idx * lineStep;
      bodyParts.push(`
        <text x="${marginX + 26}" y="${ly}" font-family="${FONT_SANS}" font-size="20" font-weight="700" fill="#F8FAFC">${esc(line)}</text>
      `);
    });

    bottomContentEndY = humorY + humorH;
  }

  const indCardH = Math.max(CARD_H, bottomContentEndY + 90);
  bodyParts.push(footerSvg(`SÓCIO: ${data.firstName.toUpperCase()} • ${data.dateLabel}`, indCardH, CARD_W));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${indCardH}" viewBox="0 0 ${CARD_W} ${indCardH}">
    ${baseDefsAndCanvas(defsList.join("\n"), indCardH, CARD_W)}
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
  defsList: string[],
  cardW: number = CARD_W
): string {
  const parts: string[] = [];
  const marginX = 28;
  const colGap = 16;
  const boxW = Math.floor((cardW - marginX * 2 - colGap) / 2); // 504px
  const boxH = 198;
  const leftX = marginX;
  const rightX = marginX + boxW + colGap;
  const row1Y = startY;
  const row2Y = startY + boxH + 16;
  const pctXOffset = boxW - 72;
  const barXOffset = 304;
  const barWidthStd = 118;
  const lowBarXOffset = 276;
  const lowBarWidth = 146;

  // Box 1: Melhores Duplas & Trios
  parts.push(glassPanel(leftX, row1Y, boxW, boxH, 22, "rgba(15, 25, 44, 0.78)", "rgba(56, 189, 248, 0.28)"));
  parts.push(`<text x="${leftX + 20}" y="${row1Y + 37}" font-family="${FONT_SANS}" font-size="17.5" font-weight="900" fill="#38BDF8" letter-spacing="0.9">MELHORES DUPLAS &amp; TRIOS</text>`);

  if (modules.bestDuosTrios.length === 0) {
    parts.push(`<text x="${leftX + 20}" y="${row1Y + 105}" font-family="${FONT_SANS}" font-size="16.5" fill="#94A3B8">Sem duplas com jogos suficientes</text>`);
  } else {
    modules.bestDuosTrios.slice(0, 2).forEach((item, idx) => {
      const y = row1Y + 58 + idx * 64;
      item.names.slice(0, 3).forEach((nm, aIdx) => {
        const av = renderAvatarSvg({
          cx: leftX + 34 + aIdx * 22,
          cy: y + 24,
          r: 17,
          photo: item.photos[aIdx] || null,
          name: nm,
          clipId: `${idPrefix}_dt_${idx}_${aIdx}`,
          ringColor: accentToHex(item.accent)
        });
        defsList.push(av.defs);
        parts.push(av.body);
      });
      const textX = leftX + 44 + Math.min(3, item.names.length) * 22;
      const fillW = Math.max(24, Math.round((item.winRate / 100) * barWidthStd));
      parts.push(`
        <text x="${textX}" y="${y + 18}" font-family="${FONT_SANS}" font-size="13" font-weight="800" fill="${accentToHex(item.accent)}">${esc(item.subtitle || "DUPLA")}</text>
        <text x="${textX}" y="${y + 40}" font-family="${FONT_SANS}" font-size="16.5" font-weight="800" fill="#F8FAFC">${esc(truncateText(item.label, 19))}</text>
        <rect x="${leftX + barXOffset}" y="${y + 12}" width="${barWidthStd}" height="24" rx="12" fill="rgba(15,23,42,0.85)" />
        <rect x="${leftX + barXOffset}" y="${y + 12}" width="${fillW}" height="24" rx="12" fill="${accentToBarUrl(item.accent)}" />
        <text x="${leftX + pctXOffset}" y="${y + 30}" font-family="${FONT_MONO}" font-size="18" font-weight="900" fill="${accentToHex(item.accent)}">${item.winRate}%</text>
      `);
    });
  }

  // Box 2: Maior × Menor Sinergia
  parts.push(glassPanel(rightX, row1Y, boxW, boxH, 22, "rgba(15, 25, 44, 0.78)", "rgba(16, 185, 129, 0.28)"));
  parts.push(`<text x="${rightX + 20}" y="${row1Y + 37}" font-family="${FONT_SANS}" font-size="17.5" font-weight="900" fill="#34D399" letter-spacing="0.9">MAIOR × MENOR SINERGIA</text>`);

  const synPair = [modules.synergyHigh, modules.synergyLow].filter(Boolean) as PairMetricItem[];
  if (synPair.length === 0) {
    parts.push(`<text x="${rightX + 20}" y="${row1Y + 105}" font-family="${FONT_SANS}" font-size="16.5" fill="#94A3B8">Sem pares elegíveis</text>`);
  } else {
    synPair.forEach((item, idx) => {
      const y = row1Y + 58 + idx * 64;
      item.names.slice(0, 2).forEach((nm, aIdx) => {
        const av = renderAvatarSvg({
          cx: rightX + 34 + aIdx * 24,
          cy: y + 24,
          r: 17,
          photo: item.photos[aIdx] || null,
          name: nm,
          clipId: `${idPrefix}_syn_${idx}_${aIdx}`,
          ringColor: accentToHex(item.accent)
        });
        defsList.push(av.defs);
        parts.push(av.body);
      });
      const textX = rightX + 86;
      const fillW = Math.max(20, Math.round((item.winRate / 100) * barWidthStd));
      parts.push(`
        <text x="${textX}" y="${y + 18}" font-family="${FONT_SANS}" font-size="13" font-weight="800" fill="${accentToHex(item.accent)}">${esc(item.subtitle || "")}</text>
        <text x="${textX}" y="${y + 40}" font-family="${FONT_SANS}" font-size="16.5" font-weight="800" fill="#F8FAFC">${esc(truncateText(item.label, 20))}</text>
        <rect x="${rightX + barXOffset}" y="${y + 12}" width="${barWidthStd}" height="24" rx="12" fill="rgba(15,23,42,0.85)" />
        <rect x="${rightX + barXOffset}" y="${y + 12}" width="${fillW}" height="24" rx="12" fill="${accentToBarUrl(item.accent)}" />
        <text x="${rightX + pctXOffset}" y="${y + 30}" font-family="${FONT_MONO}" font-size="18" font-weight="900" fill="${accentToHex(item.accent)}">${item.winRate}%</text>
      `);
    });
  }

  // Box 3: Carrascos × Fregueses
  parts.push(glassPanel(leftX, row2Y, boxW, boxH, 22, "rgba(15, 25, 44, 0.78)", "rgba(168, 85, 247, 0.28)"));
  parts.push(`<text x="${leftX + 20}" y="${row2Y + 37}" font-family="${FONT_SANS}" font-size="17.5" font-weight="900" fill="#C084FC" letter-spacing="0.9">CARRASCOS × FREGUESES</text>`);

  if (modules.rivals.length === 0) {
    parts.push(`<text x="${leftX + 20}" y="${row2Y + 105}" font-family="${FONT_SANS}" font-size="16.5" fill="#94A3B8">Sem confrontos diretos recorrentes</text>`);
  } else {
    modules.rivals.slice(0, 2).forEach((rv, idx) => {
      const y = row2Y + 58 + idx * 64;
      const av1 = renderAvatarSvg({
        cx: leftX + 34,
        cy: y + 24,
        r: 17,
        photo: rv.winnerPhoto,
        name: rv.winnerName,
        clipId: `${idPrefix}_rvw_${idx}`,
        ringColor: "#C084FC"
      });
      const av2 = renderAvatarSvg({
        cx: leftX + 58,
        cy: y + 24,
        r: 17,
        photo: rv.loserPhoto,
        name: rv.loserName,
        clipId: `${idPrefix}_rvl_${idx}`,
        ringColor: "#FB7185"
      });
      defsList.push(av1.defs, av2.defs);
      parts.push(av1.body, av2.body);

      const fillW = Math.max(22, Math.round((rv.winRate / 100) * barWidthStd));
      const matchup = `${rv.winnerName} › ${rv.loserName}`;
      parts.push(`
        <text x="${leftX + 86}" y="${y + 18}" font-family="${FONT_SANS}" font-size="13" font-weight="800" fill="#C084FC">${rv.wins}V × ${rv.losses}D (${rv.games}J)</text>
        <text x="${leftX + 86}" y="${y + 40}" font-family="${FONT_SANS}" font-size="16.5" font-weight="800" fill="#F8FAFC">${esc(truncateText(matchup, 20))}</text>
        <rect x="${leftX + barXOffset}" y="${y + 12}" width="${barWidthStd}" height="24" rx="12" fill="rgba(15,23,42,0.85)" />
        <rect x="${leftX + barXOffset}" y="${y + 12}" width="${fillW}" height="24" rx="12" fill="url(#barViolet)" />
        <text x="${leftX + pctXOffset}" y="${y + 30}" font-family="${FONT_MONO}" font-size="18" font-weight="900" fill="#E9D5FF">${rv.winRate}%</text>
      `);
    });
  }

  // Box 4: Menor Taxa de Sucesso
  parts.push(glassPanel(rightX, row2Y, boxW, boxH, 22, "rgba(15, 25, 44, 0.78)", "rgba(244, 63, 94, 0.30)"));
  parts.push(`<text x="${rightX + 20}" y="${row2Y + 37}" font-family="${FONT_SANS}" font-size="17.5" font-weight="900" fill="#FB7185" letter-spacing="0.9">MENOR TAXA DE SUCESSO</text>`);

  if (modules.lowestSuccess.length === 0) {
    parts.push(`<text x="${rightX + 20}" y="${row2Y + 105}" font-family="${FONT_SANS}" font-size="16.5" fill="#94A3B8">Sem registros suficientes</text>`);
  } else {
    modules.lowestSuccess.slice(0, 2).forEach((item, idx) => {
      const y = row2Y + 58 + idx * 64;
      const av = renderAvatarSvg({
        cx: rightX + 38,
        cy: y + 24,
        r: 19,
        photo: item.photo,
        name: item.name,
        clipId: `${idPrefix}_low_${idx}`,
        ringColor: "#FB7185"
      });
      defsList.push(av.defs);
      parts.push(av.body);

      const fillW = Math.max(20, Math.round((Math.max(8, item.winRate) / 100) * lowBarWidth));
      parts.push(`
        <text x="${rightX + 70}" y="${y + 21}" font-family="${FONT_SANS}" font-size="18.5" font-weight="800" fill="#F8FAFC">${esc(truncateText(item.name, 14))}</text>
        <text x="${rightX + 70}" y="${y + 42}" font-family="${FONT_MONO}" font-size="14" font-weight="700" fill="#CBD5E1">${item.wins}V / ${item.losses}D (${item.games}J)</text>
        <rect x="${rightX + lowBarXOffset}" y="${y + 12}" width="${lowBarWidth}" height="24" rx="12" fill="rgba(15,23,42,0.85)" />
        <rect x="${rightX + lowBarXOffset}" y="${y + 12}" width="${fillW}" height="24" rx="12" fill="url(#barCoral)" />
        <text x="${rightX + pctXOffset}" y="${y + 30}" font-family="${FONT_MONO}" font-size="18" font-weight="900" fill="#FB7185">${item.winRate}%</text>
      `);
    });
  }

  return parts.join("\n");
}

export function renderDailyRankingCardSvg(data: DailyRankingCardData): string {
  const defsList: string[] = [];
  const bodyParts: string[] = [];

  // Mobile-First Portrait Layout: sempre 1080px em 1 coluna legível sem precisar dar zoom no celular
  const dayRowCount = data.topRows.length;
  const cardW = CARD_W;
  const marginX = 28;
  const contentW = cardW - marginX * 2; // 1024px

  // Header
  bodyParts.push(glassPanel(marginX, 28, contentW, 112, 26, "rgba(15, 27, 48, 0.80)", "rgba(56, 189, 248, 0.32)"));
  const badge2X = marginX + contentW - 160;
  const badge1X = badge2X - 152;
  bodyParts.push(`
    <text x="${marginX + 26}" y="68" font-family="${FONT_SANS}" font-size="16.5" font-weight="800" fill="#38BDF8" letter-spacing="1.8">GUERREIROS VOLLEYBALL CLUB • ${esc(data.dateLabel)}</text>
    <text x="${marginX + 26}" y="116" font-family="${FONT_SANS}" font-size="44" font-weight="900" fill="#F8FAFC">RANKING DO DIA</text>

    <rect x="${badge1X}" y="52" width="140" height="62" rx="18" fill="rgba(16, 185, 129, 0.16)" stroke="rgba(16, 185, 129, 0.42)" />
    <text x="${badge1X + 70}" y="82" text-anchor="middle" font-family="${FONT_MONO}" font-size="25" font-weight="900" fill="#34D399">${data.totalMatches}</text>
    <text x="${badge1X + 70}" y="103" text-anchor="middle" font-family="${FONT_SANS}" font-size="13" font-weight="800" fill="#A7F3D0">PARTIDAS</text>

    <rect x="${badge2X}" y="52" width="140" height="62" rx="18" fill="rgba(56, 189, 248, 0.16)" stroke="rgba(56, 189, 248, 0.42)" />
    <text x="${badge2X + 70}" y="82" text-anchor="middle" font-family="${FONT_MONO}" font-size="25" font-weight="900" fill="#38BDF8">${data.totalAthletes}</text>
    <text x="${badge2X + 70}" y="103" text-anchor="middle" font-family="${FONT_SANS}" font-size="13" font-weight="800" fill="#BAE6FD">ATLETAS</text>
  `);

  // 3 Spotlights (MVP + Melhor Levantador + Mais Eficiente)
  const spotlights = [data.mvp, data.bestSetter, data.mostEfficient];
  const spColors = {
    gold: { border: "rgba(251, 191, 36, 0.50)", text: "#FBBF24", bg: "rgba(245, 158, 11, 0.14)" },
    cyan: { border: "rgba(56, 189, 248, 0.50)", text: "#38BDF8", bg: "rgba(6, 182, 212, 0.14)" },
    emerald: { border: "rgba(52, 211, 153, 0.50)", text: "#34D399", bg: "rgba(16, 185, 129, 0.14)" }
  };

  const spGap = 16;
  const sw = Math.floor((contentW - spGap * 2) / 3); // 330px
  spotlights.forEach((sp, idx) => {
    const sx = marginX + idx * (sw + spGap);
    const sy = 158;
    const sh = 150;
    if (!sp) {
      bodyParts.push(glassPanel(sx, sy, sw, sh, 22));
      return;
    }
    const pal = spColors[sp.accent];
    bodyParts.push(glassPanel(sx, sy, sw, sh, 22, "rgba(15, 25, 44, 0.80)", pal.border));
    const av = renderAvatarSvg({
      cx: sx + 54,
      cy: sy + 88,
      r: 34,
      photo: sp.photo,
      name: sp.firstName,
      clipId: `day_sp_${idx}`,
      ringColor: pal.text
    });
    defsList.push(av.defs);
    bodyParts.push(`
      <rect x="${sx + 14}" y="${sy + 14}" width="${sw - 28}" height="28" rx="14" fill="${pal.bg}" />
      <text x="${sx + sw / 2}" y="${sy + 33}" text-anchor="middle" font-family="${FONT_SANS}" font-size="14" font-weight="900" fill="${pal.text}" letter-spacing="0.9">${esc(sp.title)}</text>
      ${av.body}
      <text x="${sx + 100}" y="${sy + 77}" font-family="${FONT_SANS}" font-size="23" font-weight="900" fill="#F8FAFC">${esc(truncateText(sp.firstName, 12))}</text>
      <text x="${sx + 100}" y="${sy + 105}" font-family="${FONT_MONO}" font-size="20" font-weight="900" fill="${pal.text}">${esc(sp.primaryStat)}</text>
      <text x="${sx + 100}" y="${sy + 129}" font-family="${FONT_SANS}" font-size="14.5" font-weight="700" fill="#CBD5E1">${esc(sp.secondaryStat)}</text>
    `);
  });

  // Classificação Completa da Noite em 1 coluna otimizada para leitura mobile
  const boardY = 326;
  const dayRowStep = dayRowCount > 18 ? 58 : 66;
  const dayRowH = dayRowCount > 18 ? 50 : 56;
  const dayAvatarR = dayRowCount > 18 ? 20 : 22;
  const boardH = Math.max(460, 74 + Math.max(1, dayRowCount) * dayRowStep + 16);

  bodyParts.push(glassPanel(marginX, boardY, contentW, boardH, 26, "rgba(13, 22, 40, 0.80)", "rgba(255,255,255,0.16)"));
  bodyParts.push(`
    <text x="${marginX + 26}" y="${boardY + 44}" font-family="${FONT_SANS}" font-size="20.5" font-weight="900" fill="#F8FAFC" letter-spacing="0.9">CLASSIFICAÇÃO DA NOITE (${dayRowCount} ATLETAS)</text>
    <text x="${marginX + contentW - 26}" y="${boardY + 44}" text-anchor="end" font-family="${FONT_SANS}" font-size="15" font-weight="800" fill="#94A3B8">% VITÓRIAS • ELO • SEQUÊNCIA</text>
  `);

  data.topRows.forEach((row, idx) => {
    const ry = boardY + 66 + idx * dayRowStep;
    const midY = ry + Math.round(dayRowH / 2) + 1;
    const tier = getRankTierVisual(idx);
    const av = renderAvatarSvg({
      cx: 122,
      cy: midY,
      r: dayAvatarR,
      photo: row.photo,
      name: row.firstName,
      clipId: `day_row_${idx}`,
      ringColor: tier.ringCol
    });
    defsList.push(av.defs);

    const trackX = 342;
    const trackW = 414;
    const fillW = Math.max(68, Math.round((Math.max(14, row.winRate) / 100) * trackW));
    const eloTxt = `${row.eloDelta >= 0 ? "+" : ""}${row.eloDelta}`;
    const diffTxt = `${row.pointsDiff >= 0 ? "+" : ""}${row.pointsDiff} pts`;

    const seqSlice = row.sequence.slice(-5);
    const dots = seqSlice
      .map((res, dIdx) => {
        const dx = 918 + dIdx * 18;
        return `<circle cx="${dx}" cy="${midY}" r="5.5" fill="${res === "W" ? "#34D399" : "#F43F5E"}" />`;
      })
      .join("");

    const barH = dayRowCount > 18 ? 30 : 34;
    const barY = midY - Math.round(barH / 2);

    bodyParts.push(`
      <g>
        <rect x="${marginX + 20}" y="${ry}" width="${contentW - 40}" height="${dayRowH}" rx="16" fill="rgba(15, 23, 42, 0.62)" stroke="rgba(255,255,255,0.09)" />
        <text x="76" y="${midY + 6}" text-anchor="middle" font-family="${FONT_MONO}" font-size="21" font-weight="900" fill="${tier.ringCol}">${String(row.rank).padStart(2, "0")}</text>
        ${av.body}
        <text x="156" y="${midY - 2}" font-family="${FONT_SANS}" font-size="20" font-weight="800" fill="#F8FAFC">${esc(truncateText(row.firstName, 14))}</text>
        <text x="156" y="${midY + 17}" font-family="${FONT_MONO}" font-size="14" font-weight="700" fill="#CBD5E1">${row.wins}V/${row.losses}D • ${esc(diffTxt)}</text>

        <rect x="${trackX}" y="${barY}" width="${trackW}" height="${barH}" rx="${Math.round(barH / 2)}" fill="rgba(15, 23, 42, 0.88)" />
        <rect x="${trackX}" y="${barY}" width="${fillW}" height="${barH}" rx="${Math.round(barH / 2)}" fill="${tier.barGrad}" />
        <line x1="${trackX + 14}" y1="${barY + 2}" x2="${trackX + fillW - 14}" y2="${barY + 2}" stroke="rgba(255,255,255,0.45)" stroke-width="1.3" stroke-linecap="round" />
        <text x="${trackX + fillW - 12}" y="${midY + 6}" text-anchor="end" font-family="${FONT_MONO}" font-size="16.5" font-weight="900" fill="#041016">${row.winRate}%</text>

        <text x="836" y="${midY + 6}" text-anchor="middle" font-family="${FONT_MONO}" font-size="19" font-weight="900" fill="${row.eloDelta >= 0 ? "#34D399" : "#FB7185"}">${esc(eloTxt)}</text>
        ${dots}
      </g>
    `);
  });

  // 4 Bottom Modules + Dynamic Card Height
  const dayModulesY = boardY + boardH + 20;
  const dayCardH = Math.max(CARD_H, dayModulesY + 412 + 88);
  bodyParts.push(renderBottomModulesGrid(dayModulesY, data, "day", defsList, cardW));
  bodyParts.push(footerSvg(`RANKING DA NOITE • ${data.dateLabel}`, dayCardH, cardW));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${cardW}" height="${dayCardH}" viewBox="0 0 ${cardW} ${dayCardH}">
    ${baseDefsAndCanvas(defsList.join("\n"), dayCardH, cardW)}
    ${bodyParts.join("\n")}
  </svg>`;
}

export function renderDailyRankingCardPng(data: DailyRankingCardData): Buffer {
  return renderSvgToPng(renderDailyRankingCardSvg(data));
}

// ============================================================================
// RENDER 3: CARD RANKING GERAL ACUMULADO (MOBILE-FIRST PORTRAIT • TODOS OS SÓCIOS)
// ============================================================================

export function renderAccumulatedRankingCardSvg(data: AccumulatedRankingCardData): string {
  const defsList: string[] = [];
  const bodyParts: string[] = [];

  const accRowCount = data.topRows.length;
  const cardW = CARD_W;
  const marginX = 28;
  const contentW = cardW - marginX * 2; // 1024px

  // Header
  bodyParts.push(glassPanel(marginX, 28, contentW, 112, 26, "rgba(15, 27, 48, 0.80)", "rgba(251, 191, 36, 0.34)"));
  const badge2X = marginX + contentW - 160;
  const badge1X = badge2X - 152;
  bodyParts.push(`
    <text x="${marginX + 26}" y="68" font-family="${FONT_SANS}" font-size="16.5" font-weight="800" fill="#FBBF24" letter-spacing="1.6">TEMPORADA GUERREIROS VC • ${esc(data.referenceDateLabel)}</text>
    <text x="${marginX + 26}" y="116" font-family="${FONT_SANS}" font-size="44" font-weight="900" fill="#F8FAFC">RANKING ACUMULADO</text>

    <rect x="${badge1X}" y="52" width="140" height="62" rx="18" fill="rgba(251, 191, 36, 0.16)" stroke="rgba(251, 191, 36, 0.42)" />
    <text x="${badge1X + 70}" y="82" text-anchor="middle" font-family="${FONT_MONO}" font-size="25" font-weight="900" fill="#FBBF24">${data.totalActivePlayers}</text>
    <text x="${badge1X + 70}" y="103" text-anchor="middle" font-family="${FONT_SANS}" font-size="13" font-weight="800" fill="#FDE68A">SÓCIOS</text>

    <rect x="${badge2X}" y="52" width="140" height="62" rx="18" fill="rgba(56, 189, 248, 0.16)" stroke="rgba(56, 189, 248, 0.42)" />
    <text x="${badge2X + 70}" y="82" text-anchor="middle" font-family="${FONT_MONO}" font-size="25" font-weight="900" fill="#38BDF8">${data.totalMatchesHistory}</text>
    <text x="${badge2X + 70}" y="103" text-anchor="middle" font-family="${FONT_SANS}" font-size="13" font-weight="800" fill="#BAE6FD">JOGOS</text>
  `);

  const maxElo = Math.max(1250, ...data.topRows.map((r) => r.elo));
  const minElo = Math.min(...data.topRows.map((r) => r.elo)) - 60;
  const eloSpan = Math.max(80, maxElo - minElo);

  const boardY = 158;
  const accRowStep = accRowCount > 20 ? 54 : 62;
  const accRowH = accRowCount > 20 ? 46 : 54;
  const accAvatarR = accRowCount > 20 ? 18 : 21;
  const boardH = Math.max(520, 74 + Math.max(1, accRowCount) * accRowStep + 16);

  bodyParts.push(glassPanel(marginX, boardY, contentW, boardH, 26, "rgba(13, 22, 40, 0.80)", "rgba(255,255,255,0.16)"));
  bodyParts.push(`
    <text x="${marginX + 26}" y="${boardY + 44}" font-family="${FONT_SANS}" font-size="20.5" font-weight="900" fill="#F8FAFC" letter-spacing="0.9">CLASSIFICAÇÃO GERAL (${accRowCount} SÓCIOS ATIVOS)</text>
    <text x="${marginX + contentW - 26}" y="${boardY + 44}" text-anchor="end" font-family="${FONT_SANS}" font-size="15" font-weight="800" fill="#94A3B8">VARIAÇÃO • ELO • % VITÓRIAS • FORMA</text>
  `);

  data.topRows.forEach((row, idx) => {
    const ry = boardY + 66 + idx * accRowStep;
    const midY = ry + Math.round(accRowH / 2) + 1;
    const tier = getRankTierVisual(idx);

    const isUp = row.rankDelta > 0;
    const isDown = row.rankDelta < 0;
    const deltaText = isUp ? `▲+${row.rankDelta}` : isDown ? `▼${row.rankDelta}` : "• 0";
    const deltaColor = isUp ? "#34D399" : isDown ? "#FB7185" : "#CBD5E1";
    const deltaBg = isUp
      ? "rgba(16, 185, 129, 0.18)"
      : isDown
      ? "rgba(244, 63, 94, 0.18)"
      : "rgba(148, 163, 184, 0.12)";

    const av = renderAvatarSvg({
      cx: 192,
      cy: midY,
      r: accAvatarR,
      photo: row.photo,
      name: row.firstName,
      clipId: `acc_row_${idx}`,
      ringColor: tier.ringCol
    });
    defsList.push(av.defs);

    const trackX = 398;
    const trackW = 374;
    const norm = Math.max(0.24, Math.min(1, (row.elo - minElo) / eloSpan));
    const fillW = Math.round(norm * trackW);

    const formSlice = row.recentForm.slice(-5);
    const dots = formSlice
      .map((res, dIdx) => {
        const dx = 920 + dIdx * 17;
        return `<circle cx="${dx}" cy="${midY}" r="5.2" fill="${res === "W" ? "#34D399" : "#F43F5E"}" />`;
      })
      .join("");

    const barH = accRowCount > 20 ? 28 : 32;
    const barY = midY - Math.round(barH / 2);

    bodyParts.push(`
      <g>
        <rect x="${marginX + 20}" y="${ry}" width="${contentW - 40}" height="${accRowH}" rx="15" fill="rgba(15, 23, 42, 0.62)" stroke="rgba(255,255,255,0.09)" />
        <text x="76" y="${midY + 6}" text-anchor="middle" font-family="${FONT_MONO}" font-size="20" font-weight="900" fill="${tier.ringCol}">${String(row.rank).padStart(2, "0")}</text>

        <rect x="102" y="${midY - 14}" width="60" height="28" rx="14" fill="${deltaBg}" />
        <text x="132" y="${midY + 5}" text-anchor="middle" font-family="${FONT_MONO}" font-size="14" font-weight="900" fill="${deltaColor}">${esc(deltaText)}</text>

        ${av.body}
        <text x="222" y="${midY - 2}" font-family="${FONT_SANS}" font-size="19.5" font-weight="800" fill="#F8FAFC">${esc(truncateText(row.firstName, 13))}</text>
        <text x="222" y="${midY + 16}" font-family="${FONT_MONO}" font-size="13.5" font-weight="700" fill="#CBD5E1">${row.wins}V/${row.losses}D • ${row.games}J</text>

        <rect x="${trackX}" y="${barY}" width="${trackW}" height="${barH}" rx="${Math.round(barH / 2)}" fill="rgba(15, 23, 42, 0.88)" />
        <rect x="${trackX}" y="${barY}" width="${fillW}" height="${barH}" rx="${Math.round(barH / 2)}" fill="${tier.barGrad}" />
        <line x1="${trackX + 14}" y1="${barY + 2}" x2="${trackX + fillW - 14}" y2="${barY + 2}" stroke="rgba(255,255,255,0.45)" stroke-width="1.3" stroke-linecap="round" />
        <text x="${trackX + fillW - 12}" y="${midY + 5.5}" text-anchor="end" font-family="${FONT_MONO}" font-size="16" font-weight="900" fill="#041016">${row.elo}</text>

        <text x="844" y="${midY + 6}" text-anchor="middle" font-family="${FONT_MONO}" font-size="18" font-weight="900" fill="#F1F5F9">${row.winRate}%</text>
        ${dots}
      </g>
    `);
  });

  // 4 Historical Bottom Modules + Dynamic Card Height
  const accModulesY = boardY + boardH + 20;
  const accCardH = Math.max(CARD_H, accModulesY + 412 + 88);
  bodyParts.push(renderBottomModulesGrid(accModulesY, data, "acc", defsList, cardW));
  bodyParts.push(footerSvg(`RANKING ACUMULADO • ${accRowCount} SÓCIOS • ${data.referenceDateLabel}`, accCardH, cardW));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${cardW}" height="${accCardH}" viewBox="0 0 ${cardW} ${accCardH}">
    ${baseDefsAndCanvas(defsList.join("\n"), accCardH, cardW)}
    ${bodyParts.join("\n")}
  </svg>`;
}

export function renderAccumulatedRankingCardPng(data: AccumulatedRankingCardData): Buffer {
  return renderSvgToPng(renderAccumulatedRankingCardSvg(data));
}
