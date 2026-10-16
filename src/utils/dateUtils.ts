
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
