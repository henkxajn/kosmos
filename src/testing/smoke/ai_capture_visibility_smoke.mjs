// AI CAPTURE — gracz WIDZI, że traci kafle (commit AC-9).
//
// PO CO: `tile:ownerChanged` (`GroundUnitManager:619`) miał **zero subskrybentów** w całym
// drzewie, a `invasion:repelled` szło wyłącznie do `DebugLog`. Skutek: marsz najeźdźcy przez
// kolonię — czyli dokładnie ten mechanizm, który ten slice odblokował — był dla gracza NIEMY.
// Odblokowanie podboju bez sygnału jest gorsze niż brak podboju: gracz traci coś, czego nie widzi.
//
//   T1  Utrata kafla na koloni GRACZA daje notyfikację `tileLost` (+ wpis w Dzienniku, kanał walki).
//       KONTROLA PINU ×2: flip na koloni AI = cisza; flip NA GRACZA (odzysk) = cisza.
//   T2  AGREGACJA: seria flipów w jednym oknie daje JEDEN meldunek z LICZBĄ kafli, a nie serię.
//       KONTROLA PINU: po upływie okna leci drugi meldunek, z liczbą od poprzedniego.
//   T3  `invasion:repelled` na koloni gracza daje notyfikację; na cudzej — cisza.
//   T4  Obie nowe kategorie mają IKONĘ i PRZETŁUMACZONY tytuł grupy (inaczej gracz zobaczyłby
//       w dzwonku surowy identyfikator typu — `_groupTitle` zwraca `type` dla nieznanych).
//
// ⚠ `NotificationCenter` NIE jest montowany przez `GameCore` — stawiamy go tu ręcznie, PO boocie
//    (`boot()` robi `EventBus.clear()`, więc konstrukcja przed nim zostałaby odcięta od zdarzeń).
// ⚠ T4 jest PINEM ŹRÓDŁOWYM: `GROUP_ICONS` i `_groupTitle` są prywatne w module dropdownu
//    (nie eksportowane), a same klucze i18n sprawdza już `tools/check-i18n.mjs`.
//
// Uruchom: node src/testing/smoke/ai_capture_visibility_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import EventBus from '../../core/EventBus.js';
import { NotificationCenter } from '../../systems/NotificationCenter.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const EMP = 'emp_001';

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  const nc = new NotificationCenter();           // PO boocie — patrz nota w nagłówku
  window.KOSMOS.notificationCenter = nc;
  return { core, nc, cm: core.colonyManager, home: window.KOSMOS.homePlanet };
}
const setYear = (y) => { window.KOSMOS.timeSystem.gameTime = y; };
const ofType = (nc, type) => nc.getActive().filter(n => n.type === type);

// ── T1 — utrata kafla jest WIDOCZNA ─────────────────────────────────────────────────────────
console.log('T1 — utrata kafla na koloni gracza daje notyfikację (dotąd: zero subskrybentów)');
{
  const { nc, home } = boot();
  setYear(10);
  EventBus.emit('tile:ownerChanged', { planetId: home.id, q: 1, r: 0, oldOwner: 'player', newOwner: EMP });

  const items = ofType(nc, 'tileLost');
  assert(items.length === 1,
    `T1 SEDNO: powstała notyfikacja o utracie terenu (${items.length}). Przed AC-9 ` +
    '`tile:ownerChanged` nie miał ANI JEDNEGO konsumenta — okupacja była całkowicie niema');
  assert(items[0]?.logChannel === 'combat' && !!items[0]?.logText,
    'T1: …i dubluje się do Dziennika na kanale WALKI (dzwonek to nie jedyne miejsce, gdzie ' +
    'gracz może to zobaczyć)');
  assert(items[0]?.payload?.lost === 1 && items[0]?.payload?.planetId === home.id,
    `T1: payload niesie ciało i liczbę kafli (${items[0]?.payload?.lost})`);
}
{
  const { nc, cm } = boot();
  const aiColony = cm.getAllColonies().find(c => c.ownerEmpireId);
  setYear(10);
  EventBus.emit('tile:ownerChanged', { planetId: aiColony.planetId, q: 1, r: 0, oldOwner: EMP, newOwner: 'emp_002' });
  assert(ofType(nc, 'tileLost').length === 0,
    'T1 KONTROLA PINU A: flip na koloni AI to nie nasza strata — cisza. Bez tego gracz ' +
    'dostawałby meldunki o cudzych wojnach');
}
{
  const { nc, home } = boot();
  setYear(10);
  EventBus.emit('tile:ownerChanged', { planetId: home.id, q: 1, r: 0, oldOwner: EMP, newOwner: 'player' });
  assert(ofType(nc, 'tileLost').length === 0,
    'T1 KONTROLA PINU B: ODZYSK kafla nie jest stratą — cisza. Pin mierzy kierunek, ' +
    'a nie sam fakt zmiany właściciela');
}

