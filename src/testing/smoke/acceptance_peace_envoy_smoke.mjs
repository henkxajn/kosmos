// D2/E3 (WOJNA I POKÓJ 1.0) — smoke: pokój i emisariusz dostają PIERWSZE sprawdzenie.
// Uruchom: node src/testing/smoke/acceptance_peace_envoy_smoke.mjs
//
// Audyt R5: `offerPeace` ustawiał rozejm bezwarunkowo, a `_launchEnvoy` walidował
// WYŁĄCZNIE stronę gracza — nie było zahardkodowanego `true` do odwrócenia, brakowało
// samego punktu decyzyjnego. E3 go wprowadza, więc ten plik pilnuje rzeczy, których
// wcześniej NIE DAŁO SIĘ przetestować, bo nie istniały.
//
//   P1 pokój odrzucany przy niskim wyczerpaniu, przyjmowany przy wysokim
//   P2 `casusBelli.peaceCost` MIERZALNIE waży (pierwszy czytelnik tego pola w grze)
//   P3 auto-pokój przestał być obejściem + nie zakleszcza wojny na suficie wyczerpania
//   P4 emisariusz może zostać odrzucony; statek wraca, dobra wola NIE jest naliczana
//   P5 mostek `getTrustEquivalent` zniknął (warunek zamknięcia D2)

import '../headless/env.js';   // shim window/localStorage/document/THREE (pierwszy!)

const EventBus        = (await import('../../core/EventBus.js')).default;
const { GAME_CONFIG } = await import('../../config/GameConfig.js');
const { DiplomacySystem } = await import('../../systems/DiplomacySystem.js');
const { CASUS_BELLI }     = await import('../../data/CasusBelliData.js');
const { ARCHETYPES }      = await import('../../data/EmpireData.js');
const { VERB_ACCEPTANCE } = await import('../../data/AcceptanceWeightData.js');
const plDict = (await import('../../i18n/pl.js')).default;
const enDict = (await import('../../i18n/en.js')).default;

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
  // Stub WarSystem w kształcie, jakiego używa `AcceptanceEngine._buildWarContext`.
  warSystem: { getWarWith: (empireId) => wars.get(empireId) ?? null },
};
const dipl = new DiplomacySystem();
window.KOSMOS.diplomacySystem = dipl;

const addEmpire = (id, archetype = 'industrialist') => {
  empires.set(id, { id, name: id, archetype, personality: { ...ARCHETYPES[archetype].personality }, objective: 'merchant', traits: [] });
  return id;
};
const seedOpinion = (id, value) => dipl.addOpinionModifier(id, 'player', 'legacy_relations', { value, source: 'test' });
/** Wojna w kształcie rekordu WarSystem: wyczerpanie kluczowane ID STRONY. */
const setWar = (id, { exhaustion = 0, casusBelli = 'border_incident' } = {}) => {
  wars.set(id, { id: `war_${id}`, active: true, casusBelli, exhaustion: { player: exhaustion, [id]: exhaustion } });
};

// ── P1: pokój ma wreszcie warunek ───────────────────────────────────────────
console.log('--- P1: pokój odrzucany / przyjmowany zależnie od wyczerpania ---');
{
  addEmpire('emp_p1');
  dipl.declareWar('emp_p1', 'player_action');
  let rejected = null, signed = null;
  const offR = EventBus.on('diplomacy:peaceRejected', (e) => { rejected = e; });
  const offS = EventBus.on('diplomacy:peaceSigned',   (e) => { signed = e; });

  setWar('emp_p1', { exhaustion: 10, casusBelli: 'border_incident' });
  ok('ODMOWA przy niskim wyczerpaniu (10 < cena 30) — czego gra nigdy wcześniej nie robiła',
    dipl.offerPeace('emp_p1', 'player_action') === false
    && rejected?.result?.decision === false && dipl.getStatus('emp_p1') === 'war');
  ok('odmowa niesie rozbicie (E4 narysuje z niego modal)',
    Array.isArray(rejected.result.breakdown) && rejected.result.breakdown.length > 0);
  ok('odmowa zostawia ŚLAD w pamięci relacji (dowód dla casus belli i UI)',
    dipl.getMemory('emp_p1', 20).some(m => m.type === 'peace_refused'));

  setWar('emp_p1', { exhaustion: 80, casusBelli: 'border_incident' });
  ok('ZGODA przy wysokim wyczerpaniu (80 > cena 30)',
    dipl.offerPeace('emp_p1', 'player_action') === true
    && dipl.getStatus('emp_p1') === 'truce' && signed?.result?.decision === true);
  ok('przyjęty pokój dalej robi to, co dawniej: rozejm z licznikiem + recent_war zamiast at_war',
    dipl.getTruceYearsLeft('emp_p1') > 0
    && dipl.relations.hasModifier('emp_p1', 'player', 'recent_war')
    && !dipl.relations.hasModifier('emp_p1', 'player', 'at_war'));
  ok('poza stanem wojny propozycja nadal odbija się bez oceny (zachowanie sprzed D2)',
    dipl.offerPeace('emp_p1', 'player_action') === false);
  if (typeof offR === 'function') offR();
  if (typeof offS === 'function') offS();
}

