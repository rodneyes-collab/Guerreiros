
/**
 * Padroniza uma string de data para o formato YYYY-MM-DD usado como chave no Firestore.
 * Suporta formatos como "DD/MM/YYYY", ISO "YYYY-MM-DDTHH:mm:ss.sssZ" e já padronizados "YYYY-MM-DD".
 */
export const toStandardDateKey = (dateStr: string): string => {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  const cleanStr = trimmed.split('T')[0].split(' ')[0];

  // Se já estiver no formato YYYY-MM-DD
  if (cleanStr.includes('-') && cleanStr.split('-')[0].length === 4) {
    return cleanStr;
  }

  // Se estiver no formato DD/MM/YYYY ou YYYY/MM/DD
  if (cleanStr.includes('/')) {
    const parts = cleanStr.split('/');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        const [y, m, d] = parts;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      } else {
        const [d, m, y] = parts;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }
  }

  return cleanStr;
};

