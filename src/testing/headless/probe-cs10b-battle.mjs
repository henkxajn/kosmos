// probe-cs10b-battle — ARC COLONY SPHERE CS-10b (plan §3.20, D-CS-31 z poprawką właściciela): karta bitwy naziemnej NA ŻYWO
// i Finding 797 w PRAWDZIWEJ grze (headless Chrome). Pokój → brak znacznika bitwy, wojna → znacznik; prawdziwa bitwa 3 na 3
// (csGroundBattle) → okno otwiera się samo na 1. rundzie, HP i dziennik rosną z rundami, wynik zostaje po końcu; konsola
// zamknięta → meldunek w dzwonku → klik → konsola kolonii z oknem bitwy. Zapis: docs/design/prototypes/cs10b-battle.png.
//   node src/testing/headless/probe-cs10b-battle.mjs [--out <katalog ujęć>]

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT_DIR = path.join(REPO, 'docs/design/prototypes');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const WORK_TILE_PX = 100;   // widok roboczy: najmniejsze zbliżenie, przy którym pole ma ≥ tyle px (modele GLB)
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const THEMES = ['ss_amber_noir', 'ss_cold_blue', 'ss_galactic_violet', 'ss_neon_cyber', 'ss_biopunk_green'];
const SHOT_DIR = arg('--out') ? path.resolve(arg('--out')) : fs.mkdtempSync(path.join(os.tmpdir(), 'kosmos-cs10b-battle-shots-'));
fs.mkdirSync(SHOT_DIR, { recursive: true });

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
    if (rel.startsWith('__shot/')) return fs.readFile(path.join(SHOT_DIR, path.basename(rel)), (err, buf) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }); res.end(buf);
    });
    if (rel === '__sheet') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<!doctype html><html><body style="margin:0;background:#05070b"><canvas id="c"></canvas></body></html>'); }
    const file = path.join(REPO, rel || 'index.html');
    if (!file.startsWith(REPO)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(buf);
    });
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

async function launch() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kosmos-cs10b-battle-'));
  const port = 9300 + Math.floor(Math.random() * 600);
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--mute-audio', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11',
    '--enable-unsafe-swiftshader', '--window-size=1600,1041', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 150; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const p = l.find(t => t.type === 'page'); if (p) return { proc, profile, wsUrl: p.webSocketDebuggerUrl }; } catch { /* jeszcze nie */ }
    await sleep(100);
  }
  proc.kill(); throw new Error('Chrome nie wstał');
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const pending = new Map(); const listeners = [];
  ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result); } else for (const f of listeners) f(msg); };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
  const waitFor = async (expr, label, ms = 240000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evaluate(expr)) return; } catch { /* ładuje się */ } await sleep(250); } throw new Error('timeout: ' + label); };
  return new Promise((res, rej) => { ws.onopen = () => res({ send, evaluate, waitFor, on: (f) => listeners.push(f), close: () => ws.close() }); ws.onerror = rej; });
}

