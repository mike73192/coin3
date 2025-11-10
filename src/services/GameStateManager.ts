import Phaser from 'phaser';
import type { ArchiveEntry, RecordedTask } from '@/models/archive';
import { debugLogger } from '@/services/DebugLogger';
import { userSettings } from '@/services/UserSettings';
import { appConfig } from '@/services/AppConfig';
import { syncService, type RemoteArchivesPayload, type RemoteGameStatePayload } from '@/services/SyncService';

const STORAGE_KEY = 'coin3-archives';
const STATE_STORAGE_KEY = 'coin3-current-state';

export interface GameStateEvents {
  coinsChanged: (count: number) => void;
  jarFilled: (entry: ArchiveEntry, overflow: number) => void;
  archivesUpdated: (entries: ArchiveEntry[]) => void;
  capacityChanged: (capacity: number) => void;
  totalsChanged: (totals: { coins: number; tasks: number }) => void;
}

type EventKey = keyof GameStateEvents;

export class GameStateManager {
  private coins = 0;
  private archives: ArchiveEntry[] = [];
  private emitter = new Phaser.Events.EventEmitter();
  private pendingArchiveTitle: string | null = null;
  private currentTasks: RecordedTask[] = [];
  private stateVersion: string | null = null;
  private archivesVersion: string | null = null;

  constructor(private capacity = appConfig.coins.jarCapacity) {
    this.capacity = Math.max(20, Math.min(500, Math.round(this.capacity)));
    const archivesData = this.loadArchives();
    this.archives = archivesData.entries;
    this.archivesVersion = archivesData.updatedAt;
    const state = this.loadState();
    this.coins = state.coins;
    this.currentTasks = state.tasks;
    this.pendingArchiveTitle = state.pendingTitle;
    this.stateVersion = state.updatedAt;

    if (syncService.isEnabled()) {
      syncService.onStateUpdate((payload) => this.applyRemoteState(payload));
      syncService.onArchivesUpdate((payload) => this.applyRemoteArchives(payload));
      syncService.requestImmediatePull();
    }
  }

  on<E extends EventKey>(event: E, handler: GameStateEvents[E]): void {
    this.emitter.on(event, handler as (...args: unknown[]) => void);
  }

  off<E extends EventKey>(event: E, handler: GameStateEvents[E]): void {
    this.emitter.off(event, handler as (...args: unknown[]) => void);
  }

  getCoinCount(): number {
    return this.coins;
  }

  getCapacity(): number {
    return this.capacity;
  }

  setCapacity(value: number): void {
    const normalized = Math.max(20, Math.min(500, Math.round(value)));
    if (normalized === this.capacity) {
      return;
    }
    this.capacity = normalized;
    if (this.coins > this.capacity) {
      this.coins = this.capacity;
      this.emitter.emit('coinsChanged', this.coins);
    }
    this.emitter.emit('capacityChanged', this.capacity);
    debugLogger.log('Capacity updated.', { capacity: this.capacity });
    this.emitTotals();
    this.persistState();
  }

  getArchives(): ArchiveEntry[] {
    return [...this.archives];
  }

  getTotalCoins(): number {
    return this.archives.reduce((sum, entry) => sum + entry.coins, this.coins);
  }

  getTotalTasks(): number {
    const archivedTasks = this.archives.reduce((sum, entry) => sum + entry.tasks.length, 0);
    return archivedTasks + this.currentTasks.length;
  }

  setPendingTitle(title: string | null): void {
    this.pendingArchiveTitle = title;
    this.persistState();
  }

  registerTask(task: RecordedTask): void {
    const normalized = this.normalizeTask(task);

    if (!normalized) {
      return;
    }

    this.currentTasks.push(normalized);
    debugLogger.log('Task registered for current jar.', { title: normalized.title });
    this.emitTotals();
    this.persistState();
  }

