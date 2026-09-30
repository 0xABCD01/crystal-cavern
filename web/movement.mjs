// Keyboard and touch share one clock. OS key repeat never changes game speed.
export const MOVE_STEP_MS = 140;
export const MOVE_REPEAT_DELAY_MS = 260;
// A guard against a scripted flood, well above anything a person can press.
const MAX_QUEUED_TAPS = 32;

export class MovementController {
  constructor(
    onStep,
    { stepMs = MOVE_STEP_MS, repeatDelay = MOVE_REPEAT_DELAY_MS } = {},
  ) {
    this.onStep = onStep;
    this.stepMs = stepMs;
    this.repeatDelay = repeatDelay;
    this.held = new Map();
    this.queue = [];
    this.nextStepAt = 0;
  }

  press(token, direction, now) {
    if (this.held.has(token)) return;
    this.held.set(token, { direction, repeatAt: now + this.repeatDelay });
    this.tap(direction);
  }

  tap(direction) {
    // Every deliberate tap has to land. Rapid presses queue in order instead of
    // overwriting each other, so a fast player never loses a move.
    if (this.queue.length < MAX_QUEUED_TAPS) this.queue.push(direction);
  }

  release(token) {
    this.held.delete(token);
  }

  update(now) {
    // A tap is served on the next frame, because the player already made that
    // decision. Only the held-key repeat waits for the step gate, which keeps a
    // leaning finger from draining the torch. One step per frame either way, so
    // a stalled frame can never burst through the queue.
    const tapped = this.queue.shift();
    if (tapped) {
      this.nextStepAt = now + this.stepMs;
      this.onStep(tapped);
      return;
    }
    if (now < this.nextStepAt) return;
    const held = [...this.held.values()].at(-1);
    if (!held || now < held.repeatAt) return;
    this.nextStepAt = now + this.stepMs;
    this.onStep(held.direction);
  }

  clear() {
    this.held.clear();
    this.queue.length = 0;
    this.nextStepAt = 0;
  }
}
