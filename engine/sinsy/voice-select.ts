import type { ScoreDocument, ScoreNormalizer, ScoreNote } from "./types.ts";

export interface VocalLineNormalizerOptions {
  partId?: string;
  voice?: string;
  staff?: string;
  chordPolicy: "lyric" | "highest" | "first";
}

export class VocalLineNormalizer implements ScoreNormalizer {
  private readonly options: VocalLineNormalizerOptions;

  constructor(options: Partial<VocalLineNormalizerOptions> = {}) {
    this.options = {
      chordPolicy: options.chordPolicy ?? "lyric",
      partId: options.partId,
      voice: options.voice,
      staff: options.staff,
    };
  }

  normalize(score: ScoreDocument): ScoreDocument {
    const selected = this.selectVocalVoice(score.notes);
    const printable = selected
      .filter((note) => note.isPrintable && !note.isCue && !note.isGrace)
      .sort((a, b) => a.startDiv - b.startDiv || a.id.localeCompare(b.id));
    const withoutChordClutter = this.chooseChordRepresentatives(printable);
    const withTies = this.mergeTies(withoutChordClutter);
    const withSlurCarry = this.markSlurContinuations(withTies);
    return {
      ...score,
      notes: withSlurCarry,
    };
  }

  private selectVocalVoice(notes: ScoreNote[]): ScoreNote[] {
    const constrained = notes.filter((note) => {
      if (this.options.partId && note.partId !== this.options.partId) return false;
      if (this.options.voice && note.voice !== this.options.voice) return false;
      if (this.options.staff && note.staff !== this.options.staff) return false;
      return true;
    });
    if (this.options.partId || this.options.voice || this.options.staff) return constrained;

    const groups = new Map<string, ScoreNote[]>();
    for (const note of notes) {
      const key = `${note.partId}\u0000${note.voice}\u0000${note.staff}`;
      const group = groups.get(key);
      if (group) group.push(note);
      else groups.set(key, [note]);
    }

    let best: ScoreNote[] = [];
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const group of groups.values()) {
      const lyricCount = group.filter((note) => note.lyric).length;
      const pitchedCount = group.filter((note) => note.pitch && !note.isRest).length;
      const restCount = group.filter((note) => note.isRest).length;
      const score = lyricCount * 1000 + pitchedCount - restCount * 0.01;
      if (score > bestScore) {
        best = group;
        bestScore = score;
      }
    }
    return best;
  }

  private chooseChordRepresentatives(notes: ScoreNote[]): ScoreNote[] {
    const groups = new Map<string, ScoreNote[]>();
    const passthrough: ScoreNote[] = [];
    for (const note of notes) {
      if (note.isRest) {
        passthrough.push(note);
        continue;
      }
      const key = `${note.startDiv}:${note.endDiv}:${note.voice}:${note.staff}`;
      const group = groups.get(key);
      if (group) group.push(note);
      else groups.set(key, [note]);
    }

    const chosen = [...passthrough];
    for (const group of groups.values()) {
      chosen.push(this.chooseChordNote(group));
    }
    return chosen.sort((a, b) => a.startDiv - b.startDiv || a.id.localeCompare(b.id));
  }

  private chooseChordNote(group: ScoreNote[]): ScoreNote {
    if (this.options.chordPolicy === "lyric") {
      const lyricNote = group.find((note) => note.lyric);
      if (lyricNote) return lyricNote;
    }
    if (this.options.chordPolicy === "highest" || this.options.chordPolicy === "lyric") {
      return [...group].sort((a, b) => (b.pitch?.midi ?? -1) - (a.pitch?.midi ?? -1))[0]!;
    }
    return group[0]!;
  }

  private mergeTies(notes: ScoreNote[]): ScoreNote[] {
    const out: ScoreNote[] = [];
    for (const note of notes) {
      const previous = out[out.length - 1];
      if (previous && shouldMergeTie(previous, note)) {
        out[out.length - 1] = {
          ...previous,
          endDiv: note.endDiv,
          durationDiv: previous.durationDiv + note.durationDiv,
          tie: note.tie === "start" || note.tie === "continue" ? "continue" : null,
          hasBreath: previous.hasBreath || note.hasBreath,
        };
        continue;
      }
      out.push(note);
    }
    return out;
  }

  private markSlurContinuations(notes: ScoreNote[]): ScoreNote[] {
    const out: ScoreNote[] = [];
    let carryPhones: string[] | null = null;

    for (const note of notes) {
      if (note.lyric || note.isRest) {
        carryPhones = null;
        out.push(note);
        continue;
      }

      const previous = out[out.length - 1];
      if (
        previous &&
        !note.lyric &&
        !note.isRest &&
        (previous.slur === "start" || note.slur === "stop" || previous.tie === "start")
      ) {
        carryPhones = carryPhones ?? carryVowelPhones(previous);
        out.push({ ...note, carriedPhones: carryPhones });
        continue;
      }

      out.push(note);
    }

    return out;
  }
}

function shouldMergeTie(previous: ScoreNote, note: ScoreNote): boolean {
  if (!previous.pitch || !note.pitch) return false;
  if (previous.pitch.midi !== note.pitch.midi) return false;
  if (previous.tie !== "start" && previous.tie !== "continue") return false;
  if (note.tie !== "stop" && note.tie !== "continue") return false;
  if (note.lyric && note.lyric !== previous.lyric) return false;
  return true;
}

function carryVowelPhones(note: ScoreNote): string[] {
  if (!note.lyric) return ["a"];
  const chars = Array.from(
    note.lyric
      .normalize("NFD")
      .replace(/[\u0300\u0301\u0303\u0309\u0323]/g, "")
      .normalize("NFC"),
  );
  const lastVowel = [...chars]
    .reverse()
    .find((char) => "aeiouăâêôơưy".includes(char.toLowerCase()));
  if (!lastVowel) return ["a"];
  if ("iíìỉĩịyýỳỷỹỵ".includes(lastVowel)) return ["i"];
  if ("eê".includes(lastVowel)) return ["e"];
  if ("oôơ".includes(lastVowel)) return ["o"];
  if ("uư".includes(lastVowel)) return ["u"];
  return ["a"];
}
