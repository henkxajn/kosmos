// BattleView3D — cinematic wizualizacja starcia (Faza 5)
//
// Scena Three.js wyświetlana na istniejącym #three-canvas.
// Główny ThreeRenderer jest zawieszony (suspend()) na czas bitwy.
//
// Przebieg:
//   1. start(battleData) — buduje własną scenę + kamerę + renderer (reuse WebGL context)
//   2. Playback timeline[]: 1 tura ≈ 0.8s animacji
//      - Laser lines / missile trails w kierunku przeciwnika
//      - Flash sprite przy trafieniu
//      - Lekkie oscilacje statków (bob/yaw)
//   3. Po ostatniej turze — statyczna "pauza zwycięstwa" 1.5s, potem OK button
//   4. OK → stop() → ThreeRenderer.resume() → powrót do GameScene
//
// Statki proceduralne (stożki + kule) — bez GLB (mamy tylko cywilne modele).
// Kolory z archetypu imperium vs #60E0B0 (player green).

import * as THREE from 'three';
import EventBus from '../core/EventBus.js';
import { ARCHETYPES } from '../data/EmpireData.js';
import { THEME } from '../config/ThemeConfig.js';

const TURN_DURATION_MS = 800;    // 0.8s per turn
const POST_BATTLE_PAUSE_MS = 1500; // pauza przed przyciskiem OK
const SHIPS_PER_SIDE = 4;

const PLAYER_COLOR = '#60E0B0';

