
import React, { useState } from 'react';
import { Player, Match } from '../types';
import { BrainCircuit, Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';

import { useAIStatus } from '../src/hooks/useAIStatus';

interface AICoachProps {
  player: Player;
  allPlayers: Player[];
  recentMatches: Match[];
}

export const AICoach: React.FC<AICoachProps> = ({ player, allPlayers, recentMatches }) => {
  const { status: aiStatus } = useAIStatus();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateFeedback = async () => {
    if (!aiStatus.isAvailable) {
      setError(aiStatus.errorMessage);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/ai/coach-feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          player,
          allPlayers,
          recentMatches,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setFeedback(data.feedback);
      } else {
        throw new Error(data.error || 'Falha ao gerar feedback');
      }
    } catch (err: any) {
      console.error('[AICoach] Error:', err);
      setError(err.message || 'Erro ao conectar com o Treinador IA.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-black border border-brand-primary/20 rounded-xl overflow-hidden shadow-2xl">
      <div className="p-6 border-b border-brand-primary/10 flex items-center justify-between bg-gradient-to-r from-brand-primary/5 to-transparent">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-brand-primary/10 rounded-lg">
            <BrainCircuit className="w-6 h-6 text-brand-primary" />
          </div>
          <div>
            <h3 className="text-xl font-black text-white uppercase tracking-tight">Treinador IA</h3>
            <p className="text-sm text-brand-primary/60 font-medium">Análise de Performance Proativa</p>
          </div>
        </div>
        <button
          onClick={generateFeedback}
          disabled={isLoading || !aiStatus.isAvailable}
          className={`flex items-center gap-2 bg-brand-primary text-black px-4 py-2 rounded-lg font-bold text-sm uppercase tracking-wider hover:bg-white transition-all active:scale-95 disabled:opacity-50 disabled:scale-100 shadow-[0_0_15px_rgba(245,196,41,0.3)] ${!aiStatus.isAvailable ? 'grayscale cursor-not-allowed' : ''}`}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : !aiStatus.isAvailable ? (
            <RefreshCw className="w-4 h-4" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {isLoading ? 'Analisando...' : !aiStatus.isAvailable ? 'IA Indisponível' : feedback ? 'Recalcular' : 'Analisar Meu Jogo'}
        </button>
      </div>

      <div className="p-6">
        <AnimatePresence mode="wait">
          {!feedback && !isLoading && !error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-8"
            >
              <div className="w-16 h-16 bg-brand-primary/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-brand-primary/10">
                <BrainCircuit className="w-8 h-8 text-brand-primary/20" />
              </div>
              <p className="text-white/40 text-sm max-w-xs mx-auto">
                Clique no botão acima para que a inteligência artificial analise suas estatísticas recentes e habilidades.
              </p>
            </motion.div>
          )}

          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-12 gap-4"
            >
              <div className="relative">
                <Loader2 className="w-12 h-12 text-brand-primary animate-spin" />
                <div className="absolute inset-0 bg-brand-primary/20 blur-xl animate-pulse rounded-full" />
              </div>
              <p className="text-brand-primary font-bold animate-pulse uppercase tracking-widest text-xs">
                Guerreiros Intelligence Processando...
              </p>
            </motion.div>
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-red-500/10 border border-red-500/20 p-4 rounded-lg text-red-500 text-sm flex items-center gap-3"
            >
              <div className="p-2 bg-red-500/20 rounded-full">
                <RefreshCw className="w-4 h-4" />
              </div>
              {error}
            </motion.div>
          )}

          {feedback && !isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="prose prose-invert max-w-none prose-headings:text-brand-primary prose-strong:text-brand-primary prose-p:text-white/80 prose-li:text-white/80"
            >
              <ReactMarkdown>{feedback}</ReactMarkdown>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="px-6 py-4 bg-brand-primary/5 border-t border-brand-primary/10">
        <div className="flex items-center gap-2 text-[10px] text-brand-primary/40 uppercase tracking-widest font-black">
          <Sparkles className="w-3 h-3" />
          Powered by Gemini 3.6 Flash
        </div>
      </div>
    </div>
  );
};
