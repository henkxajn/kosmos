// ElementsData — definicje 20 pierwiastków i 20 minerałów
// Używane przez CompositionSystem, Planet, SystemGenerator, LifeSystem
//
// Pierwiastki: frakcje procentowe w składzie planety (suma = 100%)
// Minerały:    pochodne pierwiastków, wyświetlane w opisie planety

// ── 20 Pierwiastków ──────────────────────────────────────────────
// id:       klucz w planet.composition
// symbol:   symbol chemiczny
// nazwaEN:  angielska nazwa
// nazwaPL:  polska nazwa
// kat:      kategoria (metal|skala|gaz|organiczny|radioaktywny|rzadki|gazSzlachetny)
// zycie:    wpływ na potencjał życia (0=brak, 1=pośredni, 2=ważny, 3=kluczowy)
export const ELEMENTS = {
  Fe:  { symbol: 'Fe',  nazwaPL: 'Żelazo',   kat: 'metal',         zycie: 0 },
  Si:  { symbol: 'Si',  nazwaPL: 'Krzem',     kat: 'skala',         zycie: 0 },
  O:   { symbol: 'O',   nazwaPL: 'Tlen',      kat: 'gaz',           zycie: 2 },
  Mg:  { symbol: 'Mg',  nazwaPL: 'Magnez',    kat: 'metal',         zycie: 0 },
  S:   { symbol: 'S',   nazwaPL: 'Siarka',    kat: 'lotny',         zycie: 1 },
  Ni:  { symbol: 'Ni',  nazwaPL: 'Nikiel',    kat: 'metal',         zycie: 0 },
  Ca:  { symbol: 'Ca',  nazwaPL: 'Wapń',      kat: 'metal',         zycie: 1 },
  Al:  { symbol: 'Al',  nazwaPL: 'Glin',      kat: 'metal',         zycie: 0 },
  C:   { symbol: 'C',   nazwaPL: 'Węgiel',    kat: 'organiczny',    zycie: 3 },
  H:   { symbol: 'H',   nazwaPL: 'Wodór',     kat: 'gaz',           zycie: 2 },
  N:   { symbol: 'N',   nazwaPL: 'Azot',      kat: 'gaz',           zycie: 2 },
  P:   { symbol: 'P',   nazwaPL: 'Fosfor',    kat: 'organiczny',    zycie: 3 },
  H2O: { symbol: 'H₂O', nazwaPL: 'Woda',      kat: 'ciecz',         zycie: 3 },
  K:   { symbol: 'K',   nazwaPL: 'Potas',     kat: 'radioaktywny',  zycie: 1 },
  Na:  { symbol: 'Na',  nazwaPL: 'Sód',       kat: 'metal',         zycie: 1 },
  Ti:  { symbol: 'Ti',  nazwaPL: 'Tytan',     kat: 'metal',         zycie: 0 },
  U:   { symbol: 'U',   nazwaPL: 'Uran',      kat: 'radioaktywny',  zycie: 0 },
  Au:  { symbol: 'Au',  nazwaPL: 'Złoto',     kat: 'rzadki',        zycie: 0 },
  Pt:  { symbol: 'Pt',  nazwaPL: 'Platyna',   kat: 'rzadki',        zycie: 0 },
  He:  { symbol: 'He',  nazwaPL: 'Hel',       kat: 'gazSzlachetny', zycie: 0 },
};

