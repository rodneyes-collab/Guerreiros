
export const playSound = (type: 'winA' | 'winB' | 'announce') => {
  const audio = new Audio(`/audio/${type}.mp3`);
  audio.play().catch(e => {
    // Silently fail if audio file is missing
    console.info(`Sound file not found: /audio/${type}.mp3`);
  });
};
