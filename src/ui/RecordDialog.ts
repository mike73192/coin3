import { gameState } from '@/services/GameStateManager';

export interface RecordResult {
  title: string;
  coins: number;
}

type SliderElement = HTMLInputElement & { dataset: DOMStringMap };

const MAX_COINS_PER_RECORD = 15;
const CONVERSION_BASE = 45;

export class RecordDialog {
  private backdrop: HTMLElement;
  private form: HTMLFormElement;
  private titleInput: HTMLInputElement;
  private preview: HTMLElement;
  private sliders: SliderElement[];
  private cancelButton: HTMLButtonElement;
  private visible = false;

  constructor(private readonly onSubmit: (result: RecordResult) => void) {
    this.backdrop = document.getElementById('dialog-backdrop') as HTMLElement;
    this.form = document.getElementById('record-form') as HTMLFormElement;
    this.titleInput = document.getElementById('record-title') as HTMLInputElement;
    this.preview = document.getElementById('record-preview') as HTMLElement;
    this.cancelButton = document.getElementById('dialog-cancel') as HTMLButtonElement;
    this.sliders = Array.from(this.form.querySelectorAll('input[type="range"]')) as SliderElement[];

    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      const result = this.calculate();
      this.onSubmit(result);
      this.hide();
    });

    this.cancelButton.addEventListener('click', () => this.hide());
    this.sliders.forEach((slider) => slider.addEventListener('input', () => this.updatePreview()));
    this.updatePreview();
  }

  show(presetTitle?: string): void {
    this.backdrop.classList.remove('hidden');
    this.titleInput.value = presetTitle ?? '';
    this.titleInput.focus();
    this.updatePreview();
    this.visible = true;
  }

  hide(): void {
    this.backdrop.classList.add('hidden');
    this.form.reset();
    this.sliders.forEach((slider) => {
      slider.value = slider.defaultValue;
    });
    this.updatePreview();
    this.visible = false;
  }

  isVisible(): boolean {
    return this.visible;
  }

  private calculate(): RecordResult {
    const totalScore = this.sliders.reduce((sum, slider) => {
      const value = Number(slider.value) || 0;
      const weight = Number(slider.dataset.weight ?? '1');
      return sum + value * weight;
    }, 0);

    const coins = Math.min(
      MAX_COINS_PER_RECORD,
      Math.max(0, Math.round(totalScore / CONVERSION_BASE))
    );

    const result: RecordResult = {
      title: this.titleInput.value.trim() || '今日の成果',
      coins
    };

    // 予測値が0であってもプレビューで確認できるよう保持
    return result;
  }

  private updatePreview(): void {
    const currentCoins = this.calculate().coins;
    const available = gameState.getCapacity() - gameState.getCoinCount();
    const capped = Math.min(currentCoins, Math.max(0, available));
    this.preview.textContent = `${capped}枚 (上限 ${MAX_COINS_PER_RECORD}枚)`;
  }
}
