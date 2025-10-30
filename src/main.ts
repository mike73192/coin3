import Phaser from 'phaser';
import { MainScene } from '@/scenes/MainScene';
import { HomeUI } from '@/ui/HomeUI';
import { gameState } from '@/services/GameStateManager';

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
      gravity: { y: 1 },
      debug: false
    }
  },
  scene: [MainScene]
};

const game = new Phaser.Game(gameConfig);
const scene = game.scene.getScene(SCENE_KEY) as MainScene;

let queue = Promise.resolve();

scene.events.once('create', () => {
  new HomeUI({
    onRecord: (coins) => enqueueAddition(coins),
    onKeyboardCoin: () => enqueueAddition(1)
  });
});

function enqueueAddition(amount: number): void {
  if (!amount || amount <= 0) {
    return;
  }
  queue = queue.then(() => processAddition(amount));
}

async function processAddition(amount: number): Promise<void> {
  let remaining = amount;
  while (remaining > 0) {
    const { added, overflow, jarFilled } = gameState.addCoins(remaining);
    if (added > 0) {
      await scene.enqueueCoins(added);
    }
    if (jarFilled) {
      await scene.waitForJarReady();
    }
    remaining = overflow;
  }
}

window.addEventListener('resize', () => {
  const newSize = computeSize();
  game.scale.resize(newSize.width, newSize.height);
});
