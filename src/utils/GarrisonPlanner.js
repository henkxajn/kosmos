// AI GARRISON (G2-3a) — PLANER GARNIZONU KOLONII AI: czyste funkcje nad tabelą `src/data/GarrisonData.js`.
//
// Odpowiada na jedno pytanie: „ILE jednostek, JAKICH, z jakim morale, NA KTÓRYCH ciałach i NA KTÓRYCH heksach
// postawiłoby imperium, gdyby mobilizowało się teraz”. NICZEGO nie tworzy — tworzenie (`createAIUnit`),
// zaczep wojny, flaga mobilizacji, usuwanie jednostek i stempel kafli to G2-3b. W grze nie woła go nic poza
// odczytem w konsoli (`KOSMOS.debug.garrisonPlan`).
//
// Decyzje (`docs/design/AI_GARRISON_PLAN.md` §1, podpis 2026-10-02):
//   D1  limit = max(2, floor(POP imperium / 16))           → `garrisonBaseLimit`
//   D9  drabina sumy poziomów fabryk (morale, skład, ×)     → `garrisonTier`, `garrisonLimit`, `garrisonComposition`
//   D10 rozstawienie wokół kafla stolicy, jeden na heks     → `garrisonAnchor`, `garrisonHexes`
//       (stolica nie do stania → reguła placówki, odp. (d))
//   D11 podział między ciałami                              → `garrisonAllocation`
//   D12 stolica = `DirectorProduction.capitalOf`            → `readEmpireGarrisonSnapshot`
//   G3-1 odrastanie: ranking niedoboru, archetyp, żywe       → `garrisonShortfall`, `garrisonRegrowthArchetype`,
//        jednostki imperium na jego ciałach                    `readEmpireGarrisonUnits` (wykonuje `GarrisonSystem`)
//
// ⚠ ZAOKRĄGLENIE LIMITU (odp. właściciela (c), 2026-10-03): floor PO klamrze minimum 2 — floor(limit D1 ×
//   mnożnik D9). Ten sam kierunek co floor w D1 (reguła nie daje jednostki, której nie „zarobiła” w całości);
//   limit pozostaje niemalejący wzdłuż drabiny; przy mnożniku 1 wynik jest identyczny z D1. Przy jedynym
//   mnożniku drabiny po rewizji (×1,25) kolejność „klamra, potem mnożnik” i odwrotna dają ten sam wynik dla
//   KAŻDEGO POP (floor(2 × 1,25) = 2) — widoczny jest wyłącznie kierunek zaokrąglenia (floor(13,75) = 13).
// ⚠ SKŁAD LICZONY NA CIAŁO, nie na całe imperium (odp. (b)): „co trzecia jednostka” to co trzecia jednostka
//   garnizonu TEGO ciała — ciało z jedną jednostką nie dostaje samotnej artylerii.
// ⚠ BRAK MIEJSCA (odp. (f)): jednostki, dla których nie ma wolnego heksu, na którym da się stanąć, NIE
//   powstają i zostają w rezerwie (`missing`) — nigdy stos. Planer tylko liczy `missing`; tworzy G2-3b.
// ⚠ PLANER NIE ZNA `window`: czytnik żywego świata dostaje obiekt usług (`K`, w grze `window.KOSMOS`) jako
//   argument — dzięki temu działa na prawdziwym świecie w keeperze i niczego globalnego nie dotyka.
// ⚠ Liczby żyją wyłącznie w `GarrisonData.js` (pin `g2_planner_smoke` P0e).

import {
  GARRISON_POP_PER_UNIT, GARRISON_MIN_UNITS, GARRISON_LADDER, GARRISON_FACTORY_BUILDING,
  GARRISON_BASE_ARCHETYPE, GARRISON_ARTILLERY_ARCHETYPE, GARRISON_CAPITAL_SHARE_DIVISOR,
  GARRISON_OUTPOST_DEPOSITS, GARRISON_SPREAD_MAX_RADIUS, INVASION_BASE_ARCHETYPE, AI_FIELDED_ARCHETYPES,
} from '../data/GarrisonData.js';
import { isStandableTile } from '../data/GroundUnitData.js';
import { colonyDevScore } from './ColonyDevScore.js';

