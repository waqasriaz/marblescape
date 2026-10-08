/*
 * Marble Scape — race simulation on top of Rapier.
 * No DOM and no three.js: the game and tools/levels.mjs both drive it.
 * RAPIER is passed in so the browser can use the ES build and Node the CommonJS one.
 */
import { mulberry32 } from './gen.js';

export const P = {
  R: 0.6,            // ball radius
  G: 24,             // gravity
  FWD: 10.5,         // cruising speed while holding
  ACC: 17,           // forward acceleration
  REV: 6,            // top reverse speed
  SPEED_K: 8,        // how firmly the ball chases the speed the thumb asks for
  LAT: 6.5,          // sideways speed at full steer
  LAT_K: 9,          // how quickly sideways speed follows the stick
  LAT_MAX: 28,
  BRAKE: 3.5,        // slow-down when the thumb is lifted
  AIR: 0.35,         // share of control in the air
  CAP: 21,
  BOOST: 17,
  PAD_VY: 13.5,
  PAD_FWD: 8.5,
  LOOP_V: 13,        // the loop keeps you at least this fast
  LOOP_PRESS: 30,    // and presses you onto its surface
  FALL: 7,           // this far below the track counts as a fall
  RESPAWN: 1.0,
  HZ: 120,
  BOSS_R: 1.7,       // the boss ball's radius
  BOSS_GAP: 15,      // how far behind you it appears (out of sight, then it rolls up)
  SPEED_PAD: 2.3,    // each bonus-run speed pad adds this much
  GLASS_V: 7.5,      // hit a glass pane at least this fast and it shatters
  POWER_T: { magnet: 8, x2: 8, shield: 15 },
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const qY = (a) => ({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });
const qAxis = (x, y, z, a) => { const s = Math.sin(a / 2); return { x: x * s, y: y * s, z: z * s, w: Math.cos(a / 2) }; };
const qMul = (a, b) => ({
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
});
const fwdOf = (yaw) => [Math.sin(yaw), Math.cos(yaw)];
const rightOf = (yaw) => [-Math.cos(yaw), Math.sin(yaw)];
const ease = (k) => k * k * (3 - 2 * k);

export class Sim {
  constructor(R, L, opts = {}) {
    this.R = R;
    this.L = L;
    this.t = 0;
    this.acc = 0;
    this.events = [];
    this.finishCount = 0;
    this.G = L.world.gravity || P.G;
    const world = (this.world = new R.World({ x: 0, y: -this.G, z: 0 }));
    world.timestep = 1 / P.HZ;
    const flags = R.TriMeshFlags ? R.TriMeshFlags.FIX_INTERNAL_EDGES : undefined;
    const mesh = (m) => R.ColliderDesc.trimesh(new Float32Array(m.pos), new Uint32Array(m.idx), flags);
    for (const st of L.strips) world.createCollider(mesh(st.phys).setFriction(1.0).setRestitution(0.05));
    for (const rl of L.rails) world.createCollider(mesh(rl).setFriction(0.2).setRestitution(0.3));
    for (const tb of L.tubes || []) world.createCollider(mesh(tb).setFriction(0.2).setRestitution(0.1));

    this.obs = L.obstacles.map((o) => this.makeObstacle(o));
    this.platforms = this.obs.filter((o) => o.type === 'platform');
    this.bumpers = this.obs.filter((o) => o.type === 'bumper');
    this.swings = this.obs.filter((o) => o.type === 'swing');
    this.walls = this.obs.filter((o) => o.type === 'bricks' || o.type === 'glass');
    this.panes = this.obs.filter((o) => o.type === 'glass');
    this.tiles = L.tiles.map((t) => {
      const body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(t.x, t.y - 0.25, t.z).setRotation(qY(t.yaw)));
      world.createCollider(R.ColliderDesc.cuboid(t.hw, 0.25, t.hl).setFriction(1.0), body);
      return { t, body, at: -1, gone: false };
    });

    // Balls: the player, plus three rivals on race levels.
    this.balls = [];
    const lanes = L.race ? [-0.7, -2.1, 0.7, 2.1] : [0];
    lanes.forEach((lane, i) => this.balls.push(this.makeBall(lane, i === 0)));
    this.player = this.balls[0];
    this.player.ai = !!opts.autopilot;
    const rr = mulberry32(L.n * 31 + 7);
    for (const b of this.balls.slice(1)) { b.ai = true; b.baseK = 0.86 + rr() * 0.12; b.speedK = b.baseK; }
    this.coins = L.coins.map((c) => Object.assign({ taken: false }, c));
    this.powerups = (L.powerups || []).map((q) => Object.assign({ taken: false }, q));
    this.power = { magnet: 0, x2: 0, shield: 0 };   // seconds left on the player's power-ups
    this.loops = L.zones.filter((z) => z.type === 'loop');
    // Boss levels: a giant ball rolls after the player through the chase.
    this.boss = L.chase ? { s: 0, v: 0, on: false, down: false, roll: 0 } : null;
  }

  makeBall(lane, isPlayer) {
    const R = this.R, cp = this.L.checkpoints[0];
    const p = this.spawnPoint(cp, lane);
    const body = this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(p[0], p[1], p[2])
      .setCcdEnabled(true).setLinearDamping(0.05).setAngularDamping(0.35).setCanSleep(false));
    const col = this.world.createCollider(R.ColliderDesc.ball(P.R).setFriction(1.1).setRestitution(0.15).setDensity(1.0), body);
    return {
      body, col, player: isPlayer, lane, ai: false, speedK: 1,
      idx: cp.i, s: cp.s, u: 0, frame: cp, grounded: false, support: null, supportBody: null,
      fallT: -1, cp: 0, finished: false, place: 0, falls: 0, inBoost: false, padT: -1,
      last: { x: 0, y: 0, z: 0 }, hold: 0, steer: 0,
    };
  }

  spawnPoint(cp, lane) {
    const [rx, rz] = rightOf(cp.yaw);
    return [cp.x + rx * lane, cp.y + P.R + 0.15, cp.z + rz * lane];
  }

  makeObstacle(o) {
    const R = this.R, w = this.world;
    const kin = (x, y, z, rot) => w.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z).setRotation(rot || qY(o.yaw || 0)));
    const [fx, fz] = fwdOf(o.yaw || 0), [rx, rz] = rightOf(o.yaw || 0);
    switch (o.type) {
      case 'spinner': {
        const body = kin(o.x, o.y + 0.5, o.z, qY(o.yaw + o.phase));
        w.createCollider(R.ColliderDesc.cuboid(o.len / 2, 0.17, 0.17).setFriction(0.2).setRestitution(0.5), body);
        w.createCollider(R.ColliderDesc.cylinder(0.65, 0.3).setTranslation(o.x, o.y + 0.65, o.z));
        return { type: o.type, o, body, update: (t) => body.setNextKinematicRotation(qY(o.yaw + o.phase + o.speed * t)) };
      }
      case 'pendulum': {
        const pivot = [o.x, o.y + o.height, o.z];
        const pos = (t) => {
          const th = o.amp * Math.sin(o.speed * t + o.phase);
          return [pivot[0] + rx * Math.sin(th) * o.arm, pivot[1] - Math.cos(th) * o.arm, pivot[2] + rz * Math.sin(th) * o.arm];
        };
        const p0 = pos(0);
        const body = kin(p0[0], p0[1], p0[2]);
        w.createCollider(R.ColliderDesc.ball(o.head).setFriction(0.3).setRestitution(0.6), body);
        const headU = (t) => Math.sin(o.amp * Math.sin(o.speed * t + o.phase)) * o.arm;
        return { type: o.type, o, body, pivot, headU, update: (t) => { const p = pos(t); body.setNextKinematicTranslation({ x: p[0], y: p[1], z: p[2] }); } };
      }
      case 'pusher': {
        const [lx, hy, lz] = o.size;
        const at = (t) => {
          const k = 0.5 - 0.5 * Math.cos(o.speed * t + o.phase);
          const u = o.side * (o.w / 2 + lx / 2 + 0.1 - k * (o.reach + 0.1));
          return [o.x + rx * u, o.y + hy / 2, o.z + rz * u];
        };
        const p0 = at(0);
        const body = kin(p0[0], p0[1], p0[2]);
        w.createCollider(R.ColliderDesc.cuboid(lx / 2, hy / 2, lz / 2).setFriction(0.3).setRestitution(0.2), body);
        return { type: o.type, o, body, update: (t) => { const p = at(t); body.setNextKinematicTranslation({ x: p[0], y: p[1], z: p[2] }); } };
      }
      case 'slider': {
        const at = (t) => {
          const u = (o.w / 2 - o.len / 2) * Math.sin(o.speed * t + o.phase);
          return [o.x + rx * u, o.y + 0.55, o.z + rz * u];
        };
        const p0 = at(0);
        const body = kin(p0[0], p0[1], p0[2]);
        w.createCollider(R.ColliderDesc.cuboid(o.len / 2, 0.55, 0.2).setFriction(0.3).setRestitution(0.2), body);
        const uAt = (t) => (o.w / 2 - o.len / 2) * Math.sin(o.speed * t + o.phase);
        return { type: o.type, o, body, uAt, update: (t) => { const p = at(t); body.setNextKinematicTranslation({ x: p[0], y: p[1], z: p[2] }); } };
      }
      case 'platform': {
        // Shuttles across the gap: wait at the near edge, glide, wait at the far edge, glide back.
        const offset = (t) => {
          const k = (((t / o.period + o.phase) % 1) + 1) % 1;
          const span = o.gap - o.len;
          const pos = k < 0.25 ? 0 : k < 0.5 ? ease((k - 0.25) * 4) : k < 0.75 ? 1 : 1 - ease((k - 0.75) * 4);
          return o.len / 2 + span * pos;
        };
        const at = (t) => { const a = offset(t); return [o.x + fx * a, o.y - 0.25, o.z + fz * a]; };
        const p0 = at(0);
        const body = kin(p0[0], p0[1], p0[2]);
        w.createCollider(R.ColliderDesc.cuboid(o.w / 2, 0.25, o.len / 2).setFriction(1.2), body);
        return { type: o.type, o, body, offset, update: (t) => { const p = at(t); body.setNextKinematicTranslation({ x: p[0], y: p[1], z: p[2] }); } };
      }
      case 'disc': {
        const c = [o.x + fx * (o.gap / 2), o.y - 0.3, o.z + fz * (o.gap / 2)];
        const body = kin(c[0], c[1], c[2], qY(0));
        w.createCollider(R.ColliderDesc.cylinder(0.3, o.r).setFriction(1.2), body);
        return { type: o.type, o, body, update: (t) => body.setNextKinematicRotation(qY(o.speed * t)) };
      }
      case 'bumper': {
        w.createCollider(R.ColliderDesc.cylinder(0.5, o.r).setTranslation(o.x, o.y + 0.5, o.z)
          .setFriction(0).setRestitution(1.3).setRestitutionCombineRule(R.CoefficientCombineRule.Max));
        return { type: o.type, o, body: null, cool: 0, update() {} };
      }
      case 'boulders': {
        const rnd = mulberry32(o.seed);
        const live = [];
        const ob = { type: o.type, o, body: null, live, next: 1, update: (t) => {
          if (t >= ob.next) {
            ob.next = t + o.every;
            const u = (rnd() - 0.5) * (o.w - 2 * o.r - 0.4);
            const b = w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(o.x + rx * u + fx * 1.5, o.y + o.r + 0.6, o.z + rz * u + fz * 1.5)
              .setLinvel(-fx * 3, 0, -fz * 3).setCcdEnabled(true));
            w.createCollider(R.ColliderDesc.ball(o.r).setDensity(2.5).setFriction(1).setRestitution(0.2), b);
            live.push({ body: b, born: t });
          }
          for (let i = live.length - 1; i >= 0; i--) {
            if (t - live[i].born > 6) { w.removeRigidBody(live[i].body); live.splice(i, 1); }
          }
        } };
        return ob;
      }
      case 'windmill': {
        // Four blades on a hub above the track, turning about the track's direction.
        const body = kin(o.x, o.y + o.hub, o.z, qY(o.yaw));
        for (let k = 0; k < 4; k++) {
          const a = (k * Math.PI) / 2;
          w.createCollider(R.ColliderDesc.cuboid(o.len / 2, 0.16, 0.22).setTranslation((Math.cos(a) * o.len) / 2, (Math.sin(a) * o.len) / 2, 0)
            .setRotation(qAxis(0, 0, 1, a)).setFriction(0.2).setRestitution(0.5), body);
        }
        const ang = (t) => o.phase + o.speed * t;
        return { type: o.type, o, body, ang, update: (t) => body.setNextKinematicRotation(qMul(qY(o.yaw), qAxis(0, 0, 1, ang(t)))) };
      }
      case 'pillar': {
        // Hidden in the slab, then rises: down 40% of the time, up 40%, moving in between.
        const top = (t) => {
          const f = (((t / o.period + o.phase) % 1) + 1) % 1;
          const k = f < 0.4 ? 0 : f < 0.5 ? ease((f - 0.4) * 10) : f < 0.9 ? 1 : 1 - ease((f - 0.9) * 10);
          return o.y - 0.05 + k * o.rise;
        };
        const body = kin(o.x, top(0) - 0.75, o.z, qY(o.yaw));
        w.createCollider(R.ColliderDesc.cuboid(o.size / 2, 0.75, o.size / 2).setFriction(0.8), body);
        return { type: o.type, o, body, top, update: (t) => body.setNextKinematicTranslation({ x: o.x, y: top(t) - 0.75, z: o.z }) };
      }
      case 'seesaw': {
        const c = [o.x + fx * (o.gap / 2), o.y - 0.25, o.z + fz * (o.gap / 2)];
        const body = kin(c[0], c[1], c[2], qY(o.yaw));
        w.createCollider(R.ColliderDesc.cuboid(o.bw / 2, 0.25, o.gap / 2 + 0.4).setFriction(1.2), body);
        return { type: o.type, o, body, update: (t) => body.setNextKinematicRotation(qMul(qY(o.yaw), qAxis(0, 0, 1, o.amp * Math.sin(o.speed * t + o.phase)))) };
      }
      case 'hammer': {
        // Pivots at the track edge: stands up, slams down across the track, lies there, lifts again.
        const sd = o.side, u0 = sd * (o.w / 2 + 0.35);
        const ang = (t) => {
          const k = (((t / o.period + o.phase) % 1) + 1) % 1;
          const a = k < 0.5 ? 0 : k < 0.58 ? ((k - 0.5) / 0.08) ** 2 : k < 0.78 ? 1 : k < 0.96 ? 1 - ease((k - 0.78) / 0.18) : 0;
          return (a * Math.PI) / 2;
        };
        const rot = (t) => qMul(qY(o.yaw), qAxis(0, 0, 1, -sd * ang(t)));
        const body = kin(o.x + rx * u0, o.y + 0.75, o.z + rz * u0, rot(0));
        w.createCollider(R.ColliderDesc.cuboid(0.18, o.len / 2, 0.18).setTranslation(0, o.len / 2, 0).setFriction(0.3), body);
        w.createCollider(R.ColliderDesc.cuboid(0.55, 0.6, 0.85).setTranslation(0, o.len - 0.6, 0).setFriction(0.3).setRestitution(0.4), body);
        return { type: o.type, o, body, ang, update: (t) => body.setNextKinematicRotation(rot(t)) };
      }
      case 'swing': {
        // Hangs from a gantry and swings across the track, staying level; a little higher at the ends of the swing.
        const ang = (t) => o.amp * Math.sin((2 * Math.PI * t) / o.period + o.phase * 2 * Math.PI);
        const uAt = (t) => o.arm * Math.sin(ang(t));
        const at = (t) => {
          const th = ang(t), u = o.arm * Math.sin(th), up = o.arm * (1 - Math.cos(th));
          return [o.x + fx * o.a + rx * u, o.y - 0.37 + up, o.z + fz * o.a + rz * u];
        };
        const p0 = at(0), body = kin(p0[0], p0[1], p0[2]);
        w.createCollider(R.ColliderDesc.cuboid(o.bw / 2, 0.25, o.len / 2).setFriction(1.3), body);
        return { type: o.type, o, body, uAt, ang, update: (t) => { const p = at(t); body.setNextKinematicTranslation({ x: p[0], y: p[1], z: p[2] }); } };
      }
      case 'bricks': {
        // Loose bricks in a running bond, asleep until something hits them.
        const bw = 0.8, bh = 0.45, bd = 0.45, cols = Math.floor(o.w / bw), bricks = [];
        for (let row = 0; row < o.rows; row++) {
          for (let c = 0; c < cols; c++) {
            const u = -((cols - 1) * bw) / 2 + c * bw + (row % 2 ? 0.2 : -0.2);
            const p0 = { x: o.x + rx * u, y: o.y + bh / 2 + row * bh + 0.002, z: o.z + rz * u };
            const body = w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(p0.x, p0.y, p0.z).setRotation(qY(o.yaw)).setSleeping(true).setAngularDamping(0.4));
            w.createCollider(R.ColliderDesc.cuboid(bw / 2 - 0.01, bh / 2, bd / 2).setDensity(1.2).setFriction(0.7).setRestitution(0.05), body);
            bricks.push({ body, p0 });
          }
        }
        const ob = { type: o.type, o, body: null, bricks, hit: false, update: () => {
          for (const br of bricks) {
            // Bricks that tumble off the track go to sleep far below.
            const p = br.body.translation();
            if (p.y < o.y - 25 && !br.body.isSleeping()) { br.body.setLinvel({ x: 0, y: 0, z: 0 }, false); br.body.sleep(); }
          }
        }, reset: () => {
          for (const br of bricks) {
            br.body.setTranslation(br.p0, false);
            br.body.setRotation(qY(o.yaw), false);
            br.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
            br.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
            br.body.sleep();
          }
          ob.hit = false;
        } };
        return ob;
      }
      case 'glass': {
        const make = () => w.createCollider(R.ColliderDesc.cuboid(o.w / 2, 0.9, 0.06).setTranslation(o.x, o.y + 0.9, o.z).setRotation(qY(o.yaw)).setFriction(0.1).setRestitution(0.2));
        const ob = { type: o.type, o, body: null, col: make(), broken: false, update() {}, reset: () => { if (ob.broken) { ob.col = make(); ob.broken = false; } } };
        return ob;
      }
      case 'endwall': {
        w.createCollider(R.ColliderDesc.cuboid(o.w / 2 + 0.3, 1.2, 0.3).setTranslation(o.x, o.y + 1.2, o.z).setRotation(qY(o.yaw)).setFriction(0.5).setRestitution(0.1));
        return { type: o.type, o, body: null, update() {} };
      }
      case 'divider': {
        w.createCollider(R.ColliderDesc.cuboid(0.18, 0.35, o.len / 2).setTranslation(o.x + fx * (o.len / 2), o.y + 0.35, o.z + fz * (o.len / 2))
          .setRotation(qY(o.yaw)).setFriction(0.2).setRestitution(0.3));
        return { type: o.type, o, body: null, update() {} };
      }
      case 'logs': {
        // Logs lying across one half of the ramp roll down at you, left then right.
        const live = [];
        let side = 1;
        const ob = { type: o.type, o, body: null, live, next: 1, update: (t) => {
          if (t >= ob.next) {
            ob.next = t + o.every;
            side = -side;
            const u = (side * o.w) / 4;
            const b = w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(o.x + rx * u + fx * 1.5, o.y + o.r + 0.4, o.z + rz * u + fz * 1.5)
              .setRotation(qMul(qY(o.yaw), qAxis(0, 0, 1, Math.PI / 2))).setLinvel(-fx * 3, 0, -fz * 3).setCcdEnabled(true));
            w.createCollider(R.ColliderDesc.cylinder(o.len / 2, o.r).setDensity(1.5).setFriction(1).setRestitution(0.1), b);
            live.push({ body: b, born: t, u });
          }
          for (let i = live.length - 1; i >= 0; i--) {
            if (t - live[i].born > 5.5) { w.removeRigidBody(live[i].body); live.splice(i, 1); }
          }
        } };
        return ob;
      }
      case 'cannon': {
        // Fires a heavy ball across the track every few seconds.
        const live = [], u0 = o.side * (o.w / 2 + 1.3);
        const ob = { type: o.type, o, body: null, live, next: o.phase, update: (t) => {
          if (t >= ob.next) {
            ob.next = t + o.every;
            const b = w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(o.x + rx * u0, o.y + 0.75, o.z + rz * u0)
              .setLinvel(-o.side * rx * o.speed, 1.2, -o.side * rz * o.speed).setCcdEnabled(true));
            w.createCollider(R.ColliderDesc.ball(0.42).setDensity(3).setFriction(0.6).setRestitution(0.3), b);
            live.push({ body: b, born: t });
            this.emit('cannon', { o });
          }
          for (let i = live.length - 1; i >= 0; i--) {
            if (t - live[i].born > 3) { w.removeRigidBody(live[i].body); live.splice(i, 1); }
          }
        } };
        return ob;
      }
      default:
        return { type: o.type, o, body: null, update() {} };
    }
  }

  emit(type, data) { this.events.push(Object.assign({ type }, data)); }

  // Advance by dt seconds with the player's input {hold 0..1, steer -1..1, brake 0..1}.
  // Each frame is cut into equal slices of about 1/120 s, so motion matches the frame exactly
  // (fixed slices that don't line up with frames make the ball stutter on phones).
  step(dt, input) {
    dt = Math.min(dt, 0.05);
    if (dt <= 0) return;
    const n = Math.max(1, Math.ceil(dt * P.HZ - 0.01)), h = dt / n;
    this.world.timestep = h;
    for (let i = 0; i < n; i++) this.substep(h, input);
  }

  substep(h, input) {
    this.t += h;
    const t = this.t;
    for (const o of this.obs) o.update(t);
    this.updateTiles(t);
    for (const k in this.power) if (this.power[k] > 0) this.power[k] = Math.max(0, this.power[k] - h);
    for (const b of this.balls) {
      this.track(b);
      // After the finish only the player rolls on, into the bonus run.
      if (b.finished && !(b.player && this.L.bonus && !b.bonusDone)) { this.coast(b, h); continue; }
      let ctl = b.ai ? this.ai(b) : input;
      if (b.fallT >= 0) ctl = { throttle: 0, steer: 0, active: false };
      else if (b.finished) ctl = { throttle: 1, steer: ctl.steer || 0, active: true };   // bonus run: it rolls by itself, you steer
      const lz = b.fallT < 0 && this.inLoop(b);
      if (lz) this.loopDrive(b, lz, ctl.steer || 0, h);
      else this.drive(b, ctl.throttle || 0, ctl.steer || 0, !!ctl.active, h);
    }
    this.world.step();
    for (const b of this.balls) this.after(b, t, h);
    if (this.boss) this.updateBoss(h);
  }

  // The boss is never quite as quick as you at full speed, so it only catches you if you stop,
  // slow down or get knocked about. Fall far behind and it surges to stay on your tail.
  updateBoss(h) {
    const B = this.boss, p = this.player, ch = this.L.chase;
    if (B.down) return;
    if (!B.on) {
      if (p.fallT < 0 && !p.finished && p.s > ch.s0 + 1) {
        B.on = true;
        B.s = p.s - P.BOSS_GAP;
        B.v = 13;
        this.emit('boss');
      }
      return;
    }
    if (p.finished) { B.down = true; this.emit('bossDown'); return; }
    if (p.fallT >= 0) { B.v = 0; return; }   // waits while you respawn
    const gap = p.s - B.s, top = 9.6 + 0.6 * (this.L.d || 0);
    B.v += ((gap > 9 ? top + Math.min(11, 3 + (gap - 9) * 0.6) : top) - B.v) * Math.min(1, h * 1.5);
    B.s = Math.min(B.s + B.v * h, this.L.finish.s);
    B.roll += (B.v * h) / P.BOSS_R;
    if (gap < P.BOSS_R + P.R - 0.25 && this.power.shield > 0) {
      this.power.shield = 0;
      B.s -= 10;
      B.v = 0;
      this.emit('shield');
    } else if (gap < P.BOSS_R + P.R - 0.25) {
      p.fallT = this.t;
      p.falls++;
      p.squashed = true;
      B.v = 0;
      this.emit('squash');
    }
  }

  track(b) {
    const S = this.L.samples, p = b.body.translation();
    let best = b.idx, bd = Infinity;
    const scan = (lo, hi, wy) => {
      for (let i = Math.max(0, lo); i < Math.min(S.length, hi); i++) {
        const f = S[i], d = (f.x - p.x) ** 2 + (f.z - p.z) ** 2 + wy * (f.y - p.y) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
    };
    scan(b.idx - 8, b.idx + 40, 1);
    if (bd > 40) { bd = Infinity; scan(0, S.length, 0.3); }
    b.idx = best;
    const f = (b.frame = S[best]);
    const [fx, fz] = fwdOf(f.yaw), [rx, rz] = rightOf(f.yaw);
    const dx = p.x - f.x, dz = p.z - f.z;
    b.s = f.s + dx * fx + dz * fz;
    b.u = dx * rx + dz * rz;
  }

  probe(b) {
    const p = b.body.translation(), R = this.R;
    const hit = this.world.castRay(new R.Ray({ x: p.x, y: p.y, z: p.z }, { x: 0, y: -1, z: 0 }), P.R + 0.18, true, undefined, undefined, b.col, b.body);
    b.grounded = !!hit;
    b.support = null;
    b.supportBody = null;
    if (!hit) {
      // Look further down for the contact shadow.
      const far = this.world.castRay(new R.Ray({ x: p.x, y: p.y, z: p.z }, { x: 0, y: -1, z: 0 }), 4, true, undefined, undefined, b.col, b.body);
      b.groundY = far ? p.y - (far.timeOfImpact ?? far.toi) : null;
      return;
    }
    b.groundY = p.y - (hit.timeOfImpact ?? hit.toi);
    const c = typeof hit.collider === 'number' ? this.world.getCollider(hit.collider) : hit.collider;
    const pb = c && c.parent();
    if (pb && pb.isKinematic()) {
      // Surface velocity under the ball, including spin (rotating discs).
      const v = pb.linvel(), w = pb.angvel(), c0 = pb.translation();
      const ox = p.x - c0.x, oz = p.z - c0.z;
      b.support = { x: v.x + (w.y * oz), z: v.z - (w.y * ox) };
      b.supportBody = pb;
    }
  }

  // throttle: 1 = full ahead, 0 = stop and hold, -1 = full reverse. active is false when
  // nothing is pressed, and the ball just rolls to a gentle stop.
  drive(b, throttle, steer, active, h) {
    this.probe(b);
    const body = b.body, f = b.frame, v = body.linvel(), m = body.mass();
    const [fx, fz] = fwdOf(f.yaw), [rx, rz] = rightOf(f.yaw);
    let sx = b.support ? b.support.x : 0, sz = b.support ? b.support.z : 0;
    // A belt or a current moves the ground under you: steer relative to it.
    if (b.beltV && b.grounded) { sx += fx * b.beltV; sz += fz * b.beltV; }
    const vx = v.x - sx, vz = v.z - sz;
    const vf = vx * fx + vz * fz, vr = vx * rx + vz * rz;
    const k = !b.grounded ? P.AIR : b.onIce ? 0.22 : 1;
    let af = 0;
    if (active) {
      const target = b.finished && b.bonusV ? b.bonusV : throttle >= 0 ? P.FWD * throttle * b.speedK : P.REV * throttle;
      if (throttle > 0.95 && vf > target) af = 0;           // flat out: let slopes and boosts carry you faster
      else {
        af = (target - vf) * P.SPEED_K;
        if (b.grounded) af += this.slopePull(b);            // cancel the hill so stopping really holds
      }
      af = clamp(af, -P.ACC * 1.6, P.ACC);
    } else if (b.grounded && !b.onIce) af = -vf * P.BRAKE;
    const ar = clamp((steer * P.LAT - vr) * P.LAT_K, -P.LAT_MAX, P.LAT_MAX);
    body.applyImpulse({ x: (fx * af + rx * ar) * m * k * h, y: 0, z: (fz * af + rz * ar) * m * k * h }, true);
    const sp = Math.hypot(v.x, v.z);
    if (sp > P.CAP) body.setLinvel({ x: (v.x * P.CAP) / sp, y: v.y, z: (v.z * P.CAP) / sp }, true);
  }

  inLoop(b) {
    for (const z of this.loops) if (b.idx > z.i0 && b.idx < z.i1) return z;
    return null;
  }

  // Inside a loop the ball is carried round at a steady speed and pressed onto the track,
  // so holding on is enough to make it over the top.
  loopDrive(b, z, steer, h) {
    const S = this.L.samples, f = S[b.idx];
    const a = S[Math.max(z.i0, b.idx - 1)], c = S[Math.min(z.i1, b.idx + 1)];
    let tx = c.x - a.x, ty = c.y - a.y, tz = c.z - a.z;
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    const v = b.body.linvel(), m = b.body.mass(), [rx, rz] = rightOf(f.yaw), p = b.body.translation();
    const want = clamp(v.x * tx + v.y * ty + v.z * tz, P.LOOP_V, P.LOOP_V + 3);
    // Follow the loop's own path (its tangent already carries the sideways drift) and ease
    // back onto its centre line, so the ball comes out lined up with the exit.
    const off = (p.x - f.x) * rx + (p.z - f.z) * rz, lat = clamp(-off * 4 + steer * 0.6, -3, 3);
    b.body.setLinvel({ x: tx * want + rx * lat, y: ty * want, z: tz * want + rz * lat }, true);
    const k = P.LOOP_PRESS * m * h;
    b.body.applyImpulse({ x: -f.nx * k, y: -f.ny * k, z: -f.nz * k }, true);
    b.grounded = true;
    b.inLoopZ = z;
  }

  // The push needed to cancel gravity along the track at this spot (negative on downhills).
  slopePull(b) {
    const S = this.L.samples, a = S[Math.max(0, b.idx - 2)], c = S[Math.min(S.length - 1, b.idx + 2)];
    const ds = c.s - a.s;
    if (ds <= 0) return 0;
    const slope = (c.y - a.y) / ds;
    return (this.G * slope) / Math.sqrt(1 + slope * slope);
  }

  coast(b, h) {
    this.probe(b);
    const v = b.body.linvel(), m = b.body.mass();
    if (b.grounded) b.body.applyImpulse({ x: -v.x * 2 * m * h, y: 0, z: -v.z * 2 * m * h }, true);
  }

  // Simple racer: hold a lane, dodge posts, bumpers and sliding walls,
  // and wait for shuttling platforms instead of rolling off the edge.
  ai(b) {
    const f = b.frame, half = Math.max(0, f.w / 2 - P.R - 0.2);
    let lane = b.lane, hold = 1, edge = false, split = false;
    if (b.finished) {
      // Bonus run: steer over every speed pad, then straight for the kicker.
      const pad = this.L.bonus.pads.find((q) => q.s > b.s - 0.6);
      const v0 = b.body.linvel(), [rx, rz] = rightOf(f.yaw), vr = v0.x * rx + v0.z * rz;
      return { throttle: 1, steer: clamp(((pad ? pad.u * 0.6 : 0) - b.u) * 2.5 - vr * 0.15, -1, 1), active: true };
    }
    const v0 = b.body.linvel(), [gx, gz] = fwdOf(f.yaw), vf = Math.max(4, v0.x * gx + v0.z * gz);
    for (const o of this.obs) {
      const ds = o.o.s - b.s;
      if (o.type === 'divider' && ds < 6 && b.s < o.o.s + o.o.len) { lane = o.o.safe * 2.25; edge = true; split = true; continue; }
      if (o.type === 'logs') {
        // Dodge to the half the nearest log isn't rolling down.
        let near = null, nd = Infinity;
        for (const lg of o.live) { const p = lg.body.translation(), d2 = (p.x - b.body.translation().x) ** 2 + (p.z - b.body.translation().z) ** 2; if (d2 < nd) { nd = d2; near = lg; } }
        if (near && nd < 200) lane = near.u > 0 ? -1.3 : 1.3;
        continue;
      }
      if (ds < -2.5 || ds > 9) continue;
      const ta = this.t + Math.max(0, ds) / vf;   // when we would get there
      if (o.type === 'spinner') { lane = (lane >= 0 ? 1 : -1) * (f.w / 2 - P.R + 0.02); edge = true; }
      else if (o.type === 'slider' && ds < 5) lane = o.uAt(ta) > 0 ? -(o.o.w / 2 - P.R - 0.2) : o.o.w / 2 - P.R - 0.2;
      else if (o.type === 'pusher' && ds < 3) lane = -o.o.side * 0.9;
      else if (o.type === 'windmill' && ds > 0.8 && ds < 6) {
        // Wait while a blade will be sweeping the bottom when we arrive.
        const a = ((o.ang(ta) % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
        if (a < 0.55 || a > Math.PI / 2 - 0.55) hold = 0;
      } else if (o.type === 'pillar' && ds > 0 && ds < 3.5 && Math.abs(o.o.u - lane) < 1.1 && o.top(ta) > o.o.y + 0.25) {
        // Pick a column whose pillar will be down, or wait.
        const others = this.obs.filter((q) => q.type === 'pillar' && Math.abs(q.o.s - o.o.s) < 0.1 && q.top(ta) <= q.o.y + 0.25);
        if (others.length) lane = others[0].o.u; else hold = 0;
      } else if (o.type === 'seesaw' && ds < 4 && ds > -o.o.gap) lane = 0;
      else if (o.type === 'hammer' && ds > 1.5 && ds < 6) {
        // Wait unless it will stay up while we roll under it.
        const tIn = this.t + (ds - 1.5) / vf, tOut = this.t + (ds + 1.6) / vf;
        for (let tt = tIn; tt <= tOut; tt += 0.05) if (o.ang(tt) > 0.3) { hold = 0; break; }
      }
      else if (o.type === 'pendulum' && ds > -1 && ds < 6) {
        const uh = o.headU(ta);
        const far = Math.min(1.9, f.w / 2 - P.R - 0.2), clear = o.o.head + P.R + 0.3;
        if (Math.abs(uh) < 2.8) lane = uh > 0 ? -far : far;     // dodge to the far side of the swing
        if (Math.abs(uh - lane) < clear && ds > 1.5) hold = 0;   // still in the way: wait for it
      }
    }
    // A glass pane we're too slow for: back off and take a run at it.
    for (const g of this.panes) {
      const ds = g.o.s - b.s;
      if (g.broken || ds < 0 || ds > 6) continue;
      if (ds < 2.2 && vf < P.GLASS_V + 0.5) b.runUp = true;
      if (b.runUp) { if (ds > 5) b.runUp = false; else hold = -1; }
    }
    // Swinging platforms: board when the first one lines up, then ride in the middle of each.
    for (const o of this.swings) {
      const c = o.o.s + o.o.a, near = c - o.o.len / 2, far = c + o.o.len / 2;
      if (b.s >= near - 0.3 && b.s <= far + 0.2) { lane = o.uAt(this.t + 0.1); edge = true; }
      else if (o.o.k === 0 && b.s > near - 3 && b.s < near - 0.3) {
        const ta = this.t + (near - b.s) / vf;
        lane = 0;
        if (Math.abs(o.uAt(ta)) > 0.8 || Math.abs(o.uAt(ta + 0.25)) > 0.8) hold = 0;
      }
    }
    // In a bumper field, take the lane with the most room past the bumpers just ahead.
    const nearB = split ? [] : this.bumpers.filter((o) => { const ds = o.o.s - b.s; return ds > -0.6 && ds < 4.5; });
    if (nearB.length) {
      let best = lane, bestScore = -Infinity;
      for (let k = -3; k <= 3; k++) {
        const c = (k / 3) * half;
        let room = Infinity;
        for (const o of nearB) room = Math.min(room, Math.abs(o.o.u - c));
        const score = room - Math.abs(c - b.u) * 0.15;
        if (score > bestScore) { bestScore = score; best = c; }
      }
      lane = best;
    }
    if (!b.player) {
      // Rubber band: rivals far behind push a little harder, ones far ahead ease off.
      b.speedK = clamp(b.baseK + clamp((this.player.s - b.s) / 80, -0.12, 0.14), 0.74, 1.1);
    }
    if (!edge) lane = clamp(lane, -half, half);
    for (const o of this.platforms) {
      const s0 = o.o.s, s1 = s0 + o.o.gap, a = o.offset(this.t), L2 = o.o.len / 2;
      if (b.s > s0 - 6 && b.s < s0 - 0.2) {
        // Board only if the platform is at this edge and will still be there in a moment.
        if (a - L2 > 0.3 || o.offset(this.t + 0.7) - L2 > 0.3) hold = 0;
        lane = 0;
      } else if (b.s >= s0 - 0.2 && b.s <= s1) {
        lane = 0;
        // Riding: keep to the middle of the platform until it reaches the far edge.
        if (a + L2 < o.o.gap - 0.3) hold = clamp((s0 + a - b.s) * 0.6, -0.5, 0.5);
      }
    }
    // Wedged against something while trying to go: back off and come at it from nearer the middle.
    if (hold > 0 && vf < 4.5 && Math.hypot(v0.x, v0.z) < 0.6 && b.grounded) b.stuckT = (b.stuckT || 0) + 1 / 120; else if (!b.unstick) b.stuckT = 0;
    if (b.stuckT > 1.2) { b.unstick = 0.7; b.stuckT = 0; b.unstickU = b.u * 0.4; }
    if (b.unstick > 0) { b.unstick -= 1 / 120; hold = -1; lane = b.unstickU; }
    const v = b.body.linvel(), [rx, rz] = rightOf(f.yaw);
    const vr = v.x * rx + v.z * rz;
    return { throttle: hold, steer: clamp((lane - b.u) * 0.9 - vr * 0.08, -1, 1), active: true };
  }

  after(b, t, h) {
    const p = b.body.translation(), v = b.body.linvel(), f = b.frame;
    const [fx, fz] = fwdOf(f.yaw);
    const isP = b.player;

    // Hard knocks, for sound and haptics.
    const dv = Math.hypot(v.x - b.last.x, v.y - b.last.y, v.z - b.last.z);
    if (isP && dv > 6 && t - b.padT > 0.2) this.emit('hit', { s: dv });
    b.last = { x: v.x, y: v.y, z: v.z };

    if (b.fallT >= 0) {
      if (t - b.fallT > P.RESPAWN) this.respawn(b);
      return;
    }
    if (b.finished && isP && this.L.bonus && !b.bonusDone) {
      // Bonus run: the first touchdown past the kicker sets the multiplier.
      const B = this.L.bonus;
      if (!b.grounded && b.s > B.lip - 0.5) b.bonusAir = true;
      const fell = p.y < f.y - P.FALL;
      if ((b.bonusAir && b.grounded && b.s > B.lip + 1) || fell) {
        const dist = b.s - B.lip;
        b.bonusDone = true;
        b.mult = fell ? 1 : 1 + B.edges.filter((e) => dist >= e).length;
        this.emit('bonus', { mult: b.mult, dist });
      }
    }
    if (p.y < f.y - P.FALL && !b.finished) {
      if (isP && this.power.shield > 0) { this.shieldSave(b); return; }
      b.fallT = t;
      b.falls++;
      if (isP) this.emit('fall');
      return;
    }

    if (b.inLoopZ && !this.inLoop(b)) {
      // Came out of the loop the far side: that counts as looping it.
      if (isP && b.idx >= b.inLoopZ.i1) this.emit('loop');
      b.inLoopZ = null;
    }
    let inBoost = false;
    b.onIce = false;
    b.beltV = 0;
    for (const z of this.L.zones) {
      if (z.type === 'loop' || b.s < z.s0 - 0.3 || b.s > z.s1 + 0.3 || Math.abs(b.u) > z.half + 0.3) continue;
      if (z.type === 'ice') b.onIce = true;
      else if (z.type === 'belt' || z.type === 'water') b.beltV = z.v;
      else if (z.type === 'wind') {
        const [rx, rz] = rightOf(f.yaw), k = z.dir * z.power * b.body.mass() * h;
        b.body.applyImpulse({ x: rx * k, y: 0, z: rz * k }, true);
      } else if (z.type === 'pipe') {
        if (isP && b.pipeZ !== z) { b.pipeZ = z; this.emit('pipe'); }
      } else if (z.type === 'boost' && b.grounded) {
        inBoost = true;
        const vf = v.x * fx + v.z * fz;
        if (vf < P.BOOST) b.body.setLinvel({ x: v.x + fx * (P.BOOST - vf), y: v.y, z: v.z + fz * (P.BOOST - vf) }, true);
        if (!b.inBoost && isP) this.emit('boost');
      } else if (z.type === 'speed' && b.grounded && Math.abs(b.u - z.u) < z.hw && b.lastPad !== z) {
        b.lastPad = z;
        // Each pad raises the speed the ball holds for the rest of the bonus run.
        b.bonusV = Math.min(19.7, (b.bonusV || P.FWD) + P.SPEED_PAD);
        const vf = v.x * fx + v.z * fz, add = b.bonusV - vf;
        if (add > 0) {
          const nv = { x: v.x + fx * add, y: v.y, z: v.z + fz * add };
          b.body.setLinvel(nv, true);
          // Spin to match, so friction doesn't eat the boost while the ball catches up.
          b.body.setAngvel({ x: nv.z / P.R, y: 0, z: -nv.x / P.R }, true);
        }
        if (isP) this.emit('speed');
      } else if (z.type === 'pad' && p.y - z.y < P.R + 0.35 && v.y < 2 && t - b.padT > 0.5) {
        const vf = Math.max(v.x * fx + v.z * fz, P.PAD_FWD);
        const [rx, rz] = rightOf(f.yaw), vr = v.x * rx + v.z * rz;
        b.body.setLinvel({ x: fx * vf + rx * vr, y: P.PAD_VY, z: fz * vf + rz * vr }, true);
        b.padT = t;
        if (isP) this.emit('pad');
      } else if (z.type === 'checkpoint' && z.index > b.cp) {
        b.cp = z.index;
        if (isP) this.emit('checkpoint', { index: z.index });
      } else if (z.type === 'finish' && !b.finished && p.y > z.y - 1) {
        b.finished = true;
        b.place = ++this.finishCount;
        b.finishT = t;
        this.emit('finish', { player: isP, place: b.place });
      }
    }
    b.inBoost = inBoost;

    // Glass panes shatter just before a quick ball reaches them; a slow one bounces off.
    for (const g of this.panes) {
      if (g.broken) continue;
      const ds = g.o.s - b.s, vf = v.x * fx + v.z * fz;
      if (ds > -0.3 && ds < P.R + 0.35 + vf * h * 2 && vf >= P.GLASS_V && Math.abs(b.u) < g.o.w / 2 + 0.3) {
        g.broken = true;
        this.world.removeCollider(g.col, true);
        this.emit('shatter', { o: g.o, near: isP || Math.abs(g.o.s - this.player.s) < 25 });
      }
    }
    if (isP) {
      for (const w of this.walls) if (w.type === 'bricks' && !w.hit && Math.abs(w.o.s - b.s) < 1.2) { w.hit = true; this.emit('smash', { o: w.o }); }
      for (let i = 0; i < this.powerups.length; i++) {
        const q = this.powerups[i];
        if (q.taken || Math.abs(q.s - b.s) > 2.5) continue;
        if ((q.x - p.x) ** 2 + (q.y - p.y) ** 2 + (q.z - p.z) ** 2 < 1.6) {
          q.taken = true;
          this.power[q.kind] = P.POWER_T[q.kind];
          this.emit('power', { i, kind: q.kind });
        }
      }
      // The magnet pulls nearby coins in.
      if (this.power.magnet > 0) {
        const k = Math.min(1, h * 9);
        for (const c of this.coins) {
          if (c.taken || Math.abs(c.s - b.s) > 9) continue;
          const d2 = (c.x - p.x) ** 2 + (c.y - p.y) ** 2 + (c.z - p.z) ** 2;
          if (d2 < 36) { c.x += (p.x - c.x) * k; c.y += (p.y - c.y) * k; c.z += (p.z - c.z) * k; c.s = b.s; }
        }
      }
      for (let i = 0; i < this.coins.length; i++) {
        const c = this.coins[i];
        if (c.taken || Math.abs(c.s - b.s) > 2) continue;
        if ((c.x - p.x) ** 2 + (c.y - p.y) ** 2 + (c.z - p.z) ** 2 < 1.0) { c.taken = true; this.emit('coin', { i }); }
      }
      for (const bm of this.bumpers) {
        const d = Math.hypot(bm.o.x - p.x, bm.o.z - p.z);
        if (d < bm.o.r + P.R + 0.08 && t - bm.cool > 0.25) { bm.cool = t; this.emit('bump', { o: bm.o }); }
      }
    }

    // Crumbling tiles start to fall a moment after anything rolls on them.
    if (b.supportBody) {
      for (const tl of this.tiles) if (tl.body === b.supportBody && tl.at < 0) { tl.at = t + 0.55; if (isP) this.emit('crack'); }
    }
  }

  updateTiles(t) {
    for (const tl of this.tiles) {
      if (tl.at < 0 || t < tl.at) continue;
      const k = t - tl.at;
      if (k > 5) { this.restoreTile(tl); continue; }  // grows back so racers behind can cross
      if (k > 3) { if (!tl.gone) { tl.gone = true; tl.body.setNextKinematicTranslation({ x: tl.t.x, y: tl.t.y - 200, z: tl.t.z }); } continue; }
      tl.body.setNextKinematicTranslation({ x: tl.t.x, y: tl.t.y - 0.25 - 0.5 * 20 * k * k, z: tl.t.z });
      tl.body.setNextKinematicRotation({ x: Math.sin(k * 0.6) * 0.3, y: Math.sin(tl.t.yaw / 2), z: 0, w: Math.cos(tl.t.yaw / 2) });
    }
  }

  restoreTile(tl) {
    tl.at = -1;
    tl.gone = false;
    tl.body.setTranslation({ x: tl.t.x, y: tl.t.y - 0.25, z: tl.t.z }, true);
    tl.body.setRotation(qY(tl.t.yaw), true);
  }

  respawn(b) {
    const cp = this.L.checkpoints[b.cp];
    const p = this.spawnPoint(cp, b.player ? 0 : b.lane);
    b.body.setTranslation({ x: p[0], y: p[1], z: p[2] }, true);
    b.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    b.idx = cp.i;
    b.s = cp.s;
    b.fallT = -1;
    b.last = { x: 0, y: 0, z: 0 };
    if (b.player) {
      b.squashed = false;
      // The boss backs off: behind you again from a checkpoint inside the chase, gone from one before it.
      const B = this.boss;
      if (B && B.on && !B.down) {
        if (cp.s >= this.L.chase.s0) { B.s = cp.s - P.BOSS_GAP; B.v = 0; } else B.on = false;
      }
      // Brick walls and glass panes past the checkpoint are rebuilt.
      for (const w of this.walls) if (w.o.s >= cp.s) w.reset();
      // Tiles past the checkpoint come back, so the way ahead is always passable.
      for (const tl of this.tiles) if (tl.t.s >= cp.s && tl.at >= 0) this.restoreTile(tl);
      this.emit('respawn');
    }
  }

  // The shield catches a fall: back onto the track just ahead of where you went over.
  shieldSave(b) {
    const S = this.L.samples;
    let i = Math.min(S.length - 1, b.idx + 2);
    while (i < S.length - 1 && S[i].gap) i++;
    const f = S[i], [fx, fz] = fwdOf(f.yaw);
    b.body.setTranslation({ x: f.x, y: f.y + P.R + 0.4, z: f.z }, true);
    b.body.setLinvel({ x: fx * 6, y: 0, z: fz * 6 }, true);
    b.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    b.idx = i;
    b.s = f.s;
    this.power.shield = 0;
    this.emit('shield');
  }

  // Race position of the player (1 = leading).
  rank() {
    const order = this.balls.slice().sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished) return a.place - b.place;
      return b.s - a.s;
    });
    return order.indexOf(this.player) + 1;
  }

  dispose() { this.world.free(); }
}
