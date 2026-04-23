import React from 'react';
import { 
  ShieldCheck, 
  Info, 
  AlertCircle,
  CheckCircle2,
  Scale,
  Trophy,
  Target,
  CreditCard,
  Users,
  Dribbble
} from 'lucide-react';

export const RulesView: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="text-center space-y-4">
        <div className="inline-flex p-4 bg-white/5 rounded-3xl text-brand-primary mb-2 border border-brand-primary/40">
          <ShieldCheck className="w-10 h-10" />
        </div>
        <h2 className="text-5xl font-black text-white uppercase tracking-tighter">Regras & Funcionamento</h2>
        <p className="text-brand-primary font-bold uppercase tracking-[0.2em] text-sm">Diretrizes Oficiais Guerreiros</p>
      </div>

      <div className="grid gap-8">
        <section className="bg-black backdrop-blur-xl p-10 rounded-[3rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-sm space-y-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <Scale className="w-40 h-40 text-white" />
          </div>
          
          <div className="flex items-center gap-4 text-brand-primary">
            <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-brand-primary/40">
              <Info className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-black uppercase tracking-tight text-white">Dinâmica de Presença</h3>
          </div>

          <div className="grid gap-8">
            {[
              { title: "Abertura da Lista", desc: "A lista de presença é aberta pelo administrador quando chegarem pelo menos 12 jogadores ou às 20:00 em ponto." },
              { title: "Fila de Espera", desc: "Quem chegar depois do início do primeiro jogo entra no fim da fila. O sistema sempre prioriza quem ainda não jogou no dia." }
            ].map((item, i) => (
              <div key={i} className="flex gap-6 group">
                <span className="text-4xl font-black text-white/20 group-hover:text-brand-primary/50 transition-colors italic">{String(i+1).padStart(2, '0')}</span>
                <div className="space-y-1">
                  <h4 className="font-black text-white uppercase text-sm tracking-widest">{item.title}</h4>
                  <p className="text-white/60 leading-relaxed font-medium">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-black backdrop-blur-xl p-10 rounded-[3rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-sm space-y-8 relative overflow-hidden">
          <div className="flex items-center gap-4 text-brand-primary">
            <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-brand-primary/40">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-black uppercase tracking-tight text-white">Formação de Equipes</h3>
          </div>

          <div className="grid gap-8">
            {[
              { title: "1. Fila de Prioridade (Quem Joga)", desc: "O sistema seleciona 12 jogadores para cada partida seguindo esta ordem: 1º Maior tempo consecutivo no banco; 2º Menor número de partidas jogadas no dia; 3º Não ter jogado a última partida; 4º Ordem de chegada no ginásio." },
              { title: "2. Regra dos Levantadores", desc: "Cada jogo tem apenas 2 levantadores (um para cada time). Se houver mais levantadores na fila, eles esperam no banco para dar lugar a outros jogadores. Se faltar gente para completar os 12, os levantadores extras jogam em outras posições." },
              { title: "3. Distribuição de Equipes", desc: "Os jogadores são escolhidos por gênero e nível técnico (ELO). Primeiro, o sistema organiza os homens: o de maior ELO vai para o Time A, o segundo para o Time B, e assim por diante, alternando entre as equipes. Depois, o mesmo é feito com as mulheres, garantindo que os times fiquem equilibrados." },
              { title: "4. Refinamento de Equilíbrio (Trocas)", desc: "Após a distribuição inicial, o sistema realiza trocas (swaps) entre jogadores do mesmo gênero. A troca só é efetivada se a diferença total de ELO entre os times diminuir, buscando o máximo equilíbrio técnico." },
              { title: "5. Posicionamento Estratégico", desc: "O Levantador oficial é fixado na Posição 3 (meio de rede). Os demais jogadores são distribuídos nas posições 4, 2, 5, 6 e 1, ordenados por ELO, garantindo uma distribuição técnica equilibrada entre rede e defesa." }
            ].map((item, i) => (
              <div key={i} className="flex gap-6 group">
                <span className="text-4xl font-black text-white/20 group-hover:text-brand-primary/50 transition-colors italic">{String(i+3).padStart(2, '0')}</span>
                <div className="space-y-1">
                  <h4 className="font-black text-white uppercase text-sm tracking-widest">{item.title}</h4>
                  <p className="text-white/60 leading-relaxed font-medium">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-black backdrop-blur-xl p-10 rounded-[3rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-sm space-y-8 relative overflow-hidden">
          <div className="flex items-center gap-4 text-brand-primary">
            <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-brand-primary/40">
              <Trophy className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-black uppercase tracking-tight text-white">Sistema de Pontuação e ELO</h3>
          </div>

          <div className="grid gap-8">
            {[
              { title: "Cálculo de Pontos (ELO)", desc: "Você ganha ou perde pontos dependendo da força dos times. Ganhar de um time forte dá mais pontos. Perder para um time mais fraco tira mais pontos." },
              { title: "Duração dos Jogos", desc: "Os sets são disputados até 15 pontos e não têm tempo limite para acabar. O sistema marca a duração de cada jogo para identificar o jogador mais eficiente (aquele que vence suas partidas em menos tempo)." },
              { title: "Bônus de Vitórias", desc: "A cada vitória consecutiva no dia, você recebe um bônus progressivo: +2 pontos na 2ª vitória, +4 na 3ª, +6 na 4ª e +8 da 5ª em diante. O bônus é resetado em caso de derrota ou ao fim da sessão." }
            ].map((item, i) => (
              <div key={i} className="flex gap-6 group">
                <span className="text-4xl font-black text-white/20 group-hover:text-brand-primary/50 transition-colors italic">{String(i+8).padStart(2, '0')}</span>
                <div className="space-y-1">
                  <h4 className="font-black text-white uppercase text-sm tracking-widest">{item.title}</h4>
                  <p className="text-white/60 leading-relaxed font-medium">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-black backdrop-blur-xl p-10 rounded-[3rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-sm space-y-8 relative overflow-hidden">
          <div className="flex items-center gap-4 text-brand-primary">
            <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-brand-primary/40">
              <Target className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-black uppercase tracking-tight text-white">Níveis de Sócio (Tiers)</h3>
          </div>

          <div className="grid gap-4">
            <p className="text-white/40 text-xs font-black uppercase tracking-widest mb-4">Seu nível é definido pelo ELO, volume de jogo e aproveitamento:</p>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { label: "Novato", color: "text-white/40", criteria: "Menos de 5 partidas jogadas" },
                { label: "Bronze", color: "text-orange-500", criteria: "ELO abaixo de 1150" },
                { label: "Prata", color: "text-slate-300", criteria: "ELO entre 1150 e 1250" },
                { label: "Ouro", color: "text-yellow-500", criteria: "ELO entre 1250 e 1400" },
                { label: "Elite", color: "text-brand-primary", criteria: "ELO entre 1400 e 1600" },
                { label: "Lenda", color: "text-purple-400", criteria: "ELO entre 1600 e 1800" },
                { label: "Mestre Supremo", color: "text-red-500", criteria: "ELO acima de 1800" }
              ].map((tier, i) => (
                <div key={i} className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center justify-between group hover:border-brand-primary/20 transition-all">
                  <div className="space-y-1">
                    <h4 className={`text-sm font-black uppercase tracking-tight ${tier.color}`}>{tier.label}</h4>
                    <p className="text-[10px] font-bold text-white/40 uppercase">{tier.criteria}</p>
                  </div>
                  <Target className={`w-5 h-5 opacity-20 group-hover:opacity-100 transition-opacity ${tier.color}`} />
                </div>
              ))}
            </div>
            <div className="mt-6 p-6 bg-brand-primary/5 rounded-[2rem] border border-brand-primary/20">
              <p className="text-xs text-brand-primary font-bold leading-relaxed">
                <span className="font-black uppercase tracking-wide">Refinamento:</span> Sócios Prata, Ouro e Elite podem receber o sufixo <span className="text-white">"Top"</span>, <span className="text-white">"Pro"</span> ou <span className="text-white">"Star"</span> se mantiverem um aproveitamento (Win Rate) acima da média do grupo e alta consistência.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-black backdrop-blur-xl p-10 rounded-[3rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-sm space-y-8 relative overflow-hidden">
          <div className="flex items-center gap-4 text-brand-primary">
            <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-brand-primary/40">
              <CreditCard className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-black uppercase tracking-tight text-white">Gestão Financeira</h3>
          </div>

          <div className="grid gap-8">
            {[
              { title: "Pagamento", desc: "A mensalidade vence todo dia 05. Pagar em dia garante que você continue 'Ativo' e possa usar todas as funções do aplicativo." }
            ].map((item, i) => (
              <div key={i} className="flex gap-6 group">
                <span className="text-4xl font-black text-white/20 group-hover:text-brand-primary/50 transition-colors italic">{String(i+11).padStart(2, '0')}</span>
                <div className="space-y-1">
                  <h4 className="font-black text-white uppercase text-sm tracking-widest">{item.title}</h4>
                  <p className="text-white/60 leading-relaxed font-medium">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-black backdrop-blur-xl p-10 rounded-[3rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-sm space-y-8 relative overflow-hidden">
          <div className="flex items-center gap-4 text-brand-primary">
            <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-brand-primary/40">
              <Dribbble className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-black uppercase tracking-tight text-white">Uso da Quadra e Equipamentos</h3>
          </div>

          <div className="grid gap-8">
            {[
              { title: "Aquecimento e Prevenção", desc: "Sugerimos que todos façam alongamentos e exercícios de aquecimento antes de jogar para evitar lesões. Não é permitido o aquecimento com bola na quadra para não atrasar o início das partidas." },
              { title: "Cuidado com as Bolas", desc: "As bolas de jogo são exclusivas para uso em quadra. É proibido chutar as bolas ou utilizá-las em superfícies abrasivas fora da área de jogo." }
            ].map((item, i) => (
              <div key={i} className="flex gap-6 group">
                <span className="text-4xl font-black text-white/20 group-hover:text-brand-primary/50 transition-colors italic">{String(i+12).padStart(2, '0')}</span>
                <div className="space-y-1">
                  <h4 className="font-black text-white uppercase text-sm tracking-widest">{item.title}</h4>
                  <p className="text-white/60 leading-relaxed font-medium">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-black backdrop-blur-xl p-10 rounded-[3rem] border border-white/5 border-l-[8px] border-l-brand-primary shadow-sm space-y-8 relative overflow-hidden">
          <div className="flex items-center gap-4 text-brand-primary">
            <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-brand-primary/40">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-black uppercase tracking-tight text-white">Uso Consciente do App</h3>
          </div>

          <div className="grid gap-8">
            {[
              { title: "Responsabilidade Coletiva", desc: "Este aplicativo foi desenvolvido para facilitar a organização e promover a integração do grupo. Use-o com responsabilidade: respeite a fila de presença, aceite as convocações do sistema e utilize as ferramentas de feedback de forma construtiva. O objetivo principal é sempre a diversão e o fair play." }
            ].map((item, i) => (
              <div key={i} className="flex gap-6 group">
                <span className="text-4xl font-black text-white/20 group-hover:text-brand-primary/50 transition-colors italic">{String(i+14).padStart(2, '0')}</span>
                <div className="space-y-1">
                  <h4 className="font-black text-white uppercase text-sm tracking-widest">{item.title}</h4>
                  <p className="text-white/60 leading-relaxed font-medium">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="grid md:grid-cols-2 gap-8">
          <section className="bg-black p-10 rounded-[3rem] border border-white/5 border-l-[8px] border-l-emerald-500 space-y-6">
            <div className="flex items-center gap-4 text-emerald-500">
              <CheckCircle2 className="w-8 h-8" />
              <h3 className="text-xl font-black uppercase tracking-tight">Conduta Esperada</h3>
            </div>
            <ul className="space-y-4">
              {[
                "Respeito absoluto às decisões do sistema de sorteio e arbitragem",
                "Fair play: acusar toques na rede e bolas fora",
                "Espírito esportivo: incentivar colegas de todos os níveis técnicos",
                "Zelo pelo material (bolas, antenas, rede) e limpeza da quadra",
                "Pontualidade rigorosa nos horários de início e trocas de set",
                "Uso obrigatório de vestimenta esportiva adequada (tênis de quadra)"
              ].map((text, i) => (
                <li key={i} className="flex items-start gap-3 text-emerald-100/80 font-bold text-sm">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                  {text}
                </li>
              ))}
            </ul>
          </section>

          <section className="bg-black p-10 rounded-[3rem] border border-white/5 border-l-[8px] border-l-rose-500 space-y-6">
            <div className="flex items-center gap-4 text-rose-500">
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
                <li key={i} className="flex items-start gap-3 text-rose-100/80 font-bold text-sm">
                  <div className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />
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
