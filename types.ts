
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
  consecutiveBenched?: number; // Número de partidas consecutivas no banco
  birthDate?: string; // ISO date string
  uid?: string; // Firebase Auth UID
  dailyResults?: ('V' | 'D')[]; // Sequência de vitórias/derrotas no dia
  status?: string;
  createdAt?: number;
  reads?: number; // Total de leituras do sócio
  lastReadUpdate?: string; // Data da última atualização de leitura
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
  dailyNumber?: number;
}

export interface SystemMetadata {
  lastResetDate: string | null;
  lastResetTimestamp?: number;
  dailyMatchCount: number;
  matchStartTime: number | null;
  lastMatchTimestamp?: number;
  lastUpdate?: number;
  dailyReadQuota?: number;
  dailyAICallsQuota?: number; // Adicionado
  courtLocation?: { lat: number; lng: number };
  geofenceRadius?: number;
  monthlyFee?: number;
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
  paymentDate?: string; // ISO date string (quando foi pago)
  dueDate: string; // ISO date string
  status: PaymentStatus;
  method?: 'PIX' | 'CASH' | 'TRANSFER' | 'OTHER';
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  date: string; // ISO date string
  category: 'RENT' | 'EQUIPMENT' | 'TOURNAMENT' | 'OTHER';
  month: string; // e.g., "Março/2024"
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

export interface TournamentTeam {
  id: string;
  name: string;
  players: string[]; // IDs dos jogadores
  totalElo?: number;
  points: number;
  setsWon: number;
  setsLost: number;
  pointsFor: number;
  pointsAgainst: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
}

export interface SetScore {
  scoreA: number;
  scoreB: number;
}

export interface TournamentMatch {
  id: string;
  teamAId: string;
  teamBId: string;
  scoreA: number;
  scoreB: number;
  setsA: number;
  setsB: number;
  setScores?: SetScore[];
  winnerId?: string;
  status: 'pending' | 'completed';
  round: number;
}

export interface Tournament {
  id: string;
  name: string;
  date: string;
  status: 'active' | 'completed';
  teams: TournamentTeam[];
  matches: TournamentMatch[];
  reserves?: string[]; // IDs dos jogadores reservas
  config: {
    pointsPerSet: number;
    setsPerMatch: number;
    numTeams: number;
  };
}

export interface UsageStats {
  reads: number;
  writes: number;
  aiCalls?: number; // Adicionado
  lastUpdate: string;
}
