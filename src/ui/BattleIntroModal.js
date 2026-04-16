// BattleIntroModal — popup "ENGAGEMENT IMMINENT" przed bitwą (Faza 5)
//
// Wyświetlany tuż po `battle:resolved` (wynik już wyliczony przez BattleSystem).
// Daje graczowi wybór: Obserwuj (cinematic BattleView3D), Pomiń (od razu wpis),
// Zawsze pomijaj (zapisz preferencję w localStorage).
//
// API:
//   import { showBattleIntro } from './BattleIntroModal.js';
//   showBattleIntro(battleData).then(choice => ...)  // 'watch' | 'skip'
//   getBattleViewPreference() → 'ask' | 'skip'
//   setBattleViewPreference(p)

import EventBus from '../core/EventBus.js';
import { THEME } from '../config/ThemeConfig.js';

const PREF_KEY = 'kosmos_battle_view_auto';

export function getBattleViewPreference() {
  try {
    const v = localStorage.getItem(PREF_KEY);
    return v === 'skip' ? 'skip' : 'ask';
  } catch {
    return 'ask';
  }
}

export function setBattleViewPreference(p) {
  try { localStorage.setItem(PREF_KEY, p); } catch { /* ignore */ }
}

let _savedTimeState = null;
let _active = null;

/**
 * Pokaż modal. Zwraca Promise<'watch'|'skip'>.
 * battleData: { warId, battleId, result, aggressorName, defenderName, playerSide }
 */
