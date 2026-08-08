// D2/E4 (WOJNA I POKÓJ 1.0) — smoke: świeża odmowa kosztuje, a odmowa MÓWI DLACZEGO.
// Uruchom: node src/testing/smoke/acceptance_refusal_smoke.mjs
//
// E1 zbudował ewaluator `recent_refusal` i rozdał mu wagi we wszystkich pięciu
// czasownikach, ale NIKT nie zapisywał stanu — term czytał pusty obiekt i zwracał 0
// (status UNFED). E4 dokłada PISARZA, więc term przechodzi UNFED → LIVE. Ten plik
// pilnuje rzeczy, których wcześniej NIE DAŁO SIĘ przetestować, bo nie istniały:
//
//   R1 odmowa OCENIONA stempluje `verbCooldowns` i mierzalnie obniża kolejną próbę
//   R2 stempel jest PER CZASOWNIK i wygasa liniowo przez RECENT_REFUSAL_YEARS
//   R3 blokada pre-warunku NIE stempluje (nikt nas nie odrzucił — nie było oceny)
//   R4 auto-pokój z wyczerpania NIE stempluje (inaczej retry E3 zakleszcza wojnę)
//   R5 emisariusz odprawiony stempluje — i to od DOTARCIA, nie od startu misji
//   R6 pole przeżywa zapis/odczyt BEZ bumpu wersji (round-trip przez gameState)
//   R7 status termu = LIVE, a pisarz jest dokładnie JEDEN

import '../headless/env.js';   // shim window/localStorage/document/THREE (pierwszy!)

