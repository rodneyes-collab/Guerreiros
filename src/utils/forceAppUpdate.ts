export async function forceAppUpdate() {
  console.log('[AppUpdate] Forcing absolute cache cleanup and full system reset...');
  try {
    // 1. Unregister all service workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
        console.log('[AppUpdate] Unregistered SW:', registration.scope);
      }
    }
    
    // 2. Clear ALL cache storage
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        await caches.delete(name);
        console.log('[AppUpdate] Purged cache:', name);
      }
    }

    // 3. Optional: Specific key cleanup if we have version markers
    localStorage.removeItem('guerreiros_app_version');
    
  } catch (e) {
    console.error('[AppUpdate] Critical error during cleanup:', e);
  } finally {
    // 4. Give it a moment to settle then force reload with hard bypass and timestamp
    setTimeout(() => {
      console.log('[AppUpdate] Reloading with hard cache bust...');
      const url = new URL(window.location.origin + window.location.pathname);
      url.searchParams.set('v_update', Date.now().toString());
      window.location.href = url.toString();
    }, 500);
  }
}
