import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import confetti from 'canvas-confetti';
import { db, doc, setDoc } from '../../firebase';

// Create a custom confetti instance with worker disabled to prevent getBoundingClientRect error in hidden iframes
const fireConfetti = confetti.create(undefined, { useWorker: false, resize: true });

export const useWelcomeCelebration = () => {
  const {
 currentPlayer } = useStore(useShallow(state => ({
      currentPlayer: state.currentPlayer
    })));
  const [showWelcome, setShowWelcome] = useState(false);
  const [hasTriggered, setHasTriggered] = useState(false);

  useEffect(() => {
    if (currentPlayer && !currentPlayer.hasSeenWelcome && !hasTriggered) {
      setHasTriggered(true);
      
      // Trigger confetti
      fireConfetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#F5C429', '#FFFFFF', '#000000']
      });

      setShowWelcome(true);

      // Auto-hide after 30 seconds
      const timer = setTimeout(() => {
        setShowWelcome(false);
      }, 30000);

      // Mark as seen in Firestore
      const playerRef = doc(db, 'players', currentPlayer.id);
      setDoc(playerRef, { hasSeenWelcome: true }, { merge: true })
        .catch(err => console.error("Error updating welcome status:", err));

      return () => clearTimeout(timer);
    }
  }, [currentPlayer, hasTriggered]);

  return {
    showWelcome,
    setShowWelcome
  };
};
