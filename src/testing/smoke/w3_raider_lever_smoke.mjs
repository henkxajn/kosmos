// W3 — keeper kontraktu dźwigni „rajder" (commit W3-4c, WOJNA I POKÓJ 1.0, workstream B).
//
// PO CO: GATE 2 wyd. 2 zablokował się na LUCE NARZĘDZIOWEJ, nie na defekcie. Scena
// międzygwiezdna była niemożliwa do postawienia ŻADNĄ zwalidowaną dźwignią:
//   • Sandbox stawia wyłącznie `frigate_system_defender` — `warpFuel.max: 0`, i to jest
//     POPRAWNE (katalog ma tam „CELOWY BRAK warp_tank"; ten okręt z założenia nie skacze);
//   • `spawnEnemyAttack` dobiera kadłub po SILE i przy domyślnych 500 ląduje na `hull_medium`,
//     który baku warp też nie ma.
// Jedynym wyjściem byłaby ręczna edycja stanu paliwa — czyli dokładnie to, czego zasady
// gate'u zabraniają („dźwignie stanu tylko przez zwalidowane narzędzia"). Ten keeper pinuje
// dźwignię, która lukę zamyka, ORAZ samą lukę (żeby nikt nie „uprościł" jej z powrotem).
//
//   T1  ⚠ FAIL-FIRST: `spawnEnemyRaider` daje kadłub ZDOLNY DO SKOKU (pełny bak) w układzie
//       INNYM niż macierzysty gracza. KONTROLA PINU **i dowód luki**: stara ścieżka
//       (`spawnEnemyAttack` domyślne) dalej daje `warpFuel.max === 0`.
//   T2  właściciel domyślny = przeciwnik AKTYWNEJ WOJNY (§Findings 17: dźwignia stawiająca
//       flotę dla ZŁEGO imperium raz już zafałszowała wynik), z jawnym `empireId` jako override.
//   T3  `systemId` respektowany; układ GRACZA odrzucony (`system_is_player_home`) — dźwignia
//       istnieje po to, żeby postawić rajdera POZA układem gracza.
//   T4  ⚠ FAIL-FIRST, kontrakt END-TO-END: spawn → `issueAttack` → composite → skok → przylot
//       → misja `attack` → bitwa zaksięgowana w układzie CELU. Jedna dźwignia, cała scena.
//   T5  `spawnEnemyAttack({ warpCapable: true })` delegatem — to samo wejście, ten sam kontrakt.
//   T6  kontrakt weryfikowany WYKONANIEM, nie zakładany: szablon BEZ baku warp (`FRG-3`)
//       raportuje `warpCapable: false`, zamiast oddać cichy „sukces".
//   T7  ⚠ FAIL-FIRST (nota środowiskowa „a"): skok do układu, w którym statek JUŻ JEST, zwraca
//       KANONICZNY `same_system` (nie `dispatch_failed`) — stała i tekst PL/EN już istniały.
//
// ⚠ Harness nie montuje MOS/OrderService/EAH — stawiamy je ręcznie (wzór `w3_seams_smoke`).

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import EntityManager from '../../core/EntityManager.js';
import gameState from '../../core/GameState.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { OrderService } from '../../systems/OrderService.js';
import { EnemyAttackHandler } from '../../systems/EnemyAttackHandler.js';
import { spawnEnemyRaider, spawnEnemyAttack } from '../../debug/SpawnTestEnemy.js';
import { WARP_ROUTE_REASONS } from '../../utils/WarpRoutePlanner.js';
import PL from '../../i18n/pl.js';
import EN from '../../i18n/en.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

function boot({ war = true } = {}) {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  window.KOSMOS.movementOrderSystem = new MovementOrderSystem(core.vesselManager);
  window.KOSMOS.orderService = new OrderService();
  const empireId = core.empireRegistry.listAll()[0]?.id;
  if (war) window.KOSMOS.diplomacySystem?.declareWar?.(empireId, 'w3_raider_probe');
  return { core, empireId };
}

