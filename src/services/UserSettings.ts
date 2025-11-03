import Phaser from 'phaser';

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
  jarCapacity: 100,
  dropInterval: 90,
  coinBounciness: 0.12,
  coinFriction: 0.45,
  coinStaticFriction: 0.9
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

  constructor() {
    this.settings = this.loadSettings();
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
      this.persistSettings();
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

  private loadSettings(): UserSettings {
    if (typeof localStorage === 'undefined') {
      return { ...DEFAULT_SETTINGS };
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return { ...DEFAULT_SETTINGS };
      }
      const parsed = JSON.parse(raw) as Partial<UserSettings>;
      return sanitizeSettings({ ...DEFAULT_SETTINGS, ...parsed });
    } catch (error) {
      console.warn('Failed to load user settings', error);
      return { ...DEFAULT_SETTINGS };
    }
  }

  private persistSettings(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch (error) {
      console.warn('Failed to store user settings', error);
    }
  }
}

export const userSettings = new UserSettingsManager();
