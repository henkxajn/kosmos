// ═══════════════════════════════════════════════════════════════════════════════
// combat_card_fit_smoke — KEEPER Findingów 468 i 465 oraz decyzji CP22, CP23 (POLISH P2b, krok D4)
// Rejestr: `docs/design/POLISH_PLAN.md` §6 (465, 468) i §12 (P2b).
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: (468) panel walki przycinał tekst po LICZBIE ZNAKÓW przy stałej szerokości — etykieta „Liga Trzech Słońc (2)”
//   (21 znaków) dawała „Liga Trzech Słońc (…”, nazwy w logu po 12 znaków, linia logu po 88; dół karty z logiem potrafił
//   wejść pod pasek nawigacji (zrzut właściciela z bramki P2A: nazwa ucięta, log obcięty); (465) jedyny przycisk „Watch”
//   zawsze do pierwszego starcia z listy; (CP23) wiersz starcia nie podawał układu.
// KSZTAŁT: przycinanie po SZEROKOŚCI tekstu (bieżąca czcionka, `measureText`) z wielokropkiem i pełnym tekstem
//   w podpowiedzi; log — N ostatnich linii, N maleje (do 2), a potem statki w jednej linii, gdy karta nie mieści się
//   między górnym a dolnymi paskami albo przekracza 45 % wysokości ekranu (statki obu walk nad kartą — kadr „Obserwuj”
//   i auto-fokus, P2b D1); „Watch” przy KAŻDYM wierszu; nazwa układu (kanon `systemDisplayName`) w wierszu.
// ⚠ `CombatHUD` importuje się pod node ⇒ WYKONANIE prawdziwego `draw` na atrapie kanwy z metryką czcionki o stałej
//   szerokości znaku (Space Mono — 0,6 em); `UIManager` (przekazanie ruchu myszy) — pin źródłowy.
//
// PINY:
//   T1  etykieta „Liga Trzech Słońc (2)” narysowana w całości (KONTROLA: dawna reguła 20 znaków ją ucina)
//   T2  długie nazwy (imperium, statki, log): KAŻDY tekst karty mieści się w jej szerokości, kolumny lewa / prawa
//       nie nachodzą na siebie (KONTROLA: nazwy rzeczywiście dłuższe niż kolumna — przycięcie zaszło)
//   T3  przycięty tekst → strefa podpowiedzi z pełnym tekstem; najechanie → podpowiedź z pełnym tekstem; zjechanie — brak
//   T4  ciasny ekran (720 j. wysokości, Dok taktyczny 250 j.): dół karty nad dolnymi paskami, log ≥ 2 linii (ostatnie
//       zdarzenia), statki w jednej linii; KONTROLA: jedno starcie przy pełnej wysokości — 6 linii logu i 2 linie na statek
//   T5  „Watch” przy każdym wierszu: dwa starcia → dwa przyciski; klik drugiego → `camera:watchBattle` z id i układem
//       DRUGIEGO starcia; `_watchBtnBounds` = przycisk pierwszego (zgodność wstecz)
//   T6  nazwa układu starcia w wierszu (rejestr układów; układ domowy — nazwa gwiazdy); log z pełnymi nazwami statków
//   T7  źródło `UIManager`: ruch myszy przekazany karcie walki (podpowiedź)
//   T8  dwa starcia (2 na 2 + 1 na 1 — scena bramki T2) na ekranie 720 j.: karta ≤ 45 % wysokości, log ≥ 2 linie na
//       starcie, nic poza kartą; KONTROLA: bez limitu ta sama karta zajmuje > 55 % wysokości (pomiar sondy: 438 z 720 j.)
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import EventBus      from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { CombatHUD } from '../../ui/CombatHUD.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');

