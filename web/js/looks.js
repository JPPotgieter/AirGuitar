// Everything the player can customise: avatar options and the guitar collection.

export const AVATAR_OPTIONS = {
  skin: { label: 'Skin', type: 'color', values: ['#f8d5b0', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a1e'] },
  hairStyle: {
    label: 'Hair',
    type: 'chip',
    values: ['spiky', 'long', 'mohawk', 'afro', 'buzz', 'bald'],
    names: { spiky: 'Spiky', long: 'Long', mohawk: 'Mohawk', afro: 'Afro', buzz: 'Buzz cut', bald: 'Bald' },
  },
  hairColor: {
    label: 'Hair colour',
    type: 'color',
    values: ['#2b1b12', '#0d0d0d', '#8b4513', '#e8c26b', '#d1d5db', '#ff4fa3', '#3b82f6', '#22c55e'],
  },
  eyewear: {
    label: 'Eyes',
    type: 'chip',
    values: ['shades', 'none', 'round', 'star'],
    names: { shades: '😎 Shades', none: '👀 None', round: '🤓 Round', star: '⭐ Star' },
  },
  hat: {
    label: 'Hat',
    type: 'chip',
    values: ['none', 'cap', 'cowboy', 'beanie'],
    names: { none: 'None', cap: '🧢 Cap', cowboy: '🤠 Cowboy', beanie: 'Beanie' },
  },
  shirt: {
    label: 'Shirt',
    type: 'color',
    values: ['#1f2937', '#dc2626', '#2563eb', '#16a34a', '#7c3aed', '#f59e0b', '#ec4899', '#f9fafb'],
  },
  pants: { label: 'Pants', type: 'color', values: ['#111827', '#1e3a8a', '#4b5563', '#7f1d1d', '#a16207', '#f5f5f4'] },
  accent: { label: 'Hat & pick', type: 'color', values: ['#f43f5e', '#facc15', '#22d3ee', '#a3e635', '#f97316', '#f9fafb'] },
};

export const DEFAULT_LOOK = {
  skin: '#f1c27d',
  hairStyle: 'spiky',
  hairColor: '#2b1b12',
  eyewear: 'shades',
  hat: 'none',
  shirt: '#1f2937',
  pants: '#111827',
  accent: '#f43f5e',
};

// shape: body outline drawn by the renderer. body: [centre, edge] gradient. tone: default sound.
export const GUITARS = {
  acoustic: {
    name: 'Acoustic',
    emoji: '🪕',
    shape: 'acoustic',
    body: ['#ffcf6b', '#d9731f', '#4a1d06'],
    outline: '#2a1204',
    head: '#3a1f08',
    strap: '#3b0d0d',
    tone: 'acoustic',
  },
  classic: {
    name: 'Classic Red',
    emoji: '🎸',
    shape: 'strat',
    body: ['#ff4d4d', '#b91c1c', '#4c0000'],
    outline: '#ffffff',
    head: '#f5deb3',
    guard: '#f9fafb',
    strap: '#111111',
    tone: 'rock',
  },
  goldtop: {
    name: 'Gold Top',
    emoji: '✨',
    shape: 'lespaul',
    body: ['#fff1a8', '#d4a017', '#5c4100'],
    outline: '#fef3c7',
    head: '#111111',
    guard: '#f5f5f4',
    strap: '#5b3412',
    tone: 'rock',
  },
  flyingv: {
    name: 'Flying V',
    emoji: '⚡',
    shape: 'flyingv',
    body: ['#4b5563', '#111111', '#000000'],
    outline: '#e5e7eb',
    head: '#111111',
    guard: '#f9fafb',
    strap: '#7c3aed',
    tone: 'rock',
  },
  star: {
    name: 'Neon Star',
    emoji: '🌟',
    shape: 'star',
    body: ['#fdf2f8', '#ec4899', '#6d28d9'],
    outline: '#22d3ee',
    head: '#6d28d9',
    guard: '#22d3ee',
    strap: '#22d3ee',
    tone: 'rock',
  },
};

export function randomLook() {
  const look = {};
  for (const [k, opt] of Object.entries(AVATAR_OPTIONS)) {
    look[k] = opt.values[Math.floor(Math.random() * opt.values.length)];
  }
  return look;
}
