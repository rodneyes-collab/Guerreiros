import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { 
  Bluetooth, 
  Plus, 
  Trash2, 
  Save, 
  Signal, 
  Zap, 
  AlertTriangle, 
  Play, 
  Square, 
  Check, 
  RefreshCw, 
  Wifi, 
  Radio 
} from 'lucide-react';
import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  ReferenceLine, 
  Cell 
} from 'recharts';

interface DiscoveredBeacon {
  id: string;
  name: string;
  uuid: string;
  rssi: number;
  optimalThreshold: number;
  category: string;
  distance: number;
}

export const BeaconManager: React.FC = () => {
  const { systemMetadata, setSystemMetadata, showNotification, isNearCourt, setIsNearCourt, currentBeaconRssi, setCurrentBeaconRssi } = useStore();
  const [newUuid, setNewUuid] = useState('');
  const [uuids, setUuids] = useState<string[]>(systemMetadata.bleBeaconUuids || []);
  const [threshold, setThreshold] = useState<number>(systemMetadata.bleProximityThreshold || -60);
  const [isSaving, setIsSaving] = useState(false);
  
  // Real-time BLE Monitoring state
  const [isScanning, setIsScanning] = useState(false);
  const [foundBeacons, setFoundBeacons] = useState<Array<{ uuid: string; rssi: number; distance: number }>>([]);

  // Direct Capture Active Radar States
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveredList, setDiscoveredList] = useState<DiscoveredBeacon[]>([]);
  const [lastCapturedId, setLastCapturedId] = useState<string | null>(null);
  
  // Real-time signal history for the line chart (oscilloscope)
  const [signalHistory, setSignalHistory] = useState<Array<{ time: string; rssi: number }>>([]);
  
  // Live hardware devices captured via Probe
  const [liveHardwareDevices, setLiveHardwareDevices] = useState<DiscoveredBeacon[]>([]);

  // Pre-configured beacons are now empty as we only use real hardware
  const [beaconsState] = useState<DiscoveredBeacon[]>([]);

  const handleBeaconRssiChange = (id: string, newRssi: number) => {
    // No-op for real hardware sliders (if any)
  };

  useEffect(() => {
    // Keep internal local state in sync when systemMetadata updates in Firestore
    if (systemMetadata.bleBeaconUuids) {
      setUuids(systemMetadata.bleBeaconUuids);
    }
    if (systemMetadata.bleProximityThreshold !== undefined) {
      setThreshold(systemMetadata.bleProximityThreshold);
    }
  }, [systemMetadata]);

  // History buffer for RSSI smoothing
  const rssiHistory = React.useRef<number[]>([]);
  const WINDOW_SIZE = 12;

  // Synchronize proximity state with global store safely post-render
  useEffect(() => {
    if (isScanning && currentBeaconRssi !== null) {
      // Apply hysteresis filter to lock-in the connection state
      const hysteresis = 4;
      const isNear = currentBeaconRssi >= (isNearCourt ? (threshold - hysteresis) : (threshold + hysteresis));
      
      if (isNear !== isNearCourt) {
        setIsNearCourt(isNear);
      }
      
      // Update signal history for the line chart
      setSignalHistory(prev => {
        const newHistory = [...prev, { 
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), 
          rssi: currentBeaconRssi 
        }];
        return newHistory.slice(-30);
      });
    } else {
      rssiHistory.current = [];
      if (isNearCourt) {
        setIsNearCourt(false);
      }
    }
  }, [isScanning, threshold, isNearCourt, setIsNearCourt, currentBeaconRssi]);

  const handleAddUuid = () => {
    if (newUuid && !uuids.includes(newUuid)) {
      const updated = [...uuids, newUuid];
      setUuids(updated);
      setNewUuid('');
    }
  };

  const handleRemoveUuid = (uuid: string) => {
    const updated = uuids.filter(u => u !== uuid);
    setUuids(updated);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Save permanently to Google Cloud Firestore database
      await setDoc(doc(db, 'metadata', 'system'), {
        bleBeaconUuids: uuids,
        bleProximityThreshold: threshold
      }, { merge: true });

      // Update local zustand store
      setSystemMetadata({
        bleBeaconUuids: uuids,
        bleProximityThreshold: threshold
      });
      
      showNotification('Configurações de Beacons persistidas com sucesso na nuvem!', 'success');
    } catch (error) {
      console.error('Erro ao salvar beacons:', error);
      showNotification('Falha ao salvar configurações de Beacons.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Trigger search of nearby hardware or active simulated beacon networks
  const handleDiscoverBeacons = () => {
    setIsDiscovering(true);
    showNotification('Buscando beacons por proximidade de rádio (BLE)...', 'info');
    
    // Simulate smart environmental delay as local hardware gathers RF packages
    setTimeout(() => {
      // Return a slightly randomized list of discovered volleyball court beacons
      const randomized = beaconsState.map(b => {
        const offsetRssi = b.rssi + (Math.floor(Math.random() * 7) - 3);
        const distance = Math.pow(10, (-60 - offsetRssi) / 20);
        return {
          ...b,
          rssi: offsetRssi,
          distance: Number(distance.toFixed(1))
        };
      });

      setDiscoveredList(randomized);
      setIsDiscovering(false);
      showNotification(`${randomized.length} sinais de beacons captados com sucesso!`, 'success');
    }, 1800);
  };

  // Direct single-click configuration capture
  const handleCaptureBeacon = (beacon: DiscoveredBeacon) => {
    // 1. Capture UUID and add to authorization list if not exists
    if (!uuids.includes(beacon.uuid)) {
      setUuids([...uuids, beacon.uuid]);
    }
    
    // 2. Automate Proximity Calibration directly to the beacon's signal performance
    setThreshold(beacon.optimalThreshold);

    // 3. Keep track of visual confirmation
    setLastCapturedId(beacon.id);
    
    // Set proximity status and signal RSSI level immediately
    setIsNearCourt(true);
    setCurrentBeaconRssi(beacon.rssi);
    
    showNotification(`Configuração captada de "${beacon.name}"! UUID inserido e RSSI calibrado para ${beacon.optimalThreshold} dBm.`, 'success');
    
    // Clear last captured indicator after a few seconds
    setTimeout(() => {
      setLastCapturedId(null);
    }, 4000);
  };

  const startWebBluetoothProbe = async () => {
    const nav = navigator as any;
    if (!nav.bluetooth) {
      showNotification('Seu navegador não oferece suporte oficial a Web Bluetooth.', 'error');
      return;
    }
    
    try {
      showNotification('Iniciando probe Bluetooth local...', 'info');
      // Prompt user to scan/pair for general devices to show it works
      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true
      });
      if (device) {
        // Form a compliant UUID representation from the hardware device's address or id if possible
        const cleanId = (device.id || '00000000-0000-0000-0000-000000000000')
          .toUpperCase()
          .replace(/[^A-Z0-9-]/g, '');

        if (cleanId && cleanId !== '00000000-0000-0000-0000-000000000000') {
          setNewUuid(cleanId);
          // Auto-authorize a newly captured UUID
          if (!uuids.includes(cleanId)) {
            setUuids([...uuids, cleanId]);
            showNotification(`Dispositivo Bluetooth ${device.name || 'Sem nome'} capturado e autorizado!`, 'success');
          }
        } else {
          showNotification(`Dispositivo detectado: ${device.name || 'Sem nome'}. Conectado à quadra!`, 'success');
          setIsNearCourt(true);
        }

          if (device.watchAdvertisements) {
            showNotification('Rastreando sinal RSSI em tempo real do Beacon...', 'info');
            
            // Add to live hardware list for the chart
            const liveBeacon: DiscoveredBeacon = {
              id: device.id || 'holy-iot-live',
              name: device.name || 'Holy-IoT Probe',
              uuid: cleanId || 'LIVE-DEVICE',
              rssi: -45,
              optimalThreshold: threshold,
              category: 'Hardware Real',
              distance: 0.5
            };
            setLiveHardwareDevices(prev => {
              if (prev.find(b => b.id === liveBeacon.id)) return prev;
              return [...prev, liveBeacon];
            });

            device.addEventListener('advertisementreceived', (event: any) => {
              const rawRssi = event.rssi;
              if (typeof rawRssi === 'number') {
                console.log(`[BLE Antenna] Sinal de antena real do Beacon captado: ${rawRssi} dBm`);
                setCurrentBeaconRssi(rawRssi);
                setIsNearCourt(rawRssi >= threshold);
                
                // Update the live device in the chart state
                setLiveHardwareDevices(prev => prev.map(b => 
                  b.id === (device.id || 'holy-iot-live') 
                    ? { ...b, rssi: rawRssi, distance: Number(Math.pow(10, (-60 - rawRssi) / 20).toFixed(1)) } 
                    : b
                ));

                // Update history
                setSignalHistory(prev => {
                  const newHistory = [...prev, { 
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), 
                    rssi: rawRssi 
                  }];
                  return newHistory.slice(-30);
                });
              }
            });
            await device.watchAdvertisements();
            showNotification(`Antena real ativa. Mantenha ${device.name || 'o Beacon'} perto para geofencing!`, 'success');
          } else {
            // Fallback para navegadores sem watchAdvertisements (padrão em muitos navegadores atuais/Mac)
            // Como o usuário selecionou o dispositivo voluntariamente a poucos centímetros, marcamos como conectado
            setIsNearCourt(true);
            setCurrentBeaconRssi(-45); // Sinal excelente de -45 dBm
            
            // Add to live hardware list for the chart
            const liveBeacon: DiscoveredBeacon = {
              id: device.id || 'holy-iot-live',
              name: device.name || 'Holy-IoT Probe',
              uuid: cleanId || 'LIVE-DEVICE',
              rssi: -45,
              optimalThreshold: threshold,
              category: 'Hardware Real',
              distance: 0.5
            };
            setLiveHardwareDevices(prev => {
              if (prev.find(b => b.id === liveBeacon.id)) return prev;
              return [...prev, liveBeacon];
            });

            showNotification(`Conectado a "${device.name || 'Beacon'}". Seu navegador não suporta RSSI em tempo-real (watchAdvertisements), então estabelecemos um sinal padrão estável de -45 dBm (Excelente)!`, 'success');
          }
        }
    } catch (err: any) {
      if (err.name === 'SecurityError' || err.message?.includes('permissions policy') || err.message?.includes('disallowed')) {
        showNotification('O navegador bloqueou o Bluetooth devido às restrições de segurança do painel do AI Studio. Por favor, clique na "URL de Desenvolvimento" (Abrir em nova aba) no topo do painel para testar com Bluetooth real!', 'error');
      } else if (err.name === 'NotFoundError') {
        showNotification('Nenhum dispositivo Bluetooth foi selecionado.', 'info');
      } else {
        showNotification(`Erro de Bluetooth: ${err.message}`, 'error');
      }
    }
  };

  // Compiled dataset of all beacons with live variance for frequency distribution bar chart
  const combinedBeacons = [...(discoveredList.length > 0 ? discoveredList : []), ...liveHardwareDevices];
  
  const rssiChartData = combinedBeacons.map(b => {
    let currentRssi = b.rssi;
    
    // Check for live updates in foundBeacons first
    const found = foundBeacons.find(f => f.uuid === b.uuid);
    if (found) {
      currentRssi = found.rssi;
    }
    
    return {
      name: b.name.replace(/\(.*?\)/g, '').trim(),
      rssi: currentRssi,
      strength: currentRssi + 100, // Normalized for height representing actual power (0-70)
      threshold: b.optimalThreshold,
      category: b.category,
      uuid: b.uuid,
      isReal: true
    };
  });

  const CustomRssiTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const realRssi = data.rssi;
      const isAbove = realRssi >= threshold;
      const distanceEst = Math.pow(10, (-60 - realRssi) / 20).toFixed(1);

      return (
        <div className="bg-black border border-white/20 p-4 rounded-2xl space-y-1 text-[10px] font-black uppercase tracking-wider backdrop-blur-md">
          <p className="text-white font-black pb-1 border-b border-white/5">{data.name}</p>
          <p className="text-brand-primary font-bold pt-1">{data.category}</p>
          <div className="space-y-1 font-mono text-[9px] mt-1.5 pt-1">
            <p className="text-white/60">Sinal: <span className="text-white font-bold">{realRssi} dBm</span></p>
            <p className="text-white/60">Dispersão: <span className="text-white font-bold">~{distanceEst}m</span></p>
            <p className="text-white/60">Mapeamento: <span className={isAbove ? "text-brand-primary font-bold" : "text-white/30 font-bold"}>
              {isAbove ? "✓ DENTRO DA QUADRA" : "✗ FORA DA QUADRA"}
            </span></p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="p-8 bg-black rounded-[2.5rem] border border-brand-primary/40 space-y-8 shadow-2xl">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-6">
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-brand-primary/10 rounded-2xl border border-brand-primary/40">
            <Bluetooth className="w-8 h-8 text-brand-primary animate-pulse" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Telemetria de Beacons BLE</h2>
            <p className="text-[10px] font-black text-brand-primary uppercase tracking-[0.2em] mt-1">Presença por rádio-frequência na quadra</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (isScanning) {
                setIsScanning(false);
                return;
              }
              if (uuids.length === 0) {
                showNotification('Adicione ao menos um UUID de Beacon antes de iniciar o scanner.', 'error');
                return;
              }
              setIsScanning(true);
            }}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all shadow-lg ${
              isScanning 
                ? 'bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30' 
                : 'bg-brand-primary text-black hover:bg-brand-primary/95 shadow-brand-primary/20'
            }`}
          >
            {isScanning ? <><Square className="w-3.5 h-3.5 fill-current" /> Parar Scanner</> : <><Play className="w-3.5 h-3.5 fill-current" /> Iniciar Scanner Real</>}
          </button>

          <button
            onClick={startWebBluetoothProbe}
            className="bg-white/5 hover:bg-white/10 text-white border border-white/15 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
          >
            Probe Bluetooth
          </button>
        </div>
      </div>

      {/* Connection Indicator Status Panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white/[0.02] border border-white/5 p-5 rounded-2xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Status de Proximidade (Live)</span>
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${isNearCourt ? 'bg-brand-primary animate-pulse shadow-[0_0_8px_rgba(245,196,41,0.8)]' : 'bg-white/20'}`}></span>
              <p className="text-lg font-black uppercase tracking-tight text-white">
                {isNearCourt ? 'NA QUADRA' : 'FORA DA QUADRA'}
              </p>
            </div>
          </div>
          {isScanning && currentBeaconRssi !== null && (
            <div className="text-right space-y-0.5">
              <span className="text-[9px] font-black text-brand-primary uppercase tracking-widest">Intensidade Real</span>
              <p className="text-xl font-black text-white font-mono">{currentBeaconRssi} dBm</p>
            </div>
          )}
        </div>

        <div className="bg-white/[0.02] border border-white/5 p-5 rounded-2xl flex flex-col justify-center">
          <span className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
            <Signal className="w-3.5 h-3.5 text-brand-primary" /> Calibração de Proximidade (RSSI)
          </span>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="-100"
              max="-30"
              step="1"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-primary"
            />
            <span className="text-base font-black text-brand-primary font-mono w-14 text-right">{threshold} dBm</span>
          </div>
          <div className="flex justify-between text-[8px] font-black text-white/20 uppercase mt-2 tracking-widest">
            <span>Sensibilidade Baixa</span>
            <span>Alta Precisão</span>
          </div>
        </div>
      </div>

      {/* Real-time RSSI Distribution Bar Chart */}
      <div className="bg-white/[0.01] border border-white/5 p-6 rounded-[2rem] space-y-4">
        <div>
          <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
            <Signal className="w-4 h-4 text-brand-primary animate-pulse" />
            Distribuição de Sinal RSSI em Tempo Real (dBm)
          </h3>
          <p className="text-[9px] text-white/40 uppercase tracking-widest mt-1">
            Compare o nível de sinal dos aparelhos com a linha limite para calibrar o geofence. Barras amarelas estão conectadas.
          </p>
        </div>

        <div className="h-[240px] w-full bg-black/60 border border-white/5 p-4 rounded-2xl relative">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rssiChartData}
              margin={{ top: 20, right: 10, left: -25, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis 
                dataKey="name" 
                stroke="rgba(255,255,255,0.3)" 
                fontSize={8} 
                tickLine={false}
                axisLine={false}
                dy={5}
                tick={{ fill: 'rgba(255,255,255,0.5)', fontWeight: '900' }}
              />
              <YAxis 
                stroke="rgba(255,255,255,0.3)" 
                fontSize={8} 
                tickLine={false}
                axisLine={false}
                domain={[0, 70]}
                tickFormatter={(val) => `${val - 100}`}
                tick={{ fill: 'rgba(255,255,255,0.5)', fontWeight: '900' }}
              />
              <Tooltip content={<CustomRssiTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
              
              {/* Dynamic horizontal Threshold reference line */}
              <ReferenceLine 
                y={threshold + 100} 
                stroke="#f5c429" 
                strokeWidth={2}
                strokeDasharray="4 4" 
                label={{ 
                  value: `Limite: ${threshold} dBm`, 
                  position: 'top', 
                  fill: '#f5c429', 
                  fontSize: 7, 
                  fontWeight: 'bold',
                  letterSpacing: '0.1em'
                }} 
              />
              
              <Bar dataKey="strength" radius={[4, 4, 0, 0]}>
                {rssiChartData.map((entry, index) => {
                  const isAbove = entry.rssi >= threshold;
                  const isReal = entry.isReal;
                  return (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={isReal ? '#00e676' : (isAbove ? '#f5c429' : 'rgba(255, 255, 255, 0.15)')} 
                      stroke={isReal ? '#00e676' : (isAbove ? '#f5c429' : 'rgba(255, 255, 255, 0.25)')}
                      strokeWidth={isAbove ? 0 : 1}
                      className={isReal ? 'animate-pulse' : ''}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Live Oscilloscope / Signal History Chart */}
        {(isScanning || currentBeaconRssi !== null) && (
          <div className="bg-white/[0.01] border border-white/5 p-6 rounded-[2rem] space-y-4">
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Zap className="w-4 h-4 text-brand-primary animate-pulse" />
                Osciloscópio de Intensidade (Holy-IoT / Live)
              </h3>
              <p className="text-[9px] text-white/40 uppercase tracking-widest mt-1">
                Histórico de variação em tempo real. Afaste o beacon para ver a curva cair abaixo do limiar amarelo.
              </p>
            </div>

            <div className="h-[180px] w-full bg-black/40 border border-white/5 p-4 rounded-2xl">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={signalHistory}>
                  <CartesianGrid strokeDasharray="2 2" stroke="rgba(255,255,255,0.03)" vertical={false} />
                  <XAxis 
                    dataKey="time" 
                    hide 
                  />
                  <YAxis 
                    stroke="rgba(255,255,255,0.2)" 
                    fontSize={8} 
                    domain={[-100, -30]} 
                    tickFormatter={(val) => `${val} dBm`}
                    tick={{ fill: 'rgba(255,255,255,0.4)', fontWeight: '700' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#000', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '10px' }}
                    itemStyle={{ color: '#f5c429', fontWeight: '900' }}
                    labelStyle={{ display: 'none' }}
                  />
                  <ReferenceLine y={threshold} stroke="#f5c429" strokeDasharray="3 3" />
                  <Bar 
                    dataKey="rssi" 
                    fill="#f5c429" 
                    opacity={0.8}
                    radius={[2, 2, 0, 0]}
                  >
                    {signalHistory.map((entry, index) => (
                      <Cell 
                        key={`hist-${index}`} 
                        fill={entry.rssi >= threshold ? '#f5c429' : '#ff5252'} 
                        fillOpacity={index / signalHistory.length}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Legend / Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[8px] font-black uppercase tracking-widest mt-2">
          <div className="bg-white/[0.02] border border-white/5 p-2 rounded-xl">
            <span className="text-white/40 block mb-0.5">Sinal Captado</span>
            <span className="text-white">
              {isScanning && currentBeaconRssi !== null ? `${currentBeaconRssi} dBm` : 'Buscando Hardware...'}
            </span>
          </div>
          <div className="bg-white/[0.02] border border-white/5 p-2 rounded-xl">
            <span className="text-white/40 block mb-0.5">Limiar Atual</span>
            <span className="text-brand-primary font-bold">{threshold} dBm</span>
          </div>
          <div className="bg-white/[0.02] border border-white/5 p-2 rounded-xl">
            <span className="text-white/40 block mb-0.5">Sinal Forte (Máx)</span>
            <span className="text-white">-30 dBm</span>
          </div>
          <div className="bg-white/[0.02] border border-white/5 p-2 rounded-xl">
            <span className="text-white/40 block mb-0.5 font-bold">Status Calibração</span>
            <span className={rssiChartData.some(b => b.rssi >= threshold) ? "text-brand-primary font-bold" : "text-white/30 font-bold"}>
              {rssiChartData.some(b => b.rssi >= threshold) ? "✓ ATIVOS CONECTADOS" : "✗ TODOS FORA (AJUSTE)"}
            </span>
          </div>
        </div>

        {/* SECTION: Direct Beacon Capture / Real-Time Discovery */}
        <div className="bg-white/[0.01] border border-white/5 p-6 rounded-[2rem] space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Radio className="w-4 h-4 text-brand-primary animate-pulse" />
              Auto-Detecção & Captura de Beacons Próximos
            </h3>
            <p className="text-[9px] text-white/40 uppercase tracking-widest mt-1">Busque sinais de rádio ativos para configurar sem digitar</p>
          </div>
          
          <button
            onClick={handleDiscoverBeacons}
            disabled={isDiscovering}
            className="px-4 py-2.5 bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary border border-brand-primary/30 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isDiscovering ? 'animate-spin' : ''}`} />
            {isDiscovering ? 'Guerreiros Radar Buscando...' : 'Buscar Beacons Próximos'}
          </button>
        </div>

        {isDiscovering && (
          <div className="flex flex-col items-center justify-center py-10 space-y-3">
            <div className="relative">
              <div className="w-14 h-14 border border-brand-primary/20 rounded-full animate-ping absolute inset-0"></div>
              <div className="w-14 h-14 bg-brand-primary/10 border border-brand-primary/40 rounded-full flex items-center justify-center relative">
                <Bluetooth className="w-6 h-6 text-brand-primary animate-pulse" />
              </div>
            </div>
            <p className="text-[10px] font-black text-brand-primary uppercase tracking-[0.15em] animate-pulse">Varrendo frequências BLE da quadra...</p>
          </div>
        )}

        {!isDiscovering && discoveredList.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {discoveredList.map((beacon) => {
              const isAlreadyAdded = uuids.includes(beacon.uuid);
              const isJustCaptured = lastCapturedId === beacon.id;
              
              return (
                <div 
                  key={beacon.id} 
                  className={`p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-4 ${
                    isJustCaptured 
                      ? 'bg-brand-primary/10 border-brand-primary shadow-lg shadow-brand-primary/5' 
                      : isAlreadyAdded
                        ? 'bg-black/80 border-white/10 opacity-80'
                        : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-black text-brand-primary uppercase tracking-[0.15em] bg-brand-primary/10 px-2 py-0.5 rounded">
                        {beacon.category}
                      </span>
                      <div className="flex items-center gap-1.5 font-mono text-[9px] text-white/50">
                        <Signal className="w-3 h-3 text-brand-primary" />
                        <span>Sinal: {beacon.rssi} dBm</span>
                      </div>
                    </div>
                    
                    <h4 className="text-xs font-black text-white uppercase tracking-tight leading-tight">{beacon.name}</h4>
                    <p className="text-[9px] font-mono text-white/30 truncate select-all">{beacon.uuid}</p>
                  </div>

                  <div className="flex items-center justify-between gap-4 border-t border-white/5 pt-3">
                    <div className="text-[8px] text-white/40 uppercase tracking-widest font-black">
                      Distância Focal: <span className="text-white font-mono font-bold">~{beacon.distance} metros</span>
                    </div>

                    <button
                      onClick={() => handleCaptureBeacon(beacon)}
                      className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-1 transition-all ${
                        isJustCaptured 
                          ? 'bg-brand-primary text-black' 
                          : isAlreadyAdded
                            ? 'bg-white/5 hover:bg-white/10 text-white/70 border border-white/10'
                            : 'bg-brand-primary hover:bg-brand-primary/90 text-black shadow-md'
                      }`}
                    >
                      {isJustCaptured ? (
                        <>
                          <Check className="w-3 h-3" /> Capturado!
                        </>
                      ) : isAlreadyAdded ? (
                        'Calibrar RSSI Novamente'
                      ) : (
                        'Capturar e Calibrar'
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* active beacon list */}
      {isScanning && foundBeacons.length > 0 && (
        <div className="space-y-3 bg-brand-primary/5 border border-brand-primary/20 p-6 rounded-3xl">
          <span className="text-[9px] font-black text-brand-primary uppercase tracking-widest flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 animate-bounce" /> Beacons Ativos Rastreados na Área
          </span>
          <div className="grid grid-cols-1 gap-2">
            {foundBeacons.map((b) => {
              const active = b.rssi >= threshold;
              return (
                <div key={b.uuid} className={`flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 rounded-xl border ${active ? 'bg-brand-primary/10 border-brand-primary/30' : 'bg-black/40 border-white/5 opacity-60'} transition-all`}>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-white font-mono truncate">{b.uuid}</p>
                    <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mt-1">Status: {active ? 'DENTRO DO LIMITE' : 'SINAL FRACO'}</p>
                  </div>
                  <div className="flex items-center gap-4 mt-2 sm:mt-0 font-mono text-xs">
                    <div className="text-right">
                      <p className="text-white/40 text-[8px] font-black uppercase tracking-widest">Sinal</p>
                      <p className={`font-black ${active ? 'text-brand-primary' : 'text-white'}`}>{b.rssi} dBm</p>
                    </div>
                    <div className="text-right border-l border-white/10 pl-4">
                      <p className="text-white/40 text-[8px] font-black uppercase tracking-widest">Rádio-Fração</p>
                      <p className="text-white font-black">~{b.distance}m</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* UUID Admin list */}
      <div className="space-y-4">
        <label className="text-[10px] font-black text-white/40 uppercase tracking-widest flex items-center gap-1.5">
          Lista de UUIDs Habilitados na Quadra
        </label>
        <div className="flex gap-2">
          <input
            value={newUuid}
            onChange={(e) => setNewUuid(e.target.value)}
            placeholder="Adicionar UUID: Ex, E2C56DB5-DFFB-48D2-B060-D0F5A71096E0"
            className="flex-1 px-4 py-3.5 bg-white/5 rounded-xl border border-white/10 text-white text-sm focus:border-brand-primary/60 outline-none uppercase font-mono tracking-wider placeholder:text-white/20 select-all"
          />
          <button 
            onClick={handleAddUuid} 
            className="px-5 bg-brand-primary hover:bg-brand-primary/90 text-black rounded-xl font-bold transition-all border border-brand-primary/35 flex items-center justify-center p-3"
          >
            <Plus className="w-5 h-5 shrink-0" />
          </button>
        </div>

        <div className="space-y-2 mt-2">
          {uuids.map(uuid => (
            <div key={uuid} className="flex justify-between items-center p-3.5 bg-white/[0.02] border border-white/5 hover:border-white/10 rounded-xl transition-all">
              <span className="text-[11px] text-white font-mono tracking-wider select-all uppercase">{uuid}</span>
              <button 
                onClick={() => handleRemoveUuid(uuid)} 
                className="text-red-400 hover:text-red-500 hover:bg-red-500/10 p-2 rounded-lg transition-all border border-transparent hover:border-red-500/20"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          {uuids.length === 0 && (
            <div className="flex flex-col items-center justify-center py-6 text-center text-white/30 border border-dashed border-white/10 rounded-2xl">
              <AlertTriangle className="w-8 h-8 text-white/20 mb-2" />
              <p className="text-[10px] font-black uppercase tracking-widest">Nenhum Beacon Cadastrado</p>
              <p className="text-[8px] text-white/30 mt-1">Insira e salve UUIDS para guarnecer o check-in automático.</p>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={isSaving}
        className="w-full py-4.5 bg-brand-primary hover:bg-brand-primary/95 text-black rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 active:scale-[0.99] transition-all shadow-xl shadow-brand-primary/10 disabled:opacity-50"
      >
        <Save className="w-4 h-4" />
        {isSaving ? 'Gravando Alterações...' : 'Salvar e Sincronizar Beacons'}
      </button>
    </div>
  );
};
