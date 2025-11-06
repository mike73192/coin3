import type { ArchiveEntry } from '@/models/archive';
import { ARCHIVE_PAGE_SIZE } from '@/models/archive';
import { gameState } from '@/services/GameStateManager';
import { debugLogger } from '@/services/DebugLogger';
import { userSettings } from '@/services/UserSettings';
import { RecordDialog, type RecordResult } from '@/ui/RecordDialog';
import { SettingsUI } from '@/ui/SettingsUI';
import { appConfig } from '@/services/AppConfig';

interface HomeUIOptions {
  onRecord: (coins: number) => void;
  onKeyboardCoin: (coins: number) => void;
}

export class HomeUI {
  private coinCountLabel = document.getElementById('coin-count') as HTMLElement;
  private capacityLabel = document.getElementById('capacity-count') as HTMLElement;
  private recordButton = document.getElementById('record-button') as HTMLButtonElement;
  private downloadLogButton = document.getElementById('download-log-button') as HTMLButtonElement;
  private hintText = document.getElementById('hint-text') as HTMLElement;
  private totalCoinsLabel = document.getElementById('total-coins') as HTMLElement;
  private totalTasksLabel = document.getElementById('total-tasks') as HTMLElement;
  private toast = document.getElementById('full-toast') as HTMLElement;
  private shelfGrid = document.getElementById('shelf-grid') as HTMLElement;
  private shelfPageLabel = document.getElementById('shelf-page') as HTMLElement;
  private detailPlaceholder = document.getElementById('archive-detail-placeholder') as HTMLElement;
  private detailPanel = document.getElementById('archive-detail') as HTMLElement;
  private detailTitle = document.getElementById('detail-title') as HTMLElement;
  private detailDate = document.getElementById('detail-date') as HTMLElement;
  private detailCoins = document.getElementById('detail-coins') as HTMLElement;
  private detailTasksList = document.getElementById('detail-tasks') as HTMLElement;
  private prevButton = document.getElementById('shelf-prev') as HTMLButtonElement;
  private nextButton = document.getElementById('shelf-next') as HTMLButtonElement;
  private homeTabButton = document.getElementById('tab-home') as HTMLButtonElement;
  private settingsTabButton = document.getElementById('tab-settings') as HTMLButtonElement;
  private homePanel = document.getElementById('home-view') as HTMLElement;
  private settingsPanel = document.getElementById('settings-view') as HTMLElement;
  private readonly dialog: RecordDialog;

