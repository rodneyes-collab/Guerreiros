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
            <Trophy className="w-40 h-40 text-white" />
          </div>
          
          <div className="flex items-center gap-4 text-brand-primary">
            <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-brand-primary/40">
              <Trophy className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-black uppercase tracking-tight text-white">O Coração do App: O Sistema ELO</h3>
          </div>

          <div className="grid gap-8">
            {[
              { 
                title: "O que é o Ponto ELO?", 
                desc: "Inspirado no sistema de Xadrez e Rankings Profissionais (como o da ATP ou Valorant), o ELO é uma pontuação numérica que representa sua 'Força de Jogo'. É a métrica base do aplicativo: antes de qualquer sorteio, o sistema precisa saber o nível de cada jogador para garantir que ninguém fique em um time 'café com leite' ou injustamente forte. Todos começam com 1200 pontos." 
              },
              { 
                title: "Como ele sobe ou desce?", 
                desc: "O sistema calcula a probabilidade de vitória com base no equilíbrio dos dois times. Vitórias padrão somam cerca de 25 pontos, e derrotas retiram cerca de 20. Além disso, existe o BÔNUS DE PLACAR: vitórias dominantes (ex: 15x05) rendem bônus extras de ELO, enquanto derrotas apertadas (ex: 15x14) minimizam a perda de pontos." 
              },
              { 
                title: "ELO Global vs. Eficiência Técnica", 
                desc: "O ELO GLOBAL é sua carreira de longo prazo. A EFICIÊNCIA TÉCNICA é a métrica 'real' usada no sorteio: ela soma sua Consistência Técnica + Habilidades Práticas (Ataque, Defesa, etc.) + Bônus de Impacto. Isso garante que o sorteio seja puramente baseado na qualidade técnica atual." 
              },
              { 
                title: "Formação do Ranking", 
                desc: "O ranking de sócios é atualizado após cada partida. Ele combina sua pontuação ELO, sua porcentagem de vitórias e seu desempenho no dia (MVP). Estar no topo significa ser o jogador mais consistente e decisivo do clube." 
              },
              {
                title: "Fidelidade e Presença",
                desc: "A cada sessão em que o sócio estiver presente (registrar pelo menos uma partida no dia), ele recebe um bônus imediato e retroativo de +50 pontos ELO, que são somados na construção do ranking de toda a sua história no clube."
              }
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
              { title: "Fila de Espera", desc: "Quem chegar depois do início do primeiro jogo entra no fim da fila. O sistema sempre prioriza quem ainda não jogou no dia para entrar na próxima partida." }
            ].map((item, i) => (
              <div key={i} className="flex gap-6 group">
                <span className="text-4xl font-black text-white/20 group-hover:text-brand-primary/50 transition-colors italic">{String(i+5).padStart(2, '0')}</span>
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
              { title: "1. Fila de Prioridade (Quem Joga)", desc: "O sistema seleciona 12 jogadores seguidores estes critérios: 1º Prioridade absoluta para quem NÃO participou do jogo anterior; 2º Jogadores com menor número de partidas no dia; 3º Ordem na fila de espera." },
              { title: "2. Regra dos Levantadores", desc: "Cada jogo deve ter 2 levantadores oficiais (um por time). Se houver apenas um levantador disponível nos 12 selecionados, o sistema o fixa em um time e equilibra o outro com o jogador de maior 'Poder Técnico' disponível." },
              { title: "3. Distribuição Snake (ABBA)", desc: "Os jogadores são ordenados pelo Elo e distribuídos no padrão A-BB-AA: O mais forte de todos vai para o Time A, o 2º e 3º para o Time B, o 4º e 5º para o Time A, e assim por diante. Isso garante que a 'elite' do dia seja dividida entre os dois lados." },
              { title: "4. Separação e Equilíbrio de Gênero", desc: "Antes do sorteio, o sistema separa homens e mulheres em grupos distintos. Ele distribui primeiro os homens usando o padrão Snake e depois as mulheres, garantindo que se houver 4 mulheres, cada time tenha exatamente 2, mantendo a paridade absoluta." },
              { title: "5. Otimização Multi-Camadas", desc: "Após a distribuição inicial, o sistema simula milhares de trocas para minimizar diferenças em: 1º Elo Total; 2º Destaques (Top 4); 3º Base (os 4 menos experientes); 4º Simetria Técnica entre as equipes." },
              { title: "6. Eficiência Técnica e Habilidades", desc: "O balanceamento usa a 'Eficiência Técnica', que dá um peso muito maior às suas habilidades práticas (Ataque, Saque, etc.) e consistência (TrueSkill), garantindo que o sorteio seja justo e puramente técnico." },
              { title: "7. Registro de Placar e Bônus", desc: "As partidas são disputadas até 15 pontos. Vitórias dominantes (ex: 15x05) rendem bônus extras de ELO, enquanto derrotas por 14 pontos minimizam a perda de pontos, reconhecendo o alto nível de competitividade." }
            ].map((item, i) => (
              <div key={i} className="flex gap-6 group">
                <span className="text-4xl font-black text-white/20 group-hover:text-brand-primary/50 transition-colors italic">{String(i+7).padStart(2, '0')}</span>
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
            <h3 className="text-2xl font-black uppercase tracking-tight text-white">Patentes e Tiers (Seu Nível no Clube)</h3>
          </div>

          <div className="grid gap-4">
            <p className="text-white/40 text-xs font-black uppercase tracking-widest mb-4">Sua 'Patente' reflete sua evolução técnica e competitiva:</p>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { label: "Novato", color: "text-white/40", criteria: "Aqueles que ainda estão se integrando ao grupo." },
                { label: "Bronze", color: "text-orange-500", criteria: "Jogadores em fase de evolução e aprendizado técnico." },
                { label: "Prata", color: "text-slate-300", criteria: "O coração do clube: jogadores consistentes com bons fundamentos." },
                { label: "Ouro", color: "text-yellow-500", criteria: "Jogadores com alto impacto técnico e tático nas partidas." },
                { label: "Elite", color: "text-brand-primary", criteria: "O topo da cadeia: jogadores que definem o ritmo do jogo." },
                { label: "Lenda", color: "text-purple-400", criteria: "Reservado para quem mantém ELO altíssimo por longos períodos." },
                { label: "Mestre Supremo", color: "text-red-500", criteria: "O nível máximo de habilidade e liderança em quadra." }
              ].map((tier, i) => (
                <div key={i} className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center justify-between group hover:border-brand-primary/20 transition-all">
                  <div className="space-y-1">
                    <h4 className={`text-sm font-black uppercase tracking-tight ${tier.color}`}>{tier.label}</h4>
                    <p className="text-[10px] font-bold text-white/40 uppercase leading-tight">{tier.criteria}</p>
                  </div>
                  <Target className={`w-5 h-5 opacity-20 group-hover:opacity-100 transition-opacity ${tier.color}`} />
                </div>
              ))}
            </div>
            <div className="mt-6 p-6 bg-brand-primary/5 rounded-[2rem] border border-brand-primary/20">
              <p className="text-xs text-brand-primary font-bold leading-relaxed">
                <span className="font-black uppercase tracking-wide">Refinamento:</span> Sócios Prata, Ouro e Elite podem receber o sufixo <span className="text-white">"Top"</span>, <span className="text-white">"Pro"</span> ou <span className="text-white">"Star"</span> se mantiverem um aproveitamento (Vitórias) acima da média do grupo e alta consistência.
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
