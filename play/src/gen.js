/*
 * Marblescape — level generator.
 * Pure data, no three.js or DOM: a seeded builder lays a floating track sample by sample,
 * modules add obstacles and pickups, and build() turns it into meshes for physics and rendering.
 */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const STEP = 0.5;          // spacing of centre-line samples, metres
export const THICK = 0.7;         // track slab thickness
export const RAIL_H = 0.7;        // rail height above the surface
export const RAIL_W = 0.28;
export const H_PIPE = 2.4;        // half-pipe wall height
const BONUS_FIT = 1.0;            // measured flight / ideal flight off the bonus kicker
const K_PIPE = 10;                // cross-section segments in a half-pipe

export const BANK_H = 1.0;         // a fully banked turn raises the outer edge this much

// Height of the riding surface above the centre line at lateral offset u
// (half-pipes curve up at both edges; banked turns tilt across).
export function surfH(f, u) {
  let h = f.pipe ? f.pipe * H_PIPE * Math.pow(Math.min(1, Math.abs((2 * u) / f.w)), 2) : 0;
  if (f.bank) h += f.bank * BANK_H * ((2 * u) / f.w);
  return h;
}

// Five levels per world, then the next world; after the last it loops with longer levels.
// style picks the scenery generator; drop is how far below the track the ground lies.
export const WORLDS = [
  {
    id: 'meadow', name: 'Green Meadow', boss: { name: 'Big Bertha', kind: 'boulder' }, style: 'pillars', top: ['#ff8433', '#ffa057'], edge: '#ffffff', side: '#c24e22', rail: '#ffffff',
    skyTop: '#2f86dd', skyHorizon: '#c4e8ff', skyBottom: '#7fc1ea', fog: '#cbe9ff', sun: '#fff1d6',
    ground: 'sea', groundColor: '#2f8fd0', drop: 45, island: '#6cc24a', rock: '#8a6a4a', islandStyle: 'hill',
    decor: ['round', 'round', 'flower', 'bush'], mountains: '#7fb2d9', music: 0, favor: ['hills', 'curve', 'spinner', 'pendulum'],
  },
  {
    id: 'ocean', name: 'Ocean Bay', boss: { name: 'The Beach Ball', kind: 'beach' }, style: 'ocean', top: ['#ffffff', '#e4f2ff'], edge: '#ff5050', side: '#2b6aa3', rail: '#ff5050',
    skyTop: '#1a95ee', skyHorizon: '#d4f1ff', skyBottom: '#9fdcf5', fog: '#d6f1ff', sun: '#fff8e8',
    ground: 'sea', groundColor: '#1288d4', drop: 13, island: '#5fbf4a', rock: '#d8b77a', islandStyle: 'isle', supports: '#e9eef5',
    decor: ['palm', 'palm', 'bush'], mountains: '#7fb8a2', music: 4, favor: ['waterslide', 'belt', 'seesaw', 'platform', 'trampoline', 'tube'],
  },
  {
    id: 'canyon', name: 'Red Canyon', boss: { name: 'Rockslide', kind: 'sandstone' }, style: 'pillars', top: ['#2fc4b6', '#1fb0a3'], edge: '#ffffff', side: '#23847b', rail: '#ffffff',
    skyTop: '#ff7a3d', skyHorizon: '#ffdcae', skyBottom: '#e8a066', fog: '#ffd4a3', sun: '#ffe2bf',
    ground: 'desert', groundColor: '#d99a5c', drop: 45, island: '#d98d52', rock: '#b4532f', islandStyle: 'mesa',
    decor: ['cactus', 'cactus', 'rock'], mountains: '#c8794a', music: 2, favor: ['logs', 'boulders', 'gapJump', 'halfpipe'],
  },
  {
    id: 'snow', name: 'Snow Peaks', boss: { name: 'Giant Snowball', kind: 'snow' }, style: 'snow', top: ['#9fc6f2', '#86b4e8'], edge: '#ff4f6d', side: '#55779e', rail: '#ff4f6d',
    skyTop: '#5e9bd6', skyHorizon: '#eef5ff', skyBottom: '#ffffff', fog: '#e6f0fb', sun: '#ffffff',
    ground: 'snow', groundColor: '#f2f7ff', drop: 34, island: '#f6f9ff', rock: '#6f7f95', islandStyle: 'snowpeak',
    decor: ['snowpine', 'snowpine', 'snowpine', 'rock'], mountains: '#dbe6f2', weather: 'snow', music: 1, favor: ['ice', 'helix', 'halfpipe', 'slopeDown'],
  },
  {
    id: 'sky', name: 'Sky Islands', boss: { name: 'Thundercloud', kind: 'storm' }, style: 'pillars', top: ['#ff72ba', '#ff92cb'], edge: '#ffffff', side: '#c2558f', rail: '#ffffff',
    skyTop: '#3d98ff', skyHorizon: '#e6f4ff', skyBottom: '#ffffff', fog: '#eaf4ff', sun: '#ffffff',
    ground: 'clouds', groundColor: '#f6f8ff', drop: 45, island: '#8fd870', rock: '#7a6a8e', islandStyle: 'float',
    decor: ['round', 'bush', 'flower'], mountains: '#b7c6e8', music: 3, favor: ['gapJump', 'trampoline', 'fans', 'seesaw', 'disc', 'swings'],
  },
  {
    id: 'city', name: 'Neon City', boss: { name: 'Disco Doom', kind: 'disco' }, style: 'city', top: ['#2e3156', '#272a4b'], edge: '#00e5ff', side: '#161833', rail: '#ff2bd6', neon: true, night: true,
    skyTop: '#05030f', skyHorizon: '#3b1d6e', skyBottom: '#0d0820', fog: '#24113f', sun: '#c4b5ff',
    ground: 'city', groundColor: '#0a0a18', drop: 40, supports: '#1b1d36', weather: 'stars', music: 7,
    favor: ['pillars', 'sliders', 'pushers', 'split', 'belt', 'tube', 'hammers'],
  },
  {
    id: 'volcano', name: 'Volcano', boss: { name: 'Magma Core', kind: 'magma' }, style: 'pillars', top: ['#5d616d', '#4e525d'], edge: '#ffc61a', side: '#2a2c33', rail: '#ffc61a',
    skyTop: '#22090d', skyHorizon: '#ff6a2e', skyBottom: '#ff7a3a', fog: '#b9482a', sun: '#ffb070',
    ground: 'lava', groundColor: '#ff5a1a', drop: 45, island: '#3a2e2e', rock: '#2a2020', islandStyle: 'spire',
    decor: ['dead', 'rock'], mountains: '#4a1c18', weather: 'embers', music: 5, favor: ['cannons', 'boulders', 'pendulum', 'crumble', 'hammers'],
  },
  {
    id: 'space', name: 'Space Station', boss: { name: 'Rogue Moon', kind: 'moon' }, style: 'space', top: ['#eef1f7', '#d3d9e6'], edge: '#7c5cff', side: '#3a3f58', rail: '#7c5cff', neon: true, night: true,
    skyTop: '#000000', skyHorizon: '#0d0a26', skyBottom: '#000000', fog: '#0d0a26', sun: '#ffffff',
    ground: 'void', groundColor: '#000000', drop: 60, gravity: 15, weather: 'stars', music: 8,
    favor: ['trampoline', 'gapJump', 'loop', 'helix', 'windmill'],
  },
];

