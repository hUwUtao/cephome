import { DOMParser } from "@xmldom/xmldom";
import { canonicalizeVietnamese } from "../normalize.ts";
import type { MusicXmlParser, ScoreBeat, ScoreDocument, ScoreNote, ScorePitch } from "./types.ts";

type XmlElement = {
  getAttribute(name: string): string | null;
  getElementsByTagName(name: string): { length: number; [index: number]: XmlElement };
  childNodes: { length: number; [index: number]: XmlNode };
  textContent: string | null;
  localName?: string;
  nodeName: string;
  nodeType: number;
};

type XmlNode = XmlElement & {
  nodeType: number;
};

const ELEMENT_NODE = 1;
const PITCH_CLASS: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};
const SINSY_PITCH_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

interface ParseState {
  divisions: number;
  tempo: number;
  beat: ScoreBeat;
  dynamic: string;
}

export class DomMusicXmlParser implements MusicXmlParser {
  parse(xml: string, sourceName = "score.musicxml"): ScoreDocument {
    const doc = new DOMParser().parseFromString(xml, "application/xml") as unknown as XmlElement;
    const root = doc;
    const firstDivisions = numberText(first(root, "divisions")) ?? 1;
    const notes: ScoreNote[] = [];
    const parts = elements(root, "part");

    for (const part of parts) {
      this.parsePart(part, firstDivisions, notes);
    }

    notes.sort(
      (a, b) =>
        a.startDiv - b.startDiv || a.partId.localeCompare(b.partId) || a.id.localeCompare(b.id),
    );
    return { sourceName, divisions: firstDivisions, notes };
  }

  private parsePart(part: XmlElement, initialDivisions: number, out: ScoreNote[]): void {
    const partId = part.getAttribute("id") ?? "P1";
    const state: ParseState = {
      divisions: initialDivisions,
      tempo: 120,
      beat: { beats: 4, beatType: 4 },
      dynamic: "mf",
    };
    let cursorDiv = 0;
    let lastNoteStartDiv = 0;
    let noteIndex = 0;

    for (const measure of directChildren(part, "measure")) {
      const measureNumber = measure.getAttribute("number") ?? String(out.length + 1);

      for (const child of directElementChildren(measure)) {
        switch (tagName(child)) {
          case "attributes":
            this.applyAttributes(child, state);
            break;
          case "sound":
            state.tempo = numberAttr(child, "tempo") ?? state.tempo;
            break;
          case "direction":
            state.tempo = directionTempo(child) ?? state.tempo;
            state.dynamic = directionDynamic(child) ?? state.dynamic;
            break;
          case "backup":
            cursorDiv -= durationOf(child);
            break;
          case "forward":
            cursorDiv += durationOf(child);
            break;
          case "note": {
            const isChord = hasDirectChild(child, "chord");
            const durationDiv = durationOf(child);
            const startDiv = isChord ? lastNoteStartDiv : cursorDiv;
            const endDiv = startDiv + durationDiv;
            const note = this.parseNote(child, {
              id: `${partId}:${measureNumber}:${noteIndex++}`,
              partId,
              measureNumber,
              startDiv,
              endDiv,
              durationDiv,
              state,
              isChord,
            });
            out.push(note);
            if (!isChord) {
              lastNoteStartDiv = startDiv;
              cursorDiv += durationDiv;
            }
            break;
          }
        }
      }
    }
  }

  private applyAttributes(attributes: XmlElement, state: ParseState): void {
    state.divisions = numberText(first(attributes, "divisions")) ?? state.divisions;
    const time = first(attributes, "time");
    if (time) {
      state.beat = {
        beats: numberText(first(time, "beats")) ?? state.beat.beats,
        beatType: numberText(first(time, "beat-type")) ?? state.beat.beatType,
      };
    }
  }

