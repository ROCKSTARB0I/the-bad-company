// ============================================================================
// THE BAD COMPANY -- audio engine.
//
// Everything is synthesized live; there are no audio files. What makes it read
// as music rather than beeps is the mix architecture: a convolution reverb bus,
// a tempo-locked ping-pong delay, and a sidechain compressor that ducks the
// whole music bus on every kick -- the pumping you hear in real club records.
//
// The sequencer runs on a lookahead scheduler locked to the audio clock and
// publishes beat events so the nightclub lighting lands exactly on the kick.
// ============================================================================

export const AUDIO_BUILD = '1.0.2';   // audio stability patch

let ctx = null;
let master, comp, duckGain, sfxGain;
let musicFilter, warpFilter, sidechain, musicGain;
let revSend, revReturn, dlySend, dlyReturn, dlyL, dlyR, dlyFbL, dlyFbR;
let noiseBuf = null;

const clampf = (v, a, b) => v < a ? a : v > b ? b : v;

// ---------------------------------------------------------------------------
// VOICE TEARDOWN
// A stopped source is collectable, but the filter/gain/panner it fed is still
// wired to the output, so the graph can never let it go. Without this every
// sound left ~30 permanently-connected nodes behind, the audio thread ended up
// processing tens of thousands of silent nodes each quantum, and the sound
// degraded the longer you played. Each voice now dismantles itself.
// ---------------------------------------------------------------------------
let liveNodes = 0;
// `once` guards the accounting: a source that is stopped more than once can
// fire onended again, which was double-decrementing the counter.
function teardown(nodes, state) {
  if (state.done) return;
  state.done = true;
  for (let i = 0; i < nodes.length; i++) {
    try { nodes[i].disconnect(); } catch (e) { /* already gone */ }
  }
  liveNodes -= nodes.length;
}
function reap(src, nodes) {
  liveNodes += nodes.length;
  const state = { done: false };
  src.onended = function () { teardown(nodes, state); };
}
function reapLater(nodes, seconds) {
  liveNodes += nodes.length;
  const state = { done: false };
  setTimeout(function () { teardown(nodes, state); }, seconds * 1000 + 500);
}
export function liveNodeCount() { return liveNodes; }

// Reverb send for world sound effects. 0 = dry, no echo on gunshots or
// anything else in the world. The music bus has its own reverb path and is
// unaffected by this.
const SFX_REVERB = 0;
const nf = (root, semi) => root * Math.pow(2, semi / 12);

export function initAudio() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();

  master = ctx.createGain(); master.gain.value = 0.9;
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12; comp.knee.value = 24; comp.ratio.value = 6;
  comp.attack.value = 0.0008; comp.release.value = 0.18;   // fast enough to keep transients

  // Brickwall safety net. A dozen shots landing on the same frame sum well
  // past full scale; a soft-clipping shaper folds that back smoothly. Uses a
  // waveshaper rather than a second compressor so it adds zero latency.
  const limiter = ctx.createWaveShaper();
  limiter.curve = limiterCurve();
  // 'none': oversampling filters ring and overshoot past full scale, which
  // defeats the point of a brickwall. Exact clamping matters more here.
  limiter.oversample = 'none';
  comp.connect(master); master.connect(limiter); limiter.connect(ctx.destination);

  duckGain = ctx.createGain(); duckGain.gain.value = 1; duckGain.connect(comp);
  sfxGain = ctx.createGain(); sfxGain.gain.value = 0.9; sfxGain.connect(duckGain);

  // ---- music chain: filter -> sidechain -> gain -> duck -------------------
  musicFilter = ctx.createBiquadFilter();
  musicFilter.type = 'lowpass'; musicFilter.frequency.value = 20000; musicFilter.Q.value = 0.9;
  // Separate node for the slow-motion sweep. Two writers on one AudioParam
  // fought each other and produced audible filter jumps.
  warpFilter = ctx.createBiquadFilter();
  warpFilter.type = 'lowpass'; warpFilter.frequency.value = 20000; warpFilter.Q.value = 0.7;
  sidechain = ctx.createGain(); sidechain.gain.value = 1;
  musicGain = ctx.createGain(); musicGain.gain.value = 0.34;
  musicFilter.connect(warpFilter); warpFilter.connect(sidechain);
  sidechain.connect(musicGain); musicGain.connect(duckGain);

  // ---- noise source -------------------------------------------------------
  const n = Math.floor(ctx.sampleRate * 2);
  noiseBuf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = noiseBuf.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }

  // ---- reverb: generated impulse response ---------------------------------
  const conv = ctx.createConvolver();
  conv.buffer = makeIR(1.7, 2.6);
  revSend = ctx.createGain(); revSend.gain.value = 1;
  revReturn = ctx.createGain(); revReturn.gain.value = 0.9;
  const revPre = ctx.createBiquadFilter();
  revPre.type = 'highpass'; revPre.frequency.value = 380;   // keep mud out of the tail
  revSend.connect(revPre); revPre.connect(conv); conv.connect(revReturn);
  revReturn.connect(duckGain);

  // ---- ping-pong delay ----------------------------------------------------
  dlySend = ctx.createGain(); dlySend.gain.value = 1;
  dlyL = ctx.createDelay(2); dlyR = ctx.createDelay(2);
  dlyFbL = ctx.createGain(); dlyFbR = ctx.createGain();
  dlyFbL.gain.value = 0.40; dlyFbR.gain.value = 0.40;
  const panL = ctx.createStereoPanner(); panL.pan.value = -0.75;
  const panR = ctx.createStereoPanner(); panR.pan.value = 0.75;
  const dlyTone = ctx.createBiquadFilter();
  dlyTone.type = 'lowpass'; dlyTone.frequency.value = 2600;
  dlyReturn = ctx.createGain(); dlyReturn.gain.value = 0.55;
  dlySend.connect(dlyL);
  dlyL.connect(dlyFbL); dlyFbL.connect(dlyR);
  dlyR.connect(dlyFbR); dlyFbR.connect(dlyL);
  dlyL.connect(panL); dlyR.connect(panR);
  panL.connect(dlyTone); panR.connect(dlyTone);
  dlyTone.connect(dlyReturn); dlyReturn.connect(duckGain);
  setDelayTime(0.375);
}

// soft-clipper: real muzzle blasts are loud enough to distort, and a little
// saturation is what stops a synthesized shot sounding like a synth
let limiterCurveCache = null;
function limiterCurve() {
  if (limiterCurveCache) return limiterCurveCache;
  const n = 8192, c = new Float32Array(n);
  const KNEE = 0.72;                       // linear below this, soft above
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    const a = Math.abs(x);
    let y;
    if (a <= KNEE) y = a;
    else y = KNEE + (1 - KNEE) * Math.tanh((a - KNEE) / (1 - KNEE));
    c[i] = Math.sign(x) * y;
  }
  limiterCurveCache = c;
  return c;
}

