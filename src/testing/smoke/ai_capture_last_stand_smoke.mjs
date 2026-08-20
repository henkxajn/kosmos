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
//   T4  Predykat (czysty): desant wymaga DWÓCH rzeczy naraz, rekolonizacja — ŻYWEJ TRASY.
//   T5  Kadencja, nie migawka: `game:over` NIE pada przed upływem karencji, pada PO.
//       KONTROLA PINU ×2: kolonizator W MISJI `colony` ORAZ para desantowa
//       (statek + wojsko) wstrzymują koniec gry BEZTERMINOWO.
//   T6  Koniec gry ogłaszany JEDEN raz, nie co tik.
//   T7  Finding 111: KTÓRA trasa się liczy — pełna tabela + pomiar „zwiad wisi bezterminowo".
//   T8  Finding 111 / D-111: start PLACÓWKI od zera jest ODMAWIANY (bliźniak T2).
//       KONTROLA PINU: przy żywej koloni placówka nadal się zakłada.
//
// ⚠⚠ DWIE ASERCJE ZOSTAŁY ŚWIADOMIE ODWRÓCONE (2026-08-20, Finding 111 / decyzja D-111 = W1;
//    plan: `docs/design/PLAYER_VIABILITY_PREDICATE_PLAN.md`). NIE „naprawiać" ich z powrotem —
//    w poprzednim kształcie **pinowały defekt**:
//      • T4 twierdziło, że „sam kolonizator wystarcza". Wystarczał SAM KADŁUB, w dowolnym stanie.
//      • T5 KONTROLA PINU A twierdziła, że zaparkowany kolonizator wstrzymuje koniec gry
//        „BEZTERMINOWO" — i to było dosłownie zdanie z Findingu 111: gra nigdy się nie kończyła.
//    Obie stały na przesłance zapisanej wtedy w `PlayerViability` (*„przy ZERZE kolonii
//    `canLaunchColony` przechodzi, a przylot zakłada kolonię"*), która okazała się PÓŁPRAWDĄ:
//    bramka przechodzi, **start nie** (Finding 106). Dziś kontrolą pinu jest TEN SAM statek
//    z żywą misją — i tam „bezterminowo" jest prawdą, zmierzoną skutkiem (0 → 1 koloni).
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
// ⚠ Frachtowiec BEZ habitatu — placówkę wozi ładownia, nie moduł mieszkalny (T7/T8, Finding 111).
const HAULER    = ['engine_ion', 'cargo_small'];

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
console.log('T4 — desant wymaga DWÓCH rzeczy naraz, rekolonizacja — ŻYWEJ TRASY');
{
  const drop  = { canDropTroops: true, troopCapacity: 3, modules: [] };
  const plain = { canDropTroops: false, troopCapacity: 0, modules: [] };
  const colo  = { canDropTroops: false, troopCapacity: 0, modules: ['habitat_pod'] };
  const coloEnRoute = { ...colo, mission: { type: 'colony', targetId: 'entity_x' } };
  const unit  = { owner: 'player', hp: 10 };

  assert(canReverseFate({ vessels: [drop], groundUnits: [] }).ok === false,
    'T4 SEDNO: sam transportowiec BEZ wojska to PUSTY TRANSPORTOWIEC — potencjał bez zdolności. ' +
    'Ścieżka desantu jest martwa, gdy brakuje KTÓREGOKOLWIEK z dwóch ogniw');
  assert(canReverseFate({ vessels: [plain], groundUnits: [unit] }).ok === false,
    'T4: samo wojsko bez czym je przewieźć — tak samo martwe');
  assert(canReverseFate({ vessels: [drop], groundUnits: [unit] }).ok === true,
    'T4: statek + wojsko = ścieżka odbicia ŻYWA');
  assert(canReverseFate({ vessels: [coloEnRoute], groundUnits: [] }).ok === true,
    'T4: kolonizator W MISJI `colony` wystarcza — rekolonizacja to DRUGA, niezależna ścieżka ' +
    '(zmierzone skutkiem: przy zerze kolonii sam przylot daje kolonię, 0 → 1)');
  assert(canReverseFate({ vessels: [colo], groundUnits: [] }).ok === false,
    '⚠ T4 ODWRÓCONE (Finding 111): sam KADŁUB z habitatem, bez żywej misji, NIE jest odwrotem. ' +
    'Poprzednia wersja mówiła tu `true` i przez to `game:over` nie padał nigdy — zaparkowany ' +
    'kolonizator nie ma jak nic zacząć, bo start od zera jest odmawiany (Finding 106)');
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
  // ⚠ ODWRÓCONE (Finding 111) — patrz nagłówek pliku. Tu stało „statek kolonizacyjny wstrzymuje
  //   koniec gry BEZTERMINOWO", na statku ZAPARKOWANYM. To był opis defektu, nie pinu.
  const { core, cm, home, tick } = boot();
  const over = [];
  EventBus.on('game:over', (d) => over.push(d));
  playerShip(core, COLONIZER, 'Zaparkowana nadzieja');
  cm.transferColony(home.id, EMP, 'probe');
  tick(ColonyManager.VIABILITY_GRACE_CIVYEARS * 3);
  assert(over.length === 1,
    '⚠ T5 ODWRÓCONE: sam ZAPARKOWANY kolonizator NIE wstrzymuje końca gry. Kadłub bez żywej ' +
    'trasy nie ma jak nic zacząć, więc partia, w której gracz stracił wszystko, ma się skończyć');
  assert(String(over[0]?.detail ?? '').includes('colony_ship_no_route'),
    `T5: …a POWÓD mówi, że kadłub BYŁ, tylko zaparkowany (\`${over[0]?.detail}\`) — nie ` +
    '„brak statku". Gate ma widzieć różnicę między tymi dwoma światami');
}
{
  // KONTROLA PINU A — ten sam statek, ale w PRAWDZIWEJ misji `colony` wystawionej przez silnik.
  const { core, cm, home, tick } = boot();
  const ms = window.KOSMOS.missionSystem ?? window.KOSMOS.expeditionSystem;
  const over = [];
  EventBus.on('game:over', (d) => over.push(d));
  window.KOSMOS.techSystem?.grantTechs?.(['colonization']);
  const target = freeBody(cm, home.systemId, home.id);
  target.explored = true;
  const ship = playerShip(core, COLONIZER, 'Nadzieja w drodze');
  ship.position.dockedAt = home.id;
  ship.colonists = 8;
  ms._launchColony(target.id, ship.id);
  assert(core.vesselManager.getVessel(ship.id)?.mission?.type === 'colony',
    'T5 KONTROLA PINU A: przesłanka — misja WYSTAWIONA przez silnik, nie wpisana ręcznie');

  cm.transferColony(home.id, EMP, 'probe');      // …i dopiero teraz gracz traci wszystko
  tick(ColonyManager.VIABILITY_GRACE_CIVYEARS * 3);
  assert(over.length === 0,
    'T5 KONTROLA PINU A: kolonizator W MISJI wstrzymuje koniec gry BEZTERMINOWO (3× karencja) — ' +
    'zawężenie z Findingu 111 odsiewa zaparkowane kadłuby, a NIE wyłącza trzeciej ścieżki');

  tick(12 * 40);                                  // ⚠ Ticker liczy civYears; misja lata w LATACH GRY
  assert(cm.getPlayerColonies().length === 1 && over.length === 0,
    'T5 KONTROLA PINU A — SKUTEK, nie bramka: przylot faktycznie oddaje graczowi kolonię ' +
    `(${cm.getPlayerColonies().length}), a \`game:over\` nadal nie padł. To jest dowód, dla ` +
    'którego misja `colony` w ogóle liczy się jako odwrót');
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

// ── T7 — Finding 111: KTÓRA trasa się liczy ─────────────────────────────────────────────────
console.log('T7 — Finding 111: trasa liczy się po TYPIE MISJI, nie po kadłubie i nie po stanie');
{
  const V = (modules, mission, suspended) => ({ modules, mission, _suspendedMission: suspended });
  const okFor = (v) => canReverseFate({ vessels: [v], groundUnits: [] }).recolonization.ok;

  assert(okFor(V([], { type: 'found_outpost', targetId: 'x' })) === true,
    'T7: misja `found_outpost` liczy się BEZ modułu habitacyjnego — placówkę wozi FRACHTOWIEC, ' +
    'a placówka jest pełnoprawną kolonią gracza. Stary predykat pytał o habitat i tę trasę GUBIŁ');
  assert(okFor(V(['habitat_pod'], { type: 'recon', phase: 'orbiting_body' })) === false,
    'T7 SEDNO: zwiad na orbicie ma `status=on_mission` i żywą misję, a mimo to NIE jest odwrotem — ' +
    'dlatego predykat pyta o TYP misji, a nie o to, czy jakakolwiek misja istnieje');
  assert(okFor(V(['habitat_pod'], { type: 'move_to_point' }, { type: 'colony' })) === true,
    '⚠ T7 PIN NA `??`: rozkaz ruchu PODMIENIA `mission`, a prawdziwą chowa w `_suspendedMission`. ' +
    'Zapis `mission ?? _suspendedMission` nigdy nie sięgnąłby po zawieszoną — fałszywy negatyw ' +
    'złapany dopiero pomiarem, bo pierwsze pole jest prawdziwe');
  assert(okFor(V([], { type: 'interstellar_jump', phase: 'warp_transit' })) === false
      && okFor(V(['habitat_pod'], { type: 'interstellar_jump', phase: 'warp_transit' })) === true,
    'T7: przepływ obcego układu liczy się TYLKO z habitatem — tam kolonizuje przycisk przez ' +
    '`canColonize`, a nie sam przylot (inaczej niż przy `colony`/`found_outpost`)');

  const parked = canReverseFate({ vessels: [V(['habitat_pod'], null)], groundUnits: [] });
  assert(parked.recolonization.hull === true && parked.recolonization.ship === false
      && describeNoReversal(parked) === 'no_drop_ship+no_ground_troops+colony_ship_no_route',
    'T7 KONTROLA PINU: powód rozróżnia „kadłub jest, ale zaparkowany" od „nie ma żadnego" — ' +
    `bez tego gate mierzyłby ciszę (\`${describeNoReversal(parked)}\`)`);
}
{
  // Pomiar, na którym stoi asercja o zwiadzie: misja PRZEŻYWA przylot i wisi BEZTERMINOWO.
  const { core, cm, home, tick } = boot();
  const ms = window.KOSMOS.missionSystem ?? window.KOSMOS.expeditionSystem;
  window.KOSMOS.techSystem?.grantTechs?.(['exploration', 'rocketry', 'basic_science']);
  const target = freeBody(cm, home.systemId, home.id);
  const scout = playerShip(core, ['engine_ion', 'habitat_pod', 'science_lab'], 'Zwiadowca');
  scout.position.dockedAt = home.id;
  ms._launchReconTarget(target.id, scout.id);
  tick(12 * 60);
  const after = core.vesselManager.getVessel(scout.id);
  assert(after?.mission?.type === 'recon' && after?.status === 'on_mission',
    `T7 PRZESŁANKA (zmierzona): po przylocie zwiad NADAL trzyma misję (\`${after?.mission?.type}\`, ` +
    `\`${after?.status}\`) i wisi tak bezterminowo — 60 lat gry później. Gdyby predykat pytał ` +
    'wyłącznie „czy jest jakaś misja", limbo z Findingu 111 zostałoby otwarte w innym kształcie');
  assert(canReverseFate({ vessels: [after], groundUnits: [] }).recolonization.ok === false,
    'T7: …i ten sam statek, mimo habitatu i żywej misji, nie jest odwrotem');
}

// ── T8 — D-111 = W1: start PLACÓWKI od zera jest ODMAWIANY ──────────────────────────────────
console.log('T8 — ⚠ bliźniak T2: start PLACÓWKI przy odpiętym magazynie też jest ODMAWIANY');
{
  const { core, cm, home, tick } = boot();
  const ms = window.KOSMOS.missionSystem ?? window.KOSMOS.expeditionSystem;
  window.KOSMOS.techSystem?.grantTechs?.(['exploration']);
  const target = freeBody(cm, home.systemId, home.id);
  target.explored = true;
  const hauler = playerShip(core, HAULER, 'Frachtowiec');
  hauler.position.dockedAt = home.id;

  cm.transferColony(home.id, EMP, 'probe');
  const failures = [];
  EventBus.on('expedition:launchFailed', (d) => failures.push(d));
  ms._launchFoundOutpost(target.id, 'farm', hauler.id);

  assert(failures.length === 1 && core.vesselManager.getVessel(hauler.id)?.mission == null,
    'T8 SEDNO: przed D-111 stało tu miękkie `if (this.resourceSystem) { spend… }`, a `canFoundOutpost` ' +
    'liczy `canAfford` równie miękko — więc bez magazynu CAŁA bramka przechodziła i placówka ' +
    'zakładała się ZA DARMO. To była odwrotność rozstrzygnięcia „magazyn nie zostaje z graczem"');
  tick(12 * 40);
  assert(cm.getPlayerColonies().length === 0,
    'T8 SKUTEK, nie bramka: po tickach gracz NADAL ma zero kolonii. Zmierzone przed poprawką: 0 → 1');
}
{
  // KONTROLA PINU — utwardzenie dotyka WYŁĄCZNIE stanu bez magazynu; zwykła gra bez zmian.
  const { core, cm, home, tick } = boot();
  const ms = window.KOSMOS.missionSystem ?? window.KOSMOS.expeditionSystem;
  window.KOSMOS.techSystem?.grantTechs?.(['exploration']);
  const target = freeBody(cm, home.systemId, home.id);
  target.explored = true;
  const hauler = playerShip(core, HAULER, 'Frachtowiec sprawny');
  hauler.position.dockedAt = home.id;
  const before = cm.getPlayerColonies().length;
  ms._launchFoundOutpost(target.id, 'farm', hauler.id);
  tick(12 * 40);
  assert(cm.getPlayerColonies().length === before + 1,
    `T8 KONTROLA PINU: przy ŻYWEJ koloni placówka nadal się zakłada (${before} → ` +
    `${cm.getPlayerColonies().length}) — bramka odmawia TYLKO przy odpiętym magazynie`);
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
