import { useShallow } from 'zustand/react/shallow';

import { useEffect, useCallback } from 'react';
import { useStore } from '../../store';
import { generateNarrationScript, generateDailySummaryAudio, generateTeamAnnouncementAudio, speakNarration } from '../../services/geminiService';
import { useAIStatus } from './useAIStatus';

export const useNarration = () => {
  const { status: aiStatus } = useAIStatus();
  const { 
    generationResult, 
    setNarrationScript, 
    setNarrationAudio,
    isNarrating,
    setIsNarrating,
    isNarratingSummary,
    setIsNarratingSummary,
    narrationAudio,
    narrationScript,
    viewMode,
    showNotification
  } = useStore(useShallow(state => ({generationResult: state.generationResult, setNarrationScript: state.setNarrationScript, setNarrationAudio: state.setNarrationAudio, isNarrating: state.isNarrating, setIsNarrating: state.setIsNarrating, isNarratingSummary: state.isNarratingSummary, setIsNarratingSummary: state.setIsNarratingSummary, narrationAudio: state.narrationAudio, narrationScript: state.narrationScript, viewMode: state.viewMode, showNotification: state.showNotification})));

  useEffect(() => {
    // Only clear narration if we're in generation mode and result was cleared,
    // or if we switch away from a view that uses narration.
    if (!generationResult && viewMode === 'generation') {
      setNarrationScript('');
      setNarrationAudio(null);
    }
  }, [generationResult, viewMode, setNarrationScript, setNarrationAudio]);

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

  const playAudioContent = useCallback(async (content: string, type: 'teams' | 'ranking') => {
    if (!content) return;
    
    try {
      const audio = new Audio(content);
      audio.crossOrigin = "anonymous";

      // Media Session Metadata
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: type === 'teams' ? 'Escalação das Equipes' : 'Resumo do Dia',
          artist: 'Guerreiros Volleyball Club',
          album: 'Guerreiros Intelligence',
          artwork: [
            { src: 'https://picsum.photos/seed/volleyball/512/512', sizes: '512x512', type: 'image/png' }
          ]
        });
        navigator.mediaSession.playbackState = 'playing';
      }

      // Web Audio API routing for focus
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const audioCtx = new AudioContextClass();
          const source = audioCtx.createMediaElementSource(audio);
          source.connect(audioCtx.destination);
          if (audioCtx.state === 'suspended') await audioCtx.resume();
        }
      } catch (e) { console.warn("Audio Context failed", e); }

      setIsNarrating(type === 'teams');
      setIsNarratingSummary(type === 'ranking');

      // Safety timeout in case onended doesn't fire (max 3 minutes for long narrations)
      const safetyTimeout = setTimeout(() => {
        setIsNarrating(false);
        setIsNarratingSummary(false);
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
      }, 180000);

      audio.onerror = (e) => {
        console.error("Audio playback error:", e);
        clearTimeout(safetyTimeout);
        setIsNarrating(false);
        setIsNarratingSummary(false);
        speakNarration("Erro na reprodução. Guerreiros Volleyball!", false);
      };

      await audio.play();
      
      audio.onended = () => {
        clearTimeout(safetyTimeout);
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
        setIsNarrating(false);
        setIsNarratingSummary(false);
      };
    } catch (error) {
      console.error("Play error:", error);
      setIsNarrating(false);
      setIsNarratingSummary(false);
    }
  }, [setIsNarrating, setIsNarratingSummary]);

  const handleAnnounce = useCallback(async (type: 'teams' | 'ranking' = 'teams', rankingData?: any, forceRefresh = false) => {
    if (isNarrating || isNarratingSummary) return;
    
    // Use cached audio if available and not forcing refresh
    if (!forceRefresh && narrationAudio) {
      await playAudioContent(narrationAudio, type);
      return;
    }

    // Always clear/reset narration state if starting new generation
    setNarrationAudio(null);

    if (type === 'teams' && !generationResult) return;

    // Set state immediately to show "Generating..."
    if (type === 'ranking') {
      setIsNarratingSummary(true);
    } else {
      setIsNarrating(true);
    }

    try {
      // Setup Media Session Metadata
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: type === 'teams' ? 'Escalação das Equipes' : 'Resumo do Dia',
          artist: 'Guerreiros Volleyball Club',
          album: 'Guerreiros Intelligence',
          artwork: [
            { src: 'https://picsum.photos/seed/volleyball/512/512', sizes: '512x512', type: 'image/png' },
          ]
        });
      }

      // Play whistle effect
      playWhistle();
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Start AI generation
      let audioData = null;
      
      if (!aiStatus.isAvailable) {
        console.warn("[Narration] AI is not available:", aiStatus.errorMessage);
        showNotification(aiStatus.errorMessage, "info");
      } else {
        try {
          if (type === 'teams') {
            audioData = await generateTeamAnnouncementAudio(generationResult!.teamA, generationResult!.teamB);
          } else {
            audioData = await generateDailySummaryAudio({
              mvp: rankingData?.mvp?.name || rankingData?.dailyMvp?.name || rankingData?.mvp,
              bestSetter: rankingData?.bestSetter?.name || rankingData?.dailyBestSetter?.name || rankingData?.bestSetter,
              dailyKing: rankingData?.dailyKing?.name || rankingData?.dailyKing,
              matchesCount: rankingData?.matchesCount || rankingData?.dailyMatchesCount,
              rankingChanges: rankingData?.rankingChanges,
              sessionLeaderboard: rankingData?.sessionLeaderboard,
              date: rankingData?.date,
              avgMatchTime: rankingData?.avgMatchTime,
              summaryType: rankingData?.summaryType 
            });
          }
        } catch (error: any) {
          console.error("[Narration] AI generation failed:", error);
        }
      }

      if (audioData) {
        setNarrationAudio(audioData);
        // Important: playAudioContent will take over state management (setIsNarrating, etc)
        // and handle the onended reset.
        await playAudioContent(audioData, type);
      } else {
        // Fallback or Quota reached
        setIsNarrating(false);
        setIsNarratingSummary(false);
        showNotification("Voz premium indisponível. Usando narração básica.", "info");
        const fallback = type === 'teams' 
          ? `As equipes estão prontas! Equipe A com ${generationResult?.teamA.players.length} jogadores e Equipe B com ${generationResult?.teamB.players.length} jogadores. Bom jogo!`
          : "Resumo do dia pronto! Parabéns aos guerreiros pelo desempenho e evolução no ranking!";
        await speakNarration(fallback, false);
      }
    } catch (error) {
      console.error("Announce Error:", error);
      setIsNarrating(false);
      setIsNarratingSummary(false);
    }
  }, [generationResult, isNarrating, isNarratingSummary, narrationAudio, setNarrationAudio, setIsNarrating, setIsNarratingSummary, playAudioContent, showNotification]);

  const announceWinner = useCallback(async (winner: 'A' | 'B', _scoreA: number, _scoreB: number) => {
    const winnerLabel = winner === 'A' ? 'A' : 'B';
    const text = `Vencedor. Equipe ${winnerLabel}.`;
    await speakNarration(text, false);
  }, []);

  return { handleAnnounce, announceWinner, playAudioContent };
};
