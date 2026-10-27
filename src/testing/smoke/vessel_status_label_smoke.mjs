// ══════════════════════════════════════════════════════════════════════════════════════════
// vessel_status_label_smoke — Finding 266: „Docked" NIE jest domyślną etykietą stanu statku.
//
// KANON `utils/VesselStatus.resolveVesselStatus(vessel) → { token, bodyId }` (D-266c) zastępuje
// sześć miejsc, które nazywały stan nierozpoznany „Docked" (`?? 'docked'` ×3 w logice —
// FleetGroupPanelLogic / FleetPictureLogic / Outliner; `?? 'fleetGroup.statusDocked'` ×2 w widoku —
// FleetGroupPanel / FleetCommandPanel; `?? byState.docked` ×1 w kubełkowaniu Outlinera) oraz cztery
// łańcuchy zgadujące INNE słowo dla tego samego nieznanego (Command „In flight", K3 „Idle", tooltip
// 3D „Bezczynny", NavPeek — cisza). Dwa nowe słowa: 'unknown' (D-266a, fail-closed) i 'in_space'
// (D-266b — orbita BEZ ciała; dotąd panel pisał „Orbiting" niczego, a Command „Orbit: ???").
//
// ⚠ POMIAR, KTÓRY ZMIENIŁ WAGĘ FINDINGU (audyt 2026-09-15): silnik produkuje DOKŁADNIE trzy tokeny
//   `position.state` i każdy pisarz 'docked' ustawia `dockedAt` w tym samym statemencie — fallback
//   „Docked" był LATENTNY (osiągalny tylko z zapisu bez pola albo z przyszłego czwartego tokena).
//   Jedynym OSIĄGALNYM kłamstwem była orbita bez ciała (przylot międzygwiezdny na obrzeże
//   `VesselManager:2818`, engage `MOS:1264`, lot w pusty punkt `MOS:1637`, ReturnJump, DSCS/VCS).
//   Dlatego T0 pinuje zbiór tokenów ŹRÓDŁOWO: czwarty token w silniku ma zapalić keeper GŁOŚNO.
//
// T-tabela:
//   T0  enumeracja pisarzy `position.state` w `src/` (regex \s-tolerantny, BEZ kotwic \n — Finding
//       270): zbiór ≡ {docked, in_transit, orbiting}; anty-jałowość ≥3 pliki, ≥40 trafień.
//   T1  KAŻDY token z T0 (nie z tablicy w keeperze) daje WŁASNĄ etykietę — wiersz rejestru K3 (`buildRegistryRows`)
//       i linia stanu panelu statku T5 (`ShipPanelHudLogic.buildShipPanelModel(…).status`).
//   T2  stan undefined / token nieznany / brak `position` → etykieta NIE jest żadnym słowem stanu
//       realnego i JEST „Unknown" (klucz dedykowany `fleetGroup.statusUnknown`).
//   T3  kształt z gate'u legu D (`sys_020`, orbiting, dockedAt:null) → „In space" bez nazwy ciała
//       na obu panelach, w K3 i w `FMO._getLocationText` (koniec „Orbit: ???");
//       KONTROLA: ten sam statek z dockedAt:'h2' → „Orbiting h2". ARKUSZ UI U4-1 — przecelowanie: karta floty NavPeek
//       usunięta razem z kartami peek (UI_PLAN §4.5, decyzja 4) — dawne dwie asercje karty zastępuje świadek „tej
//       powierzchni nie ma” (moduł bez `getPeekData`), żeby żadna karta nie wróciła po cichu ze starym słowem.
//   T4  bliźniaki: FleetPictureLogic (aktywność + kolumna Stan K3), FleetRegistryLogic (fallback
//       „Idle"), Outliner — nierozpoznany stan NIE wygląda jak „Docked". ARKUSZ UI U3-2 — przecelowanie: prawy outliner
//       to drzewo statków (D-UI-6) bez kubełków stanu; stan pokazuje ZNACZNIK (kolor glifu roli, D-UI-9) i podpowiedź
//       wiersza — pin sprawdza oba (intencja Findingu 266 bez zmian).
//   T5  zgoda nagłówka z rosterem: `summarizeFleetGroup.dockedCount` == liczba wierszy „Docked"
//       na fixture mieszanym — NIEZALEŻNE od wybranego słowa fallbacku.
//   T6  kontrola „tylko etykieta": `countActionable` / `summarizeFleetGroup` na stanie undefined
//       i na dryfie dają DOKŁADNIE to, co przed naprawą (logika czyta SUROWY stan, nie etykietę).
//   T7  dowód sweepu: `map_vessel_panel_smoke` wykonuje się w procesie potomnym z 0 FAIL, a jego
//       źródło nie asertuje etykiety „Docked" dla fixture'u bez stanu.
//   ⚠ PRZECELOWANE 2026-10-27 (REFORMA ZAKŁADEK T4-3, `TABS_REFORM_PLAN.md` §5.10): rysunek dawnych paneli grupy i floty
//     (`FleetGroupPanel.draw` / `FleetCommandPanel.draw` — wiersze rostera „kadłub · stan”) i `buildRosterRows` usunięte;
//     panele grupy i floty T6 pokazują stan członka ZNACZNIKIEM (kolor glifu z kanonu — jak outliner, T4), nie słowem.
//     Słowo stanu na mapie niesie dziś linia stanu panelu statku T5 (`FleetManagerOverlay._statusText` — kanon), a wiersz
//     statku z kolumną „stan” — rejestr K3: T1 / T2 / T3 przecelowane na te dwie powierzchnie, T5 (zgoda nagłówka
//     z rosterem) — na wiersze K3.
//
// FAIL-FIRST (finalne piny, REALNY `git worktree` na 9127f14 + ten plik; NIE `git archive`):
//   patrz sekcja „Wynik fail-first" w `docs/design/VESSEL_ORDERS_PLAN.md` §266 — oczekiwane
//   czerwone: T2, T3, T4, T5 (+ kontrole zależne od kanonu, którego na HEAD nie ma).
//
// Uruchom: node src/testing/smoke/vessel_status_label_smoke.mjs
// ══════════════════════════════════════════════════════════════════════════════════════════
import '../headless/env.js';           // MUSI być pierwszy (inaczej `localStorage is not defined`)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import EntityManager from '../../core/EntityManager.js';
import { t, setLocale, getLocale } from '../../i18n/i18n.js';
import { summarizeFleetGroup, countActionable } from '../../ui/FleetGroupPanelLogic.js';
import { buildShipEntry } from '../../ui/FleetPictureLogic.js';
import { buildRegistryRows } from '../../ui/FleetRegistryLogic.js';
import { Outliner } from '../../ui/Outliner.js';
import { FleetManagerOverlay } from '../../ui/FleetManagerOverlay.js';
import * as NavPeek from '../../ui/NavPeekProviders.js';   // ARKUSZ UI U4-1 — przestrzeń nazw: karta floty usunięta
import { THEME } from '../../config/ThemeConfig.js';

