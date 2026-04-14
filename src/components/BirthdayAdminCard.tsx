import React, { useState } from 'react';
import { Player } from '../../types';
import { Gift, Send, Sparkles, Copy, Check, MessageSquare } from 'lucide-react';
import { generateBirthdayMessage } from '../../services/geminiService';
import { motion, AnimatePresence } from 'motion/react';

interface BirthdayAdminCardProps {
  player: Player;
  onSendPush: (player: Player) => void;
}

export const BirthdayAdminCard: React.FC<BirthdayAdminCardProps> = ({ player, onSendPush }) => {
  const [message, setMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    const msg = await generateBirthdayMessage(player.name);
    setMessage(msg);
    setIsGenerating(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 4000);
  };

  const handleWhatsApp = () => {
    const encodedMsg = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMsg}`, '_blank');
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-[2rem] p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-brand-primary/20 rounded-2xl text-brand-primary">
            <Gift className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-white font-black uppercase tracking-tight">{player.name}</h4>
            <p className="text-brand-primary text-[10px] font-black uppercase tracking-widest">Aniversariante do Dia</p>
          </div>
        </div>
        <button 
          onClick={() => onSendPush(player)}
          className="p-2 bg-brand-primary/10 text-brand-primary rounded-xl hover:bg-brand-primary hover:text-black transition-all"
          title="Notificar Grupo (Push)"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Mensagem de Parabéns</label>
          <button 
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex items-center gap-1 text-[10px] font-black text-brand-primary uppercase tracking-widest hover:opacity-80 disabled:opacity-50"
          >
            <Sparkles className={`w-3 h-3 ${isGenerating ? 'animate-pulse' : ''}`} />
            {isGenerating ? 'Gerando...' : 'Gerar com IA'}
          </button>
        </div>
        
        <textarea 
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Gere uma mensagem ou escreva aqui..."
          className="w-full bg-black border border-white/10 rounded-2xl p-4 text-sm text-white focus:border-brand-primary outline-none transition-all min-h-[100px] resize-none"
        />

        <div className="flex gap-2">
          <button 
            onClick={handleCopy}
            disabled={!message}
            className="flex-1 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all disabled:opacity-50"
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copiado' : 'Copiar'}
          </button>
          <button 
            onClick={handleWhatsApp}
            disabled={!message}
            className="flex-1 flex items-center justify-center gap-2 bg-[#25D366]/20 hover:bg-[#25D366]/30 text-[#25D366] py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all disabled:opacity-50"
          >
            <MessageSquare className="w-4 h-4" />
            WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
};