let shaperCurve = null;
function saturationCurve(k = 26) {
  if (shaperCurve) return shaperCurve;
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  shaperCurve = c;
  return c;
}

function makeIR(seconds, decay) {
  const rate = ctx.sampleRate, len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // early reflections then a smooth exponential tail
      const env = Math.pow(1 - t, decay);
      const early = i < rate * 0.08 && Math.random() < 0.004 ? 2.5 : 1;
      d[i] = (Math.random() * 2 - 1) * env * early;
    }
  }
  return buf;
}
function setDelayTime(t) { if (dlyL) { dlyL.delayTime.value = t; dlyR.delayTime.value = t; } }

export function resumeAudio() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
export function audioReady() { return !!ctx; }
export function setMasterVolume(v) { if (master) master.gain.value = v; }
export function setMusicVolume(v) { if (musicGain) musicGain.gain.value = v; }

// ---------------------------------------------------------------------------
// PRIMITIVE VOICES
// ---------------------------------------------------------------------------
function noiseAt(t, dur, g, type, freq, q, dest, sendRev = 0) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
  const gn = ctx.createGain();
  gn.gain.setValueAtTime(g, t);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(gn); gn.connect(dest || sfxGain);
  // music voices keep their reverb; world sounds are gated by SFX_REVERB
  const toMusicBus = dest === musicFilter || dest === musicGain;
  const revAmt = toMusicBus ? sendRev : sendRev * SFX_REVERB;
  const kill = [s, f, gn];
  if (revAmt > 0) {
    const r = ctx.createGain(); r.gain.value = revAmt; gn.connect(r); r.connect(revSend);
    kill.push(r);
  }
  s.start(t); s.stop(t + dur + 0.02);
  reap(s, kill);
}
function toneAt(t, type, f0, f1, dur, g, dest, attack = 0.002) {
  const o = ctx.createOscillator(); o.type = type;
  const gn = ctx.createGain();
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  gn.gain.setValueAtTime(0.0001, t);
  gn.gain.exponentialRampToValueAtTime(Math.max(0.0002, g), t + attack);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(gn); gn.connect(dest || sfxGain);
  o.start(t); o.stop(t + dur + 0.02);
  reap(o, [o, gn]);
  return o;
}

// supersaw: seven detuned saws through a resonant filter, the club workhorse
function saws(t, freq, dur, g, cutFrom, cutTo, q, opts = {}) {
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = q;
  f.frequency.setValueAtTime(cutFrom, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(90, cutTo), t + dur * 0.9);
  const gn = ctx.createGain();
  gn.gain.setValueAtTime(0.0001, t);
  gn.gain.exponentialRampToValueAtTime(g, t + (opts.attack ?? 0.006));
  if (opts.hold) gn.gain.setValueAtTime(g, t + dur * opts.hold);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  f.connect(gn);
  const pan = ctx.createStereoPanner(); pan.pan.value = opts.pan ?? 0;
  gn.connect(pan); pan.connect(musicFilter);
  const kill = [f, gn, pan];
  if (opts.rev) { const r = ctx.createGain(); r.gain.value = opts.rev; pan.connect(r); r.connect(revSend); kill.push(r); }
  if (opts.dly) { const d = ctx.createGain(); d.gain.value = opts.dly; pan.connect(d); d.connect(dlySend); kill.push(d); }
  const dets = opts.thin ? [-6, 0, 6] : [-14, -8, -3, 0, 3, 8, 14];
  const oscs = [];
  for (const c of dets) {
    const o = ctx.createOscillator();
    o.type = opts.wave || 'sawtooth';
    o.frequency.value = freq * Math.pow(2, c / 1200);
    o.connect(f); o.start(t); o.stop(t + dur + 0.04);
    oscs.push(o);
  }
  reap(oscs[0], oscs.concat(kill));
}
function chord(t, freqs, dur, g, cutFrom, cutTo, opts = {}) {
  for (let i = 0; i < freqs.length; i++)
    saws(t, freqs[i], dur, g / Math.sqrt(freqs.length), cutFrom, cutTo, opts.q ?? 6,
         { ...opts, pan: (i / Math.max(1, freqs.length - 1) - 0.5) * (opts.spread ?? 0.7) });
}


// ---------------------------------------------------------------------------
// POSITIONAL AUDIO
// World sounds are panned and attenuated against the player's position, and
// rolled off with distance so a firefight two rooms away reads as muffled and
// off to one side rather than right in your ear.
// ---------------------------------------------------------------------------
let lisX = 0, lisZ = 0, lisYaw = 0;
export function setListener(x, z, yaw) { lisX = x; lisZ = z; lisYaw = yaw || 0; }

const HEAR_MAX = 110;
function at3d(x, z, maxDist = HEAR_MAX) {
  if (!ctx) return null;
  if (x === undefined || x === null) return sfxGain;
  const dx = x - lisX, dz = z - lisZ;
  const d = Math.hypot(dx, dz);
  if (d > maxDist) return null;                     // out of earshot entirely
  const g = ctx.createGain();
  const fall = 1 - d / maxDist;
  g.gain.value = fall * fall;
  const pan = ctx.createStereoPanner();
  // rotate into view space so left on screen is left in the mix
  const c = Math.cos(-lisYaw), s2 = Math.sin(-lisYaw);
  const rx = dx * c - dz * s2;
  pan.pan.value = clampf(rx / 24, -0.9, 0.9);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.max(600, 18000 - d * 190);   // distance dulls it
  g.connect(lp); lp.connect(pan); pan.connect(sfxGain);
  // no source drives this shared chain, so free it on a timer instead
  reapLater([g, lp, pan], 3.0);
  return g;
}

