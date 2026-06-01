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
  isSimulated?: boolean; // Se ativado, o bot opera em modo de simulação
  simulatedState?: "open" | "close" | "connecting"; // Status simulado da instância
}

// Normalize phone numbers to digits only
export function normalizePhone(rawPhone: string): string {
  if (!rawPhone) return '';
  return rawPhone.replace(/\D/g, '');
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
  const { doc, getDoc, setDoc, updateDoc, collection, getDocs, addDoc } = await import("firebase/firestore");
  return { doc, getDoc, setDoc, updateDoc, collection, getDocs, addDoc };
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

// Fetch WhatsApp config from metadata/whatsapp_config
export async function getWhatsAppConfig(db: any): Promise<WhatsAppConfig> {
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
    return local || defaultConf;
  }

  try {
    const { doc, getDoc } = await getFirestoreHelpers();
    const configRef = doc(db, "metadata", "whatsapp_config");
    const snap = await getDoc(configRef);
    console.log("[WhatsApp Service] Firestore snap exists:", snap.exists());

    if (!snap.exists()) {
        console.warn("[WhatsApp Service] Config not found in Firestore. Returning local/default.");
        return local || defaultConf;
    }

    const firebaseData = snap.data() || {};
    const merged = { ...defaultConf };

    // Intelligent merge logic: prefer non-empty from Firebase/Firestore, with local config fallback
    merged.apiUrl = firebaseData.apiUrl || (local && local.apiUrl) || '';
    merged.apiKey = firebaseData.apiKey || (local && local.apiKey) || '';
    merged.instanceName = firebaseData.instanceName || (local && local.instanceName) || '';
    merged.groupJid = firebaseData.groupJid || (local && local.groupJid) || '';
    merged.webhookUrl = firebaseData.webhookUrl || (local && local.webhookUrl) || '';
    
    merged.updateIntervalMinutes = firebaseData.updateIntervalMinutes !== undefined ? firebaseData.updateIntervalMinutes : (local && local.updateIntervalMinutes !== undefined ? local.updateIntervalMinutes : 120);
    merged.lastListSent = firebaseData.lastListSent !== undefined ? firebaseData.lastListSent : (local && local.lastListSent !== undefined ? local.lastListSent : 0);
    merged.lastConfirmedPlayers = firebaseData.lastConfirmedPlayers !== undefined ? firebaseData.lastConfirmedPlayers : (local && local.lastConfirmedPlayers !== undefined ? local.lastConfirmedPlayers : []);
    merged.botActive = firebaseData.botActive !== undefined ? firebaseData.botActive : (local && local.botActive !== undefined ? local.botActive : false);
    
    if (firebaseData.isSimulated !== undefined) {
      merged.isSimulated = firebaseData.isSimulated;
    } else if (local && local.isSimulated !== undefined) {
      merged.isSimulated = local.isSimulated;
    }
    
    if (firebaseData.simulatedState !== undefined) {
      merged.simulatedState = firebaseData.simulatedState;
    } else if (local && local.simulatedState !== undefined) {
      merged.simulatedState = local.simulatedState;
    }

    // Save back to local JSON cache
    saveLocalConfigFallback(merged);
    return merged;
  } catch (err: any) {
    console.log("[WhatsApp Service] Firestore sync deferred. Using local JSON storage fallback.");
    if (local) {
        return local;
    }
    return defaultConf;
  }
}

