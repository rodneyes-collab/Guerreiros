export const monthNameFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long' });

export const brazilDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

export const brazilTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: 'numeric',
  hour12: false
});

export const brazilShortDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit'
});

export const brazilWeekdayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo',
  weekday: 'short'
});
