// G3 follow-up (h) — Finding 379: cudze jednostki naziemne na mapie ciała tylko wtedy, gdy gracz je widzi.
//
// Reguła (podpis właściciela 2026-10-05, `docs/design/AI_GARRISON_PLAN.md` §5z (h)): wroga jednostka naziemna jest
// rysowana, zaznaczalna i wypisywana wyłącznie, gdy zachodzi co najmniej jedno — (1) ciało jest kolonią gracza ·
// (2) gracz ma na ciele własne jednostki naziemne · (3) gracz ma wywiad `detailed` o jej właścicielu. Ciała bez kolonii
// obejmują (2) i (3). Własne — zawsze; ukryta (stealth) cudza — nigdy. Karta ciała G3-3 tą samą regułą: liczba przy
// `detailed` ALBO własnych jednostkach na ciele, inaczej „nieznany”.
//
//   V1  predykat na prawdziwym świecie: `unknown`/`rumor`/`contact` bez własnych jednostek — ukryta; `detailed` — widoczna;
//       własna żywa jednostka na ciele — widoczna; własna w ładowni albo martwa — się nie liczy; własne — zawsze;
//       stealth przy `detailed` i przy własnych jednostkach — ukryta.
//   V2  dwa imperia na jednym ciele: `detailed` tylko o jednym — drugie ukryte.
//   V3  kolonia gracza: cudza jednostka widoczna bez wywiadu.
//   V4  ciało bez kolonii: (2) i (3); warunek (1) czyta prawdziwą kolonię, nie podgląd mapy (pułapka `isPreview`).
//   V5  bez `IntelSystem`: fail-closed dla (3); (1) i (2) działają.
//   V6  klik (`visibleGroundUnitAt`): niewidoczna cudza — nic; widoczna — jak `getUnitAt`; parytet filtrów `getUnitAt`
//       (nie `moving`, nie `in_cargo`); ukryta pierwsza na heksie — klik bierze widoczną.
//   V7  wypisywanie: przełącznik heksu (lista po regule); przycinanie zaznaczenia — cudza jednostka, której gracz już nie
//       widzi, wypada (kompozycja `pruneUnitSelection` + odczyt przez regułę, jak w `ColonyOverlay`).
//   V8  karta ciała (`readGarrisonReadout` + `BottomContext.draw` na atrapie ctx): własne jednostki na ciele — liczba;
//       bez nich i bez `detailed` — „nieznany”; `detailed` przed mobilizacją — rezerwa (bez zmian); jedno źródło progu.
//   V9  okablowanie `ColonyOverlay` (piny źródłowe — plik nie importuje się pod node): `_drawUnits`, klik na heks,
//       przełącznik heksu, przycinanie zaznaczenia; kontrole: źródło czytane, reguła gry przy lądowaniu nietknięta.
//
// ⚠ Moduł reguły ładowany dynamicznie w try/catch: przed (h) go nie ma, a import statyczny wywróciłby linkowanie całej
//   suity — żaden pin nie dostałby koloru.
// ⚠ Każdy pin wykluczający ma ŚWIADKA (jednostka naprawdę stoi na ciele, `getUnitAt` ją zwraca).
// ⚠ Źródło bez komentarzy i z LF (pin niezależny od checkoutu). ⚠ Tylko przeglądarka pokaże render i klik na mapie.

import '../headless/env.js';           // MUSI być pierwszy
import gameState from '../../core/GameState.js';
import EntityManager from '../../core/EntityManager.js';
import { bootWithDirector } from '../headless/DirectorHarness.js';
import * as GP from '../../utils/GarrisonPlanner.js';
import * as VS from '../../entities/Vessel.js';
import { isPlayerColony } from '../../utils/ColonyOwnership.js';
import { pruneUnitSelection } from '../../ui/ColonySelectionLogic.js';
import { BottomContext } from '../../ui/BottomContext.js';
import { t } from '../../i18n/i18n.js';
import { readFileSync } from 'node:fs';

