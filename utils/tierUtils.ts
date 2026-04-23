
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
  
  if (elo < 1400) {
    if (winRate > 60 && matches > 20) return { label: 'Ouro Pro', color: 'text-yellow-400' };
    return { label: 'Ouro', color: 'text-yellow-500' };
  }
  
  if (elo < 1600) {
    const efficiency = (elo - 1200) / (matches || 1);
    if (efficiency > 10 && winRate > 65) return { label: 'Elite Star', color: 'text-cyan-400' };
    return { label: 'Elite', color: 'text-brand-primary' };
  }
  
  if (elo >= 1600) {
    if (elo >= 1800) return { label: 'Mestre Supremo', color: 'text-red-500 font-bold animate-pulse' };
    return { label: 'Lenda', color: 'text-purple-400' };
  }

  return { label: 'Nível Pro', color: 'text-brand-primary' };
};
