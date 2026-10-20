// ═══════════════════════════════════════════════════════════════════════════════
// ship_tree_smoke — KEEPER ARKUSZA UI, U3-1 (prawy outliner: drzewo „W drodze” → układy → typy → statki / floty)
// Rejestr: `docs/design/UI_PLAN.md` §4.4 (U3-1), §2 (D-UI-6…D-UI-9), §5 (decyzja 6 (a)), §7.1, §7.2, §7.3, §7.5.
// ─────────────────────────────────────────────────────────────────────────────
// WYKONANIE czystego `ShipTreeLogic.buildShipTree` z PRAWDZIWYM `FleetPictureLogic.buildShipEntry` na statkach
// w KSZTAŁCIE zapisów właściciela — odczytane w prawdziwej grze sondą read-only
// (`kosmos-handover/ui-u3/probes/vessel_shape_u3.mjs`): `kosmos_Zjednoczona_Federacja_r120_v101 (3).json` (ZF gy120:
// 29 statków gracza, w tym 3 wraki; „Flota Wojenna I” rozpięta na `sys_061` i `sys_067`) i `kosmos_Polonia_r79_v101.json`
// (13 statków, 9 unieruchomionych za utrzymanie). Kolejność układów — wynik lewego drzewa (`buildSystemTree`) z gry.
//
// PINY:
//   S1  ZF — układy w kolejności LEWEGO outlinera, tylko te z Twoimi statkami; wraki poza listą; Nekkar (jedyny statek —
//       członek floty z innego układu) poza listą
//   S2  decyzja 6 (a) — węzeł „Flota Wojenna I” w Thuban (prowadzący = pierwszy żywy członek „Troop Transport Warp I”),
//       w kubełku WOJENNE, członkowie pod nim (rola, potem nazwa), „USS Furia” z dopiskiem układu Nekkar
//   S3  członek floty tylko pod węzłem (nie drugi raz jako luźny); indeks wierszy spójny z drzewem
//   S4  D-UI-6 / §7.1 — kubełki w kolejności WOJENNE · NAUKOWE · CARGO · POZOSTAŁE, puste bez nagłówka; w kubełku floty
//       (wg nazwy) przed luźnymi statkami; statki: rola, potem nazwa
//   S5  D-UI-9 / §7.2 (ZF) — „w ruchu” także przy alercie niskiego paliwa w locie (ton `alert`); zadokowany z alertem →
//       „zadokowany”; misja stojąca (zwiad na orbicie, skok warp zakończony) → „bezczynny”; węzeł floty = najpilniejszy
//       znacznik członków
//   S6  Polonia — „bez paliwa” dokładnie dla 9 unieruchomionych (także w locie: „bez paliwa” > „w ruchu”); reszta
//       „zadokowany”; układy: dom, Naos, Akhernar, Mira
//   S7  D-UI-8 / §7.3 — „W drodze” (statek w tranzycie warp) na górze z „w ruchu”; flota z prowadzącym w skoku jako węzeł
//       tej sekcji; członek w skoku floty z układu — dopisek „w drodze”; brak takich statków → sekcji nie ma
//   S8  priorytet znaczników: w walce > bez paliwa (stranded / immobilized) > w ruchu > zadokowany > bezczynny
//   S9  zwijanie (D-UI-4, §7.5) — domyślnie rozwinięty tylko bieżący układ; jawny stan wygrywa
//   S10 `buildShipEntry.moving` — warunek tonu `move` wystawiony osobno (ton `alert` go nie zasłania)
//   S11 słowniki: kubełki = §7.1, znaczniki = §7.2, kolory = tokeny motywu (istnieją w każdym presecie ekranu tytułowego)
//   S12 KONTROLA: fixture wierny — rola z `buildShipEntry` = rola zmierzona w grze; „unieruchomiony” = reguła utrzymania
//
// ⚠ Moduł POWSTAJE w U3-1 — import dynamiczny w try/catch (pin DEGRADUJE, nie przerywa suity przy fail-first).
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { buildShipEntry } from '../../ui/FleetPictureLogic.js';
import { PRESET_THEMES } from '../../config/ThemeConfig.js';
import { HULLS } from '../../data/HullsData.js';
import { calcShipStats } from '../../data/ShipModulesData.js';

let L = null;
try { L = await import('../../ui/ShipTreeLogic.js'); } catch { /* piny padną */ }

let pass = 0, fail = 0;
const ok = (c, label) => { if (c) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };
const header = (s) => console.log('\n── ' + s + ' ──');

