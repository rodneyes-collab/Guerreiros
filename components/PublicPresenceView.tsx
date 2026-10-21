import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PremiumFeedback } from './PremiumFeedback';
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
  Users,
  Fingerprint,
  Clock
} from 'lucide-react';

import { useStore } from '../store';
import { useIntentions } from '../src/hooks/useIntentions';
import { useBirthdays } from '../src/hooks/useBirthdays';
import { Logo } from '../src/components/Logo';
import { capitalizeName } from '../utils/helpers';
import { monthFormatterPtBR } from '../src/utils/dateUtils';

import { playFeedbackSound, triggerHaptic } from '../src/utils/feedback';
import { getPriorityQueue } from '../utils/teamLogic';
import { Flame, Star, ArrowRight } from 'lucide-react';

interface PublicPresenceViewProps {
  onBackToLogin: () => void;
  handleGoogleLogin: () => void;
}

export const PublicPresenceView: React.FC<PublicPresenceViewProps> = ({ onBackToLogin, handleGoogleLogin }) => {
  const players = useStore(state => state.players);
  const attendance = useStore(state => state.attendance);
  const { intentions, isLoaded, setIntent, resetIntent } = useIntentions();
  const { monthBirthdays, getBirthdaysByMonth } = useBirthdays(players);
  const [selectedMonth, setSelectedMonth] = useState<number>(0);

  useEffect(() => {
    if (monthBirthdays.month && selectedMonth === 0) {
      setSelectedMonth(monthBirthdays.month);
    }
  }, [monthBirthdays.month, selectedMonth]);

  const activeMonthBirthdays = useMemo(() => {
    const m = selectedMonth || monthBirthdays.month;
    return getBirthdaysByMonth(m);
  }, [selectedMonth, monthBirthdays.month, getBirthdaysByMonth]);

  // States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successState, setSuccessState] = useState<{ active: boolean; type: 'GOING' | 'NOT_GOING' | null }>({
    active: false,
    type: null
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasAutoCheckedIn, setHasAutoCheckedIn] = useState(false);
  const [isAlreadyConfirmed, setIsAlreadyConfirmed] = useState(false);
  const [urlPlayerId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('playerId') || params.get('player_id') || params.get('pid');
  });
  const [isQrSource] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const hasSource = params.get('source') === 'qr' || params.get('source') === 'nfc';
    const hasPlayerId = !!(params.get('playerId') || params.get('player_id') || params.get('pid'));
    return hasSource || hasPlayerId;
  });

  // Filter active and eligible players
  const eligiblePlayers = useMemo(() => {
    return players.filter(p => (!p.status || p.status === 'active' || p.status === 'guest') && !p.isDM);
  }, [players]);

  // Find players matching search term
  const filteredPlayers = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const norm = (str: string) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const term = norm(searchTerm);
    return eligiblePlayers.filter(p => 
      norm(p.name).includes(term) || (p.email && norm(p.email).includes(term))
    ).slice(0, 8);
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

  const formatConfirmationTime = (timestamp?: number | null) => {
    if (!timestamp || isNaN(timestamp) || timestamp <= 0) return null;
    const date = new Date(timestamp);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const weekDay = weekdays[date.getDay()];
    return `${weekDay}, ${day}/${month} às ${hours}:${minutes}`;
  };

  const handleSelectPlayer = (player: any) => {
    // Store for next time
    localStorage.setItem('guerreiros_player_id', player.id);
    
    setSelectedPlayer(player);
    setSearchTerm('');
    setErrorMsg('');
    setSuccessState({ active: false, type: null });
    
    // Check if already confirmed
    const alreadyGoing = intentions.responses[player.id] === 'GOING';
    setIsAlreadyConfirmed(alreadyGoing);
  };

  // Calculate priority position for the "Welcome" message
  const playerPriorityPosition = useMemo(() => {
    if (!selectedPlayer) return null;
    
    // Simulate current priority queue if they check in
    const activeAttendance = attendance.filter(p => p.status !== 'left' && !p.isDM);
    const isAlreadyIn = activeAttendance.some(p => p.id === selectedPlayer.id);
    
    let simulatedAttendance = activeAttendance;
    if (!isAlreadyIn) {
      simulatedAttendance = [...activeAttendance, { ...selectedPlayer, status: 'active', timestamp: Date.now() }];
    }
    
    const { topPlayers } = getPriorityQueue(simulatedAttendance, 12, 2);
    const index = topPlayers.findIndex(p => p.id === selectedPlayer.id);
    
    return index !== -1 ? index + 1 : null;
  }, [selectedPlayer, attendance]);

  // Handle response with feedback
  const handleResponse = async (status: 'GOING' | 'NOT_GOING') => {
    if (!selectedPlayer) return;

    setIsProcessing(true);
    try {
      await setIntent(selectedPlayer.id, status);
      
      // Sensory Feedback
      triggerHaptic('success');
      playFeedbackSound('success');
      
      setSuccessState({ active: true, type: status });
      setErrorMsg('');
      
      // Auto-dismiss success screen and reset selection after 5 seconds
      setTimeout(() => {
        setSuccessState({ active: false, type: null });
        setSelectedPlayer(null);
      }, 5500);
    } catch (e: any) {
      triggerHaptic('error');
      playFeedbackSound('error');
      setErrorMsg('Falha ao registrar presença. Tente novamente: ' + (e.message || e));
    } finally {
      setIsProcessing(false);
    }
  };

  // Auto-identify player and Zero-Click check-in
  useEffect(() => {
    let targetPlayerId = urlPlayerId;
    if (targetPlayerId) {
      localStorage.setItem('guerreiros_player_id', targetPlayerId);
    } else {
      targetPlayerId = localStorage.getItem('guerreiros_player_id');
    }

    if (targetPlayerId && eligiblePlayers.length > 0) {
      const player = eligiblePlayers.find(p => p.id === targetPlayerId);
      if (player) {
        setSelectedPlayer(player);
        
        // Check if already confirmed
        const alreadyGoing = intentions.responses[player.id] === 'GOING';
        setIsAlreadyConfirmed(alreadyGoing);
        
        // Zero-Click check-in logic: If coming from QR/NFC and not already auto-checked in this session
        if (isQrSource && !hasAutoCheckedIn && !successState.active) {
          if (!alreadyGoing) {
            setHasAutoCheckedIn(true);
            // Delay slightly for visual effect
            setTimeout(() => {
              handleResponse('GOING');
            }, 800);
          } else {
            // Already checked in, show premium feedback and auto-dismiss after 5.5 seconds to acknowledge the scan
            setHasAutoCheckedIn(true);
            setSuccessState({ active: true, type: 'GOING' });
            setTimeout(() => {
              setSuccessState({ active: false, type: null });
              setSelectedPlayer(null);
            }, 5500);
          }
        }
      }
    }
  }, [eligiblePlayers, isQrSource, urlPlayerId, intentions.responses]);

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
          <div className="flex items-center justify-center gap-2">
            {isQrSource && (
              <span className="flex items-center gap-1 bg-brand-primary text-black text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest animate-pulse">
                <Smartphone className="w-3 h-3" /> Presencial
              </span>
            )}
            <p className="text-[10px] sm:text-xs text-brand-primary/80 font-black uppercase tracking-[0.25em]">
              Lista de Presença Rápida • {formattedTargetDate || 'Quinta-feira'}
            </p>
          </div>
        </div>
      </header>

      {/* Monthly Birthdays Celebration Card (Public View) */}
      <div className="max-w-6xl w-full mx-auto mb-8 bg-zinc-900 border-2 border-brand-primary/20 rounded-[2.5rem] p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-8">

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center">
              <Flame className="w-7 h-7 text-amber-500 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-black text-white uppercase tracking-[0.2em]">
                Aniversariantes
              </h3>
              <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Celebrando os Guerreiros</p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-none min-w-[160px]">
              <select 
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-white text-xs font-black uppercase tracking-widest focus:border-brand-primary outline-none transition-all appearance-none cursor-pointer"
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {monthFormatterPtBR.format(new Date(2024, i))}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/40">
                <ArrowRight className="w-3 h-3 rotate-90" />
              </div>
            </div>
            
            <div className="hidden lg:flex items-center gap-2 px-3 py-2 bg-white/5 rounded-xl border border-white/10">
              <Star className="w-3 h-3 text-amber-500" />
              <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">
                {activeMonthBirthdays.length} Sócios
              </span>
            </div>
          </div>
        </div>

        {activeMonthBirthdays.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
            {activeMonthBirthdays.map(player => (
              <div 
                key={player.id} 
                className="group relative bg-black/40 border border-white/5 rounded-[2rem] p-4 flex flex-col items-center text-center transition-all hover:border-amber-500/30 hover:bg-amber-500/[0.02]"
              >
                {/* Date Badge */}
                <div className="absolute -top-2 -right-1 z-10 bg-amber-500 text-black px-2.5 py-1 rounded-xl text-[10px] font-black shadow-lg transform rotate-3 group-hover:rotate-0 transition-transform">
                  {new Date(player.birthDate!).getUTCDate()} / {String(selectedMonth).padStart(2, '0')}
                </div>

                <div className="relative mb-3 flex justify-center">
                  {/* Using a simple circle if PlayerAvatar is not imported correctly or to be fast */}
                  <div className="w-16 h-16 rounded-full bg-brand-primary/10 border-2 border-amber-500/20 flex items-center justify-center text-amber-500 font-black text-xl uppercase overflow-hidden">
                    {player.photoUrl ? (
                      <img src={player.photoUrl} alt={player.name} className="w-full h-full object-cover" />
                    ) : (
                      player.name[0]
                    )}
                  </div>
                  <div className="absolute -bottom-1 -right-1 bg-black rounded-full p-1.5 shadow-xl">
                    <div className="w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center text-[10px] text-black">
                      🎂
                    </div>
                  </div>
                </div>

                <span className="text-xs font-black text-white uppercase tracking-tight line-clamp-1 group-hover:text-amber-500 transition-colors">
                  {player.name.split(' ')[0]}
                </span>
                <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest mt-1">
                  Guerreiro
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 flex flex-col items-center justify-center bg-black/20 rounded-3xl border border-dashed border-white/5">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
              <UserX className="w-8 h-8 text-white/20" />
            </div>
            <p className="text-xs font-black text-white/30 uppercase tracking-widest">Nenhum aniversariante neste mês</p>
          </div>
        )}
      </div>


      {isQrSource && !selectedPlayer && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-xl mx-auto mb-8 bg-brand-primary/10 border border-brand-primary/30 p-4 rounded-2xl flex items-center gap-4 text-center sm:text-left"
        >
          <div className="hidden sm:flex w-12 h-12 bg-brand-primary rounded-xl items-center justify-center text-black shrink-0 shadow-lg shadow-brand-primary/20">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xs font-black text-white uppercase tracking-widest">Seja bem-vindo à quadra!</h3>
            <p className="text-[10px] text-white/60 font-medium">Selecione seu nome abaixo uma única vez para identificarmos seu dispositivo nos próximos jogos.</p>
          </div>
        </motion.div>
      )}

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
                <div className="p-6 bg-brand-primary/10 rounded-[2.5rem] border-2 border-brand-primary shadow-2xl shadow-brand-primary/10 flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/10 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-brand-primary/20 transition-all duration-700"></div>
                  
                  <div className="w-20 h-20 rounded-3xl bg-brand-primary text-brand-secondary font-black text-3xl uppercase flex items-center justify-center shadow-2xl shadow-brand-primary/30 transform -rotate-3 group-hover:rotate-0 transition-transform duration-500 border-4 border-black/20">
                    {selectedPlayer.name[0]}
                  </div>
                  <div className="space-y-2 relative z-10">
                    <div className="flex items-center justify-center sm:justify-start gap-2">
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-primary">Atleta Identificado</p>
                      {localStorage.getItem('guerreiros_player_id') === selectedPlayer.id && (
                        <span className="flex items-center gap-1 text-[8px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-400/10 px-2 py-0.5 rounded-full border border-emerald-400/20">
                          <Fingerprint className="w-3 h-3" /> Conectado
                        </span>
                      )}
                    </div>
                    <h3 className="text-3xl sm:text-4xl font-black text-white capitalize leading-none tracking-tighter italic">
                      {capitalizeName(selectedPlayer.name)}
                    </h3>
                  </div>
                </div>

                {/* QR Source Greeting */}
                {isQrSource && !successState.active && (
                  <motion.p 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center text-xs font-black text-brand-primary uppercase tracking-[0.2em] animate-pulse"
                  >
                    Confirmar presença no ginásio agora? 🏐🔥
                  </motion.p>
                )}

                {/* Success animation overlay */}
                <PremiumFeedback 
                  isOpen={successState.active}
                  playerName={selectedPlayer.name}
                  queuePosition={playerPriorityPosition}
                  isAlreadyConfirmed={isAlreadyConfirmed}
                  onClose={() => {
                    setSuccessState({ active: false, type: null });
                    setSelectedPlayer(null);
                  }}
                />

                {!successState.active && (
                  /* Action Selection Form */
                  <div className="space-y-6">
                    
                    {isAlreadyConfirmed ? (
                      /* Context-aware panel for already confirmed players with Checkout option */
                      <div className="bg-brand-primary/10 border-2 border-brand-primary/40 p-6 rounded-[2rem] space-y-5 text-center shadow-[0_0_30px_rgba(212,175,55,0.05)] relative overflow-hidden">
                        <div className="w-12 h-12 bg-brand-primary/20 rounded-full flex items-center justify-center mx-auto border border-brand-primary/40">
                          <CheckCircle2 className="w-6 h-6 text-brand-primary" />
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-xl font-black uppercase italic tracking-tight text-brand-primary">Você já está confirmado!</h4>
                          <p className="text-xs text-slate-300 leading-relaxed font-bold">
                            Sua vaga para este jogo está garantida no sistema do Guerreiros.
                          </p>
                          {playerPriorityPosition !== null && (
                            <p className="text-xs text-slate-400 font-black uppercase tracking-wider mt-2">
                              Sua posição na fila de rodagem: <span className="text-brand-primary text-base">#{playerPriorityPosition}</span>
                            </p>
                          )}
                        </div>

                        <div className="pt-4 border-t border-white/5 flex flex-col gap-2">
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => {
                              setIsAlreadyConfirmed(false); // allow them to change or see other options manually
                            }}
                            className="w-full py-3 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                          >
                            Mudar Opção ou Ver Botões
                          </button>

                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={async () => {
                              setIsProcessing(true);
                              try {
                                await handleResponse('NOT_GOING');
                              } catch (err: any) {
                                setErrorMsg('Falha ao retirar presença: ' + (err.message || err));
                              } finally {
                                setIsProcessing(false);
                              }
                            }}
                            className="w-full py-4 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/30 hover:border-red-500/50 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                          >
                            <UserX className="w-4 h-4 shrink-0" />
                            Sair Mais Cedo (Retirar Presença)
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Submit Buttons */
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
                    )}

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
                      const timeStr = formatConfirmationTime(intentions.confirmationTimestamps?.[player.id]);
                      return (
                        <div key={player.id} className="flex items-center justify-between bg-brand-primary/5 border border-brand-primary/15 px-4 py-2.5 rounded-xl text-xs gap-2">
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold text-slate-300 flex items-center gap-1.5 capitalize truncate">
                              <span className="text-brand-primary text-[10px] font-black">{idx + 1}.</span>
                              {capitalizeName(player.name)}
                            </span>
                            {timeStr && (
                              <span className="flex items-center gap-1 text-[9.5px] font-mono text-zinc-400 mt-0.5 ml-4">
                                <Clock className="w-2.5 h-2.5 text-brand-primary shrink-0" />
                                <span>{timeStr}</span>
                              </span>
                            )}
                          </div>
                          {isSetter ? (
                            <span className="text-[8px] font-black uppercase text-black bg-brand-primary px-2 py-0.5 rounded-md tracking-wider shrink-0">Levantador</span>
                          ) : (
                            <span className="text-[8px] font-black uppercase text-brand-primary bg-brand-primary/5 px-2 py-0.5 rounded-md tracking-wider border border-brand-primary/15 shrink-0">Atleta</span>
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