const PANEL_W = 560, PAD = 8;
// atrapa kanwy: metryka Space Mono (znak = 0,6 em), zapis każdego `fillText` z zasięgiem poziomym
function mkCtx() {
  const calls = [];
  const ctx = {
    font: '10px monospace', textAlign: 'left', textBaseline: 'alphabetic', fillStyle: '', strokeStyle: '', lineWidth: 1,
    measureText(s) { const px = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1]) || 10; return { width: [...String(s)].length * px * 0.6 }; },
    fillText(s, x, y) {
      const w = this.measureText(s).width; const a = this.textAlign;
      const x0 = a === 'right' ? x - w : a === 'center' ? x - w / 2 : x;
      calls.push({ s: String(s), x0, x1: x0 + w, y, a });
    },
    fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, save() {}, restore() {},
  };
  return { ctx, calls };
}
// starcie: strony, statki (nazwy), log
function mkEnc({ id = 'encounter_t', sys = 'sys_059', point = { x: 137.66, y: -60.03 }, labelA, labelB, namesA, namesB, round = 7 }) {
  const states = new Map(); const vessels = new Map();
  const ids = (names, side) => names.map((n, i) => {
    const vid = `${id}_${side}${i}`;   // id statku unikalne między starciami
    states.set(vid, { hp: 60 + i, hpStart: 120, weapons: [{ moduleId: side === 'a' ? 'weapon_laser' : 'weapon_missile' }, { moduleId: 'weapon_missile' }] });
    vessels.set(vid, { id: vid, name: n, hullId: 'hull_frigate' });
    return vid;
  });
  const aIds = ids(namesA, 'a'); const bIds = ids(namesB, 'b');
  const timeline = [];
  for (let r = 1; r <= round; r++) timeline.push({ round: r, events: [
    { attacker: bIds[0], target: aIds[0], weapon: 'weapon_missile', hit: true, damage: 35, blockedByShield: 12 },
    { attacker: aIds[0], target: bIds[0], weapon: 'weapon_laser', hit: false, damage: 0, blockedByShield: 0 }] });
  return { enc: { id, isActive: true, currentRound: round, timeline, location: { systemId: sys, planetId: null, point },
    sideA: { vesselIds: aIds, joinedVesselIds: [], ownerEmpireId: 'player', label: labelA },
    sideB: { vesselIds: bIds, joinedVesselIds: [], ownerEmpireId: 'emp_001', label: labelB },
    vesselStates: states }, vessels };
}
function setKosmos(encs, vessels, { dock = 0, systems = [] } = {}) {
  window.KOSMOS = { civMode: true, activeSystemId: 'sys_home',
    deepSpaceCombatSystem: { listActive: () => encs },
    vesselManager: { _vessels: vessels },
    starSystemManager: { getAllSystems: () => systems },
    tacticalDock: { getReservedHeight: () => dock } };
}
const inPanel = (c, r) => c.x0 >= r.x + PAD - 0.5 && c.x1 <= r.x + r.w - PAD + 0.5;

// ═══ T1 ═══════════════════════════════════════════════════════════════════════
header('T1  etykieta „Liga Trzech Słońc (2)” w całości');
{
  EventBus.clear(); EntityManager.clear?.();
  const { enc, vessels } = mkEnc({ labelA: 'Gracz (2)', labelB: 'Liga Trzech Słońc (2)', namesA: ['P2A F0', 'P2A F1'], namesB: ['P2A Guard0', 'P2A Guard1'] });
  setKosmos([enc], vessels);
  const hud = new CombatHUD(); const { ctx, calls } = mkCtx();
  hud.draw(ctx, 1280, 720);
  const old = (s, max) => (s.length <= max ? s : s.slice(0, max - 1) + '…');
  const full = calls.some((c) => c.s === 'Liga Trzech Słońc (2)');
  console.log(`     etykieta strony B: ${JSON.stringify(calls.find((c) => c.s.startsWith('Liga'))?.s ?? null)} · dawna reguła 20 znaków: ${JSON.stringify(old('Liga Trzech Słońc (2)', 20))}`);
  assert(old('Liga Trzech Słońc (2)', 20) === 'Liga Trzech Słońc (…', 'T1-0 KONTROLA: dawna reguła (20 znaków) daje „Liga Trzech Słońc (…” — jak na zrzucie właściciela');
  assert(full && !calls.some((c) => c.s === 'Liga Trzech Słońc (…'), 'T1 SEDNO: etykieta narysowana w całości');
}

