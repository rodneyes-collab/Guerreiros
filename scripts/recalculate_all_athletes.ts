import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc, writeBatch } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

interface Match {
  id: string;
  date: string;
  timestamp?: number;
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
    matches.push({
      id: d.id,
      date: data.date,
      timestamp: data.timestamp || (data.endTime ? new Date(data.endTime).getTime() : 0),
      endTime: data.endTime,
      teamA: data.teamA || [],
      teamB: data.teamB || [],
      scoreA: data.scoreA || 0,
      scoreB: data.scoreB || 0,
      winner: data.winner
    });
  });

  // Sort matches chronologically
  matches.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  console.log(`Loaded ${matches.length} matches.`);

  const players: Record<string, Player> = {};
  playersSnap.forEach(d => {
    players[d.id] = {
      id: d.id,
      ...d.data()
    } as Player;
  });
  console.log(`Loaded ${Object.keys(players).length} players.`);

  // Calculate per player stats strictly from matches
  interface PlayerStats {
    wins: number;
    losses: number;
    matchesPlayed: number;
    pointsFor: number;
    pointsAgainst: number;
    datesPlayed: Record<string, number>; // date -> count of matches
    dailyEligibleDates: string[]; // dates where matchesPlayed >= 2
    matchBalance: number;
    matchPoints: number;
    eloQuadra: number;
    fidelityBonus: number;
    eloGlobal: number;
  }

  const statsMap: Record<string, PlayerStats> = {};
  Object.keys(players).forEach(pid => {
    statsMap[pid] = {
      wins: 0,
      losses: 0,
      matchesPlayed: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      datesPlayed: {},
      dailyEligibleDates: [],
      matchBalance: 0,
      matchPoints: 0,
      eloQuadra: 1200,
      fidelityBonus: 0,
      eloGlobal: 1200,
    };
  });

  matches.forEach(m => {
    if (!m.winner || (m.winner !== 'A' && m.winner !== 'B')) return;
    const date = m.date;

    m.teamA.forEach(pid => {
      if (!statsMap[pid]) {
        statsMap[pid] = {
          wins: 0, losses: 0, matchesPlayed: 0, pointsFor: 0, pointsAgainst: 0,
          datesPlayed: {}, dailyEligibleDates: [], matchBalance: 0, matchPoints: 0,
          eloQuadra: 1200, fidelityBonus: 0, eloGlobal: 1200
        };
      }
      const s = statsMap[pid];
      s.matchesPlayed++;
      s.pointsFor += m.scoreA;
      s.pointsAgainst += m.scoreB;
      if (m.winner === 'A') s.wins++;
      else s.losses++;
      s.datesPlayed[date] = (s.datesPlayed[date] || 0) + 1;
    });

    m.teamB.forEach(pid => {
      if (!statsMap[pid]) {
        statsMap[pid] = {
          wins: 0, losses: 0, matchesPlayed: 0, pointsFor: 0, pointsAgainst: 0,
          datesPlayed: {}, dailyEligibleDates: [], matchBalance: 0, matchPoints: 0,
          eloQuadra: 1200, fidelityBonus: 0, eloGlobal: 1200
        };
      }
      const s = statsMap[pid];
      s.matchesPlayed++;
      s.pointsFor += m.scoreB;
      s.pointsAgainst += m.scoreA;
      if (m.winner === 'B') s.wins++;
      else s.losses++;
      s.datesPlayed[date] = (s.datesPlayed[date] || 0) + 1;
    });
  });

  // Calculate finals
  Object.entries(statsMap).forEach(([pid, s]) => {
    s.dailyEligibleDates = Object.entries(s.datesPlayed)
      .filter(([_, count]) => count >= 2)
      .map(([d]) => d);
    s.matchBalance = s.wins - s.losses;
    s.matchPoints = s.matchBalance * 20;
    s.eloQuadra = 1200 + s.matchPoints;
    s.fidelityBonus = s.dailyEligibleDates.length * 10;
    s.eloGlobal = s.eloQuadra + s.fidelityBonus;
  });

  // Print results for active players
  console.log("\n==================== ACTIVE ATHLETES ELO AUDIT ====================");
  console.log(
    "Nome".padEnd(25) +
    "Jogos".padEnd(8) +
    "V".padEnd(5) +
    "D".padEnd(5) +
    "Saldo".padEnd(8) +
    "Pts Quadra".padEnd(12) +
    "ELO Quadra".padEnd(12) +
    "Dias >=2".padEnd(10) +
    "Bonus".padEnd(8) +
    "ELO Global"
  );
  console.log("-".repeat(105));

  const activePlayers = Object.values(players)
    .filter(p => p.status === 'active')
    .sort((a, b) => (statsMap[b.id]?.eloGlobal || 0) - (statsMap[a.id]?.eloGlobal || 0));

  activePlayers.forEach(p => {
    const s = statsMap[p.id];
    console.log(
      p.name.slice(0, 24).padEnd(25) +
      String(s.matchesPlayed).padEnd(8) +
      String(s.wins).padEnd(5) +
      String(s.losses).padEnd(5) +
      (s.matchBalance > 0 ? `+${s.matchBalance}` : String(s.matchBalance)).padEnd(8) +
      (s.matchPoints > 0 ? `+${s.matchPoints}` : String(s.matchPoints)).padEnd(12) +
      String(s.eloQuadra).padEnd(12) +
      String(s.dailyEligibleDates.length).padEnd(10) +
      `+${s.fidelityBonus}`.padEnd(8) +
      String(s.eloGlobal)
    );
  });

  console.log("\nTotal Active Players:", activePlayers.length);
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