// Kanon — na HEAD sprzed naprawy NIE ISTNIEJE. Import owinięty: pin ma DEGRADOWAĆ, nie przerywać
// (lekcja legu D: `TypeError` na T5 zabierał kolor wszystkim pinom niżej).
let Canon = null;
try { Canon = await import('../../utils/VesselStatus.js'); } catch { /* fail-first */ }
// Panel statku T5 — linia stanu (T4-3: następca słowa stanu z wierszy dawnych paneli grupy i floty).
let L5 = null;
try { L5 = await import('../../ui/ShipPanelHudLogic.js'); } catch { /* pin padnie */ }

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..', '..');
const SRC  = join(ROOT, 'src');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };
const header = (s) => console.log('\n── ' + s + ' ──');
const J = (x) => JSON.stringify(x);

const locale0 = getLocale();
setLocale('en');   // etykiety porównujemy przez t() — locale nie ma znaczenia, EN dla czytelności logu

// Słowa stanów REALNYCH (rodzina panelowa) — do pinów „NIE jest żadnym z nich".
const REAL_WORDS = () => [t('fleetGroup.statusDocked'), t('fleetGroup.statusOrbiting'), t('fleetGroup.statusTransit')];
const UNKNOWN_WORD  = () => t('fleetGroup.statusUnknown');
const INSPACE_WORD  = () => t('fleetGroup.statusInSpace');

