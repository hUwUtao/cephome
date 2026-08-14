import { canonicalizeVietnamese } from "../../vmora/normalize.ts";
import { transcribeSyllableWithError } from "../../vmora/index.ts";
import { MonoLabelEmitter, SinsyFullLabelEmitter } from "./emitters.ts";
import { VietnameseMoraPlanTranspiler } from "./mora-plan.ts";
import { VowelAnchoredTimingStrategy } from "./timing.ts";
import type { PhoneEvent, ScoreDocument, ScoreNote, ScorePitch } from "./types.ts";
import type { SinsySerializationResult } from "../index.ts";
import { metadataForLyric } from "../mxl/vietnamese-metadata.ts";
import { predictTtmDurations } from "./ttm.ts";
import { normalizeTalkNumbers } from "./text-normalize.ts";

export interface TalkModeOptions {
  basePitchMidi?: number;
  pitchMidi?: number;
  pitchName?: string;
  tempo?: number;
  divisions?: number;
  syllableDurationMs?: number;
  shortPauseMs?: number;
  clausePauseMs?: number;
  sentencePauseMs?: number;
  paragraphPauseMs?: number;
  breathPauseMs?: number;
  maxPhraseSyllables?: number;
  syllableDurationDiv?: number;
  shortRestDurationDiv?: number;
  longRestDurationDiv?: number;
  timingModelDirectory?: string;
  durationScale?: number;
  talkSpeed?: number;
  minimumSyllableDurationMs?: number;
  maximumSyllableDurationMs?: number;
  codaMode?: "compact" | "place-aware";
  shortBoundaryMode?: "release" | "connected";
  breathAfterWordIndices?: number[];
}

export type FlatTtsOptions = TalkModeOptions;

type BoundaryKind = "short" | "clause" | "sentence" | "paragraph" | "breath";
type Intonation = "statement" | "question" | "exclamation";

interface SyllableUnit {
  kind: "syllable";
  text: string;
  predictedDurationMs?: number;
}

interface BoundaryUnit {
  kind: "boundary";
  boundary: BoundaryKind;
  intonation: Intonation;
}

type TalkUnit = SyllableUnit | BoundaryUnit;

interface ResolvedTalkOptions {
  basePitchMidi: number;
  tempo: number;
  divisions: number;
  syllableDurationMs: number;
  shortPauseMs: number;
  clausePauseMs: number;
  sentencePauseMs: number;
  paragraphPauseMs: number;
  breathPauseMs: number;
  maxPhraseSyllables: number;
  durationMultiplier: number;
  shortBoundaryMode: "release" | "connected";
  breathAfterWordIndices: Set<number>;
}

const PITCH_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const TOKEN_PATTERN = /(?:\r?\n){2,}|\r?\n|[\p{L}\p{M}]+|[.!?…]+|[,;:]+|[—–-]+/gu;
const INITIAL_PAUSE_MS = 120;

export function isXml(content: string): boolean {
  const trimmed = content.trim().replace(/^\uFEFF/, "");
  return (
    trimmed.startsWith("<?xml") ||
    trimmed.startsWith("<!DOCTYPE") ||
    trimmed.startsWith("<score-partwise") ||
    trimmed.startsWith("<score-timewise")
  );
}

export function parseTextToTalkScore(text: string, options: TalkModeOptions = {}): ScoreDocument {
  const resolved = resolveOptions(options);
  const units = tokenizeTalkText(
    text,
    resolved.maxPhraseSyllables,
    resolved.shortBoundaryMode,
    resolved.breathAfterWordIndices,
  );
  return unitsToScore(units, resolved);
}

export async function parseTextToTalkScoreWithTimingModel(
  text: string,
  options: TalkModeOptions = {},
): Promise<ScoreDocument> {
  const resolved = resolveOptions(options);
  const units = tokenizeTalkText(
    text,
    resolved.maxPhraseSyllables,
    resolved.shortBoundaryMode,
    resolved.breathAfterWordIndices,
  );
  await applyTimingModel(units, options);
  return unitsToScore(units, resolved);
}

