// src/testing/smoke/cvz_banner_reel_smoke.mjs
// ARC COMBAT VISUALS, krok CV-Z — Findingi 721 i 722 (COMBAT_VISUALS_PLAN.md §5).
//   721 — baner wyniku (pojedynczy i scalony rajd) podaje utracone OKRĘTY na stronę w liczbach, nie sumę jednostek z dwóch ścieżek
//         (DSCS — statki, BattleSystem / EAH — HP; na żywo „Straty: 666 / 494”).
//     L1 `battleShipLosses`: deep-space z `lossesA/B`, jawne `shipLosses`, wojna abstrakcyjna — null
//     L2 `mergeRaidBattles`: podejście DSCS + bitwa o kolonię EAH — liczby okrętów zsumowane po stronie gracza, bez HP
//     L3 rajd z bitwą bez liczby okrętów — `shipLosses: null` (baner bez strat)
//     L4 `EnemyAttackHandler._shipsLost`: reguły skutków (wygrana napastnika / obrony, remis, pat) na liście, którą gra rozbija
//     L5 baner na atrapie DOM: „Utracone okręty: A / B”, bez „Straty:”; bez liczby — bez segmentu strat
//     L6 piny źródłowe: EAH stempluje `fx.shipsLost`, GameScene przenosi je do banera i linii Dziennika
//   722 — `cvRecord(0)` tuż po stopie: nazwa pliku i „zapisywanie…”; stan końcowy (plik, sekundy, bajty, błąd) później.
//     R1 atrapa `MediaRecorder`: stop → `state: 'saving'`, `file` i `seconds` od razu; onstop → `state: 'saved'`, `lastBytes`
//     R2 start w trakcie zapisu odmówiony (`reason: 'saving'`) — poprzednie nagranie nie ginie
//     R3 `KOSMOS.debug.cvRecord`: drugie cvRecord(0) przy zatrzymanej nagrywarce — stan końcowy, bez nowego nagrania
import '../headless/env.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } }
async function tryImport(p) { try { return await import(p); } catch (e) { console.log('  (import nieudany', p, String(e).slice(0, 120), ')'); return {}; } }
function guard(tag, fn) { try { return fn(); } catch (e) { fail++; console.log(`  ✗ ${tag} rzucił: ${String(e?.stack ?? e).slice(0, 300)}`); } }
async function guardA(tag, fn) { try { return await fn(); } catch (e) { fail++; console.log(`  ✗ ${tag} rzucił: ${String(e?.stack ?? e).slice(0, 300)}`); } }
const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

const BSL = await tryImport('../../ui/BattleShipLosses.js');
const RAL = await tryImport('../../ui/RaidAnnounceLogic.js');
const EAHm = await tryImport('../../systems/EnemyAttackHandler.js');
const BIM = await tryImport('../../ui/BattleIntroModal.js');
const RR = await tryImport('../../renderer/ReelRecorder.js');
const ST = await tryImport('../../debug/CvBattleStager.js');

// ═══ L1 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('L1 — battleShipLosses');
guard('L1', () => {
  const f = BSL.battleShipLosses;
  assert(typeof f === 'function', 'L1-0 moduł eksportuje `battleShipLosses`');
  const d = f?.({ source: 'dscs', result: { lossesA: 3, lossesB: 1 } });
  assert(d?.A === 3 && d?.B === 1, `L1a deep-space: liczby z \`lossesA/B\` (${JSON.stringify(d)})`);
  const o = f?.({ source: 'orbital', shipLosses: { A: 4, B: 0 }, result: { lossesA: 666, lossesB: 494 } });
  assert(o?.A === 4 && o?.B === 0, `L1b bitwa orbitalna: jawne \`shipLosses\`, nie HP (${JSON.stringify(o)})`);
  assert(f?.({ result: { lossesA: 120, lossesB: 40 } }) === null, 'L1c wojna z flotą abstrakcyjną (bez źródła i liczb) — null');
  assert(f?.({ source: 'dscs', shipLosses: null, result: { lossesA: 2, lossesB: 2 } }) === null, 'L1d jawne `shipLosses: null` (rajd bez liczb) — null, bez zgadywania z `lossesA/B`');
  assert(f?.({ source: 'orbital', result: { lossesA: 666, lossesB: 494 } }) === null, 'L1e KONTROLA: bitwa orbitalna bez `shipLosses` — null (HP nie udają okrętów)');
});

