const fs = require('fs');
let code = fs.readFileSync('components/MatchView.tsx', 'utf8');

const getPlayerIcColorStr = `  // Função para retornar a cor do LED (5 níveis de IC) para todos os jogadores da partida
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
  };`;

const icColorsMapStr = `  // Função para retornar a cor do LED (5 níveis de IC) para todos os jogadores da partida
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

  const icColorsMap = React.useMemo(() => {
    const map: Record<string, { color: string, title: string }> = {};
    if (!generationResult) return map;
    const allPlayers = [
      generationResult.teamA?.setter,
      ...(generationResult.teamA?.players || []),
      generationResult.teamB?.setter,
      ...(generationResult.teamB?.players || [])
    ].filter(Boolean) as Player[];
    allPlayers.forEach(p => {
      map[p.id] = getPlayerIcColor(p.id);
    });
    return map;
  }, [generationResult]);`;

code = code.replace(getPlayerIcColorStr, icColorsMapStr);

const tcReplaceA = `bottomTwoIds={new Set(generationResult.bottomTwoIds || [])}
              />`;
const newTcReplaceA = `bottomTwoIds={new Set(generationResult.bottomTwoIds || [])}
                icColors={icColorsMap}
              />`;
code = code.replace(tcReplaceA, newTcReplaceA);

const tcReplaceB = `bottomTwoIds={new Set(generationResult.bottomTwoIds || [])}
              />`; // Need to be careful because both are the same string
code = code.replace(tcReplaceB, newTcReplaceA); 
// Because String.replace replaces only the first occurrence, I'll use it twice.
code = code.replace(tcReplaceB, newTcReplaceA); 

fs.writeFileSync('components/MatchView.tsx', code);
