import { collection, getDocs, doc, writeBatch, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface Match {
  id: string;
  date: string;
  timestamp: number;
  endTime?: string;
  teamA: string[];
  teamB: string[];
  scoreA: number;
  scoreB: number;
  winner?: 'A' | 'B';
}

interface Player {
  id: string;
  name: string;
  status?: string;
  elo?: number;
  wins?: number;
  losses?: number;
  matchesPlayed?: number;
  pointsFor?: number;
  pointsAgainst?: number;
  pointsBalance?: number;
  fidelityPoints?: number;
  eloHistory?: any[];
}

interface TimelineItem {
  type: 'MATCH' | 'FIDELITY';
  timestamp: number;
  date: string;
  match?: Match;
}

async function run() {
  console.log("1. Carregando partidas e jogadores para simulação/atualização com Bônus = 20...");
  const matchesSnap = await getDocs(collection(db, 'matches'));
  const playersSnap = await getDocs(collection(db, 'players'));

  const matches: Match[] = [];
  matchesSnap.forEach(d => {
    const data = d.data() as any;
    if (data.winner === 'A' || data.winner === 'B') {
      matches.push({
        id: d.id,
        date: data.date,
        timestamp: data.timestamp || (data.endTime ? new Date(data.endTime).getTime() : 0),
        endTime: data.endTime,
        teamA: data.teamA || [],
        teamB: data.teamB || [],
        scoreA: Number(data.scoreA) || 0,
        scoreB: Number(data.scoreB) || 0,
        winner: data.winner
      });
    }
  });

  matches.sort((a, b) => a.timestamp - b.timestamp);

  const players: Record<string, Player> = {};
  playersSnap.forEach(d => {
    players[d.id] = {
      id: d.id,
      ...d.data()
    } as Player;
  });

  const DAILY_BONUS = 20;

  const playerMatchesByDate: Record<string, Record<string, number>> = {};
  const playerTimeline: Record<string, TimelineItem[]> = {};
  const playerFidelityDatesAwarded: Record<string, Set<string>> = {};

  Object.keys(players).forEach(pid => {
    playerMatchesByDate[pid] = {};
    playerTimeline[pid] = [];
    playerFidelityDatesAwarded[pid] = new Set();
  });

  matches.forEach(m => {
    const date = m.date;
    const ts = m.timestamp;
    const participants = [...m.teamA, ...m.teamB];

    participants.forEach(pid => {
      if (!playerMatchesByDate[pid]) {
        playerMatchesByDate[pid] = {};
        playerTimeline[pid] = [];
        playerFidelityDatesAwarded[pid] = new Set();
      }

      playerMatchesByDate[pid][date] = (playerMatchesByDate[pid][date] || 0) + 1;
      const count = playerMatchesByDate[pid][date];

      if (count === 2 && !playerFidelityDatesAwarded[pid].has(date)) {
        playerFidelityDatesAwarded[pid].add(date);
        playerTimeline[pid].push({
          type: 'FIDELITY',
          timestamp: ts - 50,
          date: date
        });
      }

      playerTimeline[pid].push({
        type: 'MATCH',
        timestamp: ts,
        date: date,
        match: m
      });
    });
  });

  const updates: Record<string, any> = {};

  Object.keys(players).forEach(pid => {
    const timeline = playerTimeline[pid] || [];
    timeline.sort((a, b) => a.timestamp - b.timestamp);

    let currentElo = 1200;
    let wins = 0;
    let losses = 0;
    let matchesPlayed = 0;
    let pointsFor = 0;
    let pointsAgainst = 0;
    let fidelityPoints = 0;
    let lastFidelityDate: string | null = null;
    const eloHistory: any[] = [];

    timeline.forEach(item => {
      if (item.type === 'FIDELITY') {
        currentElo += DAILY_BONUS;
        fidelityPoints += DAILY_BONUS;
        lastFidelityDate = item.date;
        eloHistory.push({
          date: item.date,
          timestamp: item.timestamp,
          elo: currentElo,
          change: DAILY_BONUS,
          fidelityBonus: true,
          result: 'P',
          matchId: `fidelity-bonus-${item.date}-${pid}`
        });
      } else if (item.type === 'MATCH' && item.match) {
        const m = item.match;
        const isTeamA = m.teamA.includes(pid);
        const won = (isTeamA && m.winner === 'A') || (!isTeamA && m.winner === 'B');
        const change = won ? 20 : -20;
        currentElo += change;
        matchesPlayed++;
        if (won) wins++;
        else losses++;

        const pFor = isTeamA ? m.scoreA : m.scoreB;
        const pAgainst = isTeamA ? m.scoreB : m.scoreA;
        pointsFor += pFor;
        pointsAgainst += pAgainst;

        eloHistory.push({
          date: m.date,
          timestamp: item.timestamp,
          elo: currentElo,
          change: change,
          result: won ? 'V' : 'D',
          matchId: m.id
        });
      }
    });

    updates[pid] = {
      elo: currentElo,
      wins,
      losses,
      matchesPlayed,
      pointsFor,
      pointsAgainst,
      pointsBalance: pointsFor - pointsAgainst,
      fidelityPoints,
      lastFidelityDate,
      eloHistory: eloHistory.slice(-250)
    };
  });

  console.log("\n2. Gravando atualizações com Bônus = 20 no Firestore...");
  const pids = Object.keys(updates);
  const BATCH_SIZE = 400;

  for (let i = 0; i < pids.length; i += BATCH_SIZE) {
    const chunk = pids.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    chunk.forEach(pid => {
      const pRef = doc(db, 'players', pid);
      batch.update(pRef, updates[pid]);
    });

    await batch.commit();
  }

  const sysRef = doc(db, 'metadata', 'system');
  await setDoc(sysRef, { dailyAttendanceBonus: 20 }, { merge: true });

  console.log("Recálculo com Bônus = 20 concluído com sucesso!");
}

run().then(() => process.exit(0)).catch(err => {
  console.error("Erro:", err);
  process.exit(1);
});
