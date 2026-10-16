import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { playSound } from './audio';

describe('playSound', () => {
  let playMock: ReturnType<typeof vi.fn>;
  let consoleInfoMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Mock the Audio constructor and its methods
    playMock = vi.fn().mockResolvedValue(undefined);
    const audioMock = vi.fn(function(this: any, src: string) {
      this.src = src;
      this.play = playMock;
    });
    vi.stubGlobal('Audio', audioMock);

    // Mock console.info
    consoleInfoMock = vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('should play the correct audio file for winA', () => {
    playSound('winA');
    expect(window.Audio).toHaveBeenCalledWith('/audio/winA.mp3');
    expect(playMock).toHaveBeenCalled();
  });

  it('should play the correct audio file for winB', () => {
    playSound('winB');
    expect(window.Audio).toHaveBeenCalledWith('/audio/winB.mp3');
    expect(playMock).toHaveBeenCalled();
  });

  it('should play the correct audio file for announce', () => {
    playSound('announce');
    expect(window.Audio).toHaveBeenCalledWith('/audio/announce.mp3');
    expect(playMock).toHaveBeenCalled();
  });

  it('should play the correct audio file for success', () => {
    playSound('success');
    expect(window.Audio).toHaveBeenCalledWith('/audio/success.mp3');
    expect(playMock).toHaveBeenCalled();
  });

  it('should silently fail and log if audio file is missing (play rejects)', async () => {
    // Make play reject
    playMock.mockRejectedValueOnce(new Error('Not found'));

    // Call playSound
    playSound('winA');

    // We need to wait for the promise to resolve to allow the catch block to run
    await Promise.resolve();

    // Expect console.info to have been called
    expect(consoleInfoMock).toHaveBeenCalledWith('Sound file not found: /audio/winA.mp3');
  });
});
