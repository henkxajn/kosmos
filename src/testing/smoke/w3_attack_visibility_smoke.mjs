// W3 — keeper widoczności ataku (commit W3-7, workstream B).
//
// PO CO: audyt S25 — „najgłośniejsze zdarzenia w tej grze są ciche". `invasion:launched` /
// `troopsLanded` / `blocked` / `repelled` docierały WYŁĄCZNIE do `DebugLog` — **zero
// subskrybentów UI w całym drzewie**. Utrata kolonii wychodziła natywnym `alert()` przeglądarki
// (blokującym, wyglądającym jak awaria). A `UIManager` filtrował bitwy EAH po
// `p.empireId === 'player'`, którego ten kształt NIE MIAŁ — więc przy przegranej gracz nie
// dostawał ani auto-slow, ani wpisu w Dzienniku, tylko po cichu tracił flotę.
//
//   T1  ⚠ `invasion:launched` DOCIERA do gracza (powiadomienie + wpis w Dzienniku).
//       ⚠ Świadome odstępstwo od wzorca mobilizacji: ZDARZENIE pokazujemy zawsze (dzieje się
//       na TWOJEJ planecie), stopniujemy TOŻSAMOŚĆ — nazwa dopiero przy `detailed`.
//   T2  ⚠ §Findings 22 U ŹRÓDŁA: `transferColony` niesie PRAWDZIWEGO poprzedniego właściciela,
//       a nie zaszyte `'player'`. Przerzut AI→AI nie ogłasza graczowi jego straty.
//   T3  bramka własności także PRZY ODBIORCY (dwie warstwy — jedna bez drugiej zostawia
//       następnego konsumenta na tej samej minie).
//   T4  ⚠ STEMPEL `empireId: 'player'` na uczestniku-graczu — naprawia TRZECH filtrujących
//       konsumentów naraz; pin liczy site'y w kodzie produkcyjnym.
//   T5  natywny `alert()` NIE ŻYJE w ścieżce utraty kolonii (pin źródłowy).
//   T6  komplet i18n PL+EN dla nowych komunikatów ORAZ dla stringów desantu z S26
//       (były zaszyte po polsku — gracz EN dostawał polski tekst).

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import EventBus from '../../core/EventBus.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { NotificationCenter } from '../../systems/NotificationCenter.js';
import PL from '../../i18n/pl.js';
import EN from '../../i18n/en.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  const nc = new NotificationCenter();
  window.KOSMOS.notificationCenter = nc;
  return { core, nc, empireId: core.empireRegistry.listAll()[0]?.id };
}

// ── T1 — desant dociera do gracza ───────────────────────────────────────────
console.log('T1 — ⚠ `invasion:launched` DOCIERA do gracza (przedtem: zero subskrybentów UI)');
{
  const { nc, empireId } = boot();
  const home = window.KOSMOS.homePlanet;
  const before = nc._items?.length ?? 0;

  EventBus.emit('invasion:launched', { invasionId: 'inv_x', empireId, planetId: home.id, troops: 3 });

  const items = nc._items ?? [];
  assert(items.length === before + 1,
    `T1 SEDNO: powiadomienie POWSTAŁO (${before} → ${items.length}). Przed W3-7 to zdarzenie ` +
    'kończyło życie w `DebugLog` — gracz mógł stracić kolonię, nie widząc ani jednego komunikatu ' +
    'o tym, że ktokolwiek wylądował');
  const it = items[items.length - 1];
  assert(it?.type === 'invasion' && it?.severity === 'alert',
    `T1: wpis ma własną kategorię i wagę (${it?.type}/${it?.severity})`);
  assert(it?.logChannel === 'combat',
    `T1: idzie na kanał WALKA (${it?.logChannel}) — nie „system", jak 18 wywołań M4-P1 przed W2`);

  // ⚠ Tożsamość stopniowana: bez `detailed` najeźdźca jest ANONIMOWY, ale zdarzenie JEST.
  const empName = window.KOSMOS.empireRegistry.get(empireId)?.name ?? '';
  assert(empName.length > 0 && !String(it?.subtitle ?? '').includes(empName),
    `T1 SEDNO: nazwa imperium NIE pada bez rozpoznania (podtytuł: „${it?.subtitle}") — to ta sama ` +
    'drabina ujawnienia co przy mobilizacji, ale odwrócona: zdarzenie ZAWSZE, tożsamość STOPNIOWO. ' +
    'Zamknięcie całego wpisu za `contact` znaczyłoby, że nieznane imperium zajmuje kolonię w ciszy');
}

// ── T2 — §Findings 22 u źródła ──────────────────────────────────────────────
console.log('T2 — ⚠ `previousOwner` to PRAWDZIWY właściciel, nie zaszyte `player`');
{
  const src = stripComments(readFileSync(join(SRC, 'systems', 'ColonyManager.js'), 'utf8'));
  assert(!/previousOwner:\s*'player'/.test(src),
    'T2 SEDNO: w kodzie NIE MA już `previousOwner: \'player\'` na sztywno. To była przyczyna ' +
    '§Findings 22: `transferColony` obsługuje TAKŻE przerzuty AI→AI (dowiedzione na żywo ' +
    'w GATE 1 §7[5]), a mimo to każdy z nich ogłaszał graczowi JEGO stratę');
  assert(/previousOwner:\s*prevOwnerId/.test(src),
    'T2: …i płynie stamtąd, gdzie właściciel jest odczytany PRZED nadpisaniem');
  const idx = src.indexOf('prevOwnerId =');
  const assignIdx = src.indexOf('colony.ownerEmpireId = newOwnerEmpireId');
  assert(idx >= 0 && assignIdx >= 0 && idx < assignIdx,
    `T2 KONTROLA PINU: odczyt (${idx}) wypada PRZED nadpisaniem (${assignIdx}) — inaczej ` +
    'zapisalibyśmy nowego właściciela jako poprzedniego');
}

