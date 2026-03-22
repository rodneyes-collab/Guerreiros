import React from 'react';
import { 
  ShieldCheck, 
  Info, 
  AlertCircle,
  CheckCircle2,
  Scale
} from 'lucide-react';

export const RulesView: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="text-center space-y-4">
        <div className="inline-flex p-4 bg-indigo-50 rounded-3xl text-indigo-600 mb-2">
          <ShieldCheck className="w-10 h-10" />
        </div>
        <h2 className="text-5xl font-black text-slate-900 uppercase tracking-tighter">Regras & Funcionamento</h2>
        <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-sm">Diretrizes Oficiais SpikeGen / Guerreiros</p>
      </div>

      <div className="grid gap-8">
        <section className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm space-y-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-[0.03]">
            <Scale className="w-40 h-40 text-slate-900" />
          </div>
          
          <div className="flex items-center gap-4 text-indigo-600">
            <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center">
              <Info className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-black uppercase tracking-tight">Dinâmica de Presença</h3>
          </div>

          <div className="grid gap-6">
            {[
              { title: "Confirmação Diária", desc: "A confirmação de intenção de jogo deve ser realizada no dia da partida. O sistema registra automaticamente a ordem de chegada." },
              { title: "Ordem de Chegada", desc: "A ordem de chegada é o critério fundamental para o desempate na escalação de levantadores e jogadores em espera." },
              { title: "Check-in Presencial", desc: "Ao chegar na quadra, o sócio deve confirmar sua presença física para ser incluído no sorteio da próxima rodada." }
            ].map((item, i) => (
              <div key={i} className="flex gap-6 group">
                <span className="text-4xl font-black text-slate-100 group-hover:text-indigo-100 transition-colors italic">0{i+1}</span>
                <div className="space-y-1">
                  <h4 className="font-black text-slate-800 uppercase text-sm tracking-widest">{item.title}</h4>
                  <p className="text-slate-500 leading-relaxed font-medium">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm space-y-8 relative overflow-hidden">
          <div className="flex items-center gap-4 text-indigo-600">
            <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-black uppercase tracking-tight">Formação de Equipes</h3>
          </div>

          <div className="grid gap-6">
            {[
              { title: "Prioridade de Levantadores", desc: "Levantadores Oficiais têm prioridade. Entre eles, joga quem tiver menos partidas disputadas no dia. A ordem de chegada é o desempate." },
              { title: "Levantadores Reservas", desc: "Caso não haja levantadores oficiais suficientes, o sistema selecionará levantadores reservas para completar as equipes." },
              { title: "Equilíbrio por ELO", desc: "Os times são formados por 6 jogadores (1 levantador + 5 linha), equilibrados tecnicamente através do ranking de ELO." },
              { title: "Distribuição de Gênero", desc: "Homens de maior ELO são alternados entre os times. As mulheres são distribuídas para equilibrar a soma total de ELO das equipes." }
            ].map((item, i) => (
              <div key={i} className="flex gap-6 group">
                <span className="text-4xl font-black text-slate-100 group-hover:text-indigo-100 transition-colors italic">0{i+4}</span>
                <div className="space-y-1">
                  <h4 className="font-black text-slate-800 uppercase text-sm tracking-widest">{item.title}</h4>
                  <p className="text-slate-500 leading-relaxed font-medium">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="grid md:grid-cols-2 gap-8">
          <section className="bg-emerald-50/50 p-10 rounded-[3rem] border border-emerald-100 space-y-6">
            <div className="flex items-center gap-4 text-emerald-600">
              <CheckCircle2 className="w-8 h-8" />
              <h3 className="text-xl font-black uppercase tracking-tight">Conduta Esperada</h3>
            </div>
            <ul className="space-y-4">
              {[
                "Respeito absoluto às decisões do sistema de sorteio",
                "Fair play e espírito esportivo em todas as jogadas",
                "Zelo pelo material esportivo e infraestrutura do Guerreiros",
                "Pontualidade e compromisso com as confirmações"
              ].map((text, i) => (
                <li key={i} className="flex items-start gap-3 text-emerald-800 font-bold text-sm">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                  {text}
                </li>
              ))}
            </ul>
          </section>

          <section className="bg-rose-50/50 p-10 rounded-[3rem] border border-rose-100 space-y-6">
            <div className="flex items-center gap-4 text-rose-600">
              <AlertCircle className="w-8 h-8" />
              <h3 className="text-xl font-black uppercase tracking-tight">Infrações</h3>
            </div>
            <ul className="space-y-4">
              {[
                "Discussões agressivas ou ofensas a outros sócios",
                "Atrasos recorrentes que prejudiquem o início dos sets",
                "Falta de confirmação de presença (prejudica o sorteio)",
                "Tentar burlar o sistema de ranking ou ordem de chegada"
              ].map((text, i) => (
                <li key={i} className="flex items-start gap-3 text-rose-800 font-bold text-sm">
                  <div className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0" />
                  {text}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <div className="bg-slate-900 p-12 rounded-[3rem] text-center space-y-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 to-transparent pointer-events-none" />
        <h3 className="text-2xl font-black text-white uppercase tracking-tight relative z-10">Dúvidas ou Sugestões?</h3>
        <p className="text-slate-400 font-medium max-w-lg mx-auto relative z-10">
          O regulamento técnico detalhado está disponível com a coordenação. 
          Casos omissos serão resolvidos pela comissão técnica.
        </p>
        <button className="bg-white text-slate-900 px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-50 transition-all relative z-10">
          Falar com Admin
        </button>
      </div>
    </div>
  );
};
