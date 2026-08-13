export async function forceAppUpdate() {
  console.log('[AppUpdate] Forcing cache cleanup and service worker unregistration...');
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
        console.log('[AppUpdate] Unregistered SW:', registration);
      }
    }
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        await caches.delete(name);
        console.log('[AppUpdate] Deleted cache:', name);
      }
    }
  } catch (e) {
    console.error('[AppUpdate] Error during cache cleanup:', e);
  } finally {
    window.location.href = window.location.origin + window.location.pathname + '?reload=' + Date.now();
  }
}
