import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNarration } from './useNarration';
import { useStore } from '../../store';
import { useAIStatus } from './useAIStatus';
import { generateTeamAnnouncementAudio, speakNarration } from '../../services/geminiService';

vi.mock('../../store');
vi.mock('./useAIStatus');
vi.mock('../../services/geminiService');

describe('useNarration', () => {
  let mockStoreState: any;
  const setNarrationScriptMock = vi.fn();
  const setNarrationAudioMock = vi.fn();
  const setIsNarratingMock = vi.fn();
  const setIsNarratingSummaryMock = vi.fn();
  const showNotificationMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockStoreState = {
      generationResult: null,
      setNarrationScript: setNarrationScriptMock,
      setNarrationAudio: setNarrationAudioMock,
      isNarrating: false,
      setIsNarrating: setIsNarratingMock,
      isNarratingSummary: false,
      setIsNarratingSummary: setIsNarratingSummaryMock,
      narrationAudio: null,
      narrationScript: '',
      viewMode: 'generation',
      showNotification: showNotificationMock
    };

    vi.mocked(useStore).mockImplementation(() => mockStoreState);
    vi.mocked(useAIStatus).mockReturnValue({
      status: { isAvailable: true, errorMessage: '', lastQuotaError: 0 },
      isLoading: false,
      refresh: vi.fn()
    });

    vi.mocked(generateTeamAnnouncementAudio).mockResolvedValue('mock-audio-data');
    vi.mocked(speakNarration).mockResolvedValue(undefined);

    // Mock Audio API
    global.Audio = class {
      play = vi.fn().mockResolvedValue(undefined);
      crossOrigin = '';
    } as any;

    // Mock AudioContext
    const mockAudioContext = {
      createOscillator: vi.fn(() => ({
        type: '',
        frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn()
      })),
      createGain: vi.fn(() => ({
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn()
      })),
      createMediaElementSource: vi.fn(() => ({
        connect: vi.fn()
      })),
      destination: {},
      currentTime: 0,
      state: 'running',
      resume: vi.fn()
    };
    (global as any).window.AudioContext = class {
      constructor() { return mockAudioContext; }
    };

    // Mock MediaMetadata
    (global as any).MediaMetadata = class { constructor() {} };

    // Mock MediaSession
    if (!(global as any).navigator) {
      (global as any).navigator = {};
    }
    (global as any).navigator.mediaSession = {
      metadata: null,
      playbackState: 'none'
    };
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('clears narration state when generationResult is null and viewMode is generation', () => {
    mockStoreState.generationResult = null;
    mockStoreState.viewMode = 'generation';

    renderHook(() => useNarration());

    expect(setNarrationScriptMock).toHaveBeenCalledWith('');
    expect(setNarrationAudioMock).toHaveBeenCalledWith(null);
  });

  it('does not clear narration state if generationResult exists', () => {
    mockStoreState.generationResult = { teamA: { players: [] }, teamB: { players: [] } };
    mockStoreState.viewMode = 'generation';

    renderHook(() => useNarration());

    expect(setNarrationScriptMock).not.toHaveBeenCalled();
    expect(setNarrationAudioMock).not.toHaveBeenCalled();
  });

  it('handleAnnounce calls generateTeamAnnouncementAudio when AI is available', async () => {
    const mockTeamA = { players: [{ name: 'Player 1' }] };
    const mockTeamB = { players: [{ name: 'Player 2' }] };
    mockStoreState.generationResult = { teamA: mockTeamA, teamB: mockTeamB };

    const { result } = renderHook(() => useNarration());

    await act(async () => {
      await result.current.handleAnnounce('teams');
    });

    expect(setIsNarratingMock).toHaveBeenCalledWith(true);
    expect(generateTeamAnnouncementAudio).toHaveBeenCalledWith(mockTeamA, mockTeamB);
    expect(setNarrationAudioMock).toHaveBeenCalledWith('mock-audio-data');

  });

  it('handleAnnounce falls back to speakNarration when AI is not available', async () => {
    const mockTeamA = { players: [{ name: 'Player 1' }, { name: 'Player 3' }] };
    const mockTeamB = { players: [{ name: 'Player 2' }] };
    mockStoreState.generationResult = { teamA: mockTeamA, teamB: mockTeamB };

    vi.mocked(useAIStatus).mockReturnValue({
      status: { isAvailable: false, errorMessage: 'Quota exceeded', lastQuotaError: 0 },
      isLoading: false,
      refresh: vi.fn()
    });

    const { result } = renderHook(() => useNarration());

    await act(async () => {
      await result.current.handleAnnounce('teams');
    });

    expect(showNotificationMock).toHaveBeenCalledWith('Quota exceeded', 'info');
    expect(showNotificationMock).toHaveBeenCalledWith('Voz premium indisponível. Usando narração básica.', 'info');
    expect(generateTeamAnnouncementAudio).not.toHaveBeenCalled();
    expect(speakNarration).toHaveBeenCalledWith(
      'As equipes estão prontas! Equipe A com 2 jogadores e Equipe B com 1 jogadores. Bom jogo!',
      false
    );
  });

  it('announceWinner formats string correctly and calls speakNarration', async () => {
    const { result } = renderHook(() => useNarration());

    await act(async () => {
      await result.current.announceWinner('A', 25, 20);
    });

    expect(speakNarration).toHaveBeenCalledWith('Vencedor. Equipe A.', false);

    await act(async () => {
      await result.current.announceWinner('B', 20, 25);
    });

    expect(speakNarration).toHaveBeenCalledWith('Vencedor. Equipe B.', false);
  });
});
