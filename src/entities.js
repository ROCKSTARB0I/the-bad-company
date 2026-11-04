// ============================================================================
// Actors and projectiles. Bullets are real travelling objects, not hitscan --
// that is what makes the slow-motion dive worth pressing.
// ============================================================================
import * as THREE from '../vendor/three.module.js';
import { TILE } from './worldgen.js';
import { clamp, dist, dist2, angDiff, approachAngle, TAU } from './util.js';
import { makeCharacter, makeCivilian, makeGunMesh, fitGunToHand, makeMuzzleFlash, makeTracerMesh, makePickupMesh } from './models.js';
import { gun as gunById } from './guns.js';
import * as A from './audio.js';

export const R_PLAYER = 0.85;
export const R_ENEMY = 0.85;

// ---------------------------------------------------------------------------
// BULLETS -- pooled, instanced-ish (one reused mesh each)
// ---------------------------------------------------------------------------
export class Bullets {
  constructor(scene, cap = 420) {
    this.scene = scene;
    this.pool = [];
    this.active = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    for (let i = 0; i < cap; i++) {
      const m = makeTracerMesh();
      m.visible = false;
      this.group.add(m);
      this.pool.push(m);
    }
  }
  spawn(x, z, dirX, dirZ, speed, dmg, owner, pen, color = 0xffe08a, y = 1.32) {
    const mesh = this.pool.pop();
    if (!mesh) return null;
    mesh.visible = true;
    mesh.material.color.setHex(color);
    const b = { x, z, y, dx: dirX, dz: dirZ, speed, dmg, owner, pen, life: 2.6, mesh, dead: false, trail: 0 };
    this.active.push(b);
    return b;
  }
  release(b) {
    b.dead = true;
    b.mesh.visible = false;
    this.pool.push(b.mesh);
  }
  update(dt, world, actors, onHit) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i];
      b.life -= dt;
      const travel = b.speed * dt;
      const steps = Math.max(1, Math.ceil(travel / 1.2));
      const st = travel / steps;
      let killed = false;
      for (let s = 0; s < steps && !killed; s++) {
        const nx = b.x + b.dx * st, nz = b.z + b.dz * st;
        // wall / door
        if (world.solidAtWorld(nx, nz)) {
          const tx = world.tx(nx), tz = world.tz(nz);
          const door = world.doorAt.get(world.key(tx, tz));
          if (door && !door.open) {
            door.hp -= b.dmg;
            if (door.hp <= 0) { world.openDoor(door, b.dx, b.dz, true); A.sfxDoorSlam(nx, nz); }
          }
          onHit?.({ kind: 'wall', x: nx, z: nz, b });
          A.sfxRicochet(nx, nz);
          killed = true; break;
        }
        // actors
        for (const a of actors) {
          if (a.dead || a === b.owner) continue;
          if (a.team === b.owner?.team) continue;
          if (a.noClipBullets) continue;
          const rr = (a.radius + 0.24) ** 2;
          if (dist2(nx, nz, a.x, a.z) < rr) {
            onHit?.({ kind: 'actor', actor: a, x: nx, z: nz, b });
            if (b.pen > 0) { b.pen--; b.dmg *= 0.72; }
            else killed = true;
            break;
          }
        }
        b.x = nx; b.z = nz;
      }
      if (killed || b.life <= 0) { this.release(b); this.active.splice(i, 1); continue; }
      const len = clamp(b.speed * 0.055, 0.9, 4.2);
      b.mesh.position.set(b.x, b.y, b.z);
      b.mesh.scale.set(1, 1, len);
      b.mesh.lookAt(b.x + b.dx, b.y, b.z + b.dz);
    }
  }
  clear() {
    for (const b of this.active) this.release(b);
    this.active.length = 0;
  }
}

// ---------------------------------------------------------------------------
// BASE ACTOR
// ---------------------------------------------------------------------------
class Actor {
  constructor(scene, x, z, opts) {
    this.x = x; this.z = z;
    this.vx = 0; this.vz = 0;
    this.aim = 0;
    this.radius = opts.radius ?? R_ENEMY;
    this.hp = opts.hp; this.maxHp = opts.hp;
    this.team = opts.team;
    this.dead = false;
    this.rig = makeCharacter(opts.palette);
    this.rig.root.position.set(x, 0, z);
    scene.add(this.rig.root);
    this.scene = scene;
    this.flash = makeMuzzleFlash();
    this.rig.gunMount.add(this.flash);
    this.flashT = 0;
    this.gunMesh = null;
  }
  equip(g) {
    this.gun = g;
    if (this.gunMesh) { this.rig.gunMount.remove(this.gunMesh); }
    this.gunMesh = makeGunMesh(g);
    fitGunToHand(this.rig.gunMount, this.gunMesh, g);
    this.flash.position.set(0, -0.02, 0.10 + (this.gunMesh.userData.length || 0.6) * (g.silenced ? 0.93 : 0.74));
  }
  unequip() {
    if (this.gunMesh) { this.rig.gunMount.remove(this.gunMesh); this.gunMesh = null; }
    this.gun = null;
  }
  muzzleWorld() {
    const v = new THREE.Vector3(0, 0, 0);
    this.flash.getWorldPosition(v);
    return v;
  }
  damage(n) {
    if (this.dead) return false;
    this.hp -= n;
    this.rig.hurt();
    if (this.hp <= 0) { this.dead = true; return true; }
    return false;
  }
  syncMesh(dt, speed) {
    this.rig.root.position.set(this.x, 0, this.z);
    this.rig.update(dt, speed, this.aim, { twoHanded: this.gun ? this.gun.cls !== 'pistol' : true });
    if (this.flashT > 0) {
      this.flashT -= dt * 26;
      this.flash.visible = this.flashT > 0;
      const s = 0.55 + this.flashT * 0.9;
      this.flash.scale.setScalar(s);
      this.flash.rotation.z = Math.random() * TAU;
    } else this.flash.visible = false;
  }
  remove() { this.scene.remove(this.rig.root); }
}

