// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// cv_stage_shell_smoke — KEEPER ARC COMBAT VISUALS, krok CV-3a3 (skorupa przy ciele: D-CV-4 (a), Finding 626).
//   Plan: `docs/design/COMBAT_VISUALS_PLAN.md` §2.2, §3.2-6, §4 CV-3a3.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// CO PINUJE (wyłącznie logika — F11; bez pinów na stałych rysunku):
//   P1 kierunek skorupy (`shellBearing`): przeciwnik wolny → w jego stronę; przy ciele obie strony → strona statków gracza;
//      gracz rozłożony dookoła ciała → statek gracza o najmniejszym id; wszyscy w środku ciała → domyślny
//   P2 rozwiązanie ze skorupą na układach losowych (księżyc … gazowy olbrzym, 3+3 … 10+10, obie strony przy ciele i mieszane):
//      ŻADEN statek bliżej środka ciała niż skorupa (promień + 2 L); żadna para nałożona (≥ 1 L); każde rozwiązanie spójne
//      w pasmach albo oznaczone jako awaryjne; KONTROLA: bez skorupy te same układy rysują statki WEWNĄTRZ ciała
//   P3 przesunięcie sztywne: bez wypchnięć odstęp KAŻDEJ pary ze skorupą = bez skorupy (wynik prowadnicy pasm przechodzi)
//   P4 baza statku przy ciele bez orbity (`shellBaseAt`, Finding 626) — za skorupą dla 25 kolejnych statków
//   P5 (652) scena przy ciele z ciepłym startem stoi: rundy z orbitami obracającymi się jak w grze — mediana przesunięcia
//      rysowanego (bez środka) ≤ 0,25 L na rundę; KONTROLA: z przejściami przyciągania przy ciepłym starcie > 1 L na rundę
//   R1 renderer (prawdziwe metody, ciało z rysunkiem), obie strony przy ciele: po wejściu w kino każdy statek poza skorupą,
//      grupa po stronie statków gracza, pary spójne w pasmach (albo awaryjne), (b) zero zapisów na statkach
//   R2 zoom z daleka do kina: w KAŻDEJ klatce każdy statek poza skorupą (statek z orbity za planetą nie przelatuje przez nią);
//      KONTROLA: prosta interpolacja baza → cel tej klatki wchodziła w ciało
//   R3 mieszana (przy ciele mniejszość gracza, wróg wolny): grupa w stronę wroga
//   R4 (626) wróg przypięty bez orbity: w pauzie od startu stoi tam, gdzie był; po wznowieniu baza wchodzi na skorupę płynnie
//      (bez teleportu), w skali prawdziwej rysowany za skorupą
//   R5 ciało się przesuwa (krąży wokół gwiazdy) — grupa idzie za nim o ten sam wektor
//   R6 pole kliku na bitwie przy ciele: rysowany → logiczny → rysowany (staged); KONTROLA: ciało bez rysunku — bez pola
//   R7 kadr „Obserwuj” na bitwie przy ciele: po wejściu — kino; w pauzie przed wejściem — skala prawdziwa
//   R8 źródło: `_stageWatchFit` z celów wyświetlanych; `_stageFields` bez dawnego wyjątku „przy ciele”
//   R9 zapis orbity MIĘDZY klatkami (`_tickOrbitingVessels` na `physics:updated` → `_setSpriteBase`): sprite statku ze sceny
//      zostaje w pozycji rysowanej, nowa baza w znaczniku (następna klatka zaczyna od niej); KONTROLA: bez znacznika — zapis
//      wprost; źródło: gałąź orbity pisze przez `_setSpriteBase` (zmierzone w grze bez tego: czytelnicy między tikiem a klatką
//      — warstwa HUD, klik — widzieli statki z orbity poza sceną co tik)
//   — poprawki po kontroli właściciela 2026-11-09 (FAIL 5: prawy klik „Lecisz tutaj” w bitwie przy ciele) —
//   P1e–g statek zdjęty z orbity (rozkaz ruchu) nie jest siłą z zewnątrz: kierunek skorupy stoi, także gdy wróg ma przy ciele
//      przewagę i gdy zdjęty jest statek o najmniejszym id; KONTROLA: większość strony zeszła z orbity — kierunek ku nim
//   P6 pole kliku PRZESUNIĘTE (`shift`): odwrotność co do 1e-9 (także |shift| > r_in), tożsamość poza soczewką, wewnątrz
//      r_in mapa promieniowa + stopień × przesunięcie; KONTROLA: bez przesunięcia — odwrotność jak przed CV-3a3
//   R6c pole kliku przy skorupie = mapa, którą scena rysuje (mediana pole ↔ cel na scenie ≤ podłoga rozsunięcia, ciało 0,3,
//      0,6 i 1 j.); KONTROLA R6d: wzór pola sprzed poprawki (środek = grupa rysowana dla obu stron) przy 1 j. ponad tolerancję
//   R10 statek za planetą zdjęty z orbity: grupa nie obraca się wokół ciała, nikt nie jest rysowany nad tarczą (w grze przed
//      poprawką: obrót 158–161°, 8 klatek nad tarczą, uwolniony statek nad środkiem planety)
//   R11 (666 (b), decyzja właściciela) uczestnicy bitwy przy ciele w widoku — bez celownika 3D w kinie i z daleka, także przy
//      ciele bez rysunku; KONTROLA: wróg w widoku poza starciem — jak dotąd; flaga OFF — celownik u wszystkich
//      (CV-6b: „z daleka” przy podłodze stopnia 0 — skala prawdziwa; R4 tak samo — decyzja 20 trzyma scenę przy każdym zoomie)
//   R12 (CV-6b, decyzja właściciela 20) bitwa przy ciele z daleka (krzywa zoomu ≈ 0) — na scenie: każdy statek za skorupą,
//      żadna linia gracz → wróg przez ciało; KONTROLA: podłoga 0 (krzywa CV-3a1) — linie przez ciało
//   S1 stager `cvBattle({ atBody })` na świecie headless (prawdziwe DSCS / MOS / Proximity / OrbitalSpace / `TimeSystem`):
//      statki gracza na orbitach ciała, wróg PRZYPIĘTY przez DSCS (bez orbity), komplet w jednym starciu, ciało wskazane
//      po id; `mixed` — wróg wolny, przy ciele mniejszość gracza; KONTROLA: zwykłe `cvBattle` — nikt przy ciele
//
// ⚠ Fail-first: moduły i metody CV-3a3 powstają w tym kroku — importy dynamiczne, bloki łapią wyjątek (piny degradują).
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { reseed }                from '../headless/env.js';
import EventBus                  from '../../core/EventBus.js';
import EntityManager             from '../../core/EntityManager.js';
import { GAME_CONFIG }           from '../../config/GameConfig.js';
import * as FX                   from '../../utils/VesselFxLogic.js';
import * as CW                   from '../../renderer/CombatWatchLogic.js';
import { isEnemyVessel }         from '../../entities/Vessel.js';
import { VESSEL_TARGET_SIZE }    from '../../renderer/VesselModelResolver.js';
import { getMapInsets }          from '../../ui/MapInsets.js';
import { COSMIC }                from '../../config/LayoutConfig.js';
import { TimeSystem }            from '../../systems/TimeSystem.js';
import { VesselManager }         from '../../systems/VesselManager.js';
import { MovementOrderSystem }   from '../../systems/MovementOrderSystem.js';
import { ProximitySystem }       from '../../systems/ProximitySystem.js';
import { VesselCombatSystem }    from '../../systems/VesselCombatSystem.js';
import { DeepSpaceCombatSystem } from '../../systems/DeepSpaceCombatSystem.js';
import { EnemyAttackHandler }    from '../../systems/EnemyAttackHandler.js';
import { OrbitalSpaceSystem }    from '../../systems/OrbitalSpaceSystem.js';
import { simClockMs }            from '../../utils/SimClock.js';
import { readFileSync }          from 'node:fs';

const THREE = await import(new URL('../../lib/three.module.js', import.meta.url).href);
const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const SL = await tryImport('../../renderer/combat/BattleStageLogic.js');
const SZ = await tryImport('../../renderer/combat/SemanticZoomLogic.js');
const SMOT = await tryImport('../../renderer/combat/StageMotionLogic.js');   // ARC CV-6b — ruch sceny ciągły w prędkości
const PC = await tryImport('../../renderer/combat/PresentationClock.js');
const ST = await tryImport('../../debug/CvBattleStager.js');

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const block = (title, fn) => { header(title); try { fn(); } catch (e) { assert(false, `${title} — wyjątek (pin degraduje, nie przerywa): ${e.message}`); } };
const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8').replace(/\r\n/g, '\n');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');

const L = VESSEL_TARGET_SIZE.frigate, AUWU = GAME_CONFIG.AU_TO_PX / 10, FLOOR_L = SL?.STAGE?.SHELL_FLOOR_L ?? 2;
const EDGES = SL ? SL.bandEdgesWU([GAME_CONFIG.WEAPON_SHORT_AU, GAME_CONFIG.WEAPON_MED_AU, GAME_CONFIG.WEAPON_LONG_AU], AUWU) : [0.55, 1.65, 3.3];
const call = (name, ...a) => { try { return typeof SL?.[name] === 'function' ? SL[name](...a) : undefined; } catch (e) { console.log(`    (${name}: ${e.message})`); return undefined; } };
const d3 = (p, b) => Math.hypot(p.x - b.x, (p.y ?? 0) - (b.y ?? 0), p.z - b.z);
let seed = 4242; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

