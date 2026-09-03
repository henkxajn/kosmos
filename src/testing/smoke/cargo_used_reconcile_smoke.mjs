// 244 / C3 — keeper REKONCYLIACJI `cargoUsed` (`NT_LINK_PLAN.md`).
//
// PO CO: `cargoUsed` był agregatem DENORMALIZOWANYM (przyrostowe `+/- actual*weight`),
// a `vessel.cargo` jest czyszczone (`delete` przy ≤ 0) — więc oba pola się rozjeżdżały:
// mapa PUSTA, a `cargoUsed` niezerowe. ZMIERZONE: cykl symetryczny daje dokładnie 0
// (`a+x−x===a`), ale asymetria WIELOKURSOWA — a tak lata kurier AI, bo `_loadByRarity`
// ładuje ten sam surowiec w DWÓCH przebiegach, a `_deliverAndDock` rozładowuje jednym —
// zostawia resztkę: 8 kursów → 7,105e-15; przebieg 60 gy → 1,4210854715202004e-14, czyli
// wartość z ŻYWEJ GRY co do bitu.
//
// ⚠ Resztka NIE zamrażała statku (osobna teza, OBALONA pomiarem). Przewracała dokładnie
// dwie bramki kształtu `cargoUsed > 0` — i to one są tu pinowane SKUTKIEM.
//
//   T1  po 8 kursach z dwuchunkowym Xe `cargoUsed` == DOKŁADNIE 0 (sedno naprawy)
//   T2  INWARIANT: po KAŻDEJ operacji `cargoUsed === Σ qty·weight` liczone niezależnie
//   T3  SKUTEK #1 (`EmpireLogisticsSystem:441`): kurier, który nic nie załadował, NIE
//       rusza w jałowy kurs powrotny, mimo że placówka ma jeszcze resztki poniżej sztuki
//   T4  SKUTEK #2 (`TransportOrderSystem:246`): pusty statek nie czyta się jako załadowany
//   T5  ⚠ KONTROLA: cykl SYMETRYCZNY daje wartości IDENTYCZNE jak przed naprawą
//   T6  ⚠ KONTROLA: `cargo` jest źródłem prawdy — ładunek dopisany ręcznie (wzorzec
//       `ExpeditionSystem:631`) NIE ginie przy przeliczeniu

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import EntityManager from '../../core/EntityManager.js';
// ⚠ IMPORT PRZEZ PRZESTRZEŃ NAZW, nie nazwany: import nazwany BRAKUJĄCEGO eksportu wywala się
//   przy linkowaniu, więc na kodzie sprzed C3 keeper nie doszedłby do ANI JEDNEJ asercji —
//   a pomiar fail-first ma pokazywać, ILE i KTÓRE piny padają, nie że plik się nie ładuje.
import * as VesselMod from '../../entities/Vessel.js';
const { loadCargo, unloadCargo } = VesselMod;
const recalcCargoUsed = VesselMod.recalcCargoUsed ?? ((v) => v?.cargoUsed ?? 0);
import { MINED_RESOURCES } from '../../data/ResourcesData.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const mkStore = (init = {}) => {
  const inv = new Map(Object.entries(init));
  return {
    inventory: inv,                                  // ⚠ akcesor, którego używa `_getAvailable`
    getAmount: (r) => inv.get(r) ?? 0,
    spend:   (c) => { for (const [k, v] of Object.entries(c)) inv.set(k, (inv.get(k) ?? 0) - v); return true; },
    receive: (g) => { for (const [k, v] of Object.entries(g)) inv.set(k, (inv.get(k) ?? 0) + v); },
  };
};
const mkVessel = () => ({ id: 'v_probe', shipId: 'hull_small', cargoMax: 200, cargoUsed: 0, cargo: {} });
/** Niezależne przeliczenie — celowo NIE wołamy tu funkcji produkcyjnej. */
const expected = (v) => Object.entries(v.cargo)
  .reduce((s, [id, q]) => s + q * (MINED_RESOURCES[id]?.weight ?? 1), 0);