// ── fixture'y ─────────────────────────────────────────────────────────────────────────────
const AU = 100;
function mkVessel(id, name, position, extra = {}) {
  return {
    id, name, shipId: 'hull_medium', systemId: 'sys_020', colonyId: 'p_mstow', homeColonyId: 'p_mstow',
    status: 'idle', mission: null, movementOrder: null,
    fuel: { current: 40, max: 60, consumption: 1 }, warpFuel: { current: 0, max: 0 },
    endurance: { current: 10, max: 10 }, cargo: {}, cargoUsed: 0, cargoCapacity: 50,
    colonistCapacity: 0, colonists: 0, troopCapacity: 0, modules: ['engine_ion', 'cargo_small'],
    missionLog: [], isWreck: false, serviceState: 'active', unpaidYears: 0, refuelAutomatically: true,
    position, ...extra,
  };
}
const SHAPES = {
  docked:     () => mkVessel('v_dock', 'Kotwica', { state: 'docked',     dockedAt: 'p_mstow', x: 1 * AU, y: 0 }),
  in_transit: () => mkVessel('v_move', 'Kurier',  { state: 'in_transit', dockedAt: null,      x: 2 * AU, y: 0 }),
  orbiting:   () => mkVessel('v_orb',  'Sokol',   { state: 'orbiting',   dockedAt: 'h2',      x: 3 * AU, y: 0 }),
  legD:       () => mkVessel('v_13',   'Zmija',   { state: 'orbiting',   dockedAt: null,      x: 30 * AU, y: 0 }),
  legDctl:    () => mkVessel('v_13c',  'ZmijaC',  { state: 'orbiting',   dockedAt: 'h2',      x: 3 * AU, y: 0 }),
  undef:      () => mkVessel('v_und',  'Widmo',   { dockedAt: null, x: 4 * AU, y: 0 }),
  unknownTok: () => mkVessel('v_unk',  'Obcy',    { state: 'exploring', dockedAt: null, x: 5 * AU, y: 0 }),
  noPos:      () => mkVessel('v_nop',  'Pustka',  undefined),
};

function world(vessels) {
  EntityManager.clear();
  EntityManager.add({ id: 'p_mstow', type: 'planet', name: 'Mstow', x: 1 * AU, y: 0, systemId: 'sys_020',
                      orbital: { a: 1, e: 0, T: 1, M: 0 }, deposits: [], explored: true, analyzed: true });
  EntityManager.add({ id: 'h2', type: 'planet', name: 'Halny', x: 3 * AU, y: 0, systemId: 'sys_020',
                      orbital: { a: 3, e: 0, T: 5, M: 0 }, deposits: [], explored: true, analyzed: true });
  const map = new Map(vessels.map((v) => [v.id, v]));
  const ids = vessels.map((v) => v.id);
  const colony = { planetId: 'p_mstow', name: 'Mstow', isOutpost: false,
                   buildingSystem: { hasSpaceport: () => true },
                   resourceSystem: { inventory: new Map(), getAmount: () => 10, canAfford: () => true, spend: () => true, receive: () => {} },
                   civSystem: { freePops: 5 } };
  window.KOSMOS = {
    civMode: true, timeSystem: { gameTime: 10 }, activeSystemId: 'sys_020', homePlanet: EntityManager.get('p_mstow'),
    entityManager: EntityManager,
    vesselManager: {
      _vessels: map, getVessel: (id) => map.get(id), getAllVessels: () => [...map.values()],
      isImmobilized: () => false, getVesselUpkeepCredits: () => 300, getVesselBaseUpkeepCredits: () => 300,
      _findEntity: (id) => EntityManager.get(id), getVesselSensorRangeAU: () => 1,
    },
    fleetSystem: {
      listFleets: () => [{ id: 'f_1', name: 'Alfa', memberIds: ids }],
      getFleet: (id) => (id === 'f_1' ? { id: 'f_1', name: 'Alfa', memberIds: ids, activeOrder: null, doctrine: null } : null),
    },
    colonyManager: {
      activePlanetId: 'p_mstow', getColony: (id) => (id === 'p_mstow' ? colony : null),
      getAllColonies: () => [colony], getPlayerColonies: () => [colony], isPlayerColony: () => true,
    },
    missionSystem: { getActive: () => [] },
    movementOrderSystem: { issueOrder: () => ({ ok: true }), cancelOrder: () => true },
    techSystem: { isResearched: () => true, getShipSpeedMultiplier: () => 1, getMultiplier: () => 1, getFuelEfficiency: () => 1 },
    stationSystem: { getStationsAt: () => [], getAllStations: () => [] },
    uiManager: { _dirty: false, getSelectedVesselId: () => ids[0] ?? null, getSelectedVesselIds: () => ids },
  };
  return { ids, map };
}