  addCoins(amount: number): { added: number; overflow: number; jarFilled: boolean } {
    if (amount <= 0) {
      debugLogger.log('Ignored non-positive coin addition.', { amount });
      return { added: 0, overflow: 0, jarFilled: false };
    }

    const space = Math.max(0, this.capacity - this.coins);
    const added = Math.min(space, amount);
    const overflow = Math.max(0, amount - added);

    const wasAtCapacity = this.coins >= this.capacity;
    this.coins += added;
    this.emitter.emit('coinsChanged', this.coins);
    debugLogger.log('Coins added to jar.', { amount, added, overflow, total: this.coins });
    this.emitTotals();
    this.persistState();

    const overflowedWithOutdatedCapacity = wasAtCapacity && this.coins > this.capacity && added === 0;

    if (this.coins >= this.capacity && !overflowedWithOutdatedCapacity) {
      const entry = this.createArchiveEntry();
      this.archives = [entry, ...this.archives];
      this.persistArchives();
      debugLogger.log('Jar filled. Archive entry created.', {
        entry: {
          id: entry.id,
          title: entry.title,
          createdAt: entry.createdAt
        },
        overflow
      });
      this.emitter.emit('jarFilled', entry, overflow);
      this.emitter.emit('archivesUpdated', this.getArchives());
      this.currentTasks = [];
      this.resetCoins(0);
      return { added, overflow, jarFilled: true };
    }

    return { added, overflow, jarFilled: false };
  }

  resetCoins(initial = 0): void {
    this.coins = Math.max(0, Math.min(initial, this.capacity));
    this.emitter.emit('coinsChanged', this.coins);
    debugLogger.log('Coin count reset.', { value: this.coins });
    this.emitTotals();
    this.persistState();
  }

  private createArchiveEntry(): ArchiveEntry {
    const now = new Date();
    const title = this.pendingArchiveTitle?.trim() || `${now.toLocaleDateString('ja-JP')}の成果`;
    this.pendingArchiveTitle = null;
    debugLogger.log('Preparing archive entry.', { title });
    return {
      id: `${now.getTime()}`,
      title,
      coins: this.capacity,
      createdAt: now.toISOString(),
      thumbnailUrl: this.generateThumbnail(title, now),
      tasks: this.currentTasks.map((task) => ({
        title: task.title,
        detail: typeof task.detail === 'string' ? task.detail : task.detail ?? null
      }))
    };
  }

  private loadArchives(): { entries: ArchiveEntry[]; updatedAt: string | null } {
    const fallback = { entries: [] as ArchiveEntry[], updatedAt: null as string | null };
    if (typeof localStorage === 'undefined') {
      return fallback;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as unknown;

      if (Array.isArray(parsed)) {
        const entries = parsed
          .map((entry) => this.normalizeArchiveEntry(entry))
          .filter((entry): entry is ArchiveEntry => entry !== null);
        return { entries, updatedAt: null };
      }

      if (parsed && typeof parsed === 'object') {
        const container = parsed as { entries?: unknown; updatedAt?: unknown };
        const entriesSource = Array.isArray(container.entries) ? container.entries : [];
        const entries = entriesSource
          .map((entry) => this.normalizeArchiveEntry(entry))
          .filter((entry): entry is ArchiveEntry => entry !== null);
        const updatedAt = typeof container.updatedAt === 'string' ? container.updatedAt : null;
        return { entries, updatedAt };
      }

      return fallback;
    } catch (error) {
      console.warn('Failed to load archives', error);
      return fallback;
    }
  }

  private persistArchives(source: 'local' | 'remote' = 'local'): void {
    if (source === 'local') {
      this.archivesVersion = new Date().toISOString();
    }

    const payload = {
      entries: this.archives.map((entry) => ({
        ...entry,
        tasks: entry.tasks.map((task) => ({ ...task }))
      })),
      updatedAt: this.archivesVersion ?? undefined
    };

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch (error) {
        console.warn('Failed to persist archives', error);
      }
    }