/** Liczba skończona i dodatnia, inaczej 0 (POP / suma fabryk / liczba jednostek z niepewnego źródła). */
const nonNegative = (x) => (Number.isFinite(x) && x > 0 ? x : 0);

// ── D1 / D9 — limit, szczebel, skład ─────────────────────────────────────────────────────

/**
 * D1 — limit bazowy z POP imperium. Lustro `ColonyManager._getMaxGroundUnits` (pin wykonaniowy P1d).
 * @param {number} pop — POP imperium (suma populacji jego pełnych kolonii)
 * @returns {number} ≥ GARRISON_MIN_UNITS
 */
export function garrisonBaseLimit(pop) {
  return Math.max(GARRISON_MIN_UNITS, Math.floor(Math.floor(nonNegative(pop)) / GARRISON_POP_PER_UNIT));
}

/**
 * D9 — szczebel drabiny dla sumy poziomów fabryk imperium.
 * @param {{factoryLevels:number}} empire
 * @returns {{index:number, minFactoryLevels:number, morale:number, artilleryEvery:number, limitMult:number}}
 */
export function garrisonTier(empire) {
  const levels = nonNegative(empire?.factoryLevels);
  let index = 0;
  for (let i = 0; i < GARRISON_LADDER.length; i++) {
    if (levels >= GARRISON_LADDER[i].minFactoryLevels) index = i;
  }
  const row = GARRISON_LADDER[index];
  return {
    index, minFactoryLevels: row.minFactoryLevels, morale: row.morale,
    artilleryEvery: row.artilleryEvery, limitMult: row.limitMult,
  };
}

/**
 * D1 × D9 — limit garnizonu imperium. Zaokrąglenie: floor (nagłówek pliku).
 * @param {{pop:number, factoryLevels:number}} empire
 * @returns {number}
 */
export function garrisonLimit(empire) {
  return Math.floor(garrisonBaseLimit(empire?.pop) * garrisonTier(empire).limitMult);
}

/**
 * D9 — skład garnizonu JEDNEGO ciała: co `artilleryEvery`-ta jednostka to `rocket_artillery`, reszta
 * `garrison_unit`. `aa_platform` nigdy.
 * @param {number} count — liczba jednostek na ciele
 * @param {{artilleryEvery:number}} tier — wynik `garrisonTier`
 * @returns {string[]} id archetypów, długość = count
 */
export function garrisonComposition(count, tier) {
  const n = Math.floor(nonNegative(count));
  const every = nonNegative(tier?.artilleryEvery);
  const out = [];
  for (let i = 1; i <= n; i++) {
    out.push(every > 0 && i % every === 0 ? GARRISON_ARTILLERY_ARCHETYPE : GARRISON_BASE_ARCHETYPE);
  }
  return out;
}

/**
 * G2b (D7, D9) — skład DESANTU imperium: `count` jednostek, baza `INVASION_BASE_ARCHETYPE`, na szczeblach drabiny
 * z artylerią co `artilleryEvery`-ta jednostka fali to `rocket_artillery`. Ta sama reguła co skład garnizonu ciała
 * (`garrisonComposition`), liczona na jedną falę desantu — fala z jedną albo dwiema jednostkami nie dostaje artylerii.
 * Szczebel czyta wołający w chwili desantu (`garrisonTier(readEmpireGarrisonSnapshot(…))`); `limitMult` desantu nie
 * dotyczy — liczbę jednostek ustala wołający.
 * @param {number} count — liczba jednostek fali
 * @param {{artilleryEvery:number}} tier — wynik `garrisonTier`
 * @returns {string[]} id archetypów, długość = count
 */
export function invasionComposition(count, tier) {
  return garrisonComposition(count, tier).map(a => (a === GARRISON_BASE_ARCHETYPE ? INVASION_BASE_ARCHETYPE : a));
}

