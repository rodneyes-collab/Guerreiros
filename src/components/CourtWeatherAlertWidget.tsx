import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CloudRain,
  CloudSun,
  Compass,
  Droplets,
  ExternalLink,
  MapPin,
  RefreshCw,
  Send,
  ShieldAlert,
  Thermometer,
  Wind
} from 'lucide-react';
import { auth } from '../../firebase';
import { useStore } from '../../store';

export interface CourtWeatherForecastData {
  temperatureC: number;
  feelsLikeC: number;
  humidityPct: number;
  windKmh: number;
  weatherCode: number;
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
  whatsappBlock: string;
  fullBroadcastMessage: string;
  updatedAt: number;
}

interface CourtWeatherAlertWidgetProps {
  compact?: boolean;
}

const DEFAULT_COURT_LAT = -8.131550;
const DEFAULT_COURT_LNG = -34.907333;

export const CourtWeatherAlertWidget: React.FC<CourtWeatherAlertWidgetProps> = ({ compact = false }) => {
  const user = useStore((s) => s.user);
  const players = useStore((s) => s.players);
  const systemMetadata = useStore((s) => s.systemMetadata);
  const showNotification = useStore((s) => s.showNotification);

  const currentPlayer = players.find(
    (p) =>
      (user?.uid && p.uid === user.uid) ||
      (user?.email && String(p.email || '').toLowerCase() === String(user.email || '').toLowerCase())
  );

  const isAdmin =
    Boolean(currentPlayer?.isAdmin) ||
    String(user?.email || '').trim().toLowerCase() === 'rodneyes@gmail.com';

  const courtLat = Number(systemMetadata?.courtLocation?.lat ?? DEFAULT_COURT_LAT);
  const courtLng = Number(systemMetadata?.courtLocation?.lng ?? DEFAULT_COURT_LNG);
  const geofenceRadius = Number(systemMetadata?.geofenceRadius || 150);

  const [weather, setWeather] = useState<CourtWeatherForecastData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSimulatedRainAlert, setIsSimulatedRainAlert] = useState<boolean>(false);
  const [isHowToArriveOpen, setIsHowToArriveOpen] = useState<boolean>(false);
  const [isSendingBroadcast, setIsSendingBroadcast] = useState<'private' | 'group' | null>(null);
  const [pushPermStatus, setPushPermStatus] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );

  const triggerAdminRainPushNotification = useCallback(
    async (forecast: CourtWeatherForecastData, simulated = false) => {
      if (!isAdmin) return;
      const alertKey = `guerreiros_rain_push_${forecast.gameNightDateLabel}_${simulated ? 'sim' : 'real'}`;
      if (!simulated && sessionStorage.getItem(alertKey) === '1') {
        return;
      }
      if (!simulated) {
        sessionStorage.setItem(alertKey, '1');
      }

      const rainPct = simulated ? Math.max(82, forecast.gameNightRainProbPct) : forecast.gameNightRainProbPct;
      const title = `⛈️ Alerta de Chuva na Quadra (${rainPct}%) — ${forecast.gameNightDateLabel}`;
      const body =
        `Previsão indica ${rainPct}% de chuva e vento de ${forecast.gameNightWindKmh} km/h no horário do jogo (19h–22h). ` +
        `Sugestão à Diretoria: avaliar mudança para quadra coberta ou aviso preventivo de cancelamento ao grupo.`;

      showNotification(`${title}: ${body}`, 'info');

      if (typeof window !== 'undefined' && 'Notification' in window) {
        try {
          let perm = Notification.permission;
          if (perm === 'default' && simulated) {
            perm = await Notification.requestPermission();
            setPushPermStatus(perm);
          }
          if (perm === 'granted') {
            if ('serviceWorker' in navigator) {
              const reg = await navigator.serviceWorker.getRegistration();
              if (reg && reg.showNotification) {
                await reg.showNotification(title, {
                  body,
                  icon: '/pwa-192x192.png',
                  badge: '/pwa-192x192.png',
                  tag: 'guerreiros-weather-rain-alert'
                });
                return;
              }
            }
            new Notification(title, {
              body,
              icon: '/pwa-192x192.png',
              tag: 'guerreiros-weather-rain-alert'
            });
          }
        } catch {}
      }
    },
    [isAdmin, showNotification]
  );

  const loadWeather = useCallback(
    async (force = false) => {
      setIsLoading(true);
      try {
        const resp = await fetch(
          `/api/presence/court-weather?lat=${encodeURIComponent(courtLat)}&lng=${encodeURIComponent(courtLng)}${
            force ? '&force=1' : ''
          }`,
          { cache: 'no-store' }
        );
        const data = resp.ok ? await resp.json() : null;
        if (data?.success && data?.weather) {
          const w: CourtWeatherForecastData = data.weather;
          setWeather(w);
          setIsSimulatedRainAlert(false);
          const isStormCode = w.weatherCode >= 61;
          if (isAdmin && (w.gameNightRainProbPct >= 45 || isStormCode)) {
            triggerAdminRainPushNotification(w, false);
          }
        }
      } catch {
      } finally {
        setIsLoading(false);
      }
    },
    [courtLat, courtLng, isAdmin, triggerAdminRainPushNotification]
  );

  useEffect(() => {
    loadWeather(false);
    const timer = window.setInterval(() => loadWeather(false), 10 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [loadWeather]);

  const handleRequestPushPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      showNotification('Notificações Push nativas não são suportadas neste navegador.', 'error');
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setPushPermStatus(perm);
      if (perm === 'granted') {
        showNotification('Notificações Push de Alerta de Chuva ativadas para o Administrador!', 'success');
      } else {
        showNotification('Permissão de Notificação Push não concedida no navegador.', 'error');
      }
    } catch {
      showNotification('Não foi possível solicitar permissão de notificação neste navegador.', 'error');
    }
  };

  const handleSimulateRainPushAlert = async () => {
    if (!weather) return;
    setIsSimulatedRainAlert(true);
    await triggerAdminRainPushNotification(
      {
        ...weather,
        gameNightRainProbPct: Math.max(85, weather.gameNightRainProbPct),
        gameNightConditionLabel: 'Chuva forte / trovoadas',
        gameNightEmoji: '⛈️',
        courtPlayabilityAdvice:
          'ALERTA DE CHUVA FORTE (85%): Recomendado avaliar transferência para quadra coberta ou cancelamento preventivo da partida.'
      },
      true
    );
  };

  const handleDispatchWhatsAppBulletin = async (scope: 'private' | 'group') => {
    if (isSendingBroadcast) return;
    setIsSendingBroadcast(scope);
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
          targetScope: scope,
          playerId: currentPlayer?.id || '',
          userEmail: user?.email || ''
        })
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.success) {
        throw new Error(data?.error || `Erro HTTP ${resp.status}`);
      }
      showNotification(
        scope === 'group'
          ? 'Boletim de Clima & Rotas Waze/Maps enviado para a fila do Grupo Oficial!'
          : 'Boletim de Clima & Rotas Waze/Maps enviado para o seu WhatsApp!',
        'success'
      );
    } catch (err: any) {
      showNotification(err?.message || 'Erro ao enviar boletim de clima.', 'error');
    } finally {
      setIsSendingBroadcast(null);
    }
  };

  const wazeUrl =
    weather?.wazeNavigateUrl ||
    `https://waze.com/ul?ll=${courtLat.toFixed(6)},${courtLng.toFixed(6)}&navigate=yes`;
  const googleMapsUrl =
    weather?.googleMapsNavigateUrl ||
    `https://www.google.com/maps/dir/?api=1&destination=${courtLat.toFixed(6)},${courtLng.toFixed(6)}&travelmode=driving`;

  const displayRainPct = isSimulatedRainAlert
    ? Math.max(85, weather?.gameNightRainProbPct ?? 85)
    : weather?.gameNightRainProbPct ?? 10;
  const isHighRainRisk = displayRainPct >= 45 || isSimulatedRainAlert;

  return (
    <section
      className={`rounded-3xl border transition-all overflow-hidden ${
        isHighRainRisk
          ? 'bg-gradient-to-br from-rose-950/60 via-zinc-900/95 to-amber-950/50 border-rose-500/50 shadow-xl'
          : 'bg-gradient-to-br from-sky-950/40 via-zinc-900/95 to-emerald-950/30 border-white/10 shadow-lg'
      } ${compact ? 'p-4 sm:p-5' : 'p-5 sm:p-6'}`}
    >
      {/* Top Row: Weather Title + Como Chegar (Waze / Google Maps) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div
            className={`p-3 rounded-2xl border shrink-0 ${
              isHighRainRisk
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                : 'bg-brand-primary/15 border-brand-primary/40 text-brand-primary'
            }`}
          >
            {isHighRainRisk ? <CloudRain className="w-6 h-6" /> : <CloudSun className="w-6 h-6" />}
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-black text-white uppercase tracking-tight">
                Meteorologia da Quadra &amp; Próxima Partida
              </h3>
              <span className="px-2.5 py-0.5 rounded-full bg-white/10 border border-white/15 text-[10px] font-bold text-white/80">
                {weather?.gameNightDateLabel || 'Quinta-feira · 19h às 22h'}
              </span>
              {isHighRainRisk ? (
                <span className="px-2.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black uppercase flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Alerta de Chuva ({displayRainPct}%)
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-black uppercase">
                  Quadra Liberada ({displayRainPct}% chuva)
                </span>
              )}
            </div>

            <p className="text-xs text-white/65">
              Quadra Guerreiros VC ({courtLat.toFixed(6)}, {courtLng.toFixed(6)}) · Cerca GPS {geofenceRadius}m
            </p>
          </div>
        </div>

        {/* Botão Como Chegar (abre seletor ou atalhos diretos Waze / Google Maps) */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsHowToArriveOpen((prev) => !prev)}
              className="px-3.5 py-2 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-black font-black text-[11px] uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow"
            >
              <Compass className="w-4 h-4" />
              Como Chegar na Quadra
            </button>

            {isHowToArriveOpen && (
              <div className="mt-2 sm:absolute sm:right-0 sm:top-full z-40 w-64 p-2.5 rounded-2xl bg-zinc-950 border border-brand-primary/40 shadow-2xl space-y-1.5">
                <p className="text-[10px] font-bold text-white/60 px-1">
                  Abrir navegação GPS com trânsito ao vivo:
                </p>
                <a
                  href={wazeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsHowToArriveOpen(false)}
                  className="w-full px-3 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 text-sky-300 text-xs font-bold flex items-center justify-between"
                >
                  <span>🟦 Abrir no Waze</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsHowToArriveOpen(false)}
                  className="w-full px-3 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 text-xs font-bold flex items-center justify-between"
                >
                  <span>🟩 Abrir no Google Maps</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>

          <a
            href={wazeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 text-sky-300 text-[11px] font-bold flex items-center gap-1.5"
          >
            🚗 Waze
            <ExternalLink className="w-3 h-3" />
          </a>

          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 text-[11px] font-bold flex items-center gap-1.5"
          >
            <MapPin className="w-3.5 h-3.5" />
            Google Maps
            <ExternalLink className="w-3 h-3" />
          </a>

          <button
            type="button"
            onClick={() => loadWeather(true)}
            disabled={isLoading}
            title="Atualizar meteorologia agora"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/75 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-brand-primary' : ''}`} />
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4">
        <div className="p-3 rounded-2xl bg-black/45 border border-white/10">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-white/55 uppercase">
            <Thermometer className="w-3.5 h-3.5 text-brand-primary" />
            Agora na Quadra
          </div>
          <p className="text-base sm:text-lg font-black text-white mt-1 font-mono tabular-nums">
            {weather ? `${weather. conditionEmoji} ${weather.temperatureC}°C` : '...'}
          </p>
          <p className="text-[10px] text-white/55 truncate">
            {weather ? `${weather.conditionLabel} · Sensação ${weather.feelsLikeC}°C` : 'Carregando...'}
          </p>
        </div>

        <div className="p-3 rounded-2xl bg-black/45 border border-white/10">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-white/55 uppercase">
            <CloudSun className="w-3.5 h-3.5 text-amber-400" />
            Horário do Jogo (19h–22h)
          </div>
          <p className="text-base sm:text-lg font-black text-white mt-1 font-mono tabular-nums">
            {isSimulatedRainAlert
              ? `⛈️ ${weather?.gameNightTempC ?? 25}°C`
              : weather
              ? `${weather.gameNightEmoji} ${weather.gameNightTempC}°C`
              : '...'}
          </p>
          <p className="text-[10px] text-white/55 truncate">
            {isSimulatedRainAlert
              ? 'Chuva forte / trovoadas (Simulado)'
              : weather?.gameNightConditionLabel || 'Previsão noturna'}
          </p>
        </div>

        <div
          className={`p-3 rounded-2xl border ${
            isHighRainRisk ? 'bg-rose-950/60 border-rose-500/50' : 'bg-black/45 border-white/10'
          }`}
        >
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-white/55 uppercase">
            <Droplets className={`w-3.5 h-3.5 ${isHighRainRisk ? 'text-rose-400' : 'text-sky-400'}`} />
            Risco de Chuva (Partida)
          </div>
          <p
            className={`text-base sm:text-lg font-black mt-1 font-mono tabular-nums ${
              isHighRainRisk ? 'text-rose-300' : 'text-white'
            }`}
          >
            {displayRainPct}%
          </p>
          <p className="text-[10px] text-white/55 truncate">
            {isHighRainRisk ? 'Atenção: risco elevado!' : `Umidade atual: ${weather?.humidityPct ?? 70}%`}
          </p>
        </div>

        <div className="p-3 rounded-2xl bg-black/45 border border-white/10">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-white/55 uppercase">
            <Wind className="w-3.5 h-3.5 text-emerald-400" />
            Vento na Quadra
          </div>
          <p className="text-base sm:text-lg font-black text-white mt-1 font-mono tabular-nums">
            {weather ? `${weather.gameNightWindKmh} km/h` : '...'}
          </p>
          <p className="text-[10px] text-white/55 truncate">
            {weather && weather.gameNightWindKmh >= 25 ? 'Vento moderado/forte' : 'Brisa leve favorável'}
          </p>
        </div>
      </div>

      {/* Rain Alert Banner & Recommendation for Cancellation / Relocation */}
      {isHighRainRisk && (
        <div className="mt-4 p-4 rounded-2xl bg-rose-950/80 border border-rose-500/60 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-black text-rose-200 uppercase">
                Alerta Meteorológico para o Horário da Partida ({displayRainPct}% de probabilidade de chuva)
              </p>
              <p className="text-xs text-rose-100/85 leading-relaxed">
                A previsão para o horário do jogo (19h às 22h) indica alta probabilidade de chuva.{' '}
                <strong>Recomendação à Diretoria:</strong> avaliar a transferência preventiva para quadra coberta ou emitir aviso antecipado de cancelamento/adiamento no grupo do WhatsApp.
              </p>
            </div>
          </div>

          {isSimulatedRainAlert && (
            <button
              type="button"
              onClick={() => setIsSimulatedRainAlert(false)}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold shrink-0 self-start md:self-center cursor-pointer"
            >
              Encerrar Simulação de Chuva
            </button>
          )}
        </div>
      )}

      {/* Admin Controls: Push Notifications Monitoring & Instant WhatsApp Weather Bulletin */}
      {isAdmin && (
        <div className="mt-4 pt-3.5 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-white/55 uppercase">
              Monitoramento Push Admin:
            </span>
            {pushPermStatus === 'granted' ? (
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 text-[10px] font-bold flex items-center gap-1">
                <Bell className="w-3 h-3" />
                Push Ativo no Navegador
              </span>
            ) : (
              <button
                type="button"
                onClick={handleRequestPushPermission}
                className="px-2.5 py-1 rounded-lg bg-brand-primary/20 hover:bg-brand-primary/30 border border-brand-primary/40 text-brand-primary text-[10px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <Bell className="w-3 h-3" />
                Ativar Push de Alerta de Chuva
              </button>
            )}

            <button
              type="button"
              onClick={handleSimulateRainPushAlert}
              className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <AlertTriangle className="w-3 h-3" />
              Testar Push de Alerta de Chuva
            </button>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => handleDispatchWhatsAppBulletin('private')}
              disabled={Boolean(isSendingBroadcast)}
              className="px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-200 text-[10px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3 h-3" />
              {isSendingBroadcast === 'private' ? 'Enviando...' : 'Boletim no Meu WhatsApp'}
            </button>
            <button
              type="button"
              onClick={() => handleDispatchWhatsAppBulletin('group')}
              disabled={Boolean(isSendingBroadcast)}
              className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 text-[10px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3 h-3" />
              {isSendingBroadcast === 'group' ? 'Enviando...' : 'Enviar Clima & Rotas no Grupo'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