// ---------------------------------------------------------------------------
// PLAYER
// ---------------------------------------------------------------------------
export class Player extends Actor {
  constructor(scene, x, z, charDef) {
    super(scene, x, z, {
      hp: charDef.hp, team: 'player', radius: R_PLAYER,
      palette: {
        cloth: charDef.id === 'ron' ? 0x25303d : charDef.id === 'john' ? 0x2b3529 : charDef.id === 'vance' ? 0x33301f : 0x22232a,
        accent: parseInt(charDef.color.slice(1), 16),
        glow: parseInt(charDef.accent.slice(1), 16),
        skin: 0xc08b68, hair: 0x1b1b1f, boot: 0x121317,
      },
    });
    this.char = charDef;
    this.baseSpeed = charDef.speed;
    this.slots = [];
    this.slot = 0;
    this.reloadT = 0;
    this.shotT = 0;
    this.burstLeft = 0;
    this.diveT = 0; this.diveCd = 0; this.diveDir = { x: 0, z: 1 };
    this.invuln = 0;
    this.kills = 0;
    this.firstKill = false;
    this.recoilSpread = 0;
    this.throwCd = 0;
  }
  addGun(g, magsExtra = 3, makeCurrent = true) {
    const existing = this.slots.find(s => s.gun.id === g.id);
    if (existing) { existing.reserve += g.mag * 2; return existing; }
    const slot = { gun: g, mag: g.mag, reserve: g.mag * magsExtra };
    this.slots.push(slot);
    if (makeCurrent || this.slots.length === 1) this.select(this.slots.length - 1);
    return slot;
  }
  get cur() { return this.slots[this.slot]; }
  select(i) {
    if (i < 0 || i >= this.slots.length || i === this.slot) return;
    this.slot = i;
    this.reloadT = 0;
    this.burstLeft = 0;
    this.equip(this.slots[i].gun);
  }
  cycle(dir) { if (this.slots.length) this.select((this.slot + dir + this.slots.length) % this.slots.length); }

  startReload() {
    const s = this.cur;
    if (!s || this.reloadT > 0) return;
    if (s.mag >= s.gun.mag || s.reserve <= 0) return;
    this.reloadT = s.gun.reload;
    this.reloadTotal = s.gun.reload;
    A.sfxReloadOut();
    this._reloadClickT = s.gun.reload * 0.55;
  }
  finishReload() {
    const s = this.cur;
    const need = s.gun.mag - s.mag;
    const take = Math.min(need, s.reserve);
    s.mag += take; s.reserve -= take;
  }
  canFire() { return this.reloadT <= 0 && this.shotT <= 0 && this.cur && this.cur.mag > 0; }

  fire(bullets, aimX, aimZ) {
    const s = this.cur;
    if (!s) return false;
    if (this.reloadT > 0) return false;
    if (this.shotT > 0) return false;
    if (s.mag <= 0) { A.sfxDryFire(); this.startReload(); return false; }
    const g = s.gun;
    s.mag--;
    this.shotT = g.rof;
    this.rig.kick(clamp(g.recoil * 0.22, 0.15, 1.2));
    this.flashT = g.silenced ? 0.4 : 1;
    this.recoilSpread = Math.min(6, this.recoilSpread + g.recoil * 0.42);
    const m = this.muzzleWorld();
    const base = Math.atan2(aimX, aimZ);
    const spreadDeg = g.spread + this.recoilSpread + (this.diveT > 0 ? 1.6 : 0);
    for (let p = 0; p < g.pellets; p++) {
      const off = (Math.random() - 0.5) * spreadDeg * Math.PI / 180 * (g.pellets > 1 ? 2.4 : 1);
      const a = base + off;
      bullets.spawn(m.x, m.z, Math.sin(a), Math.cos(a), g.vel, g.dmg, this, g.pen > 3 ? 1 : 0,
                    0xffe08a, 1.32);
    }
    A.sfxShot(g);                       // your own weapon, dry and centred
    if (s.mag === 0) this.startReload();          // auto-reload on empty
    return true;
  }

