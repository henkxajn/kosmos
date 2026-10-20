// ═══════════════════════════════════════════════════════════════════════════════
// system_tree_smoke — KEEPER ARKUSZA UI, U2-1 (lewy outliner: drzewo „układy → ciała”)
// Rejestr: `docs/design/UI_PLAN.md` §4.3 (U2-1), §2 (D-UI-2, D-UI-3, D-UI-4), §5 (decyzje 3, 5 (b)), §7.4, §7.5,
//   §7.6 (zmienione 2026-10-19: planety, księżyce i planetoidy), §7.19 (glif układu).
// ─────────────────────────────────────────────────────────────────────────────
// WYKONANIE czystego `SystemTreeLogic.buildSystemTree` na danych w KSZTAŁCIE zapisów właściciela (odczytane sondą
// read-only z `kosmos_Zjednoczona_Federacja_r120_v101 (3).json` i `kosmos_Polonia_r79_v101.json`: identyfikatory,
// nazwy, `distanceLY`, flagi `galaxyStar.explored` / lustra `sysData.explored`, właściciele kolonii z `empires[].colonies`).
//
// PINY:
//   T1  ZF gy120 — widoczność i kolejność 13 zarejestrowanych układów: dom; kolonie z POP wg odległości; reszta wg
//       odległości; `sys_040` / `sys_020` (same kolonie AI, `galaxyStar.explored = false`, lustro `true`) poza listą
//   T2  Finding 480 — `sys_024` (kolonia gracza + placówka, `explored = false`) widoczny, grupa (2); KONTROLA: bez
//       własnej obecności ten sam układ znika (to „lub” obecności go pokazuje, nie lustro)
//   T3  grupa (2b) same placówki PO grupie (2a), choć bliżej; układ z samą stacją → grupa (3) (§7.4); remis
//       odległości → nazwa
//   T4  glif §7.19: 🏛 / ⛺ / ⚑ / brak; własna obecność wygrywa z obcą
//   T5  ciała (§7.6): planety + planetoidy w kolejności orbit, księżyce wcięte pod planetą, asteroidy i komety poza
//       listą (logika nawet o nie nie pyta); stacje gracza pod ciałem-matką, stacja AI poza listą, sierota na końcu
//   T6  Polonia gy79 `sys_044` / `sys_008` — 0 rozpoznanych planet i księżyców: lista = mapa (wszystkie ciała), „○”
//       (`recognized: false`) przy każdym nierozpoznanym
//   T7  znaczniki: 🪖N (jednostki gracza na ciele), ⏳N (kolejka kolonii gracza), nazwa kolonii własnej vs nazwa
//       CIAŁA dla kolonii AI (fixture rozjeżdża obie nazwy)
//   T8  `colonyQueueCount` — budynki, statki, placówki, kolejka fabryki; bez stałej produkcji (alokacji)
//   T9  zwijanie (D-UI-4, §7.5): domyślnie tylko bieżący; jawny stan wygrywa w obie strony; układ zwinięty bez
//       wierszy ciał i bez odczytu rejestru ciał
//   T10 (ARKUSZ UI U3-0, Finding 489) Polonia gy79 — Akhernar (`explored = false`, Twój statek) na liście w grupie (3)
//       z glifem ⚑; Wezen (nic gracza) ukryty; KONTROLA: bez statków Akhernar ukryty; tranzyt warp i wrak nie
//       odsłaniają układu; własne wojska na ciele układu (desant) — odsłaniają
//
// ⚠ Moduł POWSTAJE w U2-1 — import dynamiczny w try/catch (pin DEGRADUJE, nie przerywa całej suity przy fail-first).
// ═══════════════════════════════════════════════════════════════════════════════

let L = null;
try { L = await import('../../ui/SystemTreeLogic.js'); } catch { /* piny padną */ }

let pass = 0, fail = 0;
const ok = (c, label) => { if (c) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };
const header = (s) => console.log('\n── ' + s + ' ──');
const tree = (ctx) => (typeof L?.buildSystemTree === 'function' ? L.buildSystemTree(ctx) : { systems: [] });
const ids = (t) => t.systems.map((s) => s.systemId);

