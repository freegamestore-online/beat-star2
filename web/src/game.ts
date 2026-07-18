import kaplay, { type GameObj, type KAPLAYCtx } from "kaplay";

// ── Virtual canvas size ───────────────────────────────────────────────────────
const VW = 480;
const VH = 700;

// ── Lane layout ───────────────────────────────────────────────────────────────
const LANE_COUNT = 4;
const LANE_PAD   = 60;
const LANE_W     = (VW - LANE_PAD * 2) / LANE_COUNT;

function laneX(lane: number): number {
  return LANE_PAD + LANE_W * lane + LANE_W / 2;
}

// ── Hit zone ──────────────────────────────────────────────────────────────────
const HIT_Y       = VH - 110;
const STAR_R      = 24;
const HIT_PERFECT = 0.14; // seconds
const HIT_GOOD    = 0.26;

// ── Rhythm timing ─────────────────────────────────────────────────────────────
const BPM_START   = 72;
const BPM_MAX     = 128;
const BPM_RAMP    = 0.4; // BPM per second
const LEAD_TIME   = 1.8; // seconds a star travels before hitting the zone

// ── Colour palette ────────────────────────────────────────────────────────────
type RGB = [number, number, number];
const PALETTE: RGB[] = [
  [255,  80, 130],
  [255, 200,  40],
  [ 60, 200, 255],
  [140, 255, 130],
  [200, 100, 255],
  [255, 150,  60],
];

function randColor(): RGB {
  const c = PALETTE[Math.floor(Math.random() * PALETTE.length)];
  return c ?? [255, 255, 255];
}

function rgbStr(c: RGB): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// ── Draw a 5-pointed star ─────────────────────────────────────────────────────
function pathStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const inner = r * 0.42;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? r : inner;
    if (i === 0) ctx.moveTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
    else         ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  ctx.closePath();
}

// ── Particle burst ────────────────────────────────────────────────────────────
function burst(k: KAPLAYCtx, x: number, y: number, col: RGB): void {
  const N = 16;
  for (let i = 0; i < N; i++) {
    const a  = (Math.PI * 2 * i) / N + Math.random() * 0.4;
    const sp = 90 + Math.random() * 160;
    const sz = 4 + Math.random() * 5;
    const vx = Math.cos(a) * sp;
    const vy = Math.sin(a) * sp;
    const p  = k.add([
      k.rect(sz, sz, { radius: sz / 2 }),
      k.pos(x, y),
      k.color(...col),
      k.opacity(1),
      k.anchor("center"),
    ]);
    let age = 0;
    const life = 0.5 + Math.random() * 0.25;
    p.onUpdate(() => {
      age += k.dt();
      p.pos.x += vx * k.dt();
      p.pos.y += vy * k.dt();
      (p as GameObj & { pos: { y: number } }).pos.y += 280 * k.dt() * (age / life);
      p.opacity = Math.max(0, 1 - age / life);
      if (age >= life) k.destroy(p);
    });
  }
}

// ── Floating label ────────────────────────────────────────────────────────────
function floatLabel(k: KAPLAYCtx, x: number, y: number, label: string, col: RGB): void {
  const t = k.add([
    k.text(label, { size: 26 }),
    k.pos(x, y),
    k.anchor("center"),
    k.color(...col),
    k.opacity(1),
  ]);
  let age = 0;
  t.onUpdate(() => {
    age += k.dt();
    t.pos.y -= 55 * k.dt();
    t.opacity = Math.max(0, 1 - age / 0.75);
    if (age > 0.75) k.destroy(t);
  });
}

// ── Twinkling background stars ────────────────────────────────────────────────
function addBgStars(k: KAPLAYCtx): void {
  for (let i = 0; i < 60; i++) {
    const bx    = Math.random() * VW;
    const by    = Math.random() * VH;
    const r     = 0.8 + Math.random() * 1.8;
    const phase = Math.random() * Math.PI * 2;
    const speed = 0.8 + Math.random() * 1.4;
    const s = k.add([
      k.pos(bx, by),
      k.circle(r),
      k.color(210, 210, 255),
      k.opacity(0.5),
    ]);
    let ph = phase;
    s.onUpdate(() => {
      ph += k.dt() * speed;
      s.opacity = 0.15 + 0.4 * (0.5 + 0.5 * Math.sin(ph));
    });
  }
}

