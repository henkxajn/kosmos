// W1 — keeper doktryn operacyjnych (commit W1-5, WOJNA I POKÓJ 1.0, workstream B).
//
// PO CO: V15 zmierzył, że okręty z nacisku L1/L2 lądują ZADOKOWANE przy stolicy AI i NIC ich
// nigdy nie rusza. W1-5 nadaje im rolę — dwie doktryny jako DANE katalogu + jedna zarejestrowana
// akcja (decyzja 7), bez nowej maszynerii.
//
//   T1  bezczynny UZBROJONY okręt AI przy stolicy DOSTAJE doktrynę
//   T2  garnizon TRZYMA pozycję przy braku zagrożenia (brak ruchu ≠ rozkaz „stój")
//   T3  patrol RUSZA — rozkaz `moveToPoint` na pierścień zewnętrznych orbit (K-4)
//   T4  ⚠ NIE zaspokajalne przez sąsiada: `order.issuedBy` to DOKTRYNA, a przed rozkazem
//       NIE padła żadna bitwa (co wyklucza AutoRetreatSystem — jedyny inny system wydający
//       rozkazy MOS okrętom AI)
//   T5  kontrakt katalogu: reguła bez `roll` MUSI mieć `cooldown` (decyzja 11)
//   T6  stan `director.doctrine` przeżywa serialize→restore ORAZ ścieżkę nowej gry (V12)
//
// ⚠ Harness NIE montuje `stationSystem`, więc okręty AI stawiamy RĘCZNIE (ustalone w war_seams).

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import { createVessel } from '../../entities/Vessel.js';
import { DIRECTOR_RULES } from '../../data/DirectorRuleData.js';
import { DirectorDoctrine, registerDoctrineBehaviors } from '../../systems/director/DirectorDoctrine.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import EntityManager from '../../core/EntityManager.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const WARSHIP = ['engine_ion', 'armor_standard', 'weapon_kinetic'];

/** Boot + doktryna wpięta ręcznie (harness nie przechodzi ścieżką GameScene). */
function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  const doctrine = new DirectorDoctrine();
  registerDoctrineBehaviors(doctrine, { allowOverride: true });
  window.KOSMOS.directorDoctrine = doctrine;
  // ⚠ MOS jest w GRZE tworzony leniwie za flagą `movementOrders` (ON od M4 P1), ale harness
  //   go nie montuje. Doktryna WYMAGA go GŁOŚNO (R12 — brak = błąd wpięcia, nie stan gry),
  //   więc keeper stawia PRAWDZIWĄ instancję, nie atrapę: pinujemy realny kontrakt
  //   `issueOrder` razem z bramkami paliwa, które omija `bypassFuelCheck`.
  //   ⚠ ZAWSZE nowa instancja, nigdy `if (!...)`: każdy `boot()` tworzy NOWY GameCore z NOWYM
  //   VesselManagerem, a MOS trzyma referencję do swojego. Reużyty MOS z poprzedniego bootu
  //   odrzucał rozkazy z `vessel_not_found` — statek istniał, tylko w innym rejestrze.
  window.KOSMOS.movementOrderSystem = new MovementOrderSystem(core.vesselManager);
  return { core, doctrine };
}

/** Kolonia AI używana jako „stolica" + atrapa `capitalOf`, bo harness nie ma DirectorProduction. */
function setupCapital(core, empireId) {
  const cap = core.colonyManager.getAllColonies()
    .find(c => c.ownerEmpireId === empireId) ?? null;
  window.KOSMOS.directorProduction = { capitalOf: () => cap };
  return cap;
}

function spawnAiWarship(core, empireId, capitalId, name) {
  const v = createVessel('hull_frigate', capitalId, {
    name, modules: [...WARSHIP], x: 0, y: 0, systemId: 'sys_home',
  });
  v.ownerEmpireId = empireId; v.owner = empireId; v.isEnemy = true;
  v.position.state = 'orbiting'; v.position.dockedAt = capitalId;
  v.mission = null; v.movementOrder = null;
  core.vesselManager._vessels.set(v.id, v);
  return v;
}

