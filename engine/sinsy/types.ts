export type PhoneClass = "v" | "c" | "p";
export type PhoneRole = "pre" | "anchor" | "tail" | "breath";
export type NucleusClass = "none" | "single" | "diphthong" | "triphthong";
export type CodaClass = "none" | "glide" | "nasal" | "stop";
export type RhymeClass = "open" | "glide" | "nasal" | "checked";
export type PhonationClass = "modal" | "creaky" | "glottalized" | "checked";
export type ToneMelodyRelation = "level" | "parallel" | "oblique" | "contrary";

export interface VietnameseSyllableMetadata {
  tone: number;
  vowelSign: number;
  nucleusClass: NucleusClass;
  codaClass: CodaClass;
  rhymeClass: RhymeClass;
  phonation: PhonationClass;
  glottalization: number;
  codaTransition: number;
}

export interface ScorePitch {
  step: string;
  alter: number;
  octave: number;
  midi: number;
  pitchClass: number;
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
  carriedTone: number | null;
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
  tone: number;
  vowelSign: number;
  metadata: VietnameseSyllableMetadata;
  warnings: string[];
}

export interface TimedPhonePlan {
  phone: string;
  role: PhoneRole;
  weight: number;
  vowelSign?: number;
  metadata?: VietnameseSyllableMetadata;
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
  tone: number;
  vowelSign: number;
  metadata: VietnameseSyllableMetadata;
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
  tonalPitchOffset: number;
  toneMelodyRelation: ToneMelodyRelation;
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