const fwdOf = (yaw) => [Math.sin(yaw), Math.cos(yaw)];
const rightOf = (yaw) => [-Math.cos(yaw), Math.sin(yaw)];

class Builder {
  constructor(rnd) {
    this.rnd = rnd;
    this.x = 0; this.y = 0; this.z = 0; this.yaw = 0; this.w = 6; this.s = 0;
    this.pipe = 0; this.bank = 0; this.nx = 0; this.ny = 1; this.nz = 0; this.glass = false; this.tube = false;
    this.samples = [];
    this.strips = [];
    this.railRuns = [];
    this.railFrom = -1;
    this.obstacles = [];
    this.coins = [];
    this.zones = [];
    this.checkpoints = [];
    this.tiles = [];
    this.finish = null;
    this.strip = [];
    this.strips.push(this.strip);
    this.push(false);
  }
  frame() {
    return { x: this.x, y: this.y, z: this.z, yaw: this.yaw, w: this.w, s: this.s, pipe: this.pipe, bank: this.bank, nx: this.nx, ny: this.ny, nz: this.nz, glass: this.glass, tube: this.tube };
  }
  idx() { return this.samples.length - 1; }
  push(gap) {
    const f = this.frame();
    f.gap = gap;
    f.i = this.samples.length;
    this.samples.push(f);
    if (!gap) this.strip.push(f.i);
  }
  // Move along the heading. turn > 0 turns left (yaw grows), dy climbs, w1 tapers the width.
  move(len, o = {}) {
    const turn = o.turn || 0, dy = o.dy || 0, w0 = this.w, w1 = o.w1 ?? this.w, gap = !!o.gap;
    const p0 = this.pipe, p1 = o.pipe1 ?? this.pipe, k0 = this.bank, k1 = o.bank1 ?? this.bank, yStart = this.y;
    const n = Math.max(1, Math.round(len / STEP)), st = len / n;
    for (let i = 1; i <= n; i++) {
      const y0 = this.yaw;
      this.yaw += turn / n;
      const ym = (y0 + this.yaw) / 2;
      this.x += Math.sin(ym) * st;
      this.z += Math.cos(ym) * st;
      // waveAmp/waveN lay rolling hills over the climb.
      this.y = yStart + dy * (i / n) + (o.waveAmp || 0) * Math.sin(2 * Math.PI * (o.waveN || 1) * (i / n));
      this.s += st;
      this.w = w0 + (w1 - w0) * (i / n);
      this.pipe = p0 + (p1 - p0) * (i / n);
      this.bank = k0 + (k1 - k0) * (i / n);
      this.push(gap);
    }
    return this;
  }
  straight(len, o = {}) { return this.move(len, o); }
  // A vertical loop-the-loop that drifts sideways by `shift` so the exit clears the entry.
  // The surface normal points at the loop's centre.
  loop(R, shift) {
    const n = Math.round((2 * Math.PI * R) / STEP), st = (2 * Math.PI * R) / n;
    const x0 = this.x, y0 = this.y, z0 = this.z, [fx, fz] = fwdOf(this.yaw), [rx, rz] = rightOf(this.yaw);
    for (let i = 1; i <= n; i++) {
      const th = (i / n) * 2 * Math.PI, a = R * Math.sin(th), lat = shift * (i / n);
      this.x = x0 + fx * a + rx * lat;
      this.z = z0 + fz * a + rz * lat;
      this.y = y0 + R * (1 - Math.cos(th));
      this.s += st;
      this.nx = -fx * Math.sin(th); this.ny = Math.cos(th); this.nz = -fz * Math.sin(th);
      this.push(false);
    }
    this.nx = 0; this.ny = 1; this.nz = 0;
    this.samples[this.samples.length - 1].ny = 1;
    return this;
  }
  curve(deg, radius, o = {}) { const a = (deg * Math.PI) / 180; return this.move(Math.abs(a) * radius, Object.assign({}, o, { turn: a })); }
  // Open air: samples continue (for the camera and progress) but nothing is solid.
  gap(len, dy = 0) {
    this.strip = null;
    this.move(len, { dy, gap: true });
    const last = this.samples[this.samples.length - 1];
    last.gap = false;
    this.strip = [last.i];
    this.strips.push(this.strip);
    return this;
  }
  railsOn() { this.railFrom = this.idx(); return this; }
  railsOff() { if (this.railFrom >= 0) this.railRuns.push([this.railFrom, this.idx()]); this.railFrom = -1; return this; }
  // A turn direction that keeps the heading within ±70° of the start, so the track never loops back.
  turnSign() {
    if (this.yaw > 0.5) return -1;
    if (this.yaw < -0.5) return 1;
    return this.rnd() < 0.5 ? -1 : 1;
  }
  clampTurn(deg) {
    const a = (deg * Math.PI) / 180, lim = 1.22;
    const after = Math.max(-lim, Math.min(lim, this.yaw + a));
    return ((after - this.yaw) * 180) / Math.PI;
  }
  at(f, u = 0, h = 0, a = 0) {
    const [fx, fz] = fwdOf(f.yaw), [rx, rz] = rightOf(f.yaw), hh = h + surfH(f, u);
    const nx = f.nx || 0, ny = f.ny ?? 1, nz = f.nz || 0;
    return [f.x + rx * u + fx * a + nx * hh, f.y + ny * hh, f.z + rz * u + fz * a + nz * hh];
  }
  zone(type, f, len, extra = {}) {
    this.zones.push(Object.assign({ type, s0: f.s, s1: f.s + len, half: f.w / 2, y: f.y, x: f.x, z: f.z, yaw: f.yaw, w: f.w, len }, extra));
  }
  // A gem: worth five coins, usually somewhere risky.
  gem(f, u = 0, h = 0.85, a = 0) {
    const p = this.at(f, u, h, a);
    this.coins.push({ x: p[0], y: p[1], z: p[2], s: f.s + a, gem: true });
  }
  coinsAlong(i0, i1, n, pattern = 'line') {
    for (let k = 1; k <= n; k++) {
      const i = Math.round(i0 + ((i1 - i0) * k) / (n + 1));
      const f = this.samples[i];
      if (!f || f.gap) continue;
      const lim = Math.max(0, f.w / 2 - 0.9);
      const u = pattern === 'zigzag' ? Math.sin(k * 1.3) * lim : pattern === 'left' ? -lim * 0.6 : pattern === 'right' ? lim * 0.6
        : pattern === 'walls' ? (k % 2 ? 1 : -1) * f.w * 0.36 : 0;
      const p = this.at(f, u, 0.85);
      this.coins.push({ x: p[0], y: p[1], z: p[2], s: f.s });
    }
  }
}