// ── P2: peaceCost wreszcie coś kosztuje ─────────────────────────────────────
console.log('--- P2: casusBelli.peaceCost — pierwszy czytelnik w grze ---');
{
  const scoreFor = (cb, exhaustion, archetype = 'industrialist') => {
    const id = `emp_cb_${cb}_${exhaustion}_${archetype}`;
    addEmpire(id, archetype);
    seedOpinion(id, -40);
    dipl.declareWar(id, 'player_action');
    dipl.relations.setTension('player', id, 80, 'test');
    setWar(id, { exhaustion, casusBelli: cb });
    return dipl.evaluatePeace(id);
  };
  ok('droższy casus belli ⇒ NIŻSZY wynik przy tym samym wyczerpaniu',
    scoreFor('border_incident', 50).score > scoreFor('ideology', 50).score);
  ok('cena pokoju przekłada się na DECYZJĘ, nie tylko na punkty (50 wyczerpania)',
    scoreFor('border_incident', 50).decision === true && scoreFor('ideology', 50).decision === false);
  ok('drabina cen jest monotoniczna: 30 → 40 → 50 → 70 obniża wynik po kolei', (() => {
    const s = ['border_incident', 'tech_theft', 'territorial_claim', 'ideology'].map(cb => scoreFor(cb, 50).score);
    return s.every((v, i) => i === 0 || v < s[i - 1]);
  })());
  // ⚠ Eksterminację dobiera `inferCasusBelli` WYŁĄCZNIE dla xenofaga i roju, więc tylko
  // z nimi ma sens ją testować. To jest też uczciwa granica mechaniki: samo `peaceCost 100`
  // NIE wystarcza — przy spokojnym archetypie pełne wyczerpanie i tak przeważa (wynik +10).
  // „Praktycznie brak pokoju" wychodzi z PARY cena × natura, i tak też trafia do gry.
  ok('eksterminacja + xenofag — pokój nieosiągalny nawet przy pełnym wyczerpaniu',
    scoreFor('extermination', 100, 'xenophage').decision === false);
  ok('eksterminacja + rój — tak samo', scoreFor('extermination', 100, 'swarm').decision === false);
  ok('…i to jest dokładnie to, co katalog obiecywał od zawsze',
    CASUS_BELLI.extermination.peaceCost === 100 && CASUS_BELLI.border_incident.peaceCost === 30);
  ok('term wyczerpania bierze MINIMUM obu stron (kontrakt danych: „obie strony")', (() => {
    const id = 'emp_asym';
    addEmpire(id);
    dipl.declareWar(id, 'player_action');
    wars.set(id, { id: 'w', active: true, casusBelli: 'border_incident', exhaustion: { player: 100, [id]: 0 } });
    const asym = dipl.evaluatePeace(id).score;
    wars.set(id, { id: 'w', active: true, casusBelli: 'border_incident', exhaustion: { player: 0, [id]: 0 } });
    return asym === dipl.evaluatePeace(id).score;
  })());
  ok('war_status to NAJCIĘŻSZY term propozycji pokoju', (() => {
    const w = VERB_ACCEPTANCE.offer_peace.terms;
    return Object.entries(w).every(([k, v]) => k === 'war_status' || Math.abs(v) <= w.war_status);
  })());
}

// ── P3: auto-pokój przestał być obejściem ───────────────────────────────────
console.log('--- P3: WarSystem._triggerAutoPeace przez silnik ---');
{
  const { WarSystem } = await import('../../systems/WarSystem.js');
  const warSys = new WarSystem();
  window.KOSMOS.warSystem = warSys;   // podmiana stuba na prawdziwy system

  addEmpire('emp_auto', 'xenophage');
  dipl.declareWar('emp_auto', 'player_action');
  const war = warSys.createWar('player', 'emp_auto', 'extermination');
  let refusedEvt = null;
  const offRef = EventBus.on('war:autoPeaceRefused', (e) => { refusedEvt = e; });

  warSys.changeExhaustion(war.id, 'player', 100, 'test');
  ok('sufit wyczerpania NIE kończy już wojny automatycznie (eksterminacja + xenofag)',
    dipl.getStatus('emp_auto') === 'war' && refusedEvt?.warId === war.id);
  ok('odmowa auto-pokoju jest OGŁASZANA (inaczej wygląda jak zawieszony system)',
    refusedEvt.casusBelli === 'extermination');

  // ⚠ Wyczerpanie jest clampowane do 100 — bez retry pierwsza odmowa zamykałaby wojnę
  // w stanie „nie da się zakończyć" na zawsze (wczesny return w changeExhaustion).
  refusedEvt = null;
  warSys.changeExhaustion(war.id, 'player', 15, 'kolejna bitwa');
  ok('kolejna bitwa na suficie PONAWIA próbę (brak zakleszczenia)', refusedEvt !== null);

  // Ta sama ścieżka, ale wojna do wygaszenia: tani casus belli i spokojny archetyp.
  addEmpire('emp_auto2', 'industrialist');
  dipl.declareWar('emp_auto2', 'player_action');
  const war2 = warSys.createWar('player', 'emp_auto2', 'border_incident');
  warSys.changeExhaustion(war2.id, 'player', 100, 'test');
  warSys.changeExhaustion(war2.id, 'emp_auto2', 100, 'test');
  ok('tani casus belli + spokojny archetyp ⇒ auto-pokój dalej DZIAŁA',
    dipl.getStatus('emp_auto2') === 'truce');
  if (typeof offRef === 'function') offRef();
  window.KOSMOS.warSystem = { getWarWith: (empireId) => wars.get(empireId) ?? null };
}

