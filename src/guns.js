// ============================================================================
// Weapon system. 800+ real firearms, stats derived from cartridge + class,
// with hand-tuned overrides for the iconic ones.
// ============================================================================
import { AR, SMG, PISTOL, SHOTGUN, SNIPER, LMG } from './guns_data.js';

// --- cartridge table: dmg, muzzle velocity (u/s), recoil kick, penetration ---
const CAL = [
  [/2\.7mm Kolibri/i,          { d: 3,   v: 90,  r: 0.2, p: 0 }],
  [/\.22 (LR|WMR)|\.22 Win/i,  { d: 8,   v: 110, r: 0.5, p: 0 }],
  [/5\.45x18mm|\.25 ACP/i,     { d: 10,  v: 110, r: 0.6, p: 0 }],
  [/\.32 ACP|7\.65x20|7\.65mm/i,{ d: 13, v: 115, r: 0.8, p: 0 }],
  [/\.380 ACP|9x17/i,          { d: 15,  v: 115, r: 1.0, p: 0 }],
  [/\.38 S&W|\.38 Special/i,   { d: 19,  v: 110, r: 1.4, p: 0 }],
  [/9x18mm Makarov/i,          { d: 17,  v: 118, r: 1.1, p: 0 }],
  [/9mm Glisenti|9x21|9x23/i,  { d: 20,  v: 125, r: 1.3, p: 1 }],
  [/9x19mm|9mm Largo|9mm Para/i,{ d: 20, v: 125, r: 1.2, p: 1 }],
  [/4\.6x30mm/i,               { d: 17,  v: 150, r: 0.8, p: 2 }],
  [/5\.7x28mm/i,               { d: 18,  v: 155, r: 0.8, p: 2 }],
  [/5\.56x30mm|5\.8x21mm/i,    { d: 21,  v: 145, r: 1.1, p: 2 }],
  [/6x35mm|\.221 Fireball/i,   { d: 22,  v: 150, r: 1.1, p: 2 }],
  [/7\.62x25mm Tokarev/i,      { d: 22,  v: 145, r: 1.3, p: 2 }],
  [/7\.63x25mm Mauser/i,       { d: 22,  v: 145, r: 1.3, p: 2 }],
  [/7\.65x25mm Borchardt/i,    { d: 21,  v: 140, r: 1.3, p: 2 }],
  [/8x22mm Nambu|9x20/i,       { d: 18,  v: 118, r: 1.1, p: 0 }],
  [/\.45 ACP/i,                { d: 28,  v: 100, r: 1.9, p: 1 }],
  [/10mm Auto|\.40 S&W|\.357 SIG/i,{ d: 26,v: 122, r: 1.8, p: 1 }],
  [/\.455 Webley|\.45 Colt/i,  { d: 30,  v: 95,  r: 2.1, p: 1 }],
  [/\.357 Magnum|7\.62x38mmR/i,{ d: 34,  v: 135, r: 2.4, p: 2 }],
  [/\.41 Rem|\.44 Magnum|\.45 Win/i,{d: 45,v: 130, r: 3.4, p: 2 }],
  [/\.50 Action Express|\.500 S&W/i,{d: 62,v:125,r: 4.6, p: 3 }],
  [/\.30 Carbine/i,            { d: 26,  v: 150, r: 1.5, p: 2 }],
  [/5\.45x39mm/i,              { d: 26,  v: 185, r: 1.4, p: 3 }],
  [/5\.56x45mm|\.223 Rem/i,    { d: 28,  v: 190, r: 1.6, p: 3 }],
  [/5\.8x42mm/i,               { d: 29,  v: 188, r: 1.6, p: 3 }],
  [/5\.66x39mm/i,              { d: 24,  v: 120, r: 1.5, p: 2 }],
  [/6\.5mm Creedmoor|6\.5x5[05]|6\.5x52|6\.5x51/i,{d:40,v:190,r:2.4,p:4}],
  [/6\.8mm|6\.8x51/i,          { d: 37,  v: 190, r: 2.2, p: 4 }],
  [/6\.45x48mm|7x43mm|\.280 British/i,{d:33,v:185,r:1.9,p:3}],
  [/7\.62x39mm|7\.92x33mm|7\.62x41mm/i,{d:34,v:165,r:2.1,p:3}],
  [/9x39mm/i,                  { d: 42,  v: 118, r: 2.0, p: 4 }],
  [/\.300 AAC/i,               { d: 38,  v: 130, r: 2.0, p: 4 }],
  [/\.345 Winchester/i,        { d: 34,  v: 150, r: 2.2, p: 3 }],
  [/7\.62x51mm|\.308 Win|\.30-06|7\.5x54|7\.92x57|\.303 Brit|7\.7x58|8x5[089]|7x57|7\.65x53|7\.62x53|6x45|\.338 Federal/i,
                               { d: 48,  v: 195, r: 2.9, p: 5 }],
  [/7\.62x54mmR|7\.62x54/i,    { d: 50,  v: 195, r: 3.0, p: 5 }],
  [/\.300 Win|7mm Rem|\.30-40|9\.3x64/i,{d:62,v:210,r:3.6,p:6}],
  [/\.338 (Lapua|Norma)|8\.58x71|\.375 Ruger/i,{d:80,v:225,r:4.4,p:7}],
  [/\.408 CheyTac|\.375 CheyTac|\.416 Barrett|\.375 EnABELR|408 LW|338LW/i,
                               { d: 95,  v: 235, r: 5.0, p: 8 }],
  [/\.50 BMG|12\.7x10[08]|12\.7x11|12\.7x81|12\.7x55|13\.2x99/i,{d:120,v:250,r:6.0,p:9}],
  [/14\.5x114|15\.5x115|15\.2x169/i,{d:150,v:260,r:7.0,p:10}],
  [/20x|23x|25x|37x|40mm|57x/i,{ d: 200, v: 200, r: 8.0, p: 10 }],
  [/12 gauge|12 ga/i,          { d: 13,  v: 105, r: 3.2, p: 1 }],  // per pellet
  [/10 gauge|2 gauge/i,        { d: 16,  v: 100, r: 4.0, p: 1 }],
  [/16 (gauge|bore)|20 gauge/i,{ d: 11,  v: 105, r: 2.6, p: 1 }],
  [/28 gauge|\.410 bore|9mm Flobert/i,{d: 8,  v: 105, r: 1.8, p: 0 }],
  [/23x75mmR|26 mm/i,          { d: 30,  v: 95,  r: 4.5, p: 2 }],
  [/18\.5mm/i,                 { d: 15,  v: 100, r: 3.4, p: 1 }],
  [/flechette/i,               { d: 20,  v: 220, r: 1.2, p: 4 }],
];

