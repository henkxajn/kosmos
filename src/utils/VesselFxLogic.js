// ── Fleet Command Console — Vessel FX logic (pure, no THREE) ─────────────────
// Reguły fog-of-war (intel) + kolor frakcji dla efektów statków na mapie 3D.
// Czyste funkcje przyjmujące prymitywy (bez `window.KOSMOS`, bez THREE) — w pełni
// testowalne offline w Node ESM. ThreeRenderer deleguje tu z metod, składając
// wejścia z globali. Wzór: RaycasterPure.js.

// Czy endpoint (statek) jest „widoczny" dla gracza wg jakości intel.
// Own (isEnemy=false) zawsze widoczny. Wróg tylko przy contact/detailed.
// quality: 'unknown' | 'rumor' | 'contact' | 'detailed' | null
export function isEndpointVisibleByQuality(isEnemy, quality) {
  if (!isEnemy) return true;
  return quality === 'contact' || quality === 'detailed';
}

// AI STRIKES BACK pre-S3 (SB43, Finding 415) — czy wolno narysować pierścień ruchu statku (start / przylot / dok)
// w OGLĄDANYM układzie. Współrzędne są lokalne dla układu (gwiazda każdego układu w (0,0)), więc pierścień statku
// z innego układu stawał w miejscu bez statku; a ruch AI był widoczny bez wykrycia (bramka S2: 8 pierścieni od
// statków AI z innych układów przy widoku `sys_home`).
//   • układ statku = oglądany; brak pola (stary zapis) → `sys_home`; `null` (skok warp) → układ startu skoku;
//   • statek nie-gracza — tylko przy wykryciu pokazującym go W MIEJSCU (wywiad ≥ contact, jak smugi walki).
// in: { systemId, fromSystemId, activeSystemId, isEnemy, quality }
export function isMovementPulseVisible({ systemId, fromSystemId = null, activeSystemId, isEnemy, quality }) {
  const sys = systemId === undefined ? 'sys_home' : (systemId ?? fromSystemId ?? null);
  if (!sys || sys !== (activeSystemId ?? 'sys_home')) return false;
  return isEndpointVisibleByQuality(isEnemy, quality);
}

// POLISH P2a (CP7, Finding 453) — czy starcie w przestrzeni (DSCS) toczy się w OGLĄDANYM układzie. JEDNA reguła dla
// czterech wejść renderera (smugi i błyski salwy, auto-fokus kamery przy starcie, znacznik starcia, „Obserwuj”) — wzór
// SB43 (`isMovementPulseVisible`). Współrzędne są lokalne dla układu (gwiazda każdego układu w (0,0)), a ładunek salwy
// niesie migawki pozycji — bez tej reguły starcie z innego układu rysowało smugi, błyski i pierścień w pustym punkcie
// oglądanego układu, a auto-fokus i „Obserwuj” zbliżały tam kamerę (zmierzone: P2 §10.2).
//   • układ starcia = `encounter.location.systemId` (DSCS stempluje go przy utworzeniu — układ pary wyzwalającej);
//   • ta sama odpowiedź co `DeepSpaceCombatSystem.engagementView` (`'watched'` ⇔ w widoku): tempo starcia (CP4) i to, co
//     rysujemy, mówią o tym samym układzie; brak / pusty układ starcia ⇒ NIE w widoku (jak tam — fail-closed: lepiej
//     nie narysować niż narysować w złym układzie); brak oglądanego układu ⇒ `sys_home` (jak `TimeSystem._combatView`).
// in: { encounterSystemId, activeSystemId }
export function isEngagementInView({ encounterSystemId, activeSystemId }) {
  if (typeof encounterSystemId !== 'string' || encounterSystemId === '') return false;
  return encounterSystemId === (activeSystemId ?? 'sys_home');
}

// POLISH P2a (CP7, Finding 453) — przycisk „Obserwuj / Watch” panelu walki. Starcie w oglądanym układzie — kadruj;
// starcie w INNYM układzie — najpierw przełącz widok na układ starcia, potem kadruj (dziś kamera zbliżała się do pustego
// punktu oglądanego układu); nieznany układ starcia — nic (nie ma czego kadrować).
// in: { encounterSystemId, activeSystemId }  out: { switchTo: string|null, frame: boolean }
export function watchBattleAction({ encounterSystemId, activeSystemId }) {
  if (typeof encounterSystemId !== 'string' || encounterSystemId === '') return { switchTo: null, frame: false };
  if (isEngagementInView({ encounterSystemId, activeSystemId })) return { switchTo: null, frame: true };
  return { switchTo: encounterSystemId, frame: true };
}

