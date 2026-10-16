
/**
 * Utility for audio and haptic feedback
 */
export const playFeedbackSound = (type: 'success' | 'error' | 'scan') => {
  const audioMap = {
    success: '/audio/success.mp3',
    error: '/audio/error.mp3',
    scan: '/audio/announce.mp3'
  };
  
  const audio = new Audio(audioMap[type]);
  audio.play().catch(() => {
    // Fallback or ignore if audio blocked/missing
  });
};

export const triggerHaptic = (type: 'success' | 'error' | 'light') => {
  if (!navigator.vibrate) return;
  
  switch (type) {
    case 'success':
      navigator.vibrate([50, 30, 50]);
      break;
    case 'error':
      navigator.vibrate([200, 100, 200]);
      break;
    case 'light':
      navigator.vibrate(15);
      break;
  }
};
