import type {
  LyricTranspiler,
  PhoneEvent,
  RoleAwareLyricTranspiler,
  ScoreDocument,
  ScoreNote,
  TimedPhonePlan,
  TimingStrategy,
} from "./types.ts";
import { classifyPhone } from "./phoneme.ts";

export class CumulativeFloatTimingStrategy implements TimingStrategy {
  toPhoneEvents(score: ScoreDocument, lyricTranspiler: LyricTranspiler): PhoneEvent[] {
    const events: PhoneEvent[] = [];
    const notes = score.notes
      .filter((note) => !note.isChord)
      .sort((a, b) => a.startDiv - b.startDiv || a.id.localeCompare(b.id));
    let seconds = 0;
    let previousEndDiv = notes[0]?.startDiv ?? 0;

    for (const note of notes) {
      if (note.startDiv > previousEndDiv) {
        seconds += divsToSeconds(note.startDiv - previousEndDiv, note);
      }

      const start = Math.floor(seconds * 10_000_000);
      seconds += divsToSeconds(note.durationDiv, note);
      const end = Math.floor(seconds * 10_000_000);
      previousEndDiv = note.endDiv;

      const phones = phonesForNote(note, lyricTranspiler);
      phones.forEach((phoneme, index) => {
        events.push({
          start,
          end,
          phoneme,
          cls: classifyPhone(phoneme),
          note,
          phoneIndexInNote: index,
          phoneCountInNote: phones.length,
        });
      });
    }

    return events;
  }
}

export interface VowelAnchoredTimingOptions {
  preRatio: number;
  maxPreSeconds: number;
  tailRatio: number;
  maxTailSeconds: number;
  maxNonAnchorRatio: number;
}

export class VowelAnchoredTimingStrategy implements TimingStrategy {
  private readonly options: VowelAnchoredTimingOptions;

  constructor(options: Partial<VowelAnchoredTimingOptions> = {}) {
    this.options = {
      preRatio: options.preRatio ?? 0.12,
      maxPreSeconds: options.maxPreSeconds ?? 0.04,
      tailRatio: options.tailRatio ?? 0.25,
      maxTailSeconds: options.maxTailSeconds ?? 0.12,
      maxNonAnchorRatio: options.maxNonAnchorRatio ?? 0.6,
    };
  }

  toPhoneEvents(score: ScoreDocument, lyricTranspiler: LyricTranspiler): PhoneEvent[] {
    const events: PhoneEvent[] = [];
    const notes = score.notes
      .filter((note) => !note.isChord)
      .sort((a, b) => a.startDiv - b.startDiv || a.id.localeCompare(b.id));
    let seconds = 0;
    let previousEndDiv = notes[0]?.startDiv ?? 0;

    for (const note of notes) {
      if (note.startDiv > previousEndDiv) {
        seconds += divsToSeconds(note.startDiv - previousEndDiv, note);
      }

      const start = Math.floor(seconds * 10_000_000);
      seconds += divsToSeconds(note.durationDiv, note);
      const end = Math.floor(seconds * 10_000_000);
      previousEndDiv = note.endDiv;

      const plan = planForNote(note, lyricTranspiler);
      const windows = assignPhoneWindows(plan, start, end, this.options);
      windows.forEach((window, index) => {
        events.push({
          start: window.start,
          end: window.end,
          phoneme: window.phone,
          cls: classifyPhone(window.phone),
          note,
          phoneIndexInNote: index,
          phoneCountInNote: windows.length,
        });
      });
    }

    return events;
  }
}

function divsToSeconds(divs: number, note: ScoreNote): number {
  return (divs / note.divisions) * (60 / note.tempo);
}

function phonesForNote(note: ScoreNote, lyricTranspiler: LyricTranspiler): string[] {
  if (note.isRest) return ["pau"];
  if (note.carriedPhones)
    return note.hasBreath ? [...note.carriedPhones, "br"] : note.carriedPhones;
  const phones = note.lyric ? lyricTranspiler.transpile(note.lyric).phones : [];
  const base = phones.length > 0 ? phones : ["pau"];
  return note.hasBreath ? [...base, "br"] : base;
}

