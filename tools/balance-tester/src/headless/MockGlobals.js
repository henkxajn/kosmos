// MockGlobals — minimalne stuby DOM/window/localStorage dla headless runtime
// Gra wymaga window.KOSMOS, document.getElementById, localStorage, rAF, performance

// Seeded PRNG (Mulberry32) — deterministyczny Math.random
function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Mock canvas + context (no-op)
function createMockCanvas() {
  return {
    width: 1280,
    height: 720,
    style: {},
    getContext: () => ({
      fillRect: () => {},
      clearRect: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      moveTo: () => {},
      lineTo: () => {},
      fillText: () => {},
      measureText: () => ({ width: 0 }),
      drawImage: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {},
      setTransform: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
    }),
    addEventListener: () => {},
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    toDataURL: () => '',
  };
}

// Mock localStorage (in-memory)
const _storage = new Map();
const mockLocalStorage = {
  getItem: (key) => _storage.get(key) ?? null,
  setItem: (key, val) => _storage.set(key, String(val)),
  removeItem: (key) => _storage.delete(key),
  clear: () => _storage.clear(),
};

/**
 * Instaluje globalne mocki wymagane przez moduły gry KOSMOS.
 * @param {number} [seed] — seed dla deterministycznego Math.random
 */
export function installMockGlobals(seed = Date.now()) {
  // window
  if (typeof globalThis.window === 'undefined') {
    globalThis.window = globalThis;
  }
  globalThis.window.KOSMOS = {};
  globalThis.window.innerWidth = 1280;
  globalThis.window.innerHeight = 720;
  globalThis.window.AudioContext = null;
  globalThis.window.webkitAudioContext = null;
  globalThis.window.addEventListener = globalThis.window.addEventListener || (() => {});
  globalThis.window.removeEventListener = globalThis.window.removeEventListener || (() => {});
  globalThis.window.location = globalThis.window.location || { reload: () => {} };

  // document
  if (typeof globalThis.document === 'undefined') {
    globalThis.document = {};
  }
  const mockCanvas = createMockCanvas();
  globalThis.document.getElementById = () => mockCanvas;
  globalThis.document.createElement = (tag) => {
    if (tag === 'canvas') return createMockCanvas();
    return { style: {}, appendChild: () => {}, removeChild: () => {}, addEventListener: () => {} };
  };
  globalThis.document.addEventListener = globalThis.document.addEventListener || (() => {});
  globalThis.document.removeEventListener = globalThis.document.removeEventListener || (() => {});
  globalThis.document.body = globalThis.document.body || {
    appendChild: () => {},
    removeChild: () => {},
    style: {},
  };
  globalThis.document.querySelector = () => null;
  globalThis.document.querySelectorAll = () => [];

  // localStorage
  if (typeof globalThis.localStorage === 'undefined') {
    globalThis.localStorage = mockLocalStorage;
  }

  // requestAnimationFrame / cancelAnimationFrame
  globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || ((cb) => setTimeout(cb, 16));
  globalThis.cancelAnimationFrame = globalThis.cancelAnimationFrame || ((id) => clearTimeout(id));

  // performance
  if (typeof globalThis.performance === 'undefined') {
    globalThis.performance = { now: () => Date.now() };
  }

  // Image mock (Three.js TextureLoader)
  if (typeof globalThis.Image === 'undefined') {
    globalThis.Image = class MockImage {
      constructor() {
        this.onload = null;
        this.onerror = null;
        this.src = '';
      }
      set src(val) {
        this._src = val;
        // Nie ładujemy obrazów w headless — cicho ignorujemy
      }
      get src() { return this._src || ''; }
    };
  }

  // HTMLCanvasElement (Three.js sprawdza typ)
  if (typeof globalThis.HTMLCanvasElement === 'undefined') {
    globalThis.HTMLCanvasElement = class MockHTMLCanvasElement {};
  }

  // Navigator
  if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { userAgent: 'node', platform: 'node' };
  }

  // Seeded PRNG
  const rng = mulberry32(seed);
  Math.random = rng;

  return { seed };
}

/**
 * Resetuj globalne mocki między runami (czyści localStorage i window.KOSMOS)
 * @param {number} [seed] — nowy seed
 */
export function resetMockGlobals(seed) {
  _storage.clear();
  globalThis.window.KOSMOS = {};
  if (seed !== undefined) {
    Math.random = mulberry32(seed);
  }
}
