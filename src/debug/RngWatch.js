// RngWatch — przyrząd bramki CV-0b (ARC COMBAT VISUALS, Finding 612): KTO losuje ze strumienia gry (`Math.random`).
//
// Włączony owija `Math.random` licznikiem — opakowanie zwraca TĘ SAMĄ wartość co oryginał, więc strumień gry się nie
// zmienia — i przypisuje każde losowanie plikowi z pierwszej ramki stosu spoza tego modułu. Drugie wywołanie zdejmuje
// opakowanie i oddaje tabelę „plik → losowania” z werdyktem: po CV-0b warstwa wizualna (THREE, renderer, ekrany tła,
// kino bitwy, szum hex) ma ZERO losowań; losowania systemów gry (sloty orbit, kąty przylotu, rajder debugowy) są
// oczekiwane — to stan świata, który zostaje na `Math.random`.
// Konsola: KOSMOS.debug.rngWatch() — start; KOSMOS.debug.rngWatch() — stop + tabela. Tylko przyrząd, nie gra.

// Pliki warstwy wizualnej (basename). Każde losowanie z nich po CV-0b = błąd (powinny wołać `rendererRandom`).
export const VISUAL_SOURCES = Object.freeze([
  'three.core.js', 'three.module.js', 'ThreeRenderer.js', 'RendererRng.js', 'BattleView3D.js',
  'TitleScene.js', 'FactionSelectScene.js', 'EndgameScene.js', 'ScheduledEventPopup.js',
]);

const FRAME_RE = /((?:https?|file):\/\/[^\s)]+|\/[^\s)]*?\.m?js):(\d+):(\d+)/;

/** Ścieżka i basename pliku z pierwszej ramki stosu spoza RngWatch (`{ path, file }`; `file` = '?' gdy brak). */
export function sourceOfStack(stack) {
  const lines = String(stack ?? '').split('\n');
  for (const line of lines) {
    const m = line.match(FRAME_RE);
    if (!m) continue;
    const path = m[1].split('?')[0].split('#')[0];
    const file = path.split('/').pop();
    if (file === 'RngWatch.js') continue;
    return { path, file };
  }
  return { path: '?', file: '?' };
}

/** Czy źródło należy do warstwy wizualnej: lista plików, dowolny plik w `/src/renderer/` albo dodatek Three z CDN. */
export function isVisualSource(src) {
  if (!src) return false;
  if (VISUAL_SOURCES.includes(src.file)) return true;
  return src.path.includes('/src/renderer/') || src.path.includes('cdn.jsdelivr.net/npm/three');
}

/** Tabela z liczników: wiersze malejąco, suma warstwy wizualnej, werdykt. Czysta funkcja (keeper). */
export function summarizeTally(tally) {
  const rows = [...tally.values()]
    .map((r) => ({ file: r.file, draws: r.draws, visual: r.visual ? 'TAK' : 'nie' }))
    .sort((a, b) => b.draws - a.draws || a.file.localeCompare(b.file));
  const total = rows.reduce((s, r) => s + r.draws, 0);
  const visualDraws = rows.filter((r) => r.visual === 'TAK').reduce((s, r) => s + r.draws, 0);
  return { rows, total, visualDraws, verdict: visualDraws === 0 ? 'OK — warstwa wizualna: 0 losowań gry' : 'BŁĄD — warstwa wizualna losuje ze strumienia gry' };
}

/** Uruchom `fn` z licznikiem losowań gry (`Math.random` owinięty, ta sama wartość); zawsze przywraca oryginał. */
export function countGameDraws(fn) {
  const orig = Math.random;
  let gameDraws = 0;
  Math.random = function countingRandom() { gameDraws++; return orig(); };
  let result;
  try { result = fn(); } finally { Math.random = orig; }
  return { result, gameDraws };
}

let _orig = null;
let _tally = null;

/** Przełącznik: pierwsze wywołanie zakłada opakowanie, drugie zdejmuje i zwraca podsumowanie. */
export function rngWatchToggle(log = console) {
  if (_orig) {
    Math.random = _orig;
    _orig = null;
    const sum = summarizeTally(_tally);
    _tally = null;
    log.table?.(sum.rows);
    log.log?.(`[rngWatch] losowań gry: ${sum.total}, z warstwy wizualnej: ${sum.visualDraws} — ${sum.verdict}`);
    return sum;
  }
  const orig = Math.random;
  const tally = new Map();
  _orig = orig;
  _tally = tally;
  Math.random = function rngWatchRandom() {
    const v = orig();
    const src = sourceOfStack(new Error().stack);
    const row = tally.get(src.path) ?? { file: src.file, draws: 0, visual: isVisualSource(src) };
    row.draws++;
    tally.set(src.path, row);
    return v;
  };
  log.log?.('[rngWatch] liczenie losowań gry WŁĄCZONE — drugie KOSMOS.debug.rngWatch() pokaże tabelę');
  return { watching: true };
}
