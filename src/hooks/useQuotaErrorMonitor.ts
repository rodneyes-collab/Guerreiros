import { useState, useEffect } from 'react';

export const useQuotaErrorMonitor = () => {
  const [isQuotaModalOpen, setIsQuotaModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleWindowError = (event: ErrorEvent | PromiseRejectionEvent) => {
      let msg = '';
      if ('reason' in event) {
        msg = event.reason?.message || String(event.reason || '');
      } else if ('message' in event) {
        msg = event.message || '';
      }

      if (
        msg.includes('QuotaExceededError') ||
        msg.includes('quota exceeded') ||
        msg.includes('IDBObjectStore') ||
        msg.includes('Failed to execute \'add\' on \'IDBObjectStore\'') ||
        msg.includes('storage quota')
      ) {
        console.warn('[QuotaMonitor] Erro de cota detectado em tempo de execução:', msg);
        setErrorMessage(msg);
        setIsQuotaModalOpen(true);
      }
    };

    window.addEventListener('error', handleWindowError as EventListener);
    window.addEventListener('unhandledrejection', handleWindowError as EventListener);

    return () => {
      window.removeEventListener('error', handleWindowError as EventListener);
      window.removeEventListener('unhandledrejection', handleWindowError as EventListener);
    };
  }, []);

  return {
    isQuotaModalOpen,
    setIsQuotaModalOpen,
    errorMessage
  };
};
