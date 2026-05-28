/**
 * NEUTRINO SVS .melspec format parser.
 *
 * Format: raw IEEE 754 float32 little-endian array.
 *   - No header, no magic bytes.
 *   - 100 floats (400 bytes) per time frame = 100 mel filterbank channels.
 *   - Frame rate: 100 fps (10ms).
 *   - -7.0 = silence padding (log-mel floor).
 *   - >-7.0 = log-mel magnitude (typical -4.5 to 1.0).
 *   - Shape: [frames × 100] row-major.
 *
 * Validation:
 *   - Buffer length MUST be divisible by (100 × 4) = 400.
 *
 * @module
 */
import { MelSpecData, FRAME_RATE, N_MEL_BINS, MEL_SILENCE } from "./types";

/** Minimum plausible log-mel value */
const MIN_PLAUSIBLE = -20;
/** Maximum plausible log-mel value */
const MAX_PLAUSIBLE = 10;

/**
 * Parse .melspec buffer into MelSpecData.
 *
 * @param buffer - raw .melspec file contents
 * @returns parsed mel spectrogram
 * @throws {Error} if buffer size not divisible by 400 (100 bins × 4 bytes)
 *
 * @example
 * ```ts
 * const buf = await Bun.file("song.melspec").arrayBuffer();
 * const mel = readMelSpec(buf);
 * console.log(mel.frames);   // 4122
 * console.log(mel.min);      // -4.317
 * ```
 */
export function readMelSpec(buffer: BufferSource): MelSpecData {
  const bytes = toBytes(buffer);

  const frameSize = N_MEL_BINS * 4; // 400 bytes per frame
  if (bytes.byteLength % frameSize !== 0) {
    throw new Error(
      `melspec buffer size (${bytes.byteLength}) not divisible by ` +
        `${frameSize} (${N_MEL_BINS} bins × 4 bytes)`,
    );
  }

  const frames = bytes.byteLength / frameSize;
  const totalFloats = frames * N_MEL_BINS;
  const values = new Float32Array(bytes.buffer, bytes.byteOffset, totalFloats);

  let silentFrames = 0;
  let sum = 0;
  let activeCount = 0;
  let min = Infinity;
  let max = -Infinity;

  for (let f = 0; f < frames; f++) {
    const base = f * N_MEL_BINS;
    const firstBin = values[base]!;
    // Silence check: first bin == MEL_SILENCE
    if (firstBin === MEL_SILENCE) {
      silentFrames++;
    }
    for (let b = 0; b < N_MEL_BINS; b++) {
      const v = values[base + b]!;
      if (v > MEL_SILENCE) {
        if (v < MIN_PLAUSIBLE || v > MAX_PLAUSIBLE) {
          // value outside plausible range — pass through
        }
        sum += v;
        activeCount++;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
  }

  return {
    frames,
    bins: N_MEL_BINS,
    durationSec: frames / FRAME_RATE,
    values,
    silentFrames,
    min: activeCount > 0 ? min : 0,
    max: activeCount > 0 ? max : 0,
    mean: activeCount > 0 ? sum / activeCount : 0,
  };
}

/**
 * Get mel bin value at (frame, bin).
 */
export function melAt(mel: MelSpecData, frame: number, bin: number): number {
  const idx = frame * mel.bins + bin;
  return mel.values[idx] ?? MEL_SILENCE;
}

/**
 * Get all bin values for a single frame as Float32Array view.
 */
export function melFrame(mel: MelSpecData, frame: number): Float32Array {
  const start = frame * mel.bins;
  return mel.values.subarray(start, start + mel.bins);
}

function toBytes(buf: BufferSource): Uint8Array {
  if (buf instanceof Uint8Array) return buf;
  if (buf instanceof ArrayBuffer) return new Uint8Array(buf);
  if (ArrayBuffer.isView(buf)) {
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  throw new Error("Unsupported buffer type");
}
