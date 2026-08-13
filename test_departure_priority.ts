import { getPriorityQueue } from './utils/teamLogic';
import { Player, Gender } from './types';

const mockPlayer = (id: string, name: string, departureTime?: string): Player => ({
  id,
  name,
  gender: Gender.MALE,
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

const players: Player[] = [
  ...Array(16).fill(null).map((_, i) => mockPlayer(`p${i}`, `Player ${i}`, '22:00')),
  mockPlayer('early1', 'Early 1', '21:00'),
  mockPlayer('early2', 'Early 2', '21:00'),
];

console.log('--- Testing Departure Priority ---');
const { topPlayers, remainingPlayers } = getPriorityQueue(players, 12);

const hasEarly1 = topPlayers.some(p => p.id === 'early1');
const hasEarly2 = topPlayers.some(p => p.id === 'early2');

console.log(`topPlayers count: ${topPlayers.length}`);
console.log(`Has Early 1: ${hasEarly1}`);
console.log(`Has Early 2: ${hasEarly2}`);

if (hasEarly1 && hasEarly2) {
  console.log('PASS: Early players are in topPlayers.');
} else {
  console.log('FAIL: Early players not found in topPlayers.');
}