/**
 * G2b (D7) — typy jednostek fali desantu. Bez listy — `invasionComposition(count, tier)`. Z jawną listą (`embarkedTroops`)
 * — jej pierwsze min(długość, `count`) wpisów, jak dotąd; wpis spoza typów prostych AI (`AI_FIELDED_ARCHETYPES`, np.
 * legacy `infantry` ze starego zapisu) zastępuje typ ze składu szczebla na tej samej pozycji — liczba jednostek zostaje,
 * a AI nie wystawia ani jednostki legacy, ani typu spoza D7.
 * @param {string[]|null} list
 * @param {number} count
 * @param {{artilleryEvery:number}} tier
 * @returns {string[]}
 */
export function invasionTroops(list, count, tier) {
  if (!Array.isArray(list) || list.length === 0) return invasionComposition(count, tier);
  const n = Math.min(list.length, Math.floor(nonNegative(count)));
  const slots = invasionComposition(n, tier);
  return list.slice(0, n).map((type, i) => (AI_FIELDED_ARCHETYPES.includes(type) ? type : slots[i]));
}

// ── D11 — podział między ciałami ─────────────────────────────────────────────────────────

/**
 * D11 — stolica dostaje ceil(limit / 2); reszta po jednej jednostce na ciało; nadwyżka wraca do stolicy;
 * bez kandydatów wszystko idzie do stolicy. Kandydaci = ciała imperium poza stolicą; placówka tylko ze
 * złożem Xe albo Nt. Kolejność kandydatów: (1) pełne kolonie przed placówkami, (2) `devScore` malejąco,
 * (3) kolejność w `empire.colonies` (pole `order`).
 *
 * @param {{pop:number, factoryLevels:number, capitalId:string|null,
 *          bodies:Array<{planetId:string, order?:number, isOutpost:boolean, devScore:number, hasRequiredDeposit:boolean}>}} empire
 * @returns {{limit:number, capitalId:string|null, capitalShare:number, surplus:number,
 *            perBody:Array<{planetId:string, role:'capital'|'colony'|'outpost', count:number}>,
 *            skipped:string[], excluded:string[], reason:string|null}}
 */
export function garrisonAllocation(empire) {
  const limit = garrisonLimit(empire);
  const capitalId = empire?.capitalId ?? null;
  if (!capitalId) {
    return { limit, capitalId: null, capitalShare: 0, surplus: 0, perBody: [], skipped: [], excluded: [], reason: 'no_capital' };
  }
  const bodies = (empire?.bodies ?? []).map((b, i) => ({ ...b, order: Number.isFinite(b?.order) ? b.order : i }));
  const others = bodies.filter(b => b.planetId !== capitalId);
  const excluded = others.filter(b => b.isOutpost && !b.hasRequiredDeposit).map(b => b.planetId);
  const candidates = others
    .filter(b => !b.isOutpost || b.hasRequiredDeposit)
    .sort((a, b) => (Number(!!a.isOutpost) - Number(!!b.isOutpost))
                 || (nonNegative(b.devScore) - nonNegative(a.devScore))
                 || (a.order - b.order));
  const capitalShare = Math.ceil(limit / GARRISON_CAPITAL_SHARE_DIVISOR);
  const rest = Math.max(0, limit - capitalShare);
  const chosen = candidates.slice(0, rest);
  const surplus = rest - chosen.length;
  return {
    limit, capitalId, capitalShare, surplus,
    perBody: [
      { planetId: capitalId, role: 'capital', count: capitalShare + surplus },
      ...chosen.map(b => ({ planetId: b.planetId, role: b.isOutpost ? 'outpost' : 'colony', count: 1 })),
    ],
    skipped: candidates.slice(chosen.length).map(b => b.planetId),
    excluded,
    reason: null,
  };
}

// ── D10 — gdzie stoją ────────────────────────────────────────────────────────────────────

