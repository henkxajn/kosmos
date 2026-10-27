// ═══════════════════════════════════════════════════════════════════════════════
// KEEPER — REFORMA ZAKŁADEK T1: rozwinięcie informacyjne etykiet + etykieta na żądanie (`LabelHoverLogic`, gałąź `labelHover`
// w `HudLabelLayer`) — TABS_REFORM_PLAN.md §5.2; D-TR-1 (a), D-TR-2 (a), D-TR-3 (tabele I7). Protokół lekki (HUD_PLAN §4.0
// aneks): keepery WYŁĄCZNIE dla logiki — stan najechania, treść wg wywiadu i właściciela, wybór obiektu, przypięcie (I8.3),
// etykieta na żądanie, „+N”, dymki i karta ciała (piny na wywołaniach), budżet (spoczynek, pamięć treści); bez pinów na stałych
// rysunku. Uruchom: node src/testing/smoke/label_hover_smoke.mjs
//
//   K0  API (flaga kroku `labelHover` na stałe ON od T4 — predykaty i klucz usunięte; działa na warstwie etykiet `hudLabels`)
//   K1  stan najechania na CZASIE REALNYM: fade-in 150 ms, wygasanie 200 ms po zejściu kursora, powrót bez ponownego fade-in,
//       przejście na inny obiekt — od razu; warstwa: w pauzie (zegar symulacji stoi) rozwinięcie rośnie i znika
//   K2  treść wg wywiadu i właściciela: obca kolonia (contact — nazwa bez populacji; rumor — „obce imperium”; unknown —
//       „nieznany”; detailed — populacja), obcy statek rumor — bez nazwy i roli (504), kolonia gracza — pełna (4 linie),
//       ciało niezbadane / zbadane, gwiazda, stacja, statek; ≤ 4 linie
//   K3  wybór obiektu: etykieta > tarcza > sprite; punkt na tarczy wygrywa z etykietą sąsiada (487, 503); tożsamość tarczy
//       i etykiety tego samego obiektu wspólna; stacja pod kursorem
//   K4  warstwa (stub świata, prawdziwy `HudLayer` + `HudLabelLayer`): etykieta na żądanie TYLKO dla ciał bez etykiety stałej
//       i TYLKO przy najechaniu / zaznaczeniu; kolonia gracza — rozwinięcie własnej etykiety; obca kolonia; gwiazda
//   K5  przypięcie (I8.3): etykieta rozwinięta nie zmienia położenia, sąsiad ustępuje i po zwinięciu wraca; KONTROLE — bez
//       przypięcia skacze, bez pamięci powrotu sąsiad zostaje
//   K6  zwinięta „+N” → rozwinięcie głowy grupy bez szyny; tarcza członka innego niż kotwica — co najmniej szyna
//   K7  dymki (piny na wywołaniach): `#colony-3d-tooltip` (statek, kolonia) i ciałowo-statkowa część `#kosmos-tooltip`
//       wygaszone na warstwie etykiet HUD; podpowiedź budynku (K3), POI i współrzędne pustej mapy — zostają
//   K8  akcja „Mapa ciała”: `bodyCardAction` = lustro skutku `LabelPinLogic.runBodyMapAction` (tabela ciał; dawniej lustro
//       `BottomContext._actionLabel`); karta ciała usunięta z `UIManager` (T4 — przypięcie jest jedyną powierzchnią ciała),
//       zaznaczenie zostaje
//   K9  budżet: w spoczynku z kursorem na etykiecie — 0 wywołań ctx; treść z pamięci (jedno liczenie na obiekt w TTL)
//   ⚠ PRZECELOWANE 2026-10-27 (REFORMA ZAKŁADEK T4, `TABS_REFORM_PLAN.md` §5.10): flaga kroku `labelHover` na stałe ON —
//     K0b–K0d (flaga) zastąpione pinem braku predykatów i klucza; K5i bez połowy OFF; K7 / K8e — bramką jest warstwa etykiet
//     HUD (`isHudLabelsOn`); K10 (OFF = dziś: druga linia przy najechaniu, bez etykiet na żądanie) usunięty razem z tą ścieżką
//     (K10c — ta sama kolonia rozwinięta — zostaje jako K4j). T4-2 (karta ciała usunięta): K8b / K8c — lustro tabeli akcji
//     wobec skutku `runBodyMapAction` (rdzeń dawnego `BottomContext._doAction`), K8d — Generator tym samym lustrem; K8e / K8f
//     (bramka i wywołania karty w `UIManager`) zastąpione pinem braku karty w `UIManager`.
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import * as T3 from '../../lib/three.core.js';
import EventBus from '../../core/EventBus.js';
import { t as tx } from '../../i18n/i18n.js';

