// FleetDoctrines — enum doktryn floty gracza (Player Fleet Groups, P1).
//
// Doktryna to policy floty — wpływa na to, jak FleetSystem.applyDoctrine
// transformuje spec przed wysłaniem do MovementOrderSystem. Plus jeden tryb
// (`retreat_at_50`) z aktywnym tickiem agregującym HP członków.
//
// Logika applyDoctrine implementowana w P3 — w P1 doktryna jest tylko metadanymi
// (zapisuje się w save, dropdown w UI), bez efektów. W P2 dispatcher fan-out
// ignoruje doktrynę (pass-through). P3 dopisuje semantykę.

export const FLEET_DOCTRINES = {
  ENGAGE_IN_RANGE: 'engage_in_range',   // default, strzelają gdy w zasięgu
  KITE:            'kite',              // utrzymują max dystans (preferMaxRange w engage)
  HOLD_POSITION:   'hold_position',     // nie ścigają, bronią się reaktywnie
  RETREAT_AT_50:   'retreat_at_50',     // auto-wycofanie przy 50% aggregate HP
};

export const DEFAULT_DOCTRINE = FLEET_DOCTRINES.ENGAGE_IN_RANGE;

// Lista wartości — przydatna dla walidacji + iteracji w UI dropdown.
export const ALL_DOCTRINES = Object.values(FLEET_DOCTRINES);

export function isValidDoctrine(doctrine) {
  return ALL_DOCTRINES.includes(doctrine);
}

// Klucze i18n dla nazw + opisów (rozszerzane w P3 — w P1 wystarcza wpisanie nazw).
export function doctrineNameKey(doctrine) {
  return `fleet.doctrine.${doctrine}.name`;
}
export function doctrineDescKey(doctrine) {
  return `fleet.doctrine.${doctrine}.desc`;
}
