import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Download,
  Send,
  RefreshCw,
  Sparkles,
  User,
  Calendar,
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
  Layers,
  CheckCircle2,
  Loader2,
  Award,
  Zap,
  Shield
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';
import { Player } from '../../types';

interface TimelineMatchItem {
  index: number;
  label: string;
  status: 'WIN' | 'LOSS' | 'OUT';
  scoreText: string;
  myScore: number;
  oppScore: number;
  diff: number;
  durationLabel: string;
  durationSeconds: number;
  teammates: string[];
}

interface IndividualData {
  playerId: string;
  firstName: string;
  fullName: string;
  photo: string | null;
  dateKey: string;
  dateLabel: string;
  gamesPlayed: number;
  totalMatchesNight: number;
  wins: number;
  losses: number;
  winRate: number;
  pointsDiff: number;
  eloDelta: number;
  currentElo: number;
  nightRank: number;
  nightTotalPlayers: number;
  courtTimeLabel: string;
  timeline: TimelineMatchItem[];
}

interface SpotlightAthlete {
  id: string;
  title: string;
  firstName: string;
  photo: string | null;
  primaryStat: string;
  secondaryStat: string;
  accent: 'gold' | 'cyan' | 'emerald';
}

interface DailyData {
  dateKey: string;
  dateLabel: string;
  totalMatches: number;
  totalAthletes: number;
  mvp: SpotlightAthlete | null;
  bestSetter: SpotlightAthlete | null;
  mostEfficient: SpotlightAthlete | null;
  lowestSuccess: Array<{
    id: string;
    name: string;
    wins: number;
    losses: number;
    games: number;
    winRate: number;
  }>;
}

interface AccumulatedData {
  referenceDateLabel: string;
  totalActivePlayers: number;
  totalMatchesHistory: number;
  topRows: Array<{
    id: string;
    rank: number;
    prevRank: number;
    rankDelta: number;
    firstName: string;
    elo: number;
    wins: number;
    losses: number;
    games: number;
    winRate: number;
  }>;
}

interface EloCurvePoint {
  dateKey: string;
  dateLabel: string;
  elo: number;
  delta: number;
  wins: number;
  losses: number;
}

interface AnalyticsResponse {
  success: boolean;
  individual: IndividualData | null;
  daily: DailyData | null;
  accumulated: AccumulatedData | null;
  eloCurve: EloCurvePoint[];
}

