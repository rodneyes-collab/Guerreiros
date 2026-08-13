import React, { useState, useEffect } from 'react';
import { RefreshCcw, AlertCircle, CheckCircle, Database } from 'lucide-react';

interface Instance {
  instanceName: string;
  status: string;
}

export const EvolutionInstanceChecker: React.FC = () => {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInstances = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/whatsapp/instances');
      const data = await res.json();
      if (data.success) {
        const rawList = Array.isArray(data.data) ? data.data : (data.data?.instances || []);
        const formatted = rawList.map((item: any) => {
          const name = item?.instance?.instanceName || item?.instanceName || item?.name || item?.id || 'Sem Nome';
          const status = item?.instance?.status || item?.status || item?.connectionStatus || 'close';
          return {
            instanceName: String(name).trim(),
            status: String(status).trim()
          };
        });
        setInstances(formatted);
      } else {
        setError(data.error);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInstances();
  }, []);

  const guerreirosExists = instances.some(i => i.instanceName.toLowerCase().includes('guerreiros'));

  return (
    <div className="bg-black/60 p-6 rounded-[2rem] border border-white/5 space-y-6">
        <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Database className="w-4 h-4 text-brand-primary" /> Instâncias Evolution
            </h3>
            <button onClick={fetchInstances} disabled={loading} className="p-2 text-white/40 hover:text-white rounded-lg transition-all">
                <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
        </div>

        {error && (
            <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-xl flex items-center gap-3 text-red-500 text-xs">
                <AlertCircle className="w-4 h-4" /> {error}
            </div>
        )}

        <div className="space-y-2">
            {instances.map((instance) => (
                <div key={instance.instanceName} className={`flex items-center justify-between p-3 rounded-lg ${instance.instanceName === 'Guerreiros' ? 'bg-brand-primary/10 border border-brand-primary/30' : 'bg-white/5'}`}>
                    <span className="text-xs font-bold text-white">{instance.instanceName}</span>
                    <span className={`text-[10px] font-black uppercase ${instance.status === 'open' ? 'text-green-400' : 'text-amber-500'}`}>{instance.status}</span>
                </div>
            ))}
        </div>

        {!guerreirosExists && !loading && (
             <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl text-amber-500 text-xs font-black uppercase tracking-widest text-center">
                Instância 'Guerreiros' não encontrada!
             </div>
        )}
    </div>
  );
};
