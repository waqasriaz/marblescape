/* Marblescape — ball trails and finish celebrations sold in the shop, and their shop previews. */

export const TRAILS = [
  { id: 'skin', name: 'Classic', price: 0, cols: null },
  { id: 'smoke', name: 'Smoke', price: 200, cols: ['#c4c7d0', '#9a9daa'] },
  { id: 'bubbles', name: 'Bubbles', price: 250, cols: ['#bfeaff', '#ffffff', '#8fd8ff'] },
  { id: 'fire', name: 'Fire', price: 300, cols: ['#ffd23f', '#ff8a1a', '#ff3b1a'] },
  { id: 'frost', name: 'Frost', price: 300, cols: ['#7fd8ff', '#ffffff', '#bff4ff'] },
  { id: 'sparkle', name: 'Sparkle', price: 400, cols: ['#fff1a8', '#ffd23f', '#ffffff'] },
  { id: 'neon', name: 'Neon', price: 450, cols: ['#00e5ff', '#ff2bd6'] },
  { id: 'rainbow', name: 'Rainbow', price: 600, cols: ['#ff4b4b', '#ff9a3a', '#ffe14a', '#4fd15a', '#3aa0ff', '#7a5cff'] },
  { id: 'comet', name: 'Comet', price: 800, cols: ['#ffffff', '#9fd4ff', '#5a8cff'] },
];

export const CELEBRATIONS = [
  { id: 'confetti', name: 'Confetti', price: 0, cols: ['#ffd23f', '#ff4f86', '#5cf2c4', '#8fb8ff', '#ffffff', '#ff8a3a'] },
  { id: 'rainbow', name: 'Rainbow Rings', price: 300, cols: ['#ff4b4b', '#ff9a3a', '#ffe14a', '#4fd15a', '#3aa0ff', '#7a5cff'] },
  { id: 'fireworks', name: 'Fireworks', price: 450, cols: ['#ff4f86', '#ffd23f', '#5cf2c4', '#8fb8ff', '#c98cff'] },
  { id: 'goldrain', name: 'Gold Rain', price: 600, cols: ['#ffd23f', '#fff1a8', '#e8b13a'] },
  { id: 'supernova', name: 'Supernova', price: 900, cols: ['#ffffff', '#ffd23f', '#c98cff'] },
];

export const trailById = (id) => TRAILS.find((t) => t.id === id) || TRAILS[0];
export const celebrationById = (id) => CELEBRATIONS.find((c) => c.id === id) || CELEBRATIONS[0];

function rnd(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function backdrop(g, s) {
  g.clearRect(0, 0, s, s);
  g.save();
  g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 2, 0, Math.PI * 2); g.clip();
  const bg = g.createRadialGradient(s / 2, s * 0.4, 4, s / 2, s / 2, s / 2);
  bg.addColorStop(0, '#2c2766'); bg.addColorStop(1, '#120f30');
  g.fillStyle = bg; g.fillRect(0, 0, s, s);
}
const dot = (g, x, y, r, c, a = 1) => { g.globalAlpha = a; g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; };

// A ball sweeping up a curve, leaving the trail behind it.
export function drawTrail(canvas, trail, ballColor) {
  const g = canvas.getContext('2d'), s = canvas.width, r = rnd(7);
  backdrop(g, s);
  const cols = trail.cols || [ballColor];
  const path = (k) => [s * (0.12 + 0.62 * k), s * (0.8 - 0.5 * k * k)];
  g.globalCompositeOperation = trail.id === 'smoke' ? 'source-over' : 'lighter';
  for (let i = 0; i < 46; i++) {
    const k = i / 46, [x, y] = path(k), c = trail.id === 'rainbow' ? cols[Math.floor(k * cols.length * 2) % cols.length] : cols[i % cols.length];
    const sz = (trail.id === 'sparkle' ? 2 + r() * 3 : trail.id === 'bubbles' ? 3 + r() * 6 : 4 + k * 8) * (s / 128);
    const jx = (trail.id === 'sparkle' || trail.id === 'bubbles' ? (r() - 0.5) * 20 : 0) * (s / 128);
    const jy = (trail.id === 'fire' ? -r() * 14 * (1 - k) : trail.id === 'sparkle' || trail.id === 'bubbles' ? (r() - 0.5) * 20 : 0) * (s / 128);
    if (trail.id === 'neon') { dot(g, x - 4, y - 4, sz * 0.6, cols[0], 0.2 + 0.7 * k); dot(g, x + 4, y + 4, sz * 0.6, cols[1], 0.2 + 0.7 * k); continue; }
    dot(g, x + jx, y + jy, sz, c, 0.15 + 0.7 * k);
  }
  g.globalCompositeOperation = 'source-over';
  const [bx, by] = path(1), br = s * 0.12;
  const sh = g.createRadialGradient(bx - br * 0.35, by - br * 0.35, 1, bx, by, br);
  sh.addColorStop(0, '#ffffff'); sh.addColorStop(0.35, ballColor); sh.addColorStop(1, '#0b0b20');
  g.fillStyle = sh; g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2); g.fill();
  g.restore();
}

// A frozen moment of the celebration.
export function drawCelebration(canvas, c) {
  const g = canvas.getContext('2d'), s = canvas.width, r = rnd(11), k = s / 128;
  backdrop(g, s);
  g.globalCompositeOperation = 'lighter';
  const cx = s / 2, cy = s / 2;
  if (c.id === 'fireworks') {
    [[0.32, 0.36, 0], [0.68, 0.3, 1], [0.52, 0.62, 2]].forEach(([x, y, i]) => {
      for (let j = 0; j < 22; j++) { const a = (j / 22) * Math.PI * 2, d = (16 + r() * 8) * k; dot(g, x * s + Math.cos(a) * d, y * s + Math.sin(a) * d, 2.2 * k, c.cols[i], 0.9); }
      dot(g, x * s, y * s, 4 * k, '#ffffff', 0.9);
    });
  } else if (c.id === 'goldrain') {
    for (let j = 0; j < 60; j++) dot(g, r() * s, r() * s, (1.5 + r() * 3) * k, c.cols[j % 3], 0.4 + r() * 0.6);
  } else if (c.id === 'rainbow') {
    c.cols.forEach((col, i) => { g.strokeStyle = col; g.lineWidth = 4 * k; g.globalAlpha = 0.9; g.beginPath(); g.ellipse(cx, cy + 14 * k, (14 + i * 6) * k, (6 + i * 2.6) * k, 0, 0, Math.PI * 2); g.stroke(); });
    g.globalAlpha = 1;
  } else if (c.id === 'supernova') {
    const gr = g.createRadialGradient(cx, cy, 2, cx, cy, s * 0.42);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,210,63,0.8)'); gr.addColorStop(0.6, 'rgba(201,140,255,0.35)'); gr.addColorStop(1, 'rgba(201,140,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    for (let j = 0; j < 30; j++) { const a = r() * Math.PI * 2, d = (20 + r() * 34) * k; dot(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.6 * k, '#ffffff', 0.9); }
  } else {
    g.globalCompositeOperation = 'source-over';
    for (let j = 0; j < 46; j++) { g.save(); g.translate(r() * s, r() * s); g.rotate(r() * 3); g.fillStyle = c.cols[j % c.cols.length]; g.fillRect(-3 * k, -1.5 * k, 6 * k, 3 * k); g.restore(); }
  }
  g.globalCompositeOperation = 'source-over';
  g.restore();
}