// ═══ L2 / L3 ══════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('L2 — mergeRaidBattles: okręty, nie suma jednostek');
guard('L2', () => {
  const dsc = { battleId: 'd1', playerSide: 'A', source: 'dscs', result: { id: 'd1', winner: 'B', lossesA: 2, lossesB: 1, turns: 15, location: { point: { x: 1, y: 1 } } } };
  const col = { battleId: 'e1', playerSide: 'B', source: 'orbital', warId: 'w1', shipLosses: { A: 3, B: 0 },
    result: { id: 'e1', winner: 'B', lossesA: 666, lossesB: 494, turns: 9, location: { planetId: 'p', point: null } } };
  const m = RAL.mergeRaidBattles?.([dsc, col]);
  // orientacja ostatniej bitwy (gracz = B): gracz stracił 2 (podejście) + 0 (kolonia), wróg 1 + 3
  assert(m?.shipLosses?.A === 4 && m?.shipLosses?.B === 2, `L2a utracone okręty: wróg 1 + 3 = ${m?.shipLosses?.A}, gracz 2 + 0 = ${m?.shipLosses?.B}`);
  assert(m?.result?.lossesA === 4 && m?.result?.lossesB === 2, `L2b linia Dziennika rajdu w okrętach (${m?.result?.lossesA} / ${m?.result?.lossesB}), nie 667 / 496`);
  assert(BSL.battleShipLosses?.(m)?.A === 4, 'L2c baner czyta scalone liczby przez `battleShipLosses`');
  assert(col.result.lossesA === 666 && dsc.result.lossesB === 1 && !('shipLosses' in dsc), 'L2d rekordy bitew nietknięte');
});
console.log('L3 — rajd z bitwą bez liczby okrętów');
guard('L3', () => {
  const dsc = { battleId: 'd1', playerSide: 'A', source: 'dscs', result: { id: 'd1', winner: 'B', lossesA: 2, lossesB: 1, turns: 15 } };
  const war = { battleId: 'w9', playerSide: 'B', warId: 'w1', result: { id: 'w9', winner: 'A', lossesA: 120, lossesB: 40, turns: 9 } };
  const m = RAL.mergeRaidBattles?.([dsc, war]);
  assert(m && m.shipLosses === null && BSL.battleShipLosses?.(m) === null, 'L3a jedna bitwa bez liczby okrętów — `shipLosses: null`, baner bez strat');
  assert(RAL.mergeRaidBattles?.([dsc]) === dsc, 'L3b jedna bitwa — ten sam obiekt (pojedynczy baner bez zmian)');
});

// ═══ L4 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('L4 — EnemyAttackHandler._shipsLost');
guard('L4', () => {
  const P = EAHm.EnemyAttackHandler?.prototype;
  assert(typeof P?._shipsLost === 'function' && typeof P?._playerVesselsToWreck === 'function', 'L4-0 `_shipsLost` i `_playerVesselsToWreck` istnieją');
  const vessels = new Map([
    ['p1', { id: 'p1', systemId: 's1' }],
    ['p2', { id: 'p2', systemId: 's1', serviceState: 'active' }],
    ['r1', { id: 'r1', systemId: 's1', serviceState: 'stored' }],           // rezerwa — nie ginie
    ['w1', { id: 'w1', systemId: 's1', isWreck: true }],                    // wrak — już stracony
    ['o1', { id: 'o1', systemId: 's2' }],                                   // inny układ
    ['e1', { id: 'e1', systemId: 's1', ownerEmpireId: 'emp_1' }],           // napastnik
  ]);
  const prevK = globalThis.window.KOSMOS;
  globalThis.window.KOSMOS = { ...(prevK ?? {}), vesselManager: { _vessels: vessels } };
  try {
    const h = { _playerVesselsToWreck: P._playerVesselsToWreck };
    const call = (r) => P._shipsLost.call(h, r, 3, 's1');
    assert(P._playerVesselsToWreck.call(h, 's1').map((v) => v.id).join(',') === 'p1,p2', 'L4a lista rozbijanych: okręty gracza w służbie w układzie (bez rezerwy, wraków, obcego układu, wroga)');
    const a = call({ winner: 'A' }), b = call({ winner: 'B' }), d = call({ winner: 'draw' }), s = call({ winner: 'draw', endReason: 'no_damage_possible' });
    assert(a.A === 0 && a.B === 2, `L4b wygrana napastnika: gracz traci 2 (${JSON.stringify(a)})`);
    assert(b.A === 3 && b.B === 0, `L4c wygrana obrony: napastnik traci 3 (${JSON.stringify(b)})`);
    assert(d.A === 3 && d.B === 2, `L4d remis (wzajemne zniszczenie): obie strony (${JSON.stringify(d)})`);
    assert(s.A === 0 && s.B === 0, `L4e pat (strażnik M1): nikt (${JSON.stringify(s)})`);
  } finally { globalThis.window.KOSMOS = prevK; }
});

