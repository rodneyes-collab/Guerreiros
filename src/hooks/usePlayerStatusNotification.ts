import { Player, GenerationResult, Match, SystemMetadata } from '../../types';

export const usePlayerStatusNotification = (
  _currentPlayer: Player | null,
  _generationResult: GenerationResult | null,
  _matches: Match[] = [],
  _systemMetadata?: SystemMetadata
) => {
  // Notificações Push do navegador foram desativadas e substituídas pelo WhatsApp.
  return {
    permission: 'denied' as NotificationPermission,
    isEnabled: false,
    isMatchEnabled: false,
    requestPermission: async () => false,
    disableNotifications: async () => {},
    toggleMatchNotifications: async () => {}
  };
};