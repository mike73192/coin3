import Phaser from 'phaser';
import { CoinFactory } from '@/services/CoinFactory';
import { gameState } from '@/services/GameStateManager';
import { appConfig } from '@/services/AppConfig';
import { debugLogger } from '@/services/DebugLogger';
import bottleImageUrl from '../../art/fb32b0195c07167f33583a0225f2b927-1.png';

const BACKGROUND_COLOR = '#e9f1f9';

const BOTTLE_IMAGE_WIDTH = 1000;
const BOTTLE_IMAGE_HEIGHT = 1000;
const BOTTLE_BOUND_LEFT = 285;
const BOTTLE_BOUND_RIGHT = 755;
const BOTTLE_BOUND_TOP = 106;
const BOTTLE_BOUND_BOTTOM = 960;
const BOTTLE_NECK_BOTTOM = 114;
const BOTTLE_BODY_START = 400;
const BOTTLE_BASE_START = 920;
const BOTTLE_BASE_BOTTOM = 960;
const BOTTLE_CENTER_OFFSET_RATIO = ((BOTTLE_BOUND_LEFT + BOTTLE_BOUND_RIGHT) * 0.5 - BOTTLE_IMAGE_WIDTH * 0.5) / BOTTLE_IMAGE_WIDTH;
const BOTTLE_WIDTH_RATIO = (BOTTLE_BOUND_RIGHT - BOTTLE_BOUND_LEFT) / BOTTLE_IMAGE_WIDTH;
const GLASS_THICKNESS_PX = 24;
const MIN_INTERIOR_WIDTH_PX = 48;