interface LiquidGlassCardsStudioProps {
  players: Player[];
  availableDates: string[];
  initialDate: string;
  initialPlayerId?: string | null;
  userRole: 'ADMIN' | 'MEMBER';
  showNotification: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

type CardTab = 'individual' | 'daily' | 'accumulated';

const formatBrDate = (dateKey: string) => {
  const parts = String(dateKey || '').split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateKey;
};

export const LiquidGlassCardsStudio: React.FC<LiquidGlassCardsStudioProps> = ({
  players,
  availableDates,
  initialDate,
  initialPlayerId,
  userRole,
  showNotification
}) => {
  const sortedPlayers = useMemo(() => {
    return [...players]
      .filter((p) => (p.status === 'active' || p.status === 'guest' || !p.status) && !p.isDM)
      .sort((a, b) => (b.elo || 1200) - (a.elo || 1200));
  }, [players]);

  const [cardTab, setCardTab] = useState<CardTab>('individual');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(
    initialPlayerId || sortedPlayers[0]?.id || ''
  );
  const [selectedDate, setSelectedDate] = useState<string>(
    availableDates[0] || initialDate || ''
  );
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState<boolean>(false);
  const [imageLoading, setImageLoading] = useState<boolean>(true);
  const [imageNonce, setImageNonce] = useState<number>(Date.now());
  const [sendingTarget, setSendingTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedPlayerId && sortedPlayers[0]?.id) {
      setSelectedPlayerId(sortedPlayers[0].id);
    }
  }, [selectedPlayerId, sortedPlayers]);

  useEffect(() => {
    if (!selectedDate && availableDates[0]) {
      setSelectedDate(availableDates[0]);
    }
  }, [selectedDate, availableDates]);

  const fetchAnalytics = useCallback(async () => {
    if (!selectedPlayerId) return;
    setLoadingAnalytics(true);
    try {
      const params = new URLSearchParams();
      if (selectedPlayerId) params.set('playerId', selectedPlayerId);
      if (selectedDate) params.set('date', selectedDate);
      const resp = await fetch(`/api/cards/analytics-data?${params.toString()}`);
      if (resp.ok) {
        const json = (await resp.json()) as AnalyticsResponse;
        if (json.success) {
          setAnalytics(json);
        }
      }
    } catch {
      // mantém último estado válido
    } finally {
      setLoadingAnalytics(false);
    }
  }, [selectedPlayerId, selectedDate]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const cardImageUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set('t', String(imageNonce));
    if (cardTab === 'individual') {
      if (selectedPlayerId) params.set('playerId', selectedPlayerId);
      if (selectedDate) params.set('date', selectedDate);
      return `/api/cards/individual.png?${params.toString()}`;
    }
    if (cardTab === 'daily') {
      if (selectedDate) params.set('date', selectedDate);
      return `/api/cards/daily-ranking.png?${params.toString()}`;
    }
    return `/api/cards/accumulated-ranking.png?${params.toString()}`;
  }, [cardTab, selectedPlayerId, selectedDate, imageNonce]);

  useEffect(() => {
    setImageLoading(true);
  }, [cardImageUrl]);

  const handleDownloadPng = async () => {
    try {
      const resp = await fetch(cardImageUrl);
      if (!resp.ok) throw new Error('Falha ao gerar PNG');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const suffix =
        cardTab === 'individual'
          ? `individual_${analytics?.individual?.firstName?.toLowerCase() || 'atleta'}_${selectedDate}`
          : cardTab === 'daily'
          ? `ranking_dia_${selectedDate}`
          : 'ranking_acumulado';
      a.download = `guerreiros_${suffix}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showNotification('Card PNG Liquid Glass baixado com sucesso!', 'success');
    } catch {
      showNotification('Não foi possível baixar o card PNG agora.', 'error');
    }
  };

  const handleSendWhatsApp = async (target: 'group' | 'private') => {
    const key = `${cardTab}_${target}`;
    setSendingTarget(key);
    try {
      const resp = await fetch('/api/whatsapp/send-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardType: cardTab,
          playerId: selectedPlayerId,
          date: selectedDate,
          target
        })
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        showNotification(data.error || 'Erro ao disparar o card no WhatsApp.', 'error');
        return;
      }
      if (data.deliveredDirectly) {
        showNotification(`Card PNG enviado no WhatsApp para ${data.recipientLabel}!`, 'success');
      } else {
        showNotification(
          `Card PNG enfileirado para entrega automática para ${data.recipientLabel}.`,
          'info'
        );
      }
    } catch {
      showNotification('Falha de rede ao enviar o card no WhatsApp.', 'error');
    } finally {
      setSendingTarget(null);
    }
  };

  // Dados para Gráfico 1 (Anel Liquid Glass)
  const ind = analytics?.individual;
  const ringPercent = ind ? Math.max(0, Math.min(100, ind.winRate)) : 0;
  const ringRadius = 56;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDash = (ringPercent / 100) * ringCircumference;

  // Dados para Gráfico 2 (Curva de Área Liquid Glass)
  const eloCurve = analytics?.eloCurve || [];
  const eloMin = useMemo(() => {
    if (eloCurve.length === 0) return 1100;
    return Math.floor((Math.min(...eloCurve.map((p) => p.elo)) - 30) / 10) * 10;
  }, [eloCurve]);
  const eloMax = useMemo(() => {
    if (eloCurve.length === 0) return 1350;
    return Math.ceil((Math.max(...eloCurve.map((p) => p.elo)) + 30) / 10) * 10;
  }, [eloCurve]);

  return (
    <div className="relative overflow-hidden rounded-3xl bg-[#060A12] border border-white/10 p-4 sm:p-6 text-slate-100 shadow-2xl">
      {/* Orbs luminosos sutis ao fundo (Assinatura Versão 3 Liquid Glass) */}
      <div className="pointer-events-none absolute -top-24 -left-20 h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -right-24 h-80 w-80 rounded-full bg-emerald-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl" />

      {/* Header + Filtros */}
      <div className="relative z-10 flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-cyan-300">
            <Sparkles className="h-3.5 w-3.5" />
            Liquid Glass V3 • WhatsApp Studio
          </div>
          <h2 className="mt-2 text-xl sm:text-2xl font-black tracking-tight text-white">
            Cards Oficiais &amp; Gráficos da Temporada
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Visual oficial enviado pelo Guerreirinho no WhatsApp — linha do tempo horizontal, fotos e barras Estilo 3.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Seletor de Atleta */}
          <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-slate-900/75 px-3 py-2 backdrop-blur-md">
            <User className="h-4 w-4 text-cyan-400 shrink-0" />
            <select
              value={selectedPlayerId}
              onChange={(e) => setSelectedPlayerId(e.target.value)}
              className="bg-transparent text-xs sm:text-sm font-bold text-white focus:outline-none cursor-pointer max-w-[160px]"
            >
              {sortedPlayers.map((p) => (
                <option key={p.id} value={p.id} className="bg-slate-900 text-white">
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Seletor de Sessão/Data */}
          {availableDates.length > 0 && (
            <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-slate-900/75 px-3 py-2 backdrop-blur-md">
              <Calendar className="h-4 w-4 text-emerald-400 shrink-0" />
              <select
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-xs sm:text-sm font-bold text-white focus:outline-none cursor-pointer"
              >
                {availableDates.map((d) => (
                  <option key={d} value={d} className="bg-slate-900 text-white">
                    {formatBrDate(d)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setImageNonce(Date.now());
              fetchAnalytics();
            }}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/10 transition"
            title="Atualizar dados e preview"
          >
            <RefreshCw className={`h-4 w-4 ${loadingAnalytics ? 'animate-spin text-cyan-400' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* GRÁFICOS APROVADOS (SOMENTE OPÇÃO 1: ANEL LIQUID GLASS + OPÇÃO 2: CURVA DE ÁREA ELO) */}
      <div className="relative z-10 mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* GRÁFICO 1 — ANEL LIQUID GLASS (APROVEITAMENTO & ELO) */}
        <div className="lg:col-span-5 relative overflow-hidden rounded-3xl border border-white/15 bg-slate-900/60 p-5 backdrop-blur-xl shadow-lg">
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] font-black uppercase tracking-widest text-cyan-300">
                Anel Liquid Glass
              </span>
              <h3 className="text-base font-black text-white">
                {ind ? `${ind.firstName} • ${ind.dateLabel}` : 'Aproveitamento & ELO'}
              </h3>
            </div>
            {ind && (
              <span
                className={`rounded-full px-3 py-1 text-xs font-black font-mono border ${
                  ind.eloDelta >= 0
                    ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
                    : 'border-rose-400/40 bg-rose-500/15 text-rose-300'
                }`}
              >
                {ind.eloDelta >= 0 ? '+' : ''}
                {ind.eloDelta} ELO
              </span>
            )}
          </div>

          <div className="mt-4 flex flex-col sm:flex-row items-center gap-5">
            <div className="relative flex items-center justify-center shrink-0">
              <svg width="148" height="148" viewBox="0 0 148 148" className="drop-shadow-[0_0_24px_rgba(34,211,238,0.28)]">
                <defs>
                  <linearGradient id="lgRingV3" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#10B981" />
                    <stop offset="55%" stopColor="#22D3EE" />
                    <stop offset="100%" stopColor="#FBBF24" />
                  </linearGradient>
                </defs>
                <circle
                  cx="74"
                  cy="74"
                  r={ringRadius + 10}
                  fill="rgba(6, 182, 212, 0.06)"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="1"
                />
                <circle
                  cx="74"
                  cy="74"
                  r={ringRadius}
                  fill="none"
                  stroke="rgba(148,163,184,0.16)"
                  strokeWidth="12"
                />
                <circle
                  cx="74"
                  cy="74"
                  r={ringRadius}
                  fill="none"
                  stroke="url(#lgRingV3)"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={`${ringDash.toFixed(1)} ${ringCircumference.toFixed(1)}`}
                  transform="rotate(-90 74 74)"
                  className="transition-all duration-700 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono text-3xl font-black text-white">{ringPercent}%</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Aproveit.
                </span>
              </div>
            </div>

            <div className="grid w-full grid-cols-2 gap-2.5">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Vitórias / Derrotas
                </div>
                <div className="mt-1 font-mono text-lg font-black text-emerald-300">
                  {ind ? `${ind.wins}V / ${ind.losses}D` : '--'}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Saldo Pontos
                </div>
                <div
                  className={`mt-1 font-mono text-lg font-black ${
                    (ind?.pointsDiff ?? 0) >= 0 ? 'text-amber-300' : 'text-rose-300'
                  }`}
                >
                  {ind ? `${ind.pointsDiff >= 0 ? '+' : ''}${ind.pointsDiff}` : '--'}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Posição Noite
                </div>
                <div className="mt-1 font-mono text-lg font-black text-cyan-300">
                  {ind ? `#${ind.nightRank}/${ind.nightTotalPlayers}` : '--'}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Em Quadra
                </div>
                <div className="mt-1 font-mono text-lg font-black text-violet-300">
                  {ind ? ind.courtTimeLabel : '--'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* GRÁFICO 2 — CURVA DE ÁREA LIQUID GLASS (EVOLUÇÃO ELO) */}
        <div className="lg:col-span-7 relative overflow-hidden rounded-3xl border border-white/15 bg-slate-900/60 p-5 backdrop-blur-xl shadow-lg">
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/60 to-transparent" />
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-[11px] font-black uppercase tracking-widest text-emerald-300">
                Curva de Área Liquid Glass
              </span>
              <h3 className="text-base font-black text-white">
                Evolução ELO nas Últimas Quintas
              </h3>
            </div>
            {ind && (
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs font-black text-amber-300">
                ELO ATUAL: {ind.currentElo}
              </div>
            )}
          </div>

          <div className="h-44 w-full">
            {eloCurve.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={eloCurve} margin={{ top: 10, right: 16, left: -14, bottom: 0 }}>
                  <defs>
                    <linearGradient id="eloAreaFillV3" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22D3EE" stopOpacity={0.42} />
                      <stop offset="55%" stopColor="#10B981" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#060A12" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="eloLineStrokeV3" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#38BDF8" />
                      <stop offset="55%" stopColor="#34D399" />
                      <stop offset="100%" stopColor="#FBBF24" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" vertical={false} />
                  <XAxis
                    dataKey="dateLabel"
                    stroke="#64748B"
                    tick={{ fill: '#94A3B8', fontSize: 11, fontWeight: 700 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[eloMin, eloMax]}
                    stroke="#64748B"
                    tick={{ fill: '#94A3B8', fontSize: 11, fontWeight: 700 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(10, 18, 34, 0.92)',
                      border: '1px solid rgba(56, 189, 248, 0.35)',
                      borderRadius: '14px',
                      backdropFilter: 'blur(12px)',
                      color: '#F8FAFC',
                      fontSize: '12px'
                    }}
                    formatter={(val: any, _name: any, item: any) => {
                      const pt = item?.payload as EloCurvePoint | undefined;
                      const deltaStr = pt ? ` (${pt.delta >= 0 ? '+' : ''}${pt.delta} • ${pt.wins}V/${pt.losses}D)` : '';
                      return [`${val} ELO${deltaStr}`, 'Pontuação'];
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="elo"
                    stroke="url(#eloLineStrokeV3)"
                    strokeWidth={3.5}
                    fill="url(#eloAreaFillV3)"
                    activeDot={{ r: 6, fill: '#FBBF24', stroke: '#060A12', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-400">
                Selecione um sócio com partidas registradas para ver a curva de ELO.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* STUDIO DE CARDS WHATSAPP (3 CARDS V3 LIQUID GLASS + ESTILO 3) */}
      <div className="relative z-10 mt-6 rounded-3xl border border-white/15 bg-slate-900/55 p-4 sm:p-5 backdrop-blur-xl">
        {/* Seletor de Card */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: 'individual', label: 'Individual • Linha Horizontal', icon: Layers },
                { id: 'daily', label: 'Ranking do Dia', icon: Zap },
                { id: 'accumulated', label: 'Ranking Acumulado', icon: Trophy }
              ] as const
            ).map(({ id, label, icon: Icon }) => {
              const active = cardTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCardTab(id)}
                  className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs sm:text-sm font-black transition ${
                    active
                      ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 shadow-[0_0_24px_rgba(34,211,238,0.35)]'
                      : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPng}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white hover:bg-white/15 transition"
            >
              <Download className="h-4 w-4 text-cyan-300" />
              Baixar PNG
            </button>

            {cardTab === 'individual' && (
              <button
                type="button"
                disabled={sendingTarget !== null}
                onClick={() => handleSendWhatsApp('private')}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2 text-xs font-black text-slate-950 hover:brightness-110 disabled:opacity-50 transition"
              >
                {sendingTarget === 'individual_private' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Enviar no Privado
              </button>
            )}

            {userRole === 'ADMIN' && (
              <button
                type="button"
                disabled={sendingTarget !== null}
                onClick={() => handleSendWhatsApp('group')}
                className="inline-flex items-center gap-2 rounded-2xl border border-amber-400/40 bg-amber-500/15 px-4 py-2 text-xs font-black text-amber-200 hover:bg-amber-500/25 disabled:opacity-50 transition"
              >
                {sendingTarget === `${cardTab}_group` ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Enviar no Grupo
              </button>
            )}
          </div>
        </div>

        {/* Grade: Preview PNG Real à esquerda + Painel Contextual Interativo à direita */}
        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          {/* Preview PNG oficial 1080x1440 */}
          <div className="lg:col-span-6 flex flex-col items-center">
            <div className="relative w-full max-w-[440px] aspect-[3/4] overflow-hidden rounded-3xl border border-white/15 bg-[#050912] shadow-[0_20px_60px_rgba(0,0,0,0.65)]">
              {imageLoading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#060A12]/80 backdrop-blur-sm">
                  <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
                  <span className="text-xs font-bold text-slate-300">
                    Renderizando card Liquid Glass PNG...
                  </span>
                </div>
              )}
              <img
                src={cardImageUrl}
                alt={`Card Liquid Glass ${cardTab}`}
                onLoad={() => setImageLoading(false)}
                onError={() => setImageLoading(false)}
                className="h-full w-full object-contain"
              />
            </div>
            <div className="mt-2.5 flex items-center gap-2 text-[11px] font-semibold text-slate-400">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              Imagem PNG idêntica à enviada pelo Guerreirinho no WhatsApp (1080×1440px)
            </div>
          </div>

          {/* Painel Interativo ao lado do Preview */}
          <div className="lg:col-span-6 space-y-4">
            {cardTab === 'individual' && ind && (
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-black uppercase tracking-wider text-cyan-300">
                    Linha do Tempo Horizontal • {ind.firstName}
                  </h4>
                  <span className="text-xs font-mono font-bold text-slate-400">
                    {ind.gamesPlayed}/{ind.totalMatchesNight} jogos
                  </span>
                </div>
                <div className="space-y-2.5">
                  {ind.timeline.map((m) => {
                    const isWin = m.status === 'WIN';
                    const isLoss = m.status === 'LOSS';
                    const pctWidth = isWin ? 92 : isLoss ? 72 : 42;
                    return (
                      <div
                        key={m.index}
                        className="rounded-2xl border border-white/10 bg-slate-950/60 p-2.5"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-9 font-mono text-xs font-black text-slate-300">
                            {m.label}
                          </span>
                          <div className="relative h-7 flex-1 overflow-hidden rounded-full bg-slate-900/90 border border-white/5">
                            <div
                              style={{ width: `${pctWidth}%` }}
                              className={`flex h-full items-center justify-between rounded-full px-3 text-[11px] font-black ${
                                isWin
                                  ? 'bg-gradient-to-r from-emerald-600 via-emerald-400 to-cyan-300 text-slate-950'
                                  : isLoss
                                  ? 'bg-gradient-to-r from-rose-600 via-rose-500 to-pink-400 text-slate-950'
                                  : 'bg-slate-700/70 text-slate-200'
                              }`}
                            >
                              <span>{isWin ? 'VITÓRIA' : isLoss ? 'DERROTA' : 'RODÍZIO'}</span>
                              <span className="font-mono">{m.scoreText}</span>
                            </div>
                          </div>
                          <span className="w-16 text-right font-mono text-[11px] font-bold text-sky-300">
                            {m.durationLabel}
                          </span>
                        </div>
                        {m.teammates.length > 0 && (
                          <p className="mt-1.5 pl-12 text-[11px] text-slate-400">
                            <span className="font-bold text-slate-300">Time:</span>{' '}
                            {m.teammates.join(', ')}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {cardTab === 'daily' && analytics?.daily && (
              <div className="space-y-3">
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <h4 className="text-sm font-black uppercase tracking-wider text-amber-300 mb-3">
                    Destaques da Noite ({analytics.daily.dateLabel})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {[
                      { item: analytics.daily.mvp, icon: Trophy, border: 'border-amber-400/35 text-amber-300' },
                      { item: analytics.daily.bestSetter, icon: Shield, border: 'border-cyan-400/35 text-cyan-300' },
                      { item: analytics.daily.mostEfficient, icon: Award, border: 'border-emerald-400/35 text-emerald-300' }
                    ].map(({ item, icon: Icon, border }, i) =>
                      item ? (
                        <div key={i} className={`rounded-2xl border ${border} bg-slate-950/60 p-3`}>
                          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider">
                            <Icon className="h-3.5 w-3.5" />
                            {item.title}
                          </div>
                          <div className="mt-1.5 text-base font-black text-white">{item.firstName}</div>
                          <div className="font-mono text-xs font-black">{item.primaryStat}</div>
                          <div className="text-[11px] text-slate-400">{item.secondaryStat}</div>
                        </div>
                      ) : null
                    )}
                  </div>
                </div>

                {analytics.daily.lowestSuccess.length > 0 && (
                  <div className="rounded-3xl border border-rose-500/20 bg-rose-500/[0.05] p-4">
                    <h4 className="text-xs font-black uppercase tracking-wider text-rose-300 mb-2">
                      Menor Taxa de Sucesso (Mín. 2 Jogos)
                    </h4>
                    <div className="space-y-2">
                      {analytics.daily.lowestSuccess.map((low) => (
                        <div key={low.id} className="flex items-center justify-between text-xs">
                          <span className="font-bold text-white">{low.name}</span>
                          <span className="font-mono text-rose-300 font-black">
                            {low.winRate}% ({low.wins}V/{low.losses}D)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {cardTab === 'accumulated' && analytics?.accumulated && (
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-black uppercase tracking-wider text-amber-300">
                    Movimentação no Ranking Acumulado
                  </h4>
                  <span className="text-[11px] text-slate-400 font-semibold">
                    vs última quinta ({analytics.accumulated.referenceDateLabel})
                  </span>
                </div>
                <div className="space-y-2">
                  {analytics.accumulated.topRows.map((row) => {
                    const isUp = row.rankDelta > 0;
                    const isDown = row.rankDelta < 0;
                    return (
                      <div
                        key={row.id}
                        className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="w-6 font-mono text-xs font-black text-slate-400">
                            {String(row.rank).padStart(2, '0')}
                          </span>
                          <span
                            className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-mono text-[11px] font-black ${
                              isUp
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : isDown
                                ? 'bg-rose-500/15 text-rose-300'
                                : 'bg-slate-700/40 text-slate-400'
                            }`}
                          >
                            {isUp ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : isDown ? (
                              <TrendingDown className="h-3 w-3" />
                            ) : (
                              <Minus className="h-3 w-3" />
                            )}
                            {isUp ? `+${row.rankDelta}` : row.rankDelta}
                          </span>
                          <span className="text-sm font-black text-white">{row.firstName}</span>
                        </div>
                        <div className="flex items-center gap-3 font-mono text-xs">
                          <span className="font-black text-amber-300">{row.elo} ELO</span>
                          <span className="text-cyan-300 font-bold">{row.winRate}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="rounded-3xl border border-cyan-400/20 bg-cyan-500/[0.06] p-4 text-xs text-slate-300 space-y-1.5">
              <div className="font-black uppercase tracking-wider text-cyan-300">
                Disparo Automático via Guerreirinho
              </div>
              <p>
                • <strong>Quinta às 22:10 (Privado):</strong> cada sócio que jogou recebe automaticamente o seu Card Individual Liquid Glass com a linha do tempo horizontal.
              </p>
              <p>
                • <strong>Pós-jogo no Grupo &amp; Comandos:</strong> <code className="text-cyan-200">gv dia</code>, <code className="text-cyan-200">gv resumo</code> e <code className="text-cyan-200">gv ranking</code> já enviam o card PNG oficial com legenda.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
