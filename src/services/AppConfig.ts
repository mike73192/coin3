import rawConfigText from '../../config file.tet?raw';

export interface GraphicsConfig {
  panelWidth: number;
  minWidth: number;
  minHeight: number;
}

export interface PhysicsConfig {
  gravityX: number;
  gravityY: number;
  matterDebug: boolean;
}

export interface CoinConfig {
  jarCapacity: number;
  dropBatchSize: number;
  spawnIntervalMs: number;
  coinBounciness: number;
  coinFriction: number;
  coinStaticFriction: number;
  coinAirDrag: number;
  coinMass: number;
  coinScale: number;
  spawnHorizontalJitter: number;
  spawnStartY: number;
  spawnVelocityXMin: number;
  spawnVelocityXMax: number;
  spawnVelocityYMin: number;
  spawnVelocityYMax: number;
}

export interface UIConfig {
  keyboardCoinIncrement: number;
  maxRecordCoins: number;
  recordConversionBase: number;
  recordSliderFormula: string;
}

export interface LoggingConfig {
  consoleEnabled: boolean;
  maxEntries: number;
}

export interface AppConfig {
  graphics: GraphicsConfig;
  physics: PhysicsConfig;
  coins: CoinConfig;
  ui: UIConfig;
  logging: LoggingConfig;
}

type RawConfig = Record<string, Record<string, string>>;

const DEFAULT_CONFIG: AppConfig = {
  graphics: {
    panelWidth: 320,
    minWidth: 640,
    minHeight: 600
  },
  physics: {
    gravityX: 0,
    gravityY: 1,
    matterDebug: false
  },
  coins: {
    jarCapacity: 100,
    dropBatchSize: 6,
    spawnIntervalMs: 90,
    coinBounciness: 0.12,
    coinFriction: 0.45,
    coinStaticFriction: 0.9,
    coinAirDrag: 0.01,
    coinMass: 0.6,
    coinScale: 0.5,
    spawnHorizontalJitter: 20,
    spawnStartY: 120,
    spawnVelocityXMin: -1,
    spawnVelocityXMax: 1,
    spawnVelocityYMin: -1.8,
    spawnVelocityYMax: -0.2
  },
  ui: {
    keyboardCoinIncrement: 1,
    maxRecordCoins: 15,
    recordConversionBase: 45,
    recordSliderFormula: 'value * weight'
  },
  logging: {
    consoleEnabled: true,
    maxEntries: 500
  }
};

function parseRawConfig(text: string): RawConfig {
  const lines = text.split(/\r?\n/);
  const result: RawConfig = {};
  let currentSection: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
      continue;
    }

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      currentSection = trimmed.slice(1, -1).trim().toLowerCase();
      if (!result[currentSection]) {
        result[currentSection] = {};
      }
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0 || !currentSection) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    result[currentSection][key] = value;
  }

  return result;
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  if (value === 'true' || value === '1') {
    return true;
  }
  if (value === 'false' || value === '0') {
    return false;
  }
  return fallback;
}

function normalizeRange(a: number, b: number): [number, number] {
  return a <= b ? [a, b] : [b, a];
}

