// AI CAPTURE — higiena po utracie kolonii + koniec gry przy braku odwrotu (AC-8: D5 + D9=W3).
//
// PO CO: D5 zmierzyło, że po utracie kolonii `_activePlanetId` przeskakuje na kolonię AGRESORA
// (fallback bez filtru właściciela), a flota dostaje przymusowy powrót na planetę zajętą przez
// wroga. D9 dołożyło pytanie, na które D5 nie odpowiadało: co, gdy gracz nie ma JUŻ NIC i nie ma
// czym tego odwrócić. Właściciel podpisał **W3** — koniec gry dopiero przy braku ZDOLNOŚCI
// odwrócenia — i rozstrzygnął, że **magazyn NIE zostaje z graczem**.
//
//   T1  Fallback aktywnej kolonii bierze WYŁĄCZNIE kolonię gracza; gdy takiej nie ma —
//       kontekst jest ODPINANY, a nie przepinany na kolonię wroga.
//       KONTROLA PINU: przy drugiej koloni gracza fallback wybiera JĄ.
//   T2  ⚠ „Magazyn nie zostaje" NIE MOŻE znaczyć „za darmo": start misji przy odpiętym
//       magazynie jest ODMAWIANY. (Miękka bramka `if (this.resourceSystem)` czyniła misje
//       darmowymi — odwrotność rozstrzygnięcia.)
//   T3  Flota nie jest re-homowana na ciało wroga ani tam odsyłana.
//       KONTROLA PINU: gdy gracz ma inną kolonię, re-homing DZIAŁA (to nie jest wyłączenie mechaniki).
//   T4  Predykat D9 (czysty): desant wymaga DWÓCH rzeczy naraz, rekolonizacja jednej.
//   T5  Kadencja, nie migawka: `game:over` NIE pada przed upływem karencji, pada PO.
//       KONTROLA PINU ×2: statek kolonizacyjny (trzecia ścieżka) ORAZ para desantowa
//       (statek + wojsko) wstrzymują koniec gry BEZTERMINOWO.
//   T6  Koniec gry ogłaszany JEDEN raz, nie co tik.
//
// ⚠ Ten keeper mierzy też rzecz, której nie widać w asercjach: czy silnik w ogóle PRZEŻYWA stan
//    „gracz bez kolonii" (odpięte `resourceSystem`/`civSystem`). Wszystkie przebiegi używają
//    `stopOnCrash: true`, więc wyjątek w dowolnym tickerze wywróci test, a nie przemknie cicho.
//
// Uruchom: node src/testing/smoke/ai_capture_last_stand_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import { Ticker } from '../headless/Ticker.js';
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { ColonyManager } from '../../systems/ColonyManager.js';
import { createVessel } from '../../entities/Vessel.js';
import { canReverseFate, describeNoReversal } from '../../utils/PlayerViability.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const EMP = 'emp_001';
const DROPPER  = ['engine_ion', 'armor_standard', 'troop_bay_s', 'drop_pods'];
const COLONIZER = ['engine_ion', 'habitat_pod'];

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  window.KOSMOS.civMode = true;
  return {
    core, home: window.KOSMOS.homePlanet,
    cm: core.colonyManager,
    gum: core.groundUnitManager,
    tick: (y) => new Ticker(core.timeSystem).run(y, { tickSize: 1.0, stopOnCrash: true }),
  };
}

/** Statek GRACZA w rejestrze (bez stempla imperium = gracza — kanon). */
function playerShip(core, modules, name) {
  const home = window.KOSMOS.homePlanet;
  const v = createVessel('hull_medium', home.id, { name, modules: [...modules], x: 0, y: 0, systemId: 'sys_home' });
  core.vesselManager._vessels.set(v.id, v);
  return v;
}

const freeBody = (cm, systemId, exclude) => EntityManager.getAll().find(e =>
  e.systemId === systemId && e.id !== exclude &&
  (e.type === 'planet' || e.type === 'moon') && !cm.getColony(e.id));

