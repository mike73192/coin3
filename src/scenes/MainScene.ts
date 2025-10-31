import Phaser from 'phaser';
import { CoinFactory } from '@/services/CoinFactory';
import { gameState } from '@/services/GameStateManager';

const BOTTLE_COLOR = 0xffffff;
const BOTTLE_STROKE = 0x6b7a99;
const BACKGROUND_COLOR = 0xe9f1f9;

export class MainScene extends Phaser.Scene {
  private coinFactory!: CoinFactory;
  private pendingQueue = 0;
  private dropping = false;
  private bottleGlow?: Phaser.GameObjects.Rectangle;
  private jarReadyResolvers: Array<() => void> = [];
  private queuePromise: Promise<void> = Promise.resolve();
  private jarReady = true;

  constructor() {
    super('MainScene');
  }

  preload(): void {
    this.createCoinTexture();
  }

  create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    this.matter.world.setBounds(0, 0, this.scale.width, this.scale.height, 64, true, true, false, true);
    this.createBottle();
    this.coinFactory = new CoinFactory(this);

    gameState.on('jarFilled', () => {
      this.jarReady = false;
      this.time.delayedCall(600, () => {
        this.coinFactory.clearCoins();
        this.flashBottle();
        this.resolveJarReady();
      });
    });
  }

  enqueueCoins(amount: number): Promise<void> {
    if (amount <= 0) {
      return Promise.resolve();
    }
    this.pendingQueue += amount;
    this.queuePromise = this.queuePromise.then(() => this.processQueue());
    return this.queuePromise;
  }

  private async processQueue(): Promise<void> {
    if (this.dropping) return;
    this.dropping = true;
    while (this.pendingQueue > 0) {
      const batch = Math.min(6, this.pendingQueue);
      await this.coinFactory.spawnCoins(batch);
      this.pendingQueue -= batch;
    }
    this.dropping = false;
  }

  private createCoinTexture(): void {
    const graphics = this.add.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0xffd966, 1);
    graphics.fillCircle(40, 40, 36);
    graphics.lineStyle(6, 0xffc531, 1);
    graphics.strokeCircle(40, 40, 32);
    graphics.generateTexture('coin', 80, 80);
    graphics.destroy();
  }

  private createBottle(): void {
    const { width, height } = this.scale;
    const bottleWidth = 280;
    const bottleHeight = height * 0.65;
    const neckWidth = 140;
    const wallThickness = 20;
    const centerX = width / 2;
    const bottomY = height - 40;
    const topY = bottomY - bottleHeight;

    const glass = this.add.graphics();
    glass.lineStyle(8, BOTTLE_STROKE, 0.8);
    glass.fillStyle(BOTTLE_COLOR, 0.15);

    const glassPath = new Phaser.Curves.Path(centerX - neckWidth / 2, topY + 40)
      .quadraticBezierTo(centerX - neckWidth / 2, topY + 10, centerX - neckWidth / 2 + 24, topY)
      .quadraticBezierTo(centerX - bottleWidth / 2, topY - 40, centerX - bottleWidth / 2, topY + 40)
      .lineTo(centerX - bottleWidth / 2 + 16, bottomY - 24)
      .quadraticBezierTo(centerX - bottleWidth / 2 + 32, bottomY, centerX - bottleWidth / 2 + 48, bottomY)
      .lineTo(centerX + bottleWidth / 2 - 48, bottomY)
      .quadraticBezierTo(centerX + bottleWidth / 2 - 32, bottomY, centerX + bottleWidth / 2 - 16, bottomY - 24)
      .lineTo(centerX + bottleWidth / 2, topY + 40)
      .quadraticBezierTo(centerX + bottleWidth / 2, topY - 40, centerX + neckWidth / 2 - 24, topY)
      .quadraticBezierTo(centerX + neckWidth / 2, topY + 10, centerX + neckWidth / 2, topY + 40);

    glassPath.closePath();

    const bottleShape = glassPath.getPoints(96);
    glass.fillPoints(bottleShape, true);
    glass.strokePoints(bottleShape, true);

    this.bottleGlow = this.add.rectangle(centerX, topY + bottleHeight / 2, bottleWidth - wallThickness, bottleHeight - wallThickness, 0x80b3ff, 0.12);
    this.bottleGlow.setVisible(false);

    const leftWall = this.matter.add.rectangle(
      centerX - bottleWidth / 2 + wallThickness / 2,
      bottomY - bottleHeight / 2,
      wallThickness,
      bottleHeight,
      { isStatic: true, angle: Phaser.Math.DegToRad(-6) }
    );

    const rightWall = this.matter.add.rectangle(
      centerX + bottleWidth / 2 - wallThickness / 2,
      bottomY - bottleHeight / 2,
      wallThickness,
      bottleHeight,
      { isStatic: true, angle: Phaser.Math.DegToRad(6) }
    );

    const neckLeft = this.matter.add.rectangle(
      centerX - neckWidth / 2,
      topY + 70,
      wallThickness,
      140,
      { isStatic: true }
    );

    const neckRight = this.matter.add.rectangle(
      centerX + neckWidth / 2,
      topY + 70,
      wallThickness,
      140,
      { isStatic: true }
    );

    this.matter.add.rectangle(centerX, bottomY, bottleWidth - wallThickness, wallThickness, {
      isStatic: true,
      chamfer: { radius: 12 }
    });

    [leftWall, rightWall, neckLeft, neckRight].forEach((body) => {
      body.restitution = 0.12;
      body.friction = 0.01;
    });
  }

  private flashBottle(): void {
    if (!this.bottleGlow) return;
    this.bottleGlow.setVisible(true);
    this.tweens.add({
      targets: this.bottleGlow,
      alpha: { from: 0.5, to: 0.1 },
      duration: 600,
      yoyo: true,
      repeat: 1,
      onComplete: () => this.bottleGlow?.setVisible(false)
    });
  }

  waitForJarReady(): Promise<void> {
    if (this.jarReady) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.jarReadyResolvers.push(resolve);
    });
  }

  private resolveJarReady(): void {
    this.jarReady = true;
    this.jarReadyResolvers.forEach((resolve) => resolve());
    this.jarReadyResolvers = [];
  }
}
