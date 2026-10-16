/**
 * Utilitário dedicado para Notificações Push nativas do Guerreiros Volleyball Club
 */

export interface IntentionPushPayload {
  playerName: string;
  positionNumber: number;
  totalConfirmed: number;
  isSelf: boolean;
}

export interface IntentionReminderPushPayload {
  period: 'morning' | 'afternoon';
  customMessage?: string;
  totalUndecided?: number;
}

export function getIntentionReminderText(period: 'morning' | 'afternoon') {
  if (period === 'morning') {
    return {
      title: '🏐 Bom dia, Guerreiro! Confirme sua Presença',
      body: 'A rodada de hoje está sendo montada! Confirme sua vaga ou ausência na lista de intenções até às 12h.'
    };
  }
  return {
    title: '⏰ Última Chamada: Rodada de Hoje!',
    body: 'Faltam poucas horas para o jogo. Confirme sua presença no app para entrar no sorteio dos times!'
  };
}

/**
 * Solicita permissão para exibição de notificações, caso ainda esteja em 'default'
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission === 'default') {
    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Dispara uma notificação push nativa para o atleta informando sua posição na lista de intenções
 */
export async function sendIntentionConfirmationPush(payload: IntentionPushPayload): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  const hasPermission = await ensureNotificationPermission();
  if (!hasPermission) {
    return false;
  }

  const { playerName, positionNumber, totalConfirmed, isSelf } = payload;
  const title = `🏐 Presença Confirmada! (#${positionNumber} na Lista)`;
  const plural = totalConfirmed === 1 ? 'atleta confirmado' : 'atletas confirmados';
  
  const body = isSelf
    ? `Sua vaga está garantida, ${playerName}! Posição #${positionNumber} na fila. A lista agora conta com ${totalConfirmed} ${plural}. Toque para ver todos.`
    : `${playerName} foi confirmado na posição #${positionNumber}! Total de ${totalConfirmed} ${plural}. Toque para abrir a lista.`;

  const options: any = {
    body,
    icon: '/logo.png',
    badge: '/logo.png',
    vibrate: [150, 80, 150],
    tag: `guerreiros-intention-${Date.now()}`,
    renotify: true,
    data: {
      url: '/?view=intentions',
      timestamp: Date.now()
    }
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(title, options);
        return true;
      }
    }

    // Fallback padrão para navegadores de desktop
    new Notification(title, options);
    return true;
  } catch (err) {
    console.warn('Não foi possível disparar a notificação push:', err);
    return false;
  }
}

/**
 * Dispara notificação push nativa de lembrete para atletas indecisos
 */
export async function sendIntentionReminderPush(payload: IntentionReminderPushPayload): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  const hasPermission = await ensureNotificationPermission();
  if (!hasPermission) {
    return false;
  }

  const template = getIntentionReminderText(payload.period);
  const title = template.title;
  const body = payload.customMessage || template.body;

  const options: any = {
    body,
    icon: '/logo.png',
    badge: '/logo.png',
    vibrate: [200, 100, 200],
    tag: `guerreiros-reminder-${payload.period}`,
    renotify: true,
    data: {
      url: '/?view=intentions',
      timestamp: Date.now()
    }
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(title, options);
        return true;
      }
    }

    new Notification(title, options);
    return true;
  } catch (err) {
    console.warn('Não foi possível disparar o lembrete push:', err);
    return false;
  }
}

