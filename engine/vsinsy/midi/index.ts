import type { ScoreDocument, ScoreNote, ScorePitch } from "../lab/types.ts";

export interface MidiParseOptions {
  sourceName?: string;
  lyrics: string[];
  defaultTempo?: number;
}

interface MidiNoteEvent {
  track: number;
  channel: number;
  pitch: number;
  velocity: number;
  startTick: number;
  endTick: number;
}

interface TempoEvent {
  tick: number;
  tempo: number;
}

interface TrackParseResult {
  notes: MidiNoteEvent[];
  tempos: TempoEvent[];
}

interface ActiveMidiNote {
  startTick: number;
  velocity: number;
}

const SINSY_PITCH_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export function parseMidiToScore(data: Uint8Array, options: MidiParseOptions): ScoreDocument {
  const reader = new MidiReader(data);
  reader.expectAscii("MThd");
  const headerLength = reader.readUint32();
  const headerEnd = reader.offset + headerLength;
  const format = reader.readUint16();
  const trackCount = reader.readUint16();
  const division = reader.readUint16();
  reader.offset = headerEnd;

  if (format !== 0 && format !== 1) throw new Error(`Unsupported MIDI format: ${format}`);
  if ((division & 0x8000) !== 0) throw new Error("SMPTE MIDI time division is not supported");

  const divisions = division;
  const allNotes: MidiNoteEvent[] = [];
  const tempos: TempoEvent[] = [{ tick: 0, tempo: options.defaultTempo ?? 120 }];

  for (let track = 0; track < trackCount; track++) {
    reader.expectAscii("MTrk");
    const trackLength = reader.readUint32();
    const trackData = data.subarray(reader.offset, reader.offset + trackLength);
    reader.offset += trackLength;
    const parsed = parseTrack(trackData, track);
    allNotes.push(...parsed.notes);
    tempos.push(...parsed.tempos);
  }

  allNotes.sort((a, b) => a.startTick - b.startTick || a.track - b.track || a.pitch - b.pitch);
  tempos.sort((a, b) => a.tick - b.tick);
  if (options.lyrics.length < allNotes.length) {
    throw new Error(`MIDI input needs one lyric per note (${allNotes.length} notes found)`);
  }

  const notes = allNotes.map((note, index) =>
    midiNoteToScoreNote(note, index, divisions, tempos, options),
  );
  return {
    sourceName: options.sourceName ?? "score.mid",
    divisions,
    notes,
  };
}

function parseTrack(data: Uint8Array, track: number): TrackParseResult {
  const reader = new MidiReader(data);
  const notes: MidiNoteEvent[] = [];
  const tempos: TempoEvent[] = [];
  const active = new Map<string, ActiveMidiNote[]>();
  let tick = 0;
  let runningStatus: number | null = null;

  while (!reader.done) {
    tick += reader.readVariableLengthQuantity();
    let status = reader.readUint8();
    if (status < 0x80) {
      if (runningStatus === null) throw new Error("MIDI running status without previous status");
      reader.offset--;
      status = runningStatus;
    } else if (status < 0xf0) {
      runningStatus = status;
    }

    if (status === 0xff) {
      const type = reader.readUint8();
      const length = reader.readVariableLengthQuantity();
      if (type === 0x2f) break;
      if (type === 0x51 && length === 3) {
        const microsPerQuarter =
          (reader.readUint8() << 16) | (reader.readUint8() << 8) | reader.readUint8();
        tempos.push({ tick, tempo: 60_000_000 / microsPerQuarter });
      } else {
        reader.skip(length);
      }
      runningStatus = null;
      continue;
    }

    if (status === 0xf0 || status === 0xf7) {
      reader.skip(reader.readVariableLengthQuantity());
      runningStatus = null;
      continue;
    }

    const kind = status & 0xf0;
    const channel = status & 0x0f;
    const first = reader.readUint8();
    const second = eventDataLength(kind) === 2 ? reader.readUint8() : 0;

    if (kind === 0x90 && second > 0) {
      pushActive(active, channel, first, { startTick: tick, velocity: second });
    } else if (kind === 0x80 || kind === 0x90) {
      const started = popActive(active, channel, first);
      if (started && tick > started.startTick) {
        notes.push({
          track,
          channel,
          pitch: first,
          velocity: started.velocity,
          startTick: started.startTick,
          endTick: tick,
        });
      }
    }
  }

  return { notes, tempos };
}