// ── Fixture'y (sonda `vessel_shape_u3.mjs` na zapisach właściciela; pola czytane przez `buildShipEntry`) ──────────────
const ZF = {
  systems: [{"systemId":"sys_home","name":"Kepler-4799"},{"systemId":"sys_008","name":"Kochab"},{"systemId":"sys_059","name":"Lalande"},{"systemId":"sys_051","name":"Bellatrix"},{"systemId":"sys_024","name":"Diphda"},{"systemId":"sys_061","name":"Thuban"},{"systemId":"sys_003","name":"Seginus"},{"systemId":"sys_035","name":"Alnilam"},{"systemId":"sys_067","name":"Nekkar"},{"systemId":"sys_050","name":"Alsephina"},{"systemId":"sys_038","name":"Alcor"}],
  fleets: [{"id":"fleet_1","name":"Flota Wojenna I","memberIds":["v_33","v_26","v_25"]},{"id":"fleet_2","name":"Flota Wojenna II","memberIds":["v_50","v_51","v_52","v_49"]}],
  vessels: [
    {"id":"v_3","name":"Kurier","shipId":"hull_small","modules":["engine_chemical","cargo_large","cargo_large"],"systemId":"sys_home","status":"on_mission","position":{"state":"in_transit","dockedAt":null},"mission":{"type":"transport","phase":null},"fuel":{"current":0.0092,"max":8},"warpFuel":{"current":0,"max":0},"role":"cargo"},
    {"id":"v_5","name":"Fracht","shipId":"hull_small","modules":["engine_ion","cargo_large","cargo_large"],"systemId":"sys_home","status":"idle","position":{"state":"docked","dockedAt":"entity_36"},"fuel":{"current":20,"max":20},"warpFuel":{"current":0,"max":0},"role":"cargo"},
    {"id":"v_6","name":"Karawana","shipId":"hull_small","modules":["engine_fusion","cargo_mass"],"systemId":"sys_home","status":"refueling","position":{"state":"docked","dockedAt":"entity_36"},"movementOrder":{"type":"moveToPoint","status":"completed"},"fuel":{"current":10.6383,"max":32},"warpFuel":{"current":0,"max":0},"_awaitingFuel":true,"role":"cargo"},
    {"id":"v_13","name":"Handlarz II","shipId":"hull_small","modules":["engine_fusion","cargo_mass"],"systemId":"sys_home","status":"idle","position":{"state":"docked","dockedAt":"station_1784230358641_w3ul"},"movementOrder":{"type":"moveToPoint","status":"completed"},"fuel":{"current":32,"max":32},"warpFuel":{"current":0,"max":0},"role":"cargo"},
    {"id":"v_14","name":"Kurier II","shipId":"hull_small","modules":["engine_fusion","cargo_mass"],"systemId":"sys_home","status":"refueling","position":{"state":"docked","dockedAt":"entity_6"},"movementOrder":{"type":"moveToPoint","status":"completed"},"fuel":{"current":0.0012,"max":32},"warpFuel":{"current":0,"max":0},"_awaitingFuel":true,"role":"cargo"},
    {"id":"v_19","name":"Dyplomata","shipId":"hull_small","modules":["engine_warp","diplomatic_module","warp_tank"],"systemId":"sys_003","status":"on_mission","position":{"state":"orbiting","dockedAt":null},"mission":{"type":"interstellar_jump","phase":"in_system"},"fuel":{"current":16,"max":16},"warpFuel":{"current":4.4415,"max":5},"role":"scout"},
    {"id":"v_20","name":"Passenger","shipId":"hull_small","modules":["engine_fusion","passenger_module"],"systemId":"sys_home","status":"idle","position":{"state":"docked","dockedAt":"station_1784230358641_w3ul"},"fuel":{"current":32,"max":32},"warpFuel":{"current":0,"max":0},"role":"scout"},
    {"id":"v_21","name":"USS ENTERPRISE","shipId":"hull_small","modules":["engine_warp","warp_tank","quantum_scanner"],"systemId":"sys_059","status":"on_mission","position":{"state":"orbiting","dockedAt":"entity_764"},"mission":{"type":"exploration","phase":"orbiting_body"},"movementOrder":{"type":"moveToPoint","status":"completed"},"fuel":{"current":15.3749,"max":16},"warpFuel":{"current":0.1903,"max":5},"role":"science"},
    {"id":"v_22","name":"Transporter II","shipId":"hull_small","modules":["engine_warp","cargo_mass","warp_tank"],"systemId":"sys_home","status":"refueling","position":{"state":"docked","dockedAt":"entity_36"},"fuel":{"current":0.0393,"max":16},"warpFuel":{"current":5,"max":5},"_awaitingFuel":true,"role":"cargo"},
    {"id":"v_23","name":"USS Saratoga","shipId":"hull_medium","modules":["engine_warp","warp_tank","armor_standard","quantum_scanner","weapon_missile"],"systemId":"sys_061","status":"on_mission","position":{"state":"orbiting","dockedAt":null},"mission":{"type":"interstellar_jump","phase":"in_system"},"fuel":{"current":23.638,"max":24},"warpFuel":{"current":1.1424,"max":5},"role":"warship"},
    {"id":"v_24","name":"Dostawca II","shipId":"hull_small","modules":["engine_warp","cargo_mass","warp_tank"],"systemId":"sys_home","status":"refueling","position":{"state":"docked","dockedAt":"entity_40"},"fuel":{"current":10.7804,"max":16},"warpFuel":{"current":5,"max":5},"_awaitingFuel":true,"role":"cargo"},
    {"id":"v_25","name":"USS Gladiator","shipId":"hull_medium","modules":["engine_warp","warp_tank","armor_standard","quantum_scanner","weapon_missile"],"systemId":"sys_061","status":"refueling","fleetId":"fleet_1","position":{"state":"docked","dockedAt":"entity_54"},"fuel":{"current":22.9178,"max":24},"warpFuel":{"current":5,"max":5},"_awaitingFuel":true,"role":"warship"},
    {"id":"v_26","name":"USS Furia","shipId":"hull_medium","modules":["engine_warp","warp_tank","armor_standard","quantum_scanner","weapon_missile"],"systemId":"sys_067","status":"on_mission","fleetId":"fleet_1","position":{"state":"orbiting","dockedAt":null},"mission":{"type":"interstellar_jump","phase":"in_system"},"fuel":{"current":23.2381,"max":24},"warpFuel":{"current":0.6637,"max":5},"role":"warship"},
    {"id":"v_27","name":"USS Orzel","shipId":"hull_medium","modules":["engine_warp","warp_tank","armor_standard","quantum_scanner","weapon_missile"],"systemId":"sys_050","status":"on_mission","position":{"state":"orbiting","dockedAt":"entity_1125"},"mission":{"type":"exploration","phase":"orbiting_body"},"fuel":{"current":23.8437,"max":24},"warpFuel":{"current":3.8667,"max":5},"role":"warship"},
    {"id":"v_28","name":"USS WILK","shipId":"hull_medium","modules":["engine_warp","warp_tank","armor_standard","quantum_scanner","weapon_missile"],"systemId":"sys_008","status":"refueling","position":{"state":"docked","dockedAt":"entity_981"},"fuel":{"current":24,"max":24},"warpFuel":{"current":4.5059,"max":5},"role":"warship"},
    {"id":"v_30","name":"Cargo & Troop Warp","shipId":"hull_medium","modules":["engine_warp_mk2","engine_warp_mk2","warp_tank","cargo_mass","cargo_mass","troop_bay_l"],"troopCapacity":16,"systemId":"sys_051","isWreck":true,"status":"destroyed","position":{"state":"orbiting","dockedAt":null},"movementOrder":{"type":"moveToPoint","status":"completed"},"fuel":{"current":0,"max":48},"warpFuel":{"current":1.5515,"max":5},"role":"transport"},
    {"id":"v_33","name":"Troop Transport Warp I","shipId":"hull_large","modules":["engine_warp","engine_warp","engine_warp","warp_tank","troop_bay_l","troop_bay_l","armor_standard","drop_pods","drop_pods"],"troopCapacity":32,"canDropTroops":true,"systemId":"sys_061","status":"refueling","fleetId":"fleet_1","position":{"state":"docked","dockedAt":"entity_54"},"fuel":{"current":143.9998,"max":144},"warpFuel":{"current":5,"max":5},"_awaitingFuel":true,"role":"transport"},
    {"id":"v_34","name":"Opat II","shipId":"hull_small","modules":["engine_warp","cargo_mass","warp_tank"],"systemId":"sys_059","status":"idle","position":{"state":"docked","dockedAt":"entity_764"},"movementOrder":{"type":"moveToPoint","status":"cancelled"},"fuel":{"current":16,"max":16},"warpFuel":{"current":5,"max":5},"role":"cargo"},
    {"id":"v_35","name":"Smok II","shipId":"hull_small","modules":["engine_warp","cargo_mass","warp_tank"],"systemId":"sys_home","status":"on_mission","position":{"state":"in_transit","dockedAt":null},"mission":{"type":"transport","phase":null},"fuel":{"current":6.9273,"max":16},"warpFuel":{"current":4.4558,"max":5},"role":"cargo"},
    {"id":"v_37","name":"Tycho","shipId":"hull_small","modules":["engine_warp","quantum_scanner","warp_tank"],"systemId":"sys_067","isWreck":true,"status":"destroyed","position":{"state":"orbiting","dockedAt":null},"movementOrder":{"type":"moveToPoint","status":"completed"},"fuel":{"current":0,"max":16},"warpFuel":{"current":0.4625,"max":5},"unpaidYears":6,"role":"science"},
    {"id":"v_38","name":"Handlarz III","shipId":"hull_small","modules":["engine_warp","cargo_mass","warp_tank"],"systemId":"sys_008","status":"refueling","position":{"state":"docked","dockedAt":"entity_981"},"fuel":{"current":16,"max":16},"warpFuel":{"current":2.7364,"max":5},"role":"cargo"},
    {"id":"v_39","name":"Kurier III","shipId":"hull_small","modules":["engine_warp","cargo_mass","warp_tank"],"systemId":"sys_067","isWreck":true,"status":"destroyed","position":{"state":"orbiting","dockedAt":null},"movementOrder":{"type":"moveToPoint","status":"completed"},"fuel":{"current":0,"max":16},"warpFuel":{"current":3.9381,"max":5},"unpaidYears":6,"role":"cargo"},
    {"id":"v_40","name":"Fracht III","shipId":"hull_small","modules":["engine_warp","cargo_mass","warp_tank"],"systemId":"sys_home","status":"idle","position":{"state":"docked","dockedAt":"entity_5"},"fuel":{"current":16,"max":16},"warpFuel":{"current":5,"max":5},"role":"cargo"},
    {"id":"v_49","name":"Desant I","shipId":"hull_large","modules":["engine_warp","engine_warp","engine_warp","warp_tank","troop_bay_l","troop_bay_l","armor_standard","drop_pods","drop_pods"],"troopCapacity":32,"canDropTroops":true,"systemId":"sys_061","status":"idle","fleetId":"fleet_2","position":{"state":"orbiting","dockedAt":"entity_57"},"fuel":{"current":143.9999,"max":144},"warpFuel":{"current":2.5264,"max":5},"role":"transport"},
    {"id":"v_50","name":"Żmija","shipId":"hull_cruiser","modules":["engine_warp_mk2","engine_warp_mk2","engine_warp_mk2","warp_tank","titanic_plating","weapon_missile","weapon_missile","weapon_missile"],"systemId":"sys_061","status":"idle","fleetId":"fleet_2","position":{"state":"orbiting","dockedAt":"entity_57"},"fuel":{"current":175.9999,"max":176},"warpFuel":{"current":2.5264,"max":5},"role":"warship"},
    {"id":"v_51","name":"Sztylet","shipId":"hull_cruiser","modules":["engine_warp_mk2","engine_warp_mk2","engine_warp_mk2","warp_tank","titanic_plating","orbital_strike_battery","weapon_missile","weapon_missile"],"systemId":"sys_061","status":"idle","fleetId":"fleet_2","position":{"state":"orbiting","dockedAt":"entity_57"},"fuel":{"current":175.9999,"max":176},"warpFuel":{"current":2.5264,"max":5},"role":"warship"},
    {"id":"v_52","name":"Klinga","shipId":"hull_cruiser","modules":["engine_warp_mk2","engine_warp_mk2","engine_warp_mk2","warp_tank","titanic_plating","weapon_missile","weapon_missile","weapon_missile"],"systemId":"sys_061","status":"idle","fleetId":"fleet_2","position":{"state":"orbiting","dockedAt":"entity_57"},"fuel":{"current":175.9999,"max":176},"warpFuel":{"current":2.5264,"max":5},"role":"warship"},
    {"id":"v_53","name":"Galileo","shipId":"hull_small","modules":["engine_warp","quantum_scanner","warp_tank"],"systemId":"sys_061","status":"on_mission","position":{"state":"in_transit","dockedAt":"entity_148"},"mission":{"type":"recon","phase":null},"fuel":{"current":15.0765,"max":16},"warpFuel":{"current":2.5264,"max":5},"role":"science"},
    {"id":"v_54","name":"Odkrywca","shipId":"hull_small","modules":[],"systemId":"sys_061","status":"idle","position":{"state":"orbiting","dockedAt":"entity_56"},"fuel":{"current":8,"max":8},"warpFuel":{"current":0,"max":0},"role":"scout"},
  ],
};
const POL = {
  systems: [{"systemId":"sys_home","name":"TOI-4493"},{"systemId":"sys_014","name":"Alioth"},{"systemId":"sys_032","name":"Naos"},{"systemId":"sys_001","name":"Fomalhaut"},{"systemId":"sys_031","name":"Antares"},{"systemId":"sys_036","name":"Akhernar"},{"systemId":"sys_044","name":"Mira"},{"systemId":"sys_008","name":"Aludra"}],
  fleets: [],
  vessels: [
    {"id":"v_3","name":"Kurier","shipId":"hull_small","modules":["engine_ion","cargo_mass","cargo_mass"],"systemId":"sys_home","status":"idle","position":{"state":"docked","dockedAt":"entity_11"},"fuel":{"current":20,"max":20},"warpFuel":{"current":0,"max":0},"role":"cargo"},
    {"id":"v_4","name":"Fracht","shipId":"hull_small","modules":["engine_ion","cargo_mass","cargo_mass"],"systemId":"sys_home","status":"idle","position":{"state":"docked","dockedAt":"entity_3"},"fuel":{"current":20,"max":20},"warpFuel":{"current":0,"max":0},"role":"cargo"},
    {"id":"v_5","name":"Karawana","shipId":"hull_small","modules":["engine_ion","cargo_mass","cargo_mass"],"systemId":"sys_home","status":"idle","position":{"state":"docked","dockedAt":"entity_3"},"fuel":{"current":20,"max":20},"warpFuel":{"current":0,"max":0},"role":"cargo"},
    {"id":"v_6","name":"Merkury","shipId":"hull_small","modules":["engine_ion","cargo_mass","cargo_mass"],"systemId":"sys_home","status":"idle","position":{"state":"docked","dockedAt":"entity_3"},"fuel":{"current":20,"max":20},"warpFuel":{"current":0,"max":0},"unpaidYears":1,"role":"cargo"},
    {"id":"v_7","name":"Konwój","shipId":"hull_small","modules":["engine_ion","cargo_mass","cargo_mass"],"systemId":"sys_home","status":"idle","position":{"state":"docked","dockedAt":"entity_2"},"fuel":{"current":20,"max":20},"warpFuel":{"current":0,"max":0},"unpaidYears":9,"role":"cargo"},
    {"id":"v_9","name":"Passenger","shipId":"hull_small","modules":["engine_ion","passenger_module","passenger_module"],"systemId":"sys_home","status":"idle","position":{"state":"docked","dockedAt":"entity_11"},"fuel":{"current":20,"max":20},"warpFuel":{"current":0,"max":0},"unpaidYears":9,"role":"scout"},
    {"id":"v_10","name":"Transporter","shipId":"hull_small","modules":["engine_ion","cargo_mass","cargo_mass"],"systemId":"sys_home","status":"idle","position":{"state":"docked","dockedAt":"entity_79"},"fuel":{"current":20,"max":20},"warpFuel":{"current":0,"max":0},"unpaidYears":9,"role":"cargo"},
    {"id":"v_13","name":"Fregata I","shipId":"hull_frigate","modules":["engine_warp","warp_tank","titanic_plating","weapon_missile"],"systemId":"sys_home","status":"idle","position":{"state":"orbiting","dockedAt":"station_1787742675593_5rm1"},"fuel":{"current":20,"max":20},"warpFuel":{"current":5,"max":5},"unpaidYears":9,"role":"warship"},
    {"id":"v_14","name":"Scan Warp","shipId":"hull_small","modules":["engine_warp","deep_scanner","warp_tank"],"systemId":"sys_044","status":"on_mission","position":{"state":"in_transit","dockedAt":null},"mission":{"type":"foreign_recon","phase":"traveling"},"fuel":{"current":15.3659,"max":16},"warpFuel":{"current":0.44,"max":5},"unpaidYears":9,"role":"science"},
    {"id":"v_16","name":"Galileo","shipId":"hull_small","modules":["engine_warp","deep_scanner","warp_tank"],"systemId":"sys_036","status":"on_mission","position":{"state":"in_transit","dockedAt":null},"mission":{"type":"foreign_recon","phase":"traveling"},"fuel":{"current":15.8451,"max":16},"warpFuel":{"current":3.3649,"max":5},"unpaidYears":9,"role":"science"},
    {"id":"v_17","name":"Newton","shipId":"hull_small","modules":["engine_warp","deep_scanner","warp_tank"],"systemId":"sys_032","status":"on_mission","position":{"state":"in_transit","dockedAt":null},"mission":{"type":"foreign_recon","phase":"traveling"},"fuel":{"current":15.8996,"max":16},"warpFuel":{"current":4.047,"max":5},"unpaidYears":9,"role":"science"},
    {"id":"v_18","name":"Gladiator","shipId":"hull_large","modules":["engine_warp","engine_warp","engine_warp","cargo_mass","cargo_mass","deep_scanner","warp_tank","titanic_plating","weapon_missile"],"systemId":"sys_home","status":"on_mission","position":{"state":"orbiting","dockedAt":null},"mission":{"type":"interstellar_jump","phase":"in_system"},"fuel":{"current":144,"max":144},"warpFuel":{"current":3.8315,"max":5},"unpaidYears":9,"role":"warship"},
    {"id":"v_19","name":"Furia","shipId":"hull_large","modules":["engine_warp","engine_warp","engine_warp","cargo_mass","cargo_mass","deep_scanner","warp_tank","titanic_plating","weapon_missile"],"systemId":"sys_home","status":"on_mission","position":{"state":"orbiting","dockedAt":null},"mission":{"type":"interstellar_jump","phase":"in_system"},"movementOrder":{"type":"moveToPoint","status":"completed"},"fuel":{"current":143.9999,"max":144},"warpFuel":{"current":3.8574,"max":5},"unpaidYears":9,"role":"warship"},
  ],
};

