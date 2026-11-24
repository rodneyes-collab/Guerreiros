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
  Shield,
  Image as ImageIcon,
  FileText,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Maximize2,
  X,
  Search
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  ComposedChart,
  Bar,
  Line,
  Cell,
  ReferenceLine,
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

interface DailyPointsPoint {
  index: number;
  label: string;
  status: 'WIN' | 'LOSS';
  scoreText: string;
  matchDiff: number;
  cumDiff: number;
  groupAvgCumDiff: number;
  groupMatchMargin: number;
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
  pointsSeries?: DailyPointsPoint[];
  groupAvgPointsDiff?: number;
  groupAvgMatchMargin?: number;
  distinctTeammatesCount?: number;
  mostFrequentTeammate?: { name: string; games: number } | null;
  aiHumorComment?: string;
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

  // Admin: Configuração do Card HD no Bot WhatsApp (VM Google nativa — sem links e sem Evolution API)
  const [cardDeliveryMode, setCardDeliveryMode] = useState<'disabled' | 'vm_image_only'>('vm_image_only');
  const [savingDeliveryConfig, setSavingDeliveryConfig] = useState<boolean>(false);
  const [showBridgeSnippet, setShowBridgeSnippet] = useState<boolean>(false);
  const [copiedBridgeSnippet, setCopiedBridgeSnippet] = useState<boolean>(false);
  const [zoomModalOpen, setZoomModalOpen] = useState<boolean>(false);
  const [accSearch, setAccSearch] = useState<string>('');

  const vmBridgeSnippet = `// =========================================================================
// HELPER UNIVERSAL PARA VM GOOGLE (Baileys ou whatsapp-web.js — SEM LINKS)
// Suporta tanto /api/whatsapp/webhook quanto /api/whatsapp/cron-tasks!
// =========================================================================
async function resolvePngBuffer(item) {
  if (item.mediaBase64) return Buffer.from(item.mediaBase64, 'base64');
  if (item.mediaFetchUrl) {
    const r = await fetch(item.mediaFetchUrl);
    if (r.ok) return Buffer.from(await r.arrayBuffer());
  }
  return null;
}

// 1) Função única para enviar resposta (PNG nativo OU texto limpo)
async function deliverItem(targetJid, item) {
  const pngBuffer = item.mediaType === 'image' ? await resolvePngBuffer(item) : null;
  if (pngBuffer) {
    // --- SE SUA VM USA BAILEYS: ---
    await sock.sendMessage(targetJid, {
      image: pngBuffer,
      mimetype: 'image/png',
      caption: item.caption || ''
    });
    // --- SE SUA VM USA WHATSAPP-WEB.JS (troque o bloco acima por este): ---
    // const media = new MessageMedia('image/png', pngBuffer.toString('base64'), item.fileName || 'guerreiros.png');
    // await client.sendMessage(targetJid, media, { caption: item.caption || '' });
    return;
  }
  if (item.text) {
    await sock.sendMessage(targetJid, { text: item.text }); // ou client.sendMessage(targetJid, item.text)
  }
}

// 2) No WEBHOOK (comandos gv ranking / gv dia / gv resumo):
// Adicione supportsMedia: true no JSON enviado ao /api/whatsapp/webhook
const whRes = await fetch(WEBHOOK_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...payload, supportsMedia: true })
}).then(r => r.json());
if (whRes.success && whRes.chatId) await deliverItem(whRes.chatId, whRes);

// 3) No CRON (quinta 22:00 grupo + 22:10 privado):
// Adicione supportsMedia: true no JSON enviado ao /api/whatsapp/cron-tasks
const cronRes = await fetch(CRON_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ groupJid: GROUP_JID, supportsMedia: true })
}).then(r => r.json());
for (const msg of (cronRes.messages || [])) {
  if (msg.delayMs > 0) await new Promise(r => setTimeout(r, msg.delayMs));
  await deliverItem(msg.to, msg);
}`;