// ── T1/T2 — garnizon: dostaje doktrynę i TRZYMA pozycję ─────────────────────
console.log('T1/T2 — garnizon: bezczynny okręt dostaje doktrynę i TRZYMA pozycję');
{
  const { core, doctrine } = boot();
  const empireId = core.empireRegistry.listAll()[0]?.id;
  const cap = setupCapital(core, empireId);
  assert(!!cap, `T1: jest kolonia AI pełniąca rolę stolicy (${cap?.planetId})`);

  const v = spawnAiWarship(core, empireId, cap.planetId, 'Garnizon 1');
  assert(doctrine.countIdleArmedAtCapital(empireId) === 1,
    `T1: sonda widzi 1 bezczynny UZBROJONY okręt przy stolicy (${doctrine.countIdleArmedAtCapital(empireId)})`);

  const posBefore = { x: v.position.x, y: v.position.y, dockedAt: v.position.dockedAt };
  const res = doctrine.assignDoctrine({ empireId, year: 10 }, { doctrine: 'defend_home', count: 2 });

  assert(res.assigned === 1, `T1: doktryna przypisana 1 okrętowi (${res.assigned})`);
  assert((DirectorDoctrine.get(empireId)?.defend_home ?? []).includes(v.id),
    'T1: okręt zapisany w rosterze garnizonu w `director.doctrine`');

  // T2 — HOLD: brak zagrożenia ⇒ ŻADNEGO rozkazu ruchu i pozycja bez zmian.
  assert(!v.movementOrder,
    'T2: garnizon przy stolicy NIE dostaje rozkazu ruchu — trzymanie pozycji to BRAK ruchu');
  assert(v.position.dockedAt === posBefore.dockedAt,
    `T2: okręt nadal zadokowany przy stolicy (${v.position.dockedAt}) — orbita NIE zwolniona ` +
    '(zwolnienie wywołałoby desync sprite\'a znany z Engage)');

  // Sonda przestaje go widzieć jako „bezczynnego": MA JUŻ ROLĘ. To jest istotne, bo garnizon
  // z założenia stoi zadokowany i bez tego filtra wyglądałby wiecznie na wolnego — a wtedy
  // reguła patrolu (inny cooldown) zabierałaby go z posterunku (patrz T7).
  const stillIdle = doctrine.countIdleArmedAtCapital(empireId);
  assert(stillIdle === 0,
    `T2: sonda NIE liczy go już jako bezczynnego (${stillIdle}) — ma rolę, więc nie jest wolnym zasobem`);
}