let GV = null;                         // Finding 379 — przed (h) modułu nie ma
try { GV = await import('../../utils/GroundVisibility.js'); } catch { GV = null; }
let RO = null;
try { RO = await import('../../utils/GarrisonReadout.js'); } catch { RO = null; }

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const call = (name, ...args) => (typeof GV?.[name] === 'function' ? GV[name](...args) : undefined);
const vis = (K, u) => call('isGroundUnitVisibleToPlayer', K, u);
const seen = (K, pid, owner) => call('foreignGroundUnitsVisible', K, pid, owner);
const boots = (K, pid) => call('playerHasGroundUnitsOn', K, pid);
const at = (K, pid, q, r) => call('visibleGroundUnitAt', K, pid, q, r);
const listVis = (K, units) => call('visibleGroundUnits', K, units);
const readout = (K, pid) => (typeof RO?.readGarrisonReadout === 'function' ? RO.readGarrisonReadout(K, pid) : undefined);
const readoutText = (r) => (typeof RO?.formatGarrisonReadout === 'function' ? RO.formatGarrisonReadout(r) : undefined);

const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const src = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8'));
/** Ciało metody (od sygnatury do następnej metody klasy na wcięciu 2). */
function methodBody(code, signature) {
  const i = code.indexOf(signature);
  if (i < 0) return '';
  const rest = code.slice(i + signature.length);
  const m = rest.search(/\n  [A-Za-z_$][\w$]*\s*\([^)]*\)\s*\{/);
  return m < 0 ? rest : rest.slice(0, m);
}

// ── Harness ──────────────────────────────────────────────────────────────────────────────
function quiet(fn) {
  const log = console.log, warn = console.warn;
  console.log = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.log = log; console.warn = warn; }
}
function boot() {
  const { core, K, ticker } = quiet(() => bootWithDirector({ quiet: true }));
  const w = { core, K, ticker, cm: core.colonyManager, gum: K.groundUnitManager, emps: K.empireRegistry.listIds() };
  quiet(() => w.ticker.run(12, { tickSize: 1.0 }));
  return w;
}
/** Poziom wywiadu jak `KOSMOS.debug.setIntel` (`GameScene`): surowe zejście do `unknown`, potem `advanceIntel`. */
function setIntel(K, emp, level) {
  gameState.set(`intel.${emp}`, { level: 'unknown', knownColonies: [], knownTech: [], lastIncidents: [],
    knownMilitary: null, knownReserve: null, knownCrewCapacity: null }, 'keeper_set_intel_reset');
  if (level !== 'unknown') K.intelSystem.advanceIntel(emp, level, 'keeper_set_intel');
  return K.intelSystem.getLevel(emp);
}
const capOf = (w, emp) => w.K.directorProduction.capitalOf(emp)?.planetId ?? null;
const freeHexes = (w, pid, n) => GP.garrisonHexes(GP.readGarrisonBodyContext(w.K, pid), n).hexes ?? [];
const aiUnit = (w, emp, pid, hx, arch = 'garrison_unit') =>
  w.gum.createAIUnit({ archetypeId: arch, empireId: emp, planetId: pid, q: hx.q, r: hx.r, morale: 50, deployed: true })?.unit ?? null;
const playerUnit = (w, pid, hx) => w.gum.createUnit('shock_infantry', pid, hx.q, hx.r, { owner: 'player', factionId: 'humanity' });
const onBody = (w, pid) => w.gum.getUnitsOnPlanet(pid);
/** Jednostka gracza do ładowni świeżego statku (prawdziwe `loadGroundUnit`). */
function loadIntoShip(w, u) {
  const v = w.K.vesselManager.createAndRegister('hull_small', w.K.homePlanet.id);
  v.troopCapacity = 12; v.troopBayUsed = 0; v.groundUnits = [];
  return VS.loadGroundUnit(v, u)?.ok === true;
}
/** Ciało bez kolonii w układzie domowym (niczyje). */
function neutralBody(w) {
  const sys = EntityManager.get(w.K.homePlanet.id)?.systemId;
  return ['moon', 'planet', 'planetoid'].flatMap(tp => EntityManager.getByType(tp))
    .find(b => b.systemId === sys && b.id !== w.K.homePlanet.id && !w.cm.getColony(b.id)) ?? null;
}
/** Karta ciała tak, jak rysuje ją gra (`BottomContext.draw` na atrapie ctx) — napisy drugiej klatki. */
function renderCard(entity) {
  const texts = () => {
    const out = [];
    const noop = () => {};
    return {
      out, canvas: { width: 1280, height: 720 }, measureText: (s) => ({ width: String(s).length * 6 }),
      save: noop, restore: noop, beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop, fill: noop, clip: noop,
      rect: noop, fillRect: noop, strokeRect: noop, closePath: noop, arc: noop, translate: noop, setLineDash: noop,
      roundRect: noop, ellipse: noop, createLinearGradient: () => ({ addColorStop: noop }),
      fillText: (s) => out.push(String(s)), strokeText: (s) => out.push(String(s)),
      font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, textAlign: 'left', globalAlpha: 1, shadowColor: '', shadowBlur: 0,
    };
  };
  const bc = new BottomContext();
  bc.draw(texts(), 1280, 720, entity);                 // pierwsza klatka = fade-in
  const ctx2 = texts();
  bc.draw(ctx2, 1280, 720, entity);
  return ctx2.out;
}

