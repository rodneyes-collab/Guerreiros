import React, { useEffect } from 'react';
import { useStore } from '../../store';

export const TimerTracker: React.FC = () => {
  const generationResult = useStore(state => state.generationResult);
  const systemMetadata = useStore(state => state.systemMetadata);
  const setElapsedTime = useStore(state => state.setElapsedTime);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (generationResult && systemMetadata.matchStartTime) {
      // Update immediately
      const updateTimer = () => {
        const now = Date.now();
        const start = systemMetadata.matchStartTime || now;
        const elapsed = Math.floor((now - start) / 1000);
        setElapsedTime(Math.max(0, elapsed));
      };

      updateTimer();
      interval = setInterval(updateTimer, 1000);
    } else {
      setElapsedTime(0);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [generationResult, systemMetadata.matchStartTime, setElapsedTime]);

  return null; // This component only manages state, it does not render anything
};