  // Out of ammo? Throw the gun at them. Hits hard, then lies on the floor
  // as a pickup like any other weapon.
  throwWeapon() {
    const s = this.cur;
    if (!s || this.throwCd > 0) return null;
    const g = s.gun;
    this.slots.splice(this.slot, 1);
    this.throwCd = 0.45;
    if (this.slots.length) {
      this.slot = Math.min(this.slot, this.slots.length - 1);
      this.equip(this.slots[this.slot].gun);
    } else {
      this.slot = 0;
      this.unequip();
    }
    this.reloadT = 0;
    return g;
  }

  tryDive(mvX, mvZ) {
    if (this.diveT > 0 || this.diveCd > 0) return false;
    let dx = mvX, dz = mvZ;
    if (Math.abs(dx) + Math.abs(dz) < 0.1) { dx = Math.sin(this.aim); dz = Math.cos(this.aim); }
    const n = Math.hypot(dx, dz) || 1;
    this.diveDir = { x: dx / n, z: dz / n };
    this.diveT = 0.85;
    this.diveCd = 2.4;
    this.invuln = 0.45;
    A.sfxDive();
    return true;
  }

  update(dt, world, input, aimPoint) {
    if (this.dead) return;
    this.shotT = Math.max(0, this.shotT - dt);
    this.throwCd = Math.max(0, this.throwCd - dt);
    this.diveCd = Math.max(0, this.diveCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.recoilSpread = Math.max(0, this.recoilSpread - dt * 9);

    if (this.reloadT > 0) {
      const prev = this.reloadT;
      this.reloadT -= dt;
      if (this._reloadClickT && prev > this._reloadClickT && this.reloadT <= this._reloadClickT) A.sfxReloadIn();
      if (this.reloadT <= 0) { this.reloadT = 0; this.finishReload(); }
    }

    // aim toward the cursor's ground point
    const adx = aimPoint.x - this.x, adz = aimPoint.z - this.z;
    if (Math.abs(adx) + Math.abs(adz) > 0.001) this.aim = Math.atan2(adx, adz);

    const bulk = this.cur ? this.cur.gun.bulk : -0.06;   // unarmed you move a touch quicker
    let speed = this.baseSpeed * (1 - bulk);
    let mvX = input.mx, mvZ = input.mz;
    const mag = Math.hypot(mvX, mvZ);
    if (mag > 1) { mvX /= mag; mvZ /= mag; }

    if (this.diveT > 0) {
      this.diveT -= dt;
      const p = clamp(this.diveT / 0.85, 0, 1);
      const dv = 22 * (0.35 + p * 0.65);
      this.vx = this.diveDir.x * dv;
      this.vz = this.diveDir.z * dv;
      this.rig.setDive(Math.sin((1 - p) * Math.PI) * 0.9);
      if (this.diveT <= 0) { this.diveT = 0; this.rig.setDive(0); }
    } else {
      this.vx = mvX * speed;
      this.vz = mvZ * speed;
      this.rig.setDive(0);
    }

    // walk into a door and it swings open; hit it at a run and it slams
    const sp = Math.hypot(this.vx, this.vz);
    const d = world.doorContact(this.x + this.vx * dt, this.z + this.vz * dt, this.radius);
    if (d) {
      const hard = sp > this.baseSpeed * 0.75 || this.diveT > 0;
      world.openDoor(d, this.vx, this.vz, hard);
      if (hard) { A.sfxDoorSlam(this.x, this.z); this.bustedDoor = true; } else A.sfxDoorOpen(this.x, this.z);
    }

    const [nx, nz] = world.moveCircle(this.x, this.z, this.vx * dt, this.vz * dt, this.radius);
    this.x = nx; this.z = nz;
    this.syncMesh(dt, sp);
  }
}

// ---------------------------------------------------------------------------
// ENEMY
// ---------------------------------------------------------------------------
// acc is the cone half-angle in degrees; `pause` is the gap between bursts.
// These are tuned so a single enemy is survivable and three are not.
const ENEMY_STATS = {
  grunt: { hp: 45,  acc: 6.5, react: 0.55, keep: 9,  burstMin: 2, burstMax: 3, speed: 8.4, pause: 0.85, rate: 1.55 },
  rifle: { hp: 62,  acc: 4.6, react: 0.45, keep: 13, burstMin: 3, burstMax: 5, speed: 8.8, pause: 0.95, rate: 1.45 },
  heavy: { hp: 135, acc: 7.5, react: 0.65, keep: 7,  burstMin: 2, burstMax: 4, speed: 6.9, pause: 1.15, rate: 1.70 },
  marks: { hp: 52,  acc: 1.7, react: 0.95, keep: 26, burstMin: 1, burstMax: 1, speed: 7.6, pause: 1.70, rate: 2.20 },
};
const ENEMY_DMG = 0.30;          // enemies hit for a third of the listed damage
const ENEMY_COLORS = {
  grunt: { cloth: 0x2c2f36, accent: 0x8a2029 },
  rifle: { cloth: 0x272c34, accent: 0xa8323b },
  heavy: { cloth: 0x1e2128, accent: 0xd04a2a },
  marks: { cloth: 0x2a2e28, accent: 0x6f9a3a },
};

export class Enemy extends Actor {
  constructor(scene, x, z, type, g, difficulty = 1) {
    const st = ENEMY_STATS[type] || ENEMY_STATS.grunt;
    super(scene, x, z, {
      hp: Math.round(st.hp * difficulty), team: 'company', radius: R_ENEMY,
      palette: { ...ENEMY_COLORS[type], glow: ENEMY_COLORS[type].accent, skin: 0xb07a58, hair: 0x14161a, boot: 0x0f1114 },
    });
    this.type = type; this.st = st;
    this.equip(g);
    this.state = 'idle';
    this.alertT = 0;
    this.reactT = 0;
    this.shotT = 0;
    this.burst = 0;
    this.reloadT = 0;
    this.mag = g.mag;
    this.lastSeen = null;
    this.searchT = 0;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = 0;
    this.staggerT = 0;
    this.repathT = 0;
    this.homeX = x; this.homeZ = z;
    this.wanderA = Math.random() * TAU;
    this.aim = Math.random() * TAU;
  }

