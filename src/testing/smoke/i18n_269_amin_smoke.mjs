// Finding 269 (A-MIN) — keeper: baner pickera, powód anulowania rozkazu floty (278a) i trzy site'y
// statusów z 266 przechodzą przez t() — zero polskiego poza słownikiem na tych powierzchniach.
// Rejestr: docs/design/VESSEL_ORDERS_PLAN.md §269 (+ §278 połówka „a") · decyzja właściciela:
// wariant (i) KANON `vesselStatusLabelKey` (zero nowych kluczy dla statusów; brzmienie PL = kanon).
//
// PO CO TO ISTNIEJE: `check-i18n` do 2026-09-21 nie widział sinku `.textContent =`, więc trzy polskie
// literały banera pickera (`GameScene._createPickerHUD`) świeciły na zielono u gracza z angielskim UI
// (klasa 113). Powód anulowania rozkazu floty szedł do Dziennika SUROWYM slugiem (`replaced`/`manual`,
// klasa 271), a trzy łańcuchy statusów z 266 zostawiły literały („W hangarze"/„W locie"/„Bezczynny")
// obok słów kanonu. Ten keeper pinuje, że każda z tych powierzchni czyta SŁOWNIK — i że słownik mówi
// to samo, co dawne literały (PL bit w bit), a EN nie jest polską kopią.
//
//   T1  baner pickera — 5 kluczy w PL i EN; PL bit w bit jak dawne literały (nic nie zmieniło brzmienia);
//       EN bez diakrytyków, bez residuum `{n}`, różne od PL; pin ŹRÓDŁOWY (CRLF-safe, komentarze zdjęte):
//       `_createPickerHUD` bez literałów, kompozycja `waypointAdded` + `waypointNeedMore(2 − total)` /
//       `waypointEnterHint` przez słownik
//   T2  278a — `fleet.cancelReason.replaced/manual` w PL i EN; pełna linia Dziennika BEZ sluga w nawiasie;
//       fallback dla NIEZNANEGO powodu (pin źródłowy + kontrola: t() nieznanego klucza zwraca klucz,
//       więc gałąź fallbacku jest osiągalna)
//   T3  statusy (decyzja (i)) — `FleetManagerOverlay._drawEnemyDetails` WYKONANIEM na atrapie ctx: linia
//       „Stan:" bierze słowo z `vesselStatusLabelKey` dla 5 tokenów w PL i EN; piny ŹRÓDŁOWE: wiersz wroga
//       (FMO) i tooltip 3D (ThreeRenderer — nie importuje się pod node) bez literałów, oba wołają kanon;
//       kontrola: słowa kanonu ISTNIEJĄ i RÓŻNIĄ się od dawnych literałów (inaczej pin mierzyłby ciszę)
//   T4  bramka — `check-i18n` z PUSTYM baseline NIE wymienia `GameScene` (3 → 0), a WYMIENIA
//       `CargoLoadModal` jako `dom:` — kontrola nie-jałowości: sink DOM naprawdę mierzy (na HEAD sprzed
//       naprawy narzędzie nie ma sinku DOM ⇒ CargoLoadModal nieobecny ⇒ pin czerwony, nie zielony-jałowy)
//
// ⚠ Fail-first w REALNYM `git worktree` na `59cbc2c` (reguła Findingu 270: źródło czytane po
//   normalizacji `\r\n → \n`; keeper ma przechodzić w drzewie autora (CRLF) i w świeżym checkoucie (LF)).
//
// Uruchom: node src/testing/smoke/i18n_269_amin_smoke.mjs
// ══════════════════════════════════════════════════════════════════════════════════════════
import '../headless/env.js';           // MUSI być pierwszy (localStorage dla i18n)
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { t, setLocale, getLocale } from '../../i18n/i18n.js';
import { FleetManagerOverlay } from '../../ui/FleetManagerOverlay.js';