const EventBus        = (await import('../../core/EventBus.js')).default;
const gameState       = (await import('../../core/GameState.js')).default;
const { GAME_CONFIG } = await import('../../config/GameConfig.js');
const { DiplomacySystem } = await import('../../systems/DiplomacySystem.js');
const { ARCHETYPES }      = await import('../../data/EmpireData.js');
const { ACCEPTANCE_TERMS, TERM_STATUS, RECENT_REFUSAL_YEARS, VERB_ACCEPTANCE } =
  await import('../../data/AcceptanceWeightData.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };

GAME_CONFIG.FEATURES.lightDiplomacy = true;
GAME_CONFIG.FEATURES.diplomacyDecay = false;

const empires = new Map();
const wars    = new Map();
const timeSys = { gameTime: 0 };
window.KOSMOS = {
  timeSystem: timeSys,
  empireRegistry: { get: (id) => empires.get(id), listAll: () => [...empires.values()] },
  galaxyData: { seed: 4242, systems: [] },
  warSystem: { getWarWith: (empireId) => wars.get(empireId) ?? null },
};
const dipl = new DiplomacySystem();
window.KOSMOS.diplomacySystem = dipl;

const addEmpire = (id, archetype = 'industrialist') => {
  empires.set(id, {
    id, name: id, archetype,
    personality: { ...ARCHETYPES[archetype].personality },
    objective: 'merchant', traits: [],
  });
  return id;
};
const seedOpinion = (id, value) => dipl.addOpinionModifier(id, 'player', 'legacy_relations', { value, source: 'test' });
const setWar = (id, { exhaustion = 0, casusBelli = 'border_incident' } = {}) => {
  wars.set(id, { id: `war_${id}`, active: true, casusBelli, exhaustion: { player: exhaustion, [id]: exhaustion } });
};
const cooldowns = (id) => dipl.relations.getVerbCooldowns('player', id);

// ── R1: odmowa OCENIONA stempluje i kosztuje ────────────────────────────────
console.log('--- R1: odmowa stempluje `verbCooldowns` i obniża kolejną próbę ---');
{
  timeSys.gameTime = 100;
  const E = addEmpire('emp_r1');
  seedOpinion(E, 5);                       // poniżej progu umowy handlowej (opinia 10)

  ok('przed pierwszą próbą para nie ma ŻADNEGO stempla',
    Object.keys(cooldowns(E)).length === 0);

  const before = dipl.evaluateTreaty(E, 'trade_agreement');
  ok('propozycja faktycznie odpada punktami (a nie blokadą pre-warunku)',
    before.decision === false && before.blocked === false);

  ok('proposeTreaty zwraca false', dipl.proposeTreaty(E, 'trade_agreement') === false);
  ok('…i ZOSTAWIA stempel z bieżącym rokiem gry',
    cooldowns(E).trade_agreement === 100);

  const after = dipl.evaluateTreaty(E, 'trade_agreement');
  const w = VERB_ACCEPTANCE.trade_agreement.terms.recent_refusal;
  ok(`kolejna próba jest MIERZALNIE trudniejsza o pełną wagę termu (−${w})`,
    Math.abs((before.score - after.score) - w) < 1e-6);

  const row = after.breakdown.find(r => r.term === 'recent_refusal');
  ok('rozbicie NIESIE wiersz świeżej odmowy (to on wyjaśnia graczowi „czemu znowu nie")',
    !!row && row.value === -w && row.labelKey === 'diplo.term.recentRefusal');
}

// ── R2: per czasownik + liniowe wygasanie ───────────────────────────────────
console.log('--- R2: stempel per CZASOWNIK, wygasa przez RECENT_REFUSAL_YEARS ---');
{
  timeSys.gameTime = 200;
  const E = addEmpire('emp_r2');
  seedOpinion(E, 5);
  dipl.proposeTreaty(E, 'trade_agreement');

  ok('odmowa umowy handlowej NIE obciąża sojuszu (osobne czasowniki)',
    cooldowns(E).trade_agreement === 200 && cooldowns(E).alliance === undefined);

  const at = (year) => {
    timeSys.gameTime = year;
    return dipl.evaluateTreaty(E, 'trade_agreement').breakdown.find(r => r.term === 'recent_refusal').value;
  };
  const w = VERB_ACCEPTANCE.trade_agreement.terms.recent_refusal;
  ok('tuż po odmowie: pełna kara', at(200) === -w);
  ok('w połowie okresu: połowa kary', at(200 + RECENT_REFUSAL_YEARS / 2) === -w / 2);
  ok('po upływie okresu: kara znika', at(200 + RECENT_REFUSAL_YEARS) === 0);

  // Ponowna odmowa ODŚWIEŻA, a nie kumuluje — dwa „nie" mają boleć DŁUŻEJ, nie MOCNIEJ.
  timeSys.gameTime = 210;
  dipl.proposeTreaty(E, 'trade_agreement');
  ok('ponowna odmowa NADPISUJE rok (odświeżenie, nie kumulacja)',
    cooldowns(E).trade_agreement === 210 && at(210) === -w);
}

// ── R3: blokada pre-warunku NIE stempluje ───────────────────────────────────
console.log('--- R3: blokada pre-warunku to NIE odmowa ---');
{
  timeSys.gameTime = 300;
  const E = addEmpire('emp_r3');
  seedOpinion(E, 60);                       // opinia wysoko — chodzi wyłącznie o blokadę
  dipl.declareWar(E, 'player_action');

  const blocked = dipl.evaluateTreaty(E, 'trade_agreement');
  ok('w czasie wojny propozycja jest BLOKOWANA, nie oceniana',
    blocked.blocked === true && blocked.breakdown.length === 0);
  dipl.proposeTreaty(E, 'trade_agreement');
  ok('blokada NIE zostawia stempla (karanie za próbę kaskadowałoby absurdem)',
    cooldowns(E).trade_agreement === undefined);

  // Podpisany traktat — druga klasa blokady.
  setWar(E, { exhaustion: 90 });
  dipl.offerPeace(E, 'player_action');      // wyjdź z wojny, żeby dało się podpisać
  timeSys.gameTime = 305;
  dipl.proposeTreaty(E, 'trade_agreement');
  ok('przy wysokiej opinii traktat zostaje PODPISANY', dipl.hasTreaty(E, 'trade_agreement'));
  ok('zgoda NIE stempluje niczego', cooldowns(E).trade_agreement === undefined);
  dipl.proposeTreaty(E, 'trade_agreement');
  ok('powtórka na podpisanym traktacie (already_signed) też NIE stempluje',
    cooldowns(E).trade_agreement === undefined);
}

// ── R4: auto-pokój nie zakleszcza wojny ─────────────────────────────────────
console.log('--- R4: auto-pokój z wyczerpania NIE stempluje (ochrona retry z E3) ---');
{
  timeSys.gameTime = 400;
  const E = addEmpire('emp_r4', 'xenophage');
  seedOpinion(E, -40);
  dipl.declareWar(E, 'player_action');
  setWar(E, { exhaustion: 100, casusBelli: 'extermination' });

  let evt = null;
  EventBus.on('diplomacy:peaceRejected', (e) => { evt = e; });

  ok('auto-pokój przy wyczerpaniu 100 zostaje ODRZUCONY (zachowanie z E3)',
    dipl.offerPeace(E, 'exhaustion_player', { playerInitiated: false }) === false);
  ok('…i NIE zostawia stempla — inaczej każde ponowienie przy kolejnej bitwie ' +
     'dokładałoby stałe −20 i wojna nie skończyłaby się nigdy',
    cooldowns(E).offer_peace === undefined);
  ok('zdarzenie niesie `playerInitiated: false` (modal E4 ma się NIE otwierać)',
    evt?.playerInitiated === false);

  // Ta sama para, ale propozycja ŚWIADOMA — stempel jest.
  evt = null;
  ok('świadoma propozycja gracza także odpada', dipl.offerPeace(E, 'player_action') === false);
  ok('…i TA stempluje', cooldowns(E).offer_peace === 400);
  ok('zdarzenie niesie `playerInitiated: true` (modal E4 ma się otworzyć)',
    evt?.playerInitiated === true);

  // Retry przy kolejnej bitwie nadal działa i nie jest karany stemplem gracza…
  const withStamp = dipl.evaluatePeace(E).score;
  timeSys.gameTime = 400 + RECENT_REFUSAL_YEARS;
  ok('…a po wygaśnięciu stempla wynik wraca w górę (kara jest CZASOWA)',
    dipl.evaluatePeace(E).score > withStamp);
}

// ── R5: emisariusz odprawiony ───────────────────────────────────────────────
console.log('--- R5: odprawiona delegacja stempluje `improve_relations` ---');
{
  timeSys.gameTime = 500;
  const E = addEmpire('emp_r5', 'xenophage');
  seedOpinion(E, -60);
  dipl.relations.setTension('player', E, 90, 'test');

  const verdict = dipl.evaluateEnvoy(E);
  ok('wrogie imperium ODMAWIA przyjęcia delegacji', verdict.decision === false);

  // Ścieżka produkcyjna woła to z MissionSystem._processEnvoyArrival (przy DOTARCIU).
  dipl.noteRefusal(E, 'improve_relations');
  ok('stempel siada na roku DOTARCIA, nie startu misji', cooldowns(E).improve_relations === 500);

  const w = VERB_ACCEPTANCE.improve_relations.terms.recent_refusal;
  const row = dipl.evaluateEnvoy(E).breakdown.find(r => r.term === 'recent_refusal');
  ok(`kolejna delegacja wysłana zaraz potem ma pod górkę (−${w})`, row?.value === -w);
}

// ── R6: round-trip zapisu BEZ bumpu wersji ──────────────────────────────────
console.log('--- R6: pole przeżywa zapis/odczyt (brak migracji, save v100) ---');
{
  const E = 'emp_r1';                        // para ostemplowana w R1
  const snap = JSON.parse(JSON.stringify(gameState.serialize()));
  ok('serialize niesie `verbCooldowns` w rekordzie pary',
    snap.diplomacy.relations[dipl.relations.key('player', E)].verbCooldowns.trade_agreement === 100);

  gameState.restore(snap);
  ok('restore odtwarza stempel co do roku', cooldowns(E).trade_agreement === 100);

  // Rekord SPRZED E4 (bez pola) — dokładnie to, co siedzi w zapisach graczy.
  const key = dipl.relations.key('player', E);
  const legacy = { ...snap.diplomacy.relations[key] };
  delete legacy.verbCooldowns;
  gameState.restore({ ...snap, diplomacy: { ...snap.diplomacy, relations: { ...snap.diplomacy.relations, [key]: legacy } } });
  ok('stary zapis BEZ pola czyta się jako pusta mapa, nie wybuch',
    Object.keys(cooldowns(E)).length === 0);
  timeSys.gameTime = 100;
  ok('…i term degraduje się do 0, a nie do kary',
    dipl.evaluateTreaty(E, 'trade_agreement').breakdown.find(r => r.term === 'recent_refusal').value === 0);

  // Zapisany rok jest ZAWSZE skończoną liczbą — `Number(null)` przechodzi `isFinite`
  // i dałoby pełną karę w roku 0, więc pisarz nie ma prawa wpuścić null/NaN.
  timeSys.gameTime = NaN;
  dipl.noteRefusal(E, 'alliance');
  ok('pisarz NIGDY nie zapisuje null/NaN (inaczej rok 0 = pełna kara znikąd)',
    Number.isFinite(cooldowns(E).alliance));
  timeSys.gameTime = 100;
}

// ── R7: status termu + jeden pisarz ─────────────────────────────────────────
console.log('--- R7: term jest LIVE, a pisarz dokładnie jeden ---');
{
  ok('`recent_refusal` ma status LIVE (E4 dołożył paliwo)',
    ACCEPTANCE_TERMS.recent_refusal.status === TERM_STATUS.LIVE);
  ok('każdy czasownik nadal waży ten term (E1 rozdał wagi, E4 ich nie ruszał)',
    Object.values(VERB_ACCEPTANCE).every(v => (v.terms.recent_refusal ?? 0) > 0));

  // Kto W OGÓLE dotyka pola — wzór pinu P14 z acceptance_engine_smoke. Dozwolone są
  // DOKŁADNIE dwie role i każda ma inną: RelationsModel PISZE (jedyny pisarz, przez
  // `noteVerbRefusal`), AcceptanceEngine CZYTA (wstawia snapshot do ctx termu). Trzeci
  // plik na tej liście oznacza drugie źródło prawdy — i to jest to, czego pilnujemy,
  // bo D5 (pary AI↔AI) będzie musiał zmienić zapis I odczyt JEDNYM ruchem.
  const { readFileSync, readdirSync, statSync } = await import('node:fs');
  const { join, dirname, resolve } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const hits = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.(js|mjs)$/.test(name)) continue;
      if (full.includes('testing')) continue;
      // Komentarze WYCINAMY — plan i noty katalogu opisują to pole słownie i nie są
      // dotknięciem kodu. Pin ma łapać drugie ŹRÓDŁO PRAWDY, nie drugą wzmiankę.
      const code = readFileSync(full, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (/verbCooldowns/.test(code)) hits.push(full.slice(SRC.length + 1));
    }
  };
  walk(SRC);
  const WRITER = ['systems\\diplomacy\\RelationsModel.js', 'systems/diplomacy/RelationsModel.js'];
  const READER = ['systems\\diplomacy\\AcceptanceEngine.js', 'systems/diplomacy/AcceptanceEngine.js'];
  const unexpected = hits.filter(h => !WRITER.includes(h) && !READER.includes(h));
  ok(`pole dotyka WYŁĄCZNIE pisarz + czytelnik${unexpected.length ? ' — nieoczekiwane: ' + unexpected.join(', ') : ''}`,
    unexpected.length === 0);
  ok('pisarz i czytelnik OBAJ są na miejscu (nie wypadł żaden koniec kontraktu)',
    hits.some(h => WRITER.includes(h)) && hits.some(h => READER.includes(h)));
}