function calStats(cart) {
  for (const [re, s] of CAL) if (re.test(cart)) return s;
  return { d: 25, v: 150, r: 1.8, p: 2 };
}

// --- class archetypes -------------------------------------------------------
// rpm, mag, spread(deg), reload(s), auto, pellets, bulk (movement penalty)
const CLASS = {
  pistol:  { rpm: 320,  mag: 12, spread: 1.6, reload: 1.35, auto: false, pellets: 1, bulk: 0.00, dmgMul: 1.00 },
  smg:     { rpm: 800,  mag: 30, spread: 3.2, reload: 1.70, auto: true,  pellets: 1, bulk: 0.05, dmgMul: 0.95 },
  ar:      { rpm: 640,  mag: 30, spread: 2.0, reload: 2.10, auto: true,  pellets: 1, bulk: 0.10, dmgMul: 1.00 },
  shotgun: { rpm: 85,   mag: 6,  spread: 8.0, reload: 2.60, auto: false, pellets: 8, bulk: 0.13, dmgMul: 1.00 },
  sniper:  { rpm: 48,   mag: 5,  spread: 0.2, reload: 2.90, auto: false, pellets: 1, bulk: 0.22, dmgMul: 1.00 },
  lmg:     { rpm: 720,  mag: 100,spread: 4.0, reload: 4.40, auto: true,  pellets: 1, bulk: 0.28, dmgMul: 0.92 },
};