// `cargoMax` — pole zapisu, którego sonda nie złapała; wyprowadzone TĄ SAMĄ formułą co gra przy tworzeniu statku
// (`Vessel.createVessel`: `calcShipStats(kadłub, moduły).cargo`). Wierność roli pilnuje S12a (rola zmierzona w grze).
for (const v of [...ZF.vessels, ...POL.vessels]) {
  const hull = HULLS[v.shipId];
  v.cargoMax = hull && v.modules?.length ? (calcShipStats(hull, v.modules)?.cargo ?? 0) : 0;
}

const UPKEEP_GRACE_YEARS = 2;   // `VesselManager.isImmobilized` = unpaidYears ≥ 2 (lata gry) — ta sama reguła co w grze
const pictureCtx = (extra = {}) => ({ isImmobilized: (v) => (v.unpaidYears ?? 0) >= UPKEEP_GRACE_YEARS, ...extra });
const tree = (data, o = {}) => {
  const pc = pictureCtx(o.picture);
  return typeof L?.buildShipTree === 'function'
    ? L.buildShipTree({
      vessels: o.vessels ?? data.vessels, fleets: o.fleets ?? data.fleets, systems: data.systems,
      entryOf: (v) => buildShipEntry(v, pc), activeSystemId: o.active ?? 'sys_home', expanded: o.expanded,
      systemName: (id) => data.systems.find((s) => s.systemId === id)?.name ?? id,
    })
    : { transit: null, systems: [], index: new Map(), fleetIndex: new Map(), total: 0 };
};
const sysIds = (t) => t.systems.map((s) => s.systemId);
const rowsOf = (t, sys) => (t.systems.find((s) => s.systemId === sys)?.groups ?? []).flatMap((g) => g.rows);
const allShipRows = (t) => [...(t.transit?.rows ?? []), ...t.systems.flatMap((s) => s.groups.flatMap((g) => g.rows))]
  .flatMap((r) => (r.kind === 'fleet' ? r.members : [r]));