const low = (s) => String(s ?? '').toLocaleLowerCase(getLocale());
/** Słowo stanu z linii stanu panelu statku T5 („<stan> · baza: X”, małe litery) — część przed „ · ”. */
function t5Status(v) {
  world([v]);
  const fmo = new FleetManagerOverlay();
  fmo._selectedVesselId = v.id;
  const m = L5?.buildShipPanelModel?.(v, { K: window.KOSMOS, fmo, features: {} });
  return String(m?.status?.text ?? '').split(' · ')[0];
}
/** Wiersz statku w rejestrze K3 (`buildRegistryRows` z nazwą ciała). */
function k3Row(v) {
  world([v]);
  return buildRegistryRows([v], { bodyName: (id) => EntityManager.get(id)?.name ?? id })[0] ?? null;
}
/** Słowa stanu REALNEGO w linii stanu T5 (`_statusText`): dok — hangar / tankowanie / czeka na paliwo, orbita, lot. */
const T5_REAL_WORDS = () => ['fleet.statusTextHangar', 'fleet.statusTextRefueling', 'fleet.statusTextAwaitingFuel',
  'fleet.statusTextOrbiting', 'fleet.statusTextInFlight'].map((k) => low(t(k)));

// ═══ T0 — ENUMERACJA pisarzy `position.state` ze ŹRÓDŁA (CRLF-safe, \s-tolerantne) ═════════
header('T0  ŹRÓDŁO — zbiór tokenów position.state w silniku = {docked, in_transit, orbiting}');
const T0 = { tokens: new Map(), files: new Set(), hits: 0 };
{
  const skip = (rel) => rel.startsWith('src/testing/') || rel.startsWith('src/lib/');
  const walk = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out); else if (name.endsWith('.js')) out.push(p);
    }
    return out;
  };
  const reAssign  = /position\.state\s*=\s*'([a-z_]+)'/g;                    // `v.position.state = 'x'`
  const reLiteral = /position\s*:\s*\{[\s\S]{0,160}?\bstate\s*:\s*'([a-z_]+)'/g;   // fabryka / migracja
  for (const file of walk(SRC)) {
    const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/');
    if (skip(rel)) continue;
    const text = readFileSync(file, 'utf8');
    for (const re of [reAssign, reLiteral]) {
      for (const m of text.matchAll(re)) {
        T0.tokens.set(m[1], (T0.tokens.get(m[1]) ?? 0) + 1);
        T0.files.add(rel); T0.hits++;
      }
    }
  }
  const found = [...T0.tokens.keys()].sort();
  const expected = ['docked', 'in_transit', 'orbiting'];
  ok(T0.hits >= 40, `ANTY-JAŁOWOŚĆ: ≥40 trafień pisarzy (jest: ${T0.hits})`);
  ok(T0.files.size >= 3, `ANTY-JAŁOWOŚĆ: ≥3 pliki z pisarzami (jest: ${T0.files.size})`);
  ok(J(found) === J(expected),
     `zbiór tokenów silnika ≡ ${J(expected)} (jest: ${J(found)}) — CZWARTY TOKEN MUSI ZAPALIĆ TEN PIN`);
  for (const tok of expected) ok((T0.tokens.get(tok) ?? 0) >= 1, `token '${tok}' ma ≥1 pisarza (jest: ${T0.tokens.get(tok) ?? 0})`);
  // kontrola kanonu (zależna od naprawy — na HEAD czerwona, to oczekiwane)
  ok(!!Canon && J([...Canon.ENGINE_POSITION_STATES].sort()) === J(found),
     `KANON: ENGINE_POSITION_STATES ≡ zbiór z T0 (${Canon ? J([...Canon.ENGINE_POSITION_STATES].sort()) : 'brak kanonu'})`);
}
const ENGINE_TOKENS = [...T0.tokens.keys()].sort();

