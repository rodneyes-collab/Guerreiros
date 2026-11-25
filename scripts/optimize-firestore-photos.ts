import fs from "fs";
import path from "path";
import sharp from "sharp";

const ROOT_DIR = process.cwd();
const LOCAL_PLAYERS_PATH = path.join(ROOT_DIR, "players_backup_local.json");
const LOCAL_WA_PHOTO_DIR_PATH = path.join(ROOT_DIR, "whatsapp_photos_directory_local.json");
const TARGET_BINARY_MAX_BYTES = 7500; // ~10.0 KB em Data URI base64

let firebaseConfig: any = {};
try {
  const configPath = path.join(ROOT_DIR, "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  }
} catch (err) {
  console.warn("[OptimizePhotos] Aviso ao ler firebase-applet-config.json:", err);
}

function resolveActiveFirestoreDatabaseId(): string | undefined {
  const rawId = process.env.FIRESTORE_DATABASE_ID || firebaseConfig?.firestoreDatabaseId;
  if (rawId && rawId !== "(default)" && !String(rawId).startsWith("ai-studio-")) {
    return rawId;
  }
  return undefined;
}

export async function compressDataUriTo10KB(
  input: string | null | undefined,
  targetBinaryMaxBytes = TARGET_BINARY_MAX_BYTES
): Promise<string | null> {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed.startsWith("data:image/")) return trimmed;

  const commaIdx = trimmed.indexOf(",");
  if (commaIdx === -1) return trimmed;
  const rawBuf = Buffer.from(trimmed.slice(commaIdx + 1), "base64");
  if (rawBuf.length < 60) return trimmed;

  // Se já estiver com <= ~10.3 KB Data URI, ainda passamos pelo sharp se for > 10600 chars
  if (trimmed.length <= 10500) {
    return trimmed;
  }

  const dimensions = [160, 144, 128, 112, 96];
  const qualities = [72, 62, 52, 44, 36];
  let bestBuf: Buffer | null = null;

  for (const dim of dimensions) {
    for (const q of qualities) {
      const candidate = await sharp(rawBuf)
        .rotate()
        .resize(dim, dim, { fit: "cover", position: "attention", withoutEnlargement: true })
        .jpeg({ quality: q, mozjpeg: true })
        .toBuffer();
      bestBuf = candidate;
      if (candidate.length <= targetBinaryMaxBytes) {
        return `data:image/jpeg;base64,${candidate.toString("base64")}`;
      }
    }
  }

  if (bestBuf) {
    return `data:image/jpeg;base64,${bestBuf.toString("base64")}`;
  }
  return trimmed;
}

