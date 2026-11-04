// ============================================================================
// Turns a generated level into a Three.js scene: floors, walls, props, doors,
// lighting. Also owns all spatial queries -- collision, line of sight, and the
// DDA raycast every bullet uses.
// ============================================================================
import * as THREE from '../vendor/three.module.js';
import { T, BLOCKS_MOVE, BLOCKS_SHOT, BLOCKS_SIGHT, TILE } from './worldgen.js';
import { makeProp, makeDecor, PROP_FOOTPRINT, DEFAULT_FOOTPRINT } from './models.js';
import { musicPulse, musicStep } from './audio.js';


// ---------------------------------------------------------------------------
// Theme palettes. The world is coloured by what the building actually is --
// the character's colour is kept for UI, accents and fog tint only.
// ---------------------------------------------------------------------------
export const THEME_PAL = {
  house:      { floor: '#7a6450', wall: '#cabfae', trim: '#8b7359', fog: '#1c1611', amb: 0.72, sun: 1.30 },
  motel:      { floor: '#6d5744', wall: '#ab9276', trim: '#59463a', fog: '#1a1410', amb: 0.62, sun: 1.15 },
  office:     { floor: '#4e555e', wall: '#b6bcc4', trim: '#6d757e', fog: '#111519', amb: 0.70, sun: 1.20 },
  warehouse:  { floor: '#53565c', wall: '#6f7176', trim: '#3f4146', fog: '#15171a', amb: 0.60, sun: 1.10 },
  industrial: { floor: '#41454b', wall: '#5c6168', trim: '#2d3137', fog: '#0f1215', amb: 0.55, sun: 1.05 },
  clinic:     { floor: '#c2ccd1', wall: '#e6ecef', trim: '#98a6ad', fog: '#1b2327', amb: 0.85, sun: 1.35 },
  compound:   { floor: '#56595d', wall: '#787c74', trim: '#3e413d', fog: '#131510', amb: 0.62, sun: 1.15 },
  nightclub:  { floor: '#1b1122', wall: '#2c1938', trim: '#4d2c62', fog: '#0a0410', amb: 0.42, sun: 0.55 },
};
export function paletteFor(theme, char) {
  const t = THEME_PAL[theme] || THEME_PAL.office;
  return { ...t, color: char.color, accent: char.accent, charFog: char.fog };
}

// red / green / blue / yellow -- four-colour club rig
const DANCE_HUES = [0.00, 0.33, 0.605, 0.145];

const propCache = new Map();
function propTemplate(kind, palette, themeKey) {
  const k = themeKey + ':' + kind;
  if (!propCache.has(k)) propCache.set(k, makeProp(kind, palette));
  return propCache.get(k);
}

export class World {
  constructor(scene, gen, palette, theme) {
    this.scene = scene;
    this.gen = gen;
    this.W = gen.W; this.H = gen.H;
    this.grid = gen.grid;
    this.palette = palette;
    this.theme = theme;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.doors = [];
    this.doorAt = new Map();
    this.danceTiles = [];
    this.neons = [];
    this.time = 0;

    this.buildFloor();
    this.buildWalls();
    this.buildProps();
    this.buildObstacles();
    this.buildDoors();
    this.buildLights();
  }

  key(x, y) { return y * this.W + x; }
  tileAt(x, y) {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return T.SOLID;
    return this.grid[y * this.W + x];
  }
  setTile(x, y, v) { if (x >= 0 && y >= 0 && x < this.W && y < this.H) this.grid[y * this.W + x] = v; }
  // world coords -> tile
  tx(wx) { return Math.floor(wx / TILE); }
  tz(wz) { return Math.floor(wz / TILE); }
  center(x, y) { return [x * TILE + TILE / 2, y * TILE + TILE / 2]; }