  private currentPage = 0;
  private archives: ArchiveEntry[] = [];
  private selectedArchiveId: string | null = null;
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
        const increment = appConfig.ui.keyboardCoinIncrement;
        debugLogger.log('Enter key pressed. Adding coins.', { amount: increment });
        this.options.onKeyboardCoin(increment);
      }
    });

    gameState.on('coinsChanged', (value) => this.updateCoinCount(value));
    gameState.on('jarFilled', (entry, _overflow) => this.handleJarFilled(entry));
    gameState.on('archivesUpdated', (entries) => this.refreshArchives(entries));
    gameState.on('capacityChanged', (capacity) => this.updateCapacity(capacity));
    gameState.on('totalsChanged', (totals) => this.updateTotals(totals));

    this.refreshArchives(gameState.getArchives());
    this.updateCoinCount(gameState.getCoinCount());
    this.updateCapacity(gameState.getCapacity());
    this.updateTotals({ coins: gameState.getTotalCoins(), tasks: gameState.getTotalTasks() });
    this.switchView('home');
  }

  private handleRecordSubmit(result: RecordResult): void {
    const sourceTask =
      result.tasks.length > 0
        ? result.tasks[0]
        : result.fallbackTask ?? null;

    let taskToRegister = sourceTask
      ? {
          title: sourceTask.title,
          detail: typeof sourceTask.detail === 'string' ? sourceTask.detail : sourceTask.detail ?? null
        }
      : null;

    if (!taskToRegister && result.title.trim().length > 0) {
      taskToRegister = { title: result.title.trim(), detail: null };
    }

    debugLogger.log('Record dialog submitted.', {
      title: result.title,
      coins: result.coins,
      taskRegistered: Boolean(taskToRegister),
      taskSource:
        result.tasks.length > 0
          ? 'tasks'
          : result.fallbackTask
            ? 'taskInputFallback'
            : 'titleFallback'
    });
    this.lastRecordTitle = result.title;
    if (taskToRegister) {
      gameState.registerTask(taskToRegister);
    }
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

  private updateTotals(totals: { coins: number; tasks: number }): void {
    this.totalCoinsLabel.textContent = totals.coins.toLocaleString('ja-JP');
    this.totalTasksLabel.textContent = totals.tasks.toLocaleString('ja-JP');
    debugLogger.log('Total counters updated.', totals);
  }

  private handleJarFilled(entry: ArchiveEntry): void {
    this.showToast();
    this.currentPage = 0;
    this.selectedArchiveId = entry.id;
    this.refreshArchives([entry, ...this.archives]);
    debugLogger.log('Handled jar filled event.', {
      entry: {
        id: entry.id,
        title: entry.title,
        createdAt: entry.createdAt,
        taskCount: entry.tasks.length
      }
    });
  }

  private refreshArchives(entries: ArchiveEntry[]): void {
    this.archives = entries;
    const totalPages = Math.max(1, Math.ceil(entries.length / ARCHIVE_PAGE_SIZE));
    this.currentPage = Math.min(this.currentPage, totalPages - 1);

    if (this.archives.length === 0) {
      this.selectedArchiveId = null;
    } else {
      const selectedIndex = this.selectedArchiveId
        ? this.archives.findIndex((item) => item.id === this.selectedArchiveId)
        : -1;

      if (selectedIndex >= 0) {
        const pageOfSelection = Math.floor(selectedIndex / ARCHIVE_PAGE_SIZE);
        if (pageOfSelection !== this.currentPage) {
          this.currentPage = pageOfSelection;
        }
      } else {
        const startIndex = this.currentPage * ARCHIVE_PAGE_SIZE;
        const fallback = this.archives[startIndex] ?? this.archives[0];
        this.selectedArchiveId = fallback?.id ?? null;
        if (this.selectedArchiveId) {
          const fallbackIndex = this.archives.findIndex((item) => item.id === this.selectedArchiveId);
          this.currentPage = Math.floor(fallbackIndex / ARCHIVE_PAGE_SIZE);
        }
      }
    }
    this.renderShelf();
    this.updateDetailView();
  }

  private goToPage(index: number): void {
    const totalPages = Math.max(1, Math.ceil(this.archives.length / ARCHIVE_PAGE_SIZE));
    const clamped = Math.max(0, Math.min(index, totalPages - 1));
    if (clamped === this.currentPage) {
      return;
    }
    this.currentPage = clamped;

    const startIndex = this.currentPage * ARCHIVE_PAGE_SIZE;
    const pageItems = this.archives.slice(startIndex, startIndex + ARCHIVE_PAGE_SIZE);
    if (pageItems.length > 0) {
      const hasSelectionOnPage = pageItems.some((item) => item.id === this.selectedArchiveId);
      if (!hasSelectionOnPage) {
        this.selectedArchiveId = pageItems[0].id;
      }
    } else {
      this.selectedArchiveId = null;
    }

    this.renderShelf();
    this.updateDetailView();
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
        const formattedDate = new Date(entry.createdAt).toLocaleDateString('ja-JP');
        meta.textContent = `${formattedDate}・タスク${entry.tasks.length}件`;

        cell.append(img, title, meta);
        cell.dataset.archiveId = entry.id;
        cell.tabIndex = 0;
        cell.setAttribute('role', 'button');
        cell.setAttribute('aria-label', `${entry.title} (${formattedDate})`);
        cell.setAttribute('aria-pressed', entry.id === this.selectedArchiveId ? 'true' : 'false');
        if (entry.id === this.selectedArchiveId) {
          cell.classList.add('selected');
        }
        cell.addEventListener('click', () => this.selectArchive(entry.id));
        cell.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.selectArchive(entry.id);
          }
        });
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'title';
        placeholder.textContent = '空きスペース';
        cell.appendChild(placeholder);
        cell.setAttribute('aria-hidden', 'true');
      }

      this.shelfGrid.appendChild(cell);
    }

    this.shelfPageLabel.textContent = `${this.currentPage + 1} / ${totalPages}`;
    this.prevButton.disabled = this.currentPage === 0;
    this.nextButton.disabled = this.currentPage >= totalPages - 1;
  }

  private selectArchive(id: string): void {
    if (this.selectedArchiveId === id) {
      this.selectedArchiveId = null;
      debugLogger.log('Archive entry deselected.', { id });
      this.updateDetailView();
      this.renderShelf();
      return;
    }

    this.selectedArchiveId = id;

    const selectedIndex = this.archives.findIndex((item) => item.id === id);
    if (selectedIndex >= 0) {
      const pageOfSelection = Math.floor(selectedIndex / ARCHIVE_PAGE_SIZE);
      if (pageOfSelection !== this.currentPage) {
        this.currentPage = pageOfSelection;
      }
    }

    debugLogger.log('Archive entry selected.', { id });
    this.updateDetailView();
    this.renderShelf();
  }

  private updateDetailView(): void {
    if (!this.selectedArchiveId) {
      this.detailPanel.classList.add('hidden');
      this.detailPlaceholder.classList.remove('hidden');
      this.detailTasksList.innerHTML = '';
      return;
    }

    const entry = this.archives.find((item) => item.id === this.selectedArchiveId);
    if (!entry) {
      this.selectedArchiveId = null;
      this.updateDetailView();
      return;
    }

    this.detailPlaceholder.classList.add('hidden');
    this.detailPanel.classList.remove('hidden');
    this.detailTitle.textContent = entry.title;
    this.detailDate.textContent = new Date(entry.createdAt).toLocaleString('ja-JP');
    this.detailCoins.textContent = entry.coins.toLocaleString('ja-JP');
    this.detailTasksList.innerHTML = '';

    if (entry.tasks.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty-task';
      empty.textContent = '記録されたタスクはありません。';
      this.detailTasksList.appendChild(empty);
    } else {
      entry.tasks.forEach((task, index) => {
        this.detailTasksList.appendChild(this.createTaskListItem(entry.id, task, index));
      });
    }

    debugLogger.log('Archive detail view updated.', {
      archiveId: entry.id,
      taskCount: entry.tasks.length
    });
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

  private createTaskListItem(archiveId: string, task: { title: string; detail: string | null }, index: number): HTMLLIElement {
    const item = document.createElement('li');
    item.className = 'task-item';

    const titleText = task.title.trim() || '（タイトルなし）';
    const detailText = task.detail?.trim() ?? '';
    const hasDetail = detailText.length > 0;
    const contentText = hasDetail ? detailText : '（詳細なし）';

    item.classList.add(hasDetail ? 'has-detail' : 'no-detail');

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'task-toggle';
    toggle.setAttribute('aria-expanded', 'false');

    const label = document.createElement('span');
    label.className = 'task-toggle-text';
    label.textContent = titleText;

    const icon = document.createElement('span');
    icon.className = 'task-toggle-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '▼';

    const detail = document.createElement('p');
    detail.className = 'task-detail';
    detail.textContent = contentText;
    detail.hidden = true;

    const detailId = `task-detail-${archiveId}-${index}`;
    detail.id = detailId;
    toggle.setAttribute('aria-controls', detailId);

    const toggleDetail = () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      const nextExpanded = !expanded;
      toggle.setAttribute('aria-expanded', nextExpanded.toString());
      detail.hidden = !nextExpanded;
      item.classList.toggle('expanded', nextExpanded);
    };

    toggle.addEventListener('click', toggleDetail);

    toggle.append(label, icon);
    item.append(toggle, detail);
    return item;
  }
}