/** Losowa bitwa przy ciele (pozycje logiczne [j.]): gracz na orbitach (rola okrętu: 1,9–2,5 promienia, min 0,08), wróg
 *  przypięty w środku ciała albo (mieszana) wolny po jednej stronie. */
function bodyBattle({ R, nA, nB, mixed }) {
  const body = { x: 2 + rnd(), y: 0, z: -1 + rnd(), r: R };
  const pts = [], pinned = new Set();
  const nDock = mixed ? Math.max(1, Math.floor((nA - 1) / 2)) : nA;
  const side = rnd() * Math.PI * 2;
  for (let i = 0; i < nA; i++) {
    const id = `A${String(i).padStart(2, '0')}`;
    if (i < nDock) {
      const r = Math.max(0.08, R * (1.9 + rnd() * 0.6)), th = rnd() * Math.PI * 2, ph = Math.PI / 2 + (rnd() - 0.5) * Math.PI / 2;
      pts.push({ id, side: 'player', x: body.x + r * Math.sin(ph) * Math.cos(th), z: body.z + r * Math.sin(ph) * Math.sin(th) }); pinned.add(id);
    } else {
      const d = R + 0.3 + rnd() * 0.3;
      pts.push({ id, side: 'player', x: body.x + Math.cos(side) * d + (rnd() - 0.5) * 0.2, z: body.z + Math.sin(side) * d + (rnd() - 0.5) * 0.2 });
    }
  }
  for (let i = 0; i < nB; i++) {
    const id = `B${String(i).padStart(2, '0')}`;
    if (!mixed) { pts.push({ id, side: 'emp_x', x: body.x, z: body.z }); pinned.add(id); }
    else { const d = R + 0.7 + rnd() * 0.3; pts.push({ id, side: 'emp_x', x: body.x + Math.cos(side) * d + (rnd() - 0.5) * 0.3, z: body.z + Math.sin(side) * d + (rnd() - 0.5) * 0.3 }); }
  }
  const c = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: 0.3, z: pts.reduce((s, p) => s + p.z, 0) / pts.length };
  return { body, pts, pinned, c };
}

// ═══ P1 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('P1 — kierunek skorupy (`shellBearing`)', () => {
  const body = { x: 1, y: 0, z: 2, r: 0.1 };
  const pin = new Set(['A0', 'A1', 'B0']);
  const free = call('shellBearing', [{ id: 'A0', side: 'player', x: 1.2, z: 2 }, { id: 'A1', side: 'player', x: 0.85, z: 2.1 },
    { id: 'B0', side: 'emp', x: 1, z: 2 }, { id: 'B1', side: 'emp', x: 2, z: 3 }, { id: 'B2', side: 'emp', x: 2.2, z: 3.1 }], body, pin);
  const want = { x: 2.1 - 1, z: 3.05 - 2 }, wl = Math.hypot(want.x, want.z);
  assert(free?.source === 'free-opposing' && Math.abs(free.x - want.x / wl) < 1e-9 && Math.abs(free.z - want.z / wl) < 1e-9,
    `P1a wolny przeciwnik — kierunek ku środkowi wolnych przeciwników (${free?.source})`);
  const both = call('shellBearing', [{ id: 'A0', side: 'player', x: 1.2, z: 2.05 }, { id: 'A1', side: 'player', x: 1.18, z: 1.97 },
    { id: 'B0', side: 'emp', x: 1, z: 2 }, { id: 'B1', side: 'emp', x: 1, z: 2 }], body, new Set(['A0', 'A1', 'B0', 'B1']));
  assert(both?.source === 'player' && both.x > 0.99, `P1b obie strony przy ciele — strona statków gracza (${both?.source}, x ${both?.x?.toFixed?.(3)})`);
  const ring = call('shellBearing', [{ id: 'A2', side: 'player', x: 1.2, z: 2 }, { id: 'A1', side: 'player', x: 0.8, z: 2 },
    { id: 'A0', side: 'player', x: 1, z: 2.2 }, { id: 'A3', side: 'player', x: 1, z: 1.8 }, { id: 'B0', side: 'emp', x: 1, z: 2 }], body,
    new Set(['A0', 'A1', 'A2', 'A3', 'B0']));
  assert(ring?.source === 'player-first' && Math.abs(ring.x) < 1e-9 && Math.abs(ring.z - 1) < 1e-9,
    `P1c gracz rozłożony dookoła ciała — statek o najmniejszym id (A0, ${ring?.source})`);
  const dflt = call('shellBearing', [{ id: 'B0', side: 'emp', x: 1, z: 2 }], body, new Set(['B0']));
  assert(dflt?.source === 'default' && dflt.x === 1 && dflt.z === 0, `P1d wszyscy w środku ciała — kierunek domyślny (${dflt?.source})`);
  // P1e–P1g (FAIL 5 kontroli właściciela 2026-11-09): statek schodzący z orbity NIE jest siłą z zewnątrz — kierunek stoi.
  const ring5 = [0.2, -0.3, 0.6, -0.5, 0.0].map((th, i) => ({ id: `A0${i}`, side: 'player', x: 1 + 0.2 * Math.cos(th), z: 2 + 0.2 * Math.sin(th) }));
  const behind = { id: 'A05', side: 'player', x: 1 - 0.25, z: 2 };   // za planetą
  const emp6 = [0, 1, 2, 3, 4, 5].map((i) => ({ id: `B0${i}`, side: 'emp', x: 1, z: 2 }));
  const all = [...ring5, behind, ...emp6], pinAll = new Set(all.map((p) => p.id));
  const b0 = call('shellBearing', all, body, pinAll);
  const pinFreed = new Set([...pinAll].filter((id) => id !== 'A05'));
  const b1 = call('shellBearing', all, body, pinFreed);
  const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.z * b.z))) * 180 / Math.PI;
  const empMajor = [...pinFreed].filter((id) => id.startsWith('B')).length > [...pinFreed].filter((id) => id.startsWith('A')).length;
  assert(empMajor && b0 && b1 && b1.source === b0.source && ang(b0, b1) < 1e-6,
    `P1e SEDNO: obie strony przy ciele, statek gracza za planetą zdjęty z orbity (wróg ma przy ciele przewagę 6 : 5 — świadek) — kierunek stoi (${b0?.source} → ${b1?.source}, ${b0 && b1 ? ang(b0, b1).toFixed(1) : '—'}°)`);
  const ringA = [{ id: 'A2', side: 'player', x: 1.2, z: 2 }, { id: 'A1', side: 'player', x: 0.8, z: 2 }, { id: 'A0', side: 'player', x: 1, z: 2.2 },
    { id: 'A3', side: 'player', x: 1, z: 1.8 }, { id: 'B0', side: 'emp', x: 1, z: 2 }];
  const f0 = call('shellBearing', ringA, body, new Set(['A1', 'A2', 'A3', 'B0']));
  assert(f0?.source === 'player-first' && Math.abs(f0.x) < 1e-9 && Math.abs(f0.z - 1) < 1e-9,
    `P1f gracz dookoła ciała, statek o najmniejszym id (A0) zdjęty z orbity — strona gracza dalej z WSZYSTKICH jego statków (${f0?.source})`);
  const many = [...all];
  const pinMajFree = new Set([...pinAll].filter((id) => !['A00', 'A01', 'A02', 'A03'].includes(id)));
  many[0] = { ...many[0], x: 1.6, z: 2.3 }; many[1] = { ...many[1], x: 1.65, z: 2.25 }; many[2] = { ...many[2], x: 1.62, z: 2.35 }; many[3] = { ...many[3], x: 1.7, z: 2.3 };
  const g1 = call('shellBearing', many, body, pinMajFree);
  const wg = { x: 1.6425 - 1, z: 2.3 - 2 }, wgl = Math.hypot(wg.x, wg.z);
  assert(g1?.source === 'free-opposing' && Math.abs(g1.x - wg.x / wgl) < 1e-9 && Math.abs(g1.z - wg.z / wgl) < 1e-9,
    `P1g KONTROLA: większość strony gracza zeszła z orbity (4 wolne : 2 przy ciele) — to siła z zewnątrz, kierunek ku nim (${g1?.source})`);
});

