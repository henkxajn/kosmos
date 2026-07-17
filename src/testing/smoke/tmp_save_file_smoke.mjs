// Save do pliku — smoke: eksport/import zapisu na dysk gracza. Node, bez canvas/three.
// Uruchom: node src/testing/smoke/tmp_save_file_smoke.mjs
//
// Pokrywa:
//   T1 slugify — diakrytyki, 'ł' (nie dekomponuje się w NFKD), znaki nielegalne, przycięcie
//   T2 buildSaveFileName — civName / generator bez civ4x / power_test / brak danych
//   T3 importSave bramka zakresu wersji — future_version / too_old + granice
//   T4 ROLLBACK: odrzucony import NIE rusza slotu (dowód, że poprzedni zapis przeżywa)
//   T5 backup przedimportowy
//   T6 i18n — parytet PL=EN dla nowych kluczy menu.* / title.*
//   T7 QUOTA — import przy pełnym storage (regresja: backup preimport blokował import)
//   T8 prune backupów migracji

// Mock localStorage odwzorowujący SEMANTYKĘ CHROME (inaczej test nie bada realnego silnika):
//  - quota jest per-origin, na SUMIE wszystkich kluczy (nie per-klucz),
//  - QuotaExceededError leci TYLKO gdy element ROŚNIE (storage_area_map.cc: `new_item_size >
//    old_item_size && new_quota_used > quota_`) — zapisy kurczące przechodzą nawet ponad budżet.
const QUOTA_UNLIMITED = Infinity;
let quotaChars = QUOTA_UNLIMITED;
const store = new Map();
const _used = () => [...store.entries()].reduce((s, [k, v]) => s + k.length + v.length, 0);
globalThis.localStorage = {
  getItem: k => store.get(k) ?? null,
  setItem: (k, v) => {
    v = String(v);
    const oldSize = store.has(k) ? store.get(k).length : 0;
    if (v.length > oldSize && _used() - oldSize + v.length > quotaChars) {
      const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e;
    }
    store.set(k, v);
  },
  removeItem: k => store.delete(k),
  get length() { return store.size; },
  key: i => [...store.keys()][i] ?? null,
};
globalThis.window = { localStorage: globalThis.localStorage, KOSMOS: {} };

let pass = 0, fail = 0;
const T = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  ✗ FAIL:', name); } };

// ═══════════════════════════════════════════════════════════════════════════
// T1 — slugify
// ═══════════════════════════════════════════════════════════════════════════
{
  const { slugify } = await import('../../utils/SaveFile.js');
  T('T1 diakrytyki zdjęte (ąęćóśźż→aecoszz)', slugify('Ząb Ćma Óśka') === 'Zab_Cma_Oska');
  T('T1 ł→l (NFKD go NIE rozkłada)',          slugify('Łódź Małpa') === 'Lodz_Malpa');
  T('T1 znaki nielegalne w nazwie pliku → _', slugify('a/b\\c:d*e?f"g<h>i|j') === 'a_b_c_d_e_f_g_h_i_j');
  T('T1 spacje → _, bez ogona',               slugify('  Zjednoczona   Federacja  ') === 'Zjednoczona_Federacja');
  T('T1 pusty/undefined → ""',                slugify('') === '' && slugify(undefined) === '' && slugify(null) === '');
  T('T1 same znaki nielegalne → ""',          slugify('!!! ??? ///') === '');
  T('T1 przycięcie do 30 znaków',             slugify('A'.repeat(50)).length === 30);
  T('T1 przycięcie NIE zostawia wiszącego _', !slugify('A'.repeat(28) + '  bardzo dluga koncowka').endsWith('_'));
  T('T1 cyfry zachowane',                     slugify('Terra 3 Prime') === 'Terra_3_Prime');
}

