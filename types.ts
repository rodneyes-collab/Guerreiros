
export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE'
}

export interface Player {
  id: string;
  name: string;
  email?: string;
  gender: Gender;
  isOfficialSetter: boolean;
  matchesPlayed: number; // Total histórico
  dailyMatches: number; // Partidas no dia atual
  dailyWins: number; // Vitórias no dia atual
  dailyLosses: number; // Derrotas no dia atual
  dailyEloGain: number; // ELO ganho no dia atual
  wins: number;
  losses: number;
  elo: number;
  eloHistory?: { date: string; elo: number }[];
  arrivalOrder?: number;
  isAdmin?: boolean;
  joinedAt?: string;
  playedLastMatch?: boolean;
  birthDate?: string; // ISO date string
  uid?: string; // Firebase Auth UID
  dailyResults?: ('V' | 'D')[]; // Sequência de vitórias/derrotas no dia
  status?: string;
  createdAt?: number;
}

export type MatchMode = 'QUICK' | 'SCORE' | 'SEQUENTIAL';

export interface Match {
  id: string;
  timestamp: number;
  date: string; // ISO date string
  teamA: string[]; // IDs dos jogadores do Time A
  teamB: string[]; // IDs dos jogadores do Time B
  scoreA: number;
  scoreB: number;
  winner: 'A' | 'B';
  duration: number;
  startTime?: number; // Timestamp
  endTime?: number; // Timestamp
  mode: MatchMode;
}

export interface SystemMetadata {
  lastResetDate: string | null;
  dailyMatchCount: number;
  matchStartTime: number | null;
}

export enum PaymentStatus {
  PAID = 'PAID',
  PENDING = 'PENDING',
  OVERDUE = 'OVERDUE'
}

export interface Payment {
  id: string;
  playerId: string;
  playerName: string;
  amount: number;
  month: string; // e.g., "2024-03"
  paymentDate: string; // ISO date string
  dueDate: string; // ISO date string
  status: PaymentStatus;
}

export interface Team {
  setter: Player | null;
  players: Player[];
  totalElo: number;
}

export interface GenerationResult {
  teamA: Team;
  teamB: Team;
  remainingPlayers: Player[];
  swaps?: { playerA: string; playerB: string }[];
}

export interface UsageStats {
  reads: number;
  writes: number;
  lastUpdate: string;
}