  stagger(t = 0.6) { this.staggerT = Math.max(this.staggerT || 0, t); }

  alert(px, pz) {
    if (this.state === 'idle') { this.reactT = this.st.react; A.sfxAlert(this.x, this.z); }
    if (this.state !== 'engage') this.state = 'alert';
    this.lastSeen = { x: px, z: pz };
    this.alertT = 7;
  }

  update(dt, world, player, bullets, others) {
    if (this.dead) return;
    this.shotT = Math.max(0, this.shotT - dt);
    this.reactT = Math.max(0, this.reactT - dt);
    this.alertT = Math.max(0, this.alertT - dt);
    this.strafeT -= dt;
    if (this.staggerT > 0) {
      this.staggerT -= dt;
      this.rig.setDive(Math.min(0.5, this.staggerT));
      this.syncMesh(dt, 0);
      return;                                  // reeling -- can't move or shoot
    }
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.mag = this.gun.mag;
    }

    const d = dist(this.x, this.z, player.x, player.z);
    const sees = !player.dead && d < 62 && world.canSee(this.x, this.z, player.x, player.z);
    if (sees) {
      // a cone in front, plus a close-range "you're right there" radius
      const toA = Math.atan2(player.x - this.x, player.z - this.z);
      const inCone = Math.abs(angDiff(this.aim, toA)) < 1.15 || d < 11;
      if (inCone) {
        if (this.state === 'idle') { this.reactT = this.st.react; A.sfxAlert(this.x, this.z); }
        this.state = 'engage';
        this.lastSeen = { x: player.x, z: player.z };
        this.alertT = 7;
      }
    } else if (this.state === 'engage' && this.alertT <= 0) {
      this.state = 'search'; this.searchT = 4.5;
    }

    let mvX = 0, mvZ = 0, targetAim = this.aim;

    if (this.state === 'idle') {
      // slow idle sweep, drifting near their post
      this.wanderA += (Math.random() - 0.5) * dt * 2.2;
      targetAim = this.wanderA;
      const hd = dist(this.x, this.z, this.homeX, this.homeZ);
      if (hd > 4) { mvX = (this.homeX - this.x) / hd * 0.35; mvZ = (this.homeZ - this.z) / hd * 0.35; }
    } else if (this.state === 'engage' && this.reactT <= 0) {
      targetAim = Math.atan2(player.x - this.x, player.z - this.z);
      const keep = this.st.keep;
      // close the gap, back off if too close, strafe to break the shot line
      if (d > keep * 1.15) { mvX = (player.x - this.x) / d; mvZ = (player.z - this.z) / d; }
      else if (d < keep * 0.65) { mvX = -(player.x - this.x) / d; mvZ = -(player.z - this.z) / d; }
      if (this.strafeT <= 0) { this.strafe = Math.random() < 0.5 ? 1 : -1; this.strafeT = 0.7 + Math.random() * 1.1; }
      mvX += -(player.z - this.z) / d * this.strafe * 0.85;
      mvZ += (player.x - this.x) / d * this.strafe * 0.85;

      const clear = world.canShoot(this.x, this.z, player.x, player.z);
      if (clear && this.shotT <= 0 && this.reloadT <= 0) this.shoot(bullets, player, d);
    } else if (this.state === 'alert' || this.state === 'search') {
      const tgt = this.lastSeen || { x: this.homeX, z: this.homeZ };
      const td = dist(this.x, this.z, tgt.x, tgt.z);
      if (td > 2.5) { mvX = (tgt.x - this.x) / td; mvZ = (tgt.z - this.z) / td; targetAim = Math.atan2(tgt.x - this.x, tgt.z - this.z); }
      else {
        this.searchT -= dt;
        this.wanderA += dt * 2.4;
        targetAim = this.wanderA;
        if (this.searchT <= 0) { this.state = 'idle'; this.lastSeen = null; }
      }
    }

