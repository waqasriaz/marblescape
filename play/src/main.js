/* Marblescape — game flow, input, HUD, shop and saving. */
import RAPIER from '../vendor/rapier.es.js';
import { generateLevel, WORLDS } from './gen.js';
import { Sim, P } from './physics.js';
import { View } from './view.js';
import { Sound, MENU_SONG, BOSS_SONG } from './audio.js';
import { SKINS, skinById, drawSwatch } from './skins.js';
import { TRAILS, CELEBRATIONS, drawTrail, drawCelebration } from './cosmetics.js';
import { ACH, DAILY, GHOST_HZ, fillDefaults, progress, checkAchievements, dailyState, collectDaily, loadGhost, saveGhost } from './meta.js';

const $ = (s) => document.querySelector(s);
const DEBUG = /[?&]debug\b/.test(location.search);
const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 1;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Haptics: the iPhone's Taptic Engine inside the app; the browser's vibrate elsewhere (Android).
const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const haptics = NATIVE && window.Capacitor.Plugins ? window.Capacitor.Plugins.Haptics : null;
const buzz = (p) => {
  try {
    if (haptics) { const ms = Array.isArray(p) ? Math.max(...p) : p; haptics.impact({ style: ms >= 60 ? 'HEAVY' : ms >= 25 ? 'MEDIUM' : 'LIGHT' }); return; }
    if (navigator.vibrate) navigator.vibrate(p);
  } catch (e) { /* unsupported */ }
};
const ord = (n) => (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
const worldOf = (n) => WORLDS[Math.floor((n - 1) / 5) % WORLDS.length];
const isBoss = (n) => n % 5 === 0;
const POWER_NAMES = { magnet: 'MAGNET!', shield: 'SHIELD!', x2: 'DOUBLE COINS!' };

/* ---------------- saved progress (this device) ---------------- */
const Save = {
  data: { level: 1, coins: 0, owned: ['classic'], skin: 'classic', stars: {}, muted: false, quality: 'auto', autoQ2: 'high' },
  load() { try { Object.assign(this.data, JSON.parse(localStorage.getItem('marblescape.v1') || '{}')); } catch (e) { /* storage blocked */ } },
  save() { try { localStorage.setItem('marblescape.v1', JSON.stringify(this.data)); } catch (e) { /* storage blocked */ } },
};
Save.load();
fillDefaults(Save.data);
Sound.setMuted(Save.data.muted);

let view = null;
const G = { phase: 'boot', L: null, sim: null, demo: true, n: 1, t0: 0, coins: 0, combo: 0, comboT: 0, phaseT: 0, count: 4, demoEnd: 0, result: null, fpsT: 0, fpsN: 0 };
const SCREENS = { title: '#s-title', shop: '#s-shop', levels: '#s-levels', ach: '#s-ach', daily: '#s-daily', ready: '#s-ready', panel: '#s-panel' };

function setPhase(p, screen = p) {
  G.phase = p;
  G.phaseT = 0;
  for (const [k, sel] of Object.entries(SCREENS)) $(sel).hidden = k !== screen;
  $('#hud').hidden = G.demo;
  // Keep a held thumb through the bonus run after the finish line.
  if (p !== 'play' && p !== 'count' && !(p === 'won' && G.bonusWait)) endTouch();
  if (p === 'count') G.count = 4;
}

function loadLevel(n, demo) {
  if (G.sim) G.sim.dispose();
  G.n = n;
  G.demo = demo;
  G.L = generateLevel(n);
  G.sim = new Sim(RAPIER, G.L, { autopilot: demo });
  view.load(G.L, G.sim, Save.data.skin);
  G.coins = 0;
  G.t0 = 0;
  G.demoEnd = 0;
  G.fpsT = 0;
  G.fpsN = 0;
  if (!demo) buildProgress();
}

/* ---------------- screens ---------------- */
function toTitle() {
  clearInterval(G.autoTimer);
  Save.save();
  loadLevel(Save.data.level, true);
  refreshTitle();
  setPhase('title');
  Sound.music(MENU_SONG);
  if (dailyState(Save.data).due) openDaily();
}
function openDaily() {
  const st = dailyState(Save.data);
  $('#daily-title').textContent = `Day ${st.day}`;
  const ol = $('#days');
  ol.replaceChildren();
  DAILY.forEach((amt, i) => {
    const li = document.createElement('li');
    li.className = i + 1 < st.day ? 'got' : i + 1 === st.day ? 'today' : '';
    const ic = document.createElement('span'); ic.className = 'coin-ico';
    const b = document.createElement('b'); b.textContent = String(amt);
    li.append(`Day ${i + 1}`, ic, b);
    ol.append(li);
  });
  $('#btn-daily').textContent = `Collect ${st.amount}`;
  setPhase('daily');
}
function openTrophies() {
  const ol = $('#achs');
  ol.replaceChildren();
  let done = 0;
  for (const a of ACH) {
    const pr = progress(Save.data, a);
    if (pr.done) done++;
    const li = document.createElement('li');
    li.className = 'ach' + (pr.done ? ' done' : '');
    const t = document.createElement('span'); t.className = 'trophy';
    const mid = document.createElement('span');
    const b = document.createElement('b'); b.textContent = a.name;
    const sm = document.createElement('small'); sm.textContent = pr.done ? a.desc : `${a.desc} ${pr.v} / ${a.goal}`;
    mid.append(b, sm);
    if (!pr.done && a.goal > 1) { const bar = document.createElement('div'); bar.className = 'bar'; const i = document.createElement('i'); i.style.width = `${(pr.v / a.goal) * 100}%`; bar.append(i); mid.append(bar); }
    const rew = document.createElement('span'); rew.className = 'rew';
    const ic = document.createElement('span'); ic.className = 'coin-ico';
    rew.append(ic, String(a.reward));
    li.append(t, mid, rew);
    ol.append(li);
  }
  $('#ach-note').textContent = `${done} of ${ACH.length}`;
  setPhase('ach');
}
// Pays out anything newly earned and announces it.
function achievements() {
  for (const a of checkAchievements(Save.data)) toast(`Trophy: ${a.name}`, `${a.desc} +${a.reward} coins`);
  Save.save();
}
const toasts = [];
function toast(name, sub) {
  toasts.push([name, sub]);
  if (toasts.length === 1) showToast();
}
function showToast() {
  if (!toasts.length) return;
  const [name, sub] = toasts[0], el = $('#toast');
  $('#toast-name').textContent = name;
  $('#toast-sub').textContent = sub;
  el.hidden = true; void el.offsetWidth; el.hidden = false;
  Sound.trophy();
  setTimeout(() => { el.hidden = true; toasts.shift(); showToast(); }, 2900);
}
function refreshTitle() {
  $('#title-coins').textContent = Save.data.coins;
  $('#title-level').textContent = `LEVEL ${Save.data.level}`;
  const lv = Save.data.level;
  $('#title-world').textContent = worldOf(lv).name + (isBoss(lv) ? ' · Boss' : lv % 4 === 0 ? ' · Race' : '');
  $('#btn-sound').textContent = Save.data.muted ? 'Sound: off' : 'Sound: on';
  $('#btn-quality').textContent = qualityLabel();
}

function play(n) {
  Sound.init();
  Sound.tap();
  keepAwake();
  clearInterval(G.autoTimer);
  loadLevel(n, false);
  $('#ready-world').textContent = G.L.world.name;
  $('#ready-title').textContent = `Level ${n}`;
  const badge = $('#ready-race');
  badge.hidden = !G.L.race && !G.L.boss;
  badge.className = 'badge' + (G.L.boss ? ' boss' : '');
  badge.textContent = G.L.boss ? `Boss · outrun ${G.L.world.boss.name}` : 'Race · beat 3 rivals';
  $('#hud-boss').hidden = true;
  $('#hud-boss-name').textContent = G.L.boss ? G.L.world.boss.name : '';
  $('#ready-go').textContent = isTouch ? (G.L.race ? 'Touch to start the race' : 'Touch to start') : 'Press ↑ to start';
  if (!isTouch) $('.howto span:last-child').textContent = '↑ rolls, ↓ brakes and reverses, ← → steer. P pauses.';
  $('#hud-level').textContent = `LEVEL ${n}`;
  $('#hud-place').hidden = !G.L.race;
  $('#hud-coin-n').textContent = '0';
  const best = Save.data.best[n], ghost = loadGhost(n);
  view.setGhost(ghost);
  $('#ready-best').hidden = best == null;
  if (best != null) $('#ready-best').textContent = `Your best: ${best.toFixed(1)} s${ghost ? ' · race your ghost' : ''}`;
  if (G.L.boss) $('#ready-world').textContent = `${G.L.world.name} · Boss level`;
  G.rec = [];
  Sound.music(G.L.world.music, G.L.boss || G.L.race);
  setPhase('ready');
}

function startRun() {
  Sound.init();
  if (G.L.race) setPhase('count');
  else { setPhase('play'); G.t0 = G.sim.t; }
}

function onFinish(place) {
  const s = G.sim, p = s.player;
  const time = s.t - G.t0, prev = Save.data.best[G.n];
  G.result = { time, falls: p.falls, place, race: G.L.race, coins: G.coins, prev, best: prev == null || time < prev, mult: 1 };
  G.bonusWait = !!G.L.bonus;
  G.bonusAt = 0;
  G.padN = 0;
  if (G.result.best) {
    Save.data.best[G.n] = time;
    saveGhost(Save.data, G.n, time, G.rec);
    if (prev != null) Save.data.stats.ghostBeats++;
  }
  Sound.finish();
  buzz([30, 40, 30]);
  view.celebrate(Save.data.fx, p.body.translation());
  flash(G.L.race ? `${place}${ord(place).toUpperCase()}!` : G.L.boss ? 'ESCAPED!' : 'FINISH!');
  setPhase('won', null);
  if (G.bonusWait) setTimeout(() => { if (G.bonusWait) flash('Steer onto the pads!', true); }, 900);
}

function completePanel() {
  const r = G.result, n = G.n;
  const stars = r.falls === 0 ? 3 : r.falls <= 2 ? 2 : 1;
  // Bosses pay 100, plus 150 the first time you outrun each one.
  const firstBoss = G.L.boss && !Save.data.bossBeat[G.L.world.id];
  const bossBonus = G.L.boss ? 100 + (firstBoss ? 150 : 0) : 0;
  const bonus = 20 + (r.race ? [60, 35, 20, 10][r.place - 1] : 0) + bossBonus;
  if (G.L.boss) Save.data.bossBeat[G.L.world.id] = true;
  const earned = r.coins * (r.mult || 1);
  if ((r.mult || 1) === 5) Save.data.stats.x5++;
  Save.data.coins += earned + bonus;
  Save.data.stars[n] = Math.max(Save.data.stars[n] || 0, stars);
  Save.data.level = Math.max(Save.data.level, n + 1);
  if (r.falls === 0) Save.data.stats.flawless++;
  if (r.race && r.place === 1) Save.data.stats.wins++;
  achievements();
  const title = G.L.boss ? `You outran ${G.L.world.boss.name}!` : !r.race ? 'Level complete!' : r.place === 1 ? 'You won the race!' : `You came ${r.place}${ord(r.place)}`;
  const stats = [['Time', `${r.time.toFixed(1)} s${r.best && r.prev != null ? '  new best!' : ''}`], ['Coins collected', r.mult > 1 ? `${r.coins} × ${r.mult} = ${earned}` : String(r.coins)], [r.race ? `Finish bonus (${r.place}${ord(r.place)})` : G.L.boss ? `Boss bonus${firstBoss ? ' (first win)' : ''}` : 'Finish bonus', `+${bonus}`], ['Falls', String(r.falls)]];
  panel('complete', {
    win: true, stars,
    eyebrow: `Level ${n} · ${G.L.world.name}`,
    title,
    text: stars < 3 ? 'Finish without falling for three stars.' : '',
    stats,
    actions: [
      { label: `Next level`, primary: true, auto: 6, fn: () => play(n + 1) },
      { label: 'Replay', fn: () => play(n) },
      { label: 'Home', ghost: true, fn: toTitle },
    ],
  });
}

function pause() {
  if (!['play', 'count', 'ready'].includes(G.phase)) return;
  G.pausedFrom = G.phase;
  panel('paused', {
    eyebrow: `Level ${G.n} · ${G.L.world.name}`, title: 'Paused',
    actions: [
      { label: 'Resume', primary: true, fn: resume },
      { label: 'Restart level', fn: () => play(G.n) },
      { label: 'Home', fn: toTitle },
      { label: Save.data.muted ? 'Sound: off' : 'Sound: on', ghost: true, keep: true, fn: (b) => { toggleSound(); b.textContent = Save.data.muted ? 'Sound: off' : 'Sound: on'; } },
      { label: qualityLabel(), ghost: true, keep: true, fn: (b) => { cycleQuality(); b.textContent = qualityLabel(); } },
    ],
  });
}
function resume() { setPhase(G.pausedFrom === 'ready' ? 'ready' : 'count', G.pausedFrom === 'ready' ? 'ready' : null); }

function panel(phase, o) {
  clearInterval(G.autoTimer);
  $('#panel').className = 'panel' + (o.win ? ' win' : '');
  $('#p-eyebrow').textContent = o.eyebrow || '';
  $('#p-title').textContent = o.title || '';
  const st = $('#p-stars');
  st.hidden = !o.stars;
  if (o.stars) [...st.children].forEach((s, i) => s.classList.toggle('on', i < o.stars));
  const pt = $('#p-text');
  pt.textContent = o.text || '';
  pt.hidden = !o.text;
  const dl = $('#p-stats');
  dl.replaceChildren();
  dl.hidden = !(o.stats && o.stats.length);
  for (const [k, v] of o.stats || []) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    dl.append(dt, dd);
  }
  const box = $('#p-actions');
  box.replaceChildren();
  for (const a of o.actions) {
    const b = document.createElement('button');
    b.className = 'btn' + (a.primary ? ' primary' : a.ghost ? ' ghost' : '');
    b.textContent = a.label;
    b.addEventListener('click', () => { if (!a.keep) clearInterval(G.autoTimer); Sound.init(); Sound.tap(); a.fn(b); });
    box.append(b);
    if (a.auto) {
      // Carries on by itself so a run never sits waiting.
      let left = a.auto;
      b.textContent = `${a.label} (${left})`;
      G.autoTimer = setInterval(() => {
        if (G.phase !== phase) { clearInterval(G.autoTimer); return; }
        left--;
        if (left <= 0) { clearInterval(G.autoTimer); a.fn(b); } else b.textContent = `${a.label} (${left})`;
      }, 1000);
    }
  }
  setPhase(phase, 'panel');
}

