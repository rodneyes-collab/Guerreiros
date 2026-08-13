import React, { useState, useEffect, useRef } from 'react';
import { Cpu, Save, Signal, Play, RefreshCw, Check, AlertTriangle, Sparkles, Sliders, Info, Radio } from 'lucide-react';
import { useStore } from '../store';

interface SensorCalibrationCardProps {
  systemMetadata: any;
  updateSystemMetadata: (metadata: any) => Promise<void> | void;
}

export const SensorCalibrationCard: React.FC<SensorCalibrationCardProps> = ({
  systemMetadata,
  updateSystemMetadata,
}) => {
  const showNotification = useStore(state => state.showNotification);
  const currentBeaconRssi = useStore(state => state.currentBeaconRssi);
  const [calibrationState, setCalibrationState] = useState<'IDLE' | 'COLLECTING' | 'COMPLETED'>('IDLE');
  const [samples, setSamples] = useState<number[]>([]);
  const [maxSamples] = useState<number>(20); // 20 readings at 500ms = exactly 10 seconds
  const [countdown, setCountdown] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);
  
  // Suggested threshold based on stats
  const [stats, setStats] = useState<{
    min: number;
    max: number;
    avg: number;
    stdDev: number;
    suggested: number;
    discardedCount: number;
    totalSamples: number;
  } | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Stop calibration on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const activeRssi = (currentBeaconRssi !== null && currentBeaconRssi > -100 ? currentBeaconRssi : -100);

  const startCalibration = () => {
    if (currentBeaconRssi === null || currentBeaconRssi <= -100) {
      showNotification('Nenhum sinal físico de Beacon pareado. Ative o Scanner ou conecte um Bluetooth Beacon primeiro no painel acima.', 'error');
      return;
    }

    setCalibrationState('COLLECTING');
    setSamples([]);
    setCountdown(maxSamples);
    setStats(null);

    let currentSamples: number[] = [];
    let countLeft = maxSamples;
    
    timerRef.current = setInterval(() => {
      let currentReading = currentBeaconRssi !== null ? currentBeaconRssi : -85;

      currentSamples.push(currentReading);
      setSamples([...currentSamples]);
      
      countLeft -= 1;
      setCountdown(countLeft);

      if (countLeft <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        calculateCalibrationResults(currentSamples);
      }
    }, 500);
  };

  const calculateCalibrationResults = (collectedSamples: number[]) => {
    if (collectedSamples.length === 0) {
      setCalibrationState('IDLE');
      return;
    }

    // Sort to perform noise filtering and remove extreme peaks/drops (multi-path fading)
    const sorted = [...collectedSamples].sort((a, b) => a - b);
    
    // Ignore top 15% and bottom 15% to absolutely capture the stable average
    let filteredSamples = [...collectedSamples];
    let discardedCount = 0;
    if (collectedSamples.length >= 6) {
      const trimCount = Math.floor(collectedSamples.length * 0.15) || 1;
      filteredSamples = sorted.slice(trimCount, sorted.length - trimCount);
      discardedCount = trimCount * 2;
    }

    const min = Math.min(...filteredSamples);
    const max = Math.max(...filteredSamples);
    const sum = filteredSamples.reduce((a, b) => a + b, 0);
    const avg = Math.round(sum / filteredSamples.length);
    
    // Calculate standard deviation for noise representation on the filtered set
    const variance = filteredSamples.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / filteredSamples.length;
    const stdDev = parseFloat(Math.sqrt(variance).toFixed(1));

    // Suggested calculation formula uses the robust average of non-spike signals
    const suggestedValue = Math.max(-95, Math.min(-35, avg));

    setStats({
      min,
      max,
      avg,
      stdDev,
      suggested: suggestedValue,
      discardedCount,
      totalSamples: collectedSamples.length,
    });
    setCalibrationState('COMPLETED');
    showNotification(`Calibração de antena concluída! Foram ignorados ${discardedCount} picos de ruído e o novo limiar ideal sugerido é ${suggestedValue} dBm.`, 'success');
  };

  const handleApplyThreshold = async () => {
    if (!stats) return;
    setIsSaving(true);
    try {
      await updateSystemMetadata({ bleProximityThreshold: stats.suggested });
      showNotification(`Excelente! Novo Threshold ajustado para ${stats.suggested} dBm com base no teste de campo real.`, 'success');
    } catch (error) {
      console.error(error);
      showNotification('Instabilidade temporária ao salvar o novo Threshold.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const currentProgress = ((samples.length / maxSamples) * 100);

  return (
    <section className="bg-black backdrop-blur-xl p-8 rounded-[2.5rem] border border-brand-primary/40 border-l-[8px] border-l-brand-primary space-y-6 shadow-2xl relative overflow-hidden">
      {/* Decorative background element */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header and Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-brand-primary/40 text-brand-primary shadow-inner">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h3 className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
              Calibração de Sensor <span className="text-[9px] bg-brand-primary/10 text-brand-primary px-2 py-0.5 rounded font-black border border-brand-primary/30 tracking-widest">LIVE</span>
            </h3>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
              Sintonize o distanciômetro de rádio no ponto exato da quadra
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Instructions and State Machine */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white/5 p-5 rounded-3xl border border-white/5 space-y-3">
            <div className="flex items-start gap-3">
              <Info className="w-4 h-4 text-brand-primary shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="text-[10px] font-black tracking-widest uppercase text-brand-primary block">
                  Como calibrar em campo de jogo:
                </span>
                <p className="text-[9px] text-white/60 uppercase leading-relaxed">
                  1. Posicione o Bluetooth Beacon no <span className="text-white font-bold">ponto exato do limite da quadra</span> onde o check-in deve ser autorizado mais distante (geralmente banco de reservas ou entrada oficial).
                </p>
                <p className="text-[9px] text-white/60 uppercase leading-relaxed">
                  2. Certifique-se de que a antena física está conectada no painel acima ou ative o Simulador para testar o algoritmo.
                </p>
                <p className="text-[9px] text-white/60 uppercase leading-relaxed">
                  3. Clique em <span className="text-white font-bold">Iniciar Calibração</span>. O sistema coletará amostras em tempo real por 10 segundos (20 amostras de rádio), filtrará inteligentemente ruídos e picos de sinal, e sugerirá o limiar ideal de validação.
                </p>
              </div>
            </div>
          </div>

          {/* Interactive signal display gauge */}
          <div className="bg-[#050505] p-5 rounded-3xl border border-white/5 flex flex-col items-center justify-center py-6 text-center space-y-4 relative overflow-hidden">
            {/* Pulsing visual circles representing radio waves */}
            <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
              <div className={`border-2 border-brand-primary rounded-full transition-all duration-1000 ${calibrationState === 'COLLECTING' ? 'animate-[ping_1.5s_infinite] w-48 h-48' : 'w-24 h-24'}`} />
              <div className={`border-2 border-brand-primary rounded-full absolute transition-all duration-1000 ${calibrationState === 'COLLECTING' ? 'animate-[ping_2.5s_infinite] w-64 h-64' : 'w-16 h-16'}`} />
            </div>

            <div className="relative">
              <span className="text-[9px] font-black tracking-widest text-white/40 block mb-1 uppercase">
                Sinal de Captação Atual
              </span>
              <div className="text-3xl font-black text-white font-mono tracking-tighter flex items-baseline justify-center gap-1">
                {activeRssi > -100 ? `${activeRssi}` : '---'}{' '}
                <span className="text-xs text-brand-primary font-bold">dBm</span>
              </div>
            </div>

            {/* Collecting bar or action */}
            {calibrationState === 'IDLE' && (
              <button
                type="button"
                onClick={startCalibration}
                className="px-6 py-2 bg-brand-primary text-black font-black uppercase text-[10px] tracking-widest rounded-xl hover:scale-[1.03] transition-all duration-300 flex items-center gap-2"
              >
                <Play className="w-3.5 h-3.5 fill-black" /> Iniciar Calibração
              </button>
            )}

            {calibrationState === 'COLLECTING' && (
              <div className="w-full space-y-2 max-w-xs relative z-10">
                <div className="flex justify-between items-center text-[8px] font-black uppercase text-brand-primary tracking-widest">
                  <span>Sintonizando Antena...</span>
                  <span>Amostra {samples.length}/{maxSamples}</span>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/10">
                  <div 
                    className="h-full bg-brand-primary transition-all duration-300 ease-out"
                    style={{ width: `${currentProgress}%` }}
                  />
                </div>
                {/* Showing collected bar items */}
                <div className="flex gap-1 justify-center h-4 items-end mt-1 overflow-hidden">
                  {samples.map((val, idx) => (
                    <div 
                      key={idx}
                      className="w-1.5 bg-brand-primary rounded-t"
                      style={{ height: `${Math.min(100, Math.max(10, (val + 100) / 0.7))}%` }}
                    />
                  ))}
                </div>
              </div>
            )}

            {calibrationState === 'COMPLETED' && (
              <button
                type="button"
                onClick={startCalibration}
                className="px-5 py-2 border border-white/20 hover:border-brand-primary text-white hover:text-brand-primary font-black uppercase text-[9px] tracking-wider rounded-xl transition-all duration-300 flex items-center gap-1.5"
              >
                <RefreshCw className="w-3 h-3" /> Recomeçar Medição
              </button>
            )}
          </div>
        </div>

        {/* Right Column: Calibration Results or Stats Card */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white/5 p-6 rounded-[2rem] border border-white/5 h-full flex flex-col justify-between space-y-6">
            <div>
              <span className="text-[10px] font-black tracking-widest uppercase text-white/50 block mb-3 border-b border-white/5 pb-2">
                Estatísticas Coletadas
              </span>

              {stats ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 font-mono">
                    <div className="bg-black/50 p-2.5 rounded-xl border border-white/5">
                      <span className="text-[7.5px] uppercase tracking-wider text-white/40 block">Menor Sinal (Fraco)</span>
                      <span className="text-sm font-black text-white">{stats.min} dBm</span>
                    </div>
                    <div className="bg-black/50 p-2.5 rounded-xl border border-white/5">
                      <span className="text-[7.5px] uppercase tracking-wider text-white/40 block">Maior Sinal (Forte)</span>
                      <span className="text-sm font-black text-brand-primary">{stats.max} dBm</span>
                    </div>
                    <div className="bg-black/50 p-2.5 rounded-xl border border-white/5">
                      <span className="text-[7.5px] uppercase tracking-wider text-white/40 block">Média Aritmética</span>
                      <span className="text-sm font-black text-white">{stats.avg} dBm</span>
                    </div>
                    <div className="bg-black/50 p-2.5 rounded-xl border border-white/5">
                      <span className="text-[7.5px] uppercase tracking-wider text-white/40 block">Desvio do Ruído (STD)</span>
                      <span className="text-sm font-black text-muted-foreground">{stats.stdDev} dB</span>
                    </div>
                  </div>

                  <div className="bg-brand-primary/10 p-4 rounded-2xl border border-brand-primary/30 space-y-2">
                    <div className="flex items-center gap-1.5 text-brand-primary">
                      <Sparkles className="w-4 h-4" />
                      <span className="text-[9px] font-black uppercase tracking-widest">Recomendação Inteligente</span>
                    </div>
                    <p className="text-[8.5px] text-white/60 uppercase leading-normal">
                      Com base em {stats.totalSamples} amostras reais de sinal captadas no ponto limite da quadra, o sistema ignorou <span className="text-white font-bold">{stats.discardedCount} picos extremos de ruído</span> e calculou a média estável. Sugerimos sintonizar o threshold em <span className="text-white font-bold">{stats.suggested} dBm</span>.
                    </p>
                    <div className="text-lg font-black font-mono text-brand-primary flex items-baseline gap-1 mt-1 pt-1 border-t border-brand-primary/15 uppercase">
                      Limiar Sugerido:{' '}
                      <span className="text-2xl text-white font-black">{stats.suggested}</span>
                      <span className="text-xs">dBm</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center bg-black/40 rounded-2xl border border-dashed border-white/10 text-white/30 h-48 uppercase">
                  <Sliders className="w-8 h-8 opacity-25 mb-2 text-brand-primary" />
                  <p className="text-[8px] font-black tracking-widest">Nenhuma calibração ativa no momento</p>
                  <p className="text-[7.5px] mt-1 leading-normal max-w-[180px]">Inicie o distanciômetro de rádio de 10 segundos à esquerda</p>
                </div>
              )}
            </div>

            {stats && (
              <button
                type="button"
                onClick={handleApplyThreshold}
                disabled={isSaving}
                className="w-full py-3 bg-brand-primary text-black font-black uppercase text-[10px] tracking-widest rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-brand-primary/25 shadow-md"
              >
                {isSaving ? (
                  <>Sintonizando...</>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5 stroke-[3]" /> Aplicar Novo Limiar ({stats.suggested} dBm)
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
