// BoostedSuite — test scenariusza "Nowa Gra 2" (civilization_boosted)
// 40 lat — matchuje czas gry gracza (2 outposty, kolonizacja, 50+ pop)

export const BoostedSuite = {
  name: 'boosted',
  description: 'Nowa Gra 2: 50 runów BalancedBot × 40 lat (boosted start)',
  bots: [
    { botName: 'BalancedBot', runs: 50 },
  ],
  years: 40,
  scenario: 'civilization_boosted',
};
