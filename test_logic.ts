
import { Gender, Player } from './types';
import { calculateTeamPositions } from './utils/teamLogic';

const mockPlayer = (id: string, gender: Gender, name: string, skills: Player['skills'] = { setting: 2, attacking: 2, defense: 2, serving: 2 }): Player => ({
  id,
  name,
  gender,
  elo: 1200,
  skills,
  matchesPlayed: 10,
  wins: 5,
  losses: 5,
  dailyMatches: 0,
  dailyWins: 0,
  dailyLosses: 0,
  dailyEloGain: 0,
  dailyResults: [],
  playedLastMatch: false,
  consecutiveBenched: 0,
  isOfficialSetter: false
});

const runTest = (name: string, teamA: any, teamB: any) => {
  console.log(`--- Running Test: ${name} ---`);
  const posA = calculateTeamPositions(teamA, teamB);
  const posB = calculateTeamPositions(teamB, teamA);

  const valuesA = Object.values(posA);
  const uniqueA = new Set(valuesA);
  if (valuesA.length !== uniqueA.size) {
    console.error(`FAIL: Team A has duplicate positions! ${JSON.stringify(posA)}`);
  } else {
    console.log(`PASS: Team A unique positions: ${valuesA.join(', ')}`);
  }

  const valuesB = Object.values(posB);
  const uniqueB = new Set(valuesB);
  if (valuesB.length !== uniqueB.size) {
    console.error(`FAIL: Team B has duplicate positions! ${JSON.stringify(posB)}`);
  } else {
    console.log(`PASS: Team B unique positions: ${valuesB.join(', ')}`);
  }
};

// Case 1: Simple Mix
const team1 = {
  setter: mockPlayer('p1', Gender.MALE, 'M1'),
  players: [
    mockPlayer('p2', Gender.MALE, 'M2'),
    mockPlayer('p3', Gender.FEMALE, 'F1'),
    mockPlayer('p4', Gender.FEMALE, 'F2'),
    mockPlayer('p5', Gender.FEMALE, 'F3'),
    mockPlayer('p6', Gender.FEMALE, 'F4'),
  ]
};
const team2 = {
  setter: mockPlayer('p7', Gender.MALE, 'M3'),
  players: [
    mockPlayer('p8', Gender.MALE, 'M4'),
    mockPlayer('p9', Gender.FEMALE, 'F5'),
    mockPlayer('p10', Gender.FEMALE, 'F6'),
    mockPlayer('p11', Gender.FEMALE, 'F7'),
    mockPlayer('p12', Gender.FEMALE, 'F8'),
  ]
};

runTest('Basic Mix', team1, team2);

// Case 2: 2 Men in team
const team3 = {
  setter: mockPlayer('p1', Gender.MALE, 'S1'),
  players: [
    mockPlayer('p2', Gender.MALE, 'M1'),
    mockPlayer('p3', Gender.FEMALE, 'F1'),
    mockPlayer('p4', Gender.FEMALE, 'F2'),
    mockPlayer('p5', Gender.FEMALE, 'F3'),
    mockPlayer('p6', Gender.FEMALE, 'F4'),
  ]
};
runTest('2 Men', team3, team3);

// Case 3: Different skill levels to trigger sorting
const team4 = {
  setter: mockPlayer('s1', Gender.MALE, 'Setter', { setting: 3, attacking: 1, defense: 1, serving: 1 }),
  players: [
    mockPlayer('att', Gender.MALE, 'Attacker', { setting: 1, attacking: 3, defense: 1, serving: 1 }),
    mockPlayer('def', Gender.FEMALE, 'Defender', { setting: 1, attacking: 1, defense: 3, serving: 1 }),
    mockPlayer('f1', Gender.FEMALE, 'F1'),
    mockPlayer('f2', Gender.FEMALE, 'F2'),
    mockPlayer('f3', Gender.FEMALE, 'F3'),
  ]
};
runTest('High Skills', team4, team4);

// Case 4: 7 Players
const team5 = {
  setter: mockPlayer('s1', Gender.MALE, 'Setter'),
  players: [
    mockPlayer('p2', Gender.MALE, 'M1'),
    mockPlayer('p3', Gender.FEMALE, 'F1'),
    mockPlayer('p4', Gender.FEMALE, 'F2'),
    mockPlayer('p5', Gender.FEMALE, 'F3'),
    mockPlayer('p6', Gender.FEMALE, 'F4'),
    mockPlayer('p7', Gender.FEMALE, 'F5'),
  ]
};
runTest('7 Players', team5, team5);