// ── Fixture ZF gy120 (kształt zapisu: rejestr układów + gwiazdy galaktyki + kolonie z właścicielem) ───────────────
// [id, nazwa, distanceLY, galaxyStar.explored, kolonie gracza [ [ciało, placówka?] ], kolonie AI [ciało]]
const ZF = [
  ['sys_home', 'Kepler-4799', 0,    true,  [['entity_5', false], ['entity_6', false], ['entity_7', false], ['entity_36', true], ['entity_40', true]], []],
  ['sys_061',  'Thuban',      16.4, true,  [['entity_55', false]], ['entity_54', 'entity_56', 'entity_129', 'entity_126', 'entity_57', 'entity_58', 'entity_59']],
  ['sys_040',  'Castor',      19.3, false, [], ['entity_163', 'entity_165']],
  ['sys_020',  'Shaula',      16.9, false, [], ['entity_305', 'entity_303', 'entity_219', 'entity_218', 'entity_221', 'entity_223', 'entity_220', 'entity_222']],
  ['sys_024',  'Diphda',      14.6, false, [['entity_346', true], ['entity_323', false]], ['entity_345']],
  ['sys_035',  'Alnilam',     4.9,  true,  [], []],
  ['sys_067',  'Nekkar',      8.5,  true,  [], ['entity_632']],
  ['sys_059',  'Lalande',     5.4,  true,  [['entity_764', false]], []],
  ['sys_051',  'Bellatrix',   12.1, true,  [['entity_777', false]], []],
  ['sys_038',  'Alcor',       12.5, true,  [], []],
  ['sys_008',  'Kochab',      3.9,  true,  [['entity_981', false]], []],
  ['sys_050',  'Alsephina',   9.1,  true,  [], []],
  ['sys_003',  'Seginus',     4.5,  true,  [], []],
];
const zfWorld = (rows = ZF) => {
  const systems = [], colonies = [], bodySys = new Map(), names = new Map();
  for (const [id, name, dist, expl, own, ai] of rows) {
    names.set(id, name);
    // `explored: true` = LUSTRO (`sysData.explored`) — w zapisach sprzed 186 zostaje zapalone; kanon go nie czyta.
    systems.push({ systemId: id, explored: true, galaxyStar: id === 'sys_home' ? null : { id, name, distanceLY: dist, explored: expl } });
    for (const [pid, outpost] of own) { bodySys.set(pid, id); colonies.push({ planetId: pid, name: pid, isOutpost: outpost, ownerEmpireId: null }); }
    for (const pid of ai) { bodySys.set(pid, id); colonies.push({ planetId: pid, name: pid, isOutpost: false, ownerEmpireId: 'emp_001' }); }
  }
  return { systems, colonies, stations: [], groundUnits: [], activeSystemId: 'sys_061',
    starName: (id) => names.get(id) ?? null, systemOfBody: (pid) => bodySys.get(pid) ?? null, bodiesOf: () => [], expanded: () => false };
};

// ═══ T1 ═══════════════════════════════════════════════════════════════════════
header('T1  ZF gy120 — widoczność i kolejność układów (D-UI-2, D-UI-3)');
{
  const w = zfWorld();
  ok(w.systems.length === 13 && w.systems.filter((s) => s.galaxyStar && s.galaxyStar.explored === false).length === 3,
    'T1-0 KONTROLA: fixture — 13 zarejestrowanych układów, 3 z `galaxyStar.explored = false` (sys_040, sys_020, sys_024)');
  ok(typeof L?.buildSystemTree === 'function', 'T1-1 moduł `SystemTreeLogic` eksportuje `buildSystemTree`');
  const t = tree(w);
  const order = ids(t).join(' ');
  console.log('     kolejność: ' + order);
  ok(order === 'sys_home sys_008 sys_059 sys_051 sys_024 sys_061 sys_003 sys_035 sys_067 sys_050 sys_038',
    'T1a SEDNO: dom → kolonie z POP wg odległości (3,9 · 5,4 · 12,1 · 14,6 · 16,4 ly) → reszta wg odległości (4,5 · 4,9 · 8,5 · 9,1 · 12,5 ly)');
  ok(t.systems.length === 11 && !ids(t).includes('sys_040') && !ids(t).includes('sys_020'),
    'T1b `sys_040` / `sys_020` (same kolonie AI, niezbadane; lustro `explored = true`) poza listą — lustro nie wpuszcza');
  const home = t.systems[0];
  ok(home?.systemId === 'sys_home' && home.group === L?.SYSTEM_GROUP?.HOME && home.distanceLY === 0 && home.isHome === true,
    'T1c dom pierwszy (grupa HOME, odległość 0 — rekord domu nie ma gwiazdy galaktyki)');
  ok(t.systems.find((s) => s.systemId === 'sys_061')?.isActive === true && t.systems.filter((s) => s.isActive).length === 1,
    'T1d bieżący układ oznaczony (`isActive`) — dokładnie jeden');
  ok(t.systems.find((s) => s.systemId === 'sys_008')?.name === 'Kochab', 'T1e nazwa układu = nazwa gwiazdy');
  const w2 = zfWorld(); w2.colonies = [];
  const t2 = tree(w2);
  ok(ids(t2)[0] === 'sys_home' && !ids(t2).includes('sys_024') && t2.systems.length === 10,
    'T1f KONTROLA: gracz bez żadnej kolonii — dom nadal pierwszy, `sys_024` (niezbadany) znika');
}

