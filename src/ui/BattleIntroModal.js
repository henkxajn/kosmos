// BattleIntroModal — baner wyniku bitwy (ZWYCIĘSTWO / PORAŻKA / REMIS), pauza do OK.
//
// ARC CV-8b (D-CV-27 (a), COMBAT_VISUALS_PLAN.md §4 CV-8b) — z dawnego modułu zostaje WYŁĄCZNIE baner wyniku (`showBattleOutcome`).
// Wycofane: popup „ENGAGEMENT IMMINENT” / „BITWA NIEUCHRONNA” pokazywany PO rozstrzygnięciu bitwy (`showBattleIntro` — wybór
// Obserwuj / Pomiń / Zawsze pomijaj), preferencja gracza w localStorage (`kosmos_battle_view_auto`, `get/setBattleViewPreference`)
// i kino BattleView3D, do którego prowadził przycisk „Obserwuj”. Każda bitwa kończy się teraz banerem (bitwa w widoku — po walce na
// scenie bitwy), „Obserwuj” = kamera na scenę (pasek walki), a zamiast pauzującego pytania — auto-slow (`UIManager`).
// Nazwa pliku zostaje (importują go `GameScene` i keepery).
//
// API:
//   import { showBattleOutcome } from './BattleIntroModal.js';
//   showBattleOutcome(battleData).then(() => ...)   // battleData: { result, playerSide, aggressorName, defenderName }

import EventBus from '../core/EventBus.js';
import { THEME } from '../config/ThemeConfig.js';

let _savedTimeState = null;

function _restoreTime() {
  const saved = _savedTimeState;
  _savedTimeState = null;
  if (!saved || saved.wasPaused) return;
  EventBus.emit('time:play');
}

// ── Baner wyniku (po bitwie) — pauzuje czas do OK ──────

let _activeOutcome = null;

export function showBattleOutcome(battleData) {
  return new Promise((resolve) => {
    // Pauzuj czas
    if (!_savedTimeState) {
      _savedTimeState = { wasPaused: window.KOSMOS?.timeSystem?.paused ?? false };
      EventBus.emit('time:pause');
    }

    const res = battleData.result ?? {};
    const winner = res.winner;
    const playerSide = battleData.playerSide;
    let label = 'REMIS';
    let color = '#BBBBBB';
    let glow = 'rgba(150,150,150,0.5)';
    if (winner === playerSide) {
      label = 'ZWYCIĘSTWO';
      color = '#60E0B0';
      glow = 'rgba(96,224,176,0.5)';
    } else if (winner && winner !== 'draw') {
      label = 'PORAŻKA';
      color = '#D85A30';
      glow = 'rgba(216,90,48,0.5)';
    }

    // Keyframe animacji wejścia banera
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

    // Przyciemnione tło (żeby baner rzucał się w oczy na pełnoekranowej scenie)
    const backdrop = document.createElement('div');
    backdrop.style.cssText = `
      position: fixed; inset: 0; z-index: 400;
      background: rgba(0,0,0,0.6);
    `;

    const banner = document.createElement('div');
    banner.style.cssText = `
      position: fixed; top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      z-index: 401;
      text-align: center;
      animation: battleOutcome 0.6s ease-out;
    `;
    banner.innerHTML = `
      <div style="
        font-family: 'Courier New', monospace;
        font-size: 84px; font-weight: bold;
        letter-spacing: 8px;
        color: ${color};
        text-shadow: 0 0 20px ${glow}, 0 0 40px ${glow};
        padding: 30px 60px;
        background: rgba(0,0,0,0.55);
        border: 3px solid ${color};
        box-shadow: 0 0 30px ${glow}, inset 0 0 20px ${glow};
      ">${label}</div>
      <div style="
        margin-top: 16px;
        font-family: 'Courier New', monospace;
        font-size: 14px;
        color: #CCCCCC;
        letter-spacing: 2px;
      ">
        ${battleData.aggressorName ?? 'Agresor'} vs ${battleData.defenderName ?? 'Obrońca'}
        &nbsp; · &nbsp;
        Tur: ${res.turns ?? 0}
        &nbsp; · &nbsp;
        Straty: ${res.lossesA ?? 0} / ${res.lossesB ?? 0}
      </div>
    `;

    const btnRow = document.createElement('div');
    btnRow.style.cssText = `
      position: fixed; left: 50%; top: calc(50% + 180px);
      transform: translateX(-50%);
      z-index: 402;
    `;
    const btnOk = document.createElement('button');
    btnOk.textContent = 'OK';
    btnOk.className = 'battle-btn primary';
    btnOk.style.cssText = `
      padding: 10px 32px; cursor: pointer;
      font-family: 'Courier New', monospace;
      font-size: 14px; font-weight: bold; letter-spacing: 2px;
      border: 1px solid ${THEME.accent};
      background: rgba(0,255,180,0.10);
      color: ${THEME.accent};
    `;
    btnRow.appendChild(btnOk);

    document.body.append(backdrop, banner, btnRow);
    _activeOutcome = { backdrop, banner, btnRow };

    const finish = () => {
      if (!_activeOutcome) return;
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      banner.remove();
      btnRow.remove();
      _activeOutcome = null;
      _restoreTime();
      resolve();
    };

    btnOk.addEventListener('click', finish);
    backdrop.addEventListener('click', finish);

    const onKey = (e) => {
      if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') {
        e.preventDefault();
        finish();
      }
    };
    document.addEventListener('keydown', onKey);

    requestAnimationFrame(() => btnOk.focus());
  });
}
