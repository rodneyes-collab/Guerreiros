import { db, doc, getDocFromServer, getDocsFromServer, collection, getFirestoreDateKey } from '../../firebase';
import { useStore } from '../../store';
import { normalizeIntentionsData } from '../hooks/useIntentions';

export interface PendingFirestoreOperation {
  id: string;
  path: string;
  operationType: 'create' | 'update' | 'delete' | 'write';
  payload?: any;
  timestamp: number;
  error: string;
  status: 'failed' | 'retrying' | 'resolved';
}

class FirestoreDiagnosticsService {
  private failedOperations: PendingFirestoreOperation[] = [];
  private listeners: (() => void)[] = [];

  constructor() {
    // Carrega operações pendentes salvas no localStorage, se houver
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const saved = window.localStorage.getItem('guerreiros_failed_firestore_ops');
        if (saved) {
          this.failedOperations = JSON.parse(saved) || [];
        }
      } catch (e) {}
    }
  }

  private persist() {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem('guerreiros_failed_firestore_ops', JSON.stringify(this.failedOperations.slice(-20)));
    } catch (e) {}
  }

  public recordFailedOperation(path: string, operationType: 'create' | 'update' | 'delete' | 'write', payload: any, error: string) {
    const op: PendingFirestoreOperation = {
      id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      path,
      operationType,
      payload,
      timestamp: Date.now(),
      error,
      status: 'failed'
    };
    this.failedOperations.unshift(op);
    this.persist();
    console.warn(`[FirestoreDiagnostics] Operação falhou e foi registrada para diagnóstico:`, op);
  }

  public getFailedOperations(): PendingFirestoreOperation[] {
    return [...this.failedOperations];
  }

  public async retryOperation(opId: string): Promise<boolean> {
    const op = this.failedOperations.find(o => o.id === opId);
    if (!op) return false;

    op.status = 'retrying';
    try {
      if (op.path.startsWith('metadata/intentions')) {
        const { setDoc } = await import('firebase/firestore');
        await setDoc(doc(db, 'metadata', 'intentions'), op.payload || {}, { merge: true });
      } else if (op.path.startsWith('attendance/')) {
        const { setDoc } = await import('firebase/firestore');
        await setDoc(doc(db, op.path), op.payload || {}, { merge: true });
      } else {
        const { setDoc } = await import('firebase/firestore');
        await setDoc(doc(db, op.path), op.payload || {}, { merge: true });
      }

      op.status = 'resolved';
      this.failedOperations = this.failedOperations.filter(o => o.id !== opId);
      this.persist();
      console.info(`[FirestoreDiagnostics] Operação ${opId} reenviada e resolvida com sucesso!`);
      return true;
    } catch (err: any) {
      op.status = 'failed';
      op.error = err?.message || String(err);
      this.persist();
      console.error(`[FirestoreDiagnostics] Reenvio da operação ${opId} falhou novamente:`, err);
      return false;
    }
  }

  /**
   * Hard Reset de Cache para 'intentions' e 'attendance'
   * Limpa o cache local e executa getDocFromServer / getDocsFromServer direto da nuvem.
   */
  public async hardResetIntentionsAndAttendance(): Promise<{ intentionsCount: number; attendanceCount: number }> {
    console.info('[HardReset] Iniciando Hard Reset de Cache para intentions e attendance...');
    const today = getFirestoreDateKey();

    try {
      // 1. Limpar chaves locais específicas de intentions e attendance no localStorage
      if (typeof window !== 'undefined' && window.localStorage) {
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && (k.includes('intentions') || k.includes('attendance') || k.includes('firestore_targets_'))) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach(k => window.localStorage.removeItem(k));
      }

      // 2. Buscar diretamente do servidor Firestore ignorando o cache local IndexedDB
      const intentionsRef = doc(db, 'metadata', 'intentions');
      const intentionsSnap = await getDocFromServer(intentionsRef);
      const rawIntentionsData = intentionsSnap.exists() ? intentionsSnap.data() : {};
      const normalizedIntentions = normalizeIntentionsData(rawIntentionsData);

      // 3. Buscar presença do dia diretamente do servidor
      const attendanceColRef = collection(db, 'attendance', today, 'players');
      const attendanceSnap = await getDocsFromServer(attendanceColRef);
      const freshAttendance: any[] = [];
      attendanceSnap.forEach(d => {
        freshAttendance.push({ id: d.id, ...d.data() });
      });

      // 4. Atualizar o Store Zustand com dados 100% frescos da nuvem
      const store = useStore.getState();
      
      // Atualizar attendance no store se houver setter correspondente
      if (typeof store.setAttendance === 'function') {
        store.setAttendance(freshAttendance);
      }

      // Disparar sincronização geral
      store.triggerSync();

      console.info('[HardReset] Hard Reset concluído com sucesso. Intenções e Presença atualizadas direto do servidor.');
      return {
        intentionsCount: Object.keys(normalizedIntentions.responses || {}).length,
        attendanceCount: freshAttendance.length
      };
    } catch (err) {
      console.error('[HardReset] Erro crítico durante o Hard Reset de Cache:', err);
      throw err;
    }
  }
}

export const firestoreDiagnosticsService = new FirestoreDiagnosticsService();
