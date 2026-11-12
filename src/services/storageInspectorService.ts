export interface StorageItem {
  id: string;
  location: 'localStorage' | 'sessionStorage' | 'indexedDB';
  key: string;
  valueSummary: string;
  fullValue?: string;
  sizeBytes: number;
  dbName?: string;
  storeName?: string;
  isSuspect: boolean;
  suspectReason?: string;
  category: 'intentions' | 'attendance' | 'cache' | 'version' | 'other';
}

export interface IndexedDBStoreInfo {
  storeName: string;
  recordCount: number;
  suspectCount: number;
  items: StorageItem[];
}

export interface IndexedDBDatabaseInfo {
  dbName: string;
  version: number;
  stores: IndexedDBStoreInfo[];
  totalSuspects: number;
}

export interface StorageScanResult {
  localStorageItems: StorageItem[];
  sessionStorageItems: StorageItem[];
  indexedDBDatabases: IndexedDBDatabaseInfo[];
  totalSizeBytes: number;
  totalSuspectCount: number;
  scanTimestamp: number;
}

class StorageInspectorService {
  /**
   * Identifica se uma chave ou valor é suspeito de reter dados obsoletos de intenções ou presença
   */
  private classifyStorageItem(
    key: string,
    value: string,
    location: 'localStorage' | 'sessionStorage' | 'indexedDB'
  ): { isSuspect: boolean; suspectReason?: string; category: StorageItem['category'] } {
    const keyLower = key.toLowerCase();
    const valLower = value.toLowerCase();

    const isIntentions = keyLower.includes('intentions') || valLower.includes('intentions') || valLower.includes('"intentions"');
    const isAttendance = keyLower.includes('attendance') || valLower.includes('attendance') || valLower.includes('"attendance"');

    if (isIntentions) {
      return {
        isSuspect: true,
        suspectReason: 'Contém chaves/dados da Lista de Intenções (intentions)',
        category: 'intentions'
      };
    }

    if (isAttendance) {
      return {
        isSuspect: true,
        suspectReason: 'Contém chaves/dados de Lista de Presença (attendance)',
        category: 'attendance'
      };
    }

    if (keyLower.includes('version') || keyLower.includes('app_version') || keyLower.includes('force_update')) {
      return {
        isSuspect: false,
        category: 'version'
      };
    }

    if (keyLower.includes('cache') || keyLower.includes('firestore') || keyLower.includes('spikegen')) {
      return {
        isSuspect: keyLower.includes('intentions') || keyLower.includes('attendance'),
        suspectReason: 'Chave de cache interno do Firestore/App',
        category: 'cache'
      };
    }

    return {
      isSuspect: false,
      category: 'other'
    };
  }

  /**
   * Inspeciona LocalStorage
   */
  public scanLocalStorage(): StorageItem[] {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const items: StorageItem[] = [];

    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      const value = window.localStorage.getItem(key) || '';
      const sizeBytes = (key.length + value.length) * 2;
      const { isSuspect, suspectReason, category } = this.classifyStorageItem(key, value, 'localStorage');

      let valueSummary = value;
      if (valueSummary.length > 100) {
        valueSummary = `${valueSummary.slice(0, 97)}...`;
      }

      items.push({
        id: `ls_${key}`,
        location: 'localStorage',
        key,
        valueSummary,
        fullValue: value,
        sizeBytes,
        isSuspect,
        suspectReason,
        category
      });
    }

