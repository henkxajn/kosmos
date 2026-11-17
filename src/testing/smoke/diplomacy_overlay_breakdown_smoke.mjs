// D1 C4 (WOJNA I POKÓJ 1.0) — render-smoke danych relacji w DiplomacyOverlay.
// Uruchom: node src/testing/smoke/diplomacy_overlay_breakdown_smoke.mjs
//
// Cel: wychwycić błędy RUNTIME UI (klucze t(), tokeny THEME, dostęp do danych) oraz
// zweryfikować BUDŻET PIONOWY — inspektor nie ma scrolla, więc treść nie może
// wypychać pasma akcji za panel. ctx to rejestrator: zbiera fillText/fillRect,
// pozostałe wywołania są no-op.
//
// ARC KONSOLE KZ: `draw()` rysuje WYŁĄCZNIE konsolę (dawna prawa kolumna usunięta). Ten sam
// świat, te same intencje — piny czytają to, co rysuje konsola: etykiety instrumentów i nagłówki
// stref WIELKIMI literami (eyebrow), liczby cyframi w kratce (osobne fillText na jednej linii
// bazowej — sklejane w `lines`), kolor liczby = rola palety konsoli (dodatnia primary, ujemna
// alert) zamiast koloru lerpowanego, pamięć — etykiety zdarzeń (Finding 724), a nie surowe klucze.
//
// Pokrywa: liczba opinii ze znakiem + rola koloru, pasmo statusu, rozbicie
// (limit 5 + „+N", ∞ dla trwałych, „(zanika za N l.)" dla zanikających), chip
// [ ROZEJM — N lat ], pamięć ograniczona do 3, brak reliktów (pasek zaufania,
// legenda progów), 6 czipów akcji przypiętych do dołu inspektora W GRANICACH panelu,
// parytet i18n wszystkich diplo.mod.* + kluczy UI, które konsola czyta.

import '../headless/env.js';   // MUST be first

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };

const EventBus  = (await import('../../core/EventBus.js')).default;
const gameState = (await import('../../core/GameState.js')).default;
const { DiplomacySystem }  = await import('../../systems/DiplomacySystem.js');
const { DiplomacyOverlay } = await import('../../ui/DiplomacyOverlay.js');
const { OPINION_MODIFIERS } = await import('../../data/OpinionModifierData.js');
const { setLocale } = await import('../../i18n/i18n.js');
const { THEME } = await import('../../config/ThemeConfig.js');
const { consoleRoles } = await import('../../ui/ConsoleRolesLogic.js');
const { CONSOLE_KIT } = await import('../../ui/ConsoleKit.js');
const roles = consoleRoles(THEME);
const plDict = (await import('../../i18n/pl.js')).default;
const enDict = (await import('../../i18n/en.js')).default;

// ── Rejestrujący ctx ────────────────────────────────────────────────────────
function makeCtx() {
  const texts = [];
  const rects = [];
  const noop = () => {};
  const ctx = {
    texts, rects,
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, textAlign: 'left', globalAlpha: 1,
    fillText: (s, tx, ty) => texts.push({ s: String(s), x: tx, y: ty, fill: ctx.fillStyle, font: ctx.font }),
    fillRect: (rx, ry, rw, rh) => rects.push({ x: rx, y: ry, w: rw, h: rh, fill: ctx.fillStyle }),
    strokeRect: noop, beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop, arc: noop,
    fill: noop, closePath: noop, clip: noop, rect: noop, save: noop, restore: noop,
    translate: noop, scale: noop, setLineDash: noop, createLinearGradient: () => ({ addColorStop: noop }),
    measureText: (s) => ({ width: String(s).length * 6 }),
  };
  return ctx;
}
// Konsola rysuje liczby cyframi w kratce: kolejne fillText na tej samej linii bazowej sklejamy w jedną linię.
const lines = (ctx) => {
  const out = [];
  for (const t of ctx.texts) {
    const last = out[out.length - 1];
    if (last && last.y === t.y) last.s += t.s; else out.push({ s: t.s, y: t.y, x: t.x, fill: t.fill });
  }
  return out;
};
const said = (ctx, frag) => ctx.texts.some(t => t.s.includes(frag)) || lines(ctx).some(l => l.s.includes(frag));

