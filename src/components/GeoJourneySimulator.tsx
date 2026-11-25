import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  CloudSun,
  ExternalLink,
  MapPin,
  MessageSquare,
  Navigation,
  Play,
  Radio,
  RotateCcw,
  Send,
  StepForward,
  Users,
  Wind
} from 'lucide-react';
import { auth } from '../../firebase';
import { ActiveMemberMapMarker, GeofenceTestPoint } from './CourtGeofenceMap';

interface CourtWeatherSummary {
  temperatureC: number;
  feelsLikeC: number;
  humidityPct: number;
  windKmh: number;
  conditionLabel: string;
  conditionEmoji: string;
  gameNightTempC: number;
  gameNightRainProbPct: number;
  gameNightWindKmh: number;
  gameNightConditionLabel: string;
  gameNightEmoji: string;
  gameNightDateLabel: string;
  courtPlayabilityAdvice: string;
  wazeNavigateUrl: string;
  googleMapsNavigateUrl: string;
  fullBroadcastMessage: string;
}

export interface JourneySimPlayer {
  id: string;
  name: string;
  phone?: string;
}

interface ChatBubble {
  id: string;
  sender: 'bot' | 'member' | 'system';
  title?: string;
  text: string;
  time: string;
  realWhatsAppQueued?: boolean;
  distanceMeters?: number;
  arrivalOrder?: number;
}

interface GeoJourneySimulatorProps {
  player: JourneySimPlayer | null;
  userEmail?: string;
  courtLat: number;
  courtLng: number;
  geofenceRadius: number;
  dryRun: boolean;
  onUpdateMapState: (point: GeofenceTestPoint | null, trail: Array<{ lat: number; lng: number }>) => void;
  onUpdateActiveWatchers?: (watchers: ActiveMemberMapMarker[]) => void;
  onAttendanceMutated?: () => Promise<void> | void;
}

const JOURNEY_STEPS = [
  { id: 1, key: 'invite', shortTitle: '01. Convite do Bot', desc: 'Bot pede a localização (19h / gv cheguei)' },
  { id: 2, key: 'location_far', shortTitle: '02. Envio Longe', desc: 'Sócio envia localização (~1,2 km)' },
  { id: 3, key: 'ping_1', shortTitle: '03. Trajeto (~650m)', desc: 'Monitoramento silencioso em rota' },
  { id: 4, key: 'ping_2', shortTitle: '04. Chegando (~240m)', desc: 'Quase na borda da cerca virtual' },
  { id: 5, key: 'arrived', shortTitle: '05. Check-in #Fila', desc: 'Entra no raio e recebe posição na fila' }
] as const;