console.log('\nV0 — moduł reguły');
assert(['GARRISON_READOUT_INTEL', 'playerHasGroundUnitsOn', 'foreignGroundUnitsVisible', 'isGroundUnitVisibleToPlayer',
  'visibleGroundUnits', 'visibleGroundUnitAt'].every(k => GV?.[k] !== undefined),
  'V0: GroundVisibility eksportuje próg i predykaty (jedno źródło reguły dla mapy i karty)');

// ── V1 — predykat: wywiad, własne jednostki, ładownia, śmierć, stealth ─────────────────────
{
  console.log('\nV1 — cudza jednostka na kolonii AI: ukryta bez wywiadu i bez własnych jednostek; widoczna przy „detailed” albo z własną jednostką');
  const w = boot();
  const [e1] = w.emps;
  const cap = capOf(w, e1);
  const hx = freeHexes(w, cap, 8);
  const g = aiUnit(w, e1, cap, hx[0]);
  const lv = ['unknown', 'rumor', 'contact'].map(l => [setIntel(w.K, e1, l), vis(w.K, g)]);
  assert(!!cap && !!g && onBody(w, cap).includes(g) && !onBody(w, cap).some(u => !u.owner || u.owner === 'player')
      && lv.map(x => x[0]).join() === 'unknown,rumor,contact',
    `świadek: jednostka ${g?.id} imperium ${e1} stoi na ${cap}; na ciele zero jednostek gracza; wywiad ${lv.map(x => x[0]).join(' → ')}`);
  assert(lv.every(x => x[1] === false) && seen(w.K, cap, e1) === false,
    `V1a: poniżej „detailed”, bez własnych jednostek — ukryta (${lv.map(x => `${x[0]}:${x[1]}`).join(', ')})`);
  setIntel(w.K, e1, 'detailed');
  assert(vis(w.K, g) === true && seen(w.K, cap, e1) === true, `V1b: „detailed” — widoczna (${vis(w.K, g)})`);
  setIntel(w.K, e1, 'contact');
  const p = playerUnit(w, cap, hx[1]);
  assert(!!p && boots(w.K, cap) === true && vis(w.K, g) === true && seen(w.K, cap, e1) === true,
    `V1c: przy „contact” własna żywa jednostka ${p?.id} na ciele — cudza widoczna (${vis(w.K, g)})`);
  assert(vis(w.K, p) === true && setIntel(w.K, e1, 'unknown') === 'unknown' && vis(w.K, p) === true,
    'V1d: własna jednostka — widoczna zawsze (także przy „unknown”)');
  setIntel(w.K, e1, 'contact');
  const loaded = loadIntoShip(w, p);
  assert(loaded && p.status === 'in_cargo' && p.planetId === cap,
    `świadek: własna jednostka w ładowni (${p.status}), nadal z planetId ${p.planetId}`);
  assert(boots(w.K, cap) === false && vis(w.K, g) === false,
    `V1e: własna jednostka w ładowni się nie liczy — cudza ukryta (${vis(w.K, g)})`);
  const dead = playerUnit(w, cap, hx[2]);
  dead.hp = 0;
  assert(onBody(w, cap).includes(dead) && boots(w.K, cap) === false && vis(w.K, g) === false,
    `V1f: martwa własna jednostka (hp 0, w rejestrze) się nie liczy — cudza ukryta (${vis(w.K, g)})`);
  w.gum.removeUnit(dead.id);
  setIntel(w.K, e1, 'detailed');
  const s = aiUnit(w, e1, cap, hx[3]);
  s._stealthState = 'hidden';
  const pStealth = playerUnit(w, cap, hx[4]);
  assert(!!s && s.owner === e1 && onBody(w, cap).includes(s) && onBody(w, cap).includes(pStealth)
      && w.K.intelSystem.getLevel(e1) === 'detailed',
    `świadek: ukryta jednostka ${s?.id} imperium ${e1} i własna ${pStealth?.id} stoją na ${cap}; wywiad ${w.K.intelSystem.getLevel(e1)}`);
  assert(vis(w.K, s) === false && vis(w.K, g) === true,
    `V1g: ukryta (stealth) cudza jednostka — niewidoczna także przy „detailed” i własnych jednostkach (${vis(w.K, s)}), garnizon obok widoczny (${vis(w.K, g)})`);
  s._stealthState = 'visible';
  assert(vis(w.K, s) === true, 'V1h: ta sama jednostka bez stealth — widoczna (V1g nie ukrywa każdej jednostki)');
  w.gum.removeUnit(pStealth.id);
}