// POLISH P2a (CP17, Findingi 455, 462) — starcie DSCS, w którym walczy gracz (strona A albo B gracza, starcie aktywne).
export function isPlayerEngagement(encounter) {
  if (!encounter?.isActive) return false;
  return encounter.sideA?.ownerEmpireId === 'player' || encounter.sideB?.ownerEmpireId === 'player';
}

// POLISH P2a (CP17, Findingi 455, 462) — czy statek jest widoczny NA MAPIE (koniec smugi salwy, model w pełnym kryciu,
// insygnia): własny zawsze; wróg — wywiad ≥ contact ALBO uczestnik aktywnego starcia z graczem. Wróg w starciu z graczem
// jest „ujawniony” na potrzeby rysowania: panel walki nazywa go od pierwszej rundy (nazwa, kadłub, broń, log strzałów),
// więc mapa nie zdradza niczego ponad panel. Dawniej salwa otwierająca (przy wywiadzie `rumor` — starcie rusza przy
// 0,3123 AU, „sensor lock” przy 0,30 AU) nie była rysowana wcale, a model wroga przez całe starcie miał krycie 0,5.
// Stan wywiadu (`IntelSystem`) — bez zmian; to wyłącznie reguła rysowania.
// in: { isEnemy, quality, inPlayerEngagement }
export function isEndpointVisibleInCombat({ isEnemy, quality, inPlayerEngagement = false }) {
  if (!isEnemy) return true;
  if (inPlayerEngagement) return true;
  return isEndpointVisibleByQuality(isEnemy, quality);
}

// POLISH P2a (Finding 457) — znacznik starcia (pierścień) żyje wg STANU starcia, nie wg czasu realnego. Dawniej odświeżała
// go wyłącznie salwa, a po 1600 ms CZASU REALNEGO bez strzału znikał — przy 400 ms na rundę także w trakcie starcia
// (rundy bez strzału: zbliżanie, odliczanie broni) i w pauzie (P2 §10.6: luki 416 ms i 1808 ms). Teraz: znacznik jest,
// dopóki starcie jest aktywne i w oglądanym układzie (`isEngagementInView`) — także w pauzie — i znika z jego końcem.
// Czas życia 1600 ms zostaje WYŁĄCZNIE dla jednorazowych „imitacji” bitew orbitalnych (`kind: 'burst'`).
// in: { markers: [{ id, kind: 'encounter'|'burst', lastTouchMs }], encounters: [{ id, isActive, systemId, point }],
//       activeSystemId, nowMs, burstTtlMs }   out: { upsert: [{ id, x, y }], dispose: [id] }
export const ENGAGEMENT_BURST_TTL_MS = 1600;
export function planEngagementMarkers({ markers = [], encounters = [], activeSystemId, nowMs, burstTtlMs = ENGAGEMENT_BURST_TTL_MS }) {
  const want = new Map();
  for (const e of encounters) {
    if (!e?.isActive || !e.id) continue;
    if (!isEngagementInView({ encounterSystemId: e.systemId, activeSystemId })) continue;
    if (!Number.isFinite(e.point?.x) || !Number.isFinite(e.point?.y)) continue;
    want.set(e.id, e.point);
  }
  const upsert = [];
  const dispose = [];
  const have = new Set();
  for (const m of markers) {
    if (!m?.id) continue;
    have.add(m.id);
    if (m.kind === 'burst') {
      if (nowMs - (m.lastTouchMs ?? 0) > burstTtlMs) dispose.push(m.id);
      continue;
    }
    if (!want.has(m.id)) dispose.push(m.id);
  }
  for (const [id, p] of want) if (!have.has(id)) upsert.push({ id, x: p.x, y: p.y });
  return { upsert, dispose };
}