function unitsToScore(units: TalkUnit[], resolved: ResolvedTalkOptions): ScoreDocument {
  const notes: ScoreNote[] = [];
  let phrase: SyllableUnit[] = [];
  let currentDiv = 0;
  let noteIndex = 0;

  if (units.some((unit) => unit.kind === "syllable")) {
    const durationDiv = millisecondsToDivisions(INITIAL_PAUSE_MS, resolved);
    notes.push(createRestNote(noteIndex++, currentDiv, durationDiv, resolved, "talk-silence"));
    currentDiv += durationDiv;
  }

  const flushPhrase = (boundary?: BoundaryUnit): void => {
    if (phrase.length === 0) return;

    for (let index = 0; index < phrase.length; index++) {
      const syllable = phrase[index]!;
      const lyric = syllable.text;
      const isFinal = index === phrase.length - 1;
      const inferredDurationMs =
        syllable.predictedDurationMs ??
        syllableDurationMs(
          lyric,
          resolved.syllableDurationMs,
          isFinal ? boundary?.boundary : undefined,
        );
      const durationMs = inferredDurationMs * resolved.durationMultiplier;
      const durationDiv = millisecondsToDivisions(durationMs, resolved);
      notes.push(
        createSyllableNote(
          noteIndex++,
          currentDiv,
          durationDiv,
          lyric,
          resolved.basePitchMidi,
          resolved,
          isFinal && boundary?.intonation === "exclamation",
        ),
      );
      currentDiv += durationDiv;
    }

    phrase = [];
  };

  for (const unit of units) {
    if (unit.kind === "syllable") {
      phrase.push(unit);
      continue;
    }

    flushPhrase(unit);
    if (unit.boundary === "short" && resolved.shortBoundaryMode === "connected") {
      continue;
    }
    const pauseMs = boundaryDurationMs(unit.boundary, resolved);
    const durationDiv = millisecondsToDivisions(pauseMs, resolved);
    if (notes.length > 0 && !notes[notes.length - 1]?.isRest) {
      notes.push(
        createRestNote(
          noteIndex++,
          currentDiv,
          durationDiv,
          resolved,
          boundaryExpression(unit.boundary),
        ),
      );
      currentDiv += durationDiv;
    }
  }

  flushPhrase();

  return {
    sourceName: "talkaloid.txt",
    divisions: resolved.divisions,
    notes,
  };
}

async function applyTimingModel(units: TalkUnit[], options: TalkModeOptions): Promise<void> {
  let sentence: SyllableUnit[] = [];
  const flush = async (): Promise<void> => {
    if (sentence.length === 0) return;
    const durations = await predictTtmDurations(
      sentence.map((syllable) => syllable.text),
      {
        modelDirectory: options.timingModelDirectory,
        minimumDurationMs: positiveNumber(options.minimumSyllableDurationMs, 60),
        maximumDurationMs: positiveNumber(options.maximumSyllableDurationMs, 800),
      },
    );
    sentence.forEach((syllable, index) => {
      syllable.predictedDurationMs = durations[index];
    });
    sentence = [];
  };

  for (const unit of units) {
    if (unit.kind === "syllable") {
      sentence.push(unit);
      continue;
    }
    if (
      unit.boundary === "breath" ||
      unit.boundary === "sentence" ||
      unit.boundary === "paragraph"
    ) {
      await flush();
    }
  }
  await flush();
}

export function talkaloidToLabel(
  text: string,
  options: TalkModeOptions = {},
): SinsySerializationResult {
  return scoreToLabel(parseTextToTalkScore(text, options), options);
}

export async function talkaloidToLabelWithTimingModel(
  text: string,
  options: TalkModeOptions = {},
): Promise<SinsySerializationResult> {
  const score = await parseTextToTalkScoreWithTimingModel(text, options);
  return scoreToLabel(score, options);
}

export async function talkaloidToLabelAuto(
  text: string,
  options: TalkModeOptions = {},
  onTimingFallback?: (error: Error) => void,
): Promise<SinsySerializationResult> {
  try {
    return await talkaloidToLabelWithTimingModel(text, options);
  } catch (error) {
    onTimingFallback?.(error instanceof Error ? error : new Error(String(error)));
    return talkaloidToLabel(text, options);
  }
}

function scoreToLabel(
  score: ScoreDocument,
  options: Pick<TalkModeOptions, "codaMode"> = {},
): SinsySerializationResult {
  const timing = new VowelAnchoredTimingStrategy({
    vowelEmphasis: 1.45,
    maxNonAnchorRatio: 0.45,
    maxGhostSeconds: 0.025,
    maxGhostRatio: 0.12,
    noteDecimationMinSeconds: 0.11,
    noteDecimationSegments: 4,
    trailingSilenceSeconds: 0.18,
    trailingSilencePhone: "sil",
  });
  const transpiler = new VietnameseMoraPlanTranspiler(
    options.codaMode === "place-aware" ? "transparent" : "voicevox",
  );
  const events = closePauseGaps(timing.toPhoneEvents(score, transpiler));

  return {
    mono: new MonoLabelEmitter().emit(events),
    full: new SinsyFullLabelEmitter().emit(events),
  };
}

