import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Shield, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { useStore } from '../store';

export const WebhookAdminPanel: React.FC = () => {
  const { showNotification } = useStore();
  const [config, setConfig] = useState({
    webhookUrl: '',
    authToken: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<'DISCONNECTED' | 'CONNECTED'>('DISCONNECTED');

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const docRef = doc(db, 'metadata', 'webhook_config');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setConfig(snap.data() as any);
        }
      } catch (e) {
        console.error("Erro ao buscar config:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'metadata', 'webhook_config'), config, { merge: true });
      showNotification('Configuração de webhook salva com sucesso!', 'success');
      setStatus('CONNECTED');
    } catch (e: any) {
      showNotification('Erro ao salvar: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const res = await fetch('/api/whatsapp/test-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (data.success) {
        showNotification('Conexão testada com sucesso!', 'success');
        setStatus('CONNECTED');
      } else {
        throw new Error(data.error);
      }
    } catch (e: any) {
      showNotification('Falha no teste: ' + e.message, 'error');
      setStatus('DISCONNECTED');
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <div className="text-white/50 text-xs">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="bg-black/40 p-6 rounded-2xl border border-white/5 space-y-4">
         <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-white/50">URL do Webhook</label>
            <input
              type="text"
              value={config.webhookUrl}
              onChange={e => setConfig({...config, webhookUrl: e.target.value})}
              className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-white"
            />
         </div>
         <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-white/50">Token de Autenticação</label>
            <input
              type="password"
              value={config.authToken}
              onChange={e => setConfig({...config, authToken: e.target.value})}
              className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-white"
            />
         </div>
         <div className="flex gap-3">
            <button 
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-3 bg-brand-primary text-black rounded-xl font-black uppercase tracking-widest text-[10px] hover:scale-[1.02] transition-all"
            >
              {saving ? 'Salvando...' : 'Salvar Configuração'}
            </button>
            <button 
              onClick={handleTestConnection}
              disabled={testing}
              className="px-6 py-3 bg-white/10 text-white rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-white/20 transition-all"
            >
              {testing ? 'Testando...' : 'Testar Conexão'}
            </button>
         </div>
      </div>
      
      <div className={`flex items-center gap-3 p-4 rounded-xl border ${status === 'CONNECTED' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
        {status === 'CONNECTED' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
        <span className="text-xs font-bold uppercase tracking-wider">Status: {status}</span>
      </div>

    </div>
  );
};
