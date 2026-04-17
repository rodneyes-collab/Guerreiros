
import React, { useState } from 'react';
import { Swords } from 'lucide-react';
import { Team, Player } from '../../types';

interface CourtDiagramProps {
  teamA: Team;
  teamB: Team;
}

export const CourtDiagram: React.FC<CourtDiagramProps> = ({ teamA, teamB }) => {
  const [isComparisonMode, setIsComparisonMode] = useState(false);

  const getPositions = (team: Team) => {
    const setter = team.setter;
    const others = [...team.players].sort((a, b) => b.elo - a.elo);
    const finalSetter = setter || others.pop();
    
    return {
      p4: others[0],
      p3: finalSetter,
      p2: others[1],
      p5: others[2],
      p6: others[3],
      p1: others[4]
    };
  };

  const posA = getPositions(teamA);
  const posB = getPositions(teamB);

  const PlayerCircle = ({ p, pos, isTeamB = false, isHighlighted = false }: { p: Player | undefined; pos: string; isTeamB?: boolean; isHighlighted?: boolean }) => (
    <div className={`flex flex-col items-center gap-1 transition-all duration-500 ${isComparisonMode && !isHighlighted ? 'opacity-20 scale-90 grayscale' : 'opacity-100 scale-100'}`}>
      <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full border-4 flex items-center justify-center shadow-lg transition-transform hover:scale-110 ${
        isTeamB ? 'bg-black border-white/20 text-white' : 'bg-black border-brand-primary/40 text-brand-primary'
      } ${isHighlighted || isComparisonMode ? 'ring-4 ring-brand-primary/50 ring-offset-2 ring-offset-brand-secondary' : ''}`}>
        <span className="text-[12px] font-black uppercase tracking-tighter">
          {p?.name ? p.name.split(' ')[0].substring(0, 4) : '---'}
        </span>
      </div>
      <div className="bg-brand-secondary/90 backdrop-blur px-3 py-1 rounded-full shadow-sm border border-brand-primary/40">
        <p className="text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">Pos {pos}</p>
      </div>
    </div>
  );

  const MatchupLine = ({ pA, pB, height = "h-24" }: { pA: Player | undefined; pB: Player | undefined; height?: string }) => {
    if (!pA || !pB) return null;
    const diff = pA.elo - pB.elo;
    const absDiff = Math.abs(diff);
    const isCritical = absDiff > 50;

    return (
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className={`flex flex-col items-center gap-1 transition-opacity duration-500 ${isComparisonMode ? 'opacity-100' : 'opacity-0'}`}>
          <div className={`${height} w-[2px] ${isCritical ? 'bg-red-500' : 'bg-brand-primary/50'} dashed-line`}></div>
          <div className={`px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-tighter shadow-sm border ${
            isCritical ? 'bg-red-500 text-white border-red-400' : 'bg-brand-primary text-brand-secondary border-brand-primary/50'
          }`}>
            {diff > 0 ? `+${diff}` : diff} ELO
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-black rounded-[3rem] p-8 sm:p-12 shadow-2xl border border-brand-primary/40 relative overflow-hidden">
      <button 
        onClick={() => setIsComparisonMode(!isComparisonMode)}
        className={`absolute top-6 right-6 z-20 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 border ${
          isComparisonMode 
            ? 'bg-brand-primary text-brand-secondary border-brand-primary shadow-lg shadow-brand-primary/20' 
            : 'bg-white/5 text-white/60 border-brand-primary/40 hover:bg-white/10 hover:text-white'
        }`}
      >
        <Swords className="w-3 h-3" />
        {isComparisonMode ? 'Modo Normal' : 'Ver Duelos'}
      </button>

      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <div className="absolute top-1/2 left-0 w-full h-1 bg-brand-primary"></div>
        <div className="absolute top-0 left-1/2 w-1 h-full bg-brand-primary"></div>
      </div>

      <div className="relative z-10 flex flex-col items-center gap-12">
        <div className="grid grid-cols-3 gap-x-12 gap-y-8">
          <PlayerCircle p={posB.p1} pos="1" isTeamB />
          <PlayerCircle p={posB.p6} pos="6" isTeamB />
          <PlayerCircle p={posB.p5} pos="5" isTeamB />
          <PlayerCircle p={posB.p2} pos="2" isTeamB isHighlighted={true} />
          <PlayerCircle p={posB.p3} pos="3" isTeamB isHighlighted={true} />
          <PlayerCircle p={posB.p4} pos="4" isTeamB isHighlighted={true} />
        </div>

        <div className="absolute inset-0 flex justify-center items-center pointer-events-none">
          <div className="flex gap-x-12">
            <div className="w-12 flex justify-center relative">
              <MatchupLine pA={posA.p4} pB={posB.p2} />
            </div>
            <div className="w-12 flex justify-center relative">
              <MatchupLine pA={posA.p3} pB={posB.p3} />
            </div>
            <div className="w-12 flex justify-center relative">
              <MatchupLine pA={posA.p2} pB={posB.p4} />
            </div>
          </div>
          
          <div className="absolute inset-0 flex justify-center items-center">
             <div className="flex gap-x-12">
                <div className="w-12 flex justify-center relative -translate-y-32">
                  <MatchupLine pA={posA.p5} pB={posB.p1} height="h-64" />
                </div>
                <div className="w-12 flex justify-center relative -translate-y-32">
                  <MatchupLine pA={posA.p6} pB={posB.p6} height="h-64" />
                </div>
                <div className="w-12 flex justify-center relative -translate-y-32">
                  <MatchupLine pA={posA.p1} pB={posB.p5} height="h-64" />
                </div>
             </div>
          </div>
        </div>

        <div className="w-full flex items-center gap-4">
          <div className="h-[2px] flex-grow bg-gradient-to-r from-transparent via-brand-primary to-transparent"></div>
          <span className="text-[10px] font-black text-brand-primary uppercase tracking-[0.5em]">Rede</span>
          <div className="h-[2px] flex-grow bg-gradient-to-r from-transparent via-brand-primary to-transparent"></div>
        </div>

        <div className="grid grid-cols-3 gap-x-12 gap-y-8">
          <PlayerCircle p={posA.p4} pos="4" isHighlighted={true} />
          <PlayerCircle p={posA.p3} pos="3" isHighlighted={true} />
          <PlayerCircle p={posA.p2} pos="2" isHighlighted={true} />
          <PlayerCircle p={posA.p5} pos="5" isHighlighted={false} />
          <PlayerCircle p={posA.p6} pos="6" isHighlighted={false} />
          <PlayerCircle p={posA.p1} pos="1" isHighlighted={false} />
        </div>
      </div>

      <div className="mt-12 flex justify-center">
        <div className="bg-brand-primary/5 backdrop-blur px-6 py-3 rounded-2xl border border-brand-primary/40">
          <p className="text-[10px] font-black text-brand-primary/80 uppercase tracking-widest text-center">
            Estratégia: Levantador fixo na Posição 3. Demais jogadores distribuídos por ELO para equilíbrio na rede.
          </p>
        </div>
      </div>

      <style>{`
        .dashed-line {
          background-image: linear-gradient(to bottom, currentColor 50%, transparent 50%);
          background-size: 2px 8px;
          background-repeat: repeat-y;
        }
      `}</style>
    </div>
  );
};