// ── V2 — dwa imperia na jednym ciele ───────────────────────────────────────────────────────
{
  console.log('\nV2 — dwa imperia na jednym ciele: „detailed” tylko o właścicielu kolonii — jednostka drugiego imperium ukryta');
  const w = boot();
  const [e1, e2] = w.emps;
  const cap = capOf(w, e1);
  const hx = freeHexes(w, cap, 4);
  const g = aiUnit(w, e1, cap, hx[0]);
  const d = aiUnit(w, e2, cap, hx[1], 'shock_infantry');
  setIntel(w.K, e1, 'detailed');
  setIntel(w.K, e2, 'contact');
  assert(!!g && !!d && d.owner === e2 && onBody(w, cap).includes(d), `świadek: na ${cap} garnizon ${e1} i desant ${e2} (${d?.id})`);
  assert(vis(w.K, g) === true && vis(w.K, d) === false,
    `V2a: „detailed” o ${e1}, „contact” o ${e2} — widoczny tylko ${e1} (${vis(w.K, g)} / ${vis(w.K, d)})`);
  const p = playerUnit(w, cap, hx[2]);
  assert(!!p && vis(w.K, d) === true, `V2b: własna jednostka na ciele — widoczne oba imperia (${vis(w.K, d)})`);
}

// ── V3 — kolonia gracza ────────────────────────────────────────────────────────────────────
{
  console.log('\nV3 — kolonia gracza: cudza jednostka widoczna bez wywiadu');
  const w = boot();
  const [e1] = w.emps;
  const home = w.cm.getColony(w.K.homePlanet.id);
  const hx = freeHexes(w, home.planetId, 2);
  const a = aiUnit(w, e1, home.planetId, hx[0], 'shock_infantry');
  setIntel(w.K, e1, 'unknown');
  const own = onBody(w, home.planetId).filter(u => !u.owner || u.owner === 'player').length;
  assert(isPlayerColony(home) && !!a, `świadek: jednostka ${e1} na kolonii gracza ${home.planetId}; wywiad unknown; jednostek gracza na ciele ${own}`);
  assert(vis(w.K, a) === true && seen(w.K, home.planetId, e1) === true,
    `V3: na kolonii gracza cudza jednostka widoczna przy „unknown” (${vis(w.K, a)})`);
}

// ── V4 — ciało bez kolonii ─────────────────────────────────────────────────────────────────
{
  console.log('\nV4 — ciało bez kolonii: (2) albo (3); warunek (1) czyta prawdziwą kolonię, nie podgląd mapy');
  const w = boot();
  const [e1] = w.emps;
  const nb = neutralBody(w);
  const a = nb ? aiUnit(w, e1, nb.id, { q: 0, r: 0 }, 'shock_infantry') : null;
  setIntel(w.K, e1, 'contact');
  const previewTrap = isPlayerColony({ planetId: nb?.id, isPreview: true, isOutpost: false });
  assert(!!nb && !!a && !w.cm.getColony(nb.id) && previewTrap === true,
    `świadek: ${nb?.id} bez kolonii, jednostka ${a?.id} imperium ${e1}; obiekt podglądu mapy przechodzi kanon własności (${previewTrap}) — pułapka`);
  assert(vis(w.K, a) === false && seen(w.K, nb.id, e1) === false,
    `V4a: „contact”, bez własnych jednostek — ukryta (${vis(w.K, a)}); podgląd ciała nie jest kolonią gracza`);
  setIntel(w.K, e1, 'detailed');
  assert(vis(w.K, a) === true, `V4b: „detailed” — widoczna (${vis(w.K, a)})`);
  setIntel(w.K, e1, 'contact');
  const p = playerUnit(w, nb.id, { q: 1, r: 0 });
  assert(!!p && vis(w.K, a) === true, `V4c: własna jednostka na ciele bez kolonii — cudza widoczna (${vis(w.K, a)})`);
}

