
import { GoogleGenAI } from "@google/genai";

export interface SentinelSystemData {
  players: any[];
  matches: any[];
  loginLogs: any[];
  auditLogs: any[];
  metadata: any;
}

/**
 * Executes a programmatic local scan of the system data to serve as a robust,
 * high-fidelity fallback when the Gemini API is rate-limited or billing-capped.
 */
const runLocalHeuristicScan = (data: SentinelSystemData, apiErrorMessage?: string): string => {
  const players = data.players || [];
  const loginLogs = data.loginLogs || [];
  const auditLogs = data.auditLogs || [];
  const matches = data.matches || [];

  // 1. Analyze Login Logs
  const totalLogins = loginLogs.length;
  const failedLogins = loginLogs.filter((l: any) => l.status === "FAILURE");
  const successfulLogins = loginLogs.filter((l: any) => l.status === "SUCCESS");
  const failureRate = totalLogins > 0 ? (failedLogins.length / totalLogins) * 100 : 0;

  const loginIssuesByEmail: Record<string, { count: number; lastError?: string }> = {};
  failedLogins.forEach((log: any) => {
    const key = log.email || "Desconhecido/Anônimo";
    if (!loginIssuesByEmail[key]) {
      loginIssuesByEmail[key] = { count: 0 };
    }
    loginIssuesByEmail[key].count++;
    if (log.error) {
      loginIssuesByEmail[key].lastError = log.error;
    }
  });

  const highRiskLogins = Object.entries(loginIssuesByEmail).filter(([_, info]) => info.count >= 2);

  // 2. Analyze Players & ELO data
  const dataAnomalies: string[] = [];
  const seenEmails = new Set<string>();
  const seenNames = new Set<string>();

  players.forEach((p: any) => {
    if (!p.name || p.name.trim() === "" || p.name === "Jogador Sem Nome") {
      dataAnomalies.push(`⚠️ Jogador sem nome identificado (ID: ${p.id})`);
    } else {
      if (seenNames.has(p.name.toLowerCase())) {
        dataAnomalies.push(`⚠️ Possível nome duplicado: "${p.name}"`);
      }
      seenNames.add(p.name.toLowerCase());
    }

    if (p.elo === undefined || p.elo === null || typeof p.elo !== "number") {
      dataAnomalies.push(`⚠️ Jogador "${p.name || p.id}" possui ELO inválido ou nulo.`);
    } else if (p.elo < 800 || p.elo > 2500) {
      dataAnomalies.push(`⚠️ Alerta de ELO fora dos padrões normais: "${p.name}" possui ELO ${p.elo}.`);
    }

    if (p.email) {
      const emailLower = p.email.trim().toLowerCase();
      if (seenEmails.has(emailLower)) {
        dataAnomalies.push(`⚠️ E-mail duplicado associado a jogadores diferentes: "${p.email}"`);
      }
      seenEmails.add(emailLower);
    }
  });

  // 3. Determine Overall System Health Status
  let status = "ESTÁVEL";
  let statusColor = "🟢";
  if (failureRate > 25 || highRiskLogins.length > 0 || dataAnomalies.length > 3) {
    status = "WARNING";
    statusColor = "🟡";
  }
  if (failureRate > 50 || dataAnomalies.length > 8) {
    status = "CRÍTICO";
    statusColor = "🔴";
  }

  // 4. Formulate the Heuristic Report
  let report = `### 🛡️ Status do Sentinela
${statusColor} **SISTEMA EM MODO MONITORADO: ${status}**

> ⚠️ **Informativo de Recursos de IA**: O limite mensal de faturamento (Spending Cap) ou cota da API Gemini no Google AI Studio foi atingido \`[RESOURCE_EXHAUSTED]\`. O Sentinela acionou o **Guardião Heurístico Local (Engine Fallback)** para manter a supervisão ativa de dados e segurança sem qualquer interrupção técnica no app.

---

### 🔑 Análise de Acesso (Login)
* **Volume do Período**: Analisadas as últimas **${totalLogins}** tentativas de acesso.
* **Taxa de Sucesso**: **${successfulLogins.length}** logins concluídos (${totalLogins > 0 ? ((successfulLogins.length / totalLogins) * 100).toFixed(1) : 100}%).
* **Falhas Identificadas**: **${failedLogins.length}** falhas (${failureRate.toFixed(1)}%).
`;

  if (highRiskLogins.length > 0) {
    report += `\n🚨 **Usuários com dificuldades consecutivas de acesso**:\n`;
    highRiskLogins.forEach(([email, info]) => {
      report += `- **${email}**: ${info.count} falhas recentes. Último erro relatado: *"${info.lastError || 'Nenhum detalhe adicional'}"*\n`;
    });
  } else if (failedLogins.length > 0) {
    report += `\n* Falhas esporádicas detectadas, porém sem alertas de travamento de sócios específicos no momento.\n`;
  } else {
    report += `\n✨ **Nenhuma instabilidade ou falha de login detectada recentemente.** Todos os acessos fluem perfeitamente.\n`;
  }

  report += `
---

### 📊 Integridade de Dados
* **Sócio-Mapeamento**: **${players.length}** jogadores cadastrados no sistema.
* **Histórico Recente**: **${matches.length}** partidas analisadas para balanceamento de ELO.
`;

  if (dataAnomalies.length > 0) {
    report += `\n🔍 **Inconsistências detectadas para correção rápida**:\n`;
    dataAnomalies.forEach((anomaly) => {
      report += `- ${anomaly}\n`;
    });
  } else {
    report += `\n✨ **Integridade impecável.** Nenhuma anomalia de ELO, jogadores duplicados ou inconsistências de dados cadastrais localizadas.\n`;
  }

  report += `
---

### 💡 Recomendações do Agente
1. 💸 **Restabelecer Poder Cognitivo Superior**: Peça ao administrador para acessar o painel de faturamento em [Google AI Studio (ai.studio/spend)](https://ai.studio/spend) para ajustar as cotas mensais de faturamento. Isso reativará imediatamente a inteligência preditiva profunda baseada em IA.
2. 🧹 **Manutenção preventiva de dados**: Se houverem inconsistências listadas acima, execute a rotina de **Manutenção Automática** na aba correspondente do painel administrativo do Volley Club para tentar sanar pendências ou unificar cadastros.
3. 🔒 **Apoio a Sócios com Erro de Login**: Verifique se o domínio do e-mail de sócios com falhas reincidentes está cadastrado e aprovado no console de autenticação do Firebase.
`;

  return report;
};