    // separation so squads don't stack into one blob
    for (const o of others) {
      if (o === this || o.dead) continue;
      const dd = dist2(this.x, this.z, o.x, o.z);
      if (dd < 6.2 && dd > 0.0001) {
        const dl = Math.sqrt(dd);
        mvX += (this.x - o.x) / dl * 0.7;
        mvZ += (this.z - o.z) / dl * 0.7;
      }
    }

    const m = Math.hypot(mvX, mvZ);
    if (m > 0.001) {
      const sp = this.st.speed * (this.state === 'idle' ? 0.42 : 1) * (1 - this.gun.bulk * 0.8);
      mvX = mvX / m * sp; mvZ = mvZ / m * sp;
      let [nx, nz] = world.moveCircle(this.x, this.z, mvX * dt, mvZ * dt, this.radius);
      // nudge around a corner if we jammed against a wall while chasing
      if (nx === this.x && nz === this.z && this.state !== 'idle') {
        const perp = [-mvZ, mvX];
        [nx, nz] = world.moveCircle(this.x, this.z, perp[0] * dt, perp[1] * dt, this.radius);
      }
      this.x = nx; this.z = nz;
    }
    // company crews shoulder doors open too
    const dc = world.doorContact(this.x + mvX * dt, this.z + mvZ * dt, this.radius);
    if (dc) { world.openDoor(dc, mvX, mvZ, this.state === 'engage'); A.sfxDoorOpen(this.x, this.z); }

    this.aim = approachAngle(this.aim, targetAim, dt * (this.state === 'engage' ? 7.5 : 2.6));
    this.syncMesh(dt, Math.hypot(mvX, mvZ));
  }

  shoot(bullets, player, d) {
    if (this.mag <= 0) { this.reloadT = this.gun.reload * 1.15; A.sfxReloadOut(); return; }
    if (this.burst <= 0) {
      this.burst = this.st.burstMin + Math.floor(Math.random() * (this.st.burstMax - this.st.burstMin + 1));
      if (!this.gun.auto && this.gun.cls !== 'shotgun') this.burst = Math.min(this.burst, 2);
    }
    this.mag--;
    this.burst--;
    const g = this.gun;
    this.shotT = this.burst > 0 ? g.rof * this.st.rate
                                : g.rof * this.st.rate + this.st.pause + Math.random() * 0.6;
    this.rig.kick(clamp(g.recoil * 0.2, 0.1, 1));
    this.flashT = g.silenced ? 0.4 : 1;
    const mz = this.muzzleWorld();
    // lead the player a little, then add their accuracy error
    const lead = clamp(d / g.vel, 0, 0.35);
    const tx = player.x + player.vx * lead * 0.7, tz = player.z + player.vz * lead * 0.7;
    const base = Math.atan2(tx - this.x, tz - this.z);
    const err = (this.st.acc + (d > 26 ? 2.4 : 0) + (d > 44 ? 2.4 : 0)) * Math.PI / 180;
    for (let p = 0; p < g.pellets; p++) {
      const a = base + (Math.random() - 0.5) * err * 2 * (g.pellets > 1 ? 2.2 : 1);
      bullets.spawn(mz.x, mz.z, Math.sin(a), Math.cos(a), g.vel * 0.80, g.dmg * ENEMY_DMG, this, 0, 0xff8a5c, 1.32);
    }
    A.sfxShot(g, this.x, this.z);
    if (this.mag <= 0) { this.reloadT = g.reload * 1.15; A.sfxReloadOut(); }
  }
}

// ---------------------------------------------------------------------------
// ALLY -- Ron / John / Vance fighting alongside you in the convergence level
// ---------------------------------------------------------------------------
export class Ally extends Actor {
  constructor(scene, x, z, charDef, g) {
    super(scene, x, z, {
      hp: 200, team: 'player', radius: R_ENEMY,
      palette: {
        cloth: charDef.id === 'ron' ? 0x25303d : charDef.id === 'john' ? 0x2b3529 : 0x33301f,
        accent: parseInt(charDef.color.slice(1), 16),
        glow: parseInt(charDef.accent.slice(1), 16),
        skin: 0xc08b68, hair: 0x1b1b1f, boot: 0x121317,
      },
    });
    this.char = charDef;
    this.equip(g);
    this.shotT = 0; this.mag = g.mag; this.reloadT = 0;
    this.aim = 0;
  }
  update(dt, world, player, enemies, bullets) {
    if (this.dead) return;
    this.shotT = Math.max(0, this.shotT - dt);
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.mag = this.gun.mag; }

    // pick the nearest enemy we actually have a shot at
    let best = null, bestD = 1e9;
    for (const e of enemies) {
      if (e.dead) continue;
      const d = dist(this.x, this.z, e.x, e.z);
      if (d < bestD && d < 44 && world.canShoot(this.x, this.z, e.x, e.z)) { best = e; bestD = d; }
    }
    let mvX = 0, mvZ = 0;
    const pd = dist(this.x, this.z, player.x, player.z);
    if (pd > 11) { mvX = (player.x - this.x) / pd; mvZ = (player.z - this.z) / pd; }
    else if (pd < 5) { mvX = -(player.x - this.x) / pd * 0.6; mvZ = -(player.z - this.z) / pd * 0.6; }

