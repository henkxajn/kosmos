// ═══════════════════════════════════════════════════════════════
// KOSMOS — Headless Environment
// ─────────────────────────────────────────────────────────────
// Musi być zaimportowany PIERWSZY w każdym entry point testów.
// Ustawia globalThis.window, document, localStorage, THREE, AudioContext.
// Monkey-patchuje Math.random na seeded PRNG (deterministic per KOSMOS_SEED).
// NIE modyfikuje żadnego pliku gry — tylko runtime overrides w Node.js.
// Browser ignoruje ten plik (nie jest importowany przez main.js).
// ═══════════════════════════════════════════════════════════════

// ── Seeded PRNG (xmur3 + mulberry32, kompatybilne z src/sim/rng.js) ─
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Seed ze zmiennej środowiskowej (runner ustawia przed każdą grą)
const seedStr = process.env.KOSMOS_SEED ?? 'kosmos-default';
let _rng = mulberry32(xmur3(seedStr)());
Math.random = () => _rng();

export function reseed(newSeed) {
  _rng = mulberry32(xmur3(String(newSeed))());
  Math.random = () => _rng();
  return _rng;
}
export function getSeed() { return seedStr; }
export const HEADLESS = true;

// ── Canvas 2D context — proxy: każda metoda to no-op, property get = '' ──
function _createCanvasContext() {
  const noop = () => {};
  const dummyImg = { data: new Uint8ClampedArray(4), width: 1, height: 1 };
  const baseCtx = {
    canvas: { width: 1920, height: 1080 },
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
    font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic',
    shadowBlur: 0, shadowColor: '#000', shadowOffsetX: 0, shadowOffsetY: 0,
    getImageData: () => dummyImg,
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => ({}),
    measureText: () => ({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }),
  };
  return new Proxy(baseCtx, {
    get(t, p) { return p in t ? t[p] : noop; },
    set(t, p, v) { t[p] = v; return true; },
  });
}

// ── HTMLElement mock ───────────────────────────────────────────────
function _createElement(tag) {
  const t = String(tag).toLowerCase();
  const el = {
    tagName: t.toUpperCase(),
    nodeType: 1,
    style: new Proxy({}, { get: () => '', set: () => true }),
    children: [],
    childNodes: [],
    classList: {
      add: () => {}, remove: () => {}, toggle: () => false, contains: () => false,
    },
    dataset: {},
    textContent: '',
    innerHTML: '',
    value: '',
    checked: false,
    disabled: false,
    id: '',
    className: '',
    width: 1920,
    height: 1080,
    clientWidth: 1920,
    clientHeight: 1080,
    offsetWidth: 1920,
    offsetHeight: 1080,
    scrollWidth: 1920,
    scrollHeight: 1080,
    scrollTop: 0,
    scrollLeft: 0,
    parentNode: null,
    parentElement: null,
    firstChild: null,
    lastChild: null,
    nextSibling: null,
    previousSibling: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    setAttribute: () => {},
    getAttribute: () => null,
    removeAttribute: () => {},
    hasAttribute: () => false,
    appendChild: (child) => { el.children.push(child); el.childNodes.push(child); if (child) child.parentNode = el; return child; },
    removeChild: (child) => {
      const i = el.children.indexOf(child);
      if (i >= 0) el.children.splice(i, 1);
      const j = el.childNodes.indexOf(child);
      if (j >= 0) el.childNodes.splice(j, 1);
      return child;
    },
    insertBefore: (n) => { el.children.push(n); return n; },
    replaceChild: (n) => n,
    contains: () => false,
    focus: () => {},
    blur: () => {},
    click: () => {},
    cloneNode: () => _createElement(tag),
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }),
    getContext: (type) => (typeof type === 'string' && type.startsWith('2d')) ? _createCanvasContext() : null,
    querySelector: () => null,
    querySelectorAll: () => [],
    toDataURL: () => 'data:,',
    toBlob: (cb) => cb && cb(null),
    play: () => Promise.resolve(),
    pause: () => {},
    load: () => {},
  };
  return el;
}

// ── localStorage mock ──────────────────────────────────────────────
const _localStore = new Map();
globalThis.localStorage = {
  getItem: (k) => (_localStore.has(k) ? _localStore.get(k) : null),
  setItem: (k, v) => { _localStore.set(k, String(v)); },
  removeItem: (k) => { _localStore.delete(k); },
  clear: () => { _localStore.clear(); },
  key: (i) => Array.from(_localStore.keys())[i] ?? null,
  get length() { return _localStore.size; },
};

// ── document mock ──────────────────────────────────────────────────
const _docBody = _createElement('body');
const _docHtml = _createElement('html');
const _docHead = _createElement('head');
const _elementsById = new Map();

