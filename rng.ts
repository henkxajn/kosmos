import type { FromWorkerMessage, ToWorkerMessage } from "./messages";
import { generateWorld } from "../sim/WorldGen";
import { SimEngine } from "../sim/SimEngine";

let engine: SimEngine | null = null;

let last = performance.now();
let running = false;

function post(msg: FromWorkerMessage) {
  (self as DedicatedWorkerGlobalScope).postMessage(msg);
}

function loop() {
  if (!running || !engine) return;

  const now = performance.now();
  const realDt = (now - last) / 1000;
  last = now;

  engine.tick(realDt);

  // snapshot ~5x/s (co ~200ms)
  if (Math.floor(now / 200) !== Math.floor((now - realDt * 1000) / 200)) {
    post({ type: "SNAPSHOT", snapshot: engine.snapshot() });
  }

  setTimeout(loop, 16);
}

self.onmessage = (ev: MessageEvent<ToWorkerMessage>) => {
  const msg = ev.data;

  if (msg.type === "INIT") {
    const world = generateWorld(msg.seed);
    engine = new SimEngine(world);
    running = true;
    last = performance.now();
    post({ type: "READY" });
    post({ type: "LOG", message: `Initialized with seed="${msg.seed}"` });
    loop();
    return;
  }

  if (!engine) return;

  switch (msg.type) {
    case "SET_PAUSED":
      engine.setPaused(msg.paused);
      post({ type: "LOG", message: `Paused=${msg.paused}` });
      break;
    case "SET_TIMESCALE":
      engine.setTimeScale(msg.timeScale);
      post({ type: "LOG", message: `TimeScale=${msg.timeScale}` });
      break;
    case "REQUEST_SNAPSHOT":
      post({ type: "SNAPSHOT", snapshot: engine.snapshot() });
      break;
  }
};
