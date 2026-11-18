// ARC KONSOLE K0b — keeper konsoli Wywiadu (docs/design/CONSOLES_PLAN.md §6.1 K0b, D-K-1, D-K-6, D-K-17, Finding 725).
//
// L — logika wspólnej listy imperiów (sortowanie, domyślne zaznaczenie, mgła wiersza, odsłonięcie zaznaczonego, przewijanie).
// F — MGŁA WOJNY (twarda reguła; KZ: ścieżka konsoli jedyna — dawne porównanie z ekranem sprzed konsoli zastąpione pinami
//     absolutnymi): dla każdego poziomu wywiadu DOKŁADNY zbiór odsłoniętych wartowników (tekst z `fillText`), dokładny zbiór
//     typów stref i ładunki `select_empire`; poniżej `detailed` liczby wojska w rekordzie nie zmieniają rysunku; pusta lista
//     wywiadu — tylko nagłówek (tab, close) i podpowiedź „brak danych”.
// C — czipy podzakładek: kolejność grupy, klik = przełączenie overlayu (jak pas subnav), aktywny czip i [ x ]; Wywiad zawsze
//     na konsoli (bez flag, także przy `consoleKit: false`).
// S — trwałość (KZ): Dyplomacja / Wywiad / Wojny w `PERMANENT_KIT_SCREENS` — ekran zestawu bez flag, `consoleIntel` /
//     `consoleDiplomacy` nie ma w FEATURES; pas subnav nad nimi nie rysowany / nie trafiany / bez wysokości; świadek: grupa
//     bez zestawu (Technologie) ma pas.
// P — pasek walki w gnieździe nagłówka tylko nad ekranem zestawu (metoda `UIManager._combatStripInsets` wykonana z wyciągu źródła).
// W — wejście bez `window.inner*`: kółko w konsoli czyta strefy ostatniej klatki; przewija tylko nad prostokątem listy.
// I — Finding 725: trzy napisy przez t(), polski tekst bez zmian (rysowane przez konsolę).
// R — poprawki po oglądzie właściciela: role konsoli (C, `DIM_LIFT`), poświata (A, `HALO_BLUR`) zawsze na konsoli (0 — bez
//     cienia); inspektor „AKTA” bez dublowania siły z bohatera; mini-mapa — wyłącznie znane układy dossier + układy gracza (mgła, układ-sekret).
// M — K0b-1 czytelność mini-mapy: stolica gracza i znana stolica imperium (mgła: nieodsłonięta stolica nigdy nie oznaczona),
//     linia odległości tylko przy znanej stolicy, scalanie bliskich znaczników bez odsłaniania, auto-kadr z minimalną
//     rozpiętością, podziałka, podpisy regułą mapy galaktyki z priorytetem stolice > własne > ich.
//
// Bez pinów na stałych rysowania. Moduły jeszcze nieistniejące importowane dynamicznie (pin degraduje, nie przerywa).
// KZ — usunięte piny ścieżki OFF: C5 (OFF = dawny Wywiad), S1/S3 części „bez consoleIntel — nie / pas wraca”, P4 „flaga OFF”,
// I3 (OFF rysuje napisy), R4 (OFF bez cienia), R5 część OFF; zastąpione świadkami trwałości i rysunkiem konsoli.
// KZ-Command — świadek S1 „fleet za flagą” zastąpiony grupą Nauki (tech / observatory, nigdy ekran zestawu): Dowództwo jest trwałe.

import '../headless/env.js';
import { readFileSync } from 'node:fs';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { THEME } from '../../config/ThemeConfig.js';
import { resolveHudRoles } from '../../ui/HudPalette.js';
import { ARCHETYPES } from '../../data/EmpireData.js';
import { setLocale, t, getName, getDesc } from '../../i18n/i18n.js';
import PL from '../../i18n/pl.js';
import EN from '../../i18n/en.js';

const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const EL = await tryImport('../../ui/EmpireListLogic.js');
const CEL = await tryImport('../../ui/ConsoleEmpireList.js');
const KIT = await tryImport('../../ui/ConsoleKit.js');
const CL = await tryImport('../../ui/ConsoleLayoutLogic.js');
const CPD = await tryImport('../../ui/CivPanelDrawer.js');
const CSL = await tryImport('../../ui/CombatStripLogic.js');
const IO = await tryImport('../../ui/IntelOverlay.js');
const CR = await tryImport('../../ui/ConsoleRolesLogic.js');

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const safe = (fn, d = null) => { try { return fn(); } catch (e) { console.log('  ! ' + e.message); return d; } };
setLocale('pl');
const F = GAME_CONFIG.FEATURES;
const savedFlags = { consoleKit: F.consoleKit };
// KZ: Wywiad bez flagi — `consoleKit` steruje już tylko sceną za tekstem; `kit` false sprawdza, że ekran tego nie czyta.
const setKit = (kit = true) => { F.consoleKit = kit; };

// ── atrapa płótna: tekst + wypełnienia z bieżącym kolorem ──
// Cyfry w kratce (`drawTabular`) idą po jednym glifie na wywołanie — kolejne wywołania na tej samej linii bazowej sklejane są
// w jeden napis (`texts`), żeby liczba była jednym żetonem.
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
      if (k === 'arc') return (x, y, r) => fills.push({ x, y, w: r, h: -1, style: o.fillStyle });
      if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (k in o) return o[k];
      return () => {};
    },
    set: (o, k, v) => { o[k] = v; return true; },
  });
  return { ctx, texts, fills };
}

