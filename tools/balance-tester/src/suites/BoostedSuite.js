// BoostedSuite — test scenariusza "Nowa Gra 2" (civilization_boosted)
// Start: 4 POP, rocketry+exploration, launch_pad+shipyard, mining×5, factory×1.5
// 500 lat — pełna ścieżka: statki → recon → kolonie

export const BoostedSuite = {
  name: 'boosted',
  description: 'Nowa Gra 2: 50 runów BalancedBot × 500 lat (boosted start)',
  bots: [
    { botName: 'BalancedBot', runs: 50 },
  ],
  years: 500,
  scenario: 'civilization_boosted',
};
