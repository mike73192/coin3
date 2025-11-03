import { appConfig } from '@/services/AppConfig';

const STORAGE_KEY = 'coin3-debug-log';
const MAX_LOG_ENTRIES = appConfig.logging.maxEntries;

function isLocalStorageAvailable(): boolean {
  try {
    if (typeof localStorage === 'undefined') {
      return false;
    }
    const testKey = '__debug_test__';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

export class DebugLogger {
  private logs: string[] = [];

  private readonly storageEnabled = isLocalStorageAvailable();
  private readonly consoleEnabled = appConfig.logging.consoleEnabled || import.meta.env.DEV;

  constructor() {
    this.logs = this.load();
    if (this.logs.length > 0) {
      this.writeToConsole('Debug logger restored from storage.', { entries: this.logs.length });
    }
  }

  log(message: string, data?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const serialized = data ? `${timestamp} ${message} ${JSON.stringify(data)}` : `${timestamp} ${message}`;
    this.logs.push(serialized);
    if (this.logs.length > MAX_LOG_ENTRIES) {
      this.logs.splice(0, this.logs.length - MAX_LOG_ENTRIES);
    }
    this.persist();
    this.writeToConsole(message, data);
  }

  getSnapshot(): string {
    return this.logs.join('\n');
  }

  download(filename = 'coin-debug-log.txt'): void {
    const blob = new Blob([this.getSnapshot()], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    this.writeToConsole('Debug log downloaded.', { filename, entries: this.logs.length });
  }

  clear(): void {
    this.logs = [];
    this.persist();
    this.writeToConsole('Debug log cleared.');
  }

  private persist(): void {
    if (!this.storageEnabled) {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, this.getSnapshot());
    } catch (error) {
      console.warn('Failed to persist debug log', error);
    }
  }

  private load(): string[] {
    if (!this.storageEnabled) {
      return [];
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }
      return raw.split('\n').filter((line) => line.trim().length > 0);
    } catch (error) {
      console.warn('Failed to restore debug log', error);
      return [];
    }
  }

  private writeToConsole(message: string, data?: Record<string, unknown>): void {
    if (this.consoleEnabled) {
      if (data) {
        console.debug(`[DebugLogger] ${message}`, data);
      } else {
        console.debug(`[DebugLogger] ${message}`);
      }
    }
  }
}

export const debugLogger = new DebugLogger();
