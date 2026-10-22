import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebAuthn } from './useWebAuthn';
import * as simplewebauthnBrowser from '@simplewebauthn/browser';
import { useStore } from '../../store';
import { auth, db, doc, setDoc, signOut } from '../../firebase';

// Mock dependencies
vi.mock('@simplewebauthn/browser', () => ({
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
}));

vi.mock('../../firebase', () => ({
  auth: { currentUser: { uid: 'test-uid' } },
  db: {},
  doc: vi.fn(),
  setDoc: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  signInAnonymously: vi.fn().mockResolvedValue({ user: { uid: 'anon-uid' } }),
}));

vi.mock('../../store', () => {
  const getState = vi.fn().mockReturnValue({
    players: [{ id: 'p1', name: 'Test Player', email: 'test@example.com' }],
    setCurrentPlayer: vi.fn(),
    setUserRole: vi.fn(),
  });
  const setState = vi.fn();
  return {
    useStore: {
      getState,
      setState,
    },
  };
});

describe('useWebAuthn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    window.localStorage.clear();

    // Default fetch mock response
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        challenge: 'test-challenge',
        credential: { id: 'cred-123' },
        verified: true,
        email: 'test@example.com',
      }),
    });
  });

  it('should initialize with default states', () => {
    const { result } = renderHook(() => useWebAuthn());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.success).toBeNull();
  });

  describe('register', () => {
    it('should throw error if email is not provided', async () => {
      const { result } = renderHook(() => useWebAuthn());

      let success = false;
      await act(async () => {
        success = await result.current.register('');
      });

      expect(success).toBe(false);
      expect(result.current.error).toContain('Por favor, informe seu e-mail');
    });

    it('should handle fetch options error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error options' })
      });

      const { result } = renderHook(() => useWebAuthn());

      await act(async () => {
        await result.current.register('test@example.com');
      });

      expect(result.current.error).toBe('Server error options');
    });

    it('should successfully register', async () => {
      // 1: Options, 2: Verify
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ challenge: 'c', credential: { id: '123' } })
      });
      (simplewebauthnBrowser.startRegistration as any).mockResolvedValue({ id: 'att-1' });

      const { result } = renderHook(() => useWebAuthn());

      let success = false;
      await act(async () => {
        success = await result.current.register('test@example.com');
      });

      expect(success).toBe(true);
      expect(result.current.success).toBe('Biometria / Face ID registrada com sucesso!');
      expect(window.localStorage.getItem('simpleLoginEmail')).toBe('test@example.com');
      expect(window.localStorage.getItem('hasBiometricsLinked')).toBe('true');
    });
  });

  describe('login', () => {
    it('should successfully login and call onSuccessCallback', async () => {
      const onSuccess = vi.fn();

      // 1: Options, 2: Verify, 3: Link Device
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ challenge: 'c' })
      }).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ verified: true, email: 'test@example.com' })
      }).mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      });

      (simplewebauthnBrowser.startAuthentication as any).mockResolvedValue({ id: 'ass-1' });

      const { result } = renderHook(() => useWebAuthn());

      await act(async () => {
        await result.current.login(onSuccess, 'test@example.com');
      });

      expect(onSuccess).toHaveBeenCalled();
      expect(result.current.success).toBe('Autenticação biométrica bem-sucedida!');
      expect(window.localStorage.getItem('simpleLoginEmail')).toBe('test@example.com');

      const recent = JSON.parse(window.localStorage.getItem('recentLogins') || '[]');
      expect(recent).toContain('test@example.com');
    });

    it('should handle unverified login', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ challenge: 'c' })
      }).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ verified: false })
      });

      (simplewebauthnBrowser.startAuthentication as any).mockResolvedValue({ id: 'ass-1' });

      const { result } = renderHook(() => useWebAuthn());

      await act(async () => {
        await result.current.login(undefined, 'test@example.com');
      });

      expect(result.current.error).toBe('Falha na autenticação biométrica.');
    });
  });

  describe('formatWebAuthnError', () => {
     it('should handle NotAllowedError', async () => {
       const { result } = renderHook(() => useWebAuthn());

       (global.fetch as any).mockRejectedValueOnce(new Error('NotAllowedError'));

       await act(async () => {
         await result.current.register('test@example.com');
       });

       expect(result.current.error).toContain('Leitura biométrica / Face ID cancelada');
     });
  });
});

  describe('formatWebAuthnError coverage', () => {
    it('should handle BIOMETRIA_BLOQUEADA_IFRAME', async () => {
       const { result } = renderHook(() => useWebAuthn());
       (global.fetch as any).mockRejectedValueOnce(new Error('BIOMETRIA_BLOQUEADA_IFRAME'));
       await act(async () => {
         await result.current.register('test@example.com');
       });
       expect(result.current.error).toContain('execução em aba nativa por segurança');
    });

    it('should handle NotSupportedError', async () => {
       const { result } = renderHook(() => useWebAuthn());
       (global.fetch as any).mockRejectedValueOnce(new Error('NotSupportedError'));
       await act(async () => {
         await result.current.register('test@example.com');
       });
       expect(result.current.error).toContain('não possui suporte a biometria nativa');
    });

    it('should handle InvalidStateError', async () => {
       const { result } = renderHook(() => useWebAuthn());
       (global.fetch as any).mockRejectedValueOnce(new Error('InvalidStateError'));
       await act(async () => {
         await result.current.register('test@example.com');
       });
       expect(result.current.error).toContain('já se encontra cadastrada neste dispositivo');
    });

    it('should handle Biometria não cadastrada', async () => {
       const { result } = renderHook(() => useWebAuthn());
       (global.fetch as any).mockRejectedValueOnce(new Error('Biometria não cadastrada'));
       await act(async () => {
         await result.current.register('test@example.com');
       });
       expect(result.current.error).toContain('Nenhuma biometria cadastrada neste dispositivo');
    });

    it('should handle fallback generic error', async () => {
       const { result } = renderHook(() => useWebAuthn());
       (global.fetch as any).mockRejectedValueOnce(new Error('Some other error'));
       await act(async () => {
         await result.current.register('test@example.com');
       });
       expect(result.current.error).toContain('Some other error');
    });
  });

  describe('login extra coverage', () => {
    it('should throw error if fetch login options fails', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error login options' })
      });

      const { result } = renderHook(() => useWebAuthn());

      await act(async () => {
        await result.current.login(undefined, 'test@example.com');
      });

      expect(result.current.error).toBe('Server error login options');
    });

    it('should throw error if verify login fails', async () => {
      // 1: Options, 2: Verify error
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ challenge: 'c' })
      }).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: 'Verify error' })
      });

      (simplewebauthnBrowser.startAuthentication as any).mockResolvedValue({ id: 'ass-1' });

      const { result } = renderHook(() => useWebAuthn());

      await act(async () => {
        await result.current.login(undefined, 'test@example.com');
      });

      expect(result.current.error).toBe('Verify error');
    });
  });

  describe('edge cases', () => {
    it('register should handle options fetch throwing an error', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useWebAuthn());

      await act(async () => {
        await result.current.register('test@example.com');
      });

      expect(result.current.error).toContain('Network error');
    });

    it('login should handle authentication rejection', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ challenge: 'c' })
      });

      (simplewebauthnBrowser.startAuthentication as any).mockRejectedValueOnce(new Error('User cancelled'));

      const { result } = renderHook(() => useWebAuthn());

      await act(async () => {
        await result.current.login(undefined, 'test@example.com');
      });

      expect(result.current.error).toContain('User cancelled');
    });
  });

  describe('more edges', () => {
    it('register should handle verify error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ challenge: 'c' })
      }).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: 'Verify server error' })
      });
      (simplewebauthnBrowser.startRegistration as any).mockResolvedValue({ id: 'att-1' });

      const { result } = renderHook(() => useWebAuthn());

      await act(async () => {
        await result.current.register('test@example.com');
      });

      expect(result.current.error).toBe('Verify server error');
    });

  });