function closePauseGaps(events: PhoneEvent[]): PhoneEvent[] {
  for (let index = 1; index < events.length; index++) {
    const previous = events[index - 1]!;
    const current = events[index]!;
    if (current.start <= previous.end) continue;

    if (isBoundaryPhone(current.phoneme)) current.start = previous.end;
    else if (isBoundaryPhone(previous.phoneme)) previous.end = current.start;
  }
  return events;
}

function isBoundaryPhone(phone: string): boolean {
  return phone === "pau" || phone === "sil" || phone === "br";
}

export const parseTextToScore = parseTextToTalkScore;
export const flatTtsToLabel = talkaloidToLabel;

function tokenizeTalkText(
  text: string,
  maxPhraseSyllables: number,
  shortBoundaryMode: "release" | "connected",
  breathAfterWordIndices: Set<number>,
): TalkUnit[] {
  const units: TalkUnit[] = [];
  let syllablesInPhrase = 0;
  let wordIndex = 0;
  const forcedBreathSyllables =
    shortBoundaryMode === "connected" ? maxPhraseSyllables + 8 : maxPhraseSyllables;

  for (const match of normalizeTalkNumbers(text).matchAll(TOKEN_PATTERN)) {
    const token = match[0];
    if (/^[\p{L}\p{M}]+$/u.test(token)) {
      const syllable = canonicalizeVietnamese(token.toLowerCase());
      if (!transcribeSyllableWithError(syllable, "voicevox").phonemes) continue;

      if (syllablesInPhrase >= forcedBreathSyllables) {
        pushBoundary(units, { kind: "boundary", boundary: "breath", intonation: "statement" });
        syllablesInPhrase = 0;
      }
      units.push({ kind: "syllable", text: syllable });
      syllablesInPhrase++;
      wordIndex++;
      if (breathAfterWordIndices.has(wordIndex)) {
        pushBoundary(units, {
          kind: "boundary",
          boundary: "breath",
          intonation: "statement",
        });
        syllablesInPhrase = 0;
      }
      continue;
    }

    const boundary = boundaryForToken(token);
    if (shortBoundaryMode === "connected" && boundary.boundary === "short") {
      if (syllablesInPhrase >= maxPhraseSyllables) {
        pushBoundary(units, {
          kind: "boundary",
          boundary: "breath",
          intonation: boundary.intonation,
        });
        syllablesInPhrase = 0;
      } else {
        pushBoundary(units, boundary);
      }
      continue;
    }

    pushBoundary(units, boundary);
    syllablesInPhrase = 0;
  }

  return units;
}

function boundaryForToken(token: string): BoundaryUnit {
  if (/\r?\n\r?\n/.test(token)) {
    return { kind: "boundary", boundary: "paragraph", intonation: "statement" };
  }
  if (/\r?\n/.test(token)) {
    return { kind: "boundary", boundary: "sentence", intonation: "statement" };
  }
  if (token.includes("?")) {
    return { kind: "boundary", boundary: "sentence", intonation: "question" };
  }
  if (token.includes("!")) {
    return { kind: "boundary", boundary: "sentence", intonation: "exclamation" };
  }
  if (/^[.…]+$/.test(token) && (token.includes("…") || token.length > 1)) {
    return { kind: "boundary", boundary: "paragraph", intonation: "statement" };
  }
  if (token === ".") {
    return { kind: "boundary", boundary: "sentence", intonation: "statement" };
  }
  if (token.includes(";") || token.includes(":") || /[—–-]/.test(token)) {
    return { kind: "boundary", boundary: "clause", intonation: "statement" };
  }
  return { kind: "boundary", boundary: "short", intonation: "statement" };
}

function pushBoundary(units: TalkUnit[], boundary: BoundaryUnit): void {
  if (!units.some((unit) => unit.kind === "syllable")) return;
  const previous = units[units.length - 1];
  if (previous?.kind !== "boundary") {
    units.push(boundary);
    return;
  }

  if (boundaryStrength(boundary.boundary) >= boundaryStrength(previous.boundary)) {
    units[units.length - 1] = {
      ...boundary,
      intonation: boundary.intonation === "statement" ? previous.intonation : boundary.intonation,
    };
  }
}

function boundaryStrength(boundary: BoundaryKind): number {
  return ["short", "breath", "clause", "sentence", "paragraph"].indexOf(boundary);
}