// ═══ T2 ═══════════════════════════════════════════════════════════════════════
header('T2  długie nazwy — wszystko w szerokości karty, kolumny nie nachodzą');
let longHud = null, longCalls = null, longEnc = null;
{
  EventBus.clear();
  const longEmp = 'Zjednoczona Federacja Planet Wewnętrznego Pierścienia Gwiazd Północnych (3)';
  const { enc, vessels } = mkEnc({ labelA: 'Gracz (3)', labelB: longEmp,
    namesA: ['Niezwyciężony Strażnik Wschodnich Bram Systemu', 'P2A F1', 'P2A F2'],
    namesB: ['Wielki Krążownik Ostatecznego Sprawiedliwego Gniewu Pierścienia', 'Guard B', 'Guard C'] });
  setKosmos([enc], vessels);
  const hud = new CombatHUD(); const { ctx, calls } = mkCtx();
  hud.draw(ctx, 1280, 720);
  const r = hud.getPanelRect();
  const card = calls.filter((c) => c.y > r.y && c.y < r.y + r.h);
  const outside = card.filter((c) => !inPanel(c, r));
  // kolumny: na tej samej linii tekst do lewej (align left) kończy się przed tekstem do prawej (align right)
  const byY = new Map(); for (const c of card) { if (!byY.has(c.y)) byY.set(c.y, []); byY.get(c.y).push(c); }
  let overlap = 0;
  for (const [, row] of byY) {
    const L = row.filter((c) => c.a === 'left'), R = row.filter((c) => c.a === 'right');
    for (const l of L) for (const q of R) if (l.x1 > q.x0 - 2) overlap++;
  }
  const cut = (hud._hoverZones ?? []).length;
  console.log(`     tekstów karty ${card.length}; poza szerokością ${outside.length}${outside.length ? ' — ' + JSON.stringify(outside.slice(0, 2)) : ''}; nachodzących par ${overlap}; przyciętych ${cut}`);
  assert(cut >= 2, 'T2-0 KONTROLA: nazwy dłuższe niż kolumna — przycięcie zaszło (scena ćwiczy dopasowanie)');
  assert(card.length > 10 && outside.length === 0, 'T2a NIEZMIENNIK (prawdziwy także przed krokiem — dawne przycinanie po liczbie znaków też mieściło się w szerokości): każdy tekst karty mieści się w jej szerokości');
  assert(overlap === 0, 'T2b NIEZMIENNIK: kolumny lewa / prawa nie nachodzą na siebie');
  longHud = hud; longCalls = calls; longEnc = enc;
}

// ═══ T3 ═══════════════════════════════════════════════════════════════════════
header('T3  podpowiedź pełnego tekstu');
{
  const zones = longHud?._hoverZones ?? [];
  const z = zones.find((h) => /Zjednoczona Federacja/.test(h.full));
  assert(!!z && z.full.endsWith('(3)'), 'T3a przycięta etykieta — strefa podpowiedzi z PEŁNYM tekstem');
  const changed = z ? longHud.handleMouseMove(z.x + z.w / 2, z.y + z.h / 2) : false;
  const { ctx, calls } = mkCtx();
  longHud.draw(ctx, 1280, 720);
  const tip = calls.find((c) => c.s === z?.full);
  assert(changed === true && !!tip, 'T3b najechanie — podpowiedź z pełnym tekstem narysowana');
  const gone = longHud.handleMouseMove(5, 5);
  const m2 = mkCtx(); longHud.draw(m2.ctx, 1280, 720);
  assert(gone === true && !m2.calls.some((c) => c.s === z?.full), 'T3c zjechanie — podpowiedź znika');
}

