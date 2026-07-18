import kaplay, { type KAPLAYCtx, type GameObj } from "kaplay";

const VW = 480;
const VH = 700;

// ── Palette ──────────────────────────────────────────────────────────────────
const COLORS = [
  [255, 80, 120],   // hot pink
  [255, 200, 40],   // golden yellow
  [60, 200, 255],   // sky blue
  [120, 255, 140],  // mint green
  [200, 100, 255],  // purple
  [255, 140, 60],   // orange
] as const;

// ── Beat timing ──────────────────────────────────────────────────────────────
const BPM_START = 70;
const BPM_MAX   = 130;
const BPM_RAMP  = 0.5; // BPM increase per second

// ── Hit window (seconds from beat) ───────────────────────────────────────────
const HIT_PERFECT = 0.18;
const HIT_GOOD    = 0.32;

// ── Star spawn config ─────────────────────────────────────────────────────────
const STAR_RADIUS   = 28;
const STAR_FALL_MS  = 2200; // ms a star takes to fall to the hit zone
const HIT_ZONE_Y    = VH - 90;
const LANE_COUNT    = 5;
const LANE_XS       = Array.from({ length: LANE_COUNT }, (_, i) =>
  Math.round(VW * 0.1 + (VW * 0.8 / (LANE_COUNT - 1)) * i)
);

// ── Helpers ───────────────────────────────────────────────────────────────────
function laneX(lane: number): number {
  return LANE_XS[lane] ?? VW / 2;
}

function randomColor(): [number, number, number] {
  const c = COLORS[Math.floor(Math.random() * COLORS.length)];
  return c ? [c[0], c[1], c[2]] : [255, 255, 255];
}

// Draw a 5-pointed star path on a KAPLAY canvas context
function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const outerR = r;
  const innerR = r * 0.42;
  const points = 5;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (Math.PI / points) * i - Math.PI / 2;
    const radius = i % 2 === 0 ? outerR : innerR;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// ── Main export ───────────────────────────────────────────────────────────────
