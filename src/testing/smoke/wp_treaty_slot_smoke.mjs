// DS-1 / C3 — keeper PANELU: „panel mówi prawdę o traktatach".
//
// PO CO: slot traktatu renderował graczowi SUROWY SLUG — `t('diplo.treatyItem', tr.id, …)`
// dawało dosłownie „• non_aggression (od 100)". Nazwy z katalogu (`namePL`/`nameEN`) istniały
// i nie miały ANI JEDNEGO czytelnika, a klucza `treaty.*` w słownikach w ogóle nie było
// (klasa 271/113). Po C1 doszedł drugi brak: pakt MA termin, a panel o nim milczał.
// Po C2 doszedł trzeci: ⚔ jest wyszarzony w rozejmie, ale nie mówił DLACZEGO ani JAK DŁUGO.
//
// ⚠ PIN JEST WYKONANIOWY — `DiplomacyOverlay` importuje się pod node, więc przepuszczamy
//   PRAWDZIWY `_drawRight` przez atrapę `ctx` i czytamy, co poszło do `fillText`. Pin
//   źródłowy powiedziałby tylko, że kod zawiera napis; tu mierzymy, co gracz WIDZI.
//
// ⚠ JEDNA FORMUŁA TERMINU, NIE DWIE. Panel i ticker odpowiadają na to samo pytanie („kiedy
//   ten traktat się kończy"), a D-DS-3 każe wyprowadzać brak pola w locie. Druga kopia tego
//   rachunku rozjechałaby to, co panel POKAZUJE, z tym, co ticker ROBI — dokładnie klasa
//   nieutwardzonego bliźniaka (`removeColony:667`). T2 pinuje wspólne źródło ŹRÓDŁOWO.
//
// ⚠ TERMIN MA WYŁĄCZNIE PAKT. Umowa handlowa i sojusz nie dostają sufiksu „do roku" —
//   inaczej panel obiecywałby koniec, którego silnik nie egzekwuje (T3).
//
// Uruchom: node src/testing/smoke/wp_treaty_slot_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (window/localStorage/THREE)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import { DiplomacySystem } from '../../systems/DiplomacySystem.js';
import { DiplomacyOverlay } from '../../ui/DiplomacyOverlay.js';
import { NAP_YEARS } from '../../data/OpinionModifierData.js';

// Stała PRZENOSZONA w C3 — namespace'owo, żeby fail-first miał kolory.
import * as OMD from '../../data/OpinionModifierData.js';
const CAP_IN_BALANCE = OMD.TRUCE_TENSION_CAP ?? null;

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// ── Narzędzia pinów źródłowych ─────────────────────────────────────────────
const SRC  = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const norm = (s) => s.replace(/\r\n/g, '\n');
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const readClean = (...p) => stripComments(norm(readFileSync(join(SRC, ...p), 'utf8')));
const readRaw   = (...p) => norm(readFileSync(join(SRC, ...p), 'utf8'));

// ── Świat syntetyczny + przechwyt rysowania ────────────────────────────────
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
    // Bez intelu panel nie wystawia ŻADNEGO przycisku (`canWar` zależy od `isContact`) —
    // pin o wyszarzeniu przeszedłby jałowo. Lekcja z fixture'u C2 (T5b/T5d).
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