// ── T3/T4 — patrol: RUSZA, i to NIE jest zasługa sąsiada ────────────────────
console.log('T3/T4 — patrol RUSZA; rozkaz pochodzi od DOKTRYNY, nie od AutoRetreat');
{
  const { core, doctrine } = boot();
  const empireId = core.empireRegistry.listAll()[0]?.id;
  const cap = setupCapital(core, empireId);
  const v = spawnAiWarship(core, empireId, cap.planetId, 'Patrol 1');

  // ⚠ Warunek „nie zaspokajalne przez sąsiada": AutoRetreatSystem to JEDYNY inny system
  //   wydający rozkazy MOS okrętom AI — ale robi to WYŁĄCZNIE w reakcji na `battle:resolved`.
  //   Liczymy bitwy, żeby dowieść, że żadna nie padła przed rozkazem.
  let battlesSeen = 0;
  const onBattle = () => battlesSeen++;
  EventBus.on('battle:resolved', onBattle);

  const res = doctrine.assignDoctrine({ empireId, year: 12 }, { doctrine: 'patrol_border', count: 1 });
  EventBus.off('battle:resolved', onBattle);

  assert(res.assigned === 1, `T3: patrol przypisany (${res.assigned})`);
  assert(!!v.movementOrder, 'T3: patrol DOSTAŁ rozkaz ruchu (w przeciwieństwie do garnizonu)');
  assert(v.movementOrder?.type === 'moveToPoint',
    `T3: rozkaz to moveToPoint (${v.movementOrder?.type})`);
  // ⚠ Celem jest CIAŁO, nie wolny punkt — i to jest wymuszone przez MOS, nie preferencja:
  //   `_issueMoveToPoint` PRZYCIĄGA wolny punkt do najbliższego ciała (`_findBodyNearPoint`)
  //   i przewiduje jego pozycję na moment przylotu („leć do X" = „orbituj X"). Pierwsza
  //   wersja podawała punkt na pierścieniu 17 AU, MOS przyciągnął go do KOMETY i patrol
  //   dostał kurs na **102 AU** — poza układ. Pin sprawdza więc CIAŁO i jego orbitę.
  //   MOS nie przechowuje id ciała na rozkazie (zapisuje wyłącznie rozwiązany punkt), więc
  //   pin jest SKALO-AGNOSTYCZNY: cel musi leżeć WEWNĄTRZ układu planetarnego. Porównujemy
  //   z najdalszą PLANETĄ w tych samych jednostkach co pozycje ciał — bez zgadywania, czy
  //   punkt jest w AU czy w pikselach.
  const tp = v.movementOrder?.targetPoint;
  assert(!!tp && Number.isFinite(tp.x) && Number.isFinite(tp.y),
    `T3: rozkaz niesie rozwiązany punkt docelowy (${JSON.stringify(tp)})`);
  const planets = EntityManager.getByTypeInSystem('planet', 'sys_home') ?? [];
  const outermost = Math.max(0, ...planets.map(p2 => Math.hypot(p2.x ?? 0, p2.y ?? 0)));
  const dist = Math.hypot(tp?.x ?? 0, tp?.y ?? 0);
  assert(outermost > 0, `T3: układ ma planety do porównania (najdalsza na ${outermost.toFixed(1)})`);
  assert(dist <= outermost * 1.5,
    `T3: cel leży WEWNĄTRZ układu planetarnego (${dist.toFixed(1)} ≤ 1.5 × ${outermost.toFixed(1)}) — ` +
    'patrol pilnuje PODEJŚCIA, a nie leci na peryferie. ⚠ Wersja z wolnym punktem dawała tu ' +
    '102 AU, bo MOS przyciągnął cel do KOMETY');

  assert(v.movementOrder?.issuedBy === 'doctrine_patrol_border',
    `T4: rozkaz oznaczony jako pochodzący od DOKTRYNY (issuedBy=${v.movementOrder?.issuedBy})`);
  assert(battlesSeen === 0,
    `T4: przed rozkazem NIE padła ŻADNA bitwa (${battlesSeen}) — to wyklucza AutoRetreatSystem, ` +
    'jedyny inny system wydający rozkazy MOS okrętom AI');
}

// ── T5 — kontrakt katalogu (decyzja 11) ─────────────────────────────────────
console.log('T5 — reguła bez `roll` MUSI mieć `cooldown` (inaczej 12× na rok wyświetlany)');
{
  for (const id of ['doctrine_defend_home', 'doctrine_patrol_border']) {
    const rule = DIRECTOR_RULES[id];
    assert(!!rule, `T5: reguła '${id}' jest w katalogu`);
    assert(!!rule.roll || !!rule.cooldown,
      `T5: '${id}' ma `.trim() + '`roll` ALBO `cooldown` — przepustnica „raz na rok wyświetlany" ' +
      'siedzi WEWNĄTRZ `if (rule.roll)`, a tick biegnie co rok CYWILIZACYJNY (×12)');
    assert(rule.response?.action === 'assignDoctrine',
      `T5: '${id}' wskazuje zarejestrowaną akcję assignDoctrine`);
  }
  // Obie doktryny są bez `roll`, więc cooldown jest tu warunkiem KONIECZNYM, nie ozdobą.
  assert(!DIRECTOR_RULES.doctrine_defend_home.roll && DIRECTOR_RULES.doctrine_defend_home.cooldown?.years > 0,
    'T5: garnizon jest ROLL-LESS i ma dodatni cooldown w latach');
}

