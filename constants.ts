
import { Gender, Player } from './types';

export const INITIAL_PLAYERS: Player[] = [
  { id: '1', name: 'Ricardo', gender: Gender.MALE, isOfficialSetter: true, matchesPlayed: 10, wins: 6, losses: 4, elo: 1500, dailyMatches: 0, dailyWins: 0, dailyLosses: 0, dailyEloGain: 0 },
  { id: '2', name: 'Ana', gender: Gender.FEMALE, isOfficialSetter: true, matchesPlayed: 12, wins: 7, losses: 5, elo: 1450, dailyMatches: 0, dailyWins: 0, dailyLosses: 0, dailyEloGain: 0 },
  { id: '3', name: 'Marcos', gender: Gender.MALE, isOfficialSetter: true, matchesPlayed: 8, wins: 4, losses: 4, elo: 1600, dailyMatches: 0, dailyWins: 0, dailyLosses: 0, dailyEloGain: 0 },
  { id: '4', name: 'Juliana', gender: Gender.FEMALE, isOfficialSetter: false, matchesPlayed: 20, wins: 10, losses: 10, elo: 1300, dailyMatches: 0, dailyWins: 0, dailyLosses: 0, dailyEloGain: 0 },
  { id: '5', name: 'Fabio', gender: Gender.MALE, isOfficialSetter: false, matchesPlayed: 15, wins: 8, losses: 7, elo: 1550, dailyMatches: 0, dailyWins: 0, dailyLosses: 0, dailyEloGain: 0 },
  { id: '6', name: 'Beatriz', gender: Gender.FEMALE, isOfficialSetter: false, matchesPlayed: 5, wins: 2, losses: 3, elo: 1200, dailyMatches: 0, dailyWins: 0, dailyLosses: 0, dailyEloGain: 0 },
  { id: '7', name: 'Gustavo', gender: Gender.MALE, isOfficialSetter: false, matchesPlayed: 18, wins: 9, losses: 9, elo: 1480, dailyMatches: 0, dailyWins: 0, dailyLosses: 0, dailyEloGain: 0 },
  { id: '8', name: 'Camila', gender: Gender.FEMALE, isOfficialSetter: false, matchesPlayed: 9, wins: 5, losses: 4, elo: 1350, dailyMatches: 0, dailyWins: 0, dailyLosses: 0, dailyEloGain: 0 },
  { id: '9', name: 'Diego', gender: Gender.MALE, isOfficialSetter: false, matchesPlayed: 11, wins: 5, losses: 6, elo: 1420, dailyMatches: 0, dailyWins: 0, dailyLosses: 0, dailyEloGain: 0 },
  { id: '10', name: 'Elena', gender: Gender.FEMALE, isOfficialSetter: false, matchesPlayed: 7, wins: 3, losses: 4, elo: 1280, dailyMatches: 0, dailyWins: 0, dailyLosses: 0, dailyEloGain: 0 },
  { id: '11', name: 'Felipe', gender: Gender.MALE, isOfficialSetter: false, matchesPlayed: 14, wins: 7, losses: 7, elo: 1390, dailyMatches: 0, dailyWins: 0, dailyLosses: 0, dailyEloGain: 0 },
  { id: '12', name: 'Gabriela', gender: Gender.FEMALE, isOfficialSetter: false, matchesPlayed: 22, wins: 11, losses: 11, elo: 1410, dailyMatches: 0, dailyWins: 0, dailyLosses: 0, dailyEloGain: 0 },
  { id: '13', name: 'Henrique', gender: Gender.MALE, isOfficialSetter: true, matchesPlayed: 5, wins: 3, losses: 2, elo: 1580, dailyMatches: 0, dailyWins: 0, dailyLosses: 0, dailyEloGain: 0 },
  { id: '14', name: 'Isabela', gender: Gender.FEMALE, isOfficialSetter: false, matchesPlayed: 13, wins: 6, losses: 7, elo: 1250, dailyMatches: 0, dailyWins: 0, dailyLosses: 0, dailyEloGain: 0 },
  { id: '15', name: 'Joao', gender: Gender.MALE, isOfficialSetter: false, matchesPlayed: 3, wins: 2, losses: 1, elo: 1470, dailyMatches: 0, dailyWins: 0, dailyLosses: 0, dailyEloGain: 0 },
  { id: '16', name: 'Karina', gender: Gender.FEMALE, isOfficialSetter: false, matchesPlayed: 16, wins: 8, losses: 8, elo: 1320, dailyMatches: 0, dailyWins: 0, dailyLosses: 0, dailyEloGain: 0 }
];

export const SKILL_WEIGHTS = {
  setting: 0.3,
  attacking: 0.3,
  defense: 0.2,
  serving: 0.2
};