    return items.sort((a, b) => (b.isSuspect ? 1 : 0) - (a.isSuspect ? 1 : 0) || b.sizeBytes - a.sizeBytes);
  }

  /**
   * Inspeciona SessionStorage
   */
  public scanSessionStorage(): StorageItem[] {
    if (typeof window === 'undefined' || !window.sessionStorage) return [];
    const items: StorageItem[] = [];

    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i);
      if (!key) continue;
      const value = window.sessionStorage.getItem(key) || '';
      const sizeBytes = (key.length + value.length) * 2;
      const { isSuspect, suspectReason, category } = this.classifyStorageItem(key, value, 'sessionStorage');

      let valueSummary = value;
      if (valueSummary.length > 100) {
        valueSummary = `${valueSummary.slice(0, 97)}...`;
      }

      items.push({
        id: `ss_${key}`,
        location: 'sessionStorage',
        key,
        valueSummary,
        fullValue: value,
        sizeBytes,
        isSuspect,
        suspectReason,
        category
      });
    }

    return items.sort((a, b) => (b.isSuspect ? 1 : 0) - (a.isSuspect ? 1 : 0) || b.sizeBytes - a.sizeBytes);
  }

  /**
   * Inspeciona o IndexedDB procurando especificamente pelas bases do Firestore / volleyclub-manager
   */
  public async scanIndexedDB(): Promise<IndexedDBDatabaseInfo[]> {
    if (typeof window === 'undefined' || !window.indexedDB) return [];

    let dbInfos: { name: string; version?: number }[] = [];

    // Tenta listar bases usando indexedDB.databases() se suportado
    if (typeof window.indexedDB.databases === 'function') {
      try {
        const dbs = await window.indexedDB.databases();
        dbInfos = dbs
          .filter(d => d.name)
          .map(d => ({ name: d.name!, version: d.version }));
      } catch (e) {
        console.warn('[StorageInspector] indexedDB.databases() falhou:', e);
      }
    }

    // Candidatos padrão de nomes de banco do Firestore para volleyclub-manager
    const knownCandidates = [
      'firestore/[DEFAULT]/volleyclub-manager/main',
      'firestore/(default)/volleyclub-manager/main',
      'firestore/[DEFAULT]/[DEFAULT]/main',
      'firestore/(default)/(default)/main',
      'volleyclub-manager',
      'firebaseLocalStorageDb',
      'firebase-heartbeat-database'
    ];

    knownCandidates.forEach(cand => {
      if (!dbInfos.some(d => d.name === cand)) {
        dbInfos.push({ name: cand });
      }
    });

    const results: IndexedDBDatabaseInfo[] = [];

    for (const dbInfo of dbInfos) {
      try {
        const dbResult = await this.inspectSingleIndexedDB(dbInfo.name, dbInfo.version);
        if (dbResult && (dbResult.stores.length > 0 || dbResult.totalSuspects > 0)) {
          results.push(dbResult);
        }
      } catch (err) {
        // Ignora erros ao tentar abrir bancos inexistentes
      }
    }

    return results;
  }

  /**
   * Inspeciona uma única base IndexedDB
   */
  private inspectSingleIndexedDB(dbName: string, expectedVersion?: number): Promise<IndexedDBDatabaseInfo | null> {
    return new Promise((resolve) => {
      let openReq: IDBOpenDBRequest;
      try {
        openReq = expectedVersion ? window.indexedDB.open(dbName, expectedVersion) : window.indexedDB.open(dbName);
      } catch {
        return resolve(null);
      }

      openReq.onerror = () => resolve(null);
      openReq.onsuccess = async (event) => {
        const idb = (event.target as IDBOpenDBRequest).result;
        const storeNames = Array.from(idb.objectStoreNames);

        if (storeNames.length === 0) {
          idb.close();
          return resolve(null);
        }

        const storesInfo: IndexedDBStoreInfo[] = [];
        let totalSuspectsInDb = 0;

        for (const storeName of storeNames) {
          try {
            const storeResult = await this.inspectSingleObjectStore(idb, dbName, storeName);
            if (storeResult) {
              storesInfo.push(storeResult);
              totalSuspectsInDb += storeResult.suspectCount;
            }
          } catch {
            // Ignora erro em store individual
          }
        }

        idb.close();
        resolve({
          dbName,
          version: idb.version,
          stores: storesInfo,
          totalSuspects: totalSuspectsInDb
        });
      };
    });
  }

  /**
   * Inspeciona uma ObjectStore individual do IndexedDB
   */
  private inspectSingleObjectStore(
    idb: IDBDatabase,
    dbName: string,
    storeName: string
  ): Promise<IndexedDBStoreInfo | null> {
    return new Promise((resolve) => {
      try {
        const tx = idb.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);

        const countReq = store.count();
        countReq.onsuccess = () => {
          const recordCount = countReq.result || 0;
          if (recordCount === 0) {
            return resolve({
              storeName,
              recordCount: 0,
              suspectCount: 0,
              items: []
            });
          }

          // Amostra de até 150 registros
          const items: StorageItem[] = [];
          let suspectCount = 0;

          const cursorReq = store.openCursor();
          let scanned = 0;

          cursorReq.onsuccess = (e) => {
            const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor && scanned < 150) {
              scanned++;
              const rawKey = String(cursor.key);
              let valStr = '';
              try {
                valStr = typeof cursor.value === 'object' ? JSON.stringify(cursor.value) : String(cursor.value);
              } catch {
                valStr = '[Object Unserializable]';
              }

              const { isSuspect, suspectReason, category } = this.classifyStorageItem(rawKey, valStr, 'indexedDB');

              let valueSummary = valStr;
              if (valueSummary.length > 100) {
                valueSummary = `${valueSummary.slice(0, 97)}...`;
              }

              if (isSuspect) {
                suspectCount++;
              }

              // Adicionar item se for suspeito ou se amostragem total for pequena
              if (isSuspect || items.length < 20) {
                items.push({
                  id: `idb_${dbName}_${storeName}_${scanned}_${rawKey}`,
                  location: 'indexedDB',
                  key: rawKey,
                  valueSummary,
                  fullValue: valStr,
                  sizeBytes: (rawKey.length + valStr.length) * 2,
                  dbName,
                  storeName,
                  isSuspect,
                  suspectReason,
                  category
                });
              }

              cursor.continue();
            } else {
              resolve({
                storeName,
                recordCount,
                suspectCount,
                items
              });
            }
          };

          cursorReq.onerror = () => {
            resolve({
              storeName,
              recordCount,
              suspectCount: 0,
              items: []
            });
          };
        };

        countReq.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * Executa uma varredura completa em todas as camadas de armazenamento local
   */
  public async performFullScan(): Promise<StorageScanResult> {
    const lsItems = this.scanLocalStorage();
    const ssItems = this.scanSessionStorage();
    const idbDbs = await this.scanIndexedDB();

    let totalSizeBytes = 0;
    let totalSuspectCount = 0;

    lsItems.forEach(i => {
      totalSizeBytes += i.sizeBytes;
      if (i.isSuspect) totalSuspectCount++;
    });

    ssItems.forEach(i => {
      totalSizeBytes += i.sizeBytes;
      if (i.isSuspect) totalSuspectCount++;
    });

    idbDbs.forEach(db => {
      totalSuspectCount += db.totalSuspects;
      db.stores.forEach(s => {
        s.items.forEach(i => {
          totalSizeBytes += i.sizeBytes;
        });
      });
    });

    return {
      localStorageItems: lsItems,
      sessionStorageItems: ssItems,
      indexedDBDatabases: idbDbs,
      totalSizeBytes,
      totalSuspectCount,
      scanTimestamp: Date.now()
    };
  }

  /**
   * Exclui uma chave individual do LocalStorage ou SessionStorage
   */
  public deleteStorageItem(item: StorageItem): boolean {
    if (typeof window === 'undefined') return false;

    if (item.location === 'localStorage' && window.localStorage) {
      window.localStorage.removeItem(item.key);
      return true;
    }

    if (item.location === 'sessionStorage' && window.sessionStorage) {
      window.sessionStorage.removeItem(item.key);
      return true;
    }

    return false;
  }

  /**
   * Expurga todas as chaves de 'intentions' e 'attendance' do LocalStorage, SessionStorage e IndexedDB
   */
  public async purgeAllStaleKeys(): Promise<{ purgedLs: number; purgedSs: number; purgedIdb: number }> {
    let purgedLs = 0;
    let purgedSs = 0;
    let purgedIdb = 0;

    // 1. LocalStorage
    if (typeof window !== 'undefined' && window.localStorage) {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && (k.toLowerCase().includes('intentions') || k.toLowerCase().includes('attendance'))) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => {
        window.localStorage.removeItem(k);
        purgedLs++;
      });
    }

    // 2. SessionStorage
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const k = window.sessionStorage.key(i);
        if (k && (k.toLowerCase().includes('intentions') || k.toLowerCase().includes('attendance'))) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => {
        window.sessionStorage.removeItem(k);
        purgedSs++;
      });
    }

    // 3. IndexedDB
    const dbs = await this.scanIndexedDB();
    for (const dbInfo of dbs) {
      for (const storeInfo of dbInfo.stores) {
        if (storeInfo.suspectCount > 0) {
          try {
            await this.deleteSuspectsFromObjectStore(dbInfo.dbName, storeInfo.storeName);
            purgedIdb += storeInfo.suspectCount;
          } catch (e) {
            console.warn(`[StorageInspector] Erro ao expurgar store ${storeInfo.storeName} em ${dbInfo.dbName}:`, e);
          }
        }
      }
    }

    return { purgedLs, purgedSs, purgedIdb };
  }

  /**
   * Deleta registros suspeitos de uma ObjectStore do IndexedDB
   */
  private deleteSuspectsFromObjectStore(dbName: string, storeName: string): Promise<number> {
    return new Promise((resolve) => {
      const openReq = window.indexedDB.open(dbName);
      openReq.onerror = () => resolve(0);
      openReq.onsuccess = (e) => {
        const idb = (e.target as IDBOpenDBRequest).result;
        try {
          const tx = idb.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);
          const cursorReq = store.openCursor();
          let count = 0;

          cursorReq.onsuccess = (ev) => {
            const cursor = (ev.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
              const keyStr = String(cursor.key).toLowerCase();
              let valStr = '';
              try { valStr = JSON.stringify(cursor.value).toLowerCase(); } catch { valStr = ''; }

              if (keyStr.includes('intentions') || keyStr.includes('attendance') || valStr.includes('intentions') || valStr.includes('attendance')) {
                cursor.delete();
                count++;
              }
              cursor.continue();
            } else {
              idb.close();
              resolve(count);
            }
          };

          cursorReq.onerror = () => {
            idb.close();
            resolve(0);
          };
        } catch {
          idb.close();
          resolve(0);
        }
      };
    });
  }
}

export const storageInspectorService = new StorageInspectorService();