// ── T1 — rajder zdolny do skoku, poza układem gracza ────────────────────────
console.log('T1 — ⚠ dźwignia daje kadłub ZDOLNY DO SKOKU poza układem gracza');
{
  const { core } = boot();
  const home = window.KOSMOS.homePlanet;

  const r = spawnEnemyRaider({ autoOrder: false });
  assert(r?.success === true, `T1: dźwignia zadziałała (${r?.reason ?? 'ok'})`);
  assert((r?.warpFuel?.max ?? 0) > 0 && r?.warpCapable === true,
    `T1 SEDNO: rajder MA bak warp (max=${r?.warpFuel?.max}) — to jest dokładnie ta własność, ` +
    'której nie dało się uzyskać żadną istniejącą dźwignią i przez którą GATE 2 stanął');
  assert(r?.warpFuel?.current === r?.warpFuel?.max,
    `T1: bak PEŁNY (${r?.warpFuel?.current}/${r?.warpFuel?.max}) — scena nie zależy od clampa ` +
    '„AI leci na oparach", więc gate mierzy to, co opisuje');
  assert(r?.systemId && r.systemId !== (home.systemId ?? 'sys_home'),
    `T1 SEDNO: rajder stoi w ${r?.systemId}, a gracz w ${home.systemId} — scena jest ` +
    'międzygwiezdna Z KONSTRUKCJI, nie przez przypadek konfiguracji boota (tak przeszedł GATE 1)');

  const v = core.vesselManager.getVessel(r.vesselId);
  assert(v?.systemId === r.systemId && v?.position?.state === 'orbiting' && v?.mission == null,
    'T1: statek naprawdę siedzi w rejestrze, bezczynny, gotowy na rozkaz (`autoOrder: false`)');

  // ⚠ KONTROLA PINU **i dowód, że luka była prawdziwa**: stara ścieżka dalej daje kadłub
  //   BEZ baku warp. Gdyby to kiedyś przestało być prawdą, ten keeper ma o tym powiedzieć.
  const legacy = spawnEnemyAttack({ etaYears: 50 });
  const lv = core.vesselManager.getVessel(legacy.vesselId);
  assert(legacy?.success === true && (lv?.warpFuel?.max ?? 0) === 0,
    `T1 KONTROLA PINU: \`spawnEnemyAttack\` domyślne dalej daje kadłub BEZ baku warp ` +
    `(${lv?.shipId}, max=${lv?.warpFuel?.max}) — to była cała luka narzędziowa`);
}

// ── T2 — właściciel domyślny idzie za WOJNĄ ─────────────────────────────────
console.log('T2 — właściciel domyślny = przeciwnik aktywnej wojny (§Findings 17)');
{
  const { core, empireId } = boot();
  const r = spawnEnemyRaider({ autoOrder: false });
  assert(r?.empireId === empireId,
    `T2 SEDNO: rajder należy do \`${r?.empireId}\` — imperium, z którym TOCZY SIĘ wojna. ` +
    'Dźwignia stawiająca flotę dla innego imperium niż wojna gate\'u już raz dała fałszywy ' +
    'wynik (§Findings 17, `spawnEnemyFleet` w Sandboksie)');

  const v = core.vesselManager.getVessel(r.vesselId);
  assert(v?.ownerEmpireId === empireId && v?.isEnemy === true,
    'T2: stempel właściciela NA STATKU — statek bez stempla czyta się jako statek GRACZA (V3c)');

  // KONTROLA PINU: jawny `empireId` przebija domyślkę; nieznane imperium = głośna odmowa.
  const bad = spawnEnemyRaider({ empireId: 'emp_nie_ma_takiego', autoOrder: false });
  assert(bad?.success === false && bad?.reason === 'unknown_empire',
    `T2 KONTROLA PINU: nieistniejące imperium odrzucone (${bad?.reason}), a nie po cichu ` +
    'podmienione na testowe');
}