const markerOf = (t, id) => allShipRows(t).find((r) => r.id === id)?.marker ?? null;

// ═══ S12 (najpierw — wierność fixture'u) ══════════════════════════════════════
header('S12 KONTROLA — fixture wierny zapisowi');
{
  const bad = [...ZF.vessels, ...POL.vessels].filter((v) => !v.isWreck && buildShipEntry(v, pictureCtx()).role !== v.role);
  ok(ZF.vessels.length === 29 && POL.vessels.length === 13 && bad.length === 0,
    `S12a rola z \`buildShipEntry\` = rola zmierzona w grze dla każdego żywego statku (rozbieżne: ${bad.map((v) => v.id).join(', ') || 'brak'})`);
  const immob = POL.vessels.filter((v) => (v.unpaidYears ?? 0) >= UPKEEP_GRACE_YEARS).map((v) => v.id);
  ok(immob.length === 9 && ZF.vessels.filter((v) => !v.isWreck && (v.unpaidYears ?? 0) >= UPKEEP_GRACE_YEARS).length === 0,
    `S12b unieruchomione za utrzymanie: Polonia 9 (${immob.join(' ')}), ZF żywe 0`);
  ok(typeof L?.buildShipTree === 'function', 'S12c moduł `ShipTreeLogic` eksportuje `buildShipTree`');
}

