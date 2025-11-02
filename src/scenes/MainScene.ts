import Phaser from 'phaser';
import { CoinFactory } from '@/services/CoinFactory';
import { gameState } from '@/services/GameStateManager';
import bottleImageUrl from '../../art/fb32b0195c07167f33583a0225f2b927-1.png';

const BACKGROUND_COLOR = '#e9f1f9';

export class MainScene extends Phaser.Scene {
  private coinFactory!: CoinFactory;
  private pendingQueue = 0;
  private dropping = false;
  private bottleGlow?: Phaser.GameObjects.Rectangle;
  private bottleCanvas?: HTMLCanvasElement;
  private bottleContext: CanvasRenderingContext2D | null = null;
  private bottleImage?: HTMLImageElement;
  private bottleImageLoaded = false;
  private bottleBodies: MatterJS.BodyType[] = [];
  private bottleInteriorRect = new Phaser.Geom.Rectangle();
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
    const boundaryThickness = Math.max(this.scale.width, this.scale.height) * 0.01;
    this.matter.world.setBounds(0, 0, this.scale.width, this.scale.height, boundaryThickness, true, true, false, true);
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
    graphics.setVisible(false);
    graphics.fillStyle(0xffd966, 1);
    graphics.fillCircle(40, 40, 36);
    graphics.lineStyle(6, 0xffc531, 1);
    graphics.strokeCircle(40, 40, 32);
    graphics.generateTexture('coin', 80, 80);
    graphics.destroy();
  }

  private createBottle(): void {
    this.setupBottleCanvas();
    this.ensureBottleImage();
    this.redrawBottle();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupBottle, this);
  }

  private setupBottleCanvas(): void {
    if (this.bottleCanvas) {
      return;
    }

    const container = document.getElementById('game-container');
    if (!container) {
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.id = 'bottle-canvas';
    canvas.style.position = 'absolute';
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.setProperty('z-index', '2', 'important');

    const gameCanvas = this.game.canvas as HTMLCanvasElement | undefined;
    if (gameCanvas) {
      gameCanvas.style.position = 'relative';
      gameCanvas.style.setProperty('z-index', '1', 'important');
      gameCanvas.style.backgroundColor = 'transparent';
    }

    container.insertBefore(canvas, container.firstChild);
    this.bottleCanvas = canvas;
    this.bottleContext = canvas.getContext('2d');
  }

  private ensureBottleImage(): boolean {
    if (this.bottleImageLoaded) {
      return true;
    }

    if (!this.bottleImage) {
      const image = new Image();
      image.src = bottleImageUrl;
      image.onload = () => {
        this.bottleImageLoaded = true;
        this.redrawBottle();
      };
      this.bottleImage = image;

      if (image.complete) {
        this.bottleImageLoaded = true;
        return true;
      }

      return false;
    }

    if (this.bottleImage.complete) {
      this.bottleImageLoaded = true;
      return true;
    }

    return false;
  }

  private redrawBottle(width = this.scale.width, height = this.scale.height): void {
    if (!this.bottleCanvas || !this.bottleContext) {
      return;
    }

    this.bottleCanvas.width = width;
    this.bottleCanvas.height = height;

    const ctx = this.bottleContext;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, width, height);

    const imageReady = this.ensureBottleImage();

    const centerX = width * 0.5;
    const bottomY = height * 0.9;
    const bottleHeight = height * 0.72;
    const topY = bottomY - bottleHeight;

    const mouthHeight = bottleHeight * 0.06;
    const neckHeight = bottleHeight * 0.17;
    const shoulderHeight = bottleHeight * 0.14;
    const baseCurveDepth = bottleHeight * 0.08;

    const defaultBodyWidth = width * 0.32;
    let bodyWidth = defaultBodyWidth;
    let drawWidth = defaultBodyWidth;

    let imageAspect = 0;
    if (this.bottleImage) {
      const sourceWidth = this.bottleImage.naturalWidth || this.bottleImage.width;
      const sourceHeight = this.bottleImage.naturalHeight || this.bottleImage.height;
      if (sourceWidth > 0 && sourceHeight > 0) {
        imageAspect = sourceWidth / sourceHeight;
      }
    }

    if (imageReady && this.bottleImage && imageAspect > 0) {
      drawWidth = bottleHeight * imageAspect;
      bodyWidth = drawWidth;
    }

    const neckWidth = bodyWidth * 0.46;
    const wallThickness = bodyWidth * 0.06;

    const mouthTopY = topY;
    const mouthBottomY = mouthTopY + mouthHeight;
    const neckBottomY = mouthBottomY + neckHeight;
    const shoulderBottomY = neckBottomY + shoulderHeight;
    const bodyBottomY = bottomY - baseCurveDepth;

    if (imageReady && this.bottleImage && imageAspect > 0) {
      ctx.drawImage(this.bottleImage, centerX - drawWidth * 0.5, topY, drawWidth, bottleHeight);
    }

    const interiorTop = shoulderBottomY + (bodyBottomY - shoulderBottomY) * 0.08;
    const interiorBottom = bottomY - wallThickness * 1.2;
    const interiorWidth = bodyWidth - wallThickness * 2;
    const interiorHeight = Math.max(interiorBottom - interiorTop, 0);
    const interiorX = centerX - interiorWidth * 0.5;
    const interiorY = interiorTop;

    this.bottleInteriorRect.setTo(interiorX, interiorY, interiorWidth, interiorHeight);

    const glowCenterX = interiorX + interiorWidth * 0.5;
    const glowCenterY = interiorY + interiorHeight * 0.5;

    if (this.bottleGlow) {
      this.bottleGlow.setPosition(glowCenterX, glowCenterY);
      this.bottleGlow.width = interiorWidth;
      this.bottleGlow.height = interiorHeight;
      this.bottleGlow.displayWidth = interiorWidth;
      this.bottleGlow.displayHeight = interiorHeight;
    } else {
      this.bottleGlow = this.add.rectangle(glowCenterX, glowCenterY, interiorWidth, interiorHeight, 0x80b3ff, 0.12);
      this.bottleGlow.setVisible(false);
      this.bottleGlow.setDepth(-1);
    }

    const geometry = {
      centerX,
      bottomY,
      mouthBottomY,
      neckBottomY,
      neckWidth,
      bodyWidth,
      wallThickness,
      interiorHeight,
      interiorTop
    };

    this.rebuildBottlePhysics(geometry);
    const boundary = Math.max(width, height) * 0.01;
    this.matter.world.setBounds(0, 0, width, height, boundary, true, true, false, true);
  }

  private rebuildBottlePhysics(geometry: {
    centerX: number;
    bottomY: number;
    mouthBottomY: number;
    neckBottomY: number;
    neckWidth: number;
    bodyWidth: number;
    wallThickness: number;
    interiorHeight: number;
    interiorTop: number;
  }): void {
    this.bottleBodies.forEach((body) => this.matter.world.remove(body));
    this.bottleBodies = [];

    const { centerX, bottomY, mouthBottomY, neckBottomY, neckWidth, bodyWidth, wallThickness, interiorHeight, interiorTop } = geometry;

    const leftWallX = centerX - bodyWidth * 0.5 + wallThickness * 0.5;
    const rightWallX = centerX + bodyWidth * 0.5 - wallThickness * 0.5;
    const wallCenterY = interiorTop + interiorHeight * 0.5;
    const wallHeight = interiorHeight + wallThickness;

    const leftWall = this.matter.add.rectangle(leftWallX, wallCenterY, wallThickness, wallHeight, { isStatic: true });
    const rightWall = this.matter.add.rectangle(rightWallX, wallCenterY, wallThickness, wallHeight, { isStatic: true });

    const neckSegmentHeight = (neckBottomY - mouthBottomY) * 0.6;
    const neckSegmentY = mouthBottomY + neckSegmentHeight * 0.5;

    const neckLeft = this.matter.add.rectangle(
      centerX - neckWidth * 0.5,
      neckSegmentY,
      wallThickness,
      neckSegmentHeight,
      { isStatic: true }
    );

    const neckRight = this.matter.add.rectangle(
      centerX + neckWidth * 0.5,
      neckSegmentY,
      wallThickness,
      neckSegmentHeight,
      { isStatic: true }
    );

    const base = this.matter.add.rectangle(
      centerX,
      bottomY - wallThickness * 0.5,
      bodyWidth - wallThickness,
      wallThickness,
      { isStatic: true }
    );

    const bodies = [leftWall, rightWall, neckLeft, neckRight, base];
    bodies.forEach((body) => {
      body.restitution = 0.12;
      body.friction = 0.01;
    });

    this.bottleBodies = bodies;
  }

  private onResize(gameSize: Phaser.Structs.Size): void {
    this.redrawBottle(gameSize.width, gameSize.height);
  }

  private cleanupBottle(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.bottleBodies.forEach((body) => this.matter.world.remove(body));
    this.bottleBodies = [];
    this.bottleGlow?.destroy();
    this.bottleGlow = undefined;
    this.bottleCanvas?.remove();
    this.bottleCanvas = undefined;
    this.bottleContext = null;
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
