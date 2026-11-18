// ARC KONSOLE K2 / KZ — keeper konsol Dyplomacji i Wojen (docs/design/CONSOLES_PLAN.md §1.2, D-K-1, D-K-17, D-K-20;
// Findingi 724, 725 (Wojny), 727, 735). Od KZ konsola jest JEDYNĄ ścieżką grupy Dyplomacji (flagi consoleDiplomacy /
// consoleIntel usunięte) — piny ON == OFF zamienione na piny bezwzględne z dzisiejszej konsoli.
//
// L — wspólna lista imperiów: Dyplomacja rysuje wiersze `EmpireListLogic.empireRowView` przez `ConsoleEmpireList.drawEmpireList`
//     (te same moduły co Wywiad — bez forka); zbiór i kolejność wierszy: napięcie malejąco, od pogłoski (strefy `select`).
// F — MGŁA: na każdym poziomie wywiadu DOKŁADNY zbiór obcych pól (dane-wartowniki) odsłoniętych przez konsolę; opinia / rozbicie /
//     postawa dopiero od kontaktu; liczby wojskowe nigdy; mini-mapa bez układu spoza listy znanych systemów. Świadkowie: konsola
//     naprawdę rysuje (strefy 'tab') i od kontaktu odsłania wartowniki.
// T — Finding 724: tekst konsoli bez surowych id postawy (żeton /^[A-Z_]{4,}$/ spoza słownika PL) i bez kluczy snake_case
//     (/[a-z]+_[a-z_]+/); nieznany przyszły klucz → etykieta ogólna. ŚWIADEK: świat podaje surowe id, konsola rysuje etykiety.
// A — dostępność akcji: na macierzy 96 stanów typy stref akcji = niezależna reguła (warunki dawnej strony 2-kolumnowej) i zbiór
//     slotów (włączone ∪ podpowiedzi) = 6 oczekiwanych; skutek handlera każdej z 8 akcji; wyłączony czip ma podpowiedź z powodem.
// K — Finding 727: prostokąty czipów akcji (Dyplomacja i Wojny) nie przecinają rezerwy zegara przy 1600×1041 i 1280×833
//     (świadek: zegar leży w pasie inspektora — bez rezerwy strefa zeszłaby pod niego).
// G — czipy grupy [ DYPLOMACJA ] [ WYWIAD ] [ WOJNY ] przełączają overlay; pas subnav znika nad całą grupą — na stałe (także bez
//     consoleKit); `isKitScreen` trwały dla diplomacy / intel / war, flag consoleDiplomacy / consoleIntel nie ma.
// W — Wojny: lista (aktywne najpierw), tryb bohatera (stół / lina), dokładny zbiór typów stref stołu i dane wiersza, reguła
//     [ ZAPROPONUJ POKÓJ ] z powodem blokady, Finding 735 (żaden stan nie ma stref ani napisów dźwigni debug, WarOverlay nie ma
//     ich gałęzi; KOSMOS.debug.war.* woła wspólne forceWarBattle / forceWarInvasion z WarConsoleLogic), Finding 725 (Casus Belli
//     przez t()), pusty stan.
// S — wejście bez window.inner* (kółko czyta strefy ostatniej klatki); geometria czipów i wierszy wewnątrz `consoleZones`.
//
// Bez pinów na stałych rysowania. Moduły jeszcze nieistniejące importowane dynamicznie (pin degraduje, nie przerywa).

import '../headless/env.js';
import { readFileSync } from 'node:fs';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { ARCHETYPES } from '../../data/EmpireData.js';
import { setLocale, t, getName } from '../../i18n/i18n.js';
import PL from '../../i18n/pl.js';
import EN from '../../i18n/en.js';

const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const DCL = await tryImport('../../ui/DiplomacyConsoleLogic.js');
const WCL = await tryImport('../../ui/WarConsoleLogic.js');
const DO = await tryImport('../../ui/DiplomacyOverlay.js');
const WO = await tryImport('../../ui/WarOverlay.js');
const CL = await tryImport('../../ui/ConsoleLayoutLogic.js');
const CPD = await tryImport('../../ui/CivPanelDrawer.js');
const WD = await tryImport('../../debug/WarDebug.js');

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const safe = (fn, d = null) => { try { return fn(); } catch (e) { console.log('  ! ' + e.message); return d; } };
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n').replace(/\/\/.*$/gm, '');
setLocale('pl');
const F = GAME_CONFIG.FEATURES;
const savedKit = F.consoleKit;   // consoleKit steruje już tylko sceną za tekstem; G4 sprawdza trwałość także bez niego

// ── atrapa płótna (wzór console_intel_smoke): tekst + wypełnienia; cyfry w kratce sklejane po linii bazowej ──
function recCtx() {
  const texts = [], fills = [];
  const st = {};
  let lastY = null;
  const ctx = new Proxy(st, {
    get: (o, k) => {
      if (k === 'fillText') return (s, x, y) => {
        if (lastY !== null && y === lastY && texts.length) texts[texts.length - 1] += String(s); else texts.push(String(s));
        lastY = y;
      };
      if (k === 'fillRect') return (x, y, w, h) => fills.push({ x, y, w, h, style: o.fillStyle });
      if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (k in o) return o[k];
      return () => {};
    },
    set: (o, k, v) => { o[k] = v; return true; },
  });
  return { ctx, texts, fills };
}

