// VesselReveal — ARKUSZ HUD paczka B (B-2, Finding 568): JEDNA reguła tożsamości obcego statku na mapie — etykieta
// (`MapLabelLogic.gatherVesselLabels`), rozwinięcie informacyjne T1 (`LabelHoverLogic.enemyVesselExpansionLines`) i linia
// treści alertu (`HudAlertLogic.alertIdentity`) pytają tę samą funkcję:
//   • nazwa od `contact` (wywiad o STATKU, `intel.vessels.<id>.quality`): `contact` / `detailed` — nazwa; każda inna jakość
//     (`rumor`, `unknown`, brak rekordu, nieznany napis) — bez nazwy (fail-closed);
//   • decyzja właściciela 2026-10-28 (wariant „b”): przed paczką B etykieta pokazywała nazwę od `contact`, a rozwinięcie T1
//     i linia alertu — dopiero typ; teraz wszystkie trzy jak etykieta (i Rejestr K3 — `FleetRegistryLogic`, ta sama granica).
// ⚠ Zmierzone: jakość statku ma w grze producentów `rumor` (zbliżenie > 0,3 AU, radar obserwatorium) i `contact` (zbliżenie
//   < 0,3 AU, namiar sensorów, skan obserwatorium) — `detailed` dla statku nie powstaje; reguła obejmuje je dla zgodności
//   z drabiną `IntelSystem` (`VESSEL_LEVEL_RANK`).
// ⚠ Zero importów (moduł testowalny pod node).

/** Czy gracz zna nazwę obcego statku przy tej jakości wywiadu (`contact` i wyżej; fail-closed). */
export function enemyVesselNamed(quality) {
  return quality === 'contact' || quality === 'detailed';
}
