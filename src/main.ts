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
  scene: [MainScene]
};

debugLogger.log('Bootstrapping application.');

let homeUIInitialized = false;

const setupHomeUI = (): void => {
  if (homeUIInitialized) {
    return;
  }
  homeUIInitialized = true;
  debugLogger.log('Initializing HomeUI instance.');
  new HomeUI({
    onRecord: (coins) => enqueueAddition(coins),
    onKeyboardCoin: () => enqueueAddition(1)
  });
  debugLogger.log('HomeUI ready.');
};

const game = new Phaser.Game(gameConfig);

debugLogger.log('Phaser game initialized.');

const mainSceneReady = new Promise<MainScene>((resolve) => {
  const resolveScene = (resolvedScene: MainScene) => {
    debugLogger.log('MainScene ready.');
    setupHomeUI();
    resolve(resolvedScene);
  };

  const maybeScene = game.scene.getScene(SCENE_KEY) as MainScene | undefined;

  if (maybeScene && maybeScene.sys.settings.status >= Phaser.Scenes.RUNNING) {
    resolveScene(maybeScene);
    return;
  }

  game.events.once(Phaser.Core.Events.READY, () => {
    const readyScene = game.scene.getScene(SCENE_KEY) as MainScene;
    resolveScene(readyScene);
  });
});

let queue = Promise.resolve();

function enqueueAddition(amount: number): void {
  if (!amount || amount <= 0) {
    return;
  }
  debugLogger.log('Queueing coin addition.', { amount });
  queue = queue.then(() => processAddition(amount));
}

async function processAddition(amount: number): Promise<void> {
  const scene = await mainSceneReady;
  let remaining = amount;
  debugLogger.log('Processing coin addition.', { amount });
  while (remaining > 0) {
    const { added, overflow, jarFilled } = gameState.addCoins(remaining);
    if (added > 0) {
      await scene.enqueueCoins(added);
    }
    if (jarFilled) {
      debugLogger.log('Awaiting jar readiness after fill.');
      await scene.waitForJarReady();
    }
    remaining = overflow;
  }
  debugLogger.log('Coin addition completed.', { amount });
}

window.addEventListener('resize', () => {
  const newSize = computeSize();
  game.scale.resize(newSize.width, newSize.height);
});
