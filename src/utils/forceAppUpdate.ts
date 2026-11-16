import { APP_VERSION } from '../../constants';

let isUpdating = false;

export async function forceAppUpdate(targetVersion?: string) {
  if (isUpdating) return;
  isUpdating = true;

  const effectiveTarget = targetVersion || APP_VERSION;
  console.info(`[ForceAppUpdate] Atualizando de v${APP_VERSION} para v${effectiveTarget} (preservando sessão do sócio)...`);

  try {
    // 1. Marcar tentativa na sessão para nunca entrar em loop infinito de reload
    sessionStorage.setItem(`update_attempt_${effectiveTarget}`, 'true');
    sessionStorage.setItem('guerreiros_confirmed_version', effectiveTarget);
    localStorage.setItem('guerreiros_app_version', effectiveTarget);
    localStorage.setItem('last_auto_update_target', effectiveTarget);

    // 2. Remover APENAS caches de intenção obsoletos, preservando o login do sócio (simpleLoginEmail, etc.)
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('intentions_cache') || k.startsWith('preconfirmations_cache'))) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));

    // 3. Desregistrar Service Workers antigos para não servirem JS antigo do cache
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(r => r.unregister().catch(() => {})));
    }

    // 4. Limpar Cache Storage (arquivos estáticos JS/CSS/HTML antigos)
    if ('caches' in window) {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map(k => caches.delete(k).catch(() => {})));
    }
  } catch (err) {
    console.warn('[ForceAppUpdate] Aviso durante limpeza de cache:', err);
  } finally {
    // 5. Recarregar com cache-buster na URL mantendo o sócio na aba atual
    const url = new URL(window.location.href);
    url.searchParams.set('v', effectiveTarget);
    url.searchParams.set('t', String(Date.now()));
    window.location.replace(url.toString());
  }
}