
import { useEffect, useCallback } from 'react';
import { useStore } from '../../store';
import { generateNarrationScript, generateDailySummaryAudio, generateTeamAnnouncementAudio, speakNarration } from '../../services/geminiService';

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

  const handleAnnounce = useCallback(async (type: 'teams' | 'ranking' = 'teams', rankingData?: any) => {
    if (isNarrating) return;
    
    if (type === 'teams' && !generationResult) return;

    setIsNarrating(true);
    try {
      // Setup Media Session Metadata
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: type === 'teams' ? 'Escalação das Equipes' : 'Resumo do Dia',
          artist: 'Guerreiros Volleyball Club',
          album: 'Guerreiros Intelligence',
          artwork: [
            { src: 'https://picsum.photos/seed/volleyball/96/96', sizes: '96x96', type: 'image/png' },
            { src: 'https://picsum.photos/seed/volleyball/128/128', sizes: '128x128', type: 'image/png' },
            { src: 'https://picsum.photos/seed/volleyball/192/192', sizes: '192x192', type: 'image/png' },
            { src: 'https://picsum.photos/seed/volleyball/256/256', sizes: '256x256', type: 'image/png' },
            { src: 'https://picsum.photos/seed/volleyball/384/384', sizes: '384x384', type: 'image/png' },
            { src: 'https://picsum.photos/seed/volleyball/512/512', sizes: '512x512', type: 'image/png' },
          ]
        });
      }

      // Start AI generation immediately if not already in store
      const audioPromise = (async () => {
        if (narrationAudio) return { type: 'audio', content: narrationAudio };

        if (type === 'teams') {
          const audioData = await generateTeamAnnouncementAudio(generationResult!.teamA, generationResult!.teamB);
          if (audioData) setNarrationAudio(audioData);
          return { type: 'audio', content: audioData };
        } else {
          const audioData = await generateDailySummaryAudio({
            mvp: rankingData.dailyMvp?.name,
            bestSetter: rankingData.dailyBestSetter?.name,
            dailyKing: rankingData.dailyKing?.name,
            matchesCount: rankingData.dailyMatchesCount,
            rankingChanges: rankingData.rankingChanges // Passando as mudanças de ranking
          });
          if (audioData) setNarrationAudio(audioData);
          return { type: 'audio', content: audioData };
        }
      })();

      // Play whistle
      playWhistle();
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Wait for audio to be ready
      const result = await audioPromise;
      
      if (result.type === 'audio' && result.content) {
        try {
          const audio = new Audio(result.content);
          audio.crossOrigin = "anonymous";

          // Tenta forçar o Audio Focus usando Web Audio API
          try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioContextClass) {
              const audioCtx = new AudioContextClass();
              const source = audioCtx.createMediaElementSource(audio);
              source.connect(audioCtx.destination);
              if (audioCtx.state === 'suspended') {
                await audioCtx.resume();
              }
            }
          } catch (ctxError) {
            console.warn("Web Audio API routing failed:", ctxError);
          }

          audio.onerror = (e) => {
            console.error("Audio playback error:", e);
            speakNarration("Racha épico hoje! Parabéns a todos!", false);
          };
          
          if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'playing';
          }
          
          await audio.play();
          
          audio.onended = () => {
            if ('mediaSession' in navigator) {
              navigator.mediaSession.playbackState = 'none';
            }
          };
        } catch (playError) {
          console.error("Audio play() failed:", playError);
          await speakNarration("Racha épico hoje! Parabéns a todos!", false);
        }
      } else {
        // Fallback
        const fallback = "Racha épico hoje! Parabéns a todos!";
        await speakNarration(fallback, false);
      }
    } catch (error) {
      console.error("Announce Error:", error);
    } finally {
      setIsNarrating(false);
    }
  }, [generationResult, isNarrating, narrationAudio, setNarrationAudio, setIsNarrating]);

  return { handleAnnounce };
};
