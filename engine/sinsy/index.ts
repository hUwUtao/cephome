import { DomMusicXmlParser } from "./musicxml.ts";
import { MonoLabelEmitter, SinsyFullLabelEmitter } from "./emitters.ts";
import { VowelAnchoredTimingStrategy } from "./timing.ts";
import { VietnameseMoraPlanTranspiler } from "./mora-plan.ts";
import { VocalLineNormalizer } from "./voice-select.ts";
import type {
  LabelEmitter,
  LyricTranspiler,
  MusicXmlParser,
  ScoreNormalizer,
  TimingStrategy,
} from "./types.ts";

export interface SinsyPipelineOptions {
  parser?: MusicXmlParser;
  normalizer?: ScoreNormalizer;
  lyricTranspiler?: LyricTranspiler;
  timing?: TimingStrategy;
  monoEmitter?: LabelEmitter;
  fullEmitter?: LabelEmitter;
}

export interface SinsySerializationResult {
  mono: string;
  full: string;
}

export interface SinsySerializationTrace extends SinsySerializationResult {
  score: ReturnType<ScoreNormalizer["normalize"]>;
  events: ReturnType<TimingStrategy["toPhoneEvents"]>;
}

export class SinsyLabelPipeline {
  private readonly parser: MusicXmlParser;
  private readonly normalizer: ScoreNormalizer;
  private readonly lyricTranspiler: LyricTranspiler;
  private readonly timing: TimingStrategy;
  private readonly monoEmitter: LabelEmitter;
  private readonly fullEmitter: LabelEmitter;

  constructor(options: SinsyPipelineOptions = {}) {
    this.parser = options.parser ?? new DomMusicXmlParser();
    this.normalizer = options.normalizer ?? new VocalLineNormalizer();
    this.lyricTranspiler = options.lyricTranspiler ?? new VietnameseMoraPlanTranspiler();
    this.timing = options.timing ?? new VowelAnchoredTimingStrategy();
    this.monoEmitter = options.monoEmitter ?? new MonoLabelEmitter();
    this.fullEmitter = options.fullEmitter ?? new SinsyFullLabelEmitter();
  }

  serialize(xml: string, sourceName?: string): SinsySerializationResult {
    const result = this.serializeTrace(xml, sourceName);
    return {
      mono: result.mono,
      full: result.full,
    };
  }

  serializeTrace(xml: string, sourceName?: string): SinsySerializationTrace {
    const score = this.normalizer.normalize(this.parser.parse(xml, sourceName));
    const events = this.timing.toPhoneEvents(score, this.lyricTranspiler);
    return {
      score,
      events,
      mono: this.monoEmitter.emit(events),
      full: this.fullEmitter.emit(events),
    };
  }
}

export * from "./emitters.ts";
export * from "./expression.ts";
export * from "./musicxml.ts";
export * from "./mora-plan.ts";
export * from "./phoneme.ts";
export * from "./timing.ts";
export * from "./transpiler.ts";
export * from "./voice-select.ts";
export type * from "./types.ts";