/* ---------------- shop and levels ---------------- */
let shopTab = 'balls';
function openShop() { renderShop(); setPhase('shop'); }
// One grid, three kinds of goods. Each tab knows its catalogue, what you own and what's equipped.
const SHOP = {
  balls: { items: SKINS, owned: 'owned', on: 'skin', note: 'Your ball. Tap to buy or wear.', draw: (c, it) => drawSwatch(c, it), equip: () => view.setSkin(Save.data.skin) },
  trails: { items: TRAILS, owned: 'ownedTrails', on: 'trail', note: 'What your ball leaves behind when it gets going.', draw: (c, it) => drawTrail(c, it, skinById(Save.data.skin).trail), equip: () => view.setTrail(Save.data.trail) },
  fx: { items: CELEBRATIONS, owned: 'ownedFx', on: 'fx', note: 'Plays when you cross the finish line. Tap one to preview it.', draw: (c, it) => drawCelebration(c, it), equip: () => { const p = G.sim.player.body.translation(); view.celebrate(Save.data.fx, p); } },
};
function renderShop() {
  $('#shop-coins').textContent = Save.data.coins;
  for (const t of document.querySelectorAll('.tabs [role="tab"]')) t.setAttribute('aria-selected', String(t.dataset.tab === shopTab));
  const tab = SHOP[shopTab], D = Save.data;
  $('#shop-note').textContent = tab.note;
  const grid = $('#skins');
  grid.setAttribute('aria-labelledby', `tab-${shopTab}`);
  grid.replaceChildren();
  for (const it of tab.items) {
    const owned = D[tab.owned].includes(it.id), on = D[tab.on] === it.id;
    const b = document.createElement('button');
    b.className = 'skin' + (owned ? ' owned' : '') + (on ? ' on' : '') + (!owned && D.coins < it.price ? ' poor' : '');
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    tab.draw(c, it);
    const name = document.createElement('b');
    name.textContent = it.name;
    const tag = document.createElement('small');
    if (on) tag.textContent = 'Equipped';
    else if (owned) tag.textContent = 'Owned';
    else { const ic = document.createElement('span'); ic.className = 'coin-ico'; tag.append(ic, String(it.price)); }
    b.append(c, name, tag);
    b.addEventListener('click', () => {
      Sound.init();
      if (owned) { D[tab.on] = it.id; Sound.tap(); }
      else if (D.coins >= it.price) { D.coins -= it.price; D[tab.owned].push(it.id); D[tab.on] = it.id; Sound.buy(); buzz(20); }
      else { Sound.nope(); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
      Save.save();
      tab.equip();
      achievements();
      renderShop();
      refreshTitle();
    });
    grid.append(b);
  }
}
for (const t of document.querySelectorAll('.tabs [role="tab"]')) {
  t.addEventListener('click', () => { Sound.init(); Sound.tap(); shopTab = t.dataset.tab; renderShop(); });
}
function openLevels() {
  const grid = $('#levels');
  grid.replaceChildren();
  const top = Math.max(15, Math.ceil((Save.data.level + 5) / 5) * 5);
  $('#levels-note').textContent = `${Object.values(Save.data.stars).reduce((a, s) => a + s, 0)} ★`;
  for (let n = 1; n <= top; n++) {
    const b = document.createElement('button');
    b.className = 'lv' + (n === Save.data.level ? ' next' : '') + (isBoss(n) ? ' boss' : '');
    if (isBoss(n)) b.setAttribute('aria-label', `Level ${n}, boss level`);
    b.disabled = n > Save.data.level;
    b.textContent = String(n);
    const s = document.createElement('small');
    const st = Save.data.stars[n] || 0;
    s.textContent = n > Save.data.level ? '🔒' : '★'.repeat(st) + '☆'.repeat(3 - st);
    b.append(s);
    b.addEventListener('click', () => play(n));
    grid.append(b);
  }
  setPhase('levels');
}

/* ---------------- HUD ---------------- */
function buildProgress() {
  const bar = $('#prog');
  bar.querySelectorAll('.tick,.dot').forEach((e) => e.remove());
  for (const cp of G.L.checkpoints.slice(1)) {
    const t = document.createElement('i');
    t.className = 'tick';
    t.style.left = `${(cp.s / G.L.length) * 100}%`;
    bar.append(t);
  }
  G.barW = 0;
  G.lastFill = -1;
  $('#prog-fill').style.transform = 'scaleX(0)';
  G.bossDot = null;
  if (G.L.boss) { G.bossDot = document.createElement('i'); G.bossDot.className = 'dot boss'; G.bossDot.hidden = true; bar.append(G.bossDot); }
  G.dots = G.sim.balls.map((b, i) => {
    const d = document.createElement('i');
    d.className = 'dot' + (i === 0 ? ' me' : '');
    if (i > 0) d.style.background = `#${view.ballColor(i)}`;
    bar.append(d);
    return d;
  });
}
function hud() {
  const s = G.sim, L = G.L, bar = $('#prog');
  const W = G.barW || (G.barW = bar.clientWidth);
  const k = clamp(s.player.s / L.length, 0, 1);
  const fill = Math.round(k * 400) / 400;
  if (fill !== G.lastFill) { G.lastFill = fill; $('#prog-fill').style.transform = `scaleX(${fill})`; }
  s.balls.forEach((b, i) => {
    const x = Math.round(clamp(b.s / L.length, 0, 1) * W);
    if (G.dots[i]._x !== x) { G.dots[i]._x = x; G.dots[i].style.transform = `translateX(${x}px)`; }
  });
  if (G.bossDot) {
    const B = s.boss, on = B.on && !B.down;
    G.bossDot.hidden = !on;
    $('#hud-boss').hidden = !on;
    if (on) {
      G.bossDot.style.transform = `translateX(${Math.round(clamp(B.s / L.length, 0, 1) * W)}px)`;
      const gap = Math.max(0, Math.round(s.player.s - B.s - P.BOSS_R - P.R));
      const el = $('#hud-boss-gap');
      if (el.dataset.g !== String(gap)) { el.dataset.g = String(gap); el.textContent = `${gap} m`; $('#hud-boss').classList.toggle('close', gap < 4); }
    }
  }
  // Power-up timers.
  for (const el of G.powerEls || (G.powerEls = [...document.querySelectorAll('#hud-powers .pw')])) {
    const k = el.dataset.k, left = s.power[k];
    el.hidden = !(left > 0);
    if (left > 0) el.lastElementChild.firstElementChild.style.transform = `scaleX(${(left / P.POWER_T[k]).toFixed(3)})`;
  }
  if (L.race) {
    const r = s.player.finished ? s.player.place : s.rank();
    const el = $('#hud-place');
    if (el.dataset.r !== String(r)) {
      el.dataset.r = String(r);
      const sm = document.createElement('small');
      sm.textContent = `${ord(r).toUpperCase()} / ${s.balls.length}`;
      el.replaceChildren(String(r), sm);
    }
  }
}
function bumpCoins() {
  const el = $('#hud-coin-n');
  el.textContent = String(G.coins);
  const pill = $('#hud-coins');
  pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump');
}
function flash(text, small) {
  const f = $('#flash');
  f.hidden = true;
  f.textContent = text;
  f.className = 'flash' + (small ? ' small' : '');
  void f.offsetWidth;
  f.hidden = false;
  clearTimeout(G.flashTimer);
  G.flashTimer = setTimeout(() => { f.hidden = true; }, small ? 1100 : 1600);
}
function showCount(text, go) {
  const el = $('#count');
  el.className = 'count' + (go ? ' go' : '');
  el.replaceChildren();
  const s = document.createElement('span');
  s.textContent = text;
  el.append(s);
  el.hidden = false;
  clearTimeout(G.countTimer);
  G.countTimer = setTimeout(() => { el.hidden = true; }, go ? 650 : 900);
}

function handleEvents(quiet) {
  const s = G.sim, pp = s.player.body.translation();
  for (const e of s.events) {
    switch (e.type) {
      case 'coin': {
        const c = s.coins[e.i];
        view.coinFx(c);
        if (quiet) break;
        // Gems are worth five; the x2 power-up doubles everything.
        const val = (c.gem ? 5 : 1) * (s.power.x2 > 0 ? 2 : 1);
        G.coins += val;
        Save.data.stats.coins += val;
        if (c.gem) Save.data.stats.gems++;
        G.combo = s.t - G.comboT < 1.2 ? G.combo + 1 : 0;
        G.comboT = s.t;
        if (c.gem) { Sound.gem(); flash(`+${val}`, true); buzz(15); } else Sound.coin(Math.min(12, G.combo));
        bumpCoins();
        break;
      }
      case 'power': view.powerFx(s.powerups[e.i]); if (!quiet) { Sound.power(); flash(POWER_NAMES[e.kind], true); buzz([20, 30, 20]); } break;
      case 'shield': view.shieldFx(pp); if (!quiet) { Sound.shield(); flash('SAVED!', true); buzz(40); } break;
      case 'smash': view.smashFx(e.o); if (!quiet) { Sound.smash(); buzz(30); } break;
      case 'shatter': view.shatterFx(e.o); if (!quiet && e.near) Sound.glass(); break;
      case 'speed': view.boostFx(pp); if (!quiet) { Sound.speedPad(G.padN = (G.padN || 0) + 1); buzz(15); } break;
      case 'bonus':
        if (G.result) G.result.mult = e.mult;
        G.bonusWait = false;
        G.bonusAt = G.phaseT;
        if (!quiet) { flash(`x${e.mult}`); Sound.bonus(e.mult); buzz([30, 30, 30]); }
        break;
      case 'boost': view.boostFx(pp); if (!quiet) { Sound.boost(); buzz(15); } break;
      case 'pad': view.padFx(pp); if (!quiet) Sound.pad(); break;
      case 'hit': view.hitFx(pp, e.s); if (!quiet) { Sound.hit(e.s); if (e.s > 9) buzz(20); } break;
      case 'bump': view.bumpFx(e.o); if (!quiet) { Sound.bump(); buzz(12); } break;
      case 'crack': if (!quiet) Sound.crack(); break;
      case 'fall': view.fallFx(); if (!quiet) { Sound.fall(); buzz(60); Save.data.stats.falls++; achievements(); } break;
      case 'loop': if (!quiet) { Sound.loop(); flash('LOOP!', true); Save.data.stats.loops++; achievements(); } break;
      case 'pipe': if (!quiet) { Save.data.stats.pipes++; achievements(); } break;
      case 'cannon': {
        const near = Math.abs(e.o.s - s.player.s) < 25;
        view.cannonFx(e.o, near);
        if (near && !quiet) { Sound.cannon(); if (Math.abs(e.o.s - s.player.s) < 8) buzz(20); }
        break;
      }
      case 'respawn': view.respawnFx(pp); if (!quiet) Sound.respawn(); break;
      case 'checkpoint': view.checkpointFx(e.index); if (!quiet) { Sound.checkpoint(); flash('CHECKPOINT', true); } break;
      case 'finish': if (e.player && !quiet && G.phase === 'play') onFinish(e.place); break;
      case 'boss': if (!quiet) { Sound.roar(); Sound.music(BOSS_SONG, true); flash('RUN!'); buzz([60, 40, 60]); } break;
      case 'squash': view.squashFx(pp); if (!quiet) { Sound.squash(); buzz(120); flash('SQUASHED!', true); Save.data.stats.falls++; achievements(); } break;
      case 'bossDown': view.bossDownFx(); if (!quiet) Sound.bossDown(); break;
      default: break;
    }
  }
  s.events.length = 0;
}

/* ---------------- input: hold to roll, slide to steer, pull back to stop or reverse ---------------- */
// Sideways, the marble follows the thumb: sliding across about half the screen spans the track.
// Downwards, the thumb sets the speed: where it landed is full ahead, about 1.5 cm lower is a
// standstill and further down rolls backwards. Sliding up re-anchors, so pulling back always
// responds at once.
const PULL = 52;
const In = { down: false, id: null, x0: 0, x: 0, y0: 0, y: 0, u0: 0, ut: 0, keys: new Set() };
const pad = $('#steer'), knob = pad.querySelector('i'), padLabel = pad.querySelector('b');
function endTouch() { In.down = false; In.id = null; pad.hidden = true; }
function showPad(half, throttle) {
  const x = clamp(In.ut / Math.max(0.5, half), -1, 1) * 70, y = (1 - throttle) * 14 - 14;
  knob.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  const state = throttle > 0.25 ? 'go' : throttle > -0.25 ? 'stop' : 'back';
  if (pad.dataset.state !== state) {
    pad.dataset.state = state;
    padLabel.textContent = state === 'go' ? '' : state === 'stop' ? 'Stop' : 'Reverse';
  }
}
window.addEventListener('pointerdown', (e) => {
  if (e.target.closest && e.target.closest('button, a, .dim')) return;
  if (G.phase === 'ready') startRun();
  if (!['count', 'play', 'won'].includes(G.phase) || In.down) return;
  In.down = true;
  In.id = e.pointerId;
  In.x0 = In.x = e.clientX;
  In.y0 = In.y = e.clientY;
  In.u0 = In.ut = G.sim.player.u;
  pad.hidden = false;
});
window.addEventListener('pointermove', (e) => {
  if (!In.down || e.pointerId !== In.id) return;
  In.x = e.clientX;
  In.y = e.clientY;
  if (In.y < In.y0) In.y0 = In.y;
  else if (In.y - In.y0 > PULL * 2) In.y0 = In.y - PULL * 2;
});
const lift = (e) => { if (In.down && e.pointerId === In.id) endTouch(); };
window.addEventListener('pointerup', lift);
window.addEventListener('pointercancel', lift);
const KEYS = { ArrowUp: 'u', KeyW: 'u', Space: 'u', ArrowDown: 'd', KeyS: 'd', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r' };
window.addEventListener('keydown', (e) => {
  const k = KEYS[e.code];
  if (k) {
    if (!G.demo) e.preventDefault();
    In.keys.add(k);
    if (G.phase === 'ready') startRun();
  } else if (e.code === 'Escape' || e.code === 'KeyP') {
    if (G.phase === 'paused') resume(); else pause();
  }
});
window.addEventListener('keyup', (e) => { const k = KEYS[e.code]; if (k) In.keys.delete(k); });
window.addEventListener('blur', () => In.keys.clear());
// { throttle: 1 ahead .. 0 stop .. -1 reverse, steer: -1..1, active: is anything pressed }
function input() {
  const K = In.keys, ks = (K.has('r') ? 1 : 0) - (K.has('l') ? 1 : 0), kf = (K.has('u') ? 1 : 0) - (K.has('d') ? 1 : 0);
  let steer = ks, throttle = 0, active = false;
  if (K.has('u') || K.has('d')) { active = true; throttle = kf; }
  if (In.down) {
    const b = G.sim.player, w = b.frame.w, half = Math.max(0, w / 2 - 0.45);
    if (!K.has('u') && !K.has('d')) { active = true; throttle = clamp(1 - (In.y - In.y0) / PULL, -1, 1); }
    if (!ks) {
      const k = Math.max(4.5, w) / (window.innerWidth * 0.55);
      let ut = In.u0 + (In.x - In.x0) * k;
      // Past the edge, slide the anchor so moving back responds at once.
      if (ut > half) { In.u0 -= ut - half; ut = half; } else if (ut < -half) { In.u0 += -half - ut; ut = -half; }
      In.ut = ut;
      steer = clamp((ut - b.u) * 1.6, -1, 1);
    }
    showPad(half, throttle);
  }
  return { throttle, steer, active };
}

/* ---------------- settings ---------------- */
const QUALITIES = ['auto', 'high', 'medium', 'low'];
function applyQuality() { view.setQuality(Save.data.quality === 'auto' ? Save.data.autoQ2 : Save.data.quality); }
function qualityLabel() { return `Graphics: ${Save.data.quality}${Save.data.quality === 'auto' ? ` (${Save.data.autoQ2})` : ''}`; }
function cycleQuality() {
  Save.data.quality = QUALITIES[(QUALITIES.indexOf(Save.data.quality) + 1) % QUALITIES.length];
  if (Save.data.quality === 'auto') Save.data.autoQ2 = 'high';
  Save.save();
  applyQuality();
  refreshTitle();
}
function toggleSound() { Save.data.muted = !Save.data.muted; Sound.setMuted(Save.data.muted); Save.save(); refreshTitle(); }
let wakeLock = null;
function keepAwake() {
  if (!('wakeLock' in navigator) || wakeLock) return;
  navigator.wakeLock.request('screen').then((l) => { wakeLock = l; l.addEventListener('release', () => { wakeLock = null; }); }).catch(() => {});
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pause(); Save.save(); } else if (!G.demo) keepAwake();
});

