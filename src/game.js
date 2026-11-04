// ============================================================================
// THE BAD COMPANY -- main loop, state machine, level lifecycle.
// ============================================================================
import * as THREE from '../vendor/three.module.js';
import { generate, TILE, T } from './worldgen.js';
import { World, paletteFor } from './world.js';
import { Player, Enemy, Ally, Civilian, Target, Pickup, Bullets, Debris, ThrownWeapon, makeCorpse } from './entities.js';
import { gun as gunById, ARSENAL, randomGun } from './guns.js';
import { CHARS, LEVELS, BONUS_LEVELS, ALL_LEVELS, LEVEL_BY_ID, BARKS, loadSave, writeSave, resetSave,
         levelUnlocked, bonusUnlocked, FINALE_CONFRONT, ENDING_CHOICE, ENDING_GOOD, ENDING_QUIET,
         networkAlive, BONUS_CONFRONT_ALIVE, BONUS_CONFRONT_DEAD, BONUS_CHOICE,
         BONUS_ENDING_GOOD, BONUS_ENDING_QUIET, KESSLER_EPILOGUE, KESSLER_EPILOGUE_QUIET,
         CREDIT_NAMES, CREDIT_ROLES, CREDIT_TAIL } from './story.js';
import { UI, mainMenuHTML, controlsHTML, arsenalHTML, soundtrackHTML, missionSelectHTML, pauseHTML, deathHTML, clearHTML } from './ui.js';
import { mulberry32, clamp, lerp, dist } from './util.js';
import * as A from './audio.js';

const AIM_PLANE_Y = 1.30;
const WHEEL_ROT = 0.34;   // radians of camera yaw per scroll notch