  solidAtWorld(wx, wz) {
    const tx = this.tx(wx), tz = this.tz(wz);
    const t = this.tileAt(tx, tz);
    if (t === T.DOOR) { const d = this.doorAt.get(this.key(tx, tz)); if (d && !d.open) return true; }
    else if (BLOCKS_MOVE(t)) return true;
    const list = this._obsAt(tx, tz);
    if (list) for (const o of list) if (this._pointInObs(o, wx, wz)) return true;
    return false;
  }
  shotBlockedTile(x, y) {
    const t = this.tileAt(x, y);
    if (t === T.DOOR) { const d = this.doorAt.get(this.key(x, y)); return !!(d && !d.open); }
    return BLOCKS_SHOT(t);
  }
  sightBlockedTile(x, y) {
    const t = this.tileAt(x, y);
    if (t === T.DOOR) { const d = this.doorAt.get(this.key(x, y)); return !!(d && !d.open); }
    return BLOCKS_SIGHT(t);
  }

  // ---- floor: one plane, one canvas texture painted from the grid ---------
  buildFloor() {
    const W = this.W, H = this.H, S = 8;   // 8 px per tile
    const cv = document.createElement('canvas');
    cv.width = W * S; cv.height = H * S;
    const c = cv.getContext('2d');
    const p = this.palette;
    c.fillStyle = p.floor; c.fillRect(0, 0, cv.width, cv.height);
    const floorRGB = hexRGB(p.floor), wallRGB = hexRGB(p.wall);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = this.tileAt(x, y);
      let col;
      if (t === T.SOLID) col = 'rgb(5,6,10)';
      else if (t === T.WALL) col = rgbStr(wallRGB, 0);
      else {
        // subtle per-tile variation so big rooms are not flat
        const n = ((x * 73856093) ^ (y * 19349663)) & 255;
        const v = (n / 255 - 0.5) * 9 + ((x + y) % 2 === 0 ? 4 : 0);
        col = rgbStr(floorRGB, v);
      }
      c.fillStyle = col;
      c.fillRect(x * S, y * S, S, S);
    }
    // grout lines
    c.strokeStyle = 'rgba(0,0,0,0.13)'; c.lineWidth = 1;
    for (let x = 0; x <= W; x++) { c.beginPath(); c.moveTo(x * S, 0); c.lineTo(x * S, cv.height); c.stroke(); }
    for (let y = 0; y <= H; y++) { c.beginPath(); c.moveTo(0, y * S); c.lineTo(cv.width, y * S); c.stroke(); }

    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = 8;
    const geo = new THREE.PlaneGeometry(W * TILE, H * TILE);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.86, metalness: 0.05 }));
    mesh.position.set(W * TILE / 2, 0, H * TILE / 2);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.floorMesh = mesh;
  }

  // ---- walls: a single instanced mesh, interior-only culled ---------------
  buildWalls() {
    const list = [];
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) {
      if (this.tileAt(x, y) !== T.WALL) continue;
      // skip walls with no open neighbour -- they can never be seen
      let exposed = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const t = this.tileAt(x + dx, y + dy);
        if (t !== T.WALL && t !== T.SOLID) { exposed = true; break; }
      }
      if (exposed) list.push([x, y]);
    }
    const HGT = 5.6;
    const geo = new THREE.BoxGeometry(TILE, HGT, TILE);
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(this.palette.wall), roughness: 0.88, metalness: 0.06 });
    const inst = new THREE.InstancedMesh(geo, m, Math.max(1, list.length));
    inst.castShadow = true; inst.receiveShadow = true;
    const d = new THREE.Object3D();
    const col = new THREE.Color();
    list.forEach(([x, y], i) => {
      d.position.set(x * TILE + TILE / 2, HGT / 2, y * TILE + TILE / 2);
      d.updateMatrix(); inst.setMatrixAt(i, d.matrix);
      const n = (((x * 73856093) ^ (y * 19349663)) & 255) / 255;
      col.set(this.palette.wall).offsetHSL(0, 0, (n - 0.5) * 0.05);
      inst.setColorAt(i, col);
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    this.group.add(inst);
    this.wallMesh = inst;

    // a dark baseboard trim ring makes walls read against the floor
    const trimGeo = new THREE.BoxGeometry(TILE * 1.01, 0.34, TILE * 1.01);
    const trimMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(this.palette.trim || this.palette.wall), roughness: 0.6, metalness: 0.25 });
    const trim = new THREE.InstancedMesh(trimGeo, trimMat, Math.max(1, list.length));
    list.forEach(([x, y], i) => {
      d.position.set(x * TILE + TILE / 2, 0.17, y * TILE + TILE / 2);
      d.updateMatrix(); trim.setMatrixAt(i, d.matrix);
    });
    trim.instanceMatrix.needsUpdate = true;
    this.group.add(trim);
  }

  // ---- props + dancefloor -------------------------------------------------
  buildProps() {
    for (const p of this.gen.props) {
      const tpl = propTemplate(p.kind, this.palette, this.theme);
      const o = tpl.clone(true);
      const [wx, wz] = this.center(p.x, p.y);
      o.position.set(wx, 0, wz);
      o.rotation.y = p.rot || 0;
      this.group.add(o);
    }
    // flat / soft dressing -- rugs, stains, lamps. No collision.
    for (const d of this.gen.decor || []) {
      const o = makeDecor(d.kind).clone(true);
      const [wx, wz] = this.center(d.x, d.y);
      o.position.set(wx, 0, wz);
      o.rotation.y = d.rot || 0;
      if (d.scale && d.scale !== 1) o.scale.setScalar(d.scale);
      this.group.add(o);
    }

    // dancefloor: instanced emissive panels driven by the music
    const cells = [];
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++)
      if (this.tileAt(x, y) === T.DANCE) cells.push([x, y]);
    if (cells.length) {
      const geo = new THREE.BoxGeometry(TILE * 0.94, 0.14, TILE * 0.94);
      // Basic (unlit) material: per-instance colour IS the glow. A standard
      // material would only tint diffuse and the emissive would blow out white.
      const m = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
      const inst = new THREE.InstancedMesh(geo, m, cells.length);
      inst.receiveShadow = false;
      const d = new THREE.Object3D();
      cells.forEach(([x, y], i) => {
        d.position.set(x * TILE + TILE / 2, 0.07, y * TILE + TILE / 2);
        d.updateMatrix(); inst.setMatrixAt(i, d.matrix);
        inst.setColorAt(i, new THREE.Color(0x101018));
      });
      inst.instanceMatrix.needsUpdate = true;
      this.group.add(inst);
      this.danceMesh = inst;
      this.danceCells = cells;
      this._danceCx = cells.reduce((a, c2) => a + c2[0], 0) / cells.length;
      this._danceCy = cells.reduce((a, c2) => a + c2[1], 0) / cells.length;
      this._danceColor = new THREE.Color();
    }
    // STAGE tiles (DJ riser)
    const st = [];
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++)
      if (this.tileAt(x, y) === T.STAGE) st.push([x, y]);
    if (st.length) {
      const geo = new THREE.BoxGeometry(TILE, 1.2, TILE);
      const m = new THREE.MeshStandardMaterial({ color: 0x0c0c12, roughness: 0.5, metalness: 0.3 });
      const inst = new THREE.InstancedMesh(geo, m, st.length);
      inst.castShadow = true; inst.receiveShadow = true;
      const d = new THREE.Object3D();
      st.forEach(([x, y], i) => { d.position.set(x * TILE + TILE / 2, 0.6, y * TILE + TILE / 2); d.updateMatrix(); inst.setMatrixAt(i, d.matrix); });
      inst.instanceMatrix.needsUpdate = true;
      this.group.add(inst);
    }
  }

  // ---- doors: real hinged doors in a framed opening ----------------------
  buildDoors() {
    const LEAF_W = 2.6, LEAF_H = 2.35, LEAF_T = 0.12;
    const JAMB_W = 0.55, HEAD_H = 0.30;
    const leafGeo = new THREE.BoxGeometry(LEAF_W, LEAF_H, LEAF_T);
    leafGeo.translate(LEAF_W / 2, 0, 0);            // pivot at the hinge edge
    const jambGeo = new THREE.BoxGeometry(JAMB_W, LEAF_H + HEAD_H, 0.40);
    const headGeo = new THREE.BoxGeometry(TILE, HEAD_H, 0.40);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x7a5533, roughness: 0.66, metalness: 0.06 });
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x5f4126, roughness: 0.7 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c6, roughness: 0.78 });
    const knobGeo = new THREE.SphereGeometry(0.10, 12, 10);
    const knobMat = new THREE.MeshStandardMaterial({ color: 0xc9a94e, roughness: 0.22, metalness: 0.92 });

    for (const dd of this.gen.doors) {
      if (this.tileAt(dd.x, dd.y) !== T.DOOR) continue;
      const g = new THREE.Group();
      const [wx, wz] = this.center(dd.x, dd.y);
      g.position.set(wx, 0, wz);
      g.rotation.y = dd.horiz ? 0 : Math.PI / 2;

      // frame
      for (const sx of [-1, 1]) {
        const j = new THREE.Mesh(jambGeo, frameMat);
        j.position.set(sx * (TILE / 2 - JAMB_W / 2), (LEAF_H + HEAD_H) / 2, 0);
        j.castShadow = true; j.receiveShadow = true;
        g.add(j);
      }
      const head = new THREE.Mesh(headGeo, frameMat);
      head.position.set(0, LEAF_H + HEAD_H / 2, 0);
      head.castShadow = true; g.add(head);

      // hinged leaf
      const hinge = new THREE.Group();
      hinge.position.set(-LEAF_W / 2, LEAF_H / 2, 0);
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.castShadow = true; leaf.receiveShadow = true;
      hinge.add(leaf);
      // two recessed panels so it reads as a door, not a plank
      for (const dy of [-0.52, 0.52]) {
        const pnl = new THREE.Mesh(new THREE.BoxGeometry(LEAF_W * 0.62, LEAF_H * 0.32, 0.04), panelMat);
        pnl.position.set(LEAF_W / 2, dy, LEAF_T / 2);
        hinge.add(pnl);
      }
      const knob = new THREE.Mesh(knobGeo, knobMat);
      knob.position.set(LEAF_W - 0.30, -0.05, LEAF_T + 0.02);
      hinge.add(knob);
      const knob2 = knob.clone(); knob2.position.z = -LEAF_T - 0.02; hinge.add(knob2);
      g.add(hinge);

      this.group.add(g);
      const door = {
        x: dd.x, y: dd.y, mesh: g, hinge,
        open: false, angle: 0, targetAngle: 0, swing: 1, hp: 55,
      };
      this.doors.push(door);
      this.doorAt.set(this.key(dd.x, dd.y), door);
    }
  }

  // Walk into a door and it opens, swinging away from you. Kept as
  // openDoor(...) with a bustDoor alias so older call sites keep working.
  openDoor(door, dirX, dirZ, hard = false) {
    if (door.open) return false;
    door.open = true;
    this.setTile(door.x, door.y, T.FLOOR);
    // which way is the pusher going, in the door's own frame?
    const fwd = door.mesh.rotation.y === 0 ? dirZ : dirX;
    door.swing = fwd >= 0 ? 1 : -1;
    door.targetAngle = door.swing * (hard ? 2.05 : 1.75);
    door.speed = hard ? 13 : 7.5;
    return true;
  }
  bustDoor(door, dirX, dirZ) { return this.openDoor(door, dirX, dirZ, true); }

  // -------------------------------------------------------------------------
  // EXACT COLLISION
  // Walls fill their tile, so they stay tile-based. Furniture does not, so each
  // prop becomes an oriented box sized to its actual mesh. Their tiles are
  // released back to floor -- otherwise a 1m chair would block 4m of ground.
  // -------------------------------------------------------------------------
  buildObstacles() {
    this.obstacles = [];
    this.obsGrid = new Map();
    this._stamp = 0;
    for (const p of this.gen.props) {
      const f = PROP_FOOTPRINT[p.kind] || DEFAULT_FOOTPRINT;
      const [wx, wz] = this.center(p.x, p.y);
      const rot = p.rot || 0;
      const o = {
        x: wx, z: wz, hw: f.w / 2, hd: f.d / 2,
        cos: Math.cos(rot), sin: Math.sin(rot),
        sight: f.sight !== false,          // tall enough to break line of sight?
        seen: -1,
      };
      this.obstacles.push(o);
      // register in every tile the box can reach into
      const ext = Math.hypot(f.w, f.d) / 2 + 0.05;
      const x0 = this.tx(wx - ext), x1 = this.tx(wx + ext);
      const z0 = this.tz(wz - ext), z1 = this.tz(wz + ext);
      for (let ty = z0; ty <= z1; ty++) for (let tx = x0; tx <= x1; tx++) {
        const k = ty * this.W + tx;
        let a = this.obsGrid.get(k);
        if (!a) { a = []; this.obsGrid.set(k, a); }
        a.push(o);
      }
      // hand the tile back to the floor
      const t = this.tileAt(p.x, p.y);
      if (t === T.COVER || t === T.LOW) this.setTile(p.x, p.y, T.FLOOR);
    }
  }

  // circle vs oriented box, in the box's own frame
  _circleVsObs(o, x, z, r) {
    const dx = x - o.x, dz = z - o.z;
    const lx = dx * o.cos + dz * o.sin;
    const lz = -dx * o.sin + dz * o.cos;
    const cx = lx < -o.hw ? -o.hw : lx > o.hw ? o.hw : lx;
    const cz = lz < -o.hd ? -o.hd : lz > o.hd ? o.hd : lz;
    const ex = lx - cx, ez = lz - cz;
    return ex * ex + ez * ez < r * r;
  }
  _pointInObs(o, x, z) {
    const dx = x - o.x, dz = z - o.z;
    const lx = dx * o.cos + dz * o.sin;
    const lz = -dx * o.sin + dz * o.cos;
    return lx >= -o.hw && lx <= o.hw && lz >= -o.hd && lz <= o.hd;
  }
  // ray vs oriented box (slab test). Returns entry distance, or -1.
  _rayVsObs(o, ox, oz, dx, dz, maxT) {
    const rx = ox - o.x, rz = oz - o.z;
    const lx = rx * o.cos + rz * o.sin;
    const lz = -rx * o.sin + rz * o.cos;
    const ldx = dx * o.cos + dz * o.sin;
    const ldz = -dx * o.sin + dz * o.cos;
    let tmin = 0, tmax = maxT;
    if (Math.abs(ldx) < 1e-8) { if (lx < -o.hw || lx > o.hw) return -1; }
    else {
      let t1 = (-o.hw - lx) / ldx, t2 = (o.hw - lx) / ldx;
      if (t1 > t2) { const s2 = t1; t1 = t2; t2 = s2; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
    if (Math.abs(ldz) < 1e-8) { if (lz < -o.hd || lz > o.hd) return -1; }
    else {
      let t1 = (-o.hd - lz) / ldz, t2 = (o.hd - lz) / ldz;
      if (t1 > t2) { const s2 = t1; t1 = t2; t2 = s2; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
    return tmin;
  }
  _obsAt(tx, tz) { return this.obsGrid.get(tz * this.W + tx); }


  // ---- lighting -----------------------------------------------------------
  buildLights() {
    const p = this.palette;
    const fogCol = new THREE.Color(p.fog).lerp(new THREE.Color(p.charFog || p.fog), 0.35);
    this.scene.background = fogCol;
    this.scene.fog = new THREE.Fog(fogCol, 58, 130);

    this.scene.add(new THREE.AmbientLight(0xffffff, p.amb ?? 0.6));
    const hemi = new THREE.HemisphereLight(this.theme === 'nightclub' ? 0xb07ad0 : 0xaebfdc,
                                          this.theme === 'nightclub' ? 0x2a1040 : 0x2e241c,
                                          this.theme === 'nightclub' ? 0.70 : 0.80);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2e0, p.sun ?? 1.2);
    sun.position.set(28, 60, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1536, 1536);
    const S = 46;
    sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
    sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 180;
    sun.shadow.bias = -0.0009;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    // a small pool of point lights, reassigned each frame to whichever fixtures
    // are nearest the player. keeps the shader light count fixed and cheap.
    this.lightDefs = this.gen.lights.map(l => {
      const [wx, wz] = this.center(l.x, l.y);
      return { ...l, wx, wz };
    });
    const POOL = this.theme === 'nightclub' ? 10 : 6;
    this.pool = [];
    for (let i = 0; i < POOL; i++) {
      const pl = new THREE.PointLight(0xffffff, 0, 34, 2);
      this.scene.add(pl);
      this.pool.push(pl);
    }
    // club rig: visible cones hanging over the dancefloor
    if (this.theme === 'nightclub') {
      this.rigCones = [];
      const coneGeo = new THREE.ConeGeometry(3.4, 12, 18, 1, true);
      coneGeo.translate(0, -6, 0);
      for (const l of this.lightDefs.filter(d => d.kind === 'rig')) {
        const m = new THREE.MeshBasicMaterial({
          color: new THREE.Color().setHSL(l.hue, 1, 0.55),
          transparent: true, opacity: 0.10, depthWrite: false,
          blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
        const cone = new THREE.Mesh(coneGeo, m);
        cone.position.set(l.wx, 11.5, l.wz);
        this.group.add(cone);
        this.rigCones.push({ cone, def: l, mat: m });
      }
    }
  }

  updateLights(px, pz, dt) {
    const club = this.theme === 'nightclub';
    const kick = musicPulse('kick'), snare = musicPulse('snare'), bar = musicPulse('bar');
    const step = musicStep();

    // sun follows the player so the shadow frustum stays tight
    this.sun.position.set(px + 28, 62, pz + 20);
    this.sun.target.position.set(px, 0, pz);
    this.sun.target.updateMatrixWorld();

    // nearest fixtures win a slot in the light pool
    const scored = this.lightDefs
      .map(l => ({ l, d: (l.wx - px) ** 2 + (l.wz - pz) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, this.pool.length);
    for (let i = 0; i < this.pool.length; i++) {
      const pl = this.pool[i];
      const e = scored[i];
      if (!e) { pl.intensity = 0; continue; }
      const l = e.l;
      if (l.kind === 'neon') {
        pl.color.setHSL((l.hue + this.time * 0.06) % 1, 0.95, 0.55);
        pl.intensity = 40 + kick * 55;
        pl.distance = 34;
        pl.position.set(l.wx, 4.4, l.wz);
      } else if (l.kind === 'rig') {
        pl.color.setHSL((l.hue + this.time * 0.11) % 1, 1, 0.55);
        pl.intensity = 30 + kick * 85 + snare * 40;
        pl.distance = 46;
        pl.position.set(l.wx, 9, l.wz);
      } else if (l.kind === 'dj') {
        pl.color.setHSL((this.time * 0.3) % 1, 1, 0.6);
        pl.intensity = 34 + bar * 70;
        pl.distance = 40;
        pl.position.set(l.wx, 5, l.wz);
      } else {
        pl.color.set(club ? 0x8899ff : 0xffe9c9);
        pl.intensity = club ? 16 : 22;
        pl.distance = club ? 28 : 32;
        pl.position.set(l.wx, 6.4, l.wz);
      }
    }

    // moving-head cones sweep and flash on the beat
    if (this.rigCones) {
      for (let i = 0; i < this.rigCones.length; i++) {
        const rc = this.rigCones[i];
        const t = this.time;
        rc.cone.rotation.z = Math.sin(t * 1.6 + rc.def.phase) * 0.55;
        rc.cone.rotation.x = Math.cos(t * 1.15 + rc.def.phase) * 0.55;
        rc.mat.color.setHSL((rc.def.hue + t * 0.11) % 1, 1, 0.55);
        const strobe = ((step >> 1) % this.rigCones.length) === i ? 1 : 0;
        rc.mat.opacity = 0.055 + kick * 0.16 + strobe * 0.14 + snare * 0.06;
      }
    }

    // dancefloor: a colour wave across the grid that snaps on every kick
    if (this.danceMesh) {
      const c = this._danceColor;
      const t = this.time;
      const flash = kick;
      const mode = (step >> 7) % 6;        // new pattern every 8 bars
      const rot = (step >> 5) & 3;         // colours shift every 2 bars
      const dcx = this._danceCx, dcy = this._danceCy;
      for (let i = 0; i < this.danceCells.length; i++) {
        const [x, y] = this.danceCells[i];
        const wave = Math.sin((x * 0.55 + y * 0.4) - t * 3.2) * 0.5 + 0.5;
        const chase = ((x + y + (step >> 1)) % 6) === 0 ? 1 : 0;
        const quad = ((x >> 2) + (y >> 2) + (step >> 3)) % 4 === 0 ? 1 : 0;
        // The floor never sits still: panels are grouped into four colour
        // banks, the bank->colour mapping rotates every 2 bars, and the
        // grouping pattern itself changes every 8 bars.
        let bank;
        switch (mode) {
          case 0:  bank = ((x >> 1) + (y >> 1)) & 3; break;          // checkerboard
          case 1:  bank = (y >> 1) & 3; break;                        // rows
          case 2:  bank = (x >> 1) & 3; break;                        // columns
          case 3:  bank = ((x + y) >> 1) & 3; break;                  // diagonals
          case 4:  bank = (Math.round(Math.hypot(x - dcx, y - dcy)) >> 1) & 3; break;  // rings
          default: bank = ((x * 7 + y * 13) >> 1) & 3;                // scatter
        }
        const hue = DANCE_HUES[(bank + rot) & 3];
        const light = 0.055 + wave * 0.075 + flash * 0.30 + chase * 0.22 + quad * 0.16 + snare * 0.10;
        c.setHSL(hue, 0.92, Math.min(0.62, light));
        this.danceMesh.setColorAt(i, c);
      }
      if (this.danceMesh.instanceColor) this.danceMesh.instanceColor.needsUpdate = true;
    }
  }

  update(dt) {
    this.time += dt;
    // doors swing to their target angle and settle with a little bounce
    for (const d of this.doors) {
      if (d.angle === d.targetAngle) continue;
      const spd = (d.speed || 7.5) * dt;
      const diff = d.targetAngle - d.angle;
      if (Math.abs(diff) <= spd) {
        d.angle = d.targetAngle;
        if (Math.abs(d.targetAngle) > 1.9) d.targetAngle = d.swing * 1.72;   // rebound
      } else d.angle += Math.sign(diff) * spd;
      d.hinge.rotation.y = d.angle;
    }
  }

  // ---- circle vs grid collision, resolved per axis ------------------------
  moveCircle(x, z, dx, dz, r) {
    let nx = x + dx;
    if (this.circleHits(nx, z, r)) nx = x;
    let nz = z + dz;
    if (this.circleHits(nx, nz, r)) nz = z;
    return [nx, nz];
  }
  circleHits(x, z, r) {
    const x0 = this.tx(x - r), x1 = this.tx(x + r);
    const z0 = this.tz(z - r), z1 = this.tz(z + r);
    const stamp = ++this._stamp;
    for (let ty = z0; ty <= z1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const t = this.tileAt(tx, ty);
      let blocks = BLOCKS_MOVE(t);
      if (t === T.DOOR) { const d = this.doorAt.get(this.key(tx, ty)); blocks = !!(d && !d.open); }
      if (blocks) {
        const cx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE));
        const cz = Math.max(ty * TILE, Math.min(z, ty * TILE + TILE));
        if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return true;
      }
      const list = this._obsAt(tx, ty);
      if (!list) continue;
      for (const o of list) {
        if (o.seen === stamp) continue;
        o.seen = stamp;
        if (this._circleVsObs(o, x, z, r)) return true;
      }
    }
    return false;
  }
  // which closed door is the circle pressing into (used for door bashing)
  doorContact(x, z, r) {
    const x0 = this.tx(x - r), x1 = this.tx(x + r);
    const z0 = this.tz(z - r), z1 = this.tz(z + r);
    for (let ty = z0; ty <= z1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (this.tileAt(tx, ty) !== T.DOOR) continue;
      const d = this.doorAt.get(this.key(tx, ty));
      if (!d || d.open) continue;
      const cx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE));
      const cz = Math.max(ty * TILE, Math.min(z, ty * TILE + TILE));
      if ((x - cx) ** 2 + (z - cz) ** 2 < (r + 0.35) ** 2) return d;
    }
    return null;
  }

  // ---- DDA raycast: returns {t, x, z, tile, door} or null if it runs out ---
  raycast(x0, z0, dirX, dirZ, maxDist, forSight = false) {
    let tx = this.tx(x0), tz = this.tz(z0);
    const stepX = dirX > 0 ? 1 : -1, stepZ = dirZ > 0 ? 1 : -1;
    const invX = dirX !== 0 ? 1 / Math.abs(dirX) : Infinity;
    const invZ = dirZ !== 0 ? 1 / Math.abs(dirZ) : Infinity;
    let tMaxX = dirX !== 0 ? ((dirX > 0 ? (tx + 1) * TILE - x0 : x0 - tx * TILE)) * invX : Infinity;
    let tMaxZ = dirZ !== 0 ? ((dirZ > 0 ? (tz + 1) * TILE - z0 : z0 - tz * TILE)) * invZ : Infinity;
    const tDeltaX = TILE * invX, tDeltaZ = TILE * invZ;
    let t = 0, guard = 0;
    const stamp = ++this._stamp;
    let bestObs = -1, bestObsRef = null;

    while (t <= maxDist && guard++ < 4096) {
      // exact boxes registered in this tile
      const list = this._obsAt(tx, tz);
      if (list) {
        for (const o of list) {
          if (o.seen === stamp) continue;
          o.seen = stamp;
          if (forSight && !o.sight) continue;      // you can see over low cover
          const ht = this._rayVsObs(o, x0, z0, dirX, dirZ, maxDist);
          if (ht >= 0 && (bestObs < 0 || ht < bestObs)) { bestObs = ht; bestObsRef = o; }
        }
      }
      const blocked = forSight ? this.sightBlockedTile(tx, tz) : this.shotBlockedTile(tx, tz);
      if (blocked) {
        // a wall here -- but a box may still have been hit sooner
        if (bestObs >= 0 && bestObs < t) {
          return { t: bestObs, x: x0 + dirX * bestObs, z: z0 + dirZ * bestObs,
                   tile: T.COVER, door: null, obstacle: bestObsRef, tx, tz };
        }
        return { t, x: x0 + dirX * t, z: z0 + dirZ * t, tile: this.tileAt(tx, tz),
                 door: this.doorAt.get(this.key(tx, tz)) || null, tx, tz };
      }
      // a box hit that is already behind us is final
      if (bestObs >= 0 && bestObs <= t) {
        return { t: bestObs, x: x0 + dirX * bestObs, z: z0 + dirZ * bestObs,
                 tile: T.COVER, door: null, obstacle: bestObsRef, tx, tz };
      }
      if (tMaxX < tMaxZ) { tx += stepX; t = tMaxX; tMaxX += tDeltaX; }
      else { tz += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; }
    }
    if (bestObs >= 0 && bestObs <= maxDist) {
      return { t: bestObs, x: x0 + dirX * bestObs, z: z0 + dirZ * bestObs,
               tile: T.COVER, door: null, obstacle: bestObsRef, tx, tz };
    }
    return null;
  }

  canSee(x0, z0, x1, z1, maxDist = 90) {
    const dx = x1 - x0, dz = z1 - z0;
    const d = Math.hypot(dx, dz);
    if (d > maxDist) return false;
    if (d < 0.001) return true;
    const hit = this.raycast(x0, z0, dx / d, dz / d, d, true);
    return !hit;
  }
  canShoot(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0;
    const d = Math.hypot(dx, dz);
    if (d < 0.001) return true;
    const hit = this.raycast(x0, z0, dx / d, dz / d, d, false);
    return !hit;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => {
      if (o.isMesh || o.isInstancedMesh) {
        if (o.geometry && !propCacheHasGeo(o.geometry)) o.geometry.dispose?.();
      }
    });
    for (const l of this.pool) this.scene.remove(l);
    if (this.sun) { this.scene.remove(this.sun); this.scene.remove(this.sun.target); }
  }
}
function propCacheHasGeo() { return true; }  // geometry is shared across levels

// colour helpers -- keep everything numeric so nothing gets re-parsed as hex
function hexRGB(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbStr([r, g, b], amt) {
  const cl = v => v < 0 ? 0 : v > 255 ? 255 : v | 0;
  return `rgb(${cl(r + amt)},${cl(g + amt)},${cl(b + amt)})`;
}