// ---------------------------------------------------------------------------
// GUNFIRE AND ONE-SHOTS
// ---------------------------------------------------------------------------
const now = () => ctx ? ctx.currentTime : 0;
// ---------------------------------------------------------------------------
// GUNSHOT
// Layered the way a real report is: an instantaneous broadband crack, the
// muzzle blast behind it, a low-frequency thump you feel more than hear, the
// mechanical clatter of the action, and a decaying tail into the room. Every
// layer is jittered per shot so automatic fire never sounds like a loop.
// ---------------------------------------------------------------------------
function burst(t, dur, amp, type, freq, q, dest, curveAmt) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  src.playbackRate.value = 0.75 + Math.random() * 0.5;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
  const g = ctx.createGain();
  // instant onset -- no ramp up. This is the whole trick.
  g.gain.setValueAtTime(amp, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = f;
  const kill = [src, f, g];
  if (curveAmt) {
    const ws = ctx.createWaveShaper();
    ws.curve = saturationCurve(curveAmt);
    f.connect(ws); node = ws; kill.push(ws);
  }
  src.connect(f); node.connect(g); g.connect(dest);
  src.start(t); src.stop(t + dur + 0.02);
  reap(src, kill);
  return g;
}
function thump(t, f0, f1, dur, amp, dest) {
  const o = ctx.createOscillator();
  o.type = 'sine';
  const g = ctx.createGain();
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(18, f1), t + dur * 0.6);
  g.gain.setValueAtTime(amp, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + 0.02);
  reap(o, [o, g]);
}
function mech(t, amp, dest) {
  // slide / bolt / extractor: two tiny metallic ticks just after the shot
  burst(t + 0.012 + Math.random() * 0.006, 0.018, amp, 'bandpass', 2600 + Math.random() * 1600, 7, dest);
  burst(t + 0.040 + Math.random() * 0.014, 0.030, amp * 0.7, 'bandpass', 1500 + Math.random() * 900, 5, dest);
}

// --- polyphony budget -----------------------------------------------------
// Layered gunshots are expensive. Past a few overlapping shots nobody can
// pick out the detail anyway, so shed the quiet layers first and only drop
// whole shots at the extreme. The player's own weapon is never throttled.
const SHOT_WINDOW = 0.15;
const SHOT_FULL   = 6;    // this many concurrent shots keep every layer
const SHOT_MAX    = 14;   // beyond this, additional shots are skipped
let shotTimes = [];
function shotBudget(t, privileged) {
  let drop = 0;
  while (drop < shotTimes.length && t - shotTimes[drop] > SHOT_WINDOW) drop++;
  if (drop) shotTimes.splice(0, drop);
  const n = shotTimes.length;
  shotTimes.push(t);
  if (privileged) return 2;
  if (n >= SHOT_MAX) return 0;
  return n < SHOT_FULL ? 2 : 1;
}

export function sfxShot(g, x, z) {
  if (!ctx) return;
  const D = at3d(x, z, HEAR_MAX);
  if (!D) return;                                   // fired outside earshot
  const t = now();
  // no coordinates means it is the player's own gun, right on the listener
  const budget = shotBudget(t, x === undefined || x === null);
  if (budget === 0) return;
  const full = budget === 2;
  const j = 0.9 + Math.random() * 0.2;              // per-shot level jitter
  const p = clampf(g.dmg / 45, 0.3, 2.6);           // caliber "power"

  if (g.silenced) {
    // mostly action noise and a dull pressure thump
    burst(t, 0.030, 0.20 * j, 'bandpass', 1100 + Math.random() * 400, 2.0, D);
    burst(t, 0.090, 0.10 * j, 'lowpass', 700, 1, D);
    thump(t, 150, 60, 0.070, 0.10 * j, D);
    mech(t, 0.16, D);
    return;
  }

  // --- layer 1: the crack. Very short, very bright, instant attack. -------
  const crackAmt = g.cls === 'shotgun' ? 0.35 : g.cls === 'sniper' ? 0.85 : 0.62;
  burst(t, 0.0035, 1.95 * crackAmt * j, 'highpass', 3800, 0.7, D, 30);
  burst(t, 0.014, 1.35 * crackAmt * j, 'highpass', 1800, 0.7, D, 18);

  // --- layer 2: muzzle blast. Body of the sound, pitched by caliber. ------
  const blastLP = g.cls === 'shotgun' ? 1100 : 1500 + 900 / p;
  const blastDur = (g.cls === 'shotgun' ? 0.20 : g.cls === 'sniper' ? 0.16 : 0.11) * (0.85 + p * 0.15);
  burst(t + 0.001, blastDur, 1.25 * j, 'lowpass', blastLP, 0.9, D, 12);

  // --- layer 3: low thump, the part you feel -----------------------------
  const f0 = g.cls === 'shotgun' ? 170 : 120 + 90 / p;
  thump(t, f0, f0 * 0.28, 0.13 + p * 0.05, Math.min(0.88, 0.48 * p) * j, D);

  // --- layer 4: mechanical action ----------------------------------------
  if (full) mech(t, g.cls === 'lmg' || g.cls === 'ar' ? 0.20 : 0.13, D);

  // --- layer 5: tail into the room ---------------------------------------
  if (full) {
    const tailDur = g.cls === 'sniper' ? 0.34 : g.cls === 'shotgun' ? 0.26 : 0.16 + p * 0.05;
    burst(t + 0.010, tailDur, 0.24 * j, 'bandpass', 800 + Math.random() * 400, 0.8, D);
  }

}

