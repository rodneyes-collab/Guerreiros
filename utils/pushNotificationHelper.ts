/**
 * Utilitário de textos de lembrete (Push nativo desativado — substituído 100% pelo WhatsApp Bot)
 */

export interface IntentionPushPayload {
  playerName: string;
  positionNumber: number;
  totalConfirmed: number;
  isSelf: boolean;
}

export interface IntentionReminderPushPayload {
  period: 'morning' | 'afternoon' | 'wednesday';
  customMessage?: string;
  totalUndecided?: number;
}

export function getIntentionReminderText(period: 'morning' | 'afternoon' | 'wednesday', targetDateFormatted?: string) {
  if (period === 'wednesday') {
    return {
      title: '🏐 Amanhã tem Jogo! Confirme sua Presença',
      body: targetDateFormatted
        ? `Guerreiro(a), o jogo oficial é amanhã (${targetDateFormatted})! Confirme sua presença ou ausência na lista de intenções.`
        : 'Guerreiro(a), o jogo oficial é amanhã (quinta-feira)! Confirme sua presença ou ausência na lista de intenções.'
    };
  }
  if (period === 'morning') {
    return {
      title: '🏐 Bom dia, Guerreiro! Confirme sua Presença',
      body: 'A rodada de hoje está sendo montada! Confirme sua vaga ou ausência na lista de intenções até às 12h.'
    };
  }
  return {
    title: '⏰ Última Chamada: Rodada de Hoje!',
    body: 'Faltam poucas horas para o jogo. Confirme sua presença para entrar no sorteio dos times!'
  };
}

export async function ensureNotificationPermission(): Promise<boolean> {
  return false;
}

export async function sendIntentionConfirmationPush(_payload: IntentionPushPayload): Promise<boolean> {
  // Substituído pelo disparo automático no WhatsApp via /api/presence/set no servidor
  return false;
}

export async function sendIntentionReminderPush(_payload: IntentionReminderPushPayload): Promise<boolean> {
  // Substituído pelo disparo automático no WhatsApp via /api/whatsapp/remind-undecided
  return false;
}
