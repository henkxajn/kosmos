// CvBattleStager — powtarzalne starcie do oglądania efektów walki (ARC COMBAT VISUALS, krok CV-2a, Finding 634; §2.10).
// Rozpięte w `KOSMOS.debug` (GameScene). Wszystkie wywołania bez cudzysłowów:
//   cvBattle()                          — 10 na 10 w oglądanym układzie, mieszane kadłuby (fregata / niszczyciel / krążownik)
//                                         i broń (laser / kinetyk / rakieta), ziarno 1; gra na PAUZIE — start: wznowienie czasu
//   cvBattle({nA: 5, nB: 5, seed: 7})   — mniejsze starcie, inne ziarno; to samo ziarno = ta sama bitwa (rundy, strzały, wynik)
//   cvBattle({nA: 4, nB: 4, split: 1})  — ARC CV-3a2 (Finding 638): starcia PARAMI — każda para A_i–B_i zaczyna własne starcie
//                                         (rozkaz „Zaangażuj” przed starciem: ścieżka zamiaru gracza w DSCS), więc w jednym
//                                         miejscu toczy się kilka starć — jedna bitwa na ekranie: jeden wiersz karty, jeden baner
//   cvBattle({atBody: 1})               — ARC CV-3a3 (D-CV-4): bitwa PRZY CIELE — statki gracza na orbicie pierwszej wolnej
//                                         planety oglądanego układu, wróg obok; DSCS przypina wroga do ciała (jak w grze).
//                                         `atBody: 'id_ciała'` — wskazane ciało; `mixed: 1` — przy ciele mniejszość statków
//                                         gracza, wróg wolny (skorupa obraca się w stronę wroga)
//   ARC CV-3a3 (Finding 654) — uzbrojenie LUSTRZANE: statek B_i ma kadłub i broń statku A_i
//   cvBattle({warp: 1})                 — ARC CV-1a: statki testowe z ZAPASEM warp (tylko wygląd: resolver bierze model
//                                         `warp_*` — z `cvIncoming(1)` modele właściciela z pierścieniem rdzenia warp);
//                                         `warp: 2` — tylko strona A. Walka bez zmian (DSCS nie czyta `warpFuel`)
//   cvParade()                          — ARC CV-1a: PARADA 24 slotów modeli (12 klas × bez warp / warp) w oglądanym układzie,
//                                         każdy statek z rozkazem lotu w tym samym kierunku (gra na pauzie — start: wznowienie
//                                         czasu); `cvParade({dir: 90})` — kierunek w stopniach. Do sprawdzenia „dziobem
//                                         naprzód” (także `nonwarp_large_science` — Finding 621), smugi w dyszy, świateł
//   cvBattle({nA: 3, nB: 3, battles: 3}) — ARC CV-6b2: trzy OSOBNE bitwy w oglądanym układzie (osobne klastry, ≥ 1 AU od siebie)
//                                         — pasek walki z kilkoma liniami; `battles: 4` — trzy linie i „+1”
//   cvBattle({warp: 1, star: 1})        — ARC CV-1a (kontrola właściciela): NAJPIERW przełącz widok na wygenerowany układ
//                                         z NAJCIEMNIEJSZĄ gwiazdą (`star: 1`) albo NAJJAŚNIEJSZĄ (`star: 2`), potem starcie tam;
//                                         `star: 0` / brak — oglądany układ jak dotąd. Do oceny czytelności statków pod
//                                         barwną gwiazdą (to samo w `cvParade({star: 1})`); odczyt `star` w wyniku
//   cvStrip(1) / cvStrip(0)             — ARC CV-6b2: flaga `cvStrip` (pasek walki zamiast karty walki) ON / OFF, od następnej klatki
//   cvFx(1) / cvFx(0)                   — flaga `cvFxEngine` (silnik FX z pulami) ON / OFF, od następnej salwy
//   cvModels(1) / cvModels(0)           — ARC CV-1a: flaga `cvModels` (statki w ramie kanonicznej z plików hardpointów) ON / OFF;
//                                         statki aktywnego układu przebudowane od razu
//   cvIncoming(1) / cvIncoming(0)       — ARC CV-1a: sloty z `hardpoints/incoming/index.json` biorą model z `incoming/` (podgląd
//                                         modeli właściciela PRZED podmianą slotu — CV-1b); zwraca Promise (await w konsoli)
//   cvLightTest(1) / cvLightTest(0)     — ARC CV-1a: testowy wzór punktów świetlnych na slotach bez `lights[]` (do CV-1c)
//   modelInfo()                         — ARC CV-1a: statki w ramie kanonicznej, hardpointy (plik / zapas), pula świateł
//   fxStats()                           — pomiar 300 klatek: czas klatki p50 / p95, wywołania i trójkąty renderera, pule
//
// Scena (dlaczego tak, punkt po punkcie — §1 Q9 / Finding 634):
//   · układ = OGLĄDANY (`activeSystemId`) — `teleportVessel` nigdy nie ustawiał `systemId`, a starcie w innym układzie nie
//     rysuje się wcale (Finding 453);
//   · miejsce = pusty punkt układu ≥ 1 AU od każdego innego statku i ≥ 0,5 AU od ciał — skład starcia zbiera statki
//     w promieniu 0,225 AU od środka (team-up), więc obcy statek w pobliżu wszedłby do bitwy;
//   · szyk = dwie linie po 5 na stronę, front 0,06 AU od środka — kinetyk i rakieta w zasięgu od pierwszej rundy, laser
//     dolatuje; wszyscy w promieniu team-up ⇒ całe 10 na 10 wchodzi do starcia naraz;
//   · gra na PAUZIE przed pierwszym tikiem, starcie założone od razu (`vessel:combatRangeEnter` pary ze środka), ziarno
//     starcia stałe (`seedBase` z `seed`), rozkazy `engage` wydane przed pierwszym tikiem — `DirectorRecall` omija statki
//     w aktywnym starciu, więc nie odwoła bezczynnych okrętów AI;
//   · statki są PRAWDZIWE (stan gry): nazwy `CV-A01…` / `CV-B01…`, znacznik `_cvBattle` (tylko w pamięci); autozapis
//     wyłączony do przeładowania strony; ⚠ nie zapisuj gry po teście — F5 bez zapisu wraca do stanu sprzed testu.
//   · ponowne `cvBattle()` po zakończonym starciu zdejmuje statki poprzedniego testu (bez linii w Dzienniku); w trakcie
//     starcia — odmowa `battle_in_progress`.
// Starcia orbitalne (`kind: 'orbital'`) — CV-8a.

