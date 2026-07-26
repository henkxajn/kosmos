// MVP Zlecenia Transportowe — render-smoke zakładki LOGISTYKA (FleetManagerOverlay).
// Uruchom: node src/testing/smoke/tmp_transport_ui_render_smoke.mjs
//
// Cel: wychwycić błędy RUNTIME UI (złe tokeny THEME, klucze t(), dostęp do danych,
// sygnatury) których syntax-check nie łapie. env.js daje proxy-canvas (no-op draw).
// Pokrycie: draw() nie rzuca, pickery From/To, DROP-DOWN pełnego katalogu (surowce +
// commodities spoza magazynu), dodanie/inc/remove towaru, utworzenie+anulowanie
// zlecenia, statki+fazy w karcie zlecenia, toggle puli, scroll lewej kolumny.

import '../headless/env.js'; // MUST be first

import EventBus            from '../../core/EventBus.js';
import EntityManager       from '../../core/EntityManager.js';
import gameState           from '../../core/GameState.js';
import { ResourceSystem }  from '../../systems/ResourceSystem.js';
import { TechSystem }      from '../../systems/TechSystem.js';
import { MissionSystem }   from '../../systems/MissionSystem.js';
import { ColonyManager }   from '../../systems/ColonyManager.js';
import { VesselManager }   from '../../systems/VesselManager.js';
import { OrderService }    from '../../systems/OrderService.js';
import { TransportOrderSystem } from '../../systems/TransportOrderSystem.js';
import { FleetManagerOverlay }  from '../../ui/FleetManagerOverlay.js';

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { console.log('  PASS  ' + name); pass++; }
  else      { console.error('  FAIL  ' + name); fail++; }
};

// ── Świat ────────────────────────────────────────────────────────────────────
EntityManager.add({ id: 'star_h', name: 'Sol', type: 'star', x: 0, y: 0, mass: 1, systemId: 'sys_home' });
for (const [id, x] of [['F', 400], ['T', 700]]) {
  EntityManager.add({ id, name: id, type: 'planet', planetType: 'rocky', radius: 1, mass: 1,
    atmosphere: 'breathable', temperatureK: 280, systemId: 'sys_home', x, y: 0, explored: true, deposits: [] });
}

const resourceSystem = new ResourceSystem();
const techSystem     = new TechSystem(resourceSystem);
const missionSystem  = new MissionSystem(resourceSystem);
const colonyManager  = new ColonyManager(techSystem);
const vesselManager  = new VesselManager();
const orderService   = new OrderService();

globalThis.window = globalThis;
window.KOSMOS = {
  ...window.KOSMOS,
  scenario: 'civilization', civMode: true, activeSystemId: 'sys_home',
  timeSystem: { gameTime: 100 },
  galaxyData: { systems: [{ id: 'sys_home', name: 'Sol', x: 0, y: 0, z: 0 }] },
  star: EntityManager.get('star_h'),
  resourceSystem, techSystem, missionSystem, expeditionSystem: missionSystem,
  colonyManager, vesselManager, orderService, gameState,
  homePlanet: EntityManager.get('F'),
  uiPrefs: {},
};
gameState.reset();
const tos = new TransportOrderSystem();
window.KOSMOS.transportOrderSystem = tos;

const colF = colonyManager.createColony('F', { Fe: 5000, Cu: 3000, food: 2000, water: 2000 }, 2, 100);
const colT = colonyManager.createColony('T', { food: 2000, water: 2000 }, 2, 100);
colonyManager.switchActiveColony('F');

const ctx = document.createElement('canvas').getContext('2d');
const W = 1920, H = 1080;

let overlay;
try { overlay = new FleetManagerOverlay(); ok('konstrukcja FleetManagerOverlay', true); }
catch (e) { ok('konstrukcja FleetManagerOverlay', false); console.error(e); process.exit(1); }

overlay.open({ tab: 'logistics' });
overlay._activeTab = 'logistics';
const zonesOf = (type) => overlay._hitZones.filter(z => z.type === type);
const clickZone = (z) => overlay.handleClick(z.x + 2, z.y + 2);

// ── Draw #1 — pusty builder ──────────────────────────────────────────────────
try { overlay.draw(ctx, W, H); ok('draw() logistyka nie rzuca (pusty stan)', true); }
catch (e) { ok('draw() logistyka nie rzuca (pusty stan)', false); console.error(e); }