// ── T1 — fallback aktywnej kolonii ──────────────────────────────────────────────────────────
console.log('T1 — fallback bierze WYŁĄCZNIE kolonię gracza; bez niej ODPINA kontekst');
{
  const { cm, home } = boot();
  const aiColonies = cm.getAllColonies().filter(c => c.ownerEmpireId);
  assert(aiColonies.length > 0 && cm.activePlanetId === home.id,
    `T1: scena wyjściowa — aktywna jest kolonia gracza, a w rejestrze SĄ kolonie AI ` +
    `(${aiColonies.length}). Bez nich pin nie miałby czego mylnie wybrać`);

  cm.transferColony(home.id, EMP, 'probe');

  assert(cm.getPlayerColonies().length === 0, 'T1: gracz stracił wszystko (przesłanka)');
  assert(cm.activePlanetId == null,
    `T1 SEDNO: aktywna kolonia jest ODPIĘTA (\`${cm.activePlanetId}\`), a nie przestawiona na ` +
    'kolonię AGRESORA. Przed AC-8 fallback brał DOWOLNY wpis z `_colonies` — a ta mapa trzyma ' +
    'też kolonie AI, więc panel gracza lądował na koloni wroga (zmierzone w audycie D5)');
  assert(window.KOSMOS.resourceSystem === null && window.KOSMOS.civSystem === null,
    'T1 SEDNO 2: wskaźniki gospodarcze wyzerowane — „magazyn NIE zostaje z graczem" ' +
    '(rozstrzygnięcie właściciela do D9). Gracz nie gospodaruje magazynem, który należy do wroga');
}
{
  const { cm, home } = boot();
  const second = cm.createOutpost(freeBody(cm, home.systemId, home.id).id, { Fe: 50 }, 0);
  cm.transferColony(home.id, EMP, 'probe');
  assert(cm.activePlanetId === second.planetId && window.KOSMOS.resourceSystem !== null,
    `T1 KONTROLA PINU: gdy gracz MA jeszcze placówkę, fallback przechodzi na NIĄ ` +
    `(\`${cm.activePlanetId}\`) i magazyn zostaje. Filtr odsiewa kolonie AI, a nie „wszystko"`);
}

// ── T2 — brak magazynu ⇒ ODMOWA, nie „za darmo" ─────────────────────────────────────────────
console.log('T2 — ⚠ start misji przy odpiętym magazynie jest ODMAWIANY (a nie darmowy)');
{
  const { core, cm, home } = boot();
  const ms = window.KOSMOS.missionSystem ?? window.KOSMOS.expeditionSystem;
  const ship = playerShip(core, COLONIZER, 'Kolonizator');
  const target = freeBody(cm, home.systemId, home.id);
  target.explored = true;
  window.KOSMOS.techSystem?.grantTechs?.(['colonization']);

  cm.transferColony(home.id, EMP, 'probe');
  assert(ms.resourceSystem === null,
    'T2: `MissionSystem` stracił magazyn razem z kolonią (przesłanka rozstrzygnięcia)');

  const failures = [];
  EventBus.on('expedition:launchFailed', (d) => failures.push(d));
  ms._launchColony(target.id, ship.id);

  assert(failures.length === 1,
    `T2 SEDNO: start misji kolonizacyjnej ODMÓWIONY (${failures.length} odmowa). Przed AC-8 ` +
    'bramka brzmiała `if (this.resourceSystem) { …canAfford… }`, więc odpięcie magazynu czyniło ' +
    'misje DARMOWYMI — czyli dokładną odwrotność rozstrzygnięcia „magazyn nie zostaje z graczem"');
  assert(!Object.values(window.KOSMOS.gameState.get('missions') ?? {}).length,
    'T2: …i żadna misja nie ruszyła');
}