import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { GAME_CONFIG, STAR_TYPES } from '../config/GameConfig.js';
import { resolveVesselOrbitalRole } from '../data/OrbitalRolesData.js';   // ARC CV-3a3 — `atBody`: rola orbity jak przy przylocie
import { orbitClockSec } from '../utils/SimClock.js';                     // ARC CV-3a3 — `atBody`: kąt orbity z zegara orbit

export const CV_BATTLE = Object.freeze({
  MAX_PER_SIDE: 10,
  PER_LINE: 5,
  FRONT_AU: 0.06,         // [AU] linia frontu od środka
  LINE_AU: 0.03,          // [AU] odstęp kolejnych linii
  ROW_AU: 0.035,          // [AU] odstęp statków w linii
  CLEAR_VESSEL_AU: 1.0,   // [AU] najbliższy obcy statek od środka
  CLEAR_BODY_AU: 0.5,     // [AU] najbliższe ciało od środka
  RINGS_AU: [2.5, 3.5, 5.0, 7.0, 1.6, 10.0],   // [AU] promienie szukania miejsca wokół gwiazdy
  ANGLES: 16,
  NAME_PREFIX: 'CV-',
  // ARC CV-3a3 — `cvBattle({ atBody })`: wróg w linii po jednej stronie ciała, `mixed` — wolni statki gracza między nimi
  BODY_ENEMY_AU: 0.07,    // [AU] linia wroga od środka ciała
  BODY_FREE_AU: 0.035,    // [AU] wolni statki gracza (`mixed`) od środka ciała, po stronie wroga
  BODY_ROW_AU: 0.02,      // [AU] odstęp w linii
  BODY_LINE_AU: 0.025,    // [AU] odstęp kolejnych linii (> 5 statków)
  WARP_TANK: 10,          // [warp_cores] zapas warp statku testowego `warp` (ARC CV-1a — tylko wybór modelu `warp_*`)
  PARADE_COLS: 6,         // ARC CV-1a — parada: kolumny siatki
  PARADE_STEP_AU: 0.02,   // [AU] odstęp statków parady
  PARADE_RUN_AU: 3.0,     // [AU] cel lotu parady od pozycji startowej
  WARNING: '⚠ cvBattle: statki testowe weszły do stanu gry — nie zapisuj gry po teście (F5 bez zapisu wraca do stanu sprzed testu). Autozapis wyłączony do przeładowania strony.',
});

const HULL_KEYS = Object.freeze({ frigate: 'hull_frigate', destroyer: 'hull_destroyer', battleship: 'hull_cruiser', cruiser: 'hull_cruiser' });
const HULL_CYCLE = ['frigate', 'destroyer', 'battleship'];
const WEAPON_KEYS = Object.freeze({ laser: 'weapon_laser', kinetic: 'weapon_kinetic', missile: 'weapon_missile' });
const WEAPON_CYCLE = ['laser', 'kinetic', 'missile'];
// Sloty użytkowe: fregata 3, niszczyciel 4, krążownik 5 — jeden na obronę, reszta broń (HullsData).
const HULL_LOADOUT = Object.freeze({
  frigate:    { weapons: 2, defence: 'armor_standard' },
  destroyer:  { weapons: 3, defence: 'shield_basic' },
  battleship: { weapons: 4, defence: 'shield_basic' },
});

function pickName(spec, cycle, keys, i) {
  if (Array.isArray(spec) && spec.length) return pickName(spec[i % spec.length], cycle, keys, i);
  if (typeof spec === 'string' && keys[spec]) return spec;
  return cycle[i % cycle.length];
}

/** Broń statku: 2 × broń główna, dalej kolejne typy z cyklu (przy broni „mixed”); stały typ — wszystkie sloty ten sam. */
function weaponModules(hullName, primary, fixed) {
  const n = HULL_LOADOUT[hullName].weapons;
  const out = [];
  const start = WEAPON_CYCLE.indexOf(primary);
  for (let w = 0; w < n; w++) {
    const name = fixed ? primary : WEAPON_CYCLE[(start + Math.max(0, w - 1)) % WEAPON_CYCLE.length];
    out.push(WEAPON_KEYS[name]);
  }
  return out;
}

/**
 * Czysty szyk starcia (bez świata): kadłub, moduły, nazwa i przesunięcie od środka w AU dla każdego statku.
 * Ten sam szyk buduje keeper `cv_fx_results_smoke` — bitwa z keepera to bitwa z konsoli.
 * ARC CV-3a3 (Finding 654, decyzja właściciela §3.2-10 (1)) — uzbrojenie LUSTRZANE: statek strony B o indeksie i ma
 *   kadłub i broń statku strony A o tym samym indeksie (dawniej broń strony B przesunięta o jedną pozycję w cyklu —
 *   fregaty gracza z laserem 0,05 AU przeciw fregatom AI z kinetykiem 0,15 AU przy liniach 0,12 AU od siebie). Asymetrie
 *   DSCS (strona A strzela pierwsza, techy tylko gracza) to mechanika — nietknięte.
 * @param {{ nA?: number, nB?: number, hulls?: string|string[], weapons?: string|string[] }} [opts]
 * @returns {{ ships: Array<{side:'A'|'B', index:number, name:string, hull:string, hullName:string, modules:string[], dxAU:number, dyAU:number}>,
 *             trigger: { a: number, b: number } }}  trigger — indeksy (w `ships`) pary ze środka frontu
 */