// ═══ S1 ═══════════════════════════════════════════════════════════════════════
header('S1  ZF gy120 — układy w kolejności lewego outlinera, tylko z Twoimi statkami');
{
  const t = tree(ZF);
  console.log('     układy: ' + sysIds(t).join(' '));
  ok(sysIds(t).join(' ') === 'sys_home sys_008 sys_059 sys_061 sys_003 sys_050',
    'S1a SEDNO: Kepler-4799 → Kochab → Lalande → Thuban → Seginus → Alsephina (kolejność lewego; układy bez Twoich statków poza listą)');
  ok(t.total === 26 && allShipRows(t).length === 26 && !allShipRows(t).some((r) => ['v_30', 'v_37', 'v_39'].includes(r.id)),
    `S1b 26 żywych statków na liście, 3 wraki poza nią (wiersze: ${allShipRows(t).length})`);
  ok(sysIds(t).length > 0 && !sysIds(t).includes('sys_067'), 'S1c Nekkar poza listą — jego jedyny statek („USS Furia”) stoi pod węzłem swojej floty');
  ok(typeof L?.buildShipTree === 'function' && t.transit === null, 'S1d brak statków w tranzycie warp → bez sekcji „W drodze” (D-UI-8: tylko gdy niepusta)');
  ok(t.systems.find((s) => s.systemId === 'sys_061')?.count === 10 && t.systems.find((s) => s.systemId === 'sys_home')?.count === 10,
    'S1e licznik układu = wiersze statków pod nim (Thuban 10 z „USS Furia”, dom 10)');
}

