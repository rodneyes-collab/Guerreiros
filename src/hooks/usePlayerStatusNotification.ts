import { useEffect, useRef, useState } from 'react';
import { Player, GenerationResult, Match, SystemMetadata } from '../../types';
import { messaging, db } from '../../firebase';
import { getToken } from 'firebase/messaging';
import { doc, updateDoc } from 'firebase/firestore';
import { getFirestoreDateKey } from '../../firebase';

export const usePlayerStatusNotification = (
  currentPlayer: Player | null,
  generationResult: GenerationResult | null,
  matches: Match[] = [],
  systemMetadata?: SystemMetadata
) => {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const prevStatusRef = useRef<'playing' | 'waiting' | 'absent'>('absent');

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
      console.log('Permissão de notificação atual:', Notification.permission);
    } else {
      console.warn('Este navegador não suporta notificações de desktop.');
    }
  }, []);

  const requestPermission = async (): Promise<boolean> => {
    if (!('Notification' in window)) {
      console.warn('Seu navegador não suporta notificações nativas.');
      return false;
    }
    
    try {
      console.log('Solicitando permissão de notificação...');
      const result = await Notification.requestPermission();
      console.log('Resultado da permissão:', result);
      setPermission(result);
      
      if (result === 'granted') {
        console.log('Permissão concedida. Verificando messaging e currentPlayer...', !!messaging, !!currentPlayer);
        if (messaging && currentPlayer) {
          try {
            console.log('Obtendo token FCM...');
            // Obter o token do FCM
            const token = await getToken(messaging, {
              vapidKey: 'BNriUQFnNL96aWZWNt1hElYBCaX0rZUIbVGA3S5nndH8cOwhzIPpObuHwGOpgkb0onvSm59rBeEjgX-FMYcLozQ'
            });
            
            if (token) {
              console.log('Token FCM obtido:', token);
              // Salvar o token no perfil do jogador no Firestore
              const playerRef = doc(db, 'players', currentPlayer.id);
              await updateDoc(playerRef, { 
                fcmToken: token,
                pushEnabled: true 
              });
              console.log('FCM Token e Preferência salvos com sucesso no Firestore');
              
              // Mostrar notificação de sucesso
              new Notification('Notificações Ativadas!', {
                body: 'Você será avisado quando for sua vez de jogar.',
                icon: '/pwa-192x192.png'
              });
              return true;
            } else {
              console.warn('Nenhum token FCM retornado.');
              return false;
            }
          } catch (tokenError) {
            console.error('Erro ao obter token FCM:', tokenError);
            return false;
          }
        } else {
          console.warn('Messaging ou currentPlayer não disponíveis para salvar o token.');
          return false;
        }
      } else if (result === 'denied') {
        console.warn('Notificações bloqueadas pelo usuário ou navegador.');
        return false;
      }
    } catch (error) {
      console.error('Erro ao solicitar permissão:', error);
      return false;
    }
    return false;
  };

  useEffect(() => {
    if (!currentPlayer || permission !== 'granted') return;

    let currentStatus: 'playing' | 'waiting' | 'absent' = 'absent';

    if (generationResult) {
      const inTeamA = [generationResult.teamA.setter, ...generationResult.teamA.players].some(p => p?.id === currentPlayer.id);
      const inTeamB = [generationResult.teamB.setter, ...generationResult.teamB.players].some(p => p?.id === currentPlayer.id);
      
      if (inTeamA || inTeamB) {
        currentStatus = 'playing';
      } else {
        const inWaitlist = generationResult.remainingPlayers.some(p => p.id === currentPlayer.id);
        if (inWaitlist) currentStatus = 'waiting';
      }
    }

    // Trigger notification if status changed TO playing
    if (currentStatus === 'playing' && prevStatusRef.current !== 'playing') {
      try {
        const teamA = [generationResult!.teamA.setter, ...generationResult!.teamA.players].filter(Boolean) as Player[];
        const teamB = [generationResult!.teamB.setter, ...generationResult!.teamB.players].filter(Boolean) as Player[];
        
        const inTeamA = teamA.some(p => p.id === currentPlayer.id);
        const teamName = inTeamA ? 'Time A' : 'Time B';
        const myTeam = inTeamA ? teamA : teamB;
        const teammates = myTeam
          .filter(p => p.id !== currentPlayer.id)
          .map(p => p.name)
          .join(', ');

        const now = Date.now();
        const threshold = systemMetadata?.lastResetTimestamp || (now - (16 * 60 * 60 * 1000));
        const sessionMatchesCount = (matches || []).filter(m => m.timestamp > threshold).length;
        const matchNumber = systemMetadata?.dailyMatchCount || (sessionMatchesCount + 1);

        const wins = currentPlayer.dailyWins || 0;
        const losses = currentPlayer.dailyLosses || 0;

        // Try to use Service Worker registration if available (better for mobile)
        navigator.serviceWorker.getRegistration().then(reg => {
          const title = `Partida #${matchNumber} - Sua vez!`;
          const options = {
            body: `Você está no ${teamName} com: ${teammates}.\nHoje: ${wins}V / ${losses}D.\nDirija-se à quadra!`,
            icon: '/pwa-192x192.png',
            vibrate: [200, 100, 200, 100, 200, 100, 200],
            tag: 'match-start',
            renotify: true
          };

          if (reg && reg.showNotification) {
            reg.showNotification(title, options);
          } else {
            new Notification(title, options);
          }
        });
      } catch (e) {
        console.error('Error showing notification', e);
      }
    }

    prevStatusRef.current = currentStatus;
  }, [currentPlayer, generationResult, permission]);

  const disableNotifications = async () => {
    if (!currentPlayer) return;
    
    try {
      const playerRef = doc(db, 'players', currentPlayer.id);
      await updateDoc(playerRef, { 
        fcmToken: null,
        pushEnabled: false
      });
      console.log('Notificações desativadas e preferência salva.');
      // We don't change the browser permission (can't do that via JS), 
      // but we remove the token so no more messages are sent.
    } catch (error) {
      console.error('Erro ao desativar notificações:', error);
    }
  };

  const isEnabled = currentPlayer?.pushEnabled ?? false;
  const isMatchEnabled = currentPlayer?.matchNotificationsEnabled ?? true;

  const toggleMatchNotifications = async () => {
    if (!currentPlayer) return;
    try {
      const newState = !isMatchEnabled;
      const playerRef = doc(db, 'players', currentPlayer.id);
      await updateDoc(playerRef, { matchNotificationsEnabled: newState });
    } catch (error) {
      console.error('Erro ao alternar notificações de partida:', error);
    }
  };

  return { permission, isEnabled, isMatchEnabled, requestPermission, disableNotifications, toggleMatchNotifications };
};