// ── dane-wartowniki (jedno obce imperium) ──
const E = 'emp_sentinel';
const ARCH = ARCHETYPES.xenophage;
const TOK = {
  name: 'ZetaSentinelEmpire',
  archName: getName(ARCH),
  archDesc: String(getDesc(ARCH)).split(/\s+/).slice(0, 2).join(' '),
  sysA: 'SentinelPrime', sysB: 'SentinelBeta',
  military: '4321', reserve: '777', armed: '613', limit: '929',
  incident: 'incSentinelX', year: '2111',
  capital: t('intel.capital'),
  secret: 'SecretSentinel',   // układ imperium spoza listy znanych systemów — nie może się pojawić nigdzie
};
const MINE_STRENGTH = 1234;
// `mil` — liczby wojskowe W REKORDZIE niezależnie od poziomu (np. zostały po spadku z `detailed`): bramka rangi musi je ukryć.
function kosmosFor(level, { opened = [], mil = true, empHome = 'sys_sent_a', secretAt = null, extraMine = [], colonies = ['sys_sent_a', 'sys_sent_b'],
  incidents = [{ year: 2111, type: 'incSentinelX' }], empty = false } = {}) {
  const rec = {
    level,
    knownColonies: colonies,
    knownMilitary: mil ? 4321 : null,
    knownReserve: mil ? 777 : null,
    knownArmedHulls: mil ? 613 : null,
    knownFleetLimit: mil ? 929 : null,
    lastIncidents: incidents,
  };
  const intel = empty ? {} : { [E]: rec };
  return {
    civMode: true,
    gameState: { get: (p) => (p === 'intel' ? intel : p.startsWith('intel.') ? intel[p.slice(6)] : undefined) },
    empireRegistry: { get: (id) => (id === E ? { id: E, name: TOK.name, archetype: 'xenophage', homeSystemId: empHome,
      colonies: ['col_secret'] } : null) },
    galaxyData: { systems: [{ id: 'sys_home', name: 'HomeStar', x: 0, y: 0 }, { id: 'sys_sent_a', name: TOK.sysA, x: 40, y: 10 },
      { id: 'sys_sent_b', name: TOK.sysB, x: 55, y: -20 }, { id: 'sys_secret', name: TOK.secret, x: secretAt?.x ?? 70, y: secretAt?.y ?? 30 }, ...extraMine] },
    threatAssessment: { getPlayerStrength: () => MINE_STRENGTH },
    colonyManager: { getPlayerColonies: () => [{ systemId: 'sys_home' }, ...extraMine.map((m) => ({ systemId: m.id }))] },
    overlayManager: { active: 'intel', openPanel: (id) => opened.push(id) },
  };
}
const W = 1280, H = 833;
function drawIntel(level, { mil = true, kit = true, ...more } = {}) {
  setKit(kit);
  const opened = [];
  globalThis.window.KOSMOS = kosmosFor(level, { opened, mil, ...more });
  const ov = new IO.IntelOverlay();
  ov.show();
  ov._selectedId = E;
  // K0b-1: podsłuch znaczników mini-mapy (metoda nieistniejąca na bazie → pusta lista, pin czerwony)
  const markers = [];
  const own = IO?.IntelOverlay?.prototype?._drawMapMarker;
  if (typeof own === 'function') ov._drawMapMarker = function (c, m, ro) { markers.push(m); return own.call(this, c, m, ro); };
  const r = recCtx();
  safe(() => ov.draw(r.ctx, W, H));
  return { ov, ...r, opened, markers, text: r.texts.join('\n') };
}