// ── świat-wartownik: jedno imperium E o zadanym poziomie wywiadu + dwa tła ──
const E = 'emp_sent', E2 = 'emp_bg_war', E3 = 'emp_bg_rumor';
const TOK = {
  name: 'ZetaSentinelEmpire', archName: getName(ARCHETYPES.xenophage), opinion: '+37', opinionNum: 37,
  breakdown: 'SentinelSourceX', sysA: 'SentinelPrime', sysB: 'SentinelBeta', secret: 'SecretSentinel', military: '4321',
};
const W = 1280, H = 833;
function makeWorld(level, o = {}) {
  const calls = [];
  const opened = [];
  const rel = {
    empireId: E, status: o.status ?? 'peace', tension: o.tension ?? 22, truceYearsLeft: o.truceYearsLeft ?? 0,
    treaties: o.treaties ?? [], memory: o.memory ?? [{ year: 2101, type: 'research_intrusion' }, { year: 2102, type: 'peace_offered' }],
    ultimatumStartYear: o.ultimatum ? 2100 : null, reparationsUntilYear: null,
  };
  const rels = [rel,
    { empireId: E2, status: 'war', tension: 90, treaties: [], memory: [] },
    { empireId: E3, status: 'peace', tension: 50, treaties: [], memory: [] }];
  const levels = { [E]: level, [E2]: 'detailed', [E3]: 'rumor', ...(o.levels ?? {}) };
  const treatyIds = new Set((rel.treaties).map((x) => x.id));
  const emps = {
    [E]: { id: E, name: o.empName ?? TOK.name, archetype: 'xenophage', homeSystemId: 'sys_a', fsm: { state: o.fsm ?? 'NEGOTIATING' } },
    [E2]: { id: E2, name: 'BgWarEmpire', archetype: 'industrialist', homeSystemId: 'sys_x', fsm: { state: 'WAR' } },
    [E3]: { id: E3, name: 'BgRumorEmpire', archetype: 'industrialist', homeSystemId: 'sys_y', fsm: { state: 'IDLE' } },
  };
  const intel = {
    [E]: { level, knownColonies: ['sys_a', 'sys_b'], knownMilitary: 4321, knownReserve: 77, knownArmedHulls: 6, knownFleetLimit: 9,
      lastIncidents: [{ year: 2111, type: 'incX' }] },
    [E2]: { level: levels[E2], knownColonies: [] }, [E3]: { level: levels[E3], knownColonies: [] },
  };
  const dipl = {
    listPlayerRelations: () => rels,
    getOpinionOfPlayer: (id) => (id === E ? TOK.opinionNum : -10),
    getOpinionBand: () => 'friendly',
    getOpinionBreakdown: (id) => (id === E ? [{ label: TOK.breakdown, value: 12, yearsLeft: 4 }] : []),
    hasTreaty: (id, tid) => id === E && treatyIds.has(tid),
    canRenewTreaty: () => o.canRenew === true,
    getTreatyYearsLeft: () => o.pactLeft ?? 30,
    getRefusalYearsLeft: (id, verb) => (verb === 'offer_peace' ? (o.peaceCd ?? 0) : (o.refusal ?? 0)),
    getUltimatumYearsLeft: () => 1.5,
    getPeaceTable: () => o.table ?? { demand: [{ bodyId: 'b1', name: 'TheirMoon', devValue: 3, countsToCeiling: true }],
      offer: [{ bodyId: 'b2', name: 'OurRock', devValue: 2 }, { bodyId: 'b3', name: 'OurHome', devValue: 9, capital: true }], ceiling: 10 },
    evaluatePeace: () => ({ blocked: false }),
    declareWar: (...a) => calls.push(['declareWar', ...a]), offerPeace: (...a) => calls.push(['offerPeace', ...a]),
    proposeTreaty: (...a) => calls.push(['proposeTreaty', ...a]), renewTreaty: (...a) => calls.push(['renewTreaty', ...a]),
  };
  const wars = o.wars ?? [];
  return {
    calls, opened,
    K: {
      civMode: true,
      diplomacySystem: dipl,
      intelSystem: { getLevel: (id) => levels[id] ?? 'unknown', isAtLeast: (id, lv) => ({ unknown: 0, rumor: 1, contact: 2, detailed: 3 }[levels[id] ?? 'unknown'] >= { unknown: 0, rumor: 1, contact: 2, detailed: 3 }[lv]) },
      empireRegistry: { get: (id) => emps[id] ?? null },
      gameState: { get: (p) => (p === 'intel' ? intel : p.startsWith('intel.') ? intel[p.slice(6)]
        : p.startsWith('battles.') ? o.battles?.[p.slice(8)] : undefined) },
      galaxyData: { systems: [{ id: 'sys_home', name: 'HomeStar', x: 0, y: 0, isHome: true }, { id: 'sys_a', name: TOK.sysA, x: 40, y: 10 },
        { id: 'sys_b', name: TOK.sysB, x: 55, y: -20 }, { id: 'sys_secret', name: TOK.secret, x: 70, y: 30 }] },
      colonyManager: { getPlayerColonies: () => [{ systemId: 'sys_home' }] },
      threatAssessment: { getPlayerStrength: () => 1234 },
      vesselManager: { getAllVessels: () => (o.envoy ? [{ id: 'v1', status: 'idle', modules: ['diplomatic_module'] }] : []) },
      civilianTradeSystem: { isCrossEmpireTradeEnabled: () => true, setCrossEmpireTrade: (...a) => calls.push(['setTrade', ...a]) },
      missionSystem: { _launchEnvoy: (...a) => calls.push(['envoy', ...a]) },
      overlayManager: { active: o.active ?? 'diplomacy', openPanel: (id) => opened.push(id) },
      timeSystem: { gameTime: 2110 },
      warSystem: {
        listAll: () => wars, listActive: () => wars.filter((w) => w.active), getWar: (id) => wars.find((w) => w.id === id) ?? null,
        forceBattle: (id) => { calls.push(['forceBattle', id]); return { success: true, result: { winner: 'B', lossesA: 1, lossesB: 0 } }; },
      },
      invasionSystem: { launchInvasion: (...a) => { calls.push(['launchInvasion', ...a]); return { success: true, landed: [1] }; } },
      homePlanet: { id: 'planet_home' },
    },
  };
}
const silence = (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; } };

