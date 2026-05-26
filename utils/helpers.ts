
import { Player, Gender } from '../types';
import { getFirestoreDateKey } from '../firebase';

export const getTodayKey = () => {
  return `spikegen_attendance_${getFirestoreDateKey()}`;
};

export const formatTime = (seconds: number) => {
  const totalSeconds = Math.floor(seconds);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export const cleanObject = (obj: any): any => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(cleanObject);
  
  const newObj: any = {};
  Object.keys(obj).forEach(key => {
    const val = obj[key];
    if (val !== undefined) {
      newObj[key] = cleanObject(val);
    }
  });
  return newObj;
};

export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // in metres
};

export const translateGender = (gender: string) => {
  switch (gender) {
    case 'MALE':
    case 'M': 
      return 'Masculino';
    case 'FEMALE':
    case 'F': 
      return 'Feminino';
    default: return gender;
  }
};

export const formatBrazilianDate = (dateString: string | number) => {
  try {
    let dateObj: Date;
    if (typeof dateString === 'string') {
      if (dateString.includes('T')) {
        dateObj = new Date(dateString);
      } else {
        const [year, month, day] = dateString.split('-');
        return `${day}/${month}`;
      }
    } else {
      dateObj = new Date(dateString);
    }

    return new Intl.DateTimeFormat('pt-BR', { 
      timeZone: 'America/Sao_Paulo', 
      day: '2-digit', 
      month: '2-digit' 
    }).format(dateObj);
  } catch {
    return 'Data';
  }
};

export const safeLocalStorage = {
  getItem: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn('LocalStorage access failed:', e);
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn('LocalStorage write failed:', e);
    }
  },
  removeItem: (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn('LocalStorage remove failed:', e);
    }
  }
};

export const getSafePlayer = (playerId: string, players: Player[]): Player => {
  const player = players.find(p => p.id === playerId);
  if (player) return player;
  
  // Return a "Ghost Player" to prevent UI crashes on orphaned IDs
  return {
    id: playerId,
    name: 'Sócio Removido',
    isAdmin: false,
    elo: 1200,
    email: undefined,
    uid: undefined,
    gender: Gender.MALE,
    isOfficialSetter: false,
    matchesPlayed: 0,
    dailyMatches: 0,
    dailyWins: 0,
    dailyLosses: 0,
    dailyEloGain: 0,
    wins: 0,
    losses: 0,
    arrivalOrder: 999,
    status: 'inactive'
  } as Player;
};
