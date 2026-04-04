import React from 'react';
import { X, Save, DollarSign, Calendar, Tag, FileText } from 'lucide-react';

interface ExpenseFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  editingExpense: any;
  expenseFormData: any;
  setExpenseFormData: (data: any) => void;
}

export const ExpenseForm: React.FC<ExpenseFormProps> = ({
  isOpen,
  onClose,
  onSubmit,
  editingExpense,
  expenseFormData,
  setExpenseFormData
}) => {
  if (!isOpen) return null;

  const categories = [
    { value: 'RENT', label: 'Aluguel de Quadra' },
    { value: 'EQUIPMENT', label: 'Equipamento (Bolas, Redes)' },
    { value: 'TOURNAMENT', label: 'Inscrição em Torneio' },
    { value: 'OTHER', label: 'Outros' }
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-brand-secondary/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="bg-brand-secondary px-8 py-6 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-black text-brand-primary uppercase tracking-tight">
              {editingExpense ? 'Editar Despesa' : 'Nova Despesa'}
            </h3>
            <p className="text-brand-accent text-[10px] font-bold uppercase tracking-widest mt-1">Registro de gastos do clube</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-brand-accent uppercase tracking-widest ml-1 flex items-center gap-2">
              <FileText className="w-3 h-3" /> Descrição
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Aluguel da quadra - Março"
              value={expenseFormData.description}
              onChange={e => setExpenseFormData({ ...expenseFormData, description: e.target.value })}
              className="w-full px-6 py-4 bg-brand-light border border-brand-accent/20 rounded-2xl focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all font-bold text-brand-secondary outline-none placeholder:text-brand-accent/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-brand-accent uppercase tracking-widest ml-1 flex items-center gap-2">
                <DollarSign className="w-3 h-3" /> Valor
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={expenseFormData.amount || ''}
                onChange={e => setExpenseFormData({ ...expenseFormData, amount: parseFloat(e.target.value) })}
                className="w-full px-6 py-4 bg-brand-light border border-brand-accent/20 rounded-2xl focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all font-bold text-brand-secondary outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-brand-accent uppercase tracking-widest ml-1 flex items-center gap-2">
                <Calendar className="w-3 h-3" /> Data
              </label>
              <input
                type="date"
                required
                value={expenseFormData.date}
                onChange={e => setExpenseFormData({ ...expenseFormData, date: e.target.value })}
                className="w-full px-6 py-4 bg-brand-light border border-brand-accent/20 rounded-2xl focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all font-bold text-brand-secondary outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-brand-accent uppercase tracking-widest ml-1 flex items-center gap-2">
                <Tag className="w-3 h-3" /> Categoria
              </label>
              <select
                value={expenseFormData.category}
                onChange={e => setExpenseFormData({ ...expenseFormData, category: e.target.value })}
                className="w-full px-6 py-4 bg-brand-light border border-brand-accent/20 rounded-2xl focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all font-bold text-brand-secondary outline-none appearance-none"
              >
                {categories.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-brand-accent uppercase tracking-widest ml-1 flex items-center gap-2">
                <Calendar className="w-3 h-3" /> Mês de Referência
              </label>
              <input
                type="month"
                required
                value={expenseFormData.month}
                onChange={e => setExpenseFormData({ ...expenseFormData, month: e.target.value })}
                className="w-full px-6 py-4 bg-brand-light border border-brand-accent/20 rounded-2xl focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all font-bold text-brand-secondary outline-none"
              />
            </div>
          </div>

          <div className="pt-4 flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest text-brand-accent hover:bg-brand-light transition-all border border-brand-accent/20"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 bg-brand-primary text-brand-secondary px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-brand-primary/90 shadow-xl shadow-brand-primary/10 transition-all"
            >
              <Save className="w-5 h-5" />
              {editingExpense ? 'Salvar Alterações' : 'Registrar Despesa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
