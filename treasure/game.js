// The Hunt for Sabrina's Treasure — rendering, input, sound and screens. Rules live in logic.js.
(() => {
  const T = window.Treasure;
  const LEVELS = window.TREASURE_LEVELS;
  const $ = id => document.getElementById(id);
  const canvas = $('board');
  const boardCtx = canvas.getContext('2d');
  let ctx = boardCtx; // sprite functions draw here; story pictures briefly point it at their own canvas

  // ---------- saved progress (per-browser convenience only) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };
  let progress = store.get('treasure.progress', { unlocked: 1, best: {} });
  const save = () => store.set('treasure.progress', progress);

  // The secret word written on Celia's map (in the tower game's gem chest). Only a scrambled
  // version lives here, so it isn't sitting in plain sight in the page source.
  const PASS = 1771577969;
  function wordHash(w) {
    let h = 5381;
    for (const ch of w.toUpperCase().replace(/[^A-Z]/g, '')) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
    return h;
  }

  const ISLANDS = [
    { name: 'The Boat House', icon: '⚓', song: 'tBoat', style: 'dock' },
    { name: 'Tiki Island', icon: '🌴', song: 'tTiki', style: 'sand' },
    { name: 'Troll Island', icon: '🔥', song: 'tTroll', style: 'cave' },
  ];
  const STYLE = {
    dock: { a: '#8f6a45', b: '#87633f', line: '#5e4128', wall: '#3e2c22', hi: '#57402f', mortar: '#2a1d16' },
    sand: { a: '#e2c991', b: '#dcc189', line: '#c4a66a', wall: '#2f6b3a', hi: '#3f8a4a', mortar: '#1d4526' },
    cave: { a: '#4e4957', b: '#48434f', line: '#00000022', wall: '#2a2631', hi: '#3c3646', mortar: '#18151d' },
  };

  // ---------- game state ----------
  let levelIndex = 0;
  let state = null;
  let history = [];
  let screen = 'gate'; // gate | title | intro | play | clear | voyage | finale
  let anim = null;     // current move tween
  let queued = null;   // one buffered input while a tween plays
  let particles = [];
  let deadAt = 0, wonAt = 0, lanternAt = 0;
  let brew = null;     // { at, cell }: the punch bowl turning into a key
  let stoneAnims = []; // { cell, at }: trolls turning to stone
  let seen = new Set(); // cells you've already lit up in the dark
  let TS = 48, dpr = 1;
  const MOVE_MS = 110, BREW_MS = 1300, STONE_MS = 900;
  const islandOf = i => ISLANDS[LEVELS[i].island];

  // ---------- sound ----------
  let actx = null, master = null, sfxBus = null, musicBus = null;
  let muted = store.get('sabrina.muted', false);  // shared with the tower game
  let musicOn = store.get('sabrina.music', true);
  function audio() {
    if (muted) return null;
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
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
  // sound started inside that tap.
  let unlocked = false;
  function unlockAudio() {
    const a = audio(); if (!a) return;
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

  const music = window.SabrinaMusic.createPlayer(() => (muted ? null : actx), () => musicBus);
  function wantedSong() {
    if (screen === 'gate' || screen === 'title') return 'tTitle';
    if (screen === 'voyage') return 'tVoyage';
    if (screen === 'finale') return 'tFinale';
    return islandOf(levelIndex).song;
  }
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
    pushfire: () => { noise(0.12, 0.25, 500); noise(0.3, 0.12, 2400, 0.05); },
    splash: () => { noise(0.45, 0.3, 1400); tone(420, 0.3, 'sine', 0.05, 0, 140); },
    board: () => { tone(160, 0.12, 'triangle', 0.06); noise(0.2, 0.15, 900, 0.05); },
    row: () => { noise(0.35, 0.22, 1200); noise(0.35, 0.18, 1000, 0.3); tone(300, 0.25, 'sine', 0.03, 0, 200); },
    roll: () => [0, 0.08, 0.16, 0.24].forEach(w => tone(140 - w * 100, 0.07, 'triangle', 0.05, w)),
    gem: () => { tone(1568, 0.06, 'square', 0.035); tone(2093, 0.16, 'square', 0.035, 0.05); },
    unlock: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.07, i * 0.08)),
    win: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.07, i * 0.1)),
    plop: () => { tone(300, 0.18, 'sine', 0.07, 0, 90); noise(0.25, 0.15, 700, 0.05); tone(520, 0.08, 'sine', 0.04, 0.16); tone(640, 0.08, 'sine', 0.04, 0.24); },
    brew: () => { noise(0.5, 0.25, 3000); [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.06, 0.3 + i * 0.09)); },
    fizzle: () => { noise(0.3, 0.18, 2500); tone(220, 0.2, 'sawtooth', 0.03, 0, 110); },
    key: () => { tone(1319, 0.08, 'triangle', 0.05); tone(1760, 0.18, 'triangle', 0.05, 0.08); },
    unlockdoor: () => { tone(180, 0.06, 'square', 0.05); tone(260, 0.06, 'square', 0.05, 0.07); [523, 784].forEach((f, i) => tone(f, 0.2, 'triangle', 0.06, 0.16 + i * 0.1)); },
    stone: () => { noise(0.6, 0.4, 600); tone(90, 0.5, 'sawtooth', 0.05, 0, 40); noise(0.2, 0.2, 3000, 0.4); },
    grab: () => { tone(90, 0.5, 'sawtooth', 0.08, 0, 60); noise(0.4, 0.3, 500); tone(70, 0.4, 'square', 0.05, 0.1, 45); },
    chestlocked: () => { tone(140, 0.08, 'square', 0.05); tone(120, 0.1, 'square', 0.04, 0.08); },
    chest: () => { tone(240, 0.4, 'sawtooth', 0.025, 0, 380); [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.4, 'triangle', 0.06, 0.35 + i * 0.09)); },
    gatewrong: () => { tone(160, 0.15, 'square', 0.05); tone(120, 0.25, 'square', 0.05, 0.14); },
    gateright: () => [392, 494, 587, 784].forEach((f, i) => tone(f, 0.3, 'triangle', 0.07, i * 0.1)),
  };
  function play(events) { for (const e of new Set(events)) SFX[e] && SFX[e](); }

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
    state = T.parse(LEVELS[i]);
    history = [];
    anim = null; queued = null; particles = [];
    deadAt = 0; wonAt = 0; lanternAt = 0; brew = null; stoneAnims = [];
    seen = new Set();
    drawMenu();
    resize();
    updateHud();
    $('hint').textContent = LEVELS[i].hint;
  }

  function commit(result) {
    history.push(state);
    if (history.length > 2000) history.shift();
    const prev = state;
    state = result.state;
    const now = performance.now();
    const ev = result.events;
    let dur = MOVE_MS;
    if (result.row) dur = Math.max(MOVE_MS, 85 * result.row.length);
    if (result.push && result.push.roll) dur = Math.max(dur, 70 * Math.max(Math.abs(cx(result.push.to) - cx(result.push.from)), Math.abs(cy(result.push.to) - cy(result.push.from))));
    if (result.opened == null) {
      anim = { start: now, dur, from: result.from, to: state.hero, push: result.push, boat: !!result.row, trailFrom: prev.trail };
    }
    if (result.row) result.row.forEach(c => { if (prev.obj[c] === '*') burst(c, ['#f2c45a', '#fff3c4', '#7cc0ff'], 12, 2.2); });
    else if (ev.includes('gem') || ev.includes('unlock')) burst(state.hero, ['#f2c45a', '#fff3c4', '#fff'], 12, 2.2);
    if (ev.includes('splash') && result.push) burst(result.push.to, ['#7cc0ff', '#bfe2ff', '#4a8fd6'], 18, 2.6);
    if (ev.includes('unlock')) showToast(state.floor.includes('J') ? 'Every coin! Now open Celia’s chest!' : 'Every coin! The way on is open!', false, 1800);
    if (ev.includes('board') && !prev.boarded) showToast('All aboard! Paddle out onto the water.', false, 1600);
    if (ev.includes('plop') && !ev.includes('brew')) {
      burst(result.push.to, ['#ff8fb1', '#ffd24a', '#7dff9a'], 14, 2);
      showToast(`Plop! Now the ${T.INGREDIENTS[state.recipe[state.brewed]]}.`, false, 1500);
    }
    if (ev.includes('brew')) {
      burst(result.push.to, ['#ff8fb1', '#ffd24a', '#7dff9a', '#fff'], 26, 3);
      brew = { at: now, cell: result.push.to };
      showToast('Shake, shake, shake! Captain Squawk serves the punch… and drops a key in your hand!', false, 3000);
    }
    if (ev.includes('key')) { burst(state.hero, ['#f2c45a', '#fff3c4'], 12, 2.2); showToast('You got the key!', false, 1400); flashStat('keyStat'); }
    if (ev.includes('unlockdoor')) { burst(state.hero, ['#f2c45a', '#fff3c4', '#c98a3a'], 16, 2.6); showToast('Unlocked!', false, 1200); }
    if (state.stoned) {
      for (const c of state.stoned) { stoneAnims.push({ cell: c, at: now }); burst(c, ['#8d8a92', '#b3afb8', '#ffb34a'], 18, 2.6); }
      showToast(state.stoned.length > 1 ? 'The firelight turns the trolls to stone!' : 'The troll squints in the firelight… and turns to stone!', false, 2200);
    }
    if (ev.includes('brew') || ev.includes('plop')) drawMenu();
    if (state.dead) {
      deadAt = now;
      showToast('A troll grabbed you! Press Z to undo or R to restart.', true);
    }
    if (ev.includes('chest')) {
      lanternAt = now;
      state.floor = state.floor.map(f => (f === 'G' ? 'g' : f)); // the lantern's light reaches every troll
      burst(result.opened, ['#f2c45a', '#fff3c4', '#ffd24a', '#fff'], 36, 3.4);
    }
    if (state.won) {
      wonAt = now;
      recordBest();
      const won = state, last = levelIndex === LEVELS.length - 1;
      setTimeout(() => { if (state === won) last ? showFinale() : showClear(); }, last ? 2200 : 900);
    }
    state.boarded = prev.boarded || ev.includes('board');
    play(ev);
    updateHud();
  }

  function tryMove(dir) {
    if (screen !== 'play' || state.dead || state.won) return;
    if (anim && performance.now() - anim.start < anim.dur) { queued = dir; return; }
    const r = T.step(state, dir);
    if (!r.moved) {
      state = r.state; play(r.events); // just turn to face
      if (r.events.includes('chestlocked')) showToast(`Celia’s chest is locked tight. Find every coin first! (${state.gemsLeft} to go)`, false, 2200);
      if (r.wrong) showToast(`Squawk! The menu says the ${T.INGREDIENTS[r.need]} goes in next.`, true, 2200);
      return;
    }
    commit(r);
  }

  function undo() {
    if (screen !== 'play' || !history.length) return;
    state = history.pop();
    anim = null; queued = null; deadAt = 0; wonAt = 0; lanternAt = 0; brew = null; stoneAnims = [];
    hideToast();
    tone(500, 0.06, 'triangle', 0.04, 0, 300);
    updateHud(); drawMenu();
  }

  function restart() {
    if (screen !== 'play') return;
    const fresh = T.parse(LEVELS[levelIndex]);
    if (state.moves > 0) history.push(state); // restart can itself be undone
    state = fresh;
    anim = null; queued = null; particles = []; deadAt = 0; wonAt = 0; lanternAt = 0; brew = null; stoneAnims = [];
    seen = new Set();
    hideToast();
    tone(300, 0.1, 'triangle', 0.04, 0, 600);
    updateHud(); drawMenu();
  }

  function recordBest() {
    const k = String(levelIndex);
    if (!progress.best[k] || state.moves < progress.best[k]) progress.best[k] = state.moves;
    progress.unlocked = Math.max(progress.unlocked, Math.min(LEVELS.length, levelIndex + 2));
    if (levelIndex === LEVELS.length - 1) progress.found = true;
    save();
  }

  // ---------- HUD & overlays ----------
  function updateHud() {
    if (!state) return;
    const lv = LEVELS[levelIndex];
    $('levelLabel').textContent = `${islandOf(levelIndex).name} · ${lv.name}`;
    $('coins').textContent = state.gemsLeft;
    $('keys').textContent = state.keys;
    $('keyStat').hidden = !lv.recipe && !lv.map.some(r => r.includes('L'));
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
  function flashStat(id) {
    const el = $(id);
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }

  const overlay = $('overlay');
  function setOverlay(html, cls = '') {
    overlay.innerHTML = `<div class="card ${cls}">${html}</div>`;
    overlay.classList.remove('hidden');
  }
  function closeOverlay() { overlay.classList.add('hidden'); overlay.innerHTML = ''; }

  // The dockmaster won't let anyone sail without the secret word from Celia's map.
  function showGate() {
    screen = 'gate';
    hideToast();
    setOverlay(`
      <canvas class="art" id="gateArt" width="300" height="130"></canvas>
      <div class="eyebrow">The Boat House</div>
      <h1>The Hunt for Sabrina’s Treasure</h1>
      <p class="story">A grumpy old dockmaster blocks the gangplank. “Nobody sails without Great-grandmother
      Celia’s map. If you’ve really got it, tell me the <b>secret word</b> written on it.”</p>
      <form id="gateForm" autocomplete="off">
        <input id="gateInput" type="text" placeholder="secret word" aria-label="Secret word" autocapitalize="characters" spellcheck="false" maxlength="24">
        <button class="primary" type="submit">Let me aboard</button>
      </form>
      <p class="nope" id="gateNope"></p>
      <p class="small">No map yet? It’s locked in a gem-covered chest at the top of Thornspire Tower.
      <a href="../">Play Saving Sabrina</a> to find it.</p>
    `, 'gate');
    const input = $('gateInput');
    setTimeout(() => input.focus(), 50);
    let tries = 0;
    $('gateForm').onsubmit = e => {
      e.preventDefault();
      audio();
      if (wordHash(input.value) === PASS && input.value.trim()) {
        progress.pass = true; save();
        SFX.gateright();
        showTitle();
        return;
      }
      tries++;
      SFX.gatewrong();
      const card = overlay.querySelector('.card');
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      $('gateNope').textContent = input.value.trim()
        ? ['“Hmph! That’s not it. No map, no boat!”', '“Nope. Look closer at the map, landlubber!”', '“Still wrong! It’s written on the map in big letters.”'][Math.min(tries - 1, 2)]
        : '“Well? Speak up!”';
      input.select();
    };
    refreshMusic();
  }

  function islandButtons() {
    return ISLANDS.map((isl, k) => `<div class="island-row"><span class="iname">${isl.icon} ${isl.name}</span>` +
      LEVELS.map((lv, i) => {
        if (lv.island !== k) return '';
        const locked = i + 1 > progress.unlocked;
        const best = progress.best[String(i)];
        return `<button data-level="${i}" ${locked ? 'disabled' : ''} title="${lv.name}">${i + 1}${best ? `<span class="best">${best}</span>` : ''}</button>`;
      }).join('') + '</div>').join('');
  }

  function showTitle() {
    if (!progress.pass) { showGate(); return; }
    screen = 'title';
    hideToast();
    setOverlay(`
      <canvas class="art" id="titleArt" width="300" height="130"></canvas>
      <div class="eyebrow">Saving Sabrina, part two</div>
      <h1>The Hunt for Sabrina’s Treasure</h1>
      <p class="story">Princess Sabrina is free! In her gem chest was a map drawn by her great-grandmother
      Celia, the famous inventor. Together, Sabrina and her knight row to three islands to find
      Celia’s long-lost treasure.</p>
      <div class="controls">
        <b>Arrows / WASD</b><span>Walk, push, and paddle the boat</span>
        <b>Z</b><span>Undo a move</span>
        <b>R</b><span>Restart the puzzle</span>
      </div>
      <button class="primary" id="startBtn">${progress.unlocked > 1 ? 'Continue' : 'Set sail'}</button>
      <div class="islands">${islandButtons()}</div>
      ${progress.found ? '<p class="secret">💛 You found Celia’s treasure! Can you do it in fewer moves?</p>' : ''}
      <p class="small"><a href="../">← Back to Thornspire Tower</a></p>
    `);
    $('startBtn').onclick = () => startLevel(Math.min(progress.unlocked, LEVELS.length) - 1);
    overlay.querySelectorAll('[data-level]').forEach(b => b.onclick = () => startLevel(+b.dataset.level));
    refreshMusic();
  }

  function startLevel(i) {
    audio();
    loadLevel(i);
    screen = 'intro';
    const isl = islandOf(i);
    setOverlay(`
      <div class="eyebrow">${isl.icon} ${isl.name} · Puzzle ${i + 1} of ${LEVELS.length}</div>
      <h2>${LEVELS[i].name}</h2>
      <p class="story">${LEVELS[i].hint}</p>
      <button class="primary" id="goBtn">Let’s go</button>
    `);
    $('goBtn').onclick = beginPlay;
    refreshMusic();
  }

  function beginPlay() { closeOverlay(); screen = 'play'; refreshMusic(); }

  const CLEAR_STORY = [
    'The boat bumps the dock and Sabrina laughs. “You’re a much better rower than you are a climber!”',
    '',
    'Ukuleles drift down the beach. Up ahead, a tiki bar glows with paper lanterns.',
    '',
    'In the dark, Sabrina holds your hand a little tighter. You don’t mind one bit.',
    'Carved over a door: <i>“Here lies the treasure of Celia, who lit up the dark.”</i>',
  ];

  function showClear() {
    screen = 'clear';
    hideToast();
    const best = progress.best[String(levelIndex)];
    const next = levelIndex + 1;
    const sail = LEVELS[next].island !== LEVELS[levelIndex].island;
    setOverlay(`
      <div class="eyebrow">${islandOf(levelIndex).name} · puzzle ${levelIndex + 1} solved</div>
      <h2>${sail ? 'Back to the boat!' : 'Onward!'}</h2>
      <p>You finished <b>${LEVELS[levelIndex].name}</b> in <b>${state.moves}</b> moves${best && best < state.moves ? ` (best: ${best})` : ''}.</p>
      ${levelIndex === 3 ? '<p class="story">Captain Squawk, the parrot bartender, hands you a flaming tiki torch. “Squawk! You’ll need this where you’re going. Trolls hate the light!”</p>' : ''}
      ${CLEAR_STORY[levelIndex] ? `<p class="story">${CLEAR_STORY[levelIndex]}</p>` : ''}
      <button class="primary" id="nextBtn">${sail ? 'Set sail' : 'Next puzzle'}</button>
    `);
    SFX.win();
    $('nextBtn').onclick = () => (sail ? showVoyage(next) : startLevel(next));
  }

  // Sailing from one island to the next.
  const VOYAGE_STORY = {
    1: 'Sabrina unrolls Celia’s map. The dotted line leads across the bay to a little island with a grass hut, and music drifting over the water…',
    2: 'The last island on the map is dark and rocky. The big red X is painted right over the mouth of a cave. From deep inside comes a grumbly, rumbly snore.',
  };
  let voyage = null;
  function showVoyage(next) {
    screen = 'voyage';
    hideToast();
    voyage = { at: performance.now(), from: LEVELS[next - 1].island, to: LEVELS[next].island };
    setOverlay(`
      <div class="eyebrow">Sailing to ${ISLANDS[LEVELS[next].island].name}</div>
      <canvas class="art" id="voyageArt" width="320" height="150"></canvas>
      <p class="story">${VOYAGE_STORY[LEVELS[next].island]}</p>
      <button class="primary" id="landBtn">Land ho!</button>
    `);
    $('landBtn').onclick = () => startLevel(next);
    refreshMusic();
  }

  function showFinale() {
    screen = 'finale';
    hideToast();
    const total = LEVELS.reduce((a, lv, i) => a + (progress.best[String(i)] || 0), 0);
    setOverlay(`
      <div class="eyebrow">Celia’s treasure, found at last</div>
      <h1>The Everglow Lantern!</h1>
      <canvas class="art" id="finaleArt" width="300" height="160"></canvas>
      <p class="story">Under a heap of gold coins is Great-grandmother Celia’s greatest invention: a lantern that has
      glowed for a hundred years and never once gone out. Its golden light fills the cave, and every last
      troll turns to stone.</p>
      <p class="story">Sabrina hugs her knight. “Great-grandmother Celia always said the best treasure is someone
      to share it with.” The knight turns as pink as a paper umbrella.</p>
      <p>Your best runs add up to <b>${total}</b> moves. Can you find the treasure in fewer?</p>
      <button class="primary" id="againBtn">The End</button>
    `);
    SFX.chest();
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

  // ---------- drawing: terrain ----------
  const fitTS = (w, h) => Math.max(20, Math.min(64, Math.floor(Math.min(w / state.w, h / state.h))));
  function resize() {
    if (!state) return;
    const stage = $('stage');
    TS = fitTS(stage.clientWidth - 8, stage.clientHeight - 8);
    dpr = window.devicePixelRatio || 1;
    canvas.width = state.w * TS * dpr;
    canvas.height = state.h * TS * dpr;
    canvas.style.width = state.w * TS + 'px';
    canvas.style.height = state.h * TS + 'px';
  }
  window.addEventListener('resize', resize);

  function drawFloor(x, y, st) {
    const px = x * TS, py = y * TS, pal = STYLE[st];
    ctx.fillStyle = (x + y) % 2 ? pal.a : pal.b;
    ctx.fillRect(px, py, TS, TS);
    if (st === 'dock') { // planks
      ctx.strokeStyle = pal.line; ctx.lineWidth = Math.max(1, TS / 28);
      for (let k = 1; k < 3; k++) { ctx.beginPath(); ctx.moveTo(px, py + k * TS / 3); ctx.lineTo(px + TS, py + k * TS / 3); ctx.stroke(); }
      const off = hash(x, y) * TS * 0.6 + TS * 0.2;
      ctx.beginPath(); ctx.moveTo(px + off, py); ctx.lineTo(px + off, py + TS / 3); ctx.stroke();
      ctx.fillStyle = '#3a2818';
      ctx.fillRect(px + TS * 0.08, py + TS * 0.14, TS * 0.04, TS * 0.04); ctx.fillRect(px + TS * 0.88, py + TS * 0.8, TS * 0.04, TS * 0.04);
    } else if (st === 'sand') { // speckles
      ctx.fillStyle = pal.line;
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(px + TS * hash(x * 5 + k, y), py + TS * hash(y * 3 + k, x), TS * 0.025, 0, 7); ctx.fill(); }
      if (hash(x, y) > 0.86) { // a tiny shell
        ctx.fillStyle = '#f7d9d0'; ctx.beginPath(); ctx.arc(px + TS * 0.7, py + TS * 0.3, TS * 0.06, Math.PI, 0); ctx.fill();
      }
    } else {
      ctx.strokeStyle = '#0000001c'; ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, TS - 1, TS - 1);
      if (hash(x, y) > 0.82) {
        ctx.fillStyle = '#00000018';
        ctx.beginPath(); ctx.arc(px + TS * (0.3 + hash(y, x) * 0.4), py + TS * 0.6, TS * 0.06, 0, 7); ctx.fill();
      }
    }
  }

  function drawWall(x, y, st) {
    const px = x * TS, py = y * TS, pal = STYLE[st];
    if (st === 'sand') { // jungle: a thick tangle of leaves
      ctx.fillStyle = pal.mortar; ctx.fillRect(px, py, TS, TS);
      for (let k = 0; k < 5; k++) {
        const lx = px + TS * (0.15 + hash(x * 7 + k, y * 3) * 0.7), ly = py + TS * (0.15 + hash(y * 5 + k, x * 2) * 0.7);
        ctx.fillStyle = k % 2 ? pal.wall : pal.hi;
        ctx.beginPath(); ctx.ellipse(lx, ly, TS * 0.3, TS * 0.2, hash(k, x + y) * 3, 0, 7); ctx.fill();
      }
      if (hash(x * 3, y * 7) > 0.85) { ctx.fillStyle = '#ff6f98'; ctx.beginPath(); ctx.arc(px + TS * 0.5, py + TS * 0.45, TS * 0.07, 0, 7); ctx.fill(); }
      return;
    }
    ctx.fillStyle = pal.mortar; ctx.fillRect(px, py, TS, TS);
    if (st === 'dock') { // boat house: dark wooden boards
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = hash(x * 3 + k, y) > 0.6 ? pal.hi : pal.wall;
        ctx.fillRect(px + k * TS / 3 + 1, py, TS / 3 - 2, TS);
      }
    } else {
      const rows = 3, bh = TS / rows;
      for (let r = 0; r < rows; r++) {
        const off = (r + y) % 2 ? TS / 2 : 0;
        for (let k = -1; k < 2; k++) {
          const bx = px + k * TS + off, bw = TS - 3;
          const sx = Math.max(px, bx + 1.5), ex = Math.min(px + TS, bx + bw);
          if (ex <= sx) continue;
          ctx.fillStyle = hash(x * 3 + k, y * 3 + r) > 0.7 ? pal.hi : pal.wall;
          ctx.fillRect(sx, py + r * bh + 1.5, ex - sx, bh - 3);
        }
      }
    }
    const below = (y + 1) * state.w + x;
    if (y + 1 < state.h && state.floor[below] !== '#') { ctx.fillStyle = '#00000055'; ctx.fillRect(px, py + TS - 4, TS, 4); }
  }

  function drawWater(x, y, t) {
    const px = x * TS, py = y * TS;
    const g = ctx.createLinearGradient(px, py, px, py + TS);
    g.addColorStop(0, '#2a7fb3'); g.addColorStop(1, '#1b5a8a');
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

  // ---------- drawing: things ----------
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

  function drawCoin(px, py, t, i, onWater) {
    const bob = Math.sin(t / 300 + i) * TS * 0.05;
    const c = px + TS / 2, m = py + TS / 2 + bob, r = TS * 0.24;
    const spin = Math.abs(Math.cos(t / 500 + i));
    if (onWater) { ctx.strokeStyle = '#cfe9ff88'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(c, py + TS * 0.78, TS * 0.3, TS * 0.08, 0, 0, 7); ctx.stroke(); }
    else { ctx.fillStyle = '#00000033'; ctx.beginPath(); ctx.ellipse(c, py + TS * 0.82, r * 0.8, r * 0.25, 0, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#a87a22'; ctx.beginPath(); ctx.ellipse(c + TS * 0.02, m, r * Math.max(0.2, spin), r, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#f2c45a'; ctx.beginPath(); ctx.ellipse(c, m, r * Math.max(0.15, spin), r, 0, 0, 7); ctx.fill();
    if (spin > 0.4) {
      ctx.strokeStyle = '#c9952e'; ctx.lineWidth = Math.max(1, TS / 30);
      ctx.beginPath(); ctx.ellipse(c, m, r * 0.6 * spin, r * 0.6, 0, 0, 7); ctx.stroke();
      ctx.fillStyle = '#c9952e'; ctx.font = `900 ${Math.round(TS * 0.24)}px Nunito, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.save(); ctx.translate(c, m); ctx.scale(spin, 1); ctx.fillText('C', 0, TS * 0.01); ctx.restore();
    }
    ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t / 200 + i * 3);
    ctx.beginPath(); ctx.arc(c - r * 0.3 * spin, m - r * 0.5, TS * 0.035, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
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

  // A bamboo gate with a padlock.
  function drawLockedGate(px, py) {
    for (let k = 0; k < 4; k++) {
      const xx = px + TS * (0.12 + k * 0.22);
      ctx.fillStyle = k % 2 ? '#b89a4a' : '#c8aa5a'; rr(xx, py + TS * 0.04, TS * 0.17, TS * 0.92, TS * 0.06); ctx.fill();
      ctx.fillStyle = '#8a7030'; ctx.fillRect(xx, py + TS * 0.3, TS * 0.17, TS * 0.03); ctx.fillRect(xx, py + TS * 0.66, TS * 0.17, TS * 0.03);
    }
    ctx.fillStyle = '#7a5a2a'; ctx.fillRect(px + TS * 0.06, py + TS * 0.42, TS * 0.88, TS * 0.08);
    ctx.fillStyle = '#f2c45a'; rr(px + TS * 0.38, py + TS * 0.44, TS * 0.24, TS * 0.22, TS * 0.04); ctx.fill();
    ctx.strokeStyle = '#f2c45a'; ctx.lineWidth = Math.max(1.5, TS / 24);
    ctx.beginPath(); ctx.arc(px + TS / 2, py + TS * 0.44, TS * 0.07, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = '#3a2410'; ctx.beginPath(); ctx.arc(px + TS / 2, py + TS * 0.53, TS * 0.03, 0, 7); ctx.fill();
  }

  // The way out: a dock post with a flag (on the islands) or a tunnel mouth (in the caves).
  function drawExit(px, py, open, t, st) {
    if (st === 'cave') {
      const m = TS * 0.14;
      ctx.beginPath();
      ctx.moveTo(px + m, py + TS); ctx.lineTo(px + m, py + TS * 0.45);
      ctx.arc(px + TS / 2, py + TS * 0.45, TS / 2 - m, Math.PI, 0); ctx.lineTo(px + TS - m, py + TS); ctx.closePath();
      if (open) {
        const glow = 0.6 + 0.4 * Math.sin(t / 250);
        ctx.fillStyle = '#2a1d10'; ctx.fill();
        ctx.save(); ctx.clip();
        for (let k = 0; k < 4; k++) { ctx.fillStyle = `rgba(242,196,90,${(0.35 + k * 0.15) * glow})`; ctx.fillRect(px, py + TS * (0.42 + k * 0.15), TS, TS * 0.1); }
        ctx.restore();
        ctx.shadowColor = '#f2c45a'; ctx.shadowBlur = TS * 0.4 * glow;
        ctx.strokeStyle = '#f2c45a'; ctx.lineWidth = Math.max(2, TS / 16); ctx.stroke(); ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = '#0d0a12'; ctx.fill();
        ctx.strokeStyle = '#6a6474'; ctx.lineWidth = Math.max(2, TS / 18); ctx.stroke();
        ctx.strokeStyle = '#8b8798'; ctx.lineWidth = Math.max(2, TS / 14);
        for (let k = 0; k < 3; k++) { const xx = px + TS * (0.3 + k * 0.2); ctx.beginPath(); ctx.moveTo(xx, py + TS * 0.2); ctx.lineTo(xx, py + TS); ctx.stroke(); }
      }
      return;
    }
    // dock post and flag
    const c = px + TS * 0.38;
    if (open) { const g = ctx.createRadialGradient(px + TS / 2, py + TS / 2, 2, px + TS / 2, py + TS / 2, TS * 0.6); g.addColorStop(0, `rgba(242,196,90,${0.45 + 0.2 * Math.sin(t / 250)})`); g.addColorStop(1, 'rgba(242,196,90,0)'); ctx.fillStyle = g; ctx.fillRect(px, py, TS, TS); }
    ctx.fillStyle = '#00000040'; ctx.beginPath(); ctx.ellipse(c, py + TS * 0.88, TS * 0.18, TS * 0.06, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#6b4a2a'; ctx.fillRect(c - TS * 0.04, py + TS * 0.12, TS * 0.08, TS * 0.76);
    ctx.fillStyle = '#e8dcc0'; ctx.beginPath(); ctx.arc(c, py + TS * 0.12, TS * 0.05, 0, 7); ctx.fill();
    if (open) {
      const wave = Math.sin(t / 160) * TS * 0.05;
      ctx.fillStyle = '#ff6f98';
      ctx.beginPath(); ctx.moveTo(c + TS * 0.04, py + TS * 0.15);
      ctx.quadraticCurveTo(c + TS * 0.25, py + TS * 0.12 + wave, c + TS * 0.46, py + TS * 0.2);
      ctx.lineTo(c + TS * 0.46, py + TS * 0.42);
      ctx.quadraticCurveTo(c + TS * 0.25, py + TS * 0.36 + wave, c + TS * 0.04, py + TS * 0.4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f2c45a'; ctx.beginPath(); ctx.arc(c + TS * 0.25, py + TS * 0.28 + wave * 0.5, TS * 0.05, 0, 7); ctx.fill();
    } else { // flag rolled up on the pole
      ctx.fillStyle = '#9a8a96'; rr(c + TS * 0.04, py + TS * 0.16, TS * 0.08, TS * 0.36, TS * 0.03); ctx.fill();
    }
  }

  function drawBoat(px, py, t, riders) {
    const c = px + TS / 2, bob = Math.sin(t / 380) * TS * 0.03, base = py + TS * 0.62 + bob;
    ctx.fillStyle = '#00000030'; ctx.beginPath(); ctx.ellipse(c, py + TS * 0.84, TS * 0.42, TS * 0.08, 0, 0, 7); ctx.fill();
    // oars
    ctx.strokeStyle = '#c9a26a'; ctx.lineWidth = Math.max(1.5, TS / 22);
    const sw = Math.sin(t / 300) * TS * 0.05;
    ctx.beginPath(); ctx.moveTo(c - TS * 0.2, base - TS * 0.06); ctx.lineTo(c - TS * 0.52, base + TS * 0.12 + sw); ctx.moveTo(c + TS * 0.2, base - TS * 0.06); ctx.lineTo(c + TS * 0.52, base + TS * 0.12 - sw); ctx.stroke();
    // inside of the hull
    ctx.fillStyle = '#5a3a20'; ctx.beginPath(); ctx.ellipse(c, base - TS * 0.04, TS * 0.38, TS * 0.12, 0, 0, 7); ctx.fill();
    // riders sit in the boat
    const n = riders.length;
    riders.forEach((who, k) => {
      const ox = n === 2 ? (k ? TS * 0.15 : -TS * 0.15) : 0, s = TS * 0.68;
      if (who === 'hero') drawHero(c + ox, base - TS * 0.22, n === 2 ? 'right' : 'down', s, t, {});
      else drawSabrina(c + ox, base - TS * 0.22, s, t, false);
    });
    // front of the hull
    ctx.fillStyle = '#9a6234';
    ctx.beginPath(); ctx.moveTo(c - TS * 0.44, base - TS * 0.06);
    ctx.quadraticCurveTo(c, base + TS * 0.34, c + TS * 0.44, base - TS * 0.06);
    ctx.lineTo(c + TS * 0.38, base - TS * 0.02); ctx.quadraticCurveTo(c, base + TS * 0.08, c - TS * 0.38, base - TS * 0.02); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7a4a26';
    ctx.beginPath(); ctx.moveTo(c - TS * 0.44, base - TS * 0.06); ctx.quadraticCurveTo(c, base + TS * 0.34, c + TS * 0.44, base - TS * 0.06);
    ctx.quadraticCurveTo(c, base + TS * 0.2, c - TS * 0.44, base - TS * 0.06); ctx.fill();
    ctx.strokeStyle = '#e8dcc0'; ctx.lineWidth = Math.max(1, TS / 30);
    ctx.beginPath(); ctx.moveTo(c - TS * 0.3, base + TS * 0.07); ctx.quadraticCurveTo(c, base + TS * 0.2, c + TS * 0.3, base + TS * 0.07); ctx.stroke();
  }

  function drawCoconut(px, py, spin = 0, floating = false, t = 0) {
    const c = px + TS / 2, m = py + TS * (floating ? 0.55 : 0.52) + (floating ? Math.sin(t / 400 + px) * TS * 0.03 : 0), r = TS * 0.27;
    if (floating) { ctx.strokeStyle = '#cfe9ffaa'; ctx.lineWidth = Math.max(1.5, TS / 26); ctx.beginPath(); ctx.ellipse(c, m + r * 0.5, r * 1.3, r * 0.4, 0, 0, 7); ctx.stroke(); }
    else { ctx.fillStyle = '#00000040'; ctx.beginPath(); ctx.ellipse(c, py + TS * 0.84, r, r * 0.3, 0, 0, 7); ctx.fill(); }
    const g = ctx.createRadialGradient(c - r * 0.3, m - r * 0.3, 1, c, m, r);
    g.addColorStop(0, '#9a6a3c'); g.addColorStop(1, '#5a3a1e');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c, m, r, 0, 7); ctx.fill();
    ctx.strokeStyle = '#3e2612'; ctx.lineWidth = Math.max(1, TS / 40);
    for (let k = 0; k < 5; k++) { const a = spin + k * 1.3; ctx.beginPath(); ctx.arc(c, m, r * 0.75, a, a + 0.5); ctx.stroke(); } // hairy bits
    ctx.fillStyle = '#2a180a';
    for (let k = 0; k < 3; k++) { const a = spin + k * 2.094 - 1.57; ctx.beginPath(); ctx.arc(c + Math.cos(a) * r * 0.32, m + Math.sin(a) * r * 0.32, r * 0.12, 0, 7); ctx.fill(); }
  }

  function drawPineapple(px, py) {
    const c = px + TS / 2, m = py + TS * 0.58;
    ctx.fillStyle = '#00000040'; ctx.beginPath(); ctx.ellipse(c, py + TS * 0.86, TS * 0.22, TS * 0.07, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#3f9a4a';
    for (const a of [-0.6, -0.25, 0, 0.25, 0.6]) {
      ctx.save(); ctx.translate(c, m - TS * 0.2); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(-TS * 0.05, 0); ctx.lineTo(0, -TS * 0.26); ctx.lineTo(TS * 0.05, 0); ctx.fill(); ctx.restore();
    }
    ctx.fillStyle = '#e8a83a'; ctx.beginPath(); ctx.ellipse(c, m, TS * 0.2, TS * 0.26, 0, 0, 7); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.ellipse(c, m, TS * 0.2, TS * 0.26, 0, 0, 7); ctx.clip();
    ctx.strokeStyle = '#a8701e'; ctx.lineWidth = Math.max(1, TS / 32);
    for (let k = -4; k <= 4; k++) {
      ctx.beginPath(); ctx.moveTo(c + k * TS * 0.08 - TS * 0.3, m - TS * 0.3); ctx.lineTo(c + k * TS * 0.08 + TS * 0.3, m + TS * 0.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(c + k * TS * 0.08 + TS * 0.3, m - TS * 0.3); ctx.lineTo(c + k * TS * 0.08 - TS * 0.3, m + TS * 0.3); ctx.stroke();
    }
    ctx.restore();
  }

  function drawUmbrella(px, py) {
    const c = px + TS / 2, top = py + TS * 0.28;
    ctx.fillStyle = '#00000040'; ctx.beginPath(); ctx.ellipse(c, py + TS * 0.86, TS * 0.26, TS * 0.06, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#c9a26a'; ctx.lineWidth = Math.max(1.5, TS / 26);
    ctx.beginPath(); ctx.moveTo(c, top); ctx.lineTo(c + TS * 0.04, py + TS * 0.84); ctx.stroke();
    const cols = ['#ff6f98', '#ffd24a', '#5fd3e8', '#7dff9a', '#ff6f98', '#ffd24a'];
    for (let k = 0; k < 6; k++) {
      const a0 = Math.PI + (k / 6) * Math.PI, a1 = Math.PI + ((k + 1) / 6) * Math.PI;
      ctx.fillStyle = cols[k];
      ctx.beginPath(); ctx.moveTo(c, top - TS * 0.02); ctx.arc(c, top + TS * 0.14, TS * 0.36, a0, a1); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = '#ffffff88'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(c, top + TS * 0.14, TS * 0.36, Math.PI, 0); ctx.stroke();
  }

  function drawIngredient(o, px, py, spin) {
    if (o === 'c') drawCoconut(px, py, spin || 0); else if (o === 'p') drawPineapple(px, py); else drawUmbrella(px, py);
  }

  // The tiki punch bowl: a giant half coconut on the bar.
  function drawBowl(px, py, t, brewed, total) {
    const c = px + TS / 2;
    ctx.fillStyle = '#6b4a2a'; ctx.fillRect(px + TS * 0.08, py + TS * 0.7, TS * 0.84, TS * 0.22); // bar stand
    ctx.fillStyle = '#4a3220'; ctx.fillRect(px + TS * 0.08, py + TS * 0.7, TS * 0.84, TS * 0.04);
    ctx.fillStyle = '#5a3a1e';
    ctx.beginPath(); ctx.ellipse(c, py + TS * 0.46, TS * 0.42, TS * 0.3, 0, 0, Math.PI); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f3ead8'; ctx.beginPath(); ctx.ellipse(c, py + TS * 0.46, TS * 0.42, TS * 0.1, 0, 0, 7); ctx.fill();
    const col = ['#cfe9ff', '#ffd24a', '#ff9f6a', '#ff6f98'][Math.min(brewed, 3)];
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(c, py + TS * 0.47, TS * 0.36, TS * 0.07, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#ff6f98'; ctx.lineWidth = Math.max(2, TS / 18);
    ctx.beginPath(); ctx.moveTo(c + TS * 0.14, py + TS * 0.46); ctx.lineTo(c + TS * 0.26, py + TS * 0.12); ctx.lineTo(c + TS * 0.34, py + TS * 0.1); ctx.stroke(); // straw
    if (brewed > 0 && brewed < total) {
      ctx.fillStyle = '#ffffff88';
      for (let k = 0; k < 3; k++) { const ph = ((t / 700) + k / 3) % 1; ctx.globalAlpha = 1 - ph; ctx.beginPath(); ctx.arc(c + (k - 1) * TS * 0.14, py + TS * (0.42 - ph * 0.25), TS * (0.025 + ph * 0.03), 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
  }

  function drawTroll(px, py, t, stoneP) {
    // stoneP: 0 = awake and green, 1 = solid stone
    const c = px + TS / 2, breathe = stoneP < 1 ? Math.sin(t / 500 + px) * TS * 0.02 : 0;
    const mix = (a, b) => { const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16); const ch = s => Math.round(((pa >> s) & 255) * (1 - stoneP) + ((pb >> s) & 255) * stoneP); return `rgb(${ch(16)},${ch(8)},${ch(0)})`; };
    ctx.fillStyle = '#00000050'; ctx.beginPath(); ctx.ellipse(c, py + TS * 0.9, TS * 0.38, TS * 0.08, 0, 0, 7); ctx.fill();
    // body
    ctx.fillStyle = mix('#4f7a3a', '#7d7987');
    ctx.beginPath(); ctx.ellipse(c, py + TS * 0.66, TS * 0.38, TS * 0.26 + breathe, 0, 0, 7); ctx.fill();
    // arms
    ctx.beginPath(); ctx.ellipse(c - TS * 0.36, py + TS * 0.7, TS * 0.1, TS * 0.18, 0.3, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(c + TS * 0.36, py + TS * 0.7, TS * 0.1, TS * 0.18, -0.3, 0, 7); ctx.fill();
    // head
    ctx.fillStyle = mix('#5f8f45', '#8d8a96');
    ctx.beginPath(); ctx.ellipse(c, py + TS * 0.34 - breathe, TS * 0.26, TS * 0.22, 0, 0, 7); ctx.fill();
    // ears
    ctx.beginPath(); ctx.moveTo(c - TS * 0.22, py + TS * 0.3); ctx.lineTo(c - TS * 0.42, py + TS * 0.2); ctx.lineTo(c - TS * 0.24, py + TS * 0.4); ctx.fill();
    ctx.beginPath(); ctx.moveTo(c + TS * 0.22, py + TS * 0.3); ctx.lineTo(c + TS * 0.42, py + TS * 0.2); ctx.lineTo(c + TS * 0.24, py + TS * 0.4); ctx.fill();
    // big nose
    ctx.fillStyle = mix('#6f9f50', '#9a96a2');
    ctx.beginPath(); ctx.ellipse(c, py + TS * 0.4 - breathe, TS * 0.08, TS * 0.07, 0, 0, 7); ctx.fill();
    // tusks and frown
    ctx.fillStyle = '#efe6cf';
    ctx.beginPath(); ctx.moveTo(c - TS * 0.1, py + TS * 0.5); ctx.lineTo(c - TS * 0.08, py + TS * 0.42); ctx.lineTo(c - TS * 0.05, py + TS * 0.5); ctx.fill();
    ctx.beginPath(); ctx.moveTo(c + TS * 0.1, py + TS * 0.5); ctx.lineTo(c + TS * 0.08, py + TS * 0.42); ctx.lineTo(c + TS * 0.05, py + TS * 0.5); ctx.fill();
    ctx.strokeStyle = mix('#2c4a20', '#4a4652'); ctx.lineWidth = Math.max(1.5, TS / 26);
    ctx.beginPath(); ctx.moveTo(c - TS * 0.16, py + TS * 0.2); ctx.lineTo(c - TS * 0.04, py + TS * 0.25); ctx.moveTo(c + TS * 0.16, py + TS * 0.2); ctx.lineTo(c + TS * 0.04, py + TS * 0.25); ctx.stroke(); // grumpy brows
    if (stoneP >= 1) { // cracks
      ctx.strokeStyle = '#4a4652'; ctx.lineWidth = Math.max(1, TS / 34);
      ctx.beginPath(); ctx.moveTo(c - TS * 0.1, py + TS * 0.5); ctx.lineTo(c - TS * 0.02, py + TS * 0.64); ctx.lineTo(c - TS * 0.12, py + TS * 0.78); ctx.moveTo(c + TS * 0.18, py + TS * 0.58); ctx.lineTo(c + TS * 0.1, py + TS * 0.7); ctx.stroke();
      ctx.fillStyle = '#4a4652'; ctx.fillRect(c - TS * 0.13, py + TS * 0.29, TS * 0.07, TS * 0.03); ctx.fillRect(c + TS * 0.06, py + TS * 0.29, TS * 0.07, TS * 0.03);
    }
  }

  function drawTrollEyes(px, py, t) {
    const c = px + TS / 2, blink = (t + px * 37) % 3200 < 140 ? 0.15 : 1;
    ctx.fillStyle = '#ffe14a'; ctx.shadowColor = '#ffd020'; ctx.shadowBlur = TS * 0.25;
    ctx.beginPath(); ctx.ellipse(c - TS * 0.09, py + TS * 0.29, TS * 0.045, TS * 0.045 * blink, 0, 0, 7); ctx.ellipse(c + TS * 0.09, py + TS * 0.29, TS * 0.045, TS * 0.045 * blink, 0, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#1a1206'; ctx.fillRect(c - TS * 0.1, py + TS * 0.27, TS * 0.02, TS * 0.04 * blink); ctx.fillRect(c + TS * 0.08, py + TS * 0.27, TS * 0.02, TS * 0.04 * blink);
  }

  function drawFlame(x, y, s, t, seed) {
    for (let k = 0; k < 3; k++) {
      const fx = x + (k - 1) * s * 0.28, h = s * (0.55 + 0.18 * Math.sin(t / 90 + k * 2 + seed));
      ctx.fillStyle = k === 1 ? '#ffd24a' : '#ff7a2a';
      ctx.beginPath(); ctx.moveTo(fx - s * 0.2, y); ctx.quadraticCurveTo(fx + Math.sin(t / 120 + k) * s * 0.1, y - h * 1.6, fx + s * 0.2, y); ctx.fill();
    }
    ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.ellipse(x, y - s * 0.12, s * 0.1, s * 0.18, 0, 0, 7); ctx.fill();
  }

  function drawFirePot(px, py, t) {
    const c = px + TS / 2;
    const g = ctx.createRadialGradient(c, py + TS * 0.4, 2, c, py + TS * 0.4, TS * 0.8);
    g.addColorStop(0, `rgba(255,170,60,${0.35 + 0.08 * Math.sin(t / 110)})`); g.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = g; ctx.fillRect(px - TS * 0.5, py - TS * 0.5, TS * 2, TS * 2);
    ctx.fillStyle = '#00000050'; ctx.beginPath(); ctx.ellipse(c, py + TS * 0.86, TS * 0.3, TS * 0.07, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#3a3542'; ctx.beginPath(); ctx.moveTo(c - TS * 0.32, py + TS * 0.46); ctx.lineTo(c + TS * 0.32, py + TS * 0.46); ctx.lineTo(c + TS * 0.2, py + TS * 0.84); ctx.lineTo(c - TS * 0.2, py + TS * 0.84); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#56505f'; ctx.fillRect(c - TS * 0.34, py + TS * 0.43, TS * 0.68, TS * 0.07);
    ctx.fillStyle = '#ff7a2a'; ctx.fillRect(c - TS * 0.12, py + TS * 0.58, TS * 0.24, TS * 0.05);
    drawFlame(c, py + TS * 0.45, TS * 0.3, t, px + py);
  }

  function drawWallTorch(x, y, t) {
    drawWall(x, y, 'cave');
    const c = x * TS + TS / 2, py = y * TS;
    const g = ctx.createRadialGradient(c, py + TS * 0.35, 2, c, py + TS * 0.35, TS * 0.7);
    g.addColorStop(0, `rgba(255,170,60,${0.45 + 0.1 * Math.sin(t / 130)})`); g.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = g; ctx.fillRect(c - TS, py - TS * 0.5, TS * 2, TS * 2);
    ctx.fillStyle = '#6b4a2a'; ctx.fillRect(c - TS * 0.05, py + TS * 0.4, TS * 0.1, TS * 0.4);
    ctx.fillStyle = '#4b4f5a'; ctx.fillRect(c - TS * 0.12, py + TS * 0.62, TS * 0.24, TS * 0.06);
    drawFlame(c, py + TS * 0.42, TS * 0.24, t, x * 7 + y);
  }

  // Celia's chest: wood and gold, with a big C on the front. Open, it glows.
  function drawChest(px, py, t, open) {
    const m = TS * 0.1, w = TS - m * 2, top = py + TS * 0.4, h = TS * 0.46;
    ctx.fillStyle = '#00000044'; ctx.beginPath(); ctx.ellipse(px + TS / 2, py + TS * 0.9, w * 0.5, TS * 0.07, 0, 0, 7); ctx.fill();
    if (open) {
      const g = ctx.createRadialGradient(px + TS / 2, top, 2, px + TS / 2, top, TS * 0.9);
      g.addColorStop(0, `rgba(255,220,120,${0.8 + 0.2 * Math.sin(t / 250)})`); g.addColorStop(1, 'rgba(242,196,90,0)');
      ctx.fillStyle = g; ctx.fillRect(px - TS * 0.5, py - TS * 0.5, TS * 2, TS * 2);
      ctx.fillStyle = '#6b3f1f'; rr(px + m, py + TS * 0.08, w, TS * 0.3, TS * 0.08); ctx.fill();
      for (let k = 0; k < 6; k++) { ctx.fillStyle = k % 2 ? '#f2c45a' : '#ffd97a'; ctx.beginPath(); ctx.arc(px + m + w * (0.15 + k * 0.14), top + TS * 0.02, TS * 0.07, 0, 7); ctx.fill(); }
    }
    ctx.fillStyle = '#8a5a33'; rr(px + m, top, w, h, TS * 0.06); ctx.fill();
    ctx.strokeStyle = '#4a2f1a'; ctx.lineWidth = Math.max(1.5, TS / 26); ctx.stroke();
    if (!open) { ctx.fillStyle = '#a06a3c'; rr(px + m, py + TS * 0.2, w, TS * 0.24, TS * 0.1); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = '#f2c45a';
    ctx.fillRect(px + m + w * 0.15, open ? top : py + TS * 0.2, TS * 0.06, open ? h : h + TS * 0.2);
    ctx.fillRect(px + m + w * 0.85 - TS * 0.06, open ? top : py + TS * 0.2, TS * 0.06, open ? h : h + TS * 0.2);
    ctx.fillStyle = '#f2c45a'; ctx.beginPath(); ctx.arc(px + TS / 2, py + TS * 0.62, TS * 0.11, 0, 7); ctx.fill();
    ctx.fillStyle = '#6b3f1f'; ctx.font = `900 ${Math.round(TS * 0.17)}px Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('C', px + TS / 2, py + TS * 0.63);
  }

  function drawHero(c, m, dir, size, t, opts = {}) {
    const s = size;
    const step = opts.walking ? Math.sin(t / 40) * s * 0.04 : 0;
    ctx.fillStyle = '#00000040';
    ctx.beginPath(); ctx.ellipse(c, m + s * 0.36, s * 0.26, s * 0.08, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#3b3550';
    ctx.fillRect(c - s * 0.14, m + s * 0.14 + step, s * 0.1, s * 0.2);
    ctx.fillRect(c + s * 0.04, m + s * 0.14 - step, s * 0.1, s * 0.2);
    ctx.fillStyle = '#3d6fd6';
    rr(c - s * 0.22, m - s * 0.08, s * 0.44, s * 0.3, s * 0.08); ctx.fill();
    ctx.fillStyle = '#f2c45a'; ctx.fillRect(c - s * 0.22, m + s * 0.08, s * 0.44, s * 0.05);
    if (opts.torch) { // a tiki torch in hand, on the islands of trolls
      const side = dir === 'left' ? -1 : 1;
      ctx.fillStyle = '#8a6a3a'; ctx.fillRect(c + side * s * 0.28 - s * 0.03, m - s * 0.3, s * 0.06, s * 0.5);
      drawFlame(c + side * s * 0.28, m - s * 0.28, s * 0.2, t, 3);
    }
    ctx.fillStyle = '#c9ced8';
    ctx.beginPath(); ctx.arc(c, m - s * 0.2, s * 0.21, 0, 7); ctx.fill();
    ctx.strokeStyle = '#7d8494'; ctx.lineWidth = Math.max(1, s / 30); ctx.stroke();
    ctx.fillStyle = '#e04a5a';
    ctx.beginPath(); ctx.ellipse(c - (dir === 'right' ? s * 0.06 : dir === 'left' ? -s * 0.06 : 0), m - s * 0.42, s * 0.07, s * 0.12, dir === 'right' ? -0.5 : dir === 'left' ? 0.5 : 0, 0, 7); ctx.fill();
    if (dir !== 'up') {
      const ox = dir === 'left' ? -s * 0.07 : dir === 'right' ? s * 0.07 : 0;
      ctx.fillStyle = '#26222f'; rr(c - s * 0.15 + ox, m - s * 0.24, s * 0.3, s * 0.09, s * 0.03); ctx.fill();
      ctx.fillStyle = '#9fe0ff';
      ctx.fillRect(c - s * 0.09 + ox, m - s * 0.215, s * 0.05, s * 0.035);
      ctx.fillRect(c + s * 0.04 + ox, m - s * 0.215, s * 0.05, s * 0.035);
    }
  }

  function drawSabrina(c, m, size, t, hearts) {
    const s = size, sway = Math.sin(t / 400) * s * 0.02;
    ctx.fillStyle = '#00000040';
    ctx.beginPath(); ctx.ellipse(c, m + s * 0.38, s * 0.28, s * 0.08, 0, 0, 7); ctx.fill();
    const g = ctx.createLinearGradient(c, m - s * 0.1, c, m + s * 0.38);
    g.addColorStop(0, '#ff8fb1'); g.addColorStop(1, '#d94f7d');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(c - s * 0.1 + sway, m - s * 0.08); ctx.lineTo(c + s * 0.1 + sway, m - s * 0.08);
    ctx.lineTo(c + s * 0.3, m + s * 0.36); ctx.lineTo(c - s * 0.3, m + s * 0.36); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd0dd'; ctx.fillRect(c - s * 0.26, m + s * 0.28, s * 0.52, s * 0.04);
    ctx.fillStyle = '#e9a83a';
    ctx.beginPath(); ctx.ellipse(c + sway, m - s * 0.18, s * 0.19, s * 0.22, 0, 0, 7); ctx.fill();
    ctx.fillRect(c - s * 0.19 + sway, m - s * 0.2, s * 0.38, s * 0.24);
    ctx.fillStyle = '#ffd9bf';
    ctx.beginPath(); ctx.arc(c + sway, m - s * 0.18, s * 0.13, 0, 7); ctx.fill();
    ctx.fillStyle = '#3a2433';
    ctx.fillRect(c - s * 0.06 + sway, m - s * 0.2, s * 0.03, s * 0.04);
    ctx.fillRect(c + s * 0.03 + sway, m - s * 0.2, s * 0.03, s * 0.04);
    ctx.fillStyle = '#e8708f'; ctx.fillRect(c - s * 0.025 + sway, m - s * 0.12, s * 0.05, s * 0.015);
    ctx.fillStyle = '#f2c45a';
    ctx.beginPath();
    const cy0 = m - s * 0.32;
    ctx.moveTo(c - s * 0.12 + sway, cy0 + s * 0.06); ctx.lineTo(c - s * 0.12 + sway, cy0 - s * 0.04); ctx.lineTo(c - s * 0.06 + sway, cy0 + s * 0.01);
    ctx.lineTo(c + sway, cy0 - s * 0.07); ctx.lineTo(c + s * 0.06 + sway, cy0 + s * 0.01); ctx.lineTo(c + s * 0.12 + sway, cy0 - s * 0.04);
    ctx.lineTo(c + s * 0.12 + sway, cy0 + s * 0.06); ctx.closePath(); ctx.fill();
    if (hearts) { const k = (t / 900) % 1; drawHeart(c + s * 0.28, m - s * 0.3 - k * s * 0.3, s * 0.12, 1 - k); }
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

  // The Everglow Lantern, Celia's invention.
  function drawLantern(x, y, s, t) {
    const g = ctx.createRadialGradient(x, y, 2, x, y, s * 1.6);
    g.addColorStop(0, `rgba(255,236,160,${0.75 + 0.15 * Math.sin(t / 300)})`); g.addColorStop(1, 'rgba(255,210,100,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, s * 1.6, 0, 7); ctx.fill();
    ctx.strokeStyle = '#a87a22'; ctx.lineWidth = Math.max(1.5, s / 10);
    ctx.beginPath(); ctx.arc(x, y - s * 0.62, s * 0.2, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = '#c9952e'; rr(x - s * 0.36, y - s * 0.5, s * 0.72, s * 0.12, s * 0.04); ctx.fill(); rr(x - s * 0.36, y + s * 0.42, s * 0.72, s * 0.12, s * 0.04); ctx.fill();
    ctx.fillStyle = '#fff6cc'; rr(x - s * 0.28, y - s * 0.38, s * 0.56, s * 0.8, s * 0.1); ctx.fill();
    ctx.strokeStyle = '#c9952e'; ctx.lineWidth = Math.max(1, s / 16);
    ctx.beginPath(); ctx.moveTo(x, y - s * 0.38); ctx.lineTo(x, y + s * 0.42); ctx.stroke();
    ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.ellipse(x, y + s * 0.04, s * 0.1, s * 0.18, 0, 0, 7); ctx.fill();
  }

  // The recipe card under the board, with each ingredient ticked off as it goes in.
  function drawMenu() {
    const el = $('menu');
    const lv = LEVELS[levelIndex];
    if (!lv || !lv.recipe || !state) { el.hidden = true; return; }
    el.hidden = false;
    const done = state.brewed;
    el.innerHTML = `<span class="menu-title">Tiki Punch</span>` + lv.recipe.map((o, k) =>
      `${k ? '<span class="arrow">→</span>' : ''}<span class="item${k < done ? ' done' : k === done ? ' next' : ''}">
        <canvas data-ing="${o}" width="64" height="64"></canvas><span>${T.INGREDIENTS[o]}</span>${k < done ? '<b>✓</b>' : ''}</span>`).join('')
      + `<span class="arrow">=</span><span class="item${done >= lv.recipe.length ? ' made' : ''}"><canvas data-ing="K" width="64" height="64"></canvas><span>key</span></span>`;
    const saved = ctx, savedTS = TS;
    el.querySelectorAll('canvas').forEach(cv => {
      ctx = cv.getContext('2d'); TS = 64;
      if (cv.dataset.ing === 'K') drawKey(0, 0, 0, false); else drawIngredient(cv.dataset.ing, 0, 0);
    });
    ctx = saved; TS = savedTS;
  }

  // ---------- darkness ----------
  // Light is worked out per tile on a tiny canvas (one pixel per tile), then stretched over the
  // board with smoothing on, so the edges of the light come out soft.
  const fog = document.createElement('canvas');
  const fogCtx = fog.getContext('2d');
  function drawDarkness(hx, hy, t) {
    const s = state, w = s.w, h = s.h;
    if (fog.width !== w || fog.height !== h) { fog.width = w; fog.height = h; }
    const lights = [{ x: hx, y: hy, r: 3.3 }];
    for (let i = 0; i < s.floor.length; i++) {
      if (s.obj[i] === 'u' || s.floor[i] === 'i') lights.push({ x: cx(i), y: cy(i), r: 2.9 + 0.1 * Math.sin(t / 130 + i) });
    }
    if (lanternAt) lights.push({ x: hx, y: hy, r: 3 + (t - lanternAt) / 60 });
    const img = fogCtx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let b = 0;
      for (const L of lights) b = Math.max(b, Math.min(1, (L.r - Math.hypot(x - L.x, y - L.y)) / 1.3));
      if (b > 0.35) seen.add(i);
      if (seen.has(i)) b = Math.max(b, 0.3);
      img.data[i * 4 + 3] = Math.round((1 - b) * 0.94 * 255);
    }
    fogCtx.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(fog, 0, 0, w * TS, h * TS); // each pixel's centre lands on its tile's centre
    ctx.restore();
  }

  // ---------- main draw ----------
  function draw(t) {
    const s = state, st = islandOf(levelIndex).style;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, s.w * TS, s.h * TS);
    const open = s.gemsLeft === 0;

    let k = 1;
    if (anim) { k = Math.min(1, (t - anim.start) / anim.dur); if (k >= 1) { anim = null; runQueued(); } }
    const e = anim && anim.push && anim.push.roll ? k : ease(k);

    // terrain
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const i = y * s.w + x, f = s.floor[i];
      const px = x * TS, py = y * TS;
      if (f === '#') { drawWall(x, y, st); continue; }
      if (f === 'i') { drawWallTorch(x, y, t); continue; }
      if (f === '~') { drawWater(x, y, t); continue; }
      if (f === '=') { drawWater(x, y, t); drawCrate(px, py, true); continue; }
      if (f === 'o') { drawWater(x, y, t); if (!(anim && anim.push && anim.push.to === i)) drawCoconut(px, py, 0, true, t); continue; }
      drawFloor(x, y, st);
      if (f === 'D') drawExit(px, py, open, t, st);
      else if (f === 'C') drawBowl(px, py, t, s.brewed, s.recipe.length);
      else if (f === 'L') drawLockedGate(px, py);
      else if (f === 'J' || f === 'j') drawChest(px, py, t, f === 'j');
    }

    // troll reach: a faint warning on the tiles a troll can grab
    const reach = T.trollReach(s);
    const pulse = 0.5 + 0.3 * Math.sin(t / 220);
    for (const c of reach) {
      if (s.floor[c] === '#' || s.floor[c] === 'i' || s.floor[c] === 'g' || s.floor[c] === 'G') continue;
      ctx.fillStyle = `rgba(120,200,80,${0.12 * pulse})`; ctx.fillRect(cx(c) * TS, cy(c) * TS, TS, TS);
      ctx.setLineDash([TS * 0.12, TS * 0.1]); ctx.strokeStyle = `rgba(150,230,100,${0.5 * pulse})`; ctx.lineWidth = 2;
      ctx.strokeRect(cx(c) * TS + 3, cy(c) * TS + 3, TS - 6, TS - 6); ctx.setLineDash([]);
    }

    // trolls and statues
    for (let i = 0; i < s.floor.length; i++) {
      const f = s.floor[i];
      if (f !== 'G' && f !== 'g') continue;
      let p = f === 'g' ? 1 : 0;
      const sa = stoneAnims.find(a => a.cell === i);
      if (sa) p = Math.min(1, (t - sa.at) / STONE_MS);
      drawTroll(cx(i) * TS, cy(i) * TS, t, p);
      if (p < 0.5 && !s.dark) drawTrollEyes(cx(i) * TS, cy(i) * TS, t);
    }

    // objects
    let boatDrawn = false;
    const heroOnBoat = s.obj[s.hero] === 'O';
    for (let i = 0; i < s.obj.length; i++) {
      const o = s.obj[i];
      if (!o) continue;
      let px = cx(i) * TS, py = cy(i) * TS;
      const moving = anim && anim.push && anim.push.to === i;
      if (moving) { px = lerp(cx(anim.push.from), cx(i), e) * TS; py = lerp(cy(anim.push.from), cy(i), e) * TS; }
      if (o === 'B') drawCrate(px, py, false);
      else if (o === '*') drawCoin(px, py, t, i, s.floor[i] === '~');
      else if (o === 'K') {
        if (brew && brew.cell === i && t - brew.at < BREW_MS) {
          const p = (t - brew.at) / BREW_MS;
          ctx.globalAlpha = Math.max(0, 1 - p * 1.6); drawBowl(px, py, t, 3, 3); ctx.globalAlpha = 1;
          if (p > 0.55) { const q = Math.min(1, (p - 0.55) / 0.45), sc = ease(q) * (1 + 0.25 * Math.sin(q * Math.PI)); ctx.save(); ctx.translate(px + TS / 2, py + TS / 2); ctx.scale(sc, sc); ctx.translate(-TS / 2, -TS / 2); drawKey(0, 0, t); ctx.restore(); }
        } else drawKey(px, py, t);
      } else if (o === 'u') drawFirePot(px, py, t);
      else if (T.isIngredient(o)) drawIngredient(o, px, py, moving ? e * 9 : 0);
      else if (o === 'O') { boatDrawn = true; drawBoatAt(i, t, k, e); }
    }
    // things sliding into the punch bowl or splashing into the water (already gone in the state)
    if (anim && anim.push && k < 1 && (anim.push.into || s.floor[anim.push.to] === '=' || anim.push.float)) {
      const px = lerp(cx(anim.push.from), cx(anim.push.to), e) * TS, py = lerp(cy(anim.push.from), cy(anim.push.to), e) * TS;
      if (anim.push.into) { const sz = 1 - e * 0.5; ctx.save(); ctx.translate(px + TS / 2, py + TS / 2); ctx.scale(sz, sz); ctx.translate(-TS / 2, -TS / 2); drawIngredient(anim.push.item, 0, 0, e * 9); ctx.restore(); }
      else if (anim.push.float) drawCoconut(px, py, e * 9);
      else drawCrate(px, py, false);
    }

    // Sabrina and the knight
    const hp = posOf(anim ? anim.from : s.hero, s.hero, e);
    const sp = posOf(anim ? anim.trailFrom : s.trail, s.trail, e);
    const torch = st === 'cave';
    const sabrinaInBoat = s.obj[s.trail] === 'O' && (!anim || anim.boat || anim.trailFrom === s.trail);
    const heroInBoat = heroOnBoat && (!anim || anim.boat);
    const together = s.trail === s.hero && !heroOnBoat;
    const loveNow = (t % 7000) < 1400 && Math.abs(hp.x - sp.x) + Math.abs(hp.y - sp.y) <= 1.05;
    if (!sabrinaInBoat) drawSabrina((sp.x + 0.5 - (together ? 0.2 : 0)) * TS, (sp.y + 0.5) * TS - (anim ? Math.sin(e * Math.PI) * TS * 0.05 : 0), TS * 0.9, t, loveNow && !s.dead);
    if (!heroInBoat && !(s.won && s.floor[s.hero] === 'D' && t - wonAt > 300)) {
      if (s.dead) ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t / 50);
      drawHero((hp.x + 0.5 + (together ? 0.18 : 0)) * TS, (hp.y + 0.5) * TS - (anim ? Math.sin(e * Math.PI) * TS * 0.06 : 0), s.dir, TS, t, { walking: !!anim, torch });
      ctx.globalAlpha = 1;
    }
    void boatDrawn;

    // particles
    particles = particles.filter(p => p.life > 0);
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy; p.vy += p.g ?? 0.12; p.life -= p.decay ?? 0.025;
      ctx.globalAlpha = Math.max(0, p.life) * (p.alpha ?? 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // the dark, and troll eyes glowing in it
    if (s.dark) {
      drawDarkness(hp.x, hp.y, t);
      for (let i = 0; i < s.floor.length; i++) {
        if (s.floor[i] !== 'G') continue;
        const sa = stoneAnims.find(a => a.cell === i);
        if (!sa || t - sa.at < STONE_MS * 0.5) drawTrollEyes(cx(i) * TS, cy(i) * TS, t);
      }
    }

    // flashes
    if (deadAt) {
      const a = Math.max(0, 0.45 - (t - deadAt) / 800);
      if (a > 0) { ctx.fillStyle = `rgba(90,200,60,${a})`; ctx.fillRect(0, 0, s.w * TS, s.h * TS); }
    }
    if (wonAt) {
      const a = Math.min(lanternAt ? 0.6 : 0.35, (t - wonAt) / 1500);
      ctx.fillStyle = `rgba(242,196,90,${a})`; ctx.fillRect(0, 0, s.w * TS, s.h * TS);
      if (Math.random() < 0.3) burst(s.hero, ['#f2c45a', '#ff6f98', '#fff'], 2, 3);
    }
  }

  // Where someone is mid-tween (in tiles).
  function posOf(from, to, e) {
    if (from == null || from === to) return { x: cx(to), y: cy(to) };
    return { x: lerp(cx(from), cx(to), e), y: lerp(cy(from), cy(to), e) };
  }

  function drawBoatAt(i, t, k, e) {
    const s = state;
    let x = cx(i), y = cy(i);
    if (anim && anim.boat) { const p = posOf(anim.from, i, e); x = p.x; y = p.y; }
    const riders = [];
    if (s.hero === i && (!anim || anim.boat)) riders.push('hero');
    if (s.trail === i && (!anim || anim.boat || anim.trailFrom === i)) riders.push('sabrina');
    drawBoat(x * TS, y * TS, t, riders);
    if (anim && anim.boat && k < 1 && Math.random() < 0.5) {
      particles.push({ x: (x + 0.5) * TS, y: (y + 0.8) * TS, vx: (Math.random() - 0.5) * 2, vy: -Math.random() * 1.5, life: 0.7, color: '#cfe9ff', size: 2 + Math.random() * 2 });
    }
  }

  // ---------- story pictures ----------
  function withCanvas(id, fn) {
    const cv = document.getElementById(id);
    if (!cv) return;
    const saved = ctx, savedTS = TS;
    ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    fn(cv.width, cv.height);
    ctx = saved; TS = savedTS;
  }

  function drawSea(W, H, t, horizon) {
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#0e2440'); sky.addColorStop(1, '#2d5f86');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, horizon);
    ctx.fillStyle = '#fff8'; for (let k = 0; k < 14; k++) ctx.fillRect(hash(k, 1) * W, hash(1, k) * horizon * 0.8, 1.5, 1.5);
    ctx.fillStyle = '#f3ead8'; ctx.beginPath(); ctx.arc(W * 0.82, horizon * 0.35, 12, 0, 7); ctx.fill();
    ctx.fillStyle = '#0e2440'; ctx.beginPath(); ctx.arc(W * 0.82 + 5, horizon * 0.35 - 3, 11, 0, 7); ctx.fill();
    const sea = ctx.createLinearGradient(0, horizon, 0, H);
    sea.addColorStop(0, '#1f6a9a'); sea.addColorStop(1, '#0d3a5e');
    ctx.fillStyle = sea; ctx.fillRect(0, horizon, W, H - horizon);
    ctx.strokeStyle = '#9fd0ff66'; ctx.lineWidth = 1.5;
    for (let r = 0; r < 4; r++) {
      ctx.beginPath();
      const yy = horizon + 12 + r * 14;
      for (let x = 0; x <= W; x += 8) { const yv = yy + Math.sin(t / 500 + x / 18 + r * 2) * 2.5; x ? ctx.lineTo(x, yv) : ctx.moveTo(x, yv); }
      ctx.stroke();
    }
  }

  function drawIslandShape(x, y, w, kind) {
    ctx.fillStyle = kind === 2 ? '#3a3542' : '#d8bf86';
    ctx.beginPath(); ctx.ellipse(x, y, w, w * 0.28, 0, Math.PI, 0); ctx.fill();
    if (kind === 0) { // boat house
      ctx.fillStyle = '#6b4a2a'; ctx.fillRect(x - 14, y - 26, 28, 20);
      ctx.fillStyle = '#9a3a3a'; ctx.beginPath(); ctx.moveTo(x - 18, y - 25); ctx.lineTo(x, y - 38); ctx.lineTo(x + 18, y - 25); ctx.fill();
      ctx.fillStyle = '#1a1424'; ctx.fillRect(x - 5, y - 16, 10, 10);
    } else if (kind === 1) { // palm and tiki hut
      ctx.strokeStyle = '#6b4a26'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 8, y - 4); ctx.quadraticCurveTo(x + 4, y - 22, x + 10, y - 34); ctx.stroke();
      ctx.strokeStyle = '#3f8a4a'; ctx.lineWidth = 2.5;
      for (const a of [-2.6, -1.9, -1.2, -0.5]) { ctx.beginPath(); ctx.moveTo(x + 10, y - 34); ctx.quadraticCurveTo(x + 10 + Math.cos(a) * 10, y - 34 + Math.sin(a) * 10 - 3, x + 10 + Math.cos(a) * 17, y - 34 + Math.sin(a) * 17 + 4); ctx.stroke(); }
      ctx.fillStyle = '#c9a26a'; ctx.beginPath(); ctx.moveTo(x - 20, y - 10); ctx.lineTo(x - 10, y - 22); ctx.lineTo(x, y - 10); ctx.fill();
      ctx.fillStyle = '#6b4a2a'; ctx.fillRect(x - 17, y - 10, 14, 7);
    } else { // rocky troll island with a cave
      ctx.fillStyle = '#4a4552'; ctx.beginPath(); ctx.moveTo(x - w * 0.7, y - 2); ctx.lineTo(x - w * 0.3, y - 30); ctx.lineTo(x, y - 18); ctx.lineTo(x + w * 0.35, y - 36); ctx.lineTo(x + w * 0.75, y - 2); ctx.fill();
      ctx.fillStyle = '#0d0a12'; ctx.beginPath(); ctx.ellipse(x + 4, y - 6, 9, 10, 0, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = '#d0302a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 4, y - 30); ctx.lineTo(x + 6, y - 20); ctx.moveTo(x + 6, y - 30); ctx.lineTo(x - 4, y - 20); ctx.stroke();
    }
  }

  function drawVoyage(t) {
    withCanvas('voyageArt', (W, H) => {
      const el = Math.min(1, (t - voyage.at) / 4500);
      const horizon = 70;
      drawSea(W, H, t, horizon);
      drawIslandShape(40, horizon + 8, 34, voyage.from);
      drawIslandShape(W - 46, horizon + 8, 38, voyage.to);
      const bx = lerp(70, W - 100, ease(el)), by = horizon + 34 + Math.sin(t / 400) * 3;
      TS = 52;
      drawBoat(bx - TS / 2, by - TS * 0.6, t, ['hero', 'sabrina']);
      if (el < 1) { ctx.strokeStyle = '#cfe9ff88'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(bx - 30, by + 8); ctx.lineTo(bx - 60, by + 10); ctx.stroke(); }
      const hk = (t / 1100) % 1; drawHeart(bx + 2, by - 34 - hk * 20, 5, 1 - hk);
    });
  }

  function drawTitleArt(t, id) {
    withCanvas(id, (W, H) => {
      drawSea(W, H, t, 62);
      drawIslandShape(52, 74, 30, 0); drawIslandShape(150, 70, 24, 1); drawIslandShape(250, 74, 32, 2);
      TS = 46;
      drawBoat(90 + Math.sin(t / 2000) * 10 - TS / 2, 88, t, ['hero', 'sabrina']);
    });
  }

  function drawFinaleArt(t) {
    withCanvas('finaleArt', (W, H) => {
      const el = t - finaleStart;
      const g = ctx.createRadialGradient(W / 2, 70, 10, W / 2, 70, 200);
      g.addColorStop(0, '#5a4a2a'); g.addColorStop(1, '#14101c');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      TS = 70;
      drawChest(W / 2 - 35, 84, t, true);
      drawLantern(W / 2, 52 - Math.sin(el / 600) * 3, 28, t);
      for (let k = 0; k < 6; k++) { const p = ((el / 1600) + k / 6) % 1; drawHeart(40 + k * 44 + Math.sin(el / 500 + k) * 6, 150 - p * 120, 6, (1 - p) * 0.9); }
      drawHero(70, 112, 'right', 64, t, {});
      drawSabrina(W - 70, 112, 64, t, true);
    });
  }

  // ---------- frame loop ----------
  function runQueued() {
    if (!queued) return;
    const q = queued; queued = null;
    tryMove(q);
  }

  function frame(t) {
    if (state && (screen === 'play' || screen === 'intro' || screen === 'clear')) draw(t);
    if (screen === 'voyage' && voyage) drawVoyage(t);
    if (screen === 'title') drawTitleArt(t, 'titleArt');
    if (screen === 'gate') drawTitleArt(t, 'gateArt');
    if (screen === 'finale') { if (state) draw(t); drawFinaleArt(t); }
    requestAnimationFrame(frame);
  }

  // ---------- input ----------
  const KEYDIR = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  window.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (screen === 'gate') return; // typing the secret word
    const dir = KEYDIR[e.code];
    if (screen === 'play') {
      if (dir) { e.preventDefault(); tryMove(dir); }
      else if (e.code === 'KeyZ' || e.code === 'Backspace' || e.code === 'KeyU') { e.preventDefault(); undo(); }
      else if (e.code === 'KeyR' && !e.repeat) restart();
      else if (e.code === 'KeyM') toggleMute();
      else if (e.code === 'KeyN') toggleMusic();
      else if (e.code === 'Escape') showTitle();
    } else if ((e.code === 'Enter' || e.code === 'Space') && !e.repeat) {
      e.preventDefault();
      const btn = overlay.querySelector('button.primary');
      if (btn) btn.click();
    } else if (e.code === 'Escape' && screen === 'intro') showTitle();
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
    if (musicOn && muted) { muted = false; store.set('sabrina.muted', false); audio(); }
    refreshMusic();
    updateHud();
  }

  $('undoBtn').onclick = e => { e.currentTarget.blur(); undo(); };
  $('restartBtn').onclick = e => { e.currentTarget.blur(); restart(); };
  $('muteBtn').onclick = e => { e.currentTarget.blur(); toggleMute(); };
  $('musicBtn').onclick = e => { e.currentTarget.blur(); toggleMusic(); };
  $('menuBtn').onclick = e => { e.currentTarget.blur(); showTitle(); };
  $('padUndo').onclick = undo;
  $('padRestart').onclick = restart;
  document.querySelectorAll('#pad [data-dir]').forEach(b => {
    b.addEventListener('pointerdown', e => { e.preventDefault(); tryMove(b.dataset.dir); });
  });

  let touchStart = null;
  canvas.addEventListener('touchstart', e => { const p = e.touches[0]; touchStart = { x: p.clientX, y: p.clientY }; }, { passive: true });
  canvas.addEventListener('touchend', e => {
    if (!touchStart) return;
    const p = e.changedTouches[0], dx = p.clientX - touchStart.x, dy = p.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    tryMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  });

  // ---------- boot ----------
  // Shortcut for testing: ?level=5 jumps to that puzzle (once you've said the secret word).
  const jump = parseInt(new URLSearchParams(location.search).get('level'), 10);
  loadLevel(Math.min(progress.unlocked, LEVELS.length) - 1);
  if (!progress.pass) showGate();
  else if (jump >= 1 && jump <= LEVELS.length) {
    progress.unlocked = Math.max(progress.unlocked, jump); save();
    startLevel(jump - 1);
  } else showTitle();
  requestAnimationFrame(frame);
})();
