// QuickSuite — 50 runów × 500 lat (szybka iteracja dev, ~60s)
// Tylko BalancedBot — baseline kompetentnego gracza
// 500 lat potrzebne na pełną ścieżkę: bootstrap → growth → industry → space expansion

export const QuickSuite = {
  name: 'quick',
  description: 'Szybki test: 50 runów BalancedBot × 500 lat',
  bots: [
    { botName: 'BalancedBot', runs: 50 },
  ],
  years: 500,
};
