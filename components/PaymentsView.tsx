import { useShallow } from 'zustand/react/shallow';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { Payment, PaymentStatus, Expense, SystemMetadata, Player } from '../types';
import { db, doc, setDoc, writeBatch, getFirestoreDateKey, getDocs, collection } from '../firebase';
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
  RefreshCw,
  Zap
} from 'lucide-react';

import { HelpTooltip } from '../src/components/HelpTooltip';
import { capitalizeName } from '../utils/helpers';
import { cleanPhoneNumber } from '../utils/whatsapp';

interface PaymentsViewProps {
  deletePayment: (id: string) => void;
  setEditingPayment: (payment: Payment | null) => void;
  setIsPaymentFormOpen: (open: boolean) => void;
  deleteExpense: (id: string) => void;
  setEditingExpense: (expense: Expense | null) => void;
  setIsExpenseFormOpen: (open: boolean) => void;
  updateMonthlyFee: (fee: number) => void;
  updateSystemMetadata?: (metadata: Partial<SystemMetadata>) => void;
  handleFinancialIntegrityAudit?: () => Promise<void>;
}

export const PaymentsView: React.FC<PaymentsViewProps> = ({
  deletePayment,
  setEditingPayment,
  setIsPaymentFormOpen,
  deleteExpense,
  setEditingExpense,
  setIsExpenseFormOpen,
  updateMonthlyFee,
  updateSystemMetadata,
  handleFinancialIntegrityAudit
}) => {
  const { payments, expenses, userRole, systemMetadata, players: allPlayers } = useStore(
    useShallow(state => ({
      payments: state.payments,
      expenses: state.expenses,
      userRole: state.userRole,
      systemMetadata: state.systemMetadata,
      players: state.players
    }))
  );

  const players = useMemo(
    () => allPlayers.filter(p => p.status === 'active' && !p.isDM),
    [allPlayers]
  );

  const getCurrentMonthKey = () => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit'
    });
    return formatter.format(now).slice(0, 7);
  };

  const [activeTab, setActiveTab] = useState<'RECEIPTS' | 'COMPLIANCE' | 'EXPENSES' | 'STATEMENT'>('COMPLIANCE');
  const [filterMonth, setFilterMonth] = useState<string>(() => getCurrentMonthKey());
  const [filterDate, setFilterDate] = useState('');
  const [filterPlayer, setFilterPlayer] = useState('');
  const [filterStatus, setFilterStatus] = useState<PaymentStatus | ''>('');
  const [isEditingFee, setIsEditingFee] = useState(false);
  const [tempFee, setTempFee] = useState(systemMetadata.monthlyFee || 0);
  const [isEditingPix, setIsEditingPix] = useState(false);
  const [tempPixKey, setTempPixKey] = useState(systemMetadata.pixKey || 'elizabeth.santos.pe@gmail.com');
  const [toastMessage, setToastMessage] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isGeneratingBatch, setIsGeneratingBatch] = useState(false);
  const [processingPlayerId, setProcessingPlayerId] = useState<string | null>(null);
  const [pullStartY, setPullStartY] = useState(0);
  const [pullDist, setPullDist] = useState(0);
  const migrationExecutedRef = useRef(false);

  const showToast = (msg: string, duration = 3000) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), duration);
  };

  useEffect(() => {
    if (!isEditingPix) {
      setTempPixKey(systemMetadata.pixKey || 'elizabeth.santos.pe@gmail.com');
    }
  }, [systemMetadata.pixKey, isEditingPix]);

  useEffect(() => {
    if (!isEditingFee) {
      setTempFee(systemMetadata.monthlyFee || 0);
    }
  }, [systemMetadata.monthlyFee, isEditingFee]);

  const handleUpdatePixKey = () => {
    const raw = tempPixKey.trim();
    const digits = raw.replace(/\D/g, '');
    let formatted = raw;
    if (digits.length >= 10 && digits.length <= 13) {
      formatted = cleanPhoneNumber(raw) || raw;
    }
    if (updateSystemMetadata) {
      updateSystemMetadata({ pixKey: formatted });
    }
    setIsEditingPix(false);
    showToast('Chave Pix atualizada com sucesso!');
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const [paymentsSnap, expensesSnap] = await Promise.all([
        getDocs(collection(db, 'payments')),
        getDocs(collection(db, 'expenses'))
      ]);

      const freshPayments: Payment[] = [];
      paymentsSnap.forEach(d => freshPayments.push({ ...d.data(), id: d.id } as Payment));

      const freshExpenses: Expense[] = [];
      expensesSnap.forEach(d => freshExpenses.push({ ...d.data(), id: d.id } as Expense));

      useStore.setState({ payments: freshPayments, expenses: freshExpenses });
      showToast('Dados financeiros sincronizados!');
    } catch (err) {
      if (handleFinancialIntegrityAudit) {
        await handleFinancialIntegrityAudit();
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0) setPullStartY(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (pullStartY > 0 && window.scrollY === 0) {
      const diff = e.touches[0].clientY - pullStartY;
      if (diff > 0) setPullDist(Math.min(diff * 0.5, 100));
    }
  };

  const handleTouchEnd = async () => {
    if (pullDist > 60 && !isRefreshing) {
      await handleRefresh();
    }
    setPullStartY(0);
    setPullDist(0);
  };

  const formatMonth = (m: string) => {
    if (!m || !m.includes('-')) return m || '';
    const [year, month] = m.split('-');
    const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('pt-BR', { month: 'long' });
    return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)}/${year}`;
  };

  const getCalculatedStatus = (payment: Payment | undefined, playerId: string, monthStr: string) => {
    const player = allPlayers.find(p => p.id === playerId);
    if (player?.isExempt) return PaymentStatus.PAID;

    if (payment && payment.status === PaymentStatus.PAID) {
      return PaymentStatus.PAID;
    }

    if (!monthStr || !monthStr.includes('-')) {
      return payment ? payment.status : PaymentStatus.PENDING;
    }

    const today = new Date();
    const [year, month] = monthStr.split('-');
    const fifthDay = new Date(parseInt(year), parseInt(month) - 1, 5, 23, 59, 59, 999);

    if (today > fifthDay) {
      return PaymentStatus.OVERDUE;
    }

    return PaymentStatus.PENDING;
  };

  /**
   * 1-Click PIX: Dá baixa imediata na mensalidade do sócio sem precisar abrir modal
   */
  const handleQuickMarkPaid = async (player: Player, existingPayment?: Payment) => {
    const targetMonth = filterMonth || getCurrentMonthKey();
    if (processingPlayerId) return;
    setProcessingPlayerId(player.id);

    try {
      const todayStr = getFirestoreDateKey();
      const [year, month] = targetMonth.split('-');
      const dueDate = existingPayment?.dueDate || `${year}-${month}-05`;
      const amount = existingPayment?.amount || systemMetadata.monthlyFee || 0;
      const paymentId = existingPayment?.id || `pay_${targetMonth}_${player.id}`;

      const updatedPayment: Payment = {
        id: paymentId,
        playerId: player.id,
        playerName: player.name,
        month: targetMonth,
        amount,
        dueDate,
        status: PaymentStatus.PAID,
        method: 'PIX',
        paymentDate: todayStr
      };

      await setDoc(doc(db, 'payments', paymentId), updatedPayment, { merge: true });

      // Atualização otimista imediata na Store
      useStore.setState(state => {
        const others = state.payments.filter(p => p.id !== paymentId);
        return { payments: [updatedPayment, ...others] };
      });

      showToast(`PIX de ${capitalizeName(player.name)} confirmado!`);
    } catch (err) {
      console.error('Erro ao confirmar PIX rápido:', err);
      showToast('Erro ao confirmar pagamento.');
    } finally {
      setProcessingPlayerId(null);
    }
  };

  /**
   * Geração em Lote (1-Click): Cria lançamentos PENDING para todos os sócios ativos do mês selecionado
   */
  const handleGenerateMonthlyBatch = async () => {
    const targetMonth = filterMonth || getCurrentMonthKey();
    if (!targetMonth || isGeneratingBatch) return;

    const missingPlayers = players.filter(player => {
      if (player.isExempt) return false;
      return !payments.some(p => p.playerId === player.id && p.month === targetMonth);
    });

    if (missingPlayers.length === 0) {
      showToast(`Todos os sócios ativos já possuem lançamento em ${formatMonth(targetMonth)}!`);
      return;
    }

    setIsGeneratingBatch(true);
    try {
      const [year, month] = targetMonth.split('-');
      const dueDate = `${year}-${month}-05`;
      const fee = systemMetadata.monthlyFee || 0;
      const batch = writeBatch(db);
      const createdList: Payment[] = [];

      missingPlayers.forEach(player => {
        const paymentId = `pay_${targetMonth}_${player.id}`;
        const newPayment: Payment = {
          id: paymentId,
          playerId: player.id,
          playerName: player.name,
          month: targetMonth,
          amount: fee,
          dueDate,
          status: PaymentStatus.PENDING,
          method: '',
          paymentDate: ''
        };
        batch.set(doc(db, 'payments', paymentId), newPayment, { merge: true });
        createdList.push(newPayment);
      });

      await batch.commit();
      useStore.setState(state => ({
        payments: [...createdList, ...state.payments]
      }));

      showToast(`${createdList.length} mensalidades geradas para ${formatMonth(targetMonth)}!`);
    } catch (err) {
      console.error('Erro ao gerar mensalidades do mês:', err);
      showToast('Erro ao gerar mensalidades em lote.');
    } finally {
      setIsGeneratingBatch(false);
    }
  };

  /**
   * Link de Cobrança Amigável Individual via WhatsApp com Chave PIX
   */
  const getWhatsAppReminderUrl = (player: Player, amount: number) => {
    const cleanPhone = cleanPhoneNumber(player.phone || '');
    if (!cleanPhone) return null;
    const pixKey = systemMetadata.pixKey || 'elizabeth.santos.pe@gmail.com';
    const firstName = capitalizeName(player.name.split(' ')[0]);
    const monthLabel = formatMonth(filterMonth || getCurrentMonthKey());
    const msg =
      `Olá, *${firstName}*! Tudo bem? 🏐🔥\n\n` +
      `Passando para lembrar da mensalidade do *Guerreiros Volleyball Club* referente a *${monthLabel}*:\n\n` +
      `💰 *Valor:* R$ ${amount.toFixed(2).replace('.', ',')}\n` +
      `🔑 *Chave PIX:* ${pixKey}\n` +
      `👤 *Favorecido:* Elizabeth de Souza Santos (Nubank)\n\n` +
      `Assim que fizer, manda o comprovante por aqui. Valeu!`;
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
  };

  const copyList = (statusType: 'PAID' | 'UNPAID', label: string) => {
    if (!filterMonth) {
      showToast('Selecione um mês!');
      return;
    }

    const filtered = players
      .filter(player => {
        const payment = payments.find(p => p.playerId === player.id && p.month === filterMonth);
        const status = getCalculatedStatus(payment, player.id, filterMonth);
        if (statusType === 'PAID') return status === PaymentStatus.PAID;
        return status !== PaymentStatus.PAID;
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    let text = `Lista de Sócios - ${formatMonth(filterMonth)} (${label})\n\n`;
    filtered.forEach((player, index) => {
      text += `${index + 1}. ${player.name}\n`;
    });

    navigator.clipboard.writeText(text).then(() => showToast(`Lista de ${label} copiada!`));
  };

  const copyPaymentReport = () => {
    if (!filterMonth) {
      showToast('Selecione um mês!');
      return;
    }

    const [year, month] = filterMonth.split('-');
    const activePlayers = [...players].sort((a, b) => a.name.localeCompare(b.name));

    let text = `📋 LISTA DE APURAÇÃO DE PAGAMENTO:\n`;
    text += `Mensalidade do mês de: ${formatMonth(filterMonth)}\n`;
    text += `Data do Vencimento: 05/${month}/${year}\n\n`;

    activePlayers.forEach((player, index) => {
      const payment = payments.find(p => p.playerId === player.id && p.month === filterMonth);
      const isPaid = getCalculatedStatus(payment, player.id, filterMonth) === PaymentStatus.PAID;
      text += `${(index + 1).toString().padStart(2, ' ')}. [${isPaid ? '✅' : '   '}] ${player.name}\n`;
    });

    const pixKey = systemMetadata.pixKey || 'elizabeth.santos.pe@gmail.com';
    text += `\n*Chave Pix:* ${pixKey}\n`;
    text += `*Favorecido:* Elizabeth de Souza Santos\n`;
    text += `*Banco:* NUBANK\n\n`;
    text += `--- \nAtualizado pelo App Guerreiros`;

    navigator.clipboard.writeText(text).then(() => showToast('Lista de pagamentos copiada!'));
  };

  const generateWhatsAppReport = () => {
    if (!filterMonth) return;

    const sortedPlayers = [...players].sort((a, b) => a.name.localeCompare(b.name));
    const [year, month] = filterMonth.split('-');
    const monthName = new Date(parseInt(year), parseInt(month) - 1)
      .toLocaleDateString('pt-BR', { month: 'long' })
      .toUpperCase();
    const feeAmount = (systemMetadata.monthlyFee || 0).toFixed(2).replace('.', ',');
    const pixKey = systemMetadata.pixKey || 'elizabeth.santos.pe@gmail.com';

    let reportText = `Pagamento Mensal - ${monthName}\n\n`;
    reportText += `*Local: Santos Dumont*\n`;
    reportText += `*Horário: 19:30 às 22 h*\n\n`;
    reportText += `*R$ ${feeAmount}*\n\n`;
    reportText += `*Pagamento até dia 05 - de cada mês*\n\n`;
    reportText += `*Chave Pix:* \`${pixKey}\`\n\n`;
    reportText += `*Favorecido:* Elizabeth de Souza Santos\n`;
    reportText += `*Banco:* NUBANK\n\n`;

    sortedPlayers.forEach((player, index) => {
      const payment = payments.find(p => p.playerId === player.id && p.month === filterMonth);
      const status = getCalculatedStatus(payment, player.id, filterMonth);
      const icon = status === PaymentStatus.PAID ? ' ✅' : '';
      reportText += `${index + 1}.\t${player.name}${icon}\n`;
    });

    reportText += `\n*MANDAR COMPROVANTE DO PAGAMENTO NO MEU PRIVADO, POR GENTILEZA*💥`;

    navigator.clipboard.writeText(reportText).then(() => showToast('Relatório copiado!', 4000));
  };

  const uniqueMonths = useMemo(() => {
    const currentMonth = getCurrentMonthKey();
    const months = new Set([
      currentMonth,
      ...payments.map(p => p.month).filter(Boolean),
      ...expenses.map(e => e.month).filter(Boolean)
    ]);
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [payments, expenses]);

  const uniquePlayers = useMemo(() => {
    const playersInPayments = new Set(payments.map(p => p.playerId));
    const names = allPlayers
      .filter(p => playersInPayments.has(p.id) && !p.isDM)
      .map(p => p.name);
    return Array.from(new Set(names)).sort();
  }, [payments, allPlayers]);

  const filteredPayments = useMemo(() => {
    return payments
      .filter(p => {
        const matchMonth = !filterMonth || p.month === filterMonth;
        const matchDate = !filterDate || p.paymentDate === filterDate;
        const matchPlayer =
          !filterPlayer || (p.playerName || '').toLowerCase().includes(filterPlayer.toLowerCase());
        const calculatedStatus = getCalculatedStatus(p, p.playerId, p.month);
        const matchStatus = !filterStatus || calculatedStatus === filterStatus;
        return matchMonth && matchDate && matchPlayer && matchStatus;
      })
      .sort((a, b) => {
        const dateA = a.paymentDate || a.dueDate || '';
        const dateB = b.paymentDate || b.dueDate || '';
        return String(dateB).localeCompare(String(dateA));
      });
  }, [payments, filterMonth, filterDate, filterPlayer, filterStatus, allPlayers]);

  const filteredExpenses = useMemo(() => {
    return expenses
      .filter(e => {
        const matchMonth = !filterMonth || e.month === filterMonth;
        const matchDate = !filterDate || e.date === filterDate;
        return matchMonth && matchDate;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses, filterMonth, filterDate]);

  const globalSummary = useMemo(() => {
    const allPaidReceipts = payments.filter(
      p => getCalculatedStatus(p, p.playerId, p.month) === PaymentStatus.PAID
    );
    const totalPaidGlobal = allPaidReceipts.reduce((acc, p) => acc + p.amount, 0);
    const totalExpensesGlobal = expenses.reduce((acc, e) => acc + e.amount, 0);
    return {
      totalPaid: totalPaidGlobal,
      totalExpenses: totalExpensesGlobal,
      balance: totalPaidGlobal - totalExpensesGlobal
    };
  }, [payments, expenses, allPlayers]);

  const summary = useMemo(() => {
    const receipts = filteredPayments.reduce(
      (acc, p) => {
        const calculatedStatus = getCalculatedStatus(p, p.playerId, p.month);
        if (calculatedStatus === PaymentStatus.PAID) acc.paid += p.amount;
        else if (calculatedStatus === PaymentStatus.PENDING) acc.pending += p.amount;
        else if (calculatedStatus === PaymentStatus.OVERDUE) acc.overdue += p.amount;
        return acc;
      },
      { paid: 0, pending: 0, overdue: 0 }
    );

    const totalExpenses = filteredExpenses.reduce((acc, e) => acc + e.amount, 0);
    const nonExemptActiveCount = players.filter(p => !p.isExempt).length;
    const monthlyBudget = filterMonth ? nonExemptActiveCount * (systemMetadata.monthlyFee || 0) : 0;

    return {
      ...receipts,
      expenses: totalExpenses,
      balance: receipts.paid - totalExpenses,
      budget: monthlyBudget
    };
  }, [filteredPayments, filteredExpenses, players, systemMetadata.monthlyFee, filterMonth]);

  const combinedTransactions = useMemo(() => {
    const paidReceipts = filteredPayments
      .filter(p => getCalculatedStatus(p, p.playerId, p.month) === PaymentStatus.PAID)
      .map(p => ({
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

    const sorted = [...paidReceipts, ...expenseItems].sort((a, b) => a.date.localeCompare(b.date));
    let currentBalance = 0;
    return sorted.map(t => {
      currentBalance += t.type === 'INCOME' ? t.amount : -t.amount;
      return { ...t, balance: currentBalance };
    });
  }, [filteredPayments, filteredExpenses, filterMonth]);

  const generateStatementReport = () => {
    if (combinedTransactions.length === 0) {
      showToast('Nenhum lançamento no extrato!');
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
    reportText += `Receitas:      R$ ${summary.paid.toFixed(2).padStart(10)}\n`;
    reportText += `Despesas:      R$ ${summary.expenses.toFixed(2).padStart(10)}\n`;
    reportText += `Saldo Período: R$ ${summary.balance.toFixed(2).padStart(10)}\n`;
    reportText += `--------------------------------------\n\n`;

    combinedTransactions.forEach(t => {
      const date = new Date(t.date + 'T00:00:00').toLocaleDateString('pt-BR');
      const desc = t.description.substring(0, 23).padEnd(23);
      const amount = (t.type === 'INCOME' ? '+' : '-') + ' R$ ' + t.amount.toFixed(2);
      const balance = 'SALDO R$ ' + t.balance.toFixed(2);
      reportText += `${date} ${desc} ${amount.padStart(12)} ${balance.padStart(18)}\n`;
    });

    reportText += `\n--------------------------------------\n`;
    reportText += `SALDO ATUAL:   R$ ${summary.balance.toFixed(2).padStart(10)}\n`;
    reportText += `======================================`;

    navigator.clipboard.writeText(reportText).then(() => showToast('Extrato bancário copiado!'));
  };

  // Migração única por sessão em writeBatch para padronizar meses (ex: "Novembro/2026" -> "2026-11")
  useEffect(() => {
    if (userRole !== 'ADMIN' || migrationExecutedRef.current) return;
    if (payments.length === 0 && expenses.length === 0) return;

    migrationExecutedRef.current = true;
    const monthMap: Record<string, string> = {
      janeiro: '01', fevereiro: '02', março: '03', marco: '03',
      abril: '04', maio: '05', junho: '06', julho: '07',
      agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12'
    };

    const parseLegacyMonth = (oldMonth: string) => {
      if (!oldMonth || /^\d{4}-\d{2}$/.test(oldMonth)) return null;
      const parts = oldMonth.toLowerCase().split('/');
      if (parts.length === 2) {
        const m = monthMap[parts[0].trim()];
        const y = parts[1].trim();
        if (m && y.length === 4) return `${y}-${m}`;
      }
      return null;
    };

    const runBatchMigration = async () => {
      const batch = writeBatch(db);
      let count = 0;

      payments.forEach(p => {
        const newM = parseLegacyMonth(p.month);
        if (newM) {
          batch.update(doc(db, 'payments', p.id), { month: newM });
          count++;
        }
      });

      expenses.forEach(e => {
        const newM = parseLegacyMonth(e.month);
        if (newM) {
          batch.update(doc(db, 'expenses', e.id), { month: newM });
          count++;
        }
      });

      if (count > 0) {
        await batch.commit().catch(() => {});
      }
    };

    runBatchMigration();
  }, [payments, expenses, userRole]);

  const handleUpdateFee = () => {
    updateMonthlyFee(tempFee);
    setIsEditingFee(false);
    showToast('Valor da mensalidade atualizado!');
  };

  const getStatusIcon = (status: PaymentStatus) => {
    switch (status) {
      case PaymentStatus.PAID: return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
      case PaymentStatus.PENDING: return <Clock className="w-3.5 h-3.5 text-amber-400" />;
      case PaymentStatus.OVERDUE: return <XCircle className="w-3.5 h-3.5 text-rose-400" />;
    }
  };

  // Paleta oficial Dark Glassmorphism de alto contraste
  const getStatusColor = (status: PaymentStatus) => {
    switch (status) {
      case PaymentStatus.PAID: return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case PaymentStatus.PENDING: return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      case PaymentStatus.OVERDUE: return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
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
    <div 
      className="space-y-8 animate-in fade-in duration-500 relative"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {(pullDist > 0 || isRefreshing) && (
        <div className="flex items-center justify-center py-3 text-xs font-black uppercase text-amber-400 bg-zinc-900 border-b border-zinc-800 transition-all rounded-2xl">
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Sincronizando financeiro...' : pullDist > 60 ? 'Solte para atualizar!' : 'Puxe para baixo para atualizar...'}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-4xl font-black text-white uppercase tracking-tighter flex items-center">
              Financeiro
              <HelpTooltip 
                title="Gestão Financeira Inteligente" 
                content="Gere as mensalidades do mês em 1 clique, dê baixa imediata via PIX direto na lista e envie lembretes individuais no WhatsApp."
              />
            </h2>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-3 py-1.5 bg-brand-primary/10 border border-brand-primary/30 rounded-xl text-brand-primary text-xs font-black uppercase tracking-widest hover:bg-brand-primary hover:text-black transition-all shadow-lg active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Atualizando...' : 'Atualizar'}
            </button>
          </div>
          <p className="text-sm font-bold text-white/40 uppercase tracking-widest mt-2">
            Controle de Caixa, Mensalidades PIX 1-Click e Despesas
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
          {userRole === 'ADMIN' && (
            <div className="bg-black/40 px-6 py-4 rounded-[2rem] border border-white/5 border-l-[6px] border-l-brand-primary shadow-2xl flex items-center gap-5 backdrop-blur-xl">
              <div className="p-3 bg-brand-primary/10 rounded-2xl border border-brand-primary/40">
                <DollarSign className="w-5 h-5 text-brand-primary" />
              </div>
              <div className="space-y-1">
                <p className="text-[9px] font-black text-brand-primary uppercase tracking-[0.2em]">Mensalidade Sócio</p>
                {isEditingFee ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      value={tempFee}
                      onChange={e => setTempFee(parseFloat(e.target.value) || 0)}
                      className="w-24 bg-black/60 border border-brand-primary/30 rounded-xl px-3 py-1.5 font-black text-sm text-white outline-none"
                      autoFocus
                    />
                    <button onClick={handleUpdateFee} className="p-2 bg-brand-primary text-black rounded-xl"><CheckCircle2 className="w-4 h-4" /></button>
                    <button onClick={() => setIsEditingFee(false)} className="p-2 bg-rose-500/10 text-rose-500 rounded-xl"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <p className="text-xl font-black text-white font-mono">R$ {(systemMetadata.monthlyFee || 0).toFixed(2)}</p>
                    <button onClick={() => setIsEditingFee(true)} className="p-1.5 text-brand-primary/60 hover:text-brand-primary rounded-lg"><Edit2 className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
            </div>
          )}

          {userRole === 'ADMIN' && (
            <div className="bg-black/40 px-6 py-4 rounded-[2rem] border border-white/5 border-l-[6px] border-l-brand-primary shadow-2xl flex items-center gap-5 backdrop-blur-xl">
              <div className="p-3 bg-brand-primary/10 rounded-2xl border border-brand-primary/40">
                <CreditCard className="w-5 h-5 text-brand-primary" />
              </div>
              <div className="space-y-1">
                <p className="text-[9px] font-black text-brand-primary uppercase tracking-[0.2em]">Chave Pix Oficial</p>
                {isEditingPix ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={tempPixKey}
                      onChange={e => setTempPixKey(e.target.value)}
                      className="w-40 bg-black/60 border border-brand-primary/30 rounded-xl px-3 py-1.5 font-black text-xs text-white outline-none"
                      autoFocus
                    />
                    <button onClick={handleUpdatePixKey} className="p-2 bg-brand-primary text-black rounded-xl"><CheckCircle2 className="w-4 h-4" /></button>
                    <button onClick={() => setIsEditingPix(false)} className="p-2 bg-rose-500/10 text-rose-500 rounded-xl"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <p className="text-xs font-black text-white font-mono truncate max-w-[160px]">{systemMetadata.pixKey || 'elizabeth.santos.pe@gmail.com'}</p>
                    <button onClick={() => setIsEditingPix(true)} className="p-1.5 text-brand-primary/60 hover:text-brand-primary rounded-lg"><Edit2 className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
            </div>
          )}

          {userRole === 'ADMIN' && (
            <button 
              onClick={() => { 
                if (activeTab === 'EXPENSES') {
                  setEditingExpense(null);
                  setIsExpenseFormOpen(true);
                } else {
                  setEditingPayment(null); 
                  setIsPaymentFormOpen(true); 
                }
              }} 
              className="bg-brand-primary text-brand-secondary px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-brand-primary/90 shadow-xl transition-all"
            >
              <Plus className="w-5 h-5" />
              {activeTab === 'EXPENSES' ? 'Nova Despesa' : 'Novo Lançamento'}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-white/5 backdrop-blur-md rounded-[1.5rem] w-fit border border-brand-primary/40">
        <button
          onClick={() => setActiveTab('COMPLIANCE')}
          className={`px-4 py-2.5 sm:px-6 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${
            activeTab === 'COMPLIANCE' 
              ? 'bg-brand-primary text-brand-secondary shadow-xl' 
              : 'text-white/40 hover:text-white hover:bg-white/5'
          }`}
        >
          Painel do Mês (1-Click PIX)
        </button>
        <button
          onClick={() => setActiveTab('RECEIPTS')}
          className={`px-4 py-2.5 sm:px-6 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${
            activeTab === 'RECEIPTS' 
              ? 'bg-brand-primary text-brand-secondary shadow-xl' 
              : 'text-white/40 hover:text-white hover:bg-white/5'
          }`}
        >
          Histórico de Recebimentos
        </button>
        <button
          onClick={() => setActiveTab('EXPENSES')}
          className={`px-4 py-2.5 sm:px-6 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${
            activeTab === 'EXPENSES' 
              ? 'bg-brand-primary text-brand-secondary shadow-xl' 
              : 'text-white/40 hover:text-white hover:bg-white/5'
          }`}
        >
          Despesas do Clube
        </button>
        <button
          onClick={() => setActiveTab('STATEMENT')}
          className={`px-4 py-2.5 sm:px-6 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${
            activeTab === 'STATEMENT' 
              ? 'bg-brand-primary text-brand-secondary shadow-xl' 
              : 'text-white/40 hover:text-white hover:bg-white/5'
          }`}
        >
          Extrato Conta Corrente
        </button>
      </div>

      {/* Financial Summary Dashboard */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-black backdrop-blur-xl p-5 rounded-[2rem] border border-white/5 border-l-[6px] border-l-brand-primary">
          <p className="text-[9px] sm:text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">Saldo em Caixa (Acumulado)</p>
          <p className={`text-xl sm:text-2xl font-black font-mono ${globalSummary.balance >= 0 ? 'text-brand-primary' : 'text-rose-500'}`}>
            R$ {globalSummary.balance.toFixed(2)}
          </p>
        </div>

        <div className="bg-black backdrop-blur-xl p-5 rounded-[2rem] border border-white/5 border-l-[6px] border-l-emerald-500">
          <p className="text-[9px] sm:text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">Recebido ({filterMonth ? formatMonth(filterMonth) : 'Filtro'})</p>
          <p className="text-xl sm:text-2xl font-black font-mono text-emerald-400">
            R$ {summary.paid.toFixed(2)}
          </p>
        </div>

        <div className="bg-black backdrop-blur-xl p-5 rounded-[2rem] border border-white/5 border-l-[6px] border-l-rose-500">
          <p className="text-[9px] sm:text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">Despesas ({filterMonth ? formatMonth(filterMonth) : 'Filtro'})</p>
          <p className="text-xl sm:text-2xl font-black font-mono text-rose-400">
            R$ {summary.expenses.toFixed(2)}
          </p>
        </div>

        <div className="bg-white/5 backdrop-blur-xl p-5 rounded-[2rem] border border-brand-primary/40 col-span-2 lg:col-span-1">
          <p className="text-[9px] sm:text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">
            Previsão Mensal ({filterMonth ? formatMonth(filterMonth) : 'Geral'})
          </p>
          <div className="flex justify-between items-end">
            <p className="text-lg sm:text-xl font-black text-brand-primary font-mono">R$ {summary.budget.toFixed(2)}</p>
            <p className="text-[10px] font-black text-amber-400">
              Falta: R$ {Math.max(0, summary.budget - summary.paid).toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Área Pagar PIX */}
      <div className="bg-black backdrop-blur-xl p-6 rounded-[2rem] border border-brand-primary/40 shadow-sm flex flex-col md:flex-row items-center gap-6">
        <div className="bg-white p-3 rounded-2xl border border-brand-primary/40 flex-shrink-0">
          <img 
            src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(systemMetadata.pixKey || 'elizabeth.santos.pe@gmail.com')}`} 
            alt="Pix QR Code" 
            className="w-28 h-28 md:w-32 md:h-32 object-contain"
            referrerPolicy="no-referrer"
          />
        </div>
        <div className="flex-1 space-y-3 text-center md:text-left w-full">
          <div className="space-y-1">
            <h3 className="text-base font-black text-brand-primary uppercase tracking-tight flex items-center justify-center md:justify-start gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-primary animate-pulse" />
              Dados Oficiais para PIX
            </h3>
            <p className="text-xs font-semibold text-white/60">
              Copie a chave PIX ou envie o relatório atualizado diretamente para o grupo do WhatsApp.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
            <div className="w-full sm:flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 font-mono text-xs text-white truncate text-left">
              {systemMetadata.pixKey || 'elizabeth.santos.pe@gmail.com'}
            </div>
            <button
              onClick={() => {
                const pixKeyVal = systemMetadata.pixKey || 'elizabeth.santos.pe@gmail.com';
                const whatsappPix = `*Chave Pix:*\n${pixKeyVal}\n\n*Favorecido:* Elizabeth de Souza Santos\n*Banco:* NUBANK`;
                navigator.clipboard.writeText(whatsappPix);
                showToast('Chave Pix copiada para o WhatsApp! 📋');
              }}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-brand-primary text-brand-secondary rounded-xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all"
            >
              <Copy className="w-4 h-4" />
              Copiar Chave PIX
            </button>
          </div>
          
          <div className="text-[10px] font-bold text-brand-primary/60 uppercase tracking-wider flex flex-wrap gap-x-4 gap-y-1 justify-center md:justify-start">
            <span>👤 Favorecido: Elizabeth de Souza Santos</span>
            <span>🏦 Banco: NUBANK</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-black backdrop-blur-xl p-4 sm:p-6 rounded-[2rem] border border-white/5 border-l-[6px] border-l-brand-primary grid grid-cols-2 md:flex md:flex-wrap gap-3 sm:gap-4 items-end">
        <div className="min-w-0 md:min-w-[200px] space-y-2">
          <label className="text-[10px] font-black text-brand-primary uppercase tracking-widest ml-1 flex items-center gap-2">
            <Filter className="w-3 h-3" /> Mês de Referência
          </label>
          <select
            value={filterMonth}
            onChange={e => setFilterMonth(e.target.value)}
            className="w-full px-4 py-3 bg-white/5 border border-brand-primary/40 rounded-xl font-bold text-white text-xs sm:text-sm outline-none"
          >
            <option value="" className="bg-slate-900">Todos os Meses</option>
            {uniqueMonths.map(m => (
              <option key={m} value={m} className="bg-slate-900">{formatMonth(m)}</option>
            ))}
          </select>
        </div>

        {activeTab === 'RECEIPTS' && (
          <>
            <div className="min-w-0 md:min-w-[180px] space-y-2">
              <label className="text-[10px] font-black text-brand-primary uppercase tracking-widest ml-1 flex items-center gap-2">
                <Filter className="w-3 h-3" /> Sócio
              </label>
              <select
                value={filterPlayer}
                onChange={e => setFilterPlayer(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-brand-primary/40 rounded-xl font-bold text-white text-xs sm:text-sm outline-none"
              >
                <option value="" className="bg-slate-900">Todos</option>
                {uniquePlayers.map(p => <option key={p} value={p} className="bg-slate-900">{p}</option>)}
              </select>
            </div>

            <div className="min-w-0 md:min-w-[160px] space-y-2">
              <label className="text-[10px] font-black text-brand-primary uppercase tracking-widest ml-1 flex items-center gap-2">
                <Filter className="w-3 h-3" /> Status
              </label>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value as PaymentStatus | '')}
                className="w-full px-4 py-3 bg-white/5 border border-brand-primary/40 rounded-xl font-bold text-white text-xs sm:text-sm outline-none"
              >
                <option value="" className="bg-slate-900">Todos</option>
                <option value={PaymentStatus.PAID} className="bg-slate-900">Pago</option>
                <option value={PaymentStatus.PENDING} className="bg-slate-900">Pendente</option>
                <option value={PaymentStatus.OVERDUE} className="bg-slate-900">Atrasado</option>
              </select>
            </div>
          </>
        )}

        <div className="flex flex-wrap gap-2 col-span-2 md:col-span-1">
          {userRole === 'ADMIN' && filterMonth && (
            <button
              onClick={handleGenerateMonthlyBatch}
              disabled={isGeneratingBatch}
              className="flex items-center justify-center gap-2 px-5 py-3 bg-emerald-500 text-black rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-400 transition-all shadow-lg disabled:opacity-50"
              title="Cria automaticamente os lançamentos pendentes do mês para todos os sócios ativos"
            >
              <Zap className="w-4 h-4" />
              {isGeneratingBatch ? 'Gerando...' : 'Gerar Mês (1-Click)'}
            </button>
          )}

          <button
            onClick={copyPaymentReport}
            className="flex items-center justify-center gap-2 px-5 py-3 bg-brand-primary text-brand-secondary rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-brand-primary/90 transition-all"
          >
            <Copy className="w-4 h-4" /> Copiar Lista WhatsApp
          </button>

          {(filterMonth || filterPlayer || filterStatus || filterDate) && (
            <button
              onClick={() => { setFilterMonth(''); setFilterPlayer(''); setFilterStatus(''); setFilterDate(''); }}
              className="p-3 bg-white/5 text-white/40 rounded-xl hover:bg-white/10 transition-all border border-white/10"
              title="Limpar Filtros"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ABA: GESTÃO DE MENSALIDADES (PAINEL DO MÊS COM BAIXA PIX 1-CLICK) */}
      {activeTab === 'COMPLIANCE' && (
        <div className="bg-black backdrop-blur-xl rounded-[2rem] border border-white/5 border-l-[6px] border-l-brand-primary shadow-sm overflow-hidden">
          <div className="p-4 sm:p-8 border-b border-white/5 bg-white/5">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h3 className="text-xl font-black text-white uppercase tracking-tight">
                  Adimplência dos Sócios • {filterMonth ? formatMonth(filterMonth) : 'Mês Atual'}
                </h3>
                <p className="text-[10px] sm:text-xs font-bold text-white/40 uppercase tracking-widest mt-1">
                  Confirme o PIX em 1 clique ou envie lembrete individual no WhatsApp
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                <div className="relative flex-1 sm:w-56">
                  <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input
                    type="text"
                    placeholder="Buscar sócio..."
                    value={filterPlayer}
                    onChange={e => setFilterPlayer(e.target.value)}
                    className="w-full bg-white/5 border border-brand-primary/40 rounded-xl pl-10 pr-4 py-2.5 text-xs font-bold text-white placeholder:text-white/20 outline-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={generateWhatsAppReport}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#25D366]/15 text-[#25D366] hover:bg-[#25D366]/25 border border-[#25D366]/30 rounded-xl font-black text-[10px] uppercase tracking-widest"
                  >
                    <MessageSquare className="w-3.5 h-3.5" /> Relatório
                  </button>
                  <button
                    onClick={() => copyList('PAID', 'Pagos')}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-xl font-black text-[10px] uppercase tracking-widest"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Pagos
                  </button>
                  <button
                    onClick={() => copyList('UNPAID', 'Pendentes')}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-rose-500/15 text-rose-400 border border-rose-500/30 rounded-xl font-black text-[10px] uppercase tracking-widest"
                  >
                    <X className="w-3.5 h-3.5" /> Pendentes
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Tabela Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-black/40 border-b border-brand-primary/40">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest">Sócio</th>
                  <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">Status</th>
                  <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">Valor</th>
                  <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">Data Pagto</th>
                  <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-right">Ações Rápidas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {players
                  .filter(player => !filterPlayer || player.name.toLowerCase().includes(filterPlayer.toLowerCase()))
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(player => {
                    const targetM = filterMonth || getCurrentMonthKey();
                    const payment = payments.find(p => p.playerId === player.id && p.month === targetM);
                    const status = getCalculatedStatus(payment, player.id, targetM);
                    const isPaid = status === PaymentStatus.PAID;
                    const feeVal = payment?.amount || systemMetadata.monthlyFee || 0;
                    const waLink = !isPaid ? getWhatsAppReminderUrl(player, feeVal) : null;

                    return (
                      <tr key={player.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-white text-sm">{capitalizeName(player.name)}</p>
                            {player.isExempt && (
                              <span className="px-2 py-0.5 rounded bg-brand-primary/20 text-brand-primary text-[8px] font-black uppercase">
                                Isento
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${getStatusColor(status)}`}>
                            {getStatusIcon(status)}
                            {translateStatus(status)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center font-mono text-sm font-black text-white">
                          {player.isExempt ? 'Isento' : `R$ ${feeVal.toFixed(2)}`}
                        </td>
                        <td className="px-6 py-4 text-center text-[10px] font-bold text-white/50 uppercase">
                          {payment?.paymentDate ? new Date(payment.paymentDate + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {userRole === 'ADMIN' && (
                            <div className="flex items-center justify-end gap-2">
                              {!isPaid && !player.isExempt && (
                                <button
                                  onClick={() => handleQuickMarkPaid(player, payment)}
                                  disabled={processingPlayerId === player.id}
                                  className="px-3.5 py-2 bg-emerald-500 text-black hover:bg-emerald-400 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all flex items-center gap-1.5 shadow-md disabled:opacity-50"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  {processingPlayerId === player.id ? 'Salvando...' : 'Confirmar PIX'}
                                </button>
                              )}

                              {waLink && (
                                <a
                                  href={waLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-2 bg-[#25D366]/15 text-[#25D366] hover:bg-[#25D366] hover:text-black rounded-xl transition-all border border-[#25D366]/30"
                                  title="Enviar lembrete com chave PIX no WhatsApp"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                </a>
                              )}

                              <button 
                                onClick={() => {
                                  if (payment) {
                                    setEditingPayment(payment);
                                  } else {
                                    setEditingPayment({
                                      id: '',
                                      playerId: player.id,
                                      playerName: player.name,
                                      amount: systemMetadata.monthlyFee || 0,
                                      month: targetM,
                                      dueDate: getFirestoreDateKey(),
                                      status: PaymentStatus.PENDING
                                    });
                                  }
                                  setIsPaymentFormOpen(true);
                                }}
                                className="px-3 py-2 bg-white/5 hover:bg-white/10 text-white/70 rounded-xl transition-all font-black text-[9px] uppercase tracking-widest"
                              >
                                {payment ? 'Editar' : 'Manual'}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* Mobile View - Compliance */}
          <div className="md:hidden divide-y divide-white/5">
            {players
              .filter(player => !filterPlayer || player.name.toLowerCase().includes(filterPlayer.toLowerCase()))
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(player => {
                const targetM = filterMonth || getCurrentMonthKey();
                const payment = payments.find(p => p.playerId === player.id && p.month === targetM);
                const status = getCalculatedStatus(payment, player.id, targetM);
                const isPaid = status === PaymentStatus.PAID;
                const feeVal = payment?.amount || systemMetadata.monthlyFee || 0;
                const waLink = !isPaid ? getWhatsAppReminderUrl(player, feeVal) : null;

                return (
                  <div key={player.id} className="p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-white text-sm">{capitalizeName(player.name)}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest border ${getStatusColor(status)}`}>
                            {getStatusIcon(status)}
                            {translateStatus(status)}
                          </span>
                          {payment?.paymentDate && (
                            <span className="text-[9px] font-bold text-white/40 uppercase">
                              Pago {new Date(payment.paymentDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="font-mono text-sm font-black text-white">
                        {player.isExempt ? 'Isento' : `R$ ${feeVal.toFixed(2)}`}
                      </span>
                    </div>

                    {userRole === 'ADMIN' && (
                      <div className="flex items-center gap-2 pt-1">
                        {!isPaid && !player.isExempt && (
                          <button
                            onClick={() => handleQuickMarkPaid(player, payment)}
                            disabled={processingPlayerId === player.id}
                            className="flex-1 py-2 bg-emerald-500 text-black rounded-xl font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {processingPlayerId === player.id ? 'Salvando...' : 'Confirmar PIX'}
                          </button>
                        )}
                        {waLink && (
                          <a
                            href={waLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-2 bg-[#25D366]/15 text-[#25D366] rounded-xl font-black text-[9px] uppercase tracking-widest flex items-center gap-1 border border-[#25D366]/30"
                          >
                            <MessageSquare className="w-3.5 h-3.5" /> Cobrar
                          </a>
                        )}
                        <button
                          onClick={() => {
                            if (payment) {
                              setEditingPayment(payment);
                            } else {
                              setEditingPayment({
                                id: '',
                                playerId: player.id,
                                playerName: player.name,
                                amount: systemMetadata.monthlyFee || 0,
                                month: targetM,
                                dueDate: getFirestoreDateKey(),
                                status: PaymentStatus.PENDING
                              });
                            }
                            setIsPaymentFormOpen(true);
                          }}
                          className="px-3 py-2 bg-white/5 text-white/60 rounded-xl font-black text-[9px] uppercase tracking-widest"
                        >
                          Editar
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ABA: HISTÓRICO DE RECEBIMENTOS */}
      {activeTab === 'RECEIPTS' && (
        <div className="bg-black backdrop-blur-xl rounded-[2rem] border border-white/5 border-l-[6px] border-l-brand-primary shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-black/40 border-b border-brand-primary/40">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest">Sócio</th>
                  <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">Mês/Ref</th>
                  <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">Valor</th>
                  <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">Status</th>
                  <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredPayments.map(payment => {
                  const status = getCalculatedStatus(payment, payment.playerId, payment.month);
                  const playerObj = allPlayers.find(ap => ap.id === payment.playerId);
                  return (
                    <tr key={payment.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 font-black text-white">
                        {payment.playerName || playerObj?.name || 'Sócio'}
                      </td>
                      <td className="px-6 py-4 text-center text-[10px] font-bold text-white/50 uppercase">
                        {formatMonth(payment.month)}
                      </td>
                      <td className="px-6 py-4 text-center font-mono text-sm font-black text-white">
                        R$ {payment.amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${getStatusColor(status)}`}>
                          {getStatusIcon(status)}
                          {translateStatus(status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {userRole === 'ADMIN' && (
                          <div className="flex justify-end gap-2">
                            {status !== PaymentStatus.PAID && playerObj && (
                              <button
                                onClick={() => handleQuickMarkPaid(playerObj, payment)}
                                className="px-3 py-1.5 bg-emerald-500 text-black rounded-xl font-black text-[9px] uppercase tracking-widest"
                              >
                                Confirmar PIX
                              </button>
                            )}
                            <button onClick={() => { setEditingPayment(payment); setIsPaymentFormOpen(true); }} className="p-2 text-white/50 hover:text-brand-primary rounded-xl"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => deletePayment(payment.id)} className="p-2 text-white/50 hover:text-rose-500 rounded-xl"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredPayments.length === 0 && (
              <div className="p-16 text-center">
                <CreditCard className="w-10 h-10 text-white/10 mx-auto mb-3" />
                <p className="text-xs font-bold text-white/30 uppercase tracking-widest">Nenhum lançamento encontrado</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ABA: DESPESAS DO CLUBE */}
      {activeTab === 'EXPENSES' && (
        <div className="bg-black backdrop-blur-xl rounded-[2rem] border border-white/5 border-l-[6px] border-l-brand-primary shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-black/40 border-b border-brand-primary/40">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest">Descrição</th>
                  <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">Categoria</th>
                  <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">Valor</th>
                  <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-center">Data</th>
                  <th className="px-6 py-4 text-[10px] font-black text-brand-primary uppercase tracking-widest text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredExpenses.map(expense => (
                  <tr key={expense.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 font-black text-white">{expense.description}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-[10px] font-bold text-white/60 uppercase bg-white/5 px-3 py-1 rounded-lg border border-white/10">
                        {expense.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center font-mono text-sm font-black text-rose-400">
                      R$ {expense.amount.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-center text-[10px] font-bold text-white/40 uppercase">
                      {new Date(expense.date + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {userRole === 'ADMIN' && (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => { setEditingExpense(expense); setIsExpenseFormOpen(true); }} className="p-2 text-white/40 hover:text-brand-primary"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => deleteExpense(expense.id)} className="p-2 text-white/40 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredExpenses.length === 0 && (
              <div className="p-16 text-center">
                <DollarSign className="w-10 h-10 text-white/10 mx-auto mb-3" />
                <p className="text-xs font-bold text-white/30 uppercase tracking-widest">Nenhuma despesa registrada no período</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ABA: EXTRATO CONTA CORRENTE */}
      {activeTab === 'STATEMENT' && (
        <div className="bg-black backdrop-blur-xl rounded-[2rem] border border-white/5 shadow-2xl overflow-hidden">
          <div className="p-6 sm:p-8 border-b border-white/5 bg-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-3">
                <CreditCard className="w-6 h-6 text-brand-primary" />
                Extrato de Conta Corrente
              </h3>
              <p className="text-xs font-bold text-white/40 uppercase tracking-widest mt-1">
                Período: {filterMonth ? formatMonth(filterMonth) : 'Completo'}
              </p>
            </div>
            <button
              onClick={generateStatementReport}
              className="flex items-center gap-2 px-6 py-3 bg-brand-primary text-black rounded-xl font-black text-[10px] uppercase tracking-widest"
            >
              <Copy className="w-4 h-4" /> Copiar Extrato Texto
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black text-white/60 uppercase tracking-widest">Data</th>
                  <th className="px-6 py-4 text-[10px] font-black text-white/60 uppercase tracking-widest">Histórico</th>
                  <th className="px-6 py-4 text-[10px] font-black text-white/60 uppercase tracking-widest text-right">Valor</th>
                  <th className="px-6 py-4 text-[10px] font-black text-white/60 uppercase tracking-widest text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {combinedTransactions.map(t => (
                  <tr key={t.id} className="hover:bg-white/5">
                    <td className="px-6 py-4 text-[11px] font-mono text-white/50">
                      {new Date(t.date + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-6 py-4 text-xs font-black text-white uppercase">{t.description}</td>
                    <td className={`px-6 py-4 text-right font-mono text-sm font-black ${t.type === 'INCOME' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {t.type === 'INCOME' ? '+' : '-'} R$ {t.amount.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-sm font-black text-white">
                      R$ {t.balance.toFixed(2)}
                    </td>
                  </tr>
                ))}
                {combinedTransactions.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-16 text-center text-xs font-black text-white/20 uppercase tracking-widest">
                      Sem movimentações no período
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Toast Message */}
      {toastMessage && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-emerald-500 text-black px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl flex items-center gap-2 z-50">
          <CheckCircle2 className="w-4 h-4" />
          {toastMessage}
        </div>
      )}
    </div>
  );
};
