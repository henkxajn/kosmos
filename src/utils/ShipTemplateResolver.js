// ShipTemplateResolver — rozwiązywanie szablonu okrętu na kadłub + listę modułów
// (workstream C, Slice 1, commit S3).
//
// ZERO zależności od `window`, Three, EventBus i `Math.random` — w pełni node-testowalny
// (wzór: `WarpRoutePlanner.js`, `OpinionMath.js`, `DirectorRuleMath.js`). Stan techu wchodzi
// przez `ctx`, nigdy przez globala.
//
// Wynik sukcesu ma DOKŁADNIE kształt, którego oczekuje
// `ColonyManager.startShipBuild(planetId, hullId, moduleIds)` (`:830`), gdzie `moduleIds` to
// PŁASKA, ZWARTA tablica identyfikatorów (`:897-903` iteruje ją wprost). ⚠ To NIE jest ten sam
// kształt, co szablony gracza z `UnitDesignOverlay`, które zapisują tablicę POZYCYJNĄ z dziurami
// `null` (`:650`) — resolver nigdy nie zwraca `null` w środku listy.
//
// ── CZTERY REGUŁY KONTRAKTU (wszystkie wymuszone testem) ─────────────────────────────
//  1. KADŁUB: pierwszy z `hullTiers` ze spełnionym `requires`. Brak ⇒ `no_hull`.
//  2. MODUŁ:  w slocie pierwszy z `tiers` ze spełnionym `requires`.
//             `required: true` bez trafienia ⇒ `no_module`; `required: false` wypada.
//  3. POJEMNOŚĆ: liczba modułów ≤ pojemność kadłuba, Z POSZANOWANIEM TYPU slotu
//             (propulsion vs utility). Przy przekroczeniu odpadają sloty `required: false`,
//             OD KOŃCA. Gdy i to nie wystarcza ⇒ `no_capacity`.
//             ⚠ TO MUSI ZROBIĆ RESOLVER — nikt inny tego nie sprawdza po stronie logiki:
//             `calcShipStats` tylko sumuje (`ShipModulesData.js:690`), a oba walidatory
//             pojemności siedzą w UI edytorów i NIE ZGADZAJĄ SIĘ ZE SOBĄ (patrz niżej).
//  4. CZYSTOŚĆ I DETERMINIZM: bez `window`, bez losowości, ten sam wejściowy stan techu
//             daje ten sam wynik — także po zapisie i wczytaniu gry.
//
// ── DLACZEGO TYPY SLOTÓW, A NIE SAM LICZNIK ──────────────────────────────────────────
// W repo żyją DWA walidatory pojemności i mówią co innego:
//   • `UnitDesignOverlay` jest TYPOWANY — trzyma `_slotAssignments` dopasowane do
//     `hull.slots` i filtruje picker po typie slotu (`:368`).
//   • `FleetTabPanel` liczy TYLKO SZTUKI względem `hull.baseModuleSlots` i nie zagląda
//     w `hull.slots[].type` (`:1747-1748`) — pozwoliłby wstawić 3 silniki na kadłub
//     z jednym slotem napędowym.
// Resolver idzie za wariantem TYPOWANYM, bo tylko on odpowiada strukturze danych
// (`slots` to tablica gniazd, nie licznik). Rozjazd obu UI jest osobnym długiem
// i świadomie NIE jest tu naprawiany.

import { HULLS } from '../data/HullsData.js';
import { SHIP_MODULES, UTILITY_SLOT_TYPES } from '../data/ShipModulesData.js';
import { SHIP_TEMPLATES, TEMPLATE_ROLES } from '../data/ShipTemplateData.js';

/** Powody niepowodzenia. Rozszerzenie = wpis TUTAJ + gałąź + test. */
export const RESOLVE_REASONS = Object.freeze({
  UNKNOWN_TEMPLATE: 'unknown_template',
  NO_HULL:          'no_hull',
  NO_MODULE:        'no_module',
  NO_CAPACITY:      'no_capacity',
});

// ── Normalizacja źródła techu ───────────────────────────────────────────────

/**
 * Sprowadza `ctx` do jednego predykatu `(techId) => boolean`.
 *
 * ⚠ GŁOŚNA AWARIA (audyt R12). Brak źródła techu RZUCA, zamiast udawać „nic nie zbadane".
 * Cichy fallback byłby tu najgorszym z możliwych: KAŻDY szablon zwracałby wtedy `no_hull`,
 * czyli reguła Directora „nie odpaliła" wyglądałaby identycznie jak reguła, której nikt
 * nie podłączył. Dokładnie tym mechanizmem `EconAI`/`MilitaryAI` przetrwały jako ciche zera.
 *
 * @param {{ isResearched?: Function, techSystem?: { isResearched?: Function } }} ctx
 * @returns {(techId: string|null|undefined) => boolean}
 */