export function startGame(
  canvas: HTMLCanvasElement,
  onScore: (n: number) => void
): () => void {
  const k = kaplay({
    canvas,
    width: VW,
    height: VH,
    letterbox: true,
    background: [12, 8, 28],
    global: false,
    pixelDensity: Math.min(window.devicePixelRatio || 1, 2),
  });

  // ── Shared state across scenes ────────────────────────────────────────────
  let highScore = parseInt(localStorage.getItem("beatstar2_hs") ?? "0", 10) || 0;

  // ── Utility: draw a glowing star shape via drawNode ───────────────────────
  function makeStarNode(
    k: KAPLAYCtx,
    x: number,
    y: number,
    col: [number, number, number],
    radius: number,
    tag: string
  ): GameObj {
    const [r, g, b] = col;
    return k.add([
      k.pos(x, y),
      k.anchor("center"),
      k.area({ shape: new k.Circle(radius * 0.7) }),
      k.color(r, g, b),
      k.opacity(1),
      {
        starRadius: radius,
        starColor: col,
        pulse: 0,
        draw(this: GameObj & { starRadius: number; starColor: [number,number,number]; pulse: number }) {
          const ctx = (k as unknown as { _ctx: CanvasRenderingContext2D })._ctx;
          if (!ctx) return;
          const pr = this.starRadius + Math.sin(this.pulse * 6) * 3;
          // glow
          const grad = ctx.createRadialGradient(0, 0, pr * 0.2, 0, 0, pr * 1.8);
          grad.addColorStop(0, `rgba(${r},${g},${b},0.55)`);
          grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
          ctx.save();
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(0, 0, pr * 1.8, 0, Math.PI * 2);
          ctx.fill();
          // star body
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          drawStar(ctx, 0, 0, pr);
          ctx.fill();
          // white shine
          ctx.fillStyle = "rgba(255,255,255,0.35)";
          drawStar(ctx, -pr * 0.1, -pr * 0.15, pr * 0.45);
          ctx.fill();
          ctx.restore();
        },
        update(this: GameObj & { pulse: number }) {
          this.pulse += k.dt();
        },
      },
      tag,
    ]);
  }

  // ── Particle burst ────────────────────────────────────────────────────────
  function burst(x: number, y: number, col: [number, number, number]): void {
    const [r, g, b] = col;
    for (let i = 0; i < 14; i++) {
      const angle = (Math.PI * 2 * i) / 14 + Math.random() * 0.4;
      const speed = 80 + Math.random() * 140;
      const size  = 4 + Math.random() * 6;
      const vx    = Math.cos(angle) * speed;
      const vy    = Math.sin(angle) * speed;
      const p = k.add([
        k.pos(x, y),
        k.rect(size, size, { radius: size / 2 }),
        k.color(r, g, b),
        k.opacity(1),
        k.anchor("center"),
        {
          vx, vy,
          life: 0.55 + Math.random() * 0.25,
          age: 0,
          update(this: GameObj & { vx: number; vy: number; life: number; age: number }) {
            this.age += k.dt();
            this.pos.x += this.vx * k.dt();
            this.pos.y += this.vy * k.dt();
            this.vy += 300 * k.dt();
            this.opacity = Math.max(0, 1 - this.age / this.life);
            if (this.age >= this.life) k.destroy(p);
          },
        },
      ]);
    }
  }

  // ── Floating score text ───────────────────────────────────────────────────
  function floatText(x: number, y: number, text: string, col: [number, number, number]): void {
    const [r, g, b] = col;
    const t = k.add([
      k.text(text, { size: 28, font: "sans-serif" }),
      k.pos(x, y),
      k.anchor("center"),
      k.color(r, g, b),
      k.opacity(1),
      {
        age: 0,
        update(this: GameObj & { age: number }) {
          this.age += k.dt();
          this.pos.y -= 60 * k.dt();
          this.opacity = Math.max(0, 1 - this.age / 0.8);
          if (this.age > 0.8) k.destroy(t);
        },
      },
    ]);
  }

  // ── Twinkling background stars ────────────────────────────────────────────
  function addBackgroundStars(): void {
    for (let i = 0; i < 55; i++) {
      const bx = Math.random() * VW;
      const by = Math.random() * VH;
      const br = 1 + Math.random() * 2;
      const phase = Math.random() * Math.PI * 2;
      k.add([
        k.pos(bx, by),
        k.circle(br),
        k.color(200, 200, 255),
        k.opacity(0.4 + Math.random() * 0.4),
        {
          phase,
          update(this: GameObj & { phase: number }) {
            this.phase += k.dt() * (1 + Math.random() * 0.5);
            this.opacity = 0.2 + 0.35 * (0.5 + 0.5 * Math.sin(this.phase));
          },
        },
      ]);
    }
  }

  // ── Hit-zone lane dots ────────────────────────────────────────────────────
  function addHitZone(): void {
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const x = laneX(lane);
      k.add([
        k.pos(x, HIT_ZONE_Y),
        k.circle(STAR_RADIUS * 0.85),
        k.color(60, 60, 100),
        k.opacity(0.35),
        k.anchor("center"),
      ]);
      // Lane line
      k.add([
        k.pos(x, 0),
        k.rect(2, HIT_ZONE_Y),
        k.color(60, 60, 100),
        k.opacity(0.12),
        k.anchor("top"),
      ]);
    }
    // Horizontal hit bar
    k.add([
      k.pos(0, HIT_ZONE_Y),
      k.rect(VW, 3),
      k.color(100, 80, 200),
      k.opacity(0.3),
    ]);
  }

  // ── Lane flash on hit ─────────────────────────────────────────────────────
  function flashLane(k: KAPLAYCtx, lane: number, col: [number, number, number]): void {
    const [r, g, b] = col;
    const f = k.add([
      k.pos(laneX(lane), HIT_ZONE_Y),
      k.circle(STAR_RADIUS * 1.3),
      k.color(r, g, b),
      k.opacity(0.7),
      k.anchor("center"),
      {
        age: 0,
        update(this: GameObj & { age: number }) {
          this.age += k.dt();
          this.opacity = Math.max(0, 0.7 - this.age / 0.22);
          if (this.age > 0.22) k.destroy(f);
        },
      },
    ]);
  }

  // ── MENU scene ────────────────────────────────────────────────────────────
  k.scene("menu", () => {
    addBackgroundStars();

    // Title
    k.add([
      k.text("⭐ BEAT STAR ⭐", { size: 44, font: "sans-serif" }),
      k.anchor("center"),
      k.pos(VW / 2, VH * 0.22),
      k.color(255, 220, 60),
    ]);
    k.add([
      k.text("Tap stars as they hit the zone!", { size: 20, font: "sans-serif" }),
      k.anchor("center"),
      k.pos(VW / 2, VH * 0.34),
      k.color(180, 160, 255),
    ]);

    // High score
    if (highScore > 0) {
      k.add([
        k.text(`Best: ${highScore}`, { size: 22, font: "sans-serif" }),
        k.anchor("center"),
        k.pos(VW / 2, VH * 0.43),
        k.color(255, 200, 60),
      ]);
    }

    // Animated demo stars
    for (let i = 0; i < LANE_COUNT; i++) {
      const col = randomColor();
      const s = makeStarNode(k, laneX(i), VH * 0.55 + (i % 2) * 30, col, STAR_RADIUS, "demo");
      let t = 0;
      s.onUpdate(() => {
        t += k.dt();
        s.pos.y = VH * 0.55 + (i % 2) * 30 + Math.sin(t * 2 + i) * 12;
      });
    }

    // Play button
    const btn = k.add([
      k.rect(200, 64, { radius: 32 }),
      k.color(120, 80, 255),
      k.area(),
      k.anchor("center"),
      k.pos(VW / 2, VH * 0.76),
      {
        pulse: 0,
        update(this: GameObj & { pulse: number }) {
          this.pulse += k.dt();
          const s = 1 + 0.04 * Math.sin(this.pulse * 3);
          this.scale = k.vec2(s, s);
        },
      },
    ]);
    k.add([
      k.text("▶  PLAY", { size: 26, font: "sans-serif" }),
      k.anchor("center"),
      k.pos(VW / 2, VH * 0.76),
      k.color(255, 255, 255),
    ]);

    // Keyboard hint
    k.add([
      k.text("Keys: A S D F G  or  tap lanes", { size: 14, font: "sans-serif" }),
      k.anchor("center"),
      k.pos(VW / 2, VH * 0.88),
      k.color(120, 100, 180),
    ]);

    btn.onClick(() => k.go("play"));
    k.onKeyPress("space", () => k.go("play"));
    k.onKeyPress("enter", () => k.go("play"));
  });

  // ── PLAY scene ────────────────────────────────────────────────────────────
  k.scene("play", () => {
    addBackgroundStars();
    addHitZone();

    let score       = 0;
    let combo       = 0;
    let maxCombo    = 0;
    let lives       = 3;
    let bpm         = BPM_START;
    let elapsed     = 0;
    let beatPhase   = 0;   // 0–1 within current beat
    let beatCount   = 0;
    onScore(0);

    // ── UI ──────────────────────────────────────────────────────────────────
    const scoreTxt = k.add([
      k.text("0", { size: 32, font: "sans-serif" }),
      k.pos(VW / 2, 18),
      k.anchor("top"),
      k.color(255, 255, 255),
    ]);
    const comboTxt = k.add([
      k.text("", { size: 20, font: "sans-serif" }),
      k.pos(VW / 2, 56),
      k.anchor("top"),
      k.color(255, 200, 60),
    ]);

    // Lives (hearts)
    const heartObjs: GameObj[] = [];
    for (let i = 0; i < 3; i++) {
      heartObjs.push(k.add([
        k.text("❤️", { size: 24, font: "sans-serif" }),
        k.pos(12 + i * 36, 12),
        k.anchor("topleft"),
      ]));
    }

    function updateHearts(): void {
      for (let i = 0; i < 3; i++) {
        const h = heartObjs[i];
        if (!h) continue;
        h.text = i < lives ? "❤️" : "🖤";
      }
    }

    // Beat indicator (top-right pulse ring)
    const beatRing = k.add([
      k.pos(VW - 28, 28),
      k.circle(14),
      k.color(120, 80, 255),
      k.opacity(0.5),
      k.anchor("center"),
    ]);

    // ── Active stars on screen ───────────────────────────────────────────────
    interface StarData {
      obj: GameObj;
      lane: number;
      beatTime: number; // game-time when it should be hit
      col: [number, number, number];
      hit: boolean;
      missed: boolean;
    }
    const stars: StarData[] = [];

    // ── Spawn a star for a given beat ────────────────────────────────────────
    function spawnStar(beatTime: number): void {
      const lane = Math.floor(Math.random() * LANE_COUNT);
      const col  = randomColor();
      // Star starts above screen, arrives at HIT_ZONE_Y at beatTime
      const travelSecs = STAR_FALL_MS / 1000;
      const spawnY = HIT_ZONE_Y - VH * 1.1; // well above top
      const obj = makeStarNode(k, laneX(lane), spawnY, col, STAR_RADIUS, "star");

      stars.push({ obj, lane, beatTime, col, hit: false, missed: false });
    }

    // ── Schedule upcoming beats ──────────────────────────────────────────────
    // We look STAR_FALL_MS ahead and pre-spawn stars
    let nextBeatIndex = 0; // which beat number to spawn next
    let gameTime      = 0;

    function beatTimeForIndex(n: number): number {
      // Simple: evenly spaced at current BPM (we approximate; BPM changes slowly)
      // For simplicity, pre-compute beat times as cumulative sum
      // We'll just use: each beat = 60/bpm seconds, but bpm grows over time
      // Simple approach: beat n starts at n * (60/BPM_START) — good enough for fun
      return n * (60 / BPM_START);
    }

    // Spawn beats ahead of time
    function scheduleBeats(): void {
      const lookAhead = (STAR_FALL_MS / 1000) + 0.5;
      while (beatTimeForIndex(nextBeatIndex) <= gameTime + lookAhead) {
        const bt = beatTimeForIndex(nextBeatIndex);
        // Skip some beats for interest (not every beat has a star)
        const density = Math.min(0.95, 0.4 + elapsed * 0.008);
        if (Math.random() < density) {
          spawnStar(bt);
        }
        nextBeatIndex++;
      }
    }

    // ── Hit logic ────────────────────────────────────────────────────────────
    function tryHitLane(lane: number): void {
      // Find the closest star in this lane that hasn't been hit/missed
      let best: StarData | null = null;
      let bestDiff = Infinity;
      for (const sd of stars) {
        if (sd.lane !== lane || sd.hit || sd.missed) continue;
        const diff = Math.abs(sd.beatTime - gameTime);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = sd;
        }
      }
      if (!best) return;

      if (bestDiff <= HIT_PERFECT) {
        // Perfect hit
        combo++;
        if (combo > maxCombo) maxCombo = combo;
        const pts = 100 + combo * 10;
        score += pts;
        onScore(score);
        scoreTxt.text = String(score);
        comboTxt.text = combo > 1 ? `✨ x${combo} COMBO!` : "PERFECT!";
        burst(best.obj.pos.x, best.obj.pos.y, best.col);
        flashLane(k, lane, best.col);
        floatText(best.obj.pos.x, best.obj.pos.y - 20, `+${pts}`, best.col);
        k.destroy(best.obj);
        best.hit = true;
      } else if (bestDiff <= HIT_GOOD) {
        // Good hit
        combo++;
        if (combo > maxCombo) maxCombo = combo;
        const pts = 50 + combo * 5;
        score += pts;
        onScore(score);
        scoreTxt.text = String(score);
        comboTxt.text = combo > 1 ? `⭐ x${combo} COMBO` : "GOOD!";
        burst(best.obj.pos.x, best.obj.pos.y, best.col);
        flashLane(k, lane, best.col);
        floatText(best.obj.pos.x, best.obj.pos.y - 20, `+${pts}`, [200, 255, 150]);
        k.destroy(best.obj);
        best.hit = true;
      } else {
        // Miss (tapped too early or too late)
        floatText(laneX(lane), HIT_ZONE_Y - 20, "MISS", [255, 80, 80]);
        combo = 0;
        comboTxt.text = "";
      }
    }

    // ── Keyboard input (A S D F G = lanes 0-4) ───────────────────────────────
    const LANE_KEYS = ["a", "s", "d", "f", "g"] as const;
    LANE_KEYS.forEach((key, lane) => {
      k.onKeyPress(key as string, () => tryHitLane(lane));
    });
    // Arrow keys for 5 lanes: left=0, down=1, up=2, right=3, space=4
    k.onKeyPress("left",  () => tryHitLane(0));
    k.onKeyPress("down",  () => tryHitLane(1));
    k.onKeyPress("up",    () => tryHitLane(2));
    k.onKeyPress("right", () => tryHitLane(3));
    k.onKeyPress("space", () => tryHitLane(4));

    // ── Touch / click input ───────────────────────────────────────────────────
    k.onMousePress(() => {
      const mp = k.mousePos();
      // Determine lane by x position
      let closestLane = 0;
      let closestDist = Infinity;
      for (let i = 0; i < LANE_COUNT; i++) {
        const d = Math.abs(mp.x - laneX(i));
        if (d < closestDist) { closestDist = d; closestLane = i; }
      }
      tryHitLane(closestLane);
    });

    // ── Main update loop ──────────────────────────────────────────────────────
    k.onUpdate(() => {
      const dt = k.dt();
      gameTime += dt;
      elapsed  += dt;

      // Ramp BPM
      bpm = Math.min(BPM_MAX, BPM_START + elapsed * BPM_RAMP);
      const beatLen = 60 / bpm;
      beatPhase += dt / beatLen;
      if (beatPhase >= 1) {
        beatPhase -= 1;
        beatCount++;
      }

      // Beat ring pulse
      const pulse = Math.pow(Math.max(0, 1 - beatPhase * 2), 2);
      beatRing.opacity = 0.3 + pulse * 0.7;
      const rs = 1 + pulse * 0.5;
      beatRing.scale = k.vec2(rs, rs);

      // Schedule new stars
      scheduleBeats();

      // Move stars downward
      const travelSecs = STAR_FALL_MS / 1000;
      for (const sd of stars) {
        if (sd.hit || sd.missed) continue;
        const timeUntilHit = sd.beatTime - gameTime;
        // Position: from off-screen top to HIT_ZONE_Y
        const progress = 1 - (timeUntilHit / travelSecs);
        const startY = -STAR_RADIUS * 2;
        sd.obj.pos.y = startY + (HIT_ZONE_Y - startY) * Math.min(1, Math.max(0, progress));

        // If star passed the hit zone without being hit
        if (timeUntilHit < -HIT_GOOD && !sd.missed) {
          sd.missed = true;
          k.destroy(sd.obj);
          lives--;
          combo = 0;
          comboTxt.text = "";
          updateHearts();
          floatText(laneX(sd.lane), HIT_ZONE_Y - 30, "MISS!", [255, 60, 60]);

          if (lives <= 0) {
            // Save high score
            if (score > highScore) {
              highScore = score;
              localStorage.setItem("beatstar2_hs", String(highScore));
            }
            k.wait(0.4, () => k.go("over", { score, maxCombo, highScore }));
          }
        }
      }

      // Clean up hit/missed stars from array
      for (let i = stars.length - 1; i >= 0; i--) {
        const sd = stars[i];
        if (sd && (sd.hit || sd.missed)) stars.splice(i, 1);
      }
    });
  });

  // ── GAME OVER scene ───────────────────────────────────────────────────────
  k.scene("over", (data: { score: number; maxCombo: number; highScore: number }) => {
    addBackgroundStars();

    const isNewBest = data.score >= data.highScore && data.score > 0;

    k.add([
      k.text("GAME OVER", { size: 48, font: "sans-serif" }),
      k.anchor("center"),
      k.pos(VW / 2, VH * 0.2),
      k.color(255, 80, 120),
    ]);

    if (isNewBest) {
      k.add([
        k.text("🏆 NEW BEST! 🏆", { size: 26, font: "sans-serif" }),
        k.anchor("center"),
        k.pos(VW / 2, VH * 0.31),
        k.color(255, 220, 60),
      ]);
    }

    k.add([
      k.text(`Score: ${data.score}`, { size: 34, font: "sans-serif" }),
      k.anchor("center"),
      k.pos(VW / 2, VH * 0.41),
      k.color(255, 255, 255),
    ]);

    k.add([
      k.text(`Best Combo: x${data.maxCombo}`, { size: 22, font: "sans-serif" }),
      k.anchor("center"),
      k.pos(VW / 2, VH * 0.5),
      k.color(180, 160, 255),
    ]);

    k.add([
      k.text(`High Score: ${data.highScore}`, { size: 20, font: "sans-serif" }),
      k.anchor("center"),
      k.pos(VW / 2, VH * 0.58),
      k.color(255, 200, 60),
    ]);

    // Celebration stars burst
    for (let i = 0; i < 5; i++) {
      k.wait(i * 0.12, () => {
        burst(
          VW * 0.15 + Math.random() * VW * 0.7,
          VH * 0.25 + Math.random() * VH * 0.3,
          randomColor()
        );
      });
    }

    // Play again button
    const btn = k.add([
      k.rect(220, 64, { radius: 32 }),
      k.color(120, 80, 255),
      k.area(),
      k.anchor("center"),
      k.pos(VW / 2, VH * 0.72),
      {
        pulse: 0,
        update(this: GameObj & { pulse: number }) {
          this.pulse += k.dt();
          const s = 1 + 0.04 * Math.sin(this.pulse * 3);
          this.scale = k.vec2(s, s);
        },
      },
    ]);
    k.add([
      k.text("▶  PLAY AGAIN", { size: 24, font: "sans-serif" }),
      k.anchor("center"),
      k.pos(VW / 2, VH * 0.72),
      k.color(255, 255, 255),
    ]);

    k.add([
      k.text("tap or press SPACE", { size: 15, font: "sans-serif" }),
      k.anchor("center"),
      k.pos(VW / 2, VH * 0.82),
      k.color(120, 100, 180),
    ]);

    btn.onClick(() => k.go("play"));
    k.onKeyPress("space", () => k.go("play"));
    k.onKeyPress("enter", () => k.go("play"));
  });

  k.go("menu");

  return () => k.quit();
}
