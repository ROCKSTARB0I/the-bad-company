// ============================================================================
// All DOM overlay: HUD, weapon wheel, Hotline-Miami dialogue, menus, endings.
// ============================================================================
import { CHARS, LEVELS, BONUS_LEVELS, ALL_LEVELS, levelUnlocked, bonusUnlocked, taskFor } from './story.js';
import { CLASS_LABEL, ARSENAL } from './guns.js';
import * as A from './audio.js';

const el = (tag, cls, parent, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
};

export class UI {
  constructor(root, game) {
    this.game = game;
    this.root = root;

    // ---- HUD -------------------------------------------------------------
    this.hud = el('div', 'hud', root);
    this.crosshair = el('div', 'crosshair', this.hud);
    el('div', 'ch-dot', this.crosshair);
    for (const d of ['n', 's', 'e', 'w']) el('div', 'ch-line ch-' + d, this.crosshair);

    this.topLeft = el('div', 'top-left', this.hud);
    this.objLine = el('div', 'obj', this.topLeft);
    this.taskLine = el('div', 'task', this.topLeft);
    this.countLine = el('div', 'count', this.topLeft);

    this.corner = el('div', 'corner', this.hud);
    this.hpWrap = el('div', 'hp-wrap', this.corner);
    this.hpBar = el('div', 'hp-bar', this.hpWrap);
    this.hpNum = el('div', 'hp-num', this.hpWrap);
    this.gunLine = el('div', 'gun-line', this.corner);
    this.ammoLine = el('div', 'ammo', this.corner);
    this.reloadWrap = el('div', 'reload-wrap', this.corner);
    this.reloadBar = el('div', 'reload-bar', this.reloadWrap);

    this.diveWrap = el('div', 'dive-wrap', this.hud);
    this.diveBar = el('div', 'dive-bar', this.diveWrap);
    el('div', 'dive-label', this.diveWrap, 'G — DIVE');

    // objective waypoint: an arrow pinned to the screen edge plus a distance
    this.way = el('div', 'waypoint hidden', this.hud);
    this.wayArrow = el('div', 'way-arrow', this.way);
    this.wayText = el('div', 'way-text', this.way);
    this.tut = el('div', 'tutorial hidden', this.hud);

    this.hitFlash = el('div', 'hit-flash', root);
    this.slowmoVig = el('div', 'slowmo-vig', root);
    this.killFeed = el('div', 'kill-feed', this.hud);

    // ---- weapon wheel ----------------------------------------------------
    this.wheel = el('div', 'wheel hidden', root);
    this.wheelInner = el('div', 'wheel-inner', this.wheel);
    this.wheelName = el('div', 'wheel-name', this.wheel);
    this.wheelStats = el('div', 'wheel-stats', this.wheel);

    // ---- dialogue --------------------------------------------------------
    this.dlg = el('div', 'dialogue hidden', root);
    this.dlgWho = el('div', 'dlg-who', this.dlg);
    this.dlgText = el('div', 'dlg-text', this.dlg);
    this.dlgHint = el('div', 'dlg-hint', this.dlg, 'SPACE / CLICK  ▸');
    this.dlgProg = el('div', 'dlg-prog', this.dlg);

    // ---- level card ------------------------------------------------------
    this.card = el('div', 'card hidden', root);
    this.cardChar = el('div', 'card-char', this.card);
    this.cardTitle = el('div', 'card-title', this.card);
    this.cardSub = el('div', 'card-sub', this.card);
    this.cardObj = el('div', 'card-obj', this.card);

    // ---- big centered screens -------------------------------------------
    this.screen = el('div', 'screen hidden', root);

    // ---- choice prompt ---------------------------------------------------
    this.choice = el('div', 'choice hidden', root);

    this.hud.style.display = 'none';
    this._feed = [];
  }

  setHudVisible(v) { this.hud.style.display = v ? '' : 'none'; }
  setCrosshair(v) { this.crosshair.style.display = v ? 'block' : 'none'; }