function drawDiplo(level, o = {}) {
  const world = makeWorld(level, o);
  globalThis.window.KOSMOS = world.K;
  const r = recCtx();
  const ov = new DO.DiplomacyOverlay();
  ov.show();
  if (o.select !== undefined) ov._selectedId = o.select; else ov._selectedId = E;
  if (o.hover) ov._hoverZone = o.hover;
  if (o.flash) ov._setFlash('FlashSentinel', '#60B090');
  safe(() => ov.draw(r.ctx, o.W ?? W, o.H ?? H));
  return { ov, world, text: r.texts.join('\n'), texts: r.texts, zones: ov._hitZones ?? [] };
}
const ACTION_TYPES = ['declare_war', 'offer_peace', 'send_envoy', 'propose_trade', 'toggle_auto_trade', 'propose_pact', 'renew_pact', 'propose_alliance'];
const actionSig = (zones) => zones.filter((z) => ACTION_TYPES.includes(z.type)).map((z) => `${z.type}:${z.data?.empireId}`).sort().join(',');

// ══ L — wspólna lista ══
console.log('\nL — wspólna lista imperiów (EmpireListLogic + ConsoleEmpireList, bez forka)');
{
  const view = safe(() => src('../../ui/DiplomacyConsoleView.js'), '');
  const logic = safe(() => src('../../ui/DiplomacyConsoleLogic.js'), '');
  assert(/import \{[^}]*empireRowView[^}]*\} from '\.\/EmpireListLogic\.js'/.test(view) && /import \{[^}]*drawEmpireList[^}]*\} from '\.\/ConsoleEmpireList\.js'/.test(view),
    'L1 widok Dyplomacji importuje empireRowView i drawEmpireList ze wspólnych modułów (te co Wywiad)');
  assert(!/function (empireRowView|drawEmpireList|intelRank)\b/.test(view + logic) && !/\bLEVEL_RANK\s*=/.test(view + logic),
    'L2 brak lokalnych kopii reguł wiersza / rangi w kodzie konsoli Dyplomacji');
  const on = drawDiplo('contact');
  const ids = (zs) => zs.filter((z) => z.type === 'select').map((z) => z.data?.empireId).join(',');
  assert(ids(on.zones) === [E2, E3, E].join(','),
    `L3 zbiór i kolejność wierszy: napięcie malejąco, imperium z pogłoski też na liście (${ids(on.zones)})`);
  const ent = safe(() => DCL.diplomacyEntries([{ empireId: 'a', tension: 1 }, { empireId: 'b', tension: 9 }, { empireId: 'c', tension: 5 }],
    (id) => (id === 'c' ? 'unknown' : 'rumor')).map((r) => r.empireId).join(','), '');
  assert(ent === 'b,a', `L4 diplomacyEntries: poniżej rumor odpada, napięcie malejąco (${ent})`);
  assert(on.text.includes('???') && on.zones.some((z) => z.type === 'tab'),
    'L5 wiersz imperium z pogłoski zamaskowany „???” (ta sama maska co Wywiad); świadek: ekran zestawu (strefy tab)');
}

// ══ F — mgła wojny ══
console.log('\nF — mgła: dokładny zbiór pól odsłoniętych przez konsolę na każdym poziomie wywiadu');
{
  const fields = {
    name: (s) => s.includes(TOK.name), arch: (s) => s.includes(TOK.archName), opinion: (s) => s.includes(TOK.opinion),
    breakdown: (s) => s.includes(TOK.breakdown), stance: (s) => s.includes('NEGOTIATING') || s.includes(t('diplo.stance.negotiating')),
    sysA: (s) => s.includes(TOK.sysA), military: (s) => s.includes(TOK.military), secret: (s) => s.includes(TOK.secret),
  };
  const shown = (s) => Object.keys(fields).filter((k) => fields[k](s));
  // zbiory = to, co dawna strona Dyplomacji / Wywiadu pokazywała na tym poziomie (stan przed KZ, pin F1 ⊆ był zielony)
  const FOG = { rumor: 'sysA', contact: 'name,arch,opinion,breakdown,stance,sysA', detailed: 'name,arch,opinion,breakdown,stance,sysA' };
  for (const lv of ['rumor', 'contact', 'detailed']) {
    const sOn = shown(drawDiplo(lv).text);
    assert(sOn.join(',') === FOG[lv] && !sOn.includes('military') && !sOn.includes('secret'),
      `F1 ${lv}: pola konsoli [${sOn}] = [${FOG[lv]}]; wojsko i układ spoza listy — nigdy`);
  }
  const rumor = shown(drawDiplo('rumor').text);
  assert(!rumor.includes('name') && !rumor.includes('opinion') && !rumor.includes('breakdown') && !rumor.includes('stance'),
    `F2 pogłoska: bez nazwy, opinii, rozbicia i postawy (${rumor})`);
  const contact = shown(drawDiplo('contact').text);
  assert(['name', 'opinion', 'breakdown', 'stance', 'sysA'].every((k) => contact.includes(k)),
    `F3 ŚWIADEK: od kontaktu konsola odsłania wartowniki (${contact}) — porównanie nie jest puste`);
}

