
export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE'
}

export interface AuditLog {
  field: string;
  oldValue: any;
  newValue: any;
  timestamp: number;
  changedBy: string;
}

export interface Player {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  gender: Gender;
  isOfficialSetter: boolean;
  matchesPlayed: number; // Total histórico
  dailyMatches: number; // Partidas no dia atual
  dailyWins: number; // Vitórias no dia atual
  dailyLosses: number; // Derrotas no dia atual
  dailyEloGain: number; // ELO ganho no dia atual
  pointsFor?: number; // Pontos marcados acumulados
  pointsAgainst?: number; // Pontos sofridos acumulados
  pointsBalance?: number; // Saldo de Pontos
  wins: number;
  losses: number;
  elo: number;
  eloHistory?: { 
    date: string; 
    elo: number; 
    matchId?: string; 
    change?: number; 
    timestamp?: number;
    result?: 'V' | 'D' | 'P';
    fidelityBonus?: boolean;
  }[];
  arrivalOrder?: number;
  isAdmin?: boolean;
  joinedAt?: string;
  playedLastMatch?: boolean;
  timestamp?: number; // Timestamp de chegada na presença
  leftAt?: number; // Timestamp de saída/remoção da presença
  consecutiveBenched?: number; // Número de partidas consecutivas no banco
  birthDate?: string; // ISO date string
  isDM?: boolean; // Novo campo
  deviceId?: string; // ID do dispositivo Bluetooth
  evasionLevel?: 'low' | 'medium' | 'high' | 'critical'; // Campo de risco de evasão
  uid?: string; // Firebase Auth UID
  dailyResults?: ('V' | 'D')[]; // Sequência de vitórias/derrotas no dia
  status?: string;
  createdAt?: number;
  reads?: number; // USO DIÁRIO: sessões de leitura
  writes?: number; // USO DIÁRIO: sessões de escrita
  totalReads?: number; // USO TOTAL/MENSAL
  totalWrites?: number; // USO TOTAL/MENSAL
  accesses?: number; // TOTAL de acessos/sessões do sócio
  dailyAccesses?: number; // ACESSOS DIÁRIOS do sócio
  lastReadUpdate?: string; // Data da última atualização de leitura
  fcmToken?: string; // Token para Push Notifications
  pushEnabled?: boolean; // Se o sócio deseja receber notificações push
  matchNotificationsEnabled?: boolean; // Se o sócio deseja receber notificações de resultados de partidas
  hasSeenWelcome?: boolean; // Se o sócio já viu a mensagem de boas-vindas
  impactLevel?: 1 | 2 | 3; // 1: Base, 2: Medium/Technique, 3: Elite/Power
  skills?: {
    setting: 1 | 2 | 3;
    attacking: 1 | 2 | 3; // Nível de habilidade de ataque
    defense: 1 | 2 | 3; // Nível de habilidade de defesa
    serving: 1 | 2 | 3; // Nível de habilidade de saque
  };
  isExempt?: boolean; // Novo campo para sócios isentos
  auditLog?: AuditLog[]; // Auditoria de dados
  trueSkill?: {
    mu: number;
    sigma: number;
  };
  fidelityPoints?: number;
  lastFidelityDate?: string;
}

export interface AppNotification {
  id: string;
  playerId: string;
  title: string;
  message: string;
  createdAt: number;
  read: boolean;
  type: 'match' | 'reminder' | 'system';
}

export type MatchMode = 'QUICK' | 'SCORE' | 'SEQUENTIAL';

export type IntentStatus = 'GOING' | 'NOT_GOING' | 'UNDECIDED';

export interface IntentionsData {
  targetDate: string; // YYYY-MM-DD
  automationEnabled: boolean;
  responses: Record<string, 'GOING' | 'NOT_GOING'>;
  confirmationTimestamps?: Record<string, number>;
  remindersSent: Record<string, boolean>;
}

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
  stats?: any[];
}

export interface SystemMetadata {
  bleBeaconUuids?: string[];
  bleProximityThreshold?: number;
  lastResetDate: string | null;
  lastResetTimestamp?: number;
  dailyMatchCount: number;
  matchStartTime: number | null;
  lastMatchTimestamp?: number;
  lastUpdate?: number;
  dailyReadQuota?: number;
  dailyAICallsQuota?: number; // Adicionado
  activeBirthdaysIndex?: string[]; // cache de datas de aniversário (MM-DD)
  showTeamCards?: boolean;
  showWaitlist?: boolean;
  showPerformance?: boolean;
  showTelemetry?: boolean;
  showCourtForecast?: boolean;
  enableAutoBirthdays?: boolean;
  useTrueSkill?: boolean;
  courtLocation?: { lat: number; lng: number };
  geofenceRadius?: number;
  monthlyFee?: number;
  isTournamentEnabled?: boolean;
  showEliteQueue?: boolean;
  matchNotificationsGlobalEnabled?: boolean;
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
  totalEfficiency?: number;
}

export interface GenerationResult {
  teamA: Team;
  teamB: Team;
  remainingPlayers: Player[];
  swaps?: { playerA: string; playerB: string }[];
  bottomTwoIds?: string[];
  topTwoIds?: string[];
  timestamp?: number;
  combinationsCount?: number;
  trueskill?: {
    teamA: Team;
    teamB: Team;
  };
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
  bracket?: string;
  nextMatchId?: string;
  nextMatchWinnerSlot?: 'A' | 'B';
  nextMatchLoserSlot?: 'A' | 'B';
}

export enum TournamentStrategy {
  ROUND_ROBIN = 'ROUND_ROBIN',
  GROUPS_AND_KNOCKOUT = 'GROUPS_AND_KNOCKOUT',
  DOUBLE_ELIMINATION = 'DOUBLE_ELIMINATION'
}

export interface Tournament {
  id: string;
  name: string;
  date: string;
  status: 'active' | 'completed';
  teams: TournamentTeam[];
  matches: TournamentMatch[];
  strategy: TournamentStrategy;
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
  aiCalls?: number;
  accesses?: number;
  officialValue?: number;
  lastGcpSync?: string;
  lastUpdate: string;
}