// ── Świat ───────────────────────────────────────────────────────────────────
const empires = new Map();
const galaxySystems = [{ id: 'sys_home', empireId: null }];
const addEmpire = (id, extra = {}) => {
  empires.set(id, { id, name: `Imperium ${id}`, namePL: id, archetype: 'trader',
    personality: { trade: 0.7, aggression: 0.3 }, homeSystemId: `sys_${id}`, fsm: { state: 'IDLE' }, ...extra });
  galaxySystems.push({ id: `sys_${id}`, empireId: id });
};
const timeSys = { gameTime: 500 };
window.KOSMOS = window.KOSMOS ?? {};
Object.assign(window.KOSMOS, {
  timeSystem: timeSys,
  empireRegistry: { get: (id) => empires.get(id) ?? null, listAll: () => [...empires.values()] },
  intelSystem: { isAtLeast: () => true, getLevel: () => 'detailed' },
  galaxyData: { systems: galaxySystems },
  vesselManager: { getAllVessels: () => [], getVessel: () => null },
  civilianTradeSystem: { isCrossEmpireTradeEnabled: () => true },
  gameState,
});

gameState.reset();
EventBus.clear?.();
addEmpire('emp_a');
const dipl = new DiplomacySystem();
window.KOSMOS.diplomacySystem = dipl;

// Stos modyfikatorów: 7 pozycji → limit 5 + wiersz „+2 więcej"; trwały (traktat) + zanikające.
//
// ⚠ KOLEJNOŚĆ JEST CZĘŚCIĄ FIXTURE'U, nie stylem: ramp jedzie PRZED dołożeniem
// modyfikatorów zanikających. Dawniej tick szedł na końcu, więc przy WŁĄCZONYM zanikaniu
// (domyślna po E6) ten sam tick kasował pięć krótkich wpisów i zwijał stos 7 → 2,
// wywracając trzy asercje LAYOUTU. To jest test layoutu — ma mierzyć limit wierszy
// i ogon „+N", a nie tempo zanikania. Odwrócenie kolejności powtarza zresztą inwariant
// produkcyjny z DiplomacySystem: „modyfikatory starzeją się PRZED handlerami, które je
// dodają — świeży wpis nie może zanikać w ticku, w którym powstał".
dipl.signTreaty('emp_a', { id: 'trade_agreement' });          // trwały trade_partner
dipl.relations.tickModifiers(12);                             // ramp → +12
dipl.addOpinionModifier('emp_a', 'player', 'legacy_relations', { value: +30, source: 'test' });
dipl.addOpinionModifier('emp_a', 'player', 'envoy_goodwill', { source: 'test' });
dipl.addOpinionModifier('emp_a', 'player', 'their_envoy', { source: 'test' });
dipl.addOpinionModifier('emp_a', 'player', 'military_presence', { source: 'test' });
dipl.addOpinionModifier('emp_a', 'player', 'research_intrusion', { source: 'test' });
dipl.addOpinionModifier('emp_a', 'player', 'trespassing', { source: 'test' });
dipl.changeTension('emp_a', +45, 'test');
for (let i = 0; i < 6; i++) dipl.addMemory('emp_a', 'territorial_violation', { i });

const overlay = new DiplomacyOverlay();
overlay.show();
overlay._selectedId = 'emp_a';

const W = 1280, H = 720;
let ctx = makeCtx();
let threw = null;
try { overlay.draw(ctx, W, H); } catch (e) { threw = e; }
ok('draw() nie rzuca przy 1280×720', threw === null || (console.error(threw), false));