export function cvBattleLayout({ nA = 10, nB = 10, hulls = 'mixed', weapons = 'mixed' } = {}) {
  const clampN = (n) => Math.max(1, Math.min(CV_BATTLE.MAX_PER_SIDE, Math.floor(Number(n) || 0)));
  const fixedWeapon = typeof weapons === 'string' && !!WEAPON_KEYS[weapons];
  const ships = [];
  const trigger = { a: -1, b: -1 };
  for (const [side, n, sign, offset] of [['A', clampN(nA), -1, 0], ['B', clampN(nB), 1, 0]]) {
    let best = -1, bestDy = Infinity;
    for (let i = 0; i < n; i++) {
      const hullName = pickName(hulls, HULL_CYCLE, HULL_KEYS, i);
      const hullKey = hullName === 'cruiser' ? 'battleship' : hullName;
      const primary = pickName(weapons, WEAPON_CYCLE, WEAPON_KEYS, i + offset);
      const line = Math.floor(i / CV_BATTLE.PER_LINE);
      const k = i % CV_BATTLE.PER_LINE;
      const inLine = Math.min(CV_BATTLE.PER_LINE, n - line * CV_BATTLE.PER_LINE);
      const dxAU = sign * (CV_BATTLE.FRONT_AU + line * CV_BATTLE.LINE_AU);
      const dyAU = (k - (inLine - 1) / 2) * CV_BATTLE.ROW_AU;
      const modules = ['engine_ion', ...weaponModules(hullKey, primary, fixedWeapon), HULL_LOADOUT[hullKey].defence];
      ships.push({ side, index: i, name: `${CV_BATTLE.NAME_PREFIX}${side}${String(i + 1).padStart(2, '0')}`,
        hull: HULL_KEYS[hullKey], hullName: hullKey, modules, dxAU, dyAU });
      if (line === 0 && Math.abs(dyAU) < bestDy - 1e-12) { bestDy = Math.abs(dyAU); best = ships.length - 1; }
    }
    trigger[side === 'A' ? 'a' : 'b'] = best;
  }
  return { ships, trigger };
}

/** Ziarno starcia DSCS (`seedBase`) z ziarna konsoli — liczba całkowita w [0, 2³¹). */
export function cvSeedBase(seed) {
  const s = Number.isFinite(Number(seed)) ? Math.floor(Number(seed)) : 1;
  return (Math.imul(s, 7919) >>> 0) & 0x7fffffff;
}

/**
 * Pusty punkt układu dla starcia (gameplay px): pierścienie wokół gwiazdy (0, 0), kąt startu z ziarna; pierwszy punkt
 * dalej niż `CLEAR_VESSEL_AU` od każdego statku i `CLEAR_BODY_AU` od każdego ciała. Brak — punkt najdalszy od statków.
 * @param {{ seed:number, vessels:Array<{x:number,y:number}>, bodies:Array<{x:number,y:number}>, auPx:number }} w
 */
export function cvBattleCenter({ seed = 1, vessels = [], bodies = [], auPx = 110 }) {
  const minD = (pts, x, y) => pts.reduce((m, p) => Math.min(m, Math.hypot(p.x - x, p.y - y)), Infinity);
  const a0 = ((cvSeedBase(seed) % 360) * Math.PI) / 180;
  let fallback = null;
  for (const rAU of CV_BATTLE.RINGS_AU) {
    for (let k = 0; k < CV_BATTLE.ANGLES; k++) {
      const a = a0 + (k * 2 * Math.PI) / CV_BATTLE.ANGLES;
      const x = Math.cos(a) * rAU * auPx, y = Math.sin(a) * rAU * auPx;
      const dv = minD(vessels, x, y) / auPx, db = minD(bodies, x, y) / auPx;
      if (dv >= CV_BATTLE.CLEAR_VESSEL_AU && db >= CV_BATTLE.CLEAR_BODY_AU) return { x, y, clear: true, dvAU: dv, dbAU: db };
      if (!fallback || dv > fallback.dvAU) fallback = { x, y, clear: false, dvAU: dv, dbAU: db };
    }
  }
  return fallback;
}

/**
 * ARC CV-3a3 — ciało bitwy `cvBattle({ atBody })`: id podane jako tekst (ciało oglądanego układu); inaczej pierwsza planeta
 * (potem księżyc, planetoida) wg id, przy której żaden obcy statek nie stoi bliżej niż `CLEAR_VESSEL_AU` (team-up 0,225 AU
 * wciągnąłby go do bitwy); brak takiej — pierwsza z listy. `vessels` — pozycje obcych statków (px rozgrywki).
 * @returns {object|null}
 */
