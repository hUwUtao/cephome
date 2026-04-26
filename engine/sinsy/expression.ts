import type { ExpressionGauge, ScoreNote } from "./types.ts";

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
  };
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
