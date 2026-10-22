import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAdminAutomations } from './useAdminAutomations';
import { useStore } from '../../store';
import { getDoc, setDoc, getFirestoreDateKey, getBrazilDay } from '../../firebase';
import { analyzeBillingCosts } from '../../services/geminiService';

vi.mock('react', () => ({
  useEffect: vi.fn((cb) => {
    // immediately call the effect
    cb();
  })
}));

vi.mock('../../store', () => ({
  useStore: vi.fn()
}));

vi.mock('../../firebase', () => ({
  db: {},
  doc: vi.fn((db, coll, id) => `${coll}/${id}`),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  getFirestoreDateKey: vi.fn(),
  getBrazilDay: vi.fn()
}));

vi.mock('../../services/geminiService', () => ({
  analyzeBillingCosts: vi.fn()
}));

describe('useAdminAutomations', () => {
  const showNotificationMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mocks
    (useStore as any).mockReturnValue({
      user: { email: 'rodneyes@gmail.com' },
      userRole: 'ADMIN',
      monthlyUsageStats: { reads: 100, writes: 50, aiCalls: 10 },
      showNotification: showNotificationMock,
    });

    (getBrazilDay as any).mockReturnValue(5); // Friday
    (getFirestoreDateKey as any).mockReturnValue('2023-10-27');

    (getDoc as any).mockResolvedValue({
      exists: () => false,
      data: () => ({})
    });

    (analyzeBillingCosts as any).mockResolvedValue('Mocked Report');
  });

  it('should not run if user is not MASTER ADMIN (wrong email)', async () => {
    (useStore as any).mockReturnValue({
      user: { email: 'other@gmail.com' },
      userRole: 'ADMIN',
      showNotification: showNotificationMock,
    });

    useAdminAutomations();

    expect(getDoc).not.toHaveBeenCalled();
  });

  it('should not run if user is not ADMIN role', async () => {
    (useStore as any).mockReturnValue({
      user: { email: 'rodneyes@gmail.com' },
      userRole: 'PLAYER',
      showNotification: showNotificationMock,
    });

    useAdminAutomations();

    expect(getDoc).not.toHaveBeenCalled();
  });

  it('should not run if today is not Friday', async () => {
    (getBrazilDay as any).mockReturnValue(3); // Wednesday

    useAdminAutomations();

    expect(getDoc).not.toHaveBeenCalled();
  });

  it('should not run if already run today', async () => {
    (getDoc as any).mockResolvedValue({
      exists: () => true,
      data: () => ({ lastRun: '2023-10-27' })
    });

    useAdminAutomations();

    // getDoc is called, but no further execution
    // we use flush promises to wait for async useEffect
    await new Promise(process.nextTick);

    expect(getDoc).toHaveBeenCalled();
    expect(analyzeBillingCosts).not.toHaveBeenCalled();
  });

  it('should run automation and save report on success', async () => {
    useAdminAutomations();

    await new Promise(process.nextTick);
    await new Promise(process.nextTick); // wait for all async ops

    expect(getDoc).toHaveBeenCalled();
    expect(analyzeBillingCosts).toHaveBeenCalled();
    expect(setDoc).toHaveBeenCalledTimes(3); // month history, report, automation ref
    expect(showNotificationMock).toHaveBeenCalledWith(
      'Relatório de Faturamento Semanal Gerado com IA! Verifique no Dashboard.',
      'success'
    );
  });

  it('should handle errors gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (getDoc as any).mockRejectedValue(new Error('Firebase error'));

    useAdminAutomations();

    await new Promise(process.nextTick);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[Automation] Erro no relatório semanal:',
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });
});