  const loadDeliveryConfig = useCallback(async () => {
    try {
      const resp = await fetch('/api/whatsapp/card-delivery-config');
      if (resp.ok) {
        const data = await resp.json();
        if (data.mode === 'disabled' || data.mode === 'vm_image_only') {
          setCardDeliveryMode(data.mode);
        }
      }
    } catch {
      // mantém estado local
    }
  }, []);

  useEffect(() => {
    loadDeliveryConfig();
  }, [loadDeliveryConfig]);

  const handleSaveDeliveryMode = async (nextMode: 'disabled' | 'vm_image_only') => {
    setSavingDeliveryConfig(true);
    try {
      const resp = await fetch('/api/whatsapp/card-delivery-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: nextMode })
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        showNotification(data.error || 'Erro ao salvar configuração do bot.', 'error');
        return;
      }
      setCardDeliveryMode(data.mode);
      showNotification(
        data.mode === 'vm_image_only'
          ? 'Envio nativo de imagem PNG pela VM Google ativado (sem links).'
          : 'Card HD desabilitado no WhatsApp — o bot enviará somente texto completo, sem links.',
        'success'
      );
    } catch {
      showNotification('Falha de rede ao salvar configuração do bot.', 'error');
    } finally {
      setSavingDeliveryConfig(false);
    }
  };

