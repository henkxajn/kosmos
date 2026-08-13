// W1 — keeper siły wyprowadzonej (commit W1-2, WOJNA I POKÓJ 1.0, workstream B).
//
// PO CO: `ThreatAssessment` jest JEDYNYM źródłem siły militarnej dla dyplomacji, FSM obcych,
// intelu i (od W1-5) doktryn. Cztery rozjeżdżające się estymatory były przyczyną R2; ten keeper
// pilnuje, żeby ich następca nie rozjechał się po cichu na tej samej klasie błędów.
//
//   T1  tabela wag NAPĘDZA wynik (zmiana wagi ⇒ zmiana wartości) — balans jest DANYMI (decyzja 3)
//   T2  kadłub bez broni wycenia się na wartość SAMEGO kadłuba (mniej niż uzbrojony)
//   T3  kadłub bez modułów ≠ kadłub z szablonu bojowego (materializacja ≠ realny okręt)
//   T4  kotwica jednostki HP trzyma się (decyzja 2): goły kadłub ≈ jego HP, `damage` po kursie ×10
//   T5  UNIEWAŻNIANIE pamięci podręcznej: nowy statek zmienia wynik; nieświeży odczyt CZERWIENI SIĘ
//   T6  nieznany właściciel ⇒ 0; wraki i cudze kadłuby trafiają do WŁAŚCIWYCH kubełków
//   T7  `relativePowerRaw` — znak, granice, symetria, skalo-niezmienniczość
//
// ⚠ Harness NIE montuje `stationSystem` (żeton R-3), więc AI nie produkuje okrętów samo —
//   każdy wrogi kadłub stawiamy tu RĘCZNIE (ustalone w `war_seams_smoke`).

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import EventBus from '../../core/EventBus.js';
import { createVessel } from '../../entities/Vessel.js';
import { HULLS } from '../../data/HullsData.js';
import { SHIP_MODULES } from '../../data/ShipModulesData.js';
import { COMBAT_VALUE_WEIGHTS } from '../../data/CombatValueData.js';
import { hullCombatValue, vesselCombatValue, aggregateCombatValue, relativePowerRaw } from '../../utils/ThreatMath.js';
import { PLAYER_OWNER_ID } from '../../systems/ThreatAssessment.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

const WARSHIP = ['engine_ion', 'armor_standard', 'weapon_kinetic'];

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  return core;
}

function spawn(core, { owner = null, wreck = false, hull = 'hull_frigate', modules = [], name = 'X' } = {}) {
  const home = window.KOSMOS.homePlanet;
  const v = createVessel(hull, home.id, {
    name, modules: [...modules], x: home.x ?? 0, y: home.y ?? 0, systemId: 'sys_home',
  });
  if (owner) { v.ownerEmpireId = owner; v.owner = owner; v.isEnemy = true; }
  if (wreck) v.isWreck = true;
  core.vesselManager._vessels.set(v.id, v);
  return v;
}