// ═══ P2 / P3 ══════════════════════════════════════════════════════════════════════════════════════════════════════
block('P2 / P3 — rozwiązanie ze skorupą na układach losowych', () => {
  const RADII = [0.03, 0.06, 0.1, 0.14, 0.2, 0.4, 0.6];
  const SIZES = [[3, 3], [5, 5], [10, 10]];
  let n = 0, inside = 0, insideNoShell = 0, overlap = Infinity, incons = 0, fb = 0, transl = 0, translChecked = 0;
  const fbBy = {};
  for (const R of RADII) for (const [nA, nB] of SIZES) for (const mixed of [false, true]) for (let rep = 0; rep < 4; rep++) {
    const { body, pts, pinned, c } = bodyBattle({ R, nA, nB, mixed });
    const r = call('solveStage', { points: pts, centre: c, L, edges: EDGES, shell: { body, pinned } });
    const r0 = call('solveStage', { points: pts, centre: c, L, edges: EDGES });
    if (!r || !r0) { inside++; continue; }
    n++;
    const R0 = R + FLOOR_L * L;
    for (const q of r.pos.values()) if (d3(q, body) < R0 * (1 - 1e-9)) inside++;
    for (const q of r0.pos.values()) if (d3(q, body) < R) insideNoShell++;
    const arr = [...r.pos.values()];
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) overlap = Math.min(overlap, d3(arr[i], arr[j]) / L);
    const mis = SL.countMisbanded(pts, r.pos, EDGES);
    if (!(mis === 0 || r.fallback)) incons++;
    if (r.fallback) { fb++; const k = `${nA}+${nB}${mixed ? 'm' : ''}`; fbBy[k] = (fbBy[k] ?? 0) + 1; }
    if (!r0.fallback && !r.fallback && r.shell?.excluded === 0) {
      translChecked++;
      const ids = pts.map((p) => p.id);
      let worst = 0;
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++)
        worst = Math.max(worst, Math.abs(d3(r.pos.get(ids[i]), r.pos.get(ids[j])) - d3(r0.pos.get(ids[i]), r0.pos.get(ids[j]))));
      if (worst > 1e-9) transl++;
    }
  }
  console.log(`     ${n} układów: wewnątrz skorupy ${inside}; bez skorupy wewnątrz ciała ${insideNoShell}; najmniejsza para ${overlap.toFixed(3)} L; `
    + `niespójnych ${incons}; awaryjnych ${fb} ${JSON.stringify(fbBy)}; przesunięcie sztywne sprawdzone na ${translChecked}, różnych ${transl}`);
  assert(n === RADII.length * SIZES.length * 2 * 4 && inside === 0, `P2a SEDNO: żaden statek bliżej środka ciała niż skorupa (promień + ${FLOOR_L} L) — ${n} układów`);
  assert(insideNoShell > 0, `P2b KONTROLA: bez skorupy te same układy rysują ${insideNoShell} statków WEWNĄTRZ ciała — skorupa jest konieczna`);
  assert(overlap >= 1.0, `P2c żadna para nałożona (najmniejsza ${overlap.toFixed(3)} L ≥ 1 L — długość fregaty)`);
  assert(incons === 0, 'P2d każde rozwiązanie spójne w pasmach (zero złych par) albo oznaczone jako awaryjne');
  assert(translChecked >= 20 && transl === 0, `P3 przesunięcie sztywne: na ${translChecked} układach bez wypchnięć odstęp każdej pary = bez skorupy (do 1e-9)`);
});

// ═══ P4 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('P4 — (626) baza statku przy ciele bez orbity: za skorupą', () => {
  const body = { x: 0.5, y: 0, z: -0.2, r: 0.12 }, u = { x: 0.6, z: 0.8 };
  let worst = Infinity;
  for (let k = 0; k < 25; k++) { const p = call('shellBaseAt', body, u, k, L); worst = Math.min(worst, p ? d3(p, body) - (body.r + FLOOR_L * L) : -1); }
  assert(worst >= -1e-12, `P4 25 kolejnych statków — każdy za skorupą (zapas min. ${(worst / L).toFixed(3)} L)`);
});

// ═══ P5 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('P5 — (652) scena przy ciele z ciepłym startem stoi (rundy z obracającymi się orbitami)', () => {
  const churn = (R, opts) => {
    let sd = 1234 + Math.round(R * 1000); const rnd = () => { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff; };
    const body = { x: 0, y: 0, z: 0, r: R };
    const orb = []; for (let i = 0; i < 10; i++) orb.push({ r: Math.max(0.08, R * (1.9 + rnd() * 0.6)), th: rnd() * 6.283, ph: Math.PI / 2 + (rnd() - 0.5) * Math.PI / 2, w: 0.1 + (rnd() - 0.5) * 0.04 });
    let offsets = null, prev = null; const moves = []; const pinned = new Set();
    for (let k = 0; k < 20; k++) {
      const pts = [];
      orb.forEach((o, i) => { const th = o.th + o.w * 0.11 * k; pinned.add(`A${i}`); pts.push({ id: `A${i}`, side: 'player', x: o.r * Math.sin(o.ph) * Math.cos(th), z: o.r * Math.sin(o.ph) * Math.sin(th) }); });
      for (let i = 0; i < 10; i++) { pinned.add(`B${i}`); pts.push({ id: `B${i}`, side: 'emp_x', x: 0, z: 0 }); }
      const pri = new Set(); for (let i = 0; i < 10; i++) { pri.add(SL.pairKey(`A${i}`, 'B0')); pri.add(SL.pairKey(`B${i}`, `A${i}`)); }
      const c = { x: pts.reduce((t, q) => t + q.x, 0) / 20, y: 0.3, z: pts.reduce((t, q) => t + q.z, 0) / 20 };
      const r = SL.solveStage({ points: pts, centre: c, L, edges: EDGES, prevOffsets: offsets, priority: pri, shell: { body, pinned }, opts });
      offsets = r.offsets;
      const cc = { x: 0, y: 0, z: 0 }; for (const q of r.pos.values()) { cc.x += q.x; cc.y += q.y; cc.z += q.z; } cc.x /= 20; cc.y /= 20; cc.z /= 20;
      const rel = new Map([...r.pos].map(([id, q]) => [id, { x: q.x - cc.x, y: q.y - cc.y, z: q.z - cc.z }]));
      if (prev) for (const [id, q] of rel) { const o = prev.get(id); moves.push(d3(q, o) / L); }
      prev = rel;
    }
    return moves;
  };
  const RADII = [0.06, 0.1, 0.24, 0.59];
  const med = (a) => { const v = [...a].sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
  const calmR = RADII.map((R) => churn(R, {})), pulledR = RADII.map((R) => churn(R, { SHELL_WARM_PASSES: SL.STAGE.PASSES }));
  const calm = med(calmR.flat()), pulled = med(pulledR.flat());
  console.log(`     mediana przesunięcia rysowanego na rundę [L] (promień ${RADII.join(' / ')}): ciepły start ${calmR.map((m) => med(m).toFixed(3)).join(' / ')} `
    + `(łącznie ${calm.toFixed(3)}); z przyciąganiem ${pulledR.map((m) => med(m).toFixed(3)).join(' / ')} (łącznie ${pulled.toFixed(3)})`);
  assert(calmR.every((m) => med(m) <= 0.3), 'P5a SEDNO: ciepły start przy ciele — mediana przesunięcia ≤ 0,3 L na rundę w każdym układzie');
  assert(pulled > 3 * Math.max(calm, 0.05), `P5b KONTROLA: z przyciąganiem przy ciepłym starcie łącznie ${pulled.toFixed(3)} L na rundę — co najmniej 3 × więcej (grupa „pływa”)`);
});

// ═══ P6 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('P6 — pole kliku PRZESUNIĘTE (skorupa, D-CV-5): odwrotność, tożsamość poza soczewką, przesunięcie wewnątrz', () => {
  const c = { x: 2, z: -1 }, sh = { x: 0.35, z: -0.2 };
  let worst = 0, n = 0, worstOut = 0, worstIn = 0;
  for (const [rIn, blend] of [[0.8, 1], [0.8, 0.5], [0.8, 0.05], [0.12, 1], [0.12, 0.3]]) {   // rIn 0.12 < |shift| 0.40 — strażnik różnowartościowości
    const f = { centre: c, rIn, blend, scale: null, shift: sh };
    const rEff = Math.max(rIn, Math.hypot(sh.x, sh.z));
    for (let k = 0; k < 120; k++) {
      const a = rnd() * Math.PI * 2, rr = rnd() * rEff * 4;
      const D = { x: c.x + sh.x * blend + Math.cos(a) * rr, z: c.z + sh.z * blend + Math.sin(a) * rr };
      const Lp = call('stagePointLogical', D, f), back = Lp ? call('stagePointDrawn', Lp, f) : null;
      worst = Math.max(worst, back ? Math.hypot(back.x - D.x, back.z - D.z) : Infinity); n++;
      const P = { x: c.x + Math.cos(a) * (rEff * (3.05 + rnd())), z: c.z + Math.sin(a) * (rEff * (3.05 + rnd())) };
      const q = call('stagePointDrawn', P, f), q2 = call('stagePointLogical', P, f);
      worstOut = Math.max(worstOut, q ? Math.hypot(q.x - P.x, q.z - P.z) : Infinity, q2 ? Math.hypot(q2.x - P.x, q2.z - P.z) : Infinity);
      const I = { x: c.x + Math.cos(a) * rIn * 0.9 * rnd(), z: c.z + Math.sin(a) * rIn * 0.9 * rnd() };
      const qi = call('stagePointDrawn', I, f), q0 = call('stagePointDrawn', I, { ...f, shift: null, rIn: rEff });
      worstIn = Math.max(worstIn, qi && q0 ? Math.hypot(qi.x - q0.x - sh.x * blend, qi.z - q0.z - sh.z * blend) : Infinity);
    }
  }
  assert(worst < 1e-9, `P6a rysowany → logiczny → rysowany co do 1e-9 na ${n} punktach (soczewka, pas, poza; stopnie 1 / 0,5 / 0,05; |shift| > r_in) — maks. ${worst.toExponential(2)}`);
  assert(worstOut < 1e-12, `P6b poza LENS_OUT·r_in pole jest tożsamością w obie strony (maks. ${worstOut.toExponential(2)})`);
  assert(worstIn < 1e-12, `P6c SEDNO: wewnątrz r_in rysowany = mapa promieniowa + stopień × przesunięcie (maks. ${worstIn.toExponential(2)})`);
  const f0 = { centre: c, rIn: 0.8, blend: 1, scale: null };
  const D0 = { x: c.x + 0.05, z: c.z - 0.03 }, L0 = call('stagePointLogical', D0, f0), L1 = call('stagePointLogical', D0, { ...f0, shift: null });
  const rd = Math.hypot(0.05, 0.03), r0 = call('fieldDrawnRadiusInverse', rd, 1, f0);
  assert(L0 && L1 && Math.hypot(L0.x - L1.x, L0.z - L1.z) < 1e-15 && Math.abs(Math.hypot(L0.x - c.x, L0.z - c.z) - r0) < 1e-12,
    'P6d KONTROLA: pole bez przesunięcia — odwrotność jak przed CV-3a3 (promień z `fieldDrawnRadiusInverse`, kierunek zachowany)');
});