// ══ T — Finding 724 ══
console.log('\nT — Finding 724: bez surowych id silnika na ekranie');
{
  const plWords = new Set();
  for (const v of Object.values(PL)) for (const w of String(v).split(/[^A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż_]+/)) if (w) plWords.add(w.toUpperCase());
  const tokens = (s) => s.split(/[\s\[\]()·:,.;!?/+\-−]+/).filter(Boolean);
  const rawCaps = (s) => tokens(s).filter((w) => /^[A-Z_]{4,}$/.test(w) && !plWords.has(w));
  const snake = (s) => tokens(s).filter((w) => /[a-z]+_[a-z_]+/.test(w));
  const on = drawDiplo('detailed').text;
  assert(rawCaps(on).length === 0 && snake(on).length === 0, `T1 konsola: brak żetonów surowych id (${rawCaps(on)} | ${snake(on)})`);
  assert(on.includes(t('diplo.stance.negotiating')) && on.includes(t('diplo.memEvent.researchIntrusion'))
    && rawCaps('X NEGOTIATING Y').includes('NEGOTIATING') && snake('a research_intrusion b').includes('research_intrusion'),
    'T2 ŚWIADEK: świat podaje surowe NEGOTIATING / research_intrusion, konsola rysuje ich etykiety; skaner łapie surowe żetony');
  const fut = drawDiplo('detailed', { fsm: 'HIBERNATING', memory: [{ year: 2105, type: 'future_event_kind' }] }).text;
  assert(!fut.includes('HIBERNATING') && !fut.includes('future_event_kind') && fut.includes(t('diplo.stance.unknown')) && fut.includes(t('diplo.memEvent.unknown')),
    'T3 nieznany przyszły stan / klucz pamięci → etykieta ogólna, nigdy surowy klucz');
  // stany automatu — z samego AlienCivSystem (STATES), typy pamięci — wszyscy producenci addMemory w src/ + katalog INCIDENT_CHANNELS
  const civ = safe(() => src('../../systems/AlienCivSystem.js'), '');
  const all = (/const STATES = \[([^\]]*)\]/.exec(civ)?.[1] ?? '').match(/[A-Z_]+/g) ?? [];
  const { readdirSync, statSync } = await import('node:fs');
  const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = `${dir}/${n}`; return statSync(p).isDirectory() ? (n === 'testing' ? [] : walk(p)) : p.endsWith('.js') ? [p] : []; });
  const srcDir = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/\/$/, '');
  const produced = new Set();
  for (const f of walk(srcDir)) for (const m of readFileSync(f, 'utf8').matchAll(/addMemory\??\.?\(\s*[^,()]+,\s*'([a-z_]+)'/g)) produced.add(m[1]);
  const AWD = await tryImport('../../data/AcceptanceWeightData.js');
  const mem = [...new Set([...produced, ...Object.keys(AWD?.INCIDENT_CHANNELS ?? {})])];
  const keys = [...all.map((s) => safe(() => DCL.stanceLabelKey(s))), ...mem.map((m) => safe(() => DCL.memoryLabelKey(m)))];
  assert(all.length === 7 && keys.every((k) => k && k !== DCL?.STANCE_FALLBACK_KEY && k !== DCL?.MEMORY_FALLBACK_KEY && PL[k] && EN[k]) && new Set(keys).size === keys.length,
    `T4 każdy stan AI (${all.length}) i każdy typ pamięci (${mem.length}) ma własną etykietę PL i EN (nie zastępczą)`);
  assert(produced.size >= 12 && ['border_pressure', 'first_contact_kill', 'skirmish'].every((p) => produced.has(p)),
    `T5 ŚWIADEK: skaner producentów widzi też WarSystem i Director (${produced.size}: ${[...produced]})`);
}

