import type { LabelEmitter, PhoneEvent } from "./types.ts";

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
    return events.map((event) => `${event.start} ${event.end} ${event.phoneme}`).join("\n") + "\n";
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
    b[3] = "JPN";
    b[4] = "0";

    c[0] = "1";
    c[1] = "1";
    c[2] = "1";
    c[3] = "JPN";
    c[4] = "0";

    const d = fill(9);
    const e = fill(60);
    e[0] = pitch;
    e[1] = String(note.pitch?.midi ?? 0);
    e[2] = "0";
    e[3] = beat;
    e[4] = tempo;
    e[5] = "1";
    e[26] = note.slur === "stop" || note.tie === "stop" || note.tie === "continue" ? "1" : "0";
    e[27] = note.slur === "start" || note.tie === "start" || note.tie === "continue" ? "1" : "0";
    e[58] = "0";
    e[59] = note.hasBreath ? "1" : "0";

    const f = fill(9);
    f[0] = pitch;
    f[1] = String(note.pitch?.midi ?? 0);
    f[2] = "0";
    f[3] = beat;
    f[4] = tempo;
    f[5] = "1";
    f[6] = durationCentiseconds(note);
    f[7] = String(note.durationDiv);

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

function durationCentiseconds(event: PhoneEvent["note"]): string {
  return String(
    clamp(Math.floor((event.durationDiv / event.divisions) * (60 / event.tempo) * 100), 499),
  );
}