    if (best) {
      this.aim = approachAngle(this.aim, Math.atan2(best.x - this.x, best.z - this.z), dt * 8);
      if (this.shotT <= 0 && this.reloadT <= 0) {
        if (this.mag <= 0) { this.reloadT = this.gun.reload; A.sfxReloadOut(); }
        else {
          this.mag--;
          const g = this.gun;
          this.shotT = g.rof + (g.auto ? 0.02 : 0.22);
          this.flashT = 1; this.rig.kick(0.3);
          const mz = this.muzzleWorld();
          const a = this.aim + (Math.random() - 0.5) * 0.06;
          for (let p = 0; p < g.pellets; p++)
            bullets.spawn(mz.x, mz.z, Math.sin(a + (Math.random() - 0.5) * 0.1), Math.cos(a + (Math.random() - 0.5) * 0.1),
                          g.vel, g.dmg * 0.8, this, 0, 0x9fe8ff, 1.32);
          A.sfxShot(g, this.x, this.z);
        }
      }
    } else if (Math.hypot(mvX, mvZ) > 0.01) {
      this.aim = approachAngle(this.aim, Math.atan2(mvX, mvZ), dt * 5);
    }
    const m = Math.hypot(mvX, mvZ);
    if (m > 0.01) {
      const sp = 9.6;
      const [nx, nz] = world.moveCircle(this.x, this.z, mvX / m * sp * dt, mvZ / m * sp * dt, this.radius);
      this.x = nx; this.z = nz;
    }
    this.syncMesh(dt, m * 9.6);
  }
}

// ---------------------------------------------------------------------------
// CIVILIAN -- dances until the shooting starts, then runs
// ---------------------------------------------------------------------------
export class Civilian {
  constructor(scene, x, z, rng) {
    this.x = x; this.z = z;
    this.radius = 0.7;
    this.team = 'civ';
    this.dead = false;
    this.panic = false;
    this.panicT = 0;
    this.screamT = Math.random() * 3;
    this.rig = makeCivilian(rng);
    this.rig.root.position.set(x, 0, z);
    this.rig.root.rotation.y = rng() * TAU;
    scene.add(this.rig.root);
    this.scene = scene;
    this.fleeA = rng() * TAU;
    this.repick = 0;
    this.energy = 0.7 + rng() * 0.5;
  }
  startPanic() {
    if (this.panic) return;
    this.panic = true;
    this.panicT = 0;
    if (Math.random() < 0.5) A.sfxScream(this.x, this.z);
  }
  damage() { if (this.dead) return false; this.dead = true; return true; }
  update(dt, world, player, time, kickPulse) {
    if (this.dead) return;
    if (!this.panic) {
      this.rig.dance(time, this.energy * (0.7 + kickPulse * 0.6));
      this.rig.root.position.set(this.x, 0, this.z);
      return;
    }
    this.panicT += dt;
    this.repick -= dt;
    this.screamT -= dt;
    if (this.screamT <= 0) { this.screamT = 2.5 + Math.random() * 5; if (Math.random() < 0.3) A.sfxScream(this.x, this.z); }
    // run away from the player, repicking a heading when they hit a wall
    const away = Math.atan2(this.x - player.x, this.z - player.z);
    if (this.repick <= 0) { this.fleeA = away + (Math.random() - 0.5) * 1.4; this.repick = 0.5 + Math.random() * 0.7; }
    const sp = 13.5;
    let dx = Math.sin(this.fleeA) * sp * dt, dz = Math.cos(this.fleeA) * sp * dt;
    const [nx, nz] = world.moveCircle(this.x, this.z, dx, dz, this.radius);
    if (Math.abs(nx - this.x) < 1e-6 && Math.abs(nz - this.z) < 1e-6) this.repick = 0;
    // shove doors open in the stampede
    const d = world.doorContact(this.x + dx, this.z + dz, this.radius);
    if (d) { world.openDoor(d, dx, dz, true); A.sfxDoorSlam(this.x, this.z); }
    this.x = nx; this.z = nz;
    this.rig.root.position.set(this.x, 0, this.z);
    this.rig.update(dt, sp, this.fleeA, { twoHanded: false });
    this.rig.arms[0].sh.rotation.x = -2.2 + Math.sin(this.panicT * 14) * 0.5;
    this.rig.arms[1].sh.rotation.x = -2.2 + Math.sin(this.panicT * 14 + 1) * 0.5;
  }
  remove() { this.scene.remove(this.rig.root); }
}