export function sfxDryFire()  { if (ctx) toneAt(now(), 'square', 2200, 1400, 0.03, 0.10); }
export function sfxReloadOut(){ if (!ctx) return; toneAt(now(), 'square', 900, 500, 0.05, 0.11); noiseAt(now(), 0.06, 0.09, 'highpass', 1800); }
export function sfxReloadIn() { if (!ctx) return; toneAt(now(), 'square', 500, 1200, 0.05, 0.13); noiseAt(now(), 0.05, 0.10, 'highpass', 1200); }
export function sfxHit(x, z)  { if (!ctx) return; const D = at3d(x, z); if (!D) return; noiseAt(now(), 0.09, 0.30, 'lowpass', 700, 1, D); toneAt(now(), 'sine', 150, 60, 0.10, 0.16, D); }
export function sfxKill(x, z) { if (!ctx) return; const D = at3d(x, z); if (!D) return; noiseAt(now(), 0.30, 0.36, 'lowpass', 480, 1, D, 0.3); toneAt(now(), 'sine', 110, 40, 0.28, 0.22, D); }
export function sfxHurt()     { if (!ctx) return; toneAt(now(), 'sawtooth', 260, 70, 0.22, 0.26); noiseAt(now(), 0.16, 0.20, 'lowpass', 500); }
export function sfxRicochet(x, z) { if (!ctx) return; const D = at3d(x, z); if (!D) return; toneAt(now(), 'square', 2600 + Math.random() * 1400, 500, 0.10, 0.06, D); }
export function sfxDoor()     { if (!ctx) return; noiseAt(now(), 0.45, 0.55, 'lowpass', 420, 1, null, 0.4); toneAt(now(), 'sine', 90, 34, 0.40, 0.30); toneAt(now(), 'square', 300, 80, 0.14, 0.14); }
export function sfxCheckpoint() {
  if (!ctx) return;
  const t = now();
  toneAt(t, 'sine', 330, 330, 0.5, 0.07);
  toneAt(t + 0.09, 'sine', 494, 494, 0.6, 0.055);
  noiseAt(t, 0.5, 0.03, 'bandpass', 2200, 2, null, 0.8);
}
export function sfxThrow() {
  if (!ctx) return;
  const t = now();
  noiseAt(t, 0.22, 0.14, 'bandpass', 700, 1.2, null, 0.2);
  toneAt(t, 'sine', 300, 700, 0.16, 0.07);
}
export function sfxThunk() {
  if (!ctx) return;
  const t = now();
  noiseAt(t, 0.11, 0.34, 'lowpass', 900, 1, null, 0.25);
  toneAt(t, 'sine', 190, 70, 0.14, 0.24);
  toneAt(t, 'square', 620, 240, 0.05, 0.10);
}
export function sfxWeaponDrop() {
  if (!ctx) return;
  const t = now();
  noiseAt(t, 0.10, 0.16, 'bandpass', 1800, 3);
  toneAt(t, 'square', 420, 180, 0.07, 0.08);
  noiseAt(t + 0.09, 0.07, 0.08, 'bandpass', 1400, 4);
}
export function sfxDoorOpen(x, z) {
  if (!ctx) return;
  const D = at3d(x, z); if (!D) return;
  const t = now();
  toneAt(t, 'square', 1500, 900, 0.025, 0.09, D);                 // latch
  noiseAt(t + 0.02, 0.34, 0.06, 'bandpass', 480, 3, D, 0.35);     // hinge creak
  toneAt(t + 0.05, 'sine', 150, 120, 0.22, 0.05, D);
}
export function sfxDoorSlam(x, z) {
  if (!ctx) return;
  const D = at3d(x, z); if (!D) return;
  const t = now();
  noiseAt(t, 0.22, 0.42, 'lowpass', 700, 1, D, 0.5);
  toneAt(t, 'sine', 110, 40, 0.30, 0.26, D);
  noiseAt(t + 0.18, 0.16, 0.16, 'bandpass', 900, 2, D, 0.5);      // rebound off the stop
}
export function sfxDive()     { if (!ctx) return; noiseAt(now(), 0.55, 0.22, 'bandpass', 500, 0.7, null, 0.5); toneAt(now(), 'sine', 400, 90, 0.5, 0.10); }
export function sfxPickup()   { if (!ctx) return; toneAt(now(), 'square', 700, 1400, 0.07, 0.13); toneAt(now() + 0.03, 'square', 1400, 2100, 0.06, 0.08); }
export function sfxBlip()     { if (ctx) toneAt(now(), 'square', 1100 + Math.random() * 250, 900, 0.022, 0.045); }
export function sfxUI()       { if (ctx) toneAt(now(), 'square', 500, 900, 0.05, 0.09); }
export function sfxAlert(x, z) { if (!ctx) return; const D = at3d(x, z); if (!D) return; toneAt(now(), 'sawtooth', 300, 700, 0.16, 0.14, D); }
export function sfxScream(x, z) { if (!ctx) return; const D = at3d(x, z); if (!D) return; const f = 500 + Math.random() * 400; toneAt(now(), 'sawtooth', f, f * 1.7, 0.30, 0.10, D); toneAt(now() + 0.06, 'sawtooth', f * 1.6, f * 0.7, 0.35, 0.08, D); }
export function sfxGlass()    { if (!ctx) return; for (let i = 0; i < 5; i++) noiseAt(now() + i * 0.02, 0.10, 0.10, 'bandpass', 3000 + Math.random() * 4000, 6); }
// Objective reached. Not a fanfare -- a low resolved thud with a long tail.
// Something landing, not something celebrating.
export function sfxWin() {
  if (!ctx) return;
  const t = now();
  toneAt(t, 'sine', 128, 48, 1.35, 0.34, musicFilter ? undefined : undefined);
  noiseAt(t, 1.20, 0.13, 'lowpass', 620, 1, null, 0.95);
  toneAt(t + 0.02, 'triangle', 196, 196, 1.7, 0.075);          // minor third above
  toneAt(t + 0.02, 'triangle', 233.1, 233.1, 1.7, 0.055);
  noiseAt(t + 0.35, 0.9, 0.05, 'bandpass', 1500, 1.4, null, 1.0);
}
export function sfxLose()     { if (ctx) [392, 330, 262, 196].forEach((f, i) => toneAt(now() + i * 0.15, 'sawtooth', f, f * 0.98, 0.34, 0.16)); }

let warp = 1;
let lastWarpApplied = -1;
export function setTimeWarp(t) {
  if (!ctx) return;
  warp = t;
  // Called every rendered frame. Re-automating two AudioParams 60x a second
  // is pure churn on the audio thread, so only act on a real change.
  if (Math.abs(t - lastWarpApplied) < 0.01) return;
  lastWarpApplied = t;
  const n = ctx.currentTime;
  duckGain.gain.setTargetAtTime(0.55 + 0.45 * t, n, 0.05);
  warpFilter.frequency.setTargetAtTime(420 + 19500 * (t * t), n, 0.05);
}

