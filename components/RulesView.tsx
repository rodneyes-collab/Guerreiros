import React from 'react';
import { 
  ShieldCheck, 
  Info, 
  AlertCircle,
  CheckCircle2,
  Scale,
  Trophy,
  CreditCard,
  Users,
  Dribbble
} from 'lucide-react';

export const RulesView: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="text-center space-y-4">
        <div className="inline-flex p-4 bg-indigo-50 rounded-3xl text-indigo-600 mb-2">
          <ShieldCheck className="w-10 h-10" />
        </div>
        <h2 className="text-5xl font-black text-slate-900 uppercase tracking-tighter">Regras & Funcionamento</h2>
        <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-sm">Diretrizes Oficiais Guerreiros</p>
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

          <div className="grid gap-8">
            {[
              { title: "Abertura da Lista", desc: "A lista de presença é organizada pelo admin e será iniciada no momento que tenha pelo menos 12 jogadores que chegaram ou às 20:00." },
              { title: "Gestão de Fila de Espera", desc: "O sistema mantém uma fila dinâmica. Jogadores que chegam após o início da primeira partida entram no final da lista de espera, respeitando o rodízio de quem ainda não jogou." }
            ].map((item, i) => (
              <div key={i} className="flex gap-6 group">
                <span className="text-4xl font-black text-slate-100 group-hover:text-indigo-100 transition-colors italic">{String(i+1).padStart(2, '0')}</span>
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

          <div className="grid gap-8">
            {[
              { title: "Prioridade de Rodízio", desc: "Jogadores que não participaram da rodada anterior têm prioridade absoluta na escalação da rodada seguinte, garantindo que todos joguem o máximo de tempo possível." },
              { title: "Hierarquia de Levantadores", desc: "Levantadores Oficiais (designados pelo Admin) têm prioridade na vaga técnica. Entre eles, joga quem tiver menos sets disputados no dia. A ordem de chegada é o critério final de desempate." },
              { title: "Equilíbrio Técnico (Algoritmo ELO)", desc: "O sistema busca equalizar a soma de ELO de ambos os times. A meta é manter uma disparidade técnica menor que 10% entre as equipes para garantir competitividade." },
              { title: "Distribuição e Critérios", desc: "O sorteio prioriza quem não jogou a partida anterior. Entre os que jogaram, a ordem de chegada no local define a prioridade. Para os levantadores, segue-se a mesma lógica de rodízio e chegada, garantindo alternância justa. O gênero é distribuído para equilibrar a força técnica das equipes." }
            ].map((item, i) => (
              <div key={i} className="flex gap-6 group">
                <span className="text-4xl font-black text-slate-100 group-hover:text-indigo-100 transition-colors italic">{String(i+3).padStart(2, '0')}</span>
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
              <Trophy className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-black uppercase tracking-tight">Sistema de Pontuação e ELO</h3>
          </div>

          <div className="grid gap-8">
            {[
              { title: "Cálculo de Vitória/Derrota", desc: "O ganho ou perda de ELO é calculado com base na probabilidade de vitória. Vencer um time tecnicamente superior rende mais pontos do que vencer um time inferior." },
              { title: "Duração das Partidas", desc: "Sets oficiais são disputados até 15 pontos. Não há tempo limite para a duração dos sets." },
              { title: "Bônus de Performance", desc: "Vitórias consecutivas (streak) ativam um multiplicador de ELO, incentivando a consistência. O multiplicador reseta após a primeira derrota ou ao final da sessão diária." }
            ].map((item, i) => (
              <div key={i} className="flex gap-6 group">
                <span className="text-4xl font-black text-slate-100 group-hover:text-indigo-100 transition-colors italic">{String(i+7).padStart(2, '0')}</span>
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
              <CreditCard className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-black uppercase tracking-tight">Gestão Financeira</h3>
          </div>

          <div className="grid gap-8">
            {[
              { title: "Vencimento da Mensalidade", desc: "As mensalidades vencem no dia 05 de cada mês. O pagamento em dia garante a manutenção do status 'Ativo' e acesso total às funcionalidades do aplicativo." },
              { title: "Taxa de Manutenção", desc: "Sócios que optarem pelo plano trimestral ou semestral possuem descontos progressivos. A taxa cobre aluguel da quadra, bolas novas a cada 3 meses e eventos do clube." }
            ].map((item, i) => (
              <div key={i} className="flex gap-6 group">
                <span className="text-4xl font-black text-slate-100 group-hover:text-indigo-100 transition-colors italic">{String(i+10).padStart(2, '0')}</span>
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
              <Dribbble className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-black uppercase tracking-tight">Uso da Quadra e Equipamentos</h3>
          </div>

          <div className="grid gap-8">
            {[
              { title: "Aquecimento Prévio", desc: "O aquecimento com bola deve ser feito nas áreas laterais para não atrasar o início dos sets em quadra. O tempo de rede para aquecimento oficial é de apenas 5 minutos." },
              { title: "Cuidado com as Bolas", desc: "As bolas de jogo são exclusivas para uso em quadra. É proibido chutar as bolas ou utilizá-las em superfícies abrasivas fora da área de jogo." }
            ].map((item, i) => (
              <div key={i} className="flex gap-6 group">
                <span className="text-4xl font-black text-slate-100 group-hover:text-indigo-100 transition-colors italic">{String(i+12).padStart(2, '0')}</span>
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
                "Respeito absoluto às decisões do sistema de sorteio e arbitragem",
                "Fair play: acusar toques na rede e bolas fora sem necessidade de VAR",
                "Espírito esportivo: incentivar colegas de todos os níveis técnicos",
                "Zelo pelo material (bolas, antenas, rede) e limpeza da quadra",
                "Pontualidade rigorosa nos horários de início e trocas de set",
                "Uso obrigatório de vestimenta esportiva adequada (tênis de quadra)"
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
              <h3 className="text-xl font-black uppercase tracking-tight">Infrações e Penalidades</h3>
            </div>
            <ul className="space-y-4">
              {[
                "Discussões agressivas, ofensas ou conduta antidesportiva grave",
                "Atrasos recorrentes que atrasem o cronograma do clube",
                "Abandono de partida em andamento sem motivo de força maior",
                "Tentar manipular o sistema de ranking ou burlar a fila de presença",
                "Uso de linguagem imprópria ou gestos obscenos em quadra",
                "Reclamações excessivas com a mesa técnica ou administradores"
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
    </div>
  );
};
