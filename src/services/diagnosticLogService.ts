
export interface DiagnosticLogEntry {
  timestamp: number;
  type: 'info' | 'warn' | 'error' | 'version_check' | 'update_attempt';
  message: string;
  details?: any;
}

const MAX_LOGS = 50;
const STORAGE_KEY = 'guerreiros_diagnostic_logs';

class DiagnosticLogService {
  private logs: DiagnosticLogEntry[] = [];

  constructor() {
    this.loadLogs();
  }

  private loadLogs() {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.logs = JSON.parse(stored);
      }
    } catch (e) {
      console.error('[DiagnosticLog] Failed to load logs:', e);
      this.logs = [];
    }
  }

  private saveLogs() {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.logs));
    } catch (e) {
      console.error('[DiagnosticLog] Failed to save logs:', e);
    }
  }

  public log(type: DiagnosticLogEntry['type'], message: string, details?: any) {
    const entry: DiagnosticLogEntry = {
      timestamp: Date.now(),
      type,
      message,
      details
    };

    console.log(`[Diagnostic][${type}] ${message}`, details || '');
    
    this.logs.unshift(entry);
    if (this.logs.length > MAX_LOGS) {
      this.logs = this.logs.slice(0, MAX_LOGS);
    }
    this.saveLogs();
  }

  public getLogs(): DiagnosticLogEntry[] {
    return [...this.logs];
  }

  public clearLogs() {
    this.logs = [];
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
}

export const diagnosticLogService = new DiagnosticLogService();
