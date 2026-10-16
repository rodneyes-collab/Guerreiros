import { SyncFrequencyMode, SyncModeOption } from '../../types';

export const SYNC_MODE_OPTIONS: SyncModeOption[] = [
  {
    id: 'realtime',
    label: 'Tempo Real (Instantâneo)',
    shortLabel: 'Tempo Real',
    description: 'Conexão aberta via WebSocket contínua. Alterações e placar atualizam no exato segundo que acontecem.',
    intervalSeconds: 0,
    batteryImpact: 'high',
    batteryLabel: 'Maior Consumo',
    networkImpact: 'high',
    recommendedFor: 'Mesa de súmula, placar ao vivo e telões'
  },
  {
    id: 'interval_15s',
    label: 'Intervalo Fixo 15s (Rápido)',
    shortLabel: '15 Segundos',
    description: 'Sincroniza a cada 15 segundos. Reduz o consumo em 40% mantendo excelente agilidade na quadra.',
    intervalSeconds: 15,
    batteryImpact: 'medium',
    batteryLabel: 'Consumo Médio',
    networkImpact: 'medium',
    recommendedFor: 'Jogadores em quadra e aquecimento'
  },
  {
    id: 'interval_30s',
    label: 'Intervalo Fixo 30s (Recomendado)',
    shortLabel: '30s (Equilibrado)',
    description: 'Sincroniza a cada 30 segundos. Reduz até 70% do consumo de bateria e de dados móveis 4G/5G.',
    intervalSeconds: 30,
    batteryImpact: 'low',
    batteryLabel: 'Baixo Consumo',
    networkImpact: 'low',
    recommendedFor: 'Recomendado para a maioria dos sócios no celular'
  },
  {
    id: 'interval_60s',
    label: 'Intervalo Fixo 1 Minuto (Econômico)',
    shortLabel: '1 Minuto',
    description: 'Sincroniza a cada 1 minuto. Grande preservação de bateria para celulares com uso prolongado.',
    intervalSeconds: 60,
    batteryImpact: 'minimal',
    batteryLabel: 'Ultra Econômico',
    networkImpact: 'minimal',
    recommendedFor: 'Dias longos de racha ou bateria fraca'
  },
  {
    id: 'interval_300s',
    label: 'Intervalo Fixo 5 Minutos (Eco Max)',
    shortLabel: '5 Minutos',
    description: 'Sincroniza a cada 5 minutos. Ideal para quem quer apenas acompanhar de longe sem gastar bateria.',
    intervalSeconds: 300,
    batteryImpact: 'minimal',
    batteryLabel: 'Máxima Economia',
    networkImpact: 'minimal',
    recommendedFor: 'Preservação extrema de bateria'
  },
  {
    id: 'manual',
    label: 'Sob Demanda (Manual)',
    shortLabel: 'Manual',
    description: 'Zero conexões em segundo plano. Sincroniza apenas ao tocar em "Sincronizar Agora" ou ao reabrir o app.',
    intervalSeconds: 0,
    batteryImpact: 'none',
    batteryLabel: 'Zero Bateria Extra',
    networkImpact: 'none',
    recommendedFor: 'Economia total de dados e bateria'
  }
];

export const getSyncModeDetails = (mode: SyncFrequencyMode): SyncModeOption => {
  return SYNC_MODE_OPTIONS.find(opt => opt.id === mode) || SYNC_MODE_OPTIONS[0];
};

export const formatTimeSince = (timestamp: number | null): string => {
  if (!timestamp) return 'Aguardando sincronização';
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 5) return 'Agora mesmo';
  if (diffSec < 60) return `Há ${diffSec}s atrás`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Há ${diffMin} min atrás`;
  const diffHours = Math.floor(diffMin / 60);
  return `Há ${diffHours}h atrás`;
};