// ── renderer: prawdziwe metody, świat z ciałem z rysunkiem ──────────────────────────────────────────────────────
const TR = read('src/renderer/ThreeRenderer.js');
function methodOf(name) {
  const i = TR.indexOf(`\n  ${name}(`);
  if (i < 0) return null;
  const sigEnd = TR.indexOf(') {\n', i);
  const params = TR.slice(TR.indexOf('(', i) + 1, sigEnd);
  const end = TR.indexOf('\n  }\n', sigEnd);
  return { params, body: TR.slice(sigEnd + 4, end) };
}
const WORLD_SCALE = Number((TR.match(/const WORLD_SCALE\s*=\s*([\d.]+)/) ?? [])[1]);
const S = (v) => v / WORLD_SCALE;
const NAMES = ['THREE', 'S', 'GAME_CONFIG', 'window', 'performance', 'isEngagementInView', 'isEnemyVessel', 'STAGE', 'solveStage', 'pairKey',
  'clusterEncounters', 'bandEdgesWU', 'stageBlend', 'stageBlendFloored', 'motionSegment', 'motionAt', 'targetVelocity', 'lengthPx', 'VESSEL_TARGET_SIZE', 'WORLD_SCALE', '_STAGE_V', 'centroidOf',
  'fitWatchFrameOffset', 'viewOffsetFrame', 'watchSafeRect', 'getMapInsets', 'COSMIC', 'glideRetarget', 'glideStep',
  'encounterClusters', 'encounterParticipants', 'pickStageField', 'stagePointLogical', 'stagePointDrawn', 'shellBaseAt',
  'simClockMs', 'capBillboardWorld', 'COMBAT_WATCH', 'ALERT_MARKER_SCALE', 'ALERT_MARKER_REF_DIST', 'ALERT_MARKER_PULSE_MAX'];
const METHODS = ['_unstageVessels', '_spriteBase', '_stageMark', '_stagePlace', '_stageClusters', '_tickBattleStage', 'getVesselStageBlend',
  '_stageWatchFit', '_stageFields', 'stageLogicalOf', 'stageWorldOf', '_placeFreeVessel', '_tickCombatGlide', '_setSpriteBase', '_syncEnemyAlertMarkers'];
const trNum = (re) => Number((TR.match(re) ?? [])[1]);
const ALERT_MARKER_SCALE = trNum(/const ALERT_MARKER_SCALE\s*=\s*([\d.]+)/), ALERT_MARKER_REF_DIST = trNum(/const ALERT_MARKER_REF_DIST\s*=\s*([\d.]+)/);
const ALERT_MARKER_PULSE_MAX = trNum(/const ALERT_MARKER_PULSE_MAX\s*=\s*([\d.]+)/);
function makeMethod(name) {
  const m = methodOf(name);
  if (!m) return null;
  try {
    return new Function(...NAMES, `return function (${m.params}) {\n${m.body}\n};`)(
      THREE, S, GAME_CONFIG, globalThis.window, globalThis.performance, FX.isEngagementInView, isEnemyVessel, SL?.STAGE, SL?.solveStage, SL?.pairKey,
      SL?.clusterEncounters, SL?.bandEdgesWU, SZ?.stageBlend, SZ?.stageBlendFloored, SMOT?.motionSegment, SMOT?.motionAt, SMOT?.targetVelocity, SZ?.lengthPx, VESSEL_TARGET_SIZE, WORLD_SCALE, new THREE.Vector3(),
      CW.centroidOf, CW.fitWatchFrameOffset, CW.viewOffsetFrame, CW.watchSafeRect, getMapInsets, COSMIC, CW.glideRetarget, CW.glideStep,
      SL?.encounterClusters, SL?.encounterParticipants, SL?.pickStageField, SL?.stagePointLogical, SL?.stagePointDrawn, SL?.shellBaseAt,
      simClockMs, CW.capBillboardWorld, CW.COMBAT_WATCH, ALERT_MARKER_SCALE, ALERT_MARKER_REF_DIST, ALERT_MARKER_PULSE_MAX);
  } catch (e) { console.log(`    (budowa ${name}: ${e.message})`); return null; }
}
const SYS = 'sys_s';
const clock = { now: 5e6 };
let writes = 0;
const trap = (obj) => new Proxy(obj, { set(t, k, v) { writes++; t[k] = v; return true; }, defineProperty(t, k, d) { writes++; return Reflect.defineProperty(t, k, d); } });

/**
 * Bitwa przy ciele w atrapie renderera. `mixed` — przy ciele 2 statki gracza, reszta gracza i wróg wolni (wróg w stronę +z).
 * Statki gracza przy ciele: orbita (sprite na orbicie 3D, w tym JEDEN za planetą względem gracza), wróg przypięty: logicznie
 * w środku ciała, sprite tam, gdzie go przypięto (Finding 626).
 */
function world({ mixed = false, bodyDrawn = true, r: bodyR = 0.1 } = {}) {
  globalThis.performance.now = () => clock.now;
  const body = { id: 'p_x', x: 3, y: 0, z: -1, r: bodyR };
  const vessels = new Map(), orbits = new Set();
  const A = [], B = [];
  const thetas = [0.2, -0.3, 0.6, -0.5, 0.0, Math.PI];         // ostatni za planetą (po drugiej stronie niż reszta)
  const add = (id, side, logical, sprite, dockedAt, orbit) => {
    const pos = trap({ x: logical.x * 10, y: logical.z * 10, state: 'orbiting', dockedAt });
    const v = { id, name: id, systemId: SYS, position: pos, isEnemy: side === 'B', ownerEmpireId: side === 'B' ? 'emp_s' : undefined };
    vessels.set(id, trap(v));
    if (orbit) orbits.add(id);
    (side === 'A' ? A : B).push(id);
    return { id, sprite };
  };
  const sprites = [];
  for (let i = 0; i < 6; i++) {
    const docked = !mixed || i < 2;
    if (docked) {
      const r = Math.max(0.2, 2 * bodyR) + 0.01 * i, th = thetas[i], ph = Math.PI / 2 + (i % 2 ? 0.2 : -0.15);
      const o = { x: body.x + r * Math.sin(ph) * Math.cos(th), y: r * Math.cos(ph), z: body.z + r * Math.sin(ph) * Math.sin(th) };
      sprites.push(add(`A0${i}`, 'A', o, o, 'p_x', true));
    } else {
      const o = { x: body.x + 0.05 * (i - 3), y: 0.3, z: body.z + 0.45 };
      sprites.push(add(`A0${i}`, 'A', o, o, null, false));
    }
  }
  for (let i = 0; i < 6; i++) {
    if (!mixed) sprites.push(add(`B0${i}`, 'B', { x: body.x, y: 0, z: body.z }, { x: body.x - 0.7 + 0.03 * i, y: 0.3, z: body.z - 0.3 }, 'p_x', false));
    else { const o = { x: body.x + 0.04 * (i - 2.5), y: 0.3, z: body.z + 0.85 }; sprites.push(add(`B0${i}`, 'B', o, o, null, false)); }
  }
  const enc = { id: 'enc_s', isActive: true, currentRound: 0, location: { systemId: SYS, point: { x: body.x * 10, y: body.z * 10 } },
    sideA: { vesselIds: A, joinedVesselIds: [] }, sideB: { vesselIds: B, joinedVesselIds: [] },
    vesselStates: new Map([...A, ...B].map((v) => [v, { hp: 100, shieldHP: 0 }])), timeline: [] };
  const ts = { isPaused: false, multiplier: 1, combatRoundMs: () => 1000 };
  window.KOSMOS = { activeSystemId: SYS, timeSystem: ts, uiScale: 1,
    vesselManager: { getVessel: (id) => vessels.get(id) ?? null },
    orbitalSpaceSystem: { getOrbit: (id) => (orbits.has(id) ? { planetId: 'p_x' } : null) },
    deepSpaceCombatSystem: { listActive: () => (enc.isActive ? [enc] : []), _activeEncounters: new Map([[enc.id, enc]]),
      _findActiveEncounterContaining: (vid) => (enc.isActive && enc.vesselStates.has(vid) ? enc : null) },
    combatHud: { getPanelRect: () => ({ x: 520, y: 600, w: 560, h: 300 }) } };
  window.innerWidth = 1600; window.innerHeight = 1041;
  const R = { camera: new THREE.PerspectiveCamera(55, 1600 / 1041, 0.001, 5000), scene: new THREE.Scene(), _vessels: new Map(),
    _galaxyActive: false, _galaxyFlight: false, _stageMarks: new Map(), _stageState: new Map(), _stageClock: PC ? new PC.PresentationClock() : null,
    _stageFrame: null, _stageClusterOf: new Map(), _stageParticipants: new Set(), _stageEdges: null, _stageFitCache: new Map(), _stageFitFrame: -1, _frameNo: 0, _glideLastMs: null,
    missing: [] };
  for (const n of METHODS) { const fn = makeMethod(n); if (fn) R[n] = fn; else R.missing.push(n); }
  R.getBodyWorldInfo = (id) => (bodyDrawn && id === 'p_x' ? { x: body.x, y: body.y, z: body.z, r: body.r } : null);
  for (const s of sprites) {
    const sp = new THREE.Object3D(); sp.visible = true; sp.position.set(s.sprite.x, s.sprite.y, s.sprite.z);
    const e = { sprite: sp, glide: null };
    R._vessels.set(s.id, e);
    const v = vessels.get(s.id);
    if (v.position.dockedAt == null) R._placeFreeVessel?.(s.id, e, v.position.x, v.position.y);
  }
  return { R, vessels, enc, ts, body, A, B, orbits, cc: null };
}
function frame(R, ms = 16) { clock.now += ms; R._frameNo++; R._unstageVessels(); R._tickCombatGlide(); R._tickBattleStage(); }
function cameraAt(R, target, d) {
  R.camera.position.set(target.x + d * Math.sin(1.1) * Math.cos(0.3), target.y + d * Math.cos(1.1), target.z + d * Math.sin(1.1) * Math.sin(0.3));
  R.camera.lookAt(target.x, target.y, target.z); R.camera.updateMatrixWorld(true);
}
const stageCentre = (R) => {
  const sp = R._stageState.get('enc_s')?.stagePos; if (!sp?.size) return null;
  const c = { x: 0, y: 0, z: 0 }; for (const p of sp.values()) { c.x += p.x; c.y += p.y; c.z += p.z; }
  return { x: c.x / sp.size, y: c.y / sp.size, z: c.z / sp.size };
};
const drawn = (R, id) => R._vessels.get(id).sprite.position;
const FLAG0 = GAME_CONFIG.FEATURES.cvStage;
GAME_CONFIG.FEATURES.cvStage = true;
// ARC CV-3b — ten keeper pinuje warstwę SCENY (CV-3a / CV-6b) przy choreografii WYŁĄCZONEJ: choreografia to osobna warstwa
//   za flagą `cvChoreo` (przesunięcia w kopercie, kurs, silnik), pinowana z tymi samymi niezmiennikami sceny (pasma, ciągłość,
//   pauza, zero zapisów) w `cv_choreo_render_smoke` / `cv_choreo_logic_smoke`.
GAME_CONFIG.FEATURES.cvChoreo = false;