// ── T1 — tabela wag napędza wynik (decyzja 3: balans to DANE) ───────────────
console.log('T1 — wycena pochodzi Z TABELI WAG, nie z kodu');
{
  const frig = HULLS.hull_frigate;
  const base = hullCombatValue(frig, WARSHIP, SHIP_MODULES, COMBAT_VALUE_WEIGHTS);

  // Podmiana JEDNEJ wagi MUSI zmienić wynik — inaczej tabela jest dekoracją.
  const doubledHp = hullCombatValue(frig, WARSHIP, SHIP_MODULES, { ...COMBAT_VALUE_WEIGHTS, hp: 2.0 });
  assert(doubledHp - base === frig.baseHP,
    `T1: podwojenie wagi `.trim() + '`hp` dodaje dokładnie baseHP ' +
    `(${base} → ${doubledHp}, Δ=${doubledHp - base}, baseHP=${frig.baseHP})`);

  const zeroDamage = hullCombatValue(frig, WARSHIP, SHIP_MODULES, { ...COMBAT_VALUE_WEIGHTS, damage: 0 });
  const kineticDmg = SHIP_MODULES.weapon_kinetic.stats.damage;
  assert(base - zeroDamage === kineticDmg * COMBAT_VALUE_WEIGHTS.damage,
    `T1: wyzerowanie wagi `.trim() + '`damage` zdejmuje dokładnie wkład broni ' +
    `(${kineticDmg} × ${COMBAT_VALUE_WEIGHTS.damage} = ${kineticDmg * COMBAT_VALUE_WEIGHTS.damage})`);

  // Wyceniamy POLA, nie ID modułów — dwa różne moduły o tym samym polu wyceniają się
  // proporcjonalnie do WARTOŚCI pola, bez żadnej wiedzy o ich nazwach (decyzja 3).
  const light = hullCombatValue(frig, ['armor_standard'], SHIP_MODULES);
  const heavy = hullCombatValue(frig, ['armor_heavy'], SHIP_MODULES);
  const dLight = SHIP_MODULES.armor_standard.stats.armorRating;
  const dHeavy = SHIP_MODULES.armor_heavy.stats.armorRating;
  assert(approx(heavy - light, (dHeavy - dLight) * COMBAT_VALUE_WEIGHTS.armorRating),
    `T1: dwa RÓŻNE pancerze wyceniane po tym samym POLU armorRating (${dLight} vs ${dHeavy}) — ` +
    'trzeci typ pancerza wyceni się sam, bez linijki kodu');
}

// ── T2 — kadłub bez broni: wartość samego kadłuba ───────────────────────────
console.log('T2 — kadłub bez broni wyceniony na wartość SAMEGO kadłuba');
{
  const frig = HULLS.hull_frigate;
  const bare  = hullCombatValue(frig, [], SHIP_MODULES);
  const civil = hullCombatValue(frig, ['engine_ion', 'cargo_small'], SHIP_MODULES);
  const armed = hullCombatValue(frig, WARSHIP, SHIP_MODULES);

  assert(bare > 0, `T2: goły kadłub ma wartość > 0 (${bare}) — jest celem, który trzeba rozbić`);
  assert(approx(civil, bare),
    `T2: moduły NIEBOJOWE (silnik, ładownia) nie zmieniają wartości bojowej (${bare} vs ${civil})`);
  assert(armed > bare,
    `T2: uzbrojony jest wart WIĘCEJ niż goły (${armed} > ${bare}) — różnica = wkład uzbrojenia`);
}

// ── T3 — materializowany kadłub bez modułów ≠ kadłub z szablonu ─────────────
console.log('T3 — kadłub bez modułów (materializacja) ≠ kadłub z szablonu bojowego');
{
  // `composeFromStrength` emituje `modules: []` (audyt R3/K-6). Taki kadłub NIE MOŻE
  // wyceniać się jak realny okręt z katalogu S3 — inaczej martwa ścieżka zawyżałaby zagrożenie.
  const materialized = vesselCombatValue({ shipId: 'hull_frigate', modules: [] }, HULLS, SHIP_MODULES);
  const templated    = vesselCombatValue({ shipId: 'hull_frigate', modules: WARSHIP }, HULLS, SHIP_MODULES);
  assert(materialized < templated,
    `T3: kadłub bez modułów wart mniej niż uzbrojony z szablonu (${materialized} < ${templated})`);

  // Nieznany kadłub NIE znika (BattleSystem by go pominął) — dostaje fallbacki.
  const unknown = vesselCombatValue({ shipId: 'science_vessel', modules: [] }, HULLS, SHIP_MODULES);
  assert(unknown > 0,
    `T3: kadłub spoza HULLS (legacy SHIPS) dostaje fallbacki, nie zero (${unknown}) — ` +
    'milczące zerowanie ukryłoby całą klasę statków');
}

