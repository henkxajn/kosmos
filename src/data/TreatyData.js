// TreatyData — definicje typów traktatów dyplomatycznych (S3.4 Light Diplomacy)
//
// Dane oddzielone od logiki (CLAUDE.md zasada 1). Logika obsługi — DiplomacySystem
// (proposeTreaty / signTreaty / breakTreaty / hasTreaty). Traktaty przechowywane są
// w relacji: gameState.diplomacy.relations[key].treaties[] jako { id, signedYear }.
//
// Pola: id + nazwy/opisy PL/EN.
//
// ⚠ D1 skasował cztery pola, wszystkie MARTWE (zero konsumentów, audyt §4.4 / R9):
//   minTrust    — próg dostępności; DiplomacyOverlay i tak trzymał własne literały
//   accept      — heurystyka akceptacji; proposeTreaty miał te same liczby wpisane u siebie
//   blocksWar   — bramka paktu; declareWar sprawdza hasTreaty('non_aggression') wprost
//   yearlyTrust — przyrost zaufania/rok; zastąpiony narastającym modyfikatorem opinii
//                 (OPINION_MODIFIERS.trade_partner.rampPerYear/rampMax). Zostawienie go
//                 dałoby DWA źródła jednej gałki balansu.
// Progi akceptacji wracają w D2 jako deklaratywna część kontraktu czasownika
// (Acceptance Engine), a nie jako druga kopia liczb obok kodu.

export const TREATY_TYPES = {
  trade_agreement: {
    id:     'trade_agreement',
    namePL: 'Umowa Handlowa',
    nameEN: 'Trade Agreement',
    descPL: 'Otwiera wymianę towarów z imperium. Zaufanie rośnie z każdym rokiem trwania umowy.',
    descEN: 'Opens commodity trade with the empire. Trust grows with every year the deal holds.',
  },
  non_aggression: {
    id:     'non_aggression',
    namePL: 'Pakt o Nieagresji',
    nameEN: 'Non-Aggression Pact',
    descPL: 'Imperium nie wypowie wojny dopóki pakt obowiązuje. Bez bonusu zaufania.',
    descEN: 'The empire will not declare war while the pact holds. No trust bonus.',
  },
  // Sojusz (pełny). Status „Sojusznik" TYLKO gdy ten traktat aktywny.
  alliance: {
    id:     'alliance',
    namePL: 'Sojusz',
    nameEN: 'Alliance',
    descPL: 'Pełny sojusz wojskowy. Nadaje status „Sojusznik".',
    descEN: 'Full military alliance. Grants "Ally" status.',
  },
};
