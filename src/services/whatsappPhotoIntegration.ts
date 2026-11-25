import { db, doc, getDoc, setDoc, deleteField } from '../../firebase';
import { Player } from '../../types';
import { useStore } from '../../store';

export interface WhatsAppPhotoBinding {
  phone: string;
  normalizedPhone: string;
  whatsappJid: string;
  photoUrl: string;
  playerId?: string;
  playerName?: string;
  source?: 'manual_upload' | 'whatsapp_webhook' | 'whatsapp_sync' | 'phone_link';
  updatedAt: number;
}

export type WhatsAppPhotoDirectory = Record<string, WhatsAppPhotoBinding>;

const LOCAL_DIR_STORAGE_KEY = 'guerreiros_whatsapp_photo_directory_v1';
const TARGET_MAX_DATA_URI_CHARS = 10500; // ~10 KB Data URI (~7.6 KB JPEG binário)

export function autoNormalizeBrazilianPhone(
  rawPhone?: string | null,
  verifiedWhatsAppDigits?: string | null
): string {
  // Se o WhatsApp já confirmou o número exato na rede, prioriza o formato real do WhatsApp
  if (verifiedWhatsAppDigits) {
    let vDigits = String(verifiedWhatsAppDigits).split('@')[0].replace(/\D/g, '');
    if (vDigits.length === 10 || vDigits.length === 11) vDigits = '55' + vDigits;
    if (vDigits.length >= 12 && vDigits.length <= 13) return vDigits;
  }

  if (!rawPhone) return '';
  let digits = String(rawPhone).split('@')[0].replace(/\D/g, '');
  if (!digits) return '';

  // Remove código de operadora (CSP) se vier no formato 0XX + DDD + número (ex: 0418199999999 -> 14 dígitos começando com 0)
  if (digits.length >= 13 && digits.startsWith('0')) {
    digits = digits.slice(3);
  }

  // Adiciona código do país (55) se vier apenas DDD + número (10 ou 11 dígitos)
  if (digits.length === 10 || digits.length === 11) {
    digits = '55' + digits;
  }

  // Se vier com 12 dígitos (55 + 2 DDD + 8 dígitos) e o primeiro dígito do número for celular (6, 7, 8 ou 9),
  // insere o 9º dígito padrão após o DDD para padronizar com o formato celular brasileiro (13 dígitos)
  if (digits.length === 12 && digits.startsWith('55')) {
    const ddd = digits.slice(2, 4);
    const local8 = digits.slice(4);
    if (/^[6-9]/.test(local8)) {
      digits = `55${ddd}9${local8}`;
    }
  }

  return digits;
}

export function normalizeBrazilDigits(rawPhone?: string | null): string {
  return autoNormalizeBrazilianPhone(rawPhone);
}

export function getPhoneLookupKeys(rawPhone?: string | null): string[] {
  const digits = normalizeBrazilDigits(rawPhone);
  if (digits.length < 8) return [];
  const keys = new Set<string>([digits]);
  if (digits.startsWith('55') && digits.length >= 12) {
    const without55 = digits.slice(2);
    keys.add(without55);
    // Variação com/sem o 9º dígito após o DDD
    if (digits.length === 13 && digits[4] === '9') {
      const no9 = digits.slice(0, 4) + digits.slice(5);
      keys.add(no9);
      keys.add(no9.slice(2));
    } else if (digits.length === 12) {
      const with9 = digits.slice(0, 4) + '9' + digits.slice(4);
      keys.add(with9);
      keys.add(with9.slice(2));
    }
  }
  keys.add(`last8_${digits.slice(-8)}`);
  return Array.from(keys);
}

export function isUsablePhotoUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim();
  if (!clean) return false;
  if (
    clean.includes('ui-avatars.com') ||
    clean.includes('dicebear.com') ||
    clean.includes('robohash.org') ||
    clean.includes('gravatar.com/avatar') ||
    clean.includes('pravatar.cc') ||
    clean.includes('picsum.photos') ||
    clean.includes('unsplash.com') ||
    clean.includes('data:image/svg+xml') ||
    clean.startsWith('/avatar')
  ) {
    return false;
  }
  // Links diretos do CDN temporário do WhatsApp expiram; aceitamos apenas Base64 ou URLs persistentes
  if (clean.includes('pps.whatsapp.net') || clean.includes('mmg.whatsapp.net')) {
    return false;
  }
  return true;
}