/* ---------------- modules: each lays one stretch of track ---------------- */

const M = {
  straight(b, r) {
    const i0 = b.idx(), len = 15 + r() * 8;
    b.straight(len);
    b.coinsAlong(i0, b.idx(), 6, r() < 0.5 ? 'line' : 'zigzag');
  },
  // Big turns are banked: the outside edge rises.
  curve(b, r, d) {
    const sign = b.turnSign();
    const deg = b.clampTurn(sign * (50 + r() * 50));
    const bank = Math.abs(deg) > 55 ? Math.sign(deg) * 0.8 : 0;
    const rails = d < 0.35, i0 = b.idx();
    if (bank) b.straight(3, { bank1: bank });
    if (rails) b.railsOn();
    const ic = b.idx();
    b.curve(deg, 13 + r() * 6);
    if (bank) { const g = b.samples[Math.round((ic + b.idx()) / 2)]; b.gem(g, -Math.sign(deg) * (g.w / 2 - 0.75)); }
    if (rails) b.railsOff();
    if (bank) b.straight(3, { bank1: 0 });
    b.coinsAlong(i0, b.idx(), 5, deg > 0 ? 'left' : 'right');
    b.straight(2);
  },
  slopeDown(b, r, d) {
    const i0 = b.idx();
    b.straight(16 + r() * 8, { dy: -(4 + r() * 3 + d * 2) });
    b.coinsAlong(i0, b.idx(), 6, 'zigzag');
    b.straight(3);
  },
  slopeUp(b, r) {
    const i0 = b.idx();
    b.straight(12 + r() * 4, { dy: 2 + r() * 1.5 });
    b.coinsAlong(i0, b.idx(), 4, 'line');
    b.straight(3);
  },
  // Rolling hills: the crests throw you into the air, with coins waiting up there.
  hills(b, r, d) {
    // Wavelength 14 m and at most 1.2 m tall: steep enough to fly off, never too steep to climb.
    const i0 = b.idx(), n = 3 + Math.floor(r() * 2);
    b.straight(n * 14, { waveAmp: 0.9 + d * 0.3, waveN: n });
    const i1 = b.idx();
    for (let k = 0; k < n; k++) {
      const f = b.samples[Math.round(i0 + ((k + 0.25) / n) * (i1 - i0))], p = b.at(f, 0, 1.5);
      b.coins.push({ x: p[0], y: p[1], z: p[2], s: f.s });
    }
    b.straight(2);
  },
  // A banked, walled spiral that drops a full storey as it turns once round.
  helix(b, r) {
    const sg = b.yaw > 0.3 ? -1 : b.yaw < -0.3 ? 1 : r() < 0.5 ? -1 : 1, R = 11 + r() * 3;
    b.straight(4, { bank1: sg * 0.7 });
    const i0 = b.idx();
    b.railsOn();
    b.curve(sg * 360, R, { dy: -(10 + r() * 3) });
    b.railsOff();
    b.yaw -= sg * 2 * Math.PI;
    b.coinsAlong(i0, b.idx(), 10, sg > 0 ? 'left' : 'right');
    b.straight(4, { bank1: 0 });
  },
  spinner(b, r, d) {
    b.straight(4);
    const n = d > 0.35 ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const f = b.frame();
      // The bar stops a ball-width short of each edge: hugging the edge is the safe, risky line.
      b.obstacles.push(Object.assign(f, { type: 'spinner', len: f.w - 2.4, speed: (1.2 + 1.5 * d) * (k % 2 ? -1 : 1) * (0.85 + r() * 0.3), phase: r() * 6.28 }));
      b.straight(k < n - 1 ? 9 : 6.5);
    }
    b.straight(2);
  },
  pendulum(b, r, d) {
    b.straight(3, { w1: 6 });   // room to dodge the swing
    const n = d > 0.5 ? 4 : 3;
    for (let k = 0; k < n; k++) {
      b.straight(1.5);
      const f = b.frame();
      b.obstacles.push(Object.assign(f, { type: 'pendulum', height: 7, arm: 6.1, head: 0.75, amp: 1.0, speed: 1.9 + d * 1.1, phase: k * 1.9 + r() * 3 }));
      b.straight(3.5);
    }
    b.straight(2);
  },
  pushers(b, r, d) {
    b.straight(2.5);
    for (let k = 0; k < 4; k++) {
      const f = b.frame();
      b.obstacles.push(Object.assign(f, { type: 'pusher', side: k % 2 ? 1 : -1, size: [2.2, 1.0, 1.2], reach: 1.9, speed: 1.8 + d, phase: k * 1.3 + r() * 2 }));
      b.straight(4);
    }
    b.straight(1.5);
  },
  sliders(b, r, d) {
    b.straight(3);
    for (let k = 0; k < 3; k++) {
      const f = b.frame();
      b.obstacles.push(Object.assign(f, { type: 'slider', len: f.w * 0.55, speed: 1.1 + d, phase: k * 2.1 + r() }));
      b.straight(5);
    }
    b.straight(1);
  },
  // Windmills: four blades turning across the track; slip through between them.
  windmill(b, r, d) {
    b.straight(4);
    const n = d > 0.4 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const f = b.frame();
      b.obstacles.push(Object.assign(f, { type: 'windmill', hub: 3.4, len: 3.6, speed: (1.0 + 0.8 * d) * (k % 2 ? -1 : 1), phase: r() * 6.28 }));
      b.straight(9);
    }
    b.straight(2);
  },
  // Pillars rise out of the track in a wave; roll over them while they're down.
  pillars(b, r, d) {
    b.straight(3, { w1: 6 });
    const f = b.frame(), rows = 5, gap = 2.4;
    for (let row = 0; row < rows; row++) for (let col = 0; col < 3; col++) {
      const u = (col - 1) * 1.9, a = 1.6 + row * gap, p = b.at(f, u, 0, a);
      b.obstacles.push({ type: 'pillar', x: p[0], y: p[1], z: p[2], yaw: f.yaw, s: f.s + a, u, size: 1.3, rise: 1.3, period: 2.6 - d * 0.6, phase: row * 0.16 + col * 0.31 });
    }
    b.straight(rows * gap + 3);
    b.straight(2, { w1: 5 });
  },
  // The track splits around a wall: one lane is clear, the other has bumpers and most of the coins.
  split(b, r) {
    b.straight(3, { w1: 9 });
    const f = b.frame(), len = 24, hard = r() < 0.5 ? -1 : 1;
    b.obstacles.push(Object.assign(f, { type: 'divider', len, safe: -hard }));
    const i0 = b.idx();
    b.straight(len);
    const i1 = b.idx(), at = (k, n) => b.samples[Math.round(i0 + ((i1 - i0) * k) / n)];
    for (let k = 0; k < 5; k++) {
      const g = at(k + 1, 6), u = hard * (2.25 + (k % 2 ? 0.8 : -0.8)), p = b.at(g, u, 0);
      b.obstacles.push({ type: 'bumper', x: p[0], y: p[1], z: p[2], yaw: g.yaw, s: g.s, u, r: 0.35 });
    }
    for (let k = 1; k <= 8; k++) { const g = at(k, 9), p = b.at(g, hard * 2.25 + (k % 2 ? 0.7 : -0.7), 0.85); b.coins.push({ x: p[0], y: p[1], z: p[2], s: g.s, gem: k % 4 === 0 }); }
    for (let k = 1; k <= 2; k++) { const g = at(k, 3), p = b.at(g, -hard * 2.25, 0.85); b.coins.push({ x: p[0], y: p[1], z: p[2], s: g.s }); }
    b.straight(3, { w1: 5 });
  },
  // Ice: steering barely grips and the ball slides.
  ice(b, r) {
    // Low walls keep the slide fair: you skid into them rather than off the edge.
    const f = b.frame(), i0 = b.idx();
    b.railsOn();
    b.straight(8 + r() * 4);
    b.curve(b.clampTurn(b.turnSign() * 35), 16);
    b.straight(6);
    b.railsOff();
    b.zones.push({ type: 'ice', s0: f.s, s1: b.s, half: 4, y: f.y, i0, i1: b.idx() });
    b.coinsAlong(i0, b.idx(), 5, 'zigzag');
  },
  // Conveyor belts: some carry you forward, some push you back.
  belt(b, r, d) {
    const f = b.frame(), i0 = b.idx(), back = r() < 0.5;
    b.railsOn();
    b.straight(14 + r() * 4);
    b.railsOff();
    b.zones.push({ type: 'belt', s0: f.s, s1: b.s, half: f.w / 2, y: f.y, i0, i1: b.idx(), v: back ? -(4 + 3 * d) : 7 });
    b.coinsAlong(i0, b.idx(), 4, 'line');
  },
  // A water chute: a half-pipe whose current sweeps you along.
  waterslide(b, r) {
    b.straight(4, { w1: 6, pipe1: 0.75 });
    const f = b.frame(), i0 = b.idx(), sg = b.turnSign();
    b.curve(b.clampTurn(sg * 40), 18, { dy: -4 });
    b.curve(b.clampTurn(-sg * 50), 18, { dy: -4 });
    b.straight(6, { dy: -2 });
    b.zones.push({ type: 'water', s0: f.s, s1: b.s, half: 4, y: f.y, i0, i1: b.idx(), v: 12 });
    b.coinsAlong(i0, b.idx(), 8, 'walls');
    // A long, walled run-out so a ball riding the wall isn't tipped off where it narrows.
    b.railsOn();
    b.straight(6, { pipe1: 0.3 });
    b.straight(6, { w1: 5, pipe1: 0 });
    b.railsOff();
  },
  gapJump(b, r, d) {
    b.straight(2);
    b.zone('boost', b.frame(), 3.5);
    b.straight(4);
    b.straight(3, { dy: 0.9 });
    b.gap(4 + d * 3, -1.6);
    b.railsOn();
    const i0 = b.idx();
    b.straight(14, { w1: 6 });
    b.railsOff();
    b.coinsAlong(i0, b.idx(), 4, 'line');
  },
  platform(b, r, d) {
    b.straight(3);
    const f = b.frame(), g = 7 + d * 2;
    b.obstacles.push(Object.assign(f, { type: 'platform', gap: g, len: 3.2, period: 4.8 - d, phase: r() }));
    b.gap(g, 0);
    b.straight(4);
  },
  // A narrow bridge over a gap that tilts from side to side.
  seesaw(b, r, d) {
    b.straight(3);
    const f = b.frame(), g = 10;
    b.obstacles.push(Object.assign(f, { type: 'seesaw', gap: g, bw: 3.4, amp: 0.2 + d * 0.1, speed: 1.1 + d * 0.5, phase: r() * 6.28 }));
    b.gap(g, 0);
    b.straight(4);
  },
  disc(b, r, d) {
    b.straight(2.5);
    const R = 3.8, g = 2 * R - 2;
    const f = b.frame();
    b.obstacles.push(Object.assign(f, { type: 'disc', r: R, gap: g, speed: (0.5 + 0.7 * d) * (r() < 0.5 ? 1 : -1) }));
    b.gap(g, 0);
    b.straight(3);
  },
  bumpers(b, r) {
    b.straight(2.5, { w1: 8 });
    b.railsOn();
    const i0 = b.idx();
    b.straight(16);
    const i1 = b.idx();
    b.railsOff();
    for (let k = 0; k < 8; k++) {
      const f = b.samples[Math.round(i0 + ((i1 - i0) * (k + 1)) / 9)];
      const u = ((k % 3) - 1) * 3.0 + (r() - 0.5) * 0.5;   // outer ones close to the wall: no gap to get wedged in
      const p = b.at(f, u, 0);
      b.obstacles.push({ type: 'bumper', x: p[0], y: p[1], z: p[2], yaw: f.yaw, s: f.s, u, r: 0.4 });
    }
    b.coinsAlong(i0, i1, 5, 'zigzag');
    b.straight(2.5, { w1: 5 });
  },
  narrow(b, r, d) {
    b.straight(2, { w1: 2.7 - d * 0.9 });
    const i0 = b.idx();
    b.straight(6 + r() * 4);
    b.curve(b.clampTurn(b.turnSign() * 25), 9);
    b.straight(5);
    b.coinsAlong(i0, b.idx(), 6, 'line');
    b.gem(b.frame());
    b.straight(2, { w1: 5 });
  },
  zigzag(b, r, d) {
    b.straight(2, { w1: 2.9 - d * 0.6 });
    const s = b.yaw > 0 ? -1 : 1;
    const i0 = b.idx();
    b.curve(35 * s, 6);
    b.curve(-70 * s, 6);
    b.curve(70 * s, 6);
    b.curve(-35 * s, 6);
    b.coinsAlong(i0, b.idx(), 6, 'line');
    b.straight(2, { w1: 5 });
  },
  crumble(b, r) {
    b.straight(3);
    const f = b.frame(), rows = 5, len = 2.4;
    for (let row = 0; row < rows; row++) for (let col = 0; col < 3; col++) {
      const p = b.at(f, (col - 1) * (f.w / 3), 0, row * len + len / 2);
      b.tiles.push({ x: p[0], y: p[1], z: p[2], yaw: f.yaw, hw: f.w / 6 - 0.05, hl: len / 2 - 0.05, s: f.s + row * len });
    }
    b.gap(rows * len, 0);
    b.straight(3);
  },
  trampoline(b, r, d) {
    b.straight(3);
    const pf = b.frame(), G = b.G || 24;
    // At the top of the arc of a ball taking the pad at cruising speed.
    b.gem(pf, 0, 0.6 + (13.5 * 13.5) / (2 * G), 0.8 + (10.3 * 13.5) / G);
    b.zone('pad', b.frame(), 1.6);
    b.straight(1.6);
    b.gap(6 + d * 2, 1.0);
    b.railsOn();
    b.straight(12, { w1: 6 });
    b.railsOff();
  },
  // Boost into a see-through loop-the-loop.
  loop(b) {
    b.straight(2);
    b.zone('boost', b.frame(), 3.5);
    b.straight(5);
    const i0 = b.idx();
    b.glass = true;
    b.loop(4.2, b.w + 1.4);
    b.glass = false;
    const i1 = b.idx();
    b.zones.push({ type: 'loop', i0, i1, s0: b.samples[i0].s, s1: b.samples[i1].s, half: b.w, y: b.samples[i0].y });
    b.coinsAlong(i0, i1, 6, 'line');
    b.straight(7);
  },
  // A U-shaped chute with S-bends; coins sit up on the walls.
  halfpipe(b) {
    b.straight(4, { w1: 7, pipe1: 1 });
    const i0 = b.idx(), sg = b.turnSign();
    b.curve(b.clampTurn(sg * 35), 16);
    b.curve(b.clampTurn(-sg * 45), 16);
    b.straight(6);
    b.zones.push({ type: 'pipe', s0: b.samples[i0].s, s1: b.s, half: 4, y: b.y });
    b.coinsAlong(i0, b.idx(), 9, 'walls');
    { const g = b.samples[Math.round((i0 + b.idx()) / 2)]; b.gem(g, (sg > 0 ? 1 : -1) * g.w * 0.45, 0.7); }
    b.straight(4, { w1: 5, pipe1: 0 });
  },
  // Walls of loose bricks across the track: smash through. A boost pad first lets you hit them hard.
  // Later ones may be a glass pane, which shatters if you're quick and stops you if you're not.
  bricks(b, r, d) {
    b.straight(2, { w1: 5 });
    const n = d > 0.45 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const glass = d > 0.25 && r() < (k ? 0.6 : 0.25);
      if (!glass && r() < 0.55) b.zone('boost', b.frame(), 3);
      b.straight(6);
      const f = b.frame();
      b.obstacles.push(Object.assign(f, glass ? { type: 'glass' } : { type: 'bricks', rows: d > 0.5 ? 4 : 3 }));
      b.straight(2.5);
      b.gem(b.frame());
      b.straight(5.5);
    }
  },
  // A glass tube: the track curls up into a closed pipe that twists and drops.
  tube(b, r, d) {
    b.straight(5, { w1: 5, pipe1: 1 });
    const i0 = b.idx(), sg = b.turnSign();
    b.tube = true;
    b.straight(3);
    b.curve(b.clampTurn(sg * 70), 20, { dy: -3 - d * 2 });
    b.curve(b.clampTurn(-sg * 90), 22, { dy: -3 - d * 2 });
    b.straight(4, { dy: -1 });
    b.tube = false;
    b.zones.push({ type: 'pipe', s0: b.samples[i0].s, s1: b.s, half: 3, y: b.y });
    b.coinsAlong(i0, b.idx(), 10, 'line');
    b.straight(5, { w1: 5, pipe1: 0 });
  },
  // Hammers on alternate sides slam down across the track and lift again; pass while they're up.
  hammers(b, r, d) {
    b.straight(3, { w1: 6 });
    const n = d > 0.5 ? 3 : 2;
    for (let k = 0; k < n; k++) {
      b.straight(2.5);
      const f = b.frame();
      b.obstacles.push(Object.assign(f, { type: 'hammer', side: k % 2 ? 1 : -1, len: f.w + 0.7, period: 3.4 - d * 0.7, phase: k * 0.37 + r() * 0.2 }));
      b.straight(5);
    }
    b.straight(2);
  },
  // Platforms hanging from a gantry swing from side to side over a drop; ride across them.
  swings(b, r, d) {
    b.straight(3, { w1: 5 });
    const f = b.frame(), n = 3, len = 3.2, gap = 0.4, period = 3.8 - d * 0.6, ph = r();
    for (let k = 0; k < n; k++) {
      b.obstacles.push(Object.assign({}, f, { type: 'swing', k, n, a: gap + len / 2 + k * (len + gap), len, bw: 3.6, arm: 7, amp: 0.26, period, phase: ph + k * 0.05 }));
    }
    b.gap(n * len + (n + 1) * gap, 0);
    b.straight(4);
  },
  // Cannons on alternating sides fire balls across the track.
  cannons(b, r, d) {
    b.straight(3);
    const n = d > 0.5 ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const f = b.frame();
      b.obstacles.push(Object.assign(f, { type: 'cannon', side: k % 2 ? 1 : -1, every: 2.8 - d * 0.8, phase: k * 0.9 + r(), speed: 12 + 4 * d }));
      b.straight(5);
    }
    b.straight(2);
  },
  // Big fans blow across the track, alternating direction.
  fans(b, r, d) {
    b.straight(2.5);
    for (let k = 0; k < 3; k++) {
      const f = b.frame(), dir = k % 2 ? 1 : -1;
      b.zone('wind', f, 3.6, { dir, power: 11 + 9 * d });
      b.obstacles.push(Object.assign(f, { type: 'fan', side: -dir, len: 3.6 }));
      b.straight(4.6);
    }
    b.straight(1.5);
  },
  boulders(b, r, d) {
    b.straight(2);
    b.railsOn();
    b.straight(16, { dy: 3 });
    const top = b.frame();
    b.railsOff();
    b.obstacles.push(Object.assign(top, { type: 'boulders', every: 2.6 - d * 0.8, r: 0.85, seed: Math.floor(r() * 1e9) }));
    b.straight(4);
  },
  // Logs roll down a walled ramp, alternating left and right halves.
  logs(b, r, d) {
    b.straight(2);
    b.railsOn();
    b.straight(18, { dy: 3.5 });
    const top = b.frame();
    b.railsOff();
    b.obstacles.push(Object.assign(top, { type: 'logs', every: 2.0 - d * 0.5, len: top.w * 0.46, r: 0.42, seed: Math.floor(r() * 1e9) }));
    b.straight(4);
  },
};