// ── P4: emisariusz może zostać odrzucony ────────────────────────────────────
console.log('--- P4: emisariusz — ocena przy DOTARCIU, statek wraca ---');
{
  const { MissionSystem } = await import('../../systems/MissionSystem.js');
  const ms = new MissionSystem();
  const released = [];
  window.KOSMOS.vesselManager = { releaseFromAbstractMission: (id) => { released.push(id); return true; } };

  // Wrogie imperium w stanie wojny — delegacja nie zostanie przyjęta.
  addEmpire('emp_env_no', 'xenophage');
  seedOpinion('emp_env_no', -60);
  dipl.declareWar('emp_env_no', 'player_action');
  dipl.relations.setTension('player', 'emp_env_no', 90, 'test');
  let refused = null, returned = null;
  const offRf = EventBus.on('diplomacy:envoyRefused',  (e) => { refused = e; });
  const offRt = EventBus.on('diplomacy:envoyReturned', (e) => { returned = e; });

  const expNo = { id: 'x1', type: 'envoy', targetEmpireId: 'emp_env_no', status: 'en_route', vesselId: 'v1' };
  ms._processEnvoyArrival(expNo);
  ok('delegacja ODRZUCONA — czego gra nigdy wcześniej nie robiła',
    refused?.empireId === 'emp_env_no' && expNo.refused === true);
  ok('odrzucona delegacja NIE nalicza dobrej woli',
    !dipl.relations.hasModifier('emp_env_no', 'player', 'envoy_goodwill'));
  ok('statek mimo wszystko WRACA (Decyzja 4 fazy), a nie znika', expNo.status === 'returning');

  ms._completeEnvoy(expNo);
  ok('noga powrotna też NIE nalicza dobrej woli (znacznik jedzie na misji)',
    !dipl.relations.hasModifier('emp_env_no', 'player', 'envoy_goodwill'));
  ok('blokada statku zwolniona normalnie', released.includes('v1'));
  ok('powrót ogłasza, że był bezowocny', returned?.refused === true);
  ok('znacznik odmowy przeżywa serializację misji (spread — bez bumpu zapisu)', (() => {
    ms._missions = [expNo];
    const round = JSON.parse(JSON.stringify(ms.serialize()));
    return round.missions[0].refused === true;
  })());

  // Przyjazne imperium — ścieżka sprzed D2 bez zmian.
  addEmpire('emp_env_ok', 'industrialist');
  seedOpinion('emp_env_ok', 20);
  const expOk = { id: 'x2', type: 'envoy', targetEmpireId: 'emp_env_ok', status: 'en_route', vesselId: 'v2' };
  ms._processEnvoyArrival(expOk);
  ok('przyjazne imperium PRZYJMUJE delegację → +5 jak dotąd',
    !expOk.refused && dipl.relations.hasModifier('emp_env_ok', 'player', 'envoy_goodwill'));
  const opAfterArrival = dipl.getOpinionOfPlayer('emp_env_ok');
  ms._completeEnvoy(expOk);
  ok('powrót dokłada drugie +5 (parytet: łącznie +10 za kurs)',
    dipl.getOpinionOfPlayer('emp_env_ok') === opAfterArrival + 5);
  if (typeof offRf === 'function') offRf();
  if (typeof offRt === 'function') offRt();
}

// ── P5: warunek zamknięcia D2 + i18n odmów ──────────────────────────────────
console.log('--- P5: mostek zniknął, odmowy mają głos w Dzienniku ---');
{
  ok('getTrustEquivalent USUNIĘTY z DiplomacySystem', dipl.getTrustEquivalent === undefined);
  for (const k of ['log.diplo.envoyRefused', 'log.diplo.peaceRejected', 'log.diplo.autoPeaceRefused']) {
    ok(`klucz '${k}' istnieje w pl i en`, !!plDict[k] && !!enDict[k] && plDict[k] !== enDict[k]);
  }
  ok('emisariusz zachowuje osobowość jako TERM (brak dawnej reguły do odtworzenia)',
    VERB_ACCEPTANCE.improve_relations.terms.personality > 0
    && !VERB_ACCEPTANCE.improve_relations.personalityFloor);
  ok('pokój NIE ma podłogi osobowości — wojna musi mieć wyjście dla każdego archetypu',
    !VERB_ACCEPTANCE.offer_peace.personalityFloor);
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
