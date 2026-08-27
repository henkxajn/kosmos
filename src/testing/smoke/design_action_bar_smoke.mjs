// Keeper — PRZYPIĘTA STOPKA AKCJI edytora projektów (ZAPISZ / WYCZYŚĆ).
//
// PO CO: picker modułów w slocie „utility" pokazuje ~30 modułów w 9 kategoriach
// (~850 px), a `_advanceToNextSlot` trzyma go OTWARTYM, dopóki gracz nie wypełni
// wszystkich slotów danego typu. Przyciski akcji leżały w tej samej przewijanej
// kolumnie PO pickerze, więc dokładnie w trakcie projektowania wypadały poza ekran
// i trzeba było ich szukać scrollem. Stopka jest teraz przypięta do dołu WIDOCZNEGO
// pasma — a to znaczy dwie rzeczy, które da się złamać niezależnie:
//   (1) przycisk jest WIDOCZNY niezależnie od scrolla,
//   (2) przycisk jest KLIKALNY — `_hitTest` bierze PIERWSZE trafienie, a treść pod
//       paskiem jest zarejestrowana WCZEŚNIEJ, więc bez `dropZonesInRect` klik
//       trafiałby w moduł schowany pod stopką (ghost-click).
// Oba pinujemy WYKONANIEM na prawdziwych klasach (UnitDesignOverlay importuje się
// pod node), nie odczytem źródła.
//
//   T1  standalone (klawisz U): `save_template` w dolnym paśmie widoku, przy DOWOLNYM scrollu
//   T2  KONTROLA PINU: stary kontrakt 4-argumentowy → przycisk POD widokiem (defekt odtworzony)
//   T3  ghost-click: żadna strefa treści nie nachodzi na pasek; `_hitTest` w środek trafia w ZAPISZ
//   T4  `dropZonesInRect` — semantyka nachodzenia + izolacja po osi X (prawa połowa nietknięta)
//   T5  host Stocznia: stopka przeżywa `pruneZones` i stoi w tym samym miejscu przy różnym scrollu
//   T6  rezerwa pasa: zwrócona wysokość treści pozwala wyscrollować ostatni wiersz SPOD paska
//   T7  brak napędu: pasek wyższy, ZAPISZ bez strefy (wyszarzony), WYCZYŚĆ dalej klikalny
//   T8  brak wybranego kadłuba → brak stopki (nie ma czego zapisywać)

import '../headless/env.js';           // MUSI być pierwszy (window/document/THREE + seeded RNG)
import { UnitDesignOverlay } from '../../ui/UnitDesignOverlay.js';
import { ShipyardOverlay }   from '../../ui/ShipyardOverlay.js';
import { dropZonesInRect }   from '../../ui/InfoPanelLayoutLogic.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// ── Mock ctx: nic nie rysuje, notuje clip-rect ──────────────────────────────
function mockCtx() {
  const clips = [];
  const ctx = {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
    textAlign: '', textBaseline: '',
    measureText: (s) => ({ width: (s ?? '').length * 6 }),
    fillText: () => {}, fillRect: () => {}, strokeRect: () => {},
    beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {},
    save: () => {}, restore: () => {}, clip: () => {}, setLineDash: () => {},
    _clips: clips,
  };
  ctx.rect = (x, y, w, h) => clips.push({ x, y, w, h });
  return ctx;
}

/** Świat minimalny: język, techy (wszystko odblokowane → picker pełnej długości), szablony. */
function stubWorld() {
  globalThis.window.KOSMOS = {
    lang: 'pl',
    civMode: true,
    techSystem: { isResearched: () => true },
    unitDesigns: [],
  };
}

/** Edytor z kadłubem średnim (2P + 4U), napędem w slocie 0 i OTWARTYM pickerem utility. */
function editorMidDesign() {
  const ov = new UnitDesignOverlay();
  ov.visible = true;
  ov._onHit({ type: 'select_hull', data: { hullId: 'hull_medium' } });
  ov._slotAssignments[0] = 'engine_ion';        // jest napęd → ZAPISZ aktywny
  ov._onHit({ type: 'select_slot', data: { index: 2 } });  // slot utility → picker otwarty
  return ov;
}

const zoneOf  = (zones, type) => zones.find(z => z.type === type) ?? null;
const overlaps = (z, r) => z.x < r.x + r.w && z.x + z.w > r.x && z.y < r.y + r.h && z.y + z.h > r.y;

