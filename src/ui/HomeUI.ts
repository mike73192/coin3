import type { ArchiveEntry } from '@/models/archive';
import { ARCHIVE_PAGE_SIZE } from '@/models/archive';
import { gameState } from '@/services/GameStateManager';
import { debugLogger } from '@/services/DebugLogger';
import { userSettings } from '@/services/UserSettings';
import { RecordDialog, type RecordResult } from '@/ui/RecordDialog';
import { SettingsUI } from '@/ui/SettingsUI';

interface HomeUIOptions {
  onRecord: (coins: number) => void;
  onKeyboardCoin: () => void;
}

export class HomeUI {
  private coinCountLabel = document.getElementById('coin-count') as HTMLElement;
  private capacityLabel = document.getElementById('capacity-count') as HTMLElement;
  private recordButton = document.getElementById('record-button') as HTMLButtonElement;
  private downloadLogButton = document.getElementById('download-log-button') as HTMLButtonElement;
  private hintText = document.getElementById('hint-text') as HTMLElement;
  private toast = document.getElementById('full-toast') as HTMLElement;
  private shelfGrid = document.getElementById('shelf-grid') as HTMLElement;
  private shelfPageLabel = document.getElementById('shelf-page') as HTMLElement;
  private prevButton = document.getElementById('shelf-prev') as HTMLButtonElement;
  private nextButton = document.getElementById('shelf-next') as HTMLButtonElement;
  private homeTabButton = document.getElementById('tab-home') as HTMLButtonElement;
  private settingsTabButton = document.getElementById('tab-settings') as HTMLButtonElement;
  private homePanel = document.getElementById('home-view') as HTMLElement;
  private settingsPanel = document.getElementById('settings-view') as HTMLElement;
  private readonly dialog: RecordDialog;

  private currentPage = 0;
  private archives: ArchiveEntry[] = [];
  private lastRecordTitle: string | null = null;