/**
 * Kotwica rozstawienia: kafel stolicy (`capitalBase`), jeśli da się na nim stanąć. Dla placówki, kolonii bez
 * kafla stolicy ORAZ kolonii, której stolicy nie da się zająć (stary zapis ze stolicą na oceanie, D17) —
 * REGUŁA PLACÓWKI: pierwszy kafel z budynkiem, na którym da się stanąć (odp. właściciela (d), 2026-10-03).
 * To kafle z budynkiem decydują wtedy o przejęciu (D17: `InvasionSystem.holdsDecisiveGround` — dowolny własny
 * kafel z budynkiem); kotwica wybiera z nich pierwszy w kolejności siatki.
 * ⚠ Zapas zdegenerowany: gdy żaden kafel z budynkiem nie nadaje się do stania, kotwicą jest pierwszy kafel
 *   z budynkiem (także stolica nie do stania) — spirala i tak pomija kafle, na których nie da się stanąć,
 *   więc garnizon staje wokół, nigdy NA nim.
 * @param {HexGrid} grid
 * @param {boolean} [isOutpost]
 * @returns {HexTile|null}
 */
export function garrisonAnchor(grid, isOutpost = false) {
  const tiles = grid?.toArray?.() ?? [];
  if (!isOutpost) {
    const capital = tiles.find(t => t?.capitalBase);
    if (capital && isStandableTile(capital)) return capital;
  }
  const withBuilding = tiles.filter(t => t?.buildingId);
  return withBuilding.find(t => isStandableTile(t)) ?? withBuilding[0] ?? null;
}

/**
 * D10 — heksy dla `count` jednostek na ciele: spirala wokół kotwicy (promień z danych, jak
 * `ColonyManager._findGroundUnitSpawn`), wyłącznie kafle, na których da się stanąć, jedna jednostka na heks,
 * z pominięciem heksów zajętych (`occupied`: zbiór kluczy `"q,r"`). Mniej miejsca niż jednostek ⇒ `missing`
 * — NIGDY stos (tu planer świadomie różni się od spirali spawnu, która w ostateczności stawia na stolicy).
 * @param {{grid:HexGrid|null, isOutpost?:boolean, occupied?:Set<string>}} body
 * @param {number} count
 * @returns {{anchor:{q:number,r:number}|null, hexes:Array<{q:number,r:number}>, missing:number}}
 */
export function garrisonHexes(body, count) {
  const n = Math.floor(nonNegative(count));
  const grid = body?.grid ?? null;
  const anchorTile = grid ? garrisonAnchor(grid, !!body?.isOutpost) : null;
  const anchor = anchorTile ? { q: anchorTile.q, r: anchorTile.r } : null;
  if (!anchorTile || n === 0) return { anchor, hexes: [], missing: n };
  const occupied = body?.occupied ?? null;
  const taken = new Set();
  const hexes = [];
  for (const tile of grid.spiral(anchorTile.q, anchorTile.r, GARRISON_SPREAD_MAX_RADIUS)) {
    if (hexes.length >= n) break;
    if (!isStandableTile(tile)) continue;
    const key = `${tile.q},${tile.r}`;
    if (taken.has(key) || occupied?.has?.(key)) continue;
    taken.add(key);
    hexes.push({ q: tile.q, r: tile.r });
  }
  return { anchor, hexes, missing: n - hexes.length };
}

// ── Plan imperium ────────────────────────────────────────────────────────────────────────

/**
 * Pełny plan imperium: szczebel, limit, podział, skład i morale na ciało; heksy — gdy `bodyContext` poda
 * siatkę ciała (`(planetId) => {grid, isOutpost, occupied}`).
 */
export function planEmpireGarrison(empire, bodyContext = null) {
  const tier = garrisonTier(empire);
  const alloc = garrisonAllocation(empire);
  const perBody = alloc.perBody.map(p => {
    const ctx = typeof bodyContext === 'function' ? bodyContext(p.planetId) : null;
    return {
      ...p,
      morale: tier.morale,
      composition: garrisonComposition(p.count, tier),
      hexes: ctx ? garrisonHexes(ctx, p.count) : null,
    };
  });
  return {
    empireId: empire?.empireId ?? null,
    pop: nonNegative(empire?.pop), factoryLevels: nonNegative(empire?.factoryLevels),
    tier, limit: alloc.limit, capitalId: alloc.capitalId, capitalShare: alloc.capitalShare, surplus: alloc.surplus,
    perBody, skipped: alloc.skipped, excluded: alloc.excluded, reason: alloc.reason,
  };
}

