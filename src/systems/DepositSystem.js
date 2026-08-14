// DepositSystem — generacja złóż z composition, wydobycie, deplecja
//
// Każde ciało niebieskie (planeta, księżyc, planetoida, asteroida) dostaje tablicę deposits[]:
//   { resourceId, richness, totalAmount, remaining }
//
// Generacja: z entity.composition — dla każdego z 10 surowców:
//   Próg pojawienia zależy od rarity:
//     rarity 1–2: 0.01% (gwarantowane gdy obecny w składzie)
//     rarity 3:   0.05% (potrzebny ślad)
//     rarity 4:   0.1%  (potrzebna mała ilość)
//     rarity 5:   2.0%  (naprawdę rzadkie — Xe, Nt)
//   Jeśli composition[element] > próg → twórz złoże
//   richness = composition% / (rarity × 2), clamp 0.1–1.0
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

// Progi pojawienia złoża wg rarity (indeks = rarity)
// Niski rarity = łatwo dostępne, wysoki = naprawdę rzadkie
const RARITY_THRESHOLDS = [0, 0.01, 0.01, 0.05, 0.1, 2.0];

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
      const threshold = RARITY_THRESHOLDS[resDef.rarity] ?? (resDef.rarity * 3);

      if (compositionPct <= threshold) continue;

      // Neutronium: limit 2 ciała w systemie
      if (resourceId === 'Nt') {
        if (this._neutroniumCount >= 2) continue;
        this._neutroniumCount++;
      }

      // Zasobność: proporcjonalna do composition / rarity
      // Fe(r1) 22% → 1.0, Cu(r2) 1.8% → 0.45, Ti(r3) 0.2% → 0.1
      const richness = Math.min(1.0, Math.max(0.1, compositionPct / (resDef.rarity * 2)));
      // Boosted scenario: ×10 zasobów na ciałach niebieskich
      const depositMult = window.KOSMOS?.scenario === 'civilization_boosted' ? 10 : 1;
      const totalAmount = Math.round(richness * 10000 * depositMult * (1 + rand() * 0.5));

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

  // ── Backfill pojedynczego złoża (migracja entity-level, S3.0a b) ──────────
  // Dodaje złoże resourceId do ISTNIEJĄCEGO ciała (ma już deposits, ale bez tego surowca).
  // Reuse formuły z generateDeposits. Idempotent: skip gdy złoże już jest lub próg niespełniony.
  // Świeży seed (parytet z new-game niedokładny — backfill starych save, nie wymaga bit-parytetu).
  ensureResourceDeposit(entity, resourceId) {
    if (!entity?.composition) return false;
    if (entity.deposits?.some(d => d.resourceId === resourceId)) return false;
    const element = Object.keys(ELEMENT_TO_RESOURCE).find(e => ELEMENT_TO_RESOURCE[e] === resourceId);
    const resDef = MINED_RESOURCES[resourceId];
    if (!element || !resDef) return false;
    const compositionPct = entity.composition[element] || 0;
    const threshold = RARITY_THRESHOLDS[resDef.rarity] ?? (resDef.rarity * 3);
    if (compositionPct <= threshold) return false;
    const seed = typeof entity.id === 'string'
      ? entity.id.split('').reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 0)
      : entity.id;
    const rand = seededRandom(seed);
    const richness = Math.min(1.0, Math.max(0.1, compositionPct / (resDef.rarity * 2)));
    const depositMult = window.KOSMOS?.scenario === 'civilization_boosted' ? 10 : 1;
    const totalAmount = Math.round(richness * 10000 * depositMult * (1 + rand() * 0.5));
    if (!entity.deposits) entity.deposits = [];
    entity.deposits.push({ resourceId, richness, totalAmount, remaining: totalAmount });
    return true;
  }

  // ── Gwarantowane złoże startowe (W2-1b, orzeczenie właściciela 2026-08-15) ───────────────
  //
  // NADAJE złoże NIEZALEŻNIE od `composition` — i to jest cała różnica wobec
  // `ensureResourceDeposit`, które respektuje próg rarity i dlatego NIE POMOŻE ciału, które
  // po prostu nie ma danego pierwiastka. To nie jest backfill, tylko HANDICAP STARTOWY tej
  // samej klasy co żeton stacji (R-3), darmowe budynki i `startingTechs`: warunki, których
  // AI nie umie sobie samo zapewnić, przyznane przy narodzinach.
  //
  // Idempotentne (drugie wywołanie nic nie zmienia) i w PEŁNI deterministyczne — zero PRNG,
  // więc GALAXY_SEED nie jest konsumowany i baseline'y BALANS zostają bit w bit.
  // Podnosi ISTNIEJĄCE złoże do minimum zamiast dokładać drugie: `mineDeposits` kopie
  // wszystkie złoża ciała proporcjonalnie, więc duplikat rozjechałby stawkę wydobycia.
  //
  // @returns {'created'|'raised'|'unchanged'}
  ensureMinimumDeposit(entity, resourceId, minTotal, minRichness) {
    if (!entity || !resourceId || !(minTotal > 0)) return 'unchanged';
    if (!Array.isArray(entity.deposits)) entity.deposits = [];

    const existing = entity.deposits.find(d => d.resourceId === resourceId);
    if (!existing) {
      entity.deposits.push({
        resourceId,
        richness:    minRichness,
        totalAmount: minTotal,
        remaining:   minTotal,
      });
      return 'created';
    }

    // Złoże jest, ale ubogie — podnieś OBA wymiary. `remaining` rośnie o dokładnie tyle,
    // o ile rośnie `totalAmount`, żeby zachować stosunek wyczerpania (mnożnik `remaining/total`
    // w `mineDeposits` opisuje ZUŻYCIE złoża — dosypanie nie może udawać, że go nie było).
    let changed = false;
    if (existing.totalAmount < minTotal) {
      const delta = minTotal - existing.totalAmount;
      existing.totalAmount = minTotal;
      existing.remaining   = (existing.remaining ?? 0) + delta;
      changed = true;
    }
    if ((existing.richness ?? 0) < minRichness) { existing.richness = minRichness; changed = true; }
    return changed ? 'raised' : 'unchanged';
  }

  // ── Wydobycie z jednej kopalni (wywoływane per tick) ──────────────────────
  // deposits: tablica złóż ciała niebieskiego
  // mineLevel: poziom kopalni (1–10)
  // deltaYears: czas w latach gry
  // Zwraca: plain object { resourceId: ilość } (bez alokacji Map)
  static extractFromDeposits(deposits, mineLevel, deltaYears) {
    if (!deposits || deposits.length === 0) return null;

    let extracted = null;

    for (const dep of deposits) {
      if (dep.remaining <= 0) continue;

      // Output/rok = level × BASE_MINE_RATE × richness × (remaining / total)
      const depletion = dep.remaining / dep.totalAmount; // 1.0 → 0.0
      // Boosted scenario: ×5 wydobycia w kopalniach
      const rateMult = window.KOSMOS?.scenario === 'civilization_boosted' ? 5 : 1;
      const outputPerYear = mineLevel * BASE_MINE_RATE * rateMult * dep.richness * depletion;
      const amount = outputPerYear * deltaYears;

      // Nie wydobywaj więcej niż remaining
      const actual = Math.min(amount, dep.remaining);
      dep.remaining = Math.max(0, dep.remaining - actual);

      if (actual > 0) {
        if (!extracted) extracted = {};
        extracted[dep.resourceId] = (extracted[dep.resourceId] || 0) + actual;
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