// ══ A — dostępność akcji (reguła bezwzględna) ══
console.log('\nA — dostępność akcji (inwentarz typów stref na macierzy stanów, reguła bezwzględna)');
{
  const cases = [];
  for (const level of ['rumor', 'contact']) for (const status of ['peace', 'war', 'truce']) for (const tr of ['none', 'trade', 'pact', 'all'])
    for (const envoy of [false, true]) for (const canRenew of [false, true]) {
      const treaties = tr === 'none' ? [] : tr === 'trade' ? [{ id: 'trade_agreement', signedYear: 2090 }]
        : tr === 'pact' ? [{ id: 'non_aggression', signedYear: 2090 }]
        : [{ id: 'trade_agreement', signedYear: 2090 }, { id: 'non_aggression', signedYear: 2090 }, { id: 'alliance', signedYear: 2095 }];
      cases.push({ level, status, treaties, envoy, canRenew, truceYearsLeft: status === 'truce' ? 4.2 : 0 });
    }
  // niezależna reguła (warunki dawnej strony 2-kolumnowej, przed KZ pin A1 ON == OFF był zielony na tej macierzy)
  const hasTr = (c, id) => c.treaties.some((x) => x.id === id);
  const expectSig = (c) => {
    const contact = c.level !== 'rumor', notWar = c.status !== 'war', out = [];
    if (contact && notWar && c.status !== 'truce') out.push('declare_war');
    if (contact && c.status === 'war') out.push('offer_peace');
    if (contact && c.envoy) out.push('send_envoy');
    if (hasTr(c, 'trade_agreement')) out.push('toggle_auto_trade'); else if (contact && notWar) out.push('propose_trade');
    if (hasTr(c, 'non_aggression')) { if (contact && c.canRenew) out.push('renew_pact'); } else if (contact && notWar) out.push('propose_pact');
    if (contact && notWar && !hasTr(c, 'alliance')) out.push('propose_alliance');
    return out.map((ty) => `${ty}:${E}`).sort().join(',');
  };
  const expectSlots = (c) => ['declare_war', 'offer_peace', 'send_envoy', hasTr(c, 'trade_agreement') ? 'toggle_auto_trade' : 'propose_trade',
    hasTr(c, 'non_aggression') ? 'renew_pact' : 'propose_pact', 'propose_alliance'].sort().join(',');
  let eq = 0, diffs = [], blockedOk = 0, blockedAll = 0;
  const sigs = new Set();
  for (const c of cases) {
    const on = drawDiplo(c.level, c);
    const exp = expectSig(c);
    sigs.add(exp);
    if (actionSig(on.zones) === exp) eq++; else diffs.push(`${c.level}/${c.status}/${c.treaties.length}/${c.envoy}/${c.canRenew}: ${actionSig(on.zones)} ≠ ${exp}`);
    const blocked = on.zones.filter((z) => z.type === 'action_blocked');
    blockedAll += blocked.length; blockedOk += blocked.filter((z) => typeof z.data?.reason === 'string' && z.data.reason.length > 0).length;
    const slots = [...on.zones.filter((z) => ACTION_TYPES.includes(z.type)).map((z) => z.type), ...blocked.map((z) => z.data?.action)].sort().join(',');
    if (slots !== expectSlots(c)) diffs.push(`sloty ${c.level}/${c.status}/${c.treaties.length}: ${slots} ≠ ${expectSlots(c)}`);
  }
  assert(eq === cases.length && diffs.length === 0 && sigs.size >= 12,
    `A1 ${eq}/${cases.length} stanów: typy stref akcji = reguła, sloty = 6 oczekiwanych (różnych podpisów: ${sigs.size})${diffs.length ? ' — ' + diffs.slice(0, 2).join(' | ') : ''}`);
  assert(blockedAll > 0 && blockedOk === blockedAll, `A2 każdy wyłączony czip ma strefę podpowiedzi z niepustym powodem (${blockedOk}/${blockedAll})`);
  const on = drawDiplo('contact', { status: 'peace', envoy: true });
  const zw = on.zones.find((z) => z.type === 'declare_war');
  const za = on.zones.find((z) => z.type === 'propose_alliance');
  silence(() => { on.ov._onHit(zw); on.ov._onHit(za); });
  assert(on.world.calls.some((c) => c[0] === 'declareWar' && c[1] === E && c[2] === 'player_action')
    && on.world.calls.some((c) => c[0] === 'proposeTreaty' && c[1] === E && c[2] === 'alliance'),
    'A3 skutek: czip konsoli woła ten sam handler (declareWar / proposeTreaty z tymi danymi co dziś)');
  // A3b — każda z 8 akcji: klik w strefę konsoli → dokładnie to wywołanie fasady
  const clickAll = (o) => {
    const r = drawDiplo('contact', o);
    globalThis.window.KOSMOS = r.world.K;
    silence(() => { for (const z of r.zones.filter((q) => ACTION_TYPES.includes(q.type))) r.ov._onHit(z); });
    return r.world.calls.map((c) => c.filter((v) => typeof v === 'string').join('|')).sort().join(',');
  };
  const cPeace = clickAll({ status: 'peace', envoy: true });
  const cWar = clickAll({ status: 'war' });
  const cSigned = clickAll({ status: 'peace', canRenew: true, treaties: [{ id: 'trade_agreement', signedYear: 2090 }, { id: 'non_aggression', signedYear: 2090 }] });
  const expPeace = [`declareWar|${E}|player_action`, `envoy|${E}|v1`, `proposeTreaty|${E}|trade_agreement`, `proposeTreaty|${E}|non_aggression`,
    `proposeTreaty|${E}|alliance`].sort().join(',');
  const expSigned = [`declareWar|${E}|player_action`, `setTrade|${E}`, `renewTreaty|${E}|non_aggression`, `proposeTreaty|${E}|alliance`].sort().join(',');
  assert(cPeace === expPeace && cWar === `offerPeace|${E}|player_action` && cSigned === expSigned,
    `A3b skutek 8 akcji: pokój [${cPeace}] · wojna [${cWar}] · podpisane [${cSigned}]`);
  const blk = on.zones.find((z) => z.type === 'action_blocked');
  const before = on.world.calls.length;
  safe(() => on.ov._onHit(blk));
  assert(blk && on.world.calls.length === before, 'A4 klik w wyłączony czip (podpowiedź) nie ma skutku');
  const tip = drawDiplo('contact', { status: 'peace', hover: { type: 'action_blocked', y: blk?.y } });
  assert(tip.text.includes(blk?.data?.reason ?? '§'), 'A5 najechanie na wyłączony czip rysuje powód (podpowiedź)');
}

// ══ K — Finding 727 ══
console.log('\nK — Finding 727: czipy akcji nigdy pod klastrem zegara');
{
  const isect = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  for (const [iw, ih] of [[1600, 1041], [1280, 833]]) {
    const vp = safe(() => CL.uiViewport(iw, ih), { W, H });
    const clock = safe(() => CL.consoleClockRect(vp.W, vp.H, CPD.NAV_GROUPS.length));
    const d = drawDiplo('contact', { W: vp.W, H: vp.H, status: 'war' });
    const chipsD = d.zones.filter((z) => ACTION_TYPES.includes(z.type) || z.type === 'action_blocked');
    const insp = d.ov.consoleZones?.inspector;
    const bounds = d.ov._getOverlayBounds(vp.W, vp.H);
    const noRes = safe(() => CL.consoleZones(bounds, { stripH: 0 }));
    const witness = !!clock && !!insp && clock.x < insp.x + insp.w && clock.x + clock.w > insp.x && noRes && noRes.inspector.y + noRes.inspector.h > clock.y;
    const ww = makeWorld('contact', { active: 'war', wars: [{ id: 'w1', aggressor: 'player', defender: E, active: true, startYear: 2100, exhaustion: { player: 10, [E]: 30 }, battles: [] }] });
    globalThis.window.KOSMOS = ww.K;
    const wo = new WO.WarOverlay(); wo.show();
    safe(() => wo.draw(recCtx().ctx, vp.W, vp.H));
    const chipsW = (wo._hitZones ?? []).filter((z) => z.type === 'offer_peace' || z.type === 'action_blocked');
    const all = [...chipsD, ...chipsW];
    assert(witness && chipsD.length === 6 && chipsW.length === 1 && all.every((r) => !isect(r, clock)),
      `K1 ${iw}×${ih}: ${all.length} czipów akcji poza rezerwą zegara (świadek: zegar w pasie inspektora, bez rezerwy strefa schodzi pod niego: ${witness})`);
  }
}