// ── T3 — układ: jawny respektowany, układ gracza odrzucony ──────────────────
console.log('T3 — `systemId` respektowany; układ GRACZA odrzucony');
{
  const { core } = boot();
  const home = window.KOSMOS.homePlanet;
  const homeSys = home.systemId ?? 'sys_home';
  const other = (window.KOSMOS.galaxyData?.systems ?? []).find(s => s.id !== homeSys);

  const r = spawnEnemyRaider({ systemId: other.id, autoOrder: false });
  assert(r?.success === true && r?.systemId === other.id,
    `T3: jawny układ respektowany (${r?.systemId})`);

  const bad = spawnEnemyRaider({ systemId: homeSys, autoOrder: false });
  assert(bad?.success === false && bad?.reason === 'system_is_player_home',
    `T3 SEDNO: układ GRACZA odrzucony (${bad?.reason}) — dźwignia istnieje po to, żeby ` +
    'postawić rajdera POZA nim; „sukces" w układzie gracza byłby cichym powrotem do luki');
}

// ── T4 — kontrakt END-TO-END jedną dźwignią ─────────────────────────────────
console.log('T4 — ⚠ END-TO-END: spawn → skok → uderzenie → BITWA w układzie CELU');
{
  const { core, empireId } = boot();
  const home = window.KOSMOS.homePlanet;
  const eah = new EnemyAttackHandler();
  const warId = core.warSystem.getWarWith(empireId)?.id;
  const battlesBefore = core.warSystem.getWar(warId)?.battles?.length ?? 0;

  // JEDNO wywołanie — domyślnie od razu wydaje uderzenie PRAWDZIWĄ ścieżką produkcyjną.
  const r = spawnEnemyRaider();
  assert(r?.orderResult?.ok === true && r?.orderResult?.composite === true,
    `T4: dźwignia sama wydała uderzenie i jest ono COMPOSITE (${JSON.stringify(r?.orderResult)}) — ` +
    'czyli najpierw skok, a nie ręcznie sklejona misja jak w starej ścieżce');

  const v = core.vesselManager.getVessel(r.vesselId);
  assert(v?.mission?.type === 'interstellar_jump',
    `T4: statek leci między gwiazdami (\`${v?.mission?.type}\`) — D4: gracz ma to ZOBACZYĆ`);

  // Dolot skoku → composite sam wydaje uderzenie w układzie celu.
  window.KOSMOS.timeSystem.gameTime = (v.mission?.arrivalYear ?? 0) + 0.001;
  core.vesselManager._updatePositions(0.01);
  assert(v.systemId === home.systemId && v.mission?.type === 'attack',
    `T4: po skoku statek jest w ${v.systemId} z misją \`${v.mission?.type}\``);

  // Dolot wewnątrz układu → EAH otwiera i rozstrzyga bitwę.
  window.KOSMOS.timeSystem.gameTime = (v.mission?.arrivalYear ?? 0) + 0.001;
  core.vesselManager._updatePositions(0.01);
  assert(v.position?.dockedAt === home.id,
    `T4: rajder dotarł nad cel (dok: ${v.position?.dockedAt})`);

  eah._pendingBattles.set(home.id, {
    arrivedVesselIds: new Set([v.id]),
    firstVesselYear: window.KOSMOS.timeSystem.gameTime,
    timerId: null,
  });
  eah._resolveBatchedBattle(home.id);

  const war = core.warSystem.getWar(warId);
  assert((war?.battles?.length ?? 0) === battlesBefore + 1,
    `T4 SEDNO: bitwa ZAKSIĘGOWANA (${battlesBefore} → ${war?.battles?.length}) — cała scena ` +
    'GATE 2 stoi jedną dźwignią, bez ręcznego dotykania stanu');
  const rec = gameState.get(`battles.${war.battles[war.battles.length - 1]}`);
  assert(rec?.location?.systemId === home.systemId,
    `T4: …w układzie CELU (${rec?.location?.systemId}), zgodnie z W3-4b-2`);
}

