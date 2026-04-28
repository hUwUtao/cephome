#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, sep } from "node:path";
import { SinsyLabelPipeline } from "./index.ts";
import type { SinsySerializationTrace } from "./index.ts";
import type { PhoneEvent, ScoreNote } from "./types.ts";

export interface MusicXmlToLabelArgs {
  inputPath: string;
  fullLabelPath: string;
  monoLabelPath: string;
}

export function parseMusicXmlToLabelArgs(argv: string[]): MusicXmlToLabelArgs {
  const args = argv.filter((arg) => arg !== "--");
  if (args.length !== 3 || args.includes("-h") || args.includes("--help")) {
    throw new Error(usage());
  }

  return {
    inputPath: args[0]!,
    fullLabelPath: args[1]!,
    monoLabelPath: args[2]!,
  };
}

export function runMusicXmlToLabel(args: MusicXmlToLabelArgs): void {
  const inputPath = normalizeCliPath(args.inputPath);
  const fullLabelPath = normalizeCliPath(args.fullLabelPath);
  const monoLabelPath = normalizeCliPath(args.monoLabelPath);

  assertInputFile(inputPath);
  prepareOutputFile(fullLabelPath);
  prepareOutputFile(monoLabelPath);
  prepareTimingLabelDirectory(fullLabelPath);

  console.error(`Convert MusicXML to label -> ${inputPath}`);
  const xml = readFileSync(inputPath, "utf8");
  const result = new SinsyLabelPipeline().serializeTrace(xml, inputPath);
  console.error(buildDiagnosticReport(result));

  writeFileSync(fullLabelPath, result.full, "utf8");
  writeFileSync(monoLabelPath, result.mono, "utf8");

  console.error(`output full label -> ${fullLabelPath}`);
  console.error(`output mono label -> ${monoLabelPath}`);
}

function buildDiagnosticReport(result: SinsySerializationTrace): string {
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
    (event) => event.phoneme !== "pau" && event.end - event.start < 300_000,
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
  appendList(lines, "notes", notes.map(noteSummary));
  appendList(lines, "events", events.map(eventSummary));
  appendList(lines, "badDurationEvents", badDurations.map(eventSummary));
  appendList(lines, "nonMonotonicEvents", nonMonotonic.map(eventSummary));
  appendList(lines, "shortPhonesLt30ms", shortPhones.map(eventSummary));
  appendList(
    lines,
    "badFullRows",
    badFullRows.map((row) => `${row.index}:${row.text}`),
  );
  appendList(
    lines,
    "criticalXxRows",
    criticalXx.map((row) => `${row.index}:${row.text}`),
  );
  appendList(
    lines,
    "symbolicContextRows",
    symbolicContext.map((row) => `${row.index}:${row.text}`),
  );
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

function normalizeCliPath(path: string): string {
  return sep === "\\" ? path : path.replace(/\\/g, sep);
}

function assertInputFile(path: string): void {
  if (!existsSync(path)) {
    throw new Error(`Input MusicXML does not exist: ${path}`);
  }
  if (!statSync(path).isFile()) {
    throw new Error(`Input MusicXML is not a file: ${path}`);
  }
}

function prepareOutputFile(path: string): void {
  if (existsSync(path) && statSync(path).isDirectory()) {
    throw new Error(`Output path is a directory, expected file: ${path}`);
  }

  const parent = dirname(path);
  if (!parent || parent === ".") return;

  if (existsSync(parent)) {
    if (!statSync(parent).isDirectory()) {
      throw new Error(`Output parent exists but is not a directory: ${parent}`);
    }
    return;
  }

  mkdirSync(parent, { recursive: true });
}

function prepareTimingLabelDirectory(fullLabelPath: string): void {
  const fullDir = dirname(fullLabelPath);
  if (basename(fullDir).toLowerCase() !== "full") return;

  const timingDir = join(dirname(fullDir), "timing");
  if (existsSync(timingDir)) {
    if (!statSync(timingDir).isDirectory()) {
      throw new Error(`Timing label path exists but is not a directory: ${timingDir}`);
    }
    return;
  }

  mkdirSync(timingDir, { recursive: true });
}

function usage(): string {
  return [
    "usage: musicXMLtoLabel <input.musicxml> <full.lab> <mono.lab>",
    "",
    "Drop-in NEUTRINO musicXMLtoLabel substitute.",
  ].join("\n");
}

export async function main(argv: string[]): Promise<void> {
  try {
    runMusicXmlToLabel(parseMusicXmlToLabelArgs(argv));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (import.meta.main) {
  void main(process.argv.slice(2));
}
