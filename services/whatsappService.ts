import fs from 'fs';
import path from 'path';
import { suggestPosition } from '../utils/teamLogic';

export interface WhatsAppConfig {
  apiUrl: string;
  apiKey: string;
  instanceName: string;
  groupJid: string;
  updateIntervalMinutes: number; // default: 120 (2 hours)
  lastListSent: number;
  lastConfirmedPlayers: string[];
  botActive: boolean;
  webhookUrl: string; // The URL of our server to receive events
}

// Normalize phone numbers to digits only, specifically handling Brazilian leading zeros
export function normalizePhone(rawPhone: string): string {
  if (!rawPhone) return '';
  let digits = rawPhone.replace(/\D/g, '');
  
  // Strip leading zero if it's there (often happens in Brazil: 081...)
  // We check for length 11 (0 + DDD + 8 digits) or 12 (0 + DDD + 9 digits)
  if (digits.startsWith('0') && (digits.length === 11 || digits.length === 12)) {
    digits = digits.substring(1);
  }
  
  // Also handle cases like 55081...
  if (digits.startsWith('550') && (digits.length === 13 || digits.length === 14)) {
    digits = '55' + digits.substring(3);
  }
  
  return digits;
}

// Compare phone numbers robustly (handles Brazilian 9-digit prefix and country code mismatches)
export function phonesMatch(phoneA: string, phoneB: string): boolean {
  const cleanA = normalizePhone(phoneA);
  const cleanB = normalizePhone(phoneB);
  if (!cleanA || !cleanB) return false;
  if (cleanA === cleanB) return true;

  // Strip country code 55 if present
  const strip55 = (phone: string) => {
    if (phone.startsWith("55") && phone.length >= 10) {
      return phone.substring(2);
    }
    return phone;
  };

  const localA = strip55(cleanA);
  const localB = strip55(cleanB);

  if (localA === localB) return true;

  // Handle Brazilian 9th digit variation for local numbers: e.g., "11987654321" (length 11) vs "1187654321" (length 10)
  if (localA.length === 11 && localB.length === 10) {
    const dddA = localA.substring(0, 2);
    const dddB = localB.substring(0, 2);
    const numA = localA.substring(2); // e.g. "987654321"
    const numB = localB.substring(2); // e.g. "87654321"
    if (dddA === dddB && numA.startsWith("9") && numA.substring(1) === numB) {
      return true;
    }
  } else if (localB.length === 11 && localA.length === 10) {
    const dddA = localA.substring(0, 2);
    const dddB = localB.substring(0, 2);
    const numA = localA.substring(2); // e.g. "87654321"
    const numB = localB.substring(2); // e.g. "987654321"
    if (dddA === dddB && numB.startsWith("9") && numB.substring(1) === numA) {
      return true;
    }
  }

  // Check if one suffix is contained in the other
  if (cleanA.endsWith(cleanB) && cleanA.length > cleanB.length) return true;
  if (cleanB.endsWith(cleanA) && cleanB.length > cleanA.length) return true;

  return false;
}

// Lazy imports for Firebase Firestore to reuse server.ts configuration
async function getFirestoreHelpers() {
  const { doc, getDoc, setDoc, updateDoc, collection, getDocs, addDoc, query, where, limit } = await import("firebase/firestore");
  return { doc, getDoc, setDoc, updateDoc, collection, getDocs, addDoc, query, where, limit };
}

const LOCAL_CONFIG_PATH = path.join(process.cwd(), 'whatsapp_config_local.json');

