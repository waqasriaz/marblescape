/* Marblescape — achievements, the daily reward and best-run ghosts. Works on the save data object. */

const starsTotal = (S) => Object.values(S.stars || {}).reduce((a, s) => a + s, 0);
const bosses = (S) => Object.keys(S.bossBeat || {}).length;
const extras = (S) => (S.ownedTrails || []).length - 1 + (S.ownedFx || []).length - 1;

// Each achievement reads one number from the save and unlocks when it reaches `goal`.
export const ACH = [
  { id: 'first', name: 'First Roll', desc: 'Finish level 1.', reward: 50, goal: 2, val: (S) => S.level },
  { id: 'flawless', name: 'Flawless', desc: 'Finish a level without falling.', reward: 50, goal: 1, val: (S) => S.stats.flawless },
  { id: 'pipe', name: 'Half-pipe Hero', desc: 'Ride a half-pipe.', reward: 50, goal: 1, val: (S) => S.stats.pipes },
  { id: 'loop', name: 'Loop the Loop', desc: 'Ride a loop all the way round.', reward: 100, goal: 1, val: (S) => S.stats.loops },
  { id: 'win', name: 'Podium', desc: 'Win a race.', reward: 100, goal: 1, val: (S) => S.stats.wins },
  { id: 'ghost', name: 'Beat Yourself', desc: 'Beat your own ghost on a level.', reward: 100, goal: 1, val: (S) => S.stats.ghostBeats },
  { id: 'skins3', name: 'Fashionista', desc: 'Own 3 skins.', reward: 100, goal: 3, val: (S) => S.owned.length },
  { id: 'coins500', name: 'Pocket Money', desc: 'Pick up 500 coins on the track.', reward: 100, goal: 500, val: (S) => S.stats.coins },
  { id: 'world2', name: 'Explorer', desc: 'Reach Ocean Bay.', reward: 100, goal: 6, val: (S) => S.level },
  { id: 'boss1', name: 'Boss Slayer', desc: 'Outrun your first boss.', reward: 150, goal: 1, val: bosses },
  { id: 'x5', name: 'Bullseye', desc: 'Land on x5 at the end of a level.', reward: 150, goal: 1, val: (S) => S.stats.x5 },
  { id: 'gems50', name: 'Gem Hunter', desc: 'Collect 50 gems.', reward: 300, goal: 50, val: (S) => S.stats.gems },
  { id: 'style', name: 'Show-off', desc: 'Own 3 trails or celebrations.', reward: 150, goal: 3, val: extras },
  { id: 'falls100', name: 'Gravity Fan', desc: 'Fall off 100 times.', reward: 100, goal: 100, val: (S) => S.stats.falls },
  { id: 'stars30', name: 'Star Collector', desc: 'Earn 30 stars.', reward: 200, goal: 30, val: starsTotal },
  { id: 'world4', name: 'Cloud Walker', desc: 'Reach the Sky Islands.', reward: 250, goal: 21, val: (S) => S.level },
  { id: 'steady', name: 'Steady Hands', desc: 'Finish 10 levels without falling.', reward: 300, goal: 10, val: (S) => S.stats.flawless },
  { id: 'win5', name: 'Champion', desc: 'Win 5 races.', reward: 300, goal: 5, val: (S) => S.stats.wins },
  { id: 'daily7', name: 'Regular', desc: 'Collect the daily reward 7 days in a row.', reward: 300, goal: 7, val: (S) => S.daily.best || 0 },
  { id: 'world5', name: 'Night Rider', desc: 'Reach Neon City.', reward: 300, goal: 26, val: (S) => S.level },
  { id: 'world6', name: 'Fire Walker', desc: 'Reach the Volcano.', reward: 400, goal: 31, val: (S) => S.level },
  { id: 'world8', name: 'Astronaut', desc: 'Reach the Space Station.', reward: 500, goal: 36, val: (S) => S.level },
  { id: 'skins10', name: 'Collector', desc: 'Own 10 skins.', reward: 400, goal: 10, val: (S) => S.owned.length },
  { id: 'coins5000', name: 'Treasure Hunter', desc: 'Pick up 5,000 coins on the track.', reward: 500, goal: 5000, val: (S) => S.stats.coins },
  { id: 'level50', name: 'Marathon', desc: 'Reach level 50.', reward: 800, goal: 50, val: (S) => S.level },
  { id: 'boss8', name: 'Legend', desc: 'Outrun all 8 bosses.', reward: 1000, goal: 8, val: bosses },
];

export function fillDefaults(S) {
  S.stats = Object.assign({ coins: 0, falls: 0, wins: 0, flawless: 0, loops: 0, pipes: 0, ghostBeats: 0, gems: 0, x5: 0 }, S.stats);
  S.ach = S.ach || {};
  S.best = S.best || {};
  S.daily = Object.assign({ last: '', streak: 0, best: 0 }, S.daily);
  S.ghosts = S.ghosts || [];
  S.bossBeat = S.bossBeat || {};
  S.ownedTrails = S.ownedTrails || ['skin'];
  S.trail = S.trail || 'skin';
  S.ownedFx = S.ownedFx || ['confetti'];
  S.fx = S.fx || 'confetti';
}

export function progress(S, a) {
  const v = Math.min(a.goal, a.val(S) || 0);
  return { v, done: !!S.ach[a.id] };
}

// Unlocks whatever is newly earned, pays out the coins, and returns the new ones.
export function checkAchievements(S) {
  const fresh = [];
  for (const a of ACH) {
    if (S.ach[a.id] || (a.val(S) || 0) < a.goal) continue;
    S.ach[a.id] = true;
    S.coins += a.reward;
    fresh.push(a);
  }
  return fresh;
}

/* ---------------- daily reward: a seven-day streak ---------------- */
export const DAILY = [50, 80, 120, 160, 220, 300, 500];
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

// Is a reward waiting today, and which day of the streak is it?
export function dailyState(S, now = new Date()) {
  const today = dayKey(now), yesterday = dayKey(new Date(now.getTime() - 86400000));
  if (S.daily.last === today) return { due: false, day: S.daily.streak };
  const day = S.daily.last === yesterday ? (S.daily.streak % 7) + 1 : 1;
  return { due: true, day, amount: DAILY[day - 1] };
}
export function collectDaily(S, now = new Date()) {
  const st = dailyState(S, now);
  if (!st.due) return 0;
  S.daily.last = dayKey(now);
  S.daily.streak = st.day;
  S.daily.best = Math.max(S.daily.best || 0, st.day);
  S.coins += st.amount;
  return st.amount;
}

/* ---------------- ghosts: your best run on each level, replayed alongside you ---------------- */
export const GHOST_HZ = 15;
const KEEP = 40;
const gkey = (n) => `marblescape.ghost.${n}`;

export function loadGhost(n) {
  try {
    const g = JSON.parse(localStorage.getItem(gkey(n)) || 'null');
    return g && g.p && g.p.length >= 6 ? g : null;
  } catch (e) { return null; }
}
export function saveGhost(S, n, time, pts) {
  try {
    localStorage.setItem(gkey(n), JSON.stringify({ t: time, hz: GHOST_HZ, p: pts.map((v) => Math.round(v * 100) / 100) }));
    S.ghosts = S.ghosts.filter((x) => x !== n).concat(n);
    while (S.ghosts.length > KEEP) localStorage.removeItem(gkey(S.ghosts.shift()));
  } catch (e) { /* storage full or blocked: skip the ghost */ }
}
