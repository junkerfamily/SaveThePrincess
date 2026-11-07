// Background music for Saving Sabrina: one looping tune per floor, played with Web Audio
// notes (no sound files). Songs are data, so they can be checked in Node.
//
// Each track has one token per eighth-note step: a note (C4, F#3, Bb2) or '.' for a rest.
// '|' marks bar lines and is ignored. Drum tokens: k kick, K big kick, s snare, h hat,
// t tick, d water drip, b bubble pop.
(function (root) {
  const rep = (str, n) => Array(n).fill(str).join(' | ');

  // Instrument presets. vol is peak gain, len is how many steps a note rings.
  const LEAD = { wave: 'square', vol: 0.05, len: 0.9, cutoff: 2600 };
  const BELL = { wave: 'triangle', vol: 0.09, len: 1.8 };
  const SOFT = { wave: 'sine', vol: 0.08, len: 2.5, vib: 0.006, attack: 0.04 };
  const BASS = { wave: 'triangle', vol: 0.12, len: 0.9 };
  const PAD = { wave: 'sine', vol: 0.06, len: 8, attack: 0.3 };
  const HARP = { wave: 'triangle', vol: 0.06, len: 3, pluck: true };

  const HARP_ARPS = 'F3 A3 C4 F4 A4 F4 C4 A3 | Bb2 D3 F3 Bb3 D4 Bb3 F3 D3 | D3 F3 A3 D4 F4 D4 A3 F3 | C3 E3 G3 C4 E4 C4 G3 E3';
  const CHAMBER_BASS = 'F2 . . . . . . . | Bb1 . . . . . . . | D2 . . . . . . . | C2 . . . . . . .';

  const SONGS = {
    // Title screen: Sabrina's lullaby, harp only.
    title: {
      bpm: 76,
      tracks: [
        { ...HARP, vol: 0.055, notes: HARP_ARPS },
        { ...PAD, notes: CHAMBER_BASS },
      ],
    },
    // 1. The Gatehouse: a bright little march.
    0: {
      bpm: 112,
      tracks: [
        { ...LEAD, notes: 'C5 . G4 . C5 E5 G5 . | F5 . E5 D5 C5 . D5 . | E5 . C5 . A4 . C5 . | D5 . B4 . G4 . . . | C5 . G4 . C5 E5 G5 . | A5 . G5 F5 E5 . D5 . | C5 . E5 . D5 . B4 . | C5 . . . . . . .' },
        { ...BASS, notes: 'C3 . G2 . C3 . G2 . | F2 . C3 . F2 . C3 . | A2 . E3 . A2 . E3 . | G2 . D3 . G2 . B2 . | C3 . G2 . C3 . G2 . | F2 . C3 . F2 . C3 . | G2 . D3 . G2 . D3 . | C3 . G2 . C3 . . .' },
        { drums: rep('k h s h k h s h', 7) + ' | k h s h k s s s' },
      ],
    },
    // 2. The Flooded Cellar: slow and watery, with drips.
    1: {
      bpm: 72,
      tracks: [
        { ...SOFT, notes: 'D5 . . F5 E5 . . C5 | D5 . . . A4 . . . | G4 . A4 . C5 . B4 . | A4 . . . . . . . | F5 . . E5 D5 . . C5 | D5 . . . A4 . . . | B4 . C5 . D5 . E5 . | D5 . . . . . . .' },
        { ...PAD, vol: 0.08, notes: 'D3 . . . . . . . | A2 . . . . . . . | G2 . . . . . . . | A2 . . . . . . . | D3 . . . . . . . | A2 . . . . . . . | G2 . . . . . . . | D3 . . . . . . .' },
        { ...HARP, vol: 0.03, notes: rep('A5 . . D6 . . F5 .', 1) + ' | ' + rep('. . . . . . . .', 3) },
        { drums: rep('d . . . . . d . | . . . d . . . . | d . . . . . . d | . . d . . . . .', 2) },
      ],
    },
    // 3. The Rubble Hall: heavy and stompy.
    2: {
      bpm: 92,
      tracks: [
        { wave: 'sawtooth', vol: 0.09, len: 0.8, cutoff: 520, notes: 'E2 E2 . E2 G2 . E2 . | D2 D2 . D2 F#2 . D2 . | C2 C2 . C2 E2 . C2 . | B1 B1 . B1 D#2 . B1 . | E2 E2 . E2 G2 . E2 . | D2 D2 . D2 F#2 . D2 . | C2 C2 . C2 E2 . C2 . | E2 E2 . E2 B1 . E2 .' },
        { ...BELL, notes: 'E4 . . G4 . . B4 . | A4 . G4 . F#4 . . . | G4 . . E4 . . C5 . | B4 . . . D#4 . . . | B4 . . A4 . . G4 . | F#4 . . A4 . . D4 . | E4 . G4 . C5 . B4 . | E4 . . . . . . .' },
        { drums: rep('K . h K s . h . | K . h K s . h h', 4) },
      ],
    },
    // 4. The Gargoyle Gallery: creeping and tense.
    3: {
      bpm: 100,
      tracks: [
        { wave: 'square', vol: 0.035, len: 0.45, cutoff: 1800, notes: 'A3 E4 A3 E4 A3 F4 A3 E4 | A3 E4 A3 E4 G#3 E4 G#3 D4 | F3 C4 F3 C4 F3 D4 F3 C4 | E3 B3 E3 B3 G#3 E4 G#3 B3' },
        { ...SOFT, len: 6, notes: 'A4 . . . . . . . | B4 . . . . . E4 . | C5 . . . . . D5 . | B4 . . . G#4 . . . | E5 . . . . . . . | D5 . . . . . C5 . | A4 . . . . . F4 . | E4 . . . G#4 . . .' },
        { ...BASS, len: 3, notes: 'A2 . . . A2 . . . | A2 . . . E2 . . . | F2 . . . F2 . . . | E2 . . . E2 . . .' },
        { drums: rep('k . t . . k t .', 4) },
      ],
    },
    // 5. The Witch's Kitchen: a bouncy, bubbling 6/8 jig.
    4: {
      bpm: 150,
      tracks: [
        { wave: 'square', vol: 0.06, len: 0.8, cutoff: 700, notes: 'G2 . D3 G2 . D3 | Eb2 . Bb2 Eb2 . Bb2 | C3 . G3 C3 . G3 | D2 . A2 D2 . F#2 | G2 . D3 G2 . D3 | Eb2 . Bb2 Eb2 . Bb2 | D2 . A2 D2 . F#2 | G2 . D3 G2 . .' },
        { ...BELL, len: 0.9, notes: 'G4 A4 Bb4 D5 . Bb4 | Eb5 . D5 C5 . Bb4 | C5 D5 Eb5 G5 . Eb5 | D5 . C5 A4 F#4 . | G4 A4 Bb4 D5 . G5 | F5 . Eb5 D5 . C5 | Bb4 . A4 G4 . F#4 | G4 . . . . .' },
        { drums: rep('b . . h . . | b . . h . b', 4) },
      ],
    },
    // 6. Sabrina's Chamber: a warm, hopeful waltz of harp and voice.
    5: {
      bpm: 80,
      tracks: [
        { ...HARP, notes: HARP_ARPS },
        { ...SOFT, notes: 'A4 . . C5 . . F5 . | D5 . . . . . Bb4 . | A4 . F4 . A4 . D5 . | C5 . . . . . . . | A4 . . C5 . . F5 . | G5 . . F5 . . E5 . | F5 . D5 . C5 . A4 . | G4 . . . . . . .' },
        { ...PAD, notes: CHAMBER_BASS },
      ],
    },
  };
  // The finale replays Sabrina's theme a little faster.
  SONGS.finale = { ...SONGS[5], bpm: 92 };

  const tokens = s => s.split(/\s+/).filter(x => x && x !== '|');
  const NOTE_RE = /^([A-G])(#|b)?(-?\d)$/;
  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function freqOf(n) {
    const m = NOTE_RE.exec(n);
    if (!m) return null;
    const midi = 12 * (+m[3] + 1) + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // A looping player. getCtx() returns the AudioContext (or null when sound is off);
  // getDest() returns the node the music plays into.
  function createPlayer(getCtx, getDest) {
    let bus = null, timer = null, song = null, current = null, step = 0, nextT = 0, noiseBuf = null;

    function prep(s) {
      if (s._ready) return s;
      for (const tr of s.tracks) tr.seq = tokens(tr.drums || tr.notes);
      s.length = Math.max(...s.tracks.map(tr => tr.seq.length));
      s._ready = true;
      return s;
    }

    function voice(a, t, f, stepDur, tr) {
      const dur = stepDur * tr.len;
      const o = a.createOscillator(), g = a.createGain();
      o.type = tr.wave; o.frequency.setValueAtTime(f, t);
      const atk = tr.attack || 0.01;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(tr.vol, t + atk);
      g.gain.exponentialRampToValueAtTime(tr.vol * (tr.pluck ? 0.12 : 0.55), t + Math.max(atk + 0.01, dur * 0.6));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
      let out = o;
      if (tr.cutoff) { const fl = a.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = tr.cutoff; out.connect(fl); out = fl; }
      out.connect(g).connect(bus);
      if (tr.vib) {
        const l = a.createOscillator(), lg = a.createGain();
        l.frequency.value = 5; lg.gain.value = f * tr.vib;
        l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur + 0.1);
      }
      o.start(t); o.stop(t + dur + 0.1);
    }

    function noise(a, t, dur, vol, type, freq) {
      if (!noiseBuf) {
        noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const src = a.createBufferSource(); src.buffer = noiseBuf;
      const f = a.createBiquadFilter(); f.type = type; f.frequency.value = freq;
      const g = a.createGain();
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(bus);
      src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
    }

    function thump(a, t, from, to, dur, vol, wave = 'sine') {
      const o = a.createOscillator(), g = a.createGain();
      o.type = wave;
      o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.02);
    }

    function drum(a, t, k) {
      if (k === 'k') thump(a, t, 140, 45, 0.18, 0.35);
      else if (k === 'K') { thump(a, t, 110, 35, 0.3, 0.5); noise(a, t, 0.08, 0.08, 'lowpass', 400); }
      else if (k === 's') { noise(a, t, 0.14, 0.14, 'highpass', 1500); thump(a, t, 220, 140, 0.06, 0.08, 'triangle'); }
      else if (k === 'h') noise(a, t, 0.04, 0.05, 'highpass', 7000);
      else if (k === 't') thump(a, t, 1800, 1700, 0.03, 0.04, 'square');
      else if (k === 'd') thump(a, t, 900 + Math.random() * 500, 2400, 0.12, 0.09);
      else if (k === 'b') thump(a, t, 260 + Math.random() * 120, 700, 0.09, 0.12);
    }

    function tick() {
      const a = getCtx();
      if (!a || !bus) return;
      const stepDur = 60 / song.bpm / 2;
      // after a stall (background tab) skip ahead instead of playing a pile-up of notes
      if (nextT < a.currentTime - 0.05) nextT = a.currentTime + 0.05;
      while (nextT < a.currentTime + 0.2) {
        for (const tr of song.tracks) {
          const tok = tr.seq[step % tr.seq.length];
          if (tok === '.') continue;
          if (tr.drums) drum(a, nextT, tok);
          else { const f = freqOf(tok); if (f) voice(a, nextT, f, stepDur, tr); }
        }
        nextT += stepDur;
        step = (step + 1) % song.length;
      }
    }

    function stop() {
      clearInterval(timer); timer = null;
      const a = getCtx();
      if (bus && a) {
        const old = bus;
        old.gain.cancelScheduledValues(a.currentTime);
        old.gain.setValueAtTime(old.gain.value, a.currentTime);
        old.gain.linearRampToValueAtTime(0, a.currentTime + 0.4);
        setTimeout(() => old.disconnect(), 600);
      } else if (bus) bus.disconnect();
      bus = null; current = null;
    }

    function play(id) {
      if (id === current && bus) return;
      stop();
      const a = getCtx();
      if (!a || !SONGS[id]) return;
      song = prep(SONGS[id]); current = id; step = 0;
      bus = a.createGain();
      bus.gain.setValueAtTime(0, a.currentTime);
      bus.gain.linearRampToValueAtTime(1, a.currentTime + 0.8);
      bus.connect(getDest());
      nextT = a.currentTime + 0.1;
      tick();
      timer = setInterval(tick, 40);
    }

    return { play, stop, get current() { return current; } };
  }

  const api = { SONGS, createPlayer, tokens, freqOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SabrinaMusic = api;
})(this);