function parseString(value: string | undefined, fallback: string): string {
  if (value === undefined) {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function buildConfig(raw: RawConfig): AppConfig {
  const graphicsSection = raw['graphics'] ?? {};
  const physicsSection = raw['physics'] ?? {};
  const coinsSection = raw['coins'] ?? {};
  const uiSection = raw['ui'] ?? {};
  const loggingSection = raw['logging'] ?? {};

  const jarCapacity = Math.max(1, Math.round(parseNumber(coinsSection['jarCapacity'], DEFAULT_CONFIG.coins.jarCapacity)));
  const dropBatchSize = Math.max(1, Math.round(parseNumber(coinsSection['dropBatchSize'], DEFAULT_CONFIG.coins.dropBatchSize)));
  const spawnIntervalMs = Math.max(16, Math.round(parseNumber(coinsSection['spawnIntervalMs'], DEFAULT_CONFIG.coins.spawnIntervalMs)));
  const spawnHorizontalJitter = Math.max(0, Math.round(parseNumber(coinsSection['spawnHorizontalJitter'], DEFAULT_CONFIG.coins.spawnHorizontalJitter)));
  const spawnStartY = Math.round(parseNumber(coinsSection['spawnStartY'], DEFAULT_CONFIG.coins.spawnStartY));
  const spawnVelocityXMin = parseNumber(coinsSection['spawnVelocityXMin'], DEFAULT_CONFIG.coins.spawnVelocityXMin);
  const spawnVelocityXMax = parseNumber(coinsSection['spawnVelocityXMax'], DEFAULT_CONFIG.coins.spawnVelocityXMax);
  const spawnVelocityYMin = parseNumber(coinsSection['spawnVelocityYMin'], DEFAULT_CONFIG.coins.spawnVelocityYMin);
  const spawnVelocityYMax = parseNumber(coinsSection['spawnVelocityYMax'], DEFAULT_CONFIG.coins.spawnVelocityYMax);
  const [normalizedVXMin, normalizedVXMax] = normalizeRange(spawnVelocityXMin, spawnVelocityXMax);
  const [normalizedVYMin, normalizedVYMax] = normalizeRange(spawnVelocityYMin, spawnVelocityYMax);

  return {
    graphics: {
      panelWidth: parseNumber(graphicsSection['panelWidth'], DEFAULT_CONFIG.graphics.panelWidth),
      minWidth: parseNumber(graphicsSection['minWidth'], DEFAULT_CONFIG.graphics.minWidth),
      minHeight: parseNumber(graphicsSection['minHeight'], DEFAULT_CONFIG.graphics.minHeight)
    },
    physics: {
      gravityX: parseNumber(physicsSection['gravityX'], DEFAULT_CONFIG.physics.gravityX),
      gravityY: parseNumber(physicsSection['gravityY'], DEFAULT_CONFIG.physics.gravityY),
      matterDebug: parseBoolean(physicsSection['matterDebug'], DEFAULT_CONFIG.physics.matterDebug)
    },
    coins: {
      jarCapacity,
      dropBatchSize,
      spawnIntervalMs,
      coinBounciness: Math.max(0, parseNumber(coinsSection['coinBounciness'], DEFAULT_CONFIG.coins.coinBounciness)),
      coinFriction: Math.max(0, parseNumber(coinsSection['coinFriction'], DEFAULT_CONFIG.coins.coinFriction)),
      coinStaticFriction: Math.max(0, parseNumber(coinsSection['coinStaticFriction'], DEFAULT_CONFIG.coins.coinStaticFriction)),
      coinAirDrag: Math.max(0, parseNumber(coinsSection['coinAirDrag'], DEFAULT_CONFIG.coins.coinAirDrag)),
      coinMass: Math.max(0.01, parseNumber(coinsSection['coinMass'], DEFAULT_CONFIG.coins.coinMass)),
      coinScale: Math.max(0.1, parseNumber(coinsSection['coinScale'], DEFAULT_CONFIG.coins.coinScale)),
      spawnHorizontalJitter,
      spawnStartY,
      spawnVelocityXMin: normalizedVXMin,
      spawnVelocityXMax: normalizedVXMax,
      spawnVelocityYMin: normalizedVYMin,
      spawnVelocityYMax: normalizedVYMax
    },
    ui: {
      keyboardCoinIncrement: Math.max(1, Math.round(parseNumber(uiSection['keyboardCoinIncrement'], DEFAULT_CONFIG.ui.keyboardCoinIncrement))),
      maxRecordCoins: Math.max(1, Math.round(parseNumber(uiSection['maxRecordCoins'], DEFAULT_CONFIG.ui.maxRecordCoins))),
      recordConversionBase: Math.max(1, Math.round(parseNumber(uiSection['recordConversionBase'], DEFAULT_CONFIG.ui.recordConversionBase))),
      recordSliderFormula: parseString(uiSection['recordSliderFormula'], DEFAULT_CONFIG.ui.recordSliderFormula)
    },
    logging: {
      consoleEnabled: parseBoolean(loggingSection['consoleEnabled'], DEFAULT_CONFIG.logging.consoleEnabled),
      maxEntries: Math.max(10, Math.round(parseNumber(loggingSection['maxEntries'], DEFAULT_CONFIG.logging.maxEntries)))
    }
  };
}

const rawConfig = parseRawConfig(rawConfigText ?? '');
export const appConfig: AppConfig = buildConfig(rawConfig);