const checks = [];
const check = (ok, name, detail = '') => { checks.push({ ok: !!ok, name }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const numbers = {};

const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const chrome = await launch();
let exitCode = 0;
try {
  const page = await cdp(chrome.wsUrl);
  const exc = [];
  page.on((m) => { if (m.method === 'Runtime.exceptionThrown') exc.push((m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? '').slice(0, 500)); });
  await page.send('Runtime.enable'); await page.send('Page.enable');
  const shots = [];
  const shot = async (name, label, clip = null) => {
    await sleep(500);
    const d = (await page.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { scale: 1, ...clip } } : {}) })).data;
    fs.writeFileSync(path.join(SHOT_DIR, `${name}.png`), Buffer.from(d, 'base64'));
    shots.push({ name, label, w: clip?.width ?? 1600, h: clip?.height ?? 1041 });
  };
  const mouse = async (type, x, y, extra = {}) => page.send('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'none', buttons: 0, ...extra });
  const E = (expr) => page.evaluate(`(() => { ${expr} })()`);

  // ── nowa gra z flagami (jak probe-cs8c) ──
  await page.send('Page.navigate', { url: `${base}/index.html` });
  await page.waitFor(`!!document.querySelector('[data-action="new"]')`, 'tytuł');
  for (const f of ['colonySphere', 'sharedSurface', 'seededSystems', 'realisticClimate', 'scaledOrbits']) await page.evaluate(`KOSMOS.gameConfig.FEATURES.${f} = true`);
  await page.evaluate(`document.querySelector('[data-action="new"]').click(), true`);
  await page.waitFor(`!!document.querySelector('.fs-leader-card')`, 'lider');
  await page.evaluate(`document.querySelector('.fs-leader-card').click(), true`);
  await page.waitFor(`!!document.querySelector('#fs-start')`, 'start');
  await page.evaluate(`document.querySelector('#fs-start').click(), true`);
  await page.waitFor(`!!window.KOSMOS?.surfaceCache && !!window.KOSMOS?.gameScene`, 'GameScene');
  await page.waitFor(`window.KOSMOS?.gameScene?._introLockActive === false`, 'koniec intro', 240000);
  await sleep(2500);
  for (let i = 0, clean = 0; i < 40 && clean < 4; i++) {
    const what = await page.evaluate(`(() => {
      const key = (k) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k, bubbles: true, cancelable: true }));
      if (document.querySelector('.tw-block')) { key('Escape'); return 'narracja'; }
      const inp = [...document.querySelectorAll('body > div input')].find(e => e.offsetParent !== null);
      if (inp) { key('Enter'); return 'pole'; }
      return null;
    })()`);
    clean = what ? 0 : clean + 1;
    await sleep(600);
  }
  await page.waitFor(`!!KOSMOS.colonyManager?.getColony?.(KOSMOS.homePlanet?.id)`, 'kolonia macierzysta', 60000);
  await E(`const ts = KOSMOS.timeSystem; if (ts && !ts.isPaused) (ts.pause?.() ?? (ts.isPaused = true)); return true;`);
  await page.waitFor(`typeof window.csUnits === 'function'`, 'pomocniki CS-10', 20000);

  // ── kolonia z budynkami (CS-9) + jednostki pomocnikiem właściciela ──
  await E(`KOSMOS.overlayManager.openPanel('colony'); KOSMOS.uiManager._dirty = true; return true;`);
  await page.waitFor(`!!KOSMOS.overlayManager.overlays.colony._sphere?.renderer?.topo`, 'kula', 60000);
  const city = await E(`return csCity();`);
  await page.waitFor(`KOSMOS.overlayManager.overlays.colony._sphere.renderer.info().mapPhase === 'hero'`, 'mapa bohatera', 90000).catch(() => {});
  const ov = `KOSMOS.overlayManager.overlays.colony`;
  const hero = await E(`const o = ${ov}; const k = Math.min(innerWidth / 1280, innerHeight / 720); const z = o.consoleZones?.hero ?? o._getMapBounds?.(); return z ? { x: z.x * k, y: z.y * k, width: z.w * k, height: z.h * k } : null;`);
  check(!!hero && hero.width > 300, 'strefa bohatera konsoli', JSON.stringify(hero));
  const cx = hero.x + hero.width / 2, cy = hero.y + hero.height / 2;
  const redraw = `KOSMOS.uiManager._dirty = true;`;
  const hold = async () => { await E(`${ov}._selectedTile = null; ${redraw} return true;`); await mouse('mouseMoved', cx, cy); await sleep(120); await mouse('mouseMoved', 5, 5); await sleep(120); };
  const zoom = async (steps) => { for (let i = 0; i < Math.abs(steps); i++) { await mouse('mouseWheel', cx, cy, { deltaX: 0, deltaY: steps > 0 ? -240 : 240 }); await sleep(60); } await sleep(900); };
  const info = async () => { await E(`${redraw} return true;`); await sleep(250); return E(`return csUnitInfo();`); };
  const settle = async (label) => {
    for (let i = 0; i < 120; i++) { const u = await info(); if (!Object.values(u.layer.states).includes('loading')) return u; await sleep(250); }
    throw new Error('modele nie doładowały się: ' + label);
  };

  // ── Finding 797: wspólne pole w pokoju — bez znacznika bitwy; wojna — znacznik ──
  await E(`csUnitLod(); csUnitLod(); return true;`);   // → znaczniki (bez czekania na GLB; znacznik bitwy rysuje HUD w obu LOD)
  const peaceRel = await E(`const d = KOSMOS.diplomacySystem; const e = (KOSMOS.empireRegistry?.listIds?.() ?? []).find(i => i !== 'player'); return { empire: e, status: d?.relations?.getStatus?.('player', e) ?? null };`);
  const pb = await E(`${ov}._clearSelection(); ${ov}._cBattle = null; return csUnitBattle();`);
  await E(`${ov}._sphere.renderer.turnTo(${pb?.tile ?? 0}); return true;`); await sleep(1600); await hold();
  const peace = await info();
  await shot('peace', `Finding 797 — own and foreign units on one tile in PEACE (${peaceRel.status}): side by side, no crossed blades, no battle`, hero);
  await E(`KOSMOS.diplomacySystem.declareWar(${JSON.stringify(pb?.empire)}, 'probe_cs10b'); ${redraw} return true;`);
  await hold();
  const war = await info();
  await shot('war', 'The same tile after the war declaration: the combat system fights there → crossed blades', hero);
  numbers.f797 = { peaceStatus: peaceRel.status, peaceBattles: peace.battles, warBattles: war.battles };
  check(peaceRel.status !== 'war' && peace.battles === 0 && war.battles === 1, 'Finding 797: pokój — 0 znaczników bitwy, wojna — 1', JSON.stringify(numbers.f797));
  // posprzątaj pokazową bitwę (csUnitsClear zdejmuje jednostki pomocników CS-10)
  await E(`csUnitsClear(); ${ov}._cBattle = null; KOSMOS.combatSystem.tick(1); ${redraw} return true;`);

  // ── karta bitwy: prawdziwa bitwa, okno samo na 1. rundzie ──
  const gb = await E(`return csGroundBattle();`);
  check(!!gb && gb.own === 3 && gb.enemy === 3 && gb.battle === true, 'csGroundBattle: 3 na 3 na wolnym polu, bitwa wg systemu walki', JSON.stringify(gb));
  await E(`${ov}._sphere.renderer.turnTo(${gb?.tile ?? 0}); return true;`); await sleep(1600); await hold();
  const before = await E(`return { win: ${ov}._cBattle, rec: !!KOSMOS.colonyBattleFeed.get(${ov}._getColony().planetId, ${gb?.tile ?? 0}, -1) };`);
  check(before.win === null && before.rec === false, 'przed pierwszą rundą: okno zamknięte, brak rekordu (nic nie otwiera się bez bitwy)', JSON.stringify(before));
  const rec = (q) => `(() => { const r = KOSMOS.colonyBattleFeed.get(${ov}._getColony().planetId, ${q}, -1); if (!r) return null; const us = [...r.units.values()];
    return { round: r.round, ended: r.ended, winner: r.winnerId, own: us.filter(u => u.owner === 'player' && u.state === 'alive').reduce((s, u) => s + u.hp, 0), enemy: us.filter(u => u.owner !== 'player' && u.state === 'alive').reduce((s, u) => s + u.hp, 0),
      lost: us.filter(u => u.state !== 'alive').length, log: r.log.length, autoOpened: r.autoOpened }; })()`;
  const r1 = await E(`csBattleRound(); ${redraw} return { win: ${ov}._cBattle, rec: ${rec(gb?.tile ?? 0)} };`);
  await hold();
  await shot('round1', `Round 1: the battle card opened by itself (no click) — both sides with HP, round counter, live tag, log`, hero);
  check(!!r1.win && r1.win.q === gb?.tile && r1.rec?.round === 1 && r1.rec.autoOpened === true, 'runda 1: okno otworzyło się samo na polu bitwy', JSON.stringify(r1));
  const r3 = await E(`csBattleRound(); csBattleRound(); ${redraw} return ${rec(gb?.tile ?? 0)};`);
  await hold();
  await shot('round3', `Round ${r3?.round}: HP bars updated each round, losses and the last events in the log`, hero);
  check(r3 && r3.round === 3 && (r3.own + r3.enemy) < (r1.rec.own + r1.rec.enemy) && r3.log > r1.rec.log, 'rundy 2–3: HP obu stron spada, dziennik rośnie', JSON.stringify({ r1: r1.rec, r3 }));
  let end = r3;
  for (let i = 0; i < 60 && !end?.ended; i++) end = await E(`csBattleRound(); return ${rec(gb?.tile ?? 0)};`);
  await E(`${redraw} return true;`); await hold();
  const winAfter = await E(`return ${ov}._cBattle;`);
  await shot('ended', `Battle over after ${end?.round} rounds — the card keeps the outcome until closed (✕)`, hero);
  numbers.card = { r1: r1.rec, r3, end };
  check(end?.ended === true && !!winAfter && winAfter.q === gb?.tile, 'koniec bitwy: wynik zostaje w oknie do zamknięcia', JSON.stringify(end));
  // modal raportu bitwy (stary, globalny) zamyka się sam albo zostaje — zamknij, żeby nie zasłaniał kolejnych ujęć
  await E(`document.querySelectorAll('.kosmos-battle-report').forEach(e => e.remove()); return true;`);

  // ── konsola zamknięta → meldunek w dzwonku → klik → konsola z oknem ──
  const gb2 = await E(`${ov}._cBattle = null; return csGroundBattle();`);
  await E(`KOSMOS.overlayManager.closeActive(); ${redraw} return true;`); await sleep(400);
  const nBefore = await E(`return KOSMOS.notificationCenter._items.filter(n => n.source === 'groundBattle').length;`);
  const logBefore = await E(`return (KOSMOS.eventLogSystem?._entries ?? KOSMOS.eventLogSystem?.entries ?? []).length;`);
  await E(`KOSMOS.combatSystem.tick(1); return true;`); await sleep(300);
  const notif = await E(`const n = KOSMOS.notificationCenter._items.find(x => x.source === 'groundBattle' && !x.dismissed); return n ? { title: n.title, payload: n.payload, count: KOSMOS.notificationCenter._items.filter(x => x.source === 'groundBattle').length, open: KOSMOS.overlayManager.active } : null;`);
  check(!!notif && notif.count === nBefore + 1 && notif.payload.q === gb2?.tile && notif.open === null, 'konsola zamknięta: jeden meldunek „bitwa naziemna” w dzwonku', JSON.stringify(notif));
  // ta sama emisja co klik wiersza w NotificationDropdown (`notify:openDetail`), na tej samej instancji EventBus (ten sam URL modułu)
  await page.evaluate(`(async () => { const EB = (await import('/src/core/EventBus.js')).default; const n = KOSMOS.notificationCenter._items.find(x => x.source === 'groundBattle' && !x.dismissed); EB.emit('notify:openDetail', { notif: n }); return true; })()`);
  await sleep(600);
  const opened = await E(`return { active: KOSMOS.overlayManager.active, win: ${ov}._cBattle, colony: ${ov}._getColony()?.planetId, console: !!${ov}._consoleOn };`);
  await page.waitFor(`!!KOSMOS.overlayManager.overlays.colony._sphere?.renderer?.topo`, 'kula po meldunku', 60000).catch(() => {});
  await E(`${ov}._sphere.renderer.turnTo(${gb2?.tile ?? 0}); ${redraw} return true;`); await sleep(1600); await hold();
  await shot('notified', 'Console was closed: the bell entry "Ground battle" opened the colony console with the live battle card', null);
  check(opened.active === 'colony' && opened.win?.q === gb2?.tile && opened.console === true, 'klik meldunku: konsola kolonii + okno bitwy', JSON.stringify(opened));
  numbers.notify = { notif, opened };
  console.log('[cs10b-battle] liczby', JSON.stringify(numbers));

  // ── arkusz ──
  const row = (names) => names.map(n => shots.find(s => s.name === n)).filter(Boolean).map(s => ({ src: `/__shot/${s.name}.png`, label: s.label, w: s.w, h: s.h }));
  const rows = [
    { title: 'Finding 797 — the crossed blades only for a battle the combat system fights (peace: none; war: marker)', items: row(['peace', 'war']), per: 2 },
    { title: 'Live ground battle card (D-CS-31): opens by itself on round 1, updates every round', items: row(['round1', 'round3']), per: 2 },
    { title: 'Outcome kept until closed · bell notification when the console is closed → console + card', items: row(['ended', 'notified']), per: 2 },
  ];
  await page.send('Page.navigate', { url: `${base}/__sheet` });
  await page.waitFor(`!!document.getElementById('c')`, 'arkusz');
  const data = await page.evaluate(`(async () => {
    const R = ${JSON.stringify(rows)};
    const W = 2400, PAD = 12, LAB = 24, HEAD = 40;
    const lay = R.map(r => { const tw = Math.floor((W - PAD * (r.per + 1)) / r.per); const th = Math.max(...r.items.map(i => Math.round(tw * i.h / i.w))); return { tw, th, lines: Math.ceil(r.items.length / r.per) }; });
    const c = document.getElementById('c'); c.width = W; c.height = HEAD + lay.reduce((s, l) => s + HEAD + l.lines * (l.th + LAB + PAD), 0) + PAD;
    const x = c.getContext('2d'); x.fillStyle = '#05070b'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#e8eef5'; x.font = 'bold 22px sans-serif'; x.textBaseline = 'middle'; x.fillText('KOSMOS CS-10b — live ground battle card + Finding 797', PAD, HEAD / 2);
    let y = HEAD;
    for (let k = 0; k < R.length; k++) { const r = R[k], l = lay[k];
      x.fillStyle = '#cfd8e3'; x.font = 'bold 17px sans-serif'; x.fillText(r.title, PAD, y + HEAD / 2); y += HEAD;
      for (let i = 0; i < r.items.length; i++) { const it = r.items[i], cx = PAD + (i % r.per) * (l.tw + PAD), cy = y + Math.floor(i / r.per) * (l.th + LAB + PAD);
        x.fillStyle = '#9fb4c8'; x.font = '13px sans-serif'; x.fillText(it.label, cx + 2, cy + LAB / 2);
        const img = new Image(); img.src = it.src; await img.decode(); x.imageSmoothingQuality = 'high'; const h = Math.round(l.tw * it.h / it.w); x.drawImage(img, cx, cy + LAB, l.tw, h);
        x.strokeStyle = '#27323f'; x.strokeRect(cx + 0.5, cy + LAB + 0.5, l.tw - 1, h - 1); }
      y += l.lines * (l.th + LAB + PAD); }
    return c.toDataURL('image/png');
  })()`);
  const out = path.join(OUT_DIR, 'cs10b-battle.png');
  fs.writeFileSync(out, Buffer.from(String(data).replace(/^data:image\/png;base64,/, ''), 'base64'));
  console.log('[cs10b-battle] zapisano', path.relative(REPO, out).replace(/\\/g, '/'), fs.statSync(out).size, 'B');
  fs.writeFileSync(path.join(SHOT_DIR, 'cs10b-battle-numbers.json'), JSON.stringify(numbers, null, 1));

  const realExc = exc.filter(e => !/AudioContext is closed/.test(e));
  if (realExc.length) { console.log('WYJĄTKI STRONY:'); for (const e of [...new Set(realExc)].slice(0, 8)) console.log('  ' + e.replace(/\n/g, ' | ')); }
  check(realExc.length === 0, 'brak wyjątków strony', `${realExc.length}`);
  const fail = checks.filter(c => !c.ok).length;
  console.log(`\n[cs10b-battle] kontrole: ${checks.length - fail} PASS / ${fail} FAIL   (ujęcia: ${SHOT_DIR})`);
  exitCode = fail ? 1 : 0;
} catch (e) {
  console.error('[cs10b-battle] BŁĄD:', e?.stack ?? e);
  exitCode = 2;
} finally {
  try { chrome.proc.kill(); } catch { /* nic */ }
  server.close();
  await sleep(300);
  try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch { /* Chrome trzyma pliki */ }
}
process.exit(exitCode);