// ── T3 — bramka własności przy ODBIORCY ─────────────────────────────────────
console.log('T3 — bramka własności także przy odbiorcy (dwie warstwy)');
{
  const { nc } = boot();
  const before = nc._items?.length ?? 0;

  EventBus.emit('colony:captured', {
    planetId: 'entity_x', colonyName: 'Cudza', newOwner: 'emp_002',
    previousOwner: 'emp_001', wasHomePlanet: false,
  });
  assert((nc._items?.length ?? 0) === before,
    'T3 SEDNO: przerzut AI→AI NIE tworzy powiadomienia dla gracza — dokładnie ten fałszywy ' +
    'alarm zobaczył właściciel na GATE 1');

  EventBus.emit('colony:captured', {
    planetId: 'entity_y', colonyName: 'Moja', newOwner: 'emp_002',
    previousOwner: 'player', wasHomePlanet: false,
  });
  assert((nc._items?.length ?? 0) === before + 1,
    'T3 KONTROLA PINU: …a utrata WŁASNEJ kolonii powiadomienie tworzy (bramkujemy właściciela, ' +
    'nie funkcję)');
}

// ── T4 — stempel uczestnika-gracza ──────────────────────────────────────────
console.log('T4 — ⚠ `empireId: \'player\'` na uczestniku-graczu (naprawia 3 filtry naraz)');
{
  const eah = stripComments(readFileSync(join(SRC, 'systems', 'EnemyAttackHandler.js'), 'utf8'));
  const war = stripComments(readFileSync(join(SRC, 'systems', 'WarSystem.js'), 'utf8'));

  const unstamped = [];
  for (const [name, src] of [['EnemyAttackHandler', eah], ['WarSystem', war]]) {
    const re = /participantB:\s*\{[^}]*type:\s*'player'[^}]*\}/g;
    let m;
    while ((m = re.exec(src))) {
      if (!/empireId:\s*'player'/.test(m[0])) unstamped.push(`${name}: ${m[0].slice(0, 60)}`);
    }
  }
  assert(unstamped.length === 0,
    `T4 SEDNO: KAŻDY uczestnik-gracz niesie stempel (bez stempla: ${unstamped.join(' | ') || '—'}). ` +
    'Bez niego `UIManager` filtrował te bitwy po `p.empireId === \'player\'` i po cichu je ' +
    'pomijał — brak auto-slow, brak Dziennika, a przy przegranej gracz tracił flotę bez słowa');

  const ui = stripComments(readFileSync(join(SRC, 'scenes', 'UIManager.js'), 'utf8'));
  assert(/empireId\s*===\s*'player'/.test(ui),
    'T4 KONTROLA PINU: konsument NAPRAWDĘ filtruje po tym polu — inaczej stempel niczego nie naprawia');
}

// ── T5 — natywny alert nie żyje ─────────────────────────────────────────────
console.log('T5 — natywny `alert()` usunięty ze ścieżki utraty kolonii');
{
  const gs = stripComments(readFileSync(join(SRC, 'scenes', 'GameScene.js'), 'utf8'));
  const at = gs.indexOf("EventBus.on('colony:captured'");
  assert(at >= 0, 'T5: handler istnieje');
  const body = gs.slice(at, at + 1200);
  assert(!/alert\(/.test(body),
    'T5 SEDNO: w handlerze NIE MA `alert(` — blokujące okno przeglądarki wyglądało jak awaria ' +
    'systemu, a nie jak zdarzenie w grze (S25, potwierdzone przez właściciela na żywo)');
  assert(/previousOwner/.test(body),
    'T5: …a zamiast niego stoi bramka własności');
}

// ── T6 — i18n PL+EN ─────────────────────────────────────────────────────────
console.log('T6 — komplet i18n (nowe komunikaty + stringi desantu z S26)');
{
  const KEYS = [
    'notif.invasionTitle', 'notif.invasionSubtitle',
    'notif.colonyLostTitle', 'notif.capitalLostTitle', 'notif.colonyLostSubtitle',
    'log.autoSlowColonyLost',
    // S26 — były zaszyte po polsku w `ColonyOverlay`
    'drop.noPods', 'drop.bayEmpty', 'drop.noDominance', 'drop.notOnOcean',
    'drop.failed', 'drop.chaotic', 'drop.ok',
  ];
  for (const k of KEYS) {
    assert(typeof PL[k] === 'string' && PL[k].length > 0, `T6: PL ma \`${k}\``);
    assert(typeof EN[k] === 'string' && EN[k].length > 0, `T6: EN ma \`${k}\``);
  }
  assert(PL['drop.noPods'] !== EN['drop.noPods'],
    'T6 KONTROLA PINU: teksty NAPRAWDĘ różnią się między językami (nie skopiowany polski)');

  const co = stripComments(readFileSync(join(SRC, 'ui', 'ColonyOverlay.js'), 'utf8'));
  assert(!/_showFlash\('Brak Kapsuł/.test(co) && !/_showFlash\('Ładownia pusta/.test(co),
    'T6 SEDNO: zaszyte polskie stringi desantu ZNIKNĘŁY z kodu — gracz EN dostawał je po polsku');
}

console.log(`\n═══ ${pass} PASS, ${fail} FAIL ═══`);
process.exit(fail === 0 ? 0 : 1);