let pass = 0, fail = 0;
const ok = (c, label) => { if (c) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const src = (rel) => { try { return readFileSync(new URL(rel, import.meta.url), 'utf8'); } catch { return ''; } };
const tryImport = async (p) => { try { return await import(p); } catch (e) { console.log('    (' + p + ': ' + e.message + ')'); return null; } };
const call = (f, ...a) => { try { return typeof f === 'function' ? f(...a) : undefined; } catch (e) { console.log('    (wyjątek: ' + e.message + ')'); return undefined; } };

const LH = await tryImport('../../ui/LabelHoverLogic.js');
const LL = await tryImport('../../ui/HudLabelLogic.js');
const LLay = await tryImport('../../ui/HudLabelLayer.js');
const HL = await tryImport('../../ui/HudLayer.js');
const LP = await tryImport('../../ui/LabelPinLogic.js');
const FEATURES = GAME_CONFIG.FEATURES;

// ═══ K0 ══════════════════════════════════════════════════════════════════════
header('K0  API (flaga kroku `labelHover` na stałe ON od T4)');
{
  const need = ['LABEL_HOVER', 'makeHoverMemory', 'expansionFade', 'resolveHoverTarget',
    'labelObjectKey', 'hoverObjectKey', 'pickStationAt', 'bodyCardAction', 'colonyExpansionLines', 'bodyExpansionLines',
    'starExpansionLines', 'foreignColonyExpansionLines', 'stationExpansionLines', 'foreignStationExpansionLines',
    'vesselExpansionLines', 'enemyVesselExpansionLines', 'placeLabelsPinned', 'pinFor', 'updatePins', 'depositSummary',
    'makeYieldMemory'];
  const missing = need.filter((n) => LH?.[n] === undefined);
  ok(missing.length === 0, `K0a: \`LabelHoverLogic\` — ${need.length} eksportów (brak: ${missing.join(', ') || '—'})`);
  ok(!!LH && LH.isLabelHoverOn === undefined && LH.isLabelHoverActive === undefined && FEATURES.labelHover === undefined
    && !/\blabelHover:\s*(true|false)/.test(strip(src('../../config/GameConfig.js'))),
    'K0b: flaga kroku `labelHover` na stałe ON (T4) — predykaty `isLabelHoverOn` / `isLabelHoverActive` i klucz w GameConfig usunięte');
  const L = LH?.LABEL_HOVER ?? {};
  ok(L.FADE_MS === 150 && L.LINGER_MS > 0 && L.MAX_LINES === 4, `K0e: fade-in ${L.FADE_MS} ms, wygasanie ${L.LINGER_MS} ms, ≤ ${L.MAX_LINES} linie (D-TR-3)`);
}

// ═══ K1 ══════════════════════════════════════════════════════════════════════
header('K1  stan najechania na czasie realnym');
{
  const m = call(LH?.makeHoverMemory);
  const u = (k, now) => call(m?.update?.bind(m), k, now) ?? {};
  const a0 = u('body:A', 1000), a1 = u('body:A', 1075), a2 = u('body:A', 1150);
  ok(a0.key === 'body:A' && a0.alpha === 0 && a0.animating === true && Math.abs((a1.alpha ?? 0) - 0.5) < 1e-9 && a2.alpha === 1 && a2.animating === false,
    `K1a: wejście — fade-in 0 → 0,5 → 1 w 150 ms czasu realnego (${a0.alpha} / ${a1.alpha} / ${a2.alpha})`);
  const l0 = u(null, 1200), l1 = u(null, 1300), l2 = u(null, 1399), l3 = u(null, 1400);
  ok(l0.key === 'body:A' && l0.lingering === true && l0.alpha === 1 && Math.abs((l1.alpha ?? 0) - 0.5) < 1e-9 && l2.key === 'body:A' && l3.key === null,
    `K1b: zejście kursora — rozwinięcie gaśnie i znika po 200 ms (${l0.alpha} → ${l1.alpha} → ${l2.key ?? '—'} → ${l3.key ?? '—'})`);
  u('body:A', 2000); u('body:A', 2150); u(null, 2200); const r = u('body:A', 2300);
  ok(r.key === 'body:A' && r.lingering === false && r.alpha === 1, `K1c: powrót przed końcem wygasania — bez ponownego fade-in (alpha ${r.alpha})`);
  const s = u('body:B', 2400);
  ok(s.key === 'body:B' && s.alpha === 0 && s.lingering === false, 'K1d: przejście na INNY obiekt — od razu (poprzednie rozwinięcie znika; naraz jedno z najechania)');
  const back = u('body:B', 1000);
  ok(back.key === 'body:B' && back.alpha >= 0 && back.alpha <= 1, 'K1e: zegar cofnięty — bez ujemnych czasów');
  ok(call(LH?.expansionFade, 1000, 1000) === 0 && call(LH?.expansionFade, 1150, 1000) === 1, 'K1f: fade rozwinięcia zaznaczonego — ta sama krzywa 150 ms');
}

// ═══ K2 ══════════════════════════════════════════════════════════════════════
header('K2  treść wg wywiadu i właściciela (≤ 4 linie)');
{
  const LADDER = ['unknown', 'rumor', 'contact', 'detailed'];
  const atLeast = (q) => (lvl) => LADDER.indexOf(q) >= LADDER.indexOf(lvl);
  // Fixture rozjeżdża nazwę imperium, nazwę ciała i populację (inaczej pin porównujący źródła przechodzi jałowo).
  const body = { id: 'p_ai', type: 'planet', planetType: 'rocky', name: 'Akhernar h' };
  const fc = (q) => call(LH?.foreignColonyExpansionLines, { owner: { empireId: 'emp_1', empireName: 'Liga Spalonej Drogi', intelAtLeast: atLeast(q) },
    populationText: '55', garrisonText: null, occupierName: null, body }, tx) ?? [];
  const cC = fc('contact'), cR = fc('rumor'), cU = fc('unknown'), cD = fc('detailed');
  const popTxt = tx('hudLabel.pop', '55');
  ok(cC[0] === `${tx('tooltip.planet.owner')}: Liga Spalonej Drogi` && !cC.join('|').includes(popTxt) && !cC.join('|').includes('55'),
    `K2a: obca kolonia, wywiad contact — nazwa imperium, BEZ populacji (531): „${cC[0] ?? '—'}”`);
  ok(cR[0] === tx('fleet.stratcomEmpireForeign') && !cR.join('|').includes('Liga') && cU[0] === tx('fleet.stratcomEmpireUnknown') && !cU.join('|').includes('Liga'),
    `K2b: rumor — „${cR[0] ?? '—'}”, unknown — „${cU[0] ?? '—'}” (bez nazwy imperium)`);
  ok(cD[0]?.includes('Liga Spalonej Drogi') && cD[0]?.includes(popTxt), `K2c: detailed — populacja wolno (KONTROLA, że populacja w ogóle płynie): „${cD[0] ?? '—'}”`);
  const gar = call(LH?.foreignColonyExpansionLines, { owner: { empireId: 'emp_1', empireName: 'Liga', intelAtLeast: atLeast('contact') }, garrisonText: '4 jedn.',
    occupierName: 'Gracz', body }, tx) ?? [];
  ok(gar.length === 4 && gar[1] === `${tx('garrison.readout.label')}: 4 jedn.` && gar[2] === tx('body.occupiedBy', 'Gracz') && gar[3] === tx('planetType.rocky'),
    'K2d: obca kolonia — właściciel / garnizon / okupacja / typ (I7 §3.2)');
  const ev = (q) => call(LH?.enemyVesselExpansionLines, { quality: q, roleLabel: tx('fleetPicture.role.warship') }, tx) ?? [];
  ok(ev('rumor').length === 1 && ev('rumor')[0] === tx('intel.unidentifiedContact') && !ev('rumor').includes(tx('fleetPicture.role.warship'))
    && ev('contact')[0] === tx('fleetPicture.role.warship'), 'K2e: obcy statek rumor — wyłącznie „niezidentyfikowany kontakt” (504); contact — rola');
  const home = { id: 'p_nz', type: 'planet', planetType: 'rocky', temperatureC: 12.6, atmosphere: 'breathable', explored: true,
    deposits: [{ richness: 0.9 }, { richness: 0.8 }, { richness: 0.75 }, { richness: 0.2 }, { totalAmount: 10, remaining: 9 }, { richness: 0.5 }, {}, { richness: 0.1 }] };
  const col = call(LH?.colonyExpansionLines, { sub: '400 POP · 223 wolne', body: home, deposits: call(LH?.depositSummary, home.deposits), occupierName: null, queue: 2 }, tx) ?? [];
  ok(col.length === 4 && col[0] === '400 POP · 223 wolne' && col[1] === `${tx('planetType.rocky')} · +13 °C · ${tx('atmosphere.breathable')}`
    && col[2] === tx('labelHover.deposits', 8, 4) && col[3] === '⏳ ' + tx('leftOutliner.queue', 2),
    `K2f: kolonia gracza — dane / typ · temp. · atm. / złoża skrót / kolejka: ${JSON.stringify(col)}`);
  const occ = call(LH?.colonyExpansionLines, { sub: 'x', body: home, deposits: { count: 0, rich: 0 }, occupierName: 'Liga', queue: 5 }, tx) ?? [];
  ok(occ[occ.length - 1] === tx('body.occupiedBy', 'Liga') && !occ.some((s) => s.includes('⏳')), 'K2g: okupacja wygrywa z kolejką (czwarta linia: „okupacja albo kolejka”)');
  const pd = { id: 'pd_1', type: 'planetoid', name: 'Nt', temperatureC: -120, atmosphere: 'none', explored: false, deposits: [{ richness: 0.9 }] };
  const un = call(LH?.bodyExpansionLines, { body: pd, explored: false, deposits: call(LH?.depositSummary, pd.deposits), distText: '3,40' }, tx) ?? [];
  ok(un[0] === `${tx('bodyType.Planetoid')} · ???` && un[1] === tx('fleet.tooltipStatusUnexplored') && !un.some((s) => s.startsWith(tx('labelHover.deposits', 1, 1).split(' ')[0]))
    && un[un.length - 1] === tx('labelHover.distStar', '3,40'), `K2h: ciało niezbadane — typ · ??? / status / BEZ złóż / dystans od gwiazdy: ${JSON.stringify(un)}`);
  const ex = call(LH?.bodyExpansionLines, { body: { ...pd, explored: true }, explored: true, deposits: { count: 3, rich: 1 }, distText: '3,40' }, tx) ?? [];
  ok(ex.length === 4 && ex[1] === tx('fleet.tooltipStatusExplored') && ex[2] === tx('labelHover.deposits', 3, 1) && ex[0].includes('°C'),
    'K2i: ciało zbadane — temperatura, atmosfera i złoża widoczne');
  const star = call(LH?.starExpansionLines, { star: { spectralType: 'G' }, tempText: '5 778', hzText: ['0,95', '1,37'] }, tx) ?? [];
  ok(star[0] === `${tx('star.G')} · 5 778 K` && star[1] === tx('labelHover.hz', '0,95', '1,37'), `K2j: gwiazda — klasa · temperatura / strefa życia: ${JSON.stringify(star)}`);
  const st = (s, trf) => call(LH?.stationExpansionLines, { sub: '10/40 POP', storage: s, traffic: trf, modules: { n: 3, max: 8, shipyard: true } }, tx) ?? [];
  const sm = st({ kind: 'mother', name: 'Nowa Ziemia' }, { moving: 2, docked: 3 }), sp = st({ kind: 'pool', head: 'Nowa Ziemia', others: 2 }, { moving: 0, docked: 0 });
  ok(sm.length === 4 && sm[1] === tx('labelHover.storage', 'Nowa Ziemia') && sm[2] === tx('labelHover.traffic', 2, 3) && sm[3] === tx('labelHover.modules', 3, 8) + ' · 🛠'
    && sp[1] === tx('labelHover.pool', 'Nowa Ziemia', 2) && sp[2] === tx('station.tradersNone') && st({ kind: 'cut' }, null)[1] === tx('station.cutOffFromSupply'),
    'K2k: stacja — POP / magazyn (matka, pula, odcięta) / ruch / moduły');
  const vs = call(LH?.vesselExpansionLines, { sub: 'Zwiadowca · wykr. 2,5 AU', activity: 'Transport', etaText: '⏱125', fuelText: 'Paliwo 74%' }, tx) ?? [];
  const vt = call(LH?.vesselExpansionLines, { sub: 'Zwiadowca', activity: 'Transport', etaText: '⏱125', fuelText: 'Paliwo 74%', skipActivity: true }, tx) ?? [];
  ok(vs.length === 3 && vs[1] === 'Transport · ⏱125' && vs[2] === 'Paliwo 74%' && vt.length === 2 && !vt.some((s) => s.includes('Transport')),
    'K2l: statek — rola · wykr. · lock / aktywność · ETA / paliwo; w trybie Y aktywność już w pierwszej linii — pominięta');
  const many = call(LH?.colonyExpansionLines, { sub: 'a', body: home, deposits: { count: 2, rich: 0 }, occupierName: 'x', queue: 3 }, tx) ?? [1, 2, 3, 4, 5];
  ok(many.length <= 4, `K2m: nigdy więcej niż 4 linie (${many.length})`);
}

// ═══ K3 ══════════════════════════════════════════════════════════════════════
header('K3  wybór obiektu pod kursorem (łańcuch kliku)');
{
  const R = (p) => call(LH?.resolveHoverTarget, p) ?? null;
  ok(R({ labelKey: 'c:B', onDisc: false, bodyId: null })?.key === 'c:B', 'K3a: etykieta pod kursorem — etykieta');
  const d = R({ labelKey: 'c:B', onDisc: true, bodyId: 'A' });
  ok(d?.kind === 'body' && d.id === 'A', 'K3b: punkt na tarczy ciała A i na etykiecie sąsiada B — tarcza wygrywa (487, 503)');
  ok(R({ onDisc: true, vesselCoreId: 'v1', vesselId: 'v2', bodyId: 'A' })?.id === 'v1' && R({ onDisc: true, vesselCoreId: null, vesselId: 'v2', bodyId: 'A' })?.id === 'A',
    'K3c: na tarczy statek tylko w obrębie rdzenia sprite\'a (487); picker 28 px na tarczy — ignorowany');
  ok(R({ vesselId: 'v2', stationId: 's1', bodyId: 'star' })?.id === 'v2' && R({ stationId: 's1', bodyId: 'star' })?.id === 's1' && R({ bodyId: 'star' })?.id === 'star'
    && R({}) === null, 'K3d: poza tarczą — statek > stacja > ciało (kolejność `ThreeRenderer.handleClick`)');
  const K = (x) => call(LH?.hoverObjectKey, x);
  ok(K({ kind: 'label', key: 'c:p_nz' }) === 'body:p_nz' && K({ kind: 'body', id: 'p_nz' }) === 'body:p_nz' && K({ kind: 'label', key: 'k:v_3' }) === 'vessel:v_3'
    && K({ kind: 'vessel', id: 'v_3' }) === 'vessel:v_3' && K({ kind: 'label', key: 'hs:st_9' }) === 'station:st_9' && K({ kind: 'label', key: 'e:v_9' }) === 'vessel:v_9',
    'K3e: tożsamość obiektu wspólna dla tarczy / sprite\'a i jego etykiety (przejście kursora bez ponownego fade-in)');
  ok(K({ kind: 'label', key: 'g:p_nz' }) === 'lbl:g:p_nz' && K({ kind: 'label', key: 'k:v_1,v_2' }) === 'lbl:k:v_1,v_2', 'K3f: grupa „+N” i klaster statków — sama etykieta');
  const S = (list, x, y) => call(LH?.pickStationAt, list, x, y);
  ok(S([{ id: 'a', disc: { x: 100, y: 100, r: 0.6 } }], 100, 100) === null && S([{ id: 'a', disc: { x: 100, y: 100, r: 8 } }], 104, 103) === 'a'
    && S([{ id: 'a', disc: { x: 100, y: 100, r: 8 } }, { id: 'b', disc: { x: 106, y: 100, r: 8 } }], 105, 100) === 'b',
    'K3g: stacja pod kursorem — sfera modelu w rzucie, bez minimalnego promienia (daleki widok nie zabiera tarczy planety)');
}

// ═══ Świat (stub) — prawdziwy `HudLayer` + `HudLabelLayer` ═══════════════════════════════════════════════════
const K = globalThis.window.KOSMOS ?? (globalThis.window.KOSMOS = {});
const mkCam = (pos, look = [0, 0, 0]) => { const c = new T3.PerspectiveCamera(55, 1600 / 1041, 0.001, 5000); c.position.set(...pos); c.lookAt(...look); c.updateMatrixWorld(); return c; };
const viewOf = (cam) => ({ view: cam.matrixWorldInverse.elements.slice(), proj: cam.projectionMatrix.elements.slice(), fovDeg: 55, cssW: 1600, cssH: 1041, worldPerAU: 11 });
const BODIES = {
  star: { x: 0, y: 0, z: 0, r: 3.6 }, p_nz: { x: 6.2, y: 0, z: 0, r: 0.3 }, p_moon: { x: 6.7, y: 0, z: 0.25, r: 0.1 },
  st_1: { x: 6.55, y: 0, z: 0.05, r: 0.04 }, p_x: { x: -8, y: 0, z: 9, r: 0.25 }, p_fob: { x: -8.3, y: 0, z: 9.2, r: 0.05 },
  pd_1: { x: 9.5, y: 0, z: -2.0, r: 0.06 }, p_ai: { x: 4.0, y: 0, z: -6.0, r: 0.2 },
};
const ENT = {
  star: { id: 'star', type: 'star', name: 'Kepler', spectralType: 'G', temperature: 5778, habitableZone: { min: 0.95, max: 1.37 } },
  p_nz: { id: 'p_nz', type: 'planet', planetType: 'rocky', name: 'Nowa Ziemia', explored: true, temperatureC: 13, atmosphere: 'breathable', deposits: [], x: 220, y: 0 },
  p_moon: { id: 'p_moon', type: 'moon', name: 'Nowy Księżyc', parentPlanetId: 'p_nz', explored: true },
  p_x: { id: 'p_x', type: 'planet', planetType: 'gas', name: 'Kepler-4799 h', explored: true, deposits: [{ richness: 0.9 }], x: 400, y: 300 },
  p_fob: { id: 'p_fob', type: 'moon', name: 'Fobos', parentPlanetId: 'p_x', explored: true },
  pd_1: { id: 'pd_1', type: 'planetoid', name: 'Nt', explored: false, deposits: [{ richness: 0.9 }], temperatureC: -120, atmosphere: 'none', x: 330, y: -70 },
  p_ai: { id: 'p_ai', type: 'planet', planetType: 'rocky', name: 'Akhernar h', explored: true, x: 140, y: -210 },
};
const mkCol = (pid, o = {}) => ({ planetId: pid, planet: { id: pid, name: ENT[pid].name, systemId: 'sys_home' }, civSystem: { population: 400, freePops: 223 }, ...o });
const COLS = [mkCol('p_nz'), mkCol('p_moon'), mkCol('p_fob')];
const AI_COL = { planetId: 'p_ai', ownerEmpireId: 'emp_1', name: 'Twierdza Ligi', planet: { id: 'p_ai', name: 'Akhernar h' }, civSystem: { population: 55, freePops: 3 } };
const STATIONS = [{ id: 'st_1', name: 'Stacja Nowa Ziemia', bodyId: 'p_nz', pop: 10, popCapacity: 40, modules: [], ownerEmpireId: null, systemId: 'sys_home' }];
const W0 = { cam: null, camEpoch: 1, lead: null, ids: [], entity: null, sim: 5000, vessels: [], sprites: {}, intel: {}, empIntel: { emp_1: 'contact' },
  hoverBody: null, onDisc: () => false, vesselAt: null, cardRect: null };
const LADDER = ['unknown', 'rumor', 'contact', 'detailed'];
const setWorld = () => {
  globalThis.innerWidth = 1600; globalThis.innerHeight = 1041;
  Object.assign(K, {
    civMode: true, activeSystemId: 'sys_home', uiScale: 1.25, planetGlobeOpen: false, uiPrefs: {}, homePlanet: { id: 'p_nz' },
    uiManager: {
      _cleanView: false, overlayManager: { isAnyOpen: () => false },
      getSelectedVesselIds: () => [...W0.ids], getSelectedVesselId: () => W0.lead,
      get _selectedEntity() { return W0.entity ? (ENT[W0.entity] ?? { id: W0.entity }) : null; }, getSelectedFleetId: () => null,
      setSelectedVesselId: (id) => { W0.lead = id; W0.ids = id ? [id] : []; }, addToSelection: (id) => { W0.ids.push(id); },
      _bottomContext: { get _cardRect() { return W0.cardRect; } }, _mapSurface: () => null,
    },
    threeRenderer: {
      _cleanView: false, _renderingEnabled: true, _contextLost: false, _pingedEnemyId: null, renderer: { getPixelRatio: () => 1.5 },
      get _hoverPlanetId() { return W0.hoverBody; }, _planets: new Map([['p_nz', {}], ['p_x', {}], ['p_ai', {}]]), _moons: new Map([['p_moon', {}], ['p_fob', {}]]),
      _stations: new Map([['st_1', {}]]),
      get _vessels() { return new Map(Object.keys(W0.sprites).map((id) => [id, { sprite: { visible: true } }])); },
      getCameraMoveEpoch: () => W0.camEpoch, getHudView: () => viewOf(W0.cam),
      getBodyWorldInfo: (id) => (BODIES[id] ? { ...BODIES[id] } : null),
      getStationWorldInfo: (id) => (BODIES[id] ? { ...BODIES[id] } : null),
      getVesselWorldPosition: (id) => (W0.sprites[id] ? { ...W0.sprites[id] } : null), getVesselWorldInfo: (id) => (W0.sprites[id] ? { ...W0.sprites[id], r: 0.02 } : null),
      _isOnBodyDisc: (x, y) => W0.onDisc(x, y), _getVesselAtScreen: () => W0.vesselAt,
    },
    entityManager: { get: (id) => ENT[id] ?? null, getByType: (ty) => Object.values(ENT).filter((e) => e.type === ty) },
    colonyManager: { getPlayerColonies: () => [...COLS], getAllColonies: () => [...COLS, AI_COL],
      getColony: (id) => COLS.find((c) => c.planetId === id) ?? (id === 'p_ai' ? AI_COL : null), hasColony: (id) => COLS.some((c) => c.planetId === id) || id === 'p_ai' },
    stationSystem: { getAllStations: () => [...STATIONS] },
    vesselManager: { getAllVessels: () => [...W0.vessels], getVessel: (id) => W0.vessels.find((v) => v.id === id) ?? null, isImmobilized: () => false,
      getVesselSensorRangeAU: () => 2.5 },
    intelSystem: { getVesselContact: (id) => (W0.intel[id] ? { quality: W0.intel[id] } : null),
      isAtLeast: (emp, lvl) => LADDER.indexOf(W0.empIntel[emp] ?? 'unknown') >= LADDER.indexOf(lvl) },
    empireRegistry: { get: (id) => (id === 'emp_1' ? { id, name: 'Liga Spalonej Drogi' } : null) },
    techSystem: { getMultiplier: () => 1 },
    timeSystem: { get simClockMs() { return W0.sim; }, gameTime: 120 },
    tacticalMode: { isActive: false },
    leftOutliner: { getReservedWidth: () => 150 }, rightOutliner: { getReservedWidth: () => 150 },
    tacticalDock: { getReservedHeight: () => 0 },
    starSystemManager: { switchActiveSystem: () => true },
  });
};
setWorld();
FEATURES.hudLabels = true;
const mkCtx = () => {
  const o0 = { calls: [] };
  return new Proxy(o0, {
    get(o, p) { if (p === 'calls') return o.calls; if (Object.prototype.hasOwnProperty.call(o, p)) return o[p]; return (...a) => { o.calls.push([String(p), ...a]); }; },
    set(o, p, v) { o.calls.push(['=' + String(p), v]); o[p] = v; return true; },
  });
};
const mkHud = () => {
  const ctx = mkCtx(); const cv = { width: 0, height: 0, getContext: () => ctx };
  const lab = LLay?.HudLabelLayer ? new LLay.HudLabelLayer(null) : null;
  const hud = HL?.HudLayer && lab ? new HL.HudLayer(cv, { autoStart: false, sublayers: [lab] }) : null;
  if (lab && hud) lab._hud = hud;
  return { ctx, lab, hud, frame: (now) => (hud ? hud.frame(now) : null), dbg: () => lab?.debug?.() ?? null };
};
const CAM_WIDE = mkCam([2, 34, 22], [2, 0, 0]);                  // ~40 j. nad układem — wszystkie ciała stubu w kadrze
const CAM_FAR = mkCam([383.13, 204.12, 118.52]);                 // widok układu ~450 j. (stos Nowej Ziemi zwinięty)
const projLogical = (cam, p) => { const v = new T3.Vector3(p.x, p.y, p.z).project(cam); return { x: (v.x * 0.5 + 0.5) * 1600 / 1.25, y: (-v.y * 0.5 + 0.5) * 1041 / 1.25 }; };
const labelBy = (d, key) => d?.labels?.find((l) => l.key === key) ?? null;
const pointAt = (H, lx, ly) => H.hud?.setPointer?.(lx, ly, lx * 1.25, ly * 1.25, false);
const hoverBody = (H, cam, id) => { const p = projLogical(cam, BODIES[id]); W0.hoverBody = id; pointAt(H, p.x, p.y); return p; };
const clearHover = (H) => { W0.hoverBody = null; W0.vesselAt = null; W0.onDisc = () => false; if (H.hud) H.hud._pointer = null; };
const reset = () => { W0.entity = null; W0.lead = null; W0.ids = []; W0.vessels = []; W0.sprites = {}; W0.intel = {}; W0.empIntel = { emp_1: 'contact' }; W0.cardRect = null; };

// ═══ K4 ══════════════════════════════════════════════════════════════════════
header('K4  warstwa: etykieta na żądanie tylko dla ciał bez etykiety stałej, tylko przy najechaniu / zaznaczeniu');
{
  reset(); W0.cam = CAM_WIDE; W0.camEpoch++;
  const inMap = ['star', 'p_nz', 'p_x', 'pd_1', 'p_ai'].every((id) => { const p = projLogical(CAM_WIDE, BODIES[id]); return p.x > 160 && p.x < 1120 && p.y > 40 && p.y < 820; });
  ok(inMap, 'K4 świadek sceny: gwiazda, Nowa Ziemia, planeta bez kolonii, planetoida i kolonia AI w kadrze obszaru mapy');
  const H = mkHud();
  H.frame(1000);
  const d0 = H.dbg();
  ok(!!d0 && (d0.labels ?? []).length > 0 && !(d0.labels ?? []).some((l) => String(l.key).startsWith('h:')),
    `K4a KONTROLA: bez najechania i zaznaczenia — żadnej etykiety na żądanie (świadek: etykiety stałe ${(d0?.labels ?? []).length})`);
  hoverBody(H, CAM_WIDE, 'pd_1');
  H.frame(1016);
  const d1 = H.dbg();
  const pdL = labelBy(d1, 'h:pd_1');
  ok(!!pdL && pdL.text[0] === 'Nt' && pdL.text.length >= 3 && pdL.text.includes(tx('fleet.tooltipStatusUnexplored')) && !labelBy(d1, 'h:p_x'),
    `K4b: najechanie planetoidy bez placówki — etykieta na żądanie z rozwinięciem: ${pdL ? JSON.stringify(pdL.text) : '—'} (inne ciała bez etykiety — nic)`);
  // Kolonia gracza: najechanie tarczy rozwija JEJ etykietę, bez etykiety na żądanie.
  hoverBody(H, CAM_WIDE, 'p_nz');
  H.frame(1032);
  const d2 = H.dbg();
  const nzLab = (d2?.labels ?? []).find((l) => l.kind === 'rail' || l.key === 'c:p_nz' || l.key === 'g:p_nz');
  const nzLines = nzLab ? (nzLab.kind === 'rail' ? (nzLab.rows ?? [])[0] ?? [] : nzLab.text) : [];
  ok(!labelBy(d2, 'h:p_nz') && nzLines.length >= 3 && nzLines.some((s) => s.includes(tx('hudLabel.capital'))),
    `K4c: najechanie kolonii gracza — rozwinięcie jej etykiety (${nzLines.length} linie), bez etykiety na żądanie`);
  // Zejście kursora — w PAUZIE (zegar symulacji stoi): rozwinięcie gaśnie i znika po 200 ms czasu realnego.
  hoverBody(H, CAM_WIDE, 'pd_1'); H.frame(1100); H.frame(1300);
  W0.sim = 5000;
  clearHover(H);
  H.frame(1400);
  const still = labelBy(H.dbg(), 'h:pd_1');
  H.frame(1650);
  const gone = labelBy(H.dbg(), 'h:pd_1');
  ok(!!still && !gone, `K4d: pauza (zegar symulacji ${W0.sim}) — po zejściu kursora etykieta na żądanie jeszcze jest (wygasa), po 200 ms czasu realnego znika`);
  // Zaznaczone ciało bez etykiety stałej — etykieta zostaje, dopóki jest zaznaczone (także bez kursora, po czasie wygasania).
  W0.entity = 'pd_1';
  H.frame(1700); H.frame(2400);
  const sel = labelBy(H.dbg(), 'h:pd_1');
  ok(!!sel && sel.selected === true && sel.text.length >= 3, 'K4e: zaznaczone ciało bez etykiety stałej — etykieta z rozwinięciem stała (1. klik zaznacza, etykieta zostaje)');
  W0.entity = null; H.frame(2500);
  ok(!!sel && !labelBy(H.dbg(), 'h:pd_1'), 'K4f: odznaczenie — etykieta na żądanie (była — świadek K4e) znika');
  // Obca kolonia (wywiad contact): nazwa imperium, bez populacji; wersaliki kolonii.
  W0.empIntel.emp_1 = 'contact';
  hoverBody(H, CAM_WIDE, 'p_ai'); H.frame(2600);
  const ai = labelBy(H.dbg(), 'h:p_ai');
  const aiTxt = (ai?.text ?? []).join(' | ');
  ok(!!ai && ai.text[0] === 'AKHERNAR H' && aiTxt.includes('Liga Spalonej Drogi') && !aiTxt.includes('55') && !aiTxt.includes('Twierdza'),
    `K4g: obca kolonia, contact — nazwa CIAŁA (nie nazwa cudzej kolonii), właściciel, bez populacji: ${aiTxt || '—'}`);
  W0.empIntel.emp_1 = 'rumor'; W0.camEpoch++;
  H.lab?._expCache?.clear?.();
  H.frame(2700);
  const aiR = (labelBy(H.dbg(), 'h:p_ai')?.text ?? []).join(' | ');
  ok(aiR.includes(tx('fleet.stratcomEmpireForeign')) && !aiR.includes('Liga'), `K4h: rumor — „obce imperium” bez nazwy: ${aiR || '—'}`);
  clearHover(H); H.frame(3000);
  // Gwiazda — etykieta na żądanie (środek tarczy), gdy kursor na widocznym rdzeniu.
  W0.onDisc = () => true;
  hoverBody(H, CAM_WIDE, 'star'); H.frame(3100);
  const stL = labelBy(H.dbg(), 'h:star');
  ok(!!stL && stL.text[0] === 'Kepler' && (stL.text[1] ?? '').startsWith(tx('star.G')), `K4i: najechanie gwiazdy — etykieta na żądanie: ${stL ? JSON.stringify(stL.text) : '—'}`);
  clearHover(H); H.frame(3400);
}

// ═══ K5 ══════════════════════════════════════════════════════════════════════
header('K5  przypięcie (I8.3) — etykieta rozwinięta nie zmienia położenia, sąsiad ustępuje i po zwinięciu wraca');
{
  const rect = { x: 150, y: 28, w: 980, h: 742.8 };
  const base = { key: 'a', ax: 600, ay: 400, clear: 0, w: 60, h: 17, prio: 2 };
  const collapsed = LL?.placeLabels?.([base], { rect, obstacles: [], prev: new Map([['a', 1]]) })?.placed?.[0];
  const exp = { ...base, w: 110, h: 60 };
  const pin = call(LH?.pinFor, 'a', { pins: new Map(), prev: new Map([['a', 1]]), baseH: 17 });
  const pinned = call(LH?.placeLabelsPinned, [{ ...exp, pin }], { rect, obstacles: [], prev: new Map([['a', 1]]) })?.placed?.[0];
  const right0 = collapsed ? collapsed.x + collapsed.w : NaN, right1 = pinned ? pinned.x + pinned.w : NaN;
  ok(!!collapsed && !!pinned && pinned.y === collapsed.y && Math.abs(right1 - right0) < 1e-9 && pinned.h === 60 && pinned.cand === collapsed.cand,
    `K5a: rozwinięta (60 px) stoi: górna krawędź ${collapsed?.y?.toFixed(1)} → ${pinned?.y?.toFixed(1)}, prawa krawędź przy kotwicy bez zmian, pasek rośnie w dół`);
  const loose = LL?.placeLabels?.([exp], { rect, obstacles: [], prev: new Map([['a', 1]]) })?.placed?.[0];
  ok(!!loose && loose.y !== collapsed?.y, `K5a KONTROLA: bez przypięcia ten sam kandydat z nową wysokością skacze w górę (${collapsed?.y?.toFixed(1)} → ${loose?.y?.toFixed(1)}) — pin nie jest jałowy`);
  // Sąsiad, którego pierwszy kandydat leży na przypiętej etykiecie — ustępuje (bez nakładania), przypięta stoi.
  const nb = { key: 'b', ax: 500, ay: 420, clear: 0, w: 70, h: 17, prio: 0 };   // pierwszy kandydat (E, nad kotwicą) — w przypiętej
  const both = call(LH?.placeLabelsPinned, [{ ...exp, pin }, nb], { rect, obstacles: [] })?.placed ?? [];
  const A = both.find((p) => p.key === 'a'), B = both.find((p) => p.key === 'b');
  const nbAlone = LL?.placeLabels?.([nb], { rect, obstacles: [] })?.placed?.[0];
  const clashAlone = nbAlone && pinned ? (LL?.rectOverlapArea?.(nbAlone, pinned, 0) ?? 0) : 0;
  ok(!!A && !!B && A.y === pinned?.y && A.x === pinned?.x && (LL?.rectOverlapArea?.(A, B, 0) ?? 1) === 0 && clashAlone > 0,
    `K5b: sąsiad ustępuje (sam stałby na przypiętej: nakładanie ${clashAlone.toFixed(0)} px²), przypięta stoi, zero nakładania`);
  // Pamięć przypięć: rozwinięta — zapamiętana; zwinięta — zapomniana.
  const pins = new Map();
  call(LH?.updatePins, pins, [{ key: 'a', cand: 3, h: 60 }, { key: 'b', cand: 0, h: 17 }], new Set(['a']));
  const keep = pins.get('a');
  call(LH?.updatePins, pins, [{ key: 'a', cand: 7, h: 70 }], new Set(['a']));
  const kept = pins.get('a');
  call(LH?.updatePins, pins, [{ key: 'a', cand: 7, h: 17 }], new Set());
  ok(keep?.cand === 3 && !pins.has('b') && kept?.cand === 3 && !pins.has('a'), 'K5c: przypięcie trwa, dopóki etykieta jest rozwinięta; zwinięta — zapomniane');
  // Warstwa: najechana etykieta kolonii stoi przy ponownym rozkładzie (klatka zwinięta → klatka rozwinięta).
  reset(); W0.cam = CAM_WIDE; W0.camEpoch++;
  const H = mkHud();
  H.frame(1000); H.frame(1200);
  const before = (H.dbg()?.labels ?? []).find((l) => l.key === 'c:p_x' || l.key === 'c:p_fob' || l.key === 'g:p_x' || l.key === 'r:p_x') ?? null;
  const zone = before ? (H.lab?._zones ?? []).find((z) => z.key === before.key || (before.kind === 'rail' && z.key === 'c:p_fob')) : null;
  if (zone) pointAt(H, zone.x + 2, zone.y + 2);
  H.frame(1250); H.frame(1500);
  const after = before ? labelBy(H.dbg(), before.key) : null;
  // Nazwa stoi: strona E — lewa krawędź, strona W — prawa krawędź (rozwinięta po stronie W rośnie w lewo, tekst do prawej).
  const edge = (l) => (l ? (l.side === 'W' ? +(l.x + l.w).toFixed(1) : l.x) : NaN);
  ok(!!before && !!after && after.side === before.side && edge(after) === edge(before) && after.y === before.y && after.h > before.h && after.pinned === true,
    `K5d: warstwa — najechana etykieta „${before?.key ?? '—'}” (strona ${before?.side}) stoi: krawędź nazwy ${edge(before)} → ${edge(after)}, góra ${before?.y} → ${after?.y}, rośnie w dół (${before?.h} → ${after?.h})`);
  const lay = strip(src('../../ui/HudLabelLayer.js'));
  ok(/fade, p\.expanded === true && p\.side === 'W',/.test(lay), 'K5e: rozwinięta etykieta po stronie W — tekst wyrównany do prawej (nazwa nie skacze w lewo)');
  // Powrót sąsiadów (I8.3 — ustępują, nie przeprowadzają się): klatka zwinięta → rozwinięta (sąsiad ustępuje) → zwinięta.
  // KONTROLA na samym rozkładzie paczki A (`placeLabels` — moduł sprzed T1): rozwinięta etykieta jako przeszkoda spycha
  // sąsiada, a lepkość wyboru kandydata zostawia go tam po jej zniknięciu — bez pamięci powrotu test byłby jałowy.
  const candOf = (pl, k) => pl.find((p) => p.key === k)?.cand ?? null;
  const prevOf = (pl) => new Map(pl.map((p) => [p.key, p.cand]));
  const old1 = LL?.placeLabels?.([base, nb], { rect, obstacles: [], prev: new Map([['a', 1]]) })?.placed ?? [];
  const aBox = old1.find((p) => p.key === 'a');
  const expBox = aBox ? { x: aBox.x + aBox.w - exp.w, y: aBox.y, w: exp.w, h: exp.h } : null;   // strona W: prawa krawędź stoi
  const old2 = expBox ? (LL?.placeLabels?.([nb], { rect, obstacles: [expBox], prev: prevOf(old1) })?.placed ?? []) : [];
  const old3 = LL?.placeLabels?.([base, nb], { rect, obstacles: [], prev: new Map([...prevOf(old1), ...prevOf(old2)]) })?.placed ?? [];
  ok(aBox?.side === 'W' && candOf(old2, 'b') != null && candOf(old2, 'b') !== candOf(old1, 'b') && candOf(old3, 'b') === candOf(old2, 'b'),
    `K5f KONTROLA: rozkład paczki A — sąsiad spychany rozwiniętą etykietą (kandydat ${candOf(old1, 'b')} → ${candOf(old2, 'b')}) zostaje tam po jej zniknięciu (${candOf(old3, 'b')}) — powrót nie jest jałowy`);
  const ym = call(LH?.makeYieldMemory);
  const frame = (its, prev) => (call(LH?.placeLabelsPinned, its, { rect, obstacles: [], prev })?.placed ?? []);
  const p1 = frame([base, nb], new Map([['a', 1]]));
  let prev = prevOf(p1);
  call(ym?.step?.bind(ym), prev, true, 7);
  const p2 = frame([{ ...exp, pin: call(LH?.pinFor, 'a', { pins: new Map(), prev, baseH: 17 }) }, nb], prev);
  prev = prevOf(p2);
  const back = call(ym?.step?.bind(ym), prev, false, 7);
  const p3 = frame([base, nb], prev);
  ok(p1.length === 2 && candOf(p2, 'b') !== candOf(p1, 'b') && back === true && candOf(p3, 'b') === candOf(p1, 'b') && candOf(p3, 'a') === candOf(p1, 'a'),
    `K5g: sąsiad ustępuje rozwiniętej (kandydat ${candOf(p1, 'b')} → ${candOf(p2, 'b')}), po zwinięciu (kamera stoi) wraca: ${candOf(p3, 'b')}`);
  const ym2 = call(LH?.makeYieldMemory);
  const q0 = new Map([['b', 0]]);
  call(ym2?.step?.bind(ym2), q0, true, 7);
  const q1 = new Map([['b', 2]]);
  call(ym2?.step?.bind(ym2), q1, true, 8);                     // kamera ruszona w trakcie rozwinięcia — migawka przepada
  call(ym2?.step?.bind(ym2), new Map([['b', 3]]), true, 8);    // … i nie wraca, dopóki rozwinięcie trwa
  const q2 = new Map([['b', 3]]);
  const back2 = call(ym2?.step?.bind(ym2), q2, false, 8);
  ok(back2 === false && q2.get('b') === 3 && ym2?.active === false, 'K5h: kamera ruszona w trakcie rozwinięcia — bez powrotu (rozkład ułożył etykiety od nowa), migawka nie wraca do końca rozwinięcia');
  ok(/this\._yieldMem\.step\(this\._prev, expandedKeys\.size > 0, tr\?\.getCameraMoveEpoch\?\.\(\) \?\? 0\);\s*const \{ placed \} = placeLabelsPinned\(/.test(lay)
    && !/\bplaceLabels\(/.test(lay),
    'K5i: warstwa — pamięć powrotu przed rozkładem T1 (epoka ruchu kamery); rozkład zawsze z przypięciami (bez dawnej ścieżki OFF)');
}

// ═══ K6 ══════════════════════════════════════════════════════════════════════
header('K6  zwinięta „+N” — rozwinięcie głowy grupy bez szyny; tarcza członka — co najmniej szyna');
{
  reset(); W0.cam = CAM_FAR; W0.camEpoch++;
  const H = mkHud();
  H.frame(1000);
  const g0 = labelBy(H.dbg(), 'g:p_nz');
  const z = (H.lab?._zones ?? []).find((q) => q.key === 'g:p_nz');
  if (z) pointAt(H, z.x + z.w / 2, z.y + z.h / 2);
  H.frame(1100); H.frame(1300);
  const g1 = labelBy(H.dbg(), 'g:p_nz');
  ok(!!g0 && !!g1 && g1.kind === 'group' && !labelBy(H.dbg(), 'r:p_nz') && g1.text[0] === 'NOWA ZIEMIA +2' && g1.text.length >= 3
    && g1.text.some((s) => s.includes(tx('hudLabel.capital'))), `K6a: najechana „NOWA ZIEMIA +2” — rozwinięcie kotwicy, szyna zwinięta: ${g1 ? JSON.stringify(g1.text) : '—'}`);
  clearHover(H); H.frame(1700);
  W0.hoverBody = 'p_moon';
  const mp = projLogical(CAM_FAR, BODIES.p_moon);
  pointAt(H, mp.x + 0.5, mp.y + 40);                                // kursor poza etykietą (tarcza — raycast renderera)
  H.frame(1800);
  const rail = labelBy(H.dbg(), 'r:p_nz');
  ok(!!rail && !labelBy(H.dbg(), 'g:p_nz') && (rail.rows ?? []).some((r) => r[0] === 'NOWY KSIĘŻYC' && r.length >= 2),
    'K6b: najechanie tarczy członka innego niż kotwica (księżyc) — co najmniej szyna, wiersz księżyca rozwinięty');
  clearHover(H); H.frame(2200);
}

// ═══ K7 ══════════════════════════════════════════════════════════════════════
header('K7  dymki — wygaszone na warstwie etykiet HUD, zostają: budynek (K3), POI, współrzędne pustej mapy (piny na wywołaniach)');
{
  const tr = strip(src('../../renderer/ThreeRenderer.js'));
  const mm = tr.slice(tr.indexOf('  handleMouseMove(screenX, screenY) {'), tr.indexOf('  _showBuildingTooltip(markerHit, sx, sy) {'));
  ok(/if \(isHudLabelsOn\(GAME_CONFIG\.FEATURES\)\) this\._hideColonyTooltip\(\);\s*else this\._showVesselTooltip\(vesselHover, screenX, screenY\);/.test(mm),
    'K7a: `#colony-3d-tooltip` statku — na warstwie etykiet HUD schowany (bez niej — `_showVesselTooltip`)');
  ok(/if \(newId && newId === focusId && !isHudLabelsOn\(GAME_CONFIG\.FEATURES\)\) \{[\s\S]*?this\._showColonyTooltip\(newId, screenX, screenY\);/.test(mm),
    'K7b: `#colony-3d-tooltip` kolonii (533) — tylko bez warstwy etykiet HUD');
  const iB = mm.indexOf('this._showBuildingTooltip(markerHit, screenX, screenY);');
  ok(iB > 0 && !/isHudLabelsOn/.test(mm.slice(mm.indexOf('const markerHit'), iB)), 'K7c KONTROLA: podpowiedź budynku (K3) — bez bramki warstwy etykiet');
  const gs = strip(src('../../scenes/GameScene.js'));
  const m3 = gs.slice(gs.indexOf('  _tooltipHoverFromMain3D(clientX, clientY) {'), gs.indexOf('  _tooltipHoverFromTactical(clientX, clientY) {'));
  ok(/const lh = isHudLabelsOn\(GAME_CONFIG\.FEATURES\);\s*if \(lh && target && target\.type !== 'empty' && target\.type !== 'poi'\) \{\s*this\._scheduleEntityTooltip\(null, clientX, clientY\);\s*return;/.test(m3),
    'K7d: `#kosmos-tooltip` ciała i statku — na warstwie etykiet HUD odwołany (531, 536); POI — przechodzi');
  ok(/const covered = lh && \(/.test(m3) && /if \(!covered && wp &&/.test(m3), 'K7e: współrzędne tylko nad PUSTĄ mapą — nie pod etykietą / gwiazdą / stacją z rozwinięciem (530)');
  ok(/this\._scheduleCoordTooltip\(gp, clientX, clientY\)/.test(m3) && /this\._scheduleEntityTooltip\(target, clientX, clientY\);/.test(m3),
    'K7f KONTROLA: ścieżki współrzędnych i encji (POI, bez warstwy etykiet) zostają w kodzie');
}

// ═══ K8 ══════════════════════════════════════════════════════════════════════
header('K8  akcja „Mapa ciała”: tabela = lustro skutku `runBodyMapAction`; karty ciała brak (T4); zaznaczenie zostaje');
{
  const save = { ...K };
  K.civMode = true; K.homePlanet = { id: 'p_nz' };
  const fx = [];
  K.colonyManager = { hasColony: (id) => id === 'p_nz' || id === 'pd_out' || id === 'p_ai', switchActiveColony: (id) => fx.push(['switch', id]) };
  K.overlayManager = { openPanel: (id, opts) => fx.push(['open', id, opts ?? null]) };
  const ROWS = [
    ['gwiazda', { id: 'star', type: 'star' }, null],
    ['planetoida bez placówki', { id: 'pd_1', type: 'planetoid' }, null],
    ['planetoida z placówką', { id: 'pd_out', type: 'planetoid' }, 'openMap'],
    ['planeta przeanalizowana bez kolonii', { id: 'p_x', type: 'planet', analyzed: true }, 'openMap'],
    ['księżyc nieprzeanalizowany', { id: 'm_9', type: 'moon' }, null],
    ['dom', { id: 'p_nz', type: 'planet' }, 'openMap'],
    ['kolonia AI', { id: 'p_ai', type: 'planet' }, 'openMap'],
  ];
  // Skutek akcji tak, jak woła ją przypięcie (`runPinAction('map')`): coś się dzieje (panel, podgląd, przejęcie) ⇔ wynik ≠ null.
  const act = (e) => call(LP?.runBodyMapAction, e, { K, emit: (n, pl) => fx.push(['emit', n]) });
  const mine = ROWS.map(([n, e]) => call(LH?.bodyCardAction, e, K));
  const card = ROWS.map(([n, e]) => { fx.length = 0; const r = act(e); return r == null ? (fx.length ? 'SKUTEK-BEZ-WYNIKU' : null) : r; });
  ok(ROWS.every(([n, e, want], i) => mine[i] === want), `K8a: \`bodyCardAction\` — tabela (gwiazda i planetoida bez placówki — bez akcji): ${JSON.stringify(mine)}`);
  ok(typeof LP?.runBodyMapAction === 'function' && ROWS.every((r, i) => (card[i] != null) === (r[2] != null) && card[i] !== 'SKUTEK-BEZ-WYNIKU'),
    `K8b KONTROLA: \`runBodyMapAction\` (rdzeń dawnej karty) daje skutek dokładnie na wierszach z akcją: ${JSON.stringify(card)}`);
  ok(ROWS.every((r, i) => (mine[i] != null) === (card[i] != null)), 'K8c: lustro — `bodyCardAction` i skutek akcji „Mapa ciała” zgodne na każdym wierszu');
  K.civMode = false;
  const gen = call(LH?.bodyCardAction, { id: 'p_q', type: 'planet', lifeScore: 90 }, K);
  fx.length = 0;
  const genAct = act({ id: 'p_q', type: 'planet', lifeScore: 90 });
  ok(gen === 'takeCiv' && genAct === 'colonize' && fx.some((f) => f[0] === 'emit' && f[1] === 'planet:colonize'),
    'K8d: Generator — „Przejmij cywilizację” (lustro: `planet:colonize`)');
  Object.assign(K, save);
  for (const k of ['overlayManager', 'colonyManager']) if (!(k in save)) delete K[k];
  const ui = strip(src('../../scenes/UIManager.js'));
  ok(ui.length > 10000 && /this\._selectedEntity = /.test(ui) && !/_bodyCardEntity|_bottomContext|\bBottomContext\b/.test(ui),
    'K8e: karta ciała usunięta z `UIManager` (T4) — brak `_bodyCardEntity` i `BottomContext`; zaznaczenie ciała (`_selectedEntity`) zostaje');
  const ci = strip(src('../../ui/ClickIntentLogic.js'));
  ok(/entityId:\s*um\?\._selectedEntity\?\.id \?\? null,/.test(ci), 'K8g KONTROLA: reguła kliku czyta zaznaczenie z `_selectedEntity` — 2. klik w ciało bez karty = kamera (D-UI-5)');
}

// ═══ K9 ══════════════════════════════════════════════════════════════════════
header('K9  budżet: spoczynek z kursorem na obiekcie — 0 wywołań ctx; treść z pamięci');
{
  reset(); W0.cam = CAM_WIDE; W0.camEpoch++;
  const H = mkHud();
  let builds = 0;
  if (H.lab) for (const m of ['_t1Body', '_t1Station', '_t1Vessel']) { const f = H.lab[m]?.bind(H.lab); if (f) H.lab[m] = (...a) => { builds++; return f(...a); }; }
  H.frame(1000);
  hoverBody(H, CAM_WIDE, 'pd_1');
  const st = [H.frame(1010), H.frame(1060), H.frame(1170)];
  const n0 = H.ctx.calls.length;
  const idle = [H.frame(1200), H.frame(1230)];
  ok(st[0] === 'drawn' && idle.every((s) => s === 'idle') && H.ctx.calls.length === n0,
    `K9a KONTROLA (budżet — niezmiennik sprzed T1): kursor stoi na planetoidzie — fade-in rysuje (${st.join('/')}), potem spoczynek (${idle.join('/')}), 0 wywołań ctx`);
  ok(builds === 1, `K9b: treść liczona raz w czasie pamięci (${builds} liczeń przez ${5} klatek); tylko obiekt z rozwinięciem`);
  H.frame(1400);
  ok(builds === 2, `K9c: po czasie pamięci (${LH?.LABEL_HOVER?.CONTENT_TTL_MS} ms) — jedno odświeżenie (${builds})`);
}

// ═══ K4j (dawny K10c) ════════════════════════════════════════════════════════
header('K4j najechana kolonia — rozwinięcie (≥ 3 linie)');
{
  reset(); W0.cam = CAM_WIDE; W0.camEpoch++;
  const H2 = mkHud();
  W0.hoverBody = 'p_fob'; const pf = projLogical(CAM_WIDE, BODIES.p_fob); pointAt(H2, pf.x, pf.y);
  H2.frame(2000); H2.frame(2200);
  const fob3 = labelBy(H2.dbg(), 'c:p_fob');
  ok(!!fob3 && fob3.text.length >= 3, `K4j: najechana kolonia Fobos rozwinięta (${fob3?.text?.length ?? 0} linie)`);
  W0.hoverBody = null;
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