const W = 1920, H = 1080;
const ov3Bounds = () => new UnitDesignOverlay()._getOverlayBounds(W, H);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\nT1 — standalone: ZAPISZ w dolnym paśmie widoku, przy dowolnym scrollu');
{
  stubWorld();
  const ov = editorMidDesign();
  const b = ov._getOverlayBounds(W, H);
  const viewBottom = b.oy + b.oh;

  const ys = [];
  for (const scroll of [0, 200, 5000]) {
    ov._scrollLeft = scroll;
    ov.draw(mockCtx(), W, H);
    const z = zoneOf(ov._hitZones, 'save_template');
    assert(!!z, `scroll=${scroll}: strefa ZAPISZ istnieje`);
    if (!z) continue;
    assert(z.y >= b.oy && z.y + z.h <= viewBottom + 0.5,
      `scroll=${scroll}: ZAPISZ wewnątrz widoku (y=${z.y.toFixed(0)}, dół=${viewBottom})`);
    assert(viewBottom - (z.y + z.h) < 20,
      `scroll=${scroll}: ZAPISZ przy DOLNEJ krawędzi (odstęp ${(viewBottom - z.y - z.h).toFixed(0)} px)`);
    ys.push(z.y);
  }
  assert(ys.length === 3 && ys.every(y => Math.abs(y - ys[0]) < 0.5),
    'pozycja stopki NIEZALEŻNA od scrolla (scroll-invariant)');

  // Picker naprawdę jest długi — inaczej test mierzyłby ciszę.
  const mods = ov._hitZones.filter(z => z.type === 'pick_module');
  assert(mods.length >= 20, `kontrola pinu: picker rysuje ${mods.length} modułów (długa kolumna)`);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\nT2 — KONTROLA PINU: stary kontrakt 4-argumentowy odtwarza defekt');
{
  stubWorld();
  const ov = editorMidDesign();
  const b = ov._getOverlayBounds(W, H);
  const viewBottom = b.oy + b.oh;

  ov._hitZones = [];
  ov._scrollLeft = 0;
  // Bez 5. argumentu = zachowanie legacy: pasek płynie z treścią.
  ov._drawShipDesigner(mockCtx(), b.ox, b.oy, Math.floor(b.ow / 2), b.oh);
  const z = zoneOf(ov._hitZones, 'save_template');
  assert(!!z, 'legacy: strefa ZAPISZ istnieje (tylko w złym miejscu)');
  assert(z && z.y > viewBottom,
    `legacy: ZAPISZ POD widokiem (y=${z?.y.toFixed(0)} > ${viewBottom}) — pin mierzy realną różnicę`);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\nT3 — ghost-click: treść pod paskiem nie kradnie kliknięcia');
{
  stubWorld();
  const b = ov3Bounds();
  const w = Math.floor(b.ow / 2);
  const viewBottom = b.oy + b.oh;

  // ⚠ scroll MUSI być taki, żeby treść naprawdę sięgała pasma stopki — przy dużym
  //   scrollu kolumna ucieka w GÓRĘ i test „zero intruzów" przechodziłby jałowo.
  const ov = editorMidDesign();
  ov._scrollLeft = 0;
  ov.draw(mockCtx(), W, H);

  const save = zoneOf(ov._hitZones, 'save_template');
  const clear = zoneOf(ov._hitZones, 'clear_design');
  assert(!!save && !!clear, 'obie strefy stopki zarejestrowane');

  const bar = { x: save.x - 8, y: save.y - 5, w, h: viewBottom - (save.y - 5) };

  // KONTROLA PINU (nie-jałowość): ten sam rysunek bez przypinania → policz, ile stref
  // treści LEŻY w paśmie stopki. Zero tutaj znaczyłoby, że test niczego nie pilnuje.
  const ref = editorMidDesign();
  ref._scrollLeft = 0;
  ref._hitZones = [];
  ref._drawShipDesigner(mockCtx(), b.ox, b.oy, w, b.oh);   // legacy: bez stopki i bez drop
  const wouldCollide = ref._hitZones.filter(z => overlaps(z, bar));
  assert(wouldCollide.length > 0,
    `kontrola pinu: bez stopki ${wouldCollide.length} stref treści leży w jej paśmie`);

  const intruders = ov._hitZones.filter(z =>
    z.type !== 'save_template' && z.type !== 'clear_design' && overlaps(z, bar));
  assert(intruders.length === 0,
    `zero stref treści pod paskiem (znaleziono: ${intruders.map(z => z.type).join(', ') || 'brak'})`);

  const hit = ov._hitTest(save.x + save.w / 2, save.y + save.h / 2);
  assert(hit?.type === 'save_template', `klik w środek paska trafia w ZAPISZ (dostał: ${hit?.type})`);

  assert(ov._hitZones.some(z => z.type === 'pick_module'),
    'kontrola pinu: picker nadal ma klikalne wiersze (odcięliśmy TYLKO te pod paskiem)');
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\nT4 — dropZonesInRect: semantyka nachodzenia + izolacja po osi X');
{
  const rect = { x: 100, y: 500, w: 200, h: 40 };
  const zones = [
    { x: 100, y: 400, w: 50, h: 20, type: 'nad' },        // nad paskiem — zostaje
    { x: 100, y: 495, w: 50, h: 20, type: 'wchodzi' },     // wchodzi górą — pada
    { x: 110, y: 510, w: 50, h: 20, type: 'w środku' },    // w środku — pada
    { x: 100, y: 535, w: 50, h: 20, type: 'wychodzi' },    // wychodzi dołem — pada
    { x: 100, y: 560, w: 50, h: 20, type: 'pod' },         // pod paskiem — zostaje
    { x: 400, y: 510, w: 50, h: 20, type: 'prawa' },       // inna kolumna (X) — zostaje
  ];
  dropZonesInRect(zones, rect);
  const left = zones.map(z => z.type);
  assert(left.length === 3, `zostały 3 strefy (${left.join(', ')})`);
  assert(left.includes('nad') && left.includes('pod'), 'strefy poza pasmem nietknięte');
  assert(left.includes('prawa'), 'inna kolumna X nietknięta (prawa połowa panelu bezpieczna)');
  assert(!left.includes('w środku') && !left.includes('wchodzi') && !left.includes('wychodzi'),
    'każde nachodzenie (górą / środkiem / dołem) usunięte');
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\nT5 — host Stocznia: stopka przeżywa pruneZones i stoi w miejscu');
{
  stubWorld();
  const editor = editorMidDesign();
  window.KOSMOS.overlayManager = { overlays: { unit_design: editor } };
  window.KOSMOS.colonyManager = {
    activePlanetId: 'p_home',
    getColony: () => null,
    getShipQueues: () => [],
  };

  const sy = new ShipyardOverlay();
  sy.visible = true;
  const b = sy._getOverlayBounds(W, H);
  const viewBottom = b.oy + b.oh;

  const ys = [];
  for (const scroll of [0, 600]) {
    sy._shipyardScrollY = scroll;
    sy.draw(mockCtx(), W, H);
    const z = zoneOf(sy._hitZones, 'save_template');
    assert(!!z, `scroll=${scroll}: ZAPISZ przetrwał przycinanie pasma (pruneZones)`);
    if (!z) continue;
    assert(z.y + z.h <= viewBottom + 0.5 && z.y >= b.oy,
      `scroll=${scroll}: ZAPISZ w widocznym paśmie Stoczni`);
    ys.push(z.y);
  }
  assert(ys.length === 2 && Math.abs(ys[0] - ys[1]) < 0.5,
    'stopka w Stoczni scroll-invariant');

  const hit = sy._hitTest(ys.length ? zoneOf(sy._hitZones, 'save_template').x + 10 : -1, ys[0] + 10);
  assert(hit?.type === 'save_template', `klik w Stoczni trafia w ZAPISZ (dostał: ${hit?.type})`);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\nT6 — rezerwa pasa: ostatni wiersz da się wyscrollować spod stopki');
{
  stubWorld();
  const ov = editorMidDesign();
  const b = ov._getOverlayBounds(W, H);
  const w = Math.floor(b.ow / 2);
  ov._scrollLeft = 0;
  ov._hitZones = [];
  const bottom = ov._drawShipDesigner(mockCtx(), b.ox, b.oy, w, b.oh, b.oy + b.oh);

  const content = ov._hitZones.filter(z => z.type !== 'save_template' && z.type !== 'clear_design');
  const lastY = content.reduce((m, z) => Math.max(m, z.y + z.h), b.oy);
  assert(bottom >= lastY + 34,
    `wysokość treści (${bottom.toFixed(0)}) zostawia pas ≥ 34 px pod ostatnim wierszem (${lastY.toFixed(0)})`);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\nT7 — brak napędu: pasek wyższy, ZAPISZ bez strefy, WYCZYŚĆ klikalny');
{
  stubWorld();
  const ov = new UnitDesignOverlay();
  ov.visible = true;
  ov._onHit({ type: 'select_hull', data: { hullId: 'hull_medium' } });   // sloty puste
  ov._onHit({ type: 'select_slot', data: { index: 2 } });
  ov.draw(mockCtx(), W, H);

  const b = ov._getOverlayBounds(W, H);
  const viewBottom = b.oy + b.oh;
  const save  = zoneOf(ov._hitZones, 'save_template');
  const clear = zoneOf(ov._hitZones, 'clear_design');

  assert(save === null, 'ZAPISZ bez strefy klik — wyszarzony przycisk nie może cicho nic nie robić');
  assert(!!clear, 'WYCZYŚĆ nadal klikalny');
  assert(clear && clear.y >= b.oy && clear.y + clear.h <= viewBottom + 0.5,
    'WYCZYŚĆ w widocznym paśmie');
  // Pasek z ostrzeżeniem jest wyższy (48 zamiast 34) — przycisk siedzi wyżej nad krawędzią.
  assert(clear && viewBottom - (clear.y + clear.h) >= 15,
    `wariant z ostrzeżeniem rezerwuje miejsce na linię „brak napędu" (${(viewBottom - clear.y - clear.h).toFixed(0)} px)`);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\nT8 — brak kadłuba → brak stopki');
{
  stubWorld();
  const ov = new UnitDesignOverlay();
  ov.visible = true;
  ov.draw(mockCtx(), W, H);
  assert(zoneOf(ov._hitZones, 'save_template') === null && zoneOf(ov._hitZones, 'clear_design') === null,
    'bez wybranego kadłuba stopka się nie pojawia');
  assert(ov._hitZones.some(z => z.type === 'select_hull'),
    'kontrola pinu: panel narysował się (są przyciski kadłubów)');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
