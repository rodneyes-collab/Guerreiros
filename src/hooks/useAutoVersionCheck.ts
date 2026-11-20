import { useEffect, useState, useCallback } from 'react';
import { APP_VERSION } from '../../constants';
import { forceAppUpdate } from '../utils/forceAppUpdate';
import { useStore } from '../../store';
import { diagnosticLogService } from '../services/diagnosticLogService';

export function useAutoVersionCheck() {
  const [hasNewVersion, setHasNewVersion] = useState(false);
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const firestoreAppVersion = useStore(state => state.systemMetadata?.appVersion);

  // Compara versões semânticas (ex: "3.9.2" > "3.9.1")
  const isNewerVersion = useCallback((current: string, incoming: string) => {
    if (!current || !incoming) return false;
    const cleanCurrent = String(current).replace(/^v/i, '').trim();
    const cleanIncoming = String(incoming).replace(/^v/i, '').trim();
    if (cleanCurrent === cleanIncoming) return false;

    const c = cleanCurrent.split('.').map(n => parseInt(n, 10) || 0);
    const i = cleanIncoming.split('.').map(n => parseInt(n, 10) || 0);
    const len = Math.max(c.length, i.length);

    for (let x = 0; x < len; x++) {
      const cv = c[x] || 0;
      const iv = i[x] || 0;
      if (iv > cv) return true;
      if (iv < cv) return false;
    }
    return false;
  }, []);

  // Registra a versão atual carregada com sucesso
  useEffect(() => {
    (window as any).__RUNNING_APP_VERSION__ = APP_VERSION;

    try {
      const storedVersion = localStorage.getItem('guerreiros_app_version');
      const confirmedVersion = sessionStorage.getItem('guerreiros_confirmed_version');

      if (storedVersion !== APP_VERSION || confirmedVersion !== APP_VERSION) {
        diagnosticLogService.log('info', `Committed successful version load: v${APP_VERSION}`, {
          previousStored: storedVersion,
          previousConfirmed: confirmedVersion
        });
        localStorage.setItem('guerreiros_app_version', APP_VERSION);
        sessionStorage.setItem('guerreiros_confirmed_version', APP_VERSION);
      }
    } catch (e) {}
  }, []);

  // Verifica a versão real disponível no servidor (/api/version) antes de forçar atualização
  const checkVersion = useCallback(async () => {
    try {
      const res = await fetch(`/api/version?v=${Date.now()}&r=${Math.random()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });

      if (!res.ok) return;
      const data = await res.json();
      const apiVersion: string | undefined = data?.version;

      if (!apiVersion) return;
      setServerVersion(apiVersion);

      // Só existe atualização real se o próprio servidor onde o celular está conectado
      // estiver servindo uma versão superior ao APP_VERSION atual do navegador.
      if (isNewerVersion(APP_VERSION, apiVersion)) {
        const sessionUpdateKey = `update_attempt_${apiVersion}`;
        const alreadyAttemptedInSession = sessionStorage.getItem(sessionUpdateKey);

        if (alreadyAttemptedInSession) {
          // Já tentou atualizar nesta sessão e o servidor/CDN entregou o mesmo bundle:
          // Não exibir banner bloqueante infinito para não impedir o sócio de confirmar presença!
          console.warn(
            `[VersionCheck] Atualização para v${apiVersion} já tentada nesta sessão. Liberando uso normal em v${APP_VERSION}.`
          );
          setHasNewVersion(false);
          return;
        }

        diagnosticLogService.log(
          'version_check',
          `Nova versão disponível no servidor: v${apiVersion} (Atual: v${APP_VERSION})`
        );
        setHasNewVersion(true);

        sessionStorage.setItem(sessionUpdateKey, 'true');
        localStorage.setItem('last_auto_update_target', apiVersion);

        setTimeout(() => {
          forceAppUpdate(apiVersion);
        }, 1200);
      } else {
        // O servidor está na mesma versão (ou anterior) que o app rodando no celular
        setHasNewVersion(false);
      }
    } catch (err) {
      // Silencioso se offline para não atrapalhar o uso do sócio
      setHasNewVersion(false);
    }
  }, [isNewerVersion]);

  // Dispara verificação quando o Firestore reportar mudança de versão ou periodicamente
  useEffect(() => {
    checkVersion();
  }, [firestoreAppVersion, checkVersion]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        checkVersion();
      }
    }, 300000); // Checa a cada 5 min apenas quando a aba está visível

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkVersion();
      }
    };

    window.addEventListener('focus', checkVersion);
    window.addEventListener('online', checkVersion);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', checkVersion);
      window.removeEventListener('online', checkVersion);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [checkVersion]);

  return {
    hasNewVersion,
    serverVersion,
    currentVersion: APP_VERSION,
    forceUpdate: forceAppUpdate
  };
}