export class Game {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.5, 400);
    this.camGoal = new THREE.Vector3();
    this.camLook = new THREE.Vector3();

    this.ui = new UI(uiRoot, this);
    this.save = loadSave();
    this.state = 'menu';
    this.timeScale = 1;
    this.targetTimeScale = 1;
    this.clock = new THREE.Clock();
    this.mouse = new THREE.Vector2();
    this.aimPoint = new THREE.Vector3();
    this.raycaster = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -AIM_PLANE_Y);

    this.keys = new Set();
    this.mouseDown = false;
    this.wheelOpen = false;
    this.camYaw = 0;          // rotate the view with - and =
    this.fpv = false;         // first person, toggled with /
    this.fpYaw = 0;
    this.fpPitch = -0.06;
    this.seenIntro = new Set();   // intros play once per session, not on every retry
    this.wheelHover = 0;
    this.shake = 0;

    this.bindEvents();
    this.resize();
    this.showMainMenu();
    this.loop();
  }

  // -------------------------------------------------------------------------
  bindEvents() {
    window.addEventListener('resize', () => this.resize());

    window.addEventListener('keydown', e => {
      if (e.code === 'Tab') e.preventDefault();
      if (this.keys.has(e.code)) return;
      this.keys.add(e.code);
      this.onKey(e);
    });
    window.addEventListener('keyup', e => {
      this.keys.delete(e.code);
      if (e.code === 'Tab' && this.wheelOpen) this.closeWheel();
    });

    this.canvas.addEventListener('mousemove', e => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      this.mousePx = { x: e.clientX, y: e.clientY };
      if (this.wheelOpen) this.updateWheelHover(e.clientX, e.clientY);
    });
    window.addEventListener('mousedown', e => {
      A.initAudio(); A.resumeAudio();
      if (e.target !== this.canvas) return;
      if (e.button === 0) {
        if (this.wheelOpen) { this.commitWheel(); return; }
        // a click is a reliable gesture for pointer lock; a keypress is not
        if (this.fpv && document.pointerLockElement !== this.canvas) this.canvas.requestPointerLock?.();
        this.mouseDown = true;
      }
    });
    window.addEventListener('mouseup', e => { if (e.button === 0) this.mouseDown = false; });

    // First-person mouse look. Pointer lock gives clean infinite deltas, but
    // it can be refused (or dropped), so fall back to raw cursor deltas —
    // the view still turns either way.
    window.addEventListener('mousemove', e => {
      if (!this.fpv) return;
      const SENS = 0.0022;
      let dx, dy;
      if (document.pointerLockElement === this.canvas) {
        dx = e.movementX; dy = e.movementY;
      } else {
        if (this._lastMX === undefined) { this._lastMX = e.clientX; this._lastMY = e.clientY; return; }
        dx = e.clientX - this._lastMX;
        dy = e.clientY - this._lastMY;
        this._lastMX = e.clientX; this._lastMY = e.clientY;
      }
      if (!dx && !dy) return;
      this.fpYaw -= dx * SENS;
      this.fpPitch = clamp(this.fpPitch - dy * SENS, -1.15, 0.95);
    });
    document.addEventListener('pointerlockchange', () => {
      // lock can come and go; first person keeps working on cursor deltas
      this._lastMX = undefined;
    });
    window.addEventListener('contextmenu', e => { if (e.target === this.canvas) e.preventDefault(); });
    // Scroll rotates the camera, same axis as - and =. Weapon switching lives
    // on Tab and the number keys.
    window.addEventListener('wheel', e => {
      if (this.state !== 'play' || !this.player || this.wheelOpen) return;
      // normalise across input devices: trackpads emit many small pixel
      // deltas, mice emit a few large ones, and some report lines or pages.
      const unit = e.deltaMode === 1 ? 3 : e.deltaMode === 2 ? 1 : 100;
      const notches = clamp(e.deltaY / unit, -1, 1);
      this.camYaw += notches * WHEEL_ROT;
    }, { passive: true });
    window.addEventListener('blur', () => { this.mouseDown = false; this.keys.clear(); });
  }

  onKey(e) {
    const c = e.code;
    if (this.state === 'play') {
      if (c === 'Escape') return this.pause();
      if (c === 'KeyR') return this.player?.startReload();
      if (c === 'KeyG') { if (this.player?.tryDive(this.moveX, this.moveZ)) this.shake = Math.max(this.shake, 0.3); return; }
      if (c === 'KeyE') return this.tryPickup();
      if (c === 'KeyF') return this.throwWeapon();
      if (c === 'Tab') return this.openWheel();
      if (c === 'Slash') return this.toggleFPV();
      if (/^Digit[1-9]$/.test(c)) { this.player?.select(+c.slice(5) - 1); A.sfxUI(); return; }
    } else if (this.state === 'pause') {
      if (c === 'Escape') this.resume();
    } else if (this.state === 'dead') {
      if (c === 'KeyL' || c === 'Enter') this.respawn();
      else if (c === 'KeyR') this.startLevel(this.level.id);
    }
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // =========================================================================
  // MENUS
  // =========================================================================
  showMainMenu() {
    this.state = 'menu';
    this.teardownLevel();
    this.ui.setHudVisible(false);
    A.stopMusic();
    const s = this.ui.showScreen(mainMenuHTML(this.save), { cls: 'menu-screen' });
    this.scene.background = new THREE.Color(0x08070a);
    s.querySelectorAll('button').forEach(b => b.onclick = () => {
      A.initAudio(); A.resumeAudio(); A.sfxUI();
      const act = b.dataset.act;
      if (act === 'play') this.continueCampaign();
      else if (act === 'select') this.showMissionSelect();
      else if (act === 'arsenal') this.showArsenal('');
      else if (act === 'music') this.showSoundtrack();
      else if (act === 'controls') this.showControls();
      else if (act === 'wipe') { resetSave(); this.save = loadSave(); this.showMainMenu(); }
    });
  }
  showControls() {
    const s = this.ui.showScreen(controlsHTML(), { cls: 'menu-screen' });
    s.querySelector('[data-act=back]').onclick = () => { A.sfxUI(); this.showMainMenu(); };
  }
  showArsenal(filter) {
    const s = this.ui.showScreen(arsenalHTML(filter), { cls: 'menu-screen' });
    s.querySelector('[data-act=back]').onclick = () => { A.sfxUI(); this.showMainMenu(); };
    const inp = s.querySelector('.arsenal-search');
    inp.oninput = () => {
      const v = inp.value;
      clearTimeout(this._ft);
      this._ft = setTimeout(() => {
        const pos = inp.selectionStart;
        this.showArsenal(v);
        const ni = this.ui.screen.querySelector('.arsenal-search');
        ni.focus(); ni.setSelectionRange(pos, pos);
      }, 180);
    };
    setTimeout(() => inp.focus(), 30);
  }
  // Jukebox: every cue in the game. Click a track and it plays -- the screen
  // updates in place rather than re-rendering, so the list never jumps and
  // handlers never go stale.
  showSoundtrack() {
    const screen = this.ui.showScreen(soundtrackHTML(A.TRACKS, this.save, A.currentTrack()), { cls: 'menu-screen' });
    const label = screen.querySelector('.np-label');
    const rows = [...screen.querySelectorAll('.trk')];

    const paint = () => {
      const cur = A.currentTrack();
      for (const el of rows) {
        const on = el.dataset.track === cur;
        el.classList.toggle('playing', on);
        el.querySelector('.trk-play').innerHTML = on ? '&#9632;' : '&#9654;';
      }
      const row = rows.find(el => el.dataset.track === cur);
      label.textContent = row
        ? 'NOW PLAYING · ' + row.querySelector('.trk-title').textContent
        : 'STOPPED';
    };

    for (const el of rows) {
      el.onclick = () => {
        A.initAudio(); A.resumeAudio();
        A.startMusic(el.dataset.track);       // click = play, always
        A.setMusicIntensity(1);
        paint();
      };
    }
    screen.querySelector('[data-act=stop]').onclick = () => { A.sfxUI(); A.stopMusic(); paint(); };
    screen.querySelector('[data-act=back]').onclick = () => {
      A.sfxUI(); A.stopMusic(); this._stopMeter(); this.showMainMenu();
    };
    this._startMeter(screen.querySelector('.np-bar i'));
    paint();
  }
  // little level meter that pulses on the kick so you can see the beat
  _startMeter(bar) {
    this._stopMeter();
    if (!bar) return;
    const tick = () => {
      const v = A.musicPulse('kick') * 0.7 + A.musicPulse('snare') * 0.3;
      bar.style.width = (8 + v * 92) + '%';
      this._meterRaf = requestAnimationFrame(tick);
    };
    tick();
  }
  _stopMeter() { if (this._meterRaf) cancelAnimationFrame(this._meterRaf); this._meterRaf = null; }

  showMissionSelect() {
    const s = this.ui.showScreen(missionSelectHTML(this.save), { cls: 'menu-screen' });
    s.querySelector('[data-act=back]').onclick = () => { A.sfxUI(); this.showMainMenu(); };
    s.querySelectorAll('.mission:not(.locked)').forEach(m => {
      m.onclick = () => { A.sfxUI(); this.startLevel(m.dataset.lvl); };
    });
  }
  continueCampaign() {
    const next = ALL_LEVELS.find(L => !this.save.done[L.id] && levelUnlocked(L, this.save));
    if (next) this.startLevel(next.id);
    else this.showMissionSelect();
  }
  nextLevelAfter(id) {
    const i = ALL_LEVELS.findIndex(L => L.id === id);
    for (let k = i + 1; k < ALL_LEVELS.length; k++)
      if (levelUnlocked(ALL_LEVELS[k], this.save) && !this.save.done[ALL_LEVELS[k].id]) return ALL_LEVELS[k];
    for (const L of ALL_LEVELS) if (levelUnlocked(L, this.save) && !this.save.done[L.id]) return L;
    return null;
  }

  // =========================================================================
  // LEVEL LIFECYCLE
  // =========================================================================
  teardownLevel() {
    if (this.world) { this.world.dispose(); this.world = null; }
    if (this.bullets) { this.bullets.clear(); this.scene.remove(this.bullets.group); this.bullets = null; }
    if (this.debris) { this.debris.clear(); this.debris = null; }
    for (const a of this.actors || []) a.remove?.();
    for (const c of this.corpses || []) this.scene.remove(c);
    for (const p of this.pickups || []) if (!p.taken) p.take();
    this.actors = []; this.enemies = []; this.civilians = []; this.allies = [];
    this.corpses = []; this.pickups = []; this.thrown = [];
    this.player = null;
    while (this.scene.children.length) this.scene.remove(this.scene.children[0]);
  }

  async startLevel(id) {
    this._stopMeter();
    const level = LEVEL_BY_ID[id];
    if (!level) return this.showMainMenu();
    this.ui.hideScreen();
    this.teardownLevel();

    this.level = level;
    this.char = CHARS[level.char];
    this.state = 'briefing';

    const gen = generate(level);
    this.gen = gen;
    this.palette = paletteFor(gen.theme, this.char);
    this.world = new World(this.scene, gen, this.palette, gen.theme);
    this.bullets = new Bullets(this.scene);
    this.debris = new Debris(this.scene);
    this.actors = []; this.enemies = []; this.civilians = []; this.allies = [];
    this.corpses = []; this.pickups = []; this.thrown = [];
    this.rng = mulberry32(hashStr(id) ^ 0x9e3779b9);

    // --- player ------------------------------------------------------------
    const [psx, psz] = this.world.center(gen.playerSpawn.x, gen.playerSpawn.y);
    this.player = new Player(this.scene, psx, psz, this.char);
    this.player.addGun(gunById(this.char.start));
    // you keep a second weapon from act 2 onward -- these levels are long
    if (level.act >= 2) this.player.addGun(randomGun(this.rng, ['smg', 'ar'], 40), 3, false);
    if (level.gen.armory) this.player.addGun(gunById('heckler-koch-mp5'), 4, false);
    this.player.select(0);
    this.actors.push(this.player);

    // --- enemies -----------------------------------------------------------
    const diff = 1 + (level.gen.tier || 0) * 0.10;
    for (const s of gen.spawns) {
      const [wx, wz] = this.world.center(s.x, s.y);
      const e = new Enemy(this.scene, wx, wz, s.type, gunById(s.gunId), diff);
      this.enemies.push(e); this.actors.push(e);
    }
    // --- allies ------------------------------------------------------------
    if (level.gen.allies) {
      const roster = [['ron', 'heckler-koch-mp5'], ['john', 'remington-model-870'], ['vance', 'm4-carbine']];
      roster.forEach(([who, g], i) => {
        const a = new Ally(this.scene, psx + Math.cos(i * 2.1) * 4, psz + Math.sin(i * 2.1) * 4, CHARS[who], gunById(g));
        this.allies.push(a); this.actors.push(a);
      });
    }
    // --- civilians ---------------------------------------------------------
    for (const c of gen.civilians) {
      const [wx, wz] = this.world.center(c.x, c.y);
      this.civilians.push(new Civilian(this.scene, wx + (c.jx || 0), wz + (c.jy || 0), this.rng));
    }
    // --- interrogation target ---------------------------------------------
    this.target = null;
    if (gen.target) {
      const [wx, wz] = this.world.center(gen.target.x, gen.target.y);
      this.target = new Target(this.scene, wx, wz);
      this.actors.push(this.target);
    }
    // --- pickups -----------------------------------------------------------
    for (const p of gen.pickups) {
      const [wx, wz] = this.world.center(p.x, p.y);
      this.pickups.push(new Pickup(this.scene, wx, wz, p.kind, p.kind === 'gun' ? gunById(p.gunId) : null));
    }
    // --- objective marker --------------------------------------------------
    this.exitMarker = null;
    if (level.gen.prologue || level.gen.terminal || level.gen.flashback) {
      const [ex, ez] = this.world.center(gen.exitPoint.x, gen.exitPoint.y);
      this.exitPos = { x: ex, z: ez };
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.9, 28),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(this.char.accent), transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; g.add(ring);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 12, 20, 1, true),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(this.char.accent), transparent: true, opacity: 0.10, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      beam.position.set(0, 6, 0); g.add(beam);
      if (level.gen.terminal) {
        const desk = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.5, 1.8), new THREE.MeshStandardMaterial({ color: 0x3a2f24, roughness: 0.7 }));
        desk.position.y = 0.75; g.add(desk);
        const screen = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.3, 0.12), new THREE.MeshStandardMaterial({ color: 0x0b1620, emissive: 0x2e6f9c, emissiveIntensity: 1.7, roughness: 0.2 }));
        screen.position.set(0, 2.2, -0.4); g.add(screen);
      }
      g.position.set(ex, 0, ez);
      this.scene.add(g);
      this.exitMarker = g;
    }

    // --- stats -------------------------------------------------------------
    this.stats = { kills: 0, shots: 0, hits: 0, start: performance.now(), guns: new Set(), civKills: 0 };
    this.checkpoint = { x: psx, z: psz, room: -1, label: 'START' };
    this.setFPV(false);
    this._deathHandled = false;
    this._panicked = false;
    this._everMoved = false;
    this.deaths = 0;
    this.totalEnemies = this.enemies.length;
    this.alarmed = false;
    this.timeScale = 1; this.targetTimeScale = 1;
    this.snapCamera();

    // --- intro -------------------------------------------------------------
    this.ui.setHudVisible(false);
    A.startMusic(level.id);                       // every mission has its own score
    A.setMusicIntensity(gen.theme === 'nightclub' ? 1 : 0.65);

    await this.ui.showCard(level, this.char);
    const intro = this.pickScript(level, 'intro');
    // the intro plays the first time you see a mission, not on every retry
    if (intro.length && !this.seenIntro.has(level.id)) {
      this.seenIntro.add(level.id);
      await this.ui.playDialogue(intro, this.char.color);
    }

    this.state = 'play';
    this.ui.setHudVisible(true);
    this.clock.getDelta();
  }

  // =========================================================================
  // INPUT -> INTENT
  // =========================================================================
  readMove() {
    const k = this.keys;
    let x = 0, z = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) z -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) z += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    let wx, wz;
    if (this.fpv) {
      // Eyes-forward basis: forward is (sin, cos) and right is (-cos, sin).
      // The top-down basis below is mirrored, because that camera looks down
      // -Z from behind you -- using it here made W walk backwards.
      const fwd = -z, strafe = x;
      const sy = Math.sin(this.fpYaw), cy = Math.cos(this.fpYaw);
      wx = fwd * sy - strafe * cy;
      wz = fwd * cy + strafe * sy;
    } else {
      // rotate the intent into world space so W is always "up the screen"
      const c = Math.cos(this.camYaw), sn = Math.sin(this.camYaw);
      wx = x * c + z * sn;
      wz = -x * sn + z * c;
    }
    this.moveX = wx; this.moveZ = wz;
    return { mx: wx, mz: wz };
  }

  // held keys rotate the camera smoothly rather than in jumps
  updateCamRotation(raw) {
    const k = this.keys;
    const SPD = 4.2;
    if (k.has('Minus') || k.has('NumpadSubtract')) this.camYaw -= SPD * raw;
    if (k.has('Equal') || k.has('NumpadAdd')) this.camYaw += SPD * raw;
    if (k.has('Digit0')) this.camYaw = 0;
  }

  updateAimPoint() {
    if (this.fpv && this.player) {
      // aim straight down the barrel of where we're looking
      const p = this.player;
      this.aimPoint.set(p.x + Math.sin(this.fpYaw) * 30, AIM_PLANE_Y, p.z + Math.cos(this.fpYaw) * 30);
      return;
    }
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.plane, this.aimPoint);
    if (!hit && this.player) this.aimPoint.set(this.player.x, AIM_PLANE_Y, this.player.z + 10);
  }

  toggleFPV() { this.setFPV(!this.fpv); }

  setFPV(on) {
    if (on === this.fpv) return;
    this.fpv = on;
    A.sfxUI();
    if (on) {
      this.fpYaw = this.player ? this.player.aim : this.camYaw;
      this.fpPitch = -0.06;
      this.camera.fov = 74;                       // comfortable first-person FOV
      this._lastMX = undefined;
      this.canvas.requestPointerLock?.();
      // you'd be looking at the inside of your own skull otherwise
      if (this.player) this.player.rig.neck.visible = false;
      this.ui.setCrosshair(true);
      this.ui.feed('FIRST PERSON — / TO EXIT', this.char ? this.char.color : '#fff');
    } else {
      this.camera.fov = 52;
      if (document.pointerLockElement === this.canvas) document.exitPointerLock?.();
      if (this.player) this.player.rig.neck.visible = true;
      this.ui.setCrosshair(false);
    }
    this.camera.updateProjectionMatrix();
  }

  openWheel() {
    if (!this.player || this.player.slots.length < 2) return;
    this.wheelOpen = true;
    this.wheelHover = this.player.slot;
    this.targetTimeScale = 0.16;
    this.ui.showWheel(this.player, this.wheelHover);
    A.sfxUI();
  }
  updateWheelHover(px, py) {
    if (!this.player) return;
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    const dx = px - cx, dy = py - cy;
    if (Math.hypot(dx, dy) < 44) return;
    const n = this.player.slots.length;
    let a = Math.atan2(dy, dx) + Math.PI / 2;
    if (a < 0) a += Math.PI * 2;
    const idx = Math.round(a / (Math.PI * 2) * n) % n;
    if (idx !== this.wheelHover) { this.wheelHover = idx; A.sfxUI(); this.ui.showWheel(this.player, idx); }
  }
  commitWheel() { this.closeWheel(); }
  closeWheel() {
    if (!this.wheelOpen) return;
    this.wheelOpen = false;
    this.camYaw = 0;          // rotate the view with - and =
    this.fpv = false;         // first person, toggled with /
    this.fpYaw = 0;
    this.fpPitch = -0.06;
    this.seenIntro = new Set();   // intros play once per session, not on every retry
    this.ui.hideWheel();
    this.targetTimeScale = 1;
    if (this.player) this.player.select(this.wheelHover);
  }

  tryPickup() {
    if (!this.player) return;
    let best = null, bd = 3.4 * 3.4;
    for (const p of this.pickups) {
      if (p.taken) continue;
      const d = (p.x - this.player.x) ** 2 + (p.z - this.player.z) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) return;
    this.consumePickup(best);
  }
  consumePickup(p) {
    p.take();
    if (p.kind === 'gun') {
      this.player.addGun(p.gun, 3, true);
      this.stats.guns.add(p.gun.name);
      this.ui.feed('PICKED UP ' + p.gun.name.toUpperCase(), '#ffd166');
      this.bark('pickup', 0.25);
    } else if (p.kind === 'ammo') {
      for (const s of this.player.slots) s.reserve += s.gun.mag * 2;
      this.ui.feed('AMMO RESUPPLY', '#ffd166');
    } else {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 45);
      this.ui.feed('+45 HEALTH', '#4be08a');
    }
    A.sfxPickup();
  }

  throwWeapon() {
    const p = this.player;
    if (!p || p.dead) return;
    const g = p.throwWeapon();
    if (!g) return;
    const ax = this.aimPoint.x - p.x, az = this.aimPoint.z - p.z;
    const n = Math.hypot(ax, az) || 1;
    const t = new ThrownWeapon(this.scene, p.x + ax / n * 1.2, p.z + az / n * 1.2, ax / n, az / n, g, p);
    this.thrown.push(t);
    A.sfxThrow();
    this.ui.feed('THREW ' + g.name.toUpperCase(), '#ffd166');
  }

  // Dialogue varies on two story flags: whether Ron sent the email, and
  // whether Recker left Kessler alive. Falls back to the plain script.
  pickScript(level, which) {
    const f = this.save.flags;
    const cap = which[0].toUpperCase() + which.slice(1);
    if (f.kesslerAlive === true && level[which + 'Alive']) return level[which + 'Alive'];
    if (f.kesslerAlive === false && level[which + 'Dead']) return level[which + 'Dead'];
    if (f.sent && level[which + 'Sent']) return level[which + 'Sent'];
    if (!f.sent && level[which + 'Kept']) return level[which + 'Kept'];
    return level[which] || [];
  }

  bark(kind, chance = 1) {
    if (Math.random() > chance) return;
    const set = BARKS[this.level.char];
    const lines = set && set[kind];
    if (!lines || !lines.length) return;
    this.ui.feed(lines[Math.floor(Math.random() * lines.length)], this.char.color);
  }

  // =========================================================================
  // MAIN LOOP
  // =========================================================================
  loop() {
    requestAnimationFrame(() => this.loop());
    const raw = Math.min(0.05, this.clock.getDelta());
    // slow motion easing
    this.timeScale = lerp(this.timeScale, this.targetTimeScale, 1 - Math.pow(0.0012, raw));
    A.setTimeWarp(this.timeScale);
    this.ui.setSlowmo(1 - this.timeScale);
    const dt = raw * this.timeScale;

    if (this.state === 'play') this.updateCamRotation(raw);
    if (this.state === 'play' || this.state === 'outro' || this.state === 'ending') this.step(dt, raw);
    this.updateCamera(raw);
    this.renderer.render(this.scene, this.camera);
  }

  step(dt, raw) {
    const w = this.world, p = this.player;
    if (!w || !p) return;
    w.update(dt);
    w.updateLights(p.x, p.z, dt);
    A.setListener(p.x, p.z, this.camYaw);
    this.debris.update(dt);

    const playable = this.state === 'play';

    // ---- player ----------------------------------------------------------
    const input = playable && !this.wheelOpen ? this.readMove() : { mx: 0, mz: 0 };
    this.updateAimPoint();
    if (!p.dead) {
      p.update(dt, w, input, this.aimPoint);
      if (p.bustedDoor) { p.bustedDoor = false; this.bark('door', 0.35); this.shake = Math.max(this.shake, 0.35); this.alertAround(p.x, p.z, 34); }
      // dive drops the world into slow motion
      if (p.diveT > 0) this.targetTimeScale = 0.30;
      else if (!this.wheelOpen && this.targetTimeScale < 1) this.targetTimeScale = 1;

      if (playable && this.mouseDown && !this.wheelOpen) {
        const s = p.cur;
        // Holding the button keeps firing on everything -- semi-autos are
        // still distinct because their cyclic rate is far lower.
        {
          const ax = this.aimPoint.x - p.x, az = this.aimPoint.z - p.z;
          if (p.fire(this.bullets, ax, az)) {
            this.stats.shots += s.gun.pellets;
            this.stats.guns.add(s.gun.name);
            this.shake = Math.min(1.2, this.shake + clamp(s.gun.recoil * 0.055, 0.02, 0.20));
            const m = p.muzzleWorld();
            this.debris.casing(m.x, m.y, m.z, Math.sin(p.aim), Math.cos(p.aim));
            // the invisible circle: only crews inside the report radius react
            this.alertAround(p.x, p.z, s.gun.loudness);
            this.panicCivilians();
          }
        }
      }
      if (!this.mouseDown) this._firedThisClick = false;

      // walk over a pickup to take it
      for (const pk of this.pickups) {
        if (pk.taken) continue;
        if ((pk.x - p.x) ** 2 + (pk.z - p.z) ** 2 < 2.0) {
          if (pk.kind !== 'gun') this.consumePickup(pk);
        }
      }
    }
    for (const pk of this.pickups) pk.update(dt);

    // ---- enemies ---------------------------------------------------------
    let alive = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      alive++;
      e.update(dt, w, p, this.bullets, this.enemies);
    }
    for (const a of this.allies) a.update(dt, w, p, this.enemies, this.bullets);
    if (this.target) this.target.update(dt, w, p);

    // ---- civilians -------------------------------------------------------
    const kick = A.musicPulse('kick');
    for (const c of this.civilians) c.update(dt, w, p, w.time, kick);

    // ---- bullets + thrown weapons ---------------------------------------
    const hitTargets = [...this.actors, ...this.civilians];
    this.bullets.update(dt, w, hitTargets, h => this.onBulletHit(h));
    for (let i = this.thrown.length - 1; i >= 0; i--) {
      const t = this.thrown[i];
      t.update(dt, w, hitTargets, h => this.onThrownHit(h));
      if (t.done) this.thrown.splice(i, 1);
    }

    // ---- music intensity follows the fight -------------------------------
    if (this.gen.theme !== 'nightclub') {
      const engaged = this.enemies.some(e => !e.dead && e.state === 'engage');
      A.setMusicIntensity(engaged ? 1.25 : this.alarmed ? 0.95 : 0.6);
    }

    // ---- HUD -------------------------------------------------------------
    this.ui.updateHud(p, this.level, alive, this.totalEnemies);
    if (this.wheelOpen) this.ui.showWheel(p, this.wheelHover);

    if (playable) this.updateCheckpoint();
    this.updateGuidance(alive, playable);
    if (playable) this.checkObjective(alive);
    if (playable && (p.dead || p.hp <= 0) && !this._deathHandled) {
      this._deathHandled = true;
      this.onPlayerDeath();
    }
  }

  // On-screen guidance: where to go, and (early on) which keys do what.
  updateGuidance(alive, playable) {
    const p = this.player, cfg = this.level.gen;
    if (!playable) { this.ui.hideWaypoint(); this.ui.hideTutorial(); return; }

    // --- waypoint ---------------------------------------------------------
    let goal = null, label = '';
    if (this.exitPos && (cfg.prologue || cfg.flashback)) { goal = this.exitPos; label = 'GO HERE'; }
    else if (this.exitPos && cfg.terminal) { goal = this.exitPos; label = 'THE DESK'; }
    else if (cfg.target && this.target && !this.target.downed) { goal = this.target; label = 'TARGET'; }
    else if (alive > 0 && alive <= 5) {
      let best = null, bd = Infinity;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = dist(p.x, p.z, e.x, e.z);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) { goal = best; label = alive === 1 ? 'LAST HOSTILE' : `${alive} LEFT`; }
    }
    if (goal) {
      const v = new THREE.Vector3(goal.x, 1.4, goal.z).project(this.camera);
      const px = (v.x * 0.5 + 0.5) * window.innerWidth;
      const py = (-v.y * 0.5 + 0.5) * window.innerHeight;
      const onScreen = v.z < 1 && Math.abs(v.x) < 0.92 && Math.abs(v.y) < 0.92;
      this.ui.showWaypoint(px, py, onScreen, dist(p.x, p.z, goal.x, goal.z), label);
    } else this.ui.hideWaypoint();

    // --- first-time prompts ------------------------------------------------
    const moved = this._everMoved || Math.abs(this.moveX) + Math.abs(this.moveZ) > 0;
    if (moved) this._everMoved = true;
    const t = (performance.now() - this.stats.start) / 1000;
    if (!this._everMoved && t > 0.6) {
      this.ui.showTutorial('<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>MOVE</span>');
    } else if (cfg.enemies === 0 && !cfg.terminal && t < 14) {
      this.ui.showTutorial('<span>FOLLOW THE MARKER</span>');
    } else if (p.cur && p.cur.mag === 0 && p.cur.reserve === 0) {
      this.ui.showTutorial('<span>OUT OF AMMO</span><kbd>F</kbd><span>THROW THE GUN</span><kbd>E</kbd><span>PICK ONE UP</span>');
    } else if (!p.cur) {
      this.ui.showTutorial('<span>UNARMED</span><kbd>E</kbd><span>PICK UP A WEAPON</span>');
    } else if (cfg.enemies > 0 && this.stats.shots === 0 && t < 12) {
      this.ui.showTutorial('<kbd>LMB</kbd><span>SHOOT</span><kbd>R</kbd><span>RELOAD</span><kbd>G</kbd><span>DIVE</span><kbd>TAB</kbd><span>WEAPONS</span>');
    } else this.ui.hideTutorial();
  }

  // Clearing a room banks it: that room becomes where you come back from.
  updateCheckpoint() {
    const p = this.player, g = this.gen;
    if (!p || p.dead) return;
    let idx = -1;
    for (let i = 0; i < g.rooms.length; i++) {
      const r = g.rooms[i];
      const tx = this.world.tx(p.x), tz = this.world.tz(p.z);
      if (tx >= r.x0 && tx <= r.x1 && tz >= r.y0 && tz <= r.y1) { idx = i; break; }
    }
    if (idx < 0 || idx === this.checkpoint.room) return;
    // only bank a room with nothing alive nearby
    const hot = this.enemies.some(e => !e.dead && dist(e.x, e.z, p.x, p.z) < 26);
    if (hot) return;
    const r = this.gen.rooms[idx];
    this.checkpoint = { x: p.x, z: p.z, room: idx, label: (r.purpose || 'AREA').toUpperCase() };
    this.ui.feed('CHECKPOINT — ' + this.checkpoint.label, '#4be08a');
    A.sfxCheckpoint();
  }

  // Come back at the last checkpoint with everything you already cleared
  // still cleared. A full restart is a separate button.
  respawn() {
    if (this.state !== 'dead' || !this.player) return;
    const p = this.player;
    this.ui.hideScreen();
    p.dead = false;
    this._deathHandled = false;
    p.hp = p.maxHp;
    p.invuln = 2.2;
    p.x = this.checkpoint.x; p.z = this.checkpoint.z;
    p.vx = 0; p.vz = 0;
    p.diveT = 0; p.diveCd = 0; p.reloadT = 0; p.shotT = 0;
    // stand the rig back up
    p.rig.root.rotation.set(0, 0, 0);
    p.rig.root.position.set(p.x, 0, p.z);
    p.rig.setDive(0);
    // top everything up so you are not respawning dry
    if (!p.slots.length) p.addGun(gunById(this.char.start));
    for (const sl of p.slots) { sl.mag = sl.gun.mag; sl.reserve = Math.max(sl.reserve, sl.gun.mag * 2); }
    if (p.cur) p.equip(p.cur.gun);
    this.bullets.clear();
    // whoever was hunting you loses the scent
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (dist(e.x, e.z, p.x, p.z) < 40) { e.state = 'idle'; e.lastSeen = null; e.alertT = 0; }
    }
    this.mouseDown = false;
    this._firedThisClick = false;
    this.keys.clear();
    this.snapCamera();
    this.ui.setHudVisible(true);
    this.state = 'play';
    this.clock.getDelta();
    A.startMusic(this.level.id);
    this.ui.feed('RESPAWNED — ' + this.checkpoint.label, this.char.color);
  }

  alertAround(x, z, r) {
    this.alarmed = true;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if ((e.x - x) ** 2 + (e.z - z) ** 2 < r * r) e.alert(x, z);
    }
  }
  panicCivilians() {
    if (this._panicked) return;
    this._panicked = true;
    for (const c of this.civilians) c.startPanic();
    if (this.civilians.length) this.ui.feed('THE FLOOR EMPTIES', '#ff6b9d');
  }

  onBulletHit(h) {
    const fromPlayer = h.b.owner === this.player;
    if (h.kind === 'wall') {
      this.debris.spark(h.x, h.z);
      return;
    }
    const a = h.actor;
    if (!a || a.dead) return;
    this.debris.bloodBurst(h.x, h.z);
    A.sfxHit(h.x, h.z);

    if (a === this.player) {
      if (this.player.invuln > 0) return;
      const dmg = h.b.dmg;
      this.player.damage(dmg);
      A.sfxHurt();
      this.ui.flashHit(clamp(dmg / 30, 0.2, 0.7));
      this.shake = Math.min(1.4, this.shake + 0.4);
      if (this.player.hp < this.player.maxHp * 0.28) this.bark('lowHp', 0.10);
      return;
    }
    if (fromPlayer) this.stats.hits++;

    // civilians
    if (a instanceof Civilian || a.team === 'civ') {
      if (a.damage()) {
        this.debris.blood(a.x, a.z, 1.3);
        a.remove();
        this.civilians = this.civilians.filter(c => c !== a);
        this.stats.civKills++;
        this.panicCivilians();
        if (fromPlayer) this.ui.feed('CIVILIAN DOWN', '#ff6b9d');
      }
      return;
    }

    // the interrogation target
    if (a.isTarget) {
      const downed = a.damage(h.b.dmg);
      if (downed) {
        this.ui.feed('TARGET DOWN — ALIVE', '#ffd166');
        A.sfxKill(a.x, a.z);
      }
      return;
    }

    // ordinary enemies
    if (a.damage(h.b.dmg)) {
      this.onEnemyKilled(a, fromPlayer);
    } else if (a.alert) {
      a.alert(h.b.owner?.x ?? this.player.x, h.b.owner?.z ?? this.player.z);
    }
  }

  onThrownHit(h) {
    if (h.kind === 'thrown-landed') {
      // it lands where it stopped and can be picked straight back up
      this.pickups.push(new Pickup(this.scene, h.x, h.z, 'gun', h.gun));
      A.sfxWeaponDrop();
      return;
    }
    const a = h.actor;
    if (!a || a.dead) return;
    this.debris.spark(h.x, h.z, 0xffd166);
    A.sfxThunk();
    this.shake = Math.min(1.2, this.shake + 0.22);
    if (a === this.player) { this.player.damage(h.dmg * 0.5); this.ui.flashHit(0.4); return; }
    if (a.team === 'civ') { a.startPanic?.(); return; }
    a.stagger?.(0.75);
    if (a.damage(h.dmg)) this.onEnemyKilled(a, true);
    else { a.alert?.(this.player.x, this.player.z); this.ui.feed('STAGGERED', '#ffd166'); }
  }

  onEnemyKilled(e, byPlayer) {
    A.sfxKill(e.x, e.z);
    this.debris.blood(e.x, e.z, 1.5);
    this.debris.bloodBurst(e.x, e.z);
    const corpse = makeCorpse(e, this.scene);
    this.corpses.push(corpse);
    if (e.gunMesh) {
      // the dead drop what they were carrying
      const pk = new Pickup(this.scene, e.x + (Math.random() - 0.5) * 1.6, e.z + (Math.random() - 0.5) * 1.6, 'gun', e.gun);
      this.pickups.push(pk);
    }
    if (byPlayer) {
      this.stats.kills++;
      if (!this.player.firstKill) { this.player.firstKill = true; this.bark('firstKill'); }
      const left = this.enemies.filter(x => !x.dead).length;
      if (left === 1) this.bark('lastEnemy', 0.8);
      this.shake = Math.min(1.2, this.shake + 0.12);
    }
    this.alertAround(e.x, e.z, 26);
    this.panicCivilians();
  }

  // =========================================================================
  // OBJECTIVES
  // =========================================================================
  checkObjective(aliveEnemies) {
    const cfg = this.level.gen;
    const p = this.player;
    if (cfg.prologue || cfg.flashback) {
      if (this.exitPos && dist(p.x, p.z, this.exitPos.x, this.exitPos.z) < 4.2) return this.completeLevel();
      return;
    }
    if (cfg.terminal) {
      if (this.exitPos && dist(p.x, p.z, this.exitPos.x, this.exitPos.z) < 4.2) return this.runChoiceLevel();
      return;
    }
    if (cfg.target) {
      if (this.target && this.target.downed) return this.completeLevel();
      return;
    }
    if (aliveEnemies === 0) {
      if (this.level.bonusFinale) return this.runBonusFinale();
      if (this.level.finale) return this.runFinale();
      return this.completeLevel();
    }
  }

  // --- Ron's email ---------------------------------------------------------
  async runChoiceLevel() {
    if (this.state !== 'play') return;
    this.state = 'outro';
    this.ui.setHudVisible(false);
    this.targetTimeScale = 1;
    await this.ui.playDialogue([
      { who: '', text: 'The cursor is in the To: field. It has been for three weeks.', c: '#888' },
      { who: '', text: 'TO: j.arden@heraldwire.net', c: '#4ec8ff' },
      { who: '', text: 'SUBJECT: 4127 GALLOWAY — THE REPORT IS WRONG', c: '#4ec8ff' },
      { who: 'RON', text: 'If I send this I am not a person with a job anymore.' },
      { who: 'RON', text: 'I am a witness.' },
    ], this.char.color);

    const pick = await this.ui.askChoice(
      'THE EMAIL IS WRITTEN.',
      { key: 'F', label: 'DELETE IT', id: 'delete' },
      { key: 'E', label: 'SEND IT', id: 'send' },
      '#8a8f98', '#4ec8ff');

    if (pick === 'send') {
      this.save.flags.sent = true;
      A.sfxWin();
      await this.ui.playDialogue([
        { who: '', text: 'SENT — 01:57', c: '#4ec8ff' },
        { who: 'RON', text: 'Okay.' },
        { who: 'RON', text: 'Okay.' },
        { who: '', text: 'Somewhere a phone lights up on a desk nobody is sitting at.', c: '#888' },
      ], this.char.color);
    } else {
      this.save.flags.sent = false;
      await this.ui.playDialogue([
        { who: '', text: 'DELETED. TRASH EMPTIED.', c: '#8a8f98' },
        { who: 'RON', text: "There. It's gone. Nobody has to—" },
        { who: 'RON', text: '...' },
        { who: 'RON', text: 'Nobody has to anything.' },
        { who: '', text: 'A phone on an empty newsroom desk does not ring.', c: '#888' },
      ], this.char.color);
    }
    this.completeLevel(true);
  }

  // --- the ending ----------------------------------------------------------
  async runFinale() {
    if (this.state !== 'play') return;
    this._bonusWasLocked = !bonusUnlocked(this.save);   // for the unlock banner
    this.state = 'ending';
    this.ui.setHudVisible(false);
    this.targetTimeScale = 1;
    A.setMusicIntensity(0.4);

    await this.ui.playDialogue(FINALE_CONFRONT, this.char.color);

    const choice = await this.ui.askChoice(
      ENDING_CHOICE.prompt,
      ENDING_CHOICE.left, ENDING_CHOICE.right,
      '#ff2d3d', '#ffd166');

    // the good ending needs somebody left alive to carry it -- which means
    // Ron's email, and the people it reached.
    const haveWitnesses = networkAlive(this.save);
    const good = choice === 'record' && haveWitnesses;
    const ending = good ? ENDING_GOOD : ENDING_QUIET;

    A.stopMusic();
    A.startMusic(good ? 'ending_good' : 'ending_quiet');
    A.setMusicIntensity(0.7);

    if (choice === 'record' && !haveWitnesses) {
      await this.ui.playDialogue([
        { who: 'RECKER', text: "You're going to say it out loud. To a reporter." },
        { who: 'KESSLER', text: 'To whom?', c: '#dddddd' },
        { who: 'KESSLER', text: 'Nobody is coming. Nobody was ever told.', c: '#dddddd' },
        { who: 'RECKER', text: '...' },
        { who: '', text: 'There was a man with a badge number and an unsent email.', c: '#888' },
        { who: '', text: 'That was the whole difference.', c: '#888' },
      ], this.char.color);
    }

    this.save.done[this.level.id] = true;
    this.save.ending = ending.id;
    this.save.flags.kesslerAlive = (choice === 'record');   // drives the bonus campaign
    writeSave(this.save);

    await this.ui.playDialogue(ending.lines, this.char.color);
    await this.rollCredits();
    writeSave(this.save);
    this.showEndingCard(ending, this._bonusWasLocked);
  }

  // Credits roll, then the bonus campaign opens up.
  async rollCredits() {
    A.stopMusic();
    this.ui.setHudVisible(false);
    A.startMusic('credits');
    await this.ui.playCredits(CREDIT_ROLES, CREDIT_NAMES, CREDIT_TAIL);
    A.stopMusic();
  }

  // The bonus campaign's own closing choice: the gun, or the form.
  async runBonusFinale() {
    if (this.state !== 'play') return;
    this.state = 'ending';
    this.ui.setHudVisible(false);
    this.targetTimeScale = 1;
    A.setMusicIntensity(0.4);

    const alive = this.save.flags.kesslerAlive === true;
    await this.ui.playDialogue(alive ? BONUS_CONFRONT_ALIVE : BONUS_CONFRONT_DEAD, this.char.color);

    const choice = await this.ui.askChoice(
      BONUS_CHOICE.prompt, BONUS_CHOICE.left, BONUS_CHOICE.right, '#ff2d3d', '#a86bff');

    const good = choice === 'file';
    const ending = good ? BONUS_ENDING_GOOD : BONUS_ENDING_QUIET;
    const epi = good ? KESSLER_EPILOGUE : KESSLER_EPILOGUE_QUIET;

    A.stopMusic();
    A.startMusic(good ? 'ending_good' : 'ending_quiet');
    A.setMusicIntensity(0.7);

    // swap the placeholder line for whichever fate Kessler actually met
    const lines = ending.lines.map(l =>
      l.text === 'KESSLER_LINE' ? { ...l, text: alive ? epi.alive : epi.dead } : l);

    this.save.done[this.level.id] = true;
    this.save.bonusEnding = ending.id;
    writeSave(this.save);

    await this.ui.playDialogue(lines, this.char.color);
    await this.rollCredits();
    this.showEndingCard(ending, false);
  }

  showEndingCard(ending, firstUnlock) {
    A.stopMusic();
    this.ui.setHudVisible(false);
    const good = ending.id === 'good';
    const s = this.ui.showScreen(`
      <div class="menu narrow ending ${good ? 'good' : 'quiet'}">
        <div class="end-k">${good ? 'TRUE ENDING' : 'ENDING'}</div>
        <h1>${ending.title}</h1>
        <div class="end-sub">${ending.sub}</div>
        <div class="end-body">${good
          ? 'The Bad Company is gone, and four people are alive who can say why.'
          : 'Everyone who did it is dead. The thing that did it is still hiring.'}</div>
        ${good ? '' : '<div class="end-hint">Send Ron\'s email, play John\'s missions, and put Kessler on the record.</div>'}
        ${firstUnlock ? '<div class="end-unlock">BONUS CAMPAIGN UNLOCKED — <b>THE SUBSIDIARY</b><br><span>Ten missions. Three new leads. The story changes depending on whether you left Kessler breathing.</span></div>' : ''}
        <div class="menu-btns">
          <button data-act="select">MISSION SELECT</button>
          <button data-act="menu">MAIN MENU</button>
        </div>
      </div>`, { cls: 'menu-screen' });
    s.querySelector('[data-act=select]').onclick = () => { A.sfxUI(); this.showMissionSelect(); };
    s.querySelector('[data-act=menu]').onclick = () => { A.sfxUI(); this.showMainMenu(); };
  }

  // --- ordinary completion -------------------------------------------------
  async completeLevel(skipOutro = false) {
    if (this.state === 'outro' && !skipOutro) return;
    if (this.state !== 'play' && !skipOutro) return;
    this.state = 'outro';
    this.ui.setHudVisible(false);
    this.targetTimeScale = 1;
    A.sfxWin();
    A.setMusicIntensity(0.45);
    this.bark('clear', 0.6);

    this.save.done[this.level.id] = true;
    const t = Math.round((performance.now() - this.stats.start) / 1000);
    const prev = this.save.best[this.level.id];
    if (!prev || t < prev) this.save.best[this.level.id] = t;
    writeSave(this.save);

    const outro = this.pickScript(this.level, 'outro');
    if (outro.length) await this.ui.playDialogue(outro, this.char.color);

    A.stopMusic();
    const acc = this.stats.shots ? Math.round(this.stats.hits / this.stats.shots * 100) : 0;
    const stats = {
      kills: this.stats.kills, acc,
      time: `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`,
      guns: this.stats.guns.size,
    };
    const next = this.nextLevelAfter(this.level.id);
    const s = this.ui.showScreen(clearHTML(this.level, this.char, stats, next && next.title), { cls: 'menu-screen' });
    s.querySelector('[data-act=next]').onclick = () => {
      A.sfxUI();
      if (next) this.startLevel(next.id); else this.showMissionSelect();
    };
    s.querySelector('[data-act=menu]').onclick = () => { A.sfxUI(); this.showMissionSelect(); };
  }

  onPlayerDeath() {
    this.ui.hideWaypoint(); this.ui.hideTutorial();
    this.player.dead = true;
    this.state = 'dead';
    this.deaths = (this.deaths || 0) + 1;
    this.ui.setHudVisible(false);
    A.sfxLose();
    A.stopMusic();
    // knocked flat, but not turned into scenery -- we stand them back up
    this.player.rig.root.rotation.x = -Math.PI / 2 + (Math.random() - 0.5) * 0.25;
    this.player.rig.root.position.y = 0.30;
    const acc = this.stats.shots ? Math.round(this.stats.hits / this.stats.shots * 100) : 0;
    const s = this.ui.showScreen(deathHTML(this.char, {
      kills: this.stats.kills, acc, checkpoint: this.checkpoint.label,
    }), { cls: 'menu-screen' });
    s.querySelector('[data-act=respawn]').onclick = () => { A.sfxUI(); this.respawn(); };
    s.querySelector('[data-act=restart]').onclick = () => { A.sfxUI(); this.startLevel(this.level.id); };
    s.querySelector('[data-act=menu]').onclick = () => { A.sfxUI(); this.showMainMenu(); };
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'pause';
    this.ui.setHudVisible(false);
    const s = this.ui.showScreen(pauseHTML(this.level, this.char), { cls: 'menu-screen' });
    s.querySelector('[data-act=resume]').onclick = () => { A.sfxUI(); this.resume(); };
    s.querySelector('[data-act=restart]').onclick = () => { A.sfxUI(); this.startLevel(this.level.id); };
    s.querySelector('[data-act=menu]').onclick = () => { A.sfxUI(); this.showMainMenu(); };
  }
  resume() {
    this.ui.hideScreen();
    this.ui.setHudVisible(true);
    this.state = 'play';
    this.clock.getDelta();
  }

  // =========================================================================
  // CAMERA
  // =========================================================================
  // Eyes-in-the-head camera. Sits just forward of the chest so the torso
  // doesn't clip the near plane, and dips with the slow-motion dive.
  updateCameraFPV(p, raw) {
    const dive = p.rig._dive || 0;
    const eyeY = 1.70 - dive * 0.85;
    const fx = Math.sin(this.fpYaw), fz = Math.cos(this.fpYaw);
    this.camera.position.set(p.x + fx * 0.34, eyeY, p.z + fz * 0.34);
    if (this.shake > 0.001) {
      this.shake = Math.max(0, this.shake - raw * 3.4);
      const s2 = this.shake * this.shake * 0.55;
      this.camera.position.x += (Math.random() - 0.5) * s2;
      this.camera.position.y += (Math.random() - 0.5) * s2;
      this.camera.position.z += (Math.random() - 0.5) * s2;
    }
    const cp = Math.cos(this.fpPitch), sp = Math.sin(this.fpPitch);
    this.camera.lookAt(
      this.camera.position.x + fx * cp * 10,
      this.camera.position.y + sp * 10,
      this.camera.position.z + fz * cp * 10,
    );
  }

  snapCamera() {
    if (!this.player) return;
    const p = this.player;
    const c = Math.cos(this.camYaw), sn = Math.sin(this.camYaw);
    this.camera.position.set(p.x + sn * 15, 27, p.z + c * 15);
    this.camera.lookAt(p.x, 0, p.z);
    this.camGoal.copy(this.camera.position);
    this.camLook.set(p.x, 0, p.z);
  }
  updateCamera(raw) {
    const p = this.player;
    if (p && this.fpv) return this.updateCameraFPV(p, raw);
    if (!p) {
      // slow idle orbit behind the menus
      const t = performance.now() * 0.0002;
      this.camera.position.set(Math.cos(t) * 30, 26, Math.sin(t) * 30);
      this.camera.lookAt(0, 0, 0);
      return;
    }
    // lead the camera toward where the player is aiming
    const lx = clamp((this.aimPoint.x - p.x) * 0.22, -9, 9);
    const lz = clamp((this.aimPoint.z - p.z) * 0.22, -9, 9);
    const speed = Math.hypot(p.vx, p.vz);
    const height = 26.5 + Math.min(5, speed * 0.24) + (this.wheelOpen ? 5 : 0);

    const back = height * 0.56;
    const c = Math.cos(this.camYaw), sn = Math.sin(this.camYaw);
    this.camGoal.set(p.x + lx + (-sn * 0 + c * 0) + sn * back, height, p.z + lz + c * back);
    this.camLook.set(p.x + lx * 0.6, 1.1, p.z + lz * 0.6);

    const k = 1 - Math.pow(0.0022, raw);
    this.camera.position.lerp(this.camGoal, k);
    this._look = this._look || new THREE.Vector3().copy(this.camLook);
    this._look.lerp(this.camLook, k);

    if (this.shake > 0.001) {
      this.shake = Math.max(0, this.shake - raw * 3.4);
      const s = this.shake * this.shake * 1.5;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s * 0.5;
    }
    this.camera.lookAt(this._look);
  }
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
