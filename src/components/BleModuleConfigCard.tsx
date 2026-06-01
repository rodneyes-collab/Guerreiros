import React, { useState, useEffect } from 'react';
import { Cpu, Settings, Save, Signal } from 'lucide-react';
import { useStore } from '../../store';

export const BleModuleConfigCard: React.FC = () => {
    const { systemMetadata, setSystemMetadata } = useStore();
    const [threshold, setThreshold] = useState(systemMetadata.bleProximityThreshold || 2.0);
    const [isSaving, setIsSaving] = useState(false);
    const [rssi, setRssi] = useState(-65);

    useEffect(() => {
        const interval = setInterval(() => {
            // Simulate RSSI signal strength variations
            setRssi(Math.floor(Math.random() * (-40 - (-95)) + (-95)));
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        await setSystemMetadata({ bleProximityThreshold: threshold });
        setIsSaving(false);
    };

    // Calculate percentage (clamped for visual)
    const normalizedRssi = Math.min(100, Math.max(0, (rssi + 95) / 55 * 100));
    const isConnected = rssi > -90;

    return (
        <section className="bg-brand-light backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-sm space-y-4">
            <h3 className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                 <Cpu className="w-5 h-5 text-brand-primary" /> Módulo NRF52810 (BLE)
            </h3>
            
            <div className="flex items-center gap-2 text-sm font-bold text-white/60">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                Status: {isConnected ? 'Conectado' : 'Desconectado'}
            </div>

            <div className="space-y-4">
                <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Threshold de Proximidade (RSSI)</label>
                    <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
                        <input
                            id="ble-proximity-threshold-input"
                            type="range"
                            min="-100"
                            max="-20"
                            step="1"
                            value={threshold}
                            onChange={(e) => setThreshold(parseFloat(e.target.value))}
                            className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-primary"
                        />
                        <span className="text-sm font-black text-brand-primary w-12 text-right">{threshold}</span>
                    </div>
                    <div className="flex justify-between text-[10px] font-black uppercase text-white/30 px-1">
                        <span>Longe</span>
                        <span>Perto</span>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">
                        <span>Intensidade de Sinal (Live)</span>
                        <span className="text-brand-primary">{rssi} dBm</span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-brand-primary transition-all duration-500 ease-out"
                            style={{ width: `${normalizedRssi}%` }}
                        />
                    </div>
                </div>
            </div>

            <button 
                onClick={handleSave}
                disabled={isSaving}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-brand-primary text-brand-secondary text-[10px] font-black uppercase tracking-widest rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
                {isSaving ? 'Salvando...' : <><Save className="w-4 h-4" /> Salvar Threshold</>}
            </button>
        </section>
    );
};
