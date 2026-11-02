import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { usePushNotifications } from './usePushNotifications';
import { useStore } from '../../store';
import { getToken, onMessage } from 'firebase/messaging';
import { updateDoc, doc } from 'firebase/firestore';
import { messaging } from '../../firebase';

// Mock firebase methods
vi.mock('firebase/messaging', () => ({
  getToken: vi.fn(),
  onMessage: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  updateDoc: vi.fn(),
}));

// Mock the store
vi.mock('../../store', () => ({
  useStore: vi.fn(),
}));

// Mock our local firebase initialization
vi.mock('../../firebase', () => {
  return {
    db: {},
    messaging: {},
  };
});

describe('usePushNotifications', () => {
  let mockShowNotification: Mock;
  let mockCurrentPlayer: any;
  let mockUnsubscribe: Mock;
  let mockConsoleLog: Mock;
  let mockConsoleWarn: Mock;
  let mockConsoleError: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    mockShowNotification = vi.fn();
    mockCurrentPlayer = null;
    mockUnsubscribe = vi.fn();

    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock store state
    (useStore as unknown as Mock).mockImplementation((selector) => {
      const state = {
        currentPlayer: mockCurrentPlayer,
        showNotification: mockShowNotification,
      };
      return selector(state);
    });

    // Mock navigator and Notification
    Object.defineProperty(global, 'navigator', {
      value: {
        serviceWorker: {
          register: vi.fn().mockResolvedValue({}),
        },
      },
      writable: true,
      configurable: true,
    });

    Object.defineProperty(global, 'Notification', {
      value: {
        requestPermission: vi.fn().mockResolvedValue('default'),
      },
      writable: true,
      configurable: true,
    });

    (onMessage as Mock).mockReturnValue(mockUnsubscribe);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should set up onMessage listener and call showNotification when receiving foreground message', () => {
    // Trigger onMessage callback
    let onMessageCallback: any;
    (onMessage as Mock).mockImplementation((msg, callback) => {
      onMessageCallback = callback;
      return mockUnsubscribe;
    });

    renderHook(() => usePushNotifications());

    expect(onMessage).toHaveBeenCalledWith(messaging, expect.any(Function));

    // Simulate receiving a message
    const payload = {
      notification: {
        title: 'Test Title',
        body: 'Test Body',
      }
    };
    onMessageCallback(payload);

    expect(mockConsoleLog).toHaveBeenCalledWith('Mensagem recebida em primeiro plano:', payload);
    expect(mockShowNotification).toHaveBeenCalledWith('Test Body', 'info');

    // Simulate receiving a message without body
    const payloadNoBody = {
      notification: {
        title: 'Test Title Only',
      }
    };
    onMessageCallback(payloadNoBody);
    expect(mockShowNotification).toHaveBeenCalledWith('Test Title Only', 'info');
  });

  it('should call unsubscribe on unmount', () => {
    const { unmount } = renderHook(() => usePushNotifications());
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it('should not request permissions if currentPlayer is null', async () => {
    mockCurrentPlayer = null;
    renderHook(() => usePushNotifications());

    expect(global.Notification.requestPermission).not.toHaveBeenCalled();
  });

  it('should not request permissions if currentPlayer.pushEnabled is false', async () => {
    mockCurrentPlayer = { id: 'player1', pushEnabled: false };
    renderHook(() => usePushNotifications());

    expect(global.Notification.requestPermission).not.toHaveBeenCalled();
  });

  it('should not request permissions if currentPlayer already has an fcmToken', async () => {
    mockCurrentPlayer = { id: 'player1', fcmToken: 'existing-token' };
    renderHook(() => usePushNotifications());

    expect(global.Notification.requestPermission).not.toHaveBeenCalled();
  });

  it('should request permissions and warn if permission is denied', async () => {
    mockCurrentPlayer = { id: 'player1' }; // pushEnabled is undefined (defaulting to not false), fcmToken is undefined
    (global.Notification.requestPermission as Mock).mockResolvedValue('denied');

    renderHook(() => usePushNotifications());

    await waitFor(() => {
      expect(global.Notification.requestPermission).toHaveBeenCalled();
    });

    expect(mockConsoleWarn).toHaveBeenCalledWith('Permissão de notificação negada pelo usuário');
    expect(global.navigator.serviceWorker.register).not.toHaveBeenCalled();
  });

  it('should request permissions, get token, and update Firestore if granted', async () => {
    mockCurrentPlayer = { id: 'player1' };
    (global.Notification.requestPermission as Mock).mockResolvedValue('granted');
    const mockRegistration = { scope: '/firebase-cloud-messaging-push-scope' };
    (global.navigator.serviceWorker.register as Mock).mockResolvedValue(mockRegistration);
    (getToken as Mock).mockResolvedValue('new-fcm-token');
    (doc as Mock).mockReturnValue('mock-doc-ref');

    renderHook(() => usePushNotifications());

    await waitFor(() => {
      expect(global.Notification.requestPermission).toHaveBeenCalled();
    });

    expect(global.navigator.serviceWorker.register).toHaveBeenCalledWith('/firebase-messaging-sw.js', {
      scope: '/firebase-cloud-messaging-push-scope',
    });

    expect(getToken).toHaveBeenCalledWith(messaging, {
      vapidKey: 'BNriUQFnNL96aWZWNt1hElYBCaX0rZUIbVGA3S5nndH8cOwhzIPpObuHwGOpgkb0onvSm59rBeEjgX-FMYcLozQ',
      serviceWorkerRegistration: mockRegistration
    });

    expect(doc).toHaveBeenCalledWith(expect.anything(), 'players', 'player1');
    expect(updateDoc).toHaveBeenCalledWith('mock-doc-ref', {
      fcmToken: 'new-fcm-token',
      pushEnabled: true
    });
    expect(mockConsoleLog).toHaveBeenCalledWith('FCM Token atualizado com sucesso');
  });

  it('should handle errors gracefully during permission request', async () => {
    mockCurrentPlayer = { id: 'player1' };
    const error = new Error('Permission failed');
    (global.Notification.requestPermission as Mock).mockRejectedValue(error);

    renderHook(() => usePushNotifications());

    await waitFor(() => {
      expect(mockConsoleError).toHaveBeenCalledWith('Erro ao configurar notificações push:', error);
    });
  });
});