// ═══ T2 ═══════════════════════════════════════════════════════════════════════
header('T2  Finding 480 — układ skolonizowany z flagą `explored = false`');
{
  const t = tree(zfWorld());
  const d = t.systems.find((s) => s.systemId === 'sys_024');
  ok(!!d && d.group === L?.SYSTEM_GROUP?.COLONY, 'T2a SEDNO: `sys_024` (Diphda f + placówka Plt-1 gracza, `explored = false`) widoczny, grupa (2) — kolonie z POP');
  const rows = ZF.map((r) => (r[0] === 'sys_024' ? [r[0], r[1], r[2], r[3], [], r[5]] : r));
  const t2 = tree(zfWorld(rows));
  ok(!ids(t2).includes('sys_024') && t2.systems.length === 10,
    'T2b KONTROLA: ten sam układ bez własnej obecności (zostaje tylko placówka AI) — poza listą');
  const rows3 = ZF.map((r) => (r[0] === 'sys_024' ? [r[0], r[1], r[2], true, [], r[5]] : r));
  ok(ids(tree(zfWorld(rows3))).includes('sys_024'), 'T2c KONTROLA: z `galaxyStar.explored = true` — widoczny (kanon `isSystemExploredData`)');
}

// ═══ T3 ═══════════════════════════════════════════════════════════════════════
header('T3  grupa placówek, stacja bez kolonii, remisy (D-UI-2, §7.4)');
{
  const w = zfWorld();
  // syntetyczne: sama placówka gracza BLIŻEJ niż wszystkie układy z POP; sama stacja gracza (układ niezbadany);
  // dwa zbadane układy w tej samej odległości (nazwy w odwrotnej kolejności wstawienia)
  w.systems.push({ systemId: 'sys_901', explored: true, galaxyStar: { id: 'sys_901', name: 'Placowka', distanceLY: 2.0, explored: true } });
  w.colonies.push({ planetId: 'b_901', name: 'Placowka I', isOutpost: true, ownerEmpireId: null });
  w.systems.push({ systemId: 'sys_902', explored: false, galaxyStar: { id: 'sys_902', name: 'Stacyjny', distanceLY: 6.0, explored: false } });
  w.stations = [{ id: 'st_902', name: 'Stacja Z', bodyId: 'b_902', systemId: 'sys_902', ownerEmpireId: 'player' }];
  w.systems.push({ systemId: 'sys_904', explored: true, galaxyStar: { id: 'sys_904', name: 'Beta', distanceLY: 7.0, explored: true } });
  w.systems.push({ systemId: 'sys_903', explored: true, galaxyStar: { id: 'sys_903', name: 'Alfa', distanceLY: 7.0, explored: true } });
  const bs = new Map([['b_901', 'sys_901'], ['b_902', 'sys_902']]);
  const base = w.systemOfBody;
  w.systemOfBody = (pid) => bs.get(pid) ?? base(pid);
  const names = new Map([['sys_901', 'Placowka'], ['sys_902', 'Stacyjny'], ['sys_903', 'Alfa'], ['sys_904', 'Beta']]);
  const baseName = w.starName; w.starName = (id) => names.get(id) ?? baseName(id);
  const t = tree(w);
  const order = ids(t);
  console.log('     kolejność: ' + order.join(' '));
  const at = (id) => order.indexOf(id);
  ok(at('sys_901') > at('sys_061') && at('sys_901') < at('sys_003') && t.systems[at('sys_901')]?.group === L?.SYSTEM_GROUP?.OUTPOST,
    'T3a SEDNO: układ z samymi placówkami (2,0 ly) PO wszystkich układach z kolonią z POP (do 16,4 ly), PRZED resztą — grupa (2b)');
  ok(at('sys_902') > 0 && t.systems[at('sys_902')]?.group === L?.SYSTEM_GROUP?.OTHER && at('sys_902') > at('sys_035') && at('sys_902') < at('sys_067'),
    'T3b układ z samą stacją gracza (niezbadany) widoczny, grupa (3), między 4,9 a 8,5 ly (6,0)');
  ok(at('sys_903') + 1 === at('sys_904'), 'T3c remis odległości (7,0 ly) → nazwa: Alfa przed Betą (wstawione odwrotnie)');
  w.stations[0].ownerEmpireId = 'emp_001';
  const idsAI = ids(tree(w));
  ok(idsAI.length > 0 && !idsAI.includes('sys_902'), 'T3d ta sama stacja należąca do AI — układ niezbadany znika (wpuszcza tylko stacja GRACZA)');
}