// ═══ R1 / R2 ══════════════════════════════════════════════════════════════════════════════════════════════════════
block('R1 / R2 — renderer: obie strony przy ciele (skorupa, kierunek, pasma, zoom bez przelotu przez ciało)', () => {
  const w = world();
  const { R, body, vessels } = w;
  assert(R.missing.length === 0, `R1-0 metody renderera ze źródła${R.missing.length ? ' — brak: ' + R.missing.join(', ') : ''}`);
  cameraAt(R, { x: body.x, y: 0.3, z: body.z }, 6);
  writes = 0;
  frame(R); frame(R);
  const sc = stageCentre(R);
  // R2 — zoom z daleka (6 j.) do kina (0,4 j. od grupy) w 60 klatkach: w każdej klatce każdy statek poza skorupą
  const R0 = body.r + FLOOR_L * L;
  let minIn = Infinity, minStraight = Infinity;
  for (let f = 0; f < 60; f++) {
    const d = 6 * Math.pow(0.4 / 6, (f + 1) / 60);
    cameraAt(R, sc, d);
    frame(R);
    const sp = R._stageState.get('enc_s')?.stagePos;
    const k = R._stageFrame?.list?.[0]?.blend ?? 0;
    for (const id of [...w.A, ...w.B]) {
      minIn = Math.min(minIn, d3(drawn(R, id), body) - R0);
      const m = R._stageMarks.get(id), t = sp?.get(id);
      if (m && t) { const kk = m.k, s = { x: m.base.x + (t.x - m.base.x) * kk, y: m.base.y + (t.y - m.base.y) * kk, z: m.base.z + (t.z - m.base.z) * kk }; minStraight = Math.min(minStraight, d3(s, body) - R0); }
    }
  }
  for (let f = 0; f < 40; f++) frame(R);
  const info = R._stageFrame?.list?.[0];
  const pts = [...vessels.values()].map((v) => ({ id: v.id, x: S(v.position.x), z: S(v.position.y) }));
  const drawnMap = new Map([...R._vessels].map(([id, e]) => [id, { x: e.sprite.position.x, y: e.sprite.position.y, z: e.sprite.position.z }]));
  const mis = SL.countMisbanded(pts, drawnMap, EDGES);
  let minAll = Infinity; for (const p of drawnMap.values()) minAll = Math.min(minAll, d3(p, body) - R0);
  const gc = { x: 0, z: 0 }; for (const p of drawnMap.values()) { gc.x += p.x; gc.z += p.z; } gc.x /= drawnMap.size; gc.z /= drawnMap.size;
  const pc = { x: 0, z: 0 }; let n = 0; for (const id of w.A) { const v = vessels.get(id); pc.x += S(v.position.x); pc.z += S(v.position.y); n++; } pc.x /= n; pc.z /= n;
  const gu = { x: gc.x - body.x, z: gc.z - body.z }, pu = { x: pc.x - body.x, z: pc.z - body.z };
  const cos = (gu.x * pu.x + gu.z * pu.z) / (Math.hypot(gu.x, gu.z) * Math.hypot(pu.x, pu.z));
  console.log(`     kino: stopień ${info?.blend?.toFixed(3)}, wejście ${info?.join?.toFixed(3)}, kierunek ${info?.shell?.source}, zapas min. ${(minAll / L).toFixed(3)} L, złych par ${mis} (awaryjna ${info?.fallback}); `
    + `zoom: zapas min. ${(minIn / L).toFixed(3)} L, prosta interpolacja ${(minStraight / L).toFixed(3)} L; cos(grupa, gracz) ${cos.toFixed(3)}`);
  assert(info?.blend > 0.99 && info?.join > 0.99 && minAll >= -1e-9, `R1a SEDNO: w kinie każdy statek poza skorupą (zapas min. ${(minAll / L).toFixed(3)} L)`);
  assert(info?.shell?.source === 'player' && cos > 0.95, `R1b grupa po stronie statków gracza (kierunek ${info?.shell?.source}, cos ${cos.toFixed(3)})`);
  assert(mis === 0 || info?.fallback === true, `R1c pary spójne w pasmach (${mis} złych) albo klaster oznaczony jako awaryjny`);
  assert(writes === 0, `R1d (b) zero zapisów na statkach i ich \`position\` (${writes})`);
  assert(minIn >= -1e-9, `R2a SEDNO: zoom 6 → 0,4 j. — w każdej klatce każdy statek poza skorupą (zapas min. ${(minIn / L).toFixed(3)} L)`);
  assert(minStraight < 0, `R2b KONTROLA: prosta interpolacja baza → cel (statek z orbity za planetą) wchodziła w skorupę (${(minStraight / L).toFixed(3)} L)`);
});

// ═══ R3 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('R3 — mieszana: przy ciele mniejszość gracza, wróg wolny — grupa w stronę wroga', () => {
  const w = world({ mixed: true });
  const { R, body } = w;
  cameraAt(R, { x: body.x, y: 0.3, z: body.z }, 6); frame(R);
  cameraAt(R, stageCentre(R), 0.4);
  for (let f = 0; f < 60; f++) frame(R);
  const info = R._stageFrame?.list?.[0];
  const pin = ['A00', 'A01'].map((id) => drawn(R, id));
  const pz = (pin[0].z + pin[1].z) / 2 - body.z, px = (pin[0].x + pin[1].x) / 2 - body.x;
  const R0 = body.r + FLOOR_L * L;
  let minAll = Infinity; for (const [, e] of R._vessels) minAll = Math.min(minAll, d3(e.sprite.position, body) - R0);
  assert(info?.shell?.source === 'free-opposing' && pz > 0 && pz > Math.abs(px) && minAll >= -1e-9,
    `R3 kierunek ${info?.shell?.source}: unieruchomieni gracza po stronie wroga (+z: ${pz.toFixed(3)} j., x ${px.toFixed(3)}), nikt w skorupie`);
});

// ═══ R4 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('R4 — (626) wróg przypięty bez orbity: stoi w pauzie, wchodzi na skorupę płynnie, w skali prawdziwej za skorupą', () => {
  const w = world();
  const { R, ts, body } = w;
  const id = 'B02';
  const stale = drawn(R, id).clone();
  // ⚠ ARC CV-6b (decyzja właściciela 20): przy podłodze domyślnej bitwa jest na scenie przy każdym zoomie — skala prawdziwa
  //   uczestnika (to, co ten blok pinuje: baza przypiętego bez orbity wchodzi za skorupę) istnieje przy podłodze 0 (krzywa CV-3a1).
  R.cvTuning = { STAGE_BLEND_FLOOR: 0 };
  cameraAt(R, { x: body.x, y: 0.3, z: body.z }, 6);
  ts.isPaused = true;
  for (let f = 0; f < 30; f++) frame(R);
  const paused = drawn(R, id).clone();
  ts.isPaused = false;
  let maxStep = 0, prev = drawn(R, id).clone(), total = 0;
  for (let f = 0; f < 40; f++) { frame(R); const p = drawn(R, id).clone(); maxStep = Math.max(maxStep, p.distanceTo(prev)); total += p.distanceTo(prev); prev = p; }
  const after = drawn(R, id).clone();
  const R0 = body.r + FLOOR_L * L;
  const blend = R._stageFrame?.list?.[0]?.blend ?? 1;
  assert(paused.equals(stale), 'R4a pauza od startu: przypięty wróg stoi tam, gdzie go przypięto (co do bitu)');
  assert(blend < 0.01 && d3(after, body) >= R0 - 1e-9 && after.distanceTo(stale) > 0.3,
    `R4b skala prawdziwa (stopień ${blend.toFixed(3)}): po wejściu rysowany za skorupą (${((d3(after, body) - R0) / L).toFixed(2)} L zapasu), nie w dawnym miejscu`);
  assert(total > 0 && maxStep <= total / 31 * 1.6, `R4c wejście płynne: największy krok ${(maxStep / L).toFixed(2)} L przy drodze ${(total / L).toFixed(1)} L (bez teleportu)`);
});

