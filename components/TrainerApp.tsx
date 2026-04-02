"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { Phrase } from "@/lib/phrase";
import { BEATS_PER_BAR, PHRASE_BPM, randomPhrase } from "@/lib/phrase";
import { IconAdd, IconOpenInNew, IconPlay, IconStop } from "@/components/icons";
import * as Tone from "tone";

function vexKeyToLabel(key: string): string {
  const [name, oct] = key.split("/");
  if (!name || !oct) return key;
  const rest =
    name.length > 1 ? name.slice(1).replace("#", "♯").replace("b", "♭") : "";
  return `${name[0]!.toUpperCase()}${rest}${oct}`;
}

/** EasyScore tokens separated by commas; ignore commas inside `( … )` chord groups. */
function countScoreTickables(scoreLine: string): number {
  let depth = 0;
  let n = 1;
  for (let i = 0; i < scoreLine.length; i++) {
    const c = scoreLine[i];
    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (c === "," && depth === 0) n++;
  }
  return n;
}

/**
 * Stave width: generous for beams + note-head spacing + pitch annotations (wide labels).
 * Canvas must be wide enough before CSS scale-down, or VexFlow clips the SVG.
 */
function layoutDimensionsForPhrase(phrase: Phrase): {
  systemWidth: number;
  rendererWidth: number;
  rendererHeight: number;
} {
  const tickables = Math.max(
    countScoreTickables(phrase.trebleScoreLine),
    countScoreTickables(phrase.bassScoreLine)
  );
  const perNote = 48;
  const base = 188;
  const systemWidth = Math.min(
    2800,
    Math.max(600, base + tickables * perNote)
  );
  const rendererWidth = Math.ceil(88 + systemWidth);
  const rendererHeight =
    tickables > 28 ? 400 : tickables > 16 ? 372 : 332;
  return { systemWidth, rendererWidth, rendererHeight };
}