// ═══ T4 ═══════════════════════════════════════════════════════════════════════
header('T4  ciasny ekran — karta nad dolnymi paskami, log skrócony do ostatnich zdarzeń');
{
  EventBus.clear();
  // dwa starcia 3 na 3 — przy pełnej wysokości karta ma 2 × (6 linii statków + 6 linii logu)
  const mkOne = (id) => mkEnc({ id, labelA: 'Gracz (3)', labelB: 'Liga Trzech Słońc (3)', namesA: ['P2A F0', 'P2A F1', 'P2A F2'], namesB: ['Guard0', 'Guard1', 'Guard2'], round: 9 });
  const mk = () => { const x = mkOne('encounter_a'), y = mkOne('encounter_b'); return { encs: [x.enc, y.enc], vessels: new Map([...x.vessels, ...y.vessels]) }; };
  const bottomLimit = (H, dock) => H - (36 + 6) - dock - 8;   // pasek nawigacji + listwa dziennika + Dok taktyczny + odstęp
  // pełna wysokość — JEDNO starcie (dwa przekraczają limit 45 % ekranu — T8)
  const a1 = mkOne('encounter_a'); setKosmos([a1.enc], a1.vessels, { dock: 0 });
  const hudA = new CombatHUD(); const mA = mkCtx(); hudA.draw(mA.ctx, 1280, 900);
  const logA = mA.calls.filter((c) => /^R\d+:/.test(c.s)).length;
  const wpnA = mA.calls.filter((c) => /^\s{2}\S/.test(c.s)).length;
  // ciasno: 720 j. wysokości, Dok taktyczny 250 j.
  const b = mk(); setKosmos(b.encs, b.vessels, { dock: 250 });
  const hudB = new CombatHUD(); const mB = mkCtx(); hudB.draw(mB.ctx, 1280, 720);
  const r = hudB.getPanelRect();
  const logB = mB.calls.filter((c) => /^R\d+:/.test(c.s));
  const wpnB = mB.calls.filter((c) => /^\s{2}\S/.test(c.s)).length;
  console.log(`     pełna wysokość: log ${logA} linii, linie broni ${wpnA}; ciasno: karta y ${r.y}–${r.y + r.h} (limit dołu ${bottomLimit(720, 250)}), log ${logB.length} linii (2 starcia), linie broni ${wpnB}, pierwsza „${logB[0]?.s ?? '—'}”`);
  assert(logA === 6 && wpnA >= 3, 'T4-0 KONTROLA: jedno starcie przy pełnej wysokości — 6 linii logu i osobne linie broni');
  assert(r.y + r.h <= bottomLimit(720, 250) + 0.5, 'T4a SEDNO: dół karty nad dolnymi paskami (log nie wchodzi pod pasek nawigacji)');
  assert(logB.length >= 4 && logB.length < 12 && /^R9:/.test(logB[0]?.s ?? ''), 'T4b log skrócony do ostatnich zdarzeń (≥ 2 linie na starcie, najnowsze u góry)');
  assert(wpnB === 0, 'T4c statki w jednej linii (nazwa · kadłub · broń) — bez osobnych linii broni');
}

// ═══ T5 ═══════════════════════════════════════════════════════════════════════
header('T5  „Watch” przy każdym wierszu');
{
  EventBus.clear();
  const e1 = mkEnc({ id: 'encounter_1', sys: 'sys_home', point: { x: 10, y: 20 }, labelA: 'Gracz — F0', labelB: 'Liga — G0', namesA: ['F0'], namesB: ['G0'] });
  const e2 = mkEnc({ id: 'encounter_2', sys: 'sys_059', point: { x: 137.66, y: -60.03 }, labelA: 'Gracz — F1', labelB: 'Liga — G1', namesA: ['F1'], namesB: ['G1'] });
  const vessels = new Map([...e1.vessels, ...e2.vessels]);
  setKosmos([e1.enc, e2.enc], vessels);
  const hud = new CombatHUD(); const { ctx } = mkCtx(); hud.draw(ctx, 1280, 900);
  const btns = hud._watchBtns ?? [];
  const got = []; EventBus.on('camera:watchBattle', (p) => got.push(p));
  const b2 = btns[1];
  const ate = b2 ? hud.handleClick(b2.x + b2.w / 2, b2.y + b2.h / 2) : false;
  console.log(`     przyciski ${btns.length}; klik drugiego → ${JSON.stringify(got[0] ?? null)}`);
  assert(btns.length === 2, 'T5a SEDNO: dwa starcia — dwa przyciski „Watch”');
  assert(ate === true && got.length === 1 && got[0]?.encounterId === 'encounter_2' && got[0]?.systemId === 'sys_059' && got[0]?.x === 137.66,
    'T5b klik drugiego — kamera na DRUGIE starcie (id, układ, punkt)');
  assert(hud._watchBtnBounds === btns[0] && hud._watchBtnBounds?.encounterId === 'encounter_1', 'T5c `_watchBtnBounds` = przycisk pierwszego wiersza (zgodność wstecz)');
}

