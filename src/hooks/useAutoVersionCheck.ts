import { useEffect, useState } from 'react';
import { APP_VERSION } from '../../constants';
import { forceAppUpdate } from '../utils/forceAppUpdate';

export function useAutoVersionCheck() {
  const [hasNewVersion, setHasNewVersion] = useState(false);
  const [serverVersion, setServerVersion] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const checkVersion = async () => {
      try {
        const res = await fetch(`/api/version?t=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache, no-store' }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.version && isMounted) {
            setServerVersion(data.version);
            if (data.version !== APP_VERSION) {
              console.log(`[VersionCheck] Server version (${data.version}) differs from app (${APP_VERSION}). Triggering update...`);
              setHasNewVersion(true);
              setTimeout(() => {
                forceAppUpdate();
              }, 1500);
            }
          }
        }
      } catch (err) {
        // Silent fail if offline
      }
    };

    checkVersion();
    const interval = setInterval(checkVersion, 60000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkVersion();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      isMounted = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return {
    hasNewVersion,
    serverVersion,
    currentVersion: APP_VERSION,
    forceUpdate: forceAppUpdate
  };
}
