import { renderHook, act } from '@testing-library/react';
import { useAutoVersionCheck } from '../useAutoVersionCheck';
import { APP_VERSION } from '../../../constants';
import { forceAppUpdate } from '../../utils/forceAppUpdate';
import { vi, describe, it, expect, beforeEach, afterEach, Mock } from 'vitest';

vi.mock('../../utils/forceAppUpdate', () => ({
  forceAppUpdate: vi.fn()
}));

describe('useAutoVersionCheck', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date'] });
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('should initialize correctly with no new version', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: APP_VERSION })
    });

    const { result } = renderHook(() => useAutoVersionCheck());

    expect(result.current.hasNewVersion).toBe(false);
    expect(result.current.serverVersion).toBeNull();
    expect(result.current.currentVersion).toBe(APP_VERSION);

    // Resolve promises
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.serverVersion).toBe(APP_VERSION);
    expect(result.current.hasNewVersion).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should set hasNewVersion to true and call forceAppUpdate when version differs', async () => {
    const newVersion = '999.9.9';
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: newVersion })
    });

    const { result } = renderHook(() => useAutoVersionCheck());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.serverVersion).toBe(newVersion);
    expect(result.current.hasNewVersion).toBe(true);
    expect(localStorage.getItem('last_auto_update_target')).toBe(newVersion);

    expect(forceAppUpdate).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(forceAppUpdate).toHaveBeenCalledTimes(1);
  });

  it('should not call forceAppUpdate if already attempted for the new version', async () => {
    const newVersion = '999.9.9';
    localStorage.setItem('last_auto_update_target', newVersion);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: newVersion })
    });

    const { result } = renderHook(() => useAutoVersionCheck());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.serverVersion).toBe(newVersion);
    expect(result.current.hasNewVersion).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(forceAppUpdate).not.toHaveBeenCalled();
  });

  it('should handle fetch errors gracefully', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useAutoVersionCheck());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.hasNewVersion).toBe(false);
    expect(result.current.serverVersion).toBeNull();
  });

  it('should check version periodically and on window events', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ version: APP_VERSION })
    });

    renderHook(() => useAutoVersionCheck());

    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(30000);
    });

    // need to resolve interval promises
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true
    });

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
