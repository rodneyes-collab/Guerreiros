import React from 'react';
import { Player, Gender } from '../types';
import { getPlayerTier } from '../utils/tierUtils';
import { X, Target } from 'lucide-react';

interface PlayerFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  editingPlayer: Player | null;
  formData: any;
  setFormData: (data: any) => void;
  isAdmin?: boolean;
}

export const PlayerForm: React.FC<PlayerFormProps> = ({
  isOpen,
  onClose,
  onSubmit,
  editingPlayer,
  formData,
  setFormData,
  isAdmin = false
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300 overflow-y-auto">
      <div className="bg-black w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-white/5 border-l-[8px] border-l-brand-primary overflow-hidden animate-in zoom-in-95 duration-300 my-auto">
        <div className="p-8 border-b border-brand-primary/40 flex justify-between items-center bg-white/5">
          <div>
            <h3 className="text-2xl font-black text-brand-primary uppercase tracking-tight">
              {editingPlayer ? 'Editar Sócio' : 'Novo Sócio'}
            </h3>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">Preencha os dados abaixo</p>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-white/10 rounded-2xl transition-all text-white/60 hover:text-white"><X className="w-6 h-6" /></button>
        </div>
        
        <form onSubmit={onSubmit} className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Nome Completo</label>
            <input
              type="text"
              name="name"
              required
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-6 py-4 bg-white/5 border border-brand-primary/40 rounded-2xl focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all font-bold text-white outline-none placeholder:text-white/20"
              placeholder="Ex: João Silva"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Gênero</label>
              <select
                name="gender"
                value={formData.gender}
                onChange={e => setFormData({ ...formData, gender: e.target.value as Gender })}
                className="w-full px-6 py-4 bg-white/5 border border-brand-primary/40 rounded-2xl focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all font-bold text-white outline-none appearance-none"
              >
                <option value={Gender.MALE} className="bg-brand-secondary text-white">Masculino</option>
                <option value={Gender.FEMALE} className="bg-brand-secondary text-white">Feminino</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Partidas Jogadas</label>
              <input
                type="number"
                name="matchesPlayed"
                required
                value={formData.matchesPlayed ?? 0}
                onChange={e => setFormData({ ...formData, matchesPlayed: parseInt(e.target.value) || 0 })}
                className="w-full px-6 py-4 bg-white/5 border border-brand-primary/40 rounded-2xl focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all font-bold text-white outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">ELO Inicial</label>
              <input
                type="number"
                name="elo"
                required
                value={formData.elo}
                onChange={e => setFormData({ ...formData, elo: parseInt(e.target.value) || 0 })}
                className="w-full px-6 py-4 bg-white/5 border border-brand-primary/40 rounded-2xl focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all font-bold text-white outline-none"
              />
            </div>
          </div>

          {/* Tier Preview */}
          <div className="bg-white/5 p-4 rounded-2xl border border-brand-primary/20 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-primary/10 rounded-xl">
                <Target className="w-5 h-5 text-brand-primary" />
              </div>
              <div>
                <p className="text-[8px] font-black text-white/40 uppercase tracking-widest">Nível Calculado</p>
                <p className={`text-sm font-black uppercase tracking-tight ${getPlayerTier(formData).color}`}>
                  {getPlayerTier(formData).label}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[8px] font-black text-white/40 uppercase tracking-widest">Status Inicial</p>
              <p className="text-[10px] font-bold text-white/60 uppercase">Baseado em ELO e Jogos</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Data de Nascimento (Dia/Mês)</label>
            <div className="grid grid-cols-2 gap-4">
              <select
                value={formData.birthDate ? formData.birthDate.split('-')[2] : ''}
                onChange={e => {
                  const day = e.target.value;
                  const current = formData.birthDate || '1900-01-01';
                  const [y, m] = current.split('-');
                  setFormData({ ...formData, birthDate: `${y}-${m}-${day.padStart(2, '0')}` });
                }}
                className="w-full px-6 py-4 bg-white/5 border border-brand-primary/40 rounded-2xl focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all font-bold text-white outline-none appearance-none"
              >
                <option value="" className="bg-brand-secondary text-white/40">Dia</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                  <option key={d} value={d.toString().padStart(2, '0')} className="bg-brand-secondary text-white">{d}</option>
                ))}
              </select>
              <select
                value={formData.birthDate ? formData.birthDate.split('-')[1] : ''}
                onChange={e => {
                  const month = e.target.value;
                  const current = formData.birthDate || '1900-01-01';
                  const [y, _, d] = current.split('-');
                  setFormData({ ...formData, birthDate: `${y}-${month.padStart(2, '0')}-${d}` });
                }}
                className="w-full px-6 py-4 bg-white/5 border border-brand-primary/40 rounded-2xl focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all font-bold text-white outline-none appearance-none"
              >
                <option value="" className="bg-brand-secondary text-white/40">Mês</option>
                {[
                  { v: '01', l: 'Janeiro' }, { v: '02', l: 'Fevereiro' }, { v: '03', l: 'Março' },
                  { v: '04', l: 'Abril' }, { v: '05', l: 'Maio' }, { v: '06', l: 'Junho' },
                  { v: '07', l: 'Julho' }, { v: '08', l: 'Agosto' }, { v: '09', l: 'Setembro' },
                  { v: '10', l: 'Outubro' }, { v: '11', l: 'Novembro' }, { v: '12', l: 'Dezembro' }
                ].map(m => (
                  <option key={m.v} value={m.v} className="bg-brand-secondary text-white">{m.l}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Email (Opcional)</label>
            <input
              type="email"
              name="email"
              value={formData.email || ''}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-6 py-4 bg-white/5 border border-brand-primary/40 rounded-2xl focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all font-bold text-white outline-none placeholder:text-white/20"
              placeholder="Ex: joao@exemplo.com"
            />
          </div>

          {(isAdmin || editingPlayer?.isAdmin) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Data de Entrada</label>
                <input
                  type="date"
                  name="joinedAt"
                  required
                  value={formData.joinedAt}
                  onChange={e => setFormData({ ...formData, joinedAt: e.target.value })}
                  className="w-full px-6 py-4 bg-white/5 border border-brand-primary/40 rounded-2xl focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all font-bold text-white outline-none [color-scheme:dark]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Nível de Impacto (Equilíbrio)</label>
                <select
                  name="impactLevel"
                  value={formData.impactLevel || 1}
                  onChange={e => setFormData({ ...formData, impactLevel: parseInt(e.target.value) })}
                  className="w-full px-6 py-4 bg-white/5 border border-brand-primary/40 rounded-2xl focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all font-bold text-white outline-none appearance-none"
                >
                  <option value={1} className="bg-brand-secondary text-white">1 - Base / Suporte</option>
                  <option value={2} className="bg-brand-secondary text-white">2 - Médio / Técnico</option>
                  <option value={3} className="bg-brand-secondary text-white">3 - Elite / Power (Atacantes)</option>
                </select>
                <p className="text-[8px] font-bold text-white/30 uppercase tracking-tight ml-1">Usado apenas para balanceamento oculto</p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Status do Sócio</label>
            <select
              name="status"
              value={formData.status || 'active'}
              onChange={e => setFormData({ ...formData, status: e.target.value })}
              className="w-full px-6 py-4 bg-white/5 border border-brand-primary/40 rounded-2xl focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all font-bold text-white outline-none appearance-none"
            >
              <option value="active" className="bg-brand-secondary text-white">Ativo</option>
              <option value="waitlist" className="bg-brand-secondary text-white">Lista de Espera</option>
              <option value="inactive" className="bg-brand-secondary text-white">Inativo</option>
            </select>
          </div>

          {isAdmin && (
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-4 p-6 bg-white/5 rounded-3xl border border-brand-primary/40">
                <input
                  type="checkbox"
                  id="isOfficialSetter"
                  name="isOfficialSetter"
                  checked={formData.isOfficialSetter}
                  onChange={e => setFormData({ ...formData, isOfficialSetter: e.target.checked })}
                  className="w-6 h-6 rounded-lg border-white/20 bg-white/5 text-brand-primary focus:ring-brand-primary"
                />
                <label htmlFor="isOfficialSetter" className="text-sm font-black text-white uppercase tracking-tight cursor-pointer">
                  Levantador
                </label>
              </div>

              <div className="flex items-center gap-4 p-6 bg-white/5 rounded-3xl border border-brand-primary/40">
                <input
                  type="checkbox"
                  id="isAdmin"
                  name="isAdmin"
                  checked={formData.isAdmin}
                  onChange={e => setFormData({ ...formData, isAdmin: e.target.checked })}
                  className="w-6 h-6 rounded-lg border-white/20 bg-white/5 text-brand-primary focus:ring-brand-primary"
                />
                <label htmlFor="isAdmin" className="text-sm font-black text-white uppercase tracking-tight cursor-pointer">
                  Admin
                </label>
              </div>
            </div>
          )}

          <div className="pt-4 flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-8 py-4 bg-white/5 text-white/60 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all border border-brand-primary/40"
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
