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
  velocity?: number,
): ExpressionGauge {
  const durationSeconds = noteDurationSeconds(note);
  const energyBase = DYNAMIC_ENERGY[note.dynamic] ?? DYNAMIC_ENERGY.mf!;
  const markedEnergy =
    velocity ?? energyBase + (note.hasAccent ? 10 : 0) - (note.hasStaccato ? 8 : 0);
  const energy = clamp(markedEnergy, 0, 127);
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
    tonalPitchOffset: calculateTonalOffset(
      tone,
      phoneIndex,
      phoneCount,
      note.dynamic,
      note.expression,
    ),
    toneMelodyRelation: calculateToneMelodyRelation(tone, pitchDelta(note, nextNote)),
  };
}

function dynamicScaleFactor(dynamic: string): number {
  switch (dynamic) {
    case "pppp":
      return 0.2;
    case "ppp":
      return 0.4;
    case "pp":
      return 0.6;
    case "p":
      return 0.8;
    case "mp":
      return 0.95;
    case "mf":
      return 1.0;
    case "f":
      return 1.1;
    case "ff":
      return 1.25;
    case "fff":
      return 1.4;
    case "ffff":
      return 1.6;
    default:
      return 1.0;
  }
}

/**
 * Calculate microtonal pitch offset (in semitones) for a given tone and phone position.
 */
function calculateTonalOffset(
  tone: number,
  index: number,
  count: number,
  dynamic: string = "mf",
  _expression: string | null = null,
): number {
  if (count <= 1) return 0;
  const ratio = index / (count - 1);
  let offset = 0;

  switch (tone) {
    case 1: // Huyền (Low falling)
      offset = -0.5 * ratio;
      break;
    case 2: // Sắc (High rising)
      offset = 0.6 * ratio;
      break;
    case 3: // Hỏi (Dipping)
      offset = ratio < 0.5 ? -0.4 * (ratio * 2) : -0.4 + 0.4 * ((ratio - 0.5) * 2);
      break;
    case 4: // Ngã (Rising + glottal)
      offset = 0.8 * ratio;
      break;
    case 5: // Nặng (Falling + sharp)
      offset = -0.7 * ratio;
      break;
    default:
      offset = 0;
  }

  // Feature 3: Dynamic volume & pitch assist (pppp-ffff)
  const scale = dynamicScaleFactor(dynamic);
  offset *= scale;

  // Head/Tail assists (Attack overshoot / release decay)
  const isLoud = ["f", "ff", "fff", "ffff"].includes(dynamic);
  const isSoft = ["p", "pp", "ppp", "pppp"].includes(dynamic);
  if (index === 0) {
    // Head (Attack)
    if (isLoud) {
      offset += 0.25 * (dynamic === "ffff" ? 1.6 : 1.0); // sharp attack overshoot
    } else if (isSoft) {
      offset -= 0.15 * (dynamic === "pppp" ? 1.6 : 1.0); // soft scoop
    }
  } else if (index === count - 1) {
    // Tail (Decay)
    if (isSoft) {
      offset -= 0.35 * (dynamic === "pppp" ? 1.8 : 1.0); // deeper release decay fall
    }
  }

  return offset;
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
