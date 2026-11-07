// Saving Sabrina — rendering, input, sound and screens. Rules live in logic.js.
(() => {
  const S = window.Sabrina;
  const LEVELS = window.SABRINA_LEVELS;
  const $ = id => document.getElementById(id);
  const canvas = $('board');
  const boardCtx = canvas.getContext('2d');
  let ctx = boardCtx; // sprite functions draw here; the finale briefly points it at its own canvas

  // ---------- saved progress (per-browser convenience only) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };
  let progress = store.get('sabrina.progress', { unlocked: 1, best: {} });
  if (!progress.v) { // v2 added the Witch's Kitchen as floor 5, so the old floor 5 is now floor 6
    if (progress.best['4'] != null) { progress.best['5'] = progress.best['4']; delete progress.best['4']; }
    if (progress.unlocked >= 5) progress.unlocked += 1;
    progress.v = 2;
    store.set('sabrina.progress', progress);
  }

  // ---------- game state ----------
  let levelIndex = 0;
  let state = null;
  let history = [];
  let screen = 'title'; // title | intro | play | clear | finale
  let anim = null;       // current move tween
  let queued = null;     // one buffered input while a tween plays
  let particles = [];
  let swingAnim = 0;     // time of last hammer swing
  let zapAt = 0;
  let wonAt = 0;
  let TS = 48, dpr = 1;
  const MOVE_MS = 110;

  const PALETTES = [
    { a: '#5d5763', b: '#57515d', wall: '#2f2a37', hi: '#4a4256', mortar: '#211d27' }, // gatehouse
    { a: '#4c5a5d', b: '#465356', wall: '#233039', hi: '#38505c', mortar: '#18222a' }, // cellar
    { a: '#6b5b4b', b: '#645444', wall: '#3a2e26', hi: '#58463a', mortar: '#29201a' }, // rubble
    { a: '#565070', b: '#4f4968', wall: '#2a2341', hi: '#42385e', mortar: '#1c1730' }, // gallery
    { a: '#7a5a3c', b: '#6f5135', wall: '#3b2a22', hi: '#55402f', mortar: '#271b15' }, // kitchen
    { a: '#7d5b6c', b: '#755464', wall: '#3f2738', hi: '#5e3c54', mortar: '#2c1a27' }, // chamber
  ];

  // ---------- sound ----------
  let actx = null, master = null, sfxBus = null, musicBus = null;
  let muted = store.get('sabrina.muted', false);        // Sound button: everything off
  let musicOn = store.get('sabrina.music', true);       // Music button: just the tunes
  function audio() {
    if (muted) return null;
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
      // everything goes through a compressor so effects and music can be loud without clipping
      master = actx.createDynamicsCompressor();
      master.threshold.value = -14; master.ratio.value = 4;
      const out = actx.createGain(); out.gain.value = 1.2;
      master.connect(out).connect(actx.destination);
      sfxBus = actx.createGain(); sfxBus.gain.value = 2.2; sfxBus.connect(master);
      musicBus = actx.createGain(); musicBus.gain.value = 0.9; musicBus.connect(master);
    }
    if (actx.state === 'suspended' && !document.hidden) actx.resume().catch(() => {});
    return actx;
  }

  // Browsers keep sound off until the player taps or presses a key, and iPhones also need a
  // sound started inside that tap. This runs on every tap and key, and is cheap once unlocked.
  let unlocked = false;
  function unlockAudio() {
    const a = audio(); if (!a) return;
    // iPhone: play through the ringer/silent switch, like a game would
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* not supported */ }
    if (!unlocked) {
      const src = a.createBufferSource();
      src.buffer = a.createBuffer(1, 1, 22050);
      src.connect(a.destination); src.start(0);
      unlocked = true;
    }
    refreshMusic();
  }
  ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'].forEach(ev =>
    window.addEventListener(ev, unlockAudio, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (!actx) return;
    if (document.hidden) actx.suspend().catch(() => {});
    else if (!muted) actx.resume().catch(() => {});
  });

  // ---------- music ----------
  const music = window.SabrinaMusic.createPlayer(() => (muted ? null : actx), () => musicBus);
  function wantedSong() { return screen === 'title' ? 'title' : screen === 'finale' ? 'finale' : levelIndex; }
  function refreshMusic() {
    if (muted || !musicOn || !actx) { music.stop(); return; }
    music.play(wantedSong());
  }
  function tone(freq, dur, type = 'square', vol = 0.06, when = 0, slideTo = null) {
    const a = audio(); if (!a) return;
    const t = a.currentTime + when;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq, when = 0) {
    const a = audio(); if (!a) return;
    const t = a.currentTime + when;
    const len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = a.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(sfxBus);
    src.start(t);
  }
  const SFX = {
    step: () => tone(200 + Math.random() * 30, 0.04, 'triangle', 0.035),
    bump: () => tone(110, 0.06, 'triangle', 0.04),
    push: () => { noise(0.12, 0.25, 500); tone(90, 0.1, 'triangle', 0.05); },
    splash: () => { noise(0.45, 0.3, 1400); tone(420, 0.3, 'sine', 0.05, 0, 140); },
    gem: () => { tone(988, 0.07, 'square', 0.04); tone(1480, 0.14, 'square', 0.04, 0.06); },
    unlock: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.07, i * 0.08)),
    hammer: () => { tone(660, 0.08, 'square', 0.04); tone(880, 0.08, 'square', 0.04, 0.08); tone(1100, 0.16, 'square', 0.04, 0.16); },
    smash: () => { noise(0.3, 0.45, 1800); tone(80, 0.18, 'sawtooth', 0.07); },
    clank: () => { tone(1400, 0.05, 'square', 0.03); tone(1900, 0.08, 'square', 0.02, 0.03); },
    nohammer: () => tone(150, 0.08, 'square', 0.03),
    zap: () => { tone(1200, 0.5, 'sawtooth', 0.07, 0, 60); noise(0.3, 0.15, 3000); },
    win: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.07, i * 0.1)),
    plop: () => { tone(300, 0.18, 'sine', 0.07, 0, 90); noise(0.25, 0.15, 700, 0.05); tone(520, 0.08, 'sine', 0.04, 0.16); tone(640, 0.08, 'sine', 0.04, 0.24); },
    brew: () => { noise(0.9, 0.35, 900, 0.15); [392, 494, 587, 784].forEach((f, i) => tone(f, 0.25, 'sine', 0.06, 0.3 + i * 0.09)); },
    fizzle: () => { noise(0.3, 0.18, 2500); tone(220, 0.2, 'sawtooth', 0.03, 0, 110); },
    key: () => { tone(1319, 0.08, 'triangle', 0.05); tone(1760, 0.18, 'triangle', 0.05, 0.08); },
    unlockdoor: () => { tone(180, 0.06, 'square', 0.05); tone(260, 0.06, 'square', 0.05, 0.07); [523, 784].forEach((f, i) => tone(f, 0.2, 'triangle', 0.06, 0.16 + i * 0.1)); },
    finale: () => [523, 659, 784, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, 'triangle', 0.07, i * 0.14)),
  };
  function play(events) { for (const e of events) SFX[e] && SFX[e](); }

  // ---------- helpers ----------
  const cx = i => (i % state.w);
  const cy = i => Math.floor(i / state.w);
  const hash = (x, y) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 1000 / 1000;
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => 1 - (1 - t) * (1 - t);

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---------- level flow ----------
  function loadLevel(i) {
    levelIndex = i;
    state = S.parse(LEVELS[i]);
    history = [];
    anim = null; queued = null; particles = [];
    zapAt = 0; wonAt = 0;
    climb = null;
    if (tHero.floor !== i) { tHero.floor = i; tHero.u = null; } // jumped floors: no walk, just appear
    drawMenu(); // before resize, since the recipe card takes room from the board
    resize();
    updateHud();
    $('hint').textContent = LEVELS[i].hint;
  }

  // Put the tower hero back on the current floor (after an undo or restart cancels a climb).
  function resetTowerHero() {
    if (climb || tHero.floor !== levelIndex) { climb = null; tHero.floor = levelIndex; tHero.u = null; }
  }

  function commit(result, kind) {
    history.push(state);
    if (history.length > 2000) history.shift();
    const prev = state;
    state = result.state;
    const now = performance.now();
    if (kind === 'move') {
      anim = { start: now, from: result.from, to: state.hero, push: result.push };
    }
    if (result.smashed != null) {
      swingAnim = now;
      burst(result.smashed, ['#8d8a92', '#6c6973', '#b3afb8'], 16, 3.2);
    }
    if (result.events.includes('gem') || result.events.includes('unlock')) burst(state.hero, ['#ff6f98', '#ffd0dd', '#fff'], 12, 2.2);
    if (result.events.includes('hammer')) burst(state.hero, ['#f2c45a', '#fff3c4'], 12, 2.2);
    if (result.events.includes('splash')) burst(result.push.to, ['#7cc0ff', '#bfe2ff', '#4a8fd6'], 18, 2.6);
    if (result.events.includes('unlock')) showToast('The way up is open!', false, 1600);
    if (result.events.includes('plop') && !result.events.includes('brew')) {
      burst(result.push.to, ['#7dff9a', '#c6ffd0', '#b07cff'], 14, 2);
      const next = state.recipe[state.brewed];
      showToast(`Plop! Now the ${S.INGREDIENTS[next]}.`, false, 1500);
    }
    if (result.events.includes('brew')) {
      puff(result.push.to);
      showToast('POOF! The cauldron made a key!', false, 2000);
    }
    if (result.events.includes('key')) burst(state.hero, ['#f2c45a', '#fff3c4'], 12, 2.2);
    if (result.events.includes('unlockdoor')) { burst(state.hero, ['#f2c45a', '#fff3c4', '#c98a3a'], 16, 2.6); showToast('Unlocked!', false, 1200); }
    if (result.events.includes('brew') || result.events.includes('plop')) drawMenu();
    if (state.dead) {
      zapAt = now;
      showToast('Zapped by a gargoyle! Press Z to undo or R to restart.', true);
    }
    if (state.won) {
      wonAt = now;
      recordBest();
      const last = levelIndex === LEVELS.length - 1, won = state;
      if (last || !towerShown) {
        setTimeout(() => { if (state === won) last ? showFinale() : showClear(); }, 900);
      } else {
        // Watch the little hero climb the stairs in the tower, then show the card.
        setTimeout(() => {
          if (state !== won || screen !== 'play') return;
          const ms = startClimb();
          setTimeout(() => { if (state === won && screen === 'play') showClear(); }, ms + 350);
        }, 450);
      }
    }
    play(result.events);
    updateHud();
    void prev;
  }

  function tryMove(dir) {
    if (screen !== 'play' || state.dead || state.won) return;
    if (anim && performance.now() - anim.start < MOVE_MS) { queued = { type: 'move', dir }; return; }
    const r = S.step(state, dir);
    if (!r.moved) {
      state = r.state; play(r.events); // just turn to face
      if (r.wrong) showToast(`Fizzle! The menu says the ${S.INGREDIENTS[r.need]} goes in next.`, true, 2200);
      return;
    }
    commit(r, 'move');
  }

  function trySmash() {
    if (screen !== 'play' || state.dead || state.won) return;
    if (anim && performance.now() - anim.start < MOVE_MS) { queued = { type: 'smash' }; return; }
    const r = S.smash(state);
    if (!r.moved) {
      play(r.events);
      if (r.events[0] === 'nohammer') showToast('You need a hammer first.', false, 1200);
      else { swingAnim = performance.now(); }
      return;
    }
    commit(r, 'smash');
  }

  function undo() {
    if (screen !== 'play' || !history.length) return;
    state = history.pop();
    anim = null; queued = null; zapAt = 0; wonAt = 0;
    resetTowerHero();
    hideToast();
    tone(500, 0.06, 'triangle', 0.04, 0, 300);
    updateHud(); drawMenu();
  }

  function restart() {
    if (screen !== 'play') return;
    const fresh = S.parse(LEVELS[levelIndex]);
    if (state.moves > 0) history.push(state); // restart can itself be undone
    state = fresh;
    anim = null; queued = null; particles = []; zapAt = 0; wonAt = 0;
    resetTowerHero();
    hideToast();
    tone(300, 0.1, 'triangle', 0.04, 0, 600);
    updateHud(); drawMenu();
  }

  function recordBest() {
    const k = String(levelIndex);
    const prevBest = progress.best[k];
    if (!prevBest || state.moves < prevBest) progress.best[k] = state.moves;
    progress.unlocked = Math.max(progress.unlocked, Math.min(LEVELS.length, levelIndex + 2));
    store.set('sabrina.progress', progress);
  }

  // ---------- HUD & overlays ----------
  function updateHud() {
    if (!state) return;
    $('floorLabel').textContent = `Floor ${levelIndex + 1} · ${LEVELS[levelIndex].name}`;
    $('gems').textContent = state.gemsLeft;
    $('swings').textContent = state.swings;
    $('keys').textContent = state.keys;
    $('keyStat').hidden = !LEVELS[levelIndex].recipe && !LEVELS[levelIndex].map.some(r => r.includes('L'));
    $('moves').textContent = state.moves;
    $('muteBtn').textContent = muted ? 'Muted' : 'Sound';
    $('musicBtn').textContent = musicOn && !muted ? 'Music' : 'No music';
    $('musicBtn').classList.toggle('off', !musicOn || muted);
    $('muteBtn').classList.toggle('off', muted);
  }

  let toastTimer = null;
  function showToast(msg, danger, ms) {
    const t = $('toast');
    t.textContent = msg;
    t.style.borderColor = danger ? 'var(--danger)' : 'var(--gold)';
    t.style.background = danger ? '#3a1420ee' : '#2e2410ee';
    t.style.display = 'block';
    clearTimeout(toastTimer);
    if (ms) toastTimer = setTimeout(hideToast, ms);
  }
  function hideToast() { $('toast').style.display = 'none'; clearTimeout(toastTimer); }

  const overlay = $('overlay');
  function setOverlay(html) {
    overlay.innerHTML = `<div class="card">${html}</div>`;
    overlay.classList.remove('hidden');
  }
  function closeOverlay() { overlay.classList.add('hidden'); overlay.innerHTML = ''; }

  const TOWER_SVG = `<svg class="tower" viewBox="0 0 120 150" aria-hidden="true">
    <defs><linearGradient id="tg" x1="0" x2="1"><stop offset="0" stop-color="#4a3d66"/><stop offset="1" stop-color="#2c2342"/></linearGradient></defs>
    <path d="M60 4 L84 40 H36 Z" fill="#c04a6a"/><path d="M60 4 L60 0" stroke="#f2c45a" stroke-width="2"/>
    <path d="M58 2 h10 l-3 3 3 3 h-10z" fill="#f2c45a"/>
    <rect x="40" y="40" width="40" height="104" fill="url(#tg)"/>
    <rect x="34" y="36" width="52" height="8" fill="#5a4a7a"/>
    <path d="M54 62 a6 6 0 0 1 12 0 v12 h-12z" fill="#f2c45a" opacity=".9"/>
    <rect x="50" y="94" width="7" height="10" rx="3" fill="#120d1e"/><rect x="63" y="112" width="7" height="10" rx="3" fill="#120d1e"/>
    <path d="M52 144 v-12 a8 8 0 0 1 16 0 v12z" fill="#120d1e"/>
    <path d="M10 148 Q60 134 110 148 Z" fill="#1b1430"/>
  </svg>`;

  function floorButtons() {
    return LEVELS.map((lv, i) => {
      const locked = i + 1 > progress.unlocked;
      const best = progress.best[String(i)];
      return `<button data-floor="${i}" ${locked ? 'disabled' : ''} title="${lv.name}">${i + 1}${best ? `<span class="best">${best}</span>` : ''}</button>`;
    }).join('');
  }

  function showTitle() {
    screen = 'title';
    hideToast();
    setOverlay(`
      ${TOWER_SVG}
      <div class="eyebrow">A tower of six puzzles</div>
      <h1>Saving Sabrina</h1>
      <p class="story">Princess Sabrina is locked at the top of Thornspire Tower. Climb all six floors,
      gathering every gem to unseal each staircase, and bring her home.</p>
      <div class="controls">
        <b>Arrows / WASD</b><span>Walk &amp; push crates</span>
        <b>Space</b><span>Swing the hammer</span>
        <b>Z</b><span>Undo a move</span>
        <b>R</b><span>Restart the floor</span>
      </div>
      <button class="primary" id="startBtn">${progress.unlocked > 1 ? 'Continue' : 'Begin the climb'}</button>
      <div class="floors">${floorButtons()}</div>
    `);
    $('startBtn').onclick = () => startFloor(Math.min(progress.unlocked, LEVELS.length) - 1);
    overlay.querySelectorAll('[data-floor]').forEach(b => b.onclick = () => startFloor(+b.dataset.floor));
    refreshMusic();
  }

  function startFloor(i) {
    audio();
    loadLevel(i);
    screen = 'intro';
    setOverlay(`
      <div class="eyebrow">Floor ${i + 1} of ${LEVELS.length}</div>
      <h2>${LEVELS[i].name}</h2>
      <p class="story">${LEVELS[i].hint}</p>
      <button class="primary" id="goBtn">Enter</button>
    `);
    $('goBtn').onclick = beginPlay;
    refreshMusic();
  }

  function beginPlay() { closeOverlay(); screen = 'play'; }

  function showClear() {
    screen = 'clear';
    hideToast();
    const best = progress.best[String(levelIndex)];
    setOverlay(`
      <div class="eyebrow">Floor ${levelIndex + 1} cleared</div>
      <h2>Up the stairs!</h2>
      <p>You finished <b>${LEVELS[levelIndex].name}</b> in <b>${state.moves}</b> moves${best && best < state.moves ? ` (best: ${best})` : ''}.</p>
      <p class="story">${['Sabrina’s voice drifts down from far above…', 'You hear singing through the stones. Keep climbing.',
        'A ribbon flutters down the stairwell.', 'Something smells… bubbly. Is that a kitchen up there?',
        'The cauldron bubbles behind you. One more floor. She’s calling your name!'][levelIndex] || ''}</p>
      <button class="primary" id="nextBtn">Next floor</button>
    `);
    SFX.win();
    $('nextBtn').onclick = () => startFloor(levelIndex + 1);
  }

  function showFinale() {
    screen = 'finale';
    hideToast();
    const total = Object.values(progress.best).reduce((a, b) => a + b, 0);
    setOverlay(`
      <div class="eyebrow">Thornspire Tower conquered</div>
      <h1>Sabrina is saved!</h1>
      <canvas id="finaleArt" width="260" height="130"></canvas>
      <p class="story">The gargoyles fall silent, the gate swings wide, and Princess Sabrina takes your hand.
      Together you walk down all six floors into the morning light.</p>
      <p>Your best runs add up to <b>${total}</b> moves. Can you climb it in fewer?</p>
      <button class="primary" id="againBtn">Back to the tower</button>
    `);
    SFX.finale();
    refreshMusic();
    finaleStart = performance.now();
    $('againBtn').onclick = showTitle;
  }
  let finaleStart = 0;

  // ---------- particles ----------
  function burst(i, colors, n, speed) {
    const x = (cx(i) + 0.5) * TS, y = (cy(i) + 0.5) * TS;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, v = (0.4 + Math.random()) * speed;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 1, color: colors[k % colors.length], size: 2 + Math.random() * 3 });
    }
  }

  // A big, slow puff of smoke for the finished brew.
  function puff(i) {
    const x = (cx(i) + 0.5) * TS, y = (cy(i) + 0.3) * TS;
    const colors = ['#d9d2e6', '#b8a9cf', '#9d8bbd', '#efe8f7', '#8be0a0'];
    for (let k = 0; k < 34; k++) {
      const a = Math.random() * Math.PI * 2, v = Math.random() * TS * 0.05;
      particles.push({ x: x + Math.cos(a) * TS * 0.2, y, vx: Math.cos(a) * v, vy: -Math.random() * TS * 0.05 - 0.5,
        life: 1, decay: 0.008 + Math.random() * 0.008, g: -0.01, round: true, color: colors[k % colors.length], size: TS * (0.12 + Math.random() * 0.14) });
    }
    burst(i, ['#f2c45a', '#fff3c4', '#ff6f98'], 18, 3);
  }

  // ---------- drawing ----------
  const TOWER_GAP = 14;
  const fitTS = (w, h) => Math.max(20, Math.min(64, Math.floor(Math.min(w / state.w, h / state.h))));
  function resize() {
    if (!state) return;
    const stage = $('stage');
    const availW = stage.clientWidth - 8, availH = stage.clientHeight - 8;
    const full = fitTS(availW, availH);
    // Show the tower beside the board only when the board can stay a good size.
    const tw = Math.round(Math.min(190, Math.max(120, availH * 0.3)));
    const roomW = availW - tw - TOWER_GAP;
    const withTower = fitTS(roomW, availH);
    towerShown = availH >= 240 && withTower >= Math.min(full, 38) && roomW >= state.w * withTower;
    TS = towerShown ? withTower : full;
    dpr = window.devicePixelRatio || 1;
    canvas.width = state.w * TS * dpr;
    canvas.height = state.h * TS * dpr;
    canvas.style.width = state.w * TS + 'px';
    canvas.style.height = state.h * TS + 'px';
    towerCanvas.classList.toggle('show', towerShown);
    if (towerShown) {
      towerW = tw;
      towerH = Math.round(Math.min(availH, Math.max(state.h * TS, 360, tw * 3.2)));
      towerCanvas.width = towerW * dpr; towerCanvas.height = towerH * dpr;
      towerCanvas.style.width = towerW + 'px'; towerCanvas.style.height = towerH + 'px';
    }
  }
  window.addEventListener('resize', resize);

  function drawFloor(x, y, pal) {
    const px = x * TS, py = y * TS;
    ctx.fillStyle = (x + y) % 2 ? pal.a : pal.b;
    ctx.fillRect(px, py, TS, TS);
    ctx.strokeStyle = '#0000001c'; ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, TS - 1, TS - 1);
    if (hash(x, y) > 0.82) { // a few chipped stones
      ctx.fillStyle = '#00000018';
      ctx.beginPath(); ctx.arc(px + TS * (0.3 + hash(y, x) * 0.4), py + TS * 0.6, TS * 0.06, 0, 7); ctx.fill();
    }
  }

  function drawWall(x, y, pal) {
    const px = x * TS, py = y * TS;
    ctx.fillStyle = pal.mortar; ctx.fillRect(px, py, TS, TS);
    const rows = 3, bh = TS / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r + y) % 2 ? TS / 2 : 0;
      for (let k = -1; k < 2; k++) {
        const bx = px + k * TS / 2 * 2 + off, bw = TS - 3;
        const sx = Math.max(px, bx + 1.5), ex = Math.min(px + TS, bx + bw);
        if (ex <= sx) continue;
        const shade = hash(x * 3 + k, y * 3 + r);
        ctx.fillStyle = shade > 0.7 ? pal.hi : pal.wall;
        ctx.fillRect(sx, py + r * bh + 1.5, ex - sx, bh - 3);
      }
    }
    // lip where a wall meets the floor below, for depth
    const below = (y + 1) * state.w + x;
    if (y + 1 < state.h && state.floor[below] !== '#') {
      ctx.fillStyle = '#00000055'; ctx.fillRect(px, py + TS - 4, TS, 4);
    }
  }

  function drawWater(x, y, t) {
    const px = x * TS, py = y * TS;
    const g = ctx.createLinearGradient(px, py, px, py + TS);
    g.addColorStop(0, '#2d6fb0'); g.addColorStop(1, '#1d4c84');
    ctx.fillStyle = g; ctx.fillRect(px, py, TS, TS);
    ctx.strokeStyle = '#9fd0ff88'; ctx.lineWidth = Math.max(1.5, TS / 26);
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      const yy = py + TS * (0.25 + k * 0.28);
      for (let s = 0; s <= 8; s++) {
        const xx = px + (s / 8) * TS;
        const yv = yy + Math.sin(t / 420 + s * 0.9 + x * 1.7 + k * 2) * TS * 0.04;
        s ? ctx.lineTo(xx, yv) : ctx.moveTo(xx, yv);
      }
      ctx.stroke();
    }
  }

  function drawCrate(px, py, sunken) {
    const m = TS * 0.08, s = TS - m * 2;
    if (!sunken) { ctx.fillStyle = '#00000044'; rr(px + m, py + m + TS * 0.06, s, s, TS * 0.08); ctx.fill(); }
    ctx.fillStyle = sunken ? '#7a5130' : '#b5753f';
    rr(px + m, py + m, s, s, TS * 0.08); ctx.fill();
    ctx.strokeStyle = sunken ? '#4a2f1a' : '#6b3f1f'; ctx.lineWidth = Math.max(2, TS / 16);
    rr(px + m, py + m, s, s, TS * 0.08); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px + m * 2, py + m * 2); ctx.lineTo(px + TS - m * 2, py + TS - m * 2);
    ctx.moveTo(px + TS - m * 2, py + m * 2); ctx.lineTo(px + m * 2, py + TS - m * 2);
    ctx.stroke();
    if (!sunken) { ctx.fillStyle = '#ffffff22'; ctx.fillRect(px + m * 1.6, py + m * 1.4, s - m * 1.2, TS * 0.06); }
    else { ctx.strokeStyle = '#9fd0ff55'; ctx.lineWidth = 1.5; rr(px + m * 0.5, py + m * 0.5, TS - m, TS - m, TS * 0.1); ctx.stroke(); }
  }

  function drawGem(px, py, t, i) {
    const bob = Math.sin(t / 300 + i) * TS * 0.05;
    const c = px + TS / 2, m = py + TS / 2 + bob, r = TS * 0.28;
    ctx.fillStyle = '#00000033';
    ctx.beginPath(); ctx.ellipse(c, py + TS * 0.82, r * 0.7, r * 0.22, 0, 0, 7); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(c, m - r); ctx.lineTo(c + r, m - r * 0.2); ctx.lineTo(c, m + r); ctx.lineTo(c - r, m - r * 0.2); ctx.closePath();
    ctx.fillStyle = '#ff5c8a'; ctx.fill();
    ctx.strokeStyle = '#ffd0dd'; ctx.lineWidth = Math.max(1.5, TS / 30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(c - r, m - r * 0.2); ctx.lineTo(c + r, m - r * 0.2); ctx.strokeStyle = '#ffb3c9'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t / 200 + i * 3);
    ctx.beginPath(); ctx.arc(c - r * 0.35, m - r * 0.45, TS * 0.04, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawHammerIcon(c, m, size, angle) {
    ctx.save(); ctx.translate(c, m); ctx.rotate(angle);
    ctx.fillStyle = '#a9763f'; ctx.fillRect(-size * 0.07, -size * 0.25, size * 0.14, size * 0.75);
    ctx.fillStyle = '#c3cad6'; rr(-size * 0.32, -size * 0.45, size * 0.64, size * 0.26, size * 0.06); ctx.fill();
    ctx.strokeStyle = '#646b78'; ctx.lineWidth = Math.max(1, size / 24); ctx.stroke();
    ctx.restore();
  }

  function drawHammerItem(px, py, t) {
    const bob = Math.sin(t / 350) * TS * 0.04;
    ctx.fillStyle = '#f2c45a33';
    ctx.beginPath(); ctx.arc(px + TS / 2, py + TS / 2, TS * 0.38 + Math.sin(t / 250) * TS * 0.03, 0, 7); ctx.fill();
    drawHammerIcon(px + TS / 2, py + TS / 2 + bob, TS * 0.8, -0.5);
  }

  function drawRock(px, py, x, y) {
    const c = px + TS / 2, m = py + TS / 2;
    ctx.fillStyle = '#00000040';
    ctx.beginPath(); ctx.ellipse(c, py + TS * 0.84, TS * 0.38, TS * 0.1, 0, 0, 7); ctx.fill();
    ctx.beginPath();
    const pts = 9;
    for (let k = 0; k < pts; k++) {
      const a = (k / pts) * Math.PI * 2, r = TS * (0.36 + hash(x * 9 + k, y * 7) * 0.08);
      const xx = c + Math.cos(a) * r, yy = m + Math.sin(a) * r * 0.9;
      k ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(c - TS * 0.12, m - TS * 0.14, TS * 0.05, c, m, TS * 0.45);
    g.addColorStop(0, '#a8a4ae'); g.addColorStop(1, '#5e5a66');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#2c2a31'; ctx.lineWidth = Math.max(1.5, TS / 22);
    ctx.beginPath();
    ctx.moveTo(c - TS * 0.05, m - TS * 0.3); ctx.lineTo(c + TS * 0.04, m - TS * 0.08); ctx.lineTo(c - TS * 0.1, m + TS * 0.06); ctx.lineTo(c + TS * 0.02, m + TS * 0.28);
    ctx.moveTo(c + TS * 0.04, m - TS * 0.08); ctx.lineTo(c + TS * 0.22, m - TS * 0.02);
    ctx.stroke();
  }

  function drawDoor(px, py, open, t) {
    const m = TS * 0.14;
    ctx.fillStyle = '#1a1424';
    ctx.beginPath();
    ctx.moveTo(px + m, py + TS); ctx.lineTo(px + m, py + TS * 0.45);
    ctx.arc(px + TS / 2, py + TS * 0.45, TS / 2 - m, Math.PI, 0); ctx.lineTo(px + TS - m, py + TS); ctx.closePath();
    if (open) {
      const glow = 0.6 + 0.4 * Math.sin(t / 250);
      ctx.fillStyle = '#2a1d10'; ctx.fill();
      ctx.save(); ctx.clip();
      for (let k = 0; k < 4; k++) {
        ctx.fillStyle = `rgba(242,196,90,${(0.35 + k * 0.15) * glow})`;
        ctx.fillRect(px, py + TS * (0.42 + k * 0.15), TS, TS * 0.1);
      }
      ctx.restore();
      ctx.shadowColor = '#f2c45a'; ctx.shadowBlur = TS * 0.4 * glow;
      ctx.strokeStyle = '#f2c45a'; ctx.lineWidth = Math.max(2, TS / 16); ctx.stroke();
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = '#7a4a26'; ctx.fill();
      ctx.strokeStyle = '#3e2412'; ctx.lineWidth = Math.max(2, TS / 18); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px + TS / 2, py + TS * 0.2); ctx.lineTo(px + TS / 2, py + TS); ctx.stroke();
      ctx.fillStyle = '#4b4f5a';
      ctx.fillRect(px + m, py + TS * 0.5, TS - m * 2, TS * 0.07);
      ctx.fillRect(px + m, py + TS * 0.78, TS - m * 2, TS * 0.07);
      // padlock
      ctx.fillStyle = '#f2c45a'; rr(px + TS * 0.39, py + TS * 0.55, TS * 0.22, TS * 0.18, 2); ctx.fill();
      ctx.strokeStyle = '#f2c45a'; ctx.lineWidth = Math.max(1.5, TS / 26);
      ctx.beginPath(); ctx.arc(px + TS / 2, py + TS * 0.55, TS * 0.07, Math.PI, 0); ctx.stroke();
    }
  }

  function drawPlate(px, py, pressed) {
    const m = TS * 0.16;
    ctx.fillStyle = '#2b2733'; rr(px + m - 2, py + m - 2, TS - m * 2 + 4, TS - m * 2 + 4, 5); ctx.fill();
    ctx.fillStyle = pressed ? '#6f8a5a' : '#a5a0ad';
    rr(px + m, py + m + (pressed ? 2 : 0), TS - m * 2, TS - m * 2 - (pressed ? 2 : 0), 4); ctx.fill();
    ctx.fillStyle = pressed ? '#9fd27a' : '#d8d3de';
    ctx.beginPath(); ctx.arc(px + TS / 2, py + TS / 2 + (pressed ? 1 : 0), TS * 0.07, 0, 7); ctx.fill();
  }

  function drawGate(px, py, open) {
    ctx.fillStyle = '#3c3946'; ctx.fillRect(px, py, TS, TS * 0.1);
    ctx.strokeStyle = '#8b8798'; ctx.lineWidth = Math.max(2, TS / 12); ctx.lineCap = 'round';
    const len = open ? TS * 0.16 : TS * 0.9;
    for (let k = 0; k < 4; k++) {
      const xx = px + TS * (0.17 + k * 0.22);
      ctx.beginPath(); ctx.moveTo(xx, py + TS * 0.06); ctx.lineTo(xx, py + len); ctx.stroke();
      if (!open) { ctx.fillStyle = '#b8b4c4'; ctx.beginPath(); ctx.moveTo(xx - TS * 0.05, py + len); ctx.lineTo(xx + TS * 0.05, py + len); ctx.lineTo(xx, py + len + TS * 0.07); ctx.fill(); }
    }
    if (!open) { ctx.beginPath(); ctx.moveTo(px + TS * 0.08, py + TS * 0.5); ctx.lineTo(px + TS * 0.92, py + TS * 0.5); ctx.stroke(); }
    ctx.lineCap = 'butt';
  }

  const ANGLE = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
  function drawGargoyle(px, py, dir, t) {
    const c = px + TS / 2, m = py + TS / 2;
    ctx.fillStyle = '#3a3742'; rr(px + 2, py + 2, TS - 4, TS - 4, TS * 0.12); ctx.fill();
    ctx.save(); ctx.translate(c, m); ctx.rotate(ANGLE[dir]);
    // head, drawn facing right
    ctx.fillStyle = '#7d7987';
    ctx.beginPath(); ctx.ellipse(0, 0, TS * 0.34, TS * 0.3, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(TS * 0.2, -TS * 0.16); ctx.lineTo(TS * 0.46, 0); ctx.lineTo(TS * 0.2, TS * 0.16); ctx.fill(); // snout
    ctx.fillStyle = '#5c5866';
    ctx.beginPath(); ctx.moveTo(-TS * 0.1, -TS * 0.26); ctx.lineTo(-TS * 0.3, -TS * 0.44); ctx.lineTo(-TS * 0.02, -TS * 0.3); ctx.fill(); // horns
    ctx.beginPath(); ctx.moveTo(-TS * 0.1, TS * 0.26); ctx.lineTo(-TS * 0.3, TS * 0.44); ctx.lineTo(-TS * 0.02, TS * 0.3); ctx.fill();
    const glow = 0.7 + 0.3 * Math.sin(t / 180);
    ctx.fillStyle = `rgba(255,70,50,${glow})`; ctx.shadowColor = '#ff3a2a'; ctx.shadowBlur = TS * 0.3;
    ctx.beginPath(); ctx.arc(TS * 0.1, -TS * 0.1, TS * 0.06, 0, 7); ctx.arc(TS * 0.1, TS * 0.1, TS * 0.06, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function drawBeams(t) {
    const segs = S.beamSegments(state);
    const pulse = 0.55 + 0.25 * Math.sin(t / 160);
    for (const seg of segs) {
      if (!seg.cells.length) continue;
      const horiz = seg.dir === 'left' || seg.dir === 'right';
      for (const c of seg.cells) {
        const px = cx(c) * TS, py = cy(c) * TS;
        ctx.fillStyle = `rgba(255,60,40,${0.13 * pulse})`;
        ctx.fillRect(px, py, TS, TS);
        ctx.fillStyle = `rgba(255,90,60,${0.55 * pulse})`;
        if (horiz) ctx.fillRect(px, py + TS * 0.46, TS, TS * 0.08);
        else ctx.fillRect(px + TS * 0.46, py, TS * 0.08, TS);
      }
    }
  }

  function drawHero(c, m, dir, size, t, opts = {}) {
    const s = size;
    const step = opts.walking ? Math.sin(t / 40) * s * 0.04 : 0;
    ctx.fillStyle = '#00000040';
    ctx.beginPath(); ctx.ellipse(c, m + s * 0.36, s * 0.26, s * 0.08, 0, 0, 7); ctx.fill();
    // legs
    ctx.fillStyle = '#3b3550';
    ctx.fillRect(c - s * 0.14, m + s * 0.14 + step, s * 0.1, s * 0.2);
    ctx.fillRect(c + s * 0.04, m + s * 0.14 - step, s * 0.1, s * 0.2);
    // tunic
    ctx.fillStyle = '#3d6fd6';
    rr(c - s * 0.22, m - s * 0.08, s * 0.44, s * 0.3, s * 0.08); ctx.fill();
    ctx.fillStyle = '#f2c45a'; ctx.fillRect(c - s * 0.22, m + s * 0.08, s * 0.44, s * 0.05); // belt
    // hammer in hand
    if (opts.hammer) {
      const swing = opts.swing || 0;
      const side = dir === 'left' ? -1 : 1;
      drawHammerIcon(c + side * s * 0.3, m + s * 0.02, s * 0.5, side * (0.5 + swing * 1.6));
    }
    // helmet
    ctx.fillStyle = '#c9ced8';
    ctx.beginPath(); ctx.arc(c, m - s * 0.2, s * 0.21, 0, 7); ctx.fill();
    ctx.strokeStyle = '#7d8494'; ctx.lineWidth = Math.max(1, s / 30); ctx.stroke();
    // plume
    ctx.fillStyle = '#e04a5a';
    ctx.beginPath(); ctx.ellipse(c - (dir === 'right' ? s * 0.06 : dir === 'left' ? -s * 0.06 : 0), m - s * 0.42, s * 0.07, s * 0.12, dir === 'right' ? -0.5 : dir === 'left' ? 0.5 : 0, 0, 7); ctx.fill();
    // visor and eyes
    if (dir !== 'up') {
      const ox = dir === 'left' ? -s * 0.07 : dir === 'right' ? s * 0.07 : 0;
      ctx.fillStyle = '#26222f'; rr(c - s * 0.15 + ox, m - s * 0.24, s * 0.3, s * 0.09, s * 0.03); ctx.fill();
      ctx.fillStyle = '#9fe0ff';
      ctx.fillRect(c - s * 0.09 + ox, m - s * 0.215, s * 0.05, s * 0.035);
      ctx.fillRect(c + s * 0.04 + ox, m - s * 0.215, s * 0.05, s * 0.035);
    }
  }

  function drawSabrina(c, m, size, t, open) {
    const s = size, sway = Math.sin(t / 400) * s * 0.02;
    ctx.fillStyle = '#00000040';
    ctx.beginPath(); ctx.ellipse(c, m + s * 0.38, s * 0.28, s * 0.08, 0, 0, 7); ctx.fill();
    // gown
    const g = ctx.createLinearGradient(c, m - s * 0.1, c, m + s * 0.38);
    g.addColorStop(0, '#ff8fb1'); g.addColorStop(1, '#d94f7d');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(c - s * 0.1 + sway, m - s * 0.08); ctx.lineTo(c + s * 0.1 + sway, m - s * 0.08);
    ctx.lineTo(c + s * 0.3, m + s * 0.36); ctx.lineTo(c - s * 0.3, m + s * 0.36); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd0dd'; ctx.fillRect(c - s * 0.26, m + s * 0.28, s * 0.52, s * 0.04);
    // hair & face
    ctx.fillStyle = '#e9a83a';
    ctx.beginPath(); ctx.ellipse(c + sway, m - s * 0.18, s * 0.19, s * 0.22, 0, 0, 7); ctx.fill();
    ctx.fillRect(c - s * 0.19 + sway, m - s * 0.2, s * 0.38, s * 0.24);
    ctx.fillStyle = '#ffd9bf';
    ctx.beginPath(); ctx.arc(c + sway, m - s * 0.18, s * 0.13, 0, 7); ctx.fill();
    ctx.fillStyle = '#3a2433';
    ctx.fillRect(c - s * 0.06 + sway, m - s * 0.2, s * 0.03, s * 0.04);
    ctx.fillRect(c + s * 0.03 + sway, m - s * 0.2, s * 0.03, s * 0.04);
    ctx.fillStyle = '#e8708f'; ctx.fillRect(c - s * 0.025 + sway, m - s * 0.12, s * 0.05, s * 0.015);
    // crown
    ctx.fillStyle = '#f2c45a';
    ctx.beginPath();
    const cy0 = m - s * 0.32;
    ctx.moveTo(c - s * 0.12 + sway, cy0 + s * 0.06); ctx.lineTo(c - s * 0.12 + sway, cy0 - s * 0.04); ctx.lineTo(c - s * 0.06 + sway, cy0 + s * 0.01);
    ctx.lineTo(c + sway, cy0 - s * 0.07); ctx.lineTo(c + s * 0.06 + sway, cy0 + s * 0.01); ctx.lineTo(c + s * 0.12 + sway, cy0 - s * 0.04);
    ctx.lineTo(c + s * 0.12 + sway, cy0 + s * 0.06); ctx.closePath(); ctx.fill();
    if (open) {
      const k = (t / 900) % 1;
      drawHeart(c + s * 0.28, m - s * 0.3 - k * s * 0.3, s * 0.12, 1 - k);
    }
  }

  function drawHeart(x, y, r, alpha) {
    ctx.save(); ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = '#ff5c8a';
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.9);
    ctx.bezierCurveTo(x - r * 1.4, y - r * 0.2, x - r * 0.6, y - r * 1.2, x, y - r * 0.4);
    ctx.bezierCurveTo(x + r * 0.6, y - r * 1.2, x + r * 1.4, y - r * 0.2, x, y + r * 0.9);
    ctx.fill(); ctx.restore();
  }


  // ---------- kitchen sprites ----------
  function drawToadstool(px, py) {
    const c = px + TS / 2;
    ctx.fillStyle = '#00000040'; ctx.beginPath(); ctx.ellipse(c, py + TS * 0.84, TS * 0.3, TS * 0.08, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#f3e6cf'; rr(c - TS * 0.1, py + TS * 0.45, TS * 0.2, TS * 0.38, TS * 0.06); ctx.fill(); // stem
    ctx.fillStyle = '#d8354a';
    ctx.beginPath(); ctx.ellipse(c, py + TS * 0.46, TS * 0.36, TS * 0.28, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); // cap
    ctx.strokeStyle = '#8a1d2c'; ctx.lineWidth = Math.max(1.5, TS / 26); ctx.stroke();
    ctx.fillStyle = '#fff';
    [[-0.17, 0.36, 0.05], [0.04, 0.27, 0.06], [0.2, 0.38, 0.045], [-0.02, 0.41, 0.035]].forEach(([dx, dy, r]) => {
      ctx.beginPath(); ctx.arc(c + dx * TS, py + dy * TS, r * TS, 0, 7); ctx.fill();
    });
  }

  function drawFeather(px, py) {
    const c = px + TS / 2, m = py + TS / 2;
    ctx.fillStyle = '#00000040'; ctx.beginPath(); ctx.ellipse(c, py + TS * 0.84, TS * 0.3, TS * 0.07, 0, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(c, m); ctx.rotate(-0.7);
    const g = ctx.createLinearGradient(0, -TS * 0.4, 0, TS * 0.3);
    g.addColorStop(0, '#5fd3e8'); g.addColorStop(0.6, '#3a7bd5'); g.addColorStop(1, '#6a4bc4');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, -TS * 0.42);
    ctx.quadraticCurveTo(TS * 0.22, -TS * 0.1, TS * 0.03, TS * 0.3);
    ctx.quadraticCurveTo(-TS * 0.22, -TS * 0.08, 0, -TS * 0.42); ctx.fill();
    ctx.strokeStyle = '#f3ead8'; ctx.lineWidth = Math.max(1.2, TS / 34);
    ctx.beginPath(); ctx.moveTo(0, -TS * 0.36); ctx.lineTo(0.01 * TS, TS * 0.42); ctx.stroke(); // quill
    ctx.strokeStyle = '#ffffff55';
    for (let k = 0; k < 4; k++) { const yy = -TS * 0.22 + k * TS * 0.1; ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(TS * 0.12, yy - TS * 0.06); ctx.moveTo(0, yy); ctx.lineTo(-TS * 0.12, yy - TS * 0.06); ctx.stroke(); }
    ctx.restore();
  }

  function drawBatWing(px, py) {
    const c = px + TS / 2, m = py + TS * 0.48;
    ctx.fillStyle = '#00000040'; ctx.beginPath(); ctx.ellipse(c, py + TS * 0.84, TS * 0.34, TS * 0.07, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#3b2b4f'; ctx.strokeStyle = '#1c1328'; ctx.lineWidth = Math.max(1.5, TS / 26);
    ctx.beginPath();
    ctx.moveTo(c - TS * 0.36, m - TS * 0.2);              // wrist
    ctx.quadraticCurveTo(c, m - TS * 0.34, c + TS * 0.38, m - TS * 0.12); // top edge to wing tip
    ctx.quadraticCurveTo(c + TS * 0.28, m + TS * 0.04, c + TS * 0.3, m + TS * 0.2);
    ctx.quadraticCurveTo(c + TS * 0.14, m + TS * 0.08, c + TS * 0.06, m + TS * 0.24);
    ctx.quadraticCurveTo(c - TS * 0.06, m + TS * 0.08, c - TS * 0.18, m + TS * 0.2);
    ctx.quadraticCurveTo(c - TS * 0.24, m, c - TS * 0.36, m - TS * 0.2);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#6d5a88'; ctx.lineWidth = Math.max(1, TS / 40);
    ctx.beginPath();
    ctx.moveTo(c - TS * 0.36, m - TS * 0.2); ctx.lineTo(c + TS * 0.3, m + TS * 0.2);
    ctx.moveTo(c - TS * 0.36, m - TS * 0.2); ctx.lineTo(c + TS * 0.06, m + TS * 0.24);
    ctx.moveTo(c - TS * 0.36, m - TS * 0.2); ctx.lineTo(c - TS * 0.18, m + TS * 0.2);
    ctx.stroke();
    ctx.fillStyle = '#e8e0f0'; ctx.beginPath(); ctx.moveTo(c - TS * 0.36, m - TS * 0.2); ctx.lineTo(c - TS * 0.42, m - TS * 0.3); ctx.lineTo(c - TS * 0.3, m - TS * 0.24); ctx.fill(); // claw
  }

  function drawIngredient(o, px, py) {
    if (o === 't') drawToadstool(px, py); else if (o === 'f') drawFeather(px, py); else drawBatWing(px, py);
  }

  function drawKey(px, py, t, bobbing = true) {
    const bob = bobbing ? Math.sin(t / 320) * TS * 0.05 : 0;
    const c = px + TS / 2, m = py + TS / 2 + bob;
    if (bobbing) { ctx.fillStyle = '#f2c45a33'; ctx.beginPath(); ctx.arc(c, m, TS * 0.38 + Math.sin(t / 250) * TS * 0.03, 0, 7); ctx.fill(); }
    ctx.save(); ctx.translate(c, m); ctx.rotate(-0.6);
    ctx.fillStyle = '#f2c45a'; ctx.strokeStyle = '#a87a22'; ctx.lineWidth = Math.max(1.2, TS / 32);
    ctx.beginPath(); ctx.arc(-TS * 0.18, 0, TS * 0.13, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#4a3420'; ctx.beginPath(); ctx.arc(-TS * 0.18, 0, TS * 0.05, 0, 7); ctx.fill();
    ctx.fillStyle = '#f2c45a';
    ctx.fillRect(-TS * 0.06, -TS * 0.04, TS * 0.38, TS * 0.08); ctx.strokeRect(-TS * 0.06, -TS * 0.04, TS * 0.38, TS * 0.08);
    ctx.fillRect(TS * 0.2, TS * 0.03, TS * 0.06, TS * 0.1); ctx.fillRect(TS * 0.1, TS * 0.03, TS * 0.05, TS * 0.07);
    ctx.restore();
  }

  function drawCauldron(px, py, t, brewed, total) {
    const c = px + TS / 2, done = brewed >= total;
    // fire
    if (!done) for (let k = 0; k < 3; k++) {
      const fx = c + (k - 1) * TS * 0.16, h = TS * (0.16 + 0.05 * Math.sin(t / 90 + k * 2));
      ctx.fillStyle = k === 1 ? '#ffd24a' : '#ff7a2a';
      ctx.beginPath(); ctx.moveTo(fx - TS * 0.07, py + TS * 0.94); ctx.quadraticCurveTo(fx, py + TS * 0.94 - h * 2, fx + TS * 0.07, py + TS * 0.94); ctx.fill();
    }
    // pot
    ctx.fillStyle = '#1e1b22';
    ctx.beginPath(); ctx.ellipse(c, py + TS * 0.55, TS * 0.42, TS * 0.32, 0, 0, Math.PI); ctx.lineTo(c - TS * 0.42, py + TS * 0.42); ctx.lineTo(c + TS * 0.42, py + TS * 0.42); ctx.fill();
    ctx.fillStyle = '#2c2833'; ctx.fillRect(c - TS * 0.3, py + TS * 0.82, TS * 0.08, TS * 0.1); ctx.fillRect(c + TS * 0.22, py + TS * 0.82, TS * 0.08, TS * 0.1);
    ctx.fillStyle = '#ffffff14'; ctx.beginPath(); ctx.ellipse(c - TS * 0.2, py + TS * 0.6, TS * 0.06, TS * 0.14, 0.3, 0, 7); ctx.fill();
    // rim and brew
    ctx.fillStyle = '#3a3542'; ctx.beginPath(); ctx.ellipse(c, py + TS * 0.4, TS * 0.44, TS * 0.12, 0, 0, 7); ctx.fill();
    const brewColor = ['#5aa64a', '#4cc0a0', '#7a6ee0', '#c86fe0'][Math.min(brewed, 3)];
    ctx.fillStyle = done ? '#4a4452' : brewColor;
    ctx.beginPath(); ctx.ellipse(c, py + TS * 0.41, TS * 0.36, TS * 0.08, 0, 0, 7); ctx.fill();
    if (!done) {
      ctx.fillStyle = '#ffffff66';
      for (let k = 0; k < 3; k++) {
        const ph = ((t / 700) + k / 3) % 1;
        ctx.globalAlpha = 1 - ph;
        ctx.beginPath(); ctx.arc(c + (k - 1) * TS * 0.15, py + TS * (0.38 - ph * 0.3), TS * (0.03 + ph * 0.04), 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else {
      // a little leftover wisp
      ctx.fillStyle = '#d9d2e622'; ctx.beginPath(); ctx.arc(c + Math.sin(t / 600) * TS * 0.08, py + TS * 0.18, TS * 0.12, 0, 7); ctx.fill();
    }
  }

  function drawLockedDoor(px, py) {
    const m = TS * 0.1;
    ctx.fillStyle = '#5a3a22'; rr(px + m, py + m * 0.6, TS - m * 2, TS - m * 0.6, TS * 0.06); ctx.fill();
    ctx.strokeStyle = '#2e1c10'; ctx.lineWidth = Math.max(2, TS / 18); ctx.stroke();
    ctx.strokeStyle = '#3e2614'; ctx.lineWidth = Math.max(1, TS / 30);
    for (let k = 1; k < 3; k++) { ctx.beginPath(); ctx.moveTo(px + m + k * (TS - m * 2) / 3, py + m); ctx.lineTo(px + m + k * (TS - m * 2) / 3, py + TS); ctx.stroke(); }
    ctx.fillStyle = '#4b4f5a'; ctx.fillRect(px + m, py + TS * 0.25, TS - m * 2, TS * 0.07); ctx.fillRect(px + m, py + TS * 0.75, TS - m * 2, TS * 0.07);
    // keyhole plate
    ctx.fillStyle = '#f2c45a'; rr(px + TS * 0.36, py + TS * 0.4, TS * 0.28, TS * 0.28, TS * 0.05); ctx.fill();
    ctx.fillStyle = '#1a1424';
    ctx.beginPath(); ctx.arc(px + TS / 2, py + TS * 0.5, TS * 0.045, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(px + TS * 0.48, py + TS * 0.52); ctx.lineTo(px + TS * 0.52, py + TS * 0.52); ctx.lineTo(px + TS * 0.54, py + TS * 0.63); ctx.lineTo(px + TS * 0.46, py + TS * 0.63); ctx.fill();
  }

  // The recipe card under the board, with each ingredient ticked off as it goes in.
  function drawMenu() {
    const el = $('menu');
    const lv = LEVELS[levelIndex];
    if (!lv || !lv.recipe || !state) { el.hidden = true; return; }
    el.hidden = false;
    const done = state.brewed;
    el.innerHTML = `<span class="menu-title">Menu</span>` + lv.recipe.map((o, k) =>
      `${k ? '<span class="arrow">→</span>' : ''}<span class="item${k < done ? ' done' : k === done ? ' next' : ''}">
        <canvas data-ing="${o}" width="64" height="64"></canvas><span>${S.INGREDIENTS[o]}</span>${k < done ? '<b>✓</b>' : ''}</span>`).join('')
      + `<span class="arrow">=</span><span class="item${done >= lv.recipe.length ? ' made' : ''}"><canvas data-ing="K" width="64" height="64"></canvas><span>key</span></span>`;
    const saved = ctx, savedTS = TS;
    el.querySelectorAll('canvas').forEach(cv => {
      ctx = cv.getContext('2d'); TS = 64;
      if (cv.dataset.ing === 'K') drawKey(0, 0, 0, false); else drawIngredient(cv.dataset.ing, 0, 0);
    });
    ctx = saved; TS = savedTS;
  }

  function draw(t) {
    const s = state, pal = PALETTES[levelIndex];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, s.w * TS, s.h * TS);
    const held = S.platesHeld(s);
    const unlocked = s.gemsLeft === 0;

    // terrain
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const i = y * s.w + x, f = s.floor[i];
      if (f === '#') { drawWall(x, y, pal); continue; }
      if (f === '~') { drawWater(x, y, t); continue; }
      if (f === '=') { drawWater(x, y, t); drawCrate(x * TS, y * TS, true); continue; }
      drawFloor(x, y, pal);
      const px = x * TS, py = y * TS;
      if (f === 'R') drawRock(px, py, x, y);
      else if (f === 'D') drawDoor(px, py, unlocked, t);
      else if (f === 'C' || f === 'c') drawCauldron(px, py, t, s.brewed, s.recipe.length);
      else if (f === 'L') drawLockedDoor(px, py);
      else if (f === '_') drawPlate(px, py, s.obj[i] === 'B' || s.hero === i);
      else if (S.GARGOYLES[f]) drawGargoyle(px, py, S.GARGOYLES[f], t);
    }

    drawBeams(t);

    // gates draw over beams so closed bars look solid
    for (let i = 0; i < s.floor.length; i++) {
      if (s.floor[i] === '|') drawGate(cx(i) * TS, cy(i) * TS, S.gateOpen(s, i, held));
    }

    // tween progress
    let k = 1;
    if (anim) { k = Math.min(1, (t - anim.start) / MOVE_MS); if (k >= 1) { anim = null; runQueued(); } }
    const e = ease(k);

    // objects
    for (let i = 0; i < s.obj.length; i++) {
      const o = s.obj[i];
      if (!o) continue;
      let px = cx(i) * TS, py = cy(i) * TS;
      if (S.isIngredient(o)) {
        if (anim && anim.push && anim.push.to === i) {
          px = lerp(cx(anim.push.from), cx(i), e) * TS; py = lerp(cy(anim.push.from), cy(i), e) * TS;
        }
        drawIngredient(o, px, py);
      } else if (o === 'K') {
        if (!(anim && anim.push && anim.push.into && k < 1)) drawKey(px, py, t);
      } else if (o === 'B') {
        if (anim && anim.push && anim.push.to === i) {
          px = lerp(cx(anim.push.from), cx(i), e) * TS; py = lerp(cy(anim.push.from), cy(i), e) * TS;
        }
        drawCrate(px, py, false);
      } else if (o === '*') drawGem(px, py, t, i);
      else if (o === 'H') drawHammerItem(px, py, t);
    }
    // ingredient sliding into the cauldron (it's already gone in the state)
    if (anim && anim.push && anim.push.into && k < 1) {
      const sz = 1 - e * 0.5;
      ctx.save();
      const ix = lerp(cx(anim.push.from), cx(anim.push.to), e) * TS + TS / 2, iy = lerp(cy(anim.push.from), cy(anim.push.to), e) * TS + TS / 2;
      ctx.translate(ix, iy); ctx.scale(sz, sz); ctx.translate(-TS / 2, -TS / 2);
      drawIngredient(anim.push.item, 0, 0);
      ctx.restore();
    }
    // crate sliding into water (it already became a bridge in the state)
    if (anim && anim.push && s.floor[anim.push.to] === '=' && k < 1) {
      drawCrate(lerp(cx(anim.push.from), cx(anim.push.to), e) * TS, lerp(cy(anim.push.from), cy(anim.push.to), e) * TS, false);
    }

    // Sabrina sits on top of the floor layer
    for (let i = 0; i < s.floor.length; i++) {
      if (s.floor[i] === 'S' && !(s.won && s.hero === i)) drawSabrina((cx(i) + 0.5) * TS, (cy(i) + 0.5) * TS, TS, t, unlocked);
    }

    // hero
    let hx = cx(s.hero), hy = cy(s.hero);
    if (anim) { hx = lerp(cx(anim.from), hx, e); hy = lerp(cy(anim.from), hy, e); }
    heroCol = hx;
    const swing = Math.max(0, 1 - (t - swingAnim) / 220);
    const heroX = (hx + 0.5) * TS, heroY = (hy + 0.5) * TS - (anim ? Math.sin(e * Math.PI) * TS * 0.06 : 0);
    if (s.won && s.floor[s.hero] === 'S') {
      drawSabrina(heroX + TS * 0.2, heroY, TS, t, true);
      drawHero(heroX - TS * 0.2, heroY, 'right', TS, t, {});
    } else if (!(s.won && s.floor[s.hero] === 'D' && t - wonAt > 300)) {
      if (s.dead) { ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t / 50); }
      drawHero(heroX, heroY, s.dir, TS, t, { walking: !!anim, hammer: s.swings > 0, swing });
      ctx.globalAlpha = 1;
    }

    // particles
    particles = particles.filter(p => p.life > 0);
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy; p.vy += p.g ?? 0.12; p.life -= p.decay ?? 0.025;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      if (p.round) { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.6 - p.life * 0.6), 0, 7); ctx.fill(); }
      else ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // zap flash
    if (zapAt) {
      const a = Math.max(0, 0.45 - (t - zapAt) / 800);
      if (a > 0) { ctx.fillStyle = `rgba(255,60,40,${a})`; ctx.fillRect(0, 0, s.w * TS, s.h * TS); }
    }
    // win glow
    if (wonAt) {
      const a = Math.min(0.35, (t - wonAt) / 1500);
      ctx.fillStyle = `rgba(242,196,90,${a})`; ctx.fillRect(0, 0, s.w * TS, s.h * TS);
      if (Math.random() < 0.3) burst(s.hero, ['#f2c45a', '#ff6f98', '#fff'], 2, 3);
    }
  }

  function drawFinale(t) {
    const fc = document.getElementById('finaleArt');
    if (!fc) return;
    const f = fc.getContext('2d');
    ctx = f;
    f.clearRect(0, 0, fc.width, fc.height);
    const el = t - finaleStart;
    for (let k = 0; k < 6; k++) {
      const p = ((el / 1600) + k / 6) % 1;
      drawHeart(40 + k * 36 + Math.sin(el / 500 + k) * 6, 110 - p * 100, 7, 1 - p);
    }
    drawHero(100, 70, 'right', 80, t, {});
    drawSabrina(160, 70, 80, t, false);
    ctx = boardCtx;
  }


  // ---------- tower view ----------
  // A cutaway of Thornspire Tower beside the board: every floor, the stairs between them,
  // and a little hero who walks along with you and climbs up when a floor is cleared.
  const towerCanvas = $('tower');
  const towerCtx = towerCanvas.getContext('2d');
  let towerShown = false, towerW = 0, towerH = 0;
  let heroCol = 1;                                   // hero's column on the board, mid-tween
  const tHero = { floor: -1, u: null, dir: 'right', lastT: 0 }; // u = 0..1 across the floor
  let climb = null;
  const CLIMB_UP_MS = 1100, CLIMB_OFF_MS = 260;

  // Stairs on even floors hug the right wall and rise leftwards; odd floors mirror that.
  const stairOf = i => i % 2 === 0
    ? { bottom: 0.93, top: 0.7, land: 0.62, hole: [0.68, 1] }
    : { bottom: 0.07, top: 0.3, land: 0.38, hole: [0, 0.32] };
  // Where the hero can stand on floor i (not over the stairwell coming up from below).
  function walkRange(i) {
    if (i === 0) return [0.1, 0.9];
    return (i - 1) % 2 === 0 ? [0.1, 0.64] : [0.36, 0.9];
  }
  function colToU(i, col, w) {
    const [lo, hi] = walkRange(i);
    return lerp(lo, hi, Math.max(0, Math.min(1, (col - 1) / (w - 3))));
  }
  const SABRINA_U = (() => {
    const last = LEVELS.length - 1, map = LEVELS[last].map;
    for (const row of map) { const c = row.indexOf('S'); if (c >= 0) return colToU(last, c, row.length); }
    return 0.5;
  })();

  function towerLayout() {
    const W = towerW, H = towerH;
    const ground = H * 0.05, roof = H * 0.17;
    const pad = Math.round(W * 0.05), wt = Math.max(6, Math.round(W * 0.06));
    const fh = (H - ground - roof) / LEVELS.length;
    const ix0 = pad + wt, ix1 = W - pad - wt, iw = ix1 - ix0;
    const st = Math.max(3, fh * 0.08);
    return {
      W, H, ground, roof, pad, wt, fh, ix0, ix1, iw, st,
      top: i => H - ground - (i + 1) * fh,          // top edge of floor i's band
      floorY: i => H - ground - i * fh - st,        // where feet stand on floor i
      X: u => ix0 + u * iw,
    };
  }

  function startClimb() {
    const i = levelIndex, sp = stairOf(i);
    const u0 = tHero.u ?? sp.bottom;
    const walk = Math.max(150, Math.abs(u0 - sp.bottom) * 1100);
    climb = { floor: i, start: performance.now(), u0, walk, sp };
    for (let k = 0; k < 6; k++) tone(330 + k * 55, 0.06, 'triangle', 0.04, (walk + (k + 0.6) * CLIMB_UP_MS / 6) / 1000);
    return walk + CLIMB_UP_MS + CLIMB_OFF_MS;
  }

  // Where the tower hero is this frame: { floor, u, y (feet), dir, walking }.
  function towerHeroPose(t, L) {
    if (climb) {
      const c = climb, sp = c.sp, el = t - c.start, i = c.floor;
      if (el < c.walk) {
        const p = el / c.walk;
        return { floor: i, u: lerp(c.u0, sp.bottom, p), y: L.floorY(i), dir: sp.bottom > c.u0 ? 'right' : 'left', walking: true };
      }
      if (el < c.walk + CLIMB_UP_MS) {
        const p = (el - c.walk) / CLIMB_UP_MS, n = 6;
        const q = (Math.floor(p * n) + ease((p * n) % 1)) / n; // step by step
        return { floor: i, u: lerp(sp.bottom, sp.top, q), y: lerp(L.floorY(i), L.floorY(i + 1), q), dir: sp.top > sp.bottom ? 'right' : 'left', walking: true };
      }
      if (el < c.walk + CLIMB_UP_MS + CLIMB_OFF_MS) {
        const p = (el - c.walk - CLIMB_UP_MS) / CLIMB_OFF_MS;
        return { floor: i + 1, u: lerp(sp.top, sp.land, p), y: L.floorY(i + 1), dir: sp.land > sp.top ? 'right' : 'left', walking: true };
      }
      tHero.floor = i + 1; tHero.u = sp.land; tHero.dir = sp.land > sp.top ? 'right' : 'left';
      climb = null;
    }
    // Follow the hero on the board, easing so steps look like walking.
    const f = tHero.floor;
    let target = tHero.u ?? 0.5;
    if (f === levelIndex) target = colToU(f, heroCol, state.w);
    if (tHero.u == null) tHero.u = target;
    const dt = Math.min(100, t - (tHero.lastT || t));
    const d = target - tHero.u;
    tHero.u += d * (1 - Math.exp(-dt / 70));
    const walking = Math.abs(d) > 0.004;
    if (walking) tHero.dir = d > 0 ? 'right' : 'left';
    else if (f === levelIndex && state.dir !== tHero.dir && !state.won) tHero.dir = state.dir;
    return { floor: f, u: tHero.u, y: L.floorY(f), dir: tHero.dir, walking };
  }

  function drawTowerStairs(L, i) {
    const sp = stairOf(i);
    const xb = L.X(sp.bottom + (sp.bottom > sp.top ? 0.05 : -0.05)), xt = L.X(sp.top);
    const yb = L.floorY(i), yt = L.floorY(i + 1), n = 6;
    const xs = k => lerp(xb, xt, k / n), ys = k => lerp(yb, yt, k / n);
    // treads and risers
    ctx.fillStyle = '#8a5a33';
    ctx.beginPath(); ctx.moveTo(xb, yb);
    for (let k = 1; k <= n; k++) { ctx.lineTo(xs(k - 1), ys(k)); ctx.lineTo(xs(k), ys(k)); }
    const thick = L.fh * 0.12;
    ctx.lineTo(xt, yt + thick); ctx.lineTo(xb + (xt - xb) * 0.12, yb); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#4a2f1a'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#c08a52';
    for (let k = 1; k <= n; k++) ctx.fillRect(Math.min(xs(k - 1), xs(k)), ys(k), Math.abs(xs(k) - xs(k - 1)), Math.max(1.5, L.fh * 0.025));
  }

  function drawTower(t) {
    const L = towerLayout();
    const n = LEVELS.length;
    ctx = towerCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, L.W, L.H);
    const pose = towerHeroPose(t, L);
    const here = pose.floor;
    const reached = Math.max(progress.unlocked - 1, levelIndex, here);

    // back walls, seen through the cutaway
    for (let i = 0; i < n; i++) {
      const y0 = L.top(i), pal = PALETTES[i] || PALETTES[0];
      ctx.fillStyle = pal.wall; ctx.fillRect(L.ix0, y0, L.iw, L.fh);
      ctx.fillStyle = pal.mortar;
      const rows = 4, bh = L.fh / rows, bw = Math.max(14, L.iw / 6);
      for (let r = 0; r < rows; r++) {
        const yy = y0 + r * bh;
        ctx.fillRect(L.ix0, yy, L.iw, 1);
        for (let x = L.ix0 + (r % 2 ? bw / 2 : 0); x < L.ix1; x += bw) ctx.fillRect(x, yy, 1, bh);
      }
      // arched window with a bit of night sky
      const ww = Math.min(L.iw * 0.13, L.fh * 0.26), wh = ww * 1.4, wx = L.X(0.5) - ww / 2, wy = y0 + L.fh * 0.14;
      ctx.beginPath(); ctx.moveTo(wx, wy + wh); ctx.lineTo(wx, wy + ww / 2); ctx.arc(wx + ww / 2, wy + ww / 2, ww / 2, Math.PI, 0); ctx.lineTo(wx + ww, wy + wh); ctx.closePath();
      ctx.fillStyle = '#18214d'; ctx.fill();
      ctx.strokeStyle = pal.hi; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fff9'; ctx.fillRect(wx + ww * (0.25 + 0.4 * hash(i, 3)), wy + wh * (0.3 + 0.3 * hash(3, i)), 1.5, 1.5);
      // a warm torch glow on the floor the hero is on
      if (i === here) {
        const g = ctx.createRadialGradient(L.X(0.5), y0 + L.fh * 0.5, 2, L.X(0.5), y0 + L.fh * 0.5, L.iw * 0.6);
        g.addColorStop(0, `rgba(242,196,90,${0.28 + 0.05 * Math.sin(t / 300)})`); g.addColorStop(1, 'rgba(242,196,90,0)');
        ctx.fillStyle = g; ctx.fillRect(L.ix0, y0, L.iw, L.fh);
      }
    }

    for (let i = 0; i < n - 1; i++) drawTowerStairs(L, i);

    // floor slabs, with an opening where the stairs come up
    for (let i = 0; i < n; i++) {
      const y = L.floorY(i), pal = PALETTES[i] || PALETTES[0];
      const segs = i === 0 ? [[0, 1]] : (() => { const h = stairOf(i - 1).hole; return h[0] === 0 ? [[h[1], 1]] : [[0, h[0]]]; })();
      for (const [a, b] of segs) {
        ctx.fillStyle = '#251d33'; ctx.fillRect(L.X(a), y, L.X(b) - L.X(a), L.st);
        ctx.fillStyle = pal.hi; ctx.fillRect(L.X(a), y, L.X(b) - L.X(a), 1.5);
      }
    }

    // floors not reached yet sit in shadow
    for (let i = reached + 1; i < n; i++) {
      ctx.fillStyle = 'rgba(10,7,20,0.6)'; ctx.fillRect(L.ix0, L.top(i), L.iw, L.fh);
    }

    // floor numbers, with a tick for floors already cleared
    ctx.font = `800 ${Math.max(10, Math.round(L.fh * 0.2))}px Nunito, system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    for (let i = 0; i < n; i++) {
      const done = progress.best[String(i)] != null;
      ctx.fillStyle = i === here ? '#f2c45a' : i <= reached ? '#d8cbe8' : '#8a7ca2';
      const label = String(i + 1) + (done ? ' ✓' : '');
      const lx = i % 2 === 0 ? L.ix0 + 4 : L.ix1 - 4 - ctx.measureText(label).width;
      ctx.fillText(label, lx, L.top(i) + 4);
    }

    // outer walls, cut open so we can see inside
    for (const x of [L.pad, L.ix1]) {
      ctx.fillStyle = '#3d3058'; ctx.fillRect(x, L.roof, L.wt, L.H - L.roof - L.ground);
      ctx.fillStyle = '#2a2142';
      for (let y = L.roof + 6; y < L.H - L.ground; y += 10) ctx.fillRect(x, y, L.wt, 1);
      ctx.fillStyle = '#5a4a7a'; ctx.fillRect(x === L.pad ? x + L.wt - 1.5 : x, L.roof, 1.5, L.H - L.roof - L.ground);
    }

    // roof and flag
    const apexY = L.roof * 0.28, ledge = 6;
    ctx.fillStyle = '#5a4a7a'; ctx.fillRect(2, L.roof - ledge, L.W - 4, ledge + 1);
    ctx.fillStyle = '#c04a6a';
    ctx.beginPath(); ctx.moveTo(L.pad * 0.6, L.roof - ledge); ctx.lineTo(L.W / 2, apexY); ctx.lineTo(L.W - L.pad * 0.6, L.roof - ledge); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#9c3654';
    ctx.beginPath(); ctx.moveTo(L.W / 2, apexY); ctx.lineTo(L.W - L.pad * 0.6, L.roof - ledge); ctx.lineTo(L.W / 2, L.roof - ledge); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#f2c45a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(L.W / 2, apexY); ctx.lineTo(L.W / 2, 2); ctx.stroke();
    const wave = Math.sin(t / 260);
    ctx.fillStyle = '#ff6f98';
    ctx.beginPath(); ctx.moveTo(L.W / 2, 3); ctx.quadraticCurveTo(L.W / 2 + 10, 3 + wave * 3, L.W / 2 + 20, 7 + wave * 2); ctx.quadraticCurveTo(L.W / 2 + 10, 10 + wave * 3, L.W / 2, 12); ctx.closePath(); ctx.fill();

    // ground
    ctx.fillStyle = '#1b1430';
    ctx.beginPath(); ctx.moveTo(0, L.H); ctx.lineTo(0, L.H - L.ground * 0.5); ctx.quadraticCurveTo(L.W / 2, L.H - L.ground * 1.5, L.W, L.H - L.ground * 0.5); ctx.lineTo(L.W, L.H); ctx.closePath(); ctx.fill();

    // Sabrina waits on the top floor; the hero joins her when she's saved
    const s = L.fh * 0.62, last = n - 1;
    const together = here === last && levelIndex === last && state.won && state.floor[state.hero] === 'S';
    if (together) {
      const x = L.X(pose.u);
      drawSabrina(x + s * 0.24, L.floorY(last) - s * 0.38, s, t, true);
      drawHero(x - s * 0.24, pose.y - s * 0.36, 'right', s, t, {});
    } else {
      drawSabrina(L.X(SABRINA_U), L.floorY(last) - s * 0.38, s, t, here === last);
      drawHero(L.X(pose.u), pose.y - s * 0.36, pose.dir, s, t, { walking: pose.walking });
    }

    tHero.lastT = t;
    ctx = boardCtx;
  }

  function runQueued() {
    if (!queued) return;
    const q = queued; queued = null;
    if (q.type === 'move') tryMove(q.dir); else trySmash();
  }

  function frame(t) {
    if (state) { draw(t); if (towerShown) drawTower(t); }
    if (screen === 'finale') drawFinale(t);
    requestAnimationFrame(frame);
  }

  // ---------- input ----------
  const KEYDIR = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  window.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const dir = KEYDIR[e.code];
    if (screen === 'play') {
      if (dir) { e.preventDefault(); tryMove(dir); }
      else if (e.code === 'Space' || e.code === 'KeyX') { e.preventDefault(); if (!e.repeat) trySmash(); }
      else if (e.code === 'KeyZ' || e.code === 'Backspace' || e.code === 'KeyU') { e.preventDefault(); undo(); }
      else if (e.code === 'KeyR' && !e.repeat) restart();
      else if (e.code === 'KeyM') toggleMute();
      else if (e.code === 'KeyN') toggleMusic();
      else if (e.code === 'Escape') showTitle();
    } else if ((e.code === 'Enter' || e.code === 'Space') && !e.repeat) {
      e.preventDefault();
      const btn = overlay.querySelector('button.primary');
      if (btn) btn.click();
    } else if (e.code === 'Escape' && screen === 'intro') {
      showTitle();
    }
  });

  function toggleMute() {
    muted = !muted;
    store.set('sabrina.muted', muted);
    if (!muted) audio();
    refreshMusic();
    updateHud();
  }

  function toggleMusic() {
    musicOn = !musicOn;
    store.set('sabrina.music', musicOn);
    if (musicOn && muted) { muted = false; store.set('sabrina.muted', false); audio(); } // turning music on means sound on too
    refreshMusic();
    updateHud();
  }

  $('undoBtn').onclick = e => { e.currentTarget.blur(); undo(); };
  $('restartBtn').onclick = e => { e.currentTarget.blur(); restart(); };
  $('muteBtn').onclick = e => { e.currentTarget.blur(); toggleMute(); };
  $('musicBtn').onclick = e => { e.currentTarget.blur(); toggleMusic(); };
  $('menuBtn').onclick = e => { e.currentTarget.blur(); showTitle(); };
  $('padSmash').onclick = trySmash;
  $('padUndo').onclick = undo;
  document.querySelectorAll('#pad [data-dir]').forEach(b => {
    b.addEventListener('pointerdown', e => { e.preventDefault(); tryMove(b.dataset.dir); });
  });

  // swipe on the board
  let touchStart = null;
  canvas.addEventListener('touchstart', e => { const p = e.touches[0]; touchStart = { x: p.clientX, y: p.clientY }; }, { passive: true });
  canvas.addEventListener('touchend', e => {
    if (!touchStart) return;
    const p = e.changedTouches[0], dx = p.clientX - touchStart.x, dy = p.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) { trySmash(); return; } // tap = hammer
    tryMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  });

  // ---------- boot ----------
  // Shortcut: add ?floor=5 (or #floor=5) to the address to jump straight to that floor.
  // It also unlocks every floor up to that one in the floor picker.
  const jump = parseInt(new URLSearchParams(location.search).get('floor') ?? (location.hash.match(/floor=(\d+)/) || [])[1], 10);
  if (jump >= 1 && jump <= LEVELS.length) {
    progress.unlocked = Math.max(progress.unlocked, jump);
    store.set('sabrina.progress', progress);
    startFloor(jump - 1);
  } else {
    loadLevel(Math.min(progress.unlocked, LEVELS.length) - 1);
    showTitle();
  }
  requestAnimationFrame(frame);
})();
