
/**
 * Padroniza uma string de data para o formato YYYY-MM-DD usado como chave no Firestore.
 * Suporta formatos como "DD/MM/YYYY" e já padronizados "YYYY-MM-DD".
 */
export const toStandardDateKey = (dateStr: string): string => {
  if (!dateStr) return '';
  
  // Se já estiver no formato YYYY-MM-DD
  if (dateStr.includes('-') && dateStr.split('-')[0].length === 4) {
    return dateStr;
  }
  
  // Se estiver no formato DD/MM/YYYY
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const [d, m, y] = parts;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }

  // Se estiver no formato YYYY/MM/DD (raro mas possível)
  if (dateStr.includes('/') && dateStr.split('/')[0].length === 4) {
    const [y, m, d] = dateStr.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  return dateStr;
};

// Cached Intl.DateTimeFormat instances to avoid performance hit of instantiating them during renders/loops
export const monthFormatterPtBR = new Intl.DateTimeFormat('pt-BR', { month: 'long' });
export const dateFormatterEnCA_SP = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});
export const dateFormatterPtBR_SP = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit'
});
