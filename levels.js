// The six floors of Thornspire Tower. See logic.js for the map legend.
(function (root) {
  const LEVELS = [
    {
      name: 'The Gatehouse',
      hint: 'Walk into a crate to push it. Collect every gem to open the stairs.',
      map: [
        '###########',
        '#@...#..*.#',
        '#..B.#....#',
        '#....B....#',
        '##.###.##B#',
        '#.....B...#',
        '#*Q#....#D#', // Q: a crate hiding the trapdoor to the basement
        '#..#.*....#',
        '###########',
      ],
    },
    {
      name: 'The Flooded Cellar',
      hint: 'Push a crate into water to make a bridge. Crates are scarce. Don’t waste them!',
      map: [
        '#############',
        '#@.......~..#',
        '#..B..B..~*.#',
        '#........~..#',
        '#####.####~~#',
        '#*..~...B.~*#',
        '#...~.....~.#',
        '#.D.~.....~~#',
        '#############',
      ],
    },
    {
      name: 'The Rubble Hall',
      hint: 'Pick up the hammer, face a cracked rock and press SPACE. Each hammer has only 2 swings.',
      map: [
        '#############',
        '#@..#.....*.#',
        '#.B.#.###R###',
        '#...B.#*....#',
        '##.##.#####.#',
        '#H..R.....R.#',
        '#.###.###.#.#',
        '#*..R.#D..B*#',
        '#############',
      ],
    },
    {
      name: 'The Gargoyle Gallery',
      hint: 'A gargoyle’s glare zaps anyone in its line of sight. Crates block the glare.',
      map: [
        '#############',
        '#@..#..v....#',
        '#.B.#.......#',
        '#...B...#.*.#',
        '>....*....B.#',
        '#.....#.....#',
        '#.##.##.###.#',
        '#*..B....B.D#',
        '#############',
      ],
    },
    {
      name: 'The Witch’s Kitchen',
      hint: 'Push each ingredient into the cauldron in the order on the menu to brew a key. A gargoyle guards the way out, so save that crate!',
      recipe: ['t', 'f', 'w'],
      map: [
        '#############',
        '#@...#..*...#',
        '#.tf.#.###..#',
        '#....L...*..#',
        '##.#####v####',
        '#*.........*#',
        '#.w.B.......#',
        '#....#C#..D*#',
        '#############',
      ],
    },
    {
      name: 'Sabrina’s Chamber',
      hint: 'A pressure plate holds the gate open, but only while something rests on it.',
      map: [
        '#############',
        '#@.....#...*#',
        '#..B...~.B..#',
        '#.B....#....#',
        '#...#####.###',
        '#*..........<',
        '#.#.######|##',
        '#H..R*.._#.S#',
        '#...#....#..#',
        '#############',
      ],
    },
  ];

  // A secret room under the Gatehouse, reached through the trapdoor under a crate on floor 1.
  // It isn't one of the six floors: it doesn't count toward the climb, and the stairs (U)
  // lead back up to floor 1 just as you left it.
  LEVELS.basement = {
    name: 'The Dragon’s Lair',
    hint: 'The dragon breathes fire on every third move. When smoke curls from its nose, it’s about to blow! Crates block the flames. Grab the hoard and climb back up.',
    dragonDir: 'left',
    breath: 3,
    map: [
      '#############',
      '#U@..#..*...#',
      '#..B.#......#',
      '#.........XX#',
      '#*..B.....XX#',
      '#.........XX#',
      '#.#.##.#.####',
      '#*..B..#*..*#',
      '#############',
    ],
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = LEVELS;
  else root.SABRINA_LEVELS = LEVELS;
})(this);
