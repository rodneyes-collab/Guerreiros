
import { useEffect, useCallback } from 'react';
import { useStore } from '../../store';
import { generateNarrationScript, getNarrationAudio, speakNarration } from '../../services/geminiService';

export const useNarration = () => {
  const { 
    generationResult, 
    setNarrationScript, 
    setNarrationAudio,
    isNarrating,
    setIsNarrating,
    narrationAudio,
    narrationScript
  } = useStore();

  useEffect(() => {
    if (!generationResult) {
      setNarrationScript('');
      setNarrationAudio(null);
    }
  }, [generationResult, setNarrationScript, setNarrationAudio]);

  const playWhistle = () => {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1760, audioCtx.currentTime + 0.1);
    oscillator.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.2);

    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.5);
  };

  const handleAnnounce = useCallback(async () => {
    if (!generationResult || isNarrating) return;
    setIsNarrating(true);
    try {
      playWhistle();
      // Wait for whistle to finish
      await new Promise(resolve => setTimeout(resolve, 600));
      
      // If we have pre-loaded audio, use it immediately
      if (narrationAudio) {
        const audio = new Audio(narrationAudio);
        await audio.play();
      } else {
        // Fallback if audio wasn't ready
        const script = narrationScript || await generateNarrationScript(generationResult.teamA, generationResult.teamB);
        await speakNarration(script);
      }
    } catch (error) {
      console.error("Announce Error:", error);
      // Last resort fallback
      if (narrationScript) {
        const utterance = new SpeechSynthesisUtterance(narrationScript);
        utterance.lang = 'pt-BR';
        window.speechSynthesis.speak(utterance);
      }
    } finally {
      setIsNarrating(false);
    }
  }, [generationResult, isNarrating, narrationAudio, narrationScript, setIsNarrating]);

  return { handleAnnounce };
};
