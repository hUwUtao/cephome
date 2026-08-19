import { sinsyContextGroups, type SinsyContextGroups } from "../../engine/vsinsy/lab/emitters.ts";
import { VietnameseMoraPlanTranspiler } from "../../engine/vsinsy/lab/mora-plan.ts";
import { classifyPhone, validateSinsyPhones } from "../../engine/vsinsy/lab/phoneme.ts";
import { pitchName } from "../../engine/vsinsy/lab/pitch-name.ts";
import { VowelAnchoredTimingStrategy } from "../../engine/vsinsy/lab/timing.ts";
import { canonicalizeSingingLyric } from "../../engine/vmora/normalize.ts";
import type {
  PhoneEvent,
  PhoneRole,
  ScoreDocument,
  ScoreNote,
  TimedPhonePlan,
} from "../../engine/vsinsy/lab/types.ts";

export const PLUGIN_VERSION = "2.0.1" as const;
const TRACK_SCHEMA = "amadeus.track/v2" as const;
const PLUGIN_ID = "lang.vi.vlp" as const;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface TempoPoint {
  tick: number;
  bpm: number;
}

export interface MeterPoint {
  tick: number;
  beats: number;
  beatType: number;
}

export interface AuthoredNote {
  id: string;
  startTick: number;
  endTick: number;
  pitch: number;
  lyric?: string;
  language?: string;
  ties?: string[];
  slurs?: string[];
  flags?: { breath?: boolean; accent?: boolean; staccato?: boolean };
  dynamic?: string;
  phoneOverride?: string[];
  pitchExpression?: JsonValue;
  vibrato?: JsonValue;
  extensions?: Record<string, JsonValue>;
}

export interface AuthoredGap {
  id: string;
  startTick: number;
  endTick: number;
  kind: "pau" | "sil" | "br";
  extensions?: Record<string, JsonValue>;
}

export interface AuthoredTrack {
  schema: typeof TRACK_SCHEMA;
  trackId: string;
  ppq: number;
  tempoMap: TempoPoint[];
  meterMap: MeterPoint[];
  extent: { startTick: number; endTick: number };
  languageRoute: string[];
  notes: AuthoredNote[];
  gaps: AuthoredGap[];
  extensions?: Record<string, JsonValue>;
}

export interface TimingEdit {
  phoneId: string;
  boundaryOffset100ns: number;
}

export interface Diagnostic {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  ownerId?: string;
  phoneId?: string;
}

export interface PhonePlanPhone {
  id: string;
  ownerId: string;
  sourceNoteIds?: string[];
  ownerKind: "note" | "gap";
  phone: string;
  role: PhoneRole;
  weight: number;
  ghost: boolean;
  vacuum: boolean;
  velocity?: number;
  start100ns: number;
  end100ns: number;
  sourceIndex: number;
  sourceCount: number;
  tone: number;
  vowelSign: number;
  metadata: PhoneEvent["metadata"];
  note: ScoreNote;
}

export interface ModuleProvenance {
  pluginId: typeof PLUGIN_ID;
  pluginVersion: typeof PLUGIN_VERSION;
  selectedLanguage: string;
  route: string[];
}

export interface PhonePlan {
  trackId: string;
  phones: PhonePlanPhone[];
  diagnostics: Diagnostic[];
  provenance: ModuleProvenance;
}

export interface EngineRow {
  rowId: string;
  sourcePhoneId: string;
  segmentIndex: number;
  start100ns: number;
  end100ns: number;
  phoneme: string;
  noteId?: string;
  gapId?: string;
  scoreStartTick: number;
  scoreEndTick: number;
  midi: number | null;
  contexts: SinsyContextGroups;
}

export interface EngineScore {
  kind: "neutrino_sinsy_v1";
  trackId: string;
  rows: EngineRow[];
  diagnostics: Diagnostic[];
  provenance: ModuleProvenance;
}

type PluginError = {
  kind: "unsupported" | "malformed" | "incompatible_schema" | "runtime";
  message: string;
};

const timing = new VowelAnchoredTimingStrategy({ trailingSilenceSeconds: 0 });
const transpiler = new VietnameseMoraPlanTranspiler();