// ── R8: modal odmowy — rozbicie DOSŁOWNIE ───────────────────────────────────
console.log('--- R8: treść modala „dlaczego NIE" ---');
{
  const { buildRefusalContent, initDiplomacyRefusals } =
    await import('../../ui/DiplomacyRefusalModal.js');
  const plDict = (await import('../../i18n/pl.js')).default;
  const enDict = (await import('../../i18n/en.js')).default;

  // Tłumacz-atrapa: zwraca sam klucz, więc asercje patrzą na STRUKTURĘ, nie na polski.
  const raw = (k, ...p) => (p.length ? `${k}(${p.join('|')})` : k);

  const mkRows = (n) => Array.from({ length: n }, (_, i) => ({
    term: `t${i}`, labelKey: `diplo.term.t${i}`, status: 'live',
    raw: 1, weight: 10 - i, value: (i % 2 === 0 ? 1 : -1) * (10 - i),
  }));

  {
    const html = buildRefusalContent(
      { score: -6.5, threshold: 0, blocked: false, breakdown: mkRows(3) },
      { translate: raw });
    ok('każdy widoczny term dostaje własny wiersz', mkRows(3).every(r => html.includes(r.labelKey)));
    ok('dodatni wkład jest zielony, ujemny czerwony',
      html.includes('at-stat-pos') && html.includes('at-stat-neg'));
    ok('wkłady mają JAWNY znak (gracz musi widzieć kierunek, nie samą liczbę)',
      html.includes('+10') && html.includes('−9'));
    ok('werdykt podaje wynik I próg — bez progu liczba nic nie znaczy',
      html.includes('diploRefusal.score') && html.includes('diploRefusal.threshold') && html.includes('−6.5'));
  }

  {
    const html = buildRefusalContent(
      { score: -1, threshold: 0, blocked: false, breakdown: mkRows(11) },
      { translate: raw });
    const shown = mkRows(11).filter(r => html.includes(r.labelKey)).length;
    ok('długie rozbicie jest OBCINANE (karta popupu nie ma przewijania)', shown === 6);
    ok('…i mówi WPROST, ile wierszy schowano — cichy limit udawałby komplet',
      html.includes('diploRefusal.moreFactors(5)') || html.includes('diploRefusal.moreFactors'));
    ok('obcięcie zabiera NAJSŁABSZE wkłady (wiersze przychodzą posortowane)',
      html.includes('diplo.term.t0') && !html.includes('diplo.term.t10'));
  }

  {
    const html = buildRefusalContent(
      { score: 0, threshold: 0, blocked: true, reasonKey: 'diplo.reject.natureForbids', breakdown: [] },
      { translate: raw });
    ok('blokada pre-warunku pokazuje POWÓD, nie pustą tabelę',
      html.includes('diplo.reject.natureForbids') && !html.includes('diploRefusal.whyTitle'));
  }

  {
    const html = buildRefusalContent(
      { score: -30, threshold: 0, blocked: false, breakdown: mkRows(2) },
      { translate: raw, cooldownYearsLeft: 2 });
    ok('gdy świeża odmowa obciąża — modal MÓWI, jak długo',
      html.includes('diploRefusal.cooldownYears(2)'));
  }
  {
    const html = buildRefusalContent(
      { score: -30, threshold: 0, blocked: false, breakdown: mkRows(2) },
      { translate: raw, cooldownYearsLeft: 0 });
    ok('bez obciążenia nie ma linii o karencji (zero-wiersz udawałby mechanikę)',
      !html.includes('diploRefusal.cooldown'));
  }

  // ── Bramka `playerInitiated` na żywej ścieżce zdarzeń ──
  initDiplomacyRefusals();
  const mounted = () => document.body.children.length;

  timeSys.gameTime = 600;
  const E = addEmpire('emp_r8', 'xenophage');
  seedOpinion(E, -60);
  dipl.declareWar(E, 'player_action');
  setWar(E, { exhaustion: 0, casusBelli: 'extermination' });

  const beforeAuto = mounted();
  dipl.offerPeace(E, 'exhaustion_player', { playerInitiated: false });
  ok('auto-pokój NIE otwiera modala (inaczej pauzuje grę w środku serii bitew)',
    mounted() === beforeAuto);

  const beforePlayer = mounted();
  dipl.offerPeace(E, 'player_action');
  ok('świadoma propozycja gracza OTWIERA modal', mounted() === beforePlayer + 1);

  // i18n — komplet w OBU słownikach (check-i18n nie pilnuje parytetu, tylko braków).
  const KEYS = [
    'barTitle', 'headlineTreaty', 'headlinePeace', 'headlineEnvoy',
    'descTreaty', 'descPeace', 'descEnvoy', 'whyTitle', 'verdictTitle',
    'score', 'threshold', 'moreFactors', 'blockedTitle', 'reason',
    'unknownReason', 'cooldown', 'cooldownYears', 'ok',
  ].map(k => `diploRefusal.${k}`);
  ok('wszystkie klucze modala są w PL', KEYS.every(k => typeof plDict[k] === 'string'));
  ok('…i w EN (parytet, którego check-i18n NIE egzekwuje)', KEYS.every(k => typeof enDict[k] === 'string'));
  ok('klucze powodów blokady mają tłumaczenia w obu językach',
    ['diplo.reject.atWar', 'diplo.reject.notAtWar', 'diplo.reject.alreadySigned', 'diplo.reject.natureForbids']
      .every(k => typeof plDict[k] === 'string' && typeof enDict[k] === 'string'));
}

