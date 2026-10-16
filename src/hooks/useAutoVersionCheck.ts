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
        const res = await fetch(`/api/version?v=${Date.now()}&r=${Math.random()}`, {
          cache: 'no-store',
          headers: { 
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.version && isMounted) {
            setServerVersion(data.version);
            if (data.version !== APP_VERSION) {
              console.log(`[VersionCheck] Server version (${data.version}) differs from app (${APP_VERSION}).`);
              setHasNewVersion(true);
              
              // AUTO-UPDATE LOGIC:
              // To prevent infinite reload loops, we check if we already tried to update to THIS version
              const lastUpdateAttempt = localStorage.getItem('last_auto_update_target');
              if (lastUpdateAttempt !== data.version) {
                console.log(`[VersionCheck] Triggering automatic update to v${data.version}...`);
                localStorage.setItem('last_auto_update_target', data.version);
                setTimeout(() => {
                  forceAppUpdate();
                }, 2000); // Give user 2 seconds to see the message if displayed
              }
            } else {
              setHasNewVersion(false);
            }
          }
        }
      } catch (err) {
        // Silent fail if offline
      }
    };

    checkVersion();
    const interval = setInterval(checkVersion, 30000); // Check every 30 seconds for faster auto-updates

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkVersion();
      }
    };
    window.addEventListener('focus', checkVersion);
    window.addEventListener('online', checkVersion);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('focus', checkVersion);
      window.removeEventListener('online', checkVersion);
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