// ── V5 — bez IntelSystem ───────────────────────────────────────────────────────────────────
{
  console.log('\nV5 — bez modułu wywiadu: fail-closed dla (3); (1) i (2) działają');
  const w = boot();
  const [e1] = w.emps;
  const cap = capOf(w, e1);
  const hx = freeHexes(w, cap, 3);
  const g = aiUnit(w, e1, cap, hx[0]);
  const home = w.cm.getColony(w.K.homePlanet.id);
  const a = aiUnit(w, e1, home.planetId, freeHexes(w, home.planetId, 1)[0], 'shock_infantry');
  const level = setIntel(w.K, e1, 'detailed');
  const withIntel = vis(w.K, g);
  const intelSys = w.K.intelSystem;
  w.K.intelSystem = null;
  const noIntel = vis(w.K, g);
  const onPlayer = vis(w.K, a);
  const p = playerUnit(w, cap, hx[1]);
  const withBoots = vis(w.K, g);
  w.K.intelSystem = intelSys;
  assert(level === 'detailed' && !!g && !!a && !!p && onBody(w, cap).includes(p),
    `świadek: wywiad o ${e1} w stanie gry „${level}”; jednostki ${g?.id} (kolonia AI), ${a?.id} (kolonia gracza), własna ${p?.id}`);
  assert(withIntel === true && noIntel === false,
    `V5a: ta sama jednostka — z modułem wywiadu widoczna (${withIntel}), bez modułu i bez własnych jednostek ukryta (${noIntel})`);
  assert(onPlayer === true && withBoots === true,
    `V5b: bez modułu wywiadu — na kolonii gracza widoczna (${onPlayer}); z własną jednostką na ciele widoczna (${withBoots})`);
}

// ── V6 — klik na heks ──────────────────────────────────────────────────────────────────────
{
  console.log('\nV6 — klik: pierwsza WIDOCZNA jednostka heksu z filtrami getUnitAt; niewidoczna cudza — nic');
  const w = boot();
  const [e1] = w.emps;
  const cap = capOf(w, e1);
  const hx = freeHexes(w, cap, 6);
  const g = aiUnit(w, e1, cap, hx[0]);
  setIntel(w.K, e1, 'contact');
  const raw = w.gum.getUnitAt(cap, hx[0].q, hx[0].r);
  assert(raw === g, `świadek: getUnitAt zwraca jednostkę ${raw?.id} — heks nie jest pusty`);
  assert(at(w.K, cap, hx[0].q, hx[0].r) === null, 'V6a: niewidoczna cudza jednostka — klik niczego nie zaznacza');
  setIntel(w.K, e1, 'detailed');
  // parytet filtrów: stos z jednostką w ruchu, jednostka w ładowni, pusty heks
  const mv = aiUnit(w, e1, cap, hx[1], 'shock_infantry');
  const idle = aiUnit(w, e1, cap, hx[1], 'shock_infantry');
  mv.status = 'moving';
  const p = playerUnit(w, cap, hx[2]);
  const cargo = playerUnit(w, cap, hx[3]);
  loadIntoShip(w, cargo);
  const cells = [hx[0], hx[1], hx[2], hx[3], hx[4]];
  const pairs = cells.map(c => [w.gum.getUnitAt(cap, c.q, c.r)?.id ?? null, at(w.K, cap, c.q, c.r)?.id ?? null]);
  assert(pairs[1][0] === idle.id && pairs[3][0] === null && pairs[4][0] === null && cargo.status === 'in_cargo',
    `świadek parytetu: getUnitAt pomija jednostkę w ruchu (${pairs[1][0]}) i ładownię (${pairs[3][0]}); pusty heks ${pairs[4][0]}`);
  assert(pairs.every(([a0, b0]) => a0 === b0),
    `V6b: wszystko widoczne — klik = getUnitAt na każdym heksie (${pairs.map(x => x.join('=')).join(' · ')})`);
  const h = aiUnit(w, e1, cap, hx[5], 'shock_infantry');
  h._stealthState = 'hidden';
  const ownSame = playerUnit(w, cap, hx[5]);
  const rawFirst = w.gum.getUnitAt(cap, hx[5].q, hx[5].r);
  assert(rawFirst === h, `świadek: na heksie ukryta cudza ${h.id} stoi pierwsza — getUnitAt zwraca ją (${rawFirst?.id})`);
  assert(at(w.K, cap, hx[5].q, hx[5].r) === ownSame, `V6c: klik bierze widoczną — własną ${ownSame.id}, nie ukrytą cudzą`);
  assert(!!p, 'V6 kontrola: własna jednostka postawiona (scena kompletna)');
}