// ── 20 Minerałów ─────────────────────────────────────────────────
// id:       unikalny klucz
// nazwaPL:  polska nazwa
// formula:  wzór / opis
// skladniki:pierwiastki potrzebne do powstania (tablica kluczy)
// planety:  typy planet gdzie występuje najczęściej
export const MINERALS = [
  { id: 'hematyt',       nazwaPL: 'Hematyt',        formula: 'Fe₂O₃',         skladniki: ['Fe', 'O'],         planety: ['hot_rocky', 'rocky'] },
  { id: 'magnetyt',      nazwaPL: 'Magnetyt',        formula: 'Fe₃O₄',         skladniki: ['Fe', 'O'],         planety: ['rocky'] },
  { id: 'kwarc',         nazwaPL: 'Kwarc',           formula: 'SiO₂',          skladniki: ['Si', 'O'],         planety: ['rocky', 'ice'] },
  { id: 'oliwin',        nazwaPL: 'Oliwin',          formula: '(Mg,Fe)₂SiO₄',  skladniki: ['Fe', 'Mg', 'Si'], planety: ['rocky'] },
  { id: 'pirokseny',     nazwaPL: 'Pirokseny',       formula: 'CaMgSi₂O₆',     skladniki: ['Ca', 'Mg', 'Si'], planety: ['rocky'] },
  { id: 'skalenie',      nazwaPL: 'Skalenie',        formula: 'KAlSi₃O₈',      skladniki: ['Al', 'Ca', 'Si'], planety: ['rocky'] },
  { id: 'kalcyt',        nazwaPL: 'Kalcyt',          formula: 'CaCO₃',         skladniki: ['Ca', 'C', 'O'],   planety: ['rocky'] },
  { id: 'grafit',        nazwaPL: 'Grafit',          formula: 'C',             skladniki: ['C'],              planety: ['rocky', 'ice'] },
  { id: 'diament',       nazwaPL: 'Diament',         formula: 'C (p>10 GPa)',  skladniki: ['C'],              planety: ['gas'] },
  { id: 'piryt',         nazwaPL: 'Piryt',           formula: 'FeS₂',          skladniki: ['Fe', 'S'],        planety: ['hot_rocky'] },
  { id: 'siarka',        nazwaPL: 'Siarka elementarna', formula: 'S₈',         skladniki: ['S'],              planety: ['hot_rocky'] },
  { id: 'ilmenit',       nazwaPL: 'Ilmenit',         formula: 'FeTiO₃',        skladniki: ['Fe', 'Ti', 'O'],  planety: ['rocky'] },
  { id: 'rutyl',         nazwaPL: 'Rutyl',           formula: 'TiO₂',          skladniki: ['Ti', 'O'],        planety: ['rocky'] },
  { id: 'uraninit',      nazwaPL: 'Uraninit',        formula: 'UO₂',           skladniki: ['U', 'O'],         planety: ['rocky'] },
  { id: 'halit',         nazwaPL: 'Halit (sól)',     formula: 'NaCl',          skladniki: ['Na', 'S'],        planety: ['rocky'] },
  { id: 'lodWodny',      nazwaPL: 'Lód wodny',       formula: 'H₂O (s)',       skladniki: ['H2O'],            planety: ['ice', 'rocky'] },
  { id: 'metanLod',      nazwaPL: 'Lód metanowy',    formula: 'CH₄ (s)',       skladniki: ['C', 'H'],         planety: ['ice'] },
  { id: 'amoniakLod',    nazwaPL: 'Lód amoniakalny', formula: 'NH₃ (s)',       skladniki: ['N', 'H'],         planety: ['ice'] },
  { id: 'glinokrzemiany',nazwaPL: 'Glinokrzemiany',  formula: 'Al₂Si₂O₇',      skladniki: ['Al', 'Si'],       planety: ['rocky'] },
  { id: 'zloto',         nazwaPL: 'Złoto rodzime',   formula: 'Au',            skladniki: ['Au'],             planety: ['rocky', 'hot_rocky'] },
];

// ── Domyślne składy wg typu planety (%) ─────────────────────────
// Wartości muszą sumować się do 100 (lub bliskie 100 — normalizowane przy zapisie)
export const PLANET_COMPOSITIONS = {

  // Merkury-podobne: bogate w żelazo, prawie bez wody i organiki
  hot_rocky: {
    Fe: 35, Si: 22, O: 18, Ni: 10, S: 6, Mg: 5, Ti: 2, Au: 0.8, Pt: 0.5, Ca: 0.7,
    C: 0, H: 0, H2O: 0, N: 0, P: 0, Al: 0, K: 0, Na: 0, U: 0, He: 0,
  },

  // Ziemia-podobne (strefa HZ): różnorodne, z wodą i pierwiastkami biogennymi
  rocky: {
    Fe: 24, Si: 24, O: 27, Mg: 8, Ca: 3, Al: 3,
    H2O: 2.5, C: 1.5, N: 0.8, P: 0.3, H: 1.0, S: 0.9,
    K: 0.3, Na: 0.4, Ni: 0.5, U: 0.1, Ti: 0.2, Au: 0.1, Pt: 0.05, He: 0,
  },

  // Zimne, lodowate skaliste (za strefą HZ): bogaty w lód wodny i organikę
  rocky_cold: {
    Fe: 14, Si: 14, O: 14, Mg: 6,
    H2O: 28, C: 8, N: 7, H: 5,
    Ca: 1.5, S: 1.2, P: 0.5, Al: 0.3, K: 0.1, Na: 0.1, Ni: 0.1, U: 0.05, Ti: 0.05, Au: 0, Pt: 0, He: 0,
  },

  // Gazowe olbrzymy: głównie wodór i hel
  gas: {
    H: 62, He: 28, C: 4, N: 3, O: 2, S: 0.6,
    Fe: 0.15, Si: 0.15, Mg: 0.05, Ni: 0.05,
    H2O: 0, P: 0, Ca: 0, Al: 0, K: 0, Na: 0, U: 0, Ti: 0, Au: 0, Pt: 0,
  },

  // Lodowe: woda, azot, węgiel dominują
  ice: {
    H2O: 50, N: 17, C: 12, H: 9,
    Si: 4, Fe: 3.5, Mg: 2, S: 1.2, P: 0.5, O: 0.5,
    Ca: 0.1, Al: 0.1, Ni: 0.05, U: 0, Ti: 0.05, K: 0, Na: 0, He: 0, Au: 0, Pt: 0,
  },
};

