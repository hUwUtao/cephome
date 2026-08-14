import type { ScorePitch } from "./types.ts";

const NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const STEPS = ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"];

export function pitchName(midi: number): ScorePitch {
  const bounded = Math.max(0, Math.min(127, Math.round(midi)));
  const pitchClass = bounded % 12;
  const octave = Math.floor(bounded / 12) - 1;
  return {
    step: STEPS[pitchClass]!,
    alter: [1, 3, 6, 8, 10].includes(pitchClass) ? -1 : 0,
    octave,
    midi: bounded,
    pitchClass,
    name: `${NAMES[pitchClass]}${octave}`,
  };
}
