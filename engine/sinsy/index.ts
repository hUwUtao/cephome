import { writeFileSync } from "node:fs";
import { DomMusicXmlParser } from "./musicxml.ts";
import { MonoLabelEmitter, SinsyFullLabelEmitter } from "./emitters.ts";
import { VowelAnchoredTimingStrategy } from "./timing.ts";
import { VietnameseMoraPlanTranspiler } from "./mora-plan.ts";
import { VocalLineNormalizer } from "./voice-select.ts";
import { buildPhraseOverrideText, phraseOverrideDictionaryFromText } from "./phrase-override.ts";
import { generateTimelineSvg } from "./timeline-svg.ts";
import { generateInteractivePlayerHtml } from "./player-template.ts";
import { flatTtsToLabel, isXml } from "./flat-tts.ts";
import { readGlobalPhraseOverride, writeGlobalPhraseOverride } from "./phrase-override-hooks.ts";
import type { PhonePlanParseOptions } from "./phone-plan.ts";
import type {
  LabelEmitter,
  LyricTranspiler,
  MusicXmlParser,
  PhoneEvent,
  ScoreNote,
  ScoreNormalizer,
  TimingStrategy,
} from "./types.ts";

export interface SinsyPipelineOptions {
  parser?: MusicXmlParser;
  normalizer?: ScoreNormalizer;
  lyricTranspiler?: LyricTranspiler;
  timing?: TimingStrategy;
  monoEmitter?: LabelEmitter;
  fullEmitter?: LabelEmitter;
  phraseOverrideText?: string | null;
  phraseOverrideOptions?: PhonePlanParseOptions;
  quiet?: boolean;
  noSvg?: boolean;
}

export interface SinsySerializationResult {
  mono: string;
  full: string;
}

export interface SinsySerializationTrace extends SinsySerializationResult {
  score: ReturnType<ScoreNormalizer["normalize"]>;
  events: ReturnType<TimingStrategy["toPhoneEvents"]>;
  phraseOverrideWarnings: string[];
  phraseOverrideApplied: number;
}

export class SinsyLabelPipeline {
  private readonly parser: MusicXmlParser;
  private readonly normalizer: ScoreNormalizer;
  private readonly lyricTranspiler: LyricTranspiler | null;
  private readonly timing: TimingStrategy;
  private readonly monoEmitter: LabelEmitter;
  private readonly fullEmitter: LabelEmitter;
  private readonly phraseOverrideText: string | null;
  private readonly phraseOverrideOptions: PhonePlanParseOptions;
  private readonly quiet: boolean;
  private readonly noSvg: boolean;

  constructor(options: SinsyPipelineOptions = {}) {
    this.parser = options.parser ?? new DomMusicXmlParser();
    this.normalizer = options.normalizer ?? new VocalLineNormalizer();
    this.lyricTranspiler = options.lyricTranspiler ?? null;
    this.timing = options.timing ?? new VowelAnchoredTimingStrategy();
    this.monoEmitter = options.monoEmitter ?? new MonoLabelEmitter();
    this.fullEmitter = options.fullEmitter ?? new SinsyFullLabelEmitter();
    this.phraseOverrideText = options.phraseOverrideText ?? null;
    this.phraseOverrideOptions = options.phraseOverrideOptions ?? {};
    this.quiet = options.quiet ?? false;
    this.noSvg = options.noSvg ?? false;
  }

  serialize(xml: string, sourceName?: string): SinsySerializationResult {
    const result = this.serializeTrace(xml, sourceName);
    return {
      mono: result.mono,
      full: result.full,
    };
  }

  serializeTrace(xml: string, sourceName?: string): SinsySerializationTrace {
    const score = this.normalizer.normalize(this.parser.parse(xml, sourceName));
    let phraseOverrideWarnings: string[] = [];
    let phraseOverrideApplied = 0;
    let lyricTranspiler = this.lyricTranspiler ?? new VietnameseMoraPlanTranspiler();
    if (this.phraseOverrideText?.trim()) {
      const dictionary = phraseOverrideDictionaryFromText(
        score,
        this.phraseOverrideText,
        this.phraseOverrideOptions,
      );
      phraseOverrideWarnings = dictionary.warnings;
      phraseOverrideApplied = dictionary.applied;
      if (!this.lyricTranspiler) {
        lyricTranspiler = new VietnameseMoraPlanTranspiler("singing", dictionary.entries);
      }
    }
    const events = this.timing.toPhoneEvents(score, lyricTranspiler);
    const trace: SinsySerializationTrace = {
      score,
      events,
      mono: this.monoEmitter.emit(events),
      full: this.fullEmitter.emit(events),
      phraseOverrideWarnings,
      phraseOverrideApplied,
    };

    if (!this.quiet) {
      console.error(buildDiagnosticReport(trace));
    }

    return trace;
  }
}