export function plan(track: AuthoredTrack): PhonePlan | PluginError {
  const problem = validateTrack(track);
  if (problem) return problem;
  const selectedLanguage = track.languageRoute[0] ?? "vi";
  if (selectedLanguage !== "vi") {
    return { kind: "unsupported", message: `Cephome does not support ${selectedLanguage}` };
  }
  const unsupportedNote = track.notes.find(
    (note) => note.language !== undefined && note.language !== "vi",
  );
  if (unsupportedNote) {
    return {
      kind: "unsupported",
      message: `Cephome does not support ${unsupportedNote.language} for ${unsupportedNote.id}`,
    };
  }

  const planned = scoreFromTrack(track);
  const score = planned.score;
  const events = compensateVowelAnchors(timing.planPhoneEvents(score, transpiler));
  const sourceKeyCounts = new Map<string, number>();
  for (const event of events) {
    const key = `${event.note.id}:${event.phoneIndexInNote}`;
    sourceKeyCounts.set(key, (sourceKeyCounts.get(key) ?? 0) + 1);
  }
  const phones = events.map((event, eventIndex) => {
    const ownerId = event.note.id;
    const sourceIndex = event.phoneIndexInNote;
    const sourceCount = event.phoneCountInNote;
    const ownerPrefix = event.note.isRest ? "gap" : "note";
    const sourceKey = `${ownerId}:${sourceIndex}`;
    const id =
      sourceKeyCounts.get(sourceKey) === 1
        ? `${ownerPrefix}:${ownerId}:phone:${sourceIndex}`
        : `${ownerPrefix}:${ownerId}:event:${eventIndex}`;
    return phoneFromEvent(track, event, id, sourceIndex, sourceCount);
  });
  const invalid = validateSinsyPhones(phones.map((phone) => phone.phone));
  if (invalid.length > 0) {
    return { kind: "malformed", message: `unsupported phone palette: ${invalid.join(", ")}` };
  }
  return {
    trackId: track.trackId,
    phones,
    diagnostics: planned.diagnostics,
    provenance: provenance(selectedLanguage, track.languageRoute),
  };
}

function compensateVowelAnchors(events: PhoneEvent[]): PhoneEvent[] {
  const groups: PhoneEvent[][] = [];
  for (const event of events) {
    const current = groups[groups.length - 1];
    if (!current || current[0]!.note.id !== event.note.id) groups.push([event]);
    else current.push(event);
  }

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const previous = groups[groupIndex - 1];
    const current = groups[groupIndex]!;
    const anchorIndex = current.findIndex((event) => event.role === "anchor");
    if (anchorIndex <= 0) continue;

    const anchor = current[anchorIndex]!;
    const authoredStart = anchor.note.start100ns;
    if (authoredStart === undefined || anchor.start <= authoredStart) continue;

    const firstPre = current[0]!;
    const minimumPreviousEnd = previous ? previous[0]!.start + previous.length : 0;
    const availableShift = Math.max(0, firstPre.start - minimumPreviousEnd);
    const shift = Math.min(anchor.start - authoredStart, availableShift);
    if (shift <= 0) continue;

    // Temporary facade compensation until the engine timing-correction hook owns vowel anchors.
    for (let index = 0; index < anchorIndex; index += 1) {
      current[index]!.start -= shift;
      current[index]!.end -= shift;
    }
    anchor.start -= shift;
    if (previous) closePhoneGroupAt(previous, current[0]!.start);
  }

  return events;
}

function closePhoneGroupAt(group: PhoneEvent[], end: number): void {
  let cursor = end;
  for (let index = group.length - 1; index >= 0; index -= 1) {
    const event = group[index]!;
    if (event.end <= cursor) break;
    event.end = cursor;
    if (event.start >= event.end) event.start = event.end - 1;
    cursor = event.start;
  }
}

