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
import { DEFAULT_VIETNAMESE_METADATA } from "../mxl/vietnamese-metadata.ts";
import { isFixedOnset } from "../../vmora/onset.ts";

export class CumulativeFloatTimingStrategy implements TimingStrategy {
  toPhoneEvents(score: ScoreDocument, lyricTranspiler: LyricTranspiler): PhoneEvent[] {
    const events: PhoneEvent[] = [];
    const notes = score.notes
      .filter((note) => !note.isChord)
      .sort((a, b) => a.startDiv - b.startDiv || a.id.localeCompare(b.id));

    for (const note of notes) {
      const start = ticksForDivs(note.startDiv, note);
      const end = ticksForDivs(note.endDiv, note);

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

    for (const note of notes) {
      const start = ticksForDivs(note.startDiv, note);
      const end = ticksForDivs(note.endDiv, note);

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

    return applyVowelDecimationSplit(
      applyNoteDecimationSplit(
        collapseCrowdedVacuumEvents(applyBoundaryPrefire(events, this.options)),
      ),
    );
  }
}

function ticksForDivs(divs: number, note: { divisions: number; tempo: number }): number {
  // (divs / divisions) * (60 / tempo) * 10_000_000
  // = (divs * 600_000_000) / (divisions * tempo)
  // Using integer arithmetic — no float accumulation.
  return Math.round((divs * 600_000_000) / (note.divisions * note.tempo));
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
	if (note.carriedPlan) {
		let plan = note.carriedPlan;
		if (note.hasBreath) plan = [...plan, { phone: "br", role: "breath", weight: 0.4 }];
		return plan;
	}
	if (note.carriedPhones) {
		let plan = phonesToPlan(note.carriedPhones);
		if (note.hasBreath) plan = [...plan, { phone: "br", role: "breath", weight: 0.4 }];
		return plan;
	}

  let plan: TimedPhonePlan[];
  if (note.lyric && isRoleAware(lyricTranspiler)) {
    plan = lyricTranspiler.plan(note.lyric).plan;
  } else {
    plan = phonesToPlan(note.lyric ? lyricTranspiler.transpile(note.lyric).phones : []);
  }

  if (note.codaSuppress) {
    plan = plan.filter((item) => item.role !== "tail");
  }

  if (note.hasBreath) plan = [...plan, { phone: "br", role: "breath", weight: 0.4 }];
  return plan;
}

function isRoleAware(
  lyricTranspiler: LyricTranspiler,
): lyricTranspiler is RoleAwareLyricTranspiler {
  return "plan" in lyricTranspiler && typeof lyricTranspiler.plan === "function";
}

function isVowelPhone(phone: string): boolean {
	return ["a", "i", "u", "e", "o"].includes(phone);
}

function phonesToPlan(phones: string[]): TimedPhonePlan[] {
	const firstAnchor = phones.findIndex((phone) => isVowelPhone(phone));
	return phones.map((phone, index) => ({
		phone,
		role: firstAnchor < 0 ? "tail"
			: index < firstAnchor ? "pre"
			: isVowelPhone(phone) ? "anchor"
			: "tail",
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
    const isConsonantCoda = ["m", "n", "ng", "nh", "p", "t", "c", "ch", "N", "cl", "g"].includes(
      item.phone,
    );
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

    if (currentNote.hasBreath) continue;

    const previousLast = previous[previous.length - 1]!;

    // Tail expansion: note's last phone extends into following pause for smooth fall
    if (currentNote.isRest && !previousNote.isRest) {
      const pauseEvent = current[0]!;
      const lastDur = previousLast.end - previousLast.start;
      const pauseDur = pauseEvent.end - pauseEvent.start;
      const tailFade = Math.floor(Math.min(
        lastDur * 0.3,
        pauseDur * 0.3,
        500_000, // max 50ms
      ));
      if (tailFade > 0) {
        previousLast.end = Math.min(previousLast.end + tailFade, pauseEvent.end);
        pauseEvent.start = Math.max(pauseEvent.start, previousLast.end);
      }
      continue;
    }

    const preEvents = current.filter((event) => event.role === "pre");
    if (preEvents.length === 0) {
      const firstEvent = current[0]!;
      if (previousLast.end < firstEvent.start) {
        firstEvent.start = previousLast.end;
      }
      continue;
    }

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

/**
 * Ease-in-out cubic interpolation (Hermite).
 * t=0 → 0, t=1 → 1, smooth S-curve.
 */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * Feature 2 – Vowel Decimation Split for Slur Swinginess.
 *
 * When a vowel anchor belongs to a slur-start note that transitions to a
 * different pitch on the slur target, split the vowel into three contiguous
 * sub-segments:
 *   [head] [transition (25 ms)] [tail]
 *
 * The middle "transition" segment carries `decimationEase: 0.5` — the
 * ease-in-out cubic midpoint — so the HTS engine receives a clear intermediate
 * pitch guide for the portamento swing rather than having to guess a linear
 * ramp. This controls the vibrato onset and the slur pitch-glide shape.
 *
 * Only slur-start notes are split (not every pitch change) so that ordinary
 * melody steps remain unaffected.
 * Guard: the vowel event must be ≥ 75 ms to leave room for the two 25 ms
 * tail segments.
 */
const DECIMATION_SEGMENT_TICKS = 250_000; // 25 ms
const DECIMATION_MIN_TICKS = 750_000; // need ≥ 75 ms for a clean 3-way split

function applyVowelDecimationSplit(events: PhoneEvent[]): PhoneEvent[] {
  // Build a fast lookup: note id → next distinct pitched note (the slur target)
  const noteOrder: ScoreNote[] = [];
  const seenIds = new Set<string>();
  for (const ev of events) {
    if (!seenIds.has(ev.note.id)) {
      seenIds.add(ev.note.id);
      noteOrder.push(ev.note);
    }
  }
  const nextPitchedNote = new Map<string, ScoreNote | null>();
  for (let i = 0; i < noteOrder.length; i++) {
    const note = noteOrder[i]!;
    let next: ScoreNote | null = null;
    for (let j = i + 1; j < noteOrder.length; j++) {
      if (!noteOrder[j]!.isRest && noteOrder[j]!.pitch) {
        next = noteOrder[j]!;
        break;
      }
    }
    nextPitchedNote.set(note.id, next);
  }

  const out: PhoneEvent[] = [];
  for (const event of events) {
    // Only target slur-start anchor vowels with enough duration
    if (
      event.cls !== "v" ||
      event.role !== "anchor" ||
      event.ghost ||
      event.note.isRest ||
      !event.note.pitch ||
      event.note.slur !== "start"
    ) {
      out.push(event);
      continue;
    }

    const nextNote = nextPitchedNote.get(event.note.id) ?? null;
    const pitchDelta = nextNote?.pitch ? nextNote.pitch.midi - event.note.pitch.midi : 0;
    const duration = event.end - event.start;

    // Only split when the slur actually changes pitch AND there is enough room
    if (pitchDelta === 0 || duration < DECIMATION_MIN_TICKS) {
      out.push(event);
      continue;
    }

    // Three-way split: head / transition / tail
    const transStart = event.end - DECIMATION_SEGMENT_TICKS * 2;
    const transEnd = event.end - DECIMATION_SEGMENT_TICKS;

    // Head segment — stays at the slur-start note's pitch
    out.push({ ...event, end: transStart });
    // Transition (middle) segment — ease-in-out midpoint pitch between the two notes
    out.push({ ...event, start: transStart, end: transEnd, decimationEase: easeInOutCubic(0.5) });
    // Tail segment — last moment still at start pitch, engine begins the ramp here
    out.push({ ...event, start: transEnd });
  }

  return renumberPhoneIndexes(out);
}

/**
 * Feature 3 – Note Decimation (Subdivision) for Tonal Swing.
 *
 * When a vowel anchor is long enough and has a tone (eligible for tonal F0
 * swing), subdivide it into multiple sub-segments. Each sub-segment gets its
 * own phoneIndexInNote / phoneCountInNote, so `calculateTonalOffset` produces
 * a differentiated microtonal offset per segment, creating a more expressive
 * tonal contour within a sustained vowel.
 *
 * Conditions:
 * - Vowel anchor (role="anchor", cls="v")
 * - Not ghost, not rest, has pitch
 * - Has a non-zero tone (1–5, eligible for tonal swing)
 * - Duration exceeds the note-relative threshold
 *
 * Segment durations follow a progressive ramp (1:2:3:… weighting) so the
 * first sub-segment is shortest (quick tonal departure) and later segments
 * get progressively more settling time.
 */
const NOTE_DECIMATION_MIN_TICKS = 3_500_000; // 350 ms minimum for subdivision

export function applyNoteDecimationSplit(events: PhoneEvent[]): PhoneEvent[] {
  const groups = groupByNote(events);
  const out: PhoneEvent[] = [];

  for (const group of groups) {
    // Find the first eligible non-ghost vowel anchor
    const eligibleIndex = group.findIndex(
      (event) =>
        event.cls === "v" &&
        event.role === "anchor" &&
        !event.ghost &&
        !event.note.isRest &&
        event.note.pitch &&
        event.tone >= 1 &&
        event.tone <= 5,
    );

    if (eligibleIndex === -1) {
      out.push(...group);
      continue;
    }

    // Expand to the full vowel phase: all contiguous vowel-class phones
    // (diphthong/triphthong companions) stopping before semivowel codas.
    let phaseStart = eligibleIndex;
    let phaseEnd = eligibleIndex;
    while (phaseStart > 0 && group[phaseStart - 1]?.cls === "v") phaseStart--;
    while (
      phaseEnd < group.length - 1 &&
      group[phaseEnd + 1]?.cls === "v" &&
      group[phaseEnd + 1]?.role !== "tail"
    ) phaseEnd++;

    const vowelPhase = group.slice(phaseStart, phaseEnd + 1);
    const duration = vowelPhase.reduce((sum, e) => sum + (e.end - e.start), 0);

    if (duration < NOTE_DECIMATION_MIN_TICKS) {
      out.push(...group);
      continue;
    }

    // Pre-vowel events (onset consonants, etc.)
    for (let i = 0; i < phaseStart; i++) out.push(group[i]!);

    // Subdivided vowel phase — each vowel keeps its original
    // weight-proportional time.  Only phones long enough get
    // subdivided; short ghost vowels are emitted as-is.
    const phaseAnchor = vowelPhase[0]!.start;
    let phoneOffset = 0;

    for (const ve of vowelPhase) {
      const phoneDur = ve.end - ve.start;
      // Double split per mora: split phone into 2 progressive sub-segments
      // Only skip if the phone is trivially short (< 50ms — ghost scraps)
      const segs = phoneDur >= 500_000 ? 2 : 1;
      if (segs <= 1) {
        out.push({ ...ve, start: phaseAnchor + phoneOffset, end: phaseAnchor + phoneOffset + phoneDur });
        phoneOffset += phoneDur;
        continue;
      }

      const pw = (segs * (segs + 1)) / 2;
      const bounds: number[] = [0];
      let cum = 0;
      for (let i = 0; i < segs; i++) {
        cum += i + 1;
        bounds.push(Math.round((cum / pw) * phoneDur));
      }
      bounds[segs] = phoneDur;

      for (let s = 0; s < segs; s++) {
        out.push({
          ...ve,
          start: phaseAnchor + phoneOffset + bounds[s]!,
          end: phaseAnchor + phoneOffset + bounds[s + 1]!,
        });
      }
      phoneOffset += phoneDur;
    }

    // Post-vowel events (coda tails, breath, etc.)
    for (let i = phaseEnd + 1; i < group.length; i++) out.push(group[i]!);
  }

  return renumberPhoneIndexes(out);
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
