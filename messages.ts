import type { FromWorkerMessage, ToWorkerMessage } from "./worker/messages";

const app = document.getElementById("app")!;
app.innerHTML = `
  <div style="font-family: system-ui; padding: 16px; line-height: 1.4;">
    <h1 style="margin: 0 0 8px;">Pastel Orbits — Stage 1</h1>
    <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
      <button id="pause">Pause/Resume</button>
      <label>TimeScale:
        <input id="ts" type="range" min="0" max="20000" step="100" value="2000" />
        <span id="tsv">2000</span>
      </label>
      <button id="snap">Snapshot</button>
    </div>
    <p>Otwórz DevTools → Console. Snapshoty lecą automatycznie ~5/s.</p>
    <pre id="status" style="background:#f6f6f6; padding:12px; border-radius:8px; overflow:auto;"></pre>
  </div>
`;

const status = document.getElementById("status") as HTMLPreElement;

const worker = new Worker(new URL("./worker/sim.worker.ts", import.meta.url), { type: "module" });

let paused = false;

function send(msg: ToWorkerMessage) {
  worker.postMessage(msg);
}

function fmtTime(t: number) {
  const days = t / 86400;
  return `${t.toFixed(1)} s  (~${days.toFixed(2)} days)`;
}

worker.onmessage = (ev: MessageEvent<FromWorkerMessage>) => {
  const msg = ev.data;
  if (msg.type === "READY") {
    console.log("[worker] READY");
    return;
  }
  if (msg.type === "LOG") {
    console.log("[worker]", msg.message);
    return;
  }
  if (msg.type === "SNAPSHOT") {
    const s = msg.snapshot;

    const lines: string[] = [];
    lines.push(`seed: ${s.seed}`);
    lines.push(`time: ${fmtTime(s.timeSeconds)}  paused=${s.paused}  timeScale=${s.timeScale}`);
    lines.push("");
    lines.push("bodies:");
    for (const b of s.bodies) {
      const p = b.position;
      const per = b.periodSeconds ? `${(b.periodSeconds / 86400).toFixed(2)} d` : "-";
      lines.push(
        `- ${b.type.padEnd(6)} ${b.name.padEnd(16)} period=${per.padEnd(8)} pos=(${(p.x/1e9).toFixed(2)}, ${(p.y/1e9).toFixed(2)}, ${(p.z/1e9).toFixed(2)}) Gm`
      );
    }
    status.textContent = lines.join("\n");
  }
};

// init z seedem
const seed = "demo-seed-001";
send({ type: "INIT", seed });

// UI controls
(document.getElementById("pause") as HTMLButtonElement).onclick = () => {
  paused = !paused;
  send({ type: "SET_PAUSED", paused });
};

const ts = document.getElementById("ts") as HTMLInputElement;
const tsv = document.getElementById("tsv") as HTMLSpanElement;
ts.oninput = () => {
  const v = Number(ts.value);
  tsv.textContent = String(v);
  send({ type: "SET_TIMESCALE", timeScale: v });
};

(document.getElementById("snap") as HTMLButtonElement).onclick = () => {
  send({ type: "REQUEST_SNAPSHOT" });
};