// ═══ T1 — KAŻDY realny token renderuje WŁASNĄ etykietę (zbiór z T0, nie z keepera) ═════════
header('T1  każdy token z T0 → własna etykieta: wiersz rejestru K3 i linia stanu panelu statku T5');
{
  // Oczekiwane etykiety per token: tabele mają DOKŁADNIE trzy wpisy — czwarty token z T0 nie
  // znajdzie wpisu i pin padnie głośno („brak oczekiwanej etykiety").
  const EXPECT_K3 = { docked: 'fleetPicture.state.docked', in_transit: 'fleetPicture.state.inTransit', orbiting: 'fleetPicture.state.orbiting' };
  const EXPECT_T5 = { docked: t('fleet.statusTextHangar'), in_transit: t('fleet.statusTextInFlight'), orbiting: t('fleet.statusTextOrbiting') };
  const seen = new Set();
  for (const tok of ENGINE_TOKENS) {
    const wantK = EXPECT_K3[tok], wantT = EXPECT_T5[tok];
    ok(typeof wantK === 'string' && typeof wantT === 'string' && wantT.length > 0 && !wantT.startsWith('fleet.'),
       `token '${tok}' ma oczekiwane, przetłumaczone etykiety (K3 ${J(wantK)}, T5 ${J(wantT)})`);
    const v = SHAPES[tok]?.();
    ok(!!v, `fixture istnieje dla tokena '${tok}'`);
    if (!v || !wantK || !wantT) continue;
    ok(!!Canon && Canon.resolveVesselStatus(v).token === tok, `KANON: resolveVesselStatus → '${tok}'`);
    const r = k3Row(v);
    ok(r?.stateKey === wantK, `rejestr K3: stateKey ${J(wantK)} (jest: ${r?.stateKey})`);
    const st = t5Status(v);
    ok(st === low(wantT), `panel statku T5: stan „${low(wantT)}” (jest: ${J(st)})`);
    seen.add(st);
  }
  ok(seen.size === ENGINE_TOKENS.length && seen.size >= 3, `ANTY-JAŁOWOŚĆ: ${seen.size} RÓŻNE etykiety T5 dla ${ENGINE_TOKENS.length} tokenów`);
  // dok/orbita niosą nazwę ciała (KANON: bodyId ≠ null tylko tam) — kolumna „ciało” rejestru K3
  const rd = k3Row(SHAPES.docked()), ro = k3Row(SHAPES.orbiting());
  ok(rd?.body === 'Mstow', `docked niesie nazwę ciała (K3: ${J(rd?.body)})`);
  ok(ro?.body === 'Halny', `orbiting niesie nazwę ciała (K3: ${J(ro?.body)})`);
}

// ═══ T2 — stan nierozpoznany NIE renderuje żadnego słowa stanu realnego; renderuje „Unknown" ═
header('T2  undefined / token nieznany / brak position → NIE „Docked", TAK „Unknown" (klucz dedykowany)');
{
  const trio = [SHAPES.undef(), SHAPES.unknownTok(), SHAPES.noPos()];
  const unknownWord = UNKNOWN_WORD();
  ok(unknownWord !== 'fleetGroup.statusUnknown' && unknownWord.length > 0,
     `klucz fleetGroup.statusUnknown ISTNIEJE w słowniku (${J(unknownWord)})`);
  // Panel statku T5 — linia stanu (`_statusText`, kanon) dla kształtów nierozpoznanych OSIĄGALNYCH: stan undefined (zapis bez
  // pola — `VesselManager.restore` daje `position: {}`) i token nieznany. Brak CAŁEGO `position` jest nieosiągalny z zapisu,
  // a model T5 (lustro `_drawRight` → `getAvailableActions`) wymaga obiektu `position` jak dawny panel T3 — ten kształt
  // pinują rejestr K3 (niżej) i `buildShipEntry` (T4).
  for (const v of trio.filter((x) => x.position)) {
    const st = t5Status(v);
    const bad = [...T5_REAL_WORDS(), ...REAL_WORDS().map(low)].filter((w) => st.includes(w));
    ok(st.length > 0 && bad.length === 0, `T5 ${v.id}: bez słowa stanu realnego (${J(st)})`);
    ok(st === low(unknownWord), `T5 ${v.id}: stan „${low(unknownWord)}” (jest: ${J(st)})`);
  }
  // undefined + dockedAt ustawiony → NADAL nieznany (dockedAt nie dowodzi doku — ustawiają go też orbiterzy)
  const half = mkVessel('v_half', 'Polowka', { dockedAt: 'p_mstow', x: 0, y: 0 });
  const hs = t5Status(half), hr = k3Row(half);
  ok(hs === low(unknownWord) && hr?.body === null && hr?.stateKey === 'fleetGroup.statusUnknown',
     `undefined+dockedAt → „Unknown" BEZ nazwy ciała (T5 ${J(hs)}, K3 ${hr?.stateKey} / ${hr?.body})`);
  // rejestr K3 — kolumna Stan
  for (const v of trio) {
    world([v]);
    const r = buildRegistryRows([v], { bodyName: (id) => EntityManager.get(id)?.name ?? id })[0];
    ok(r.stateKey === 'fleetGroup.statusUnknown' && r.body === null,
       `K3 ${v.id}: stateKey=unknown, body=null (jest: ${r.stateKey} / ${r.body})`);
  }
}

