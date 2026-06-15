import { DOMParser } from "@xmldom/xmldom";
import { canonicalizeVietnamese } from "../../vmora/normalize.ts";
import type {
  MusicXmlParser,
  ScoreBeat,
  ScoreDocument,
  ScoreNote,
  ScorePitch,
} from "../lab/types.ts";

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
  expression: string | null;
}

interface ParsedMeasure {
  number: string;
  index: number;
  startDiv: number;
  durationDiv: number;
  notes: ParsedScoreNote[];
  repeatForward: boolean;
  repeatBackward: boolean;
  endingNumbers: Set<number>;
  endingType: string | null;
  segno: string | null;
  coda: string | null;
  fine: boolean;
  dacapo: boolean;
  dalsegno: string | null;
  tocoda: string | null;
}

interface PlaybackMeasure {
  measure: ParsedMeasure;
  pass: number;
}

type ParsedScoreNote = ScoreNote & {
  lyricLines: Map<number, ParsedLyric>;
};

interface ParsedLyric {
  text: string | null;
  syllabic: ScoreNote["syllabic"];
  hasExtend: boolean;
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
      expression: null,
    };
    let cursorDiv = 0;
    let lastNoteStartDiv = 0;
    let noteIndex = 0;
    const measures: ParsedMeasure[] = [];

    for (const measure of directChildren(part, "measure")) {
      const measureNumber = measure.getAttribute("number") ?? String(out.length + 1);
      const measureStartDiv = cursorDiv;
      const notes: ParsedScoreNote[] = [];
      let repeatForward = false;
      let repeatBackward = false;
      let endingNumbers = new Set<number>();
      let endingType: string | null = null;
      let segno: string | null = null;
      let coda: string | null = null;
      let fine = false;
      let dacapo = false;
      let dalsegno: string | null = null;
      let tocoda: string | null = null;

      for (const child of directElementChildren(measure)) {
        switch (tagName(child)) {
          case "attributes":
            this.applyAttributes(child, state);
            break;
          case "sound":
            state.tempo = numberAttr(child, "tempo") ?? state.tempo;
            fine = fine || booleanAttr(child, "fine");
            dacapo = dacapo || booleanAttr(child, "dacapo");
            dalsegno = textAttr(child, "dalsegno") ?? dalsegno;
            tocoda = textAttr(child, "tocoda") ?? tocoda;
            segno = textAttr(child, "segno") ?? segno;
            coda = textAttr(child, "coda") ?? coda;
            break;
          case "direction": {
            state.tempo = directionTempo(child) ?? state.tempo;
            state.dynamic = directionDynamic(child) ?? state.dynamic;
            const expr = directionExpression(child);
            if (expr !== null) {
              if (expr.toLowerCase() === "normal" || expr.toLowerCase() === "reset") {
                state.expression = null;
              } else {
                state.expression = expr;
              }
            }
            const sound = first(child, "sound");
            if (sound) {
              fine = fine || booleanAttr(sound, "fine");
              dacapo = dacapo || booleanAttr(sound, "dacapo");
              dalsegno = textAttr(sound, "dalsegno") ?? dalsegno;
              tocoda = textAttr(sound, "tocoda") ?? tocoda;
              segno = textAttr(sound, "segno") ?? segno;
              coda = textAttr(sound, "coda") ?? coda;
            }
            break;
          }
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
            notes.push(note);
            if (!isChord) {
              lastNoteStartDiv = startDiv;
              cursorDiv += durationDiv;
            }
            break;
          }
          case "barline": {
            const repeat = first(child, "repeat");
            if (repeat?.getAttribute("direction") === "forward") repeatForward = true;
            if (repeat?.getAttribute("direction") === "backward") repeatBackward = true;
            const ending = first(child, "ending");
            const parsedEndingNumbers = parseEndingNumbers(ending?.getAttribute("number"));
            if (parsedEndingNumbers.size > 0) endingNumbers = parsedEndingNumbers;
            endingType = ending?.getAttribute("type") ?? endingType;
            break;
          }
        }
      }

      measures.push({
        number: measureNumber,
        index: measures.length,
        startDiv: measureStartDiv,
        durationDiv: Math.max(0, cursorDiv - measureStartDiv),
        notes,
        repeatForward,
        repeatBackward,
        endingNumbers,
        endingType,
        segno,
        coda,
        fine,
        dacapo,
        dalsegno,
        tocoda,
      });
    }

    out.push(...unrollMeasures(measures));
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
  ): ParsedScoreNote {
    const lyricLines = lyricLinesOf(note);
    const firstLyric = lyricForPass(lyricLines, 1);

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
      lyric: firstLyric.text,
      carriedPhones: null,
      carriedTone: null,
      syllabic: firstLyric.syllabic,
      pitch: pitchOf(first(note, "pitch")),
      tie: tieOf(note),
      slur: slurOf(note),
      hasBreath: first(note, "breath-mark") !== null || firstLyric.hasExtend, // Use extend as a hint for continuation
      dynamic: meta.state.dynamic,
      hasAccent: first(note, "accent") !== null || first(note, "strong-accent") !== null,
      hasStaccato: first(note, "staccato") !== null,
      expression: meta.state.expression,
      lyricLines,
    };
  }
}

