import { CavernRenderer } from "./renderer.js";
import { MovementController } from "./movement.mjs";

const $ = (id) => document.getElementById(id);
const canvas = $("cavern");
const renderer = new CavernRenderer(canvas);
const dialogs = [...document.querySelectorAll("dialog")];
const directions = {
  ArrowUp: "w",
  ArrowLeft: "a",
  ArrowDown: "s",
  ArrowRight: "d",
  w: "w",
  a: "a",
  s: "s",
  d: "d",
};
let engine;
let state;
let started = false;
let run = 1;
let best = 0;
let sound = false;
let audio;
let resultTimer;
let overlayAnimation;
const movement = new MovementController(move);
// Render-level checks (and future debugging) read animation state through here.
window.__cavernRenderer = renderer;

try {
  const stored = Number(localStorage.getItem("crystal-cavern.best.v1"));
  if (Number.isFinite(stored) && stored >= 0 && stored <= 600)
    best = Math.floor(stored);
  sound = localStorage.getItem("crystal-cavern.sound.v1") === "true";
} catch {
  /* Storage can be unavailable in private or restricted contexts. */
}

function icon(name, className = "") {
  return (
    '<svg class="icon ' +
    className +
    '" aria-hidden="true"><use href="#i-' +
    name +
    '"/></svg>'
  );
}

function readState() {
  const width = engine._cavern_width(),
    height = engine._cavern_height();
  const board = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) =>
      String.fromCharCode(engine._cavern_tile(x, y)),
    ),
  );
  return {
    width,
    height,
    board,
    x: engine._cavern_x(),
    y: engine._cavern_y(),
    health: engine._cavern_health(),
    maxHealth: engine._cavern_max_health(),
    torch: engine._cavern_torch(),
    maxTorch: engine._cavern_starting_torch(),
    crystals: engine._cavern_crystals(),
    total: engine._cavern_total_crystals(),
    status: engine._cavern_status(),
    score: engine._cavern_score(),
    message: engine.UTF8ToString(engine._cavern_message()),
  };
}

function updateUI(initial = false) {
  $("crystal-count").textContent = state.crystals;
  if (!$("crystal-slots").children.length) {
    $("crystal-slots").innerHTML = Array.from({ length: state.total }, () =>
      '<span class="crystal-slot">' + icon("crystal") + "</span>").join("");
  }
  [...$("crystal-slots").children].forEach((slot, i) => slot.classList.toggle("found", i < state.crystals));
  $("crystal-slots").setAttribute(
    "aria-label",
    state.crystals + " of " + state.total + " crystals collected",
  );
  $("torch-count").innerHTML =
    state.torch + '<span class="stat-unit"> moves</span>';
  $("torch-fill").style.transform =
    "scaleX(" + state.torch / state.maxTorch + ")";
  $("torch-bar").setAttribute("aria-valuenow", state.torch);
  $("torch-bar").setAttribute("aria-valuemax", state.maxTorch);
  $("torch-bar").classList.toggle("low", state.torch <= 10);
  $("health-count").textContent = state.health;
  $("mobile-crystals").textContent = state.crystals + " / " + state.total;
  $("mobile-torch").textContent = state.torch + " moves";
  $("mobile-health").textContent = state.health + " / " + state.maxHealth;
  if (!$("hearts").children.length) {
    $("hearts").innerHTML = Array.from({ length: state.maxHealth }, () => icon("heart")).join("");
  }
  [...$("hearts").children].forEach((heart, i) => heart.classList.toggle("empty", i >= state.health));
  $("hearts").setAttribute(
    "aria-label",
    state.health + " of " + state.maxHealth + " health",
  );
  $("objective").textContent =
    state.crystals === state.total
      ? "Gate open. Head to the top-right corner."
      : "Collect all five to open the gate.";
  $("journal-message").textContent = initial
    ? "You start in the top-left corner. Look over the paths before you move."
    : state.message;
  $("position-label").textContent = initial
    ? "AT THE ENTRANCE"
    : "COL " +
      String(state.x).padStart(2, "0") +
      " · ROW " +
      String(state.y).padStart(2, "0") +
      " · " +
      (state.maxTorch - state.torch) +
      " STEPS";
  $("run-number").textContent = String(run).padStart(2, "0");
  $("best-score").textContent = best || "—";
  $("run-status").textContent =
    state.status === 1
      ? "MADE IT HOME"
      : state.status === 2
        ? "EXPEDITION ENDED"
        : started
          ? "IN PROGRESS"
          : "READY";
  $("pause-button").disabled = !started || state.status !== 0;
  $("restart-button").disabled = !started;
  canvas.setAttribute(
    "aria-label",
    "Cavern map. Explorer at column " +
      state.x +
      ", row " +
      state.y +
      ". " +
      state.crystals +
      " of " +
      state.total +
      " crystals, " +
      state.health +
      " health, " +
      state.torch +
      " moves remaining.",
  );
}