  // -------------------------------------------------------------------------
  updateHud(p, level, remaining, total) {
    if (!p) return;
    const pct = Math.max(0, p.hp / p.maxHp);
    this.hpBar.style.width = (pct * 100) + '%';
    this.hpBar.style.background = pct > 0.55 ? '#4be08a' : pct > 0.28 ? '#ffc453' : '#ff3b45';
    this.hpNum.textContent = Math.max(0, Math.ceil(p.hp));

    const s = p.cur;
    if (s) {
      this.gunLine.innerHTML = `<span class="gcls">${CLASS_LABEL[s.gun.cls]}</span> ${s.gun.name}`;
      this.ammoLine.innerHTML =
        `<span class="mag ${s.mag === 0 ? 'empty' : s.mag <= s.gun.mag * 0.25 ? 'low' : ''}">${s.mag}</span>` +
        `<span class="slash">/</span><span class="res">${s.reserve}</span>`;
    }
    if (p.reloadT > 0) {
      this.reloadWrap.style.opacity = '1';
      this.reloadBar.style.width = (100 * (1 - p.reloadT / (p.reloadTotal || 1))) + '%';
    } else this.reloadWrap.style.opacity = '0';

    const dv = p.diveCd > 0 ? 1 - p.diveCd / 2.4 : 1;
    this.diveBar.style.width = (dv * 100) + '%';
    this.diveWrap.classList.toggle('ready', dv >= 1);

    this.objLine.textContent = level.objective || '';
    this.taskLine.textContent = taskFor(level);
    this.countLine.textContent = total > 0 ? `HOSTILES  ${remaining} / ${total}` : '';
  }

  // px/py are screen coords of the objective; onScreen says whether it is in view
  showWaypoint(px, py, onScreen, distance, label) {
    this.way.classList.remove('hidden');
    const w = window.innerWidth, h = window.innerHeight;
    const cx = w / 2, cy = h / 2;
    let x = px, y = py;
    if (!onScreen) {
      // clamp the marker to a margin inside the screen edge, along the bearing
      const dx = px - cx, dy = py - cy;
      const mx = w / 2 - 90, my = h / 2 - 90;
      const s2 = Math.min(mx / Math.max(1, Math.abs(dx)), my / Math.max(1, Math.abs(dy)));
      x = cx + dx * s2; y = cy + dy * s2;
    }
    x = Math.max(60, Math.min(w - 60, x));
    y = Math.max(60, Math.min(h - 90, y));
    this.way.style.left = x + 'px';
    this.way.style.top = y + 'px';
    this.wayArrow.style.transform = `rotate(${Math.atan2(py - cy, px - cx) + Math.PI / 2}rad)`;
    this.wayArrow.style.opacity = onScreen ? '0.35' : '1';
    this.wayText.textContent = `${label} · ${Math.round(distance)}m`;
  }
  hideWaypoint() { this.way.classList.add('hidden'); }

  showTutorial(html) {
    if (this._tutHtml === html) return;
    this._tutHtml = html;
    this.tut.innerHTML = html;
    this.tut.classList.remove('hidden');
  }
  hideTutorial() { this._tutHtml = null; this.tut.classList.add('hidden'); }

  flashHit(amount = 1) {
    this.hitFlash.style.opacity = String(Math.min(0.72, amount));
    clearTimeout(this._hf);
    this._hf = setTimeout(() => { this.hitFlash.style.opacity = '0'; }, 90);
  }
  setSlowmo(v) { this.slowmoVig.style.opacity = String(v * 0.85); }

  feed(text, color) {
    const e = el('div', 'feed-item', this.killFeed, text);
    if (color) e.style.color = color;
    setTimeout(() => { e.style.opacity = '0'; e.style.transform = 'translateX(18px)'; }, 1700);
    setTimeout(() => e.remove(), 2400);
  }

  // ---- weapon wheel -------------------------------------------------------
  showWheel(p, hoverIdx) {
    this.wheel.classList.remove('hidden');
    this.wheelInner.innerHTML = '';
    const n = p.slots.length;
    const R = 170;
    p.slots.forEach((s, i) => {
      const a = (-Math.PI / 2) + (i / Math.max(1, n)) * Math.PI * 2;
      const item = el('div', 'wheel-item' + (i === hoverIdx ? ' hot' : '') + (i === p.slot ? ' cur' : ''), this.wheelInner);
      item.style.left = `calc(50% + ${Math.cos(a) * R}px)`;
      item.style.top = `calc(50% + ${Math.sin(a) * R}px)`;
      item.innerHTML =
        `<div class="wi-cls">${CLASS_LABEL[s.gun.cls]}</div>` +
        `<div class="wi-name">${s.gun.name}</div>` +
        `<div class="wi-ammo">${s.mag} / ${s.reserve}</div>`;
    });
    const h = p.slots[hoverIdx] || p.cur;
    if (h) {
      const g = h.gun;
      this.wheelName.innerHTML = `${g.name}`;
      this.wheelStats.innerHTML =
        `<span>${g.cart}</span><span>${g.country}${g.year ? ' · ' + g.year : ''}</span>` +
        `<span>DMG ${g.dmg}${g.pellets > 1 ? ' ×' + g.pellets : ''}</span>` +
        `<span>${g.rpm} RPM</span><span>MAG ${g.mag}</span>` +
        `<span>${g.auto ? 'AUTO' : g.burst ? g.burst + '-RND BURST' : 'SEMI'}</span>` +
        (g.silenced ? '<span class="sil">SUPPRESSED</span>' : '');
    }
  }
  hideWheel() { this.wheel.classList.add('hidden'); }