function nowTimeLabel(): string {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function offsetCoords(baseLat: number, baseLng: number, metersNorth: number, metersEast: number): { lat: number; lng: number } {
  const latRad = (baseLat * Math.PI) / 180;
  const dLat = metersNorth / 111320;
  const dLng = metersEast / (111320 * Math.cos(latRad));
  return {
    lat: Number((baseLat + dLat).toFixed(6)),
    lng: Number((baseLng + dLng).toFixed(6))
  };
}

export const GeoJourneySimulator: React.FC<GeoJourneySimulatorProps> = ({
  player,
  userEmail,
  courtLat,
  courtLng,
  geofenceRadius,
  dryRun,
  onUpdateMapState,
  onUpdateActiveWatchers,
  onAttendanceMutated
}) => {
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(false);
  const [sendRealWhatsApp, setSendRealWhatsApp] = useState<boolean>(false);
  const [startMode, setStartMode] = useState<'invite' | 'gv_cheguei'>('invite');
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [finalResult, setFinalResult] = useState<{
    arrivalOrder: number;
    distanceMeters: number;
    alreadyPresent: boolean;
    dryRun: boolean;
    playerName: string;
  } | null>(null);
  const [weatherInfo, setWeatherInfo] = useState<CourtWeatherSummary | null>(null);
  const [isSendingWeatherScope, setIsSendingWeatherScope] = useState<'private' | 'group' | null>(null);
  const [weatherDispatchNotice, setWeatherDispatchNotice] = useState<string | null>(null);

  const trailRef = useRef<Array<{ lat: number; lng: number }>>([]);
  const cancelAutoRef = useRef<boolean>(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/presence/court-weather?lat=${encodeURIComponent(courtLat)}&lng=${encodeURIComponent(courtLng)}`, {
      cache: 'no-store'
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.success && d?.weather) {
          setWeatherInfo(d.weather);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [courtLat, courtLng]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length]);

  useEffect(() => {
    return () => {
      cancelAutoRef.current = true;
    };
  }, []);

  const firstName = String(player?.name || 'Guerreiro').trim().split(/\s+/)[0] || 'Guerreiro';

  const callSimApi = useCallback(
    async (payload: Record<string, any>) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      try {
        const idToken = await auth.currentUser?.getIdToken?.();
        if (idToken) headers.Authorization = `Bearer ${idToken}`;
      } catch {}

      const bodyStr = JSON.stringify({
        ...payload,
        playerId: player?.id || '',
        userEmail: userEmail || '',
        dryRun,
        sendRealWhatsApp
      });

      let lastErr = 'Erro ao comunicar com o servidor.';
      for (let attempt = 0; attempt < 3; attempt++) {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 14000);
        try {
          const resp = await fetch('/api/presence/geo-journey-sim', {
            method: 'POST',
            headers,
            body: bodyStr,
            signal: controller.signal
          });
          window.clearTimeout(timer);
          const raw = await resp.text();
          let data: any = null;
          try {
            data = raw ? JSON.parse(raw) : null;
          } catch {}

          if (resp.ok && data?.success) {
            return data;
          }
          lastErr =
            data?.error ||
            (resp.status === 503
              ? 'Servidor reiniciando (HTTP 503). Tentando novamente...'
              : `HTTP ${resp.status}`);
          if ((resp.status === 502 || resp.status === 503 || resp.status === 504 || !data) && attempt < 2) {
            await new Promise((r) => setTimeout(r, 900 * (attempt + 1)));
            continue;
          }
          throw new Error(lastErr);
        } catch (err: any) {
          window.clearTimeout(timer);
          if (attempt < 2 && (err?.name === 'AbortError' || !err?.message)) {
            await new Promise((r) => setTimeout(r, 900 * (attempt + 1)));
            continue;
          }
          throw new Error(err?.message || lastErr);
        }
      }
      throw new Error(lastErr);
    },
    [player?.id, userEmail, dryRun, sendRealWhatsApp]
  );

  const handleReset = useCallback(() => {
    cancelAutoRef.current = true;
    setIsAutoPlaying(false);
    setIsBusy(false);
    setCurrentStep(0);
    setMessages([]);
    setErrorMsg(null);
    setFinalResult(null);
    trailRef.current = [];
    onUpdateMapState(null, []);
    if (onUpdateActiveWatchers) {
      onUpdateActiveWatchers([]);
    }
  }, [onUpdateMapState, onUpdateActiveWatchers]);

  const executeStep = useCallback(
    async (stepNumber: number): Promise<boolean> => {
      if (!player) {
        setErrorMsg('Selecione um sócio acima para iniciar a simulação.');
        return false;
      }

      setErrorMsg(null);
      setIsBusy(true);

      try {
        const ts = nowTimeLabel();
        const farFactor = Math.max(1200, geofenceRadius * 6);
        const midFactor = Math.max(650, Math.round(geofenceRadius * 3.2));
        const nearBorderFactor = Math.max(geofenceRadius + 85, Math.round(geofenceRadius * 1.45));
        const insideFactor = Math.max(15, Math.min(32, Math.round(geofenceRadius * 0.25)));

        if (stepNumber === 1) {
          const data = await callSimApi({ step: startMode });
          const nextBubbles: ChatBubble[] = [];
          if (startMode === 'gv_cheguei') {
            nextBubbles.push({
              id: `sim_u1_${Date.now()}`,
              sender: 'member',
              title: `${firstName} (WhatsApp)`,
              text: 'gv cheguei',
              time: ts
            });
          }
          nextBubbles.push({
            id: `sim_b1_${Date.now() + 1}`,
            sender: 'bot',
            title: startMode === 'invite' ? 'Guerreirinho · Convite 19h' : 'Guerreirinho · Resposta gv cheguei',
            text: data.botMessage,
            time: ts,
            realWhatsAppQueued: Boolean(data.whatsappDelivery?.queued)
          });
          setMessages((prev) => [...prev, ...nextBubbles]);
          setCurrentStep(1);
          return true;
        }

        if (stepNumber === 2) {
          const pt = offsetCoords(courtLat, courtLng, farFactor * 0.8, farFactor * 0.6);
          const data = await callSimApi({ step: 'location_far', lat: pt.lat, lng: pt.lng });
          trailRef.current = [{ lat: pt.lat, lng: pt.lng }];
          onUpdateMapState(
            {
              lat: pt.lat,
              lng: pt.lng,
              allowed: false,
              distanceMeters: data.distanceMeters,
              label: `Saída (${data.distanceMeters}m)`
            },
            [...trailRef.current]
          );
          setMessages((prev) => [
            ...prev,
            {
              id: `sim_u2_${Date.now()}`,
              sender: 'member',
              title: `${firstName} compartilhou localização`,
              text: `📍 Localização em tempo real (1 hora)\n(Toque no clipe 📎 → Localização — sem digitar latitude/longitude)`,
              time: ts,
              distanceMeters: data.distanceMeters
            },
            {
              id: `sim_b2_${Date.now() + 1}`,
              sender: 'bot',
              title: 'Guerreirinho · Monitoramento Ativado',
              text: data.botMessage,
              time: ts,
              distanceMeters: data.distanceMeters,
              realWhatsAppQueued: Boolean(data.whatsappDelivery?.queued)
            }
          ]);
          setCurrentStep(2);
          return true;
        }

        if (stepNumber === 3) {
          const pt = offsetCoords(courtLat, courtLng, midFactor * 0.8, midFactor * 0.6);
          const data = await callSimApi({ step: 'monitoring_ping', lat: pt.lat, lng: pt.lng });
          trailRef.current = [...trailRef.current, { lat: pt.lat, lng: pt.lng }];
          onUpdateMapState(
            {
              lat: pt.lat,
              lng: pt.lng,
              allowed: false,
              distanceMeters: data.distanceMeters,
              label: `Em trajeto (${data.distanceMeters}m)`
            },
            [...trailRef.current]
          );
          setMessages((prev) => [
            ...prev,
            {
              id: `sim_s3_${Date.now()}`,
              sender: 'system',
              title: 'Monitoramento Silencioso (Em Trajeto)',
              text: data.statusNote,
              time: ts,
              distanceMeters: data.distanceMeters
            }
          ]);
          setCurrentStep(3);
          return true;
        }

        if (stepNumber === 4) {
          const pt = offsetCoords(courtLat, courtLng, nearBorderFactor * 0.78, nearBorderFactor * 0.62);
          const data = await callSimApi({ step: 'monitoring_ping', lat: pt.lat, lng: pt.lng });
          trailRef.current = [...trailRef.current, { lat: pt.lat, lng: pt.lng }];
          onUpdateMapState(
            {
              lat: pt.lat,
              lng: pt.lng,
              allowed: false,
              distanceMeters: data.distanceMeters,
              label: `Quase na quadra (${data.distanceMeters}m)`
            },
            [...trailRef.current]
          );
          setMessages((prev) => [
            ...prev,
            {
              id: `sim_s4_${Date.now()}`,
              sender: 'system',
              title: 'Aproximação da Cerca Virtual',
              text: data.statusNote,
              time: ts,
              distanceMeters: data.distanceMeters
            }
          ]);
          setCurrentStep(4);
          return true;
        }

        if (stepNumber === 5) {
          const pt = offsetCoords(courtLat, courtLng, insideFactor * 0.75, insideFactor * 0.65);
          const data = await callSimApi({ step: 'arrived', lat: pt.lat, lng: pt.lng });
          trailRef.current = [...trailRef.current, { lat: pt.lat, lng: pt.lng }];
          onUpdateMapState(
            {
              lat: pt.lat,
              lng: pt.lng,
              allowed: Boolean(data.allowed),
              distanceMeters: data.distanceMeters,
              label: `Na quadra · #${data.arrivalOrder || 1} (${data.distanceMeters}m)`
            },
            [...trailRef.current]
          );

          const presenceNotice = data.dryRun
            ? `Lista de Presença simulada: ${firstName} entraria na posição #${data.arrivalOrder} (Modo "Só Simular" ativo — nenhum dado gravado).`
            : `Lista de Presença ATUALIZADA no banco: ${firstName} confirmado(a) na posição #${data.arrivalOrder}!`;

          setMessages((prev) => [
            ...prev,
            {
              id: `sim_s5_${Date.now()}`,
              sender: 'system',
              title: 'Entrada na Cerca Virtual Detectada',
              text: presenceNotice,
              time: ts,
              distanceMeters: data.distanceMeters,
              arrivalOrder: data.arrivalOrder
            },
            {
              id: `sim_b5_${Date.now() + 1}`,
              sender: 'bot',
              title: `Guerreirinho · Presença Confirmada (#${data.arrivalOrder})`,
              text: data.botMessage,
              time: ts,
              distanceMeters: data.distanceMeters,
              arrivalOrder: data.arrivalOrder,
              realWhatsAppQueued: Boolean(data.whatsappDelivery?.queued)
            }
          ]);

          setFinalResult({
            arrivalOrder: Number(data.arrivalOrder || 1),
            distanceMeters: Number(data.distanceMeters || 0),
            alreadyPresent: Boolean(data.alreadyPresent),
            dryRun: Boolean(data.dryRun),
            playerName: data.player?.name || player.name
          });
          setCurrentStep(5);

          if (data.allowed && !data.dryRun && onAttendanceMutated) {
            await onAttendanceMutated();
          }
          return true;
        }

        return false;
      } catch (err: any) {
        setErrorMsg(err?.message || 'Erro ao executar etapa da simulação.');
        return false;
      } finally {
        setIsBusy(false);
      }
    },
    [player, firstName, courtLat, courtLng, geofenceRadius, startMode, callSimApi, onUpdateMapState, onAttendanceMutated]
  );

  const handleRunFullJourney = async () => {
    cancelAutoRef.current = false;
    setMessages([]);
    setErrorMsg(null);
    setFinalResult(null);
    setCurrentStep(0);
    trailRef.current = [];
    onUpdateMapState(null, []);
    setIsAutoPlaying(true);

    for (let step = 1; step <= 5; step++) {
      if (cancelAutoRef.current) break;
      const ok = await executeStep(step);
      if (!ok || cancelAutoRef.current) break;
      if (step < 5) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    setIsAutoPlaying(false);
  };

  const handleNextStep = async () => {
    if (isBusy || isAutoPlaying) return;
    const next = currentStep >= 5 ? 1 : currentStep + 1;
    if (next === 1) {
      setMessages([]);
      setFinalResult(null);
      trailRef.current = [];
      onUpdateMapState(null, []);
    }
    await executeStep(next);
  };

  const handleSimulateMultipleMembersOnMap = () => {
    if (!onUpdateActiveWatchers) return;
    const p1 = offsetCoords(courtLat, courtLng, 22, 18); // ~28m (Na quadra #1)
    const p2 = offsetCoords(courtLat, courtLng, -38, 42); // ~57m (Na quadra #2)
    const p3 = offsetCoords(courtLat, courtLng, Math.max(210, geofenceRadius + 75), -120); // ~240m (Chegando)
    const p4 = offsetCoords(courtLat, courtLng, -460, -340); // ~570m (Em trajeto)

    const sampleWatchers: ActiveMemberMapMarker[] = [
      {
        playerId: player?.id || 'sim_m1',
        name: firstName,
        lat: p1.lat,
        lng: p1.lng,
        distanceMeters: 28,
        arrived: true,
        arrivalOrder: 1
      },
      {
        playerId: 'sim_m2',
        name: 'Carlos',
        lat: p2.lat,
        lng: p2.lng,
        distanceMeters: 57,
        arrived: true,
        arrivalOrder: 2
      },
      {
        playerId: 'sim_m3',
        name: 'Thiago',
        lat: p3.lat,
        lng: p3.lng,
        distanceMeters: Math.round(Math.hypot(Math.max(210, geofenceRadius + 75), 120)),
        arrived: false
      },
      {
        playerId: 'sim_m4',
        name: 'Rafael',
        lat: p4.lat,
        lng: p4.lng,
        distanceMeters: 572,
        arrived: false
      }
    ];
    onUpdateActiveWatchers(sampleWatchers);
  };

  const handleSendWeatherBulletin = async (targetScope: 'private' | 'group') => {
    if (isSendingWeatherScope) return;
    setIsSendingWeatherScope(targetScope);
    setWeatherDispatchNotice(null);
    setErrorMsg(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      try {
        const idToken = await auth.currentUser?.getIdToken?.();
        if (idToken) headers.Authorization = `Bearer ${idToken}`;
      } catch {}

      const resp = await fetch('/api/presence/send-weather-broadcast', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          targetScope,
          playerId: player?.id || '',
          userEmail: userEmail || ''
        })
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.success) {
        throw new Error(data?.error || `Falha ao enviar boletim (HTTP ${resp.status})`);
      }

      if (data.weather) {
        setWeatherInfo(data.weather);
      }

      const ts = nowTimeLabel();
      setMessages((prev) => [
        ...prev,
        {
          id: `sim_weather_${Date.now()}`,
          sender: 'bot',
          title:
            targetScope === 'group'
              ? 'Guerreirinho · Boletim de Clima & Trânsito (Grupo)'
              : `Guerreirinho · Boletim de Clima & Trânsito (${firstName})`,
          text: data.message,
          time: ts,
          realWhatsAppQueued: true
        }
      ]);
      setWeatherDispatchNotice(
        targetScope === 'group'
          ? 'Boletim de Clima & Rotas Waze/Maps enfileirado para o Grupo Oficial do WhatsApp!'
          : `Boletim de Clima & Rotas Waze/Maps enfileirado para o WhatsApp de ${firstName}!`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao disparar boletim de clima.');
    } finally {
      setIsSendingWeatherScope(null);
    }
  };

  const directCheckInPageUrl = player
    ? `/checkin?pid=${encodeURIComponent(player.id)}&phone=${encodeURIComponent(player.phone || '')}&name=${encodeURIComponent(firstName)}`
    : '/checkin';

  return (
    <div className="rounded-2xl bg-zinc-950/90 border border-brand-primary/30 p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-brand-primary shrink-0" />
            <h4 className="text-xs sm:text-sm font-black text-white uppercase tracking-tight">
              Simulador Completo da Jornada (WhatsApp + Monitoramento + Fila)
            </h4>
          </div>
          <p className="text-[11px] text-white/60 leading-relaxed">
            Simula toda a experiência do sócio — do convite do robô e envio da localização pelo mapa (sem digitar coordenadas) até o monitoramento silencioso no trajeto, check-in na lista e retorno do bot com a posição na fila.
          </p>
        </div>

        <a
          href={directCheckInPageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-brand-primary text-[10px] font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Abrir Página 1-Toque (/checkin)
        </a>
      </div>

      {/* Live Court Weather & Waze/Google Maps Game-Day Bulletin Card */}
      {weatherInfo && (
        <div className="p-3.5 rounded-xl bg-gradient-to-r from-sky-950/45 via-zinc-900/80 to-emerald-950/35 border border-sky-500/30 space-y-2.5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <CloudSun className="w-4 h-4 text-brand-primary shrink-0" />
                <span className="text-xs font-black text-white uppercase">
                  Previsão na Quadra · {weatherInfo.gameNightDateLabel}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-brand-primary/15 border border-brand-primary/35 text-brand-primary text-[10px] font-bold">
                  {weatherInfo.gameNightEmoji} {weatherInfo.gameNightConditionLabel} · {weatherInfo.gameNightTempC}°C
                </span>
                <span className="px-2 py-0.5 rounded-md bg-sky-500/15 border border-sky-500/30 text-sky-200 text-[10px] font-bold flex items-center gap-1">
                  🌧️ Chuva: {weatherInfo.gameNightRainProbPct}% · <Wind className="w-3 h-3" /> {weatherInfo.gameNightWindKmh} km/h
                </span>
              </div>
              <p className="text-[11px] text-white/75">
                💡 {weatherInfo.courtPlayabilityAdvice}{' '}
                <span className="text-white/50">
                  (Incluído automaticamente no convite das 19h e nos comandos <code className="text-brand-primary">gv clima</code> / <code className="text-brand-primary">gv waze</code> / <code className="text-brand-primary">gv cheguei</code>)
                </span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => handleSendWeatherBulletin('private')}
                disabled={Boolean(isSendingWeatherScope) || !player}
                className="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-200 text-[10px] font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3 h-3" />
                {isSendingWeatherScope === 'private'
                  ? 'Enviando...'
                  : `Testar Boletim no WhatsApp de ${firstName}`}
              </button>
              <button
                type="button"
                onClick={() => handleSendWeatherBulletin('group')}
                disabled={Boolean(isSendingWeatherScope)}
                className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 text-[10px] font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3 h-3" />
                {isSendingWeatherScope === 'group' ? 'Enviando...' : 'Enviar Boletim no Grupo'}
              </button>
            </div>
          </div>

          {weatherDispatchNotice && (
            <div className="px-3 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-[11px] text-emerald-200 font-semibold">
              ✅ {weatherDispatchNotice}
            </div>
          )}
        </div>
      )}

      {/* Config row: start trigger + real WhatsApp delivery toggle */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-xl bg-black/50 border border-white/10">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold text-white/55">Início da jornada:</span>
          <div className="flex items-center bg-zinc-900 p-0.5 rounded-lg border border-white/10">
            <button
              type="button"
              onClick={() => setStartMode('invite')}
              disabled={isAutoPlaying || isBusy}
              className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-colors cursor-pointer ${
                startMode === 'invite' ? 'bg-brand-primary text-black' : 'text-white/65 hover:text-white'
              }`}
            >
              Convite Quinta 19h
            </button>
            <button
              type="button"
              onClick={() => setStartMode('gv_cheguei')}
              disabled={isAutoPlaying || isBusy}
              className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-colors cursor-pointer ${
                startMode === 'gv_cheguei' ? 'bg-brand-primary text-black' : 'text-white/65 hover:text-white'
              }`}
            >
              Comando gv cheguei
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2 text-[11px] text-white/80 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={sendRealWhatsApp}
            onChange={(e) => setSendRealWhatsApp(e.target.checked)}
            disabled={isAutoPlaying || isBusy}
            className="w-4 h-4 accent-[#F5C429] rounded cursor-pointer"
          />
          <span className="font-semibold">
            Enviar também no WhatsApp real de {firstName}
          </span>
        </label>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleRunFullJourney}
          disabled={isBusy || isAutoPlaying || !player}
          className="px-4 py-2.5 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-black font-black text-[11px] uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          {isAutoPlaying ? 'Simulando Jornada...' : 'Simular Jornada Completa (5 Etapas)'}
        </button>

        <button
          type="button"
          onClick={handleNextStep}
          disabled={isBusy || isAutoPlaying || !player}
          className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-bold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
        >
          <StepForward className="w-3.5 h-3.5 text-brand-primary" />
          {currentStep === 0
            ? 'Passo a Passo (Etapa 1)'
            : currentStep < 5
            ? `Avançar para Etapa ${currentStep + 1}`
            : 'Repetir Etapa 1'}
        </button>

        {onUpdateActiveWatchers && (
          <button
            type="button"
            onClick={handleSimulateMultipleMembersOnMap}
            disabled={isBusy || isAutoPlaying}
            className="px-3.5 py-2.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-300 font-bold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
          >
            <Users className="w-3.5 h-3.5 text-sky-400" />
            Simular 4 Sócios Simultâneos no Mapa
          </button>
        )}

        {(currentStep > 0 || messages.length > 0) && (
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-white/75 font-bold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reiniciar
          </button>
        )}

        <div className="text-[10px] text-white/50 font-mono ml-auto">
          {dryRun ? 'Modo: Só Simular' : 'Modo: Gravar na Lista Real'}
          {' · '}
          Raio: {geofenceRadius}m
        </div>
      </div>

      {/* 5-step progress bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
        {JOURNEY_STEPS.map((st) => {
          const isDone = currentStep > st.id || (currentStep === 5 && st.id === 5);
          const isActive = currentStep === st.id;
          return (
            <div
              key={st.id}
              className={`px-2.5 py-2 rounded-lg border transition-colors ${
                isDone
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                  : isActive
                  ? 'bg-brand-primary/15 border-brand-primary/60 text-brand-primary'
                  : 'bg-black/40 border-white/10 text-white/45'
              }`}
            >
              <div className="text-[10px] font-bold truncate">{st.shortTitle}</div>
              <div className="text-[9px] text-white/55 truncate mt-0.5">{st.desc}</div>
            </div>
          );
        })}
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/40 text-xs text-rose-200">
          {errorMsg}
        </div>
      )}

      {/* Mini WhatsApp Conversation Preview */}
      {messages.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-[#0b141a] overflow-hidden">
          <div className="px-3.5 py-2.5 bg-[#1f2c34] border-b border-white/10 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <MessageSquare className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">
                  Prévia do WhatsApp · Guerreirinho ↔ {firstName}
                </p>
                <p className="text-[10px] text-white/55 truncate">
                  {sendRealWhatsApp
                    ? 'Mensagens também enfileiradas para entrega real via VM WhatsApp'
                    : 'Visualização instantânea em tela (ative o envio real acima para receber no celular)'}
                </p>
              </div>
            </div>
            {finalResult && (
              <span className="text-[11px] font-mono font-bold text-emerald-400 shrink-0">
                Fila #{finalResult.arrivalOrder} · {finalResult.distanceMeters}m
              </span>
            )}
          </div>

          <div className="p-3.5 space-y-2.5 max-h-[340px] overflow-y-auto">
            {messages.map((msg) => {
              if (msg.sender === 'system') {
                return (
                  <div
                    key={msg.id}
                    className="mx-auto max-w-[92%] px-3 py-2 rounded-lg bg-zinc-900/90 border border-sky-500/30 text-[11px] text-sky-200 flex items-start gap-2"
                  >
                    <Navigation className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sky-300 text-[10px] flex items-center justify-between gap-2">
                        <span>{msg.title}</span>
                        <span className="font-mono text-white/45">{msg.time}</span>
                      </div>
                      <p className="text-white/80 leading-snug mt-0.5">{msg.text}</p>
                    </div>
                  </div>
                );
              }

              const isMember = msg.sender === 'member';
              return (
                <div key={msg.id} className={`flex ${isMember ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed shadow ${
                      isMember
                        ? 'bg-[#005c4b] text-white rounded-tr-sm'
                        : 'bg-[#202c33] text-white/95 border border-white/5 rounded-tl-sm'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 text-[10px] mb-1">
                      <span className={`font-bold ${isMember ? 'text-emerald-200' : 'text-brand-primary'}`}>
                        {msg.title}
                      </span>
                      <span className="font-mono text-white/50">{msg.time}</span>
                    </div>
                    <pre className="whitespace-pre-wrap font-sans text-[11.5px] leading-relaxed">
                      {msg.text}
                    </pre>
                    {msg.realWhatsAppQueued && (
                      <div className="mt-1.5 pt-1.5 border-t border-white/10 text-[10px] text-emerald-300 flex items-center gap-1">
                        <Send className="w-3 h-3" />
                        Enfileirada para entrega real no WhatsApp (até ~60s via VM)
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>
        </div>
      )}

      {/* Final Confirmation Summary */}
      {finalResult && (
        <div className="p-3.5 rounded-xl bg-emerald-950/35 border border-emerald-500/45 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs text-white/90">
              <p className="font-black text-emerald-300 uppercase">
                Jornada Concluída · {finalResult.playerName} na Posição #{finalResult.arrivalOrder}
              </p>
              <p className="text-[11px] text-white/70 mt-0.5">
                Chegada validada a <span className="font-mono font-bold text-white">{finalResult.distanceMeters}m</span> da quadra
                {' · '}
                {finalResult.dryRun
                  ? 'Modo Simulação (lista real preservada)'
                  : 'Presença gravada na Lista de Hoje'}
                {' · '}
                {sendRealWhatsApp
                  ? 'Mensagens reais enviadas à fila da VM WhatsApp'
                  : 'Testado em tela sem disparos externos'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-300 shrink-0">
            <MapPin className="w-3.5 h-3.5" />
            Cerca {geofenceRadius}m OK
          </div>
        </div>
      )}
    </div>
  );
};
