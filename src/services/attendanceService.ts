
import { db, collection, getDocs, query, where, doc, getDoc, collectionGroup, deleteDoc, writeBatch } from '../../firebase';
import { Player } from '../../types';

export interface AttendanceRecord extends Player {
  date: string;
  month: string;
}

export const clearAttendanceHistory = async () => {
  try {
    const playersSnap = await getDocs(collectionGroup(db, 'players'));
    let batch = writeBatch(db);
    let count = 0;
    
    for (const d of playersSnap.docs) {
      if (d.ref.path.startsWith('attendance/')) {
        batch.delete(d.ref);
        count++;
        if (count >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
    }
    
    if (count > 0) {
      await batch.commit();
    }
    
    // Also delete the parent documents
    const attendanceSnap = await getDocs(collection(db, 'attendance'));
    let parentBatch = writeBatch(db);
    let parentCount = 0;
    for (const d of attendanceSnap.docs) {
      parentBatch.delete(d.ref);
      parentCount++;
      if (parentCount >= 400) {
        await parentBatch.commit();
        parentBatch = writeBatch(db);
        parentCount = 0;
      }
    }
    if (parentCount > 0) {
      await parentBatch.commit();
    }
    
  } catch (error) {
    console.error("Error clearing attendance history:", error);
    throw error;
  }
};

export const fetchAttendanceHistory = async (month?: string) => {
  const attendanceHistory: Record<string, Player[]> = {};
  
  try {
    // Use collectionGroup to find all players in any 'players' subcollection
    // We'll then filter by path to ensure they belong to 'attendance'
    const playersSnap = await getDocs(collectionGroup(db, 'players'));
    
    playersSnap.docs.forEach(d => {
      const path = d.ref.path;
      // Path format: attendance/{date}/players/{playerId}
      if (path.startsWith('attendance/')) {
        const parts = path.split('/');
        if (parts.length >= 3) {
          const date = parts[1];
          
          // Filter by month if provided (format YYYY-MM)
          if (!month || date.startsWith(month)) {
            if (!attendanceHistory[date]) {
              attendanceHistory[date] = [];
            }
            attendanceHistory[date].push(d.data() as Player);
          }
        }
      }
    });
    
    return attendanceHistory;
  } catch (error) {
    console.error("Error fetching attendance history:", error);
    throw error;
  }
};

export const calculateAttendanceStats = (history: Record<string, Player[]>, allPlayers: Player[]) => {
  const totalSessions = Object.keys(history).length;
  if (totalSessions === 0) return [];

  // Create a map of all players to easily look them up by ID
  const playerMap = new Map<string, Player>();
  allPlayers.forEach(p => {
    if (p.id) playerMap.set(p.id, p);
  });
  
  // Also add players from history who might not be in allPlayers (e.g. deleted)
  Object.values(history).forEach(dayPlayers => {
    dayPlayers.forEach(p => {
      if (p.id && !playerMap.has(p.id)) {
        playerMap.set(p.id, p);
      }
    });
  });

  const stats = Array.from(playerMap.values()).map(player => {
    let attendedSessions = 0;
    Object.values(history).forEach(dayPlayers => {
      if (dayPlayers.some(p => p.id === player.id)) {
        attendedSessions++;
      }
    });

    return {
      playerId: player.id,
      playerName: player.name,
      attendedSessions,
      totalSessions,
      percentage: (attendedSessions / totalSessions) * 100
    };
  });

  return stats.sort((a, b) => b.percentage - a.percentage);
};
