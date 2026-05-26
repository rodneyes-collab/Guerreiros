import { useState, useEffect, useRef } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { AppNotification } from '../../types';
import { useStore } from '../../store';

export const useNotifications = () => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const currentPlayer = useStore(state => state.currentPlayer);
  const prevNotificationsRef = useRef<AppNotification[]>([]);

  useEffect(() => {
    if (!currentPlayer || !auth.currentUser?.uid) {
      setNotifications([]);
      return;
    }
    console.log('useNotifications: setting up listener for playerUid:', auth.currentUser.uid);
    const q = query(
      collection(db, 'notifications'),
      where('playerUid', '==', auth.currentUser.uid)
    );
    const unsub = onSnapshot(q, async (snap) => {
      const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() } as AppNotification));
      
      // Detect new notifications
      const prevNotifs = prevNotificationsRef.current;
      const newNotifs = notifs.filter(n => !prevNotifs.find(p => p.id === n.id));

      if (newNotifs.length > 0) {
        console.log('New notifications detected, playing sound:', newNotifs.length);
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(1760, audioCtx.currentTime + 0.1);
        oscillator.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.2);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.5);
      }

      prevNotificationsRef.current = notifs;
      console.log('Notifications (', currentPlayer?.id, '):', notifs);
      
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
