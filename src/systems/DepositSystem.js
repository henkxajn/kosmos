// DepositSystem — generacja złóż z composition, wydobycie, deplecja
//
// Każde ciało niebieskie (planeta, księżyc, planetoida, asteroida) dostaje tablicę deposits[]:
//   { resourceId, richness, totalAmount, remaining }
//
// Generacja: z entity.composition — dla każdego z 10 surowców:
//   Próg pojawienia = rarity × 3% (rarity 1 → 3%, rarity 5 → 15%)
//   Jeśli composition[element] > próg → twórz złoże
//   richness = (composition% − próg) / 20, clamp 0.1–1.0
//   totalAmount = richness × 10000 × (1 + rand × 0.5)
//   Neutronium: max 1–2 ciała w systemie (extreme rarity)
//
// Wydobycie: Kopalnia kopie WSZYSTKIE złoża na ciele proporcjonalnie:
//   Output/rok = level × BASE_MINE_RATE × richness × (remaining / total)
//   Gdy remaining → 0: złoże wyczerpane

import { MINED_RESOURCES, BASE_MINE_RATE } from '../data/ResourcesData.js';
import { ELEMENT_TO_RESOURCE } from '../data/ElementsData.js';

// ── Prosta funkcja PRNG (deterministyczna z seed) ──────────────────────────
function seededRandom(seed) {
  let s = seed;
  return function() {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export class DepositSystem {
  constructor() {
    // Licznik neutronium w systemie (max 2 ciała z Nt)
    this._neutroniumCount = 0;
  }

  // ── Generacja złóż dla ciała niebieskiego ────────────────────────────────
  // entity: CelestialBody z composition
  // Zwraca tablicę deposits[] i przypisuje ją do entity.deposits
  generateDeposits(entity) {
    if (!entity.composition) {
      entity.deposits = [];
      return entity.deposits;
    }

    const deposits = [];
    // Deterministyczny PRNG z entity.id
    const seed = typeof entity.id === 'string'
      ? entity.id.split('').reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 0)
      : entity.id;
    const rand = seededRandom(seed);

    for (const [element, resourceId] of Object.entries(ELEMENT_TO_RESOURCE)) {
      const resDef = MINED_RESOURCES[resourceId];
      if (!resDef) continue;

      const compositionPct = entity.composition[element] || 0;
      const threshold = resDef.rarity * 3; // % progu pojawienia

      if (compositionPct <= threshold) continue;

      // Neutronium: limit 2 ciała w systemie
      if (resourceId === 'Nt') {
        if (this._neutroniumCount >= 2) continue;
        this._neutroniumCount++;
      }

      const richness = Math.min(1.0, Math.max(0.1, (compositionPct - threshold) / 20));
      const totalAmount = Math.round(richness * 10000 * (1 + rand() * 0.5));

      deposits.push({
        resourceId,
        richness,
        totalAmount,
        remaining: totalAmount,
      });
    }

    entity.deposits = deposits;
    return deposits;
  }

  // ── Wydobycie z jednej kopalni (wywoływane per tick) ──────────────────────
  // deposits: tablica złóż ciała niebieskiego
  // mineLevel: poziom kopalni (1–10)
  // deltaYears: czas w latach gry
  // Zwraca: Map<resourceId, ilość wydobyta>
  static extractFromDeposits(deposits, mineLevel, deltaYears) {
    const extracted = new Map();
    if (!deposits || deposits.length === 0) return extracted;

    for (const dep of deposits) {
      if (dep.remaining <= 0) continue;

      // Output/rok = level × BASE_MINE_RATE × richness × (remaining / total)
      const depletion = dep.remaining / dep.totalAmount; // 1.0 → 0.0
      const outputPerYear = mineLevel * BASE_MINE_RATE * dep.richness * depletion;
      const amount = outputPerYear * deltaYears;

      // Nie wydobywaj więcej niż remaining
      const actual = Math.min(amount, dep.remaining);
      dep.remaining = Math.max(0, dep.remaining - actual);

      if (actual > 0) {
        extracted.set(dep.resourceId, (extracted.get(dep.resourceId) || 0) + actual);
      }
    }

    return extracted;
  }

  // ── Info: podsumowanie złóż ciała (do UI) ────────────────────────────────
  static getDepositsSummary(deposits) {
    if (!deposits || deposits.length === 0) return [];
    return deposits.map(dep => {
      const resDef = MINED_RESOURCES[dep.resourceId];
      const pctRemaining = dep.totalAmount > 0
        ? Math.round(dep.remaining / dep.totalAmount * 100)
        : 0;
      return {
        resourceId:   dep.resourceId,
        namePL:       resDef?.namePL ?? dep.resourceId,
        icon:         resDef?.icon ?? '?',
        richness:     dep.richness,
        remaining:    Math.round(dep.remaining),
        totalAmount:  dep.totalAmount,
        pctRemaining,
        depleted:     dep.remaining <= 0,
      };
    });
  }

  // ── Serializacja ─────────────────────────────────────────────────────────
  static serializeDeposits(deposits) {
    if (!deposits) return [];
    return deposits.map(d => ({
      resourceId:  d.resourceId,
      richness:    d.richness,
      totalAmount: d.totalAmount,
      remaining:   d.remaining,
    }));
  }

  static restoreDeposits(data) {
    if (!data) return [];
    return data.map(d => ({
      resourceId:  d.resourceId,
      richness:    d.richness    ?? 0.5,
      totalAmount: d.totalAmount ?? 5000,
      remaining:   d.remaining   ?? d.totalAmount ?? 5000,
    }));
  }

  // ── Reset licznika neutronium (przed generacją nowego systemu) ───────────
  resetNeutroniumCount() {
    this._neutroniumCount = 0;
  }
}