// ── Opinia + pasmo ──────────────────────────────────────────────────────────
console.log('--- U1: liczba opinii i pasmo ---');
{
  const expected = dipl.getOpinionOfPlayer('emp_a');
  ok(`opinia narysowana ze znakiem (+${expected})`, lines(ctx).some(l => l.s === `+${Math.round(expected)}`));
  ok('etykieta „Opinia o nas" (instrument, wielkie litery)', said(ctx, plDict['diplo.opinionLabel'].toUpperCase()));
  ok('nagłówek rozbicia „Dlaczego" (eyebrow, wielkie litery)', said(ctx, plDict['diplo.opinionBreakdown'].toUpperCase()));
  ok('pasmo statusu = friendly (opinia wysoko dodatnia)', said(ctx, plDict['diplo.status.friendly']));
  // Kolor liczby = rola palety konsoli: dodatnia opinia → primary (świadek: ujemne wartości rozbicia → alert).
  const numLine = lines(ctx).find(l => l.s === `+${Math.round(expected)}`);
  const negLine = ctx.texts.find(t => t.s === '-');   // znak wartości rozbicia (kratka cyfr: osobny glif)
  ok(`liczba opinii w roli primary (${numLine?.fill}); ujemna wartość rozbicia w roli alert (${negLine?.fill})`,
    !!numLine && numLine.fill === roles.primary && !!negLine && negLine.fill === roles.alert && roles.primary !== roles.alert);
}

// ── Rozbicie ────────────────────────────────────────────────────────────────
console.log('--- U2: rozbicie modyfikatorów ---');
{
  const bd = dipl.getOpinionBreakdown('emp_a', 'player');
  ok(`stos ma 7 pozycji (${bd.length})`, bd.length === 7);
  const labels = bd.map(e => e.label);
  const shownCount = labels.filter(l => said(ctx, l)).length;
  ok(`narysowano DOKŁADNIE 5 etykiet z 7 (limit budżetu pionowego), było ${shownCount}`, shownCount === 5);
  ok('ogon zwinięty w wiersz „+ 2 więcej…"', said(ctx, '+ 2'));
  ok('trwały modyfikator oznaczony ∞', said(ctx, '∞'));
  const fadeFrag = plDict['diplo.fadesIn'].split('{0}')[0].trim();
  ok(`zanikające mają „${fadeFrag} N l."`, said(ctx, fadeFrag));
  ok('sortowanie malejąco po |wartości| — najmocniejszy modyfikator jest widoczny',
    said(ctx, bd[0].label));

  // D2/E6 kalibracja (§4 gate'u): etykieta zanikania musi być NA PRAWO od wartości.
  // ⚠ CZEGO TEN PIN NIE ROBI: nie wykrywa nachodzenia w pikselach. Oba teksty są
  // wyrównane do PRAWEJ, więc realne nakładanie zależy od SZEROKOŚCI napisu, a atrapa
  // ctx nie ma metryk czcionki (`measureText` zwraca length×6, gra rysuje 8 px).
  // Właśnie dlatego ciasnota kolumny jest do wyłapania OKIEM (i była — na gate'cie),
  // a nie tutaj. Ten pin łapie węższą, ale realną klasę regresji: zamianę albo zjechanie
  // kotwic kolumn (np. ktoś zeruje FADE_COL_W i etykieta ląduje na liczbie).
  const fadeFragTxt = ctx.texts.find(t => t.s.includes(fadeFrag));
  const valueTxt    = ctx.texts.find(t => /^[+-]?\d+$/.test(t.s) && t.y === fadeFragTxt?.y);
  ok('kotwica etykiety zanikania jest NA PRAWO od kotwicy wartości (kolejność kolumn)',
    !!fadeFragTxt && !!valueTxt && fadeFragTxt.x > valueTxt.x);
}

// ── Napięcie ────────────────────────────────────────────────────────────────
console.log('--- U3: pasek napięcia ---');
ok('etykieta „Napięcie (bliskość wojny)" (instrument, wielkie litery)', said(ctx, plDict['diplo.tensionFull'].toUpperCase()));
ok('wartość napięcia „45” z jednostką „/ 100” na jednej linii', lines(ctx).some(l => l.s === '45/ 100'));

// ── Relikty usunięte ────────────────────────────────────────────────────────
console.log('--- U4: relikty po starym modelu ---');
ok('BRAK paska zaufania (klucz diplo.trustLabel skasowany)', plDict['diplo.trustLabel'] === undefined && enDict['diplo.trustLabel'] === undefined);
ok('BRAK legendy progów (diplo.thresholdLegend skasowany)', plDict['diplo.thresholdLegend'] === undefined && enDict['diplo.thresholdLegend'] === undefined);
ok('BRAK diplo.hostility / hostilityFull', plDict['diplo.hostility'] === undefined && plDict['diplo.hostilityFull'] === undefined);
ok('BRAK diplo.state.alliance (status nigdy nie był „alliance")', plDict['diplo.state.alliance'] === undefined && enDict['diplo.state.alliance'] === undefined);
ok('BRAK diplo.recentIncidents (zastąpione diplo.memory)', plDict['diplo.recentIncidents'] === undefined);

