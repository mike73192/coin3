import Phaser from 'phaser';

const COIN_RADIUS = 12;

export class CoinFactory {
  private coins: Phaser.Physics.Matter.Image[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  spawnCoins(count: number, interval = 90): Promise<void> {
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
        timer = this.scene.time.addEvent({
          delay: interval,
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
    const x = this.scene.scale.width / 2 + Phaser.Math.Between(-20, 20);
    const y = 60;
    const coin = this.scene.matter.add.image(x, y, 'coin');
    coin.setCircle(COIN_RADIUS);
    coin.setBounce(0.4);
    coin.setFriction(0.005);
    coin.setMass(1);
    coin.setDepth(5);
    coin.setScale(0.5);
    coin.setIgnoreGravity(false);
    coin.setVelocity(Phaser.Math.FloatBetween(-1.5, 1.5), Phaser.Math.FloatBetween(-2, 0));
    this.coins.push(coin);
    coin.once('destroy', () => {
      this.coins = this.coins.filter((c) => c !== coin);
    });
  }
}