function _techPredicate(ctx) {
  if (typeof ctx?.isResearched === 'function') {
    return (tech) => !tech || ctx.isResearched(tech) === true;
  }
  if (typeof ctx?.techSystem?.isResearched === 'function') {
    return (tech) => !tech || ctx.techSystem.isResearched(tech) === true;
  }
  throw new Error(
    '[ShipTemplateResolver] ctx musi nieść `isResearched(techId)` albo `techSystem.isResearched` — ' +
    'brak źródła techu nie może zdegradować do „nic nie zbadane"',
  );
}

// ── Pojemność kadłuba ───────────────────────────────────────────────────────

/**
 * Pojemność kadłuba w rozbiciu na typy gniazd, liczona z `hull.slots`.
 * Lustro `getSlotCounts` (`HullsData.js:291`), ale bez zależności od id — bierze definicję.
 *
 * @param {object} hullDef
 * @returns {{ propulsion: number, utility: number }}
 */
export function hullCapacity(hullDef) {
  let propulsion = 0, utility = 0;
  for (const s of hullDef?.slots ?? []) {
    if (s?.type === 'propulsion') propulsion++;
    else utility++;
  }
  return { propulsion, utility };
}

/** Do którego wiadra pojemności trafia moduł: 'propulsion' albo 'utility'. */
export function moduleBucket(moduleId) {
  const mod = SHIP_MODULES[moduleId];
  if (!mod) return null;
  if (mod.slotType === 'propulsion') return 'propulsion';
  return UTILITY_SLOT_TYPES.has(mod.slotType) ? 'utility' : null;
}

// ── Nadpisania per archetyp ─────────────────────────────────────────────────

/**
 * Scala `archetypeOverrides[archetype]` PER KLUCZ (wzór `_logisticsConfig`,
 * `EmpireLogisticsSystem.js:111-113`) — nadpisany zostaje wyłącznie podany klucz,
 * reszta szablonu bazowego przechodzi bez zmian.
 */
function _applyArchetype(tpl, archetype) {
  const ov = archetype ? tpl.archetypeOverrides?.[archetype] : null;
  if (!ov) return tpl;
  return { ...tpl, ...ov, archetypeOverrides: tpl.archetypeOverrides };
}

// ── Rozwiązywanie ───────────────────────────────────────────────────────────

/**
 * Rozwiąż szablon na konkretny kadłub i listę modułów.
 *
 * @param {string} templateId
 * @param {{
 *   isResearched?: (techId: string) => boolean,
 *   techSystem?:   { isResearched: (techId: string) => boolean },
 *   archetype?:    string|null,
 *   catalog?:      Record<string, object>,
 * }} ctx
 * @returns {{ ok: true,  templateId: string, hullId: string, modules: string[], dropped: object[] }
 *          |{ ok: false, templateId: string, reason: string, detail?: object }}
 */