// ══ G — czipy grupy i pas subnav ══
console.log('\nG — czipy grupy [ DYPLOMACJA ] [ WYWIAD ] [ WOJNY ]');
{
  const d = drawDiplo('contact');
  const tabs = d.zones.filter((z) => z.type === 'tab').map((z) => z.data?.id);
  safe(() => d.ov._onHit(d.zones.find((z) => z.type === 'tab' && z.data?.id === 'war')));
  safe(() => d.ov._onHit(d.zones.find((z) => z.type === 'tab' && z.data?.id === 'diplomacy')));
  assert(tabs.join(',') === 'diplomacy,intel,war' && d.world.opened.join(',') === 'war',
    `G1 Dyplomacja: czipy ${tabs}; klik WOJNY → openPanel(war), klik aktywnego — nic (${d.world.opened})`);
  const ww = makeWorld('contact', { active: 'war', wars: [] });
  globalThis.window.KOSMOS = ww.K;
  const wo = new WO.WarOverlay(); wo.show();
  safe(() => wo.draw(recCtx().ctx, W, H));
  const wt = (wo._hitZones ?? []).filter((z) => z.type === 'tab');
  safe(() => wo._onHit(wt.find((z) => z.data?.id === 'intel')));
  assert(wt.map((z) => z.data?.id).join(',') === 'diplomacy,intel,war' && ww.opened.join(',') === 'intel',
    `G2 Wojny: czipy grupy; klik WYWIAD → openPanel(intel) (${ww.opened})`);
  const sub = (active) => {
    globalThis.window.KOSMOS = { overlayManager: { active } };
    const r = recCtx();
    safe(() => CPD.drawSubNav(r.ctx, W, active));
    return { h: safe(() => CPD.getSubNavHeight()), hit: safe(() => CPD.hitTestSubNav(10, 60, W, active)), drew: r.fills.length + r.texts.length };
  };
  const sD = sub('diplomacy'), sW = sub('war');
  assert(sD.h === 0 && sD.hit === null && !sD.drew && sW.h === 0 && sW.hit === null && !sW.drew,
    'G3 pas subnav nad Dyplomacją i Wojnami: wysokość 0, bez trafień, nic nie rysuje (cała grupa na czipach)');
  F.consoleKit = false;
  const kD = sub('diplomacy'), kI = sub('intel'), kX = sub('tech');
  F.consoleKit = savedKit;
  assert(kD.h === 0 && kD.hit === null && !kD.drew && kI.h === 0 && !kI.drew && kX.h > 0 && kX.drew,
    `G4 trwałość: bez consoleKit pas subnav nad Dyplomacją i Wywiadem nadal 0 (świadek: nad tech pas jest, wys. ${kX.h})`);
  assert(safe(() => CL.isKitScreen('diplomacy', {})) === true && safe(() => CL.isKitScreen('intel', {})) === true
    && safe(() => CL.isKitScreen('war', { consoleKit: false })) === true
    && !('consoleDiplomacy' in F) && !('consoleIntel' in F)
    && safe(() => CL.isKitScreen('tech', {})) === false && safe(() => CL.isKitScreen('observatory', { consoleKit: true })) === false,
    'G5 isKitScreen trwały: diplomacy / intel / war bez flag i bez consoleKit; flag consoleDiplomacy / consoleIntel nie ma (świadek: grupa Nauki — tech / observatory — nie)');
}

