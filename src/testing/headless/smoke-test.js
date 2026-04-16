// Smoke test Step 1 — verify env.js + EventBus import działa w Node.js
import './env.js';
import EventBus from '../../core/EventBus.js';

console.log('─── Smoke Test Step 1 ───');

// Test 1: EventBus emit/on
let receivedEvent = null;
EventBus.on('smoke:test', (data) => { receivedEvent = data; });
EventBus.emit('smoke:test', { msg: 'hello', n: 42 });

const test1 = receivedEvent && receivedEvent.msg === 'hello' && receivedEvent.n === 42;
console.log(`Test 1 EventBus emit/on: ${test1 ? '✅ PASS' : '❌ FAIL'} (received: ${JSON.stringify(receivedEvent)})`);

// Test 2: Seeded Math.random daje te same wyniki dla tego samego seed
const r1 = Math.random();
const r2 = Math.random();
const r3 = Math.random();
console.log(`Test 2 Seeded Math.random: r1=${r1.toFixed(6)} r2=${r2.toFixed(6)} r3=${r3.toFixed(6)}`);
console.log(`   (przy KOSMOS_SEED="kosmos-default" te wartości powinny być takie same w każdym uruchomieniu)`);

// Test 3: localStorage działa
localStorage.setItem('testKey', 'testValue');
const got = localStorage.getItem('testKey');
const test3 = got === 'testValue';
console.log(`Test 3 localStorage: ${test3 ? '✅ PASS' : '❌ FAIL'}`);

// Test 4: document.createElement / getElementById
const div = document.createElement('div');
div.id = 'foo';
const canv = document.getElementById('three-canvas');
const test4 = div && div.tagName === 'DIV' && canv && canv.id === 'three-canvas';
console.log(`Test 4 DOM stubs: ${test4 ? '✅ PASS' : '❌ FAIL'}`);

// Test 5: window.KOSMOS istnieje
const test5 = window.KOSMOS && window.KOSMOS.scenario === 'civilization';
console.log(`Test 5 window.KOSMOS: ${test5 ? '✅ PASS' : '❌ FAIL'}`);

// Test 6: setTimeout(cb, 0) wykonuje się synchronicznie
let syncCalled = false;
setTimeout(() => { syncCalled = true; }, 0);
console.log(`Test 6 setTimeout(0) sync: ${syncCalled ? '✅ PASS' : '❌ FAIL'}`);

// Test 7: THREE proxy działa
const mat = new THREE.Mesh();
const test7 = mat !== null;
console.log(`Test 7 THREE mock: ${test7 ? '✅ PASS' : '❌ FAIL'}`);

const allPass = test1 && test3 && test4 && test5 && syncCalled && test7;
console.log(`\n${allPass ? '✅ STEP 1 SUCCESS' : '❌ STEP 1 FAIL'}`);
process.exit(allPass ? 0 : 1);
