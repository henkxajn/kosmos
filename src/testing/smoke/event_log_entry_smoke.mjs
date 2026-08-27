// Findingi 167 + 168 + 169 — keeper: WPIS DZIENNIKA MA NAZWĘ, ROK I WŁAŚCIWY KANAŁ.
// Audyt: docs/audit/EVENT_LOG_AUDIT.md · rejestr macierzysty: docs/design/VESSEL_ORDERS_PLAN.md.
//
// PO CO TO ISTNIEJE — trzy NIEZALEŻNE defekty jednego widoku, złapane audytem 2026-08-27:
//
//   167  `GameScene:2388` liczyło nazwę układu jako `sysId ?? '?'`, mimo że kanon
//        `systemDisplayName` (rejestr → nazwa GWIAZDY → id) jest zaimportowany w TYM SAMYM
//        pliku (`:15`) i użyty 2500 linii niżej przez napis intro (`:4911`). ⇒ KAŻDA bitwa
//        poza układem macierzystym meldowała się jako „⚔ Bitwa w sys_024".
//
//   168  `EventLogSystem._currentYear` aktualizuje WYŁĄCZNIE `time:display`, a `TimeSystem`
//        nie emituje go na pauzie (`TimeSystem.js:70` — early return). `restore()` nie zasiewał
//        roku ⇒ wpisy powstałe po wczytaniu, a przed pierwszą odpauzowaną klatką, dostawały
//        `year = 0` i renderowały się jako „---" (`EventLogOverlay:240`).
//
//   169  `LOG_COLORS` (`UIManager:149-150`) definiuje `poi_alert`/`poi_rally`, a `TYPE_MAP`
//        ich NIE ZNAŁO ⇒ `TYPE_MAP.info` ⇒ kanał **system**. ⚠ Objaw był podstępny: wpis miał
//        poprawny KOLOR (z `LOG_COLORS`) i wyglądał na dobrze skierowany, a wypadał z filtra
//        swojego kanału. To DOKŁADNIE ta sama cicha usterka, którą `EventLogSystem.js:45-51`
//        opisuje jako naprawioną w W2-7 dla intel/combat/diplomacy — dwa typy wtedy pominięto.
//
// ⚠ GRANICA DOWODU: `GameScene.js` NIE IMPORTUJE SIĘ pod node (memory
//   `headless-cannot-import-scene-or-overlay`), więc 167 pinujemy ŹRÓDŁOWO — ze zdejmowaniem
//   komentarzy (memory `source-pin-strip-comments`) i z kontrolą pinu. `EventLogSystem` importuje
//   się czysto (zależy tylko od `EventBus`) ⇒ 168 i 169 pinujemy WYKONANIEM.
//
//   T1  WYKONANIE — 168: restore zasiewa rok + DWIE kontrole pinu
//   T2  WYKONANIE — 169: routing poi_alert/poi_rally + TRZY kontrole pinu
//   T3  pin ŹRÓDŁOWY — 167: linia nazwy układu woła kanon + kontrole pinu (w tym wykonaniowe)

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EventLogSystem, CHANNELS } from '../../systems/EventLogSystem.js';
import { systemDisplayName } from '../../ui/MapLabelLogic.js';
import EventBus from '../../core/EventBus.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const SRC = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (...p) => readFileSync(join(SRC, ...p), 'utf8');
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// Zapis z roku 250 — jeden wpis, tak jak w prawdziwym save (`SaveSystem:206`).
const savedAtYear250 = () => ({
  entries: [{ id: 1, year: 250, createdAt: 0, text: 'stary wpis', channel: 'fleet', severity: 'info', entityRef: null }],
  nextId: 2,
});

console.log('\nT1 — 168: rok wpisu przeżywa wczytanie zapisu');
{
  EventBus.clear?.();
  const log = new EventLogSystem();
  log.restore(savedAtYear250());
  const e = log.push({ text: 'wpis tuz po wczytaniu', channel: 'system' });
  assert(e.year === 250,
    `T1: wpis po restore dziedziczy rok z zapisu (year=${e.year}) — nie "---" na ekranie`);

  // KONTROLA PINU (a): nowa gra — pusty dziennik NIE może wymyślać roku.
  EventBus.clear?.();
  const fresh = new EventLogSystem();
  fresh.restore({ entries: [], nextId: 1 });
  assert(fresh.push({ text: 'x', channel: 'system' }).year === 0,
    'T1: KONTROLA PINU — pusty zapis zostawia rok 0 (nowa gra, nie zgadujemy)');

  // KONTROLA PINU (b): żywy zegar dalej wygrywa z zasianiem — inaczej zamrozilibyśmy rok.
  EventBus.clear?.();
  const live = new EventLogSystem();
  live.restore(savedAtYear250());
  EventBus.emit('time:display', { gameTime: 261.9 });
  assert(live.push({ text: 'x', channel: 'system' }).year === 261,
    'T1: KONTROLA PINU — time:display nadal nadpisuje zasiany rok (to seed, nie zamrożenie)');
  EventBus.clear?.();
}

