import React, { useState, useEffect } from 'react';
import { Shield, RotateCcw, AlertCircle, CheckCircle2, AlertTriangle, Eye, EyeOff, Trash2 } from 'lucide-react';
import { useStore } from '../../store';

export const ConnectionDiagnostic: React.FC = () => {
  const { showNotification } = useStore();
  const [config, setConfig] = useState({ url: '', apiKey: '', instanceName: 'Guerreiros - Bot' });
  const [loading, setLoading] = useState(false);
  const [instances, setInstances] = useState<any[]>([]);
  const [instanceStatus, setInstanceStatus] = useState<number | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    fetch('/api/whatsapp/config')
      .then(res => res.json())
      .then(data => {
        if (data) {
          setConfig(prev => ({
            url: data.apiUrl || prev.url,
            apiKey: data.apiKey || prev.apiKey,
            instanceName: data.instanceName || prev.instanceName
          }));
        }
      })
      .catch(() => {});
  }, []);

  const syncConfigToServer = async () => {
    try {
      await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiUrl: config.url.trim(),
          apiKey: config.apiKey.trim(),
          instanceName: config.instanceName.trim()
        })
      });
      showNotification('Credenciais sincronizadas no servidor com sucesso!', 'success');
    } catch (e) {
      console.warn('Falha ao sincronizar config:', e);
    }
  };

  const createInstance = async () => {
    if (!config.url || !config.apiKey) {
      showNotification('Preencha URL e API Key.', 'error');
      return;
    }

    setLoading(true);
    setQrCode(null);
    await syncConfigToServer();
    try {
        const res = await fetch('/api/whatsapp/create-instance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: config.url, apiKey: config.apiKey, instanceName: config.instanceName })
        });
        const data = await res.json();
        
        if (data.statusCode === 200 || data.statusCode === 201) {
            setQrCode(data.data?.qrcode?.base64 || null);
            showNotification('Instância criada com sucesso! Escaneie o QR Code.', 'success');
        } else {
            console.error('[API] Erro ao criar:', data);
            let errorMessage = 'Erro desconhecido';
            let rawError = data.data?.error || data.error;
            
            if (rawError) {
                if (typeof rawError === 'string') {
                    try {
                        const parsed = JSON.parse(rawError);
                        if (parsed.response?.message) {
                            errorMessage = Array.isArray(parsed.response.message)
                                ? parsed.response.message.join(', ')
                                : String(parsed.response.message);
                        } else if (parsed.message) {
                            errorMessage = String(parsed.message);
                        } else if (parsed.error) {
                            errorMessage = String(parsed.error);
                        } else {
                            errorMessage = rawError;
                        }
                    } catch (e) {
                        errorMessage = rawError;
                    }
                } else if (typeof rawError === 'object') {
                    errorMessage = rawError.message || rawError.error || JSON.stringify(rawError);
                }
            }

            if (errorMessage.toLowerCase().includes('already in use') || errorMessage.toLowerCase().includes('already_in_use') || errorMessage.toLowerCase().includes('já está em uso') || String(data.data?.error).includes('already in use')) {
                errorMessage = `O nome da instância "${config.instanceName}" já está em uso na Evolution API. Tente usar a opção "Deletar Instância Atual" ao lado ou altere o nome da instância.`;
            } else if (data.statusCode === 401 || errorMessage.toLowerCase().includes('unauthorized') || errorMessage.toLowerCase().includes('não autorizado')) {
                errorMessage = `Erro de Autenticação (401). Verifique se a sua API Key corresponde à chave configurada (AUTH_API_KEY) no servidor.`;
            } else if (errorMessage.toLowerCase().includes('fetch failed')) {
                errorMessage = `Falha na conexão de rede. Verifique se a URL da Evolution API está acessível externamente e se os containers estão ativos na VM.`;
            }

            showNotification(`Erro ao criar: ${errorMessage}`, 'error');
        }
    } catch (err: any) {
        showNotification('Erro de rede ao criar.', 'error');
    } finally {
        setLoading(false);
    }
  };

  const deleteInstance = async () => {
    try {
        const res = await fetch('/api/whatsapp/delete-instance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: config.url, apiKey: config.apiKey, instanceName: config.instanceName.trim() })
        });
        const data = await res.json();
        console.log('[API] Resultado deleção:', data);
        return data.statusCode === 200 || data.success === true || res.ok;
    } catch (err: any) {
        console.error('[API] Erro na deleção:', err);
        return false;
    }
  };

  const handleDeleteOnly = async () => {
    if (!config.url || !config.apiKey || !config.instanceName) {
      showNotification('Preencha URL, API Key e Nome da Instância para deletar.', 'error');
      return;
    }
    if (!window.confirm(`Tem certeza que deseja DELETAR a instância "${config.instanceName.trim()}" da Evolution API? Você precisará recriá-la e ler um novo QR Code para voltar a usar.`)) {
      return;
    }
    setLoading(true);
    setQrCode(null);
    try {
      const res = await fetch('/api/whatsapp/delete-instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: config.url, apiKey: config.apiKey, instanceName: config.instanceName.trim() })
      });
      const data = await res.json();
      console.log('[API] Resposta deleção:', data, 'Status:', res.status);
      
      if (res.ok || data.statusCode === 200 || data.success) {
        showNotification(`Instância "${config.instanceName}" removida com sucesso!`, 'success');
        setInstanceStatus(404);
        fetchInstances();
      } else {
        const err = data.data?.error || data.error || 'Instância não encontrada ou erro na API';
        showNotification(`Erro ao deletar: ${typeof err === 'string' ? err : JSON.stringify(err)}`, 'error');
      }
    } catch (err: any) {
      console.error('[API] Erro catch deleção:', err);
      showNotification(`Erro ao conectar para deletar: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const forceRecreateInstance = async () => {
      if (!window.confirm(`Deseja DELETAR e RECRIAR a instância "${config.instanceName.trim()}" do zero? Um novo QR Code será gerado.`)) {
        return;
      }
      setLoading(true);
      await deleteInstance();
      await createInstance();
      setLoading(false);
  };

  const fetchInstances = async () => {
    if (!config.url || !config.apiKey) {
      showNotification('Preencha URL e API Key.', 'error');
      return;
    }

    setLoading(true);
    setInstances([]);
    setInstanceStatus(null);
    setStatus(null);

    const instanceNameTrimmed = config.instanceName.trim();
    await syncConfigToServer();

    try {
      let listInstances: any[] = [];
      let listSuccess = false;

      // 1. Listar instâncias para verificar API e obter a lista exata
      const res = await fetch('/api/whatsapp/list-instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: config.url, apiKey: config.apiKey })
      });
      const data = await res.json();
      
      setStatus(data.statusCode);
      
      if (data.statusCode === 200) {
        listSuccess = true;
        listInstances = Array.isArray(data.data) ? data.data : (data.data?.instances || []);
        setInstances(listInstances);
      }

      // Verificação por lista principal (v1/v2 compatível)
      const exactFoundInList = listInstances.find(i => {
        const n = i?.instance?.instanceName || i?.instanceName || i?.name || i?.id;
        return n && String(n).trim().toLowerCase() === instanceNameTrimmed.toLowerCase();
      });

      // 2. Tentar buscar status real de conexão ou rota de find
      const resInstance = await fetch('/api/whatsapp/find-instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: config.url, apiKey: config.apiKey, instanceName: instanceNameTrimmed })
      });
      const dataInstance = await resInstance.json();
      
      // Se a instância foi encontrada no fetchInstances (status 200 da lista) ou na rota find-instance
      if (exactFoundInList || (dataInstance.statusCode >= 200 && dataInstance.statusCode < 300) || dataInstance.data?.instance) {
        setInstanceStatus(200);
      } else {
        setInstanceStatus(dataInstance.statusCode || 404);
      }
      
    } catch (err: any) {
      showNotification('Erro de rede.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const isBotFound = instances.some(i => {
    const n = i.instance?.instanceName || i.instanceName || i.name;
    return n && String(n).trim().toLowerCase() === config.instanceName.trim().toLowerCase();
  });

  return (
    <div className="bg-black backdrop-blur-xl p-8 rounded-[2.5rem] border border-brand-primary/40 shadow-2xl shadow-brand-primary/5 space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-brand-primary/10 rounded-2xl flex items-center justify-center border border-brand-primary/40">
          <Shield className="w-6 h-6 text-brand-primary" />
        </div>
        <div>
          <h3 className="text-xl font-black uppercase tracking-tight text-white">Diagnóstico Evolução API</h3>
          <p className="text-xs font-bold text-white/40 uppercase tracking-widest">Ferramenta de Debug</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <input 
          placeholder="URL da API (ex: http://...)"
          className="bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-xs text-white"
          value={config.url}
          onChange={e => setConfig({...config, url: e.target.value})}
        />
        <div className="relative">
            <input 
              type={showKey ? "text" : "password"}
              placeholder="API Key"
              className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-xs text-white"
              value={config.apiKey}
              onChange={e => setConfig({...config, apiKey: e.target.value})}
            />
            <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30"
            >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
        </div>
        <input 
          placeholder="Nome da Instância"
          className="bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-xs text-white"
          value={config.instanceName}
          onChange={e => setConfig({...config, instanceName: e.target.value})}
        />
      </div>

      <div className="flex flex-col gap-3">
        <button
          onClick={syncConfigToServer}
          className="w-full py-3 px-4 bg-white/10 border border-white/20 text-white rounded-xl font-black uppercase tracking-widest text-xs hover:bg-white/20 transition-all flex items-center justify-center gap-2"
        >
          💾 Salvar e Sincronizar Credenciais no Servidor
        </button>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
                onClick={fetchInstances}
                disabled={loading}
                className="py-4 px-4 bg-brand-primary/20 border border-brand-primary text-brand-primary rounded-xl font-black uppercase tracking-widest text-xs hover:scale-[1.01] transition-all disabled:opacity-50"
            >
                {loading ? 'Validando...' : '🔍 Buscar / Listar Instâncias'}
            </button>
            <button
                onClick={createInstance}
                disabled={loading}
                className="py-4 px-4 bg-brand-primary text-black rounded-xl font-black uppercase tracking-widest text-xs hover:scale-[1.01] transition-all disabled:opacity-50"
            >
                {loading ? 'Criando...' : '✨ Criar Instância'}
            </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
                onClick={handleDeleteOnly}
                disabled={loading}
                className="py-4 px-4 bg-red-500/10 border border-red-500/50 text-red-400 hover:bg-red-500/20 rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
                <Trash2 size={16} />
                {loading ? 'Excluindo...' : '🗑️ Deletar Instância Atual'}
            </button>
            <button
                onClick={forceRecreateInstance}
                disabled={loading}
                className="py-4 px-4 bg-amber-500/10 border border-amber-500/50 text-amber-400 hover:bg-amber-500/20 rounded-xl font-black uppercase tracking-widest text-xs transition-all disabled:opacity-50"
            >
                {loading ? 'Recriando...' : '🔄 Excluir & Recriar do Zero'}
            </button>
        </div>
      </div>

      {qrCode && (
        <div className="bg-white p-4 rounded-xl flex justify-center">
            <img src={qrCode} alt="QR Code" className="max-w-xs" />
        </div>
      )}

      {status && (
        <div className={`p-4 rounded-xl text-xs font-bold ${status === 200 ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'}`}>
            Status API Geral: {status}
            {status === 401 && <p className="mt-2 text-white/60">💡 Solução: Verifique a variável AUTH_API_KEY no seu arquivo docker-compose.yml do servidor.</p>}
        </div>
      )}

      {instanceStatus && (
        <div className={`p-4 rounded-xl text-xs font-bold ${instanceStatus === 200 ? 'bg-green-900/20 text-green-400 border border-green-500/30' : 'bg-red-900/20 text-red-400 border border-red-500/30'}`}>
            Status Instância "{config.instanceName.trim()}": {instanceStatus === 200 ? 'ENCONTRADA / ATIVA (200)' : instanceStatus}
            {instanceStatus === 200 && (
                <p className="mt-1 text-white/80 font-normal">✅ Instância identificada no servidor Evolution API! Se estiver desconectada no topo, clique em <strong>"Gerar QR Code"</strong> ou <strong>"Excluir & Recriar do Zero"</strong> para parear novamente.</p>
            )}
            {instanceStatus === 404 && (
                <div className="mt-2 text-white/60 font-normal">
                    <p>❌ Instância não encontrada no servidor.</p>
                    <p className="mt-2 font-bold text-white">Como criar:</p>
                    <ol className="list-decimal pl-4 mt-1">
                        <li>Acesse o seu Evolution Manager (painel).</li>
                        <li>Clique em "Criar nova instância".</li>
                        <li>Nomeie exatamente como: <span className="text-brand-primary">{config.instanceName.trim()}</span></li>
                        <li>Siga os passos e gere o QR Code.</li>
                    </ol>
                </div>
            )}
        </div>
      )}

      {instances.length > 0 && (
        <div className="bg-black/80 rounded-xl p-4 border border-white/10 font-mono text-[10px] text-white/80 max-h-60 overflow-y-auto space-y-1.5">
          <p className="font-bold text-white mb-2">Instâncias no Servidor (Copie o nome exato):</p>
          {instances.map((i, idx) => {
              const name = i.instance?.instanceName || i.instanceName || i.name;
              return (
                <div 
                  key={idx} 
                  className="text-brand-primary cursor-pointer hover:underline"
                  onClick={() => {
                    setConfig(prev => ({ ...prev, instanceName: name }));
                  }}
                >
                  {name}
                </div>
              )
          })}
        </div>
      )}
    </div>
  );
};
