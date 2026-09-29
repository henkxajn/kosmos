// DS-1 / C2 — keeper ROZEJMU JAKO ZOBOWIĄZANIA (D-WP-7 = D-DS-1 (b), D-DS-2 (c)).
//
// PO CO: do DS-1 rozejm nie bramkował NICZEGO. Zmierzone w FAZIE A: status `'truce'` miał
// w całym `src/` dwóch czytelników — `AlienCivSystem:176` (FSM → NEGOTIATING) i chip
// `DiplomacyOverlay:303` — i ani jednej bramki. Wojnę po pokoju można było wypowiedzieć
// jednym kliknięciem, a panel na to pozwalał (`canWar = notWar && isContact`, `:501`).
// Bramkował wyłącznie WYMUSZONY NAP, i to tylko trzy drogi AI (`declareWar:331`
// przepuszcza `reason === 'player_action'`).
//
// ⚠ BRAMKA MUSI SIEDZIEĆ W SILNIKU, NIE W PANELU — i to nie jest ostrożność, tylko
//   ZASADA ZAPISANA W TYM PANELU (`DiplomacyOverlay:515-522`): „Szare zostaje WYŁĄCZNIE to,
//   co strukturalnie niemożliwe, nigdy «powiedzieliby nie»". Wyszarzenie przycisku nad
//   silnikiem, który klik PRZEPUSZCZA, łamałoby własną regułę panelu. Dlatego `declareWar`
//   odmawia NAPRAWDĘ, a `canWar` jest tylko LUSTREM tej odmowy — dokładnie jak `canPeace`
//   jest lustrem bramki pokoju.
//
// ⚠ ROZEJM BLOKUJE KAŻDY POWÓD, nie tylko `player_action`. Trzy drogi AI w rozejmie i tak
//   odbijały się o NAP (ten sam okres: `TRUCE_YEARS` = `NAP_YEARS` = 10), więc dla nich
//   „bez zmian" jest prawdą. Ale stan „NAP zerwany/wygasły, rozejm wciąż trwa" JEST
//   osiągalny (gracz łamie pakt przez `breakTreaty`, albo stary zapis ma NAP podpisany
//   wcześniej niż rozejm) — i to jest NOWY przypadek, pinowany osobno w T3.
//
// ⚠ ZERO NOWEGO `reason`. Gate, który chce wojny w rozejmie, prosi o coś, czego gra
//   zabrania — uczciwa droga to ZAKOŃCZYĆ ROZEJM (`relations.setStatus(pair, 'peace')`),
//   nie dorobić trzeciego magicznego stringa obok `player_action` i `player_war_panel`
//   (rejestr #294). Pin T4 trzyma tę ścieżkę żywą.
//
// Uruchom: node src/testing/smoke/wp_truce_gate_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (window/localStorage/THREE)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { DiplomacySystem } from '../../systems/DiplomacySystem.js';
import { DiplomacyOverlay } from '../../ui/DiplomacyOverlay.js';

// Stała rodzi się w C2 — namespace'owo (statyczny import nieistniejącego eksportu wywala
// CAŁY plik na linkowaniu ESM i żaden pin nie dostaje koloru przy fail-first).
import * as OMD from '../../data/OpinionModifierData.js';
const TRUCE_TENSION_FLOOR = OMD.TRUCE_TENSION_FLOOR ?? null;

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const near = (a, b, eps = 0.01) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= eps;

// ── Narzędzia pinów źródłowych ─────────────────────────────────────────────
// ⚠ CRLF (§270): źródło PO NORMALIZACJI. ⚠ Komentarze zdejmowane.
const SRC  = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const norm = (s) => s.replace(/\r\n/g, '\n');
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const readClean = (...p) => stripComments(norm(readFileSync(join(SRC, ...p), 'utf8')));
const readRaw   = (...p) => norm(readFileSync(join(SRC, ...p), 'utf8'));