// ---------------------------------------------------------------------------
// DRUM VOICES
// ---------------------------------------------------------------------------
function kick(t, g = 1) {
  const o = ctx.createOscillator(); o.type = 'sine';
  const gn = ctx.createGain();
  o.frequency.setValueAtTime(180, t);
  o.frequency.exponentialRampToValueAtTime(44, t + 0.085);
  gn.gain.setValueAtTime(0.0001, t);
  gn.gain.exponentialRampToValueAtTime(1.15 * g, t + 0.004);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
  o.connect(gn); gn.connect(musicGain);           // kick bypasses its own duck
  o.start(t); o.stop(t + 0.40);
  noiseAt(t, 0.016, 0.34 * g, 'highpass', 2000, 1, musicGain);
  duck(t, g);
  lastKickTime = t;
}
// sidechain: drop the music bus under every kick and let it breathe back in
function duck(t, amt = 1) {
  const depth = 1 - 0.62 * clampf(amt, 0, 1);
  sidechain.gain.cancelScheduledValues(t);
  sidechain.gain.setValueAtTime(depth, t);
  sidechain.gain.linearRampToValueAtTime(depth, t + 0.012);
  sidechain.gain.setTargetAtTime(1, t + 0.02, 0.075);
}
function clap(t, g = 1) {
  for (let i = 0; i < 3; i++) noiseAt(t + i * 0.010, 0.05, 0.32 * g, 'bandpass', 1650, 3.5, musicFilter);
  noiseAt(t + 0.028, 0.20, 0.24 * g, 'bandpass', 1350, 1.6, musicFilter, 0.45);
  lastSnareTime = t;
}
function snare(t, g = 1) {
  noiseAt(t, 0.13, 0.32 * g, 'highpass', 1400, 1, musicFilter, 0.35);
  toneAt(t, 'triangle', 220, 150, 0.09, 0.24 * g, musicFilter);
  lastSnareTime = t;
}
function hat(t, open, g = 1) {
  noiseAt(t, open ? 0.24 : 0.032, (open ? 0.14 : 0.18) * g, 'highpass', open ? 8200 : 10800, 1, musicFilter, open ? 0.2 : 0);
}
function ride(t, g = 1) { noiseAt(t, 0.36, 0.055 * g, 'bandpass', 6500, 2, musicFilter, 0.3); }
function rim(t, g = 1) { noiseAt(t, 0.03, 0.24 * g, 'bandpass', 2600, 5, musicFilter, 0.35); }
function clank(t, g = 1) {
  noiseAt(t, 0.09, 0.22 * g, 'bandpass', 1100 + Math.random() * 900, 9, musicFilter, 0.4);
  noiseAt(t, 0.22, 0.09 * g, 'highpass', 4200, 1, musicFilter, 0.3);
}
function sub(t, f, dur, g = 1) {
  const o = ctx.createOscillator(); o.type = 'sine';
  const o2 = ctx.createOscillator(); o2.type = 'triangle';
  const gn = ctx.createGain();
  o.frequency.value = f; o2.frequency.value = f;
  gn.gain.setValueAtTime(0.0001, t);
  gn.gain.exponentialRampToValueAtTime(0.62 * g, t + 0.012);
  gn.gain.setValueAtTime(0.62 * g, t + dur * 0.6);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(gn); o2.connect(gn); gn.connect(musicFilter);
  o.start(t); o.stop(t + dur + 0.02); o2.start(t); o2.stop(t + dur + 0.02);
  reap(o, [o, o2, gn]);
}
function riser(t, dur, g) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3;
  f.frequency.setValueAtTime(300, t);
  f.frequency.exponentialRampToValueAtTime(7000, t + dur);
  const gn = ctx.createGain();
  gn.gain.setValueAtTime(0.0001, t);
  gn.gain.exponentialRampToValueAtTime(g, t + dur * 0.9);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
  s.connect(f); f.connect(gn); gn.connect(musicFilter);
  const r = ctx.createGain(); r.gain.value = 0.5; gn.connect(r); r.connect(revSend);
  s.start(t); s.stop(t + dur + 0.1);
}
function impact(t, g) {
  toneAt(t, 'sine', 120, 32, 1.1, g, musicFilter);
  noiseAt(t, 0.9, g * 0.5, 'lowpass', 900, 1, musicFilter, 0.9);
}
function pad(t, freqs, dur, g) {
  chord(t, freqs, dur, g, 380, 1500, { attack: dur * 0.3, hold: 0.6, rev: 0.65, spread: 0.9, q: 2 });
}
function bell(t, f, g) {
  const car = ctx.createOscillator(); car.type = 'sine'; car.frequency.value = f;
  const mod = ctx.createOscillator(); mod.type = 'sine'; mod.frequency.value = f * 2.41;
  const mg = ctx.createGain();
  mg.gain.setValueAtTime(f * 3.2, t);
  mg.gain.exponentialRampToValueAtTime(1, t + 1.4);
  mod.connect(mg); mg.connect(car.frequency);
  const gn = ctx.createGain();
  gn.gain.setValueAtTime(0.0001, t);
  gn.gain.exponentialRampToValueAtTime(g, t + 0.006);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
  car.connect(gn); gn.connect(musicFilter);
  const r = ctx.createGain(); r.gain.value = 0.8; gn.connect(r); r.connect(revSend);
  const d = ctx.createGain(); d.gain.value = 0.4; gn.connect(d); d.connect(dlySend);
  car.start(t); car.stop(t + 2.0); mod.start(t); mod.stop(t + 2.0);
}
function siren(t, f0, f1, dur, g) {
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.Q.value = 6;
  fl.frequency.setValueAtTime(f0 * 2, t);
  fl.frequency.exponentialRampToValueAtTime(f1 * 2, t + dur);
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const gn = ctx.createGain();
  gn.gain.setValueAtTime(0.0001, t);
  gn.gain.exponentialRampToValueAtTime(g, t + 0.02);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(fl); fl.connect(gn); gn.connect(musicFilter);
  const r = ctx.createGain(); r.gain.value = 0.5; gn.connect(r); r.connect(revSend);
  o.start(t); o.stop(t + dur + 0.02);
}
function airSweep(t, dur, g) { noiseAt(t, dur, g, 'bandpass', 420, 0.6, musicFilter, 0.8); }

// ---------------------------------------------------------------------------
// SEQUENCER STATE
// ---------------------------------------------------------------------------
let seqTimer = null, nextStepTime = 0, stepIdx = 0, bpm = 128, running = false;
let intensity = 1, cfg = null, trackName = null;
const LOOKAHEAD = 0.30, TICK = 50;   // roomy enough for Windows timer jitter
let lastKickTime = -1, lastSnareTime = -1, lastBarTime = -1;
const pulses = { step: 0, beat: 0 };

export function musicPulse(k) {
  if (!ctx) return 0;
  const t = ctx.currentTime;
  const last = k === 'snare' ? lastSnareTime : k === 'bar' ? lastBarTime : lastKickTime;
  if (last < 0) return 0;
  const age = t - last;
  const decay = k === 'bar' ? 0.9 : k === 'snare' ? 0.28 : 0.22;
  return age < 0 ? 1 : Math.max(0, 1 - age / decay);
}
export function musicStep() { return pulses.step; }
export function musicBeat() { return pulses.beat; }
export function isMusicRunning() { return running; }

// ===========================================================================
// THE NIGHTCLUB TRACK -- 128 BPM, F minor, i–VI–III–VII, 32-bar arrangement
// ===========================================================================
const F1 = 43.65;
const PROG = [                                   // 8 bars, two per chord
  { root: 0,  ch: [0, 3, 7, 12] },               // Fm
  { root: 0,  ch: [0, 3, 7, 12] },
  { root: -4, ch: [-4, 0, 3, 8] },               // Db
  { root: -4, ch: [-4, 0, 3, 8] },
  { root: 3,  ch: [3, 7, 10, 15] },              // Ab
  { root: 3,  ch: [3, 7, 10, 15] },
  { root: -2, ch: [-2, 2, 5, 10] },              // Eb
  { root: -2, ch: [-2, 2, 5, 10] },
];
// call-and-response hook, two bars long, in scale degrees over the chord root
const CLUB_HOOK = [
  12, null, 15, null, 12, null, 10, 12,
  null, 15, null, 19, 17, null, 15, null,
  12, null, 10, null, 7, null, 10, 12,
  null, 7, null, 5, 3, null, 0, null,
];

