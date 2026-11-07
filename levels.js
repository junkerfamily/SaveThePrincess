// The five floors of Thornspire Tower. See logic.js for the map legend.
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
        '#*.#....#D#',
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
  if (typeof module !== 'undefined' && module.exports) module.exports = LEVELS;
  else root.SABRINA_LEVELS = LEVELS;
})(this);
