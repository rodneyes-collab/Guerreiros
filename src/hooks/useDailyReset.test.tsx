/**
 * @vitest-environment jsdom
 */
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useDailyReset } from './useDailyReset';
import * as storeModule from '../../store';
import * as firebaseModule from '../../firebase';

// Mock the store
vi.mock('../../store', () => ({
  useStore: vi.fn()
}));

// Mock firebase
vi.mock('../../firebase', () => ({
  db: {},
  doc: vi.fn(),
  setDoc: vi.fn(),
  writeBatch: vi.fn(),
  OperationType: {},
  handleFirestoreError: vi.fn(),
  trackUsage: vi.fn(),
  getFirestoreDateKey: vi.fn()
}));

describe('useDailyReset', () => {
  const mockUseStore = vi.spyOn(storeModule, 'useStore');
  const mockSetDoc = vi.spyOn(firebaseModule, 'setDoc');
  const mockWriteBatch = vi.spyOn(firebaseModule, 'writeBatch');

  beforeEach(() => {
    mockUseStore.mockReturnValue({
      user: { role: 'admin' }, // Test as admin
      players: [],
      systemMetadata: { lastDailyReset: '2023-01-01' },
      isInitialLoading: false,
      setPlayers: vi.fn(),
      setAttendance: vi.fn(),
      showNotification: vi.fn()
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should render and run its empty useEffect correctly', () => {
    // The hook used to contain heavy client-side reset logic.
    // The logic has been migrated to the backend (Cloud Scheduler).
    // This test ensures the hook remains a no-op to avoid regressions
    // where client-side reset logic might be accidentally reintroduced.
    const { unmount } = renderHook(() => useDailyReset());

    // We expect useStore to be called to subscribe to the state.
    expect(mockUseStore).toHaveBeenCalled();

    // The unmount should occur without any errors.
    expect(() => unmount()).not.toThrow();
  });

  it('should verify that no firebase database operations are triggered by this hook', () => {
    renderHook(() => useDailyReset());

    // Crucially, verify that the empty useEffect truly does nothing and
    // no accidental writes are happening from the client.
    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(mockWriteBatch).not.toHaveBeenCalled();
  });
});
