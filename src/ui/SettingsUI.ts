import { userSettings, type UserSettings } from '@/services/UserSettings';
import { debugLogger } from '@/services/DebugLogger';

export class SettingsUI {
  private form = document.getElementById('settings-form') as HTMLFormElement;
  private capacityInput = document.getElementById('settings-capacity') as HTMLInputElement;
  private intervalInput = document.getElementById('settings-drop-interval') as HTMLInputElement;
  private bounceInput = document.getElementById('settings-bounce') as HTMLInputElement;
  private frictionInput = document.getElementById('settings-friction') as HTMLInputElement;
  private staticInput = document.getElementById('settings-static-friction') as HTMLInputElement;
  private intervalLabel = document.getElementById('settings-drop-label') as HTMLElement;
  private bounceLabel = document.getElementById('settings-bounce-label') as HTMLElement;
  private frictionLabel = document.getElementById('settings-friction-label') as HTMLElement;
  private staticLabel = document.getElementById('settings-static-label') as HTMLElement;

  constructor() {
    this.form.addEventListener('submit', (event) => event.preventDefault());
    this.capacityInput.addEventListener('change', () => this.commit());
    this.capacityInput.addEventListener('blur', () => this.commit());
    this.intervalInput.addEventListener('input', () => this.handleInput());
    this.intervalInput.addEventListener('change', () => this.commit());
    this.bounceInput.addEventListener('input', () => this.handleInput());
    this.bounceInput.addEventListener('change', () => this.commit());
    this.frictionInput.addEventListener('input', () => this.handleInput());
    this.frictionInput.addEventListener('change', () => this.commit());
    this.staticInput.addEventListener('input', () => this.handleInput());
    this.staticInput.addEventListener('change', () => this.commit());

    userSettings.onChange((settings) => this.apply(settings));
    this.apply(userSettings.getSettings());
  }

  private handleInput(): void {
    this.updateLabels(this.readForm());
  }

  private commit(): void {
    const settings = this.readForm();
    debugLogger.log('User settings updated from UI.', { ...settings });
    userSettings.updateSettings(settings);
  }

  private readForm(): UserSettings {
    const current = userSettings.getSettings();
    const capacity = Number(this.capacityInput.value);
    const interval = Number(this.intervalInput.value);
    const bounce = Number(this.bounceInput.value);
    const friction = Number(this.frictionInput.value);
    const staticFriction = Number(this.staticInput.value);
    return {
      jarCapacity: Number.isFinite(capacity) ? capacity : current.jarCapacity,
      dropInterval: Number.isFinite(interval) ? interval : current.dropInterval,
      coinBounciness: Number.isFinite(bounce) ? bounce : current.coinBounciness,
      coinFriction: Number.isFinite(friction) ? friction : current.coinFriction,
      coinStaticFriction: Number.isFinite(staticFriction) ? staticFriction : current.coinStaticFriction
    };
  }

  private apply(settings: UserSettings): void {
    this.capacityInput.value = `${settings.jarCapacity}`;
    this.intervalInput.value = `${settings.dropInterval}`;
    this.bounceInput.value = `${settings.coinBounciness}`;
    this.frictionInput.value = `${settings.coinFriction}`;
    this.staticInput.value = `${settings.coinStaticFriction}`;
    this.updateLabels(settings);
  }

  private updateLabels(settings: UserSettings): void {
    this.intervalLabel.textContent = `${Math.round(settings.dropInterval)} ms`;
    this.bounceLabel.textContent = settings.coinBounciness.toFixed(2);
    this.frictionLabel.textContent = settings.coinFriction.toFixed(2);
    this.staticLabel.textContent = settings.coinStaticFriction.toFixed(2);
  }
}
