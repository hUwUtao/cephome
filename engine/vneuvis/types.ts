/**
 * NEUTRINO SVS format constants and type definitions.
 *
 * Common frame timing:
 *   Frame rate:  100 fps (10ms per frame)
 *   Hop size:    480 samples @ 48kHz
 *   Derivation:  n_frames = wav_samples / 480
 *                n_frames = duration_sec × 100
 */
export const FRAME_RATE = 100; // fps
export const FRAME_DURATION = 0.01; // sec
export const HOP_48K = 480; // samples at 48kHz
export const N_MEL_BINS = 100; // mel filterbank channels

/** Silence/unvoiced sentinel for .f0 */
export const F0_SILENCE = 0.0;
/** Silence padding sentinel for .melspec (log-mel floor) */
export const MEL_SILENCE = -7.0;

/**
 * Parsed .f0 fundamental frequency contour.
 *
 * Values:  Hz as float32. 0.0 marks unvoiced frames.
 *          Typical voiced range: 50-800 Hz.
 */
export interface F0Data {
  /** Number of time frames */
  readonly frames: number;
  /** Duration in seconds (frames / 100) */
  readonly durationSec: number;
  /** Raw float32 values. Length = frames. 0.0 = unvoiced. */
  readonly values: Float32Array;
  /** Boolean mask: true = voiced (value > 0), false = unvoiced/silence */
  readonly voiced: Uint8Array;
  /** Number of voiced frames */
  readonly voicedCount: number;
  /** Mean Hz of voiced frames only */
  readonly meanHz: number;
  /** Min Hz of voiced frames */
  readonly minHz: number;
  /** Max Hz of voiced frames */
  readonly maxHz: number;
}

/**
 * Parsed .melspec mel-spectrogram.
 *
 * Values:  log-mel magnitude as float32 (typical -4.5 to 1.0).
 *          -7.0 marks silence padding.
 *          Shape: [frames × bins] row-major.
 */
export interface MelSpecData {
  /** Number of time frames */
  readonly frames: number;
  /** Number of mel filterbank channels (typically 100) */
  readonly bins: number;
  /** Duration in seconds (frames / 100) */
  readonly durationSec: number;
  /** Raw float32 values, row-major, length = frames × bins */
  readonly values: Float32Array;
  /** Number of silent frames (all bins == MEL_SILENCE) */
  readonly silentFrames: number;
  /** Minimum active value (silence excluded) */
  readonly min: number;
  /** Maximum active value */
  readonly max: number;
  /** Mean of active values */
  readonly mean: number;
}

/**
 * A single phoneme segment from mono timing label.
 */
export interface PhonemeSegment {
  /** Start time in 100-nanosecond units */
  readonly start100ns: number;
  /** End time in 100-nanosecond units */
  readonly end100ns: number;
  /** Phoneme symbol (e.g. "pau", "a", "N", "ch") */
  readonly phoneme: string;
  /** Start time in seconds */
  readonly startSec: number;
  /** End time in seconds */
  readonly endSec: number;
  /** Duration in seconds */
  readonly durationSec: number;
  /** Frame index range [start, end) */
  readonly frameStart: number;
  readonly frameEnd: number;
}
