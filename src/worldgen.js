// ============================================================================
// Level generation. Every level is a BSP-partitioned building, decorated by
// theme, then validated with a flood fill so it is always fully connected.
// Seeded off the level id, so a given level always lays out the same way.
// ============================================================================
import { mulberry32, pick, rand } from './util.js';
import { randomGun, BY_CLASS, gun } from './guns.js';

export const T = {
  SOLID: 0,    // outside the building
  FLOOR: 1,
  WALL: 2,
  DOOR: 3,     // bustable -- run into it
  COVER: 4,    // full height: blocks movement, bullets and line of sight
  LOW: 5,      // waist height: blocks movement and bullets, NOT sight
  DANCE: 6,    // dancefloor panel (lit, pulses with the music)
  STAGE: 7,    // raised DJ booth / platform
};
export const BLOCKS_MOVE = t => t === T.SOLID || t === T.WALL || t === T.COVER || t === T.LOW || t === T.STAGE;
export const BLOCKS_SHOT = t => t === T.SOLID || t === T.WALL || t === T.COVER || t === T.LOW;
export const BLOCKS_SIGHT = t => t === T.SOLID || t === T.WALL || t === T.COVER;

export const TILE = 4;

// ---------------------------------------------------------------------------

// Ambient dressing. Every room gets a few of these so no space reads as an
// empty box: things on the walls, things on the ceiling, things on the floor.
const AMBIENT = {
  house:      { wall: ['picture', 'clock', 'noticeboard'], ceil: ['strip'], floor: ['papers', 'cardboard'] },
  motel:      { wall: ['picture', 'exitsign', 'clock'],    ceil: ['strip'], floor: ['papers', 'spill', 'bottleslitter'] },
  office:     { wall: ['noticeboard', 'clock', 'poster', 'exitsign'], ceil: ['strip', 'ductwork'], floor: ['papers', 'carpet'] },
  warehouse:  { wall: ['warningsign', 'noticeboard', 'wallpipes'], ceil: ['ductwork', 'cables', 'strip'], floor: ['hazardstripe', 'cardboard', 'rust', 'papers'] },
  industrial: { wall: ['warningsign', 'wallpipes', 'graffiti'], ceil: ['ductwork', 'cables'], floor: ['rust', 'spill', 'hazardstripe'] },
  clinic:     { wall: ['clock', 'noticeboard', 'exitsign'], ceil: ['strip'], floor: ['tiles', 'oldblood', 'papers'] },
  compound:   { wall: ['warningsign', 'noticeboard', 'exitsign'], ceil: ['strip', 'cables'], floor: ['hazardstripe', 'sandbags', 'rust'] },
  nightclub:  { wall: ['neonsign', 'graffiti', 'poster'], ceil: ['cables'], floor: ['spill', 'bottleslitter'] },
};

class Node {
  constructor(x, y, w, h) { this.x = x; this.y = y; this.w = w; this.h = h; this.a = null; this.b = null; }
  get leaf() { return !this.a; }
  leaves(out = []) { if (this.leaf) out.push(this); else { this.a.leaves(out); this.b.leaves(out); } return out; }
  center() { return [Math.floor(this.x + this.w / 2), Math.floor(this.y + this.h / 2)]; }
}

function split(node, rng, minW, minH, depth, target, reserved) {
  const leaves = node.leaves().length;
  if (leaves >= target || depth > 8) return;
  const canH = node.w >= minW * 2 + 1, canV = node.h >= minH * 2 + 1;
  if (!canH && !canV) return;
  const horiz = canH && canV ? rng() < (node.w / (node.w + node.h)) : canH;
  // never cut through a reserved rect (the dancefloor)
  const hits = (x, y, w, h) => reserved && !(x + w <= reserved.x || x >= reserved.x + reserved.w ||
                                             y + h <= reserved.y || y >= reserved.y + reserved.h);
  for (let attempt = 0; attempt < 12; attempt++) {
    if (horiz) {
      const sx = node.x + minW + Math.floor(rng() * (node.w - minW * 2));
      const A = new Node(node.x, node.y, sx - node.x, node.h);
      const B = new Node(sx + 1, node.y, node.x + node.w - sx - 1, node.h);
      if (reserved && hits(A.x, A.y, A.w, A.h) && hits(B.x, B.y, B.w, B.h)) continue;
      node.a = A; node.b = B; node.dir = 'h'; node.at = sx; break;
    } else {
      const sy = node.y + minH + Math.floor(rng() * (node.h - minH * 2));
      const A = new Node(node.x, node.y, node.w, sy - node.y);
      const B = new Node(node.x, sy + 1, node.w, node.y + node.h - sy - 1);
      if (reserved && hits(A.x, A.y, A.w, A.h) && hits(B.x, B.y, B.w, B.h)) continue;
      node.a = A; node.b = B; node.dir = 'v'; node.at = sy; break;
    }
  }
  if (!node.a) return;
  // recurse into the bigger side first so room sizes stay varied
  split(node.a, rng, minW, minH, depth + 1, target, reserved);
  split(node.b, rng, minW, minH, depth + 1, target, reserved);
}

