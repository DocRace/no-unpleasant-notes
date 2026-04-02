# No Unpleasant Notes

A small **music listening lab**, not a drill app: random patterns on a **grand staff** (treble + bass), rendered with **VexFlow** and played with **Tone.js**. Optional **modern house-style** groove shares the transport clock with the phrase so what you see and hear stay aligned.

Part of [Race Li](https://race.li)’s playground of interactive / audio experiments.

## What it does

- **Random phrases** — Tap **New** for another idea: single notes, **chords**, dense **arpeggios**, or short **motifs**. Arps/motifs use a **16th / 32nd / 64th** subdivision grid so each roll feels different.
- **2/4 notation** — Patterns are written as a single 2/4 bar; with groove on, the figure can repeat on a **4/4** drum grid (two phrases per drum bar).
- **Playback** — **Play** / **Stop**; **New** stops, swaps the phrase, and resumes if audio was running (clean scheduling / no stuck notes).
- **Groove** — Toggle **4/4** synth drums (four-on-the-floor kick, snare/clap on 2 & 4, 16th hats). Muting follows Play/Stop.

## Stack

| Piece        | Role                                      |
| ------------ | ----------------------------------------- |
| **Next.js**  | App shell, React 19                       |
| **VexFlow**  | Grand staff, beaming, EasyScore strings   |
| **Tone.js**  | PolySynth melody, FM/noise/metal drums    |
| **Tailwind** | Layout & theme                            |

Phrase logic and EasyScore generation live in **`lib/phrase.ts`**. Staff UI and audio wiring are in **`components/TrainerApp.tsx`**.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The first click to start audio may require a user gesture (browser policy).

```bash
npm run build   # production build
npm start       # serve production build
npm run lint    # eslint
```

## Repo

<https://github.com/DocRace/no-unpleasant-notes>