// ── T6 — stan przeżywa restore i ścieżkę nowej gry (V12) ────────────────────
console.log('T6 — `director.doctrine`: serialize→restore + ścieżka NOWEJ GRY');
{
  const { core, doctrine } = boot();
  const empireId = core.empireRegistry.listAll()[0]?.id;
  const cap = setupCapital(core, empireId);
  spawnAiWarship(core, empireId, cap.planetId, 'Garnizon R');
  doctrine.assignDoctrine({ empireId, year: 20 }, { doctrine: 'defend_home', count: 1 });

  const snapshot = JSON.parse(JSON.stringify(gameState.serialize()));
  assert(!!snapshot.director?.doctrine?.[empireId],
    'T6: stan doktryny JEST w serializacji (siostrzany klucz w istniejącej domenie `director`)');

  gameState.reset();
  gameState.restore(snapshot);
  assert(!!DirectorDoctrine.get(empireId)?.defend_home?.length,
    'T6: …i przeżywa restore bez zmiany modelu zapisu (v100)');

  // ⚠ V12: `initSubdomain` biegnie WYŁĄCZNIE ścieżką restore, więc na NOWEJ GRZE klucz jest
  //   `undefined`. Każdy czytelnik musi to znieść — pin trzyma tę defensywność.
  gameState.reset();
  assert(gameState.get('director.doctrine') === undefined || gameState.get('director.doctrine') === null,
    'T6: na NOWEJ GRZE `director.doctrine` NIE istnieje (initSubdomain biegnie tylko przy restore)');
  assert(DirectorDoctrine.get('emp_dowolne') === null,
    'T6: …a czytelnik znosi to bez wyjątku (zwraca null, nie rzuca)');
  DirectorDoctrine.initSubdomain();
  assert(!!gameState.get('director.doctrine'),
    'T6: initSubdomain tworzy pustą domenę na żądanie');
}


// ── T7 — role są ROZŁĄCZNE (znalezisko z walidacji GATE 3) ──────────────────
console.log('T7 — okręt nie może być JEDNOCZEŚNIE garnizonem i patrolem');
{
  const { core, doctrine } = boot();
  const empireId = core.empireRegistry.listAll()[0]?.id;
  const cap = setupCapital(core, empireId);
  for (let i = 0; i < 4; i++) spawnAiWarship(core, empireId, cap.planetId, `AI ${i}`);

  doctrine.assignDoctrine({ empireId, year: 5 }, { doctrine: 'defend_home',   count: 2 });
  doctrine.assignDoctrine({ empireId, year: 5 }, { doctrine: 'patrol_border', count: 1 });

  const rec = DirectorDoctrine.get(empireId) ?? {};
  const garrison = rec.defend_home ?? [];
  const patrol   = rec.patrol_border ?? [];
  const overlap  = garrison.filter(id => patrol.includes(id));

  assert(garrison.length === 2 && patrol.length === 1,
    `T7: obie doktryny obsadzone (garnizon ${garrison.length}, patrol ${patrol.length})`);
  assert(overlap.length === 0,
    `T7: ZERO okrętów w OBU rosterach (${JSON.stringify(overlap)}) — garnizon z założenia nie ` +
    'dostaje rozkazu ruchu i stoi zadokowany, więc bez filtra „ma już doktrynę" wyglądał dalej ' +
    'na bezczynnego i patrol zabierał go z posterunku (zmierzone przy walidacji GATE 3)');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