export function finalize(
  planValue: PhonePlan,
  timingEdits: TimingEdit[] = [],
): EngineScore | PluginError {
  const diagnostics = [...planValue.diagnostics];
  const ownerCounts = new Map<string, number>();
  for (const phone of planValue.phones) {
    ownerCounts.set(phone.ownerId, (ownerCounts.get(phone.ownerId) ?? 0) + 1);
  }
  const events = planValue.phones.map((phone) =>
    eventFromPhone(phone, ownerCounts.get(phone.ownerId) ?? 1),
  );
  const byId = new Map(planValue.phones.map((phone, index) => [phone.id, index]));
  for (const edit of timingEdits) {
    const index = byId.get(edit.phoneId);
    if (index === undefined) {
      diagnostics.push({
        severity: "warning",
        code: "obsolete_timing_edit",
        message: `Timing edit references unknown phone ${edit.phoneId}`,
        phoneId: edit.phoneId,
      });
      continue;
    }
    const event = events[index]!;
    const proposed = event.start + edit.boundaryOffset100ns;
    const lower = index === 0 ? 0 : events[index - 1]!.start + 1;
    const upper = index + 1 < events.length ? events[index + 1]!.start - 1 : event.end - 1;
    event.start = Math.max(lower, Math.min(proposed, upper));
    if (index > 0) events[index - 1]!.end = event.start;
  }

  const finalized = enforceContinuousStream(events);
  const segmentCounters = new Map<string, number>();
  const rows = finalized.map((event, index) => {
    const sourcePhoneId = event.sourcePhoneId;
    if (!sourcePhoneId) throw new Error(`finalized row ${index} lost source phone identity`);
    const segmentIndex = segmentCounters.get(sourcePhoneId) ?? 0;
    segmentCounters.set(sourcePhoneId, segmentIndex + 1);
    return rowFromEvent(finalized, index, sourcePhoneId, segmentIndex);
  });
  return {
    kind: "neutrino_sinsy_v1",
    trackId: planValue.trackId,
    rows,
    diagnostics,
    provenance: planValue.provenance,
  };
}

function validateTrack(track: AuthoredTrack): PluginError | null {
  if (!track || track.schema !== TRACK_SCHEMA) {
    return { kind: "incompatible_schema", message: `expected ${TRACK_SCHEMA}` };
  }
  if (!track.trackId?.trim()) return { kind: "malformed", message: "trackId is empty" };
  if (!Number.isSafeInteger(track.ppq) || track.ppq <= 0) {
    return { kind: "malformed", message: "ppq must be a positive safe integer" };
  }
  if (
    !track.tempoMap.length ||
    track.tempoMap[0]?.tick !== 0 ||
    track.tempoMap.some(
      (point, index) =>
        !Number.isSafeInteger(point.tick) ||
        point.tick < 0 ||
        !Number.isFinite(point.bpm) ||
        point.bpm <= 0 ||
        (index > 0 && point.tick <= track.tempoMap[index - 1]!.tick),
    )
  ) {
    return { kind: "malformed", message: "tempoMap must contain positive BPM values" };
  }
  if (
    !track.meterMap.length ||
    track.meterMap[0]?.tick !== 0 ||
    track.meterMap.some(
      (point, index) =>
        !Number.isSafeInteger(point.tick) ||
        point.tick < 0 ||
        !Number.isSafeInteger(point.beats) ||
        point.beats <= 0 ||
        !Number.isSafeInteger(point.beatType) ||
        point.beatType <= 0 ||
        (index > 0 && point.tick <= track.meterMap[index - 1]!.tick),
    )
  ) {
    return { kind: "malformed", message: "meterMap must be ordered and positive" };
  }
  if (
    !Number.isSafeInteger(track.extent.startTick) ||
    !Number.isSafeInteger(track.extent.endTick) ||
    track.extent.startTick < 0 ||
    track.extent.endTick <= track.extent.startTick
  ) {
    return { kind: "malformed", message: "track extent is empty" };
  }
  const ids = [...track.notes.map((note) => note.id), ...track.gaps.map((gap) => gap.id)];
  if (new Set(ids).size !== ids.length || ids.some((id) => !id.trim())) {
    return { kind: "malformed", message: "note and gap IDs must be non-empty and unique" };
  }
  const segments = [
    ...track.notes.map((note) => ({
      start: note.startTick,
      end: note.endTick,
      valid:
        Number.isSafeInteger(note.pitch) &&
        note.pitch >= 0 &&
        note.pitch <= 127 &&
        Number.isSafeInteger(note.startTick) &&
        Number.isSafeInteger(note.endTick),
    })),
    ...track.gaps.map((gap) => ({
      start: gap.startTick,
      end: gap.endTick,
      valid: Number.isSafeInteger(gap.startTick) && Number.isSafeInteger(gap.endTick),
    })),
  ].sort((left, right) => left.start - right.start || left.end - right.end);
  let cursor = track.extent.startTick;
  for (const segment of segments) {
    if (
      !segment.valid ||
      segment.start !== cursor ||
      segment.end <= segment.start ||
      segment.end > track.extent.endTick
    ) {
      return {
        kind: "malformed",
        message: "notes and explicit gaps must cover the track extent without overlap",
      };
    }
    cursor = segment.end;
  }
  if (cursor !== track.extent.endTick) {
    return {
      kind: "malformed",
      message: "notes and explicit gaps must cover the track extent without holes",
    };
  }
  return null;
}

