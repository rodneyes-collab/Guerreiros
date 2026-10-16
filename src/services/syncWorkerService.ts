// Service manager for Firestore Sync Web Worker

class SyncWorkerService {
  private worker: Worker | null = null;
  private messageIdCounter = 0;
  private pendingRequests = new Map<number, { resolve: (val: any) => void, reject: (err: any) => void }>();

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    try {
      if (typeof window !== 'undefined' && window.Worker) {
        this.worker = new Worker(
          new URL('../workers/firestoreSyncWorker.ts', import.meta.url),
          { type: 'module' }
        );

        this.worker.onmessage = (e: MessageEvent) => {
          const { id, type, result, error } = e.data;
          const pending = this.pendingRequests.get(id);
          if (pending) {
            this.pendingRequests.delete(id);
            if (type === 'ERROR') {
              pending.reject(new Error(error));
            } else {
              pending.resolve(result);
            }
          }
        };

        this.worker.onerror = (err) => {
          console.warn('SyncWorker error encountered:', err);
        };
      }
    } catch (e) {
      console.warn('Failed to initialize SyncWorker, falling back to main thread execution:', e);
    }
  }

  public async parsePlayers(snapshotDocs: any[]): Promise<{ sortedList: any[], idToCanonical: Record<string, string> }> {
    return this.sendToWorker('PARSE_PLAYERS', { docs: snapshotDocs });
  }

  public async parseAttendance(snapshotDocs: any[]): Promise<{ sorted: any[], isInconsistent: boolean }> {
    return this.sendToWorker('PARSE_ATTENDANCE', { docs: snapshotDocs });
  }

  public async parseMatches(snapshotDocs: any[]): Promise<{ sorted: any[] }> {
    return this.sendToWorker('PARSE_MATCHES', { docs: snapshotDocs });
  }

  private sendToWorker(type: string, payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const runFallback = () => {
        try {
          if (type === 'PARSE_PLAYERS') {
            const list: any[] = [];
            const seenEmails = new Set<string>();
            const seenUids = new Set<string>();
            const idToCanonical = {} as Record<string, string>;
            const emailToCanonicalId = {} as Record<string, string>;
            const uidToCanonicalId = {} as Record<string, string>;
            for (const item of payload.docs) {
              const { id: docId, data } = item;
              const player = { id: docId, name: (data.name || 'Jogador Sem Nome').trim(), ...data };
              list.push(player);
              idToCanonical[docId] = docId;
            }
            resolve({ sortedList: list.sort((a, b) => a.name.localeCompare(b.name)), idToCanonical });
          } else if (type === 'PARSE_ATTENDANCE') {
            const list: any[] = [];
            for (const item of payload.docs) {
              list.push({ ...item.data, id: item.data.id || item.id });
            }
            resolve({ sorted: list, isInconsistent: false });
          } else if (type === 'PARSE_MATCHES') {
            const list: any[] = [];
            for (const item of payload.docs) {
              list.push({ ...item.data, id: item.id });
            }
            resolve({ sorted: list.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)) });
          }
        } catch (fbErr) {
          reject(fbErr);
        }
      };

      if (!this.worker) {
        runFallback();
        return;
      }

      const id = ++this.messageIdCounter;

      // Define a safety timeout of 300ms to avoid freezing the UI if the worker hangs or fails silently
      const timeoutId = setTimeout(() => {
        console.warn(`[SyncWorkerService] Worker timed out for message type ${type}. Recovering with synchronous fallback.`);
        this.pendingRequests.delete(id);
        this.worker = null; // Disable worker for future requests
        runFallback();
      }, 300);

      this.pendingRequests.set(id, { 
        resolve: (val) => {
          clearTimeout(timeoutId);
          resolve(val);
        }, 
        reject: (err) => {
          clearTimeout(timeoutId);
          reject(err);
        } 
      });

      try {
        this.worker!.postMessage({ id, type, payload });
      } catch (err) {
        console.warn(`[SyncWorkerService] Failed to postMessage to Worker for ${type}:`, err);
        clearTimeout(timeoutId);
        this.pendingRequests.delete(id);
        this.worker = null;
        runFallback();
      }
    });
  }
}

export const syncWorkerService = new SyncWorkerService();