// ── Hit-zone ring (drawn via custom draw) ─────────────────────────────────────
function addHitZone(k: KAPLAYCtx): void {
  // Horizontal glow bar
  k.add([
    k.rect(VW, 4),
    k.pos(0, HIT_Y - 2),
    k.color(100, 80, 220),
    k.opacity(0.35),
  ]);

  for (let lane = 0; lane < LANE_COUNT; lane++) {
    const x = laneX(lane);

    // Lane guide line
    k.add([
      k.rect(2, HIT_Y),
      k.pos(x - 1, 0),
      k.color(80, 60, 160),
      k.opacity(0.15),
    ]);

    // Target ring — drawn as a custom object
    const ring = k.add([
      k.pos(x, HIT_Y),
      k.anchor("center"),
      k.opacity(0.45),
    ]);
    ring.onDraw(() => {
      const ctx = ring.canvas?.ctx as CanvasRenderingContext2D | undefined;
      if (!ctx) {
        // fallback: draw via k.drawCircle
        k.drawCircle({ pos: k.vec2(0, 0), radius: STAR_R + 6, outline: { color: k.rgb(100, 80, 220), width: 3 }, fill: false });
        return;
      }
      ctx.save();
      ctx.strokeStyle = "rgba(100,80,220,0.7)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, STAR_R + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────
export function startGame(
  canvas: HTMLCanvasElement,
  onScore: (n: number) => void,
): () => void {
  const k = kaplay({
    canvas,
    width:  VW,
    height: VH,
    letterbox: true,
    background: [10, 6, 26],
    global: false,
    pixelDensity: Math.min(window.devicePixelRatio || 1, 2),
  });

  let globalHigh = parseInt(localStorage.getItem("beatstar2_hs") ?? "0", 10) || 0;

  // ── MENU ──────────────────────────────────────────────────────────────────
  k.scene("menu", () => {
    addBgStars(k);

    // Title
    k.add([
      k.text("BEAT STAR", { size: 52, font: "sans-serif" }),
      k.anchor("center"),
      k.pos(VW / 2, VH * 0.18),
      k.color(255, 220, 50),
    ]);
    k.add([
      k.text("⭐  ⭐  ⭐  ⭐", { size: 28, font: "sans-serif" }),
      k.anchor("center"),
      k.pos(VW / 2, VH * 0.27),
      k.color(255, 180, 60),
    ]);
    k.add([
      k.text("Tap the stars when they hit the ring!", { size: 18, font: "sans-serif" }),
      k.anchor("center"),
      k.pos(VW / 2, VH * 0.37),
      k.color(170, 150, 255),
    ]);

    if (globalHigh > 0) {
      k.add([
        k.text(`🏆 Best: ${globalHigh}`, { size: 22, font: "sans-serif" }),
        k.anchor("center"),
        k.pos(VW / 2, VH * 0.46),
        k.color(255, 210, 60),
      ]);
    }

    // Key guide
    k.add([
      k.text("Keys: A  S  D  F   or tap lanes", { size: 15, font: "sans-serif" }),
      k.anchor("center"),
      k.pos(VW / 2, VH * 0.86),
      k.color(110, 90, 170),
    ]);

    // Play button
    const btn = k.add([
      k.rect(210, 66, { radius: 33 }),
      k.color(120, 80, 255),
      k.area(),
      k.anchor("center"),
      k.pos(VW / 2, VH * 0.63),
    ]);
    let btnPulse = 0;
    btn.onUpdate(() => {
      btnPulse += k.dt();
      const s = 1 + 0.045 * Math.sin(btnPulse * 2.8);
      btn.scale = k.vec2(s, s);
    });
    k.add([
      k.text("▶  PLAY", { size: 28, font: "sans-serif" }),
      k.anchor("center"),
      k.pos(VW / 2, VH * 0.63),
      k.color(255, 255, 255),
    ]);

    // Animated preview stars
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const col = PALETTE[lane] ?? randColor();
      const baseY = VH * 0.76 + (lane % 2) * 18;
      const preview = k.add([
        k.pos(laneX(lane), baseY),
        k.anchor("center"),
        k.opacity(0.85),
      ]);
      let ph = lane * 1.1;
      preview.onDraw(() => {
        k.drawCircle({ pos: k.vec2(0, 0), radius: STAR_R * 0.7, color: k.rgb(...col) });
      });
      preview.onUpdate(() => {
        ph += k.dt();
        preview.pos.y = baseY + Math.sin(ph * 2.2) * 10;
      });
    }

    btn.onClick(() => k.go("play"));
    k.onKeyPress("space", () => k.go("play"));
    k.onKeyPress("enter", () => k.go("play"));
  });

  // ── PLAY ──────────────────────────────────────────────────────────────────
  k.scene("play", () => {
    addBgStars(k);
    addHitZone(k);

    let score    = 0;
    let combo    = 0;
    let maxCombo = 0;
    let lives    = 3;
    let gameTime = 0;
    let elapsed  = 0;
    onScore(0);

    // ── Score / combo UI ────────────────────────────────────────────────────
    const scoreTxt = k.add([
      k.text("0", { size: 34, font: "sans-serif" }),
      k.pos(VW / 2, 14),
      k.anchor("top"),
      k.color(255, 255, 255),
    ]);

    const comboTxt = k.add([
      k.text("", { size: 20, font: "sans-serif" }),
      k.pos(VW / 2, 54),
      k.anchor("top"),
      k.color(255, 210, 50),
    ]);

    // Hearts
    const heartObjs: GameObj[] = [];
    for (let i = 0; i < 3; i++) {
      heartObjs.push(k.add([
        k.text("❤️", { size: 26, font: "sans-serif" }),
        k.pos(14 + i * 38, 12),
        k.anchor("topleft"),
      ]));
    }

    function refreshHearts(): void {
      for (let i = 0; i < 3; i++) {
        const h = heartObjs[i] as (GameObj & { text: string }) | undefined;
        if (!h) continue;
        h.text = i < lives ? "❤️" : "🖤";
      }
    }

    // Beat pulse ring (top-right)
    const pulseRing = k.add([
      k.pos(VW - 30, 30),
      k.anchor("center"),
      k.opacity(0.5),
    ]);
    let beatPhase = 0;
    pulseRing.onDraw(() => {
      const r = 14 + 6 * (1 - beatPhase);
      k.drawCircle({
        pos: k.vec2(0, 0),
        radius: r,
        color: k.rgb(120, 80, 255),
        opacity: 0.3 + 0.7 * Math.max(0, 1 - beatPhase * 2),
      });
    });

    // Lane key labels (A S D F)
    const KEY_LABELS = ["A", "S", "D", "F"];
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      k.add([
        k.text(KEY_LABELS[lane] ?? "", { size: 16, font: "sans-serif" }),
        k.pos(laneX(lane), HIT_Y + STAR_R + 14),
        k.anchor("center"),
        k.color(100, 80, 180),
        k.opacity(0.6),
      ]);
    }

    // ── Star note data ───────────────────────────────────────────────────────
    interface Note {
      obj: GameObj;
      lane: number;
      hitTime: number; // game-time when it should be tapped
      col: RGB;
      done: boolean;
    }
    const notes: Note[] = [];

    // ── Beat scheduling ──────────────────────────────────────────────────────
    // We track cumulative beat times accounting for BPM ramp
    const beatTimes: number[] = [];
    let nextBeatIdx  = 0;
    let scheduledTo  = 0; // how far ahead we've generated beat times (game-time)

    function generateBeats(upTo: number): void {
      // Extend beatTimes array until we cover `upTo` seconds of game time
      let t = beatTimes.length === 0 ? 0 : (beatTimes[beatTimes.length - 1] ?? 0);
      while (t <= upTo) {
        const bpm = Math.min(BPM_MAX, BPM_START + t * BPM_RAMP);
        const beatLen = 60 / bpm;
        t += beatLen;
        beatTimes.push(t);
      }
      scheduledTo = upTo;
    }

    function spawnNote(hitTime: number): void {
      // Randomly skip ~35% of beats at start, fewer as game progresses
      const density = Math.min(0.9, 0.55 + elapsed * 0.006);
      if (Math.random() > density) return;

      const lane = Math.floor(Math.random() * LANE_COUNT);
      const col  = randColor();

      // Star object — drawn as a glowing circle (KAPLAY-safe, no internal ctx)
      const obj = k.add([
        k.pos(laneX(lane), -STAR_R * 2),
        k.anchor("center"),
        k.opacity(1),
      ]);

      let pulse = Math.random() * Math.PI * 2;
      obj.onDraw(() => {
        pulse += 0.06;
        const glow = 1 + 0.12 * Math.sin(pulse);
        // Outer glow ring
        k.drawCircle({ pos: k.vec2(0, 0), radius: STAR_R * 1.55 * glow, color: k.rgb(...col), opacity: 0.18 });
        // Mid glow
        k.drawCircle({ pos: k.vec2(0, 0), radius: STAR_R * 1.2 * glow,  color: k.rgb(...col), opacity: 0.30 });
        // Core
        k.drawCircle({ pos: k.vec2(0, 0), radius: STAR_R, color: k.rgb(...col) });
        // Shine
        k.drawCircle({ pos: k.vec2(-STAR_R * 0.22, -STAR_R * 0.25), radius: STAR_R * 0.32, color: k.rgb(255, 255, 255), opacity: 0.45 });
        // Star points (5 small dots)
        for (let i = 0; i < 5; i++) {
          const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
          const px = Math.cos(a) * STAR_R * 0.72;
          const py = Math.sin(a) * STAR_R * 0.72;
          k.drawCircle({ pos: k.vec2(px, py), radius: 3.5, color: k.rgb(255, 255, 255), opacity: 0.5 });
        }
      });

      notes.push({ obj, lane, hitTime, col, done: false });
    }

    // ── Hit logic ────────────────────────────────────────────────────────────
    function tryHit(lane: number): void {
      let best: Note | null = null;
      let bestDiff = Infinity;
      for (const n of notes) {
        if (n.lane !== lane || n.done) continue;
        const diff = Math.abs(n.hitTime - gameTime);
        if (diff < bestDiff) { bestDiff = diff; best = n; }
      }

      if (!best) {
        // No note nearby — show "early" feedback
        floatLabel(k, laneX(lane), HIT_Y - 20, "EARLY", [180, 100, 100]);
        return;
      }

      if (bestDiff <= HIT_PERFECT) {
        combo++;
        if (combo > maxCombo) maxCombo = combo;
        const pts = 100 + combo * 15;
        score += pts;
        onScore(score);
        scoreTxt.text = String(score);
        comboTxt.text = combo >= 3 ? `✨ x${combo} COMBO!` : "PERFECT!";
        burst(k, best.obj.pos.x, best.obj.pos.y, best.col);
        lanePop(best.lane, best.col);
        floatLabel(k, best.obj.pos.x, best.obj.pos.y - 20, `+${pts}`, best.col);
        k.destroy(best.obj);
        best.done = true;
      } else if (bestDiff <= HIT_GOOD) {
        combo++;
        if (combo > maxCombo) maxCombo = combo;
        const pts = 50 + combo * 8;
        score += pts;
        onScore(score);
        scoreTxt.text = String(score);
        comboTxt.text = combo >= 3 ? `⭐ x${combo} COMBO` : "GOOD!";
        burst(k, best.obj.pos.x, best.obj.pos.y, best.col);
        lanePop(best.lane, best.col);
        floatLabel(k, best.obj.pos.x, best.obj.pos.y - 20, `+${pts}`, [190, 255, 160]);
        k.destroy(best.obj);
        best.done = true;
      } else {
        combo = 0;
        comboTxt.text = "";
        floatLabel(k, laneX(lane), HIT_Y - 20, "MISS", [255, 80, 80]);
      }
    }

    // Lane pop flash
    function lanePop(lane: number, col: RGB): void {
      const f = k.add([
        k.pos(laneX(lane), HIT_Y),
        k.anchor("center"),
        k.opacity(0.75),
      ]);
      let age = 0;
      f.onDraw(() => {
        k.drawCircle({ pos: k.vec2(0, 0), radius: (STAR_R + 10) * (1 + age * 2), color: k.rgb(...col), opacity: Math.max(0, 0.75 - age * 3) });
      });
      f.onUpdate(() => {
        age += k.dt();
        if (age > 0.25) k.destroy(f);
      });
    }

    // ── Input ────────────────────────────────────────────────────────────────
    const KEY_MAP: Record<string, number> = { a: 0, s: 1, d: 2, f: 3 };
    k.onKeyPress((key) => {
      const lane = KEY_MAP[key];
      if (lane !== undefined) tryHit(lane);
    });

    k.onMousePress(() => {
      const mp = k.mousePos();
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < LANE_COUNT; i++) {
        const d = Math.abs(mp.x - laneX(i));
        if (d < bestD) { bestD = d; best = i; }
      }
      tryHit(best);
    });

    // ── Main update ───────────────────────────────────────────────────────────
    k.onUpdate(() => {
      const dt = k.dt();
      gameTime += dt;
      elapsed  += dt;

      // BPM ramp → beat pulse
      const bpm     = Math.min(BPM_MAX, BPM_START + elapsed * BPM_RAMP);
      const beatLen = 60 / bpm;
      beatPhase += dt / beatLen;
      if (beatPhase >= 1) beatPhase -= 1;

      // Generate beat times up to LEAD_TIME seconds ahead
      generateBeats(gameTime + LEAD_TIME + 0.5);

      // Spawn notes for beats we haven't spawned yet
      while (nextBeatIdx < beatTimes.length) {
        const bt = beatTimes[nextBeatIdx];
        if (bt === undefined) break;
        if (bt > gameTime + LEAD_TIME) break;
        spawnNote(bt);
        nextBeatIdx++;
      }

      // Move notes
      for (const n of notes) {
        if (n.done) continue;
        const timeUntil = n.hitTime - gameTime;
        const progress  = 1 - timeUntil / LEAD_TIME;
        n.obj.pos.y = -STAR_R * 2 + (HIT_Y + STAR_R * 2) * Math.max(0, Math.min(1, progress));

        // Missed
        if (timeUntil < -HIT_GOOD) {
          n.done = true;
          k.destroy(n.obj);
          lives--;
          combo = 0;
          comboTxt.text = "";
          refreshHearts();
          floatLabel(k, laneX(n.lane), HIT_Y - 30, "MISS!", [255, 60, 60]);

          if (lives <= 0) {
            if (score > globalHigh) {
              globalHigh = score;
              localStorage.setItem("beatstar2_hs", String(globalHigh));
            }
            k.wait(0.5, () => k.go("over", { score, maxCombo, high: globalHigh }));
          }
        }
      }

      // Prune done notes
      for (let i = notes.length - 1; i >= 0; i--) {
        if (notes[i]?.done) notes.splice(i, 1);
      }
    });
  });

  // ── GAME OVER ─────────────────────────────────────────────────────────────
  k.scene("over", (data: { score: number; maxCombo: number; high: number }) => {
    addBgStars(k);

    const newBest = data.score > 0 && data.score >= data.high;

    k.add([
      k.text("GAME OVER", { size: 50, font: "sans-serif" }),
      k.anchor("center"),
      k.pos(VW / 2, VH * 0.18),
      k.color(255, 80, 120),
    ]);

    if (newBest) {
      k.add([
        k.text("🏆 NEW BEST! 🏆", { size: 28, font: "sans-serif" }),
        k.anchor("center"),
        k.pos(VW / 2, VH * 0.29),
        k.color(255, 220, 50),
      ]);
    }

    k.add([
      k.text(`Score: ${data.score}`, { size: 36, font: "sans-serif" }),
      k.anchor("center"),
      k.pos(VW / 2, VH * 0.4),
      k.color(255, 255, 255),
    ]);

    k.add([
      k.text(`Best Combo: ×${data.maxCombo}`, { size: 22, font: "sans-serif" }),
      k.anchor("center"),
      k.pos(VW / 2, VH * 0.49),
      k.color(180, 150, 255),
    ]);

    k.add([
      k.text(`High Score: ${data.high}`, { size: 20, font: "sans-serif" }),
      k.anchor("center"),
      k.pos(VW / 2, VH * 0.57),
      k.color(255, 200, 50),
    ]);

    // Confetti burst
    for (let i = 0; i < 6; i++) {
      k.wait(i * 0.1, () => {
        burst(k, VW * 0.1 + Math.random() * VW * 0.8, VH * 0.2 + Math.random() * VH * 0.35, randColor());
      });
    }

    // Play again button
    const btn = k.add([
      k.rect(230, 68, { radius: 34 }),
      k.color(120, 80, 255),
      k.area(),
      k.anchor("center"),
      k.pos(VW / 2, VH * 0.72),
    ]);
    let btnP = 0;
    btn.onUpdate(() => {
      btnP += k.dt();
      const s = 1 + 0.04 * Math.sin(btnP * 2.8);
      btn.scale = k.vec2(s, s);
    });
    k.add([
      k.text("▶  PLAY AGAIN", { size: 26, font: "sans-serif" }),
      k.anchor("center"),
      k.pos(VW / 2, VH * 0.72),
      k.color(255, 255, 255),
    ]);
    k.add([
      k.text("tap · SPACE · ENTER", { size: 15, font: "sans-serif" }),
      k.anchor("center"),
      k.pos(VW / 2, VH * 0.82),
      k.color(110, 90, 170),
    ]);

    btn.onClick(() => k.go("play"));
    k.onKeyPress("space", () => k.go("play"));
    k.onKeyPress("enter", () => k.go("play"));
  });

  k.go("menu");
  return () => k.quit();
}