function tone(frequency, duration, delay = 0, type = "sine", volume = 0.045) {
  if (!sound) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    void audio.resume().catch(() => {});
    const oscillator = audio.createOscillator(),
      gain = audio.createGain();
    const at = audio.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.01);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  } catch {
    /* Audio is optional; gameplay remains available. */
  }
}

function updateSoundButton() {
  $("sound-button").setAttribute("aria-pressed", String(sound));
  $("sound-button").setAttribute(
    "aria-label",
    sound ? "Mute sound" : "Enable sound",
  );
  $("sound-button").title = sound ? "Mute sound" : "Enable sound";
}

function floatingText(text, color) {
  const label = $("pickup-label");
  label.classList.remove("active");
  label.textContent = text;
  label.style.color = color;
  label.style.left = ((state.x + 0.5) / state.width) * 100 + "%";
  label.style.top = ((state.y + 0.1) / state.height) * 100 + "%";
  void label.offsetWidth;
  label.classList.add("active");
}

function isModalOpen() {
  return dialogs.some((dialog) => dialog.open);
}
function stopRepeat() {
  movement.clear();
  document.querySelectorAll(".dpad .pressed").forEach(button => button.classList.remove("pressed"));
}

function move(command) {
  if (!engine || !started || state.status !== 0 || isModalOpen()) return;
  const before = state;
  const moved = engine._cavern_move(command.charCodeAt(0));
  state = readState();
  renderer.setState(state);
  updateUI();
  if (!moved) {
    renderer.bump(command);
    tone(95, 0.07, 0, "triangle", 0.018);
    return;
  }
  if (state.crystals > before.crystals) {
    renderer.burst(state.x, state.y, "#d9ffae");
    floatingText("+1 crystal", "#d9ffae");
    tone(659, 0.18);
    tone(988, 0.25, 0.07);
  } else if (state.health < before.health) {
    renderer.burst(state.x, state.y, "#f0a18e", true);
    floatingText("−2 hearts", "#ffb8a4");
    tone(120, 0.18, 0, "sawtooth", 0.025);
  } else if (before.board[state.y][state.x] === "+") {
    renderer.burst(state.x, state.y, "#c8f3b4");
    floatingText("+" + (state.health - before.health) + " hearts", "#c8f3b4");
    tone(440, 0.2);
    tone(660, 0.23, 0.08);
    tone(880, 0.25, 0.16);
  } else tone(170 + (state.x % 3) * 15, 0.05, 0, "triangle", 0.015);
  if (state.status !== 0) {
    stopRepeat();
    resultTimer = setTimeout(showResult, renderer.reducedMotion ? 0 : 350);
  }
}

function setOverlay(visible) {
  const overlay = $("game-overlay");
  overlayAnimation?.cancel();
  if (visible) overlay.hidden = false;
  if (renderer.reducedMotion) { overlay.hidden = !visible; return; }
  overlayAnimation = overlay.animate(
    [{ opacity: visible ? 0 : 1 }, { opacity: visible ? 1 : 0 }],
    { duration: visible ? 240 : 180, easing: "ease-out", fill: "forwards" },
  );
  const animation = overlayAnimation;
  animation.finished.then(() => {
    if (animation !== overlayAnimation) return;
    overlay.hidden = !visible;
    animation.cancel();
  }).catch(() => {});
}

function startRun(reset = false) {
  if (!engine) return;
  clearTimeout(resultTimer);
  stopRepeat();
  if (reset) {
    engine._cavern_reset();
    run++;
  }
  for (const dialog of dialogs) if (dialog.open) dialog.close();
  started = true;
  state = readState();
  renderer.setState(state, true);
  updateUI(true);
  setOverlay(false);
  $("pickup-label").classList.remove("active");
  canvas.focus({ preventScroll: true });
  tone(330, 0.17);
  tone(495, 0.22, 0.1);
}

function showResult() {
  const won = state.status === 1;
  const record = won && state.score > best;
  if (record) {
    best = state.score;
    try {
      localStorage.setItem("crystal-cavern.best.v1", String(best));
    } catch {}
  }
  $("best-score").textContent = best || "—";
  $("overlay-kicker").textContent = won
    ? record
      ? "A NEW PERSONAL BEST"
      : "EXPEDITION COMPLETE"
    : "RUN ENDED";
  $("overlay-title").textContent = won
    ? "Back to the light."
    : state.health === 0
      ? "A step too far."
      : "One last flicker.";
  $("overlay-description").textContent = won
    ? "You collected all five crystals and reached the gate."
    : state.health === 0
      ? "Spikes cost two hearts every time. The potion sits along the bottom passage."
      : "50 moves gone. A route with less backtracking leaves more room.";
  $("result-stats").hidden = false;
  $("result-stats").innerHTML =
    "<div><strong>" +
    (won ? state.score : state.crystals + "/" + state.total) +
    "</strong><span>" +
    (won ? "points" : "crystals") +
    "</span></div><div><strong>" +
    (state.maxTorch - state.torch) +
    "</strong><span>steps taken</span></div>";
  $("play-button").innerHTML = "Explore again " + icon("reset");
  $("overlay-footnote").textContent = won
    ? "10 points per unused move + 20 per remaining heart."
    : "Replay with a full torch and five hearts.";
  setOverlay(true);
  $("play-button").focus({ preventScroll: true });
  if (won) {
    renderer.burst(state.x, state.y, "#e4ffc0");
    [523, 659, 784, 1047].forEach((note, i) => tone(note, 0.35, i * 0.1));
  } else {
    tone(220, 0.3);
    tone(165, 0.5, 0.2);
  }
}

