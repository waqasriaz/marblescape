/* Marblescape — three.js view: sky, track, obstacles, scenery, balls, particles and the chase camera. */
import { mulberry32 } from './gen.js';
import { P } from './physics.js';
import { paintSkin, skinById, RIVAL_SKINS } from './skins.js';
import { trailById } from './cosmetics.js';

const THREE = window.THREE;
const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
const SUN = new THREE.Vector3(-0.42, 0.8, 0.42).normalize();
const fwdV = (yaw) => new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
const rightV = (yaw) => new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// Same answer for the same point, so shared vertices move together and a mesh doesn't crack.
const hash3 = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); };

function canvasTex(w, h, draw, o = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (o.repeat !== false) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (o.srgb !== false) t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 8;
  return t;
}
const R0 = mulberry32(99);
const dots = (g, n, w, h, rmin, rmax, colorFn) => {
  for (let i = 0; i < n; i++) { g.fillStyle = colorFn(); g.beginPath(); g.arc(R0() * w, R0() * h, rmin + R0() * (rmax - rmin), 0, Math.PI * 2); g.fill(); }
};

/* ---------------- shared textures ---------------- */
const TEX = {};
const POWER_COL = { magnet: '#ff4f6d', shield: '#2f9bff', x2: '#ffb21a' };
function sharedTextures() {
  if (TEX.ready) return;
  TEX.ready = true;
  TEX.stripes = canvasTex(64, 16, (g, w, h) => { for (let x = 0; x < w; x += 16) { g.fillStyle = (x / 16) % 2 ? '#ffffff' : '#ff3b4f'; g.fillRect(x, 0, 16, h); } });
  TEX.hazard = canvasTex(64, 64, (g) => {
    g.fillStyle = '#ffcc1a'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#1c1b24';
    for (let i = -64; i < 128; i += 24) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 12, 0); g.lineTo(i + 12 - 64, 64); g.lineTo(i - 64, 64); g.fill(); }
  });
  TEX.chevron = canvasTex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(6, 44); g.lineTo(32, 16); g.lineTo(58, 44); g.lineTo(46, 44); g.lineTo(32, 30); g.lineTo(18, 44); g.closePath(); g.fill();
  });
  TEX.pad = canvasTex(64, 64, (g, w, h) => {
    for (let y = 0; y < h; y += 16) { g.fillStyle = (y / 16) % 2 ? '#ffffff' : '#ff3b6b'; g.fillRect(0, y, w, 16); }
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.moveTo(20, 40); g.lineTo(32, 22); g.lineTo(44, 40); g.closePath(); g.fill();
  });
  TEX.crack = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#e2b36a'; g.fillRect(0, 0, w, h);
    dots(g, 300, w, h, 1, 3, () => `rgba(120,70,20,${0.1 + R0() * 0.2})`);
    g.strokeStyle = 'rgba(70,35,10,0.8)'; g.lineWidth = 2.5;
    for (let i = 0; i < 7; i++) { let x = R0() * w, y = R0() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (R0() - 0.5) * 50; y += (R0() - 0.5) * 50; g.lineTo(x, y); } g.stroke(); }
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
  });
  TEX.checker = canvasTex(512, 128, (g, w, h) => {
    for (let x = 0; x < w; x += 16) for (let y = 0; y < h; y += 16) { if (y >= 16 && y < h - 16) continue; g.fillStyle = ((x + y) / 16) % 2 ? '#111' : '#fff'; g.fillRect(x, y, 16, 16); }
    g.fillStyle = '#ff3b5c'; g.fillRect(0, 16, w, h - 32);
    g.font = '400 64px Bungee, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
    g.fillText('FINISH', w / 2, h / 2 + 3);
  }, { repeat: false });
  TEX.water = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#bdbdbd'; g.fillRect(0, 0, w, h); g.lineCap = 'round';
    for (let i = 0; i < 90; i++) {
      const x = R0() * w, y = R0() * h, l = 10 + R0() * 30;
      g.strokeStyle = `rgba(255,255,255,${0.3 + R0() * 0.5})`; g.lineWidth = 1.5 + R0() * 2;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 4, x + l, y); g.stroke();
    }
  });
  TEX.lava = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#ff6a10'; g.fillRect(0, 0, w, h);
    dots(g, 60, w, h, 8, 26, () => (R0() < 0.5 ? 'rgba(255,220,90,0.6)' : 'rgba(160,25,0,0.5)'));
    g.strokeStyle = 'rgba(50,8,0,0.8)'; g.lineWidth = 6;
    for (let i = 0; i < 24; i++) { const x = R0() * w, y = R0() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R0() - 0.5) * 70, y + (R0() - 0.5) * 70); g.stroke(); }
  });
  TEX.clouds = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#d6e2f8'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = R0() * w, y = R0() * h, r = 14 + R0() * 34, gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
  TEX.sand = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#e4e4e4'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 7) { g.strokeStyle = `rgba(0,0,0,${0.05 + R0() * 0.07})`; g.lineWidth = 2; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + y) * 3); g.stroke(); }
  });
  TEX.snow = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#f4f8ff'; g.fillRect(0, 0, w, h);
    dots(g, 400, w, h, 1, 4, () => `rgba(${R0() < 0.5 ? '200,215,235' : '255,255,255'},${0.3 + R0() * 0.4})`);
  });
  TEX.grid = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#07071a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,229,255,0.55)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
    g.strokeStyle = 'rgba(255,43,214,0.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
  });
  TEX.ice = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#e6f6ff'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 1.5;
    for (let i = 0; i < 14; i++) { let x = R0() * w, y = R0() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 3; k++) { x += (R0() - 0.5) * 50; y += (R0() - 0.5) * 50; g.lineTo(x, y); } g.stroke(); }
    dots(g, 60, w, h, 1, 3, () => 'rgba(160,210,255,0.35)');
  });
  TEX.belt = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#2a2d36'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffc61a';
    g.beginPath(); g.moveTo(10, 46); g.lineTo(32, 22); g.lineTo(54, 46); g.lineTo(44, 46); g.lineTo(32, 34); g.lineTo(20, 46); g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, 4, h); g.fillRect(w - 4, 0, 4, h);
  });
  TEX.flow = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#9fdcff'; g.fillRect(0, 0, w, h);
    g.lineCap = 'round';
    for (let i = 0; i < 40; i++) { const x = R0() * w, y = R0() * h, l = 10 + R0() * 26; g.strokeStyle = `rgba(255,255,255,${0.4 + R0() * 0.5})`; g.lineWidth = 1.5 + R0() * 2.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R0() - 0.5) * 6, y + l); g.stroke(); }
  });
  TEX.wood = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#8a5a32'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 4) { g.fillStyle = `rgba(${R0() < 0.5 ? '60,35,15' : '170,120,70'},0.35)`; g.fillRect(x, 0, 2, h); }
  });
  TEX.brick = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    dots(g, 120, w, h, 1, 3, () => `rgba(0,0,0,${0.05 + R0() * 0.1})`);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 6; g.strokeRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.strokeRect(5, 5, w - 10, h - 10);
  });
  TEX.soft = canvasTex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { repeat: false, srgb: false });
}

/* ---------------- particles: one Points cloud per blend mode ---------------- */
class Particles {
  constructor(scene, additive, max = 700) {
    this.max = max;
    this.n = 0;
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.c = new Float32Array(max * 3);
    this.a = new Float32Array(max);
    this.s = new Float32Array(max);
    this.life = new Float32Array(max);
    this.age = new Float32Array(max);
    this.grav = new Float32Array(max);
    const g = (this.geo = new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.c, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.a, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.s, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: TEX.soft }, scale: { value: 400 } },
      vertexShader: `attribute float alpha; attribute float size; varying float vA; varying vec3 vC;
        uniform float scale;
        void main(){ vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying float vA; varying vec3 vC;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC, t.a * vA); }`,
      vertexColors: true, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
    scene.add(this.points);
  }
  add(x, y, z, vx, vy, vz, color, size, life, grav = 0) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.p.set([x, y, z], i * 3); this.v.set([vx, vy, vz], i * 3); this.c.set([color.r, color.g, color.b], i * 3);
    this.s[i] = size; this.life[i] = life; this.age[i] = 0; this.grav[i] = grav; this.a[i] = 1;
  }
  burst(x, y, z, n, speed, color, size, life, grav = 0, up = 0) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * Math.PI * 0.5, s = speed * (0.4 + Math.random() * 0.6);
      this.add(x, y, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + up, Math.sin(a) * Math.cos(e) * s, color, size * (0.6 + Math.random() * 0.6), life * (0.6 + Math.random() * 0.6), grav);
    }
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        const j = --this.n;
        if (i !== j) {
          this.p.copyWithin(i * 3, j * 3, j * 3 + 3); this.v.copyWithin(i * 3, j * 3, j * 3 + 3); this.c.copyWithin(i * 3, j * 3, j * 3 + 3);
          this.s[i] = this.s[j]; this.life[i] = this.life[j]; this.age[i] = this.age[j]; this.grav[i] = this.grav[j];
        }
        i--;
        continue;
      }
      this.v[i * 3 + 1] -= this.grav[i] * dt;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      const k = this.age[i] / this.life[i];
      this.a[i] = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
    }
    this.geo.setDrawRange(0, this.n);
    for (const name of ['position', 'color', 'alpha', 'size']) this.geo.attributes[name].needsUpdate = true;
  }
  clear() { this.n = 0; }
}

/* ---------------- low-poly scenery batches ---------------- */
class Batch {
  constructor() { this.P = []; this.N = []; this.C = []; }
  add(geo, m, color) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pos = g.attributes.position, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i).applyMatrix4(m);
      b.fromBufferAttribute(pos, i + 1).applyMatrix4(m);
      c.fromBufferAttribute(pos, i + 2).applyMatrix4(m);
      n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a)).normalize();
      for (const p of [a, b, c]) {
        const col = typeof color === 'function' ? color(p, n) : color;
        this.P.push(p.x, p.y, p.z); this.N.push(n.x, n.y, n.z); this.C.push(col.r, col.g, col.b);
      }
    }
    if (g !== geo) g.dispose();
  }
  mesh(mat) {
    if (!this.P.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    return new THREE.Mesh(g, mat);
  }
}
const mtx = (x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
const PG = {};
function primitives() {
  if (PG.trunk) return;
  PG.trunk = new THREE.CylinderGeometry(0.07, 0.1, 1, 6).translate(0, 0.5, 0);
  PG.blob = new THREE.IcosahedronGeometry(0.5, 0);
  PG.cone = new THREE.ConeGeometry(0.5, 1, 7).translate(0, 0.5, 0);
  PG.rock = new THREE.DodecahedronGeometry(0.5, 0);
  PG.cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 8).translate(0, 0.5, 0);
  PG.frond = new THREE.ConeGeometry(0.11, 1, 4).rotateZ(-Math.PI / 2).translate(0.5, 0, 0);
  PG.puff = new THREE.IcosahedronGeometry(1, 1);
  PG.box = new THREE.BoxGeometry(1, 1, 1);
}
function prop(batch, kind, x, y, z, s, r) {
  const col = (hex, j = 0.06) => lin(hex).offsetHSL(0, 0, (r() - 0.5) * j);
  const ry = r() * Math.PI * 2;
  switch (kind) {
    case 'round': {
      const h = 0.7 * s, leaf = col(r() < 0.5 ? '#4caf50' : '#5dbb4a', 0.1);
      batch.add(PG.trunk, mtx(x, y, z, s, h, s, ry), col('#7a5233'));
      batch.add(PG.blob, mtx(x, y + h + 0.3 * s, z, s, 0.9 * s, s, ry), leaf);
      batch.add(PG.blob, mtx(x + 0.18 * s, y + h + 0.62 * s, z - 0.1 * s, 0.65 * s, 0.6 * s, 0.65 * s, ry), leaf.clone().offsetHSL(0, 0, 0.05));
      break;
    }
    case 'pine': {
      const g = col('#2f7d4a', 0.08);
      batch.add(PG.trunk, mtx(x, y, z, s, 0.45 * s, s, ry), col('#6b4a2e'));
      batch.add(PG.cone, mtx(x, y + 0.3 * s, z, 1.3 * s, 0.9 * s, 1.3 * s, ry), g);
      batch.add(PG.cone, mtx(x, y + 0.8 * s, z, s, 0.8 * s, s, ry + 0.4), g.clone().offsetHSL(0, 0, 0.04));
      batch.add(PG.cone, mtx(x, y + 1.25 * s, z, 0.7 * s, 0.75 * s, 0.7 * s, ry + 0.8), g.clone().offsetHSL(0, 0, 0.08));
      break;
    }
    case 'snowpine': {
      const g = col('#2d6b4f', 0.06), snow = lin('#ffffff');
      batch.add(PG.trunk, mtx(x, y, z, s, 0.45 * s, s, ry), col('#5b4330'));
      [[0.3, 1.3, 0.9], [0.8, 1.0, 0.8], [1.25, 0.7, 0.75]].forEach(([h, rr, hh], i) => {
        batch.add(PG.cone, mtx(x, y + h * s, z, rr * s, hh * s, rr * s, ry + i * 0.4), g.clone().offsetHSL(0, 0, i * 0.04));
        batch.add(PG.cone, mtx(x, y + (h + hh * 0.55) * s, z, rr * 0.62 * s, hh * 0.45 * s, rr * 0.62 * s, ry + i * 0.4), snow);
      });
      break;
    }
    case 'lighthouse': {
      for (let i = 0; i < 6; i++) batch.add(PG.cyl, mtx(x, y + i * 1.6 * s, z, (1.6 - i * 0.12) * s, 1.6 * s, (1.6 - i * 0.12) * s), lin(i % 2 ? '#ffffff' : '#e8323f'));
      batch.add(PG.cyl, mtx(x, y + 9.6 * s, z, 1.3 * s, 1.2 * s, 1.3 * s), lin('#fff3a8'));
      batch.add(PG.cone, mtx(x, y + 10.8 * s, z, 1.6 * s, 1.3 * s, 1.6 * s), lin('#2a2d36'));
      break;
    }
    case 'boat': {
      batch.add(PG.blob, mtx(x, y + 0.3 * s, z, 1.2 * s, 0.6 * s, 3.2 * s, ry), lin(r() < 0.5 ? '#ffffff' : '#e8323f'));
      batch.add(PG.cyl, mtx(x, y + 0.5 * s, z, 0.12 * s, 4.2 * s, 0.12 * s, ry), lin('#6b4a2e'));
      batch.add(PG.cone, mtx(x + Math.cos(ry) * 0.2 * s, y + 0.9 * s, z - Math.sin(ry) * 0.2 * s, 0.15 * s, 3.4 * s, 1.6 * s, ry), lin('#fdfdfd'));
      break;
    }
    case 'palm': {
      const lean = (r() - 0.5) * 0.5, tc = col('#b08850'), lc = col('#3fae4a', 0.08);
      let px = x, py = y;
      for (let i = 0; i < 4; i++) { batch.add(PG.trunk, mtx(px, py, z, 1.1 * s, 0.5 * s, 1.1 * s, ry, 0, lean), tc); px += Math.sin(-lean) * 0.5 * s; py += Math.cos(lean) * 0.5 * s; }
      for (let i = 0; i < 6; i++) batch.add(PG.frond, mtx(px, py, z, 0.9 * s, s, 1.6 * s, ry + (i * Math.PI) / 3, 0, -0.45), lc);
      break;
    }
    case 'cactus': {
      const g = col('#4f9a4a');
      batch.add(PG.cyl, mtx(x, y, z, 0.28 * s, 1.1 * s, 0.28 * s, ry), g);
      batch.add(PG.cyl, mtx(x + 0.22 * s, y + 0.45 * s, z, 0.16 * s, 0.4 * s, 0.16 * s, ry), g);
      batch.add(PG.cyl, mtx(x - 0.2 * s, y + 0.3 * s, z + 0.05, 0.15 * s, 0.35 * s, 0.15 * s, ry), g);
      break;
    }
    case 'rock': batch.add(PG.rock, mtx(x, y + 0.12 * s, z, 0.7 * s, 0.5 * s, 0.6 * s, ry, r(), 0), col(r() < 0.5 ? '#8a8a92' : '#77737c', 0.1)); break;
    case 'bush': batch.add(PG.blob, mtx(x, y + 0.18 * s, z, 0.7 * s, 0.5 * s, 0.7 * s, ry), col('#3d8f3f', 0.1)); break;
    case 'flower': {
      batch.add(PG.blob, mtx(x, y + 0.1 * s, z, 0.45 * s, 0.3 * s, 0.45 * s, ry), col('#4a9f45'));
      const fc = lin(['#ff6fa3', '#ffe14a', '#ffffff', '#b98cff'][Math.floor(r() * 4)]);
      for (let i = 0; i < 3; i++) batch.add(PG.blob, mtx(x + (r() - 0.5) * 0.3 * s, y + 0.25 * s, z + (r() - 0.5) * 0.3 * s, 0.1 * s, 0.1 * s, 0.1 * s), fc);
      break;
    }
    case 'dead': {
      const dc = col('#2a2224');
      batch.add(PG.trunk, mtx(x, y, z, 0.9 * s, 1.3 * s, 0.9 * s, ry), dc);
      batch.add(PG.trunk, mtx(x, y + 0.7 * s, z, 0.5 * s, 0.6 * s, 0.5 * s, ry, 0, 0.9), dc);
      batch.add(PG.trunk, mtx(x, y + 0.9 * s, z, 0.4 * s, 0.5 * s, 0.4 * s, ry + 2, 0, -0.8), dc);
      break;
    }
    default: break;
  }
}