// --- per-gun overrides for guns people have opinions about ------------------
const OVERRIDE = {
  'AK-47':                 { rpm: 600, mag: 30 },
  'AKS-74U':               { rpm: 735, mag: 30, spread: 3.4 },
  'AN-94':                 { rpm: 1800, mag: 30, burst: 2 },
  'AS Val':                { rpm: 900, mag: 20, silenced: true },
  'VSS Vintorez':          { rpm: 700, mag: 10, silenced: true, spread: 0.6 },
  'M4 Carbine':            { rpm: 750, mag: 30 },
  'M16A2':                 { rpm: 800, mag: 30, burst: 3, auto: false },
  'M16A4':                 { rpm: 800, mag: 30, burst: 3, auto: false },
  'FAMAS':                 { rpm: 1000, mag: 25 },
  'Steyr AUG':             { rpm: 680, mag: 30 },
  'FN P90':                { rpm: 900, mag: 50 },
  'Heckler & Koch MP5':    { rpm: 800, mag: 30 },
  'Heckler & Koch MP5K':   { rpm: 900, mag: 30, spread: 4.2 },
  'Heckler & Koch MP5SD':  { rpm: 800, mag: 30, silenced: true },
  'Heckler & Koch MP7':    { rpm: 950, mag: 40 },
  'Uzi':                   { rpm: 600, mag: 32 },
  'Micro Uzi':             { rpm: 1250, mag: 20, spread: 5.5 },
  'MAC-10':                { rpm: 1100, mag: 30, spread: 6.0 },
  'MAC-11':                { rpm: 1200, mag: 32, spread: 6.4 },
  'Sa vz. 61 Skorpion':    { rpm: 850, mag: 20 },
  'PPSh-41':               { rpm: 900, mag: 71 },
  'Thompson M1928':        { rpm: 700, mag: 50 },
  'KRISS Vector':          { rpm: 1200, mag: 25, spread: 2.2 },
  'Glock 18':              { rpm: 1200, mag: 33, auto: true },
  'Beretta 93R':           { rpm: 1100, mag: 20, burst: 3, auto: false },
  'Colt M1911':            { mag: 7 },
  'Desert Eagle':          { mag: 7, rpm: 240 },
  'Desert Eagle .44':      { mag: 8, rpm: 250 },
  'Colt Python':           { mag: 6, rpm: 200, reload: 2.6 },
  'Smith & Wesson Model 29':{ mag: 6, rpm: 190, reload: 2.7 },
  'Smith & Wesson Model 500':{ mag: 5, rpm: 150, reload: 3.0 },
  'Nagant M1895':          { mag: 7, rpm: 150, reload: 4.2 },
  'Franchi SPAS-12':       { mag: 8, rpm: 120 },
  'Remington Model 870':   { mag: 7, rpm: 80 },
  'Mossberg 500':          { mag: 6, rpm: 82 },
  'Saiga-12':              { mag: 8, rpm: 300, auto: false },
  'Daewoo USAS-12':        { mag: 20, rpm: 360, auto: true, bulk: 0.24 },
  'Pancor Jackhammer':     { mag: 10, rpm: 240, auto: true },
  'Atchisson Assault Shotgun': { mag: 20, rpm: 300, auto: true },
  'Kel-Tec KSG':           { mag: 14, rpm: 90 },
  'Serbu Super-Shorty':    { mag: 3, rpm: 100, spread: 13, bulk: 0.02 },
  'Armsel Striker':        { mag: 12, rpm: 180, reload: 5.5 },
  'Streetsweeper':         { mag: 12, rpm: 180, reload: 5.5 },
  'Coach Gun':             { mag: 2, rpm: 200, reload: 2.2, spread: 10 },
  'Barrett M82':           { mag: 10, rpm: 60 },
  'M82A1':                 { mag: 10, rpm: 60 },
  'Dragunov SVD':          { mag: 10, rpm: 120 },
  'Heckler & Koch PSG1':   { mag: 20, rpm: 150 },
  'M110 SASS':             { mag: 20, rpm: 140 },
  'Walther WA 2000':       { mag: 6, rpm: 130 },
  'M134 Minigun':          { rpm: 3000, mag: 400, spread: 5.0, bulk: 0.55, reload: 8 },
  'M249 SAW':              { rpm: 800, mag: 200 },
  'M60':                   { rpm: 550, mag: 100 },
  'MG 42':                 { rpm: 1200, mag: 250 },
  'MG3':                   { rpm: 1100, mag: 250 },
  'PK Machine Gun':        { rpm: 700, mag: 100 },
  'RPK':                   { rpm: 600, mag: 75, bulk: 0.16 },
  'Browning M2':           { rpm: 550, mag: 100, bulk: 0.5 },
  'Gatling Gun':           { rpm: 400, mag: 200, bulk: 0.5 },
  'Maxim Gun':             { rpm: 600, mag: 250, bulk: 0.5 },
  'Punt Gun':              { mag: 1, rpm: 20, pellets: 40, reload: 6, bulk: 0.6 },
  'Kolibri':               { mag: 6, rpm: 250 },
};