// ═══════════════════════════════════════════════════════════════════════════
// T2 — buildSaveFileName (czysta funkcja: liczy z danych, nie z window.KOSMOS)
// ═══════════════════════════════════════════════════════════════════════════
{
  const { buildSaveFileName } = await import('../../utils/SaveFile.js');
  T('T2 civName + rok + wersja',
    buildSaveFileName({ version: 90, gameTime: 39.11, civ4x: { civName: 'Zjednoczona Federacja' } })
    === 'kosmos_Zjednoczona_Federacja_r39_v90.json');
  T('T2 rok zaokrąglany (39.7→r40)',
    buildSaveFileName({ version: 90, gameTime: 39.7, civ4x: { civName: 'X' } }) === 'kosmos_X_r40_v90.json');
  T('T2 generator (civ4x=null) → segment nazwy pominięty',
    buildSaveFileName({ version: 90, gameTime: 5, civ4x: null }) === 'kosmos_r5_v90.json');
  T('T2 power_test civName',
    buildSaveFileName({ version: 90, gameTime: 0, civ4x: { civName: 'Test Empire' } }) === 'kosmos_Test_Empire_r0_v90.json');
  T('T2 pusty obiekt nie wysypuje',  buildSaveFileName({}) === 'kosmos_r0_v0.json');
  T('T2 undefined nie wysypuje',     buildSaveFileName(undefined) === 'kosmos_r0_v0.json');
  T('T2 zawsze .json',               buildSaveFileName({ version: 90, gameTime: 1 }).endsWith('.json'));
  T('T2 nazwa bez znaków nielegalnych',
    /^[A-Za-z0-9_.]+$/.test(buildSaveFileName({ version: 90, gameTime: 1, civ4x: { civName: 'Zły/Cel: "X"' } })));
}

// ═══════════════════════════════════════════════════════════════════════════
// T3 — importSave: bramka zakresu wersji
// ═══════════════════════════════════════════════════════════════════════════
{
  const { SaveSystem } = await import('../../systems/SaveSystem.js');
  const { CURRENT_VERSION, MIN_SUPPORTED_VERSION } = await import('../../systems/SaveMigration.js');
  store.clear();

  T('T3 future_version (CURRENT+1) odrzucone',
    SaveSystem.importSave({ version: CURRENT_VERSION + 1 }).reason === 'future_version');
  T('T3 too_old (MIN-1) odrzucone',
    SaveSystem.importSave({ version: MIN_SUPPORTED_VERSION - 1 }).reason === 'too_old');
  T('T3 granica CURRENT_VERSION przechodzi',
    SaveSystem.importSave({ version: CURRENT_VERSION, gameTime: 1 }).ok === true);
  T('T3 granica MIN_SUPPORTED_VERSION przechodzi',
    SaveSystem.importSave({ version: MIN_SUPPORTED_VERSION, gameTime: 1 }).ok === true);
  // Stare powody dalej działają (regresja kontraktu)
  T('T3 parse_error zachowany',  SaveSystem.importSave('{bad').reason === 'parse_error');
  T('T3 not_object zachowany',   SaveSystem.importSave(42).reason === 'not_object');
  T('T3 no_version zachowany',   SaveSystem.importSave({ foo: 1 }).reason === 'no_version');
  T('T3 version<1 → no_version (nie too_old)', SaveSystem.importSave({ version: 0 }).reason === 'no_version');
}

// ═══════════════════════════════════════════════════════════════════════════
// T4 — ROLLBACK: odrzucony import NIE rusza slotu
//      (to jest cały sens bramki — bez niej migrate() zwróciłby error,
//       a TitleScene zrobiłby clearSave() kasując I import, I ten zapis)
// ═══════════════════════════════════════════════════════════════════════════
{
  const { SaveSystem } = await import('../../systems/SaveSystem.js');
  const { CURRENT_VERSION, MIN_SUPPORTED_VERSION } = await import('../../systems/SaveMigration.js');
  store.clear();

  const mine = JSON.stringify({ version: CURRENT_VERSION, gameTime: 999, marker: 'MOJA_GRA' });
  globalThis.localStorage.setItem('kosmos_save_v1', mine);

  SaveSystem.importSave({ version: CURRENT_VERSION + 1, marker: 'ZLY' });
  T('T4 slot nietknięty po future_version', SaveSystem.exportSave() === mine);
  SaveSystem.importSave({ version: MIN_SUPPORTED_VERSION - 1, marker: 'ZLY' });
  T('T4 slot nietknięty po too_old',        SaveSystem.exportSave() === mine);
  SaveSystem.importSave('{bad');
  T('T4 slot nietknięty po parse_error',    SaveSystem.exportSave() === mine);
  SaveSystem.importSave({ foo: 1 });
  T('T4 slot nietknięty po no_version',     SaveSystem.exportSave() === mine);
  T('T4 marker mojej gry przeżył wszystkie odrzucenia',
    JSON.parse(SaveSystem.exportSave()).marker === 'MOJA_GRA');
}