  constructor(private readonly options: HomeUIOptions) {
    this.dialog = new RecordDialog((result) => this.handleRecordSubmit(result));
    new SettingsUI();

    this.recordButton.addEventListener('click', () => {
      debugLogger.log('Record button clicked.');
      this.dialog.show(this.lastRecordTitle ?? undefined);
    });

    this.downloadLogButton.addEventListener('click', () => {
      debugLogger.log('Debug log download requested.');
      debugLogger.download();
    });

    this.prevButton.addEventListener('click', () => this.goToPage(this.currentPage - 1));
    this.nextButton.addEventListener('click', () => this.goToPage(this.currentPage + 1));

    this.homeTabButton.addEventListener('click', () => this.switchView('home'));
    this.settingsTabButton.addEventListener('click', () => this.switchView('settings'));

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !this.dialog.isVisible()) {
        debugLogger.log('Enter key pressed. Adding single coin.');
        this.options.onKeyboardCoin();
      }
    });

    gameState.on('coinsChanged', (value) => this.updateCoinCount(value));
    gameState.on('jarFilled', (entry, _overflow) => this.handleJarFilled(entry));
    gameState.on('archivesUpdated', (entries) => this.refreshArchives(entries));
    gameState.on('capacityChanged', (capacity) => this.updateCapacity(capacity));

    this.refreshArchives(gameState.getArchives());
    this.updateCoinCount(gameState.getCoinCount());
    this.updateCapacity(gameState.getCapacity());
    this.switchView('home');
  }

  private handleRecordSubmit(result: RecordResult): void {
    debugLogger.log('Record dialog submitted.', { title: result.title, coins: result.coins });
    this.lastRecordTitle = result.title;
    const available = gameState.getCapacity() - gameState.getCoinCount();
    const coins = Math.min(result.coins, Math.max(0, available));
    if (coins > 0) {
      gameState.setPendingTitle(result.title);
      debugLogger.log('Submitting coins to queue.', { coins });
      this.options.onRecord(coins);
    } else {
      gameState.setPendingTitle(null);
      debugLogger.log('No coins submitted due to jar capacity.');
    }
  }

  private updateCoinCount(count: number): void {
    this.coinCountLabel.textContent = `${count}`;
    const capacity = gameState.getCapacity();
    const ratio = count / capacity;
    const hint = ratio >= 0.75
      ? 'あと少しで満杯！'
      : ratio >= 0.5
        ? '半分を超えました。良いペースです。'
        : '今日も少しずつ積み上げましょう。';
    this.hintText.textContent = hint;
    debugLogger.log('Coin count label updated.', { count, hint });
  }

  private updateCapacity(capacity: number): void {
    this.capacityLabel.textContent = `${capacity}`;
    const settings = userSettings.getSettings();
    if (settings.jarCapacity !== capacity) {
      userSettings.updateSettings({ jarCapacity: capacity });
    }
    this.updateCoinCount(gameState.getCoinCount());
  }

  private handleJarFilled(entry: ArchiveEntry): void {
    this.showToast();
    this.currentPage = 0;
    this.refreshArchives([entry, ...this.archives]);
    debugLogger.log('Handled jar filled event.', {
      entry: {
        id: entry.id,
        title: entry.title,
        createdAt: entry.createdAt
      }
    });
  }

  private refreshArchives(entries: ArchiveEntry[]): void {
    this.archives = entries;
    const totalPages = Math.max(1, Math.ceil(entries.length / ARCHIVE_PAGE_SIZE));
    this.currentPage = Math.min(this.currentPage, totalPages - 1);
    this.renderShelf();
  }

  private goToPage(index: number): void {
    const totalPages = Math.max(1, Math.ceil(this.archives.length / ARCHIVE_PAGE_SIZE));
    const clamped = Math.max(0, Math.min(index, totalPages - 1));
    if (clamped === this.currentPage) {
      return;
    }
    this.currentPage = clamped;
    this.renderShelf();
  }

  private renderShelf(): void {
    const totalPages = Math.max(1, Math.ceil(this.archives.length / ARCHIVE_PAGE_SIZE));
    const start = this.currentPage * ARCHIVE_PAGE_SIZE;
    const pageItems = this.archives.slice(start, start + ARCHIVE_PAGE_SIZE);

    this.shelfGrid.innerHTML = '';
    for (let i = 0; i < ARCHIVE_PAGE_SIZE; i += 1) {
      const entry = pageItems[i];
      const cell = document.createElement('div');
      cell.className = 'shelf-cell';

      if (entry) {
        const img = document.createElement('img');
        img.src = entry.thumbnailUrl || '/default-thumb.svg';
        img.alt = `${entry.title}のサムネイル`;

        const title = document.createElement('div');
        title.className = 'title';
        title.textContent = entry.title;

        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = new Date(entry.createdAt).toLocaleDateString('ja-JP');

        cell.append(img, title, meta);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'title';
        placeholder.textContent = '空きスペース';
        cell.appendChild(placeholder);
      }

      this.shelfGrid.appendChild(cell);
    }

    this.shelfPageLabel.textContent = `${this.currentPage + 1} / ${totalPages}`;
    this.prevButton.disabled = this.currentPage === 0;
    this.nextButton.disabled = this.currentPage >= totalPages - 1;
  }

  private showToast(): void {
    this.toast.classList.remove('hidden');
    setTimeout(() => this.toast.classList.add('hidden'), 2800);
  }

  private switchView(view: 'home' | 'settings'): void {
    const isHome = view === 'home';
    this.homeTabButton.classList.toggle('active', isHome);
    this.settingsTabButton.classList.toggle('active', !isHome);
    this.homePanel.classList.toggle('hidden', !isHome);
    this.settingsPanel.classList.toggle('hidden', isHome);
    this.homeTabButton.setAttribute('aria-pressed', isHome ? 'true' : 'false');
    this.settingsTabButton.setAttribute('aria-pressed', !isHome ? 'true' : 'false');
  }
}