// ---------------------------------------------------------------------------
// INTERROGATION TARGET -- runs, does not fight, must be taken alive
// ---------------------------------------------------------------------------
export class Target extends Actor {
  constructor(scene, x, z) {
    super(scene, x, z, {
      hp: 150, team: 'company', radius: R_ENEMY,
      palette: { cloth: 0x54406b, accent: 0xf0d060, glow: 0xf0d060, skin: 0xd2a381, hair: 0x2a1c12, boot: 0x1a1a20 },
    });
    this.isTarget = true;
    this.downed = false;
    this.fleeA = 0;
    this.repick = 0;
    this.spooked = false;
  }
  damage(n) {
    if (this.downed) return false;
    this.hp -= n * 0.55;                 // he soaks it -- you need him breathing
    this.rig.hurt();
    if (this.hp <= 0) { this.downed = true; this.hp = 0; return true; }
    return false;
  }
  update(dt, world, player) {
    if (this.downed) {
      this.rig.setDive(0.85);
      this.rig.root.position.set(this.x, 0, this.z);
      return;
    }
    const d = dist(this.x, this.z, player.x, player.z);
    if (d < 34) this.spooked = true;
    if (!this.spooked) { this.syncMesh(dt, 0); return; }
    this.repick -= dt;
    const away = Math.atan2(this.x - player.x, this.z - player.z);
    if (this.repick <= 0) { this.fleeA = away + (Math.random() - 0.5) * 1.1; this.repick = 0.45 + Math.random() * 0.5; }
    const sp = 12.2;
    const dx = Math.sin(this.fleeA) * sp * dt, dz = Math.cos(this.fleeA) * sp * dt;
    const [nx, nz] = world.moveCircle(this.x, this.z, dx, dz, this.radius);
    if (Math.abs(nx - this.x) < 1e-6 && Math.abs(nz - this.z) < 1e-6) this.repick = 0;
    const door = world.doorContact(this.x + dx, this.z + dz, this.radius);
    if (door) { world.openDoor(door, dx, dz, true); A.sfxDoorSlam(this.x, this.z); }
    this.x = nx; this.z = nz;
    this.aim = this.fleeA;
    this.syncMesh(dt, sp);
  }
}


// ---------------------------------------------------------------------------
// THROWN WEAPON -- a gun in flight. Hurts, staggers, then lands as loot.
// ---------------------------------------------------------------------------
export class ThrownWeapon {
  constructor(scene, x, z, dirX, dirZ, g, owner) {
    this.x = x; this.z = z; this.y = 1.35;
    this.dx = dirX; this.dz = dirZ;
    this.speed = 34;
    this.gun = g;
    this.owner = owner;
    this.done = false;
    this.landed = false;
    this.life = 2.2;
    // heavier guns hit harder; a Barrett to the face is not a light tap
    this.dmg = 26 + Math.min(64, g.dmg * 0.55 + g.bulk * 90);
    this.mesh = makeGunMesh(g);
    this.mesh.scale.setScalar(1.4);
    this.mesh.position.set(x, this.y, z);
    scene.add(this.mesh);
    this.scene = scene;
    this.spin = 26 + Math.random() * 10;
  }
  update(dt, world, actors, onHit) {
    if (this.done) return;
    this.life -= dt;
    const travel = this.speed * dt;
    const steps = Math.max(1, Math.ceil(travel / 1.0));
    const st = travel / steps;
    for (let i = 0; i < steps; i++) {
      const nx = this.x + this.dx * st, nz = this.z + this.dz * st;
      if (world.solidAtWorld(nx, nz)) {
        const d = world.doorContact(nx, nz, 0.3);
        if (d) world.openDoor(d, this.dx, this.dz, true);
        this.land(onHit); return;
      }
      for (const a of actors) {
        if (a.dead || a === this.owner || a.team === this.owner?.team) continue;
        if ((nx - a.x) ** 2 + (nz - a.z) ** 2 < (a.radius + 0.4) ** 2) {
          onHit?.({ kind: 'thrown', actor: a, x: nx, z: nz, dmg: this.dmg, weapon: this });
          this.land(onHit, nx, nz); return;
        }
      }
      this.x = nx; this.z = nz;
    }
    this.speed = Math.max(6, this.speed - 16 * dt);
    this.y = Math.max(0.35, this.y - (2.2 - this.life) * 2.4 * dt);
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.x += this.spin * dt;
    this.mesh.rotation.y = Math.atan2(this.dx, this.dz);
    if (this.life <= 0) this.land(onHit);
  }
  land(onHit, x, z) {
    if (this.done) return;
    this.done = true; this.landed = true;
    this.scene.remove(this.mesh);
    onHit?.({ kind: 'thrown-landed', x: x ?? this.x, z: z ?? this.z, gun: this.gun });
  }
}

// ---------------------------------------------------------------------------
// PICKUPS
// ---------------------------------------------------------------------------
export class Pickup {
  constructor(scene, x, z, kind, g) {
    this.x = x; this.z = z; this.kind = kind; this.gun = g;
    this.mesh = makePickupMesh(kind, g);
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.scene = scene;
    this.taken = false;
    this.t = Math.random() * 6;
  }
  update(dt) {
    if (this.taken) return;
    this.t += dt;
    this.mesh.rotation.y += dt * 1.1;
    this.mesh.position.y = Math.sin(this.t * 2.2) * 0.10 + 0.15;
  }
  take() { this.taken = true; this.scene.remove(this.mesh); }
}