  // ---- dialogue -----------------------------------------------------------
  // returns a promise that resolves when the player has clicked through
  playDialogue(lines, charColor, onAdvanceReady) {
    return new Promise(resolve => {
      let i = 0, typed = 0, timer = null, full = '', done = false;
      this.dlg.classList.remove('hidden');
      const show = () => {
        if (i >= lines.length) { this.dlg.classList.add('hidden'); cleanup(); resolve(); return; }
        const L = lines[i];
        full = L.text;
        typed = 0; done = false;
        this.dlgProg.textContent = `${i + 1} / ${lines.length}   —   ESC TO SKIP`;
        this.dlgWho.textContent = L.who || '';
        this.dlgWho.style.color = L.c || charColor || '#fff';
        this.dlgWho.style.display = L.who ? '' : 'none';
        this.dlgText.style.color = L.who ? '#f2f2f2' : (L.c || '#9aa0a8');
        this.dlgText.textContent = '';
        clearInterval(timer);
        timer = setInterval(() => {
          typed++;
          this.dlgText.textContent = full.slice(0, typed);
          if (typed % 2 === 0) A.sfxBlip();
          if (typed >= full.length) { clearInterval(timer); done = true; }
        }, 21);
      };
      const advance = () => {
        if (!done) { clearInterval(timer); this.dlgText.textContent = full; done = true; return; }
        i++; show();
      };
      const key = e => {
        if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') { e.preventDefault(); A.sfxUI(); advance(); }
        else if (e.code === 'Escape') { clearInterval(timer); this.dlg.classList.add('hidden'); cleanup(); resolve(); }
      };
      const click = () => { A.sfxUI(); advance(); };
      const cleanup = () => {
        clearInterval(timer);
        window.removeEventListener('keydown', key);
        this.dlg.removeEventListener('mousedown', click);
      };
      window.addEventListener('keydown', key);
      this.dlg.addEventListener('mousedown', click);
      show();
    });
  }

  // ---- level intro card ---------------------------------------------------
  showCard(level, char) {
    this.card.classList.remove('hidden');
    this.card.style.setProperty('--c', char.color);
    this.cardChar.textContent = char.name;
    this.cardTitle.textContent = level.title;
    this.cardSub.textContent = level.sub;
    this.cardObj.innerHTML = `${level.objective}<span class="card-task">${taskFor(level)}</span>`;
    return new Promise(r => setTimeout(() => { this.card.classList.add('hidden'); r(); }, 2100));
  }

  // ---- credits roll -------------------------------------------------------
  playCredits(roles, names, tail) {
    return new Promise(resolve => {
      const wrap = el('div', 'credits', this.root);
      const roll = el('div', 'credits-roll', wrap);
      el('div', 'cr-title', roll, 'THE BAD COMPANY');
      for (const role of roles) {
        const blk = el('div', 'cr-block', roll);
        el('div', 'cr-role', blk, role);
        for (const n of names) el('div', 'cr-name', blk, n);
      }
      for (const t of tail) {
        const blk = el('div', 'cr-block', roll);
        el('div', 'cr-role', blk, t.role);
        el('div', 'cr-body', blk, t.body);
      }
      const endBlk = el('div', 'cr-block cr-end', roll);
      el('div', 'cr-name', endBlk, 'THANK YOU FOR PLAYING');
      el('div', 'cr-hint', wrap, 'SPACE / CLICK TO SKIP');

      // scroll speed scales with content so the roll always takes ~48s
      const h = roll.scrollHeight + window.innerHeight;
      const dur = Math.max(28, Math.min(70, h / 62));
      roll.style.animation = `creditscroll ${dur}s linear forwards`;

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        window.removeEventListener('keydown', key);
        wrap.removeEventListener('mousedown', click);
        wrap.remove();
        resolve();
      };
      const key = e => { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') { e.preventDefault(); A.sfxUI(); finish(); } };
      const click = () => { A.sfxUI(); finish(); };
      window.addEventListener('keydown', key);
      wrap.addEventListener('mousedown', click);
      roll.addEventListener('animationend', finish);
      this._creditTimer = setTimeout(finish, (dur + 2) * 1000);
    });
  }