  const handleCopyBridgeSnippet = async () => {
    try {
      await navigator.clipboard.writeText(vmBridgeSnippet);
      setCopiedBridgeSnippet(true);
      showNotification('Trecho da VM Google copiado para a área de transferência!', 'success');
      setTimeout(() => setCopiedBridgeSnippet(false), 2500);
    } catch {
      showNotification('Não foi possível copiar automaticamente. Selecione e copie o código.', 'warning');
    }
  };

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
        showNotification(data.error || 'Envio de card pelo WhatsApp está desabilitado.', 'warning');
        return;
      }
      showNotification(
        `Imagem PNG enfileirada para a VM Google enviar para ${data.recipientLabel} (sem links).`,
        'success'
      );
    } catch {
      showNotification('Falha de rede ao enviar o card.', 'error');
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

            {cardDeliveryMode === 'vm_image_only' && cardTab === 'individual' && (
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
                Enviar PNG via VM
              </button>
            )}

            {cardDeliveryMode === 'vm_image_only' && userRole === 'ADMIN' && (
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
                Enviar PNG no Grupo
              </button>
            )}
          </div>
        </div>

        {/* Grade: Preview PNG Real à esquerda + Painel Contextual Interativo à direita */}
        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          {/* Preview PNG oficial responsivo (adapta-se automaticamente a todos os 28 sócios) */}
          <div className="lg:col-span-6 flex flex-col items-center">
            <div className="group relative w-full max-w-[540px] min-h-[360px] overflow-hidden rounded-3xl border border-white/15 bg-[#050912] shadow-[0_20px_60px_rgba(0,0,0,0.65)]">
              {imageLoading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#060A12]/80 backdrop-blur-sm">
                  <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
                  <span className="text-xs font-bold text-slate-300">
                    Renderizando card Liquid Glass HD...
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => setZoomModalOpen(true)}
                className="block w-full cursor-zoom-in focus:outline-none"
                title="Clique para ampliar o Card Visual HD em tela cheia"
              >
                <img
                  src={cardImageUrl}
                  alt={`Card Liquid Glass ${cardTab}`}
                  onLoad={() => setImageLoading(false)}
                  onError={() => setImageLoading(false)}
                  className="block w-full h-auto"
                />
              </button>
              <button
                type="button"
                onClick={() => setZoomModalOpen(true)}
                className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-slate-950/80 px-2.5 py-1.5 text-[11px] font-black text-white backdrop-blur-md opacity-90 hover:opacity-100 hover:bg-slate-900 transition"
              >
                <Maximize2 className="h-3.5 w-3.5 text-cyan-300" />
                Ampliar HD
              </button>
            </div>
            <div className="mt-2.5 flex items-center gap-2 text-[11px] font-semibold text-slate-400 text-center">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span>
                {cardTab === 'accumulated'
                  ? `Card HD completo com todos os ${analytics?.accumulated?.totalActivePlayers || 28} sócios ativos (grade responsiva em 2 colunas)`
                  : cardTab === 'daily'
                  ? `Card HD completo da noite (${analytics?.daily?.totalAthletes || 0} atletas participantes)`
                  : 'Card Individual HD com linha do tempo horizontal (disponível para visualizar e baixar em PNG)'}
              </span>
            </div>
          </div>

          {/* Painel Interativo ao lado do Preview */}
          <div className="lg:col-span-6 space-y-4">
            {cardTab === 'individual' && ind && (
              <div className="space-y-4">
                {/* 1) LINHA DO TEMPO HORIZONTAL (SEPARADA — APENAS RESULTADO, PLACAR, SALDO E DURAÇÃO) */}
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-black uppercase tracking-wider text-cyan-300">
                      Linha do Tempo Horizontal • {ind.firstName}
                    </h4>
                    <span className="text-xs font-mono font-bold text-slate-400">
                      {ind.gamesPlayed}/{ind.totalMatchesNight} jogos
                    </span>
                  </div>
                  <div className="space-y-2">
                    {ind.timeline.map((m) => {
                      const isWin = m.status === 'WIN';
                      const isLoss = m.status === 'LOSS';
                      const pctWidth = isWin ? 92 : isLoss ? 72 : 42;
                      return (
                        <div
                          key={m.index}
                          className="rounded-2xl border border-white/10 bg-slate-950/60 px-2.5 py-2"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="w-8 font-mono text-xs font-black text-slate-300">
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
                            <span
                              className={`w-10 text-right font-mono text-[11px] font-black ${
                                isWin ? 'text-emerald-300' : isLoss ? 'text-rose-300' : 'text-slate-500'
                              }`}
                            >
                              {isWin ? `+${m.diff}` : isLoss ? `${m.diff}` : 'FORA'}
                            </span>
                            <span className="w-14 text-right font-mono text-[11px] font-bold text-sky-300">
                              {m.durationLabel}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2) GRÁFICO LIQUID GLASS — VARIAÇÃO DOS PONTOS DO DIA (SALDO DAS PARTIDAS × MÉDIA DO GRUPO) */}
                {ind.pointsSeries && ind.pointsSeries.length > 0 && (
                  <div className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-slate-900/60 p-4 sm:p-5 backdrop-blur-xl">
                    <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-cyan-300">
                          Variação dos Pontos do Dia
                        </span>
                        <h4 className="text-sm font-black text-white">
                          Saldo das Partidas × Média do Grupo
                        </h4>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono font-bold">
                        <span className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-cyan-200">
                          Saldo: {ind.pointsDiff >= 0 ? `+${ind.pointsDiff}` : ind.pointsDiff}
                        </span>
                        <span className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-amber-300">
                          Média Grupo: {(ind.groupAvgPointsDiff ?? 0) > 0 ? `+${(ind.groupAvgPointsDiff ?? 0).toFixed(1)}` : (ind.groupAvgPointsDiff ?? 0).toFixed(1)} • ±{(ind.groupAvgMatchMargin ?? 0).toFixed(1)}/j
                        </span>
                      </div>
                    </div>
                    <div className="h-44 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={ind.pointsSeries} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                          <defs>
                            <linearGradient id="dailyPtsAreaV3" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#22D3EE" stopOpacity={0.38} />
                              <stop offset="55%" stopColor="#10B981" stopOpacity={0.14} />
                              <stop offset="100%" stopColor="#060A12" stopOpacity={0.02} />
                            </linearGradient>
                            <linearGradient id="dailyPtsStrokeV3" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor="#38BDF8" />
                              <stop offset="55%" stopColor="#34D399" />
                              <stop offset="100%" stopColor="#FBBF24" />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" vertical={false} />
                          <ReferenceLine y={0} stroke="rgba(148,163,184,0.3)" />
                          <XAxis
                            dataKey="label"
                            stroke="#64748B"
                            tick={{ fill: '#94A3B8', fontSize: 11, fontWeight: 700 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            stroke="#64748B"
                            tick={{ fill: '#94A3B8', fontSize: 11, fontWeight: 700 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'rgba(10, 18, 34, 0.94)',
                              border: '1px solid rgba(56, 189, 248, 0.35)',
                              borderRadius: '14px',
                              color: '#F8FAFC',
                              fontSize: '12px'
                            }}
                            formatter={(val: any, name: any) => {
                              const n = Number(val || 0);
                              const formatted = n > 0 ? `+${n}` : `${n}`;
                              if (name === 'cumDiff') return [`${formatted} pts`, 'Saldo Acumulado'];
                              if (name === 'matchDiff') return [`${formatted} pts`, 'Saldo da Partida'];
                              if (name === 'groupAvgCumDiff') return [`${formatted} pts`, 'Média do Grupo'];
                              return [formatted, name];
                            }}
                          />
                          <Bar dataKey="matchDiff" barSize={18} radius={[6, 6, 0, 0]}>
                            {ind.pointsSeries.map((entry, idx) => (
                              <Cell
                                key={`cell-${idx}`}
                                fill={entry.matchDiff >= 0 ? 'rgba(16, 185, 129, 0.32)' : 'rgba(244, 63, 94, 0.32)'}
                                stroke={entry.matchDiff >= 0 ? '#34D399' : '#FB7185'}
                                strokeWidth={1}
                              />
                            ))}
                          </Bar>
                          <Area
                            type="monotone"
                            dataKey="cumDiff"
                            stroke="url(#dailyPtsStrokeV3)"
                            strokeWidth={3}
                            fill="url(#dailyPtsAreaV3)"
                            activeDot={{ r: 5, fill: '#22D3EE', stroke: '#060A12', strokeWidth: 2 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="groupAvgCumDiff"
                            stroke="#FBBF24"
                            strokeWidth={2}
                            strokeDasharray="6 4"
                            dot={{ r: 3, fill: '#FBBF24', stroke: '#060A12', strokeWidth: 1 }}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* 3) RESUMO DOS TIMES (SEPARADO — APENAS PARCEIROS EM QUADRA, SEM REPETIR PLACAR) */}
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h4 className="text-sm font-black uppercase tracking-wider text-emerald-300">
                      Resumo dos Times • Parceiros em Quadra
                    </h4>
                    <span className="text-[11px] font-mono font-bold text-slate-400">
                      {ind.distinctTeammatesCount ?? 0} parceiros distintos
                      {ind.mostFrequentTeammate && ind.mostFrequentTeammate.games >= 2
                        ? ` • +Freq.: ${ind.mostFrequentTeammate.name} (${ind.mostFrequentTeammate.games}J)`
                        : ''}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {ind.timeline
                      .filter((m) => m.status !== 'OUT')
                      .map((m) => (
                        <div
                          key={`team-${m.index}`}
                          className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2"
                        >
                          <span className="rounded-full border border-cyan-400/35 bg-cyan-500/15 px-2.5 py-0.5 font-mono text-[11px] font-black text-cyan-200 shrink-0">
                            {m.label}
                          </span>
                          <span className="text-xs font-semibold text-slate-200 leading-snug">
                            {m.teammates.length > 0 ? m.teammates.join(' • ') : 'Sem parceiros registrados'}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>

                {/* 4) RESENHA DO GUERREIRINHO • ANÁLISE CURTA E BEM-HUMORADA (IA) */}
                {ind.aiHumorComment && (
                  <div className="rounded-3xl border border-violet-400/30 bg-gradient-to-br from-violet-500/10 via-slate-950/70 to-cyan-500/10 p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <h4 className="flex items-center gap-2 text-xs sm:text-sm font-black uppercase tracking-wider text-violet-200">
                        <Sparkles className="h-4 w-4 text-violet-300" />
                        Resenha do Guerreirinho • Análise IA
                      </h4>
                      <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-cyan-200">
                        Resenha da Noite
                      </span>
                    </div>
                    <p className="text-sm font-medium leading-relaxed text-slate-100">
                      {ind.aiHumorComment}
                    </p>
                  </div>
                )}
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
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div>
                    <h4 className="text-sm font-black uppercase tracking-wider text-amber-300">
                      Ranking Acumulado Completo ({analytics.accumulated.topRows.length} Sócios)
                    </h4>
                    <span className="text-[11px] text-slate-400 font-semibold">
                      Movimentação vs última quinta ({analytics.accumulated.referenceDateLabel})
                    </span>
                  </div>
                  <div className="relative w-full sm:w-44">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={accSearch}
                      onChange={(e) => setAccSearch(e.target.value)}
                      placeholder="Filtrar atleta..."
                      className="w-full rounded-xl border border-white/15 bg-slate-950/80 pl-8 pr-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-amber-400/60 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="max-h-[520px] overflow-y-auto pr-1 space-y-2">
                  {analytics.accumulated.topRows
                    .filter((row) =>
                      !accSearch.trim()
                        ? true
                        : row.firstName.toLowerCase().includes(accSearch.trim().toLowerCase())
                    )
                    .map((row) => {
                      const isUp = row.rankDelta > 0;
                      const isDown = row.rankDelta < 0;
                      return (
                        <div
                          key={row.id}
                          className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-6 font-mono text-xs font-black text-slate-400 shrink-0">
                              {String(row.rank).padStart(2, '0')}
                            </span>
                            <span
                              className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-mono text-[11px] font-black shrink-0 ${
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
                            <span className="text-sm font-black text-white truncate">{row.firstName}</span>
                          </div>
                          <div className="flex items-center gap-3 font-mono text-xs shrink-0">
                            <span className="font-black text-amber-300">{row.elo} ELO</span>
                            <span className="text-cyan-300 font-bold">{row.winRate}%</span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {userRole === 'ADMIN' && (
              <div className="rounded-3xl border border-amber-400/30 bg-slate-950/75 p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-widest text-amber-300">
                      Configuração Admin • Bot Guerreirinho (VM Google)
                    </div>
                    <h4 className="text-sm sm:text-base font-black text-white">
                      Cards HD no WhatsApp
                    </h4>
                  </div>
                  <span
                    className={`rounded-xl px-2.5 py-1 text-[11px] font-black uppercase tracking-wider border ${
                      cardDeliveryMode === 'vm_image_only'
                        ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
                        : 'border-slate-500/40 bg-slate-800/70 text-slate-300'
                    }`}
                  >
                    {cardDeliveryMode === 'vm_image_only' ? 'Imagem via VM Google' : 'Desabilitado (Só Texto)'}
                  </span>
                </div>

                {/* Seletor de Modo (Sem links externos e sem Evolution API) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    disabled={savingDeliveryConfig}
                    onClick={() => handleSaveDeliveryMode('disabled')}
                    className={`flex items-start gap-3 rounded-2xl border p-3 text-left transition ${
                      cardDeliveryMode === 'disabled'
                        ? 'border-cyan-400/60 bg-cyan-500/15 text-white shadow-[0_0_20px_rgba(34,211,238,0.18)]'
                        : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.07]'
                    }`}
                  >
                    <FileText className="h-5 w-5 text-cyan-300 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-black">Desabilitado no WhatsApp (Padrão)</div>
                      <p className="mt-0.5 text-[11px] text-slate-400 leading-snug">
                        O bot envia apenas os relatórios completos em texto, sem nenhum link. Use &quot;Baixar PNG&quot; aqui no app quando quiser compartilhar a imagem manualmente.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={savingDeliveryConfig}
                    onClick={() => handleSaveDeliveryMode('vm_image_only')}
                    className={`flex items-start gap-3 rounded-2xl border p-3 text-left transition ${
                      cardDeliveryMode === 'vm_image_only'
                        ? 'border-emerald-400/60 bg-emerald-500/15 text-white shadow-[0_0_20px_rgba(16,185,129,0.2)]'
                        : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.07]'
                    }`}
                  >
                    <ImageIcon className="h-5 w-5 text-emerald-300 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-black">Imagem Nativa via VM Google</div>
                      <p className="mt-0.5 text-[11px] text-slate-400 leading-snug">
                        Ative apenas se o script da VM Google já suportar enviar <code className="text-emerald-300">mediaBase64</code> como foto diretamente no WhatsApp (sem links).
                      </p>
                    </div>
                  </button>
                </div>

                {/* Instruções opcionais para habilitar envio nativo de foto na VM Google */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-400">
                      Envio de links externos foi desabilitado permanentemente para os sócios.
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowBridgeSnippet((v) => !v)}
                      className="inline-flex items-center gap-1 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-slate-300 hover:bg-white/10 transition"
                    >
                      {showBridgeSnippet ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                      Código para VM Google (Opcional)
                    </button>
                  </div>

                  {showBridgeSnippet && (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>
                          Para a VM Google enviar o PNG direto na conversa (Baileys ou whatsapp-web.js):
                        </span>
                        <button
                          type="button"
                          onClick={handleCopyBridgeSnippet}
                          className="inline-flex items-center gap-1 rounded-lg border border-cyan-400/35 bg-cyan-500/15 px-2.5 py-1 text-[11px] font-black text-cyan-200 hover:bg-cyan-500/25 shrink-0 ml-2"
                        >
                          {copiedBridgeSnippet ? (
                            <Check className="h-3.5 w-3.5 text-emerald-300" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          {copiedBridgeSnippet ? 'Copiado' : 'Copiar'}
                        </button>
                      </div>
                      <pre className="overflow-x-auto rounded-xl border border-white/10 bg-[#050811] p-3 text-[11px] font-mono text-cyan-200 leading-relaxed">
                        {vmBridgeSnippet}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="rounded-3xl border border-cyan-400/20 bg-cyan-500/[0.06] p-4 text-xs text-slate-300 space-y-1.5">
              <div className="font-black uppercase tracking-wider text-cyan-300">
                Entrega Nativa em PNG na VM Google (Zero Links)
              </div>
              <p>
                • <strong>Quinta às 22:00 (Grupo):</strong> envia automaticamente os arquivos PNG do <strong>Ranking do Dia</strong> e do <strong>Ranking Acumulado (28 sócios)</strong> como fotos diretas no grupo.
              </p>
              <p>
                • <strong>Quinta às 22:10 (Privado):</strong> envia automaticamente o arquivo PNG do <strong>Resumo Individual</strong> no privado de cada sócio que jogou (espaçado a cada 3,5s).
              </p>
              <p>
                • <strong>Trava de Segurança:</strong> enquanto o script da VM não enviar <code className="text-emerald-300">supportsMedia: true</code>, o bot continua entregando o relatório completo em texto limpo (nunca envia links).
              </p>
            </div>
          </div>
        </div>
      </div>
      {/* Lightbox Fullscreen para inspecionar o Card HD em resolução total */}
      {zoomModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3 sm:p-6 backdrop-blur-md"
          onClick={() => setZoomModalOpen(false)}
        >
          <div
            className="relative max-h-[92vh] max-w-[96vw] overflow-auto rounded-3xl border border-white/20 bg-[#050912] p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setZoomModalOpen(false)}
              className="sticky top-2 float-right z-10 inline-flex items-center gap-1 rounded-xl border border-white/20 bg-slate-950/90 px-3 py-1.5 text-xs font-black text-white hover:bg-slate-800 transition"
            >
              <X className="h-4 w-4 text-rose-300" />
              Fechar
            </button>
            <img
              src={cardImageUrl}
              alt="Card Visual HD Ampliado"
              className="block max-w-full sm:max-w-[760px] h-auto rounded-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