window.addEventListener('resize', () => { G.barW = 0; (G.dots || []).forEach((d) => { d._x = -1; }); });

/* ---------------- main loop ---------------- */
function tick(dt) {
  const s = G.sim;
  G.phaseT += dt;
  switch (G.phase) {
    case 'title': case 'shop': case 'levels': case 'ach': case 'daily':
      s.step(dt, {});
      handleEvents(true);
      if (s.player.finished || s.t > 100) { G.demoEnd += dt; if (G.demoEnd > 2.5) loadLevel(G.n, true); }
      break;
    case 'count': {
      const n = 3 - Math.floor(G.phaseT / 0.6);
      if (n !== G.count) {
        G.count = n;
        if (n > 0) { showCount(String(n), false); Sound.beep(false); }
        else { showCount('GO!', true); Sound.beep(true); setPhase('play'); if (!G.t0) G.t0 = s.t; }
      }
      break;
    }
    case 'play': {
      s.step(dt, input());
      handleEvents(false);
      const rt = s.t - G.t0;
      if (G.rec && rt * GHOST_HZ >= G.rec.length / 3) { const p = s.player.body.translation(); G.rec.push(p.x, p.y, p.z); }
      // Auto graphics: after a 2 s warm-up, average 4 s of real frame times; step down only if slow.
      if (Save.data.quality === 'auto' && Save.data.autoQ2 !== 'low') {
        G.fpsT += dt;
        if (G.fpsT > 2) G.fpsN++;
        if (G.fpsT >= 6) {
          const fps = G.fpsN / (G.fpsT - 2);
          G.fpsT = 0; G.fpsN = 0;
          if (fps < 42) { Save.data.autoQ2 = Save.data.autoQ2 === 'high' ? 'medium' : 'low'; Save.save(); applyQuality(); }
        }
      }
      break;
    }
    case 'won':
      // On the bonus run you keep steering until you land (or 8 s pass).
      s.step(dt, G.bonusWait ? input() : {});
      handleEvents(false);
      if (G.bonusWait && G.phaseT > 8) { G.bonusWait = false; G.bonusAt = G.phaseT; }
      if (!G.bonusWait && G.phaseT > 2.2 && G.phaseT - G.bonusAt > (G.L.bonus ? 1.6 : 0)) completePanel();
      if (!G.bonusWait) endTouch();
      break;
    case 'complete':
      s.step(dt, {});
      handleEvents(true);
      break;
    default: break; // ready (waiting for a touch) and paused
  }
  // The demo may have just restarted with a fresh simulation: draw that one, not the old one.
  view.ghostT = G.phase === 'play' || G.phase === 'won' ? G.sim.t - G.t0 : 0;
  view.frame(dt, G.sim, ['title', 'shop', 'levels', 'ach', 'daily'].includes(G.phase) ? 'title' : G.phase);
  if (!G.demo) hud();
}

