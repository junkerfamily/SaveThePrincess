// Saving Sabrina — game rules. Pure functions, no DOM, so the solver can use them too.
//
// Map legend
//   #  wall            .  floor           @  hero start
//   B  crate           *  gem             H  hammer (adds swings)
//   R  cracked rock    ~  water           D  door (opens when all gems are taken)
//   S  Sabrina (final exit)               _  pressure plate
//   |  gate (open while any plate is held down)
//   ^ v < >  gargoyle, glaring in that direction
//   C  cauldron        t f w  ingredients: toadstool, feather, bat wing (push them like crates)
//   L  locked door (needs a key)          K  key
//   T  trapdoor down to the hidden basement   Q  crate sitting on a trapdoor
//   U  stairs back up (out of the basement)
//   X  dragon (a block of X cells). It breathes fire out of its front, across every row
//      it covers, on every `breath`-th move (default 3). Smoke curls up one move before.
//      Crates block the flames, just like a gargoyle's glare. Jam a crate right in front of
//      every row and the dragon chokes on its own smoke: it never breathes again, and a magic
//      key (M) appears at the level's `prize` spot ([x, y]), or the nearest free floor to it.
//   M  magic key      J  gem-covered chest (opens with the magic key)   j  opened chest
//
// A level with a cauldron lists its recipe, e.g. recipe: ['t', 'f', 'w'].
// Push the ingredients into the cauldron in that order. The last one brews a key:
// the cauldron turns into a key, and the hero walks over it to pick it up.