// Resolver endpointu FX (gameplay coords — renderer aplikuje S()/skalę osobno).
// own → live; enemy unknown → visible:false (BRAK przecieku); rumor → positionLastKnown
// (NIE live — fog-of-war); contact/detailed → live.
// in: { isEnemy, livePos:{x,y}|null, quality, positionLastKnown:{x,y}|null }
// out: { x, y, visible } | null
export function resolveFxEndpointRaw({ isEnemy, livePos, quality, positionLastKnown }) {
  if (!livePos || !Number.isFinite(livePos.x) || !Number.isFinite(livePos.y)) return null;
  if (!isEnemy) return { x: livePos.x, y: livePos.y, visible: true };
  const q = quality ?? 'unknown';
  if (q === 'unknown') return { x: 0, y: 0, visible: false };
  if (q === 'rumor') {
    const p = positionLastKnown;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return { x: 0, y: 0, visible: false };
    return { x: p.x, y: p.y, visible: true };
  }
  return { x: livePos.x, y: livePos.y, visible: true };  // contact/detailed → live
}

// Kolor frakcji statku (0xRRGGBB). own=mint, enemy=archetyp(lub fallback red), wrak=szary.
// archetypeColor: '#RRGGBB' | 0xRRGGBB | null
export function factionColorRaw({ isWreck, isEnemy, archetypeColor }) {
  if (isWreck) return 0x888888;
  if (!isEnemy) return 0x44cc66;  // own mint (cargo-green)
  if (archetypeColor != null) {
    return typeof archetypeColor === 'string'
      ? parseInt(archetypeColor.replace('#', ''), 16)
      : archetypeColor;
  }
  return 0xff4466;  // fallback enemy red
}

// ── Efekty silnikowe / eksplozje (kolory + intensywność) ────────────────────
// Kolory jako stałe — jedno źródło prawdy (ThreeRenderer importuje).
export const EXHAUST_COLOR_DEFAULT = 0x66ccff;  // plume napędu (cyan)
export const EXHAUST_COLOR_ENEMY   = 0xff8844;  // plume wroga (ciepły pomarańcz)
export const EXPLOSION_RING_COLOR  = 0xff6622;  // pierścień uderzeniowy eksplozji
export const WRECK_EMISSIVE_COLOR  = 0xff2200;  // żarząca się poświata wraka (dogorywające reaktory)

// Kolor wydechu silnika (0xRRGGBB). Domyślnie cyan; wróg cieplejszy dla kontrastu.
export function exhaustColorRaw({ isEnemy = false } = {}) {
  return isEnemy ? EXHAUST_COLOR_ENEMY : EXHAUST_COLOR_DEFAULT;
}

// Gradient smugi plazmowej (vertex colors). apex = przy rufie (jasny), base = koniec
// smugi (ciemniejszy). Alpha (apex 1 → base 0) nadaje renderer z pozycji Y wierzchołka
// — tu tylko RGB (0..1). own = biało-niebieski→niebieski; wróg = biało-pomarańcz→czerwony.
export function exhaustGradientColors({ isEnemy = false } = {}) {
  if (isEnemy) {
    return { apex: { r: 1.0, g: 0.85, b: 0.55 }, base: { r: 1.0, g: 0.35, b: 0.10 } };
  }
  return { apex: { r: 0.85, g: 0.95, b: 1.0 }, base: { r: 0.30, g: 0.60, b: 1.0 } };
}

// Intensywność wydechu 0..1 wg stanu statku. Pełna w tranzycie, zero przy
// orbiting/docked/wrak. state: 'in_transit' | 'orbiting' | 'docked' | undefined.
export function exhaustIntensityRaw({ state, isWreck = false } = {}) {
  if (isWreck) return 0;
  return state === 'in_transit' ? 1 : 0;
}

// Rampa koloru kuli ognia eksplozji: progress 0→1 = biały → pomarańcz → czerwony.
// Zwraca {r,g,b} w 0..1 (renderer aplikuje przez color.setRGB — bez THREE tutaj).
export function explosionColorRaw(progress) {
  const p = Math.max(0, Math.min(1, progress));
  const lerp = (a, b, t) => a + (b - a) * t;
  if (p < 0.5) {
    // biały (1,1,1) → pomarańcz (1, 0.5, 0.1)
    const t = p / 0.5;
    return { r: 1, g: lerp(1, 0.5, t), b: lerp(1, 0.1, t) };
  }
  // pomarańcz (1, 0.5, 0.1) → czerwony (0.8, 0.05, 0)
  const t = (p - 0.5) / 0.5;
  return { r: lerp(1, 0.8, t), g: lerp(0.5, 0.05, t), b: lerp(0.1, 0.0, t) };
}
