// Finding 160 — keeper: WEJSCIE W ZAKLADKE SPRZATA PO POPRZEDNIEJ.
// Plan: docs/design/OVERLAY_TAB_ENTRY_PLAN.md (T1-T6 = W1). Audyt: docs/audit/STRATCOM_110_159_160_AUDIT.md §3.
//
// PO CO: klawisz otwierajacy Dowodztwo NA JUZ OTWARTYM Dowodztwie przelaczal zakladke z pominieciem
// `_switchTab` I `close()`. `OverlayManager.handleKey:75-80` — gdy overlay jest aktywny, a wpis
// keymapy ma niepuste `opts`, leci `_showOverlay(...)` BEZ `_hideOverlay`. `FleetManagerOverlay`
// nie ma `show()`, wiec leci `open(opts)`, a tam sa TRZY przypisania `_activeTab` i zadne nie szlo
// przez `_switchTab`. Skutek zmierzony: osierocone pole tekstowe wyszukiwarki Rejestru zostawalo
// W DOM — nad mapa galaktyki.
//
// ⚠ OSIAGALNOSC ROZNI SIE PER POLE DOM i to jest sedno tego findingu:
//     pole ilosci Logistyki (:1089) MA `blur → commit → _closeLogiQtyInput` ⇒ samo sie leczy,
//       a poki ma fokus, jego `keydown` robi stopPropagation, wiec `M` i tak nie dotrze do gry.
//     wyszukiwarka Rejestru (:4366-4393) NIE MA handlera `blur` — celowo, fraza ma przezyc
//       przegladanie listy ⇒ TO JEST osiagalna sciezka defektu (T1).
//   Dlatego T1 (Rejestr) jest rdzeniem, a T2 (Logistyka) pilnuje drugiej polowy szwu.
//
// ⚠ T4 = PIN DECYZJI T4 Z PLANU, NIE DZIURA. `_switchTab` ma early-return `tab === _activeTab`,
//   wiec wejscie klawiszem NA TA SAMA zakladke niczego nie resetuje — i tak ma byc. Wyciek polega
//   na PRZENIESIENIU pola DOM tam, gdzie ono nie nalezy; gdy zakladka sie nie zmienia, nic sie nie
//   przenosi. Kto to "naprawi", zmieni zachowanie wyszukiwarki. Pin stoi, zeby tego nie zrobic.
//
//   T1  wyszukiwarka Rejestru + wejscie na inna zakladke ⇒ input USUNIETY z DOM   (fail-first)
//   T2  pole ilosci + drop-downy Logistyki + wejscie na inna zakladke ⇒ posprzatane (fail-first)
//   T3  KONTROLA PINU: `_switchTab` i `close()` nadal sprzataja (straznik regresji, zielony od zawsze)
//   T4  PIN DECYZJI: wejscie na TE SAMA zakladke NIE resetuje stanu (early-return zostaje)
//   T5  intencja wejscia przezywa `_switchTab` (klawisz K: focusSection/tacticalView/showWrecks)
//   T6  PIN ZRODLOWY (wykonaniowy): `{id,opts}` w keymapie to dokladnie g/m/k (flaga galaxyView OFF) albo m/k (ON),
//       wszystkie → 'fleet'
// ⚠ T6 PRZECELOWANY 2026-10-30 (ARC GALAXY G1, D-GX-8 — GALAXY_PLAN.md §4 G1): klawisz G przelacza TRYB GALAKTYKI glownego
//   widoku (`GameScene`, przed keymapa) i przy fladze `galaxyView` opuszcza `OverlayManager._keyMap`. Zbior producentow
//   re-show zostaje zamkniety w jednym overlayu — przy fladze ON to dokladnie m/k; przy OFF dawne g/m/k (stan sprzed kroku).
//   Oba stany sprawdzane — flaga przestawiana przed konstrukcja keymapy (czytana w konstruktorze).
//   T7  `open({})` (sciezka Outlinera) NIE zmienia zakladki i NIE wola `_switchTab`
// ⚠ PRZECELOWANE 2026-11-07 (ARC GALAXY G5-B — zakladka Stratcom usunieta, D-GX-21): T1-T3 i T5 wchodza na zakladke 'atlas'
//   (dawny cel 'stratcom' nie istnieje; `_switchTab` nie waliduje id, wiec stary literal przechodzilby dalej, ale bez sensu);
//   T4 — decyzja planu (early-return na tej samej zakladce) zostaje, kontrola przeniesiona z rodziny pol 108 (usunietych razem
//   z zakladka) na `_atlasScrollY` (zerowany przy wejsciu na atlas z innej zakladki); T6 — w keymapie zostaje JEDEN wpis
//   {id, opts}: 'k'; G i M nie sa w keymapie (przelaczaja tryb galaktyki w `GameScene` przez `isGalaxyToggleKey` — M od G5),
//   flaga `galaxyView` usunieta, wiec stanu OFF nie ma. Fixture `mkOverlay` bez pol Stratcomu.

