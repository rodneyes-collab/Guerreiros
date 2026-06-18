import React from 'react';
import { Fingerprint, ScanFace, LogIn, ClipboardCheck } from 'lucide-react';
import { Logo } from './Logo';

interface InitialChoiceViewProps {
  onMarkPresence: () => void;
  onAccessApp: () => void;
}

export const InitialChoiceView: React.FC<InitialChoiceViewProps> = ({
  onMarkPresence,
  onAccessApp,
}) => {
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="max-w-md w-full relative z-10 space-y-12 animate-in fade-in zoom-in duration-700">
        <div className="text-center space-y-6">
          <Logo size="lg" className="mx-auto transform transition-transform duration-700 drop-shadow-[0_0_30px_rgba(245,196,41,0.3)]" />
          <div className="space-y-2">
            <h1 className="text-5xl font-black text-brand-primary tracking-tighter uppercase leading-none">Guerreiros</h1>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-[0.4em]">Vôlei de Elite</p>
          </div>
        </div>

        <div className="bg-white/5 backdrop-blur-2xl rounded-[2.5rem] shadow-2xl shadow-black/50 p-8 md:p-10 border border-brand-primary/40 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={onMarkPresence}
              className="w-full flex-col flex items-center gap-2 p-6 bg-brand-primary/10 border-2 border-brand-primary text-brand-primary rounded-2xl font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all group"
            >
              <Fingerprint className="w-8 h-8" />
              <div className="text-center">
                  <span className="block text-[11px]">Digital</span>
              </div>
            </button>
            <button
              onClick={onMarkPresence}
              className="w-full flex-col flex items-center gap-2 p-6 bg-brand-primary border-2 border-brand-primary text-black rounded-2xl font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-brand-primary/20 group"
            >
              <ScanFace className="w-8 h-8" />
              <div className="text-center">
                  <span className="block text-[11px]">Face ID</span>
              </div>
            </button>
          </div>

          <button
            onClick={onAccessApp}
            className="w-full flex items-center justify-center gap-3 px-8 py-5 bg-transparent border-2 border-brand-primary/40 text-brand-primary rounded-2xl font-black uppercase tracking-widest hover:bg-brand-primary/10 hover:border-brand-primary transition-all active:scale-[0.98]"
          >
            <LogIn className="w-5 h-5" />
            Acessar o App
          </button>
        </div>
      </div>
      
      <p className="absolute bottom-8 text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">
        Guerreiros Volleyball Club © 2025
      </p>
    </div>
  );
};
