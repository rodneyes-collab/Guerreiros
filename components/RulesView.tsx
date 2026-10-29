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
  Dribbble,
  Sparkles,
  TrendingUp,
  Zap,
  Clock,
  Star,
  Award
} from 'lucide-react';

import { useStore } from '../store';

export const RulesView: React.FC = () => {
  const systemMetadata = useStore(state => state.systemMetadata);
  const dailyBonus = systemMetadata?.dailyAttendanceBonus ?? 20;
  const minMatches = systemMetadata?.minMatchesForDailyBonus ?? 2;

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
                title: "ELO Global vs. Rating Híbrido de Equilíbrio", 
                desc: "O ELO GLOBAL é sua pontuação acumulada de carreira, refletindo suas vitórias, derrotas e Bônus Diário de Presença. Já no SORTEIO DAS PARTIDAS, o sistema utiliza o RATING HÍBRIDO (Média Ponderada: 50% ELO Puro sem o bônus de presença + 50% Índice Composto de Habilidades Práticas e Win Rate). Isso garante que quem é assíduo ganha pontos no Ranking de Carreira sem inflar desproporcionalmente o nível técnico na montagem das equipes." 
              },
              { 
                title: "Formação do Ranking", 
                desc: "O ranking de sócios é atualizado após cada partida. Ele combina sua pontuação ELO, sua porcentagem de vitórias e seu desempenho no dia (MVP). Estar no topo significa ser o jogador mais consistente e decisivo do clube." 
              },
              {
                title: "Bônus Diário de Presença e Fidelidade",
                desc: `A cada dia de jogo em que o sócio disputar ${minMatches} ou mais partidas na sessão, ele recebe imediatamente um acréscimo de +${dailyBonus} pontos ELO na sua carreira. O bônus valoriza a assiduidade e o engajamento contínuo nas rodadas.`
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

            <div className="mt-8 p-6 bg-brand-primary/5 rounded-[2rem] border border-brand-primary/20 flex gap-4 items-start animate-in fade-in slide-in-from-top-2 duration-500">
              <div className="w-12 h-12 bg-brand-primary/10 rounded-2xl flex items-center justify-center border border-brand-primary/40 shrink-0">
                <Sparkles className="w-6 h-6 text-brand-primary animate-pulse" />
              </div>
              <div className="space-y-1">
                <h5 className="text-sm font-black uppercase tracking-wider text-brand-primary">🔥 Bônus Diário de Fidelidade (+{dailyBonus} pts)</h5>
                <p className="text-xs text-white/80 leading-relaxed font-bold">
                  Valorizamos a sua fidelidade em quadra! Ao disputar <span className="text-brand-primary font-black">{minMatches} ou mais partidas</span> em uma sessão, você ganha automaticamente um acréscimo de <span className="text-brand-primary font-black">+{dailyBonus} pontos ELO</span> de bônus de presença. Esse bônus é somado ao seu saldo de vitórias e derrotas para formar o seu ELO Global!
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CÁLCULO DO RANKING E DESEMPATES */}
        <section className="bg-black backdrop-blur-xl p-8 md:p-10 rounded-[3rem] border border-brand-primary/30 border-l-[8px] border-l-brand-primary shadow-2xl space-y-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/5 rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex items-center gap-4 text-brand-primary">
            <div className="w-12 h-12 bg-brand-primary/10 rounded-2xl flex items-center justify-center border border-brand-primary/40">
              <Info className="w-6 h-6 text-brand-primary" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-brand-primary">Guerreiros Intelligence</span>
              <h3 className="text-2xl font-black uppercase tracking-tight text-white">Como o Ranking e Desempates são Calculados?</h3>
            </div>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {/* Cartão 1: Vitórias e Derrotas */}
              <div className="bg-white/5 border border-white/5 p-4 rounded-2xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    <h5 className="text-[10px] font-black text-white uppercase tracking-widest">Saldo de Partidas (ELO)</h5>
                  </div>
                  <p className="text-xs text-white/60 leading-relaxed">
                    Sua performance em quadra define os pontos de partidas:
                  </p>
                  <ul className="text-xs text-white/50 space-y-1 mt-2 list-disc pl-4">
                    <li>Cada Vitória: <strong className="text-emerald-500 font-bold">+20 pontos</strong></li>
                    <li>Cada Derrota: <strong className="text-rose-500 font-bold">-20 pontos</strong></li>
                  </ul>
                </div>
                <div className="text-[9px] font-mono text-white/30 uppercase mt-4">Performance</div>
              </div>

              {/* Cartão 2: Bônus de Fidelidade */}
              <div className="bg-white/5 border border-white/5 p-4 rounded-2xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-4 h-4 text-brand-primary" />
                    <h5 className="text-[10px] font-black text-white uppercase tracking-widest">Bônus de Participação</h5>
                  </div>
                  <p className="text-xs text-white/60 leading-relaxed">
                    Atletas que disputam 2 ou mais partidas na sessão garantem o bônus:
                  </p>
                  <p className="text-sm font-black text-brand-primary uppercase mt-3">
                    +20 pontos de fidelidade
                  </p>
                </div>
                <div className="text-[9px] font-mono text-white/30 uppercase mt-4">Presença</div>
              </div>

              {/* Cartão 3: Fórmula */}
              <div className="bg-white/5 border border-white/5 p-4 rounded-2xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="w-4 h-4 text-brand-primary" />
                    <h5 className="text-[10px] font-black text-white uppercase tracking-widest">A Fórmula de Pontos</h5>
                  </div>
                  <p className="text-xs text-white/60 leading-relaxed">
                    A soma do ELO base (1200) + saldo de partidas + bônus:
                  </p>
                  <div className="bg-black/60 border border-white/5 p-2 rounded-xl mt-3 text-center font-mono text-xs text-brand-primary font-black">
                    ELO = 1200 + (V - D) * 20 + Bônus
                  </div>
                </div>
                <div className="text-[9px] font-mono text-white/30 uppercase mt-4">Fórmula Oficial</div>
              </div>

              {/* Cartão 4: Critério de Desempate (Soberano) */}
              <div className="bg-white/5 border border-brand-primary/30 p-4 rounded-2xl flex flex-col justify-between relative overflow-hidden">
                <div className="absolute top-0 right-0 w-12 h-12 bg-brand-primary/10 rounded-full blur-xl pointer-events-none" />
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-brand-primary" />
                    <h5 className="text-[10px] font-black text-brand-primary uppercase tracking-widest">Critério de Desempate</h5>
                  </div>
                  <p className="text-xs text-white/60 leading-relaxed">
                    Se dois jogadores empatarem em ELO, o critério de desempate absoluto é o:
                  </p>
                  <p className="text-xs font-black text-white uppercase mt-2">
                    Menor Tempo em Quadra
                  </p>
                  <p className="text-xs text-white/40 mt-1 leading-normal">
                    Quem precisou de menos minutos em quadra para atingir a mesma pontuação assume a posição superior no Ranking.
                  </p>
                </div>
                <div className="text-[9px] font-mono text-brand-primary uppercase mt-4">Desempate Soberano</div>
              </div>
            </div>

            {/* Seção Prática e Exemplos Clarificadores */}
            <div className="bg-white/5 border border-white/5 p-5 rounded-2xl space-y-4">
              <h5 className="text-xs font-black text-brand-primary uppercase tracking-wider">
                Caso Prático: Por que desempenhos diferentes geram pontuações diferentes?
              </h5>
              <p className="text-xs text-white/70 leading-relaxed">
                Como o bônus de presença (+50) é fixo para todos os participantes do dia, a pontuação final de cada jogador reflete diretamente seu aproveitamento real. Jogadores com aproveitamentos diferentes **não** devem empatar na pontuação de partidas:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="bg-black/40 border border-white/10 p-4 rounded-xl">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-black text-white uppercase">Beth (3 Vitórias, 3 Derrotas)</span>
                    <span className="text-xs font-black text-brand-primary font-mono">+50 pts</span>
                  </div>
                  <p className="text-xs text-white/50 leading-relaxed">
                    Beth jogou 6 partidas equilibradas. Suas vitórias e derrotas se anulam mutuamente no ELO das partidas:
                  </p>
                  <div className="text-xs font-mono text-white/40 mt-2 bg-black/40 p-2 rounded border border-white/5">
                    Partidas: (3 * 20) + (3 * -20) = 60 - 60 = 0 pts
                    <br />
                    Total: 0 (Partidas) + 50 (Bônus) = <strong className="text-brand-primary">50 pontos</strong>
                  </div>
                </div>

                <div className="bg-black/40 border border-white/10 p-4 rounded-xl">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-black text-white uppercase">Ana Maria (5 Vitórias, 1 Derrota)</span>
                    <span className="text-xs font-black text-brand-primary font-mono">+130 pts</span>
                  </div>
                  <p className="text-xs text-white/50 leading-relaxed">
                    Ana Maria teve grande eficiência, sofrendo apenas uma derrota no dia. Seu saldo líquido de partidas é altamente positivo:
                  </p>
                  <div className="text-xs font-mono text-white/40 mt-2 bg-black/40 p-2 rounded border border-white/5">
                    Partidas: (5 * 20) + (1 * -20) = 100 - 20 = +80 pts
                    <br />
                    Total: 80 (Partidas) + 50 (Bônus) = <strong className="text-brand-primary">130 pontos</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SISTEMA OFICIAL DE MVP (SCORE B-1) */}
        <section className="bg-black backdrop-blur-xl p-8 md:p-10 rounded-[3rem] border border-brand-primary/30 border-l-[8px] border-l-brand-primary shadow-2xl space-y-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/5 rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex items-center gap-4 text-brand-primary">
            <div className="w-12 h-12 bg-brand-primary/10 rounded-2xl flex items-center justify-center border border-brand-primary/40">
              <Award className="w-6 h-6 text-brand-primary" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-brand-primary">Guerreiros Intelligence</span>
              <h3 className="text-2xl font-black uppercase tracking-tight text-white">O Título de MVP: Como Funciona o Score B-1?</h3>
            </div>
          </div>

          <div className="space-y-6">
            <p className="text-xs text-white/70 leading-relaxed">
              O título de <strong className="text-brand-primary uppercase">MVP (Most Valuable Player)</strong> coroa o atleta mais decisivo, consistente e de maior impacto positivo do clube — tanto na rodada diária quanto no acumulado de carreira. A fórmula oficial <strong className="text-white">Opção B-1</strong> combina rigor técnico com valorização da participação efetiva em quadra:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Pilar 1: Índice Composto */}
              <div className="bg-white/5 border border-white/5 p-4 rounded-2xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="w-4 h-4 text-brand-primary" />
                    <h5 className="text-[10px] font-black text-white uppercase tracking-widest">1. Desempenho Técnico (IC)</h5>
                  </div>
                  <p className="text-xs text-white/60 leading-relaxed">
                    Combina suas habilidades práticas com sua taxa real de vitórias no período:
                  </p>
                  <ul className="text-xs text-white/50 space-y-1 mt-2 list-disc pl-4">
                    <li><strong className="text-white">80%</strong> Habilidades Fundamentais (Ataque, Defesa, Levantamento e Saque)</li>
                    <li><strong className="text-white">20%</strong> Aproveitamento real de Vitórias (% WR)</li>
                  </ul>
                </div>
                <div className="text-[9px] font-mono text-brand-primary uppercase mt-4">Qualidade & Vitória</div>
              </div>

              {/* Pilar 2: Saldo Médio de Pontos */}
              <div className="bg-white/5 border border-white/5 p-4 rounded-2xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    <h5 className="text-[10px] font-black text-white uppercase tracking-widest">2. Domínio em Quadra</h5>
                  </div>
                  <p className="text-xs text-white/60 leading-relaxed">
                    Mede a autoridade das vitórias através do saldo de pontos por partida:
                  </p>
                  <div className="text-xs text-white/50 mt-2 space-y-1">
                    <p>Saldo Médio = (Pontos Pró - Contra) / Partidas</p>
                    <p className="text-emerald-400 font-bold">Multiplicador 1.5x sobre o saldo médio</p>
                  </div>
                </div>
                <div className="text-[9px] font-mono text-emerald-400 uppercase mt-4">Saldo de Pontos (1.5x)</div>
              </div>

              {/* Pilar 3: Bônus de Volume */}
              <div className="bg-white/5 border border-brand-primary/30 p-4 rounded-2xl flex flex-col justify-between relative overflow-hidden">
                <div className="absolute top-0 right-0 w-12 h-12 bg-brand-primary/10 rounded-full blur-xl pointer-events-none" />
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-4 h-4 text-brand-primary" />
                    <h5 className="text-[10px] font-black text-brand-primary uppercase tracking-widest">3. Volume & Assiduidade</h5>
                  </div>
                  <p className="text-xs text-white/60 leading-relaxed">
                    Premia quem assume responsabilidade e disputa múltiplos jogos:
                  </p>
                  <ul className="text-xs text-white/50 space-y-1 mt-2 list-disc pl-4">
                    <li><strong className="text-brand-primary font-bold">Na Rodada Diária:</strong> +2.0 pts por jogo disputado</li>
                    <li><strong className="text-brand-primary font-bold">Na Carreira:</strong> Escala até +15 pts (teto 45 jogos)</li>
                  </ul>
                </div>
                <div className="text-[9px] font-mono text-brand-primary uppercase mt-4">Compromisso em Quadra</div>
              </div>
            </div>

            {/* Caixa da Fórmula Oficial */}
            <div className="bg-white/5 border border-white/10 p-5 rounded-2xl space-y-3">
              <div className="flex items-center gap-2 text-brand-primary">
                <Star className="w-4 h-4" />
                <h5 className="text-xs font-black uppercase tracking-wider">A Fórmula do Score B-1</h5>
              </div>
              <div className="bg-black/70 border border-brand-primary/30 p-3 rounded-xl text-center font-mono text-xs text-brand-primary font-black tracking-wide">
                Score B-1 = [IC + (Saldo Médio * 1.5)] + Pilar Volume
              </div>
              <p className="text-xs text-white/60 leading-relaxed">
                Esta calibração impede que um sócio que jogou apenas 1 ou 2 partidas com 100% de vitória tire o MVP de atletas que sustentaram excelente rendimento ao longo de toda a rodada. No ranking, selecione o botão <strong className="text-white">"MVP (B-1)"</strong> para ordenar a lista completa por esta pontuação.
              </p>
            </div>
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
              { title: "Abertura da Lista", desc: "A lista de presença é aberta pelo administrador quando chegarem pelo menos 12 jogadores ou às 18:30 em ponto." },
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
              { title: "2. Regra dos Levantadores e Condições Mínimas", desc: "Para que as partidas sejam geradas, o grupo de 12 jogadores selecionados deve satisfazer uma das três composições: (a) 2 levantadores oficiais e 10 de linha; (b) 0 levantadores e 12 de linha; ou (c) 1 levantador oficial e 11 de linha. Nos casos (b) e (c), o sistema abrirá uma consulta perguntando se todos jogarão levantando em rodagem livre de levantamento, ou se o app escolherá levantadores temporários (fixando os de melhor habilidade para equilibrar)." },
              { title: "3. Distribuição Snake (ABBA)", desc: "Os jogadores são ordenados pelo Elo e distribuídos no padrão A-BB-AA: O mais forte de todos vai para o Time A, o 2º e 3º para o Time B, o 4º e 5º para o Time A, e assim por diante. Isso garante que a 'elite' do dia seja dividida entre os dois lados." },
              { title: "4. Separação e Equilíbrio de Gênero", desc: "Antes do sorteio, o sistema separa homens e mulheres em grupos distintos. Ele distribui primeiro os homens usando o padrão Snake e depois as mulheres, garantindo que se houver 4 mulheres, cada time tenha exatamente 2, mantendo a paridade absoluta." },
              { title: "5. Otimização Multi-Camadas", desc: "Após a distribuição inicial, o sistema simula milhares de trocas para minimizar diferenças em: 1º Elo Total; 2º Destaques (Top 4); 3º Base (os 4 menos experientes); 4º Simetria Técnica entre as equipes." },
              { title: "6. Rating Híbrido e Índice Composto (80/20)", desc: "O balanceamento prioriza a técnica através do Índice Composto soberano: 80% Habilidades Práticas de Ataque, Levantamento, Defesa e Saque + 20% Taxa Real de Vitória. Além disso, conta com a Trava Soberana de separação obrigatória do Top 2 e do Bottom 2 da linha entre as equipes (exatamente 1 de cada por time)." },
              { title: "7. Registro de Placar e Bônus", desc: "As partidas são disputadas até 15 pontos. Vitórias dominantes (ex: 15x05) rendem bônus extras de ELO, enquanto derrotas por 14 pontos minimizam a perda de pontos, reconhecendo o alto nível de competitividade." },
              { title: "8. Otimização de DNA Tático e Sinergia", desc: "A IA do aplicativo avalia o equilíbrio de 'assinatura tática' entre os times, garantindo que a força ofensiva (Ataque + Saque) e defensiva (Defesa + Levantamento) estejam distribuídas de forma paritária. Além disso, varre o histórico de partidas para dissolver duplas com alto atrito, atuando estritamente entre atletas intermediários sem jamais violar a separação obrigatória dos destaques (Top 2) e da base (Bottom 2)." }
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
