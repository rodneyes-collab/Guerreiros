import { 
  db, 
  collection, 
  doc, 
  getDocFromServer, 
  getDocsFromServer, 
  query, 
  orderBy, 
  limit, 
  getFirestoreDateKey 
} from '../../firebase';
import { useStore } from '../../store';
import { SelectiveSyncResult, CollectionSyncMeta } from '../../types';
import { syncWorkerService } from './syncWorkerService';

const safeTimestamp = (ts: any): number => {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (ts?.toMillis && typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts?.seconds) return ts.seconds * 1000;
  const parsed = new Date(ts).getTime();
  return isNaN(parsed) ? 0 : parsed;
};

export interface CollectionCheckItem {
  key: string;
  displayName: string;
  localTimestamp: number;
  serverTimestamp: number;
  localCount: number;
  serverCount?: number;
  hasDiscrepancy: boolean;
  reason: string;
}

class SelectiveForceSyncService {
  /**
   * Avalia individualmente as coleções contra o Firestore (via getDocFromServer / getDocsFromServer),
   * identificando discrepâncias de timestamp ou de contagem entre o cache/estado local e a nuvem.
   */
  public async evaluateDiscrepancies(): Promise<CollectionCheckItem[]> {
    const state = useStore.getState();
    const meta = state.collectionsSyncMeta;
    const dateKey = getFirestoreDateKey();
    const now = Date.now();

    const results: CollectionCheckItem[] = [];

    // 1. Coleção: Lista de Intenções (metadata/intentions)
    try {
      const intentionsSnap = await getDocFromServer(doc(db, 'metadata', 'intentions'));
      const intentionsData = intentionsSnap.data() || {};
      const serverUpdated = safeTimestamp(intentionsData.lastUpdated);
      const serverResponsesCount = Object.keys(intentionsData.responses || {}).length;
      const localMeta = meta['intentions'];
      const localUpdated = localMeta?.lastSyncTimestamp || 0;
      const localCount = localMeta?.itemCount ?? 0;

      // Discrepância se o servidor tiver update mais recente que o último sync local ou contagem diferente
      const hasDiscrepancy = (serverUpdated > 0 && serverUpdated > localUpdated) || (serverResponsesCount !== localCount);
      const reason = hasDiscrepancy 
        ? `Servidor atualizado em ${new Date(serverUpdated).toLocaleTimeString('pt-BR')} (${serverResponsesCount} atletas vs ${localCount} locais)`
        : 'Sincronizado';

      results.push({
        key: 'intentions',
        displayName: 'Lista de Intenções (metadata/intentions)',
        localTimestamp: localUpdated,
        serverTimestamp: serverUpdated,
        localCount,
        serverCount: serverResponsesCount,
        hasDiscrepancy,
        reason
      });
    } catch (e: any) {
      console.warn('[SelectiveSync] Erro ao checar metadata/intentions:', e);
    }

    // 2. Coleção: Histórico de Partidas (matches)
    try {
      // Busca a partida mais recente diretamente do servidor com limit(1) ordenado por timestamp desc
      const qLatest = query(collection(db, 'matches'), orderBy('timestamp', 'desc'), limit(1));
      const latestMatchSnap = await getDocsFromServer(qLatest);
      let latestMatchServerTs = 0;
      if (!latestMatchSnap.empty) {
        latestMatchServerTs = safeTimestamp(latestMatchSnap.docs[0].data().timestamp);
      }
      
      const localMatches = state.matches;
      const localMatchesMeta = meta['matches'];
      const localMatchMaxTs = localMatches.reduce((max, m) => Math.max(max, safeTimestamp(m.timestamp)), 0);
      const localUpdated = localMatchesMeta?.lastSyncTimestamp || 0;

      // Discrepância se a partida mais recente no servidor for mais nova do que a que temos no estado
      const hasDiscrepancy = latestMatchServerTs > 0 && (latestMatchServerTs > localMatchMaxTs || latestMatchServerTs > localUpdated);
      const reason = hasDiscrepancy
        ? `Nova partida detectada no servidor com timestamp ${new Date(latestMatchServerTs).toLocaleTimeString('pt-BR')}`
        : 'Sincronizado';

      results.push({
        key: 'matches',
        displayName: 'Histórico de Partidas (matches)',
        localTimestamp: localUpdated,
        serverTimestamp: latestMatchServerTs,
        localCount: localMatches.length,
        hasDiscrepancy,
        reason
      });
    } catch (e: any) {
      console.warn('[SelectiveSync] Erro ao checar matches:', e);
    }

    // 3. Coleção: Lista de Presença do Dia (attendance/dateKey/players)
    try {
      const attendanceServerSnap = await getDocsFromServer(collection(db, 'attendance', dateKey, 'players'));
      const serverAttendanceCount = attendanceServerSnap.docs.length;
      let maxServerAttendanceTs = 0;
      attendanceServerSnap.docs.forEach(d => {
        const ts = safeTimestamp(d.data().timestamp || d.data().arrivalOrder);
        if (ts > maxServerAttendanceTs) maxServerAttendanceTs = ts;
      });

      const localAttendance = state.attendance;
      const localAttendanceMeta = meta['attendance'];
      const localUpdated = localAttendanceMeta?.lastSyncTimestamp || 0;
      const localCount = localAttendance.length;

      const hasDiscrepancy = serverAttendanceCount !== localCount || (maxServerAttendanceTs > localUpdated && maxServerAttendanceTs > 0);
      const reason = hasDiscrepancy
        ? `Presença diverge: ${serverAttendanceCount} presentes no servidor vs ${localCount} locais`
        : 'Sincronizado';

      results.push({
        key: 'attendance',
        displayName: `Lista de Presença do Dia (${dateKey})`,
        localTimestamp: localUpdated,
        serverTimestamp: maxServerAttendanceTs || localUpdated,
        localCount,
        serverCount: serverAttendanceCount,
        hasDiscrepancy,
        reason
      });
    } catch (e: any) {
      console.warn('[SelectiveSync] Erro ao checar attendance:', e);
    }

    // 4. Coleção: Sócios Cadastrados (players)
    try {
      const playersServerSnap = await getDocsFromServer(collection(db, 'players'));
      const serverPlayersCount = playersServerSnap.docs.length;
      const localPlayers = state.players;
      const localPlayersMeta = meta['players'];
      const localUpdated = localPlayersMeta?.lastSyncTimestamp || 0;

      const hasDiscrepancy = serverPlayersCount !== localPlayers.length;
      const reason = hasDiscrepancy
        ? `Contagem de sócios diverge: ${serverPlayersCount} no servidor vs ${localPlayers.length} locais`
        : 'Sincronizado';

      results.push({
        key: 'players',
        displayName: 'Sócios Cadastrados (players)',
        localTimestamp: localUpdated,
        serverTimestamp: now,
        localCount: localPlayers.length,
        serverCount: serverPlayersCount,
        hasDiscrepancy,
        reason
      });
    } catch (e: any) {
      console.warn('[SelectiveSync] Erro ao checar players:', e);
    }

    // 5. Coleção: Metadados do Sistema (metadata/system)
    try {
      const sysSnap = await getDocFromServer(doc(db, 'metadata', 'system'));
      const sysData = sysSnap.data() || {};
      const serverResetTs = safeTimestamp(sysData.lastResetTimestamp);
      const localResetTs = safeTimestamp(state.systemMetadata?.lastResetTimestamp);

      const hasDiscrepancy = serverResetTs > 0 && serverResetTs !== localResetTs;
      const reason = hasDiscrepancy
        ? `Reset diário ou configurações foram alteradas no servidor`
        : 'Sincronizado';

      results.push({
        key: 'system',
        displayName: 'Sistema & Reset Diário (metadata/system)',
        localTimestamp: localResetTs,
        serverTimestamp: serverResetTs,
        localCount: 1,
        serverCount: 1,
        hasDiscrepancy,
        reason
      });
    } catch (e: any) {
      console.warn('[SelectiveSync] Erro ao checar metadata/system:', e);
    }

    return results;
  }

