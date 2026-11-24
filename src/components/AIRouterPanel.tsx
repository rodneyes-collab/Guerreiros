import React, { useCallback, useEffect, useState } from 'react';
import {
  Cpu,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  AlertTriangle,
  Zap,
  Trash2,
  ArrowRightLeft,
  CheckCircle2,
  Clock
} from 'lucide-react';

type AITier = 'ULTRA_LIGHT' | 'BALANCED' | 'DEEP_AUDIT' | 'AUDIO_TRANSCRIBE' | 'TTS';

interface TierPolicyConfig {
  primary: string;
  fallbacks: string[];
  thinkingLevel?: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
}

interface ModelHealth {
  model: string;
  healthy: boolean;
  cooldownRemainingSec: number;
  consecutiveFailures: number;
  lastError?: string;
  totalCalls: number;
  totalErrors: number;
  lastUsedAt?: number;
}

interface ReallocationEvent {
  timestamp: string;
  task: string;
  tier: AITier;
  fromModel: string;
  toModel: string;
  reason: string;
}

interface AIRouterStatusResponse {
  architecture: string;
  policySource: 'default' | 'firestore' | 'runtime_api';
  policyUpdatedAt: string;
  allowedModels: {
    text: string[];
    audio: string[];
    tts: string[];
  };
  policy: Record<AITier, TierPolicyConfig>;
  taskMapping: Record<string, AITier>;
  modelHealth: ModelHealth[];
  metrics: {
    tierCallCounts: Record<AITier, number>;
    cache: {
      entries: number;
      hits: number;
      misses: number;
    };
  };
  recentReallocations: ReallocationEvent[];
}