// ═══ T6 ═══════════════════════════════════════════════════════════════════════
header('T6  nazwa układu w wierszu; log z pełnymi nazwami');
{
  EventBus.clear(); EntityManager.clear?.();
  EntityManager.add({ id: 'star_home', type: 'star', name: 'Mstow', systemId: 'sys_home', x: 0, y: 0, mass: 1 });
  const e1 = mkEnc({ id: 'encounter_1', sys: 'sys_home', labelA: 'Gracz — F0', labelB: 'Liga — G0', namesA: ['Niezwyciężony Strażnik'], namesB: ['G0'] });
  const e2 = mkEnc({ id: 'encounter_2', sys: 'sys_059', labelA: 'Gracz — F1', labelB: 'Liga — G1', namesA: ['F1'], namesB: ['G1'] });
  setKosmos([e1.enc, e2.enc], new Map([...e1.vessels, ...e2.vessels]), { systems: [{ systemId: 'sys_059', galaxyStar: { name: 'Propus' } }] });
  const hud = new CombatHUD(); const { ctx, calls } = mkCtx(); hud.draw(ctx, 1280, 900);
  const titles = calls.filter((c) => c.s.startsWith('◎'));
  console.log(`     tytuły wierszy: ${JSON.stringify(titles.map((c) => c.s))}`);
  assert(titles.some((c) => /Propus/.test(c.s)), 'T6a SEDNO: wiersz starcia w innym układzie — nazwa układu (rejestr)');
  assert(titles.some((c) => /Mstow/.test(c.s)), 'T6b układ domowy — nazwa gwiazdy (kanon `systemDisplayName`)');
  assert(calls.some((c) => /Niezwyciężony Strażnik/.test(c.s) && /^R\d+:/.test(c.s)), 'T6c log z pełną nazwą statku (dawniej ucinana po 12 znakach)');
}

// ═══ T7 ═══════════════════════════════════════════════════════════════════════
header('T7  źródło `UIManager`: podpowiedź karty walki');
{
  const ui = strip(readFileSync(new URL('../../scenes/UIManager.js', import.meta.url), 'utf8'));
  const i = ui.indexOf('  handleMouseMove(x, y) {'); const b = i < 0 ? '' : ui.slice(i, ui.indexOf('\n  }\n', i));
  assert(b.length > 0 && /this\.combatHud\?\.handleMouseMove\?\.\(x, y\)/.test(b) && b.indexOf('x /= UI_SCALE') < b.indexOf('combatHud'),
    'T7 ruch myszy (współrzędne logiczne) przekazany karcie walki');
}

// ═══ T8 ═══════════════════════════════════════════════════════════════════════
header('T8  dwa starcia na ekranie 720 j.: karta ≤ 45 % wysokości, statki nad nią');
{
  EventBus.clear();
  const x = mkEnc({ id: 'encounter_a', sys: 'sys_home', labelA: 'Gracz (2)', labelB: 'Liga Trzech Słońc (2)', namesA: ['P2B FA0', 'P2B FA1'], namesB: ['P2B GuardA0', 'P2B GuardA1'], round: 5 });
  const y = mkEnc({ id: 'encounter_b', sys: 'sys_home', labelA: 'Gracz — P2B FB0', labelB: 'Liga Trzech Słońc — P2B GuardB0', namesA: ['P2B FB0'], namesB: ['P2B GuardB0'], round: 3 });
  setKosmos([x.enc, y.enc], new Map([...x.vessels, ...y.vessels]), { dock: 0 });
  const hud = new CombatHUD(); const m = mkCtx(); hud.draw(m.ctx, 1280, 720);
  const r = hud.getPanelRect();
  const uncapped = typeof hud._fitLayout === 'function' ? hud._fitLayout([x.enc, y.enc], 0, 10000).totalH : null;
  const logN = m.calls.filter((c) => /^R\d+:/.test(c.s)).length;
  const outside = m.calls.filter((c) => c.y > r.y + r.h + 0.5 || c.y < r.y - 0.5 || !(c.x0 >= r.x - 0.5 && c.x1 <= r.x + r.w + 0.5));
  console.log(`     karta y ${r.y}–${r.y + r.h} (wysokość ${r.h} = ${(100 * r.h / 720).toFixed(1)} % z 720 j.); bez limitu ${uncapped} j. (${uncapped ? (100 * uncapped / 720).toFixed(1) : '—'} %); log ${logN} linii; poza kartą ${outside.length}`);
  assert(uncapped > 0.55 * 720, 'T8-0 KONTROLA: bez limitu karta z dwoma starciami zajmuje > 55 % wysokości ekranu');
  assert(r.h <= Math.floor(720 * 0.45) + 0.5, 'T8a SEDNO: karta najwyżej 45 % wysokości — nad nią zostaje pas dla statków (kadr „Obserwuj” / auto-fokus)');
  assert(logN >= 4 && outside.length === 0, 'T8b NIEZMIENNIK (prawdziwy także przed krokiem): log ≥ 2 linie na starcie, żaden tekst poza kartą');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