function planForNote(note: ScoreNote, lyricTranspiler: LyricTranspiler): TimedPhonePlan[] {
  if (note.isRest) return [{ phone: "pau", role: "breath", weight: 1 }];
  if (note.carriedPhones) {
    const carried = note.carriedPhones.map((phone) => ({
      phone,
      role: "anchor" as const,
      weight: 1,
    }));
    return note.hasBreath ? [...carried, { phone: "br", role: "breath", weight: 0.4 }] : carried;
  }

  let plan: TimedPhonePlan[];
  if (note.lyric && isRoleAware(lyricTranspiler)) {
    plan = lyricTranspiler.plan(note.lyric).plan;
  } else {
    plan = phonesToPlan(note.lyric ? lyricTranspiler.transpile(note.lyric).phones : []);
  }

  if (plan.length === 0) plan = [{ phone: "pau", role: "breath", weight: 1 }];
  if (note.hasBreath) plan = [...plan, { phone: "br", role: "breath", weight: 0.4 }];
  return plan;
}

function isRoleAware(
  lyricTranspiler: LyricTranspiler,
): lyricTranspiler is RoleAwareLyricTranspiler {
  return "plan" in lyricTranspiler && typeof lyricTranspiler.plan === "function";
}

function phonesToPlan(phones: string[]): TimedPhonePlan[] {
  const anchor = phones.findIndex((phone) => ["a", "i", "u", "e", "o"].includes(phone));
  return phones.map((phone, index) => ({
    phone,
    role: anchor < 0 ? "tail" : index < anchor ? "pre" : index === anchor ? "anchor" : "tail",
    weight: 1,
  }));
}

function assignPhoneWindows(
  plan: TimedPhonePlan[],
  start: number,
  end: number,
  options: VowelAnchoredTimingOptions,
): Array<TimedPhonePlan & { start: number; end: number }> {
  if (plan.length === 0) return [];
  if (plan.length === 1) return [{ ...plan[0]!, start, end }];

  const total = Math.max(1, end - start);
  const pre = plan.filter((item) => item.role === "pre");
  const anchor = plan.filter((item) => item.role === "anchor");
  const tail = plan.filter((item) => item.role === "tail" || item.role === "breath");

  if (anchor.length === 0) {
    return splitWindow(plan, start, end);
  }

  let preDur =
    pre.length > 0 ? Math.min(total * options.preRatio, options.maxPreSeconds * 10_000_000) : 0;
  let tailDur =
    tail.length > 0 ? Math.min(total * options.tailRatio, options.maxTailSeconds * 10_000_000) : 0;
  const nonAnchorLimit = total * options.maxNonAnchorRatio;
  if (preDur + tailDur > nonAnchorLimit) {
    const scale = nonAnchorLimit / (preDur + tailDur);
    preDur *= scale;
    tailDur *= scale;
  }

  const preEnd = start + Math.floor(preDur);
  const tailStart = end - Math.floor(tailDur);
  return [
    ...splitWindow(pre, start, preEnd),
    ...splitWindow(anchor, preEnd, tailStart),
    ...splitWindow(tail, tailStart, end),
  ];
}

function splitWindow(
  plan: TimedPhonePlan[],
  start: number,
  end: number,
): Array<TimedPhonePlan & { start: number; end: number }> {
  if (plan.length === 0) return [];
  const total = Math.max(1, end - start);
  const weightSum = plan.reduce((sum, item) => sum + Math.max(item.weight, 0.01), 0);
  let cursor = start;
  return plan.map((item, index) => {
    const isLast = index === plan.length - 1;
    const next = isLast
      ? end
      : cursor + Math.max(1, Math.floor((total * Math.max(item.weight, 0.01)) / weightSum));
    const event = { ...item, start: cursor, end: Math.max(next, cursor + 1) };
    cursor = event.end;
    return event;
  });
}