// ═══════════════════════════════════════════════════════════════════════════
// T5 — backup przedimportowy
// ═══════════════════════════════════════════════════════════════════════════
{
  const { SaveSystem } = await import('../../systems/SaveSystem.js');
  store.clear();

  const prev = JSON.stringify({ version: 90, gameTime: 111, marker: 'POPRZEDNI' });
  globalThis.localStorage.setItem('kosmos_save_v1', prev);
  const r = SaveSystem.importSave({ version: 85, gameTime: 5, marker: 'NOWY' });

  T('T5 udany import v85', r.ok === true && r.version === 85);
  T('T5 slot ma nowy zapis',  JSON.parse(SaveSystem.exportSave()).marker === 'NOWY');
  T('T5 backup ma poprzedni', JSON.parse(globalThis.localStorage.getItem('kosmos_save_backup_preimport')).marker === 'POPRZEDNI');

  // Odrzucony import nie nadpisuje backupu poprawnym zapisem
  SaveSystem.importSave({ version: 91 });
  T('T5 backup nietknięty po odrzuceniu',
    JSON.parse(globalThis.localStorage.getItem('kosmos_save_backup_preimport')).marker === 'POPRZEDNI');

  // Import na pusty slot nie tworzy backupu-śmiecia
  store.clear();
  SaveSystem.importSave({ version: 90, gameTime: 1 });
  T('T5 brak backupu gdy slot był pusty',
    globalThis.localStorage.getItem('kosmos_save_backup_preimport') === null);
}

// ═══════════════════════════════════════════════════════════════════════════
// T6 — i18n parytet PL=EN (CLAUDE.md: każdy tekst UI w obu językach)
// ═══════════════════════════════════════════════════════════════════════════
{
  const pl = (await import('../../i18n/pl.js')).default;
  const en = (await import('../../i18n/en.js')).default;
  const KEYS = [
    'menu.saveToFile', 'menu.loadFromFile',
    'saveFile.confirmLoadTitle', 'saveFile.confirmLoadMsg',
    'saveFile.noSave', 'saveFile.loadFailed',
    'saveFile.reasonParseError', 'saveFile.reasonNoVersion',
    'saveFile.reasonFutureVersion', 'saveFile.reasonTooOld', 'saveFile.reasonWriteError',
    'title.loadFile',
  ];
  for (const k of KEYS) {
    T(`T6 PL ma ${k}`, typeof pl[k] === 'string' && pl[k].length > 0);
    T(`T6 EN ma ${k}`, typeof en[k] === 'string' && en[k].length > 0);
  }
  const plS = Object.keys(pl).filter(k => k.startsWith('saveFile.'));
  const enS = Object.keys(en).filter(k => k.startsWith('saveFile.'));
  T('T6 saveFile.* parytet PL=EN', plS.every(k => k in en) && enS.every(k => k in pl));
  T('T6 EN nie jest kopią PL (tłumaczenie realne)', en['menu.saveToFile'] !== pl['menu.saveToFile']);
}