// Kanon — import owinięty: pin ma DEGRADOWAĆ, nie przerywać (lekcja legu D).
let Canon = null;
try { Canon = await import('../../utils/VesselStatus.js'); } catch { /* fail-first */ }

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..', '..');
const SRC  = join(ROOT, 'src');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };
const header = (s) => console.log('\n── ' + s + ' ──');
const J = (x) => JSON.stringify(x);
const PL_DIACRITIC = /[ĄĆĘŁŃÓŚŹŻąćęłńóśźż]/;

// Źródło po normalizacji (270) i BEZ komentarzy (pin czyta KOD — `source-pin-strip-comments`).
const src = (rel) => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const locale0 = getLocale();

// ═══ T1 — baner pickera ═══════════════════════════════════════════════════════════════════
header('T1  baner pickera — 5 kluczy, PL bit w bit jak dawne literały, EN naturalne, źródło przez t()');
{
  // Dawne literały (HEAD 59cbc2c, `GameScene._createPickerHUD`) — brzmienie PL ma zostać CO DO ZNAKU.
  const OLD = {
    patrol: 'Klikaj waypointy patrolu (min 2). ESC anuluj, ENTER zakończ.',
    point:  'Klik aby ustawić punkt. ESC anuluj.',
    added:  (total) => `Waypoint ${total} dodany${total < 2 ? ` (min ${2 - total} więcej)` : ' — ENTER zakończ lub klikaj dalej.'}`,
  };
  const KEYS = ['picker.patrol.instructions', 'picker.point.instructions', 'picker.waypointAdded',
                'picker.waypointNeedMore', 'picker.waypointEnterHint'];
  // Ta sama kompozycja, którą robi handler (pin źródłowy niżej pilnuje, że handler robi DOKŁADNIE to).
  const compose = (total) => t('picker.waypointAdded', total,
    total < 2 ? t('picker.waypointNeedMore', 2 - total) : t('picker.waypointEnterHint'));

  setLocale('pl');
  for (const k of KEYS) ok(t(k) !== k, `pl: klucz ${k} ISTNIEJE`);
  ok(t('picker.patrol.instructions') === OLD.patrol, `pl: instrukcja patrolu bit w bit jak dawny literał (${J(t('picker.patrol.instructions'))})`);
  ok(t('picker.point.instructions')  === OLD.point,  `pl: instrukcja punktu bit w bit jak dawny literał (${J(t('picker.point.instructions'))})`);
  ok(compose(1) === OLD.added(1), `pl: „1 waypoint" bit w bit jak dawny template (${J(compose(1))})`);
  ok(compose(2) === OLD.added(2), `pl: „2 waypointy" bit w bit jak dawny template (${J(compose(2))})`);
  const plTexts = KEYS.map(k => t(k));

  setLocale('en');
  for (const k of KEYS) ok(t(k) !== k, `en: klucz ${k} ISTNIEJE`);
  const enTexts = KEYS.map(k => t(k));
  ok(enTexts.every(s => !PL_DIACRITIC.test(s)), `en: żaden z 5 tekstów nie ma polskich diakrytyków`);
  ok(enTexts.every((s, i) => s !== plTexts[i]), `en: żaden z 5 tekstów NIE jest kopią PL (${J(enTexts.slice(0, 2))}…)`);
  const e1 = compose(1), e2 = compose(2);
  ok(!/\{\d\}/.test(e1) && !/\{\d\}/.test(e2) && /\b1\b/.test(e1) && /ENTER/.test(e2) && !PL_DIACRITIC.test(e1 + e2),
     `en: kompozycja bez residuum {n}, z liczbą i podpowiedzią ENTER (${J(e1)} / ${J(e2)})`);

  // Pin ŹRÓDŁOWY — handler HUD czyta słownik i komponuje tak samo jak `compose` wyżej.
  const gs = stripComments(src('scenes/GameScene.js'));
  const h = gs.search(/_createPickerHUD\(\)\s*\{/);
  const hud = h >= 0 ? gs.slice(h, gs.indexOf('ui:pickerModeEnded', h)) : '';
  ok(hud.length > 200, 'KONTROLA PINU: blok _createPickerHUD znaleziony w źródle');
  ok(/t\('picker\.patrol\.instructions'\)/.test(hud) && /t\('picker\.point\.instructions'\)/.test(hud),
     'źródło: instrukcje patrolu i punktu przez t() (klucze picker.patrol/point.instructions)');
  ok(/t\('picker\.waypointAdded',\s*total,\s*remainder\)/.test(hud),
     'źródło: `t(\'picker.waypointAdded\', total, remainder)`');
  ok(/total\s*<\s*2\s*\?\s*t\('picker\.waypointNeedMore',\s*2\s*-\s*total\)\s*:\s*t\('picker\.waypointEnterHint'\)/.test(hud),
     'źródło: sufiks = waypointNeedMore(2 − total) gdy < 2, inaczej waypointEnterHint (ta sama kompozycja, co pin wykonaniowy)');
  ok(!/Klikaj waypointy|Klik aby|dodany|więcej|zakończ/.test(hud),
     'źródło: ZERO dawnych literałów w bloku HUD (Klikaj/Klik aby/dodany/więcej/zakończ)');
}

// ═══ T2 — 278a: powód anulowania rozkazu floty ═════════════════════════════════════════════
header('T2  278a — fleet.cancelReason.replaced/manual w PL i EN, linia Dziennika bez sluga, fallback dla nieznanego');
{
  for (const loc of ['pl', 'en']) {
    setLocale(loc);
    for (const r of ['replaced', 'manual']) {
      const k = `fleet.cancelReason.${r}`;
      const line = t('log.el.fleetOrderCancel', 'Alfa', t(k) !== k ? t(k) : r);
      ok(t(k) !== k && t(k).length > 0, `${loc}: klucz ${k} ISTNIEJE (${J(t(k))})`);
      ok(!/\((replaced|manual)\)/.test(line) && line.includes('Alfa'),
         `${loc}: linia Dziennika bez surowego sluga w nawiasie (${J(line)})`);
    }
    if (loc === 'en') ok(!PL_DIACRITIC.test(t('fleet.cancelReason.replaced') + t('fleet.cancelReason.manual')),
                         'en: oba powody bez polskich diakrytyków');
  }
  // KONTROLA: nieznany powód nie ma klucza ⇒ t() zwraca KLUCZ ⇒ gałąź „slug SUROWO" w handlerze jest osiągalna.
  // ⚠ Klucz składany DYNAMICZNIE — `check-i18n` skanuje wywołania i18n z literałem klucza także w
  //   `src/testing/` I W KOMENTARZACH (memory `i18n-checker-reads-t-calls-in-tests`); literał
  //   `fleet.cancelReason.zonk` wpisany wprost w wywołanie zapaliłby bramkę jako „użyty-a-niezdefiniowany".
  const zonk = 'fleet.cancelReason.' + 'zonk';
  ok(t(zonk) === zonk, 'KONTROLA: nieznany powód nie ma klucza (fallback w handlerze ma sens)');

  // Pin ŹRÓDŁOWY — handler `fleet:orderCancelled` w UIManagerze: klucz z prefiksu + fallback na slug.
  const um = stripComments(src('scenes/UIManager.js'));
  const i = um.indexOf("EventBus.on('fleet:orderCancelled'");
  const body = i >= 0 ? um.slice(i, um.indexOf("EventBus.on('fleet:retreatTriggered'", i)) : '';
  ok(body.length > 50, 'KONTROLA PINU: handler fleet:orderCancelled znaleziony');
  ok(/`fleet\.cancelReason\.\$\{reason\}`/.test(body), 'źródło: klucz budowany z prefiksu `fleet.cancelReason.${reason}`');
  ok(/!==\s*rKey\s*\?\s*rTxt\s*:\s*\(reason\s*\?\?\s*'unknown'\)/.test(body),
     'źródło: fallback — brak klucza ⇒ surowy slug (`reason ?? \'unknown\'`), nigdy pusty nawias');
  ok(!/fleetOrderCancel',\s*fname,\s*reason\)/.test(body), 'źródło: surowy `reason` NIE idzie już wprost do t(log.el.fleetOrderCancel)');
}

// ═══ T3 — statusy: decyzja (i) KANON ═══════════════════════════════════════════════════════
header('T3  statusy (i) — _drawEnemyDetails WYKONANIEM: „Stan:" = słowo kanonu w PL i EN; wiersz wroga + tooltip 3D bez literałów');
{
  // Dawne literały tych trzech site'ów (HEAD 59cbc2c).
  const OLD_WORDS = ['W hangarze', 'W locie', 'Bezczynny', 'w hangarze', 'w locie'];
  const labelKey = Canon?.vesselStatusLabelKey ?? (() => null);

  // KONTROLA: słowa kanonu istnieją i RÓŻNIĄ się od dawnych literałów — inaczej „bez literału"
  // byłoby zielone także wtedy, gdy ktoś wpisałby stare słowo do słownika kanonu.
  setLocale('pl');
  ok(!!Canon && t(labelKey('docked')) === 'Dok' && t(labelKey('in_transit')) === 'W drodze',
     `KONTROLA: pl słowa kanonu = „Dok" / „W drodze" (decyzja (i); jest: ${Canon ? J([t(labelKey('docked')), t(labelKey('in_transit'))]) : 'brak kanonu'})`);
  setLocale('en');
  ok(!!Canon && t(labelKey('docked')) === 'Docked' && t(labelKey('in_transit')) === 'In transit',
     `KONTROLA: en słowa kanonu = „Docked" / „In transit"`);

  // Atrapa ctx z przechwytem fillText (wzór vessel_status_label_smoke).
  function capCtx() {
    const texts = [];
    return new Proxy({}, {
      get: (_, k) => {
        if (k === '__texts') return texts;
        if (k === 'fillText') return (s) => { texts.push(String(s)); };
        if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
        return typeof k === 'string' ? () => {} : undefined;
      },
      set: () => true,
    });
  }
  const mk = (id, position) => ({
    id, name: 'Rajder', shipId: 'hull_frigate', ownerEmpireId: 'emp_001', systemId: 'sys_home',
    mission: null, movementOrder: null, modules: [], cargo: {}, isWreck: false, position,
  });
  const SHAPES = {
    docked:     mk('e_dock', { state: 'docked',     dockedAt: 'p1', x: 100, y: 0 }),
    orbiting:   mk('e_orb',  { state: 'orbiting',   dockedAt: 'h2', x: 200, y: 0 }),
    in_transit: mk('e_mov',  { state: 'in_transit', dockedAt: null, x: 300, y: 0 }),
    in_space:   mk('e_drf',  { state: 'orbiting',   dockedAt: null, x: 400, y: 0 }),
    unknown:    mk('e_unk',  { state: 'exploring',  dockedAt: null, x: 500, y: 0 }),
  };
  // Wróg musi być ROZPOZNANY (contact+), inaczej panel jest anonimowy i linii „Stan:" nie ma.
  globalThis.window.KOSMOS = { intelSystem: { getVesselContact: () => ({ quality: 'contact' }) } };
  const stateLine = (vessel) => {
    const ctx = capCtx();
    try { FleetManagerOverlay.prototype._drawEnemyDetails.call({ _hitZones: [] }, ctx, 0, 0, 320, 400, vessel); }
    catch (e) { return `THROW ${e.message}`; }
    return ctx.__texts.find((s) => s.startsWith('Stan:')) ?? '(brak linii Stan:)';
  };
  for (const loc of ['pl', 'en']) {
    setLocale(loc);
    for (const [tok, v] of Object.entries(SHAPES)) {
      const line = stateLine(v);
      const want = Canon ? t(labelKey(tok)) : null;
      ok(!!want && line === `Stan: ${want}`,
         `${loc}/${tok}: „Stan:" = słowo kanonu ${J(want)} (jest: ${J(line)})`);
    }
    const dockedLine = stateLine(SHAPES.docked), moveLine = stateLine(SHAPES.in_transit);
    ok(!OLD_WORDS.some((w) => dockedLine.includes(w) || moveLine.includes(w)),
       `${loc}: linie docked/in_transit bez dawnych literałów (${J(dockedLine)} / ${J(moveLine)})`);
  }

  // Piny ŹRÓDŁOWE — wiersz wroga w liście Command (FMO) i tooltip 3D (ThreeRenderer).
  const fmo = stripComments(src('ui/FleetManagerOverlay.js'));
  const tr  = stripComments(src('renderer/ThreeRenderer.js'));
  ok(/import \{[^}]*vesselStatusLabelKey[^}]*\} from '\.\.\/utils\/VesselStatus\.js'/.test(fmo), 'FMO importuje vesselStatusLabelKey z kanonu');
  ok(/import \{[^}]*vesselStatusLabelKey[^}]*\} from '\.\.\/utils\/VesselStatus\.js'/.test(tr),  'ThreeRenderer importuje vesselStatusLabelKey z kanonu');
  ok((fmo.match(/vesselStatusLabelKey\(/g) ?? []).length >= 2, `FMO woła vesselStatusLabelKey ≥ 2× (wiersz wroga + detal; jest ${(fmo.match(/vesselStatusLabelKey\(/g) ?? []).length})`);
  ok((tr.match(/vesselStatusLabelKey\(/g) ?? []).length >= 1,  `ThreeRenderer woła vesselStatusLabelKey ≥ 1× (tooltip; jest ${(tr.match(/vesselStatusLabelKey\(/g) ?? []).length})`);
  ok(!/hangarze|[Ww] locie'|Bezczynny|'Na orbicie'/.test(fmo), 'FMO (kod bez komentarzy): ZERO literałów W hangarze / w locie / Bezczynny / Na orbicie');
  ok(!/hangarze|[Ww] locie'|Bezczynny|'Na orbicie'/.test(tr),  'ThreeRenderer (kod bez komentarzy): ZERO literałów W hangarze / Na orbicie / Bezczynny');
  // Wiersz wroga: glif per token + słowo kanonu — jedno wyrażenie, nie łańcuch ternary z literałami.
  ok(/ENEMY_STATE_GLYPH\[eTok\][^\n]*t\(vesselStatusLabelKey\(eTok\)\)/.test(fmo),
     'FMO wiersz wroga: `${ENEMY_STATE_GLYPH[eTok] ?? \'?\'} ${t(vesselStatusLabelKey(eTok))}`');
  const glyph = /ENEMY_STATE_GLYPH\s*=\s*Object\.freeze\(\{([^}]*)\}\)/.exec(fmo);
  ok(!!glyph && ['docked', 'orbiting', 'in_transit', 'in_space', 'unknown'].every((k) => new RegExp(`\\b${k}\\s*:`).test(glyph[1])),
     'FMO: ENEMY_STATE_GLYPH ma glif dla WSZYSTKICH pięciu tokenów kanonu');
}

// ═══ T4 — bramka check-i18n: sink DOM mierzy, GameScene spłacony ════════════════════════════
header('T4  check-i18n (pusty baseline) — GameScene NIEOBECNY (3 → 0), CargoLoadModal OBECNY jako dom: (kontrola nie-jałowości)');
{
  const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'check-i18n.mjs')], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, KOSMOS_I18N_BASELINE: '{}' },
  });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  ok(/\[BŁĄD\] NOWE napisy zaszyte w kodzie/.test(out), 'KONTROLA PINU: przy pustym baseline zapadka płonie (sekcja się wykonała)');
  ok(/src\/ui\/CargoLoadModal\.js: \d+ \(baseline 0, \+\d+\) — [^\n]*dom:\d+/.test(out),
     'KONTROLA nie-jałowości: CargoLoadModal wymieniony z rodzajem sinku `dom:` (sink DOM naprawdę mierzy)');
  ok(!/src\/scenes\/GameScene\.js: \d+ \(baseline/.test(out),
     'GameScene NIE jest wymieniony ponad baseline — trzy literały banera pickera spłacone (3 → 0)');
}

setLocale(locale0);
console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
