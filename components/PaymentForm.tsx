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
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
              {editingPayment ? 'Editar Lançamento' : 'Novo Lançamento'}
            </h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Preencha os dados financeiros</p>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-white rounded-2xl transition-all shadow-sm"><X className="w-6 h-6 text-slate-400" /></button>
        </div>
        
        <form onSubmit={onSubmit} className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Sócio</label>
            <select
              required
              value={paymentFormData.playerId}
              onChange={e => setPaymentFormData({ ...paymentFormData, playerId: e.target.value })}
              className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-bold text-slate-700 outline-none appearance-none"
            >
              <option value="">Selecione um sócio...</option>
              {players.sort((a,b) => (a.name || '').localeCompare(b.name || '')).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mês de Referência</label>
              <input
                type="text"
                required
                placeholder="Ex: Março/2024"
                value={paymentFormData.month}
                onChange={e => setPaymentFormData({ ...paymentFormData, month: e.target.value })}
                className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-bold text-slate-700 outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                required
                value={paymentFormData.amount}
                onChange={e => setPaymentFormData({ ...paymentFormData, amount: parseFloat(e.target.value) })}
                className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-bold text-slate-700 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Vencimento</label>
              <input
                type="date"
                required
                value={paymentFormData.dueDate}
                onChange={e => setPaymentFormData({ ...paymentFormData, dueDate: e.target.value })}
                className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-bold text-slate-700 outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Status</label>
              <select
                value={paymentFormData.status}
                onChange={e => setPaymentFormData({ ...paymentFormData, status: e.target.value as PaymentStatus })}
                className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-bold text-slate-700 outline-none appearance-none"
              >
                <option value={PaymentStatus.PENDING}>Pendente</option>
                <option value={PaymentStatus.PAID}>Pago</option>
                <option value={PaymentStatus.OVERDUE}>Atrasado</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Forma</label>
              <select
                value={paymentFormData.method || ''}
                onChange={e => setPaymentFormData({ ...paymentFormData, method: e.target.value })}
                className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-bold text-slate-700 outline-none appearance-none"
              >
                <option value="">Selecione...</option>
                <option value="PIX">Pix</option>
                <option value="CASH">Dinheiro</option>
                <option value="TRANSFER">Transferência</option>
                <option value="OTHER">Outro</option>
              </select>
            </div>
            {paymentFormData.status === PaymentStatus.PAID && (
              <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data do Pagamento</label>
                <input
                  type="date"
                  required
                  value={paymentFormData.paymentDate || ''}
                  onChange={e => setPaymentFormData({ ...paymentFormData, paymentDate: e.target.value })}
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-bold text-slate-700 outline-none"
                />
              </div>
            )}
          </div>

          <div className="pt-4 flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-8 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-[2] px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all"
            >
              {editingPayment ? 'Salvar Alterações' : 'Registrar Pagamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