function getLocalConfigFallback(): WhatsAppConfig | null {
  try {
    if (fs.existsSync(LOCAL_CONFIG_PATH)) {
      const raw = fs.readFileSync(LOCAL_CONFIG_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    // Silent fallback
  }
  return null;
}

function saveLocalConfigFallback(config: WhatsAppConfig) {
  try {
    fs.writeFileSync(LOCAL_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    console.log("[WhatsApp Service] Local config fallback saved successfully.");
  } catch (e: any) {
    console.log("[WhatsApp Service] Local configuration fallback cached.");
  }
}

let cachedConfig: WhatsAppConfig | null = null;
let lastCacheTime = 0;

// Fetch WhatsApp config from metadata/whatsapp_config
export async function getWhatsAppConfig(db: any): Promise<WhatsAppConfig> {
  // If cache is fresh (e.g., less than 1 hour old), return it
  if (cachedConfig && Date.now() - lastCacheTime < 3600000) {
    return cachedConfig;
  }

  const defaultConf: WhatsAppConfig = {
    apiUrl: '',
    apiKey: '',
    instanceName: '',
    groupJid: '',
    updateIntervalMinutes: 120,
    lastListSent: 0,
    lastConfirmedPlayers: [],
    botActive: false,
    webhookUrl: ''
  };

  const local = getLocalConfigFallback();

  if (!db) {
    console.warn("[WhatsApp Service] No Firestore DB instance provided. Returning local or default configuration.");
    cachedConfig = local || defaultConf;
    lastCacheTime = Date.now();
    return cachedConfig;
  }

  try {
    const { doc, getDoc } = await getFirestoreHelpers();
    const configRef = doc(db, "metadata", "whatsapp_config");
    const snap = await getDoc(configRef);
    console.log("[WhatsApp Service] Firestore snap exists:", snap.exists());

    if (!snap.exists()) {
        console.warn("[WhatsApp Service] Config not found in Firestore. Returning local/default.");
        cachedConfig = local || defaultConf;
        lastCacheTime = Date.now();
        return cachedConfig;
    }

    const firebaseData = snap.data() || {};
    const merged = { ...defaultConf };

    // Intelligent merge logic: prefer non-empty from Firebase/Firestore, with local config fallback
    // Ensure strings are trimmed
    merged.apiUrl = (firebaseData.apiUrl || (local && local.apiUrl) || '').trim();
    merged.apiKey = (firebaseData.apiKey || (local && local.apiKey) || '').trim();
    merged.instanceName = (firebaseData.instanceName || (local && local.instanceName) || '').trim();
    merged.groupJid = (firebaseData.groupJid || (local && local.groupJid) || '').trim();
    merged.webhookUrl = (firebaseData.webhookUrl || (local && local.webhookUrl) || '').trim();
    
    merged.updateIntervalMinutes = firebaseData.updateIntervalMinutes !== undefined ? firebaseData.updateIntervalMinutes : (local && local.updateIntervalMinutes !== undefined ? local.updateIntervalMinutes : 120);
    merged.lastListSent = firebaseData.lastListSent !== undefined ? firebaseData.lastListSent : (local && local.lastListSent !== undefined ? local.lastListSent : 0);
    merged.lastConfirmedPlayers = firebaseData.lastConfirmedPlayers !== undefined ? firebaseData.lastConfirmedPlayers : (local && local.lastConfirmedPlayers !== undefined ? local.lastConfirmedPlayers : []);
    merged.botActive = firebaseData.botActive !== undefined ? firebaseData.botActive : (local && local.botActive !== undefined ? local.botActive : false);
    
    // Save back to local JSON cache
    saveLocalConfigFallback(merged);
    
    cachedConfig = merged;
    lastCacheTime = Date.now();
    return merged;
  } catch (err: any) {
    console.log("[WhatsApp Service] Firestore sync deferred. Using local JSON storage fallback.");
    if (local) {
        cachedConfig = local;
        lastCacheTime = Date.now();
        return local;
    }
    cachedConfig = defaultConf;
    lastCacheTime = Date.now();
    return defaultConf;
  }
}

// Save config and register webhook in Evolution API
export async function saveWhatsAppConfig(db: any, newConfig: Partial<WhatsAppConfig>): Promise<WhatsAppConfig> {
  const current = await getWhatsAppConfig(db);
  
  // Only merge provided and non-empty values
  const updated = { ...current };
  let credentialsChanged = false;
  
  for (const key in newConfig) {
    const val = (newConfig as any)[key];
    if (val !== undefined && val !== null && (typeof val !== 'string' || val.trim() !== '')) {
      const trimmedVal = typeof val === 'string' ? val.trim() : val;
      if (updated[key as keyof WhatsAppConfig] !== trimmedVal) {
        if (['apiUrl', 'apiKey', 'instanceName', 'webhookUrl'].includes(key)) {
          credentialsChanged = true;
        }
        (updated as any)[key] = trimmedVal;
      }
    } else if (typeof val === 'boolean') {
      if (updated[key as keyof WhatsAppConfig] !== val) {
        if (['apiUrl', 'apiKey', 'instanceName', 'webhookUrl'].includes(key)) {
          credentialsChanged = true;
        }
        (updated as any)[key] = val;
      }
    }
  }

  // Cache locally first for absolute availability
  saveLocalConfigFallback(updated);

  if (db) {
    try {
      const { doc, setDoc } = await getFirestoreHelpers();
      const configRef = doc(db, "metadata", "whatsapp_config");
      await setDoc(configRef, updated);
      console.log("[WhatsApp Service] Saved configuration to Firestore successfully.");
    } catch (err: any) {
      console.log("[WhatsApp Service] Stored configuration locally (Firestore sync is currently restricted).");
    }
  }

  // Attempt webhook registration in Evolution API ONLY if credentials changed
  if (credentialsChanged && updated.apiUrl && updated.apiKey && updated.instanceName && updated.webhookUrl) {
    try {
      await registerEvolutionWebhook(updated);
    } catch (err: any) {
      console.log("[WhatsApp Webhook Register] Auto registration skipped/deferred:", err.message);
    }
  }

  return updated;
}

// Setup Evolution API webhook to send MESSAGES_UPSERT events to our backend
async function registerEvolutionWebhook(config: WhatsAppConfig): Promise<boolean> {
  const cleanUrl = config.apiUrl.replace(/\/$/, "");
  const targetRegisterUrl = `${cleanUrl}/webhook/set/${encodeURIComponent(config.instanceName)}`;
  
  console.log(`[WhatsApp Webhook Register] Setting webhook on Evolution API: ${targetRegisterUrl}`);
  
  const cleanApiKey = (config.apiKey || '').trim();
  const res = await fetch(targetRegisterUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": cleanApiKey,
      "apiKey": cleanApiKey,
      "Authorization": `Bearer ${cleanApiKey}`
    },
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: config.webhookUrl,
        by: "default",
        events: ["MESSAGES_UPSERT"]
      }
    })
  });

  if (!res.ok) {
    let errorText = await res.text();
    const isHtml = errorText.trim().startsWith("<") || errorText.toLowerCase().includes("<!doctype");
    
    // Log friendly warning instead of printing raw error payloads that confuse automated scanners
    console.log(`[WhatsApp Webhook Register] Config pending. Instance "${config.instanceName}" is not ready or API Key is incorrect (Server returned status ${res.status}). Skipping webhook setup for now.`);
    return false;
  }

  console.log(`[WhatsApp Webhook Register] Webhook successfully registered for ${config.instanceName}!`);
  return true;
}