// ── Świat syntetyczny (lustro `wp_nap_expiry`) ─────────────────────────────
const empires = new Map();
const wars = new Map();
function world(year) {
  EventBus.clear();
  gameState.restore(null);
  empires.clear(); wars.clear();
  window.KOSMOS = {
    timeSystem:     { gameTime: year },
    empireRegistry: { get: (id) => empires.get(id), listAll: () => [...empires.values()] },
    galaxyData:     { seed: 4242, systems: [] },
    warSystem:      { getWarWith: (id) => wars.get(id) ?? null, getCaptures: () => [] },
    // ⚠ BEZ TEJ ATRAPY PANEL NIE WYSTAWIA ŻADNEGO PRZYCISKU: `canWar` = `notWar && isContact`,
    //   a `isContact` liczy się z `intelSystem.getLevel`. Brak intelu ⇒ zero hit-zon ⇒ pin
    //   „w rozejmie nie ma `declare_war`” przeszedłby JAŁOWO. Złapały to kontrole T5b/T5d.
    intelSystem:    { getLevel: () => 'contact' },
  };
  const dipl = new DiplomacySystem();
  window.KOSMOS.diplomacySystem = dipl;
  return dipl;
}
const addEmpire = (id) => {
  empires.set(id, { id, name: id, archetype: 'militarist', personality: {}, traits: [] });
};
const addWar = (id) => {
  wars.set(id, { id: 'w_' + id, aggressor: 'player', defender: id, active: true,
                 casusBelli: 'border_incident', exhaustion: { player: 60, [id]: 60 }, captures: [] });
};
/** Wojna → wymuszony pokój → rozejm. Zwraca `true`, gdy rozejm naprawdę stoi. */
function intoTruce(dipl, id) {
  addEmpire(id); addWar(id);
  dipl.declareWar(id, 'player_action');
  dipl.offerPeace(id, 'player_action');
  return dipl.getStatus(id) === 'truce';
}
function tick() {
  EventBus.emit('time:tick', { deltaYears: 1, civDeltaYears: GAME_CONFIG.CIV_TIME_SCALE });
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T1 — przycisk gracza: rozejm ODMAWIA w silniku, z powodem');
{
  const dipl = world(200);
  assert(intoTruce(dipl, 'emp_t1'),
    'T1a (KONTROLA PINU): świat NAPRAWDĘ jest w rozejmie — inaczej cała sekcja mierzy pokój');

  const refusals = [];
  EventBus.on('diplomacy:warRefused', (p) => refusals.push(p));

  const ok = dipl.declareWar('emp_t1', 'player_action');
  assert(ok === false,
    'T1b: `declareWar(..., player_action)` w rozejmie zwraca FALSE (jest: ' + ok + ')');
  assert(dipl.getStatus('emp_t1') === 'truce',
    'T1c: stan pary NIETKNIĘTY — odmowa jest no-opem, nie połowiczną wojną (' + dipl.getStatus('emp_t1') + ')');
  assert(refusals.length === 1 && refusals[0]?.reason === 'truce_holds',
    'T1d: poszedł DOKŁADNIE jeden `diplomacy:warRefused` z powodem `truce_holds` — '
    + JSON.stringify(refusals));
  assert(Number.isFinite(refusals[0]?.yearsLeft) && refusals[0].yearsLeft > 0,
    'T1e: powód niesie LICZNIK lat rozejmu (' + refusals[0]?.yearsLeft + ') — bez niego gracz '
    + 'nie wie, jak długo czekać');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT2 — trzy drogi AI: BEZ ZMIAN w rozejmie (każda realnie próbowała)');
{
  const dipl = world(300);
  assert(intoTruce(dipl, 'emp_t2'), 'T2a (KONTROLA PINU): rozejm stoi');
  assert(dipl.hasTreaty('emp_t2', 'non_aggression') === true,
    'T2b (KONTROLA PINU): wymuszony NAP też stoi — w tym stanie drogi AI odbijają się o NIEGO');

  // ⚠ ŚWIADEK: każdy z trzech powodów NAPRAWDĘ przechodzi przez `declareWar`, a stringi
  //   nie są wymyślone — pin źródłowy niżej wiąże je z ich call-site'ami.
  const AI_REASONS = ['hostility_threshold', 'ultimatum_expired', 'enemy_attack_arrived'];
  const results = AI_REASONS.map(r => ({ r, ok: dipl.declareWar('emp_t2', r) }));
  assert(results.length === 3 && results.every(x => x.ok === false),
    'T2c: wszystkie trzy drogi AI odmówione w rozejmie — ' + JSON.stringify(results));
  assert(dipl.getStatus('emp_t2') === 'truce',
    'T2d: po trzech próbach para NADAL w rozejmie (' + dipl.getStatus('emp_t2') + ')');

  const diplSrc = readClean('systems', 'DiplomacySystem.js');
  const eahSrc  = readClean('systems', 'EnemyAttackHandler.js');
  assert(/declareWar\(\s*empireId\s*,\s*'hostility_threshold'\s*\)/.test(diplSrc),
    'T2e (ŚWIADEK): `hostility_threshold` to realny call-site w `DiplomacySystem`');
  assert(/declareWar\(\s*empireId\s*,\s*'ultimatum_expired'\s*\)/.test(diplSrc),
    'T2e (ŚWIADEK): `ultimatum_expired` to realny call-site w `DiplomacySystem`');
  assert(/declareWar\(\s*empireId\s*,\s*'enemy_attack_arrived'\s*\)/.test(eahSrc),
    'T2e (ŚWIADEK): `enemy_attack_arrived` to realny call-site w `EnemyAttackHandler`');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT3 — NOWY PRZYPADEK: NAP zerwany, rozejm trwa ⇒ drogi AI odbijają się o ROZEJM');
{
  const dipl = world(400);
  assert(intoTruce(dipl, 'emp_t3'), 'T3a (KONTROLA PINU): rozejm stoi');
  // Gracz łamie pakt (kosztuje +15 napięcia — D-DS-1 zostawia tę furtkę otwartą).
  assert(dipl.breakTreaty('emp_t3', 'non_aggression') === true,
    'T3b (KONTROLA PINU): NAP faktycznie zerwany');
  assert(dipl.hasTreaty('emp_t3', 'non_aggression') === false && dipl.getStatus('emp_t3') === 'truce',
    'T3c (KONTROLA PINU): stan docelowy osiągnięty — BEZ paktu, ale W ROZEJMIE');

  const r = ['hostility_threshold', 'ultimatum_expired', 'enemy_attack_arrived']
    .map(x => dipl.declareWar('emp_t3', x));
  assert(r.length === 3 && r.every(x => x === false),
    'T3d: bez paktu drogi AI odbijają się o ROZEJM — to jest cała zmiana D-WP-7 dla AI ('
    + JSON.stringify(r) + ')');
  assert(dipl.getStatus('emp_t3') === 'truce', 'T3e: para nadal w rozejmie');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT4 — ścieżka gate\'ów: zakończ rozejm, potem wojna (ZERO nowego reason)');
{
  const dipl = world(500);
  assert(intoTruce(dipl, 'emp_t4'), 'T4a (KONTROLA PINU): rozejm stoi');
  assert(dipl.declareWar('emp_t4', 'player_action') === false,
    'T4b (KONTROLA PINU): w rozejmie odmowa — inaczej T4d nie dowodziłby niczego');

  // JEDYNA sankcjonowana droga dla gate'u/konsoli — ta sama, którą opisuje protokół.
  dipl.relations.setStatus('player', 'emp_t4', 'peace', {}, 'gate');
  assert(dipl.getStatus('emp_t4') === 'peace', 'T4c (KONTROLA PINU): rozejm zakończony ręcznie');
  assert(dipl.declareWar('emp_t4', 'player_action') === true,
    'T4d: po zakończeniu rozejmu wojna przechodzi — gate nie potrzebuje nowego `reason`');

  const diplSrc = readClean('systems', 'DiplomacySystem.js');
  assert(!/reason\s*===\s*'(gate|debug|debug_override|test)'/.test(diplSrc),
    'T4e: `declareWar` NIE zna żadnego omijającego `reason` — trzeci magiczny string '
    + 'obok `player_action` i `player_war_panel` byłby długiem rodziny #294');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT5 — lustro w panelu: `canWar` gaśnie w rozejmie (WYKONANIOWO)');
{
  const dipl = world(600);
  assert(intoTruce(dipl, 'emp_t5'), 'T5a (KONTROLA PINU): rozejm stoi');

  const ctxStub = new Proxy({}, {
    get: (_t, k) => {
      if (k === 'fillText' || k === 'strokeText') return () => {};
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'createLinearGradient') return () => ({ addColorStop: () => {} });
      if (typeof k === 'string'
        && /^(save|restore|beginPath|closePath|fillRect|strokeRect|clearRect|moveTo|lineTo|arc|fill|stroke|rect|clip|translate|scale|setLineDash|roundRect|quadraticCurveTo|bezierCurveTo|ellipse)$/.test(k)) {
        return () => {};
      }
      return undefined;
    },
    set: () => true,
  });
  const zonesFor = (id) => {
    const ov = new DiplomacyOverlay();
    ov._selectedId = id;
    ov._hitZones = [];
    try { ov._drawRight(ctxStub, 0, 0, 640, 720); } catch { /* zgłosi T5b */ }
    return ov._hitZones.map(z => z.type);
  };

  const truceZones = zonesFor('emp_t5');
  assert(truceZones.length > 0,
    'T5b (KONTROLA PINU): panel REALNIE narysował hit-zony (' + truceZones.length + ') — '
    + 'inaczej brak `declare_war` myliłby się z brakiem rysowania');
  assert(!truceZones.includes('declare_war'),
    'T5c: w rozejmie NIE MA hit-zony `declare_war` — kanon „widoczny+zablokowany" (' + truceZones.join(', ') + ')');

  // KONTROLA: w POKOJU ta sama ścieżka zonę wystawia — inaczej T5c mierzyłby martwy panel.
  dipl.relations.setStatus('player', 'emp_t5', 'peace', {}, 'kontrola');
  const peaceZones = zonesFor('emp_t5');
  assert(peaceZones.includes('declare_war'),
    'T5d (KONTROLA PINU): w POKOJU hit-zona `declare_war` JEST (' + peaceZones.join(', ') + ')');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT6 — D-DS-2 (c): napięcie w rozejmie opada DO PODŁOGI, nie do zera');
{
  assert(TRUCE_TENSION_FLOOR === 15,
    'T6a: `TRUCE_TENSION_FLOOR` istnieje w pliku balansu i wynosi 15 (jest: ' + TRUCE_TENSION_FLOOR + ')');

  const dipl = world(700);
  assert(intoTruce(dipl, 'emp_t6'), 'T6b (KONTROLA PINU): rozejm stoi');
  // ⚠ ROZEJM PRZEDŁUŻONY CELOWO. T6 mierzy DECAY, nie czas trwania rozejmu (ten pinują T2/T3
  //   i `wp_nap_expiry`). Bez tego tykanie wychodzi poza `truceUntilYear`, `_tickTruces` wraca
  //   do `'peace'` i napięcie leci do ZERA — czyli pin mierzyłby pokój, udając, że mierzy rozejm.
  dipl.relations.setStatus('player', 'emp_t6', 'truce', { truceUntilYear: 9999 }, 'fixture');
  assert(near(dipl.getTension('emp_t6'), 30),
    'T6c (KONTROLA PINU): pokój capuje napięcie na 30 (jest: ' + dipl.getTension('emp_t6') + ')');

  // Okno ciszy PEACE_QUIET_YEARS liczy się od OSTATNIEGO wpisu pamięci (`peace_offered`).
  for (let y = 701; y <= 720; y++) { window.KOSMOS.timeSystem.gameTime = y; tick(); }
  assert(near(dipl.getTension('emp_t6'), TRUCE_TENSION_FLOOR),
    'T6d: napięcie zeszło DOKŁADNIE do podłogi ' + TRUCE_TENSION_FLOOR
    + ' (jest: ' + dipl.getTension('emp_t6') + ') — nie do zera i nie poniżej');

  for (let y = 721; y <= 740; y++) { window.KOSMOS.timeSystem.gameTime = y; tick(); }
  assert(near(dipl.getTension('emp_t6'), TRUCE_TENSION_FLOOR),
    'T6e: i STOI tam mimo dalszych tyknięć (jest: ' + dipl.getTension('emp_t6') + ')');

  // Incydent w rozejmie: podnosi, a decay sprowadza z powrotem DO PODŁOGI.
  dipl.changeTension('emp_t6', +10, 'incydent');
  assert(near(dipl.getTension('emp_t6'), 25),
    'T6f (KONTROLA PINU): incydent podniósł napięcie do 25 (jest: ' + dipl.getTension('emp_t6') + ')');
  for (let y = 741; y <= 760; y++) { window.KOSMOS.timeSystem.gameTime = y; tick(); }
  assert(near(dipl.getTension('emp_t6'), TRUCE_TENSION_FLOOR),
    'T6g: incydent wraca do ' + TRUCE_TENSION_FLOOR + ', NIE do zera (jest: '
    + dipl.getTension('emp_t6') + ')');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT7 — w POKOJU bez zmian: napięcie opada do zera (kontrola D-DS-2)');
{
  const dipl = world(800);
  addEmpire('emp_t7');
  dipl.changeTension('emp_t7', +30, 'test');
  assert(near(dipl.getTension('emp_t7'), 30) && dipl.getStatus('emp_t7') === 'peace',
    'T7a (KONTROLA PINU): para w POKOJU z napięciem 30');
  for (let y = 801; y <= 830; y++) { window.KOSMOS.timeSystem.gameTime = y; tick(); }
  assert(near(dipl.getTension('emp_t7'), 0),
    'T7b: w pokoju napięcie opada DO ZERA jak dotąd — podłoga dotyczy WYŁĄCZNIE rozejmu '
    + '(jest: ' + dipl.getTension('emp_t7') + ')');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT8 — dyscyplina: plik balansu, i18n, konsument powodu');
{
  const balRaw = readRaw('data', 'OpinionModifierData.js');
  const exports = (balRaw.match(/^export const [A-Z_]+/gm) ?? []).map(s => s.replace('export const ', ''));
  assert(exports.includes('TRUCE_TENSION_FLOOR'),
    'T8a: plik balansu eksportuje `TRUCE_TENSION_FLOOR`');
  // ⚠ LICZNIK EKSPORTÓW MA JEDNEGO WŁAŚCICIELA — `wp_treaty_slot_smoke` T5e. Ta sama liczba
  //   w trzech keeperach (tu, w `wp_nap_expiry` i tam) znaczyłaby trzy aktualizacje przy każdej
  //   stałej, czyli gotowy rozjazd; C3 pokazał to od razu, przenosząc `TRUCE_TENSION_CAP`.
  //   Tutaj zostaje to, co należy do C2: że podłoga stoi OBOK sufitu, a nie gdzie indziej.
  assert(exports.includes('TRUCE_TENSION_FLOOR'),
    'T8b: podłoga jest w pliku balansu [' + exports.join(', ') + ']');

  for (const f of ['pl.js', 'en.js']) {
    assert(/'diplo\.reject\.truceHolds':/.test(readRaw('i18n', f)),
      'T8c[' + f + ']: klucz powodu `diplo.reject.truceHolds` jest w słowniku');
  }
  const uiSrc = readClean('scenes', 'UIManager.js');
  assert(/diplomacy:warRefused/.test(uiSrc) && /truceHolds/.test(uiSrc),
    'T8d: `UIManager` subskrybuje `diplomacy:warRefused` i używa klucza — powód ma realnego '
    + 'konsumenta, a nie tylko wpis w słowniku');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('=== WYNIK: ' + pass + ' PASS / ' + fail + ' FAIL (z ' + (pass + fail) + ') ===');
process.exit(fail === 0 ? 0 : 1);