// ═══ T4 ═══════════════════════════════════════════════════════════════════════
header('T4  glif obecności (§7.19)');
{
  const w = zfWorld();
  w.systems.push({ systemId: 'sys_901', explored: true, galaxyStar: { id: 'sys_901', name: 'Placowka', distanceLY: 2.0, explored: true } });
  w.colonies.push({ planetId: 'b_901', name: 'P', isOutpost: true, ownerEmpireId: null });
  const base = w.systemOfBody; w.systemOfBody = (pid) => (pid === 'b_901' ? 'sys_901' : base(pid));
  const t = tree(w);
  const g = (id) => t.systems.find((s) => s.systemId === id)?.glyph;
  const p = (id) => t.systems.find((s) => s.systemId === id)?.presence;
  ok(g('sys_home') === '🏛' && p('sys_home') === 'colony', 'T4a 🏛 kolonia z POP (dom: kolonie + placówki → kolonia wygrywa)');
  ok(g('sys_901') === '⛺' && p('sys_901') === 'outpost', 'T4b ⛺ sama placówka');
  ok(g('sys_067') === '⚑' && p('sys_067') === 'foreign', 'T4c ⚑ obca obecność (Nekkar d — kolonia AI)');
  ok(g('sys_003') === '' && p('sys_003') === null, 'T4d brak obecności — bez glifu');
  ok(g('sys_061') === '🏛' && g('sys_024') === '🏛', 'T4e własna kolonia wygrywa z obcą (Thuban: 1 własna + 7 AI; Diphda: + placówka AI)');
  ok(L?.PRESENCE_GLYPH?.colony === '🏛' && L?.PRESENCE_GLYPH?.outpost === '⛺' && L?.PRESENCE_GLYPH?.foreign === '⚑',
    'T4f glify w jednym miejscu (`PRESENCE_GLYPH`)');
}

// ═══ T5 ═══════════════════════════════════════════════════════════════════════
header('T5  ciała: orbity, księżyce, planetoidy, asteroidy, stacje (§7.6, decyzja 3)');
{
  const B = [
    { id: 'P1', type: 'planet', name: 'Kepler b', orbital: { a: 1.0 }, explored: true },
    { id: 'P2', type: 'planet', name: 'Kepler c', orbital: { a: 3.0 }, explored: true },
    { id: 'D1', type: 'planetoid', name: 'Plt-1', orbital: { a: 2.0 }, explored: true },
    { id: 'D2', type: 'planetoid', name: 'Plt-2', orbital: { a: 0.5 }, explored: false },
    { id: 'M1a', type: 'moon', name: 'Kepler b-I', parentPlanetId: 'P1', orbital: { a: 0.02 }, explored: true },
    { id: 'M1b', type: 'moon', name: 'Kepler b-II', parentPlanetId: 'P1', orbital: { a: 0.01 }, explored: false },
    { id: 'A1', type: 'asteroid', name: 'Ast-1', orbital: { a: 1.5 }, explored: true },
    { id: 'C1', type: 'comet', name: 'Kom-1', orbital: { a: 2.5 }, explored: true },
  ];
  const asked = [];
  const ctx = {
    systems: [{ systemId: 'sys_home', galaxyStar: null }], activeSystemId: 'sys_home',
    bodiesOf: (type, sys) => { asked.push(type); return B.filter((b) => b.type === type && sys === 'sys_home'); },
    stations: [
      { id: 'S1', name: 'Stacja P1', bodyId: 'P1', systemId: 'sys_home', ownerEmpireId: 'player' },
      { id: 'S2', name: 'Stacja M1a', bodyId: 'M1a', systemId: 'sys_home', ownerEmpireId: null },
      { id: 'S3', name: 'Stacja AI', bodyId: 'P2', systemId: 'sys_home', ownerEmpireId: 'emp_001' },
      { id: 'S4', name: 'Sierota', bodyId: 'A1', systemId: 'sys_home', ownerEmpireId: 'player' },
    ],
  };
  const t = tree(ctx);
  const rows = t.systems[0]?.bodies ?? [];
  const seq = rows.map((r) => `${r.id}:${r.depth}`).join(' ');
  console.log('     wiersze: ' + seq);
  ok(seq === 'D2:0 P1:0 S1:1 M1b:1 M1a:1 S2:2 D1:0 P2:0 S4:0',
    'T5a SEDNO: planetoidy na poziomie planet wg orbit (0,5 · 1,0 · 2,0 · 3,0 AU), księżyce wcięte pod planetą wg orbit, stacja tuż pod ciałem-matką');
  ok(rows.length > 0 && !rows.some((r) => r.id === 'A1' || r.id === 'C1'), 'T5b asteroida i kometa poza listą (lista wierszy niepusta)');
  ok(rows.length > 0 && !asked.includes('asteroid') && !asked.includes('comet') && asked.includes('planetoid'),
    `T5c logika nie pyta rejestru o asteroidy ani komety (pytania: ${[...new Set(asked)].join(', ')})`);
  ok(rows.some((r) => r.id === 'S1') && !rows.some((r) => r.id === 'S3'), 'T5d stacja AI poza listą (stacje GRACZA — decyzja 3)');
  ok(rows[rows.length - 1]?.id === 'S4' && rows[rows.length - 1]?.depth === 0 && rows[rows.length - 1]?.kind === 'station',
    'T5e stacja gracza bez ciała-matki na liście (orbita asteroidy) — na końcu układu');
  ok(rows.find((r) => r.id === 'D2')?.recognized === false && rows.find((r) => r.id === 'P1')?.recognized === true,
    'T5f `recognized` = `body.explored`');
  ok(L?.LISTED_BODY_TYPES?.join(',') === 'planet,moon,planetoid', 'T5g typy na liście w jednym miejscu (`LISTED_BODY_TYPES`)');
}