function unrollMeasures(measures: ParsedMeasure[]): ScoreNote[] {
  const path = playbackPath(measures);
  const out: ScoreNote[] = [];
  let cursorDiv = 0;

  for (let i = 0; i < path.length; i++) {
    const item = path[i]!;
    for (const note of item.measure.notes) {
      const { lyricLines, ...plainNote } = note;
      const lyric = lyricForPass(lyricLines, item.pass);
      const startDiv = cursorDiv + note.startDiv - item.measure.startDiv;
      const id = item.measure.index === i && item.pass === 1 ? note.id : `${note.id}#${i}`;
      out.push({
        ...plainNote,
        id,
        startDiv,
        endDiv: startDiv + note.durationDiv,
        lyric: lyric.text,
        syllabic: lyric.syllabic,
        hasBreath: note.hasBreath || lyric.hasExtend,
      });
    }
    cursorDiv += item.measure.durationDiv;
  }

  return out;
}

function playbackPath(measures: ParsedMeasure[]): PlaybackMeasure[] {
  const firstPath = repeatPlaybackPath(measures);
  const jump = firstPath.findIndex(({ measure }) => measure.dacapo || measure.dalsegno !== null);
  if (jump === -1) return firstPath;

  const command = firstPath[jump]!.measure;
  const restart = command.dacapo ? 0 : findSegno(measures, command.dalsegno);
  const targetCoda = command.tocoda;
  const secondPath = repeatPlaybackPath(measures.slice(restart)).map(({ measure, pass }) => ({
    measure,
    pass,
  }));
  const fine = secondPath.findIndex(({ measure }) => measure.fine);
  const codaJump = targetCoda
    ? secondPath.findIndex(({ measure }) => measure.tocoda === targetCoda)
    : -1;

  if (codaJump !== -1) {
    const coda = findCoda(measures, targetCoda);
    return [
      ...firstPath.slice(0, jump + 1),
      ...secondPath.slice(0, codaJump + 1),
      ...repeatPlaybackPath(measures.slice(coda)),
    ];
  }

  return [
    ...firstPath.slice(0, jump + 1),
    ...(fine === -1 ? secondPath : secondPath.slice(0, fine + 1)),
  ];
}

function repeatPlaybackPath(measures: ParsedMeasure[]): PlaybackMeasure[] {
  const out: PlaybackMeasure[] = [];
  let pass = 1;
  let repeatStart = 0;
  let i = 0;

  while (i < measures.length) {
    const measure = measures[i]!;
    if (measure.repeatForward && i !== repeatStart) {
      repeatStart = i;
      pass = 1;
    }

    if (shouldPlayEnding(measure, pass)) out.push({ measure, pass });

    if (measure.repeatBackward && pass === 1) {
      pass = 2;
      i = repeatStart;
      continue;
    }

    if (measure.repeatBackward) repeatStart = i + 1;
    i++;
  }

  return out;
}

function shouldPlayEnding(measure: ParsedMeasure, pass: number): boolean {
  return measure.endingNumbers.size === 0 || measure.endingNumbers.has(pass);
}

function findSegno(measures: ParsedMeasure[], name: string | null): number {
  if (!name) return 0;
  const found = measures.findIndex((measure) => measure.segno === name);
  return found === -1 ? 0 : found;
}

function findCoda(measures: ParsedMeasure[], name: string): number {
  const found = measures.findIndex((measure) => measure.coda === name);
  return found === -1 ? measures.length : found;
}

function lyricLinesOf(note: XmlElement): Map<number, ParsedLyric> {
  const lines = new Map<number, ParsedLyric>();
  const lyrics = elements(note, "lyric");

  for (let i = 0; i < lyrics.length; i++) {
    const lyric = lyrics[i]!;
    const number = numberAttr(lyric, "number") ?? i + 1;
    const lyricRaw = textOf(first(lyric, "text"));
    const text = (canonicalizeVietnamese(lyricRaw ?? "") || null)?.replace(/[.,!?;:]/g, "") ?? null;
    lines.set(number, {
      text,
      syllabic: syllabicOf(textOf(first(lyric, "syllabic"))),
      hasExtend: first(lyric, "extend") !== null,
    });
  }

  return lines;
}

function lyricForPass(lines: Map<number, ParsedLyric>, pass: number): ParsedLyric {
  return (
    lines.get(pass) ??
    lines.get(1) ?? {
      text: null,
      syllabic: null,
      hasExtend: false,
    }
  );
}

function parseEndingNumbers(value: string | null | undefined): Set<number> {
  const out = new Set<number>();
  if (!value) return out;
  for (const part of value.split(/[ ,]+/)) {
    const parsed = Number.parseInt(part, 10);
    if (Number.isFinite(parsed)) out.add(parsed);
  }
  return out;
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

function directionExpression(direction: XmlElement): string | null {
  const words = first(direction, "words");
  return words ? textOf(words) : null;
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

function textAttr(el: XmlElement | null, name: string): string | null {
  const value = el?.getAttribute(name)?.trim();
  return value ? value : null;
}

function booleanAttr(el: XmlElement | null, name: string): boolean {
  const value = el?.getAttribute(name)?.toLowerCase();
  return value === "yes" || value === "true" || value === "1";
}

function tagName(el: XmlElement): string {
  return el.localName ?? el.nodeName;
}