// ═══════════════════════════════════════════════════════════════════════════
// T7 — QUOTA: import przy zapchanym storage
//      REGRESJA z live-gate: kopia przedimportowa zapisywana PRZED importem kradła
//      headroom → setItem slotu leciał QuotaExceededError → „brak miejsca w przeglądarce".
//      Przy save'ach ≥ połowy quoty dwie kopie NIE MIESZCZĄ SIĘ fizycznie — więc kopia
//      musi być luksusem po fakcie, nigdy warunkiem importu.
// ═══════════════════════════════════════════════════════════════════════════
{
  const { SaveSystem } = await import('../../systems/SaveSystem.js');
  const bigSave = (marker, pad) => JSON.stringify({ version: 90, gameTime: 1, marker, pad: 'x'.repeat(pad) });

  // Slot zajmuje ~60% quoty → druga kopia fizycznie się nie mieści.
  store.clear();
  quotaChars = 10000;
  globalThis.localStorage.setItem('kosmos_save_v1', bigSave('STARY', 5500));
  const r1 = SaveSystem.importSave(bigSave('NOWY', 5500));
  T('T7 import DUŻEGO save przechodzi mimo ciasnej quoty', r1.ok === true);
  T('T7 slot ma zaimportowany save',        JSON.parse(SaveSystem.exportSave()).marker === 'NOWY');
  T('T7 kopia pominięta gdy się nie mieści', globalThis.localStorage.getItem('kosmos_save_backup_preimport') === null);

  // ⚠ SEDNO REGRESJI: kopia MIEŚCI SIĘ, ale zjada headroom pod WIĘKSZY import.
  // Stara kolejność (kopia PRZED importem): slot 3000 + kopia 3000 = 6000/7000 → import 4500
  // rośnie o 1500 → 7500 > 7000 → QuotaExceededError → „brak miejsca w przeglądarce".
  // Nowa kolejność: import 4500 wchodzi (4500/7000), kopia dopiero potem i tylko jeśli wejdzie.
  store.clear();
  quotaChars = 7000;
  globalThis.localStorage.setItem('kosmos_save_v1', bigSave('STARY', 2900));
  const r0 = SaveSystem.importSave(bigSave('NOWY', 4400));
  T('T7 ⚠ import WIĘKSZY niż poprzedni przechodzi (kopia nie kradnie headroomu)', r0.ok === true);
  T('T7 ⚠ slot ma nowy save',  JSON.parse(SaveSystem.exportSave()).marker === 'NOWY');

  // Backupy migracji zjadły miejsce → prune je usuwa i import przechodzi.
  store.clear();
  quotaChars = 10000;
  globalThis.localStorage.setItem('kosmos_save_v1', bigSave('STARY', 2000));
  globalThis.localStorage.setItem('kosmos_save_backup_v88', bigSave('B88', 2000));
  globalThis.localStorage.setItem('kosmos_save_backup_v89', bigSave('B89', 2000));
  const r2 = SaveSystem.importSave(bigSave('NOWY', 3500));
  T('T7 import przechodzi po sprzątnięciu backupów migracji', r2.ok === true);
  T('T7 backupy migracji usunięte',
    globalThis.localStorage.getItem('kosmos_save_backup_v88') === null &&
    globalThis.localStorage.getItem('kosmos_save_backup_v89') === null);

  // Beznadziejna ciasnota: import większy niż CAŁA quota → uczciwa porażka, slot NIETKNIĘTY.
  store.clear();
  quotaChars = 5000;
  const mine = bigSave('MOJA_GRA', 1000);
  globalThis.localStorage.setItem('kosmos_save_v1', mine);
  const r3 = SaveSystem.importSave(bigSave('ZA_DUZY', 9000));
  T('T7 import ponad quotę → write_error', r3.ok === false && r3.reason === 'write_error');
  T('T7 po write_error slot NIETKNIĘTY (setItem atomowy)', SaveSystem.exportSave() === mine);

  // Mały save w luźnej quocie → kopia JEST (siatka za darmo).
  store.clear();
  quotaChars = QUOTA_UNLIMITED;
  globalThis.localStorage.setItem('kosmos_save_v1', bigSave('POPRZEDNI', 10));
  SaveSystem.importSave(bigSave('NOWY', 10));
  T('T7 mały save → kopia przedimportowa powstaje',
    JSON.parse(globalThis.localStorage.getItem('kosmos_save_backup_preimport')).marker === 'POPRZEDNI');

  quotaChars = QUOTA_UNLIMITED;
}

