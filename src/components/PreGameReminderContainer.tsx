import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../../store';
import { useIntentions } from '../hooks/useIntentions';
import { usePreGameReminder } from '../hooks/usePreGameReminder';
import { PreGameReminderModal } from './PreGameReminderModal';
import { Player } from '../../types';

export interface PreGameReminderContainerProps {
  currentPlayer: Player | null;
  userRole: 'ADMIN' | 'MEMBER' | null;
  showNotification?: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const PreGameReminderContainer: React.FC<PreGameReminderContainerProps> = ({
  currentPlayer,
  userRole,
  showNotification
}) => {
  const { players, attendance, preConfirmations, idToCanonicalId } = useStore(
    useShallow(state => ({
      players: state.players,
      attendance: state.attendance,
      preConfirmations: state.preConfirmations,
      idToCanonicalId: state.idToCanonicalId
    }))
  );

  const { intentions, isLoaded, setIntent, sendReminders } = useIntentions();

  const reminder = usePreGameReminder({
    intentions,
    isLoaded,
    players,
    attendance,
    preConfirmations,
    idToCanonicalId,
    currentPlayer,
    userRole,
    setIntent,
    showNotification,
    sendReminders
  });

  return (
    <PreGameReminderModal
      isOpen={reminder.isOpen}
      onClose={reminder.handleDismiss}
      currentPlayer={currentPlayer}
      targetDate={reminder.targetDate}
      undecidedCount={reminder.undecidedCount}
      undecidedActivePlayers={reminder.undecidedActivePlayers}
      isAdmin={userRole === 'ADMIN'}
      isSubmitting={reminder.isSubmitting}
      isSendingPush={reminder.isSendingPush}
      onConfirmPresence={reminder.handleConfirmPresence}
      onDeclinePresence={reminder.handleDeclinePresence}
      onBroadcastPush={reminder.handleBroadcastPushToUndecided}
    />
  );
};
