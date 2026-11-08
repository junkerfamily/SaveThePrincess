// Songs for the treasure hunt. They plug into the tower game's music player (../music.js),
// so the format is the same: one token per eighth-note step, '.' for a rest, '|' for bar lines.
(function (root) {
  const M = (typeof module !== 'undefined' && module.exports) ? require('../music.js') : root.SabrinaMusic;
  const rep = (str, n) => Array(n).fill(str).join(' | ');

  const LEAD = { wave: 'square', vol: 0.05, len: 0.9, cutoff: 2600 };
  const BELL = { wave: 'triangle', vol: 0.09, len: 1.8 };
  const SOFT = { wave: 'sine', vol: 0.08, len: 2.5, vib: 0.006, attack: 0.04 };
  const BASS = { wave: 'triangle', vol: 0.12, len: 0.9 };
  const PAD = { wave: 'sine', vol: 0.06, len: 8, attack: 0.3 };
  const HARP = { wave: 'triangle', vol: 0.06, len: 3, pluck: true };

  const SONGS = {
    // Title: a slow sea shanty.
    tTitle: {
      bpm: 92,
      tracks: [
        { ...SOFT, notes: 'D5 . . A4 D5 . F5 . | E5 . D5 . C5 . A4 . | Bb4 . . A4 G4 . Bb4 . | A4 . . . . . . . | D5 . . A4 D5 . F5 . | G5 . F5 . E5 . D5 . | C5 . A4 . E5 . C#5 . | D5 . . . . . . .' },
        { ...HARP, vol: 0.04, notes: 'D3 A3 D4 A3 D3 A3 D4 A3 | A2 E3 A3 E3 A2 E3 A3 E3 | G2 D3 G3 D3 G2 D3 G3 D3 | A2 E3 A3 C#4 A2 E3 A3 C#4 | D3 A3 D4 A3 D3 A3 D4 A3 | Bb2 F3 Bb3 F3 Bb2 F3 Bb3 F3 | A2 E3 A3 E3 A2 E3 C#4 E3 | D3 A3 D4 A3 D3 . . .' },
        { ...PAD, notes: 'D3 . . . . . . . | A2 . . . . . . . | G2 . . . . . . . | A2 . . . . . . . | D3 . . . . . . . | Bb2 . . . . . . . | A2 . . . . . . . | D3 . . . . . . .' },
      ],
    },
    // The Boat House: a jaunty rowing song.
    tBoat: {
      bpm: 120,
      tracks: [
        { ...LEAD, notes: 'G4 . B4 . D5 . B4 . | C5 . E5 . D5 . B4 . | A4 . C5 . B4 . G4 . | A4 . D5 . . . . . | G4 . B4 . D5 . G5 . | E5 . C5 . D5 . B4 . | A4 . F#4 . A4 . C5 . | B4 . G4 . G4 . . .' },
        { ...BASS, notes: 'G2 . D3 . G2 . D3 . | C3 . G2 . G2 . D3 . | D3 . A2 . G2 . D3 . | D3 . A2 . D3 . F#2 . | G2 . D3 . G2 . D3 . | C3 . G2 . G2 . D3 . | D3 . A2 . D3 . A2 . | G2 . D3 . G2 . . .' },
        { drums: rep('k . h . s . h . | k . h k s . h .', 4) },
      ],
    },
    // Tiki Island: marimba and ukulele.
    tTiki: {
      bpm: 104,
      tracks: [
        { ...BELL, notes: 'E5 . G5 . E5 D5 C5 . | D5 . E5 . C5 . A4 . | G4 . C5 . E5 . G5 . | F5 . E5 . D5 . . . | E5 . G5 . A5 G5 E5 . | D5 . C5 . A4 . C5 . | D5 . E5 . D5 . B4 . | C5 . . . . . . .' },
        { ...HARP, vol: 0.045, len: 1.5, notes: 'C4 E4 G4 . C4 E4 G4 . | F3 A3 C4 . F3 A3 C4 . | C4 E4 G4 . C4 E4 G4 . | G3 B3 D4 . G3 B3 D4 . | C4 E4 G4 . C4 E4 G4 . | F3 A3 C4 . F3 A3 C4 . | G3 B3 D4 . G3 B3 D4 . | C4 E4 G4 . C4 . . .' },
        { ...BASS, notes: 'C3 . . C3 G2 . . . | F2 . . F2 C3 . . . | C3 . . C3 G2 . . . | G2 . . G2 D3 . . . | C3 . . C3 G2 . . . | F2 . . F2 C3 . . . | G2 . . G2 D3 . . . | C3 . . . G2 . . .' },
        { drums: rep('k t . t s t . t', 8) },
      ],
    },
    // Troll Island: dark tunnels, dripping water, big slow footsteps.
    tTroll: {
      bpm: 80,
      tracks: [
        { wave: 'sawtooth', vol: 0.08, len: 1.6, cutoff: 420, notes: rep('E2 . . . E2 . G2 . | F#2 . . . F#2 . A2 . | E2 . . . E2 . G2 . | D#2 . . . B1 . . .', 2) },
        { ...BELL, vol: 0.06, notes: 'B4 . . . . . . . | C5 . . B4 . . . . | G4 . . . . . . . | F#4 . . . D#4 . . . | E4 . . . G4 . . . | A4 . . G4 . . F#4 . | E4 . . . . . . . | D#4 . . . B3 . . .' },
        { drums: rep('d . . . K . . . | . . d . K . . . | d . . . K . . d | . . . . K . K .', 2) },
      ],
    },
    // Sailing between islands.
    tVoyage: {
      bpm: 84,
      tracks: [
        { ...SOFT, notes: 'A4 . . C5 F5 . . E5 | D5 . . C5 A4 . . . | Bb4 . . D5 G5 . . F5 | E5 . . . . . . . | A4 . . C5 F5 . . A5 | G5 . . F5 D5 . . . | E5 . . G5 C5 . . E5 | F5 . . . . . . .' },
        { ...HARP, vol: 0.045, notes: 'F3 A3 C4 F4 C4 A3 F3 A3 | D3 F3 A3 D4 A3 F3 D3 F3 | G2 Bb2 D3 G3 D3 Bb2 G2 Bb2 | C3 E3 G3 C4 G3 E3 C3 E3 | F3 A3 C4 F4 C4 A3 F3 A3 | Bb2 D3 F3 Bb3 F3 D3 Bb2 D3 | C3 E3 G3 C4 G3 E3 C3 E3 | F3 A3 C4 F4 C4 . . .' },
        { ...PAD, notes: 'F2 . . . . . . . | D2 . . . . . . . | G2 . . . . . . . | C2 . . . . . . . | F2 . . . . . . . | Bb1 . . . . . . . | C2 . . . . . . . | F2 . . . . . . .' },
      ],
    },
    // The treasure!
    tFinale: {
      bpm: 108,
      tracks: [
        { ...LEAD, notes: 'C5 . E5 . G5 . C6 . | B5 . G5 . A5 . . . | F5 . A5 . C6 . A5 . | G5 . . . . . . . | E5 . G5 . C6 . E6 . | D6 . C6 . A5 . F5 . | G5 . B5 . D6 . B5 . | C6 . . . . . . .' },
        { ...BELL, vol: 0.05, notes: 'G4 . C5 . E5 . G5 . | G4 . B4 . E5 . . . | A4 . C5 . F5 . . . | G4 . B4 . D5 . . . | G4 . C5 . E5 . G5 . | F4 . A4 . C5 . F5 . | G4 . B4 . D5 . F5 . | E5 . . . . . . .' },
        { ...BASS, notes: 'C3 . G2 . C3 . G2 . | E3 . B2 . A2 . E3 . | F2 . C3 . F2 . C3 . | G2 . D3 . G2 . B2 . | C3 . G2 . C3 . G2 . | F2 . C3 . F2 . A2 . | G2 . D3 . G2 . B2 . | C3 . G2 . C3 . . .' },
        { drums: rep('k . h . s . h . | k . h . s . s s', 4) },
      ],
    },
  };
  Object.assign(M.SONGS, SONGS);
  if (typeof module !== 'undefined' && module.exports) module.exports = SONGS;
})(this);
