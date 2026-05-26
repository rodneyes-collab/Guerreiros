import { collection, addDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';

export enum AuditAction {
  CREATE_PLAYER = 'CREATE_PLAYER',
  DELETE_PLAYER = 'DELETE_PLAYER',
  INACTIVATE_PLAYER = 'INACTIVATE_PLAYER',
  ACTIVATE_PLAYER = 'ACTIVATE_PLAYER',
  ENTER_DM = 'ENTER_DM',
  EXIT_DM = 'EXIT_DM',
  DELETE_MATCH = 'DELETE_MATCH',
  CLEAR_ALL_PLAYERS = 'CLEAR_ALL_PLAYERS'
}

export async function logAction(
  action: AuditAction, 
  playerId: string, 
  playerName: string, 
  details?: string
) {
  try {
    const user = auth.currentUser;
    if (!user) return;

    await addDoc(collection(db, 'auditLogs'), {
      action,
      playerId,
      playerName: playerName || 'Desconhecido',
      timestamp: new Date().toISOString(),
      performedBy: user.uid,
      performedByEmail: user.email,
      details: details || ''
    });
  } catch (error) {
    console.error('Error logging action:', error);
  }
}
