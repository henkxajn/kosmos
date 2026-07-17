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

const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
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

// ── Podsumowanie ─────────────────────────────────────────────────────────────
console.log(`\nSave-do-pliku smoke: ${pass}/${pass + fail} PASS${fail ? `  (${fail} FAIL)` : ''}`);
process.exit(fail ? 1 : 0);
