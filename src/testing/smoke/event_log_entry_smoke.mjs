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
//   T4  WYKONANIE — D2: kanał dyplomacji + trzy szczeble severity + kontrola pinu na braku migracji
//   T5  WYKONANIE — 174: słowniki nie mieszają języków w kluczach Dziennika (+ kontrola pinu)
//   T6  pin ŹRÓDŁOWY — 176/172: chrome widoku przez t(), strzałka tylko dla osiągalnego celu

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

  EventBus.clear?.();
}

console.log('\nT4 — D2: dyplomacja ma własny kanał i rozróżnia sukces od porażki');
{
  EventBus.clear?.();
  const log = new EventLogSystem();
  const ok    = log.pushLegacy('traktat przyjęty',  'diplomacy');
  const bad   = log.pushLegacy('pokój odrzucony',   'diplomacy_warn');
  const war   = log.pushLegacy('wojna wypowiedziana', 'diplomacy_alert');

  assert(!!CHANNELS.diplomacy, 'T4: kanał diplomacy istnieje w CHANNELS (był tylko w LOG_COLORS)');
  assert(CHANNELS.diplomacy.labelPL && CHANNELS.diplomacy.labelEN,
    'T4: kanał ma OBIE etykiety językowe (reguła dwujęzyczności z CLAUDE.md)');
  assert([ok, bad, war].every(e => e.channel === 'diplomacy'),
    'T4: wszystkie trzy szczeble lądują na kanale diplomacy, nie w System');

  // ⚠ Sedno D2: JEDEN typ nie umiał rozróżnić sojuszu od wypowiedzenia wojny — oba były 'warn'.
  assert(ok.severity === 'info' && bad.severity === 'warn' && war.severity === 'alert',
    `T4: trzy szczeble severity (${ok.severity}/${bad.severity}/${war.severity}) — sojusz nie wygląda już jak ostrzeżenie`);

  // KONTROLA PINU: stary wpis z zapisu (channel 'system') NIE jest migrowany — zostaje, gdzie był.
  const old = new EventLogSystem();
  old.restore({ entries: [{ id: 1, year: 5, createdAt: 0, text: 'stara dyplomacja', channel: 'system', severity: 'warn' }], nextId: 2 });
  assert(old.getEntries()[0].channel === 'system',
    'T4: KONTROLA PINU — stare wpisy zostają na kanale system (brak migracji, świadomie)');
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

console.log('\nT5 — 174: słownik PL nie mówi po angielsku w kluczach Dziennika');
{
  const pl = (await import('../../i18n/pl.js')).default;
  const en = (await import('../../i18n/en.js')).default;

  assert(Object.keys(pl).length === Object.keys(en).length && Object.keys(pl).length > 3000,
    `T5: KONTROLA PINU — oba słowniki wczytane i równoliczne (pl=${Object.keys(pl).length}, en=${Object.keys(en).length})`);

  // ⚠ To NIE sa literaly w kodzie — to wpisy w kanonicznym slowniku. `check-i18n` ich nie
  //   widzi, bo sprawdza ISTNIENIE kluczy, nie jezyk ich TRESCI.
  const EN_IN_PL = /\b(vessel|vessels|waypoint|waypoints|retreat|friendly|engage|pursue|intercept|placeholder)\b/i;
  const dirty = Object.entries(pl)
    .filter(([k, v]) => typeof v === 'string' && /^(log\.|eventLog\.|tooltip\.poi\.|poi\.create\.|fleet\.doctrine\.|unit\.)/.test(k))
    .filter(([, v]) => EN_IN_PL.test(v));
  assert(dirty.length === 0,
    `T5: zero angielskich słów w polskich wpisach Dziennika/POI/doktryn (znaleziono ${dirty.length}: ${dirty.map(d => d[0]).join(', ')})`);

  // KONTROLA PINU: predykat NIE jest jałowy — na sztucznej próbce musi zapłonąć.
  assert(EN_IN_PL.test('Punkt zborny zebrany — 3 vessels gotowe'),
    'T5: KONTROLA PINU — predykat wykrywa angielskie słowo w polskim zdaniu');

  // Notatka deweloperska wystawiona graczowi jako opis jednostki — w OBU jezykach.
  assert(!/placeholder/i.test(pl['unit.space_supply_ship.desc'] ?? '')
      && !/placeholder/i.test(en['unit.space_supply_ship.desc'] ?? ''),
    'T5: opis jednostki nie jest już notatką deweloperską („placeholder — fleet-group…")');
}

console.log('\nT6 — 176/172: chrome widoku i martwy klik (pin ŹRÓDŁOWY)');
{
  const ov = stripComments(read('ui', 'EventLogOverlay.js'));
  assert(ov.length > 3000, 'T6: KONTROLA PINU — EventLogOverlay.js wczytany');

  // 176 — zero POLSKICH literałów w widoku (komentarze zdjęte wyżej).
  // ⚠ PIERWSZA WERSJA TEGO PINU BYŁA JAŁOWA: szukała `getLocale() === 'pl' ? '…'`, a stary kod
  //   przypisywał najpierw `const pl = getLocale() === 'pl'` i dopiero potem robił `pl ? … : …`
  //   ⇒ pin ŚWIECIŁ ZIELONO na kodzie sprzed naprawy (zmierzone). Teraz mierzy SKUTEK —
  //   obecność polskiego napisu — a nie jeden konkretny kształt zapisu ternary.
  const PL_DIA = /[ĄĆĘŁŃÓŚŹŻąćęłńóśźż]/;
  const plLiterals = [...ov.matchAll(/'([^'\n]*)'|"([^"\n]*)"/g)]
    .map(m => m[1] ?? m[2] ?? '')
    .filter(s => PL_DIA.test(s));
  assert(plLiterals.length === 0,
    `T6: zero polskich literałów w widoku (znaleziono ${plLiterals.length}: ${plLiterals.slice(0, 3).join(' | ')})`);
  assert(PL_DIA.test('Dziennik pusty — brak wpisów'),
    'T6: KONTROLA PINU — predykat wykrywa polski napis (nie jest jałowy na niepustej próbce)');
  assert(!ov.includes('Dziennik niedostępny'),
    'T6: komunikat awarii przez t() — miał zaszyty polski BEZ wariantu EN');
  assert(ov.includes("t('eventLog.title')") && ov.includes("t('eventLog.history')"),
    'T6: nagłówki idą przez t()');

  // ⚠ KONTROLA PINU: `getLocale` ZOSTAJE — etykiety kanalow to DANE (labelPL/labelEN
  //   w `CHANNELS`), a nie klucze slownika. Pin nie ma zabraniac samego getLocale.
  assert(ov.includes('getLocale'),
    'T6: KONTROLA PINU — getLocale nadal używany (etykiety kanałów to dane, nie klucze)');

  // 172 — strzalka „przejdz" tylko dla wpisu, ktory realnie gdzies prowadzi.
  assert(/const clickable = _isNavigable\(/.test(ov),
    'T6: klikalność wpisu liczona przez _isNavigable, nie przez samo istnienie entityRef');
  assert(!/const clickable = !!entry\.entityRef/.test(ov),
    'T6: stary kształt (każdy entityRef = klikalny) zniknął — bitwy stemplują id UKŁADU, a układy nie są encjami');
  assert(!/console\.log\('\[EventLog\] klik/.test(ov),
    'T6: log deweloperski na każde kliknięcie usunięty z produkcji');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
