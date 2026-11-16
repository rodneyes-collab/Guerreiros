import { useEffect, useRef, useState } from 'react';

/**
 * Hook nativo Screen Wake Lock API:
 * Impede que a tela do celular ou tablet apague sozinha na beira da quadra
 * enquanto uma partida estiver ativa.
 */
export const useWakeLock = (enabled: boolean = true) => {
    const wakeLockRef = useRef<any>(null);
    const [isWakeLockActive, setIsWakeLockActive] = useState(false);

    useEffect(() => {
        if (!enabled || typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
            if (wakeLockRef.current) {
                wakeLockRef.current.release().catch(() => { });
                wakeLockRef.current = null;
                setIsWakeLockActive(false);
            }
            return;
        }

        let isMounted = true;

        const requestWakeLock = async () => {
            try {
                if (document.visibilityState === 'visible' && !wakeLockRef.current) {
                    wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
                    if (isMounted) setIsWakeLockActive(true);

                    wakeLockRef.current.addEventListener('release', () => {
                        wakeLockRef.current = null;
                        if (isMounted) setIsWakeLockActive(false);
                    });
                }
            } catch {
                // Silencioso caso o modo de economia extrema de bateria do SO bloqueie
                if (isMounted) setIsWakeLockActive(false);
            }
        };

        requestWakeLock();

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && enabled) {
                requestWakeLock();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            isMounted = false;
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (wakeLockRef.current) {
                wakeLockRef.current.release().catch(() => { });
                wakeLockRef.current = null;
            }
        };
    }, [enabled]);

    return { isWakeLockActive };
};