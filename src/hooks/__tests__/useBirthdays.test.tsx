import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useBirthdays } from '../useBirthdays';
import * as storeModule from '../../../store';

// Mock dependencies
const mockShowNotification = vi.fn();
const mockWriteBatch = {
  set: vi.fn(),
  commit: vi.fn().mockResolvedValue(undefined),
};

const mockPlayers = [
  { id: '1', name: 'Alice', birthDate: '1990-05-15', fcmToken: 'token1' },
  { id: '2', name: 'Bob', birthDate: '15/05/1992', fcmToken: 'token2' },
  { id: '3', name: 'Charlie', birthDate: '1985-12-25', fcmToken: 'token3' },
  { id: '4', name: 'David', birthDate: '01/01/2000' } // no fcmToken
];

// Mock the store using vi.mock on the root store file
vi.mock('../../../store', () => {
  let mockState = {
    players: [],
    currentPlayer: null,
    showNotification: vi.fn(),
  };

  const useStore = Object.assign(
    vi.fn(() => mockState),
    {
      getState: () => mockState,
      __setMockState: (newState: any) => {
        mockState = newState;
      }
    }
  );

  return { useStore };
});

vi.mock('../../../firebase', () => ({
  db: {},
  collection: vi.fn(),
  doc: vi.fn(),
  writeBatch: vi.fn(() => mockWriteBatch),
  serverTimestamp: vi.fn(() => 'mockTimestamp'),
}));

vi.mock('canvas-confetti', () => {
  const mockFire = vi.fn();
  return {
    default: Object.assign(mockFire, {
      create: vi.fn(() => mockFire)
    })
  };
});

describe('useBirthdays', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set system time to May 15, 2024 at 15:00:00 UTC (12:00:00 Brasilia Time)
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-15T15:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const setStoreState = (state: any) => {
    (storeModule.useStore as any).__setMockState(state);
  };

  it('should return empty list when no players provided and no players in store', () => {
    setStoreState({
      players: [],
      currentPlayer: null,
      showNotification: mockShowNotification
    });

    const { result } = renderHook(() => useBirthdays());
    expect(result.current.todayBirthdays).toEqual([]);
  });

  it('should identify today\'s birthdays correctly with different date formats', () => {
    setStoreState({
      players: mockPlayers,
      currentPlayer: { id: '1', name: 'Alice' },
      showNotification: mockShowNotification
    });

    const { result } = renderHook(() => useBirthdays());

    // Alice (1990-05-15) and Bob (15/05/1992) should both be identified
    expect(result.current.todayBirthdays).toHaveLength(2);
    expect(result.current.todayBirthdays.map(p => p.name)).toContain('Alice');
    expect(result.current.todayBirthdays.map(p => p.name)).toContain('Bob');
  });

  it('should correctly identify if it is the current player\'s birthday', () => {
    setStoreState({
      players: mockPlayers,
      currentPlayer: { id: '1', name: 'Alice' },
      showNotification: mockShowNotification
    });

    const { result } = renderHook(() => useBirthdays());
    expect(result.current.isMyBirthday).toBe(true);
  });

  it('should return birthdays by month correctly ordered by day', () => {
    setStoreState({
      players: mockPlayers,
      currentPlayer: null,
      showNotification: mockShowNotification
    });

    const { result } = renderHook(() => useBirthdays());

    const mayBirthdays = result.current.getBirthdaysByMonth(5);
    expect(mayBirthdays).toHaveLength(2);

    const decBirthdays = result.current.getBirthdaysByMonth(12);
    expect(decBirthdays).toHaveLength(1);
    expect(decBirthdays[0].name).toBe('Charlie');
  });

  it('should correctly calculate monthBirthdays based on the celebration rule', () => {
    setStoreState({
      players: mockPlayers,
      currentPlayer: null,
      showNotification: mockShowNotification
    });

    // Current date is May 15, 2024.
    // First Thursday of May 2024 is May 2nd.
    // Day 15 is > first Thursday + 2 (May 4th).
    // So target month should be May (5).
    const { result } = renderHook(() => useBirthdays());

    expect(result.current.monthBirthdays.month).toBe(5);
    expect(result.current.monthBirthdays.players).toHaveLength(2);
  });

  it('should correctly shift monthBirthdays to previous month early in the month', () => {
    setStoreState({
      players: mockPlayers,
      currentPlayer: null,
      showNotification: mockShowNotification
    });

    // Set time to May 3rd, 2024. First Thursday is May 2nd.
    // Day 3 <= first Thursday + 2 (4), so target should be previous month (April, 4).
    vi.setSystemTime(new Date('2024-05-03T15:00:00Z'));

    const { result } = renderHook(() => useBirthdays());
    expect(result.current.monthBirthdays.month).toBe(4);
    // No one has a birthday in April in our mock data
    expect(result.current.monthBirthdays.players).toHaveLength(0);
  });

  it('should shift from Jan to Dec early in the month', () => {
    setStoreState({
      players: mockPlayers,
      currentPlayer: null,
      showNotification: mockShowNotification
    });

    // Set time to Jan 2nd, 2024.
    vi.setSystemTime(new Date('2024-01-02T15:00:00Z'));

    const { result } = renderHook(() => useBirthdays());
    expect(result.current.monthBirthdays.month).toBe(12);
    expect(result.current.monthBirthdays.players).toHaveLength(1);
    expect(result.current.monthBirthdays.players[0].name).toBe('Charlie');
  });

  it('should send birthday push notifications to players with tokens', async () => {
    setStoreState({
      players: mockPlayers,
      currentPlayer: null,
      showNotification: mockShowNotification
    });

    const { result } = renderHook(() => useBirthdays());

    // We send push for Charlie
    await act(async () => {
      await result.current.sendBirthdayPush({ id: '3', name: 'Charlie', birthDate: '1985-12-25' } as any);
    });

    // Alice and Bob have tokens and are not Charlie, so they get notifications
    // David has no token, so he shouldn't be processed for FCM

    expect(mockWriteBatch.set).toHaveBeenCalled();
    expect(mockWriteBatch.commit).toHaveBeenCalled();
    expect(mockShowNotification).toHaveBeenCalledWith('Notificações de aniversário enviadas para o grupo!', 'success');
  });
});