// ═══ T6 ═══════════════════════════════════════════════════════════════════════
header('T6  Polonia gy79 — układy bez rozpoznanych ciał (decyzja 5 (b))');
{
  // sys_044 Mira (8,3 ly): 6 planet (0 rozp.), 12 księżyców (0), 36 planetoid (2) · sys_008 Aludra (13,1 ly): 8 / 16 / 29, 0 rozp.
  const mk = (sys, np, nm, nd, ndRec) => {
    const out = [];
    for (let i = 0; i < np; i++) out.push({ id: `${sys}_p${i}`, type: 'planet', name: `P${i}`, orbital: { a: 1 + i }, explored: false, systemId: sys });
    for (let i = 0; i < nm; i++) out.push({ id: `${sys}_m${i}`, type: 'moon', name: `M${i}`, parentPlanetId: `${sys}_p${i % np}`, orbital: { a: 0.01 * (i + 1) }, explored: false, systemId: sys });
    for (let i = 0; i < nd; i++) out.push({ id: `${sys}_d${i}`, type: 'planetoid', name: `D${i}`, orbital: { a: 0.7 + i * 0.3 }, explored: i < ndRec, systemId: sys });
    return out;
  };
  const all = [...mk('sys_044', 6, 12, 36, 2), ...mk('sys_008', 8, 16, 29, 0)];
  const ctx = {
    systems: [
      { systemId: 'sys_home', galaxyStar: null },
      { systemId: 'sys_044', explored: true, galaxyStar: { id: 'sys_044', name: 'Mira', distanceLY: 8.3, explored: true } },
      { systemId: 'sys_008', explored: true, galaxyStar: { id: 'sys_008', name: 'Aludra', distanceLY: 13.1, explored: true } },
    ],
    activeSystemId: 'sys_home',
    bodiesOf: (type, sys) => all.filter((b) => b.type === type && b.systemId === sys),
  };
  const t = tree(ctx);
  const mira = t.systems.find((s) => s.systemId === 'sys_044');
  const aludra = t.systems.find((s) => s.systemId === 'sys_008');
  const cnt = (n, k) => (n?.bodies ?? []).filter((r) => r.kind === 'body' && (k ? r.type === k : true)).length;
  ok(cnt(mira, 'planet') === 6 && cnt(mira, 'moon') === 12 && cnt(mira, 'planetoid') === 36,
    `T6a SEDNO: Mira — pełna lista jak na mapie (6 planet, 12 księżyców, 36 planetoid; jest ${cnt(mira, 'planet')}/${cnt(mira, 'moon')}/${cnt(mira, 'planetoid')})`);
  ok(cnt(aludra) === 53, `T6b Aludra — 53 ciała (8 + 16 + 29; jest ${cnt(aludra)})`);
  ok((mira?.bodies ?? []).filter((r) => r.type !== 'planetoid').every((r) => r.recognized === false)
    && (mira?.bodies ?? []).filter((r) => r.recognized).length === 2,
    'T6c „○” przy każdym nierozpoznanym — w Mirze rozpoznane tylko 2 planetoidy');
  ok(t.systems.map((s) => s.systemId).join(' ') === 'sys_home sys_044 sys_008', 'T6d KONTROLA: kolejność wg odległości (8,3 → 13,1)');
}