// ── V7 — wypisywanie: przełącznik heksu i przycinanie zaznaczenia ──────────────────────────
{
  console.log('\nV7 — przełącznik jednostek heksu i przycinanie zaznaczenia po regule');
  const w = boot();
  const [e1, e2] = w.emps;
  const cap = capOf(w, e1);
  const hx = freeHexes(w, cap, 3);
  const g = aiUnit(w, e1, cap, hx[0]);
  const d = aiUnit(w, e2, cap, hx[0], 'shock_infantry');
  setIntel(w.K, e1, 'detailed');
  setIntel(w.K, e2, 'contact');
  const hex = w.gum.getUnitsAtHex(cap, hx[0].q, hx[0].r);
  const listed = listVis(w.K, hex);
  assert(hex.includes(g) && hex.includes(d), `świadek: na heksie ${hx[0].q},${hx[0].r} stoją ${g.id} (${e1}) i ${d.id} (${e2})`);
  assert(Array.isArray(listed) && listed.includes(g) && !listed.includes(d),
    `V7a: przełącznik heksu wypisuje tylko widoczne (${(listed ?? []).map(u => u.id).join(',')})`);
  // zaznaczenie cudzej jednostki widocznej dzięki własnej jednostce; potem własna znika
  setIntel(w.K, e2, 'contact');
  setIntel(w.K, e1, 'contact');
  const p = playerUnit(w, cap, hx[1]);
  const getVis = (id) => { const u = w.gum.getUnit(id); return vis(w.K, u) === true ? u : null; };
  const sceneBefore = onBody(w, cap).includes(p) && w.K.intelSystem.getLevel(e1) === 'contact';
  const before = pruneUnitSelection([g.id], g.id, getVis, cap);
  w.gum.removeUnit(p.id);
  const after = pruneUnitSelection([g.id], g.id, getVis, cap);
  const plain = pruneUnitSelection([g.id], g.id, (id) => w.gum.getUnit(id), cap);
  assert(sceneBefore && !w.gum.getUnit(p.id) && onBody(w, cap).includes(g),
    `świadek: przy „contact” własna jednostka ${p.id} stała na ${cap}, potem zdjęta; ${g.id} dalej na ciele`);
  assert(before.primaryId === g.id && before.pruned.length === 0 && after.primaryId === null && after.pruned.includes(g.id),
    `V7b: z własną jednostką zaznaczony ${g.id} zostaje (${before.primaryId}); po jej zejściu niewidoczna cudza wypada (${JSON.stringify(after)})`);
  assert(plain.primaryId === g.id, 'V7b kontrola: bez reguły jednostka zostałaby zaznaczona — stoi na mapie (pin mierzy regułę, nie mapę)');
}