interface AIRouterPanelProps {
  showNotification: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

const TIER_ORDER: AITier[] = [
  'ULTRA_LIGHT',
  'BALANCED',
  'DEEP_AUDIT',
  'AUDIO_TRANSCRIBE',
  'TTS'
];

const TIER_LABELS: Record<AITier, { title: string; badge: string; accent: string }> = {
  ULTRA_LIGHT: {
    title: 'Camada Econômica (Ultra-Leve)',
    badge: 'MENOR CUSTO',
    accent: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
  },
  BALANCED: {
    title: 'Camada Equilibrada (Tática & Chat)',
    badge: 'EQUILIBRADA',
    accent: 'text-sky-400 border-sky-500/30 bg-sky-500/10'
  },
  DEEP_AUDIT: {
    title: 'Camada Auditoria Profunda',
    badge: 'ALTA PRECISÃO',
    accent: 'text-amber-400 border-amber-500/30 bg-amber-500/10'
  },
  AUDIO_TRANSCRIBE: {
    title: 'Transcrição de Áudio (WhatsApp)',
    badge: 'VOZ → TEXTO',
    accent: 'text-violet-400 border-violet-500/30 bg-violet-500/10'
  },
  TTS: {
    title: 'Locução Esportiva (TTS)',
    badge: 'TEXTO → VOZ',
    accent: 'text-rose-400 border-rose-500/30 bg-rose-500/10'
  }
};

const MODEL_FRIENDLY_LABELS: Record<string, string> = {
  'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite (Mais barato & rápido)',
  'gemini-4-hydrogen': 'Gemini 4 Hydrogen (Equilibrado & analítico)',
  'gemini-3.5-transcribe': 'Gemini 3.5 Transcribe (Áudio dedicado)',
  'gemini-3.8-flash-lite-tts': 'Gemini 3.8 Flash Lite TTS (Voz dedicada)'
};

const THINKING_OPTIONS: Record<string, Array<{ value: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH'; label: string }>> = {
  'gemini-3.1-flash-lite': [
    { value: 'MINIMAL', label: 'Mínimo (Mais econômico)' },
    { value: 'LOW', label: 'Baixo' }
  ],
  'gemini-4-hydrogen': [
    { value: 'LOW', label: 'Baixo (Padrão rápido)' },
    { value: 'MEDIUM', label: 'Médio (Auditoria)' },
    { value: 'HIGH', label: 'Alto (Profundo)' }
  ]
};

export const AIRouterPanel: React.FC<AIRouterPanelProps> = ({ showNotification }) => {
  const [status, setStatus] = useState<AIRouterStatusResponse | null>(null);
  const [draftPolicy, setDraftPolicy] = useState<Record<AITier, TierPolicyConfig> | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [hasChanges, setHasChanges] = useState<boolean>(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/ai/router-policy', { cache: 'no-store' });
      if (!resp.ok) throw new Error('Falha ao consultar roteador');
      const data = (await resp.json()) as AIRouterStatusResponse;
      setStatus(data);
      setDraftPolicy(JSON.parse(JSON.stringify(data.policy)));
      setHasChanges(false);
    } catch {
      showNotification('Não foi possível carregar o painel do Roteador Multi-Modelo.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const getAllowedForTier = (tier: AITier): string[] => {
    if (!status) return [];
    if (tier === 'TTS') return status.allowedModels.tts;
    if (tier === 'AUDIO_TRANSCRIBE') return status.allowedModels.audio;
    return status.allowedModels.text;
  };

  const updateTierPrimary = (tier: AITier, newPrimary: string) => {
    if (!draftPolicy) return;
    const allowed = getAllowedForTier(tier);
    const otherModels = allowed.filter((m) => m !== newPrimary);
    const currentThinking = draftPolicy[tier].thinkingLevel;
    let adjustedThinking = currentThinking;

    if (newPrimary === 'gemini-4-hydrogen' && currentThinking === 'MINIMAL') {
      adjustedThinking = 'LOW';
    } else if (newPrimary === 'gemini-3.1-flash-lite' && (currentThinking === 'MEDIUM' || currentThinking === 'HIGH')) {
      adjustedThinking = 'LOW';
    }

    setDraftPolicy({
      ...draftPolicy,
      [tier]: {
        ...draftPolicy[tier],
        primary: newPrimary,
        fallbacks: otherModels,
        ...(draftPolicy[tier].thinkingLevel ? { thinkingLevel: adjustedThinking } : {})
      }
    });
    setHasChanges(true);
  };

  const updateTierThinking = (tier: AITier, thinkingLevel: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH') => {
    if (!draftPolicy) return;
    setDraftPolicy({
      ...draftPolicy,
      [tier]: {
        ...draftPolicy[tier],
        thinkingLevel
      }
    });
    setHasChanges(true);
  };

  const handleSavePolicy = async () => {
    if (!draftPolicy) return;
    setSaving(true);
    try {
      const payload: Record<string, any> = {};
      TIER_ORDER.forEach((tier) => {
        payload[tier] = {
          primary: draftPolicy[tier].primary,
          fallbacks: draftPolicy[tier].fallbacks,
          ...(draftPolicy[tier].thinkingLevel ? { thinkingLevel: draftPolicy[tier].thinkingLevel } : {})
        };
      });

      const resp = await fetch('/api/ai/router-policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policy: payload })
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        showNotification(data.details?.join(' ') || data.error || 'Erro ao salvar política.', 'error');
        return;
      }
      setStatus(data.status);
      setDraftPolicy(JSON.parse(JSON.stringify(data.status.policy)));
      setHasChanges(false);
      showNotification('Política do Roteador Multi-Modelo atualizada em tempo real!', 'success');
    } catch {
      showNotification('Erro de rede ao salvar a política de IA.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefault = async () => {
    setSaving(true);
    try {
      const resp = await fetch('/api/ai/router-policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true })
      });
      const data = await resp.json();
      if (resp.ok && data.ok) {
        setStatus(data.status);
        setDraftPolicy(JSON.parse(JSON.stringify(data.status.policy)));
        setHasChanges(false);
        showNotification('Política restaurada para o padrão econômico recomendado!', 'success');
      }
    } catch {
      showNotification('Erro ao restaurar padrão do roteador.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleClearCache = async () => {
    setSaving(true);
    try {
      const resp = await fetch('/api/ai/router-policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearCache: true })
      });
      const data = await resp.json();
      if (resp.ok && data.ok) {
        setStatus(data.status);
        showNotification(`Cache limpo (${data.clearedCacheEntries || 0} entradas removidas).`, 'info');
      }
    } catch {
      showNotification('Erro ao limpar cache da IA.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const totalCalls = status
    ? Object.values(status.metrics.tierCallCounts).reduce((acc, n) => acc + n, 0)
    : 0;
  const healthyModelsCount = status
    ? status.modelHealth.filter((m) => m.healthy).length
    : 0;
  const totalModelsCount = status ? status.modelHealth.length : 0;

  return (
    <section
      id="admin-ai-router-panel"
      className="bg-black backdrop-blur-xl p-6 md:p-8 rounded-[2.5rem] border border-white/10 border-l-[8px] border-l-brand-primary shadow-2xl text-white space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-brand-primary/10 rounded-2xl flex items-center justify-center border border-brand-primary/40 shrink-0">
            <Cpu className="w-6 h-6 text-brand-primary" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-black uppercase tracking-tight text-white">
                Roteador Multi-Modelo de IA
              </h3>
              <span className="px-2.5 py-0.5 bg-emerald-500/15 text-emerald-400 text-[9px] font-black uppercase rounded-lg border border-emerald-500/30">
                Auto-Failover Ativo
              </span>
              {status && (
                <span className="px-2.5 py-0.5 bg-white/5 text-white/60 text-[9px] font-bold uppercase rounded-lg border border-white/10">
                  Origem:{' '}
                  {status.policySource === 'default'
                    ? 'Padrão'
                    : status.policySource === 'firestore'
                    ? 'Firestore'
                    : 'Ajuste Runtime'}
                </span>
              )}
            </div>
            <p className="text-[11px] font-semibold text-white/50 mt-1 max-w-2xl">
              Aloque modelos mais econômicos para tarefas simples e troque modelos em tempo real sem republicar o app. Se algum modelo atingir cota ou instabilidade, o disjuntor realoca automaticamente.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={loadStatus}
            disabled={loading || saving}
            className="px-3.5 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl font-black uppercase text-[10px] tracking-wider border border-white/10 flex items-center gap-1.5 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <button
            type="button"
            onClick={handleClearCache}
            disabled={loading || saving}
            className="px-3.5 py-2.5 bg-white/5 hover:bg-white/10 text-white/80 rounded-xl font-black uppercase text-[10px] tracking-wider border border-white/10 flex items-center gap-1.5 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5 text-amber-400" />
            Limpar Cache
          </button>
          <button
            type="button"
            onClick={handleResetDefault}
            disabled={loading || saving}
            className="px-3.5 py-2.5 bg-white/5 hover:bg-white/10 text-white/80 rounded-xl font-black uppercase text-[10px] tracking-wider border border-white/10 flex items-center gap-1.5 transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5 text-sky-400" />
            Padrão
          </button>
          <button
            type="button"
            onClick={handleSavePolicy}
            disabled={!hasChanges || saving}
            className={`px-4 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-wider flex items-center gap-1.5 transition-all ${
              hasChanges
                ? 'bg-brand-primary text-black shadow-lg hover:brightness-110'
                : 'bg-white/5 text-white/30 border border-white/5 cursor-not-allowed'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Salvando...' : 'Salvar Realocação'}
          </button>
        </div>
      </div>

      {/* KPIs */}
      {status && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Chamadas Roteadas</p>
            <p className="text-2xl font-black font-mono text-white mt-1">{totalCalls}</p>
            <p className="text-[10px] text-emerald-400/90 font-semibold mt-0.5">
              {status.metrics.tierCallCounts.ULTRA_LIGHT || 0} na camada econômica
            </p>
          </div>

          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Saúde dos Modelos</p>
            <p className="text-2xl font-black font-mono text-emerald-400 mt-1">
              {healthyModelsCount}/{totalModelsCount}
            </p>
            <p className="text-[10px] text-white/50 font-semibold mt-0.5">
              {healthyModelsCount === totalModelsCount ? 'Todos operacionais' : 'Disjuntor atuando'}
            </p>
          </div>

          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Economia por Cache</p>
            <p className="text-2xl font-black font-mono text-brand-primary mt-1">
              {status.metrics.cache.hits} hits
            </p>
            <p className="text-[10px] text-white/50 font-semibold mt-0.5">
              {status.metrics.cache.entries} respostas em memória (0 tokens)
            </p>
          </div>

          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Realocações Auto</p>
            <p className="text-2xl font-black font-mono text-sky-400 mt-1">
              {status.recentReallocations.length}
            </p>
            <p className="text-[10px] text-white/50 font-semibold mt-0.5">
              Trocas por cota/sobrecarga
            </p>
          </div>
        </div>
      )}

      {/* Matriz de Camadas Editável */}
      {draftPolicy && status && (
        <div className="space-y-3">
          <h4 className="text-xs font-black uppercase tracking-widest text-white/60 flex items-center gap-2">
            <Zap className="w-4 h-4 text-brand-primary" />
            Alocação por Camada de Trabalho
          </h4>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {TIER_ORDER.map((tier) => {
              const cfg = draftPolicy[tier];
              const meta = TIER_LABELS[tier];
              const allowed = getAllowedForTier(tier);
              const thinkingOpts = THINKING_OPTIONS[cfg.primary];
              const tierCalls = status.metrics.tierCallCounts[tier] || 0;

              return (
                <div
                  key={tier}
                  className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 space-y-3 hover:border-white/20 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-black text-white">{meta.title}</span>
                        <span className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-md border ${meta.accent}`}>
                          {meta.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-white/50 mt-1 leading-relaxed">{cfg.description}</p>
                    </div>
                    <span className="text-[10px] font-mono font-black text-white/50 bg-black/50 px-2 py-1 rounded-lg border border-white/10 shrink-0">
                      {tierCalls}x
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block">
                        Modelo Principal
                      </label>
                      <select
                        value={cfg.primary}
                        disabled={allowed.length <= 1 || saving}
                        onChange={(e) => updateTierPrimary(tier, e.target.value)}
                        className="w-full bg-zinc-950 border border-white/15 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:border-brand-primary disabled:opacity-60"
                      >
                        {allowed.map((m) => (
                          <option key={m} value={m} className="bg-zinc-950 text-white">
                            {MODEL_FRIENDLY_LABELS[m] || m}
                          </option>
                        ))}
                      </select>
                    </div>

                    {thinkingOpts ? (
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block">
                          Nível de Raciocínio
                        </label>
                        <select
                          value={cfg.thinkingLevel || thinkingOpts[0].value}
                          disabled={saving}
                          onChange={(e) =>
                            updateTierThinking(tier, e.target.value as 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH')
                          }
                          className="w-full bg-zinc-950 border border-white/15 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:border-brand-primary"
                        >
                          {thinkingOpts.map((opt) => (
                            <option key={opt.value} value={opt.value} className="bg-zinc-950 text-white">
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block">
                          Cadeia de Fallback
                        </label>
                        <div className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[11px] font-mono text-white/70 truncate">
                          {cfg.fallbacks.length > 0 ? cfg.fallbacks.join(' → ') : 'Modelo dedicado único'}
                        </div>
                      </div>
                    )}
                  </div>

                  {thinkingOpts && cfg.fallbacks.length > 0 && (
                    <div className="text-[10px] text-white/45 flex items-center gap-1.5 pt-0.5">
                      <ArrowRightLeft className="w-3 h-3 text-brand-primary/80" />
                      <span>Fallback automático em caso de erro/cota:</span>
                      <span className="font-mono font-bold text-white/80">{cfg.fallbacks.join(' → ')}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Saúde Individual dos Modelos & Log de Realocações */}
      {status && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-white/10">
          <div className="space-y-2.5">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-white/50 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Monitor de Saúde & Disjuntor
            </h4>
            <div className="space-y-2">
              {status.modelHealth.map((m) => (
                <div
                  key={m.model}
                  className="bg-white/[0.03] border border-white/10 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-mono font-bold text-white truncate">{m.model}</p>
                    <p className="text-[10px] text-white/45">
                      {m.totalCalls} chamadas · {m.totalErrors} erros
                      {m.lastError ? ` · Último: ${m.lastError.slice(0, 50)}` : ''}
                    </p>
                  </div>
                  {m.healthy ? (
                    <span className="px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[9px] font-black uppercase flex items-center gap-1 shrink-0">
                      <CheckCircle2 className="w-3 h-3" /> Operacional
                    </span>
                  ) : (
                    <span className="px-2 py-1 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/30 text-[9px] font-black uppercase flex items-center gap-1 shrink-0">
                      <Clock className="w-3 h-3" /> Quarentena {m.cooldownRemainingSec}s
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-white/50 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              Histórico de Realocações Automáticas
            </h4>
            {status.recentReallocations.length === 0 ? (
              <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 text-xs text-white/50">
                Nenhuma realocação de emergência necessária até o momento — todos os modelos principais estão respondendo normalmente.
              </div>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {status.recentReallocations.map((ev, idx) => (
                  <div
                    key={`${ev.timestamp}_${idx}`}
                    className="bg-amber-500/5 border border-amber-500/20 rounded-xl px-3.5 py-2 text-[11px]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-black uppercase text-amber-300">{ev.task}</span>
                      <span className="text-[10px] font-mono text-white/40">
                        {new Date(ev.timestamp).toLocaleTimeString('pt-BR')}
                      </span>
                    </div>
                    <p className="font-mono text-white/85 mt-0.5">
                      {ev.fromModel} → {ev.toModel}
                    </p>
                    <p className="text-[10px] text-white/50 truncate">{ev.reason}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
