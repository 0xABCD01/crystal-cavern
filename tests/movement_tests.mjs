import test from "node:test";
import assert from "node:assert/strict";
import { MovementController } from "../web/movement.mjs";

test("quick taps are served in order one per frame", () => {
  const steps = [];
  const input = new MovementController(key => steps.push(key));
  input.press("d", "d", 0); input.release("d"); input.update(0);
  assert.deepEqual(steps, ["d"]);
  input.press("s", "s", 20); input.release("s");
  input.press("a", "a", 30); input.release("a");
  input.update(40);
  assert.deepEqual(steps, ["d", "s"]);
  input.update(60);
  assert.deepEqual(steps, ["d", "s", "a"]);
});

test("pressing faster than the step gate never drops a move", () => {
  const steps = [];
  const input = new MovementController(key => steps.push(key));
  const pressed = "dadadadadadadada".split("");
  let now = 0;
  for (const key of pressed) {
    input.press(key, key, now);
    input.release(key);
    now += 120; // faster than the 140 ms gate, the way a person mashes
    input.update(now);
  }
  for (let frame = 0; frame < 20; frame++) input.update(now + frame * 16);
  assert.deepEqual(steps, pressed);
});

test("holding a key uses the game clock and ignores OS repeat", () => {
  const steps = [];
  const input = new MovementController(key => steps.push(key));
  input.press("d", "d", 0); input.update(0);
  input.press("d", "d", 50); input.press("d", "d", 80);
  input.update(140); input.update(259);
  assert.deepEqual(steps, ["d"]);
  input.update(260); input.update(400);
  assert.deepEqual(steps, ["d", "d", "d"]);
  input.release("d"); input.update(600);
  assert.equal(steps.length, 3);
});

test("a new direction takes over and release resumes the previous held key", () => {
  const steps = [];
  const input = new MovementController(key => steps.push(key));
  input.press("d", "d", 0); input.update(0);
  input.press("s", "s", 100); input.update(140); input.update(360);
  input.release("s"); input.update(500);
  assert.deepEqual(steps, ["d", "s", "s", "d"]);
});

test("pause and focus loss clear held keys and pending taps", () => {
  const steps = [];
  const input = new MovementController(key => steps.push(key));
  input.press("d", "d", 0); input.tap("s"); input.clear(); input.update(1000);
  assert.deepEqual(steps, []);
  input.press("a", "a", 1001); input.update(1001);
  assert.deepEqual(steps, ["a"]);
});

test("slow frames do not trigger a burst of catch-up moves", () => {
  const steps = [];
  const input = new MovementController(key => steps.push(key));
  input.press("d", "d", 0); input.update(0); input.update(2000);
  assert.deepEqual(steps, ["d", "d"]);
});

test("a queued tap is served before an aged repeat", () => {
  const steps = [];
  const input = new MovementController(key => steps.push(key));
  // The hold ages past its gate, then a deliberate tap lands before the next
  // frame. The tap expresses the newer intent and must win the slot.
  input.press("d", "d", 0); input.update(0); input.update(400);
  input.tap("a");
  input.update(560);
  assert.deepEqual(steps, ["d", "d", "a"]);
});

test("releasing a held key never discards taps already queued", () => {
  const steps = [];
  const input = new MovementController(key => steps.push(key));
  input.press("d", "d", 0); input.update(0);
  input.tap("s");
  input.release("d");
  input.update(2000);
  assert.deepEqual(steps, ["d", "s"]);
});

test("the queue guard caps a scripted flood", () => {
  const steps = [];
  const input = new MovementController(key => steps.push(key));
  for (let i = 0; i < 40; i++) input.tap("d");
  for (let frame = 0; frame < 45; frame++) input.update(frame * 200);
  assert.equal(steps.length, 32);
});