// silenced-by-name heuristic
const SILENT = /SD$|Vintorez|Val\b|Vychlop|VSSK|Welrod|De Lisle/i;

function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-'); }

function build(line, cls) {
  const [name, cart, country, year] = line.split('|');
  const c = calStats(cart);
  const a = CLASS[cls];
  const o = OVERRIDE[name] || {};
  const rpm = o.rpm ?? a.rpm;
  const pellets = o.pellets ?? a.pellets;
  // shotguns carry damage across pellets; scale so a full hit is meaningful
  let dmg = c.d * (o.dmgMul ?? a.dmgMul);
  if (cls === 'sniper') dmg *= 1.15;
  // long guns get a barrel-length velocity bonus
  const vel = c.v * (cls === 'pistol' ? 1 : cls === 'smg' ? 1.05 : 1.18);
  return {
    id: slug(name), name, cart, country, year: +year || 0, cls,
    dmg: Math.round(dmg),
    rpm,
    rof: 60 / rpm,                       // seconds between shots
    mag: o.mag ?? a.mag,
    spread: o.spread ?? a.spread,
    reload: o.reload ?? a.reload,
    auto: o.auto ?? a.auto,
    burst: o.burst ?? 0,
    pellets,
    vel,
    recoil: c.r,
    pen: c.p,
    bulk: o.bulk ?? a.bulk,
    silenced: o.silenced ?? SILENT.test(name),
    // How far the report carries, in world units. This is the invisible
    // circle the AI listens on: inside it they investigate, outside it they
    // never know you were there.
    loudness: Math.round(
      ({ pistol: 42, smg: 46, ar: 62, shotgun: 68, sniper: 88, lmg: 72 }[cls] || 50)
      * (0.85 + c.d / 160)
      * ((o.silenced ?? SILENT.test(name)) ? 0.20 : 1)
    ),
  };
}

function parse(block, cls) {
  return block.trim().split('\n').filter(l => l.includes('|')).map(l => build(l.trim(), cls));
}

export const ARSENAL = [
  ...parse(PISTOL,  'pistol'),
  ...parse(SMG,     'smg'),
  ...parse(AR,      'ar'),
  ...parse(SHOTGUN, 'shotgun'),
  ...parse(SNIPER,  'sniper'),
  ...parse(LMG,     'lmg'),
];

// revolvers & derringers got filed under pistols in the source list; retag them
for (const g of ARSENAL) {
  if (/Python|Redhawk|GP100|Model (10|29|500|686)|Judge|Nagant|Webley Mk|Enfield No\. 2|Rhino|MR73|Single Action Army|Derringer/.test(g.name)) {
    g.revolver = true;
    g.reload = Math.max(g.reload, 2.4);
  }
}

export const BY_ID = Object.fromEntries(ARSENAL.map(g => [g.id, g]));
export const BY_CLASS = {};
for (const g of ARSENAL) (BY_CLASS[g.cls] ||= []).push(g);

export function gun(id) { return BY_ID[id] || ARSENAL[0]; }

// weighted random pick used for enemy loadouts and floor loot
export function randomGun(rng, classes, tierMax = 99) {
  const pool = [];
  for (const c of classes) for (const g of BY_CLASS[c] || []) if (g.dmg <= tierMax) pool.push(g);
  return pool[Math.floor(rng() * pool.length)] || ARSENAL[0];
}

export const CLASS_LABEL = {
  pistol: 'SIDEARM', smg: 'SUBMACHINE GUN', ar: 'RIFLE',
  shotgun: 'SHOTGUN', sniper: 'PRECISION', lmg: 'MACHINE GUN',
};