console.log('\nT2 — 169: typy POI trafiają do swoich kanałów');
{
  EventBus.clear?.();
  const log = new EventLogSystem();
  const alert = log.pushLegacy('pikieta wykryla wroga', 'poi_alert');
  const rally = log.pushLegacy('punkt zborny zebrany', 'poi_rally');
  assert(alert.channel === 'intel' && alert.severity === 'warn',
    `T2: poi_alert → intel/warn (było ${alert.channel}/${alert.severity}) — alarm pikiety wraca pod filtr 🔭`);
  assert(rally.channel === 'fleet' && rally.severity === 'info',
    `T2: poi_rally → fleet/info (było ${rally.channel}/${rally.severity})`);

  // KONTROLA PINU (a): naprawa nie rozlała się na resztę mapy typów.
  const combat = log.pushLegacy('bitwa', 'combat');
  const life   = log.pushLegacy('zycie', 'life_good');
  assert(combat.channel === 'combat' && combat.severity === 'warn',
    'T2: KONTROLA PINU — combat mapuje się jak dotąd (W2-7 nietknięte)');
  assert(life.channel === 'life' && life.severity === 'info',
    'T2: KONTROLA PINU — life_good mapuje się jak dotąd');

  // KONTROLA PINU (b): fallback DALEJ istnieje — inaczej T2 zzieleniałby przez zniesienie
  // gałęzi domyślnej, a nie przez dodanie dwóch wpisów.
  const unknown = log.pushLegacy('x', 'typ_ktorego_nie_ma');
  assert(unknown.channel === 'system' && unknown.severity === 'info',
    'T2: KONTROLA PINU — nieznany typ NADAL leci na system/info (mierzymy dodanie, nie usunięcie fallbacku)');

  // KONTROLA PINU (c): zakres slice'u — kanał dyplomacji świadomie POZA nim (D2).
  assert(!CHANNELS.diplomacy,
    'T2: kanał diplomacy świadomie NIE dodany w tym slice (D2 — osobna decyzja, audyt §6)');
  EventBus.clear?.();
}

console.log('\nT3 — 167: nazwa układu w linii bitwy idzie przez kanon (pin ŹRÓDŁOWY)');
{
  const gs = stripComments(read('scenes', 'GameScene.js'));
  assert(gs.length > 10000, 'T3: KONTROLA PINU — GameScene.js faktycznie wczytany (nie pusty string)');

  // Linia licząca `sysName` w handlerze `battle:resolved`.
  const m = /const\s+sysName\s*=[\s\S]{0,400}?;/.exec(gs);
  assert(!!m, 'T3: KONTROLA PINU — linia `const sysName = …` znaleziona (pin celuje w żywy kod)');
  const sysNameExpr = m ? m[0] : '';
  assert(/systemDisplayName\s*\(/.test(sysNameExpr),
    'T3: nazwa układu liczona przez systemDisplayName, nie przez surowe sysId');
  assert(!/:\s*\(\s*sysId\s*\?\?\s*'\?'\s*\)\s*;/.test(sysNameExpr),
    'T3: stary kształt `(sysId ?? "?")` zniknął z gałęzi obcego układu');
  assert(gs.includes('import { systemDisplayName }'),
    'T3: KONTROLA PINU — import kanonu jest na miejscu (mierzymy wywołanie, nie brak importu)');

  // WYKONANIE — sam kanon zachowuje się tak, jak zakłada poprawka (rejestr → gwiazda → id).
  assert(systemDisplayName('sys_024', { systems: [{ systemId: 'sys_024', galaxyStar: { name: 'LHS-5215' } }] }) === 'LHS-5215',
    'T3: kanon zwraca nazwę z rejestru układów');
  assert(systemDisplayName('sys_024', { starName: () => 'Wolf 359' }) === 'Wolf 359',
    'T3: kanon spada na nazwę GWIAZDY, gdy układu nie ma w rejestrze');
  assert(systemDisplayName('sys_024', {}) === 'sys_024',
    'T3: KONTROLA PINU — bez ŻADNEGO źródła kanon zwraca id (dlatego gałąź "?" w GameScene zostaje)');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
