import { renderHook, act } from '@testing-library/react';
import { useAIStatus } from './useAIStatus';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('useAIStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('initializes with loading state', async () => {
    let resolveFetch: any;
    (global.fetch as any).mockImplementation(() => new Promise(resolve => {
      resolveFetch = resolve;
    }));

    const { result } = renderHook(() => useAIStatus());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.status).toEqual({
      isAvailable: true,
      lastQuotaError: 0,
      errorMessage: ''
    });

    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ isAvailable: true, lastQuotaError: 0, errorMessage: '' }) });
    });
  });

  it('fetches status successfully and updates state', async () => {
    const mockData = {
      isAvailable: false,
      lastQuotaError: 123456789,
      errorMessage: 'Quota exceeded'
    };

    let resolveFetch: any;
    (global.fetch as any).mockImplementation(() => new Promise(resolve => {
      resolveFetch = resolve;
    }));

    const { result } = renderHook(() => useAIStatus());

    await act(async () => {
      resolveFetch({
        ok: true,
        json: async () => mockData
      });
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.status).toEqual(mockData);
    expect(global.fetch).toHaveBeenCalledWith('/api/ai/status');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not update status if response is not ok', async () => {
    let resolveFetch: any;
    (global.fetch as any).mockImplementation(() => new Promise(resolve => {
      resolveFetch = resolve;
    }));

    const { result } = renderHook(() => useAIStatus());

    await act(async () => {
      resolveFetch({
        ok: false
      });
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.status).toEqual({
      isAvailable: true,
      lastQuotaError: 0,
      errorMessage: ''
    });
  });

  it('handles fetch error and sets isAvailable to false', async () => {
    let rejectFetch: any;
    (global.fetch as any).mockImplementation(() => new Promise((_, reject) => {
      rejectFetch = reject;
    }));

    const { result } = renderHook(() => useAIStatus());

    await act(async () => {
      rejectFetch(new Error('Network error'));
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.status).toEqual({
      isAvailable: false,
      lastQuotaError: 0,
      errorMessage: ''
    });
  });

  it('polls status every minute', async () => {
    let resolveFetch1: any;
    let resolveFetch2: any;
    let resolveFetch3: any;

    (global.fetch as any)
      .mockImplementationOnce(() => new Promise(resolve => { resolveFetch1 = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { resolveFetch2 = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { resolveFetch3 = resolve; }));

    renderHook(() => useAIStatus());

    await act(async () => {
      resolveFetch1({ ok: true, json: async () => ({}) });
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(60000);
    });

    await act(async () => {
      resolveFetch2({ ok: true, json: async () => ({}) });
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(60000);
    });

    await act(async () => {
      resolveFetch3({ ok: true, json: async () => ({}) });
    });

    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('clears interval on unmount', async () => {
    let resolveFetch1: any;

    (global.fetch as any)
      .mockImplementationOnce(() => new Promise(resolve => { resolveFetch1 = resolve; }));

    const { unmount } = renderHook(() => useAIStatus());

    await act(async () => {
      resolveFetch1({ ok: true, json: async () => ({}) });
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);

    unmount();

    await act(async () => {
      vi.advanceTimersByTime(60000);
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('allows manual refresh', async () => {
    let resolveFetch1: any;
    let resolveFetch2: any;

    (global.fetch as any)
      .mockImplementationOnce(() => new Promise(resolve => { resolveFetch1 = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { resolveFetch2 = resolve; }));

    const { result } = renderHook(() => useAIStatus());

    await act(async () => {
      resolveFetch1({ ok: true, json: async () => ({}) });
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.refresh();
      resolveFetch2({ ok: true, json: async () => ({}) });
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
