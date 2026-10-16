import React, { useState, useEffect } from 'react';
import { Match, Player } from '../../types';
import { Trophy, X, Save, AlertCircle, ArrowLeftRight, RotateCcw, Check, Users } from 'lucide-react';

interface EditMatchModalProps {
  isOpen: boolean;
  match: Match | null;
  players: Player[];
  onClose: () => void;
  onSave: (matchId: string, newWinner: 'A' | 'B', newScoreA: number, newScoreB: number, newTeamA?: string[], newTeamB?: string[]) => Promise<void>;
}

export const EditMatchModal: React.FC<EditMatchModalProps> = ({
  isOpen,
  match,
  players,
  onClose,
  onSave
}) => {
  const [scoreA, setScoreA] = useState<number>(match?.scoreA || 0);
  const [scoreB, setScoreB] = useState<number>(match?.scoreB || 0);
  const [winner, setWinner] = useState<'A' | 'B'>(match?.winner || 'A');
  const [teamA, setTeamA] = useState<string[]>(match?.teamA || []);
  const [teamB, setTeamB] = useState<string[]>(match?.teamB || []);
  const [selectedPlayerA, setSelectedPlayerA] = useState<string | null>(null);
  const [selectedPlayerB, setSelectedPlayerB] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sincroniza estado quando a prop match mudar
  useEffect(() => {
    if (match) {
      setScoreA(match.scoreA || 0);
      setScoreB(match.scoreB || 0);
      setWinner(match.winner || 'A');
      setTeamA(match.teamA || []);
      setTeamB(match.teamB || []);
      setSelectedPlayerA(null);
      setSelectedPlayerB(null);
      setError(null);
    }
  }, [match]);

  if (!isOpen || !match) return null;

  const getPlayerName = (id: string | null) => {
    if (!id) return '';
    const p = players.find(player => player.id === id);
    return p ? p.name : 'Desconhecido';
  };

  const handleScoreAChange = (val: number) => {
    const newScore = Math.max(0, val);
    setScoreA(newScore);
    if (newScore > scoreB) {
      setWinner('A');
    } else if (scoreB > newScore) {
      setWinner('B');
    }
  };

  const handleScoreBChange = (val: number) => {
    const newScore = Math.max(0, val);
    setScoreB(newScore);
    if (newScore > scoreA) {
      setWinner('B');
    } else if (scoreA > newScore) {
      setWinner('A');
    }
  };

  const toggleSelectPlayerA = (id: string) => {
    if (selectedPlayerB) {
      // Já tem um do B selecionado, faz a troca automática
      const targetB = selectedPlayerB;
      setTeamA(prev => {
        const newList = [...prev];
        const idx = newList.indexOf(id);
        if (idx !== -1) newList[idx] = targetB;
        return newList;
      });
      setTeamB(prev => {
        const newList = [...prev];
        const idx = newList.indexOf(targetB);
        if (idx !== -1) newList[idx] = id;
        return newList;
      });
      setSelectedPlayerA(null);
      setSelectedPlayerB(null);
    } else {
      setSelectedPlayerA(prev => prev === id ? null : id);
    }
  };

  const toggleSelectPlayerB = (id: string) => {
    if (selectedPlayerA) {
      // Já tem um do A selecionado, faz a troca automática
      const targetA = selectedPlayerA;
      setTeamA(prev => {
        const newList = [...prev];
        const idx = newList.indexOf(targetA);
        if (idx !== -1) newList[idx] = id;
        return newList;
      });
      setTeamB(prev => {
        const newList = [...prev];
        const idx = newList.indexOf(id);
        if (idx !== -1) newList[idx] = targetA;
        return newList;
      });
      setSelectedPlayerA(null);
      setSelectedPlayerB(null);
    } else {
      setSelectedPlayerB(prev => prev === id ? null : id);
    }
  };


  const handleResetTeams = () => {
    setTeamA(match.teamA || []);
    setTeamB(match.teamB || []);
    setSelectedPlayerA(null);
    setSelectedPlayerB(null);
  };

  const isTeamsChanged = 
    teamA.length !== (match.teamA || []).length ||
    teamA.some((id, idx) => id !== match.teamA[idx]) ||
    teamB.some((id, idx) => id !== match.teamB[idx]);

  const handleSave = async () => {
    try {
      setError(null);

      // Validações de entrada
      if (isNaN(scoreA) || isNaN(scoreB)) {
        setError('Os placares devem ser números válidos.');
        return;
      }

      if (scoreA < 0 || scoreB < 0) {
        setError('Os placares não podem ser negativos.');
        return;
      }

      if (scoreA === scoreB) {
        setError('O vôlei não permite empate. O placar deve ter um vencedor.');
        return;
      }

      setIsSaving(true);
      await onSave(
        match.id, 
        winner, 
        scoreA, 
        scoreB,
        isTeamsChanged ? teamA : undefined,
        isTeamsChanged ? teamB : undefined
      );
      onClose();
    } catch (err: any) {
      console.error('[DEBUG - EditMatchModal] Error inside handleSave:', err);
      setError(`Erro ao salvar o resultado: ${err?.message || 'Tente novamente.'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-zinc-900/90">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-brand-primary/20 text-brand-primary">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white uppercase tracking-wider">
                Editar Partida {match.dailyNumber ? `#${match.dailyNumber}` : ''}
              </h3>
              <p className="text-xs text-zinc-400 font-medium">
                Data: {match.date || 'Data não informada'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 overflow-y-auto">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Troca de Atletas entre Equipes Banner / Controller */}
          <div className="p-4 bg-black/60 rounded-2xl border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-brand-primary" />
                <span className="text-xs font-black uppercase tracking-wider text-white">
                  Troca de Atletas entre Times (A ⇄ B)
                </span>
              </div>
              {isTeamsChanged && (
                <button
                  type="button"
                  onClick={handleResetTeams}
                  className="text-white/50 hover:text-brand-primary flex items-center gap-1 text-[11px] font-bold transition-colors"
                >
                  <RotateCcw className="w-3 h-3" /> Restaurar Original
                </button>
              )}
            </div>

            {/* Ação de Troca Selecionada - Agora Automática, mantemos apenas dicas visuais se necessário */}
            {!selectedPlayerA && !selectedPlayerB && !isTeamsChanged && (
              <div className="p-2.5 bg-white/5 border border-white/5 rounded-xl text-center">
                <p className="text-[11px] text-zinc-400">
                  Clique em 1 jogador do Time A e 1 jogador do Time B abaixo para inverter seus times automaticamente.
                </p>
              </div>
            )}

            {(selectedPlayerA || selectedPlayerB) && (
              <div className="p-2.5 bg-brand-primary/10 border border-brand-primary/20 rounded-xl text-center animate-pulse">
                <p className="text-[11px] text-brand-primary font-bold">
                  {selectedPlayerA ? (
                    <span>Sócio do <strong className="font-black">Time A</strong> selecionado. Clique em alguém do <strong className="font-black">Time B</strong> para trocar.</span>
                  ) : (
                    <span>Sócio do <strong className="font-black">Time B</strong> selecionado. Clique em alguém do <strong className="font-black">Time A</strong> para trocar.</span>
                  )}
                </p>
              </div>
            )}

            {isTeamsChanged && (
              <div className="flex items-center gap-1.5 text-[11px] text-brand-primary font-bold px-1 bg-brand-primary/5 p-2 rounded-lg border border-brand-primary/10">
                <Check className="w-3.5 h-3.5" />
                <span>Escalação alterada: salve as alterações para reprocessar o histórico e ELO dos sócios trocados.</span>
              </div>
            )}
          </div>

          {/* Time A vs Time B Placar e Elencos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Time A */}
            <div className={`p-4 rounded-xl border transition-all ${
              winner === 'A' 
                ? 'bg-brand-primary/10 border-brand-primary/50 shadow-lg shadow-brand-primary/5' 
                : 'bg-zinc-800/50 border-white/5'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-black uppercase tracking-wider text-white">
                  Time A
                </span>
                {winner === 'A' && (
                  <span className="px-2 py-0.5 text-[10px] font-black uppercase bg-brand-primary text-black rounded">
                    Vencedor
                  </span>
                )}
              </div>

              <div className="space-y-2 mb-4">
                <label className="text-[11px] font-bold uppercase text-zinc-400">Pontos</label>
                <input
                  type="number"
                  min="0"
                  value={scoreA}
                  onChange={(e) => handleScoreAChange(parseInt(e.target.value) || 0)}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-2xl font-black text-white text-center focus:border-brand-primary outline-none"
                />
              </div>

              <button
                type="button"
                onClick={() => setWinner('A')}
                className={`w-full py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
                  winner === 'A'
                    ? 'bg-brand-primary text-black'
                    : 'bg-white/5 text-white hover:bg-white/10 border border-white/10'
                }`}
              >
                Declarar Vencedor
              </button>

              <div className="mt-4 pt-3 border-t border-white/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase text-zinc-400">
                    Atletas ({teamA.length}):
                  </span>
                  <span className="text-[9px] text-zinc-500 font-medium">Toque para selecionar</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {teamA.map((id) => {
                    const playerObj = players.find(p => p.id === id);
                    const isSelected = selectedPlayerA === id;
                    const wasOriginallyInB = match.teamB?.includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleSelectPlayerA(id)}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all border text-left ${
                          isSelected
                            ? 'bg-brand-primary text-black border-brand-primary font-black shadow-md shadow-brand-primary/20'
                            : 'bg-black/40 hover:bg-white/10 text-white/90 border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="truncate">{playerObj ? playerObj.name : 'Desconhecido'}</span>
                          {wasOriginallyInB && (
                            <span className={`text-[8px] px-1 py-0.5 rounded font-black uppercase ${
                              isSelected ? 'bg-black text-brand-primary' : 'bg-brand-primary/20 text-brand-primary border border-brand-primary/40'
                            }`}>
                              Veio do B
                            </span>
                          )}
                        </div>
                        <span className={`text-[9px] font-mono shrink-0 ml-1.5 uppercase ${
                          isSelected ? 'text-black/80 font-black' : 'text-zinc-500'
                        }`}>
                          {isSelected ? '✓ Pronto' : 'Trocar'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Time B */}
            <div className={`p-4 rounded-xl border transition-all ${
              winner === 'B' 
                ? 'bg-brand-primary/10 border-brand-primary/50 shadow-lg shadow-brand-primary/5' 
                : 'bg-zinc-800/50 border-white/5'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-black uppercase tracking-wider text-white">
                  Time B
                </span>
                {winner === 'B' && (
                  <span className="px-2 py-0.5 text-[10px] font-black uppercase bg-brand-primary text-black rounded">
                    Vencedor
                  </span>
                )}
              </div>

              <div className="space-y-2 mb-4">
                <label className="text-[11px] font-bold uppercase text-zinc-400">Pontos</label>
                <input
                  type="number"
                  min="0"
                  value={scoreB}
                  onChange={(e) => handleScoreBChange(parseInt(e.target.value) || 0)}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-2xl font-black text-white text-center focus:border-brand-primary outline-none"
                />
              </div>

              <button
                type="button"
                onClick={() => setWinner('B')}
                className={`w-full py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
                  winner === 'B'
                    ? 'bg-brand-primary text-black'
                    : 'bg-white/5 text-white hover:bg-white/10 border border-white/10'
                }`}
              >
                Declarar Vencedor
              </button>

              <div className="mt-4 pt-3 border-t border-white/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase text-zinc-400">
                    Atletas ({teamB.length}):
                  </span>
                  <span className="text-[9px] text-zinc-500 font-medium">Toque para selecionar</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {teamB.map((id) => {
                    const playerObj = players.find(p => p.id === id);
                    const isSelected = selectedPlayerB === id;
                    const wasOriginallyInA = match.teamA?.includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleSelectPlayerB(id)}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all border text-left ${
                          isSelected
                            ? 'bg-brand-primary text-black border-brand-primary font-black shadow-md shadow-brand-primary/20'
                            : 'bg-black/40 hover:bg-white/10 text-white/90 border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="truncate">{playerObj ? playerObj.name : 'Desconhecido'}</span>
                          {wasOriginallyInA && (
                            <span className={`text-[8px] px-1 py-0.5 rounded font-black uppercase ${
                              isSelected ? 'bg-black text-brand-primary' : 'bg-brand-primary/20 text-brand-primary border border-brand-primary/40'
                            }`}>
                              Veio do A
                            </span>
                          )}
                        </div>
                        <span className={`text-[9px] font-mono shrink-0 ml-1.5 uppercase ${
                          isSelected ? 'text-black/80 font-black' : 'text-zinc-500'
                        }`}>
                          {isSelected ? '✓ Pronto' : 'Trocar'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="p-3 bg-zinc-800/30 rounded-xl border border-white/5 text-xs text-zinc-400 space-y-1">
            <span className="font-bold text-white block uppercase text-[11px]">Aviso de Reprocessamento Automático:</span>
            <p>
              Ao confirmar a alteração do resultado ou da escalação, o sistema atualizará a partida e recalculará automaticamente as vitórias, derrotas, saldo de pontos, ELO e Score B-1 dos atletas envolvidos em todo o histórico.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-zinc-900/90 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 text-xs font-black uppercase text-zinc-400 hover:text-white rounded-xl hover:bg-white/5 transition-all"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-primary text-black font-black uppercase text-xs rounded-xl shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90 transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Reprocessando...' : 'Salvar e Reprocessar'}
          </button>
        </div>
      </div>
    </div>
  );
};
