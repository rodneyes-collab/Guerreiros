const fs = require('fs');
let code = fs.readFileSync('components/MatchView.tsx', 'utf8');

const getRankedPlayerIdsString = `
  // Find ranked players (Strongest and Weakest Two for Bottom 4 display per team)
  const getRankedPlayerIds = (team: any) => {
    if (!team) return { strongestTwo: [], weakestTwo: [] };
    // Only line players (non-setters) are considered for the Bottom 4 indicators!
    const players = (team.players || []).filter(Boolean);
    if (players.length === 0) return { strongestTwo: [], weakestTwo: [] };
    
    // Sort descending by Composite Performance Rating (60% Tech + 40% WinRate)
    const sorted = [...players].sort((a,b) => calculateCompositePerformanceRating(b) - calculateCompositePerformanceRating(a));
    
    const strongestTwo = sorted.slice(0, Math.min(2, sorted.length)).map(p => p.id);
    const candidatesForWeakest = sorted.filter(p => !strongestTwo.includes(p.id));
    const weakestTwo = candidatesForWeakest.slice(Math.max(0, candidatesForWeakest.length - 2)).map(p => p.id);
    
    return {
      strongestTwo,
      weakestTwo
    };
  };

  const rankedA = generationResult ? getRankedPlayerIds(generationResult.teamA) : { strongestTwo: [], weakestTwo: [] };
  const rankedB = generationResult ? getRankedPlayerIds(generationResult.teamB) : { strongestTwo: [], weakestTwo: [] };
`;

const getPlayerIcColorString = `
  // Função para retornar a cor do LED (5 níveis de IC) para todos os jogadores da partida
  const getPlayerIcColor = (playerId: string) => {
    if (!generationResult) return { color: 'bg-white/20', title: 'N/A' };
    const allPlayers = [
      generationResult.teamA?.setter,
      ...(generationResult.teamA?.players || []),
      generationResult.teamB?.setter,
      ...(generationResult.teamB?.players || [])
    ].filter(Boolean) as Player[];

    const sorted = [...allPlayers].sort((a, b) => calculateCompositePerformanceRating(b) - calculateCompositePerformanceRating(a));
    const index = sorted.findIndex(p => p.id === playerId);
    if (index === -1) return { color: 'bg-white/20', title: 'N/A' };

    const percentile = index / Math.max(1, sorted.length);
    
    if (percentile <= 0.2) return { color: 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.9)] animate-pulse', title: 'Nível 1 (Verde) - Top IC da Partida' };
    if (percentile <= 0.4) return { color: 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.9)] animate-pulse', title: 'Nível 2 (Azul) - Alto IC' };
    if (percentile <= 0.6) return { color: 'bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.9)] animate-pulse', title: 'Nível 3 (Amarelo) - IC Médio' };
    if (percentile <= 0.8) return { color: 'bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.9)] animate-pulse', title: 'Nível 4 (Laranja) - IC Abaixo da Média' };
    return { color: 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.9)] animate-pulse', title: 'Nível 5 (Vermelho) - Menor IC da Partida' };
  };
`;

code = code.replace(getRankedPlayerIdsString.trim(), getPlayerIcColorString.trim());
fs.writeFileSync('components/MatchView.tsx', code);