// ── T4 — kotwica jednostki HP (decyzja 2) ───────────────────────────────────
console.log('T4 — jednostka to HP: goły kadłub ≈ jego HP, damage po kursie z adaptera');
{
  // Waga `hp` = 1.0 definiuje jednostkę. Goły kadłub musi być ZDOMINOWANY przez swoje HP,
  // inaczej liczba przestaje być współmierna z `fleet.strength` (gdzie hp = strength 1:1).
  for (const id of ['hull_small', 'hull_frigate', 'hull_cruiser']) {
    const h = HULLS[id];
    const v = hullCombatValue(h, [], SHIP_MODULES);
    const ratio = v / h.baseHP;
    assert(ratio >= 1.0 && ratio <= 1.6,
      `T4: ${id} — goły kadłub ${v} przy baseHP ${h.baseHP} (×${ratio.toFixed(2)}, w paśmie 1.0–1.6)`);
  }
  assert(COMBAT_VALUE_WEIGHTS.hp === 1.0,
    'T4: waga `hp` = 1.0 — to jest DEFINICJA jednostki, nie parametr do strojenia');
  assert(COMBAT_VALUE_WEIGHTS.damage === 10,
    'T4: kurs `damage` = 10 HP — odczytany z empireFleetToBattleUnit (damage = strength/10), ' +
    'nie wymyślony');
  // Monotoniczność klas: zwiadowca < fregata < niszczyciel < krążownik.
  const order = ['hull_small', 'hull_frigate', 'hull_destroyer', 'hull_cruiser']
    .map(id => hullCombatValue(HULLS[id], [], SHIP_MODULES));
  assert(order.every((v, i) => i === 0 || v > order[i - 1]),
    `T4: klasy kadłubów rosną monotonicznie [${order.join(' < ')}]`);
}

// ── T5 — pamięć podręczna: unieważnianie i wykrywanie nieświeżości ──────────
console.log('T5 — memo: nowy statek zmienia wynik; NIEŚWIEŻY odczyt czerwieni się');
{
  const core = boot();
  const ta = core.threatAssessment;
  assert(!!ta, 'T5: ThreatAssessment jest zamontowany w harnessie (window.KOSMOS.threatAssessment)');
  assert(window.KOSMOS.threatAssessment === ta, 'T5: …i wystawiony przez service locator');

  // ⚠ Baza MUSI być NIEZEROWA, inaczej „nieświeży == poprzedni" przechodzi tautologicznie
  //   (0 === 0). Najpierw stawiamy kadłub i wymuszamy przeliczenie.
  spawn(core, { modules: WARSHIP, name: 'Fregata bazowa' });
  ta.invalidate();
  const before = ta.getPlayerStrength();
  assert(before > 0, `T5: baza pomiaru jest NIEZEROWA (${before}) — pin nie porówna 0 z 0`);

  // Wstawienie do rejestru BEZ zdarzenia to dokładnie scenariusz „nieświeżego odczytu".
  spawn(core, { modules: WARSHIP, name: 'Fregata gracza' });
  const stale = ta.getPlayerStrength();
  assert(stale === before,
    `T5: bez zdarzenia unieważniającego odczyt jest NIEŚWIEŻY (${before} → ${stale}, drugi kadłub ` +
    'NIEWIDOCZNY) — to jest cecha memo, nie błąd; dowodzi, że wynik NIE jest liczony od nowa ' +
    'przy każdym pytaniu, czyli że pamięć podręczna w ogóle istnieje');

  // …i że unieważnienie faktycznie działa (inaczej memo byłoby pułapką na stałą wartość).
  EventBus.emit('time:tick', { civDeltaYears: 1 });
  const fresh = ta.getPlayerStrength();
  assert(fresh > stale,
    `T5: po tiku wynik przelicza się i ROŚNIE (${stale} → ${fresh}) — unieważnianie działa`);

  // Ścieżka zdarzeniowa `vessel:created` — ta, którą chodzi prawdziwa produkcja.
  const v2 = spawn(core, { modules: WARSHIP, name: 'Fregata gracza 2' });
  EventBus.emit('vessel:created', { vessel: v2 });
  const afterCreated = ta.getPlayerStrength();
  assert(afterCreated > fresh,
    `T5: `.trim() + '`vessel:created` unieważnia natychmiast, bez czekania na tik ' +
    `(${fresh} → ${afterCreated})`);

  // `vessel:wrecked` — wrak wypada z wyceny.
  v2.isWreck = true;
  EventBus.emit('vessel:wrecked', { vessel: v2 });
  assert(ta.getPlayerStrength() === fresh,
    `T5: wrak wypada z wyceny — wartość wraca do stanu sprzed (${ta.getPlayerStrength()} = ${fresh})`);
}

