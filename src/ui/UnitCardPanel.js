// UnitCardPanel — pełna karta jednostki naziemnej
//
// DOM modal otwierany przez dwuklik na sprite jednostki lub klawisz `I`
// z zaznaczoną jednostką. Pokazuje wszystkie staty, counters, umiejętności,
// tagi, aktualny supply/org/morale/dmg mult. Akcje: rename, disband.

import { UNIT_ARCHETYPES } from '../data/unitArchetypes.js';
import { GROUND_ABILITIES } from '../data/groundAbilities.js';
import { GroundUnitFactory } from '../systems/GroundUnitFactory.js';
import { THEME, hexToRgb } from '../config/ThemeConfig.js';
import EventBus from '../core/EventBus.js';

const FACTION_COLORS = {
  humanity: '#94A3B8',
  UNE:      '#2563EB',
  Syndykat: '#C2410C',
  // Empire IDs → red fallback
};

/**
 * Pokaż kartę jednostki.
 * @param {object} unit — obiekt jednostki z GroundUnitManager
 * @returns {Promise<void>}
 */
export function showUnitCard(unit) {
  return new Promise(resolve => {
    if (!unit) { resolve(); return; }
    const arch = UNIT_ARCHETYPES[unit.archetypeId] ?? null;
    const isEnemy = !!(unit.owner && unit.owner !== 'player');
    const factionColor = isEnemy ? '#D85A30' : (FACTION_COLORS[unit.factionId] ?? '#94A3B8');

    const _ac = hexToRgb(THEME.accent);
    const _fc = hexToRgb(factionColor);

    // ── Overlay DOM ──────────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(2,4,5,0.72); z-index: 100;
      display: flex; justify-content: center; align-items: center;
    `;

    const panel = document.createElement('div');
    panel.style.cssText = `
      background: ${THEME.bgPrimary}; border: 2px solid ${factionColor};
      border-radius: 4px; width: 460px; max-height: 88vh;
      display: flex; flex-direction: column;
      font-family: ${THEME.fontFamily}; color: ${THEME.textPrimary};
      box-shadow: 0 0 40px rgba(2,4,5,0.88), 0 0 12px rgba(${_fc.r},${_fc.g},${_fc.b},0.35);
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 10px 14px; border-bottom: 1px solid ${factionColor};
      display: flex; align-items: center; gap: 10px; flex-shrink: 0;
      background: rgba(${_fc.r},${_fc.g},${_fc.b},0.10);
    `;

    // Ikona (emoji)
    const iconEl = document.createElement('div');
    iconEl.style.cssText = `font-size: 32px; line-height: 1; width: 44px; text-align: center;`;
    iconEl.textContent = arch?.icon ?? (isEnemy ? '💀' : '🪖');
    header.appendChild(iconEl);

    const titleBox = document.createElement('div');
    titleBox.style.cssText = 'flex: 1; min-width: 0;';
    const nameEl = document.createElement('div');
    nameEl.style.cssText = `font-size: 14px; font-weight: bold; color: ${factionColor}; letter-spacing: 1px;`;
    nameEl.textContent = unit.customName || (arch?.descriptionPL?.split('.')[0] ?? unit.archetypeId ?? unit.type);
    titleBox.appendChild(nameEl);

    const subEl = document.createElement('div');
    subEl.style.cssText = `font-size: 10px; color: ${THEME.textSecondary}; margin-top: 2px;`;
    const factionLabel = unit.factionId ?? (isEnemy ? 'obce imperium' : 'humanity');
    subEl.textContent = `${unit.archetypeId ?? unit.type} · ${factionLabel}${isEnemy ? ' · 🔴 WRÓG' : ''}`;
    titleBox.appendChild(subEl);

    header.appendChild(titleBox);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
      background: transparent; border: 1px solid ${THEME.border};
      color: ${THEME.textDim}; cursor: pointer;
      width: 28px; height: 28px; border-radius: 2px;
      font-family: ${THEME.fontFamily}; font-size: 14px;
    `;
    closeBtn.onclick = () => close();
    header.appendChild(closeBtn);

    panel.appendChild(header);

    // Body — scrollable
    const body = document.createElement('div');
    body.style.cssText = 'flex: 1; overflow-y: auto; padding: 12px 14px;';

    // ── Stats section ────────────────────────────────────────────
    _addSection(body, '📊 STATYSTYKI', () => {
      const stats = arch?.baseStats ?? {};
      const cur = unit;
      return [
        { label: 'HP', value: `${Math.round(cur.hp ?? cur.currentHP ?? 0)} / ${cur.maxHp ?? cur.hpMax ?? stats.hp ?? '?'}` },
        { label: 'Atak (DMG)', value: stats.dmg ?? cur.attack ?? '—' },
        { label: 'Obrona (AC)', value: stats.ac ?? cur.defense ?? '—' },
        { label: 'Zasięg', value: stats.rng ?? cur.range ?? 1 },
        { label: 'Ruch', value: stats.mov ?? '—' },
      ];
    });

    // ── Supply / Org / Morale + dmg mult ─────────────────────────
    if (unit.supply !== undefined && unit.supply !== null) {
      _addSection(body, '⚡ MORALE / STAN', () => {
        const dmgMult = GroundUnitFactory?.computeDamageMult?.(unit) ?? 1.0;
        const rows = [];
        _addBarRow(rows, 'Supply', unit.supply, unit.supplyCap ?? 100, '#D88040');
        _addBarRow(rows, 'Org',    unit.org ?? 0, unit.maxOrg ?? 100, '#40B0D8');
        if (!unit.noMorale) {
          _addBarRow(rows, 'Morale', unit.morale ?? 0, unit.maxMorale ?? 100, '#80D840');
        }
        rows.push({ label: 'DMG mult', value: `×${dmgMult.toFixed(2)}` });
        return rows;
      });
    }

    // ── Counters section ─────────────────────────────────────────
    if (arch) {
      _addSection(body, '⚔ RELACJE BOJOWE', () => {
        const rows = [];
        const counters = arch.counters ?? [];
        const counteredBy = arch.counteredBy ?? [];
        if (counters.length === 0 && counteredBy.length === 0) {
          rows.push({ label: '—', value: 'Brak specjalnych relacji' });
          return rows;
        }
        if (counters.length > 0) {
          rows.push({ label: '✓ Bije (+30%)', value: counters.join(', ') });
        }
        if (counteredBy.length > 0) {
          rows.push({ label: '✗ Bita przez', value: counteredBy.join(', ') });
        }
        return rows;
      });
    }

    // ── Ability ──────────────────────────────────────────────────
    if (arch?.ability) {
      const abilityDef = GROUND_ABILITIES[arch.ability];
      if (abilityDef) {
        _addSection(body, '✨ UMIEJĘTNOŚĆ', () => [
          { label: abilityDef.namePL ?? arch.ability,
            value: abilityDef.descriptionPL ?? abilityDef.descriptionEN ?? '' },
        ]);
      }
    }

    // ── Tags + role ──────────────────────────────────────────────
    if (arch?.tags?.length > 0 || arch?.role) {
      const tags = [...(arch.tags ?? [])];
      if (arch.role) tags.unshift(`role:${arch.role}`);
      _addSection(body, '🏷 TAGI', () => [
        { label: '', value: tags.join(' · ') },
      ]);
    }

    // ── Special rules ────────────────────────────────────────────
    if (arch?.specialRules?.length > 0) {
      _addSection(body, '📜 ZASADY SPECJALNE', () => {
        return arch.specialRules.map(r => ({ label: '•', value: r }));
      });
    }

    // ── Pozycja ──────────────────────────────────────────────────
    _addSection(body, '📍 POZYCJA', () => [
      { label: 'Hex', value: `(${unit.q}, ${unit.r})` },
      { label: 'Status', value: unit.status ?? 'idle' },
      ...(unit.deployState ? [{ label: 'Deploy', value: unit.deployState }] : []),
      ...(unit.supportTarget ? [{ label: 'Wspiera bitwę', value: `(${unit.supportTarget.q}, ${unit.supportTarget.r})` }] : []),
    ]);

    panel.appendChild(body);

    // Footer — action buttons
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 8px 14px; border-top: 1px solid ${THEME.border};
      display: flex; gap: 8px; justify-content: flex-end; flex-shrink: 0;
    `;

    if (!isEnemy) {
      const renameBtn = _btn('✏ Zmień nazwę', THEME.accent, async () => {
        const current = unit.customName ?? '';
        const next = window.prompt('Nowa nazwa jednostki:', current);
        if (next != null && next.trim().length > 0) {
          unit.customName = next.trim();
          nameEl.textContent = unit.customName;
        }
      });
      footer.appendChild(renameBtn);

      const disbandBtn = _btn('💔 Rozwiąż', THEME.danger, () => {
        if (!window.confirm('Rozwiązać jednostkę? Ta akcja jest nieodwracalna.')) return;
        const gum = window.KOSMOS?.groundUnitManager;
        if (gum?.removeUnit) {
          EventBus.emit('groundUnit:destroyed', {
            unitId: unit.id, planetId: unit.planetId, owner: unit.owner,
            archetypeId: unit.archetypeId ?? null,
            popCost: unit.popCost ?? 0,
            cause: 'disband_manual',
          });
          gum.removeUnit(unit.id);
        }
        close();
      });
      footer.appendChild(disbandBtn);
    }

    const closeFooterBtn = _btn('Zamknij', THEME.textDim, () => close());
    footer.appendChild(closeFooterBtn);

    panel.appendChild(footer);

    // ── Bindings ────────────────────────────────────────────────
    for (const evt of ['click', 'mousedown', 'mouseup']) {
      panel.addEventListener(evt, (e) => e.stopPropagation());
      overlay.addEventListener(evt, (e) => e.stopPropagation());
    }
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    const onKey = (e) => {
      if (e.code === 'Escape') { e.stopPropagation(); close(); }
    };
    document.addEventListener('keydown', onKey);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    function close() {
      document.removeEventListener('keydown', onKey);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      resolve();
    }
  });
}

// ── Helpers ──────────────────────────────────────────────────────

function _addSection(parent, title, buildRows) {
  const section = document.createElement('div');
  section.style.cssText = 'margin-bottom: 12px;';

  const h = document.createElement('div');
  h.style.cssText = `
    font-size: 10px; font-weight: bold; color: ${THEME.accent};
    letter-spacing: 1px; margin-bottom: 6px; opacity: 0.85;
  `;
  h.textContent = title;
  section.appendChild(h);

  const rows = buildRows() ?? [];
  for (const row of rows) {
    if (row.bar) {
      section.appendChild(row.barEl);
      continue;
    }
    const r = document.createElement('div');
    r.style.cssText = `
      display: flex; justify-content: space-between; gap: 8px;
      font-size: 10.5px; padding: 2px 0; color: ${THEME.textSecondary};
    `;
    const l = document.createElement('span');
    l.style.cssText = `color: ${THEME.textDim}; flex-shrink: 0;`;
    l.textContent = row.label;
    const v = document.createElement('span');
    v.style.cssText = `color: ${THEME.textPrimary}; text-align: right; font-weight: 600;`;
    v.textContent = row.value;
    r.appendChild(l);
    r.appendChild(v);
    section.appendChild(r);
  }

  parent.appendChild(section);
}

function _addBarRow(rows, label, cur, max, color) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin: 4px 0 6px;';

  const top = document.createElement('div');
  top.style.cssText = `
    display: flex; justify-content: space-between;
    font-size: 10px; color: ${THEME.textDim}; margin-bottom: 2px;
  `;
  const lbl = document.createElement('span'); lbl.textContent = label;
  const val = document.createElement('span'); val.style.color = THEME.textPrimary;
  val.textContent = `${Math.round(cur)} / ${max}`;
  top.appendChild(lbl); top.appendChild(val);
  wrap.appendChild(top);

  const bar = document.createElement('div');
  bar.style.cssText = `height: 8px; background: ${THEME.bgTertiary}; border: 1px solid ${THEME.border}; border-radius: 2px; overflow: hidden;`;
  const fill = document.createElement('div');
  const frac = max > 0 ? Math.min(1, cur / max) : 0;
  fill.style.cssText = `height: 100%; width: ${(frac * 100).toFixed(1)}%; background: ${color};`;
  bar.appendChild(fill);
  wrap.appendChild(bar);

  rows.push({ bar: true, barEl: wrap });
}

function _btn(text, color, onClick) {
  const c = hexToRgb(color);
  const btn = document.createElement('button');
  btn.style.cssText = `
    background: rgba(${c.r},${c.g},${c.b},0.18);
    border: 1px solid rgba(${c.r},${c.g},${c.b},0.6);
    color: ${color}; cursor: pointer;
    font-family: ${THEME.fontFamily};
    font-size: 11px; padding: 5px 14px;
    border-radius: 2px;
    transition: background 0.15s;
  `;
  btn.onmouseenter = () => { btn.style.background = `rgba(${c.r},${c.g},${c.b},0.35)`; };
  btn.onmouseleave = () => { btn.style.background = `rgba(${c.r},${c.g},${c.b},0.18)`; };
  btn.onclick = onClick;
  btn.textContent = text;
  return btn;
}
