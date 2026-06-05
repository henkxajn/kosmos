// StationDepot — magazyn OGÓLNY stacji orbitalnej (HUB handlowy, S3.3b-S3b).
// Façade „resourceSystem-podobny": ten sam kontrakt co fragment ResourceSystem używany przez
// loadCargo/unloadCargo (Vessel.js), VesselManager._refuelTank i MissionSystem (pętla cargo) —
// inventory (Map) + receive/spend/getAmount. Magazyn OGÓLNY: przyjmuje i wydaje DOWOLNE towary jak
// colony.resourceSystem (sink I source handlu). Pojemność unlimited. Lekki — bez time:tick/producentów/
// legacyProxy ResourceSystem (te ciągnęłyby tick co klatkę + listener leak per-stację).

export class StationDepot {
  constructor(data = {}) {
    // Żywa Map = jedyne źródło prawdy (mutowana przez receive/spend; CargoLoadModal trzyma referencję).
    // Lazy: trzyma tylko obecne wpisy; getAmount zwraca 0 dla brakujących.
    this.inventory = new Map(Object.entries(data ?? {}));
  }

  // Ilość zasobu (kontrakt jak ResourceSystem.getAmount; loadCargo via _getAvailable).
  getAmount(id) {
    return this.inventory.get(id) ?? 0;
  }

  // Przychód (kontrakt jak ResourceSystem.receive). Magazyn OGÓLNY — przyjmuje DOWOLNY towar.
  receive(gains) {
    for (const [id, amount] of Object.entries(gains)) {
      if (amount <= 0) continue;
      this.inventory.set(id, (this.inventory.get(id) ?? 0) + amount);
    }
  }

  // Wydatek (kontrakt jak ResourceSystem.spend — zwraca bool; _refuelTank/_bestEffortLoad działają tylko gdy true).
  spend(costs) {
    for (const [id, amount] of Object.entries(costs)) {
      if ((this.inventory.get(id) ?? 0) < amount) return false;   // weryfikacja przed pobraniem
    }
    for (const [id, amount] of Object.entries(costs)) {
      this.inventory.set(id, (this.inventory.get(id) ?? 0) - amount);
    }
    return true;
  }

  // Serializacja do save (StationSystem.serialize → civ4x.stationSystem[].depot). Tylko niezerowe wpisy.
  serialize() {
    return Object.fromEntries([...this.inventory].filter(([, v]) => v !== 0));
  }
}
