import React, { useState, useEffect } from 'react';
import { 
  ClipboardList, 
  Trash2, 
  Clock, 
  Info, 
  AlertTriangle, 
  AlertOctagon, 
  RefreshCw,
  Search,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { diagnosticLogService, DiagnosticLogEntry } from '../services/diagnosticLogService';

export const DiagnosticLogsPanel: React.FC = () => {
  const [logs, setLogs] = useState<DiagnosticLogEntry[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filter, setFilter] = useState<string>('');

  const refreshLogs = () => {
    setLogs(diagnosticLogService.getLogs());
  };

  useEffect(() => {
    refreshLogs();
    const interval = setInterval(refreshLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  const filteredLogs = logs.filter(log => 
    log.message.toLowerCase().includes(filter.toLowerCase()) ||
    log.type.toLowerCase().includes(filter.toLowerCase())
  );

  const getIcon = (type: DiagnosticLogEntry['type']) => {
    switch (type) {
      case 'warn': return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      case 'error': return <AlertOctagon className="w-4 h-4 text-rose-500" />;
      case 'update_attempt': return <RefreshCw className="w-4 h-4 text-brand-primary animate-spin" />;
      case 'version_check': return <Clock className="w-4 h-4 text-cyan-400" />;
      default: return <Info className="w-4 h-4 text-blue-400" />;
    }
  };

  const clearLogs = () => {
    if (window.confirm('Deseja limpar todos os logs de diagnóstico?')) {
      diagnosticLogService.clearLogs();
      refreshLogs();
    }
  };

  return (
    <div className="bg-brand-light p-6 sm:p-8 rounded-[2.5rem] border border-white/5 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h4 className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-brand-primary" />
            Logs de Diagnóstico do Sistema
          </h4>
          <p className="text-xs text-white/50 mt-1">
            Rastreamento de versões, tentativas de atualização e erros de sincronia em tempo real.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Filtrar logs..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-brand-primary/50 transition-all w-40 sm:w-60"
            />
          </div>
          <button 
            onClick={clearLogs}
            className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-all border border-rose-500/20"
            title="Limpar logs"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="bg-black/40 rounded-3xl border border-white/5 overflow-hidden">
        <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
          {filteredLogs.length === 0 ? (
            <div className="p-12 text-center text-white/30 italic text-sm">
              Nenhum log registrado no momento.
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {filteredLogs.map((log) => (
                <div key={log.timestamp} className="group">
                  <div 
                    onClick={() => setExpandedId(expandedId === log.timestamp ? null : log.timestamp)}
                    className="p-4 hover:bg-white/[0.02] transition-colors cursor-pointer flex items-center gap-4"
                  >
                    <div className="shrink-0">
                      {getIcon(log.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${
                          log.type === 'error' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                          log.type === 'warn' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                          log.type === 'update_attempt' ? 'bg-brand-primary/10 text-brand-primary border-brand-primary/20' :
                          'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        }`}>
                          {log.type.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] text-white/40 font-mono">
                          {new Date(log.timestamp).toLocaleTimeString('pt-BR')}
                        </span>
                      </div>
                      <p className="text-xs text-white/80 mt-1 font-medium truncate">
                        {log.message}
                      </p>
                    </div>
                    <div className="shrink-0 text-white/20 group-hover:text-white/40">
                      {expandedId === log.timestamp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                  
                  {expandedId === log.timestamp && log.details && (
                    <div className="px-12 pb-4 pt-0">
                      <div className="p-3 bg-black rounded-2xl border border-white/5">
                        <pre className="text-[10px] text-brand-primary font-mono whitespace-pre-wrap overflow-x-auto">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] text-white/30 uppercase font-bold tracking-widest px-2">
        <span>Mostrando {filteredLogs.length} de {logs.length} logs</span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Auto-refresh ativo (5s)
        </span>
      </div>
    </div>
  );
};