const savedK = globalThis.window.KOSMOS;
try {
  // ══ L — logika listy ══
  console.log('\nL — wspólna lista imperiów (EmpireListLogic + ConsoleEmpireList)');
  {
    const m = { b: { level: 'rumor' }, a: { level: 'detailed' }, c: { level: 'unknown' }, d: { level: 'detailed' } };
    const order = safe(() => EL.sortIntelEntries(m).map(([id]) => id), []);
    assert(JSON.stringify(order) === '["a","d","b","c"]', `L1 sortowanie: ranga malejąco, w randze po id (${JSON.stringify(order)})`);
    const s0 = safe(() => EL.defaultIntelSelection({ x: { level: 'unknown' }, y: { level: 'rumor' } }, null));
    const s1 = safe(() => EL.defaultIntelSelection({ y: { level: 'rumor' } }, 'keep'));
    const s2 = safe(() => EL.defaultIntelSelection({ x: { level: 'unknown' } }, null), 'x');
    assert(s0 === 'y' && s1 === 'keep' && s2 === null, `L2 domyślne zaznaczenie: pierwsze ≥ rumor (${s0}), bieżące zostaje (${s1}), brak znanych → null (${s2})`);
    const emp = { name: 'Foo' };
    const v = (lv) => safe(() => EL.empireRowView({ empireId: 'e', level: lv, emp, arch: ARCH, archName: getName }), {});
    const masked = ['unknown', 'rumor'].every((lv) => v(lv).name === '???' && v(lv).archName === null && v(lv).archColor === null);
    const shown = ['contact', 'detailed'].every((lv) => v(lv).name === 'Foo' && v(lv).archName === getName(ARCH) && !!v(lv).archColor);
    assert(masked && shown, 'L3 mgła wiersza: poniżej kontaktu „???” bez archetypu i barwy; od kontaktu nazwa + archetyp (świadek)');
    const RH = CEL?.EMPIRE_ROW_H ?? 0;
    const rows = Array.from({ length: 20 }, (_, i) => ({ id: `e${i}` }));
    const down = safe(() => CEL.revealEmpire(rows, 'e15', 0, 5 * RH), -1);
    const up = safe(() => CEL.revealEmpire(rows, 'e2', 10 * RH, 5 * RH), -1);
    const stay = safe(() => CEL.revealEmpire(rows, 'e3', 0, 5 * RH), -1);
    assert(RH > 0 && down === 16 * RH - 5 * RH && up === 2 * RH && stay === 0,
      `L4 odsłonięcie zaznaczonego: poniżej widoku → dół wiersza w widoku (${down}), powyżej → góra (${up}), widoczny → bez zmian (${stay})`);
    const roles = resolveHudRoles(THEME);
    const r = recCtx();
    const res = safe(() => CEL.drawEmpireList(r.ctx, { x: 0, y: 0, w: 280, h: 5 * RH }, rows.map((x) => ({ ...x, name: x.id, levelKey: 'k', levelTone: 'dim' })),
      roles, { selectedId: 'e1', scroll: 99999, levelLabel: () => 'L' }), null);
    assert(!!res && res.contentH === 20 * RH && res.scroll === 15 * RH && res.zones.every((z) => z.type === 'row') && res.zones.length >= 5,
      `L5 przewijanie: treść ${res?.contentH} = 20 wierszy, klamra ${res?.scroll} = treść − widok; strefy 'row' tylko w widoku (${res?.zones?.length})`);
    const kitPlain = recCtx();
    const plain = safe(() => KIT.drawList(kitPlain.ctx, { x: 0, y: 0, w: 200, h: 100 }, [{ id: 'a', label: 'A' }], roles, {}), null);
    assert(plain?.contentH === (KIT?.CONSOLE_KIT?.ROW_H ?? -1), `L6 KONTROLA: drawList bez rowH — wiersz ROW_H jak w K0a (${plain?.contentH})`);
  }

  // ══ F — mgła wojny ══
  console.log('\nF — mgła wojny: dokładnie te pola, które odsłania poziom wywiadu (konsola, te same dane)');
  {
    const sig = (p) => JSON.stringify({ t: p.texts, f: p.fills.map((f) => [f.x, f.y, f.w, f.h, f.style]) });
    const types = (p) => [...new Set(p.ov._hitZones.map((z) => z.type))].sort().join(',');
    // Zbiory zmierzone na dzisiejszej (jedynej) ścieżce konsoli — równe zbiorom dawnego ekranu (dawne F ⊆ było zielone).
    const EXPECT = {
      unknown:  ['sysA', 'sysB'],
      rumor:    ['sysA', 'sysB'],
      contact:  ['name', 'archName', 'archDesc', 'sysA', 'sysB', 'incident', 'year'],
      detailed: ['name', 'archName', 'archDesc', 'sysA', 'sysB', 'military', 'reserve', 'armed', 'limit', 'incident', 'year'],
    };
    for (const level of ['unknown', 'rumor', 'contact', 'detailed']) {
      const p = drawIntel(level);
      const revealed = Object.entries(TOK).filter(([, s]) => p.text.includes(s)).map(([k]) => k);
      const sel = JSON.stringify(p.ov._hitZones.filter((z) => z.type === 'select_empire').map((z) => z.data));
      // Nic pochodnego z ukrytych danych: poniżej `detailed` obecność liczb wojskowych w rekordzie nie zmienia ANI tekstu, ANI
      // wypełnień (paski par, paski siły) — rysunek z danymi i bez nich identyczny.
      const noDerived = level === 'detailed' || sig(p) === sig(drawIntel(level, { mil: false }));
      assert(revealed.join(',') === EXPECT[level].join(',') && types(p) === 'close,select_empire,tab' && sel === JSON.stringify([{ empireId: E }]) && noDerived,
        `F-${level}: odsłania dokładnie [${revealed.join(',')}]; strefy {${types(p)}}, select_empire ${sel}`
        + `${level === 'detailed' ? '' : `; ukryte liczby wojska nie zmieniają rysunku (${noDerived})`}`);
    }
    const none = drawIntel('detailed', { empty: true });
    const unsel = drawIntel('detailed');
    unsel.ov._selectedId = null;
    const r2 = recCtx();
    safe(() => unsel.ov.draw(r2.ctx, W, H));
    const unselText = r2.texts.join('\n');
    assert(types(none) === 'close,tab' && none.text.includes(t('intel.noData')) && none.text.includes(t('intel.selectEmpire'))
      && types(unsel) === 'close,select_empire,tab' && unselText.includes(t('intel.selectEmpire')) && unselText.includes(TOK.name)
      && !unselText.includes(TOK.sysA) && !unselText.includes(TOK.military) && !unselText.includes(TOK.incident),
      `F-puste: bez wpisów wywiadu strefy {${types(none)}} + „brak danych”; bez zaznaczenia — wiersz listy (nazwa) jest, bohater „wybierz imperium”, bez dossier (systemy, wojsko, incydenty)`);
    const detMil = drawIntel('detailed'), detNo = drawIntel('detailed', { mil: false });
    assert(sig(detMil) !== sig(detNo), 'F-KONTROLA porównania: na „detailed” liczby wojska zmieniają rysunek (porównanie potrafi być czerwone)');
    const det = drawIntel('detailed');
    const need = ['name', 'archName', 'military', 'reserve', 'armed', 'limit', 'incident', 'sysA'];
    const miss = need.filter((k) => !det.text.includes(TOK[k]));
    assert(miss.length === 0, `F-KONTROLA (przyrząd): na „detailed” ekran odsłania nazwę, archetyp, liczby wojska, incydent, systemy (brak: [${miss.join(',')}])`);
    const con = drawIntel('contact');
    assert(con.text.includes(TOK.name) && !con.text.includes(TOK.military) && con.text.includes('???'),
      'F-KONTROLA contact: nazwa tak, liczby wojska nie, maska „???” stoi (próg `detailed`)');
    const rum = drawIntel('rumor');
    assert(!rum.text.includes(TOK.name) && !rum.text.includes(TOK.incident) && rum.text.includes(TOK.sysA),
      'F-KONTROLA rumor: nazwa i incydenty zamaskowane; znane systemy widać jak dziś');
  }

  // ══ C — czipy podzakładek ══
  console.log('\nC — czipy podzakładek w nagłówku');
  {
    const p = drawIntel('detailed');
    const tabs = p.ov._hitZones.filter((z) => z.type === 'tab');
    const ids = tabs.map((z) => z.data.id);
    assert(JSON.stringify(ids) === '["diplomacy","intel","war"]', `C1 czipy w kolejności grupy (${JSON.stringify(ids)})`);
    const lbl = [t('civPanel.diplomacy'), t('civPanel.intel'), t('civPanel.war')].map((s) => `[ ${s.toUpperCase()} ]`);
    assert(lbl.every((s) => p.text.includes(s)), `C2 etykiety czipów ${lbl.join(' ')}`);
    const at = (z) => [z.x + z.w / 2, z.y + z.h / 2];
    const war = tabs.find((z) => z.data.id === 'war'), me = tabs.find((z) => z.data.id === 'intel');
    safe(() => p.ov.handleClick(...at(war)));
    safe(() => p.ov.handleClick(...at(me)));
    assert(JSON.stringify(p.opened) === '["war"]', `C3 klik czipu „Wojny” → openPanel('war'); klik aktywnego — nic (${JSON.stringify(p.opened)})`);
    const close = p.ov._hitZones.find((z) => z.type === 'close');
    const rowZ = p.ov._hitZones.find((z) => z.type === 'select_empire');
    p.ov._selectedId = null;
    safe(() => p.ov.handleClick(...at(rowZ)));
    const selOk = p.ov._selectedId === E;
    safe(() => p.ov.handleClick(...at(close)));
    assert(!!close && selOk && p.ov.visible === false, `C4 KONTROLA: klik wiersza zaznacza imperium (${selOk}); [ x ] zamyka (${!p.ov.visible})`);
    // KZ (dawne C5 „flaga OFF — dawny Wywiad” usunięte): przy `consoleKit: false` Wywiad to nadal konsola z czipami
    const noKit = drawIntel('detailed', { kit: false });
    const noKitTabs = noKit.ov._hitZones.filter((z) => z.type === 'tab').map((z) => z.data.id);
    assert(JSON.stringify(noKitTabs) === '["diplomacy","intel","war"]' && noKit.ov.consoleZones?.frame && !('consoleIntel' in F)
      && noKit.text.includes(t('intel.console.file').toUpperCase()),
      `C5 trwałość: bez flag (consoleKit false) — ta sama konsola (czipy ${JSON.stringify(noKitTabs)}, strefy konsoli, AKTA); consoleIntel nie ma w FEATURES`);
  }

  // ══ S — pas subnav ══
  console.log('\nS — trwałość ekranów zestawu i pas subnav');
  {
    const isK = (id, f) => safe(() => CL.isKitScreen(id, f), null);
    const GROUP = ['diplomacy', 'intel', 'war'];
    const perm = GROUP.every((id) => CL?.PERMANENT_KIT_SCREENS?.includes(id) && isK(id, {}) === true && isK(id, { consoleKit: false }) === true && isK(id, undefined) === true);
    // świadkowie (KZ-Command: Dowództwo też trwałe — świadkiem jest grupa Nauki): predykat nie jest stały — Technologie /
    // Obserwatorium nigdy nie są ekranem zestawu (bez flag i z dowolnymi flagami), Wywiad tak
    const anyOn = { consoleKit: true, consoleTech: true, consoleObservatory: true };
    const witness = ['tech', 'observatory'].every((id) => isK(id, {}) === false && isK(id, anyOn) === false);
    assert(perm && witness && !('consoleIntel' in F) && !('consoleDiplomacy' in F),
      'S1 isKitScreen: Dyplomacja / Wywiad / Wojny zawsze (bez flag, consoleKit false); flag consoleIntel / consoleDiplomacy brak; świadek: tech / observatory — nigdy');
    const BAND_Y = 40;   // wnętrze pasa subnav (pod górną belką)
    const sub = (active, kit = true) => {
      setKit(kit);
      globalThis.window.KOSMOS = { overlayManager: { active } };
      const r = recCtx();
      safe(() => CPD.drawSubNav(r.ctx, W, active));
      return { h: safe(() => CPD.getSubNavHeight()), hit: safe(() => CPD.hitTestSubNav(10, BAND_Y, W, active)), drew: r.fills.length > 0 || r.texts.length > 0 };
    };
    const kits = [...GROUP.map((id) => sub(id, true)), ...GROUP.map((id) => sub(id, false))];
    const tech = sub('tech', false);
    assert(kits.every((k) => k.h === 0 && k.hit === null && !k.drew), `S2 Dyplomacja / Wywiad / Wojny (zestaw, także consoleKit false): wysokość 0, trafienie null, nic nie rysuje`);
    assert(tech.h > 0 && tech.drew && tech.hit !== null,
      `S3 świadek: grupa bez zestawu (Technologie) — pas rysowany, trafiany, wys. ${tech.h}`);
  }

  // ══ P — pasek walki w gnieździe nagłówka ══
  console.log('\nP — pasek walki w gnieździe nagłówka tylko nad ekranem zestawu');
  {
    const slot = { x: 900, y: 40, w: 280, h: 30 };
    const base = { left: 0, right: 0, top: 28, bottom: 62 };
    const ins = safe(() => CSL.combatSlotInsets(slot, W, base), null);
    const L = ins ? safe(() => CSL.stripLayout({ W, H, insets: ins, lines: 1, naturalW: 600 }), null) : null;
    const b = L?.block;
    assert(!!b && b.x >= slot.x && b.x + b.w <= slot.x + slot.w && b.y >= slot.y && b.y + b.h <= slot.y + slot.h,
      `P1 blok jednej linii mieści się w gnieździe (${JSON.stringify(b)} w ${JSON.stringify(slot)})`);
    assert(safe(() => CSL.combatSlotInsets(null, W, base)) === base, 'P2 bez gniazda — wcięcia bazowe bez zmian');
    const src = readFileSync(new URL('../../scenes/UIManager.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    const m = /\n  _combatStripInsets\(W\) \{\n([\s\S]*?)\n  \}\n/.exec(src);
    const call = /this\.combatStrip\.draw\(ctx, W, H, \{ insets: this\._combatStripInsets\(W\),/.test(src);
    let res = null;
    if (m && CL && CSL) {
      const fn = new Function('getMapInsets', 'isKitScreen', 'combatSlotInsets', 'GAME_CONFIG', 'window', `return function(W){${m[1]}};`);
      const run = (active, kit) => {
        setKit(kit);
        const win = { KOSMOS: {} };
        // `tech` (bez zestawu) też podaje gniazdo — wykluczenie sprawdza bramkę `isKitScreen`, nie brak stref
        const um = { overlayManager: { active, overlays: { intel: { consoleZones: { combatSlot: slot } }, diplomacy: { consoleZones: null },
          tech: { consoleZones: { combatSlot: slot } } } } };
        return fn(() => base, CL.isKitScreen, CSL.combatSlotInsets, GAME_CONFIG, win).call(um, W);
      };
      res = { kit: run('intel', true), kitNoFlag: run('intel', false), dip: run('diplomacy', true), tech: run('tech', true), map: run(null, true) };
    }
    const slotLeft = slot.x - (CSL?.COMBAT_STRIP?.SIDE_MARGIN ?? 0);
    assert(call && !!res && res.kit !== base && res.kit.left === slotLeft && res.kitNoFlag !== base && res.kitNoFlag.left === slotLeft,
      'P3 UIManager._combatStripInsets (wykonana z wyciągu): Wywiad → wcięcia gniazda także przy consoleKit false; wołana w draw paska');
    assert(!!res && res.dip === base && res.tech === base && res.map === base,
      'P4 Dyplomacja bez gniazda, Technologie (bez zestawu, z gniazdem) i mapa — wcięcia mapy (wykluczenie; świadek P3)');
  }

  // ══ W — wejście bez window.inner* ══
  console.log('\nW — kółko w konsoli z geometrii stref');
  {
    const p = drawIntel('detailed');
    const r = p.ov._consoleListRect ?? { x: -1e6, y: -1e6, w: 0, h: 0 };
    globalThis.window.innerWidth = 37; globalThis.window.innerHeight = 23;   // absurd: handler nie może ich czytać
    const s0 = p.ov._scrollLeft;
    const inList = safe(() => p.ov.handleScroll(100, r.x + 5, r.y + 5), null);
    const s1 = p.ov._scrollLeft;
    const f = p.ov.consoleZones?.frame ?? { x: 0, y: 0, w: 0, h: 0 };
    const outside = safe(() => p.ov.handleScroll(100, f.x + f.w + 50, f.y + 5), null);
    assert(inList === true && s1 > s0 && outside === false, `W1 kółko nad listą przewija (${s0} → ${s1}); poza konsolą — nie przechwycone (${outside})`);
    // KZ: handleScroll ma już tylko gałąź konsoli — cała metoda (bez komentarzy) czyta strefy, nigdy window.inner*
    const io = readFileSync(new URL('../../ui/IntelOverlay.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n').replace(/\/\/.*$/gm, '');
    const body = /\n  handleScroll\(delta, x, y\) \{\n([\s\S]*?)\n  \}\n/.exec(io)?.[1] ?? '';
    assert(body.length > 0 && /consoleZones/.test(body) && /_consoleListRect/.test(body) && !/window\.inner/.test(body),
      `W2 handleScroll czyta consoleZones + _consoleListRect, bez window.inner* (świadek: metoda znaleziona, ${body.length} zn.)`);
    // nad konsolą, ale poza listą (środek bohatera): kółko przechwycone, lista się nie przewija
    const hz = p.ov.consoleZones?.hero ?? { x: -1e6, y: -1e6, w: 0, h: 0 };
    const s2 = p.ov._scrollLeft;
    const inHero = safe(() => p.ov.handleScroll(100, hz.x + hz.w / 2, hz.y + hz.h / 2), null);
    assert(hz.w > 0 && inHero === true && p.ov._scrollLeft === s2, `W3 kółko nad bohaterem — przechwycone (${inHero}), lista bez zmian (${s2} → ${p.ov._scrollLeft})`);
  }

  // ══ I — Finding 725 ══
  console.log('\nI — Finding 725: napisy przez t()');
  {
    const io = readFileSync(new URL('../../ui/IntelOverlay.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n').replace(/\/\/.*$/gm, '');
    const lits = ["'  (wymaga skanu naziemnego)'", "'Ostatnie incydenty'", "'  (brak)'"];
    assert(lits.every((l) => !io.includes(l)), 'I1 trzech literałów nie ma w IntelOverlay');
    const keys = ['intel.needsGroundScan', 'intel.recentIncidents', 'intel.none'];
    assert(keys.every((k) => PL[k] && EN[k]) && PL['intel.needsGroundScan'] === '(wymaga skanu naziemnego)'
      && PL['intel.recentIncidents'] === 'Ostatnie incydenty' && PL['intel.none'] === '(brak)',
      'I2 klucze w PL i EN; polski tekst identyczny z dawnym');
    // KZ: dawna strona usunięta — te same napisy rysuje konsola (nagłówki sekcji wielkimi literami)
    const con = drawIntel('contact');
    const empty = drawIntel('contact', { colonies: [], incidents: [] });
    const brak = empty.texts.filter((x) => x === '(brak)').length;
    assert(con.text.includes('OSTATNIE INCYDENTY') && drawIntel('rumor').text.includes('(wymaga skanu naziemnego)') && brak === 2
      && con.texts.filter((x) => x === '(brak)').length === 0,
      `I3 konsola (PL) rysuje te napisy: nagłówek incydentów, „wymaga skanu” (rumor), „(brak)” dla pustych systemów i incydentów (${brak}×; świadek: przy danych 0×)`);
  }
  // ══ R — poprawki po oglądzie ══
  console.log('\nR — czytelność (C+A), inspektor AKTA, mini-mapa pod mgłą');
  {
    const base = resolveHudRoles(THEME);
    const lifted = safe(() => CR.consoleRoles(THEME, 0.35), null);
    const flat = safe(() => CR.consoleRoles(THEME, 0), null);
    assert(!!lifted && lifted.dim !== base.dim && lifted.primary === base.primary && lifted.alert === base.alert && lifted.foreign === base.foreign
      && flat?.dim === base.dim, `R1 (C) role konsoli: dim podniesione (${base.dim} → ${lifted?.dim}), pozostałe role bez zmian; lift 0 = role mapy`);
    const mid = safe(() => CR.mixTokens('#000000', '#ffffff', 0.5), null);
    assert(mid === '#808080', `R2 mixTokens — połowa między czernią a bielą (${mid})`);
    const kitOld = KIT?.CONSOLE_KIT?.HALO_BLUR;
    const c1 = {}, c0 = {};
    safe(() => KIT.applyConsoleHalo(c1));
    safe(() => { KIT.tuneConsoleKit({ HALO_BLUR: 0 }); KIT.applyConsoleHalo(c0); KIT.tuneConsoleKit({ HALO_BLUR: kitOld }); });
    assert(kitOld > 0 && c1.shadowBlur === kitOld && c1.shadowColor === THEME.bgPrimary && c0.shadowBlur === undefined,
      `R3 (A) poświata: shadowBlur ${c1.shadowBlur} w kolorze tła motywu; HALO_BLUR 0 — ctx nietknięty`);
    const kitP = drawIntel('detailed');
    const shadowOn = (pp) => { setKit(pp); globalThis.window.KOSMOS = kosmosFor('detailed'); const ov = new IO.IntelOverlay(); ov.show(); ov._selectedId = E;
      const seen = []; const ctx = new Proxy({}, { get: (o, k) => (k === 'measureText' ? (x) => ({ width: String(x).length * 6 }) : k in o ? o[k] : () => {}),
        set: (o, k, v) => { if (k === 'shadowBlur') seen.push(v); o[k] = v; return true; } }); safe(() => ov.draw(ctx, W, H)); return seen; };
    // KZ (dawna kontrola „flaga OFF — bez cienia” usunięta): poświata zawsze na konsoli, także przy consoleKit false; HALO_BLUR 0 → bez cienia
    const noHalo = (() => { KIT?.tuneConsoleKit?.({ HALO_BLUR: 0 }); try { return shadowOn(true); } finally { KIT?.tuneConsoleKit?.({ HALO_BLUR: kitOld }); } })();
    assert(shadowOn(true).some((v) => v > 0) && shadowOn(false).some((v) => v > 0) && !noHalo.some((v) => v > 0),
      'R4 poświata na konsoli Wywiadu (także consoleKit false); HALO_BLUR 0 — rysunek bez cienia');
    assert(kitP.text.includes(t('intel.console.file').toUpperCase()) && !kitP.text.includes(`≈ ${TOK.military}`)
      && kitP.text.includes(`${TOK.armed} / ${TOK.limit}`) && kitP.text.includes(`+${TOK.reserve}`) && kitP.text.includes(TOK.military),
      'R5 inspektor: nagłówek AKTA, siła bojowa nie powtarza się (≈ N), uzbrojone / limit i rezerwa zostają; świadek: siła jest w bohaterze');
    const pts = safe(() => EL.systemMapPoints({ known: [{ id: 'k1', name: 'K1', capital: true }, { id: 'both', name: 'B', capital: false }],
      mineIds: ['m1', 'both'], posOf: (id) => ({ k1: { x: 1, y: 1 }, both: { x: 2, y: 2 }, m1: { x: 3, y: 3, name: 'M1' }, other: { x: 9, y: 9 } })[id] ?? null }), []);
    const ids = pts.map((q) => q.id).sort().join(',');
    const both = pts.find((q) => q.id === 'both');
    assert(ids === 'both,k1,m1' && both?.mine && both?.theirs && pts.find((q) => q.id === 'k1')?.capital === true,
      `R6 punkty mini-mapy = znane ∪ moje (${ids}); układ wspólny ma obie flagi; inne układy galaktyki nie wchodzą`);
    const fit = safe(() => EL.fitMapPoints([{ x: 0, y: 0 }, { x: 10, y: 5 }], { x: 0, y: 0, w: 120, h: 120 }, 10), []);
    assert(fit.length === 2 && fit.every((q) => q.sx >= 10 && q.sx <= 110 && q.sy >= 10 && q.sy <= 110) && Math.abs((fit[1].sx - fit[0].sx) / (fit[1].sy - fit[0].sy) - 2) < 1e-9,
      'R7 fitMapPoints: punkty w prostokącie z marginesem, ta sama skala w obu osiach');
    const leakSecret = ['unknown', 'rumor', 'contact', 'detailed'].filter((lv) => drawIntel(lv).text.includes(TOK.secret));
    const mapOn = kitP.text.includes(t('intel.console.map').toUpperCase());
    assert(mapOn && leakSecret.length === 0, `R8 mini-mapa rysowana (świadek ${mapOn}); układ imperium spoza listy znanych nie pojawia się na żadnym poziomie [${leakSecret}]`);
  }

  // ══ M — K0b-1 czytelność mini-mapy ══
  console.log('\nM — K0b-1: stolice, odległość, scalanie, kadr, podziałka, podpisy (mgła bez zmian)');
  {
    const LEVELS = ['unknown', 'rumor', 'contact', 'detailed'];
    const DIST = t('intel.console.mapLy', Math.hypot(40, 10).toFixed(1));   // HomeStar (0,0) → SentinelPrime (40,10)
    const distRe = /\d+\.\d ly/;
    const known = LEVELS.map((lv) => drawIntel(lv));
    const capMine = known.map((d) => d.markers.find((m) => m.capitalMine));
    assert(capMine.every((m) => m?.key === 'sys_home') && known.every((d) => d.text.includes('HomeStar')),
      `M1 stolica gracza — osobny znacznik z nazwą na każdym poziomie [${capMine.map((m) => m?.key)}]`);
    assert(known.every((d) => d.markers.some((m) => m.capital && m.key === 'sys_sent_a') && d.text.includes(DIST)),
      `M2 znana stolica imperium oznaczona + linia stolic z odległością „${DIST}” (świadek dla M3)`);
    const hidden = LEVELS.map((lv) => drawIntel(lv, { empHome: 'sys_secret' }));
    assert(hidden.every((d) => d.markers.length > 0 && !d.markers.some((m) => m.capital) && !distRe.test(d.text) && !d.text.includes(TOK.secret)),
      'M3 MGŁA: stolica spoza listy znanych nigdy nie oznaczona, bez linii odległości, nazwa nie wycieka (każdy poziom)');
    const near = [{ id: 'sys_near', name: 'NearMine', x: 55.1, y: -20.05 }];
    const merged = LEVELS.map((lv) => drawIntel(lv, { empHome: 'sys_secret', secretAt: { x: 40.05, y: 10.02 }, extraMine: near }));
    const mm = merged.map((d) => d.markers.find((m) => m.ids?.includes('sys_near')));
    assert(mm.every((m) => m && m.ids.length === 2 && m.mine && m.theirs)
      && merged.every((d) => !d.text.includes(TOK.secret) && !d.markers.some((m) => m.ids.includes('sys_secret') || m.capital)),
      `M4 scalanie: własny układ obok ich znanego → JEDEN znacznik (dwukolorowy pierścień) [${mm.map((m) => m?.ids)}]; sekret tuż obok znanej stolicy nie wchodzi ani nie jest oznaczony`);
    const fitIn = [{ id: 'a', x: 0, y: 0, mine: true }, { id: 'b', x: 1, y: 0, theirs: true }, { id: 'c', x: 1.2, y: 0.1, theirs: true, capital: true },
      { id: 'd', x: 30, y: 30, mine: true }];
    const mk = safe(() => EL.mergeMapMarkers(EL.fitMapPoints(fitIn, { x: 0, y: 0, w: 60, h: 60 }, 5), 10), []);
    const ids = mk.flatMap((m) => m.ids).sort().join(',');
    assert(ids === 'a,b,c,d' && mk.length < fitIn.length && mk.find((m) => m.ids.includes('b'))?.key === 'c',
      `M5 scalanie = podział wejścia (${ids}; ${mk.length} znaczników), głowa = stolica; nic nie dochodzi`);
    const rect = { x: 0, y: 0, w: 300, h: 200 };
    const f2 = safe(() => EL.mapFit([{ x: 0, y: 0 }, { x: 1, y: 0 }], rect, 28, 12), null);
    const f0 = safe(() => EL.mapFit([{ x: 0, y: 0 }, { x: 1, y: 0 }], rect, 28, 0), null);
    const many = [{ x: -40, y: 5 }, { x: 60, y: -30 }, { x: 10, y: 44 }];
    const fm = safe(() => EL.fitMapPoints(many, rect, 28, 12), []);
    assert(f2 && f0 && f2.k <= (200 - 56) / 12 + 1e-9 && f0.k > f2.k && fm.length === 3 && fm.every((q) => q.sx >= 28 - 1e-9 && q.sx <= 272 + 1e-9 && q.sy >= 28 - 1e-9 && q.sy <= 172 + 1e-9),
      `M6 auto-kadr: minimalna rozpiętość hamuje zoom 1–2 układów (k ${f2?.k?.toFixed(1)} vs bez minimum ${f0?.k?.toFixed(1)}); suma zbiorów w kadrze z marginesem`);
    const b3 = safe(() => EL.mapScaleBar(3, 90), null), b0 = safe(() => EL.mapScaleBar(0, 90), 'x');
    assert(b3?.ly === 20 && b3?.px === 60 && b0 === null && known[3].texts.some((x) => /^\d+ ly$/.test(x)),
      `M7 podziałka: okrągła długość 1/2/5×10ⁿ (k 3 → ${b3?.ly} ly, ${b3?.px} px); rysowana na mini-mapie`);
    const crowd = [];
    for (let i = 0; i < 40; i++) crowd.push({ id: `m${String(i).padStart(2, '0')}`, name: `Own${i}`, sx: 100 + (i % 8) * 12, sy: 70 + Math.floor(i / 8) * 12, mine: true });
    crowd.push({ id: 'capM', name: 'CapMine', sx: 136, sy: 100, mine: true, capitalMine: true });
    crowd.push({ id: 'capT', name: 'CapThem', sx: 160, sy: 88, theirs: true, capital: true });
    crowd.push({ id: 'lone', name: 'Lone', sx: 30, sy: 30, theirs: true });
    const cm = safe(() => EL.mergeMapMarkers(crowd, 10), []);
    const DIST_X = { key: '__dist', ax: 124, ay: 94, text: '16.4 ly', essential: true, prio: 1, dist: true, pad: 4 };   // środek tłoku
    const lay = safe(() => EL.mapLabelLayout(cm, { rect: { x: 0, y: 0, w: 320, h: 200 }, measure: (x) => x.length * 6, lineH: 12, text: (m) => m.name,
      extra: [DIST_X] }), null);
    const HL = await tryImport('../../ui/HudLabelLogic.js');
    const pairs = lay ? HL.overlappingPairs(lay.placed.filter((p) => !p.essential)) : [1];
    const keys = new Set(lay?.placed.map((p) => p.key) ?? []);
    const lone = lay?.placed.find((p) => p.key === 'lone');
    const dist = lay?.placed.find((p) => p.key === '__dist');
    const distHits = dist ? HL.overlappingPairs([dist, ...lay.placed.filter((p) => p !== dist && !p.essential)]).filter(([i]) => i === 0) : [1];
    assert(!!dist && dist.w === 7 * 6 + 2 + 8 && distHits.length === 0,
      `M10 odległość stolic w tym samym rozkładzie, z marginesem ${dist?.pad} px — nie dotyka żadnej nazwy w tłoku (${distHits.length} styków)`);
    assert(!!lay && keys.has('capM') && keys.has('capT') && lay.hidden.length > 0 && !lay.hidden.includes('capM') && !lay.hidden.includes('capT')
      && pairs.length === 0 && lone?.side === 'C' && EL.mapPointPrio({ capital: true }) < EL.mapPointPrio({ mine: true }) && EL.mapPointPrio({ mine: true }) < EL.mapPointPrio({ theirs: true }),
      `M8 podpisy (tłok): stolice zawsze, gęstość chowa resztę (${lay?.hidden.length} schowanych), brak nakładania; reguła galaktyki — samotny podpis pod gwiazdą (strona ${lone?.side}); priorytet stolice > własne > ich`);
    assert(known[3].text.includes(t('intel.console.mapYours')) && known[3].text.includes(t('intel.console.mapTheirs')),
      'M9 KONTROLA: legenda mini-mapy zostaje');
  }
} finally {
  globalThis.window.KOSMOS = savedK;
  Object.assign(F, savedFlags);
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
