import React, { useEffect } from 'react';
import { useStore } from '../../store';

/**
 * ⚡ Bolt: Performance Optimization
 * Isolates the elapsed time interval logic and Zustand subscription from App.tsx.
 * Previously, updating `elapsedTime` every second caused the entire App component
 * (and its children) to re-render. By extracting this into a dedicated, headless
 * child component, we prevent cascading re-renders across the main view manager.
 */
const TimerTracker: React.FC = () => {
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

  return null;
};

export default TimerTracker;
