import type { ArchiveEntry, RecordedTask } from '@/models/archive';
import { appConfig } from '@/services/AppConfig';
import type { UserSettings } from '@/services/UserSettings';

export interface RemoteGameStatePayload {
  coins: number;
  tasks: RecordedTask[];
  pendingTitle: string | null;
  updatedAt?: string | null;
}

export interface RemoteArchivesPayload {
  entries: ArchiveEntry[];
  updatedAt?: string | null;
}

export interface RemoteSettingsPayload {
  settings: UserSettings;
  updatedAt?: string | null;
}

type Listener<T> = (payload: T) => void;

const MIN_POLL_INTERVAL = 5000;

export class SyncService {
  private readonly config = appConfig.remoteStorage;
  private enabled: boolean;

  private stateListeners = new Set<Listener<RemoteGameStatePayload>>();
  private archivesListeners = new Set<Listener<RemoteArchivesPayload>>();
  private settingsListeners = new Set<Listener<RemoteSettingsPayload>>();

  private lastStateVersion: string | null = null;
  private lastArchivesVersion: string | null = null;
  private lastSettingsVersion: string | null = null;

  private cachedState: RemoteGameStatePayload | null = null;
  private cachedArchives: RemoteArchivesPayload | null = null;
  private cachedSettings: RemoteSettingsPayload | null = null;

  constructor() {
    this.enabled = this.config.enabled && typeof fetch === 'function';

    if (!this.enabled) {
      return;
    }

    void this.pullAll();

    const interval = Math.max(MIN_POLL_INTERVAL, this.config.pollIntervalMs);
    if (typeof window !== 'undefined' && typeof window.setInterval === 'function') {
      window.setInterval(() => {
        void this.pullAll();
      }, interval);
    } else {
      setInterval(() => {
        void this.pullAll();
      }, interval);
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  onStateUpdate(listener: Listener<RemoteGameStatePayload>): () => void {
    if (!this.enabled) {
      return () => {};
    }

    this.stateListeners.add(listener);
    if (this.cachedState) {
      listener(this.cloneStatePayload(this.cachedState));
    }

    return () => {
      this.stateListeners.delete(listener);
    };
  }

  onArchivesUpdate(listener: Listener<RemoteArchivesPayload>): () => void {
    if (!this.enabled) {
      return () => {};
    }

    this.archivesListeners.add(listener);
    if (this.cachedArchives) {
      listener(this.cloneArchivesPayload(this.cachedArchives));
    }

    return () => {
      this.archivesListeners.delete(listener);
    };
  }

  onSettingsUpdate(listener: Listener<RemoteSettingsPayload>): () => void {
    if (!this.enabled) {
      return () => {};
    }

    this.settingsListeners.add(listener);
    if (this.cachedSettings) {
      listener(this.cloneSettingsPayload(this.cachedSettings));
    }

    return () => {
      this.settingsListeners.delete(listener);
    };
  }

  async pushState(payload: RemoteGameStatePayload): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const normalized = this.prepareStatePayload(payload);
    await this.put('state', normalized);
    this.lastStateVersion = normalized.updatedAt ?? null;
    this.cachedState = normalized;
  }

  async pushArchives(payload: RemoteArchivesPayload): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const normalized = this.prepareArchivesPayload(payload);
    await this.put('archives', normalized);
    this.lastArchivesVersion = normalized.updatedAt ?? null;
    this.cachedArchives = normalized;
  }

