import { generateWorld } from "../sim/WorldGen.js";
import { SimEngine } from "../sim/SimEngine.js";

let engine = null;
let last = performance.now();
let running = false;

function post(msg) { self.postMessage(msg); }

function loop() {
  if (!running || !engine) return;

  const now = performance.now();
  const realDt = (now - last) / 1000;
  last = now;

  engine.tick(realDt);

  if (Math.floor(now / 100) !== Math.floor((now - realDt * 1000) / 100)) {
    post({ type: "SNAPSHOT", snapshot: engine.snapshot() });
  }

  setTimeout(loop, 16);
}

self.onmessage = (ev) => {
  const msg = ev.data;

  if (msg.type === "INIT") {
    const world = generateWorld(msg.seed);
    engine = new SimEngine(world);
    running = true;
    last = performance.now();
    post({ type: "READY" });
    post({ type: "LOG", message: `Initialized with seed=\"${msg.seed}\"` });
    loop();
    return;
  }

  if (!engine) return;

  switch (msg.type) {
    case "SET_PAUSED":
      engine.setPaused(msg.paused);
      break;
    case "SET_TIMESCALE":
      engine.setTimeScale(msg.timeScale);
      break;
    case "REQUEST_SNAPSHOT":
      post({ type: "SNAPSHOT", snapshot: engine.snapshot() });
      break;
  }
};
