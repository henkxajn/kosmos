// ═══════════════════════════════════════════════════════════════
// SONDA READ-ONLY — inspekcja kanonicznego fixture'u zapisu (krok 2 konwencji fixture'ów)
// Uruchom: node src/testing/headless/probe-fixture-inspect.mjs <plik.save.json[.gz]> [--json]
// ───────────────────────────────────────────────────────────────
// PO CO: `GATE-S4-fresh-gy60` istniał wyłącznie w localStorage przeglądarki — nie dało się go
//   ani zachować, ani podać CC. Ta sonda czyta zapis Z DYSKU i odpowiada na pytania STRUKTURALNE
//   (kolonie, placówki i ich układy, trasy logistyki i pozy kurierów, magazyny stolic, flota),
//   czyli na to, czego zwykle potrzebuje KONTROLA gate'u: „czy sześć kadłubów zamarzło",
//   „co stolica trzymała".
//
// ⚠ TO NIE JEST REPLAY I NIM NIE BĘDZIE BEZ OSOBNEGO SLICE'U. `GameCore.boot` nie ma ścieżki
//   restore (twardo `window.KOSMOS.savedData = null`, `:130`), a łańcuch przywracania mieszka
//   w `GameScene`, który nie importuje się pod node. Prerekwizyt zaparkowany — patrz
//   `src/testing/fixtures/README.md`.
//
// ⚠ ŻADNEGO SILNIKA: sonda NIE importuje `env.js` ani niczego z gry. Czyta czysty JSON.
//   Dzięki temu działa na fixture'ach z DOWOLNEJ wersji zapisu, także spoza zakresu migracji —
//   a to jest dokładnie ten przypadek, w którym chcemy wiedzieć, co w pliku jest.
//
// ⚠ WŁASNOŚĆ KOLONII NIE JEST W REKORDZIE KOLONII. `ColonyManager.serialize:2435-2466` nie
//   zapisuje `ownerEmpireId` — własność WYPROWADZA SIĘ z `gameState.empires[].colonies`
//   (P0-B, `EmpireColonyBootstrap:543`). Sonda robi dokładnie to samo i mówi wprost, gdy nie może.
// ═══════════════════════════════════════════════════════════════

import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const file = args.find(a => !a.startsWith('--'));

if (!file) {
  console.error('Uzycie: node src/testing/headless/probe-fixture-inspect.mjs <plik.save.json[.gz]> [--json]');
  process.exit(2);
}
if (!fs.existsSync(file)) {
  console.error(`Nie ma pliku: ${file}`);
  process.exit(2);
}

// ── Wczytanie: .gz rozpakowywane w locie ──────────────────────────────────────
let raw;
try {
  const buf = fs.readFileSync(file);
  raw = file.endsWith('.gz') ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8');
} catch (e) {
  console.error(`Nie udalo sie odczytac/rozpakowac: ${e.message}`);
  process.exit(2);
}

let data;
try { data = JSON.parse(raw); }
catch (e) { console.error(`To nie jest poprawny JSON zapisu: ${e.message}`); process.exit(2); }

const c4 = data.civ4x ?? null;
const gs = c4?.gameState ?? null;
const num = (n) => (typeof n === 'number' ? Math.round(n * 100) / 100 : n);

// ── Wyprowadzenie wlasnosci: empires[].colonies (rekord kolonii jej NIE NIESIE) ────
const empires = [];
const rawEmpires = gs?.empires;
if (Array.isArray(rawEmpires)) empires.push(...rawEmpires);
else if (rawEmpires && typeof rawEmpires === 'object') empires.push(...Object.values(rawEmpires));

const ownerOf = new Map();          // planetId -> empireId
for (const e of empires) {
  for (const cid of (e?.colonies ?? [])) ownerOf.set(cid, e.id);
}