export function loadLocalWhatsAppPhotoDirectory(): WhatsAppPhotoDirectory {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(LOCAL_DIR_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    }
  } catch {}
  return {};
}

export function saveLocalWhatsAppPhotoDirectory(dir: WhatsAppPhotoDirectory): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(LOCAL_DIR_STORAGE_KEY, JSON.stringify(dir));
    }
  } catch {}
}

export function findPhotoBindingByPhone(
  phone?: string | null,
  directory?: WhatsAppPhotoDirectory
): WhatsAppPhotoBinding | null {
  const dir = directory || loadLocalWhatsAppPhotoDirectory();
  const keys = getPhoneLookupKeys(phone);
  for (const k of keys) {
    if (dir[k] && isUsablePhotoUrl(dir[k].photoUrl)) {
      return dir[k];
    }
  }
  return null;
}

export function resolveEffectivePlayerPhoto(
  player: Partial<Player> & { whatsappPhotoUrl?: string },
  directory?: WhatsAppPhotoDirectory
): string | undefined {
  if (!player) return undefined;
  // 1. Prioriza photoUrl oficial do sócio
  if (isUsablePhotoUrl(player.photoUrl)) {
    return player.photoUrl;
  }
  // 2. Fallback legado caso whatsappPhotoUrl ainda exista em memória antes da migração
  if (isUsablePhotoUrl(player.whatsappPhotoUrl)) {
    return player.whatsappPhotoUrl;
  }
  // 3. Consulta o diretório de integração pelo número de telefone do WhatsApp
  const byPhone = findPhotoBindingByPhone(player.phone, directory);
  if (byPhone && isUsablePhotoUrl(byPhone.photoUrl)) {
    return byPhone.photoUrl;
  }
  return player.photoUrl;
}

export function enrichPlayersWithWhatsAppPhotos(
  players: Player[],
  directory?: WhatsAppPhotoDirectory
): Player[] {
  const dir = directory || loadLocalWhatsAppPhotoDirectory();
  return (players || []).map((p) => {
    const resolved = resolveEffectivePlayerPhoto(p, dir);
    const hasLegacyDuplicate = 'whatsappPhotoUrl' in (p as any);
    if ((resolved && resolved !== p.photoUrl) || hasLegacyDuplicate) {
      const { whatsappPhotoUrl: _removedDuplicate, ...cleanPlayer } = p as any;
      return {
        ...cleanPlayer,
        photoUrl: resolved || cleanPlayer.photoUrl
      } as Player;
    }
    return p;
  });
}