  // ---- generic full screen ------------------------------------------------
  showScreen(html, opts = {}) {
    this.screen.className = 'screen ' + (opts.cls || '');
    this.screen.innerHTML = html;
    this.screen.classList.remove('hidden');
    return this.screen;
  }
  hideScreen() { this.screen.classList.add('hidden'); this.screen.innerHTML = ''; }

  // ---- binary choice (Ron's email, Recker's last decision) ----------------
  askChoice(prompt, left, right, colorL = '#ff3b45', colorR = '#4be08a') {
    return new Promise(resolve => {
      this.choice.classList.remove('hidden');
      this.choice.innerHTML =
        `<div class="ch-prompt">${prompt}</div>
         <div class="ch-opts">
           <div class="ch-opt l"><kbd>${left.key}</kbd><span>${left.label}</span></div>
           <div class="ch-opt r"><kbd>${right.key}</kbd><span>${right.label}</span></div>
         </div>`;
      this.choice.querySelector('.ch-opt.l').style.setProperty('--c', colorL);
      this.choice.querySelector('.ch-opt.r').style.setProperty('--c', colorR);
      const pick = id => {
        A.sfxUI();
        window.removeEventListener('keydown', key);
        this.choice.classList.add('hidden');
        resolve(id);
      };
      const key = e => {
        const k = e.code.replace('Key', '');
        if (k === left.key) pick(left.id);
        else if (k === right.key) pick(right.id);
      };
      window.addEventListener('keydown', key);
      this.choice.querySelector('.ch-opt.l').onclick = () => pick(left.id);
      this.choice.querySelector('.ch-opt.r').onclick = () => pick(right.id);
    });
  }
}

// ---------------------------------------------------------------------------
// Menu markup helpers
// ---------------------------------------------------------------------------
export function mainMenuHTML(save) {
  const anyProgress = Object.keys(save.done).length > 0;
  return `
  <div class="menu">
    <div class="title-wrap">
      <div class="title-sub">A TOP-DOWN SHOOTER IN FOUR PEOPLE</div>
      <h1 class="title">THE<br><span>BAD COMPANY</span></h1>
      <div class="title-rule"></div>
    </div>
    <div class="menu-btns">
      <button data-act="play">${anyProgress ? 'CONTINUE' : 'NEW GAME'}</button>
      <button data-act="select">MISSION SELECT <span class="cnt">${bonusUnlocked(save) ? '29 MISSIONS · BONUS UNLOCKED' : 'ALL 19 OPEN'}</span></button>
      <button data-act="arsenal">ARSENAL <span class="cnt">${ARSENAL.length} WEAPONS</span></button>
      <button data-act="music">SOUNDTRACK <span class="cnt">EVERY TRACK IN THE GAME</span></button>
      <button data-act="controls">CONTROLS</button>
      ${anyProgress ? '<button data-act="wipe" class="danger">ERASE PROGRESS</button>' : ''}
    </div>
    <div class="menu-foot">CLICK ANYWHERE TO ENABLE SOUND</div>
  </div>`;
}

export function controlsHTML() {
  const rows = [
    ['W A S D', 'MOVE'],
    ['MOUSE', 'AIM'],
    ['LEFT CLICK', 'SHOOT — hold for automatic weapons'],
    ['R', 'RELOAD — magazines auto-reload when empty'],
    ['L', 'RESPAWN at your last checkpoint'],
    ['R (when dead)', 'RESTART the whole mission'],
    ['G', 'DIVE — slow motion lunge, shoot on the way down'],
    ['TAB', 'WEAPON WHEEL — hold, aim with the mouse, release'],
    ['1 – 9', 'QUICK SWITCH WEAPON'],
    ['E', 'PICK UP the weapon you are standing on'],
    ['F', 'THROW your gun — hurts, staggers, and you can pick it back up'],
    ['WALK INTO DOORS', 'THEY SWING OPEN — run at one and it slams'],
    ['-  /  =  /  SCROLL', 'ROTATE CAMERA  (0 resets it)'],
    ['/', 'FIRST PERSON — look with the mouse, / again to go back'],
    ['ESC', 'PAUSE'],
  ];
  return `<div class="menu narrow">
    <h2>CONTROLS</h2>
    <div class="ctrl-grid">${rows.map(([k, v]) => `<kbd>${k}</kbd><span>${v}</span>`).join('')}</div>
    <button data-act="back">BACK</button>
  </div>`;
}