const colonies = c4?.colonies ?? [];
const vessels = c4?.vesselManager?.vessels ?? [];
const inv = (col) => col?.resources?.inventory ?? {};
const amt = (col, r) => Math.round(inv(col)[r] ?? 0);
const pop = (col) => {
  const strata = col?.civ?.strata;
  if (Array.isArray(strata)) return Math.floor(strata.reduce((s, x) => s + (x?.count ?? 0), 0) + (col.civ.unemployed ?? 0));
  return Math.floor(col?.civ?.population ?? 0);
};

// ── Raport ────────────────────────────────────────────────────────────────────
const report = {
  plik: path.basename(file),
  rozmiar: { surowyKB: Math.round(Buffer.byteLength(raw, 'utf8') / 1024), naDyskuKB: Math.round(fs.statSync(file).size / 1024) },
  wersjaZapisu: data.version ?? null,
  gameTime: num(data.gameTime),
  civMode: !!c4?.civMode,
  civName: c4?.civName ?? null,
  homePlanetId: c4?.homePlanetId ?? null,
  activePlanetId: c4?.activePlanetId ?? null,
  kolonie: { razem: colonies.length, gracza: 0, ai: 0, placowki: 0 },
  imperia: [],
  flota: { razem: vessels.length, gracza: 0, ai: 0, wraki: 0, wBaku: 0 },
};

for (const col of colonies) {
  const own = ownerOf.get(col.planetId) ?? null;
  if (own) report.kolonie.ai++; else report.kolonie.gracza++;
  if (col.isOutpost) report.kolonie.placowki++;
}

for (const e of empires) {
  const own = (e.colonies ?? []).map(id => colonies.find(c => c.planetId === id)).filter(Boolean);
  const cap = own.find(c => !c.isOutpost) ?? null;
  const capSys = cap?.systemId ?? null;
  const logi = e.logistics ?? null;

  const trasy = (logi?.routes ?? []).map(r => {
    const outp = colonies.find(c => c.planetId === r.outpostId) ?? null;
    const kur = (r.courierIds ?? []).map(id => {
      const v = vessels.find(x => x.id === id);
      if (!v) return { id, brak: true };
      const m = v.mission ?? null;
      const cel = m ? (m.phase === 'returning' ? m.returnYear : m.arrivalYear) : null;
      return {
        id: v.id, sys: v.systemId ?? null, status: v.status,
        state: v.position?.state ?? null, dock: v.position?.dockedAt ?? null,
        faza: m?.phase ?? null, cel: cel == null ? null : num(cel),
        spozniony: cel != null && typeof data.gameTime === 'number' ? data.gameTime >= cel : null,
        opoznienieLat: cel != null && typeof data.gameTime === 'number' ? num(data.gameTime - cel) : null,
        cargoUsed: num(v.cargoUsed ?? 0),
      };
    });
    return {
      routeId: r.routeId, outpostId: r.outpostId, outSys: outp?.systemId ?? null,
      teSameUklady: outp ? outp.systemId === capSys : null,
      Nt: outp ? amt(outp, 'Nt') : null,
      kurierzy: kur,
    };
  });

  report.imperia.push({
    id: e.id, archetyp: e.archetype ?? null, homeSystemId: e.homeSystemId ?? null,
    stolica: cap ? { planetId: cap.planetId, nazwa: cap.name, sys: capSys, pop: pop(cap),
      Nt: amt(cap, 'Nt'), Fe: amt(cap, 'Fe'), Si: amt(cap, 'Si'), Cu: amt(cap, 'Cu'), C: amt(cap, 'C'),
      QC: amt(cap, 'quantum_cores'), AC: amt(cap, 'antimatter_cells'), WC: amt(cap, 'warp_cores'),
      kredyty: num(cap.credits ?? 0) } : null,
    kolonie: own.filter(c => !c.isOutpost).length,
    placowki: own.filter(c => c.isOutpost).map(o => ({ planetId: o.planetId, sys: o.systemId, Nt: amt(o, 'Nt'), Xe: amt(o, 'Xe') })),
    logistyka: logi ? { stats: logi.stats ?? null, tras: (logi.routes ?? []).length,
      rezerwa: (logi.reserve ?? []).length, pendingBuildRoute: logi.pendingBuildRoute ?? null } : null,
    trasy,
  });
}