// ---------------------------------------------------------------------------
// CORPSES + blood decals + shell casings
// ---------------------------------------------------------------------------
export class Debris {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.bloodGeo = new THREE.CircleGeometry(1, 14);
    this.bloodGeo.rotateX(-Math.PI / 2);
    this.casings = [];
    this.casingGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.13, 6);
    this.casingMat = new THREE.MeshStandardMaterial({ color: 0xd8b24a, metalness: 0.9, roughness: 0.3 });
    this.sparks = [];
    this.sparkGeo = new THREE.SphereGeometry(0.07, 5, 4);
    this.decals = 0;
  }
  blood(x, z, scale = 1) {
    if (this.decals > 260) return;
    this.decals++;
    const m = new THREE.Mesh(this.bloodGeo, new THREE.MeshBasicMaterial({
      color: 0x6e0d12, transparent: true, opacity: 0.82, depthWrite: false }));
    m.position.set(x, 0.035 + Math.random() * 0.01, z);
    m.scale.setScalar((0.7 + Math.random() * 0.9) * scale);
    m.rotation.z = Math.random() * TAU;
    this.group.add(m);
  }
  casing(x, y, z, dirX, dirZ) {
    if (this.casings.length > 150) {
      const old = this.casings.shift();
      this.group.remove(old.mesh);
    }
    const m = new THREE.Mesh(this.casingGeo, this.casingMat);
    m.position.set(x, y, z);
    this.group.add(m);
    const side = Math.random() < 0.5 ? 1 : -1;
    this.casings.push({
      mesh: m,
      vx: -dirZ * side * (2.5 + Math.random() * 2) + dirX * 1.4,
      vz: dirX * side * (2.5 + Math.random() * 2) + dirZ * 1.4,
      vy: 3 + Math.random() * 2,
      rx: (Math.random() - 0.5) * 24, rz: (Math.random() - 0.5) * 24,
      rest: false,
    });
  }
  spark(x, z, color = 0xffc46b) {
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(this.sparkGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false }));
      m.position.set(x, 1.2 + Math.random() * 0.5, z);
      this.group.add(m);
      this.sparks.push({
        mesh: m, life: 0.32,
        vx: (Math.random() - 0.5) * 11, vy: Math.random() * 7, vz: (Math.random() - 0.5) * 11,
      });
    }
  }
  bloodBurst(x, z) {
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(this.sparkGeo, new THREE.MeshBasicMaterial({ color: 0x9c1119, transparent: true, opacity: 1, depthWrite: false }));
      m.position.set(x, 1.3, z);
      m.scale.setScalar(1 + Math.random());
      this.group.add(m);
      this.sparks.push({ mesh: m, life: 0.5, vx: (Math.random() - 0.5) * 9, vy: Math.random() * 6, vz: (Math.random() - 0.5) * 9, blood: true, x, z });
    }
  }
  update(dt) {
    for (let i = this.casings.length - 1; i >= 0; i--) {
      const c = this.casings[i];
      if (c.rest) continue;
      c.vy -= 30 * dt;
      c.mesh.position.x += c.vx * dt;
      c.mesh.position.y += c.vy * dt;
      c.mesh.position.z += c.vz * dt;
      c.mesh.rotation.x += c.rx * dt;
      c.mesh.rotation.z += c.rz * dt;
      if (c.mesh.position.y <= 0.06) {
        c.mesh.position.y = 0.06; c.vy = 0; c.vx *= 0.3; c.vz *= 0.3;
        c.rx = 0; c.rz = 0; c.mesh.rotation.x = Math.PI / 2;
        if (Math.hypot(c.vx, c.vz) < 0.4) c.rest = true;
      }
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      s.vy -= 26 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.mesh.material.opacity = Math.max(0, s.life * 3);
      if (s.life <= 0) {
        if (s.blood) this.blood(s.mesh.position.x, s.mesh.position.z, 0.5);
        this.group.remove(s.mesh);
        s.mesh.material.dispose();
        this.sparks.splice(i, 1);
      }
    }
  }
  clear() {
    this.scene.remove(this.group);
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.casings.length = 0; this.sparks.length = 0; this.decals = 0;
  }
}

// a killed actor is frozen in place and dropped flat
export function makeCorpse(actor, scene) {
  const rig = actor.rig;
  rig.root.rotation.x = -Math.PI / 2 + (Math.random() - 0.5) * 0.3;
  rig.root.position.y = 0.30;
  rig.root.rotation.z = (Math.random() - 0.5) * 0.6;
  for (const L of rig.legs) { L.hip.rotation.x = (Math.random() - 0.5) * 0.7; L.knee.rotation.x = Math.random() * 0.5; }
  for (const A2 of rig.arms) { A2.sh.rotation.x = (Math.random() - 0.5) * 1.4; A2.sh.rotation.z = A2.side * (0.6 + Math.random() * 0.7); A2.elbow.rotation.x = Math.random() * 0.6; }
  if (rig.materials) rig.materials.mCloth.emissive.setRGB(0, 0, 0);
  return rig.root;
}
