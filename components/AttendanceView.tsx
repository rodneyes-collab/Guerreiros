import { useShallow } from 'zustand/react/shallow';
import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useStore } from '../store';
import { Player } from '../types';
import { capitalizeName } from '../utils/helpers';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db, getFirestoreDateKey } from '../firebase';
import { useIntentions } from '../src/hooks/useIntentions';
import { 
  ClipboardCheck, 
  Trash2, 
  RotateCcw, 
  Users, 
  X, 
  Plus,
  CheckCircle2,
  Calendar,
  Zap,
  BarChart3,
  Clock,
  LogOut,
  SmartphoneNfc,
  QrCode,
  UserCheck,
  Search,
  Sparkles,
  MapPin,
  Navigation,
  ShieldAlert,
  ChevronDown,
  Power,
  Crosshair,
  Save
} from 'lucide-react';

import {
  calculatePredictedMatches,
  calculateCompositePerformanceRating,
  calculatePracticalSkillsSum
} from '../utils/teamLogic';
import { SESSION_START_TIME, SESSION_END_TIME, AVG_MATCH_DURATION_MINS } from '../constants';
import { HelpTooltip } from '../src/components/HelpTooltip';
import { Tooltip } from '../src/components/Tooltip';
import { PlayerAvatar } from '../src/components/PlayerAvatar';
import { ActiveMemberMapMarker, CourtGeofenceMap, GeofenceTestPoint } from '../src/components/CourtGeofenceMap';
import { GeoJourneySimulator } from '../src/components/GeoJourneySimulator';

interface AttendanceViewProps {
  clearAttendance: () => void;
  resetDailyMatches: () => void;
  removeAttendance: (id: string) => void;
  updateDepartureTime?: (id: string, time: string | null) => Promise<void>;
  updateArrivalTime?: (id: string, time: string | null) => Promise<void>;
  registerAttendance: (player: Player) => void;
  availablePlayers: Player[];
  refreshPlayers: () => Promise<void>;
  currentPlayer: Player | null;
  preConfirmations: Player[];
  isIntentionPhase: boolean;
  isGameDay: boolean;
  onToggleIntention: (player: Player) => Promise<void>;
  userRole: 'ADMIN' | 'MEMBER' | null;
  setViewMode: (mode: any) => void;
}