    if (source === 'local' && syncService.isEnabled()) {
      void syncService.pushArchives(payload);
    }
  }

  private loadState(): { coins: number; tasks: RecordedTask[]; pendingTitle: string | null; updatedAt: string | null } {
    const fallback = { coins: 0, tasks: [] as RecordedTask[], pendingTitle: null, updatedAt: null as string | null };
    if (typeof localStorage === 'undefined') {
      return fallback;
    }

    try {
      const raw = localStorage.getItem(STATE_STORAGE_KEY);
      if (!raw) {
        return fallback;
      }

      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') {
        return fallback;
      }

      const candidate = parsed as {
        coins?: unknown;
        tasks?: unknown;
        pendingTitle?: unknown;
        updatedAt?: unknown;
      };

      const coinValue =
        typeof candidate.coins === 'number' && Number.isFinite(candidate.coins)
          ? candidate.coins
          : 0;
      const coins = Math.max(0, Math.round(coinValue));
      const tasks = this.normalizeStoredTasks(candidate.tasks);
      const pendingTitle =
        typeof candidate.pendingTitle === 'string' && candidate.pendingTitle.trim().length > 0
          ? candidate.pendingTitle
          : null;
      const updatedAt = typeof candidate.updatedAt === 'string' ? candidate.updatedAt : null;

      return { coins, tasks, pendingTitle, updatedAt };
    } catch (error) {
      console.warn('Failed to load game state', error);
      return fallback;
    }
  }

  private persistState(source: 'local' | 'remote' = 'local'): void {
    if (source === 'local') {
      this.stateVersion = new Date().toISOString();
    }

    const payload = {
      coins: this.coins,
      tasks: this.currentTasks.map((task) => ({ ...task })),
      pendingTitle: this.pendingArchiveTitle,
      updatedAt: this.stateVersion ?? undefined
    };

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(payload));
      } catch (error) {
        console.warn('Failed to persist game state', error);
      }
    }

    if (source === 'local' && syncService.isEnabled()) {
      void syncService.pushState(payload);
    }
  }

  private emitTotals(): void {
    const totals = {
      coins: this.getTotalCoins(),
      tasks: this.getTotalTasks()
    };
    this.emitter.emit('totalsChanged', totals);
  }

  private applyRemoteState(payload: RemoteGameStatePayload): void {
    const incomingVersion = this.parseTimestamp(payload.updatedAt);
    const currentVersion = this.parseTimestamp(this.stateVersion);
    if (incomingVersion <= currentVersion) {
      return;
    }

    const coins = Math.max(0, Math.round(typeof payload.coins === 'number' ? payload.coins : 0));
    const tasks = this.normalizeStoredTasks(payload.tasks as unknown);
    const pendingTitle =
      typeof payload.pendingTitle === 'string' && payload.pendingTitle.trim().length > 0
        ? payload.pendingTitle
        : null;

    this.stateVersion = payload.updatedAt ?? new Date().toISOString();
    this.coins = coins;
    this.currentTasks = tasks;
    this.pendingArchiveTitle = pendingTitle;

    this.emitter.emit('coinsChanged', this.coins);
    this.emitTotals();
    this.persistState('remote');
  }

  private applyRemoteArchives(payload: RemoteArchivesPayload): void {
    const incomingVersion = this.parseTimestamp(payload.updatedAt);
    const currentVersion = this.parseTimestamp(this.archivesVersion);
    if (incomingVersion <= currentVersion) {
      return;
    }

    const entries = (Array.isArray(payload.entries) ? payload.entries : [])
      .map((entry) => this.normalizeArchiveEntry(entry))
      .filter((entry): entry is ArchiveEntry => entry !== null);

    this.archives = entries;
    this.archivesVersion = payload.updatedAt ?? new Date().toISOString();
    this.persistArchives('remote');
    this.emitter.emit('archivesUpdated', this.getArchives());
    this.emitTotals();
  }

  private parseTimestamp(value: string | null | undefined): number {
    if (!value) {
      return 0;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private normalizeArchiveEntry(entry: unknown): ArchiveEntry | null {
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const partial = entry as Partial<ArchiveEntry> & { tasks?: unknown };
    if (typeof partial.id !== 'string' || typeof partial.title !== 'string' || typeof partial.createdAt !== 'string') {
      return null;
    }

    const coins = typeof partial.coins === 'number' && Number.isFinite(partial.coins)
      ? partial.coins
      : this.capacity;
    const thumbnailUrl = typeof partial.thumbnailUrl === 'string' ? partial.thumbnailUrl : '/default-thumb.svg';
    const tasks = this.normalizeStoredTasks(partial.tasks);

    return {
      id: partial.id,
      title: partial.title,
      coins,
      createdAt: partial.createdAt,
      thumbnailUrl,
      tasks
    };
  }

  private normalizeStoredTasks(value: unknown): RecordedTask[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((task) => this.normalizeUnknownTask(task))
      .filter((task): task is RecordedTask => task !== null);
  }

  private normalizeUnknownTask(raw: unknown): RecordedTask | null {
    if (typeof raw === 'string') {
      return this.parseTaskString(raw);
    }

    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const candidate = raw as {
      title?: unknown;
      detail?: unknown;
      description?: unknown;
      content?: unknown;
    };
    const title = typeof candidate.title === 'string' ? candidate.title.trim() : '';

    let detail = '';
    if (typeof candidate.detail === 'string') {
      detail = candidate.detail.trim();
    } else if (typeof candidate.description === 'string') {
      detail = candidate.description.trim();
    } else if (typeof candidate.content === 'string') {
      detail = candidate.content.trim();
    }

    if (title.length === 0 && detail.length === 0) {
      return null;
    }

    if (title.length === 0) {
      return { title: detail, detail: null };
    }

    if (detail.length === 0 && typeof candidate.detail !== 'string' && typeof candidate.title === 'string') {
      const parsedFromTitle = this.parseTaskString(candidate.title);
      if (parsedFromTitle) {
        return parsedFromTitle;
      }
    }

    return { title, detail: detail.length > 0 ? detail : null };
  }

  private normalizeTask(task: RecordedTask): RecordedTask | null {
    const title = task.title?.trim() ?? '';
    const detail = task.detail?.trim() ?? '';

    if (title.length === 0 && detail.length === 0) {
      return null;
    }

    if (title.length === 0) {
      return { title: detail, detail: null };
    }

    return { title, detail: detail.length > 0 ? detail : null };
  }

  private parseTaskString(value: string): RecordedTask | null {
    const text = value.trim();
    if (text.length === 0) {
      return null;
    }

    const separatorMatch = text.match(/^(.+?)[|｜:：](.+)$/);
    if (separatorMatch) {
      const title = separatorMatch[1]?.trim() ?? '';
      const detail = separatorMatch[2]?.trim() ?? '';

      if (title.length === 0 && detail.length === 0) {
        return null;
      }

      if (title.length === 0) {
        return { title: detail, detail: null };
      }

      return {
        title,
        detail: detail.length > 0 ? detail : null
      };
    }

    return { title: text, detail: null };
  }

  private generateThumbnail(title: string, now: Date): string {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return '/default-thumb.svg';
    }
    const hue = (now.getHours() * 15 + now.getMinutes()) % 360;
    const gradient = ctx.createLinearGradient(0, 120, 160, 0);
    gradient.addColorStop(0, `hsl(${hue}, 70%, 60%)`);
    gradient.addColorStop(1, `hsl(${(hue + 40) % 360}, 70%, 55%)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '700 32px "Noto Sans JP", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${this.capacity}`, canvas.width / 2, 56);
    ctx.font = '500 16px "Noto Sans JP", sans-serif';
    ctx.fillText(title.slice(0, 10), canvas.width / 2, 88);
    return canvas.toDataURL('image/png');
  }
}

const initialCapacity = userSettings.getSettings().jarCapacity;
export const gameState = new GameStateManager(initialCapacity);

userSettings.onChange((settings) => {
  gameState.setCapacity(settings.jarCapacity);
});