// ── T6 — właściciele: kubełki, wraki, nieznany ──────────────────────────────
console.log('T6 — grupowanie po właścicielu; nieznany ⇒ 0');
{
  const core = boot();
  const ta = core.threatAssessment;
  const enemyId = core.empireRegistry.listAll()[0]?.id ?? 'emp_001';

  spawn(core, { modules: WARSHIP, name: 'Gracz 1' });
  spawn(core, { modules: WARSHIP, name: 'Wróg 1', owner: enemyId });
  spawn(core, { modules: WARSHIP, name: 'Wróg 2', owner: enemyId });
  spawn(core, { modules: WARSHIP, name: 'Wrak wroga', owner: enemyId, wreck: true });
  ta.invalidate();

  const p = ta.getStrength(PLAYER_OWNER_ID);
  const e = ta.getStrength(enemyId);
  const one = hullCombatValue(HULLS.hull_frigate, WARSHIP, SHIP_MODULES);

  assert(approx(p, one), `T6: gracz ma DOKŁADNIE jeden kadłub (${p} = ${one})`);
  assert(approx(e, 2 * one), `T6: wróg ma DWA — wrak NIE liczony (${e} = 2 × ${one})`);
  assert(ta.getStrength('emp_nieistniejace') === 0,
    'T6: nieznany właściciel ⇒ 0 (nie null, nie wyjątek — „nic nie wiem" = „nic nie ma")');

  // Kadłub BEZ stempla czyta się jako kadłub GRACZA — znalezisko 1 z Director Slice 1.
  // Pin trzyma tę semantykę jawnie, żeby zmiana `isEnemyVessel` nie przeszła niezauważona.
  const unstamped = spawn(core, { modules: WARSHIP, name: 'Bez stempla' });
  delete unstamped.ownerEmpireId; delete unstamped.owner; delete unstamped.isEnemy;
  ta.invalidate();
  assert(approx(ta.getStrength(PLAYER_OWNER_ID), 2 * one),
    'T6: kadłub BEZ stempla wpada do puli GRACZA — semantyka `isEnemyVessel` (stempel, nie domysł)');

  // Suma po kubełkach = suma po wszystkich żywych kadłubach (nic nie ginie, nic się nie dubluje).
  const alive = core.vesselManager.getAllVessels().filter(v => !v.isWreck);
  const total = [...ta.getAllStrengths().values()].reduce((s, x) => s + x, 0);
  assert(approx(total, aggregateCombatValue(alive, HULLS, SHIP_MODULES)),
    `T6: Σ kubełków = Σ wszystkich żywych kadłubów (${total.toFixed(1)}) — brak gubienia i dublowania`);
}

// ── T7 — relativePowerRaw: znak, granice, symetria ──────────────────────────
console.log('T7 — relativePowerRaw: kontrakt znaku i granic');
{
  assert(relativePowerRaw(100, 100) === 0, 'T7: równowaga ⇒ 0');
  assert(relativePowerRaw(100, 0) === 1,   'T7: przeciwnik bez floty ⇒ +1 (oceniający miażdżąco silniejszy)');
  assert(relativePowerRaw(0, 100) === -1,  'T7: brak własnej floty ⇒ −1');
  assert(relativePowerRaw(0, 0) === 0,     'T7: obie strony puste ⇒ 0 (nikt nie ma przewagi nad nikim)');
  assert(approx(relativePowerRaw(300, 100), 0.5), 'T7: 3:1 ⇒ +0.5');
  assert(approx(relativePowerRaw(300, 100), relativePowerRaw(3000, 1000)),
    'T7: skalo-niezmienniczość — nie trzeba stroić razem z tabelą wag');
  assert(approx(relativePowerRaw(250, 400), -relativePowerRaw(400, 250)),
    'T7: antysymetria — zamiana stron odwraca znak');
  const vals = [relativePowerRaw(1, 1e9), relativePowerRaw(1e9, 1), relativePowerRaw(-5, 10)];
  assert(vals.every(v => v >= -1 && v <= 1), `T7: zawsze w ⟨−1, +1⟩ nawet na skrajnych wejściach [${vals}]`);
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