export const AttendanceView: React.FC<AttendanceViewProps> = ({
  clearAttendance,
  resetDailyMatches,
  removeAttendance,
  updateDepartureTime,
  updateArrivalTime,
  registerAttendance,
  availablePlayers,
  refreshPlayers,
  currentPlayer,
  isGameDay,
  userRole,
  setViewMode
}) => {
  const {
    attendance: allAttendance,
    isSyncing,
    matches,
    players: allPlayers,
    idToCanonicalId,
    user,
    systemMetadata,
    setSystemMetadata,
    showNotification
  } = useStore(
    useShallow(state => ({
      attendance: state.attendance,
      isSyncing: state.isSyncing,
      matches: state.matches,
      players: state.players,
      idToCanonicalId: state.idToCanonicalId,
      user: state.user,
      systemMetadata: state.systemMetadata,
      setSystemMetadata: state.setSystemMetadata,
      showNotification: state.showNotification
    }))
  );

  const { intentions, getPlayerConfirmationTime } = useIntentions();

  const isAdmin =
    userRole === 'ADMIN' ||
    !!currentPlayer?.isAdmin ||
    user?.email?.trim().toLowerCase() === 'rodneyes@gmail.com';

  // Usa estritamente a data de Brasília (evita virada UTC às 21h00 BRT!)
  const { avgMatchDuration, todayMatchesCount, firstMatchStartTimeStr } = useMemo(() => {
    const today = getFirestoreDateKey();
    const todayMatches = (matches || []).filter(m => m.date === today && (m.duration || 0) > 60);
    const count = todayMatches.length;
    
    let firstStartTime: string | undefined = undefined;
    if (count > 0) {
      const sortedMatches = [...todayMatches].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      const firstMatch = sortedMatches[0];
      const refTs = firstMatch.startTime || firstMatch.timestamp;
      if (refTs) {
        firstStartTime = new Date(refTs).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      }
    } else {
      const activeGen = useStore.getState().generationResult;
      if (activeGen?.timestamp) {
        firstStartTime = new Date(activeGen.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      }
    }

    if (count === 0 && !firstStartTime) {
      return { avgMatchDuration: AVG_MATCH_DURATION_MINS, todayMatchesCount: 0, firstMatchStartTimeStr: undefined };
    }
    
    const totalDurationSecs = todayMatches.reduce((acc, m) => acc + (m.duration || 0), 0);
    const avgMins = count > 0 ? Math.round(totalDurationSecs / count / 60) : AVG_MATCH_DURATION_MINS;
    
    return { 
      avgMatchDuration: avgMins >= 8 ? avgMins : AVG_MATCH_DURATION_MINS,
      todayMatchesCount: count,
      firstMatchStartTimeStr: firstStartTime
    };
  }, [matches]);

  // Filtro estrito: apenas sócios ativos e fora do DM
  const attendance = useMemo(() => {
    return (allAttendance || []).filter(p => {
      const master = allPlayers.find(m => m.id === p.id || (m.uid && m.uid === p.uid));
      const status = master?.status || p.status || 'active';
      const isDM = Boolean(master?.isDM || p.isDM || status === 'dm');
      return status === 'active' && !isDM;
    });
  }, [allAttendance, allPlayers]);

  const displayedAttendance = useMemo(() => {
    return [...attendance].sort((a, b) => {
      const orderA = a.arrivalOrder && a.arrivalOrder < 999 ? a.arrivalOrder : 999;
      const orderB = b.arrivalOrder && b.arrivalOrder < 999 ? b.arrivalOrder : 999;
      if (orderA !== orderB) return orderA - orderB;
      return (a.timestamp || 0) - (b.timestamp || 0);
    });
  }, [attendance]);

  const [editingDeparture, setEditingDeparture] = useState<string | null>(null);
  const [editingArrival, setEditingArrival] = useState<string | null>(null);
  const [tempDepartureTime, setTempDepartureTime] = useState("");
  const [tempArrivalTime, setTempArrivalTime] = useState("");
  const [addingPlayerId, setAddingPlayerId] = useState<string | null>(null);
  const [isBatchCheckingIn, setIsBatchCheckingIn] = useState(false);
  const [searchAvailable, setSearchAvailable] = useState("");
  const [startY, setStartY] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);

  // Estados para Check-in e Teste de Sinal GPS
  const DEFAULT_OFFICIAL_COURT_LAT = -8.131550;
  const DEFAULT_OFFICIAL_COURT_LNG = -34.907333;
  const DEFAULT_OFFICIAL_RADIUS = 150;

  const savedCourtLat = Number(systemMetadata?.courtLocation?.lat ?? DEFAULT_OFFICIAL_COURT_LAT);
  const savedCourtLng = Number(systemMetadata?.courtLocation?.lng ?? DEFAULT_OFFICIAL_COURT_LNG);
  const savedGeofenceRadius = Number(systemMetadata?.geofenceRadius || DEFAULT_OFFICIAL_RADIUS);
  const isAutoGeoEnabled = systemMetadata?.autoGeoCheckInEnabled === true;

  const [isGpsPanelOpen, setIsGpsPanelOpen] = useState<boolean>(false);
  const [selectedGpsTestPlayerId, setSelectedGpsTestPlayerId] = useState<string>('');
  const [gpsDryRunMode, setGpsDryRunMode] = useState<boolean>(true);
  const [isTestingGps, setIsTestingGps] = useState<boolean>(false);
  const [courtLatInput, setCourtLatInput] = useState<string>(String(savedCourtLat));
  const [courtLngInput, setCourtLngInput] = useState<string>(String(savedCourtLng));
  const [geofenceRadiusInput, setGeofenceRadiusInput] = useState<string>(String(savedGeofenceRadius));
  const [isSavingGeoConfig, setIsSavingGeoConfig] = useState<boolean>(false);
  const [isCapturingMyCoords, setIsCapturingMyCoords] = useState<boolean>(false);
  const [gpsTestResult, setGpsTestResult] = useState<{
    allowed: boolean;
    reason?: string;
    message: string;
    distanceMeters?: number;
    maxRadius?: number;
    courtLocation?: { lat: number; lng: number };
    testedLat?: number;
    testedLng?: number;
    accuracyMeters?: number;
    arrivalOrder?: number;
    alreadyPresent?: boolean;
    playerName?: string;
    coordsLabel?: string;
    dryRun?: boolean;
  } | null>(null);
  const [journeyMapPoint, setJourneyMapPoint] = useState<GeofenceTestPoint | null>(null);
  const [journeyTrailPoints, setJourneyTrailPoints] = useState<Array<{ lat: number; lng: number }>>([]);
  const [liveGeoWatchers, setLiveGeoWatchers] = useState<ActiveMemberMapMarker[]>([]);
  const [simulatedGeoWatchers, setSimulatedGeoWatchers] = useState<ActiveMemberMapMarker[]>([]);

  const parsedDraftLat = Number(courtLatInput.trim().replace(',', '.'));
  const parsedDraftLng = Number(courtLngInput.trim().replace(',', '.'));
  const parsedDraftRadius = Math.round(Number(geofenceRadiusInput.trim()));

  const previewCourtLat =
    Number.isFinite(parsedDraftLat) && parsedDraftLat >= -90 && parsedDraftLat <= 90
      ? parsedDraftLat
      : savedCourtLat;
  const previewCourtLng =
    Number.isFinite(parsedDraftLng) && parsedDraftLng >= -180 && parsedDraftLng <= 180
      ? parsedDraftLng
      : savedCourtLng;
  const previewGeofenceRadius =
    Number.isFinite(parsedDraftRadius) && parsedDraftRadius >= 20 && parsedDraftRadius <= 2000
      ? parsedDraftRadius
      : savedGeofenceRadius;
  const hasUnsavedGeoDraft =
    Math.abs(previewCourtLat - savedCourtLat) > 0.000001 ||
    Math.abs(previewCourtLng - savedCourtLng) > 0.000001 ||
    previewGeofenceRadius !== savedGeofenceRadius;

  useEffect(() => {
    setCourtLatInput(String(savedCourtLat));
    setCourtLngInput(String(savedCourtLng));
    setGeofenceRadiusInput(String(savedGeofenceRadius));
  }, [savedCourtLat, savedCourtLng, savedGeofenceRadius]);

  useEffect(() => {
    if (!isGpsPanelOpen || !isAdmin) return;
    let cancelled = false;
    fetch('/api/presence/geo-config', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.success || !data?.config) return;
        setSystemMetadata({
          autoGeoCheckInEnabled: data.config.autoGeoCheckInEnabled,
          courtLocation: data.config.courtLocation,
          geofenceRadius: data.config.geofenceRadius
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isGpsPanelOpen, isAdmin, setSystemMetadata]);

  useEffect(() => {
    if (!isGpsPanelOpen || !isAdmin) return;
    let cancelled = false;
    const pollWatchers = () => {
      fetch('/api/presence/active-geo-watchers', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled || !data?.success || !Array.isArray(data.watchers)) return;
          const mapped: ActiveMemberMapMarker[] = data.watchers
            .filter(
              (w: any) =>
                w &&
                Number.isFinite(Number(w.lastLat)) &&
                Number.isFinite(Number(w.lastLng))
            )
            .map((w: any) => ({
              playerId: String(w.playerId || ''),
              name: String(w.name || 'Sócio'),
              lat: Number(w.lastLat),
              lng: Number(w.lastLng),
              distanceMeters: Number(w.lastDistanceMeters || 0),
              arrived: Boolean(w.arrived),
              arrivalOrder: typeof w.arrivalOrder === 'number' ? w.arrivalOrder : undefined,
              lastUpdatedAt: Number(w.lastUpdatedAt || 0)
            }));
          setLiveGeoWatchers(mapped);
        })
        .catch(() => {});
    };
    pollWatchers();
    const interval = window.setInterval(pollWatchers, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isGpsPanelOpen, isAdmin]);

  const persistGeoConfig = async (payload: {
    autoGeoCheckInEnabled?: boolean;
    courtLocation?: { lat: number; lng: number };
    geofenceRadius?: number;
  }, successMsg: string) => {
    setIsSavingGeoConfig(true);
    try {
      const cleanPatch: Record<string, any> = {};
      if (typeof payload.autoGeoCheckInEnabled === 'boolean') {
        cleanPatch.autoGeoCheckInEnabled = payload.autoGeoCheckInEnabled;
      }
      if (payload.courtLocation) {
        cleanPatch.courtLocation = {
          lat: Number(payload.courtLocation.lat.toFixed(6)),
          lng: Number(payload.courtLocation.lng.toFixed(6))
        };
      }
      if (typeof payload.geofenceRadius === 'number') {
        cleanPatch.geofenceRadius = Math.round(payload.geofenceRadius);
      }

      let firestoreSaved = false;
      let firestoreErrMsg = '';
      try {
        await setDoc(doc(db, 'metadata', 'system'), cleanPatch, { merge: true });
        firestoreSaved = true;
      } catch (fsErr: any) {
        firestoreErrMsg = fsErr?.message || '';
        console.warn('[AttendanceView] Falha ao gravar geo-config direto no Firestore:', fsErr);
      }

      let apiSaved = false;
      let apiErrMsg = '';
      let apiConfig: any = null;
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        try {
          const idToken = await auth.currentUser?.getIdToken?.();
          if (idToken) headers.Authorization = `Bearer ${idToken}`;
        } catch {}

        const requestBody = JSON.stringify({
          ...cleanPatch,
          userEmail: user?.email || currentPlayer?.email || '',
          uid: user?.uid || currentPlayer?.uid || '',
          playerId: currentPlayer?.id || ''
        });

        for (let attempt = 0; attempt < 3; attempt++) {
          const controller = new AbortController();
          const timer = window.setTimeout(() => controller.abort(), 12000);
          try {
            const resp = await fetch('/api/presence/geo-config', {
              method: 'POST',
              headers,
              body: requestBody,
              signal: controller.signal
            });
            window.clearTimeout(timer);

            const rawText = await resp.text();
            let data: any = null;
            try {
              data = rawText ? JSON.parse(rawText) : null;
            } catch {}

            if (resp.ok && data?.success) {
              apiSaved = true;
              apiConfig = data.config;
              break;
            }

            const isTransient = resp.status === 502 || resp.status === 503 || resp.status === 504 || !data;
            apiErrMsg =
              data?.error ||
              (resp.status === 503
                ? 'Servidor reiniciando ou em aquecimento (HTTP 503)'
                : `HTTP ${resp.status}`);

            if (isTransient && attempt < 2) {
              await new Promise((r) => setTimeout(r, 900 * (attempt + 1)));
              continue;
            }
            break;
          } catch (attemptErr: any) {
            window.clearTimeout(timer);
            apiErrMsg =
              attemptErr?.name === 'AbortError'
                ? 'Tempo limite excedido ao salvar no servidor'
                : attemptErr?.message || 'Erro de rede';
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, 900 * (attempt + 1)));
              continue;
            }
          }
        }
      } catch (netErr: any) {
        apiErrMsg = netErr?.message || 'Erro de rede';
      }

      if (!firestoreSaved && !apiSaved) {
        showNotification(
          `Erro ao salvar configuração de GPS (${apiErrMsg || firestoreErrMsg || 'tente novamente'}).`,
          'error'
        );
        return;
      }

      setSystemMetadata({
        autoGeoCheckInEnabled:
          apiConfig?.autoGeoCheckInEnabled ??
          (typeof cleanPatch.autoGeoCheckInEnabled === 'boolean'
            ? cleanPatch.autoGeoCheckInEnabled
            : isAutoGeoEnabled),
        courtLocation:
          apiConfig?.courtLocation ??
          cleanPatch.courtLocation ?? { lat: savedCourtLat, lng: savedCourtLng },
        geofenceRadius:
          apiConfig?.geofenceRadius ??
          cleanPatch.geofenceRadius ??
          savedGeofenceRadius
      });
      showNotification(successMsg, 'success');
    } catch (err: any) {
      showNotification(err?.message || 'Erro de conexão ao salvar configuração de GPS.', 'error');
    } finally {
      setIsSavingGeoConfig(false);
    }
  };

  const handleToggleAutoGeoEnabled = async () => {
    const nextEnabled = !isAutoGeoEnabled;
    await persistGeoConfig(
      { autoGeoCheckInEnabled: nextEnabled },
      nextEnabled
        ? 'Monitoramento automático por GPS HABILITADO para o clube!'
        : 'Monitoramento automático por GPS DESATIVADO (Modo Teste Admin).'
    );
  };

  const handleSaveCourtCoords = async () => {
    const lat = Number(courtLatInput.trim().replace(',', '.'));
    const lng = Number(courtLngInput.trim().replace(',', '.'));
    const radius = Math.round(Number(geofenceRadiusInput.trim()));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      showNotification('Informe coordenadas válidas (Latitude entre -90 e 90, Longitude entre -180 e 180).', 'error');
      return;
    }
    if (!Number.isFinite(radius) || radius < 20 || radius > 2000) {
      showNotification('Informe um raio válido entre 20m e 2000m.', 'error');
      return;
    }
    await persistGeoConfig(
      { courtLocation: { lat, lng }, geofenceRadius: radius },
      `Coordenadas (${lat.toFixed(6)}, ${lng.toFixed(6)}) e raio (${radius}m) salvos com sucesso!`
    );
  };

  const handleCaptureCurrentPositionAsCourt = () => {
    if (!('geolocation' in navigator)) {
      showNotification('Geolocalização não suportada neste navegador.', 'error');
      return;
    }
    setIsCapturingMyCoords(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setIsCapturingMyCoords(false);
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const acc = Math.round(pos.coords.accuracy || 0);
        const parsedRadius = Math.round(Number(geofenceRadiusInput.trim()));
        const effectiveRadius =
          Number.isFinite(parsedRadius) && parsedRadius >= 20 && parsedRadius <= 2000
            ? parsedRadius
            : savedGeofenceRadius;

        setCourtLatInput(String(lat));
        setCourtLngInput(String(lng));

        await persistGeoConfig(
          { courtLocation: { lat, lng }, geofenceRadius: effectiveRadius },
          acc > 150
            ? `Posição salva (${lat}, ${lng}), mas seu aparelho informou precisão baixa (±${acc}m). Prefira testar no celular com GPS ativo.`
            : `Sua posição atual (${lat}, ${lng} • ±${acc}m) foi salva como quadra de teste!`
        );
      },
      (err) => {
        setIsCapturingMyCoords(false);
        showNotification(
          err.code === 1
            ? 'Permissão de GPS negada no navegador.'
            : 'Não foi possível ler seu GPS agora. Tente novamente.',
          'error'
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  const handleRestoreOfficialCourtCoords = async () => {
    setCourtLatInput(String(DEFAULT_OFFICIAL_COURT_LAT));
    setCourtLngInput(String(DEFAULT_OFFICIAL_COURT_LNG));
    setGeofenceRadiusInput(String(DEFAULT_OFFICIAL_RADIUS));
    await persistGeoConfig(
      {
        courtLocation: { lat: DEFAULT_OFFICIAL_COURT_LAT, lng: DEFAULT_OFFICIAL_COURT_LNG },
        geofenceRadius: DEFAULT_OFFICIAL_RADIUS
      },
      'Coordenadas oficiais da quadra (-8.131550, -34.907333 • 150m) restauradas!'
    );
  };

  const handleRegisterPlayer = async (player: Player) => {
    if (addingPlayerId === player.id) return;
    setAddingPlayerId(player.id);
    try {
      await registerAttendance(player);
    } catch (e) {
      console.error('[AttendanceView] Erro ao registrar presença:', e);
    } finally {
      setTimeout(() => setAddingPlayerId(null), 350);
    }
  };

  const executeGpsValidationCall = async (payload: {
    playerId: string;
    lat: number;
    lng: number;
    accuracy?: number;
    name?: string;
    address?: string;
    isLive?: boolean;
    dryRun?: boolean;
    coordsLabel: string;
  }) => {
    setIsTestingGps(true);
    setJourneyMapPoint(null);
    setJourneyTrailPoints([]);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      try {
        const idToken = await auth.currentUser?.getIdToken?.();
        if (idToken) headers.Authorization = `Bearer ${idToken}`;
      } catch {}

      const requestPayload = JSON.stringify({
        playerId: payload.playerId,
        userEmail: user?.email || '',
        lat: payload.lat,
        lng: payload.lng,
        accuracy: payload.accuracy,
        name: payload.name,
        address: payload.address,
        isLive: payload.isLive,
        bypassTimeWindow: true,
        dryRun: payload.dryRun,
        source: 'APP_GPS'
      });

      let resp: Response | null = null;
      let data: any = null;
      let lastStatus = 0;

      for (let attempt = 0; attempt < 3; attempt++) {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 14000);
        try {
          resp = await fetch('/api/presence/gps-checkin', {
            method: 'POST',
            headers,
            body: requestPayload,
            signal: controller.signal
          });
          window.clearTimeout(timer);
          lastStatus = resp.status;
          const rawText = await resp.text();
          try {
            data = rawText ? JSON.parse(rawText) : null;
          } catch {
            data = null;
          }

          if (resp.ok && data && data.success) {
            break;
          }

          const isTransient =
            resp.status === 502 || resp.status === 503 || resp.status === 504 || (!resp.ok && !data);
          if (isTransient && attempt < 2) {
            await new Promise((r) => setTimeout(r, 900 * (attempt + 1)));
            continue;
          }
          break;
        } catch (attemptErr: any) {
          window.clearTimeout(timer);
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 900 * (attempt + 1)));
            continue;
          }
          throw attemptErr;
        }
      }

      if (!resp || !resp.ok || !data || !data.success) {
        const fallbackMsg =
          lastStatus === 502 || lastStatus === 503 || lastStatus === 504
            ? `Servidor temporariamente indisponível ou reiniciando (HTTP ${lastStatus}). Aguarde 3 segundos e toque no botão novamente.`
            : `Servidor respondeu em formato inesperado (HTTP ${lastStatus || resp?.status || 0}). Recarregue o app e tente novamente.`;
        setGpsTestResult({
          allowed: false,
          reason: 'ERROR',
          message: data?.error || data?.message || fallbackMsg,
          coordsLabel: payload.coordsLabel,
          accuracyMeters: payload.accuracy,
          dryRun: payload.dryRun
        });
        return;
      }
      setGpsTestResult({
        allowed: Boolean(data.allowed),
        reason: data.reason,
        message: data.message,
        distanceMeters: data.distanceMeters,
        maxRadius: data.maxRadius,
        courtLocation: data.courtLocation,
        testedLat: payload.lat,
        testedLng: payload.lng,
        accuracyMeters: payload.accuracy,
        arrivalOrder: data.arrivalOrder,
        alreadyPresent: data.alreadyPresent,
        playerName: data.player?.name,
        coordsLabel: payload.coordsLabel,
        dryRun: Boolean(data.dryRun)
      });
      if (data.allowed && !payload.dryRun && refreshPlayers) {
        await refreshPlayers();
      }
    } catch (err: any) {
      setGpsTestResult({
        allowed: false,
        reason: 'NETWORK_ERROR',
        message: err?.message || 'Erro de conexão ao validar GPS.',
        coordsLabel: payload.coordsLabel,
        accuracyMeters: payload.accuracy,
        dryRun: payload.dryRun
      });
    } finally {
      setIsTestingGps(false);
    }
  };

  const handleRealDeviceGpsCheckIn = (targetPlayerId: string, dryRun = false) => {
    if (!navigator.geolocation) {
      setGpsTestResult({
        allowed: false,
        reason: 'NO_GEOLOCATION',
        message: 'Este navegador/dispositivo não suporta leitura de GPS (navigator.geolocation).',
        coordsLabel: 'Sem suporte GPS'
      });
      return;
    }
    setIsTestingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const accuracy = Math.round(pos.coords.accuracy || 0);
        executeGpsValidationCall({
          playerId: targetPlayerId,
          lat,
          lng,
          accuracy,
          isLive: true,
          dryRun,
          coordsLabel: `GPS Real (${lat}, ${lng} • ±${accuracy}m)`
        });
      },
      (err) => {
        setIsTestingGps(false);
        setGpsTestResult({
          allowed: false,
          reason: 'GPS_PERMISSION_DENIED',
          message: `⚠️ Não foi possível obter o GPS real do aparelho (${err.message || 'Permissão negada ou sinal indisponível'}). Permita o acesso à localização no navegador ou use os botões de simulação ao lado.`,
          coordsLabel: 'Permissão de GPS pendente'
        });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Sócios ativos disponíveis que ainda não estão na lista de presença
  const activeAvailablePlayers = useMemo(() => {
    return (availablePlayers || []).filter(p => p.status === 'active' && !p.isDM);
  }, [availablePlayers]);

  const selectedTestPlayerObj = useMemo(() => {
    const pid = selectedGpsTestPlayerId || currentPlayer?.id || activeAvailablePlayers[0]?.id;
    const found =
      activeAvailablePlayers.find((p) => p.id === pid) ||
      (allPlayers || []).find((p) => p.id === pid) ||
      currentPlayer ||
      null;
    if (!found) return null;
    return {
      id: found.id,
      name: found.name,
      phone: found.phone
    };
  }, [selectedGpsTestPlayerId, currentPlayer, activeAvailablePlayers, allPlayers]);

  const notYetPresentPlayers = useMemo(() => {
    const presentIds = new Set(attendance.map(a => a.id));
    return activeAvailablePlayers.filter(p => !presentIds.has(p.id));
  }, [activeAvailablePlayers, attendance]);

  /**
   * Ponte Intenção -> Presença:
   * Lista os sócios que confirmaram "VAI" (GOING) na Lista de Quinta mas ainda não deram check-in na quadra,
   * ordenados rigorosamente pelo horário de confirmação na lista de intenção!
   */
  const confirmedPendingCheckIn = useMemo(() => {
    const responses = intentions?.responses || {};
    const checkIsGoing = (p: Player) => {
      if (responses[p.id] === 'GOING') return true;
      if (p.uid && responses[p.uid] === 'GOING') return true;
      if (p.email && responses[p.email.toLowerCase()] === 'GOING') return true;
      const canon = idToCanonicalId?.[p.id];
      if (canon && responses[canon] === 'GOING') return true;
      return false;
    };

    return notYetPresentPlayers
      .filter(checkIsGoing)
      .sort((a, b) => {
        const tA = getPlayerConfirmationTime(a) || 0;
        const tB = getPlayerConfirmationTime(b) || 0;
        return tA - tB;
      });
  }, [notYetPresentPlayers, intentions?.responses, idToCanonicalId, getPlayerConfirmationTime]);

  const handleBatchCheckInConfirmed = async () => {
    if (confirmedPendingCheckIn.length === 0 || isBatchCheckingIn) return;
    setIsBatchCheckingIn(true);
    try {
      for (const p of confirmedPendingCheckIn) {
        await registerAttendance(p);
      }
    } finally {
      setIsBatchCheckingIn(false);
    }
  };

  const filteredRemainingAvailable = useMemo(() => {
    const q = searchAvailable.trim().toLowerCase();
    return notYetPresentPlayers
      .filter(p => !q || (p.name || '').toLowerCase().includes(q))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [notYetPresentPlayers, searchAvailable]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      setStartY(e.touches[0].pageY);
      setIsPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling) return;
    const distance = e.touches[0].pageY - startY;
    if (distance > 0) {
      setPullDistance(Math.min(distance * 0.5, 80));
      if (distance > 10 && e.cancelable) e.preventDefault();
    }
  };

  const handleTouchEnd = async () => {
    if (!isPulling) return;
    if (pullDistance > 60) {
      if (navigator.vibrate) navigator.vibrate(10);
      await refreshPlayers();
    }
    setPullDistance(0);
    setIsPulling(false);
  };

  // Cálculo dos LEDs de IC e Tier Técnico para a Lista de Presença
  const attendanceStats = useMemo(() => {
    const enrichedList = (attendance || []).map(p => {
      const full = availablePlayers.find(ap => ap.id === p.id) || p;
      return { 
        id: p.id, 
        ic: calculateCompositePerformanceRating(full), 
        skills: calculatePracticalSkillsSum(full) 
      };
    });

    const sortedByIc = [...enrichedList].sort((a, b) => b.ic - a.ic);
    const sortedBySkills = [...enrichedList].sort((a, b) => b.skills - a.skills);

    const icMap: Record<string, { color: string; title: string }> = {};
    const techTierMap: Record<string, 'TOP2' | 'TOP4' | 'BOTTOM4' | 'BOTTOM2' | undefined> = {};

    const total = sortedByIc.length;
    sortedByIc.forEach((item, rank) => {
      if (rank <= 1 || item.ic >= 55) {
        icMap[item.id] = { color: 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.9)]', title: `Top IC (#${rank + 1} | IC ${item.ic})` };
      } else if (rank <= Math.floor(total * 0.35) || item.ic >= 42) {
        icMap[item.id] = { color: 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.9)]', title: `Alto IC (#${rank + 1} | IC ${item.ic})` };
      } else if (rank >= total - 2 || item.ic < 18) {
        icMap[item.id] = { color: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)]', title: `Bottom 2 IC (#${rank + 1} | IC ${item.ic})` };
      } else if (rank >= total - 4 || item.ic < 30) {
        icMap[item.id] = { color: 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.9)]', title: `IC Baixo (#${rank + 1} | IC ${item.ic})` };
      } else {
        icMap[item.id] = { color: 'bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.9)]', title: `IC Médio (#${rank + 1} | IC ${item.ic})` };
      }
    });

    if (total >= 4) {
      sortedBySkills.forEach((item, rank) => {
        if (rank === 0 || rank === 1) techTierMap[item.id] = 'TOP2';
        else if (rank === 2 || rank === 3) techTierMap[item.id] = 'TOP4';
        else if (rank === total - 1 || rank === total - 2) techTierMap[item.id] = 'BOTTOM2';
        else if (rank === total - 3 || rank === total - 4) techTierMap[item.id] = 'BOTTOM4';
      });
    }

    return { icMap, techTierMap };
  }, [attendance, availablePlayers]);

  return (
    <div 
      className="relative grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 animate-in fade-in duration-500"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull to Refresh */}
      <div 
        className="absolute top-0 left-0 right-0 flex justify-center pointer-events-none z-50"
        style={{ 
          transform: `translateY(${pullDistance - 40}px)`,
          opacity: pullDistance / 60,
          transition: isPulling ? 'none' : 'transform 0.3s ease, opacity 0.3s ease'
        }}
      >
        <div className="bg-brand-secondary/80 backdrop-blur-xl p-2 rounded-full shadow-2xl border border-brand-primary/40">
          <RotateCcw className={`w-6 h-6 text-brand-primary ${isSyncing ? 'animate-spin' : ''}`} />
        </div>
      </div>

      {(isGameDay || isAdmin) && (
        <>
          {isAdmin && !isGameDay && (
            <div className="lg:col-span-12 bg-brand-primary text-brand-secondary px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-[0.2em] text-center shadow-xl">
              Modo Administrador: Gestão de Presença (Fora do Ciclo)
            </div>
          )}

          {/* COLUNA ESQUERDA: PRESENTES EM QUADRA */}
          <div className="lg:col-span-5 space-y-6">
            <section className="bg-brand-light rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-2xl overflow-hidden">
              <div className="p-6 bg-white/5 border-b border-brand-primary/40 flex items-center justify-between">
                <div>
                  <h2 className="font-black text-white uppercase text-lg tracking-tighter flex items-center gap-2.5">
                    <ClipboardCheck className="w-6 h-6 text-brand-primary" />
                    Na Quadra Agora
                    <HelpTooltip 
                      title="Lista de Presença Oficial" 
                      content="Atletas que já confirmaram presença física na quadra hoje. A ordem #1, #2, #3 define a prioridade na fila."
                    />
                  </h2>
                  <p className="text-[10px] text-brand-primary font-black uppercase tracking-widest mt-1">
                    {attendance.length} Guerreiros Escalados {attendance.length >= 12 ? '• Quorum OK!' : `• Faltam ${12 - attendance.length} p/ 12`}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <Tooltip content="Sincronizar">
                    <button 
                      onClick={async () => {
                        if (refreshPlayers) await refreshPlayers();
                      }} 
                      className="p-2.5 text-white/40 hover:text-brand-primary hover:bg-brand-primary/10 rounded-xl transition-all"
                    >
                      <RotateCcw className={`w-5 h-5 ${isSyncing ? 'animate-spin text-brand-primary' : ''}`} />
                    </button>
                  </Tooltip>
                  <Tooltip content="Relatório de Presença">
                    <button 
                      onClick={() => setViewMode('attendance_report')} 
                      className="p-2.5 text-white/40 hover:text-brand-primary hover:bg-brand-primary/10 rounded-xl transition-all"
                    >
                      <BarChart3 className="w-5 h-5" />
                    </button>
                  </Tooltip>
                  {isAdmin && (
                    <>
                      <Tooltip content="Limpar lista" position="left">
                        <button 
                          onClick={clearAttendance} 
                          disabled={isSyncing}
                          className="p-2.5 rounded-xl text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </Tooltip>
                      <Tooltip content="Finalizar dia" position="left">
                        <button 
                          onClick={resetDailyMatches} 
                          disabled={isSyncing}
                          className="p-2.5 rounded-xl text-white/40 hover:text-brand-primary hover:bg-brand-primary/10 transition-all"
                        >
                          <RotateCcw className="w-5 h-5" />
                        </button>
                      </Tooltip>
                    </>
                  )}
                </div>
              </div>

              <div className="p-3.5 grid grid-cols-2 gap-2.5 max-h-[60vh] lg:max-h-[620px] overflow-y-auto scrollbar-hide">
                {attendance.length === 0 ? (
                  <div className="col-span-full text-center py-20 space-y-4">
                    <Users className="w-16 h-16 text-white/15 mx-auto" />
                    <p className="text-white/40 text-sm font-black uppercase tracking-widest">
                      Nenhum atleta em quadra ainda
                    </p>
                  </div>
                ) : (
                  <AnimatePresence mode="popLayout">
                    {displayedAttendance.map((player, idx) => {
                      const fullPlayer =
                        allPlayers.find(p => p.id === player.id) ||
                        availablePlayers.find(p => p.id === player.id) ||
                        player;
                      const displayName = player.name || fullPlayer?.name || "Sócio";
                      const realIC = Math.round(calculateCompositePerformanceRating(fullPlayer));
                      const generationResult = useStore.getState().generationResult;
                      const isCurrentlyBenched = generationResult?.remainingPlayers?.some((rp: Player) => rp.id === player.id);
                      const displayBenchedCount = (player.consecutiveBenched || 0) + (isCurrentlyBenched ? 1 : 0);
                      
                      const currentTimeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                      const predicted = calculatePredictedMatches(
                        currentTimeStr,
                        SESSION_END_TIME,
                        avgMatchDuration,
                        attendance.length,
                        player.departureTime || undefined,
                        todayMatchesCount,
                        player.arrivalTime || undefined,
                        firstMatchStartTimeStr || SESSION_START_TIME,
                        player.dailyMatches || 0
                      );

                      const hasSpecialSchedule = player.departureTime || player.arrivalTime;

                      return (
                        <motion.div 
                          key={player.id || `attendance-${idx}`} 
                          layout
                          initial={{ opacity: 0, scale: 0.96 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.92 }}
                          className={`flex flex-col p-2.5 rounded-xl border transition-all bg-black/60 ${
                            hasSpecialSchedule ? 'border-brand-primary/60 bg-brand-primary/5' : 'border-white/10'
                          } gap-1.5 relative`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black font-mono text-brand-primary bg-brand-primary/10 px-1.5 py-0.5 rounded">
                              #{(player.arrivalOrder && player.arrivalOrder < 999) ? player.arrivalOrder : idx + 1}º
                            </span>
                            <div className="flex items-center gap-1">
                              {(isAdmin || currentPlayer?.id === player.id) && (
                                <>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingArrival(player.id);
                                      setTempArrivalTime(player.arrivalTime || SESSION_START_TIME);
                                      setEditingDeparture(null);
                                    }}
                                    className={`p-1 rounded-lg transition-all ${player.arrivalTime ? 'text-brand-primary bg-brand-primary/15' : 'text-white/30 hover:text-brand-primary'}`}
                                    title="Horário de Chegada"
                                  >
                                    <Clock className="w-3 h-3 rotate-180" />
                                  </button>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingDeparture(player.id);
                                      setTempDepartureTime(player.departureTime || SESSION_END_TIME);
                                      setEditingArrival(null);
                                    }}
                                    className={`p-1 rounded-lg transition-all ${player.departureTime ? 'text-amber-400 bg-amber-500/15' : 'text-white/30 hover:text-brand-primary'}`}
                                    title="Horário de Saída"
                                  >
                                    <LogOut className="w-3 h-3" />
                                  </button>
                                </>
                              )}
                              {isAdmin && (
                                <button 
                                  onClick={() => removeAttendance(player.id)} 
                                  disabled={isSyncing}
                                  className="p-1 rounded-lg text-white/30 hover:text-rose-400 hover:bg-rose-500/10"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                          
                          <div className="min-w-0">
                            <div className={`text-xs font-black uppercase leading-tight flex items-center gap-1.5 ${player.isOfficialSetter ? 'text-brand-primary' : 'text-white'}`}>
                              <PlayerAvatar player={fullPlayer} size="xs" />
                              <div className="min-w-0 flex items-center flex-wrap gap-1 flex-1">
                                <span className="truncate">{capitalizeName(displayName)}</span>
                                {attendanceStats.icMap[player.id] && (
                                  <span className={`w-2 h-2 rounded-full shrink-0 ${attendanceStats.icMap[player.id].color}`} title={attendanceStats.icMap[player.id].title} />
                                )}
                                {attendanceStats.techTierMap[player.id] && (
                                  <span className="px-1 py-0.2 rounded bg-white/10 text-brand-primary text-[7px] font-black uppercase">
                                    {attendanceStats.techTierMap[player.id]}
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            {editingDeparture === player.id || editingArrival === player.id ? (
                              <div className="flex items-center gap-1 mt-1.5 bg-black p-1.5 rounded-lg border border-brand-primary/40">
                                <input 
                                  type="time"
                                  value={editingDeparture === player.id ? tempDepartureTime : tempArrivalTime}
                                  onChange={(e) => editingDeparture === player.id ? setTempDepartureTime(e.target.value) : setTempArrivalTime(e.target.value)}
                                  className="bg-black border border-brand-primary/40 rounded px-1 py-0.5 text-[10px] text-brand-primary font-black w-20 outline-none"
                                  autoFocus
                                />
                                <button 
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (editingDeparture === player.id && updateDepartureTime) {
                                      await updateDepartureTime(player.id, tempDepartureTime || null);
                                    } else if (editingArrival === player.id && updateArrivalTime) {
                                      await updateArrivalTime(player.id, tempArrivalTime || null);
                                    }
                                    setEditingDeparture(null);
                                    setEditingArrival(null);
                                  }}
                                  className="p-1 bg-brand-primary text-black rounded"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                </button>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingDeparture(null);
                                    setEditingArrival(null);
                                  }}
                                  className="p-1 bg-white/10 text-white rounded"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-1 mt-1.5 flex-wrap">
                                <span className="text-[8px] font-black font-mono text-brand-primary/80 uppercase">
                                  IC {realIC} • {player.dailyMatches || 0}J
                                </span>
                                <div className="flex items-center gap-1">
                                  {displayBenchedCount > 0 && (
                                    <span className="px-1.5 py-0.2 rounded bg-brand-primary text-black text-[7px] font-black">
                                      {displayBenchedCount}B
                                    </span>
                                  )}
                                  {player.departureTime && (
                                    <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[8px] font-black">
                                      ⏰ {player.departureTime}
                                    </span>
                                  )}
                                  {player.checkInMethod === 'NFC' && (
                                    <span title="NFC" className="inline-flex">
                                      <SmartphoneNfc className="w-3 h-3 text-emerald-400" />
                                    </span>
                                  )}
                                  {((player as any).checkInSource === 'WHATSAPP_GPS' ||
                                    (player as any).checkInSource === 'APP_GPS' ||
                                    typeof (player as any).distanceFromCourtMeters === 'number') ? (
                                    <span
                                      title={`Presença validada por GPS (${(player as any).distanceFromCourtMeters ?? 0}m da quadra)`}
                                      className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[7px] font-black uppercase"
                                    >
                                      <MapPin className="w-2.5 h-2.5 text-emerald-400" />
                                      {(player as any).distanceFromCourtMeters ?? 0}m
                                    </span>
                                  ) : (
                                    player.checkInMethod === 'QR' && (
                                      <span title="QR Code" className="inline-flex">
                                        <QrCode className="w-3 h-3 text-blue-400" />
                                      </span>
                                    )
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                )}
              </div>
            </section>
          </div>

          {/* COLUNA DIREITA: VALIDAÇÃO GPS + PONTE 1-TOQUE DOS CONFIRMADOS + DISPONÍVEIS */}
          <div className="lg:col-span-7 space-y-6">
            {/* PAINEL RETRÁTIL DE CHECK-IN E VALIDAÇÃO DE SINAL DE GPS DA QUADRA */}
            {(isAdmin || isAutoGeoEnabled) && (
              <div className="bg-zinc-900/95 rounded-[2rem] border-2 border-brand-primary/40 shadow-2xl overflow-hidden transition-all">
                <button
                  type="button"
                  onClick={() => setIsGpsPanelOpen((prev) => !prev)}
                  aria-expanded={isGpsPanelOpen}
                  className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-left hover:bg-white/[0.03] transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2.5 bg-brand-primary/20 rounded-2xl border border-brand-primary/40 text-brand-primary shrink-0">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm sm:text-base font-black text-white uppercase tracking-tight flex items-center gap-2 flex-wrap">
                        Check-in Presencial via Sinal de GPS
                        <span className="px-2 py-0.5 rounded-full bg-brand-primary/20 border border-brand-primary/40 text-brand-primary text-[9px] font-black uppercase">
                          Cerca Virtual: {savedGeofenceRadius}m
                        </span>
                        {isAdmin && (
                          <span
                            className={`px-2 py-0.5 rounded-full border text-[9px] font-black uppercase ${
                              isAutoGeoEnabled
                                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                                : 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                            }`}
                          >
                            {isAutoGeoEnabled ? 'Ativo para o Clube' : 'Modo Teste Admin'}
                          </span>
                        )}
                      </h3>
                      <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest truncate">
                        {Math.abs(savedCourtLat - DEFAULT_OFFICIAL_COURT_LAT) > 0.00001 ||
                        Math.abs(savedCourtLng - DEFAULT_OFFICIAL_COURT_LNG) > 0.00001
                          ? 'Coordenadas de Teste'
                          : 'Quadra Oficial'}{' '}
                        ({savedCourtLat.toFixed(6)}, {savedCourtLng.toFixed(6)}) • Toque para{' '}
                        {isGpsPanelOpen ? 'recolher' : 'abrir check-in GPS'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-brand-primary text-[10px] font-black uppercase tracking-wider shrink-0">
                    <span className="hidden sm:inline">{isGpsPanelOpen ? 'Recolher' : 'Abrir'}</span>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform duration-300 ${isGpsPanelOpen ? 'rotate-180' : ''}`}
                    />
                  </div>
                </button>

                {/* BARRA FIXA: COMO CHEGAR NA QUADRA (WAZE OU GOOGLE MAPS) */}
                <div className="px-4 sm:px-5 py-2.5 bg-black/50 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10px] font-bold text-white/65 flex items-center gap-1.5">
                    <Navigation className="w-3.5 h-3.5 text-brand-primary" />
                    Como chegar na quadra ({savedCourtLat.toFixed(6)}, {savedCourtLng.toFixed(6)}):
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <a
                      href={`https://waze.com/ul?ll=${savedCourtLat.toFixed(6)},${savedCourtLng.toFixed(6)}&navigate=yes`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-300 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all"
                    >
                      🚗 Abrir no Waze
                    </a>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${savedCourtLat.toFixed(6)},${savedCourtLng.toFixed(6)}&travelmode=driving`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all"
                    >
                      📍 Abrir no Google Maps
                    </a>
                  </div>
                </div>

                <AnimatePresence initial={false}>
                  {isGpsPanelOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 sm:px-6 pb-5 sm:pb-6 pt-2 border-t border-white/10 space-y-4">
                        {currentPlayer && !isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleRealDeviceGpsCheckIn(currentPlayer.id, false)}
                            disabled={isTestingGps}
                            className="w-full px-4 py-3 bg-brand-primary hover:bg-brand-primary/90 text-black font-black text-[11px] uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 cursor-pointer"
                          >
                            <Navigation className="w-4 h-4" />
                            {isTestingGps ? 'Validando GPS...' : 'Confirmar Minha Presença via GPS'}
                          </button>
                        )}

                        {isAdmin && (
                          <div className="space-y-4">
                            {/* CONTROLE ADMIN: HABILITAR / DESABILITAR FUNÇÃO PARA O CLUBE */}
                            <div
                              className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                isAutoGeoEnabled
                                  ? 'bg-emerald-950/35 border-emerald-500/40'
                                  : 'bg-amber-950/30 border-amber-500/40'
                              }`}
                            >
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <Power
                                    className={`w-4 h-4 shrink-0 ${
                                      isAutoGeoEnabled ? 'text-emerald-400' : 'text-amber-400'
                                    }`}
                                  />
                                  <span className="text-xs font-black text-white uppercase tracking-tight">
                                    Check-in Automático GPS para Sócios
                                  </span>
                                </div>
                                <p className="text-[10px] font-bold text-white/65 leading-snug">
                                  {isAutoGeoEnabled
                                    ? 'HABILITADO: Monitoramento de quinta (19h–22h), avisos no WhatsApp e painel GPS visíveis para os sócios.'
                                    : 'DESATIVADO (Modo Teste): Apenas administradores veem este painel; envios de quinta 19h/20h45 e GPS automático dos sócios ficam pausados.'}
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={handleToggleAutoGeoEnabled}
                                disabled={isSavingGeoConfig}
                                className={`px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50 ${
                                  isAutoGeoEnabled
                                    ? 'bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/50 text-rose-300'
                                    : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg'
                                }`}
                              >
                                <Power className="w-3.5 h-3.5" />
                                {isSavingGeoConfig
                                  ? 'Salvando...'
                                  : isAutoGeoEnabled
                                  ? 'Desativar Função'
                                  : 'Habilitar para o Grupo'}
                              </button>
                            </div>

                            {/* CONTROLE ADMIN: COORDENADAS DA QUADRA E RAIO (TESTE OU OFICIAL) */}
                            <div className="p-3.5 rounded-2xl bg-black/50 border border-white/10 space-y-3">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div>
                                  <h4 className="text-[11px] font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                                    <Crosshair className="w-3.5 h-3.5 text-brand-primary" />
                                    Coordenadas da Quadra e Raio (Teste / Oficial)
                                  </h4>
                                  <p className="text-[9px] font-bold text-white/50 mt-0.5">
                                    Cole &quot;lat, lng&quot; do Google Maps no campo Latitude ou capture sua posição atual para testar de casa.
                                  </p>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                <div>
                                  <label className="block text-[9px] font-black text-white/50 uppercase tracking-widest mb-1">
                                    Latitude
                                  </label>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={courtLatInput}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      const pairMatch = val.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]+\s*(-?\d+(?:\.\d+)?)\s*$/);
                                      if (pairMatch) {
                                        setCourtLatInput(pairMatch[1]);
                                        setCourtLngInput(pairMatch[2]);
                                      } else {
                                        setCourtLatInput(val);
                                      }
                                    }}
                                    placeholder="-8.131550"
                                    className="w-full bg-zinc-950 border border-white/15 focus:border-brand-primary rounded-xl px-3 py-2 text-xs font-mono font-bold text-white outline-none"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[9px] font-black text-white/50 uppercase tracking-widest mb-1">
                                    Longitude
                                  </label>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={courtLngInput}
                                    onChange={(e) => setCourtLngInput(e.target.value)}
                                    placeholder="-34.907333"
                                    className="w-full bg-zinc-950 border border-white/15 focus:border-brand-primary rounded-xl px-3 py-2 text-xs font-mono font-bold text-white outline-none"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[9px] font-black text-white/50 uppercase tracking-widest mb-1">
                                    Raio Permitido (m)
                                  </label>
                                  <input
                                    type="number"
                                    min={20}
                                    max={2000}
                                    value={geofenceRadiusInput}
                                    onChange={(e) => setGeofenceRadiusInput(e.target.value)}
                                    placeholder="150"
                                    className="w-full bg-zinc-950 border border-white/15 focus:border-brand-primary rounded-xl px-3 py-2 text-xs font-mono font-bold text-white outline-none"
                                  />
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={handleSaveCourtCoords}
                                  disabled={isSavingGeoConfig}
                                  className="px-3.5 py-2 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-black font-black text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                                >
                                  <Save className="w-3.5 h-3.5" />
                                  {isSavingGeoConfig ? 'Salvando...' : 'Salvar Coordenadas'}
                                </button>

                                <button
                                  type="button"
                                  onClick={handleCaptureCurrentPositionAsCourt}
                                  disabled={isCapturingMyCoords || isSavingGeoConfig}
                                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-black text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                                >
                                  <Crosshair className="w-3.5 h-3.5 text-brand-primary" />
                                  {isCapturingMyCoords ? 'Capturando GPS...' : 'Usar Minha Posição Atual (Teste)'}
                                </button>

                                <button
                                  type="button"
                                  onClick={handleRestoreOfficialCourtCoords}
                                  disabled={isSavingGeoConfig}
                                  className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-white/80 font-black text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  Restaurar Quadra Oficial
                                </button>
                              </div>

                              <CourtGeofenceMap
                                lat={previewCourtLat}
                                lng={previewCourtLng}
                                radiusMeters={previewGeofenceRadius}
                                isUnsavedDraft={hasUnsavedGeoDraft}
                                onSelectCoords={(newLat, newLng) => {
                                  setCourtLatInput(String(newLat));
                                  setCourtLngInput(String(newLng));
                                }}
                                onChangeRadius={(newRadius) => {
                                  setGeofenceRadiusInput(String(newRadius));
                                }}
                                testPoint={
                                  journeyMapPoint ||
                                  (gpsTestResult &&
                                  typeof gpsTestResult.testedLat === 'number' &&
                                  typeof gpsTestResult.testedLng === 'number'
                                    ? {
                                        lat: gpsTestResult.testedLat,
                                        lng: gpsTestResult.testedLng,
                                        allowed: gpsTestResult.allowed,
                                        distanceMeters: gpsTestResult.distanceMeters,
                                        label: gpsTestResult.coordsLabel
                                      }
                                    : null)
                                }
                                trailPoints={journeyTrailPoints}
                                activeWatchers={
                                  simulatedGeoWatchers.length > 0 ? simulatedGeoWatchers : liveGeoWatchers
                                }
                              />
                            </div>

                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                              <div className="flex-1">
                                <label className="block text-[9px] font-black text-white/50 uppercase tracking-widest mb-1">
                                  Sócio para Testar / Validar Presença GPS:
                                </label>
                                <select
                                  value={selectedGpsTestPlayerId || currentPlayer?.id || activeAvailablePlayers[0]?.id || ''}
                                  onChange={(e) => setSelectedGpsTestPlayerId(e.target.value)}
                                  className="w-full bg-black/70 border border-brand-primary/40 rounded-xl px-3 py-2 text-xs font-black text-white uppercase outline-none focus:border-brand-primary"
                                >
                                  {activeAvailablePlayers.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {capitalizeName(p.name)} {attendance.some((a) => a.id === p.id) ? '(Já em Quadra)' : ''}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="flex flex-col justify-end">
                                <label className="block text-[9px] font-black text-white/50 uppercase tracking-widest mb-1">
                                  Modo do Teste:
                                </label>
                                <div className="flex items-center bg-black/70 p-1 rounded-xl border border-white/10">
                                  <button
                                    type="button"
                                    onClick={() => setGpsDryRunMode(false)}
                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                      !gpsDryRunMode
                                        ? 'bg-emerald-500 text-black'
                                        : 'text-white/50 hover:text-white'
                                    }`}
                                  >
                                    Gravar na Lista
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setGpsDryRunMode(true)}
                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                      gpsDryRunMode
                                        ? 'bg-brand-primary text-black'
                                        : 'text-white/50 hover:text-white'
                                    }`}
                                  >
                                    Só Simular
                                  </button>
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                              <button
                                type="button"
                                disabled={isTestingGps}
                                onClick={() => {
                                  const pid = selectedGpsTestPlayerId || currentPlayer?.id || activeAvailablePlayers[0]?.id;
                                  if (pid) handleRealDeviceGpsCheckIn(pid, gpsDryRunMode);
                                }}
                                className="p-2.5 rounded-xl bg-brand-primary/15 hover:bg-brand-primary/25 border border-brand-primary/40 text-left transition-all cursor-pointer disabled:opacity-50"
                              >
                                <div className="flex items-center gap-1.5 text-brand-primary font-black text-[10px] uppercase">
                                  <Navigation className="w-3.5 h-3.5 shrink-0" />
                                  1. Meu GPS Real Agora
                                </div>
                                <p className="text-[9px] text-white/60 font-bold mt-0.5">
                                  Compara seu GPS atual com a quadra salva acima
                                </p>
                              </button>

                              <button
                                type="button"
                                disabled={isTestingGps}
                                onClick={() => {
                                  const pid = selectedGpsTestPlayerId || currentPlayer?.id || activeAvailablePlayers[0]?.id;
                                  if (!pid) return;
                                  const nearLat = Number((savedCourtLat + 0.00008).toFixed(6));
                                  const nearLng = Number((savedCourtLng + 0.00007).toFixed(6));
                                  executeGpsValidationCall({
                                    playerId: pid,
                                    lat: nearLat,
                                    lng: nearLng,
                                    isLive: true,
                                    dryRun: gpsDryRunMode,
                                    coordsLabel: `Simulação Na Quadra (${nearLat}, ${nearLng})`
                                  });
                                }}
                                className="p-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-left transition-all cursor-pointer disabled:opacity-50"
                              >
                                <div className="flex items-center gap-1.5 text-emerald-400 font-black text-[10px] uppercase">
                                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                  2. Simular: Na Quadra (~12m)
                                </div>
                                <p className="text-[9px] text-white/60 font-bold mt-0.5">
                                  Ponto simulado a 12m da quadra salva (Aprova)
                                </p>
                              </button>

                              <button
                                type="button"
                                disabled={isTestingGps}
                                onClick={() => {
                                  const pid = selectedGpsTestPlayerId || currentPlayer?.id || activeAvailablePlayers[0]?.id;
                                  if (!pid) return;
                                  const farLat = Number((savedCourtLat + 0.012031).toFixed(6));
                                  const farLng = Number((savedCourtLng + 0.005223).toFixed(6));
                                  executeGpsValidationCall({
                                    playerId: pid,
                                    lat: farLat,
                                    lng: farLng,
                                    isLive: true,
                                    dryRun: gpsDryRunMode,
                                    coordsLabel: `Simulação Fora da Quadra (${farLat}, ${farLng})`
                                  });
                                }}
                                className="p-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-left transition-all cursor-pointer disabled:opacity-50"
                              >
                                <div className="flex items-center gap-1.5 text-amber-400 font-black text-[10px] uppercase">
                                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                                  3. Simular: Longe (+1.450m)
                                </div>
                                <p className="text-[9px] text-white/60 font-bold mt-0.5">
                                  Ponto simulado a 1.450m fora da quadra salva
                                </p>
                              </button>

                              <button
                                type="button"
                                disabled={isTestingGps}
                                onClick={() => {
                                  const pid = selectedGpsTestPlayerId || currentPlayer?.id || activeAvailablePlayers[0]?.id;
                                  if (!pid) return;
                                  executeGpsValidationCall({
                                    playerId: pid,
                                    lat: savedCourtLat,
                                    lng: savedCourtLng,
                                    name: 'Quadra de Vôlei Boa Viagem',
                                    address: 'Av. Boa Viagem, Recife - PE',
                                    isLive: false,
                                    dryRun: gpsDryRunMode,
                                    coordsLabel: 'Simulação Busca no Mapa (Anti-Fraude)'
                                  });
                                }}
                                className="p-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-left transition-all cursor-pointer disabled:opacity-50"
                              >
                                <div className="flex items-center gap-1.5 text-rose-400 font-black text-[10px] uppercase">
                                  <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                                  4. Simular: Local Pesquisado
                                </div>
                                <p className="text-[9px] text-white/60 font-bold mt-0.5">
                                  Endereço digitado na busca (Bloqueia)
                                </p>
                              </button>
                            </div>

                            <GeoJourneySimulator
                              player={selectedTestPlayerObj}
                              userEmail={user?.email || currentPlayer?.email || ''}
                              courtLat={savedCourtLat}
                              courtLng={savedCourtLng}
                              geofenceRadius={savedGeofenceRadius}
                              dryRun={gpsDryRunMode}
                              onUpdateMapState={(pt, trail) => {
                                setJourneyMapPoint(pt);
                                setJourneyTrailPoints(trail);
                              }}
                              onUpdateActiveWatchers={(watchers) => {
                                setSimulatedGeoWatchers(watchers);
                              }}
                              onAttendanceMutated={refreshPlayers}
                            />
                          </div>
                        )}

                        {gpsTestResult && (
                          <div
                            className={`p-4 rounded-2xl border ${
                              gpsTestResult.allowed
                                ? 'bg-emerald-950/40 border-emerald-500/50'
                                : 'bg-rose-950/40 border-rose-500/50'
                            } space-y-2`}
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                                    gpsTestResult.allowed
                                      ? 'bg-emerald-500 text-black'
                                      : 'bg-rose-500 text-white'
                                  }`}
                                >
                                  {gpsTestResult.allowed ? '✅ SINAL GPS APROVADO' : '🚫 SINAL GPS RECUSADO'}
                                </span>
                                {gpsTestResult.dryRun && (
                                  <span className="px-2 py-0.5 rounded-full bg-brand-primary/20 text-brand-primary border border-brand-primary/40 text-[9px] font-black uppercase">
                                    Modo Simulação (Não gravou)
                                  </span>
                                )}
                                {typeof gpsTestResult.distanceMeters === 'number' && (
                                  <span className="text-[10px] font-mono font-black text-white/80">
                                    📏 Distância: {gpsTestResult.distanceMeters}m / Limite: {gpsTestResult.maxRadius || savedGeofenceRadius}m
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => setGpsTestResult(null)}
                                className="text-white/40 hover:text-white text-xs font-black uppercase"
                              >
                                Fechar
                              </button>
                            </div>

                            <div className="space-y-0.5 text-[10px] font-mono text-white/60">
                              {gpsTestResult.coordsLabel && (
                                <p>📍 Origem testada: {gpsTestResult.coordsLabel}</p>
                              )}
                              {gpsTestResult.courtLocation && (
                                <p>
                                  🏟️ Quadra alvo no servidor: ({gpsTestResult.courtLocation.lat.toFixed(6)},{' '}
                                  {gpsTestResult.courtLocation.lng.toFixed(6)})
                                </p>
                              )}
                            </div>

                            {typeof gpsTestResult.accuracyMeters === 'number' && gpsTestResult.accuracyMeters > 150 && (
                              <p className="text-[10px] font-bold text-amber-300 bg-amber-950/50 border border-amber-500/40 rounded-xl px-3 py-2">
                                ⚠️ Atenção: seu navegador informou baixa precisão de localização (±{gpsTestResult.accuracyMeters}m), comum em computador/Wi-Fi sem chip GPS. Para testar com precisão real, use no celular com o GPS ligado.
                              </p>
                            )}

                            <pre className="whitespace-pre-wrap font-sans text-xs text-white/90 bg-black/50 p-3 rounded-xl border border-white/10 leading-relaxed">
                              {gpsTestResult.message}
                            </pre>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
            {/* FAIXA DESTACADA: CONFIRMADOS NA LISTA DE QUINTA (FALTAM CHEGAR) */}
            {isAdmin && confirmedPendingCheckIn.length > 0 && (
              <div className="bg-zinc-900/95 p-6 rounded-[2.5rem] border-2 border-emerald-500/40 shadow-2xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-emerald-500/20 rounded-2xl border border-emerald-500/40 text-emerald-400">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                        Confirmados na Lista de Quinta
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-black text-[10px] font-black">
                          {confirmedPendingCheckIn.length} faltam chegar
                        </span>
                      </h3>
                      <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest">
                        Ordenados pelo horário de confirmação • Toque em 1 clique conforme chegarem na quadra
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleBatchCheckInConfirmed}
                    disabled={isBatchCheckingIn}
                    className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[10px] uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-lg shrink-0 disabled:opacity-50 cursor-pointer"
                  >
                    <UserCheck className="w-4 h-4" />
                    {isBatchCheckingIn ? 'Convocando...' : `Convocar Todos (${confirmedPendingCheckIn.length})`}
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {confirmedPendingCheckIn.map((player, idx) => (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => handleRegisterPlayer(player)}
                      disabled={addingPlayerId === player.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-black/70 border border-emerald-500/30 hover:border-emerald-400 text-left transition-all active:scale-95 group cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-1">
                        <PlayerAvatar player={player} size="xs" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-[9px] font-mono font-black text-emerald-400 shrink-0">
                              {idx + 1}º
                            </span>
                            <p className="text-xs font-black text-white uppercase truncate">
                              {capitalizeName(player.name)}
                            </p>
                          </div>
                          <span className="text-[8px] font-bold text-white/40 uppercase">
                            {player.isOfficialSetter ? 'Levantador (L)' : `IC ${Math.round(calculateCompositePerformanceRating(player))}`}
                          </span>
                        </div>
                      </div>
                      <span className="p-1.5 bg-emerald-500/20 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-black rounded-lg transition-all shrink-0">
                        <Plus className="w-3.5 h-3.5" />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* TODOS OS GUERREIROS DISPONÍVEIS */}
            <div className="bg-brand-light backdrop-blur-xl p-6 sm:p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-2xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-black text-white uppercase tracking-tighter">
                    Todos os Sócios Disponíveis
                  </h3>
                  <p className="text-[10px] font-black text-brand-primary uppercase tracking-widest">
                    {notYetPresentPlayers.length} sócios ativos fora de quadra
                  </p>
                </div>

                {isAdmin && (
                  <div className="relative w-full sm:w-56">
                    <Search className="w-3.5 h-3.5 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Buscar sócio..."
                      value={searchAvailable}
                      onChange={(e) => setSearchAvailable(e.target.value)}
                      className="w-full bg-black/50 border border-brand-primary/40 rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-white outline-none focus:border-brand-primary"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-3.5">
                {!isAdmin ? (
                  <div className="col-span-full py-16 text-center bg-white/5 rounded-3xl border border-dashed border-brand-primary/40 space-y-3">
                    <Users className="w-12 h-12 text-white/20 mx-auto" />
                    <p className="text-white/50 text-xs font-black uppercase tracking-widest">
                      Use o QR Code ou Tag NFC da quadra para registrar presença
                    </p>
                  </div>
                ) : filteredRemainingAvailable.length === 0 ? (
                  <div className="col-span-full py-16 text-center space-y-3">
                    <CheckCircle2 className="w-12 h-12 text-brand-primary/30 mx-auto" />
                    <p className="text-white/50 text-sm font-black uppercase">
                      {searchAvailable ? 'Nenhum sócio encontrado na busca' : 'Todos os guerreiros ativos já estão em quadra!'}
                    </p>
                  </div>
                ) : (
                  filteredRemainingAvailable.map((player) => (
                    <button 
                      key={player.id} 
                      onClick={() => handleRegisterPlayer(player)} 
                      disabled={addingPlayerId === player.id}
                      className={`flex items-center justify-between p-2.5 rounded-xl border transition-all text-left group bg-black/50 border-white/10 hover:border-brand-primary/50 cursor-pointer active:scale-95 ${
                        addingPlayerId === player.id ? 'opacity-50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-1">
                        <PlayerAvatar player={player} size="xs" />
                        <div className="min-w-0">
                          <p className={`text-xs font-black uppercase truncate ${player.isOfficialSetter ? 'text-brand-primary' : 'text-white'}`}>
                            {capitalizeName(player.name || "Sócio")}
                          </p>
                          <span className="text-[8px] font-bold text-white/40 uppercase">
                            {player.isOfficialSetter ? 'Levantador (L)' : `IC ${Math.round(calculateCompositePerformanceRating(player))}`}
                          </span>
                        </div>
                      </div>
                      <span className="p-1.5 bg-brand-primary/10 text-brand-primary group-hover:bg-brand-primary group-hover:text-black rounded-lg transition-all border border-brand-primary/30 shrink-0">
                        <Plus className="w-3.5 h-3.5" />
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {!isGameDay && !isAdmin && (
        <div className="lg:col-span-12 py-32 text-center space-y-8">
          <Calendar className="w-28 h-28 text-brand-primary mx-auto" />
          <div className="space-y-4">
            <h2 className="text-4xl sm:text-6xl font-black text-white tracking-tighter uppercase">
              Descanso dos Guerreiros
            </h2>
            <p className="text-sm sm:text-lg text-white/60 font-black uppercase tracking-widest max-w-xl mx-auto">
              As partidas acontecem às <span className="text-brand-primary">quintas-feiras</span>. Confirme seu nome na aba Lista de Quinta!
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