// ═══ T3 — kształt z legu D: orbiting + dockedAt:null → „In space", bez ciała; KONTROLA dockedAt:'h2' ═
header('T3  leg-D (sys_020, orbiting, dockedAt:null) → „In space"; kontrola dockedAt:h2 → „Orbiting” (T5) i „Halny” (K3)');
{
  const inSpace = INSPACE_WORD();
  ok(inSpace !== 'fleetGroup.statusInSpace' && inSpace.length > 0, `klucz fleetGroup.statusInSpace ISTNIEJE (${J(inSpace)})`);
  const D = SHAPES.legD(), Dc = SHAPES.legDctl();
  // Panel statku T5 — linia stanu: leg-D → „In space” (bez „Orbiting”); kontrola dockedAt:h2 → „Orbiting”.
  const l = t5Status(D), lc = t5Status(Dc);
  ok(l === low(inSpace) && !l.includes(low(t('fleet.statusTextOrbiting'))), `T5: leg-D → „${low(inSpace)}” bez „Orbiting” (${J(l)})`);
  ok(lc === low(t('fleet.statusTextOrbiting')) && lc !== low(inSpace), `T5 KONTROLA: dockedAt:h2 → „${low(t('fleet.statusTextOrbiting'))}” (${J(lc)})`);
  // Rejestr K3 — ciało tylko przy orbicie WOKÓŁ ciała (kontrola).
  const rc = k3Row(Dc);
  ok(rc?.stateKey === 'fleetPicture.state.orbiting' && rc?.body === 'Halny', `K3 KONTROLA: dockedAt:h2 → orbiting + „Halny” (${rc?.stateKey}/${rc?.body})`);
  // Command — `_getLocationText` (dawniej „Orbit: ???" przez `_resolveName(null)`)
  world([D, Dc]);
  const loc  = FleetManagerOverlay.prototype._getLocationText.call({}, D);
  const locC = FleetManagerOverlay.prototype._getLocationText.call({}, Dc);
  ok(!loc.includes('???') && loc === inSpace, `FMO._getLocationText(leg-D) = „${inSpace}", bez „???" (jest: ${J(loc)})`);
  ok(locC === t('fleet.locationOrbit', 'Halny'), `FMO._getLocationText KONTROLA = ${J(t('fleet.locationOrbit', 'Halny'))} (jest: ${J(locC)})`);
  // K3
  const rD = buildRegistryRows([D], { bodyName: (id) => EntityManager.get(id)?.name ?? id })[0];
  ok(rD.stateKey === 'fleetGroup.statusInSpace' && rD.body === null, `K3 leg-D: stateKey=inSpace, body=null (${rD.stateKey}/${rD.body})`);
  // NavPeek — karta floty usunięta w U4-1 (UI_PLAN §4.5, decyzja 4): powierzchni, która mogłaby wypisać stan, już nie ma;
  // z modułu zostały predykaty plakietek alertów kafli (`hasSlotAlert`).
  ok(!('getPeekData' in NavPeek) && typeof NavPeek.hasSlotAlert === 'function',
     'NavPeek (U4-1): karty floty nie ma — moduł bez `getPeekData`, zostały predykaty plakietek (`hasSlotAlert`)');
  // kanon wprost
  ok(!!Canon && J(Canon.resolveVesselStatus(D)) === J({ token: 'in_space', bodyId: null }),
     `KANON: resolveVesselStatus(leg-D) = {in_space,null} (${Canon ? J(Canon.resolveVesselStatus(D)) : 'brak kanonu'})`);
  ok(!!Canon && J(Canon.resolveVesselStatus(Dc)) === J({ token: 'orbiting', bodyId: 'h2' }),
     `KANON: resolveVesselStatus(kontrola) = {orbiting,h2}`);
}