export function arsenalHTML(filter = '') {
  const f = filter.trim().toLowerCase();
  const list = ARSENAL.filter(g => !f || g.name.toLowerCase().includes(f) || g.cart.toLowerCase().includes(f) || g.country.toLowerCase().includes(f));
  const byClass = {};
  for (const g of list) (byClass[g.cls] ||= []).push(g);
  const order = ['pistol', 'smg', 'ar', 'shotgun', 'sniper', 'lmg'];
  return `<div class="menu wide">
    <h2>ARSENAL <span class="cnt">${list.length} of ${ARSENAL.length}</span></h2>
    <input class="arsenal-search" placeholder="search name, cartridge or country…" value="${filter.replace(/"/g, '&quot;')}">
    <div class="arsenal">
      ${order.filter(c => byClass[c]).map(c => `
        <div class="ars-class">${CLASS_LABEL[c]} <em>${byClass[c].length}</em></div>
        <div class="ars-list">${byClass[c].map(g => `
          <div class="ars-item">
            <div class="ai-name">${g.name}</div>
            <div class="ai-meta">${g.cart} · ${g.country}${g.year ? ' · ' + g.year : ''}</div>
            <div class="ai-stats"><span>DMG ${g.dmg}${g.pellets > 1 ? '×' + g.pellets : ''}</span><span>${g.rpm} RPM</span><span>MAG ${g.mag}</span><span>${g.auto ? 'AUTO' : 'SEMI'}</span></div>
          </div>`).join('')}</div>`).join('')}
    </div>
    <button data-act="back">BACK</button>
  </div>`;
}

// Descriptions for the cues that aren't tied to a mission.
const EXTRA_TRACK_LABELS = {
  credits:      { title: 'CREDITS', sub: 'The only genuinely warm cue in the game', c: '#f2f2f2' },
  ending_good:  { title: 'THE GOOD ENDING', sub: 'Six months later', c: '#4be08a' },
  ending_quiet: { title: 'THE QUIET ENDING', sub: 'Case closed', c: '#ff2d3d' },
};

export function soundtrackHTML(tracks, save, playing) {
  const bonusOpen = bonusUnlocked(save);
  const rows = [];
  const seen = new Set();

  const row = (id, title, sub, colour, meta) => {
    const on = playing === id;
    rows.push(`<div class="trk ${on ? 'playing' : ''}" data-track="${id}" style="--c:${colour}">
        <div class="trk-play">${on ? '&#9632;' : '&#9654;'}</div>
        <div class="trk-main"><div class="trk-title">${title}</div><div class="trk-sub">${sub}</div></div>
        <div class="trk-meta">${meta}</div>
      </div>`);
  };
  const metaFor = t => {
    if (!t) return '';
    if (t.club) return `${t.bpm} BPM · FOUR ON THE FLOOR`;
    const parts = [`${t.bpm} BPM`];
    if (t.drums && t.drums !== 'none') parts.push(t.drums.toUpperCase());
    if (t.lead && t.lead !== 'none') parts.push(t.lead.toUpperCase());
    return parts.join(' · ');
  };

  rows.push('<div class="trk-head">CAMPAIGN</div>');
  for (const L of ALL_LEVELS) {
    if (!tracks[L.id]) continue;
    if (L.bonus && !bonusOpen) continue;
    if (L.bonus && !seen.has('bonus')) { seen.add('bonus'); rows.push('<div class="trk-head bonus-head">THE SUBSIDIARY</div>'); }
    const c = CHARS[L.char];
    row(L.id, L.title, `${c.name} · ${L.sub}`, c.color, metaFor(tracks[L.id]));
  }
  rows.push('<div class="trk-head">OTHER</div>');
  for (const id of Object.keys(EXTRA_TRACK_LABELS)) {
    if (!tracks[id]) continue;
    const e = EXTRA_TRACK_LABELS[id];
    row(id, e.title, e.sub, e.c, metaFor(tracks[id]));
  }

  return `<div class="menu wide soundtrack">
    <h2>SOUNDTRACK <span class="cnt">click a track to play</span></h2>
    <div class="np"><div class="np-bar"><i></i></div><div class="np-label">${playing ? 'NOW PLAYING' : 'STOPPED'}</div>
      <button class="np-stop" data-act="stop">STOP</button></div>
    <div class="trk-list">${rows.join('')}</div>
    <button data-act="back">BACK</button>
  </div>`;
}

