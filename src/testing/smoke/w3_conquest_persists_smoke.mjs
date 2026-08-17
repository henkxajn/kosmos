// W3-1 — keeper: PODBÓJ ZOSTAJE (WOJNA I POKÓJ 1.0, workstream B).
//
// PO CO: `w3_seams_smoke` T4 zmierzył, że po `transferColony` imperium dostawało samo ID
// kolonii, a `getColoniesByEmpire` odfiltrowywało pudło — więc produkcja, badania i logistyka
// AI NIE WIDZIAŁY zdobyczy NIGDY. Ofensywne AI nie czerpało z wygranej NICZEGO, co jest
// przesłanką całego W3. Orzeczenie właściciela D7 („PRZEGRANA JEST ODWRACALNA") rozstrzyga to
// symetrycznie: transfer własności dzieje się W MIEJSCU, w obie strony.
//
// Ten keeper pinuje CZTERY rzeczy, które commit W3-1 musiał udowodnić:
//   §1  kolonia ŻYJE pod nowym właścicielem i zasila produkcję/badania/logistykę AI
//   §2  stempel na `galaxyData` przeżywa ponowne wyprowadzenie (ścieżka wczytania zapisu)
//   §3  zdobycie OSTATNIEGO ciała imperium w trakcie wojny nie zostawia wiszących referencji
//   §4  subskrybenci klasy `colony:destroyed` sprzątają po UTRACIE kolonii, nie tylko po jej śmierci
//
// Cykl życia subsystemów (dispose lub jego brak) pinuje `s34c_z9_transfer_dispose_smoke`,
// przepisany tym samym commitem.
//
// ⚠ Harness nie montuje stationSystem/Director* — patrz nagłówek `w3_seams_smoke`.

import '../headless/env.js';           // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import { GameCore } from '../headless/GameCore.js';
import { EmpireColonyBootstrap } from '../../systems/EmpireColonyBootstrap.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  return core;
}
const empireOf = (core) => core.empireRegistry.listAll()[0]?.id;

// ── §1 — kolonia żyje pod nowym właścicielem i zasila AI ────────────────────
console.log('§1 — zdobycz ŻYJE i zasila imperium (produkcja / badania / logistyka)');
{
  const core = boot();
  const reg = core.empireRegistry;
  const cm = core.colonyManager;
  const empireId = empireOf(core);

  const empireTechBefore = EmpireColonyBootstrap._findEmpireTechSystem(empireId);
  assert(!!empireTechBefore, 'S1: imperium ma własne drzewo tech jeszcze przed podbojem');

  const victim = cm.getPlayerColonies()[0];
  const playerTechBefore = victim.buildingSystem?.techSystem ?? null;
  assert(!!victim, `S1: jest kolonia gracza do przejęcia (${victim?.planetId})`);
  assert(playerTechBefore !== empireTechBefore,
    'S1 KONTROLA PINU: przed podbojem kolonia stoi na INNYM drzewie tech niż imperium — ' +
    'więc przepięcie będzie mierzalne, a nie tożsamościowe');

  assert(cm.transferColony(victim.planetId, empireId, 'keeper') === true, 'S1: transfer wykonany');

  // Sedno: id imperium rozwiązuje się do ŻYWEJ kolonii (dokładna inwersja w3_seams T4).
  const ids = reg.get(empireId)?.colonies ?? [];
  const resolved = reg.getColoniesByEmpire(empireId);
  assert(ids.includes(victim.planetId), 'S1: id zdobyczy jest w `empires[].colonies`');
  assert(resolved.some(c => c?.planetId === victim.planetId),
    'S1: …i `getColoniesByEmpire` ZWRACA ją jako żywy obiekt — to czytają DirectorProduction, ' +
    'EmpireResearchSystem, EmpireStrategySystem i EmpireLogisticsSystem');
  assert(resolved.length === ids.length,
    `S1: ŻADNE id nie wisi w próżni (${resolved.length} kolonii / ${ids.length} id) — ` +
    'w3_seams T4 mierzył tu 1 na 2');

  // Kolonia jest żywa, nie wydmuszką.
  const live = cm.getColony(victim.planetId);
  assert(!!live && live === victim, 'S1: obiekt kolonii to TA SAMA instancja — nic nie zostało odtworzone');
  assert(live.ownerEmpireId === empireId, 'S1: właściciel przestawiony');
  assert(!!live.civSystem && !!live.resourceSystem && !!live.buildingSystem,
    'S1: subsystemy (populacja, magazyn, budynki) DALEJ ISTNIEJĄ — zdobycz produkuje');
  assert(!cm.getPlayerColonies().some(c => c.planetId === victim.planetId),
    'S1: …i jednocześnie ZNIKA z kolonii gracza — jedno pole załatwia obie strony');

  // Drzewo tech zdobywcy (inaczej zdobycz produkuje na mnożnikach gracza).
  assert(live.techSystem === empireTechBefore,
    'S1: `colony.techSystem` przepięty na drzewo IMPERIUM');
  assert(live.buildingSystem.techSystem === empireTechBefore,
    'S1: …i druga referencja też (BuildingSystem trzyma własną) — bez tego zdobycz liczyłaby ' +
    'mnożniki produkcji z drzewa GRACZA');

  // Hexy — lustro captureColonyForPlayer.
  const tiles = live.grid?.toArray?.().filter(Boolean) ?? [];
  assert(tiles.length > 0 && tiles.every(t => t.owner === empireId),
    `S1: wszystkie ${tiles.length} heksów należy do zdobywcy`);
}