for (const v of vessels) {
  if (v.isWreck) report.flota.wraki++;
  if (v.ownerEmpireId) report.flota.ai++; else report.flota.gracza++;
  if ((v.warpFuel?.max ?? 0) > 0) report.flota.wBaku++;
}

if (asJson) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }

// ── Wydruk czytelny ───────────────────────────────────────────────────────────
const L = console.log;
L(`═══ FIXTURE ${report.plik} ═══`);
L(`  wersja zapisu=${report.wersjaZapisu}  gameTime=${report.gameTime}  civMode=${report.civMode}`
  + `  cywilizacja="${report.civName}"`);
L(`  rozmiar: ${report.rozmiar.naDyskuKB} KB na dysku / ${report.rozmiar.surowyKB} KB surowo`);
if (!c4) { L('  ⚠ BRAK bloku civ4x — zapis sprzed przejecia cywilizacji albo uszkodzony.'); process.exit(0); }
if (empires.length === 0) {
  L('  ⚠ BRAK `gameState.empires` — WLASNOSCI KOLONII NIE DA SIE WYPROWADZIC z tego pliku.');
  L('     (rekord kolonii nie niesie `ownerEmpireId`; patrz naglowek sondy)');
}
L(`  kolonie: razem ${report.kolonie.razem} · gracza ${report.kolonie.gracza} · AI ${report.kolonie.ai}`
  + ` · placowki ${report.kolonie.placowki}`);
L(`  flota: razem ${report.flota.razem} · gracza ${report.flota.gracza} · AI ${report.flota.ai}`
  + ` · wraki ${report.flota.wraki} · z bakiem warp ${report.flota.wBaku}`);

for (const e of report.imperia) {
  L(`\n── ${e.id} (${e.archetyp}) home=${e.homeSystemId} ──`);
  if (e.stolica) {
    const s = e.stolica;
    L(`  stolica ${s.nazwa} (${s.planetId}) @${s.sys}  pop=${s.pop}  Kr=${s.kredyty}`);
    L(`     Nt=${s.Nt} Fe=${s.Fe} Si=${s.Si} Cu=${s.Cu} C=${s.C} | QC=${s.QC} AC=${s.AC} WC=${s.WC}`);
    L(`     bramka zamoznosci (Fe/Si/Cu/C >= 20k): ${[s.Fe, s.Si, s.Cu, s.C].every(v => v >= 20000)}`);
  } else L('  ⚠ brak pelnej kolonii (stolicy) w tym imperium');
  L(`  kolonie=${e.kolonie}  placowki=${e.placowki.length}`);
  for (const o of e.placowki) L(`     ${o.planetId}@${o.sys}  Nt=${o.Nt} Xe=${o.Xe}`);
  if (e.logistyka) {
    L(`  logistyka: tras=${e.logistyka.tras} rezerwa=${e.logistyka.rezerwa}`
      + ` pendingBuildRoute=${e.logistyka.pendingBuildRoute}`
      + ` stats=${JSON.stringify(e.logistyka.stats)}`);
  }
  for (const t of e.trasy) {
    L(`     trasa ${t.routeId} → ${t.outpostId}@${t.outSys} teSameUklady=${t.teSameUklady} Nt=${t.Nt}`);
    for (const k of t.kurierzy) {
      if (k.brak) { L(`        ${k.id}: BRAK W REJESTRZE`); continue; }
      L(`        ${k.id} sys=${k.sys} ${k.status}/${k.state} dock=${k.dock} faza=${k.faza}`
        + ` cel=${k.cel} spozniony=${k.spozniony}`
        + (k.opoznienieLat != null && k.spozniony ? ` (o ${k.opoznienieLat} lat)` : '')
        + ` cargo=${k.cargoUsed}`);
    }
  }
}
L('\n(sonda read-only — niczego nie zapisuje i nie uruchamia silnika)');