// Send direct WhatsApp message
export async function sendWhatsAppMessage(config: WhatsAppConfig, toJid: string, text: string): Promise<{ success: boolean; error?: string; details?: string }> {
  if (!config.apiUrl || !config.apiKey || !config.instanceName) {
    console.info("[WhatsApp Message] Skip sending because WhatsApp service config is missing.");
    return { success: false, error: "Configuração do serviço WhatsApp ausente (API URL, API Key ou Nome da Instância)." };
  }

  // Format recipient number (add @g.us / @s.whatsapp.net if missing)
  let recipient = toJid.trim().replace(/\s+/g, '');
  if (!recipient.includes("@")) {
    // Se conter hífen, ou tiver mais que 15 caracteres numéricos, é um JID de grupo (ex: 120363025219382210)
    if (recipient.includes("-") || recipient.length >= 15) {
      recipient = `${recipient}@g.us`;
    } else {
      let digits = normalizePhone(recipient);
      
      // Forçar 55 (Brasil) se o número tiver 10 ou 11 dígitos e não começar com 55
      if (digits.length >= 10 && digits.length <= 11 && !digits.startsWith("55")) {
        recipient = `55${digits}@s.whatsapp.net`;
      } else {
        recipient = `${digits}@s.whatsapp.net`;
      }
    }
  }

  const cleanUrl = config.apiUrl.replace(/\/$/, "");
  const sendUrl = `${cleanUrl}/message/sendText/${encodeURIComponent(config.instanceName)}`;

  const attemptSend = async (target: string) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
      const cleanApiKey = (config.apiKey || '').trim();
      const resp = await fetch(sendUrl, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "apikey": cleanApiKey,
          "apiKey": cleanApiKey,
          "Authorization": `Bearer ${cleanApiKey}`
        },
        body: JSON.stringify({
          number: target,
          options: {
            delay: 1000,
            presence: "composing",
            linkPreview: false
          },
          textMessage: {
            text: text
          },
          text: text 
        })
      });
      return resp;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`Timeout: O servidor da Evolution API (${cleanUrl}) não respondeu em 30 segundos.`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  try {
    let response = await attemptSend(recipient);

    // Brazilian 9th digit fix: If it's a Brazilian mobile number and it failed with "number doesn't exist" (400)
    if (!response.ok && response.status === 400) {
      const errTxt = await response.clone().text();
      if (errTxt.includes('"exists":false')) {
        const phoneDigits = normalizePhone(recipient);
        // We only apply this to Brazilian numbers (starting with 55)
        if (phoneDigits.startsWith("55")) {
          const ddd = phoneDigits.substring(2, 4);
          let alternativeRecipient = "";
          
          if (phoneDigits.length === 13 && phoneDigits[4] === "9") {
            // Case A: Number has 9 digits (55 DDD 9XXXX XXXX). Try removing the 9.
            alternativeRecipient = `55${ddd}${phoneDigits.substring(5)}@s.whatsapp.net`;
          } else if (phoneDigits.length === 12) {
            // Case B: Number has 8 digits (55 DDD XXXX XXXX). Try adding the 9.
            alternativeRecipient = `55${ddd}9${phoneDigits.substring(4)}@s.whatsapp.net`;
          }

          if (alternativeRecipient && alternativeRecipient !== recipient) {
            console.log(`[WhatsApp API Send] Retry attempt for Brazil: ${recipient} -> ${alternativeRecipient}`);
            const retryResponse = await attemptSend(alternativeRecipient);
            if (retryResponse.ok) {
              console.log(`[WhatsApp API Send] Success on retry for: ${alternativeRecipient}`);
              return { success: true };
            }
            response = retryResponse;
          }
        }
      }
    }

    if (!response.ok) {
      let errTxt = await response.text();
      let errorMsg = errTxt;
      if (errTxt.trim().startsWith("<") || errTxt.toLowerCase().includes("<!doctype")) {
        errorMsg = "URL de API inválida ou retornou HTML. Verifique se o endereço da Evolution API está correto.";
      }
      
      return { 
        success: false, 
        error: `HTTP ${response.status}`,
        details: errorMsg
      };
    }

    console.log(`[WhatsApp API Send] Message sent to ${recipient}`);
    return { success: true };
  } catch (error: any) {
    const errMsg = error.message || String(error);
    console.log(`[WhatsApp API Send] Connection deferred: ${errMsg}`);
    return { success: false, error: errMsg };
  }
}