// ── §2 — stempel polityczny przeżywa ponowne wyprowadzenie ──────────────────
console.log('§2 — `galaxyData` przeżywa ponowne wyprowadzenie (ścieżka wczytania zapisu)');
{
  const core = boot();
  const reg = core.empireRegistry;
  const cm = core.colonyManager;
  const empireId = empireOf(core);
  const victim = cm.getPlayerColonies()[0];
  const systemId = core.starSystemManager ? (victim.systemId ?? 'sys_home') : 'sys_home';

  cm.transferColony(victim.planetId, empireId, 'keeper');

  const gd = window.KOSMOS.galaxyData;
  const stampedNow = gd?.systems?.find(s => s.id === systemId)?.empireId ?? null;
  assert(stampedNow === empireId,
    `S2: układ ostemplowany natychmiast po podboju (${stampedNow}) — warunek \`&& !gs.empireId\` zdjęty`);

  // ⚠ To jest właściwy test: `syncToGalaxyData` czyści WSZYSTKIE stemple i odtwarza je,
  //   rozwiązując `colonyId → colony`. Przed W3-1 kolonia nie istniała, więc podbój znikał
  //   z mapy politycznej po każdym wczytaniu zapisu.
  reg.syncToGalaxyData?.();
  const stampedAfter = gd?.systems?.find(s => s.id === systemId)?.empireId ?? null;
  assert(stampedAfter === empireId,
    `S2: …i PRZEŻYWA \`syncToGalaxyData\` (${stampedAfter}) — bo `.trim() +
    '`getColony(colonyId)` ma teraz co zwrócić');
}