export function missionSelectHTML(save) {
  const acts = {
    0: 'PROLOGUE', 1: 'ACT I — THE LIST', 2: 'ACT II — THE FENCE', 3: 'ACT III — THE COMPANY',
    4: 'BONUS CAMPAIGN — THE SUBSIDIARY',
  };
  const bonusOpen = bonusUnlocked(save);
  let html = '<div class="menu wide"><h2>MISSION SELECT</h2><div class="missions">';
  let lastAct = -1;
  for (const L of ALL_LEVELS) {
    if (L.bonus && !bonusOpen) continue;
    if (L.act !== lastAct) {
      html += `<div class="act-head${L.act === 4 ? ' bonus-head' : ''}">${acts[L.act] || ''}</div>`;
      lastAct = L.act;
    }
    const done = !!save.done[L.id];
    const c = CHARS[L.char];
    html += `<div class="mission ${done ? 'done' : ''}" data-lvl="${L.id}" style="--c:${c.color}">
      <div class="m-char">${c.name}</div>
      <div class="m-title">${L.title}</div>
      <div class="m-sub">${L.sub}</div>
      <div class="m-flag">${done ? 'COMPLETE' : 'AVAILABLE'}</div>
    </div>`;
  }
  if (!bonusOpen) {
    html += `<div class="act-head locked-head">BONUS CAMPAIGN — LOCKED</div>
      <div class="bonus-teaser">Beat the final mission — <b>THE BAD COMPANY</b> — to unlock
      <b>THE SUBSIDIARY</b>: ten missions, three new leads, eighteen months after the
      Bad Company was dissolved. You do not have to clear anything else first; every
      mission above is already open, so you can go straight there.
      What happens in it depends on what you did to Kessler.</div>`;
  }
  html += '</div><button data-act="back">BACK</button></div>';
  return html;
}

export function pauseHTML(level, char) {
  return `<div class="menu narrow" style="--c:${char.color}">
    <div class="pause-char">${char.name}</div>
    <h2>${level.title}</h2>
    <div class="pause-obj">${level.objective}</div>
    <div class="menu-btns">
      <button data-act="resume">RESUME</button>
      <button data-act="restart">RESTART MISSION</button>
      <button data-act="menu">ABANDON — BACK TO MENU</button>
    </div>
  </div>`;
}

export function deathHTML(char, stats) {
  return `<div class="menu narrow dead" style="--c:${char.color}">
    <h1 class="dead-t">YOU DIED</h1>
    <div class="dead-sub">${char.full}</div>
    <div class="stats"><span>KILLS</span><b>${stats.kills}</b><span>ACCURACY</span><b>${stats.acc}%</b></div>
    <div class="checkpoint-line">LAST CHECKPOINT · ${stats.checkpoint || 'START'}</div>
    <div class="menu-btns">
      <button data-act="respawn">PRESS <kbd>L</kbd> TO RESPAWN</button>
      <button data-act="restart">RESTART THIS MISSION <kbd>R</kbd></button>
      <button data-act="menu">BACK TO MENU</button>
    </div>
  </div>`;
}

export function clearHTML(level, char, stats, nextTitle) {
  return `<div class="menu narrow clear" style="--c:${char.color}">
    <div class="clear-k">MISSION COMPLETE</div>
    <h1>${level.title}</h1>
    <div class="stats">
      <span>KILLS</span><b>${stats.kills}</b>
      <span>ACCURACY</span><b>${stats.acc}%</b>
      <span>TIME</span><b>${stats.time}</b>
      <span>WEAPONS USED</span><b>${stats.guns}</b>
    </div>
    <div class="menu-btns">
      <button data-act="next">${nextTitle ? 'NEXT: ' + nextTitle : 'CONTINUE'}</button>
      <button data-act="menu">MISSION SELECT</button>
    </div>
  </div>`;
}
