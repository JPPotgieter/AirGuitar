// Chord shapes are written low E -> high E. 'x' = muted string.
// Standard tuning as MIDI note numbers.
export const TUNING = [40, 45, 50, 55, 59, 64];

const SHAPES = {
  G: [3, 2, 0, 0, 0, 3],
  C: ['x', 3, 2, 0, 1, 0],
  D: ['x', 'x', 0, 2, 3, 2],
  Em: [0, 2, 2, 0, 0, 0],
  Am: ['x', 0, 2, 2, 1, 0],
  F: [1, 3, 3, 2, 1, 1],
  E: [0, 2, 2, 1, 0, 0],
  A: ['x', 0, 2, 2, 2, 0],
  Dm: ['x', 'x', 0, 2, 3, 1],
  A7: ['x', 0, 2, 0, 2, 0],
  D7: ['x', 'x', 0, 2, 1, 2],
  E7: [0, 2, 0, 1, 0, 0],
  B7: ['x', 2, 1, 2, 0, 2],
  E5: [0, 2, 2, 'x', 'x', 'x'],
  G5: [3, 5, 5, 'x', 'x', 'x'],
  A5: ['x', 0, 2, 2, 'x', 'x'],
  C5: ['x', 3, 5, 5, 'x', 'x'],
  D5: ['x', 5, 7, 7, 'x', 'x'],
  B5: ['x', 2, 4, 4, 'x', 'x'],
};

// Ordered from the headstock end of the neck towards the guitar body.
export const PRESETS = {
  campfire: { name: 'Campfire', chords: ['G', 'C', 'D', 'Em', 'Am', 'F'], tone: 'acoustic' },
  rock: { name: 'Rock', chords: ['E5', 'G5', 'A5', 'C5', 'D5', 'B5'], tone: 'rock' },
  blues: { name: 'Blues in A', chords: ['A7', 'D7', 'E7', 'B7'], tone: 'acoustic' },
  moody: { name: 'Moody', chords: ['Am', 'F', 'C', 'G', 'Dm', 'E'], tone: 'acoustic' },
};

export function chordFrequencies(name) {
  return SHAPES[name].map((fret, i) =>
    fret === 'x' ? null : 440 * Math.pow(2, (TUNING[i] + fret - 69) / 12)
  );
}