/* ---------------- the view ---------------- */
export class View {
  constructor(canvas) {
    sharedTextures();
    primitives();
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.92;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1500);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 0.28);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.7);
    const sc = this.sun.shadow;
    sc.camera.left = -14; sc.camera.right = 14; sc.camera.top = 14; sc.camera.bottom = -14; sc.camera.near = 1; sc.camera.far = 120;
    sc.bias = -0.0004; sc.normalBias = 0.03;
    this.sun.castShadow = true;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.fx = new Particles(this.scene, true);
    this.dust = new Particles(this.scene, false, 400);
    this.cam = { pos: new THREE.Vector3(0, 10, -10), yaw: 0, fov: 60, introT: 0, shake: 0, freezeY: null, loopK: 0, bossK: 0 };
    this.trail = 'skin';
    this.trailCols = [];
    this.timers = [];
    this.clock = 0;
    this.tc = new THREE.Color();
    this.bossEuler = new THREE.Euler();
    this.tmpA = new THREE.Vector3();
    this.tmpB = new THREE.Vector3();
    this.snowColor = new THREE.Color(1, 1, 1);
    this.gemColor = lin('#d6a8ff');
    this.goldColor = lin('#ffd23f');
    this.iconCache = {};
    this.emberColor = lin('#ff8a2a');
    this.group = null;
    this.owned = [];
    this.quality = 'high';
    this.setQuality('high');
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setQuality(q) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(Math.min(dpr, q === 'high' ? 2 : q === 'medium' ? 1.75 : 1.5));
    this.renderer.shadowMap.enabled = q !== 'low';
    this.sun.castShadow = q !== 'low';
    const size = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.portrait = w < h;
    this.camera.updateProjectionMatrix();
    for (const p of [this.fx, this.dust]) p.mat.uniforms.scale.value = h * this.renderer.getPixelRatio() * 0.5;
  }

  own(o) { this.owned.push(o); return o; }

  geo(m) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3));
    if (m.uv && m.uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(m.uv, 2));
    g.setIndex(m.idx);
    g.computeVertexNormals();
    return this.own(g);
  }

  // A flat quad lying on the track: frame f, from `a0` to `a1` metres along, full width.
  quadOn(f, len, w, lift = 0.02, vRepeat = 1) {
    const F = fwdV(f.yaw), Rt = rightV(f.yaw), c = new THREE.Vector3(f.x, f.y + lift, f.z);
    const p = (u, a) => c.clone().addScaledVector(Rt, u).addScaledVector(F, a);
    const pts = [p(-w / 2, 0), p(w / 2, 0), p(-w / 2, len), p(w / 2, len)];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((v) => [v.x, v.y, v.z]), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, len * vRepeat, 1, len * vRepeat], 2));
    g.setIndex([0, 1, 2, 1, 3, 2]);   // wound to face up
    g.computeVertexNormals();
    return this.own(g);
  }

  load(L, sim, skinId) {
    if (this.group) this.scene.remove(this.group);
    for (const o of this.owned) o.dispose();
    this.owned = [];
    this.fx.clear();
    this.dust.clear();
    const th = (this.theme = L.world);
    const g = (this.group = new THREE.Group());
    this.scene.add(g);
    this.L = L;
    this.sim = sim;
    this.groundY = L.bounds.minY - (th.drop || 45);
    this.buildSky(th);
    this.hemi.color.copy(lin(th.skyHorizon));
    this.hemi.groundColor.copy(lin(th.groundColor)).multiplyScalar(0.6);
    this.sun.color.copy(lin(th.sun));
    this.hemi.intensity = th.night ? 0.6 : 0.28;
    // At night the sky is nearly black, so give the shadowed sides a cool fill instead of the sky colour.
    if (th.night) { this.hemi.color.copy(lin('#9aa2ee')); this.hemi.groundColor.copy(lin('#3a2c5c')); }
    this.sun.intensity = th.night ? 1.0 : 1.7;
    this.scene.fog = new THREE.Fog(lin(th.fog), 90, 430);

    /* track */
    const topTex = this.own(canvasTex(512, 512, (c, w, h) => {
      c.fillStyle = th.top[0]; c.fillRect(0, 0, w, h / 2);
      c.fillStyle = th.top[1]; c.fillRect(0, h / 2, w, h / 2);
      const sh = c.createLinearGradient(0, 0, w, 0);
      sh.addColorStop(0, 'rgba(0,0,0,0.10)'); sh.addColorStop(0.18, 'rgba(0,0,0,0)'); sh.addColorStop(0.82, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.10)');
      c.fillStyle = sh; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(0, h / 2 - 2, w, 4); c.fillRect(0, 0, w, 2); c.fillRect(0, h - 2, w, 2);
      c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(0, h / 2 + 2, w, 3); c.fillRect(0, 2, w, 3);
      c.fillStyle = th.edge; c.fillRect(0, 0, 22, h); c.fillRect(w - 22, 0, 22, h);
      c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(22, 0, 3, h); c.fillRect(w - 25, 0, 3, h);
    }));
    topTex.wrapS = THREE.ClampToEdgeWrapping;
    const sideTex = this.own(canvasTex(16, 64, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, th.side); gr.addColorStop(1, '#000000');
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.globalCompositeOperation = 'source-over';
      c.fillStyle = th.edge; c.fillRect(0, 0, w, 6);
    }));
    const topMat = this.own(new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.38, metalness: 0, envMapIntensity: 0.45 }));
    if (th.neon) {
      // Night worlds: the track edges glow.
      const glow = this.own(canvasTex(512, 8, (c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.fillStyle = th.edge; c.fillRect(0, 0, 22, h); c.fillRect(w - 22, 0, 22, h); }));
      glow.wrapS = THREE.ClampToEdgeWrapping;
      topMat.emissiveMap = glow;
      topMat.emissive = new THREE.Color(1, 1, 1);
      topMat.emissiveIntensity = 1.4;
    }
    const sideMat = this.own(new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.75, metalness: 0, color: 0xffffff, envMapIntensity: 0.4 }));
    sideTex.repeat.set(1, 1.3);
    const railMat = this.own(new THREE.MeshStandardMaterial({ color: lin(th.rail), roughness: 0.3, metalness: 0.1, emissive: th.neon ? lin(th.rail) : new THREE.Color(0), emissiveIntensity: th.neon ? 0.7 : 0 }));
    const glassMat = this.own(new THREE.MeshStandardMaterial({
      map: topTex, color: 0xffffff, transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide,
    }));
    const glassSide = this.own(new THREE.MeshStandardMaterial({ color: lin(th.edge), transparent: true, opacity: 0.5, roughness: 0.2, depthWrite: false }));
    for (const st of L.strips) {
      for (const part of st.parts) {
        const top = new THREE.Mesh(this.geo(part.top), part.glass ? glassMat : topMat);
        const sides = new THREE.Mesh(this.geo(part.sides), part.glass ? glassSide : sideMat);
        if (part.glass) { top.renderOrder = sides.renderOrder = 3; } else top.receiveShadow = sides.receiveShadow = true;
        g.add(top, sides);
      }
    }
    // Glass tubes, with ribs every few metres.
    if (L.tubes && L.tubes.length) {
      const tubeMat = this.own(new THREE.MeshStandardMaterial({ color: lin('#cdeeff'), transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0.3, depthWrite: false, side: THREE.DoubleSide }));
      for (const tb of L.tubes) { const m = new THREE.Mesh(this.geo(tb), tubeMat); m.renderOrder = 3; g.add(m); }
      const ribs = new Batch(), rc = lin(th.rail);
      L.samples.forEach((f, i) => {
        if (!f.tube || f.gap || i % 6) return;
        const hw = f.w / 2, h = f.pipe * 2.4;
        const ring = new THREE.TorusGeometry(hw, 0.09, 6, 18, Math.PI);
        ribs.add(ring, mtx(f.x, f.y + h, f.z, 1, 0.95, 1, f.yaw + Math.PI), rc);
        ring.dispose();
      });
      const rm = ribs.mesh(this.own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, emissive: th.neon ? rc : new THREE.Color(0), emissiveIntensity: th.neon ? 0.7 : 0 })));
      if (rm) { this.own(rm.geometry); rm.castShadow = true; g.add(rm); }
    }
    for (const rl of L.rails) {
      const m = new THREE.Mesh(this.geo(rl), railMat);
      m.receiveShadow = true;
      g.add(m);
    }

    /* ice, conveyor belts and water, laid over the track */
    this.overlays = [];
    for (const ov of L.overlays || []) {
      const tex = { ice: TEX.ice, belt: TEX.belt, water: TEX.flow }[ov.type].clone();
      tex.needsUpdate = true;
      if (ov.type === 'belt') { tex.repeat.set(1, 1); if (ov.v < 0) { tex.center.set(0.5, 0.5); tex.rotation = Math.PI; } }
      this.own(tex);
      const mat = ov.type === 'ice'
        ? new THREE.MeshStandardMaterial({ map: tex, color: lin('#ffffff'), transparent: true, opacity: 0.8, roughness: 0.05, metalness: 0.2, depthWrite: false })
        : ov.type === 'belt' ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 })
          : new THREE.MeshStandardMaterial({ map: tex, color: lin('#1690ff'), transparent: true, opacity: 0.9, roughness: 0.08, metalness: 0.25, emissive: lin('#0a56b8'), emissiveIntensity: 0.55, depthWrite: false });
      this.own(mat);
      const m = new THREE.Mesh(this.geo(ov.geom), mat);
      m.renderOrder = 2;
      m.receiveShadow = ov.type === 'belt';
      g.add(m);
      this.overlays.push({ tex, v: ov.type === 'ice' ? 0 : Math.abs(ov.v) });
    }

    /* zones: boost strips, jump pads, checkpoints, finish */
    this.boostMat = this.own(new THREE.MeshBasicMaterial({ map: TEX.chevron, color: lin('#ffd02a'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const padMat = this.own(new THREE.MeshStandardMaterial({ map: TEX.pad, roughness: 0.3, emissive: lin('#ff2a5a'), emissiveIntensity: 0.25 }));
    this.checkFlags = [];
    for (const z of L.zones) {
      if (z.type === 'boost') { const m = new THREE.Mesh(this.quadOn(z, z.len, z.w - 0.3, 0.025, 1), this.boostMat); m.renderOrder = 2; g.add(m); }
      else if (z.type === 'pad') { const m = new THREE.Mesh(this.quadOn(z, z.len, z.w - 0.3, 0.03, 0.6), padMat); m.receiveShadow = true; g.add(m); }
      else if (z.type === 'checkpoint') this.checkFlags.push(this.arch(z, 6.0, th.edge, false));
      else if (z.type === 'finish') this.arch(z, 6.8, '#ffffff', true);
      else if (z.type === 'speed') {
        // A narrow chevron strip just off the middle of the bonus run.
        const Rt = rightV(z.yaw), c = Object.assign({}, z, { x: z.x + Rt.x * z.u, z: z.z + Rt.z * z.u });
        if (!this.speedMat) {
          this.speedBase = this.own(new THREE.MeshBasicMaterial({ color: lin('#10305a'), transparent: true, opacity: 0.85, depthWrite: false }));
          this.speedMat = this.own(new THREE.MeshBasicMaterial({ map: TEX.chevron, color: lin('#5af0ff'), transparent: true, depthWrite: false }));
        }
        const base = new THREE.Mesh(this.quadOn(c, z.len + 0.2, z.hw * 2 + 0.2, 0.025, 1), this.speedBase);
        const m = new THREE.Mesh(this.quadOn(c, z.len, z.hw * 2, 0.035, 1), this.speedMat);
        base.renderOrder = 2;
        m.renderOrder = 3;
        g.add(base, m);
      }
    }
    this.speedMat = null;
    // Bonus landing bands: x1 to x5, each painted on the landing pad.
    if (L.bonus) {
      const B = L.bonus, S = L.samples, cols = ['#5a6a8a', '#2fbf71', '#ffc61a', '#ff8a1a', '#ff3b7a'];
      const starts = [B.land - B.lip, ...B.edges], ends = [...B.edges, B.end - B.lip - 1.5];
      for (let k = 0; k < 5; k++) {
        const s0 = B.lip + starts[k], len = Math.max(0.5, ends[k] - starts[k]);
        const f = S.find((q) => q.s >= s0 && !q.gap);
        if (!f) continue;
        const tex = this.own(canvasTex(256, 256, (c, w, h) => {
          c.fillStyle = cols[k]; c.fillRect(0, 0, w, h);
          c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(0, 0, w, 10); c.fillRect(0, h - 10, w, 10);
          c.fillStyle = '#ffffff'; c.font = '400 120px Bungee, Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(`x${k + 1}`, w / 2, h / 2 + 6);
        }, { repeat: false }));
        const m = new THREE.Mesh(this.quadOn(f, len, f.w - 0.4, 0.03, 1 / len), this.own(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: lin(cols[k]), emissiveIntensity: th.night ? 0.5 : 0.15 })));
        m.receiveShadow = true;
        g.add(m);
      }
    }

    /* obstacles */
    this.obsViews = sim.obs.map((o) => this.obstacleView(o, th));
    this.tileViews = sim.tiles.map((tl) => {
      const m = new THREE.Mesh(this.own(new THREE.BoxGeometry(tl.t.hw * 2, 0.5, tl.t.hl * 2)), this.own(new THREE.MeshStandardMaterial({ map: TEX.crack, roughness: 0.8 })));
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      return m;
    });
    this.boulderMeshes = new Map();
    this.rockMat = this.own(new THREE.MeshStandardMaterial({ color: lin('#8b7d70'), roughness: 0.95, flatShading: true }));
    this.boulderGeo = this.own(new THREE.IcosahedronGeometry(0.85, 1));
    this.shotGeo = this.own(new THREE.SphereGeometry(0.42, 20, 14));
    this.shotMat = this.own(new THREE.MeshStandardMaterial({ color: lin('#1c1e24'), metalness: 0.8, roughness: 0.3 }));
    this.windColor = new THREE.Color(1, 1, 1);
    this.logGeo = this.own(new THREE.CylinderGeometry(1, 1, 1, 16));
    this.logMat = this.own(new THREE.MeshStandardMaterial({ map: TEX.wood, roughness: 0.85 }));

    /* coins */
    const coinGeo = this.own(new THREE.CylinderGeometry(0.38, 0.38, 0.1, 24).rotateX(Math.PI / 2));
    const coinMat = this.own(new THREE.MeshStandardMaterial({ color: lin('#ffc93a'), metalness: 0.7, roughness: 0.28, emissive: lin('#ff9d00'), emissiveIntensity: th.night ? 0.9 : 0.35 }));
    this.coinIdx = [];
    this.gemIdx = [];
    sim.coins.forEach((c, i) => (c.gem ? this.gemIdx : this.coinIdx).push(i));
    this.coins = new THREE.InstancedMesh(coinGeo, coinMat, Math.max(1, this.coinIdx.length));
    this.coins.count = this.coinIdx.length;
    this.coins.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.coins.frustumCulled = false;
    g.add(this.coins);
    // Gems: rarer, worth five coins, a purple glow you can spot from afar.
    const gemMat = this.own(new THREE.MeshStandardMaterial({ color: lin('#b45cff'), metalness: 0.3, roughness: 0.12, emissive: lin('#7a2cff'), emissiveIntensity: th.night ? 1.0 : 0.55, flatShading: true }));
    this.gems = new THREE.InstancedMesh(this.own(new THREE.OctahedronGeometry(0.46, 0).scale(0.8, 1.15, 0.8)), gemMat, Math.max(1, this.gemIdx.length));
    this.gems.count = this.gemIdx.length;
    this.gems.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.gems.frustumCulled = false;
    g.add(this.gems);
    this.dummy = new THREE.Object3D();
    // Power-ups: a coloured bubble with an icon that always faces you.
    this.powerViews = sim.powerups.map((q) => {
      const grp = new THREE.Group(), col = POWER_COL[q.kind];
      grp.add(new THREE.Mesh(this.bubbleGeo || (this.bubbleGeo = this.own(new THREE.SphereGeometry(0.62, 24, 16))), this.own(new THREE.MeshStandardMaterial({ color: lin(col), transparent: true, opacity: 0.38, roughness: 0.05, metalness: 0.2, emissive: lin(col), emissiveIntensity: 0.4, depthWrite: false }))));
      const sp = new THREE.Sprite(this.own(new THREE.SpriteMaterial({ map: this.powerIcon(q.kind), depthWrite: false })));
      sp.scale.set(0.95, 0.95, 1);
      grp.add(sp);
      grp.position.set(q.x, q.y, q.z);
      g.add(grp);
      return grp;
    });
    this.bubbleGeo = null;
    // While a power-up is on: a bubble round the ball for the shield, a spinning ring for the magnet.
    this.shieldMesh = new THREE.Mesh(this.own(new THREE.SphereGeometry(P.R * 1.5, 24, 16)), this.own(new THREE.MeshBasicMaterial({ color: lin('#5ad1ff'), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })));
    this.magnetRing = new THREE.Mesh(this.own(new THREE.TorusGeometry(P.R * 1.7, 0.05, 6, 32).rotateX(Math.PI / 2)), this.own(new THREE.MeshBasicMaterial({ color: lin('#ff4f6d'), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })));
    this.shieldMesh.visible = this.magnetRing.visible = false;
    g.add(this.shieldMesh, this.magnetRing);

    /* balls */
    this.ballGeo = this.own(new THREE.SphereGeometry(P.R, 64, 40));
    const blobGeo = this.own(new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2));
    const blobMat = this.own(new THREE.MeshBasicMaterial({ map: TEX.soft, color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
    const pick = mulberry32(L.n * 13 + 5);
    this.ballMeshes = sim.balls.map((b, i) => {
      const skin = i === 0 ? skinById(skinId) : skinById(RIVAL_SKINS[Math.floor(pick() * RIVAL_SKINS.length)]);
      const m = new THREE.Mesh(this.ballGeo, this.skinMaterial(skin));
      m.castShadow = true;
      m.userData.trail = lin(skin.trail);
      const blob = new THREE.Mesh(blobGeo, blobMat);
      blob.renderOrder = 1;
      m.userData.blob = blob;
      g.add(m, blob);
      return m;
    });

    /* the boss: a giant ball that rolls after you in the chase */
    this.bossMesh = null;
    this.timers = [];
    this.cam.bossK = 0;
    if (L.chase) {
      const kind = th.boss.kind, rocky = kind === 'boulder' || kind === 'sandstone';
      let geo;
      if (rocky) {
        geo = new THREE.IcosahedronGeometry(P.BOSS_R, 2);
        const pa = geo.attributes.position, v = new THREE.Vector3();
        for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i); v.multiplyScalar(0.9 + 0.18 * hash3(v.x, v.y, v.z)); pa.setXYZ(i, v.x, v.y, v.z); }
        geo.computeVertexNormals();
      } else geo = new THREE.SphereGeometry(P.BOSS_R, 48, 32);
      this.bossMesh = new THREE.Mesh(this.own(geo), this.bossMaterial(kind));
      this.bossMesh.castShadow = true;
      this.bossMesh.visible = false;
      this.bossMesh.renderOrder = 3;
      g.add(this.bossMesh);
      this.bossDust = lin({ boulder: '#9a9a90', sandstone: '#e0a060', beach: '#f4e2b8', snow: '#ffffff', storm: '#8a86a8', disco: '#ff8ad8', magma: '#ff7a2a', moon: '#c8cad6' }[kind] || '#ffffff');
    }

    this.buildScenery(L, th);
    for (const [geo, mat] of [[this.boulderGeo, this.rockMat], [this.shotGeo, this.shotMat]]) {
      const warm = new THREE.Mesh(geo, mat);
      warm.position.set(0, this.groundY - 50, 0);
      g.add(warm);
    }
    this.renderer.compile(this.scene, this.camera);
    this.cam.yaw = L.start.yaw;
    this.cam.introT = 0;
    this.cam.freezeY = null;
    const p = sim.player.body.translation();
    this.cam.pos.set(p.x, p.y + 22, p.z - 6);
  }

  // A see-through replay of your best run on this level.
  setGhost(g) {
    this.ghostData = g;
    if (this.ghostMesh) { this.group.remove(this.ghostMesh); this.ghostMesh = null; }
    if (!g) return;
    const mat = this.own(new THREE.MeshStandardMaterial({ color: lin('#cfe8ff'), emissive: lin('#6fb8ff'), emissiveIntensity: 0.6, transparent: true, opacity: 0.4, depthWrite: false, roughness: 0.2 }));
    this.ghostMesh = new THREE.Mesh(this.ballGeo, mat);
    this.ghostMesh.renderOrder = 4;
    this.group.add(this.ghostMesh);
  }

  setSkin(id) {
    const m = this.ballMeshes && this.ballMeshes[0];
    if (!m) return;
    const skin = skinById(id);
    m.material = this.skinMaterial(skin);
    m.userData.trail = lin(skin.trail);
  }

  // A rival's trail colour as sRGB hex, for its dot on the progress bar.
  ballColor(i) { return this.ballMeshes[i].userData.trail.clone().convertLinearToSRGB().getHexString(); }

  skinMaterial(skin) {
    const tex = this.own(new THREE.CanvasTexture(paintSkin(skin)));
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 8;
    const m = skin.mat;
    const mat = new THREE.MeshPhysicalMaterial({
      map: tex, roughness: m.roughness ?? 0.3, metalness: m.metalness ?? 0, clearcoat: m.clearcoat ?? 0.5, clearcoatRoughness: 0.08,
      transparent: m.opacity != null, opacity: m.opacity ?? 1,
    });
    if (m.emissive) { mat.emissiveMap = tex; mat.emissive = new THREE.Color(1, 1, 1); mat.emissiveIntensity = m.emissive; }
    return this.own(mat);
  }

  // Each world's boss has its own look.
  bossMaterial(kind) {
    const skinTex = (id) => { const t = this.own(new THREE.CanvasTexture(paintSkin(skinById(id)))); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; return t; };
    const paint = (draw) => this.own(canvasTex(512, 256, draw, { repeat: false }));
    const mat = (o) => this.own(new THREE.MeshStandardMaterial(Object.assign({ transparent: true, roughness: 0.9 }, o)));
    const white = new THREE.Color(1, 1, 1);
    switch (kind) {
      case 'beach': return mat({ map: skinTex('beach'), roughness: 0.35 });
      case 'moon': return mat({ map: skinTex('moon') });
      case 'magma': { const map = skinTex('lava'); return mat({ map, emissiveMap: map, emissive: white, emissiveIntensity: 1.5, roughness: 0.7 }); }
      case 'disco': {
        const glow = paint((c, w, h) => {
          c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
          for (let x = 0; x < w; x += 16) for (let y = 0; y < h; y += 16) if (R0() < 0.3) { c.fillStyle = ['#00e5ff', '#ff2bd6', '#ffd23f', '#7c5cff'][Math.floor(R0() * 4)]; c.fillRect(x, y, 15, 15); }
        });
        return mat({ map: skinTex('disco'), metalness: 0.85, roughness: 0.15, emissiveMap: glow, emissive: white, emissiveIntensity: 1.3 });
      }
      case 'snow': return mat({ map: paint((c, w, h) => { c.fillStyle = '#f4f8ff'; c.fillRect(0, 0, w, h); dots(c, 260, w, h, 4, 18, () => `rgba(${R0() < 0.5 ? '196,216,242' : '255,255,255'},0.55)`); }) });
      case 'storm': {
        const map = paint((c, w, h) => { c.fillStyle = '#3d3a58'; c.fillRect(0, 0, w, h); dots(c, 120, w, h, 10, 40, () => `rgba(${R0() < 0.5 ? '90,86,120' : '30,28,46'},0.5)`); });
        const glow = paint((c, w, h) => {
          c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.lineWidth = 4;
          for (let i = 0; i < 9; i++) { let x = R0() * w, y = h * 0.15 + R0() * h * 0.2; c.strokeStyle = R0() < 0.5 ? '#fff27a' : '#8af4ff'; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (R0() - 0.5) * 50; y += 18 + R0() * 14; c.lineTo(x, y); } c.stroke(); }
        });
        return mat({ map, emissiveMap: glow, emissive: white, emissiveIntensity: 1.6, roughness: 0.8 });
      }
      case 'sandstone': return mat({ flatShading: true, map: paint((c, w, h) => { for (let y = 0; y < h; y += 8) { c.fillStyle = ['#d98a52', '#c7703e', '#e8a46a', '#b45a32'][Math.floor(R0() * 4)]; c.fillRect(0, y, w, 8); } dots(c, 200, w, h, 1, 4, () => 'rgba(60,30,10,0.25)'); }) });
      default: return mat({ flatShading: true, map: paint((c, w, h) => { c.fillStyle = '#8d8b86'; c.fillRect(0, 0, w, h); dots(c, 300, w, h, 2, 10, () => `rgba(${R0() < 0.5 ? '60,60,58' : '170,168,160'},0.35)`); dots(c, 60, w, h, 10, 30, () => 'rgba(74,140,58,0.55)'); }) });
    }
  }

  // The centre line at distance s along the track (interpolated).
  sampleAt(s) {
    const S = this.L.samples;
    let lo = 0, hi = S.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (S[m].s < s) lo = m + 1; else hi = m; }
    const b = S[lo], a = S[Math.max(0, lo - 1)], k = b.s > a.s ? clamp((s - a.s) / (b.s - a.s), 0, 1) : 0, o = this.tmpS || (this.tmpS = {});
    o.x = a.x + (b.x - a.x) * k; o.y = a.y + (b.y - a.y) * k; o.z = a.z + (b.z - a.z) * k;
    o.yaw = a.yaw + wrapAngle(b.yaw - a.yaw) * k;
    o.nx = b.nx || 0; o.ny = b.ny ?? 1; o.nz = b.nz || 0;
    return o;
  }

  updateBoss(dt, sim) {
    const B = sim.boss, m = this.bossMesh, show = B.on && !B.down;
    m.visible = show;
    if (!show) return;
    // It rolls up from behind the camera.
    const f = this.sampleAt(B.s), R = P.BOSS_R;
    m.position.set(f.x + f.nx * R, f.y + f.ny * R, f.z + f.nz * R);
    m.quaternion.setFromEuler(this.bossEuler.set(B.roll, f.yaw, 0, 'YXZ'));
    // Dust sprays out to the sides where it touches the track (not back into the camera).
    if (B.v > 1 && Math.random() < 0.7) {
      const Rt = rightV(f.yaw), F = fwdV(f.yaw), sd = Math.random() < 0.5 ? -1 : 1, u = sd * R * 0.7;
      this.dust.add(f.x + Rt.x * u + F.x * R * 0.3, f.y + 0.2, f.z + Rt.z * u + F.z * R * 0.3, Rt.x * sd * 2.5, 1 + Math.random(), Rt.z * sd * 2.5, this.bossDust, 0.55, 0.7);
      if (this.theme.boss.kind === 'magma' && Math.random() < 0.4) this.fx.add(m.position.x + F.x * R * 0.5, m.position.y + R * 0.8, m.position.z + F.z * R * 0.5, F.x * 2 + (Math.random() - 0.5) * 2, 2 + Math.random() * 2, F.z * 2 + (Math.random() - 0.5) * 2, this.emberColor, 0.25, 0.8, 4);
    }
    // Rumbles the camera as it closes in; turns see-through rather than hide your ball.
    const gap = sim.player.s - B.s;
    if (gap < 6) this.cam.shake = Math.max(this.cam.shake, (6 - gap) * 0.03);
    m.material.opacity = 1 - 0.55 * clamp((5 - gap) / 2.5, 0, 1);
    m.material.depthWrite = m.material.opacity > 0.99;
  }
  bossDownFx() {
    const m = this.bossMesh;
    if (!m) return;
    const p = m.position;
    this.fx.burst(p.x, p.y, p.z, 90, 9, this.bossDust, 0.8, 1.2, 6, 2);
    this.dust.burst(p.x, p.y, p.z, 60, 7, this.bossDust, 1.0, 1.4, 6, 2);
    this.fx.burst(p.x, p.y, p.z, 40, 12, lin('#ffffff'), 0.5, 0.6, 0, 1);
  }
  squashFx(p) {
    this.dust.burst(p.x, p.y, p.z, 30, 5, this.bossDust || lin('#ffffff'), 0.8, 0.8, 4, 1);
    this.cam.shake = 0.6;
  }

  /* ---- trails and finish celebrations from the shop ---- */
  setTrail(id) {
    this.trail = id;
    this.trailCols = (trailById(id).cols || []).map(lin);
  }
  emitTrail(p, v, t, base) {
    const R = Math.random, T = this.trailCols, pick = () => T[Math.floor(R() * T.length)];
    switch (this.trail) {
      case 'smoke': this.dust.add(p.x + (R() - 0.5) * 0.3, p.y - 0.2, p.z + (R() - 0.5) * 0.3, 0, 0.8, 0, pick(), 0.7, 0.9); break;
      case 'bubbles': if (R() < 0.6) this.fx.add(p.x + (R() - 0.5) * 0.6, p.y + (R() - 0.5) * 0.4, p.z + (R() - 0.5) * 0.6, 0, 1.2, 0, pick(), 0.18 + R() * 0.22, 1.0); break;
      case 'fire': for (let k = 0; k < 2; k++) this.fx.add(p.x + (R() - 0.5) * 0.4, p.y - 0.15 + R() * 0.2, p.z + (R() - 0.5) * 0.4, (R() - 0.5) * 0.6, 1.4 + R() * 1.2, (R() - 0.5) * 0.6, pick(), 0.45 + R() * 0.2, 0.32); break;
      case 'frost':
        this.fx.add(p.x, p.y, p.z, 0, 0.2, 0, T[0], 0.42, 0.3);
        if (R() < 0.7) this.fx.add(p.x + (R() - 0.5) * 0.8, p.y + (R() - 0.5) * 0.6, p.z + (R() - 0.5) * 0.8, 0, -0.3, 0, T[1], 0.12 + R() * 0.08, 0.9, 2);
        break;
      case 'sparkle': for (let k = 0; k < 3; k++) this.fx.add(p.x + (R() - 0.5) * 0.9, p.y + (R() - 0.5) * 0.8, p.z + (R() - 0.5) * 0.9, (R() - 0.5) * 1.2, R() * 1.2, (R() - 0.5) * 1.2, pick(), 0.08 + R() * 0.14, 0.5 + R() * 0.4); break;
      case 'neon': {
        const sp = Math.hypot(v.x, v.z) || 1, rx = -v.z / sp, rz = v.x / sp;
        this.fx.add(p.x + rx * 0.35, p.y - 0.1, p.z + rz * 0.35, 0, 0, 0, T[0], 0.32, 0.55);
        this.fx.add(p.x - rx * 0.35, p.y - 0.1, p.z - rz * 0.35, 0, 0, 0, T[1], 0.32, 0.55);
        break;
      }
      case 'rainbow': this.fx.add(p.x, p.y, p.z, 0, 0.2, 0, this.tc.setHSL((t * 0.7) % 1, 1, 0.55), 0.5, 0.5); break;
      case 'comet':
        this.fx.add(p.x, p.y, p.z, 0, 0, 0, T[0], 0.55, 0.45);
        this.fx.add(p.x + (R() - 0.5) * 0.5, p.y + (R() - 0.5) * 0.5, p.z + (R() - 0.5) * 0.5, 0, 0, 0, T[1 + Math.floor(R() * 2)], 0.3, 0.9);
        break;
      default: this.fx.add(p.x, p.y, p.z, 0, 0.3, 0, base, 0.36, 0.26);
    }
  }
  later(dt, fn) { this.timers.push({ t: this.clock + dt, fn }); }
  celebrate(kind, p) {
    const R = Math.random;
    switch (kind) {
      case 'fireworks': {
        // Ahead of the ball and low enough to stay in the chase camera's view.
        const F = fwdV(this.cam.yaw), Rt = rightV(this.cam.yaw);
        for (let k = 0; k < 7; k++) {
          this.later(k * 0.28, () => {
            const along = 6 + R() * 8, side = (R() - 0.5) * 10, x = p.x + F.x * along + Rt.x * side, z = p.z + F.z * along + Rt.z * side, y = p.y + 3.5 + R() * 3.5;
            const col = lin(['#ff4f86', '#ffd23f', '#5cf2c4', '#8fb8ff', '#ff8a3a', '#c98cff'][k % 6]);
            this.fx.burst(x, y, z, 70, 7, col, 0.45, 1.3, 4);
            this.fx.burst(x, y, z, 18, 3, lin('#ffffff'), 0.3, 0.7, 4);
          });
        }
        break;
      }
      case 'goldrain':
        for (let k = 0; k < 24; k++) {
          this.later(k * 0.1, () => {
            const F = fwdV(this.cam.yaw);
            for (let j = 0; j < 8; j++) this.fx.add(p.x + F.x * 4 + (R() - 0.5) * 12, p.y + 7 + R() * 3, p.z + F.z * 4 + (R() - 0.5) * 12, 0, -2, 0, lin(R() < 0.7 ? '#ffd23f' : '#fff1a8'), 0.28 + R() * 0.2, 2.2, 5);
          });
        }
        break;
      case 'rainbow':
        ['#ff4b4b', '#ff9a3a', '#ffe14a', '#4fd15a', '#3aa0ff', '#7a5cff'].forEach((h, k) => this.later(k * 0.12, () => {
          const col = lin(h);
          for (let j = 0; j < 48; j++) { const a = (j / 48) * 6.28, sp = 6 + k * 0.8; this.fx.add(p.x, p.y + 0.5 + k * 0.3, p.z, Math.cos(a) * sp, 1.5, Math.sin(a) * sp, col, 0.42, 1.0, 1); }
        }));
        break;
      case 'supernova':
        this.fx.burst(p.x, p.y + 1, p.z, 120, 14, lin('#ffffff'), 0.6, 0.9, 0, 2);
        this.later(0.15, () => { for (let j = 0; j < 90; j++) { const a = (j / 90) * 6.28; this.fx.add(p.x, p.y + 0.6, p.z, Math.cos(a) * 16, 0, Math.sin(a) * 16, lin('#ffd23f'), 0.6, 0.8); } });
        this.later(0.35, () => this.fx.burst(p.x, p.y + 3, p.z, 80, 9, lin('#c98cff'), 0.5, 1.4, 2));
        this.cam.shake = 0.4;
        break;
      default: this.confetti(p);
    }
  }

  arch(z, height, color, finish) {
    const F = fwdV(z.yaw), Rt = rightV(z.yaw), g = this.group;
    const postGeo = this.own(new THREE.CylinderGeometry(0.14, 0.18, height, 10).translate(0, height / 2, 0));
    const postMat = this.own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }));
    const half = z.w / 2 + 0.35;
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(postGeo, postMat);
      m.position.set(z.x + Rt.x * half * s, z.y, z.z + Rt.z * half * s);
      m.castShadow = true;
      g.add(m);
    }
    const bannerGeo = this.own(new THREE.BoxGeometry(half * 2 + 0.3, finish ? 1.1 : 0.55, 0.14));
    const face = finish
      ? this.own(new THREE.MeshStandardMaterial({ map: TEX.checker, roughness: 0.5 }))
      : this.own(new THREE.MeshStandardMaterial({ color: lin(color), roughness: 0.4, emissive: lin(color), emissiveIntensity: 0.2 }));
    const edge = this.own(new THREE.MeshStandardMaterial({ color: lin(finish ? '#ff3b5c' : color), roughness: 0.4 }));
    const banner = new THREE.Mesh(bannerGeo, [edge, edge, edge, edge, face, face]);
    banner.position.set(z.x, z.y + height - (finish ? 0.55 : 0.3), z.z);
    banner.rotation.y = z.yaw + Math.PI;
    banner.castShadow = true;
    void F;
    g.add(banner);
    return { banner, face, z };
  }

  obstacleView(o, th) {
    const g = this.group, f = o.o, Rt = rightV(f.yaw || 0);
    const std = (c, extra = {}) => this.own(new THREE.MeshStandardMaterial(Object.assign({ color: lin(c), roughness: 0.4 }, extra)));
    const shadow = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
    const mesh = (geoObj, mat) => shadow(new THREE.Mesh(this.own(geoObj), mat));
    let root = null, update = null;
    switch (o.type) {
      case 'spinner': {
        root = new THREE.Group();
        root.add(mesh(new THREE.BoxGeometry(f.len, 0.34, 0.34), this.own(new THREE.MeshStandardMaterial({ map: TEX.stripes, roughness: 0.35 }))));
        for (const s of [-1, 1]) { const cap = mesh(new THREE.SphereGeometry(0.22, 12, 8), std('#ff3b4f')); cap.position.x = (s * f.len) / 2; root.add(cap); }
        const post = mesh(new THREE.CylinderGeometry(0.3, 0.38, 1.3, 16), std('#3a3f4c', { metalness: 0.4 }));
        post.position.set(f.x, f.y + 0.65, f.z);
        g.add(post);
        break;
      }
      case 'pendulum': {
        root = new THREE.Group();
        root.add(mesh(new THREE.SphereGeometry(f.head, 24, 16), std('#e8323f', { roughness: 0.3 })));
        const spikes = new Batch(), cone = new THREE.ConeGeometry(0.14, 0.5, 8).translate(0, f.head + 0.2, 0), white = new THREE.Color(1, 1, 1);
        for (const d of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0], [0.7, 0.7, 0], [-0.7, 0.7, 0], [0.7, -0.5, 0.5], [-0.7, -0.5, -0.5], [0.5, -0.5, -0.7], [-0.5, -0.5, 0.7]]) {
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...d).normalize());
          spikes.add(cone, new THREE.Matrix4().makeRotationFromQuaternion(q), white);
        }
        cone.dispose();
        const sm = spikes.mesh(std('#d9dde6', { metalness: 0.8, roughness: 0.25, vertexColors: true }));
        this.own(sm.geometry);
        root.add(shadow(sm));
        const metal = std('#4a5160', { metalness: 0.6, roughness: 0.35 });
        const H = f.height + 0.4, half = f.w / 2 + 0.5;
        const postGeo = this.own(new THREE.CylinderGeometry(0.16, 0.2, H, 10).translate(0, H / 2, 0));
        for (const s of [-1, 1]) { const p = shadow(new THREE.Mesh(postGeo, metal)); p.position.set(f.x + Rt.x * half * s, f.y, f.z + Rt.z * half * s); g.add(p); }
        const bar = mesh(new THREE.BoxGeometry(half * 2, 0.3, 0.3), metal);
        bar.position.set(f.x, f.y + H, f.z);
        bar.rotation.y = f.yaw;
        g.add(bar);
        const arm = mesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 8), metal);
        g.add(arm);
        const pivot = new THREE.Vector3(...o.pivot), dir = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
        update = (pos) => {
          dir.subVectors(pivot, pos);
          const len = dir.length();
          arm.position.copy(pos).addScaledVector(dir, 0.5);
          arm.scale.set(1, len, 1);
          arm.quaternion.setFromUnitVectors(up, dir.normalize());
        };
        break;
      }
      case 'pusher': {
        const [lx, hy, lz] = f.size;
        root = mesh(new THREE.BoxGeometry(lx, hy, lz), this.own(new THREE.MeshStandardMaterial({ map: TEX.hazard, roughness: 0.5 })));
        const house = mesh(new THREE.BoxGeometry(lx + 0.4, hy + 0.5, lz + 0.4), std('#3a3f4c', { metalness: 0.3 }));
        const u = f.side * (f.w / 2 + lx / 2 + 0.6);
        house.position.set(f.x + Rt.x * u, f.y + hy / 2 - 0.1, f.z + Rt.z * u);
        house.rotation.y = f.yaw;
        g.add(house);
        break;
      }
      case 'slider':
        root = mesh(new THREE.BoxGeometry(f.len, 1.1, 0.4), std(th.edge === '#ffffff' ? th.side : th.edge, { roughness: 0.25 }));
        break;
      case 'platform': {
        const top = this.own(new THREE.MeshStandardMaterial({ color: lin(th.top[0]), roughness: 0.4 }));
        const side = std(th.side);
        root = mesh(new THREE.BoxGeometry(f.w, 0.5, f.len), [side, side, top, side, side, side]);
        // A bright band around the sides, below the top face.
        const glow = mesh(new THREE.BoxGeometry(f.w + 0.04, 0.1, f.len + 0.04), this.own(new THREE.MeshBasicMaterial({ color: lin(th.edge) })));
        glow.position.y = 0.12;
        root.add(glow);
        break;
      }
      case 'disc': {
        const tex = this.own(canvasTex(256, 256, (c, w, h) => {
          for (let i = 0; i < 12; i++) { c.fillStyle = i % 2 ? th.top[0] : th.top[1]; c.beginPath(); c.moveTo(w / 2, h / 2); c.arc(w / 2, h / 2, w / 2, (i / 12) * Math.PI * 2, ((i + 1) / 12) * Math.PI * 2); c.fill(); }
          c.strokeStyle = th.edge; c.lineWidth = 10; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 5, 0, Math.PI * 2); c.stroke();
        }, { repeat: false }));
        const top = this.own(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 }));
        const side = std(th.side);
        root = mesh(new THREE.CylinderGeometry(f.r, f.r, 0.6, 48), [side, top, side]);
        break;
      }
      case 'bumper': {
        const m = mesh(new THREE.CylinderGeometry(f.r, f.r, 1.0, 24), std('#ff4fa3', { emissive: lin('#ff2a8a'), emissiveIntensity: 0.35, roughness: 0.2 }));
        m.position.set(f.x, f.y + 0.5, f.z);
        const ring = mesh(new THREE.TorusGeometry(f.r, 0.08, 8, 24).rotateX(Math.PI / 2), std('#ffffff', { roughness: 0.2 }));
        ring.position.y = 0.5;
        m.add(ring);
        g.add(m);
        return { o, root: m, update: null, bumper: true, pulse: 0 };
      }
      case 'windmill': {
        // A gantry across the track holding a four-bladed hub.
        const H = f.hub, half = f.w / 2 + 0.5, metal = std('#e9edf3', { roughness: 0.35 });
        const postGeo = this.own(new THREE.CylinderGeometry(0.2, 0.26, H + 0.6, 10).translate(0, (H + 0.6) / 2, 0));
        for (const sd of [-1, 1]) { const pm = shadow(new THREE.Mesh(postGeo, metal)); pm.position.set(f.x + Rt.x * half * sd, f.y, f.z + Rt.z * half * sd); g.add(pm); }
        const beam = mesh(new THREE.BoxGeometry(half * 2, 0.35, 0.35), metal);
        beam.position.set(f.x, f.y + H + 0.6, f.z);
        beam.rotation.y = f.yaw;
        g.add(beam);
        root = new THREE.Group();
        root.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.6, 16).rotateX(Math.PI / 2), std('#3a3f4c', { metalness: 0.5 })));
        const bladeGeo = this.own(new THREE.BoxGeometry(f.len, 0.32, 0.44).translate(f.len / 2, 0, 0));
        const tipGeo = this.own(new THREE.BoxGeometry(0.7, 0.34, 0.46).translate(f.len - 0.35, 0, 0));
        const bladeMat = std(th.edge === '#ffffff' ? th.side : th.edge, { roughness: 0.3 }), tipMat = std('#ffffff', { roughness: 0.3 });
        for (let k = 0; k < 4; k++) {
          const bl = new THREE.Group();
          bl.rotation.z = (k * Math.PI) / 2;
          bl.add(shadow(new THREE.Mesh(bladeGeo, bladeMat)), shadow(new THREE.Mesh(tipGeo, tipMat)));
          root.add(bl);
        }
        break;
      }
      case 'pillar': {
        const side = this.own(new THREE.MeshStandardMaterial({ map: TEX.hazard, roughness: 0.5 })), top = std('#ffc61a', { roughness: 0.4 });
        root = mesh(new THREE.BoxGeometry(f.size, 1.5, f.size), [side, side, top, side, side, side]);
        const hole = new THREE.Mesh(this.own(new THREE.PlaneGeometry(f.size + 0.12, f.size + 0.12).rotateX(-Math.PI / 2)), std('#14161c', { roughness: 0.9 }));
        hole.position.set(f.x, f.y + 0.012, f.z);
        hole.rotation.y = f.yaw;
        hole.receiveShadow = true;
        g.add(hole);
        break;
      }
      case 'seesaw': {
        const topM = this.own(new THREE.MeshStandardMaterial({ map: TEX.stripes, roughness: 0.45 }));
        TEX.stripes.wrapS = TEX.stripes.wrapT = THREE.RepeatWrapping;
        root = mesh(new THREE.BoxGeometry(f.bw, 0.5, f.gap + 0.8), [std(th.side), std(th.side), topM, std(th.side), std(th.side), std(th.side)]);
        const Fv = fwdV(f.yaw);
        for (const a of [0, f.gap]) {
          const pv = mesh(new THREE.ConeGeometry(0.5, 1.2, 4), std('#3a3f4c', { metalness: 0.4 }));
          pv.position.set(f.x + Fv.x * a, f.y - 1.1, f.z + Fv.z * a);
          g.add(pv);
        }
        break;
      }
      case 'bricks': {
        // One instanced mesh per wall; every brick follows its own physics body.
        const look = { snow: ['#cfeeff', 0.0], space: ['#9aa3b8', 0.4], canyon: ['#d9935a', 0], volcano: ['#4d4242', 0], city: ['#3a3f6a', 0.2] }[th.id] || ['#c4553a', 0];
        const mat = this.own(new THREE.MeshStandardMaterial({ map: TEX.brick, color: lin(look[0]), roughness: 0.85, metalness: look[1] }));
        const im = new THREE.InstancedMesh(this.own(new THREE.BoxGeometry(0.78, 0.45, 0.45)), mat, o.bricks.length);
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        im.castShadow = im.receiveShadow = true;
        im.frustumCulled = false;
        const c = new THREE.Color();
        o.bricks.forEach((_, i) => im.setColorAt(i, c.setScalar(0.8 + Math.random() * 0.3)));
        g.add(im);
        return { o, root: null, update: null, brickMesh: im };
      }
      case 'glass': {
        const metal = std('#e9edf3', { roughness: 0.3 });
        const pane = new THREE.Mesh(this.own(new THREE.PlaneGeometry(f.w, 1.8)), this.own(new THREE.MeshStandardMaterial({ color: lin('#bfe8ff'), transparent: true, opacity: 0.32, roughness: 0.02, metalness: 0.4, side: THREE.DoubleSide, depthWrite: false, emissive: lin('#6fc8ff'), emissiveIntensity: 0.15 })));
        pane.position.set(f.x, f.y + 0.9, f.z);
        pane.rotation.y = f.yaw;
        pane.renderOrder = 3;
        g.add(pane);
        for (const sd of [-1, 1]) { const post = mesh(new THREE.BoxGeometry(0.18, 2.1, 0.22), metal); post.position.set(f.x + Rt.x * sd * (f.w / 2 + 0.09), f.y + 1.05, f.z + Rt.z * sd * (f.w / 2 + 0.09)); post.rotation.y = f.yaw; g.add(post); }
        const bar = mesh(new THREE.BoxGeometry(f.w + 0.36, 0.18, 0.22), metal);
        bar.position.set(f.x, f.y + 2.0, f.z);
        bar.rotation.y = f.yaw;
        g.add(bar);
        return { o, root: null, update: null, pane };
      }
      case 'endwall': {
        const side = this.own(new THREE.MeshStandardMaterial({ map: TEX.hazard, roughness: 0.5 })), top = std(th.edge);
        const wall = mesh(new THREE.BoxGeometry(f.w + 0.6, 2.4, 0.6), [side, side, top, side, side, side]);
        wall.position.set(f.x, f.y + 1.2, f.z);
        wall.rotation.y = f.yaw;
        g.add(wall);
        return { o, root: null, update: null };
      }
      case 'hammer': {
        // A housing at the track edge; the arm and mallet head turn with the body.
        const sd = f.side, u0 = sd * (f.w / 2 + 0.35), metal = std('#3a3f4c', { metalness: 0.5, roughness: 0.35 });
        const base = mesh(new THREE.BoxGeometry(0.9, 1.3, 1.3), metal);
        base.position.set(f.x + Rt.x * u0, f.y + 0.25, f.z + Rt.z * u0);
        base.rotation.y = f.yaw;
        g.add(base);
        root = new THREE.Group();
        root.add(mesh(new THREE.BoxGeometry(0.36, f.len, 0.36).translate(0, f.len / 2, 0), std('#e9edf3', { roughness: 0.35 })));
        const band = this.own(new THREE.MeshStandardMaterial({ map: TEX.hazard, roughness: 0.45 })), cap = std('#e8323f', { roughness: 0.3 });
        root.add(mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.7, 20).rotateX(Math.PI / 2).translate(0, f.len - 0.6, 0), [band, cap, cap]));
        break;
      }
      case 'swing': {
        const topM = this.own(new THREE.MeshStandardMaterial({ map: TEX.stripes, roughness: 0.45 })), side = std(th.side);
        root = mesh(new THREE.BoxGeometry(f.bw, 0.5, f.len), [side, side, topM, side, side, side]);
        const glow = mesh(new THREE.BoxGeometry(f.bw + 0.04, 0.1, f.len + 0.04), this.own(new THREE.MeshBasicMaterial({ color: lin(th.edge) })));
        glow.position.y = 0.12;
        root.add(glow);
        // Two rods up to the gantry, re-aimed every frame.
        const Fv = fwdV(f.yaw), pivY = f.y - 0.37 + f.arm + 0.25, c = new THREE.Vector3(f.x + Fv.x * f.a, pivY, f.z + Fv.z * f.a);
        const rodMat = std('#c9ced8', { metalness: 0.6, roughness: 0.3 }), rodGeo = this.own(new THREE.CylinderGeometry(0.06, 0.06, 1, 6));
        const rods = [-1, 1].map((e) => { const r = new THREE.Mesh(rodGeo, rodMat); r.castShadow = true; g.add(r); return { r, e, top: c.clone().addScaledVector(Fv, e * f.len * 0.35) }; });
        const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), foot = new THREE.Vector3();
        update = (pos) => {
          for (const rd of rods) {
            foot.copy(pos).addScaledVector(Fv, rd.e * f.len * 0.35).y += 0.25;
            dir.subVectors(rd.top, foot);
            const len = dir.length();
            rd.r.position.copy(foot).addScaledVector(dir, 0.5);
            rd.r.scale.set(1, len, 1);
            rd.r.quaternion.setFromUnitVectors(up, dir.normalize());
          }
        };
        if (f.k === 0) {
          // The gantry over the whole row: a beam along the middle and an arch at each end.
          const total = f.n * f.len + (f.n + 1) * 0.4, metal = std('#e9edf3', { roughness: 0.35 }), out = f.bw / 2 + f.arm * Math.sin(f.amp) + 0.8;
          const beam = mesh(new THREE.BoxGeometry(0.4, 0.4, total + 1), metal);
          beam.position.set(f.x + Fv.x * (total / 2), pivY + 0.2, f.z + Fv.z * (total / 2));
          beam.rotation.y = f.yaw;
          g.add(beam);
          const postGeo = this.own(new THREE.CylinderGeometry(0.2, 0.26, pivY - f.y + 1.6, 10).translate(0, (pivY - f.y + 1.6) / 2, 0));
          for (const a of [-0.5, total + 0.5]) {
            for (const sdd of [-1, 1]) { const pm = shadow(new THREE.Mesh(postGeo, metal)); pm.position.set(f.x + Fv.x * a + Rt.x * out * sdd, f.y - 1.4, f.z + Fv.z * a + Rt.z * out * sdd); g.add(pm); }
            const cross = mesh(new THREE.BoxGeometry(out * 2, 0.35, 0.35), metal);
            cross.position.set(f.x + Fv.x * a, pivY + 0.2, f.z + Fv.z * a);
            cross.rotation.y = f.yaw;
            g.add(cross);
          }
        }
        break;
      }
      case 'divider': {
        const Fv = fwdV(f.yaw), wall = mesh(new THREE.BoxGeometry(0.36, 0.7, f.len), std(th.rail, { roughness: 0.3, emissive: th.neon ? lin(th.rail) : new THREE.Color(0), emissiveIntensity: th.neon ? 0.6 : 0 }));
        wall.position.set(f.x + Fv.x * (f.len / 2), f.y + 0.35, f.z + Fv.z * (f.len / 2));
        wall.rotation.y = f.yaw;
        g.add(wall);
        return { o, root: null, update: null };
      }
      case 'cannon': {
        // A barrel on a pedestal beside the track, aimed across it.
        const u = f.side * (f.w / 2 + 1.3), base = new THREE.Group();
        base.position.set(f.x + Rt.x * u, f.y, f.z + Rt.z * u);
        base.rotation.y = f.yaw;
        const ped = mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.55, 16), std('#3a3f4c', { metalness: 0.4 }));
        ped.position.y = 0.27;
        const barrel = mesh(new THREE.CylinderGeometry(0.34, 0.42, 1.5, 18).rotateZ(Math.PI / 2), std('#23262e', { metalness: 0.7, roughness: 0.3 }));
        barrel.position.set(-f.side * 0.25, 0.85, 0);
        const ring = mesh(new THREE.TorusGeometry(0.36, 0.07, 8, 18).rotateY(Math.PI / 2), std('#e8b13a', { metalness: 0.9, roughness: 0.25 }));
        ring.position.set(-f.side * 0.95, 0.85, 0);
        base.add(ped, barrel, ring);
        g.add(base);
        const muzzle = new THREE.Vector3(f.x + Rt.x * (u - f.side * 1.1), f.y + 0.85, f.z + Rt.z * (u - f.side * 1.1));
        return { o, root: null, update: null, cannon: true, muzzle, barrel, kick: 0 };
      }
      case 'fan': {
        // A big fan on the side the wind comes from, blowing across the track.
        const u = f.side * (f.w / 2 + 0.9), house = new THREE.Group();
        house.position.set(f.x + Rt.x * u, f.y, f.z + Rt.z * u);
        house.rotation.y = f.yaw;
        const frame = mesh(new THREE.TorusGeometry(1.25, 0.16, 10, 32).rotateY(Math.PI / 2), std('#e8ecf4', { roughness: 0.3 }));
        frame.position.set(0, 1.35, f.len / 2);
        const stand = mesh(new THREE.BoxGeometry(0.3, 1.4, 0.3), std('#3a3f4c'));
        stand.position.set(f.side * 0.2, 0.7, f.len / 2);
        const hub = new THREE.Group();
        hub.position.set(0, 1.35, f.len / 2);
        const blade = this.own(new THREE.BoxGeometry(0.08, 1.05, 0.34).translate(0, 0.58, 0));
        const bladeMat = std('#3aa0ff', { roughness: 0.3 });
        for (let k = 0; k < 4; k++) { const bl = new THREE.Mesh(blade, bladeMat); bl.rotation.x = (k * Math.PI) / 2 + 0.3; bl.castShadow = true; hub.add(bl); }
        house.add(frame, stand, hub);
        g.add(house);
        return { o, root: null, update: null, fan: true, hub, dir: -f.side, puffT: 0 };
      }
      default:
        return { o, root: null, update: null };
    }
    g.add(root);
    return { o, root, update };
  }

  buildSky(th) {
    const uni = {
      top: { value: lin(th.skyTop) }, horizon: { value: lin(th.fog) }, bottom: { value: lin(th.skyBottom) },
      sunDir: { value: SUN.clone() }, sunColor: { value: lin(th.sun) },
    };
    const mat = this.own(new THREE.ShaderMaterial({
      uniforms: uni, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; varying vec3 vDir;
        void main(){ vec3 d = normalize(vDir); float h = d.y;
          vec3 c = h > 0.0 ? mix(horizon, top, pow(min(h * 1.4, 1.0), 0.7)) : mix(horizon, bottom, pow(min(-h * 2.0, 1.0), 0.6));
          float s = max(dot(d, sunDir), 0.0);
          c += sunColor * (pow(s, 900.0) * 3.0 + pow(s, 14.0) * 0.18);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }`,
    }));
    const geo = this.own(new THREE.SphereGeometry(800, 32, 16));
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);
    // Image-based lighting from the same sky, so the ball and coins reflect it.
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(this.own(new THREE.SphereGeometry(100, 32, 16)), mat));
    const pm = new THREE.PMREMGenerator(this.renderer);
    const rt = pm.fromScene(envScene, 0.02);
    pm.dispose();
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
  }

  buildScenery(L, th) {
    const r = mulberry32(L.n * 101 + 3), g = this.group, S = L.samples, B = L.bounds, gy = this.groundY;
    const cx = (B.minX + B.maxX) / 2, cz = (B.minZ + B.maxZ) / 2, span = Math.max(B.maxX - B.minX, B.maxZ - B.minZ) / 2;
    const style = th.style;
    // Ground far below the track: sea, cloud bank, lava, desert, snowfield or a neon street grid. Space has none.
    this.groundTex = null;
    if (th.ground !== 'void') {
      const tex = { sea: TEX.water, clouds: TEX.clouds, lava: TEX.lava, desert: TEX.sand, snow: TEX.snow, city: TEX.grid }[th.ground].clone();
      tex.needsUpdate = true;
      const rep = th.ground === 'city' ? 250 : 140;
      tex.repeat.set(rep, rep);
      this.own(tex);
      const gmat = th.ground === 'sea'
        ? new THREE.MeshStandardMaterial({ color: lin(th.groundColor), map: tex, roughness: 0.15, metalness: 0.3 })
        : th.ground === 'desert' || th.ground === 'snow' ? new THREE.MeshStandardMaterial({ color: lin(th.groundColor).multiplyScalar(th.ground === 'snow' ? 0.82 : 1), map: tex, roughness: 1 })
          : new THREE.MeshBasicMaterial({ color: th.ground === 'lava' || th.ground === 'city' ? 0xffffff : lin(th.groundColor), map: tex });
      this.own(gmat);
      const ground = new THREE.Mesh(this.own(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2)), gmat);
      ground.position.set(cx, gy, cz);
      ground.receiveShadow = th.ground === 'snow';
      g.add(ground);
      if (th.ground === 'sea' || th.ground === 'clouds' || th.ground === 'lava') this.groundTex = tex;
    }

    const batch = new Batch(), glow = new Batch();
    const rock = lin(th.rock || '#6e6a7a'), grass = lin(th.island || '#888888');
    const lowNear = (x, z, rad) => {
      let low = Infinity;
      for (let i = 0; i < S.length; i += 2) { const f = S[i]; if ((f.x - x) ** 2 + (f.z - z) ** 2 < rad * rad) low = Math.min(low, f.y); }
      return low;
    };
    // Same answer for the same point, so shared vertices move together and the mesh doesn't crack.
    const hash = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); };

    /* islands, isles, peaks or asteroids beside the track */
    const placed = [], want = style === 'city' ? 0 : style === 'ocean' ? 30 : style === 'space' ? 36 : 44;
    let lighthouses = 0;
    for (let tries = 0; tries < 500 && placed.length < want; tries++) {
      const f = S[Math.floor(r() * S.length)];
      const side = r() < 0.5 ? -1 : 1, off = (style === 'ocean' ? 14 : 7) + r() * (style === 'ocean' ? 70 : 38), along = (r() - 0.5) * 20;
      const Rt = rightV(f.yaw), F = fwdV(f.yaw);
      const x = f.x + Rt.x * side * off + F.x * along, z = f.z + Rt.z * side * off + F.z * along;
      const rad = 2.5 + r() * 8;
      if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < (p.rad + rad) * 0.8)) continue;
      const near = lowNear(x, z, rad + 6);

      if (style === 'ocean') {
        // Low sandy isles just above the sea, with palms and the odd lighthouse.
        if (near < gy + 9) continue;
        const top = gy + 1 + r() * 2.2, h = top - gy + 1, sand = lin(th.rock);
        placed.push({ x, z, rad });
        const isle = new THREE.CylinderGeometry(rad * 0.7, rad * 1.05, h, 11, 2).translate(0, h / 2, 0);
        batch.add(isle, mtx(x, gy - 1, z, 1, 1, 1, r() * 6), (p, n) => (n.y > 0.6 && p.y > top - 0.3 ? grass.clone().offsetHSL(0, 0, (hash(p.x, p.y, p.z) - 0.5) * 0.06) : sand));
        const beach = new THREE.CylinderGeometry(rad * 1.25, rad * 1.5, 0.7, 13).translate(0, 0.35, 0);
        batch.add(beach, mtx(x, gy - 0.5, z, 1, 1, 1, r() * 6), sand.clone().multiplyScalar(1.05));
        isle.dispose(); beach.dispose();
        if (rad > 6 && lighthouses < 2 && r() < 0.6) { lighthouses++; prop(batch, 'lighthouse', x, top, z, 0.9, r); continue; }
        for (let k = 0; k < 2 + Math.floor(r() * 4); k++) {
          const a = r() * 6.28, d = r() * rad * 0.45;
          prop(batch, th.decor[Math.floor(r() * th.decor.length)], x + Math.cos(a) * d, top, z + Math.sin(a) * d, 1.8 + r() * 1.4, r);
        }
        continue;
      }

      if (style === 'space') {
        // Asteroids drifting beside, below and above the track, never through it.
        const y = near === Infinity ? f.y + (r() - 0.5) * 40 : near - rad - 3 - r() * 22;
        placed.push({ x, z, rad });
        const geo = new THREE.IcosahedronGeometry(rad * 0.8, 1), pa = geo.attributes.position, v = new THREE.Vector3();
        for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i); v.multiplyScalar(0.75 + 0.45 * hash(v.x, v.y, v.z)); pa.setXYZ(i, v.x, v.y, v.z); }
        const base = lin(r() < 0.5 ? '#6e6a7a' : '#7a6658');
        batch.add(geo, mtx(x, y, z, 1, 0.75 + r() * 0.4, 1, r() * 6, r() * 3, r() * 3), (p) => base.clone().multiplyScalar(0.55 + 0.45 * hash(Math.round(p.x), Math.round(p.y), Math.round(p.z))));
        geo.dispose();
        continue;
      }

      const topMax = near === Infinity ? B.minY - 2 + r() * 8 : near - 6;
      const top = topMax - r() * 22;
      if (top < gy + 3) continue;
      placed.push({ x, z, rad });
      const shade = (p, n) => (n.y > 0.55 ? grass.clone().offsetHSL(0, 0, (r() - 0.5) * 0.05) : rock.clone().multiplyScalar(0.55 + 0.45 * clamp((p.y - gy) / Math.max(1, top - gy), 0, 1)));
      if (th.islandStyle === 'float') {
        const disc = new THREE.CylinderGeometry(rad, rad * 0.92, 1, 9).translate(0, -0.5, 0);
        const under = new THREE.ConeGeometry(rad * 0.92, rad * 1.8, 9).rotateX(Math.PI).translate(0, -1 - rad * 0.9, 0);
        batch.add(disc, mtx(x, top, z, 1, 1, 1, r() * 6), shade);
        batch.add(under, mtx(x, top, z, 1, 1, 1, r() * 6), (p) => rock.clone().multiplyScalar(0.45 + 0.4 * clamp((p.y - (top - rad * 2)) / (rad * 2), 0, 1)));
        disc.dispose(); under.dispose();
      } else {
        const height = top - (gy - 2);
        const geo = th.islandStyle === 'mesa' ? new THREE.CylinderGeometry(rad * 0.85, rad, height, 8, 5)
          : th.islandStyle === 'spire' ? new THREE.CylinderGeometry(rad * 0.25, rad, height, 7, 4)
            : th.islandStyle === 'snowpeak' ? new THREE.CylinderGeometry(rad * 0.45, rad * 1.1, height, 8, 6)
              : new THREE.CylinderGeometry(rad * 0.62, rad, height, 9, 5);
        const pa = geo.attributes.position;
        for (let i = 0; i < pa.count; i++) {
          const py = pa.getY(i);
          if (py > -height / 2 + 0.01 && py < height / 2 - 0.01) { pa.setX(i, pa.getX(i) * (0.85 + r() * 0.3)); pa.setZ(i, pa.getZ(i) * (0.85 + r() * 0.3)); }
        }
        geo.translate(0, height / 2, 0);
        const snow = lin('#f4f8ff');
        const paint = th.islandStyle === 'mesa'
          ? (p, n) => (n.y > 0.55 ? grass.clone() : rock.clone().multiplyScalar(0.6 + 0.3 * (Math.floor(p.y * 0.5) % 2)))
          : th.islandStyle === 'spire'
            ? (p) => (p.y > top - 1 ? lin('#ff7a2a') : rock.clone().multiplyScalar(0.5 + 0.5 * clamp((p.y - gy) / height, 0, 1)))
            : th.islandStyle === 'snowpeak'
              // Snow on the top and on the gentler faces, bare rock on the steep sides.
              ? (p, n) => (n.y > 0.5 || p.y > top - 3 - 4 * hash(p.x, 0, p.z) ? snow.clone().offsetHSL(0, 0, -0.04 * hash(p.x, p.y, p.z)) : rock.clone().multiplyScalar(0.55 + 0.45 * clamp((p.y - gy) / height, 0, 1)))
              : shade;
        batch.add(geo, mtx(x, gy - 2, z, 1, 1, 1, r() * 6), paint);
        geo.dispose();
      }
      if (th.islandStyle !== 'spire') {
        const room = th.islandStyle === 'snowpeak' ? 0.3 : 0.55;
        for (let k = 0; k < 2 + Math.floor(r() * 5); k++) {
          const a = r() * 6.28, d = r() * rad * room;
          prop(batch, th.decor[Math.floor(r() * th.decor.length)], x + Math.cos(a) * d, top, z + Math.sin(a) * d, 1.6 + r() * 1.4, r);
        }
      }
    }

    /* world extras */
    if (style === 'ocean') {
      // Sailboats out on the water.
      for (let k = 0; k < 12; k++) {
        const f = S[Math.floor(r() * S.length)], Rt = rightV(f.yaw), side = r() < 0.5 ? -1 : 1, off = 18 + r() * 90;
        prop(batch, 'boat', f.x + Rt.x * side * off, gy, f.z + Rt.z * side * off, 1.4 + r() * 0.8, r);
      }
    }
    if (style === 'snow') {
      // A pine forest on the snowfield below.
      for (let k = 0; k < 170; k++) {
        const f = S[Math.floor(r() * S.length)], Rt = rightV(f.yaw), side = r() < 0.5 ? -1 : 1, off = 4 + r() * 95;
        prop(batch, r() < 0.88 ? 'snowpine' : 'rock', f.x + Rt.x * side * off + (r() - 0.5) * 10, gy, f.z + Rt.z * side * off + (r() - 0.5) * 10, 2.2 + r() * 2.6, r);
      }
    }
    if (style === 'city') this.buildCity(L, th, r, lowNear, glow);
    if (style === 'space') this.buildSpace(L, th, r, batch, glow);

    /* pylons holding the track up */
    if (th.supports) {
      const sc = lin(th.supports), band = th.neon ? lin(th.edge) : lin('#e8323f'), wet = lin('#6d7f8c');
      for (let i = 12; i < S.length - 12; i += 26) {
        const f = S[i];
        if (f.gap || f.glass || S[i - 8].glass || S[i + 8].glass || S[i - 8].gap || S[i + 8].gap) continue;
        // Not where another stretch of the track runs underneath.
        if (S.some((q, j) => Math.abs(j - i) > 30 && q.y < f.y - 1 && (q.x - f.x) ** 2 + (q.z - f.z) ** 2 < (q.w / 2 + 1.5) ** 2)) continue;
        const top = f.y - 0.75, base = gy - 1, h = top - base;
        if (h < 2) continue;
        batch.add(PG.cyl, mtx(f.x, base, f.z, 1.2, h, 1.2), sc);
        batch.add(PG.box, mtx(f.x, top - 0.3, f.z, f.w * 0.7, 0.6, 1.1, f.yaw), sc);
        if (th.neon) for (let y = base + 6; y < top - 2; y += 7) glow.add(PG.cyl, mtx(f.x, y, f.z, 1.3, 0.3, 1.3), band);
        else { batch.add(PG.cyl, mtx(f.x, base, f.z, 1.3, 1.8, 1.3), wet); batch.add(PG.cyl, mtx(f.x, top - 1.6, f.z, 1.26, 0.5, 1.26), band); }
      }
    }

    /* the far horizon: mountains (snow-capped in the snow world); the city and space have their own */
    if (style !== 'city' && style !== 'space') {
      const ringR = span + 160, mcol = lin(th.mountains), cap = lin('#f7fbff');
      for (let i = 0; i < 26; i++) {
        // Ocean: low green islands on the horizon rather than peaks.
        const a = (i / 26) * Math.PI * 2 + r() * 0.2, d = ringR + r() * 120, hgt = style === 'ocean' ? 25 + r() * 45 : 80 + r() * 120, rad = style === 'ocean' ? 70 + r() * 70 : 50 + r() * 60;
        const geo = new THREE.ConeGeometry(rad, hgt, 7, 2), base = gy + hgt / 2 - 5;
        batch.add(geo, mtx(cx + Math.cos(a) * d, base, cz + Math.sin(a) * d, 1, 1, 1, r() * 6),
          (p, n) => (style === 'snow' && p.y > base + hgt * 0.1 ? cap : mcol).clone().multiplyScalar(0.75 + 0.25 * n.y));
        geo.dispose();
      }
    }
    const scen = batch.mesh(this.own(new THREE.MeshLambertMaterial({ vertexColors: true })));
    if (scen) { this.own(scen.geometry); scen.receiveShadow = style === 'snow' || style === 'ocean'; g.add(scen); }
    const lit = glow.mesh(this.own(new THREE.MeshBasicMaterial({ vertexColors: true })));
    if (lit) { this.own(lit.geometry); g.add(lit); }

    /* night sky: stars that travel with the sky dome */
    if (th.weather === 'stars') {
      const n = 1800, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), v = new THREE.Vector3(), c = new THREE.Color();
      for (let i = 0; i < n; i++) {
        do v.set(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1); while (v.lengthSq() > 1 || v.lengthSq() < 0.01);
        v.normalize();
        if (style === 'city') v.y = Math.abs(v.y) * 0.9 + 0.1;
        v.normalize().multiplyScalar(700);
        pos.set([v.x, v.y, v.z], i * 3);
        c.setHSL(r() < 0.5 ? 0.6 : 0.08, 0.6, 0.75 + r() * 0.25).multiplyScalar(0.5 + r() * 0.5);
        col.set([c.r, c.g, c.b], i * 3);
      }
      const sg = this.own(new THREE.BufferGeometry());
      sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const stars = new THREE.Points(sg, this.own(new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false })));
      stars.renderOrder = -9;
      stars.frustumCulled = false;
      this.sky.add(stars);
    }

    // Clouds drift around and below the track (above the sea in the ocean world), never across it; one merged mesh.
    this.cloudGroup = null;
    if (th.ground !== 'lava' && style !== 'city' && style !== 'space') {
      const cb = new Batch(), n = th.ground === 'clouds' ? 34 : 20, white = new THREE.Color(1, 1, 1);
      for (let i = 0; i < n; i++) {
        const puffs = 3 + Math.floor(r() * 4), s = 2 + r() * 4;
        const f = S[Math.floor(r() * S.length)], Rt = rightV(f.yaw), side = r() < 0.5 ? -1 : 1, off = (style === 'ocean' ? 35 : 18) + r() * 60;
        const ccx = f.x + Rt.x * side * off, cy = style === 'ocean' ? f.y + 14 + r() * 24 : Math.max(gy + 5, f.y - 6 - r() * 26), ccz = f.z + Rt.z * side * off;
        for (let k = 0; k < puffs; k++) cb.add(PG.puff, mtx(ccx + (k - puffs / 2) * 0.9 * s, cy + (r() - 0.3) * 0.4 * s, ccz + (r() - 0.5) * 0.8 * s, s * (0.8 + r() * 0.5), s * (0.55 + r() * 0.3), s * (0.8 + r() * 0.4)), white);
      }
      const cm = cb.mesh(this.own(new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: lin('#8090a8'), emissiveIntensity: 0.4 })));
      this.own(cm.geometry);
      this.cloudGroup = cm;
      g.add(cm);
    }
  }

  // Neon City: blocks of lit towers on a street grid, low under the track and tall away from it, plus a skyline.
  buildCity(L, th, r, lowNear, glow) {
    const S = L.samples, B = L.bounds, gy = this.groundY, g = this.group;
    const cx = (B.minX + B.maxX) / 2, cz = (B.minZ + B.maxZ) / 2, span = Math.max(B.maxX - B.minX, B.maxZ - B.minZ) / 2;
    const tex = this.own(canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = '#14172b'; c.fillRect(0, 0, w, h);
      for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
        const q = R0();
        c.fillStyle = q < 0.3 ? '#ffd98a' : q < 0.42 ? '#9ff3ff' : q < 0.47 ? '#ff8ad8' : '#232946';
        c.fillRect(col * 32 + 6, row * 32 + 9, 20, 15);
      }
    }));
    const P = [], N = [], U = [], C = [];
    const box = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), pa = box.attributes.position, na = box.attributes.normal, ua = box.attributes.uv;
    const v = new THREE.Vector3(), nm = new THREE.Matrix3();
    const tower = (x, z, w, h, d) => {
      const m = mtx(x, gy + h / 2, z, w, h, d), s0 = Math.floor(r() * 4) / 4, tint = new THREE.Color().setHSL(0.66 + r() * 0.1, 0.3, 0.55 + r() * 0.3);
      nm.getNormalMatrix(m);
      for (let i = 0; i < 36; i++) {
        const face = Math.floor(i / 6);
        v.fromBufferAttribute(pa, i).applyMatrix4(m); P.push(v.x, v.y, v.z);
        v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); N.push(v.x, v.y, v.z);
        if (face === 2 || face === 3) U.push(0.02, 0.02);   // roof: plain facade
        else U.push(ua.getX(i) * (face < 2 ? d : w) / 4 + s0, ua.getY(i) * h / 4);
        C.push(tint.r, tint.g, tint.b);
      }
      // Some roofs get a neon rim, the tall ones a red light on a mast.
      const top = gy + h;
      if (r() < 0.45) {
        const nc = lin(['#00e5ff', '#ff2bd6', '#7c5cff', '#ffc61a'][Math.floor(r() * 4)]);
        glow.add(PG.box, mtx(x, top + 0.15, z + d / 2, w + 0.2, 0.3, 0.2), nc);
        glow.add(PG.box, mtx(x, top + 0.15, z - d / 2, w + 0.2, 0.3, 0.2), nc);
        glow.add(PG.box, mtx(x + w / 2, top + 0.15, z, 0.2, 0.3, d + 0.2), nc);
        glow.add(PG.box, mtx(x - w / 2, top + 0.15, z, 0.2, 0.3, d + 0.2), nc);
      }
      if (h > 60) glow.add(PG.blob, mtx(x, top + 4, z, 0.8, 0.8, 0.8), lin('#ff3048'));
    };
    const used = new Set(), CELL = 14;
    for (let tries = 0, made = 0; tries < 1800 && made < 170; tries++) {
      const f = S[Math.floor(r() * S.length)], Rt = rightV(f.yaw), side = r() < 0.5 ? -1 : 1, off = 4 + r() * 90;
      const x = Math.round((f.x + Rt.x * side * off) / CELL) * CELL, z = Math.round((f.z + Rt.z * side * off) / CELL) * CELL, key = `${x},${z}`;
      if (used.has(key)) continue;
      const w = 6 + r() * 6, d = 6 + r() * 6, near = lowNear(x, z, Math.hypot(w, d) / 2 + 16);
      // Under or beside the track: stay well below it. Away from it: reach for the sky.
      const top = near !== Infinity ? near - 6 - r() * 16 : gy + 22 + r() * (r() < 0.3 ? 120 : 55);
      if (top < gy + 5) continue;
      used.add(key);
      made++;
      tower(x, z, w, top - gy, d);
    }
    // The skyline all around.
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * Math.PI * 2 + r() * 0.05, dd = span + 150 + r() * 160;
      tower(cx + Math.cos(a) * dd, cz + Math.sin(a) * dd, 14 + r() * 14, 50 + r() * 170, 14 + r() * 14);
    }
    box.dispose();
    const geo = this.own(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    const mat = this.own(new THREE.MeshLambertMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.9, vertexColors: true }));
    g.add(new THREE.Mesh(geo, mat));
  }

  // Space Station: a ringed planet, a moon and a few station modules hanging in the void.
  buildSpace(L, th, r, batch, glow) {
    const B = L.bounds, g = this.group;
    const cx = (B.minX + B.maxX) / 2, cy = (B.minY + B.maxY) / 2, cz = (B.minZ + B.maxZ) / 2, span = Math.max(B.maxX - B.minX, B.maxZ - B.minZ) / 2;
    const planetTex = this.own(canvasTex(256, 128, (c, w, h) => {
      const cols = ['#d98a5a', '#e8b07a', '#b8644a', '#f0c89a', '#c97850', '#e4a070'];
      for (let y = 0; y < h; y += 4) { c.fillStyle = cols[Math.floor(R0() * cols.length)]; c.fillRect(0, y, w, 4 + Math.floor(R0() * 6)); }
      c.globalAlpha = 0.25; c.fillStyle = '#ffffff';
      for (let i = 0; i < 30; i++) c.fillRect(0, R0() * h, w, 1);
      c.globalAlpha = 1;
    }, { repeat: false }));
    const at = (dx, dy, dz, dist) => new THREE.Vector3(dx, dy, dz).normalize().multiplyScalar(dist).add(new THREE.Vector3(cx, cy, cz));
    const planet = new THREE.Mesh(this.own(new THREE.SphereGeometry(150, 48, 24)), this.own(new THREE.MeshLambertMaterial({ map: planetTex, fog: false, emissive: lin('#3a1a10'), emissiveIntensity: 0.6 })));
    planet.position.copy(at(0.55, 0.32, -0.77, span + 620));
    planet.rotation.z = 0.35;
    const ringTex = this.own(canvasTex(256, 256, (c, w, h) => {
      for (let k = 0; k < 60; k++) {
        const rr = (0.62 + (k / 60) * 0.38) * (w / 2);
        c.strokeStyle = `rgba(${230 - k},${200 - k},${170 - k},${0.25 + 0.6 * R0()})`; c.lineWidth = 2.5;
        c.beginPath(); c.arc(w / 2, h / 2, rr, 0, Math.PI * 2); c.stroke();
      }
    }, { repeat: false }));
    const ring = new THREE.Mesh(this.own(new THREE.RingGeometry(185, 290, 96)), this.own(new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, side: THREE.DoubleSide, fog: false, depthWrite: false })));
    ring.rotation.set(-Math.PI / 2 + 0.35, 0, 0.35);
    planet.add(ring);
    const moonTex = this.own(canvasTex(128, 64, (c, w, h) => {
      c.fillStyle = '#b9bcc8'; c.fillRect(0, 0, w, h);
      dots(c, 70, w, h, 1, 6, () => `rgba(80,82,100,${0.2 + R0() * 0.3})`);
    }, { repeat: false }));
    const moon = new THREE.Mesh(this.own(new THREE.SphereGeometry(42, 32, 16)), this.own(new THREE.MeshLambertMaterial({ map: moonTex, fog: false, emissive: lin('#20222c'), emissiveIntensity: 0.5 })));
    moon.position.copy(at(-0.7, 0.42, 0.55, span + 520));
    g.add(planet, moon);
    // Station modules: a hull, a docking ring and two solar wings.
    const hull = lin('#d9dde8'), panel = lin('#2a4fa8'), trim = lin(th.edge);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + r() * 0.6, d = span + 50 + r() * 90, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, y = cy + (r() - 0.5) * 70, ry = r() * 6, s = 0.8 + r() * 0.8;
      const Fx = Math.cos(ry), Fz = -Math.sin(ry);
      batch.add(PG.cyl, mtx(x, y, z, 7 * s, 30 * s, 7 * s, ry, 0, Math.PI / 2), hull);
      const tor = new THREE.TorusGeometry(10 * s, 1.4 * s, 6, 24);
      batch.add(tor, mtx(x - Fx * 15 * s, y, z - Fz * 15 * s, 1, 1, 1, ry + Math.PI / 2), hull.clone().multiplyScalar(0.8));
      tor.dispose();
      for (const sd of [-1, 1]) {
        batch.add(PG.box, mtx(x - Fx * 22 * s * 0.5, y + sd * 14 * s, z - Fz * 22 * s * 0.5, 26 * s, 0.4, 9 * s, ry), panel);
        batch.add(PG.cyl, mtx(x - Fx * 11 * s, y + (sd < 0 ? -14 * s : 0), z - Fz * 11 * s, 0.6, 14 * s, 0.6), hull);
      }
      for (let q = 0; q < 5; q++) glow.add(PG.box, mtx(x - Fx * (q * 6 - 12) * s, y + 3.6 * s, z - Fz * (q * 6 - 12) * s, 1.2, 0.3, 1.2, ry), trim);
    }
  }

  // Falling snow or rising embers around the ball (or whatever a free camera looks at).
  weather(dt, sim) {
    const w = this.theme.weather;
    if (w !== 'snow' && w !== 'embers') return;
    if (this.quality === 'low') return;
    const p = this.manualCamera && this.focus ? this.focus : sim.player.body.translation();
    this.wxT = (this.wxT || 0) + dt * (w === 'snow' ? 50 : 22);
    for (; this.wxT >= 1; this.wxT -= 1) {
      const a = Math.random() * Math.PI * 2, d = 2 + Math.random() * 24, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (w === 'snow') this.dust.add(x, p.y + 4 + Math.random() * 10, z, (Math.random() - 0.5) * 0.8, -2 - Math.random() * 1.2, (Math.random() - 0.5) * 0.8, this.snowColor, 0.14 + Math.random() * 0.1, 5);
      else this.fx.add(x, p.y - 10 + Math.random() * 8, z, (Math.random() - 0.5) * 0.6, 2.2 + Math.random() * 2.5, (Math.random() - 0.5) * 0.6, this.emberColor, 0.16 + Math.random() * 0.14, 3.6);
    }
  }

  /* ---- events → effects ---- */
  coinFx(c) { this.fx.burst(c.x, c.y, c.z, c.gem ? 26 : 14, c.gem ? 4 : 3, c.gem ? this.gemColor : lin('#ffd84a'), 0.5, 0.5, 4); }
  powerFx(q) { this.fx.burst(q.x, q.y, q.z, 30, 4, lin(POWER_COL[q.kind]), 0.6, 0.6, 2, 1); }
  shieldFx(p) { this.fx.burst(p.x, p.y, p.z, 40, 5, lin('#5ad1ff'), 0.6, 0.7, 0, 1); this.cam.freezeY = null; }
  shatterFx(o) {
    const Rt = rightV(o.yaw);
    for (let i = 0; i < 70; i++) {
      const u = (Math.random() - 0.5) * o.w, y = o.y + 0.2 + Math.random() * 1.6, F = fwdV(o.yaw);
      this.fx.add(o.x + Rt.x * u, y, o.z + Rt.z * u, F.x * (3 + Math.random() * 5) + (Math.random() - 0.5) * 3, Math.random() * 3, F.z * (3 + Math.random() * 5) + (Math.random() - 0.5) * 3, Math.random() < 0.5 ? this.snowColor : this.gemColor.clone().setHSL(0.55, 0.8, 0.8), 0.14 + Math.random() * 0.12, 0.9, 12);
    }
  }
  smashFx(o) { this.dust.burst(o.x, o.y + 0.6, o.z, 26, 4, lin('#c9b8a8'), 0.8, 0.8, 2, 1); this.cam.shake = Math.max(this.cam.shake, 0.25); }
  // A round icon for each power-up.
  powerIcon(kind) {
    if (this.iconCache[kind] && this.iconCache[kind].image) return this.iconCache[kind];
    const t = canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = POWER_COL[kind]; c.beginPath(); c.arc(64, 64, 58, 0, Math.PI * 2); c.fill();
      c.lineWidth = 6; c.strokeStyle = '#ffffff'; c.stroke();
      c.lineCap = 'butt';
      if (kind === 'magnet') {
        c.strokeStyle = '#ffffff'; c.lineWidth = 20; c.beginPath(); c.arc(64, 58, 24, Math.PI, 0, true); c.stroke();
        c.fillStyle = '#ffffff'; c.fillRect(30, 30, 20, 30); c.fillRect(78, 30, 20, 30);
        c.fillStyle = '#c8cfdc'; c.fillRect(30, 26, 20, 12); c.fillRect(78, 26, 20, 12);
      } else if (kind === 'shield') {
        c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(64, 24); c.lineTo(96, 36); c.lineTo(92, 70); c.quadraticCurveTo(84, 94, 64, 104); c.quadraticCurveTo(44, 94, 36, 70); c.lineTo(32, 36); c.closePath(); c.fill();
        c.fillStyle = POWER_COL.shield; c.beginPath(); c.moveTo(64, 40); c.lineTo(82, 47); c.lineTo(79, 68); c.quadraticCurveTo(74, 82, 64, 88); c.closePath(); c.fill();
      } else {
        c.fillStyle = '#ffffff'; c.font = '400 54px Bungee, Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('x2', 64, 68);
      }
    }, { repeat: false });
    this.iconCache[kind] = t;
    return t;
  }
  boostFx(p) { this.fx.burst(p.x, p.y, p.z, 24, 4, lin('#ffb02a'), 0.7, 0.45, 0, 1); this.cam.shake = 0.15; }
  padFx(p) { this.fx.burst(p.x, p.y - 0.3, p.z, 26, 5, lin('#ff5a8a'), 0.6, 0.5, 6, 2); }
  hitFx(p, s) { this.dust.burst(p.x, p.y, p.z, Math.min(16, s * 2), 2.5, new THREE.Color(1, 1, 1), 0.6, 0.5, 2); this.cam.shake = Math.max(this.cam.shake, Math.min(0.3, s * 0.02)); }
  cannonFx(o, near) {
    const v = this.obsViews.find((x) => x.o.o === o);
    if (!v) return;
    v.kick = 1;
    if (near) {
      const m = v.muzzle;
      this.fx.burst(m.x, m.y, m.z, 18, 3, lin('#ffb347'), 0.6, 0.35, 0);
      this.dust.burst(m.x, m.y, m.z, 10, 1.5, new THREE.Color(0.85, 0.85, 0.85), 0.8, 0.8, -1);
    }
  }
  bumpFx(o) { const v = this.obsViews.find((x) => x.o.o === o); if (v) v.pulse = 1; }
  respawnFx(p) { this.fx.burst(p.x, p.y, p.z, 30, 3, lin('#ffffff'), 0.6, 0.6, 0, 1); this.cam.freezeY = null; }
  fallFx() { this.cam.freezeY = this.cam.pos.y; }
  checkpointFx(i) {
    const cf = this.checkFlags[i - 1];
    if (!cf) return;
    cf.face.color.copy(lin('#3be37a')); cf.face.emissive.copy(lin('#3be37a'));
    const z = cf.z;
    this.fx.burst(z.x, z.y + 5.6, z.z, 30, 4, lin('#7dffb0'), 0.4, 0.7, 5);
  }
  confetti(p) {
    const cols = ['#ffd23f', '#ff4f86', '#5cf2c4', '#8fb8ff', '#ffffff', '#ff8a3a'].map(lin);
    for (let i = 0; i < 160; i++) this.dust.add(p.x, p.y + 1, p.z, (Math.random() - 0.5) * 9, 5 + Math.random() * 8, (Math.random() - 0.5) * 9, cols[i % cols.length], 0.35, 2.4, 9);
  }

  /* ---- per frame ---- */
  frame(dt, sim, phase) {
    const t = sim.t;
    // Balls
    sim.balls.forEach((b, i) => {
      const m = this.ballMeshes[i], p = b.body.translation(), q = b.body.rotation();
      m.position.set(p.x, p.y, p.z);
      m.quaternion.set(q.x, q.y, q.z, q.w);
      const blob = m.userData.blob, gap = b.groundY != null ? p.y - b.groundY : 9;
      blob.visible = gap < 3;
      if (blob.visible) { blob.position.set(p.x, b.groundY + 0.03, p.z); blob.scale.setScalar(1 - gap * 0.2); }
      const v = b.body.linvel(), sp = Math.hypot(v.x, v.z);
      if (sp > 6 && b.fallT < 0) { if (i === 0) this.emitTrail(p, v, t, m.userData.trail); else this.fx.add(p.x, p.y, p.z, 0, 0.3, 0, m.userData.trail, 0.36, 0.26); }
      // Flattened by the boss until the respawn.
      if (b.squashed) { m.scale.set(1.7, 0.3, 1.7); if (b.groundY != null) m.position.y = b.groundY + P.R * 0.3; } else if (m.scale.y !== 1) m.scale.set(1, 1, 1);
    });
    this.clock += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) if (this.timers[i].t <= this.clock) { const fn = this.timers[i].fn; this.timers.splice(i, 1); fn(); }
    if (this.bossMesh) this.updateBoss(dt, sim);
    if (this.ghostMesh) {
      const g = this.ghostData, P3 = g.p, n = P3.length / 3, k = (this.ghostT || 0) * g.hz, i = Math.floor(k), f = k - i;
      this.ghostMesh.visible = i < n - 1;
      if (i < n - 1) {
        const a = i * 3, b = a + 3;
        this.ghostMesh.position.set(P3[a] + (P3[b] - P3[a]) * f, P3[a + 1] + (P3[b + 1] - P3[a + 1]) * f, P3[a + 2] + (P3[b + 2] - P3[a + 2]) * f);
      }
    }
    // Obstacles
    const d = this.dummy;
    for (const ov of this.obsViews) {
      if (ov.brickMesh) {
        ov.o.bricks.forEach((br, i) => {
          const p = br.body.translation(), q = br.body.rotation();
          d.position.set(p.x, p.y, p.z);
          d.quaternion.set(q.x, q.y, q.z, q.w);
          d.scale.setScalar(p.y < ov.o.o.y - 20 ? 0.0001 : 1);
          d.updateMatrix();
          ov.brickMesh.setMatrixAt(i, d.matrix);
        });
        ov.brickMesh.instanceMatrix.needsUpdate = true;
        continue;
      }
      if (ov.pane) { ov.pane.visible = !ov.o.broken; continue; }
      if (ov.fan) {
        ov.hub.rotation.x += dt * 14;
        ov.puffT -= dt;
        const f = ov.o.o;
        if (ov.puffT <= 0 && Math.abs(f.s - sim.player.s) < 40) {
          ov.puffT = 0.06;
          const Rt = rightV(f.yaw), F = fwdV(f.yaw), a = Math.random() * f.len, u = -ov.dir * (f.w / 2);
          this.dust.add(f.x + Rt.x * u + F.x * a, f.y + 0.3 + Math.random() * 1.6, f.z + Rt.z * u + F.z * a,
            Rt.x * ov.dir * 9, 0, Rt.z * ov.dir * 9, this.windColor, 0.25, 0.7);
        }
        continue;
      }
      if (ov.cannon) { ov.kick = Math.max(0, ov.kick - dt * 3); ov.barrel.position.x = -ov.o.o.side * (0.25 - ov.kick * 0.35); continue; }
      if (ov.bumper) { ov.pulse = Math.max(0, ov.pulse - dt * 4); ov.root.scale.set(1 + ov.pulse * 0.25, 1, 1 + ov.pulse * 0.25); continue; }
      const body = ov.o.body;
      if (!body || !ov.root) continue;
      const p = body.translation(), q = body.rotation();
      ov.root.position.set(p.x, p.y, p.z);
      ov.root.quaternion.set(q.x, q.y, q.z, q.w);
      if (ov.update) ov.update(ov.root.position);
    }
    sim.tiles.forEach((tl, i) => {
      const m = this.tileViews[i], p = tl.body.translation(), q = tl.body.rotation();
      const armed = tl.at >= 0 && t < tl.at;   // about to drop: shake as a warning
      m.position.set(p.x + (armed ? Math.sin(t * 90) * 0.04 : 0), p.y, p.z + (armed ? Math.cos(t * 77) * 0.04 : 0));
      m.quaternion.set(q.x, q.y, q.z, q.w);
      m.visible = !tl.gone;
    });
    // Boulders come and go with the simulation.
    const seen = new Set();
    for (const o of sim.obs) {
      if (o.type !== 'boulders' && o.type !== 'cannon' && o.type !== 'logs') continue;
      for (const bl of o.live) {
        seen.add(bl.body);
        let m = this.boulderMeshes.get(bl.body);
        if (!m) {
          m = o.type === 'cannon' ? new THREE.Mesh(this.shotGeo, this.shotMat)
            : o.type === 'logs' ? new THREE.Mesh(this.logGeo, this.logMat)
              : new THREE.Mesh(this.boulderGeo, this.rockMat);
          if (o.type === 'logs') m.scale.set(o.o.r, o.o.len, o.o.r);
          m.castShadow = true;
          this.group.add(m);
          this.boulderMeshes.set(bl.body, m);
        }
        const p = bl.body.translation(), q = bl.body.rotation();
        m.position.set(p.x, p.y, p.z);
        m.quaternion.set(q.x, q.y, q.z, q.w);
      }
    }
    for (const [body, m] of this.boulderMeshes) if (!seen.has(body)) { this.group.remove(m); this.boulderMeshes.delete(body); }
    // Coins spin; taken ones vanish.
    this.coinIdx.forEach((ci, k) => {
      const c = sim.coins[ci];
      d.position.set(c.x, c.y + Math.sin(t * 3 + ci) * 0.08, c.z);
      d.rotation.set(0, t * 3 + ci, 0);
      d.scale.setScalar(c.taken ? 0.0001 : 1);
      d.updateMatrix();
      this.coins.setMatrixAt(k, d.matrix);
    });
    this.coins.instanceMatrix.needsUpdate = true;
    this.gemIdx.forEach((ci, k) => {
      const c = sim.coins[ci];
      d.position.set(c.x, c.y + 0.1 + Math.sin(t * 2.4 + ci) * 0.12, c.z);
      d.rotation.set(0, t * 1.8 + ci, 0);
      d.scale.setScalar(c.taken ? 0.0001 : 1);
      d.updateMatrix();
      this.gems.setMatrixAt(k, d.matrix);
      if (!c.taken && Math.random() < 0.05) this.fx.add(c.x + (Math.random() - 0.5) * 0.6, c.y + 0.1 + (Math.random() - 0.5) * 0.6, c.z + (Math.random() - 0.5) * 0.6, 0, 0.4, 0, this.gemColor, 0.16, 0.6);
    });
    this.gems.instanceMatrix.needsUpdate = true;
    sim.powerups.forEach((q, i) => {
      const v = this.powerViews[i];
      v.visible = !q.taken;
      if (v.visible) { v.position.y = q.y + Math.sin(t * 2.2 + i) * 0.15; v.children[0].rotation.y = t; }
    });
    {
      const pp = sim.player.body.translation(), pw = sim.power;
      this.shieldMesh.visible = pw.shield > 0;
      if (pw.shield > 0) { this.shieldMesh.position.set(pp.x, pp.y, pp.z); this.shieldMesh.material.opacity = 0.16 + 0.08 * Math.sin(t * 8) + (pw.shield < 3 ? 0.1 * Math.sin(t * 20) : 0); }
      this.magnetRing.visible = pw.magnet > 0;
      if (pw.magnet > 0) { this.magnetRing.position.set(pp.x, pp.y - 0.2, pp.z); this.magnetRing.rotation.y = t * 4; this.magnetRing.scale.setScalar(1 + 0.08 * Math.sin(t * 10)); }
      if (pw.x2 > 0 && Math.random() < 0.3) this.fx.add(pp.x + (Math.random() - 0.5) * 1.2, pp.y + (Math.random() - 0.5) * 1.2, pp.z + (Math.random() - 0.5) * 1.2, 0, 0.6, 0, this.goldColor, 0.14, 0.5);
    }
    this.boostMat.map.offset.y -= dt * 2.2;
    for (const ov of this.overlays) if (ov.v) ov.tex.offset.y -= dt * ov.v * 0.5;   // also right for reversed belts: rotation is applied before the offset
    this.weather(dt, sim);
    if (this.groundTex) { this.groundTex.offset.x += dt * 0.004; this.groundTex.offset.y += dt * 0.002; }
    if (this.cloudGroup) this.cloudGroup.position.x += 0.6 * dt;

    this.fx.update(dt);
    this.dust.update(dt);
    const ps = this.renderer.domElement.height / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.fx.mat.uniforms.scale.value = ps;
    this.dust.mat.uniforms.scale.value = ps;
    if (!this.manualCamera) this.updateCamera(dt, sim, phase);
    this.sky.position.copy(this.camera.position);
    // Shadows follow the ball, or whatever a free camera is looking at.
    const pp = this.manualCamera && this.focus ? this.focus : sim.player.body.translation();
    this.sun.position.set(pp.x + SUN.x * 50, pp.y + SUN.y * 50, pp.z + SUN.z * 50);
    this.sun.target.position.set(pp.x, pp.y, pp.z);
    this.sun.target.updateMatrixWorld();
    this.renderer.render(this.scene, this.camera);
  }

  updateCamera(dt, sim, phase) {
    const b = sim.player, S = this.L.samples, p = b.body.translation(), v = b.body.linvel();
    const ahead = S[Math.min(S.length - 1, b.idx + 6)];
    const k = 1 - Math.exp(-dt * 3.5);
    this.cam.yaw += wrapAngle(ahead.yaw - this.cam.yaw) * k;
    const F = fwdV(this.cam.yaw);
    // Pull back and up in a loop so the whole loop is in view.
    const looping = !!sim.inLoop(b) || (b.inLoopZ != null);
    this.cam.loopK += ((looping ? 1 : 0) - this.cam.loopK) * (1 - Math.exp(-dt * 3));
    // Close behind the ball, like the genre leaders: the ball fills about a quarter of a portrait screen.
    // In a boss chase, rise and pull back so the boss shows behind you without hiding your ball.
    const B = sim.boss, chasing = !!(B && B.on && !B.down);
    this.cam.bossK += ((chasing ? 1 : 0) - this.cam.bossK) * (1 - Math.exp(-dt * 2.5));
    const back = (this.portrait ? 6.5 : 5.8) + this.cam.loopK * 7 + this.cam.bossK * 4.5, up = (this.portrait ? 3.3 : 2.9) + this.cam.loopK * 4.5 + this.cam.bossK * 3.7;
    const target = this.tmpA.set(p.x, p.y, p.z).addScaledVector(F, -back);
    target.y = (this.cam.freezeY != null ? this.cam.freezeY - up : p.y) + up;
    if (phase === 'title') { target.addScaledVector(F, -2); target.y += 1.5; }
    this.cam.introT += dt;
    const follow = this.cam.introT < 1.6 ? 1 - Math.exp(-dt * 2.2) : 1 - Math.exp(-dt * 9);
    this.cam.pos.lerp(target, follow);
    const sp = Math.hypot(v.x, v.z);
    const fovT = (this.portrait ? 64 : 54) + Math.min(9, sp * 0.5);
    this.cam.fov += (fovT - this.cam.fov) * (1 - Math.exp(-dt * 3));
    this.camera.fov = this.cam.fov;
    this.camera.updateProjectionMatrix();
    this.cam.shake = Math.max(0, this.cam.shake - dt);
    const sh = this.cam.shake;
    this.camera.position.set(this.cam.pos.x + (Math.random() - 0.5) * sh, this.cam.pos.y + (Math.random() - 0.5) * sh, this.cam.pos.z + (Math.random() - 0.5) * sh);
    const look = this.tmpB.set(p.x, p.y + 0.6, p.z).addScaledVector(F, 1.5 + this.cam.loopK * 2);
    if (this.cam.freezeY != null) look.y = Math.max(p.y, this.cam.freezeY - 4);
    this.camera.lookAt(look);
  }
}