// ═══ R5 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('R5 — ciało krąży wokół gwiazdy: grupa idzie za nim', () => {
  const w = world();
  const { R, body } = w;
  cameraAt(R, { x: body.x, y: 0.3, z: body.z }, 6); frame(R);
  cameraAt(R, stageCentre(R), 0.4);
  for (let f = 0; f < 120; f++) frame(R);                       // przejście rozwiązania dobiegło (1 runda)
  const before = new Map([...R._vessels].map(([id, e]) => [id, e.sprite.position.clone()]));
  body.x += 0.02; body.z += 0.01;                                // ciało przesunięte między klatkami (bez rundy)
  frame(R);
  let worst = 0;
  for (const [id, e] of R._vessels) { const b = before.get(id); worst = Math.max(worst, Math.hypot(e.sprite.position.x - b.x - 0.02, e.sprite.position.z - b.z - 0.01)); }
  assert(worst < 1e-9, `R5 grupa przesunięta o wektor ciała (odchyłka maks. ${worst.toExponential(1)} j.)`);
});

// ═══ R6 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('R6 — pole kliku na bitwie przy ciele', () => {
  const w = world();
  const { R, body } = w;
  cameraAt(R, { x: body.x, y: 0.3, z: body.z }, 6); frame(R);
  const sc = stageCentre(R);
  cameraAt(R, sc, 0.4);
  for (let f = 0; f < 60; f++) frame(R);
  const p = { x: sc.x + 0.012, z: sc.z - 0.009 };
  const lp = R.stageLogicalOf(SYS, p.x, p.z);
  const back = lp?.staged ? R.stageWorldOf(SYS, lp.x, lp.z) : null;
  assert(lp?.staged === true && back && Math.hypot(back.x - p.x, back.z - p.z) < 1e-9, `R6a klik w bitwie przy ciele: rysowany → logiczny (${lp ? Math.hypot(lp.x - p.x, lp.z - p.z).toFixed(3) : '—'} j. dalej) → rysowany co do 1e-9`);
  const w2 = world({ bodyDrawn: false });
  cameraAt(w2.R, { x: body.x, y: 0.3, z: body.z }, 0.4);
  for (let f = 0; f < 60; f++) frame(w2.R);
  const lp2 = w2.R.stageLogicalOf(SYS, p.x, p.z);
  assert(lp2?.staged === false && w2.R._stageMarks.size === 0, 'R6b KONTROLA: ciało bez rysunku — bitwa bez sceny, klik bez zmian (jak przed CV-3a3)');
});

// ═══ R6c ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// Pole kliku = odwrotność mapy, którą scena NAPRAWDĘ rysuje: dla każdego statku bitwy przy ciele pole przeniesione z jego
// pozycji logicznej (`stageWorldOf`) trafia w jego cel na scenie z dokładnością prowadnicy (≤ podłoga rozsunięcia 1,6 L).
// KONTROLA R6d (liczona w keeperze ze stanu sceny, niezależna od pola renderera — zielona po obu stronach): wzór pola sprzed
// poprawki (środek = grupa RYSOWANA dla obu stron, promień od niej, bez przesunięcia) przy dużym ciele (1 j.) rozjeżdża się ze
// sceną ponad tolerancję — metryka widzi defekt.
block('R6c — pole kliku przy skorupie zgodne ze sceną (FAIL 5 kontroli właściciela)', () => {
  const tol = (SL?.STAGE?.DECONFLICT_L ?? 1.6);
  const rows = [];
  for (const r of [0.3, 0.6, 1.0]) {
    const w = world({ r });
    const { R, body, vessels } = w;
    cameraAt(R, { x: body.x, y: 0.3, z: body.z }, 6); frame(R);
    cameraAt(R, stageCentre(R), 0.5);
    for (let f = 0; f < 140; f++) frame(R);
    const info = R._stageFrame?.list?.[0], st = R._stageState.get('enc_s');
    const errNew = [], errOld = [];
    let px = 0, pz = 0, pn = 0;
    for (const [id, t] of st.stagePos) if (vessels.get(id)?.position?.dockedAt === 'p_x') { px += t.x; pz += t.z; pn++; }
    const P = st.sol.shell.P; let rMax = 0;
    for (const v of vessels.values()) rMax = Math.max(rMax, Math.hypot(S(v.position.x) - P.x, S(v.position.y) - P.z));
    const fOld = { centre: { x: px / pn, z: pz / pn }, rIn: rMax * SL.STAGE.R_IN_MARGIN, blend: (info.blend ?? 0) * (info.join ?? 0), scale: null };
    for (const [id, t] of st.stagePos) {
      const v = vessels.get(id), lx = S(v.position.x), lz = S(v.position.y);
      const q = R.stageWorldOf(SYS, lx, lz), o = SL.stagePointDrawn({ x: lx, z: lz }, fOld);
      errNew.push(Math.hypot(q.x - t.x, q.z - t.z) / L); errOld.push(Math.hypot(o.x - t.x, o.z - t.z) / L);
    }
    const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    rows.push({ r, blend: info.blend * info.join, shift: !!info.shift, newMed: med(errNew), oldMed: med(errOld) });
  }
  console.log('     ' + rows.map((q) => `r ${q.r}: stopień ${q.blend.toFixed(3)}, przesunięcie ${q.shift}, zgodność mediana ${q.newMed.toFixed(2)} L (sprzed poprawki ${q.oldMed.toFixed(2)} L)`).join('; '));
  assert(rows.length === 3 && rows.every((q) => q.blend > 0.99 && q.shift && q.newMed <= tol),
    `R6c SEDNO: pole przy skorupie = mapa sceny — mediana różnicy pole ↔ cel na scenie ≤ ${tol} L przy ciele 0,3 / 0,6 / 1 j. (${rows.map((q) => q.newMed.toFixed(2)).join(' / ')} L)`);
  const big = rows.find((q) => q.r === 1.0);
  assert(!!big && big.oldMed > tol, `R6d KONTROLA: wzór pola sprzed poprawki (liczony w keeperze) przy ciele 1 j. rozjeżdża się ze sceną ponad tolerancję (${big?.oldMed?.toFixed?.(2)} L > ${tol} L)`);
});

// ═══ R7 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('R7 — kadr „Obserwuj” na bitwie przy ciele', () => {
  const w = world();
  const { R, body, enc, ts } = w;
  R._cameraController = { _theta: 0.3, _phi: 1.1, _targetDist: 3, _target: new THREE.Vector3(), _dist: 3 };
  cameraAt(R, { x: body.x, y: 0.3, z: body.z }, 3);
  ts.isPaused = true;
  for (let f = 0; f < 20; f++) frame(R);
  const before = R._stageWatchFit(enc);
  ts.isPaused = false;
  for (let f = 0; f < 60; f++) frame(R);
  R._stageFitFrame = -1;
  const after = R._stageWatchFit(enc);
  const blendAt = (d) => SZ.stageBlend(SZ.lengthPx({ length: L, depth: d, fovDeg: R.camera.fov, H: 1041 }));
  assert(after?.cinema === true && blendAt(after.dist) >= 0.999 && before?.dist > after.dist * 3,
    `R7 pauza przed wejściem: kadr ${before?.dist?.toFixed(3)} j.; po wejściu kino ${after?.dist?.toFixed(3)} j. (stopień ${after ? blendAt(after.dist).toFixed(3) : '—'})`);
});

// ═══ R8 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('R8 — źródło: kadr z celów wyświetlanych, pole kliku bez wyjątku „przy ciele”', () => {
  const fit = strip(methodOf('_stageWatchFit')?.body ?? ''), fields = strip(methodOf('_stageFields')?.body ?? '');
  assert(/this\._stageState\.get\(cl\.id\)\?\.stagePos/.test(fit) && !/cl\.pinned/.test(fit) && !/c\.pinned/.test(fields),
    'R8 `_stageWatchFit` czyta cele wyświetlane (`stagePos`), `_stageFields` i kadr bez dawnego „klaster przy ciele — bez sceny”');
});