// ── T5 — spawnEnemyAttack({warpCapable:true}) delegatem ─────────────────────
console.log('T5 — `spawnEnemyAttack({ warpCapable: true })` to ta sama dźwignia');
{
  boot();
  const home = window.KOSMOS.homePlanet;
  const r = spawnEnemyAttack({ warpCapable: true, autoOrder: false });
  assert(r?.success === true && r?.warpCapable === true && r?.systemId !== (home.systemId ?? 'sys_home'),
    `T5: to samo wejście daje ten sam kontrakt (bak=${r?.warpFuel?.max}, układ=${r?.systemId}) — ` +
    'stara nazwa działa dla pamięci mięśniowej, a produkt jest jeden');
}

// ── T6 — kontrakt sprawdzany, nie zakładany ─────────────────────────────────
console.log('T6 — szablon BEZ baku warp raportuje `warpCapable: false` (głośno)');
{
  boot();
  const r = spawnEnemyRaider({ templateId: 'frigate_system_defender', autoOrder: false });
  assert(r?.success === true && r?.warpCapable === false && (r?.warpFuel?.max ?? 0) === 0,
    `T6 SEDNO: FRG-3 raportuje brak zdolności skoku (warpCapable=${r?.warpCapable}) zamiast ` +
    'oddać cichy „sukces", po którym gate utyka tak samo jak przed tą dźwignią. Kontrakt jest ' +
    'WERYFIKOWANY po fakcie, a nie zakładany z nazwy szablonu');

  const bad = spawnEnemyRaider({ templateId: 'nie_ma_takiego', autoOrder: false });
  assert(bad?.success === false && bad?.reason === 'template_unresolved',
    `T6 KONTROLA PINU: nieznany szablon odrzucony (${bad?.reason})`);
}

// ── T7 — skok „już tu jestem" ma KANONICZNY powód ───────────────────────────
console.log('T7 — ⚠ skok do własnego układu → `same_system` (nie `dispatch_failed`)');
{
  const { core } = boot();
  const r = spawnEnemyRaider({ autoOrder: false });
  const os = window.KOSMOS.orderService;

  const res = os.issueWarp(r.vesselId, r.systemId);
  assert(res?.ok === false && res?.reason === WARP_ROUTE_REASONS.SAME_SYSTEM,
    `T7 SEDNO: powód to \`${res?.reason}\`. Wcześniej ścieżka AI wracała \`dispatch_failed\` — ` +
    'jeden stan świata, dwie różne odpowiedzi zależnie od tego, KTO pyta');
  assert(WARP_ROUTE_REASONS.SAME_SYSTEM === 'same_system',
    'T7: używamy stałej z planera, nie nowego napisu — druga nazwa na to samo zdarzenie ' +
    'byłaby drugim słownikiem');
  assert(typeof PL['fleet.warpErrSame'] === 'string' && typeof EN['fleet.warpErrSame'] === 'string',
    `T7: tekst dla gracza istnieje w OBU językach (PL: „${PL['fleet.warpErrSame']}") — ` +
    'dlatego nowy klucz i18n nie był potrzebny');

  // KONTROLA PINU: skok do INNEGO układu dalej przechodzi (nie zablokowaliśmy warpu w ogóle).
  const other = (window.KOSMOS.galaxyData?.systems ?? []).find(s => s.id !== r.systemId);
  const ok = os.issueWarp(r.vesselId, other.id);
  assert(ok?.ok === true,
    `T7 KONTROLA PINU: skok do innego układu dalej działa (${ok?.reason ?? 'ok'})`);
}

console.log(`\n═══ ${pass} PASS, ${fail} FAIL ═══`);
process.exit(fail === 0 ? 0 : 1);
