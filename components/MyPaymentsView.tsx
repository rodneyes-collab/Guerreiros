import React from 'react';
import { motion } from 'motion/react';
import { 
  CreditCard, 
  CheckCircle2, 
  Clock, 
  XCircle,
  Calendar,
  DollarSign,
  Trash2
} from 'lucide-react';
import { useStore } from '../store';
import { PaymentStatus, Payment } from '../types';
import { useAppLogic } from '@/src/hooks/useAppLogic';
import { 
  db, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  auth, 
  handleFirestoreError, 
  OperationType 
} from '../firebase';

interface MyPaymentsViewProps {
  playerId: string;
}

export const MyPaymentsView: React.FC<MyPaymentsViewProps> = ({ playerId }) => {
  const { payments: storePayments, setPayments, systemMetadata, userRole } = useStore();
  const { deletePayment } = useAppLogic();
  const [localPayments, setLocalPayments] = React.useState<Payment[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Se for Admin, usa os pagamentos do store global (que já estão sendo sincronizados)
  // Se for Membro, carrega apenas os seus próprios pagamentos via query segura
  React.useEffect(() => {
    if (userRole === 'ADMIN') {
      setLocalPayments(storePayments);
      setLoading(false);
      return;
    }

    if (!playerId) {
      setLoading(false);
      return;
    }

    console.info('MyPaymentsView: Carregando pagamentos via query para sócio:', playerId);
    
    // Use playerUid (Auth UID) for more secure and rule-compliant filtering
    const userUid = auth.currentUser?.uid;
    if (!userUid) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'payments'), where('playerUid', '==', userUid));
    const unsub = onSnapshot(q, (snap) => {
      const list: Payment[] = [];
      snap.forEach((doc) => list.push({ ...doc.data(), id: doc.id } as Payment));
      setLocalPayments(list);
      setLoading(false);
    }, (err) => {
      console.error('Erro ao carregar pagamentos do sócio:', err);
      handleFirestoreError(err, OperationType.GET, 'payments_query');
      setLoading(false);
    });

    return () => unsub();
  }, [playerId, userRole, storePayments]);

  const myPayments = React.useMemo(() => {
    return localPayments
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [localPayments]);

  const formatMonth = (m: string) => {
    if (!m) return '';
    try {
      const [year, month] = m.split('-');
      const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('pt-BR', { month: 'long' });
      return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)}/${year}`;
    } catch (e) {
      return m;
    }
  };

  const getStatusIcon = (status: PaymentStatus) => {
    switch (status) {
      case PaymentStatus.PAID: return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
      case PaymentStatus.PENDING: return <Clock className="w-5 h-5 text-amber-500" />;
      case PaymentStatus.OVERDUE: return <XCircle className="w-5 h-5 text-rose-500" />;
    }
  };

  const getStatusColor = (status: PaymentStatus) => {
    switch (status) {
      case PaymentStatus.PAID: return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case PaymentStatus.PENDING: return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case PaymentStatus.OVERDUE: return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
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
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col gap-2">
        <h2 className="text-4xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
          <CreditCard className="w-10 h-10 text-brand-primary" />
          Meus Pagamentos
        </h2>
        <p className="text-sm font-bold text-white/40 uppercase tracking-widest">Acompanhe seu histórico de mensalidades</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-black/40 backdrop-blur-xl p-6 rounded-[2rem] border border-white/5 border-l-[6px] border-l-brand-primary shadow-2xl">
          <p className="text-[10px] font-black text-brand-primary uppercase tracking-[0.2em] mb-2">Valor Mensalidade</p>
          <p className="text-3xl font-black text-white font-mono tracking-tighter">R$ {(systemMetadata.monthlyFee || 0).toFixed(2)}</p>
        </div>
        
        <div className="bg-black/40 backdrop-blur-xl p-6 rounded-[2rem] border border-white/5 border-l-[6px] border-l-emerald-500 shadow-2xl">
          <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-2">Total Pago</p>
          <p className="text-3xl font-black text-white font-mono tracking-tighter">
            R$ {myPayments.filter(p => p.status === PaymentStatus.PAID).reduce((acc, p) => acc + p.amount, 0).toFixed(2)}
          </p>
        </div>

        <div className="bg-black/40 backdrop-blur-xl p-6 rounded-[2rem] border border-white/5 border-l-[6px] border-l-amber-500 shadow-2xl">
          <p className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em] mb-2">Pendências</p>
          <p className="text-3xl font-black text-white font-mono tracking-tighter">
            {myPayments.filter(p => p.status !== PaymentStatus.PAID).length} Meses
          </p>
        </div>
      </div>

      <div className="bg-black/20 rounded-[2.5rem] border border-white/5 overflow-hidden shadow-2xl">
        {myPayments.length === 0 ? (
          <div className="p-20 text-center space-y-4">
            <Calendar className="w-16 h-16 text-white/5 mx-auto" />
            <p className="text-sm font-bold text-white/20 uppercase tracking-widest">Nenhum registro de pagamento encontrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/5 border-b border-white/5">
                  <th className="px-8 py-6 text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Mês Referência</th>
                  <th className="px-8 py-6 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] text-center">Valor</th>
                  <th className="px-8 py-6 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] text-center">Vencimento</th>
                  <th className="px-8 py-6 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] text-center">Data Pagamento</th>
                  <th className="px-8 py-6 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {myPayments.map((payment) => (
                  <motion.tr 
                    key={payment.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-white/5 transition-colors group"
                  >
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-brand-primary/10 rounded-lg border border-brand-primary/20">
                          <Calendar className="w-4 h-4 text-brand-primary" />
                        </div>
                        <p className="font-black text-white uppercase tracking-tight">{formatMonth(payment.month)}</p>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <p className="font-mono font-black text-white">R$ {payment.amount.toFixed(2)}</p>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <p className="text-xs font-bold text-white/40">
                        {payment.dueDate ? new Date(payment.dueDate + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
                      </p>
                    </td>
                    <td className="px-8 py-6 text-center">
                      {payment.paymentDate ? (
                        <div className="flex flex-col items-center gap-1">
                          <p className="text-xs font-black text-emerald-500">
                            {new Date(payment.paymentDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                          </p>
                          {payment.method && (
                            <span className="text-[8px] font-black uppercase text-white/20">{payment.method}</span>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs font-bold text-white/10 italic">Não realizado</p>
                      )}
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${getStatusColor(payment.status)}`}>
                          {getStatusIcon(payment.status)}
                          {translateStatus(payment.status)}
                        </span>
                        {userRole === 'ADMIN' && (
                          <button 
                            onClick={() => deletePayment(payment.id)} 
                            className="p-2 text-white/40 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"
                            title="Excluir pagamento"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        {payment.status === PaymentStatus.PENDING && userRole !== 'ADMIN' && (
                          <button 
                            onClick={() => deletePayment(payment.id)} 
                            className="p-2 text-white/40 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"
                            title="Excluir pagamento"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-brand-primary/5 rounded-[2rem] border border-brand-primary/20 p-6 flex items-start gap-4">
        <div className="p-3 bg-brand-primary/20 rounded-2xl">
          <DollarSign className="w-6 h-6 text-brand-primary" />
        </div>
        <div>
          <h4 className="text-sm font-black text-white uppercase tracking-tight">Instruções para Pagamento</h4>
          <p className="text-xs font-medium text-white/60 mt-1 leading-relaxed">
            Realize o pagamento via PIX para a chave informada pelo administrador. 
            Após o pagamento, envie o comprovante no privado para que sua situação seja regularizada no sistema.
          </p>
        </div>
      </div>
    </div>
  );
};
