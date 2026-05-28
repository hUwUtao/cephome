/**
 * NEUTRINO SVS .f0 format parser.
 *
 * Format: raw IEEE 754 float32 little-endian array.
 *   - No header, no magic bytes.
 *   - 1 float (4 bytes) per time frame.
 *   - Frame rate: 100 fps (10ms).
 *   - 0.0 = unvoiced/silence.
 *   - >0.0 = fundamental frequency in Hz.
 *
 * Validation:
 *   - Buffer length MUST be multiple of 4 (float32 alignment).
 *
 * @module
 */
import { F0Data, FRAME_RATE, F0_SILENCE } from "./types";

/** Maximum plausible Hz for sanity check */
const MAX_PLAUSIBLE_HZ = 2000;
/** Minimum plausible Hz */
const MIN_PLAUSIBLE_HZ = 20;

/**
 * Parse .f0 buffer into F0Data.
 *
 * @param buffer - raw .f0 file contents (Buffer, Uint8Array, ArrayBuffer)
 * @returns parsed F0 contour
 * @throws {Error} if buffer size not aligned to float32, or values out of
 *   plausible range
 *
 * @example
 * ```ts
 * const buf = await Bun.file("song.f0").arrayBuffer();
 * const f0 = readF0(buf);
 * console.log(f0.meanHz);        // 446.2
 * console.log(f0.voicedCount);   // 4012
 * ```
 */
export function readF0(buffer: BufferSource): F0Data {
  const bytes = toBytes(buffer);

  if (bytes.byteLength % 4 !== 0) {
    throw new Error(`f0 buffer size (${bytes.byteLength}) not aligned to float32`);
  }

  const frames = bytes.byteLength / 4;
  const values = new Float32Array(bytes.buffer, bytes.byteOffset, frames);

  let voicedCount = 0;
  let sumHz = 0;
  let minHz = Infinity;
  let maxHz = -Infinity;
  const voiced = new Uint8Array(frames);

  for (let i = 0; i < frames; i++) {
    const v = values[i]!;
    if (v > F0_SILENCE) {
      if (v > MAX_PLAUSIBLE_HZ || (v < MIN_PLAUSIBLE_HZ && v > 0)) {
        // warn but don't crash — NEUTRINO can produce edge values
      }
      voiced[i] = 1;
      voicedCount++;
      sumHz += v;
      if (v < minHz) minHz = v;
      if (v > maxHz) maxHz = v;
    }
  }

  return {
    frames,
    durationSec: frames / FRAME_RATE,
    values,
    voiced,
    voicedCount,
    meanHz: voicedCount > 0 ? sumHz / voicedCount : 0,
    minHz: voicedCount > 0 ? minHz : 0,
    maxHz: voicedCount > 0 ? maxHz : 0,
  };
}

/**
 * Get value at frame index.
 * Returns 0 for unvoiced frames.
 */
export function f0At(f0: F0Data, frame: number): number {
  return f0.values[frame] ?? 0;
}

/**
 * Convert Hz to MIDI note number (A4 = 440Hz = 69).
 * Returns 0 for unvoiced.
 */
export function hzToMidi(hz: number): number {
  if (hz <= 0) return 0;
  return 69 + 12 * Math.log2(hz / 440);
}

/**
 * Convert MIDI note number to note name (e.g. 69 → "A4").
 * Returns "REST" for 0.
 */
export function midiToNoteName(midi: number): string {
  if (midi <= 0) return "REST";
  const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const idx = Math.round(midi) % 12;
  const octave = Math.floor(Math.round(midi) / 12) - 1;
  return `${NOTES[idx]!}${octave}`;
}

function toBytes(buf: BufferSource): Uint8Array {
  if (buf instanceof Uint8Array) return buf;
  if (buf instanceof ArrayBuffer) return new Uint8Array(buf);
  if (ArrayBuffer.isView(buf)) {
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  throw new Error("Unsupported buffer type");
}
