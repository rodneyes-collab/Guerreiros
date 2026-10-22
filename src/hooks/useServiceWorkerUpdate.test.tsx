import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useServiceWorkerUpdate } from './useServiceWorkerUpdate';
import { useRegisterSW } from 'virtual:pwa-register/react';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: vi.fn(),
}));

describe('useServiceWorkerUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock the window.location.reload
    Object.defineProperty(window, 'location', {
      value: { reload: vi.fn() },
      writable: true
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return initial state correctly', () => {
    const mockUseRegisterSW = useRegisterSW as ReturnType<typeof vi.fn>;
    const setNeedRefresh = vi.fn();
    const setOfflineReady = vi.fn();

    mockUseRegisterSW.mockReturnValue({
      needRefresh: [false, setNeedRefresh],
      offlineReady: [false, setOfflineReady],
      updateServiceWorker: vi.fn(),
    });

    const { result } = renderHook(() => useServiceWorkerUpdate());

    expect(result.current.needRefresh).toBe(false);
    expect(result.current.offlineReady).toBe(false);
    expect(result.current.registration).toBe(null);
    expect(result.current.error).toBe(null);

    // Check if the set functions are returned correctly
    expect(result.current.setNeedRefresh).toBe(setNeedRefresh);
    expect(result.current.setOfflineReady).toBe(setOfflineReady);
  });

  it('should handle onNeedRefresh callback', () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const mockUseRegisterSW = useRegisterSW as ReturnType<typeof vi.fn>;
    mockUseRegisterSW.mockReturnValue({
      needRefresh: [false, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: vi.fn(),
    });

    renderHook(() => useServiceWorkerUpdate());

    const config = mockUseRegisterSW.mock.calls[0][0];

    config.onNeedRefresh();

    expect(consoleLogSpy).toHaveBeenCalledWith('[SWUpdate] New version detected!');

    consoleLogSpy.mockRestore();
  });

  it('should handle onRegisteredSW callback and periodic check', async () => {
    vi.useFakeTimers();
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const mockUseRegisterSW = useRegisterSW as ReturnType<typeof vi.fn>;
    mockUseRegisterSW.mockReturnValue({
      needRefresh: [false, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: vi.fn(),
    });

    const { result } = renderHook(() => useServiceWorkerUpdate());

    // Extract the configuration passed to useRegisterSW
    const config = mockUseRegisterSW.mock.calls[0][0];

    const mockUpdate = vi.fn().mockResolvedValue(undefined);
    const mockRegistration = {
      update: mockUpdate,
    };

    // Trigger onRegisteredSW
    let cleanup: any;
    act(() => {
      cleanup = config.onRegisteredSW('http://localhost/sw.js', mockRegistration);
    });

    expect(result.current.registration).toBe(mockRegistration);

    // Advance time by 10 minutes (periodic check interval)
    await act(async () => {
      vi.advanceTimersByTime(10 * 60 * 1000);
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);

    // Advance time again to show interval works
    await act(async () => {
      vi.advanceTimersByTime(10 * 60 * 1000);
    });

    expect(mockUpdate).toHaveBeenCalledTimes(2);

    // Test cleanup
    expect(typeof cleanup).toBe('function');
    cleanup();

    // Advance time again, should not call update because of cleanup
    await act(async () => {
      vi.advanceTimersByTime(10 * 60 * 1000);
    });
    expect(mockUpdate).toHaveBeenCalledTimes(2); // Still 2

    consoleWarnSpy.mockRestore();
  });

  it('should handle failed periodic check without crashing', async () => {
    vi.useFakeTimers();
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const mockUseRegisterSW = useRegisterSW as ReturnType<typeof vi.fn>;
    mockUseRegisterSW.mockReturnValue({
      needRefresh: [false, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: vi.fn(),
    });

    renderHook(() => useServiceWorkerUpdate());

    // Extract the configuration passed to useRegisterSW
    const config = mockUseRegisterSW.mock.calls[0][0];

    const mockError = new Error('Update failed');
    const mockUpdate = vi.fn().mockRejectedValue(mockError);
    const mockRegistration = {
      update: mockUpdate,
    };

    // Trigger onRegisteredSW
    act(() => {
      config.onRegisteredSW('http://localhost/sw.js', mockRegistration);
    });

    // Advance time by 10 minutes (periodic check interval)
    await act(async () => {
      vi.advanceTimersByTime(10 * 60 * 1000);
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith('SW periodic update check failed:', mockError);

    consoleWarnSpy.mockRestore();
  });

  it('should handle onRegisterError callback', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const mockUseRegisterSW = useRegisterSW as ReturnType<typeof vi.fn>;
    mockUseRegisterSW.mockReturnValue({
      needRefresh: [false, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: vi.fn(),
    });

    const { result } = renderHook(() => useServiceWorkerUpdate());

    const config = mockUseRegisterSW.mock.calls[0][0];

    const testError = new Error('Registration failed');
    act(() => {
      config.onRegisterError(testError);
    });

    expect(result.current.error).toBe(testError);
    expect(consoleErrorSpy).toHaveBeenCalledWith('SW Registration error:', testError);

    consoleErrorSpy.mockRestore();
  });

  it('should apply update successfully', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const updateServiceWorkerMock = vi.fn().mockResolvedValue(undefined);
    const mockUseRegisterSW = useRegisterSW as ReturnType<typeof vi.fn>;
    mockUseRegisterSW.mockReturnValue({
      needRefresh: [true, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: updateServiceWorkerMock,
    });

    const { result } = renderHook(() => useServiceWorkerUpdate());

    await act(async () => {
      await result.current.updateServiceWorker();
    });

    expect(updateServiceWorkerMock).toHaveBeenCalledWith(true);
    expect(consoleLogSpy).toHaveBeenCalledWith('[SWUpdate] Applying service worker update...');

    consoleLogSpy.mockRestore();
  });

  it('should fallback to reload on apply update failure', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const updateServiceWorkerMock = vi.fn().mockRejectedValue(new Error('Update failed'));
    const mockUseRegisterSW = useRegisterSW as ReturnType<typeof vi.fn>;
    mockUseRegisterSW.mockReturnValue({
      needRefresh: [true, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: updateServiceWorkerMock,
    });

    const { result } = renderHook(() => useServiceWorkerUpdate());

    await act(async () => {
      await result.current.updateServiceWorker();
    });

    expect(updateServiceWorkerMock).toHaveBeenCalledWith(true);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(window.location.reload).toHaveBeenCalled();

    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});