export default function TrainerApp() {
  const rawId = useId().replace(/\W/g, "");
  const staffHostId = `staff-${rawId}`;
  const [phrase, setPhrase] = useState<Phrase | null>(null);
  const phraseRef = useRef<Phrase | null>(null);
  phraseRef.current = phrase;

  const [quickLoop, setQuickLoop] = useState(true);
  /** Spacing between loop repeats: one 2/4 bar at this tempo (ms). */
  const [loopBpm, setLoopBpm] = useState(PHRASE_BPM);
  const [isPlaying, setIsPlaying] = useState(false);
  const [grooveOn, setGrooveOn] = useState(true);

  const staffOuterRef = useRef<HTMLDivElement>(null);
  const [staffViewport, setStaffViewport] = useState({
    scale: 1,
    rw: 720,
    rh: 320,
  });

  const loopBpmRef = useRef(loopBpm);
  loopBpmRef.current = loopBpm;
  const grooveOnRef = useRef(grooveOn);
  grooveOnRef.current = grooveOn;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const melodyRef = useRef<Tone.PolySynth | null>(null);
  const melodyVolRef = useRef<Tone.Volume | null>(null);
  const melodyGainRef = useRef<Tone.Gain | null>(null);
  const kickRef = useRef<Tone.FMSynth | null>(null);
  const kickOutVolRef = useRef<Tone.Volume | null>(null);
  const snareRef = useRef<Tone.NoiseSynth | null>(null);
  const snareBandRef = useRef<Tone.Filter | null>(null);
  const snareOutVolRef = useRef<Tone.Volume | null>(null);
  const hatRef = useRef<Tone.MetalSynth | null>(null);
  const hatHpRef = useRef<Tone.Filter | null>(null);
  const hatOutVolRef = useRef<Tone.Volume | null>(null);
  const loopTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seqRef = useRef<Tone.Sequence | null>(null);
  const phraseRepeatIdRef = useRef<number | null>(null);
  const phraseOnceIdRef = useRef<number | null>(null);

  const ensureMelody = useCallback(() => {
    if (!melodyRef.current) {
      const gain = new Tone.Gain(1).toDestination();
      melodyGainRef.current = gain;
      const vol = new Tone.Volume(-16);
      melodyVolRef.current = vol;
      const s = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.008, decay: 0.12, sustain: 0.45, release: 0.22 },
      });
      s.connect(vol);
      vol.connect(gain);
      melodyRef.current = s;
    }
    return melodyRef.current;
  }, []);

  /** Melody locked to Transport clock: `time` is the slice / bar downbeat. */
  const playPhraseAtTime = useCallback(
    (startContextTime: number, p: Phrase, bpm: number) => {
      const synth = ensureMelody();
      const spb = 60 / bpm;
      for (const ev of p.play) {
        const names = ev.midis.map((m) => Tone.Frequency(m, "midi").toNote());
        synth.triggerAttackRelease(
          names,
          ev.duration,
          startContextTime + ev.beat * spb
        );
      }
    },
    [ensureMelody]
  );

  /** Free-running phrase (no groove / no transport loop). */
  const playPhraseWallClock = useCallback(
    async (p: Phrase, bpm: number) => {
      await Tone.start();
      const synth = ensureMelody();
      const gain = melodyGainRef.current;
      if (gain && gain.gain.value < 0.01) {
        gain.gain.rampTo(1, 0.02);
      }
      const t0 = Tone.now() + 0.02;
      const spb = 60 / bpm;
      for (const ev of p.play) {
        const names = ev.midis.map((m) => Tone.Frequency(m, "midi").toNote());
        synth.triggerAttackRelease(names, ev.duration, t0 + ev.beat * spb);
      }
    },
    [ensureMelody]
  );

  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
    if (loopTimerRef.current) {
      clearInterval(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    if (phraseRepeatIdRef.current != null) {
      Tone.Transport.clear(phraseRepeatIdRef.current);
      phraseRepeatIdRef.current = null;
    }
    if (phraseOnceIdRef.current != null) {
      Tone.Transport.clear(phraseOnceIdRef.current);
      phraseOnceIdRef.current = null;
    }
    Tone.Transport.cancel(0);
    /* Wall-clock triggerAttackRelease leaves future events on PolySynth; dispose kills them. */
    melodyRef.current?.dispose();
    melodyVolRef.current?.dispose();
    melodyGainRef.current?.dispose();
    melodyRef.current = null;
    melodyVolRef.current = null;
    melodyGainRef.current = null;
    Tone.Transport.stop();
  }, []);

  const handlePlay = useCallback(async () => {
    if (!phraseRef.current) return;
    await Tone.start();
    ensureMelody();
    melodyGainRef.current?.gain.rampTo(1, 0.02);
    setIsPlaying(true);
    if (!quickLoop) {
      const p = phraseRef.current;
      Tone.Transport.bpm.value = loopBpm;
      if (grooveOn) {
        if (Tone.Transport.state !== "started") {
          Tone.Transport.start();
        }
        if (phraseOnceIdRef.current != null) {
          Tone.Transport.clear(phraseOnceIdRef.current);
        }
        const sub =
          Tone.Transport.seconds < 0.02
            ? 0
            : Tone.Transport.nextSubdivision("2n");
        phraseOnceIdRef.current = Tone.Transport.scheduleOnce((time) => {
          const ph = phraseRef.current;
          if (ph) {
            playPhraseAtTime(time, ph, loopBpmRef.current);
          }
        }, sub);
      } else {
        void playPhraseWallClock(p, loopBpm);
      }
    }
  }, [
    ensureMelody,
    grooveOn,
    loopBpm,
    playPhraseAtTime,
    playPhraseWallClock,
    quickLoop,
  ]);

  const rollPhrase = useCallback(() => {
    const next = randomPhrase();
    setPhrase(next);
    return next;
  }, []);

  /** Full stop, new phrase, then play again if we were playing (fresh transport / loops). */
  const handleNew = useCallback(() => {
    const wasPlaying = isPlaying;
    stopPlayback();
    const next = rollPhrase();
    phraseRef.current = next;
    if (wasPlaying) {
      /* Let React flush isPlaying→false (groove seq off) before starting transport again. */
      requestAnimationFrame(() => {
        void handlePlay();
      });
    }
  }, [handlePlay, isPlaying, rollPhrase, stopPlayback]);

  /** Same as tapping New once the client bundle has mounted (and staff host exists). */
  useEffect(() => {
    rollPhrase();
  }, [rollPhrase]);

  const recomputeStaffFit = useCallback(() => {
    const p = phraseRef.current;
    const el = staffOuterRef.current;
    if (!p || !el) return;
    const { rendererWidth, rendererHeight } = layoutDimensionsForPhrase(p);
    const cw = el.clientWidth;
    const scale =
      cw > 24
        ? Math.min(1, Math.max(0.18, (cw - 6) / rendererWidth))
        : 1;
    setStaffViewport({ scale, rw: rendererWidth, rh: rendererHeight });
  }, []);

  useEffect(() => {
    const el = staffOuterRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      recomputeStaffFit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [recomputeStaffFit]);

  useEffect(() => {
    /* 4/4 transport: one drum-machine bar; each phrase is 2 beats (2/4 score). */
    Tone.Transport.timeSignature = [4, 4];
    return () => {
      Tone.Transport.timeSignature = 4;
    };
  }, []);

  useEffect(() => {
    if (!phrase) return;
    const fitEl = staffOuterRef.current;
    const dims0 = layoutDimensionsForPhrase(phrase);
    if (fitEl && fitEl.clientWidth > 24) {
      const sc = Math.min(
        1,
        Math.max(0.18, (fitEl.clientWidth - 6) / dims0.rendererWidth)
      );
      setStaffViewport({
        scale: sc,
        rw: dims0.rendererWidth,
        rh: dims0.rendererHeight,
      });
    } else {
      setStaffViewport((v) => ({
        ...v,
        rw: dims0.rendererWidth,
        rh: dims0.rendererHeight,
      }));
    }

    let cancelled = false;
    (async () => {
      try {
        const { Factory, VexFlow, StaveNote } = await import("vexflow");
        await document.fonts.ready;
        VexFlow.setFonts("Bravura", "Academico");

        const host = document.getElementById(staffHostId);
        if (!host || cancelled) return;
        host.innerHTML = "";

        const { systemWidth, rendererWidth, rendererHeight } =
          layoutDimensionsForPhrase(phrase);

        const vf = new Factory({
          renderer: {
            elementId: staffHostId,
            width: rendererWidth,
            height: rendererHeight,
          },
        });

        const score = vf.EasyScore();
        score.set({ time: "2/4" });

        let trebleTickables;
        let bassTickables;
        try {
          trebleTickables = score.notes(phrase.trebleScoreLine, { clef: "treble" });
          bassTickables = score.notes(phrase.bassScoreLine, { clef: "bass" });
        } catch {
          host.textContent =
            "Could not parse this notation string. Try New.";
          return;
        }

        const annotate = (objs: typeof trebleTickables) => {
          for (const t of objs) {
            if (!(t instanceof StaveNote) || t.isRest()) continue;
            const keys = t.getKeys();
            keys.forEach((k, idx) => {
              t.addModifier(
                vf.Annotation({
                  text: vexKeyToLabel(k),
                  vJustify: "above",
                  hJustify: "center",
                }),
                idx
              );
            });
          }
        };
        annotate(trebleTickables);
        annotate(bassTickables);

        const beamGroup = (
          indices: number[] | null,
          tickables: typeof trebleTickables
        ) => {
          if (!indices || indices.length < 2) return;
          const notes = indices
            .map((i) => tickables[i])
            .filter(
              (n) => n instanceof StaveNote && !n.isRest()
            );
          if (notes.length < 2) return;
          vf.Beam({ notes, options: { autoStem: true } });
        };
        beamGroup(phrase.beamOnTrebleIndices, trebleTickables);
        beamGroup(phrase.beamOnBassIndices, bassTickables);

        const trebleVoice = vf.Voice({ time: "2/4" });
        trebleVoice.setMode(VexFlow.VoiceMode.SOFT);
        trebleVoice.addTickables(trebleTickables);

        const bassVoice = vf.Voice({ time: "2/4" });
        bassVoice.setMode(VexFlow.VoiceMode.SOFT);
        bassVoice.addTickables(bassTickables);

        const system = vf.System({
          x: 12,
          y: 8,
          width: systemWidth,
          spaceBetweenStaves: 16,
        });

        system
          .addStave({ voices: [trebleVoice] })
          .addClef("treble")
          .addTimeSignature("2/4");

        system
          .addStave({ voices: [bassVoice] })
          .addClef("bass")
          .addTimeSignature("2/4");

        system.addConnector("brace");
        vf.draw();
        requestAnimationFrame(() => {
          recomputeStaffFit();
        });
      } catch (err) {
        console.error(err);
        const h = document.getElementById(staffHostId);
        if (h && !cancelled) {
          h.textContent =
            "This bar did not lay out in 2/4. Tap New to try again.";
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [phrase, staffHostId, recomputeStaffFit]);

  useEffect(() => {
    Tone.Transport.bpm.value = loopBpm;
  }, [loopBpm]);

  useEffect(() => {
    if (!isPlaying || !quickLoop) {
      if (loopTimerRef.current) {
        clearInterval(loopTimerRef.current);
        loopTimerRef.current = null;
      }
      if (phraseRepeatIdRef.current != null) {
        Tone.Transport.clear(phraseRepeatIdRef.current);
        phraseRepeatIdRef.current = null;
      }
      return;
    }

    if (grooveOn) {
      let cancelled = false;
      void (async () => {
        await Tone.start();
        ensureMelody();
        melodyGainRef.current?.gain.rampTo(1, 0.02);
        Tone.Transport.bpm.value = loopBpmRef.current;
        if (Tone.Transport.state !== "started") {
          Tone.Transport.start();
        }
        /* Every 2n = one 2/4 figure; two repeats per 4/4 bar, aligned to drum grid. */
        const startAlign =
          Tone.Transport.seconds < 0.02
            ? 0
            : Tone.Transport.nextSubdivision("2n");
        const id = Tone.Transport.scheduleRepeat(
          (time) => {
            if (cancelled || !phraseRef.current) return;
            playPhraseAtTime(time, phraseRef.current, loopBpmRef.current);
          },
          "2n",
          startAlign
        );
        phraseRepeatIdRef.current = id;
      })();
      return () => {
        cancelled = true;
        if (phraseRepeatIdRef.current != null) {
          Tone.Transport.clear(phraseRepeatIdRef.current);
          phraseRepeatIdRef.current = null;
        }
      };
    }

    const p0 = phraseRef.current;
    if (!p0) return;
    void playPhraseWallClock(p0, loopBpm);
    const ms = Math.max(
      120,
      Math.round(((BEATS_PER_BAR * 60) / loopBpm) * 1000)
    );
    loopTimerRef.current = setInterval(() => {
      const p = phraseRef.current;
      if (p) void playPhraseWallClock(p, loopBpmRef.current);
    }, ms);
    return () => {
      if (loopTimerRef.current) {
        clearInterval(loopTimerRef.current);
        loopTimerRef.current = null;
      }
    };
  }, [
    isPlaying,
    quickLoop,
    grooveOn,
    loopBpm,
    ensureMelody,
    playPhraseAtTime,
    playPhraseWallClock,
    phrase?.trebleScoreLine,
    phrase?.bassScoreLine,
  ]);

  useEffect(() => {
    if (!grooveOn) {
      seqRef.current?.dispose();
      seqRef.current = null;
      if (!isPlayingRef.current) {
        Tone.Transport.stop();
      }
      return;
    }

    if (!isPlaying) {
      seqRef.current?.dispose();
      seqRef.current = null;
      return;
    }

    let cancelled = false;
    void (async () => {
      await Tone.start();
      /* Modern house: short FM kick (four-on-the-floor), layered noise clap, tight FM hats. */
      if (!kickRef.current) {
        const vol = new Tone.Volume(-4);
        vol.toDestination();
        kickOutVolRef.current = vol;
        kickRef.current = new Tone.FMSynth({
          harmonicity: 1,
          modulationIndex: 18,
          oscillator: { type: "sine" },
          envelope: {
            attack: 0.001,
            decay: 0.32,
            sustain: 0,
            release: 0.08,
          },
          modulation: { type: "square" },
          modulationEnvelope: {
            attack: 0.001,
            decay: 0.08,
            sustain: 0,
            release: 0.02,
          },
        }).connect(vol);
      }
      if (!snareRef.current) {
        const vol = new Tone.Volume(-5);
        vol.toDestination();
        snareOutVolRef.current = vol;
        const band = new Tone.Filter({
          type: "bandpass",
          frequency: 4200,
          Q: 1.1,
          rolloff: -24,
        });
        snareBandRef.current = band;
        const ns = new Tone.NoiseSynth({
          noise: { type: "white" },
          envelope: {
            attack: 0.0003,
            decay: 0.045,
            sustain: 0,
            release: 0.018,
          },
        });
        ns.chain(band, vol);
        snareRef.current = ns;
      }
      if (!hatRef.current) {
        const vol = new Tone.Volume(-12);
        vol.toDestination();
        hatOutVolRef.current = vol;
        const hp = new Tone.Filter({
          type: "highpass",
          frequency: 7200,
          rolloff: -24,
        });
        hatHpRef.current = hp;
        const ms = new Tone.MetalSynth({
          envelope: {
            attack: 0.00015,
            decay: 0.008,
            release: 0.002,
          },
          harmonicity: 5.5,
          modulationIndex: 48,
          resonance: 5200,
          octaves: 1.4,
        });
        ms.chain(hp, vol);
        hatRef.current = ms;
      }

      const kick = kickRef.current;
      const snare = snareRef.current;
      const hat = hatRef.current;

      seqRef.current?.dispose();
      Tone.Transport.bpm.value = loopBpm;

      /* Classic modern house: four-on-the-floor kick; snare/clap on 2 & 4; 16th hats with offbeat lift. */
      const steps = 16;
      const seq = new Tone.Sequence(
        (time, step) => {
          const s = step as number;
          if (s % 4 === 0) {
            const beat = s / 4;
            const vel = beat === 0 ? 0.96 : 0.9;
            kick.triggerAttackRelease("C1", "16n", time, vel);
          }
          if (s === 4 || s === 12) {
            snare.triggerAttackRelease("16n", time, 0.58);
            snare.triggerAttackRelease("32n", time + 0.006, 0.36);
            snare.triggerAttackRelease("32n", time + 0.014, 0.24);
          }
          /* One hat trigger per step — MetalSynth is monophonic; same `time` twice throws. */
          const onOffbeat8 =
            s === 2 || s === 6 || s === 10 || s === 14;
          const hatHz = onOffbeat8 ? 10800 : s % 4 === 0 ? 7600 : 9400;
          const hatVel = onOffbeat8
            ? 0.11
            : s % 4 === 0
              ? 0.065
              : s % 2 === 0
                ? 0.078
                : 0.048;
          hat.triggerAttackRelease(hatHz, "32n", time, hatVel);
        },
        Array.from({ length: steps }, (_, i) => i),
        "16n"
      );

      if (cancelled || !isPlayingRef.current) {
        seq.dispose();
        return;
      }
      seqRef.current = seq;
      seq.start(0);
      if (Tone.Transport.state !== "started") {
        Tone.Transport.start();
      }
    })();

    return () => {
      cancelled = true;
      seqRef.current?.dispose();
      seqRef.current = null;
    };
  }, [grooveOn, loopBpm, isPlaying]);

  useEffect(() => {
    return () => {
      if (loopTimerRef.current) clearInterval(loopTimerRef.current);
      if (phraseRepeatIdRef.current != null) {
        Tone.Transport.clear(phraseRepeatIdRef.current);
        phraseRepeatIdRef.current = null;
      }
      if (phraseOnceIdRef.current != null) {
        Tone.Transport.clear(phraseOnceIdRef.current);
        phraseOnceIdRef.current = null;
      }
      seqRef.current?.dispose();
      Tone.Transport.cancel(0);
      melodyRef.current?.dispose();
      melodyVolRef.current?.dispose();
      melodyGainRef.current?.dispose();
      melodyRef.current = null;
      melodyVolRef.current = null;
      melodyGainRef.current = null;
      kickRef.current?.dispose();
      kickOutVolRef.current?.dispose();
      kickOutVolRef.current = null;
      kickRef.current = null;
      snareRef.current?.dispose();
      snareBandRef.current?.dispose();
      snareOutVolRef.current?.dispose();
      snareBandRef.current = null;
      snareOutVolRef.current = null;
      snareRef.current = null;
      hatRef.current?.dispose();
      hatHpRef.current?.dispose();
      hatOutVolRef.current?.dispose();
      hatHpRef.current = null;
      hatOutVolRef.current = null;
      hatRef.current = null;
    };
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 pt-16 pb-10 sm:px-6 sm:pt-24 sm:pb-12 md:max-w-4xl md:px-8 lg:max-w-5xl lg:px-10 lg:pt-28 xl:max-w-6xl xl:px-12 2xl:max-w-7xl 2xl:gap-10 2xl:px-14 2xl:pt-32">
      <header className="w-full space-y-2 text-center sm:text-left">
        <p className="w-full text-sm font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
          Groove alchemy · 2/4 · 4/4
        </p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
          NO UNPLEASANT NOTES
        </h1>
        <p className="w-full max-w-none text-base font-normal leading-relaxed text-zinc-600 dark:text-zinc-400">
          Random patterns on a grand staff—dense arps, singles, chords—plus an
          optional groove. For ears, not exams.
        </p>
      </header>

      <div className="w-full overflow-hidden rounded-[1.625rem] border border-zinc-200/80 bg-white/80 p-6 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div
          ref={staffOuterRef}
          className="[-webkit-overflow-scrolling:touch] min-h-[200px] min-w-0 max-w-full overflow-x-auto bg-transparent"
        >
          <div
            className="relative mx-auto"
            style={{
              width: Math.max(1, Math.ceil(staffViewport.rw * staffViewport.scale)),
              height: Math.max(1, Math.ceil(staffViewport.rh * staffViewport.scale)),
            }}
          >
            <div
              className="absolute top-0 left-0"
              style={{
                transform: `scale(${staffViewport.scale})`,
                transformOrigin: "top left",
                width: staffViewport.rw,
              }}
            >
              <div id={staffHostId} className="block min-h-[200px]" />
            </div>
          </div>
        </div>

        {phrase && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm font-normal text-zinc-600 dark:text-zinc-400">
            <span className="rounded-full bg-black px-2.5 py-0.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-black">
              {phrase.kindLabel}
            </span>
            <span className="tabular-nums tracking-tight text-zinc-800 dark:text-zinc-200">
              {phrase.noteNames}
            </span>
            <span className="text-xs text-zinc-400 sm:text-sm">~{loopBpm} BPM</span>
          </div>
        )}
      </div>

      <div className="flex w-full min-w-0 flex-row flex-nowrap items-center justify-start gap-2 sm:gap-3 md:gap-4">
        <button
          type="button"
          onClick={handleNew}
          className="inline-flex min-h-[3.25rem] min-w-0 flex-1 basis-0 max-w-[140px] items-center justify-center gap-2 rounded-full bg-zinc-900 px-4 py-3.5 text-base font-medium text-white shadow-md transition hover:bg-zinc-800 sm:px-6 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          <IconAdd className="size-5 shrink-0" />
          New
        </button>
        <button
          type="button"
          onClick={() => {
            if (isPlaying) stopPlayback();
            else void handlePlay();
          }}
          disabled={!phrase}
          className={`inline-flex min-h-[3.25rem] min-w-0 flex-1 basis-0 max-w-[140px] items-center justify-center gap-2 rounded-full px-4 py-3.5 text-base font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-40 sm:px-6 border ${
            isPlaying
              ? "border-rose-400/90 bg-rose-50 text-rose-900 shadow-sm hover:bg-rose-100 focus-visible:ring-rose-500 dark:border-rose-800 dark:bg-rose-950/55 dark:text-rose-100 dark:hover:bg-rose-900/75 dark:focus-visible:ring-rose-400 dark:focus-visible:ring-offset-zinc-950"
              : "border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100 focus-visible:ring-black dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:focus-visible:ring-zinc-100 dark:focus-visible:ring-offset-zinc-950"
          }`}
        >
          {isPlaying ? (
            <>
              <IconStop className="size-5 shrink-0" />
              Stop
            </>
          ) : (
            <>
              <IconPlay className="size-5 shrink-0" />
              Play
            </>
          )}
        </button>
      </div>

      <section className="w-full space-y-4 text-left">
        <h2 className="font-heading text-base font-semibold tracking-wide text-zinc-800 uppercase dark:text-zinc-200">
          Bar loop
        </h2>
        <label className="flex w-full cursor-pointer items-start gap-3 text-sm font-normal text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 rounded border-zinc-400 accent-black dark:accent-zinc-100"
            checked={quickLoop}
            onChange={(e) => setQuickLoop(e.target.checked)}
          />
          <span className="min-w-0 flex-1">
            Replay the 2/4 figure every two beats; with groove, twice per drum bar
            (shared clock).
          </span>
        </label>
        <div className="flex w-full min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <span className="shrink-0 text-sm text-zinc-500">Loop tempo</span>
          <input
            type="range"
            min={40}
            max={200}
            step={1}
            value={loopBpm}
            onChange={(e) => setLoopBpm(Number(e.target.value))}
            className="h-2 min-w-[8rem] max-w-md flex-1 accent-black dark:accent-zinc-100"
            disabled={!quickLoop}
          />
          <span className="text-sm tabular-nums tracking-tight text-zinc-600 dark:text-zinc-400">
            {loopBpm} BPM
          </span>
        </div>
      </section>

      <section className="w-full space-y-4 text-left">
        <h2 className="font-heading text-base font-semibold tracking-wide text-zinc-800 uppercase dark:text-zinc-200">
          4/4 groove
        </h2>
        <label className="flex w-full cursor-pointer items-start gap-3 text-sm font-normal text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 rounded border-zinc-400 accent-black dark:accent-zinc-100"
            checked={grooveOn}
            onChange={(e) => setGrooveOn(e.target.checked)}
          />
          <span className="min-w-0 flex-1">
            Synth drums (FM kick, layered clap, metal hats), modern house pocket,{" "}
            {loopBpm} BPM—one 4/4 bar = two 2/4 phrases.
          </span>
        </label>
        <p className="w-full max-w-none text-xs font-normal leading-relaxed text-zinc-500 dark:text-zinc-500">
          Four-on-the-floor kick, snare/clap on 2 &amp; 4, 16th hats.
        </p>
      </section>

      <footer className="mt-4 w-full border-t border-zinc-200/80 pt-10 dark:border-zinc-800">
        <div className="mb-10 flex w-full flex-wrap items-center gap-3 sm:gap-4">
          <img
            src="/race-li-avatar.jpg"
            alt="Race Li"
            width={48}
            height={48}
            className="size-12 shrink-0 rounded-full border border-zinc-200/90 bg-zinc-100 object-cover dark:border-zinc-700 dark:bg-zinc-800"
          />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Race Li
            </p>
            <a
              href="https://race.li"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-sm font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-4 transition hover:text-zinc-900 hover:decoration-zinc-600 dark:text-zinc-300 dark:decoration-zinc-600 dark:hover:text-zinc-100 dark:hover:decoration-zinc-400"
            >
              https://race.li
              <IconOpenInNew className="size-[0.95rem] shrink-0 translate-y-px text-zinc-600 dark:text-zinc-400" />
            </a>
          </div>
        </div>
        <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
          Ref
        </p>
        <p className="mt-3 w-full max-w-none text-sm font-normal leading-relaxed text-zinc-600 dark:text-zinc-400">
          Vibe cue—short that nailed the arp mood:
        </p>
        <p className="mt-3 w-full">
          <a
            href="https://www.youtube.com/shorts/ELYv4wxC6XA"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-sm font-medium text-zinc-900 transition hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
          >
            <span className="underline decoration-zinc-300 underline-offset-4 transition hover:decoration-zinc-600 dark:decoration-zinc-600 dark:hover:decoration-zinc-400">
              YouTube Short
            </span>
            <IconOpenInNew className="size-[0.95rem] shrink-0 translate-y-px text-zinc-600 dark:text-zinc-400" />
          </a>
        </p>
      </footer>
    </div>
  );
}
