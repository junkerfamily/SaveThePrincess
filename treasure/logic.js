// The Hunt for Sabrina's Treasure — game rules. Pure functions, no DOM, so a solver can use them too.
//
// Map legend
//   #  rock wall       .  floor (sand, planks or tunnel)    @  the knight (Sabrina follows)
//   B  crate           *  gold coin (collect them all)       D  way out (opens when every coin is taken)
//   ~  water           =  bridge (a crate sunk in the water)
//   O  rowboat, floating on water. Walk into it to climb in. Paddle onto open water and it
//      glides until it bumps into something (land, a bridge, a wall, a crate). Coins bobbing
//      on the water get scooped up as you glide over them. Walk onto land to climb out.
//   K  key             L  locked gate (needs a key)
//   C  tiki punch bowl. Push the ingredients in, in the order on the menu, and the last one
//      turns the bowl into a key. Ingredients: c coconut (rolls until it hits something),
//      p pineapple, y paper umbrella (these two slide one step, like crates).
//      Coconuts float! One that rolls into the water stops there as a stepping stone (o).
//   G  troll. It grabs anyone who walks right next to it (not diagonally).
//      Trolls turn to stone in firelight: any troll next to a fire pot (even diagonally) or a
//      wall torch turns into a statue (g) for good. A statue is solid, like a wall.
//   u  fire pot. Push it like a crate (it won't go in the water).
//   i  wall torch (fixed in place, solid)
//   J  Celia's treasure chest (opens once every coin is taken: that wins the game)
//   s  stone troll statue (already stone at the start)
//
// A level can say dark: true. Then you only see near your torch and near fire. That's just
// how it's drawn: the rules are the same.