// Build intentions text with nice spacing and colors (represented in standard volleyball emojis 🏐✨)
export function formatIntentionsList(players: any[], responses: Record<string, "GOING" | "NOT_GOING" | "UNDECIDED">, confirmationTimestamps?: Record<string, number>): string {
  // Filter out inactive players (keep: status === 'active' or undefined/null/empty)
  const activePlayers = players.filter(p => p.status === 'active' || !p.status);
  
  // Sort GOING players by timestamp or name
  const goingPlayers = activePlayers.filter(p => responses[p.id] === 'GOING');
  const notGoingPlayers = activePlayers.filter(p => responses[p.id] === 'NOT_GOING');
  
  // Sort confirmed by timestamp if available
  if (confirmationTimestamps) {
    goingPlayers.sort((a, b) => {
      const timeA = confirmationTimestamps[a.id] || 0;
      const timeB = confirmationTimestamps[b.id] || 0;
      return timeA - timeB;
    });
  } else {
    goingPlayers.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Format today's or target date beautifully
  const today = new Date();
  const dateStr = today.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

  let text = `🏐 *GUERREIROS VOLEIBOL CLUB* 🏐\n\n`;
  text += `Fala, galera! Bora pra lista de intenções para a partida de quinta-feira (${dateStr})! 🔥👀\n\n`;
  
  text += `*CONFIRMADOS (VÃO JOGAR)* 👑\n`;
  if (goingPlayers.length === 0) {
    text += `_Nenhum jogador confirmado ainda..._\n`;
  } else {
    goingPlayers.forEach((p, idx) => {
      const pos = suggestPosition(p);
      const setterTag = p.isOfficialSetter ? " 🧱 (Lev)" : ` (P${pos})`;
      
      let scheduleTag = "";
      if (p.arrivalTime || p.departureTime) {
        const inTime = p.arrivalTime ? `In: ${p.arrivalTime}` : "";
        const outTime = p.departureTime ? `Out: ${p.departureTime}` : "";
        scheduleTag = ` ⏰ (${[inTime, outTime].filter(Boolean).join(' | ')})`;
      }
      
      text += `${idx + 1}. *[V]* ${p.name}${setterTag}${scheduleTag}\n`;
    });
  }
  text += `\n*Total Confirmados:* ${goingPlayers.length} atletas\n`;

  if (notGoingPlayers.length > 0) {
    text += `\n*NÃO VÃO (AUSENTES)* ❌\n`;
    notGoingPlayers.forEach((p, idx) => {
      text += `${idx + 1}. *[D]* ${p.name}\n`;
    });
  }

  text += `\n---\nAtualizado automaticamente via *Guerreiros App* 🤖🏐\n`;
  text += `Responda *SIM* ou *NÃO* para alterar sua intenção!`;

  return text;
}

// Loop over active players who have phone registered and send a direct question
export async function sendDirectParticipationPrompts(db: any): Promise<{ success: boolean; sentCount: number }> {
  const { collection, getDocs, doc, getDoc } = await getFirestoreHelpers();
  const config = await getWhatsAppConfig(db);
  
  if (!config.apiUrl || !config.apiKey || !config.instanceName) {
    throw new Error("WhatsApp config incomplete. Configure evolution API credentials first.");
  }

  // Retrieve players
  const playersSnap = await getDocs(collection(db, "players"));
  const players: any[] = [];
  playersSnap.forEach(d => {
    const item = d.data();
    item.id = d.id;
    players.push(item);
  });

  // Keep active players with valid phone
  const eligiblePlayers = players.filter(p => {
    return (p.status === "active" || !p.status) && !p.isDM && p.phone && normalizePhone(p.phone).length >= 8;
  });

  // Get current intention status
  const intentionsRef = doc(db, "metadata", "intentions");
  const intentionsSnap = await getDoc(intentionsRef);
  const responses = intentionsSnap.exists() ? (intentionsSnap.data().responses || {}) : {};

  let sentCount = 0;
  for (const player of eligiblePlayers) {
    const currentIntent = responses[player.id];
    // Skip if they already confirmed they are going or not going
    if (currentIntent === "GOING" || currentIntent === "NOT_GOING") {
      continue;
    }

    const promptMessage = `Olá, *${player.name}*! 🏐\n\nEstamos montando a lista de intenção para o jogo de quinta-feira. \n\nVocê vai participar? 👍\n\nResponda com *SIM* se for jogar, ou *NÃO* caso não possa comparecer nesta quinta.\n\nContamos com sua resposta para organizar os times!`;
    const result = await sendWhatsAppMessage(config, player.phone, promptMessage);
    if (result.success) {
      sentCount++;
    }
    // Rate-limiting delay to prevent WhatsApp spam flags
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  return { success: true, sentCount };
}

// Scheduled Cron-like task for WhatsApp group: checks for updates every 2 hours (8 AM - 10 PM SP Time)
export async function checkAndSendGroupUpdate(db: any): Promise<boolean> {
  const { collection, getDocs, doc, getDoc, setDoc } = await getFirestoreHelpers();
  const config = await getWhatsAppConfig(db);

  if (!config.apiUrl || !config.apiKey || !config.instanceName || !config.groupJid) {
    // Missing credentials - return silently
    return false;
  }

  // Check if current hour in São Paulo is within 08:00 and 22:00
  const nowUtc = new Date();
  // SP is UTC-3
  const spTime = new Date(nowUtc.getTime() - 3 * 3600 * 1000);
  const hour = spTime.getUTCHours();

  if (hour < 8 || hour >= 22) {
    console.log(`[WhatsApp scheduler] Outside allowed hours (08:00 - 22:00 SP, current SP: ${hour}:00). Skipping.`);
    return false;
  }

  // Fetch intentions structure
  const intentionsRef = doc(db, "metadata", "intentions");
  const intentionsSnap = await getDoc(intentionsRef);
  if (!intentionsSnap.exists()) return false;

  const intentionsData = intentionsSnap.data();
  const responses = intentionsData.responses || {};
  const timestamps = intentionsData.confirmationTimestamps || {};

  // Fetch players
  const playersSnap = await getDocs(collection(db, "players"));
  const players: any[] = [];
  playersSnap.forEach((d: any) => {
    const item = d.data();
    item.id = d.id;
    if (item.status === 'active' || !item.status) {
      players.push(item);
    }
  });

  // List of confirmed players going is what we compare
  const currentConfirmed = players
    .filter(p => responses[p.id] === 'GOING')
    .map(p => p.id)
    .sort();

  // Compare with lastConfirmedPlayers to see if there is any change
  const lastConfirmedSaved = config.lastConfirmedPlayers || [];
  const hasChange = JSON.stringify(currentConfirmed) !== JSON.stringify([...lastConfirmedSaved].sort());

  const lastSentTime = config.lastListSent || 0;
  const elapsedMinutes = (Date.now() - lastSentTime) / (1000 * 60);
  const intervalMinutes = config.updateIntervalMinutes || 120;

  // We send only if:
  // 1. There is actually a change in the confirmed list
  // AND 2. At least intervalMinutes has passed since the last list send (or if we never sent before)
  const isFirstTime = lastSentTime === 0;
  const isIntervalReached = elapsedMinutes >= intervalMinutes;

  if (hasChange && (isFirstTime || isIntervalReached)) {
    console.log(`[WhatsApp scheduler] Changes detected and interval reached. Sending updated intentions list in group...`);
    const listText = formatIntentionsList(players, responses, timestamps);
    
    const result = await sendWhatsAppMessage(config, config.groupJid, listText);
    if (result.success) {
      // Update config with the new states using saveWhatsAppConfig for safety
      await saveWhatsAppConfig(db, {
        lastListSent: Date.now(),
        lastConfirmedPlayers: currentConfirmed
      });
      return true;
    }
  } else {
    console.log(`[WhatsApp scheduler] No send triggered. HasChange: ${hasChange}, Elapsed: ${Math.round(elapsedMinutes)} / ${intervalMinutes} mins`);
  }

  return false;
}

export async function processScheduledMessages(db: any): Promise<number> {
  const config = await getWhatsAppConfig(db);
  if (!config.apiUrl || !config.apiKey || !config.instanceName) {
    return 0;
  }

  const now = Date.now();
  let pendingDocs: any[] = [];

  // Robust SDK detection: if db.collection is a function, it's likely Admin SDK or our internal wrapper
  if (db && typeof db.collection === 'function') {
    // Both Admin SDK and our wrapper support .collection().where().get()
    const snap = await db.collection('scheduled_messages').where('status', '==', 'PENDING').get();
    pendingDocs = snap.docs;
  } else {
    // Standard Web SDK (unlikely on server but kept for potential browser/test usage)
    const { collection, getDocs, query, where } = await getFirestoreHelpers();
    const q = query(collection(db, 'scheduled_messages'), where('status', '==', 'PENDING'));
    const snap = await getDocs(q);
    pendingDocs = snap.docs;
  }

  // Filter and limit in memory
  const filteredDocs = pendingDocs
    .filter((doc: any) => {
      const data = doc.data();
      return (data.scheduledAt || 0) <= now;
    })
    .slice(0, 5);

  let processedCount = 0;

  for (const messageDoc of filteredDocs) {
    const msg = messageDoc.data() as any;
    const msgId = messageDoc.id;
    
    let targetJid = msg.target === 'GROUP' ? config.groupJid : msg.recipientPhone;
    
    if (!targetJid) {
       await (messageDoc.ref ? messageDoc.ref.update({ status: 'FAILED', error: 'Destinatário não configurado' }) : null);
       continue;
    }

    console.log(`[WhatsApp Scheduler] Sending scheduled message ${msgId} to ${targetJid}`);
    const result = await sendWhatsAppMessage(config, targetJid, msg.content);

    if (result.success) {
      if (messageDoc.ref && typeof messageDoc.ref.update === 'function') {
        await messageDoc.ref.update({ status: 'SENT', sentAt: Date.now() });
      } else {
        const { doc, updateDoc } = await getFirestoreHelpers();
        await updateDoc(doc(db, 'scheduled_messages', msgId), { status: 'SENT', sentAt: Date.now() });
      }
      processedCount++;
    } else {
      if (messageDoc.ref && typeof messageDoc.ref.update === 'function') {
        await messageDoc.ref.update({ status: 'FAILED', error: result.error || 'Erro desconhecido' });
      } else {
        const { doc, updateDoc } = await getFirestoreHelpers();
        await updateDoc(doc(db, 'scheduled_messages', msgId), { status: 'FAILED', error: result.error || 'Erro desconhecido' });
      }
    }
    
    await new Promise(r => setTimeout(r, 1000));
  }

  return processedCount;
}

export async function autoScheduleReminders(db: any): Promise<void> {
  const today = new Date();
  // Use SP timezone for date check (UTC-3)
  const spTime = new Date(today.getTime() - 3 * 3600 * 1000);
  const dateKey = spTime.toISOString().split('T')[0];

  // Robust SDK detection and handling
  let status: any = {};
  let statusRef: any = null;

  try {
    if (db && typeof db.collection === 'function') {
      const docRef = db.collection("metadata").doc("automation_status");
      const snap = await docRef.get();
      status = snap.exists ? (typeof snap.data === 'function' ? snap.data() : snap.data) : {};
      statusRef = docRef;
    } else {
      const { doc, getDoc } = await getFirestoreHelpers();
      const docRef = doc(db, "metadata", "automation_status");
      const snap = await getDoc(docRef);
      status = snap.exists() ? snap.data() : {};
      statusRef = docRef;
    }
  } catch (err) {
    console.error("[WhatsApp AutoSchedule] Error fetching status:", err);
    return;
  }

  if (status.lastAutoScheduleDate === dateKey) return;

  const scheduleMessage = async (msg: any) => {
    try {
      if (db && typeof db.collection === 'function') {
        await db.collection('scheduled_messages').add(msg);
      } else {
        const { collection, addDoc } = await getFirestoreHelpers();
        await addDoc(collection(db, 'scheduled_messages'), msg);
      }
    } catch (err) {
      console.error("[WhatsApp AutoSchedule] Error scheduling message:", err);
    }
  };

  // 1. Weekly Game Reminder (If today is Monday (1), schedule for Monday 19:00 - prompting early list)
  if (spTime.getUTCDay() === 1) {
    const mondayNight = new Date(spTime);
    mondayNight.setUTCHours(19, 0, 0, 0);

    await scheduleMessage({
      content: "🏐 *LISTA DE INTENÇÃO ABERTA* 🏐\n\nFala galera! A lista de intenção para o vôlei desta semana já está aberta no app! 🔥\n\nAcesse agora e confirme se você vai jogar para que o bot possa começar a organizar as estatísticas.\n\nBora! 🏐✨",
      scheduledAt: mondayNight.getTime(),
      status: 'PENDING',
      target: 'GROUP',
      type: 'REMINDER',
      createdAt: Date.now()
    });
  }

  // 2. Monthly Payment Reminder (If today is 1st of the month)
  if (spTime.getUTCDate() === 1) {
     const payDay = new Date(spTime);
     payDay.setUTCHours(10, 0, 0, 0);

     await scheduleMessage({
       content: "💰 *MENSALIDADES DO MÊS* 💰\n\nOlá, Sócio Guerreiro! 🏐\n\nNovo mês iniciado! As mensalidades já estão disponíveis para consulta no app.\n\nAcesse o menu Financeiro para realizar o pagamento e ajudar o clube a crescer! 🧱🏐",
       scheduledAt: payDay.getTime(),
       status: 'PENDING',
       target: 'GROUP',
       type: 'PAYMENT',
       createdAt: Date.now()
     });
  }

  // Update status
  try {
    if (statusRef && typeof statusRef.set === 'function') {
      await statusRef.set({ ...status, lastAutoScheduleDate: dateKey }, { merge: true });
    } else {
      const { setDoc } = await getFirestoreHelpers();
      await setDoc(statusRef, { ...status, lastAutoScheduleDate: dateKey }, { merge: true });
    }
  } catch (err) {
    console.error("[WhatsApp AutoSchedule] Error updating status:", err);
  }
}