/**
 * Top-level transcription function compatible with stub.ts.
 * Handles side effects like SVG emission and diagnostics.
 */
export async function transcribeWithOverrides(
  content: Uint8Array | string,
  sourceName?: string,
): Promise<SinsySerializationResult> {
  const text = typeof content === "string" ? content : new TextDecoder().decode(content);
  const omitGhost = (globalThis as any).omit_phrase_ghost === true;
  const quiet = (globalThis as any).quiet === true;
  const noSvg = (globalThis as any).no_svg === true;
  const noPlayer = (globalThis as any).no_player === true;

  if (!isXml(text)) {
    if (!quiet) console.error("[cephome] mode: Flat-TTS Mode");
    return flatTtsToLabel(text);
  }

  if (!quiet) console.error("[cephome] mode: Music Mode");
  const phraseOverrideText = await readGlobalPhraseOverride();

  const pipeline = new SinsyLabelPipeline({
    phraseOverrideText,
    phraseOverrideOptions: { omitGhost },
    quiet,
    noSvg,
  });

  const result = pipeline.serializeTrace(text, sourceName);

  if (!phraseOverrideText?.trim()) {
    await writeGlobalPhraseOverride(buildPhraseOverrideText(result.score));
  }

  if (sourceName && !noSvg) {
    const svgPath = `${sourceName}.timeline.svg`;
    const svgContent = generateTimelineSvg(result.events);
    try {
      writeFileSync(svgPath, svgContent, "utf8");
      if (!quiet) console.error(`output timeline SVG -> ${svgPath}`);
    } catch (e) {
      console.error(`[cephome] failed to write SVG: ${e}`);
    }

    if (!noPlayer) {
      const playerPath = `${sourceName}.player.html`;
      try {
        const playerHtml = await generateInteractivePlayerHtml(svgContent, sourceName);
        writeFileSync(playerPath, playerHtml, "utf8");
        if (!quiet) console.error(`output player HTML -> ${playerPath}`);
      } catch (e) {
        console.error(`[cephome] failed to write player HTML: ${e}`);
      }
    }
  }

  return {
    mono: result.mono,
    full: result.full,
  };
}

/**
 * Alias for transcribeWithOverrides for backward compatibility.
 */
export const transcribe = transcribeWithOverrides;

export function buildDiagnosticReport(result: SinsySerializationTrace): string {
  const lines: string[] = [];
  const notes = result.score.notes;
  const events = result.events;
  const monoRows = labelRows(result.mono);
  const fullRows = labelRows(result.full);
  const lyricNotes = notes.filter((note) => note.lyric);
  const rests = notes.filter((note) => note.isRest);
  const pitches = notes.flatMap((note) => (note.pitch ? [note.pitch.midi] : []));
  const tempos = [...new Set(notes.map((note) => Math.round(note.tempo)))];
  const voiceKey = dominantVoiceKey(notes);
  const badDurations = events.filter((event) => event.end <= event.start);
  const shortPhones = events.filter(
    (event) =>
      event.phoneme !== "pau" &&
      event.end - event.start < 300_000 &&
      event.decimationEase === undefined, // Ignore split segments
  );
  const nonMonotonic = nonMonotonicEvents(events);
  const badFullRows = fullRows.filter((row) => /NaN|undefined|null/.test(row.text));
  const criticalXx = fullRows.filter((row) => /\/E:xx]xx\^|~xx!/.test(row.text));
  const symbolicContext = fullRows.filter((row) =>
    /glottalized|creaky|checked|contrary|parallel|oblique|diphthong|triphthong/.test(row.text),
  );

  lines.push("[cephome] diagnostic");
  lines.push(`source=${result.score.sourceName}`);
  lines.push(`selectedVoice=${voiceKey}`);
  lines.push(
    `notes=${notes.length} lyrics=${lyricNotes.length} rests=${rests.length} events=${events.length}`,
  );
  lines.push(`labelRows full=${fullRows.length} mono=${monoRows.length}`);
  lines.push(`tempo=${tempos.join(",") || "none"}`);
  lines.push(`pitch=${pitchRange(pitches)}`);
  lines.push(`durationTicks=${durationRange(events)}`);
  lines.push(`firstNote=${noteSummary(notes[0])}`);
  lines.push(`lastNote=${noteSummary(notes[notes.length - 1])}`);
  lines.push(`firstEvent=${eventSummary(events[0])}`);
  lines.push(`lastEvent=${eventSummary(events[events.length - 1])}`);
  lines.push(`rowCountMatch=${fullRows.length === monoRows.length ? "yes" : "no"}`);
  lines.push(`badDurations=${badDurations.length}`);
  lines.push(`nonMonotonic=${nonMonotonic.length}`);
  lines.push(`shortPhonesLt30ms=${shortPhones.length}`);
  lines.push(`badFullRows=${badFullRows.length}`);
  lines.push(`criticalXx=${criticalXx.length}`);
  lines.push(`symbolicContext=${symbolicContext.length}`);
  lines.push(`phraseOverrideApplied=${result.phraseOverrideApplied}`);

  if (badDurations.length > 0)
    appendList(lines, "badDurationEvents", badDurations.map(eventSummary));
  if (nonMonotonic.length > 0)
    appendList(lines, "nonMonotonicEvents", nonMonotonic.map(eventSummary));
  if (badFullRows.length > 0)
    appendList(
      lines,
      "badFullRows",
      badFullRows.map((row) => `${row.index}:${row.text}`),
    );
  if (criticalXx.length > 0)
    appendList(
      lines,
      "criticalXxRows",
      criticalXx.map((row) => `${row.index}:${row.text}`),
    );
  appendList(lines, "phraseOverrideWarnings", result.phraseOverrideWarnings);
  return lines.join("\n");
}