// ═══════════════════════════════════════════════════════════════════════════
// T8 — prune backupów migracji (zero czytelników w grze, każdy waży tyle co save)
// ═══════════════════════════════════════════════════════════════════════════
{
  const { pruneMigrationBackups } = await import('../../systems/SaveMigration.js');
  store.clear();
  globalThis.localStorage.setItem('kosmos_save_v1', '{"version":90}');
  globalThis.localStorage.setItem('kosmos_save_backup_v85', 'a');
  globalThis.localStorage.setItem('kosmos_save_backup_v88', 'b');
  globalThis.localStorage.setItem('kosmos_save_backup_v89', 'c');
  globalThis.localStorage.setItem('kosmos_lang', 'pl');

  T('T8 usuwa wszystkie backupy migracji', pruneMigrationBackups() === 3);
  T('T8 slot nietknięty',      SaveSystem_slotIntact());
  T('T8 preferencje nietknięte', globalThis.localStorage.getItem('kosmos_lang') === 'pl');
  T('T8 idempotentny (drugi przebieg = 0)', pruneMigrationBackups() === 0);

  // keepVersion zostawia wskazany backup (używane przy migracji — świeży ma przetrwać)
  globalThis.localStorage.setItem('kosmos_save_backup_v88', 'b');
  globalThis.localStorage.setItem('kosmos_save_backup_v89', 'c');
  T('T8 keepVersion zostawia wskazany', pruneMigrationBackups({ keepVersion: 89 }) === 1);
  T('T8 zachowany to ten wskazany',
    globalThis.localStorage.getItem('kosmos_save_backup_v89') === 'c' &&
    globalThis.localStorage.getItem('kosmos_save_backup_v88') === null);

  function SaveSystem_slotIntact() { return globalThis.localStorage.getItem('kosmos_save_v1') === '{"version":90}'; }
}

// ═══════════════════════════════════════════════════════════════════════════
// T9 — flaga „wczytaj od razu po reloadzie" (import z gry pomija ekran tytułowy)
// ═══════════════════════════════════════════════════════════════════════════
{
  const sess = new Map();
  globalThis.sessionStorage = {
    getItem: k => sess.get(k) ?? null,
    setItem: (k, v) => sess.set(k, String(v)),
    removeItem: k => sess.delete(k),
  };
  const { markPendingLoad, consumePendingLoad } = await import('../../utils/SaveFile.js');

  sess.clear();
  T('T9 bez flagi → false (normalny start = ekran tytułowy)', consumePendingLoad() === false);

  markPendingLoad();
  T('T9 po mark → true', consumePendingLoad() === true);
  T('T9 flaga JEDNORAZOWA (drugi odczyt false — crash nie zapętli auto-startu)',
    consumePendingLoad() === false);
  T('T9 klucz sprzątnięty z sessionStorage', sess.get('kosmos_pending_load') === undefined);

  // Brak sessionStorage (tryb prywatny) → degradacja do ekranu tytułowego, bez wyjątku
  const savedSess = globalThis.sessionStorage;
  globalThis.sessionStorage = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => {} };
  let threw = false;
  try { markPendingLoad(); consumePendingLoad(); } catch { threw = true; }
  T('T9 niedostępny sessionStorage nie wysypuje (graceful)', threw === false);
  T('T9 niedostępny sessionStorage → false (ekran tytułowy jako fallback)', consumePendingLoad() === false);
  globalThis.sessionStorage = savedSess;
}

// ── Podsumowanie ─────────────────────────────────────────────────────────────
console.log(`\nSave-do-pliku smoke: ${pass}/${pass + fail} PASS${fail ? `  (${fail} FAIL)` : ''}`);
process.exit(fail ? 1 : 0);
