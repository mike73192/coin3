import Phaser from 'phaser';

const COIN_RADIUS = 12;

export class CoinFactory {
  private coins: Phaser.Physics.Matter.Image[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  spawnCoins(count: number, interval = 90): Promise<void> {
    if (count <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      let spawned = 0;
      const timer = this.scene.time.addEvent({
        delay: interval,
        repeat: count - 1,
        callback: () => {
          this.createCoin();
          spawned += 1;
          if (spawned >= count) {
            resolve();
          }
        }
      });
      // trigger immediately for first coin
      this.createCoin();
      spawned += 1;
      if (count === 1) {
        resolve();
        timer.remove(false);
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