const EASY = new Set(['straight', 'curve', 'slopeDown', 'slopeUp', 'hills']);
const POOL = [
  { n: 'straight', w: 2, from: 1 }, { n: 'curve', w: 3, from: 1 }, { n: 'slopeDown', w: 2, from: 1 }, { n: 'hills', w: 2, from: 1 },
  { n: 'spinner', w: 3, from: 1 }, { n: 'pendulum', w: 3, from: 2 }, { n: 'gapJump', w: 2, from: 2 },
  { n: 'pushers', w: 2, from: 3 }, { n: 'bumpers', w: 2, from: 3 }, { n: 'helix', w: 1.5, from: 3 },
  { n: 'platform', w: 2, from: 4 }, { n: 'split', w: 1.5, from: 4 }, { n: 'slopeUp', w: 1, from: 4 },
  { n: 'sliders', w: 2, from: 5 }, { n: 'belt', w: 1.5, from: 5 },
  { n: 'disc', w: 2, from: 6 }, { n: 'halfpipe', w: 2, from: 6 }, { n: 'windmill', w: 2, from: 6 },
  { n: 'waterslide', w: 1.5, from: 7 }, { n: 'cannons', w: 2, from: 7 }, { n: 'narrow', w: 2, from: 7 },
  { n: 'crumble', w: 2, from: 8 }, { n: 'ice', w: 1.5, from: 8 },
  { n: 'trampoline', w: 2, from: 9 }, { n: 'fans', w: 2, from: 9 }, { n: 'pillars', w: 2, from: 9 },
  { n: 'seesaw', w: 1.5, from: 10 }, { n: 'zigzag', w: 2, from: 10 },
  { n: 'loop', w: 1, from: 11 }, { n: 'boulders', w: 2, from: 12 }, { n: 'logs', w: 1.5, from: 12 },
  { n: 'tube', w: 1.5, from: 6 }, { n: 'hammers', w: 2, from: 8 }, { n: 'swings', w: 1.5, from: 13 }, { n: 'bricks', w: 2, from: 2 },
];
// Every fifth level is the world's boss level: a hand-picked run through its set pieces, then a chase.
const SHOWCASE = {
  meadow: ['hills', 'loop', 'curve', 'windmill', 'halfpipe', 'spinner', 'helix', 'gapJump', 'fans', 'loop'],
  ocean: ['waterslide', 'belt', 'seesaw', 'platform', 'curve', 'loop', 'waterslide', 'split', 'trampoline'],
  canyon: ['slopeDown', 'logs', 'halfpipe', 'boulders', 'gapJump', 'fans', 'helix', 'crumble', 'loop'],
  snow: ['ice', 'helix', 'halfpipe', 'slopeDown', 'ice', 'windmill', 'gapJump', 'loop', 'zigzag'],
  sky: ['gapJump', 'trampoline', 'fans', 'seesaw', 'disc', 'narrow', 'loop', 'gapJump', 'helix'],
  city: ['pillars', 'split', 'sliders', 'belt', 'pushers', 'loop', 'windmill', 'cannons', 'helix'],
  volcano: ['loop', 'cannons', 'pendulum', 'crumble', 'boulders', 'halfpipe', 'logs', 'pushers', 'loop'],
  space: ['trampoline', 'gapJump', 'helix', 'windmill', 'loop', 'seesaw', 'gapJump', 'fans', 'loop'],
};
// The boss chase: flowing pieces with nothing to wait for, so you can keep ahead if you keep rolling.
const CHASE = {
  meadow: ['slopeDown', 'curve', 'hills', 'gapJump', 'curve', 'slopeDown', 'zigzag'],
  ocean: ['curve', 'slopeDown', 'waterslide', 'trampoline', 'zigzag', 'curve'],
  canyon: ['slopeDown', 'curve', 'halfpipe', 'gapJump', 'zigzag', 'slopeDown'],
  snow: ['slopeDown', 'ice', 'curve', 'hills', 'slopeDown', 'zigzag'],
  sky: ['gapJump', 'curve', 'trampoline', 'slopeDown', 'zigzag', 'gapJump'],
  city: ['slopeDown', 'zigzag', 'curve', 'halfpipe', 'slopeDown', 'curve'],
  volcano: ['slopeDown', 'curve', 'halfpipe', 'slopeDown', 'zigzag', 'gapJump'],
  space: ['slopeDown', 'trampoline', 'curve', 'gapJump', 'hills', 'zigzag'],
};
export const MODULE_NAMES = Object.keys(M);

