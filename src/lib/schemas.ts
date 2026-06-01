import { z } from 'zod';
import { Gender } from '../../types';

export const playerSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(50, "Nome muito longo"),
  elo: z.number().int().min(800).max(3000).default(1200),
  gender: z.nativeEnum(Gender),
  matchesPlayed: z.number().int().min(0).default(0),
  wins: z.number().int().min(0).default(0),
  losses: z.number().int().min(0).default(0),
  dailyMatches: z.number().int().min(0).default(0),
  dailyWins: z.number().int().min(0).default(0),
  dailyLosses: z.number().int().min(0).default(0),
  dailyEloGain: z.number().int().default(0),
  dailyResults: z.array(z.enum(['V', 'D'])).default([]),
  playedLastMatch: z.boolean().default(false),
  isAdmin: z.boolean().default(false),
  isOfficialSetter: z.boolean().default(false),
  joinedAt: z.string().optional(),
  birthDate: z.string().optional(),
  status: z.string().optional(),
  createdAt: z.number().optional(),
  consecutiveBenched: z.number().int().min(0).default(0),
  email: z.string().email("Email inválido").or(z.literal('')).optional(),
  eloHistory: z.array(z.object({
    date: z.string(),
    elo: z.number()
  })).optional(),
  impactLevel: z.number().int().min(1).max(3).optional().default(1),
  skills: z.object({
    setting: z.number().int().min(1).max(3),
    attacking: z.number().int().min(1).max(3),
    defense: z.number().int().min(1).max(3),
    serving: z.number().int().min(1).max(3)
  }).optional(),
  isExempt: z.boolean().optional(),
  isDM: z.boolean().optional(),
  phone: z.string().regex(/^\d{10,14}$/, "Telefone deve conter apenas números (DDD + Número, 10 a 14 dígitos)").optional().or(z.literal(''))
    .transform(val => val === '' || val === null || val === undefined ? undefined : val),
  uid: z.string().optional(),
  fcmToken: z.string().optional(),
  hasSeenWelcome: z.boolean().optional(),
  reads: z.number().optional(),
  writes: z.number().optional(),
  totalReads: z.number().optional(),
  totalWrites: z.number().optional(),
  accesses: z.number().optional(),
  dailyAccesses: z.number().optional(),
  lastReadUpdate: z.string().optional()
});

export const matchSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  date: z.string(),
  teamA: z.array(z.string()),
  teamB: z.array(z.string()),
  winner: z.enum(['A', 'B']),
  scoreA: z.number().int().min(0),
  scoreB: z.number().int().min(0),
  duration: z.number().int().min(0),
  startTime: z.number(),
  endTime: z.number(),
  mode: z.string()
});
