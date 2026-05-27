import type { ScoreDocument, ScoreNote, ScorePitch, PhoneEvent } from "./types.ts";
import { canonicalizeVietnamese } from "../normalize.ts";
import { MonoLabelEmitter, SinsyFullLabelEmitter } from "./emitters.ts";
import type { SinsySerializationResult } from "./index.ts";
import { transcribeSyllableWithError } from "../index.ts";
import { metadataForLyric, DEFAULT_VIETNAMESE_METADATA } from "./vietnamese-metadata.ts";
import { classifyPhone } from "./phoneme.ts";

export interface FlatTtsOptions {
  pitchName?: string;
  pitchMidi?: number;
  tempo?: number;
  divisions?: number;
  syllableDurationDiv?: number;
  shortRestDurationDiv?: number;
  longRestDurationDiv?: number;
}

const SINSY_PITCH_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

function getScorePitch(midi: number): ScorePitch {
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const name = `${SINSY_PITCH_NAMES[pitchClass]}${octave}`;
  const stepNames = ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"];
  const step = stepNames[pitchClass] ?? "C";
  const alter = [1, 3, 6, 8, 10].includes(pitchClass) ? 1 : 0;
  return {
    step,
    alter,
    octave,
    midi,
    pitchClass,
    name,
  };
}

export function isXml(content: string): boolean {
  const trimmed = content.trim();
  return (
    trimmed.startsWith("<?xml") ||
    trimmed.startsWith("<score-partwise") ||
    trimmed.startsWith("<score-timewise")
  );
}

export function parseTextToScore(text: string, options: FlatTtsOptions = {}): ScoreDocument {
  const pitchMidi = options.pitchMidi ?? 60;
  const tempo = options.tempo ?? 120;
  const divisions = options.divisions ?? 4;
  const sylDur = options.syllableDurationDiv ?? 2;
  const shortDur = options.shortRestDurationDiv ?? 2;
  const longDur = options.longRestDurationDiv ?? 4;

  const pitch = getScorePitch(pitchMidi);
  const notes: ScoreNote[] = [];
  let currentDiv = 0;
  let noteIndex = 0;

  const lines = text.split(/\r?\n/);

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]!;
    const tokenRegex =
      /[\u0300-\u036fa-zA-Zàáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệđìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]+|[.,!;?]/gi;
    let match;
    const tokens: string[] = [];
    while ((match = tokenRegex.exec(line)) !== null) {
      tokens.push(match[0]!);
    }

    for (const token of tokens) {
      if ([".", "!", "?"].includes(token)) {
        notes.push(createRestNote(noteIndex++, currentDiv, longDur, divisions, tempo));
        currentDiv += longDur;
      } else if ([",", ";"].includes(token)) {
        notes.push(createRestNote(noteIndex++, currentDiv, shortDur, divisions, tempo));
        currentDiv += shortDur;
      } else {
        const syl = token.toLowerCase();
        notes.push({
          id: `flat-tts:${noteIndex++}`,
          partId: "P1",
          measureNumber: String(Math.floor(currentDiv / (divisions * 4)) + 1),
          voice: "1",
          staff: "1",
          startDiv: currentDiv,
          endDiv: currentDiv + sylDur,
          durationDiv: sylDur,
          divisions,
          tempo,
          beat: { beats: 4, beatType: 4 },
          isRest: false,
          isChord: false,
          isGrace: false,
          isCue: false,
          isPrintable: true,
          lyric: canonicalizeVietnamese(syl),
          carriedPhones: null,
          carriedTone: null,
          syllabic: "single",
          pitch: { ...pitch },
          tie: null,
          slur: null,
          hasBreath: false,
          dynamic: "mf",
          hasAccent: false,
          hasStaccato: false,
        });
        currentDiv += sylDur;
      }
    }

    if (lineIdx < lines.length - 1 && tokens.length > 0) {
      const lastNote = notes[notes.length - 1];
      if (lastNote && !lastNote.isRest) {
        notes.push(createRestNote(noteIndex++, currentDiv, longDur, divisions, tempo));
        currentDiv += longDur;
      }
    }
  }

  return {
    sourceName: "flat-tts.txt",
    divisions,
    notes,
  };
}

function createRestNote(
  index: number,
  startDiv: number,
  durationDiv: number,
  divisions: number,
  tempo: number,
): ScoreNote {
  return {
    id: `flat-tts:${index}`,
    partId: "P1",
    measureNumber: String(Math.floor(startDiv / (divisions * 4)) + 1),
    voice: "1",
    staff: "1",
    startDiv,
    endDiv: startDiv + durationDiv,
    durationDiv,
    divisions,
    tempo,
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
    dynamic: "mf",
    hasAccent: false,
    hasStaccato: false,
  };
}

