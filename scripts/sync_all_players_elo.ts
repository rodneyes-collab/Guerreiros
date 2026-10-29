import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

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

interface TimelineEvent {
  type: 'MATCH' | 'FIDELITY';
  timestamp: number;
  date: string;
  match?: Match;
  playerId?: string;
}

async function run() {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  console.log("Fetching matches and players...");
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
  console.log(`Loaded and sorted ${matches.length} finished matches.`);

  const players: Record<string, Player> = {};
  playersSnap.forEach(d => {
    players[d.id] = {
      id: d.id,
      ...d.data()
    } as Player;
  });

  const dailyBonus = 10;
  const playerMatchesPerDate: Record<string, Record<string, number>> = {};
  const playerFidelityDates: Record<string, Set<string>> = {};
  const playerEvents: Record<string, TimelineEvent[]> = {};

  Object.keys(players).forEach(pid => {
    playerMatchesPerDate[pid] = {};
    playerFidelityDates[pid] = new Set();
    playerEvents[pid] = [];
  });

  matches.forEach(m => {
    const ts = m.timestamp;
    const date = m.date;
    const participants = [...m.teamA, ...m.teamB];

    participants.forEach(pid => {
      if (!playerMatchesPerDate[pid]) {
        playerMatchesPerDate[pid] = {};
        playerFidelityDates[pid] = new Set();
        playerEvents[pid] = [];
      }

      playerMatchesPerDate[pid][date] = (playerMatchesPerDate[pid][date] || 0) + 1;

      // Award fidelity bonus when player plays their 2nd match of the day
      if (playerMatchesPerDate[pid][date] === 2 && !playerFidelityDates[pid].has(date)) {
        playerFidelityDates[pid].add(date);
        playerEvents[pid].push({
          type: 'FIDELITY',
          timestamp: ts - 50,
          date: date,
          playerId: pid
        });
      }

      // Add match event
      playerEvents[pid].push({
        type: 'MATCH',
        timestamp: ts,
        date: date,
        match: m,
        playerId: pid
      });
    });
  });

  console.log("Rebuilding stats and histories for all players...");

  const playerUpdates: Record<string, any> = {};

  Object.entries(playerEvents).forEach(([pid, events]) => {
    const player = players[pid];
    if (!player) return;

    events.sort((a, b) => a.timestamp - b.timestamp);

    let currentElo = 1200;
    let wins = 0;
    let losses = 0;
    let matchesPlayed = 0;
    let pointsFor = 0;
    let pointsAgainst = 0;
    let fidelityPoints = 0;
    let lastFidelityDate: string | null = null;
    const eloHistory: any[] = [];

    events.forEach(ev => {
      if (ev.type === 'FIDELITY') {
        currentElo += dailyBonus;
        fidelityPoints += dailyBonus;
        lastFidelityDate = ev.date;
        eloHistory.push({
          date: ev.date,
          timestamp: ev.timestamp,
          elo: currentElo,
          change: dailyBonus,
          fidelityBonus: true,
          result: 'P',
          matchId: `fidelity-${ev.date}-${pid}`
        });
      } else if (ev.type === 'MATCH' && ev.match) {
        const m = ev.match;
        const isTeamA = m.teamA.includes(pid);
        const isWinner = (isTeamA && m.winner === 'A') || (!isTeamA && m.winner === 'B');
        const eloChange = isWinner ? 20 : -20;

        currentElo = Math.max(800, currentElo + eloChange);
        matchesPlayed++;
        if (isWinner) wins++;
        else losses++;

        const pFor = isTeamA ? m.scoreA : m.scoreB;
        const pAgainst = isTeamA ? m.scoreB : m.scoreA;
        pointsFor += pFor;
        pointsAgainst += pAgainst;

        eloHistory.push({
          date: m.date,
          timestamp: ev.timestamp,
          elo: currentElo,
          change: eloChange,
          result: isWinner ? 'V' : 'D',
          matchId: m.id
        });
      }
    });

    const pointsBalance = pointsFor - pointsAgainst;

    playerUpdates[pid] = {
      elo: currentElo,
      wins,
      losses,
      matchesPlayed,
      pointsFor,
      pointsAgainst,
      pointsBalance,
      fidelityPoints,
      lastFidelityDate,
      eloHistory: eloHistory.slice(-250) // keep last 250 entries
    };
  });

  // Also handle any player who hasn't played any matches yet
  Object.keys(players).forEach(pid => {
    if (!playerUpdates[pid]) {
      playerUpdates[pid] = {
        elo: 1200,
        wins: 0,
        losses: 0,
        matchesPlayed: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointsBalance: 0,
        fidelityPoints: 0,
        lastFidelityDate: null,
        eloHistory: []
      };
    }
  });

  console.log(`Writing updates to Firestore for ${Object.keys(playerUpdates).length} players...`);

  // Write in batches of 400
  const batchSize = 400;
  const pids = Object.keys(playerUpdates);
  for (let i = 0; i < pids.length; i += batchSize) {
    const chunk = pids.slice(i, i + batchSize);
    const batch = writeBatch(db);
    chunk.forEach(pid => {
      const pRef = doc(db, 'players', pid);
      batch.update(pRef, playerUpdates[pid]);
    });
    await batch.commit();
    console.log(`Committed chunk ${i + 1} to ${Math.min(i + batchSize, pids.length)}`);
  }

  console.log("Successfully updated all players in Firestore!");
}

run().then(() => process.exit(0)).catch(e => {
  console.error("Error during sync:", e);
  process.exit(1);
});
