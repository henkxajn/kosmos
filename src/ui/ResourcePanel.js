// ResourcePanel — pasek surowców (HUD) wyświetlany nad mapą hex w PlanetScene
//
// Renderuje 4 surowce: minerals, energy, organics, water
// Każdy surowiec:  ikona  ilość/pojemność  ±delta/rok
//
// Kolorystyka ilości:
//   < 10% pojemności → czerwony (krytyczny)
//   < 25% pojemności → pomarańczowy (ostrzeżenie)
//   normalny → szaro-niebieski
// Delta/rok:
//   >0 → zielony   <0 → czerwony   0 → ciemny szary
//
// Komunikacja:
//   Nasłuchuje: 'resource:changed' { resources } → aktualizacja wartości
//               'resource:shortage' { resource }  → migotanie ikony ostrzeżenia

import EventBus from '../core/EventBus.js';
import { RESOURCE_ICONS } from '../data/BuildingsData.js';
import { RESOURCE_DEFS }  from '../systems/ResourceSystem.js';

// Pozycja i wymiary paska (muszą być spójne z PlanetScene)
export const RESOURCE_BAR_H = 44;   // eksportowana — używana w PlanetScene

// Kolory wartości
const COL_NORMAL   = '#88aacc';
const COL_WARN     = '#ffaa44';
const COL_CRIT     = '#ff4444';
const COL_POS      = '#66cc66';
const COL_NEG      = '#cc5555';
const COL_ZERO     = '#2a4060';
const COL_LABEL    = '#6a8aaa';

export class ResourcePanel {
  // scene:  Phaser.Scene — scena właściciel
  // barY:   y-pozycja górnej krawędzi paska (zwykle TOP_BAR_H z PlanetScene)
  constructor(scene, barY) {
    this.scene  = scene;
    this.barY   = barY;
    this._objs  = [];          // wszystkie obiekty Phaser do zniszczenia
    this._texts = {};          // klucz → { amount, capacity, perYear }
    this._shortageTimers = {}; // klucz → timeout id (dla efektu migotania)

    this._createUI();

    EventBus.on('resource:changed',  ({ resources }) => this._update(resources));
    EventBus.on('resource:shortage',  ({ resource })  => this._flashIcon(resource));
  }

  // ── Inicjalizacja ─────────────────────────────────────────────────────────

  _createUI() {
    const scene = this.scene;
    const W     = scene.cameras.main.width;
    const DEPTH = 15;
    const add   = (obj) => { this._objs.push(obj); return obj; };

    // Tło paska
    const bg = add(scene.add.graphics().setDepth(DEPTH));
    bg.fillStyle(0x060d18, 0.97);
    bg.fillRect(0, this.barY, W, RESOURCE_BAR_H);
    bg.lineStyle(1, 0x2a4060, 0.6);
    bg.lineBetween(0, this.barY + RESOURCE_BAR_H, W, this.barY + RESOURCE_BAR_H);

    // Kolumny: 4 równe sekcje
    const keys    = Object.keys(RESOURCE_DEFS);   // ['minerals','energy','organics','water']
    const colW    = W / keys.length;
    const midY    = this.barY + RESOURCE_BAR_H / 2;

    keys.forEach((key, i) => {
      const cx  = Math.round(i * colW + colW / 2);
      const def = RESOURCE_DEFS[key];
      const ico = RESOURCE_ICONS[key] ?? '?';

      // Pionowy separator (między zasobami)
      if (i > 0) {
        const sep = add(scene.add.graphics().setDepth(DEPTH));
        sep.lineStyle(1, 0x1a2a3a, 0.7);
        sep.lineBetween(Math.round(i * colW), this.barY + 4, Math.round(i * colW), this.barY + RESOURCE_BAR_H - 4);
      }

      // Etykieta — polska nazwa surowca
      add(scene.add.text(cx - 90, midY, `${ico} ${def.namePL}`, {
        fontSize: '11px', fontFamily: 'monospace', color: COL_LABEL,
      }).setOrigin(0, 0.5).setDepth(DEPTH + 1));

      // Ilość / pojemność
      const tAmt = add(scene.add.text(cx + 4, midY, '—/—', {
        fontSize: '14px', fontFamily: 'monospace', color: COL_NORMAL,
      }).setOrigin(0, 0.5).setDepth(DEPTH + 1));

      // Delta per rok
      const tDelta = add(scene.add.text(cx + 88, midY, '', {
        fontSize: '12px', fontFamily: 'monospace', color: COL_ZERO,
      }).setOrigin(0, 0.5).setDepth(DEPTH + 1));

      this._texts[key] = { tAmt, tDelta };
    });
  }

  // ── Aktualizacja wartości ─────────────────────────────────────────────────

  _update(resources) {
    for (const [key, elems] of Object.entries(this._texts)) {
      const res = resources[key];
      if (!res) continue;

      const { amount, capacity, perYear } = res;
      const ratio = capacity > 0 ? amount / capacity : 0;

      // Kolor ilości zależny od zapełnienia
      const amtColor = ratio < 0.10 ? COL_CRIT
                     : ratio < 0.25 ? COL_WARN
                     : COL_NORMAL;

      // Formatuj ilość
      const amtStr = `${_fmt(amount)}/${_fmt(capacity)}`;
      elems.tAmt.setText(amtStr).setColor(amtColor);

      // Formatuj deltę z kolorowaniem
      if (Math.abs(perYear) < 0.001) {
        elems.tDelta.setText('').setColor(COL_ZERO);
      } else {
        const sign = perYear > 0 ? '+' : '';
        elems.tDelta
          .setText(`${sign}${_fmt(perYear)}/r`)
          .setColor(perYear > 0 ? COL_POS : COL_NEG);
      }
    }
  }

  // ── Efekt migotania przy niedoborze ────────────────────────────────────────

  _flashIcon(resource) {
    const elems = this._texts[resource];
    if (!elems) return;

    // Błysk — zmień kolor ilości na jasno-czerwony i wróć
    elems.tAmt.setColor('#ff8888');
    if (this._shortageTimers[resource]) {
      clearTimeout(this._shortageTimers[resource]);
    }
    this._shortageTimers[resource] = setTimeout(() => {
      // Po 500ms wróć do normalnego koloru (następna aktualizacja go nadpisze)
      elems.tAmt.setColor(COL_CRIT);
      delete this._shortageTimers[resource];
    }, 500);
  }

  // ── Czyszczenie ───────────────────────────────────────────────────────────

  destroy() {
    for (const id of Object.values(this._shortageTimers)) clearTimeout(id);
    for (const obj of this._objs) { if (obj?.destroy) obj.destroy(); }
    this._objs  = [];
    this._texts = {};
  }
}

// ── Formatowanie liczb ────────────────────────────────────────────────────────
// < 1000 → "234"   >= 1000 → "1.2k"   >= 1 000 000 → "1.2M"
function _fmt(n) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return Number.isInteger(n) ? String(Math.round(n)) : n.toFixed(1);
}
