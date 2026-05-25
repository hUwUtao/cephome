import type {
  LyricTranspiler,
  PhoneEvent,
  PhoneRole,
  RoleAwareLyricTranspiler,
  ScoreDocument,
  ScoreNote,
  TimedPhonePlan,
  TimingStrategy,
} from "./types.ts";
import { classifyPhone } from "./phoneme.ts";
import { DEFAULT_VIETNAMESE_METADATA } from "./vietnamese-metadata.ts";
import { isFixedOnset } from "../onset.ts";


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
      const transpiled = note.lyric ? lyricTranspiler.transpile(note.lyric) : null;
      const tone = note.carriedTone ?? transpiled?.tone ?? 0;
      const vowelSign = transpiled?.vowelSign ?? 0;
      const metadata = transpiled?.metadata ?? DEFAULT_VIETNAMESE_METADATA;
      phones.forEach((phoneme, index) => {
        events.push({
          start,
          end,
          phoneme,
          cls: classifyPhone(phoneme),
          role: "anchor",
          note,
          tone,
          vowelSign,
          metadata,
          velocity: undefined,
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
  maxGhostSeconds: number;
  maxGhostRatio: number;
  maxVacuumSeconds: number;
  maxVacuumRatio: number;
  prefireStrength: number;
  lingerRatio: number;
  maxLingerSeconds: number;
  tailSteal: number;
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
      maxGhostSeconds: options.maxGhostSeconds ?? 0.015,
      maxGhostRatio: options.maxGhostRatio ?? 0.08,
      maxVacuumSeconds: options.maxVacuumSeconds ?? 0.004,
      maxVacuumRatio: options.maxVacuumRatio ?? 0.02,
      prefireStrength: options.prefireStrength ?? 0.45,
      lingerRatio: options.lingerRatio ?? 0.18,
      maxLingerSeconds: options.maxLingerSeconds ?? 0.08,
      tailSteal: options.tailSteal ?? 0.6,
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

      const planResult = planForNote(note, lyricTranspiler);
      const transpiled = note.lyric ? lyricTranspiler.transpile(note.lyric) : null;
      const tone = note.carriedTone ?? transpiled?.tone ?? 0;
      const vowelSign = transpiled?.vowelSign ?? 0;
      const metadata = transpiled?.metadata ?? DEFAULT_VIETNAMESE_METADATA;
      const windows = assignPhoneWindows(planResult, start, end, this.options);
      windows.forEach((window, index) => {
        events.push({
          start: window.start,
          end: window.end,
          phoneme: window.phone,
          cls: classifyPhone(window.phone),
          role: window.role,
          note,
          tone,
          vowelSign,
          metadata: window.metadata ?? metadata,
          ghost: window.ghost,
          vacuum: window.vacuum,
          velocity: window.velocity,
          phoneIndexInNote: index,
          phoneCountInNote: windows.length,
        });
      });
    }

    return collapseCrowdedVacuumEvents(applyBoundaryPrefire(events, this.options));
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
  return note.hasBreath ? [...phones, "br"] : phones;
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
    return splitWindow(plan, start, end, options);
  }

  let preDur = 0;
  for (const item of pre) {
    if (isFixedOnset(item.phone)) {
      preDur += 400_000; // 40ms fixed duration
    } else {
      preDur += 200_000; // 20ms default
    }
  }

  let tailDur = 0;
  for (const item of tail) {
    const isConsonantCoda = ["m", "n", "ng", "nh", "p", "t", "c", "ch", "N", "cl", "g"].includes(item.phone);
    if (isConsonantCoda) {
      tailDur += 350_000; // 35ms fixed duration
    } else {
      tailDur += 250_000; // 25ms default
    }
  }

  const nonAnchorLimit = total * options.maxNonAnchorRatio;
  if (preDur + tailDur > nonAnchorLimit) {
    const scale = nonAnchorLimit / (preDur + tailDur);
    preDur *= scale;
    tailDur *= scale;
  }

  const preEnd = start + Math.floor(preDur);
  const tailStart = end - Math.floor(tailDur);
  return [
    ...splitWindow(pre, start, preEnd, options),
    ...splitWindow(anchor, preEnd, tailStart, options),
    ...splitWindow(tail, tailStart, end, options),
  ];
}

function applyBoundaryPrefire(
  events: PhoneEvent[],
  options: VowelAnchoredTimingOptions,
): PhoneEvent[] {
  const groups = groupByNote(events);
  for (let index = 1; index < groups.length; index++) {
    const previous = groups[index - 1]!;
    const current = groups[index]!;
    const previousNote = previous[0]!.note;
    const currentNote = current[0]!.note;

    if (previousNote.isRest || currentNote.isRest || currentNote.hasBreath) continue;

    const preEvents = current.filter((event) => event.role === "pre");
    if (preEvents.length === 0) continue;

    const boundary = current[0]!.start;
    const preDuration = sumDurations(preEvents);
    const previousDuration = previous[previous.length - 1]!.end - previous[0]!.start;
    const lingerReserve = Math.min(
      previousDuration * options.lingerRatio,
      options.maxLingerSeconds * 10_000_000,
    );
    const prefire = Math.floor(
      Math.min(preDuration * options.prefireStrength, lingerReserve * options.tailSteal),
    );

    if (prefire <= 0) continue;

    const previousLast = previous[previous.length - 1]!;
    const previousLastDuration = previousLast.end - previousLast.start;
    const protection = Math.min(previousLastDuration * 0.4, 200_000);
    const safePrefire = Math.floor(
      Math.min(prefire, Math.max(0, previousLastDuration - protection)),
    );

    const newPreviousEnd = Math.max(previousLast.start + 1, boundary - safePrefire);
    previousLast.end = Math.min(previousLast.end, newPreviousEnd);

    for (const event of current) {
      event.start = Math.floor(Math.max(previousLast.end, event.start - safePrefire));
      event.end = Math.floor(Math.max(event.start + 1, event.end - safePrefire));
    }
  }

  return events.map((event) => ({
    ...event,
    start: Math.floor(event.start),
    end: Math.floor(event.end),
  }));
}

function groupByNote(events: PhoneEvent[]): PhoneEvent[][] {
  const groups: PhoneEvent[][] = [];
  for (const event of events) {
    const current = groups[groups.length - 1];
    if (!current || current[0]!.note.id !== event.note.id) groups.push([event]);
    else current.push(event);
  }
  return groups;
}

function collapseCrowdedVacuumEvents(events: PhoneEvent[]): PhoneEvent[] {
  const groups = groupByNote(events);
  const collapsed = new Set<PhoneEvent>();

  groups.forEach((group, groupIndex) => {
    const previous = groups[groupIndex - 1];
    const next = groups[groupIndex + 1];
    if (trailingConsonantCount(previous) < 2 && leadingConsonantCount(next) < 2) return;

    for (let eventIndex = 0; eventIndex < group.length; eventIndex++) {
      const event = group[eventIndex]!;
      if (!event.vacuum) continue;
      const receiver = group[eventIndex + 1] ?? group[eventIndex - 1];
      if (receiver) {
        if (receiver.start >= event.end) receiver.start = event.start;
        else receiver.end = Math.max(receiver.end, event.end);
      }
      collapsed.add(event);
    }
  });

  return renumberPhoneIndexes(events.filter((event) => !collapsed.has(event)));
}

function trailingConsonantCount(group: PhoneEvent[] | undefined): number {
  if (!group) return 0;
  let count = 0;
  for (let index = group.length - 1; index >= 0; index--) {
    const event = group[index]!;
    if (event.ghost || event.role === "breath") continue;
    if (event.cls === "v") break;
    if (event.cls === "c") count++;
  }
  return count;
}

function leadingConsonantCount(group: PhoneEvent[] | undefined): number {
  if (!group) return 0;
  let count = 0;
  for (const event of group) {
    if (event.ghost || event.role === "breath") continue;
    if (event.cls === "v") break;
    if (event.cls === "c") count++;
  }
  return count;
}

function renumberPhoneIndexes(events: PhoneEvent[]): PhoneEvent[] {
  for (const group of groupByNote(events)) {
    group.forEach((event, index) => {
      event.phoneIndexInNote = index;
      event.phoneCountInNote = group.length;
    });
  }
  return events;
}

function sumDurations(events: Array<{ start: number; end: number; role: PhoneRole }>): number {
  return events.reduce((sum, event) => sum + Math.max(0, event.end - event.start), 0);
}

function splitWindow(
  plan: TimedPhonePlan[],
  start: number,
  end: number,
  options: VowelAnchoredTimingOptions,
): Array<TimedPhonePlan & { start: number; end: number }> {
  if (plan.length === 0) return [];
  const total = Math.max(1, end - start);
  const weightSum = plan.reduce((sum, item) => sum + Math.max(item.weight, 0.01), 0);
  const maxGhostDuration = Math.max(
    1,
    Math.floor(Math.min(options.maxGhostSeconds * 10_000_000, total * options.maxGhostRatio)),
  );
  const maxVacuumDuration = Math.max(
    1,
    Math.floor(Math.min(options.maxVacuumSeconds * 10_000_000, total * options.maxVacuumRatio)),
  );
  const durations = plan.map((item) =>
    Math.max(1, Math.floor((total * Math.max(item.weight, 0.01)) / weightSum)),
  );
  let durationSum = durations.reduce((sum, duration) => sum + duration, 0);
  durations[durations.length - 1] = Math.max(
    1,
    durations[durations.length - 1]! + total - durationSum,
  );

  let savedGhostDuration = 0;
  for (let index = 0; index < plan.length; index++) {
    const item = plan[index]!;
    const maxDuration = item.vacuum ? maxVacuumDuration : maxGhostDuration;
    if (!item.ghost || durations[index]! <= maxDuration) continue;
    savedGhostDuration += durations[index]! - maxDuration;
    durations[index] = maxDuration;
  }

  const realWeightSum = plan.reduce(
    (sum, item) => (item.ghost ? sum : sum + Math.max(item.weight, 0.01)),
    0,
  );
  if (savedGhostDuration > 0 && realWeightSum > 0) {
    let remaining = savedGhostDuration;
    let lastRealIndex = -1;
    for (let index = 0; index < plan.length; index++) {
      const item = plan[index]!;
      if (item.ghost) continue;
      lastRealIndex = index;
      const addition = Math.floor(
        (savedGhostDuration * Math.max(item.weight, 0.01)) / realWeightSum,
      );
      durations[index] = durations[index]! + addition;
      remaining -= addition;
    }
    if (lastRealIndex >= 0) durations[lastRealIndex] = durations[lastRealIndex]! + remaining;
  }

  durationSum = durations.reduce((sum, duration) => sum + duration, 0);
  durations[durations.length - 1] = Math.max(
    1,
    durations[durations.length - 1]! + total - durationSum,
  );

  let cursor = start;
  return plan.map((item, index) => {
    const isLast = index === plan.length - 1;
    const next = isLast ? end : cursor + durations[index]!;
    const event = { ...item, start: cursor, end: Math.max(next, cursor + 1) };
    cursor = event.end;
    return event;
  });
}