// ── §3 — ostatnie ciało imperium a wiszące referencje ───────────────────────
console.log('§3 — zdobycie OSTATNIEGO ciała w trakcie wojny nie kasuje kontrahenta');
{
  const core = boot();
  const reg = core.empireRegistry;
  const cm = core.colonyManager;
  const empireId = empireOf(core);

  core.diplomacySystem.declareWar(empireId, 'keeper');
  const war = core.warSystem.getWarWith?.(empireId);
  assert(!!war?.active, `S3: wojna trwa (${war?.id})`);

  const aiColonies = reg.getColoniesByEmpire(empireId);
  assert(aiColonies.length >= 1, `S3: imperium ma ${aiColonies.length} kolonii do odebrania`);
  for (const c of aiColonies) cm.captureColonyForPlayer(c.planetId, 'keeper');

  assert((reg.get(empireId)?.colonies ?? []).length === 0, 'S3: imperium straciło wszystkie ciała');
  assert(!!reg.get(empireId),
    'S3: …a mimo to WPIS IMPERIUM ISTNIEJE — pokonany przeciwnik musi dotrwać do stołu, ' +
    'inaczej wojna i relacje wskazują na nic (W4 potrzebuje go tym bardziej)');
  const warAfter = core.warSystem.getWarWith?.(empireId);
  assert(!!warAfter?.active && !!reg.get(warAfter.aggressor === 'player' ? warAfter.defender : warAfter.aggressor),
    'S3: wojna dalej wskazuje na ISTNIEJĄCE imperium — brak wiszącej referencji');

  // KONTROLA PINU: bez wojny ostatnia kolonia NADAL kasuje imperium (guard jest wąski,
  // nie wyłączyliśmy sprzątania w ogóle).
  const other = reg.listAll().find(e => e.id !== empireId);
  if (other) {
    const otherColonies = reg.getColoniesByEmpire(other.id);
    for (const c of otherColonies) cm.captureColonyForPlayer(c.planetId, 'keeper');
    assert(!reg.get(other.id),
      'S3 KONTROLA PINU: imperium BEZ wojny znika po utracie ostatniej kolonii — ' +
      'guard dotyczy wyłącznie trwającego konfliktu');
  } else {
    assert(false, 'S3 KONTROLA PINU: brak drugiego imperium do porównania');
  }
}

// ── §4 — sprzątanie po UTRACIE, nie tylko po śmierci ────────────────────────
console.log('§4 — subskrybenci klasy `colony:destroyed` sprzątają też po PRZEJĘCIU');
{
  const core = boot();
  const cm = core.colonyManager;
  const empireId = empireOf(core);
  const victim = cm.getPlayerColonies()[0];

  // Szpiegujemy METODY instancji: subskrypcje wołają `this._onColonyDestroyed(...)` w chwili
  // zdarzenia, więc podmiana metody jest widziana przez istniejący listener.
  const calls = { mission: [], vessel: [] };
  const mSys = core.expeditionSystem;          // MissionSystem (ExpeditionSystem to martwy bliźniak)
  const vMgr = core.vesselManager;
  const origMission = mSys._onColonyDestroyed.bind(mSys);
  const origVessel  = vMgr._onColonyDestroyed.bind(vMgr);
  mSys._onColonyDestroyed = (pid, ...r) => { calls.mission.push(pid); return origMission(pid, ...r); };
  vMgr._onColonyDestroyed = (pid, ...r) => { calls.vessel.push(pid); return origVessel(pid, ...r); };

  cm.transferColony(victim.planetId, empireId, 'keeper');

  assert(calls.mission.includes(victim.planetId),
    'S4: MissionSystem posprzątał misje po UTRACONEJ kolonii (misje w drodze do wrogiego ' +
    'już ciała nie mogą lecieć dalej)');
  assert(calls.vessel.includes(victim.planetId),
    'S4: VesselManager przeniósł port macierzysty statków przypisanych do utraconej kolonii');

  // KONTROLA PINU: to są DOKŁADNIE te same handlery, które obsługują zniszczenie —
  // nie druga, równoległa ścieżka, która mogłaby się rozjechać.
  calls.mission.length = 0; calls.vessel.length = 0;
  EventBus.emit('colony:destroyed', { planetId: 'p_control', destroyedVesselIds: [] });
  assert(calls.mission.includes('p_control') && calls.vessel.includes('p_control'),
    'S4 KONTROLA PINU: `colony:destroyed` trafia w TE SAME metody — jedna ścieżka sprzątania, ' +
    'dwa zdarzenia wejściowe');

  mSys._onColonyDestroyed = origMission;
  vMgr._onColonyDestroyed = origVessel;
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
