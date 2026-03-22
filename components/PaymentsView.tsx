import React from 'react';
import { useStore } from '../store';
import { Payment, PaymentStatus } from '../types';
import { 
  Trash2, 
  Plus, 
  Edit2,
  CheckCircle2,
  Clock,
  XCircle
} from 'lucide-react';

interface PaymentsViewProps {
  deletePayment: (id: string) => void;
  setEditingPayment: (payment: Payment | null) => void;
  setIsPaymentFormOpen: (open: boolean) => void;
}

export const PaymentsView: React.FC<PaymentsViewProps> = ({
  deletePayment,
  setEditingPayment,
  setIsPaymentFormOpen
}) => {
  const { payments, userRole } = useStore();

  const getStatusIcon = (status: PaymentStatus) => {
    switch (status) {
      case PaymentStatus.PAID: return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case PaymentStatus.PENDING: return <Clock className="w-4 h-4 text-amber-500" />;
      case PaymentStatus.OVERDUE: return <XCircle className="w-4 h-4 text-rose-500" />;
    }
  };

  const getStatusColor = (status: PaymentStatus) => {
    switch (status) {
      case PaymentStatus.PAID: return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case PaymentStatus.PENDING: return 'bg-amber-50 text-amber-700 border-amber-100';
      case PaymentStatus.OVERDUE: return 'bg-rose-50 text-rose-700 border-rose-100';
    }
  };

  const translateStatus = (status: PaymentStatus) => {
    switch (status) {
      case PaymentStatus.PAID: return 'Pago';
      case PaymentStatus.PENDING: return 'Pendente';
      case PaymentStatus.OVERDUE: return 'Atrasado';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter">Financeiro</h2>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-2">Controle de mensalidades e taxas</p>
        </div>
        {userRole === 'ADMIN' && (
          <button 
            onClick={() => { setEditingPayment(null); setIsPaymentFormOpen(true); }} 
            className="w-full md:w-auto bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all"
          >
            <Plus className="w-5 h-5" />
            Novo Lançamento
          </button>
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Sócio</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Mês/Ref</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Valor</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Vencimento</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {[...payments].sort((a,b) => (b.dueDate || '').localeCompare(a.dueDate || '')).map(payment => (
              <tr key={payment.id} className="hover:bg-slate-50/50 transition-colors group">
                <td className="px-8 py-5">
                  <p className="font-black text-slate-700">{payment.playerName}</p>
                </td>
                <td className="px-8 py-5 text-center text-[10px] font-bold text-slate-500 uppercase">{payment.month}</td>
                <td className="px-8 py-5 text-center font-mono text-sm font-black text-slate-700">R$ {payment.amount.toFixed(2)}</td>
                <td className="px-8 py-5 text-center">
                  <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${getStatusColor(payment.status)}`}>
                    {getStatusIcon(payment.status)}
                    {translateStatus(payment.status)}
                  </span>
                </td>
                <td className="px-8 py-5 text-center text-[10px] font-bold text-slate-500 uppercase">
                  {new Date(payment.dueDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                </td>
                <td className="px-8 py-5 text-right">
                  {userRole === 'ADMIN' ? (
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setEditingPayment(payment); setIsPaymentFormOpen(true); }} className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => deletePayment(payment.id)} className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-300 font-bold uppercase tracking-widest">Somente Leitura</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {[...payments].sort((a,b) => (b.dueDate || '').localeCompare(a.dueDate || '')).map(payment => (
          <div key={payment.id} className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="text-xl font-black text-slate-800">{payment.playerName}</h4>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Referência: {payment.month}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black text-slate-800 font-mono">R$ {payment.amount.toFixed(2)}</p>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2">
              <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${getStatusColor(payment.status)}`}>
                {getStatusIcon(payment.status)}
                {translateStatus(payment.status)}
              </span>
              <span className="bg-slate-100 text-slate-600 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-200">
                Vence em: {new Date(payment.dueDate + 'T00:00:00').toLocaleDateString('pt-BR')}
              </span>
            </div>

            {userRole === 'ADMIN' && (
              <div className="flex gap-3 pt-2 border-t border-slate-100">
                <button 
                  onClick={() => { setEditingPayment(payment); setIsPaymentFormOpen(true); }} 
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-indigo-50 text-indigo-600 rounded-xl font-black text-xs uppercase tracking-widest"
                >
                  <Edit2 className="w-4 h-4" /> Editar
                </button>
                <button 
                  onClick={() => deletePayment(payment.id)} 
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-rose-50 text-rose-600 rounded-xl font-black text-xs uppercase tracking-widest"
                >
                  <Trash2 className="w-4 h-4" /> Excluir
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
