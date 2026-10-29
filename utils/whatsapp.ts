import { Player } from '../types';
import { capitalizeName } from './helpers';

export const cleanPhoneNumber = (phone?: string): string => {
  let clean = (phone || '').replace(/\D/g, '');
  if (!clean) return '';
  if (clean.length === 10 || clean.length === 11) {
    clean = '55' + clean;
  }
  return clean;
};

export const getRiskWhatsAppLink = (p: Player, days: number): string => {
  const clean = cleanPhoneNumber(p.phone);
  if (!clean) return '';

  const msg = `Olá, *${p.name}*! Tudo bem? Sentimos sua falta nos últimos ${days} dias de jogos do Guerreiros 🏐 Sentimos falta do seu jogo e da resenha! Está tudo bem? Esperamos você de volta nos próximos jogos! 🔥`;
  return `https://api.whatsapp.com/send?phone=${clean}&text=${encodeURIComponent(msg)}`;
};

export const getAttendanceWhatsAppLink = (player: Player): string => {
  const clean = cleanPhoneNumber(player.phone);
  if (!clean) return '';

  const msg = `Olá, *${capitalizeName(player.name)}*! 🏐 Passando para lembrar de confirmar sua presença ou ausência para a próxima partida no Guerreiros App!\n\nConfirme em 5 segundos no link:\n${window.location.origin}/?public=true\n\nValeu!`;
  return `https://api.whatsapp.com/send?phone=${clean}&text=${encodeURIComponent(msg)}`;
};