  private parseNote(
    note: XmlElement,
    meta: {
      id: string;
      partId: string;
      measureNumber: string;
      startDiv: number;
      endDiv: number;
      durationDiv: number;
      state: ParseState;
      isChord: boolean;
    },
  ): ScoreNote {
    const lyricEl = first(note, "lyric");
    const lyricRaw = textOf(first(lyricEl, "text"));
    const lyricText =
      (canonicalizeVietnamese(lyricRaw ?? "") || null)?.replace(/[.,!?;:]/g, "") ?? null;
    const hasExtend = first(lyricEl, "extend") !== null;

    return {
      id: meta.id,
      partId: meta.partId,
      measureNumber: meta.measureNumber,
      voice: textOf(first(note, "voice")) ?? "1",
      staff: textOf(first(note, "staff")) ?? "1",
      startDiv: meta.startDiv,
      endDiv: meta.endDiv,
      durationDiv: meta.durationDiv,
      divisions: meta.state.divisions,
      tempo: meta.state.tempo,
      beat: { ...meta.state.beat },
      isRest: first(note, "rest") !== null,
      isChord: meta.isChord,
      isGrace: first(note, "grace") !== null,
      isCue: first(note, "cue") !== null || note.getAttribute("size") === "cue",
      isPrintable: note.getAttribute("print-object") !== "no",
      lyric: lyricText,
      carriedPhones: null,
      carriedTone: null,
      syllabic: syllabicOf(textOf(first(lyricEl, "syllabic"))),
      pitch: pitchOf(first(note, "pitch")),
      tie: tieOf(note),
      slur: slurOf(note),
      hasBreath: first(note, "breath-mark") !== null || hasExtend, // Use extend as a hint for continuation
      dynamic: meta.state.dynamic,
      hasAccent: first(note, "accent") !== null || first(note, "strong-accent") !== null,
      hasStaccato: first(note, "staccato") !== null,
    };
  }
}

function pitchOf(pitch: XmlElement | null): ScorePitch | null {
  if (!pitch) return null;
  const step = textOf(first(pitch, "step")) ?? "C";
  const alter = numberText(first(pitch, "alter")) ?? 0;
  const octave = numberText(first(pitch, "octave")) ?? 4;
  const midi = (octave + 1) * 12 + (PITCH_CLASS[step] ?? 0) + alter;
  const pitchClass = positiveModulo(midi, 12);
  const labelOctave = Math.floor(midi / 12) - 1;
  return {
    step,
    alter,
    octave,
    midi,
    pitchClass,
    name: `${SINSY_PITCH_NAMES[pitchClass]}${labelOctave}`,
  };
}

function positiveModulo(value: number, base: number): number {
  return ((value % base) + base) % base;
}

function tieOf(note: XmlElement): ScoreNote["tie"] {
  const ties = elements(note, "tie").map((tie) => tie.getAttribute("type"));
  if (ties.includes("start") && ties.includes("stop")) return "continue";
  if (ties.includes("start")) return "start";
  if (ties.includes("stop")) return "stop";
  return null;
}

function slurOf(note: XmlElement): ScoreNote["slur"] {
  const slurs = elements(note, "slur").map((slur) => slur.getAttribute("type"));
  if (slurs.includes("start")) return "start";
  if (slurs.includes("stop")) return "stop";
  return null;
}

function syllabicOf(value: string | null): ScoreNote["syllabic"] {
  if (value === "single" || value === "begin" || value === "middle" || value === "end")
    return value;
  return null;
}

function directionTempo(direction: XmlElement): number | null {
  const soundTempo = numberAttr(first(direction, "sound"), "tempo");
  if (soundTempo !== null) return soundTempo;
  const perMinute = first(direction, "per-minute");
  return numberText(perMinute);
}

function directionDynamic(direction: XmlElement): string | null {
  const dynamics = first(direction, "dynamics");
  if (!dynamics) return null;
  const child = directElementChildren(dynamics)[0];
  return child ? tagName(child) : null;
}

function durationOf(parent: XmlElement): number {
  return numberText(first(parent, "duration")) ?? 0;
}

function directChildren(parent: XmlElement, name: string): XmlElement[] {
  return directElementChildren(parent).filter((child) => tagName(child) === name);
}

function directElementChildren(parent: XmlElement): XmlElement[] {
  const children: XmlElement[] = [];
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i] as XmlElement;
    if (child.nodeType === ELEMENT_NODE) children.push(child);
  }
  return children;
}

function hasDirectChild(parent: XmlElement, name: string): boolean {
  return directChildren(parent, name).length > 0;
}

function first(parent: XmlElement | null, name: string): XmlElement | null {
  if (!parent) return null;
  const found = parent.getElementsByTagName(name);
  return found.length > 0 ? (found[0] ?? null) : null;
}

function elements(parent: XmlElement, name: string): XmlElement[] {
  const found = parent.getElementsByTagName(name);
  const out: XmlElement[] = [];
  for (let i = 0; i < found.length; i++) {
    const item = found[i];
    if (item) out.push(item);
  }
  return out;
}

function textOf(el: XmlElement | null): string | null {
  const value = el?.textContent?.trim();
  return value ? value : null;
}

function numberText(el: XmlElement | null): number | null {
  const value = textOf(el);
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberAttr(el: XmlElement | null, name: string): number | null {
  const value = el?.getAttribute(name);
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function tagName(el: XmlElement): string {
  return el.localName ?? el.nodeName;
}
