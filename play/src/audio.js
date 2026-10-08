/* Marblescape — synthesized sound effects and music (no audio files). */

let ctx = null, master = null, sfx = null, music = null, noiseBuf = null;
let muted = false;

function tone(f, dur, type = 'sine', v = 0.3, f2 = 0, delay = 0, out = sfx) {
  if (!ctx) return;
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}
function noise(dur, v, type = 'highpass', freq = 2000, freq2 = 0, delay = 0, out = sfx) {
  if (!ctx) return;
  const t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf;
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (freq2) f.frequency.exponentialRampToValueAtTime(freq2, t + dur);
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f);
  f.connect(g);
  g.connect(out);
  s.start(t, Math.random() * 1.5);
  s.stop(t + dur + 0.05);
}

// Music: one tune per world, built from drums, a bass line, a melody and chord arpeggios.
// Eight bars loop as A (melody) then B (melody up a step, busier hats). Races and showcases
// add an extra arpeggio layer; the menu tune is calmer.
const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10], DORIAN = [0, 2, 3, 5, 7, 9, 10];
const PHRYG = [0, 1, 4, 5, 7, 8, 10], LYDIAN = [0, 2, 4, 6, 7, 9, 11], MIXO = [0, 2, 4, 5, 7, 9, 10];
const DRUMS = {
  pop: { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.' },
  drive: { k: 'x.x...x.x.x...x.', s: '....x.......x..x', h: 'x.x.x.x.x.x.x.x.' },
  bounce: { k: 'x..x..x...x..x..', s: '....x.......x...', h: '.xx..xx..xx..xx.' },
  chill: { k: 'x.......x.......', s: '........x.......', h: '..x...x...x...x.' },
  synth: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.xxx.xxx.xxx.xx' },
  float: { k: 'x.........x.....', s: '................', h: '....x.......x...' },
};
const BASS = {
  pulse: [0, null, 0, null, 0, null, 0, 4, 0, null, 0, null, 0, null, 4, null],
  walk: [0, null, 2, null, 4, null, 2, null, 0, null, 4, null, 5, null, 4, null],
  syncop: [0, null, null, 0, null, null, 4, null, 0, null, null, 0, null, 2, 4, null],
  octave: [0, null, 7, null, 0, null, 7, null, 0, null, 7, null, 0, null, 7, 4],
  drone: [0, null, null, null, null, null, null, null, 0, null, null, null, 4, null, null, null],
};
const _ = null;
const SONGS = [
  { bpm: 122, root: 48, scale: MAJOR, prog: [0, 5, 3, 4, 0, 5, 1, 4], lead: 'triangle', drums: 'pop', bass: 'pulse', motif: [0, _, 2, 4, _, 4, 2, _, 0, _, 2, 4, 7, _, 4, _] },
  { bpm: 114, root: 45, scale: DORIAN, prog: [0, 6, 3, 4, 0, 6, 2, 4], lead: 'triangle', drums: 'pop', bass: 'walk', motif: [4, _, 3, _, 2, _, 0, _, 2, 3, 4, _, 7, _, 6, _] },
  { bpm: 126, root: 50, scale: PHRYG, prog: [0, 1, 0, 6, 0, 1, 2, 1], lead: 'square', drums: 'drive', bass: 'syncop', motif: [0, 1, _, 4, _, 1, 0, _, 0, 1, _, 4, 5, 4, 1, _] },
  { bpm: 128, root: 52, scale: LYDIAN, prog: [0, 1, 4, 3, 0, 1, 5, 4], lead: 'triangle', drums: 'bounce', bass: 'walk', motif: [4, _, 7, _, 6, 4, _, 3, 4, _, 7, _, 8, _, 7, _] },
  { bpm: 132, root: 53, scale: MIXO, prog: [0, 3, 4, 0, 0, 3, 6, 4], lead: 'square', drums: 'bounce', bass: 'syncop', motif: [0, 2, 4, _, 4, 2, 4, 6, _, 4, 2, _, 0, _, 2, _] },
  { bpm: 142, root: 40, scale: PHRYG, prog: [0, 1, 5, 4, 0, 1, 6, 1], lead: 'sawtooth', drums: 'drive', bass: 'pulse', motif: [0, _, 0, 1, _, 0, 4, _, 0, _, 0, 1, 5, 4, 1, _] },
  { bpm: 96, root: 48, scale: MAJOR, prog: [0, 4, 5, 3, 0, 4, 3, 4], lead: 'triangle', drums: 'chill', bass: 'walk', motif: [4, _, _, 2, _, _, 0, _, 2, _, _, 4, _, _, 2, _] },
  // 7: Neon City — synthwave: octave bass, steady hats, a sawtooth hook.
  { bpm: 118, root: 45, scale: MINOR, prog: [0, 5, 2, 6, 0, 5, 3, 4], lead: 'sawtooth', drums: 'synth', bass: 'octave', motif: [0, _, 2, _, 4, _, 7, _, 6, _, 4, _, 2, 4, _, _] },
  // 8: Space Station — slow, airy arpeggios over a drone.
  { bpm: 100, root: 50, scale: LYDIAN, prog: [0, 0, 4, 4, 5, 5, 1, 4], lead: 'triangle', drums: 'float', bass: 'drone', motif: [0, 4, 7, 11, 7, 4, 0, _, 2, 6, 9, 11, 9, 6, 2, _] },
  // 9: Boss chase — fast, low and relentless.
  { bpm: 156, root: 38, scale: PHRYG, prog: [0, 0, 1, 0, 0, 0, 6, 1], lead: 'sawtooth', drums: 'drive', bass: 'pulse', motif: [0, _, 0, 1, 0, _, 4, _, 0, _, 0, 1, 5, 4, 1, _] },
];
export const BOSS_SONG = 9;
export const MENU_SONG = 6;
let song = null, intense = false, step = 0, nextT = 0, timer = null;
const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
const deg = (s, d, oct) => s.root + 12 * (oct + Math.floor(d / 7)) + s.scale[((d % 7) + 7) % 7];
function kick(at) { tone(150, 0.14, 'sine', 0.32, 42, at, music); }
function snare(at) { noise(0.13, 0.14, 'bandpass', 1900, 900, at, music); tone(210, 0.07, 'triangle', 0.06, 0, at, music); }
function hat(at, v = 0.045) { noise(0.03, v, 'highpass', 8000, 0, at, music); }
function playStep(st, t) {
  const s = song, n = st % 16, bar = Math.floor(st / 16) % 8, chord = s.prog[bar], len = 60 / s.bpm / 4, at = t - ctx.currentTime;
  const B = bar >= 4, d = DRUMS[s.drums];
  if (d.k[n] === 'x') kick(at);
  if (d.s[n] === 'x') snare(at);
  if (d.h[n] === 'x' || (B && n % 2 === 1 && s.drums !== 'chill' && s.drums !== 'float')) hat(at, B ? 0.035 : 0.045);
  const bn = BASS[s.bass][n];
  if (bn != null) {
    tone(hz(deg(s, chord + bn, 0)), len * 1.7, 'triangle', 0.3, 0, at, music);
    tone(hz(deg(s, chord + bn, 0)) * 1.005, len * 1.2, 'sawtooth', 0.03, 0, at, music);
  }
  const m = s.motif[n];
  if (m != null) {
    const f = hz(deg(s, chord + m + (B ? 2 : 0), 2));
    const v = s.lead === 'triangle' ? 0.1 : 0.04;
    tone(f, len * 1.6, s.lead, v, 0, at, music);
    tone(f * 2.003, len * 0.8, 'sine', v * 0.25, 0, at, music);
  }
  if (intense && n % 2 === 1) tone(hz(deg(s, chord + [0, 2, 4, 7][(n >> 1) % 4], 3)), len * 0.7, 'square', 0.022, 0, at, music);
}
function schedule() {
  if (!ctx || !song) return;
  while (nextT < ctx.currentTime + 0.2) { playStep(step, nextT); nextT += 60 / song.bpm / 4; step++; }
}

export const Sound = {
  init() {
    if (ctx) { if (ctx.state !== 'running') ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(ctx.destination);
    sfx = ctx.createGain();
    sfx.connect(master);
    music = ctx.createGain();
    music.gain.value = 0.2;
    music.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  },
  get muted() { return muted; },
  setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.8; },
  // i: world tune (or MENU_SONG); hot: add the race/showcase layer.
  music(i, hot = false) {
    if (!ctx) return;
    const s = SONGS[i % SONGS.length];
    intense = hot;
    if (song === s && timer) return;
    song = s; step = 0; nextT = ctx.currentTime + 0.12;
    clearInterval(timer);
    timer = setInterval(schedule, 50);
  },
  stopMusic() { clearInterval(timer); timer = null; song = null; },
  coin(pitch = 0) { const f = 1320 * Math.pow(2, pitch / 12); tone(f, 0.08, 'square', 0.07); tone(f * 1.5, 0.16, 'square', 0.07, 0, 0.06); },
  hit(s) { tone(140, 0.12, 'triangle', Math.min(0.32, s * 0.03), 70); noise(0.06, Math.min(0.18, s * 0.02), 'lowpass', 900); },
  bump() { tone(520, 0.12, 'square', 0.12, 1040); tone(780, 0.1, 'sine', 0.1, 0, 0.04); },
  boost() { noise(0.55, 0.22, 'bandpass', 500, 3200); tone(260, 0.45, 'sawtooth', 0.05, 1100); },
  pad() { tone(200, 0.4, 'square', 0.1, 820); tone(300, 0.35, 'triangle', 0.1, 1200, 0.03); },
  crack() { noise(0.18, 0.2, 'bandpass', 1400, 400); },
  fall() { tone(800, 0.9, 'sine', 0.12, 120); },
  respawn() { tone(420, 0.22, 'sine', 0.1, 950); },
  checkpoint() { [784, 988, 1175].forEach((f, i) => tone(f, 0.18, 'triangle', 0.1, 0, i * 0.07)); },
  beep(hi) { tone(hi ? 1320 : 660, hi ? 0.4 : 0.14, 'square', 0.1); },
  finish() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, 'square', 0.08, 0, i * 0.09)); tone(1568, 0.7, 'triangle', 0.12, 0, 0.45); },
  buy() { [880, 1320, 1760].forEach((f, i) => tone(f, 0.14, 'square', 0.07, 0, i * 0.06)); },
  tap() { tone(900, 0.05, 'sine', 0.07); },
  cannon() { tone(90, 0.35, 'sine', 0.35, 35); noise(0.3, 0.3, 'lowpass', 1200, 200); },
  loop() { noise(0.8, 0.18, 'bandpass', 400, 2600); [523, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.08, 0, 0.25 + i * 0.07)); },
  trophy() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.22, 'triangle', 0.09, 0, i * 0.08)); },
  daily() { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.2, 'square', 0.07, 0, i * 0.07)); },
  nope() { tone(220, 0.18, 'square', 0.08, 160); },
  gem() { [1568, 2093, 2637].forEach((f, i) => tone(f, 0.16, 'triangle', 0.08, 0, i * 0.05)); tone(3136, 0.3, 'sine', 0.05, 0, 0.15); },
  power() { tone(330, 0.35, 'sawtooth', 0.06, 1320); [659, 988, 1319].forEach((f, i) => tone(f, 0.18, 'square', 0.06, 0, 0.1 + i * 0.06)); },
  shield() { noise(0.25, 0.2, 'bandpass', 2400, 600); tone(880, 0.3, 'sine', 0.12, 440); tone(1320, 0.3, 'triangle', 0.08, 0, 0.08); },
  smash() { noise(0.35, 0.35, 'lowpass', 1800, 200); tone(120, 0.25, 'square', 0.1, 60); [0.05, 0.12, 0.2].forEach((d) => noise(0.08, 0.15, 'bandpass', 900 + Math.random() * 900, 0, d)); },
  glass() { noise(0.5, 0.3, 'highpass', 5000, 0); [2637, 3136, 3520, 2794].forEach((f, i) => tone(f, 0.25, 'sine', 0.05, 0, 0.03 + i * 0.05)); },
  speedPad(k) { const f = 440 * Math.pow(2, k / 4); tone(f, 0.18, 'square', 0.07, f * 2); },
  bonus(m) { [523, 659, 784, 1047, 1319].slice(0, m).forEach((f, i) => tone(f, 0.22, 'square', 0.08, 0, i * 0.09)); tone(1568, 0.6, 'triangle', 0.1, 0, m * 0.09); },
  // The boss arrives: a low roar and a crash.
  roar() { tone(70, 1.1, 'sawtooth', 0.22, 38); tone(105, 0.9, 'square', 0.08, 50, 0.05); noise(1.0, 0.3, 'lowpass', 900, 120); noise(0.4, 0.35, 'lowpass', 300, 60, 0.6); },
  squash() { noise(0.35, 0.4, 'lowpass', 600, 80); tone(220, 0.5, 'square', 0.12, 55); tone(90, 0.4, 'sine', 0.3, 40); },
  bossDown() { noise(1.2, 0.35, 'lowpass', 2400, 90); tone(60, 1.0, 'sine', 0.35, 30); [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'square', 0.07, 0, 0.5 + i * 0.1)); },
};
