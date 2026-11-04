// ============================================================================
// Procedural geometry. Characters are smooth capsule-and-sphere rigs with
// real limb animation; weapons are built from their own stat block so an LMG
// visibly reads as an LMG at a glance from overhead.
// ============================================================================
import * as THREE from '../vendor/three.module.js';

const GEO = {};
const cap = (r, l, cs = 6, rs = 16) => (GEO[`c${r}_${l}`] ||= new THREE.CapsuleGeometry(r, l, cs, rs));
const sph = (r, s = 20) => (GEO[`s${r}`] ||= new THREE.SphereGeometry(r, s, Math.max(8, s / 2)));
const box = (w, h, d, r = 0) => (GEO[`b${w}_${h}_${d}`] ||= new THREE.BoxGeometry(w, h, d));
const cyl = (rt, rb, h, s = 16) => (GEO[`y${rt}_${rb}_${h}`] ||= new THREE.CylinderGeometry(rt, rb, h, s));

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: opts.rough ?? 0.42,
    metalness: opts.metal ?? 0.15,
    emissive: new THREE.Color(opts.emissive ?? 0x000000),
    emissiveIntensity: opts.ei ?? 1,
    flatShading: false,
    ...(opts.transparent ? { transparent: true, opacity: opts.opacity ?? 1 } : {}),
  });
}

// ---------------------------------------------------------------------------
// CHARACTER RIG
// ---------------------------------------------------------------------------
export function makeCharacter(opts = {}) {
  const skin   = opts.skin   ?? 0xb9866a;
  const cloth  = opts.cloth  ?? 0x2a2f38;
  const accent = opts.accent ?? 0xff2d3d;
  const boot   = opts.boot   ?? 0x14171c;
  const glow   = opts.glow   ?? accent;

  const mCloth  = mat(cloth, { rough: 0.55, metal: 0.05 });
  const mAccent = mat(accent, { rough: 0.35, metal: 0.25, emissive: glow, ei: 0.28 });
  const mSkin   = mat(skin,  { rough: 0.62, metal: 0.0 });
  const mBoot   = mat(boot,  { rough: 0.7,  metal: 0.05 });
  const mVisor  = mat(0x0a0d12, { rough: 0.12, metal: 0.8, emissive: glow, ei: 0.5 });

  const root = new THREE.Group();

  // --- hips + legs ---------------------------------------------------------
  const hips = new THREE.Group(); hips.position.y = 0.86; root.add(hips);
  const pelvis = new THREE.Mesh(cap(0.26, 0.16), mCloth);
  pelvis.rotation.z = Math.PI / 2; pelvis.scale.set(1, 1.25, 0.85);
  hips.add(pelvis);

  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(0.17 * s, -0.05, 0); hips.add(hip);
    const thigh = new THREE.Mesh(cap(0.135, 0.34), mCloth);
    thigh.position.y = -0.24; hip.add(thigh);
    const knee = new THREE.Group(); knee.position.y = -0.46; hip.add(knee);
    const shin = new THREE.Mesh(cap(0.115, 0.30), mCloth);
    shin.position.y = -0.21; knee.add(shin);
    const foot = new THREE.Mesh(cap(0.10, 0.16), mBoot);
    foot.rotation.x = Math.PI / 2; foot.position.set(0, -0.40, 0.05); knee.add(foot);
    legs.push({ hip, knee, side: s });
  }

  // --- torso ---------------------------------------------------------------
  const torso = new THREE.Group(); torso.position.y = 0.30; hips.add(torso);
  const chest = new THREE.Mesh(cap(0.30, 0.30), mCloth);
  chest.position.y = 0.16; chest.scale.set(1.06, 1, 0.80); torso.add(chest);
  // plate carrier -- reads as a hard silhouette edge from directly above
  const rig = new THREE.Mesh(cap(0.31, 0.20), mAccent);
  rig.position.y = 0.16; rig.scale.set(1.02, 1, 0.62); torso.add(rig);
  const collar = new THREE.Mesh(cyl(0.13, 0.16, 0.10), mCloth);
  collar.position.y = 0.40; torso.add(collar);

  // --- head ----------------------------------------------------------------
  const neck = new THREE.Group(); neck.position.y = 0.46; torso.add(neck);
  const head = new THREE.Mesh(sph(0.20), mSkin);
  head.scale.set(0.95, 1.06, 1.0); neck.add(head);
  const hair = new THREE.Mesh(sph(0.205, 20), mat(opts.hair ?? 0x171a1f, { rough: 0.85 }));
  hair.scale.set(0.98, 0.92, 1.0); hair.position.y = 0.045; neck.add(hair);
  const visor = new THREE.Mesh(cap(0.075, 0.20), mVisor);
  visor.rotation.z = Math.PI / 2; visor.position.set(0, 0.02, 0.155);
  visor.scale.set(1, 1, 0.55); neck.add(visor);

  // --- arms ----------------------------------------------------------------
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(0.32 * s, 0.30, 0); torso.add(sh);
    const pad = new THREE.Mesh(sph(0.135), mAccent); sh.add(pad);
    const upper = new THREE.Mesh(cap(0.098, 0.24), mCloth);
    upper.position.y = -0.18; sh.add(upper);
    const elbow = new THREE.Group(); elbow.position.y = -0.36; sh.add(elbow);
    const fore = new THREE.Mesh(cap(0.085, 0.22), mCloth);
    fore.position.y = -0.16; elbow.add(fore);
    const hand = new THREE.Group(); hand.position.y = -0.32; elbow.add(hand);
    const fist = new THREE.Mesh(sph(0.088), mSkin); hand.add(fist);
    arms.push({ sh, elbow, hand, side: s });
  }
  const gunMount = new THREE.Group();
  arms[1].hand.add(gunMount);          // right hand carries the weapon

  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // -------------------------------------------------------------------------
  const api = {
    root, hips, torso, neck, head, legs, arms, gunMount, materials: { mCloth, mAccent, mSkin, mVisor },
    walkPhase: Math.random() * Math.PI * 2,
    _recoil: 0, _hurt: 0, _dive: 0,

    // speed: units/sec, aim: radians, dt: seconds
    update(dt, speed, aim, state = {}) {
      const moving = speed > 0.25;
      const cadence = 5.2 + Math.min(speed, 16) * 0.62;
      if (moving) this.walkPhase += dt * cadence;
      else this.walkPhase += dt * 1.6;

      const p = this.walkPhase;
      const amp = moving ? Math.min(1, speed / 9) : 0.10;

      // legs: opposed swing with a knee bend on the back stroke
      for (const L of this.legs) {
        const ph = p + (L.side > 0 ? 0 : Math.PI);
        const sw = Math.sin(ph) * 0.62 * amp;
        L.hip.rotation.x = sw;
        L.knee.rotation.x = Math.max(0, -Math.sin(ph - 0.7)) * 0.85 * amp;
        L.hip.rotation.z = L.side * 0.04;
      }
      // hips bob and counter-rotate
      this.hips.position.y = 0.86 + Math.abs(Math.sin(p)) * 0.045 * amp - this._dive * 0.55;
      this.hips.rotation.y = Math.sin(p) * 0.10 * amp;
      this.torso.rotation.y = -Math.sin(p) * 0.13 * amp;
      this.torso.rotation.x = 0.06 + amp * 0.06 + this._recoil * 0.28;

      // arms: the gun arm stays up and forward, the free arm swings
      const A0 = this.arms[0], A1 = this.arms[1];
      const twoHanded = state.twoHanded !== false;
      A1.sh.rotation.x = -1.30 - this._recoil * 0.5;
      A1.sh.rotation.z = -0.30;
      A1.elbow.rotation.x = 0.42;
      if (twoHanded) {
        A0.sh.rotation.x = -1.16;
        A0.sh.rotation.z = 0.62;
        A0.elbow.rotation.x = 0.80;
      } else {
        A0.sh.rotation.x = Math.sin(p) * 0.55 * amp - 0.10;
        A0.sh.rotation.z = 0.12;
        A0.elbow.rotation.x = 0.30 + Math.max(0, Math.sin(p)) * 0.4 * amp;
      }

      // head leads the aim slightly
      this.neck.rotation.y = Math.sin(p) * 0.05 * amp;
      this.neck.rotation.x = -0.10;

      if (this._recoil > 0) this._recoil = Math.max(0, this._recoil - dt * 7);
      if (this._hurt > 0) {
        this._hurt = Math.max(0, this._hurt - dt * 4);
        const f = this._hurt;
        this.materials.mCloth.emissive.setRGB(f * 0.55, 0, 0);
      } else this.materials.mCloth.emissive.setRGB(0, 0, 0);

      this.root.rotation.y = aim;
    },
    kick(v = 1) { this._recoil = Math.min(1.4, this._recoil + v); },
    hurt() { this._hurt = 1; },
    setDive(v) {
      this._dive = v;
      this.root.rotation.x = -v * 1.05;
      this.hips.position.y = 0.86 - v * 0.55;
    },
    dispose() {
      root.traverse(o => { if (o.isMesh && o.material && o.material.dispose) o.material.dispose(); });
    },
  };
  return api;
}

