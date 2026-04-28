import { canonicalizeVietnamese, extractTone } from "../normalize.ts";
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
      .filter((note) => note.isPrintable && !note.isCue) // Keep grace notes
      .sort((a, b) => a.startDiv - b.startDiv || a.id.localeCompare(b.id));
    const withoutChordClutter = this.chooseChordRepresentatives(printable);
    const joinedSyllables = this.joinSyllabicLyric(withoutChordClutter);
    const withTies = this.mergeTies(joinedSyllables);
    const withSlurCarry = this.markSlurContinuations(withTies);
    return {
      ...score,
      notes: withSlurCarry,
    };
  }

  private joinSyllabicLyric(notes: ScoreNote[]): ScoreNote[] {
    const out: ScoreNote[] = [];
    let pendingLyric = "";
    let firstNoteInWord: ScoreNote | null = null;

    for (const note of notes) {
      if (note.lyric && (note.syllabic === "begin" || note.syllabic === "middle")) {
        pendingLyric += note.lyric;
        firstNoteInWord = firstNoteInWord ?? note;
        // This note contributes to a word, but we'll emit the full word on the 'end' note
        // or just keep it as is if it's not Vietnamese.
        // Actually, for Vietnamese, joining "ba" + "-" + "o" -> "bao" is good.
        out.push({ ...note, lyric: null });
        continue;
      }

      if (note.lyric && note.syllabic === "end") {
        const fullLyric = pendingLyric + note.lyric;
        out.push({ ...note, lyric: fullLyric });
        pendingLyric = "";
        firstNoteInWord = null;
        continue;
      }

      // Reset if we hit a rest or a single syllable
      if (pendingLyric && (note.isRest || note.syllabic === "single" || !note.lyric)) {
        // If we had a pending word but it didn't end properly, just flush it
        // (This handles poorly formatted XML)
        if (firstNoteInWord && out.length > 0) {
           const idx = out.findIndex(n => n.id === firstNoteInWord?.id);
           if (idx !== -1) out[idx]!.lyric = pendingLyric;
        }
        pendingLyric = "";
        firstNoteInWord = null;
      }

      out.push(note);
    }
    return out;
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
    let carryInfo: { phones: string[]; tone: number } | null = null;

    for (const note of notes) {
      // If note has explicit lyric or is a rest, reset carry info
      if (note.lyric || note.isRest) {
        carryInfo = null;
        out.push(note);
        continue;
      }

      const previous = out[out.length - 1];
      // Be more aggressive: if it's a pitched note without lyric, try to carry
      // This handles melisma (..) and unmarked slurs in MusicXML
      if (previous && !note.lyric && !note.isRest && previous.pitch) {
        carryInfo = carryInfo ?? carryVowelInfo(previous);
        out.push({ 
          ...note, 
          carriedPhones: carryInfo.phones, 
          carriedTone: carryInfo.tone 
        });
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

function carryVowelInfo(note: ScoreNote): { phones: string[]; tone: number } {
  const tone = extractTone(note.lyric ?? "");
  if (!note.lyric) return { phones: ["a"], tone: 0 };
  
  const canonical = canonicalizeVietnamese(note.lyric);
  const chars = Array.from(
    canonical
      .normalize("NFD")
      .replace(/[\u0300\u0301\u0303\u0309\u0323]/g, "")
      .normalize("NFC"),
  );
  const lastVowel = [...chars]
    .reverse()
    .find((char) => "aeiouăâêôơưy".includes(char.toLowerCase()));
  
  let phones = ["a"];
  if (lastVowel) {
    const lv = lastVowel.toLowerCase();
    if ("iíìỉĩịyýỳỷỹỵ".includes(lv)) phones = ["i"];
    else if ("eê".includes(lv)) phones = ["e"];
    else if ("oôơ".includes(lv)) phones = ["o"];
    else if ("uư".includes(lv)) phones = ["u"];
  }
  
  return { phones, tone };
}