ok('przyciski drop-down From/To istnieją', zonesOf('logi_from_dropdown_toggle').length === 1 && zonesOf('logi_to_dropdown_toggle').length === 1);
ok('domyślne źródło = aktywna kolonia F', overlay._logiFrom === 'F');
// Otwórz drop-down celu i wybierz T.
clickZone(zonesOf('logi_to_dropdown_toggle')[0]);
ok('drop-down celu otwarty', overlay._logiColDropdown === 'to');
overlay.draw(ctx, W, H);
ok('drop-down kolonii: brak zony na źródło F (przeciwny koniec)', !zonesOf('logi_col_pick').some(z => z.data.colonyId === 'F'));
clickZone(zonesOf('logi_col_pick').find(z => z.data.which === 'to' && z.data.colonyId === 'T'));
ok('wybór celu T + drop-down zamknięty', overlay._logiTo === 'T' && overlay._logiColDropdown === null);

// ── Drop-down: pełny katalog (surowce + commodities spoza magazynu) ───────────
overlay.draw(ctx, W, H);
const ddToggle = zonesOf('logi_good_dropdown_toggle')[0];
ok('przycisk „Dodaj towar" istnieje', !!ddToggle);
clickZone(ddToggle);
ok('drop-down otwarty', overlay._logiGoodDropdownOpen === true);
overlay.draw(ctx, W, H);
ok('katalog zawiera commodity spoza magazynu (power_cells)', !!zonesOf('logi_good_pick').find(z => z.data.goodId === 'power_cells'));
ok('katalog zawiera surowiec (Fe)', !!zonesOf('logi_good_pick').find(z => z.data.goodId === 'Fe'));
ok('katalog: brak niefizycznych (research/energy)', !zonesOf('logi_good_pick').some(z => z.data.goodId === 'research' || z.data.goodId === 'energy'));
clickZone(zonesOf('logi_good_pick').find(z => z.data.goodId === 'Fe'));
ok('wybór Fe dodał towar (qty 10) + zamknął drop-down', overlay._logiGoods.Fe === 10 && overlay._logiGoodDropdownOpen === false);

// ── Wybrane towary: inc / dodanie commodity / remove ─────────────────────────
overlay.draw(ctx, W, H);
clickZone(zonesOf('logi_good_inc').find(z => z.data.goodId === 'Fe'));
ok('qty Fe = 20 po [+]', overlay._logiGoods.Fe === 20);
// Ręczne wpisanie ilości (DOM input, wzór safety stock)
overlay.draw(ctx, W, H);
const qtyZone = zonesOf('logi_good_qty_input').find(z => z.data.goodId === 'Fe');
ok('pole ilości Fe klikane (hit-zona)', !!qtyZone);
clickZone(qtyZone);
ok('klik pola ilości otworzył DOM input', !!overlay._logiQtyInput);
overlay._closeLogiQtyInput();
ok('input zamknięty', overlay._logiQtyInput === null);
clickZone(zonesOf('logi_good_dropdown_toggle')[0]);
overlay.draw(ctx, W, H);
clickZone(zonesOf('logi_good_pick').find(z => z.data.goodId === 'power_cells'));   // commodity spoza magazynu F
ok('dodano commodity spoza magazynu (power_cells=10)', overlay._logiGoods.power_cells === 10);
overlay.draw(ctx, W, H);
clickZone(zonesOf('logi_good_remove').find(z => z.data.goodId === 'power_cells'));
ok('usunięto towar [✕]', overlay._logiGoods.power_cells === undefined && overlay._logiGoods.Fe === 20);

// ── Utwórz zlecenie + anuluj ─────────────────────────────────────────────────
overlay.draw(ctx, W, H);
const createZ = zonesOf('logi_create')[0];
ok('przycisk Utwórz aktywny', !!createZ);
clickZone(createZ);
ok('zlecenie utworzone (goods Fe:20)', tos.getOrders().length === 1 && tos.getOrders()[0].goods.Fe === 20);
ok('builder zresetowany (goods puste, from/to zostają)', Object.keys(overlay._logiGoods).length === 0 && overlay._logiFrom === 'F' && overlay._logiTo === 'T');
overlay.draw(ctx, W, H);
clickZone(zonesOf('logi_cancel')[0]);
ok('zlecenie anulowane', tos.getOrders().length === 0);

