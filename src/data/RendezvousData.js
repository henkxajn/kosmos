// RendezvousData — Finding 663 (MECHANIKA, poza arciem CV; decyzja właściciela 2026-11-11): rozkaz „leć do ciała”.
//
// Statek wolniejszy od ciała i za nim (prawie zawsze: statki 0,7–1,4 AU / rok, planety wewnątrz ~25 AU szybsze) dostawał
// spotkanie po drugiej stronie orbity — zmierzone 32,7 AU za gwiazdą, ≈ 28 lat lotu dla statku 0,1 AU od planety.
// Dwie reguły (`MovementOrderSystem._issueMoveToPoint`, `VesselManager._rendezvousCapture` / `_rendezvousRefusal`):
//   A) statek JUŻ przy ciele (zadokowany / na orbicie tego ciała albo bliżej niż `CAPTURE_AU` od ciała — dla księżyca także
//      od jego planety) nie dostaje przechwycenia: przylot od razu, orbita ciała w następnym tiku (wszyscy, także AI);
//   B) dalej — najwcześniejsze możliwe spotkanie (statek może przylecieć wcześniej i czekać na orbicie w punkcie, przez który
//      ciało przejdzie — `VesselManager._interceptBody`); gdy jest dalej niż horyzont, rozkaz GRACZA jest odrzucony
//      z powodem i ETA. Horyzont = max(`HORIZON_MIN_YEARS`, `HORIZON_MULT` × czas lotu po prostej do BIEŻĄCEJ pozycji ciała).
//      Horyzont jest WZGLĘDNY, bo zwykłe loty przez duży układ trwają dziesiątki lat (pary ciało → ciało w wygenerowanych
//      układach: do 74 lat) — bezwzględny limit odrzucałby uczciwe rozkazy.
// Odwrót z bitwy (`isRetreatSpec`) nie podlega żadnej z reguł — lot ucieczki zostaje prawdziwym lotem (M1, Finding 657).
//
// Pokrętła na żywo (alias, nie kopia): `KOSMOS.rendezvousTuning.HORIZON_MULT = 5` działa od następnego rozkazu.

export const RENDEZVOUS_TUNING = {
  CAPTURE_AU:        0.5,   // AU — „już przy ciele”; ta sama miara co przyciąganie kliku do ciała (`VesselManager.SNAP_TO_BODY_AU`)
                            //      i „na orbicie / oblega” (`SystemPoolService.BLOCKADE_RANGE_AU`); księżyce krążą ≤ 0,28 AU od planety
  HORIZON_MULT:      3,     // × czas lotu po prostej do bieżącej pozycji ciała (lata gry)
  HORIZON_MIN_YEARS: 1,     // lata gry — podłoga horyzontu (krótkie loty nigdy nie są odrzucane)
};