function checkpoint(b) {
  b.straight(1.5, { w1: 6 });
  const f = b.frame();
  b.checkpoints.push(f);
  b.zone('checkpoint', f, 0.5, { index: b.checkpoints.length - 1 });
  b.straight(3);
  b.straight(1.5, { w1: 5 });
}

export function generateLevel(n, opts = {}) {
  const r = mulberry32(n * 9973 + 17);
  const lap = Math.floor((n - 1) / (5 * WORLDS.length));
  const d = Math.min(1, (n - 1) / 30);
  const wi = Math.floor((n - 1) / 5) % WORLDS.length, world = WORLDS[wi];
  const boss = n % 5 === 0;
  const b = new Builder(r);
  b.G = world.gravity || 24;

  // Start pad: wide, walled, then narrowing to the normal width.
  b.railsOn();
  b.straight(9);
  b.railsOff();
  b.checkpoints.push(Object.assign(b.samples[5], {}));
  b.straight(2, { w1: 5 });

  // Each world leans on its own favourite pieces.
  const pool = POOL.filter((p) => n >= p.from).map((p) => (world.favor.includes(p.n) ? Object.assign({}, p, { w: p.w * 2.5 }) : p));
  const fresh = POOL.filter((p) => p.from === n).map((p) => p.n);
  const count = opts.modules || Math.min(28, 13 + Math.floor(n * 0.4)) + lap * 2;
  const plan = [];
  let prev = '', hard = false;
  for (let i = 0; i < count; i++) {
    let name;
    if (fresh.length && i % 2 === 1 && fresh[0] !== prev) name = fresh.shift();
    else if (hard && r() < 0.55) name = ['straight', 'curve', 'slopeDown'][Math.floor(r() * 3)];
    else {
      let cand = pool.filter((p) => p.n !== prev && !fresh.includes(p.n));
      if (!cand.length) cand = pool.filter((p) => p.n !== prev);
      let tot = cand.reduce((a, p) => a + p.w, 0), x = r() * tot;
      name = (cand.find((p) => (x -= p.w) < 0) || cand[cand.length - 1]).n;
    }
    plan.push(name);
    prev = name;
    hard = !EASY.has(name);
  }
  if (boss) plan.splice(0, plan.length, ...SHOWCASE[world.id].slice(0, 6), ...plan.slice(0, lap * 2));
  if (opts.only) plan.splice(0, plan.length, ...opts.only);
  const chasePlan = boss && !opts.only ? CHASE[world.id] : opts.chase ? CHASE[opts.chase] : null;
  let since = 0;
  const sections = [];
  plan.forEach((name, i) => {
    sections.push({ name, s: b.s });
    M[name](b, r, d);
    if (++since >= 4 && i < plan.length - 1) { checkpoint(b); since = 0; }
  });
  let chase = null;
  if (chasePlan) {
    // A checkpoint, a wide run-up, then the boss comes rolling after you.
    checkpoint(b);
    b.straight(6, { w1: 6 });
    chase = { s0: b.s };
    sections.push({ name: 'boss', s: b.s });
    since = 0;
    chasePlan.forEach((name, i) => {
      sections.push({ name, s: b.s });
      M[name](b, r, Math.min(d, 0.6));
      if (++since >= 3 && i < chasePlan.length - 1) { checkpoint(b); since = 0; }
    });
  }

  // Power-ups: just before a hard stretch, on their own random stream so layouts don't shift.
  const pr = mulberry32(n * 7919 + 3), powerups = [];
  const at = (s) => { let i = b.samples.findIndex((f) => f.s >= s); while (i > 0 && b.samples[i].gap) i--; return b.samples[Math.max(0, i)]; };
  const putPower = (s, kind) => { const f = at(s), p = b.at(f, 0, 0.95); powerups.push({ x: p[0], y: p[1], z: p[2], s: f.s, kind }); };
  if (n >= 3) {
    for (let i = 0; i < sections.length - 1 && powerups.length < 2; i++) {
      const a = sections[i], nx = sections[i + 1];
      if (!EASY.has(a.name) || EASY.has(nx.name) || nx.name === 'boss' || pr() > 0.45) continue;
      const q = pr();
      putPower((a.s + nx.s) / 2, q < 0.45 ? 'shield' : q < 0.8 ? 'magnet' : 'x2');
    }
  }
  if (chase) putPower(chase.s0 - 3, pr() < 0.6 ? 'shield' : 'x2');

  // Finish line. Except in races, a bonus run follows: four speed pads, a kicker, and landing bands
  // worth x1 to x5 depending on how far you fly (so on how many pads you hit).
  const isRace = !chasePlan && n % 4 === 0;
  b.straight(3, { w1: 8 });
  b.railsOn();
  b.finish = b.frame();
  b.zone('finish', b.finish, 1);
  let bonus = null;
  if (!isRace) {
    b.straight(4);
    const pads = [];
    // Just off the middle, alternating: rolling dead straight misses them all, a gentle weave hits every one.
    // Each gap is a little longer than the last, since you're going faster each time.
    [-0.8, 0.8, -0.8, 0.8].forEach((u, k) => {
      const f = b.frame();
      b.zone('speed', f, 1.4, { u, hw: 0.65 });
      pads.push({ s: f.s, u });
      b.straight(5.5 + k * 1.2);
    });
    b.straight(2);
    b.straight(2.5, { dy: 0.5 });
    const lip = b.frame();
    b.railsOff();
    b.gap(5, -4);
    b.railsOn();
    const land = b.frame();
    b.straight(24, { w1: 9 });
    b.obstacles.push(Object.assign(b.frame(), { type: 'endwall' }));
    b.straight(1.5);
    b.railsOff();
    // Where each band starts (metres past the lip): halfway between the flights after 0..4 pads.
    const flight = (v) => {
      const th = Math.atan2(0.5, 2.5), vx = v * Math.cos(th), vy = v * Math.sin(th), G = b.G;
      const t = (vy + Math.sqrt(vy * vy + 2 * G * 4)) / G;
      return vx * t * BONUS_FIT;
    };
    // Speed at the lip after k pads (the ball holds it up the kicker).
    const v = (k) => Math.min(19.7, 10.5 + k * 2.3);
    bonus = { lip: lip.s, land: land.s, end: b.s, pads, edges: [0.5, 1.5, 2.5, 3.5].map((k) => flight(v(k))) };
  } else {
    b.straight(14);
    b.railsOff();
  }

  if (chase) chase.s1 = b.finish.s;
  return build(b, { n, world, d, race: isRace, boss: !!chasePlan, showcase: false, chase, bonus, powerups, plan: chasePlan ? [...plan, 'boss', ...chasePlan] : plan, sections });
}