// ═══ L5 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('L5 — baner na atrapie DOM');
function bannerHtml(data) {
  const appended = [];
  const orig = document.body.append?.bind(document.body);
  document.body.append = (...els) => { appended.push(...els); return orig?.(...els); };
  try { BIM.showBattleOutcome(data); } finally { document.body.append = orig; }
  const html = appended.map((e) => `${e?.innerHTML ?? ''}${e?.textContent ?? ''}`).join(' ');
  // zamknij baner (klik OK), żeby następny mógł się narysować
  for (const e of appended) for (const b of (e?.children ?? e?.childNodes ?? [])) if (b?.textContent === 'OK') b.onclick?.();
  return html;
}
guard('L5', () => {
  const h1 = bannerHtml({ source: 'orbital', shipLosses: { A: 3, B: 1 }, result: { winner: 'B', turns: 9, lossesA: 666, lossesB: 494 }, playerSide: 'B', aggressorName: 'Liga', defenderName: 'Gracz' });
  assert(/3 \/ 1/.test(h1) && !/666|494/.test(h1) && !/Straty:/.test(h1), 'L5a pojedynczy baner bitwy orbitalnej: „3 / 1” okrętów, bez HP i bez „Straty:”');
  assert(/battle\.shipsLost|okręty|Ships lost/.test(h1), 'L5b etykieta strat przez `t(battle.shipsLost)`');
  const h2 = bannerHtml({ result: { winner: 'A', turns: 4, lossesA: 120, lossesB: 40 }, playerSide: 'B', aggressorName: 'Liga', defenderName: 'Gracz' });
  assert(!/120|40 /.test(h2) && !/okręty|Ships lost|Straty/.test(h2) && /Tur: 4/.test(h2), 'L5c bitwa bez liczby okrętów: baner bez segmentu strat (tury zostają)');
  const h3 = bannerHtml({ source: 'dscs', result: { winner: 'B', turns: 12, lossesA: 2, lossesB: 0 }, playerSide: 'B', aggressorName: 'Liga', defenderName: 'Gracz' });
  assert(/2 \/ 0/.test(h3), 'L5d KONTROLA: deep-space — liczby okrętów z `lossesA/B` (jak dotąd)');
});

