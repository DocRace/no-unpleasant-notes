export type PhraseKind = "single" | "chord" | "arp" | "motif";

/** Offset in quarter-note beats from the start of the phrase (not seconds). */
export type PlayEvent = {
  beat: number;
  midis: number[];
  duration: string;
};

const PC = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export function midiToLabel(midi: number): string {
  return `${PC[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

/** EasyScore pitch like C#4 */
export function midiToEasyPitch(midi: number): string {
  const n = PC[midi % 12];
  const oct = Math.floor(midi / 12) - 1;
  return `${n}${oct}`;
}

function randInt(a: number, b: number): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)]!;
}

/** Spicy steps from a root (in semitones) for "no wrong notes" color. */
const CHORD_SHAPES: number[][] = [
  [0, 4, 7],
  [0, 3, 7],
  [0, 5, 7],
  [0, 4, 7, 10],
  [0, 4, 7, 11],
  [0, 3, 6], // diminished color
  [0, 6, 10], // tritone-ish
  [0, 1, 7], // minor second rub
  [0, 11, 7], // maj7 reorder
  [0, 2, 6, 9], // quartal stack
  [0, 5, 11],
  [0, 7, 13], // spread (if in range clamp)
];

const SPICY_INTERVALS = [1, 6, 10, 11, 13, 14]; // semitones to sprinkle on arps

/**
 * Grand-staff box: melodic techno arps often jump the split; notation uses
 * treble vs bass by register (below C4 → bass staff, C4+ → treble).
 */
const MIDI_GRAND_LO = 50;
const MIDI_GRAND_HI = 72;
/** Notes below this MIDI go on the bass staff; C4 and above on treble. */
const STAFF_SPLIT_MIDI = 60;

const MIDI_TREBLE_LO = 63;
const MIDI_TREBLE_HI = 72;
const MIDI_BASS_LO = 51;
const MIDI_BASS_HI = 56;

const REST_LINE_T = "D5/q/r";
const REST_LINE_B = "F3/q/r";

function twoRests(clef: "treble" | "bass"): string {
  const r = clef === "treble" ? REST_LINE_T : REST_LINE_B;
  return [r, r].join(", ");
}

const REST16_T = "D5/16/r";
const REST16_B = "F3/16/r";
const REST32_T = "D5/32/r";
const REST32_B = "F3/32/r";
const REST64_T = "D5/64/r";
const REST64_B = "F3/64/r";

/** Dense grid for one 2/4 bar: 8×16th, 16×32nd, or 32×64th slots (= 2 quarter beats). */
type GridDen = 16 | 32 | 64;

const GRID_DENS: GridDen[] = [16, 32, 64];

/** 2/4 bar: quarter note + quarter rest. */
function measureTrebleActiveFirst(pitch: string): string {
  return `${pitch}/q, ${REST_LINE_T}`;
}

function measureBassActiveFirst(pitch: string): string {
  return `${pitch}/q, ${REST_LINE_B}`;
}

function measureBassOnlyRests(): string {
  return twoRests("bass");
}

function measureTrebleOnlyRests(): string {
  return twoRests("treble");
}

export type Phrase = {
  kind: PhraseKind;
  kindLabel: string;
  /** Annotation / HUD line */
  noteNames: string;
  trebleScoreLine: string;
  bassScoreLine: string;
  beamOnTrebleIndices: number[] | null;
  beamOnBassIndices: number[] | null;
  play: PlayEvent[];
};

/** Default loop / phrase tempo in the UI. */
export const PHRASE_BPM = 128;

/** 2/4: one bar = this many quarter-note beats (for Transport / loop math). */
export const BEATS_PER_BAR = 2;

const BEAT_STEP_16TH = 0.25;
const BEAT_STEP_32ND = 0.125;
const BEAT_STEP_64TH = 0.0625;

function clampMidi(m: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, m));
}

function gridDenToLabel(den: GridDen): string {
  return den === 16 ? "16ths" : den === 32 ? "32nds" : "64ths";
}

/** One slot: rest both staves, or pitch on one staff + matching rest on the other. */
function buildGrandStaffDenseGrid(
  den: GridDen,
  seq: number[],
  restChance: number
): Pick<
  Phrase,
  | "trebleScoreLine"
  | "bassScoreLine"
  | "play"
  | "beamOnTrebleIndices"
  | "beamOnBassIndices"
> {
  const slotCount = den === 16 ? 8 : den === 32 ? 16 : 32;
  const toneDur = den === 16 ? "16n" : den === 32 ? "32n" : "64n";
  const beatStep =
    den === 16 ? BEAT_STEP_16TH : den === 32 ? BEAT_STEP_32ND : BEAT_STEP_64TH;
  const restT = den === 16 ? REST16_T : den === 32 ? REST32_T : REST64_T;
  const restB = den === 16 ? REST16_B : den === 32 ? REST32_B : REST64_B;
  const trebleParts: string[] = [];
  const bassParts: string[] = [];
  const play: PlayEvent[] = [];
  const beamT: number[] = [];
  const beamB: number[] = [];
  const sl = seq.length;

  for (let i = 0; i < slotCount; i++) {
    const isRest = Math.random() < restChance;
    if (isRest) {
      trebleParts.push(restT);
      bassParts.push(restB);
      continue;
    }
    const m = seq[i % sl]!;
    const tok = `${midiToEasyPitch(m)}/${den}`;
    if (m < STAFF_SPLIT_MIDI) {
      bassParts.push(tok);
      trebleParts.push(restT);
      beamB.push(i);
    } else {
      trebleParts.push(tok);
      bassParts.push(restB);
      beamT.push(i);
    }
    play.push({ beat: i * beatStep, midis: [m], duration: toneDur });
  }

  return {
    trebleScoreLine: trebleParts.join(", "),
    bassScoreLine: bassParts.join(", "),
    play,
    beamOnTrebleIndices: beamT.length >= 2 ? beamT : null,
    beamOnBassIndices: beamB.length >= 2 ? beamB : null,
  };
}

function singlePhrase(): Phrase {
  if (Math.random() < 0.42) {
    const loN = randInt(MIDI_GRAND_LO, STAFF_SPLIT_MIDI - 1);
    const hiN = randInt(STAFF_SPLIT_MIDI, MIDI_GRAND_HI);
    const bassFirst = Math.random() < 0.5;
    const [first, second] = bassFirst ? [loN, hiN] : [hiN, loN];
    const p1 = midiToEasyPitch(first);
    const p2 = midiToEasyPitch(second);
    const trebleLine = bassFirst
      ? `${REST_LINE_T}, ${p2}/q`
      : `${p1}/q, ${REST_LINE_T}`;
    const bassLine = bassFirst
      ? `${p1}/q, ${REST_LINE_B}`
      : `${REST_LINE_B}, ${p2}/q`;
    return {
      kind: "single",
      kindLabel: "Cross-staff (2)",
      noteNames: `${midiToLabel(loN)} · ${midiToLabel(hiN)}`,
      trebleScoreLine: trebleLine,
      bassScoreLine: bassLine,
      beamOnTrebleIndices: null,
      beamOnBassIndices: null,
      play: [
        { beat: 0, midis: [first], duration: "4n" },
        { beat: 1, midis: [second], duration: "4n" },
      ],
    };
  }

  const trebleStaff = Math.random() < 0.55;
  const midi = trebleStaff
    ? randInt(MIDI_TREBLE_LO, MIDI_TREBLE_HI)
    : randInt(MIDI_BASS_LO, MIDI_BASS_HI);
  const p = midiToEasyPitch(midi);
  return {
    kind: "single",
    kindLabel: "Single note",
    noteNames: midiToLabel(midi),
    trebleScoreLine: trebleStaff ? measureTrebleActiveFirst(p) : measureTrebleOnlyRests(),
    bassScoreLine: trebleStaff ? measureBassOnlyRests() : measureBassActiveFirst(p),
    beamOnTrebleIndices: null,
    beamOnBassIndices: null,
    play: [
      {
        beat: 0,
        midis: [midi],
        duration: "4n",
      },
    ],
  };
}

function chordPhrase(): Phrase {
  const lo = MIDI_GRAND_LO;
  const hi = MIDI_GRAND_HI;
  const root = randInt(lo, hi - 2);
  let shape = pick(CHORD_SHAPES).map((s) => clampMidi(root + s, lo, hi));
  shape = [...new Set(shape)].sort((a, b) => a - b);
  if (shape.length < 2) shape = [root, clampMidi(root + pick(SPICY_INTERVALS), lo, hi)];

  const lows = shape.filter((m) => m < STAFF_SPLIT_MIDI);
  const highs = shape.filter((m) => m >= STAFF_SPLIT_MIDI);

  let trebleLine: string;
  let bassLine: string;
  /* EasyScore: pitches inside () must be concatenated, not comma-separated. */
  if (lows.length && highs.length) {
    trebleLine = `(${highs.map(midiToEasyPitch).join("")})/h`;
    bassLine = `(${lows.map(midiToEasyPitch).join("")})/h`;
  } else if (highs.length) {
    trebleLine = `(${highs.map(midiToEasyPitch).join("")})/h`;
    bassLine = measureBassOnlyRests();
  } else {
    trebleLine = measureTrebleOnlyRests();
    bassLine = `(${lows.map(midiToEasyPitch).join("")})/h`;
  }

  return {
    kind: "chord",
    kindLabel: "Chord",
    noteNames: shape.map(midiToLabel).join(" · "),
    trebleScoreLine: trebleLine,
    bassScoreLine: bassLine,
    beamOnTrebleIndices: null,
    beamOnBassIndices: null,
    play: [
      {
        beat: 0,
        midis: shape,
        duration: "2n",
      },
    ],
  };
}

/** Dense 2/4 arp: full bar of 32nds or 64ths; may split across treble & bass. */
function arpPhrase(): Phrase {
  const lo = MIDI_GRAND_LO;
  const hi = MIDI_GRAND_HI;
  /* Short pitch set (the chord outline), then tiled through the bar. */
  const len = randInt(4, 7);
  const up = Math.random() < 0.72;
  const start = randInt(lo, Math.max(lo, hi - len));
  const seq: number[] = [];
  const upSteps = [1, 1, 1, 1, 2, 2];
  const downSteps = [1, 1, 1, 2, 2];
  let cur = start;
  for (let i = 0; i < len; i++) {
    seq.push(clampMidi(cur, lo, hi));
    if (i === len - 1) break;
    let step = up ? pick(upSteps) : pick(downSteps);
    if (Math.random() < 0.12) step = 3;
    cur += (up ? 1 : -1) * step;
    if (Math.random() < 0.07) {
      cur += pick(SPICY_INTERVALS) * (Math.random() < 0.5 ? 1 : -1);
    }
  }

  const den = pick(GRID_DENS);
  const grid = buildGrandStaffDenseGrid(den, seq, 0.07);

  return {
    kind: "arp",
    kindLabel: `Arpeggio · ${gridDenToLabel(den)}`,
    noteNames: seq.map(midiToLabel).join(" → "),
    trebleScoreLine: grid.trebleScoreLine,
    bassScoreLine: grid.bassScoreLine,
    beamOnTrebleIndices: grid.beamOnTrebleIndices,
    beamOnBassIndices: grid.beamOnBassIndices,
    play: grid.play,
  };
}

/** Motif: 4-pitch cell cycled across a full 2/4 bar; may split across staves. */
function motifPhrase(): Phrase {
  const lo = MIDI_GRAND_LO;
  const hi = MIDI_GRAND_HI;
  const base = randInt(lo, Math.max(lo, hi - 3));
  const jumps = pick([
    [0, 2, -1, 2],
    [0, -2, 3, -1],
    [0, 1, 2, 2],
    [0, 3, -1, 2],
    [0, -1, 3, 1],
    [0, 2, 2, -2],
  ]);
  let cur = base;
  const seq: number[] = [base];
  for (let i = 1; i < jumps.length; i++) {
    cur = clampMidi(cur + jumps[i]!, lo, hi);
    seq.push(cur);
  }

  const den = pick(GRID_DENS);
  const grid = buildGrandStaffDenseGrid(den, seq, 0.06);

  return {
    kind: "motif",
    kindLabel: `Motif · ${gridDenToLabel(den)}`,
    noteNames: seq.map(midiToLabel).join(" – "),
    trebleScoreLine: grid.trebleScoreLine,
    bassScoreLine: grid.bassScoreLine,
    beamOnTrebleIndices: grid.beamOnTrebleIndices,
    beamOnBassIndices: grid.beamOnBassIndices,
    play: grid.play,
  };
}

export function randomPhrase(): Phrase {
  const r = Math.random();
  if (r < 0.2) return singlePhrase();
  if (r < 0.35) return chordPhrase();
  if (r < 0.85) return arpPhrase();
  return motifPhrase();
}
