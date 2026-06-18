import React from 'react';
import { motion } from 'motion/react';
import { 
  CreditCard, 
  CheckCircle2, 
  Clock, 
  XCircle,
  Calendar,
  DollarSign,
  Trash2,
  Copy
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
  const [toastMessage, setToastMessage] = React.useState('');

  // Se for Admin, usa os pagamentos do store global (que já estão sendo sincronizados)
  // Se for Membro, carrega apenas os seus próprios pagamentos via query segura
  React.useEffect(() => {
    if (userRole === 'ADMIN') {
      setLocalPayments(storePayments);
      setLoading(false);
    }
  }, [userRole, storePayments]);

  React.useEffect(() => {
    if (userRole === 'ADMIN') return;

    if (!playerId) {
      setLoading(false);
      return;
    }

    console.info('MyPaymentsView: Carregando pagamentos via query para sócio:', playerId);
    
    const q = query(collection(db, 'payments'), where('playerId', '==', playerId));
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
  }, [playerId, userRole]);

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

      <div className="grid grid-cols-1 gap-4 max-w-md">
        <div className="bg-black/40 backdrop-blur-xl p-6 rounded-[2rem] border border-white/5 border-l-[6px] border-l-brand-primary shadow-2xl">
          <p className="text-[10px] font-black text-brand-primary uppercase tracking-[0.2em] mb-2">Valor Mensalidade</p>
          <p className="text-3xl font-black text-white font-mono tracking-tighter">R$ {(systemMetadata.monthlyFee || 0).toFixed(2)}</p>
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

      {/* Área Pagar PIX */}
      <div className="bg-black/40 backdrop-blur-xl p-6 rounded-[2.5rem] border border-brand-primary/40 shadow-2xl flex flex-col md:flex-row items-center gap-6 mt-8">
        <div className="bg-white p-3 rounded-2xl border border-brand-primary/40 flex-shrink-0 shadow-lg">
          <img 
            src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=00020126580014BR.GOV.BCB.PIX01360a037bb4-fce6-4971-b751-a6185cde5f6d520400005303986540550.005802BR5925Elizabeth de Souza Santos6009SAO PAULO62140510wu4xDTVIft63040EA7" 
            alt="Pix QR Code" 
            className="w-32 h-32 md:w-36 md:h-36 object-contain"
            referrerPolicy="no-referrer"
          />
        </div>
        <div className="flex-1 space-y-3 text-center md:text-left w-full">
          <div className="space-y-1">
            <h3 className="text-lg font-black text-brand-primary uppercase tracking-tight flex items-center justify-center md:justify-start gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-primary animate-pulse" />
              QR Code de Pagamento Inteligente
            </h3>
            <p className="text-xs font-semibold text-white/60">
              Aponte a câmera do celular para pagar diretamente via Pix, ou copie o código "Copia e Cola" abaixo. Após a transferência pelo seu banco, lembre-se de enviar o comprovante ao administrador.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
            <div className="w-full sm:flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 font-mono text-[10px] text-white/40 truncate text-left">
              00020126580014BR.GOV.BCB.PIX01360a037bb4-fce6-4971-b751-a6185cde5f6d520400005303986540550.005802BR5925Elizabeth de Souza Santos6009SAO PAULO62140510wu4xDTVIft63040EA7
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText("00020126580014BR.GOV.BCB.PIX01360a037bb4-fce6-4971-b751-a6185cde5f6d520400005303986540550.005802BR5925Elizabeth de Souza Santos6009SAO PAULO62140510wu4xDTVIft63040EA7");
                setToastMessage("Pix Copia e Cola copiado! ⚡");
                setTimeout(() => setToastMessage(""), 3500);
              }}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-brand-primary text-brand-secondary rounded-xl font-black text-[10px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-md shadow-brand-primary/10 hover:bg-brand-primary/95"
              title="Copiar código Pix Copia e Cola"
            >
              <Copy className="w-4 h-4" />
              Copiar Código
            </button>
          </div>
          
          <div className="text-[10px] font-bold text-brand-primary/60 uppercase tracking-wider flex flex-wrap gap-x-4 gap-y-1 justify-center md:justify-start">
            <span>👤 Favorecido: Elizabeth de Souza Santos</span>
            <span>🏦 Banco: NUBANK</span>
          </div>
        </div>
      </div>

      {/* Toast Message */}
      {toastMessage && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl flex items-center gap-2 z-50 animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle2 className="w-5 h-5" />
          {toastMessage}
        </div>
      )}
    </div>
  );
};