// ═══ T4 — bliźniaki: FleetPictureLogic / FleetRegistryLogic / Outliner ══════════════════════
header('T4  bliźniaki — FleetPictureLogic (aktywność+Stan), FleetRegistryLogic (fallback), Outliner (kubełek)');
{
  for (const v of [SHAPES.undef(), SHAPES.unknownTok(), SHAPES.noPos()]) {
    world([v]);
    const e = buildShipEntry(v, {});
    ok(e.activityKey !== 'fleetPicture.state.docked' && e.activityKey === 'fleetGroup.statusUnknown',
       `buildShipEntry(${v.id}).activityKey = unknown, NIE docked (jest: ${e.activityKey})`);
    ok(e.state === 'unknown' && e.dockedAt === null, `buildShipEntry(${v.id}).state = 'unknown', dockedAt=null (jest: ${e.state}/${e.dockedAt})`);
    const r = buildRegistryRows([v], {})[0];
    ok(r.stateKey !== 'fleetPicture.state.docked' && r.stateKey !== 'fleetPicture.state.idle',
       `K3 ${v.id}: stateKey ani „Docked", ani „Idle" (jest: ${r.stateKey})`);
  }
  // KONTROLA: realny dok dalej daje aktywność „Docked" (pin nie przeszedł przez wyłączenie gałęzi)
  {
    const d = SHAPES.docked(); world([d]);
    const e = buildShipEntry(d, {});
    ok(e.activityKey === 'fleetPicture.state.docked' && e.dockedAt === 'p_mstow', `KONTROLA: docked → activity docked + dockedAt (${e.activityKey}/${e.dockedAt})`);
  }
  // Outliner (prawy — drzewo statków, ARKUSZ UI U3-2) na atrapie ctx z kolorem każdego napisu: znacznik statku
  // o stanie nierozpoznanym NIE jest znacznikiem „zadokowany” (D-UI-9: zadokowany = `success`, reszta stanów stojących
  // = bezczynny `textDim`), a jego podpowiedź mówi „Unknown”, nie „Docked”; realnie zadokowany — tak (kontrola nośna).
  {
    const dock = SHAPES.docked(), und = SHAPES.undef();
    world([dock, und]);
    const out = new Outliner();
    const drawn = [];   // [napis, fillStyle]
    const ctx = new Proxy({}, {
      get: (tgt, k) => {
        if (k === 'fillText') return (s) => { drawn.push([String(s), tgt.fillStyle]); };
        if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
        if (k in tgt) return tgt[k];
        return typeof k === 'string' ? () => {} : undefined;
      },
      set: (tgt, k, v) => { tgt[k] = v; return true; },
    });
    let err = null;
    try { out.draw(ctx, 1920, 1080, {}); }
    catch (e) { err = e; }
    ok(err === null, `Outliner.draw() nie rzuca (${err ? err.message : 'ok'})`);
    // glif roli rysowany tuż przed nazwą — jego kolor to znacznik
    const glyphColor = (name) => { const i = drawn.findIndex(([s]) => s.includes(name)); return i > 0 ? drawn[i - 1][1] : null; };
    ok(drawn.some(([s]) => s.includes('Kotwica')) && drawn.some(([s]) => s.includes('Widmo')), `ANTY-JAŁOWOŚĆ: oba wiersze narysowane (${J(drawn.map(([s]) => s))})`);
    ok(glyphColor('Kotwica') === THEME.success, `ANTY-JAŁOWOŚĆ: zadokowany „Kotwica" — znacznik „zadokowany" (${glyphColor('Kotwica')})`);
    ok(glyphColor('Widmo') !== THEME.success && glyphColor('Widmo') === THEME.textDim,
       `stan nierozpoznany „Widmo" — znacznik bezczynny, NIE „zadokowany" (${glyphColor('Widmo')})`);
    const tip = (id) => {
      const z = (out._clickTargets ?? []).find((c) => c.type === 'vessel' && c.vesselId === id);
      if (!z) return [];
      out.updateHover(z.x + 40, z.y + z.h / 2, 1920, 1080);
      return (out._tip?.lines ?? []).map((l) => l.text ?? '');
    };
    const tDock = tip(dock.id), tUnd = tip(und.id);
    ok(tDock.includes(t('fleetPicture.state.docked')), `ANTY-JAŁOWOŚĆ: podpowiedź „Kotwica" — „${t('fleetPicture.state.docked')}" (${J(tDock)})`);
    ok(tUnd.includes(UNKNOWN_WORD()) && !tUnd.includes(t('fleetPicture.state.docked')) && !tUnd.includes(t('fleetGroup.statusDocked')),
       `podpowiedź „Widmo" — „${UNKNOWN_WORD()}", bez słowa dokowania (${J(tUnd)})`);
  }
}

// ═══ T5 — zgoda nagłówka z rosterem (niezależna od wybranego słowa fallbacku) ═══════════════
header('T5  summarizeFleetGroup.dockedCount == liczba wierszy „Docked” rejestru K3 na fixture mieszanym');
{
  const mix = [SHAPES.docked(), SHAPES.orbiting(), SHAPES.undef()];
  world(mix);
  const { dockedCount } = summarizeFleetGroup(mix, { vesselManager: window.KOSMOS?.vesselManager });
  const rows = buildRegistryRows(mix, { bodyName: (id) => EntityManager.get(id)?.name ?? id });
  const shownDocked = rows.filter((r) => r.stateKey === 'fleetPicture.state.docked').length;
  ok(rows.length === 3, `ANTY-JAŁOWOŚĆ: 3 wiersze rejestru (jest: ${rows.length})`);
  ok(dockedCount === 1, `KONTROLA: nagłówek liczy 1 zadokowany (jest: ${dockedCount})`);
  ok(shownDocked === dockedCount, `rejestr K3 pokazuje tyle „Docked”, ile liczy nagłówek: ${shownDocked} == ${dockedCount}`);
}