globalThis.document = {
  body: _docBody,
  documentElement: _docHtml,
  head: _docHead,
  createElement: _createElement,
  createElementNS: (_ns, tag) => _createElement(tag),
  createTextNode: (text) => ({ textContent: text, nodeType: 3 }),
  createDocumentFragment: () => _createElement('fragment'),
  getElementById: (id) => {
    if (_elementsById.has(id)) return _elementsById.get(id);
    // Canvasy używane przez grę — zwracamy stub'y
    if (id === 'three-canvas' || id === 'ui-canvas' || id === 'planet-canvas' || id === 'event-layer') {
      const c = _createElement('canvas');
      c.id = id;
      _elementsById.set(id, c);
      return c;
    }
    return null;
  },
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
  readyState: 'complete',
  visibilityState: 'visible',
  hidden: false,
  cookie: '',
  title: 'KOSMOS Headless',
  fonts: { ready: Promise.resolve(), load: () => Promise.resolve() },
};

// ── window (alias na globalThis) ───────────────────────────────────
globalThis.window = globalThis;

// Properties window-like
globalThis.innerWidth = 1920;
globalThis.innerHeight = 1080;
globalThis.devicePixelRatio = 1;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.dispatchEvent = () => true;
globalThis.location = {
  reload: () => { /* noop — nie reload w headless */ },
  href: 'http://headless-test/',
  origin: 'http://headless-test',
  pathname: '/',
  search: '',
  hash: '',
};
globalThis.performance = globalThis.performance ?? { now: () => Date.now() };
globalThis.requestAnimationFrame = () => 0; // NO-OP — nie uruchamiamy render loop
globalThis.cancelAnimationFrame = () => {};
globalThis.alert = () => {};
globalThis.confirm = () => true;
globalThis.prompt = () => '';
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
globalThis.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });

// Helpery z main.js (loading screen)
globalThis._showLoadingScreen = () => {};
globalThis._updateLoading = () => {};
globalThis._hideLoadingScreen = () => {};
globalThis._startMainGame = () => {};

// setTimeout: dla ms==0 wykonaj synchronicznie (niektóre ścieżki gry używają setTimeout(0) dla kolejkowania)
globalThis.__origSetTimeout = globalThis.setTimeout;
globalThis.__origClearTimeout = globalThis.clearTimeout;
globalThis.setTimeout = (cb, ms, ...args) => {
  if (!ms || ms === 0) {
    try { cb(...args); } catch (e) { console.error('[setTimeout-sync]', e); }
    return 0;
  }
  return globalThis.__origSetTimeout(cb, ms, ...args);
};
globalThis.clearTimeout = (id) => { if (id) globalThis.__origClearTimeout(id); };

// ── THREE mock — proxy zwracający klasy-stubby ─────────────────────
class ThreeStub {
  constructor() { return new Proxy(this, { get: (t, p) => p in t ? t[p] : (() => this) }); }
}
globalThis.THREE = new Proxy({}, {
  get(_t, prop) {
    if (prop === '__esModule') return false;
    if (prop === 'then') return undefined;
    return ThreeStub;
  },
});

// ── AudioContext mock (dla AudioSystem jeśli trzeba) ──────────────
class AudioContextStub {
  constructor() { return new Proxy(this, { get: () => () => this }); }
}
globalThis.AudioContext = AudioContextStub;
globalThis.webkitAudioContext = AudioContextStub;
globalThis.Audio = AudioContextStub;

// ── Image mock ─────────────────────────────────────────────────────
globalThis.Image = class {
  constructor() {
    this.width = 1024; this.height = 1024;
    this.src = '';
    this.onload = null; this.onerror = null;
    this.addEventListener = () => {};
    this.removeEventListener = () => {};
  }
};
globalThis.HTMLImageElement = globalThis.Image;
globalThis.HTMLCanvasElement = class { getContext() { return _createCanvasContext(); } };
globalThis.OffscreenCanvas = class {
  constructor(w, h) { this.width = w; this.height = h; }
  getContext() { return _createCanvasContext(); }
};

// ── window.KOSMOS — jak w main.js ──────────────────────────────────
globalThis.KOSMOS = {
  scenario:   'civilization',
  civMode:    false,
  homePlanet: null,
  savedData:  null,
  // Stub audioSystem żeby GameScene nie tworzył realnego AudioContext
  audioSystem: {
    startMusic: () => {},
    stopMusic: () => {},
    playSound: () => {},
    setMusicVolume: () => {},
    setSfxVolume: () => {},
  },
};

// ── Logowanie startu ───────────────────────────────────────────────
if (!process.env.KOSMOS_QUIET) {
  console.log(`[env] Headless env ready. Seed="${seedStr}" Math.random=seeded`);
}