function labelRows(label: string): Array<{ index: number; text: string }> {
  return label
    .split(/\r?\n/)
    .map((text, index) => ({ index, text }))
    .filter((row) => row.text.length > 0);
}

function dominantVoiceKey(notes: ScoreNote[]): string {
  const counts = new Map<string, number>();
  for (const note of notes) {
    const key = `${note.partId}/${note.voice}/${note.staff}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let bestKey = "none";
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      bestKey = key;
      bestCount = count;
    }
  }
  return `${bestKey} (${bestCount})`;
}

function pitchRange(pitches: number[]): string {
  if (pitches.length === 0) return "none";
  return `${Math.min(...pitches)}..${Math.max(...pitches)}`;
}

function durationRange(events: PhoneEvent[]): string {
  if (events.length === 0) return "none";
  const starts = events.map((event) => event.start);
  const ends = events.map((event) => event.end);
  return `${Math.min(...starts)}..${Math.max(...ends)}`;
}

function noteSummary(note: ScoreNote | undefined): string {
  if (!note) return "none";
  const lyric = note.lyric ?? (note.carriedPhones ? `[${note.carriedPhones.join(",")}]` : "null");
  const pitch = note.pitch ? `${note.pitch.name}/${note.pitch.midi}` : "rest";
  return [
    note.id,
    `m=${note.measureNumber}`,
    `div=${note.startDiv}-${note.endDiv}`,
    `dur=${note.durationDiv}`,
    `tempo=${note.tempo}`,
    `pitch=${pitch}`,
    `lyric=${lyric}`,
    `rest=${note.isRest ? 1 : 0}`,
    `tie=${note.tie ?? "0"}`,
    `slur=${note.slur ?? "0"}`,
  ].join(" ");
}

function eventSummary(event: PhoneEvent | undefined): string {
  if (!event) return "none";
  return [
    `${event.start}-${event.end}`,
    event.phoneme,
    `role=${event.role}`,
    `dur=${event.end - event.start}`,
    `note=${event.note.id}`,
    `lyric=${event.note.lyric ?? "null"}`,
    `pitch=${event.note.pitch?.name ?? "rest"}`,
    `tone=${event.tone}`,
    `vowel=${event.vowelSign}`,
  ].join(" ");
}

function nonMonotonicEvents(events: PhoneEvent[]): PhoneEvent[] {
  const out: PhoneEvent[] = [];
  let previousStart = Number.NEGATIVE_INFINITY;
  for (const event of events) {
    if (event.start < previousStart) out.push(event);
    previousStart = event.start;
  }
  return out;
}

function appendList(lines: string[], title: string, items: string[]): void {
  lines.push(`[cephome] ${title} (${items.length})`);
  for (const item of items) lines.push(`  ${item}`);
}

export * from "./emitters.ts";
export * from "./expression.ts";
export * from "./musicxml.ts";
export * from "./mora-plan.ts";
export * from "./phoneme.ts";
export * from "./phrase-override.ts";
export * from "./phrase-override-hooks.ts";
export * from "./timing.ts";
export * from "./transpiler.ts";
export * from "./voice-select.ts";
export * from "./flat-tts.ts";
export type * from "./types.ts";