(function (root) {
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const DIR_LIST = ['up', 'down', 'left', 'right'];
  const GARGOYLES = { '^': 'up', 'v': 'down', '<': 'left', '>': 'right' };
  const INGREDIENTS = { t: 'toadstool', f: 'feather', w: 'bat wing' };
  const isIngredient = o => o === 't' || o === 'f' || o === 'w';
  const isPushable = o => o === 'B' || isIngredient(o);

  function parse(level) {
    const rows = level.map;
    const h = rows.length;
    const w = Math.max(...rows.map(r => r.length));
    const floor = [], obj = [];
    let hero = 0, gems = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = rows[y][x] || '#';
        let f = '.', o = '';
        switch (c) {
          case '@': hero = y * w + x; break;
          case 'B': o = 'B'; break;
          case '*': o = '*'; gems++; break;
          case 'H': o = 'H'; break;
          case 'K': o = 'K'; break;
          case 'M': o = 'M'; break;
          case 't': case 'f': case 'w': o = c; break;
          case 'P': f = '_'; o = 'B'; break; // crate already on a plate
          case 'Q': f = 'T'; o = 'B'; break; // crate hiding a trapdoor
          case ' ': f = '#'; break;
          case '.': break;
          default: f = c;
        }
        floor.push(f); obj.push(o);
      }
    }
    // The dragon's bounding box, so we know which rows (or columns) it breathes across.
    let dragon = null;
    floor.forEach((f, i) => {
      if (f !== 'X') return;
      const x = i % w, y = Math.floor(i / w);
      if (!dragon) dragon = { x0: x, y0: y, x1: x, y1: y };
      dragon.x0 = Math.min(dragon.x0, x); dragon.x1 = Math.max(dragon.x1, x);
      dragon.y0 = Math.min(dragon.y0, y); dragon.y1 = Math.max(dragon.y1, y);
    });
    if (dragon) { dragon.dir = level.dragonDir || 'left'; dragon.breath = level.breath ?? 3; }
    return {
      w, h, floor, obj, hero, dir: 'down',
      swings: level.swings ?? 0,
      hammerSwings: level.hammerSwings ?? 2,
      gemsLeft: gems, gemsTotal: gems,
      keys: 0, recipe: level.recipe || [], brewed: 0, dragon,
      choked: false, magicKey: false, prize: level.prize ? level.prize[1] * w + level.prize[0] : -1,
      moves: 0, dead: false, won: false,
    };
  }

  function clone(s) {
    return { ...s, floor: s.floor.slice(), obj: s.obj.slice() };
  }

  function platesHeld(s) {
    for (let i = 0; i < s.floor.length; i++) {
      if (s.floor[i] === '_' && (s.obj[i] === 'B' || s.hero === i)) return true;
    }
    return false;
  }

  // A gate is open when a plate is held, or when something is standing in it.
  function gateOpen(s, i, held) {
    return held || s.obj[i] === 'B' || s.hero === i;
  }

  function neighbor(s, i, dir) {
    const [dx, dy] = DIRS[dir];
    const x = (i % s.w) + dx, y = Math.floor(i / s.w) + dy;
    if (x < 0 || y < 0 || x >= s.w || y >= s.h) return -1;
    return y * s.w + x;
  }

  function heroCanEnter(s, i, held) {
    const f = s.floor[i];
    if (f === '.' || f === '=' || f === '_' || f === 'T' || f === 'U') return true;
    if (f === '|') return gateOpen(s, i, held);
    if (f === 'D' || f === 'S') return s.gemsLeft === 0;
    if (f === 'L') return s.keys > 0;
    return false;
  }

  // Ingredients slide over floor and bridges, but won't go in water or onto plates.
  function ingredientCanEnter(s, i) {
    if (s.obj[i] !== '') return false;
    const f = s.floor[i];
    return f === '.' || f === '=' || f === 'T';
  }

  function crateCanEnter(s, i, held) {
    if (s.obj[i] !== '') return false;
    const f = s.floor[i];
    if (f === '.' || f === '=' || f === '_' || f === '~' || f === 'T') return true;
    if (f === '|') return held;
    return false;
  }

  function blocksBeam(s, i, held) {
    if (isPushable(s.obj[i])) return true;
    const f = s.floor[i];
    if (f === '|') return !gateOpen(s, i, held);
    return !(f === '.' || f === '=' || f === '_' || f === '~' || f === 'T' || f === 'U');
  }

  // Every cell lit by a gargoyle's glare.
  // One entry per gargoyle: where it sits, which way it glares, and the cells it lights.
  function beamSegments(s) {
    const held = platesHeld(s);
    const segs = [];
    for (let i = 0; i < s.floor.length; i++) {
      const dir = GARGOYLES[s.floor[i]];
      if (!dir) continue;
      const cells = [];
      let c = neighbor(s, i, dir);
      while (c >= 0 && !blocksBeam(s, c, held)) {
        cells.push(c);
        c = neighbor(s, c, dir);
      }
      segs.push({ from: i, dir, cells, stop: c });
    }
    return segs;
  }

  function beams(s) {
    const lit = new Set();
    for (const seg of beamSegments(s)) seg.cells.forEach(c => lit.add(c));
    return lit;
  }

  // Where the dragon is in its breathing cycle: 'calm', 'smoke' (fire next move) or 'fire'.
  function dragonPhase(s) {
    if (!s.dragon) return null;
    if (s.choked) return 'calm'; // smoked out: asleep for good
    const p = s.moves % s.dragon.breath;
    return p === s.dragon.breath - 1 ? 'fire' : p === s.dragon.breath - 2 ? 'smoke' : 'calm';
  }

  // The lanes of fire the dragon breathes, one per row (or column) it covers.
  function flameLanes(s) {
    const d = s.dragon;
    if (!d) return [];
    const held = platesHeld(s);
    const horiz = d.dir === 'left' || d.dir === 'right';
    const lanes = [];
    const [a, b] = horiz ? [d.y0, d.y1] : [d.x0, d.x1];
    for (let k = a; k <= b; k++) {
      let x = horiz ? (d.dir === 'left' ? d.x0 - 1 : d.x1 + 1) : k;
      let y = horiz ? k : (d.dir === 'up' ? d.y0 - 1 : d.y1 + 1);
      const [dx, dy] = DIRS[d.dir];
      const cells = [];
      while (x >= 0 && y >= 0 && x < s.w && y < s.h && !blocksBeam(s, y * s.w + x, held)) {
        cells.push(y * s.w + x);
        x += dx; y += dy;
      }
      lanes.push(cells);
    }
    return lanes;
  }

  function flames(s) {
    const lit = new Set();
    if (dragonPhase(s) === 'fire') for (const lane of flameLanes(s)) lane.forEach(c => lit.add(c));
    return lit;
  }

  function checkDeath(s) {
    if (s.won) return;
    if (beams(s).has(s.hero)) { s.dead = true; s.deathBy = 'zap'; }
    else if (flames(s).has(s.hero)) { s.dead = true; s.deathBy = 'burn'; }
  }

  // Free floor nearest to cell i (for dropping the magic key somewhere you can reach).
  function nearestFree(s, i) {
    const seen = new Set([i]), q = [i];
    while (q.length) {
      const c = q.shift();
      if ((s.floor[c] === '.' || s.floor[c] === '=') && !s.obj[c] && c !== s.hero) return c;
      for (const d of DIR_LIST) {
        const nb = neighbor(s, c, d);
        if (nb >= 0 && !seen.has(nb) && s.floor[nb] !== '#') { seen.add(nb); q.push(nb); }
      }
    }
    return -1;
  }

  function dragonEvents(n, events) {
    if (n.dragon && !n.choked && flameLanes(n).every(l => l.length === 0)) {
      n.choked = true;
      const at = n.prize >= 0 ? nearestFree(n, n.prize) : -1;
      if (at >= 0) n.obj[at] = 'M';
      n.prizeCell = at;
      events.push('choke');
    }
    const p = dragonPhase(n);
    if (p === 'fire') events.push('flame');
    else if (p === 'smoke') events.push('growl');
  }

  // Try to walk one tile. Returns { state, moved, events, push } — state is always a new object.
  function step(s, dir) {
    const n = clone(s);
    n.dir = dir;
    const events = [];
    let push = null;
    const t = neighbor(n, n.hero, dir);
    if (t < 0) return { state: n, moved: false, events: ['bump'] };
    const held = platesHeld(n);

    if (isIngredient(n.obj[t])) {
      const item = n.obj[t];
      const t2 = neighbor(n, t, dir);
      if (t2 >= 0 && n.floor[t2] === 'C') {
        const need = n.recipe[n.brewed];
        if (item !== need) return { state: n, moved: false, events: ['fizzle'], wrong: item, need };
        n.obj[t] = '';
        n.brewed++;
        events.push('plop');
        if (n.brewed === n.recipe.length) {
          n.floor[t2] = '.'; // the cauldron turns into a key...
          n.obj[t2] = 'K';   // ...which the hero has to walk over to pick up
          events.push('brew');
        }
        push = { from: t, to: t2, item, into: true };
      } else {
        if (t2 < 0 || !ingredientCanEnter(n, t2)) return { state: n, moved: false, events: ['bump'] };
        n.obj[t] = '';
        n.obj[t2] = item;
        events.push('push');
        push = { from: t, to: t2, item };
      }
    } else if (n.obj[t] === 'B') {
      const t2 = neighbor(n, t, dir);
      if (t2 < 0 || !crateCanEnter(n, t2, held)) return { state: n, moved: false, events: ['bump'] };
      n.obj[t] = '';
      if (n.floor[t2] === '~') {
        n.floor[t2] = '=';
        events.push('splash');
      } else {
        n.obj[t2] = 'B';
        events.push('push');
      }
      push = { from: t, to: t2, item: 'B' };
    } else if (n.floor[t] === 'J') {
      // The gem-covered chest: the magic key opens it (that takes a move; you stay put).
      if (!n.magicKey) return { state: n, moved: false, events: ['chestlocked'] };
      n.floor[t] = 'j';
      n.moves++;
      checkDeath(n);
      return { state: n, moved: true, events: ['chest'], from: n.hero, opened: t };
    } else if (!heroCanEnter(n, t, held)) {
      return { state: n, moved: false, events: ['bump'] };
    }

    const from = n.hero;
    n.hero = t;
    n.moves++;
    if (n.obj[t] === '*') {
      n.obj[t] = '';
      n.gemsLeft--;
      events.push(n.gemsLeft === 0 ? 'unlock' : 'gem');
    } else if (n.obj[t] === 'H') {
      n.obj[t] = '';
      n.swings += n.hammerSwings;
      events.push('hammer');
    } else if (n.obj[t] === 'K') {
      n.obj[t] = '';
      n.keys++;
      events.push('key');
    } else if (n.obj[t] === 'M') {
      n.obj[t] = '';
      n.magicKey = true;
      events.push('magickey');
    }
    if (n.floor[t] === 'L') {
      n.floor[t] = '.';
      n.keys--;
      events.push('unlockdoor');
    }
    if (n.floor[t] === 'D' || n.floor[t] === 'S') {
      n.won = true;
      events.push('win');
    }
    let descend = false, ascend = false;
    if (n.floor[t] === 'T') { descend = true; events.push('trapdoor'); }
    if (n.floor[t] === 'U') {
      ascend = true;
      if (n.gemsLeft === 0) { n.won = true; events.push('win'); }
    }
    if (!push && events.length === 0) events.push('step');
    dragonEvents(n, events);
    checkDeath(n);
    if (n.dead) events.push(n.deathBy);
    return { state: n, moved: true, events, push, from, descend, ascend };
  }

  // Swing the hammer at the tile the hero is facing.
  function smash(s) {
    const t = neighbor(s, s.hero, s.dir);
    if (t < 0 || s.swings <= 0 || s.floor[t] !== 'R') {
      return { state: s, moved: false, events: [s.swings > 0 ? 'clank' : 'nohammer'] };
    }
    const n = clone(s);
    n.floor[t] = '.';
    n.swings--;
    n.moves++;
    const events = ['smash'];
    dragonEvents(n, events);
    checkDeath(n);
    if (n.dead) events.push(n.deathBy);
    return { state: n, moved: true, events, smashed: t };
  }

  const LEVELS = [];

  const api = { DIRS, DIR_LIST, GARGOYLES, INGREDIENTS, isIngredient, isPushable, LEVELS, parse, clone, step, smash, beams, beamSegments, dragonPhase, flameLanes, flames, platesHeld, gateOpen, neighbor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sabrina = api;
})(this);
