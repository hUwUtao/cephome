/**
 * vneuvis — NEUTRINO SVS format parser for TypeScript.
 *
 * Parse .f0, .melspec, and .lab files from Buffer → typed data.
 *
 * @example
 * ```ts
 * import { readF0, readMelSpec, readMonoLabel } from "vneuvis";
 *
 * const f0 = readF0(await Bun.file("song.f0").arrayBuffer());
 * const mel = readMelSpec(await Bun.file("song.melspec").arrayBuffer());
 * const segs = readMonoLabel(await Bun.file("song.mono.lab").text());
 *
 * console.log(`F0: ${f0.meanHz}Hz avg, ${f0.durationSec}s`);
 * console.log(`Mel: ${mel.frames} frames × ${mel.bins} bins`);
 * console.log(`Phonemes: ${segs.length}`);
 * ```
 */
export { readF0, hzToMidi, midiToNoteName, f0At } from "./f0";
export type { F0Data } from "./types";

export { readMelSpec, melAt, melFrame } from "./melspec";
export type { MelSpecData } from "./types";

export { readMonoLabel, readFullLabel, framePhonemeMap } from "./label";
export type { PhonemeSegment } from "./types";

// Re-export constants for convenience
export { FRAME_RATE, FRAME_DURATION, HOP_48K, N_MEL_BINS, F0_SILENCE, MEL_SILENCE } from "./types";
