import { getPriorityQueue } from './utils/teamLogic';
import { Player, Gender } from './types';

// Mocking Player object based on the app's structure
const mockPlayer = (id: string, name: string, departureTime?: string): Player => ({
  id,
  name,
  gender: Gender.MALE, // Simplified
  isOfficialSetter: false,
  matchesPlayed: 0,
  dailyMatches: 0,
  dailyWins: 0,
  dailyLosses: 0,
  dailyEloGain: 0,
  wins: 0,
  losses: 0,
  elo: 1200,
  playedLastMatch: false,
  consecutiveBenched: 0,
  departureTime,
  skills: { setting: 2, attacking: 2, defense: 2, serving: 2 },
} as any);

// Scenario: 28 players
// 2 leave at 09:00
// 1 leaves at 09:30
// 25 stay long
const players: Player[] = [
  ...Array(25).fill(null).map((_, i) => mockPlayer(`std${i}`, `Std ${i}`, '23:00')),
  mockPlayer('early1', 'Early 1', '09:00'),
  mockPlayer('early2', 'Early 2', '09:00'),
  mockPlayer('mid1', 'Mid 1', '09:30'),
];

let currentTimeMinutes = 8 * 60; // Start at 08:00
const matchDuration = 12;

console.log('--- Simulation Starting: 28 Players, 12min matches ---');

// Simulate until 10:00
while (currentTimeMinutes < 10 * 60) {
  // 1. Filter out players who have left
  const currentPlayers = players.filter(p => {
    if (!p.departureTime) return true;
    const [h, m] = p.departureTime.split(':').map(Number);
    const depTime = h * 60 + m;
    return currentTimeMinutes < depTime;
  });

  if (currentPlayers.length < 12) break;

  // 2. Run logic to pick 12
  const { topPlayers } = getPriorityQueue(currentPlayers, 12);

  // 3. Update stats
  topPlayers.forEach(tp => {
    const p = players.find(x => x.id === tp.id);
    if (p) {
        p.dailyMatches! += 1;
        p.playedLastMatch = true;
    }
  });

  // Reset playedLastMatch for others
  players.forEach(p => {
      if (!topPlayers.find(tp => tp.id === p.id)) {
          p.playedLastMatch = false;
      }
  });

  // 4. Advance time
  currentTimeMinutes += matchDuration;
}

console.log('--- Results after simulation ---');
players.forEach(p => {
  console.log(`${p.name} (Dep: ${p.departureTime || 'Late'}): ${p.dailyMatches} matches`);
});
