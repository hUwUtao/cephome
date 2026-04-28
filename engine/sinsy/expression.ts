import type { ExpressionGauge, ScoreNote, ToneMelodyRelation } from "./types.ts";

const DYNAMIC_ENERGY: Record<string, number> = {
  pppp: 20,
  ppp: 28,
  pp: 36,
  p: 45,
  mp: 55,
  mf: 70,
  f: 85,
  ff: 100,
  fff: 112,
  ffff: 120,
};

export function expressionForNote(
  note: ScoreNote,
  previousNote: ScoreNote | null,
  nextNote: ScoreNote | null,
  tone: number = 0,
  phoneIndex: number = 0,
  phoneCount: number = 1,
): ExpressionGauge {
  const durationSeconds = noteDurationSeconds(note);
  const energyBase = DYNAMIC_ENERGY[note.dynamic] ?? DYNAMIC_ENERGY.mf!;
  const energy = clamp(energyBase + (note.hasAccent ? 10 : 0) - (note.hasStaccato ? 8 : 0), 0, 127);
  const vibratoEnabled = !note.isRest && !note.hasStaccato && durationSeconds >= 0.65;

  return {
    energy,
    vibratoRateHz: vibratoEnabled ? 5.2 : 0,
    vibratoDepthCents: vibratoEnabled
      ? clamp(Math.round((durationSeconds - 0.65) * 40 + 24), 24, 48)
      : 0,
    vibratoStartRatio: vibratoEnabled ? 0.35 : 0,
    pitchDeltaFromPrev: pitchDelta(previousNote, note),
    pitchDeltaToNext: pitchDelta(note, nextNote),
    tonalPitchOffset: calculateTonalOffset(tone, phoneIndex, phoneCount),
    toneMelodyRelation: calculateToneMelodyRelation(tone, pitchDelta(note, nextNote)),
  };
}

/**
 * Calculate microtonal pitch offset (in semitones) for a given tone and phone position.
 */
function calculateTonalOffset(tone: number, index: number, count: number): number {
  if (count <= 1) return 0;
  const ratio = index / (count - 1);

  switch (tone) {
    case 1: // Huyền (Low falling)
      return -0.5 * ratio;
    case 2: // Sắc (High rising)
      return 0.6 * ratio;
    case 3: // Hỏi (Dipping)
      return ratio < 0.5 ? -0.4 * (ratio * 2) : -0.4 + 0.4 * ((ratio - 0.5) * 2);
    case 4: // Ngã (Rising + glottal)
      return 0.8 * ratio;
    case 5: // Nặng (Falling + sharp)
      return -0.7 * ratio;
    default:
      return 0;
  }
}

function calculateToneMelodyRelation(tone: number, nextDelta: number): ToneMelodyRelation {
  const preferredDirection = toneDirection(tone);
  if (preferredDirection === 0) return "level";
  if (nextDelta === 0) return "oblique";
  return Math.sign(nextDelta) === preferredDirection ? "parallel" : "contrary";
}

function toneDirection(tone: number): -1 | 0 | 1 {
  if (tone === 1 || tone === 5) return -1;
  if (tone === 2 || tone === 4) return 1;
  return 0;
}

export function noteDurationSeconds(note: ScoreNote): number {
  return (note.durationDiv / note.divisions) * (60 / note.tempo);
}

function pitchDelta(from: ScoreNote | null, to: ScoreNote | null): number {
  if (!from?.pitch || !to?.pitch) return 0;
  return clamp(to.pitch.midi - from.pitch.midi, -48, 48);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