export function flatTtsToLabel(
  text: string,
  options: FlatTtsOptions = {},
): SinsySerializationResult {
  const score = parseTextToScore(text, options);
  const events: PhoneEvent[] = [];
  let currentSeconds = 0;

  for (const note of score.notes) {
    const start = Math.floor(currentSeconds * 10_000_000);
    const durationSeconds = (note.durationDiv / note.divisions) * (60 / note.tempo);
    const end = Math.floor((currentSeconds + durationSeconds) * 10_000_000);
    currentSeconds += durationSeconds;

    if (note.isRest) {
      events.push({
        start,
        end,
        phoneme: "pau",
        cls: "b",
        role: "breath",
        note,
        tone: 0,
        vowelSign: 0,
        metadata: DEFAULT_VIETNAMESE_METADATA,
        phoneIndexInNote: 0,
        phoneCountInNote: 1,
      });
    } else {
      const lyric = note.lyric ?? "";
      const metadata = metadataForLyric(lyric);
      const transpileResult = transcribeSyllableWithError(lyric, "voicevox");
      const phones = transpileResult.phonemes
        ? transpileResult.phonemes.split(",").filter(Boolean)
        : ["pau"];

      const totalDuration = end - start;
      const consonantDuration = 400_000; // 40ms
      const vowels = phones.filter((p) => ["a", "i", "u", "e", "o"].includes(p));
      const consonants = phones.filter((p) => !["a", "i", "u", "e", "o"].includes(p));

      let finalDurations: number[] = [];
      const minVowelDuration = 500_000; // 50ms
      const neededForConsonants = consonants.length * consonantDuration;
      const neededForVowels = vowels.length * minVowelDuration;

      if (neededForConsonants + neededForVowels > totalDuration) {
        const equalShare = Math.floor(totalDuration / phones.length);
        finalDurations = phones.map(() => equalShare);
      } else {
        const remaining = totalDuration - neededForConsonants;
        const vowelShare = Math.floor(remaining / vowels.length);
        finalDurations = phones.map((p) =>
          ["a", "i", "u", "e", "o"].includes(p) ? vowelShare : consonantDuration,
        );
      }

      const sum = finalDurations.reduce((s, d) => s + d, 0);
      if (finalDurations.length > 0) {
        finalDurations[finalDurations.length - 1] += totalDuration - sum;
      }

      let cursor = start;
      phones.forEach((phone, index) => {
        const pDur = finalDurations[index] ?? 0;
        const cls = classifyPhone(phone);
        const role = ["a", "i", "u", "e", "o"].includes(phone)
          ? ("anchor" as const)
          : ("pre" as const);
        events.push({
          start: cursor,
          end: cursor + pDur,
          phoneme: phone,
          cls,
          role,
          note,
          tone: metadata.tone,
          vowelSign: metadata.vowelSign,
          metadata,
          phoneIndexInNote: index,
          phoneCountInNote: phones.length,
        });
        cursor += pDur;
      });
    }
  }

  const monoEmitter = new MonoLabelEmitter();
  const fullEmitter = new SinsyFullLabelEmitter();
  return {
    mono: monoEmitter.emit(events),
    full: fullEmitter.emit(events),
  };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(
      "Usage: bun run engine/sinsy/flat-tts.ts [input.txt] --full <full.lab> --mono <mono.lab> [--pitch <60>] [--tempo <120>]",
    );
    process.exit(0);
  }

  const fullIdx = argv.indexOf("--full");
  const monoIdx = argv.indexOf("--mono");
  const pitchIdx = argv.indexOf("--pitch");
  const tempoIdx = argv.indexOf("--tempo");

  const fullPath = fullIdx >= 0 ? argv[fullIdx + 1] : undefined;
  const monoPath = monoIdx >= 0 ? argv[monoIdx + 1] : undefined;
  const pitchMidi = pitchIdx >= 0 ? parseInt(argv[pitchIdx + 1] || "60", 10) : 60;
  const tempo = tempoIdx >= 0 ? parseInt(argv[tempoIdx + 1] || "120", 10) : 120;

  const flags = ["--full", "--mono", "--pitch", "--tempo"];
  const inputPath = argv.find((arg, index) => {
    if (flags.includes(arg)) return false;
    if (index > 0 && flags.includes(argv[index - 1]!)) return false;
    return true;
  });

  let text = "";
  if (inputPath) {
    const { readFileSync, existsSync } = await import("node:fs");
    if (!existsSync(inputPath)) {
      console.error(`Input file not found: ${inputPath}`);
      process.exit(1);
    }
    text = readFileSync(inputPath, "utf8");
  } else {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    text = Buffer.concat(chunks).toString("utf8");
  }

  if (!text.trim()) {
    console.error("Input text is empty");
    process.exit(1);
  }

  const result = flatTtsToLabel(text, { pitchMidi, tempo });

  const { writeFileSync, mkdirSync, dirname } = await import("node:fs");
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

if (import.meta.main) {
  void main().catch(console.error);
}