let last = performance.now(), fpsT = 0, fpsN = 0, fps = 0;
function loop(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  try { tick(dt); } catch (err) { console.error(err); }
  if (DEBUG) {
    fpsT += dt; fpsN++;
    if (fpsT > 0.5) { fps = fpsN / fpsT; fpsT = 0; fpsN = 0; }
    const b = G.sim.player, v = b.body.linvel();
    $('#debug').textContent = `${fps.toFixed(0)} fps  ${G.phase}  L${G.n} ${G.L.plan.join(',')}\ns ${b.s.toFixed(1)}/${G.L.length.toFixed(0)}  u ${b.u.toFixed(2)}  v ${Math.hypot(v.x, v.z).toFixed(1)}  q ${view.quality}`;
  }
  requestAnimationFrame(loop);
}

/* ---------------- boot ---------------- */
$('#btn-play').addEventListener('click', () => play(Save.data.level));
$('#btn-shop').addEventListener('click', () => { Sound.init(); Sound.tap(); Sound.music(MENU_SONG); openShop(); });
$('#btn-levels').addEventListener('click', () => { Sound.init(); Sound.tap(); openLevels(); });
$('#btn-shop-back').addEventListener('click', () => { Sound.tap(); refreshTitle(); setPhase('title'); });
$('#btn-levels-back').addEventListener('click', () => { Sound.tap(); setPhase('title'); });
$('#btn-ach').addEventListener('click', () => { Sound.init(); Sound.tap(); openTrophies(); });
$('#btn-ach-back').addEventListener('click', () => { Sound.tap(); setPhase('title'); });
$('#btn-daily').addEventListener('click', () => {
  Sound.init();
  const got = collectDaily(Save.data);
  Sound.daily();
  buzz([20, 30, 20]);
  achievements();
  refreshTitle();
  setPhase('title');
  if (got) flash(`+${got}`, true);
});
$('#btn-pause').addEventListener('click', () => { Sound.tap(); pause(); });
$('#btn-sound').addEventListener('click', () => { Sound.init(); toggleSound(); Sound.tap(); Sound.music(MENU_SONG); });
$('#btn-quality').addEventListener('click', () => { cycleQuality(); Sound.init(); Sound.tap(); });

async function boot() {
  try {
    await RAPIER.init();
    view = new View($('#view'));
  } catch (err) {
    console.error(err);
    const l = $('#loading');
    l.classList.add('err');
    l.textContent = 'This browser could not start the 3D game. Try the latest Safari or Chrome.';
    return;
  }
  applyQuality();
  view.setTrail(Save.data.trail);
  if (document.fonts && document.fonts.load) await Promise.race([document.fonts.load('64px Bungee').catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
  $('#debug').hidden = !DEBUG;
  toTitle();
  $('#loading').hidden = true;
  requestAnimationFrame(loop);
  window.MR = { G, Save, play, view };
}
boot();
