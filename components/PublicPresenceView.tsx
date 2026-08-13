import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  UserCheck, 
  UserX, 
  Search, 
  CheckCircle2, 
  Lock, 
  ChevronRight, 
  AlertCircle, 
  ChevronLeft, 
  Smartphone, 
  HelpCircle,
  Trophy,
  Calendar,
  Users
} from 'lucide-react';
import { useStore } from '../store';
import { useIntentions } from '../src/hooks/useIntentions';
import { Logo } from '../src/components/Logo';
import { capitalizeName } from '../utils/helpers';

interface PublicPresenceViewProps {
  onBackToLogin: () => void;
  handleGoogleLogin: () => void;
}

export const PublicPresenceView: React.FC<PublicPresenceViewProps> = ({ onBackToLogin, handleGoogleLogin }) => {
  const players = useStore(state => state.players);
  const attendance = useStore(state => state.attendance);
  const { intentions, isLoaded, setIntent, resetIntent } = useIntentions();
  
  // States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successState, setSuccessState] = useState<{ active: boolean; type: 'GOING' | 'NOT_GOING' | null }>({
    active: false,
    type: null
  });
  const [isProcessing, setIsProcessing] = useState(false);

  // Filter active and eligible players
  const eligiblePlayers = useMemo(() => {
    return players.filter(p => (!p.status || p.status === 'active' || p.status === 'guest') && !p.isDM);
  }, [players]);

  // Find players matching search term
  const filteredPlayers = useMemo(() => {
    if (!searchTerm.trim()) return [];
    return eligiblePlayers.filter(p => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 5); // Limit to top 5 results for clarity
  }, [searchTerm, eligiblePlayers]);

  // Get going and absent players for the Live Board
  const goingPlayers = useMemo(() => {
    return players
      .filter(p => intentions.responses[p.id] === 'GOING')
      .sort((a, b) => {
        const timeA = intentions.confirmationTimestamps?.[a.id] || 0;
        const timeB = intentions.confirmationTimestamps?.[b.id] || 0;
        return timeA - timeB;
      });
  }, [players, intentions.responses, intentions.confirmationTimestamps]);

  const absentPlayers = useMemo(() => {
    return players.filter(p => intentions.responses[p.id] === 'NOT_GOING');
  }, [players, intentions.responses]);

  const undecidedCount = useMemo(() => {
    return eligiblePlayers.length - goingPlayers.length - absentPlayers.length;
  }, [eligiblePlayers, goingPlayers, absentPlayers]);

  // Auto-identify player
  useEffect(() => {
    const storedPlayerId = localStorage.getItem('guerreiros_player_id');
    if (storedPlayerId && eligiblePlayers.length > 0) {
      const player = eligiblePlayers.find(p => p.id === storedPlayerId);
      if (player) {
        setSelectedPlayer(player);
      }
    }
  }, [eligiblePlayers]);

  const handleSelectPlayer = (player: any) => {
    // Store for next time
    localStorage.setItem('guerreiros_player_id', player.id);
    
    setSelectedPlayer(player);
    setSearchTerm('');
    setErrorMsg('');
    setSuccessState({ active: false, type: null });
  };

  const handleResponse = async (status: 'GOING' | 'NOT_GOING') => {
    if (!selectedPlayer) return;

    setIsProcessing(true);
    try {
      await setIntent(selectedPlayer.id, status);
      setSuccessState({ active: true, type: status });
      setErrorMsg('');
      
      // Auto-dismiss success screen and reset selection after 5 seconds
      setTimeout(() => {
        setSuccessState({ active: false, type: null });
        setSelectedPlayer(null);
      }, 4500);
    } catch (e: any) {
      setErrorMsg('Falha ao registrar presença. Tente novamente: ' + (e.message || e));
    } finally {
      setIsProcessing(false);
    }
  };

  const formattedTargetDate = useMemo(() => {
    if (!intentions.targetDate) return '';
    const [y, m, d] = intentions.targetDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
  }, [intentions.targetDate]);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col p-4 sm:p-8 relative overflow-x-hidden md:pl-[12%] md:pr-[12%]">
      {/* Decorative Blur Backgrounds */}
      <div className="absolute top-10 right-10 w-96 h-96 bg-brand-primary/5 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-10 left-10 w-96 h-96 bg-brand-primary/5 rounded-full blur-[120px] pointer-events-none"></div>

      {/* Header section with club logo */}
      <header className="flex flex-col items-center justify-center text-center mt-4 mb-10 relative z-10 space-y-4">
        <Logo size="md" className="transform rotate-1 hover:rotate-0 transition-transform duration-500 drop-shadow-[0_0_20px_rgba(245,196,41,0.2)]" />
        <div className="space-y-1">
          <h1 className="text-3xl sm:text-5xl font-black font-sans text-white uppercase tracking-tight leading-none italic">
            GUERREIROS <span className="text-brand-primary">CONFIRMAÇÃO</span>
          </h1>
          <p className="text-[10px] sm:text-xs text-brand-primary/80 font-black uppercase tracking-[0.25em]">
            Lista de Presença Rápida • {formattedTargetDate || 'Quinta-feira'}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10 max-w-6xl w-full mx-auto flex-1">
        
        {/* Left Side: Search & Dynamic Interaction Card */}
        <section className="lg:col-span-7 space-y-6 flex flex-col">
          
          <div className="bg-white/5 backdrop-blur-md rounded-[2rem] border border-white/10 p-6 md:p-8 space-y-6 shadow-2xl flex-1">
            <h2 className="text-lg sm:text-xl font-black uppercase tracking-widest text-brand-primary border-b border-white/5 pb-3">
              Marcar Seu Nome
            </h2>

            {/* Step 1: Select Player */}
            {!selectedPlayer ? (
              <div className="space-y-4">
                <p className="text-sm font-bold text-slate-300">
                  Procure seu nome na lista oficial do clube abaixo para iniciar:
                </p>
                
                <div className="relative group">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-brand-primary transition-colors">
                    <Search className="w-5 h-5" />
                  </span>
                  <input
                    type="text"
                    placeholder="Digite seu nome (Ex: Rodney, Lucas)..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-black/40 border-2 border-white/10 focus:border-brand-primary/80 rounded-2xl pl-12 pr-6 py-4.5 text-base text-white font-bold tracking-wide outline-none transition-all placeholder:text-slate-600"
                  />
                </div>

                {/* Autocomplete suggestions */}
                <AnimatePresence>
                  {searchTerm.trim().length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="bg-zinc-900 border border-white/10 rounded-2xl overflow-hidden divide-y divide-white/5"
                    >
                      {filteredPlayers.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-500 italic">
                          Nenhum jogador encontrado com "{searchTerm}".
                          <button 
                            onClick={async () => {
                              // TODO: Logic to add new player
                              setErrorMsg('Opção para adicionar novo jogador ainda sendo implementada.');
                            }}
                            className="block w-full mt-2 text-brand-primary font-bold"
                          >
                            Adicionar "{searchTerm}" à lista
                          </button>
                        </div>
                      ) : (
                        filteredPlayers.map((player) => {
                          const hasResponded = intentions.responses[player.id];
                          return (
                            <button
                              key={player.id}
                              onClick={() => handleSelectPlayer(player)}
                              className="w-full p-4 text-left flex items-center justify-between hover:bg-brand-primary/10 transition-colors group"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-center text-brand-primary font-black text-xs uppercase">
                                  {player.name[0]}
                                </div>
                                <span className="font-bold text-base group-hover:text-brand-primary transition-colors">
                                  {capitalizeName(player.name)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {hasResponded === 'GOING' ? (
                                  <span className="text-[9px] font-black uppercase text-brand-primary bg-brand-primary/10 px-2.5 py-1 rounded-full border border-brand-primary/20">Vou</span>
                                ) : hasResponded === 'NOT_GOING' ? (
                                  <span className="text-[9px] font-black uppercase text-red-500 bg-red-500/10 px-2.5 py-1 rounded-full border border-red-500/20">Ausente</span>
                                ) : (
                                  <span className="text-[9px] font-black uppercase text-slate-400 bg-white/5 px-2.5 py-1 rounded-full border border-white/5">Pendente</span>
                                )}
                                <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-brand-primary group-hover:translate-x-1 transition-all" />
                              </div>
                            </button>
                          );
                        })
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Interactive guide */}
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 mt-4 space-y-2">
                  <div className="flex items-start gap-2.5">
                    <HelpCircle className="w-4 h-4 text-brand-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[11px] font-bold uppercase text-slate-300">Como funciona?</p>
                      <p className="text-[10px] text-slate-400 leading-normal">
                        Você seleciona seu nome, responde se vai ou não, e a lista atualiza instantaneamente na tela do organizador e no placar geral do vôlei. Nenhuma senha longa ou cadastro é exigido.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Step 2: Selected Player Response Panel */
              <div className="space-y-6">
                
                {/* Back button */}
                <button
                  type="button"
                  onClick={() => setSelectedPlayer(null)}
                  className="flex items-center gap-1.5 text-xs font-black text-slate-400 hover:text-brand-primary transition-colors uppercase tracking-wider"
                >
                  <ChevronLeft className="w-4 h-4" /> Alterar Atleta
                </button>

                {/* Player Header */}
                <div className="p-5 bg-brand-primary/5 rounded-[2rem] border border-brand-primary/30 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-brand-primary text-black font-black text-lg uppercase flex items-center justify-center shadow-lg shadow-brand-primary/10">
                    {selectedPlayer.name[0]}
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-brand-primary">Atleta Selecionado</p>
                    <h3 className="text-xl font-black text-white capitalize leading-none tracking-tight">
                      {capitalizeName(selectedPlayer.name)}
                    </h3>
                  </div>
                </div>

                {/* Success animation overlay */}
                {successState.active ? (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="p-10 bg-brand-primary text-black border-4 border-white/20 rounded-[3rem] text-center space-y-6 shadow-[0_0_50px_rgba(245,196,41,0.4)]"
                  >
                    <div className="w-20 h-20 bg-black text-brand-primary rounded-full flex items-center justify-center mx-auto shadow-2xl animate-bounce">
                      <CheckCircle2 className="w-12 h-12" />
                    </div>
                    <div>
                      <h4 className="text-3xl font-black uppercase tracking-tighter leading-none mb-2">Sucesso Total!</h4>
                      <p className="text-sm font-bold uppercase tracking-widest opacity-80 leading-relaxed">
                        Valeu, {selectedPlayer.name.split(' ')[0]}!<br/>
                        Sua resposta foi enviada com sucesso! 🔥🏐
                      </p>
                    </div>
                    <div className="pt-2">
                      <p className="text-[9px] font-black uppercase tracking-widest opacity-60">Voltando para a lista em instantes...</p>
                    </div>
                  </motion.div>
                ) : (
                  /* Action Selection Form */
                  <div className="space-y-6">
                    
                    {/* Submit Buttons */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleResponse('GOING')}
                        className="flex flex-col items-center justify-center gap-1.5 px-6 py-6 bg-brand-primary hover:bg-brand-primary/90 text-black hover:scale-[1.02] active:scale-95 transition-all rounded-3xl font-black uppercase tracking-[0.15em] text-xs shadow-xl shadow-brand-primary/10 border-2 border-black group disabled:opacity-50 disabled:pointer-events-none"
                      >
                        <div className="flex items-center gap-3">
                          {isProcessing ? (
                            <div className="w-6 h-6 border-3 border-black border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <UserCheck className="w-7 h-7 group-hover:scale-110 transition-transform" />
                          )}
                          <span className="text-xl">Vou Jogar!</span>
                        </div>
                        <span className="text-[9px] opacity-60 font-black tracking-widest">Confirmar Presença</span>
                      </button>

                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleResponse('NOT_GOING')}
                        className="flex flex-col items-center justify-center gap-1.5 px-6 py-6 bg-white hover:bg-gray-100 text-black hover:scale-[1.02] active:scale-95 transition-all rounded-3xl font-black uppercase tracking-[0.15em] text-xs shadow-xl shadow-white/5 border-2 border-black group disabled:opacity-50 disabled:pointer-events-none"
                      >
                        <div className="flex items-center gap-3">
                          {isProcessing ? (
                            <div className="w-6 h-6 border-3 border-black border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <UserX className="w-7 h-7 text-red-600 group-hover:scale-110 transition-transform" />
                          )}
                          <span className="text-xl">Não Vou</span>
                        </div>
                        <span className="text-[9px] opacity-60 font-black tracking-widest">Informar Ausência</span>
                      </button>
                    </div>

                    {/* Display Error validations */}
                    {errorMsg && (
                      <div className="flex items-center gap-2 text-red-400 bg-red-400/5 p-4 rounded-xl border border-red-400/20 text-xs font-bold leading-normal">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{errorMsg}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* F1 styled group banner */}
          <div className="bg-gradient-to-r from-brand-primary/15 to-transparent p-6 rounded-[2rem] border border-brand-primary/10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-center sm:text-left space-y-1">
              <span className="text-[9px] font-black uppercase tracking-widest text-brand-primary bg-brand-primary/10 px-2.5 py-1 rounded-full border border-brand-primary/15">Sócio Guerreiro</span>
              <h3 className="text-sm font-black uppercase text-white mt-2">Deseja gerenciar o clube ou ver históricos completo?</h3>
              <p className="text-[11px] text-slate-400 font-medium">Faça o seu login padrão com verificação de e-mail de sócio.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="py-3 px-6 bg-white text-black text-[10px] font-black uppercase tracking-wider rounded-xl hover:bg-slate-100 active:scale-95 transition-all whitespace-nowrap shrink-0 flex items-center justify-center gap-2 shadow-lg"
              >
                <svg className="w-4 h-4 text-black" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Entrar com Google
              </button>
              <button
                type="button"
                onClick={onBackToLogin}
                className="py-3 px-4 bg-white/5 border border-white/10 text-white text-[10px] font-black uppercase tracking-wider rounded-xl hover:bg-white/10 active:scale-95 transition-all text-center whitespace-nowrap shrink-0"
              >
                Voltar
              </button>
            </div>
          </div>

        </section>

        {/* Right Side: LIVE Whiteboard Panel (Quadro Geral de Confirmações) */}
        <section className="lg:col-span-5 space-y-6">
          
          <div className="bg-black border border-white/5 rounded-[2rem] p-6 space-y-6 shadow-2xl flex flex-col max-h-[660px]">
            
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-brand-primary animate-pulse" />
                <h3 className="text-sm font-black text-white uppercase tracking-[0.2em]">Quadro Geral</h3>
              </div>
              <div className="flex items-center gap-1 bg-brand-primary/10 px-2.5 py-1 rounded-full border border-brand-primary/15">
                <span className="text-[10px] font-black text-brand-primary">{goingPlayers.length}</span>
                <span className="text-[9px] font-black text-white/50 uppercase tracking-widest">Confirmados</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
              
              {/* Confirmed list */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-brand-primary uppercase tracking-[0.15em]">Surgiram na Lista ({goingPlayers.length})</span>
                </div>
                
                {goingPlayers.length === 0 ? (
                  <p className="text-xs text-slate-600 italic py-2">Ninguém confirmado na lista até o momento.</p>
                ) : (
                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                    {goingPlayers.map((player, idx) => {
                      const isSetter = player.isOfficialSetter;
                      return (
                        <div key={player.id} className="flex items-center justify-between bg-brand-primary/5 border border-brand-primary/15 px-4 py-2.5 rounded-xl text-xs">
                          <span className="font-bold text-slate-300 flex items-center gap-1.5 capitalize">
                            <span className="text-brand-primary text-[10px] font-black">{idx + 1}.</span>
                            {capitalizeName(player.name)}
                          </span>
                          {isSetter ? (
                            <span className="text-[8px] font-black uppercase text-black bg-brand-primary px-2 py-0.5 rounded-md tracking-wider">Levantador</span>
                          ) : (
                            <span className="text-[8px] font-black uppercase text-brand-primary bg-brand-primary/5 px-2 py-0.5 rounded-md tracking-wider border border-brand-primary/15">Atleta</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Absent list */}
              {absentPlayers.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-white/5">
                  <span className="text-[10px] font-black text-red-400 uppercase tracking-[0.15em]">Ausências Registradas ({absentPlayers.length})</span>
                  <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                    {absentPlayers.map((player, idx) => (
                      <div key={player.id} className="flex items-center justify-between bg-white/5 opacity-55 px-4 py-2 rounded-xl text-xs">
                        <span className="font-bold text-slate-400 capitalize line-through">
                          {idx + 1}. {capitalizeName(player.name)}
                        </span>
                        <span className="text-[8px] font-black uppercase text-red-500 bg-red-500/10 px-2 py-0.5 rounded-md tracking-wider border border-red-500/15">Ausente</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Live metrics indicator details */}
              <div className="bg-zinc-950 p-4 rounded-xl border border-white/5 text-center flex items-center justify-around">
                <div>
                  <h5 className="text-lg font-black text-white">{goingPlayers.length}</h5>
                  <p className="text-[8px] font-black uppercase text-slate-500 tracking-wider">Vão</p>
                </div>
                <div className="w-px h-8 bg-white/10" />
                <div>
                  <h5 className="text-lg font-black text-rose-500">{absentPlayers.length}</h5>
                  <p className="text-[8px] font-black uppercase text-slate-500 tracking-wider">Ausências</p>
                </div>
                <div className="w-px h-8 bg-white/10" />
                <div>
                  <h5 className="text-lg font-black text-amber-500">{undecidedCount}</h5>
                  <p className="text-[8px] font-black uppercase text-slate-500 tracking-wider">Aguardando</p>
                </div>
              </div>

            </div>
          </div>
          
        </section>
        
      </div>

      <footer className="mt-12 text-center text-slate-600 text-[10px] font-sans font-black uppercase tracking-[0.2em] relative z-10 py-6">
        Guerreiros Volleyball Club • Sistema de Quadra Inteligente
      </footer>
    </div>
  );
};
