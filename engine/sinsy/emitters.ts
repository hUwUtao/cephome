import { expressionForNote } from "./expression.ts";
import type { LabelEmitter, PhoneEvent, ScoreNote } from "./types.ts";

const P_SEP = ["", "@", "^", "-", "+", "=", "_", "%", "^", "_", "~", "-", "!", "[", "$", "]"];
const A_SEP = ["/A:", "-", "-", "@", "~"];
const B_SEP = ["/B:", "_", "_", "@", "|"];
const C_SEP = ["/C:", "+", "+", "@", "&"];
const D_SEP = ["/D:", "!", "#", "$", "%", "|", "&", ";", "-"];
const E_SEP = [
  "/E:",
  "]",
  "^",
  "=",
  "~",
  "!",
  "@",
  "#",
  "+",
  "]",
  "$",
  "|",
  "[",
  "&",
  "]",
  "=",
  "^",
  "~",
  "#",
  "_",
  ";",
  "$",
  "&",
  "%",
  "[",
  "|",
  "]",
  "-",
  "^",
  "+",
  "~",
  "=",
  "@",
  "$",
  "!",
  "%",
  "#",
  "|",
  "|",
  "-",
  "&",
  "&",
  "+",
  "[",
  ";",
  "]",
  ";",
  "~",
  "~",
  "^",
  "^",
  "@",
  "[",
  "#",
  "=",
  "!",
  "~",
  "+",
  "!",
  "^",
];
const F_SEP = ["/F:", "#", "#", "-", "$", "$", "+", "%", ";"];
const G_SEP = ["/G:", "_"];
const H_SEP = ["/H:", "_"];
const I_SEP = ["/I:", "_"];
const J_SEP = ["/J:", "~", "@"];

export class MonoLabelEmitter implements LabelEmitter {
  emit(events: PhoneEvent[]): string {
    return (
      ["0 0 pau", ...events.map((event) => `${event.start} ${event.end} ${event.phoneme}`)].join(
        "\n",
      ) + "\n"
    );
  }
}

export class SinsyFullLabelEmitter implements LabelEmitter {
  emit(events: PhoneEvent[]): string {
    return (
      events
        .map((event, index) => `${event.start} ${event.end} ${this.contextFor(events, index)}`)
        .join("\n") + "\n"
    );
  }

  private contextFor(events: PhoneEvent[], index: number): string {
    const event = events[index]!;
    const note = event.note;
    const previousNote = distinctNote(events, index, -1);
    const nextNote = distinctNote(events, index, 1);
    const expression = expressionForNote(
      note,
      previousNote,
      nextNote,
      event.tone,
      event.phoneIndexInNote,
      event.phoneCountInNote,
    );
    const pitch = note.pitch?.name ?? "xx";
    const beat = `${note.beat.beats}/${note.beat.beatType}`;
    const tempo = String(Math.round(note.tempo));
    const phoneCount = clamp(event.phoneCountInNote, 9);
    const phonePos = clamp(event.phoneIndexInNote + 1, 9);
    const phoneRemain = clamp(event.phoneCountInNote - event.phoneIndexInNote, 9);

    const p = fill(16);
    p[0] = event.cls;
    p[1] = events[index - 2]?.phoneme ?? "xx";
    p[2] = events[index - 1]?.phoneme ?? "xx";
    p[3] = event.phoneme;
    p[4] = events[index + 1]?.phoneme ?? "xx";
    p[5] = events[index + 2]?.phoneme ?? "xx";
    p[11] = String(phonePos);
    p[12] = String(phoneRemain);

    const a = fill(5);
    const b = fill(5);
    const c = fill(5);
    b[0] = String(phoneCount);
    b[1] = "1";
    b[2] = "1";
    b[3] = "VIE"; // Vietnamese marker
    b[4] = `${event.tone}|${event.vowelSign}`; // Tone 0-5 and Vowel Signature

    c[0] = "1";
    c[1] = "1";
    c[2] = "1";
    c[3] = "VIE";
    c[4] = `${event.tone}|${event.vowelSign}`;

    const d = fill(9);
    fillNoteSummary(d, previousNote);

    const e = fill(60);
    e[0] = pitch;
    e[1] = String(Math.round((note.pitch?.midi ?? 0) + expression.tonalPitchOffset));
    e[2] = String(expression.pitchDeltaFromPrev);
    e[3] = beat;
    e[4] = tempo;
    e[5] = "1";
    e[25] = note.slur === "stop" || note.tie === "stop" || note.tie === "continue" ? "1" : "0";
    e[26] = note.slur === "start" || note.tie === "start" || note.tie === "continue" ? "1" : "0";
    e[27] = note.dynamic;
    e[28] = String(expression.vibratoRateHz);
    e[29] = String(expression.vibratoDepthCents);
    e[30] = String(Math.round(expression.vibratoStartRatio * 100));
    e[31] = String(expression.energy);
    e[34] = note.hasStaccato ? "1" : "0";
    e[35] = note.hasStaccato ? "1" : "0";
    e[40] =
      expression.pitchDeltaFromPrev < 0 ? String(Math.abs(expression.pitchDeltaFromPrev)) : "0";
    e[41] = expression.pitchDeltaToNext > 0 ? String(expression.pitchDeltaToNext) : "0";
    e[48] = String(expression.pitchDeltaFromPrev);
    e[49] = String(expression.pitchDeltaToNext);
    e[58] = "0";
    e[59] = note.hasBreath ? "1" : "0";

    const f = fill(9);
    fillNoteSummary(f, nextNote);

    const g = fill(2);
    const h = fill(2);
    const i = fill(2);
    const j = fill(3);
    h[0] = "1";
    h[1] = "1";
    j[0] = "0";
    j[1] = "0";
    j[2] = "1";

    return [
      serialize(P_SEP, p),
      serialize(A_SEP, a),
      serialize(B_SEP, b),
      serialize(C_SEP, c),
      serialize(D_SEP, d),
      serialize(E_SEP, e),
      serialize(F_SEP, f),
      serialize(G_SEP, g),
      serialize(H_SEP, h),
      serialize(I_SEP, i),
      serialize(J_SEP, j),
    ].join("");
  }
}

function fill(size: number): string[] {
  return Array.from({ length: size }, () => "xx");
}

function serialize(separators: string[], values: string[]): string {
  return values.map((value, index) => `${separators[index]}${value}`).join("");
}

function clamp(value: number, max: number): number {
  return Math.min(Math.max(value, 0), max);
}

function fillNoteSummary(values: string[], note: ScoreNote | null): void {
  if (!note) return;
  values[0] = note.pitch?.name ?? "xx";
  values[1] = String(note.pitch?.midi ?? 0);
  values[2] = "0";
  values[3] = `${note.beat.beats}/${note.beat.beatType}`;
  values[4] = String(Math.round(note.tempo));
  values[5] = "1";
  values[6] = durationCentiseconds(note);
  values[7] = String(note.durationDiv);
}

function distinctNote(events: PhoneEvent[], index: number, direction: -1 | 1): ScoreNote | null {
  const currentId = events[index]!.note.id;
  for (let cursor = index + direction; cursor >= 0 && cursor < events.length; cursor += direction) {
    const note = events[cursor]!.note;
    if (note.id !== currentId && !note.isRest) return note;
  }
  return null;
}

function durationCentiseconds(event: ScoreNote): string {
  return String(
    clamp(Math.floor((event.durationDiv / event.divisions) * (60 / event.tempo) * 100), 499),
  );
}
