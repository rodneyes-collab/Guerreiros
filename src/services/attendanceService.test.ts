import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearAttendanceHistory, fetchAttendanceHistory, calculateAttendanceStats } from './attendanceService';
import { db, getDocs, collection, writeBatch } from '../../firebase';

// Mock Firebase
vi.mock('../../firebase', () => {
  return {
    db: {},
    collection: vi.fn(),
    getDocs: vi.fn(),
    writeBatch: vi.fn(),
  };
});

// Mock console.error to avoid noise in tests
console.error = vi.fn();

describe('attendanceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('clearAttendanceHistory', () => {
    it('should clear all attendance documents and their subcollections', async () => {
      // Setup mock data
      const mockBatch = {
        delete: vi.fn(),
        commit: vi.fn(),
      };
      (writeBatch as any).mockReturnValue(mockBatch);

      const mockDateDocs = [
        { id: '2023-10-01', ref: 'ref1' },
        { id: '2023-10-02', ref: 'ref2' },
      ];
      const mockPlayerDocs = [
        { id: 'player1', ref: 'playerRef1' },
        { id: 'player2', ref: 'playerRef2' },
      ];

      (getDocs as any)
        .mockResolvedValueOnce({ docs: mockDateDocs }) // First call for dates
        .mockResolvedValueOnce({ docs: mockPlayerDocs }) // Second call for players of date 1
        .mockResolvedValueOnce({ docs: [] }); // Third call for players of date 2

      await clearAttendanceHistory();

      // Expectations
      expect(getDocs).toHaveBeenCalledTimes(3);
      expect(collection).toHaveBeenCalledWith(db, 'attendance');
      expect(collection).toHaveBeenCalledWith(db, 'attendance', '2023-10-01', 'players');
      expect(collection).toHaveBeenCalledWith(db, 'attendance', '2023-10-02', 'players');

      expect(mockBatch.delete).toHaveBeenCalledTimes(4); // 2 players + 2 dates
      expect(mockBatch.commit).toHaveBeenCalledTimes(1); // Final commit since count < 400
    });

    it('should throw an error if fetching documents fails', async () => {
      const error = new Error('Firestore error');
      (getDocs as any).mockRejectedValueOnce(error);

      await expect(clearAttendanceHistory()).rejects.toThrow('Firestore error');
      expect(console.error).toHaveBeenCalledWith('Error clearing attendance history:', error);
    });
  });

  describe('fetchAttendanceHistory', () => {
    it('should fetch all attendance history when no month is provided', async () => {
      const mockDateDocs = [
        { id: '2023-10-01' },
        { id: '2023-11-01' },
      ];
      const mockPlayerDocsDate1 = [
        { data: () => ({ id: 'p1', name: 'Player 1' }) },
      ];
      const mockPlayerDocsDate2 = [
        { data: () => ({ id: 'p2', name: 'Player 2' }) },
      ];

      (getDocs as any)
        .mockResolvedValueOnce({ docs: mockDateDocs })
        .mockResolvedValueOnce({ empty: false, docs: mockPlayerDocsDate1 })
        .mockResolvedValueOnce({ empty: false, docs: mockPlayerDocsDate2 });

      const result = await fetchAttendanceHistory();

      expect(result).toEqual({
        '2023-10-01': [{ id: 'p1', name: 'Player 1' }],
        '2023-11-01': [{ id: 'p2', name: 'Player 2' }],
      });
      expect(getDocs).toHaveBeenCalledTimes(3);
    });

    it('should filter attendance history by month if provided', async () => {
      const mockDateDocs = [
        { id: '2023-10-01' },
        { id: '2023-10-15' },
        { id: '2023-11-01' },
      ];
      const mockPlayerDocsDate1 = [
        { data: () => ({ id: 'p1', name: 'Player 1' }) },
      ];
      const mockPlayerDocsDate2 = [
        { data: () => ({ id: 'p2', name: 'Player 2' }) },
      ];

      (getDocs as any)
        .mockResolvedValueOnce({ docs: mockDateDocs })
        .mockResolvedValueOnce({ empty: false, docs: mockPlayerDocsDate1 })
        .mockResolvedValueOnce({ empty: false, docs: mockPlayerDocsDate2 });

      const result = await fetchAttendanceHistory('2023-10');

      expect(result).toEqual({
        '2023-10-01': [{ id: 'p1', name: 'Player 1' }],
        '2023-10-15': [{ id: 'p2', name: 'Player 2' }],
      });
      // getDocs should be called 1 time for dates + 2 times for the '2023-10' dates
      expect(getDocs).toHaveBeenCalledTimes(3);
    });

    it('should handle empty collections', async () => {
        const mockDateDocs = [
          { id: '2023-10-01' }
        ];

        (getDocs as any)
          .mockResolvedValueOnce({ docs: mockDateDocs })
          .mockResolvedValueOnce({ empty: true, docs: [] });

        const result = await fetchAttendanceHistory();

        expect(result).toEqual({});
        expect(getDocs).toHaveBeenCalledTimes(2);
      });

    it('should throw an error if fetching documents fails', async () => {
      const error = new Error('Firestore error');
      (getDocs as any).mockRejectedValueOnce(error);

      await expect(fetchAttendanceHistory()).rejects.toThrow('Firestore error');
      expect(console.error).toHaveBeenCalledWith('Error fetching attendance history:', error);
    });
  });

  describe('calculateAttendanceStats', () => {
    const mockAllPlayers = [
      { id: 'p1', name: 'Player 1' },
      { id: 'p2', name: 'Player 2' },
      { id: 'p3', name: 'Player 3' },
    ] as any[];

    it('should calculate correct stats based on history and sort by percentage descending', () => {
      const mockHistory = {
        '2023-10-01': [{ id: 'p1', name: 'Player 1' }, { id: 'p2', name: 'Player 2' }],
        '2023-10-02': [{ id: 'p1', name: 'Player 1' }],
        '2023-10-03': [{ id: 'p2', name: 'Player 2' }, { id: 'p3', name: 'Player 3' }],
        '2023-10-04': [{ id: 'p1', name: 'Player 1' }],
      } as any;

      const result = calculateAttendanceStats(mockHistory, mockAllPlayers);

      expect(result).toHaveLength(3);

      // Player 1: 3/4 = 75%
      expect(result[0]).toEqual({
        playerId: 'p1',
        playerName: 'Player 1',
        attendedSessions: 3,
        totalSessions: 4,
        percentage: 75,
      });

      // Player 2: 2/4 = 50%
      expect(result[1]).toEqual({
        playerId: 'p2',
        playerName: 'Player 2',
        attendedSessions: 2,
        totalSessions: 4,
        percentage: 50,
      });

      // Player 3: 1/4 = 25%
      expect(result[2]).toEqual({
        playerId: 'p3',
        playerName: 'Player 3',
        attendedSessions: 1,
        totalSessions: 4,
        percentage: 25,
      });
    });

    it('should return empty array if no history is provided', () => {
      const result = calculateAttendanceStats({}, mockAllPlayers);
      expect(result).toEqual([]);
    });

    it('should include players present in history but not in allPlayers (e.g., deleted players)', () => {
      const mockHistory = {
        '2023-10-01': [{ id: 'p1', name: 'Player 1' }, { id: 'p4', name: 'Deleted Player' }],
      } as any;

      const result = calculateAttendanceStats(mockHistory, mockAllPlayers);

      expect(result).toHaveLength(4); // 3 from allPlayers + 1 deleted

      const deletedPlayerStat = result.find(s => s.playerId === 'p4');
      expect(deletedPlayerStat).toEqual({
        playerId: 'p4',
        playerName: 'Deleted Player',
        attendedSessions: 1,
        totalSessions: 1,
        percentage: 100,
      });

      // p2 and p3 from allPlayers should have 0%
      const p2Stat = result.find(s => s.playerId === 'p2');
      expect(p2Stat?.percentage).toBe(0);
    });
  });
});