const BOTTLE_INTERIOR_PROFILE = [
  { imageY: 114, width: 207 },
  { imageY: 160, width: 329 },
  { imageY: 210, width: 305 },
  { imageY: 260, width: 298 },
  { imageY: 320, width: 330 },
  { imageY: 348, width: 401 },
  { imageY: 400, width: 461 },
  { imageY: 500, width: 465 },
  { imageY: 600, width: 457 },
  { imageY: 700, width: 451 },
  { imageY: 800, width: 441 },
  { imageY: 880, width: 432 },
  { imageY: 920, width: 386 },
  { imageY: 930, width: 86 }
];

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
  private initialCoinsRestored = false;

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

  restoreCoinDisplay(count: number): void {
    if (this.initialCoinsRestored || count <= 0) {
      return;
    }

    if (!this.coinFactory) {
      debugLogger.log('Coin factory not ready. Skipping restore request.', { count });
      return;
    }

    this.initialCoinsRestored = true;
    debugLogger.log('Restoring coin display for existing jar progress.', { count });
    void this.coinFactory.spawnCoins(count, 0);
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
      const batch = Math.min(appConfig.coins.dropBatchSize, this.pendingQueue);
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

    const imageReady = this.ensureBottleImage();

    const centerX = width * 0.5;
    const bottomY = height * 0.9;
    const bottleHeight = height * 0.72;
    const topY = bottomY - bottleHeight;

    const defaultBodyWidth = width * 0.32;
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
    }

    if (imageReady && this.bottleImage && imageAspect > 0) {
      ctx.drawImage(this.bottleImage, centerX - drawWidth * 0.5, topY, drawWidth, bottleHeight);
    }

    const jarCenterX = centerX + drawWidth * BOTTLE_CENTER_OFFSET_RATIO;
    const jarWidth = drawWidth * BOTTLE_WIDTH_RATIO;
    const jarToWorldY = (imageY: number) => topY + bottleHeight * (imageY / BOTTLE_IMAGE_HEIGHT);
    const jarTopY = jarToWorldY(BOTTLE_BOUND_TOP);
    const jarBottomY = jarToWorldY(BOTTLE_BOUND_BOTTOM);
    const jarBodyTopY = jarToWorldY(BOTTLE_BODY_START);
    const jarBaseStartY = jarToWorldY(BOTTLE_BASE_START);
    const jarBaseBottomY = jarToWorldY(BOTTLE_BASE_BOTTOM);
    const jarNeckBottomY = jarToWorldY(BOTTLE_NECK_BOTTOM);
    const wallThickness = Math.max(jarWidth * 0.025, 10);
    const boundsWidth = BOTTLE_BOUND_RIGHT - BOTTLE_BOUND_LEFT;

    const convertInteriorHalfWidth = (pixelWidth: number) => {
      const adjustedPx = Math.max(pixelWidth - GLASS_THICKNESS_PX * 2, MIN_INTERIOR_WIDTH_PX);
      const scaledWidth = jarWidth * (adjustedPx / boundsWidth);
      return Math.max(scaledWidth * 0.5, wallThickness * 0.65);
    };

    const leftPoints = BOTTLE_INTERIOR_PROFILE.map((point) => {
      const y = jarToWorldY(point.imageY);
      const halfWidth = convertInteriorHalfWidth(point.width);
      return { x: jarCenterX - halfWidth, y };
    });

    const rightPoints = BOTTLE_INTERIOR_PROFILE.map((point) => {
      const y = jarToWorldY(point.imageY);
      const halfWidth = convertInteriorHalfWidth(point.width);
      return { x: jarCenterX + halfWidth, y };
    });

    const bodyProfile = BOTTLE_INTERIOR_PROFILE.find((point) => point.imageY === 500) ?? BOTTLE_INTERIOR_PROFILE[6];
    const interiorWidth = convertInteriorHalfWidth(bodyProfile.width) * 2;
    const interiorTop = jarBodyTopY + (jarBaseStartY - jarBodyTopY) * 0.05;
    const interiorBottom = jarBaseStartY - Math.max(wallThickness * 1.5, 0);
    const interiorHeight = Math.max(interiorBottom - interiorTop, 0);
    const interiorX = jarCenterX - interiorWidth * 0.5;
    const interiorY = interiorTop;

    this.bottleInteriorRect.setTo(interiorX, interiorY, interiorWidth, interiorHeight);

    const glowCenterX = jarCenterX;
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

    const baseTopLeft = leftPoints[leftPoints.length - 2] ?? leftPoints[leftPoints.length - 1];
    const baseTopRight = rightPoints[rightPoints.length - 2] ?? rightPoints[rightPoints.length - 1];

    const geometry = {
      wallThickness,
      leftPoints,
      rightPoints,
      baseFloor: {
        x1: baseTopLeft.x,
        y1: baseTopLeft.y,
        x2: baseTopRight.x,
        y2: baseTopRight.y
      },
      neckTopY: jarToWorldY(Math.max(BOTTLE_NECK_BOTTOM - 10, BOTTLE_BOUND_TOP))
    };

    this.rebuildBottlePhysics(geometry);
    const boundary = Math.max(width, height) * 0.01;
    this.matter.world.setBounds(0, 0, width, height, boundary, true, true, false, true);
  }

  private rebuildBottlePhysics(geometry: {
    wallThickness: number;
    leftPoints: Array<{ x: number; y: number }>;
    rightPoints: Array<{ x: number; y: number }>;
    baseFloor: { x1: number; y1: number; x2: number; y2: number };
    neckTopY: number;
  }): void {
    this.bottleBodies.forEach((body) => this.matter.world.remove(body));
    this.bottleBodies = [];

    const { wallThickness, leftPoints, rightPoints, baseFloor, neckTopY } = geometry;

    if (!leftPoints.length || !rightPoints.length) {
      return;
    }

    const startY = Math.min(neckTopY, leftPoints[0].y - 2);
    const leftChain = [{ x: leftPoints[0].x, y: startY }, ...leftPoints];
    const rightChain = [{ x: rightPoints[0].x, y: startY }, ...rightPoints];

    const addSegment = (x1: number, y1: number, x2: number, y2: number) => {
      if (!Number.isFinite(x1 + y1 + x2 + y2)) {
        return;
      }

      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.hypot(dx, dy);
      if (length <= 1) {
        return;
      }

      const midX = (x1 + x2) * 0.5;
      const midY = (y1 + y2) * 0.5;
      const angle = Math.atan2(dy, dx);
      const body = this.matter.add.rectangle(midX, midY, length + wallThickness * 0.6, wallThickness, { isStatic: true });
      this.matter.body.setAngle(body, angle);
      body.restitution = 0.12;
      body.friction = 0.01;
      this.bottleBodies.push(body);
    };

    const appendSegments = (points: Array<{ x: number; y: number }>) => {
      for (let i = 0; i < points.length - 1; i += 1) {
        const current = points[i];
        const next = points[i + 1];
        addSegment(current.x, current.y, next.x, next.y);
      }
    };

    appendSegments(leftChain);
    appendSegments(rightChain);

    addSegment(baseFloor.x1, baseFloor.y1, baseFloor.x2, baseFloor.y2);

    const bottomLeft = leftPoints[leftPoints.length - 1];
    const bottomRight = rightPoints[rightPoints.length - 1];
    addSegment(bottomLeft.x, bottomLeft.y, bottomRight.x, bottomRight.y);
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