export async function syncWhatsAppPhotoDirectory(): Promise<WhatsAppPhotoDirectory> {
  const merged: WhatsAppPhotoDirectory = { ...loadLocalWhatsAppPhotoDirectory() };

  // 1. Busca do backend (/api/whatsapp/photo-directory)
  try {
    const resp = await fetch('/api/whatsapp/photo-directory');
    if (resp.ok) {
      const json = await resp.json();
      if (json?.directory && typeof json.directory === 'object') {
        Object.entries(json.directory).forEach(([k, val]: [string, any]) => {
          if (val && isUsablePhotoUrl(val.photoUrl)) {
            if (!merged[k] || (val.updatedAt || 0) >= (merged[k].updatedAt || 0)) {
              merged[k] = val;
            }
          }
        });
      }
    }
  } catch {}

  // 2. Busca do Firestore (metadata/whatsapp_photo_directory)
  try {
    const snap = await getDoc(doc(db, 'metadata', 'whatsapp_photo_directory'));
    if (snap.exists()) {
      const data = snap.data() || {};
      const entries = data.entries && typeof data.entries === 'object' ? data.entries : data;
      Object.entries(entries).forEach(([k, val]: [string, any]) => {
        if (val && typeof val === 'object' && isUsablePhotoUrl(val.photoUrl)) {
          if (!merged[k] || (val.updatedAt || 0) >= (merged[k].updatedAt || 0)) {
            merged[k] = val;
          }
        }
      });
    }
  } catch {}

  // 3. Também indexa fotos válidas já presentes nos sócios da store pelo telefone deles
  const currentPlayers = useStore.getState().players || [];
  currentPlayers.forEach((p: any) => {
    const validPhoto = isUsablePhotoUrl(p.photoUrl)
      ? p.photoUrl
      : isUsablePhotoUrl(p.whatsappPhotoUrl)
      ? p.whatsappPhotoUrl
      : null;
    if (validPhoto && p.phone) {
      const digits = normalizeBrazilDigits(p.phone);
      const keys = getPhoneLookupKeys(p.phone);
      keys.forEach((k) => {
        if (!merged[k]) {
          merged[k] = {
            phone: p.phone,
            normalizedPhone: digits,
            whatsappJid: `${digits}@s.whatsapp.net`,
            photoUrl: validPhoto,
            playerId: p.id,
            playerName: p.name,
            source: 'whatsapp_sync',
            updatedAt: p.photoUpdatedAt || Date.now()
          };
        }
      });
    }
  });

  saveLocalWhatsAppPhotoDirectory(merged);
  return merged;
}

function encodeImageElementTo10KBDataUri(
  img: HTMLImageElement,
  initialMaxDimension = 160,
  targetMaxChars = TARGET_MAX_DATA_URI_CHARS
): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return img.src;

  const dimensionsToTry = [Math.min(initialMaxDimension, 160), 140, 120, 104];
  const qualitiesToTry = [0.72, 0.62, 0.52, 0.44, 0.36];
  let lastResult = '';

  for (const maxDim of dimensionsToTry) {
    let width = img.width || maxDim;
    let height = img.height || maxDim;
    if (width > height) {
      if (width > maxDim) {
        height = Math.max(1, Math.round((height * maxDim) / width));
        width = maxDim;
      }
    } else {
      if (height > maxDim) {
        width = Math.max(1, Math.round((width * maxDim) / height));
        height = maxDim;
      }
    }
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    for (const q of qualitiesToTry) {
      lastResult = canvas.toDataURL('image/jpeg', q);
      if (lastResult.length <= targetMaxChars) {
        return lastResult;
      }
    }
  }

  return lastResult;
}

export async function compressDataUriTo10KB(
  dataUri: string,
  maxDimension = 160,
  targetMaxChars = TARGET_MAX_DATA_URI_CHARS
): Promise<string> {
  if (!dataUri || !dataUri.startsWith('data:image/') || dataUri.length <= targetMaxChars) {
    return dataUri;
  }
  if (typeof document === 'undefined') return dataUri;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve(encodeImageElementTo10KBDataUri(img, maxDimension, targetMaxChars));
    };
    img.onerror = () => resolve(dataUri);
    img.src = dataUri;
  });
}

export async function compressImageFileToDataUri(
  file: File,
  maxDimension = 160,
  _quality = 0.72
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        resolve(encodeImageElementTo10KBDataUri(img, Math.min(maxDimension, 160), TARGET_MAX_DATA_URI_CHARS));
      };
      img.onerror = () => reject(new Error('Falha ao processar imagem.'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Falha ao ler arquivo de imagem.'));
    reader.readAsDataURL(file);
  });
}