// ═══ S2 / S3 ══════════════════════════════════════════════════════════════════
header('S2 · S3  decyzja 6 (a) — węzeł floty u prowadzącego, członkowie pod nim');
{
  const t = tree(ZF);
  const th = t.systems.find((s) => s.systemId === 'sys_061');
  const war = th?.groups.find((g) => g.id === 'war');
  const f1 = war?.rows.find((r) => r.kind === 'fleet' && r.id === 'fleet_1');
  ok(!!f1 && f1.leadId === 'v_33' && f1.name === 'Flota Wojenna I' && f1.section === 'sys_061',
    'S2a SEDNO: „Flota Wojenna I” w Thuban, w kubełku WOJENNE — prowadzący = pierwszy żywy członek („Troop Transport Warp I”)');
  ok(f1?.members.map((r) => r.name).join(' | ') === 'USS Furia | USS Gladiator | Troop Transport Warp I',
    `S2b członkowie pod węzłem: rola (okręty, potem transport), potem nazwa (jest: ${f1?.members.map((r) => r.name).join(' | ')})`);
  const furia = f1?.members.find((r) => r.id === 'v_26');
  ok(furia?.note?.kind === 'system' && furia.note.systemId === 'sys_067' && furia.note.name === 'Nekkar'
    && f1.members.filter((r) => r.note).length === 1,
    'S2c „USS Furia” (Nekkar) z dopiskiem układu; członkowie z Thuban — bez dopisku');
  const f2 = war?.rows.find((r) => r.kind === 'fleet' && r.id === 'fleet_2');
  ok(!!f2 && f2.leadId === 'v_50' && f2.members.map((r) => r.name).join(' | ') === 'Klinga | Sztylet | Żmija | Desant I',
    `S2d „Flota Wojenna II” — prowadzący „Żmija” (pierwszy w \`memberIds\`), członkowie: ${f2?.members.map((r) => r.name).join(' | ')}`);
  const ids = allShipRows(t).map((r) => r.id);
  ok(ids.length === 26 && new Set(ids).size === ids.length, 'S3a każdy statek DOKŁADNIE raz (członek floty nie wraca jako luźny)');
  ok(t.index.get('v_26')?.section === 'sys_061' && t.index.get('v_26')?.fleetId === 'fleet_1' && t.index.get('v_23')?.fleetId === null
    && t.fleetIndex.get('fleet_1') === 'sys_061',
    'S3b indeks: „USS Furia” w sekcji Thuban pod `fleet_1`; luźny „USS Saratoga” bez floty; flota → sekcja');
}

// ═══ S4 ═══════════════════════════════════════════════════════════════════════
header('S4  kubełki typów i kolejność w kubełku (D-UI-6, §7.1)');
{
  const t = tree(ZF);
  const th = t.systems.find((s) => s.systemId === 'sys_061');
  ok(th?.groups.map((g) => g.id).join(' ') === 'war science other', `S4a Thuban: WOJENNE · NAUKOWE · POZOSTAŁE (bez pustego CARGO) — jest ${th?.groups.map((g) => g.id).join(' ')}`);
  const war = th?.groups.find((g) => g.id === 'war');
  ok(war?.rows.map((r) => (r.kind === 'fleet' ? `⛬${r.name}` : r.name)).join(' | ') === '⛬Flota Wojenna I | ⛬Flota Wojenna II | USS Saratoga',
    'S4b w kubełku: floty (wg nazwy) przed luźnymi statkami');
  const home = t.systems.find((s) => s.systemId === 'sys_home');
  ok(home?.groups.map((g) => g.id).join(' ') === 'cargo other', `S4c dom: CARGO · POZOSTAŁE (jest ${home?.groups.map((g) => g.id).join(' ')})`);
  const cargo = home?.groups.find((g) => g.id === 'cargo')?.rows.map((r) => r.name).join(' | ');
  ok(cargo === 'Dostawca II | Fracht | Fracht III | Handlarz II | Karawana | Kurier | Kurier II | Smok II | Transporter II',
    `S4d dom, CARGO — wg nazwy (${cargo})`);
  const kochab = t.systems.find((s) => s.systemId === 'sys_008');
  ok(kochab?.groups.map((g) => `${g.id}:${g.rows.map((r) => r.name).join(',')}`).join(' ') === 'war:USS WILK cargo:Handlarz III',
    'S4e Kochab: okręt w WOJENNE przed frachtowcem w CARGO');
}

