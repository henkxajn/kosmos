// S3.4 FAZA 6 — smoke: domknięcie. Node, bez canvas/three.
// Uruchom: node tmp_s34_faza6_smoke.mjs
//
// Pokrywa:
//   §6.2 sweep martwego kodu — StationData.buildTime usunięte; i18n station.moduleShipyardSoon/
//        station.rename usunięte (PL+EN); parytet kluczy station.* PL=EN.
//   backlog 2 — SaveSystem.exportSave()/importSave() (backup przed bumpem wersji).

const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
globalThis.window = { localStorage: globalThis.localStorage, KOSMOS: {} };

let pass = 0, fail = 0;
const T = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  ✗ FAIL:', name); } };

// ═══════════════════════════════════════════════════════════════════════════
// §6.2 — sweep martwego kodu stacji
// ═══════════════════════════════════════════════════════════════════════════
{
  const { STATIONS, stationTotalCost } = await import('../../data/StationData.js');
  T('6.2 StationData.orbital_station.buildTime USUNIĘTE', STATIONS.orbital_station.buildTime === undefined);
  T('6.2 maxModules zachowane (=8)', STATIONS.orbital_station.maxModules === 8);
  T('6.2 stationTotalCost dalej scala koszt (Fe obecne)', (stationTotalCost().Fe ?? 0) > 0);

  const pl = (await import('../../i18n/pl.js')).default;
  const en = (await import('../../i18n/en.js')).default;
  T('6.2 PL station.moduleShipyardSoon USUNIĘTE', !('station.moduleShipyardSoon' in pl));
  T('6.2 EN station.moduleShipyardSoon USUNIĘTE', !('station.moduleShipyardSoon' in en));
  T('6.2 PL station.rename USUNIĘTE', !('station.rename' in pl));
  T('6.2 EN station.rename USUNIĘTE', !('station.rename' in en));
  // Parytet kluczy station.* PL=EN (żadna strona nie ma osieroconego klucza)
  const plS = Object.keys(pl).filter(k => k.startsWith('station.'));
  const enS = Object.keys(en).filter(k => k.startsWith('station.'));
  const onlyPl = plS.filter(k => !(k in en));
  const onlyEn = enS.filter(k => !(k in pl));
  T('6.2 station.* parytet PL=EN (brak osieroconych)', onlyPl.length === 0 && onlyEn.length === 0);
  T('6.2 station.modules zachowane (nie zmiotło żywych)', 'station.modules' in pl && 'station.modules' in en);
}

// ═══════════════════════════════════════════════════════════════════════════
// backlog 2 — SaveSystem.exportSave() / importSave()
// ═══════════════════════════════════════════════════════════════════════════
{
  const { SaveSystem } = await import('../../systems/SaveSystem.js');
  store.clear();
  T('imp export bez zapisu → null', SaveSystem.exportSave() === null);
  T('imp parse_error (zły JSON)', SaveSystem.importSave('{bad').reason === 'parse_error');
  T('imp no_version (brak pola version)', SaveSystem.importSave({ foo: 1 }).reason === 'no_version');
  T('imp not_object/no_version (liczba)', ['not_object', 'no_version'].includes(SaveSystem.importSave(42).reason));

  const r1 = SaveSystem.importSave({ version: 90, gameTime: 123 });
  T('imp obiekt v90 ok', r1.ok === true && r1.version === 90);
  T('exp po imporcie → string', typeof SaveSystem.exportSave() === 'string');
  T('round-trip version=90 zachowana', JSON.parse(SaveSystem.exportSave()).version === 90);

  const r2 = SaveSystem.importSave(JSON.stringify({ version: 85, gameTime: 5 }));
  T('imp string v85 ok', r2.ok === true && r2.version === 85);
  T('nadpisanie slotu (v90→v85)', JSON.parse(SaveSystem.exportSave()).version === 85);
}

// ── Podsumowanie ─────────────────────────────────────────────────────────────
console.log(`\nS3.4 FAZA 6 smoke: ${pass}/${pass + fail} PASS${fail ? `  (${fail} FAIL)` : ''}`);
process.exit(fail ? 1 : 0);