/* ---------------- geometry ---------------- */

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

// An indexed ribbon between two polylines A and B, wound so its normal faces `want`.
function ribbon(A, B, want, uvA, uvB) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < A.length; i++) {
    pos.push(...A[i], ...B[i]);
    if (uvA) uv.push(...uvA[i], ...uvB[i]);
  }
  let flip = false;
  if (A.length > 1) {
    const n = cross(sub(B[0], A[0]), sub(A[1], A[0]));
    flip = dot(n, want(0)) < 0;
  }
  for (let i = 0; i + 1 < A.length; i++) {
    const a = i * 2, bb = a + 1, c = a + 2, dd = a + 3;
    if (!flip) idx.push(a, bb, c, bb, dd, c);
    else idx.push(a, c, bb, bb, c, dd);
  }
  return { pos, uv, idx };
}
function merge(parts) {
  const pos = [], uv = [], idx = [];
  for (const p of parts) {
    const base = pos.length / 3;
    pos.push(...p.pos);
    if (p.uv) uv.push(...p.uv);
    for (const i of p.idx) idx.push(i + base);
  }
  return { pos, uv, idx };
}

function pt(f, u, h) {
  const [rx, rz] = rightOf(f.yaw), nx = f.nx || 0, ny = f.ny ?? 1, nz = f.nz || 0;
  return [f.x + rx * u + nx * h, f.y + ny * h, f.z + rz * u + nz * h];
}