export class BattleView3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.active = false;
    // UWAGA: NIE tworzymy własnego WebGLRenderera — współdzielimy kontekst
    // z głównym ThreeRenderer (dwa renderery na jednym canvas = konflikt WebGL).
    // renderer będzie pobrany z window.KOSMOS.threeRenderer.renderer w start().
    this.renderer = null;

    this.scene = null;
    this.camera = null;
    this.clock = new THREE.Clock();

    this._rafId = null;

    // DOM overlay (przyciski Skip/OK + pasek turn)
    this._hud = null;
  }

  /**
   * Start cinematic playback.
   * battleData: { result, aggressorName, defenderName, aggressorArchetype, playerSide }
   *   - result: { timeline, winner, lossesA, lossesB, turns }
   *   - playerSide: 'A' lub 'B' (która strona to gracz)
   * Returns Promise<void> — resolves when user clicks OK.
   */
  start(battleData) {
    return new Promise((resolve) => {
      this._onFinish = resolve;
      this.active = true;
      this._battleData = battleData;

      // Suspend main renderer i pobierz jego WebGLRenderer (współdzielony)
      const mainRenderer = window.KOSMOS?.threeRenderer;
      mainRenderer?.suspend?.();
      this.renderer = mainRenderer?.renderer ?? null;
      if (!this.renderer) {
        console.error('[BattleView3D] Brak dostępu do WebGLRenderer — przerywam');
        this.active = false;
        resolve();
        return;
      }

      this._buildScene();
      this._buildHUD();
      this._startLoop();
    });
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    if (this._hud) { this._hud.remove(); this._hud = null; }
    if (this._outcomeBanner) { this._outcomeBanner.remove(); this._outcomeBanner = null; }
    if (this._keyHandler) { document.removeEventListener('keydown', this._keyHandler); this._keyHandler = null; }
    // Zwolnij resources
    this._disposeScene();
    // Resume main renderer
    window.KOSMOS?.threeRenderer?.resume?.();
    if (this._onFinish) { const cb = this._onFinish; this._onFinish = null; cb(); }
  }

  // ── Budowa sceny ────────────────────────────────────────────

  _buildScene() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020510);

    // Gwiazdy tła (instanced points)
    const starGeom = new THREE.BufferGeometry();
    const starCount = 600;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 400;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 200;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 400;
    }
    starGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xAABBCC, size: 0.5 });
    scene.add(new THREE.Points(starGeom, starMat));

    // Oświetlenie
    scene.add(new THREE.AmbientLight(0x7090C0, 0.45));
    const keyLight = new THREE.DirectionalLight(0xFFEECC, 0.9);
    keyLight.position.set(20, 30, 20);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x60A0FF, 0.4);
    rimLight.position.set(-15, 10, -20);
    scene.add(rimLight);

    // Kamera — wide shot, lekko z góry, patrzy w środek
    const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
    camera.position.set(0, 12, 45);
    camera.lookAt(0, 0, 0);
    this._cameraOrbitAngle = 0;

    // Budowa flot
    const data = this._battleData;
    const aMeta = this._resolveSideMeta(data, 'A');
    const bMeta = this._resolveSideMeta(data, 'B');

    const groupA = this._buildFleet(aMeta.color, -16, 'A');
    const groupB = this._buildFleet(bMeta.color, +16, 'B');
    scene.add(groupA, groupB);

    this.scene = scene;
    this.camera = camera;
    this._groupA = groupA;
    this._groupB = groupB;
    this._meta = { A: aMeta, B: bMeta };

    // Kontenery efektów (lasery, flash)
    this._effectsGroup = new THREE.Group();
    scene.add(this._effectsGroup);
    this._activeEffects = [];   // {mesh, endTime, onEnd?}

    // Stan playbacku
    this._startTimeMs = performance.now();
    this._turnIndex = 0;
    this._timeline = data.result?.timeline ?? [];
    this._turnsTotal = this._timeline.length;
    this._ended = false;
  }

  _resolveSideMeta(data, side) {
    const isPlayer = data.playerSide === side;
    if (isPlayer) {
      return { color: PLAYER_COLOR, name: data.defenderName ?? 'Gracz' };
    }
    // Obcy — kolor z archetypu
    const arch = ARCHETYPES[data.aggressorArchetype];
    return {
      color: arch?.color ?? '#D85A30',
      name: side === 'A' ? (data.aggressorName ?? 'Obcy') : (data.defenderName ?? 'Obcy'),
    };
  }

  _buildFleet(colorHex, xCenter, side) {
    const group = new THREE.Group();
    group.name = `fleet_${side}`;
    group.position.x = xCenter;

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorHex),
      emissive: new THREE.Color(colorHex),
      emissiveIntensity: 0.2,
      roughness: 0.4,
      metalness: 0.7,
    });

    const mat2 = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorHex),
      emissive: new THREE.Color(colorHex),
      emissiveIntensity: 0.15,
      roughness: 0.6,
      metalness: 0.3,
    });

    // 4 statki w formacji rombu
    const positions = [
      [0, 2, 0],     // flagship
      [-3, 0, 2],    // lewy dolny
      [ 3, 0, 2],    // prawy dolny
      [0, -1, 5],    // tylny
    ];

    for (let i = 0; i < SHIPS_PER_SIDE; i++) {
      const [px, py, pz] = positions[i];
      const ship = new THREE.Group();
      ship.position.set(px, py, pz);

      // Statki zwrócone w stronę przeciwnika (side A patrzy w +X, side B w -X)
      const facing = side === 'A' ? 1 : -1;

      // Korpus — stożek (nos wskazuje na cel)
      const bodyGeom = new THREE.ConeGeometry(i === 0 ? 1.2 : 0.8, i === 0 ? 4 : 2.8, 8);
      const body = new THREE.Mesh(bodyGeom, material);
      body.rotation.z = -Math.PI / 2 * facing;
      ship.add(body);

      // Silniki — mały stożek pomarańczowy z tyłu
      const engineGeom = new THREE.ConeGeometry(i === 0 ? 0.3 : 0.2, i === 0 ? 0.8 : 0.6, 6);
      const engineMat = new THREE.MeshBasicMaterial({ color: 0xFF8040 });
      const engine = new THREE.Mesh(engineGeom, engineMat);
      engine.rotation.z = Math.PI / 2 * facing;
      engine.position.x = (i === 0 ? -2.2 : -1.6) * facing;
      ship.add(engine);

      // Skrzydła — płaskie boxy
      if (i === 0) {
        const wingGeom = new THREE.BoxGeometry(1.8, 0.2, 2.4);
        const wing = new THREE.Mesh(wingGeom, mat2);
        wing.position.x = -0.5 * facing;
        ship.add(wing);
      }

      ship.userData = {
        baseY: py,
        phase: Math.random() * Math.PI * 2,
        isFlagship: i === 0,
      };
      group.add(ship);
    }

    return group;
  }

  _disposeScene() {
    if (!this.scene) return;
    this.scene.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose?.();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose?.());
        else obj.material.dispose?.();
      }
    });
    this.scene = null;
    this._groupA = null;
    this._groupB = null;
    this._effectsGroup = null;
    this._activeEffects = [];
  }

  // ── HUD (DOM overlay) ───────────────────────────────────────

  _buildHUD() {
    const hud = document.createElement('div');
    hud.style.cssText = `
      position: fixed; inset: 0; z-index: 400;
      pointer-events: none;
      font-family: 'Courier New', monospace;
    `;

    // Nagłówek górny
    const top = document.createElement('div');
    top.style.cssText = `
      position: absolute; top: 20px; left: 50%; transform: translateX(-50%);
      display: flex; gap: 40px; align-items: center;
      background: rgba(0,0,0,0.6); padding: 12px 24px;
      border: 1px solid ${THEME.border};
      color: ${THEME.textPrimary}; font-size: 14px;
    `;
    const data = this._battleData;
    const aMeta = this._meta.A;
    const bMeta = this._meta.B;
    top.innerHTML = `
      <div style="color:${aMeta.color};font-weight:bold;">${aMeta.name}</div>
      <div style="color:#D85A30;font-size:20px;">⚔</div>
      <div style="color:${bMeta.color};font-weight:bold;">${bMeta.name}</div>
    `;
    hud.appendChild(top);

    // Pasek postępu (dół)
    const progress = document.createElement('div');
    progress.style.cssText = `
      position: absolute; bottom: 80px; left: 50%; transform: translateX(-50%);
      min-width: 400px;
      background: rgba(0,0,0,0.6); padding: 10px 16px;
      border: 1px solid ${THEME.border};
      color: ${THEME.textDim}; font-size: 12px; text-align: center;
    `;
    progress.innerHTML = `
      <div id="battle-progress-label">Tura 0 / ${this._turnsTotal}</div>
      <div style="margin-top:6px;height:4px;background:rgba(60,60,60,0.5);">
        <div id="battle-progress-bar" style="height:100%;width:0%;background:${THEME.accent};transition:width 0.3s;"></div>
      </div>
    `;
    hud.appendChild(progress);

    // Przyciski (dół środek)
    const btnRow = document.createElement('div');
    btnRow.style.cssText = `
      position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
      display: flex; gap: 12px; pointer-events: auto;
    `;
    const btnSkip = this._makeBtn('⏭ Pomiń animację', false);
    const btnOk = this._makeBtn('OK', true);
    btnOk.style.display = 'none';
    btnSkip.addEventListener('click', () => this._endAnimation());
    btnOk.addEventListener('click', () => this.stop());
    btnRow.append(btnSkip, btnOk);
    hud.appendChild(btnRow);

    document.body.appendChild(hud);
    this._hud = hud;
    this._btnSkip = btnSkip;
    this._btnOk = btnOk;

    // ESC = skip
    this._keyHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (this._ended) this.stop();
        else this._endAnimation();
      } else if (e.key === 'Enter' && this._ended) {
        e.preventDefault();
        this.stop();
      }
    };
    document.addEventListener('keydown', this._keyHandler);
  }

  _makeBtn(label, primary) {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = `
      padding: 8px 16px; cursor: pointer;
      font-family: 'Courier New', monospace;
      font-size: 13px; font-weight: bold; letter-spacing: 1px;
      border: 1px solid ${primary ? THEME.accent : THEME.border};
      background: ${primary ? 'rgba(0,255,180,0.10)' : 'rgba(40,50,60,0.6)'};
      color: ${primary ? THEME.accent : THEME.textPrimary};
    `;
    return b;
  }

  // ── Playback + animacja ─────────────────────────────────────

  _startLoop() {
    const loop = () => {
      if (!this.active) return;
      this._rafId = requestAnimationFrame(loop);
      this._tick();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  _tick() {
    const now = performance.now();
    const elapsed = now - this._startTimeMs;
    const t = this.clock.getElapsedTime();

    // Update kamera — powolny orbit
    this._cameraOrbitAngle += 0.002;
    const rad = 48;
    this.camera.position.x = Math.sin(this._cameraOrbitAngle) * 6;
    this.camera.position.y = 10 + Math.sin(this._cameraOrbitAngle * 2) * 1.5;
    this.camera.position.z = rad;
    this.camera.lookAt(0, 0, 0);

    // Oscilacje statków (bob)
    for (const group of [this._groupA, this._groupB]) {
      if (!group) continue;
      for (const ship of group.children) {
        if (!ship.userData) continue;
        const bob = Math.sin(t * 1.5 + ship.userData.phase) * 0.12;
        ship.position.y = ship.userData.baseY + bob;
      }
    }

    // Advance turn
    if (!this._ended) {
      const targetTurn = Math.floor(elapsed / TURN_DURATION_MS);
      if (targetTurn > this._turnIndex && targetTurn <= this._turnsTotal) {
        // Odpal nowe tury do osiągnięcia target
        while (this._turnIndex < targetTurn && this._turnIndex < this._turnsTotal) {
          this._playTurn(this._timeline[this._turnIndex]);
          this._turnIndex++;
        }
        this._updateProgressHUD();
      }
      if (this._turnIndex >= this._turnsTotal && !this._ended) {
        // Zaczekaj POST_BATTLE_PAUSE_MS potem pokaż OK
        setTimeout(() => this._endAnimation(), POST_BATTLE_PAUSE_MS);
      }
    }

    // Aktualizuj efekty (fade, usuwanie)
    this._updateEffects(now);
  }

  _playTurn(turn) {
    if (!turn) return;

    // Strzały A → B i B → A
    if (turn.dmgB > 0) this._spawnVolley('A', 'B', turn.dmgB);
    if (turn.dmgA > 0) this._spawnVolley('B', 'A', turn.dmgA);
  }

  _spawnVolley(fromSide, toSide, damage) {
    const from = fromSide === 'A' ? this._groupA : this._groupB;
    const to   = toSide   === 'A' ? this._groupA : this._groupB;
    const colorHex = this._meta[fromSide].color;
    const color = new THREE.Color(colorHex);

    // Wybierz losowy statek z from i losowy cel z to
    const shooter = from.children[Math.floor(Math.random() * from.children.length)];
    const target  = to.children[Math.floor(Math.random() * to.children.length)];
    const startP = new THREE.Vector3();
    const endP = new THREE.Vector3();
    shooter.getWorldPosition(startP);
    target.getWorldPosition(endP);

    // Linia lasera
    const geom = new THREE.BufferGeometry().setFromPoints([startP, endP]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geom, mat);
    this._effectsGroup.add(line);
    this._activeEffects.push({
      mesh: line, startTime: performance.now(),
      lifetime: 220,
      kind: 'laser',
    });

    // Flash przy trafieniu (po 150ms)
    setTimeout(() => {
      if (!this.active) return;
      const flashGeom = new THREE.SphereGeometry(0.8, 8, 8);
      const flashMat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.9,
      });
      const flash = new THREE.Mesh(flashGeom, flashMat);
      flash.position.copy(endP);
      this._effectsGroup.add(flash);
      this._activeEffects.push({
        mesh: flash, startTime: performance.now(),
        lifetime: 400,
        kind: 'flash',
      });
    }, 150);
  }

  _updateEffects(now) {
    if (!this._activeEffects.length) return;
    const keep = [];
    for (const ef of this._activeEffects) {
      const age = now - ef.startTime;
      if (age > ef.lifetime) {
        this._effectsGroup.remove(ef.mesh);
        ef.mesh.geometry?.dispose?.();
        ef.mesh.material?.dispose?.();
        continue;
      }
      const progress = age / ef.lifetime;
      if (ef.kind === 'laser') {
        ef.mesh.material.opacity = 0.9 * (1 - progress);
      } else if (ef.kind === 'flash') {
        ef.mesh.material.opacity = 0.9 * (1 - progress);
        ef.mesh.scale.setScalar(1 + progress * 2);
      }
      keep.push(ef);
    }
    this._activeEffects = keep;
  }

  _updateProgressHUD() {
    const label = document.getElementById('battle-progress-label');
    const bar = document.getElementById('battle-progress-bar');
    if (label) label.textContent = `Tura ${this._turnIndex} / ${this._turnsTotal}`;
    if (bar) bar.style.width = `${Math.round((this._turnIndex / Math.max(1, this._turnsTotal)) * 100)}%`;
  }

  _endAnimation() {
    if (this._ended) return;
    this._ended = true;
    // Wykonaj pozostałe tury od razu (skip)
    while (this._turnIndex < this._turnsTotal) {
      this._playTurn(this._timeline[this._turnIndex]);
      this._turnIndex++;
    }
    this._updateProgressHUD();

    // Wynik
    const res = this._battleData.result;
    const winner = res?.winner;
    const playerSide = this._battleData.playerSide;
    let outcomeLabel = 'REMIS';
    let outcomeColor = '#BBBBBB';
    let outcomeGlow = 'rgba(150,150,150,0.3)';
    if (winner === playerSide) {
      outcomeLabel = 'ZWYCIĘSTWO';
      outcomeColor = '#60E0B0';
      outcomeGlow = 'rgba(96,224,176,0.5)';
    } else if (winner && winner !== 'draw') {
      outcomeLabel = 'PORAŻKA';
      outcomeColor = '#D85A30';
      outcomeGlow = 'rgba(216,90,48,0.5)';
    }

    // Big center-screen banner zamiast małego tekstu w górnym HUD
    const banner = document.createElement('div');
    banner.style.cssText = `
      position: fixed; top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      z-index: 401;
      pointer-events: none;
      text-align: center;
      animation: battleOutcome 0.6s ease-out;
    `;
    banner.innerHTML = `
      <div style="
        font-family: 'Courier New', monospace;
        font-size: 84px; font-weight: bold;
        letter-spacing: 8px;
        color: ${outcomeColor};
        text-shadow: 0 0 20px ${outcomeGlow}, 0 0 40px ${outcomeGlow};
        padding: 30px 60px;
        background: rgba(0,0,0,0.55);
        border: 3px solid ${outcomeColor};
        box-shadow: 0 0 30px ${outcomeGlow}, inset 0 0 20px ${outcomeGlow};
      ">${outcomeLabel}</div>
      <div style="
        margin-top: 16px;
        font-family: 'Courier New', monospace;
        font-size: 14px;
        color: #CCCCCC;
        letter-spacing: 2px;
      ">
        ${this._battleData.aggressorName} vs ${this._battleData.defenderName}
        &nbsp; · &nbsp;
        Tur: ${this._turnsTotal}
        &nbsp; · &nbsp;
        Straty: ${res?.lossesA ?? 0} / ${res?.lossesB ?? 0}
      </div>
    `;

    // Keyframe animacja (once)
    if (!document.getElementById('battle-outcome-style')) {
      const style = document.createElement('style');
      style.id = 'battle-outcome-style';
      style.textContent = `
        @keyframes battleOutcome {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
          60%  { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(1.0); }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(banner);
    this._outcomeBanner = banner;

    // Top HUD wygaś — zwolnij miejsce bannerowi
    const top = this._hud?.firstChild;
    if (top) top.style.display = 'none';

    if (this._btnSkip) this._btnSkip.style.display = 'none';
    if (this._btnOk) this._btnOk.style.display = 'inline-block';
  }
}

// Cleanup handler — jeśli scena zniknie z DOM, usuń keyboard listener
// (robione wewnątrz stop())
