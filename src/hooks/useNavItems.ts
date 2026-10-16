import { useMemo } from 'react';
import { 
  ListTodo, 
  ClipboardCheck, 
  Swords, 
  Tv, 
  Trophy, 
  History, 
  Users, 
  DollarSign, 
  CreditCard, 
  Medal, 
  ShieldAlert, 
  Settings 
} from 'lucide-react';

export interface AppNavItem {
  id: string;
  label: string;
  icon: any;
  adminOnly: boolean;
}

interface UseNavItemsOptions {
  userRole: 'ADMIN' | 'MEMBER' | null;
  isTournamentEnabled?: boolean;
  isGameDay?: boolean;
  hasAttendance?: boolean;
}

export const useNavItems = ({
  userRole,
  isTournamentEnabled = false,
  isGameDay = false,
  hasAttendance = false
}: UseNavItemsOptions): AppNavItem[] => {
  const isAdmin = userRole === 'ADMIN';
  const tournamentActive = Boolean(isTournamentEnabled);
  const gameDayActive = Boolean(isGameDay);
  const attendanceActive = Boolean(hasAttendance);

  return useMemo(() => {
    const allItems: AppNavItem[] = [
      { id: 'intentions', label: 'Lista', icon: ListTodo, adminOnly: false },
      { id: 'presence', label: 'Presença', icon: ClipboardCheck, adminOnly: false },
      { id: 'generation', label: 'Partida', icon: Swords, adminOnly: false },
      { id: 'court_tablet', label: 'Telão', icon: Tv, adminOnly: false },
      { id: 'tournament', label: 'Torneio', icon: Trophy, adminOnly: false },
      { id: 'history', label: 'Histórico', icon: History, adminOnly: false },
      { id: 'members', label: 'Sócios', icon: Users, adminOnly: false },
      { id: 'payments', label: 'Financeiro', icon: DollarSign, adminOnly: true },
      { id: 'my_payments', label: 'Pagamentos', icon: CreditCard, adminOnly: false },
      { id: 'ranking', label: 'Ranking', icon: Medal, adminOnly: false },
      { id: 'rules', label: 'Regras', icon: ShieldAlert, adminOnly: false },
      { id: 'admin', label: 'Admin', icon: Settings, adminOnly: true },
    ];

    return allItems.filter(item => {
      if (item.adminOnly && !isAdmin) return false;
      if (item.id === 'tournament' && !tournamentActive && !isAdmin) return false;
      if (item.id === 'presence' && !gameDayActive && !isAdmin) {
        // Permite ver a lista de presença se houver alguém nela, mesmo que não seja quinta-feira oficialmente
        if (!attendanceActive) return false;
      }
      return true;
    });
  }, [isAdmin, tournamentActive, gameDayActive, attendanceActive]);
};