function eventDataLength(kind: number): 1 | 2 {
  return kind === 0xc0 || kind === 0xd0 ? 1 : 2;
}

function pushActive(
  active: Map<string, ActiveMidiNote[]>,
  channel: number,
  pitch: number,
  note: ActiveMidiNote,
): void {
  const key = `${channel}:${pitch}`;
  const notes = active.get(key);
  if (notes) {
    notes.push(note);
  } else {
    active.set(key, [note]);
  }
}

function popActive(
  active: Map<string, ActiveMidiNote[]>,
  channel: number,
  pitch: number,
): ActiveMidiNote | null {
  const key = `${channel}:${pitch}`;
  const notes = active.get(key);
  if (!notes || notes.length === 0) return null;
  const note = notes.shift() ?? null;
  if (notes.length === 0) active.delete(key);
  return note;
}

function midiNoteToScoreNote(
  note: MidiNoteEvent,
  index: number,
  divisions: number,
  tempos: TempoEvent[],
  options: MidiParseOptions,
): ScoreNote {
  return {
    id: `midi:${note.track}:${note.channel}:${index}`,
    partId: `T${note.track + 1}`,
    measureNumber: String(Math.floor(note.startTick / (divisions * 4)) + 1),
    voice: String(note.channel + 1),
    staff: "1",
    startDiv: note.startTick,
    endDiv: note.endTick,
    durationDiv: note.endTick - note.startTick,
    divisions,
    tempo: tempoAt(tempos, note.startTick),
    beat: { beats: 4, beatType: 4 },
    isRest: false,
    isChord: false,
    isGrace: false,
    isCue: false,
    isPrintable: true,
    lyric: options.lyrics[index] ?? null,
    carriedPhones: null,
    carriedTone: null,
    syllabic: options.lyrics[index] ? "single" : null,
    pitch: pitchOfMidi(note.pitch),
    tie: null,
    slur: null,
    hasBreath: false,
    dynamic: dynamicForVelocity(note.velocity),
    hasAccent: note.velocity >= 96,
    hasStaccato: false,
    expression: null,
  };
}

function tempoAt(tempos: TempoEvent[], tick: number): number {
  let tempo = tempos[0]?.tempo ?? 120;
  for (const event of tempos) {
    if (event.tick > tick) break;
    tempo = event.tempo;
  }
  return tempo;
}

function pitchOfMidi(midi: number): ScorePitch {
  const pitchClass = positiveModulo(midi, 12);
  const octave = Math.floor(midi / 12) - 1;
  const stepNames = ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"];
  return {
    step: stepNames[pitchClass] ?? "C",
    alter: [1, 3, 6, 8, 10].includes(pitchClass) ? 1 : 0,
    octave,
    midi,
    pitchClass,
    name: `${SINSY_PITCH_NAMES[pitchClass]}${octave}`,
  };
}

function dynamicForVelocity(velocity: number): string {
  if (velocity >= 112) return "ff";
  if (velocity >= 96) return "f";
  if (velocity >= 80) return "mf";
  if (velocity >= 48) return "mp";
  if (velocity >= 32) return "p";
  return "pp";
}

function positiveModulo(value: number, base: number): number {
  return ((value % base) + base) % base;
}

class MidiReader {
  offset = 0;

  constructor(private readonly data: Uint8Array) {}

  get done(): boolean {
    return this.offset >= this.data.length;
  }

  expectAscii(expected: string): void {
    let actual = "";
    for (let i = 0; i < expected.length; i++) actual += String.fromCharCode(this.readUint8());
    if (actual !== expected) throw new Error(`Expected MIDI chunk ${expected}, got ${actual}`);
  }

  readUint8(): number {
    const value = this.data[this.offset];
    if (value === undefined) throw new Error("Unexpected end of MIDI data");
    this.offset++;
    return value;
  }

  readUint16(): number {
    return (this.readUint8() << 8) | this.readUint8();
  }

  readUint32(): number {
    return (
      (this.readUint8() << 24) |
      (this.readUint8() << 16) |
      (this.readUint8() << 8) |
      this.readUint8()
    );
  }

  readVariableLengthQuantity(): number {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      const byte = this.readUint8();
      value = (value << 7) | (byte & 0x7f);
      if ((byte & 0x80) === 0) return value;
    }
    throw new Error("Invalid MIDI variable-length quantity");
  }

  skip(length: number): void {
    this.offset += length;
    if (this.offset > this.data.length) throw new Error("Unexpected end of MIDI data");
  }
}
