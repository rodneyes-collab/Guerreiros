import { useState, useEffect } from 'react';

export interface AIStatus {
  isAvailable: true | false;
  lastQuotaError: number;
  errorMessage: string;
}

export function useAIStatus() {
  const [status, setStatus] = useState<AIStatus>({
    isAvailable: true,
    lastQuotaError: 0,
    errorMessage: ''
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/ai/status');
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      // Supress console.error to avoid noise during dev server restarts or network disconnects
      setStatus(prev => ({ ...prev, isAvailable: false }));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Poll every minute
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  return { status, isLoading, refresh: fetchStatus };
}
