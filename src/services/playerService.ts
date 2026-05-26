import { db, doc, updateDoc } from '../../firebase';
import { Player, AuditLog } from '../../types';

export const updatePlayerWithAudit = async (
  player: Player,
  updatedFields: Partial<Player>,
  changedBy: string
) => {
  const auditLog: AuditLog[] = player.auditLog || [];
  const newAuditEntries: AuditLog[] = [];

  Object.entries(updatedFields).forEach(([field, newValue]) => {
    const oldValue = (player as any)[field];
    if (oldValue !== newValue) {
      newAuditEntries.push({
        field,
        oldValue,
        newValue,
        timestamp: Date.now(),
        changedBy
      });
    }
  });

  if (newAuditEntries.length === 0) return;

  const playerRef = doc(db, 'players', player.id);
  await updateDoc(playerRef, {
    ...updatedFields,
    auditLog: [...auditLog, ...newAuditEntries]
  });
};
