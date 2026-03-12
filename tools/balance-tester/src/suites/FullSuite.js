// FullSuite — 550 runów × 500 lat (pełna walidacja balansu, ~5-10 min)
// 100 runów × 5 botów strategicznych + 50 × RandomBot

export const FullSuite = {
  name: 'full',
  description: 'Pełny test: 550 runów (5×100 + 1×50) × 500 lat',
  bots: [
    { botName: 'BalancedBot',    runs: 100 },
    { botName: 'RushBot',        runs: 100 },
    { botName: 'TurtleBot',      runs: 100 },
    { botName: 'GreedyMinerBot', runs: 100 },
    { botName: 'ScienceBot',     runs: 100 },
    { botName: 'RandomBot',      runs: 50 },
  ],
  years: 500,
};