export function resolveTemplate(templateId, ctx = {}) {
  const catalog = ctx.catalog ?? SHIP_TEMPLATES;
  const base = catalog?.[templateId];
  if (!base) {
    return { ok: false, templateId, reason: RESOLVE_REASONS.UNKNOWN_TEMPLATE };
  }
  const has = _techPredicate(ctx);
  const tpl = _applyArchetype(base, ctx.archetype);

  // ── 1. Kadłub: pierwszy spełniony. Brak ⇒ no_hull (NIGDY cichy fallback na cokolwiek).
  let hullId = null;
  for (const id of tpl.hullTiers ?? []) {
    const def = HULLS[id];
    if (def && has(def.requires)) { hullId = id; break; }
  }
  if (!hullId) {
    return {
      ok: false, templateId, reason: RESOLVE_REASONS.NO_HULL,
      detail: { tried: [...(tpl.hullTiers ?? [])] },
    };
  }

  // ── 2. Moduły: w każdym slocie pierwszy spełniony z drabinki.
  const picks = [];                       // { moduleId, required, slotIndex, bucket }
  const dropped = [];                     // { slotIndex, reason, tiers }
  const slotDefs = tpl.slots ?? [];
  for (let i = 0; i < slotDefs.length; i++) {
    const slot = slotDefs[i];
    const required = slot?.required !== false;   // domyślnie WYMAGANY
    let chosen = null;
    for (const mId of slot?.tiers ?? []) {
      const mod = SHIP_MODULES[mId];
      if (mod && has(mod.requires)) { chosen = mId; break; }
    }
    if (!chosen) {
      if (required) {
        return {
          ok: false, templateId, reason: RESOLVE_REASONS.NO_MODULE,
          detail: { hullId, slotIndex: i, tried: [...(slot?.tiers ?? [])] },
        };
      }
      dropped.push({ slotIndex: i, reason: RESOLVE_REASONS.NO_MODULE, tiers: [...(slot?.tiers ?? [])] });
      continue;
    }
    picks.push({ moduleId: chosen, required, slotIndex: i, bucket: moduleBucket(chosen) });
  }

  // ── 3. Pojemność, z poszanowaniem typu gniazda.
  const cap = hullCapacity(HULLS[hullId]);
  const over = () => ({
    propulsion: picks.filter((p) => p.bucket === 'propulsion').length - cap.propulsion,
    utility:    picks.filter((p) => p.bucket === 'utility').length    - cap.utility,
  });

  for (;;) {
    const o = over();
    const bucket = o.propulsion > 0 ? 'propulsion' : (o.utility > 0 ? 'utility' : null);
    if (!bucket) break;
    // Odpada OSTATNI opcjonalny slot w przepełnionym wiadrze (kontrakt: „od końca").
    let victim = -1;
    for (let i = picks.length - 1; i >= 0; i--) {
      if (!picks[i].required && picks[i].bucket === bucket) { victim = i; break; }
    }
    if (victim < 0) {
      // Same wymagane — nie ma czego poświęcić. Honest failure zamiast cichego obcięcia.
      return {
        ok: false, templateId, reason: RESOLVE_REASONS.NO_CAPACITY,
        detail: {
          hullId, capacity: cap,
          need: {
            propulsion: picks.filter((p) => p.bucket === 'propulsion').length,
            utility:    picks.filter((p) => p.bucket === 'utility').length,
          },
        },
      };
    }
    const [gone] = picks.splice(victim, 1);
    dropped.push({ slotIndex: gone.slotIndex, reason: RESOLVE_REASONS.NO_CAPACITY, moduleId: gone.moduleId });
  }

  return {
    ok: true,
    templateId,
    hullId,
    modules: picks.map((p) => p.moduleId),   // ZWARTA lista — bez dziur `null`
    dropped,
  };
}

// ── Walidacja katalogu (kształt) ────────────────────────────────────────────

/**
 * Sprawdza KSZTAŁT jednego wpisu. Zwraca listę problemów (pusta = wpis poprawny).
 * Celowo NIE sprawdza techu ani pojemności — to zależy od stanu gry, a kształt nie.
 */
export function validateTemplate(tpl, key) {
  const p = [];
  if (!tpl || typeof tpl !== 'object') return ['wpis nie jest obiektem'];
  if (tpl.id !== key) p.push(`id "${tpl.id}" ≠ klucz "${key}"`);
  if (!TEMPLATE_ROLES.includes(tpl.role)) p.push(`nieznana rola "${tpl.role}"`);
  if (!tpl.namePL || !tpl.nameEN) p.push('brak namePL/nameEN (zasada dwujęzyczności)');

  if (!Array.isArray(tpl.hullTiers) || tpl.hullTiers.length === 0) {
    p.push('hullTiers musi być niepustą tablicą');
  } else {
    for (const h of tpl.hullTiers) if (!HULLS[h]) p.push(`nieznany kadłub "${h}"`);
  }

  if (!Array.isArray(tpl.slots) || tpl.slots.length === 0) {
    p.push('slots musi być niepustą tablicą');
  } else {
    tpl.slots.forEach((s, i) => {
      if (!Array.isArray(s?.tiers) || s.tiers.length === 0) {
        p.push(`slot ${i}: tiers musi być niepustą tablicą`);
        return;
      }
      for (const m of s.tiers) {
        if (!SHIP_MODULES[m]) p.push(`slot ${i}: nieznany moduł "${m}"`);
        else if (moduleBucket(m) === null) p.push(`slot ${i}: moduł "${m}" ma slotType spoza propulsion/utility`);
      }
    });
  }
  return p;
}

/** Waliduje CAŁY katalog. Zwraca `{ [key]: string[] }` — pusty obiekt = wszystko OK. */
export function validateTemplateCatalog(catalog = SHIP_TEMPLATES) {
  const out = {};
  for (const [key, tpl] of Object.entries(catalog ?? {})) {
    const problems = validateTemplate(tpl, key);
    if (problems.length) out[key] = problems;
  }
  return out;
}