// Surface, walls and underside for a run of samples, K columns across.
function stripGeom(G, K) {
  const cols = [];
  for (let k = 0; k <= K; k++) cols.push(G.map((f) => { const u = -f.w / 2 + (f.w * k) / K; return pt(f, u, surfH(f, u)); }));
  const up = (i) => [G[i].nx || 0, G[i].ny ?? 1, G[i].nz || 0];
  const tops = [];
  for (let k = 0; k < K; k++) tops.push(ribbon(cols[k], cols[k + 1], up, G.map((f) => [k / K, f.s / 4]), G.map((f) => [(k + 1) / K, f.s / 4])));
  const Lb = G.map((f) => pt(f, -f.w / 2, -THICK)), Rb = G.map((f) => pt(f, f.w / 2, -THICK));
  const outL = (i) => { const [rx, rz] = rightOf(G[i].yaw); return [-rx, 0, -rz]; };
  const outR = (i) => { const [rx, rz] = rightOf(G[i].yaw); return [rx, 0, rz]; };
  const vTop = G.map((f) => [f.s / 4, 0]), vBot = G.map((f) => [f.s / 4, -THICK]);
  return {
    top: merge(tops),
    left: ribbon(cols[0], Lb, outL, vTop, vBot),
    right: ribbon(cols[K], Rb, outR, vTop, vBot),
    bottom: ribbon(Lb, Rb, (i) => up(i).map((v) => -v), G.map(() => [0, 0]), G.map(() => [1, 0])),
    cols, Lb, Rb,
  };
}

