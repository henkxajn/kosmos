// AI GARRISON (G2-3a) — dane planu garnizonu kolonii AI. JEDNO miejsce wszystkich liczb D1 / D9 / D10 / D11.
//
// Decyzje podpisane przez właściciela 2026-10-02, drabina D9 zrewidowana 2026-10-03
// (`docs/design/AI_GARRISON_PLAN.md` §1). Logika, która te liczby czyta, mieszka w `src/utils/GarrisonPlanner.js`
// i nie ma w kodzie ani jednej liczby drabiny (pinuje to `g2_planner_smoke` P0e). Zmiana balansu = zmiana TEGO pliku.
//
// ⚠ ZERO importów — moduł danych, node-testowalny.

/**
 * D1 — limit = max(GARRISON_MIN_UNITS, floor(POP imperium / GARRISON_POP_PER_UNIT)).
 * To jest reguła limitu rekrutacji GRACZA (`ColonyManager._getMaxGroundUnits`, `ColonyManager.js:1344-1349`)
 * zastosowana do POP imperium. Tam liczby stoją jako literały; zgodność obu reguł pinuje WYKONANIEM
 * `g2_planner_smoke` P1d (POP 0–400).
 */
export const GARRISON_POP_PER_UNIT = 16;   // POP na jedną jednostkę limitu
export const GARRISON_MIN_UNITS    = 2;    // minimum limitu (jednostki)

/**
 * D9 — drabina (REWIZJA właściciela 2026-10-03, zastępuje progi 10/25/35/45 z 2026-10-02). Wejście: SUMA
 * POZIOMÓW FABRYK imperium (Σ `level` budynków `factory` we wszystkich jego koloniach — to samo, co liczy
 * `BuildingSystem._recalcFactoryPoints` jako `FactorySystem.totalPoints`). Wiersz obowiązuje od
 * `minFactoryLevels` (włącznie) do progu następnego wiersza (wyłącznie).
 *   morale          — morale nadawane jednostce przy tworzeniu (D7: jedna gałka AI)
 *   artilleryEvery  — co która jednostka CIAŁA jest `rocket_artillery` (0 = żadna; liczone na ciało — odp. (b))
 *   limitMult       — mnożnik limitu z D1 (floor PO klamrze minimum 2 — odp. (c))
 * ⚠ Dlaczego rewizja: suma fabryk zatrzymuje się na 20 — fixture GATE-S4 20 i 20 przy gy 60, uprząż najwyżej 24
 *   przy gy 100 (płaskowyż 20) — więc stare szczeble 25 / 35 / 45 nie były w praktyce osiągane (pomiar M2).
 * ⚠ Próg 6–13 = wyłącznie `garrison_unit` (wiersz morale 50; potwierdzenie właściciela dla tego wiersza — §5h (c)).
 */
export const GARRISON_FACTORY_BUILDING = 'factory';   // id budynku, którego poziomy sumuje wejście drabiny

export const GARRISON_LADDER = Object.freeze([
  Object.freeze({ minFactoryLevels: 0,  morale: 30,  artilleryEvery: 0, limitMult: 1    }),
  Object.freeze({ minFactoryLevels: 6,  morale: 50,  artilleryEvery: 0, limitMult: 1    }),
  Object.freeze({ minFactoryLevels: 14, morale: 100, artilleryEvery: 3, limitMult: 1    }),
  Object.freeze({ minFactoryLevels: 20, morale: 100, artilleryEvery: 3, limitMult: 1.25 }),
]);

/** D7 / D9 — typy garnizonu. `aa_platform` świadomie POZA garnizonami (w walce naziemnej obojętna). */
export const GARRISON_BASE_ARCHETYPE      = 'garrison_unit';
export const GARRISON_ARTILLERY_ARCHETYPE = 'rocket_artillery';

/** D11 — stolica dostaje ceil(limit / GARRISON_CAPITAL_SHARE_DIVISOR); reszta po jednej na ciało. */
export const GARRISON_CAPITAL_SHARE_DIVISOR = 2;

/**
 * D6 / D11 — placówka dostaje garnizon WYŁĄCZNIE, gdy jej ciało ma złoże jednego z tych surowców
 * (`Xe` Ksenon, `Nt` Neutronium — `ResourcesData.js:22-23`). „Ma złoże” = wpis z `remaining > 0`
 * (odp. właściciela (e), 2026-10-03), jak w helperach AI `EmpireLogisticsSystem.js:903` i
 * `EmpireStrategySystem.js:871`.
 */
export const GARRISON_OUTPOST_DEPOSITS = Object.freeze(['Xe', 'Nt']);

/**
 * D10 — maks. promień spirali rozstawienia wokół kotwicy (kafel stolicy, na którym da się stanąć; dla placówki
 * i dla stolicy nie do stania — kafel z budynkiem, odp. (d)). Lustro spirali `ColonyManager._findGroundUnitSpawn`
 * (promień 0–5, `ColonyManager.js:1822`), na której zmierzono D10 — ale BEZ jej zapasowego „stań na stolicy mimo
 * zajętości”: D10 zakazuje stosu, a jednostka bez wolnego heksu nie powstaje i zostaje w rezerwie (odp. (f)).
 */
export const GARRISON_SPREAD_MAX_RADIUS = 5;

/**
 * G3-1 — odrastanie strat (podpis właściciela, plan §1 „straty odrastają po 1 na rok”; domyślne potwierdzone
 * 2026-10-04): po pierwszej mobilizacji imperium odzyskuje tyle jednostek na ROK GRY (1,0 na zegarze
 * `timeSystem.gameTime` — tym samym, którym flaga mobilizacji zapisuje `year`; = 12 civY), w wojnie i w pokoju, do
 * bieżącego limitu. Liczba prób na rok, nie gwarancja: próba bez wolnego heksu w danym roku przepada.
 */
export const GARRISON_REGROWTH_PER_YEAR = 1;