// ── Pamięć ──────────────────────────────────────────────────────────────────
console.log('--- U5: pamięć relacji ---');
ok('nagłówek „Pamięć relacji" (eyebrow, wielkie litery)', said(ctx, plDict['diplo.memory'].toUpperCase()));
{
  // Finding 724 — wpis pamięci rysowany ETYKIETĄ zdarzenia, nigdy surowym kluczem
  const memLabel = plDict['diplo.memEvent.territorialViolation'];
  const memRows = ctx.texts.filter(t => t.s === memLabel);
  ok(`pokazane 3 najnowsze wpisy z 6 (${memRows.length}), etykietą „${memLabel}”, bez surowego klucza`,
    !!memLabel && memRows.length === 3 && !said(ctx, 'territorial_violation'));
}

// ── Chip rozejmu ────────────────────────────────────────────────────────────
console.log('--- U6: chip statusu z licznikiem rozejmu ---');
{
  addEmpire('emp_t');
  dipl.changeTension('emp_t', +50, 'test');
  dipl.declareWar('emp_t', 'player_action');
  dipl.offerPeace('emp_t', 'player_action');
  overlay._selectedId = 'emp_t';
  const c2 = makeCtx();
  overlay.draw(c2, W, H);
  const yearsLeft = dipl.getTruceYearsLeft('emp_t');
  ok(`chip pokazuje [ ROZEJM — ${yearsLeft} lat ]`, said(c2, `[ ROZEJM — ${yearsLeft.toFixed(0)} lat ]`));
  ok('rozbicie po pokoju zawiera „Świeża pamięć wojny"', said(c2, plDict['diplo.mod.recentWar']));
  ok('…i NIE zawiera już „Stan wojny"', !said(c2, plDict['diplo.mod.atWar']));
  overlay._selectedId = 'emp_a';
}

// ── BUDŻET PIONOWY — akcje w granicach panelu ───────────────────────────────
console.log('--- U7: budżet pionowy (akcje przypięte, klikalne) ---');
{
  for (const [ww, hh] of [[1280, 720], [1600, 900], [1280, 800]]) {
    const c3 = makeCtx();
    overlay.draw(c3, ww, hh);
    // 6 czipów akcji: włączone (typ akcji) + wyłączone (strefa podpowiedzi `action_blocked`)
    const zones = overlay._hitZones.filter(z => ['declare_war', 'offer_peace', 'send_envoy', 'propose_trade', 'toggle_auto_trade', 'propose_pact', 'renew_pact', 'propose_alliance', 'action_blocked'].includes(z.type));
    const bounds = overlay._getOverlayBounds(ww, hh);
    const inside = zones.every(z => z.y >= bounds.oy && (z.y + z.h) <= bounds.oy + bounds.oh);
    ok(`${ww}×${hh}: wszystkie 6 stref akcji (${zones.length}) W GRANICACH panelu`, zones.length === 6 && inside);
  }
  // Pasmo akcji przypięte do dołu INSPEKTORA (konsola): czipy jeden pod drugim, ⚔ pierwszy, ostatni kończy się
  // przy dolnej krawędzi strefy inspektora — długie rozbicie (7 pozycji) nie wypycha ich ani w dół, ani za ramę.
  const c4 = makeCtx();
  overlay.draw(c4, 1280, 720);
  const iz = overlay.consoleZones?.inspector;
  const chips = overlay._hitZones.filter(z => ['declare_war', 'offer_peace', 'send_envoy', 'propose_trade', 'toggle_auto_trade', 'propose_pact', 'renew_pact', 'propose_alliance', 'action_blocked'].includes(z.type));
  const bottom = Math.max(...chips.map(z => z.y + z.h));
  const stacked = chips.every((z, i) => i === 0 || z.y > chips[i - 1].y);
  const inInsp = !!iz && chips.every(z => z.x >= iz.x && z.x + z.w <= iz.x + iz.w + 0.5 && z.y >= iz.y);
  ok(`pasmo akcji przypięte do dołu inspektora (dół czipów ${bottom}, dół strefy ${iz ? iz.y + iz.h : '?'})`,
    chips.length === 6 && chips[0].type === 'declare_war' && stacked && inInsp
    && iz.y + iz.h - bottom >= 0 && iz.y + iz.h - bottom <= CONSOLE_KIT.CHIP_GAP);
}

