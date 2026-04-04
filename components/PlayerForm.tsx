import React from 'react';
import { Player, Gender } from '../types';
import { X } from 'lucide-react';

interface PlayerFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  editingPlayer: Player | null;
  formData: any;
  setFormData: (data: any) => void;
}

export const PlayerForm: React.FC<PlayerFormProps> = ({
  isOpen,
  onClose,
  onSubmit,
  editingPlayer,
  formData,
  setFormData
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-brand-secondary/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300 overflow-y-auto">
      <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 my-auto">
        <div className="p-8 border-b border-brand-accent/10 flex justify-between items-center bg-brand-light">
          <div>
            <h3 className="text-2xl font-black text-brand-secondary uppercase tracking-tight">
              {editingPlayer ? 'Editar Sócio' : 'Novo Sócio'}
            </h3>
            <p className="text-[10px] font-bold text-brand-accent uppercase tracking-widest mt-1">Preencha os dados abaixo</p>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-white rounded-2xl transition-all shadow-sm"><X className="w-6 h-6 text-brand-accent" /></button>
        </div>
        
        <form onSubmit={onSubmit} className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-brand-accent uppercase tracking-widest ml-1">Nome Completo</label>
            <input
              type="text"
              name="name"
              required
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-6 py-4 bg-brand-light border border-brand-accent/20 rounded-2xl focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all font-bold text-brand-secondary outline-none placeholder:text-brand-accent/50"
              placeholder="Ex: João Silva"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-brand-accent uppercase tracking-widest ml-1">Gênero</label>
              <select
                name="gender"
                value={formData.gender}
                onChange={e => setFormData({ ...formData, gender: e.target.value as Gender })}
                className="w-full px-6 py-4 bg-brand-light border border-brand-accent/20 rounded-2xl focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all font-bold text-brand-secondary outline-none appearance-none"
              >
                <option value={Gender.MALE}>Masculino</option>
                <option value={Gender.FEMALE}>Feminino</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-brand-accent uppercase tracking-widest ml-1">Partidas Jogadas</label>
              <input
                type="number"
                name="matchesPlayed"
                required
                value={formData.matchesPlayed ?? 0}
                onChange={e => setFormData({ ...formData, matchesPlayed: parseInt(e.target.value) || 0 })}
                className="w-full px-6 py-4 bg-brand-light border border-brand-accent/20 rounded-2xl focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all font-bold text-brand-secondary outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-brand-accent uppercase tracking-widest ml-1">ELO Inicial</label>
              <input
                type="number"
                name="elo"
                required
                value={formData.elo}
                onChange={e => setFormData({ ...formData, elo: parseInt(e.target.value) })}
                className="w-full px-6 py-4 bg-brand-light border border-brand-accent/20 rounded-2xl focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all font-bold text-brand-secondary outline-none"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-brand-accent uppercase tracking-widest ml-1">Email (Opcional)</label>
            <input
              type="email"
              name="email"
              value={formData.email || ''}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-6 py-4 bg-brand-light border border-brand-accent/20 rounded-2xl focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all font-bold text-brand-secondary outline-none placeholder:text-brand-accent/50"
              placeholder="Ex: joao@exemplo.com"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-brand-accent uppercase tracking-widest ml-1">Data de Entrada</label>
            <input
              type="date"
              name="joinedAt"
              required
              value={formData.joinedAt}
              onChange={e => setFormData({ ...formData, joinedAt: e.target.value })}
              className="w-full px-6 py-4 bg-brand-light border border-brand-accent/20 rounded-2xl focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all font-bold text-brand-secondary outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-4 p-6 bg-brand-light rounded-3xl border border-brand-accent/10">
              <input
                type="checkbox"
                id="isOfficialSetter"
                name="isOfficialSetter"
                checked={formData.isOfficialSetter}
                onChange={e => setFormData({ ...formData, isOfficialSetter: e.target.checked })}
                className="w-6 h-6 rounded-lg border-brand-accent/30 text-brand-primary focus:ring-brand-primary"
              />
              <label htmlFor="isOfficialSetter" className="text-sm font-black text-brand-secondary uppercase tracking-tight cursor-pointer">
                Levantador
              </label>
            </div>

            <div className="flex items-center gap-4 p-6 bg-brand-light rounded-3xl border border-brand-accent/10">
              <input
                type="checkbox"
                id="isAdmin"
                name="isAdmin"
                checked={formData.isAdmin}
                onChange={e => setFormData({ ...formData, isAdmin: e.target.checked })}
                className="w-6 h-6 rounded-lg border-brand-accent/30 text-brand-primary focus:ring-brand-primary"
              />
              <label htmlFor="isAdmin" className="text-sm font-black text-brand-secondary uppercase tracking-tight cursor-pointer">
                Admin
              </label>
            </div>
          </div>

          <div className="pt-4 flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-8 py-4 bg-brand-light text-brand-accent rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-brand-accent/10 transition-all border border-brand-accent/20"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-[2] px-8 py-4 bg-brand-primary text-brand-secondary rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-brand-primary/90 shadow-xl shadow-brand-primary/10 transition-all"
            >
              {editingPlayer ? 'Salvar Alterações' : 'Cadastrar Sócio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