import '../headless/env.js';           // MUSI byc pierwszy
import { FleetManagerOverlay } from '../../ui/FleetManagerOverlay.js';
import { OverlayManager } from '../../ui/OverlayManager.js';
import { isGalaxyToggleKey } from '../../ui/GalaxyModeLogic.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// Instancja BEZ konstruktora — testujemy wejscie w zakladke, nie cykl zycia overlaya
// (konstruktor subskrybuje EventBus i nic z tego nie jest tu potrzebne).
function mkOverlay(tab = 'tactical') {
  const o = Object.create(FleetManagerOverlay.prototype);
  o._visible = true;
  o._activeTab = tab;
  o._pendingFocusInit = false;
  o._pendingFocusSection = null;
  o._pendingFocusVesselId = null;
  o._tacticalView = 'registry';
  o._registryFilter = { systemKey: null, role: null, search: '', showWrecks: false, showContacts: false };
  // stan per-zakladka, ktory `_switchTab` ma sprzatac
  o._registrySearchEl = null;
  o._logiQtyInput = null;
  o._logiGoods = { food: 40 };
  o._logiColDropdown = null;
  o._logiGoodDropdownOpen = false;
  o._mapHoverBody = null;
  o._hoverVesselId = null;
  o._rightScrollY = 0;
  o._atlasScrollY = 0;
  o._missionConfig = null;
  o._targetScrollOffset = 0;
  o._cachedTargets = null;
  // `_close()` dotyka tych pol — musza istniec, zeby sciezka Esc nie rzucila
  o._mapDragging = false;
  o._mapDragWasDrag = false;
  return o;
}

const inDom = (el) => !!el && document.body.children.includes(el);
const SEARCH_ZONE = { x: 100, y: 50, w: 120, h: 16 };

// ── T1 — rdzen: osiagalna sciezka defektu (wyszukiwarka Rejestru bez `blur`) ──
console.log('\nT1 — wyszukiwarka Rejestru + wejscie na zakladke atlas przez open({tab})');
{
  const o = mkOverlay('tactical');
  o._registryFilter.search = 'zmija';
  o._openRegistrySearch(SEARCH_ZONE);
  const el = o._registrySearchEl;
  assert(inDom(el), 'kontrola pinu: input wyszukiwarki jest w DOM przed wejsciem');
  assert(typeof el.onblur !== 'function',
    'kontrola pinu: wyszukiwarka NIE ma handlera blur (celowo) — dlatego ta sciezka jest osiagalna');

  o.open({ tab: 'atlas' });   // `openPanel('fleet', { tab })` na zywym overlayu (do G5 — takze klawisz M → 'stratcom')

  assert(o._activeTab === 'atlas', 'zakladka przelaczona na atlas');
  assert(!inDom(el), 'input wyszukiwarki USUNIETY z DOM (nie wisi nad inna zakladka)');
  assert(o._registrySearchEl === null, '_registrySearchEl wyzerowane');
}

// ── T2 — druga polowa szwu: Logistyka (pole ilosci + drop-downy) ──
console.log('\nT2 — pole ilosci i drop-downy Logistyki + wejscie na zakladke atlas przez open({tab})');
{
  const o = mkOverlay('logistics');
  o._openLogiQtyInput('food', 100, 100);
  o._logiColDropdown = 'from';
  o._logiGoodDropdownOpen = true;
  const el = o._logiQtyInput;
  assert(inDom(el), 'kontrola pinu: input ilosci jest w DOM przed wejsciem');

  o.open({ tab: 'atlas' });

  assert(!inDom(el), 'input ilosci USUNIETY z DOM');
  assert(o._logiQtyInput === null, '_logiQtyInput wyzerowane');
  assert(o._logiGoodDropdownOpen === false, 'drop-down towarow zamkniety');
  assert(o._logiColDropdown === null, 'drop-down kolonii zamkniety');
}

// ── T3 — KONTROLA PINU: sciezki, ktore sprzataly ZAWSZE, dalej sprzataja ──
console.log('\nT3 — kontrola pinu: _switchTab i close() nadal sprzataja (straznik regresji)');
{
  const a = mkOverlay('logistics');
  a._openLogiQtyInput('food', 100, 100);
  const ea = a._logiQtyInput;
  a._switchTab('atlas');
  assert(!inDom(ea), '_switchTab: input usuniety');
  assert(a._activeTab === 'atlas', '_switchTab: zakladka zmieniona');

  const b = mkOverlay('tactical');
  b._openRegistrySearch(SEARCH_ZONE);
  const eb = b._registrySearchEl;
  b.close();
  assert(!inDom(eb), 'close(): input usuniety');
  assert(b._visible === false, 'close(): overlay schowany');
}