interface PlannedScore {
  score: ScoreDocument;
  diagnostics: Diagnostic[];
}

function scoreFromTrack(track: AuthoredTrack): PlannedScore {
  const collapsed = collapseSlurChains(track);
  const notes = [
    ...collapsed.notes.map((note) => noteToScoreNote(track, note)),
    ...track.gaps.map((gap) => gapToScoreNote(track, gap)),
  ].sort((left, right) => left.start100ns! - right.start100ns! || left.id.localeCompare(right.id));
  return {
    score: { sourceName: track.trackId, divisions: track.ppq, notes },
    diagnostics: collapsed.diagnostics,
  };
}

interface CollapsedSlurNotes {
  notes: AuthoredNote[];
  diagnostics: Diagnostic[];
}

function collapseSlurChains(track: AuthoredTrack): CollapsedSlurNotes {
  const input = [...track.notes].sort(
    (left, right) => left.startTick - right.startTick || left.id.localeCompare(right.id),
  );
  const notes: AuthoredNote[] = [];
  const diagnostics: Diagnostic[] = [];

  for (let index = 0; index < input.length; ) {
    const note = input[index]!;
    if (!note.slurs?.includes("start")) {
      if (note.slurs?.includes("stop")) {
        diagnostics.push({
          severity: "warning",
          code: "orphan_slur_stop",
          message: `Slur stop ${note.id} has no matching start and was planned independently`,
          ownerId: note.id,
        });
      }
      const standalone = normalizedAuthoredNote(note);
      notes.push(standalone);
      index += 1;
      continue;
    }

    const chain = [note];
    let closed = note.slurs.includes("stop");
    let cursor = index + 1;
    while (!closed && cursor < input.length) {
      const previous = chain[chain.length - 1]!;
      const next = input[cursor]!;
      if (next.startTick !== previous.endTick) break;
      if (hasVoicedLyric(next)) {
        diagnostics.push({
          severity: "warning",
          code: "lyric_closes_open_slur",
          message: `Lyric on ${next.id} closes the open slur from ${note.id} before that note`,
          ownerId: note.id,
        });
        break;
      }
      if (next.slurs?.includes("start")) {
        diagnostics.push({
          severity: "warning",
          code: "nested_slur_start",
          message: `Slur start ${next.id} closes the open slur from ${note.id} before that note`,
          ownerId: note.id,
        });
        break;
      }
      chain.push(next);
      cursor += 1;
      closed = next.slurs?.includes("stop") ?? false;
    }
    if (!closed) {
      diagnostics.push({
        severity: "warning",
        code: "unmatched_slur_start",
        message: `Slur start ${note.id} extends through its contiguous lyricless notes`,
        ownerId: note.id,
      });
    }

    const owner = normalizedAuthoredNote(note);
    owner.endTick = chain[chain.length - 1]!.endTick;
    notes.push(owner);
    index = cursor;
  }

  return { notes, diagnostics };
}

function normalizedAuthoredNote(note: AuthoredNote): AuthoredNote {
  const lyric = note.lyric === undefined ? undefined : canonicalizeSingingLyric(note.lyric);
  return {
    ...note,
    lyric: lyric && lyric !== "-" && lyric !== "+" ? lyric : undefined,
    slurs: undefined,
  };
}