const ctxStub = new Proxy({}, {
  get: (_t, k) => {
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
/** Prawdziwy `_drawRight` → { texts, zones }. */
function render(id) {
  const texts = [];
  const ov = new DiplomacyOverlay();
  ov._selectedId = id;
  ov._hitZones = [];
  const ctx = new Proxy(ctxStub, {
    get: (target, k) => {
      if (k === 'fillText' || k === 'strokeText') return (s) => texts.push(String(s));
      return Reflect.get(target, k);
    },
    set: () => true,
  });
  let threw = null;
  try { ov._drawRight(ctx, 0, 0, 640, 720); } catch (e) { threw = e?.message ?? 'throw'; }
  return { texts, zones: ov._hitZones.map(z => z.type), threw };
}
const slotOf = (texts) => texts.find(s => s.trim().startsWith('•')) ?? null;

// ════════════════════════════════════════════════════════════════════════════
console.log('T1 — NOWY pakt: nazwa przez t() + „od N, do roku N+10"');
{
  const dipl = world(300);
  addEmpire('emp_s1');
  dipl.signTreaty('emp_s1', { id: 'non_aggression' });

  const r = render('emp_s1');
  assert(r.threw === null, 'T1a (KONTROLA PINU): `_drawRight` przeszedł bez wyjątku' + (r.threw ? ' — ' + r.threw : ''));
  assert(r.texts.length > 0,
    'T1b (KONTROLA PINU): panel REALNIE narysował (' + r.texts.length + ' wywołań) — inaczej brak '
    + 'napisu myliłby się z brakiem rysowania');

  const slot = slotOf(r.texts);
  assert(!!slot && !/non_aggression/.test(slot),
    'T1c: slot NIE pokazuje surowego sluga — ' + JSON.stringify(slot));
  assert(!!slot && /Pakt o nieagresji/.test(slot),
    'T1d: slot pokazuje NAZWĘ traktatu przez `t()` — ' + JSON.stringify(slot));
  assert(!!slot && /300/.test(slot) && new RegExp(String(300 + NAP_YEARS)).test(slot),
    'T1e: slot niesie OBA lata — podpisu (300) i końca (' + (300 + NAP_YEARS) + ') — ' + JSON.stringify(slot));
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT2 — D-DS-3: stary rekord BEZ pola pokazuje termin z TEJ SAMEJ formuły co ticker');
{
  const dipl = world(400);
  addEmpire('emp_s2');
  dipl.relations.addTreaty('player', 'emp_s2', { id: 'non_aggression' });
  const rec = dipl.relations.getTreaties('player', 'emp_s2')[0] ?? {};
  // Od C1 `addTreaty` stempluje — stary kształt odtwarzamy USUWAJĄC pole (inaczej pin jałowy).
  delete rec.expiresYear;
  assert(rec.expiresYear === undefined && rec.signedYear === 400,
    'T2a (KONTROLA PINU): fixture NAPRAWDĘ niesie stary kształt (signedYear 400, brak terminu)');

  const slot = slotOf(render('emp_s2').texts);
  assert(!!slot && new RegExp(String(400 + NAP_YEARS)).test(slot),
    'T2b: slot POKAZUJE wyprowadzony termin ' + (400 + NAP_YEARS) + ' — ' + JSON.stringify(slot));

  // ⚠ JEDNA FORMUŁA: panel i ticker wołają tę samą funkcję, a nie dwie kopie rachunku.
  const modSrc  = readClean('systems', 'diplomacy', 'RelationsModel.js');
  const uiSrc   = readClean('ui', 'DiplomacyOverlay.js');
  assert(/export function treatyExpiryYear/.test(modSrc),
    'T2c: formuła terminu jest NAZWANĄ, eksportowaną funkcją (`treatyExpiryYear`)');
  assert(/treatyExpiryYear\s*\(/.test(uiSrc),
    'T2d: PANEL woła tę funkcję, a nie liczy własnej kopii');
  const tickBody = modSrc.slice(modSrc.indexOf('tickTreatyExpiry(year)'));
  assert(/treatyExpiryYear\s*\(/.test(tickBody.slice(0, 600)),
    'T2e: TICKER woła tę samą funkcję — jedno źródło „kiedy ten traktat się kończy"');
  // KONTROLA: formuła `signedYear + NAP_YEARS` występuje w warstwie DOKŁADNIE raz.
  const both = modSrc + '\n' + uiSrc;
  assert((both.match(/signedYear\s*\)?\s*\|\|\s*0\)\s*\+\s*NAP_YEARS/g) ?? []).length === 1,
    'T2f (KONTROLA PINU): rachunek `signedYear + NAP_YEARS` istnieje w warstwie DOKŁADNIE raz');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT3 — umowa handlowa: nazwa przez t(), BEZ sufiksu terminu');
{
  const dipl = world(500);
  addEmpire('emp_s3');
  dipl.signTreaty('emp_s3', { id: 'trade_agreement' });

  const slot = slotOf(render('emp_s3').texts);
  assert(!!slot && /Umowa handlowa/.test(slot) && !/trade_agreement/.test(slot),
    'T3a: nazwa umowy handlowej przez `t()`, bez sluga — ' + JSON.stringify(slot));
  assert(!!slot && !/do roku/.test(slot),
    'T3b: BRAK sufiksu terminu — panel nie obiecuje końca, którego silnik nie egzekwuje — '
    + JSON.stringify(slot));
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT4 — ⚔ w rozejmie: szary, z licznikiem CAŁKOWITYM; po rozejmie aktywny');
{
  const dipl = world(600);
  addEmpire('emp_s4'); addWar('emp_s4');
  dipl.declareWar('emp_s4', 'player_action');
  dipl.offerPeace('emp_s4', 'player_action');
  assert(dipl.getStatus('emp_s4') === 'truce', 'T4a (KONTROLA PINU): rozejm stoi');

  const r = render('emp_s4');
  // ⚠ PRZYCISK, NIE CHIP. Chip statusu też brzmi „ROZEJM — 10 lat” (`diplo.truceYearsLeft`),
  //   więc szukanie po samym słowie trafiało w NIEGO — pierwsza wersja tego pinu mierzyła
  //   chip i czerwieniła się z niewłaściwego powodu. Przycisk poznajemy po glifie ⚔.
  const warBtn = r.texts.find(s => s.includes('⚔')) ?? null;
  assert(r.texts.some(s => /\[ROZEJM — 10 lat\]/.test(s)),
    'T4a2 (KONTROLA PINU): chip statusu istnieje OSOBNO i to NIE on jest mierzony niżej');
  assert(!!warBtn && /ROZEJM/.test(warBtn),
    'T4b: przycisk mówi DLACZEGO nie można — ' + JSON.stringify(warBtn));
  assert(!!warBtn && /ROZEJM — 10 L\./.test(warBtn),
    'T4c: licznik jest CAŁKOWITY (nie surowy float) — ' + JSON.stringify(warBtn));
  assert(!r.zones.includes('declare_war'),
    'T4d: hit-zona zdjęta — kanon „widoczny+zablokowany" (' + r.zones.join(', ') + ')');

  // KONTROLA: po rozejmie etykieta wraca i zona jest.
  dipl.relations.setStatus('player', 'emp_s4', 'peace', {}, 'kontrola');
  const r2 = render('emp_s4');
  const warBtn2 = r2.texts.find(s => s.includes('⚔')) ?? null;
  assert(!!warBtn2 && /WYPOWIEDZ WOJN/.test(warBtn2) && !/ROZEJM/.test(warBtn2),
    'T4e (KONTROLA PINU): po rozejmie etykieta jak dawniej — ' + JSON.stringify(warBtn2));
  assert(r2.zones.includes('declare_war'),
    'T4f (KONTROLA PINU): i hit-zona wraca (' + r2.zones.join(', ') + ')');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT5 — para pokręteł rozejmu w JEDNYM pliku (przeniesienie CAP)');
{
  assert(CAP_IN_BALANCE === 30,
    'T5a: `TRUCE_TENSION_CAP` jest w pliku balansu i ma NIEZMIENIONĄ wartość 30 (jest: '
    + CAP_IN_BALANCE + ')');
  const diplSrc = readClean('systems', 'DiplomacySystem.js');
  assert(!/const\s+TRUCE_TENSION_CAP\s*=/.test(diplSrc),
    'T5b: `DiplomacySystem` NIE deklaruje już własnej kopii — cap i podłoga mają jeden dom');
  assert(/TRUCE_TENSION_CAP/.test(diplSrc),
    'T5c (KONTROLA PINU): `DiplomacySystem` NADAL go używa (import) — przeniesienie, nie usunięcie');

  const balRaw = readRaw('data', 'OpinionModifierData.js');
  const exports = (balRaw.match(/^export const [A-Z_]+/gm) ?? []).map(s => s.replace('export const ', ''));
  assert(exports.includes('TRUCE_TENSION_CAP') && exports.includes('TRUCE_TENSION_FLOOR'),
    'T5d: cap i podłoga stoją obok siebie w pliku balansu');
  // ⚠ 12 po C2 + PRZENIESIONA stała = 13. C3 nie WYMYŚLA nowego pokrętła, tylko przenosi.
  // ⚠ 14 od DS-2/C1: `NAP_RENEW_WINDOW_YEARS` (okno odnowienia paktu). Ten pin jest
  //   JEDYNYM właścicielem licznika eksportów tego pliku — do DS-1/C3 ta sama liczba była
  //   pinowana w TRZECH keeperach z trzech slice'ów i jedna przeniesiona stała paliła
  //   wszystkie naraz (reguła warsztatu z close-outu DS-1).
  assert(exports.length === 14,
    'T5e: plik balansu ma 14 eksportów (13 po DS-1 + `NAP_RENEW_WINDOW_YEARS`) — jest: '
    + exports.length);
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT6 — i18n: pięć nowych kluczy, parytet, mapowanie w JEDNYM miejscu');
{
  const KEYS = ['diplo.treatyUntil', 'diplo.btn.declareWarTruce',
                'treaty.nonAggression', 'treaty.tradeAgreement', 'treaty.alliance'];
  for (const f of ['pl.js', 'en.js']) {
    const dict = readRaw('i18n', f);
    const miss = KEYS.filter(k => !new RegExp("'" + k.replace(/\./g, '\\.') + "':").test(dict));
    assert(miss.length === 0, 'T6a[' + f + ']: wszystkie ' + KEYS.length
      + ' nowych kluczy w słowniku' + (miss.length ? ' — brakuje: ' + miss.join(', ') : ''));
  }
  const uiSrc = readClean('ui', 'DiplomacyOverlay.js');
  assert(/TREATY_NAME_KEY/.test(uiSrc),
    'T6b: mapowanie id → klucz nazwy siedzi w JEDNYM nazwanym miejscu (`TREATY_NAME_KEY`)');
  // KONTROLA: mapa pokrywa WSZYSTKIE traktaty katalogu — brakujący wpis oznaczałby slug w UI.
  const treatySrc = readRaw('data', 'TreatyData.js');
  const ids = [...treatySrc.matchAll(/^  ([a-z_]+):\s*\{/gm)].map(m => m[1]);
  assert(ids.length === 3 && ids.every(id => uiSrc.includes(id)),
    'T6c (KONTROLA PINU): mapa zna wszystkie ' + ids.length + ' traktaty katalogu ['
    + ids.join(', ') + ']');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('=== WYNIK: ' + pass + ' PASS / ' + fail + ' FAIL (z ' + (pass + fail) + ') ===');
process.exit(fail === 0 ? 0 : 1);
