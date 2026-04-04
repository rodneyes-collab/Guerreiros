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
        <div className="inline-flex p-4 bg-brand-light rounded-3xl text-brand-primary mb-2">
          <ShieldCheck className="w-10 h-10" />
        </div>
        <h2 className="text-5xl font-black text-brand-secondary uppercase tracking-tighter">Regras & Funcionamento</h2>
        <p className="text-brand-accent font-bold uppercase tracking-[0.2em] text-sm">Diretrizes Oficiais Guerreiros</p>
      </div>

      <div className="grid gap-8">
        <section className="bg-white p-10 rounded-[3rem] border border-brand-accent/20 shadow-sm space-y-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-[0.03]">
            <Scale className="w-40 h-40 text-brand-secondary" />
          </div>
          
          <div className="flex items-center gap-4 text-brand-primary">
            <div className="w-12 h-12 bg-brand-light rounded-2xl flex items-center justify-center">
              <Info className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-black uppercase tracking-tight text-brand-secondary">Dinâmica de Presença</h3>
          </div>

          <div className="grid gap-8">
            {[
              { title: "Abertura da Lista", desc: "A lista de presença é organizada pelo admin e será iniciada no momento que tenha pelo menos 12 jogadores que chegaram ou às 20:00." },
              { title: "Gestão de Fila de Espera", desc: "O sistema mantém uma fila dinâmica. Jogadores que chegam após o início da primeira partida entram no final da lista de espera, respeitando o rodízio de quem ainda não jogou." }
            ].map((item, i) => (
              <div key={i} className="flex gap-6 group">
                <span className="text-4xl font-black text-brand-light group-hover:text-brand-primary/10 transition-colors italic">{String(i+1).padStart(2, '0')}</span>
                <div className="space-y-1">
                  <h4 className="font-black text-brand-secondary uppercase text-sm tracking-widest">{item.title}</h4>
                  <p className="text-brand-accent leading-relaxed font-medium">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white p-10 rounded-[3rem] border border-brand-accent/20 shadow-sm space-y-8 relative overflow-hidden">
          <div className="flex items-center gap-4 text-brand-primary">
            <div className="w-12 h-12 bg-brand-light rounded-2xl flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-black uppercase tracking-tight text-brand-secondary">Formação de Equipes</h3>
          </div>

          <div className="grid gap-8">
            {[
              { title: "1. Fila de Prioridade (Quem Joga)", desc: "O sistema seleciona 12 jogadores para cada partida. A prioridade é definida nesta ordem: 1º Maior número de vezes consecutivas no banco; 2º Menor número de partidas jogadas no dia; 3º Não jogou a última partida; 4º Ordem de chegada no ginásio." },
              { title: "2. Regra dos Levantadores Oficiais", desc: "O sistema garante o limite de 2 levantadores oficiais por partida (1 por time). Se houver mais de 2, os excedentes vão para o banco, priorizando a entrada de não-levantadores. Exceção: Se faltar jogadores para completar os 12, os levantadores excedentes entram improvisados em outras posições." },
              { title: "3. Distribuição Inicial (Draft Guloso)", desc: "Os jogadores selecionados (excluindo os 2 levantadores) são separados por gênero e ordenados do maior ELO (nível técnico) para o menor. O sistema distribui os jogadores um a um, alocando-os no time que tiver a menor soma de ELO naquele momento, respeitando o limite de 6 jogadores por time." },
              { title: "4. Refinamento de Equilíbrio (Trocas)", desc: "Após a distribuição inicial, o sistema realiza trocas (swaps) entre jogadores do Time A e Time B. Uma troca só é permitida entre jogadores do mesmo gênero. A troca só é efetivada se a diferença total de ELO entre os dois times diminuir, buscando deixar a diferença o mais próxima possível de zero." },
              { title: "5. Posicionamento em Quadra", desc: "O Levantador oficial (ou o jogador de maior ELO improvisado como levantador) é fixado na Posição 3 (meio de rede). Os demais jogadores são distribuídos nas posições 4, 2, 5, 6 e 1, ordenados do maior ELO para o menor, garantindo a melhor distribuição de força na rede e na defesa." }
            ].map((item, i) => (
              <div key={i} className="flex gap-6 group">
                <span className="text-4xl font-black text-brand-light group-hover:text-brand-primary/10 transition-colors italic">{String(i+3).padStart(2, '0')}</span>
                <div className="space-y-1">
                  <h4 className="font-black text-brand-secondary uppercase text-sm tracking-widest">{item.title}</h4>
                  <p className="text-brand-accent leading-relaxed font-medium">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white p-10 rounded-[3rem] border border-brand-accent/20 shadow-sm space-y-8 relative overflow-hidden">
          <div className="flex items-center gap-4 text-brand-primary">
            <div className="w-12 h-12 bg-brand-light rounded-2xl flex items-center justify-center">
              <Trophy className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-black uppercase tracking-tight text-brand-secondary">Sistema de Pontuação e ELO</h3>
          </div>

          <div className="grid gap-8">
            {[
              { title: "Cálculo de Vitória/Derrota", desc: "O ganho ou perda de ELO é calculado com base na probabilidade de vitória. Vencer um time tecnicamente superior rende mais pontos do que vencer um time inferior." },
              { title: "Duração das Partidas", desc: "Sets oficiais são disputados até 15 pontos. Não há tempo limite para a duração dos sets." },
              { title: "Bônus de Performance", desc: "Vitórias consecutivas (streak) ativam um multiplicador de ELO, incentivando a consistência. O multiplicador reseta após a primeira derrota ou ao final da sessão diária." }
            ].map((item, i) => (
              <div key={i} className="flex gap-6 group">
                <span className="text-4xl font-black text-brand-light group-hover:text-brand-primary/10 transition-colors italic">{String(i+7).padStart(2, '0')}</span>
                <div className="space-y-1">
                  <h4 className="font-black text-brand-secondary uppercase text-sm tracking-widest">{item.title}</h4>
                  <p className="text-brand-accent leading-relaxed font-medium">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white p-10 rounded-[3rem] border border-brand-accent/20 shadow-sm space-y-8 relative overflow-hidden">
          <div className="flex items-center gap-4 text-brand-primary">
            <div className="w-12 h-12 bg-brand-light rounded-2xl flex items-center justify-center">
              <CreditCard className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-black uppercase tracking-tight text-brand-secondary">Gestão Financeira</h3>
          </div>

          <div className="grid gap-8">
            {[
              { title: "Vencimento da Mensalidade", desc: "As mensalidades vencem no dia 05 de cada mês. O pagamento em dia garante a manutenção do status 'Ativo' e acesso total às funcionalidades do aplicativo." },
              { title: "Taxa de Manutenção", desc: "Sócios que optarem pelo plano trimestral ou semestral possuem descontos progressivos. A taxa cobre aluguel da quadra, bolas novas a cada 3 meses e eventos do clube." }
            ].map((item, i) => (
              <div key={i} className="flex gap-6 group">
                <span className="text-4xl font-black text-brand-light group-hover:text-brand-primary/10 transition-colors italic">{String(i+10).padStart(2, '0')}</span>
                <div className="space-y-1">
                  <h4 className="font-black text-brand-secondary uppercase text-sm tracking-widest">{item.title}</h4>
                  <p className="text-brand-accent leading-relaxed font-medium">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white p-10 rounded-[3rem] border border-brand-accent/20 shadow-sm space-y-8 relative overflow-hidden">
          <div className="flex items-center gap-4 text-brand-primary">
            <div className="w-12 h-12 bg-brand-light rounded-2xl flex items-center justify-center">
              <Dribbble className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-black uppercase tracking-tight text-brand-secondary">Uso da Quadra e Equipamentos</h3>
          </div>

          <div className="grid gap-8">
            {[
              { title: "Aquecimento Prévio", desc: "O aquecimento com bola deve ser feito nas áreas laterais para não atrasar o início dos sets em quadra. O tempo de rede para aquecimento oficial é de apenas 5 minutos." },
              { title: "Cuidado com as Bolas", desc: "As bolas de jogo são exclusivas para uso em quadra. É proibido chutar as bolas ou utilizá-las em superfícies abrasivas fora da área de jogo." }
            ].map((item, i) => (
              <div key={i} className="flex gap-6 group">
                <span className="text-4xl font-black text-brand-light group-hover:text-brand-primary/10 transition-colors italic">{String(i+12).padStart(2, '0')}</span>
                <div className="space-y-1">
                  <h4 className="font-black text-brand-secondary uppercase text-sm tracking-widest">{item.title}</h4>
                  <p className="text-brand-accent leading-relaxed font-medium">{item.desc}</p>
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
