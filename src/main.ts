import Phaser from 'phaser';
import { MainScene } from '@/scenes/MainScene';
import { HomeUI } from '@/ui/HomeUI';
import { gameState } from '@/services/GameStateManager';
import { debugLogger } from '@/services/DebugLogger';

const SCENE_KEY = 'MainScene';

const computeSize = () => {
  const panelWidth = 320;
  const width = Math.max(640, window.innerWidth - panelWidth);
  const height = Math.max(600, window.innerHeight);
  return { width, height };
};

const size = computeSize();
const mainSceneInstance = new MainScene();

const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: size.width,
  height: size.height,
  backgroundColor: '#e9f1f9',
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 1 },
      debug: false
    }
  },
  scene: [mainSceneInstance]
};

debugLogger.log('Bootstrapping application.');

const game = new Phaser.Game(gameConfig);

debugLogger.log('Phaser game initialized.');

let queue = Promise.resolve();
let scene: MainScene | null = null;

const setupHomeUI = (): void => {
  debugLogger.log('Initializing HomeUI instance.');
  new HomeUI({
    onRecord: (coins) => enqueueAddition(coins),
    onKeyboardCoin: () => enqueueAddition(1)
  });
  debugLogger.log('HomeUI ready.');
};

const bootstrapScene = (): void => {
  const mainScene = (game.scene.getScene(SCENE_KEY) as MainScene | undefined) ??
    (mainSceneInstance.sys ? mainSceneInstance : undefined);

  if (!mainScene) {
    debugLogger.log('Main scene not yet available during bootstrap. Retrying...');
    window.requestAnimationFrame(bootstrapScene);
    return;
  }

  scene = mainScene;
  const status = mainScene.sys?.settings?.status ?? Phaser.Scenes.INIT;

  if (status >= Phaser.Scenes.RUNNING) {
    setupHomeUI();
  } else {
    mainScene.events.once(Phaser.Scenes.Events.CREATE, setupHomeUI);
  }
};

if (game.isBooted) {
  bootstrapScene();
} else {
  game.events.once(Phaser.Core.Events.BOOT, bootstrapScene);
}

function enqueueAddition(amount: number): void {
  if (!amount || amount <= 0) {
    return;
  }
  debugLogger.log('Queueing coin addition.', { amount });
  queue = queue.then(() => processAddition(amount));
}

async function processAddition(amount: number): Promise<void> {
  let remaining = amount;
  debugLogger.log('Processing coin addition.', { amount });
  const mainScene = scene;
  if (!mainScene) {
    debugLogger.log('Main scene is not ready yet.');
    return;
  }
  while (remaining > 0) {
    const { added, overflow, jarFilled } = gameState.addCoins(remaining);
    if (added > 0) {
      await mainScene.enqueueCoins(added);
    }
    if (jarFilled) {
      debugLogger.log('Awaiting jar readiness after fill.');
      await mainScene.waitForJarReady();
    }
    remaining = overflow;
  }
  debugLogger.log('Coin addition completed.', { amount });
}

window.addEventListener('resize', () => {
  const newSize = computeSize();
  game.scale.resize(newSize.width, newSize.height);
});