// --- a clubber: same rig, lighter build, dance animation --------------------
export function makeCivilian(rng) {
  const palettes = [
    { cloth: 0xe14f8f, accent: 0xffd166, hair: 0x2b1b12, skin: 0xd9a07c },
    { cloth: 0x3ad0d6, accent: 0xffffff, hair: 0x120e0a, skin: 0x8a5c3c },
    { cloth: 0xf5f2ea, accent: 0x7a5cff, hair: 0x4a2f1c, skin: 0xefc7a3 },
    { cloth: 0x7a5cff, accent: 0x39ff88, hair: 0x0d0d0d, skin: 0x5c3a26 },
    { cloth: 0xffd166, accent: 0xff4d6d, hair: 0x6b4423, skin: 0xc98a63 },
  ];
  const p = palettes[Math.floor(rng() * palettes.length)];
  const c = makeCharacter({ ...p, boot: 0x22252b, glow: p.accent });
  c.root.scale.setScalar(0.93 + rng() * 0.12);
  // A crowd this size doubles the shadow-map cost for very little visual gain,
  // so clubbers receive shadows but don't cast them.
  c.root.traverse(o => { if (o.isMesh) o.castShadow = false; });
  // civilians don't hold a rifle, so let both arms move freely
  const style = Math.floor(rng() * 4);
  const off = rng() * Math.PI * 2;
  c.dance = (t, energy) => {
    const b = t * 6.0 + off;
    const e = energy;
    const A0 = c.arms[0], A1 = c.arms[1];
    c.hips.position.y = 0.86 + Math.abs(Math.sin(b)) * 0.10 * e;
    c.hips.rotation.y = Math.sin(b * 0.5) * 0.35 * e;
    c.torso.rotation.y = Math.sin(b * 0.5 + 1) * 0.28 * e;
    c.torso.rotation.z = Math.sin(b) * 0.10 * e;
    c.neck.rotation.z = Math.sin(b + 0.4) * 0.16 * e;
    switch (style) {
      case 0:  // arms up
        A0.sh.rotation.x = -2.3 + Math.sin(b) * 0.35 * e; A0.sh.rotation.z = 0.5;
        A1.sh.rotation.x = -2.3 + Math.sin(b + 1) * 0.35 * e; A1.sh.rotation.z = -0.5;
        A0.elbow.rotation.x = 0.3; A1.elbow.rotation.x = 0.3; break;
      case 1:  // side to side
        A0.sh.rotation.z = 0.9 + Math.sin(b) * 0.5 * e;
        A1.sh.rotation.z = -0.9 - Math.sin(b) * 0.5 * e;
        A0.sh.rotation.x = -0.5; A1.sh.rotation.x = -0.5;
        A0.elbow.rotation.x = 0.9; A1.elbow.rotation.x = 0.9; break;
      case 2:  // pointing
        A1.sh.rotation.x = -2.6; A1.sh.rotation.z = -0.2 + Math.sin(b) * 0.4 * e;
        A1.elbow.rotation.x = 0.1;
        A0.sh.rotation.x = -0.3; A0.elbow.rotation.x = 1.2; break;
      default: // shoulder bounce
        A0.sh.rotation.x = -0.8 + Math.sin(b) * 0.6 * e; A0.elbow.rotation.x = 1.1;
        A1.sh.rotation.x = -0.8 + Math.sin(b + Math.PI) * 0.6 * e; A1.elbow.rotation.x = 1.1;
        A0.sh.rotation.z = 0.35; A1.sh.rotation.z = -0.35;
    }
    for (const L of c.legs) {
      L.hip.rotation.x = Math.sin(b + (L.side > 0 ? 0 : Math.PI)) * 0.18 * e;
      L.knee.rotation.x = Math.max(0, Math.sin(b * 2)) * 0.25 * e;
    }
  };
  return c;
}

// ---------------------------------------------------------------------------
// WEAPONS -- built from the gun's own stat block
// ---------------------------------------------------------------------------
const mBody  = mat(0x1b1e24, { rough: 0.38, metal: 0.55 });
const mMetal = mat(0x50565f, { rough: 0.30, metal: 0.85 });
const mWood  = mat(0x6b4526, { rough: 0.68, metal: 0.05 });
const mPoly  = mat(0x23272e, { rough: 0.52, metal: 0.10 });