// ═══ S5 ═══════════════════════════════════════════════════════════════════════
header('S5  znaczniki (D-UI-9, §7.2) — ZF gy120');
{
  const t = tree(ZF);
  const e3 = buildShipEntry(ZF.vessels.find((v) => v.id === 'v_3'), pictureCtx());
  ok(e3.tone === 'alert' && markerOf(t, 'v_3') === 'moving',
    `S5a SEDNO: „Kurier” w locie z niskim paliwem (ton \`${e3.tone}\`) → „w ruchu” (sam ton zasłaniał ruch)`);
  ok(markerOf(t, 'v_35') === 'moving' && markerOf(t, 'v_53') === 'moving', 'S5b „Smok II” i „Galileo” w locie → „w ruchu”');
  ok(markerOf(t, 'v_5') === 'docked' && markerOf(t, 'v_6') === 'docked' && markerOf(t, 'v_14') === 'docked',
    'S5c zadokowane → „zadokowany” — także z alertem (czeka na paliwo, niski poziom paliwa)');
  ok(markerOf(t, 'v_23') === 'idle' && markerOf(t, 'v_21') === 'idle' && markerOf(t, 'v_54') === 'idle',
    'S5d misja stojąca (skok warp zakończony, zwiad na orbicie) i orbita bez zadania → „bezczynny”');
  const war = t.systems.find((s) => s.systemId === 'sys_061')?.groups.find((g) => g.id === 'war')?.rows ?? [];
  ok(war.find((r) => r.id === 'fleet_1')?.marker === 'docked' && war.find((r) => r.id === 'fleet_2')?.marker === 'idle',
    'S5e węzeł floty = najpilniejszy znacznik członków (I: dwa w doku + jeden bezczynny → „zadokowany”; II: same orbity → „bezczynny”)');
}

// ═══ S6 ═══════════════════════════════════════════════════════════════════════
header('S6  Polonia gy79 — „bez paliwa” (unieruchomione za utrzymanie)');
{
  const t = tree(POL);
  const noFuel = allShipRows(t).filter((r) => r.marker === 'noFuel').map((r) => r.id).sort();
  ok(noFuel.join(' ') === ['v_10', 'v_13', 'v_14', 'v_16', 'v_17', 'v_18', 'v_19', 'v_7', 'v_9'].sort().join(' '),
    `S6a SEDNO: „bez paliwa” dokładnie dla 9 unieruchomionych (${noFuel.join(' ')})`);
  ok(markerOf(t, 'v_16') === 'noFuel' && buildShipEntry(POL.vessels.find((v) => v.id === 'v_16'), pictureCtx()).moving === true,
    'S6b „Galileo” w locie, ale unieruchomiony → „bez paliwa” (priorytet nad „w ruchu”)');
  ok(['v_3', 'v_4', 'v_5', 'v_6'].every((id) => markerOf(t, id) === 'docked'), 'S6c reszta (w doku, „Merkury” z 1 rokiem zaległości) → „zadokowany”');
  ok(sysIds(t).join(' ') === 'sys_home sys_032 sys_036 sys_044', `S6d układy: dom · Naos · Akhernar · Mira (jest ${sysIds(t).join(' ')})`);
}

// ═══ S7 ═══════════════════════════════════════════════════════════════════════
header('S7  „W drodze” (D-UI-8, §7.3)');
{
  const vs = ZF.vessels.map((v) => ({ ...v }));
  const warp = (id) => { const v = vs.find((x) => x.id === id); v.systemId = null; v.position = { state: 'orbiting', dockedAt: null }; v.mission = { type: 'interstellar_jump', phase: 'warp_transit' }; return v; };
  warp('v_19');                       // luźny „Dyplomata” w skoku
  warp('v_33');                       // prowadzący „Floty Wojennej I” w skoku
  warp('v_51');                       // członek „Floty Wojennej II” (prowadzący w Thuban) w skoku
  const t = tree(ZF, { vessels: vs });
  const tr = t.transit;
  ok(!!tr && tr.rows.map((r) => (r.kind === 'fleet' ? `⛬${r.id}` : r.id)).join(' ') === '⛬fleet_1 v_19',
    `S7a SEDNO: sekcja „W drodze”: węzeł „Floty Wojennej I” (prowadzący w skoku) i „Dyplomata” (jest ${tr?.rows.map((r) => r.id).join(' ')})`);
  ok(markerOf(t, 'v_19') === 'moving' && tr?.count === 4, 'S7b statek w skoku → „w ruchu”; licznik sekcji = 4 (węzeł z 3 członkami + 1)');
  const f1 = tr?.rows.find((r) => r.id === 'fleet_1');
  ok(f1?.members.filter((r) => r.note?.kind === 'system').map((r) => r.note.name).sort().join(',') === 'Nekkar,Thuban',
    'S7c członkowie floty spoza skoku — z dopiskiem swoich układów (Thuban, Nekkar)');
  const f2 = rowsOf(t, 'sys_061').find((r) => r.id === 'fleet_2');
  ok(f2?.members.find((r) => r.id === 'v_51')?.note?.kind === 'transit' && f2.section === 'sys_061',
    'S7d członek w skoku floty z Thuban — pod węzłem w Thuban z dopiskiem „w drodze”');
  ok(!!tr && !sysIds(t).includes('sys_003'), 'S7e Seginus znika z listy — jego jedyny statek jest w drodze');
}

