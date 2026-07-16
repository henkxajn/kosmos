// StationDepot — magazyn OGÓLNY stacji orbitalnej (HUB handlowy, S3.3b-S3b).
// Façade „resourceSystem-podobny": ten sam kontrakt co fragment ResourceSystem używany przez
// loadCargo/unloadCargo (Vessel.js), VesselManager._refuelTank i MissionSystem (pętla cargo) —
// inventory (Map) + receive/spend/getAmount. Magazyn OGÓLNY: przyjmuje i wydaje DOWOLNE towary jak
// colony.resourceSystem (sink I source handlu). Pojemność unlimited. Lekki — bez time:tick/producentów/
// legacyProxy ResourceSystem (te ciągnęłyby tick co klatkę + listener leak per-stację).
//
// S3.4c (D2) — Wariant B: depot-jako-PROXY. Encja pozostaje instancją StationDepot (inwariant
// `station.depot instanceof StationDepot` zachowany), ale gdy stacja ma kolonię-matkę (resolveHomeColony)
// — receive/spend/getAmount + getter `inventory` DELEGUJĄ do `motherColony.resourceSystem` (jeden,
// wspólny magazyn „orbitalnej dzielnicy"). Stacja-sierota (brak matki) trzyma własną Mapę jak dawniej.
// serialize() bez zmiany kształtu: matka → {} (delegat nie ma własnego stanu), sierota → własna Mapa.

import { resolveHomeColony } from '../utils/TransferStore.js';

export class StationDepot {
  constructor(data = {}, station = null) {
    // Własna Map (dla sieroty). Żywa = jedyne źródło prawdy; getAmount zwraca 0 dla brakujących.
    // (Historycznie pole nazywało się `inventory`; teraz `inventory` to GETTER — patrz niżej.)
    this._ownInventory = new Map(Object.entries(data ?? {}));
    // Back-reference do encji stacji — potrzebny do LAZY rozwiązania kolonii-matki (proxy).
    // Late-bind: Station przekazuje `this` przy konstrukcji depotu; brak (null) = zawsze własna Mapa.
    this._station = station;
  }

  // Rozwiąż efektywny store: resourceSystem kolonii-matki (proxy) lub null (sierota → własna Mapa).
  _target() {
    if (!this._station) return null;
    const col = resolveHomeColony(this._station);
    return col?.resourceSystem ?? null;
  }

  // inventory — Map efektywnego magazynu (matka: kolonii; sierota: własna). GETTER (nie pole).
  get inventory() {
    const t = this._target();
    return t ? t.inventory : this._ownInventory;
  }

  // Ilość zasobu (kontrakt jak ResourceSystem.getAmount; loadCargo via _getAvailable).
  getAmount(id) {
    const t = this._target();
    return t ? t.getAmount(id) : (this._ownInventory.get(id) ?? 0);
  }

  // Przychód (kontrakt jak ResourceSystem.receive). Magazyn OGÓLNY — przyjmuje DOWOLNY towar.
  receive(gains) {
    const t = this._target();
    if (t) { t.receive(gains); return; }   // matka → wspólny magazyn kolonii (D6: eventy pożądane)
    for (const [id, amount] of Object.entries(gains)) {
      if (amount <= 0) continue;
      this._ownInventory.set(id, (this._ownInventory.get(id) ?? 0) + amount);
    }
  }

  // Stać-nas? (kontrakt jak ResourceSystem.canAfford — zwraca bool, NIE pobiera). Bez tej metody
  // OutpostBuildingPicker (resSys.canAfford) rzucał TypeError na depocie stacji → picker się nie
  // otwierał przy zakładaniu placówki statkiem zadokowanym przy stacji (cicho łapane w try/catch).
  canAfford(costs) {
    const t = this._target();
    if (t) return typeof t.canAfford === 'function' ? t.canAfford(costs) : false;  // matka → magazyn kolonii
    for (const [id, amount] of Object.entries(costs ?? {})) {
      if (amount <= 0) continue;
      if ((this._ownInventory.get(id) ?? 0) < amount) return false;
    }
    return true;
  }

  // Wydatek (kontrakt jak ResourceSystem.spend — zwraca bool; _refuelTank/_bestEffortLoad działają tylko gdy true).
  spend(costs) {
    const t = this._target();
    if (t) return t.spend(costs);           // matka → wspólny magazyn kolonii
    for (const [id, amount] of Object.entries(costs)) {
      if ((this._ownInventory.get(id) ?? 0) < amount) return false;   // weryfikacja przed pobraniem
    }
    for (const [id, amount] of Object.entries(costs)) {
      this._ownInventory.set(id, (this._ownInventory.get(id) ?? 0) - amount);
    }
    return true;
  }

  // S3.4c (D3) — przelej zawartość WŁASNEJ Mapy do docelowego store (kolonii-matki) i wyzeruj.
  // Używane przy restore dla stacji z matką: surowa Mapa z save → magazyn kolonii tym samym
  // resolverem co runtime (zero rozjazdu). IDEMPOTENTNY — pusta własna Mapa → no-op (drugi drain
  // nie dubluje). Po drainie delegat pusty; wszystkie operacje idą już do kolonii.
  drainOwnInventoryTo(store) {
    if (!store || this._ownInventory.size === 0) return;
    const gains = {};
    for (const [id, amt] of this._ownInventory) if (amt > 0) gains[id] = amt;
    store.receive(gains);
    this._ownInventory.clear();
  }

  // Serializacja do save (StationSystem.serialize → civ4x.stationSystem[].depot). Kształt PŁASKI bez
  // zmian (D2 transparentny): matka → {} (delegat nie przechowuje własnego stanu → nic do zapisania),
  // sierota → własna Mapa (niezerowe wpisy). Drain zawartości starych depotów do kolonii = restore (D3).
  serialize() {
    if (this._target()) return {};
    return Object.fromEntries([...this._ownInventory].filter(([, v]) => v !== 0));
  }
}
