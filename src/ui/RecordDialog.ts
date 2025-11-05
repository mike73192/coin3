import { gameState } from '@/services/GameStateManager';
import { debugLogger } from '@/services/DebugLogger';
import { appConfig } from '@/services/AppConfig';

export interface RecordResult {
  title: string;
  coins: number;
  tasks: string[];
}

type SliderElement = HTMLInputElement & { dataset: DOMStringMap };

const MAX_COINS_PER_RECORD = appConfig.ui.maxRecordCoins;
const CONVERSION_BASE = appConfig.ui.recordConversionBase;
const SLIDER_FORMULA = appConfig.ui.recordSliderFormula;

type SliderFormula = (value: number, weight: number) => number;
type CompiledSliderFormula = (value: number, weight: number, math: typeof Math) => number;

function createSliderFormulaEvaluator(formula: string): SliderFormula {
  const expression = formula?.trim() ?? '';
  if (!expression) {
    return (value, weight) => value * weight;
  }

  try {
    const evaluator = new Function('value', 'weight', 'Math', `return ${expression};`) as CompiledSliderFormula;
    // Validate the evaluator once to ensure it returns a finite number for nominal inputs.
    const probe = evaluator(1, 1, Math);
    if (typeof probe !== 'number' || !Number.isFinite(probe)) {
      throw new Error('Formula must return a finite number.');
    }
    return (value: number, weight: number) => {
      const result = evaluator(value, weight, Math);
      return Number.isFinite(result) ? result : 0;
    };
  } catch (error) {
    console.warn('Invalid record slider formula. Falling back to default.', error);
    return (value, weight) => value * weight;
  }
}

const evaluateSlider = createSliderFormulaEvaluator(SLIDER_FORMULA);

export class RecordDialog {
  private backdrop: HTMLElement;
  private form: HTMLFormElement;
  private titleInput: HTMLInputElement;
  private taskInput: HTMLTextAreaElement;
  private preview: HTMLElement;
  private sliders: SliderElement[];
  private sliderValueDisplays = new Map<SliderElement, HTMLElement>();
  private cancelButton: HTMLButtonElement;
  private visible = false;

  constructor(private readonly onSubmit: (result: RecordResult) => void) {
    this.backdrop = document.getElementById('dialog-backdrop') as HTMLElement;
    this.form = document.getElementById('record-form') as HTMLFormElement;
    this.titleInput = document.getElementById('record-title') as HTMLInputElement;
    this.taskInput = document.getElementById('record-tasks') as HTMLTextAreaElement;
    this.preview = document.getElementById('record-preview') as HTMLElement;
    this.cancelButton = document.getElementById('dialog-cancel') as HTMLButtonElement;
    this.sliders = Array.from(this.form.querySelectorAll('input[type="range"]')) as SliderElement[];

    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      const result = this.buildResult();
      this.onSubmit(result);
      this.hide();
      debugLogger.log('Record dialog form submitted.', { result });
    });

    this.cancelButton.addEventListener('click', () => {
      debugLogger.log('Record dialog cancelled.');
      this.hide();
    });
    this.sliders.forEach((slider) => {
      const display = slider.closest('label')?.querySelector('[data-slider-value]') as HTMLElement | null;
      if (display) {
        this.sliderValueDisplays.set(slider, display);
      }
      slider.addEventListener('input', () => {
        this.updateSliderDisplay(slider);
        this.updatePreview();
      });
    });
    gameState.on('capacityChanged', () => this.updatePreview());
    this.updatePreview();
  }

  show(presetTitle?: string): void {
    this.backdrop.classList.remove('hidden');
    this.titleInput.value = presetTitle ?? '';
    this.titleInput.focus();
    this.updatePreview();
    this.visible = true;
    debugLogger.log('Record dialog shown.', { presetTitle: presetTitle ?? null });
  }

  hide(): void {
    this.backdrop.classList.add('hidden');
    this.form.reset();
    this.taskInput.value = '';
    this.sliders.forEach((slider) => {
      slider.value = slider.defaultValue;
    });
    this.updatePreview();
    this.visible = false;
    debugLogger.log('Record dialog hidden.');
  }

  isVisible(): boolean {
    return this.visible;
  }

  private computeRecord(): { title: string; coins: number } {
    const totalScore = this.sliders.reduce((sum, slider) => {
      const value = Number(slider.value) || 0;
      const weight = Number(slider.dataset.weight ?? '1');
      const contribution = evaluateSlider(value, weight);
      return sum + contribution;
    }, 0);

    const coins = Math.min(
      MAX_COINS_PER_RECORD,
      Math.max(0, Math.round(totalScore / CONVERSION_BASE))
    );

    return {
      title: this.titleInput.value.trim() || '今日の成果',
      coins
    };
  }

  private buildResult(): RecordResult {
    const base = this.computeRecord();
    const tasks = this.collectTasks();
    return { ...base, tasks };
  }

  private collectTasks(): string[] {
    const raw = this.taskInput.value ?? '';
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  private updatePreview(): void {
    const currentCoins = this.computeRecord().coins;
    const available = gameState.getCapacity() - gameState.getCoinCount();
    const capped = Math.min(currentCoins, Math.max(0, available));
    this.preview.textContent = `${capped}枚 (上限 ${MAX_COINS_PER_RECORD}枚)`;
    this.syncSliderDisplays();
    debugLogger.log('Record dialog preview updated.', { currentCoins, capped, available });
  }

  private syncSliderDisplays(): void {
    this.sliders.forEach((slider) => this.updateSliderDisplay(slider));
  }

  private updateSliderDisplay(slider: SliderElement): void {
    const display = this.sliderValueDisplays.get(slider);
    if (!display) {
      return;
    }
    const numericValue = Number(slider.value);
    display.textContent = Number.isFinite(numericValue) ? `${Math.round(numericValue)}` : '0';
  }
}