  async pushSettings(payload: RemoteSettingsPayload): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const normalized = this.prepareSettingsPayload(payload);
    await this.put('settings', normalized);
    this.lastSettingsVersion = normalized.updatedAt ?? null;
    this.cachedSettings = normalized;
  }

  requestImmediatePull(): void {
    if (!this.enabled) {
      return;
    }

    void this.pullAll();
  }

  private async pullAll(): Promise<void> {
    await Promise.all([this.pullState(), this.pullArchives(), this.pullSettings()]);
  }

  private async pullState(): Promise<void> {
    const payload = await this.get<RemoteGameStatePayload>('state');
    if (!payload) {
      return;
    }

    const normalized = this.prepareStatePayload(payload);
    if (!this.isIncomingNewer(normalized.updatedAt ?? null, this.lastStateVersion)) {
      return;
    }

    this.lastStateVersion = normalized.updatedAt ?? null;
    this.cachedState = normalized;
    this.stateListeners.forEach((listener) => listener(this.cloneStatePayload(normalized)));
  }

  private async pullArchives(): Promise<void> {
    const payload = await this.get<RemoteArchivesPayload>('archives');
    if (!payload) {
      return;
    }

    const normalized = this.prepareArchivesPayload(payload);
    if (!this.isIncomingNewer(normalized.updatedAt ?? null, this.lastArchivesVersion)) {
      return;
    }

    this.lastArchivesVersion = normalized.updatedAt ?? null;
    this.cachedArchives = normalized;
    this.archivesListeners.forEach((listener) => listener(this.cloneArchivesPayload(normalized)));
  }

  private async pullSettings(): Promise<void> {
    const payload = await this.get<RemoteSettingsPayload>('settings');
    if (!payload) {
      return;
    }

    const normalized = this.prepareSettingsPayload(payload);
    if (!this.isIncomingNewer(normalized.updatedAt ?? null, this.lastSettingsVersion)) {
      return;
    }

    this.lastSettingsVersion = normalized.updatedAt ?? null;
    this.cachedSettings = normalized;
    this.settingsListeners.forEach((listener) => listener(this.cloneSettingsPayload(normalized)));
  }

  private async get<T>(resource: string): Promise<T | null> {
    try {
      const response = await fetch(this.buildUrl(resource), {
        method: 'GET',
        headers: this.buildHeaders(false)
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`GET ${resource} failed with status ${response.status}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      console.warn('[SyncService] Failed to fetch remote resource:', resource, error);
      return null;
    }
  }

  private async put(resource: string, body: unknown): Promise<void> {
    try {
      const response = await fetch(this.buildUrl(resource), {
        method: 'PUT',
        headers: this.buildHeaders(true),
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`PUT ${resource} failed with status ${response.status}`);
      }
    } catch (error) {
      console.warn('[SyncService] Failed to push remote resource:', resource, error);
    }
  }

  private buildUrl(resource: string): string {
    const base = this.config.baseUrl.replace(/\/$/, '');
    const encodedRoom = encodeURIComponent(this.config.roomCode);
    return `${base}/rooms/${encodedRoom}/${resource}`;
  }

  private buildHeaders(includeJson: boolean): HeadersInit {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (includeJson) {
      headers['Content-Type'] = 'application/json';
    }
    if (this.config.authToken) {
      headers.Authorization = `Bearer ${this.config.authToken}`;
    }
    return headers;
  }

  private prepareStatePayload(payload: RemoteGameStatePayload): RemoteGameStatePayload {
    const normalizedTasks = Array.isArray(payload.tasks)
      ? payload.tasks.map((task) => ({
          title: task?.title ?? '',
          detail: typeof task?.detail === 'string' ? task.detail : null
        }))
      : [];

    return {
      coins: typeof payload.coins === 'number' ? payload.coins : 0,
      tasks: normalizedTasks,
      pendingTitle: typeof payload.pendingTitle === 'string' ? payload.pendingTitle : null,
      updatedAt: this.normalizeTimestamp(payload.updatedAt)
    };
  }

  private prepareArchivesPayload(payload: RemoteArchivesPayload): RemoteArchivesPayload {
    const entries = Array.isArray(payload.entries)
      ? payload.entries.map((entry) => ({
          id: entry?.id ?? '',
          title: entry?.title ?? '',
          coins: typeof entry?.coins === 'number' ? entry.coins : 0,
          createdAt: typeof entry?.createdAt === 'string' ? entry.createdAt : new Date().toISOString(),
          thumbnailUrl: typeof entry?.thumbnailUrl === 'string' ? entry.thumbnailUrl : '/default-thumb.svg',
          tasks: Array.isArray(entry?.tasks)
            ? entry.tasks.map((task) => ({
                title: task?.title ?? '',
                detail: typeof task?.detail === 'string' ? task.detail : null
              }))
            : []
        }))
      : [];

    return {
      entries,
      updatedAt: this.normalizeTimestamp(payload.updatedAt)
    };
  }

  private prepareSettingsPayload(payload: RemoteSettingsPayload): RemoteSettingsPayload {
    return {
      settings: { ...payload.settings },
      updatedAt: this.normalizeTimestamp(payload.updatedAt)
    };
  }

  private cloneStatePayload(payload: RemoteGameStatePayload): RemoteGameStatePayload {
    return {
      coins: payload.coins,
      tasks: payload.tasks.map((task) => ({ ...task })),
      pendingTitle: payload.pendingTitle,
      updatedAt: payload.updatedAt
    };
  }

  private cloneArchivesPayload(payload: RemoteArchivesPayload): RemoteArchivesPayload {
    return {
      entries: payload.entries.map((entry) => ({
        ...entry,
        tasks: entry.tasks.map((task) => ({ ...task }))
      })),
      updatedAt: payload.updatedAt
    };
  }

  private cloneSettingsPayload(payload: RemoteSettingsPayload): RemoteSettingsPayload {
    return {
      settings: { ...payload.settings },
      updatedAt: payload.updatedAt
    };
  }

  private normalizeTimestamp(value: string | null | undefined): string {
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) {
        return new Date(parsed).toISOString();
      }
    }
    return new Date().toISOString();
  }

  private isIncomingNewer(incoming: string | null, current: string | null): boolean {
    const incomingTime = this.parseTimestamp(incoming);
    const currentTime = this.parseTimestamp(current);
    return incomingTime > currentTime;
  }

  private parseTimestamp(value: string | null): number {
    if (!value) {
      return 0;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}

export const syncService = new SyncService();