// ═══ L6 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('L6 — piny źródłowe');
guard('L6', () => {
  const eah = strip(read('src/systems/EnemyAttackHandler.js'));
  const gs = strip(read('src/scenes/GameScene.js'));
  assert(/fx\.shipsLost\s*=\s*this\._shipsLost\(result,\s*allEnemies\.length,\s*systemId\)/.test(eah), 'L6a EAH stempluje `fx.shipsLost` przed zdarzeniem');
  assert(/_wreckPlayerVesselsInSystem\(systemId, year\)\s*\{\s*for \(const v of this\._playerVesselsToWreck\(systemId\)\)/.test(eah), 'L6b skutki rozbijają TĘ SAMĄ listę, którą liczy baner');
  assert(/battleData\.shipLosses\s*=\s*\{\s*A:\s*fx\.shipsLost\.A,\s*B:\s*fx\.shipsLost\.B\s*\}/.test(gs), 'L6c GameScene: `fx.shipsLost` → `battleData.shipLosses`');
  assert(/_battleLogEntry\(\{ warId, result, shipLosses = null \}\)/.test(gs) && /shipLosses\?\.A \?\? result\.lossesA/.test(gs), 'L6d linia bitwy w Dzienniku czyta liczby okrętów, gdy są');
  assert(!/Straty:\s*\$\{res\.lossesA/.test(read('src/ui/BattleIntroModal.js')), 'L6e baner bez dawnego „Straty: lossesA / lossesB”');
});

// ═══ R1–R3 (Finding 722) ═══════════════════════════════════════════════════════════════════════════════════════════
class FakeMR {
  constructor(stream, opts) { this.state = 'inactive'; this.mimeType = opts?.mimeType; FakeMR.last = this; }
  static isTypeSupported() { return true; }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; FakeMR.pending = () => { this.ondataavailable?.({ data: { size: 2048 } }); this.onstop?.(); }; }
}
function fakeCanvas() {
  return { width: 1280, height: 720, clientWidth: 1280, clientHeight: 720,
    getContext: () => ({ fillRect() {}, drawImage() {} }),
    captureStream: () => ({ getVideoTracks: () => [{ requestFrame() {}, stop() {} }], getTracks: () => [{ stop() {} }] }) };
}
const prevMR = globalThis.MediaRecorder, prevBlob = globalThis.Blob, prevURL = globalThis.URL?.createObjectURL;
globalThis.MediaRecorder = FakeMR;
globalThis.Blob = class { constructor(parts) { this.size = parts.reduce((n, p) => n + (p?.size ?? 0), 0); } };
if (globalThis.URL) { globalThis.URL.createObjectURL = () => 'blob:x'; globalThis.URL.revokeObjectURL = () => {}; }
const origCreate = document.createElement.bind(document);
document.createElement = (tag) => {
  if (tag === 'canvas') return fakeCanvas();
  const el = origCreate(tag);
  if (el && typeof el.remove !== 'function') el.remove = () => {};   // atrapa DOM bez `remove` (pobranie pliku w `_download`)
  return el;
};

console.log('R1 — stop: „zapisywanie…”, potem stan końcowy');
await guardA('R1', async () => {
  const rr = new RR.ReelRecorder({ renderer: { domElement: fakeCanvas() } });
  const st = rr.start();
  assert(st?.ok === true && rr.info().state === 'recording', `R1-0 świadek: nagrywanie ruszyło (${JSON.stringify(st)})`);
  const p = rr.stop();
  const mid = rr.info();
  assert(mid.state === 'saving' && mid.note === 'zapisywanie…' && typeof mid.file === 'string' && mid.file.length > 0 && Number.isFinite(mid.seconds),
    `R1a tuż po stopie: \`saving\`, plik ${mid.file}, ${mid.seconds} s, „zapisywanie…”`);
  assert(mid.lastBytes === null, 'R1b bajtów jeszcze nie ma (zapis w drodze)');
  FakeMR.pending();
  const r = await p;
  const fin = rr.info();
  assert(r?.ok === true && fin.state === 'saved' && fin.file === mid.file && fin.lastBytes === 2048 && Number.isFinite(fin.seconds) && fin.lastError === null,
    `R1c po zapisie: \`saved\`, ten sam plik, ${fin.lastBytes} B, ${fin.seconds} s, bez błędu (${JSON.stringify(fin)})`);
  assert(RR.reelSecondsText?.(12.34) === '12.3' && RR.reelMegabytesText?.(3 * 1024 * 1024) === '3.0' && RR.reelMegabytesText?.(null) === '—', 'R1d teksty wskaźnika „Zapisano” (sekundy, MB)');
});
console.log('R2 — start w trakcie zapisu');
await guardA('R2', async () => {
  const rr = new RR.ReelRecorder({ renderer: { domElement: fakeCanvas() } });
  rr.start();
  const p = rr.stop();
  const again = rr.start();
  assert(again?.ok === false && again.reason === 'saving', `R2a start w trakcie zapisu odmówiony (${JSON.stringify(again)})`);
  FakeMR.pending(); await p;
  assert(rr.start()?.ok === true, 'R2b KONTROLA: po zapisie start działa');
  rr.stop(); FakeMR.pending();
});
console.log('R3 — KOSMOS.debug.cvRecord');
await guardA('R3', async () => {
  const rr = new RR.ReelRecorder({ renderer: { domElement: fakeCanvas() } });
  const d = { flag: true, reel: rr, setRecording(on) { return on ? Promise.resolve(rr.start()) : rr.stop(); } };
  const prevK = globalThis.window.KOSMOS;
  try {
    const api = ST.cvBattleDebugHelpers?.({ getRenderer: () => ({ cvDirector: d }) }) ?? null;
    const fn = api?.cvRecord;
    if (typeof fn !== 'function') { assert(false, 'R3-0 nie znaleziono `cvRecord` w API stagera'); return; }
    const a = fn.call(api, 1);
    assert(a?.state === 'recording', `R3a cvRecord(1) — nagrywanie (${a?.state})`);
    const b = fn.call(api, 0);
    assert(b?.state === 'saving' && b.note === 'zapisywanie…' && !!b.file, `R3b cvRecord(0) — plik ${b?.file} i „zapisywanie…”`);
    FakeMR.pending();   // onstop synchronicznie — stan końcowy od razu
    const c = fn.call(api, 0);
    assert(c?.state === 'saved' && c.file === b.file && c.lastBytes === 2048 && Number.isFinite(c.seconds) && rr.recording === false,
      `R3c drugie cvRecord(0): stan końcowy (${c?.state}, ${c?.lastBytes} B, ${c?.seconds} s), bez nowego nagrania`);
  } finally { globalThis.window.KOSMOS = prevK; }
});

globalThis.MediaRecorder = prevMR; globalThis.Blob = prevBlob;
if (globalThis.URL && prevURL) globalThis.URL.createObjectURL = prevURL;
document.createElement = origCreate;

console.log(`\n═══ cvz_banner_reel_smoke: ${pass} PASS / ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