// ── T1 — sedno naprawy ───────────────────────────────────────────────────────
console.log('T1 — 8 kursów z dwuchunkowym Xe zostawia DOKŁADNIE 0 (nie resztkę)');
{
  const v = mkVessel(), out = mkStore({ Xe: 1e7, Nt: 1e7 }), cap = mkStore({});
  for (let trip = 0; trip < 8; trip++) {
    loadCargo(v, 'Xe', 333, out); loadCargo(v, 'Nt', 7, out); loadCargo(v, 'Xe', 100, out);
    for (const [rid, q] of Object.entries({ ...v.cargo })) unloadCargo(v, rid, q, cap);
  }
  assert(v.cargoUsed === 0, `T1: cargoUsed === 0 po 8 kursach (${v.cargoUsed})`);
  assert(Object.keys(v.cargo).length === 0, 'T1: …i mapa `cargo` jest pusta (oba pola zgodne)');
}

// ── T2 — inwariant po każdej operacji ────────────────────────────────────────
console.log('T2 — INWARIANT `cargoUsed === Σ qty·weight` po każdej operacji');
{
  const v = mkVessel(), out = mkStore({ Xe: 1e7, Nt: 1e7, Fe: 1e7, Li: 1e7 }), cap = mkStore({});
  let ok = true, steps = 0;
  const check = () => { steps++; if (Math.abs(v.cargoUsed - expected(v)) > 0) ok = false; };
  for (const [id, q] of [['Xe', 400], ['Nt', 5], ['Fe', 10], ['Li', 20], ['Xe', 100]]) { loadCargo(v, id, q, out); check(); }
  unloadCargo(v, 'Nt', 3, cap); check();
  unloadCargo(v, 'Xe', 250, cap); check();
  for (const [rid, q] of Object.entries({ ...v.cargo })) { unloadCargo(v, rid, q, cap); check(); }
  assert(steps >= 9, `T2: kontrola pinu — inwariant sprawdzony realnie ${steps} razy`);
  assert(ok, 'T2: inwariant trzyma CO DO BITU na całej sekwencji');
  assert(v.cargoUsed === 0, `T2: pusta ładownia ⇒ dokładnie 0 (${v.cargoUsed})`);
}

// ── T3 — SKUTEK #1: koniec jałowego kursu ────────────────────────────────────
console.log('T3 — SKUTEK: kurier, który NIC nie załadował, nie rusza w jałowy kurs powrotny');
{
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  const empId  = core.empireRegistry.listAll()[0].id;
  const empire = core.empireRegistry.get(empId);
  const cap    = (core.empireRegistry.getColoniesByEmpire(empId) ?? [])
    .find(c => c && !c.isOutpost && c.resourceSystem);
  const els = core.empireLogisticsSystem;

  // Placówka z resztkami PONIŻEJ jednej sztuki: `_outpostHasMined` = true (>0), ale
  // `loadCargo` floor'uje dostępność do 0 ⇒ ładunek nie wchodzi. To JEDYNY układ, w którym
  // resztka w `cargoUsed` decydowała o wyjeździe (bramka `stillHasLoadable && cargoUsed > 0`).
  const inv = new Map([['Nt', 0.4]]);
  const outpost = { planetId: 'probe_dust', name: 'probe_dust', isOutpost: true, ownerEmpireId: empId,
    resourceSystem: { inventory: inv, getAmount: (r) => inv.get(r) ?? 0, spend: () => true, receive: () => {} } };
  core.colonyManager._colonies.set('probe_dust', outpost);
  EntityManager.add({ id: 'probe_dust', name: 'probe_dust', type: 'planet', x: 60, y: 0,
    systemId: EntityManager.get(cap.planetId)?.systemId, deposits: [] });

  const route = { routeId: 'r_dust', motherId: cap.planetId, outpostId: 'probe_dust', courierIds: [] };
  const v = core.vesselManager.createAndRegister('hull_small', cap.planetId,
    { modules: ['engine_chemical', 'cargo_small'] });
  v.serviceState = 'active'; v.status = 'on_mission';
  v.position.state = 'orbiting'; v.position.dockedAt = 'probe_dust';
  v.mission = { type: 'logistics', targetId: 'probe_dust', phase: 'orbiting_body',
    departYear: 0, arrivalYear: 0, returnYear: 0 };
  route.courierIds.push(v.id);

  assert(v.cargoUsed === 0, `T3: kontrola pinu — ładownia startuje CZYSTA (${v.cargoUsed})`);
  els._advanceRouteCourier(empire, route, v.id, cap);
  assert(v.mission?.phase === 'orbiting_body',
    `T3: pusty kurier CZEKA zamiast wracać na pusto (${v.mission?.phase})`);

  // kontrola pinu: z resztką sprzed naprawy TA SAMA sytuacja wypychała statek w drogę
  v.cargoUsed = 1.4210854715202004e-14;
  els._advanceRouteCourier(empire, route, v.id, cap);
  assert(v.mission?.phase === 'returning',
    'T3: ⚠ kontrola pinu — z resztką (stan sprzed 244) ten sam kurier RUSZA na pusto');
}

