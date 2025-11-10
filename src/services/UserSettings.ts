import Phaser from 'phaser';
import { appConfig } from '@/services/AppConfig';
import { syncService, type RemoteSettingsPayload } from '@/services/SyncService';

export interface UserSettings {
  jarCapacity: number;
  dropInterval: number;
  coinBounciness: number;
  coinFriction: number;
  coinStaticFriction: number;
}

type SettingsListener = (settings: UserSettings) => void;

const STORAGE_KEY = 'coin3-settings';

const DEFAULT_SETTINGS: UserSettings = {
  jarCapacity: appConfig.coins.jarCapacity,
  dropInterval: appConfig.coins.spawnIntervalMs,
  coinBounciness: appConfig.coins.coinBounciness,
  coinFriction: appConfig.coins.coinFriction,
  coinStaticFriction: appConfig.coins.coinStaticFriction
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const sanitizeSettings = (raw: Partial<UserSettings>): UserSettings => {
  const safeCapacity = Number.isFinite(raw.jarCapacity) ? Math.round(raw.jarCapacity ?? DEFAULT_SETTINGS.jarCapacity) : raw.jarCapacity;
  const safeInterval = Number.isFinite(raw.dropInterval) ? Math.round(raw.dropInterval ?? DEFAULT_SETTINGS.dropInterval) : raw.dropInterval;
  const safeBounce = Number.isFinite(raw.coinBounciness) ? Number(raw.coinBounciness) : raw.coinBounciness;
  const safeFriction = Number.isFinite(raw.coinFriction) ? Number(raw.coinFriction) : raw.coinFriction;
  const safeStatic = Number.isFinite(raw.coinStaticFriction) ? Number(raw.coinStaticFriction) : raw.coinStaticFriction;

  return {
    jarCapacity: clamp(safeCapacity ?? DEFAULT_SETTINGS.jarCapacity, 20, 500),
    dropInterval: clamp(safeInterval ?? DEFAULT_SETTINGS.dropInterval, 30, 400),
    coinBounciness: clamp(safeBounce ?? DEFAULT_SETTINGS.coinBounciness, 0, 0.8),
    coinFriction: clamp(safeFriction ?? DEFAULT_SETTINGS.coinFriction, 0, 1),
    coinStaticFriction: clamp(safeStatic ?? DEFAULT_SETTINGS.coinStaticFriction, 0, 1)
  };
};

class UserSettingsManager {
  private settings: UserSettings;
  private emitter = new Phaser.Events.EventEmitter();
  private version: string | null = null;

  constructor() {
    const loaded = this.loadSettings();
    this.settings = loaded.settings;
    this.version = loaded.updatedAt;

    if (syncService.isEnabled()) {
      syncService.onSettingsUpdate((payload) => this.applyRemoteSettings(payload));
      syncService.requestImmediatePull();
    }
  }

  getSettings(): UserSettings {
    return { ...this.settings };
  }

  onChange(listener: SettingsListener): void {
    this.emitter.on('changed', listener);
  }

  offChange(listener: SettingsListener): void {
    this.emitter.off('changed', listener);
  }

  updateSettings(update: Partial<UserSettings>): UserSettings {
    const merged = sanitizeSettings({ ...this.settings, ...update });
    if (!this.equals(this.settings, merged)) {
      this.settings = merged;
      this.persistSettings('local');
      this.emitter.emit('changed', this.getSettings());
    }
    return this.getSettings();
  }

  private equals(a: UserSettings, b: UserSettings): boolean {
    return (
      a.jarCapacity === b.jarCapacity &&
      a.dropInterval === b.dropInterval &&
      Math.abs(a.coinBounciness - b.coinBounciness) < 0.0001 &&
      Math.abs(a.coinFriction - b.coinFriction) < 0.0001 &&
      Math.abs(a.coinStaticFriction - b.coinStaticFriction) < 0.0001
    );
  }

  private loadSettings(): { settings: UserSettings; updatedAt: string | null } {
    const fallback = { settings: { ...DEFAULT_SETTINGS }, updatedAt: null as string | null };
    if (typeof localStorage === 'undefined') {
      return fallback;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return fallback;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && 'settings' in (parsed as Record<string, unknown>)) {
        const container = parsed as { settings?: unknown; updatedAt?: unknown };
        const settingsRaw =
          container.settings && typeof container.settings === 'object'
            ? (container.settings as Partial<UserSettings>)
            : {};
        const sanitized = sanitizeSettings({ ...DEFAULT_SETTINGS, ...settingsRaw });
        const updatedAt = typeof container.updatedAt === 'string' ? container.updatedAt : null;
        return { settings: sanitized, updatedAt };
      }
      const legacy = sanitizeSettings({ ...DEFAULT_SETTINGS, ...(parsed as Partial<UserSettings>) });
      return { settings: legacy, updatedAt: null };
    } catch (error) {
      console.warn('Failed to load user settings', error);
      return fallback;
    }
  }

  private persistSettings(source: 'local' | 'remote' = 'local'): void {
    if (source === 'local') {
      this.version = new Date().toISOString();
    }

    const payload = {
      settings: { ...this.settings },
      updatedAt: this.version ?? undefined
    };

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch (error) {
        console.warn('Failed to store user settings', error);
      }
    }

    if (source === 'local' && syncService.isEnabled()) {
      void syncService.pushSettings(payload);
    }
  }

  private applyRemoteSettings(payload: RemoteSettingsPayload): void {
    const incomingVersion = this.parseTimestamp(payload.updatedAt);
    const currentVersion = this.parseTimestamp(this.version);
    if (incomingVersion <= currentVersion) {
      return;
    }

    const sanitized = sanitizeSettings({ ...DEFAULT_SETTINGS, ...payload.settings });
    if (this.equals(this.settings, sanitized)) {
      this.version = payload.updatedAt ?? new Date().toISOString();
      this.persistSettings('remote');
      return;
    }

    this.settings = sanitized;
    this.version = payload.updatedAt ?? new Date().toISOString();
    this.persistSettings('remote');
    this.emitter.emit('changed', this.getSettings());
  }

  private parseTimestamp(value: string | null | undefined): number {
    if (!value) {
      return 0;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}

export const userSettings = new UserSettingsManager();