function resolveOptions(options: TalkModeOptions): ResolvedTalkOptions {
  const tempo = positiveNumber(options.tempo, 120);
  const divisions = positiveInteger(options.divisions, 100);
  const legacyMsPerDivision = 60_000 / (tempo * divisions);

  return {
    basePitchMidi: Math.round(options.basePitchMidi ?? options.pitchMidi ?? 60),
    tempo,
    divisions,
    syllableDurationMs: positiveNumber(
      options.syllableDurationMs,
      options.syllableDurationDiv ? options.syllableDurationDiv * legacyMsPerDivision : 235,
    ),
    shortPauseMs: positiveNumber(
      options.shortPauseMs,
      options.shortRestDurationDiv ? options.shortRestDurationDiv * legacyMsPerDivision : 70,
    ),
    clausePauseMs: positiveNumber(options.clausePauseMs, 120),
    sentencePauseMs: positiveNumber(
      options.sentencePauseMs,
      options.longRestDurationDiv ? options.longRestDurationDiv * legacyMsPerDivision : 220,
    ),
    paragraphPauseMs: positiveNumber(options.paragraphPauseMs, 360),
    breathPauseMs: positiveNumber(options.breathPauseMs, 100),
    maxPhraseSyllables: positiveInteger(options.maxPhraseSyllables, 12),
    durationMultiplier:
      positiveNumber(options.durationScale, 1) / positiveNumber(options.talkSpeed, 1),
    shortBoundaryMode: options.shortBoundaryMode ?? "release",
    breathAfterWordIndices: new Set(options.breathAfterWordIndices ?? []),
  };
}

function syllableDurationMs(
  lyric: string,
  baseDurationMs: number,
  boundary?: BoundaryKind,
): number {
  const metadata = metadataForLyric(lyric);
  const phoneCount = transcribeSyllableWithError(lyric, "voicevox").phonemes.split(",").length;
  const toneFactors = [1, 1.05, 0.94, 1.1, 1.02, 0.86] as const;
  let duration = baseDurationMs * (toneFactors[metadata.tone] ?? 1);
  duration += Math.max(0, phoneCount - 2) * 14;

  if (metadata.codaClass === "nasal") duration += 18;
  if (metadata.codaClass === "stop") duration -= 15;
  if (boundary === "short") duration *= 1.06;
  if (boundary === "clause" || boundary === "breath") duration *= 1.12;
  if (boundary === "sentence" || boundary === "paragraph") duration *= 1.2;

  return clamp(Math.round(duration), 150, 430);
}

function createSyllableNote(
  index: number,
  startDiv: number,
  durationDiv: number,
  lyric: string,
  pitchMidi: number,
  options: ResolvedTalkOptions,
  emphasized: boolean,
): ScoreNote {
  return {
    id: `talkaloid:${index}`,
    partId: "P1",
    measureNumber: measureNumber(startDiv, options.divisions),
    voice: "1",
    staff: "1",
    startDiv,
    endDiv: startDiv + durationDiv,
    durationDiv,
    divisions: options.divisions,
    tempo: options.tempo,
    beat: { beats: 4, beatType: 4 },
    isRest: false,
    isChord: false,
    isGrace: false,
    isCue: false,
    isPrintable: true,
    lyric,
    carriedPhones: null,
    carriedTone: null,
    syllabic: "single",
    pitch: getScorePitch(pitchMidi),
    tie: null,
    slur: null,
    hasBreath: false,
    dynamic: emphasized ? "f" : "mf",
    hasAccent: emphasized,
    hasStaccato: false,
    expression: "talk",
  };
}

function createRestNote(
  index: number,
  startDiv: number,
  durationDiv: number,
  options: ResolvedTalkOptions,
  expression: string = "talk-pause",
): ScoreNote {
  return {
    id: `talkaloid:${index}`,
    partId: "P1",
    measureNumber: measureNumber(startDiv, options.divisions),
    voice: "1",
    staff: "1",
    startDiv,
    endDiv: startDiv + durationDiv,
    durationDiv,
    divisions: options.divisions,
    tempo: options.tempo,
    beat: { beats: 4, beatType: 4 },
    isRest: true,
    isChord: false,
    isGrace: false,
    isCue: false,
    isPrintable: true,
    lyric: null,
    carriedPhones: null,
    carriedTone: null,
    syllabic: null,
    pitch: null,
    tie: null,
    slur: null,
    hasBreath: false,
    dynamic: "mp",
    hasAccent: false,
    hasStaccato: false,
    expression,
  };
}