// ── R9: flip przycisków + diagnostyka blokad ────────────────────────────────
console.log('--- R9: przycisk mówi „da się złożyć", a powód blokady nie kłamie ---');
{
  timeSys.gameTime = 700;
  const E = addEmpire('emp_r9', 'xenophage');   // trade 0.1, aggression 0.9 — łamie WSZYSTKIE trzy podłogi
  seedOpinion(E, 90);                            // opinia maksymalna: blokuje WYŁĄCZNIE natura

  let rejected = null;
  EventBus.on('diplomacy:treatyRejected', (e) => { rejected = e; });

  const r = dipl.evaluateTreaty(E, 'trade_agreement');
  ok('podłoga osobowości BLOKUJE mimo świetnej opinii (kontrakt E2)',
    r.blocked === true && r.reasonKey === 'diplo.reject.natureForbids');

  dipl.proposeTreaty(E, 'trade_agreement');
  ok('powód w zdarzeniu to `nature_forbids`, a NIE zwinięte „at_war" (diagnostyka = realna ścieżka)',
    rejected?.reason === 'nature_forbids');
  ok('blokada natury nadal NIE stempluje karencji', cooldowns(E).trade_agreement === undefined);

  // Parytet dawnych wartości — słuchacze na nich stoją.
  const W = addEmpire('emp_r9war');
  dipl.declareWar(W, 'player_action');
  rejected = null;
  dipl.proposeTreaty(W, 'trade_agreement');
  ok('blokada wojną nadal melduje dawne `at_war`', rejected?.reason === 'at_war');

  const S = addEmpire('emp_r9signed');
  seedOpinion(S, 60);
  dipl.proposeTreaty(S, 'trade_agreement');
  rejected = null;
  dipl.proposeTreaty(S, 'trade_agreement');
  ok('powtórka na podpisanym nadal melduje dawne `already_signed`',
    rejected?.reason === 'already_signed');

  // Pin źródłowy: panel NIE MA już własnego zdania o tym, czy propozycja przejdzie.
  const { readFileSync } = await import('node:fs');
  const { dirname, resolve, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const overlay = readFileSync(
    join(resolve(dirname(fileURLToPath(import.meta.url)), '../..'), 'ui', 'DiplomacyOverlay.js'), 'utf8');
  ok('DiplomacyOverlay nie pyta silnika o DECYZJĘ przy wyszarzaniu przycisków',
    !/evaluateTreaty/.test(overlay) && !/\.decision/.test(overlay));
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);