// ── T2 — agregacja ──────────────────────────────────────────────────────────────────────────
console.log('T2 — seria flipów w jednym oknie = JEDEN meldunek z liczbą (nie seria)');
{
  const { nc, home } = boot();
  setYear(10);
  for (let i = 0; i < 5; i++) {
    EventBus.emit('tile:ownerChanged', { planetId: home.id, q: i, r: 0, oldOwner: 'player', newOwner: EMP });
  }

  const items = ofType(nc, 'tileLost');
  assert(items.length === 1,
    `T2 SEDNO: pięć kafli w jednym oknie dało ${items.length} meldunek. Pusty kafel przewraca się ` +
    'NATYCHMIAST przy wejściu jednostki, a oddział przechodzi ich kilka w kilku tikach — bez ' +
    'agregacji dzwonek dostałby serię wpisów o JEDNYM wydarzeniu');

  setYear(10 + NotificationCenter.TILE_LOSS_COOLDOWN_YEARS + 0.01);
  EventBus.emit('tile:ownerChanged', { planetId: home.id, q: 9, r: 9, oldOwner: 'player', newOwner: EMP });
  const after = ofType(nc, 'tileLost');
  assert(after.length === 2,
    'T2 KONTROLA PINU: po upływie okna leci DRUGI meldunek — agregacja opóźnia, a nie zjada');
  assert(after[0]?.payload?.lost === 5,
    `T2: …a drugi meldunek raportuje straty OD POPRZEDNIEGO (${after[0]?.payload?.lost}) — ` +
    'cztery kafle „zaległe" z pierwszego okna plus ten nowy, nic nie ginie po cichu');
}

// ── T3 — odparcie desantu ───────────────────────────────────────────────────────────────────
console.log('T3 — odparcie desantu też jest widoczne (dotąd tylko `DebugLog`)');
{
  const { nc, home } = boot();
  setYear(10);
  EventBus.emit('invasion:repelled', { invasionId: 'inv_x', planetId: home.id });
  assert(ofType(nc, 'invasionRepelled').length === 1,
    'T3 SEDNO: gracz dowiaduje się, że wybił najeźdźców. Skoro meldujemy stratę terenu, ' +
    'meldujemy też jej koniec — inaczej sygnał byłby jednostronnie ponury');
}
{
  const { nc, cm } = boot();
  const aiColony = cm.getAllColonies().find(c => c.ownerEmpireId);
  setYear(10);
  EventBus.emit('invasion:repelled', { invasionId: 'inv_y', planetId: aiColony.planetId });
  assert(ofType(nc, 'invasionRepelled').length === 0,
    'T3 KONTROLA PINU: odparcie na cudzym ciele nas nie dotyczy — cisza');
}
{
  // Licznik strat zeruje się z końcem kampanii — inaczej następna inwazja na to samo ciało
  // zaczynałaby od „zaległych" kafli sprzed lat.
  const { nc, home } = boot();
  setYear(10);
  for (let i = 0; i < 3; i++) {
    EventBus.emit('tile:ownerChanged', { planetId: home.id, q: i, r: 0, oldOwner: 'player', newOwner: EMP });
  }
  EventBus.emit('invasion:repelled', { invasionId: 'inv_z', planetId: home.id });
  setYear(50);
  EventBus.emit('tile:ownerChanged', { planetId: home.id, q: 7, r: 7, oldOwner: 'player', newOwner: EMP });
  const last = ofType(nc, 'tileLost')[0];
  assert(last?.payload?.lost === 1,
    `T3: po odparciu licznik strat startuje od zera (${last?.payload?.lost}) — następna kampania ` +
    'nie dziedziczy zaległości poprzedniej');
}

// ── T4 — kategorie mają ikonę i przetłumaczony tytuł ────────────────────────────────────────
console.log('T4 — obie nowe kategorie mają ikonę i tytuł grupy (żaden surowy `type` do gracza)');
{
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const SRC = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const dd = stripComments(readFileSync(join(SRC, 'ui', 'NotificationDropdown.js'), 'utf8'));

  assert(/tileLost:\s*'[^']+'/.test(dd) && /invasionRepelled:\s*'[^']+'/.test(dd),
    'T4: obie kategorie mają IKONĘ w `GROUP_ICONS` (bez niej dropdown rysuje „•")');
  assert(/case 'tileLost':\s*return t\(/.test(dd) && /case 'invasionRepelled':\s*return t\(/.test(dd),
    'T4 SEDNO: …i PRZETŁUMACZONY tytuł grupy. `_groupTitle` zwraca dla nieznanego typu jego ' +
    'surowy identyfikator, więc brak tej gałęzi pokazałby graczowi „tileLost" jako nazwę sekcji');
  assert(/mobilization:\s*'[^']+'/.test(dd),
    'T4 KONTROLA PINU: skaner widzi też wpis, którego nie dodawaliśmy (`mobilization` z W2-7) — ' +
    'czyli czyta żywy plik, a nie pustkę');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
