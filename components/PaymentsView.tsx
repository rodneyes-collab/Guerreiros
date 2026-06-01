import React, { useState, useMemo, useEffect } from 'react';
import { useStore } from '../store';
import { Payment, PaymentStatus, Expense } from '../types';
import { db, doc, updateDoc, getFirestoreDateKey } from '../firebase';
import { 
  Trash2, 
  Plus, 
  Edit2,
  CheckCircle2,
  Clock,
  XCircle,
  Filter,
  X,
  CreditCard,
  DollarSign,
  MessageSquare,
  Copy,
  History,
  ExternalLink,
  TrendingUp,
  Shield
} from 'lucide-react';

import { HelpTooltip } from '../src/components/HelpTooltip';
import { capitalizeName } from '../utils/helpers';

interface PaymentsViewProps {
  deletePayment: (id: string) => void;
  setEditingPayment: (payment: Payment | null) => void;
  setIsPaymentFormOpen: (open: boolean) => void;
  deleteExpense: (id: string) => void;
  setEditingExpense: (expense: Expense | null) => void;
  setIsExpenseFormOpen: (open: boolean) => void;
  updateMonthlyFee: (fee: number) => void;
}

export const PaymentsView: React.FC<PaymentsViewProps> = ({
  deletePayment,
  setEditingPayment,
  setIsPaymentFormOpen,
  deleteExpense,
  setEditingExpense,
  setIsExpenseFormOpen,
  updateMonthlyFee
}) => {
  const { payments, expenses, userRole, systemMetadata, players: allPlayers } = useStore();
  const players = React.useMemo(() => allPlayers.filter(p => (p.status === 'active' || !p.status || p.status === '') && !p.isDM), [allPlayers]);
  const [activeTab, setActiveTab] = useState<'RECEIPTS' | 'EXPENSES' | 'COMPLIANCE' | 'STATEMENT'>('RECEIPTS');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterPlayer, setFilterPlayer] = useState('');
  const [filterStatus, setFilterStatus] = useState<PaymentStatus | ''>('');
  const [isEditingFee, setIsEditingFee] = useState(false);
  const [tempFee, setTempFee] = useState(systemMetadata.monthlyFee || 0);
  const [toastMessage, setToastMessage] = useState('');

  const copyList = (statusType: 'PAID' | 'UNPAID', label: string) => {
    if (!filterMonth) {
      setToastMessage('Selecione um mês!');
      setTimeout(() => setToastMessage(''), 3000);
      return;
    }

    const filtered = players.filter(player => {
      const payment = payments.find(p => p.playerId === player.id && p.month === filterMonth);
      const status = getCalculatedStatus(payment, player.id, filterMonth);
      if (statusType === 'PAID') return status === PaymentStatus.PAID;
      return status !== PaymentStatus.PAID;
    }).sort((a, b) => a.name.localeCompare(b.name));

    let text = `Lista de Sócios - ${formatMonth(filterMonth)} (${label})\n\n`;
    filtered.forEach((player, index) => {
      text += `${index + 1}. ${player.name}\n`;
    });

    navigator.clipboard.writeText(text).then(() => {
      setToastMessage(`Lista de ${label} copiada!`);
      setTimeout(() => setToastMessage(''), 3000);
    }).catch(err => {
      console.error('Erro ao copiar: ', err);
      setToastMessage('Erro ao copiar');
      setTimeout(() => setToastMessage(''), 3000);
    });
  };

  const generateWhatsAppReport = () => {
    if (!filterMonth) return;

    const sortedPlayers = [...players].sort((a, b) => a.name.localeCompare(b.name));
    
    const [year, month] = filterMonth.split('-');
    const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('pt-BR', { month: 'long' }).toUpperCase();
    const feeAmount = (systemMetadata.monthlyFee || 0).toFixed(2).replace('.', ',');

    let reportText = `Pagamento Mensal - ${monthName}\n\n`;
    reportText += `*Local: Santos Dumont*\n`;
    reportText += `*Horário: 19:30 às 22 h*\n\n`;
    reportText += `*R$ ${feeAmount}*\n\n`;
    reportText += `*Pagamento até dia 05 - de cada mês*\n\n`;
    reportText += `*PIX: 81988006345*\n`;
    reportText += `*NUBANK*\n`;
    reportText += `*ELIZABETH DE SOUZA SANTOS*\n`;
    reportText += `https://nubank.com.br/cobrar/35905/69d5455a-6fc4-4801-9678-833bbe2d425f\n\n`;

    sortedPlayers.forEach((player, index) => {
      const payment = payments.find(p => p.playerId === player.id && p.month === filterMonth);
      const status = getCalculatedStatus(payment, player.id, filterMonth);
      
      let icon = '';
      if (status === PaymentStatus.PAID) icon = '✅';

      reportText += `${index + 1}.\t${player.name}${icon}\n`;
    });

    reportText += `*MANDAR COMPROVANTE DO PAGAMENTO NO MEU PRIVADO, POR GENTILEZA*💥`;

    navigator.clipboard.writeText(reportText).then(() => {
      setToastMessage('Relatório copiado!');
      setTimeout(() => setToastMessage(''), 5000);
    }).catch(err => {
      console.error('Erro ao copiar relatório: ', err);
      setToastMessage('Erro ao copiar');
      setTimeout(() => setToastMessage(''), 5000);
    });
  };

  useEffect(() => {
    if (!isEditingFee) {
      setTempFee(systemMetadata.monthlyFee || 0);
    }
  }, [systemMetadata.monthlyFee, isEditingFee]);

  const uniqueMonths = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const months = new Set([currentMonth, ...payments.map(p => p.month), ...expenses.map(e => e.month)]);
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [payments, expenses]);

  const formatMonth = (m: string) => {
    if (!m) return '';
    const [year, month] = m.split('-');
    const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('pt-BR', { month: 'long' });
    return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)}/${year}`;
  };

  const uniquePlayers = useMemo(() => {
    const playersInPayments = new Set(payments.map(p => p.playerId));
    const names = allPlayers
      .filter(p => playersInPayments.has(p.id) && !p.isDM)
      .map(p => p.name);
    return Array.from(new Set(names)).sort();
  }, [payments, allPlayers]);

  const getCalculatedStatus = (payment: Payment | undefined, playerId: string, monthStr: string) => {
    const player = allPlayers.find(p => p.id === playerId);
    if (player?.isExempt) return PaymentStatus.PAID;
    
    if (payment && payment.status === PaymentStatus.PAID) {
      return PaymentStatus.PAID;
    }
    
    if (!monthStr) return payment ? payment.status : PaymentStatus.PENDING;

    const today = new Date();
    const [year, month] = monthStr.split('-');
    const fifthDay = new Date(parseInt(year), parseInt(month) - 1, 5);
    fifthDay.setHours(23, 59, 59, 999);

    if (today > fifthDay) {
      return PaymentStatus.OVERDUE;
    }

    return PaymentStatus.PENDING;
  };

  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      const player = allPlayers.find(ap => ap.id === p.playerId);
      if (!player || player.isDM) return false;
      
      const matchMonth = !filterMonth || p.month === filterMonth;
      const matchDate = !filterDate || p.paymentDate === filterDate;
      const matchPlayer = !filterPlayer || p.playerName === filterPlayer;
      const calculatedStatus = getCalculatedStatus(p, p.playerId, p.month);
      const matchStatus = !filterStatus || calculatedStatus === filterStatus;
      return matchMonth && matchDate && matchPlayer && matchStatus;
    }).sort((a,b) => (a.playerName || '').localeCompare(b.playerName || ''));
  }, [payments, filterMonth, filterDate, filterPlayer, filterStatus]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      const matchMonth = !filterMonth || e.month === filterMonth;
      const matchDate = !filterDate || e.date === filterDate;
      return matchMonth && matchDate;
    }).sort((a,b) => b.date.localeCompare(a.date));
  }, [expenses, filterMonth, filterDate]);

  const summary = useMemo(() => {
    const receipts = filteredPayments.reduce((acc, p) => {
      const calculatedStatus = getCalculatedStatus(p, p.playerId, p.month);
      if (calculatedStatus === PaymentStatus.PAID) acc.paid += p.amount;
      else if (calculatedStatus === PaymentStatus.PENDING) acc.pending += p.amount;
      else if (calculatedStatus === PaymentStatus.OVERDUE) acc.overdue += p.amount;
      return acc;
    }, { paid: 0, pending: 0, overdue: 0 });

    const totalExpenses = filteredExpenses.reduce((acc, e) => acc + e.amount, 0);
    
    // Orçamento Mensal = Total de sócios ativos * valor da mensalidade (se um mês estiver selecionado)
    const activePlayersCount = players.length;
    const monthlyBudget = filterMonth ? (activePlayersCount * (systemMetadata.monthlyFee || 0)) : 0;

    return { 
      ...receipts, 
      expenses: totalExpenses, 
      balance: receipts.paid - totalExpenses,
      budget: monthlyBudget
    };
  }, [filteredPayments, filteredExpenses, players.length, systemMetadata.monthlyFee, filterMonth]);

  const combinedTransactions = useMemo(() => {
    const paidReceipts = filteredPayments.filter(p => getCalculatedStatus(p, p.playerId, p.month) === PaymentStatus.PAID).map(p => ({
      id: p.id,
      date: p.paymentDate || p.dueDate,
      description: `Mensalidade: ${p.playerName} (${formatMonth(p.month)})`,
      amount: p.amount,
      type: 'INCOME' as const,
      category: 'Mensalidade'
    }));

    const expenseItems = filteredExpenses.map(e => ({
      id: e.id,
      date: e.date,
      description: e.description,
      amount: e.amount,
      type: 'EXPENSE' as const,
      category: e.category
    }));

    // Sort oldest to newest to calculate running balance correctly
    const sorted = [...paidReceipts, ...expenseItems].sort((a, b) => a.date.localeCompare(b.date));
    
    let currentBalance = 0;
    const withBalance = sorted.map(t => {
      if (t.type === 'INCOME') {
        currentBalance += t.amount;
      } else {
        currentBalance -= t.amount;
      }
      return { ...t, balance: currentBalance };
    });

    // Return oldest to newest for display (ascending order)
    return withBalance;
  }, [filteredPayments, filteredExpenses, filterMonth]);

  const generateStatementReport = () => {
    if (combinedTransactions.length === 0) {
      setToastMessage('Nenhum lançamento no extrato!');
      setTimeout(() => setToastMessage(''), 3000);
      return;
    }

    const monthLabel = filterMonth ? formatMonth(filterMonth) : 'Geral';
    const todayStr = new Date().toLocaleDateString('pt-BR');
    
    let reportText = `======================================\n`;
    reportText += `       EXTRATO DE CONTA CORRENTE       \n`;
    reportText += `          GUERREIROS VC - CLUBE       \n`;
    reportText += `======================================\n`;
    reportText += `Data Emissão: ${todayStr}\n`;
    reportText += `Período: ${monthLabel}\n`;
    reportText += `--------------------------------------\n`;
    reportText += `RESUMO DO PERÍODO:\n`;
    reportText += `Receitas:      R$ ${summary.paid.toFixed(2).padStart(10)}\n`;
    reportText += `Despesas:      R$ ${summary.expenses.toFixed(2).padStart(10)}\n`;
    reportText += `Saldo Período: R$ ${summary.balance.toFixed(2).padStart(10)}\n`;
    reportText += `--------------------------------------\n\n`;
    reportText += `DATA       DESCRIÇÃO                VALOR          SALDO\n`;
    reportText += `---------- ----------------------- ------------ ------------------\n`;

    combinedTransactions.forEach(t => {
      const date = new Date(t.date + 'T00:00:00').toLocaleDateString('pt-BR');
      const desc = t.description.substring(0, 23).padEnd(23);
      const amount = (t.type === 'INCOME' ? '+' : '-') + ' R$ ' + t.amount.toFixed(2);
      const balance = 'SALDO R$ ' + t.balance.toFixed(2);
      reportText += `${date} ${desc} ${amount.padStart(12)} ${balance.padStart(18)}\n`;
    });

    reportText += `\n--------------------------------------\n`;
    reportText += `SALDO ATUAL:   R$ ${summary.balance.toFixed(2).padStart(10)}\n`;
    reportText += `======================================\n`;
    reportText += `           FIM DO EXTRATO             \n`;
    reportText += `======================================`;

    navigator.clipboard.writeText(reportText).then(() => {
      setToastMessage('Extrato bancário copiado!');
      setTimeout(() => setToastMessage(''), 3000);
    }).catch(err => {
      console.error('Erro ao copiar extrato: ', err);
      setToastMessage('Erro ao copiar extrato');
      setTimeout(() => setToastMessage(''), 3000);
    });
  };

  useEffect(() => {
    const migrateData = async () => {
      const monthMap: Record<string, string> = {
        'janeiro': '01', 'fevereiro': '02', 'março': '03', 'marco': '03',
        'abril': '04', 'maio': '05', 'junho': '06', 'julho': '07',
        'agosto': '08', 'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12'
      };

      const getNewMonth = (oldMonth: string) => {
        if (!oldMonth || oldMonth.match(/^\d{4}-\d{2}$/)) return null;
        const parts = oldMonth.toLowerCase().split('/');
        if (parts.length === 2) {
          const m = monthMap[parts[0].trim()];
          const y = parts[1].trim();
          if (m && y.length === 4) return `${y}-${m}`;
        }
        return null;
      };

      let hasMigrations = false;

      for (const p of payments) {
        const newMonth = getNewMonth(p.month);
        if (newMonth) {
          try {
            await updateDoc(doc(db, 'payments', p.id), { month: newMonth });
            hasMigrations = true;
          } catch (e) { console.error(e); }
        }
      }

      for (const e of expenses) {
        const newMonth = getNewMonth(e.month);
        if (newMonth) {
          try {
            await updateDoc(doc(db, 'expenses', e.id), { month: newMonth });
            hasMigrations = true;
          } catch (err) { console.error(err); }
        }
      }
      
      if (hasMigrations) {
        console.log("Migração de meses concluída com sucesso.");
      }
    };

    if (userRole === 'ADMIN') {
      migrateData();
    }
  }, [payments, expenses, userRole]);

  const handleUpdateFee = () => {
    updateMonthlyFee(tempFee);
    setIsEditingFee(false);
  };

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
          <h2 className="text-4xl font-black text-white uppercase tracking-tighter flex items-center">
            Financeiro
            <HelpTooltip 
              title="Gestão Financeira" 
              content="Acompanhe o pagamento das mensalidades e as despesas do grupo. Administradores podem registrar pagamentos, adicionar despesas e gerar relatórios para o WhatsApp."
            />
          </h2>
          <p className="text-sm font-bold text-white/40 uppercase tracking-widest mt-2">Gestão de mensalidades e despesas</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
          {userRole === 'ADMIN' && (
            <div className="bg-black/40 px-6 py-4 rounded-[2rem] border border-white/5 border-l-[6px] border-l-brand-primary shadow-2xl flex items-center gap-6 backdrop-blur-xl group hover:border-brand-primary/40 transition-all">
              <div className="p-3 bg-brand-primary/10 rounded-2xl border border-brand-primary/40 group-hover:bg-brand-primary/20 transition-colors">
                <DollarSign className="w-5 h-5 text-brand-primary" />
              </div>
              <div className="space-y-1">
                <p className="text-[9px] font-black text-brand-primary uppercase tracking-[0.3em]">Mensalidade Sócio</p>
                {isEditingFee ? (
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-brand-primary">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={tempFee}
                        onChange={e => setTempFee(parseFloat(e.target.value))}
                        className="w-28 bg-black/60 border border-brand-primary/30 rounded-xl pl-8 pr-3 py-2 font-black text-sm text-white outline-none focus:border-brand-primary transition-all shadow-inner"
                        autoFocus
                      />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleUpdateFee} className="p-2 bg-brand-primary text-brand-secondary rounded-xl hover:scale-110 transition-transform shadow-lg shadow-brand-primary/20"><CheckCircle2 className="w-4 h-4" /></button>
                      <button onClick={() => { setIsEditingFee(false); setTempFee(systemMetadata.monthlyFee || 0); }} className="p-2 bg-rose-500/10 text-rose-500 rounded-xl hover:scale-110 transition-transform border border-rose-500/20"><X className="w-4 h-4" /></button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-4">
                    <p className="text-2xl font-black text-white font-mono tracking-tighter">R$ {(systemMetadata.monthlyFee || 0).toFixed(2)}</p>
                    <button onClick={() => setIsEditingFee(true)} className="p-2 text-brand-primary/40 hover:text-brand-primary hover:bg-brand-primary/10 rounded-xl transition-all border border-transparent hover:border-brand-primary/40"><Edit2 className="w-4 h-4" /></button>
                  </div>
                )}
              </div>
            </div>
          )}
          {userRole === 'ADMIN' && (
            <button 
              onClick={() => { 
                if (activeTab === 'RECEIPTS') {
                  setEditingPayment(null); 
                  setIsPaymentFormOpen(true); 
                } else {
                  setEditingExpense(null);
                  setIsExpenseFormOpen(true);
                }
              }} 
              className="bg-brand-primary text-brand-secondary px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-brand-primary/90 shadow-xl shadow-brand-primary/10 transition-all"
            >
              <Plus className="w-5 h-5" />
              {activeTab === 'RECEIPTS' ? 'Novo Lançamento' : 'Nova Despesa'}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-white/5 backdrop-blur-md rounded-[1.5rem] w-fit border border-brand-primary/40">
        <button
          onClick={() => setActiveTab('RECEIPTS')}
          className={`px-4 py-2 sm:px-8 sm:py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${
            activeTab === 'RECEIPTS' 
              ? 'bg-brand-primary text-brand-secondary shadow-xl shadow-brand-primary/20' 
              : 'text-white/40 hover:text-white hover:bg-white/5'
          }`}
        >
          Mensalidades
        </button>
        <button
          onClick={() => setActiveTab('EXPENSES')}
          className={`px-4 py-2 sm:px-8 sm:py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${
            activeTab === 'EXPENSES' 
              ? 'bg-brand-primary text-brand-secondary shadow-xl shadow-brand-primary/20' 
              : 'text-white/40 hover:text-white hover:bg-white/5'
          }`}
        >
          Despesas do Clube
        </button>
        <button
          onClick={() => setActiveTab('STATEMENT')}
          className={`px-4 py-2 sm:px-8 sm:py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${
            activeTab === 'STATEMENT' 
              ? 'bg-brand-primary text-brand-secondary shadow-xl shadow-brand-primary/20' 
              : 'text-white/40 hover:text-white hover:bg-white/5'
          }`}
        >
          Extrato
        </button>
      </div>

      {/* Financial Summary Dashboard */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-black backdrop-blur-xl p-4 sm:p-6 rounded-[2rem] border border-white/5 border-l-[6px] border-l-brand-primary shadow-sm">
          <p className="text-[9px] sm:text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">Saldo Atual</p>
          <p className={`text-xl sm:text-2xl font-black font-mono ${summary.balance >= 0 ? 'text-brand-primary' : 'text-rose-500'}`}>
            R$ {summary.balance.toFixed(2)}
          </p>
        </div>

        <div className="bg-black backdrop-blur-xl p-4 sm:p-6 rounded-[2rem] border border-white/5 border-l-[6px] border-l-emerald-500 shadow-sm">
          <p className="text-[9px] sm:text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">Total Pago (Filtro)</p>
          <p className="text-xl sm:text-2xl font-black font-mono text-emerald-500">
            R$ {summary.paid.toFixed(2)}
          </p>
        </div>

        <div className="bg-black backdrop-blur-xl p-4 sm:p-6 rounded-[2rem] border border-white/5 border-l-[6px] border-l-rose-500 shadow-sm">
          <p className="text-[9px] sm:text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">Total Despesas (Filtro)</p>
          <p className="text-xl sm:text-2xl font-black font-mono text-rose-500">
            R$ {summary.expenses.toFixed(2)}
          </p>
        </div>

        {filterMonth && (
          <div className="bg-white/5 backdrop-blur-xl p-4 sm:p-6 rounded-[2rem] border border-brand-primary/40 shadow-sm col-span-2 lg:col-span-1">
            <p className="text-[9px] sm:text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">Orçamento ({formatMonth(filterMonth)})</p>
            <div className="flex justify-between items-end">
              <p className="text-lg sm:text-xl font-black text-brand-primary font-mono">R$ {summary.budget.toFixed(2)}</p>
              <p className="text-[9px] font-bold text-white/40 mb-1">Pend: R$ {(summary.budget - summary.paid).toFixed(2)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-black backdrop-blur-xl p-4 sm:p-6 rounded-[2rem] border border-white/5 border-l-[6px] border-l-brand-primary shadow-sm grid grid-cols-2 md:flex md:flex-wrap gap-3 sm:gap-4 items-end">
        <div className="min-w-0 md:min-w-[200px] space-y-2">
          <label className="text-[10px] font-black text-brand-primary uppercase tracking-widest ml-1 flex items-center gap-2">
            <Filter className="w-3 h-3" /> Mês
          </label>
          <select
            value={filterMonth}
            onChange={e => setFilterMonth(e.target.value)}
            className="w-full px-3 py-2 sm:px-4 sm:py-3 bg-white/5 border border-brand-primary/40 rounded-xl font-bold text-white text-xs sm:text-sm outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all appearance-none backdrop-blur-sm"
          >
            <option value="" className="bg-slate-900">Todos</option>
            {uniqueMonths.map(m => (
              <option key={m} value={m} className="bg-slate-900">{formatMonth(m)}</option>
            ))}
          </select>
        </div>

        <div className="min-w-0 md:min-w-[200px] space-y-2">
          <label className="text-[10px] font-black text-brand-primary uppercase tracking-widest ml-1 flex items-center gap-2">
            <Clock className="w-3 h-3" /> Data
          </label>
          <div className="relative">
            <input
              type="date"
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              className="w-full px-3 py-2 sm:px-4 sm:py-3 bg-white/5 border border-brand-primary/40 rounded-xl font-bold text-white text-xs sm:text-sm outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all appearance-none backdrop-blur-sm"
            />
            {filterDate && (
              <button 
                onClick={() => setFilterDate('')}
                className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-rose-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {activeTab === 'RECEIPTS' && (
          <>
            <div className="min-w-0 md:min-w-[200px] space-y-2">
              <label className="text-[10px] font-black text-brand-primary uppercase tracking-widest ml-1 flex items-center gap-2">
                <Filter className="w-3 h-3" /> Sócio
              </label>
              <select
                value={filterPlayer}
                onChange={e => setFilterPlayer(e.target.value)}
                className="w-full px-3 py-2 sm:px-4 sm:py-3 bg-white/5 border border-brand-primary/40 rounded-xl font-bold text-white text-xs sm:text-sm outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all appearance-none backdrop-blur-sm"
              >
                <option value="" className="bg-slate-900">Todos</option>
                {uniquePlayers.map(p => <option key={p} value={p} className="bg-slate-900">{p}</option>)}
              </select>
            </div>

            <div className="min-w-0 md:min-w-[200px] space-y-2">
              <label className="text-[10px] font-black text-brand-primary uppercase tracking-widest ml-1 flex items-center gap-2">
                <Filter className="w-3 h-3" /> Status
              </label>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value as PaymentStatus | '')}
                className="w-full px-3 py-2 sm:px-4 sm:py-3 bg-white/5 border border-brand-primary/40 rounded-xl font-bold text-white text-xs sm:text-sm outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all appearance-none backdrop-blur-sm"
              >
                <option value="" className="bg-slate-900">Todos</option>
                <option value={PaymentStatus.PAID} className="bg-slate-900">Pago</option>
                <option value={PaymentStatus.PENDING} className="bg-slate-900">Pendente</option>
                <option value={PaymentStatus.OVERDUE} className="bg-slate-900">Atrasado</option>
              </select>
            </div>
          </>
        )}

        {activeTab === 'STATEMENT' && (
          <button
            onClick={generateStatementReport}
            className="col-span-2 md:col-span-1 flex items-center justify-center gap-2 px-6 py-3 bg-brand-primary text-brand-secondary rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-brand-primary/20 h-[38px] sm:h-[46px]"
          >
            <Copy className="w-4 h-4" /> Exportar Extrato
          </button>
        )}

        {(filterMonth || filterPlayer || filterStatus || filterDate) && (
          <button
            onClick={() => { setFilterMonth(''); setFilterPlayer(''); setFilterStatus(''); setFilterDate(''); }}
            className="col-span-2 md:col-span-1 p-2 sm:p-3 bg-white/5 text-white/40 rounded-xl hover:bg-white/10 transition-all border border-brand-primary/40 flex justify-center items-center h-[38px] sm:h-[46px]"
            title="Limpar Filtros"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        )}
      </div>

      {activeTab === 'RECEIPTS' ? (
        <>
          {/* Desktop Table View - Receipts */}
          <div className="hidden md:block bg-black backdrop-blur-xl rounded-[2rem] border border-white/5 border-l-[6px] border-l-brand-primary shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-black/40 border-b border-brand-primary/40">
                <tr>
                  <th className="px-8 py-5 text-[10px] font-black text-brand-primary uppercase tracking-widest">Sócio</th>
                  <th className="px-8 py-5 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">Mês/Ref</th>
                  <th className="px-8 py-5 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">Valor</th>
                  <th className="px-8 py-5 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">Forma</th>
                  <th className="px-8 py-5 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">Status</th>
                  <th className="px-8 py-5 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">Vencimento</th>
                  <th className="px-8 py-5 text-[10px] font-black text-brand-primary uppercase tracking-widest text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredPayments.map(payment => {
                  const status = getCalculatedStatus(payment, payment.playerId, payment.month);
                  return (
                  <tr key={payment.id} className="hover:bg-white/5 transition-colors group">
                    <td className="px-8 py-5">
                      <p className={`font-black ${status === PaymentStatus.OVERDUE ? 'text-rose-500' : 'text-white'}`}>
                        {payment.playerName}
                      </p>
                    </td>
                    <td className="px-8 py-5 text-center text-[10px] font-bold text-white/40 uppercase">{payment.month}</td>
                    <td className="px-8 py-5 text-center font-mono text-sm font-black text-white">R$ {payment.amount.toFixed(2)}</td>
                    <td className="px-8 py-5 text-center">
                      {payment.method ? (
                        <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest bg-white/5 px-2 py-1 rounded-lg border border-brand-primary/40">
                          {payment.method}
                        </span>
                      ) : (
                        <span className="text-[10px] text-white/20 italic">-</span>
                      )}
                    </td>
                    <td className="px-8 py-5 text-center">
                      <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${getStatusColor(status)}`}>
                        {getStatusIcon(status)}
                        {translateStatus(status)}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-center text-[10px] font-bold text-white/40 uppercase">
                      <div>{new Date(payment.dueDate + 'T00:00:00').toLocaleDateString('pt-BR')}</div>
                      {payment.status === PaymentStatus.PAID && payment.paymentDate && (
                        <div className="text-[8px] text-emerald-500 mt-1">Pago em: {new Date(payment.paymentDate + 'T00:00:00').toLocaleDateString('pt-BR')}</div>
                      )}
                    </td>
                    <td className="px-8 py-5 text-right">
                      {userRole === 'ADMIN' ? (
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setEditingPayment(payment); setIsPaymentFormOpen(true); }} className="p-2.5 text-white/40 hover:text-brand-primary hover:bg-white/10 rounded-xl transition-all"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => deletePayment(payment.id)} className="p-2.5 text-white/40 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-white/20 font-bold uppercase tracking-widest">Somente Leitura</span>
                      )}
                    </td>
                  </tr>
                );})}
              </tbody>
            </table>
            {filteredPayments.length === 0 && (
              <div className="p-20 text-center">
                <CreditCard className="w-12 h-12 text-white/10 mx-auto mb-4" />
                <p className="text-sm font-bold text-white/20 uppercase tracking-widest">Nenhum lançamento encontrado</p>
              </div>
            )}
          </div>

          {/* Mobile Card View - Receipts */}
          <div className="md:hidden space-y-3">
            {filteredPayments.map(payment => {
              const status = getCalculatedStatus(payment, payment.playerId, payment.month);
              return (
              <div key={payment.id} className="bg-black backdrop-blur-xl p-4 rounded-3xl border border-brand-primary/40 shadow-sm space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className={`text-lg font-black ${status === PaymentStatus.OVERDUE ? 'text-rose-500' : 'text-white'}`}>
                      {payment.playerName}
                    </h4>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-0.5">Ref: {payment.month}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-black text-white font-mono">R$ {payment.amount.toFixed(2)}</p>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border ${getStatusColor(status)}`}>
                    {getStatusIcon(status)}
                    {translateStatus(status)}
                  </span>
                  <span className="bg-white/5 text-white/60 px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border border-brand-primary/40">
                    Vence: {new Date(payment.dueDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </span>
                  {payment.method && (
                    <span className="bg-brand-primary/10 text-brand-primary px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border border-brand-primary/40">
                      {payment.method}
                    </span>
                  )}
                  {status === PaymentStatus.PAID && payment.paymentDate && (
                    <span className="bg-emerald-500/10 text-emerald-500 px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border border-emerald-500/20">
                      Pago: {new Date(payment.paymentDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </div>

                {userRole === 'ADMIN' && (
                  <div className="flex gap-2 pt-2 border-t border-white/5">
                    <button 
                      onClick={() => { setEditingPayment(payment); setIsPaymentFormOpen(true); }} 
                      className="flex-1 flex items-center justify-center gap-2 py-2 bg-white/5 text-white/60 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-brand-primary/10 hover:text-brand-primary transition-all"
                    >
                      <Edit2 className="w-3 h-3" /> Editar
                    </button>
                    <button 
                      onClick={() => deletePayment(payment.id)} 
                      className="flex-1 flex items-center justify-center gap-2 py-2 bg-rose-500/10 text-rose-500 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-500/20 transition-all"
                    >
                      <Trash2 className="w-3 h-3" /> Excluir
                    </button>
                  </div>
                )}
              </div>
            )})}
          </div>
        </>
      ) : activeTab === 'EXPENSES' ? (
        <>
          {/* Desktop Table View - Expenses */}
          <div className="hidden md:block bg-black backdrop-blur-xl rounded-[2rem] border border-white/5 border-l-[6px] border-l-brand-primary shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-black/40 border-b border-brand-primary/40">
                <tr>
                  <th className="px-8 py-5 text-[10px] font-black text-brand-primary uppercase tracking-widest">Descrição</th>
                  <th className="px-8 py-5 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">Categoria</th>
                  <th className="px-8 py-5 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">Mês/Ref</th>
                  <th className="px-8 py-5 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">Valor</th>
                  <th className="px-8 py-5 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">Data</th>
                  <th className="px-8 py-5 text-[10px] font-black text-brand-primary uppercase tracking-widest text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredExpenses.map(expense => (
                  <tr key={expense.id} className="hover:bg-white/5 transition-colors group">
                    <td className="px-8 py-5">
                      <p className="font-black text-white">{expense.description}</p>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest bg-white/5 px-3 py-1 rounded-lg border border-brand-primary/40">
                        {expense.category}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-center text-[10px] font-bold text-white/40 uppercase">{expense.month}</td>
                    <td className="px-8 py-5 text-center font-mono text-sm font-black text-rose-500">R$ {expense.amount.toFixed(2)}</td>
                    <td className="px-8 py-5 text-center text-[10px] font-bold text-white/40 uppercase">
                      {new Date(expense.date + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-8 py-5 text-right">
                      {userRole === 'ADMIN' ? (
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setEditingExpense(expense); setIsExpenseFormOpen(true); }} className="p-2.5 text-white/40 hover:text-brand-primary hover:bg-white/10 rounded-xl transition-all"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => deleteExpense(expense.id)} className="p-2.5 text-white/40 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-white/20 font-bold uppercase tracking-widest">Somente Leitura</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredExpenses.length === 0 && (
              <div className="p-20 text-center">
                <DollarSign className="w-12 h-12 text-white/10 mx-auto mb-4" />
                <p className="text-sm font-bold text-white/20 uppercase tracking-widest">Nenhuma despesa encontrada</p>
              </div>
            )}
          </div>

          {/* Mobile Card View - Expenses */}
          <div className="md:hidden space-y-3">
            {filteredExpenses.map(expense => (
              <div key={expense.id} className="bg-black backdrop-blur-xl p-4 rounded-3xl border border-brand-primary/40 shadow-sm space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-lg font-black text-white">{expense.description}</h4>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-0.5">{expense.category} • {expense.month}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-black text-rose-500 font-mono">R$ {expense.amount.toFixed(2)}</p>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  <span className="bg-white/5 text-white/60 px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border border-brand-primary/40">
                    Data: {new Date(expense.date + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </span>
                </div>

                {userRole === 'ADMIN' && (
                  <div className="flex gap-2 pt-2 border-t border-white/5">
                    <button 
                      onClick={() => { setEditingExpense(expense); setIsExpenseFormOpen(true); }} 
                      className="flex-1 flex items-center justify-center gap-2 py-2 bg-white/5 text-white/60 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-brand-primary/10 hover:text-brand-primary transition-all"
                    >
                      <Edit2 className="w-3 h-3" /> Editar
                    </button>
                    <button 
                      onClick={() => deleteExpense(expense.id)} 
                      className="flex-1 flex items-center justify-center gap-2 py-2 bg-rose-500/10 text-rose-500 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-500/20 transition-all"
                    >
                      <Trash2 className="w-3 h-3" /> Excluir
                    </button>
                  </div>
                )}
              </div>
            ))}
            {filteredExpenses.length === 0 && (
              <div className="p-12 text-center bg-brand-secondary/30 backdrop-blur-xl rounded-[2rem] border border-white/5 border-l-[6px] border-l-brand-primary">
                <DollarSign className="w-10 h-10 text-white/10 mx-auto mb-3" />
                <p className="text-xs font-bold text-white/20 uppercase tracking-widest">Nenhuma despesa encontrada</p>
              </div>
            )}
          </div>
        </>
      ) : activeTab === 'COMPLIANCE' ? (
        <>
          {/* Compliance View */}
          <div className="bg-black backdrop-blur-xl rounded-[2rem] border border-white/5 border-l-[6px] border-l-brand-primary shadow-sm overflow-hidden">
            <div className="p-4 sm:p-8 border-b border-white/5 bg-white/5">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h3 className="text-xl font-black text-white uppercase tracking-tight">Relatório de Adimplência</h3>
                  <p className="text-[10px] sm:text-xs font-bold text-white/40 uppercase tracking-widest mt-1">Status de todos os sócios para {filterMonth ? formatMonth(filterMonth) : 'todos os meses'}</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
                  <div className="flex gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-64">
                      <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                      <input
                        type="text"
                        placeholder="Buscar sócio..."
                        value={filterPlayer}
                        onChange={e => setFilterPlayer(e.target.value)}
                        className="w-full bg-white/5 border border-brand-primary/40 rounded-2xl pl-11 pr-4 py-3 text-sm font-bold text-white placeholder:text-white/20 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all backdrop-blur-sm"
                      />
                    </div>
                      <div className="flex gap-2 w-full sm:w-auto">
                        <button
                          onClick={generateWhatsAppReport}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 border border-[#25D366]/20 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all whitespace-nowrap"
                          title="Copiar relatório completo para WhatsApp"
                        >
                          <MessageSquare className="w-4 h-4" />
                          <span className="hidden sm:inline">Relatório</span>
                        </button>
                        <button
                          onClick={() => copyList('PAID', 'Pagos')}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all whitespace-nowrap"
                          title="Copiar lista de pagos"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="hidden sm:inline">Pagos</span>
                        </button>
                        <button
                          onClick={() => copyList('UNPAID', 'Pendentes')}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border border-rose-500/20 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all whitespace-nowrap"
                          title="Copiar lista de pendentes"
                        >
                          <X className="w-4 h-4" />
                          <span className="hidden sm:inline">Pendentes</span>
                        </button>
                      </div>
                  </div>
                  {filterMonth && (
                    <div className="grid grid-cols-2 sm:flex gap-2 sm:gap-4">
                      <div className="text-center p-2 sm:px-4 sm:py-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20 min-w-[80px]">
                        <p className="text-[9px] sm:text-[10px] font-black text-emerald-500 uppercase tracking-widest">Pagos</p>
                        <p className="text-base sm:text-lg font-black text-emerald-500">
                          {players.filter(player => {
                            const p = payments.find(p => p.playerId === player.id && p.month === filterMonth);
                            return getCalculatedStatus(p, player.id, filterMonth) === PaymentStatus.PAID;
                          }).length}
                        </p>
                      </div>
                      <div className="text-center p-2 sm:px-4 sm:py-2 bg-amber-500/10 rounded-xl border border-amber-500/20 min-w-[80px]">
                        <p className="text-[9px] sm:text-[10px] font-black text-amber-500 uppercase tracking-widest">Pendentes</p>
                        <p className="text-base sm:text-lg font-black text-amber-500">
                          {players.filter(player => {
                            const p = payments.find(p => p.playerId === player.id && p.month === filterMonth);
                            return getCalculatedStatus(p, player.id, filterMonth) === PaymentStatus.PENDING;
                          }).length}
                        </p>
                      </div>
                      <div className="text-center p-2 sm:px-4 sm:py-2 bg-rose-500/10 rounded-xl border border-rose-500/20 min-w-[80px]">
                        <p className="text-[9px] sm:text-[10px] font-black text-rose-500 uppercase tracking-widest">Atrasados</p>
                        <p className="text-base sm:text-lg font-black text-rose-500">
                          {players.filter(player => {
                            const p = payments.find(p => p.playerId === player.id && p.month === filterMonth);
                            return getCalculatedStatus(p, player.id, filterMonth) === PaymentStatus.OVERDUE;
                          }).length}
                        </p>
                      </div>
                      <div className="text-center p-2 sm:px-4 sm:py-2 bg-white/5 rounded-xl border border-brand-primary/40 min-w-[100px]">
                        <p className="text-[9px] sm:text-[10px] font-black text-brand-primary uppercase tracking-widest">Total Pago</p>
                        <p className="text-base sm:text-lg font-black text-brand-primary font-mono">
                          R$ {payments.filter(p => p.month === filterMonth && p.status === PaymentStatus.PAID).reduce((acc, p) => acc + p.amount, 0).toFixed(0)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-black/40 border-b border-brand-primary/40">
                  <tr>
                    <th className="px-8 py-5 text-[10px] font-black text-brand-primary uppercase tracking-widest">Sócio</th>
                    <th className="px-8 py-5 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">Status ({formatMonth(filterMonth)})</th>
                    <th className="px-8 py-5 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">Valor</th>
                    <th className="px-8 py-5 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">Data Pagto</th>
                    <th className="px-8 py-5 text-[10px] font-black text-brand-primary uppercase tracking-widest text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {players
                    .filter(player => !filterPlayer || player.name.toLowerCase().includes(filterPlayer.toLowerCase()))
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(player => {
                      const payment = payments.find(p => p.playerId === player.id && p.month === filterMonth);
                      const status = getCalculatedStatus(payment, player.id, filterMonth);
                      
                      return (
                        <tr key={player.id} className="hover:bg-white/5 transition-colors group">
                          <td className="px-8 py-5">
                            <p className="font-bold text-white text-sm">{capitalizeName(player.name)}</p>
                            <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">{player.gender === 'MALE' ? 'Sócio' : 'Sócia'}</p>
                          </td>
                          <td className="px-8 py-5 text-center">
                            <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${getStatusColor(status)}`}>
                              {getStatusIcon(status)}
                              {translateStatus(status)}
                            </span>
                          </td>
                          <td className="px-8 py-5 text-center font-mono text-sm font-black text-white">
                            {payment ? `R$ ${payment.amount.toFixed(2)}` : '-'}
                          </td>
                          <td className="px-8 py-5 text-center text-[10px] font-bold text-white/40 uppercase">
                            {payment?.paymentDate ? new Date(payment.paymentDate + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
                          </td>
                          <td className="px-8 py-5 text-right">
                            {userRole === 'ADMIN' && (
                              <button 
                                onClick={() => {
                                  if (payment) {
                                    setEditingPayment(payment);
                                    setIsPaymentFormOpen(true);
                                  } else {
                                    setEditingPayment({
                                      id: '',
                                      playerId: player.id,
                                      playerName: player.name,
                                      amount: systemMetadata.monthlyFee || 0,
                                      month: filterMonth,
                                      dueDate: getFirestoreDateKey(),
                                      status: PaymentStatus.PENDING
                                    });
                                    setIsPaymentFormOpen(true);
                                  }
                                }}
                                className="p-2.5 text-brand-primary hover:bg-white/10 rounded-xl transition-all font-black text-[10px] uppercase tracking-widest"
                              >
                                {payment ? 'Editar' : 'Lançar'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View - Compliance */}
            <div className="md:hidden divide-y divide-white/5">
              {players
                .filter(player => !filterPlayer || player.name.toLowerCase().includes(filterPlayer.toLowerCase()))
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(player => {
                  const payment = payments.find(p => p.playerId === player.id && p.month === filterMonth);
                  const status = getCalculatedStatus(payment, player.id, filterMonth);
                  
                  return (
                    <div key={player.id} className="p-4 flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-white text-sm truncate">{capitalizeName(player.name)}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest border ${getStatusColor(status)}`}>
                            {getStatusIcon(status)}
                            {translateStatus(status)}
                          </span>
                          {payment?.paymentDate && (
                            <span className="text-[9px] font-bold text-white/40 uppercase">
                              {new Date(payment.paymentDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="text-right flex flex-col items-end gap-1">
                        <span className="font-mono text-sm font-black text-white">
                          {payment ? `R$ ${payment.amount.toFixed(2)}` : '-'}
                        </span>
                        {userRole === 'ADMIN' && (
                          <button 
                            onClick={() => {
                              if (payment) {
                                setEditingPayment(payment);
                                setIsPaymentFormOpen(true);
                              } else {
                                setEditingPayment({
                                  id: '',
                                  playerId: player.id,
                                  playerName: player.name,
                                  amount: systemMetadata.monthlyFee || 0,
                                  month: filterMonth,
                                  dueDate: getFirestoreDateKey(),
                                  status: PaymentStatus.PENDING
                                });
                                setIsPaymentFormOpen(true);
                              }
                            }}
                            className="text-brand-primary hover:bg-white/10 px-2 py-1 rounded-lg transition-all font-black text-[9px] uppercase tracking-widest"
                          >
                            {payment ? 'Editar' : 'Lançar'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-6">
          {/* Bank Statement Header Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-black/40 backdrop-blur-xl p-6 rounded-[2rem] border border-white/5 border-l-[6px] border-l-emerald-500 shadow-sm">
              <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">TOTAL CRÉDITOS (+)</p>
              <p className="text-2xl font-black text-emerald-500 font-mono">R$ {summary.paid.toFixed(2)}</p>
            </div>
            <div className="bg-black/40 backdrop-blur-xl p-6 rounded-[2rem] border border-white/5 border-l-[6px] border-l-rose-500 shadow-sm">
              <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">TOTAL DÉBITOS (-)</p>
              <p className="text-2xl font-black text-rose-500 font-mono">R$ {summary.expenses.toFixed(2)}</p>
            </div>
            <div className="bg-black/40 backdrop-blur-xl p-6 rounded-[2rem] border border-white/5 border-l-[6px] border-l-brand-primary shadow-sm">
              <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">SALDO DO PERÍODO</p>
              <p className={`text-2xl font-black font-mono ${summary.balance >= 0 ? 'text-brand-primary' : 'text-rose-500'}`}>
                R$ {summary.balance.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="bg-black backdrop-blur-xl rounded-[2rem] border border-white/5 shadow-2xl overflow-hidden">
            <div className="p-8 border-b border-white/5 bg-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-3">
                  <CreditCard className="w-6 h-6 text-brand-primary" />
                  Extrato Bancário
                </h3>
                <p className="text-xs font-bold text-white/40 uppercase tracking-widest mt-1">Guerreiros VC • Clube de Vôlei</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black text-brand-primary uppercase tracking-widest">Período Selecionado</p>
                <p className="text-sm font-black text-white uppercase">{filterMonth ? formatMonth(filterMonth) : 'Extrato Completo'}</p>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-white/5 border-b border-white/10">
                  <tr>
                    <th className="px-8 py-4 text-[10px] font-black text-white/60 uppercase tracking-widest">Data</th>
                    <th className="px-8 py-4 text-[10px] font-black text-white/60 uppercase tracking-widest">Lançamento / Histórico</th>
                    <th className="px-8 py-4 text-[10px] font-black text-white/60 uppercase tracking-widest text-center">Tipo</th>
                    <th className="px-8 py-4 text-[10px] font-black text-white/60 uppercase tracking-widest text-right">Valor (R$)</th>
                    <th className="px-8 py-4 text-[10px] font-black text-white/60 uppercase tracking-widest text-right">Saldo (R$)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {combinedTransactions.map(t => (
                    <tr key={t.id} className="hover:bg-brand-primary/5 transition-colors group border-l-4 border-l-transparent hover:border-l-brand-primary">
                      <td className="px-8 py-5 text-[11px] font-bold text-white/40 uppercase whitespace-nowrap font-mono">
                        {new Date(t.date + 'T00:00:00').toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex flex-col">
                          <p className="text-xs font-black text-white uppercase tracking-tight group-hover:text-brand-primary transition-colors">{t.description}</p>
                          <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest">{t.category}</p>
                        </div>
                      </td>
                      <td className="px-8 py-5 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${
                          t.type === 'INCOME' 
                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                            : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                        }`}>
                          {t.type === 'INCOME' ? 'C' : 'D'}
                        </span>
                      </td>
                      <td className={`px-8 py-5 text-right font-mono text-sm font-black whitespace-nowrap ${
                        t.type === 'INCOME' ? 'text-emerald-500' : 'text-rose-500'
                      }`}>
                        {t.type === 'INCOME' ? '+' : '-'} R$ {t.amount.toFixed(2)}
                      </td>
                      <td className={`px-8 py-5 text-right font-mono text-sm font-black whitespace-nowrap ${
                        t.balance >= 0 ? 'text-white' : 'text-rose-500'
                      }`}>
                        <span className="text-[8px] text-white/20 mr-1.5 uppercase font-sans">Saldo</span>
                        R$ {t.balance.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {combinedTransactions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-8 py-20 text-center">
                        <div className="bg-white/5 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/10">
                          <History className="w-8 h-8 text-white/10" />
                        </div>
                        <p className="text-xs font-black text-white/20 uppercase tracking-widest">Sem movimentações para este período</p>
                      </td>
                    </tr>
                  )}
                </tbody>
                {combinedTransactions.length > 0 && (
                  <tfoot className="bg-white/5">
                    <tr>
                      <td colSpan={4} className="px-8 py-6 text-right">
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Saldo Final em {new Date().toLocaleDateString('pt-BR')}</p>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <div className="bg-brand-primary/10 border border-brand-primary/40 px-4 py-2 rounded-xl inline-block">
                          <p className={`font-mono text-lg font-black ${summary.balance >= 0 ? 'text-brand-primary' : 'text-rose-500'}`}>
                            R$ {summary.balance.toFixed(2)}
                          </p>
                        </div>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            
            <div className="p-8 bg-black/40 border-t border-white/5">
              <div className="flex flex-col sm:flex-row justify-between items-center gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-brand-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-white/60 uppercase tracking-widest">Documento gerado pelo sistema</p>
                    <p className="text-[9px] font-bold text-white/20 uppercase">Acompanhamento Financeiro Guerreiros VC</p>
                  </div>
                </div>
                <button
                  onClick={generateStatementReport}
                  className="w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-brand-primary text-brand-secondary rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-brand-primary/20 hover:scale-105 active:scale-95"
                >
                  <Copy className="w-5 h-5" /> Copiar Extrato Texto
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