// ---------------------------------------------------------------------------
export function generate(level, seedExtra = 0) {
  const cfg = level.gen;
  const seed = hash(level.id) + seedExtra;
  const rng = mulberry32(seed);
  const W = cfg.w, H = cfg.h;
  const g = new Uint8Array(W * H).fill(T.WALL);
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? T.SOLID : g[y * W + x];
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y * W + x] = v; };

  // nightclub keeps a big open dancefloor in the middle
  let reserved = null;
  if (cfg.theme === 'nightclub') {
    const dw = Math.floor(W * 0.42), dh = Math.floor(H * 0.40);
    reserved = { x: Math.floor((W - dw) / 2), y: Math.floor((H - dh) / 2) - 1, w: dw, h: dh };
  }

  const root = new Node(1, 1, W - 2, H - 2);
  // domestic spaces want fewer, squarer rooms; warehouses want big halls
  const MINW = { motel: 5, house: 8, warehouse: 9, industrial: 9, compound: 8 }[cfg.theme] ?? 7;
  const MINH = { motel: 6, house: 7, warehouse: 8, industrial: 8, compound: 7 }[cfg.theme] ?? 6;
  split(root, rng, MINW, MINH, 0, cfg.rooms, reserved);
  const leaves = root.leaves();

  // carve room interiors
  const rooms = [];
  for (const L of leaves) {
    const x0 = L.x + 1, y0 = L.y + 1, x1 = L.x + L.w - 2, y1 = L.y + L.h - 2;
    if (x1 < x0 || y1 < y0) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, T.FLOOR);
    rooms.push({ x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, cx: (x0 + x1) >> 1, cy: (y0 + y1) >> 1, node: L });
  }
  if (!rooms.length) throw new Error('generator produced no rooms for ' + level.id);

  // the dancefloor room (largest overlapping the reserve)
  let danceRoom = null;
  if (reserved) {
    let best = null, bestA = 0;
    for (const r of rooms) {
      const ox = Math.max(0, Math.min(r.x1, reserved.x + reserved.w) - Math.max(r.x0, reserved.x));
      const oy = Math.max(0, Math.min(r.y1, reserved.y + reserved.h) - Math.max(r.y0, reserved.y));
      if (ox * oy > bestA) { bestA = ox * oy; best = r; }
    }
    danceRoom = best;
  }

  // ---- connect the BSP tree: punch a passage at every split ---------------
  const doors = [];
  (function connect(n) {
    if (n.leaf) return;
    connect(n.a); connect(n.b);
    punch(n);
  })(root);

  function punch(n) {
    if (n.dir === 'h') {
      const y0 = Math.max(n.a.y, n.b.y) + 2, y1 = Math.min(n.a.y + n.a.h, n.b.y + n.b.h) - 3;
      for (let tries = 0; tries < 26; tries++) {
        const y = y0 + Math.floor(rng() * Math.max(1, y1 - y0 + 1));
        if (carveRow(n.at, y)) return;
      }
      for (let y = y0; y <= y1; y++) if (carveRow(n.at, y)) return;
    } else {
      const x0 = Math.max(n.a.x, n.b.x) + 2, x1 = Math.min(n.a.x + n.a.w, n.b.x + n.b.w) - 3;
      for (let tries = 0; tries < 26; tries++) {
        const x = x0 + Math.floor(rng() * Math.max(1, x1 - x0 + 1));
        if (carveCol(x, n.at)) return;
      }
      for (let x = x0; x <= x1; x++) if (carveCol(x, n.at)) return;
    }
  }
  // walk left/right from the split column until floor is reached on both sides
  function carveRow(sx, y) {
    let l = sx, r = sx, guard = 0;
    while (at(l, y) !== T.FLOOR && guard++ < 6) l--;
    guard = 0;
    while (at(r, y) !== T.FLOOR && guard++ < 6) r++;
    if (at(l, y) !== T.FLOOR || at(r, y) !== T.FLOOR) return false;
    if (r - l > 5) return false;
    for (let x = l + 1; x < r; x++) set(x, y, T.FLOOR);
    const dx = (l + r) >> 1;
    set(dx, y, T.DOOR); doors.push({ x: dx, y, horiz: false });
    return true;
  }
  function carveCol(x, sy) {
    let u = sy, d = sy, guard = 0;
    while (at(x, u) !== T.FLOOR && guard++ < 6) u--;
    guard = 0;
    while (at(x, d) !== T.FLOOR && guard++ < 6) d++;
    if (at(x, u) !== T.FLOOR || at(x, d) !== T.FLOOR) return false;
    if (d - u > 5) return false;
    for (let y = u + 1; y < d; y++) set(x, y, T.FLOOR);
    const dy = (u + d) >> 1;
    set(x, dy, T.DOOR); doors.push({ x, y: dy, horiz: true });
    return true;
  }

  // ---- connectivity safety net -------------------------------------------
  ensureConnected(false);
  // Flood fill from the first room. `solid` = also treat furniture as blocking,
  // which is how we guarantee decoration can never seal a room shut.
  function ensureConnected(withProps) {
    for (let pass = 0; pass < 10; pass++) {
      const start = firstOpenCell(rooms[0]);
      if (!start) return;
      const seen = new Uint8Array(W * H);
      const stack = [start];
      seen[start[1] * W + start[0]] = 1;
      while (stack.length) {
        const [x, y] = stack.pop();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, i = ny * W + nx;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[i]) continue;
          const t = g[i];
          if (t === T.WALL || t === T.SOLID) continue;
          if (withProps && BLOCKS_MOVE(t)) continue;
          seen[i] = 1; stack.push([nx, ny]);
        }
      }
      let fixed = false;
      for (const r of rooms) {
        const cell = withProps ? firstOpenCell(r) : [r.cx, r.cy];
        if (!cell) continue;
        if (seen[cell[1] * W + cell[0]]) continue;
        corridor(cell[0], cell[1], start[0], start[1]);
        fixed = true;
      }
      if (!fixed) return;
    }
  }
  function firstOpenCell(r) {
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
      const t = at(x, y);
      if (t === T.FLOOR || t === T.DANCE || t === T.DOOR) return [x, y];
    }
    return null;
  }
  function corridor(x0, y0, x1, y1) {
    let x = x0, y = y0;
    const stepX = x1 > x ? 1 : -1, stepY = y1 > y ? 1 : -1;
    while (x !== x1) { if (g[y * W + x] === T.WALL) set(x, y, T.FLOOR); else if (BLOCKS_MOVE(at(x, y))) set(x, y, T.FLOOR); x += stepX; }
    while (y !== y1) { if (g[y * W + x] === T.WALL) set(x, y, T.FLOOR); else if (BLOCKS_MOVE(at(x, y))) set(x, y, T.FLOOR); y += stepY; }
  }

  // ---- theme decoration ---------------------------------------------------
  const props = [];        // { kind, x, y, rot } -- solid set dressing (collides)
  const decor = [];        // { kind, x, y, rot } -- flat/soft dressing (no collision)
  const lights = [];       // { x, y, color, kind }
  const spawns = [];
  const civilians = [];
  const pickups = [];

  const roomFree = (r) => {
    const cells = [];
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++)
      if (at(x, y) === T.FLOOR || at(x, y) === T.DANCE) cells.push([x, y]);
    return cells;
  };
  const clearOfDoors = (x, y) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
      if (at(x + dx, y + dy) === T.DOOR) return false;
    return true;
  };

  // sort rooms by distance from the first room -- used to place the player at
  // one end and the objective at the other
  const startRoom = rooms.reduce((a, b) => (a.cx + a.cy < b.cx + b.cy ? a : b));
  const scored = rooms.map(r => ({ r, d: Math.hypot(r.cx - startRoom.cx, r.cy - startRoom.cy) }))
                      .sort((a, b) => a.d - b.d);
  const exitRoom = scored[scored.length - 1].r;

  assignPurposes();
  decorate();
  ensureConnected(true);      // furniture must never wall a room off
  // if a rescue corridor cut through a prop, drop the prop's mesh too
  for (let i = props.length - 1; i >= 0; i--)
    if (!BLOCKS_MOVE(at(props[i].x, props[i].y))) props.splice(i, 1);

  // Each room gets a purpose, and purposes furnish differently. This is what
  // makes a generated house read as a house instead of a box of crates.
  function assignPurposes() {
    const sorted = [...rooms].sort((a, b) => (b.w * b.h) - (a.w * a.h));
    const sets = {
      house:      ['living', 'kitchen', 'bedroom', 'garage', 'bath', 'hall', 'nursery', 'study'],
      motel:      ['motelroom', 'motelroom', 'motelroom', 'lobby', 'bath', 'hall'],
      office:     ['openplan', 'meeting', 'exec', 'breakroom', 'filing', 'hall', 'server'],
      clinic:     ['ward', 'theatre', 'store', 'morgue', 'hall', 'reception'],
      warehouse:  ['racking', 'loading', 'racking', 'office', 'hall'],
      industrial: ['plant', 'workshop', 'loading', 'office', 'hall'],
      compound:   ['barracks', 'armoury', 'plant', 'openplan', 'hall'],
      nightclub:  ['bar', 'lounge', 'hall', 'green', 'toilets', 'office'],
    };
    const pool = sets[cfg.theme] || sets.office;
    sorted.forEach((r, i) => {
      // narrow rooms are corridors whatever else they wanted to be
      const narrow = Math.min(r.w, r.h) <= 3;
      r.purpose = narrow ? 'hall' : pool[i % pool.length];
    });
    // the prologue is a specific house: you start in the garage and the last
    // room you walk into is the nursery.
    if (cfg.prologue || cfg.flashback) {
      const byDist = [...rooms].sort((a, b) => (a.cx + a.cy) - (b.cx + b.cy));
      byDist[0].purpose = 'garage';
      byDist[byDist.length - 1].purpose = 'nursery';
      if (byDist.length > 2) byDist[1].purpose = 'hall';
      if (byDist.length > 3) byDist[2].purpose = 'kitchen';
      if (byDist.length > 4) byDist[3].purpose = 'living';
      if (byDist.length > 5) byDist[4].purpose = 'bedroom';
    }
  }

  function decorate() {
    for (const r of rooms) {
      if (danceRoom && r === danceRoom) { decorateClub(r); continue; }
      furnish(r);
      lights.push({ x: r.cx, y: r.cy, kind: 'room' });
      if (cfg.theme === 'nightclub') {
        lights.push({ x: r.x0 + 1, y: r.y0 + 1, kind: 'neon', hue: rng() });
        lights.push({ x: r.x1 - 1, y: r.y1 - 1, kind: 'neon', hue: rng() });
      }
    }
  }

  // is this cell against a wall, and which way does it face?
  function wallFacing(x, y) {
    const N = at(x, y - 1) === T.WALL, S = at(x, y + 1) === T.WALL;
    const W = at(x - 1, y) === T.WALL, E = at(x + 1, y) === T.WALL;
    if (N) return { rot: 0, side: 'N' };
    if (S) return { rot: Math.PI, side: 'S' };
    if (W) return { rot: Math.PI / 2, side: 'W' };
    if (E) return { rot: -Math.PI / 2, side: 'E' };
    return null;
  }
  function placeable(x, y) { return at(x, y) === T.FLOOR && clearOfDoors(x, y); }
  // Props collide as exact oriented boxes sized to their mesh (see
  // PROP_FOOTPRINT), so even a 1m chair is honest cover rather than a 4m
  // invisible wall. The tile flag here is only used for generation-time
  // connectivity checks; World releases it back to floor afterwards.
  function put(kind, tile, x, y, rot) {
    if (!placeable(x, y)) return false;
    set(x, y, tile);
    props.push({ kind, x, y, rot: rot ?? 0 });
    return true;
  }
  function putDecor(kind, x, y, rot, scale) {
    const t = at(x, y);
    if (t === T.SOLID || t === T.WALL) return false;
    decor.push({ kind, x, y, rot: rot ?? 0, scale: scale ?? 1 });
    return true;
  }
  // lay a run of furniture along a wall
  function runAlongWall(r, kind, tile, count) {
    const edges = [];
    for (let x = r.x0; x <= r.x1; x++) { edges.push([x, r.y0]); edges.push([x, r.y1]); }
    for (let y = r.y0 + 1; y < r.y1; y++) { edges.push([r.x0, y]); edges.push([r.x1, y]); }
    shuffle(edges);
    let n = 0;
    for (const [x, y] of edges) {
      if (n >= count) break;
      const f = wallFacing(x, y);
      if (!f) continue;
      if (put(kind, tile, x, y, f.rot)) n++;
    }
    return n;
  }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } }
  function scatter(r, kind, tile, count) {
    const free = roomFree(r); shuffle(free);
    let n = 0;
    for (const [x, y] of free) { if (n >= count) break; if (put(kind, tile, x, y, Math.floor(rng() * 4) * Math.PI / 2)) n++; }
    return n;
  }
  // rows of racking / desks with aisles between them
  function rows(r, kind, tile, spacing) {
    let n = 0;
    for (let y = r.y0 + 1; y <= r.y1 - 1; y += spacing) {
      for (let x = r.x0 + 1; x <= r.x1 - 1; x++) {
        if (x === r.cx) continue;                 // leave a walkway
        if (put(kind, tile, x, y, 0)) n++;
      }
    }
    return n;
  }


  // wall-facing floor cells, used to hang things on walls
  function wallCells(r) {
    const out = [];
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
      if (at(x, y) !== T.FLOOR && at(x, y) !== T.DANCE) continue;
      const f = wallFacing(x, y);
      if (f && clearOfDoors(x, y)) out.push([x, y, f.rot]);
    }
    return out;
  }
  function dressRoom(r) {
    const set2 = AMBIENT[cfg.theme] || AMBIENT.office;
    const area = r.w * r.h;
    // walls
    const wc = wallCells(r); shuffle(wc);
    const nWall = Math.min(wc.length, 1 + Math.floor(area / 26) + (rng() < 0.5 ? 1 : 0));
    for (let i = 0; i < nWall; i++) {
      const [x, y, rot] = wc[i];
      putDecor(pick(rng, set2.wall), x, y, rot, 1);
    }
    // ceiling
    if (set2.ceil.length && area > 16) {
      const n = 1 + (area > 60 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const x = r.x0 + Math.floor(rng() * r.w), y = r.y0 + Math.floor(rng() * r.h);
        putDecor(pick(rng, set2.ceil), x, y, rng() < 0.5 ? 0 : Math.PI / 2, 1);
      }
    }
    // floor litter
    const nFloor = Math.max(1, Math.floor(area / 34));
    const free = roomFree(r); shuffle(free);
    for (let i = 0; i < nFloor && i < free.length; i++) {
      const [x, y] = free[i];
      putDecor(pick(rng, set2.floor), x, y, rng() * Math.PI * 2, 1);
    }
  }

  function furnish(r) {
    const area = r.w * r.h;
    const big = area > 40;
    switch (r.purpose) {
      case 'garage':
        // exactly one car, parked off to one side so it never blocks the way
        (() => {
          const spots = [[r.x1 - 1, r.y1 - 1], [r.x0 + 1, r.y1 - 1], [r.x1 - 1, r.y0 + 1], [r.x0 + 1, r.y0 + 1]];
          for (const [cx, cy] of spots) if (put('car', T.COVER, cx, cy, 0)) break;
        })();
        runAlongWall(r, 'workbench', T.LOW, 2);
        runAlongWall(r, 'toolrack', T.COVER, 1);
        put('bicycle', T.LOW, r.x0 + 1, r.y1 - 1, rng() * 6);
        putDecor('oilstain', r.cx + 1, r.cy + 2, 0, 1.4);
        putDecor('toolbox', r.x1 - 1, r.y0 + 1, 0, 1);
        break;
      case 'kitchen':
        runAlongWall(r, 'counter', T.LOW, Math.min(6, Math.ceil(r.w * 0.7)));
        runAlongWall(r, 'fridge', T.COVER, 1);
        runAlongWall(r, 'stove', T.LOW, 1);
        if (big) { put('table', T.LOW, r.cx, r.cy, 0); put('chair', T.LOW, r.cx + 1, r.cy, rng() * 6); put('chair', T.LOW, r.cx - 1, r.cy, rng() * 6); }
        putDecor('tiles', r.cx, r.cy, 0, 1);
        break;
      case 'living':
        put('sofa', T.LOW, r.cx - 1, r.cy + 1, Math.PI);
        put('sofa', T.LOW, r.cx + 1, r.cy + 1, Math.PI);
        put('table', T.LOW, r.cx, r.cy, 0);
        runAlongWall(r, 'tvunit', T.LOW, 1);
        runAlongWall(r, 'shelf', T.COVER, 1);
        putDecor('rug', r.cx, r.cy, 0, 2.2);
        putDecor('lamp', r.x1 - 1, r.y0 + 1, 0, 1);
        putDecor('picture', r.cx, r.y0, 0, 1);
        break;
      case 'bedroom':
        {
          const f = wallFacing(r.cx, r.y0) ? { x: r.cx, y: r.y0 } : { x: r.x0, y: r.cy };
          put('bed', T.LOW, f.x, f.y, 0);
          put('bed', T.LOW, f.x, f.y + 1, 0);
          runAlongWall(r, 'wardrobe', T.COVER, 1);
          runAlongWall(r, 'nightstand', T.LOW, 2);
          putDecor('rug', r.cx, r.cy + 1, 0, 1.6);
        }
        break;
      case 'nursery':
        put('crib', T.LOW, r.cx, r.cy, 0);
        runAlongWall(r, 'wardrobe', T.COVER, 1);
        runAlongWall(r, 'nightstand', T.LOW, 1);
        putDecor('rug', r.cx, r.cy + 1, 0, 1.6);
        putDecor('paintcan', r.cx - 1, r.cy + 1, 0, 1);
        putDecor('mobile', r.cx, r.cy, 0, 1);
        break;
      case 'bath':
        runAlongWall(r, 'toilet', T.LOW, 1);
        runAlongWall(r, 'sink', T.LOW, 1);
        runAlongWall(r, 'bathtub', T.LOW, 1);
        putDecor('tiles', r.cx, r.cy, 0, 1);
        break;
      case 'study':
        runAlongWall(r, 'desk', T.LOW, 2);
        runAlongWall(r, 'shelf', T.COVER, 2);
        put('chair', T.LOW, r.cx, r.cy, rng() * 6);
        putDecor('rug', r.cx, r.cy, 0, 1.4);
        break;
      case 'motelroom':
        put('bed', T.LOW, r.cx, r.cy, 0);
        put('bed', T.LOW, r.cx, r.cy + 1, 0);
        runAlongWall(r, 'tvunit', T.LOW, 1);
        runAlongWall(r, 'nightstand', T.LOW, 1);
        putDecor('rug', r.cx, r.cy + 2, 0, 1.5);
        break;
      case 'lobby':
        runAlongWall(r, 'counter', T.LOW, 3);
        put('sofa', T.LOW, r.cx, r.cy, rng() * 6);
        putDecor('rug', r.cx, r.cy, 0, 2);
        putDecor('plantpot', r.x0 + 1, r.y1 - 1, 0, 1);
        break;
      case 'openplan':
        rows(r, 'desk', T.LOW, 3);
        runAlongWall(r, 'cabinet', T.COVER, 2);
        putDecor('carpet', r.cx, r.cy, 0, 1);
        break;
      case 'meeting':
        for (let x = r.cx - 1; x <= r.cx + 1; x++) put('table', T.LOW, x, r.cy, 0);
        for (const dy of [-1, 1]) for (let x = r.cx - 1; x <= r.cx + 1; x++) put('chair', T.LOW, x, r.cy + dy, rng() * 6);
        putDecor('whiteboard', r.cx, r.y0, 0, 1);
        break;
      case 'exec':
        put('desk', T.LOW, r.cx, r.cy, 0);
        put('desk', T.LOW, r.cx + 1, r.cy, 0);
        put('chair', T.LOW, r.cx, r.cy - 1, 0);
        runAlongWall(r, 'shelf', T.COVER, 2);
        putDecor('rug', r.cx, r.cy + 2, 0, 2.4);
        putDecor('plantpot', r.x1 - 1, r.y0 + 1, 0, 1);
        break;
      case 'breakroom':
        runAlongWall(r, 'counter', T.LOW, 2);
        runAlongWall(r, 'vending', T.COVER, 2);
        put('table', T.LOW, r.cx, r.cy, 0);
        put('chair', T.LOW, r.cx + 1, r.cy, rng() * 6);
        break;
      case 'filing':
        rows(r, 'cabinet', T.COVER, 3);
        break;
      case 'server':
        rows(r, 'rack', T.COVER, 3);
        break;
      case 'ward':
        {
          let n = 0;
          for (let y = r.y0; y <= r.y1 - 1 && n < 6; y += 3)
            for (let x = r.x0; x <= r.x1 && n < 6; x += 3) {
              if (put('bed', T.LOW, x, y, 0)) { put('bed', T.LOW, x, y + 1, 0); put('cart', T.LOW, x + 1, y, 0); n++; }
            }
        }
        break;
      case 'theatre':
        put('optable', T.LOW, r.cx, r.cy, 0);
        runAlongWall(r, 'cart', T.LOW, 2);
        runAlongWall(r, 'locker', T.COVER, 2);
        putDecor('tiles', r.cx, r.cy, 0, 1);
        break;
      case 'morgue':
        rows(r, 'slab', T.LOW, 3);
        runAlongWall(r, 'locker', T.COVER, 3);
        break;
      case 'store':
        runAlongWall(r, 'shelf', T.COVER, Math.min(6, r.w));
        scatter(r, 'crate', T.COVER, 2);
        break;
      case 'reception':
        runAlongWall(r, 'counter', T.LOW, 3);
        put('sofa', T.LOW, r.cx, r.cy + 1, rng() * 6);
        putDecor('plantpot', r.x0 + 1, r.y0 + 1, 0, 1);
        break;
      case 'racking':
        rows(r, 'shelf', T.COVER, 3);
        scatter(r, 'pallet', T.LOW, 2);
        break;
      case 'loading':
        scatter(r, 'pallet', T.LOW, Math.ceil(area * 0.05));
        scatter(r, 'crate', T.COVER, Math.ceil(area * 0.05));
        putDecor('hazardstripe', r.cx, r.cy, 0, 1);
        break;
      case 'plant':
        scatter(r, 'machine', T.COVER, Math.ceil(area * 0.05));
        runAlongWall(r, 'pipe', T.LOW, 3);
        scatter(r, 'drum', T.COVER, 2);
        putDecor('hazardstripe', r.cx, r.cy, 0, 1);
        break;
      case 'workshop':
        runAlongWall(r, 'workbench', T.LOW, 3);
        runAlongWall(r, 'toolrack', T.COVER, 2);
        scatter(r, 'drum', T.COVER, 2);
        break;
      case 'barracks':
        {
          let n = 0;
          for (let y = r.y0; y <= r.y1 - 1 && n < 8; y += 3)
            for (let x = r.x0; x <= r.x1 && n < 8; x += 4) {
              if (put('bed', T.LOW, x, y, 0)) { put('bed', T.LOW, x, y + 1, 0); put('locker', T.COVER, x + 1, y, 0); n++; }
            }
        }
        break;
      case 'armoury':
        runAlongWall(r, 'gunrack', T.COVER, Math.min(7, r.w));
        scatter(r, 'crate', T.COVER, 3);
        break;
      case 'bar':
        runAlongWall(r, 'bar', T.LOW, Math.min(6, Math.ceil(r.w * 0.7)));
        runAlongWall(r, 'bottles', T.COVER, 2);
        scatter(r, 'booth', T.LOW, 2);
        break;
      case 'lounge':
        scatter(r, 'booth', T.LOW, Math.ceil(area * 0.06));
        scatter(r, 'table', T.LOW, 2);
        putDecor('rug', r.cx, r.cy, 0, 2);
        break;
      case 'green':
        put('sofa', T.LOW, r.cx, r.cy, rng() * 6);
        runAlongWall(r, 'locker', T.COVER, 2);
        scatter(r, 'speaker', T.COVER, 1);
        break;
      case 'toilets':
        runAlongWall(r, 'toilet', T.LOW, 2);
        runAlongWall(r, 'sink', T.LOW, 2);
        putDecor('tiles', r.cx, r.cy, 0, 1);
        break;
      case 'office':
        runAlongWall(r, 'desk', T.LOW, 2);
        runAlongWall(r, 'cabinet', T.COVER, 2);
        put('chair', T.LOW, r.cx, r.cy, rng() * 6);
        break;
      case 'hall':
      default:
        if (rng() < 0.55) runAlongWall(r, cfg.theme === 'house' ? 'shelf' : 'cabinet', T.COVER, 1);
        if (rng() < 0.4) putDecor(cfg.theme === 'house' ? 'rug' : 'carpet', r.cx, r.cy, 0, 1.4);
        break;
    }
    dressRoom(r);
    // a little generic cover so every room has something to hide behind
    const solidCount = props.filter(pr => pr.x >= r.x0 && pr.x <= r.x1 && pr.y >= r.y0 && pr.y <= r.y1).length;
    const want = Math.max(0, Math.floor(area * 0.10) - solidCount);
    if (want > 0 && cfg.enemies > 0) {
      // mix the kinds so a room isn't six identical crates
      for (let i = 0; i < want; i++) {
        const t = themeProp(rng, cfg.theme);
        scatter(r, t.kind, t.tile, 1);
      }
    }
  }

  function decorateClub(r) {
    // dancefloor panels in a checker so the lit grid reads clearly
    for (let y = r.y0 + 1; y <= r.y1 - 1; y++)
      for (let x = r.x0 + 1; x <= r.x1 - 1; x++)
        if (at(x, y) === T.FLOOR) set(x, y, T.DANCE);
    // DJ booth on the far wall
    const bx = r.cx, by = r.y0;
    for (let x = bx - 2; x <= bx + 2; x++) if (at(x, by) === T.DANCE || at(x, by) === T.FLOOR) { set(x, by, T.STAGE); props.push({ kind: 'dj', x, y: by, rot: 0 }); }
    lights.push({ x: bx, y: by + 1, kind: 'dj' });
    // speaker stacks flanking the booth
    for (const sx of [bx - 4, bx + 4]) {
      if (at(sx, by) !== T.SOLID) { set(sx, by, T.COVER); props.push({ kind: 'speaker', x: sx, y: by, rot: 0 }); }
      if (at(sx, by + 1) !== T.SOLID) { set(sx, by + 1, T.COVER); props.push({ kind: 'speaker', x: sx, y: by + 1, rot: 0 }); }
    }
    // moving-head rig above the floor
    for (let i = 0; i < 6; i++) {
      lights.push({
        x: r.x0 + 1 + Math.floor(rng() * (r.w - 2)),
        y: r.y0 + 1 + Math.floor(rng() * (r.h - 2)),
        kind: 'rig', hue: i / 6, phase: rng() * Math.PI * 2,
      });
    }
  }

  // bar counters along the walls of the two rooms nearest the dancefloor
  if (cfg.theme === 'nightclub' && danceRoom) {
    const near = rooms.filter(r => r !== danceRoom)
      .sort((a, b) => Math.hypot(a.cx - danceRoom.cx, a.cy - danceRoom.cy) - Math.hypot(b.cx - danceRoom.cx, b.cy - danceRoom.cy))
      .slice(0, 3);
    for (const r of near) {
      const horiz = r.w >= r.h;
      const len = Math.max(3, Math.floor((horiz ? r.w : r.h) * 0.7));
      const sx = horiz ? r.x0 + 1 : r.cx, sy = horiz ? r.cy : r.y0 + 1;
      for (let k = 0; k < len; k++) {
        const x = horiz ? sx + k : sx, y = horiz ? sy : sy + k;
        if (at(x, y) === T.FLOOR && clearOfDoors(x, y)) {
          set(x, y, T.LOW);
          props.push({ kind: 'bar', x, y, rot: horiz ? 0 : Math.PI / 2 });
        }
      }
      lights.push({ x: r.cx, y: r.cy, kind: 'neon', hue: rng() });
      // bottle shelf behind the bar
      const shX = horiz ? r.cx : r.cx + 1, shY = horiz ? r.cy - 1 : r.cy;
      if (at(shX, shY) === T.FLOOR) { set(shX, shY, T.COVER); props.push({ kind: 'bottles', x: shX, y: shY, rot: 0 }); }
    }
  }

  // ---- entities -----------------------------------------------------------
  const playerSpawn = spawnPointIn(startRoom);
  // The prologue must be unmissable: the way on is the very next room, marked
  // against its left-hand wall, a few steps from where you start.
  let exitPoint;
  if (cfg.prologue || cfg.flashback) {
    const near = scored.find(e => e.r !== startRoom);
    const nextRoom = near ? near.r : exitRoom;
    const cells = roomFree(nextRoom).filter(([x, y]) => clearOfDoors(x, y));
    cells.sort((a, b) => (a[0] - b[0]) || (Math.abs(a[1] - nextRoom.cy) - Math.abs(b[1] - nextRoom.cy)));
    const c = cells[0] || [nextRoom.x0 + 1, nextRoom.cy];
    exitPoint = { x: c[0], y: c[1] };
  } else {
    exitPoint = spawnPointIn(exitRoom);
  }

  function spawnPointIn(r) {
    const free = roomFree(r).filter(([x, y]) => clearOfDoors(x, y));
    if (!free.length) return { x: r.cx, y: r.cy };
    const [x, y] = free[Math.floor(rng() * free.length)];
    return { x, y };
  }

  // enemy classes scale with the level's tier
  const TIER = [
    { grunt: ['pistol'], rifle: ['smg'], heavy: ['shotgun'], marks: ['pistol'] },
    { grunt: ['pistol', 'smg'], rifle: ['smg', 'ar'], heavy: ['shotgun'], marks: ['sniper'] },
    { grunt: ['smg'], rifle: ['ar'], heavy: ['shotgun', 'lmg'], marks: ['sniper'] },
    { grunt: ['smg', 'ar'], rifle: ['ar'], heavy: ['lmg', 'shotgun'], marks: ['sniper'] },
    { grunt: ['ar'], rifle: ['ar', 'lmg'], heavy: ['lmg'], marks: ['sniper'] },
  ][Math.min(4, cfg.tier)] || { grunt: ['pistol'], rifle: ['smg'], heavy: ['shotgun'], marks: ['sniper'] };

  const dmgCap = [26, 34, 50, 80, 130][Math.min(4, cfg.tier)] || 34;
  // `cluster: N` packs every hostile into the N rooms nearest the spawn, so a
  // big building doesn't turn into a hunt for the last two men. The spawn room
  // itself is left clear so you aren't shot the moment you load in.
  let combatRooms = rooms.filter(r => r !== startRoom);
  if (cfg.cluster) {
    const near = combatRooms
      .map(r => ({ r, d: Math.hypot(r.cx - startRoom.cx, r.cy - startRoom.cy) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, cfg.cluster)
      .map(e => e.r);
    if (near.length) combatRooms = near;
  }
  let placed = 0;
  const wanted = cfg.enemies || 0;
  let guard = 0;
  while (placed < wanted && guard++ < wanted * 40) {
    const r = pick(rng, combatRooms.length ? combatRooms : rooms);
    const p = spawnPointIn(r);
    if (spawns.some(s => s.x === p.x && s.y === p.y)) continue;
    const roll = rng();
    let type, cls;
    if (roll < 0.44)      { type = 'grunt';  cls = TIER.grunt; }
    else if (roll < 0.76) { type = 'rifle';  cls = TIER.rifle; }
    else if (roll < 0.91) { type = 'heavy';  cls = TIER.heavy; }
    else                  { type = 'marks';  cls = TIER.marks; }
    spawns.push({ x: p.x, y: p.y, type, gunId: randomGun(rng, cls, dmgCap).id, room: rooms.indexOf(r) });
    placed++;
  }

  // the interrogation target hides in the furthest room and runs from you
  let target = null;
  if (cfg.target) {
    const p = spawnPointIn(exitRoom);
    target = { x: p.x, y: p.y };
  }

  // clubbers
  if (cfg.civilians) {
    const danceCells = danceRoom ? roomFree(danceRoom) : [];
    const other = rooms.filter(r => r !== danceRoom).flatMap(roomFree);
    for (let i = 0; i < cfg.civilians; i++) {
      const onFloor = danceCells.length && rng() < 0.82;
      const pool = onFloor ? danceCells : other;
      if (!pool.length) break;
      const [x, y] = pool[Math.floor(rng() * pool.length)];
      // jitter inside the tile so the crowd is not on a grid
      civilians.push({
        x, y,
        jx: (rng() - 0.5) * 2.4, jy: (rng() - 0.5) * 2.4,
        dancing: onFloor, phase: rng() * Math.PI * 2, style: Math.floor(rng() * 4),
      });
    }
  }

  // floor loot: guns, ammo, medkits -- more generous on harder levels
  const lootCount = Math.max(3, Math.floor((cfg.enemies || 6) * 0.42));
  for (let i = 0; i < lootCount; i++) {
    const r = pick(rng, rooms);
    const p = spawnPointIn(r);
    const roll = rng();
    if (roll < 0.50) {
      const cls = pick(rng, cfg.armory ? ['ar', 'smg', 'shotgun', 'sniper', 'lmg'] : ['pistol', 'smg', 'ar', 'shotgun']);
      pickups.push({ kind: 'gun', gunId: randomGun(rng, [cls], dmgCap * 1.4).id, x: p.x, y: p.y });
    } else if (roll < 0.82) pickups.push({ kind: 'ammo', x: p.x, y: p.y });
    else pickups.push({ kind: 'medkit', x: p.x, y: p.y });
  }
  // an armory level is wall-to-wall weapon crates
  if (cfg.armory) {
    for (let i = 0; i < 16; i++) {
      const r = pick(rng, rooms);
      const p = spawnPointIn(r);
      pickups.push({ kind: 'gun', gunId: randomGun(rng, ['ar', 'smg', 'shotgun', 'sniper', 'lmg'], 200).id, x: p.x, y: p.y });
    }
  }

  return {
    W, H, grid: g, tile: TILE,
    rooms, doors, props, decor, lights, spawns, civilians, pickups, target,
    playerSpawn, exitPoint, danceRoom,
    theme: cfg.theme, cfg,
    at, set,
  };
}

function themeProp(rng, theme) {
  const r = rng();
  switch (theme) {
    case 'office':
      return r < 0.42 ? { kind: 'desk', tile: T.LOW, run: true }
           : r < 0.68 ? { kind: 'cabinet', tile: T.COVER, run: true }
           : r < 0.85 ? { kind: 'partition', tile: T.LOW, run: true }
           : { kind: 'plant', tile: T.COVER };
    case 'warehouse':
      return r < 0.50 ? { kind: 'crate', tile: T.COVER, run: true }
           : r < 0.78 ? { kind: 'pallet', tile: T.LOW, run: true }
           : { kind: 'shelf', tile: T.COVER, run: true };
    case 'industrial':
      return r < 0.40 ? { kind: 'drum', tile: T.COVER }
           : r < 0.66 ? { kind: 'barrier', tile: T.LOW, run: true }
           : r < 0.86 ? { kind: 'machine', tile: T.COVER, run: true }
           : { kind: 'pipe', tile: T.LOW, run: true };
    case 'clinic':
      return r < 0.44 ? { kind: 'bed', tile: T.LOW, run: true }
           : r < 0.70 ? { kind: 'cart', tile: T.LOW }
           : r < 0.88 ? { kind: 'locker', tile: T.COVER, run: true }
           : { kind: 'curtain', tile: T.LOW, run: true };
    case 'house':
      return r < 0.30 ? { kind: 'sofa', tile: T.LOW, run: true }
           : r < 0.52 ? { kind: 'table', tile: T.LOW }
           : r < 0.74 ? { kind: 'shelf', tile: T.COVER, run: true }
           : r < 0.90 ? { kind: 'counter', tile: T.LOW, run: true }
           : { kind: 'fridge', tile: T.COVER };
    case 'motel':
      return r < 0.40 ? { kind: 'bed', tile: T.LOW, run: true }
           : r < 0.68 ? { kind: 'table', tile: T.LOW }
           : { kind: 'locker', tile: T.COVER };
    case 'compound':
      return r < 0.36 ? { kind: 'crate', tile: T.COVER, run: true }
           : r < 0.62 ? { kind: 'barrier', tile: T.LOW, run: true }
           : r < 0.84 ? { kind: 'drum', tile: T.COVER }
           : { kind: 'desk', tile: T.LOW, run: true };
    case 'nightclub':
      return r < 0.34 ? { kind: 'booth', tile: T.LOW, run: true }
           : r < 0.58 ? { kind: 'table', tile: T.LOW }
           : r < 0.78 ? { kind: 'speaker', tile: T.COVER }
           : { kind: 'bottles', tile: T.COVER, run: true };
    default:
      return r < 0.5 ? { kind: 'crate', tile: T.COVER } : { kind: 'desk', tile: T.LOW, run: true };
  }
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