function hasVoicedLyric(note: AuthoredNote): boolean {
  const lyric = canonicalizeSingingLyric(note.lyric ?? "");
  return lyric.length > 0 && lyric !== "-" && lyric !== "+";
}

function noteToScoreNote(track: AuthoredTrack, note: AuthoredNote): ScoreNote {
  const tempo = tempoAt(track, note.startTick);
  const meter = meterAt(track, note.startTick);
  const pitch = pitchName(note.pitch);
  const phonePlan = note.phoneOverride?.map<TimedPhonePlan>((phone, index, all) => ({
    phone,
    role: roleForOverride(phone, index, all),
    weight: 1,
  }));
  return {
    id: note.id,
    partId: track.trackId,
    measureNumber: "1",
    voice: "1",
    staff: "1",
    startDiv: note.startTick,
    endDiv: note.endTick,
    durationDiv: note.endTick - note.startTick,
    divisions: track.ppq,
    tempo,
    beat: { beats: meter.beats, beatType: meter.beatType },
    isRest: false,
    isChord: false,
    isGrace: false,
    isCue: false,
    isPrintable: true,
    lyric: note.lyric ?? null,
    carriedPhones: note.phoneOverride ?? null,
    carriedPlan: phonePlan ?? null,
    carriedTone: null,
    syllabic: "single",
    pitch,
    tie: tieEdge(note.ties),
    slur: slurEdge(note.slurs),
    hasBreath: note.flags?.breath ?? false,
    dynamic: note.dynamic ?? "mf",
    hasAccent: note.flags?.accent ?? false,
    hasStaccato: note.flags?.staccato ?? false,
    start100ns: tickTo100ns(track, note.startTick),
    end100ns: tickTo100ns(track, note.endTick),
  };
}

function gapToScoreNote(track: AuthoredTrack, gap: AuthoredGap): ScoreNote {
  const tempo = tempoAt(track, gap.startTick);
  const meter = meterAt(track, gap.startTick);
  return {
    id: gap.id,
    partId: track.trackId,
    measureNumber: "1",
    voice: "1",
    staff: "1",
    startDiv: gap.startTick,
    endDiv: gap.endTick,
    durationDiv: gap.endTick - gap.startTick,
    divisions: track.ppq,
    tempo,
    beat: { beats: meter.beats, beatType: meter.beatType },
    isRest: true,
    isChord: false,
    isGrace: false,
    isCue: false,
    isPrintable: true,
    lyric: null,
    carriedPhones: [gap.kind],
    carriedPlan: [{ phone: gap.kind, role: "breath", weight: 1 }],
    carriedTone: 0,
    syllabic: null,
    pitch: null,
    tie: null,
    slur: null,
    hasBreath: gap.kind === "br",
    dynamic: "mf",
    hasAccent: false,
    hasStaccato: false,
    expression: gap.kind === "sil" ? "talk-silence" : gap.kind === "br" ? "talk-breath" : null,
    start100ns: tickTo100ns(track, gap.startTick),
    end100ns: tickTo100ns(track, gap.endTick),
  };
}

function phoneFromEvent(
  track: AuthoredTrack,
  event: PhoneEvent,
  id: string,
  sourceIndex: number,
  sourceCount: number,
): PhonePlanPhone {
  const sourceNoteIds = track.notes
    .filter((note) => {
      const start = tickTo100ns(track, note.startTick);
      const end = tickTo100ns(track, note.endTick);
      return start < event.end && end > event.start;
    })
    .map((note) => note.id);
  return {
    id,
    ownerId: event.note.id,
    sourceNoteIds: sourceNoteIds.length > 0 ? sourceNoteIds : [event.note.id],
    ownerKind: event.note.isRest ? "gap" : "note",
    phone: event.phoneme,
    role: event.role,
    weight: event.weight ?? 1,
    ghost: event.ghost ?? false,
    vacuum: event.vacuum ?? false,
    velocity: event.velocity,
    start100ns: event.start,
    end100ns: event.end,
    sourceIndex,
    sourceCount,
    tone: event.tone,
    vowelSign: event.vowelSign,
    metadata: event.metadata,
    note: event.note,
  };
}