// ═══ T7 ═══════════════════════════════════════════════════════════════════════
header('T7  znaczniki 🪖N / ⏳N, nazwy kolonii (decyzja 3)');
{
  const B = [
    { id: 'P1', type: 'planet', name: 'Kepler b', orbital: { a: 1.0 }, explored: true },
    { id: 'P2', type: 'planet', name: 'Kepler c', orbital: { a: 3.0 }, explored: true },
    { id: 'D1', type: 'planetoid', name: 'Plt-1', orbital: { a: 2.0 }, explored: true },
  ];
  const own = { planetId: 'P1', name: 'Nowa Kolonia', isOutpost: false, isHomePlanet: true, ownerEmpireId: null };
  const out = { planetId: 'D1', name: 'Plt-1', isOutpost: true, ownerEmpireId: 'player' };
  const ai = { planetId: 'P2', name: 'Kepler c [WRÓG]', isOutpost: false, ownerEmpireId: 'emp_001' };
  const queues = new Map([[own, 4], [out, 1], [ai, 9]]);
  const t = tree({
    systems: [{ systemId: 'sys_home', galaxyStar: null }], activeSystemId: 'sys_home',
    bodiesOf: (type) => B.filter((b) => b.type === type),
    colonies: [own, out, ai],
    groundUnits: [{ planetId: 'P2' }, { planetId: 'P2' }, { planetId: 'P2' }, { planetId: 'P1' }],
    queueCountOf: (c) => queues.get(c) ?? 0,
    systemOfBody: () => 'sys_home',
  });
  const r = (id) => (t.systems[0]?.bodies ?? []).find((x) => x.id === id);
  ok(r('P2')?.groundUnits === 3 && r('P1')?.groundUnits === 1 && r('D1')?.groundUnits === 0,
    'T7a SEDNO: 🪖N = jednostki gracza na ciele (3 na kolonii AI — desant; 1 na własnej; 0 bez jednostek)');
  ok(r('P1')?.queue === 4 && r('D1')?.queue === 1 && r('P2')?.queue === 0,
    'T7b ⏳N = kolejka kolonii GRACZA; kolonia AI bez ⏳ (choć ma kolejkę)');
  ok(r('P1')?.colony === 'colony' && r('P1')?.isHomeColony === true && r('D1')?.colony === 'outpost' && r('P2')?.colony === null && r('P2')?.foreign === true,
    'T7c rodzaj obecności na ciele: kolonia / placówka gracza, kolonia AI (`foreign`)');
  ok(r('P1')?.name === 'Nowa Kolonia', 'T7d własna kolonia → nazwa KOLONII');
  ok(r('P2')?.name === 'Kepler c' && ai.name !== 'Kepler c', 'T7e kolonia AI → nazwa CIAŁA, nie nadana przez wroga (fixture rozjeżdża obie nazwy)');
  // ciało z kolonią gracza przy fladze `explored = false` (niespójny zapis) — rozpoznane; ciało AI w tej samej sytuacji — „○”
  B.push({ id: 'D9', type: 'planetoid', name: 'Plt-9', orbital: { a: 4.0 }, explored: false },
         { id: 'D8', type: 'planetoid', name: 'Plt-8', orbital: { a: 5.0 }, explored: false });
  const t2 = tree({
    systems: [{ systemId: 'sys_home', galaxyStar: null }], activeSystemId: 'sys_home',
    bodiesOf: (type) => B.filter((b) => b.type === type),
    colonies: [{ planetId: 'D9', name: 'Plt-9', isOutpost: true, ownerEmpireId: null }, { planetId: 'D8', name: 'Plt-8', isOutpost: true, ownerEmpireId: 'emp_001' }],
    systemOfBody: () => 'sys_home',
  });
  const r2 = (id) => (t2.systems[0]?.bodies ?? []).find((x) => x.id === id);
  ok(r2('D9')?.recognized === true && r2('D8')?.recognized === false,
    'T7f kolonia gracza ⇒ ciało rozpoznane (bez „○”) mimo `explored = false`; kolonia AI na nierozpoznanym — „○” zostaje (KONTROLA)');
}

