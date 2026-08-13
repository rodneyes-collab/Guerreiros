import React, { useState, useEffect } from 'react';
import { 
  Bot, 
  ShieldCheck, 
  AlertTriangle, 
  Zap, 
  Users, 
  Trophy, 
  Check, 
  Activity, 
  ArrowRight, 
  RefreshCw,
  FileText,
  Clock,
  Calendar,
  Sliders,
  Power
} from 'lucide-react';
import { Player, DbAnomalyItem, DbAutoCorrectionSummary } from '../types';
import { scanDatabaseAnomalies, executeDbAutoCorrection } from '../services/dbAutoCorrectionAgent';
import { db, collection, getDocs, query, orderBy, limit, doc, getDoc, setDoc } from '../firebase';

interface DbAutoCorrectionPanelProps {
  players: Player[];
  matches: any[];
  systemMetadata: any;
  showNotification: (msg: string, type: 'success' | 'error' | 'info') => void;
  onDataCorrected?: () => void;
}

export const DbAutoCorrectionPanel: React.FC<DbAutoCorrectionPanelProps> = ({
  players,
  matches,
  systemMetadata,
  showNotification,
  onDataCorrected
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [detectedAnomalies, setDetectedAnomalies] = useState<DbAnomalyItem[] | null>(null);
  const [lastCorrectionSummary, setLastCorrectionSummary] = useState<DbAutoCorrectionSummary | null>(null);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Autonomous Settings state
  const [autoSettings, setAutoSettings] = useState({
    enabled: true,
    frequency: 'DAILY' as 'DAILY' | 'WEEKLY',
    autoFix: true,
    notifyAdmin: true
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [lastRunInfo, setLastRunInfo] = useState<any>(null);

  // Load autonomous config and history logs
  const fetchSettingsAndHistory = async () => {
    try {
      setLoadingHistory(true);
      
      // Load config
      const configRef = doc(db, 'system_config', 'autocorrect_settings');
      const configSnap = await getDoc(configRef);
      if (configSnap.exists()) {
        setAutoSettings(configSnap.data() as any);
      }

      // Load last run info
      const maintenanceRef = doc(db, 'metadata', 'last_autocorrect_maintenance');
      const lastRunSnap = await getDoc(maintenanceRef);
      if (lastRunSnap.exists()) {
        setLastRunInfo(lastRunSnap.data());
      }

      // Load logs
      const q = query(
        collection(db, 'autocorrect_logs'),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      const snap = await getDocs(q);
      const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setHistoryLogs(logs);
    } catch (err) {
      console.warn('Erro ao carregar configurações/histórico:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchSettingsAndHistory();
  }, []);

  const handleSaveSettings = async (newSettings: typeof autoSettings) => {
    try {
      setSavingSettings(true);
      setAutoSettings(newSettings);
      const configRef = doc(db, 'system_config', 'autocorrect_settings');
      await setDoc(configRef, {
        ...newSettings,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      showNotification(
        `Configuração Autônoma Salva: Agente ${newSettings.enabled ? 'ATIVO (' + (newSettings.frequency === 'DAILY' ? 'Diário' : 'Semanal') + ')' : 'DESATIVADO'}.`,
        'success'
      );
    } catch (err) {
      console.error('Erro ao salvar configuração autônoma:', err);
      showNotification('Falha ao salvar configurações do Agente.', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleRunScan = () => {
    setIsScanning(true);
    setTimeout(() => {
      try {
        const found = scanDatabaseAnomalies(players, matches, systemMetadata);
        setDetectedAnomalies(found);
        if (found.length === 0) {
          showNotification('✨ Agente de IA: Nenhuma anomalia ou duplicata encontrada! O banco está limpo.', 'success');
        } else {
          showNotification(`⚠️ Agente de IA: ${found.length} inconsistência(s) encontrada(s) no banco de dados.`, 'info');
        }
      } catch (err: any) {
        console.error('Erro na varredura de autocorreção:', err);
        showNotification('Falha ao varrer o banco de dados.', 'error');
      } finally {
        setIsScanning(false);
      }
    }, 600);
  };

  const handleExecuteFix = async () => {
    if (!detectedAnomalies || detectedAnomalies.length === 0) {
      showNotification('Execute a varredura primeiro para identificar o que corrigir.', 'info');
      return;
    }

    try {
      setIsFixing(true);
      showNotification('Iniciando Autocorreção Inteligente de Dados...', 'info');

      const summary = await executeDbAutoCorrection(db, detectedAnomalies, players, matches);
      setLastCorrectionSummary(summary);
      setDetectedAnomalies([]);

      showNotification(
        `Autocorreção Concluída: ${summary.duplicatePlayersMerged} duplicatas unificadas e ${summary.matchesRepaired} partidas reparadas.`,
        'success'
      );

      await fetchSettingsAndHistory();

      if (onDataCorrected) {
        onDataCorrected();
      }
    } catch (err: any) {
      console.error('Erro ao executar autocorreção no banco:', err);
      showNotification('Erro ao aplicar autocorreções no Firestore.', 'error');
    } finally {
      setIsFixing(false);
    }
  };

  const duplicateAnomalies = detectedAnomalies?.filter(a => a.type === 'DUPLICATE_PLAYER') || [];
  const matchAnomalies = detectedAnomalies?.filter(a => a.type === 'CORRUPTED_MATCH' || a.type === 'DATE_DISCREPANCY') || [];
  const eloAnomalies = detectedAnomalies?.filter(a => a.type === 'INVALID_ELO') || [];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-black rounded-[2.5rem] border border-brand-primary/30 p-6 sm:p-8 shadow-2xl relative overflow-hidden bg-gradient-to-br from-black via-brand-secondary/40 to-black">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-white/10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-brand-primary text-black rounded-2xl flex items-center justify-center shadow-lg shadow-brand-primary/20 shrink-0">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
                  Agente IA de Autocorreção de Banco de Dados
                </h3>
                <span className="bg-brand-primary/20 text-brand-primary border border-brand-primary/40 text-[9px] px-2.5 py-0.5 rounded-full font-black uppercase">
                  Guerreiros Intelligence
                </span>
              </div>
              <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest mt-1">
                Varredura Autônoma, Unificação de Duplicatas e Reparo de Partidas Corrompidas
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleRunScan}
              disabled={isScanning || isFixing}
              className={`px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 ${
                isScanning 
                  ? 'bg-white/10 text-white/30 cursor-not-allowed' 
                  : 'bg-white/10 hover:bg-white/20 text-white border border-brand-primary/40 active:scale-95'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
              {isScanning ? 'Varrendo...' : 'Varrer Inconsistências'}
            </button>

            {detectedAnomalies && detectedAnomalies.length > 0 && (
              <button
                type="button"
                onClick={handleExecuteFix}
                disabled={isFixing}
                className="px-6 py-3 bg-brand-primary hover:bg-brand-primary/90 text-black font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-brand-primary/20 transition-all flex items-center gap-2 active:scale-95 animate-bounce"
              >
                <Zap className="w-4 h-4" />
                {isFixing ? 'Corrigindo Firestore...' : 'Executar Autocorreção IA'}
              </button>
            )}
          </div>
        </div>

        {/* Database Metric Indicators */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          <div className="bg-white/5 border border-white/5 p-4 rounded-2xl flex items-center justify-between">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Atletas Mapeados</p>
              <p className="text-2xl font-black text-white mt-0.5">{players.length}</p>
            </div>
            <Users className="w-6 h-6 text-brand-primary/60" />
          </div>

          <div className="bg-white/5 border border-white/5 p-4 rounded-2xl flex items-center justify-between">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Partidas Registradas</p>
              <p className="text-2xl font-black text-white mt-0.5">{matches.length}</p>
            </div>
            <Trophy className="w-6 h-6 text-brand-primary/60" />
          </div>

          <div className="bg-white/5 border border-white/5 p-4 rounded-2xl flex items-center justify-between">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Inconsistências Pendentes</p>
              <p className={`text-2xl font-black mt-0.5 ${detectedAnomalies && detectedAnomalies.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {detectedAnomalies !== null ? detectedAnomalies.length : '?'}
              </p>
            </div>
            <Activity className="w-6 h-6 text-brand-primary/60" />
          </div>
        </div>
      </div>

      {/* Autonomous Schedule Configuration Panel */}
      <div className="bg-black border border-brand-primary/30 rounded-3xl p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <Sliders className="w-5 h-5 text-brand-primary" />
            <div>
              <h4 className="text-sm font-black text-white uppercase tracking-wider">
                Configuração da Autonomia do Agente de IA
              </h4>
              <p className="text-[10px] text-white/50 uppercase tracking-widest mt-0.5">
                Defina a frequência de execução autônoma no plano de fundo
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full border ${autoSettings.enabled ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-white/10 text-white/40 border-white/20'}`}>
              {autoSettings.enabled ? '🟢 Agente Autônomo Ativo' : '🔴 Autonomia Desativada'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Option 1: Toggle Autonomous Agent */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-white uppercase tracking-tight flex items-center gap-2">
                <Power className="w-4 h-4 text-brand-primary" />
                Execução Autônoma
              </span>
              <button
                type="button"
                onClick={() => handleSaveSettings({ ...autoSettings, enabled: !autoSettings.enabled })}
                disabled={savingSettings}
                className={`w-12 h-6 rounded-full p-1 transition-colors ${autoSettings.enabled ? 'bg-brand-primary' : 'bg-white/20'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-black transition-transform ${autoSettings.enabled ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>
            <p className="text-[10px] text-white/50 leading-relaxed">
              Quando ativado, a IA varre e corrige o banco de dados automaticamente sem intervenção humana.
            </p>
          </div>

          {/* Option 2: Schedule Frequency */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
            <span className="text-xs font-black text-white uppercase tracking-tight flex items-center gap-2">
              <Calendar className="w-4 h-4 text-brand-primary" />
              Frequência de Varredura
            </span>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleSaveSettings({ ...autoSettings, frequency: 'DAILY' })}
                disabled={savingSettings || !autoSettings.enabled}
                className={`py-2 text-[10px] font-black uppercase rounded-xl transition-all border ${autoSettings.frequency === 'DAILY' ? 'bg-brand-primary text-black border-brand-primary' : 'bg-white/5 text-white/60 border-white/10'}`}
              >
                Diária (24h)
              </button>
              <button
                type="button"
                onClick={() => handleSaveSettings({ ...autoSettings, frequency: 'WEEKLY' })}
                disabled={savingSettings || !autoSettings.enabled}
                className={`py-2 text-[10px] font-black uppercase rounded-xl transition-all border ${autoSettings.frequency === 'WEEKLY' ? 'bg-brand-primary text-black border-brand-primary' : 'bg-white/5 text-white/60 border-white/10'}`}
              >
                Semanal (7 dias)
              </button>
            </div>
          </div>

          {/* Option 3: Action Mode */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
            <span className="text-xs font-black text-white uppercase tracking-tight flex items-center gap-2">
              <Zap className="w-4 h-4 text-brand-primary" />
              Modo de Correção
            </span>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleSaveSettings({ ...autoSettings, autoFix: true })}
                disabled={savingSettings || !autoSettings.enabled}
                className={`py-2 text-[10px] font-black uppercase rounded-xl transition-all border ${autoSettings.autoFix ? 'bg-brand-primary text-black border-brand-primary' : 'bg-white/5 text-white/60 border-white/10'}`}
              >
                Corrigir Direto
              </button>
              <button
                type="button"
                onClick={() => handleSaveSettings({ ...autoSettings, autoFix: false })}
                disabled={savingSettings || !autoSettings.enabled}
                className={`py-2 text-[10px] font-black uppercase rounded-xl transition-all border {!autoSettings.autoFix ? 'bg-amber-400 text-black border-amber-400' : 'bg-white/5 text-white/60 border-white/10'}`}
              >
                Só Notificar
              </button>
            </div>
          </div>
        </div>

        {/* Schedule Timeline Status */}
        {lastRunInfo && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[10px] text-white/70">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-brand-primary shrink-0" />
              <span>
                Última Execução Autônoma: <strong className="text-white">{lastRunInfo.lastRunDate || 'N/A'}</strong> ({lastRunInfo.status === 'AUTOCORRECTED' ? 'Corrigido' : 'Limpo'})
              </span>
            </div>
            <span className="text-brand-primary font-black uppercase">
              Próxima Janela: {autoSettings.frequency === 'DAILY' ? 'A cada 24 horas' : 'A cada 7 dias'}
            </span>
          </div>
        )}
      </div>

      {/* Results / Detected Anomalies Display */}
      {detectedAnomalies !== null && (
        <div className="space-y-6">
          {detectedAnomalies.length === 0 ? (
            <div className="bg-brand-primary/10 border border-brand-primary/30 rounded-3xl p-8 text-center space-y-3">
              <ShieldCheck className="w-12 h-12 text-brand-primary mx-auto" />
              <h4 className="text-lg font-black text-white uppercase tracking-tight">Banco de Dados 100% Saudável</h4>
              <p className="text-xs text-white/60 max-w-md mx-auto">
                Nenhuma duplicata de jogador, partida corrompida ou anomalia de ELO foi detectada. Todos os dados do Guerreiros Volley Club estão íntegros.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Duplicate Players Section */}
              {duplicateAnomalies.length > 0 && (
                <div className="bg-black border border-amber-500/30 rounded-3xl p-6 space-y-4">
                  <div className="flex items-center gap-2 text-amber-400">
                    <Users className="w-5 h-5" />
                    <h4 className="font-black uppercase tracking-wider text-sm">
                      Atletas Duplicados Identificados ({duplicateAnomalies.length})
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {duplicateAnomalies.map((item) => (
                      <div key={item.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col justify-between space-y-2">
                        <div>
                          <p className="text-xs font-black text-white uppercase tracking-tight">{item.title}</p>
                          <p className="text-[10px] text-white/60 leading-relaxed mt-1">{item.description}</p>
                        </div>
                        <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[9px] font-bold text-amber-300">
                          <span>Ação: {item.suggestedAction}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Corrupted Matches Section */}
              {matchAnomalies.length > 0 && (
                <div className="bg-black border border-rose-500/30 rounded-3xl p-6 space-y-4">
                  <div className="flex items-center gap-2 text-rose-400">
                    <AlertTriangle className="w-5 h-5" />
                    <h4 className="font-black uppercase tracking-wider text-sm">
                      Partidas com Inconsistência de Registro ({matchAnomalies.length})
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {matchAnomalies.map((item) => (
                      <div key={item.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col justify-between space-y-2">
                        <div>
                          <p className="text-xs font-black text-white uppercase tracking-tight">{item.title}</p>
                          <p className="text-[10px] text-white/60 leading-relaxed mt-1">{item.description}</p>
                        </div>
                        <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[9px] font-bold text-rose-300">
                          <span>Ação: {item.suggestedAction}</span>
                          <Check className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ELO Anomalies Section */}
              {eloAnomalies.length > 0 && (
                <div className="bg-black border border-brand-primary/30 rounded-3xl p-6 space-y-4">
                  <div className="flex items-center gap-2 text-brand-primary">
                    <Zap className="w-5 h-5" />
                    <h4 className="font-black uppercase tracking-wider text-sm">
                      Anomalias de ELO & Pontuação ({eloAnomalies.length})
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {eloAnomalies.map((item) => (
                      <div key={item.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col justify-between space-y-2">
                        <div>
                          <p className="text-xs font-black text-white uppercase tracking-tight">{item.title}</p>
                          <p className="text-[10px] text-white/60 leading-relaxed mt-1">{item.description}</p>
                        </div>
                        <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[9px] font-bold text-brand-primary">
                          <span>Ação: {item.suggestedAction}</span>
                          <Check className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Applied Correction Summary */}
      {lastCorrectionSummary && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-3xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500 text-black rounded-xl font-bold">
              <Check className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-black text-white uppercase tracking-wider">
                Relatório da Autocorreção Aplicada
              </h4>
              <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest mt-0.5">
                {new Date(lastCorrectionSummary.timestamp).toLocaleString('pt-BR')} • Operações salvas com sucesso no Firestore
              </p>
            </div>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-emerald-500/20">
            {lastCorrectionSummary.logs.map((log, idx) => (
              <p key={idx} className="text-[10.5px] font-bold text-white/80 flex items-center gap-2">
                <span className="text-emerald-400">✓</span> {log}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Audit History Logs from Firestore */}
      <div className="bg-black border border-white/10 rounded-3xl p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-brand-primary" />
            <h4 className="text-sm font-black text-white uppercase tracking-wider">
              Histórico de Autocorreções Auditadas
            </h4>
          </div>
          <button
            type="button"
            onClick={fetchSettingsAndHistory}
            className="text-[9px] font-black uppercase text-brand-primary hover:underline"
          >
            Atualizar Logs
          </button>
        </div>

        {loadingHistory ? (
          <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest py-4 text-center">Carregando histórico...</p>
        ) : historyLogs.length === 0 ? (
          <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest py-4 text-center">Nenhum log histórico de autocorreção registrado ainda.</p>
        ) : (
          <div className="space-y-3">
            {historyLogs.map((item) => (
              <div key={item.id} className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-white uppercase tracking-tight">
                      {item.executedBy || 'Agente IA'}
                    </span>
                    <span className="text-[8.5px] font-black uppercase px-2 py-0.5 rounded-full bg-brand-primary/20 text-brand-primary border border-brand-primary/30">
                      {item.status || 'SUCCESS'}
                    </span>
                  </div>
                  <p className="text-[9.5px] text-white/50 mt-1">
                    Duplicatas fundidas: {item.duplicatePlayersMerged || 0} • Partidas reparadas: {item.matchesRepaired || 0} • ELOs normalizados: {item.eloStatsNormalized || 0}
                  </p>
                </div>
                <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider shrink-0">
                  {item.createdAt ? new Date(item.createdAt).toLocaleString('pt-BR') : item.dateStr}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