// Save config and register webhook in Evolution API
export async function saveWhatsAppConfig(db: any, newConfig: Partial<WhatsAppConfig>): Promise<WhatsAppConfig> {
  const current = await getWhatsAppConfig(db);
  
  // Only merge provided and non-empty values
  const updated = { ...current };
  
  for (const key in newConfig) {
    const val = (newConfig as any)[key];
    if (val !== undefined && val !== null && (typeof val !== 'string' || val.trim() !== '')) {
      (updated as any)[key] = val;
    } else if (typeof val === 'boolean') {
      (updated as any)[key] = val;
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

  // Attempt webhook registration in Evolution API if we have enough credentials and not simulated
  if (updated.apiUrl && updated.apiKey && updated.instanceName && updated.webhookUrl && !updated.isSimulated) {
    try {
      await registerEvolutionWebhook(updated);
    } catch (err: any) {
      console.log("[WhatsApp Webhook Register] Auto registration skipped / deferred:", err.message);
    }
  }

  return updated;
}

// Setup Evolution API webhook to send MESSAGES_UPSERT events to our backend
async function registerEvolutionWebhook(config: WhatsAppConfig): Promise<boolean> {
  const cleanUrl = config.apiUrl.replace(/\/$/, "");
  const targetRegisterUrl = `${cleanUrl}/webhook/set/${encodeURIComponent(config.instanceName)}`;
  
  console.log(`[WhatsApp Webhook Register] Setting webhook on Evolution API: ${targetRegisterUrl}`);
  
  const res = await fetch(targetRegisterUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": config.apiKey
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
    if (errorText.trim().startsWith("<") || errorText.toLowerCase().includes("<!doctype")) {
      errorText = "Invalid Evolution API endpoint configuration (returned HTML index webpage instead of API response). Recommended: Enable Simulation Mode.";
      console.log(`[WhatsApp Webhook Register] Webhook setup deferred: ${errorText}`);
    } else {
      console.log(`[WhatsApp Webhook Register] Webhook setup deferred: status ${res.status} - ${errorText}`);
    }
    return false;
  }

  console.log(`[WhatsApp Webhook Register] Webhook successfully registered for ${config.instanceName}!`);
  return true;
}

// Send direct WhatsApp message
export async function sendWhatsAppMessage(config: WhatsAppConfig, toJid: string, text: string): Promise<boolean> {
  // Se estiver em modo de simulação, processa o envio simulando com sucesso
  if (config.isSimulated) {
    console.log(`\n--- [SIMULATION OUTGOING WHATSAPP MESSAGE] ---`);
    console.log(`Para: ${toJid}`);
    console.log(`Mensagem:\n${text}`);
    console.log(`---------------------------------------------\n`);

    // Se for uma pergunta de prontidão (direct prompt), simula uma resposta automática do jogador pós 3 a 5 segundos
    if (text.includes("Você vai participar?") || text.includes("SIM se for jogar")) {
      const cleanPhone = normalizePhone(toJid);
      setTimeout(async () => {
        try {
          // 75% chance de Sim, 25% de Não
          const simulatedWord = Math.random() < 0.75 ? "SIM, vou jogar quinta-feira!" : "NÃO, infelizmente não vou poder ir hoje.";
          console.log(`[SIMULATOR INCOMING] Simulando resposta do jogador ${toJid}: "${simulatedWord}"`);
          
          await fetch("http://localhost:3000/api/whatsapp/webhook", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              instance: config.instanceName || "GUERREIROS-BOT",
              event: "messages.upsert",
              data: {
                key: {
                  remoteJid: `${cleanPhone}@s.whatsapp.net`,
                  fromMe: false
                },
                message: {
                  conversation: simulatedWord
                }
              }
            })
          });
        } catch (simE: any) {
          console.warn("[SIMULATOR ERR] Falha ao enviar resposta simulada ao webhook:", simE.message);
        }
      }, 3000 + Math.random() * 2000);
    }
    return true;
  }

  if (!config.apiUrl || !config.apiKey || !config.instanceName) {
    console.info("[WhatsApp Message] Skip sending because WhatsApp service config is missing.");
    return false;
  }

  // Format recipient number (add @g.us / @s.whatsapp.net if missing)
  let recipient = toJid.trim().replace(/\s+/g, '');
  if (!recipient.includes("@")) {
    // Se conter hífen, ou tiver mais que 15 caracteres numéricos, é um JID de grupo (ex: 120363025219382210)
    if (recipient.includes("-") || recipient.length >= 15) {
      recipient = `${recipient}@g.us`;
    } else {
      recipient = `${normalizePhone(recipient)}@s.whatsapp.net`;
    }
  }

  const cleanUrl = config.apiUrl.replace(/\/$/, "");
  const sendUrl = `${cleanUrl}/message/sendText/${encodeURIComponent(config.instanceName)}`;

  try {
    const response = await fetch(sendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": config.apiKey
      },
      body: JSON.stringify({
        number: recipient,
        options: {
          delay: 1000,
          presence: "composing",
          linkPreview: false
        },
        textMessage: {
          text: text
        },
        text: text // Double redundancy for different Evolution API standard versions
      })
    });

    if (!response.ok) {
      let errTxt = await response.text();
      if (errTxt.trim().startsWith("<") || errTxt.toLowerCase().includes("<!doctype")) {
        errTxt = "Configured Evolution API endpoint is invalid (returned HTML index page instead of API response). Recommended: Enable Simulation Mode.";
        console.log(`[WhatsApp API Send] Skip output: ${errTxt}`);
      } else {
        console.log(`[WhatsApp API Send] Deferred sending to ${recipient}: status ${response.status} - ${errTxt}`);
      }
      return false;
    }

    console.log(`[WhatsApp API Send] Message sent to ${recipient}`);
    return true;
  } catch (error: any) {
    console.log(`[WhatsApp API Send] Connection deferred: ${error.message || error}`);
    return false;
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
      text += `${idx + 1}. *[V]* ${p.name}${setterTag}\n`;
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
    const success = await sendWhatsAppMessage(config, player.phone, promptMessage);
    if (success) {
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
    
    const success = await sendWhatsAppMessage(config, config.groupJid, listText);
    if (success) {
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