// ═══ R9 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('R9 — zapis orbity między klatkami: sprite ze sceny zostaje rysowany, baza w znaczniku', () => {
  const w = world();
  const { R, body } = w;
  cameraAt(R, { x: body.x, y: 0.3, z: body.z }, 6); frame(R);
  cameraAt(R, stageCentre(R), 0.4);
  for (let f = 0; f < 60; f++) frame(R);
  const id = 'A01', e = R._vessels.get(id), m = R._stageMarks.get(id);
  const drawnBefore = e.sprite.position.clone();
  const nb = { x: m.base.x + 0.004, y: m.base.y - 0.002, z: m.base.z + 0.003 };   // nowa pozycja na orbicie (tik fizyki)
  R._setSpriteBase(id, e, nb.x, nb.y, nb.z);
  const held = e.sprite.position.clone();
  R._unstageVessels();
  const restored = e.sprite.position.clone();
  assert(held.distanceTo(drawnBefore) < 1e-12 && m.base.x === nb.x && m.base.z === nb.z && restored.x === nb.x && restored.y === nb.y && restored.z === nb.z,
    'R9a SEDNO: tik orbity między klatkami — sprite zostaje w pozycji rysowanej, nowa baza w znaczniku, następna klatka zaczyna od niej');
  const loose = { sprite: new THREE.Object3D() };
  R._setSpriteBase('nie_na_scenie', loose, 1, 2, 3);
  assert(loose.sprite.position.x === 1 && loose.sprite.position.y === 2 && loose.sprite.position.z === 3, 'R9b KONTROLA: statek bez znacznika — zapis wprost (jak dotąd)');
  const tov = strip(methodOf('_tickOrbitingVessels')?.body ?? '');
  assert(/this\._setSpriteBase\(id, entry, pos\.x, pos\.y, pos\.z\)/.test(tov) && !/entry\.sprite\.position\.set\(pos\.x, pos\.y, pos\.z\)/.test(tov),
    'R9c źródło: gałąź orbity `_tickOrbitingVessels` pisze przez `_setSpriteBase` (bez zapisu wprost)');
  // Po kontroli właściciela (Finding 662 (a) — statek w locie WEWNĄTRZ bitwy jest teraz codzienny; Finding 668): gałąź „statek
  // w locie” `_syncVesselPositions` (na `vessel:positionUpdate`, między klatkami) też przez `_setSpriteBase` — w grze odczyt bez tego
  // skakał o 26–31 L na tiku. Gałąź „bez misji” zostaje zapisem wprost (pin `patrol_render_sync_smoke` T6; uczestnicy bitwy bez misji
  // są zamrożeni przez DSCS jako `orbiting` i idą przez `_placeFreeVessel`).
  const svp = strip(methodOf('_syncVesselPositions')?.body ?? '');
  assert(/this\._setSpriteBase\(vessel\.id, entry, S\(vx\), shipY, S\(vy\)\)/.test(svp) && !/entry\.sprite\.position\.set\(S\(vx\), shipY, S\(vy\)\)/.test(svp),
    'R9d źródło: gałąź „w locie” `_syncVesselPositions` pisze przez `_setSpriteBase` (bez zapisu wprost)');
});

