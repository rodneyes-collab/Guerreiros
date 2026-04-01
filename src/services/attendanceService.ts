
import { db, collection, getDocs, query, where, doc, getDoc, collectionGroup } from '../../firebase';
import { Player } from '../../types';

export interface AttendanceRecord extends Player {
  date: string;
  month: string;
}

export const fetchAttendanceHistory = async (month?: string) => {
  const attendanceHistory: Record<string, Player[]> = {};
  
  try {
    // Fetch all date documents in the attendance collection
    const attendanceSnap = await getDocs(collection(db, 'attendance'));
    const dates = attendanceSnap.docs.map(d => d.id);
    
    // Filter dates by month if provided (format YYYY-MM)
    const filteredDates = month 
      ? dates.filter(d => d.startsWith(month))
      : dates;

    for (const date of filteredDates) {
      const playersSnap = await getDocs(collection(db, 'attendance', date, 'players'));
      attendanceHistory[date] = playersSnap.docs.map(d => d.data() as Player);
    }
    
    return attendanceHistory;
  } catch (error) {
    console.error("Error fetching attendance history:", error);
    throw error;
  }
};

export const calculateAttendanceStats = (history: Record<string, Player[]>, allPlayers: Player[]) => {
  const totalSessions = Object.keys(history).length;
  if (totalSessions === 0) return [];

  const stats = allPlayers.map(player => {
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