// ── Skład kometarny (transfer przez bombardowanie) ───────────────
// Bogaty w H₂O, C, N, P — kluczowe dla powstawania życia
export const COMET_COMPOSITION = {
  H2O: 40, C: 22, N: 14, O: 10, Si: 4, Fe: 3, S: 3, P: 2.5, H: 1.5,
  Mg: 0, Ca: 0, Al: 0, K: 0, Na: 0, Ni: 0, Ti: 0, U: 0, Au: 0, Pt: 0, He: 0,
};

// ── Pomocnik: normalizuj skład do 100% ───────────────────────────
export function normalizeComposition(comp) {
  const total = Object.values(comp).reduce((s, v) => s + Math.max(0, v), 0);
  if (total <= 0) return comp;
  const factor = 100 / total;
  const result = {};
  for (const [k, v] of Object.entries(comp)) {
    result[k] = Math.max(0, v) * factor;
  }
  return result;
}

// ── Pomocnik: utwórz pusty skład (wszystkie 0) ───────────────────
export function emptyComposition() {
  const comp = {};
  for (const id of Object.keys(ELEMENTS)) comp[id] = 0;
  return comp;
}

// ── Pomocnik: sklonuj i zmiksuj dwa składy (ważona średnia) ─────
// weight1 = masa1 / (masa1 + masa2)
export function mergeCompositions(comp1, comp2, weight1) {
  const weight2 = 1 - weight1;
  const result  = {};
  const keys = new Set([...Object.keys(comp1), ...Object.keys(comp2)]);
  for (const k of keys) {
    result[k] = (comp1[k] || 0) * weight1 + (comp2[k] || 0) * weight2;
  }
  return result;
}

// ── Pomocnik: dopasuj szablon składu wg typu i odległości od HZ ──
export function getCompositionTemplate(planetType, orbitalA, hz) {
  if (planetType === 'gas')      return { ...PLANET_COMPOSITIONS.gas };
  if (planetType === 'ice')      return { ...PLANET_COMPOSITIONS.ice };
  if (planetType === 'hot_rocky') return { ...PLANET_COMPOSITIONS.hot_rocky };
  // Skalna: sprawdź czy w HZ czy poza
  if (hz && orbitalA <= hz.max * 1.3) return { ...PLANET_COMPOSITIONS.rocky };
  return { ...PLANET_COMPOSITIONS.rocky_cold };
}

// ── Pomocnik: oblicz bonus do potencjału życia z pierwiastków ────
// Zwraca 0.0–0.15 (dodatkowy bonus poza standardowym potencjałem)
export function lifeBonus(composition) {
  if (!composition) return 0;
  const water  = composition.H2O || 0;
  const carbon = composition.C   || 0;
  const phos   = composition.P   || 0;

  // Warunki minimalne: woda>5%, węgiel>2%, fosfor>0.1%
  if (water < 5 || carbon < 2 || phos < 0.1) return 0;

  // Bonus rośnie z zawartością kluczowych pierwiastków (max 0.15)
  const waterBonus  = Math.min(water  / 50, 0.5);   // max 0.5 przy 50% wody
  const carbonBonus = Math.min(carbon / 20, 0.5);   // max 0.5 przy 20% węgla
  const phosBonus   = Math.min(phos   /  5, 1.0);   // max 1.0 przy 5% fosforu

  return (waterBonus + carbonBonus + phosBonus) / 3 * 0.15;
}