// ── T3 — flota nie wraca w ręce wroga ───────────────────────────────────────────────────────
console.log('T3 — flota NIE jest re-homowana na ciało wroga ani tam odsyłana');
{
  const { core, cm, home } = boot();
  const ship = playerShip(core, COLONIZER, 'Ocalały');
  ship.colonyId = home.id; ship.homeColonyId = home.id;
  ship.position.state = 'in_transit';

  cm.transferColony(home.id, EMP, 'probe');

  assert(ship.colonyId === home.id,
    `T3 SEDNO: port macierzysty statku NIE został przepisany na zdobyte ciało (${ship.colonyId}) — ` +
    'bo nie ma dokąd. Przed AC-8 `_onColonyDestroyed` przepisywał na `KOSMOS.homePlanet.id` BEZ ' +
    'sprawdzenia, czyje to dziś ciało, i wymuszał tam powrót przez `startReturn` z `force`');
  // ⚠ Uwaga redakcyjna: w komentarzach i tekstach asercji NIE stawiaj nawiasu zaraz po polskim
  //   słowie kończącym się literą „t". `tools/check-i18n.mjs` dopasowuje wywołanie funkcji
  //   tłumaczącej jako ta litera + opcjonalna spacja + nawias, więc taki zwrot jest czytany jako
  //   klucz i18n i WYWALA GATE. Złapane dwa razy w tym slice — także wtedy, gdy komentarz
  //   ostrzegał przed tym błędem, cytując go dosłownie.
  assert(cm.getColony(home.id)?.ownerEmpireId === EMP,
    'T3: …a ciało faktycznie należy do wroga (inaczej pin nic by nie znaczył)');
}
{
  const { core, cm, home } = boot();
  const second = cm.createOutpost(freeBody(cm, home.systemId, home.id).id, { Fe: 50 }, 0);
  const ship = playerShip(core, COLONIZER, 'Przeniesiony');
  ship.colonyId = home.id; ship.homeColonyId = home.id;

  cm.transferColony(home.id, EMP, 'probe');
  assert(ship.colonyId === second.planetId,
    `T3 KONTROLA PINU: gdy gracz MA inną kolonię, re-homing DZIAŁA (${ship.colonyId}) — ` +
    'AC-8 zawęża wybór portu, a nie wyłącza mechanikę');
}

// ── T4 — predykat D9 (czysty) ───────────────────────────────────────────────────────────────
console.log('T4 — D9: desant wymaga DWÓCH rzeczy naraz, rekolonizacja jednej');
{
  const drop  = { canDropTroops: true, troopCapacity: 3, modules: [] };
  const plain = { canDropTroops: false, troopCapacity: 0, modules: [] };
  const colo  = { canDropTroops: false, troopCapacity: 0, modules: ['habitat_pod'] };
  const unit  = { owner: 'player', hp: 10 };

  assert(canReverseFate({ vessels: [drop], groundUnits: [] }).ok === false,
    'T4 SEDNO: sam transportowiec BEZ wojska to PUSTY TRANSPORTOWIEC — potencjał bez zdolności. ' +
    'Ścieżka desantu jest martwa, gdy brakuje KTÓREGOKOLWIEK z dwóch ogniw');
  assert(canReverseFate({ vessels: [plain], groundUnits: [unit] }).ok === false,
    'T4: samo wojsko bez czym je przewieźć — tak samo martwe');
  assert(canReverseFate({ vessels: [drop], groundUnits: [unit] }).ok === true,
    'T4: statek + wojsko = ścieżka odbicia ŻYWA');
  assert(canReverseFate({ vessels: [colo], groundUnits: [] }).ok === true,
    'T4: sam kolonizator wystarcza — rekolonizacja to DRUGA, niezależna ścieżka (zmierzona: ' +
    'przy zerze kolonii przylot zakłada kolonię, 0 → 1)');
  assert(canReverseFate({ vessels: [{ ...drop, isWreck: true }], groundUnits: [unit] }).ok === false,
    'T4: WRAK nie jest statkiem');
  assert(canReverseFate({ vessels: [{ ...drop, ownerEmpireId: EMP }], groundUnits: [unit] }).ok === false,
    'T4: CUDZY transportowiec nie odbije nam kolonii');
  assert(canReverseFate({ vessels: [drop], groundUnits: [{ owner: EMP, hp: 10 }] }).ok === false,
    'T4: …ani cudze wojsko');
  assert(describeNoReversal(canReverseFate({ vessels: [], groundUnits: [] }))
           === 'no_drop_ship+no_ground_troops+no_colony_ship',
    'T4 KONTROLA PINU: powód mówi, KTÓREGO ogniwa zabrakło — gate ma widzieć przyczynę, nie ciszę');
}

