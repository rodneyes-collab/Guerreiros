import { useEffect } from 'react';
import { useStore } from '../../store';
import { 
  db, 
  collection, 
  getDocs, 
  writeBatch, 
  doc, 
  setDoc, 
  getDoc,
  getFirestoreDateKey,
  auth
} from '../../firebase';
import { detectAnomalies } from '../../services/geminiService';
import { Player, Gender } from '../../types';

/**
 * Hook to perform automatic and periodic database maintenance.
 * Only runs for the Master Admin once a day.
 */
export const useDatabaseMaintenance = () => {
  const { user, userRole, showNotification } = useStore();

  useEffect(() => {
    const runMaintenance = async () => {
      // 1. Authorization: Only Master Admin
      if (!user || user.email !== 'rodneyes@gmail.com' || userRole !== 'ADMIN') return;

      const today = getFirestoreDateKey();
      const maintenanceRef = doc(db, 'metadata', 'last_db_maintenance');

      try {
        // 2. Check if already run today
        const snap = await getDoc(maintenanceRef);
        if (snap.exists() && snap.data().lastRun === today) {
          console.log('[Maintenance] Já executada hoje.');
          return;
        }

        console.log('[Maintenance] Iniciando manutenção automática e varredura do Sentinela...');

        // 3. Fetch all players for audit
        const playersSnap = await getDocs(collection(db, 'players'));
        const players: Player[] = [];
        playersSnap.forEach(d => players.push({ ...d.data(), id: d.id } as Player));

        if (players.length === 0) return;

        const batch = writeBatch(db);
        let repairsCount = 0;
        let mergeCount = 0;
        const seenEmails = new Map<string, string>(); // email -> id
        const seenUids = new Map<string, string>();   // uid -> id

        // 4. Maintenance Logic
        players.forEach(p => {
          const email = p.email?.trim().toLowerCase();
          const uid = p.uid;
          let isDuplicate = false;
          let primaryId = '';

          if (email && seenEmails.has(email)) {
            isDuplicate = true;
            primaryId = seenEmails.get(email)!;
          } else if (uid && seenUids.has(uid)) {
            isDuplicate = true;
            primaryId = seenUids.get(uid)!;
          }

          if (isDuplicate) {
            console.warn(`[Maintenance] Removendo duplicata: ${p.name} (${p.id}) -> Primário: ${primaryId}`);
            batch.delete(doc(db, 'players', p.id));
            mergeCount++;
            return;
          }

          if (email) seenEmails.set(email, p.id);
          if (uid) seenUids.set(uid, p.id);

          let needsRepair = false;
          const updates: any = {};

          if (!p.name || p.name.trim() === '') {
            updates.name = 'Jogador Sem Nome';
            needsRepair = true;
          }
          if (typeof p.elo !== 'number') {
            updates.elo = 1200;
            needsRepair = true;
          }
          if (!p.gender) {
            updates.gender = Gender.MALE;
            needsRepair = true;
          }
          if (typeof p.isAdmin !== 'boolean') {
            updates.isAdmin = p.email === 'rodneyes@gmail.com';
            needsRepair = true;
          }
          if (typeof p.isOfficialSetter !== 'boolean') {
            updates.isOfficialSetter = false;
            needsRepair = true;
          }

          if (needsRepair) {
            batch.update(doc(db, 'players', p.id), updates);
            repairsCount++;
          }
        });

        // 5. Commit Repairs
        if (repairsCount > 0 || mergeCount > 0) {
          await batch.commit();
          console.log(`[Maintenance] Batched: ${repairsCount} reparos, ${mergeCount} fusões.`);
        }

        // 6. AI Sentinel & Anomaly Detection
        console.log('[Maintenance] Acionando Agente Sentinela IA...');
        try {
          // Calling the server-side deep scan API
          await fetch('/api/sentinel/deep-scan', { method: 'POST' });
        } catch (e) {
          console.error('[Maintenance] Erro ao acionar Agente Sentinela via API:', e);
        }

        // 7. Old fallback Maintenance Report (Keeping for double safety)
        const matchesSnap = await getDocs(collection(db, 'matches'));
        const matches: any[] = [];
        matchesSnap.forEach(d => matches.push(d.data()));

        const metadataSnap = await getDoc(doc(db, 'metadata', 'system_config'));
        const metadata = metadataSnap.exists() ? metadataSnap.data() : {};

        console.log('[Maintenance] Gerando relatório de saúde com IA...');
        const aiReport = await detectAnomalies({ 
          players, 
          matches, 
          metadata 
        });

        // 7. Save Report
        const reportId = `maintenance_report_${today}`;
        await setDoc(doc(db, 'reports', reportId), {
          type: 'DB_MAINTENANCE',
          date: today,
          repairsApplied: repairsCount,
          duplicatesMerged: mergeCount,
          aiReport: aiReport,
          createdAt: new Date().toISOString()
        });

        // 8. Update Last Run
        await setDoc(maintenanceRef, { 
          lastRun: today,
          stats: { repairs: repairsCount, merges: mergeCount }
        }, { merge: true });

        if (repairsCount > 0 || mergeCount > 0) {
          showNotification(`Manutenção concluída: ${repairsCount} dados corrigidos e ${mergeCount} duplicatas resolvidas.`, 'success');
        }

      } catch (err) {
        console.error('[Maintenance] Erro durante a manutenção automática:', err);
      }
    };

    runMaintenance();
  }, [user, userRole, showNotification]);
};