function boundaryExpression(boundary: BoundaryKind): string {
  if (boundary === "breath") return "talk-breath";
  if (boundary === "sentence" || boundary === "paragraph") return "talk-silence";
  return "talk-pause";
}

function getScorePitch(midi: number): ScorePitch {
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const name = `${PITCH_NAMES[pitchClass]}${octave}`;
  const stepNames = ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"];
  const step = stepNames[pitchClass] ?? "C";
  const alter = [1, 3, 6, 8, 10].includes(pitchClass) ? 1 : 0;

  return { step, alter, octave, midi, pitchClass, name };
}

function boundaryDurationMs(boundary: BoundaryKind, options: ResolvedTalkOptions): number {
  if (boundary === "short") return options.shortPauseMs;
  if (boundary === "clause") return options.clausePauseMs;
  if (boundary === "paragraph") return options.paragraphPauseMs;
  if (boundary === "breath") return options.breathPauseMs;
  return options.sentencePauseMs;
}

function millisecondsToDivisions(milliseconds: number, options: ResolvedTalkOptions): number {
  return Math.max(1, Math.round((milliseconds * options.tempo * options.divisions) / 60_000));
}

function measureNumber(startDiv: number, divisions: number): string {
  return String(Math.floor(startDiv / (divisions * 4)) + 1);
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Math.max(1, Math.round(positiveNumber(value, fallback)));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(
      "Usage: bun run engine/vsinsy/lab/talkaloid.ts [input.txt] --full <full.lab> --mono <mono.lab> [--pitch <60>] [--tempo <120>] [--speed <1>] [--max-phrase-syllables <12>] [--breath-after-words <12,30>] [--connected-short-boundaries] [--place-aware-codas] [--heuristic]",
    );
    return;
  }

  const fullPath = optionValue(argv, "--full");
  const monoPath = optionValue(argv, "--mono");
  const pitchMidi = Number(optionValue(argv, "--pitch") ?? 60);
  const tempo = Number(optionValue(argv, "--tempo") ?? 120);
  const talkSpeed = Number(optionValue(argv, "--speed") ?? 1);
  const maxPhraseSyllables = Number(optionValue(argv, "--max-phrase-syllables") ?? 12);
  const breathAfterWordIndices = (optionValue(argv, "--breath-after-words") ?? "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
  const inputPath = positionalInput(argv);
  const text = await readInputText(inputPath);
  if (!text.trim()) throw new Error("Input text is empty");

  const talkOptions: TalkModeOptions = {
    basePitchMidi: pitchMidi,
    tempo,
    talkSpeed,
    maxPhraseSyllables,
    breathAfterWordIndices,
    codaMode: argv.includes("--place-aware-codas") ? "place-aware" : "compact",
    shortBoundaryMode: argv.includes("--connected-short-boundaries") ? "connected" : "release",
  };
  const result = argv.includes("--heuristic")
    ? talkaloidToLabel(text, talkOptions)
    : await talkaloidToLabelAuto(text, talkOptions, (error) => {
        console.error(`[cephome] TTM unavailable, using heuristic timing: ${error.message}`);
      });
  const { dirname } = await import("node:path");
  const { mkdirSync, writeFileSync } = await import("node:fs");

  if (fullPath) {
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, result.full, "utf8");
    console.error(`Output full label -> ${fullPath}`);
  } else {
    console.log("=== FULL LABEL ===");
    console.log(result.full);
  }

  if (monoPath) {
    mkdirSync(dirname(monoPath), { recursive: true });
    writeFileSync(monoPath, result.mono, "utf8");
    console.error(`Output mono label -> ${monoPath}`);
  } else if (!fullPath) {
    console.log("=== MONO LABEL ===");
    console.log(result.mono);
  }
}

function optionValue(argv: string[], option: string): string | undefined {
  const index = argv.indexOf(option);
  return index >= 0 ? argv[index + 1] : undefined;
}

function positionalInput(argv: string[]): string | undefined {
  const optionsWithValues = new Set(["--full", "--mono", "--pitch", "--tempo", "--speed"]);
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!;
    if (optionsWithValues.has(argument)) {
      index++;
      continue;
    }
    if (argument === "--heuristic") continue;
    if (!argument.startsWith("-")) return argument;
  }
  return undefined;
}

async function readInputText(inputPath?: string): Promise<string> {
  if (inputPath) {
    const { existsSync, readFileSync } = await import("node:fs");
    if (!existsSync(inputPath)) throw new Error(`Input file not found: ${inputPath}`);
    return readFileSync(inputPath, "utf8");
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

if (import.meta.main) {
  void main().catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

declare global {
  var talk_speed: number | undefined;
}
