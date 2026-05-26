
export const getPlayerTier = (player: any) => {
  const elo = player.elo || 1200;
  const matches = player.matchesPlayed || 0;
  const winRate = ((player.wins || 0) / (matches || 1)) * 100;
  
  if (matches < 5) return { label: 'Novato', color: 'text-white/40' };
  
  if (elo < 1150) return { label: 'Bronze', color: 'text-orange-500' };
  
  if (elo < 1250) {
    if (winRate > 55 && matches > 15) return { label: 'Prata Top', color: 'text-slate-200' };
    return { label: 'Prata', color: 'text-slate-300' };
  }
  
  if (elo < 1350) {
    if (winRate > 60 && matches > 20) return { label: 'Ouro Pro', color: 'text-yellow-400' };
    return { label: 'Ouro', color: 'text-yellow-500' };
  }

  if (elo < 1500) {
    if (winRate > 62 && matches > 25) return { label: 'Diamante Star', color: 'text-blue-300' };
    return { label: 'Diamante', color: 'text-blue-400' };
  }
  
  if (elo < 1700) {
    const efficiency = (elo - 1200) / (matches || 1);
    if (efficiency > 10 && winRate > 65) return { label: 'Elite Star', color: 'text-cyan-400' };
    return { label: 'Elite', color: 'text-brand-primary' };
  }
  
  if (elo >= 1700) {
    if (elo >= 1900) return { label: 'Mestre Supremo', color: 'text-red-500 font-bold animate-pulse' };
    return { label: 'Lenda', color: 'text-purple-400' };
  }

  return { label: 'Nível Pro', color: 'text-brand-primary' };
};

export const getEfficiencyTier = (efficiency: number) => {
  if (efficiency < 0.05) return { label: 'Bronze', color: 'text-orange-500' };
  if (efficiency < 0.15) return { label: 'Prata', color: 'text-slate-300' };
  if (efficiency < 0.30) return { label: 'Ouro', color: 'text-yellow-500' };
  if (efficiency < 0.50) return { label: 'Diamante', color: 'text-blue-400' };
  if (efficiency < 0.75) return { label: 'Elite', color: 'text-brand-primary' };
  if (efficiency < 1.00) return { label: 'Lenda', color: 'text-purple-400' };
  return { label: 'Mestre Supremo', color: 'text-red-500 font-bold animate-pulse' };
};
