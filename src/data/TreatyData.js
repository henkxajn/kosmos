// TreatyData — definicje typów traktatów dyplomatycznych (S3.4 Light Diplomacy)
//
// Dane oddzielone od logiki (CLAUDE.md zasada 1). Logika obsługi — DiplomacySystem
// (proposeTreaty / _tickTreaties / hasTreaty). Traktaty przechowywane są w
// relacji: gameState.diplomacy.relations[key].treaties[] jako { id, signedYear }.
//
// Pola:
//   minTrust    — próg trust dla dostępności propozycji w DiplomacyOverlay
//   yearlyTrust — przyrost trust/rok gdy traktat aktywny (_tickTreaties)
//   accept      — heurystyka akceptacji AI (personality × trust)
//   blocksWar   — (non_aggression) AI nie wypowie wojny gdy aktywny

export const TREATY_TYPES = {
  trade_agreement: {
    id:          'trade_agreement',
    namePL:      'Umowa Handlowa',
    nameEN:      'Trade Agreement',
    minTrust:    65,    // Przyjazny
    yearlyTrust: 1,     // BUG2a — +1 trust/rok gdy aktywna (było 2)
    // AI akceptuje gdy personality.trade >= 0.5 AND trust >= 60
    accept:      { trade: 0.5, trust: 60 },
    descPL:      'Otwiera wymianę towarów z imperium (hook S3.5). +1 zaufania/rok.',
    descEN:      'Opens commodity trade with the empire (S3.5 hook). +1 trust/yr.',
  },
  non_aggression: {
    id:          'non_aggression',
    namePL:      'Pakt o Nieagresji',
    nameEN:      'Non-Aggression Pact',
    minTrust:    80,
    yearlyTrust: 0,     // BUG2a — bez bonusu zaufania (pakt tylko blokuje wojnę)
    blocksWar:   true,  // AI nie wypowie wojny gdy aktywny
    // AI akceptuje gdy personality.aggression <= 0.4 AND trust >= 75
    accept:      { aggressionMax: 0.4, trust: 75 },
    descPL:      'Imperium nie wypowie wojny dopóki pakt obowiązuje. Bez bonusu zaufania.',
    descEN:      'The empire will not declare war while the pact holds. No trust bonus.',
  },
  // BUG5 — Sojusz (pełny). Status „Sojusznik" TYLKO gdy ten traktat aktywny.
  alliance: {
    id:          'alliance',
    namePL:      'Sojusz',
    nameEN:      'Alliance',
    minTrust:    80,
    yearlyTrust: 0,
    // AI akceptuje gdy personality.aggression <= 0.3 AND trust >= 80
    accept:      { aggressionMax: 0.3, trust: 80 },
    descPL:      'Pełny sojusz wojskowy. Nadaje status „Sojusznik".',
    descEN:      'Full military alliance. Grants "Ally" status.',
  },
};