function eventFromPhone(phone: PhonePlanPhone, phoneCountInNote: number): PhoneEvent {
  return {
    start: phone.start100ns,
    end: phone.end100ns,
    phoneme: phone.phone,
    cls: classifyPhone(phone.phone),
    role: phone.role,
    note: phone.note,
    tone: phone.tone,
    vowelSign: phone.vowelSign,
    metadata: phone.metadata,
    ghost: phone.ghost,
    vacuum: phone.vacuum,
    velocity: phone.velocity,
    weight: phone.weight,
    phoneIndexInNote: phone.sourceIndex,
    phoneCountInNote: phone.sourceCount || phoneCountInNote,
    sourcePhoneId: phone.id,
  };
}

function enforceContinuousStream(events: PhoneEvent[]): PhoneEvent[] {
  for (let index = 1; index < events.length; index += 1) {
    const previous = events[index - 1]!;
    const current = events[index]!;
    if (current.start <= previous.start) {
      throw new Error(`phone ${index} is not ordered after phone ${index - 1}`);
    }
    previous.end = current.start;
  }
  const invalid = events.findIndex((event) => event.end <= event.start);
  if (invalid >= 0) throw new Error(`phone ${invalid} has an empty timing window`);
  return events;
}

function rowFromEvent(
  events: PhoneEvent[],
  index: number,
  sourcePhoneId: string,
  segmentIndex: number,
): EngineRow {
  const event = events[index]!;
  const contexts = sinsyContextGroups(events, index);
  contexts.e[58] = "0";
  return {
    rowId: `${sourcePhoneId}:segment:${segmentIndex}`,
    sourcePhoneId,
    segmentIndex,
    start100ns: event.start,
    end100ns: event.end,
    phoneme: event.phoneme,
    noteId: event.note.isRest ? undefined : event.note.id,
    gapId: event.note.isRest ? event.note.id : undefined,
    scoreStartTick: event.note.startDiv,
    scoreEndTick: event.note.endDiv,
    midi: event.note.pitch?.midi ?? null,
    contexts,
  };
}

function provenance(selectedLanguage: string, route: string[]): ModuleProvenance {
  return {
    pluginId: PLUGIN_ID,
    pluginVersion: PLUGIN_VERSION,
    selectedLanguage,
    route: [...route],
  };
}

function tempoAt(track: AuthoredTrack, tick: number): number {
  let active = track.tempoMap[0]!;
  for (const point of track.tempoMap)
    if (point.tick <= tick && point.tick >= active.tick) active = point;
  return active.bpm;
}

function meterAt(track: AuthoredTrack, tick: number): MeterPoint {
  let active = track.meterMap[0]!;
  for (const point of track.meterMap)
    if (point.tick <= tick && point.tick >= active.tick) active = point;
  return active;
}

function tickTo100ns(track: AuthoredTrack, targetTick: number): number {
  const points = [...track.tempoMap].sort((left, right) => left.tick - right.tick);
  let cursor = 0;
  let bpm = points[0]!.bpm;
  let output = 0;
  for (const point of points.slice(1)) {
    if (point.tick >= targetTick) break;
    output += ((point.tick - cursor) * 600_000_000) / (track.ppq * bpm);
    cursor = point.tick;
    bpm = point.bpm;
  }
  output += ((targetTick - cursor) * 600_000_000) / (track.ppq * bpm);
  return Math.round(output);
}

function tieEdge(values: string[] | undefined): "start" | "stop" | "continue" | null {
  const start = values?.includes("start") ?? false;
  const stop = values?.includes("stop") ?? false;
  return start && stop ? "continue" : start ? "start" : stop ? "stop" : null;
}

function slurEdge(values: string[] | undefined): "start" | "stop" | null {
  if (values?.includes("start")) return "start";
  if (values?.includes("stop")) return "stop";
  return null;
}

function roleForOverride(phone: string, index: number, phones: string[]): PhoneRole {
  if (["pau", "sil", "br"].includes(phone)) return "breath";
  const anchor = phones.findIndex((candidate) => ["a", "i", "u", "e", "o"].includes(candidate));
  if (anchor < 0) return "tail";
  if (index < anchor) return "pre";
  return ["a", "i", "u", "e", "o"].includes(phone) ? "anchor" : "tail";
}
