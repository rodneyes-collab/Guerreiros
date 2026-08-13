import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { 
  Calendar, Clock, Send, Trash2, AlertCircle, CheckCircle2, 
  MessageSquare, Users, User, Plus, Filter, Loader2 
} from 'lucide-react';
import { collection, query, orderBy, getDocs, addDoc, deleteDoc, doc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { ScheduledMessage } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const WhatsAppScheduler: React.FC = () => {
  const { showNotification, userRole } = useStore();
  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  // Form State
  const [newMsg, setNewMsg] = useState({
    type: 'CUSTOM' as const,
    scheduledAt: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    target: 'GROUP' as 'GROUP' | 'INDIVIDUAL',
    recipientPhone: '',
    content: ''
  });

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'scheduled_messages'), orderBy('scheduledAt', 'desc'));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ScheduledMessage));
      setMessages(list);
    } catch (err: any) {
      console.error("Error fetching scheduled messages:", err);
      showNotification("Erro ao carregar agendamentos", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMsg.content) return showNotification("O conteúdo é obrigatório", "error");
    
    setIsCreating(true);
    try {
      const scheduledTimestamp = new Date(newMsg.scheduledAt).getTime();
      
      const payload: any = {
        type: newMsg.type,
        scheduledAt: scheduledTimestamp,
        status: 'PENDING',
        target: newMsg.target,
        content: newMsg.content,
        createdAt: Date.now()
      };

      if (newMsg.target === 'INDIVIDUAL' && newMsg.recipientPhone) {
        payload.recipientPhone = newMsg.recipientPhone.replace(/\D/g, '') + '@c.us';
      }

      await addDoc(collection(db, 'scheduled_messages'), payload);
      showNotification("Mensagem agendada com sucesso!", "success");
      setNewMsg({
        type: 'CUSTOM',
        scheduledAt: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        target: 'GROUP',
        recipientPhone: '',
        content: ''
      });
      fetchMessages();
    } catch (err: any) {
      showNotification("Erro ao agendar: " + err.message, "error");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Tem certeza que deseja excluir este agendamento?")) return;
    try {
      await deleteDoc(doc(db, 'scheduled_messages', id));
      showNotification("Agendamento excluído", "success");
      fetchMessages();
    } catch (err: any) {
      showNotification("Erro ao excluir", "error");
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SENT': return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case 'FAILED': return <AlertCircle className="w-4 h-4 text-red-400" />;
      default: return <Clock className="w-4 h-4 text-brand-primary" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'SENT': return 'Enviado';
      case 'FAILED': return 'Falhou';
      default: return 'Pendente';
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-brand-primary/5 border border-brand-primary/20 rounded-2xl p-6">
        <h4 className="text-sm font-black text-brand-primary uppercase tracking-widest flex items-center gap-2 mb-4">
          <Plus className="w-4 h-4" /> Novo Agendamento
        </h4>
        
        <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-white/50 tracking-wider">Tipo de Mensagem</label>
            <select 
              className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-brand-primary outline-none"
              value={newMsg.type}
              onChange={e => setNewMsg({ ...newMsg, type: e.target.value as any })}
            >
              <option value="CUSTOM">Personalizada</option>
              <option value="GAME_REMINDER">Lembrete de Jogo</option>
              <option value="PAYMENT_REMINDER">Lembrete de Pagamento</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-white/50 tracking-wider">Data e Hora de Envio</label>
            <input 
              type="datetime-local"
              className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-brand-primary outline-none"
              value={newMsg.scheduledAt}
              onChange={e => setNewMsg({ ...newMsg, scheduledAt: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-white/50 tracking-wider">Destinatário</label>
            <select 
              className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-brand-primary outline-none"
              value={newMsg.target}
              onChange={e => setNewMsg({ ...newMsg, target: e.target.value as any })}
            >
              <option value="GROUP">Grupo do Clube</option>
              <option value="INDIVIDUAL">Jogador Individual</option>
            </select>
          </div>

          {newMsg.target === 'INDIVIDUAL' && (
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-white/50 tracking-wider">WhatsApp do Destinatário</label>
              <input 
                type="text"
                placeholder="5511999999999"
                className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-brand-primary outline-none"
                value={newMsg.recipientPhone}
                onChange={e => setNewMsg({ ...newMsg, recipientPhone: e.target.value })}
              />
            </div>
          )}

          <div className="md:col-span-2 space-y-2">
            <label className="text-[10px] font-black uppercase text-white/50 tracking-wider">Conteúdo da Mensagem</label>
            <textarea 
              className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-brand-primary outline-none h-24 resize-none"
              placeholder="Digite a mensagem que será enviada..."
              value={newMsg.content}
              onChange={e => setNewMsg({ ...newMsg, content: e.target.value })}
            />
          </div>

          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={isCreating}
              className="flex items-center gap-2 px-8 py-3 bg-brand-primary text-black rounded-xl font-black uppercase tracking-widest text-[10px] hover:scale-[1.02] transition-all disabled:opacity-50"
            >
              {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Agendar Mensagem
            </button>
          </div>
        </form>
      </div>

      <div className="bg-black/20 border border-white/5 rounded-2xl p-6">
        <h4 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2 mb-6">
          <Calendar className="w-4 h-4" /> Mensagens Agendadas
        </h4>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-brand-primary animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12 text-white/30 italic text-sm">
            Nenhuma mensagem agendada.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {messages.map(msg => (
              <div key={msg.id} className="bg-brand-secondary/40 border border-white/10 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-xl bg-black border ${msg.status === 'SENT' ? 'border-green-500/30' : msg.status === 'FAILED' ? 'border-red-500/30' : 'border-brand-primary/30'}`}>
                    {msg.type === 'GAME_REMINDER' ? <MessageSquare className="w-5 h-5 text-brand-primary" /> : 
                     msg.type === 'PAYMENT_REMINDER' ? <Users className="w-5 h-5 text-blue-400" /> : 
                     <Send className="w-5 h-5 text-white/70" />}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-white uppercase tracking-wider">
                        {msg.type === 'GAME_REMINDER' ? 'Lembrete de Jogo' : 
                         msg.type === 'PAYMENT_REMINDER' ? 'Lembrete de Pagamento' : 
                         'Mensagem Personalizada'}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter flex items-center gap-1 ${
                        msg.status === 'SENT' ? 'bg-green-500/20 text-green-400' : 
                        msg.status === 'FAILED' ? 'bg-red-500/20 text-red-400' : 
                        'bg-brand-primary/20 text-brand-primary'
                      }`}>
                        {getStatusIcon(msg.status)} {getStatusText(msg.status)}
                      </span>
                    </div>
                    <p className="text-[10px] text-white/50 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> 
                      {format(msg.scheduledAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      <span className="mx-1">•</span>
                      {msg.target === 'GROUP' ? <Users className="w-3 h-3" /> : <User className="w-3 h-3" />}
                      {msg.target === 'GROUP' ? 'Grupo' : 'Indivíduo'}
                    </p>
                    <p className="text-xs text-white/80 mt-2 line-clamp-2 italic">
                      "{msg.content}"
                    </p>
                    {msg.error && (
                      <p className="text-[9px] text-red-400 font-mono mt-1">
                        Error: {msg.error}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2 self-end md:self-center">
                  <button
                    onClick={() => handleDelete(msg.id)}
                    className="p-2.5 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/30 rounded-xl transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