// ═══ T8 ═══════════════════════════════════════════════════════════════════════
header('T8  `colonyQueueCount` (⏳N)');
{
  const col = {
    buildingSystem: { serializeQueue: () => [1, 2], serializePendingQueue: () => [3] },
    shipQueues: [{ shipId: 'x' }], pendingShipOrders: [{ id: 'a' }, { id: 'b' }], pendingOutpostOrders: [],
    factorySystem: { getQueue: () => [{ commodityId: 'q', qty: 1 }], getAllocations: () => [1, 2, 3, 4, 5] },
  };
  const n = typeof L?.colonyQueueCount === 'function' ? L.colonyQueueCount(col) : null;
  ok(n === 7, `T8a SEDNO: 2 budowy + 1 oczekująca + 1 statek w budowie + 2 statki oczekujące + 1 zlecenie fabryki = 7 (jest ${n})`);
  ok(n === 7 && col.factorySystem.getAllocations().length === 5, 'T8b stała produkcja fabryki (5 alokacji) NIE liczy się do kolejki');
  ok(typeof L?.colonyQueueCount === 'function' && L.colonyQueueCount(null) === 0 && L.colonyQueueCount({}) === 0,
    'T8c brak kolonii / pusta kolonia → 0');
}

// ═══ T9 ═══════════════════════════════════════════════════════════════════════
header('T9  zwijanie (D-UI-4, §7.5)');
{
  const exp = L?.isSystemExpanded;
  ok(typeof exp === 'function', 'T9-0 `isSystemExpanded` istnieje');
  const f = (...a) => (typeof exp === 'function' ? exp(...a) : null);
  ok(f('sys_a', 'sys_a', null) === true && f('sys_b', 'sys_a', null) === false, 'T9a domyślnie rozwinięty TYLKO bieżący układ');
  const m = new Map([['sys_a', false], ['sys_b', true]]);
  ok(f('sys_a', 'sys_a', m) === false && f('sys_b', 'sys_a', m) === true, 'T9b jawny stan użytkownika wygrywa w obie strony (zwinięty bieżący, rozwinięty inny)');
  ok(f('sys_c', 'sys_c', m) === true, 'T9c układ bez jawnego stanu — reguła domyślna');
  const asked = [];
  const t = tree({ systems: [{ systemId: 'sys_home', galaxyStar: null }, { systemId: 'sys_x', galaxyStar: { id: 'sys_x', name: 'X', distanceLY: 1, explored: true } }],
    activeSystemId: 'sys_home', expanded: (id) => id === 'sys_home',
    bodiesOf: (type, sys) => { asked.push(sys); return []; } });
  ok(Array.isArray(t.systems[0]?.bodies) && t.systems[1]?.bodies === null && asked.length > 0 && !asked.includes('sys_x'),
    'T9d układ zwinięty — bez wierszy ciał (`null`) i bez odczytu rejestru ciał (koszt klatki: tylko rozwinięte)');
}