// ═══ S8 ═══════════════════════════════════════════════════════════════════════
header('S8  priorytet znaczników');
{
  const m = (e) => (typeof L?.shipMarker === 'function' ? L.shipMarker(e) : null);
  ok(m({ tone: 'combat', alerts: [{ kind: 'immobilized' }], moving: true, state: 'docked' }) === 'combat', 'S8a w walce wygrywa ze wszystkim');
  ok(m({ tone: 'alert', alerts: [{ kind: 'stranded' }], moving: true }) === 'noFuel' && m({ tone: 'alert', alerts: [{ kind: 'immobilized' }], state: 'docked' }) === 'noFuel',
    'S8b „bez paliwa” = alert stranded ∨ immobilized — przed „w ruchu” i „zadokowany”');
  ok(m({ tone: 'alert', alerts: [{ kind: 'lowFuel' }], moving: true, state: 'in_transit' }) === 'moving', 'S8c niski poziom paliwa w locie → „w ruchu”');
  ok(m({ tone: 'idle', alerts: [], moving: false, state: 'docked' }) === 'docked' && m({ tone: 'mission', alerts: [], moving: false, state: 'orbiting' }) === 'idle',
    'S8d zadokowany przed bezczynnym; misja stojąca → bezczynny');
  ok(m({ tone: 'mission', alerts: [], state: 'orbiting', systemId: null }) === 'moving', 'S8e skok warp (`systemId: null`) → „w ruchu”');
  ok(m({ tone: 'move', alerts: [] }) === 'moving' && m(null) === 'idle', 'S8f wpis bez pola `moving` — ton `move`; brak wpisu → bezczynny');
}

// ═══ S9 ═══════════════════════════════════════════════════════════════════════
header('S9  zwijanie (D-UI-4, §7.5)');
{
  const t = tree(ZF, { active: 'sys_061' });
  ok(t.systems.filter((s) => s.expanded).map((s) => s.systemId).join(' ') === 'sys_061' && t.systems.find((s) => s.systemId === 'sys_061')?.isActive === true,
    'S9a domyślnie rozwinięty tylko bieżący układ (Thuban)');
  const t2 = tree(ZF, { active: 'sys_061', expanded: (id) => id === 'sys_home' });
  ok(t2.systems.filter((s) => s.expanded).map((s) => s.systemId).join(' ') === 'sys_home', 'S9b jawny stan wygrywa (dom rozwinięty, bieżący zwinięty)');
  ok(t2.systems.find((s) => s.systemId === 'sys_061')?.groups.length === 3, 'S9c zwinięty układ dalej niesie wiersze (indeks / przewijanie do zaznaczenia)');
}

// ═══ S10 ══════════════════════════════════════════════════════════════════════
header('S10 `buildShipEntry.moving`');
{
  const v3 = ZF.vessels.find((v) => v.id === 'v_3');
  const e = buildShipEntry(v3, pictureCtx());
  ok(e.moving === true && e.tone === 'alert', `S10a „Kurier” w locie z alertem: \`moving: ${e.moving}\`, ton \`${e.tone}\``);
  const docked = buildShipEntry(ZF.vessels.find((v) => v.id === 'v_5'), pictureCtx());
  const order = buildShipEntry({ ...ZF.vessels.find((v) => v.id === 'v_54'), movementOrder: { type: 'patrol', status: 'active' } }, pictureCtx());
  ok(docked.moving === false && order.moving === true && order.tone === 'move', 'S10b w doku — false; aktywny rozkaz (patrol) na orbicie — true, ton `move`');
  const wreck = buildShipEntry(ZF.vessels.find((v) => v.id === 'v_30'), pictureCtx());
  ok(wreck.isWreck === true && wreck.moving === false, 'S10c wrak — `moving: false`');
}

// ═══ S11 ══════════════════════════════════════════════════════════════════════
header('S11 słowniki');
{
  const G = L?.SHIP_TYPE_GROUPS;
  ok(Array.isArray(G) && G.map((g) => `${g.id}:${g.roles.join(',')}`).join(' ') === 'war:warship,assault,transport science:science cargo:cargo other:colony,scout',
    'S11a kubełki = §7.1 (WOJENNE: warship, assault, transport · NAUKOWE · CARGO · POZOSTAŁE: colony, scout)');
  ok(L?.SHIP_MARKERS?.join(' ') === 'combat noFuel moving docked idle', 'S11b znaczniki w kolejności priorytetu (§7.2)');
  const tones = L?.MARKER_TONES ?? {};
  const presets = ['ambient_1', 'ambient_2', 'ambient_3', 'ambient_4', 'neon_cyber', 'default'];
  const missing = presets.flatMap((p) => Object.entries(tones).filter(([, tok]) => typeof PRESET_THEMES[p]?.[tok] !== 'string').map(([m, tok]) => `${p}:${m}→${tok}`));
  ok(Object.keys(tones).length === 5 && missing.length === 0, `S11c kolor każdego znacznika to token motywu obecny w presetach ekranu tytułowego i \`default\` (brakuje: ${missing.join(', ') || 'nic'})`);
  ok(typeof L?.typeGroupOf === 'function' && L.typeGroupOf('assault') === 'war' && L.typeGroupOf('nieznana') === 'other', 'S11d nieznana rola → POZOSTAŁE');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