// ══ W — Wojny ══
console.log('\nW — Wojny: lista, bohater, stół, Finding 735 i 725');
{
  const wars = [
    { id: 'w_old', aggressor: E2, defender: 'player', active: false, startYear: 2080, endYear: 2090, exhaustion: { player: 50, [E2]: 60 }, battles: [] },
    { id: 'w_new', aggressor: 'player', defender: E, active: true, startYear: 2104, exhaustion: { player: 20, [E]: 45 }, battles: ['bt1'],
      casusBelli: 'border_incident' },
    { id: 'w_mid', aggressor: E3, defender: 'player', active: true, startYear: 2100, exhaustion: { player: 5, [E3]: 6 }, battles: [] },
  ];
  const battles = { bt1: { winner: 'B', year: 2106, lossesA: 3, lossesB: 1, turns: 4 } };
  const drawWar = (o = {}) => {
    const world = makeWorld('contact', { active: 'war', wars: o.wars ?? wars, battles, peaceCd: o.peaceCd ?? 0, ...o });
    globalThis.window.KOSMOS = world.K;
    const ov = new WO.WarOverlay(); ov.show(o.showOpts ?? {});
    if (o.sel) ov._selectedId = o.sel;
    if (o.mode !== undefined) ov._heroMode = o.mode;
    if (o.pick) for (const b of o.pick) ov._selected.add(b);
    const r = recCtx();
    safe(() => ov.draw(r.ctx, W, H));
    return { ov, world, text: r.texts.join('\n'), zones: ov._hitZones ?? [] };
  };
  const order = safe(() => WCL.warEntries(wars).map((w) => w.id).join(','), '');
  const onL = drawWar();
  const listIds = onL.zones.filter((z) => z.type === 'select').map((z) => z.data?.warId).join(',');
  assert(order === 'w_new,w_mid,w_old' && listIds === order, `W1 lista: aktywne najpierw, od najnowszej (${listIds})`);
  const yrs = safe(() => [WCL.warYears(wars[1], 2110), WCL.warYears(wars[0], 2110)].join('/'), '');
  const tug = safe(() => [WCL.tugOfWar(20, 45).edge, WCL.tugOfWar(45, 20).edge, WCL.tugOfWar(30, 32).edge].join('/'), '');
  assert(yrs === '6/10' && tug === 'you/them/even', `W2 lata wojny (aktywna do teraz, zakończona do końca: ${yrs}); lina (${tug})`);
  // tryb bohatera
  const st = drawWar({ sel: 'w_new' });
  const tb = drawWar({ sel: 'w_new', mode: 'table' });
  const auto = drawWar({ sel: 'w_new', pick: ['b1'] });
  const cp = drawWar({ showOpts: { warId: 'w_new' } });
  const has = (r, ty) => r.zones.some((z) => z.type === ty);
  assert(!has(st, 'peace_toggle') && st.text.includes(t('warConsole.edgeYou')) && has(tb, 'peace_toggle') && has(auto, 'peace_toggle') && has(cp, 'peace_toggle'),
    'W3 bohater: lina bez warunków; stół po wyborze [ STÓŁ POKOJU ], gdy na stole są warunki, i po depeszy „Kontrpropozycja” (show z warId)');
  const hm = st.zones.find((z) => z.type === 'hero_mode' && z.data?.mode === 'table');
  safe(() => st.ov._onHit(hm));
  const sw = st.ov._heroMode;
  safe(() => st.ov._onHit({ type: 'select', data: { warId: 'w_mid' } }));
  assert(sw === 'table' && st.ov._heroMode === null, 'W4 czip trybu przełącza bohatera; zmiana wojny przywraca tryb automatyczny');
  // dokładny inwentarz stref stołu (konsola — jedyna ścieżka; dźwigni debug nie ma)
  const on = drawWar({ sel: 'w_new', pick: ['b1'] });
  const types = (r) => [...new Set(r.zones.map((z) => z.type))].sort().join(',');
  const TABLE_TYPES = 'close,hero_mode,offer_peace,peace_bg,peace_clear,peace_toggle,reparations_toggle,select,tab';
  assert(types(on) === TABLE_TYPES, `W5 typy stref stołu: dokładnie [${types(on)}]`);
  const tg = (bid) => on.zones.find((z) => z.type === 'peace_toggle' && z.data?.bodyId === bid);
  assert(JSON.stringify(tg('b2')?.data) === JSON.stringify({ bodyId: 'b2', isOffer: true, empireId: E })
    && JSON.stringify(tg('b1')?.data) === JSON.stringify({ bodyId: 'b1', isOffer: false, empireId: E }) && !tg('b3'),
    'W6 wiersz stołu: dane strefy { bodyId, isOffer, empireId } (żądanie / oferta); ciało domowe bez strefy');
  // pokój: blokada po odmowie
  const cd = drawWar({ sel: 'w_new', peaceCd: 2 });
  const cdBlk = cd.zones.filter((z) => z.type === 'action_blocked');
  const op = on.zones.filter((z) => z.type === 'offer_peace');
  assert(!has(cd, 'offer_peace') && cdBlk.length === 1 && cdBlk[0].data?.action === 'offer_peace'
    && cdBlk[0].data?.reason === t('warConsole.reason.peaceCooldown', 2) && op.length === 1 && op[0].data?.empireId === E,
    'W7 [ ZAPROPONUJ POKÓJ ]: blokada po odmowie — bez strefy akcji, podpowiedź z powodem i latami; bez blokady — strefa na przeciwnika');
  // Finding 735 — dźwignie debug tylko w konsoli deweloperskiej
  const empty = drawWar({ wars: [] });
  const leverTxt = /WYMUŚ|FORCE (BATTLE|INVASION)|\(debug/;
  const allWar = [st, tb, auto, cp, on, cd, empty];
  const onAll = allWar.every((r) => r.zones.length > 0 && !has(r, 'force_battle') && !has(r, 'force_invasion') && !leverTxt.test(r.text));
  assert(onAll, 'W8 Finding 735: żaden stan Wojen (lina, stół, auto-stół, kontrpropozycja, blokada, pusty) nie ma stref ani napisów dźwigni debug');
  const wsrc = safe(() => src('../../ui/WarOverlay.js'), '');
  const caseOf = (re) => re.test(wsrc);
  assert(!caseOf(/case '(force_battle|force_invasion)'/) && caseOf(/case '(offer_peace)'/) && caseOf(/case '(peace_toggle)'/)
    && typeof WCL?.forceWarBattle === 'function' && typeof WCL?.forceWarInvasion === 'function',
    'W9 WarOverlay._onHit bez gałęzi force_battle / force_invasion (świadek: gałęzie offer_peace / peace_toggle czytane); dźwignie żyją w WarConsoleLogic');
  const helpers = safe(() => WD.warDebugHelpers({ getUIManager: () => ({ overlayManager: { overlays: { war: on.ov } } }) }));
  globalThis.window.KOSMOS = on.world.K;   // dźwignia czyta świat w chwili wywołania
  const before = on.world.calls.length;
  const rb = silence(() => safe(() => helpers.war.forceBattle()));
  const ri = silence(() => safe(() => helpers.war.forceInvasion()));
  const dbgCalls = on.world.calls.slice(before).filter((c) => c[0] === 'forceBattle' || c[0] === 'launchInvasion').map((c) => c.join('|'));
  assert(dbgCalls.join(',') === `forceBattle|w_new,launchInvasion|${E}|planet_home|3` && rb?.warId === 'w_new' && ri?.empireId === E,
    `W10 KOSMOS.debug.war.forceBattle() / forceInvasion() na zaznaczonej wojnie: bitwa tej wojny, desant przeciwnika na planecie domowej (${dbgCalls})`);
  const tgt = safe(() => WCL.debugWarTarget(null, on.world.K.warSystem));
  const ended = safe(() => WCL.debugWarTarget('w_old', on.world.K.warSystem));
  assert(tgt?.war?.id === 'w_new' && tgt.via === 'first_active' && ended?.war === null && ended.reason === 'war_not_active',
    'W11 bez zaznaczenia — pierwsza aktywna wojna; zaznaczona zakończona — odmowa war_not_active');
  const dsrc = safe(() => src('../../debug/WarDebug.js'), '');
  const lsrc = safe(() => src('../../ui/WarConsoleLogic.js'), '');
  assert(!/forceBattle\(|launchInvasion\(|forceWar(Battle|Invasion)\(/.test(wsrc)
    && /import \{[^}]*forceWarBattle[^}]*forceWarInvasion[^}]*\} from '\.\.\/ui\/WarConsoleLogic\.js'/.test(dsrc)
    && /ws\.forceBattle\(/.test(lsrc) && /launchInvasion\(/.test(lsrc),
    'W12 jedna kopia kodu dźwigni: WarConsoleLogic (świadek: woła forceBattle / launchInvasion), WarDebug ją importuje, WarOverlay — żadnej');
  // Finding 725
  assert(!wsrc.includes("'Casus Belli'") && PL['warOverlay.casusBelli'] === 'Casus Belli' && EN['warOverlay.casusBelli'],
    'W13 Finding 725: „Casus Belli” przez t() (klucz PL/EN, polski tekst bez zmian)');
  assert(!empty.text.includes('Casus Belli'.toUpperCase()), 'W14a ŚWIADEK: bez zaznaczonej wojny nagłówka Casus Belli nie ma (rysuje go inspektor wojny)');
  assert(on.text.includes('Casus Belli'.toUpperCase()), 'W14b konsola pokazuje nagłówek Casus Belli (eyebrow inspektora)');
  assert(empty.text.includes(t('warOverlay.noActiveWars')) && empty.zones.some((z) => z.type === 'tab') && !has(empty, 'offer_peace'),
    'W15 pusty stan: brak wojen — komunikat, czipy grupy, bez akcji');
  // K2 po oglądzie: tytuł bohatera = sama nazwa (nagłówek mówi WOJNY), długa nazwa zawijana do 2 linii; mini-mapa w trybie liny
  const longName = 'Wielka Zjednoczona Konfederacja Gwiazd Milczącego Pulsaru Północy i Wolnych Rubieży Zewnętrznego Ramienia Galaktyki';
  const lt = drawWar({ sel: 'w_new', empName: longName });
  const titleLines = longName.split(' ').length;
  const shownWords = longName.split(' ').filter((w) => lt.text.split('\n').some((l) => l.split(' ').includes(w)));
  assert(!lt.text.includes(`Wojna — ${longName}`) && !lt.text.split('\n').some((l) => l.startsWith('Wojna —'))
    && shownWords.length >= Math.min(titleLines, 5) && !lt.text.split('\n').includes(longName),
    `W16 tytuł bohatera bez prefiksu „Wojna —”; długa nazwa w więcej niż jednej linii (widoczne słowa ${shownWords.length}/${titleLines})`);
  const mp = drawWar({ sel: 'w_new' });
  assert(mp.text.includes(TOK.sysA) && mp.text.includes(t('intel.console.map').toUpperCase()) && !mp.text.includes(TOK.secret),
    'W17 tryb liny: mini-mapa ze znanymi układami przeciwnika (ta sama mgła — układ spoza listy znanych nigdy)');
  const mt = drawWar({ sel: 'w_new', mode: 'table' });
  assert(!mt.text.includes(TOK.sysA), 'W18 KONTROLA: tryb stołu bez mini-mapy (mapa tylko w pustej dolnej części liny)');
}

// ══ S — wejście i geometria ══
console.log('\nS — wejście bez window.inner*, geometria ze stref');
{
  const d = drawDiplo('contact');
  const lr = d.ov._consoleListRect;
  const s0 = d.ov._scrollLeft;
  const inList = safe(() => d.ov.handleScroll(100, lr.x + 5, lr.y + 5));
  const f = d.ov.consoleZones?.frame ?? { x: 0, y: 0, w: 0, h: 0 };
  const outside = safe(() => d.ov.handleScroll(100, f.x + f.w + 50, f.y + 5));
  assert(inList === true && outside === false && d.ov._scrollLeft >= s0, 'S1 kółko w konsoli Dyplomacji przechwycone w ramie, poza nią nie');
  const branch = (file) => {
    const s = safe(() => src(file), '');
    const i = s.indexOf('handleScroll(');
    const b = i >= 0 ? s.slice(i) : '';
    return b.includes('consoleZones') && !/window\.inner/.test(b);
  };
  assert(branch('../../ui/DiplomacyOverlay.js') && branch('../../ui/WarOverlay.js'),
    'S2 handleScroll obu ekranów bez window.inner* (świadek: metoda znaleziona — czyta consoleZones)');
  const z = d.ov.consoleZones;
  const inside = (r, zz) => r.x >= zz.x - 0.5 && r.y >= zz.y - 0.5 && r.x + r.w <= zz.x + zz.w + 0.5 && r.y + r.h <= zz.y + zz.h + 0.5;
  const chips = d.zones.filter((q) => ACTION_TYPES.includes(q.type) || q.type === 'action_blocked');
  const rows = d.zones.filter((q) => q.type === 'select');
  assert(chips.length === 6 && chips.every((r) => inside(r, z.inspector)) && rows.length && rows.every((r) => inside(r, z.list)),
    'S3 czipy akcji w strefie inspektora, wiersze w strefie listy (geometria z consoleZones)');
  const ult = drawDiplo('contact', { ultimatum: true });
  const fl = drawDiplo('contact', { flash: true });
  assert(ult.ov.consoleZones?.strip && ult.text.includes(t('diplo.ultimatumWarn', '1.5')) && fl.ov.consoleZones?.strip && fl.text.includes('FlashSentinel')
    && !d.ov.consoleZones?.strip, 'S4 pas: ultimatum i komunikat akcji — tylko gdy są (bez nich pasa nie ma)');
}

F.consoleKit = savedKit;
console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
if (fail) process.exitCode = 1;
