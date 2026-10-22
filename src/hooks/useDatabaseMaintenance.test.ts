import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useDatabaseMaintenance } from './useDatabaseMaintenance';
import { useStore } from '../../store';
import { getDoc, getDocs, setDoc, getFirestoreDateKey } from '../../firebase';
import { scanDatabaseAnomalies, executeDbAutoCorrection } from '../../services/dbAutoCorrectionAgent';

// Mock dependencies
vi.mock('../../store', () => ({
  useStore: vi.fn()
}));

vi.mock('../../firebase', () => ({
  db: {},
  collection: vi.fn(),
  getDocs: vi.fn(),
  doc: vi.fn(),
  setDoc: vi.fn(),
  getDoc: vi.fn(),
  getFirestoreDateKey: vi.fn()
}));

vi.mock('../../services/dbAutoCorrectionAgent', () => ({
  scanDatabaseAnomalies: vi.fn(),
  executeDbAutoCorrection: vi.fn()
}));

describe('useDatabaseMaintenance', () => {
  let showNotificationMock: any;

  beforeEach(() => {
    showNotificationMock = vi.fn();
    vi.mocked(useStore).mockReturnValue({
      user: { uid: '123' },
      userRole: 'ADMIN',
      showNotification: showNotificationMock
    } as any);
    vi.mocked(getFirestoreDateKey).mockReturnValue('2023-10-25');

    vi.mocked(getDocs).mockResolvedValue({
      forEach: (cb: any) => {
        cb({ id: 'doc1', data: () => ({ name: 'Test' }) });
      }
    } as any);

    vi.mocked(scanDatabaseAnomalies).mockReturnValue([]);

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('does nothing if user is not admin', async () => {
    vi.mocked(useStore).mockReturnValue({
      user: { uid: '123' },
      userRole: 'USER',
      showNotification: showNotificationMock
    } as any);

    renderHook(() => useDatabaseMaintenance());

    await vi.advanceTimersByTimeAsync(20000);

    expect(getDoc).not.toHaveBeenCalled();
  });

  it('does nothing if feature is disabled', async () => {
    vi.mocked(getDoc).mockImplementation(async () => {
      return {
        exists: () => true,
        data: () => ({ enabled: false })
      } as any;
    });

    renderHook(() => useDatabaseMaintenance());

    await vi.advanceTimersByTimeAsync(20000);

    // Only gets called for config, returns disabled, early exit
    expect(getDoc).toHaveBeenCalledTimes(1);
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('runs successfully when admin, enabled and daily interval has passed', async () => {
    vi.mocked(getDoc).mockImplementation(async () => {
      return {
        exists: () => true,
        data: () => ({
          enabled: true,
          frequency: 'DAILY',
          autoFix: true,
          notifyAdmin: true,
          lastRunTimestamp: Date.now() - 2 * 24 * 60 * 60 * 1000 // 2 days ago
        })
      } as any;
    });

    renderHook(() => useDatabaseMaintenance());

    await vi.advanceTimersByTimeAsync(20000);

    expect(getDoc).toHaveBeenCalledTimes(2);
    expect(getDocs).toHaveBeenCalledTimes(2);
    expect(scanDatabaseAnomalies).toHaveBeenCalled();
    expect(setDoc).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ status: 'CLEAN', anomaliesCount: 0 }),
      { merge: true }
    );
  });

  it('skips scan if interval has not passed', async () => {
    vi.mocked(getDoc).mockImplementation(async () => {
      return {
        exists: () => true,
        data: () => ({
          enabled: true,
          frequency: 'DAILY',
          autoFix: true,
          notifyAdmin: true,
          lastRunTimestamp: Date.now() - 1000 // 1 sec ago
        })
      } as any;
    });

    renderHook(() => useDatabaseMaintenance());
    await vi.advanceTimersByTimeAsync(20000);

    expect(getDoc).toHaveBeenCalledTimes(2);
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('fixes anomalies and notifies if autoFix is true', async () => {
    vi.mocked(getDoc).mockImplementation(async () => {
      return {
        exists: () => true,
        data: () => ({
          enabled: true,
          frequency: 'DAILY',
          autoFix: true,
          notifyAdmin: true,
          lastRunTimestamp: 0
        })
      } as any;
    });

    vi.mocked(scanDatabaseAnomalies).mockReturnValue([ { type: 'DUPLICATE' } ] as any);
    vi.mocked(executeDbAutoCorrection).mockResolvedValue({
      duplicatePlayersMerged: 1,
      matchesRepaired: 0
    } as any);

    renderHook(() => useDatabaseMaintenance());
    await vi.advanceTimersByTimeAsync(20000);

    expect(executeDbAutoCorrection).toHaveBeenCalled();
    expect(showNotificationMock).toHaveBeenCalledWith(
      expect.stringContaining('1 duplicata(s) e 0 partida(s) corrigidas no banco'),
      'success'
    );
    expect(setDoc).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ status: 'AUTOCORRECTED', anomaliesCount: 1 }),
      { merge: true }
    );
  });

  it('does not fix but notifies if autoFix is false and anomalies exist', async () => {
    vi.mocked(getDoc).mockImplementation(async () => {
      return {
        exists: () => true,
        data: () => ({
          enabled: true,
          frequency: 'DAILY',
          autoFix: false,
          notifyAdmin: true,
          lastRunTimestamp: 0
        })
      } as any;
    });

    vi.mocked(scanDatabaseAnomalies).mockReturnValue([ { type: 'DUPLICATE' } ] as any);

    renderHook(() => useDatabaseMaintenance());
    await vi.advanceTimersByTimeAsync(20000);

    expect(executeDbAutoCorrection).not.toHaveBeenCalled();
    expect(showNotificationMock).toHaveBeenCalledWith(
      expect.stringContaining('1 anomalia(s) detectada(s) no banco. Ação automática desativada.'),
      'info'
    );
    expect(setDoc).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ status: 'ANOMALIES_DETECTED', anomaliesCount: 1 }),
      { merge: true }
    );
  });
});