// ═══ T6 — kontrola „tylko etykieta": logika czyta SUROWY stan i NIE zmieniła wyniku ══════════
header('T6  countActionable / summarizeFleetGroup na undefined i dryfie — identyczne jak przed naprawą');
{
  const und = SHAPES.undef(), D = SHAPES.legD();
  // ⚠ PRZECELOWANIE ŚWIADOME (REFORMA ZAKŁADEK T6, strojenie 1 — Finding 562, podpis właściciela 2026-10-27): „Odwrót” liczy
  //   statki w AKTYWNYM STARCIU (predykat bramki MOS `not_in_combat`), nie „w przestrzeni i nie unieruchomione”. Fixture stoi
  //   w starciu (`combatCheck`), więc porównanie z HEAD dalej mierzy WYŁĄCZNIE odczyt surowego stanu (sens tego pinu);
  //   literał oczekiwany bez zmian. Regułę 562 pinuje `fleet_panel_hud_smoke` F17.
  const deps = { vesselManager: { isImmobilized: () => false, getVesselUpkeepCredits: () => 0 }, combatCheck: () => true };
  ok(J(countActionable([und], deps)) === J({ canRefuel: 0, canStop: 0, canRetreat: 1, canUndock: 0, canDock: 1 }),
     `countActionable(undefined) bit w bit jak na HEAD (${J(countActionable([und], deps))})`);
  const s1 = summarizeFleetGroup([und], deps);
  ok(s1.dockedCount === 0 && s1.transitCount === 0 && s1.orbitingCount === 0 && s1.count === 1,
     `summarizeFleetGroup(undefined): 0/0/0 z count=1 (jak na HEAD)`);
  const s2 = summarizeFleetGroup([D], deps);
  ok(s2.orbitingCount === 1 && s2.dockedCount === 0, `summarizeFleetGroup(dryf): orbitingCount=1 (SUROWY stan 'orbiting', nie etykieta)`);
  ok(J(countActionable([D], deps)) === J({ canRefuel: 0, canStop: 0, canRetreat: 1, canUndock: 0, canDock: 1 }),
     `countActionable(dryf) bit w bit jak na HEAD`);
  // pin ŹRÓDŁOWY: obie funkcje logiki NADAL czytają surowy position.state (\s-tolerantnie)
  const src = readFileSync(join(SRC, 'ui', 'FleetGroupPanelLogic.js'), 'utf8');
  const body = (name) => { const i = src.indexOf(`export function ${name}(`); const j = src.indexOf('\nexport function', i + 1); return src.slice(i, j < 0 ? undefined : j); };
  ok(/position\?\.state/.test(body('countActionable')) && /position\?\.state/.test(body('summarizeFleetGroup')),
     'ŹRÓDŁO: countActionable i summarizeFleetGroup czytają surowy `position?.state` (logika ≠ etykieta)');
  ok(!/resolveVesselStatus/.test(body('countActionable')), 'ŹRÓDŁO: countActionable NIE czyta kanonu (kontrola granicy)');
}

// ═══ T7 — dowód sweepu: map_vessel_panel_smoke w procesie potomnym ═════════════════════════
header('T7  map_vessel_panel_smoke — wykonuje się z 0 FAIL; jego źródło nie asertuje „Docked" dla fixture bez stanu');
{
  const file = join(__dirname, 'map_vessel_panel_smoke.mjs');
  const src = readFileSync(file, 'utf8');
  ok(!/statusDocked|fleetPicture\.state\.docked/.test(src), 'źródło map_vessel_panel_smoke bez asercji na etykietę „Docked"');
  const r = spawnSync(process.execPath, [file], { encoding: 'utf-8', timeout: 120000 });
  const m = /(\d+)\/(\d+) OK, (\d+) FAIL/.exec(r.stdout ?? '');
  ok(r.status === 0, `map_vessel_panel_smoke exit 0 (jest: ${r.status})`);
  ok(!!m && Number(m[3]) === 0 && Number(m[1]) >= 100, `map_vessel_panel_smoke: ${m ? `${m[1]}/${m[2]} OK, ${m[3]} FAIL` : 'brak podsumowania'} (≥100 pinów, 0 FAIL)`);
}

setLocale(locale0);
console.log(`\n════ vessel_status_label_smoke: ${pass} PASS / ${fail} FAIL ════`);
process.exit(fail ? 1 : 0);
