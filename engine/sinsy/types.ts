export type PhoneClass = "v" | "c" | "p";
export type PhoneRole = "pre" | "anchor" | "tail" | "breath";

export interface ScorePitch {
  step: string;
  alter: number;
  octave: number;
  midi: number;
  name: string;
}

export interface ScoreBeat {
  beats: number;
  beatType: number;
}

export interface ScoreNote {
  id: string;
  partId: string;
  measureNumber: string;
  voice: string;
  staff: string;
  startDiv: number;
  endDiv: number;
  durationDiv: number;
  divisions: number;
  tempo: number;
  beat: ScoreBeat;
  isRest: boolean;
  isChord: boolean;
  isGrace: boolean;
  isCue: boolean;
  isPrintable: boolean;
  lyric: string | null;
  carriedPhones: string[] | null;
  syllabic: "single" | "begin" | "middle" | "end" | null;
  pitch: ScorePitch | null;
  tie: "start" | "stop" | "continue" | null;
  slur: "start" | "stop" | null;
  hasBreath: boolean;
  dynamic: string;
  hasAccent: boolean;
  hasStaccato: boolean;
}

export interface ScoreDocument {
  sourceName: string;
  divisions: number;
  notes: ScoreNote[];
}

export interface LyricTranspilation {
  source: string;
  phones: string[];
  warnings: string[];
}

export interface TimedPhonePlan {
  phone: string;
  role: PhoneRole;
  weight: number;
}

export interface SyllablePhonePlan extends LyricTranspilation {
  plan: TimedPhonePlan[];
}

export interface PhoneEvent {
  start: number;
  end: number;
  phoneme: string;
  cls: PhoneClass;
  role: PhoneRole;
  note: ScoreNote;
  phoneIndexInNote: number;
  phoneCountInNote: number;
}

export interface ExpressionGauge {
  energy: number;
  vibratoRateHz: number;
  vibratoDepthCents: number;
  vibratoStartRatio: number;
  pitchDeltaFromPrev: number;
  pitchDeltaToNext: number;
}

export interface MusicXmlParser {
  parse(xml: string, sourceName?: string): ScoreDocument;
}

export interface ScoreNormalizer {
  normalize(score: ScoreDocument): ScoreDocument;
}

export interface LyricTranspiler {
  transpile(lyric: string): LyricTranspilation;
}

export interface RoleAwareLyricTranspiler extends LyricTranspiler {
  plan(lyric: string): SyllablePhonePlan;
}

export interface TimingStrategy {
  toPhoneEvents(score: ScoreDocument, lyricTranspiler: LyricTranspiler): PhoneEvent[];
}

export interface LabelEmitter {
  emit(events: PhoneEvent[]): string;
}