function clubStep(s, t) {
  const b = s & 15;                     // step within the bar
  const bar = (s >> 4);                 // absolute bar
  const p = PROG[bar % 8];
  const sect = (bar >> 3) % 4;          // 8-bar sections: build the arrangement
  const i = intensity;
  const buildBar = (bar % 32) === 31;   // last bar of every 32 -> transition
  const openness = 0.34 + 0.66 * (((bar % 16) / 15));
  musicFilter.frequency.setTargetAtTime(900 + 15500 * openness, t, 0.05);

  // ---- drums -------------------------------------------------------------
  if (!buildBar) {
    if (b % 4 === 0) kick(t, 1);
    if (b === 4 || b === 12) clap(t, 0.95);
    if (b % 2 === 1) hat(t, b % 8 === 7, 1);
    else if (b % 4 === 2) hat(t, true, 0.7);
    if (sect >= 2 && b % 4 === 2) ride(t, 0.7);
    if (sect >= 1 && b === 15 && (bar % 4) === 3) { rim(t, 0.7); rim(t + 0.055, 0.5); }
  } else {
    // build bar: snare roll accelerating into the drop, plus a riser
    if (b === 0) { riser(t, (60 / bpm) * 4, 0.16); kick(t, 1); }
    const density = b < 4 ? 4 : b < 8 ? 2 : b < 12 ? 2 : 1;
    if (b % density === 0) snare(t, 0.30 + b / 15 * 0.65);
    if (b === 15) impact(t + 60 / bpm / 4, 0.55);
  }

  // ---- bass: offbeat stab plus a rolling sixteenth ghost ------------------
  const bf = nf(F1, p.root);
  if (!buildBar) {
    if (b % 4 === 2) sub(t, bf, 0.17, 1);
    if (sect >= 1 && b % 8 === 6) sub(t, bf * 2, 0.09, 0.45);
    if (sect >= 2 && b % 8 === 3) sub(t, bf, 0.07, 0.35);
  }

  // ---- chord stabs: the & of 2 and 4 -------------------------------------
  if (sect >= 1 && !buildBar && (b === 6 || b === 14)) {
    chord(t, p.ch.map(x => nf(F1 * 4, x)), 0.34, 0.13 * i,
          1100 + 3200 * openness, 620, { rev: 0.30, dly: 0.18, spread: 0.85, q: 7 });
  }
  // sustained pad underneath from section 2
  if (sect >= 2 && b === 0 && bar % 2 === 0) {
    pad(t, p.ch.map(x => nf(F1 * 2, x)), (60 / bpm) * 8, 0.048 * i);
  }
  // ---- lead hook ----------------------------------------------------------
  if (sect >= 2 && !buildBar) {
    const idx = ((bar % 2) * 16 + b) % CLUB_HOOK.length;
    const n = CLUB_HOOK[idx];
    if (n !== null && n !== undefined) {
      saws(t, nf(F1 * 4, n + p.root), 0.19, 0.085 * i,
           1400 + 4200 * openness, 700, 9,
           { thin: sect === 2, rev: 0.28, dly: 0.42, pan: (b % 4 === 0 ? -0.2 : 0.2) });
    }
  }
  if (b === 0) lastBarTime = t;
}

