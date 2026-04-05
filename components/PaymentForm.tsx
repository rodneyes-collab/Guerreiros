import React from 'react';
import { Payment, PaymentStatus } from '../types';
import { X } from 'lucide-react';

interface PaymentFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  editingPayment: Payment | null;
  paymentFormData: any;
  setPaymentFormData: (data: any) => void;
  players: any[];
}

export const PaymentForm: React.FC<PaymentFormProps> = ({
  isOpen,
  onClose,
  onSubmit,
  editingPayment,
  paymentFormData,
  setPaymentFormData,
  players
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-brand-secondary w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-white/10 overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-8 border-b border-white/10 flex justify-between items-center bg-white/5">
          <div>
            <h3 className="text-2xl font-black text-brand-primary uppercase tracking-tight">
              {editingPayment ? 'Editar Lançamento' : 'Novo Lançamento'}
            </h3>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">Preencha os dados financeiros</p>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-white/10 rounded-2xl transition-all text-white/60 hover:text-white"><X className="w-6 h-6" /></button>
        </div>
        
        <form onSubmit={onSubmit} className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Sócio</label>
            <select
              required
              value={paymentFormData.playerId}
              onChange={e => setPaymentFormData({ ...paymentFormData, playerId: e.target.value })}
              className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all font-bold text-white outline-none appearance-none"
            >
              <option value="" className="bg-brand-secondary text-white">Selecione um sócio...</option>
              {players.sort((a,b) => (a.name || '').localeCompare(b.name || '')).map(p => (
                <option key={p.id} value={p.id} className="bg-brand-secondary text-white">{p.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Mês de Referência</label>
              <input
                type="month"
                required
                value={paymentFormData.month}
                onChange={e => setPaymentFormData({ ...paymentFormData, month: e.target.value })}
                className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all font-bold text-white outline-none [color-scheme:dark]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                required
                value={paymentFormData.amount}
                onChange={e => setPaymentFormData({ ...paymentFormData, amount: parseFloat(e.target.value) })}
                className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all font-bold text-white outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Vencimento</label>
              <input
                type="date"
                required
                value={paymentFormData.dueDate}
                onChange={e => setPaymentFormData({ ...paymentFormData, dueDate: e.target.value })}
                className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all font-bold text-white outline-none [color-scheme:dark]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Status</label>
              <select
                value={paymentFormData.status}
                onChange={e => setPaymentFormData({ ...paymentFormData, status: e.target.value as PaymentStatus })}
                className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all font-bold text-white outline-none appearance-none"
              >
                <option value={PaymentStatus.PENDING} className="bg-brand-secondary text-white">Pendente</option>
                <option value={PaymentStatus.PAID} className="bg-brand-secondary text-white">Pago</option>
                <option value={PaymentStatus.OVERDUE} className="bg-brand-secondary text-white">Atrasado</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Forma</label>
              <select
                value={paymentFormData.method || ''}
                onChange={e => setPaymentFormData({ ...paymentFormData, method: e.target.value })}
                className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all font-bold text-white outline-none appearance-none"
              >
                <option value="" className="bg-brand-secondary text-white">Selecione...</option>
                <option value="PIX" className="bg-brand-secondary text-white">Pix</option>
                <option value="CASH" className="bg-brand-secondary text-white">Dinheiro</option>
                <option value="TRANSFER" className="bg-brand-secondary text-white">Transferência</option>
                <option value="OTHER" className="bg-brand-secondary text-white">Outro</option>
              </select>
            </div>
            {paymentFormData.status === PaymentStatus.PAID && (
              <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Data do Pagamento</label>
                <input
                  type="date"
                  required
                  value={paymentFormData.paymentDate || ''}
                  onChange={e => setPaymentFormData({ ...paymentFormData, paymentDate: e.target.value })}
                  className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all font-bold text-white outline-none [color-scheme:dark]"
                />
              </div>
            )}
          </div>

          <div className="pt-4 flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-8 py-4 bg-white/5 text-white/60 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all border border-white/10"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-[2] px-8 py-4 bg-brand-primary text-brand-secondary rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-brand-primary/90 shadow-xl shadow-brand-primary/10 transition-all"
            >
              {editingPayment ? 'Salvar Alterações' : 'Registrar Pagamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
