import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppLogic } from './useAppLogic';

// Setup basic mocks
vi.mock('../../firebase', () => ({
  db: {},
  doc: vi.fn(),
  updateDoc: vi.fn(),
  collection: vi.fn(),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined)
  })),
  handleFirestoreError: vi.fn(),
  trackUsage: vi.fn(),
  serverTimestamp: vi.fn(),
  getFirestoreDateKey: vi.fn(() => '2023-10-27')
}));

vi.mock('../../utils/helpers', () => ({
  generateUUID: vi.fn(() => 'test-uuid'),
  cleanObject: vi.fn(obj => obj)
}));

// Mock the Zustand store
const mockSetDbStatus = vi.fn();
const mockShowNotification = vi.fn();
const mockSetAttendance = vi.fn();

vi.mock('../../store', () => {
  return {
    useStore: vi.fn((selector) => {
      // Very basic implementation of Zustand selector mock
      const state = {
        attendance: [{ id: 'player1' }, { id: 'player2' }],
        setDbStatus: mockSetDbStatus,
        showNotification: mockShowNotification,
        setAttendance: mockSetAttendance,
        // Provide mock for other store pieces that might be read during init
        user: null,
        userRole: null,
        players: [{ id: 'player1' }, { id: 'player2' }],
        currentPlayer: null,
        preConfirmations: [],
        matches: [],
        systemMetadata: { matchNotificationsGlobalEnabled: true },
        generationResult: null,
        teamGenerationMode: 'default',
        setTeamGenerationMode: vi.fn(),
        balancingRatingMode: 'default',
        setBalancingRatingMode: vi.fn(),
        balancingStrategy: 'default',
        setPlayers: vi.fn(),
        setMatches: vi.fn(),
        setGenerationResult: vi.fn(),
        setSystemMetadata: vi.fn(),
        setViewMode: vi.fn(),
        showConfirmModal: vi.fn(),
        hideConfirmModal: vi.fn(),
        setAnalysis: vi.fn(),
        setRuleVerification: vi.fn(),
        setScoreA: vi.fn(),
        setScoreB: vi.fn(),
        setTempScoreA: vi.fn(),
        setTempScoreB: vi.fn(),
        setScoreMode: vi.fn(),
        setNarrationScript: vi.fn(),
        setNarrationAudio: vi.fn(),
        setUser: vi.fn(),
        setUserRole: vi.fn(),
        setCurrentPlayer: vi.fn(),
        scoreA: 0,
        scoreB: 0,
        tempScoreA: 0,
        tempScoreB: 0,
        scoreMode: 'sets',
        isSyncing: false,
        setIsSyncing: vi.fn(),
        elapsedTime: 0,
        setIsAnalyzing: vi.fn(),
        isAnalyzing: false,
        viewMode: 'presence',
        activeTournament: null,
        setActiveTournament: vi.fn(),
      };
      return selector(state);
    })
  };
});

describe('useAppLogic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('removeAttendance', () => {
    it('should remove a player from attendance', async () => {
      const { result } = renderHook(() => useAppLogic());

      await act(async () => {
        await result.current.removeAttendance('player1');
      });

      // It updates the attendance list in the store (removes player1) optimism
      expect(mockSetAttendance).toHaveBeenCalledWith(
        expect.arrayContaining([{ id: 'player2' }])
      );

      // Since mockSetAttendance is called with a filtered array, let's verify length
      const setAttendanceCall = mockSetAttendance.mock.calls[0][0];
      expect(setAttendanceCall).toHaveLength(1);
      expect(setAttendanceCall[0].id).toBe('player2');

      expect(mockShowNotification).toHaveBeenCalledWith('Presença removida.', 'info');
    });
  });
});
