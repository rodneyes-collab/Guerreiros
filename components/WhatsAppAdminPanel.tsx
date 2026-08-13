import React, { useState, useEffect, useCallback, Fragment } from 'react';
import { useStore } from '../store';
import { WhatsAppConnectionStatus } from './WhatsAppConnectionStatus';
import { EvolutionInstanceChecker } from '../src/components/EvolutionInstanceChecker';
import { ConnectionDiagnostic } from '../src/components/ConnectionDiagnostic';
import { WebhookLogsView } from './WebhookLogsView';
import { WhatsAppScheduler } from './WhatsAppScheduler';
import {
  RotateCcw, CalendarCheck, Shield, CheckCircle2, AlertTriangle, AlertCircle, Trash2, Eye, EyeOff,
  Settings, MessageSquare, History, Calendar
} from 'lucide-react';

export const WhatsAppAdminPanel: React.FC = () => {
  const { showNotification, userRole } = useStore();
  const [activeTab, setActiveTab] = useState<'CONFIG' | 'SCHEDULER' | 'LOGS'>('CONFIG');

  const [waConfig, setWaConfig] = useState({
    apiUrl: '',
    apiKey: '',
    instanceName: '',
    groupJid: '',
    webhookUrl: '',
    botActive: false
  });
  const [isWaLoading, setIsWaLoading] = useState(true);
  const [isWaSaving, setIsWaSaving] = useState(false);
  const [isDeletingInstance, setIsDeletingInstance] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [realStatus, setRealStatus] = useState<string>('CARREGANDO');
  const [instanceNotFoundError, setInstanceNotFoundError] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const [fetchedGroups, setFetchedGroups] = useState<any[] | null>(null);
  const [loadingGroups, setLoadingGroups] = useState(false);

  const checkRealStatus = useCallback(async () => {
    setRealStatus('CARREGANDO');
    setInstanceNotFoundError(false);
    try {
      const res = await fetch('/api/whatsapp/status');
      if (res.status === 404) {
        setInstanceNotFoundError(true);
        setRealStatus('OFFLINE');
        return;
      }
      const data = await res.json();
      setRealStatus(data.status || 'OFFLINE');
      
      if (data.status === 'ONLINE') {
        setQrCode(null);
      }
    } catch (e) {
      setRealStatus('OFFLINE');
    }
  }, []);

  const handleImportConfig = async () => {
    if (!waConfig.apiUrl || !waConfig.apiKey || !waConfig.instanceName) {
        showNotification('Preencha URL, API Key e Nome da Instância primeiro.', 'error');
        return;
    }
    setIsImporting(true);
    try {
        const res = await fetch('/api/whatsapp/find-instance', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                url: waConfig.apiUrl,
                apiKey: waConfig.apiKey,
                instanceName: waConfig.instanceName.trim()
            })
        });
        const data = await res.json();
        
        if (res.ok && data.data && data.data.instance) {
             showNotification('Instância validada no Evolution! Sincronizando...', 'info');
             await handleSaveWaConfig();
        } else {
             showNotification('Instância não encontrada na Evolution API. Verifique os dados.', 'error');
        }
    } catch (e: any) {
        showNotification('Erro ao importar: ' + e.message, 'error');
    } finally {
        setIsImporting(false);
    }
  };

  useEffect(() => {
    if (userRole === 'ADMIN') {
      fetch('/api/whatsapp/config')
        .then(async res => {
          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(`Failed to load WhatsApp config: ${res.status} ${res.statusText} ${JSON.stringify(errBody)}`);
          }
          return res.json();
        })
        .then(data => {
          setWaConfig(prev => ({
            ...prev,
            ...data,
            webhookUrl: data.webhookUrl || (window.location.origin + '/api/whatsapp/webhook')
          }));
          setIsWaLoading(false);
          checkRealStatus();
        })
        .catch(err => {
          console.error("Failed to load WhatsApp config", err);
          setIsWaLoading(false);
          setRealStatus('OFFLINE');
        });
    }
  }, [userRole, checkRealStatus]);

  const handleFetchGroups = async () => {
    setLoadingGroups(true);
    setFetchedGroups(null);
    try {
      const res = await fetch('/api/whatsapp/groups');
      const data = await res.json();
      if (data.success) {
        setFetchedGroups(data.groups || []);
        showNotification(`${data.groups?.length || 0} grupos carregados com sucesso! Selecione o grupo correto na lista.`, 'success');
      } else {
        showNotification(`Erro ao carregar grupos: ${data.error || 'Verifique se a API e instância estão saudáveis.'}`, 'error');
      }
    } catch (err: any) {
      showNotification(`Erro de conexão: ${err.message}`, 'error');
    } finally {
      setLoadingGroups(false);
    }
  };

  const handleGenerateQr = async () => {
    setLoadingQr(true);
    try {
      const res = await fetch('/api/whatsapp/qrcode');
      if (!res.ok) {
        let msg = 'Falha ao obter QR code da Evolution API';
        try {
          const errData = await res.json();
          if (errData.details) {
            msg = `Erro na API: ${errData.details}`;
          } else if (errData.error) {
            msg = errData.error;
          }
        } catch (e) {}
        throw new Error(msg);
      }
      const data = await res.json();
      if (data.alreadyConnected) {
        showNotification(data.message || 'WhatsApp já está conectado e pronto!', 'success');
        setRealStatus('ONLINE');
        setQrCode(null);
      } else {
        // Evolution API can return QR code in different fields depending on the version
        const rawQr = data.base64 || data.qrcode?.base64 || data.code;
        
        if (rawQr) {
          let finalQr = rawQr;
          // If it's not a data URL but looks like base64, prepend the prefix
          if (typeof rawQr === 'string' && !rawQr.startsWith('data:') && !rawQr.startsWith('http')) {
            finalQr = `data:image/png;base64,${rawQr}`;
          }
          // If it's a raw code (not base64), we can try to use a QR generator service as fallback
          if (typeof rawQr === 'string' && !rawQr.startsWith('data:') && rawQr.length < 500 && !rawQr.includes('base64')) {
             finalQr = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(rawQr)}`;
          }

          setQrCode(finalQr);
          showNotification('QR Code gerado! Escaneie no WhatsApp.', 'success');
        } else {
          console.error('QR Code response format unknown:', data);
          throw new Error('QR Code não retornado pela Evolution API ou formato desconhecido.');
        }
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setLoadingQr(false);
    }
  };

  const handleSaveWaConfig = async () => {
    setIsWaSaving(true);
    try {
      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(waConfig)
      });
      const data = await res.json();
      if (data.success) {
        showNotification('Configurações salvas e webhook atualizado com sucesso na Evolution API!', 'success');
      } else {
        showNotification(`Falha ao salvar: ${data.error || 'Erro desconhecido'}`, 'error');
      }
    } catch (err: any) {
      showNotification(`Erro de conexão: ${err.message}`, 'error');
    } finally {
      setIsWaSaving(false);
    }
  };

  const handleDeleteCurrentInstance = async () => {
    if (!waConfig.apiUrl || !waConfig.apiKey || !waConfig.instanceName) {
      showNotification('Preencha URL, API Key e Nome da Instância para poder excluir.', 'error');
      return;
    }
    if (!window.confirm(`⚠️ EXCLUIR INSTÂNCIA DO ZERO?\n\nTem certeza que deseja DELETAR a instância "${waConfig.instanceName}" da Evolution API? Isso apagará a sessão antiga travada e permitirá que você crie uma nova limpa.`)) {
      return;
    }
    setIsDeletingInstance(true);
    try {
      const res = await fetch('/api/whatsapp/delete-instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: waConfig.apiUrl,
          apiKey: waConfig.apiKey,
          instanceName: waConfig.instanceName.trim()
        })
      });
      const data = await res.json();
      if (data.statusCode === 200 || data.success || res.ok) {
        showNotification('🗑️ Instância deletada com sucesso! Agora você pode clicar em "Gerar QR Code" ou criar uma nova instância limpa.', 'success');
        setRealStatus('DESCONECTADO');
        setQrCode(null);
      } else {
        showNotification(`Erro ao excluir: ${JSON.stringify(data.data || data.error || 'Verifique se a instância já estava excluída')}`, 'error');
      }
    } catch (err: any) {
      showNotification(`Erro de conexão: ${err.message}`, 'error');
    } finally {
      setIsDeletingInstance(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
        <button
          onClick={() => setActiveTab('CONFIG')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
            activeTab === 'CONFIG' ? 'bg-brand-primary text-black' : 'text-white/40 hover:text-white'
          }`}
        >
          <Settings className="w-4 h-4" /> Configuração
        </button>
        <button
          onClick={() => setActiveTab('SCHEDULER')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
            activeTab === 'SCHEDULER' ? 'bg-brand-primary text-black' : 'text-white/40 hover:text-white'
          }`}
        >
          <Calendar className="w-4 h-4" /> Agendamento
        </button>
        <button
          onClick={() => setActiveTab('LOGS')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
            activeTab === 'LOGS' ? 'bg-brand-primary text-black' : 'text-white/40 hover:text-white'
          }`}
        >
          <History className="w-4 h-4" /> Webhook Logs
        </button>
      </div>

      <div className="bg-brand-secondary/30 rounded-2xl p-6 border border-white/5 space-y-6">
        {isWaLoading ? (
          <div className="flex items-center justify-center py-6">
            <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : activeTab === 'CONFIG' ? (
          <div className="space-y-6">
            <div className="bg-brand-primary/10 rounded-2xl p-6 border border-brand-primary/30 space-y-4">
              <h4 className="text-[12px] font-black text-brand-primary uppercase tracking-widest flex items-center gap-2">
                <Shield className="w-4 h-4" /> Configuração Evolution API
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="URL da API (ex: https://api.exemplo.com)"
                  className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:border-brand-primary/50 outline-none"
                  value={waConfig.apiUrl || ''}
                  onChange={e => setWaConfig({ ...waConfig, apiUrl: e.target.value })}
                />
                <input
                  type="password"
                  placeholder="API Key"
                  className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:border-brand-primary/50 outline-none"
                  value={waConfig.apiKey || ''}
                  onChange={e => setWaConfig({ ...waConfig, apiKey: e.target.value })}
                />
                <input
                  type="text"
                  placeholder="Nome da Instância (Ex: GuerreirosBot)"
                  className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:border-brand-primary/50 outline-none"
                  value={waConfig.instanceName || ''}
                  onChange={e => setWaConfig({ ...waConfig, instanceName: e.target.value })}
                />
                <input
                  type="text"
                  placeholder="ID do Grupo JID (Ex: 12036...459791@g.us)"
                  className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:border-brand-primary/50 outline-none"
                  value={waConfig.groupJid || ''}
                  onChange={e => setWaConfig({ ...waConfig, groupJid: e.target.value })}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    try {
                      showNotification('Testando conexão...', 'info');
                      const res = await fetch(waConfig.apiUrl.replace(/\/$/, "") + '/instance/fetchInstances', {
                          method: 'GET',
                          headers: { 'apikey': waConfig.apiKey.trim() }
                      });
                      if (res.ok) {
                          showNotification('Conexão bem-sucedida!', 'success');
                      } else {
                          showNotification('Falha na conexão: ' + res.status, 'error');
                      }
                    } catch (e: any) {
                      showNotification('Erro: ' + e.message, 'error');
                    }
                  }}
                  className="px-6 py-2 bg-black text-brand-primary border border-brand-primary rounded-lg font-black text-[10px] uppercase tracking-wider hover:bg-brand-primary hover:text-black transition-all"
                >
                  Testar Conexão
                </button>
                <button
                  onClick={handleSaveWaConfig}
                  className="px-6 py-2 bg-brand-primary text-black rounded-lg font-black text-[10px] uppercase tracking-wider hover:scale-[1.02] transition-all"
                >
                  Salvar Configuração
                </button>
              </div>
            </div>
            
            <WhatsAppConnectionStatus 
              status={realStatus} 
              qrCode={qrCode} 
              onRefresh={checkRealStatus} 
              onGenerateQr={handleGenerateQr} 
              loadingQr={loadingQr} 
            />
            <EvolutionInstanceChecker />

            {instanceNotFoundError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                      <AlertCircle className="w-8 h-8 text-red-500" />
                      <div>
                          <h5 className="text-sm font-black text-white uppercase tracking-wider">Instância 'Guerreiros' não encontrada (404)</h5>
                          <p className="text-[10px] text-white/50">A instância configurada na Evolution API não existe ou foi deletada. É necessário recriá-la.</p>
                      </div>
                  </div>
                  <a href="https://evolution-api.com/docs/instances" target="_blank" rel="noopener noreferrer" className="px-6 py-3 bg-red-500 text-white rounded-xl font-black uppercase tracking-widest text-[10px] hover:scale-[1.02] transition-all whitespace-nowrap">Recriar Instância</a>
              </div>
            )}

            <div className="bg-black/30 rounded-xl p-4 border border-white/5 space-y-2">
              <label className="text-[10px] font-black uppercase tracking-wider text-white/50 flex items-center gap-2">
                Webhook Ativo
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-black text-[10px] text-white/70 px-3 py-2.5 rounded-lg border border-white/10 truncate font-mono select-all">
                  {waConfig.webhookUrl}
                </code>
                <button
                  type="button"
                  title="Copiar URL"
                  onClick={() => {
                    navigator.clipboard.writeText(waConfig.webhookUrl);
                    showNotification('URL do Webhook copiada!', 'success');
                  }}
                  className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/50 hover:text-white transition-all"
                >
                  Copiar
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-brand-primary/5 border border-brand-primary/20 p-4 rounded-xl cursor-pointer select-none" onClick={() => setWaConfig({ ...waConfig, botActive: !waConfig.botActive })}>
              <div className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={waConfig.botActive || false}
                  onChange={e => setWaConfig({ ...waConfig, botActive: e.target.checked })}
                />
                <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-primary"></div>
              </div>
              <div>
                <p className="text-xs font-bold text-white uppercase tracking-wider">Ativar Disparos Automáticos</p>
                <p className="text-[10px] text-white/50">Permite que o bot envie enquetes, lembretes e placares.</p>
              </div>
            </div>

            <ConnectionDiagnostic />

            <div className="pt-4 border-t border-white/5 flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleDeleteCurrentInstance}
                disabled={isDeletingInstance}
                className="py-3 px-6 rounded-xl font-black uppercase tracking-widest text-[10px] bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition-all disabled:opacity-50"
              >
                {isDeletingInstance ? 'Deletando...' : '🗑️ Deletar Instância & Começar do Zero'}
              </button>
              <button
                onClick={handleImportConfig}
                disabled={isImporting}
                className="py-3 px-6 rounded-xl font-black uppercase tracking-widest text-[10px] bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 transition-all disabled:opacity-50"
              >
                {isImporting ? 'Validando...' : '🔄 Validar/Importar do Evolution'}
              </button>
              <button
                onClick={handleSaveWaConfig}
                disabled={isWaSaving}
                className="flex-1 min-w-[200px] py-3 px-6 rounded-xl font-black uppercase tracking-widest text-[10px] bg-brand-primary text-black hover:scale-[1.02] shadow-xl shadow-brand-primary/10 transition-all disabled:opacity-50"
              >
                {isWaSaving ? 'Salvando...' : 'Salvar & Sincronizar Instância'}
              </button>
            </div>
          </div>
        ) : activeTab === 'SCHEDULER' ? (
          <WhatsAppScheduler />
        ) : (
          <WebhookLogsView />
        )}
      </div>
    </div>
  );
};
