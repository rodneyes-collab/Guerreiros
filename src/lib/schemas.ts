import { z } from 'zod';
import { Gender } from '../../types';

const nullableDefault = <T extends z.ZodTypeAny>(schema: T, defaultValue: z.infer<T>) =>
  z.preprocess(val => (val === null || val === undefined || (typeof val === 'number' && Number.isNaN(val)) ? defaultValue : val), schema);

export const playerSchema = z.object({
  id: z.string().nullish(),
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(50, "Nome muito longo"),
  elo: nullableDefault(z.number().int().min(800).max(3000), 1200),
  gender: z.nativeEnum(Gender),
  matchesPlayed: nullableDefault(z.number().int().min(0), 0),
  wins: nullableDefault(z.number().int().min(0), 0),
  losses: nullableDefault(z.number().int().min(0), 0),
  dailyMatches: nullableDefault(z.number().int().min(0), 0),
  dailyWins: nullableDefault(z.number().int().min(0), 0),
  dailyLosses: nullableDefault(z.number().int().min(0), 0),
  dailyEloGain: nullableDefault(z.number().int(), 0),
  dailyResults: nullableDefault(z.array(z.enum(['V', 'D'])), []),
  playedLastMatch: nullableDefault(z.boolean(), false),
  isAdmin: nullableDefault(z.boolean(), false),
  isOfficialSetter: nullableDefault(z.boolean(), false),
  joinedAt: z.string().nullish(),
  birthDate: z.string().nullish(),
  status: z.string().nullish(),
  createdAt: z.number().nullish(),
  consecutiveBenched: nullableDefault(z.number().int().min(0), 0),
  email: z.string().email("Email inválido").or(z.literal('')).nullish(),
  eloHistory: z.array(z.object({
    date: z.string(),
    elo: z.number()
  }).passthrough()).nullish(),
  impactLevel: nullableDefault(z.number().int().min(1).max(3), 1),
  skills: z.object({
    setting: z.number().int().min(1).max(3),
    attacking: z.number().int().min(1).max(3),
    defense: z.number().int().min(1).max(3),
    serving: z.number().int().min(1).max(3)
  }).nullish(),
  isExempt: z.boolean().nullish(),
  isDM: z.boolean().nullish(),
  phone: z.string().regex(/^\d{10,14}$/, "Telefone deve conter apenas números (DDD + Número, 10 a 14 dígitos)").nullish().or(z.literal(''))
    .transform(val => val === '' || val === null || val === undefined ? undefined : val),
  uid: z.string().nullish(),
  fcmToken: z.string().nullish(),
  hasSeenWelcome: z.boolean().nullish(),
  reads: z.number().nullish(),
  writes: z.number().nullish(),
  totalReads: z.number().nullish(),
  totalWrites: z.number().nullish(),
  accesses: z.number().nullish(),
  dailyAccesses: z.number().nullish(),
  lastReadUpdate: z.string().nullish(),
  deviceId: z.string().nullish(),
  pushEnabled: z.boolean().nullish(),
  matchNotificationsEnabled: z.boolean().nullish(),
  arrivalOrder: z.number().nullish(),
  isPresent: z.boolean().nullish(),
  timestamp: z.number().nullish(),
  leftAt: z.number().nullish(),
  fidelityPoints: z.number().nullish(),
  lastFidelityDate: z.string().nullish(),
  pointsFor: z.number().nullish(),
  pointsAgainst: z.number().nullish(),
  pointsBalance: z.number().nullish(),
  trueSkill: z.object({
    mu: z.number(),
    sigma: z.number()
  }).nullish(),
  evasionLevel: z.enum(['low', 'medium', 'high', 'critical']).nullish(),
  auditLog: z.array(z.any()).nullish()
}).passthrough();

export const matchSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  date: z.string(),
  teamA: z.array(z.string()),
  teamB: z.array(z.string()),
  winner: z.enum(['A', 'B']),
  scoreA: nullableDefault(z.number().int().min(0), 0),
  scoreB: nullableDefault(z.number().int().min(0), 0),
  duration: nullableDefault(z.number().int().min(0), 0),
  startTime: z.number(),
  endTime: z.number(),
  mode: z.string(),
  dailyNumber: z.number().int().nullish(),
  stats: z.array(z.any()).nullish()
}).passthrough();
