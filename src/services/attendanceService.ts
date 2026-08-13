
import { db, collection, getDocs, query, where, doc, getDoc, collectionGroup, deleteDoc, writeBatch } from '../../firebase';
import { Player } from '../../types';

export interface AttendanceRecord extends Player {
  date: string;
  month: string;
}

export const clearAttendanceHistory = async () => {
  try {
    const attendanceSnap = await getDocs(collection(db, 'attendance'));
    let batch = writeBatch(db);
    let count = 0;
    
    for (const dateDoc of attendanceSnap.docs) {
      const date = dateDoc.id;
      const playersSnap = await getDocs(collection(db, 'attendance', date, 'players'));
      
      for (const playerDoc of playersSnap.docs) {
        batch.delete(playerDoc.ref);
        count++;
        if (count >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
      
      batch.delete(dateDoc.ref);
      count++;
      if (count >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }
    
    if (count > 0) {
      await batch.commit();
    }
    
  } catch (error) {
    console.error("Error clearing attendance history:", error);
    throw error;
  }
};

export const fetchAttendanceHistory = async (month?: string) => {
  const attendanceHistory: Record<string, Player[]> = {};
  
  try {
    // Instead of collectionGroup('players') which requires cross-collection read permissions
    // and fetches the master players collection as well, we query 'attendance' first.
    const attendanceDatesSnap = await getDocs(collection(db, 'attendance'));
    
    // We can fetch players concurrently for all dates
    const fetchPromises = attendanceDatesSnap.docs.map(async (dateDoc) => {
      const date = dateDoc.id;
      
      // Filter by month if provided (format YYYY-MM)
      if (month && !date.startsWith(month)) {
        return;
      }
      
      const playersSnap = await getDocs(collection(db, 'attendance', date, 'players'));
      if (!playersSnap.empty) {
        attendanceHistory[date] = playersSnap.docs.map(d => d.data() as Player);
      }
    });

    await Promise.all(fetchPromises);
    
    return attendanceHistory;
  } catch (error) {
    console.error("Error fetching attendance history:", error);
    throw error;
  }
};

export const calculateAttendanceStats = (history: Record<string, Player[]>, allPlayers: Player[]) => {
  const totalDays = Object.keys(history).length;
  if (totalDays === 0) return [];

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
    let attendedDays = 0;
    
    Object.entries(history).forEach(([_, dayPlayers]) => {
      if (dayPlayers.some(p => p.id === player.id)) {
        attendedDays++;
      }
    });
    
    const percentage = totalDays > 0 ? (attendedDays / totalDays) * 100 : 0;

    return {
      playerId: player.id,
      playerName: player.name,
      attendedSessions: attendedDays,
      totalSessions: totalDays,
      percentage: percentage
    };
  });

  return stats.sort((a, b) => b.percentage - a.percentage);
};
