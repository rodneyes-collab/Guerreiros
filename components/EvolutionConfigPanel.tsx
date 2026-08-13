import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Shield, Save, Key, Globe, LayoutTemplate, Wifi, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useStore } from '../store';

export const EvolutionConfigPanel: React.FC = () => {
  const { showNotification } = useStore();
  const [config, setConfig] = useState({
    apiUrl: '',
    apiKey: '',
    instanceName: '',
    reconnectionLogs: [] as { timestamp: string, status: string }[]
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  const updateFirestoreConfig = async (newConfig: typeof config, newStatus: typeof connectionStatus) => {
    await setDoc(doc(db, 'config', 'evolution'), { ...newConfig, status: newStatus }, { merge: true });
  };

  const checkConnection = async (currentConfig: typeof config) => {
    try {
      if (!currentConfig.apiUrl || !currentConfig.instanceName) return false;
      const res = await fetch(`${currentConfig.apiUrl.replace(/\/$/, "")}/instance/find/${currentConfig.instanceName}`, {
        headers: { 'apikey': currentConfig.apiKey }
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  };

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const docRef = doc(db, 'config', 'evolution');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data() as any;
          setConfig({
            apiUrl: data.apiUrl || '',
            apiKey: data.apiKey || '',
            instanceName: data.instanceName || '',
            reconnectionLogs: data.reconnectionLogs || []
          });
          setConnectionStatus(data.status || 'idle');
        }
      } catch (e) {
        console.error("Erro ao buscar config:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  useEffect(() => {
    if (connectionStatus !== 'error') return;

    const interval = setInterval(async () => {
      const success = await checkConnection(config);
      
      const newLog = {
        timestamp: new Date().toLocaleString(),
        status: success ? 'success' : 'error'
      };

      setConfig(prev => {
        const logs = [newLog, ...(prev.reconnectionLogs || [])].slice(0, 5);
        const updatedConfig = { ...prev, reconnectionLogs: logs };
        updateFirestoreConfig(updatedConfig, success ? 'success' : 'error');
        return updatedConfig;
      });

      if (success) {
        setConnectionStatus('success');
        showNotification('Conexão restabelecida automaticamente!', 'success');
      }
    }, 300000); // 5 minutes

    return () => clearInterval(interval);
  }, [connectionStatus, config]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateFirestoreConfig(config, connectionStatus);
      showNotification('Credenciais do Evolution API salvas!', 'success');
    } catch (e: any) {
      showNotification('Erro ao salvar: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setConnectionStatus('testing');
    const success = await checkConnection(config);
    const newStatus = success ? 'success' : 'error';
    
    setConnectionStatus(newStatus);
    updateFirestoreConfig(config, newStatus);
    
    if (success) {
      showNotification('Conexão testada com sucesso!', 'success');
    } else {
      showNotification('Falha na conexão', 'error');
    }
  };

  const StatusIcon = () => {
    switch (connectionStatus) {
      case 'testing': return <Loader2 className="w-4 h-4 text-white animate-spin"/>;
      case 'success': return <CheckCircle className="w-4 h-4 text-brand-primary"/>;
      case 'error': return <AlertCircle className="w-4 h-4 text-red-500"/>;
      default: return null;
    }
  };

  if (loading) return <div className="text-white/50 text-xs">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="bg-black/40 p-6 rounded-2xl border border-white/5 space-y-4">
         <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-black uppercase tracking-wider text-white/50 flex items-center gap-2">Configuração Evolution API</h3>
            <StatusIcon />
         </div>
         <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-white/50 flex items-center gap-2"><Globe className="w-3 h-3"/> URL do Evolution API</label>
            <input
              type="text"
              value={config.apiUrl}
              onChange={e => setConfig({...config, apiUrl: e.target.value})}
              placeholder="http://seu-servidor:8080"
              className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-white"
            />
         </div>
         <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-white/50 flex items-center gap-2"><Key className="w-3 h-3"/> API Key / Token</label>
            <input
              type="password"
              value={config.apiKey}
              onChange={e => setConfig({...config, apiKey: e.target.value})}
              className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-white"
            />
         </div>
         <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-white/50 flex items-center gap-2"><LayoutTemplate className="w-3 h-3"/> Nome da Instância</label>
            <input
              type="text"
              value={config.instanceName}
              onChange={e => setConfig({...config, instanceName: e.target.value})}
              className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-white"
            />
         </div>
         <div className="flex gap-4">
           <button 
             onClick={handleSave}
             disabled={saving}
             className="px-6 py-3 bg-brand-primary text-black rounded-xl font-black uppercase tracking-widest text-[10px] hover:scale-[1.02] transition-all"
           >
             {saving ? 'Salvando...' : 'Salvar Credenciais'}
           </button>
           <button 
             onClick={handleTest}
             disabled={connectionStatus === 'testing'}
             className="px-6 py-3 bg-white/10 text-white rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-white/20 transition-all flex items-center gap-2"
           >
             <Wifi className="w-3 h-3"/> {connectionStatus === 'testing' ? 'Testando...' : 'Testar Conexão'}
           </button>
         </div>
       </div>
       
       {config.reconnectionLogs && config.reconnectionLogs.length > 0 && (
         <div className="bg-black/40 p-6 rounded-2xl border border-white/5 space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-wider text-white/50">Histórico de Reconexão Automática</h3>
            <div className="space-y-2">
              {config.reconnectionLogs.map((log, i) => (
                <div key={i} className="flex items-center justify-between bg-black p-3 rounded-lg border border-white/5">
                  <span className="text-xs text-white/70 font-mono">{log.timestamp}</span>
                  <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded ${log.status === 'success' ? 'text-brand-primary' : 'text-red-500'}`}>{log.status}</span>
                </div>
              ))}
            </div>
         </div>
       )}
    </div>
  );
};
