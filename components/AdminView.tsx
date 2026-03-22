import React from 'react';
import { useStore } from '../store';
import { 
  Settings, 
  Database, 
  Shield, 
  RefreshCw,
  Trash2,
  Download,
  Upload,
  MapPin,
  Save
} from 'lucide-react';
import { db, doc, updateDoc } from '../firebase';

interface AdminViewProps {
  resetDailyStats: () => void;
  triggerSync: () => void;
  recalculateStats: () => void;
}

export const AdminView: React.FC<AdminViewProps> = ({
  resetDailyStats,
  triggerSync,
  recalculateStats
}) => {
  const { userRole, players, matches, payments, systemMetadata, setSystemMetadata, showNotification } = useStore();
  const [lat, setLat] = React.useState(systemMetadata.courtLocation?.lat.toString() || '');
  const [lng, setLng] = React.useState(systemMetadata.courtLocation?.lng.toString() || '');
  const [radius, setRadius] = React.useState(systemMetadata.geofenceRadius?.toString() || '150');

  const handleSaveLocation = async () => {
    const nLat = parseFloat(lat);
    const nLng = parseFloat(lng);
    const nRadius = parseInt(radius);

    if (isNaN(nLat) || isNaN(nLng) || isNaN(nRadius)) {
      showNotification("Valores inválidos para localização", "error");
      return;
    }

    try {
      await updateDoc(doc(db, 'metadata', 'system'), {
        courtLocation: { lat: nLat, lng: nLng },
        geofenceRadius: nRadius
      });
      setSystemMetadata({
        courtLocation: { lat: nLat, lng: nLng },
        geofenceRadius: nRadius
      });
      showNotification("Localização da quadra atualizada!", "success");
    } catch (error) {
      console.error("Erro ao salvar localização:", error);
      showNotification("Erro ao salvar localização", "error");
    }
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      showNotification("Geolocalização não suportada", "error");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        showNotification("Localização atual capturada!", "info");
      },
      (err) => {
        showNotification("Erro ao capturar localização: " + err.message, "error");
      }
    );
  };

  if (userRole !== 'ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-6">
        <div className="p-6 bg-rose-50 rounded-full text-rose-600">
          <Shield className="w-16 h-16" />
        </div>
        <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Acesso Restrito</h2>
        <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">Esta área é exclusiva para administradores</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter">Painel de Controle</h2>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-2">Configurações avançadas do sistema</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <section className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm space-y-8">
            <div className="flex items-center gap-4 text-slate-900">
              <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center">
                <MapPin className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black uppercase tracking-tight">Localização da Quadra</h3>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Latitude</label>
                    <input 
                      type="text" 
                      value={lat}
                      onChange={(e) => setLat(e.target.value)}
                      placeholder="-23.588453"
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-sm font-bold focus:border-indigo-500 focus:ring-0 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Longitude</label>
                    <input 
                      type="text" 
                      value={lng}
                      onChange={(e) => setLng(e.target.value)}
                      placeholder="-46.658890"
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-sm font-bold focus:border-indigo-500 focus:ring-0 transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Raio de Check-in (metros)</label>
                  <input 
                    type="number" 
                    value={radius}
                    onChange={(e) => setRadius(e.target.value)}
                    placeholder="150"
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-sm font-bold focus:border-indigo-500 focus:ring-0 transition-all"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-4 justify-end">
                <button 
                  onClick={getCurrentLocation}
                  className="flex items-center justify-center gap-3 p-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
                >
                  <MapPin className="w-4 h-4" /> Capturar Minha Posição
                </button>
                <button 
                  onClick={handleSaveLocation}
                  className="flex items-center justify-center gap-3 p-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all"
                >
                  <Save className="w-4 h-4" /> Salvar Configurações
                </button>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 font-bold leading-relaxed italic">
              * A localização é usada para o check-in automático no dia do jogo. Os sócios precisam estar dentro do raio definido para confirmar presença.
            </p>
          </section>

          <section className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm space-y-8">
            <div className="flex items-center gap-4 text-slate-900">
              <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center">
                <Database className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black uppercase tracking-tight">Manutenção de Dados</h3>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <button 
                onClick={resetDailyStats}
                className="flex flex-col items-start p-8 bg-amber-50 border border-amber-100 rounded-3xl hover:bg-amber-100 transition-all group text-left"
              >
                <RefreshCw className="w-8 h-8 text-amber-600 mb-4 group-hover:rotate-180 transition-transform duration-500" />
                <h4 className="font-black text-amber-900 uppercase text-sm tracking-widest mb-2">Resetar Estatísticas Diárias</h4>
                <p className="text-amber-700/70 text-xs font-medium leading-relaxed">Zera as vitórias, derrotas e partidas jogadas hoje de todos os sócios.</p>
              </button>

              <button 
                onClick={triggerSync}
                className="flex flex-col items-start p-8 bg-indigo-50 border border-indigo-100 rounded-3xl hover:bg-indigo-100 transition-all group text-left"
              >
                <RefreshCw className="w-8 h-8 text-indigo-600 mb-4 group-hover:rotate-180 transition-transform duration-500" />
                <h4 className="font-black text-indigo-900 uppercase text-sm tracking-widest mb-2">Forçar Sincronização</h4>
                <p className="text-indigo-700/70 text-xs font-medium leading-relaxed">Sincroniza manualmente todos os dados locais com o banco de dados na nuvem.</p>
              </button>

              <button 
                onClick={recalculateStats}
                className="flex flex-col items-start p-8 bg-emerald-50 border border-emerald-100 rounded-3xl hover:bg-emerald-100 transition-all group text-left"
              >
                <RefreshCw className="w-8 h-8 text-emerald-600 mb-4 group-hover:rotate-180 transition-transform duration-500" />
                <h4 className="font-black text-emerald-900 uppercase text-sm tracking-widest mb-2">Recalcular Estatísticas</h4>
                <p className="text-emerald-700/70 text-xs font-medium leading-relaxed">Reconstrói as sinergias e rivalidades a partir de todo o histórico de partidas.</p>
              </button>
            </div>
          </section>

          <section className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm space-y-8">
            <div className="flex items-center gap-4 text-slate-900">
              <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center">
                <Settings className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black uppercase tracking-tight">Exportação & Backup</h3>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <button className="flex items-center gap-4 p-6 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-slate-100 transition-all text-left">
                <Download className="w-6 h-6 text-slate-600" />
                <div>
                  <h4 className="font-black text-slate-800 uppercase text-[10px] tracking-widest">Exportar CSV</h4>
                  <p className="text-slate-500 text-[10px] font-medium">Baixar lista de sócios e ELO</p>
                </div>
              </button>
              <button className="flex items-center gap-4 p-6 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-slate-100 transition-all text-left">
                <Upload className="w-6 h-6 text-slate-600" />
                <div>
                  <h4 className="font-black text-slate-800 uppercase text-[10px] tracking-widest">Importar Dados</h4>
                  <p className="text-slate-500 text-[10px] font-medium">Carregar sócios via arquivo</p>
                </div>
              </button>
            </div>
          </section>
        </div>

        <div className="space-y-8">
          <section className="bg-slate-900 p-10 rounded-[3rem] text-white space-y-8">
            <h3 className="text-xl font-black uppercase tracking-tight">Status do Sistema</h3>
            <div className="space-y-6">
              {[
                { label: "Total de Sócios", value: players.length },
                { label: "Partidas Registradas", value: matches.length },
                { label: "Lançamentos Financeiros", value: payments.length },
                { label: "Versão do App", value: "2.4.0" }
              ].map((stat, i) => (
                <div key={i} className="flex justify-between items-end border-b border-white/10 pb-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
                  <p className="text-xl font-black font-mono">{stat.value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-rose-50 p-10 rounded-[3rem] border border-rose-100 space-y-6">
            <div className="flex items-center gap-4 text-rose-600">
              <Trash2 className="w-6 h-6" />
              <h3 className="text-lg font-black uppercase tracking-tight">Zona de Perigo</h3>
            </div>
            <p className="text-rose-700/70 text-xs font-bold leading-relaxed">
              Ações nesta área são irreversíveis. Tenha cautela ao prosseguir.
            </p>
            <button className="w-full py-4 bg-rose-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-rose-700 transition-all shadow-lg shadow-rose-200">
              Apagar Todo o Histórico
            </button>
          </section>
        </div>
      </div>
    </div>
  );
};
