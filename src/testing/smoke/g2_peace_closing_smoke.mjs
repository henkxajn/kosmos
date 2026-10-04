// G2-4 — ZAMKNIĘCIE (2026-10-04): drobne poprawki podpisane przez właściciela po bramce follow-upów F1–F7
// (odpowiedzi 2026-10-04, `docs/design/AI_GARRISON_PLAN.md`; rejestr tamże, §6, #368 i dalej).
//
//   Zb  (b) — polski wpis pokoju (`log.diplo.peaceSigned`) po „z” gramatyczny dla każdej nazwy: „Pokój z imperium {0}”
//       (ta sama forma co wpis wycofania po F6); angielski bez zmian; wpis pokoju w Dzienniku bierze tekst z tego klucza
//       (pin źródłowy — `UIManager` nie importuje się pod node).
//
// ⚠ Źródło bez komentarzy (pin nie może łapać własnego wyjaśnienia) i z LF (pin niezależny od checkoutu).

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import { t, setLocale, getLocale } from '../../i18n/i18n.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const src = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8'));

// ── Zb — (b): polski wpis pokoju po „z” ───────────────────────────────────────────────────
{
  console.log('\nZb — (b) polski wpis pokoju po „z” gramatyczny dla każdej nazwy; angielski bez zmian');
  const prev = getLocale();
  setLocale('pl');
  const pl = t('log.diplo.peaceSigned', 'Liga Trzech Słońc', '10');
  const plOrd = t('event.withdrawal.ordered', 'Liga Trzech Słońc', 2, 'Thuban d', '07/01/121');
  setLocale('en');
  const en = t('log.diplo.peaceSigned', 'Liga Trzech Słońc', '10');
  setLocale(prev);
  assert(pl.includes('Pokój z imperium Liga Trzech Słońc') && !/\bz Liga\b/.test(pl) && pl.includes('10'),
    `Zb: PL — „Pokój z imperium {0}” (nazwa w mianowniku jako dopowiedzenie), długość rozejmu zostaje: ${pl}`);
  assert(plOrd.includes('Pokój z imperium Liga Trzech Słońc'),
    `Zb kontrola: wzór F6 — wpis wycofania tej samej chwili ma już tę formę: ${plOrd}`);
  assert(en === '☮ Peace with Liga Trzech Słońc — 10-year truce', `Zb kontrola: EN bez zmian — ${en}`);
  const um = src('../../scenes/UIManager.js');
  const iPeace = um.indexOf("EventBus.on('diplomacy:peaceSigned'");
  assert(iPeace > 0 && /t\(\s*'log\.diplo\.peaceSigned'/.test(um.slice(iPeace, iPeace + 400)),
    'Zb kontrola pinu: wpis pokoju w Dzienniku (UIManager, diplomacy:peaceSigned) bierze tekst z log.diplo.peaceSigned — pin celuje w żywą ścieżkę');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
