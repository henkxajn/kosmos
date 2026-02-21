import { Camera2D } from "./render/Camera2D.js";
import { Renderer2D } from "./render/Renderer2D.js";

const canvas = document.getElementById("c");
const status = document.getElementById("status");
const followSelect = document.getElementById("follow");
const speedSelect = document.getElementById("speed");

const worker = new Worker("./src/worker/sim.worker.js", { type: "module" });

const camera = new Camera2D(canvas);
const renderer = new Renderer2D(canvas, camera);

let prevSnap = null;
let nextSnap = null;
let prevWall = 0;
let nextWall = 0;

let paused = false;

function send(msg) { worker.postMessage(msg); }
function setStatus(text) { status.textContent = text; }

function fmtTime(t) {
  const days = t / 86400;
  const years = days / 365.25;
  return `${t.toFixed(1)} s  (~${days.toFixed(2)} d, ~${years.toFixed(3)} y)`;
}

function refreshFollowDropdown(snapshot) {
  const current = followSelect.value;
  followSelect.innerHTML = '<option value="">(free)</option>';
  for (const b of snapshot.bodies) {
    const opt = document.createElement("option");
    opt.value = b.id;
    opt.textContent = `${b.name} [${b.type}]`;
    followSelect.appendChild(opt);
  }
  if ([...followSelect.options].some(o => o.value === current)) {
    followSelect.value = current;
  } else {
    followSelect.value = "";
    camera.setFollow(null);
  }
}

worker.onmessage = (ev) => {
  const msg = ev.data;

  if (msg.type === "READY") return;
  if (msg.type === "LOG") { console.log("[worker]", msg.message); return; }

  if (msg.type === "SNAPSHOT") {
    const now = performance.now();

    if (!nextSnap) {
      prevSnap = msg.snapshot;
      nextSnap = msg.snapshot;
      prevWall = now;
      nextWall = now;
      refreshFollowDropdown(msg.snapshot);
      renderer.setSnapshot(msg.snapshot);
      return;
    }

    prevSnap = nextSnap;
    prevWall = nextWall;
    nextSnap = msg.snapshot;
    nextWall = now;

    refreshFollowDropdown(msg.snapshot);
    renderer.setOrbitCacheFromSnapshot(msg.snapshot);
  }
};

document.getElementById("pause").onclick = () => {
  paused = !paused;
  send({ type: "SET_PAUSED", paused });
};

document.getElementById("resetCam").onclick = () => camera.reset();

followSelect.onchange = () => {
  const id = followSelect.value || null;
  camera.setFollow(id);
};

renderer.onPick = (pickedId) => {
  if (!pickedId) return;
  followSelect.value = pickedId;
  camera.setFollow(pickedId);
};

speedSelect.onchange = () => {
  send({ type: "SET_TIMESCALE", timeScale: Number(speedSelect.value) });
};

send({ type: "INIT", seed: "demo-seed-001" });
send({ type: "SET_TIMESCALE", timeScale: Number(speedSelect.value) });

function animate() {
  requestAnimationFrame(animate);

  if (prevSnap && nextSnap && nextWall > prevWall) {
    const now = performance.now();
    const alpha = Math.max(0, Math.min(1, (now - prevWall) / (nextWall - prevWall)));
    const interp = renderer.interpolateSnapshots(prevSnap, nextSnap, alpha);
    renderer.render(interp);

    const follow = camera.followId ? `follow=${camera.followId}` : "follow=(free)";
    setStatus(
      `seed: ${interp.seed}\n` +
      `time: ${fmtTime(interp.timeSeconds)}\n` +
      `paused=${interp.paused}  timeScale=${interp.timeScale}  ${follow}\n` +
      `zoom=${camera.zoom.toFixed(3)}\n` +
      `bodies: ${interp.bodies.length}`
    );
  } else if (nextSnap) {
    renderer.render(nextSnap);
  }
}

animate();