// ── i18n: parytet + kompletność katalogu ────────────────────────────────────
console.log('--- U8: i18n ---');
{
  const modKeys = Object.values(OPINION_MODIFIERS).map(m => m.labelKey);
  ok(`wszystkie ${modKeys.length} labelKey katalogu istnieją w pl.js`, modKeys.every(k => plDict[k]));
  ok(`…i w en.js`, modKeys.every(k => enDict[k]));
  // KZ: krótka etykieta napięcia (wiersz listy dawnej strony) skasowana — konsola pisze stan · liczbę
  const newKeys = ['diplo.opinionLabel', 'diplo.opinionBreakdown', 'diplo.fadesIn', 'diplo.breakdownMore',
    'diplo.truceYearsLeft', 'diplo.tensionFull', 'diplo.memory'];
  ok('nowe klucze UI w pl.js', newKeys.every(k => plDict[k]));
  ok('nowe klucze UI w en.js', newKeys.every(k => enDict[k]));
  ok('placeholdery {0} zachowane w obu językach',
    plDict['diplo.fadesIn'].includes('{0}') && enDict['diplo.fadesIn'].includes('{0}')
    && plDict['diplo.truceYearsLeft'].includes('{0}') && enDict['diplo.truceYearsLeft'].includes('{0}'));
}

// ── Licznik ultimatum bez wklejonego literału (D2/E6) ───────────────────────
// Panel liczył „N lat do wojny" z literału `3`, czyli z DRUGIEJ, niepowiązanej kopii
// ULTIMATUM_GRACE_YEARS — przestrojenie łaski rozjeżdżało UI z silnikiem po cichu.
// Teraz liczbę podaje fasada (`getUltimatumYearsLeft`); ten blok pinuje, że panel
// rysuje DOKŁADNIE to, co zwraca silnik (i że gałąź ultimatum w ogóle się rysuje).
console.log('--- U8b: licznik ultimatum czytany z fasady ---');
{
  const YEAR = window.KOSMOS?.timeSystem?.gameTime ?? 0;
  dipl.relations.setUltimatumStart('player', 'emp_a', YEAR - 1, 'test');
  const left = dipl.getUltimatumYearsLeft('emp_a');
  ok(`getUltimatumYearsLeft zwraca resztę łaski (${left})`, left > 0 && left < 3.001);
  const cU = makeCtx();
  let eU = null;
  try { overlay.draw(cU, W, H); } catch (e) { eU = e; }
  ok('draw() nie rzuca przy aktywnym ultimatum', eU === null);
  ok(`panel pokazuje liczbę Z FASADY (${left.toFixed(1)}), nie z literału`,
    said(cU, left.toFixed(1)));
  dipl.relations.setUltimatumStart('player', 'emp_a', null, 'test_cleanup');
}

// ── Render w EN (ta sama ścieżka, inny słownik) ─────────────────────────────
console.log('--- U9: render EN ---');
{
  setLocale('en');
  const cEn = makeCtx();
  let e2 = null;
  try { overlay.draw(cEn, W, H); } catch (e) { e2 = e; }
  ok('draw() nie rzuca po przełączeniu na EN', e2 === null);
  ok('etykiety po angielsku', said(cEn, enDict['diplo.opinionLabel'].toUpperCase()) && said(cEn, enDict['diplo.opinionBreakdown'].toUpperCase())
    && !said(cEn, plDict['diplo.opinionLabel'].toUpperCase()));
  ok('etykiety modyfikatorów po angielsku', said(cEn, enDict['diplo.mod.legacyRelations']));
  setLocale('pl');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
