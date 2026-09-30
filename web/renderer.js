// Original procedural artwork: no textures, sprite downloads, or art dependencies.
import { MOVE_STEP_MS } from "./movement.mjs";

const TILE = 64;
const BOARD_WIDTH = 960; // 15 tiles wide
const BOARD_HEIGHT = 576; // 9 tiles tall
// The walk finishes a little before the next step is allowed, so every step
// lands on a settled frame instead of fighting the one behind it.
const TWEEN_MS = MOVE_STEP_MS * 0.82;
const BUMP_MS = 180;
// Retina screens get a sharper picture; a 3x phone does not need 8x the pixels.
const MAX_PIXEL_RATIO = 2;
const hash = (x, y, seed = 0) => {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return value - Math.floor(value);
};

export class CavernRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    matchMedia("(prefers-reduced-motion: reduce)").addEventListener(
      "change",
      (event) => {
        this.reducedMotion = event.matches;
        // Live particles would smear without the per-frame clear that motion
        // mode no longer performs.
        this.particles.length = 0;
      },
    );
    this.state = null;
    this.player = { x: 1, y: 1, fromX: 1, fromY: 1, since: 0 };
    this.particles = [];
    this.facing = 1;
    this.hitAt = -1000;
    this.lastTime = 0;
    this.bumpX = 0;
    this.bumpY = 0;
    this.bumpAt = -1000;
    this.scaleX = 1;
    this.scaleY = 1;
    this.glows = new Map();
    this.vignette = null;
    // Reduced motion renders a static scene, so frames after the first are
    // skipped entirely and the battery does the rest.
    this.terrain = document.createElement("canvas");
    this.resize();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    addEventListener("resize", () => this.resize());
  }

  // The board is always drawn in a 960x576 space; only the backing store grows,
  // which keeps the artwork crisp on retina screens without scaling every number.
  resize() {
    const ratio = Math.min(devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const box = this.canvas.getBoundingClientRect();
    const width = Math.round(box.width * ratio);
    const height = Math.round(box.height * ratio);
    if (width < 8 || height < 8) return;
    if (width === this.canvas.width && height === this.canvas.height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.scaleX = width / BOARD_WIDTH;
    this.scaleY = height / BOARD_HEIGHT;
    this.terrain.width = width;
    this.terrain.height = height;
    for (const ctx of [this.ctx, this.terrain.getContext("2d")]) {
      ctx.setTransform(this.scaleX, 0, 0, this.scaleY, 0, 0);
    }
    this.vignette = null;
    this.staticFrameDrawn = false;
    if (this.state) this.drawTerrain();
  }

  setState(state, immediate = false) {
    const now = performance.now();
    this.staticFrameDrawn = false;
    const previous = this.state;
    const position = this.playerPosition(now);
    if (state.x !== this.player.x || state.y !== this.player.y || immediate) {
      if (state.x !== this.player.x)
        this.facing = Math.sign(state.x - this.player.x);
      this.player = {
        x: state.x,
        y: state.y,
        fromX: immediate ? state.x : position.x,
        fromY: immediate ? state.y : position.y,
        since: now,
      };
    }
    this.state = state;
    if (!previous || immediate) this.drawTerrain();
    if (immediate) this.particles = [];
  }

  playerPosition(now) {
    const p = this.player;
    const t = this.reducedMotion ? 1 : Math.min(1, (now - p.since) / TWEEN_MS);
    const ease = 1 - (1 - t) ** 3;
    return {
      x: p.fromX + (p.x - p.fromX) * ease,
      y: p.fromY + (p.y - p.fromY) * ease,
    };
  }

  // A step into a wall nudges the explorer towards it, so a blocked turn reads
  // as a collision instead of as a dropped key press.
  bump(command) {
    const dx = command === "a" ? -1 : command === "d" ? 1 : 0;
    const dy = command === "w" ? -1 : command === "s" ? 1 : 0;
    if (!dx && !dy) return;
    this.bumpX = dx;
    this.bumpY = dy;
    this.bumpAt = performance.now();
    this.staticFrameDrawn = false;
  }

  burst(x, y, color, damage = false) {
    if (this.reducedMotion) return;
    if (damage) this.hitAt = performance.now();
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 25 + Math.random() * 90;
      this.particles.push({
        x: (x + 0.5) * TILE,
        y: (y + 0.5) * TILE,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 20,
        life: 0.5 + Math.random() * 0.45,
        color,
      });
    }
  }

  polygon(points, color, ctx = this.ctx) {
    ctx.fillStyle = color;
    ctx.beginPath();
    points.forEach(([x, y], index) =>
      index ? ctx.lineTo(x, y) : ctx.moveTo(x, y),
    );
    ctx.closePath();
    ctx.fill();
  }

  // Building a radial gradient every frame is the most expensive thing this
  // renderer used to do. Each colour and radius is painted once into a sprite
  // and then blitted, which keeps the light cheap on phones.
  glowSprite(radius, color) {
    const key = radius + color;
    const cached = this.glows.get(key);
    if (cached) return cached;
    const size = Math.ceil(radius * 2);
    const sprite = document.createElement("canvas");
    sprite.width = size;
    sprite.height = size;
    const ctx = sprite.getContext("2d");
    const gradient = ctx.createRadialGradient(
      radius,
      radius,
      0,
      radius,
      radius,
      radius,
    );
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, "transparent");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    this.glows.set(key, sprite);
    return sprite;
  }

  glow(x, y, radius, color) {
    const r = Math.round(radius);
    const sprite = this.glowSprite(r, color);
    this.ctx.drawImage(sprite, Math.round(x) - r, Math.round(y) - r);
  }

  vignetteSprite() {
    if (this.vignette) return this.vignette;
    const sprite = document.createElement("canvas");
    sprite.width = BOARD_WIDTH;
    sprite.height = BOARD_HEIGHT;
    const ctx = sprite.getContext("2d");
    const gradient = ctx.createRadialGradient(
      BOARD_WIDTH / 2,
      BOARD_HEIGHT / 2,
      180,
      BOARD_WIDTH / 2,
      BOARD_HEIGHT / 2,
      565,
    );
    gradient.addColorStop(0, "transparent");
    gradient.addColorStop(1, "#071317a0");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    this.vignette = sprite;
    return sprite;
  }

  drawTerrain() {
    const ctx = this.terrain.getContext("2d");
    const board = this.state.board;
    ctx.fillStyle = "#111f23";
    ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    for (let y = 0; y < board.length; y++) {
      for (let x = 0; x < board[y].length; x++) {
        const px = x * TILE;
        const py = y * TILE;
        const r = hash(x, y);
        if (board[y][x] === "#") {
          // Irregular blocks, deep bottom faces, and moss along the top edge.
          ctx.fillStyle = "#101c20";
          ctx.fillRect(px, py, TILE, TILE);
          this.polygon(
            [
              [px + 3, py + 9],
              [px + 12, py + 3],
              [px + 53, py + 4],
              [px + 62, py + 13],
              [px + 60, py + 54],
              [px + 52, py + 61],
              [px + 9, py + 58],
              [px + 2, py + 46],
            ],
            "#0d191e",
            ctx,
          );
          this.polygon(
            [
              [px + 3, py + 7],
              [px + 12, py + 1],
              [px + 53, py + 2],
              [px + 61, py + 11],
              [px + 58, py + 46],
              [px + 49, py + 51],
              [px + 8, py + 49],
              [px + 2, py + 38],
            ],
            r > 0.5 ? "#263b3c" : "#213437",
            ctx,
          );
          this.polygon(
            [
              [px + 4, py + 7],
              [px + 13, py + 2],
              [px + 52, py + 3],
              [px + 58, py + 10],
              [px + 48, py + 9],
              [px + 14, py + 7],
              [px + 5, py + 16],
            ],
            "#3a5149",
            ctx,
          );
          ctx.strokeStyle = "#172a2f";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(px + 14, py + 28);
          ctx.lineTo(px + 31, py + 26);
          ctx.lineTo(px + 39, py + 18);
          ctx.moveTo(px + 31, py + 26);
          ctx.lineTo(px + 36, py + 36);
          ctx.stroke();
          if (r > 0.34) {
            ctx.fillStyle = "#49624b";
            ctx.fillRect(px + 8, py + 7, 12 + r * 16, 3);
            ctx.fillRect(px + 13, py + 10, 7, 3);
            ctx.fillStyle = "#6a7d4e";
            ctx.fillRect(px + 12, py + 6, 4, 2);
          }
          if (y < board.length - 1 && board[y + 1][x] !== "#") {
            ctx.fillStyle = "#050f154d";
            ctx.fillRect(px + 2, py + 54, 60, 16);
            for (let v = 0; v < 3; v++) {
              const vx = px + 14 + v * 17;
              const length = 5 + hash(x, y, v + 4) * 18;
              ctx.strokeStyle = "#496449";
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(vx, py + 46);
              ctx.lineTo(vx - 2, py + 46 + length);
              ctx.stroke();
              ctx.fillStyle = "#637648";
              ctx.fillRect(vx - 4, py + 47 + length, 4, 3);
            }
          }
        } else {
          ctx.fillStyle = r > 0.5 ? "#2e433c" : "#2a3e38";
          ctx.fillRect(px, py, TILE, TILE);
          this.polygon(
            [
              [px + 4, py + 8],
              [px + 31, py + 5],
              [px + 34, py + 27],
              [px + 8, py + 30],
            ],
            "#354b40",
            ctx,
          );
          this.polygon(
            [
              [px + 37, py + 7],
              [px + 58, py + 10],
              [px + 59, py + 34],
              [px + 38, py + 29],
            ],
            "#31473c",
            ctx,
          );
          this.polygon(
            [
              [px + 8, py + 35],
              [px + 31, py + 32],
              [px + 54, py + 39],
              [px + 51, py + 58],
              [px + 6, py + 56],
            ],
            "#344a3e",
            ctx,
          );
          ctx.fillStyle = "#52604b";
          for (let i = 0; i < 4; i++) {
            const sx = px + hash(x, y, i + 10) * 57 + 3;
            const sy = py + hash(y, x, i + 20) * 57 + 3;
            ctx.fillRect(sx, sy, 2, 2);
          }
          ctx.fillStyle = "#71805855";
          ctx.fillRect(px + 9, py + 35, 12, 1);
          if (r > 0.75) {
            ctx.strokeStyle = "#5c7347";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(px + 53, py + 54);
            ctx.lineTo(px + 50, py + 47);
            ctx.moveTo(px + 53, py + 54);
            ctx.lineTo(px + 56, py + 45);
            ctx.stroke();
          }
        }
      }
    }
  }

  crystal(x, y, now, seed) {
    const ctx = this.ctx;
    const float = this.reducedMotion ? 0 : Math.sin(now * 0.0025 + seed) * 3;
    ctx.fillStyle = "#071b2370";
    ctx.beginPath();
    ctx.ellipse(x, y + 16, 13, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    this.glow(x, y, 48, "#cdf79924");
    y += float - 4;
    this.polygon(
      [
        [x, y - 17],
        [x + 10, y - 4],
        [x + 7, y + 10],
        [x, y + 18],
        [x - 9, y + 1],
        [x - 9, y - 7],
      ],
      "#e1ffb4",
    );
    this.polygon(
      [
        [x, y - 17],
        [x, y + 18],
        [x - 9, y + 1],
        [x - 9, y - 7],
      ],
      "#8cb776",
    );
    this.polygon(
      [
        [x, y - 17],
        [x + 10, y - 4],
        [x, y + 1],
      ],
      "#f0ffd1",
    );
    this.polygon(
      [
        [x + 10, y - 4],
        [x + 7, y + 10],
        [x, y + 18],
        [x, y + 1],
      ],
      "#b7e299",
    );
    ctx.fillStyle = "#efffdb";
    ctx.fillRect(x - 3, y - 13, 2, 7);
    if (Math.sin(now * 0.002 + seed) > 0.6) {
      ctx.fillStyle = "#dbfca3";
      ctx.fillRect(x + 16, y - 15, 2, 6);
      ctx.fillRect(x + 14, y - 13, 6, 2);
    }
  }

  spikes(x, y) {
    const ctx = this.ctx;
    ctx.fillStyle = "#182a29";
    ctx.beginPath();
    ctx.ellipse(x, y + 12, 25, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      const px = x - 17 + i * 16,
        py = y + (i === 1 ? -5 : 1);
      this.polygon(
        [
          [px - 7, py + 17],
          [px + 1, py - 7],
          [px + 9, py + 17],
        ],
        "#788d83",
      );
      this.polygon(
        [
          [px + 1, py - 7],
          [px + 3, py + 17],
          [px + 9, py + 17],
        ],
        "#455f58",
      );
      this.polygon(
        [
          [px + 1, py - 7],
          [px - 2, py + 5],
          [px + 1, py + 4],
        ],
        "#cad2b6",
      );
    }
  }

  potion(x, y, now) {
    const ctx = this.ctx;
    this.glow(x, y, 36, "#9bdec120");
    ctx.fillStyle = "#102d2770";
    ctx.beginPath();
    ctx.ellipse(x, y + 18, 13, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8fae91";
    ctx.fillRect(x - 5, y - 19, 10, 5);
    ctx.fillStyle = "#507c70";
    ctx.fillRect(x - 4, y - 14, 8, 8);
    this.polygon(
      [
        [x - 5, y - 7],
        [x - 11, y - 1],
        [x - 10, y + 13],
        [x - 5, y + 17],
        [x + 6, y + 17],
        [x + 11, y + 12],
        [x + 11, y - 1],
        [x + 5, y - 7],
      ],
      "#81ad93",
    );
    ctx.fillStyle = "#b2d7a1";
    ctx.fillRect(x - 7, y + 1, 15, 10);
    ctx.fillStyle = "#e5f4c6";
    ctx.fillRect(x - 7, y - 2, 3, 8);
    ctx.fillStyle = "#63926e";
    ctx.fillRect(x - 4, y + 12, 11, 2);
    if (!this.reducedMotion) {
      ctx.fillStyle = "#e0f9bf";
      ctx.fillRect(x + 3, y + 6 - Math.sin(now * 0.003) * 3, 2, 2);
    }
  }

  portal(x, y, now, unlocked) {
    const ctx = this.ctx;
    this.glow(x, y, unlocked ? 95 : 57, unlocked ? "#c6f0a347" : "#9ec68922");
    ctx.fillStyle = "#101f21";
    ctx.beginPath();
    ctx.ellipse(x, y + 4, 21, 28, 0, 0, Math.PI * 2);
    ctx.fill();
    const gradient = ctx.createRadialGradient(x, y + 4, 0, x, y + 4, 24);
    gradient.addColorStop(0, unlocked ? "#d8efb2" : "#4f7660");
    gradient.addColorStop(1, unlocked ? "#4f9465" : "#213f39");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(x, y + 4, 16, 25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#65765a";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(x - 21, y + 27);
    ctx.lineTo(x - 21, y - 5);
    ctx.arc(x, y - 5, 21, Math.PI, 0);
    ctx.lineTo(x + 21, y + 27);
    ctx.stroke();
    ctx.strokeStyle = "#263f35";
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const a = Math.PI + (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(x + 17 * Math.cos(a), y - 5 + 17 * Math.sin(a));
      ctx.lineTo(x + 26 * Math.cos(a), y - 5 + 26 * Math.sin(a));
      ctx.stroke();
    }
    ctx.fillStyle = "#4e634d";
    ctx.fillRect(x - 27, y + 26, 54, 6);
    ctx.fillStyle = unlocked ? "#e2ffc1" : "#9bb683";
    ctx.fillRect(x - 3, y - 29, 6, 7);
    if (unlocked) {
      ctx.strokeStyle = "#dbffb766";
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(
          x,
          y + 4,
          4 + i * 4 + Math.sin(now * 0.002) * 2,
          9 + i * 5,
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
    }
  }

  torch(x, y, now) {
    const ctx = this.ctx;
    const flicker = this.reducedMotion ? 0 : Math.sin(now * 0.016 + x) * 2;
    this.glow(x, y, 83 + flicker * 4, "#ffc56b20");
    ctx.fillStyle = "#513f31";
    ctx.fillRect(x - 3, y + 3, 6, 16);
    ctx.fillStyle = "#8f7250";
    ctx.fillRect(x - 5, y + 1, 10, 5);
    this.polygon(
      [
        [x - 6, y],
        [x - 4, y - 9],
        [x, y - 17 - flicker],
        [x + 6, y - 6],
        [x + 5, y + 1],
      ],
      "#e9a758",
    );
    this.polygon(
      [
        [x - 3, y],
        [x, y - 11],
        [x + 3, y - 3],
        [x + 2, y + 2],
      ],
      "#ffedac",
    );
  }

  explorer(x, y, now) {
    const ctx = this.ctx;
    const moving = now - this.player.since < TWEEN_MS;
    const bob = this.reducedMotion
      ? 0
      : moving
        ? Math.sin((now - this.player.since) * 0.05) * 2
        : Math.sin(now * 0.003) * 0.7;
    ctx.fillStyle = "#071e2399";
    ctx.beginPath();
    ctx.ellipse(x, y + 19, 16, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    this.glow(x + 19, y - 3, 95, "#facb731b");
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y + bob));
    ctx.scale(this.facing, 1);
    // Pixel explorer: boots, moss cloak, satchel, scarf, hood, and lantern.
    ctx.fillStyle = "#162b29";
    ctx.fillRect(-9, 13, 7, 8);
    ctx.fillRect(3, 13, 7, 8);
    ctx.fillStyle = "#b4a279";
    ctx.fillRect(-9, 19, 8, 3);
    ctx.fillRect(3, 19, 9, 3);
    this.polygon(
      [
        [-9, -3],
        [7, -3],
        [12, 14],
        [4, 18],
        [-12, 14],
      ],
      "#7b9571",
    );
    ctx.fillStyle = "#aac291";
    ctx.fillRect(-7, -1, 5, 15);
    ctx.fillStyle = "#536a50";
    ctx.fillRect(5, 0, 4, 15);
    ctx.fillStyle = "#a7774f";
    ctx.fillRect(-14, 1, 7, 10);
    ctx.fillRect(-12, 1, 3, 3);
    ctx.fillStyle = "#d9ad77";
    ctx.fillRect(-7, -15, 14, 13);
    ctx.fillStyle = "#f1d19b";
    ctx.fillRect(-6, -14, 11, 9);
    ctx.fillStyle = "#334c38";
    ctx.fillRect(-9, -19, 16, 5);
    ctx.fillRect(-11, -15, 5, 8);
    ctx.fillRect(-8, -22, 12, 4);
    ctx.fillStyle = "#95aa78";
    ctx.fillRect(-7, -20, 11, 3);
    ctx.fillStyle = "#243d34";
    ctx.fillRect(3, -11, 2, 3);
    ctx.fillStyle = "#d69365";
    ctx.fillRect(-8, -3, 17, 5);
    ctx.fillRect(-9, 1, 5, 8);
    ctx.fillStyle = "#f0c18a";
    ctx.fillRect(9, 3, 6, 5);
    ctx.fillStyle = "#ac976d";
    ctx.fillRect(16, 1, 2, 5);
    ctx.fillRect(14, 5, 7, 10);
    ctx.fillStyle = "#fbdd8a";
    ctx.fillRect(15, 6, 5, 6);
    ctx.fillStyle = "#f8efbe";
    ctx.fillRect(16, 7, 2, 3);
    ctx.restore();
  }

  render(now) {
    if (!this.state) return;
    // With motion reduced nothing on the board animates: the walk snaps,
    // particles are disabled, and dust and flicker are off. One settled frame
    // per state change is the whole picture, so repaint only when it changes.
    if (this.reducedMotion) {
      if (this.staticFrameDrawn) return;
      this.staticFrameDrawn = true;
    } else this.staticFrameDrawn = false;
    const ctx = this.ctx;
    const state = this.state;
    const dt = Math.min(0.04, (now - this.lastTime) / 1000);
    this.lastTime = now;
    const animationTime = this.reducedMotion ? 0 : now;
    const shaking = !this.reducedMotion && now - this.hitAt < 180;
    const shakeX = shaking
      ? Math.round(Math.sin(now * 0.12) * 3 * this.scaleX)
      : 0;
    const shakeY = shaking
      ? Math.round(Math.cos(now * 0.1) * 2 * this.scaleY)
      : 0;
    ctx.save();
    // The terrain backbuffer already lives in device pixels, so it is copied in
    // device space: an unscaled one-pass blit that also erases the previous
    // frame. Pushing it through the board transform would resample the whole
    // board every frame, and picking the wrong space would double it on retina.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (shaking) ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.terrain, shakeX, shakeY);
    // The rest of the artwork is authored in board units.
    ctx.setTransform(this.scaleX, 0, 0, this.scaleY, 0, 0);
    if (shaking) ctx.translate(shakeX / this.scaleX, shakeY / this.scaleY);
    for (let y = 0; y < state.height; y++)
      for (let x = 0; x < state.width; x++) {
        const cx = x * TILE + 32,
          cy = y * TILE + 32,
          tile = state.board[y][x];
        if (tile === "*") this.crystal(cx, cy, animationTime, x + y);
        else if (tile === "^") this.spikes(cx, cy);
        else if (tile === "+") this.potion(cx, cy, animationTime);
        else if (tile === "E")
          this.portal(cx, cy, animationTime, state.crystals === state.total);
      }
    this.torch(32, 233, animationTime);
    this.torch(480, 41, animationTime);
    this.torch(735, 550, animationTime);
    const p = this.playerPosition(now);
    const sinceBump = now - this.bumpAt;
    const lean =
      this.reducedMotion || sinceBump > BUMP_MS
        ? 0
        : Math.sin((sinceBump / BUMP_MS) * Math.PI) * 8;
    this.explorer(
      (p.x + 0.5) * TILE + this.bumpX * lean,
      (p.y + 0.5) * TILE + this.bumpY * lean,
      animationTime,
    );
    // Dust motes make the cave feel alive without obscuring the route.
    if (!this.reducedMotion) {
      // One opaque colour plus a per-mote alpha keeps the same pixels while
      // avoiding twenty-two rgba strings built from scratch every frame.
      ctx.fillStyle = "#d3e8a9";
      for (let i = 0; i < 22; i++) {
        const x = hash(i, 3) * BOARD_WIDTH + Math.sin(now * 0.0003 + i) * 9;
        const y =
          (hash(i, 9) * BOARD_HEIGHT -
            now * (0.003 + hash(i, 7) * 0.005) +
            BOARD_HEIGHT * 10) %
          BOARD_HEIGHT;
        ctx.globalAlpha = 0.15 + Math.sin(now * 0.002 + i) * 0.1;
        ctx.fillRect(x, y, 2, 2);
      }
      ctx.globalAlpha = 1;
    }
    let alive = 0;
    for (const particle of this.particles) {
      if (particle.life > 0) this.particles[alive++] = particle;
    }
    this.particles.length = alive;
    for (const particle of this.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 45 * dt;
      ctx.globalAlpha = Math.max(0, Math.min(1, particle.life * 2));
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x, particle.y, 3, 3);
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(this.vignetteSprite(), 0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    ctx.restore();
  }
}
                  