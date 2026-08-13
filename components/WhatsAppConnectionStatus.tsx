import React from 'react';
import { Shield, AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react';

interface Props {
  status: string;
  qrCode: string | null;
  onRefresh: () => void;
  onGenerateQr: () => void;
  loadingQr: boolean;
}

export const WhatsAppConnectionStatus: React.FC<Props> = ({ status, qrCode, onRefresh, onGenerateQr, loadingQr }) => {
  return (
    <div className="bg-black/60 p-6 rounded-[2rem] border border-white/5 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-2xl ${status === 'ONLINE' ? 'bg-green-500/10' : 'bg-amber-500/10'}`}>
            {status === 'ONLINE' ? <CheckCircle2 className="w-6 h-6 text-green-400" /> : <AlertTriangle className="w-6 h-6 text-amber-500" />}
          </div>
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider">Status do WhatsApp</h3>
            <p className={`text-[10px] font-black uppercase tracking-widest ${status === 'ONLINE' ? 'text-green-400' : 'text-amber-500'}`}>
              {status}
            </p>
          </div>
        </div>
        <button onClick={onRefresh} className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-all">
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {status !== 'ONLINE' && !qrCode && (
        <button 
          onClick={onGenerateQr} 
          disabled={loadingQr}
          className="w-full py-3 bg-brand-primary text-black rounded-xl font-black uppercase tracking-widest text-[10px] hover:scale-[1.02] transition-all"
        >
          {loadingQr ? 'Carregando...' : 'Gerar QR Code'}
        </button>
      )}

      {qrCode && (
        <div className="bg-white p-4 rounded-2xl flex flex-col items-center gap-4">
          <img src={qrCode} alt="QR Code" className="w-48 h-48" />
          <p className="text-[10px] text-black font-black uppercase tracking-widest text-center">Escaneie para conectar</p>
        </div>
      )}
    </div>
  );
};