// ── T4 — PIN DECYZJI (plan T4=W1): wejscie na TE SAMA zakladke nic nie resetuje ──
console.log('\nT4 — PIN DECYZJI: early-return `_switchTab` zostaje (to nie jest dziura)');
{
  const o = mkOverlay('atlas');
  o._atlasScrollY = 240;
  o.open({ tab: 'atlas' });
  assert(o._atlasScrollY === 240,
    'ta sama zakladka ⇒ przewiniecie katalogu NIE jest resetowane (swiadome, decyzja T4)');

  // kontrola pinu: wejscie z INNEJ zakladki resetuje stan zakladki docelowej
  const p = mkOverlay('logistics');
  p._atlasScrollY = 240;
  p.open({ tab: 'atlas' });
  assert(p._atlasScrollY === 0, 'kontrola pinu: wejscie z INNEJ zakladki resetuje przewiniecie atlasu');
}

// ── T5 — intencja wejscia przezywa `_switchTab` (klawisz K) ──
console.log('\nT5 — klawisz K: intencja wejscia nie zostaje zjedzona przez `_switchTab`');
{
  const o = mkOverlay('atlas');
  o._openRegistrySearch(SEARCH_ZONE);
  const el = o._registrySearchEl;
  o.open({ focusSection: 'wreck' });

  assert(o._activeTab === 'tactical', 'K: zakladka taktyczna');
  // przy domyslnych flagach (commandTacticalMap OFF, fleetRegistry ON) galaz 3g przekierowuje
  // sekcje wrakow do REJESTRU z wlaczonym chipem 💀 — pinujemy realny skutek, nie zyczenie
  assert(o._tacticalView === 'registry', 'K: widok REJESTR (galaz 3g przy mapie 2D OFF)');
  assert(o._registryFilter.showWrecks === true, 'K: filtr wrakow wlaczony — intencja wejscia zachowana');
  assert(o._pendingFocusSection === null, 'K: _pendingFocusSection skonsumowane przez galaz 3g');
  assert(!inDom(el), 'K: input wyszukiwarki posprzatany przy zmianie zakladki atlas → tactical');
}

// ── T6 — PIN ZRODLOWY (wykonaniowy): zbior producentow re-show jest zamkniety ──
console.log('\nT6 — PIN ZRODLOWY: jedyny wpis keymapy w formie {id, opts} to k → fleet; G i M poza keymapa');
{
  const om = new OverlayManager();
  const keys = Object.keys(om._keyMap).filter(k => typeof om._keyMap[k] !== 'string').sort();
  assert(JSON.stringify(keys) === JSON.stringify(['k']), `wpisy {id,opts} = ${JSON.stringify(keys)} (oczekiwane tylko k)`);
  assert(keys.every(k => om._keyMap[k].id === 'fleet'), 'wpis k celuje w overlay `fleet` — klasa zamknieta w jednym overlayu');
  assert(!('g' in om._keyMap) && !('m' in om._keyMap), '`g` i `m` poza keymapa (przelacznik trybu galaktyki w GameScene)');
  assert(isGalaxyToggleKey({ key: 'g' }) === true && isGalaxyToggleKey({ key: 'm' }) === true,
    'kontrola pinu: G i M obsluguje `isGalaxyToggleKey` — keymapa nie jest ich odbiorca');
  assert(typeof om._keyMap['f'] === 'string', 'kontrola pinu: wpis `f` jest stringiem ⇒ idzie galezia toggle (_hideOverlay), nie re-show');
}

// ── T7 — sciezka Outlinera: brak `opts.tab` ⇒ zakladka nietknieta, `_switchTab` niewolane ──
console.log('\nT7 — open({}) (Outliner) nie zmienia zakladki i nie wola `_switchTab`');
{
  const o = mkOverlay('logistics');
  let switchCalls = 0;
  o._switchTab = function (tab) { switchCalls++; return FleetManagerOverlay.prototype._switchTab.call(this, tab); };
  o.open({});
  assert(o._activeTab === 'logistics', 'zakladka nietknieta');
  assert(switchCalls === 0, '`_switchTab` niewolane (brak opts.tab / focusSection / view)');
  assert(o._visible === true, 'overlay widoczny');
}

console.log(`\n${fail === 0 ? 'OK' : 'FAIL'} — pass ${pass} / fail ${fail}`);
process.exit(fail === 0 ? 0 : 1);