function build(b, meta) {
  const S = b.samples;
  const edge = (f, side, h = 0, out = 0) => pt(f, side * (f.w / 2 + out), h);
  const strips = [];
  for (const ids of b.strips) {
    if (ids.length < 2) continue;
    const F = ids.map((i) => S[i]);
    const K = F.some((f) => f.pipe > 0) ? K_PIPE : 1;
    const all = stripGeom(F, K);
    const f0 = F[0], f1 = F[F.length - 1], last = F.length - 1;
    const cap = (fr, i, dir) => ribbon([all.cols[0][i], all.Lb[i]], [all.cols[K][i], all.Rb[i]],
      () => { const [fx, fz] = fwdOf(fr.yaw); return [fx * dir, 0, fz * dir]; }, [[0, 0], [0, 1]], [[1, 0], [1, 1]]);
    const back = cap(f0, 0, -1), front = cap(f1, last, 1);
    const phys = merge([all.top, all.left, all.right, back, front]);
    // Rendering is split where the see-through (loop) flag changes.
    const segGlass = (i) => !!(F[i].glass || F[i + 1].glass);
    const parts = [];
    let a = 0;
    for (let i = 1; i <= last; i++) {
      if (i === last || segGlass(i) !== segGlass(a)) {
        const g = stripGeom(F.slice(a, i + 1), K);
        parts.push({ top: g.top, sides: merge([g.left, g.right, g.bottom]), glass: segGlass(a) });
        a = i;
      }
    }
    parts[0].sides = merge([parts[0].sides, back]);
    parts[parts.length - 1].sides = merge([parts[parts.length - 1].sides, front]);
    strips.push({ parts, phys, s0: f0.s, s1: f1.s });
  }

  const rails = [];
  for (const [i0, i1] of b.railRuns) {
    // Rails run only over solid samples.
    let run = [];
    const flush = () => {
      if (run.length >= 2) {
        for (const side of [-1, 1]) {
          const inB = run.map((f) => edge(f, side, 0, 0)), inT = run.map((f) => edge(f, side, RAIL_H, 0));
          const outT = run.map((f) => edge(f, side, RAIL_H, RAIL_W)), outB = run.map((f) => edge(f, side, -THICK * 0.6, RAIL_W));
          const inward = (i) => { const [rx, rz] = rightOf(run[i].yaw); return [-side * rx, 0, -side * rz]; };
          const outward = (i) => { const [rx, rz] = rightOf(run[i].yaw); return [side * rx, 0, side * rz]; };
          const uvs = (P) => run.map((f, i) => [f.s / 2, P[i][1] - f.y]);
          rails.push(merge([
            ribbon(inB, inT, inward, uvs(inB), uvs(inT)),
            ribbon(inT, outT, () => [0, 1, 0], uvs(inT), uvs(outT)),
            ribbon(outT, outB, outward, uvs(outT), uvs(outB)),
          ]));
        }
      }
      run = [];
    };
    for (let i = i0; i <= i1; i++) {
      if (S[i].gap) flush(); else run.push(S[i]);
    }
    flush();
  }

  // Glass canopies over tube sections: an arch from one wall top to the other.
  const tubes = [];
  let run = [];
  const flushTube = () => {
    if (run.length >= 2) {
      const KT = 12, cols = [];
      for (let k = 0; k <= KT; k++) {
        const ph = (k / KT) * Math.PI;
        cols.push(run.map((f) => { const hw = f.w / 2; return pt(f, -Math.cos(ph) * hw, f.pipe * H_PIPE + Math.sin(ph) * hw * 0.95); }));
      }
      const parts = [];
      for (let k = 0; k < KT; k++) {
        const ph = ((k + 0.5) / KT) * Math.PI;
        const inward = (i) => { const [rx, rz] = rightOf(run[i].yaw); return [Math.cos(ph) * rx, -Math.sin(ph), Math.cos(ph) * rz]; };
        parts.push(ribbon(cols[k], cols[k + 1], inward, run.map((f) => [k / KT, f.s / 2]), run.map((f) => [(k + 1) / KT, f.s / 2])));
      }
      tubes.push(merge(parts));
    }
    run = [];
  };
  for (const f of S) { if (f.tube && !f.gap) run.push(f); else flushTube(); }
  flushTube();

  const overlays = [];
  for (const z of b.zones) {
    if (z.type !== 'ice' && z.type !== 'belt' && z.type !== 'water') continue;
    const G = S.slice(z.i0, z.i1 + 1).filter((f) => !f.gap);
    if (G.length < 2) continue;
    const K = G.some((f) => f.pipe > 0) ? K_PIPE : 1, cols = [];
    for (let k = 0; k <= K; k++) cols.push(G.map((f) => { const u = -f.w / 2 + 0.15 + ((f.w - 0.3) * k) / K; return pt(f, u, surfH(f, u) + 0.035); }));
    const up = (i) => [G[i].nx || 0, G[i].ny ?? 1, G[i].nz || 0], tops = [];
    for (let k = 0; k < K; k++) tops.push(ribbon(cols[k], cols[k + 1], up, G.map((f) => [k / K, f.s / 2]), G.map((f) => [(k + 1) / K, f.s / 2])));
    overlays.push({ type: z.type, v: z.v || 0, geom: merge(tops) });
  }

  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const f of S) {
    minY = Math.min(minY, f.y); maxY = Math.max(maxY, f.y);
    minX = Math.min(minX, f.x); maxX = Math.max(maxX, f.x);
    minZ = Math.min(minZ, f.z); maxZ = Math.max(maxZ, f.z);
  }
  return Object.assign(meta, {
    samples: S,
    strips,
    rails,
    tubes,
    overlays,
    obstacles: b.obstacles,
    coins: b.coins,
    zones: b.zones,
    checkpoints: b.checkpoints,
    tiles: b.tiles,
    finish: b.finish,
    start: b.checkpoints[0],
    length: S[S.length - 1].s,
    bounds: { minX, maxX, minY, maxY, minZ, maxZ },
  });
}