export function makeGunMesh(g) {
  const grp = new THREE.Group();
  const isOld = g.year > 0 && g.year < 1960;
  const stockMat = isOld ? mWood : mPoly;

  // length and heft scale off class and cartridge power
  const L = { pistol: 0.34, smg: 0.62, ar: 0.92, shotgun: 0.95, sniper: 1.22, lmg: 1.10 }[g.cls] || 0.6;
  const bore = 0.028 + Math.min(0.030, g.dmg / 3600) + (g.cls === 'shotgun' ? 0.016 : 0);

  const barrel = new THREE.Mesh(cyl(bore, bore * 1.05, L * 0.62, 12), mMetal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = L * 0.42;
  grp.add(barrel);

  const receiver = new THREE.Mesh(cap(0.048, L * 0.34), mBody);
  receiver.rotation.x = Math.PI / 2;
  receiver.position.z = L * 0.10;
  receiver.scale.set(1, 1, 0.85);
  grp.add(receiver);

  const grip = new THREE.Mesh(cap(0.032, 0.10), mBody);
  grip.position.set(0, -0.085, -0.02);
  grip.rotation.x = 0.28;
  grp.add(grip);

  if (g.cls !== 'pistol') {
    const stock = new THREE.Mesh(cap(0.045, L * 0.26), stockMat);
    stock.rotation.x = Math.PI / 2;
    stock.position.z = -L * 0.30;
    stock.scale.set(0.9, 1, 0.75);
    grp.add(stock);
  }
  // magazine -- size tracks capacity, drums for the big ones
  if (!g.revolver) {
    if (g.mag >= 90) {
      const drum = new THREE.Mesh(cyl(0.10, 0.10, 0.055, 18), mBody);
      drum.position.set(0, -0.075, L * 0.02);
      grp.add(drum);
    } else {
      const mh = 0.07 + Math.min(0.14, g.mag / 240);
      const magm = new THREE.Mesh(box(0.045, mh, 0.075), mBody);
      magm.position.set(0, -mh / 2 - 0.03, L * 0.04);
      magm.rotation.x = g.cls === 'ar' || g.cls === 'smg' ? 0.14 : 0;
      grp.add(magm);
    }
  } else {
    const cylinder = new THREE.Mesh(cyl(0.052, 0.052, 0.07, 12), mMetal);
    cylinder.rotation.x = Math.PI / 2;
    cylinder.position.z = L * 0.02;
    grp.add(cylinder);
  }
  if (g.cls === 'sniper') {
    const scope = new THREE.Mesh(cyl(0.030, 0.030, L * 0.30, 12), mBody);
    scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.072, L * 0.14); grp.add(scope);
    const lens = new THREE.Mesh(cyl(0.030, 0.030, 0.012, 12), mat(0x66ccff, { emissive: 0x224466, ei: 0.8, metal: 0.9, rough: 0.1 }));
    lens.rotation.x = Math.PI / 2; lens.position.set(0, 0.072, L * 0.30); grp.add(lens);
  }
  if (g.cls === 'lmg') {
    const bipodA = new THREE.Mesh(cyl(0.010, 0.010, 0.16, 6), mMetal);
    bipodA.position.set(0.05, -0.08, L * 0.44); bipodA.rotation.z = -0.35; grp.add(bipodA);
    const bipodB = bipodA.clone(); bipodB.position.x = -0.05; bipodB.rotation.z = 0.35; grp.add(bipodB);
    const belt = new THREE.Mesh(box(0.05, 0.04, 0.14), mat(0x7a6a3a, { metal: 0.6, rough: 0.4 }));
    belt.position.set(0.055, -0.05, L * 0.02); grp.add(belt);
  }
  if (g.silenced) {
    const can = new THREE.Mesh(cyl(bore * 2.0, bore * 2.0, L * 0.26, 14), mat(0x121418, { rough: 0.55, metal: 0.5 }));
    can.rotation.x = Math.PI / 2; can.position.z = L * 0.80; grp.add(can);
  }
  const muzzleZ = L * (g.silenced ? 0.93 : 0.74);
  grp.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  grp.userData.muzzle = new THREE.Vector3(0, 0, muzzleZ);
  grp.userData.length = L;
  return grp;
}

// how the rig holds the weapon
export function fitGunToHand(mount, mesh, g) {
  mesh.position.set(0, -0.02, 0.10);
  mesh.rotation.set(Math.PI / 2 - 0.10, 0, 0);
  mount.add(mesh);
}