function openDialog(id) {
  stopRepeat();
  if (!isModalOpen()) $(id).showModal();
}

function requestRestart() {
  if (!engine || !started) return;
  if (state.status !== 0) startRun(true);
  else if (!isModalOpen()) openDialog("restart-dialog");
}

$("play-button").addEventListener("click", () => startRun(started));
$("restart-button").addEventListener("click", requestRestart);
$("confirm-restart").addEventListener("click", () => startRun(true));
$("pause-button").addEventListener("click", () => openDialog("pause-dialog"));
$("sound-button").addEventListener("click", () => {
  sound = !sound;
  updateSoundButton();
  try {
    localStorage.setItem("crystal-cavern.sound.v1", String(sound));
  } catch {}
  if (sound) tone(660, 0.13);
});
document
  .querySelectorAll("[data-dialog]")
  .forEach((button) =>
    button.addEventListener("click", () => openDialog(button.dataset.dialog)),
  );
document
  .querySelectorAll("[data-close]")
  .forEach((button) =>
    button.addEventListener("click", () => button.closest("dialog").close()),
  );
dialogs.forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        dialog.close();
    }
  });
  dialog.addEventListener("close", () => {
    if (started && state?.status === 0) canvas.focus({ preventScroll: true });
  });
});

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || isModalOpen()) return;
  if (event.target.closest("input,textarea,select,[contenteditable=true]"))
    return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (directions[key] && started && state?.status === 0) {
    event.preventDefault();
    if (!event.repeat) movement.press(event.code || key, directions[key], performance.now());
  } else if (
    (key === "Escape" || key === "p") &&
    started &&
    state?.status === 0
  ) {
    event.preventDefault();
    openDialog("pause-dialog");
  } else if (key === "r" && started) {
    event.preventDefault();
    requestRestart();
  } else if (key === "h") {
    event.preventDefault();
    openDialog("help-dialog");
  }
});

document.addEventListener("keyup", event => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  movement.release(event.code || key);
});

document.querySelectorAll("[data-move]").forEach(button => {
  button.addEventListener("pointerdown", event => {
    event.preventDefault();
    if (started && state?.status === 0 && !isModalOpen()) {
      movement.press("pointer-" + event.pointerId, button.dataset.move, performance.now());
      button.classList.add("pressed");
    }
    // Capturing keeps the release when a finger slides off the button, but it
    // throws for a pointer the browser already retired. The step is registered
    // first so a failed capture can never swallow a tap.
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      /* Movement is already queued. */
    }
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
    button.addEventListener(name, event => {
      movement.release("pointer-" + event.pointerId);
      button.classList.remove("pressed");
    });
  }
  button.addEventListener("click", event => {
    if (event.detail === 0 && started && state?.status === 0 && !isModalOpen()) movement.tap(button.dataset.move);
  });
});
window.addEventListener("blur", stopRepeat);
document.addEventListener("visibilitychange", () => {
  stopRepeat();
  if (document.hidden && started && state?.status === 0 && !isModalOpen())
    openDialog("pause-dialog");
});

function frame(now) {
  if (!document.hidden) {
    if (started && state?.status === 0 && !isModalOpen()) movement.update(now);
    renderer.render(now);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
updateSoundButton();
$("best-score").textContent = best || "—";

try {
  const { default: createCavern } = await import("./engine.js");
  engine = await createCavern();
  state = readState();
  renderer.setState(state, true);
  updateUI(true);
  $("play-button").innerHTML = "Enter the cavern " + icon("arrow");
  $("play-button").disabled = false;
  document.body.dataset.engine = "ready";
} catch (error) {
  console.error("Could not load the C++ game engine:", error);
  $("overlay-kicker").textContent = "LOAD ERROR";
  $("overlay-title").textContent = "Couldn’t load the game.";
  $("overlay-description").textContent =
    location.protocol === "file:"
      ? "Open this game through a local web server. The README has the one-command setup."
      : "The game could not load. Check your connection and reload the page.";
  $("play-button").textContent = "Reload the game";
  $("play-button").disabled = false;
  $("play-button").addEventListener("click", () => location.reload(), {
    once: true,
  });
  $("overlay-footnote").textContent =
    "A modern browser with WebAssembly is required.";
  document.body.dataset.engine = "error";
}