export function showBattleIntro(battleData) {
  return new Promise((resolve) => {
    // Pauzuj czas
    if (!_savedTimeState) {
      _savedTimeState = { wasPaused: window.KOSMOS?.timeSystem?.paused ?? false };
      EventBus.emit('time:pause');
    }

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 500;
      background: rgba(0,0,0,0.75);
      display: flex; align-items: center; justify-content: center;
      font-family: 'Courier New', monospace;
    `;

    const panel = document.createElement('div');
    panel.style.cssText = `
      background: rgba(12,18,28,0.98);
      border: 2px solid #D85A30;
      box-shadow: 0 0 40px rgba(216,90,48,0.4), inset 0 0 20px rgba(216,90,48,0.15);
      min-width: 520px; max-width: 620px;
      padding: 28px 32px;
      color: ${THEME.textPrimary};
      text-align: center;
    `;

    // Pulsating header
    const header = document.createElement('div');
    header.textContent = '⚠ ENGAGEMENT IMMINENT ⚠';
    header.style.cssText = `
      font-size: 22px; font-weight: bold;
      color: #D85A30;
      letter-spacing: 3px;
      margin-bottom: 8px;
      animation: battlePulse 1.2s ease-in-out infinite;
    `;
    panel.appendChild(header);

    // Keyframe styles (once)
    if (!document.getElementById('battle-intro-style')) {
      const style = document.createElement('style');
      style.id = 'battle-intro-style';
      style.textContent = `
        @keyframes battlePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .battle-btn {
          padding: 10px 18px; cursor: pointer;
          font-family: 'Courier New', monospace;
          font-size: 13px; font-weight: bold;
          letter-spacing: 1px;
          border: 1px solid ${THEME.border};
          background: rgba(40,50,60,0.6);
          color: ${THEME.textPrimary};
          transition: all 0.15s;
        }
        .battle-btn:hover {
          background: rgba(60,75,90,0.8);
          border-color: ${THEME.accent};
          color: ${THEME.accent};
        }
        .battle-btn.primary {
          border-color: ${THEME.accent};
          color: ${THEME.accent};
          background: rgba(0,255,180,0.10);
        }
        .battle-btn.primary:hover {
          background: rgba(0,255,180,0.20);
        }
      `;
      document.head.appendChild(style);
    }

    // Tagline
    const tagline = document.createElement('div');
    tagline.style.cssText = `color: ${THEME.textDim}; font-size: 12px; margin-bottom: 16px;`;
    tagline.textContent = 'Floty gotowe do starcia. Wojna, bez odwrotu.';
    panel.appendChild(tagline);

    // Participants
    const participants = document.createElement('div');
    participants.style.cssText = `
      display: flex; justify-content: space-between; align-items: center;
      margin: 20px 0; padding: 16px 0;
      border-top: 1px solid ${THEME.border};
      border-bottom: 1px solid ${THEME.border};
    `;
    const a = document.createElement('div');
    a.style.cssText = `flex:1; text-align:center;`;
    a.innerHTML = `
      <div style="font-size:11px;color:${THEME.textDim};margin-bottom:6px;">AGRESOR</div>
      <div style="font-size:15px;color:${THEME.textPrimary};font-weight:bold;">${battleData.aggressorName ?? 'Obcy'}</div>
    `;
    const vs = document.createElement('div');
    vs.style.cssText = `font-size:24px;color:#D85A30;font-weight:bold;padding:0 20px;`;
    vs.textContent = 'vs';
    const d = document.createElement('div');
    d.style.cssText = `flex:1; text-align:center;`;
    d.innerHTML = `
      <div style="font-size:11px;color:${THEME.textDim};margin-bottom:6px;">OBROŃCA</div>
      <div style="font-size:15px;color:${THEME.textPrimary};font-weight:bold;">${battleData.defenderName ?? 'Gracz'}</div>
    `;
    participants.append(a, vs, d);
    panel.appendChild(participants);

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = `display:flex; gap:12px; justify-content:center; margin-top:12px;`;

    const btnWatch = _makeBtn('▶ OBSERWUJ', 'primary');
    const btnSkip  = _makeBtn('⏭ POMIŃ');
    const btnAuto  = _makeBtn('⏭⏭ ZAWSZE POMIJAJ');

    btnRow.append(btnWatch, btnSkip, btnAuto);
    panel.appendChild(btnRow);

    // Hint
    const hint = document.createElement('div');
    hint.style.cssText = `margin-top:14px; font-size:10px; color:${THEME.textDim};`;
    hint.textContent = 'ENTER — Obserwuj · ESC — Pomiń · S — Zawsze pomijaj';
    panel.appendChild(hint);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    _active = overlay;

    const finish = (choice) => {
      if (!_active) return;
      document.removeEventListener('keydown', onKey);
      _active.remove();
      _active = null;
      _restoreTime();
      resolve(choice);
    };

    btnWatch.addEventListener('click', () => finish('watch'));
    btnSkip .addEventListener('click', () => finish('skip'));
    btnAuto .addEventListener('click', () => {
      setBattleViewPreference('skip');
      finish('skip');
    });

    const onKey = (e) => {
      if (e.key === 'Enter')         { e.preventDefault(); finish('watch'); }
      else if (e.key === 'Escape')   { e.preventDefault(); finish('skip'); }
      else if (e.key === 's' || e.key === 'S') { e.preventDefault(); setBattleViewPreference('skip'); finish('skip'); }
    };
    document.addEventListener('keydown', onKey);

    // Auto-focus watch
    requestAnimationFrame(() => btnWatch.focus());
  });
}

function _makeBtn(label, variant = 'default') {
  const b = document.createElement('button');
  b.className = 'battle-btn' + (variant === 'primary' ? ' primary' : '');
  b.textContent = label;
  return b;
}

function _restoreTime() {
  const saved = _savedTimeState;
  _savedTimeState = null;
  if (!saved || saved.wasPaused) return;
  EventBus.emit('time:play');
}

// ── Outcome banner (wyświetlany po bitwie — Watch lub Skip) ──────
//
// Ten sam wizualny banner co w BattleView3D (ZWYCIĘSTWO/PORAŻKA/REMIS),
// ale standalone — dla trybu Skip (bez cinematic). Pauzuje czas do OK.

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

    // Keyframe (wspólne z BattleView3D)
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