// ── G3-1 — odrastanie strat ──────────────────────────────────────────────────────────────

/**
 * G3-1 — ciała do odrastania: ciała planu z NIEDOBOREM (planowane − żywe > 0), malejąco wg niedoboru, remis —
 * kolejność planu (stolica pierwsza, dalej kolejność D11). Plan liczony W TEJ CHWILI (`planEmpireGarrison`), więc
 * ciała utracone od mobilizacji nie dostają nic, a zdobyte wchodzą wg D11.
 * @param {{perBody:Array<{planetId:string, role:string, count:number}>}} plan
 * @param {Map<string,number>} aliveCount — planetId → liczba żywych jednostek imperium na ciele
 * @returns {Array<{planetId:string, role:string, planned:number, alive:number, shortfall:number}>}
 */
export function garrisonShortfall(plan, aliveCount) {
  return (plan?.perBody ?? [])
    .map((b, order) => {
      const alive = nonNegative(aliveCount?.get?.(b.planetId));
      return { planetId: b.planetId, role: b.role, planned: b.count, alive, shortfall: b.count - alive, order };
    })
    .filter(b => b.shortfall > 0)
    .sort((a, b) => (b.shortfall - a.shortfall) || (a.order - b.order))
    .map(({ order, ...b }) => b);
}

/**
 * G3-1 — archetyp odrastającej jednostki: pierwsza pozycja składu ciała (drabina W TEJ CHWILI, `garrisonComposition`),
 * której nie pokrywa żywa jednostka tego archetypu — żywe jednostki zajmują po kolei pozycje swojego archetypu. Po
 * stracie artylerii odrasta artyleria, po stracie garnizonu — garnizon.
 * @param {string[]} composition — skład ciała (id archetypów)
 * @param {string[]} aliveArchetypes — archetypy żywych jednostek imperium na ciele
 * @returns {string|null} `null` — skład pokryty
 */
export function garrisonRegrowthArchetype(composition, aliveArchetypes) {
  const left = Object.create(null);
  for (const a of aliveArchetypes ?? []) left[a] = (left[a] ?? 0) + 1;
  for (const arch of composition ?? []) {
    if ((left[arch] ?? 0) > 0) { left[arch] -= 1; continue; }
    return arch;
  }
  return null;
}

// ── Czytnik żywego świata (tylko odczyt) ─────────────────────────────────────────────────

/**
 * G3-1 — żywe jednostki imperium na podanych ciałach (tylko odczyt): planetId → archetypy. Ładownia statku
 * (`in_cargo`) nie jest „na ciele” (`getUnitsOnPlanet` ją pomija); jednostki imperium na CUDZYCH ciałach (desant)
 * nie są garnizonem i do limitu się nie liczą — wołający podaje ciała imperium.
 * @param {object} K — usługi gry
 * @param {string} empireId
 * @param {string[]} planetIds
 * @returns {Map<string,string[]>}
 */
export function readEmpireGarrisonUnits(K, empireId, planetIds) {
  return new Map((planetIds ?? []).map(pid => [pid, (K?.groundUnitManager?.getUnitsOnPlanet?.(pid) ?? [])
    .filter(u => u?.owner === empireId && nonNegative(u?.hp) > 0)
    .map(u => u.archetypeId ?? u.type)]));
}

/** Suma poziomów fabryk kolonii — lustro `BuildingSystem._recalcFactoryPoints`. */
function factoryLevelsOf(colony) {
  let sum = 0;
  for (const entry of colony?.buildingSystem?._active?.values?.() ?? []) {
    if (entry?.building?.id === GARRISON_FACTORY_BUILDING) sum += entry.level ?? 1;
  }
  return sum;
}

/** D6 / D11 — czy ciało ma złoże Xe albo Nt („ma złoże” = `remaining > 0`, jak helpery AI). */
function hasOutpostDeposit(deposits) {
  return (deposits ?? []).some(d => GARRISON_OUTPOST_DEPOSITS.includes(d?.resourceId) && nonNegative(d?.remaining) > 0);
}

