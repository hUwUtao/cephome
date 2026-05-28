/**
 * NEUTRINO SVS .lab (label) parser.
 *
 * Format: text, one phoneme segment per line:
 *   <start_100ns> <end_100ns> <phoneme_symbol>
 *
 * Timing units: 100 nanoseconds (1e-7 sec).
 * 10000000 units = 1 second.
 *
 * Mono label example:
 *   0 10000000 pau
 *   10000000 12150000 e
 *   12150000 12320000 N
 *
 * @module
 */
import { PhonemeSegment, FRAME_DURATION } from "./types";

const LINE_RE = /^(\d+)\s+(\d+)\s+(\S+)/;

/**
 * Parse mono timing label text into PhonemeSegment array.
 *
 * @param text - UTF-8 text content of .lab file
 * @returns ordered array of phoneme segments
 *
 * @example
 * ```ts
 * const txt = await Bun.file("song.mono.lab").text();
 * const segs = readMonoLabel(txt);
 * console.log(segs[0].phoneme);   // "pau"
 * console.log(segs[0].durationSec); // 1.0
 * ```
 */
export function readMonoLabel(text: string): PhonemeSegment[] {
  const segments: PhonemeSegment[] = [];
  let lineNum = 0;

  for (const raw of text.split("\n")) {
    lineNum++;
    const line = raw.trim();
    if (!line) continue;

    const m = LINE_RE.exec(line);
    if (!m) {
      throw new Error(`mono label parse error at line ${lineNum}: "${line}"`);
    }

    const start100ns = parseInt(m[1]!, 10);
    const end100ns = parseInt(m[2]!, 10);
    const phoneme = m[3]!;
    const startSec = start100ns / 1e7;
    const endSec = end100ns / 1e7;

    segments.push({
      start100ns,
      end100ns,
      phoneme,
      startSec,
      endSec,
      durationSec: endSec - startSec,
      frameStart: Math.round(startSec / FRAME_DURATION),
      frameEnd: Math.round(endSec / FRAME_DURATION),
    });
  }

  return segments;
}

/**
 * Read full-context label as raw string array.
 * Each line is an HTS full-context label.
 */
export function readFullLabel(text: string): string[] {
  return text.split("\n").filter((l) => l.trim().length > 0);
}

/**
 * Map F0 or mel frames to phoneme index.
 * Returns array where each element is the phoneme segment index for that frame.
 * -1 for frames outside all segments.
 */
export function framePhonemeMap(segments: PhonemeSegment[], nFrames: number): Int32Array {
  const map = new Int32Array(nFrames).fill(-1);
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const start = Math.max(0, seg.frameStart);
    const end = Math.min(nFrames, seg.frameEnd);
    for (let f = start; f < end; f++) {
      map[f] = i;
    }
  }
  return map;
}