// ── Statki + fazy w karcie zlecenia ──────────────────────────────────────────
const hauler = vesselManager.createAndRegister('hull_small', 'F', { name: 'Wozak', cargoMax: 100, fuel: 1000, fuelMax: 1000 });
tos.addToPool(hauler.id);
EventBus.emit('time:display', { gameTime: 100 });
tos.createOrder({ fromColonyId: 'F', toColonyId: 'T', goods: { Fe: 50 } });   // dispatch → hauler przypisany
const ord = tos.getOrders()[0];
ok('zlecenie ma przydzielony statek', (ord.assignments ?? []).length === 1 && ord.assignments[0].vesselId === hauler.id);
try { overlay.draw(ctx, W, H); ok('draw() karty zlecenia ze statkiem+fazą nie rzuca', true); }
catch (e) { ok('draw() karty zlecenia ze statkiem+fazą nie rzuca', false); console.error(e); }
tos.cancelOrder(ord.id);

// ── Toggle puli (zone z panelu statku — wewnątrz bounds) ──────────────────────
overlay.draw(ctx, W, H);
const b = overlay._bounds;
const zx = b.x + 40, zy = b.y + 40;
tos.removeFromPool(hauler.id);
overlay._hitZones.push({ x: zx, y: zy, w: 20, h: 20, type: 'toggle_logistics_pool', data: { vesselId: hauler.id } });
overlay.handleClick(zx + 2, zy + 2);
ok('toggle puli: dodał statek', tos.isInPool(hauler.id) === true);

// ── Cross-system UI (etykieta układu + badge ⚡) ──────────────────────────────
EntityManager.add({ id: 'star_b', name: 'Beta', type: 'star', x: 900, y: 900, mass: 1, systemId: 'sys_beta' });
EntityManager.add({ id: 'B', name: 'Beta-1', type: 'planet', planetType: 'rocky', radius: 1, mass: 1,
  atmosphere: 'breathable', temperatureK: 280, systemId: 'sys_beta', x: 950, y: 900, explored: true, deposits: [] });
window.KOSMOS.galaxyData.systems.push({ id: 'sys_beta', name: 'Beta', x: 5, y: 0, z: 0 });
colonyManager.createColony('B', { food: 500, water: 500 }, 2, 100);
ok('_sysName rozwiązuje nazwę układu', overlay._sysName('sys_beta') === 'Beta');
tos.createOrder({ fromColonyId: 'F', toColonyId: 'B', goods: { Fe: 20 } });   // cross-system
try { overlay.draw(ctx, W, H); ok('draw() z zleceniem cross-system (badge ⚡) nie rzuca', true); }
catch (e) { ok('draw() z zleceniem cross-system (badge ⚡) nie rzuca', false); console.error(e); }
// Drop-down źródła zawiera kolonię z innego układu.
overlay._logiTo = 'T';   // ustal przeciwny koniec ≠ B
clickZone(zonesOf('logi_from_dropdown_toggle')[0]);
overlay.draw(ctx, W, H);
ok('drop-down kolonii zawiera B (sys_beta)', zonesOf('logi_col_pick').some(z => z.data.colonyId === 'B'));
overlay._logiColDropdown = null;

// ── Scroll lewej kolumny (mały viewport → overflow) ──────────────────────────
for (let i = 0; i < 8; i++) {
  const id = `C${i}`;
  EntityManager.add({ id, name: `Kolonia ${i}`, type: 'planet', planetType: 'rocky', radius: 1, mass: 1,
    atmosphere: 'breathable', temperatureK: 280, systemId: 'sys_home', x: 100 + i * 20, y: 50, explored: true, deposits: [] });
  colonyManager.createColony(id, { food: 100, water: 100 }, 1, 100);
}
overlay._logiBuilderScrollY = 0;
const smallH = 360;
overlay.draw(ctx, W, smallH);
ok('builder: zawartość przekracza widok (scrollowalna)', overlay._logiBuilderContentH > overlay._logiBuilderViewH);
const before = overlay._logiBuilderScrollY;
const cb = overlay._contentBounds;
overlay.handleScroll(30, cb.x + 20, cb.y + cb.h / 2);
ok('scroll lewej kolumny zwiększa offset', overlay._logiBuilderScrollY > before);
overlay.draw(ctx, W, smallH);
ok('draw() po scrollu nie rzuca', true);

console.log(`\n=== Transport UI render smoke: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);