// ===========================================================================
// PER-LEVEL TRACKS -- every mission gets its own score
// ===========================================================================
const SC = {
  minor:    [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  dorian:   [0, 2, 3, 5, 7, 9, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  penta:    [0, 3, 5, 7, 10],
  wholeish: [0, 2, 4, 6, 8, 10],
  aeolian4: [0, 3, 5, 6, 7, 10],
};
// chord roots per bar (8-bar loop), in semitones from the key
const P_STATIC = [0, 0, 0, 0, 0, 0, 0, 0];
const P_DESC   = [0, 0, -2, -2, -4, -4, -5, -5];
const P_CLASSIC= [0, 0, 3, 3, -2, -2, -4, -4];
const P_TENSE  = [0, 1, 0, 1, -4, -3, -4, -3];
const P_LIFT   = [0, 0, 5, 5, 3, 3, 7, 7];

export const TRACKS = {
  prologue:  { bpm: 62,  root: 41.20, sc: SC.harmonic, prog: P_STATIC, drums: 'none',       bass: 'drone',   lead: 'bell',  air: .55, gain: .30 },
  recker_1:  { club: true, bpm: 128, gain: .38 },
  ron_1:     { bpm: 76,  root: 48.99, sc: SC.wholeish, prog: P_STATIC, drums: 'pulse',      bass: 'drone',   lead: 'pad',   air: .40, gain: .30 },
  recker_2:  { bpm: 132, root: 43.65, sc: SC.penta,    prog: P_CLASSIC,drums: 'four',       bass: 'roll',    lead: 'stab',  gain: .35 },
  ron_2:     { bpm: 118, root: 46.25, sc: SC.dorian,   prog: P_DESC,   drums: 'march',      bass: 'offbeat', lead: 'arp',   gain: .34 },
  john_1:    { bpm: 148, root: 51.91, sc: SC.phrygian, prog: P_TENSE,  drums: 'breaks',     bass: 'octave',  lead: 'siren', gain: .35 },
  recker_3:  { bpm: 92,  root: 38.89, sc: SC.aeolian4, prog: P_DESC,   drums: 'half',       bass: 'sustain', lead: 'hook',  gain: .36 },
  john_2:    { bpm: 104, root: 55.00, sc: SC.dorian,   prog: P_STATIC, drums: 'sparse',     bass: 'pump',    lead: 'pad',   air: .30, gain: .32 },
  ron_3:     { bpm: 124, root: 49.00, sc: SC.harmonic, prog: P_TENSE,  drums: 'industrial', bass: 'roll',    lead: 'arp',   gain: .34 },
  vance_1:   { bpm: 108, root: 46.25, sc: SC.phrygian, prog: P_CLASSIC,drums: 'four',       bass: 'pump',    lead: 'hook',  gain: .35 },
  recker_4:  { bpm: 84,  root: 36.71, sc: SC.harmonic, prog: P_STATIC, drums: 'half',       bass: 'drone',   lead: 'bell',  air: .50, gain: .32 },
  john_3:    { bpm: 116, root: 51.91, sc: SC.minor,    prog: P_CLASSIC,drums: 'four',       bass: 'offbeat', lead: 'stab',  gain: .34 },
  vance_2:   { bpm: 54,  root: 32.70, sc: SC.harmonic, prog: P_STATIC, drums: 'pulse',      bass: 'drone',   lead: 'none',  air: .70, gain: .32 },
  ron_4:     { bpm: 138, root: 49.00, sc: SC.wholeish, prog: P_TENSE,  drums: 'industrial', bass: 'roll',    lead: 'siren', gain: .35 },
  recker_5:  { bpm: 126, root: 41.20, sc: SC.phrygian, prog: P_DESC,   drums: 'four',       bass: 'octave',  lead: 'arp',   gain: .35 },
  john_4:    { bpm: 156, root: 58.27, sc: SC.dorian,   prog: P_LIFT,   drums: 'breaks',     bass: 'roll',    lead: 'hook',  gain: .36 },
  vance_3:   { bpm: 112, root: 43.65, sc: SC.aeolian4, prog: P_CLASSIC,drums: 'march',      bass: 'sustain', lead: 'hook',  gain: .35 },
  recker_6:  { bpm: 134, root: 43.65, sc: SC.dorian,   prog: P_LIFT,   drums: 'four',       bass: 'octave',  lead: 'hook',  gain: .37 },
  recker_7:  { bpm: 146, root: 41.20, sc: SC.phrygian, prog: P_TENSE,  drums: 'club',       bass: 'roll',    lead: 'siren', gain: .38 },
  ending_good:  { bpm: 88, root: 55.00, sc: SC.dorian,   prog: P_LIFT,   drums: 'sparse', bass: 'sustain', lead: 'bell', air: .35, gain: .32 },

  // ---- credits: slow, resolved, the only genuinely warm cue in the game --
  credits:      { bpm: 82,  root: 55.00, sc: SC.dorian,   prog: P_LIFT,   drums: 'sparse',     bass: 'sustain', lead: 'pad',   air: .30, gain: .34 },

  // ---- BONUS CAMPAIGN: colder, more clinical than the original ----------
  nora_1:   { bpm: 112, root: 51.91, sc: SC.dorian,   prog: P_STATIC, drums: 'sparse',     bass: 'pump',    lead: 'arp',   air: .25, gain: .32 },
  wren_1:   { bpm: 96,  root: 49.00, sc: SC.wholeish, prog: P_TENSE,  drums: 'pulse',      bass: 'drone',   lead: 'bell',  air: .45, gain: .30 },
  bajic_1:  { bpm: 128, root: 41.20, sc: SC.aeolian4, prog: P_CLASSIC,drums: 'four',       bass: 'roll',    lead: 'hook',  gain: .35 },
  nora_2:   { bpm: 120, root: 51.91, sc: SC.harmonic, prog: P_DESC,   drums: 'industrial', bass: 'offbeat', lead: 'stab',  gain: .34 },
  wren_2:   { bpm: 104, root: 49.00, sc: SC.phrygian, prog: P_TENSE,  drums: 'march',      bass: 'octave',  lead: 'siren', gain: .33 },
  bajic_2:  { bpm: 140, root: 38.89, sc: SC.penta,    prog: P_CLASSIC,drums: 'breaks',     bass: 'roll',    lead: 'hook',  gain: .36 },
  nora_3:   { bpm: 126, root: 55.00, sc: SC.wholeish, prog: P_TENSE,  drums: 'four',       bass: 'roll',    lead: 'arp',   gain: .34 },
  wren_3:   { bpm: 88,  root: 36.71, sc: SC.harmonic, prog: P_STATIC, drums: 'half',       bass: 'drone',   lead: 'bell',  air: .55, gain: .32 },
  bajic_3:  { bpm: 134, root: 41.20, sc: SC.aeolian4, prog: P_DESC,   drums: 'four',       bass: 'octave',  lead: 'hook',  gain: .36 },
  meridian: { bpm: 144, root: 51.91, sc: SC.dorian,   prog: P_LIFT,   drums: 'club',       bass: 'roll',    lead: 'siren', gain: .38 },
  ending_quiet: { bpm: 68, root: 36.71, sc: SC.harmonic, prog: P_STATIC, drums: 'none',   bass: 'drone',   lead: 'none', air: .60, gain: .28 },
};
const FALLBACK = { bpm: 124, root: 46.25, sc: SC.minor, prog: P_CLASSIC, drums: 'four', bass: 'offbeat', lead: 'arp', gain: .34 };

const HOOKS = [
  [0, 3, 7, 3, 10, 7, 3, 0], [0, 7, 5, 3, 5, 0, -2, 0],
  [12, 10, 7, 10, 5, 7, 3, 0], [0, 5, 7, 12, 10, 7, 5, 3],
];

function levelStep(s, t) {
  const b = s & 15, bar = s >> 4, bar8 = bar % 8;
  const sect = (bar >> 3) % 4;
  const i = intensity;
  const sc = cfg.sc, root = cfg.root;
  const rootSemi = (cfg.prog || P_STATIC)[bar8];
  const open = 0.30 + 0.70 * ((bar % 16) / 15);
  musicFilter.frequency.setTargetAtTime(700 + 13500 * open * i, t, 0.06);
  const triad = [0, 3, 7, 10].map(x => sc[Math.min(sc.length - 1, [0, 2, 4, 6][[0, 3, 7, 10].indexOf(x)])] ?? x);

  // ---- drums -------------------------------------------------------------
  switch (cfg.drums) {
    case 'club':
      if (b % 4 === 0) kick(t, 1.0 * i);
      if (b === 4 || b === 12) clap(t, 0.9 * i);
      if (b % 2 === 1) hat(t, b % 4 === 3, i);
      break;
    case 'four':
      if (b % 4 === 0) kick(t, 0.95 * i);
      if (b === 8) snare(t, 0.85 * i);
      if (b % 2 === 1) hat(t, false, 0.7 * i);
      if (b === 14 && bar % 2 === 1) hat(t, true, 0.8 * i);
      break;
    case 'breaks':
      if (b === 0 || b === 6 || b === 10) kick(t, 0.95 * i);
      if (b === 4 || b === 12) snare(t, 0.9 * i);
      if (b === 14 && bar % 4 === 3) { snare(t, 0.5 * i); rim(t + 0.05, 0.6 * i); }
      if (b % 2 === 1) hat(t, false, 0.55 * i);
      if (b === 7 || b === 15) hat(t, true, 0.6 * i);
      break;
    case 'half':
      if (b === 0) kick(t, 1.1 * i);
      if (b === 8) snare(t, 1.0 * i);
      if (b === 6) kick(t, 0.55 * i);
      if (b % 4 === 2) hat(t, false, 0.45 * i);
      break;
    case 'industrial':
      if (b % 4 === 0) kick(t, 0.9 * i);
      if (b === 4 || b === 12) { clank(t, 0.9 * i); lastSnareTime = t; }
      if (b === 10) clank(t, 0.4 * i);
      if (b % 2 === 1) hat(t, false, 0.4 * i);
      break;
    case 'march':
      if (b === 0 || b === 3 || b === 8 || b === 11) kick(t, 0.85 * i);
      if (b === 4 || b === 12) snare(t, 0.85 * i);
      if (b === 14) { rim(t, 0.7 * i); rim(t + 0.06, 0.5 * i); }
      break;
    case 'sparse':
      if (b === 0) kick(t, 0.8 * i);
      if (b === 8) { rim(t, 0.8 * i); lastSnareTime = t; }
      if (b === 6 || b === 14) hat(t, false, 0.35 * i);
      break;
    case 'pulse':
      if (b === 0 || b === 6) kick(t, 0.5 * i);      // heartbeat
      break;
    default: break;
  }

  // ---- bass ---------------------------------------------------------------
  const bf = nf(root, rootSemi);
  switch (cfg.bass) {
    case 'offbeat': if (b % 4 === 2) sub(t, bf, 0.16, i); break;
    case 'roll':    if (b % 2 === 0) sub(t, bf, 0.11, 0.85 * i);
                    if (b % 8 === 7) sub(t, bf * 2, 0.08, 0.5 * i); break;
    case 'octave':  sub(t, b % 4 < 2 ? bf : bf * 2, 0.10, 0.8 * i); break;
    case 'pump':    if (b % 4 === 0) sub(t, bf, 0.34, 0.9 * i); break;
    case 'sustain': if (b === 0) sub(t, bf, 1.05, 0.95 * i); break;
    case 'drone':   if (b === 0 && bar % 2 === 0) sub(t, bf, 2.4, 0.6 * i); break;
    default: break;
  }

  // ---- harmony + lead -----------------------------------------------------
  const ch = [0, 3, 7, 10].map(x => nf(root * 4, x + rootSemi));
  switch (cfg.lead) {
    case 'hook':
      if (sect >= 1) {
        const seq = HOOKS[(bar >> 3) % HOOKS.length];
        if (b % 2 === 0) {
          const n = seq[(b >> 1) % seq.length];
          saws(t, nf(root * 4, n + rootSemi), 0.20, 0.075 * i, 1200 + 3600 * open, 620, 8,
               { thin: sect < 2, rev: .25, dly: .35, pan: (b % 4 === 0 ? -.25 : .25) });
        }
      }
      if (sect >= 2 && (b === 6 || b === 14))
        chord(t, ch, 0.28, 0.09 * i, 900 + 2600 * open, 560, { rev: .3, dly: .15, q: 6 });
      break;
    case 'arp':
      if (sect >= 1) {
        const n = sc[(s * 2 + bar) % sc.length];
        saws(t, nf(root * 4, n + rootSemi), 0.09, 0.05 * i, 2200, 900, 10, { thin: true, dly: .5, rev: .2 });
      }
      if (sect >= 2 && b === 0) pad(t, ch, (60 / bpm) * 4, 0.035 * i);
      break;
    case 'stab':
      if (sect >= 1 && (b === 6 || b === 14))
        chord(t, ch, 0.26, 0.13 * i, 900 + 2600 * open, 600, { rev: .3, dly: .2, q: 8 });
      break;
    case 'pad':
      if (b === 0 && bar % 2 === 0) pad(t, ch.map(f => f / 2), (60 / bpm) * 8, 0.06 * i);
      break;
    case 'bell':
      if (b === 0 && bar % 4 === 0) bell(t, nf(root * 8, sc[(bar >> 2) % sc.length] + rootSemi), 0.12 * i);
      if (b === 8 && bar % 4 === 2) bell(t, nf(root * 8, sc[2] + rootSemi), 0.085 * i);
      break;
    case 'siren':
      if (b === 0 && bar % 4 === 3) siren(t, nf(root * 4, rootSemi), nf(root * 4, rootSemi + 7), (60 / bpm) * 2, 0.07 * i);
      if (sect >= 2 && (b === 6 || b === 14))
        chord(t, ch, 0.24, 0.10 * i, 1400, 700, { rev: .3, dly: .3, q: 9 });
      break;
    default: break;
  }
  if (cfg.air && b === 0 && bar % 4 === 0) airSweep(t, (60 / bpm) * 6, 0.03 * cfg.air * i);
  if (b === 0) lastBarTime = t;
}

// ---------------------------------------------------------------------------
function scheduler() {
  if (!ctx || !running) return;
  // A device switch or a long stall can suspend the context; bring it back.
  if (ctx.state === 'suspended') { ctx.resume().catch(function () {}); }

  const spb = 60 / bpm / 4;

  // If we fell behind, jump forward to the next whole step instead of trying
  // to catch up by firing every missed note at once.
  if (nextStepTime < ctx.currentTime) {
    const missed = Math.ceil((ctx.currentTime - nextStepTime) / spb);
    nextStepTime += missed * spb;
    stepIdx += missed;
  }

  let guard = 0;
  while (nextStepTime < ctx.currentTime + LOOKAHEAD && guard++ < 64) {
    const t = Math.max(nextStepTime, ctx.currentTime + 0.005);
    try { if (cfg.club) clubStep(stepIdx, t); else levelStep(stepIdx, t); }
    catch (e) { console.warn('music step failed', e); }
    pulses.step = stepIdx; pulses.beat = stepIdx >> 2;
    stepIdx++;
    nextStepTime += spb;
  }
  seqTimer = setTimeout(scheduler, TICK);
}

export function startMusic(track, tempoOverride) {
  if (!ctx) return;
  stopMusic();
  cfg = TRACKS[track] || FALLBACK;
  trackName = track;
  bpm = tempoOverride || cfg.bpm || 124;
  if (musicGain) musicGain.gain.value = cfg.gain ?? 0.34;
  setDelayTime((60 / bpm) * 0.75);        // dotted eighth -- the classic setting
  intensity = 1;
  stepIdx = 0;
  nextStepTime = ctx.currentTime + 0.10;
  running = true;
  scheduler();
}
export function setMusicIntensity(v) { intensity = clampf(v, 0, 1.4); }
export function currentTrack() { return running ? trackName : null; }

// Live snapshot of the audio graph -- used to diagnose "I hear nothing".
export function audioDebug() {
  if (!ctx) return { ctx: 'NOT CREATED' };
  return {
    ctxState: ctx.state,
    currentTime: +ctx.currentTime.toFixed(2),
    running, trackName, bpm,
    stepIdx,
    master: +master.gain.value.toFixed(3),
    duck: +duckGain.gain.value.toFixed(3),
    sfx: +sfxGain.gain.value.toFixed(3),
    musicGain: +musicGain.gain.value.toFixed(3),
    sidechain: +sidechain.gain.value.toFixed(3),
    filterHz: Math.round(musicFilter.frequency.value),
    liveNodes: liveNodes,
    warp: +warp.toFixed(3),
  };
}
export function stopMusic() {
  running = false;
  trackName = null;
  if (seqTimer) clearTimeout(seqTimer);
  seqTimer = null;
  if (musicFilter) musicFilter.frequency.value = 20000;
  if (sidechain) { sidechain.gain.cancelScheduledValues(ctx ? ctx.currentTime : 0); sidechain.gain.value = 1; }
}