(function (root) {
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const DIR_LIST = ['up', 'down', 'left', 'right'];
  const INGREDIENTS = { c: 'coconut', p: 'pineapple', y: 'paper umbrella' };
  const isIngredient = o => o === 'c' || o === 'p' || o === 'y';
  const isPushable = o => o === 'B' || o === 'u' || isIngredient(o);

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
          case 'B': case 'K': case 'u': case 'c': case 'p': case 'y': o = c; break;
          case '*': o = '*'; gems++; break;
          case '$': f = '~'; o = '*'; gems++; break; // a coin bobbing on the water
          case 'O': f = '~'; o = 'O'; break;
          case 's': f = 'g'; break;
          case ' ': f = '#'; break;
          case '.': break;
          default: f = c;
        }
        floor.push(f); obj.push(o);
      }
    }
    const s = {
      w, h, floor, obj, hero, trail: hero, dir: 'down',
      gemsLeft: gems, gemsTotal: gems,
      keys: 0, recipe: level.recipe || [], brewed: 0,
      dark: !!level.dark,
      moves: 0, dead: false, won: false,
    };
    petrify(s, []);
    return s;
  }

  function clone(s) {
    return { ...s, floor: s.floor.slice(), obj: s.obj.slice() };
  }

  function neighbor(s, i, dir) {
    const [dx, dy] = DIRS[dir];
    const x = (i % s.w) + dx, y = Math.floor(i / s.w) + dy;
    if (x < 0 || y < 0 || x >= s.w || y >= s.h) return -1;
    return y * s.w + x;
  }

  // Cells lit by fire: everything next to a fire pot or a wall torch (diagonals too).
  function firelight(s) {
    const lit = new Set();
    for (let i = 0; i < s.floor.length; i++) {
      if (s.obj[i] !== 'u' && s.floor[i] !== 'i') continue;
      const x = i % s.w, y = Math.floor(i / s.w);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < s.w && yy < s.h) lit.add(yy * s.w + xx);
      }
    }
    return lit;
  }

  // Any troll standing in firelight turns to stone.
  function petrify(s, events) {
    const lit = firelight(s);
    for (let i = 0; i < s.floor.length; i++) {
      if (s.floor[i] === 'G' && lit.has(i)) {
        s.floor[i] = 'g';
        (s.stoned || (s.stoned = [])).push(i);
        events.push('stone');
      }
    }
  }

  // Cells an awake troll can reach out and grab.
  function trollReach(s) {
    const reach = new Set();
    for (let i = 0; i < s.floor.length; i++) {
      if (s.floor[i] !== 'G') continue;
      for (const d of DIR_LIST) { const nb = neighbor(s, i, d); if (nb >= 0) reach.add(nb); }
    }
    return reach;
  }

  const walkable = f => f === '.' || f === '=' || f === 'o';

  function heroCanEnter(s, i) {
    const f = s.floor[i];
    if (walkable(f)) return true;
    if (f === 'D') return s.gemsLeft === 0;
    if (f === 'L') return s.keys > 0;
    return false;
  }

  // Ingredients and fire pots go over sand and bridges, but not into the water.
  function itemCanEnter(s, i) {
    return i >= 0 && s.obj[i] === '' && walkable(s.floor[i]);
  }

  function crateCanEnter(s, i) {
    return i >= 0 && s.obj[i] === '' && (walkable(s.floor[i]) || s.floor[i] === '~');
  }

  // The boat glides over open water (scooping up any coins it passes).
  function boatCanEnter(s, i) {
    return i >= 0 && s.floor[i] === '~' && (s.obj[i] === '' || s.obj[i] === '*');
  }

  // After every move: fire turns trolls to stone, then any troll still awake grabs a knight next to it.
  function settle(n, events) {
    petrify(n, events);
    if (!n.won && trollReach(n).has(n.hero)) { n.dead = true; n.deathBy = 'grab'; events.push('grab'); }
  }

  // Try to walk one tile. Returns { state, moved, events, push, row } — state is always a new object.
  function step(s, dir) {
    const n = clone(s);
    n.dir = dir;
    n.stoned = null;
    const events = [];
    let push = null;
    const t = neighbor(n, n.hero, dir);
    if (t < 0) return { state: n, moved: false, events: ['bump'] };
    const from = n.hero;
    const onBoat = n.obj[from] === 'O';

    // Paddling: the boat glides until it bumps into something.
    if (onBoat && boatCanEnter(n, t)) {
      const path = [];
      let c = from;
      for (let nx = t; boatCanEnter(n, nx); nx = neighbor(n, nx, dir)) { c = nx; path.push(c); }
      n.obj[from] = '';
      for (const p of path) {
        if (n.obj[p] === '*') { n.obj[p] = ''; n.gemsLeft--; events.push(n.gemsLeft === 0 ? 'unlock' : 'gem'); }
      }
      n.obj[c] = 'O';
      n.hero = c; n.trail = c; // Sabrina is in the boat too
      n.moves++;
      events.unshift('row');
      settle(n, events);
      return { state: n, moved: true, events, from, row: path };
    }

    const o = n.obj[t];
    if (o === 'c') {
      // A coconut rolls until it hits something, or plops into the punch bowl.
      // Coconuts float: one that rolls into the water bobs there as a stepping stone.
      let c = t, into = -1, blockedByBowl = false, float = false;
      for (;;) {
        const nx = neighbor(n, c, dir);
        if (nx >= 0 && n.floor[nx] === 'C') {
          if (n.recipe[n.brewed] === 'c') into = nx; else blockedByBowl = true;
          break;
        }
        if (nx >= 0 && n.floor[nx] === '~' && n.obj[nx] === '') { c = nx; float = true; break; }
        if (!itemCanEnter(n, nx)) break;
        c = nx;
      }
      if (into < 0 && c === t) {
        if (blockedByBowl) return { state: n, moved: false, events: ['fizzle'], wrong: 'c', need: n.recipe[n.brewed] };
        return { state: n, moved: false, events: ['bump'] };
      }
      n.obj[t] = '';
      if (into >= 0) { brewInto(n, into, events); push = { from: t, to: into, item: 'c', into: true, roll: true }; }
      else if (float) { n.floor[c] = 'o'; events.push('roll', 'splash'); push = { from: t, to: c, item: 'c', roll: true, float: true }; }
      else { n.obj[c] = 'c'; events.push('roll'); push = { from: t, to: c, item: 'c', roll: true }; }
    } else if (isPushable(o)) {
      const t2 = neighbor(n, t, dir);
      if (isIngredient(o) && t2 >= 0 && n.floor[t2] === 'C') {
        if (n.recipe[n.brewed] !== o) return { state: n, moved: false, events: ['fizzle'], wrong: o, need: n.recipe[n.brewed] };
        n.obj[t] = '';
        brewInto(n, t2, events);
        push = { from: t, to: t2, item: o, into: true };
      } else if (o === 'B') {
        if (!crateCanEnter(n, t2)) return { state: n, moved: false, events: ['bump'] };
        n.obj[t] = '';
        if (n.floor[t2] === '~') { n.floor[t2] = '='; events.push('splash'); }
        else { n.obj[t2] = 'B'; events.push('push'); }
        push = { from: t, to: t2, item: 'B' };
      } else {
        if (!itemCanEnter(n, t2)) return { state: n, moved: false, events: ['bump'] };
        n.obj[t] = '';
        n.obj[t2] = o;
        events.push(o === 'u' ? 'pushfire' : 'push');
        push = { from: t, to: t2, item: o };
      }
    } else if (o === 'O') {
      // climb into the rowboat
      events.push('board');
    } else if (n.floor[t] === 'J') {
      // Celia's chest: it opens once every coin is collected (you stay put).
      if (n.gemsLeft > 0) return { state: n, moved: false, events: ['chestlocked'] };
      n.floor[t] = 'j';
      n.moves++;
      n.won = true;
      return { state: n, moved: true, events: ['chest', 'win'], from, opened: t };
    } else if (!heroCanEnter(n, t)) {
      return { state: n, moved: false, events: ['bump'] };
    }

    n.hero = t;
    n.trail = o === 'O' ? t : from; // Sabrina steps into the spot you just left (or hops in the boat with you)
    n.moves++;
    if (n.obj[t] === '*') {
      n.obj[t] = '';
      n.gemsLeft--;
      events.push(n.gemsLeft === 0 ? 'unlock' : 'gem');
    } else if (n.obj[t] === 'K') {
      n.obj[t] = '';
      n.keys++;
      events.push('key');
    }
    if (n.floor[t] === 'L') {
      n.floor[t] = '.';
      n.keys--;
      events.push('unlockdoor');
    }
    if (n.floor[t] === 'D') { n.won = true; events.push('win'); }
    if (!push && events.length === 0) events.push('step');
    settle(n, events);
    return { state: n, moved: true, events, push, from };
  }

  function brewInto(n, bowl, events) {
    n.brewed++;
    events.push('plop');
    if (n.brewed === n.recipe.length) {
      n.floor[bowl] = '.'; // the punch bowl turns into a key...
      n.obj[bowl] = 'K';   // ...which you walk over to pick up
      events.push('brew');
    }
  }

  const api = { DIRS, DIR_LIST, INGREDIENTS, isIngredient, isPushable, parse, clone, step, neighbor, firelight, trollReach };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Treasure = api;
})(this);