// ── T4 — SKUTEK #2: bramka zlecenia gracza ───────────────────────────────────
console.log('T4 — SKUTEK: `TransportOrderSystem:246` (`cargoUsed > 0`) nie widzi pustego statku');
{
  // ⚠ Wzorzec MUSI być tym, który resztkę NAPRAWDĘ produkuje (8 kursów, dwuchunkowy Xe).
  //   Pojedynczy kurs — nawet dwuchunkowy — daje 0 także PRZED naprawą, więc pin oparty
  //   na nim przechodziłby po obu stronach i nie pinowałby niczego.
  const v = mkVessel(), out = mkStore({ Xe: 1e7, Nt: 1e7 }), cap = mkStore({});
  for (let trip = 0; trip < 8; trip++) {
    loadCargo(v, 'Xe', 333, out); loadCargo(v, 'Nt', 7, out); loadCargo(v, 'Xe', 100, out);
    for (const [rid, q] of Object.entries({ ...v.cargo })) unloadCargo(v, rid, q, cap);
  }
  assert(Object.keys(v.cargo).length === 0, 'T4: kontrola pinu — ładownia jest FAKTYCZNIE pusta');
  assert(!((v.cargoUsed ?? 0) > 0),
    `T4: predykat „statek jest załadowany" jest FAŁSZYWY po rozładunku (${v.cargoUsed})`);
}

// ── T5 — KONTROLA: cykl symetryczny bez zmian ────────────────────────────────
console.log('T5 — ⚠ KONTROLA: wartości dla cykli symetrycznych IDENTYCZNE jak przed naprawą');
{
  const v = mkVessel(), out = mkStore({ Xe: 1e7 }), cap = mkStore({});
  loadCargo(v, 'Xe', 666, out);
  assert(v.cargoUsed === 66.60000000000001,
    `T5: 666 × 0,1 daje TĘ SAMĄ wartość co dotąd (${v.cargoUsed})`);
  const v2 = mkVessel(); loadCargo(v2, 'Nt', 13, mkStore({ Nt: 1000 }));
  assert(v2.cargoUsed === 65, `T5: 13 Nt × 5,0 = 65 (bez zmian) (${v2.cargoUsed})`);
  unloadCargo(v, 'Xe', 666, cap);
  assert(v.cargoUsed === 0, 'T5: …a pełny rozładunek dalej daje 0');
}

// ── T6 — KONTROLA: `cargo` jest źródłem prawdy ───────────────────────────────
console.log('T6 — ⚠ KONTROLA: ładunek dopisany RĘCZNIE (wzorzec ExpeditionSystem) nie ginie');
{
  const v = mkVessel();
  v.cargo.Fe = 10;                       // pisarz spoza Vessel.js dopisuje do `cargo`…
  v.cargoUsed = 0;                       // …a agregat celowo zostawiamy niespójny
  loadCargo(v, 'Xe', 100, mkStore({ Xe: 1000 }));
  assert(Math.abs(v.cargoUsed - (10 * 2.0 + 100 * 0.1)) < 1e-9,
    `T6: przeliczenie ZLICZA ładunek dopisany ręcznie (${v.cargoUsed}, oczekiwane 30)`);
  assert(recalcCargoUsed(v) === v.cargoUsed, 'T6: helper jest idempotentny');
}

console.log(`\n${pass}/${pass + fail} OK${fail ? `, ${fail} FAIL` : ''}`);
process.exit(fail ? 1 : 0);