export function cvBattleBody({ atBody, bodies = [], vessels = [], auPx = 110 }) {
  if (typeof atBody === 'string') return bodies.find((b) => b?.id === atBody) ?? null;
  const order = { planet: 0, moon: 1, planetoid: 2 };
  const cands = bodies.filter((b) => b && order[b.type] != null && Number.isFinite(b.x) && Number.isFinite(b.y))
    .sort((a, b) => (order[a.type] - order[b.type]) || (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
  const clear = cands.find((b) => vessels.every((v) => Math.hypot(v.x - b.x, v.y - b.y) / auPx >= CV_BATTLE.CLEAR_VESSEL_AU));
  return clear ?? cands[0] ?? null;
}

/**
 * ARC CV-3a3 — przesunięcie [AU] wroga (`side` 'B') albo wolnego statku gracza (`mixed`, 'Afree') od środka ciała: linie
 * po jednej stronie ciała w kierunku `a0` [rad], rząd w poprzek kierunku.
 */
export function cvBodyOffsetAU(kind, k, n, a0) {
  const dist = kind === 'B' ? CV_BATTLE.BODY_ENEMY_AU : CV_BATTLE.BODY_FREE_AU;
  const line = Math.floor(k / CV_BATTLE.PER_LINE), j = k % CV_BATTLE.PER_LINE;
  const inLine = Math.min(CV_BATTLE.PER_LINE, n - line * CV_BATTLE.PER_LINE);
  const r = dist + line * CV_BATTLE.BODY_LINE_AU, t = (j - (inLine - 1) / 2) * CV_BATTLE.BODY_ROW_AU;
  const ux = Math.cos(a0), uy = Math.sin(a0);
  return { dxAU: ux * r - uy * t, dyAU: uy * r + ux * t };
}

const isCvVessel = (v) => !!v && (v._cvBattle != null || (typeof v.name === 'string' && /^CV-[ABP]\d\d$/.test(v.name)));

/** ARC CV-1a — zapas warp na statku testowym (wyłącznie wybór modelu `warp_*`: resolver czyta `warpFuel.max > 0`). */
function cvApplyWarp(v, on) {
  if (on && v?.warpFuel) v.warpFuel.max = Math.max(v.warpFuel.max || 0, CV_BATTLE.WARP_TANK);
}

// ARC CV-1a — parada: kadłub i moduły, przy których resolver wybiera daną klasę modelu (rola z modułów: habitat → colony,
// science → science, reszta → cargo; klasy bojowe z kadłuba). Silnik w każdym — parada LECI.
const PARADE_CLASSES = Object.freeze([
  ['frigate', 'hull_frigate', 'weapon_laser'], ['destroyer', 'hull_destroyer', 'weapon_laser'], ['battleship', 'hull_cruiser', 'weapon_laser'],
  ['small_science', 'hull_small', 'science_lab'], ['small_cargo', 'hull_small', 'cargo_small'], ['small_colony', 'hull_small', 'habitat_pod'],
  ['medium_science', 'hull_medium', 'science_lab'], ['medium_cargo', 'hull_medium', 'cargo_small'], ['medium_colony', 'hull_medium', 'habitat_pod'],
  ['large_science', 'hull_large', 'science_lab'], ['large_cargo', 'hull_large', 'cargo_small'], ['large_colony', 'hull_large', 'habitat_pod'],
]);

/** ARC CV-1a — siatka parady: 24 wpisy (12 klas × bez warp / warp) z przesunięciem w AU od środka. */
export function cvParadeLayout({ cols = CV_BATTLE.PARADE_COLS, stepAU = CV_BATTLE.PARADE_STEP_AU } = {}) {
  const ships = [];
  for (const warp of [false, true]) {
    for (const [cls, hull, role] of PARADE_CLASSES) {
      const i = ships.length;
      const col = i % cols, row = Math.floor(i / cols);
      const rows = Math.ceil((PARADE_CLASSES.length * 2) / cols);
      ships.push({ i, cls, key: `${warp ? 'warp' : 'nonwarp'}_${cls}`, hull, modules: ['engine_chemical', role], warp,
        name: `${CV_BATTLE.NAME_PREFIX}P${String(i + 1).padStart(2, '0')}`,
        dxAU: (col - (cols - 1) / 2) * stepAU, dyAU: (row - (rows - 1) / 2) * stepAU });
    }
  }
  return ships;
}

/**
 * ARC CV-1a (kontrola właściciela) — układ do oglądania bitwy pod gwiazdą danej jasności: `star` 1 — klasa o NAJMNIEJSZEJ
 * jasności (`STAR_TYPES.luminosity`) wśród wygenerowanych układów, 2 — o NAJWIĘKSZEJ; w klasie oglądany układ, gdy pasuje,
 * inaczej pierwszy wg id. Liczby zamiast nazw — polecenia konsoli bez cudzysłowów.
 * @param {{ star: number, systems: Array<{id:string, cls:string|null}>, activeId?: string|null }} o
 * @returns {{ systemId: string, cls: string, classes: string[] }|null}
 */
export function cvPickStarSystem({ star, systems = [], activeId = null }) {
  const want = Number(star);
  if (want !== 1 && want !== 2) return null;
  const lum = (c) => STAR_TYPES[c]?.luminosity ?? 1;
  const known = systems.filter((s) => s && s.id && s.cls);
  if (!known.length) return null;
  const classes = [...new Set(known.map((s) => s.cls))].sort((a, b) => lum(a) - lum(b));
  const cls = want === 1 ? classes[0] : classes[classes.length - 1];
  const pool = known.filter((s) => s.cls === cls).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const pick = pool.find((s) => s.id === activeId) ?? pool[0];
  return { systemId: pick.id, cls, classes };
}

function pickAiEmpire(K) {
  const all = (K.empireRegistry?.listAll?.() ?? []).filter((e) => e?.id && e.id !== 'player');
  return all.find((e) => K.directorProduction?.capitalOf?.(e.id)) ?? all[0] ?? null;
}

/**
 * Pomocniki konsoli. `getRenderer` / `getSaveSystem` — GameScene podaje własne pola (autozapis: wyłącznie w pamięci).
 * @param {{ getRenderer?: ()=>object|null, getSaveSystem?: ()=>object|null }} [deps]
 */
export function cvBattleDebugHelpers({ getRenderer = () => window.KOSMOS?.threeRenderer ?? null, getSaveSystem = () => null } = {}) {
  // ARC CV-1a (kontrola właściciela) — `star` 1 / 2: widok na wygenerowany układ z najciemniejszą / najjaśniejszą gwiazdą
  // (ta sama droga co chipy układów — `starSystemManager.switchActiveSystem`). Zwraca odczyt albo odmowę.
  const switchToStar = (K, star) => {
    if (!star) return { ok: true, info: null };
    const ss = K.starSystemManager;
    if (!ss?.getAllSystems || !ss.switchActiveSystem) return { ok: false, reason: 'no_star_system_manager' };
    const systems = ss.getAllSystems().map((s) => {
      const st = EntityManager.get?.(s.starEntityId);
      return { id: s.id ?? s.systemId, cls: st?.spectralType ?? null, name: st?.name ?? null };
    });
    const pick = cvPickStarSystem({ star, systems, activeId: K.activeSystemId ?? null });
    if (!pick) return { ok: false, reason: 'no_system_for_star', star };
    const switched = pick.systemId !== K.activeSystemId;
    if (switched && ss.switchActiveSystem(pick.systemId) !== true) return { ok: false, reason: 'switch_failed', systemId: pick.systemId };
    const name = systems.find((s) => s.id === pick.systemId)?.name ?? null;
    return { ok: true, info: { system: pick.systemId, name, cls: pick.cls, switched, classes: pick.classes } };
  };
  return {
    /** Starcie testowe — patrz nagłówek. Zwraca odczyt sceny; ostrzeżenie także w konsoli. */
    cvBattle({ nA = 10, nB = 10, hulls = 'mixed', weapons = 'mixed', kind = 'deep', seed = 1, split = false, atBody = false, mixed = false, battles = 1, warp = 0, star = 0 } = {}) {
      if (kind === 'orbital') return { ok: false, reason: 'not_yet', step: 'CV-8a' };
      const K = window.KOSMOS ?? {};
      const vm = K.vesselManager, dscs = K.deepSpaceCombatSystem, mos = K.movementOrderSystem, ts = K.timeSystem;
      const home = K.homePlanet;
      if (!vm || !dscs || !mos || !ts || !home) return { ok: false, reason: 'no_world' };
      if (getRenderer()?._galaxyActive) return { ok: false, reason: 'galaxy_mode' };
      const all = vm.getAllVessels?.() ?? [...(vm._vessels?.values?.() ?? [])];

      // Poprzedni test: w trakcie starcia — odmowa; po starciu — statki zdjęte (rozbiórka bez linii w Dzienniku).
      const old = all.filter(isCvVessel);
      if (old.some((v) => dscs._findActiveEncounterContaining?.(v.id))) return { ok: false, reason: 'battle_in_progress' };
      for (const v of old) vm.destroyVessel?.(v.id, { reason: 'dismantled' });
      const sw = switchToStar(K, star);
      if (!sw.ok) return sw;
      const sys = K.activeSystemId ?? 'sys_home';

      const empire = pickAiEmpire(K);
      if (!empire) return { ok: false, reason: 'no_ai_empire' };

      if (!ts.isPaused) ts.pause?.();
      const ss = getSaveSystem();
      if (ss && '_autosaveInterval' in ss) ss._autosaveInterval = 0;   // tylko w pamięci — F5 przywraca ustawienie z menu

      const AU = GAME_CONFIG.AU_TO_PX;
      const others = (vm.getVesselsInSystem?.(sys) ?? []).filter((v) => !v.isWreck && v.position);
      const bodies = ['star', 'planet', 'moon', 'planetoid', 'asteroid', 'comet']
        .flatMap((t) => EntityManager.getByTypeInSystem?.(t, sys) ?? [])
        .filter((b) => Number.isFinite(b?.x) && Number.isFinite(b?.y));
      const c = cvBattleCenter({ seed, vessels: others.map((v) => v.position), bodies, auPx: AU });
      const layout = cvBattleLayout({ nA, nB, hulls, weapons });
      const warpOf = (s) => Number(warp) === 1 || (Number(warp) === 2 && s.side === 'A');   // ARC CV-1a — model `warp_*`

      // ARC CV-3a3 (D-CV-4, Finding 626) — bitwa PRZY CIELE: statki gracza na slotach orbit ciała (`OrbitalSpaceSystem.assignOrbit`
      // — sama zmiana `position` nie stawia sprite'a na orbicie), wróg w linii obok; starcie zakłada DSCS tak jak w grze: gdy
      // większość strony gracza stoi przy ciele, wróg zostaje do niego PRZYPIĘTY (`_freezeAsStationary` — `dockedAt`, bez orbity;
      // w logice stoi w środku ciała). `mixed` — przy ciele tylko mniejszość statków gracza, reszta wolna: wróg zostaje wolny,
      // skorupa ustawia się w stronę wroga. Statki przy ciele bez rozkazu „Zaangażuj” (rozkaz zdejmuje statek z orbity).
      if (atBody) {
        const oss = K.orbitalSpaceSystem;
        if (!oss) return { ok: false, reason: 'no_orbital_space' };
        const body = cvBattleBody({ atBody, bodies: bodies.filter((b) => b.type !== 'star'), vessels: others.map((v) => v.position), auPx: AU });
        if (!body) return { ok: false, reason: 'no_body', warning: CV_BATTLE.WARNING };
        const nAs = layout.ships.filter((s) => s.side === 'A').length, nBs = layout.ships.length - nAs;
        const nDock = mixed ? Math.max(1, Math.floor((nAs - 1) / 2)) : nAs;
        const a0 = ((cvSeedBase(seed) % 360) * Math.PI) / 180;
        let kFree = 0;
        const made = layout.ships.map((s) => {
          const v = vm.createAndRegister(s.hull, home.id, { name: s.name, modules: s.modules, systemId: sys });
          cvApplyWarp(v, warpOf(s));
          v.systemId = sys;
          v.status = 'idle';
          v.mission = null;
          v.serviceState = 'active';
          if (v.fuel) v.fuel.current = v.fuel.max = 9999;
          v._cvBattle = seed;
          if (s.side === 'B') {
            const o = cvBodyOffsetAU('B', s.index, nBs, a0);
            Object.assign(v.position, { x: body.x + o.dxAU * AU, y: body.y + o.dyAU * AU, state: 'orbiting', dockedAt: null });
            v.ownerEmpireId = empire.id; v.owner = empire.id; v.isEnemy = true;
          } else if (s.index < nDock) {
            Object.assign(v.position, { state: 'orbiting', dockedAt: body.id });
            oss.assignOrbit(body.id, v.id, resolveVesselOrbitalRole(v));
            const p = oss.getPosition(v.id, { x: body.x / 10, z: body.y / 10 }, orbitClockSec());
            v.position.x = p ? p.x * 10 : body.x;
            v.position.y = p ? p.z * 10 : body.y;
          } else {
            const o = cvBodyOffsetAU('Afree', kFree++, nAs - nDock, a0);
            Object.assign(v.position, { x: body.x + o.dxAU * AU, y: body.y + o.dyAU * AU, state: 'orbiting', dockedAt: null });
          }
          return v;
        });
        getRenderer()?._restoreActiveSystemVesselSprites?.();
        const sideA = made.filter((_, i) => layout.ships[i].side === 'A');
        const sideB = made.filter((_, i) => layout.ships[i].side === 'B');
        const ta = sideA[0], tb = sideB[0];
        EventBus.emit('vessel:combatRangeEnter', { vesselAId: ta.id, vesselBId: tb.id, sameFaction: false,
          distanceAU: Math.hypot(ta.position.x - tb.position.x, ta.position.y - tb.position.y) / AU });
        const enc = dscs._findActiveEncounterContaining?.(ta.id) ?? null;
        if (!enc) return { ok: false, reason: 'no_encounter', warning: CV_BATTLE.WARNING };
        for (const v of made) {
          if (enc.vesselStates.has(v.id)) continue;
          const foes = sideA.includes(v) ? sideB : sideA;
          EventBus.emit('vessel:combatRangeEnter', { vesselAId: v.id, vesselBId: foes[0].id, sameFaction: false, distanceAU: 0.1 });
        }
        enc.seedBase = cvSeedBase(seed);
        const free = sideA.filter((v) => v.position?.dockedAt == null);
        const orders = free.map((v, i) => mos.issueOrder(v.id, { type: 'engage', targetEntityId: sideB[i % sideB.length].id, issuedBy: 'cvBattle' }));
        const members = made.filter((v) => enc.vesselStates.has(v.id)).length;
        console.warn(CV_BATTLE.WARNING);
        return {
          ok: members === made.length, encounter: enc.id, system: sys, star: sw.info, seed, seedBase: enc.seedBase, atBody: true, mixed: !!mixed,
          body: body.id, bodyName: body.name ?? body.id, bodyType: body.type,
          docked: sideA.filter((v) => v.position?.dockedAt === body.id).length,
          enemyPinned: sideB.filter((v) => v.position?.dockedAt === body.id).length,
          sideA: sideA.length, sideB: sideB.length, members, engageOrders: `${orders.filter((o) => o?.ok).length}/${orders.length}`,
          empire: empire.name ?? empire.id, paused: !!ts.isPaused, cvFxEngine: !!GAME_CONFIG.FEATURES?.cvFxEngine,
          cvStage: !!GAME_CONFIG.FEATURES?.cvStage, autosave: ss ? 'off (do F5)' : 'n/a', warning: CV_BATTLE.WARNING,
        };
      }

      // ARC CV-6b2 — `battles: N` (2–5): N OSOBNYCH bitew w oglądanym układzie, każda nA na nB w innym pustym punkcie (≥ 1 AU
      // od statków poprzednich bitew — osobne klastry starć); nazwy kolejne (`CV-A01…` przez wszystkie bitwy), ziarno bitwy k =
      // ziarno + k. Do obejrzenia paska walki z kilkoma liniami i „+N”. Jedna bitwa (domyślnie) — ścieżka niżej bez zmian.
      const nBattles = Math.max(1, Math.min(5, Math.floor(Number(battles) || 1)));
      if (nBattles > 1 && !split) {
        const out = [];
        const placed = others.map((v) => v.position);
        const perSide = { A: layout.ships.filter((s) => s.side === 'A').length, B: layout.ships.filter((s) => s.side === 'B').length };
        let made = [];
        for (let k = 0; k < nBattles; k++) {
          const ck = k === 0 ? c : cvBattleCenter({ seed: seed + k, vessels: placed, bodies, auPx: AU });
          const ships = layout.ships.map((s) => {
            const idx = perSide[s.side] * k + s.index + 1;
            const name = `${CV_BATTLE.NAME_PREFIX}${s.side}${String(idx).padStart(2, '0')}`;
            const v = vm.createAndRegister(s.hull, home.id, { name, modules: s.modules, systemId: sys });
            cvApplyWarp(v, warpOf(s));
            Object.assign(v.position, { x: ck.x + s.dxAU * AU, y: ck.y + s.dyAU * AU, state: 'orbiting', dockedAt: null });
            v.systemId = sys; v.status = 'idle'; v.mission = null; v.serviceState = 'active';
            if (v.fuel) v.fuel.current = v.fuel.max = 9999;
            v._cvBattle = seed;
            if (s.side === 'B') { v.ownerEmpireId = empire.id; v.owner = empire.id; v.isEnemy = true; }
            placed.push(v.position);
            return v;
          });
          made = made.concat(ships);
          getRenderer()?._restoreActiveSystemVesselSprites?.();
          const sA = ships.filter((_, i) => layout.ships[i].side === 'A');
          const sB = ships.filter((_, i) => layout.ships[i].side === 'B');
          const ta = ships[layout.trigger.a], tb = ships[layout.trigger.b];
          EventBus.emit('vessel:combatRangeEnter', { vesselAId: ta.id, vesselBId: tb.id, sameFaction: false,
            distanceAU: Math.hypot(ta.position.x - tb.position.x, ta.position.y - tb.position.y) / AU });
          const enc = dscs._findActiveEncounterContaining?.(ta.id) ?? null;
          if (!enc) { out.push({ ok: false, reason: 'no_encounter' }); continue; }
          for (const v of ships) {
            if (enc.vesselStates.has(v.id)) continue;
            const foes = layout.ships[ships.indexOf(v)].side === 'A' ? sB : sA;
            EventBus.emit('vessel:combatRangeEnter', { vesselAId: v.id, vesselBId: foes[0].id, sameFaction: false, distanceAU: 0.1 });
          }
          enc.seedBase = cvSeedBase(seed + k);
          sA.forEach((v, i) => mos.issueOrder(v.id, { type: 'engage', targetEntityId: sB[i % sB.length].id, issuedBy: 'cvBattle' }));
          out.push({ ok: ships.every((v) => enc.vesselStates.has(v.id)), encounter: enc.id,
            centerAU: [Number((ck.x / AU).toFixed(3)), Number((ck.y / AU).toFixed(3))], clear: !!ck.clear });
        }
        console.warn(CV_BATTLE.WARNING);
        return {
          ok: out.length === nBattles && out.every((b) => b.ok), battles: out, system: sys, star: sw.info, seed, members: made.length,
          empire: empire.name ?? empire.id, paused: !!ts.isPaused, cvStrip: !!GAME_CONFIG.FEATURES?.cvStrip,
          autosave: ss ? 'off (do F5)' : 'n/a', warning: CV_BATTLE.WARNING,
        };
      }

      const made = layout.ships.map((s) => {
        const v = vm.createAndRegister(s.hull, home.id, { name: s.name, modules: s.modules, systemId: sys });
        cvApplyWarp(v, warpOf(s));
        Object.assign(v.position, { x: c.x + s.dxAU * AU, y: c.y + s.dyAU * AU, state: 'orbiting', dockedAt: null });
        v.systemId = sys;
        v.status = 'idle';
        v.mission = null;
        v.serviceState = 'active';
        if (v.fuel) v.fuel.current = v.fuel.max = 9999;
        v._cvBattle = seed;
        if (s.side === 'B') { v.ownerEmpireId = empire.id; v.owner = empire.id; v.isEnemy = true; }
        return v;
      });
      // Sprite'y od razu (gra stoi: bez tiku nie przyjdzie `vessel:positionUpdate`, który dokłada brakujące) — ta sama
      // metoda co powrót do układu; idempotentna.
      getRenderer()?._restoreActiveSystemVesselSprites?.();
      const sideA = made.filter((_, i) => layout.ships[i].side === 'A');
      const sideB = made.filter((_, i) => layout.ships[i].side === 'B');
      const ta = made[layout.trigger.a], tb = made[layout.trigger.b];

      // ARC CV-3a2 (Finding 638) — starcia parami: „Zaangażuj” A_i → B_i PRZED starciem, potem para po parze — DSCS zaczyna
      // starcie od samej pary (pominięcie zbierania przy zamiarze gracza), a statki już walczące w różnych starciach się nie
      // łączą: kilka starć w jednym miejscu. Ziarno starcia k = ziarno + k (ta sama bitwa przy tym samym ziarnie).
      if (split) {
        const pairs = Math.min(sideA.length, sideB.length);
        const orders = sideA.map((v, i) => mos.issueOrder(v.id, { type: 'engage', targetEntityId: sideB[i % sideB.length].id, issuedBy: 'cvBattle' }));
        const encs = [];
        for (let i = 0; i < Math.max(sideA.length, sideB.length); i++) {
          const a = sideA[Math.min(i, sideA.length - 1)], b = sideB[Math.min(i, sideB.length - 1)];
          EventBus.emit('vessel:combatRangeEnter', { vesselAId: a.id, vesselBId: b.id, sameFaction: false,
            distanceAU: Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) / AU });
          const e = dscs._findActiveEncounterContaining?.(a.id) ?? dscs._findActiveEncounterContaining?.(b.id);
          if (e && !encs.includes(e)) { e.seedBase = (cvSeedBase(seed) + encs.length) & 0x7fffffff; encs.push(e); }
        }
        const members = made.filter((v) => dscs._findActiveEncounterContaining?.(v.id)).length;
        console.warn(CV_BATTLE.WARNING);
        return {
          ok: members === made.length && encs.length >= Math.min(2, pairs), encounters: encs.map((e) => e.id), split: true, system: sys, star: sw.info, seed,
          centerAU: [Number((c.x / AU).toFixed(3)), Number((c.y / AU).toFixed(3))], clear: c.clear, sideA: sideA.length, sideB: sideB.length, members,
          engageOrders: `${orders.filter((o) => o?.ok).length}/${orders.length}`, empire: empire.name ?? empire.id, paused: !!ts.isPaused,
          cvFxEngine: !!GAME_CONFIG.FEATURES?.cvFxEngine, cvStage: !!GAME_CONFIG.FEATURES?.cvStage,
          autosave: ss ? 'off (do F5)' : 'n/a', warning: CV_BATTLE.WARNING,
        };
      }

      EventBus.emit('vessel:combatRangeEnter', {
        vesselAId: ta.id, vesselBId: tb.id, sameFaction: false,
        distanceAU: Math.hypot(ta.position.x - tb.position.x, ta.position.y - tb.position.y) / AU,
      });
      const enc = dscs._findActiveEncounterContaining?.(ta.id) ?? null;
      if (!enc) return { ok: false, reason: 'no_encounter', warning: CV_BATTLE.WARNING };
      // Statek poza promieniem team-up (nie powinien się zdarzyć przy tym szyku) dołącza parą z najbliższym przeciwnikiem.
      for (const v of made) {
        if (enc.vesselStates.has(v.id)) continue;
        const foes = layout.ships[made.indexOf(v)].side === 'A' ? sideB : sideA;
        const f = foes[0];
        EventBus.emit('vessel:combatRangeEnter', { vesselAId: v.id, vesselBId: f.id, sameFaction: false, distanceAU: 0.1 });
      }
      enc.seedBase = cvSeedBase(seed);
      const orders = sideA.map((v, i) => mos.issueOrder(v.id, { type: 'engage', targetEntityId: sideB[i % sideB.length].id, issuedBy: 'cvBattle' }));
      const members = made.filter((v) => enc.vesselStates.has(v.id)).length;
      console.warn(CV_BATTLE.WARNING);
      return {
        ok: members === made.length, encounter: enc.id, system: sys, star: sw.info, seed, seedBase: enc.seedBase,
        centerAU: [Number((c.x / AU).toFixed(3)), Number((c.y / AU).toFixed(3))], clear: c.clear,
        sideA: sideA.length, sideB: sideB.length, members, engageOrders: `${orders.filter((o) => o?.ok).length}/${orders.length}`,
        empire: empire.name ?? empire.id, paused: !!ts.isPaused, cvFxEngine: !!GAME_CONFIG.FEATURES?.cvFxEngine,
        cvStage: !!GAME_CONFIG.FEATURES?.cvStage,
        autosave: ss ? 'off (do F5)' : 'n/a', warning: CV_BATTLE.WARNING,
      };
    },

    /**
     * ARC CV-1a — PARADA 24 slotów modeli (12 klas × bez warp / warp) w pustym punkcie oglądanego układu; każdy statek dostaje
     * rozkaz lotu w tym samym kierunku (`dir` w stopniach, 0 = +X mapy) bez przyciągania do ciała — po wznowieniu czasu
     * wszystkie lecą równolegle, dziobem naprzód. Statki testowe jak w `cvBattle` (znacznik, autozapis wyłączony, zdejmowane
     * przy następnym `cvBattle` / `cvParade`; ⚠ nie zapisuj gry po teście).
     */
    cvParade({ dir = 0, seed = 1, star = 0 } = {}) {
      const K = window.KOSMOS ?? {};
      const vm = K.vesselManager, mos = K.movementOrderSystem, ts = K.timeSystem, dscs = K.deepSpaceCombatSystem;
      const home = K.homePlanet;
      if (!vm || !mos || !ts || !home) return { ok: false, reason: 'no_world' };
      if (getRenderer()?._galaxyActive) return { ok: false, reason: 'galaxy_mode' };
      const all = vm.getAllVessels?.() ?? [...(vm._vessels?.values?.() ?? [])];
      const old = all.filter(isCvVessel);
      if (old.some((v) => dscs?._findActiveEncounterContaining?.(v.id))) return { ok: false, reason: 'battle_in_progress' };
      for (const v of old) vm.destroyVessel?.(v.id, { reason: 'dismantled' });
      const sw = switchToStar(K, star);
      if (!sw.ok) return sw;
      const sys = K.activeSystemId ?? 'sys_home';
      if (!ts.isPaused) ts.pause?.();
      const ss = getSaveSystem();
      if (ss && '_autosaveInterval' in ss) ss._autosaveInterval = 0;
      const AU = GAME_CONFIG.AU_TO_PX;
      const others = (vm.getVesselsInSystem?.(sys) ?? []).filter((v) => !v.isWreck && v.position);
      const bodies = ['star', 'planet', 'moon', 'planetoid', 'asteroid', 'comet']
        .flatMap((t) => EntityManager.getByTypeInSystem?.(t, sys) ?? [])
        .filter((b) => Number.isFinite(b?.x) && Number.isFinite(b?.y));
      const c = cvBattleCenter({ seed, vessels: others.map((v) => v.position), bodies, auPx: AU });
      const a = (Number(dir) || 0) * Math.PI / 180;
      const run = { x: Math.cos(a) * CV_BATTLE.PARADE_RUN_AU * AU, y: Math.sin(a) * CV_BATTLE.PARADE_RUN_AU * AU };
      const made = [], orders = [];
      for (const s of cvParadeLayout()) {
        const v = vm.createAndRegister(s.hull, home.id, { name: s.name, modules: s.modules, systemId: sys });
        cvApplyWarp(v, s.warp);
        Object.assign(v.position, { x: c.x + s.dxAU * AU, y: c.y + s.dyAU * AU, state: 'orbiting', dockedAt: null });
        v.systemId = sys; v.status = 'idle'; v.mission = null; v.serviceState = 'active';
        if (v.fuel) v.fuel.current = v.fuel.max = 9999;
        v._cvBattle = 'parade';
        const r = mos.issueOrder(v.id, { type: 'moveToPoint', targetPoint: { x: v.position.x + run.x, y: v.position.y + run.y }, noBodySnap: true, issuedBy: 'cvParade' });
        orders.push(r?.ok ? 'ok' : (r?.reason ?? 'refused'));
        made.push({ name: v.name, key: s.key });
      }
      // Sprite'y PO rozkazach — kurs z misji ustawiony od razu, także na pauzie.
      getRenderer()?._restoreActiveSystemVesselSprites?.();
      console.warn(CV_BATTLE.WARNING);
      return { ok: orders.every((o) => o === 'ok'), ships: made.length, orders: orders.filter((o) => o === 'ok').length + '/' + orders.length,
        refused: [...new Set(orders.filter((o) => o !== 'ok'))], system: sys, star: sw.info, centerAU: [Number((c.x / AU).toFixed(3)), Number((c.y / AU).toFixed(3))],
        dir: Number(dir) || 0, paused: !!ts.isPaused, cvModels: !!GAME_CONFIG.FEATURES?.cvModels, warning: CV_BATTLE.WARNING };
    },

    /** Flaga `cvFxEngine`: cvFx(1) — ON, cvFx(0) — OFF, cvFx() — przełącz. Czytana w chwili salwy. */
    cvFx(on) {
      const F = GAME_CONFIG.FEATURES;
      F.cvFxEngine = on === undefined ? !F.cvFxEngine : !!on;
      return { cvFxEngine: F.cvFxEngine };
    },

    /** ARC CV-1a — flaga `cvModels` (rama kanoniczna): cvModels(1) — ON, cvModels(0) — OFF, cvModels() — przełącz. Czytana przy
     *  stawianiu statku — statki aktywnego układu przebudowane od razu. */
    cvModels(on) {
      const F = GAME_CONFIG.FEATURES;
      F.cvModels = on === undefined ? !F.cvModels : !!on;
      const rb = getRenderer()?.cvRebuildVesselSprites?.() ?? null;
      return { cvModels: F.cvModels, ...(rb ?? { rebuilt: 0 }) };
    },

    /** ARC CV-1a — modele z `incoming/` dla slotów z indeksu: cvIncoming(1) / cvIncoming(0) / cvIncoming() — przełącz. Promise. */
    cvIncoming(on) {
      const r = getRenderer();
      if (!r?.cvSetIncoming) return { ok: false, reason: 'no_renderer' };
      return r.cvSetIncoming(on === undefined ? !r._cvIncoming : !!on);
    },

    /** ARC CV-1a — testowy wzór punktów świetlnych: cvLightTest(1) / cvLightTest(0) / cvLightTest() — przełącz. */
    cvLightTest(on) {
      const r = getRenderer();
      if (!r?.cvSetLightTest) return { ok: false, reason: 'no_renderer' };
      return r.cvSetLightTest(on === undefined ? !r._cvLightTest : !!on);
    },

    /** ARC CV-1a — odczyt modeli: statki w ramie kanonicznej, hardpointy (plik / zapas), pula punktów świetlnych. */
    modelInfo() {
      const r = getRenderer();
      return r?.cvModelInfo ? r.cvModelInfo() : { ok: false, reason: 'no_renderer' };
    },

    /** ARC CV-3a1 — flaga `cvStage` (scena bitwy): cvStage(1) — ON, cvStage(0) — OFF, cvStage() — przełącz. Czytana co klatkę. */
    cvStage(on) {
      const F = GAME_CONFIG.FEATURES;
      F.cvStage = on === undefined ? !F.cvStage : !!on;
      return { cvStage: F.cvStage };
    },

    /** ARC CV-6b2 — flaga `cvStrip` (pasek walki zamiast karty): cvStrip(1) — ON, cvStrip(0) — OFF, cvStrip() — przełącz. Czytana co klatkę. */
    cvStrip(on) {
      const F = GAME_CONFIG.FEATURES;
      F.cvStrip = on === undefined ? !F.cvStrip : !!on;
      return { cvStrip: F.cvStrip };
    },

    /** ARC CV-3a1 — scena bitwy z tej klatki: klastry, stopień sceny, prowadnica, odstępy strzelec → cel w długościach fregaty. */
    stageInfo() {
      const r = getRenderer();
      if (!r?.stageInfo) return { ok: false, reason: 'no_renderer' };
      return r.stageInfo();
    },

    /** Pomiar 300 klatek (wynik w konsoli po ~5 s) + stan pul teraz. */
    fxStats(frames = 300) {
      const r = getRenderer();
      if (!r?.cvFxStats) return { ok: false, reason: 'no_renderer' };
      return r.cvFxStats(frames);
    },
  };
}