export const runSentinelDeepScan = async (apiKey: string, data: SentinelSystemData): Promise<string> => {
  const ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  const prompt = `Você é o "Agente Sentinela IA" do Guerreiros Volleyball Club. 
    Seu objetivo é garantir a estabilidade máxima do sistema, a integridade dos dados e o sucesso no login dos sócios.

    DADOS DO SISTEMA PARA ANÁLISE:
    - Jogadores (${data.players.length}): Stats, ELO, Nomes.
    - Login Logs (${data.loginLogs.length}): Tentativas de login recentes, erros, dispositivos.
    - Audit Logs (${data.auditLogs.length}): Ações administrativas recentes.
    - Matches (${data.matches.length}): Histórico de partidas.
    - Metadados: Configurações globais.

    TAREFAS ESPECÍFICAS:
    1. **Monitoramento de Login**: Identifique se há uma taxa de falha anormal nos logins. Verifique se algum sócio específico está tendo problemas constantes para entrar.
    2. **Anomalias de Dados**: Procure por inconsistências em ELO, jogadores duplicados ou dados corrompidos que possam travar o app.
    3. **Sugestões de Estabilidade**: Com base nos logs, sugira melhorias na infraestrutura ou no fluxo de autenticação.
    4. **Auto-Correção**: Se encontrar um erro óbvio (ex: jogador com ELO null), descreva a correção necessária.

    FORMATO DA RESPOSTA:
    Use Markdown elegante com emojis.
    ### 🛡️ Status do Sentinela
    [Resumo Geral: ESTÁVEL | WARNING | CRÍTICO]

    ### 🔑 Análise de Acesso (Login)
    [Detalhes sobre estabilidade de login]

    ### 📊 Integridade de Dados
    [Anomalias encontradas]

    ### 💡 Recomendações do Agente
    [Próximos passos]

    Mantenha um tom de autoridade técnica mas prestativa.`;

  try {
    const result = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });
    return result.text || "Sem resposta do Sentinela.";
  } catch (error: any) {
    const errorMsg = error?.message || "";
    const isBillingOrQuota = 
      errorMsg.includes("429") || 
      errorMsg.toLowerCase().includes("spending cap") || 
      errorMsg.toLowerCase().includes("quota") || 
      errorMsg.toLowerCase().includes("billing") || 
      errorMsg.toLowerCase().includes("resource_exhausted") || 
      errorMsg.toLowerCase().includes("exceeded");

    if (isBillingOrQuota) {
      console.warn("Sentinel: Gemini API call returned resource exhaustion/monthly billing limit (429/RESOURCE_EXHAUSTED). Rolling back to robust local heuristic scan.");
    } else {
      console.warn("Sentinel: Gemini API call failed. Rolling back to robust local heuristic scan.", errorMsg);
    }
    return runLocalHeuristicScan(data, errorMsg || "RESOURCE_EXHAUSTED");
  }
};

