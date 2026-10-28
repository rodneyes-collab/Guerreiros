import { useShallow } from "zustand/react/shallow";
import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Loader2, Bot, User, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useStore } from '../store';
import ReactMarkdown from 'react-markdown';

import { useAIStatus } from '../src/hooks/useAIStatus';

export const AIChatBot: React.FC = () => {
  const { status: aiStatus } = useAIStatus();
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'model', parts: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { players, matches } = useStore(useShallow(state => ({ players: state.players, matches: state.matches })));

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory, isLoading]);

  const handleSend = async () => {
    if (!message.trim() || isLoading) return;

    if (!aiStatus.isAvailable) {
      setChatHistory(prev => [...prev, 
        { role: 'user', parts: message },
        { role: 'model', parts: `⚠️ **Aviso de Sistema:** ${aiStatus.errorMessage}` }
      ]);
      setMessage('');
      return;
    }

    const userMsg = message;
    setMessage('');
    setChatHistory(prev => [...prev, { role: 'user', parts: userMsg }]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          history: chatHistory,
          context: {
            players: players.slice(0, 20), // Top 20 context to avoid payload limit
            matches: matches.slice(0, 10)
          }
        })
      });

      const data = await response.json();
      if (data.success) {
        setChatHistory(prev => [...prev, { role: 'model', parts: data.response }]);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      setChatHistory(prev => [...prev, { role: 'model', parts: "Desculpe, estou com dificuldades para responder agora." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-brand-primary text-black rounded-full shadow-2xl flex items-center justify-center z-[100] border-2 border-black"
      >
        {isOpen ? <X size={28} /> : <MessageCircle size={28} />}
        {!isOpen && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-white text-[8px] items-center justify-center font-bold">AI</span>
          </span>
        )}
      </motion.button>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.8 }}
            className="fixed bottom-24 right-6 w-[90vw] sm:w-[400px] h-[600px] max-h-[70vh] bg-black border border-brand-primary/20 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[100] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 bg-brand-primary text-black flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-black/10 rounded-lg">
                  <Bot size={20} />
                </div>
                <div>
                  <h4 className="font-black uppercase tracking-tight text-sm">Guerreiros AI</h4>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-green-600 rounded-full animate-pulse" />
                    <span className="text-[10px] font-bold opacity-70">ASSISTENTE OFICIAL</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="hover:bg-black/10 p-1 rounded">
                <X size={20} />
              </button>
            </div>

            {/* Messages */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-brand-primary/20"
            >
              {chatHistory.length === 0 && (
                <div className="text-center py-8">
                  <Bot className="w-12 h-12 text-brand-primary/20 mx-auto mb-3" />
                  <p className="text-white/40 text-xs font-medium max-w-[200px] mx-auto">
                    Olá! Sou o assistente dos Guerreiros. Tire suas dúvidas sobre o ranking, regras ou performance.
                  </p>
                </div>
              )}
              {chatHistory.map((chat, i) => (
                <div key={i} className={`flex ${chat.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`flex gap-2 max-w-[85%] ${chat.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${chat.role === 'user' ? 'bg-brand-primary/10' : 'bg-white/5'}`}>
                      {chat.role === 'user' ? <User size={16} className="text-brand-primary" /> : <Bot size={16} className="text-white/60" />}
                    </div>
                    <div className={`p-3 rounded-2xl text-sm ${
                      chat.role === 'user' 
                        ? 'bg-brand-primary text-black font-medium rounded-tr-none' 
                        : 'bg-white/5 text-white/90 border border-white/10 rounded-tl-none'
                    }`}>
                      <div className="prose prose-invert prose-p:my-0 text-inherit leading-relaxed">
                        <ReactMarkdown>
                          {chat.parts}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="flex gap-2">
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                      <Loader2 size={16} className="text-brand-primary animate-spin" />
                    </div>
                    <div className="bg-white/5 p-3 rounded-2xl rounded-tl-none border border-white/10">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-brand-primary/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-brand-primary/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-brand-primary/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-4 bg-white/5 border-t border-white/10">
              <div className="relative">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Pergunte algo..."
                  className="w-full bg-black border border-white/10 rounded-xl py-3 px-4 pr-12 text-sm text-white focus:border-brand-primary outline-none transition-all"
                />
                <button
                  onClick={handleSend}
                  disabled={!message.trim() || isLoading}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-brand-primary hover:bg-brand-primary/10 rounded-lg transition-all disabled:opacity-30"
                >
                  <Send size={18} />
                </button>
              </div>
              <div className="mt-2 flex items-center gap-1 text-[8px] text-white/20 uppercase tracking-widest font-black">
                <Sparkles size={8} />
                Guerreiros Intelligence v1.0
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
