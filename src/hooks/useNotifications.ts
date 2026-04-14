import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { AppNotification } from '../../types';
import { useStore } from '../../store';

export const useNotifications = () => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const currentPlayer = useStore(state => state.currentPlayer);

  useEffect(() => {
    if (!currentPlayer) {
      setNotifications([]);
      return;
    }
    const q = query(
      collection(db, 'notifications'),
      where('playerId', '==', currentPlayer.id)
    );
    const unsub = onSnapshot(q, (snap) => {
      const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() } as AppNotification));
      // Sort in memory instead of using orderBy to avoid requiring a composite index
      notifs.sort((a, b) => b.createdAt - a.createdAt);
      setNotifications(notifs);
    });
    return () => unsub();
  }, [currentPlayer]);

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (e) {
      console.error("Error marking notification as read", e);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (e) {
      console.error("Error deleting notification", e);
    }
  };

  const clearAll = async () => {
    notifications.forEach(n => deleteNotification(n.id));
  };

  return { notifications, markAsRead, deleteNotification, clearAll };
};