export async function associatePhotoWithWhatsAppPhone(params: {
  playerId: string;
  playerName: string;
  phone: string;
  photoUrl?: string | null;
  source?: WhatsAppPhotoBinding['source'];
}): Promise<{
  success: boolean;
  photoUrl: string | null;
  normalizedPhone: string;
  directory: WhatsAppPhotoDirectory;
}> {
  const digits = normalizeBrazilDigits(params.phone);
  if (digits.length < 10) {
    throw new Error('Informe um número de WhatsApp válido com DDD (ex: 81 99999-9999).');
  }

  const now = Date.now();
  const dir = loadLocalWhatsAppPhotoDirectory();
  let finalPhoto = params.photoUrl && isUsablePhotoUrl(params.photoUrl) ? params.photoUrl : null;

  if (finalPhoto && finalPhoto.startsWith('data:image/') && finalPhoto.length > TARGET_MAX_DATA_URI_CHARS) {
    finalPhoto = await compressDataUriTo10KB(finalPhoto);
  }

  // Se o usuário informou apenas o número sem enviar novo arquivo, verifica se já existe foto indexada para esse telefone
  if (!finalPhoto) {
    const existingBinding = findPhotoBindingByPhone(digits, dir);
    if (existingBinding) {
      finalPhoto = existingBinding.photoUrl;
    }
  }

  // Envia para o backend (/api/whatsapp/photo-directory/associate) para registrar e tentar buscar via WhatsApp caso ainda não haja foto
  try {
    const resp = await fetch('/api/whatsapp/photo-directory/associate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: params.playerId,
        playerName: params.playerName,
        phone: digits,
        photoUrl: finalPhoto,
        source: params.source || 'manual_upload'
      })
    });
    if (resp.ok) {
      const json = await resp.json();
      if (json?.photoUrl && isUsablePhotoUrl(json.photoUrl)) {
        finalPhoto = json.photoUrl;
      }
      if (json?.directory && typeof json.directory === 'object') {
        Object.assign(dir, json.directory);
      }
    }
  } catch {}

  if (finalPhoto && finalPhoto.startsWith('data:image/') && finalPhoto.length > TARGET_MAX_DATA_URI_CHARS) {
    finalPhoto = await compressDataUriTo10KB(finalPhoto);
  }

  const keys = getPhoneLookupKeys(digits);
  if (finalPhoto) {
    const binding: WhatsAppPhotoBinding = {
      phone: digits,
      normalizedPhone: digits,
      whatsappJid: `${digits}@s.whatsapp.net`,
      photoUrl: finalPhoto,
      playerId: params.playerId,
      playerName: params.playerName,
      source: params.source || 'manual_upload',
      updatedAt: now
    };
    keys.forEach((k) => {
      dir[k] = binding;
    });
    saveLocalWhatsAppPhotoDirectory(dir);

    // Persiste o índice telefone -> foto no Firestore (metadata/whatsapp_photo_directory)
    const firestoreEntriesUpdate: Record<string, any> = {};
    keys.forEach((k) => {
      firestoreEntriesUpdate[k] = binding;
    });
    await setDoc(
      doc(db, 'metadata', 'whatsapp_photo_directory'),
      { entries: firestoreEntriesUpdate, updatedAt: now },
      { merge: true }
    ).catch(() => {});
  }

  // Atualiza o documento do sócio no Firestore (players/{id}) sem duplicar whatsappPhotoUrl
  const firestorePayload: Record<string, any> = {
    phone: digits,
    whatsappLinkedAt: now,
    whatsappPhotoUrl: deleteField()
  };
  if (finalPhoto) {
    firestorePayload.photoUrl = finalPhoto;
    firestorePayload.photoUpdatedAt = now;
  }

  if (params.playerId) {
    await setDoc(doc(db, 'players', params.playerId), firestorePayload, { merge: true }).catch(
      () => {}
    );

    const storePlayers = useStore.getState().players || [];
    const updatedPlayers = storePlayers.map((p) => {
      if (p.id !== params.playerId) return p;
      const { whatsappPhotoUrl: _removed, ...cleanPlayer } = p as any;
      return {
        ...cleanPlayer,
        phone: digits,
        whatsappLinkedAt: now,
        ...(finalPhoto ? { photoUrl: finalPhoto, photoUpdatedAt: now } : {})
      };
    });
    useStore.setState({ players: updatedPlayers });
  }

  return {
    success: true,
    photoUrl: finalPhoto,
    normalizedPhone: digits,
    directory: dir
  };
}
