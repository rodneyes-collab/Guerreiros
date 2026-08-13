import React, { useState, useEffect } from 'react';
import { RefreshCw, Terminal } from 'lucide-react';

export const WebhookLogsView: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/whatsapp/webhook-logs');
      if (!res.ok) throw new Error('Falha ao buscar logs');
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs || []);
      } else {
        throw new Error(data.error || 'Erro desconhecido');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="mt-8 bg-black rounded-3xl border border-white/10 p-6 shadow-2xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Terminal className="w-5 h-5 text-brand-primary" />
          <h3 className="text-sm font-black text-white uppercase tracking-widest">
            Logs do Webhook (Últimos 50)
          </h3>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="p-2 hover:bg-white/10 rounded-full transition-colors disabled:opacity-50"
          title="Atualizar"
        >
          <RefreshCw className={`w-4 h-4 text-white/70 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-medium mb-4">
          Erro: {error}
        </div>
      )}

      {logs.length === 0 && !loading && !error && (
        <div className="text-center p-8 text-white/40 text-xs font-medium uppercase tracking-widest border border-dashed border-white/10 rounded-xl">
          Nenhum evento registrado.
        </div>
      )}

      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
        {logs.map((log) => (
          <div key={log.id} className="bg-white/5 border border-white/5 rounded-xl p-4 relative group hover:border-brand-primary/30 transition-colors">
            <div className="flex justify-between items-start mb-2">
              <span className="text-brand-primary font-mono text-[10px] bg-brand-primary/10 px-2 py-0.5 rounded">
                {log.event}
              </span>
              <span className="text-white/40 text-[10px] font-medium">
                {new Date(log.timestamp).toLocaleString()}
              </span>
            </div>
            
            <div className="text-[10px] font-mono text-white/60 bg-black p-3 rounded-lg border border-white/5 overflow-x-auto whitespace-pre-wrap">
              {log.payload}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
