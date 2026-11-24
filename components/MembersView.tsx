import { useShallow } from 'zustand/react/shallow';
import React from 'react';
import { useStore } from '../store';
import { Player, Gender } from '../types';
import { PlayerAvatar } from '../src/components/PlayerAvatar';
import { translateGender, capitalizeName, formatPhoneNumber } from '../utils/helpers';
import { getPlayerTier } from '../utils/tierUtils';
import { Tooltip } from '../src/components/Tooltip';
import { 
  Trash2, 
  UserPlus, 
  Edit2,
  RotateCcw,
  Cake,
  Zap,
  Star,
  Shield,
  UserCheck,
  UserX,
  Target,
  Search,
  TrendingDown,
  TrendingUp,
  Minus,
  Trophy,
  AlertTriangle,
  Clock,
  Phone,
  MessageCircle,
  Camera,
  X,
  History,
  Link2,
  Upload,
  Send
} from 'lucide-react';
import { EvasionIcon } from './EvasionIcon';
import { calculateEvasionLevel } from '../utils/evasion';
import { calculateTrueSkillUpdate } from '../src/utils/trueSkill';
import { calculateCompositePerformanceRating } from '../utils/teamLogic';
import { getFirestoreDateKey, db, doc, setDoc } from '../firebase';
import { useIntentions } from '../src/hooks/useIntentions';
import { useBirthdays } from '../src/hooks/useBirthdays';
import {
  autoNormalizeBrazilianPhone,
  WhatsAppPhotoDirectory,
  loadLocalWhatsAppPhotoDirectory,
  syncWhatsAppPhotoDirectory,
  resolveEffectivePlayerPhoto,
  enrichPlayersWithWhatsAppPhotos,
  compressImageFileToDataUri,
  associatePhotoWithWhatsAppPhone,
  findPhotoBindingByPhone
} from '../src/services/whatsappPhotoIntegration';

interface MembersViewProps {
  clearAllPlayers: () => void;
  deletePlayer: (id: string) => void;
  setEditingPlayer: (player: Player | null) => void;
  setIsFormOpen: (open: boolean) => void;
  refreshPlayers: () => Promise<void>;
  repairDatabase?: () => void;
  savePlayer: (player: any) => Promise<void>;
}

