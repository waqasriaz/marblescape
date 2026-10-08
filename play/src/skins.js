/*
 * Marblescape — ball skins. Each skin paints a 512x256 equirectangular texture on a canvas
 * and sets the material's finish. The shop draws its swatches from the same painter.
 */

function rnd(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const blob = (g, x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
// Equirectangular maps squeeze near the poles; draw shapes on the band around the equator.
const wave = (g, w, h, y0, amp, k, ph, col, lw) => {
  g.strokeStyle = col; g.lineWidth = lw; g.beginPath();
  for (let x = 0; x <= w; x += 4) { const y = y0 + Math.sin((x / w) * Math.PI * 2 * k + ph) * amp; if (x) g.lineTo(x, y); else g.moveTo(x, y); }
  g.stroke();
};

export const SKINS = [
  { id: 'classic', name: 'Blue Glass', price: 0, trail: '#7fb8ff', mat: { roughness: 0.12, clearcoat: 1 },
    paint(g, w, h) { g.fillStyle = '#1747d6'; g.fillRect(0, 0, w, h); wave(g, w, h, h * 0.42, 30, 2, 0, '#5aa8ff', 18); wave(g, w, h, h * 0.58, 26, 3, 2, '#ffffff', 6); wave(g, w, h, h * 0.7, 20, 1, 4, '#3b7bff', 12); } },
  { id: 'beach', name: 'Beach Ball', price: 100, trail: '#ffe14a', mat: { roughness: 0.35, clearcoat: 0.6 },
    paint(g, w, h) { const c = ['#ff4b4b', '#ffffff', '#2f7bff', '#ffd23f', '#ffffff', '#2fcf6a']; c.forEach((col, i) => { g.fillStyle = col; g.fillRect((i * w) / 6, 0, w / 6 + 1, h); }); g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h * 0.08); g.fillRect(0, h * 0.92, w, h * 0.08); } },
  { id: 'soccer', name: 'Soccer', price: 150, trail: '#ffffff', mat: { roughness: 0.45, clearcoat: 0.3 },
    paint(g, w, h) {
      g.fillStyle = '#f7f7f7'; g.fillRect(0, 0, w, h);
      const hex = (x, y, r) => { g.fillStyle = '#16161c'; g.beginPath(); for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 - Math.PI / 2; g.lineTo(x + Math.cos(a) * r * 1.4, y + Math.sin(a) * r); } g.closePath(); g.fill(); };
      for (let i = 0; i < 5; i++) { hex((i + 0.5) * (w / 5), h * 0.3, 22); hex(i * (w / 5), h * 0.68, 22); }
      g.fillStyle = '#16161c'; g.fillRect(0, 0, w, h * 0.07); g.fillRect(0, h * 0.93, w, h * 0.07);
    } },
  { id: 'basket', name: 'Basketball', price: 150, trail: '#ff8a3a', mat: { roughness: 0.6, clearcoat: 0.2 },
    paint(g, w, h) {
      g.fillStyle = '#e8702a'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1800; i++) blob(g, Math.random() * w, Math.random() * h, 1, 'rgba(0,0,0,0.12)');
      g.fillStyle = '#1a1010'; g.fillRect(0, h / 2 - 3, w, 6); g.fillRect(w * 0.25 - 3, 0, 6, h); g.fillRect(w * 0.75 - 3, 0, 6, h);
      wave(g, w, h, h / 2, h * 0.32, 1, 0, '#1a1010', 6);
    } },
  { id: 'tennis', name: 'Tennis', price: 200, trail: '#d8ff4a', mat: { roughness: 0.85, clearcoat: 0 },
    paint(g, w, h) { g.fillStyle = '#cfe83a'; g.fillRect(0, 0, w, h); for (let i = 0; i < 2500; i++) blob(g, Math.random() * w, Math.random() * h, 1.2, 'rgba(255,255,255,0.12)'); wave(g, w, h, h / 2, h * 0.28, 2, 0, '#ffffff', 10); } },
  { id: 'eight', name: '8 Ball', price: 250, trail: '#c9c9ff', mat: { roughness: 0.06, clearcoat: 1 },
    paint(g, w, h) { g.fillStyle = '#0d0d12'; g.fillRect(0, 0, w, h); blob(g, w * 0.5, h * 0.5, 34, '#ffffff'); g.fillStyle = '#0d0d12'; g.font = 'bold 44px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('8', w * 0.5, h * 0.5 + 2); } },
  { id: 'melon', name: 'Watermelon', price: 250, trail: '#ff5a7a', mat: { roughness: 0.3, clearcoat: 0.8 },
    paint(g, w, h) { g.fillStyle = '#4caf3a'; g.fillRect(0, 0, w, h); for (let i = 0; i < 10; i++) { g.strokeStyle = '#1f5e1f'; g.lineWidth = 14; g.beginPath(); for (let y = 0; y <= h; y += 6) { const x = (i * w) / 10 + Math.sin(y * 0.12 + i) * 6; if (y) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); } } },
  { id: 'candy', name: 'Candy', price: 300, trail: '#ff9ad1', mat: { roughness: 0.1, clearcoat: 1 },
    paint(g, w, h) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = '#ff5fa8'; for (let i = -h; i < w; i += 40) { g.beginPath(); g.moveTo(i, h); g.lineTo(i + 20, h); g.lineTo(i + 20 + h, 0); g.lineTo(i + h, 0); g.fill(); } } },
  { id: 'zebra', name: 'Zebra', price: 300, trail: '#ffffff', mat: { roughness: 0.5, clearcoat: 0.3 },
    paint(g, w, h) { g.fillStyle = '#f6f6f2'; g.fillRect(0, 0, w, h); for (let i = 0; i < 14; i++) { g.fillStyle = '#16161c'; g.beginPath(); const x = (i * w) / 14; g.moveTo(x, 0); for (let y = 0; y <= h; y += 8) g.lineTo(x + Math.sin(y * 0.05 + i) * 10, y); for (let y = h; y >= 0; y -= 8) g.lineTo(x + 14 + Math.sin(y * 0.06 + i * 2) * 8, y); g.fill(); } } },
  { id: 'moon', name: 'Moon', price: 350, trail: '#e6e6f0', mat: { roughness: 0.95, clearcoat: 0 },
    paint(g, w, h) { const r = rnd(4); g.fillStyle = '#b9b9c2'; g.fillRect(0, 0, w, h); for (let i = 0; i < 70; i++) { const x = r() * w, y = h * 0.15 + r() * h * 0.7, s = 4 + r() * 18; blob(g, x, y, s, 'rgba(90,90,100,0.45)'); blob(g, x - s * 0.2, y - s * 0.2, s * 0.75, 'rgba(160,160,170,0.6)'); } } },
  { id: 'ocean', name: 'Ocean', price: 350, trail: '#5ad1ff', mat: { roughness: 0.15, clearcoat: 1 },
    paint(g, w, h) { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#9fe6ff'); gr.addColorStop(1, '#0a4fb0'); g.fillStyle = gr; g.fillRect(0, 0, w, h); for (let i = 0; i < 5; i++) wave(g, w, h, h * (0.25 + i * 0.13), 10, 4, i, 'rgba(255,255,255,0.75)', 5); } },
  { id: 'earth', name: 'Planet', price: 400, trail: '#7fd8ff', mat: { roughness: 0.4, clearcoat: 0.5 },
    paint(g, w, h) { const r = rnd(9); g.fillStyle = '#1f6fd6'; g.fillRect(0, 0, w, h); for (let i = 0; i < 26; i++) { const x = r() * w, y = h * 0.2 + r() * h * 0.6; for (let k = 0; k < 6; k++) blob(g, x + (r() - 0.5) * 50, y + (r() - 0.5) * 30, 10 + r() * 16, r() < 0.7 ? '#3fae4a' : '#c8a060'); } for (let i = 0; i < 30; i++) blob(g, r() * w, r() * h, 6 + r() * 12, 'rgba(255,255,255,0.55)'); g.fillStyle = '#f2f6ff'; g.fillRect(0, 0, w, h * 0.08); g.fillRect(0, h * 0.92, w, h * 0.08); } },
  { id: 'rainbow', name: 'Rainbow', price: 450, trail: '#ffffff', mat: { roughness: 0.15, clearcoat: 1 },
    paint(g, w, h) { const c = ['#ff4b4b', '#ff9a3a', '#ffe14a', '#4fd15a', '#3aa0ff', '#7a5cff', '#ff5fd0']; c.forEach((col, i) => { g.fillStyle = col; g.fillRect(0, (i * h) / 7, w, h / 7 + 1); }); } },
  { id: 'snowball', name: 'Snowball', price: 450, trail: '#ffffff', mat: { roughness: 0.9, clearcoat: 0 },
    paint(g, w, h) { const r = rnd(6); g.fillStyle = '#f4f8ff'; g.fillRect(0, 0, w, h); for (let i = 0; i < 400; i++) blob(g, r() * w, r() * h, 2 + r() * 7, r() < 0.5 ? 'rgba(190,212,240,0.45)' : 'rgba(255,255,255,0.8)'); } },
  { id: 'ice', name: 'Ice', price: 500, trail: '#bff4ff', mat: { roughness: 0.04, clearcoat: 1, opacity: 0.88 },
    paint(g, w, h) { const r = rnd(3); g.fillStyle = '#bfefff'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2; for (let i = 0; i < 40; i++) { const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 60, y + (r() - 0.5) * 60); g.stroke(); } } },
  { id: 'lava', name: 'Lava', price: 600, trail: '#ff7a1a', glow: true, mat: { roughness: 0.6, clearcoat: 0.2, emissive: 1 },
    paint(g, w, h) { const r = rnd(5); g.fillStyle = '#1c0d08'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ff6a1a'; g.lineWidth = 5; for (let i = 0; i < 26; i++) { let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 60; y += (r() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); } } },
  { id: 'neon', name: 'Neon', price: 650, trail: '#00e5ff', glow: true, mat: { roughness: 0.2, clearcoat: 1, emissive: 1 },
    paint(g, w, h) { g.fillStyle = '#0a0a1c'; g.fillRect(0, 0, w, h); g.lineWidth = 4; for (let x = 0; x <= w; x += 32) { g.strokeStyle = '#00e5ff'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 16; y < h; y += 32) { g.strokeStyle = '#ff2bd6'; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } } },
  { id: 'galaxy', name: 'Galaxy', price: 700, trail: '#c98cff', glow: true, mat: { roughness: 0.2, clearcoat: 1, emissive: 0.8 },
    paint(g, w, h) { const r = rnd(8); g.fillStyle = '#120a2a'; g.fillRect(0, 0, w, h); for (let i = 0; i < 20; i++) blob(g, r() * w, h * 0.2 + r() * h * 0.6, 20 + r() * 40, `rgba(${120 + r() * 120 | 0},${40 + r() * 60 | 0},${180 + r() * 70 | 0},0.18)`); for (let i = 0; i < 260; i++) blob(g, r() * w, r() * h, r() * 1.6 + 0.4, '#ffffff'); } },
  { id: 'ruby', name: 'Ruby', price: 750, trail: '#ff3a6a', mat: { roughness: 0.04, clearcoat: 1, opacity: 0.9 },
    paint(g, w, h) { const r = rnd(12); g.fillStyle = '#b0102e'; g.fillRect(0, 0, w, h); for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${200 + r() * 55 | 0},${r() * 60 | 0},${60 + r() * 40 | 0},0.5)`; g.beginPath(); const x = r() * w, y = r() * h; g.moveTo(x, y); g.lineTo(x + 30, y + r() * 20); g.lineTo(x + r() * 20, y + 34); g.fill(); } } },
  { id: 'gold', name: 'Gold', price: 800, trail: '#ffd84a', mat: { roughness: 0.18, metalness: 1, clearcoat: 0.6 },
    paint(g, w, h) { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#fff1a8'); gr.addColorStop(0.5, '#e8b13a'); gr.addColorStop(1, '#a8741a'); g.fillStyle = gr; g.fillRect(0, 0, w, h); } },
  { id: 'chrome', name: 'Chrome', price: 900, trail: '#e6f0ff', mat: { roughness: 0.05, metalness: 1, clearcoat: 1 },
    paint(g, w, h) { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, '#b8c2d0'); gr.addColorStop(0.55, '#5a6270'); gr.addColorStop(1, '#d8e0ea'); g.fillStyle = gr; g.fillRect(0, 0, w, h); } },
  { id: 'disco', name: 'Disco', price: 1000, trail: '#ffffff', mat: { roughness: 0.08, metalness: 1, clearcoat: 1 },
    paint(g, w, h) { const r = rnd(2); for (let x = 0; x < w; x += 16) for (let y = 0; y < h; y += 16) { const v = 170 + r() * 85 | 0; g.fillStyle = `rgb(${v},${v},${v + 10 > 255 ? 255 : v + 10})`; g.fillRect(x, y, 15, 15); } } },
];

export const RIVAL_SKINS = ['beach', 'soccer', 'basket', 'melon', 'moon', 'candy', 'tennis'];
export const skinById = (id) => SKINS.find((s) => s.id === id) || SKINS[0];

export function paintSkin(skin) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  skin.paint(c.getContext('2d'), 512, 256);
  return c;
}

// A shaded round swatch for the shop, cut from the middle of the texture.
export function drawSwatch(canvas, skin) {
  const g = canvas.getContext('2d'), s = canvas.width, src = paintSkin(skin);
  g.clearRect(0, 0, s, s);
  g.save();
  g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 2, 0, Math.PI * 2); g.clip();
  g.drawImage(src, 128, 0, 256, 256, 0, 0, s, s);
  const sh = g.createRadialGradient(s * 0.36, s * 0.32, s * 0.05, s / 2, s / 2, s / 2);
  sh.addColorStop(0, 'rgba(255,255,255,0.55)'); sh.addColorStop(0.35, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = sh; g.fillRect(0, 0, s, s);
  g.restore();
}
