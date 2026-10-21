import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Database, RefreshCw, X, AlertTriangle, CheckCircle2, ShieldCheck, HardDrive, Trash2, Calendar, Users, Clock } from 'lucide-react';
import { useStore } from '../../store';
import { db, collection, getDocs, doc, deleteDoc } from '../../firebase';
import { Match, Player } from '../../types';
import { brazilDateFormatter } from '../../utils/dateCache';

export const SyncDebuggerModal: React.FC = () => {
  const isOpen = useStore(state => state.isSyncDebuggerOpen);
  const setIsOpen = useStore(state => state.setIsSyncDebuggerOpen);
  const storeMatches = useStore(state => state.matches);
  const players = useStore(state => state.players);
  const showNotification = useStore(state => state.showNotification);
  const setMatches = useStore(state => state.setMatches);

  const [loading, setLoading] = useState(false);
  const [firestoreMatches, setFirestoreMatches] = useState<Match[]>([]);
  const [lastAudited, setLastAudited] = useState<string | null>(null);
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('ALL');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchFirestoreMatches = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'matches'));
      const list: Match[] = [];
      snap.forEach(d => {
        const data = d.data();
        list.push({ ...data, id: d.id } as Match);
      });
      // Sort chronologically by timestamp
      list.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      setFirestoreMatches(list);
      setLastAudited(new Date().toLocaleTimeString('pt-BR'));
    } catch (err) {
      console.error('Error fetching matches for sync debugger:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchFirestoreMatches();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const getPlayerName = (id: string) => {
    const p = players.find(item => item.id === id);
    return p ? p.name : id.slice(0, 6);
  };

  const getDateKey = (m: Match) => {
    if (m.date) return m.date;
    if (m.timestamp) {
      return brazilDateFormatter.format(new Date(m.timestamp));
    }
    return 'UNKNOWN';
  };

  const handleDeleteMatch = async (matchId: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir permanentemente a partida ${matchId}?`)) return;
    setDeletingId(matchId);
    try {
      await deleteDoc(doc(db, 'matches', matchId));
      const updatedFs = firestoreMatches.filter(m => m.id !== matchId);
      setFirestoreMatches(updatedFs);
      setMatches(updatedFs.map(m => ({ ...m })));
      showNotification('Partida excluída com sucesso da auditoria.', 'success');
    } catch (err) {
      console.error('Error deleting match:', err);
      showNotification('Erro ao excluir partida.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteReconstructed = async () => {
    const reconstructed = firestoreMatches.filter(m => m.id.startsWith('reconstructed-'));
    if (reconstructed.length === 0) {
      showNotification('Nenhuma partida reconstruída encontrada para remover.', 'info');
      return;
    }
    if (!window.confirm(`ATENÇÃO: Deseja remover todas as ${reconstructed.length} partidas reconstruídas/simuladas do dia 03/09 e anteriores? Esta ação é irreversível.`)) return;
    
    setLoading(true);
    try {
      for (const m of reconstructed) {
        await deleteDoc(doc(db, 'matches', m.id));
      }
      const updatedFs = firestoreMatches.filter(m => !m.id.startsWith('reconstructed-'));
      setFirestoreMatches(updatedFs);
      setMatches(updatedFs.map(m => ({ ...m })));
      showNotification(`${reconstructed.length} partidas reconstruídas foram removidas com sucesso.`, 'success');
    } catch (err) {
      console.error('Error batch deleting reconstructed matches:', err);
      showNotification('Erro ao remover partidas simuladas.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fsByDate: Record<string, Match[]> = {};
  firestoreMatches.forEach(m => {
    const dKey = getDateKey(m);
    if (!fsByDate[dKey]) fsByDate[dKey] = [];
    fsByDate[dKey].push(m);
  });

  const allDates = Array.from(new Set([...Object.keys(fsByDate)])).sort().reverse();
  const filteredMatches = selectedDateFilter === 'ALL' 
    ? firestoreMatches 
    : (fsByDate[selectedDateFilter] || []);

  const reconstructedCount = firestoreMatches.filter(m => m.id.startsWith('reconstructed-')).length;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-6xl max-h-[92vh] flex flex-col bg-zinc-900/98 border border-white/15 rounded-2xl shadow-2xl overflow-hidden text-white"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/60">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[#F5C429]">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-black uppercase tracking-wide text-white">Auditoria Administrativa & Debugger de Partidas</h2>
                <p className="text-xs text-zinc-400">Verificação de dados reais, detecção de simulações e limpeza de registros corrompidos</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {reconstructedCount > 0 && (
                <button
                  onClick={handleDeleteReconstructed}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-bold transition-all border border-rose-500/30"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remover {reconstructedCount} Partidas Reconstruídas (Simuladas)
                </button>
              )}
              <button
                onClick={fetchFirestoreMatches}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-zinc-200 transition-all border border-white/10 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#F5C429]' : ''}`} />
                Atualizar Dados
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Overview Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-black/50 border border-white/10">
                <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                  <span>Total no Firestore</span>
                  <HardDrive className="w-4 h-4 text-blue-400" />
                </div>
                <div className="text-2xl font-black text-white">{firestoreMatches.length} <span className="text-xs font-normal text-zinc-400">partidas</span></div>
              </div>
              <div className="p-4 rounded-xl bg-black/50 border border-white/10">
                <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                  <span>Partidas Reconstruídas</span>
                  <AlertTriangle className={`w-4 h-4 ${reconstructedCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`} />
                </div>
                <div className={`text-2xl font-black ${reconstructedCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {reconstructedCount} <span className="text-xs font-normal text-zinc-400">suspeitas</span>
                </div>
              </div>
              <div className="p-4 rounded-xl bg-black/50 border border-white/10">
                <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                  <span>Store Local (Zustand)</span>
                  <Database className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-black text-white">{storeMatches.length} <span className="text-xs font-normal text-zinc-400">partidas</span></div>
              </div>
              <div className="p-4 rounded-xl bg-black/50 border border-white/10">
                <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                  <span>Status da Auditoria</span>
                  <ShieldCheck className="w-4 h-4 text-[#F5C429]" />
                </div>
                <div className="text-sm font-bold text-emerald-400 flex items-center gap-1.5 mt-1">
                  <CheckCircle2 className="w-4 h-4" />
                  {lastAudited ? `Auditado às ${lastAudited}` : 'Pronto'}
                </div>
              </div>
            </div>

            {/* Date Filter Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-white/10">
              <button
                onClick={() => setSelectedDateFilter('ALL')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                  selectedDateFilter === 'ALL'
                    ? 'bg-[#F5C429] text-black'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                Todas as Datas ({firestoreMatches.length})
              </button>
              {allDates.map(dateKey => {
                const count = fsByDate[dateKey]?.length || 0;
                const hasReconstructed = fsByDate[dateKey]?.some(m => m.id.startsWith('reconstructed-'));
                return (
                  <button
                    key={dateKey}
                    onClick={() => setSelectedDateFilter(dateKey)}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                      selectedDateFilter === dateKey
                        ? 'bg-[#F5C429] text-black'
                        : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    {dateKey} ({count})
                    {hasReconstructed && <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" title="Contém partidas reconstruídas"></span>}
                  </button>
                );
              })}
            </div>

            {/* Matches Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black uppercase tracking-wider text-zinc-300">
                  {selectedDateFilter === 'ALL' ? 'Histórico Bruto de Partidas' : `Partidas do dia ${selectedDateFilter}`} ({filteredMatches.length})
                </h3>
                <span className="text-xs text-zinc-400">Exibindo cronologicamente por timestamp</span>
              </div>

              <div className="border border-white/10 rounded-xl overflow-hidden bg-black/40">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/5 text-[11px] font-black uppercase text-zinc-400 tracking-wider">
                      <th className="p-3.5">ID / Nº</th>
                      <th className="p-3.5">Data / Hora</th>
                      <th className="p-3.5 text-center">Placar</th>
                      <th className="p-3.5">Time A vs Time B</th>
                      <th className="p-3.5 text-center">Status / Tipo</th>
                      <th className="p-3.5 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-xs">
                    {filteredMatches.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-zinc-500">
                          Nenhuma partida encontrada para este filtro.
                        </td>
                      </tr>
                    ) : (
                      filteredMatches.map(m => {
                        const isReconstructed = m.id.startsWith('reconstructed-');
                        const timeStr = m.timestamp ? new Date(m.timestamp).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }) : 'N/A';
                        return (
                          <tr key={m.id} className={`hover:bg-white/5 transition-colors ${isReconstructed ? 'bg-rose-500/5' : ''}`}>
                            <td className="p-3.5 font-mono font-bold text-zinc-300">
                              <div>#{m.dailyNumber || '?'}</div>
                              <div className="text-[10px] text-zinc-500 font-normal truncate max-w-[120px]">{m.id}</div>
                            </td>
                            <td className="p-3.5">
                              <div className="font-bold text-zinc-200">{m.date || getDateKey(m)}</div>
                              <div className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5">
                                <Clock className="w-3 h-3 text-zinc-500" /> {timeStr} ({Math.round((m.duration || 600) / 60)} min)
                              </div>
                            </td>
                            <td className="p-3.5 text-center">
                              <span className={`px-2.5 py-1 rounded-md font-black text-sm ${m.winner === 'A' ? 'bg-[#F5C429] text-black' : 'bg-white/10 text-white'}`}>
                                {m.scoreA}
                              </span>
                              <span className="mx-1 text-zinc-500">x</span>
                              <span className={`px-2.5 py-1 rounded-md font-black text-sm ${m.winner === 'B' ? 'bg-[#F5C429] text-black' : 'bg-white/10 text-white'}`}>
                                {m.scoreB}
                              </span>
                            </td>
                            <td className="p-3.5 max-w-xs">
                              <div className="space-y-1">
                                <div className="text-xs truncate text-zinc-300">
                                  <span className="font-bold text-[#F5C429]">A:</span> {m.teamA?.map(id => getPlayerName(id)).join(', ') || 'N/A'}
                                </div>
                                <div className="text-xs truncate text-zinc-300">
                                  <span className="font-bold text-cyan-400">B:</span> {m.teamB?.map(id => getPlayerName(id)).join(', ') || 'N/A'}
                                </div>
                              </div>
                            </td>
                            <td className="p-3.5 text-center">
                              {isReconstructed ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                  <AlertTriangle className="w-3 h-3" /> Reconstruída (Suspeita)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  <CheckCircle2 className="w-3 h-3" /> Real / Oficial
                                </span>
                              )}
                            </td>
                            <td className="p-3.5 text-right">
                              <button
                                onClick={() => handleDeleteMatch(m.id)}
                                disabled={deletingId === m.id}
                                className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors border border-rose-500/20 disabled:opacity-50"
                                title="Excluir partida corrompida"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-white/10 bg-black/60 flex items-center justify-between text-xs text-zinc-400">
            <span>Regra de Ouro: Nunca utilize dados simulados. Remova registros gerados artificialmente para garantir a integridade dos rankings.</span>
            <button
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 rounded-xl bg-white text-black font-black hover:bg-zinc-200 transition-colors uppercase tracking-wider text-xs"
            >
              Fechar
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
