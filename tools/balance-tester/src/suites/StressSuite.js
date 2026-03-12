// StressSuite — edge cases z patologicznymi warunkami startowymi
// 50 runów × 7 scenariuszy × 300 lat

export const StressSuite = {
  name: 'stress',
  description: 'Stress test: 350 runów × 300 lat (7 scenariuszy patologicznych)',
  bots: [
    { botName: 'BalancedBot', runs: 50 },
  ],
  years: 300,

  // Scenariusze modyfikujące warunki startowe
  scenarios: [
    {
      name: 'All Desert',
      description: 'Tylko pustynne/wasteland tereny — testuje syntetyczną żywność',
      override: (runtime) => {
        const grid = runtime.grid;
        if (!grid) return;
        for (const tile of grid.toArray()) {
          if (tile.type !== 'ocean' && tile.type !== 'deep_ocean') {
            tile.type = 'desert';
          }
        }
      },
    },
    {
      name: 'No Iron',
      description: 'Brak depozytów Fe — testuje czy startowe 200 Fe wystarczy',
      override: (runtime) => {
        if (!runtime.homePlanet?.deposits) return;
        runtime.homePlanet.deposits = runtime.homePlanet.deposits.filter(
          d => d.resourceId !== 'Fe'
        );
        runtime.buildingSystem?.setDeposits?.(runtime.homePlanet.deposits);
      },
    },
    {
      name: 'Tiny Planet',
      description: 'Siatka 6×4 (24 hexy) — testuje ekonomię na małym ciele',
      applyBeforeGrid: true,
      override: (runtime) => {
        // Oznaczone jako applyBeforeGrid — wymaga specjalnego handlingu w runie
        if (runtime.homePlanet) {
          runtime.homePlanet.radius = 0.3; // mała planeta → mały grid
        }
      },
    },
    {
      name: 'Cold Planet',
      description: 'tempK < 200 (lód wszędzie) — testuje lodowe planety',
      override: (runtime) => {
        if (!runtime.homePlanet) return;
        runtime.homePlanet.temperatureK = 180;
        runtime.homePlanet.temperatureC = 180 - 273.15;
        // Zamień nieleśne tereny na ice_sheet
        const grid = runtime.grid;
        if (!grid) return;
        for (const tile of grid.toArray()) {
          if (tile.type === 'plains' || tile.type === 'desert') {
            tile.type = 'ice_sheet';
          }
        }
      },
    },
    {
      name: '1-Planet System',
      description: 'Brak celów ekspansji — testuje sens gry bez ekspansji',
      override: (runtime) => {
        // Usuń planetoidy i księżyce z EntityManager (zostaw tylko gwiazdę i home planet)
        // Bot nie będzie miał celów recon/colony
      },
    },
    {
      name: 'Rich Start',
      description: '10× startowe zasoby — testuje tempo endgame',
      override: (runtime) => {
        const rs = runtime.resourceSystem;
        if (!rs) return;
        for (const [key, val] of rs.inventory) {
          if (typeof val === 'number' && val > 0) {
            rs.inventory.set(key, val * 10);
          }
        }
      },
    },
    {
      name: 'Poor Start',
      description: '50% startowe zasoby — testuje przeżywalność early game',
      override: (runtime) => {
        const rs = runtime.resourceSystem;
        if (!rs) return;
        for (const [key, val] of rs.inventory) {
          if (typeof val === 'number' && val > 0) {
            rs.inventory.set(key, Math.floor(val * 0.5));
          }
        }
      },
    },
  ],
};