// ── T5 — kadencja, nie migawka ──────────────────────────────────────────────────────────────
console.log('T5 — `game:over` dopiero po karencji; statek zdolny do odwrotu wstrzymuje go bezterminowo');
{
  const { cm, home, tick } = boot();
  const over = [];
  EventBus.on('game:over', (d) => over.push(d));
  cm.transferColony(home.id, EMP, 'probe');

  tick(ColonyManager.VIABILITY_GRACE_CIVYEARS - 2);
  assert(over.length === 0,
    `T5 SEDNO: przed upływem karencji (${ColonyManager.VIABILITY_GRACE_CIVYEARS} civYears = rok ` +
    'wyświetlany) gra się NIE kończy. Test w chwili utraty zabiłby gracza, któremu kolonizator ' +
    'dolatuje za trzy lata — dlatego warunek musi się UTRZYMAĆ, a nie zaskoczyć');

  tick(4);
  assert(over.length === 1 && over[0].reason === 'conquered',
    `T5: po karencji pada DOKŁADNIE JEDEN \`game:over\` z powodem \`${over[0]?.reason}\` — nowa ` +
    'gałąź, nie parametr istniejącej (`checkHomeDestroyed` reaguje tylko na fizyczne zniszczenie)');
  assert(typeof over[0]?.detail === 'string' && over[0].detail.includes('no_'),
    `T5: …i niesie POWÓD (\`${over[0]?.detail}\`), a nie samo „koniec"`);
}
{
  const { core, cm, home, tick } = boot();
  const over = [];
  EventBus.on('game:over', (d) => over.push(d));
  playerShip(core, COLONIZER, 'Ostatnia nadzieja');       // trzecia ścieżka: rekolonizacja
  cm.transferColony(home.id, EMP, 'probe');
  tick(ColonyManager.VIABILITY_GRACE_CIVYEARS * 3);
  assert(over.length === 0,
    'T5 KONTROLA PINU A: statek kolonizacyjny wstrzymuje koniec gry BEZTERMINOWO (3× karencja) — ' +
    'bo rekolonizacja bez kolonii-matki jest ZMIERZALNIE wykonalna');
}
{
  const { core, cm, gum, home, tick } = boot();
  const over = [];
  EventBus.on('game:over', (d) => over.push(d));
  playerShip(core, DROPPER, 'Transportowiec');
  const col = cm.getColony(home.id);
  const anyTile = col.grid.toArray().find(t => t && t.type !== 'ocean');
  gum.createUnit('infantry', home.id, anyTile.q, anyTile.r, { owner: 'player' });
  cm.transferColony(home.id, EMP, 'probe');
  tick(ColonyManager.VIABILITY_GRACE_CIVYEARS * 3);
  assert(over.length === 0,
    'T5 KONTROLA PINU B: para „transportowiec + wojsko" też wstrzymuje koniec — i to jest ' +
    'ten sam warunek co T4, tylko zmierzony na żywym silniku');
}

// ── T6 — jednokrotność ──────────────────────────────────────────────────────────────────────
console.log('T6 — koniec gry ogłaszany RAZ, nie co tik');
{
  const { cm, home, tick } = boot();
  const over = [];
  EventBus.on('game:over', (d) => over.push(d));
  cm.transferColony(home.id, EMP, 'probe');
  tick(ColonyManager.VIABILITY_GRACE_CIVYEARS * 4);
  assert(over.length === 1,
    `T6: przez czterokrotność karencji \`game:over\` poleciał ${over.length}× — ekran końca gry ` +
    'nie ma migotać ani zalewać Dziennika');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
