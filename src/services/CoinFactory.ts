import Phaser from 'phaser';
import { userSettings } from '@/services/UserSettings';
import { appConfig } from '@/services/AppConfig';

const COIN_RADIUS = 30;
const COIN_SCALE = appConfig.coins.coinScale;

export class CoinFactory {
  private coins: Phaser.Physics.Matter.Image[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  spawnCoins(count: number, interval = appConfig.coins.spawnIntervalMs): Promise<void> {
    if (count <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      let remaining = count;
      let timer: Phaser.Time.TimerEvent | null = null;

      const spawnOne = () => {
        this.createCoin();
        remaining -= 1;

        if (remaining <= 0) {
          resolve();
          timer?.remove(false);
        }
      };

      // trigger immediately for first coin
      spawnOne();

      if (remaining > 0) {
        const { dropInterval } = userSettings.getSettings();
        const delay = dropInterval ?? interval;
        timer = this.scene.time.addEvent({
          delay,
          repeat: remaining - 1,
          callback: spawnOne
        });
      }
    });
  }

  clearCoins(): void {
    this.coins.forEach((coin) => coin.destroy());
    this.coins = [];
  }

  private createCoin(): void {
    const jitter = appConfig.coins.spawnHorizontalJitter;
    const x = this.scene.scale.width / 2 + Phaser.Math.Between(-jitter, jitter);
    const y = appConfig.coins.spawnStartY;
    const coin = this.scene.matter.add.image(x, y, 'coin');
    const settings = userSettings.getSettings();
    coin.setCircle(COIN_RADIUS);
    coin.setScale(COIN_SCALE);
    coin.setBounce(settings.coinBounciness);
    coin.setFriction(settings.coinFriction);
    coin.setFrictionStatic(settings.coinStaticFriction);
    coin.setFrictionAir(appConfig.coins.coinAirDrag);
    coin.setMass(appConfig.coins.coinMass);
    coin.setDepth(5);
    coin.setIgnoreGravity(false);
    coin.setVelocity(
      Phaser.Math.FloatBetween(appConfig.coins.spawnVelocityXMin, appConfig.coins.spawnVelocityXMax),
      Phaser.Math.FloatBetween(appConfig.coins.spawnVelocityYMin, appConfig.coins.spawnVelocityYMax)
    );
    coin.setAngularVelocity(Phaser.Math.FloatBetween(-0.05, 0.05));
    coin.setSleepEvents(true, true);
    this.coins.push(coin);
    coin.once('destroy', () => {
      this.coins = this.coins.filter((c) => c !== coin);
    });
  }
}