async function runOptimization() {
  console.log("====================================================================");
  console.log("🚀 OTIMIZADOR DE FOTOS FIRESTORE & CACHE LOCAL (~10 KB + DEDUPLICAÇÃO)");
  console.log("====================================================================");

  const { initializeApp: initClientApp, getApps: getClientApps } = await import("firebase/app");
  const {
    getFirestore: getClientFirestore,
    setLogLevel,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    deleteField
  } = await import("firebase/firestore");

  try {
    setLogLevel("silent");
  } catch {}

  const clientApp = getClientApps().length > 0 ? getClientApps()[0] : initClientApp(firebaseConfig);
  try {
    const { getAuth, signInAnonymously } = await import("firebase/auth");
    const auth = getAuth(clientApp);
    if (!auth.currentUser) {
      await signInAnonymously(auth).catch(() => {});
    }
  } catch {}

  const dbId = resolveActiveFirestoreDatabaseId();
  const db = dbId ? getClientFirestore(clientApp, dbId) : getClientFirestore(clientApp);

  let totalBeforeBytes = 0;
  let totalAfterBytes = 0;
  let duplicatesRemoved = 0;
  let photosCompressed = 0;
  let firestoreDocsUpdated = 0;

  // 1. Otimiza todos os documentos da coleção `players` no Firestore
  console.log("\n[1/3] Lendo coleção `players` do Firestore...");
  const playersSnap = await getDocs(collection(db, "players"));
  console.log(`Encontrados ${playersSnap.size} documentos em players.`);

  const optimizedLocalPlayers: any[] = [];

  for (const playerDoc of playersSnap.docs) {
    const data = playerDoc.data() || {};
    const playerId = playerDoc.id;
    const playerName = data.name || playerId;

    const rawPhotoUrl = typeof data.photoUrl === "string" ? data.photoUrl : "";
    const rawWaPhotoUrl = typeof data.whatsappPhotoUrl === "string" ? data.whatsappPhotoUrl : "";
    const hasDuplicateField = "whatsappPhotoUrl" in data;

    const beforeDocPhotoBytes = Buffer.byteLength(rawPhotoUrl, "utf8") + Buffer.byteLength(rawWaPhotoUrl, "utf8");
    totalBeforeBytes += beforeDocPhotoBytes;

    const effectiveSourcePhoto = rawPhotoUrl.startsWith("data:image/")
      ? rawPhotoUrl
      : rawWaPhotoUrl.startsWith("data:image/")
      ? rawWaPhotoUrl
      : rawPhotoUrl || rawWaPhotoUrl;

    let optimizedPhoto = effectiveSourcePhoto;
    let wasCompressed = false;

    if (effectiveSourcePhoto && effectiveSourcePhoto.startsWith("data:image/")) {
      const compressed = await compressDataUriTo10KB(effectiveSourcePhoto);
      if (compressed && compressed.length < effectiveSourcePhoto.length) {
        optimizedPhoto = compressed;
        wasCompressed = true;
        photosCompressed++;
      }
    }

    const afterDocPhotoBytes = Buffer.byteLength(optimizedPhoto || "", "utf8");
    totalAfterBytes += afterDocPhotoBytes;

    if (hasDuplicateField) {
      duplicatesRemoved++;
    }

    const needsFirestoreWrite =
      hasDuplicateField || wasCompressed || (optimizedPhoto && optimizedPhoto !== rawPhotoUrl);

    if (needsFirestoreWrite) {
      const updatePayload: Record<string, any> = {
        whatsappPhotoUrl: deleteField()
      };
      if (optimizedPhoto) {
        updatePayload.photoUrl = optimizedPhoto;
      }
      await setDoc(doc(db, "players", playerId), updatePayload, { merge: true });
      firestoreDocsUpdated++;
    }

    const cleanLocalPlayer: Record<string, any> = {
      id: playerId,
      ...data
    };
    delete cleanLocalPlayer.whatsappPhotoUrl;
    if (optimizedPhoto) {
      cleanLocalPlayer.photoUrl = optimizedPhoto;
    }
    optimizedLocalPlayers.push(cleanLocalPlayer);

    if (beforeDocPhotoBytes > 0) {
      const beforeKB = (beforeDocPhotoBytes / 1024).toFixed(1);
      const afterKB = (afterDocPhotoBytes / 1024).toFixed(1);
      console.log(
        `  • ${String(playerName).padEnd(18)} | Antes: ${beforeKB.padStart(6)} KB -> Depois: ${afterKB.padStart(5)} KB` +
          `${hasDuplicateField ? " [whatsappPhotoUrl removido]" : ""}` +
          `${wasCompressed ? " [comprimido ~10KB]" : ""}`
      );
    }
  }

  // 2. Otimiza `metadata/whatsapp_photo_directory` no Firestore e `whatsapp_photos_directory_local.json`
  console.log("\n[2/3] Otimizando diretório `metadata/whatsapp_photo_directory`...");
  let localDir: Record<string, any> = {};
  if (fs.existsSync(LOCAL_WA_PHOTO_DIR_PATH)) {
    try {
      localDir = JSON.parse(fs.readFileSync(LOCAL_WA_PHOTO_DIR_PATH, "utf-8")) || {};
    } catch {}
  }

  try {
    const dirSnap = await getDoc(doc(db, "metadata", "whatsapp_photo_directory"));
    if (dirSnap.exists()) {
      const remoteData = dirSnap.data() || {};
      const entries = remoteData.entries && typeof remoteData.entries === "object" ? remoteData.entries : {};
      Object.assign(localDir, entries);
    }
  } catch {}

  let dirEntriesCompressed = 0;
  for (const [key, entry] of Object.entries(localDir)) {
    if (entry && typeof entry === "object" && typeof entry.photoUrl === "string" && entry.photoUrl.startsWith("data:image/")) {
      const compressed = await compressDataUriTo10KB(entry.photoUrl);
      if (compressed && compressed.length < entry.photoUrl.length) {
        entry.photoUrl = compressed;
        dirEntriesCompressed++;
      }
      localDir[key] = entry;
    }
  }

  if (Object.keys(localDir).length > 0) {
    fs.writeFileSync(LOCAL_WA_PHOTO_DIR_PATH, JSON.stringify(localDir, null, 2), "utf-8");
    await setDoc(
      doc(db, "metadata", "whatsapp_photo_directory"),
      { entries: localDir, updatedAt: Date.now() },
      { merge: true }
    ).catch(() => {});
  }
  console.log(`Diretório de fotos atualizado (${dirEntriesCompressed} entradas comprimidas para ~10 KB).`);

  // 3. Atualiza `players_backup_local.json` sem whatsappPhotoUrl e com fotos ~10 KB
  console.log("\n[3/3] Atualizando `players_backup_local.json`...");
  let diskBeforeKB = "0.0";
  if (fs.existsSync(LOCAL_PLAYERS_PATH)) {
    diskBeforeKB = (fs.statSync(LOCAL_PLAYERS_PATH).size / 1024).toFixed(1);
  }

  if (optimizedLocalPlayers.length >= 5) {
    fs.writeFileSync(LOCAL_PLAYERS_PATH, JSON.stringify(optimizedLocalPlayers), "utf-8");
  } else if (fs.existsSync(LOCAL_PLAYERS_PATH)) {
    const localList = JSON.parse(fs.readFileSync(LOCAL_PLAYERS_PATH, "utf-8"));
    if (Array.isArray(localList)) {
      for (const p of localList) {
        if (!p.photoUrl && p.whatsappPhotoUrl) p.photoUrl = p.whatsappPhotoUrl;
        delete p.whatsappPhotoUrl;
        if (typeof p.photoUrl === "string" && p.photoUrl.startsWith("data:image/")) {
          p.photoUrl = (await compressDataUriTo10KB(p.photoUrl)) || p.photoUrl;
        }
      }
      fs.writeFileSync(LOCAL_PLAYERS_PATH, JSON.stringify(localList), "utf-8");
    }
  }

  const diskAfterKB = fs.existsSync(LOCAL_PLAYERS_PATH)
    ? (fs.statSync(LOCAL_PLAYERS_PATH).size / 1024).toFixed(1)
    : "0.0";

  const savedPercent =
    totalBeforeBytes > 0 ? (((totalBeforeBytes - totalAfterBytes) / totalBeforeBytes) * 100).toFixed(1) : "0.0";

  console.log("\n====================================================================");
  console.log("✅ RESUMO DA OTIMIZAÇÃO:");
  console.log(`  • Documentos atualizados no Firestore: ${firestoreDocsUpdated}`);
  console.log(`  • Campos duplicados 'whatsappPhotoUrl' removidos: ${duplicatesRemoved}`);
  console.log(`  • Fotos comprimidas para ~10 KB: ${photosCompressed}`);
  console.log(
    `  • Peso das fotos em 'players': ${(totalBeforeBytes / 1024).toFixed(1)} KB -> ${(totalAfterBytes / 1024).toFixed(1)} KB (-${savedPercent}%)`
  );
  console.log(`  • Tamanho de players_backup_local.json: ${diskBeforeKB} KB -> ${diskAfterKB} KB`);
  console.log("====================================================================");
  process.exit(0);
}

runOptimization().catch((err) => {
  console.error("[OptimizePhotos] Erro fatal:", err);
  process.exit(1);
});