// ── V8 — karta ciała (G3-3) tą samą regułą ─────────────────────────────────────────────────
{
  console.log('\nV8 — karta ciała: liczba przy „detailed” ALBO własnych jednostkach na ciele, inaczej „nieznany”');
  const w = boot();
  const [e1] = w.emps;
  const cap = capOf(w, e1);
  const hx = freeHexes(w, cap, 3);
  const g = aiUnit(w, e1, cap, hx[0]);
  setIntel(w.K, e1, 'contact');
  const flag = w.K.empireRegistry.get(e1)?.garrison ?? null;
  const r0 = readout(w.K, cap);
  assert(!!g && flag === null && r0?.kind === 'unknown',
    `świadek: ${e1} bez mobilizacji (flaga ${flag}), garnizon testowy ${g?.id}; bez własnych jednostek — ${r0?.kind}`);
  const p = playerUnit(w, cap, hx[1]);
  const r1 = readout(w.K, cap);
  const live = onBody(w, cap).filter(u => u.owner === e1 && (u.hp ?? 0) > 0).length;
  assert(r1?.kind === 'units' && r1?.count === live && live >= 1 && readoutText(r1) === t('garrison.readout.units', live),
    `V8a: „contact” + własna jednostka na ciele — liczba jednostek stojących na ciele (${r1?.kind}:${r1?.count} = ${live})`);
  const card = renderCard(EntityManager.get(cap));
  assert(card.includes(t('garrison.readout.units', live)),
    `V8b: karta ciała (BottomContext.draw) pokazuje „${t('garrison.readout.units', live)}”`);
  loadIntoShip(w, p);
  const r2 = readout(w.K, cap);
  assert(p.status === 'in_cargo' && r1?.kind === 'units' && r2?.kind === 'unknown',
    `V8c: ta sama jednostka gracza załadowana do ładowni — karta z liczby (${r1?.kind}) wraca do „nieznany” (${r2?.kind})`);
  setIntel(w.K, e1, 'detailed');
  const r3 = readout(w.K, cap);
  assert(r3?.kind === 'reserve', `V8d kontrola: „detailed” przed mobilizacją — rezerwa planu bez zmian (${r3?.kind})`);
  const gr = src('../../utils/GarrisonReadout.js');
  assert(/foreignGroundUnitsVisible\(K,\s*planetId,\s*owner\)/.test(methodBody(gr, 'export function readGarrisonReadout(K, planetId) {'))
      && RO?.GARRISON_READOUT_INTEL === 'detailed' && GV?.GARRISON_READOUT_INTEL === RO?.GARRISON_READOUT_INTEL
      && !/GARRISON_READOUT_INTEL\s*=\s*'detailed'/.test(gr),
    'V8e: odczyt karty pyta tej samej reguły (`foreignGroundUnitsVisible`), próg ma jedno źródło (GroundVisibility, re-eksport)');
}

// ── V9 — okablowanie ColonyOverlay (piny źródłowe) ─────────────────────────────────────────
{
  console.log('\nV9 — ColonyOverlay: rysowanie, klik, przełącznik heksu i zaznaczenie pytają reguły');
  const co = src('../../ui/ColonyOverlay.js');
  const draw = methodBody(co, '_drawUnits(ctx, ox, oy, ow, oh, grid) {');
  const panel = methodBody(co, '_drawUnitPanel(ctx, ox, oy, ow, oh) {');
  const prune = methodBody(co, '_pruneUnitSelection(planetId) {');
  assert(draw.length > 500 && /_stealthState === 'hidden'/.test(draw) && panel.length > 500 && prune.length > 50,
    `kontrola pinu: źródło czytane bez komentarzy — _drawUnits ${draw.length} zn., _drawUnitPanel ${panel.length} zn., _pruneUnitSelection ${prune.length} zn.`);
  assert(/import\s*\{[^}]*visibleGroundUnits[^}]*\}\s*from\s*'\.\.\/utils\/GroundVisibility\.js'/.test(co),
    'V9a: ColonyOverlay importuje regułę z GroundVisibility');
  assert(/const units = visibleGroundUnits\(window\.KOSMOS,\s*mgr\.getUnitsOnPlanet\(colony\.planetId\)\)/.test(draw),
    'V9b: _drawUnits rysuje (sprite’y i plakietki stosów) wyłącznie listę przepuszczoną przez regułę');
  assert(/visibleGroundUnitAt\(window\.KOSMOS,\s*colony\?\.planetId,\s*tile\.q,\s*tile\.r\)/.test(co) && !/getUnitAt\(/.test(co),
    'V9c: klik na heks zaznacza przez visibleGroundUnitAt — w ColonyOverlay nie zostało żadne getUnitAt(');
  assert(/const hexSiblings = visibleGroundUnits\(window\.KOSMOS,\s*gum\?\.getUnitsAtHex\?\.\(unit\.planetId,\s*unit\.q,\s*unit\.r\)/.test(panel),
    'V9d: przełącznik jednostek heksu na karcie jednostki wypisuje listę przepuszczoną przez regułę');
  assert(/isGroundUnitVisibleToPlayer\(window\.KOSMOS,\s*u\)\s*\?\s*u\s*:\s*null/.test(prune),
    'V9e: przycinanie zaznaczenia czyta jednostki przez regułę — niewidoczna cudza wypada');
  const inv = src('../../systems/InvasionSystem.js');
  assert(/hasHostile = occupants\.some\(u => u\.owner && u\.owner !== 'player'\)/.test(co) && /getUnitAt\(/.test(inv),
    'V9 kontrola: reguła gry przy lądowaniu (kara pod ogniem) i silnik (InvasionSystem.getUnitAt) — nietknięte');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