// ═══ R10 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// FAIL 5 kontroli właściciela (2026-11-09): rozkaz ruchu dla statku gracza w bitwie przy ciele zdejmuje go z orbity — dawniej
// kierunek skorupy przeskakiwał na niego i CAŁA grupa obracała się wokół planety w jednej rundzie (w grze 158–161°, statki
// 8 klatek nad tarczą, uwolniony statek nad środkiem planety — „jak przez środek planety”). Tu: statek za planetą (θ = π)
// zdjęty z orbity — grupa stoi, nikt nie jest rysowany nad tarczą.
block('R10 — statek zdjęty z orbity nie obraca grupy wokół ciała', () => {
  const w = world();
  const { R, body, vessels, enc, orbits } = w;
  cameraAt(R, { x: body.x, y: 0.3, z: body.z }, 6); frame(R);
  cameraAt(R, stageCentre(R), 0.4);
  for (let f = 0; f < 80; f++) frame(R);
  const angOf = () => { const c = stageCentre(R); return Math.atan2(c.z - body.z, c.x - body.x); };
  const a0 = angOf(), src0 = R._stageFrame?.list?.[0]?.shell?.source;
  const v = vessels.get('A05');
  const slotOff = Math.abs(((Math.atan2(S(v.position.y) - body.z, S(v.position.x) - body.x) - a0 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
  v.position.dockedAt = null; v.position.state = 'in_transit'; orbits?.delete?.('A05');
  R._placeFreeVessel('A05', R._vessels.get('A05'), v.position.x, v.position.y);
  enc.currentRound++;
  let swing = 0, overDisc = 0, minMover = Infinity;
  for (let f = 0; f < 90; f++) {
    frame(R);
    let d = Math.abs(angOf() - a0) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d;
    swing = Math.max(swing, d);
    for (const id of [...w.A, ...w.B]) { const p = drawn(R, id); if (Math.hypot(p.x - body.x, p.z - body.z) < body.r) overDisc++; }
    const pm = drawn(R, 'A05'); minMover = Math.min(minMover, Math.hypot(pm.x - body.x, pm.z - body.z) / body.r);
  }
  const src1 = R._stageFrame?.list?.[0]?.shell?.source;
  const empMajor = [...vessels.values()].filter((q) => q.position.dockedAt === 'p_x' && q.isEnemy).length
    > [...vessels.values()].filter((q) => q.position.dockedAt === 'p_x' && !q.isEnemy).length;
  console.log(`     kierunek ${src0} → ${src1}, statek za planetą ${(slotOff * 180 / Math.PI).toFixed(0)}° od grupy, obrót maks. ${(swing * 180 / Math.PI).toFixed(1)}°, `
    + `klatki ze statkiem nad tarczą ${overDisc}, uwolniony statek min. ${minMover.toFixed(2)} promienia ciała`);
  assert(empMajor && slotOff > Math.PI * 0.75, 'R10a świadek: po zdjęciu z orbity wróg ma przy ciele przewagę, a statek stoi w logice po drugiej stronie ciała niż grupa');
  assert(swing < 10 * Math.PI / 180 && src1 === src0, `R10b SEDNO: grupa nie obraca się wokół ciała (obrót ${(swing * 180 / Math.PI).toFixed(1)}° < 10°, kierunek ${src0} → ${src1})`);
  assert(overDisc === 0 && minMover >= 1, `R10c żaden statek nie jest rysowany nad tarczą ciała (${overDisc} klatek), uwolniony statek ≥ promień ciała (${minMover.toFixed(2)})`);
});

// ═══ R11 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// Finding 666 (b) (decyzja właściciela 2026-11-09): uczestnik klastra starć W WIDOKU nie dostaje celownika 3D przy ŻADNYM zoomie
// (romby HUD oznaczają wroga) — także bitwa przy ciele i bitwa przy ciele bez rysunku (klaster bez sceny); wróg w widoku poza
// starciem i flaga OFF — jak dotąd.
block('R11 — bitwa przy ciele: uczestnicy bez celownika przy każdym zoomie (666 (b))', () => {
  const prevFeat = GAME_CONFIG.FEATURES.fcEnemyAlertMarker;
  GAME_CONFIG.FEATURES.fcEnemyAlertMarker = true;
  const run = ({ bodyDrawn }) => {
    const w = world({ bodyDrawn });
    const { R, body, vessels } = w;
    Object.assign(R, { _enemyAlertMarkers: new Map(), _getAlertReticleTex: () => (R._tex ??= new THREE.Texture()), _isEnemyTargetable: () => true,
      _hud3dHex: () => 0xcc4433, _viewDepth: () => 1 });
    R._disposeEnemyAlertMarker = (k) => { const m = R._enemyAlertMarkers.get(k); if (m) R.scene.remove(m); R._enemyAlertMarkers.delete(k); };
    R._disposeAllEnemyAlertMarkers = () => { for (const k of [...R._enemyAlertMarkers.keys()]) R._disposeEnemyAlertMarker(k); };
    const xs = { id: 'X01', name: 'X01', systemId: SYS, isEnemy: true, ownerEmpireId: 'emp_s', position: { x: (body.x + 0.6) * 10, y: (body.z + 0.6) * 10, state: 'orbiting', dockedAt: null } };
    vessels.set(xs.id, xs);
    const spX = new THREE.Object3D(); spX.visible = true; spX.position.set(body.x + 0.6, 0.3, body.z + 0.6);
    R._vessels.set(xs.id, { sprite: spX, glide: null });
    // ⚠ ARC CV-6b (decyzja właściciela 20): „z daleka” przy podłodze 0 (krzywa CV-3a1, skala prawdziwa) — świadek, że celownika
    //   nie gasi stopień sceny, tylko reguła 666 (b); przy podłodze domyślnej z daleka też jest scena (stopień 1).
    const at = (target, d, on, floor = null) => {
      GAME_CONFIG.FEATURES.cvStage = on;
      if (floor != null) R.cvTuning = { STAGE_BLEND_FLOOR: floor }; else delete R.cvTuning;
      cameraAt(R, target, d);
      for (let f = 0; f < 60; f++) frame(R);
      R._syncEnemyAlertMarkers();
      delete R.cvTuning;
      return { foes: w.B.filter((id) => R._enemyAlertMarkers.has(id)).length, other: R._enemyAlertMarkers.has(xs.id), k: Math.max(...w.B.map((id) => R._stageMarks.get(id)?.k ?? 0)) };
    };
    cameraAt(R, { x: body.x, y: 0.3, z: body.z }, 6); frame(R);
    const sc = stageCentre(R) ?? { x: body.x, y: 0.3, z: body.z };
    const cinema = at(sc, 0.4, true), far = at({ x: body.x, y: 0.3, z: body.z }, 30, true, 0), off = at(sc, 0.4, false);
    GAME_CONFIG.FEATURES.cvStage = FLAG0 ?? true;
    return { cinema, far, off, n: w.B.length };
  };
  const drawnB = run({ bodyDrawn: true }), bare = run({ bodyDrawn: false });
  GAME_CONFIG.FEATURES.fcEnemyAlertMarker = prevFeat;
  console.log(`     przy ciele: kino ${drawnB.cinema.foes}/${drawnB.n} (stopień ${drawnB.cinema.k.toFixed(2)}), z daleka ${drawnB.far.foes}/${drawnB.n} (stopień ${drawnB.far.k.toFixed(2)}), flaga OFF ${drawnB.off.foes}/${drawnB.n}; `
    + `ciało bez rysunku: ${bare.cinema.foes} / ${bare.far.foes} / OFF ${bare.off.foes}; wróg poza starciem ${[drawnB.cinema.other, drawnB.far.other, bare.cinema.other].join(' / ')}`);
  assert(drawnB.cinema.k > 0.99 && drawnB.far.k < 0.01, `R11a świadek: kino — stopień ${drawnB.cinema.k.toFixed(3)}, z daleka — ${drawnB.far.k.toFixed(3)}`);
  assert(drawnB.cinema.foes === 0 && drawnB.far.foes === 0 && bare.cinema.foes === 0 && bare.far.foes === 0,
    `R11b SEDNO: uczestnicy bitwy przy ciele w widoku — 0 celowników w kinie i z daleka, także przy ciele bez rysunku (${drawnB.cinema.foes} / ${drawnB.far.foes} / ${bare.cinema.foes} / ${bare.far.foes})`);
  assert(drawnB.cinema.other && drawnB.far.other && bare.cinema.other && drawnB.off.foes === drawnB.n && bare.off.foes === bare.n,
    `R11c KONTROLA: wróg w widoku poza starciem — celownik jak dotąd; flaga OFF — celownik u wszystkich ${drawnB.n} uczestników (${drawnB.off.foes} / ${bare.off.foes})`);
});

// ═══ R12 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// ARC CV-6b (decyzja właściciela 20 — D-CV-3 zmienione): bitwa przy ciele z daleka zostaje ściśniętym węzłem za skorupą — żaden
// statek w skorupie, żadna linia gracz → wróg (tor wiązki) nie przechodzi przez ciało. KONTROLA: podłoga 0 (krzywa CV-3a1) —
// z daleka statki na orbitach dookoła ciała (także za planetą), linie przecinają ciało (skarga właściciela).
block('R12 — decyzja 20: bitwa przy ciele z daleka — węzeł za skorupą, żadna linia przez planetę', () => {
  GAME_CONFIG.FEATURES.cvStage = true;
  const segHitsSphere = (p, q, c, r) => {
    const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z, ll = dx * dx + dy * dy + dz * dz;
    const t = ll > 0 ? Math.max(0, Math.min(1, ((c.x - p.x) * dx + (c.y - p.y) * dy + (c.z - p.z) * dz) / ll)) : 0;
    return Math.hypot(p.x + dx * t - c.x, p.y + dy * t - c.y, p.z + dz * t - c.z) < r;
  };
  // Ciało 0,3 j. (planeta skalista / lodowa; orbity 0,6 j., jeden statek za planetą) — przy małym ciele linie biegną nad nim.
  const run = (floor) => {
    const w = world({ r: 0.3 });
    const { R, body } = w;
    if (floor != null) R.cvTuning = { STAGE_BLEND_FLOOR: floor };
    cameraAt(R, { x: body.x, y: 0.3, z: body.z }, 30);
    for (let f = 0; f < 60; f++) frame(R);   // pełne wejście z daleka
    const R0 = body.r + FLOOR_L * L;
    let minOut = Infinity, cross = 0, pairs = 0;
    for (const id of [...w.A, ...w.B]) minOut = Math.min(minOut, d3(drawn(R, id), body) - R0);
    for (const a of w.A) for (const b of w.B) { pairs++; if (segHitsSphere(drawn(R, a), drawn(R, b), body, body.r)) cross++; }
    return { minOut, cross, pairs, k: R._stageFrame?.list?.[0]?.blend ?? 0, curve: R._stageFrame?.list?.[0]?.curve ?? -1 };
  };
  const on = run(null), k0 = run(0);
  console.log(`     30 j. od ciała (krzywa ${on.curve.toFixed(3)}): podłoga 1 — stopień ${on.k.toFixed(3)}, zapas min. ${(on.minOut / L).toFixed(2)} L, linii przez ciało ${on.cross}/${on.pairs}; `
    + `podłoga 0 — stopień ${k0.k.toFixed(3)}, zapas min. ${(k0.minOut / L).toFixed(2)} L, linii przez ciało ${k0.cross}/${k0.pairs}`);
  assert(on.k > 0.999 && on.curve < 0.01 && on.minOut >= -1e-9 && on.cross === 0,
    `R12a SEDNO: z daleka (krzywa zoomu ≈ 0) bitwa przy ciele na scenie (stopień 1): każdy statek za skorupą, 0 / ${on.pairs} linii gracz → wróg przez ciało`);
  assert(k0.k < 0.01 && k0.cross > 0, `R12b KONTROLA podłoga 0 (krzywa CV-3a1): z daleka skala prawdziwa — ${k0.cross} / ${k0.pairs} linii gracz → wróg przechodzi przez ciało`);
});

// ═══ S1 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
const AU = GAME_CONFIG.AU_TO_PX;
function realWorld() {
  const SYSR = 'sys_r';
  const ck = { now: 1e7 }; globalThis.performance.now = () => ck.now;
  reseed('cv3a3-atbody');
  EventBus.clear(); EntityManager.clear();
  const ts = new TimeSystem(); ts.gameTime = 100.00002; ts.multiplierIndex = 1;
  window.KOSMOS = { timeSystem: ts, activeSystemId: SYSR };
  EntityManager.add({ id: 'star_r', type: 'star', name: 'G', systemId: SYSR, x: 0, y: 0, mass: 1 });
  EntityManager.add({ id: 'p_home', type: 'planet', name: 'Dom', systemId: SYSR, x: -4 * AU, y: 0, radius: 6, mass: 1, visual: { radius: 6 } });
  EntityManager.add({ id: 'p_rock', type: 'planet', planetType: 'rocky', name: 'Skala', systemId: SYSR, x: 3 * AU, y: 1 * AU, physics: { mass: 2 } });
  const vm = new VesselManager(); const mos = new MovementOrderSystem(vm); const prox = new ProximitySystem(vm);
  const dscs = new DeepSpaceCombatSystem(vm); new VesselCombatSystem(vm); const eah = new EnemyAttackHandler(); const oss = new OrbitalSpaceSystem();
  const cols = [{ planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: {}, fleet: [] }];
  const empires = [{ id: 'emp_r', name: 'Testowe Imperium' }];
  Object.assign(window.KOSMOS, {
    civMode: true, homePlanet: EntityManager.get('p_home'), vesselManager: vm, movementOrderSystem: mos, proximitySystem: prox,
    deepSpaceCombatSystem: dscs, enemyAttackHandler: eah, orbitalSpaceSystem: oss,
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} },
    techSystem: { isResearched: () => true, getFuelEfficiency: () => 1, getShipSpeedMultiplier: () => 1, getShipRangeMultiplier: () => 1, getMultiplier: () => 1 },
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find(c => c.planetId === id) ?? null, getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
    eventLogSystem: { push: () => {} }, intelSystem: { getVesselContact: () => ({ quality: 'unknown' }), getLevel: () => 'unknown', isAtLeast: () => false },
    empireRegistry: { listAll: () => empires, get: (id) => empires.find(e => e.id === id) ?? null }, debug: { combatTrace: false },
  });
  const H = ST?.cvBattleDebugHelpers?.({ getRenderer: () => null, getSaveSystem: () => ({ _autosaveInterval: 1 }) });
  const play = (frames) => { ts.play(); for (let n = 0; n < frames; n++) { ck.now += 16; ts.update(16); } };
  return { vm, dscs, oss, H, ts, play };
}
block('S1 — stager `cvBattle({ atBody })` z prawdziwym DSCS', () => {
  const w = realWorld();
  const st = w.H?.cvBattle?.({ seed: 1, atBody: 'p_rock' });
  const enc = w.dscs.listActive()[0];
  const cv = w.vm.getAllVessels().filter((v) => /^CV-[AB]\d\d$/.test(v.name ?? ''));
  const A = cv.filter((v) => !v.isEnemy), B = cv.filter((v) => v.isEnemy);
  const orbitsA = A.every((v) => v.position.dockedAt === 'p_rock' && !!w.oss.getOrbit(v.id));
  const pinnedB = B.every((v) => v.position.dockedAt === 'p_rock' && !w.oss.getOrbit(v.id));
  assert(st?.ok === true && st.body === 'p_rock' && enc && enc.vesselStates.size === 20 && orbitsA && pinnedB && st.docked === 10 && st.enemyPinned === 10,
    `S1a atBody 'p_rock': gracz ${st?.docked}/10 na orbitach ciała, wróg ${st?.enemyPinned}/10 PRZYPIĘTY przez DSCS (bez orbity), komplet w jednym starciu (${enc?.vesselStates?.size})`);
  w.play(30);
  const rock = EntityManager.get('p_rock');
  const atCentre = B.every((v) => Math.abs(v.position.x - rock.x) < 1e-6 && Math.abs(v.position.y - rock.y) < 1e-6);
  assert(atCentre && (enc?.currentRound ?? 0) >= 1, `S1b po pierwszym tiku wróg stoi w logice w środku ciała (Finding 626), runda ${enc?.currentRound}`);
  const w2 = realWorld();
  const st2 = w2.H?.cvBattle?.({ seed: 2, atBody: 1, mixed: 1 });
  const cv2 = w2.vm.getAllVessels().filter((v) => /^CV-[AB]\d\d$/.test(v.name ?? ''));
  const B2 = cv2.filter((v) => v.isEnemy);
  assert(st2?.ok === true && st2.docked === 4 && st2.enemyPinned === 0 && B2.every((v) => v.position.dockedAt == null) && st2.engageOrders === '6/6',
    `S1c mixed: przy ciele ${st2?.docked}/10 gracza (mniejszość), wróg wolny (${st2?.enemyPinned} przypiętych), „Zaangażuj” dla wolnych ${st2?.engageOrders}`);
  const w3 = realWorld();
  const st3 = w3.H?.cvBattle?.({ seed: 1 });
  const cv3 = w3.vm.getAllVessels().filter((v) => /^CV-[AB]\d\d$/.test(v.name ?? ''));
  assert(st3?.ok === true && cv3.length === 20 && cv3.every((v) => v.position.dockedAt == null), 'S1d KONTROLA: zwykłe cvBattle — nikt przy ciele');
});

GAME_CONFIG.FEATURES.cvStage = FLAG0;
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