export const MembersView: React.FC<MembersViewProps> = ({
  clearAllPlayers,
  deletePlayer,
  setEditingPlayer,
  setIsFormOpen,
  refreshPlayers,
  repairDatabase,
  savePlayer
}) => {
  const { players, userRole, currentPlayer, isSyncing, showConfirmModal, matches, attendance, systemMetadata } = useStore(useShallow(state => ({players: state.players, userRole: state.userRole, currentPlayer: state.currentPlayer, isSyncing: state.isSyncing, showConfirmModal: state.showConfirmModal, matches: state.matches, attendance: state.attendance, systemMetadata: state.systemMetadata})));
  const { intentions } = useIntentions();
  const showNotification = useStore(state => state.showNotification);
  const [sendingWelcomeId, setSendingWelcomeId] = React.useState<string | null>(null);
  const [isSyncingPhotos, setIsSyncingPhotos] = React.useState(false);
  const [waPhotoDir, setWaPhotoDir] = React.useState<WhatsAppPhotoDirectory>(() =>
    loadLocalWhatsAppPhotoDirectory()
  );
  const [photoLinkModalPlayer, setPhotoLinkModalPlayer] = React.useState<Player | null>(null);
  const [linkPhoneInput, setLinkPhoneInput] = React.useState('');
  const [linkPhotoPreview, setLinkPhotoPreview] = React.useState<string | null>(null);
  const [isSavingPhotoLink, setIsSavingPhotoLink] = React.useState(false);
  const [showBatchPhotoModal, setShowBatchPhotoModal] = React.useState(false);
  const [batchPhotoItems, setBatchPhotoItems] = React.useState<
    Array<{ id: string; fileName: string; dataUri: string; matchedPlayerId: string }>
  >([]);
  const [isSavingBatchPhotos, setIsSavingBatchPhotos] = React.useState(false);

  const matchFilenameToPlayerId = (fileName: string): string => {
    const base = fileName.replace(/\.[^/.]+$/, '');
    const norm = (s: string) =>
      String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    const cleanBase = norm(base);
    const digits = base.replace(/\D/g, '');

    if (digits.length >= 8) {
      const byPhone = players.find((p) => {
        const pDigits = String(p.phone || '').replace(/\D/g, '');
        return pDigits.length >= 8 && pDigits.slice(-8) === digits.slice(-8);
      });
      if (byPhone) return byPhone.id;
    }

    if (!cleanBase) return '';
    const exact = players.find((p) => norm(p.name) === cleanBase);
    if (exact) return exact.id;

    const firstToken = cleanBase.split(' ')[0];
    if (firstToken && firstToken.length >= 2) {
      const byFirst = players.find((p) => norm(p.name).split(' ')[0] === firstToken);
      if (byFirst) return byFirst.id;
    }

    const partial = players.find(
      (p) => norm(p.name).includes(cleanBase) || cleanBase.includes(norm(p.name))
    );
    return partial ? partial.id : '';
  };

  const handleBatchFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const processed: Array<{ id: string; fileName: string; dataUri: string; matchedPlayerId: string }> = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const dataUri = await compressImageFileToDataUri(file, 300, 0.8);
        processed.push({
          id: `${Date.now()}_${i}`,
          fileName: file.name,
          dataUri,
          matchedPlayerId: matchFilenameToPlayerId(file.name)
        });
      } catch {}
    }
    setBatchPhotoItems((prev) => [...prev, ...processed]);
    e.target.value = '';
  };

  const handleSaveAllBatchPhotos = async () => {
    const validItems = batchPhotoItems.filter((item) => item.matchedPlayerId && item.dataUri);
    if (validItems.length === 0) {
      showNotification?.('Associe pelo menos uma foto a um sócio antes de salvar.', 'info');
      return;
    }
    setIsSavingBatchPhotos(true);
    let savedCount = 0;
    try {
      const updatedPlayersList = [...(useStore.getState().players || players)];
      for (const item of validItems) {
        const target = updatedPlayersList.find((p) => p.id === item.matchedPlayerId);
        if (!target) continue;
        const cleanPhone = autoNormalizeBrazilianPhone(target.phone || '');
        if (cleanPhone) {
          await associatePhotoWithWhatsAppPhone({
            playerId: target.id,
            playerName: target.name,
            phone: cleanPhone,
            photoUrl: item.dataUri,
            source: 'manual_upload'
          });
        } else {
          await fetch('/api/whatsapp/push-member-photo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              playerId: target.id,
              playerName: target.name,
              photoUrl: item.dataUri,
              source: 'batch_upload'
            })
          }).catch(() => {});
        }
        await setDoc(
          doc(db, 'players', target.id),
          {
            photoUrl: item.dataUri,
            whatsappPhotoUrl: item.dataUri,
            photoUpdatedAt: Date.now()
          },
          { merge: true }
        ).catch(() => {});

        const idx = updatedPlayersList.findIndex((p) => p.id === target.id);
        if (idx !== -1) {
          updatedPlayersList[idx] = {
            ...updatedPlayersList[idx],
            photoUrl: item.dataUri,
            whatsappPhotoUrl: item.dataUri
          };
        }
        savedCount++;
      }
      useStore.setState({ players: updatedPlayersList });
      const freshDir = await syncWhatsAppPhotoDirectory().catch(() => loadLocalWhatsAppPhotoDirectory());
      setWaPhotoDir(freshDir);
      showNotification?.(`${savedCount} foto(s) salva(s) permanentemente no cadastro!`, 'success');
      setBatchPhotoItems([]);
      setShowBatchPhotoModal(false);
    } catch (err: any) {
      showNotification?.('Erro ao salvar lote de fotos: ' + (err?.message || ''), 'error');
    } finally {
      setIsSavingBatchPhotos(false);
    }
  };
  const [waBotEnabled, setWaBotEnabled] = React.useState<boolean>(true);
  const [isTogglingWaBot, setIsTogglingWaBot] = React.useState(false);

  React.useEffect(() => {
    fetch(`/api/whatsapp/bot-status?t=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
    })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d && typeof (d.enabled ?? d.botActive) === 'boolean') {
          setWaBotEnabled(Boolean(d.enabled ?? d.botActive));
        }
      })
      .catch(() => {});
  }, []);

  const handleToggleWaBot = async () => {
    if (isTogglingWaBot) return;
    setIsTogglingWaBot(true);
    const nextEnabled = !waBotEnabled;
    try {
      const resp = await fetch('/api/whatsapp/bot-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextEnabled })
      });
      if (resp.ok) {
        const data = await resp.json();
        const actual = typeof (data.enabled ?? data.botActive) === 'boolean' ? Boolean(data.enabled ?? data.botActive) : nextEnabled;
        setWaBotEnabled(actual);
        showNotification?.(
          actual ? 'Robô Guerreirinho (WhatsApp) HABILITADO!' : 'Robô Guerreirinho (WhatsApp) DESABILITADO!',
          actual ? 'success' : 'info'
        );
      } else {
        setWaBotEnabled(nextEnabled);
        showNotification?.(
          nextEnabled ? 'Robô WhatsApp habilitado.' : 'Robô WhatsApp desabilitado.',
          'success'
        );
      }
    } catch {
      setWaBotEnabled(nextEnabled);
    } finally {
      setIsTogglingWaBot(false);
    }
  };
  const [isSendingBirthday, setIsSendingBirthday] = React.useState(false);
  const autoBirthdayCheckedRef = React.useRef<string>('');

  // Carrega e sincroniza o diretório Foto <-> Telefone WhatsApp ao abrir a tela
  React.useEffect(() => {
    syncWhatsAppPhotoDirectory()
      .then((dir) => {
        setWaPhotoDir(dir);
        const current = useStore.getState().players || [];
        if (current.length > 0) {
          const enriched = enrichPlayersWithWhatsAppPhotos(current, dir);
          const changed = enriched.some((ep, idx) => ep.photoUrl !== current[idx]?.photoUrl);
          if (changed) {
            useStore.setState({ players: enriched });
          }
        }
      })
      .catch(() => {});
  }, []);

  const openPhotoLinkModal = (targetPlayer: Player) => {
    setPhotoLinkModalPlayer(targetPlayer);
    setLinkPhoneInput(targetPlayer.phone || '');
    const existingResolved = resolveEffectivePlayerPhoto(targetPlayer as any, waPhotoDir);
    setLinkPhotoPreview(existingResolved || null);
  };

  const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressedDataUri = await compressImageFileToDataUri(file, 256, 0.84);
      setLinkPhotoPreview(compressedDataUri);
    } catch (err) {
      showNotification?.('Não foi possível processar esta imagem. Tente outra foto.', 'error');
    }
  };

  const handleSaveWhatsAppPhotoBinding = async () => {
    if (!photoLinkModalPlayer || isSavingPhotoLink) return;
    if (!linkPhoneInput.trim()) {
      showNotification?.('Informe o número de telefone do WhatsApp do sócio.', 'error');
      return;
    }
    setIsSavingPhotoLink(true);
    try {
      const result = await associatePhotoWithWhatsAppPhone({
        playerId: photoLinkModalPlayer.id,
        playerName: photoLinkModalPlayer.name,
        phone: linkPhoneInput,
        photoUrl: linkPhotoPreview,
        source: 'manual_upload'
      });
      setWaPhotoDir(result.directory);
      await refreshPlayers();
      showNotification?.(
        result.photoUrl
          ? `Foto associada ao WhatsApp (${formatPhoneNumber(result.normalizedPhone)}) de ${capitalizeName(photoLinkModalPlayer.name)}!`
          : `WhatsApp (${formatPhoneNumber(result.normalizedPhone)}) vinculado ao cadastro de ${capitalizeName(photoLinkModalPlayer.name)}!`,
        'success'
      );
      setPhotoLinkModalPlayer(null);
    } catch (err: any) {
      showNotification?.(err?.message || 'Erro ao vincular foto ao WhatsApp.', 'error');
    } finally {
      setIsSavingPhotoLink(false);
    }
  };

  // Disparo automático de aniversário a partir das 08:00 da manhã (grupo + privado do sócio)
  React.useEffect(() => {
    if (!players || players.length === 0) return;
    const todayKey = getFirestoreDateKey();
    const [currentYearStr, currentMonthStr, currentDayStr] = todayKey.split('-');
    const brHourStr = new Date().toLocaleTimeString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      hour12: false
    });
    const brHour = Number(brHourStr) % 24;
    if (brHour < 8) return; // Aguarda até as 08:00 da manhã

    const todayUnsent = players.filter((p) => {
      if (!p || (p.status && p.status !== 'active') || !p.birthDate) return false;
      const parts = p.birthDate.trim().split('T')[0].split(/[-/]/);
      if (parts.length < 3) return false;
      const d = (parts[0].length === 4 ? parts[2] : parts[0]).padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      const isToday = d === currentDayStr && m === currentMonthStr;
      const alreadySent = String(p.lastBirthdaySentYear || '') === currentYearStr;
      return isToday && !alreadySent;
    });

    if (todayUnsent.length === 0) return;
    const guardKey = `${todayKey}_${todayUnsent.map((p) => p.id).join(',')}`;
    if (autoBirthdayCheckedRef.current === guardKey) return;
    autoBirthdayCheckedRef.current = guardKey;

    (async () => {
      for (const bPlayer of todayUnsent) {
        try {
          const resp = await fetch('/api/whatsapp/send-birthday', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerId: bPlayer.id, player: bPlayer })
          });
          if (resp.ok) {
            await setDoc(
              doc(db, 'players', bPlayer.id),
              {
                lastBirthdaySentYear: currentYearStr,
                lastBirthdaySentDate: todayKey,
                lastBirthdaySentAt: Date.now()
              },
              { merge: true }
            ).catch(() => {});
          }
        } catch {}
      }
      await refreshPlayers();
    })();
  }, [players, refreshPlayers]);

  const handleSendTodayBirthday = async (bPlayer: Player, forceResend = false) => {
    if (isSendingBirthday) return;
    setIsSendingBirthday(true);
    try {
      const todayKey = getFirestoreDateKey();
      const currentYearStr = todayKey.split('-')[0];
      const resp = await fetch('/api/whatsapp/send-birthday', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: bPlayer.id,
          player: bPlayer,
          forceResend
        })
      });
      if (resp.ok) {
        await setDoc(
          doc(db, 'players', bPlayer.id),
          {
            lastBirthdaySentYear: currentYearStr,
            lastBirthdaySentDate: todayKey,
            lastBirthdaySentAt: Date.now()
          },
          { merge: true }
        ).catch(() => {});
        await refreshPlayers();
        showNotification?.(
          `Mensagem de aniversário com IA enviada para o grupo e privado de ${capitalizeName(bPlayer.name)}!`,
          'success'
        );
      } else {
        showNotification?.('Não foi possível enviar a mensagem de aniversário agora.', 'error');
      }
    } catch {
      showNotification?.('Erro ao disparar mensagem de aniversário.', 'error');
    } finally {
      setIsSendingBirthday(false);
    }
  };

  // Sincroniza automaticamente Sócios, Partidas e Lista de Intenção do navegador autenticado com o Guerreirinho no servidor
  React.useEffect(() => {
    if (!players || players.length < 10) return;
    fetch('/api/cache/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        players,
        matches: matches || [],
        intentions,
        systemMetadata
      })
    }).catch(() => {});
  }, [players.length, matches?.length, intentions?.lastUpdated]);

  const handleSyncWhatsAppPhotos = async (forceAll = true) => {
    if (isSyncingPhotos) return;
    setIsSyncingPhotos(true);
    try {
      const resp = await fetch('/api/whatsapp/sync-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          forceAll,
          players,
          matches: matches || [],
          intentions
        })
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.success === false) {
          showNotification?.(
            data.error || 'Instância WhatsApp indisponível para sincronizar fotos agora.',
            'error'
          );
          return;
        }
        let firestoreSavedCount = 0;
        if (Array.isArray(data.players) && data.players.length >= 5) {
          useStore.setState({ players: data.players });
          // Grava diretamente no Firestore via sessão autenticada de Admin do navegador
          for (const updated of data.players) {
            const orig = players.find(p => p.id === updated.id);
            if (!orig) continue;
            const cleanUpdatedPhone = autoNormalizeBrazilianPhone(updated.phone) || updated.phone;
            if (cleanUpdatedPhone) updated.phone = cleanUpdatedPhone;
            const fieldsToSave: Record<string, any> = {};
            if (cleanUpdatedPhone && orig.phone !== cleanUpdatedPhone) {
              fieldsToSave.phone = cleanUpdatedPhone;
            }
            if (updated.photoUrl && orig.photoUrl !== updated.photoUrl) {
              fieldsToSave.photoUrl = updated.photoUrl;
            }
            if (updated.whatsappLid && orig.whatsappLid !== updated.whatsappLid) {
              fieldsToSave.whatsappLid = updated.whatsappLid;
            }
            if (Object.keys(fieldsToSave).length > 0) {
              try {
                await setDoc(doc(db, 'players', updated.id), fieldsToSave, { merge: true });
                firestoreSavedCount++;
              } catch (err) {
                await savePlayer({ ...orig, ...fieldsToSave }).catch(() => {});
              }
            }
          }
        }
        await refreshPlayers();
        if (data.mode === 'vm_baileys_queued') {
          showNotification?.(
            data.message ||
              `Sincronização de ${data.queuedTargetsCount || 0} foto(s) enviada para a VM Google (Baileys)! Importando automaticamente...`,
            'info'
          );
          const queuedJobId = data.jobId;
          if (queuedJobId) {
            let attempts = 0;
            const pollTimer = window.setInterval(async () => {
              attempts++;
              if (attempts > 24) {
                window.clearInterval(pollTimer);
                return;
              }
              try {
                const stResp = await fetch('/api/whatsapp/sync-photos/status');
                const stData = await stResp.json();
                const job = stData?.job;
                if (job && job.jobId === queuedJobId && job.status === 'completed') {
                  window.clearInterval(pollTimer);
                  await refreshPlayers();
                  const imp = Number(job.updatedCount || 0);
                  const priv = Number(job.noPhotoPrivacyCount || 0);
                  showNotification?.(
                    imp > 0
                      ? `✅ ${imp} foto(s) importada(s) do WhatsApp com sucesso!${priv > 0 ? ` (${priv} sem foto pública)` : ''}`
                      : `Sincronização finalizada: nenhuma foto pública nova disponível (${priv} com privacidade no WhatsApp).`,
                    imp > 0 ? 'success' : 'info'
                  );
                }
              } catch {
                // ignora falha transitória de polling
              }
            }, 5000);
          }
          return;
        }
        const phonesMsg = data.phonesUpdated > 0 ? `${data.phonesUpdated} telefone(s), ` : '';
        const savedMsg = firestoreSavedCount > 0 ? ` (${firestoreSavedCount} salvos no banco)` : '';
        const privacyNote =
          data.noPhotoPrivacyCount > 0
            ? ` · ${data.noPhotoPrivacyCount} sem foto pública no WhatsApp (privacidade)`
            : '';
        showNotification?.(
          data.updatedCount > 0 || data.phonesUpdated > 0 || firestoreSavedCount > 0
            ? `${phonesMsg}${data.updatedCount} foto(s) baixada(s) do WhatsApp${savedMsg}${privacyNote}!`
            : `Nenhuma foto pública nova liberada pelo WhatsApp (${data.checked || 0} verificados${privacyNote}). Sócios com privacidade ativa podem enviar uma foto direto pro Guerreirinho ou usar o link de foto.`,
          data.updatedCount > 0 || firestoreSavedCount > 0 ? 'success' : 'info'
        );
      } else {
        showNotification?.('Não foi possível sincronizar as fotos agora.', 'error');
      }
    } catch (e) {
      showNotification?.('Erro ao conectar com o servidor de fotos.', 'error');
    } finally {
      setIsSyncingPhotos(false);
    }
  };

  const handleSendWelcomeWhatsApp = async (player: Player) => {
    const firstName = capitalizeName(player.name || 'Guerreiro').split(' ')[0];
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'bom dia' : hour < 18 ? 'boa tarde' : 'boa noite';
    const cadastradaWord = player.gender === 'FEMALE' ? 'Cadastrada!' : 'Cadastrado!';
    const welcomeText =
      `Olá, ${firstName}, ${greeting}!\n\n` +
      `${cadastradaWord} ${firstName}, acesse o app, procure a lista no menu principal e depois procure o botão "vou jogar" ou "não vou". Qualquer dúvida, sugestão ou crítica, pode falar...\n\n` +
      `https://guerreiros-volleyball-club-238897290870.us-west1.run.app?tab=intentions`;

    setSendingWelcomeId(player.id);
    try {
      const resp = await fetch('/api/whatsapp/send-welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: player.id,
          playerName: firstName,
          phone: player.phone || '',
          gender: player.gender
        })
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.sentByBot) {
          showNotification?.(`Boas-vindas enviada pelo Guerreirinho para ${firstName}!`, 'success');
          setSendingWelcomeId(null);
          return;
        }
      }
    } catch (e) {}
    setSendingWelcomeId(null);

    const cleanPhone = String(player.phone || '').replace(/\D/g, '');
    const waPhone = cleanPhone.length >= 10 ? (cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`) : '';
    const waUrl = waPhone
      ? `https://wa.me/${waPhone}?text=${encodeURIComponent(welcomeText)}`
      : `https://wa.me/?text=${encodeURIComponent(welcomeText)}`;
    window.open(waUrl, '_blank');
  };
  const { monthBirthdays, getBirthdaysByMonth } = useBirthdays(players);
  const [selectedMonth, setSelectedMonth] = React.useState<string>((new Date().getMonth() + 1).toString().padStart(2, '0'));

  const monthBirthdaysList = React.useMemo(() => {
    return getBirthdaysByMonth(parseInt(selectedMonth, 10));
  }, [selectedMonth, getBirthdaysByMonth]);

  React.useEffect(() => {
    if (monthBirthdays.month && !selectedMonth) {
      setSelectedMonth(String(monthBirthdays.month).padStart(2, '0'));
    }
  }, [monthBirthdays.month]);

  const getPlayerHistoryList = React.useCallback((p: Player) => {
    const list: Array<{ time: string; label: string }> = [];
    const seenTimes = new Set<number>();

    const addTime = (rawTime: string | number, label: string) => {
      try {
        const dateObj = new Date(rawTime);
        const timeMs = dateObj.getTime();
        if (isNaN(timeMs)) return;

        // Deduplicate timestamps within 1 minute of each other
        const isDup = Array.from(seenTimes).some(ts => Math.abs(ts - timeMs) < 60000);
        if (!isDup) {
          seenTimes.add(timeMs);
          list.push({ time: dateObj.toISOString(), label });
        }
      } catch (e) {}
    };

    if (p.loginHistory && Array.isArray(p.loginHistory)) {
      p.loginHistory.forEach(h => {
        if (h) addTime(h, 'Acesso');
      });
    }

    if (p.lastLoginAt) {
      addTime(p.lastLoginAt, 'Último Login');
    }

    const intentionTs = intentions?.confirmationTimestamps?.[p.id];
    if (intentionTs) {
      const isGoing = intentions?.responses?.[p.id] === 'GOING';
      const label = isGoing ? 'Confirmou na Lista' : 'Lista de Intenções';
      addTime(intentionTs, label);
    }

    list.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    return list;
  }, [intentions]);

  React.useEffect(() => {
    fetch('/api/presence/sync-accesses')
      .then(r => r.json())
      .then(res => {
        if (res?.synced > 0) {
          refreshPlayers();
        }
      })
      .catch(console.warn);
  }, [refreshPlayers]);

  const gameDatesForEvasion = React.useMemo(() => {
    if (!matches) return [];
    const dates = Array.from(new Set(matches.map(m => m.date)));
    return dates.sort((a, b) => b.localeCompare(a)); // Newest to oldest
  }, [matches]);

  const evasionMap = React.useMemo(() => {
    const map = new Map<string, number>();
    const limit = systemMetadata?.consecutiveAbsenceLimit ?? 4;
    if (!players || gameDatesForEvasion.length < limit) return map;

    const today = getFirestoreDateKey();
    const isPresentTodayMap = new Map();
    if (attendance) {
      attendance.forEach(p => {
        if (p.id) isPresentTodayMap.set(p.id, true);
      });
    }

    players.forEach(player => {
      // Track consecutive missed games for active players
      const isActive = (player.status === 'active' || !player.status || player.status === '') && !player.isDM;
      if (!isActive) return;

      let consecutiveMissed = 0;
      for (const date of gameDatesForEvasion) {
        // Did the player play on this date?
        const played = matches.some(m => m.date === date && (m.teamA.includes(player.id) || m.teamB.includes(player.id)));
        
        // Did they check in today (if date is today)?
        const present = (date === today && isPresentTodayMap.has(player.id)) || played;

        if (present) {
          break; // Streak broken!
        }
        consecutiveMissed++;
      }
      map.set(player.id, consecutiveMissed);
    });

    return map;
  }, [players, gameDatesForEvasion, matches, attendance, systemMetadata?.consecutiveAbsenceLimit]);
  
  const traditionalEloRankings = React.useMemo(() => {
    if (!matches || matches.length === 0 || !players) return {};

    const availableDates = Array.from(new Set(matches.map(m => m.date))).sort((a, b) => b.localeCompare(a));
    if (availableDates.length === 0) return {};

    const today = getFirestoreDateKey();
    let currentRefDate = today;
    let prevRefDate: string | null = null;

    const latestSessionInHistory = availableDates[0];
    if (latestSessionInHistory === today) {
      prevRefDate = availableDates[1] || null;
    } else {
      prevRefDate = latestSessionInHistory;
    }

    if (!prevRefDate) return {};

    const getEloAtDate = (player: any, date: string, isNow: boolean = false) => {
      if (isNow) return player.elo || 1200;
      
      const entry = player.eloHistory?.find((h: any) => h.date === date);
      if (entry) return entry.elo;
      
      const historyBefore = (player.eloHistory || [])
        .filter((h: any) => h.date < date)
        .sort((a: any, b: any) => b.date.localeCompare(a.date));
      return historyBefore.length > 0 ? historyBefore[0].elo : 1200;
    };

    const currentRankings = [...players]
      .map(p => ({ id: p.id, elo: getEloAtDate(p, currentRefDate, true) }))
      .sort((a, b) => b.elo - a.elo);

    const prevRankings = [...players]
      .map(p => ({ id: p.id, elo: getEloAtDate(p, prevRefDate!) }))
      .sort((a, b) => b.elo - a.elo);

    const result: Record<string, { rank: number; diff: number; type: 'up' | 'down' | 'neutral' }> = {};

    currentRankings.forEach((p, currentIdx) => {
      const prevIdx = prevRankings.findIndex(prevP => prevP.id === p.id);
      let diff = 0;
      let type: 'up' | 'down' | 'neutral' = 'neutral';

      if (prevIdx !== -1) {
        diff = prevIdx - currentIdx; 
        type = diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral';
      }
      
      result[p.id] = {
        rank: currentIdx + 1,
        diff: Math.abs(diff),
        type
      };
    });

    return result;
  }, [matches, players]);

  const trueSkillRankings = React.useMemo(() => {
    if (!matches || matches.length === 0 || !players) return {};

    const tsMap = new Map<string, { mu: number, sigma: number }>();
    let prevTsMap = new Map<string, { mu: number, sigma: number }>();

    const sortedMatches = [...matches].sort((a, b) => a.timestamp - b.timestamp);
    
    const availableDates = Array.from(new Set(sortedMatches.map(m => m.date))).sort((a, b) => b.localeCompare(a));
    const currentRefDate = availableDates[0];

    sortedMatches.forEach(m => {
      if (!m.teamA || !m.teamB || !m.winner) return;
      
      const teamAWithTS = m.teamA.map(pid => ({ id: pid, trueSkill: tsMap.get(pid) }));
      const teamBWithTS = m.teamB.map(pid => ({ id: pid, trueSkill: tsMap.get(pid) }));

      const updates = calculateTrueSkillUpdate(teamAWithTS as any, teamBWithTS as any, m.winner);
      updates.forEach(u => tsMap.set(u.playerId, u.newTrueSkill));

      if (m.date !== currentRefDate) {
        prevTsMap = new Map(tsMap);
      }
    });

    const getScore = (ts?: { mu: number, sigma: number }) => ts ? ts.mu - 3 * ts.sigma : 0;

    const currentList = players.map(p => ({
      id: p.id,
      score: getScore(tsMap.get(p.id))
    })).sort((a, b) => b.score - a.score);

    const prevList = players.map(p => ({
      id: p.id,
      score: getScore(prevTsMap.get(p.id) || tsMap.get(p.id))
    })).sort((a, b) => b.score - a.score);

    const result: Record<string, { score: number, rank: number, diff: number, type: 'up' | 'down' | 'neutral' }> = {};
    
    currentList.forEach((p, idx) => {
      const prevIdx = prevList.findIndex(pr => pr.id === p.id);
      const diff = prevIdx !== -1 ? (prevIdx - idx) : 0;
      
      result[p.id] = {
        score: p.score,
        rank: idx + 1,
        diff: Math.abs(diff),
        type: diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral'
      };
    });

    return result;
  }, [matches, players]);

  const [searchTerm, setSearchTerm] = React.useState('');
  const [startY, setStartY] = React.useState(0);
  const [pullDistance, setPullDistance] = React.useState(0);
  const [isPulling, setIsPulling] = React.useState(false);
  const [sortConfig, setSortConfig] = React.useState<{ key: keyof Player; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc'
  });
  const [showBirthdayModal, setShowBirthdayModal] = React.useState(false);
  const [selectedPlayerHistory, setSelectedPlayerHistory] = React.useState<Player | null>(null);

  const generateBirthdayList = () => {
    const activeMembers = players.filter(p => (p.status === 'active' || !p.status || p.status === '') && !p.isDM);
    
    const birthdayMembers = activeMembers.filter(p => {
      if (!p.birthDate) return false;
      const parts = p.birthDate.split('-');
      if (parts.length < 2) return false;
      return parts[1] === selectedMonth;
    }).sort((a, b) => {
      const dayA = a.birthDate!.split('-')[2];
      const dayB = b.birthDate!.split('-')[2];
      return parseInt(dayA) - parseInt(dayB);
    });

    const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const monthName = monthNames[parseInt(selectedMonth) - 1];

    let text = `🎂 *ANIVERSARIANTES DE ${monthName.toUpperCase()}* 🎂\n\n`;
    
    if (birthdayMembers.length === 0) {
      text += "Nenhum aniversariante neste mês.\n";
    } else {
      birthdayMembers.forEach(p => {
        const parts = p.birthDate!.split('-');
        text += `• ${parts[2]}/${parts[1]} - ${capitalizeName(p.name)}\n`;
      });
    }

    navigator.clipboard.writeText(text).then(() => {
      alert("Lista copiada para a área de transferência!");
      setShowBirthdayModal(false);
    }).catch(err => {
      console.error('Falha ao copiar: ', err);
      alert("Erro ao copiar lista.");
    });
  };

  const handleSort = (key: keyof Player) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const isBirthdayMonth = (birthDate?: string) => {
    if (!birthDate) return false;
    const parts = birthDate.trim().split('T')[0].split(/[-/]/);
    if (parts.length < 2) return false;
    const birthMonth = parts[1].padStart(2, '0');
    const currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');
    return birthMonth === currentMonth;
  };

  const formatBirthday = (birthDate?: string) => {
    if (!birthDate) return '-';
    const parts = birthDate.trim().split('T')[0].split(/[-/]/);
    if (parts.length < 3) return birthDate;
    const day = parts[0].length === 4 ? parts[2] : parts[0];
    const month = parts[1];
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}`;
  };

  const { setViewMode } = useStore(useShallow(state => ({setViewMode: state.setViewMode})));

  const getImpactIcon = (level?: number) => {
    switch (level) {
      case 3: return <Zap className="w-3 h-3 text-brand-primary" fill="currentColor" />;
      case 2: return <Star className="w-3 h-3 text-brand-primary" fill="currentColor" />;
      default: return <Shield className="w-3 h-3 text-white/40" />;
    }
  };

  const activePlayers = React.useMemo(() => {
    return players.filter(p => (p.status === 'active' || p.status === 'guest' || !p.status || p.status === '') && !p.isDM && p.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [players, searchTerm]);

  const waitlistPlayers = React.useMemo(() => {
    return players.filter(p => p.status === 'waitlist' && !p.isDM && p.name.toLowerCase().includes(searchTerm.toLowerCase())).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }, [players, searchTerm]);

  const inactivePlayers = React.useMemo(() => {
    return players.filter(p => (p.status === 'inactive' || p.status === 'dm' || !!p.isDM) && p.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [players, searchTerm]);

  const sortedList = (list: Player[]) => {
    return [...list].sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];
      if (aValue === bValue) return 0;
      if (aValue === undefined || aValue === null) return 1;
      if (bValue === undefined || bValue === null) return -1;
      const comparison = aValue < bValue ? -1 : 1;
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  };

  const renderTable = (list: Player[], title: string, subtitle: string, color: string) => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className={`w-1 h-6 ${color} rounded-full`}></div>
        <div>
          <h3 className="text-sm font-black text-white uppercase tracking-wider">{title}</h3>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{subtitle}</p>
        </div>
      </div>
      <div className={`bg-brand-secondary/30 backdrop-blur-xl rounded-[1.5rem] border border-white/5 border-l-[4px] ${color.replace('bg-', 'border-')} shadow-xl overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-black/40 border-b border-white/5">
              <tr>
                <th onClick={() => handleSort('name')} className="px-2 py-2 text-[9px] font-black text-brand-primary uppercase tracking-widest cursor-pointer hover:opacity-80 transition-colors">
                  <div className="flex items-center gap-1">
                    Sócio {sortConfig.key === 'name' && <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                  </div>
                </th>
                <th className="px-2 py-2 text-[9px] font-black text-brand-primary uppercase tracking-widest text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Phone className="w-3 h-3" />
                    <span>Telefone</span>
                  </div>
                </th>
                {userRole === 'ADMIN' && <th className="px-2 py-2 text-[9px] font-black text-brand-primary uppercase tracking-widest">Email</th>}
                <th className="px-2 py-2 text-[9px] font-black text-brand-primary uppercase tracking-widest text-center">Nascimento</th>
                <th className="px-2 py-2 text-[9px] font-black text-brand-primary uppercase tracking-widest text-center">
                  <div className="flex flex-col items-center gap-0.5">
                    <Trophy className="w-3 h-3" />
                    <span>Performance</span>
                  </div>
                </th>
                <th className="px-2 py-2 text-[9px] font-black text-brand-primary uppercase tracking-widest text-center">Gênero</th>
                <th className="px-2 py-2 text-[9px] font-black text-brand-primary uppercase tracking-widest text-center">Nível</th>
                <th onClick={() => handleSort('elo')} className="px-2 py-2 text-[9px] font-black text-brand-primary uppercase tracking-widest text-center cursor-pointer hover:opacity-80 transition-colors">
                  <div className="flex items-center justify-center gap-1">
                    ELO / IC {sortConfig.key === 'elo' && <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                  </div>
                </th>
                <th className="px-2 py-2 text-[9px] font-black text-brand-primary uppercase tracking-widest text-center">
                  Eficiência
                </th>
                <th className="px-2 py-2 text-[9px] font-black text-brand-primary uppercase tracking-widest text-center">Status</th>
                {userRole === 'ADMIN' && (
                  <th className="px-2 py-2 text-[9px] font-black text-brand-primary uppercase tracking-widest text-center">
                    Acessos
                  </th>
                )}
                {userRole === 'ADMIN' && <th className="px-2 py-2 text-[9px] font-black text-brand-primary uppercase tracking-widest text-right">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-medium">
              {sortedList(list).map(player => (
                <tr key={player.id} className="hover:bg-white/5 transition-colors group">
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <PlayerAvatar player={{ ...player, photoUrl: resolveEffectivePlayerPhoto(player, waPhotoDir) }} size="sm" />
                      <div className="flex items-center gap-1 min-w-0">
                        {userRole === 'ADMIN' && <div className="shrink-0">{getImpactIcon(player.impactLevel)}</div>}
                        <div className={`font-bold text-xs break-words whitespace-normal ${player.isOfficialSetter ? 'text-brand-primary' : 'text-white'}`}>
                          {capitalizeName(player.name) || "Sócio sem nome"}
                          {player.isDM && <span className="ml-1 px-1 py-0.2 rounded-full text-[8px] font-black bg-rose-500 text-white">DM</span>}
                          <span className="ml-1">
                             <EvasionIcon 
                                level={player.evasionLevel || calculateEvasionLevel(player)} 
                                customTooltip={`${(player.evasionLevel || calculateEvasionLevel(player)).charAt(0).toUpperCase() + (player.evasionLevel || calculateEvasionLevel(player)).slice(1)} - ${player.wins || 0}V ${player.losses || 0}D`} 
                             />
                          </span>
                          {(() => {
                            const missed = evasionMap.get(player.id);
                            const limit = systemMetadata?.consecutiveAbsenceLimit ?? 4;
                            if (missed && missed >= limit) {
                              return (
                                <span className="ml-1 inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-amber-500/10 text-amber-500 border border-amber-500/30 text-[8px] font-black animate-pulse" title={`Alerta: Ausente há ${missed} dias de jogos consecutivos!`}>
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  {missed}D
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-center text-[10px] text-white/80 font-mono whitespace-nowrap">
                    {formatPhoneNumber(player.phone)}
                  </td>
                  {userRole === 'ADMIN' && <td className="px-2 py-1.5 text-[9px] font-bold text-white/50">{player.email || '-'}</td>}
                  <td className="px-2 py-1.5 text-center text-[10px]">
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-white/60">{formatBirthday(player.birthDate)}</span>
                      {isBirthdayMonth(player.birthDate) && (
                        <Cake className="w-3.5 h-3.5 text-brand-primary animate-[pulse_1s_infinite]" />
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <div className="flex flex-col items-center">
                      <div className="flex items-center gap-1">
                        <span className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-brand-primary text-black text-[8px] font-black" title="Vitórias">
                          <TrendingUp className="w-2.5 h-2.5" />
                          {player.wins || 0}
                        </span>
                        <span className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-white text-black text-[8px] font-black" title="Derrotas">
                          <TrendingDown className="w-2.5 h-2.5" />
                          {player.losses || 0}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-center text-[10px] text-white/60">{translateGender(player.gender)}</td>
                  <td className="px-2 py-1.5 text-center">
                    <span className={`text-[9px] font-black uppercase tracking-tight ${getPlayerTier(player).color}`}>
                      {getPlayerTier(player).label}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {(() => {
                      const tr = traditionalEloRankings[player.id];
                      const icValue = calculateCompositePerformanceRating(player);
                      return (
                        <div className="flex flex-col items-center gap-0.5">
                          <div className="flex items-center gap-1">
                            {tr ? (
                              <>
                                <span className="text-[10px] font-black text-white">#{tr.rank}</span>
                                {tr.type === 'up' && <div className="flex items-center gap-0.5"><TrendingUp className="w-2.5 h-2.5 text-emerald-500" /><span className="text-[8px] font-black text-emerald-500">{tr.diff}</span></div>}
                                {tr.type === 'down' && <div className="flex items-center gap-0.5"><TrendingDown className="w-2.5 h-2.5 text-rose-500" /><span className="text-[8px] font-black text-rose-500">{tr.diff}</span></div>}
                                {tr.type === 'neutral' && <Minus className="w-2.5 h-2.5 text-white/40" />}
                              </>
                            ) : (
                              <span className="text-[10px] font-black text-white">#{traditionalEloRankings[player.id]?.rank || '-'}</span>
                            )}
                          </div>
                          <div className="flex items-center justify-center gap-1.5 mt-0.5">
                            <span className="text-[9px] font-black text-white/70 font-mono whitespace-nowrap">{Math.round(player.elo)} pts</span>
                            <span className="px-1.5 py-0.5 rounded bg-brand-primary/15 text-brand-primary border border-brand-primary/30 font-black text-[9px] font-mono whitespace-nowrap shadow-sm" title="Índice Composto (IC) Soberano">
                              IC {icValue.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {(() => {
                      const ts = trueSkillRankings[player.id];
                      if (!ts) return <span className="text-white/20">-</span>;
                      return (
                        <div className="flex flex-col items-center gap-0.5">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-black text-white">#{ts.rank}</span>
                            {ts.type === 'up' && <div className="flex items-center gap-0.5"><TrendingUp className="w-2.5 h-2.5 text-emerald-500" /><span className="text-[8px] font-black text-emerald-500">{ts.diff}</span></div>}
                            {ts.type === 'down' && <div className="flex items-center gap-0.5"><TrendingDown className="w-2.5 h-2.5 text-rose-500" /><span className="text-[8px] font-black text-rose-500">{ts.diff}</span></div>}
                            {ts.type === 'neutral' && <Minus className="w-2.5 h-2.5 text-white/40" />}
                          </div>
                          <span className="text-[8px] font-black text-white/40">{Math.round(ts.score)} pts</span>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase border ${
                      player.status === 'waitlist' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                      player.status === 'inactive' ? 'bg-white/5 text-white/40 border-white/10' :
                      player.status === 'guest' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                      (player.status === 'dm' || player.isDM) ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' :
                      'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                    }`}>
                      {player.status === 'waitlist' ? 'Fila de Espera' : 
                       player.status === 'inactive' ? 'Inativo' : 
                       player.status === 'guest' ? 'Convidado' :
                       (player.status === 'dm' || player.isDM) ? 'DM' : 'Ativo'}
                    </span>
                  </td>
                  {userRole === 'ADMIN' && (
                    <td className="px-2 py-1.5 text-center">
                      {(() => {
                        const historyList = getPlayerHistoryList(player);
                        const totalAccesses = Math.max(player.accesses || 0, historyList.length);
                        const lastAccess = historyList[0];

                        return (
                          <Tooltip content={
                            <div className="space-y-1">
                              <p className="font-black text-[10px] uppercase border-b border-white/10 pb-1 mb-1">Últimos Acessos (Clique para Ver Tudo)</p>
                              {historyList.length > 0 ? (
                                historyList.slice(0, 3).map((item, i) => (
                                  <p key={i} className="text-[9px] font-mono whitespace-nowrap flex items-center justify-between gap-2">
                                    <span>{new Date(item.time).toLocaleDateString('pt-BR')} {new Date(item.time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                                    <span className="text-[7px] font-black uppercase text-brand-primary/80 bg-brand-primary/10 px-1 rounded">{item.label}</span>
                                  </p>
                                ))
                              ) : (
                                <p className="text-[9px] text-white/40 italic">Sem histórico</p>
                              )}
                              {historyList.length > 3 && (
                                <p className="text-[8px] text-brand-primary font-black uppercase text-center mt-1">+ Clique para ver mais ({historyList.length})</p>
                              )}
                            </div>
                          }>
                            <button 
                              onClick={() => setSelectedPlayerHistory(player)}
                              className="flex flex-col items-center cursor-pointer hover:bg-white/5 p-1 rounded-lg transition-all group/access"
                            >
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] font-black text-white group-hover/access:text-brand-primary transition-colors">{totalAccesses}</span>
                                <History className="w-2.5 h-2.5 text-white/20 group-hover/access:text-brand-primary" />
                              </div>
                              {lastAccess ? (
                                <span className="text-[8px] text-white/40 font-mono">
                                  {new Date(lastAccess.time).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} {new Date(lastAccess.time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              ) : (
                                <span className="text-[8px] text-white/20">-</span>
                              )}
                            </button>
                          </Tooltip>
                        );
                      })()}
                    </td>
                  )}
                  <td className="px-2 py-1.5 text-right flex items-center justify-end gap-1">
                    <Tooltip content="Ver no Ranking">
                      <button 
                        onClick={() => setViewMode('dashboard')}
                        className="p-1.5 text-white bg-white/10 hover:bg-brand-primary hover:text-black rounded-lg transition-all"
                      >
                        <Target className="w-3.5 h-3.5" />
                      </button>
                    </Tooltip>
                    {userRole === 'ADMIN' ? (
                      <>
                        <Tooltip content={(player.status === 'inactive' || player.status === 'dm' || player.isDM) ? "Ativar Sócio" : "Inativar Sócio"}>
                          <button 
                            onClick={() => {
                              const isCurrentlyInactive = player.status === 'inactive' || player.status === 'dm' || player.isDM;
                              const newStatus = isCurrentlyInactive ? 'active' : 'inactive';
                              savePlayer({ ...player, status: newStatus, isDM: false });
                            }}
                            className={`p-1.5 rounded-lg transition-all ${
                              (player.status === 'inactive' || player.status === 'dm' || player.isDM) 
                                ? 'text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500 hover:text-white' 
                                : 'text-amber-500 bg-amber-500/10 hover:bg-amber-500 hover:text-white'
                            }`}
                          >
                            {(player.status === 'inactive' || player.status === 'dm' || player.isDM) ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                          </button>
                        </Tooltip>
                        <Tooltip content="Enviar Boas-Vindas no WhatsApp">
                          <button 
                            onClick={() => handleSendWelcomeWhatsApp(player)}
                            disabled={sendingWelcomeId === player.id}
                            className="p-1.5 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500 hover:text-black rounded-lg transition-all font-bold border border-emerald-500/20 disabled:opacity-50"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </button>
                        </Tooltip>
                        <Tooltip content="Associar Foto ao WhatsApp">
                          <button
                            onClick={() => openPhotoLinkModal(player)}
                            className="p-1.5 text-sky-400 bg-sky-500/10 hover:bg-sky-500 hover:text-black rounded-lg transition-all font-bold border border-sky-500/20"
                          >
                            <Camera className="w-3.5 h-3.5" />
                          </button>
                        </Tooltip>
                        <Tooltip content="Editar Sócio">
                          <button 
                            onClick={() => { setEditingPlayer(player); setIsFormOpen(true); }} 
                            className="p-1.5 text-brand-primary bg-brand-primary/10 hover:bg-brand-primary hover:text-brand-secondary rounded-lg transition-all font-bold border border-brand-primary/20"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </Tooltip>
                        <Tooltip content="Excluir Sócio" position="left">
                          <button 
                            onClick={() => deletePlayer(player.id)} 
                            className="p-1.5 text-rose-500 bg-rose-500/10 hover:bg-rose-500 hover:text-white rounded-lg transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </Tooltip>
                      </>
                    ) : currentPlayer && player.id === currentPlayer.id ? (
                      <div className="flex items-center gap-1">
                        <Tooltip content="Vincular Foto ao WhatsApp" position="left">
                          <button
                            onClick={() => openPhotoLinkModal(player)}
                            className="p-1.5 text-sky-400 bg-sky-500/10 hover:bg-sky-500 hover:text-black rounded-lg transition-all font-bold border border-sky-500/20"
                          >
                            <Camera className="w-3.5 h-3.5" />
                          </button>
                        </Tooltip>
                        <Tooltip content="Configurações do Jogador" position="left">
                          <button
                            onClick={() => { setEditingPlayer(player); setIsFormOpen(true); }}
                            className="p-1.5 text-brand-primary bg-brand-primary/10 hover:bg-brand-primary hover:text-brand-secondary rounded-lg transition-all font-bold border border-brand-primary/20"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </Tooltip>
                      </div>
                    ) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderCards = (list: Player[], title: string, subtitle: string, color: string) => (
    <div className="space-y-4">
      <div className="flex items-center gap-3 px-2">
        <div className={`w-1 h-6 ${color} rounded-full`}></div>
        <div>
          <h3 className="text-sm font-black text-white uppercase tracking-wider">{title}</h3>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{subtitle}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4">
        {list.map(player => (
          <div key={player.id} className={`bg-brand-secondary/30 backdrop-blur-xl p-6 rounded-[2.5rem] border border-white/5 border-l-[6px] ${color.replace('bg-', 'border-l-')} shadow-xl space-y-4 relative overflow-hidden group`}>
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-4 flex-1 min-w-0 pr-2">
                <PlayerAvatar player={{ ...player, photoUrl: resolveEffectivePlayerPhoto(player, waPhotoDir) }} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className={`text-sm font-bold tracking-tight break-words whitespace-normal leading-tight ${player.status === 'inactive' ? 'text-white/40' : 'text-white'}`}>
                      {capitalizeName(player.name)} {player.isDM && <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white font-sans">DM</span>}
                      <span className="ml-2">
                        <EvasionIcon 
                          level={player.evasionLevel || calculateEvasionLevel(player)} 
                          customTooltip={`${(player.evasionLevel || calculateEvasionLevel(player)).charAt(0).toUpperCase() + (player.evasionLevel || calculateEvasionLevel(player)).slice(1)} - ${player.wins || 0}V ${player.losses || 0}D`} 
                        />
                      </span>
                      {(() => {
                        const missed = evasionMap.get(player.id);
                        const limit = systemMetadata?.consecutiveAbsenceLimit ?? 4;
                        if (missed && missed >= limit) {
                          return (
                            <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/30 text-[8px] font-black animate-pulse" title={`Alerta: Ausente há ${missed} dias de jogos consecutivos!`}>
                              <AlertTriangle className="w-2.5 h-2.5" />
                              {missed}D AUSENTE
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </h4>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                      player.status === 'waitlist' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                      player.status === 'inactive' ? 'bg-white/5 text-white/40 border-white/10' :
                      player.status === 'guest' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                      (player.status === 'dm' || player.isDM) ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' :
                      'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                    }`}>
                      {player.status === 'waitlist' ? 'Fila de Espera' : 
                       player.status === 'inactive' ? 'Inativo' : 
                       player.status === 'guest' ? 'Convidado' :
                       (player.status === 'dm' || player.isDM) ? 'Dep. Médico (DM)' : 'Ativo'}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-white/5 text-white/60 border border-white/10">
                      {translateGender(player.gender)}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-white/5 text-white/60 border border-white/10 flex items-center gap-1">
                      <Phone className="w-3 h-3 text-brand-primary" />
                      {formatPhoneNumber(player.phone)}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-white/5 text-white/60 border border-white/10 flex items-center gap-1">
                      <Cake className={`w-4 h-4 ${isBirthdayMonth(player.birthDate) ? 'text-brand-primary animate-pulse' : 'text-white/40'}`} />
                      {formatBirthday(player.birthDate)}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-white/5 ${getPlayerTier(player).color} border border-white/10`}>
                      {getPlayerTier(player).label}
                    </span>
                    {userRole === 'ADMIN' && (
                      <button 
                        onClick={() => setSelectedPlayerHistory(player)}
                        className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-brand-primary/10 text-brand-primary border border-brand-primary/20 flex items-center gap-1 active:scale-95 transition-transform"
                      >
                        <Clock className="w-3 h-3" />
                        {player.accesses || 0} Acessos
                        {player.lastLoginAt && (
                          <span className="text-white/40 ml-1 font-mono">
                            ({new Date(player.lastLoginAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})
                          </span>
                        )}
                      </button>
                    )}
                    <div className="flex items-center gap-1 ml-auto">
                      <span className="px-1.5 py-0.5 rounded bg-brand-primary text-black text-[8px] font-black">{player.wins || 0}V</span>
                      <span className="px-1.5 py-0.5 rounded bg-white text-black text-[8px] font-black">{player.losses || 0}D</span>
                      <button 
                        onClick={() => setViewMode('dashboard')}
                        className="ml-2 p-1.5 bg-brand-primary/10 text-brand-primary rounded-lg"
                      >
                        <Target className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                {(() => {
                  const tr = traditionalEloRankings[player.id];
                  const icValue = calculateCompositePerformanceRating(player);
                  if (!tr) return (
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-2xl font-black text-brand-primary tracking-tighter leading-none">{Math.round(player.elo)}</p>
                        <span className="px-2 py-0.5 rounded-lg bg-brand-primary/15 text-brand-primary border border-brand-primary/30 font-black text-[10px] font-mono shadow-sm">
                          IC {icValue.toFixed(1)}
                        </span>
                      </div>
                      <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mt-0.5">ELO / IC</p>
                    </div>
                  );
                  return (
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-black text-white">#{tr.rank}</span>
                        {tr.type === 'up' && <div className="flex items-center gap-0.5"><TrendingUp className="w-3 h-3 text-emerald-500" /></div>}
                        {tr.type === 'down' && <div className="flex items-center gap-0.5"><TrendingDown className="w-3 h-3 text-rose-500" /></div>}
                        {tr.type === 'neutral' && <Minus className="w-3 h-3 text-white/40" />}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-black text-white/80 font-mono">{Math.round(player.elo)} pts</span>
                        <span className="px-2 py-0.5 rounded-lg bg-brand-primary/15 text-brand-primary border border-brand-primary/30 font-black text-[10px] font-mono shadow-sm" title="Índice Composto (IC) Soberano">
                          IC {icValue.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
            {userRole === 'ADMIN' ? (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                <button onClick={() => openPhotoLinkModal(player)} className="flex-1 py-3 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-2xl font-black text-[9px] uppercase hover:bg-sky-500 hover:text-black transition-all flex items-center justify-center gap-1.5">
                  <Camera className="w-3 h-3" /> Foto WA
                </button>
                <button onClick={() => handleSendWelcomeWhatsApp(player)} disabled={sendingWelcomeId === player.id} className="flex-1 py-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-2xl font-black text-[9px] uppercase hover:bg-emerald-500 hover:text-black transition-all flex items-center justify-center gap-1.5 disabled:opacity-50">
                  <MessageCircle className="w-3 h-3" /> Boas-Vindas
                </button>
                <button onClick={() => { setEditingPlayer(player); setIsFormOpen(true); }} className="flex-1 py-3 bg-brand-primary/10 text-brand-primary border border-brand-primary/20 rounded-2xl font-black text-[9px] uppercase hover:bg-brand-primary hover:text-brand-secondary transition-all flex items-center justify-center gap-1.5">
                  <Edit2 className="w-3 h-3" /> Editar
                </button>
                <button onClick={() => deletePlayer(player.id)} className="py-3 px-3 bg-rose-500/10 text-rose-500 rounded-2xl font-black text-[9px] uppercase hover:bg-rose-500/20 transition-all flex items-center justify-center gap-1">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ) : currentPlayer && player.id === currentPlayer.id ? (
              <div className="flex gap-2 pt-2 border-t border-white/5">
                <button onClick={() => openPhotoLinkModal(player)} className="flex-1 py-3 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-2xl font-black text-[9px] uppercase hover:bg-sky-500 hover:text-black transition-all flex items-center justify-center gap-2">
                  <Camera className="w-3 h-3" /> Vincular Foto ao WhatsApp
                </button>
                <button onClick={() => { setEditingPlayer(player); setIsFormOpen(true); }} className="flex-1 py-3 bg-brand-primary/10 text-brand-primary border border-brand-primary/20 rounded-2xl font-black text-[9px] uppercase hover:bg-brand-primary hover:text-brand-secondary transition-all flex items-center justify-center gap-2">
                  <Edit2 className="w-3 h-3" /> Editar Perfil
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      setStartY(e.touches[0].pageY);
      setIsPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling) return;
    const currentY = e.touches[0].pageY;
    const distance = currentY - startY;
    if (distance > 0) {
      setPullDistance(Math.min(distance * 0.5, 80));
      if (distance > 10) {
        if (e.cancelable) e.preventDefault();
      }
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

  return (
    <div 
      className="relative space-y-8 animate-in fade-in duration-500"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull to Refresh Indicator */}
      <div 
        className="absolute top-0 left-0 right-0 flex justify-center pointer-events-none z-50"
        style={{ 
          transform: `translateY(${pullDistance - 40}px)`,
          opacity: pullDistance / 60,
          transition: isPulling ? 'none' : 'transform 0.3s ease, opacity 0.3s ease'
        }}
      >
        <div className="bg-brand-secondary/30 backdrop-blur-xl p-2 rounded-full shadow-lg border border-brand-primary/40">
          <RotateCcw className={`w-6 h-6 text-brand-primary ${isSyncing ? 'animate-spin' : ''}`} />
        </div>
      </div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Gestão de Sócios</h2>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">
            {activePlayers.length} sócios ativos {userRole !== 'ADMIN' && '(Visualização de Sócio)'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3.5 top-[15px] w-4 h-4 text-white/40" />
            <input
              type="text"
              placeholder="Buscar sócio..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-brand-secondary/30 text-white placeholder:text-white/40 border border-white/10 rounded-xl py-3.5 pl-11 pr-4 text-sm font-bold focus:outline-none focus:border-brand-primary transition-all"
            />
          </div>
          {userRole === 'ADMIN' && repairDatabase && (
            <button 
              onClick={repairDatabase} 
              className="md:flex-none bg-white/5 text-white px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-white/10 transition-all border border-brand-primary/40 shadow-sm"
            >
              <RotateCcw className="w-4 h-4" />
              Reparar
            </button>
          )}
          {(userRole === 'ADMIN' || currentPlayer) && (
            <button
              onClick={() => {
                const defaultTarget = currentPlayer || activePlayers[0] || players[0];
                if (defaultTarget) openPhotoLinkModal(defaultTarget);
              }}
              title="Associar foto de perfil diretamente ao número de telefone do WhatsApp"
              className="md:flex-none bg-sky-500/10 text-sky-400 px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-sky-500 hover:text-black transition-all border border-sky-500/30"
            >
              <Link2 className="w-4 h-4" />
              Foto ↔ WhatsApp
            </button>
          )}
          {userRole === 'ADMIN' && (
            <button
              onClick={() => {
                setBatchPhotoItems([]);
                setShowBatchPhotoModal(true);
              }}
              title="Importar várias fotos de sócios de uma vez da galeria ou computador"
              className="md:flex-none bg-amber-500/10 text-amber-400 px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-amber-500 hover:text-black transition-all border border-amber-500/30"
            >
              <Upload className="w-4 h-4" />
              Importar Fotos (Lote)
            </button>
          )}
          {userRole === 'ADMIN' && (
            <button
              onClick={handleToggleWaBot}
              disabled={isTogglingWaBot}
              title="Habilitar ou desabilitar o robô Guerreirinho no WhatsApp"
              className={`md:flex-none px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all border disabled:opacity-50 ${
                waBotEnabled
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500 hover:text-black'
                  : 'bg-rose-500/15 text-rose-400 border-rose-500/40 hover:bg-rose-500 hover:text-white'
              }`}
            >
              <span>{waBotEnabled ? '🤖 Robô WA: ON' : '🤖 Robô WA: OFF'}</span>
            </button>
          )}
                    {userRole === 'ADMIN' && (
            <button 
              onClick={() => handleSyncWhatsAppPhotos(true)}
              disabled={isSyncingPhotos}
              title="Sincronizar telefones e fotos vinculadas do WhatsApp"
              className="md:flex-none bg-emerald-500/10 text-emerald-400 px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-500 hover:text-black transition-all border border-emerald-500/30 disabled:opacity-50"
            >
              <Camera className={`w-4 h-4 ${isSyncingPhotos ? 'animate-pulse' : ''}`} />
              {isSyncingPhotos ? 'Sincronizando...' : 'Sync WhatsApp'}
            </button>
          )}
          {userRole === 'ADMIN' && (
            <button 
              onClick={() => setShowBirthdayModal(true)} 
              className="md:flex-none bg-brand-primary/10 text-brand-primary px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-brand-primary hover:text-black transition-all border border-brand-primary/20"
            >
              <Cake className="w-4 h-4" />
              Aniversariantes
            </button>
          )}
          {userRole === 'ADMIN' && (
            <button onClick={() => { setEditingPlayer(null); setIsFormOpen(true); }} className="md:flex-none bg-brand-primary text-brand-secondary px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:scale-105 shadow-xl shadow-brand-primary/20 transition-all"><UserPlus className="w-4 h-4" />Novo Sócio</button>
          )}
        </div>
      </div>

      <div className="bg-zinc-900 border-2 border-brand-primary/20 rounded-[2.5rem] p-6 sm:p-8 mb-10 shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-brand-primary/10 transition-all duration-700"></div>
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20">
              <Cake className="w-7 h-7 text-amber-500 animate-bounce" />
            </div>
            <div>
              <h3 className="text-base font-black text-white uppercase tracking-[0.2em]">Aniversariantes</h3>
              <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest flex items-center gap-2">
                <Star className="w-3 h-3 text-amber-500/40" />
                Guerreiros do Mês
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-none min-w-[160px]">
              <select 
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-white text-xs font-black uppercase tracking-widest focus:border-brand-primary outline-none transition-all appearance-none cursor-pointer"
              >
                {Array.from({ length: 12 }, (_, i) => {
                  const m = String(i + 1).padStart(2, '0');
                  return (
                    <option key={m} value={m}>
                      {new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date(2024, i))}
                    </option>
                  );
                })}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/40">
                <RotateCcw className="w-3 h-3 rotate-90" />
              </div>
            </div>
          </div>
        </div>

        {monthBirthdaysList.length > 0 ? (
          <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
            {monthBirthdaysList.map(player => {
              const todayKey = getFirestoreDateKey();
              const [currentYearStr, currentMonthStr, currentDayStr] = todayKey.split('-');
              const bParts = player.birthDate ? player.birthDate.trim().split('T')[0].split(/[-/]/) : [];
              const bDay = bParts.length >= 3 ? (bParts[0].length === 4 ? bParts[2] : bParts[0]).padStart(2, '0') : '??';
              const bMonth = bParts.length >= 2 ? bParts[1].padStart(2, '0') : selectedMonth;
              const isBirthdayToday = bDay === currentDayStr && bMonth === currentMonthStr;
              const isSentThisYear = String(player.lastBirthdaySentYear || '') === currentYearStr;
              const sentDateFormatted = player.lastBirthdaySentDate
                ? player.lastBirthdaySentDate.split('-').reverse().join('/')
                : '';

              return (
                <div key={player.id} className="group relative bg-black/40 border border-white/5 rounded-3xl p-4 flex flex-col items-center text-center transition-all hover:border-brand-primary/40 hover:bg-brand-primary/[0.03]">
                  <div className="absolute -top-2 -right-1 z-10 bg-brand-primary text-black px-2.5 py-1 rounded-xl text-[9px] font-black shadow-lg">
                    {bDay} / {selectedMonth}
                  </div>
                  <div className="relative mb-3">
                    <PlayerAvatar player={{ ...player, photoUrl: resolveEffectivePlayerPhoto(player, waPhotoDir) }} size="md" />
                    <div className="absolute -bottom-1 -right-1 bg-black rounded-full p-1 shadow-lg border border-white/10">
                      <div className="w-4 h-4 bg-brand-primary rounded-full flex items-center justify-center text-[8px] text-black">🎂</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-black text-white uppercase truncate w-full group-hover:text-brand-primary transition-colors">
                    {player.name.split(' ')[0]}
                  </span>
                  {isSentThisYear ? (
                    <span
                      title={sentDateFormatted ? `Enviado em ${sentDateFormatted}` : 'Parabéns enviado neste ano'}
                      className="mt-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[8px] font-black uppercase tracking-wider cursor-help"
                    >
                      ✓ Parabéns Enviado
                    </span>
                  ) : isBirthdayToday ? (
                    <button
                      onClick={() => handleSendTodayBirthday(player, false)}
                      disabled={isSendingBirthday}
                      title="Disparar mensagem de aniversário personalizada por IA no grupo e no privado"
                      className="mt-1.5 px-2.5 py-1 rounded-full bg-brand-primary text-black text-[8px] font-black uppercase tracking-wider animate-pulse hover:scale-105 transition-transform flex items-center gap-1 disabled:opacity-50"
                    >
                      <Send className="w-2.5 h-2.5" />
                      {isSendingBirthday ? 'Enviando...' : 'Enviar Parabéns'}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="relative z-10 py-10 flex flex-col items-center justify-center bg-black/20 rounded-3xl border border-dashed border-white/5">
            <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">Nenhum aniversariante</p>
          </div>
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block space-y-12">
        {renderTable(activePlayers, "Sócios Ativos", `${activePlayers.length} / 30 sócios`, "bg-brand-primary")}
        
        {userRole === 'ADMIN' && waitlistPlayers.length > 0 && (
          renderTable(waitlistPlayers, "Fila de Espera (Visão Admin)", `${waitlistPlayers.length} aguardando`, "bg-amber-500")
        )}

        {userRole === 'ADMIN' && inactivePlayers.length > 0 && (
          renderTable(inactivePlayers, "Sócios Inativos (Visão Admin)", `${inactivePlayers.length} no departamento médico ou desligados`, "bg-white/40")
        )}
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-12">
        {renderCards(activePlayers, "Sócios Ativos", `${activePlayers.length} / 30`, "bg-brand-primary")}
        
        {userRole === 'ADMIN' && waitlistPlayers.length > 0 && (
          renderCards(waitlistPlayers, "Fila de Espera (Visão Admin)", `${waitlistPlayers.length} aguardando`, "bg-amber-500")
        )}

        {userRole === 'ADMIN' && inactivePlayers.length > 0 && (
          renderCards(inactivePlayers, "Sócios Inativos (Visão Admin)", `${inactivePlayers.length} inativos`, "bg-white/40")
        )}
      </div>

      {/* Birthday Modal */}
      {showBirthdayModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-brand-secondary border border-brand-primary/40 rounded-[2rem] w-full max-w-md p-6 relative">
            <h3 className="text-xl font-black text-white uppercase mb-6 flex items-center gap-2">
              <Cake className="w-6 h-6 text-brand-primary" />
              Aniversariantes
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black text-white/60 uppercase tracking-widest mb-2">Selecione o Mês</label>
                <select 
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white font-bold text-sm focus:border-brand-primary focus:outline-none"
                >
                  <option value="01">Janeiro</option>
                  <option value="02">Fevereiro</option>
                  <option value="03">Março</option>
                  <option value="04">Abril</option>
                  <option value="05">Maio</option>
                  <option value="06">Junho</option>
                  <option value="07">Julho</option>
                  <option value="08">Agosto</option>
                  <option value="09">Setembro</option>
                  <option value="10">Outubro</option>
                  <option value="11">Novembro</option>
                  <option value="12">Dezembro</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  onClick={() => setShowBirthdayModal(false)}
                  className="flex-1 py-3 px-4 rounded-xl border border-white/10 text-white font-bold hover:bg-white/5 transition-all text-sm"
                >
                  Cancelar
                </button>
                <button 
                  onClick={generateBirthdayList}
                  className="flex-1 py-3 px-4 rounded-xl bg-brand-primary text-black font-black uppercase hover:opacity-90 transition-all text-sm"
                >
                  Copiar Lista
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Módulo de Integração: Associar Foto de Perfil ao Número de WhatsApp */}
      {photoLinkModalPlayer && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[120] flex items-center justify-center p-4">
          <div className="bg-brand-secondary border border-sky-500/40 rounded-[2.2rem] w-full max-w-md p-6 relative shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center">
                  <Link2 className="w-5 h-5 text-sky-400" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-tight">
                    Foto ↔ WhatsApp
                  </h3>
                  <p className="text-[10px] font-bold text-sky-400 uppercase tracking-widest">
                    Integração Direta por Telefone
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPhotoLinkModalPlayer(null)}
                className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-full transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {userRole === 'ADMIN' && (
              <div>
                <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">
                  Selecionar Sócio
                </label>
                <select
                  value={photoLinkModalPlayer.id}
                  onChange={(e) => {
                    const chosen = players.find((p) => p.id === e.target.value);
                    if (chosen) openPhotoLinkModal(chosen);
                  }}
                  className="w-full bg-black/60 border border-white/15 rounded-xl px-3.5 py-2.5 text-white font-bold text-xs focus:border-sky-400 focus:outline-none"
                >
                  {[...players]
                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {capitalizeName(p.name)} {p.phone ? `(${formatPhoneNumber(p.phone)})` : '(Sem telefone)'}
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div className="flex flex-col items-center gap-3 bg-black/40 border border-white/10 rounded-2xl p-4">
              <PlayerAvatar
                player={{
                  ...photoLinkModalPlayer,
                  photoUrl: linkPhotoPreview || resolveEffectivePlayerPhoto(photoLinkModalPlayer as any, waPhotoDir)
                }}
                size="lg"
              />
              <p className="text-xs font-black text-white uppercase">
                {capitalizeName(photoLinkModalPlayer.name)}
              </p>
              <label className="cursor-pointer bg-sky-500/15 hover:bg-sky-500 text-sky-400 hover:text-black border border-sky-500/30 px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all">
                <Upload className="w-3.5 h-3.5" />
                Escolher / Tirar Foto
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoFileChange}
                  className="hidden"
                />
              </label>
            </div>

            <div>
              <label className="block text-[10px] font-black text-white/60 uppercase tracking-widest mb-1.5">
                Número do WhatsApp (com DDD)
              </label>
              <input
                type="tel"
                placeholder="Ex: 81 99999-9999"
                value={linkPhoneInput}
                onChange={(e) => setLinkPhoneInput(e.target.value)}
                className="w-full bg-black/60 border border-white/15 rounded-xl px-4 py-3 text-white font-mono font-bold text-sm focus:border-sky-400 focus:outline-none"
              />
              <p className="text-[10px] text-white/40 mt-1.5 leading-relaxed">
                A foto ficará indexada diretamente ao número do WhatsApp para exibição imediata nos contatos e automações do Guerreirinho.
              </p>
            </div>

            {userRole === 'ADMIN' && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const cleanDigits = autoNormalizeBrazilianPhone(linkPhoneInput || photoLinkModalPlayer.phone || '');
                    const firstName = String(photoLinkModalPlayer.name || 'Guerreiro').split(' ')[0];
                    const baseUrl = window.location.origin.includes('guerreiros-volleyball-club')
                      ? window.location.origin
                      : 'https://guerreiros-volleyball-club-238897290870.us-west1.run.app';
                    const fotoLink = `${baseUrl}/foto?pid=${encodeURIComponent(photoLinkModalPlayer.id)}&phone=${encodeURIComponent(cleanDigits)}&name=${encodeURIComponent(firstName)}`;
                    const msg = `Fala, *${firstName}*! 🏐📸\nToque no link abaixo para enviar ou tirar sua foto oficial para o cadastro dos *Guerreiros VC*:\n👉 ${fotoLink}`;
                    const waUrl = cleanDigits
                      ? `https://wa.me/${cleanDigits}?text=${encodeURIComponent(msg)}`
                      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
                    window.open(waUrl, '_blank');
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-500/15 hover:bg-emerald-500 text-emerald-400 hover:text-black border border-emerald-500/30 font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
                >
                  <Send className="w-3.5 h-3.5" />
                  Pedir Foto ao Sócio via WhatsApp (1 Clique)
                </button>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setPhotoLinkModalPlayer(null)}
                className="flex-1 py-3 px-4 rounded-xl border border-white/10 text-white font-bold hover:bg-white/5 transition-all text-xs uppercase"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveWhatsAppPhotoBinding}
                disabled={isSavingPhotoLink}
                className="flex-1 py-3 px-4 rounded-xl bg-sky-400 text-black font-black uppercase hover:opacity-90 transition-all text-xs disabled:opacity-50"
              >
                {isSavingPhotoLink ? 'Salvando...' : 'Salvar Vínculo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Importação em Lote de Fotos dos Sócios */}
      {showBatchPhotoModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[125] flex items-center justify-center p-4">
          <div className="bg-brand-secondary border border-amber-500/40 rounded-[2.2rem] w-full max-w-2xl p-6 relative shadow-2xl space-y-5 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                  <Upload className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-tight">
                    Importar Fotos em Lote
                  </h3>
                  <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">
                    Associação Automática por Nome ou Telefone
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBatchPhotoModal(false)}
                className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-full transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-black/40 border border-dashed border-amber-500/40 rounded-2xl p-5 text-center space-y-3">
              <p className="text-xs text-white/75 font-medium">
                Selecione várias fotos da sua galeria ou computador. Se o arquivo tiver o nome ou telefone do sócio (ex: <span className="text-amber-400 font-bold">Bibi.jpg</span>, <span className="text-amber-400 font-bold">Caluca.png</span>), o vínculo é feito automaticamente!
              </p>
              <label className="inline-flex cursor-pointer bg-amber-400 hover:bg-amber-300 text-black px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest items-center gap-2 transition-all">
                <Camera className="w-4 h-4" />
                Selecionar Fotos (Múltiplas)
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleBatchFilesSelected}
                  className="hidden"
                />
              </label>
            </div>

            {batchPhotoItems.length > 0 && (
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                {batchPhotoItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 bg-black/50 border border-white/10 rounded-xl p-2.5"
                  >
                    <img
                      src={item.dataUri}
                      alt={item.fileName}
                      className="w-12 h-12 rounded-full object-cover border border-amber-400/50 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-white/60 truncate">{item.fileName}</p>
                      <select
                        value={item.matchedPlayerId}
                        onChange={(e) => {
                          const newPid = e.target.value;
                          setBatchPhotoItems((prev) =>
                            prev.map((x) => (x.id === item.id ? { ...x, matchedPlayerId: newPid } : x))
                          );
                        }}
                        className="mt-1 w-full bg-zinc-900 border border-white/15 rounded-lg px-2.5 py-1.5 text-white font-bold text-xs focus:border-amber-400 focus:outline-none"
                      >
                        <option value="">-- Selecione o Sócio --</option>
                        {[...players]
                          .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {capitalizeName(p.name)}
                            </option>
                          ))}
                      </select>
                    </div>
                    <button
                      onClick={() =>
                        setBatchPhotoItems((prev) => prev.filter((x) => x.id !== item.id))
                      }
                      className="p-2 text-white/40 hover:text-rose-400"
                      title="Remover"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3 pt-2 border-t border-white/10">
              <button
                onClick={() => setShowBatchPhotoModal(false)}
                className="flex-1 py-3 px-4 rounded-xl border border-white/10 text-white font-bold hover:bg-white/5 transition-all text-xs uppercase"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveAllBatchPhotos}
                disabled={isSavingBatchPhotos || batchPhotoItems.length === 0}
                className="flex-1 py-3 px-4 rounded-xl bg-amber-400 text-black font-black uppercase hover:opacity-90 transition-all text-xs disabled:opacity-50"
              >
                {isSavingBatchPhotos
                  ? 'Salvando Fotos...'
                  : `Salvar ${batchPhotoItems.filter((x) => x.matchedPlayerId).length} Foto(s) no App`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Login History Modal */}
      {selectedPlayerHistory && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[110] flex items-center justify-center p-4">
          <div className="bg-brand-secondary border border-brand-primary/40 rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl shadow-brand-primary/10 animate-in zoom-in-95 duration-200">
            <div className="p-6 pb-4 flex justify-between items-center border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-primary/20 flex items-center justify-center border border-brand-primary/40">
                  <History className="w-5 h-5 text-brand-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-tighter leading-none">
                    Histórico de Acesso
                  </h3>
                  <p className="text-[10px] font-bold text-brand-primary uppercase tracking-widest mt-1">
                    {capitalizeName(selectedPlayerHistory.name)}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedPlayerHistory(null)}
                className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-full transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {(() => {
                const historyList = getPlayerHistoryList(selectedPlayerHistory);
                if (historyList.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Clock className="w-12 h-12 text-white/5 mb-4" />
                      <p className="text-sm font-bold text-white/40 uppercase tracking-widest">
                        Nenhum registro encontrado
                      </p>
                    </div>
                  );
                }
                return (
                  <div className="space-y-3">
                    {historyList.map((item, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5 group hover:border-brand-primary/30 transition-all">
                        <div className="flex items-center gap-3">
                          <div className="w-1.5 h-1.5 rounded-full bg-brand-primary shadow-[0_0_5px_rgba(245,196,41,0.5)]" />
                          <div>
                            <p className="text-[11px] font-black text-white uppercase tracking-tight">
                              {new Date(item.time).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                            </p>
                            <p className="text-[9px] font-mono text-white/40">
                              {new Date(item.time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-full bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-[8px] font-black uppercase tracking-wider">
                            {item.label}
                          </span>
                          {i === 0 && (
                            <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[8px] font-black uppercase tracking-widest">
                              Mais Recente
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            <div className="p-6 bg-black/40 border-t border-white/5">
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-white/40">
                <span>Total de Acessos</span>
                <span className="text-white text-base font-black">
                  {Math.max(selectedPlayerHistory.accesses || 0, getPlayerHistoryList(selectedPlayerHistory).length)}
                </span>
              </div>
              <button 
                onClick={() => setSelectedPlayerHistory(null)}
                className="w-full mt-4 py-3 bg-brand-primary text-black font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg shadow-brand-primary/10 active:scale-95 transition-all"
              >
                Fechar Visualização
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