/**
 * Migawka imperium z żywego świata — wejście `planEmpireGarrison`. Tylko odczyt.
 * ⚠ TERMIN WŁAŚCICIELA: `EmpireRegistry.getColoniesByEmpire` mapuje `empire.colonies` bez sprawdzenia, kto
 *   kolonię posiada, a `ColonyManager.transferColony` dopisuje ją nowemu imperium, nie odpisując poprzedniemu
 *   (rodzina Findingu 283) — więc lista bywa szersza niż posiadanie. Planer bierze wyłącznie kolonie
 *   z `ownerEmpireId === empireId`; tak samo stolicę z `capitalOf` (D12).
 * @param {object} K — usługi gry (w grze `window.KOSMOS`)
 * @param {string} empireId
 */
export function readEmpireGarrisonSnapshot(K, empireId) {
  const listed = K?.empireRegistry?.getColoniesByEmpire?.(empireId) ?? [];
  const owned = listed.filter(c => c?.ownerEmpireId === empireId);
  const capital = K?.directorProduction?.capitalOf?.(empireId) ?? null;
  return {
    empireId,
    pop: owned.filter(c => !c.isOutpost).reduce((s, c) => s + Math.floor(nonNegative(c.civSystem?.population)), 0),
    factoryLevels: owned.reduce((s, c) => s + factoryLevelsOf(c), 0),
    capitalId: capital?.ownerEmpireId === empireId ? capital.planetId : null,
    bodies: owned.map((c, order) => ({
      planetId: c.planetId, order, isOutpost: !!c.isOutpost,
      devScore: colonyDevScore(c),
      hasRequiredDeposit: hasOutpostDeposit(c.planet?.deposits),
    })),
  };
}

/** Kontekst ciała dla `garrisonHexes`: siatka kolonii i heksy zajęte przez żywe jednostki (każdego właściciela). */
export function readGarrisonBodyContext(K, planetId) {
  const colony = K?.colonyManager?.getColony?.(planetId) ?? null;
  const units = K?.groundUnitManager?.getUnitsOnPlanet?.(planetId) ?? [];
  return {
    grid: colony?.grid ?? null,
    isOutpost: !!colony?.isOutpost,
    occupied: new Set(units.filter(u => nonNegative(u?.hp) > 0).map(u => `${u.q},${u.r}`)),
  };
}

/** Plan dla KAŻDEGO imperium z rejestru. Tylko odczyt. */
export function planAllEmpires(K) {
  const empires = K?.empireRegistry?.listAll?.() ?? [];
  return empires.map(e => planEmpireGarrison(readEmpireGarrisonSnapshot(K, e.id), (pid) => readGarrisonBodyContext(K, pid)));
}

/**
 * Odczyt w konsoli (`KOSMOS.debug.garrisonPlan()`): tabela planu dla każdego imperium, wiersz na ciało.
 * Niczego nie tworzy i niczego nie zapisuje. Zwraca wiersze (do dalszego użycia w konsoli).
 */
export function printGarrisonPlans(K) {
  const rows = [];
  for (const plan of planAllEmpires(K)) {
    const head = { imperium: plan.empireId, pop: plan.pop, fabryki: plan.factoryLevels, szczebel: plan.tier.index, limit: plan.limit };
    if (plan.perBody.length === 0) {
      rows.push({ ...head, cialo: '—', rola: plan.reason, jednostek: 0, morale: plan.tier.morale, sklad: '—', heksy: 0, brak: plan.limit });
      continue;
    }
    for (const p of plan.perBody) {
      const art = p.composition.filter(id => id === GARRISON_ARTILLERY_ARCHETYPE).length;
      rows.push({
        ...head, cialo: p.planetId, rola: p.role, jednostek: p.count, morale: p.morale,
        sklad: `${p.count - art}× ${GARRISON_BASE_ARCHETYPE}${art ? ` + ${art}× ${GARRISON_ARTILLERY_ARCHETYPE}` : ''}`,
        heksy: p.hexes?.hexes?.length ?? 0, brak: p.hexes ? p.hexes.missing : p.count,
      });
    }
  }
  console.table(rows);
  return rows;
}