// ═══ T10 ══════════════════════════════════════════════════════════════════════
header('T10 Finding 489 — układ z własnym statkiem albo wojskami (ARKUSZ UI U3-0, Polonia gy79)');
{
  // Kształt zapisu Polonia gy79 (sonda read-only `kosmos-handover/ui-u3/probes/fixture_shape_u3.mjs`): Akhernar (`sys_036`)
  // i Wezen (`sys_059`) — `galaxyStar.explored = false` przy lustrze `true` (sygnatura sprzed 186), w każdym kolonia AI
  // (dom `emp_001` / `emp_002`) i stocznia orbitalna AI; w Akhernarze statek gracza („Galileo”, zwiad w locie w układzie),
  // w Wezenie — nic gracza.
  const POL = [
    // [id, nazwa, distanceLY, galaxyStar.explored]
    ['sys_home', 'TOI-4493', 0, true], ['sys_036', 'Akhernar', 6.0, false], ['sys_059', 'Wezen', 21.8, false],
    ['sys_014', 'Alioth', 4.6, true], ['sys_031', 'Antares', 4.8, true], ['sys_044', 'Mira', 8.3, true],
    ['sys_008', 'Aludra', 13.1, true], ['sys_032', 'Naos', 3.7, true], ['sys_001', 'Fomalhaut', 4.7, true],
  ];
  const bodySys = new Map([['entity_3', 'sys_home'], ['entity_11', 'sys_home'], ['entity_79', 'sys_home'], ['entity_80', 'sys_home'],
    ['entity_2', 'sys_home'], ['entity_283', 'sys_014'], ['entity_96', 'sys_036'], ['entity_191', 'sys_059']]);
  const own = (pid, outpost = false) => ({ planetId: pid, name: pid, isOutpost: outpost, ownerEmpireId: null });
  const ves = (id, sys) => ({ id, systemId: sys, isWreck: false });
  const VESSELS = [ves('v_3', 'sys_home'), ves('v_4', 'sys_home'), ves('v_13', 'sys_home'), ves('v_18', 'sys_home'),
    ves('v_14', 'sys_044'), ves('v_16', 'sys_036'), ves('v_17', 'sys_032')];
  const world = (o = {}) => ({
    systems: POL.map(([id, name, dist, expl]) => ({ systemId: id, explored: true, galaxyStar: id === 'sys_home' ? null : { id, name, distanceLY: dist, explored: expl } })),
    colonies: [own('entity_3'), own('entity_11'), own('entity_79', true), own('entity_80', true), own('entity_2'), own('entity_283'),
      { planetId: 'entity_96', name: 'Akhernar h', isOutpost: false, ownerEmpireId: 'emp_001' },
      { planetId: 'entity_191', name: 'Wezen g', isOutpost: false, ownerEmpireId: 'emp_002' }],
    stations: [{ id: 'st_mstow', name: 'Stacja Mstow', bodyId: 'entity_3', systemId: 'sys_home', ownerEmpireId: 'player' },
      { id: 'st_akh', name: 'Stocznia orbitalna Akhernar h', bodyId: 'entity_96', systemId: 'sys_036', ownerEmpireId: 'emp_001' },
      { id: 'st_wez', name: 'Stocznia orbitalna Wezen g', bodyId: 'entity_191', systemId: 'sys_059', ownerEmpireId: 'emp_002' }],
    groundUnits: o.groundUnits ?? [],
    vessels: o.vessels ?? VESSELS,
    activeSystemId: 'sys_home',
    starName: (id) => POL.find((r) => r[0] === id)?.[1] ?? null,
    systemOfBody: (pid) => bodySys.get(pid) ?? null,
    bodiesOf: () => [], expanded: () => false,
  });
  const w0 = world();
  ok(w0.systems.length === 9 && w0.systems.filter((s) => s.galaxyStar?.explored === false).map((s) => s.systemId).join(' ') === 'sys_036 sys_059'
    && w0.systems.every((s) => s.explored === true),
    'T10-0 KONTROLA: fixture — 9 układów; Akhernar i Wezen z `galaxyStar.explored = false` przy lustrze `true`');
  const t = tree(w0);
  const order = ids(t).join(' ');
  console.log('     kolejność: ' + order);
  ok(order === 'sys_home sys_014 sys_032 sys_001 sys_031 sys_036 sys_044 sys_008',
    'T10a SEDNO: Akhernar (Twój statek „Galileo”) na liście — grupa (3) wg odległości: Naos 3,7 · Fomalhaut 4,7 · Antares 4,8 · Akhernar 6,0 · Mira 8,3 · Aludra 13,1');
  const akh = t.systems.find((s) => s.systemId === 'sys_036');
  ok(akh?.group === L?.SYSTEM_GROUP?.OTHER && akh?.glyph === '⚑' && akh?.presence === 'foreign',
    'T10b Akhernar: grupa (3) i glif ⚑ (kolonia AI) — statek odsłania układ, nie zmienia jego grupy ani glifu');
  ok(order.length > 0 && !ids(t).includes('sys_059'), 'T10c KONTROLA: Wezen (bez statku i wojsk gracza, niezbadany) — dalej ukryty (lista niepusta)');
  const tNo = tree(world({ vessels: [] }));
  ok(ids(tNo).length === 7 && !ids(tNo).includes('sys_036'),
    'T10d KONTROLA: ten sam zapis bez statków gracza — Akhernar ukryty (odsłania go statek, nie lustro `explored`)');
  const tTr = tree(world({ vessels: [{ id: 'vT', systemId: null }, { id: 'vW', systemId: 'sys_059', isWreck: true }, { id: 'vU' }] }));
  ok(ids(tTr).length === 7 && !ids(tTr).includes('sys_036') && !ids(tTr).includes('sys_059') && ids(tTr)[0] === 'sys_home',
    'T10e statek w tranzycie warp (`systemId: null`) i wrak (Wezen) nie odsłaniają układu; statek bez pola `systemId` = dom (kanon)');
  const tGu = tree(world({ vessels: [], groundUnits: [{ planetId: 'entity_191' }] }));
  ok(ids(tGu).includes('sys_059') && !ids(tGu).includes('sys_036'),
    'T10f SEDNO: moje jednostki naziemne na ciele Wezena (desant na kolonii AI) — Wezen na liście, bez statku i bez zbadania');
  ok(tGu.systems.find((s) => s.systemId === 'sys_059')?.group === L?.SYSTEM_GROUP?.OTHER, 'T10g … grupa (3) — wojska nie są kolonią');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
