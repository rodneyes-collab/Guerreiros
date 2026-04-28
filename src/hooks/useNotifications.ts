import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
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
    const unsub = onSnapshot(q, async (snap) => {
      const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() } as AppNotification));
      // Sort in memory instead of using orderBy to avoid requiring a composite index
      notifs.sort((a, b) => b.createdAt - a.createdAt);

      // Intelligent cleanup: Delete notifications older than 7 days or keep max 50
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const oldNotifs = notifs.filter(n => n.createdAt < sevenDaysAgo);
      const recentNotifs = notifs.filter(n => n.createdAt >= sevenDaysAgo);
      
      let toDelete = [...oldNotifs];
      
      // If still more than 50 recent notifications, delete the oldest ones
      if (recentNotifs.length > 50) {
        toDelete = [...toDelete, ...recentNotifs.slice(50)];
      }

      if (toDelete.length > 0) {
        try {
          // Firestore batch limit is 500
          for (let i = 0; i < toDelete.length; i += 400) {
            const chunk = toDelete.slice(i, i + 400);
            const batch = writeBatch(db);
            chunk.forEach(n => {
              batch.delete(doc(db, 'notifications', n.id));
            });
            await batch.commit();
          }
        } catch (error) {
          console.error("Error cleaning up old notifications:", error);
        }
      }

      // Only set the ones we are keeping
      setNotifications(recentNotifs.slice(0, 50));
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

  useEffect(() => {
    if ('setAppBadge' in navigator) {
      const unreadCount = notifications.filter(n => !n.read).length;
      if (unreadCount > 0) {
        // @ts-ignore - navigator.setAppBadge is not yet in standard TS dom lib sometimes
        navigator.setAppBadge(unreadCount).catch(console.error);
      } else {
        // @ts-ignore
        navigator.clearAppBadge().catch(console.error);
      }
    }
  }, [notifications]);

  return { notifications, markAsRead, deleteNotification, clearAll };
};