// ---------------------------------------------------------------------------
// EFFECTS
// ---------------------------------------------------------------------------
export function makeMuzzleFlash() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(sph(0.16, 10), new THREE.MeshBasicMaterial({
    color: 0xfff0b0, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
  core.scale.set(1, 1, 2.2);
  const halo = new THREE.Mesh(sph(0.34, 10), new THREE.MeshBasicMaterial({
    color: 0xff9b3a, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.set(1, 1, 1.5);
  g.add(core, halo);
  g.visible = false;
  return g;
}

export function makeTracerMesh() {
  const geo = new THREE.CylinderGeometry(0.022, 0.022, 1, 6, 1, true);
  geo.rotateX(Math.PI / 2);
  const m = new THREE.MeshBasicMaterial({
    color: 0xffe08a, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  return new THREE.Mesh(geo, m);
}

export function makeProp(kind, palette) {
  const T4 = 4;
  const m = (c, o) => mat(c, o);
  const g = new THREE.Group();
  const wall = palette.wall ?? 0x333333, trim = palette.trim ?? 0x555555;
  const add = (geo, mm, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const me = new THREE.Mesh(geo, mm);
    me.position.set(x, y, z); me.rotation.set(rx, ry, rz);
    me.castShadow = true; me.receiveShadow = true; g.add(me); return me;
  };
  switch (kind) {
    case 'desk':      add(box(3.4, 0.16, 2.0), m(0x6d5237, { rough: 0.6 }), 0, 1.05, 0);
                      add(box(3.0, 0.9, 0.16), m(0x3a2c1e), 0, 0.55, -0.85);
                      add(box(0.7, 0.5, 0.5), m(0x1a1d22, { metal: 0.4 }), 1.0, 1.38, 0.1); break;
    case 'cabinet':   add(box(1.7, 2.5, 1.7), m(0x5a6068, { metal: 0.5, rough: 0.4 }), 0, 1.25, 0);
                      for (let i = 0; i < 3; i++) add(box(1.4, 0.07, 0.1), m(0x9aa2ac, { metal: 0.7 }), 0, 0.5 + i * 0.7, 0.88); break;
    case 'partition': add(box(3.6, 1.5, 0.28), m(0x4a5058, { rough: 0.8 }), 0, 0.75, 0); break;
    case 'plant':     add(cyl(0.45, 0.55, 0.7, 12), m(0x6b4a33), 0, 0.35, 0);
                      add(sph(0.85, 12), m(0x2f6b3a, { rough: 0.9 }), 0, 1.25, 0); break;
    case 'crate':     add(box(2.6, 2.4, 2.6), m(0x7a5a34, { rough: 0.85 }), 0, 1.2, 0);
                      add(box(2.7, 0.16, 0.2), m(0x4a3520), 0, 1.6, 1.25);
                      add(box(2.7, 0.16, 0.2), m(0x4a3520), 0, 0.7, 1.25); break;
    case 'pallet':    add(box(3.2, 0.9, 3.0), m(0x8a6a3e, { rough: 0.9 }), 0, 0.45, 0);
                      add(box(3.0, 0.5, 2.8), m(0x555b62, { metal: 0.4 }), 0, 1.15, 0); break;
    case 'shelf':     add(box(3.4, 3.0, 1.2), m(0x3f454d, { metal: 0.45 }), 0, 1.5, 0);
                      for (let i = 0; i < 3; i++) add(box(3.5, 0.1, 1.4), m(0x6a727c, { metal: 0.6 }), 0, 0.7 + i * 0.9, 0); break;
    case 'drum':      for (const [ox, oz, c2] of [[-0.85, -0.6, 0xa8452e], [0.85, -0.4, 0x8a6a28], [0, 0.85, 0x3f6a8a]]) {
                        add(cyl(0.82, 0.82, 2.4, 14), m(c2, { metal: 0.55, rough: 0.42 }), ox, 1.2, oz);
                        add(cyl(0.85, 0.85, 0.12, 14), m(0x2a2d33, { metal: 0.7 }), ox, 1.9, oz);
                        add(cyl(0.85, 0.85, 0.12, 14), m(0x2a2d33, { metal: 0.7 }), ox, 0.5, oz);
                      } break;
    case 'barrier':   add(box(3.6, 1.2, 0.5), m(0xc9a227, { rough: 0.6 }), 0, 0.6, 0);
                      add(box(3.6, 0.25, 0.55), m(0x1a1a1a), 0, 0.95, 0); break;
    case 'machine':   add(box(2.8, 2.6, 2.4), m(0x40474f, { metal: 0.6, rough: 0.35 }), 0, 1.3, 0);
                      add(cyl(0.3, 0.3, 1.2, 10), m(0x7d848c, { metal: 0.8 }), 0.9, 2.4, 0);
                      add(box(0.9, 0.6, 0.1), m(0x14ff7a, { emissive: 0x0a8a44, ei: 1.4 }), 0, 1.8, 1.25); break;
    case 'pipe':      add(cyl(0.35, 0.35, 3.6, 12), m(0x6a7078, { metal: 0.75 }), 0, 0.9, 0, 0, 0, Math.PI / 2); break;
    case 'bed':       add(box(2.2, 0.7, 3.4), m(0xd8d8d0, { rough: 0.85 }), 0, 0.6, 0);
                      add(box(2.3, 0.25, 0.5), m(0x8b9099, { metal: 0.5 }), 0, 1.1, -1.6); break;
    case 'cart':      add(box(1.6, 0.14, 2.2), m(0xb9c0c8, { metal: 0.7 }), 0, 1.1, 0);
                      add(box(1.5, 0.12, 2.0), m(0x8b9099, { metal: 0.7 }), 0, 0.55, 0); break;
    case 'locker':    add(box(3.4, 3.2, 1.6), m(0x35506b, { metal: 0.5 }), 0, 1.6, 0);
                      for (const sx of [-1.1, 0, 1.1]) {
                        add(box(0.05, 3.0, 0.05), m(0x22384d, { metal: 0.6 }), sx + 0.55, 1.6, 0.82);
                        add(box(0.09, 0.34, 0.09), m(0xc0c8d0, { metal: 0.9 }), sx + 0.35, 1.75, 0.84);
                      } break;
    case 'curtain':   add(box(0.16, 3.0, 3.8), m(0x7ec8d8, { rough: 0.95, transparent: true, opacity: 0.8 }), 0, 1.5, 0);
                      add(box(0.22, 0.10, 3.9), m(0x9aa3ad, { metal: 0.8 }), 0, 3.05, 0); break;
    case 'sofa':      add(box(3.4, 0.8, 1.6), m(0x7a4a52, { rough: 0.95 }), 0, 0.5, 0);
                      add(box(3.4, 1.1, 0.5), m(0x6a3e46, { rough: 0.95 }), 0, 0.85, -0.7); break;
    case 'table':     add(cyl(1.1, 1.1, 0.14, 16), m(0x5a4130, { rough: 0.6 }), 0, 1.05, 0);
                      add(cyl(0.16, 0.24, 1.0, 10), m(0x3a2c20), 0, 0.5, 0); break;
    case 'counter':   add(box(3.6, 1.6, 1.6), m(0x8a8378, { rough: 0.7 }), 0, 0.8, 0);
                      add(box(3.8, 0.16, 1.8), m(0x2e3238, { rough: 0.3, metal: 0.4 }), 0, 1.66, 0); break;
    case 'fridge':    add(box(2.9, 3.3, 2.2), m(0xd0d4d8, { metal: 0.6, rough: 0.3 }), 0, 1.65, 0);
                      add(box(2.85, 0.08, 0.08), m(0x9aa3ad, { metal: 0.8 }), 0, 2.05, 1.12);
                      add(box(0.1, 1.1, 0.1), m(0x60686f, { metal: 0.9 }), 1.25, 2.6, 1.14);
                      add(box(0.1, 1.1, 0.1), m(0x60686f, { metal: 0.9 }), 1.25, 1.2, 1.14); break;
    case 'booth':     add(box(3.6, 1.5, 1.3), m(0x2a1230, { rough: 0.9 }), 0, 0.75, -0.9);
                      add(box(3.6, 0.6, 1.4), m(0x3d1a46, { rough: 0.9 }), 0, 0.5, 0.5);
                      add(box(3.7, 0.08, 0.12), m(0xff2fa0, { emissive: 0xff2fa0, ei: 2.4 }), 0, 1.52, -0.28); break;
    case 'bar':       add(box(3.9, 1.7, 1.7), m(0x160a1c, { rough: 0.35, metal: 0.3 }), 0, 0.85, 0);
                      add(box(4.0, 0.14, 1.9), m(0x2b1533, { rough: 0.12, metal: 0.75 }), 0, 1.72, 0);
                      add(box(3.9, 0.10, 0.10), m(0x35f0ff, { emissive: 0x35f0ff, ei: 3.0 }), 0, 0.32, 0.88); break;
    case 'bottles':   add(box(3.4, 3.4, 1.1), m(0x120a16, { rough: 0.4 }), 0, 1.7, 0);
                      for (let i = 0; i < 8; i++) {
                        const h = 0.35 + (i % 3) * 0.12;
                        add(cyl(0.09, 0.11, h, 8),
                            m([0x39ff88, 0xffd166, 0xff4d6d, 0x7a5cff][i % 4],
                              { emissive: [0x1a7a44, 0x7a6330, 0x7a2434, 0x3a2c7a][i % 4], ei: 1.6, rough: 0.15, metal: 0.3 }),
                            -0.7 + (i % 4) * 0.46, 0.9 + Math.floor(i / 4) * 0.9 + h / 2, 0);
                      } break;
    case 'speaker':   add(box(2.9, 4.2, 2.2), m(0x0d0d10, { rough: 0.75 }), 0, 2.1, 0);
                      add(cyl(0.62, 0.62, 0.14, 18), m(0x1c1c22, { rough: 0.5 }), 0, 2.5, 0.82, Math.PI / 2);
                      add(cyl(0.40, 0.40, 0.14, 16), m(0x1c1c22, { rough: 0.5 }), 0, 1.4, 0.82, Math.PI / 2);
                      add(cyl(0.16, 0.16, 0.10, 12), m(0x2b2b34, { metal: 0.7 }), 0, 2.5, 0.90, Math.PI / 2); break;
    case 'dj':        add(box(3.8, 1.6, 1.5), m(0x0a0a10, { rough: 0.4, metal: 0.3 }), 0, 0.8, 0);
                      add(box(3.9, 0.12, 1.6), m(0x15151f, { rough: 0.2, metal: 0.6 }), 0, 1.64, 0);
                      add(cyl(0.42, 0.42, 0.08, 20), m(0x22232e, { metal: 0.7 }), -0.9, 1.72, 0, Math.PI / 2);
                      add(cyl(0.42, 0.42, 0.08, 20), m(0x22232e, { metal: 0.7 }), 0.9, 1.72, 0, Math.PI / 2);
                      add(box(3.9, 0.06, 0.06), m(0xff2fa0, { emissive: 0xff2fa0, ei: 3.2 }), 0, 0.28, 0.78); break;
    // ---- house / domestic -------------------------------------------------
    case 'car': {
      const body = m(0x37414d, { rough: 0.32, metal: 0.55 });
      add(box(3.0, 0.95, 3.9), body, 0, 0.85, 0);
      add(box(2.6, 0.80, 2.0), m(0x1b2027, { rough: 0.18, metal: 0.3 }), 0, 1.62, -0.25);
      add(box(2.62, 0.06, 1.9), m(0x86a7c4, { rough: 0.06, metal: 0.9 }), 0, 1.72, -0.24);
      for (const sx of [-1, 1]) for (const sz of [-1, 1])
        add(cyl(0.46, 0.46, 0.34, 16), m(0x121316, { rough: 0.95 }), sx * 1.45, 0.46, sz * 1.35, 0, 0, Math.PI / 2);
      add(box(0.55, 0.24, 0.10), m(0xfff2c0, { emissive: 0xffe89a, ei: 1.2 }), -0.9, 0.95, 1.96);
      add(box(0.55, 0.24, 0.10), m(0xfff2c0, { emissive: 0xffe89a, ei: 1.2 }), 0.9, 0.95, 1.96);
      break; }
    case 'bicycle': {
      const met = m(0x9aa3ad, { metal: 0.85, rough: 0.3 });
      for (const sz of [-0.7, 0.7])
        add(new THREE.TorusGeometry(0.52, 0.055, 8, 22), m(0x15161a, { rough: 0.85 }), 0, 0.55, sz, 0, Math.PI / 2, 0);
      add(cyl(0.045, 0.045, 1.5, 8), met, 0, 0.85, 0, Math.PI / 2);
      add(cyl(0.045, 0.045, 0.55, 8), met, 0, 0.85, -0.6, 0.5);
      add(box(0.36, 0.10, 0.16), m(0x8b1f2a, { rough: 0.6 }), 0, 1.14, 0.35);
      add(cyl(0.035, 0.035, 0.62, 8), met, 0, 1.22, -0.72, 0, 0, Math.PI / 2);
      break; }
    case 'crib': {
      add(box(2.6, 0.55, 3.4), m(0xf0e6d6, { rough: 0.72 }), 0, 1.0, 0);
      for (const sx of [-1, 1]) for (let i = 0; i < 7; i++)
        add(cyl(0.05, 0.05, 1.15, 7), m(0xf6efe2, { rough: 0.7 }), sx * 0.95, 1.35, -1.2 + i * 0.4);
      for (const sz of [-1, 1]) for (let i = 0; i < 4; i++)
        add(cyl(0.05, 0.05, 1.15, 7), m(0xf6efe2, { rough: 0.7 }), -0.75 + i * 0.5, 1.35, sz * 1.45);
      add(box(1.7, 0.22, 2.7), m(0xa8d8ea, { rough: 0.95 }), 0, 1.35, 0);
      add(box(0.7, 0.16, 0.5), m(0xffffff, { rough: 0.95 }), 0, 1.5, -1.0);
      break; }
    case 'workbench':
      add(box(3.6, 0.18, 1.6), m(0x6a4d2e, { rough: 0.8 }), 0, 1.35, 0);
      add(box(3.4, 1.2, 1.4), m(0x3d3f45, { metal: 0.4, rough: 0.6 }), 0, 0.65, 0);
      add(box(0.5, 0.35, 0.4), m(0x8c1f26, { rough: 0.5, metal: 0.4 }), 1.1, 1.6, 0);
      add(cyl(0.10, 0.10, 0.5, 10), m(0x9aa3ad, { metal: 0.9 }), -1.2, 1.6, 0, 0, 0, Math.PI / 2);
      break;
    case 'toolrack':
      add(box(3.5, 2.6, 0.3), m(0x4a5058, { metal: 0.5 }), 0, 1.6, -0.7);
      for (let i = 0; i < 7; i++)
        add(box(0.13, 0.5 + (i % 3) * 0.28, 0.13), m([0xd0d6dc, 0xc9a94e, 0x8c1f26][i % 3], { metal: 0.75, rough: 0.3 }),
            -1.4 + i * 0.47, 1.9 - (i % 3) * 0.1, -0.5);
      break;
    case 'counter':
      add(box(3.7, 1.55, 1.7), m(0xe6e2d8, { rough: 0.55 }), 0, 0.78, 0);
      add(box(3.85, 0.14, 1.85), m(0x2e3238, { rough: 0.22, metal: 0.45 }), 0, 1.62, 0);
      add(box(1.1, 0.09, 1.0), m(0xb9c2ca, { metal: 0.85, rough: 0.2 }), -0.9, 1.66, 0);
      break;
    case 'stove':
      add(box(2.0, 1.55, 1.8), m(0xc9ccd1, { metal: 0.55, rough: 0.35 }), 0, 0.78, 0);
      add(box(2.0, 0.10, 1.8), m(0x17191d, { rough: 0.25, metal: 0.4 }), 0, 1.62, 0);
      for (const sx of [-0.5, 0.5]) for (const sz of [-0.45, 0.45])
        add(cyl(0.32, 0.32, 0.05, 14), m(0x2c2f34, { rough: 0.4 }), sx, 1.68, sz);
      add(box(1.5, 0.7, 0.08), m(0x1b1d21, { rough: 0.15, metal: 0.3, emissive: 0x361008, ei: 0.6 }), 0, 0.85, 0.92);
      break;
    case 'chair':
      add(box(1.0, 0.14, 1.0), m(0x6a4a30, { rough: 0.72 }), 0, 0.95, 0);
      add(box(1.0, 1.15, 0.14), m(0x6a4a30, { rough: 0.72 }), 0, 1.5, -0.44);
      for (const sx of [-0.4, 0.4]) for (const sz of [-0.4, 0.4])
        add(cyl(0.07, 0.07, 0.9, 8), m(0x4a3320, { rough: 0.8 }), sx, 0.45, sz);
      break;
    case 'wardrobe':
      add(box(2.4, 3.4, 1.4), m(0x5a4230, { rough: 0.7 }), 0, 1.7, 0);
      add(box(0.06, 3.2, 0.05), m(0x2a1e14), 0, 1.7, 0.72);
      for (const sx of [-0.3, 0.3]) add(sph(0.09, 10), m(0xc9a94e, { metal: 0.9, rough: 0.2 }), sx, 1.7, 0.74);
      break;
    case 'nightstand':
      add(box(1.3, 1.2, 1.3), m(0x5a4230, { rough: 0.7 }), 0, 0.6, 0);
      add(box(1.0, 0.06, 0.06), m(0xc9a94e, { metal: 0.85 }), 0, 0.75, 0.68);
      add(cyl(0.22, 0.32, 0.45, 12), m(0xf2e6c8, { emissive: 0xffdca0, ei: 1.5, rough: 0.6 }), 0.2, 1.42, 0);
      break;
    case 'bathtub':
      add(box(2.2, 1.1, 3.6), m(0xf4f4f2, { rough: 0.22, metal: 0.05 }), 0, 0.55, 0);
      add(box(1.8, 0.2, 3.2), m(0xdfe7ea, { rough: 0.1, metal: 0.2 }), 0, 1.05, 0);
      add(cyl(0.07, 0.07, 0.5, 8), m(0xc3ccd4, { metal: 0.92, rough: 0.15 }), 0, 1.35, -1.5);
      break;
    case 'toilet':
      add(box(1.1, 0.95, 1.3), m(0xf6f6f4, { rough: 0.25 }), 0, 0.48, 0.1);
      add(cyl(0.55, 0.5, 0.28, 16), m(0xf6f6f4, { rough: 0.25 }), 0, 1.0, 0.2);
      add(box(1.15, 1.25, 0.5), m(0xf6f6f4, { rough: 0.25 }), 0, 0.9, -0.62);
      break;
    case 'sink':
      add(box(1.5, 0.9, 1.1), m(0xf2f2ef, { rough: 0.25 }), 0, 1.1, 0);
      add(cyl(0.42, 0.42, 0.14, 16), m(0xdfe7ea, { rough: 0.12, metal: 0.25 }), 0, 1.5, 0.05);
      add(cyl(0.06, 0.06, 0.42, 8), m(0xc3ccd4, { metal: 0.92, rough: 0.12 }), 0, 1.72, -0.35);
      break;
    case 'tvunit':
      add(box(3.2, 0.9, 1.2), m(0x2b2f35, { rough: 0.5 }), 0, 0.45, 0);
      add(box(2.9, 1.7, 0.10), m(0x0a0b0e, { rough: 0.14, metal: 0.4 }), 0, 1.75, -0.1);
      add(box(2.7, 1.5, 0.03), m(0x14202c, { emissive: 0x1d4e73, ei: 1.1, rough: 0.1 }), 0, 1.75, -0.03);
      break;
    case 'vending':
      add(box(2.9, 3.6, 1.8), m(0x8c1f26, { rough: 0.45, metal: 0.2 }), 0, 1.8, 0);
      add(box(1.4, 2.3, 0.06), m(0x0d1218, { emissive: 0x2b5a7a, ei: 0.9, rough: 0.1 }), 0, 2.0, 0.62);
      for (let i = 0; i < 6; i++)
        add(box(0.28, 0.4, 0.05), m([0xffd166, 0x39ff88, 0xff4d6d][i % 3], { emissive: [0x7a6330, 0x1a7a44, 0x7a2434][i % 3], ei: 0.8 }),
            -0.5 + (i % 3) * 0.5, 2.5 - Math.floor(i / 3) * 0.6, 0.66);
      break;
    case 'rack':
      add(box(2.8, 3.8, 2.6), m(0x15181d, { rough: 0.4, metal: 0.5 }), 0, 1.9, 0);
      for (let i = 0; i < 10; i++)
        add(box(1.3, 0.05, 0.05), m(i % 3 === 0 ? 0x39ff88 : 0x2b6ea8, { emissive: i % 3 === 0 ? 0x1a7a44 : 0x15405f, ei: 2.2 }),
            0, 0.5 + i * 0.32, 1.22);
      break;
    case 'gunrack':
      add(box(3.4, 2.8, 0.9), m(0x2f353c, { metal: 0.5, rough: 0.45 }), 0, 1.4, -0.4);
      for (let i = 0; i < 5; i++) {
        add(box(0.10, 1.7, 0.10), m(0x14161a, { rough: 0.5 }), -1.3 + i * 0.65, 1.6, 0.1);
        add(box(0.22, 0.5, 0.16), m(0x4a4038, { rough: 0.7 }), -1.3 + i * 0.65, 0.95, 0.1);
      }
      add(box(3.5, 0.10, 1.0), m(0x1b1e23, { metal: 0.4 }), 0, 0.35, -0.4);
      break;
    case 'optable':
      add(box(2.4, 0.24, 3.6), m(0xd8e2e6, { rough: 0.28, metal: 0.2 }), 0, 1.35, 0);
      add(cyl(0.28, 0.42, 1.25, 12), m(0x9aa5ad, { metal: 0.7, rough: 0.3 }), 0, 0.62, 0);
      add(cyl(0.7, 0.7, 0.22, 18), m(0xf4f8f2, { emissive: 0xdfeadd, ei: 1.8 }), 0, 3.0, 0);
      break;
    case 'slab':
      add(box(2.5, 0.18, 3.6), m(0xb9c2c8, { metal: 0.75, rough: 0.25 }), 0, 1.0, 0);
      add(box(2.3, 0.9, 3.4), m(0x6e777e, { metal: 0.6, rough: 0.35 }), 0, 0.5, 0);
      break;
    default:          add(box(2.2, 1.6, 2.2), m(wall, { rough: 0.7 }), 0, 0.8, 0);
  }
  return g;
}

export function makePickupMesh(kind, g) {
  const grp = new THREE.Group();
  if (kind === 'gun') {
    const gm = makeGunMesh(g);
    gm.scale.setScalar(1.5);
    gm.rotation.set(0, 0, 0.15);
    gm.position.y = 0.28;
    grp.add(gm);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.05, 24), new THREE.MeshBasicMaterial({
      color: 0xffc65c, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; grp.add(ring);
    grp.userData.spin = ring;
  } else if (kind === 'ammo') {
    const b = new THREE.Mesh(box(1.0, 0.6, 0.7), mat(0x3d5a3d, { rough: 0.6, metal: 0.3 }));
    b.position.y = 0.35; grp.add(b);
    const l = new THREE.Mesh(box(1.05, 0.12, 0.75), mat(0xffd166, { emissive: 0xffd166, ei: 1.4 }));
    l.position.y = 0.68; grp.add(l);
  } else {
    const b = new THREE.Mesh(box(0.9, 0.5, 0.7), mat(0xf2f2f2, { rough: 0.5 }));
    b.position.y = 0.3; grp.add(b);
    const c1 = new THREE.Mesh(box(0.5, 0.14, 0.14), mat(0xff3344, { emissive: 0xff3344, ei: 1.6 }));
    c1.position.y = 0.57; grp.add(c1);
    const c2 = new THREE.Mesh(box(0.14, 0.14, 0.5), mat(0xff3344, { emissive: 0xff3344, ei: 1.6 }));
    c2.position.y = 0.57; grp.add(c2);
  }
  grp.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return grp;
}


// ---------------------------------------------------------------------------
// DECOR -- flat or soft dressing that the player walks straight over
// ---------------------------------------------------------------------------
const decorCache = new Map();
export function makeDecor(kind) {
  if (decorCache.has(kind)) return decorCache.get(kind);
  const g = new THREE.Group();
  const flat = (w, d, color, y = 0.03, op = 1) => {
    const geo = new THREE.PlaneGeometry(w, d);
    geo.rotateX(-Math.PI / 2);
    const me = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: new THREE.Color(color), roughness: 0.95, metalness: 0,
      transparent: op < 1, opacity: op, depthWrite: op >= 1 }));
    me.position.y = y; me.receiveShadow = true; g.add(me); return me;
  };
  const add = (geo, mm, x, y, z, rx = 0) => {
    const me = new THREE.Mesh(geo, mm); me.position.set(x, y, z); me.rotation.x = rx;
    me.castShadow = true; g.add(me); return me;
  };
  switch (kind) {
    case 'rug':
      flat(3.4, 2.6, 0x7c3242, 0.03);
      flat(2.8, 2.0, 0x8f4152, 0.035);
      flat(1.9, 1.3, 0xa9566a, 0.04);
      break;
    case 'carpet':   flat(4, 4, 0x2f3740, 0.02, 0.9); break;
    case 'tiles':    flat(4, 4, 0xdadfe2, 0.02, 0.55); break;
    case 'oilstain': flat(2.6, 2.2, 0x0c0d10, 0.025, 0.8); break;
    case 'hazardstripe': {
      for (let i = 0; i < 5; i++) {
        const m2 = flat(0.55, 3.6, i % 2 ? 0x1b1b1b : 0xd8b830, 0.022, 0.95);
        m2.position.x = -1.4 + i * 0.7; m2.rotation.y = 0.5;
      } break; }
    case 'lamp':
      add(cyl(0.09, 0.14, 2.4, 10), mat(0x2c3138, { metal: 0.6 }), 0, 1.2, 0);
      add(cyl(0.55, 0.35, 0.6, 14), mat(0xf6e7c4, { emissive: 0xffdfa6, ei: 2.0, rough: 0.7 }), 0, 2.6, 0);
      break;
    case 'plantpot':
      add(cyl(0.42, 0.52, 0.7, 12), mat(0x8a5a3c, { rough: 0.85 }), 0, 0.35, 0);
      add(sph(0.8, 12), mat(0x2f6b3a, { rough: 0.92 }), 0, 1.15, 0);
      add(sph(0.55, 10), mat(0x3d8148, { rough: 0.92 }), 0.35, 1.55, 0.2);
      break;
    case 'picture':
      add(box(1.6, 1.1, 0.09), mat(0x4a3520, { rough: 0.7 }), 0, 3.1, -1.85);
      add(box(1.35, 0.88, 0.03), mat(0xb9a98d, { rough: 0.55 }), 0, 3.1, -1.79);
      break;
    case 'whiteboard':
      add(box(3.2, 1.9, 0.10), mat(0xf4f5f2, { rough: 0.35 }), 0, 2.6, -1.85);
      add(box(3.3, 0.12, 0.16), mat(0x9aa3ad, { metal: 0.7 }), 0, 1.6, -1.82);
      break;
    case 'toolbox':
      add(box(1.0, 0.5, 0.6), mat(0xc0392b, { rough: 0.5, metal: 0.3 }), 0, 0.25, 0);
      add(cyl(0.05, 0.05, 0.7, 8), mat(0x9aa3ad, { metal: 0.9 }), 0, 0.62, 0, 0);
      break;
    case 'paintcan':
      add(cyl(0.33, 0.33, 0.55, 14), mat(0xc9cdd2, { metal: 0.7, rough: 0.3 }), 0, 0.28, 0);
      add(cyl(0.30, 0.30, 0.06, 14), mat(0x6fa8dc, { rough: 0.4 }), 0, 0.58, 0);
      add(box(0.5, 0.06, 0.14), mat(0x6a4a30, { rough: 0.8 }), 0.5, 0.10, 0.3);
      flat(1.1, 0.9, 0x4a7fb5, 0.028, 0.8).position.set(0.7, 0.028, 0.35);
      break;
    case 'mobile':
      add(cyl(0.03, 0.03, 1.2, 6), mat(0xb9a98d), 0, 3.2, 0);
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * Math.PI * 2;
        add(sph(0.16, 10), mat([0xffd166, 0xa8d8ea, 0xf6a5c0, 0xb8e986][i], { emissive: 0x111111, rough: 0.7 }),
            Math.cos(a) * 0.5, 2.55, Math.sin(a) * 0.5);
      }
      break;
    // ---- wall-mounted -----------------------------------------------------
    case 'poster':
      add(box(1.5, 2.0, 0.05), mat(0xe8e2d2, { rough: 0.9 }), 0, 3.0, -1.9);
      add(box(1.3, 0.5, 0.02), mat(0xc0392b, { rough: 0.85 }), 0, 3.55, -1.86);
      add(box(1.2, 0.9, 0.02), mat(0x2c3e50, { rough: 0.85 }), 0, 2.75, -1.86);
      break;
    case 'noticeboard':
      add(box(2.6, 1.7, 0.10), mat(0x6b4f34, { rough: 0.85 }), 0, 3.0, -1.88);
      for (let i = 0; i < 6; i++)
        add(box(0.5, 0.62, 0.02), mat([0xf4f1e8, 0xfff3b0, 0xe8eef2][i % 3], { rough: 0.9 }),
            -0.85 + (i % 3) * 0.85, 3.25 - Math.floor(i / 3) * 0.72, -1.82);
      break;
    case 'graffiti':
      add(box(3.0, 1.8, 0.02), mat(0x39ff88, { emissive: 0x0d4a26, ei: 0.5, rough: 0.95, transparent: true, opacity: 0.55 }), 0, 2.4, -1.94);
      add(box(2.0, 0.9, 0.02), mat(0xff2fa0, { emissive: 0x5a0f36, ei: 0.5, rough: 0.95, transparent: true, opacity: 0.5 }), 0.5, 1.8, -1.93);
      break;
    case 'exitsign':
      add(box(1.1, 0.45, 0.10), mat(0x0d2a16, { rough: 0.5 }), 0, 4.3, -1.85);
      add(box(0.95, 0.32, 0.03), mat(0x2fff7a, { emissive: 0x2fff7a, ei: 3.2 }), 0, 4.3, -1.79);
      break;
    case 'warningsign':
      add(box(0.95, 0.95, 0.05), mat(0xe8c020, { rough: 0.6 }), 0, 3.1, -1.9, 0, 0, Math.PI / 4);
      add(box(0.12, 0.5, 0.03), mat(0x14161a), 0, 3.15, -1.86);
      add(box(0.12, 0.12, 0.03), mat(0x14161a), 0, 2.82, -1.86);
      break;
    case 'clock':
      add(cyl(0.45, 0.45, 0.09, 20), mat(0xf2f2ee, { rough: 0.4 }), 0, 3.6, -1.88, Math.PI / 2);
      add(box(0.05, 0.30, 0.02), mat(0x14161a), 0, 3.72, -1.83);
      add(box(0.22, 0.04, 0.02), mat(0x14161a), 0.09, 3.6, -1.83);
      break;
    case 'neonsign': {
      const hue = Math.random();
      const c1 = new THREE.Color().setHSL(hue, 1, 0.55).getHex();
      add(box(2.6, 0.14, 0.08), mat(c1, { emissive: c1, ei: 3.4 }), 0, 3.4, -1.86);
      add(box(0.14, 1.1, 0.08), mat(c1, { emissive: c1, ei: 3.4 }), -1.2, 2.9, -1.86);
      add(box(0.14, 1.1, 0.08), mat(c1, { emissive: c1, ei: 3.4 }), 1.2, 2.9, -1.86);
      add(box(1.8, 0.14, 0.08), mat(c1, { emissive: c1, ei: 3.4 }), 0, 2.4, -1.86);
      break; }
    case 'wallpipes':
      for (let i = 0; i < 3; i++)
        add(cyl(0.16, 0.16, 3.8, 10), mat([0x8a5a3c, 0x6a7078, 0x4a5058][i], { metal: 0.7, rough: 0.4 }),
            -0.5 + i * 0.5, 3.9, -1.7, 0, 0, Math.PI / 2);
      break;
    case 'ductwork':
      add(box(3.9, 0.9, 0.9), mat(0x8a9099, { metal: 0.65, rough: 0.45 }), 0, 4.7, 0);
      for (const sx of [-1.2, 0, 1.2]) add(box(0.14, 1.0, 1.0), mat(0x6a7078, { metal: 0.7 }), sx, 4.7, 0);
      break;
    case 'cables':
      for (let i = 0; i < 4; i++)
        add(cyl(0.05, 0.05, 3.9, 6), mat([0x14161a, 0x8c1f26, 0x1b4f8c, 0xd8b830][i], { rough: 0.7 }),
            -0.4 + i * 0.26, 4.9 - (i % 2) * 0.12, 0, 0, 0, Math.PI / 2);
      break;
    case 'strip':
      add(box(3.2, 0.16, 0.5), mat(0xf6f4e8, { emissive: 0xfff4d0, ei: 2.4 }), 0, 5.1, 0);
      add(box(3.4, 0.16, 0.62), mat(0x9aa3ad, { metal: 0.6 }), 0, 5.22, 0);
      break;
    // ---- floor litter -----------------------------------------------------
    case 'papers':
      for (let i = 0; i < 7; i++) {
        const m2 = flat(0.55, 0.75, [0xf2efe4, 0xe6e2d4, 0xfdfbf2][i % 3], 0.03 + i * 0.001, 0.95);
        m2.position.set((Math.random() - 0.5) * 2.6, m2.position.y, (Math.random() - 0.5) * 2.6);
        m2.rotation.y = Math.random() * Math.PI;
      } break;
    case 'spill':   flat(2.2, 1.8, 0x14202a, 0.026, 0.6); flat(1.2, 1.0, 0x0b141c, 0.03, 0.7); break;
    case 'rust':    flat(2.4, 2.0, 0x6b3a1e, 0.024, 0.45); break;
    case 'oldblood':flat(1.9, 1.5, 0x4a0d12, 0.024, 0.6); break;
    case 'cardboard':
      add(box(1.1, 0.55, 0.9), mat(0xa07a4a, { rough: 0.95 }), 0, 0.28, 0);
      add(box(0.9, 0.4, 0.75), mat(0x8a6636, { rough: 0.95 }), 0.6, 0.2, 0.5);
      break;
    case 'bottleslitter':
      for (let i = 0; i < 5; i++)
        add(cyl(0.1, 0.12, 0.4, 8), mat([0x2f6b3a, 0x6b4a20, 0x2a4a6b][i % 3], { rough: 0.2, metal: 0.3, transparent: true, opacity: 0.85 }),
            (Math.random() - 0.5) * 2.4, 0.2, (Math.random() - 0.5) * 2.4);
      break;
    case 'trolley':
      add(box(1.4, 0.1, 1.9), mat(0x9aa3ad, { metal: 0.75 }), 0, 0.9, 0);
      add(box(1.4, 0.9, 0.09), mat(0x9aa3ad, { metal: 0.75 }), 0, 1.35, -0.9);
      for (const sx of [-0.5, 0.5]) for (const sz of [-0.75, 0.75])
        add(cyl(0.16, 0.16, 0.1, 10), mat(0x1b1d21), sx, 0.16, sz, 0, 0, Math.PI / 2);
      break;
    case 'sandbags':
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2 - (i > 1 ? 1 : 0); j++)
        add(cap(0.28, 0.7), mat(0x7a6a48, { rough: 0.98 }), -0.7 + i * 0.7, 0.3 + j * 0.5, 0, 0, 0, Math.PI / 2);
      break;
    default: flat(2.4, 2.4, 0x333333, 0.02, 0.5);
  }
  decorCache.set(kind, g);
  return g;
}

// ---------------------------------------------------------------------------
// Collision footprints, in world units, matching the meshes above.
// `sight: false` means you can see (and be seen) over it but not shoot through
// it -- waist-high cover. Anything absent falls back to a 2.2m box.
// ---------------------------------------------------------------------------
export const PROP_FOOTPRINT = {
  desk:       { w: 3.4, d: 2.0, sight: false },
  partition:  { w: 3.6, d: 0.3, sight: false },
  cabinet:    { w: 1.7, d: 1.7, sight: true  },
  shelf:      { w: 3.4, d: 1.2, sight: true  },
  crate:      { w: 2.6, d: 2.6, sight: true  },
  pallet:     { w: 3.2, d: 3.0, sight: false },
  drum:       { w: 2.5, d: 2.3, sight: true  },
  barrier:    { w: 3.6, d: 0.5, sight: false },
  machine:    { w: 2.8, d: 2.4, sight: true  },
  bed:        { w: 2.2, d: 3.4, sight: false },
  locker:     { w: 3.4, d: 1.6, sight: true  },
  curtain:    { w: 0.2, d: 3.8, sight: false },
  sofa:       { w: 3.4, d: 1.6, sight: false },
  table:      { w: 2.2, d: 2.2, sight: false },
  counter:    { w: 3.7, d: 1.7, sight: false },
  fridge:     { w: 2.9, d: 2.2, sight: true  },
  stove:      { w: 2.0, d: 1.8, sight: false },
  wardrobe:   { w: 2.4, d: 1.4, sight: true  },
  bathtub:    { w: 2.2, d: 3.6, sight: false },
  tvunit:     { w: 3.2, d: 1.2, sight: false },
  vending:    { w: 2.9, d: 1.8, sight: true  },
  rack:       { w: 2.8, d: 2.6, sight: true  },
  gunrack:    { w: 3.4, d: 0.9, sight: true  },
  optable:    { w: 2.4, d: 3.6, sight: false },
  slab:       { w: 2.5, d: 3.6, sight: false },
  crib:       { w: 2.6, d: 3.4, sight: false },
  workbench:  { w: 3.6, d: 1.6, sight: false },
  toolrack:   { w: 3.5, d: 0.4, sight: true  },
  car:        { w: 3.0, d: 3.9, sight: true  },
  booth:      { w: 3.6, d: 2.4, sight: false },
  bar:        { w: 3.9, d: 1.7, sight: false },
  bottles:    { w: 3.4, d: 1.1, sight: true  },
  speaker:    { w: 2.9, d: 2.2, sight: true  },
  dj:         { w: 3.8, d: 1.5, sight: false },
  // small furniture -- honest little boxes, not tile-sized blockers
  chair:      { w: 1.0, d: 1.0, sight: false },
  nightstand: { w: 1.3, d: 1.3, sight: false },
  toilet:     { w: 1.2, d: 1.5, sight: false },
  sink:       { w: 1.5, d: 1.1, sight: false },
  cart:       { w: 1.6, d: 2.2, sight: false },
  bicycle:    { w: 1.6, d: 0.6, sight: false },
  plant:      { w: 1.7, d: 1.7, sight: false },
  pipe:       { w: 3.6, d: 0.7, sight: false },
};
export const DEFAULT_FOOTPRINT = { w: 2.2, d: 2.2, sight: true };