  /**
   * Força a sincronização cirúrgica APENAS das coleções que possuem discrepância confirmada,
   * poupando leitura e recarga do restante do banco de dados.
   */
  public async executeSelectiveForceSync(specificKeys?: string[]): Promise<SelectiveSyncResult[]> {
    const discrepancies = await this.evaluateDiscrepancies();
    const targets = discrepancies.filter(d => {
      if (specificKeys && specificKeys.length > 0) {
        return specificKeys.includes(d.key);
      }
      return d.hasDiscrepancy;
    });

    const executionResults: SelectiveSyncResult[] = [];
    const dateKey = getFirestoreDateKey();
    const setCollectionSyncMeta = useStore.getState().setCollectionSyncMeta;

    console.info(`[SelectiveSync] Iniciando force-sync seletivo para ${targets.length} coleção(ões) com discrepância.`);

    for (const item of targets) {
      setCollectionSyncMeta(item.key, { status: 'syncing' });

      try {
        if (item.key === 'intentions') {
          // Atualiza estritamente metadata/intentions do servidor
          const snap = await getDocFromServer(doc(db, 'metadata', 'intentions'));
          const data = snap.data() || {};
          const responsesCount = Object.keys(data.responses || {}).length;
          
          setCollectionSyncMeta('intentions', {
            displayName: 'Lista de Intenções (metadata/intentions)',
            lastSyncTimestamp: Date.now(),
            serverLastUpdated: safeTimestamp(data.lastUpdated),
            itemCount: responsesCount,
            serverCount: responsesCount,
            source: 'server',
            hasPendingWrites: false,
            status: 'synced',
            hasDiscrepancy: false,
            error: null
          });

          executionResults.push({
            collectionKey: 'intentions',
            displayName: 'Lista de Intenções',
            actionTaken: 'UPDATED',
            localTimestamp: Date.now(),
            serverTimestamp: safeTimestamp(data.lastUpdated),
            itemsUpdated: responsesCount,
            details: `${responsesCount} respostas atualizadas diretamente do servidor`
          });
        } 
        else if (item.key === 'matches') {
          // Atualiza estritamente a coleção matches do servidor
          const snap = await getDocsFromServer(collection(db, 'matches'));
          const docs = snap.docs.map(d => ({
            id: d.id,
            data: {
              ...d.data(),
              timestamp: safeTimestamp(d.data().timestamp)
            }
          }));

          const { sorted } = await syncWorkerService.parseMatches(docs);
          useStore.getState().setMatches(sorted);

          setCollectionSyncMeta('matches', {
            displayName: 'Histórico de Partidas',
            lastSyncTimestamp: Date.now(),
            itemCount: sorted.length,
            serverCount: sorted.length,
            source: 'server',
            hasPendingWrites: false,
            status: 'synced',
            hasDiscrepancy: false,
            error: null
          });

          executionResults.push({
            collectionKey: 'matches',
            displayName: 'Histórico de Partidas',
            actionTaken: 'UPDATED',
            localTimestamp: Date.now(),
            serverTimestamp: Date.now(),
            itemsUpdated: sorted.length,
            details: `${sorted.length} partidas sincronizadas cirurgicamente`
          });
        }
        else if (item.key === 'attendance') {
          // Atualiza estritamente attendance do servidor
          const snap = await getDocsFromServer(collection(db, 'attendance', dateKey, 'players'));
          const docs = snap.docs.map(d => ({ id: d.id, data: d.data() }));
          const { sorted } = await syncWorkerService.parseAttendance(docs);

          const activeMasterPlayers = useStore.getState().players;
          const activeSorted = sorted.filter(p => {
            const master = activeMasterPlayers.find(m => m.id === p.id || (m.uid && m.uid === p.uid));
            const status = master?.status || p.status || 'active';
            const isDM = Boolean(master?.isDM || p.isDM || status === 'dm');
            return (status === 'active' || status === 'guest') && !isDM && status !== 'dm' && status !== 'inactive' && status !== 'waiting';
          });

          useStore.getState().setAttendance(activeSorted);

          setCollectionSyncMeta('attendance', {
            displayName: `Lista de Presença (${dateKey})`,
            lastSyncTimestamp: Date.now(),
            itemCount: activeSorted.length,
            serverCount: activeSorted.length,
            source: 'server',
            hasPendingWrites: false,
            status: 'synced',
            hasDiscrepancy: false,
            error: null
          });

          executionResults.push({
            collectionKey: 'attendance',
            displayName: 'Lista de Presença',
            actionTaken: 'UPDATED',
            localTimestamp: Date.now(),
            serverTimestamp: Date.now(),
            itemsUpdated: activeSorted.length,
            details: `${activeSorted.length} presenças atualizadas do servidor`
          });
        }
        else if (item.key === 'players') {
          // Atualiza estritamente players do servidor
          const snap = await getDocsFromServer(collection(db, 'players'));
          const docs = snap.docs.map(d => ({ id: d.id, data: d.data() }));
          const { sortedList, idToCanonical } = await syncWorkerService.parsePlayers(docs);

          useStore.getState().setPlayers(sortedList);
          useStore.getState().setIdToCanonicalId(idToCanonical);

          setCollectionSyncMeta('players', {
            displayName: 'Sócios Cadastrados',
            lastSyncTimestamp: Date.now(),
            itemCount: sortedList.length,
            serverCount: sortedList.length,
            source: 'server',
            hasPendingWrites: false,
            status: 'synced',
            hasDiscrepancy: false,
            error: null
          });

          executionResults.push({
            collectionKey: 'players',
            displayName: 'Sócios Cadastrados',
            actionTaken: 'UPDATED',
            localTimestamp: Date.now(),
            serverTimestamp: Date.now(),
            itemsUpdated: sortedList.length,
            details: `${sortedList.length} cadastros de sócios atualizados`
          });
        }
        else if (item.key === 'system') {
          // Atualiza estritamente metadata/system do servidor
          const snap = await getDocFromServer(doc(db, 'metadata', 'system'));
          if (snap.exists()) {
            useStore.getState().setSystemMetadata(snap.data());
          }

          setCollectionSyncMeta('system', {
            displayName: 'Metadados do Sistema',
            lastSyncTimestamp: Date.now(),
            source: 'server',
            hasPendingWrites: false,
            status: 'synced',
            hasDiscrepancy: false,
            error: null
          });

          executionResults.push({
            collectionKey: 'system',
            displayName: 'Sistema & Reset',
            actionTaken: 'UPDATED',
            localTimestamp: Date.now(),
            serverTimestamp: Date.now(),
            itemsUpdated: 1,
            details: 'Configurações de sistema atualizadas do servidor'
          });
        }
      } catch (err: any) {
        console.error(`[SelectiveSync] Falha no force-sync da coleção "${item.key}":`, err);
        setCollectionSyncMeta(item.key, {
          status: 'error',
          error: err?.message || String(err)
        });

        executionResults.push({
          collectionKey: item.key,
          displayName: item.displayName,
          actionTaken: 'ERROR',
          localTimestamp: item.localTimestamp,
          serverTimestamp: item.serverTimestamp,
          itemsUpdated: 0,
          details: err?.message || 'Erro durante force-sync cirúrgico'
        });
      }
    }

    useStore.getState().setLastSyncTimestamp(Date.now());
    return executionResults;
  }
}

export const selectiveForceSyncService = new SelectiveForceSyncService();
